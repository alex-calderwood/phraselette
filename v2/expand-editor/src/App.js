// https://docs.slatejs.org/
// https://reactjs.org/docs/create-a-new-react-app.html
import "./App.css";
import React, { useState, useCallback , useRef, useEffect } from "react";
import { tokenize } from "./smarts";
import { mergeNodesInRange, printChildren } from "./editorTools";

/* 
The debounce function will delay the processing of the keydown event until the user has stopped typing for a specified period (e.g., 1 second). Here's how you can implement this in JavaScript:
*/ 
function debounce(func, delay) {
  let timer;
  return function (...args) {
      const context = this;
      clearTimeout(timer);
      timer = setTimeout(() => func.apply(context, args), delay);
  };
}

function tokenizeAndHighlight(editor, selection) {
  // const path = Editor.path(editor, selection);
                    
  // // select everything
  // let context = Editor.node(editor, []);
  // // from the selection anchor to the end of the document
  // let end = Editor.last(editor, []);

  // let tokenizeRange = {
  //   anchor: selection.anchor,
  //   focus: {
  //     offset: 0,
  //     path: end[1],
  //   }
  // };
  // tokenize(context, tokenizeRange, editor, path);
}

// let delayedTokenizeAndHighlight = debounce(tokenizeAndHighlight, 1000);


const Editor = () => {
  const originalText = `figgling the first`
  const [content, setContent] = useState(originalText);
  const contentRef = useRef(null);

  const saveSelection = () => {
    const range = document.createRange();
    const sel = window.getSelection();
    console.log(sel, sel.getRangeAt(0));
    if (sel.rangeCount > 0) {
      return sel.getRangeAt(0);
    }
    return null;
  };

  const restoreSelection = (range) => {
    if (range) {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
  };

  const handleInput = () => {
    const currentRange = saveSelection();
    setContent(contentRef.current.innerHTML);
    setTimeout(() => {
      restoreSelection(currentRange);
    }, 0);
  };


  useEffect(() => {
    contentRef.current.addEventListener('onChange', handleInput);
    return () => {
      contentRef.current.removeEventListener('onChange', handleInput);
    };
  }, []);

  return (
    <div
      className="editor"
      ref={contentRef}
      contentEditable
      dangerouslySetInnerHTML={{ __html: content }}
    ></div>
  );
};

const App = () => {
  // const [editor] = useState(() => withCustomInLine(withReact(createEditor())));
  // window.editor = editor; // for debugging

  let originalText = `figgling the first
of the last waspicating hornet`;

  //make a 2d array of lines by words, add a space to each word
  originalText = originalText.split("\n").map((line) => line.split(" ").map((word) => word + " "));

  // on mount callback
  React.useEffect(() => {
    // tokenize the full document
    // tokenizeAndHighlight(editor, Editr.range(editor, [0, 0], [0, 0]));
  }, []);


  // Render the Slate context.
  return (
    <div className="context-context">
      <div className="editor-context">
        <Editor />
      </div>
    </div>
  );
};

const probToColor = (prob) => {
  if (!prob || prob <= 0) {
    return 'white';
  }
  prob *= 255;
  return "rgba(0, 255, 0, " + prob + ")";
};


export default App;