import { sendMessage } from "../../scripts/socket.js";
import { Prism } from './Prism.js';
import { Constraint } from "../Constraint.js";

export class DictionaryPrism extends Prism {
  constructor(description) {
    // super('reader', ['prob']); // eventually... ahh ahh ahh ahhhhh
    super('dictionary', []);

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
      type: "dictionary",
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
    let definitions = message.definitions;

    // let predictions = await ThesaurusPrism.processRevisions(revisions, document);
    console.log("dictionary definitions", definitions)

    super.onSearchResults(opening, {predictions: [], text: definitions}, document, constraints);
  }
}