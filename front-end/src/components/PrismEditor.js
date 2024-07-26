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
function getCharIndex(span) {
  if (span === null) return null;
  return parseInt(span.getAttribute('c'));
}

// A text editor that tracks all sorts of information about the words as they are typed
// And provides affordances for pulling in information from different sources, reconciling their tokens
export class PrismEditor extends Component {
  constructor(props) {
    super(props);
    this.state = { content: ''};
    this.contentRef = React.createRef();
    this.tokenManager = this.props.tokenManager;
    this.tokenManager.setOnToken(this.updateUITokens.bind(this));
  }

  componentDidMount() {
    this.editorNode = this.contentRef.current;

    // this.startObserver();
    
    this.editorNode.addEventListener('input', this.onInput);
    this.editorNode.addEventListener('click', this.onClick);
    this.editorNode.addEventListener('keydown', this.onKeyDown.bind(this));
    // this.editorNode.addEventListener('focus', this.handleFocus);

    let initializationText = "a";
    let content = [];
    let initialId = getUniqueUUID();
    for (let i = 0; i < initializationText.length; i++) {
      let c = initializationText[i];
      let id = getUniqueUUID();
      if (i === 0) { initialId = id; }
      content.push(`<span id=${id} c=${i}>${c}</span>`);
    }
    if (content.length === 0) {
      content.push(`<span id=${initialId} c="0"></span>`);
    }

    // this.state = { content: content.join("") };
    this.setState({content: content.join("")}, () => {
      this.editorNode.innerHTML = content.join("");

      if (initializationText?.length > 0) this.tokenManager.tokenize(initializationText);
  
      if (this.props.setText) {
        this.props.setText(initializationText); // give the new text to the parent
      }
  
      setTimeout(() => this.moveSelectionToEndOfEditor(), 0);
    });
  }

  startObserver() {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        console.log("Mutation detected:", mutation);
        this.moveSelectionToEndOfEditor(); // Adjust this to your context
      });
    });
    observer.observe(this.editorNode, { childList: true, subtree: true });
  }

  componentWillUnmount() {
    this.editorNode.removeEventListener('input', this.onInput);
    this.editorNode.removeEventListener('click', this.onClick);
    this.editorNode.removeEventListener('keydown', this.onKeyDown);
    // this.editorNode.removeEventListener('focus', this.handleFocus);
  }

  componentDidUpdate(prevProps, prevState) {
    if (this.state.content !== prevState.content) {
      console.log('content updated', this.state.content);
    }
  }

  /*
   * Triggered when user types something, pastes, or deletes.
   * TODO Bugs:
   *        - spaces aren't being saved correctly on firefox (works on Chrome)
  */
  onInput = (event) => {
    // Save the current selection to restore later after processing input
    // this.selection = this.currentSelection();

    // turn the text into styled character spans: <span>a</span><span>b</span>
    this.splitIntoCharactersAndStyle(this.contentRef.current);

    // update the state text
    let newText = this.getTextWithWhitespace(this.contentRef.current);

    // update each modified token (currently broken)
    this.tokenManager.synchronizeTokens(this.selectionBeforeInput, this.selectionBeforeInput, event);

    // pass the new text into the tokenizer to update its token list and associated character indices
    this.tokenizeOnTextUpdate(newText, this.props.lenseToHighlight);

    // give the new text to the parent component
    if (this.props.setText) { this.props.setText(newText); }

    // Use a timeout to delay execution of restoring the selection
    // This ensures that the DOM updates have completed before the selection is restored
    setTimeout(() => {
      this.restoreSelection(event);
    }, 0);
  };

  /* 
  * Return the current cursor selection. Used to restore the cursor after user input. Also used for
  * other calculations, such as determining which tokens the user is editing and to construct prompts
  * for the various tokenizations / LLM interactions.
  */
  currentSelection = () => {
    let windowSelection = rangy.getSelection();
    if (windowSelection.rangeCount > 0) {
      
      let anchorSpan = windowSelection.anchorNode.parentNode;
      let focusSpan  = windowSelection.focusNode.parentNode;

      let anchor = windowSelection.anchorNode; // might be div, span, or text
      let focus  = windowSelection.focusNode;

      if (anchor.tagName === 'SPAN') {
        anchorSpan = anchor;
        focusSpan = focus;
      }

      if (anchor.tagName === 'DIV') {
        anchorSpan = anchor;
        focusSpan = focus;
      }

      let startIndex = getCharIndex(anchorSpan) + windowSelection.anchorOffset;
      let endIndex = getCharIndex(focusSpan) + windowSelection.focusOffset;

      // console.log('selection', windowSelection);
      // console.log('anchorparent', anchorSpan, 'anchor', anchor)
      let charId = anchorSpan.id;
      console.log('charId', charId, anchorSpan)

      let selection = {
        // charId: rangySelection.anchorNode.id,
        charId: charId,
        rangy: windowSelection,

        // these can be used for computing span calculations
        anchor: anchor,
        anchorOffset: windowSelection.anchorOffset,
        focus: focus,
        focusOffset: windowSelection.focusOffset,
        achorSpan: anchorSpan,
        focusSpan: focusSpan,

        // we use the above to calculate these helper variables
        // they may not be up to date if accessed during an input event
        // both indicies represent the 0 based index of the character that the cursor precedes
        // another way to think about it:
        // Each number counts the number of characters that precede it.
        // However, it is ambiguous from these two values alone whether the cursor is in the end of the span or the beginning of the next
        // in those cases, use the above values
        startIndex: startIndex,
        endIndex: endIndex,

        // the text that is selected
        text: windowSelection.toString(),
      };
      console.log('currentSelection', selection)
      // log a copy of the selection
      // let copy = JSON.parse(JSON.stringify(selection));
      // console.log('currentSelection', copy);
      return selection;
    }
    else {
      console.error('No selection');
    }
  };

  restoreSelection(event) {
    if (this.selectionBeforeInput) {
      console.log('restoring selection', this.selectionBeforeInput);
      // TODO something about this seems to bug out occasionally (or maybe the place that calls this does?)
      // For a while I thought it was working when I changed anchorOffset to focusOffset (the wrong one...) but now it is buggy either way
      this.restoreSelectionFromCharId(this.selectionBeforeInput.charId, this.selectionBeforeInput.anchorOffset, event);
    }
  };

  // cursed
  restoreSelectionFromCharId(charId, originalOffset, event) {

    function getTextLength(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        // Node is a text node
        return node.textContent.length;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        // Node is an element
        return node.innerText.length;
      } else {
        // Unsupported node type
        return 0;
      }
    }

    try {
      let node = document.getElementById(charId);
      if (node === null) {
        console.error('restore->No node found with id', charId);
        this.moveSelectionToEndOfEditor();
      }

      let range = rangy.createRange();
      let editLength = getEditLength(event);

      // editLength = finalOffset + remainingOffset - originalOffset

      // let remainingOffset = editLength;
      let remainingOffset = editLength + originalOffset;
      // let finalOffset = 0;
      // let restoreTo = node;
      // for (let i = 0; i < remainingOffset; i++) {
      //   let nextChar = getNextChar(restoreTo);
      //   if (nextChar !== null) {
      //     restoreTo = nextChar; // assumes each sibling has a 1 width...
      //   } else {
      //     finalOffset += 1;
      //     break;
      //   }
      // }

      let restoreTo = node;
      while(true) {
        // let textLength = getTextLength(restoreTo);
        let textLength = 1;
        if (remainingOffset <= textLength) {
          break;
        }
        remainingOffset -= textLength;
        let next = getNextChar(restoreTo);
        if (next === null) {
          break;
        }
        restoreTo = next;
      }

      let finalOffset = remainingOffset;

      console.log("restore to", restoreTo, "finalOffset", finalOffset, "editLength", editLength, "initialOffset", originalOffset, "event", event);
      range.setStart(restoreTo, finalOffset);
      range.setEnd(restoreTo, finalOffset);

      let selection = rangy.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    }
    catch (e) {
      console.error('restoreSelectionFromCharId', e);
    }
  };

  /*
   * Color all the characters between token.start and token.end based on token.prob
   * Force the component to update.
  */
  updateUITokens(token) {
    if (this.props.lenseToHighlight === token.type) {
      this.colorCharSpanByToken(token);
      this.forceUpdate(); // trigger a rerender of the editor
    }
  }

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

  setCursorPosition(inputElement, position) {
      if (inputElement.setSelectionRange) {
          inputElement.focus();
          inputElement.setSelectionRange(position, position);
      }
  }

  moveSelectionToEndOfEditor() {
    // let range = rangy.createRange();
    let lastSpan = this.editorNode.querySelector("span:last-child");
    let textNode = lastSpan.firstChild;
    
    // If there's no text node, create one
    if (!textNode || textNode.nodeType !== Node.TEXT_NODE) {
        textNode = document.createTextNode('');
        lastSpan.appendChild(textNode);
    }
    
    let offset = textNode.length;

    let range = rangy.createRange();
    range.setStart(textNode, offset);
    range.setEnd(textNode, offset);


    // set the focus to the editor


    this.editorNode.focus();
    let selection = rangy.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);

    console.log("selection moved to to end of editor", lastSpan, textNode, offset, selection);

    // const testChar = document.createTextNode('|');
    // range.insertNode(testChar);
  }

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
    console.log("splitspan", originalSpan, c)
    // don't delete any spans, just add new ones and remove characters from the old span
    let text = originalSpan.textContent.replace(/\uFEFF/g, ''); // Remove BOM
    let newSpans = [];
    for (let i = 1; i < text.length; i++) {
      c += 1;
      const [newSpan, id] = this.createCharacterSpan(text[i], c);
      newSpans.push(newSpan);
    }
    // update the original span to contain just the first character
    originalSpan.textContent = text[0];
    // insert the new spans after the original span
    for (let i = newSpans.length - 1; i >= 0; i--) {
      let newSpan = newSpans[i];
      originalSpan.parentNode.insertBefore(newSpan, originalSpan.nextSibling);
    }
    return [c, newSpans];
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
      return node.id;
    }
    return null;
  }

  createCharacterSpan(text, c) {
    let span = document.createElement('span');
    span.textContent = text;
    let newID = this.styleCharacter(span, c);
    console.log("creating span", span, c, text)
    return [span, newID];
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
  styleCharacter(element, c) {
    // console.log("styling", child, c, child.textContent)

    if (typeof c !== 'number') {
      console.error('styleChild called with', typeof c);
    } 

    element.setAttribute('c', c);
    let createdID = this.setIdIfNotPresent(element);
    if (element.tagName === 'SPAN') {
      if (this.props.lenseToHighlight === 'basic') { // TODO make basicTokenize use onToken callback so that we don't have to do this
        this.colorCharacterByProb(element, c);
      }
    }
    return createdID;
  }

  colorAllCharactersByProb() {
    // get all spans with a c attribute
    let spans = document.querySelectorAll('span[c]');
    for (let i = 0; i < spans.length; i++) {
      let span = spans[i];
      let c = getCharIndex(span);
      
      this.colorCharacterByProb(span, c);
    }
  }

  colorCharSpanByToken(token) {
    let start = token.start;
    let end = token.end;
    let color = getColor(this.props.lenseToHighlight, token);
    for (let i = start; i <= end; i++) { // [start, end] inclusive
      let span = document.querySelector(`span[c='${i}']`);
      if (span) {
        span.style.backgroundColor = color;
        continue;
      } 
      let div = document.querySelector(`div[c='${i}']`); // TODO
      if (div) {
        // nothing needs to be done to color a new line character
        continue;
      }
      console.error("coloring-> no span for", token)
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
    let child = children[0];

    let newSpans = [];

    if (!child) {
      let text = content.textContent;
      content.innerHTML = '';
      for (let i = 0; i < text.length; i++) {
        const [span, newID] = this.createCharacterSpan(text, i);
        content.appendChild(span);
        newSpans.push(span);
      }
    }

    while (child) {
      if (child.tagName == "BR") {
        i++;
        child = children[i];
        continue;
      }

      let newID = this.styleCharacter(child, c);
      if (newID !== null) {
        newSpans.push(child);
      }

      if (child.tagName === 'SPAN') {
        let text = child.textContent;
        if (text.length > 1) {
          // split the span into multiple spans
          // and update the running character index based on the number of new spans
          const [newC, brandNewSpans] = this.splitSpan(child, c);
          c = newC;
          newSpans.push(...brandNewSpans);
        }
      } else if (child.tagName === 'DIV') {
        // console.log('DIV splitting', child);
      }

      i++;
      c++;
      child = children[i];
    }
    return newSpans;
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
    if (prisms.length < 1) { return; }

    let document = new Document(
      this.getTextWithWhitespace(this.contentRef.current),
      this.selectionBeforeInput, // this may be out of date?
      this.tokenManager
    );
    
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
    this.onKeyDown();

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
  * Update the text content of the editor from {start} to {end} with {newText}. 
  * 
  * @param {number} start - the start index of the text to replace (inclusive)
  * @param {number} end - the end index of the text to replace (inclusive)
  * @param {string} newText - the new text to display
  */ 
  swapText = (start, end, newText) => {
    // let startSpan = document.querySelector(`span[c='${start}']`);
    // let endSpan = document.querySelector(`span[c='${end}']`);

    // // select the text to replace
    // let range = rangy.createRange();
    // range.setStart(startSpan, 0);
    // range.setEnd(endSpan, 1);

    // // create a span for the new text
    // let newSpan = document.createElement('span');
    // newSpan.textContent = newText;

    // let oldText = range.toString();

    // console.log('start span', startSpan, 'end span', endSpan)
    // console.log('swap text', start, end, 'for', newText, 'from', oldText);

    // // replace the text
    // range.deleteContents();
    // range.insertNode(newSpan);

    // // style the new text
    // this.splitIntoCharactersAndStyle(this.contentRef.current);
  }

  // handleFocus = (event) => {
  //   console.log('focus', event);
  //   // this.moveSelectionToEndOfEditor();
  //   setTimeout(() => this.moveSelectionToEndOfEditor(), 0);
  // };


  render() {
    // this.colorAllCharactersByProb(); // TODO this shouldn't called here
    return (
      <div
        className="editor"
        ref={this.contentRef}
        contentEditable
        dangerouslySetInnerHTML={{ __html: this.state.content }}
        // onFocus={this.handleFocus}
      ></div>
    );
  }
}
function getEditLength(event) {
  if (event.inputType === 'insertText') {
    return event.data ? event.data.length : 0;
  } else if (event.inputType === 'deleteContentBackward') {
    return -1;
  } else if (event.inputType === 'deleteContentForward') {
    return -1;
  } else if (event.inputType === 'deleteContent') {
    return -1;
  } else if (event.inputType === 'insertParagraph') {
    return 1; // currently a bug where we add two characters on paragraph
  } else if (event.inputType === 'insertLineBreak') {
    return 1;
  } else if (event.inputType === 'insertFromPaste') {
    return event.data ? event.data.length : 0;
  }
  console.error('unexpected event', event.inputType, event);
}

function getNextChar(node) {
  if (node.tagName === 'DIV') {
    if (node.firstChild !== null) {
      return node.firstChild;
    }
  }

  if (node.nextSibling !== null) {
    return node.nextSibling;
  }
  if (node.parentNode.nextSibling !== null) {
    return node.parentNode.nextSibling.firstChild; // we will want to do this if we get rid of the extra spans
    // return node.parentNode.nextSibling;
  }
  return null;
}