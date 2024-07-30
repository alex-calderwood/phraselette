import { searchForward, miscTokensToWordTokens, gpt2Tokenize } from '../scripts/smarts.js';
import { Sequence } from './Sequence.js';
import { Token } from './Token.js'
import { sendMessage } from "../scripts/socket";
import { Feature } from './Feature.js';
import { resolveConstraints } from '../scripts/resolution.js';

export class Prism {
  /**
   * Create a Prism.
   * @param {string} name - The name of the Prism.
   * @param {Array} [features=[]] - An array of features that become available to view or constrain.
   * @param {Object|null} [parentToken=null] - The name of the token that this Prism uses as its tokenization (in TokenManager).
   *                                           Defaults to {name}.
   */
  constructor(name, features=[], parentToken=null) {
    this.name = name;     // eventually this should be type
    this.subTitle = name; // eventually this should be name
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

  async onSearchResults(predictions, document, constraints) {
    // TODO resolve the constraints here
    // only save the ones that pass I think
    this.results = await resolveConstraints(predictions, constraints);

    console.log('search results', this.name, this.results);

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
    super('dictionary', []);
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

  async onSearchResults(message, document, constraints) {
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

export class LLMProbabilityPrism extends Prism {
  constructor() {
    super('likelihood', [Feature.Prob]);

    // search settings
    this.minTokens = 1;
    this.maxTokens = 25;
  }

  /*
   * Given a document and a list of constraints, return a list of sequences that maximally satisfy the constraints.
  */
  async search(document, constraints) {
    this.onSearch(); // UI
    let targetSequenceWords = Math.max(...constraints.map((constraint) => { return constraint?.targetSequence?.length || 0; }));
    let selectionWords = document.selectionText.split(' ').length; // TODO I suppose we should have the tokenized words to calculate this...
    let numWords = targetSequenceWords > 0 ? targetSequenceWords : selectionWords;
    numWords = Math.max(numWords, 1);

    let numTokens = numWords;
    let longestExpeectedWordInTokens = 1;
    numTokens = Math.floor(numWords * 4/3 + longestExpeectedWordInTokens);                            // enough tokens to approximate the correct word count
    numTokens = Math.max(this.minTokens, Math.min(this.maxTokens, numTokens)); // clamp it

    const preConstraints  = constraints.filter((constraint) => { return  constraint.isPre; });

    console.log('search', {numWords, numTokens, selectionWords, targetSequenceWords})
    await searchForward(document, preConstraints, numTokens).then(
      (predictions) => {
        // TODO document that constraints might have been altererd in the meantime
        // should copy them if necessary - at least document?
        this.onSearchResults(predictions, document, constraints, numWords)
      }
    )
  }

  async onSearchResults(predictions, document, constraints, numWords) {
    for (let prediction of predictions) {
      setSequenceProb(prediction)
    }

    for (let prediction of predictions) {
      let words = await miscTokensToWordTokens(prediction.span, document, numWords);
      prediction.span = words;
    }
    
    // remove NaN
    predictions = predictions.filter((prediction) => { return !isNaN(prediction.getAttribute('prob')); });

    super.onSearchResults(predictions, document, constraints);
  }
}

// TODO put this somewhere better
function setSequenceProb(sequence) {
  // average score (to account for different span lengths)
  let seqProb = sequence.span.reduce((acc, token) => { return acc + token.prob; } , 0) / sequence.span.length;
  // TODO we should be doing this on logprobs:
  // let seqProb = sequence.span.reduce((acc, token) => { return acc * token.prob; } , 0);
  console.log('seqProb', seqProb)
  sequence.setAttribute('prob', seqProb);
  return sequence;
}
