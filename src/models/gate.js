// Generation-time gate for the sieve well. `generationGate` (core/constraints.js)
// reduces an inlet's constraints to plain data that crosses into the worker;
// `makeGate` turns that into a per-token predicate the search loops in lm.js and
// beam.js apply while selecting candidates, so the cut happens before any beam
// width is spent and the surviving (often rarer) tokens compete only with each other.
//
// Letters and probability are decided token by token. Sounds are decided at word
// boundaries: a token that starts a new word (or is punctuation / end of text)
// closes the word before it, whose pronunciation (CMU dictionary, first entry, as
// the sift uses) is then checked against the constraint. Unlike the sift, a word
// the dictionary does not know fails: otherwise the search dodges the rule by
// gluing subwords into non-words ("streetway" to avoid an R).
import { loadPhones, phonesReady, pronunciations, noStress } from '../lang/phones.js';

let dict = null;
/** Letters-only spellings of every dictionary word, sorted, for prefix lookups by binary search (no trie to hold). */
let spellings = null;

/** Load what a gate needs before the search runs (the pronunciation dictionary, for sound constraints). */
export async function prepareGate(gate) {
  if (!gate?.sounds?.length) return;
  dict = await loadPhones();
  if (!spellings) {
    spellings = [...new Set(Object.keys(dict).filter((w) => !w.includes('(')).map((w) => w.replace(/[^a-z0-9]/g, '')).filter(Boolean))].sort();
  }
}

/** Is `p` a prefix of some spelling in the sorted array `arr`? (Binary search: no trie to hold.) */
function prefixIn(arr, p) {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid] < p) lo = mid + 1; else hi = mid; }
  return lo < arr.length && arr[lo].startsWith(p);
}

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

/** Lowercase ASCII letters and digits of every vocabulary entry, built once per model instance. */
function tokenLetters(inst) {
  if (inst.tokenLetters) return inst.tokenLetters;
  const { tokenizer, model } = inst;
  const V = model.config.vocab_size ?? tokenizer.model?.vocab?.length ?? 50257;
  const vocab = tokenizer.model?.vocab;
  const table = new Array(V);
  for (let i = 0; i < V; i++) {
    const s = vocab && vocab[i] != null ? vocab[i].replace(/^[Ġ▁]/, '') : tokenizer.decode([i]);
    table[i] = s.toLowerCase().match(/[a-z0-9]/g) ?? [];
  }
  inst.tokenLetters = table;
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
 * @param gate  { letters: [{ mode: 'starts with' | 'avoid', target }], sounds: [{ mode: 'starts with' | 'exactly' | 'avoid', target }], prob: { min, max } | null } or null
 * @returns {{ forBeam(prevIds:number[]) => (id:number, lp:number) => boolean, firstStep(lp, alsoAllowed) => object } | null}
 */
export function makeGate(inst, gate) {
  if (!gate) return null;
  const letters = gate.letters ?? [];
  const sounds = phonesReady() ? (gate.sounds ?? []) : [];
  const prob = gate.prob ?? null;
  if (!letters.length && !sounds.length && !prob) return null;
  const table = letters.length || sounds.length ? tokenLetters(inst) : null;
  const startsWithSpace = inst.masks?.startsWithSpace ?? null;
  const starts = letters.filter((l) => l.mode === 'starts with').map((l) => l.target);
  const avoid = new Set(letters.filter((l) => l.mode === 'avoid').flatMap((l) => l.target));
  let avoidMask = null;
  if (avoid.size) {
    avoidMask = new Uint8Array(table.length);
    for (let i = 0; i < table.length; i++) if (table[i].some((ch) => avoid.has(ch))) avoidMask[i] = 1;
  }
  const { tokenizer } = inst;
  // a token closes the word before it when it starts a new one or carries no letters (punctuation, newline, end of text)
  const closes = (id) => (startsWithSpace && startsWithSpace[id]) || table[id].length === 0;
  /** Spelling lookaheads for every sound rule, given the phonemes already fixed (plus: any real word at all). */
  const lookaheadsAfter = (phones) => [spellings, ...sounds.map((r) => fitting(r, phones))].filter(Boolean);
  /**
   * The beam's words so far: phonemes of the closed ones, whether the open word
   * (closed now) would pass, and which spellings may still follow, both while
   * the open word grows and once it has closed.
   */
  const soundState = (prevIds) => {
    const words = [];
    let cur = [];
    prevIds.forEach((id, i) => {
      if (i > 0 && closes(id) && cur.length) { words.push(cur); cur = []; }
      if (table[id].length) cur.push(id);
    });
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
  return {
    /** Predicate for the next token of a beam that has generated `prevIds` so far. */
    forBeam(prevIds) {
      let soFarLetters = [];
      if (starts.length) soFarLetters = prevIds.flatMap((id) => table[id]);
      const sound = sounds.length ? soundState(prevIds) : null;
      return (id, lp) => {
        if (prob && (lp < prob.min || lp > prob.max)) return false;
        if (avoidMask && avoidMask[id]) return false;
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
    /** Does a finished hypothesis meet the rules in full? (A letter prefix reached; every word known and fitting.) */
    accepts(ids) {
      if (starts.length) {
        const n = ids.reduce((acc, id) => acc + table[id].length, 0);
        if (starts.some((t) => n < t.length)) return false;
      }
      if (sounds.length && !soundState(ids).finalOK) return false;
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
