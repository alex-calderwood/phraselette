import {searchForward} from '../scripts/smarts.js';

export class Prism {
  constructor(name, dataType) {
    this.name = name;
    this.dataType = dataType;
    this.active = false;
    this.shouldHighlight = false;

    this.tokenManagerTokens = this.name; // which tokens to look up in the tokenManager
    this.features = []; // a list of features?
  }

  /*
   * Given a document and a list of constraints, return a list of spans that maximally satisfy the constraints.
  */
  async search(document, constraints) {
    console.log('search', document, constraints);

    const preConstraints  = constraints.filter((constraint) => { return  constraint.isPre; });
    const postConstraints = constraints.filter((constraint) => { return !constraint.isPre; });
    
    return searchForward(document, preConstraints).then(
      async (predictions) => {
        for (let predictedSpan of predictions) {
          let spanTotal = 0;
          for (let constraint of postConstraints) { // TODO prob an O(1) way to do this part
            if (constraint.applies(predictedSpan)) {
              console.log('predictionSpan', predictedSpan);
              const score = await constraint.evaluate(predictedSpan.span, document);
              predictedSpan.scores[constraint.name] = score;
              spanTotal += score;
            }
          }
          predictedSpan.scores['total'] = spanTotal;
        }

        // filter out constraints that are lower than a threshold
        const threshold = 0.1;
        let finalPredictions = predictions.filter((prediction) => { return prediction.scores['total'] > threshold; });

        let sorted = finalPredictions.sort((a, b) => {
          return b.scores['total'] - a.scores['total'];
        });

        return sorted;
      }
    );
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

