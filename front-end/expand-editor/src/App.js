// https://docs.slatejs.org/
// https://reactjs.org/docs/create-a-new-react-app.html
import "./App.css";
import React, { useState, useCallback , useRef, Component } from "react";
import styled from 'styled-components';

// a library for saving and restoring selections (cursor positions / ranges) in a document
// it uses hidden elements to store the selection data
import rangy from 'rangy';
import { TokenManager } from "./TokenManager";
import { getUniqueUUID } from "./utils";
class LenseEditor extends Component {cha
  constructor(props) {
    super(props);
    console.log("editor props", props)
    let originalText = 'this is some text';
    let content = originalText.split('').map((c) => `<span id=${getUniqueUUID()}>${c}</span>`).join('');
    console.log('original text', this.originalText)
    this.state = { content: content , text: originalText};
    this.contentRef = React.createRef();
    this.editorNode = null;
    this.tokenManager = new TokenManager();
    this.tokenManager.lenses.words = TokenManager.tokenize(this.state.text);
    console.log('words tokens', this.tokenManager.lenses.words);

    this.editorNode = this.contentRef.current;
    window.editor = this.editorNode;

    this.selectionStart = 0;
    this.selectionEnd = 0;
  }

  componentDidMount() {
    this.contentRef.current.addEventListener('input', this.handleInput);
    this.contentRef.current.addEventListener('click', this.handleClick);
  }

  componentWillUnmount() {
    this.contentRef.current.removeEventListener('input', this.handleInput);
    this.contentRef.current.removeEventListener('click', this.handleClick);
  }

  componentDidUpdate(prevProps, prevState) {
    if (this.state.content !== prevState.content) {
      console.log('content updated', this.state.content);
    }
  }

  saveSelection = () => {
    let selection = rangy.getSelection();
    if (selection.rangeCount > 0) {
      let parent = selection.anchorNode.parentNode;
      let offset = selection.focusOffset;

      this.selection = selection;
      this.offset = offset;
      this.charId = parent.id;
      
    }
    else {
      console.error('No selection');
    }
  }

  restoreSelection = (event) => {
    if (this.selection) {
      // get the node with the id
      this.restoreSelectionFromCharId(this.charId, this.offset, event);
    }
  }

  handleInput = (event) => {
    this.processInput(event);
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
      path.unshift(index);  // Add index to the beginning of the path array
      node = parent;  // Move up in the DOM tree
    }
    return path;
  };

  restoreSelectionFromCharId = (charId, givenOffset, event) => {
    let node = document.getElementById(charId);
    if (!node) {
      console.error('No node found with id', charId);
      return;
    }

    let editLength = event.data ? event.data.length : 0;
    let charsToOffset = givenOffset - editLength;
    let tokensToOffset = givenOffset - charsToOffset;
    let restoreTo = node;
    for (let i = 0; i < tokensToOffset; i++) {
      restoreTo = restoreTo.nextSibling; 
      // for some reason when this gives an error, it actually breaks and allows it to work okay?
    }

    let restoring = {
      text: node ? node.textContent : null,
      nextText: restoreTo ? restoreTo.textContent : null,
      givenOffset: givenOffset,
      eventDataLength: editLength,
      tokensToOffset: tokensToOffset,
      charsToOffset: charsToOffset,
      charId: charId,
      node: node,
      restoreTo: restoreTo,
    }
    // console.log('restoring', restoring); // for debugging

    let range = document.createRange();
    range.setStart(restoreTo, charsToOffset);
    range.setEnd(restoreTo, charsToOffset);
    let selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  handleClick = (event) => {
    // we don't use this after it gets saved but it is nice as a debug tool
    // we save directly in the handleInput
    this.saveSelection();
  };

  splitSpan(span, c) {
    // don't delete any spans, just add new ones and remove characters from the old span
    let text = span.textContent.replace(/\uFEFF/g, ''); // Remove BOM
    let newSpans = [];
    for (let i = 1; i < text.length; i++) {
      let newSpan = document.createElement('span');
      newSpan.textContent = text[i];
      newSpans.push(newSpan);
    }
    span.textContent = text[0];
    for (let i = 0; i < newSpans.length; i++) {
      let newSpan = newSpans[i];
      span.parentNode.insertBefore(newSpan, span.nextSibling);
      c += 1;
      this.styleChild(newSpan, c);
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

  styleChild(child, c) {
    child.setAttribute('c', c);

    this.setIdIfNotPresent(child); // need to put a lock on this so ids cant duplicate

    if (child.tagName === 'SPAN') {
      if (this.tokenManager) {
        if (c == 17) {
          console.log('stpo')
        }

        let tokensAt = this.tokenManager.tokensAt('words', c);

        

        if (tokensAt && tokensAt.length > 0) {
          let prob = tokensAt[0].prob;

          // console.log('AT', c, tokensAt, prob, this.tokenManager.lenses.words);
          let color = probToColor(prob);
          child.style.backgroundColor = color;
        }
      }

    }
  }

  /* 
    TODO document
  */
  splitIntoCharactersAndStyle(content) {
    function* traverseDOM(node) {
      if (
        (node.tagName === 'DIV' || node.tagName === 'SPAN' || node.tagName === 'BR')
        // and its not div.editor
        && node.className !== 'editor'
        // and it is not a rangy selection marker (id contains the string selectionBoundary)
        && !node.id.includes('selectionBoundary')
      ) {
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
    while (child) {
      if (child.tagName == "BR") {
        i++;
        child = children[i];
        continue;
      }

      this.styleChild(child, c); // TODO the c logic needs to be updated a bit (newline divs and brs...)

      if (child.tagName === 'SPAN') {
        let text = child.textContent;
        if (text.length > 1) {
          // split the span into multiple spans
          // updating the character index
          c = this.splitSpan(child, c);
        }
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
  getTextWithWhitespace(element, selection) {
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


  processInput = (event) => {
    // Save the current selection to restore later after processing input
    this.saveSelection();

    // update the state text
    // let newText = this.contentRef.current.textContent.replace('&nbsp', ' '); // this loses \n TODO

    let newText = this.getTextWithWhitespace(this.contentRef.current, this.selection.nativeSelection);
    console.log('TEXT', {newText});

    // for(let i = 0; i < newText.length; i++) {
    //   let c = newText[i];
    //   let elt = document.querySelector(`[c="${i}"]`);
    //   let text = elt && elt.textContent ? elt.textContent : null;
    //   console.log("i", i, "c", c, 'text', text, elt);
    // }

    // reverse the above, iterate through the nodes that have a 'c' attribute, and get the character in the text at that index
    // get all nodes with a c attribute
    let nodes = document.querySelectorAll('[c]');
    for (let i = 0; i < nodes.length; i++) {
      let node = nodes[i];
      let c = node.getAttribute('c');
      let text = node.textContent;
      let actual = newText[parseInt(c)];
      console.log("c", c, 'text', text, 'newText[c]', actual, node);
    }



    if (this.tokenManager) {
      //   // const didEdit = this.tokenManager.editToken('words', event, this.selectionStart);
        let newTokens = TokenManager.tokenize(newText);
        this.tokenManager.lenses.words = newTokens;
        console.log('new tokens', newTokens);
      }

    // this.setState({text: newText}) // right now we have no use fo rthis

    this.splitIntoCharactersAndStyle(this.contentRef.current);

    // Use a timeout to delay execution of restoring the selection
    // This ensures that the DOM updates have completed before the selection is restored
    setTimeout(() => {
      this.restoreSelection(event);
    }, 0);

      // Perform any additional actions following the update
      // Example: Update styling or re-compute dependent values
      // this.updateStylingBasedOnContent();
  };

  render() {
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

class App extends Component {
  render() {
    return (
      <div className="context-context">
        
        <div className="editor-context">
          <LenseEditor />
        </div>
      </div>
    );
  }
}

let prevColor = 100;
let prevColor2 = 138;
const probToColorRandom = (prob) => {
  if (!prob || prob <= 0) {
    return 'white';
  }
  // set prob to a random value between 0 and 1
  return "rgba(" + prevColor + ", " + prevColor2 + ", 0, " + prevColor / 255 + ")";
};

const probToColor = (prob) => {
  if (!prob || prob <= 0) {
    return 'white';
  }

  let g = prob * 255;
  // set prob to a random value between 0 and 1
  return "rgba(" + 0 + ", " + g + ", 0, " + prob + ")";
};


export default App;