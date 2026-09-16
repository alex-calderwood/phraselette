// The models Phraselette can run in the browser, grouped by the task each
// landing-page slot performs. Every entry is an ONNX export on the Hugging Face
// Hub that Transformers.js can load; the app never calls a hosted API.

/**
 * Rough benchmark scores, one benchmark per model family so the numbers are
 * comparable within a dropdown. Generative models: HellaSwag (sentence
 * completion, % correct; 10-shot unless noted), which is closest to what the
 * wells ask of them. Masked models: MNLI accuracy after fine-tuning (from the
 * GLUE tables on each model card). Instruct variants whose cards omit
 * HellaSwag inherit the base model's number. Looked up September 2026.
 */
const hellaswag = (score, note = '10-shot, as reported for the base model') => ({ name: 'HellaSwag', score, note, about: 'HellaSwag: given the start of an everyday scene, pick the sentence that plausibly comes next (% correct; chance is 25).' });
const mnli = (score) => ({ name: 'MNLI', score, note: 'GLUE MNLI accuracy after fine-tuning, from the model card', about: 'MNLI: decide whether one sentence follows from, contradicts, or is unrelated to another (% correct; chance is 33).' });

/** One-paragraph explanation of the benchmark column, for the landing page. */
export const BENCHMARK_NOTE =
  'The benchmark score is a rough guide to general language ability, higher is better. Left-to-right and instruct models are scored on HellaSwag (pick the plausible next sentence, % correct, chance 25); bidirectional models on MNLI (does one sentence follow from another, % correct, chance 33). Hover a score for its source.';

/** dtype to request per device. fp16 needs a WebGPU adapter with shader-f16. */
const small = { webgpu: 'fp16', webgpuNoF16: 'fp32', wasm: 'q8' };
const medium = { webgpu: 'q4f16', webgpuNoF16: 'q4', wasm: 'q8' };

export const CAUSAL_MODELS = [
  {
    id: 'Xenova/gpt2',
    name: 'GPT-2 · 124M',
    note: 'The model used in the paper. Fast, literal, endearingly odd. (fp16 overflows for GPT-2, so fp32 is used on WebGPU.)',
    bench: hellaswag(31.1, 'lm-evaluation-harness acc_norm, 0-shot'),
    params: 124e6,
    dtype: { webgpu: 'fp32', webgpuNoF16: 'fp32', wasm: 'int8' },
    size: { fp16: 250, fp32: 500, int8: 281 },
    chat: false,
    task: 'causal',
    group: 'Left-to-right (reads only what comes before)',
  },
  {
    id: 'Xenova/gpt-neo-125M',
    name: 'GPT-Neo · 125M',
    note: 'Trained on the Pile; a slightly different sense of the likely.',
    bench: hellaswag(30.3, '10-shot, Open LLM Leaderboard'),
    params: 125e6,
    dtype: small,
    size: { fp16: 250, fp32: 500, q8: 130 },
    chat: false,
    task: 'causal',
    group: 'Left-to-right (reads only what comes before)',
  },
  {
    id: 'onnx-community/gemma-3-270m-ONNX',
    name: 'Gemma 3 · 270M (base)',
    note: 'Newer base model, broad vocabulary.',
    bench: hellaswag(40.9, '10-shot, Gemma 3 model card'),
    params: 270e6,
    dtype: small,
    size: { fp16: 540, fp32: 1080, q8: 300 },
    chat: false,
    task: 'causal',
    group: 'Left-to-right (reads only what comes before)',
  },
  {
    id: 'onnx-community/Qwen3-0.6B-ONNX',
    name: 'Qwen3 · 0.6B (base)',
    note: 'Strongest sense of context here; slower.',
    bench: hellaswag(58.1, 'not on the Qwen card; third-party eval (arXiv 2601.22699)'),
    params: 600e6,
    dtype: medium,
    size: { q4f16: 470, q4: 700, q8: 640 },
    chat: false,
    task: 'causal',
    group: 'Left-to-right (reads only what comes before)',
  },
];

export const INSTRUCT_MODELS = [
  {
    id: 'HuggingFaceTB/SmolLM2-135M-Instruct',
    name: 'SmolLM2 · 135M',
    note: 'Tiny and quick; follows instructions loosely.',
    bench: hellaswag(40.9, '0-shot, instruct model, SmolLM2 card'),
    params: 135e6,
    dtype: small,
    size: { fp16: 270, fp32: 540, q8: 140 },
    chat: true,
    task: 'instruct',
    group: 'Instruct (role-prompted)',
  },
  {
    id: 'HuggingFaceTB/SmolLM2-360M-Instruct',
    name: 'SmolLM2 · 360M',
    note: 'Good balance for a laptop.',
    bench: hellaswag(52.1, '0-shot, instruct model, SmolLM2 card'),
    params: 360e6,
    dtype: medium,
    size: { q4f16: 280, q4: 400, q8: 370 },
    chat: true,
    task: 'instruct',
    group: 'Instruct (role-prompted)',
  },
  {
    id: 'onnx-community/gemma-3-270m-it-ONNX',
    name: 'Gemma 3 · 270M',
    note: 'Small, chatty, decent at lists of words.',
    bench: hellaswag(40.9, '10-shot, base Gemma 3 270M; the IT card gives no HellaSwag'),
    params: 270e6,
    dtype: small,
    size: { fp16: 540, fp32: 1080, q8: 300 },
    chat: true,
    task: 'instruct',
    group: 'Instruct (role-prompted)',
  },
  {
    id: 'onnx-community/Qwen2.5-0.5B-Instruct',
    name: 'Qwen2.5 · 0.5B',
    note: 'Recommended default: follows the entry format well.',
    bench: hellaswag(52.1, '10-shot, base Qwen2.5-0.5B (Qwen blog); SmolLM2 card measures the instruct model at 48.0 0-shot'),
    params: 494e6,
    dtype: medium,
    size: { q4f16: 400, q4: 560, q8: 500 },
    chat: true,
    task: 'instruct',
    group: 'Instruct (role-prompted)',
    recommended: true,
  },
  {
    id: 'onnx-community/gemma-3-1b-it-ONNX',
    name: 'Gemma 3 · 1B',
    note: 'Richer diction; needs a real GPU.',
    bench: hellaswag(62.3, '10-shot, base Gemma 3 1B; the IT card gives no HellaSwag'),
    params: 1e9,
    dtype: medium,
    size: { q4f16: 1000, q4: 1500, q8: 1100 },
    chat: true,
    task: 'instruct',
    group: 'Instruct (role-prompted)',
  },
  {
    id: 'onnx-community/Llama-3.2-1B-Instruct-ONNX',
    name: 'Llama 3.2 · 1B',
    note: 'Fluent; heavy download.',
    bench: hellaswag(41.2, '0-shot, instruct model, Llama 3.2 model card'),
    params: 1.24e9,
    dtype: medium,
    size: { q4f16: 1100, q4: 1700, q8: 1300 },
    chat: true,
    task: 'instruct',
    group: 'Instruct (role-prompted)',
  },
  {
    id: 'onnx-community/Qwen2.5-1.5B-Instruct',
    name: 'Qwen2.5 · 1.5B',
    note: 'The most capable option; WebGPU strongly advised.',
    bench: hellaswag(67.9, '10-shot, base Qwen2.5-1.5B (Qwen blog)'),
    params: 1.54e9,
    dtype: medium,
    size: { q4f16: 1200, q4: 1900, q8: 1600 },
    chat: true,
    task: 'instruct',
    group: 'Instruct (role-prompted)',
  },
];

/** Bidirectional (masked) language models: fill the inlet from both sides. */
const maskedDtype = { webgpu: 'fp32', webgpuNoF16: 'fp32', wasm: 'q8' };
export const MASKED_MODELS = [
  { id: 'Xenova/distilbert-base-cased', bench: mnli(81.5), name: 'DistilBERT · 66M', note: 'Fast, keeps capitalization. Good first choice.', params: 66e6, dtype: maskedDtype, size: { fp32: 260, q8: 66 }, task: 'fill-mask', group: 'Bidirectional (reads both sides of a word)', recommended: true },
  { id: 'Xenova/albert-base-v2', bench: mnli(84.6), name: 'ALBERT · 12M', note: 'Tiny download; lower-case only.', params: 12e6, dtype: maskedDtype, size: { fp32: 47, q8: 12 }, task: 'fill-mask', group: 'Bidirectional (reads both sides of a word)' },
  { id: 'Xenova/distilroberta-base', bench: mnli(84.0), name: 'DistilRoBERTa · 82M', note: 'Web-trained vocabulary, cased.', params: 82e6, dtype: maskedDtype, size: { fp32: 330, q8: 83 }, task: 'fill-mask', group: 'Bidirectional (reads both sides of a word)' },
  { id: 'Xenova/bert-base-cased', bench: mnli(84.6), name: 'BERT base · 110M', note: 'The classic; a little slower.', params: 110e6, dtype: maskedDtype, size: { fp32: 430, q8: 110 }, task: 'fill-mask', group: 'Bidirectional (reads both sides of a word)' },
  { id: 'Xenova/roberta-base', bench: mnli(87.6), name: 'RoBERTa base · 125M', note: 'Strongest of the small masked models.', params: 125e6, dtype: maskedDtype, size: { fp32: 500, q8: 125 }, task: 'fill-mask', group: 'Bidirectional (reads both sides of a word)' },
];

/**
 * Sentence-embedding models for the semantic similarity constraint. Benchmark:
 * MTEB English average (semantic similarity, retrieval, clustering and so on),
 * from the MTEB leaderboard and the model cards, looked up September 2026.
 * `pooling` is how the encoder's token states become one vector (embed.js).
 */
const mteb = (score) => ({ name: 'MTEB', score, note: 'MTEB English average, from the leaderboard or the model card', about: 'MTEB: a suite of embedding tasks (semantic similarity, retrieval, clustering); average score, higher is better.' });
const embedDtype = { webgpu: 'fp32', webgpuNoF16: 'fp32', wasm: 'q8' };
export const EMBEDDING_MODELS = [
  { id: 'none', name: 'None', note: 'Nothing to download; the semantic similarity constraint will be unavailable.', size: { none: 0 }, bundled: true },
  { id: 'Xenova/all-MiniLM-L6-v2', name: 'MiniLM-L6 · 23M', note: 'Tiny and quick; the usual first choice.', bench: mteb(56.3), params: 23e6, dtype: embedDtype, size: { fp32: 90, q8: 23 }, task: 'embed', pooling: 'mean', group: 'Sentence embeddings', recommended: true },
  { id: 'Xenova/bge-small-en-v1.5', name: 'BGE small · 33M', note: 'Sharper sense of meaning for its size.', bench: mteb(62.2), params: 33e6, dtype: embedDtype, size: { fp32: 133, q8: 34 }, task: 'embed', pooling: 'cls', group: 'Sentence embeddings' },
  { id: 'Xenova/gte-small', name: 'GTE small · 33M', note: 'Comparable to BGE small.', bench: mteb(61.4), params: 33e6, dtype: embedDtype, size: { fp32: 133, q8: 34 }, task: 'embed', pooling: 'mean', group: 'Sentence embeddings' },
  { id: 'Xenova/all-mpnet-base-v2', name: 'MPNet base · 110M', note: 'The classic sentence-transformers model; slower.', bench: mteb(57.8), params: 110e6, dtype: embedDtype, size: { fp32: 438, q8: 110 }, task: 'embed', pooling: 'mean', group: 'Sentence embeddings' },
  { id: 'Xenova/bge-base-en-v1.5', name: 'BGE base · 110M', note: 'Strongest here; heavier download.', bench: mteb(63.6), params: 110e6, dtype: embedDtype, size: { fp32: 436, q8: 110 }, task: 'embed', pooling: 'cls', group: 'Sentence embeddings' },
];

export const POS_MODELS = [
  {
    id: 'wink',
    name: 'wink-nlp (bundled)',
    note: 'Instant, runs while you type. Universal POS tags.',
    size: { none: 0 },
    bundled: true,
  },
  {
    id: 'onnx-community/mobilebert-finetuned-pos-ONNX',
    name: 'MobileBERT POS tagger',
    note: 'A small transformer tagger (Penn Treebank tags, mapped).',
    params: 25e6,
    dtype: { webgpu: 'fp32', webgpuNoF16: 'fp32', wasm: 'q8' },
    size: { fp32: 100, q8: 25 },
  },
];

/**
 * Landing-page cards. Each card picks one model that serves one or more
 * worker "slots" (the tasks the workspace asks for by name).
 */
export const CARDS = [
  {
    id: 'probabilities',
    title: 'Probabilities',
    emoji: '∿',
    kind: 'causal',
    models: [...MASKED_MODELS, ...CAUSAL_MODELS],
    slots: ['context'],
    blurb: 'A plain language model that says how likely each word is. Bidirectional models judge a word by the text on both sides of it; left-to-right models see only what comes before.',
    usedFor: [
      { name: 'Context well', desc: 'rephrasings for the inlet: words that fit both sides (bidirectional) or the likeliest continuations of the preceding text (left-to-right), with a histogram of their probabilities' },
      { name: 'Probability coloring', desc: 'tints every word in the editor by how expected it was' },
      { name: 'Scoring', desc: 'ranks the thesaurus and reader suggestions by how well they fit' },
    ],
    defaultModel: 'Xenova/distilbert-base-cased',
  },
  {
    id: 'instruct',
    title: 'Advice Generation',
    emoji: '◉',
    kind: 'instruct',
    models: INSTRUCT_MODELS,
    slots: ['thesaurus', 'reader', 'dictionary'],
    blurb: 'A chat-tuned model that plays roles you describe in plain text.',
    usedFor: [
      { name: 'Thesaurus', desc: 'offers words in the style of a thesaurus you describe ("a wizard\'s wacky spellbook")' },
      { name: 'Reader', desc: 'an imagined persona critiques the selection, then rewrites it in that light' },
      { name: 'Dictionary', desc: 'defines your words in the manner of a dictionary you describe, etymological to entirely wrong' },
    ],
    defaultModel: 'onnx-community/Qwen2.5-0.5B-Instruct',
  },
  {
    id: 'pos',
    title: 'Part of speech',
    emoji: '∴',
    kind: 'pos',
    models: POS_MODELS,
    slots: ['pos'],
    blurb: 'Tags nouns, verbs and friends.',
    usedFor: [
      { name: 'Part-of-speech tags', desc: 'shown under the phrase in the top bar, with a toggle that colors the editor by them' },
      { name: 'Constraints', desc: 'lock a part-of-speech or stress pattern that rephrasings must follow' },
    ],
    defaultModel: 'wink',
  },
  {
    id: 'embeddings',
    title: 'Semantic similarity',
    emoji: '≈',
    kind: 'embed',
    models: EMBEDDING_MODELS,
    slots: ['embed'],
    blurb: 'A sentence-embedding model turns a phrase into a vector, so two phrases can be compared by meaning rather than wording.',
    usedFor: [
      { name: 'Semantic similarity constraint', desc: 'keep rephrasings close to, or far from, the meaning of a phrase you type' },
    ],
    defaultModel: 'Xenova/all-MiniLM-L6-v2',
  },
];

// kept for code that iterates worker slots
export const SLOT_IDS = CARDS.flatMap((c) => c.slots);

export function findModel(card, modelId) {
  return card.models.find((m) => m.id === modelId) ?? card.models.find((m) => m.id === card.defaultModel);
}

/** Pick the dtype string Transformers.js should load for this model on this device. */
export function dtypeFor(model, device, fp16) {
  if (model.bundled) return null;
  if (device === 'webgpu') return fp16 ? model.dtype.webgpu : model.dtype.webgpuNoF16;
  return model.dtype.wasm;
}

export function sizeFor(model, dtype) {
  if (model.bundled) return 0;
  return model.size?.[dtype] ?? null;
}

export function formatMB(mb) {
  if (mb == null) return '?';
  if (mb === 0) return 'bundled';
  return mb >= 1000 ? `${(mb / 1000).toFixed(1)} GB` : `${Math.round(mb)} MB`;
}

/** One-click bundles of slot choices. */
export const PRESETS = [
  {
    id: 'light',
    label: 'Light',
    hint: 'ALBERT + SmolLM2-135M + MiniLM, about 250 MB',
    cards: { probabilities: 'Xenova/albert-base-v2', instruct: 'HuggingFaceTB/SmolLM2-135M-Instruct', pos: 'wink', embeddings: 'Xenova/all-MiniLM-L6-v2' },
  },
  {
    id: 'recommended',
    label: 'Recommended',
    hint: 'DistilBERT + Qwen2.5-0.5B + MiniLM, about 700 MB',
    cards: { probabilities: 'Xenova/distilbert-base-cased', instruct: 'onnx-community/Qwen2.5-0.5B-Instruct', pos: 'wink', embeddings: 'Xenova/all-MiniLM-L6-v2' },
  },
  {
    id: 'rich',
    label: 'Rich',
    hint: 'RoBERTa + Gemma 3 1B + BGE small, about 1.6 GB, needs a real GPU',
    cards: { probabilities: 'Xenova/roberta-base', instruct: 'onnx-community/gemma-3-1b-it-ONNX', pos: 'wink', embeddings: 'Xenova/bge-small-en-v1.5' },
  },
];

/**
 * Rough resident-memory estimate for the chosen models. Weights stay roughly
 * their file size on WebGPU; the WebAssembly path copies them into the wasm
 * heap and needs working space, so it runs closer to double. Plus a baseline
 * for the runtime, tokenisers, activations and the page itself.
 */
export function estimateMemoryMB(uniqueMB, device) {
  const factor = device === 'webgpu' ? 1.3 : 2.0;
  return Math.round(uniqueMB * factor + 350);
}

/** What the browser is willing to tell us about the machine's memory. */
export function deviceMemoryInfo() {
  const info = {};
  if (typeof navigator !== 'undefined' && navigator.deviceMemory) {
    info.deviceGB = navigator.deviceMemory; // Chromium only; coarse
  }
  if (typeof performance !== 'undefined' && performance.memory?.jsHeapSizeLimit) {
    info.heapLimitGB = performance.memory.jsHeapSizeLimit / 2 ** 30;
  }
  return info;
}

export const ALL_MODELS = [...CAUSAL_MODELS, ...MASKED_MODELS, ...INSTRUCT_MODELS, ...POS_MODELS, ...EMBEDDING_MODELS];

/** Whether the session loaded a sentence-embedding model (the semantic similarity constraint needs one). */
export const embeddingsLoaded = (session) => !!session?.slots?.embed && session.slots.embed !== 'none';

/** The worker task behind a slot for this session ('causal' | 'fill-mask' | 'instruct' | 'pos' | 'embed'). */
export function taskFor(session, slot) {
  const id = session?.slots?.[slot];
  const model = ALL_MODELS.find((m) => m.id === id);
  if (model?.task) return model.task;
  const card = CARDS.find((c) => c.slots.includes(slot));
  return card?.kind ?? null;
}

/** Short label of the model behind a well, e.g. "GPT-2 · 124M · fp32". */
export function modelLabelFor(session, wellType) {
  if (!session) return null;
  const label = (slot) => {
    const id = session.slots?.[slot];
    const model = ALL_MODELS.find((m) => m.id === id);
    if (!model || model.id === 'none') return null;
    if (model.bundled) return model.name;
    const dtype = dtypeFor(model, session.device.device, session.device.fp16);
    return `${model.name} · ${dtype} · ${session.device.device}`;
  };
  switch (wellType) {
    case 'context': case 'sieve': return label('context');
    case 'thesaurus': case 'reader': case 'dictionary': return label(wellType);
    case 'words': return label('pos');
    case 'sound': return 'CMU Pronouncing Dictionary';
    default: return null;
  }
}

/** Short "benchmark 52" label for dropdowns, or null when no comparable score is published. */
/** Benchmark symbol (a dial) used wherever a score is shown; see BENCHMARK_NOTE for what the score means. */
export const BENCH_SYMBOL = '◐';

export function benchLabel(model) {
  return model.bench ? `${BENCH_SYMBOL} ${Math.round(model.bench.score)}` : null;
}
