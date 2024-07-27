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

  addConstraintToApp(constraint) {
    this.props.onAdd(constraint);
    // remove it from the temp consraints
    let newTempConstraints = this.state.tempConstraints.filter((tempConstraint) => {
      return tempConstraint.id !== constraint.id;
    });
    this.setState({tempConstraints: newTempConstraints});
  }

  render() {
    console.log("creator for prism", this.props.prism);
    return <div className="constraint-creator">
      {this.state.tempConstraints.map((constraint) => {
        return <div className="temp-constraint-container" key={constraint.id}> 
          <ConstraintRender key={constraint.id} constraint={constraint} />
          <button onClick={() => this.addConstraintToApp(constraint)}> bind </button>
        </div>
      })}

      {this.props.prism.features.map((feature) => {
        console.log("feature", feature, "for prism", this.props.prism);
        return <div key={feature.name}>
          <button key={feature.name} onClick={() => this.makeTempConstraint(feature)}> add {feature.name} constraint </button>
          {/* <button onClick={() => this.addConstraint(feature)}>+</button>
          <button onClick={this.props.onRemove}>-</button> */}
        </div> 
      })}
    </div>
  }
}