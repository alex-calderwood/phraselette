import React, { Component } from "react";

export class Constraint {
  constructor(name, dataType) {
    this.name = name;
    this.dataType = dataType;
    this.id = Constraint.makeConstraintID();
  }

  static makeConstraintID() {
    return Math.random().toString(36).substring(7);
  }
}
export class ConstraintWindow extends Component {
  constructor(props) {
    super(props);
    this.constraint = this.props.constraint;
    console.log('constraint window', this.constraint);
  }

  registerConstraint() {
    console.error('register constraint not registered');
  }

  deleteConstratint() {
    console.error('delete constraint not registered');
  }

  render() {
    console.log('rendering constraint', this.constraint.name, this.constraint.dataType, this.constraint);
    
    let type;
    switch (this.constraint.dataType) {
      case 'string':
        type = 'text';
        break;
      case 'number':
        type = 'number';
        break;
      default:
        type = 'text';
    }

    return <div className="constraint">
              <span>{this.constraint.dataType}</span>
              <input type={type} />
              <button onClick={this.registerConstraint}>constrain</button>
              <button onClick={this.deleteConstratint} >x</button>
            </div>;
  }

}
