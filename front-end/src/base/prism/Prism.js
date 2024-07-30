import { searchForward, miscTokensToWordTokens, gpt2Tokenize } from '../../scripts/smarts.js';
import { Sequence } from '../Sequence.js';
import { Token } from '../Token.js'
import { sendMessage } from "../../scripts/socket.js";
import { Feature } from '../Feature.js';
import { resolveConstraints } from '../../scripts/resolution.js';

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

// TODO put this somewhere better
export function setSequenceProb(sequence) {
  // average score (to account for different span lengths)
  let seqProb = sequence.span.reduce((acc, token) => { return acc + token.prob; } , 0) / sequence.span.length;
  // TODO we should be doing this on logprobs:
  // let seqProb = sequence.span.reduce((acc, token) => { return acc * token.prob; } , 0);
  console.log('seqProb', seqProb)
  sequence.setAttribute('prob', seqProb);
  return sequence;
}
