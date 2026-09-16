// Async flows: tagging, probabilities, running wells, swapping text. Each
// function takes the dispatch + a getState accessor and talks to the worker.
import { request, cancel } from '../models/client.js';
import { ensureModels } from '../models/session.js';
import { embeddingsLoaded } from '../models/catalog.js';
import { tagWithWink, tagSuffix, attachPhones } from '../lang/tagger.js';
import { loadPhones } from '../lang/phones.js';
import { ptbToUpos } from '../lang/pos.js';
import { makeToken, makeSequence, numWords, isWordToken, uid } from '../core/tokens.js';
import { constraintAdvice, maxWordsAllowed, generationGate } from '../core/constraints.js';
import { searchSettings, WELL_DEFS, CONTEXT_LIKE, makeWell } from '../core/wells.js';
import { thesaurusMessages, thesaurusNotesMessages, readerMessages, readerRevisionsMessages, dictionaryMessages, parseEntries, parseNotes, ENTRY_PREFIX, NOTES_PREFIX, NOTES_SUFFIX, BULLET_PREFIX } from '../models/prompts.js';
import { inletConstraints, activeWells, tokensIn } from './store.js';

/** Length cap on the thesaurus's notes about itself (a few sentences). */
const NOTES_TOKENS = 120;
const STOPLIST = new Set(['_', '~', '-', '', '.', ',']);
const HALTLIST = ['�', '」', '<|endoftext'];

export function createActions(dispatch, getState, session) {
  const usesBertPos = session.slots.pos && session.slots.pos !== 'wink';
  const hasContext = !!session.slots.context;
  const hasEmbed = embeddingsLoaded(session);
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
      return finishSequence(makeSequence(tokens, text, well.type, well.id, { originShade: well.shade ?? 0 }));
    })).filter((s) => !badSequence(s));
  }

  /**
   * Whether `seqs` are still what the well shows for this inlet: the same sequence
   * objects in the same order. Scoring and embedding both finish asynchronously and
   * each republishes a shallow copy of the list, so identity of the array itself
   * would make whichever finishes second throw its work away.
   */
  function stillCurrent(inlet, well, seqs) {
    const cur = getState().insights[well.id]?.[inlet.id]?.sequences;
    return !!cur && cur.length === seqs.length && cur.every((s, i) => s === seqs[i]);
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
      if (stillCurrent(inlet, well, seqs)) {
        dispatch({ type: 'insight', wellId: well.id, inletId: inlet.id, insight: { sequences: [...seqs] } });
        reresolve(inlet.id);
      }
    } catch (e) {
      if (!/cancel/i.test(String(e.message))) console.warn('scoring failed', e);
    }
  }

  /**
   * Attach a sentence embedding to each sequence that lacks one (if an embedding
   * model is loaded) and re-resolve, so a semantic similarity constraint can judge
   * them. Cheap enough to run for every result; until it lands the constraint
   * treats the sequence as not yet judged.
   */
  async function embedSequences(inlet, well, seqs) {
    if (!hasEmbed) return;
    const todo = seqs.filter((s) => !s.embedding);
    if (!todo.length) return;
    try {
      const { vectors } = await request('embed', { texts: todo.map((s) => s.text.trim()) });
      todo.forEach((s, i) => { s.embedding = vectors[i]; });
      if (stillCurrent(inlet, well, seqs)) dispatch({ type: 'insight', wellId: well.id, inletId: inlet.id, insight: { sequences: [...seqs] } });
    } catch (e) {
      if (!/cancel/i.test(String(e.message))) console.warn('embedding failed', e);
    }
  }

  /** Embed whatever every active well already shows for an inlet (for a semantic constraint added after the search). */
  function embedInletSequences(inletId) {
    const st = getState();
    const inlet = st.inlets.find((i) => i.id === inletId);
    if (!inlet) return;
    for (const w of activeWells(st)) {
      const seqs = st.insights[w.id]?.[inletId]?.sequences;
      if (seqs?.length) embedSequences(inlet, w, seqs);
    }
  }

  /** Embed a semantic constraint's reference phrase and store the vector on it (dropped if the reference changed meanwhile). */
  async function embedReference(c) {
    const text = (c.reference ?? '').trim();
    if (!hasEmbed || !text) return;
    try {
      const { vectors } = await request('embed', { texts: [text] });
      const cur = getState().constraints.find((x) => x.id === c.id);
      if (cur && (cur.reference ?? '').trim() === text) dispatch({ type: 'patchConstraint', id: c.id, patch: { vector: vectors[0] } });
    } catch (e) {
      if (!/cancel/i.test(String(e.message))) console.warn('embedding failed', e);
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
    // The worker reports the exact text handed to the model (chat template
    // applied, reply prefix appended); keep it so the well can show it.
    const showPrompt = (onPartial, append = false) => (d) => {
      if (d?.prompt == null) { onPartial?.(d); return; }
      const prev = append ? (getState().insights[well.id]?.[inlet.id]?.prompt ?? '') : '';
      dispatch({ type: 'insight', wellId: well.id, inletId: inlet.id, insight: { prompt: prev ? `${prev}\n\n────────\n\n${d.prompt}` : d.prompt } });
    };
    try {
      if (CONTEXT_LIKE.has(well.type)) {
        const ss = searchSettings(well);
        // the sieve applies what it can of the constraints inside the search (models/gate.js)
        const gate = well.type === 'sieve' ? generationGate(cons) : null;
        const selWords = Math.max(1, numWords(tokensIn(getState().tokens, inlet.start, inlet.end)));
        const targetWords = maxWords != null ? Math.min(maxWords, selWords) : selWords;
        const depth = Math.max(1, Math.min(25, Math.floor(targetWords * 4 / 3 + 1)));
        const after = getState().text.slice(inlet.end);
        const p = track(request('search', {
          prefix, depth, window: 256,
          // diverse beam search (beam.js) by default; 'fast' is the top-K-then-greedy loop in lm.js
          mode: ss.mode, k: ss.mode === 'beam' ? ss.beams : ss.k, numBeamGroups: ss.groups, diversityPenalty: ss.diversity, lengthPenalty: ss.lengthPenalty, noRepeatNgramSize: ss.noRepeat,
          // used by bidirectional models: what follows the inlet, its leading space, how many words to fill
          after, leading: leadingFor(inlet), nWords: targetWords, capitalize: /^[A-Z]/.test(selection),
          gate,
        }, {
          onPartial: (d) => d.progress && dispatch({ type: 'insight', wellId: well.id, inletId: inlet.id, insight: { progress: d.progress } }),
        }));
        const { sequences, histogram, gateStats = null } = await p;
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
          return finishSequence(makeSequence(tokens, text, well.type, well.id, { originShade: well.shade ?? 0 }));
        })).filter((s) => !badSequence(s));
        dispatch({ type: 'insight', wellId: well.id, inletId: inlet.id, insight: { sequences: seqs, histogram, progress: null, gate: gate ? { ...gate, stats: gateStats } : null } });
        embedSequences(inlet, well, seqs);
      } else if (well.type === 'thesaurus') {
        const ss = searchSettings(well);
        // First (unless the well turns it off) the model muses about the thesaurus alone: a short
        // sampled reply, cut at the closing tag. Those notes then sit in the entry request.
        let notes = null;
        dispatch({ type: 'insight', wellId: well.id, inletId: inlet.id, insight: { notes: null, notesStreaming: false } });
        if (well.notes !== false) {
          const { text: raw } = await track(request('chat', { slot: 'thesaurus', messages: thesaurusNotesMessages({ description: well.role, templates: well.templates }), maxNewTokens: NOTES_TOKENS, temperature: 1.0, doSample: true, assistantPrefix: NOTES_PREFIX, stopAt: NOTES_SUFFIX }, {
            onPartial: showPrompt((d) => d.text && dispatch({ type: 'insight', wellId: well.id, inletId: inlet.id, insight: { notes: parseNotes(d.text), notesStreaming: true } })),
          }));
          notes = parseNotes(raw) || null;
          dispatch({ type: 'insight', wellId: well.id, inletId: inlet.id, insight: { notes, notesStreaming: false } });
        }
        const messages = thesaurusMessages({ description: well.role, selection, advice, notes, templates: well.templates, examples: well.examples !== false });
        let text;
        if (ss.mode === 'beam') {
          // diverse beam search over the reply: each beam writes several entries in a row (seeing its
          // own earlier ones), the groups keep the beams apart, and every beam's entries are collected
          const stream = streamEntries(inlet, well, selection, maxWords);
          const { texts } = await track(request('beamEntries', { slot: 'thesaurus', messages, assistantPrefix: ENTRY_PREFIX, numBeams: ss.beams, numBeamGroups: ss.groups, entriesPerBeam: ss.perBeam, diversityPenalty: ss.diversity, lengthPenalty: ss.lengthPenalty, maxNewTokens: ss.tokensPerEntry * ss.perBeam }, {
            onPartial: showPrompt((d) => {
              if (d.progress) dispatch({ type: 'insight', wellId: well.id, inletId: inlet.id, insight: { progress: d.progress } });
              if (d.text) stream(d);
            }, notes != null),
          }));
          text = texts.join('\n\n');
        } else {
          ({ text } = await track(request('chat', { slot: 'thesaurus', messages, maxNewTokens: ss.maxNewTokens, temperature: ss.temperature, topP: ss.topP, doSample: ss.temperature > 0, assistantPrefix: ENTRY_PREFIX }, {
            onPartial: showPrompt(streamEntries(inlet, well, selection, maxWords), notes != null),
          })));
        }
        const entries = parseEntries(text, selection);
        const seqs = candidatesToSequences(inlet, well, entries, maxWords);
        dispatch({ type: 'insight', wellId: well.id, inletId: inlet.id, insight: { sequences: seqs, streaming: null, raw: text, progress: null } });
        reresolve(inlet.id);
        scoreSequences(inlet, well, seqs, maxWords);
        embedSequences(inlet, well, seqs);
      } else if (well.type === 'reader') {
        const context = markedContextFor(inlet);
        const { text: feedback } = await track(request('chat', { slot: 'reader', messages: readerMessages({ description: well.role, context, selection, templates: well.templates }), maxNewTokens: 260, temperature: 1.0, assistantPrefix: BULLET_PREFIX }, {
          onPartial: showPrompt((d) => dispatch({ type: 'insight', wellId: well.id, inletId: inlet.id, insight: { streaming: d.text } })),
        }));
        dispatch({ type: 'insight', wellId: well.id, inletId: inlet.id, insight: { text: feedback, streaming: null } });
        const { text: rev } = await track(request('chat', { slot: 'reader', messages: readerRevisionsMessages({ description: well.role, context, selection, feedback, advice, templates: well.templates }), maxNewTokens: 260, temperature: 1.0, assistantPrefix: ENTRY_PREFIX }, {
          onPartial: showPrompt(streamEntries(inlet, well, selection, maxWords), true),
        }));
        const entries = parseEntries(rev, selection);
        const seqs = candidatesToSequences(inlet, well, entries, maxWords);
        dispatch({ type: 'insight', wellId: well.id, inletId: inlet.id, insight: { sequences: seqs, streaming: null, raw: rev } });
        reresolve(inlet.id);
        scoreSequences(inlet, well, seqs, maxWords);
        embedSequences(inlet, well, seqs);
      } else if (well.type === 'dictionary') {
        const { text } = await track(request('chat', { slot: 'dictionary', messages: dictionaryMessages({ description: well.role, selection, templates: well.templates }), maxNewTokens: 260, temperature: 1.0, assistantPrefix: BULLET_PREFIX }, {
          onPartial: showPrompt((d) => dispatch({ type: 'insight', wellId: well.id, inletId: inlet.id, insight: { streaming: d.text } })),
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
    addConstraint(c) {
      dispatch({ type: 'addConstraint', constraint: c });
      reresolve(c.inletId);
      if (c.kind === 'semantic') { embedReference(c); embedInletSequences(c.inletId); }
    },
    removeConstraint(c) { dispatch({ type: 'removeConstraint', id: c.id }); reresolve(c.inletId); },
    patchConstraint(c, patch) {
      // a new reference phrase invalidates the stored vector until it has been embedded again
      const rephrased = c.kind === 'semantic' && 'reference' in patch && patch.reference !== c.reference;
      dispatch({ type: 'patchConstraint', id: c.id, patch: rephrased ? { ...patch, vector: null } : patch });
      reresolve(c.inletId);
      if (rephrased) embedReference({ ...c, ...patch });
    },
    runWells,
    runWell,
    setTooltip(tooltip) { dispatch({ type: 'tooltip', tooltip }); },
  };
}
