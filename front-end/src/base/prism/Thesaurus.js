import { miscTokensToWordTokens, gpt2Tokenize } from '../../scripts/smarts.js';
import { Sequence } from '../Sequence.js';
import { sendMessage } from "../../scripts/socket.js";
import { Prism, setSequenceProb } from './Prism.js';

export class ThesaurusPrism extends Prism {
  constructor(description) {
    super('thesaurus', []);
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
    console.log('searching with description', description)
    sendMessage({
      type: "thesaurus",
      word: document.selectionText,
      description: description,
      prism: this.id,
    });
  }

  async onSearchResults(insights, document, constraints) {
    let message = insights.message;
    let words = message.definitions;
    console.log('thesaurus got words', words)

    let predictions = [];
    for (let word of words) {
      let text = document.prefixText + word;
      let range = [document.prefixText.length, text.length];           // is this range correct?
      let tokens = await gpt2Tokenize(text, { tokenizeRange: range }); // TODO debug why these are coming through with 0 prob
      let sequence = new Sequence(tokens);
      setSequenceProb(sequence);
      predictions.push(sequence);
    }

    // get spacy scores
    for (let prediction of predictions) {
      let words = await miscTokensToWordTokens(prediction.span, document);
      prediction.span = words;
    }
    
    super.onSearchResults({predictions: predictions}, document, constraints);
  }
}
