import React, { Component } from "react";
import rangy from 'rangy';
import { getUniqueUUID, insertAfter } from "../scripts/utils";
import { TokenManager } from "../document/TokenManager";
import { getColor } from "../color";
import { Document } from "../document/Document";

/* 
* Given character span <span c="5" id="id14acbb15b7e0e"">f</span>
* return our previously computed character offset based on the 'c' attribute
*/
function charIndex(span) {
  return parseInt(span.getAttribute('c'));
}

// A text editor that tracks all sorts of information about the words as they are typed
// And provides affordances for pulling in information from different sources, reconciling their tokens
export class PrismEditor extends Component {
  constructor(props) {
    super(props);
    let originalText = "";
    let content = [];
    for (let i = 0; i < originalText.length; i++) {
      let c = originalText[i];
      content.push(`<span id=${getUniqueUUID()} c=${i}>${c}</span>`);
    }
    this.state = { content: content.join("")};
    this.contentRef = React.createRef();
    this.tokenManager = this.props.tokenManager;
    this.tokenManager.setOnToken(this.updateUITokens.bind(this));

    if (originalText?.length > 0) this.tokenManager.tokenize(originalText);

    if (this.props.setText) {
      this.props.setText(originalText); // give the new text to the parent
    }
  }

  updateUITokens(token) {
    if (this.props.lenseToHighlight === token.type) {
      this.colorTokenByProb(token);
      this.forceUpdate(); // trigger a rerender of the editor
    }
  }

  componentDidMount() {
    this.editorNode = this.contentRef.current;
    this.editorNode.addEventListener('input', this.onInput);
    this.editorNode.addEventListener('click', this.onClick);
    this.editorNode.addEventListener('keydown', this.onKeyDown.bind(this));
  }

  componentWillUnmount() {
    this.editorNode.removeEventListener('input', this.onInput);
    this.editorNode.removeEventListener('click', this.onClick);
    this.editorNode.removeEventListener('keydown', this.onKeyDown);
  }

  componentDidUpdate(prevProps, prevState) {
    if (this.state.content !== prevState.content) {
      console.log('content updated', this.state.content);
    }
  }

  /* 
  * Return the current cursor selection. Used to restore the cursor after user input. Also used for
  * other calculations, such as determining which tokens the user is editing and to construct prompts
  * for the various tokenizations / LLM interactions.
  */
  currentSelection = () => {
    let rangySelection = rangy.getSelection();
    if (rangySelection.rangeCount > 0) {
      let anchorParent = rangySelection.anchorNode.parentNode;
      let focusParent = rangySelection.focusNode.parentNode;

      let startIndex = charIndex(anchorParent) + rangySelection.anchorOffset;
      let endIndex = charIndex(focusParent) + rangySelection.focusOffset;

      let selection = {
        charId: rangySelection.anchorNode.parentNode.id,
        rangy: rangySelection,

        // these can be used for computing span calculations
        anchor: rangySelection.anchorNode,
        anchorOffset: rangySelection.anchorOffset,
        focus: rangySelection.focusNode,
        focusOffset: rangySelection.focusOffset,

        // we use the above to calculate these helper variables
        // they may not be up to date if accessed during an input event
        // both indicies represent the 0 based index of the character that the cursor precedes
        // another way to think about it:
        // Each number counts the number of characters that precede it.
        // However, it is ambiguous from these two values alone whether the cursor is in the end of the span or the beginning of the next
        // in those cases, use the above values
        startIndex: startIndex, // TODO rename this startIndex
        endIndex: endIndex,

        // the text that is selected
        text: rangySelection.toString(),
      };

      return selection;
    }
    else {
      console.error('No selection');
    }

  };

  restoreSelection = (event) => {
    if (this.selection) {
      // TODO something about this seems to bug out occasionally (or maybe the place that calls this does?)
      // For a while I thought it was working when I changed anchorOffset to focusOffset (the wrong one...) but now it is buggy either way
      this.restoreSelectionFromCharId(this.selection.charId, this.selection.anchorOffset, event);
    }
  };

  restoreSelectionFromCharId = (charId, givenOffset, event) => {
    let node = document.getElementById(charId);
    let range = document.createRange();
    if (!node) {
      console.error('No node found with id', charId);
      // restore to the end of the editor, there is a more elegant way...
      range.selectNodeContents(this.contentRef.current);
      range.collapse(false);
    } else {
      let editLength = event.data ? event.data.length : 0;
      let charsToOffset = givenOffset - editLength;
      let tokensToOffset = givenOffset - charsToOffset;
      let restoreTo = node;
      for (let i = 0; i < tokensToOffset; i++) {
        restoreTo = restoreTo.nextSibling;
        // for some reason when this gives an error, it actually breaks and allows it to work okay?
      }
      range.setStart(restoreTo, charsToOffset);
      range.setEnd(restoreTo, charsToOffset);
    }

    // for debugging
    // let restoring = {
    //   text: node ? node.textContent : null,
    //   nextText: restoreTo ? restoreTo.textContent : null,
    //   givenOffset: givenOffset,
    //   eventDataLength: editLength,
    //   tokensToOffset: tokensToOffset,
    //   charsToOffset: charsToOffset,
    //   charId: charId,
    //   node: node,
    //   restoreTo: restoreTo,
    // };
    // console.log('restoring', restoring);

    let selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  };

  // Helper function to find the index path from a node up to the editorNode
  getNodeIndexPath = (node, editorNode) => {
    let path = [];
    while (node && node !== editorNode) {
      let parent = node.parentNode;
      if (!parent) {
        console.error('Node has no parent', node, node.textContent);
        return [];
      }
      let index = Array.prototype.indexOf.call(parent.childNodes, node);
      path.unshift(index); // Add index to the beginning of the path array
      node = parent; // Move up in the DOM tree
    }
    return path;
  };

  /* 
  * Split a span into multiple spans, each containing a single character.
  * If the span contains a character at index c, the new spans will have indicies c, c+1, c+2, etc.
  * If the span is unstyled (missing an ID and c attribute), assign a unique ID and set the c attribute to c, as well as a color.
  *
  * @param {HTMLElement} span - the span to split
  * @param {number} c - the character index of the span
  * @returns {number} the new character index
  */
  splitSpan(originalSpan, c) {
    // don't delete any spans, just add new ones and remove characters from the old span
    let text = originalSpan.textContent.replace(/\uFEFF/g, ''); // Remove BOM
    let newSpans = [];
    for (let i = 1; i < text.length; i++) {
      c += 1;
      let newSpan = this.createCharacterSpan(text[i], c);
      newSpans.push(newSpan);
    }
    // update the original span to contain just the first character
    originalSpan.textContent = text[0];
    // insert the new spans after the original span
    for (let i = newSpans.length - 1; i >= 0; i--) {
      let newSpan = newSpans[i];
      originalSpan.parentNode.insertBefore(newSpan, originalSpan.nextSibling);
    }
    return c;
  }

  setIdIfNotPresent(node) {
    // If the node does not have an id, assign it a unique id
    // also, react's content editable sometimes copies divs, leading to duplicate ids
    // if the id is not unique, assign a new id
    let shouldSetId = !node.id;
    if (node.id) {
      let elements = document.querySelectorAll(`#${node.id}`);
      if (elements.length > 1) {
        shouldSetId = true;
      }
    }

    if (shouldSetId) {
      node.id = getUniqueUUID();
    }
  }

  createCharacterSpan(text, c) {
    let span = document.createElement('span');
    span.textContent = text;
    this.styleCharacter(span, c);
    return span;
  }

  /* 
  * Apply our character style and create a character ID if there isn't one.
  *
  * <divs> <brs> and <spans> may all be considered characters.
  * If it is a span, check to see if it should be colored by looking up all active tokens.
  * (currently there is only one active token)
  * 
  * Also, set a unique character ID if it doesn't already exist for the span.
  */
  styleCharacter(child, c) {
    if (typeof c !== 'number') {
      console.error('styleChild called with', typeof c);
    } 

    child.setAttribute('c', c);
    this.setIdIfNotPresent(child);
    if (child.tagName === 'SPAN') {
      if (this.props.lenseToHighlight === 'basic') { // TODO make basicTokenize use onToken callback so that we don't have to do this
        this.colorCharacterByProb(child, c);
      }
    }
  }

  colorAllCharactersByProb() {
    // get all spans with a c attribute
    let spans = document.querySelectorAll('span[c]');
    for (let i = 0; i < spans.length; i++) {
      let span = spans[i];
      let c = charIndex(span);
      
      this.colorCharacterByProb(span, c);
    }
  }

  colorTokenByProb(token) {
    let start = token.start;
    let end = token.end;
    let color = getColor(this.props.lenseToHighlight, token);
    for (let i = start; i <= end; i++) { // [start, end] inclusive
      let span = document.querySelector(`span[c='${i}']`);
      if (span) {
        span.style.backgroundColor = color;
      } else {
        console.error('no span for', token)
      }
    }
  }

  colorCharacterByProb(child, c) {
    if (typeof c !== 'number') {
      console.error('colorCharacterByProb called with', typeof c);
    }

    if (this.tokenManager) {
      let tokensAt = this.tokenManager.tokensAt(this.props.lenseToHighlight, c);
      let color;
      if (tokensAt && tokensAt.length > 0) {
        let token = tokensAt[0];
        color = getColor(this.props.lenseToHighlight, token);
      } else {
        color = getColor('basic', {});
      }
      child.style.backgroundColor = color;

    } else {
      console.error('No token manager to color');
    }
  }

  /*
  * Split the content into individual characters and apply the appropriate styles.
  */
  splitIntoCharactersAndStyle(content) {

    function* traverseDOM(node) {
      if ((node.tagName === 'DIV' || node.tagName === 'SPAN' || node.tagName === 'BR')
        // and its not div.editor
        && node.className !== 'editor'
        // and it is not a rangy selection marker (id contains the string selectionBoundary)
        && !node.id.includes('selectionBoundary')) {
        yield node;
      }

      for (const child of node.childNodes) {
        yield* traverseDOM(child);
      }
    }

    let children = [...traverseDOM(content)];

    let i = 0;
    let c = 0;
    let child = children[i];

    if (!child) {
      let text = content.textContent;
      content.innerHTML = '';
      for (let i = 0; i < text.length; i++) {
        let span = this.createCharacterSpan(text, i);
        content.appendChild(span);
      }
    }

    while (child) {
      if (child.tagName == "BR") {
        i++;
        child = children[i];
        continue;
      }

      this.styleCharacter(child, c);

      if (child.tagName === 'SPAN') {
        let text = child.textContent;
        if (text.length > 1) {
          // split the span into multiple spans
          // and update the running character index based on the number of new spans
          c = this.splitSpan(child, c);
        }
      } else if (child.tagName === 'DIV') {
        // console.log('DIV splitting', child);
      }

      i++;
      c++;
      child = children[i];
    }
  }

  /**
   * Extracts the text content from a contenteditable element, preserving explicit line breaks.
   *
   * This function clones the provided element to avoid altering the original content. It then
   * replaces <br> tags and the beginnings of <div> tags with newline characters to preserve
   * the visual representation of line breaks. The function does not modify <span> tags, as they
   * are not typically associated with line breaks. The modified content is then returned as a
   * single string with preserved line breaks.
   *
   * @param {HTMLElement} element - The contenteditable element from which to extract text.
   * @returns {string} The text content of the element with \n characters in place of <br> and <div> tags.
  */
  getTextWithWhitespace(element) {
    let clone = element.cloneNode(true);

    // Replace <br> tags with \n
    clone.querySelectorAll('br').forEach(br => br.replaceWith('\n'));

    // Replace block elements like <div> with \n and maintain their content
    clone.querySelectorAll('div').forEach(div => {
      div.replaceWith('\n', ...div.childNodes);
    });

    // Extract the textContent from the cloned element
    return clone.textContent;
  }

  /* 
   * Split the text into individual tokens according to the tokenization strategy specified by the current token.
   * After the tokenization is complete, the token manager will call the onFinished function, which typically
   * involves attempting to tokize one more time, as the tokenization may have been incomplete if the user continued to type.
  */
  tokenizeOnTextUpdate(text, lense, callDepth = 0) {
    if (this.tokenManager) {
      let curTokens = this.tokenManager.tokens[lense];

      let tokenizeRange  = TokenManager.getUntokenizedRange(text, curTokens);
      let shouldTokenize = TokenManager.shouldTokenize(text, tokenizeRange, lense);

      // We keep track of the call depth because we want to check to see if there is more tokenization
      // to take care of after the user has finished typing (some requests may have been denied by the server
      // due to rate limiting) while typing. TODO this is a bit of a hack and could be cleaned up
      shouldTokenize = shouldTokenize && callDepth < 2; 

      if (!shouldTokenize) return;

      // Define a function to call after tokenization is complete ()
      let onFinished = () => {
        // TODO there is a potential problem where the selection has been updated since the last time we saved it
        // This could happen if the user navigates with the arrow keys for instance, so perhpas we want to save the selection during arrows
        let newText = this.getTextWithWhitespace(this.contentRef.current);
        this.tokenizeOnTextUpdate(newText, lense, callDepth + 1);
      };

      let data = {
        tokenizeRange: tokenizeRange,
        onFinished: onFinished.bind(this),
      };

      this.tokenManager.tokenize(text, data);
    }
  }

  forceTokenize(prisms=this.tokenManager.activePrismNames) {
    let document = new Document(
      this.getTextWithWhitespace(this.contentRef.current),
      this.selectionBeforeInput, // this may be out of date?
      this.tokenManager
    );
    
    if (prisms.length < 1) {
      return;
    }

    let data = { tokenizeRange: document.range, document: document }; // old versions of tokenizers still use tokenizeRange, should be depracated
    let lense = prisms[0];
    let remainingLenses = prisms.slice(1);

    if (remainingLenses && remainingLenses.length > 0) {
      let onFinished = () => { this.forceTokenize(remainingLenses); };
      data['onFinished']= onFinished.bind(this);
    }

    this.tokenManager.tokenize(document.text, data, prisms=[lense]);
  }

  manualRetokenizeAction() {
    console.log('manually tokenizing');
    this.forceTokenize();
    this.splitIntoCharactersAndStyle(this.contentRef.current);
  }

  manualSearchAction() {

    let document = new Document(
      this.getTextWithWhitespace(this.contentRef.current),
      this.selectionBeforeInput,
      this.tokenManager
    );

    console.log('manually searching', document.selectionText);

    this.props.doSearch(document);
  }

  /*
   * Handles keydown events to save the selection before the input event is processed and the text changed.
  */
  onKeyDown(event) {
    this.selectionBeforeInput = this.currentSelection();
  }

  

  onClick = (event) => {
    this.selectionBeforeInput = this.currentSelection();

    // // show the token-range if there is a selection of non-zero length
    this.props.setSelection(this.selectionBeforeInput);
  };

  /*
    Bugs:
      TODO spaces aren't being saved correctly on firefox (works on Chrome)
  */
  onInput = (event) => {

    // Save the current selection to restore later after processing input
    this.selection = this.currentSelection();

    // update the state text
    let newText = this.getTextWithWhitespace(this.contentRef.current);

    // update each modified token (currently broken)
    this.tokenManager.synchronizeTokens(this.selection, this.selectionBeforeInput, event);

    // pass the new text into the tokenizer to update its token list and associated character indices
    this.tokenizeOnTextUpdate(newText, this.props.lenseToHighlight);

    // give the new text to the parent
    if (this.props.setText) {
      this.props.setText(newText);
    }

    this.splitIntoCharactersAndStyle(this.contentRef.current);

    // Use a timeout to delay execution of restoring the selection
    // This ensures that the DOM updates have completed before the selection is restored
    setTimeout(() => {
      this.restoreSelection(event);
    }, 0);
  };

  /* 
  * Update the text content of the editor from {start} to {end} with {newText}. 
  * 
  * @param {number} start - the start index of the text to replace (inclusive)
  * @param {number} end - the end index of the text to replace (inclusive)
  * @param {string} newText - the new text to display
  */ 
  swapText = (start, end, newText) => {
    let startSpan = document.querySelector(`span[c='${start}']`);
    let endSpan = document.querySelector(`span[c='${end}']`);

    // select the text to replace
    let range = document.createRange();
    range.setStart(startSpan, 0);
    range.setEnd(endSpan, 1);

    // create a span for the new text
    let newSpan = document.createElement('span');
    newSpan.textContent = newText;

    let oldText = range.toString();

    console.log('start span', startSpan, 'end span', endSpan)
    console.log('swap text', start, end, 'for', newText, 'from', oldText);

    // replace the text
    range.deleteContents();
    range.insertNode(newSpan);

    // style the new text
    this.splitIntoCharactersAndStyle(this.contentRef.current);
  }


  render() {
    this.colorAllCharactersByProb(); // TODO this shouldn't called here

    window.swapText = this.swapText.bind(this);

    return (
      <div
        className="editor"
        ref={this.contentRef}
        contentEditable
        dangerouslySetInnerHTML={{ __html: this.state.content }}
      ></div>
    );
  }
}
