import React, { Component } from "react";
import rangy from 'rangy';
import { getUniqueUUID, insertAfter } from "../scripts/utils";
import { TokenManager } from "../base/TokenManager";
import { getColor } from "../scripts/color";
import { Document } from "../base/Document";

/* 
* Given character span <span c="5" id="id14acbb15b7e0e"">f</span>
* return our previously computed character offset based on the 'c' attribute
*/
function getCharIndex(span) {
  try {
    if (span) {
      return parseInt(span.getAttribute('c'));
    }
  } catch (e) {
    console.error('getCharIndex called with null span', span);
    return null;
  }
}

// A text editor that tracks all sorts of information about the words as they are typed
// And provides affordances for pulling in information from different sources, reconciling their tokens
export class PrismEditor extends Component {
  constructor(props) {
    super(props);
    this.state = { content: ''};
    this.contentRef = React.createRef();
    this.tokenManager = this.props.tokenManager;
    this.tokenManager.setOnToken(this.updateUITokens.bind(this)); // Claude says this causes many unnecessary re-renders and updates could be batched 
  }

  componentDidMount() {
    this.editorNode = this.contentRef.current;

    this.editorNode.addEventListener('input', this.onInput);
    this.editorNode.addEventListener('click', this.onClick);
    this.editorNode.addEventListener('keydown', this.onKeyDown.bind(this));
    this.editorNode.addEventListener('keyup', this.onKeyUp.bind(this));
    this.editorNode.addEventListener('paste', this.handlePaste);

    // this.editorNode.addEventListener('focus', this.handleFocus);

    let initializationText = "E";
    let testingText = `I arrived without a ladder, deciding it was better to be on time than prepared.`
// shackled gravitywell

// tickticking pendulum
// my parabolic mind swing swung swooning
// passing yo's
// to yesterday's mind farts
// like a yo yo
// yearning for the slow mo light show
// of the Wizard's laser harmonograph
// set to Meyer's ever so slowed concertos

// the yo of a slowly slung
// back sack on a stick
// stacked as high as a homesick friend's
// ransacked slapstick back whack

// which stings 
// as a shot on the neck
// flings the stupor at your breakneck fact check`

    initializationText = testingText; // comment this out to be normal
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

    window.editorNode = this.editorNode;
    window.currentSelection = this.currentSelection.bind(this);
  } // didMount

  componentWillUnmount() {
    this.editorNode.removeEventListener('input', this.onInput);
    this.editorNode.removeEventListener('click', this.onClick);
    this.editorNode.removeEventListener('keydown', this.onKeyDown);
    this.editorNode.removeEventListener('keyup', this.onKeyUp);
    this.editorNode.removeEventListener('paste', this.handlePaste);
    // this.editorNode.removeEventListener('focus', this.handleFocus);
  }

  componentDidUpdate(prevProps, prevState) {
    if (this.state.content !== prevState.content) {
      // console.log('content updated', this.state.content);
    }
  }

  /*
   * Triggered when user types something, pastes, or deletes.
   * TODO Bugs:
   *        - spaces aren't being saved correctly on firefox (works on Chrome)
  */
  onInput = (event) => {
    // turn the text into styled character spans: <span>a</span><span>b</span>
    // this.splitIntoCharactersAndStyle(this.contentRef.current);

    // update the state text
    let newText = getTextWithWhitespace(this.contentRef.current);

    // // update each modified token (currently broken)
    // this.tokenManager.synchronizeTokens(this.keyDownSelection, this.keyDownSelection, event);

    // // pass the new text into the tokenizer to update its token list and associated character indices
    // this.tokenizeOnTextUpdate(newText, this.props.lenseToHighlight); // TODO this will be prismToHighlight when we bring it back

    // give the new text to the parent component
    if (this.props.setText) { this.props.setText(newText); }

    // Use a timeout to delay execution of restoring the selection
    // This ensures that the DOM updates have completed before the selection is restored
    // setTimeout(() => {
    //   this.restoreSelection(event);
    // }, 0);
  };

  /* 
  * Return the current cursor selection. Used to restore the cursor after user input. Also used for
  * other calculations, such as determining which tokens the user is editing and to construct prompts
  * for the various tokenizations / LLM interactions.
  */
  currentSelection() {
    let windowSelection = rangy.getSelection();
    
    if (windowSelection.rangeCount > 0) {
      let anchorSpan = windowSelection.anchorNode.parentNode;
      let focusSpan  = windowSelection.focusNode.parentNode;

      let anchor = windowSelection.anchorNode; // might be div, span, or text
      let focus  = windowSelection.focusNode;

      if (anchor.tagName === 'SPAN') {
        anchorSpan = anchor;
        focusSpan  = focus;
      }

      if (anchor.tagName === 'DIV') {
        anchorSpan = anchor;
        focusSpan  = focus;
      }

      let startIndex = getCharIndex(anchorSpan) + windowSelection.anchorOffset;
      let endIndex = getCharIndex(focusSpan) + windowSelection.focusOffset;

      // super slow but more robust than the other options
      let offset = null;
      try {
        offset = getCursorOffsetInDiv(this.editorNode);
      } catch (e) {
        console.error('Error getting cursor offset', e);
      }

      let selection = {
        charId: anchorSpan.id,
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

        prefixOffset: offset,

        // the text that is selected
        text: windowSelection.toString(),
      };
      return selection;
    }
    else {
      console.error('No selection');
    }
  };

  restoreSelection(event) { // TODO this should use the event data again
    if (this.keyUpSelection) {
      setCursorAtOffset(this.editorNode, this.keyUpSelection.prefixOffset);
    }
  }

  /*
   * Color all the characters between token.start and token.end based on token prob
   * Force the component to update.
  */
  updateUITokens(token) {
    if (this.props.prismToHighlight.tokenType === token.type) {
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

    // hold this for debugging until I fix the first character focus issue
    // const testChar = document.createTextNode('|');
    // range.insertNode(testChar);
  }

  /* 
   * Split the text into individual tokens according to the tokenization strategy specified by the current token.
   * After the tokenization is complete, the token manager will call the onFinished function, which typically
   * involves attempting to tokize one more time, as the tokenization may have been incomplete if the user continued to type.
  */
  tokenizeOnTextUpdate(text, tokenType, callDepth = 0) {
    if (this.tokenManager) {
      let curTokens = this.tokenManager.tokens[tokenType];
      if (!curTokens) {
        console.error('on text update tokenType not found', tokenType);
        return;
      }

      let tokenizeRange  = TokenManager.getUntokenizedRange(text, curTokens);
      let shouldTokenize = TokenManager.shouldTokenize(text, tokenizeRange, tokenType);

      // We keep track of the call depth because we want to check to see if there is more tokenization
      // to take care of after the user has finished typing (some requests may have been denied by the server
      // due to rate limiting) while typing. TODO this is a bit of a hack and could be cleaned up
      shouldTokenize = shouldTokenize && callDepth < 2; 

      if (!shouldTokenize) return;

      // Define a function to call after tokenization is complete ()
      let onFinished = () => {
        // TODO there is a potential problem where the selection has been updated since the last time we saved it
        // This could happen if the user navigates with the arrow keys for instance, so perhpas we want to save the selection during arrows
        let newText = getTextWithWhitespace(this.contentRef.current);
        this.tokenizeOnTextUpdate(newText, tokenType, callDepth + 1);
      };

      let data = {
        tokenizeRange: tokenizeRange,
        onFinished: onFinished.bind(this),
      };

      this.tokenManager.tokenize(text, data);
    }
  }

  forceTokenize(prisms=this.tokenManager.activePrisms) {
    console.log("force tokenizing prisms", prisms)
    if (prisms.length < 1) { return; }

    let document = new Document(
      getTextWithWhitespace(this.contentRef.current),
      this.keyDownSelection, // this may be out of date?
      this.tokenManager
    );
    
    let data = { tokenizeRange: document.range, document: document }; // old versions of tokenizers still use tokenizeRange, should be depracated
    let curPrism = prisms[0];
    let remaining = prisms.slice(1);

    if (remaining && remaining.length > 0) {
      let onFinished = () => { this.forceTokenize(remaining); };
      data['onFinished']= onFinished.bind(this);
    }

    this.tokenManager.tokenize(document.text, data, prisms=[curPrism]);
  }

  manualRetokenizeAction() {
    console.log('manually tokenizing');
    this.forceTokenize();
    this.splitIntoCharactersAndStyle(this.contentRef.current);
    setTimeout(() => {
      this.restoreSelection();
    }, 0);
  }

  manualSearchAction() {
    this.onKeyDown();
    this.manualRetokenizeAction();

    let document = new Document(
      getTextWithWhitespace(this.contentRef.current),
      this.keyDownSelection,
      this.tokenManager
    );

    console.log('manually searching', document.selectionText);
    this.props.doSearch(document);
  }

  /*
   * Handles keydown events to save the selection before the input event is processed and the text changed.
  */
  onKeyDown(event) {
    this.keyDownSelection = this.currentSelection();
  }

  /*
   * Handles keydown events to save the selection before the input event is processed and the text changed.
  */
  onKeyUp(event) {
    this.keyUpSelection = this.currentSelection();
  }

  onClick = (event) => {
    this.updateSelection();
  };

  handlePaste = (event) => {
    event.preventDefault();
    const text = (event.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, text);
    this.splitIntoCharactersAndStyle(this.contentRef.current);
  };

  // to call upon other actions that modify the selection
  updateSelection = () => {
    let selection = this.currentSelection();
    this.keyDownSelection = selection;
    this.keyUpSelection   = selection;
    this.props.setSelection(selection); // give the new selection to the parent
    return selection;
  }

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
    console.log('start span', startSpan, 'end span', endSpan, start, end, newText)


    // select the text to replace
    let range = rangy.createRange();
    range.setStart(startSpan, 0);
    range.setEnd(endSpan, 1);

    // create a span for the new text
    let newSpan = document.createElement('span');
    newSpan.textContent = newText;

    let oldText = range.toString();
    console.log('swap text', start, end, 'for', newText, 'from', oldText);

    // Get the parent node before deleting contents
    // let startParent = startSpan.parentNode;
    // let endParent = endSpan.parentNode;

    // replace the text
    range.deleteContents();
    range.insertNode(newSpan);

    // Explicitly remove the start span if it's empty
    // startParent.removeChild(startSpan);
    // endParent.removeChild(endSpan)
    startSpan.remove() // TODO these lines seem to make it so that the selection later isn't accessable I think I'm deleteing the rangy ranges
    endSpan.remove()

    // // style the new text
    this.splitIntoCharactersAndStyle(this.contentRef.current);

    // Create a new range for the inserted text
    let newRange = rangy.createRange();
    newRange.selectNodeContents(newSpan);

    // Select the new range
    let selection = rangy.getSelection();
    selection.removeAllRanges();
    selection.addRange(newRange);

    console.log('selection', selection, selection.anchorOffset, selection.focusOffset, 'range', newRange, newRange.startOffset, newRange.endOffset);
    this.updateSelection();
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
    // don't delete any spans, just add new ones and remove characters from the old span
    // let text = originalSpan.textContent.replace(/\uFEFF/g, ''); // Remove BOM
    let text = originalSpan.textContent;
    let newSpans = [];
    for (let i = 1; i < text.length; i++) {
      c += 1;
      const [newSpan, id] = this.createCharacterSpan(text[i], c);
      newSpans.push(newSpan);
    }
    // update the original span to contain just the first character
    originalSpan.innerHTML = text[0];
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
    let newID = this.setSpanAttributes(span, c);
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
  setSpanAttributes(element, c) {
    if (typeof c !== 'number') {
      console.error('styleChild called with', typeof c);
    } 

    element.setAttribute('c', c);
    let createdID = this.setIdIfNotPresent(element);
    if (element.tagName === 'SPAN') {
      if (this.props.prismToHighlight.tokenType === 'basic') { // TODO make basicTokenize use onToken callback so that we don't have to do this
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
    let color = getColor(this.props.prismToHighlight.tokenType, token);
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

    let tokenType = this.props.prismToHighlight.tokenType;
    if (this.tokenManager) {
      let tokensAt = this.tokenManager.tokensAt(tokenType, c);
      let color;
      if (tokensAt && tokensAt.length > 0) {
        let token = tokensAt[0];
        color = getColor(tokenType, token);
      } else {
        color = getColor('basic', {});
      }
      console.log('coloring', tokenType, 'at', c, color);
      child.style.backgroundColor = color;

    } else {
      console.error('No token manager to color');
    }
  }

  /*
  * Split the content into individual characters and apply the appropriate styles.
  */
  splitIntoCharactersAndStyle(content) {
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

      let newID = this.setSpanAttributes(child, c);
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

      }

      i++;
      c++;
      child = children[i];
    }
    return newSpans;
  }

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

// function getEditLength(event) {
//   if (event.inputType === 'insertText') {
//     return event.data ? event.data.length : 0;
//   } else if (event.inputType === 'deleteContentBackward') {
//     return -1;
//   } else if (event.inputType === 'deleteContentForward') {
//     return -1;
//   } else if (event.inputType === 'deleteContent') {
//     return -1;
//   } else if (event.inputType === 'insertParagraph') {
//     return 1; // currently a bug where we add two characters on paragraph
//   } else if (event.inputType === 'insertLineBreak') {
//     return 1;
//   } else if (event.inputType === 'insertFromPaste') {
//     return event.data ? event.data.length : 0;
//   }
//   console.error('unexpected event', event.inputType, event);
// }

// function getNextChar(node) {
//   if (node.tagName === 'DIV') {
//     if (node.firstChild !== null) {
//       return node.firstChild;
//     }
//   }

//   if (node.nextSibling !== null) {
//     return node.nextSibling;
//   }
//   if (node.parentNode.nextSibling !== null) {
//     return node.parentNode.nextSibling.firstChild; // we will want to do this if we get rid of the extra spans
//     // return node.parentNode.nextSibling;
//   }
//   return null;
// }

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

function getCursorOffsetInDiv(editor) {
  var sel = rangy.getSelection();
  if (sel.rangeCount > 0) {
    var range = sel.getRangeAt(0);
    var preCaretRange = range.cloneRange(); // Clone the range
    preCaretRange.selectNodeContents(editor); // Select all contents within the div
    preCaretRange.setEnd(range.endContainer, range.endOffset); // Set the end of the range to the cursor position

    // Extract the container of the range as a fragment
    var container = document.createElement("div");
    container.appendChild(preCaretRange.cloneContents());

    // Use the provided getTextWithWhitespace function to include divs and brs correctly
    var textContent = getTextWithWhitespace(container);

    return textContent.length; // Return the corrected length of the string in the range
  }

  return 0; // No range found, or no selection
}

function setCursorAtOffset(editor, offset) {
  try {
    var currentOffset = 0;
    var found = false;

    // Helper function to traverse the nodes
    function traverseNodes(node) {
      if (node.nodeType === 3) { // Text node
        var nextOffset = currentOffset + node.length;
        if (offset <= nextOffset) {
          rangy.getSelection().collapse(node, offset - currentOffset);
          found = true;
          return; // Found the position, exit the traversal
        }
        currentOffset = nextOffset;
      } else if (node.nodeType === 1) { // Element node (e.g., <div>, <br>, etc.)
        // Count a newline if it's a block element or a break
        if (node.tagName === 'BR' || window.getComputedStyle(node).display === 'block') {
          currentOffset++;
          if (offset === currentOffset) {
            rangy.getSelection().collapse(node, 0);
            found = true;
            return; // Found the position, exit the traversal
          }
        }
        // Recurse through child nodes
        Array.from(node.childNodes).forEach(traverseNodes);
        if (found) return;
      }
    }

    // Start traversal from the editor's child nodes
    Array.from(editor.childNodes).forEach(traverseNodes);

    // If the specified offset is beyond the last character, collapse at the end
    if (!found) {
      rangy.getSelection().collapse(editor, editor.childNodes.length);
    }
  } catch (e) {
    console.error('Error setting cursor position:', e);
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
function getTextWithWhitespace(element) {
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