export class Document {
    constructor(text, selection, tokenManager) {
        this.text = text;
        this.selection = selection;
        this.tokenManager = tokenManager;
    }

    // The text before the user's selection
    get prefixText() {
        return this.text.slice(0, this.selection.startIndex);
    }

    // The text after the user's selection
    get suffixText() {
        return this.text.slice(this.selection.endIndex);
    }

    // The text inside the user's selection
    get selectionText() {
        return this.selection.text;
    }

    // The text before and inside the user's selection
    get withoutSuffix() {
        return this.prefixText + this.selectionText;
    }

    // Character inclusive range indices
    get range() {
        return [0, this.text.length - 1];
    }

    
}