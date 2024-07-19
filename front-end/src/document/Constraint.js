import { overlaps, getUniqueUUID } from '../scripts/utils.js';

export function makeConstraint(feature, target, dataType) {
  feature = feature.toLowerCase();
  switch (feature) {
    case 'pos':
      target = target.map(token => token.pos);
      return new POSConstraint(target);
    case 'sound':
      target = target.map(token => token.sound.rhyme);
      return new RhymeConstraint(target);
    default:
      return new Constraint(feature, dataType);
  }
}

export class Constraint {
  constructor(name, dataType) {
    this.name = name;
    this.dataType = dataType;
    this.id = getUniqueUUID();
    this.span = null;
    this.isPre = false;     // can the constraint be computed quickly?
    this.targetSequence = null; // what is the goal of the constraint 
    this.range = null;      // what are the possible values of the constraint
  }

  /* 
  * Return a [0-1] score indicating how much the token sequence coheres to the constraint target. 
  * 0 means the span does not match the constraint
  * 1 means the span perfectly coheres to the constraint
  */
  async evaluate(sequence, document) {
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

export class AlliterationConstraint extends Constraint {
  constructor(targetToken) {
    super('test', 'test');
    this.targetLetter = this.firstLetterInToken(targetToken);
  }

  firstLetterInToken(token) {
    let letter = token.text && token.text.length > 0 ? token.text.trim()[0] : '';
    return letter;
  }

  async evaluate(sequence, document) {
    // this is a placeholder
    let token = sequence.span[0];
    let letter = this.firstLetterInToken(token);
    if (letter === this.targetLetter) {
      return 1;
    }
    return 0;
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
  constructor(name, dataType, defaultTarget=null) {
    super(name, dataType);
    this.defaultTarget = defaultTarget;
    this.targetFeature = null;
    this.range = null;
  }

  async evaluate(sequence, document) {
    if (this.targetFeature === null) {
      console.error('Must specify a feature constrain for:', this);
      return 0;
    }

    if (sequence.length === 0) {
      return 0;
    }
    if (this.targetSequence === null || this.targetSequence.length === 0) {
      return 0;
    }

    // zip through the span tokens and the tokens to evaluate
    let matches = 0;
    for (let i = 0; i < sequence.length; i++) {
      let newToken = sequence[i];
      let targetToken = this.targetSequence[i];
      if (targetToken === undefined) {
        console.error('target token is undefined mismatch in token lengths?', i, this.targetSequence, this.newSpan);
        continue;
      }
      let baselineTag = targetToken[this.targetFeature];
      let newTokenTag = newToken[this.targetFeature];
      if (newTokenTag === baselineTag) {
        matches += 1;
      }
    }
    let avg = matches / sequence.length;
    console.log('evaluating', sequence, this.targetSequence, avg);
    return avg;
  }

  updateTarget(index, newValue) {
    if (this.targetSequence == null || this.targetSequence.length === 0) {
      console.log('no target span to update for constraint', this);
      return;
    }
    this.targetSequence[index][this.targetFeature] = newValue;
    return this.targetSequence;
  }

  addTarget(newTarget=null) {
    if (this.defaultTarget === null) {
      console.error('no default target for constraint', this);
      return;
    }

    if (this.targetSequence == null) {
      this.targetSequence = [];
    }

    if (newTarget === null) {
      newTarget = this.defaultTarget;
    }

    let newIndex = this.targetSequence.length;
    this.targetSequence.push({ [this.targetFeature]: newTarget, index: newIndex });

    return this.targetSequence;
  }

  deleteTarget() {
    if (this.targetSequence == null || this.targetSequence.length === 0) {
      return;
    }
    this.targetSequence.pop();
    return this.targetSequence;
  }
}

export class POSConstraint extends CategoricalConstraint { // may want to make a 'categorical constraint'
  constructor(targetPOSPhrase) {
    super('POS', 'category');
    this.targetSequence = targetPOSPhrase.map((pos, i) => { return { pos: pos, index: i }; });
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
}

/* 
 * Should this be responsible for both meter and rhyme?  
*/
class RhymeConstraint extends CategoricalConstraint {
  constructor(targetPhones) {
    super('rhyme', 'category');
    this.targetFeature = 'rhyme';
    this.defaultTarget = 'AA1'; // TODO
    this.targetSequence = targetPhones.map((rhyme, i) => { return { rhyme: rhyme, index: i }; });
    this.range = ["AA", "AE", "AH", "AO", "AW", "AX", "AXR", "AY", "EH", "ER", "EY", "IH", "IX", "IY", "OW", "OY", "UH", "UW", "UX", "B", "CH", "D", "DH", "DX", "EL", "EM", "EN", "F", "G", "HH", "JH", "K", "L", "M", "N", "NX", "NX", "P", "Q", "R", "S", "SH", "T", "TH", "V", "W", "WH", "Y", "Z", "ZH"];
  }
}