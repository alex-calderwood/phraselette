// Color helpers, ported from old/front-end/src/scripts/color.js (Phraselette paper build).
import chroma from 'chroma-js';

const rainbowCategory = chroma
  .scale(['red', 'yellow', 'green', 'blue', 'purple', 'cyan', 'coral', 'teal', 'orange', 'skyblue', 'burlywood'])
  .mode('lab');
const logScale = chroma.scale(['red', 'yellow', 'green']).mode('lab');
const zeroOneScale = chroma.scale(['red', 'white', 'green', 'green']).mode('lab');

const MIN_LOGPROB = -15;
const MID_LOGPROB = -5;
const MAX_LOGPROB = 0;
const BRIGHTEN = 2.5;

/** n pastel rainbow colors, violet → red. */
export function rainbowColors(n, pastel = 0.25) {
  const scale = chroma
    .scale(['#8B00FF', '#0000FF', '#00FF00', '#FFFF00', '#FF7F00', '#FF0000'])
    .mode('rgb');
  return Array.from({ length: n }, (_, i) => chroma.mix(scale(n === 1 ? 0 : i / (n - 1)), 'white', pastel).hex());
}

/** Fixed pastel palette for Universal POS tags so the editor coloring is legible. */
export const POS_COLORS = {
  NOUN: '#ffe08a', PROPN: '#ffc78a', VERB: '#ffb3b3', AUX: '#ffd1d1', ADJ: '#b6e7b0', ADV: '#d4f0a8',
  ADP: '#bcd9ff', DET: '#dbe7ff', PRON: '#e2c6ff', PART: '#ffd6f2', CCONJ: '#c9f2ee', SCONJ: '#b8ebe4',
  NUM: '#f0d9b5', INTJ: '#ffc9e0', SYM: '#e6e6e6', PUNCT: '#f1f1f1', X: '#ececec', _SP: 'transparent',
};

/** Stable pastel color for a category label (POS tag, rhyme part…). */
export function categoryColor(word) {
  if (!word) return 'white';
  if (POS_COLORS[word]) return POS_COLORS[word];
  let hash = 0;
  for (let i = 0; i < word.length; i++) hash = (hash * 31 + word.charCodeAt(i)) % 256;
  return chroma.mix(rainbowCategory(hash / 255), 'white', 0.45).hex();
}

/** Color for a (mean) token log-probability: red (unlikely) → green (likely). */
export function logProbColor(logProb) {
  if (logProb == null || Number.isNaN(logProb)) return 'white';
  const c = Math.max(MIN_LOGPROB, Math.min(MAX_LOGPROB, logProb));
  const t = c <= MID_LOGPROB
    ? ((c - MIN_LOGPROB) / (MID_LOGPROB - MIN_LOGPROB)) * 0.5
    : 0.5 + ((c - MID_LOGPROB) / (MAX_LOGPROB - MID_LOGPROB)) * 0.5;
  return logScale(t).brighten(BRIGHTEN).hex();
}

export function zeroToOneColor(v) {
  if (v == null) return 'white';
  return zeroOneScale(Math.max(0, Math.min(1, v))).brighten(BRIGHTEN).hex();
}

function interp(a, b, ratio = 0.5, alpha = null) {
  const c1 = chroma(a);
  const c2 = chroma(b);
  const [r1, g1, b1] = c1.rgb();
  const [r2, g2, b2] = c2.rgb();
  const out = chroma(
    Math.round(r1 + (r2 - r1) * ratio),
    Math.round(g1 + (g2 - g1) * ratio),
    Math.round(b1 + (b2 - b1) * ratio),
  );
  return out.alpha(alpha ?? c1.alpha()).css();
}

/** Mix towards white and make translucent: the "glass" look. */
export const glassify = (color, alpha = 0.5) => interp(color, 'rgb(255,255,255)', 0.3, alpha);
export const grayer = (color, alpha = 0.5) => interp(color, 'rgb(50,50,50)', 0.7, alpha);
export const deepen = (color) => interp(color, 'rgb(0,0,0)', 1 / 3);

/** Human friendly log-probability label, e.g. -7.2 */
export function humanLog(logProb) {
  if (logProb == null || Number.isNaN(logProb)) return '';
  if (logProb === 0) return '0';
  return logProb.toFixed(Math.abs(logProb) < 10 ? 1 : 0);
}
