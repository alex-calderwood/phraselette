import { sendMessage } from "../../scripts/socket.js";
import { Prism } from './Prism.js';

export class CriticPrism extends Prism {
  constructor(description) {
    // super('critic', ['prob']); // eventually... ahh ahh ahh ahhhhh
    super('critic', []);

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
    this.onSearch();
    let description = this.textFeatures.description.text;
    sendMessage({
      type: "critic",
      context: document.prefixText,
      selection: document.selectionText,
      description: description,
    });
  }

  async onSearchResults(insights, document, constraints) {
    let message = insights.message;
    super.onSearchResults( {predictions: [], text: message.response}, document, constraints);
  }
}
