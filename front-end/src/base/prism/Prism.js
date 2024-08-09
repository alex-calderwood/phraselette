import { resolveConstraints, sortPredictions } from '../../scripts/resolution.js';
import { Constraint } from '../Constraint.js';
import { getUniqueUUID } from '../../scripts/utils.js';

export class Prism {
  static TYPES = ['words', 'context', 'critic', 'thesaurus', 'sound', 'basic', 'probability-base'];
  /**
   * Create a Prism.
   * @param {string} type - The category of the prism
   * @param {Array} [features=[]] - An array of features that this prism makes available to view or constrain. See Feature.js
   * @param {Object|null} [tokenType=null] - The name of the token that this Prism uses as its tokenization (in TokenManager).
   *                                           Defaults to {name}.
   */
  constructor(type, features=[], tokenType=null) {
    this.id = `${type}-${getUniqueUUID()}`;
    this.type = type;
    this.title = type;
    this.active = false;

    // which tokens to look up in the tokenManager
    this.tokenType = tokenType ? tokenType : this.type;  
    
    this.features = features || [];
    this.textFeatures = [];
    this.insights = null;

    this.sortBy = 'total'; // default sorting // TODO take a look at this

    // UI Variables
    this.shouldHighlight = false; // is this prism responsible for coloring the text editor spans
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

  // Triggered at the beginning of a search
  onSearchTriggered() {
    this.isSearching = true;
  }

  /**
   * Triggered when the search has concluded.
   * 
   * Insights might be in the form of token predictions or any other data that can be given to the user to comment 
   * on their text. 
   * @param {object} insights - The things that the prism has learned about the text.
   *                            Each search should return an insights thesaurus. 
   *                            Will contain a 'predictions' key when it is making alternate word predictions.
   * @param {Document} document - the working document in the editor. Should be taken with a small grain of salt as I haven't tested that it is up to date.
   * @param {Constraint[]} constraints - the constraints applicable to the current prism
  */
  async onSearchResults(insights, document, constraints) {
    let predictions = insights?.predictions || [];

    constraints = Constraint.subsetByFeatures(constraints, this.features)
    const preConstraints  = constraints.filter((constraint) => { return  constraint.isPre; });
    let results = await resolveConstraints(predictions, constraints, false);
    results = sortPredictions(results, this.sortBy, true);

    console.log(`search results for ${this.type}:`, results);
    this.insights = {results: results, ...insights};

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

  // Search logic to be overriden
  async search(document, constraints) {  return []; }

  // Static methods

  /* 
  * Helper to filter the active prisms from a list of prisms.
  */
  static getActive(prisms) {
    return Object.values(prisms).filter((prism) => {
      return prism.active;
    });
  }

  static firstByType(prisms, type) {
    return this.getByType(prisms, type)[0];
  }

  static getByType(prisms, type) {
    return Object.values(prisms).filter((prism) => {
      return prism.type === type;
    });
  }

  static getByID(prisms, id) {
    for (let key in prisms) {
      if (prisms[key].id === id) {
        return prisms[key];
      }
    }
    return null;
  }

  /* 
  * Helper to deactivate all prisms passed in.
  */
  static unhighlightAll(prisms) {
    // for now, we only allow one highlighted lense, so we need to uncheck all the other ones
    let activePrisms = Prism.getActive(prisms);
    for (let prism of activePrisms) {
      prism.setDoHighlight(false);  
    }
  }
}

// TODO put this somewhere better
export function setSequenceProb(sequence) {
  let logProb = sequence.span.reduce((acc, token) => { return acc + token.getAttribute('logProb'); }, 0);
  let logProbMean = logProb / sequence.span.length;
  let probGeometricMean = Math.exp(logProbMean);

  sequence.setAttribute('logProb', logProb);
  sequence.setAttribute('probGeometricMean', probGeometricMean);
  sequence.setAttribute('prob', probGeometricMean); // used for scoring
  return sequence;
}