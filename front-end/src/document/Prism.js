import {searchForward, spacyTokenize} from '../scripts/smarts.js';

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
    const preConstraints  = constraints.filter((constraint) => { return  constraint.isPre; });
    const postConstraints = constraints.filter((constraint) => { return !constraint.isPre; });
    
    return searchForward(document, preConstraints).then( // turn the predictions into words
      async (predictions) => {
        for (let prediction of predictions) {
          prediction.span = await this.miscTokensToWordTokens(prediction.span, document);
        }
        return predictions;
      }).then(
      async (predictions) => {
        for (let predictedSpan of predictions) {
          console.log("predictedSpan", predictedSpan);
          let spanTotal = 0;
          for (let constraint of postConstraints) {
            if (constraint.applies(predictedSpan)) {
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

  async miscTokensToWordTokens(tokenSpan, document) {
    // // TODO we can reuse spacy's tokenization
    // // https://stackoverflow.com/questions/53594690/is-it-possible-to-use-spacy-with-already-tokenized-input
    // // but for now let's just retokenize

    // compute the text that results from adding the span we are evaluating to the rest of the prefix
    let newText = document.prefixText + tokenSpan.reduce(
      (acc, token) => {
        return acc + token.text;
      },
      ''
    );

    // Let spacy figure out where the words are in the text that results from adding
    // the span we are evaluating to the existing text
    let wordTokens = await spacyTokenize(newText, { onToken: (token) => { } });

    // now we need to split it back into the tokens that were in after the given text
    let splitIndex = tokenSpan[0].start;
    let newWordTokens = wordTokens.filter((token) => {
      return token.end >= splitIndex;
    });

    let firstWord = newWordTokens[0];
    if (firstWord.start < splitIndex) { // TODO this needs to be tested
      let diff = splitIndex - firstWord.start;
      firstWord.text = firstWord.text.slice(diff);
      firstWord.start = splitIndex;
      firstWord.incomplete = true;
    }

    console.log({tokenSpan, wordTokens, newWordTokens, splitIndex});

    return newWordTokens;
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

