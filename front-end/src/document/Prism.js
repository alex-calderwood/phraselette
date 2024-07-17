import {searchForward, miscTokensToWordTokens} from '../scripts/smarts.js';

export class Prism {
  constructor(name, dataType, features=[]) {
    this.name = name;
    this.dataType = dataType;
    this.active = false;
    this.shouldHighlight = false;

    this.tokenManagerTokens = this.name; // which tokens to look up in the tokenManager
    this.features = features || [];

    this.results = null;

    // UI Variables
    this.hidden = false;
  }

  /* 
   * Is the Prism active in the UI?
   * In the future we should separate this UI functionality from the Prism object
  */
  setActive(value) {
    this.active = value;
    return this;
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
    return Object.keys(prisms).filter((key) => {
      return prisms[key].active;
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

export class LLMProbabilityPrism extends Prism {
  constructor() {
    super('likelihood', 'number');
  }

  /*
   * Given a document and a list of constraints, return a list of spans that maximally satisfy the constraints.
  */
  async search(document, constraints) {
    let numWords = Math.max(...constraints.map((constraint) => { return constraint.targetSpan.length; }));
    
    let searchDepth = Math.max(1, Math.min(2, numWords)); // eventually we want to go forward, but right now we're using greedy search so shouldnt...
    // numWords = Math.max(1, numWords)
    // let searchDepth = numWords; // eventually we want to go forward, but right now we're using greedy search so shouldnt...

    console.log('search', searchDepth)
    // let searchDepth = 2;
    const preConstraints  = constraints.filter((constraint) => { return  constraint.isPre; });
    console.log("document", document)
    let predictions = await searchForward(document, preConstraints, searchDepth).then( // turn the predictions into words
      async (predictions) => {
        for (let prediction of predictions) {
          console.log('prediciotn', prediction.span);
          let words = await miscTokensToWordTokens(prediction.span, document);
          console.log('words', words);
          // cap the number of words based on numWords
          // words = words.slice(0, numWords);
          prediction.span = words;
        }
        return predictions;
    });

    this.results = predictions;
    return predictions;
  }

}
