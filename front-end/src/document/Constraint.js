
export class Constraint {
  constructor(name, dataType) {
    this.name = name;
    this.dataType = dataType;
    this.id = Constraint.makeConstraintID();
    this.span = null;
  }

  static makeConstraintID() {
    return Math.random().toString(36).substring(7);
  }
}


