// Language-model routines used by the worker. Everything here drives a
// Transformers.js causal LM directly through its forward pass so we get
// per-token log-probabilities, which generate() does not expose.
//
// Search strategy ("fast" mode): one pass over the prefix gives the full
// next-token distribution (and the probability of every existing token). The
// top-K first tokens are taken from it, the KV cache is expanded to K rows,
// and each row continues greedily. Rows never swap, so no cache reordering.
// True (diverse) beam search is tracked as an open task (TODO.md §7).
import { Tensor, ones, log_softmax } from '@huggingface/transformers';

const LN_FLOOR = Math.log(1e-12);
const HIST_MIN = -30;
const HIST_BINS = 100;
const HIST_WIDTH = (0 - HIST_MIN) / HIST_BINS;

export class Cancelled extends Error {
  constructor() { super('cancelled'); this.name = 'Cancelled'; }
}

// ---------------------------------------------------------------------------
// tokenisation helpers

/** Encode without special tokens; returns number[] ids. */
export function encode(tokenizer, text) {
  if (!text) return [];
  const enc = tokenizer(text, { add_special_tokens: false, return_tensor: false });
  return enc.input_ids.map(Number);
}

/**
 * Character offsets for each id, computed by cumulative decoding (the JS
 * tokenizer has no offset mapping). Returns [start, end) pairs into `text`.
 */
export function offsetsFor(tokenizer, ids, text) {
  const out = [];
  let prevLen = 0;
  let decodedAll = '';
  for (let i = 0; i < ids.length; i++) {
    decodedAll = tokenizer.decode(ids.slice(0, i + 1), { skip_special_tokens: false, clean_up_tokenization_spaces: false });
    let len = decodedAll.length;
    if (len < prevLen) len = prevLen; // replacement chars can shrink; never go backwards
    out.push([prevLen, len]);
    prevLen = len;
  }
  if (decodedAll !== text) {
    // decoding did not reproduce the text exactly (unicode edge cases): fall back to a
    // proportional alignment so highlights stay roughly in place
    const scale = text.length / Math.max(1, prevLen);
    return out.map(([s, e]) => [Math.round(s * scale), Math.round(e * scale)]);
  }
  return out;
}

function startTokenId(tokenizer, model) {
  return tokenizer.bos_token_id ?? model.config.bos_token_id ?? tokenizer.eos_token_id ?? model.config.eos_token_id ?? null;
}

/** ids for the prefix, windowed to the last `window` tokens and prefixed with BOS when at document start. */
function prefixIds(inst, prefix, window) {
  let ids = encode(inst.tokenizer, prefix);
  let truncated = false;
  if (ids.length > window) { ids = ids.slice(ids.length - window); truncated = true; }
  const start = startTokenId(inst.tokenizer, inst.model);
  if (!truncated && start != null) ids = [start, ...ids];
  return ids;
}

// ---------------------------------------------------------------------------
// per-model masks (built once, cached on the instance)

function ensureMasks(inst) {
  if (inst.masks) return inst.masks;
  const { tokenizer, model } = inst;
  const vocabSize = model.config.vocab_size ?? tokenizer.model?.vocab?.length ?? 50257;
  const startsWithSpace = new Uint8Array(vocabSize);
  const halt = new Uint8Array(vocabSize);
  const vocab = tokenizer.model?.vocab;
  const special = new Set([tokenizer.eos_token_id, tokenizer.bos_token_id, tokenizer.pad_token_id, model.config.eos_token_id].filter((x) => x != null).map(Number));
  for (let i = 0; i < vocabSize; i++) {
    let s;
    if (vocab && vocab[i] != null) {
      s = vocab[i];
      if (s.startsWith('Ġ') || s.startsWith('▁') || s.startsWith(' ')) startsWithSpace[i] = 1;
      if (special.has(i) || s.includes('<|') || s.startsWith('<') && s.endsWith('>') && s.length > 2) halt[i] = 1;
    } else {
      s = tokenizer.decode([i]);
      if (s.startsWith(' ')) startsWithSpace[i] = 1;
      if (special.has(i) || s.includes('<|')) halt[i] = 1;
    }
  }
  inst.masks = { startsWithSpace, halt, vocabSize };
  return inst.masks;
}

// ---------------------------------------------------------------------------
// forward helpers

function needsAllLogits(model, inputs) {
  const session = model.sessions?.model;
  if (session?.inputNames?.includes('num_logits_to_keep')) {
    inputs.num_logits_to_keep = new Tensor('int64', [0n], []);
  }
  return inputs;
}

function disposeOutputs(outputs, keep = null) {
  const keepSet = new Set(keep ? Object.values(keep) : []);
  for (const t of Object.values(outputs)) {
    if (t instanceof Tensor && t.location === 'gpu-buffer' && !keepSet.has(t)) t.dispose();
  }
}

/** Float32Array view of logits row `row` at position `pos` for a [B, T, V] tensor. */
function logitsRow(logits, row, pos) {
  const [, T, V] = logits.dims;
  const data = logits.data;
  const off = (row * T + pos) * V;
  return data.subarray(off, off + V);
}

/** Download (if needed) and repeat every cache tensor K times along the batch dim. */
async function expandCache(cache, K) {
  const entries = {};
  for (const key of Object.keys(cache)) {
    const t = cache[key];
    if (!(t instanceof Tensor)) continue;
    const data = t.location === 'cpu' || t.location === 'cpu-pinned' ? t.data : await t.ort_tensor.getData(true);
    const out = new data.constructor(data.length * K);
    for (let k = 0; k < K; k++) out.set(data, k * data.length);
    entries[key] = new Tensor(t.type, out, [K * t.dims[0], ...t.dims.slice(1)]);
  }
  await cache.dispose?.();
  return new cache.constructor(entries);
}

/** fp16 exports of some models (GPT-2 especially) overflow to NaN; fail loudly instead of returning vocabulary-order garbage. */
function assertFinite(row, inst) {
  for (let i = 0; i < row.length; i += 97) {
    if (!Number.isFinite(row[i])) {
      throw new Error(`${inst.modelId} returned non-finite logits with dtype ${inst.dtype} on ${inst.device}; choose a different precision (fp32 or q8) for this model.`);
    }
  }
}

function makeHistogram() {
  return { counts: new Float64Array(HIST_BINS), binEdges: Array.from({ length: HIST_BINS + 1 }, (_, i) => HIST_MIN + i * HIST_WIDTH) };
}
function histogramAdd(h, logProbs) {
  for (let i = 0; i < logProbs.length; i++) {
    const v = logProbs[i];
    if (v < LN_FLOOR || !Number.isFinite(v)) continue;
    let b = Math.floor((v - HIST_MIN) / HIST_WIDTH);
    if (b >= HIST_BINS) b = HIST_BINS - 1;
    if (b < 0) b = 0;
    h.counts[b]++;
  }
}
function histogramFinish(h) {
  // trim empty low bins, mirroring the old 0.5% quantile clipping
  const total = h.counts.reduce((a, b) => a + b, 0);
  let acc = 0;
  let first = 0;
  for (; first < HIST_BINS; first++) { acc += h.counts[first]; if (acc > total * 0.005) break; }
  return { counts: Array.from(h.counts.slice(first)), binEdges: h.binEdges.slice(first) };
}

function topKIndices(arr, k, allowed) {
  // simple partial selection: k is small (≤ 64) compared to the vocabulary
  const best = [];
  for (let i = 0; i < arr.length; i++) {
    if (allowed && !allowed(i)) continue;
    const v = arr[i];
    if (best.length < k) {
      best.push([v, i]);
      if (best.length === k) best.sort((a, b) => a[0] - b[0]);
    } else if (v > best[0][0]) {
      best[0] = [v, i];
      // re-insert to keep sorted ascending
      let j = 0;
      while (j + 1 < best.length && best[j + 1][0] < v) { best[j] = best[j + 1]; j++; }
      best[j] = [v, i];
    }
  }
  return best.sort((a, b) => b[0] - a[0]);
}

// ---------------------------------------------------------------------------
// public routines

/**
 * Probability of every token of `text` given `prefix` (both strings).
 * Returns tokens [{text,start,end,logProb,prob,alternates:[{text,logProb}]}]
 * with offsets relative to `text`.
 */
export async function probsForText(inst, { prefix, text, window = 384, topK = 5, checkCancel }) {
  const { tokenizer, model } = inst;
  const pIds = prefixIds(inst, prefix, window);
  const tIds = encode(tokenizer, text);
  if (tIds.length === 0) return { tokens: [] };
  let all = [...pIds, ...tIds];
  if (all.length > window + 8) all = all.slice(all.length - (window + 8));
  const pLen = all.length - tIds.length;

  const inputs = needsAllLogits(model, {
    input_ids: new Tensor('int64', all.map(BigInt), [1, all.length]),
    attention_mask: ones([1, all.length]),
  });
  const outputs = await model.forward(inputs);
  checkCancel?.();
  const logits = outputs.logits.to('float32');
  assertFinite(logitsRow(logits, 0, logits.dims[1] - 1), inst);
  const offsets = offsetsFor(tokenizer, tIds, text);
  const tokens = [];
  for (let i = 0; i < tIds.length; i++) {
    const pos = pLen + i - 1;
    if (pos < 0) { tokens.push({ text: text.slice(...offsets[i]), start: offsets[i][0], end: offsets[i][1], logProb: null, prob: null, alternates: [] }); continue; }
    const lp = log_softmax(logitsRow(logits, 0, pos));
    const id = tIds[i];
    const alternates = topKIndices(lp, topK).map(([v, j]) => ({ text: tokenizer.decode([j], { clean_up_tokenization_spaces: false }), logProb: v }));
    tokens.push({ text: text.slice(...offsets[i]), start: offsets[i][0], end: offsets[i][1], logProb: lp[id], prob: Math.exp(lp[id]), alternates });
  }
  disposeOutputs(outputs);
  return { tokens };
}

/**
 * Context search: K continuations of `prefix`, `depth` tokens each.
 * Returns { sequences: [{ tokens: [{text,logProb}], text, logProb }], histogram, firstTokenLogProbs }.
 */
export async function searchContinuations(inst, {
  prefix, k = 24, depth = 8, window = 256, topKFirst = null, checkCancel, onProgress,
}) {
  const { tokenizer, model } = inst;
  const masks = ensureMasks(inst);
  let text = prefix.replace(/ /g, ' ');
  const endsWithSpace = /\s$/.test(text) && !/\n$/.test(text);
  if (endsWithSpace) text = text.replace(/[ \t]+$/, '');
  const ids = prefixIds(inst, text, window);
  const L = ids.length;
  const K = Math.max(1, k);
  const hist = makeHistogram();

  // pass 1: prefix once, batch 1
  let model_inputs = {
    input_ids: new Tensor('int64', ids.map(BigInt), [1, L]),
    attention_mask: ones([1, L]),
  };
  const genCfg = model._prepare_generation_config(null, {});
  model_inputs = model.prepare_inputs_for_generation([ids.map(BigInt)], model_inputs, genCfg);
  let outputs = await model.forward(model_inputs);
  checkCancel?.();
  let logits = outputs.logits.to('float32');
  const lastRow = logitsRow(logits, 0, logits.dims[1] - 1);
  assertFinite(lastRow, inst);
  const lp0 = log_softmax(lastRow);
  histogramAdd(hist, lp0);

  const allowedFirst = (i) => !masks.halt[i] && (!endsWithSpace || masks.startsWithSpace[i]);
  const firsts = topKIndices(lp0, topKFirst ?? K, allowedFirst);
  const rows = firsts.map(([lpv, id]) => ({ ids: [id], logProbs: [lpv], done: false }));
  const R = rows.length;
  onProgress?.({ step: 1, total: depth });

  // advance the cache with the batch-1 pass, then expand it to R rows
  model_inputs = model._update_model_kwargs_for_generation({
    generated_input_ids: [[BigInt(firsts[0][1])]], outputs, model_inputs, is_encoder_decoder: false,
  });
  disposeOutputs(outputs, model_inputs.past_key_values);
  if (depth > 1 && R > 0) {
    model_inputs.past_key_values = await expandCache(model_inputs.past_key_values, R);
    model_inputs.input_ids = new Tensor('int64', rows.map((r) => BigInt(r.ids[0])), [R, 1]);
    model_inputs.attention_mask = ones([R, L + 1]);
    model_inputs.position_ids = null;

    const allIds = rows.map((r) => [...ids, r.ids[0]].map(BigInt));
    for (let step = 1; step < depth; step++) {
      checkCancel?.();
      model_inputs = model.prepare_inputs_for_generation(allIds, model_inputs, genCfg);
      outputs = await model.forward(model_inputs);
      logits = outputs.logits.to('float32');
      const generated = [];
      for (let r = 0; r < R; r++) {
        const lp = log_softmax(logitsRow(logits, r, logits.dims[1] - 1));
        histogramAdd(hist, lp);
        // no_repeat_ngram_size = 2: a bigram already generated in this row may not recur
        const seq = rows[r].ids;
        const prev = seq[seq.length - 1];
        const banned = new Set();
        for (let j = 0; j + 1 < seq.length; j++) if (seq[j] === prev) banned.add(seq[j + 1]);
        const best = topKIndices(lp, 1, (i) => !masks.halt[i] && !banned.has(i))[0];
        const id = best ? best[1] : prev;
        rows[r].ids.push(id);
        rows[r].logProbs.push(best ? best[0] : LN_FLOOR);
        allIds[r].push(BigInt(id));
        generated.push([BigInt(id)]);
      }
      onProgress?.({ step: step + 1, total: depth });
      model_inputs = model._update_model_kwargs_for_generation({ generated_input_ids: generated, outputs, model_inputs, is_encoder_decoder: false });
      disposeOutputs(outputs, model_inputs.past_key_values);
    }
  }
  await model_inputs.past_key_values?.dispose?.();

  const sequences = rows.map((r) => {
    let full = tokenizer.decode(r.ids, { skip_special_tokens: true, clean_up_tokenization_spaces: false });
    const offs = offsetsFor(tokenizer, r.ids, full);
    let tokens = r.ids.map((id, i) => ({ text: full.slice(...offs[i]), logProb: r.logProbs[i] }));
    if (endsWithSpace && tokens.length && tokens[0].text.startsWith(' ')) {
      tokens[0] = { ...tokens[0], text: tokens[0].text.slice(1) };
      full = full.slice(1);
    }
    return { tokens, text: full, logProb: r.logProbs.reduce((a, b) => a + b, 0) };
  });

  return { sequences, histogram: histogramFinish(hist), endsWithSpace };
}

/**
 * Score candidate strings as continuations of `prefix` with the context model.
 * Returns per candidate: { tokens: [{text,start,end,logProb}], logProb, logProbMean } (offsets into the candidate).
 */
export async function scoreCandidates(inst, { prefix, candidates, window = 256, checkCancel }) {
  const { tokenizer, model } = inst;
  const text = prefix.replace(/ /g, ' ');
  const ids = prefixIds(inst, text, window);
  const L = ids.length;
  const results = [];
  if (!candidates.length) return { results };

  // prefix pass once; keep its cache and the log-probs of the next token
  let model_inputs = needsAllLogits(model, { input_ids: new Tensor('int64', ids.map(BigInt), [1, L]), attention_mask: ones([1, L]) });
  const genCfg = model._prepare_generation_config(null, {});
  model_inputs = model.prepare_inputs_for_generation([ids.map(BigInt)], model_inputs, genCfg);
  let outputs = await model.forward(model_inputs);
  const firstLp = log_softmax(logitsRow(outputs.logits.to('float32'), 0, outputs.logits.dims[1] - 1));
  model_inputs = model._update_model_kwargs_for_generation({ generated_input_ids: [[0n]], outputs, model_inputs, is_encoder_decoder: false });
  disposeOutputs(outputs, model_inputs.past_key_values);
  const cache = model_inputs.past_key_values;

  const prefixIdsNoWindow = encode(tokenizer, text);
  for (const cand of candidates) {
    checkCancel?.();
    // tokenise prefix+candidate together so the boundary matches real tokenisation
    const joint = encode(tokenizer, text + cand);
    let cIds;
    if (joint.length > prefixIdsNoWindow.length && prefixIdsNoWindow.every((v, i) => joint[i] === v)) {
      cIds = joint.slice(prefixIdsNoWindow.length);
    } else {
      cIds = encode(tokenizer, cand);
    }
    if (cIds.length === 0) { results.push({ tokens: [], logProb: null, logProbMean: null }); continue; }
    const candText = tokenizer.decode(cIds, { skip_special_tokens: true, clean_up_tokenization_spaces: false });
    const offs = offsetsFor(tokenizer, cIds, candText);
    // align decoded text to the candidate string (they may differ by a leading space)
    const shift = cand.length - candText.length;
    const inputs = needsAllLogits(model, {
      input_ids: new Tensor('int64', cIds.map(BigInt), [1, cIds.length]),
      attention_mask: ones([1, L + cIds.length]),
      past_key_values: cache,
    });
    const out = await model.forward(inputs);
    const lg = out.logits.to('float32');
    const toks = [];
    let sum = 0;
    for (let i = 0; i < cIds.length; i++) {
      const lp = i === 0 ? firstLp[cIds[0]] : log_softmax(logitsRow(lg, 0, i - 1))[cIds[i]];
      sum += lp;
      const s = Math.max(0, offs[i][0] + shift);
      const e = Math.max(s, offs[i][1] + shift);
      toks.push({ text: cand.slice(s, e), start: s, end: e, logProb: lp });
    }
    disposeOutputs(out, cache);
    results.push({ tokens: toks, logProb: sum, logProbMean: sum / cIds.length });
  }
  await cache.dispose?.();
  return { results };
}
