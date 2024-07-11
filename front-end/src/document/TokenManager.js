import { splitWordTokenize, gpt2Tokenize, spacyTokenize } from '../scripts/smarts.js';

export class TokenManager {
  constructor(activeLenses, tokens) {
    this.tokens = {
      'probability': [],
      'words': [],
      'spacy': [],
    }; 
    this.activeLenseNames = activeLenses; // which lenses are currently active
    this.externalOnToken = (token) => {}; // a callback to call when a token is created
    this.wordsLense = 'spacy';
  }

  /* 
   * Toggle TokenManager's understanding of which lenses should be actively tokenized.
  */
  setActiveLense(lense, active=true) {
    if (!this.tokens[lense]) {
      console.error("No label of lense type", lense);
      return;
    }
    if (active && !this.activeLenseNames.includes(lense) ) {
      this.activeLenseNames.push(lense);
    }
    if (!active && this.activeLenseNames.includes(lense)) {
      this.activeLenseNames = this.activeLenseNames.filter(l => l !== lense);
    }
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

  /* 
  * Logic to handle input events: synchornize the text in the tokenManager's various lenses
  * with the edits that were made by {event} to the text in the contenteditable div (which is already updated);
  */
  synchronizeTokens(selection, beforeEventSelection, event) {
    for (let lense of this.activeLenseNames) {
      switch (event.inputType) {
        case 'insertText':
          this.addCharToToken(lense, selection, event);
          break;
        case 'deleteContentBackward':
          this.removeCharsFromToken(lense, beforeEventSelection, event);
          break;
        case 'deleteContentForward':
          console.error('deleteContentForward not implemented');
          break;
        case 'insertParagraph':
          console.error('insertParagraph not implemented');
          break;
        case 'insertLineBreak':
          console.error('insertLineBreak not implemented');
          break;
        case 'insertFromPaste':
          console.error('insertFromPaste not implemented');
          break;
        default:
          break;
      }
    }
  }

  removeCharsFromToken(lense, beforeSelection, event) {
    let startCharIndex = Math.min(beforeSelection.startIndex, beforeSelection.endIndex);
    let endCharIndex = Math.max(beforeSelection.startIndex, beforeSelection.endIndex);
    let totalShift = endCharIndex - startCharIndex;
    if(beforeSelection.startIndex == beforeSelection.endIndex) {
      startCharIndex = beforeSelection.startIndex - 1;
      totalShift = 1;
    }

    let selectedTokens = this.tokensAt(lense, startCharIndex, endCharIndex - 1);

    if (selectedTokens.length === 0) {
      console.error("removeCharsFromToken called with no tokens at", startCharIndex);
      return;
    }

    // Remove selected characters from tokens overlapping the selection and mark tokens that become empty
    let tokensToDelete = [];
    for (let token of selectedTokens) {
      // trim the tokens based on the selection
      let newStart = Math.max(token.start, startCharIndex);
      let newEnd = Math.min(token.end + 1, endCharIndex);
      let text = token.text.slice(0, newStart - token.start) + token.text.slice(newEnd - token.start);
      if(text.length === 0) {
        tokensToDelete.push(token.id)
      } else {
        token.text = text;
      }
    }

    // delete the tokens that are empty and sort by start index
    this.tokens[lense] = this.tokens[lense].filter(t => !tokensToDelete.includes(t.id)).sort((a, b) => a.start - b.start);

    // update the token indices
    let offset = 0;
    for (let token of this.tokens[lense]) {
      token.start = offset;
      token.end = offset + token.text.length - 1;
      offset = token.end + 1;
    }
  }

  addCharToToken(lense, selection, event) {
    if (event.data.length !== 1) {
      console.error("editToken called with event.data.length", event.data.length, "not sure what to expect");
    }

    let startIndex = selection.startIndex - event.data.length; // because we added a token TODO we want to use the keydown

    let tokensAt = this.tokensAt(lense, startIndex)

    if (tokensAt.length > 1) {
      console.error("editToken called with", tokensAt.length, "tokens at", startIndex);
      return;
    }

    if (tokensAt.length === 0) {
      // We may be at the end of the text so logic elsewhere will add the token (splitSpan I think)
      console.error("editToken called with no tokens at", startIndex); // doesn't seem to actually be a problem...
      return;
      // let endIndex = this.getEndOfLenseChar(this.tokens[lense])
      // console.log('end', endIndex, 'start', startIndex);
    }

    // add the character to the token
    let token = tokensAt[0];
    let cutIndex = startIndex - token.start;
    let start = token.text.slice(0, cutIndex) + event.data;
    let end = token.text.slice(cutIndex);
    token.text = start + end;
    token.end += event.data.length;

    // shift all token indices after the edited token
    this.shiftTokenSpans(token.end + 1, this.tokens[lense], event.data.length); // TODO think about what happens when there is a tokenization going on
  }

  shiftTokenSpans(fromChar, tokens, shiftAmount) {
    if (shiftAmount === 0 || tokens.length === 0) {
      return;
    }

    // tokens aren't necessarily in order
    let endOfLenseChar = this.getEndOfLenseChar(tokens);
    if (fromChar > endOfLenseChar) {
      return;
    }

    let tokensToShift = tokens.filter(t => t.start >= fromChar);
    for (let t of tokensToShift) {
      t.start += shiftAmount;
      t.end += shiftAmount;
    }
  }

  // Return the final character index of the last token in the list
  // TODO this is janky and slow
  getEndOfLenseChar(tokens) {
    return Math.max(...tokens.map(t => t.end));
  }

  /* 
  * Swap the token with the given id with the given token.
  */
  swapToken(token, newToken) {
    console.log("Swapping token", token, "with", newToken)

    // for (let lense of this.activeLenseNames) {
    let lense = token.type;
    let index = this.tokens[lense].findIndex(t => t.id === token.id);
    if (index === -1) {
      console.error("swapToken called with token that doesn't exist for lense", lense, "token", token);
      return;
    }

    this.tokens[lense][index] = newToken;

    this.refreshCharIndices(lense);
    // }
  }

  /* 
  * Refresh the character indices for the given lense by looping through all tokens and updating their indices.
  */
  refreshCharIndices(lense) {
    let offset = 0;
    for (let token of this.tokens[lense]) {
      token.start = offset;
      token.end = offset + token.text.length - 1;
      offset = token.end + 1;
    }
  }

  /* 
  * TODO document
  */
  pushUpdateToken(lenseType, token) {
    // make a copy of the current lense
    let newLense = this.tokens[lenseType].slice();

    // find all tokens that overlap at all
    let overlappingTokens = [];
    let overlapIndex = -1;
    for (let i = 0; i < newLense.length; i++) {
      let curToken = newLense[i];
      if (curToken.start <= token.end && curToken.end >= token.start) { // TODO is this missing cases? could call utils.overlaps
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
    
    this.tokens[lenseType] = newLense;
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

    let tokens = this.tokens[lense] || [];

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
  tokenize(text, data = {}, lenses=this.activeLenseNames) {
    let tokens = [];
      data = {  ...data, onToken: this.internalOnToken.bind(this) };
      for (let lense of lenses) {
        console.log('tokenizing', lense);
        switch (lense) {
          case 'words':
            tokens = splitWordTokenize(text, data);
            this.tokens.words = tokens; // TODO this is not currently using onToken
            break;
          case 'probability':
            gpt2Tokenize(text, data);
            break;
          case 'spacy':
            spacyTokenize(text, data);
            break;
      }
    }

    // at the end we should try to check again and call it if not everything is tokenized
    if (data.onFinished) {
      data.onFinished();
    }
  }

  /* 
  * Return a range representing the range that should be tokenized. 
  * This is the range from the last character that hasn't yet been tokenized to the end of the text.
  */
  static getUntokenizedRange(text, existingTokens) {
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
