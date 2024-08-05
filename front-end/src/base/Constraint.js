import { getUniqueUUID } from '../scripts/utils.js';
import { Feature } from './Feature.js';

// feature -> constraint mapping
export function makeConstraint(feature, target) {
  let name = feature.name;
  let dataType = feature.dataType;
  switch (name) {
    case 'pos':
      target = target.map(token => token?.pos);
      return new POSConstraint(target);
    case 'rhyme':
      target = target.map(token => token?.sound?.rhyming_part[0] || RhymeConstraint.defaultTarget);
      return new RhymeConstraint(target);
    case 'sound':
      let soundTarget = target.map((token) => {
        let phonemes = token?.sound?.phonemes; 
        if (phonemes && phonemes.length > 0) {
          return phonemes[0].split();
        }
        return SoundConstraint.defaultTarget;
      });
      console.log("sound constraint", target, soundTarget)
      return new SoundConstraint(soundTarget);
  }
  
  switch(dataType) {
    case 'number':
      return new NumericalRangeConstraint(name, feature); // name, feature, targetMin=null, targetMax=null
    case 'category':
      return new CategoricalConstraint(name, feature);
  }

  console.error('Could not make constraint for feature:', feature);
  return null;
}

export class Constraint {
  constructor(name, feature) {
    this.name = name;
    this.feature = feature;
    this.dataType = feature.dataType; // depracate this
    this.id = getUniqueUUID();
    this.span = null;
    this.isPre = false;         // can the constraint be computed quickly?
    this.range = null;          // what are the possible values of the constraint
    this.filterThreshold = 0;  // what is the minimum score to consider the constraint satisfied
  }

  /*
  * Return a [0-1] score indicating how much the token sequence coheres to the constraint target. 
  * 0 means the span does not match the constraint
  * 1 means the span perfectly coheres to the constraint
  */
  async getScore(sequence, document) {
    return 0;
  }

  evaluate(score, sequence, document) {
    return score > this.filterThreshold;
  }

  /*
  * Does the constraint apply to the given span?
  */
  applies(span) {
    return true;
    // TODO implement this kind of logic...
      if (this.span === null) {
        return false;
      }

      return overlaps(this.span, span);
  }

  static subsetByFeatures(constraints, features) { 
    // could also hard code the mapping for a speedup
    console.log("subset by", constraints, features)
    return constraints.filter((constraint) => { return features.includes(constraint.feature); });
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

  async getScore(sequence, document) {
    // this is a placeholder
    let token = sequence.span[0];
    let letter = this.firstLetterInToken(token);
    if (letter === this.targetLetter) {
      return 1;
    }
    return 0;
  }
}

/*
 * A categorical constraint is one that can restrict text based on a token's 'category'
 * such as part of speech or rhyme scheme
*/
export class CategoricalConstraint extends Constraint {
  constructor(name, feature, defaultTarget=null) {
    super(name, feature);
    this.defaultTarget = defaultTarget;
    this.targetSequence = null; // what is the goal of the constraint 
    this.range = null;
  }

  async getScore(sequence, document) {
    if (sequence === null || sequence.span.length === 0) {
      return 0;
    }

    if (this.targetSequence === null || this.targetSequence.length === 0) {
      return 0;
    }

    let tokens = sequence.span;

    // zip through the span tokens and the tokens to evaluate
    let matches = 0;
    for (let i = 0; i < tokens.length; i++) {
      let newToken = tokens[i];
      let targetToken = this.targetSequence[i];
      if (targetToken === undefined) {
        console.error('target token is undefined mismatch in token lengths?', i, this.targetSequence, this.newSpan);
        continue;
      }
      let baselineTag = targetToken[this.feature.name];
      let newTokenTag = newToken[this.feature.name];
      if (newTokenTag === baselineTag) {
        matches += 1;
      }
    }
    let avg = matches / tokens.length;
    return avg;
  }

  updateTarget(index, newValue) {
    if (this.targetSequence == null || this.targetSequence.length === 0) {
      console.log('no target span to update for constraint', this);
      return;
    }
    this.targetSequence[index][this.feature.name] = newValue;
    return this.targetSequence;
  }

  addTarget(newTarget=null) {
    if (this.defaultTarget === null) {
      console.error('no default target for constraint', this);
      return this.targetSequence;
    }

    if (this.targetSequence == null) {
      this.targetSequence = [];
    }

    if (newTarget === null) {
      newTarget = this.defaultTarget;
    }

    let newIndex = this.targetSequence.length;
    this.targetSequence.push({ [this.feature.name]: newTarget, index: newIndex });

    return this.targetSequence;
  }

  deleteTarget() {
    if (this.targetSequence === null || this.targetSequence.length === 0) {
      // nothing
    } else {
      this.targetSequence.pop();
    }
    return this.targetSequence;
  }
}

export class POSConstraint extends CategoricalConstraint { // may want to make a 'categorical constraint'
  defaultTarget = 'NN';
  
  constructor(targetPOSPhrase) {
    super('pos', Feature.POS, POSConstraint.defaultTarget);
    this.targetSequence = targetPOSPhrase.map((pos, i) => { return { pos: pos, index: i }; });
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
export class RhymeConstraint extends CategoricalConstraint {
  defaultTarget = 'AA'; // TODO

  constructor(targetPhones) {
    super('rhyme', Feature.Rhyme, RhymeConstraint.defaultTarget);

    this.targetSequence = targetPhones.map((rhyme, i) => { return { rhyme: rhyme, index: i }; });
    this.range = ["AA", "AE", "AH", "AO", "AW", "AX", "AXR", "AY", "EH", "ER", "EY", "IH", "IX", "IY", "OW", "OY", "UH", "UW", "UX", "B", "CH", "D", "DH", "DX", "EL", "EM", "EN", "F", "G", "HH", "JH", "K", "L", "M", "N", "NX", "P", "Q", "R", "S", "SH", "T", "TH", "V", "W", "WH", "Y", "Z", "ZH"];
  }
}

class SoundConstraint extends CategoricalConstraint { // untested
  defaultTarget = 'AA'; // TODO
  constructor(targetPhones) {
    super('sound', Feature.Sound, SoundConstraint.defaultTarget);
    this.targetSequence = targetPhones.split(" ").map((sound, i) => { return { sound: sound, index: i }; });
    console.log('target sequence', this.targetSequence)
    // ARPANET 0's 
    // 0 typically indicates an unstressed syllable
    // 1 typically indicates a primary stressed syllable
    // 2 is sometimes used to indicate secondary stress
    this.range = ["AA", "AE", "AH", "AO", "AW", "AX", "AXR", "AY", "EH", "ER", "EY", "IH", "IX", "IY", "OW", "OY", "UH", "UW", "UX", "B", "CH", "D", "DH", "DX", "EL", "EM", "EN", "F", "G", "HH", "JH", "K", "L", "M", "N", "NX", "P", "Q", "R", "S", "SH", "T", "TH", "V", "W", "WH", "Y", "Z", "ZH"];
  }
}

export class NumericalRangeConstraint extends Constraint {
  defaultRange = [0, 1];

  constructor(name, feature, targetMin=0, targetMax=1) {
    super(name, "number");
    this.feature = feature
    this.range = this.defaultRange;
    this.targetMin = targetMin;
    this.targetMax = targetMax;
  }

  async getScore(sequence, document) {
    if (this.targetMin === null || this.targetMax === null) {
      console.error('Must specify a target for constraint:', this);
      return 0;
    }

    let value = sequence.getAttribute(this.feature.name) || 0;
    if (value < this.targetMin || value > this.targetMax) {
      return 0;
    }
    return 1;
  }

  getValue(token) {
    return token[this.feature] || 0;
  }

  updateTargetMin(newValue) {
    this.targetMin = newValue;
    return this.targetMin;
  }

  updateTargetMax(newValue) {
    this.targetMax = newValue;
    return this.targetMax;
  }
}