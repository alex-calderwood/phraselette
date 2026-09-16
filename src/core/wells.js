// Well definitions: each well is a way of looking at (and rewriting) a phrase.
import { rainbowColors, glassify, grayer, deepen, familyShade } from '../lib/colors.js';
import { randomRole } from '../lang/roles.js';
import { uid } from './tokens.js';
import { TEMPLATES } from '../models/prompts.js';

export const WELL_TYPES = ['words', 'context', 'sieve', 'sound', 'thesaurus', 'reader', 'dictionary'];
const palette = rainbowColors(7, 0.45); // fixed at the original six wells + aggregate so adding a type does not recolor the others

/** Wells that search the probabilities model directly (the sieve is the context well with constraints applied while searching). */
export const CONTEXT_LIKE = new Set(['context', 'sieve']);

export const WELL_DEFS = {
  words: {
    title: 'words',
    description: 'Part of speech and word count: view them, lock them as constraints. Always on.',
    features: ['pos', 'length'],
    canSearch: false,
    roles: false,
    showItems: ['pos'],
    undestroyable: true,
    color: palette[0],
  },
  context: {
    title: 'context',
    description: 'What a language model expects here. With a context-fill model, words that fit both sides of the inlet; otherwise the likeliest continuations of the preceding text, with a histogram of their probabilities and a probability range constraint.',
    features: ['prob'],
    canSearch: true,
    roles: false,
    showItems: ['prob'],
    color: palette[1],
  },
  sieve: {
    title: 'sieve',
    description: 'The context well with the constraints applied while it searches, not only afterwards: letters (starts with, must not contain), sounds (starts with, exactly, must not contain) and the probability window prune tokens as the model proposes them, so a wide search reaches words the plain context well never surfaces. The well lists which of the inlet\'s constraints it can apply; the rest sift the results.',
    features: ['prob'],
    canSearch: true,
    roles: false,
    showItems: ['prob'],
    color: familyShade(palette[1], 2), // the context well's cooler sibling
  },
  sound: {
    title: 'sound',
    description: 'Phonemes (ARPAbet) of each word, and constraints over sounds: start with a K, rhyme with the end of the selection, contain a given cluster.',
    features: ['sound'],
    canSearch: false,
    roles: false,
    showItems: ['sound'],
    color: palette[2],
  },
  thesaurus: {
    title: 'thesaurus',
    description: "A stylistic thesaurus. Describe the kind you want in plain text: 'a wizard's spellbook', 'a thesaurus of meaningless words'.",
    features: [],
    canSearch: true,
    roles: true,
    showItems: ['pos', 'sound', 'prob'],
    color: palette[3],
  },
  reader: {
    title: 'reader',
    description: 'An imagined reader who comments on the selection, then offers rewrites in that spirit.',
    features: [],
    canSearch: true,
    roles: true,
    showItems: ['pos', 'sound', 'prob'],
    color: '#fffaad', // the rainbow's slot here is yellow-orange; pulled to a clearer yellow (hue 56°) so it reads apart from the dictionary
  },
  dictionary: {
    title: 'dictionary',
    description: "A stylistic dictionary. Describe it: 'an incorrect dictionary', 'an English to Greek dictionary'.",
    features: [],
    canSearch: true,
    roles: true,
    showItems: ['pos', 'sound'],
    color: '#ffb0ad', // the rainbow's slot here is salmon; pulled to red (hue 2°)
  },
};
export const AGGREGATE_COLOR = palette[6];

export const VIEW_WELLS = new Set(['words', 'context', 'sound']);

/**
 * Search settings per well type and mode (the well's `search` field picks the
 * mode, `params[mode]` overrides the defaults). Beam modes run src/models/beam.js;
 * 'fast' is the top-K-then-greedy loop in lm.js; 'sample' is plain sampling.
 */
export const SEARCH_DEFAULTS = {
  context: {
    beam: { beams: 24, groups: 6, diversity: 1.0, lengthPenalty: 1.0, noRepeat: 2 },
    fast: { k: 24 },
  },
  sieve: { // wider than the context well: the gate cuts the space first, the width then spreads over what is left
    beam: { beams: 48, groups: 12, diversity: 1.0, lengthPenalty: 1.0, noRepeat: 2 },
    fast: { k: 48 },
  },
  thesaurus: {
    beam: { beams: 4, groups: 4, perBeam: 4, diversity: 1.0, lengthPenalty: 1.0, tokensPerEntry: 15 },
    sample: { temperature: 1.0, topP: 1.0, maxNewTokens: 320 },
  },
};

/** The well's effective search mode and settings, with `groups` forced to divide `beams`. */
/** Search mode used when the well has not chosen one. */
export const DEFAULT_SEARCH = { context: 'beam', sieve: 'beam', thesaurus: 'beam' };

export function searchSettings(well) {
  const modes = SEARCH_DEFAULTS[well.type] ?? {};
  const mode = well.search ?? DEFAULT_SEARCH[well.type] ?? 'beam';
  const p = { mode, ...(modes[mode] ?? {}) };
  for (const [k, v] of Object.entries(well.params?.[mode] ?? {})) if (Number.isFinite(v)) p[k] = v; // a cleared field never overrides a default
  if (p.beams != null) {
    p.beams = Math.max(1, Math.round(p.beams));
    p.groups = Math.min(Math.max(1, Math.round(p.groups ?? p.beams)), p.beams);
    while (p.beams % p.groups) p.groups--;
  }
  if (p.perBeam != null) p.perBeam = Math.max(1, Math.round(p.perBeam));
  return p;
}

export const FEATURE_LABELS = { pos: 'part of speech', length: 'word count', sound: 'sound', prob: 'probability', rhyme: 'rhyme', syllables: 'syllables', stress: 'stress', letters: 'letters', chars: 'characters', semantic: 'semantic similarity' };

export function makeWell(type) {
  const def = WELL_DEFS[type];
  return {
    id: uid(type),
    type,
    active: type === 'words',
    collapsed: false,
    shade: 0, // which sibling color this well wears; the n-th open well of a type gets shade n
    role: def.roles ? randomRole(type) : null,
    templates: def.roles ? { ...TEMPLATES[type] } : null,
  };
}

/** A well type's family color, or the shade-th sibling of it (see familyShade). */
export function wellColor(type, shade = 0) {
  return familyShade(WELL_DEFS[type]?.color ?? AGGREGATE_COLOR, shade);
}

/** Style bundle for a well's panels and buttons. */
export function wellStyles(type, active = true, shade = 0) {
  const color = wellColor(type, shade);
  const textColor = active ? deepen(color) : grayer(color);
  return {
    color,
    textColor,
    panel: { background: active ? glassify(color, 0.4) : grayer(color, 0.3), color: textColor },
    button: { background: active ? glassify(color, 0.6) : grayer(color, 0.4), color: textColor },
    solid: glassify(color, 0.8),
    border: color,
  };
}
