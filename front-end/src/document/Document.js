export class Document {
    constructor(text, selection, tokenManager) {
        this.text = text;
        this.selection = selection;
        this.tokenManager = tokenManager;
    }

    // TODO test these
    get prefixText() {
        return this.text.slice(0, this.selection.startIndex);
    }

    get suffixText() {
        return this.text.slice(this.selection.endIndex);
    }

    get selectionText() {
        return this.selection.text;
    }
}