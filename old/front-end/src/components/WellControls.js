import React, { Component } from "react";
import { makeConstraint } from "../base/Constraint";

export class WellControls extends Component {
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
    let onRandomize = this.props.onRandomize;
    let onSearch = this.props.onSearch;

    let showConstraintButtons = opening != null;

    return <div
        className="constraint-creator"
        onMouseEnter={this.handleMouseEnter}
        onMouseLeave={this.handleMouseLeave}
      >

      <div className="constraint-buttons"> 
        {showConstraintButtons && prism.features.map((feature) => {
          return <button 
                    style={this.props.styles.buttonStyle} 
                    key={feature.plain} 
                    onClick={() => this.addConstraint(feature, opening)}>🔒 {feature.plain}</button>;
        })}
        {prism.duplicatable && <button style={this.props.styles.buttonStyle} onClick={onRandomize}>🎲</button>}
        {prism.canSearch && <button style={this.props.styles.buttonStyle} onClick={onSearch}>🖌️</button>}
      </div>

    </div>
  }
}