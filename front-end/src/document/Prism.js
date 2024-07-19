import {searchForward, miscTokensToWordTokens} from '../scripts/smarts.js';

export class Prism {
  constructor(name, dataType, features=[], parentToken=null) {
    this.name = name;
    this.dataType = dataType;
    this.active = false;
    this.shouldHighlight = false;

    // which tokens to look up in the tokenManager
    this.parentToken = parentToken ? parentToken : this.name;  
    
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

// TODO: how do I get prisms to share data?
export class SoundPrism extends Prism {

}

export class LLMProbabilityPrism extends Prism {
  constructor() {
    super('likelihood', 'number');

    // search settings
    this.minDepth = 1;
    this.maxDepth = 5;
  }

  /*
   * Given a document and a list of constraints, return a list of spans that maximally satisfy the constraints.
  */
  async search(document, constraints) {
    let numWords = Math.max(...constraints.map((constraint) => { return constraint.targetSequence.length; }));
    let searchDepth = Math.max(this.minDepth, Math.min(this.maxDepth, numWords)); // eventually we want to go forward, but right now we're using greedy search so shouldnt...

    const preConstraints  = constraints.filter((constraint) => { return  constraint.isPre; });
    let predictions = await searchForward(document, preConstraints, searchDepth).then(
      async (predictions) => {
        for (let prediction of predictions) {
          prediction.scores = prediction.scores || {};
          prediction.scores.likelihood = prediction.span.reduce((acc, token) => { return acc + token.prob; } , 0) / prediction.span.length;
        }
        return predictions;
    }
    ).then( // turn the predictions into words
      async (predictions) => {
        for (let prediction of predictions) {
          let words = await miscTokensToWordTokens(prediction.span, document);
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
