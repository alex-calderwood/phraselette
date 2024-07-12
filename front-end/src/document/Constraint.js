import { overlaps, getUniqueUUID } from '../scripts/utils.js';
import { spacyTokenize } from '../scripts/smarts.js';

export class Constraint {
  constructor(name, dataType) {
    this.name = name;
    this.dataType = dataType;
    this.id = getUniqueUUID();
    this.span = null;
    this.isPre = false; // can the constraint be computed quickly?
    this.target = null; // what is the goal of the constraint 
  }

  /* 
  * Return a score indicating how much the span coheres to the constraint target
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

export class POSConstraint extends Constraint { // may want to make a 'categorical constraint'
  constructor(targetPOSPhrase) {
    super('POS', 'category');
    this.target = targetPOSPhrase;
  }

  async evaluate(tokens, document) {
    if (tokens.length === 0) {
      return 0;
    }
    if (this.target === null || this.target.length === 0) {
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
      let baselineTag = this.target[i];
      console.log('match', newToken.text, newToken.tag, baselineTag, newToken.tag === baselineTag);
      if (newToken.tag == baselineTag) {
        matches += 1;
      }
    }
    return matches / newWordTokens.length;
  }
}


