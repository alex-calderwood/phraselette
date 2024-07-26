import React, { Component } from "react";
import { makeConstraint } from "../document/Constraint";
import { ConstraintRender } from "./ConstraintView";

export class ConstraintCreator extends Component {
  constructor(props) {
    super(props);
    this.state = {tempConstraints : []}
  }

  makeTempConstraint = (feature) => {
    let target = this.props.tokens;
    let constraint = makeConstraint(feature, target=target);
    this.setState({tempConstraints: [...this.state.tempConstraints, constraint]});
  }

  actuallyAdd (constraint) {
    this.props.onAdd(constraint);
  }

  render() {
    return <div className="constraint-creator">
      {this.state.tempConstraints.map((constraint) => {

        return <div className="temp-constraint-container" key={constraint.id}> 
          <ConstraintRender key={constraint.id} constraint={constraint} />
          <button onClick={() => this.actuallyAdd(constraint)}> bind </button>
        </div>
      })}

      {this.props.prism.features.map((feature) => {
        return <div>
          <button onClick={() => this.makeTempConstraint(feature)}> add {feature} constraint </button>
          {/* <button onClick={() => this.addConstraint(feature)}>+</button>
          <button onClick={this.props.onRemove}>-</button> */}
        </div> 
      })}
    </div>
  }
}