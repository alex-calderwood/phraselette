// Well definitions: each well is a way of looking at (and rewriting) a phrase.
import { rainbowColors, glassify, grayer, deepen } from '../lib/colors.js';
import { randomRole } from '../lang/roles.js';
import { uid } from './tokens.js';
import { TEMPLATES } from '../models/prompts.js';

export const WELL_TYPES = ['words', 'context', 'sound', 'thesaurus', 'reader', 'dictionary'];
const palette = rainbowColors(WELL_TYPES.length + 1, 0.45);

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
    color: palette[4],
  },
  dictionary: {
    title: 'dictionary',
    description: "A stylistic dictionary. Describe it: 'an incorrect dictionary', 'an English to Greek dictionary'.",
    features: [],
    canSearch: true,
    roles: true,
    showItems: ['pos', 'sound'],
    color: palette[5],
  },
};
export const AGGREGATE_COLOR = palette[6];

export const VIEW_WELLS = new Set(['words', 'context', 'sound']);

export const FEATURE_LABELS = { pos: 'part of speech', length: 'word count', sound: 'sound', prob: 'probability', rhyme: 'rhyme', syllables: 'syllables', stress: 'stress', letters: 'letters', chars: 'characters' };

export function makeWell(type) {
  const def = WELL_DEFS[type];
  return {
    id: uid(type),
    type,
    active: type === 'words',
    collapsed: false,
    role: def.roles ? randomRole(type) : null,
    templates: def.roles ? { ...TEMPLATES[type] } : null,
  };
}

export function wellColor(type) {
  return WELL_DEFS[type]?.color ?? AGGREGATE_COLOR;
}

/** Style bundle for a well's panels and buttons. */
export function wellStyles(type, active = true) {
  const color = wellColor(type);
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
