#!/usr/bin/env node
// Test harness for the probability-model routines in src/models/lm.js, run in
// Node on the CPU so the algorithm can be checked independently of WebGPU.
//
//   node scripts/lm-test.mjs [--model Xenova/gpt2] [--dtype fp32] [--k 8] [--depth 6] [--prefix "text"] [--text "text to score"] [--beam [--groups 2] [--diversity 1.0]]
//        [--avoid e,a] [--starts st] [--sound "S T"] [--avoidsound R] [--pmin -9 --pmax -3]
//        the sieve well's gate: letters to ban, a letter prefix, an ARPAbet prefix, phonemes to ban, a per-token log-probability window
//   node scripts/lm-test.mjs --well thesaurus [--model onnx-community/Qwen2.5-0.5B-Instruct] [--dtype q8] --role "a thesaurus of metonyms" --query "following day" [--runs 2] [--beam [--k 4] [--per 4]]
//   node scripts/lm-test.mjs --well fill [--model Xenova/distilbert-base-cased] --prefix "text before the inlet" --after "text after" --n 2 --k 12
//
// Probability mode prints the search results with per-token log-probs, the
// probability of each token of --text after --prefix, and candidate scores.
// Well mode runs the thesaurus prompt exactly as the app does (one-shot
// messages, "<entry>" reply prefix, plain sampling) and prints the raw reply
// and the parsed entries.
import { prepareGate } from '../src/models/gate.js';
import { AutoTokenizer, AutoModelForCausalLM, AutoModelForMaskedLM, env } from '@huggingface/transformers';
import { probsForText, searchContinuations, scoreCandidates } from '../src/models/lm.js';
import { chatGenerate } from '../src/models/chat.js';
import { beamContinuations, beamEntries } from '../src/models/beam.js';
import { fillMask } from '../src/models/mlm.js';
import { thesaurusMessages, parseEntries, ENTRY_PREFIX } from '../src/models/prompts.js';

env.cacheDir = new URL('../.model-cache/', import.meta.url).pathname; // keep downloads inside the repo

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : 'true']);
  return acc;
}, []));
const well = args.well ?? null;
const modelId = args.model ?? (well === 'fill' ? 'Xenova/distilbert-base-cased' : well ? 'onnx-community/Qwen2.5-0.5B-Instruct' : 'Xenova/gpt2');
const dtype = args.dtype ?? (well === 'thesaurus' ? 'q8' : 'fp32');
const K = Number(args.k ?? 8);
const depth = Number(args.depth ?? 6);
const prefix = args.prefix ?? 'Something interesting, go and find it.\n\nWhat do you think we ';
const text = args.text ?? 'should do?';

const fmt = (n) => (Number.isFinite(n) ? n.toFixed(2) : String(n));
const t = () => performance.now();

console.log(`model ${modelId} dtype ${dtype} (cpu)`);
let t0 = t();
const tokenizer = await AutoTokenizer.from_pretrained(modelId);
const model = well === 'fill'
  ? await AutoModelForMaskedLM.from_pretrained(modelId, { dtype, device: 'cpu' })
  : await AutoModelForCausalLM.from_pretrained(modelId, { dtype, device: 'cpu' });
console.log(`loaded in ${((t() - t0) / 1000).toFixed(1)}s\n`);
const inst = { tokenizer, model, modelId, dtype, device: 'cpu' };

if (well === 'fill') {
  // bidirectional fill: --prefix is the text before the inlet, --after the text after it, --n words to fill
  const after = args.after ?? '?';
  const n = Number(args.n ?? 1);
  console.log(`=== fill · before ${JSON.stringify(prefix)} · after ${JSON.stringify(after)} · ${n} word(s) · K=${K}`);
  t0 = t();
  const { sequences } = await fillMask(inst, { prefix, leading: ' ', after, nWords: n, k: K });
  console.log(`took ${((t() - t0) / 1000).toFixed(1)}s`);
  for (const c of sequences) console.log(`  ${JSON.stringify(c.text).padEnd(32)} mean ${fmt(c.logProb / c.tokens.length).padStart(6)}  [${c.tokens.map((w) => `${JSON.stringify(w.text)}:${fmt(w.logProb)}`).join(' ')}]`);
  process.exit(0);
}

if (well === 'thesaurus') {
  const roles = (args.role ?? 'an everyday English thesaurus').split('|');
  const query = args.query ?? 'following day';
  const runs = Number(args.runs ?? 1);
  const temperature = Number(args.temperature ?? 1.0);
  for (const role of roles) {
  console.log(`\n=== thesaurus · role ${JSON.stringify(role)} · query ${JSON.stringify(query)} · temperature ${temperature}`);
  if (args.beam === 'true') {
    t0 = t();
    const beams = Number(args.k ?? 4);
    const { entries, texts } = await beamEntries(inst, { messages: thesaurusMessages({ description: role, selection: query, advice: '' }), assistantPrefix: ENTRY_PREFIX, numBeams: beams, numBeamGroups: Number(args.groups ?? beams), entriesPerBeam: Number(args.per ?? 4), diversityPenalty: Number(args.diversity ?? 1.0) });
    console.log(`\n--- beam search · ${((t() - t0) / 1000).toFixed(1)}s · ${beams} beams · ${entries.length} entries`);
    texts.forEach((x, i) => console.log(`\nbeam ${i}:\n${x}`));
    console.log('\nENTRIES:');
    for (const e of entries) console.log(`  ${JSON.stringify(e.text).padEnd(36)} beam ${e.beam} score ${fmt(e.score)}`);
    continue;
  }
  for (let i = 0; i < runs; i++) {
    t0 = t();
    const { text: raw } = await chatGenerate(inst, {
      messages: thesaurusMessages({ description: role, selection: query, advice: '' }),
      maxNewTokens: 320, temperature, doSample: temperature > 0, assistantPrefix: ENTRY_PREFIX,
    });
    console.log(`\n--- run ${i + 1} · ${((t() - t0) / 1000).toFixed(1)}s\nRAW:\n${raw}\n\nPARSED (${parseEntries(raw, query).length}):`);
    for (const e of parseEntries(raw, query)) console.log(`  · ${e}`);
  }
  }
  process.exit(0);
}

// 1. search
console.log(`=== search: K=${K} depth=${depth}\nprefix: ${JSON.stringify(prefix)}`);
t0 = t();
const beam = args.beam === 'true';
// the sieve well's generation-time gate (see src/models/gate.js)
const letters = [];
if (args.avoid) letters.push({ mode: 'avoid', target: args.avoid.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean) });
if (args.starts) letters.push({ mode: 'starts with', target: args.starts.toLowerCase().split('') });
const sounds = [];
if (args.sound) sounds.push({ mode: 'starts with', target: args.sound.toUpperCase().split(/\s+/).filter(Boolean) });
if (args.avoidsound) sounds.push({ mode: 'avoid', target: args.avoidsound.toUpperCase().split(/[\s,]+/).filter(Boolean) });
const prob = args.pmin || args.pmax ? { min: Number(args.pmin ?? -1e9), max: Number(args.pmax ?? 0) } : null;
const gate = letters.length || sounds.length || prob ? { letters, sounds, prob } : null;
if (gate) await prepareGate(gate);
const { sequences, histogram, endsWithSpace, gateStats } = beam
  ? await beamContinuations(inst, { prefix, k: K, depth, window: 256, numBeamGroups: args.groups ? Number(args.groups) : null, diversityPenalty: Number(args.diversity ?? 1.0), gate })
  : await searchContinuations(inst, { prefix, k: K, depth, window: 256, gate });
if (beam) console.log('(diverse beam search)');
if (gate) console.log(`gate ${JSON.stringify(gate)} · first step let through ${gateStats.allowed}/${gateStats.vocab} tokens (${(100 * gateStats.mass).toFixed(2)}% of the probability)`);
console.log(`took ${((t() - t0) / 1000).toFixed(1)}s · endsWithSpace=${endsWithSpace} · histogram bins=${histogram.counts.length} total=${histogram.counts.reduce((a, b) => a + b, 0)}`);
let nan = 0;
for (const s of sequences) {
  const lps = s.tokens.map((x) => x.logProb);
  if (lps.some((v) => !Number.isFinite(v))) nan++;
  console.log(`  ${JSON.stringify(s.text).padEnd(40)} mean ${fmt(s.logProb / s.tokens.length).padStart(6)}  [${s.tokens.map((x) => `${JSON.stringify(x.text)}:${fmt(x.logProb)}`).join(' ')}]`);
}
console.log(nan ? `!! ${nan} sequences contain non-finite log-probs` : 'all log-probs finite');
const firsts = sequences.map((s) => s.tokens[0]?.text);
console.log(new Set(firsts).size === firsts.length ? 'first tokens all distinct' : '!! duplicate first tokens');

// 2. probability of existing text
console.log(`\n=== probs of ${JSON.stringify(text)} after prefix`);
t0 = t();
const { tokens } = await probsForText(inst, { prefix, text, topK: 3 });
console.log(`took ${((t() - t0) / 1000).toFixed(1)}s`);
for (const tok of tokens) console.log(`  ${JSON.stringify(tok.text).padEnd(14)} logp ${fmt(tok.logProb).padStart(7)}  p ${tok.prob == null ? '-' : tok.prob.toFixed(3)}  alt: ${tok.alternates.map((a) => `${JSON.stringify(a.text)} ${fmt(a.logProb)}`).join(', ')}`);

// 3. scoring candidates
const cands = [text, 'ought to do', 'the , ,', 'purple monkey dishwasher'];
console.log(`\n=== score candidates ${JSON.stringify(cands)}`);
t0 = t();
const { results } = await scoreCandidates(inst, { prefix, candidates: cands });
console.log(`took ${((t() - t0) / 1000).toFixed(1)}s`);
results.forEach((r, i) => console.log(`  ${JSON.stringify(cands[i]).padEnd(28)} mean ${fmt(r.logProbMean).padStart(7)}  [${r.tokens.map((x) => `${JSON.stringify(x.text)}:${fmt(x.logProb)}`).join(' ')}]`));
