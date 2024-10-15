import { searchForward, miscTokensToWordTokens } from '../../scripts/smarts.js';
import { Feature } from '../Feature.js';
import { Constraint } from '../Constraint.js';
import { Prism, setSequenceProb } from './Prism.js';


export class ContextPrism extends Prism {
  static STOPLIST = ["_", "~", "-"];            // tokens that should not be the entire prediction
  static HALTLIST = ["�", "」", "<|endoftext"]; // tokens that should not appear anywhere in the prediction

  static MIN_TOKENS = 1;
  static MAX_TOKENS = 25;

  constructor() {
    super('context', [Feature.Prob], 'words');
   
    this.sortBy = 'probGeometricMean'; // default sorting
  }

  /*
   * Given a document and a list of constraints, return a list of sequences that maximally satisfy the constraints.
  */
  async search(opening, document, constraints) {
    this.onSearchTriggered(); // UI
    let selectionWords = document.selectionText.split(' ').length; // TODO I suppose we should have the tokenized words to calculate this...
    console.log(`llm: opening text ${opening}`, opening, document)
    let numWords = selectionWords;
    numWords = Math.max(numWords, 1);

    let numTokens = numWords;
    let longestExpeectedWordInTokens = 1;
    numTokens = Math.floor(numWords * 4/3 + longestExpeectedWordInTokens);                            // enough tokens to approximate the correct word count
    numTokens = Math.max(ContextPrism.MIN_TOKENS, Math.min(ContextPrism.MAX_TOKENS, numTokens)); // clamp it

    constraints = Constraint.subsetByFeatures(constraints, this.features)
    const preConstraints  = constraints.filter((constraint) => { return  constraint.isPre; });

    console.log('searching LLM', {preConstraints, selectionWords, numWords, numTokens});

    // TODO document that constraints might have been altererd in the meantime...
    // should copy them if necessary - at least document?
    await searchForward(document, preConstraints, numTokens).then(
      ([predictions, summary]) => {return this.onSearchResults(opening, {predictions, summary}, document, constraints, numWords)}
    )
  }

  async onSearchResults(opening, insights, document, constraints, numWords) {
    let predictions = insights.predictions;

    for (let prediction of predictions) {
      let wordTokens = await miscTokensToWordTokens(prediction, document, numWords);
      prediction.span = wordTokens;
      setSequenceProb(prediction)
    }
            
    // remove bad predictions, duplicate predictions ('the' , 'the') -> ''the'
    predictions = this.deduplicate(predictions);  
    predictions = predictions.filter((prediction) => { return !this.badPrediction(prediction) }); 

    super.onSearchResults(opening, {...insights, predictions: predictions}, document, constraints);
  }

  badPrediction(prediction) {
    if (isNaN(prediction.getAttribute('prob'))) { return true; }
    if (prediction.span.length === 0) { return true; }
    if (ContextPrism.STOPLIST.includes(prediction.strippedTextContent)) { return true; }
    if (ContextPrism.HALTLIST.some(haltToken => prediction.strippedTextContent.includes(haltToken))) { return true; }

    return false;
  }


  deduplicate(predictions) {
    const seen = new Set();
    const deduplicated = predictions.filter(prediction => {
      const content = prediction.strippedTextContent;
      if (!seen.has(content)) {
        seen.add(content);
        return true;
      }
      return false;
    });
    return deduplicated;
  }
}