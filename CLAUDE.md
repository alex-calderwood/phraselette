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
- Prompts follow the original `old/front-end/src/server/queries.js` closely; changes to prompt text are discussed first.
- Match the original's generation settings unless Alex says otherwise (the original passed no repetition penalties to the API).
- American spelling in user-facing text.
- Keep `TODO.md` current.

## Project facts
- Phraselette 2.0: browser-only rebuild of the DIS '25 paper's tool; all models run via Transformers.js. Served under `/phraselette/` on port 3027 (`npm run dev`, `npm run static`, Docker).
- `old/` holds the original study build for reference and will be deleted by Alex. `old-secrets/` (git-ignored) is a local backup of the study credentials; never commit or print them.
- Transformers.js has no beam search; the context well uses its own loop (`src/models/lm.js`, `src/models/mlm.js`). A port of upstream PR #1539 is an open task in `TODO.md`.
