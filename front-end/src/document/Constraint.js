import { overlaps, getUniqueUUID } from '../scripts/utils.js';

export class Constraint {
  constructor(name, dataType) {
    this.name = name;
    this.dataType = dataType;
    this.id = getUniqueUUID();
    this.span = null;
    this.isPre = false;     // can the constraint be computed quickly?
    this.targetSpan = null; // what is the goal of the constraint 
    this.range = null;      // what are the possible values of the constraint
  }

  /* 
  * Return a [0-1] score indicating how much the span coheres to the constraint target. 
  * 0 means the span does not match the constraint
  * 1 means the span perfectly coheres to the constraint
  */
  async evaluate(span, document) {
    return 0;
  }

  /*
  * Does the constraint apply to the given span?
  * TODO perhaps we want to also pass in a token here... since Span character ids might
  * change as the text edits... need to think through this
  */
  applies(span) {
    return true;
    // TODO implement this kind of logic...
    // if (this.span === null) {
    //   return false;
    // }

    // return overlaps(this.span, span);
  }
}

export class TestConstraint extends Constraint {
  constructor() {
    super('test', 'test');
  }

  async evaluate(span, document) {
    console.log('evaluating', span, document);

    // this is a placeholder
    let token = span.span[0];
    let letter = token.text && token.text.length > 0 ? token.text.trim()[0] : 'a';
    let number = parseInt(letter, 36);
    return number || 0;
  }

  applies(span) {
    return true;
  }
}

/*
 * A categorical constraint is one that can restrict text based on a token's 'category'
 * such as part of speech or rhyme scheme
*/
export class CategoricalConstraint extends Constraint {
  constructor(name, dataType) {
    super(name, dataType);
    this.targetFeature = null;
    this.range = null;
    this.defaultTarget = null;
  }

  async evaluate(span, document) {
    return 0;
  }

  updateTarget(index, newValue) {
    if (this.targetSpan == null || this.targetSpan.length === 0) {
      console.log('no target span to update for constraint', this);
      return;
    }
    this.targetSpan[index][this.targetFeature] = newValue;
    return this.targetSpan;
  }

  addTarget(newTarget=null) {
    if (this.defaultTarget === null) {
      console.error('no default target for constraint', this);
      return;
    }

    if (this.targetSpan == null) {
      this.targetSpan = [];
    }

    if (newTarget === null) {
      newTarget = this.defaultTarget;
    }

    let newIndex = this.targetSpan.length;
    this.targetSpan.push({ [this.targetFeature]: newTarget, index: newIndex });

    return this.targetSpan;
  }

  deleteTarget() {
    if (this.targetSpan == null || this.targetSpan.length === 0) {
      return;
    }
    this.targetSpan.pop();
    return this.targetSpan;
  }
}

export class POSConstraint extends CategoricalConstraint { // may want to make a 'categorical constraint'
  constructor(targetPOSPhrase) {
    super('POS', 'category');
    this.targetSpan = targetPOSPhrase.map((pos, i) => { return { pos: pos, index: i }; });
    this.targetFeature = 'pos';
    this.defaultTarget = 'NN';
    this.range = Object.keys({// https://github.com/explosion/spaCy/blob/master/spacy/glossary.py
      "AFX": "affix",
      "CC": "conjunction, coordinating",
      "CD": "cardinal number",
      "DT": "determiner",
      "EX": "existential there",
      "FW": "foreign word",
      "HYPH": "punctuation mark, hyphen",
      "IN": "conjunction, subordinating or preposition",
      "JJ": "adjective (English), other noun-modifier (Chinese)",
      "JJR": "adjective, comparative",
      "JJS": "adjective, superlative",
      "LS": "list item marker",
      "MD": "verb, modal auxiliary",
      "NIL": "missing tag",
      "NN": "noun, singular or mass",
      "NNP": "noun, proper singular",
      "NNPS": "noun, proper plural",
      "NNS": "noun, plural",
      "PDT": "predeterminer",
      "POS": "possessive ending",
      "PRP": "pronoun, personal",
      "PRP$": "pronoun, possessive",
      "RB": "adverb",
      "RBR": "adverb, comparative",
      "RBS": "adverb, superlative",
      "RP": "adverb, particle",
      "TO": 'infinitival "to"',
      "UH": "interjection",
      "VB": "verb, base form",
      "VBD": "verb, past tense",
      "VBG": "verb, gerund or present participle",
      "VBN": "verb, past participle",
      "VBP": "verb, non-3rd person singular present",
      "VBZ": "verb, 3rd person singular present",
      "WDT": "wh-determiner",
      "WP": "wh-pronoun, personal",
      "WP$": "wh-pronoun, possessive",
      "WRB": "wh-adverb",
      "SP": "space (English), sentence-final particle (Chinese)",
      "ADD": "email",
      "NFP": "superfluous punctuation",
      "GW": "additional word in multi-word expression",
      "XX": "unknown",
      "BES": 'auxiliary "be"',
      "HVS": 'forms of "have"',
      "_SP": "whitespace",
    })
  }

  async evaluate(newSpan, document) {
    if (newSpan.length === 0) {
      return 0;
    }
    if (this.targetSpan === null || this.targetSpan.length === 0) {
      return 0;
    }

    // console.log('evaluating', newSpan)

    // zip through the span tokens and the tokens to evaluate
    let matches = 0;
    for (let i = 0; i < newSpan.length; i++) {
      let newToken = newSpan[i];
      let baselineTag = this.targetSpan[i][this.targetFeature];
      // console.log('match', newToken.text, newToken.pos, baselineTag, newToken.pos === baselineTag);
      if (newToken.pos == baselineTag) {
        matches += 1;
      }
    }
    let avg = matches / newSpan.length;
    // console.log("comparing", newSpan, this.targetSpan, avg);
    return avg;
  }
}


