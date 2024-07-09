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
    console.log('search', document, constraints)
    let preConstraints = constraints.filter((constraint) => { return constraint.isPre});
    return searchForward(document, preConstraints).then(
      (predictions) => {
        console.log('predictions', predictions)
        let postConstraints = constraints.filter((constraint) => {return !constraint.isPre});
        for (let predictedSpan in predictions) {
          for (let constraint in postConstraints) {
            if (constraint.applies(predictedSpan)) {
              let score = constraint.evaluate(predictedSpan)
              predictedSpan.scores[constraint.name] = score;
            }
          }
        }

        // filter out constraints that are lower than a threshold
        let threshold = 0.0;
        console.log(typeof predictions, Array.isArray(predictions), predictions)
        let finalPredictions = predictions.filter((prediction) => {
          for (let constraint in postConstraints) {
            if (prediction.scores[constraint.name] < threshold) {
              return false;
            }
          }
          return true;
        });
        return finalPredictions;
      }
    );
  }

  setActive(value) {
    this.active = value;
    return this;
  }

  setDoHighlight(value) {
    this.shouldHighlight = value;
    return this;
  }

  static getActive(prisms) {
    return Object.keys(prisms).filter((key) => {
      return prisms[key].active;
    });
  }

  // deactivate all prisms passed in
  static unhighlightAll(prisms) {
    // for now, we only allow one highlighted lense, so we need to uncheck all the other ones
    let activeLenses = Prism.getActive(prisms);
    for (let lense of activeLenses) {
      prisms[lense].setDoHighlight(false);  
    }
  }
}

