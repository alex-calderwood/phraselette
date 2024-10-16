import React, { Component } from "react";
import { makeConstraint } from "../base/Constraint";

export class PrismControls extends Component {
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
    let onSearch = this.props.onSearch;

    let showConstraintButtons = opening != null;
    console.log('constraint:', prism, opening, showConstraintButtons)

    return <div
        className="constraint-creator"
        onMouseEnter={this.handleMouseEnter}
        onMouseLeave={this.handleMouseLeave}
      >


      <div className="constraint-buttons"> 
        {showConstraintButtons && prism.features.map((feature) => {
          return <button key={feature.plain} onClick={() => this.addConstraint(feature, opening)}> add {feature.plain} constraint </button>;
        })}
        {prism.canSearch && <button onClick={onSearch}>▶</button>}
      </div>

    </div>
  }
}