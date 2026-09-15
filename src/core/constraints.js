// Constraints narrow the space of rephrasings a well may return. They are
// scored 0..1 after generation (all of them) and some also give "advice" to the
// generators beforehand (word count → search depth; POS/sound → prompt text).
// Port of old/front-end/src/base/Constraint.js with the same scoring maths.
import { uid, numWords, isWordToken } from './tokens.js';
import { UPOS_TAGS } from '../lang/pos.js';
import { ARPABET, VOWELS, explainPhone } from '../lang/phones.js';

export const MODES = ['contains', 'exactly', 'starts with', 'ends with', 'in order'];

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
 * @property {'pos'|'sound'|'length'|'prob'} kind
 * @property {string} inletId
 * @property {string} label
 */

export function makePosConstraint(inletId, tokens) {
  const target = tokens.filter((t) => !t.isSpace && t.pos !== '_SP').map((t) => t.pos);
  return { id: uid('c'), kind: 'pos', inletId, label: 'part of speech', mode: 'contains', target, range: UPOS_TAGS, threshold: 1 };
}

export function makeSoundConstraint(inletId, tokens) {
  const target = phonesOfTokens(tokens);
  return { id: uid('c'), kind: 'sound', inletId, label: 'sound', mode: 'contains', target, range: ARPABET, threshold: 1, reference: '' };
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

/** Score in [0,1]: how well `seq` satisfies `c`. */
export function scoreConstraint(c, seq) {
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
    case 'length': {
      const n = numWords(seq.tokens);
      if (n >= c.min && n <= c.max) return 1;
      if (n > c.max) return Math.max(0, c.max / n);
      return Math.max(0, n / Math.max(1, c.min));
    }
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
  let out = '';
  for (const c of constraints) {
    if (c.kind === 'pos' && c.target.length) {
      out += `- If possible, some responses should ${modeText[c.mode]} parts of speech ${c.target.join(' ')}. This is less important than sticking to the style.\n`;
    } else if (c.kind === 'length') {
      out += `- Each response should contain at least ${c.min} and at most ${c.max} words.\n`;
    } else if (c.kind === 'sound' && c.target.length) {
      out += `- If possible, some responses should contain words which ${modeText[c.mode]} ARPAbet phonemes: ${c.target.map(explainPhone).join(', ')}. For instance 'song' contains S AO NG. Do not mention or mark the phonemes.\n`;
    }
  }
  return out;
}

/** The largest word count any length constraint allows (or null). */
export function maxWordsAllowed(constraints) {
  const ls = constraints.filter((c) => c.kind === 'length');
  if (!ls.length) return null;
  return Math.min(...ls.map((c) => c.max));
}

export const isVowel = (p) => VOWELS.has(p);
export { isWordToken };
