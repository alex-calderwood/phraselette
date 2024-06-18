// https://docs.slatejs.org/
// https://reactjs.org/docs/create-a-new-react-app.html
import "./App.css";
import React, { useState, useCallback , useRef, Component } from "react";
import styled from 'styled-components';

// a library for saving and restoring selections (cursor positions / ranges) in a document
// it uses hidden elements to store the selection data
import rangy from 'rangy';
// import 'rangy/lib/rangy-selectionsaverestore';
// import 'rangy/lib/rangy-serializer';

function getUniqueUUID() {
    var id = "id" + Math.random().toString(16).slice(2);
    // console.log('making id', id);
    return id; // TODO small chance of collision, 
}

class TokenManager {
  static curTokenID = 0;

  constructor(tokens) {
    this.lenses = {'default': []}; // the types of possible labels
    this.lenseTokenIDtoIndex = {'default': {}}; // token id to lenses array index
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

  tokensAt(type, start, end=start) {
    let tokens = this.lenses[type];
    console.log('tokensAt of type', type, 'at', start, tokens);
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

    switch(event.inputType) {
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
      this.tokenManager.lenses.default = newTokens;
    }

    return didEdit;
  }

  static tokenize(text, data={}) { // -> Token[]
    console.log("tokenizing", text)
    let type = "default";
    const delim = " ";
    let tokens = [];
    let tokenStart = 0;
    let curToken = ""
    for(let i = 0; i < text.length; i++) {
      let c = text[i];
      curToken += c;
      if (c === delim || i === text.length - 1) {
        // TODO handle c == 0 case
        // '  ' case (two spaces)
        tokens.push({
          'start': tokenStart,
          'end': i,
          "text": curToken,
          "type": type,
          "id": TokenManager.createTokenID(),
          "prob": Math.random(),
        });
        curToken = "";
        tokenStart = i + 1;
        continue; // TODO I think we want to save these as special ' ' tokens?
      }
    }
    
    return tokens;
  }

  static retokenize(tokens, data={}) {
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


class Editor extends Component {cha
  constructor(props) {
    super(props);
    console.log("editor props", props)
    this.originalText = 'this is some text';
    this.originalText = this.originalText.split('').map((c) => `<span>${c}</span>`).join('');
    console.log('original text', this.originalText)
    this.state = { content: this.originalText };
    this.contentRef = React.createRef();
    this.editorNode = null;
    this.tokenManager = null;
    this.selectionStart = null;
    this.selectionEnd = null;
  }

  componentDidMount() {
    this.editorNode = this.contentRef.current;
    window.editor = this.editorNode;

    this.tokenManager = new TokenManager();
    this.tokenManager.lenses.default = TokenManager.tokenize(this.originalText);
    console.log('default tokens', this.tokenManager.lenses.default);

    this.contentRef.current.addEventListener('input', this.handleInput);
    this.contentRef.current.addEventListener('click', this.handleKey);

    this.selectionStart = 0;
    this.selectionEnd = 0;
  }

  componentWillUnmount() {
    this.contentRef.current.removeEventListener('input', this.handleInput);
    this.contentRef.current.removeEventListener('click', this.handleKey);
  }

  componentDidUpdate(prevProps, prevState) {
    if (this.state.content !== prevState.content) {
      console.log('content updated', this.state.content);
    }
  }

  updateStylingBasedOnContent = () => {

    for(let token of this.tokenManager.lenses.default) {
      let color = probToColor(token.prob);
    }
  }

  saveSelection = () => {
    let selection = rangy.getSelection();
    if (selection.rangeCount > 0) {
      let parent = selection.anchorNode.parentNode;
      let offset = selection.focusOffset;
      
      let indexPath = this.getNodeIndexPath(selection.anchorNode, this.editorNode);
      let totalOffset = this.absoluteOffset(indexPath, offset, this.editorNode);

      this.selection = selection;
      this.indexPath = indexPath;
      this.offset = offset;
      this.totalOffset = totalOffset;
      this.charId = parent.id;
      
      console.log('saved selection', parent.textContent, {indexPath, offset, totalOffset, charId: parent.id})
    }
    else {
      console.error('No selection');
    }
  }

  restoreSelection = () => {
    if (this.selection) {
      // this.restoreSelectionFromIndexPath(this.indexPath, this.offset, this.editorNode);
      // get the node with the id
      this.restoreSelectionFromCharId(this.charId, 0);

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

  absoluteOffset(indexPath, offset, editorNode) {
    // console.log('editor', editorNode);
    let node = editorNode;
    let totalOffset = 0;
    for (let i = 0; i < indexPath.length; i++) {
      let index = indexPath[i];
      node = node.childNodes[index];
      let text = node.textContent.replace(/\uFEFF/g, '');

      if (text) {
        let length = text.length;
        // console.log('node', {node, text, length, index, offset})

        totalOffset += length;
      }
    }
    return totalOffset + offset;
  }

  restoreSelectionFromIndexPath = (path, offset, editorNode) => {
    console.log('restoring selection from path', path)
    // let node = editorNode;
    // for (let i = 0; i < path.length; i++) {
    //   let index = path[i];
    //   node = node.childNodes[index];
    // }
    // let range = document.createRange();
    // range.selectNodeContents(node);
    // let selection = window.getSelection();
    // selection.removeAllRanges();
    // selection.addRange(range);
    let node = editorNode;
    for (let i = 0; i < path.length; i++) {
      let index = path[i];
      node = node.childNodes[index];
    }
    let range = document.createRange();
    range.setStart(node, offset);
    range.setEnd(node, offset);
    let selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);

  };

  restoreSelectionFromCharId = (charId, offset) => {
    let node = document.getElementById(charId);
    if (!node) {
      console.error('No node found with id', charId);
      return;
    }

    let nextNode = node.nextSibling.nextSibling;


    if (node.textContent) {
      console.log('node', node.textContent);
    }
    if (nextNode.textContent) {
      console.log('next node', nextNode.textContent);
    }
    

    console.log('restoring charId', charId)

    let range = document.createRange();
    range.setStart(nextNode, offset);
    range.setEnd(nextNode, offset);
    let selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  
  }

  handleKey = (event) => {
    // this.saveSelection();
  };

  processInput = (event) => {
    // Log the starting and ending positions of the selection before input processing
    // console.log('selection start', this.selectionStart, this.selectionEnd, this.selection.anchorNode);
    // window.anchor = this.selection.anchorNode;

    // Save the current selection to restore later after processing input
    this.saveSelection();
  
    // Process the input data
    // Example: Update the content state to reflect changes made by the input
    // const newContent = this.state.content.substring(0, this.selectionStart) + 
                      //  event.data + 
                      //  this.state.content.substring(this.selectionEnd);
  
    // Update the component state with the new content
    // this.setState({ content: this.contentRef.current.innerHTML });

    // console.log('CONTENT', this.state.content);

    function splitSpan(span, c) {
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
        styleChild(newSpan, c);
      }
      return c;
    }

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

    function setIdIfNotPresent(node) {
      // if(node.tagName !== 'SPAN') { // TODO fix unique ID thing
      //   console.log('trying to create id for', node.id, !node.id, node)
      // }
      if (!node.id) {
        node.id = getUniqueUUID();
        // console.log('creating id for', node, node.id);
      }
    }

    function styleChild(child, c) {
      child.setAttribute('c', c);

      setIdIfNotPresent(child); // need to put a lock on this so ids cant duplicate

      if (child.tagName === 'SPAN' && !child.style.backgroundColor) {
        let color = probToColor(Math.random());
        child.style.backgroundColor = color;
      }
    }

    // iterate through all children spans
    let spans = this.contentRef.current.children;
    // let children = this.contentRef.current.childNodes; // doesn't get children of children
    let children = [...traverseDOM(this.contentRef.current)];
    let i = 0;
    let c = 0;
    let child = children[i];
    while (child) {
      // check that it is a span
      styleChild(child, c); // TODO the c logic needs to be updated a bit (newline divs and brs...)

      if (child.tagName === 'SPAN') {
        let text = child.textContent;
        if (text.length > 1) {
          // split the span into multiple spans
          // updating the character index
          c = splitSpan(child, c);
        }
      }

      i++;
      c++;
      child = children[i];
    }
  
    // Potentially, update tokens based on the input
    // This could involve re-tokenizing the text or adjusting tokens based on the input
    // if (this.tokenManager) {
    //   const didEdit = this.tokenManager.editToken('default', event, this.selectionStart);
    //   // console.log('token manager tokens', this.tokenManager.lenses.default);
    // }
  
    // Use a timeout to delay execution of restoring the selection
    // This ensures that the DOM updates have completed before the selection is restored
    setTimeout(() => {
      this.restoreSelection();
    }, 0);

      // Perform any additional actions following the update
      // Example: Update styling or re-compute dependent values
      this.updateStylingBasedOnContent();
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
          <Editor />
        </div>
      </div>
    );
  }
}

let prevColor = 100;
const probToColor = (prob) => {
  if (!prob || prob <= 0) {
    return 'white';
  }
  // set prob to a random value between 0 and 1
  prevColor = (prevColor + 5) % 255;
  return "rgba(" + prevColor + ", 0, 0, " + prevColor / 255 + ")";
};


export default App;