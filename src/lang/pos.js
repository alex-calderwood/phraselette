// Universal part-of-speech tags (the set spaCy used in the paper build) and a
// mapping from Penn Treebank tags for the optional transformer tagger.
export const UPOS = {
  ADJ: 'adjective',
  ADP: 'adposition',
  ADV: 'adverb',
  AUX: 'auxiliary',
  CCONJ: 'coordinating conjunction',
  DET: 'determiner',
  INTJ: 'interjection',
  NOUN: 'noun',
  NUM: 'numeral',
  PART: 'particle',
  PRON: 'pronoun',
  PROPN: 'proper noun',
  PUNCT: 'punctuation',
  SCONJ: 'subordinating conjunction',
  SYM: 'symbol',
  VERB: 'verb',
  X: 'other',
  _SP: 'space',
};

export const UPOS_TAGS = Object.keys(UPOS).filter((t) => t !== '_SP');

const PTB_TO_UPOS = {
  CC: 'CCONJ', CD: 'NUM', DT: 'DET', EX: 'PRON', FW: 'X', IN: 'ADP',
  JJ: 'ADJ', JJR: 'ADJ', JJS: 'ADJ', MD: 'AUX', NN: 'NOUN', NNS: 'NOUN',
  NNP: 'PROPN', NNPS: 'PROPN', PDT: 'DET', POS: 'PART', PRP: 'PRON', 'PRP$': 'PRON',
  RB: 'ADV', RBR: 'ADV', RBS: 'ADV', RP: 'PART', SYM: 'SYM', TO: 'PART', UH: 'INTJ',
  VB: 'VERB', VBD: 'VERB', VBG: 'VERB', VBN: 'VERB', VBP: 'VERB', VBZ: 'VERB',
  WDT: 'DET', WP: 'PRON', 'WP$': 'PRON', WRB: 'ADV', O: 'X',
  '.': 'PUNCT', ',': 'PUNCT', ':': 'PUNCT', '``': 'PUNCT', "''": 'PUNCT', '-LRB-': 'PUNCT', '-RRB-': 'PUNCT',
};

export function ptbToUpos(tag) {
  if (!tag) return 'X';
  if (UPOS[tag]) return tag;
  return PTB_TO_UPOS[tag] ?? (/^[^\w\s]+$/.test(tag) ? 'PUNCT' : 'X');
}
