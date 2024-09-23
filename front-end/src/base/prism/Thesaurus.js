import { miscTokensToWordTokens, gpt2Tokenize } from '../../scripts/smarts.js';
import { Sequence } from '../Sequence.js';
import { sendMessage } from "../../scripts/socket.js";
import { Prism, setSequenceProb } from './Prism.js';

export class ThesaurusPrism extends Prism {
  constructor(description) {
    super('thesaurus', []);
    this.textFields = {
      'description': {text: description, name: 'description'}
    }
    this.title = description;
  }

  updateTextField(featureName, value) {
    this.textFields.description.text = value;
    this.title = value;
  }

  async search(opening, document, constraints) {
    this.onSearchTriggered(); // UI update
    let description = this.textFields.description.text;
    sendMessage({
      type: "thesaurus",
      word: document.selectionText,
      description: description,
      opening: opening.id,
      prism: this.id,
    });
  }

  async onSearchResults(opening, insights, document, constraints) {
    let message = insights.message;
    let words = message.revisions;
    console.log('thesaurus: thesaurus got words', words)

    let predictions = await ThesaurusPrism.processRevisions(words, document);
    
    super.onSearchResults(opening, {predictions: predictions}, document, constraints);
  }

  static async processRevisions(words, document) {
    let predictions = [];
    for (let word of words) {
      let text = document.prefixText + word;
      let range = [document.prefixText.length, text.length]; // is this range correct?
      let tokens = await gpt2Tokenize(text, { tokenizeRange: range }); // TODO debug why these are coming through with 0 prob
      let sequence = new Sequence(tokens);
      setSequenceProb(sequence);
      predictions.push(sequence);
    }

    // get spacy scores
    for (let prediction of predictions) {
      let words = await miscTokensToWordTokens(prediction, document);
      prediction.span = words;
    }
    return predictions;
  }
}
