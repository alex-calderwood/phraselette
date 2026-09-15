// Bidirectional (masked) language model routines. A masked model reads the
// text on both sides of a word, so it can:
//   · fill an inlet with words that fit what comes before *and* after  (fillMask)
//   · say how expected each existing word is, by masking it and reading
//     its probability back  (mlmProbsForText, a pseudo-log-likelihood)
//   · score suggested rephrasings the same way  (mlmScoreCandidates)
// Results use the same shapes as the causal routines in lm.js so the rest of
// the app does not care which kind of model is loaded.
import { Tensor, log_softmax } from '@huggingface/transformers';

const WORD = /^(?:[A-Za-z][A-Za-z'’\-]+|[aI])$/;
const HIST_MIN = -30;
const HIST_BINS = 100;
const HIST_WIDTH = (0 - HIST_MIN) / HIST_BINS;
const WINDOW_CHARS = 400; // context kept on each side of a masked word

function vocabStrings(inst) {
  if (inst.mlmVocab) return inst.mlmVocab;
  const { tokenizer } = inst;
  const size = inst.model.config.vocab_size;
  const out = new Array(size);
  for (let i = 0; i < size; i++) {
    out[i] = tokenizer.decode([i], { skip_special_tokens: true, clean_up_tokenization_spaces: false }).trim();
  }
  inst.mlmVocab = out;
  return out;
}

function needsTokenTypes(model) {
  return model.sessions?.model?.inputNames?.includes('token_type_ids');
}

/** Run a batch of equal-length id rows; returns log-softmax rows for the requested (row, position) pairs. */
async function predictBatch(inst, rows, positions) {
  const { model } = inst;
  const B = rows.length;
  const T = rows[0].length;
  const flat = rows.flat().map(BigInt);
  const inputs = {
    input_ids: new Tensor('int64', flat, [B, T]),
    attention_mask: new Tensor('int64', new Array(B * T).fill(1n), [B, T]),
  };
  if (needsTokenTypes(model)) inputs.token_type_ids = new Tensor('int64', new Array(B * T).fill(0n), [B, T]);
  const out = await model(inputs);
  const logits = out.logits.to('float32');
  const V = logits.dims[2];
  return positions.map(([r, p]) => log_softmax(logits.data.subarray((r * T + p) * V, (r * T + p + 1) * V)));
}

function makeHistogram() {
  return { counts: new Float64Array(HIST_BINS), binEdges: Array.from({ length: HIST_BINS + 1 }, (_, i) => HIST_MIN + i * HIST_WIDTH) };
}
function histogramAdd(h, lp) {
  for (let i = 0; i < lp.length; i++) {
    const v = lp[i];
    if (!Number.isFinite(v) || v < HIST_MIN) continue;
    h.counts[Math.min(HIST_BINS - 1, Math.floor((v - HIST_MIN) / HIST_WIDTH))]++;
  }
}
function histogramFinish(h) {
  const total = h.counts.reduce((a, b) => a + b, 0);
  let acc = 0; let first = 0;
  for (; first < HIST_BINS; first++) { acc += h.counts[first]; if (acc > total * 0.005) break; }
  return { counts: Array.from(h.counts.slice(first)), binEdges: h.binEdges.slice(first) };
}

const encodeIds = (tokenizer, text) => Array.from(tokenizer(text).input_ids.data).map(Number);
const encodeNoSpecial = (tokenizer, text) => tokenizer(text, { add_special_tokens: false, return_tensor: false }).input_ids.map(Number);

/** Word spans [{text,start,end}] of `text` (letters/digits runs; apostrophes and hyphens inside words). */
function wordSpans(text) {
  const out = [];
  const re = /[\p{L}\p{N}][\p{L}\p{N}'’\-]*/gu;
  let m;
  while ((m = re.exec(text))) out.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  return out;
}

/**
 * Pseudo-log-likelihood of each word: the word is replaced by as many mask
 * tokens as it has word-pieces, and the pieces' probabilities are read back.
 * `full` is the whole document; only words inside [from, to) are scored.
 * Returns tokens [{text,start,end,logProb,prob,alternates}] with offsets into `full`.
 */
async function scoreWords(inst, full, from, to, { topK = 3, checkCancel, histogram = null } = {}) {
  const { tokenizer } = inst;
  const maskId = tokenizer.mask_token_id;
  const mask = tokenizer.mask_token;
  const vocab = vocabStrings(inst);
  const words = wordSpans(full).filter((w) => w.start >= from && w.end <= to);
  const variants = [];
  for (const w of words) {
    const pieces = encodeNoSpecial(tokenizer, w.text);
    if (pieces.length === 0 || pieces.length > 4) continue;
    const winStart = Math.max(0, w.start - WINDOW_CHARS);
    const winEnd = Math.min(full.length, w.end + WINDOW_CHARS);
    const masked = full.slice(winStart, w.start) + Array(pieces.length).fill(mask).join('') + full.slice(w.end, winEnd);
    const ids = encodeIds(tokenizer, masked);
    const positions = [];
    ids.forEach((id, i) => { if (id === maskId) positions.push(i); });
    if (positions.length !== pieces.length) continue;
    variants.push({ w, pieces, ids, positions });
  }
  // batch variants of equal length
  const byLen = new Map();
  for (const v of variants) { const k = v.ids.length; if (!byLen.has(k)) byLen.set(k, []); byLen.get(k).push(v); }
  const results = new Map();
  for (const group of byLen.values()) {
    for (let i = 0; i < group.length; i += 12) {
      checkCancel?.();
      const chunk = group.slice(i, i + 12);
      const pairs = [];
      chunk.forEach((v, r) => v.positions.forEach((p) => pairs.push([r, p])));
      const lps = await predictBatch(inst, chunk.map((v) => v.ids), pairs);
      let pi = 0;
      for (const v of chunk) {
        let sum = 0;
        let alternates = [];
        for (let j = 0; j < v.pieces.length; j++) {
          const lp = lps[pi++];
          sum += lp[v.pieces[j]];
          if (histogram) histogramAdd(histogram, lp);
          if (j === 0) {
            const best = [];
            for (let t = 0; t < lp.length; t++) {
              if (!WORD.test(vocab[t])) continue;
              if (best.length < topK) { best.push([lp[t], t]); best.sort((a, b) => a[0] - b[0]); }
              else if (lp[t] > best[0][0]) { best[0] = [lp[t], t]; best.sort((a, b) => a[0] - b[0]); }
            }
            alternates = best.reverse().map(([lpv, t]) => ({ text: vocab[t], logProb: lpv }));
          }
        }
        results.set(v.w, { logProb: sum, alternates, pieces: v.pieces.length });
      }
    }
  }
  return words.map((w) => {
    const r = results.get(w);
    return r
      ? { text: w.text, start: w.start, end: w.end, logProb: r.logProb, prob: Math.exp(r.logProb), alternates: r.alternates, pieces: r.pieces }
      : { text: w.text, start: w.start, end: w.end, logProb: null, prob: null, alternates: [] };
  });
}

/** Same contract as lm.js probsForText: probability of each word of `text` given `prefix` (and, here, what follows). */
export async function mlmProbsForText(inst, { prefix = '', text, topK = 3, checkCancel }) {
  const full = prefix + text;
  const tokens = await scoreWords(inst, full, prefix.length, full.length, { topK, checkCancel });
  return { tokens: tokens.map((t) => ({ ...t, start: t.start - prefix.length, end: t.end - prefix.length })) };
}

/** Same contract as lm.js scoreCandidates; `after` lets the model see the text following the inlet. */
export async function mlmScoreCandidates(inst, { prefix, candidates, after = '', checkCancel }) {
  const results = [];
  for (const cand of candidates) {
    checkCancel?.();
    const full = prefix + cand + after;
    const toks = await scoreWords(inst, full, prefix.length, prefix.length + cand.length, { topK: 0, checkCancel });
    const scored = toks.filter((t) => t.logProb != null);
    const sum = scored.reduce((a, t) => a + t.logProb, 0);
    const n = scored.reduce((a, t) => a + (t.pieces ?? 1), 0);
    results.push({
      tokens: toks.map((t) => ({ text: t.text, start: t.start - prefix.length, end: t.end - prefix.length, logProb: t.logProb })),
      logProb: scored.length ? sum : null,
      logProbMean: scored.length ? sum / Math.max(1, n) : null,
    });
  }
  return { results };
}

/**
 * Fill the inlet from both sides. Multi-word inlets are filled left to right,
 * re-running the model after each word so later words condition on earlier ones.
 * Same contract as lm.js searchContinuations: { sequences: [{tokens:[{text,logProb}], text, logProb}], histogram }.
 */
export async function fillMask(inst, { prefix, after = '', leading = ' ', nWords = 1, k = 20, capitalize = false, checkCancel, onProgress }) {
  const { tokenizer } = inst;
  const mask = tokenizer.mask_token;
  const maskId = tokenizer.mask_token_id;
  if (mask == null || maskId == null) throw new Error(`${inst.modelId} has no mask token; it is not a masked language model`);
  const n = Math.max(1, Math.min(6, nWords));
  const vocab = vocabStrings(inst);
  const hist = makeHistogram();

  const head = prefix.slice(-600);
  const tail = after.slice(0, 400);
  const text = head + (leading || (head && !/\s$/.test(head) ? ' ' : '')) + Array(n).fill(mask).join(' ') + tail;
  const ids = encodeIds(tokenizer, text);
  const maskPos = [];
  ids.forEach((id, i) => { if (id === maskId) maskPos.push(i); });
  if (maskPos.length !== n) throw new Error('could not place the mask tokens');

  const banned = new Set([maskId, tokenizer.cls_token_id, tokenizer.sep_token_id, tokenizer.pad_token_id, tokenizer.unk_token_id].filter((x) => x != null));
  const allowed = (id, used) => !banned.has(id) && WORD.test(vocab[id]) && !used.has(vocab[id].toLowerCase());
  const neighbours = new Set();
  const nb = head.match(/([A-Za-z']+)\s*$/)?.[1];
  const na = tail.match(/^\s*([A-Za-z']+)/)?.[1];
  if (nb) neighbours.add(nb.toLowerCase());
  if (na) neighbours.add(na.toLowerCase());

  checkCancel?.();
  const [lp0] = await predictBatch(inst, [ids], [[0, maskPos[0]]]);
  histogramAdd(hist, lp0);
  const firsts = [];
  for (let i = 0; i < lp0.length; i++) if (allowed(i, neighbours)) firsts.push(i);
  firsts.sort((a, b) => lp0[b] - lp0[a]);
  const chosen = firsts.slice(0, k);
  onProgress?.({ step: 1, total: n });

  // rows: one per candidate; fill remaining positions left to right, batched across candidates
  const rows = chosen.map((first) => ({ ids: ids.slice(), words: [{ id: first, logProb: lp0[first] }], used: new Set([...neighbours, vocab[first].toLowerCase()]) }));
  rows.forEach((r) => { r.ids[maskPos[0]] = r.words[0].id; });
  for (let p = 1; p < n; p++) {
    checkCancel?.();
    for (let i = 0; i < rows.length; i += 12) {
      const chunk = rows.slice(i, i + 12);
      const lps = await predictBatch(inst, chunk.map((r) => r.ids), chunk.map((_, r) => [r, maskPos[p]]));
      chunk.forEach((r, ci) => {
        const lp = lps[ci];
        histogramAdd(hist, lp);
        let best = -1;
        for (let t = 0; t < lp.length; t++) if (allowed(t, r.used) && (best === -1 || lp[t] > lp[best])) best = t;
        if (best === -1) return;
        r.ids[maskPos[p]] = best;
        r.used.add(vocab[best].toLowerCase());
        r.words.push({ id: best, logProb: lp[best] });
      });
    }
    onProgress?.({ step: p + 1, total: n });
  }

  const sequences = rows.map((r) => {
    const tokens = r.words.map((w, i) => {
      let s = vocab[w.id];
      if (i === 0 && capitalize) s = s.charAt(0).toUpperCase() + s.slice(1);
      return { text: (i === 0 ? leading : ' ') + s, logProb: w.logProb };
    });
    return { tokens, text: tokens.map((t) => t.text).join(''), logProb: r.words.reduce((a, w) => a + w.logProb, 0) };
  });
  return { sequences, histogram: histogramFinish(hist), bidirectional: true };
}
