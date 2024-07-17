import React, { Component } from "react";
import { makeConstraint } from "../document/Constraint";

export class ConstraintCreator extends Component {
  constructor(props) {
    super(props);
  }

  addConstraint = () => {
    let type = this.props.prism.features[0];
    let target = this.props.tokens.map(token => token.pos);
    let constraint = makeConstraint(type, target=target) 
    this.props.onAdd(constraint);
  }

  render() {
    return <div className="constraint-creator">
      {/* <div className="title">add constraint</div> */}
      <div> 
        <button onClick={this.addConstraint.bind(this)}>+</button>
        <button onClick={this.props.onRemove}>-</button>
      </div>
    </div>;
  }
}