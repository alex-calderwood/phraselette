
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
  evaluate(span) {
    
  }

  /*
  * Does the constraint apply to the given span?
  */
  applies(span) {

  }

  static makeConstraintID() {
    return Math.random().toString(36).substring(7);
  }
}


