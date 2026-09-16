# Phraselette

This is a 'revibecoded' version of the system used for the paper:

> Alex Calderwood, John Joon Young Chung, Yuqian Sun, Melissa Roemmele, and Max Kreminski. 2025. **Phraselette: A Poet's Procedural Palette.** In *Designing Interactive Systems Conference (DIS '25)*. https://arxiv.org/abs/2503.06335

Every model runs inside the visitor's browser through [Transformers.js](https://huggingface.co/docs/transformers.js) (WebGPU when available, WebAssembly otherwise). There is no API, no server-side inference, and no telemetry; the server only ships static files.

## Develop

```bash
npm install
npm run dev
```

Vite prints the local URL (`http://localhost:3027/phraselette/`) and the LAN URLs. The app lives under the `/phraselette/` base path in development and production alike.

## Build and run

```bash
npm run build      # → dist/
npm run serve      # node server.mjs, serves dist/ at http://0.0.0.0:3027/phraselette/
npm run static     # build + serve in one go: the production bundle on :3027 with no hot reload
```

Use `npm run static` when testing the models: unlike `npm run dev`, nothing reloads while you edit, so loaded models stay loaded.

## Docker

```bash
docker build -t phraselette .
docker run --rm -p 3027:3027 phraselette
```

The image is a two-stage build (Node builds `dist/`, then a slim Node image runs `server.mjs`). It listens on 3027 inside and outside the container and answers `/healthz`.

Model weights are downloaded by the browser directly from the Hugging Face Hub and cached in the browser's Cache Storage, so nothing large flows through the server.

Pronunciations for the sound well come from the CMU Pronouncing Dictionary, bundled as a lazily loaded chunk.

### Beam search

Transformers.js 4.2.0 has no beam search (its `generate()` takes the top token only), so Phraselette carries its own in `src/models/beam.js`, ported from Transformers.js [PR #1539](https://github.com/huggingface/transformers.js/pull/1539) (reference diff in `docs/reference/`). It is diverse beam search in the Hugging Face sense: the beams are split into groups, and at every step a token already chosen by an earlier group is penalized (`diversity_penalty`, default 1.0) so the groups spread out. The search drives `model.forward()` directly, keeping every token's log-probability for the histogram and the coloring, reorders the KV cache between steps, and applies the original build's `no_repeat_ngram_size=2` rule.

Three wells use it. The **sieve well** is the context well with the constraints applied while it searches: `src/models/gate.js` turns letter constraints, sound constraints (checked as each word closes, with the CMU dictionary loaded in the worker) and the probability window into a per-token mask that the loops apply while selecting candidates (see `generationGate` in `src/core/constraints.js`), and the well reports how much of the vocabulary the first step let through. A “contains” constraint on letters or sounds cannot be masked (no token breaks it), so it steers instead: beams that have not placed the letters are ranked by their score plus a multiple of log P(they still will), estimated from the model's own mass on fitting tokens and the tokens left, which becomes a hard deadline at the phrase's last word; while steering, words may only grow into dictionary spellings. The **context well** beam-searches continuations of the preceding text (K beams, K/4 groups); its earlier top-K-then-greedy loop remains in `src/models/lm.js` as "fast search", selectable from the well's ⋯ menu. The **thesaurus** beam-searches the chat reply itself (plain sampling is a menu option): four beams in four groups each write four `<entry>` lines in a row, so a beam sees (and avoids repeating) its own earlier entries while the groups keep the beams apart; all sixteen are collected, best beam first, deduplicated. `scripts/lm-test.mjs --beam` runs either on the CPU.

## Testing the models

One harness runs the same code the wells use:

- `node scripts/lm-test.mjs --model Xenova/gpt2 --dtype fp32 --k 8 --depth 6 --prefix "…" --text " word to score"` runs the context search, existing-text probabilities and candidate scoring on the CPU and prints per-token log-probs, with checks for non-finite values and duplicate first tokens. Models it downloads are cached in `.model-cache/` (git-ignored).
- `node scripts/lm-test.mjs --well thesaurus --model onnx-community/Qwen2.5-0.5B-Instruct --dtype q8 --role "a thesaurus of metonyms|an everyday English thesaurus" --query "following day" --runs 2` runs the thesaurus prompt exactly as the app does (same messages, reply prefix and sampling, via `src/models/chat.js`) for each `|`-separated role and prints the raw reply and the parsed entries. Swap `--model` to compare advice models.
- GPT-2 in fp16 overflows to NaN on WebGPU, which is why the app loads it in fp32; check other precisions with the harness above before adding them to the catalogue.

## Layout

```
src/
  components/   Landing, Workspace, Editor (textarea + colour overlay), wells, constraints, results
  core/         tokens, inlets (ranges that survive edits), constraints + scoring, well definitions
  lang/         wink-nlp tagger, CMUdict phonemes, POS tables, personas
  models/       catalogue, worker (all models), lm.js (probabilities / search / scoring), prompts, session
  state/        reducer + async actions
server.mjs      static server for production
scripts/        copies ONNX Runtime wasm files into public/ort at dev/build time
```

## Development

Phraselette 1.0 was developed with Max Kreminski, John Joon Young Chung, Yuqian Sun, Melissa Roemmele, and Taewook Kim.

Phraselette 2.0 was revibed (rebuilt from a description of the paper and the previous source code) by Claude Fable 5.1 from the paper and the original study build.

"Revibe" borrowed from Revibing Code from Eytan Adar, Yoonjoo Lee, Nina Lei, Q. Vera Liao, Weirui Peng. Reimplementing HCI Artifacts https://arxiv.org/abs/2608.00450


## Attribution

Prompts, personas, colour scheme and interaction design follow the original Phraselette study build. Any code derived from Transformers.js PR #1539 (Apache-2.0) must carry an attribution comment.


