import {searchForward, miscTokensToWordTokens} from '../scripts/smarts.js';
import { Sequence } from './Sequence.js';
import { Token } from './Token.js'
import { sendMessage } from "../scripts/socket";

export class Prism {

  /**
   * Create a Prism.
   * @param {string} name - The name of the Prism.
   * @param {string} dataType - Not currently used.
   * @param {Array} [features=[]] - An array of features that become available to view or constrain.
   * @param {Object|null} [parentToken=null] - The name of the token that this Prism uses as its tokenization (in TokenManager).
   *                                           Defaults to {name}.
   */
  constructor(name, dataType, features=[], parentToken=null) {
    this.name = name;     // eventually this should be type
    this.subTitle = name; // eventually this should be name
    this.dataType = dataType;
    this.active = false;
    this.shouldHighlight = false;

    // which tokens to look up in the tokenManager
    this.parentToken = parentToken ? parentToken : this.name;  
    
    this.features = features || [];
    this.textFeatures = [];
    this.results = null;

    // UI Variables
    this.hidden = false;
    this.isSearching = false;
    this.onSearchComplete = () => {};
  }

  /* 
   * Is the Prism active in the UI?
   * In the future we should separate this UI functionality from the Prism object
  */
  setActive(value) {
    this.active = value;
    return this;
  }

  onSearch() {
    this.isSearching = true;
  }

  onSearchResults(predictions, document) {
    this.results = predictions.sort((a, b) => {
      return a.scores['total'] - b.scores['total'];
    });
    this.isSearching = false;
    this.onSearchComplete(this);
  }

  /* 
   * Should the Prism highlight the spans it finds?
  */
  setDoHighlight(value) {
    this.shouldHighlight = value;
    return this;
  }

  async search(document, constraints) {
    return [];
  }

  /* 
  * Helper to filter the active prisms from a list of prisms.
  */
  static getActive(prisms) {
    return Object.values(prisms).filter((prism) => {
      return prism.active;
    });
  }

  /* 
  * Helper to deactivate all prisms passed in.
  */
  static unhighlightAll(prisms) {
    // for now, we only allow one highlighted lense, so we need to uncheck all the other ones
    let activeLenses = Prism.getActive(prisms);
    for (let lense of activeLenses) {
      prisms[lense].setDoHighlight(false);  
    }
  }
}

export class DictionaryPrism extends Prism {
  constructor(description) {
    super('dictionary', 'string');
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
    console.log('searching with description', description)
    sendMessage({
      type: "dictionary",
      word: document.selectionText,
      description: description,
    });
  }

  async onSearchResults(message, document) {
    console.log("message in dict", message, document)
    let definitions = message.definitions;
    let predictions = definitions.map((def) => {return new Sequence([new Token({text: def})])})
    
    for (let prediction of predictions) {
      let words = await miscTokensToWordTokens(prediction.span, document);
      prediction.span = words;
    }
    
    super.onSearchResults(predictions, document);
  }
}

export class LLMProbabilityPrism extends Prism {
  constructor() {
    super('likelihood', 'number');

    // search settings
    this.minTokens = 1;
    this.maxTokens = 15;
  }

  /*
   * Given a document and a list of constraints, return a list of sequences that maximally satisfy the constraints.
  */
  async search(document, constraints) {
    this.onSearch();
    
    let numWords = Math.max(...constraints.map((constraint) => { return constraint.targetSequence.length; }));
    numWords = Math.max(numWords, 1);

    let numTokens = numWords;
    if (numWords > 1) {
      let numTokens = Math.floor(numWords * 4/3 + 4);                            // enough tokens to approximate the correct word count
      numTokens = Math.max(this.minTokens, Math.min(this.maxTokens, numTokens)); // clamp it
    }

    const preConstraints  = constraints.filter((constraint) => { return  constraint.isPre; });
    await searchForward(document, preConstraints, numTokens).then(
      (predictions) => {
        this.onSearchResults(predictions, document, numWords)
      }
    )
  }

  async onSearchResults(predictions, document, numWords) {
    for (let prediction of predictions) {
      // average score (to account for different span lengths)
      prediction.scores.likelihood = prediction.span.reduce((acc, token) => { return acc + token.prob; } , 0) / prediction.span.length;
    }
    
    for (let prediction of predictions) {
      let words = await miscTokensToWordTokens(prediction.span, document, numWords);
      prediction.span = words;
    }
    
    // remove NaN
    predictions = predictions.filter((prediction) => { return !isNaN(prediction.scores.likelihood); });

    super.onSearchResults(predictions, document);
  }
}
