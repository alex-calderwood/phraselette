# Phraselette rebuild — task list

Legend: [ ] todo · [~] in progress · [x] done

## 1. Foundation
- [x] Vite + React scaffold at repo root, base path `/phraselette/`, `npm run dev` on :3027 printing local + LAN URLs
- [x] Global styles: rainbow ground, glass panels, well colours (ported from `old/front-end/src/App.css` + `scripts/color.js`)
- [x] App shell: landing page ↔ workspace (state, not URL)

## 2. Models (Transformers.js, all in-browser)
- [x] Model catalogue: three cards (Probabilities · Advice Generation · Part of speech), each with "Used for", per-device dtype + size, presets (Light / Recommended / Rich)
- [x] Web Worker hosting all models; request queue; progress, partial (streaming) and cancel messages; `status` + self-healing reload when the worker is recreated
- [x] Landing page redesign: plain serif wordmark with rainbow rule, casual explanation, three how-to steps, one-sentence model note
- [x] Landing page: title, cards, WebGPU/WASM badge, download total, estimated running memory, browser-reported RAM, paper + Discord links, 2.0 disclaimer, plain-English download progress, choices remembered
- [x] Self-hosted ONNX Runtime wasm files (`scripts/copy-ort.mjs` → `public/ort/`)

## 3. Editor
- [x] Textarea + mirrored highlight overlay (POS / probability / sound colours via a 🎨 toggle per view well, inlet highlight)
- [x] Single **Search** action (button + ⌘↵): selection or word under the caret → inlet → all wells run
- [x] Words well: wink-nlp POS tagging (UPOS) live while typing; optional MobileBERT tagger (PTB → UPOS)
- [x] Inlets survive edits (single-replace diff → shift/expand/trim); swap a rephrasing into the text
- [ ] Verify probability colouring of the document (context well highlighted) after typing

## 4. Constraints
- [x] Part of speech (contains / exactly / starts with / ends with / in order), word count, sound (with "borrow a word's sound" box), probability window on the histogram; per inlet; chips in the constraint bar
- [x] Scoring + accepted/rejected split (port of `resolution.js` + `Constraint.js`)
- [x] Rhyme (rhymes / assonance / consonance / alliteration with a reference word, port of the unported `BetterRhymeConstraint`), syllable count, stress pattern (0/1, secondary folded into stressed), letters (acrostic / lipogram) and character count; **must / must not** toggle on every category and rhyme constraint. Syllable and character caps also bound the context well's search depth.

## 5. Wells
- [x] Context well, fast mode: prefix pass → top-K first tokens → greedy continuation with the original `no_repeat_ngram_size=2` rule, trailing-space rule, per-token log-probs, histogram
- [~] Context well: algorithm verified in Node; verify in the browser at fp32; tune K and depth
- [x] Context well auto-opens on Search when no searching well is active
- [~] Thesaurus / reader / dictionary: prompts now verbatim from `old/front-end/src/server/queries.js`; replies are started with `<entry>` / `* ` so small models keep the format. Awaiting Alex's test.
- [ ] Reader: two-step prompt (feedback → revisions); verify with the local model
- [ ] Dictionary: verify bullets with `<i>` italics render
- [x] Score suggestions with the probability model when loaded
- [x] Sound well: CMUdict phonemes (lazy chunk), rhyming part, sound constraint from a typed reference word
- [x] Bottom results pane: all wells aggregated, coloured by origin, match / fail split, hover expansion
- [x] UI polish: well bar is a 6-column grid, softer well palette, legible POS palette; editor colouring is a 🎨 toggle per view well (off by default, as in the original's effective look)

## 5a. Recent changes (this round)
- [x] Inlet header (phrase · status · **Search**) moved to the bottom pane; Search is the primary action
- [x] **Probabilities** card now offers bidirectional models (DistilBERT default; ALBERT, DistilRoBERTa, BERT, RoBERTa) alongside the left-to-right ones. With a masked model, `src/models/mlm.js` does all three jobs: fill the inlet from both sides, colour words by masking each in turn (pseudo-log-likelihood), and score suggestions the same way. The worker routes `probs` / `search` / `score` by the loaded model's kind.
- [x] One **Add well** button with a two-step popover (choose type → preset role or your own); open wells shown as chips
- [x] Constraints decoupled from wells: their own panel per inlet with a **+ Constraint** chooser (part of speech · word count · sound · probability); wells no longer carry 🔒 buttons or editors
- [x] Rephrasings coloured by source by default; probability / part-of-speech modes selectable
- [x] Wells persist across inlets: always listed in the right column, empty until a phrase is selected
- [x] Floating **Search** button appears beside the selection or caret word in the editor (Medium-style popover), hides while typing or scrolling
- [x] Thesaurus back on Advice Generation with its free-text role
- [x] Editable prompt templates per role well (placeholders documented in the panel), reset to original, last prompt sent shown
- [x] Generated text hidden behind "generating… (model output)" until clicked; entries stream in as chips
- [x] Constraint resolution moved into the reducer (fixes empty results on the first Search)
- [x] `npm run static` prints Vite-style Local/Network URLs; server fails soft while dist/ rebuilds
- [ ] Judge fill quality in the app; on the CPU harness DistilBERT gave weak fills for an unusual sentence. `.model-cache/` was deleted to free 1.5 GB (disk was full); rerun harness only with space to spare

## 5b. Testing platform
- [x] `scripts/lm-test.mjs`: Node/CPU harness for `src/models/lm.js` (search, probs, scoring; NaN + distinct-first-token checks). Verified GPT-2 fp32 gives sensible continuations ("should do about this?", "can learn from this?")
- [x] ~~In-browser model lab~~ removed; the Node harness is the only test surface
- [x] Root cause of the "the , ," context results: GPT-2 fp16 overflows to NaN on WebGPU → top-k picked vocabulary order. Now: fp32 default for GPT-2 on WebGPU + a non-finite-logits guard that reports the dtype
- [x] Inlets heal to token boundaries (absorb the preceding space, never text); candidates carry the leading space so scoring and swapping line up with BPE tokens
- [ ] Try the other probability models with `scripts/lm-test.mjs` at fp16/q4f16 to see which overflow

## 6. Deployment
- [x] `server.mjs` static server on 3027 serving under `/phraselette/` (SPA fallback, wasm MIME, cache headers) — smoke-tested
- [x] Multi-stage `Dockerfile` (glibc build stage with `npm ci --ignore-scripts` → node:alpine runtime), `.dockerignore`. Build stage simulated locally (clean install + build succeed); the image itself builds on Alex's server via the push hook
- [x] README: dev, build, nginx `location /phraselette/` block, model notes, attribution

## 7. Open / later
- [ ] **True (diverse) beam search for the context well.** Port from Hugging Face Transformers.js PR #1539 by justsml (`BeamSearchScorer`, `BeamHypotheses`, `_reorder_cache`, `index_select`) into our worker loop, replacing the PR's full-vocabulary sorts with `topk`. Diff kept at `docs/reference/transformersjs-pr1539-beam-search.diff` (https://github.com/huggingface/transformers.js/pull/1539, head b0b86bde, based on 4.2.0). Derived code must carry an attribution comment. Delete our loop when upstream ships beam search. (Task chip spawned; needs a scaffold commit before it can start.)
- [ ] Commit the scaffold (nothing committed yet)
- [ ] Delete `old/` once nothing else is needed from it (Alex does this)
