// Pronunciation lookups over the CMU Pronouncing Dictionary (ARPAbet), a port
// of old/back-end/phones.py which used the `pronouncing` Python package.
// The dictionary is ~4.7 MB, so it is loaded lazily on first use.

let dictPromise = null;
let dict = null;

export function loadPhones() {
  if (!dictPromise) {
    dictPromise = import('cmu-pronouncing-dictionary').then((m) => {
      dict = m.dictionary;
      return dict;
    });
  }
  return dictPromise;
}

export const phonesReady = () => dict !== null;

export const VOWELS = new Set(['AA', 'AE', 'AH', 'AO', 'AW', 'AY', 'EH', 'ER', 'EY', 'IH', 'IY', 'OW', 'OY', 'UH', 'UW']);
export const CONSONANTS = ['B', 'CH', 'D', 'DH', 'F', 'G', 'HH', 'JH', 'K', 'L', 'M', 'N', 'NG', 'P', 'R', 'S', 'SH', 'T', 'TH', 'V', 'W', 'Y', 'Z', 'ZH'];
export const ARPABET = [...VOWELS, ...CONSONANTS];

export const noStress = (phones) => phones.replace(/\d/g, '');

/** All pronunciations for a word (with stress digits), or []. */
export function pronunciations(word) {
  if (!dict) return [];
  const w = word.toLowerCase().replace(/[^a-z'.\-]/g, '');
  if (!w) return [];
  const out = [];
  if (dict[w]) out.push(dict[w]);
  for (let i = 2; i < 6; i++) {
    const alt = dict[`${w}(${i})`];
    if (alt) out.push(alt);
  }
  return out;
}

/** Rhyming part: from the last stressed vowel (primary or secondary) to the end. */
export function rhymingPart(phones) {
  const parts = phones.split(' ');
  for (let i = parts.length - 1; i >= 0; i--) {
    if (/[12]$/.test(parts[i])) return parts.slice(i).join(' ');
  }
  return phones;
}

export const stresses = (phones) => phones.replace(/[^012]/g, '');
export const syllableCount = (phones) => stresses(phones).length;

/** Equivalent of pronouncing-based sound_out(): all fields the sound well shows. */
export function soundOut(word) {
  const base = pronunciations(word);
  return {
    phonemes: base.map(noStress),
    basePhones: base,
    rhymingPart: base.map((p) => noStress(rhymingPart(p))),
    stresses: base.map(stresses),
    syllables: base.map(syllableCount),
  };
}

/** Human explanation of an ARPAbet symbol, used in prompts and tooltips. */
export const PHONE_EXAMPLES = {
  AA: 'b(o)t', AE: 'b(a)t', AH: 'b(u)tt', AO: 'c(augh)t', AW: 'b(ou)t', AY: 'b(i)te',
  EH: 'b(e)t', ER: 'b(i)rd', EY: 'b(ai)t', IH: 'b(i)t', IY: 'b(ea)t', OW: 'b(oa)t',
  OY: 'b(o)y', UH: 'b(oo)k', UW: 'b(oo)t', B: '(b)uy', CH: '(Ch)ina', D: '(d)ie',
  DH: '(th)y', F: '(f)ight', G: '(g)uy', HH: '(h)igh', JH: '(j)ive', K: '(k)ite',
  L: '(l)ie', M: '(m)y', N: '(n)igh', NG: 'si(ng)', P: '(p)ie', R: '(r)ye', S: '(s)igh',
  SH: '(sh)y', T: '(t)ie', TH: '(th)igh', V: '(v)ie', W: '(w)ise', Y: '(y)acht', Z: '(z)oo', ZH: 'plea(s)ure',
};
export const explainPhone = (p) => (PHONE_EXAMPLES[p] ? `${p} as in ${PHONE_EXAMPLES[p]}` : p);
