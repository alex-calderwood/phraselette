import { Editor, Transforms, Node, Range, Path, Point, Text } from 'slate';

export const mergeNodesInRange = (editor, range) => {
  if (!range) return;

  // Get the nodes in the specified range
  const [start, end] = Range.edges(range);
  const nodes = Array.from(Editor.nodes(editor, { at: range }));
  console.log(nodes)

  printChildren(Editor.nodes(editor, { at: range }));

  // Concatenate text from all nodes in the range
  // let mergedText = '';
  // for (const [node] of nodes) {
  //   mergedText += Node.string(node);
  // }

  // // Remove the nodes in the range
  // Transforms.removeNodes(editor, { at: range });

  // // Insert a new node with the merged text at the start of the range
  // Transforms.insertNodes(
  //   editor,
  //   {
  //     type: 'paragraph',
  //     children: [{ text: mergedText }],
  //   },
  //   { at: start }
  // );

  // // Collapse the selection to the end of the merged text
  // Transforms.select(editor, {
  //   anchor: Editor.start(editor, start),
  //   focus: Editor.end(editor, start),
  // });
};

export const visNode = (node) => {
  return {'text': Node.string(node), ...node};
}

export const printNode = (node) => {
  console.log(visNode(node));
};

export const visChildren = (children) => {
  let easyChildren = children[0].children.map(
    (c) => {
      return visNode(c);
    });
    return easyChildren;
}

export const printChildren = (children) => {
    console.log(visChildren(children))
};

// Function to find the path from offset
// TODO I don't think this takes into account \n characters

/* 
* This functino is to find the path from absolute offset from the start of the document
*/
export const findPathFromOffset = (editor, offset) => {
  let totalOffset = 0;
  
  for (const [node, path] of Node.texts(editor)) {
    if (path.length > 0) {
      if (path[path.length - 1] > 0) {
        totalOffset += 1;
      }
    }
    const nodeTextLength = node.text.length;
    if (totalOffset + nodeTextLength > offset) {
      return path;
    }
    totalOffset += nodeTextLength;
  }
};

// // split isn't working so I'm going to try to do it manually
// export const splitNodes = (editor, options) => {
//   console.log("isPoint", Point.isPoint(options.at))
//   const { at } = options;
//   console.log("isPoint", Point.isPoint(at))

//   const [node, path] = Editor.node(editor, at);
//   const offset = at.offset;
//   const before = { ...node, text: node.text.slice(0, offset) };
//   const after = { ...node, text: node.text.slice(offset) };
//   // const newPath = Path.next(path); // this is wrong, it grabs the next text node [n m o+1], not the next node [n m+1 0]
//   const newPath = Path.next(path.slice(0, path.length - 1));
//   Transforms.removeNodes(editor, { at: path });
//   Transforms.insertNodes(editor, before, { at: path });
//   Transforms.insertNodes(editor, after, { at: newPath });
// }

export const splitNodes = (editor, options) => {
  const { at } = options;
  if (!Point.isPoint(at)) {
    console.error('The "at" property must be a valid Point.');
    return;
  }

  const [node, path] = Editor.node(editor, at);
  if (!Text.isText(node)) {
    console.error('The node at the specified point is not a text node.');
    return;
  }

  const offset = at.offset;
  const before = { ...node, text: node.text.slice(0, offset) };
  const after = { ...node, text: node.text.slice(offset) };

  Editor.withoutNormalizing(editor, () => {
    // Remove the original node
    Transforms.removeNodes(editor, { at: path });

    // Insert the "before" split part at the original node's path
    Transforms.insertNodes(editor, before, { at: path });

    // Calculate the new path for the "after" part
    // Assuming `path` is an array of indices, increment the last index to get the new path
    let newPath = path.slice(0, -1).concat(path[path.length - 1] + 1);

    // Insert the "after" split part at the new path
    Transforms.insertNodes(editor, after, { at: newPath });
  });
}

window.visChildren = visChildren;
window.Transforms = Transforms;
window.Node = Node;
window.Editor = Editor;
window.Range = Range;
window.Path = Path;
window.Point = Point;