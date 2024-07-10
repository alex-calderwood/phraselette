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

    let preConstraints = constraints.filter((constraint) => {
      return constraint.isPre;
    });
    let postConstraints = constraints.filter((constraint) => {
      return !constraint.isPre;
    });
    
    return searchForward(document, preConstraints).then(
      (predictions) => {
        console.log('predictions', predictions)
        for (let predictedSpan of predictions) {
          for (let constraint of postConstraints) {
            console.log('constraint', constraint)
            if (constraint.applies(predictedSpan)) {
              let score = constraint.evaluate(predictedSpan, document)
              console.log(predictedSpan, score)
              // predictedSpan.scores[constraint.name] = score; // scores may not exist
              if (!predictedSpan.scores) {
                predictedSpan.scores = {};
              }
              predictedSpan.scores[constraint.name] = score;
            }
          }
        }

        // filter out constraints that are lower than a threshold
        let threshold = 0.0;
        let finalPredictions = predictions.filter((prediction) => {
          for (let constraint of postConstraints) {
            if (prediction.scores[constraint.name] < threshold) {
              return false;
            }
          }
          return true;
        });

        console.log('finalPredictions', finalPredictions);

        let sorted = finalPredictions.sort((a, b) => {
          let name = 'test';
          return a.scores[name] - b.scores[name];
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

