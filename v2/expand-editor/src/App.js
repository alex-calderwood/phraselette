// https://docs.slatejs.org/
// https://reactjs.org/docs/create-a-new-react-app.html
import "./App.css";
import React, { useState, useCallback , useRef, useEffect } from "react";

// a library for saving and restoring selections (cursor positions / ranges) in a document
// it uses hidden elements to store the selection data
import rangy from 'rangy';
import 'rangy/lib/rangy-selectionsaverestore';

class TokenManager {
  constructor(tokens) {
    this.lenses = {}; // the types of possible labels
  }

  tokensAt(type, start, end=start) {
    let spans = this.lenses[type];
    if (!spans) {
      console.error("No label of lense type", type);
      return;
    }

    let tokensSpanned = [];
    for (let spanIndex = 0; spanIndex < spans.length; spanIndex++) {
      let token = spans[spanIndex];
      let [labelStart, labelEnd] = [token.start, token.end];
      if (labelStart > end) {
        break;
      }

      if (labelEnd < start) {
        continue;
      }

      tokensSpanned.push(token);
    }
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
          'end': i - 1,
          "text": curToken
        });
        curToken = "";
        continue; // TODO I think we want to save these as special ' ' tokens?
      }
    }

    console.log('tokens', tokens)
    
    return {
      type: type,
      tokens: tokens
    }
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
}

// ALMOST WORKING ....

const Editor = () => {
  const originalText = `<span>first </span> <span>wasp</span> <span>here</span`;
  const tokenManager = new TokenManager();
  const [content, setContent] = useState(originalText);
  const contentRef = useRef(null);
  const [tokens, setTokens] = useState([]);

  let isProcessing = false;
  let eventQueue = [];

  const saveSelection = () => {
    return rangy.saveSelection();
  }

  const restoreSelection = (saved) => {
    return rangy.restoreSelection(saved);
  }

  const handleInput = (event) => {
    processInput(event);
    // if (isProcessing) {
    //     // Push to queue if processing is underway
    //     eventQueue.push(event);
    // } else {
    //     processInput(event);
    // }
  };

  const processInput = (event) => {
    console.log('already is processing', isProcessing)
    isProcessing = true;
    const selectionRange = saveSelection();

    //log the charater that is being input
    console.log('input character', event.data, event);
    setContent(contentRef.current.innerHTML); 
    // https://stackoverflow.com/questions/54069253/the-usestate-set-method-is-not-reflecting-a-change-immediately

    // get the change from the event
    const change = event.data;
    // get the location using rangy
    const selection = rangy.getSelection();
    console.log('selection', selection, change);

    // 1. need to get the new change from the user
    // 2 need to take the old tokens and update the tokens with the new change
    // 3. need to retokenize the old tokens

    let tokens = TokenManager.tokenize(content);
    console.log('token', tokens);
    setTokens(tokens);

    // // wrap the tokens in spans
    let newContent = content;
    for (let token of tokens.tokens) {
      let span = `<span style="background-color: ${probToColor(0.5)}">${token.text}</span>`;
      newContent = newContent.replace(token.text, span);
    }

    // // set the new content
    // setContent(newContent);

    setTimeout(() => {
      restoreSelection(selectionRange);
      checkQueue();
    }, 0);
  }


  const checkQueue = () => {
    if (eventQueue.length > 0 && !isProcessing) {
        const nextEvent = eventQueue.shift();  // Get the next event from the queue
        processInput(nextEvent);
    }
  }
  useEffect(() => {
    contentRef.current.addEventListener('input', handleInput);
    //onclick
    // contentRef.current.addEventListener('click', onClick);
    return () => {
      contentRef.current.removeEventListener('input', handleInput);
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
  React.useEffect(() => {
    // tokenize the full document
    // TODO
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
  // set prob to a random value between 0 and 1
  prob = Math.random();
  return "rgba(" + Math.random() * 255 + ", " + Math.random() * 255 + ", " + Math.random() * 255 +  ", " + prob + ")";
};


export default App;