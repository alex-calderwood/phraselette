// Plain data structures shared by the editor, wells and constraints.
// A Token is a word-ish span of the document (or of a suggested rephrasing);
// a Sequence is an ordered list of tokens making up one rephrasing.
let counter = 0;
export const uid = (prefix = 'id') => `${prefix}-${(++counter).toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/**
 * @typedef {Object} Token
 * @property {string} id
 * @property {string} text
 * @property {number} start   inclusive character offset
 * @property {number} end     exclusive character offset
 * @property {string} pos     universal POS tag, '_SP' for whitespace
 * @property {boolean} isSpace
 * @property {string[]} [phonemes]  ARPAbet pronunciations without stress
 * @property {string[]} [rhymingPart]
 * @property {number} [logProb]     summed log-prob of the sub-tokens that formed this word
 * @property {number} [logProbMean] per-sub-token mean, used for coloring
 */

export function makeToken(fields) {
  return { id: uid('t'), pos: 'X', isSpace: false, ...fields };
}

export function isWordToken(t) {
  return !t.isSpace && t.pos !== 'PUNCT' && /\p{L}|\p{N}/u.test(t.text);
}

/**
 * @typedef {Object} Sequence
 * @property {string} id
 * @property {Token[]} tokens
 * @property {string} text          text as it would appear in the document
 * @property {string} origin        well type that produced it
 * @property {string} originId      well id
 * @property {number|null} logProb  summed log-prob of generated sub-tokens
 * @property {number|null} logProbMean
 * @property {Object<string,number>} scores  constraint name -> [0,1]
 * @property {number} total          sum of constraint scores
 */

export function makeSequence(tokens, text, origin, originId, extra = {}) {
  return {
    id: uid('s'),
    tokens,
    text,
    origin,
    originId,
    logProb: null,
    logProbMean: null,
    scores: {},
    total: 0,
    ...extra,
  };
}

export const numWords = (tokens) => tokens.filter(isWordToken).length;

export function sequenceProbFromTokens(seq) {
  const withProb = seq.tokens.filter((t) => typeof t.logProb === 'number');
  if (withProb.length === 0) return seq;
  const logProb = withProb.reduce((a, t) => a + t.logProb, 0);
  const n = withProb.reduce((a, t) => a + (t.subTokenCount ?? 1), 0);
  seq.logProb = logProb;
  seq.logProbMean = logProb / Math.max(1, n);
  return seq;
}
