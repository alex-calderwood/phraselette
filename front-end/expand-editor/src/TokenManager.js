import { splitWordTokenize, gpt2Tokenize, spacyTokenize } from './smarts.js';

export class TokenManager {
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

  internalOnToken(token) {
    let type = token.type;
    this.pushUpdateToken(type, token);
    this.externalOnToken(token);
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
      if ((start >= token.start && start <= token.end) 
        || (end >= token.start && end <= token.end)
        || (start <= token.start && end >= token.end) ) {
        tokensSpanned.push(token);
      }
    }
    return tokensSpanned;
  }

  tokenize(text, data = {}) {
    let tokens = [];
    switch (this.currentLense) {
      case 'words':
        tokens = splitWordTokenize(text, data);
        this.lenses.words = tokens;
        break;
      case 'basic':
        // TODO unpack ...data, 
        data = {  ...data, onToken: this.internalOnToken.bind(this) };
        console.log('calling in tokenmanager', data)
        gpt2Tokenize(text, data);
        break;
      case 'spacy':
        // TODO add ...data, 
        data = { onToken: this.internalOnToken.bind(this) };
        spacyTokenize(text, data);
        break;
    }
    return tokens;
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
}
