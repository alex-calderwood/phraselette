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

function debounce(fn, delay) {
  let timeoutID;
  return function (...args) {
    if (timeoutID) {
      clearTimeout(timeoutID);
    }
    timeoutID = setTimeout(() => {
      fn(...args);
      timeoutID = null;
    }, delay);
  };
}

class LenseBar extends Component {
  constructor(props) {
    super(props);
  }

  handleChange(event) {
    let lense = event.target.value;
    
    if (this.props.setCurrentLense)
      this.props.setCurrentLense(lense);

    if (this.props.attemptInitialTokenization)
      this.props.attemptInitialTokenization();
  }

  render() {
    return (
      <div className="lense-bar">
        {/* a dropdown with each lense type */}
        <select onChange={this.handleChange.bind(this)}>
          {
            this.props.lenses.map((lense) => {
              return <option key={lense} value={lense}>{lense}</option>;
            })
          }
        </select>
      </div>
    );
  }
}

class Sidebar extends Component {
  constructor(props) {
    super(props);
    this.tokenManager = this.props.tokenManager;
  }

  render() {
    let hidden = false;
    if (this.props.selection) {
      hidden = this.props.selection.isCollapsed ? 'hidden' : '';
    }

    if (this.props.selection) {
      console.log('bar selection', this.props.selection)
      let span = this.props.selection.anchorNode.parentNode;
      console.log('span', span);
      let char = parseInt(span.getAttribute('c'));
      console.log('char', char);
      this.tokensAt = this.tokenManager.tokensAt(this.tokenManager.currentLense, char);
    }

    console.log('babr tokens at', this.tokensAt);


    return (
      <div className={`sidebar ${hidden}`}>
        <h2>Sidebar</h2>
        <br />
        {/* for each token show a little thing */}
        <div>
          {
            this.tokensAt && this.tokensAt.map((token) => {
              return <div key={token.text}>{token.text}</div>;
            })
          }
        </div>
      </div>
    );
  }

}

class LenseEditor extends Component {
  constructor(props) {
    super(props);
    let originalText = 'a ';
    let content = originalText.split('').map((c) => `<span id=${getUniqueUUID()}>${c}</span>`).join('');
    this.state = { content: content , text: originalText};
    this.contentRef = React.createRef();
    this.editorNode = null;
    this.tokenManager = this.props.tokenManager;
    this.tokenManager.setOnToken(this.updateUITokens.bind(this));
    this.tokenManager.tokenize(this.state.text);
    this.editorNode = this.contentRef.current;
    this.selectionStart = 0;
    this.selectionEnd = 0;
  }

  updateUITokens (token) {
    console.log('recieved token', token);
    this.colorTokenByProb(token);
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

    // show the sidebar if there is a selection of non-zero length
    this.props.setSelection(this.selection);
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
    this.setIdIfNotPresent(child);
    if (child.tagName === 'SPAN') {
      if (this.tokenManager.currentLense === 'words') {
      this.colorCharacterByProb(child, c);
      }
    }
  }

  colorAllCharactersByProb() {
    // get all spans with a c attribute
    let spans = document.querySelectorAll('span[c]');
    for (let i = 0; i < spans.length; i++) {
      let span = spans[i];
      let c = span.getAttribute('c');
      this.colorCharacterByProb(span, c);
    }
  }

  colorTokenByProb(token) {
    // console.log('coloring token', token.text, token.prob, token);
    let start = token.start;
    let end = token.end;
    let prob = token.prob;
    let color = getColor(this.tokenManager.currentLense, prob);
    for (let i = start; i <= end; i++) { // [start, end] inclusive
      let span = document.querySelector(`span[c='${i}']`);
      console.log('span', span);
      if (span) {
        span.style.backgroundColor = color;
      }
    }
  }

  colorCharacterByProb(child, c) {
    if (this.tokenManager) {
      let tokensAt = this.tokenManager.tokensAt(this.tokenManager.currentLense, c);
      let color;
      if (tokensAt && tokensAt.length > 0) {
        let prob = tokensAt[0].prob;
        color = getColor(this.tokenManager.currentLense, prob);
      } else {
        color = getColor(this.tokenManager.currentLense, 0);
      }
      child.style.backgroundColor = color;

    } else {
      console.error('No token manager to color');
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

      this.styleChild(child, c);

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


  handleInput = (event) => {
    // Save the current selection to restore later after processing input
    this.saveSelection();

    // update the state text
    // let newText = this.contentRef.current.textContent.replace('&nbsp', ' '); // this loses \n TODO

    let newText = this.getTextWithWhitespace(this.contentRef.current, this.selection.nativeSelection);
    console.log('TEXT', {newText});

    // reverse the above, iterate through the nodes that have a 'c' attribute, and get the character in the text at that index
    // get all nodes with a c attribute
    let nodes = document.querySelectorAll('[c]');
    for (let i = 0; i < nodes.length; i++) {
      let node = nodes[i];
      let c = node.getAttribute('c');
      let text = node.textContent;
      let actual = newText[parseInt(c)];
    }

    if (this.tokenManager) {
      let newTokens = this.tokenManager.tokenize(newText)
      this.tokenManager.lenses.words = newTokens;
      console.log('new tokens', newTokens);
    }

    // this.setState({text: newText}) // right now we have no use fo rthis
    if (this.props.setText) {
      // give the new text to the parent
      this.props.setText(newText);
    }

    this.splitIntoCharactersAndStyle(this.contentRef.current);

    // Use a timeout to delay execution of restoring the selection
    // This ensures that the DOM updates have completed before the selection is restored
    setTimeout(() => {
      this.restoreSelection(event);
    }, 0);
  };

  render() {
    this.colorAllCharactersByProb();

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
  constructor(props) {
    super(props);
    this.tokenManager = new TokenManager();
    window.tokenManager = this.tokenManager; // for debugging
    this.state = { 
      lenses: Object.keys(this.tokenManager.lenses),
      activeLenses: ['words', 'gpt-2'], // TODO for each active lense, should tokenize the text
      currentLense: 'words',
      selection: null,
     };

    // current lense is words, create a setter to pass to the LenseBar where it will change it
    this.setCurrentLense = (lense) => {
      console.log('setting current lense to', lense);
      this.tokenManager.setCurrentLense(lense);
      this.setState({ currentLense: lense });
      // recolor each character
      // this.colorAllCharactersByProb(); // eventually this should be a state thing so it is managed by react
    };

    this.setSelection = (selection) => {
      this.setState({ selection: selection });
    }

    this.setText = (text) => {
      this.text = text;
    }

    this.attemptInitialTokenization = () => {
      if (
        this.tokenManager 
        && this.tokenManager.lenses
        && this.tokenManager.lenses[this.state.currentLense].length > 0
      ) {
        this.tokenManager.tokenize(this.text);
      }
    }
  }

  render() {
    return (
      <div className="context-context">
          <LenseBar lenses={this.state.lenses} setCurrentLense={this.setCurrentLense} attemptInitialTokenization={this.attemptInitialTokenization.bind(this)} />
          <Sidebar tokenManager={this.tokenManager} lense={this.lense} color={this.color} selection={this.state.selection} />
          <div className="editor-context">
            <LenseEditor tokenManager={this.tokenManager} lense={this.state.currentLense} setSelection={this.setSelection} setText={this.setText} />
          </div>
      </div>
    );
  }
}

function getColor(lense, prob) {
  // console.log('lense', lense, 'prob', prob);
  if (lense === 'words') {
    return probToColor(prob);
  } else if (lense === 'gpt-2') {
    return probToColorExponential(prob);
  } else {
    return probToColor(prob);
  }
}

let prevColor = 100;
let prevColor2 = 138;
const probToColorRandom = (prob) => {
  if (!prob || prob <= 0) {
    return 'white';
  }
  return "rgba(" + prevColor + ", " + prevColor2 + ", 0, " + prevColor / 255 + ")";
};

const probToColor = (prob) => {
  if (!prob || prob <= 0) {
    return 'white';
  }

  let g = prob * 255;
  return "rgba(" + 0 + ", " + g + ", 0, " + prob + ")";
};


const probToColorExponential = (prob) => {
  // the probabilities are very small so lets make them more visible
  if (!prob || prob <= 0) {
    return 'white';
  }
  let g = Math.min(Math.pow(prob, 1/3) * 255, 255);
  return "rgba(" + 0 + ", " + g + ", 0, " + 0.5 + ")";
}


export default App;