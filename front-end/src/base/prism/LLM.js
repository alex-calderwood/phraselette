import { searchForward, miscTokensToWordTokens, gpt2Tokenize } from '../../scripts/smarts.js';
import { Feature } from '../Feature.js';
import { Prism, setSequenceProb } from './Prism.js';

export class LLMProbabilityPrism extends Prism {
  STOPLIST = new Set(["_", "�"]);

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

    await searchForward(document, preConstraints, numTokens).then(
      (predictions) => {
        // TODO document that constraints might have been altererd in the meantime
        // should copy them if necessary - at least document?
        this.onSearchResults({predictions: predictions}, document, constraints, numWords)
      }
    )
  }

  async onSearchResults(insights, document, constraints, numWords) {
    let predictions = insights.predictions

    for (let prediction of predictions) {
      setSequenceProb(prediction)
    }

    for (let prediction of predictions) {
      let words = await miscTokensToWordTokens(prediction.span, document, numWords);
      prediction.span = words;
    }
    
    // deduplicate based on strippedTextContent
    predictions = this.deduplicate(predictions);
    // remove bad predicitons
    predictions = predictions.filter((prediction) => { return !this.badPrediction(prediction) });


    super.onSearchResults({predictions: predictions}, document, constraints);
  }

  badPrediction(prediction) {
    if(isNaN(prediction.getAttribute('prob'))) { return true; }
    if(prediction.span.length === 0) { return true; }
    if(this.STOPLIST.has(prediction.strippedTextContent)) { return true; }

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