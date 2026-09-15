// Async flows: tagging, probabilities, running wells, swapping text. Each
// function takes the dispatch + a getState accessor and talks to the worker.
import { request, cancel } from '../models/client.js';
import { ensureModels } from '../models/session.js';
import { tagWithWink, tagSuffix, attachPhones } from '../lang/tagger.js';
import { loadPhones } from '../lang/phones.js';
import { ptbToUpos } from '../lang/pos.js';
import { makeToken, makeSequence, numWords, isWordToken, uid } from '../core/tokens.js';
import { constraintAdvice, maxWordsAllowed } from '../core/constraints.js';
import { WELL_DEFS, makeWell } from '../core/wells.js';
import { thesaurusMessages, readerMessages, readerRevisionsMessages, dictionaryMessages, parseEntries, ENTRY_PREFIX, BULLET_PREFIX } from '../models/prompts.js';
import { inletConstraints, activeWells, tokensIn } from './store.js';

const STOPLIST = new Set(['_', '~', '-', '', '.', ',']);
const HALTLIST = ['�', '」', '<|endoftext'];

export function createActions(dispatch, getState, session) {
  const usesBertPos = session.slots.pos && session.slots.pos !== 'wink';
  const hasContext = !!session.slots.context;
  let tagTimer = null;
  let probTimer = null;
  let probRequest = null;
  const running = new Map(); // `${inletId}:${wellId}` -> request id

  // ---- tagging ------------------------------------------------------------
  async function tagText(text) {
    let tokens = tagWithWink(text);
    if (usesBertPos && text.trim()) {
      try {
        const { words } = await request('pos', { text });
        const byStart = new Map(words.map((w) => [w.start, w]));
        tokens = tokens.map((t) => {
          const w = byStart.get(t.start);
          return w && w.end === t.end ? { ...t, pos: ptbToUpos(w.tag) } : t;
        });
      } catch (e) { console.warn('pos tagger failed, using wink', e); }
    }
    attachPhones(tokens);
    return tokens;
  }

  function scheduleTag() {
    clearTimeout(tagTimer);
    tagTimer = setTimeout(async () => {
      const text = getState().text;
      const tokens = await tagText(text);
      if (getState().text === text) dispatch({ type: 'tokens', tokens });
    }, 120);
  }

  function scheduleProbs(delay = 900) {
    if (!hasContext) return;
    const st = getState();
    const hl = st.wells.find((w) => w.id === st.highlightWellId);
    if (!hl || hl.type !== 'context' || !hl.active) return;
    clearTimeout(probTimer);
    probTimer = setTimeout(async () => {
      const text = getState().text;
      if (!text.trim()) { dispatch({ type: 'probTokens', probTokens: [] }); return; }
      if (probRequest) cancel(probRequest.id);
      dispatch({ type: 'probPending', value: true });
      const req = {};
      probRequest = req;
      try {
        const p = request('probs', { prefix: '', text, window: 448, topK: 5 });
        req.id = p.id;
        const { tokens } = await p;
        if (probRequest === req && getState().text === text) dispatch({ type: 'probTokens', probTokens: tokens });
      } catch (e) {
        if (!/cancel/.test(String(e.message))) console.warn('probs failed', e);
        dispatch({ type: 'probPending', value: false });
      }
    }, delay);
  }

  // ---- helpers ------------------------------------------------------------
  function prefixFor(inlet) {
    return getState().text.slice(0, inlet.start);
  }
  /** Whitespace the inlet absorbed in front of the phrase ('' or ' '). */
  function leadingFor(inlet) {
    return getState().text.slice(inlet.start, inlet.end).match(/^[ \t]*/)[0];
  }
  /** Surrounding passage with the inlet marked ⟦…⟧, for the reader well. */
  function markedContextFor(inlet, before = 1200, after = 400) {
    const t = getState().text;
    const core = selectionFor(inlet);
    const lead = leadingFor(inlet);
    return t.slice(Math.max(0, inlet.start - before), inlet.start) + lead + '⟦' + core + '⟧' + t.slice(inlet.end, inlet.end + after);
  }
  /** The phrase itself, without the absorbed leading whitespace (what prompts see). */
  function selectionFor(inlet) {
    return getState().text.slice(inlet.start, inlet.end).replace(/^[ \t]+/, '');
  }
  /** Build word tokens for a candidate string, given per-sub-token log-probs (offsets relative to candidate). */
  function wordTokensFor(prefix, candidate, subTokens, maxWords) {
    let words = tagSuffix(prefix, candidate);
    // shift to candidate-relative offsets
    words = words.map((t) => ({ ...t, start: t.start - prefix.length, end: t.end - prefix.length }));
    attachPhones(words);
    if (subTokens?.length) {
      for (const w of words) {
        if (w.isSpace) continue;
        let lp = 0; let n = 0;
        for (const st of subTokens) {
          if (st.logProb == null) continue;
          const overlap = Math.min(st.end, w.end) - Math.max(st.start, w.start);
          if (overlap <= 0) continue;
          const frac = overlap / Math.max(1, st.end - st.start);
          lp += st.logProb * frac; n += frac;
        }
        if (n > 0) { w.logProb = lp; w.subTokenCount = n; w.logProbMean = lp / n; }
      }
    }
    if (maxWords != null) {
      let count = 0; const cut = [];
      for (const w of words) { if (isWordToken(w)) { if (count >= maxWords) break; count++; } cut.push(w); }
      // drop trailing whitespace
      while (cut.length && cut[cut.length - 1].isSpace) cut.pop();
      words = cut;
    }
    return words;
  }

  function finishSequence(seq) {
    const scored = seq.tokens.filter((t) => typeof t.logProb === 'number');
    if (scored.length) {
      const lp = scored.reduce((a, t) => a + t.logProb, 0);
      const n = scored.reduce((a, t) => a + (t.subTokenCount ?? 1), 0);
      seq.logProb = lp; seq.logProbMean = lp / Math.max(1e-6, n);
    }
    seq.text = seq.tokens.map((t) => t.text).join('');
    return seq;
  }

  function badSequence(seq) {
    const s = seq.text.trim();
    if (!s || STOPLIST.has(s)) return true;
    if (HALTLIST.some((h) => s.includes(h))) return true;
    if (numWords(seq.tokens) === 0) return true;
    return false;
  }

  function dedupe(seqs) {
    const seen = new Set();
    return seqs.filter((s) => { const k = s.text.trim().toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
  }

  /** Turn candidate strings into sequences right away; probabilities are filled in by scoreSequences(). */
  function candidatesToSequences(inlet, well, candidates, maxWords) {
    const prefix = prefixFor(inlet);
    const leading = leadingFor(inlet);
    return dedupe(candidates.map((c) => {
      const text = leading + c.replace(/^\s+/, '');
      const tokens = wordTokensFor(prefix, text, null, maxWords);
      return finishSequence(makeSequence(tokens, text, well.type, well.id));
    })).filter((s) => !badSequence(s));
  }

  /** Score sequences with the probability model (if loaded) and re-resolve; the UI already shows them unscored. */
  async function scoreSequences(inlet, well, seqs, maxWords) {
    if (!hasContext || !seqs.length) return;
    const prefix = prefixFor(inlet);
    try {
      const { results } = await request('score', { prefix, candidates: seqs.map((s) => s.text), after: getState().text.slice(inlet.end) });
      seqs.forEach((seq, i) => {
        const r = results[i];
        if (!r?.tokens?.length) return;
        seq.tokens = wordTokensFor(prefix, seq.text, r.tokens, maxWords);
        finishSequence(seq);
      });
      const cur = getState().insights[well.id]?.[inlet.id];
      if (cur?.sequences === seqs) {
        dispatch({ type: 'insight', wellId: well.id, inletId: inlet.id, insight: { sequences: [...seqs] } });
        reresolve(inlet.id);
      }
    } catch (e) {
      if (!/cancel/i.test(String(e.message))) console.warn('scoring failed', e);
    }
  }

  /** onPartial handler: parse complete <entry> items from the stream so far and show them immediately. */
  function streamEntries(inlet, well, selection, maxWords) {
    let shown = 0;
    return (d) => {
      if (!d?.text) return;
      const entries = parseEntries(d.text, selection, { partial: true });
      if (entries.length !== shown) {
        shown = entries.length;
        const seqs = candidatesToSequences(inlet, well, entries, maxWords);
        dispatch({ type: 'insight', wellId: well.id, inletId: inlet.id, insight: { sequences: seqs, streaming: d.text } });
        reresolve(inlet.id);
      } else {
        dispatch({ type: 'insight', wellId: well.id, inletId: inlet.id, insight: { streaming: d.text } });
      }
    };
  }

  // Scoring against constraints happens in the reducer (store.js: recompute), which
  // always sees the freshest state. Nothing to do here.
  const reresolve = () => {};

  // ---- running wells ------------------------------------------------------
  const notice = (n) => dispatch({ type: 'notice', notice: n });

  async function runWell(inlet, well) {
    const def = WELL_DEFS[well.type];
    if (!def.canSearch) return;
    const key = `${inlet.id}:${well.id}`;
    if (running.has(key)) cancel(running.get(key));
    // mark as searching synchronously so the UI never shows an idle inlet between creation and the first request
    dispatch({ type: 'searching', inletId: inlet.id, wellId: well.id, on: true });
    try { await ensureModels(session, notice); } catch (e) {
      notice(`models unavailable: ${e.message}`);
      dispatch({ type: 'searching', inletId: inlet.id, wellId: well.id, on: false });
      return;
    }
    dispatch({ type: 'insight', wellId: well.id, inletId: inlet.id, insight: { error: null, progress: null } });
    const cons = inletConstraints(getState(), inlet.id);
    const advice = constraintAdvice(cons);
    const maxWords = maxWordsAllowed(cons);
    const selection = selectionFor(inlet);
    const prefix = prefixFor(inlet);
    const track = (p) => { running.set(key, p.id); return p; };
    // keep the prompt actually sent (last user turn) so the well can show it
    const remember = (messages, append = false) => {
      const sent = messages[messages.length - 1].content;
      const prev = append ? (getState().insights[well.id]?.[inlet.id]?.prompt ?? '') : '';
      dispatch({ type: 'insight', wellId: well.id, inletId: inlet.id, insight: { prompt: prev ? `${prev}\n\n────────\n\n${sent}` : sent } });
      return messages;
    };
    try {
      if (well.type === 'context') {
        const selWords = Math.max(1, numWords(tokensIn(getState().tokens, inlet.start, inlet.end)));
        const targetWords = maxWords != null ? Math.min(maxWords, selWords) : selWords;
        const depth = Math.max(1, Math.min(25, Math.floor(targetWords * 4 / 3 + 1)));
        const after = getState().text.slice(inlet.end);
        const p = track(request('search', {
          prefix, k: session.searchWidth ?? 24, depth, window: 256,
          // used by bidirectional models: what follows the inlet, its leading space, how many words to fill
          after, leading: leadingFor(inlet), nWords: targetWords, capitalize: /^[A-Z]/.test(selection),
        }, {
          onPartial: (d) => d.progress && dispatch({ type: 'insight', wellId: well.id, inletId: inlet.id, insight: { progress: d.progress } }),
        }));
        const { sequences, histogram } = await p;
        const leading = leadingFor(inlet);
        const seqs = dedupe(sequences.map((s) => {
          // sub-token offsets relative to the candidate text
          let pos = 0;
          let toks = s.tokens;
          // the inlet has no leading space (start of line, after a bracket…): drop one the model added
          if (!leading && toks.length && /^[ \t]/.test(toks[0].text)) toks = [{ ...toks[0], text: toks[0].text.replace(/^[ \t]/, '') }, ...toks.slice(1)];
          const text = toks.map((t) => t.text).join('');
          const subs = toks.map((t) => { const st = { text: t.text, start: pos, end: pos + t.text.length, logProb: t.logProb }; pos += t.text.length; return st; });
          const tokens = wordTokensFor(prefix, text, subs, maxWords ?? targetWords);
          return finishSequence(makeSequence(tokens, text, well.type, well.id));
        })).filter((s) => !badSequence(s));
        dispatch({ type: 'insight', wellId: well.id, inletId: inlet.id, insight: { sequences: seqs, histogram, progress: null } });
      } else if (well.type === 'thesaurus') {
        const { text } = await track(request('chat', { slot: 'thesaurus', messages: remember(thesaurusMessages({ description: well.role, selection, advice, templates: well.templates })), maxNewTokens: 320, temperature: 1.0, assistantPrefix: ENTRY_PREFIX }, {
          onPartial: streamEntries(inlet, well, selection, maxWords),
        }));
        const entries = parseEntries(text, selection);
        const seqs = candidatesToSequences(inlet, well, entries, maxWords);
        dispatch({ type: 'insight', wellId: well.id, inletId: inlet.id, insight: { sequences: seqs, streaming: null, raw: text } });
        reresolve(inlet.id);
        scoreSequences(inlet, well, seqs, maxWords);
      } else if (well.type === 'reader') {
        const context = markedContextFor(inlet);
        const { text: feedback } = await track(request('chat', { slot: 'reader', messages: remember(readerMessages({ description: well.role, context, selection, templates: well.templates })), maxNewTokens: 260, temperature: 1.0, assistantPrefix: BULLET_PREFIX }, {
          onPartial: (d) => dispatch({ type: 'insight', wellId: well.id, inletId: inlet.id, insight: { streaming: d.text } }),
        }));
        dispatch({ type: 'insight', wellId: well.id, inletId: inlet.id, insight: { text: feedback, streaming: null } });
        const { text: rev } = await track(request('chat', { slot: 'reader', messages: remember(readerRevisionsMessages({ description: well.role, context, selection, feedback, advice, templates: well.templates }), true), maxNewTokens: 260, temperature: 1.0, assistantPrefix: ENTRY_PREFIX }, {
          onPartial: streamEntries(inlet, well, selection, maxWords),
        }));
        const entries = parseEntries(rev, selection);
        const seqs = candidatesToSequences(inlet, well, entries, maxWords);
        dispatch({ type: 'insight', wellId: well.id, inletId: inlet.id, insight: { sequences: seqs, streaming: null, raw: rev } });
        reresolve(inlet.id);
        scoreSequences(inlet, well, seqs, maxWords);
      } else if (well.type === 'dictionary') {
        const { text } = await track(request('chat', { slot: 'dictionary', messages: remember(dictionaryMessages({ description: well.role, selection, templates: well.templates })), maxNewTokens: 260, temperature: 1.0, assistantPrefix: BULLET_PREFIX }, {
          onPartial: (d) => dispatch({ type: 'insight', wellId: well.id, inletId: inlet.id, insight: { streaming: d.text } }),
        }));
        dispatch({ type: 'insight', wellId: well.id, inletId: inlet.id, insight: { text, raw: text, streaming: null, sequences: [] } });
      }
      reresolve(inlet.id);
    } catch (e) {
      if (!/cancel/i.test(String(e.message))) {
        console.error('well failed', well.type, e);
        dispatch({ type: 'insight', wellId: well.id, inletId: inlet.id, insight: { error: e.message, progress: null, streaming: null } });
      }
    } finally {
      running.delete(key);
      dispatch({ type: 'searching', inletId: inlet.id, wellId: well.id, on: false });
    }
  }

  function runWells(inlet, wells = activeWells(getState())) {
    // Nothing that can search is open: open the context well so Search always does something.
    if (!wells.some((w) => WELL_DEFS[w.type].canSearch)) {
      const st = getState();
      const existing = st.wells.find((w) => w.type === 'context');
      const ctx = existing ? { ...existing, active: true, collapsed: false } : { ...makeWell('context'), active: true };
      dispatch({ type: 'addWellObject', well: ctx });
      wells = [...wells, ctx];
    }
    for (const w of wells) runWell(inlet, w);
  }

  // ---- public API ---------------------------------------------------------
  return {
    setText(text) {
      dispatch({ type: 'text', text });
      try { localStorage.setItem('phraselette.text.v1', text); } catch { /* ignore */ }
      scheduleTag();
      scheduleProbs();
    },
    init() {
      ensureModels(session, notice).catch((e) => notice(`models unavailable: ${e.message}`));
      loadPhones().then(() => scheduleTag());
      scheduleTag();
      scheduleProbs(300);
    },
    setSelection(start, end) { dispatch({ type: 'selection', selection: { start, end } }); },
    addWell(type, role = null) { dispatch({ type: 'addWell', wellType: type, role }); },
    removeWell(id) { dispatch({ type: 'removeWell', id }); },
    patchWell(id, patch) { dispatch({ type: 'patchWell', id, patch }); },
    moveWell(id, targetId, after) { dispatch({ type: 'moveWell', id, targetId, after }); },
    highlight(id) { dispatch({ type: 'highlight', id }); scheduleProbs(0); },
    createInlet(start, end) {
      // Heal to token boundaries: drop trailing whitespace, then grow backwards
      // over spaces/tabs (never over text or line breaks) so the space before the
      // phrase belongs to the inlet, as it does to a BPE token.
      const t = getState().text;
      while (end > start && /\s/.test(t[end - 1])) end--;
      while (start < end && /[ \t]/.test(t[start])) start++;
      while (start > 0 && /[ \t]/.test(t[start - 1])) start--;
      if (start === end) return null;
      // Return the inlet synchronously: state only updates after React re-renders,
      // so reading it back here would miss the inlet we just created.
      const existing = getState().inlets.find((i) => i.start === start && i.end === end);
      if (existing) return existing;
      const inlet = { id: uid('inlet'), start, end };
      dispatch({ type: 'createInlet', inlet });
      return inlet;
    },
    deleteInlet(id) {
      for (const [key, rid] of running) if (key.startsWith(id + ':')) cancel(rid);
      dispatch({ type: 'deleteInlet', id });
    },
    addConstraint(c) { dispatch({ type: 'addConstraint', constraint: c }); reresolve(c.inletId); },
    removeConstraint(c) { dispatch({ type: 'removeConstraint', id: c.id }); reresolve(c.inletId); },
    patchConstraint(c, patch) { dispatch({ type: 'patchConstraint', id: c.id, patch }); reresolve(c.inletId); },
    runWells,
    runWell,
    setTooltip(tooltip) { dispatch({ type: 'tooltip', tooltip }); },
  };
}
