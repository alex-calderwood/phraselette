export class Document {
    constructor(text, selection, tokenManager) {
        this.text = text;
        this.selection = selection;
        this.tokenManager = tokenManager;
    }

    // The text before the user's selection
    get prefixText() {
        if (this._bounce()) return '';
        return this.text.slice(0, this.selection.startIndex);
    }

    // The text after the user's selection
    get suffixText() {
        if (this._bounce()) return '';
        return this.text.slice(this.selection.endIndex)
    }

    // The text inside the user's selection
    get selectionText() {
        if (this._bounce()) return '';
        return this.selection.text;
    }

    // The text before and inside the user's selection
    get withoutSuffix() {
        if (this._bounce()) return '';
        return this.prefixText + this.selectionText;
    }

    // Character inclusive range indices
    get fullRange() {
        if (this._bounce()) return [0, 0];
        return [0, this.text.length - 1];
    }

    get selectionRange() {        
        if (this._bounce()) return [0, 0];
        return [this.selection.startIndex, this.selection.endIndex];
    }

    _bounce() {
        return !this.selection;
    }

    static fromSelection(selection) {
        return new Document
    }
}