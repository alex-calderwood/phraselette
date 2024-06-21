import { tokenizeWithGPT2 } from './smarts.js';

export class TokenManager {
  static curTokenID = 0;

  constructor(tokens) {
    this.lenses = { 
      'words': [],
      'gpt-2': [],
    }; 
    this.currentLense = 'words';
    this.lenseTokenIDtoIndex = { 'words': {} }; // token id to lenses array index
    this.externalOnToken = (token) => {};
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

  pushUpdateToken(type, token) {
    // make a copy of the current lense
    let newLense = this.lenses[type].slice();

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
    console.log('overlapping tokens', overlappingTokens);

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
    
    this.lenses[type] = newLense;
  }

  // updateToken(lense, id, text) {
  //   let view = this.lenses[lense];
  //   console.log('updating', id, text);
  //   let token = view.find((token) => token.id === parseInt(id));
  //   console.log('this one', token);
  //   let newTokens = this.tokenManager.tokenize(text);
  //   console.log('new tokens', newTokens);
  //   return newTokens;
  // }

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
    console.log('tokenizing', text,'lense', this.currentLense);
    let tokens = [];
    switch (this.currentLense) {
      case 'words':
        tokens = TokenManager.splitWordTokenize(text, data);
        this.lenses.words = tokens;
        break;
      case 'gpt-2':
        console.log('lenses', this.lenses);
        data = { onToken: this.internalOnToken.bind(this) };
        TokenManager.gpt2Tokenize(text, data);
        break;

    }
    console.log('tokens', tokens);
    return tokens;
  }

  static async gpt2Tokenize(text, data = {}) {
    if (!text || text.length === 0) {
      console.error("gpt2Tokenize passed empty text");
      return;
    }

    let onToken = data.onToken;

    let tokenGenerator = tokenizeWithGPT2(text, [0, text.length - 1]); // TODO debug why the whole thing isn't going through

    // don't wait for the generator to finish
    // instead, call onToken for each token
    let rawTokenPromise = await tokenGenerator.next();
    while (!rawTokenPromise.done) {
      let rawToken = rawTokenPromise.value;
      let token = {
        'start': rawToken.span[0],
        // rawToken.span[1] is exclusive, our start and end is inclusive
        'end': rawToken.span[1] - 1,
        "text": rawToken.token,
        "type": "gpt-2",
        "id": TokenManager.createTokenID(),
        "prob": rawToken.prob,
      }
      if (onToken) {
        onToken(token);
      }
      rawTokenPromise = await tokenGenerator.next();
    }
  }

  static splitWordTokenize(text, data = {}) {
    let type = "words";
    let tokens = [];
    let tokenStart = 0;
    let curToken = "";
    for (let i = 0; i < text.length; i++) {
      let c = text[i];
      curToken += c;
      if (c.match(/\s+/g) || i === text.length - 1) {
        // TODO handle c == 0 case
        // '  ' case (two spaces)
        let nextProb = Math.random();
        tokens.push({
          'start': tokenStart,
          'end': i,
          "text": curToken,
          "type": type,
          "id": TokenManager.createTokenID(),
          "prob": nextProb,
        });
        curToken = "";
        tokenStart = i + 1;

        // let nextProb = Math.random();
        // nextProb = (nextProb + 0.08) % 1;
        continue; // TODO I think we want to save these as special ' ' tokens?
      }
    }
    console.log('tokenized', tokens);
    return tokens;
  }

   retokenize(tokens, data = {}) {
    // given a list of tokens, use tokenize() to re-tokenize the text, preserving the data in the tokens
    // we will go the tokens and split each token into a list of tokens
    let newTokens = [];
    for (let token of tokens) {
      let newToken = this.tokenManager.tokenize(token.text);
      newTokens.push(newToken);
    }
    console.log('newTokens', newTokens);
  }

  static createTokenID() {
    return TokenManager.curTokenID++;
  }
}
