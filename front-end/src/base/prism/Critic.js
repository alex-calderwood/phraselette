import { miscTokensToWordTokens, gpt2Tokenize } from '../../scripts/smarts.js';
import { Sequence } from '../Sequence.js';
import { sendMessage } from "../../scripts/socket.js";
import { Prism, setSequenceProb } from './Prism.js';

export class CriticPrism extends Prism {
  constructor(description) {
    super('critic', ['prob']);
    this.textFeatures = {
      'description': {text: description, name: 'description'}
    }
    this.subTitle = description;
  }

  updateTextFeature(featureName, value) {
    this.textFeatures[featureName].text = value;
    this.subTitle = value;
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

  async onSearchResults(message, document, constraints) {
    let words = message.definitions;
    console.log('got words', words)

    let predictions = [];
    for (let word of words) {
      let text = document.prefixText + word;
      console.log('getting tokens for', text)
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
    
    super.onSearchResults(predictions, document, constraints);
  }
}
