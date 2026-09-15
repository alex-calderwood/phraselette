// Constraints narrow the space of rephrasings a well may return. They are
// scored 0..1 after generation (all of them) and some also give "advice" to the
// generators beforehand (word count → search depth; POS/sound → prompt text).
// Port of old/front-end/src/base/Constraint.js with the same scoring maths.
import { uid, numWords, isWordToken } from './tokens.js';
import { UPOS_TAGS } from '../lang/pos.js';
import { ARPABET, VOWELS, explainPhone, soundOut } from '../lang/phones.js';

export const MODES = ['contains', 'exactly', 'starts with', 'ends with', 'in order'];
/** Rhyme constraint modes: how the rephrasing should echo the reference word. */
export const RHYME_MODES = ['rhymes with', 'assonance with', 'consonance with', 'alliterates with'];
export const LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('');
/** Stress categories: CMUdict's secondary stress (2) is folded into stressed (1). */
export const STRESS_RANGE = ['0', '1'];
export const STRESS_LABELS = { 0: '˘ unstressed', 1: 'ˈ stressed' };
/** Kinds that carry a mode + target list (and so can be negated). */
export const CATEGORY_KINDS = new Set(['pos', 'sound', 'stress', 'letters']);

/** Longest contiguous run of `target` found inside `arr`, as a fraction of target length. */
function contains(arr, target) {
  if (target.length === 0) return 1;
  if (arr.length === 0) return 0;
  let best = 0;
  for (let i = 0; i < arr.length; i++) {
    for (let ts = 0; ts < target.length; ts++) {
      let run = 0;
      for (let j = 0; j < target.length - ts && i + j < arr.length; j++) {
        if (arr[i + j] === target[ts + j]) run++; else break;
      }
      best = Math.max(best, run);
    }
  }
  return best / target.length;
}
function exactly(a, b) {
  return a.length === b.length && a.every((v, i) => v === b[i]) ? 1 : 0;
}
function inOrder(arr, target) {
  if (target.length === 0) return 1;
  let ti = 0;
  for (let i = 0; i < arr.length && ti < target.length; i++) if (arr[i] === target[ti]) ti++;
  return ti / target.length;
}
const startsWith = (arr, target) => exactly(arr.slice(0, target.length), target);
const endsWith = (arr, target) => exactly(arr.slice(-target.length), target);
const MODE_FNS = { contains, exactly, 'starts with': startsWith, 'ends with': endsWith, 'in order': inOrder };

/**
 * @typedef {Object} Constraint
 * @property {string} id
 * @property {'pos'|'sound'|'length'|'prob'|'rhyme'|'syllables'|'stress'|'letters'|'chars'} kind
 * @property {string} inletId
 * @property {string} label
 * @property {boolean} [negate]   category and rhyme kinds: require the opposite ("does not contain")
 */

export function makePosConstraint(inletId, tokens) {
  const target = tokens.filter((t) => !t.isSpace && t.pos !== '_SP').map((t) => t.pos);
  return { id: uid('c'), kind: 'pos', inletId, label: 'part of speech', mode: 'contains', target, range: UPOS_TAGS, threshold: 1 };
}

export function makeSoundConstraint(inletId, tokens) {
  const target = phonesOfTokens(tokens);
  return { id: uid('c'), kind: 'sound', inletId, label: 'sound', mode: 'contains', target, range: ARPABET, threshold: 1, reference: '' };
}

/** Rhyme with a reference word; defaults to the selection's last word. */
export function makeRhymeConstraint(inletId, tokens) {
  const words = tokens.filter(isWordToken);
  const reference = words.length ? words[words.length - 1].text : '';
  return { id: uid('c'), kind: 'rhyme', inletId, label: 'rhyme', mode: 'rhymes with', reference, sound: referenceSound(reference), threshold: 1 };
}

/** Syllable count window; defaults to exactly the selection's count. */
export function makeSyllableConstraint(inletId, tokens) {
  const n = syllablesOfTokens(tokens) || 1;
  return { id: uid('c'), kind: 'syllables', inletId, label: 'syllables', min: n, max: n, threshold: 1 };
}

/** Stress pattern (0 = unstressed, 1 = stressed), starting from the selection's own rhythm. */
export function makeStressConstraint(inletId, tokens) {
  return { id: uid('c'), kind: 'stress', inletId, label: 'stress', mode: 'exactly', target: stressesOfTokens(tokens), range: STRESS_RANGE, labels: STRESS_LABELS, threshold: 1 };
}

/** Letters: acrostics ("starts with"), lipograms ("does not contain"), and so on. */
export function makeLettersConstraint(inletId, tokens) {
  const first = lettersOfText(tokens.map((t) => t.text).join('')).slice(0, 1);
  return { id: uid('c'), kind: 'letters', inletId, label: 'letters', mode: 'starts with', target: first, range: LETTERS, threshold: 1 };
}

/** Character count (letters and digits only, so spacing and punctuation do not count). */
export function makeCharsConstraint(inletId, tokens) {
  const n = lettersOfText(tokens.map((t) => t.text).join('')).length || 1;
  return { id: uid('c'), kind: 'chars', inletId, label: 'characters', min: 1, max: n, threshold: 1 };
}

export function makeLengthConstraint(inletId, tokens) {
  const n = numWords(tokens) || 1;
  return { id: uid('c'), kind: 'length', inletId, label: 'word count', min: 1, max: n, threshold: 1 };
}

/** Log-probability window; bounds are per-sub-token mean log-probs. */
export function makeProbConstraint(inletId) {
  return { id: uid('c'), kind: 'prob', inletId, label: 'probability', min: Math.log(1e-12), max: 0, threshold: 1 };
}

export function phonesOfTokens(tokens) {
  const out = [];
  for (const t of tokens) {
    if (t.isSpace) continue;
    const p = t.phonemes?.[0];
    if (p) out.push(...p.split(' ').filter(Boolean));
  }
  return out;
}

function tokenPhones(seq) {
  const out = [];
  for (const t of seq.tokens) {
    if (t.isSpace) continue;
    const p = t.phonemes?.[0];
    if (p) out.push(...p.split(' ').filter(Boolean));
  }
  return out;
}

/** Pronunciation summary of a reference word for the rhyme constraint (first CMUdict entry). */
export function referenceSound(word) {
  const w = (word ?? '').trim().split(/\s+/).pop() ?? '';
  if (!w) return null;
  const s = soundOut(w);
  if (!s.phonemes.length) return null;
  return { word: w.toLowerCase(), phonemes: s.phonemes, rhymingPart: s.rhymingPart };
}

const vowelsOf = (phones) => phones.filter((p) => VOWELS.has(p));
const consonantsOf = (phones) => phones.filter((p) => !VOWELS.has(p));
const firstConsonant = (phones) => phones.find((p) => !VOWELS.has(p)) ?? null;
/** Longest common suffix of two phone lists, as a fraction of the target's length. */
function suffixOverlap(arr, target) {
  if (!target.length) return 1;
  let n = 0;
  while (n < arr.length && n < target.length && arr[arr.length - 1 - n] === target[target.length - 1 - n]) n++;
  return n / target.length;
}

/** Rough syllable count for words CMUdict does not know: vowel groups, minus a silent final e. */
export function guessSyllables(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  let n = (w.match(/[aeiouy]+/g) ?? []).length;
  if (/[^aeiou]e$/.test(w) && n > 1) n--;
  return Math.max(1, n);
}

export function syllablesOfTokens(tokens) {
  let n = 0;
  for (const t of tokens) {
    if (!isWordToken(t)) continue;
    n += t.syllables?.[0] ?? guessSyllables(t.text);
  }
  return n;
}

/** Stress pattern of a token list as a list of '0'/'1' (secondary stress counts as stressed). */
export function stressesOfTokens(tokens) {
  const out = [];
  for (const t of tokens) {
    if (!isWordToken(t)) continue;
    const s = t.stresses?.[0];
    if (s != null) out.push(...s.replace(/2/g, '1').split(''));
    else out.push(...Array(guessSyllables(t.text)).fill('1'));
  }
  return out;
}

/** Lowercase letters and digits of a string, as a list. */
export const lettersOfText = (text) => (text.toLowerCase().match(/\p{L}|\p{N}/gu) ?? []);

function scoreRhyme(c, seq) {
  const ref = c.sound;
  if (!ref) return 1; // no known pronunciation for the reference: nothing to check
  const words = seq.tokens.filter(isWordToken);
  if (!words.length) return 0;
  const phonesOf = (t) => (t.phonemes?.[0] ?? '').split(' ').filter(Boolean);
  switch (c.mode) {
    case 'rhymes with': {
      const last = words[words.length - 1];
      if (last.text.toLowerCase() === ref.word) return 0; // a word does not rhyme with itself
      const parts = last.rhymingPart ?? [];
      if (parts.some((p) => ref.rhymingPart.includes(p))) return 1;
      const target = (ref.rhymingPart[0] ?? '').split(' ');
      return Math.max(0, ...parts.map((p) => suffixOverlap(p.split(' '), target)));
    }
    case 'assonance with': {
      const target = vowelsOf(ref.phonemes[0].split(' '));
      return inOrder(vowelsOf(words.flatMap(phonesOf)), target);
    }
    case 'consonance with': {
      const target = consonantsOf(ref.phonemes[0].split(' '));
      return inOrder(consonantsOf(words.flatMap(phonesOf)), target);
    }
    case 'alliterates with': {
      const onset = firstConsonant(ref.phonemes[0].split(' ')) ?? ref.phonemes[0].split(' ')[0];
      return words.some((t) => (t.phonemes ?? []).some((p) => p.split(' ')[0] === onset)) ? 1 : 0;
    }
    default:
      return 1;
  }
}

function rangeScore(n, min, max) {
  if (n >= min && n <= max) return 1;
  if (n > max) return Math.max(0, max / n);
  return Math.max(0, n / Math.max(1, min));
}

/** Score in [0,1]: how well `seq` satisfies `c`. */
export function scoreConstraint(c, seq) {
  const s = rawScore(c, seq);
  return c.negate ? 1 - s : s;
}

function rawScore(c, seq) {
  switch (c.kind) {
    case 'pos': {
      if (c.target.length === 0) return 1;
      const tags = seq.tokens.filter((t) => !t.isSpace).map((t) => t.pos);
      return MODE_FNS[c.mode](tags, c.target);
    }
    case 'sound': {
      if (c.target.length === 0) return 1;
      return MODE_FNS[c.mode](tokenPhones(seq), c.target);
    }
    case 'length':
      return rangeScore(numWords(seq.tokens), c.min, c.max);
    case 'syllables':
      return rangeScore(syllablesOfTokens(seq.tokens), c.min, c.max);
    case 'chars':
      return rangeScore(lettersOfText(seq.text ?? '').length, c.min, c.max);
    case 'stress': {
      if (c.target.length === 0) return 1;
      return MODE_FNS[c.mode](stressesOfTokens(seq.tokens), c.target);
    }
    case 'letters': {
      if (c.target.length === 0) return 1;
      return MODE_FNS[c.mode](lettersOfText(seq.text ?? ''), c.target);
    }
    case 'rhyme':
      return scoreRhyme(c, seq);
    case 'prob': {
      const v = seq.logProbMean;
      if (v == null) return 1; // unscored sequences are not penalised
      if (v >= c.min && v <= c.max) return 1;
      const size = Math.max(1e-6, c.max - c.min);
      const d = v < c.min ? c.min - v : v - c.max;
      return 1 / (1 + d / size);
    }
    default:
      return 1;
  }
}

/**
 * Score every sequence against the inlet's constraints. Returns
 * { accepted, rejected, all } sorted by `sortBy` ('total' | 'logProbMean').
 */
export function resolveConstraints(sequences, constraints, sortBy = 'total') {
  const accepted = [];
  const rejected = [];
  for (const seq of sequences) {
    let total = 0;
    let reject = false;
    seq.scores = {};
    for (const c of constraints) {
      const s = scoreConstraint(c, seq);
      seq.scores[c.id] = s;
      total += s;
      if (s < (c.threshold ?? 1)) reject = true;
    }
    seq.total = total;
    (reject ? rejected : accepted).push(seq);
  }
  const cmp = (a, b) => {
    if (sortBy === 'logProbMean') return (b.logProbMean ?? -1e9) - (a.logProbMean ?? -1e9);
    if (b.total !== a.total) return b.total - a.total;
    return (b.logProbMean ?? -1e9) - (a.logProbMean ?? -1e9);
  };
  accepted.sort(cmp);
  rejected.sort(cmp);
  return { accepted, rejected, all: [...accepted, ...rejected] };
}

/** Plain-English advice for prompt-driven wells (port of constraintRulez in queries.js). */
export function constraintAdvice(constraints) {
  const modeText = {
    contains: 'contain some of or all of the following',
    exactly: 'contain exactly the following',
    'starts with': 'start with the following',
    'ends with': 'end with the following',
    'in order': 'include the following sequence of',
  };
  const rhymeText = {
    'rhymes with': 'end with a word that rhymes with',
    'assonance with': 'share vowel sounds with',
    'consonance with': 'share consonant sounds with',
    'alliterates with': 'contain a word beginning with the same sound as',
  };
  let out = '';
  for (const c of constraints) {
    const not = c.negate ? 'not ' : '';
    if (c.kind === 'pos' && c.target.length) {
      out += `- If possible, some responses should ${not}${modeText[c.mode]} parts of speech ${c.target.join(' ')}. This is less important than sticking to the style.\n`;
    } else if (c.kind === 'length') {
      out += `- Each response should contain at least ${c.min} and at most ${c.max} words.\n`;
    } else if (c.kind === 'syllables') {
      out += c.min === c.max
        ? `- Each response should have exactly ${c.min} syllable${c.min === 1 ? '' : 's'}.\n`
        : `- Each response should have between ${c.min} and ${c.max} syllables.\n`;
    } else if (c.kind === 'chars') {
      out += `- Each response should be between ${c.min} and ${c.max} letters long, not counting spaces.\n`;
    } else if (c.kind === 'sound' && c.target.length) {
      out += `- If possible, some responses should ${not}contain words which ${modeText[c.mode]} ARPAbet phonemes: ${c.target.map(explainPhone).join(', ')}. For instance 'song' contains S AO NG. Do not mention or mark the phonemes.\n`;
    } else if (c.kind === 'rhyme' && c.reference) {
      out += `- Each response should ${not}${rhymeText[c.mode]} '${c.reference}'${c.mode === 'rhymes with' && !c.negate ? ` (but not '${c.reference}' itself)` : ''}.\n`;
    } else if (c.kind === 'stress' && c.target.length) {
      const beat = c.target.map((x) => (x === '1' ? 'DUM' : 'da')).join('-');
      out += `- If possible, responses should ${not}${modeText[c.mode]} syllable stresses, spoken as ${beat} (da = unstressed, DUM = stressed).\n`;
    } else if (c.kind === 'letters' && c.target.length) {
      const letters = c.target.join('');
      if (c.negate && c.mode === 'contains') out += `- Each response must avoid the letter${c.target.length === 1 ? '' : 's'} '${letters}' entirely.\n`;
      else out += `- Each response should ${not}${modeText[c.mode]} letters '${letters}'${c.mode === 'starts with' ? ' (its first letters)' : ''}.\n`;
    }
  }
  return out;
}

/** The largest word count any length constraint allows (or null). */
export function maxWordsAllowed(constraints) {
  const caps = constraints.filter((c) => c.kind === 'length' || c.kind === 'syllables' || c.kind === 'chars').map((c) => c.max);
  if (!caps.length) return null;
  return Math.max(1, Math.min(...caps));
}

export const isVowel = (p) => VOWELS.has(p);
export { isWordToken };
