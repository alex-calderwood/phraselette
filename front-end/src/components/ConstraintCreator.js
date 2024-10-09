import React, { Component } from "react";
import { makeConstraint } from "../base/Constraint";

export class ConstraintCreator extends Component {
  constructor(props) {
    super(props);
    this.state = {
      showFullCreator: false
    }
  }
  handleMouseEnter = () => {
    this.setState({ showFullCreator: true });
  }

  handleMouseLeave = () => {
    this.setState({ showFullCreator: false });
  }

  addConstraint(feature, opening) {
    let target = this.props.tokens;
    let constraint = makeConstraint(feature, target=target, opening);
    this.props.onAdd(constraint);
  }

  render() {
    let prism = this.props.prism;
    let opening = this.props.opening;

    return <div
        className="constraint-creator"
        onMouseEnter={this.handleMouseEnter}
        onMouseLeave={this.handleMouseLeave}
      >

      {!this.state.showFullCreator && this.props.prism.features.length > 0 && <div className="add-constraint major-text"> Add constraint </div>}

      {this.state.showFullCreator && <div className="constraint-buttons">
        {prism.features.map((feature) => {
          return <div key={feature.plain}>
            <button key={feature.plain} onClick={() => this.addConstraint(feature, opening)}> add {feature.plain} constraint </button>
          </div> 
        })}
      </div>}
    </div>
  }
}