import React, { Component } from "react";
import rangy from 'rangy';
import { getUniqueUUID } from "./utils";
import { getColor } from "./color";

export class LenseBar extends Component {
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
          {this.props.lenses.map((lense) => {
            return <option key={lense} value={lense}>{lense}</option>;
          })}
        </select>
      </div>
    );
  }
}
export class Sidebar extends Component {
  constructor(props) {
    super(props);
    this.tokenManager = this.props.tokenManager;
  }

  render() {
    // TODO we shouldn't actually use startChar / encChar because if you select one character it still should show something
    let hidden = this.props.selection && this.props.selection.rangy.isCollapsed ? 'hidden' : "";

    let start = this.props.startChar;
    let end   = this.props.endChar || null;

    this.tokensAt = [];
    if (start) {
      this.tokensAt = this.tokenManager.tokensAt(this.tokenManager.currentLense, start, end);
    }

    return (
      <div className={`sidebar-container`}>
        <div className={`sidebar ${hidden}`}>
          {/* for each token show a little thing */}
          <div>
            {this.tokensAt && this.tokensAt.map((token) => {
              return <div key={token.text}>
                      {JSON.stringify(token)}
                    </div>;
            })}
          </div>
      </div>
      </div>
    );
  }

}
export class LenseEditor extends Component {
  constructor(props) {
    super(props);
    let originalText = 'a'.split('');
    let content = [];
    for (let i = 0; i < originalText.length; i++) {
      let c = originalText[i];
      content.push(`<span id=${getUniqueUUID()} c=${i}>${c}</span>`);
    }
    this.state = { content: content, text: originalText };
    this.contentRef = React.createRef();
    this.editorNode = null;
    this.tokenManager = this.props.tokenManager;
    this.tokenManager.setOnToken(this.updateUITokens.bind(this));
    this.tokenManager.tokenize(this.state.text);
    this.editorNode = this.contentRef.current;
  }

  updateUITokens(token) {
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
    let rangySelection = rangy.getSelection();
    if (rangySelection.rangeCount > 0) {
      let anchorParent = rangySelection.anchorNode.parentNode;
      let focusParent = rangySelection.focusNode.parentNode;
      let offset = rangySelection.focusOffset; // TODO this should be anchorOffset

      this.offset = offset; // TODO get rid of
      this.charId = anchorParent.id;  // TODO get rid of

      let startChar = parseInt(anchorParent.getAttribute('c')); // TODO would be great if these were built into the selection...
      let endChar = anchorParent === focusParent ? startChar : parseInt(focusParent.getAttribute('c'));

      this.selection = {
        offset: offset,
        charId: rangySelection.anchorNode.parentNode.id,
        rangy:  rangySelection,

        // these can be used for computing span calculations
        anchor:       rangySelection.anchorNode,
        anchorOffset: rangySelection.anchorOffset,
        focus:        rangySelection.focusNode,
        focusOffset:  rangySelection.focusOffset,

        // we use the above to calculate these helper variables, and will not always be present
        // additionally they may not be up to date if accessed during an input event
        delayedStartChar: startChar,
        delayedEndChar:   endChar
      }
      window.selection = this.selection; // for debugging
    }
    else {
      console.error('No selection');
    }
  };

  restoreSelection = (event) => {
    if (this.selection) {
      // TODO this really should be anchor offset which is where charID comes from 
      // TODO figure out why it breaks when I change that
      this.restoreSelectionFromCharId(this.selection.charId, this.selection.focusOffset, event); 
    }
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
    };

    let range = document.createRange();
    range.setStart(restoreTo, charsToOffset);
    range.setEnd(restoreTo, charsToOffset);
    let selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  };

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


  /* 
    Bugs: 
      TODO spaces aren't being saved correctly on firefox (works on Chrome)
      TODO pasting from an outside source puts everything in backwards
  */
  handleInput = (event) => {
    // Save the current selection to restore later after processing input
    this.saveSelection();

    // update the state text
    // let newText = this.contentRef.current.textContent.replace('&nbsp', ' '); // this loses \n TODO
    let newText = this.getTextWithWhitespace(this.contentRef.current, this.selection.nativeSelection);
    console.log('TEXT', { newText });

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
      let newTokens = this.tokenManager.tokenize(newText);
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
