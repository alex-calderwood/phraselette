import { sendMessage } from "../../scripts/socket.js";
import { Prism } from './Prism.js';
import { ThesaurusPrism } from './Thesaurus.js';

export class ReaderPrism extends Prism {
  constructor(description) {
    // super('reader', ['prob']); // eventually... ahh ahh ahh ahhhhh
    super('reader', []);

    this.textFeatures = {
      'description': {text: description, name: 'description'}
    }
    this.title = description;
  }

  updateTextFeature(featureName, value) {
    this.textFeatures[featureName].text = value;
    this.title = value;
  }

  async search(document, constraints) {
    this.onSearchTriggered();
    let description = this.textFeatures.description.text;
    sendMessage({
      type: "reader",
      context: document.prefixText,
      selection: document.selectionText,
      description: description,
      prism: this.id,
    });
  }

  async onSearchResults(insights, document, constraints) {
    let message = insights.message;
    let revisions = message.revisions;
    console.log('critic got words', revisions)

    let predictions = await ThesaurusPrism.processRevisions(revisions, document);
    
    super.onSearchResults({predictions: predictions, text: message.response}, document, constraints);
  }
}
