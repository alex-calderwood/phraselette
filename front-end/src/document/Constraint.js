import { overlaps } from '../scripts/utils.js';

export class Constraint {

  constructor(name, dataType) {
    this.name = name;
    this.dataType = dataType;
    this.id = Constraint.makeConstraintID();
    this.span = null;
    this.isPre = false; // can the constraint be computed quickly?
  }

  /* 
  * Return a score indicating how much the span coheres to the constraint
  */
  evaluate(span, document) {
    console.log('evaluating', span, document)

    // this is a placeholder
    let token = span[0];
    let letter = token.text[0];
    let number = parseInt(letter, 36) - 9;
    return number;
  }

  /*
  * Does the constraint apply to the given span?
  */
  applies(span) {
    if (this.span === null) {
      return false;
    }

    return overlaps(this.span, span);
  }

  static makeConstraintID() {
    return Math.random().toString(36).substring(7);
  }
}


export class TestConstraint extends Constraint {
  constructor() {
    super('test', 'test');
  }

  evaluate(span, document) {
    console.log('evaluating', span, document);

    // this is a placeholder
    let token = span.span[0];
    let letter = token.text && token.text.length > 0 ? token.text.trim()[0] : 'a';
    let number = parseInt(letter, 36);
    return number || 0;
  }

  applies(span) {
    return true;
  }
}
