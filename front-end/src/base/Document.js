import { clone } from '../scripts/utils.js'

export class Document {
    constructor(text, selection, tokenManager) {
        this.text = text;
        this.selection = clone(selection);
        this.tokenManager = tokenManager; // should this be cloned? is it being used?
    }

    // The text before the user's selection
    get prefixText() {
        if (this._bounce()) return '';
        let text = this.text.slice(0, this.selection.startTextIndex);
        return text;
    }

    // The text after the user's selection
    get suffixText() {
        if (this._bounce()) return '';
        let text = this.text.slice(this.selection.endTextIndex); // TODO verify this is correct
        console.log("doc: TODO PLEASE VERIFY THIS suffix text", text)
        return text
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
        return [this.selection.startTextIndex, this.selection.endTextIndex];
    }

    _bounce() {
        return !this.selection;
    }

    static fromSelection(selection) {
        return new Document // TODO
    }

    clone() {
        return new Document(this.text, this.selection, this.tokenManager);
    }

    updateToOpening(opening) {
        let copy = this.clone();
        copy.selection = {
            ...this.selection,
            startTextIndex: opening.start,
            endTextIndex: opening.end,
            startDocumentSpanIndex: undefined, // these would have to be reconstructed somehow
            endDocumentSpanIndex: undefined,
            text: this.text.slice(opening.start, opening.end + 1),
            note: 'Document modified by Document.updateToOpening - not all data aligns'
        }
        return copy;
    }
}