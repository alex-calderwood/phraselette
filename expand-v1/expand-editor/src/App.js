// https://docs.slatejs.org/
// https://reactjs.org/docs/create-a-new-react-app.html
import "./App.css";
import React, { useState, useCallback } from "react";
import { createEditor, Editor, Transforms, Text, Node } from "slate";
import { Slate, Editable, withReact } from "slate-react";
import { tokenize } from "./smarts";
import { mergeNodesInRange, printChildren } from "./editorTools";

const CustomEditor = {
  isBoldMarkActive(editor) {
    const marks = Editor.marks(editor);
    console.log({ marks, editor });
    return marks ? marks.bold === true : false;
  },

  toggleBoldMark(editor) {
    const isActive = CustomEditor.isBoldMarkActive(editor);
    if (isActive) {
      Editor.removeMark(editor, "bold");
    } else {
      Editor.addMark(editor, "bold", true);
    }
  },

  updateProbMark(editor, newProb) {
    if (newProb == 0) {
      Editor.removeMark(editor, "prob");
    } else {
      Editor.addMark(editor, "prob", newProb);
    }
  },
};

// Tell the editor that the token is an inline element
const withCustomInLine = editor => {
  const { isInline } = editor;

  editor.isInline = element => {
    let inline =  element.type === 'token' ? true : isInline(element);
    return inline
  };

  return editor;
};

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
  const path = Editor.path(editor, selection);
                    
  // select everything
  let context = Editor.node(editor, []);
  // from the selection anchor to the end of the document
  let end = Editor.last(editor, []);

  let tokenizeRange = {
    anchor: selection.anchor,
    focus: {
      offset: 0,
      path: end[1],
    }
  };
  tokenize(context, tokenizeRange, editor, path);
}

let delayedTokenizeAndHighlight = debounce(tokenizeAndHighlight, 1000);

const App = () => {
  const [editor] = useState(() => withCustomInLine(withReact(createEditor())));
  window.editor = editor; // for debugging

  let originalText = `figgling the first
of the last waspicating hornet`;

  //make a 2d array of lines by words, add a space to each word
  originalText = originalText.split("\n").map((line) => line.split(" ").map((word) => word + " "));

  // map each line to a paragraph
  const initialValue = originalText.map((line) => ({
    type: "paragraph",
    // map tokens
    children: line.map((token) => ({
      type: "token",
      children: [{ text: token}],
    })),
  }));

  // Define a rendering function
  const renderElement = useCallback((props) => {
    switch (props.element.type) {
      case 'token':
        console.log('rendering token');
        return <TokenElement {...props} />;

      default:
        console.log('rendering default');
        return <DefaultElement {...props} />;
    }
  }, []);

  const renderLeaf = useCallback((props) => {
    return <Leaf {...props} />;
  }, []);

  // on mount callback
  React.useEffect(() => {
    // tokenize the full document
    // tokenizeAndHighlight(editor, Editor.range(editor, [0, 0], [0, 0]));
  }, []);


  // Render the Slate context.
  return (
    <div className="context-context">
      <div className="editor-context">
        <div className="editor">
          <Slate
            editor={editor}
            value={initialValue}
            // onChange={(value) => {

            //   const { selection } = editor;
            //   if (!selection) return;

            //   // const isChange = editor.operations.some(
            //   //   // it is a deletion or insertion
            //   //   (op) => op.type === "insert_text" || op.type === "remove_text"
            //   // );

            //   // if (isChange) {
            //   //   // save to local storage
            //   //   const content = JSON.stringify(value);
            //   //   localStorage.setItem("content", content);
            //   //   if (value.length > 0) {
            //   //     let text = value[0].children
            //   //       .map((child) => child.text)
            //   //       .join("");
            //   //     console.log("text", text);
            //   //   }
            //   // }
            // }}
          >
            <Editable
              renderElement={renderElement}
              renderLeaf={renderLeaf}
              onKeyDown={(event) => {
                // if (event.key === 'Enter') {
                //   // Prevent the default behavior of the keypress
                //   event.preventDefault();
                //   console.log(event, data, change)
                //   // Otherwise, handle `Enter` yourself...
                // }

                // if (event.key === "Enter") {
                //   event.preventDefault();
                //   // add a new line token
                //   Transforms.insertNodes(editor, {
                //     type: "token",
                //     newline: true,
                //     children: [{ text: "\n", newline: true }], // I dont' know why we don't have to add a \n here to make it work
                //   });
                // }


                const { selection } = editor;
                if (!selection) return;

                delayedTokenizeAndHighlight(editor, selection);


                if (!event.metaKey) {
                  // log the current tokens
                  printChildren(editor.children);
                  return;
                }
                switch (event.key) {
                  case "b": {
                    event.preventDefault();
                    CustomEditor.toggleBoldMark(editor);
                    break;
                  }
                  case "y": {
                    event.preventDefault();
                    const range = editor.selection; // Replace with your specific range if needed
                    mergeNodesInRange(editor, range);
                    break;
                  }
                  case "k": case "p": {
                    event.preventDefault();
                    tokenizeAndHighlight(editor, selection);
                    break;
                  }
                }
              }}
            />
          </Slate>
        </div>
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

const Leaf = (props) => {
  if (props.text.text.match(/^\s+$/)) {
  console.log("LEAFY", props);
  //   return <span
  //   {...props.attributes}
  //   style={{
  //     fontWeight: props.leaf.bold ? "bold" : "normal",
  //     backgroundColor: probToColor(props.leaf.prob ? props.leaf.prob : 0),
  //   }}
  // >SPACE{props.children}</span>
  }

  return (
    <span
      {...props.attributes}
      style={{
        fontWeight: props.leaf.bold ? "bold" : "normal",
        backgroundColor: probToColor(props.leaf.prob ? props.leaf.prob : 0),
      }}
    >{props.children}</span>
  );
};

const DefaultElement = (props) => {
  return <p {...props.attributes}>{props.children}</p>;
};

const TokenElement = (props) => {
  return <span {...props.attributes}
    style={{
      color: props.prob ? 'blue' : 'black',
    }}
  >{props.children}</span>;
};

export default App;