export const ChangeType = {
    INSERT: 'INSERT',
    DELETE: 'DELETE',
};
  
export class TextChange {
    constructor(type, startIndex, endIndex, text, length) {
        this.type = type;
        this.startIndex = startIndex;
        this.endIndex = endIndex;
        this.text = text; // This is either the inserted or deleted text
        this.length = length;
        console.log("change:", )
      }
}
  
export class TextChangeTracker {
    constructor() {
      this.changes = [];
    }
  
    addChange(change) {
      this.changes.push(change);
    }
  
    clear() {
      this.changes = [];
    }
  
    getChanges() {
      return this.changes;
    }
}

export function getTextIndexFromNode(node, offset, root) {
    let textIndex = 0;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);

    while (walker.nextNode()) {
      if (walker.currentNode === node) {
        return textIndex + offset;
      }
      textIndex += walker.currentNode.length;
    }

    return textIndex;
  }