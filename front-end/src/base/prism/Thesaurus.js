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
    this.onSearch();
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
    console.log('got words', words)
    // let predictions = definitions.map((def) => {return new Sequence([new Token({text: def})])})

     // TODO abstract this
     // Get probabilities
     // not the way to do this, returns promises
    // let predictions = words.map(async (word) => {
    //   let text = document.prefixText + word;
    //   console.log('getting tokens for', text)
    //   let range = [0, text.length];
    //   let tokens = await gpt2Tokenize(text, { tokenizeRange: range });
    //   let sequence = new Sequence(tokens);
    //   setSequenceProb(sequence);
    //   return sequence;
    // });

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
