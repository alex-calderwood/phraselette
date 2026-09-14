import { sendMessage } from "../../scripts/socket.js";
import { Prism } from './Prism.js';
import { ThesaurusPrism } from './Thesaurus.js';
import { Constraint } from "../Constraint.js";

export class ReaderPrism extends Prism {
  constructor(description) {
    // super('reader', ['prob']); // eventually... ahh ahh ahh ahhhhh
    super('reader', []);

    this.textFields = {
      'description': {text: description, name: 'description'}
    }
    this.title = description;
    this.duplicatable = true;
  }

  updateTextField(featureName, value) {
    this.textFields[featureName].text = value;
    this.title = value;
  }

  async search(opening, document, constraints) {
    this.onSearchTriggered();
    let description = this.textFields.description.text;
    sendMessage({
      type: "reader",
      context: document.prefixText,
      selection: document.selectionText,
      description: description,
      opening: opening.id,
      prism: this.id,
      constraints: Constraint.nonEmptyConstraintJson(constraints),
    });
  }

  async onSearchResults(opening, insights, document, constraints) {
    let message = insights.message;
    let revisions = message.revisions;

    let predictions = await ThesaurusPrism.processRevisions(revisions, document);

    super.onSearchResults(opening, {predictions: predictions, text: message.response}, document, constraints);
  }
}