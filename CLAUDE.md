# Working rules for this repository

These come from Alex and take precedence over defaults.

## Git is Alex's, not Claude's
- **Never run any `git` command.** Not `add`, `rm --cached`, `stash`, `checkout`, `commit`, `push`, `filter-repo`, nothing. Not read-only ones either unless explicitly asked.
- Describe what changed on disk and, at most, suggest a command for Alex to run.

## Files and processes
- Never write anything outside this repository (no `/tmp`, no home-directory memory files, no scratchpad). Temporary files go in git-ignored folders inside the repo (`.build-check/`, `.model-cache/`) and are deleted afterwards.
- Never start a server on port 3027; that is Alex's dev/static server. Verification builds go to `.build-check/` (`npx vite build --outDir .build-check`), never to `dist/`, which the static server may be serving.
- Stop only processes started in the same command, by PID. No `pkill` by name.
- Alex does the browser testing; do not drive the app in a browser unless asked.

## Editing habits Alex has asked for
- Prompts follow the original study build's `queries.js` (now only in git history under `old/`); changes to prompt text are discussed first.
- Match the original's generation settings unless Alex says otherwise (the original passed no repetition penalties to the API).
- American spelling in user-facing text.

## Project facts
- Phraselette 2.0: browser-only rebuild of the DIS '25 paper's tool; all models run via Transformers.js. Served under `/phraselette/` on port 3027 (`npm run dev`, `npm run static`, Docker).
- `old/` (the original study build) has been deleted from the working tree; it remains in git history. `old-secrets/` (git-ignored) is a local backup of the study credentials; never commit or print them.
- Transformers.js has no beam search. `src/models/beam.js` is a port of upstream PR #1539 (reference diff in `docs/reference/`; keep the attribution comment) used by the context well and the thesaurus; `src/models/lm.js` keeps the older top-K-then-greedy "fast" loop and `src/models/mlm.js` the masked-model fill.
