import React, { Component } from "react";


export class ConstraintWindow extends Component {
  constructor(props) {
    super(props);
    this.constraint = this.props.constraint;
  }

  registerConstraint() {
    console.error('register constraint not registered');
  }

  deleteConstratint() {
    console.error('delete constraint not registered');
  }

  render() {
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

    return <div id={this.props.constraint.id} className="constraint">
      <span>{this.constraint.dataType}</span>
      <input type={type} />
      <button onClick={this.registerConstraint}>constrain</button>
      <button onClick={this.deleteConstratint}>x</button>
    </div>;
  }

}
