// Web Worker that owns every model. The main thread talks to it through
// src/models/client.js. Slots (context, thesaurus, reader, dictionary, pos, embed)
// may share a model instance; instances are keyed by model id + dtype + device.
import { env, AutoTokenizer, AutoModel, AutoModelForCausalLM, AutoModelForTokenClassification, AutoModelForMaskedLM } from '@huggingface/transformers';
import { fillMask, mlmProbsForText, mlmScoreCandidates } from './mlm.js';
import { chatGenerate } from './chat.js';
import { probsForText, searchContinuations, scoreCandidates, Cancelled } from './lm.js';
import { beamContinuations, beamEntries } from './beam.js';
import { prepareGate } from './gate.js';
import { embedTexts } from './embed.js';

// Self-hosted ONNX Runtime wasm files (copied by scripts/copy-ort.mjs).
env.backends.onnx.wasm.wasmPaths = new URL('ort/', self.location.origin + import.meta.env.BASE_URL).href;
env.allowLocalModels = false;
env.useBrowserCache = true;

/** @type {Map<string, {task: string, tokenizer: any, model: any, modelId: string}>} */
const instances = new Map();
/** slot id → instance key */
const slotToKey = new Map();

const post = (msg) => self.postMessage(msg);
const cancelled = new Set();
const stoppers = new Map();

function instanceFor(slot) {
  const key = slotToKey.get(slot);
  const inst = key && instances.get(key);
  if (!inst) throw new Error(`no model loaded for slot "${slot}"`);
  return inst;
}
function checkCancel(id) {
  if (cancelled.has(id)) { cancelled.delete(id); throw new Cancelled(); }
}

const handlers = {
  async load({ id, slot, modelId, task, device, dtype, pooling }) {
    const key = `${modelId}|${dtype}|${device}`;
    if (!instances.has(key)) {
      const progress_callback = (p) => post({ id, type: 'progress', slot, ...p });
      const tokenizer = await AutoTokenizer.from_pretrained(modelId, { progress_callback });
      const cls = task === 'pos' ? AutoModelForTokenClassification : task === 'fill-mask' ? AutoModelForMaskedLM : task === 'embed' ? AutoModel : AutoModelForCausalLM;
      const model = await cls.from_pretrained(modelId, { device, dtype, progress_callback });
      instances.set(key, { task, tokenizer, model, modelId, device, dtype, pooling });
    }
    slotToKey.set(slot, key);
    return { slot, modelId, device, dtype };
  },

  // --- probabilities model (causal or masked) -----------------------------
  async probs({ id, slot = 'context', ...args }) {
    const inst = instanceFor(slot);
    const fn = inst.task === 'fill-mask' ? mlmProbsForText : probsForText;
    return fn(inst, { ...args, checkCancel: () => checkCancel(id) });
  },

  async search({ id, slot = 'context', mode = 'fast', ...args }) {
    const inst = instanceFor(slot);
    const fn = inst.task === 'fill-mask' ? fillMask : mode === 'beam' ? beamContinuations : searchContinuations;
    if (args.gate) await prepareGate(args.gate); // sieve well: the sound rules need the pronunciation dictionary here too
    return fn(inst, {
      ...args,
      checkCancel: () => checkCancel(id),
      onProgress: (p) => post({ id, type: 'partial', data: { progress: p } }),
    });
  },

  async score({ id, slot = 'context', ...args }) {
    const inst = instanceFor(slot);
    const fn = inst.task === 'fill-mask' ? mlmScoreCandidates : scoreCandidates;
    return fn(inst, { ...args, checkCancel: () => checkCancel(id) });
  },

  // --- instruct models ----------------------------------------------------
  /** Beam-search the first entry of a chat reply; see beam.js beamEntries. */
  async beamEntries({ id, slot, ...args }) {
    const inst = instanceFor(slot);
    return beamEntries(inst, {
      ...args,
      checkCancel: () => checkCancel(id),
      onProgress: (p) => post({ id, type: 'partial', data: { progress: p } }),
      onPrompt: (prompt) => post({ id, type: 'partial', data: { prompt } }),
      onText: (text) => post({ id, type: 'partial', data: { text } }),
    });
  },

  async chat({ id, slot, messages, ...opts }) {
    const inst = instanceFor(slot);
    try {
      const { text } = await chatGenerate(inst, {
        messages, ...opts,
        onStopper: (st) => stoppers.set(id, st),
        onPrompt: (prompt) => post({ id, type: 'partial', data: { prompt } }),
        onText: (text) => post({ id, type: 'partial', data: { text } }),
      });
      if (cancelled.has(id)) { cancelled.delete(id); throw new Cancelled(); }
      return { text };
    } finally {
      stoppers.delete(id);
    }
  },

  // --- sentence embeddings ------------------------------------------------
  /** One unit-length vector per text, for the semantic similarity constraint; see embed.js. */
  async embed({ slot = 'embed', texts }) {
    const inst = instanceFor(slot);
    return { vectors: await embedTexts(inst, texts) };
  },

  // --- transformer POS tagger ---------------------------------------------
  async pos({ slot = 'pos', text }) {
    const inst = instanceFor(slot);
    const { tokenizer, model } = inst;
    const enc = tokenizer(text);
    const out = await model(enc);
    const logits = out.logits; // [1, n, labels]
    const [, n, nl] = logits.dims;
    const data = logits.data;
    const ids = Array.from(enc.input_ids.data).map(Number);
    const id2label = model.config.id2label;
    const pieces = [];
    for (let i = 0; i < n; i++) {
      let best = 0;
      for (let j = 1; j < nl; j++) if (data[i * nl + j] > data[i * nl + best]) best = j;
      pieces.push({ piece: tokenizer.decode([ids[i]]), tag: id2label[best] });
    }
    // align word pieces to the original text with a moving cursor
    const words = [];
    const lower = text.toLowerCase();
    let cursor = 0;
    for (const { piece, tag } of pieces) {
      let s = piece.trim();
      if (!s || /^\[.*\]$/.test(s)) continue; // [CLS] [SEP] [PAD]
      const cont = s.startsWith('##');
      if (cont) s = s.slice(2);
      const at = lower.indexOf(s.toLowerCase(), cursor);
      if (at === -1) continue;
      if (cont && words.length && words[words.length - 1].end === at) {
        words[words.length - 1].end = at + s.length;
      } else {
        words.push({ start: at, end: at + s.length, tag });
      }
      cursor = at + s.length;
    }
    return { words: words.map((w) => ({ ...w, text: text.slice(w.start, w.end) })) };
  },

  status() {
    return { slots: [...slotToKey.keys()] };
  },

  cancel({ target }) {
    cancelled.add(target);
    stoppers.get(target)?.interrupt();
    return true;
  },

  async unloadAll() {
    for (const inst of instances.values()) {
      try { await inst.model.dispose?.(); } catch { /* ignore */ }
      inst.masks = null; inst.mlmVocab = null;
    }
    instances.clear();
    slotToKey.clear();
    return true;
  },
};

// Scheduling: one model task runs at a time (ORT sessions are not re-entrant).
// Short tasks (scoring or embedding a handful of candidates, tagging, document probabilities)
// jump ahead of queued generations so the UI stays responsive while a long
// reader or thesaurus request is still producing text.
const IMMEDIATE = new Set(['cancel', 'status']);
const HIGH_PRIORITY = new Set(['score', 'probs', 'pos', 'embed', 'load']);
const waiting = { high: [], normal: [] };
let busy = false;

async function pump() {
  if (busy) return;
  const next = waiting.high.shift() ?? waiting.normal.shift();
  if (!next) return;
  busy = true;
  try { await next(); } finally { busy = false; pump(); }
}

self.onmessage = (e) => {
  const { id, type, ...payload } = e.data;
  const handler = handlers[type];
  if (!handler) {
    post({ id, type: 'error', error: `unknown message type ${type}` });
    return;
  }
  const run = async () => {
    if (cancelled.has(id)) { cancelled.delete(id); post({ id, type: 'error', error: 'cancelled' }); return; }
    try {
      const result = await handler({ id, ...payload });
      post({ id, type: 'result', result });
    } catch (err) {
      if (err?.name !== 'Cancelled') console.error('[worker]', type, err);
      post({ id, type: 'error', error: err?.message ?? String(err) });
    }
  };
  if (IMMEDIATE.has(type)) { run(); return; }
  (HIGH_PRIORITY.has(type) ? waiting.high : waiting.normal).push(run);
  pump();
};

post({ type: 'ready' });
