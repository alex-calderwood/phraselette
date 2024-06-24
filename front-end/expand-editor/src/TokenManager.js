import { splitWordTokenize, gpt2Tokenize, spacyTokenize } from './smarts.js';


export class TokenManager {
  // tokenizationAttempts = 0;

  constructor(initialLense, tokens) {
    this.lenses = {
      'basic': [],
      'words': [],
      'spacy': [],
    }; 
    this.lenseInfo = { // TODO eventually should merge this with this.lenses
      'basic': {tokenizedRange: {}},
      'words': {tokenizedRange: {}},
      'spacy': {tokenizedRange: {}},
    }; 
    this.currentLense = initialLense;
    // this.lenseTokenIDtoIndex = { 'words': {} }; // token id to lenses array index
    this.externalOnToken = (token) => {}; // a callback to call when a token is created
  }

  setCurrentLense(lense) {
    if (!this.lenses[lense]) {
      console.error("No label of lense type", lense);
      return;
    }

    this.currentLense = lense;
  }

  setOnToken(onToken) {
    this.externalOnToken = onToken;
  }

  /*
  * Handle an incoming token, which may be anywhere in the string
  */
  internalOnToken(token) {
    let type = token.type;

    // put the token in the right place and remove unnecessary old tokens
    // TODO this is currently buggy
    this.pushUpdateToken(type, token);

    // call any additional callbacks that have been registered
    this.externalOnToken(token);
  }

  editToken(lense, selection, event) {
    // let newToken = {...token, text: newText};
    // this.pushUpdateToken(token.type, newToken);
    // get the token
    let tokensAt = this.tokensAt(lense, selection.delayedStartChar, selection.delayedStartChar);
    if (tokensAt.length !== 1) {
      console.error("editToken called with", tokensAt.length, lense, "tokens at", selection.delayedStartChar);
      return;
    }

    let token = tokensAt[0];

    console.log('editing token', token, 'selection start',  selection.delayedStartChar, 'end', selection.delayedEndChar);

    let cutIndex = selection.delayedEndChar - token.start;
    let start = token.text.slice(0, cutIndex);
    let end = token.text.slice(cutIndex + 1);
    token.text = start + end;
    console.log('edited token', start + end, 'cutting at index', cutIndex,  start, end, );
    // we also have to edit all the token spans afterwards
  }

  /* 
  * TODO document
  */
  pushUpdateToken(lenseType, token) {
    // make a copy of the current lense
    let newLense = this.lenses[lenseType].slice();

    // find all tokens that overlap at all
    let overlappingTokens = [];
    let overlapIndex = -1;
    for (let i = 0; i < newLense.length; i++) {
      let curToken = newLense[i];
      if (curToken.start <= token.end && curToken.end >= token.start) {
        overlappingTokens.push(i);
        // use the first one as the index to replace
        if(overlapIndex === -1) { 
          overlapIndex = i;
        }
      }
    }

    if (overlappingTokens.length > 0) {
      // Splice from the end to the start to maintain correct indices
      for (let i = overlappingTokens.length - 1; i >= 0; i--) {
        newLense.splice(overlappingTokens[i], 1);
      }
      // Reinsert the new token at the position of the first overlapping token
      newLense.splice(overlapIndex, 0, token);
    } else {
      newLense.push(token);
    }
    
    this.lenses[lenseType] = newLense;
  }

  /**
   * Provide all tokens betweens the 'start' and 'end' range (inclusive) in the given lense.
   * In the future I may want to create a helper that is able to return multiple lense types. 
   * 
   * @param {string} lense - which lense to look for
   * @param {int} start - the first location to look for tokens (inclusive)
   * @param {int} end -  the final location to look for tokens (inclusive)
   * @returns {list} - the spanned token objects
  */
  tokensAt(lense, start, end = start) {
    if (typeof start !== 'number' || typeof end !== 'number' ) {
      console.error('tokensAt called with', typeof start, typeof end);
    } 

    let tokens = this.lenses[lense] || [];

    if (start > end) {
      let temp = start;
      start = end;
      end = temp;
    }

    if (!tokens) {
      console.error("No label of lense type", lense);
      return;
    }

    let tokensSpanned = [];
    for (let i = 0; i < tokens.length; i++) {
      let token = tokens[i];
      if (TokenManager.rangeIntersectsToken(start, end, token)) {
        tokensSpanned.push(token);
      }
    }
    return tokensSpanned;
  }

  static rangeIntersectsToken(start, end = start, token) {
    return (start >= token.start && start <= token.end) 
        || (end >= token.start && end <= token.end)
        || (start <= token.start && end >= token.end);
  }

  /**
    * Asynchonously turn the incoming text into a list of 'tokens' based on the current lense's tokenization strategy.
    * 
    * @param {string} text - the text to tokenize (should be the entire context)
    * @param {object} data - extra arguments to the tokenizer call such as the range of 
    *                        the text that should be processed
    *   
  */
  tokenize(text, data = {}) {
    let tokens = [];
      data = {  ...data, onToken: this.internalOnToken.bind(this) };
      switch (this.currentLense) {
      case 'words':
        tokens = splitWordTokenize(text, data);
        this.lenses.words = tokens; // TODO this is not currently using onToken
        break;
      case 'basic':
        gpt2Tokenize(text, data);
        break;
      case 'spacy':
        data = { ...data, onToken: this.internalOnToken.bind(this) };
        spacyTokenize(text, data);
        break;
    }
  }

  /* 
  * Return a range representing the range that should be tokenized. 
  * This is the range from the last character that hasn't yet been tokenized to the end of the text.
  */
  static getRangeToTokenize(text, existingTokens) {
    let alreadyTokenizedCharacters = {}

    for (let i = 0; i < text.length; i++) {
      alreadyTokenizedCharacters[i] = false;
    }
    if (existingTokens && existingTokens.length > 0) {
      for (let token of existingTokens) {
        for (let t = token.start; t <= token.end; t++) {
          alreadyTokenizedCharacters[t] = true;
        }
      }
    }

    let unTokenized = Object.keys(alreadyTokenizedCharacters)
      .filter(key => !alreadyTokenizedCharacters[key])
      .map(Number);  // Convert keys back to numbers
    let minUnTokenized = unTokenized.length > 0 ? Math.min(...unTokenized) : text.length;

    let tokenizeRange = [
      minUnTokenized > 0 ? minUnTokenized - 1 : 0,
      text.length > 0 ? text.length - 1 : 0
    ];

    return tokenizeRange;
  }

  /*
  * Should the text be tokenized?
  * Currently it looks to see if the range that is trying to be tokenized is before the end of the text.
  * Also, it will only tokenize if 
  */
  static shouldTokenize(text, tokenizeRange, lense, depth) {
    if (depth > 1) {
      return false;
    }

    switch(lense) {
      default:
        return tokenizeRange[0] < text.length - 1;
    }
  }
}
