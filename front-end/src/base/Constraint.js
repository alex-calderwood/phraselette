import { getUniqueUUID } from '../scripts/utils.js';
import { Feature } from './Feature.js';

// feature -> constraint mapping
export function makeConstraint(feature, target) {
  let name = feature.name;
  let dataType = feature.dataType;
  switch (name) {
    case 'pos':
      target = target.map(token => token.getAttribute('pos'));
      return new POSConstraint(target);
    case 'rhyme':
      target = target.map(token => token.getAttribute('rhyming_part', [])[0] || RhymeConstraint.defaultTarget);
      return new RhymeConstraint(target);
    case 'sound':
      let firstPhonemesPerToken = target.map((token) => {
        let phonemes = token.getAttribute('phonemes', []); 
        if (phonemes && phonemes.length > 0) { return phonemes[0]; }
        return SoundConstraint.defaultTarget;
      });
      let finalTarget = firstPhonemesPerToken.map((tokenPhonemes) => {
        return tokenPhonemes.split(' ');
      }).flat().filter(phoneme => phoneme && phoneme.length > 0);

      return new SoundConstraint(finalTarget);
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
  static modes = ['contains', 'exactly', 'starts with', 'ends with', 'in order'];
  
  constructor(name, feature, defaultTarget=null) {
    super(name, feature);
    this.defaultTarget = defaultTarget;
    this.targetSequence = null; // what is the goal of the constraint 
    this.range = null;
    this.mode = CategoricalConstraint.modes[0];
    this.flatten = false;
    this.ignore = []; // features to disregard
}

  async getScore(sequence, document) {
    console.log('score mode', this.mode, sequence.textContent);

    if (sequence === null || sequence.span.length === 0 || this.targetSequence === null || this.targetSequence.length === 0) {
      return 0;
    }
  
    let tokens = sequence.span;
    let tokenFeatures = this.flatten
      ? tokens.flatMap(t => this._getAttribute(t, this.feature.name))
      : tokens.map(t => this._getAttribute(t, this.feature.name));
    tokenFeatures = tokenFeatures.filter(pos => !this.ignore.includes(pos))

    let targetFeatures = this.targetSequence.map(t => this._getAttribute(t, this.feature.name));
    let flattenedTargetFeatures = this.flatten ? targetFeatures.flat() : targetFeatures;
    flattenedTargetFeatures = flattenedTargetFeatures.filter(pos => !this.ignore.includes(pos))

    console.log('token', tokenFeatures, 'target', flattenedTargetFeatures)
  
    let score = 0;
  
    switch (this.mode) {
      case 'contains':
        score = this.contains(tokenFeatures, flattenedTargetFeatures); 
        break;
      case 'exactly':
        score = this.arraysEqual(tokenFeatures, flattenedTargetFeatures);
        break;
      case 'starts with':
        score = this.startsWith(tokenFeatures, flattenedTargetFeatures);
        break;
      case 'ends with':
        score = this.endsWith(tokenFeatures, flattenedTargetFeatures);
        break;
      case 'in order':
        score = this.includesInOrder(tokenFeatures, flattenedTargetFeatures);
        break;
    }
    
    score = score ? 1 : 0;
    console.log('score', score)
    return score;
  }

  _getAttribute(token, attribute) {
    if (token.getAttribute != undefined) {
      return token.getAttribute(attribute);
    }
    return token[attribute];
  }

  contains(arr, target) {
    if (target.length === 0) return true;
    for (let i = 0; i <= arr.length - target.length; i++) {
      if (this.arraysEqual(arr.slice(i, i + target.length), target)) {
        return true;
      }
    }
    return false;
  }

  containsSubtokens(arr, target) {
    return target.every(subarray => this.containsAll(arr, subarray));
  }

  arraysEqual(a, b) {
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }

  startsWith(arr, target) {
    return this.arraysEqual(arr.slice(0, target.length), target);
  }

  startsWithSubtokens(arr, target) {
    let flattened = target.flat();
    return this.startsWith(arr, flattened);
  }

  endsWith(arr, target) {
    return this.arraysEqual(arr.slice(-target.length), target);
  }

  endsWithSubtokens(arr, target) {
    let flattened = target.flat();
    return this.endsWith(arr, flattened);
  }

  includesInOrder(arr, target) {
    let targetIndex = 0;
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] === target[targetIndex]) {
        targetIndex++;
        if (targetIndex === target.length) {
          return true;
        }
      }
    }
    return false;
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

  changeMode(newMode) {
    if (CategoricalConstraint.modes.includes(newMode)) {
      this.mode = newMode;
    } else {
      console.error(newMode, 'is not a valid CategoricalConstraintMode')
    }
  }
}

export class POSConstraint extends CategoricalConstraint { // may want to make a 'categorical constraint'
  static defaultTarget = 'NN';
  
  constructor(targetPOSPhrase) {
    super('pos', Feature.POS, POSConstraint.defaultTarget);
    this.ignore = ["_SP"]
    this.targetSequence = targetPOSPhrase.filter(
      pos => !this.ignore.includes(pos)
    ).map(
      (pos, i) => { return { pos: pos, index: i }; }
    );
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
  static defaultTarget = '';

  constructor(targetPhones) {
    super('rhyme', Feature.Rhyme, RhymeConstraint.defaultTarget);
    this.targetSequence = targetPhones.map((rhyme, i) => { return { rhyme: rhyme, index: i }; });
    this.range = [
      "AA", "AE", "AH", "AO", "AW", "AY", "B", "CH", "D", "DH",
      "EH", "ER", "EY", "F", "G", "HH", "IH", "IY", "JH", "K",
      "L", "M", "N", "NG", "OW", "OY", "P", "R", "S", "SH",
      "T", "TH", "UH", "UW", "V", "W", "Y", "Z", "ZH"
    ];
  }
}

class SoundConstraint extends CategoricalConstraint {
  static defaultTarget = '';
  constructor(targetPhones) {
    super('sound', Feature.Sound, SoundConstraint.defaultTarget);
    this.targetSequence = targetPhones.map((sound, i) => { return { sound: sound, index: i }; });
    this.flatten = true;

    // ARPAbet http://www.speech.cs.cmu.edu/cgi-bin/cmudict
    this.range = [
      "AA", "AE", "AH", "AO", "AW", "AY", "B", "CH", "D", "DH",
      "EH", "ER", "EY", "F", "G", "HH", "IH", "IY", "JH", "K",
      "L", "M", "N", "NG", "OW", "OY", "P", "R", "S", "SH",
      "T", "TH", "UH", "UW", "V", "W", "Y", "Z", "ZH"
    ];
  }

  _getAttribute(token, attribute) {
    if (token.sound !== undefined) {
      // This handles the case where we're dealing with the targetSequence objects
      return token[attribute];
    }
    
    // This handles the case where we're dealing with actual tokens
    let phonemes = token.getAttribute('phonemes', []);
    if (phonemes.length > 0) {
      return phonemes[0].split(' ');
    }
    return [];
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

    let value = sequence.getAttribute(this.feature.name, 0);
    console.log('numerical score', value, this.feature.name)
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