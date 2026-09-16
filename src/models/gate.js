// Generation-time gate for the sieve well. `generationGate` (core/constraints.js)
// reduces an inlet's constraints to plain data that crosses into the worker;
// `makeGate` turns that into (a) a per-token predicate the search loops in lm.js
// and beam.js apply while selecting candidates, so the cut happens before any
// beam width is spent and the surviving (often rarer) tokens compete only with
// each other, and (b) a steering heuristic for rules that a token cannot break
// but a phrase can fail to meet (letters "contains").
//
// Letters and probability are decided token by token. Sounds are decided at word
// boundaries: a token that starts a new word (or is punctuation / end of text)
// closes the word before it, whose pronunciation (CMU dictionary, first entry, as
// the sift uses) is then checked against the constraint. Unlike the sift, a word
// the dictionary does not know fails: otherwise the search dodges the rule by
// gluing subwords into non-words ("streetway" to avoid an R).
//
// Steering (A*-style): a beam that has not yet met a "contains" rule is ranked
// by its score plus h = log P(it still will), estimated as 1 − (1 − m)^r from
// the model's own mass m on fitting tokens at this step (floored by a static
// prior) and the r chances it has left: tokens for a letter run, words for a
// phoneme run. h is 0 once met and −∞ once the phrase's last word has closed
// without it, so the deadline falls out of the same rule.
import { loadPhones, phonesReady, pronunciations, noStress } from '../lang/phones.js';

let dict = null;
/** Letters-only spellings of every dictionary word, sorted, for prefix lookups by binary search (no trie to hold). */
let spellings = null;

/** Load what a gate needs before the search runs (the pronunciation dictionary, for sound constraints). */
export async function prepareGate(gate) {
  if (!gate?.sounds?.length && !gate?.needs?.length) return; // sounds need pronunciations; steering needs real spellings
  dict = await loadPhones();
  if (!spellings) {
    spellings = [...new Set(Object.keys(dict).filter((w) => !w.includes('(')).map((w) => w.replace(/[^a-z0-9]/g, '')).filter(Boolean))].sort();
  }
}

/** Index of the first spelling in the sorted array `arr` that is not below `p`. */
function lowerBound(arr, p) {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid] < p) lo = mid + 1; else hi = mid; }
  return lo;
}
/** Is `p` a prefix of some spelling in `arr`? (Binary search: no trie to hold.) */
function prefixIn(arr, p) { const i = lowerBound(arr, p); return i < arr.length && arr[i].startsWith(p); }
/** Is `p` itself a spelling in `arr`? */
function wordIn(arr, p) { const i = lowerBound(arr, p); return i < arr.length && arr[i] === p; }

const fittingCache = new Map();

/**
 * Sorted spellings of the dictionary words whose pronunciation fits one sound
 * rule given the phonemes already placed: for a prefix rule the word must agree
 * with the rest of the target (an empty rest means anything fits, or for
 * 'exactly' that nothing more may start); for 'avoid' it must hold none of the
 * phonemes. The search may only open or continue a word whose spelling is a
 * prefix of one of these, so a beam can never commit to a word it cannot close.
 * Null when anything fits.
 */
function fitting(rule, placed) {
  if (!dict) return null;
  const remaining = rule.mode === 'avoid' ? rule.target : rule.target.slice(placed.length);
  if (rule.mode !== 'avoid' && remaining.length === 0) return rule.mode === 'exactly' ? [] : null;
  const key = `${rule.mode}|${remaining.join(' ')}`;
  if (fittingCache.has(key)) return fittingCache.get(key);
  const out = new Set();
  for (const [word, pron] of Object.entries(dict)) {
    if (word.includes('(')) continue; // alternate pronunciations: the sift uses the first entry too
    const phones = noStress(pron).split(' ');
    let ok = true;
    if (rule.mode === 'avoid') {
      ok = !phones.some((p) => remaining.includes(p));
    } else {
      const n = Math.min(phones.length, remaining.length);
      for (let i = 0; i < n; i++) if (phones[i] !== remaining[i]) { ok = false; break; }
      if (ok && rule.mode === 'exactly' && phones.length > remaining.length) ok = false; // the word would overshoot
    }
    if (!ok) continue;
    const letters = word.replace(/[^a-z0-9]/g, '');
    if (letters) out.add(letters);
  }
  const arr = [...out].sort();
  fittingCache.set(key, arr);
  return arr;
}

/** Does the phoneme list hold `run` as a contiguous subsequence? (The sift's "contains".) */
function hasRun(phones, run) {
  outer: for (let i = 0; i + run.length <= phones.length; i++) {
    for (let j = 0; j < run.length; j++) if (phones[i + j] !== run[j]) continue outer;
    return true;
  }
  return false;
}

const containingCache = new Map();
/** Sorted spellings of the dictionary words whose pronunciation holds the phoneme run (for steering toward a sound). */
function containing(run) {
  const key = run.join(' ');
  if (containingCache.has(key)) return containingCache.get(key);
  const out = new Set();
  for (const [word, pron] of Object.entries(dict)) {
    if (word.includes('(')) continue;
    if (!hasRun(noStress(pron).split(' '), run)) continue;
    const letters = word.replace(/[^a-z0-9]/g, '');
    if (letters) out.add(letters);
  }
  const arr = [...out].sort();
  containingCache.set(key, arr);
  return arr;
}

/** Lowercase ASCII letters and digits of every vocabulary entry (as arrays and as strings), built once per model instance. */
function tokenLetters(inst) {
  if (inst.tokenLetters) return inst.tokenLetters;
  const { tokenizer, model } = inst;
  const V = model.config.vocab_size ?? tokenizer.model?.vocab?.length ?? 50257;
  const vocab = tokenizer.model?.vocab;
  const table = new Array(V);
  const strings = new Array(V);
  for (let i = 0; i < V; i++) {
    const s = vocab && vocab[i] != null ? vocab[i].replace(/^[Ġ▁]/, '') : tokenizer.decode([i]);
    table[i] = s.toLowerCase().match(/[a-z0-9]/g) ?? [];
    strings[i] = table[i].join('');
  }
  inst.tokenLetters = table;
  inst.tokenLetterStrings = strings;
  return table;
}

/** First-entry phonemes (no stress) of a word, or null when the dictionary does not know it. */
function phonesOf(word) {
  const p = pronunciations(word)[0];
  return p ? noStress(p).split(' ').filter(Boolean) : null;
}

/** Is `phones` consistent with the sound constraints so far? `closed` = no more phonemes will follow (for 'exactly'). */
function soundsOK(sounds, phones, closed = false) {
  for (const s of sounds) {
    const t = s.target;
    if (s.mode === 'avoid') {
      if (phones.some((p) => t.includes(p))) return false;
    } else { // 'starts with' and 'exactly': the phonemes so far must be a prefix of the target
      const n = Math.min(phones.length, t.length);
      for (let i = 0; i < n; i++) if (phones[i] !== t[i]) return false;
      if (s.mode === 'exactly' && (phones.length > t.length || (closed && phones.length < t.length))) return false;
    }
  }
  return true;
}

/**
 * @param inst  model instance (tokenizer + model, with `masks` from lm.js ensureMasks)
 * @param gate  { letters: [{ mode: 'starts with' | 'avoid', target }], sounds: [{ mode: 'starts with' | 'exactly' | 'avoid', target }],
 *               needs: [{ target }] (letter runs the phrase must contain), prob: { min, max } | null } or null
 * @param opts  { nWords: words the phrase is trimmed to afterwards, depth: tokens the search may generate }
 * @returns {{ forBeam, steering, accepts, firstStep } | null}
 */
export function makeGate(inst, gate, { nWords = null, depth = null } = {}) {
  if (!gate) return null;
  const letters = gate.letters ?? [];
  const sounds = phonesReady() ? (gate.sounds ?? []) : [];
  const needs = (gate.needs ?? []).filter((n) => n.target?.length);
  const letterNeeds = needs.filter((n) => n.kind !== 'sound').map((n) => n.target.join('').toLowerCase());
  // steering toward a sound needs the dictionary (loaded by prepareGate); without it the rule stays a sift
  const soundNeeds = dict && spellings ? needs.filter((n) => n.kind === 'sound').map((n) => n.target.map((x) => String(x).toUpperCase())) : [];
  const prob = gate.prob ?? null;
  if (!letters.length && !sounds.length && !needs.length && !prob) return null;
  const table = letters.length || sounds.length || needs.length ? tokenLetters(inst) : null;
  const strings = inst.tokenLetterStrings;
  const startsWithSpace = inst.masks?.startsWithSpace ?? null;
  const halt = inst.masks?.halt ?? null;
  const starts = letters.filter((l) => l.mode === 'starts with').map((l) => l.target);
  const avoid = new Set(letters.filter((l) => l.mode === 'avoid').flatMap((l) => l.target));
  let avoidMask = null;
  if (avoid.size) {
    avoidMask = new Uint8Array(table.length);
    for (let i = 0; i < table.length; i++) if (table[i].some((ch) => avoid.has(ch))) avoidMask[i] = 1;
  }
  // a token closes the word before it when it starts a new one or carries no letters (punctuation, newline, end of text)
  const closes = (id) => (startsWithSpace && startsWithSpace[id]) || table[id].length === 0;
  // steering: the tokens that hold each needed run on their own, and a floor for the per-step chance of
  // placing it (the share of dictionary words that contain it; the vocabulary's share when no dictionary)
  const needMasks = letterNeeds.map((run) => {
    const ids = [];
    let lettered = 0;
    for (let i = 0; i < table.length; i++) {
      if (!strings[i]) continue;
      lettered++;
      if (strings[i].includes(run)) ids.push(i);
    }
    const prior = spellings ? spellings.filter((w) => w.includes(run)).length / spellings.length : lettered ? ids.length / lettered : 0;
    return { run, ids, prior };
  });
  // while steering, a word may only grow into a real one (else the search glues "z" onto anything at the deadline)
  const realWords = (letterNeeds.length || soundNeeds.length) && spellings ? spellings : null;
  // per phoneme run: the fitting spellings, the word-opening tokens that can start one, and the prior (share of words)
  const soundFits = soundNeeds.map((run) => {
    const arr = containing(run);
    const ids = []; // word-opening tokens that are, on their own, a fitting word (a run placed in one step)
    for (let i = 0; i < table.length; i++) if (strings[i] && closes(i) && wordIn(arr, strings[i])) ids.push(i);
    return { run, arr, ids, prior: spellings.length ? arr.length / spellings.length : 0 };
  });
  const { tokenizer } = inst;
  /** Spelling lookaheads for every sound rule, given the phonemes already fixed (plus: any real word at all). */
  const lookaheadsAfter = (phones) => [spellings, ...sounds.map((r) => fitting(r, phones))].filter(Boolean);
  /** Split generated ids into closed words and the open one. */
  const wordsOf = (prevIds) => {
    const words = [];
    let cur = [];
    prevIds.forEach((id, i) => {
      if (i > 0 && closes(id) && cur.length) { words.push(cur); cur = []; }
      if (table[id].length) cur.push(id);
    });
    return { words, cur };
  };
  /**
   * The beam's words so far: phonemes of the closed ones, whether the open word
   * (closed now) would pass, and which spellings may still follow, both while
   * the open word grows and once it has closed.
   */
  const soundState = (prevIds) => {
    const { words, cur } = wordsOf(prevIds);
    const phonesFor = (ids) => phonesOf(tokenizer.decode(ids).trim()); // null: not in the dictionary
    const doneWords = words.map(phonesFor);
    const doneKnown = doneWords.every(Boolean);
    const done = doneWords.flatMap((p) => p ?? []);
    const open = cur.length ? phonesFor(cur) : [];
    // a prefix rule still has phonemes to place and no word is open: only a word may come next
    const needsWord = !cur.length && sounds.some((r) => r.mode !== 'avoid' && r.target.length > done.length);
    return {
      doneOK: doneKnown && soundsOK(sounds, done),
      closeOK: doneKnown && open != null && soundsOK(sounds, [...done, ...open]),
      /** the whole sequence as a finished phrase: every word known and the rules met in full */
      finalOK: doneKnown && open != null && soundsOK(sounds, [...done, ...open], true),
      needsWord,
      openLetters: cur.flatMap((id) => table[id]).join(''),
      duringOpen: lookaheadsAfter(done),
      afterClose: open ? lookaheadsAfter([...done, ...open]) : [],
    };
  };
  /**
   * The needed runs as seen by a beam: the letters of its first `nWords` words
   * (later ones are trimmed off afterwards, so they cannot help), how many words
   * have closed, and which runs are still missing.
   */
  const needState = (prevIds) => {
    let closed = 0;
    let cur = '';
    let curIds = [];
    let text = '';
    const placed = []; // phonemes of the closed words inside the budget (first pronunciation, as the sift uses)
    prevIds.forEach((id, i) => {
      if (i > 0 && closes(id) && cur) {
        if (soundNeeds.length && (nWords == null || closed < nWords)) placed.push(...(phonesOf(tokenizer.decode(curIds).trim()) ?? []));
        closed++; cur = ''; curIds = [];
      }
      if (table[id].length) { cur += strings[id]; curIds.push(id); if (nWords == null || closed < nWords) text += strings[id]; }
    });
    const openPhones = soundNeeds.length && cur ? phonesOf(tokenizer.decode(curIds).trim()) : null; // null: unknown / no open word
    return {
      closed, open: cur.length > 0, openLetters: cur, text, placed, openPhones,
      missing: letterNeeds.filter((run) => !text.includes(run)),
      missingSounds: soundNeeds.filter((run) => !hasRun(placed, run)),
    };
  };
  /** Would token `id` keep the beam's words real (a prefix of some dictionary spelling)? */
  const keepsReal = (openLetters, id) => {
    if (!realWords || !strings[id]) return true;
    return prefixIn(realWords, closes(id) ? strings[id] : openLetters + strings[id]);
  };
  return {
    /** Predicate for the next token of a beam that has generated `prevIds` so far. */
    forBeam(prevIds) {
      let soFarLetters = [];
      if (starts.length) soFarLetters = prevIds.flatMap((id) => table[id]);
      const sound = sounds.length ? soundState(prevIds) : null;
      const openLetters = realWords ? needState(prevIds).openLetters : '';
      return (id, lp) => {
        if (prob && (lp < prob.min || lp > prob.max)) return false;
        if (avoidMask && avoidMask[id]) return false;
        if (realWords && !keepsReal(openLetters, id)) return false;
        for (const t of starts) {
          if (soFarLetters.length >= t.length) continue; // prefix already complete
          const tok = table[id];
          if (!tok.length) return false; // no letters yet: quotes, dashes and bare spaces may not stall the prefix
          for (let j = 0; j < tok.length && soFarLetters.length + j < t.length; j++) {
            if (tok[j] !== t[soFarLetters.length + j]) return false;
          }
        }
        if (sound) {
          if (!sound.doneOK) return false; // a closed word already broke the constraint: the beam is lost
          const tok = table[id];
          if (sound.needsWord && !tok.length) return false; // quotes, dashes and bare spaces may not stall the prefix
          if (closes(id)) {
            if (!sound.closeOK) return false; // closing the open word here would break it
            // this token opens a new word: its spelling must be able to grow into a real, fitting one
            if (tok.length) {
              const spelling = tok.join('');
              for (const arr of sound.afterClose) if (!prefixIn(arr, spelling)) return false;
            }
          } else if (tok.length) {
            // continuing the open word: the spelling so far must still lead to a real, fitting word
            // (without this the search never closes a word it cannot afford to close, and glues subwords forever)
            const spelling = sound.openLetters + tok.join('');
            for (const arr of sound.duringOpen) if (!prefixIn(arr, spelling)) return false;
          }
        }
        return true;
      };
    },

    /**
     * Steering for a beam that has generated `prevIds` and sees next-token
     * log-probs `lp`: null when nothing is missing (h = 0 for every token);
     * otherwise `shortlist(id)` (the token places a missing run, or keeps a word
     * on the way to one: such tokens join the candidates even when their raw
     * probability is outside the top-K) and `h(id)`, the heuristic for the state
     * after taking the token: 0 for every run it places, −∞ if it ends the
     * phrase or closes its last word with a run still missing, else
     * log(1 − (1 − m)^r) summed over the missing runs.
     */
    steering(prevIds, lp) {
      if (!letterNeeds.length && !soundNeeds.length) return null;
      const st = needState(prevIds);
      if (!st.missing.length && !st.missingSounds.length) return null;
      const stepsLeft = depth != null ? depth - prevIds.length - 1 : null; // tokens after this one
      // inside the phrase's last word: only tokens that continue it can still help
      const lastWord = nWords != null && st.open && st.closed + 1 >= nWords;
      // does taking this token close the phrase's last word (what follows then falls outside the budget)?
      const closesLast = (id) => nWords != null && st.open && closes(id) && st.closed + 1 >= nWords;
      const logChance = (m, r) => (r <= 0 || m <= 0 ? -Infinity : m >= 1 ? 0 : Math.log1p(-((1 - m) ** r)));
      /** @type {{ places(id): boolean, h(id): number }[]} one entry per missing run */
      const rules = [];

      // letter runs: decided token by token, r = tokens left
      const tail = st.text.slice(-Math.max(0, ...st.missing.map((run) => run.length - 1)));
      for (const run of st.missing) {
        const nm = needMasks.find((x) => x.run === run);
        /** Would token `id` place the run now, inside the budget, and keep the word real? */
        const places = (id) => !!strings[id] && (nWords == null || st.closed < nWords) && !closesLast(id)
          && (tail + strings[id]).includes(run) && keepsReal(st.openLetters, id);
        // the model's mass on tokens that would place it right now (floored by the prior unless the
        // phrase is in its last word, where only continuations can help)
        let m = 0;
        for (const i of nm.ids) if (places(i)) m += Math.exp(lp[i]);
        if (!lastWord) m = Math.max(m, nm.prior);
        const hUnsat = logChance(m, stepsLeft ?? 8);
        rules.push({ places, helps: places, h: (id) => (closesLast(id) ? -Infinity : hUnsat) });
      }

      // phoneme runs: decided as words close, r = words that can still hold it
      const ptail = st.placed.slice(-Math.max(0, ...st.missingSounds.map((run) => run.length - 1)));
      for (const run of st.missingSounds) {
        const fit = soundFits.find((x) => x.run.join(' ') === run.join(' '));
        // closing the open word now places the run when its pronunciation (after the placed tail) holds it
        const openPlaces = st.open && st.openPhones != null && (nWords == null || st.closed < nWords) && hasRun([...ptail, ...st.openPhones], run);
        /** The beam's words after taking token `id`: closed count, the open spelling, and whether it is on the way to / already a fitting word. */
        const after = (id) => {
          const opens = closes(id);
          const closedAfter = opens ? st.closed + (st.open ? 1 : 0) : st.closed;
          const spelling = strings[id] ? (opens ? strings[id] : st.openLetters + strings[id]) : '';
          const inBudget = nWords == null || closedAfter < nWords;
          return {
            closedAfter,
            openAfter: !!spelling,
            onTrack: !!spelling && inBudget && prefixIn(fit.arr, spelling),
            complete: !!spelling && inBudget && wordIn(fit.arr, spelling), // a fitting word, whole: as good as placed
          };
        };
        const places = (id) => (openPlaces && closes(id)) || after(id).complete;
        // the model's mass on tokens that place a fitting word in one step, floored by the share of such words
        let m = 0;
        for (const i of fit.ids) m += Math.exp(lp[i]);
        m = Math.max(m, fit.prior);
        /**
         * Chances left after this token: an open word that is on the way counts if there is a token left
         * to finish it; each further word needs a token of its own, within the word budget.
         */
        const chances = (a) => {
          const tokensAfter = stepsLeft ?? 8;
          const openCounts = a.openAfter && a.onTrack && tokensAfter >= 1 ? 1 : 0;
          const wordsLeft = nWords != null ? nWords - a.closedAfter - (a.openAfter ? 1 : 0) : Math.ceil(tokensAfter / 1.5);
          return openCounts + Math.max(0, Math.min(wordsLeft, tokensAfter));
        };
        // on the way: placing the run, or opening / continuing a word that can still become a fitting one
        const helps = (id) => places(id) || after(id).onTrack;
        rules.push({ places, helps, h: (id) => logChance(m, chances(after(id))) });
      }

      const h = (id) => {
        let sum = 0;
        for (const r of rules) {
          if (r.places(id)) continue;
          if (halt && halt[id]) return -Infinity; // the phrase ends still missing a run
          const v = r.h(id);
          if (v === -Infinity) return -Infinity;
          sum += v;
        }
        return sum;
      };
      // shortlisted: places or approaches a run, and is not already ruled out (a prefix with no token left to finish it)
      return { shortlist: (id) => rules.some((r) => r.helps(id)) && h(id) > -Infinity, h };
    },

    /** Does a finished hypothesis meet the rules in full? (A letter prefix reached; every word known and fitting; every run present.) */
    accepts(ids) {
      if (starts.length) {
        const n = ids.reduce((acc, id) => acc + table[id].length, 0);
        if (starts.some((t) => n < t.length)) return false;
      }
      if (sounds.length && !soundState(ids).finalOK) return false;
      if (letterNeeds.length || soundNeeds.length) {
        const st = needState(ids);
        if (st.missing.length) return false;
        if (realWords && st.open && !wordIn(realWords, st.openLetters)) return false; // cut off mid-word
        if (soundNeeds.length) {
          const all = [...st.placed, ...(st.open && (nWords == null || st.closed < nWords) ? (st.openPhones ?? []) : [])];
          if (soundNeeds.some((run) => !hasRun(all, run))) return false;
        }
      }
      return true;
    },

    /** How much of the first-step distribution the gate (and `alsoAllowed`) let through. */
    firstStep(lp, alsoAllowed = null) {
      const pass = this.forBeam([]);
      let allowed = 0;
      let mass = 0;
      for (let i = 0; i < lp.length; i++) {
        if (alsoAllowed && !alsoAllowed(i)) continue;
        if (!pass(i, lp[i])) continue;
        allowed++;
        mass += Math.exp(lp[i]);
      }
      return { allowed, vocab: lp.length, mass };
    },
  };
}
