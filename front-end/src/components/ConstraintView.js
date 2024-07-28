import React, { Component } from "react";
// import { Constraint, CategoricalConstraint, POSConstraint, 
//   RhymeConstraint, AlliterationConstraint} from "../document/Constraint";
import { scientific } from "../scripts/utils";

class NumericalRangeConstraint extends Component {
  constructor(props) {
    super(props);
    this.state = {
      targetMin: this.props.constraint.targetMin,
      targetMax: this.props.constraint.targetMax,
    };
  }

  changeMin = (event) => {
    const newValue = parseFloat(event.target.value);
    this.setState({ targetMin: newValue });
    this.props.constraint.updateTargetMin(newValue);
  };

  changeMax = (event) => {
    const newValue = parseFloat(event.target.value);
    this.setState({ targetMax: newValue });
    this.props.constraint.updateTargetMax(newValue);
  };

  render() {
    const { constraint } = this.props;
    const { targetMin, targetMax } = this.state;

    return (
      <ConstraintWrapper constraint={constraint}>
        <div className="text"> 
          Min: {scientific(constraint.targetMin)} Max: {scientific(constraint.targetMax)}
        </div>
        <input
            type="range"
            min={constraint.range[0]}
            max={constraint.range[1]}
            step="any"
            value={targetMin}
            onChange={this.changeMin}
          />
        <input
            type="range"
            min={constraint.range[0]}
            max={constraint.range[1]}
            step="any"
            value={targetMax}
            onChange={this.changeMax}
          />
      </ConstraintWrapper>
    );
  }
}

class CategoricalConstraintView extends Component {
  constructor(props) {
    super(props);
    let constraint = this.props.constraint;
    this.state = {
      target: constraint.targetSequence,
    }
  }
  
  addTarget = () => {
    let newTarget = this.props.constraint.addTarget();
    this.setState({ target: newTarget });
  }

  deleteTarget = () => {
    let newTarget = this.props.constraint.deleteTarget();
    this.setState({ target: newTarget });
  }

  handleChange = (event) => {
    const newValue = event.target.value;
    const index = event.target.id.split('-').pop();
    let newTarget = this.props.constraint.updateTarget(index, newValue);
    this.setState({ target: newTarget });
  };

  render() {
    let constraint = this.props.constraint;
    let featureName = constraint.feature.name;

    let possibleConstraintValues = constraint.range;
    let target = this.state.target;

    return  <ConstraintWrapper constraint={constraint}>
      {target.map(tokenTarget => {
        return <select className="constraint-select" id={`constraint-select-${tokenTarget.index}`} key={tokenTarget.index} value={tokenTarget[featureName]} onChange={this.handleChange}>
          {possibleConstraintValues.map(value => {
            return <option key={value} value={value}>{value}</option>
          })}
        </select>
      })}
      <button onClick={this.addTarget}>+</button>
      <button onClick={this.deleteTarget}>-</button>
    </ConstraintWrapper>;
  }
}

class ConstraintWrapper extends Component {
  render() {
    const { constraint, children } = this.props;
    const id = `${constraint.id}-constraint`;
    return (
      <div id={id} className="constraint">
        {children}
      </div>
    );
  }
}

const constraintViews = {
  CategoricalConstraint: CategoricalConstraintView,
  POSConstraint: CategoricalConstraintView,
  SoundConstraint: CategoricalConstraintView,
  RhymeConsntraint: CategoricalConstraintView,
  NumericalRangeConstraint: NumericalRangeConstraint,
  AlliterationConstraint: null,
};

export class ConstraintRender extends React.Component {
  render() {
    const { constraint, ...otherProps } = this.props;
    const ConstraintView = constraintViews[constraint.constructor.name];
    return ConstraintView ? <ConstraintView key={constraint.id} constraint={constraint} {...otherProps} /> : null;
  }
}