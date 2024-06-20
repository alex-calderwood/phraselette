import { Editor, Transforms, Text, Node, Path } from "slate";
import { findPathFromOffset, printChildren, splitNodes } from "./editorTools";

/* 
  * This function takes in a Slate context, editor, and focalPoint and sends the text to the backend for tokenization.
  * The backend returns a list of tokens, each with a span and a probability.
  * 
  * context: the Nodes whose text is needed to correctly interpret the meaning of the subsequent text
  * editor: the Slate editor
  * focalPoint: the path of the text node that the user is currently editing
*/

// Something unlikely to be seen, must match the tokenization in the backend (server.py)
const breakToken = "&&VE*A=]";

async function tokenize(context, tokenizeRange, editor) {
  // const context = Editor.node(editor, contextIn);
  // let text = Node.string(context);
  console.log("context", context, "range", tokenizeRange);

  let focalPoint = {
    path: tokenizeRange.anchor.path,
    offset: 0
  }
  
  // Set the context range to be the start of the document to the beginning of the focalPoint token
  // and the tokenize range to be the start of the focalPoint token to the end of the document
  let contextRange = Editor.range(editor, [0, 0], focalPoint);
  tokenizeRange.anchor = focalPoint;

  console.log("tokenizeRange", tokenizeRange, "contextRange", contextRange);

  let tokenizeNodes = Node.fragment(editor, tokenizeRange);
  let contextNodes = Node.fragment(editor, contextRange);

  console.log("tokenizeNodes", tokenizeNodes);
  console.log("contextNodes", contextNodes);

  // let text = Node.string(tokenizeNodes); // doesn't work with 2d
  // let pre_context = Node.string(contextNodes);
  let text = tokenizeNodes.map(n => Node.string(n)).join('\n');
  let pre_context = contextNodes.map(n => Node.string(n)).join('\n');

  const data = { 
    text: text,
    context: pre_context,
  };

  // use Transforms.mergeNodes(editor: Editor, options?) to turn all nodes in the tokenizeRange into one node


  try {
    const response = await fetch("http://127.0.0.1:5000/probs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error("Network response was not ok");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    let currentPath = focalPoint.path;
    let growingOffset = pre_context.length;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(breakToken);
      buffer = lines.pop();

      for (const line of lines) {
        if (line.trim()) {
          const token = JSON.parse(line);

          // construct a range from the current path and the growing offset
          const newTokenRange = {
            anchor: { path: currentPath, offset: token.span[0] - growingOffset},
            focus:  { path: currentPath, offset: token.span[1] - growingOffset},
          }; 

          console.log("token", token, "range", newTokenRange, "currentPath", currentPath, "currentOffset", growingOffset);
          
          console.log("before merge", editor.children);
          mergeUntilTokenCanFit(currentPath, token);
          console.log("after merge", editor.children);
          console.log("path", newTokenRange.anchor.path, "gpt", token.span[0], token.span[1], "dom", newTokenRange.anchor.offset, newTokenRange.focus.offset);
          console.log("slicing at", newTokenRange.focus)
          
          console.log("before split", editor.children)
          Transforms.splitNodes(editor, { at: newTokenRange.focus.path, always: false});
          // splitNodes(editor, { at: newTokenRange.focus});
          // Transforms.removeNodes(editor, { at: newTokenRange.focus.path });
          console.log("after split", editor.children)
          // delete any text nodes '' that this created (should be the last node)


          console.log("setting prob at", newTokenRange.anchor, "to", token.prob)
          Transforms.setNodes(
            editor,
            { prob: 1 },
            {
              at: newTokenRange.anchor,
              // This only matches text nodes that are not already italic.
              match: (node, path) => Text.isText(node) && node.italic !== true,
            }
          )
          
          // update the current offset to teh end of the token
          growingOffset = growingOffset + token.span[1] - token.span[0];
          // update the current path to the next path
          // we can't just use the anchor path because the anchor path may have been split
          // TODO does this work for newlines?
          currentPath = findPathFromOffset(editor, growingOffset);

          console.log("new currentPath", currentPath, "new growingOffset", growingOffset);
        }
      }
    }
    printChildren(editor.children);

  } catch (error) {
    console.error("There has been a problem with your fetch operation:", error);
    console.log(editor.children)
  }

  function mergeUntilTokenCanFit(currentPath, token) {
    // select the DOM token (rather than the text node)
    let domNodePath = currentPath.slice(0, 2);
    let domNode = Node.get(editor, domNodePath);
    let domText = Node.string(domNode);
    // compare it to the tokenized token length
    let newTokenLength = token.span[1] - token.span[0];
    let nextNode = Path.next(domNodePath).slice(0, 2);
    while (newTokenLength > domText.length && nextNode.length > 0) {
      // merge the next node into the current node
      console.log("merging nodes at", domNodePath, 'with', nextNode);
      // merge the next node into the previous (current) node
      Transforms.mergeNodes(editor, { at: nextNode });
      // update the current node
      domNode = Node.get(editor, domNodePath);
      domText = Node.string(domNode);
      // update the next node
      nextNode = Path.next(domNodePath).slice(0, 2);
    }
  }
}


export { tokenize };