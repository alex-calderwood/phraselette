import { miscTokensToWordTokens, gpt2Tokenize } from '../../scripts/smarts.js';
import { Sequence } from '../Sequence.js';
import { sendMessage } from "../../scripts/socket.js";
import { Prism, setSequenceProb } from './Prism.js';
import { Constraint } from '../Constraint.js';

export class ThesaurusPrism extends Prism {
  constructor(description) {
    super('thesaurus', []);
    this.textFields = {
      'description': {text: description, name: 'description'}
    }
    this.title = description;
    this.duplicatable = true;
  }

  updateTextField(featureName, value) {
    this.textFields.description.text = value;
    this.title = value;
  }

  async search(opening, document, constraints) {
    this.onSearchTriggered(); // UI update
    let description = this.textFields.description.text;
    sendMessage({
      type: "thesaurus",
      selection: document.selectionText,
      description: description,
      opening: opening.id,
      prism: this.id,
      constraints: Constraint.nonEmptyConstraintJson(constraints),
    });
  }

  async onSearchResults(opening, insights, document, constraints) {
    let message = insights.message;
    let words = message.revisions;
    console.log('thesaurus: thesaurus got words', words)

    let predictions = await ThesaurusPrism.processRevisions(words, document);

    super.onSearchResults(opening, {predictions: predictions}, document, constraints);
  }

  static async processRevisions(revisions, document) {
    let predictions = [];
    for (let revision of revisions) {

      // Add a space to the revision if the original version had a space (the llm gets confused and loses this space)
      if (document.selectionText.startsWith(" ") && !revision.startsWith(" ")) {
        revision = " " + revision
      }

      let text = document.prefixText + revision;

      let range = [document.prefixText.length, text.length]; // is this range correct?
      let tokens = await gpt2Tokenize(text, { tokenizeRange: range });
      let sequence = new Sequence(tokens);
      setSequenceProb(sequence);
      predictions.push(sequence);
    }

    // get spacy scores
    for (let prediction of predictions) {
      let words = await miscTokensToWordTokens(prediction, document);
      prediction.span = words;
    }
    return predictions;
  }
}
