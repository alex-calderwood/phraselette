import { overlaps, getUniqueUUID } from '../scripts/utils.js';
import { spacyTokenize } from '../scripts/smarts.js';

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

export class CategoricalConstraint extends Constraint {
  constructor(name, dataType) {
    super(name, dataType);
    this.targetFeature = null;
    this.range = null;
  }

  async evaluate(span, document) {
    return 0;
  }

  updateTarget(index, newValue) {
    console.log('updating target', index, newValue, 'from', this.targetSpan);
    if (this.targetSpan == null || this.targetSpan.length === 0) {
      console.log('no target span to update for constraint', this);
      return;
    }

    this.targetSpan[index][this.targetFeature] = newValue;
  }

}

export class POSConstraint extends CategoricalConstraint { // may want to make a 'categorical constraint'
  constructor(targetPOSPhrase) {
    super('POS', 'category');
    this.targetSpan = targetPOSPhrase.map((pos, i) => { return { pos: pos, index: i }; });
    this.targetFeature = 'pos';
    // https://github.com/explosion/spaCy/blob/master/spacy/glossary.py
    this.range = Object.keys({ // get the keys from this
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

  async evaluate(tokens, document) {
    if (tokens.length === 0) {
      return 0;
    }
    if (this.targetSpan === null || this.targetSpan.length === 0) {
      return 0;
    }

    // TODO we can reuse spacy's tokenization
    // https://stackoverflow.com/questions/53594690/is-it-possible-to-use-spacy-with-already-tokenized-input
    // but for now let's just retokenize
    let newText = document.prefixText + tokens.reduce(
      (acc, token) => {
        return acc + token.text;
      },
      ''
    );

    let wordTokens = await spacyTokenize(newText, { onToken: (token) => { } });

    // now we need to split it back into the tokens that were in after the given text
    let splitIndex = tokens[0].start;
    let newWordTokens = wordTokens.filter((token) => {
      return token.start >= splitIndex;
    });

    console.log('wordTokens', wordTokens, 'newWordTokens', newWordTokens);

    // zip through the span tokens and the tokens to evaluate
    let matches = 0;
    for (let i = 0; i < newWordTokens.length; i++) {
      let newToken = newWordTokens[i];
      let baselineTag = this.targetSpan[i][this.targetFeature];
      console.log('match', newToken.text, newToken.pos, baselineTag, newToken.pos === baselineTag);
      if (newToken.pos == baselineTag) {
        matches += 1;
      }
    }
    return matches / newWordTokens.length;
  }
}


