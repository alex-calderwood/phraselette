import { getUniqueID } from '../scripts/utils.js';
import { Feature } from './Feature.js';
import { POS } from '../../data/pos.js';
import { Sequence } from './Sequence.js'

// feature -> constraint mapping
// TODO: refactor such that target is a sequence (need to refactor constraint target...)
export function makeConstraint(feature, target, opening) {
  console.log("constraint: making constraint", {feature, target, opening});
  if (opening == null) {
    console.warn("constraint: Warning, making a constraint with no opening");
  }
  let attribute = feature.attribute;

  // Switch on Feature's attribute name
  switch (attribute) {
    case 'pos':
      target = target.map(token => token.getAttribute('pos'));
      return new POSConstraint(target, opening);
    case 'sound': case 'rhyme':
      let firstPronunciationPerToken = target.map((token) => {
        let phonemes = token.getAttribute('phonemes', []); 
        if (phonemes && phonemes.length > 0) { 
          return phonemes[0]; 
        } else {
          if (attribute === 'rhyme') { return BetterRhymeConstraint.defaultTarget; }
          return SoundConstraint.defaultTarget;
        }
      });
      let finalTarget = firstPronunciationPerToken.map((tokenPhonemes) => {
        return tokenPhonemes.split(' ');
      }).flat().filter(phoneme => phoneme && phoneme.length > 0);

      if (attribute === 'rhyme') { return new BetterRhymeConstraint(finalTarget, opening); }
      return new SoundConstraint(finalTarget, opening);
    case 'length':
      return new WordLengthConstraint(target, opening);
  }

  // Catch all
  let dataType = feature.dataType;
  switch(dataType) {
    case 'number':
      return new NumericalRangeConstraint(attribute, feature, opening);
    case 'category':
      return new CategoricalConstraint(attribute, feature, opening);
  }

  console.error('Could not make constraint for feature:', feature);
  return null;
}

export class Constraint {
  constructor(name, feature, opening) {
    this.id = getUniqueID();
    this.name = name;
    this.feature = feature;
    this.opening = opening;
    this.dataType = feature.dataType;
    this.isPre = false;         // can the constraint be computed during the generation process?
    this.range = null;          // what are the possible values of the constraint
    this.filterThreshold = 0;   // what is the minimum score to consider the constraint satisfied
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


  applies(opening) {
    if (this.opening == null) {
      console.warn("constraint: opening is null", this, this.opening)
      return false;
    }

    let over = this.opening.id == opening.id;
    console.log("constraint: overlaps", this.opening, opening, over)
    return over;
  }

  static subsetByFeatures(constraints, features, opening=null, requireOpening = false) {
    if (opening === null && requireOpening) {
      return [];
    }
    
    if (opening !== null) {
      constraints = constraints.filter((constraint) => {
        return constraint.applies(opening);
      });
    }
    
    return constraints.filter((constraint) => { // could also hard code the mapping for a speedup
      return features.includes(constraint.feature);
    });
  }

  toJSON() {
    return undefined;
  }

  static nonEmptyConstraintJson(constraints) {
    return constraints.map(c => c.toJSON()).filter(c => c != null);
  }

   // lil helper that maybe shouldn't go here, included for instructive purposes
  static getWordLengthConstraints(constraints) {
    return constraints.filter(c => c.feature.attribute == 'length');
  }
}

export class AlliterationConstraint extends Constraint {
  constructor(targetToken, opening) {
    super('test', 'test', opening);
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
    constructor(name, feature, defaultTarget=null, opening) {
      super(name, feature, opening);
      this.defaultTarget = defaultTarget;
      this.targetSequence = null; // what is the constraint's goal sequence
      this.range = null;
      this.modes = {
        'contains': this.contains.bind(this),
        'exactly': this.exactly.bind(this),
        'starts with': this.startsWith.bind(this),
        'ends with': this.endsWith.bind(this),
        'in order': this.inOrder.bind(this)
      };
      this.mode = Object.keys(this.modes)[0];
      this.flatten = false;
      this.ignore = []; // features to disregard
  }

  addMode(modeName, modeFunction) {
    this.modes[modeName] = modeFunction.bind(this);
  }

  changeMode(newMode) {
    if (this.modes.hasOwnProperty(newMode)) {
      this.mode = newMode;
    } else {
      console.error("constraint:", newMode, 'is not a valid mode for this constraint')
    }
  }

  async getScore(sequence, document) {
    console.log('constraint: score mode', this.mode, sequence.textContent);

    if (sequence === null || sequence.span.length === 0 || this.targetSequence === null || this.targetSequence.length === 0) {
      return 0;
    }

    let tokens = sequence.span;
    let tokenFeatures = this.flatten
      ? tokens.flatMap(t => this._getAttribute(t, this.feature.attribute))
      : tokens.map(t => this._getAttribute(t, this.feature.attribute));
    tokenFeatures = tokenFeatures.filter(val => !this.ignore.includes(val))

    let targetFeatures = this.targetSequence.map(t => this._getAttribute(t, this.feature.attribute));
    let flattenedTargetFeatures = this.flatten ? targetFeatures.flat() : targetFeatures;
    flattenedTargetFeatures = flattenedTargetFeatures.filter(val => !this.ignore.includes(val))

    console.log('constraint: scoring token', tokenFeatures, 'target', flattenedTargetFeatures)

    let score = 0;
    if (this.modes[this.mode]) {
      score = this.modes[this.mode](tokenFeatures, flattenedTargetFeatures);
    } else {
      console.error('constraint: invalid mode:', this.mode);
    }
    
    score = score ? 1 : 0;
    console.log('constraint: score', score)
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
      if (this.exactly(arr.slice(i, i + target.length), target)) {
        return true;
      }
    }
    return false;
  }

  containsSubtokens(arr, target) {
    return target.every(subarray => this.containsAll(arr, subarray));
  }

  exactly(a, b) {
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }

  startsWith(arr, target) {
    return this.exactly(arr.slice(0, target.length), target);
  }

  startsWithSubtokens(arr, target) {
    let flattened = target.flat();
    return this.startsWith(arr, flattened);
  }

  endsWith(arr, target) {
    return this.exactly(arr.slice(-target.length), target);
  }

  endsWithSubtokens(arr, target) {
    let flattened = target.flat();
    return this.endsWith(arr, flattened);
  }

  inOrder(arr, target) {
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
      console.log('constraint: no target span to update for constraint', this);
      return;
    }
    this.targetSequence[index][this.feature.attribute] = newValue;
    return this.targetSequence;
  }

  addTarget(newTarget=null) {
    if (this.defaultTarget === null) {
      console.error('constraint: no default target for constraint', this);
      return this.targetSequence;
    }

    if (this.targetSequence == null) {
      this.targetSequence = [];
    }

    if (newTarget === null) {
      newTarget = this.defaultTarget;
    }

    let newIndex = this.targetSequence.length;
    this.targetSequence.push({ [this.feature.attribute]: newTarget, index: newIndex });

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
  static defaultTarget = 'noun';
  
  constructor(targetPOSPhrase, opening) {
    super('pos', Feature.POS, POSConstraint.defaultTarget, opening);
    this.ignore = ["_SP"]
    this.targetSequence = targetPOSPhrase.filter(
      pos => !this.ignore.includes(pos)
    ).map(
      (pos, i) => { return { pos: pos, index: i }; }
    );
    this.range = Object.keys(POS);
  }
}

export class BetterRhymeConstraint extends CategoricalConstraint {
  static defaultTarget = '';
  constructor(targetPhones, opening) {
    super('rhyme', Feature.Rhyme, BetterRhymeConstraint.defaultTarget, opening);
    this.targetSequence = targetPhones.map((sound, i) => ({ sound, index: i }));
    this.vowelSounds = ["AA", "AE", "AH", "AO", "AW", "AY", "EH", "ER", "EY", "IH", "IY", "OW", "OY", "UH", "UW"];
    this.consonantSounds = ["B", "CH", "D", "DH", "F", "G", "HH", "JH", "K", "L", "M", "N", "NG", "P", "R", "S", "SH", "T", "TH", "V", "W", "Y", "Z", "ZH"];
    this.range = [...this.vowelSounds, ...this.consonantSounds];
    this.flatten = true;

    this.setupModes();
    this.mode = 'rhymes';
  }

  setupModes() {
    this.modes = {};
    this.addMode('rhymes', this.rhymes);
    // this.addMode('consonance', this.consonance);
    // this.addMode('alliteration', this.alliteration);
  }

  rhymes(tokenFeatures, targetFeatures) {
    const getRhymingPart = (phones) => {
      const lastVowelIndex = phones.findLastIndex((p) => {
        let pDeepCopy = JSON.parse(JSON.stringify(p));
        console.log('constraint: last vowel index', pDeepCopy, this.vowelSounds.includes(pDeepCopy));
        return this.vowelSounds.includes(p)
      });
      console.log('constraint: last vowel index', lastVowelIndex, phones);
      if (lastVowelIndex === -1) {
        return phones.slice(1);
      }
      return phones.slice(lastVowelIndex);
    };
    const tokenRhymes  = getRhymingPart(tokenFeatures);
    const targetRhymes = getRhymingPart(targetFeatures);
    console.log("constraint: rhyming parts", tokenRhymes, targetRhymes, "full", tokenFeatures, targetFeatures);
    return this.endsWith(tokenRhymes, targetRhymes);
  }

  // consonance(tokenFeatures, targetFeatures) {
  //   const getConsonants = phones => phones.filter(p => this.consonantSounds.includes(p));
  //   const tokenConsonants = tokenFeatures.map(getConsonants);
  //   const targetConsonants = targetFeatures.map(getConsonants);
  //   return this.startsWith(tokenConsonants, targetConsonants);
  // }

  // alliteration(tokenFeatures, targetFeatures) {
  //   const getFirstConsonant = phones => {
  //     return phones.find(p => this.consonantSounds.includes(p)) || '';
  //   };
  //   const tokenFirstConsonants = tokenFeatures.map(getFirstConsonant);
  //   const targetFirstConsonants = targetFeatures.map(getFirstConsonant);
  //   return this.startsWith(tokenFirstConsonants, targetFirstConsonants);
  // }

  // _getAttribute(token, attribute) {
  //   if (token.getAttribute) {
  //     return token.getAttribute(attribute) || token.getAttribute('phonemes') || [];
  //   }
  //   return token[attribute] || token.phonemes || [];
  // }

  _getAttribute(token, attribute) {
    if (token.sound !== undefined) {
      // This handles the case where we're dealing with the targetSequence objects
      return token[attribute];
    }
    
    console.log('constraint: token', token)
    // This handles the case where we're dealing with actual tokens
    let phonemes = token.getAttribute('phonemes', []);
    if (phonemes.length > 0) {
      return phonemes[0].split(' ');
    }
    return [];
  }
}

class SoundConstraint extends CategoricalConstraint {
  static defaultTarget = '';
  constructor(targetPhones, opening) {
    super('sound', Feature.Sound, SoundConstraint.defaultTarget, opening);
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

  constructor(name, feature, opening) {
    super(name, feature, opening);
    this.feature = feature;
    this.range = this.defaultRange;
    this.targetMin = this.range[0];
    this.targetMax = this.range[1];
  }

  async getScore(sequence, document) {
    if (this.targetMin === null || this.targetMax === null) {
      console.error('Must specify a target for constraint:', this);
      return 0;
    }

    let value = sequence.getAttribute(this.feature.attribute, 0);
    console.log('numerical score', this.feature.attribute, 'val', value, 'target', this.targetMin, this.targetMax)
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


export class WordLengthConstraint extends NumericalRangeConstraint {
  defaultRange = [1, 14];
  constructor(target, opening) {
    const feature = Feature.Length;
    super(feature.attribute, feature, opening); // name, feature, opening
    this.isPre = true;
    this.range = this.defaultRange;
    this.targetMin = this.range[0];
    this.sequence = new Sequence(target); // eventually want target to be a sequence
    this.targetMax = this.sequence.numWords() || this.range[1];
    this.filterThreshold = 1;
  }

  /*
  * Return a [0-1] score indicating how much the token sequence coheres to the constraint target. 
  * 0 means the span does not match the constraint
  * 1 means the span perfectly coheres to the constraint
  */
  async getScore(sequence, document) {
    if (sequence.numWords() <= this.targetMax) {
      return 1;
    }
    return 0;
  }

  evaluate(score, sequence, document) {
    return score >= this.filterThreshold;
  }

  toJSON() {
    return {
      type: this.constructor.name,
      min: this.targetMin,
      max: this.targetMax
    };
  }
}