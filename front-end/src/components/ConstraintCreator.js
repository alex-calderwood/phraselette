import React, { Component } from "react";
import { makeConstraint } from "../base/Constraint";
import { ConstraintRender } from "./ConstraintView";

export class ConstraintCreator extends Component {
  constructor(props) {
    super(props);
    this.state = {
      tempConstraints : [],
      showFullCreator: false
    }
  }
  handleMouseEnter = () => {
    this.setState({ showFullCreator: true });
  }

  handleMouseLeave = () => {
    this.setState({ showFullCreator: false });
  }

  makeTempConstraint = (feature) => {
    let target = this.props.tokens;
    let constraint = makeConstraint(feature, target=target);
    this.setState({tempConstraints: [...this.state.tempConstraints, constraint]});
  }

  addConstraint(constraint) {
    this.props.onAdd(constraint);
    // remove it from the temp consraints
    let newTempConstraints = this.state.tempConstraints.filter((tempConstraint) => {
      return tempConstraint.id !== constraint.id;
    });
    this.setState({tempConstraints: newTempConstraints});
  }

  render() {
    let prism = this.props.prism;

    return <div 
        className="constraint-creator"
        onMouseEnter={this.handleMouseEnter}
        onMouseLeave={this.handleMouseLeave}
      >

      {!this.state.showFullCreator && this.props.prism.features.length > 0 && <div className="add-constraint major-text"> Add constraint </div>}

      {this.state.showFullCreator && this.state.tempConstraints.map((constraint) => {
        return <div className="temp-constraint-container" key={constraint.id}> 
          <ConstraintRender key={constraint.id} constraint={constraint} onConstraintUpdate={this.props.onConstraintUpdate} isTemp={true} prism={prism}/>
          <button onClick={() => this.addConstraint(constraint)}> constrain </button>
        </div>
      })}
      
      {this.state.showFullCreator && <div className="constraint-buttons">
        {prism.features.map((feature) => {
          return <div key={feature.name}>
            <button key={feature.name} onClick={() => this.makeTempConstraint(feature)}> add {feature.name} constraint </button>
            {/* <button onClick={() => this.addConstraint(feature)}>+</button>
            <button onClick={this.props.onRemove}>-</button> */}
          </div> 
        })}
      </div>}
    </div>
  }
}