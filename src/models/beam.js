// Diverse beam search for the context and thesaurus wells.
//
// Derived from Hugging Face Transformers.js PR #1539 "Add beam search" by
// justsml (https://github.com/huggingface/transformers.js/pull/1539, head
// b0b86bde, against 4.2.0; Apache-2.0). BeamHypotheses and BeamSearchScorer
// are ports of the PR's generation/beam_search.js; reorderCache follows its
// _reorder_cache / index_select_async; the grouped (diverse) step follows the
// loop the PR added to PreTrainedModel.generate(). Differences: the search
// drives model.forward() itself so every token's log-probability is kept, the
// PR's full-vocabulary sorts are replaced with a partial top-k, a hypothesis
// may also end on a stop string (e.g. "</entry>"), and the original build's
// no_repeat_ngram_size=2 rule is applied. Delete this file once upstream
// ships beam search.
import { Tensor, ones, log_softmax } from '@huggingface/transformers';
import {
  encode, prefixIds, offsetsFor, ensureMasks, topKIndices, logitsRow, disposeOutputs, assertFinite, expandCache,
  makeHistogram, histogramAdd, histogramFinish,
} from './lm.js';

const NEG = -1e9;

/** Finished hypotheses for one search (one batch element in the PR). */
export class BeamHypotheses {
  constructor(numBeams, lengthPenalty = 1.0, earlyStopping = false) {
    this.numBeams = numBeams;
    this.lengthPenalty = lengthPenalty;
    this.earlyStopping = earlyStopping;
    /** @type {{score:number, sum:number, ids:number[], lps:number[]}[]} */
    this.beams = [];
    this.worstScore = 1e9;
  }

  get length() { return this.beams.length; }

  /** Add a hypothesis: `sum` is its (penalised) cumulative log-probability, `ids`/`lps` the generated tokens and their raw log-probs. */
  add(sum, ids, lps) {
    const score = sum / (Math.max(1, ids.length) ** this.lengthPenalty);
    if (this.beams.length < this.numBeams || score > this.worstScore) {
      this.beams.push({ score, sum, ids, lps });
      if (this.beams.length > this.numBeams) {
        let worst = 0;
        for (let i = 1; i < this.beams.length; i++) if (this.beams[i].score < this.beams[worst].score) worst = i;
        this.beams.splice(worst, 1);
      }
      this.worstScore = this.beams.length === this.numBeams ? Math.min(...this.beams.map((b) => b.score)) : -1e9;
    }
  }

  /** Can further steps still improve on the finished set? */
  isDone(bestSum, curLen) {
    if (this.beams.length < this.numBeams) return false;
    if (this.earlyStopping === true) return true;
    if (this.earlyStopping === 'never') return false;
    const highestAttainable = bestSum / (Math.max(1, curLen) ** this.lengthPenalty);
    return this.worstScore >= highestAttainable;
  }
}

/** Beam bookkeeping for one group: routes finished candidates to the hypotheses and picks the continuing beams. */
export class BeamSearchScorer {
  constructor(numBeams, { lengthPenalty = 1.0, earlyStopping = false, numReturn = numBeams } = {}) {
    this.numBeams = numBeams;
    this.numReturn = Math.min(numReturn, numBeams);
    this.hyps = new BeamHypotheses(numBeams, lengthPenalty, earlyStopping);
    this.done = false;
  }

  /**
   * @param {{ids:number[], lps:number[], sum:number}[]} beams   the group's live beams (indexed by candidate.src)
   * @param {{score:number, token:number, src:number, lp:number}[]} candidates  2·numBeams candidates, best first
   * @param {(token:number, beam:object)=>boolean} isEos
   */
  process(beams, candidates, isEos) {
    const next = [];
    for (const c of candidates) {
      const src = beams[c.src];
      if (isEos(c.token, src)) {
        this.hyps.add(c.score, [...src.ids, c.token], [...src.lps, c.lp]);
      } else {
        next.push({ ids: [...src.ids, c.token], lps: [...src.lps, c.lp], sum: c.score, src: c.src });
      }
      if (next.length === this.numBeams) break;
    }
    // too many candidates finished: pad with the last live beam (or a dead copy of beam 0)
    while (next.length < this.numBeams) {
      const last = next[next.length - 1];
      next.push(last ? { ...last, ids: [...last.ids], lps: [...last.lps] } : { ids: [...beams[0].ids], lps: [...beams[0].lps], sum: NEG, src: 0 });
    }
    const bestSum = Math.max(...next.map((b) => b.sum));
    this.done = this.hyps.isDone(bestSum, next[0].ids.length);
    return next;
  }

  /** Top hypotheses, filling from the live beams when too few finished. */
  finalize(beams) {
    if (this.hyps.length < this.numBeams) for (const b of beams) if (b.sum > NEG / 2) this.hyps.add(b.sum, b.ids, b.lps);
    return [...this.hyps.beams].sort((a, b) => b.score - a.score).slice(0, this.numReturn);
  }
}

/** Select rows of every cache tensor (downloading GPU tensors first), disposing the originals. */
export async function reorderCache(cache, indices) {
  const entries = {};
  for (const key of Object.keys(cache)) {
    const t = cache[key];
    if (!(t instanceof Tensor)) continue;
    const onCpu = t.location === 'cpu' || t.location === 'cpu-pinned';
    const data = onCpu ? t.data : await t.ort_tensor.getData(true);
    const rowSize = data.length / t.dims[0];
    const out = new data.constructor(indices.length * rowSize);
    for (let i = 0; i < indices.length; i++) out.set(data.subarray(indices[i] * rowSize, (indices[i] + 1) * rowSize), i * rowSize);
    entries[key] = new Tensor(t.type, out, [indices.length, ...t.dims.slice(1)]);
    if (t.location === 'gpu-buffer') t.dispose();
  }
  return new cache.constructor(entries);
}

/**
 * Diverse beam search over token ids. Returns the best `numReturn` hypotheses
 * across all groups plus a histogram of every next-token distribution seen.
 *
 * @param {object} inst  { tokenizer, model, ... }
 * @param {object} o
 * @param {number[]} o.ids  prompt token ids (BOS etc. already included)
 * @param {number} [o.numBeams]        total beams (must be divisible by numBeamGroups)
 * @param {number} [o.numBeamGroups]   groups for diverse beam search (1 = plain beam search)
 * @param {number} [o.diversityPenalty] subtracted per earlier-group use of a token at the same step
 * @param {number} [o.lengthPenalty]   exponent on generated length when ranking finished hypotheses
 * @param {number} [o.maxNewTokens]
 * @param {number} [o.numReturn]
 * @param {number} [o.noRepeatNgramSize]  0 disables; 2 is the original build's setting
 * @param {(id:number)=>boolean} [o.allowedFirst]  extra filter on the first generated token
 * @param {(text:string)=>boolean} [o.stopWhen]  a hypothesis whose decoded text satisfies this is finished
 * @param {Set<number>} [o.eosIds]     token ids that finish a hypothesis
 * @param {boolean} [o.haltOnTagTokens]  also finish on any "<…>"-shaped vocabulary token (lm.js halt mask; right for a bare LM, wrong when the reply itself uses tags)
 * @param {(text:string)=>void} [o.onText]  called after each step with the decoded text of the best live beam
 */
export async function beamSearch(inst, {
  ids, numBeams = 12, numBeamGroups = numBeams, diversityPenalty = 1.0, lengthPenalty = 1.0, earlyStopping = false,
  maxNewTokens = 8, numReturn = numBeams, noRepeatNgramSize = 2, allowedFirst = null, stopWhen = null, eosIds = new Set(), haltOnTagTokens = true,
  checkCancel, onProgress, onText,
}) {
  const { tokenizer, model } = inst;
  const masks = ensureMasks(inst);
  if (numBeams % numBeamGroups !== 0) throw new Error(`numBeams (${numBeams}) must be divisible by numBeamGroups (${numBeamGroups})`);
  const G = numBeamGroups;
  const gs = numBeams / G;
  const B = numBeams;
  const L = ids.length;
  const hist = makeHistogram();
  const scorers = Array.from({ length: G }, () => new BeamSearchScorer(gs, { lengthPenalty, earlyStopping, numReturn: gs }));

  const decodeGen = (genIds) => tokenizer.decode(genIds, { skip_special_tokens: false, clean_up_tokenization_spaces: false });
  const isEos = (token, beam) => {
    if ((haltOnTagTokens && masks.halt[token]) || eosIds.has(token)) return true;
    return stopWhen ? stopWhen(decodeGen([...beam.ids, token])) : false;
  };
  const reportText = () => {
    if (!onText) return;
    const live = beams.filter((b) => b.sum > NEG / 2);
    if (live.length) onText(decodeGen(live.reduce((a, b) => (b.sum > a.sum ? b : a)).ids));
  };
  const bannedFor = (seq) => {
    const banned = new Set();
    if (noRepeatNgramSize === 2 && seq.length) {
      const prev = seq[seq.length - 1];
      for (let j = 0; j + 1 < seq.length; j++) if (seq[j] === prev) banned.add(seq[j + 1]);
    }
    return banned;
  };

  // beams start empty; the first beam of each group is live, the rest are dead (-1e9) as in the PR
  let beams = Array.from({ length: B }, (_, i) => ({ ids: [], lps: [], sum: i % gs === 0 ? 0 : NEG, src: i }));

  /** One grouped beam step. `lpFor(beamIdx)` gives that beam's next-token log-probs. */
  const step = (lpFor, first) => {
    const next = new Array(B);
    const prevGroupTokens = new Map();
    for (let g = 0; g < G; g++) {
      const off = g * gs;
      const group = beams.slice(off, off + gs);
      const candidates = [];
      for (let bi = 0; bi < gs; bi++) {
        const beam = group[bi];
        if (beam.sum <= NEG / 2 && !first) continue; // dead beam: can never win
        const lp = lpFor(off + bi);
        const banned = bannedFor(beam.ids);
        const allowed = (i) => !banned.has(i) && (!first || !allowedFirst || allowedFirst(i));
        // the diversity penalty only lowers tokens earlier groups chose, so the exact
        // penalised top-2gs lies within the raw top-(2gs + |penalised|)
        const top = topKIndices(lp, 2 * gs + prevGroupTokens.size, allowed);
        for (const [v, i] of top) {
          candidates.push({ score: beam.sum + v - diversityPenalty * (prevGroupTokens.get(i) ?? 0), token: i, src: bi, lp: v });
        }
        if (first) break; // every beam shares the prompt distribution on the first step
      }
      candidates.sort((a, b) => b.score - a.score);
      const chosen = scorers[g].process(group, candidates.slice(0, 2 * gs), isEos);
      for (let bi = 0; bi < gs; bi++) {
        next[off + bi] = { ...chosen[bi], src: off + chosen[bi].src };
        const tok = chosen[bi].ids[chosen[bi].ids.length - 1];
        prevGroupTokens.set(tok, (prevGroupTokens.get(tok) ?? 0) + 1);
      }
    }
    beams = next;
  };

  // pass 1: the prompt once, batch 1
  let model_inputs = { input_ids: new Tensor('int64', ids.map(BigInt), [1, L]), attention_mask: ones([1, L]) };
  const genCfg = model._prepare_generation_config(null, {});
  model_inputs = model.prepare_inputs_for_generation([ids.map(BigInt)], model_inputs, genCfg);
  let outputs = await model.forward(model_inputs);
  checkCancel?.();
  let logits = outputs.logits.to('float32');
  const lastRow = logitsRow(logits, 0, logits.dims[1] - 1);
  assertFinite(lastRow, inst);
  const lp0 = log_softmax(lastRow);
  histogramAdd(hist, lp0);
  step(() => lp0, true);
  onProgress?.({ step: 1, total: maxNewTokens });
  reportText();

  model_inputs = model._update_model_kwargs_for_generation({
    generated_input_ids: [[BigInt(beams[0].ids[0])]], outputs, model_inputs, is_encoder_decoder: false,
  });
  disposeOutputs(outputs, model_inputs.past_key_values);

  const allDone = () => scorers.every((s) => s.done);
  if (maxNewTokens > 1 && !allDone()) {
    // every beam shares the prompt cache: expand it, then reorder per step
    model_inputs.past_key_values = await expandCache(model_inputs.past_key_values, B);
    model_inputs.input_ids = new Tensor('int64', beams.map((b) => BigInt(b.ids[0])), [B, 1]);
    model_inputs.attention_mask = ones([B, L + 1]);
    model_inputs.position_ids = null;
    let allIds = beams.map((b) => [...ids, ...b.ids].map(BigInt));

    for (let t = 1; t < maxNewTokens; t++) {
      checkCancel?.();
      model_inputs = model.prepare_inputs_for_generation(allIds, model_inputs, genCfg);
      outputs = await model.forward(model_inputs);
      logits = outputs.logits.to('float32');
      const T = logits.dims[1];
      const lpCache = new Map();
      const lpFor = (r) => {
        if (!lpCache.has(r)) { const lp = log_softmax(logitsRow(logits, r, T - 1)); histogramAdd(hist, lp); lpCache.set(r, lp); }
        return lpCache.get(r);
      };
      step(lpFor, false);
      onProgress?.({ step: t + 1, total: maxNewTokens });
      reportText();

      model_inputs = model._update_model_kwargs_for_generation({
        generated_input_ids: beams.map((b) => [BigInt(b.ids[b.ids.length - 1])]), outputs, model_inputs, is_encoder_decoder: false,
      });
      disposeOutputs(outputs, model_inputs.past_key_values);
      if (allDone()) break;
      const order = beams.map((b) => b.src);
      if (order.some((s, i) => s !== i)) model_inputs.past_key_values = await reorderCache(model_inputs.past_key_values, order);
      allIds = beams.map((b) => [...ids, ...b.ids].map(BigInt));
    }
  }
  await model_inputs.past_key_values?.dispose?.();

  const finished = scorers.flatMap((s, g) => s.finalize(beams.slice(g * gs, (g + 1) * gs)));
  finished.sort((a, b) => b.score - a.score);
  return { hypotheses: finished.slice(0, numReturn), histogram: histogramFinish(hist), firstLogProbs: lp0 };
}

/** Turn a hypothesis into the well's sequence shape, dropping trailing special tokens (`isSpecial(id)`); `cutAt(text)` may return a length to truncate to. */
function hypothesisToSequence(tokenizer, isSpecial, h, cutAt = null) {
  let ids = h.ids;
  let lps = h.lps;
  // drop trailing special tokens (they finished the hypothesis but are not text)
  while (ids.length && isSpecial(ids[ids.length - 1])) { ids = ids.slice(0, -1); lps = lps.slice(0, -1); }
  let full = tokenizer.decode(ids, { skip_special_tokens: true, clean_up_tokenization_spaces: false });
  const offs = offsetsFor(tokenizer, ids, full);
  let tokens = ids.map((id, i) => ({ text: full.slice(...offs[i]), logProb: lps[i] }));
  const cut = cutAt ? Math.min(full.length, cutAt(full)) : full.length;
  if (cut < full.length) {
    full = full.slice(0, cut);
    let pos = 0;
    tokens = tokens.flatMap((tk) => {
      const start = pos; pos += tk.text.length;
      if (start >= cut) return [];
      return [pos > cut ? { ...tk, text: tk.text.slice(0, cut - start) } : tk];
    });
  }
  return { tokens, text: full, logProb: lps.reduce((a, b) => a + b, 0), score: h.score };
}

/**
 * Context well: beam-searched continuations of `prefix`. Same result shape as
 * lm.js searchContinuations so the worker can swap between the two.
 */
export async function beamContinuations(inst, {
  prefix, k = 24, depth = 8, window = 256, numBeamGroups = null, diversityPenalty = 1.0, lengthPenalty = 1.0, noRepeatNgramSize = 2, checkCancel, onProgress,
}) {
  const { tokenizer } = inst;
  const masks = ensureMasks(inst);
  let text = prefix.replace(/ /g, ' ');
  const endsWithSpace = /\s$/.test(text) && !/\n$/.test(text);
  if (endsWithSpace) text = text.replace(/[ \t]+$/, '');
  const ids = prefixIds(inst, text, window);
  const numBeams = Math.max(1, k);
  // default grouping: beams of four per group (diverse beam search), or one group per beam when k is odd
  const groups = numBeamGroups ?? (numBeams % 4 === 0 ? numBeams / 4 : numBeams % 2 === 0 ? numBeams / 2 : numBeams);
  const { hypotheses, histogram } = await beamSearch(inst, {
    ids, numBeams, numBeamGroups: groups, diversityPenalty, lengthPenalty, noRepeatNgramSize, maxNewTokens: depth, numReturn: numBeams,
    allowedFirst: (i) => !endsWithSpace || masks.startsWithSpace[i], checkCancel, onProgress,
  });
  const sequences = hypotheses.map((h) => {
    const seq = hypothesisToSequence(tokenizer, (id) => !!masks.halt[id], h);
    if (endsWithSpace && seq.tokens.length && seq.tokens[0].text.startsWith(' ')) {
      seq.tokens[0] = { ...seq.tokens[0], text: seq.tokens[0].text.slice(1) };
      seq.text = seq.text.slice(1);
    }
    return seq;
  }).filter((s) => s.text.trim());
  return { sequences, histogram, endsWithSpace };
}

/**
 * Thesaurus (and reader revisions): beam-search the reply itself. Each beam
 * writes `entriesPerBeam` entries in a row, seeing the ones it has already
 * written, so a beam does not repeat itself while the groups keep the beams
 * apart. All entries of all beams are collected, best beam first.
 * The chat prompt is rendered exactly as chatGenerate does, ending in the
 * reply prefix. Returns { entries: [{ text, beam, score }], prompt, texts }.
 */
export async function beamEntries(inst, {
  messages, assistantPrefix = '<entry>', numBeams = 4, numBeamGroups = numBeams, entriesPerBeam = 4, diversityPenalty = 1.0, lengthPenalty = 1.0,
  maxNewTokens = 15 * entriesPerBeam, checkCancel, onProgress, onPrompt, onText,
}) {
  const { tokenizer, model } = inst;
  const promptText = tokenizer.apply_chat_template(messages, { add_generation_prompt: true, tokenize: false }) + (assistantPrefix ?? '');
  onPrompt?.(promptText);
  const ids = encode(tokenizer, promptText);
  const eos = model.generation_config?.eos_token_id ?? model.config?.eos_token_id ?? tokenizer.eos_token_id;
  const eosIds = new Set((Array.isArray(eos) ? eos : eos != null ? [eos] : []).map(Number));
  if (tokenizer.pad_token_id != null) eosIds.add(Number(tokenizer.pad_token_id));
  const closes = (text) => (text.match(/<\/entry>/gi) ?? []).length;
  const prefix = assistantPrefix ?? '';
  const { hypotheses } = await beamSearch(inst, {
    ids, numBeams, numBeamGroups, diversityPenalty, lengthPenalty, maxNewTokens, numReturn: numBeams,
    noRepeatNgramSize: 0, stopWhen: (text) => closes(text) >= entriesPerBeam || /\n\s*\n/.test(text), eosIds, haltOnTagTokens: false, checkCancel, onProgress,
    onText: onText ? (text) => onText(prefix + text) : undefined,
  });
  const seen = new Set();
  const entries = [];
  const texts = [];
  hypotheses.forEach((h, beam) => {
    const seq = hypothesisToSequence(tokenizer, (id) => eosIds.has(id), h);
    const text = prefix + seq.text;
    texts.push(text);
    for (const m of text.matchAll(/<entry>([^<\n]*?)<\/entry>/gi)) {
      const e = m[1].trim();
      const key = e.toLowerCase();
      if (!e || seen.has(key)) continue;
      seen.add(key);
      entries.push({ text: e, beam, score: seq.score });
    }
  });
  return { entries, prompt: promptText, texts };
}
