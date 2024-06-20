export class TokenManager {
  static curTokenID = 0;

  constructor(tokens) {
    this.lenses = { 'words': [] }; // the types of possible labels
    this.lenseTokenIDtoIndex = { 'words': {} }; // token id to lenses array index
  }

  updateToken(lense, id, text) {
    let view = this.lenses[lense];
    console.log('updating', id, text);
    let token = view.find((token) => token.id === parseInt(id));
    console.log('this one', token);
    let newTokens = TokenManager.tokenize(text);
    console.log('new tokens', newTokens);
    return newTokens;
  }

  tokensAt(type, start, end = start) {
    let tokens = this.lenses[type];
    if (!tokens) {
      console.error("No label of lense type", type);
      return;
    }

    let tokensSpanned = [];
    for (let spanIndex = 0; spanIndex < tokens.length; spanIndex++) {
      let token = tokens[spanIndex];
      let [labelStart, labelEnd] = [token.start, token.end];
      if (start >= labelStart && end <= labelEnd) { // todo double check the bounds
        tokensSpanned.push(token);
        // console.log('spanned', token);
      }

    }

    return tokensSpanned;
  }

  editToken(type, event, editLocation) {
    let tokens = this.tokensAt(type, editLocation);
    let token = tokens[0]; // TODO allow mulpitle tokens to be edited at once

    let didEdit = false;
    let relativeEditLocation = editLocation - token.start;

    switch (event.inputType) {
      case "insertText":
        token.text = token.text.slice(0, relativeEditLocation) + event.data + token.text.slice(relativeEditLocation);
        // let subsequentTokens = this.tokensAt(type, token.end, ); // TODO update the token indices after the edit
        didEdit = true;
        break;
      case "deleteContentBackward":
        token.text = token.text.slice(0, relativeEditLocation - 1) + token.text.slice(relativeEditLocation);
        // let subsequentTokens = this.tokensAt(type, token.end, ); // TODO update the token indices after the edit
        didEdit = true;
        break;
      case "insertParagraph":
        // token.text = token.text.slice(0, editLocation - 1) + " " + token.text.slice(editLocation);
        didEdit = false;
        break;
    }

    // tokenize again
    if (this.tokenManager) {
      let newTokens = TokenManager.tokenize(token.text); // TODO get this working
      this.tokenManager.lenses.words = newTokens;
    }

    return didEdit;
  }

  static tokenize(text, data = {}) {
    console.log("tokenizing", text);
    let type = "words";
    // const delim = " ";
    let tokens = [];
    let tokenStart = 0;
    let curToken = "";
    // let nextProb = 0.1;
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

  static retokenize(tokens, data = {}) {
    // given a list of tokens, use tokenize() to re-tokenize the text, preserving the data in the tokens
    // we will go the tokens and split each token into a list of tokens
    let newTokens = [];
    for (let token of tokens) {
      let newToken = TokenManager.tokenize(token.text);
      newTokens.push(newToken);
    }
    console.log('newTokens', newTokens);
  }

  static createTokenID() {
    return TokenManager.curTokenID++;
  }
}
