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
    // do spacy stuff
    let token = span; // this is a placeholder
    let letter = token.text[0];
    // turn it to a number
    let number = parseInt(letter, 36) - 9;
    return number;
  }

  /*
  * Does the constraint apply to the given span?
  */
  applies(span) {
    return true;
  }

  static makeConstraintID() {
    return Math.random().toString(36).substring(7);
  }
}
