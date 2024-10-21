import React, { Component, useState } from "react";
import { BetterRhymeConstraint, CategoricalConstraint, 
  NumericalRangeConstraint, WordLengthConstraint } from "../base/Constraint";
import { LogHistogram } from "./Histogram"

class HistogramRangeConstraintView extends Component {
  constructor(props) {
    super(props);
  }

  update = (newMin, newMax) => {
    this.props.constraint.updateTargetMin(newMin);
    this.props.constraint.updateTargetMax(newMax);
    this.props.onConstraintUpdate();
  }

  render() {
    let { constraint, prism, hasHistogramData } = this.props;
    const data = prism?.insights[this.props.opening?.id]?.summary || null;
    hasHistogramData = hasHistogramData && data !== null;

    return (
      <ConstraintWrapper {...this.props} >
        <LogHistogram data={data} onUpdate={this.update} hasData={hasHistogramData}/>
      </ConstraintWrapper>
    );
  }
}

// gradually moving these to use hooks
const RangeConstraintView = (props) => {
  const { constraint, onConstraintUpdate } = props;
  const [min, setMin] = useState(constraint.targetMin);
  const [max, setMax] = useState(constraint.targetMax);
  const text = `${constraint.feature.plain} min, max`;

  const handleMinChange = (e) => {
    const newMin = parseFloat(e.target.value);
    setMin(newMin);
    constraint.updateTargetMin(newMin);
    onConstraintUpdate();
  };

  const handleMaxChange = (e) => {
    const newMax = parseFloat(e.target.value);
    setMax(newMax);
    constraint.updateTargetMax(newMax);
    onConstraintUpdate();
  };

  return (
    <ConstraintWrapper {...props} >
        <div className="text">{text}</div>
        <div className="constraint-target">
          <input
            type="number"
            value={min}
            onChange={handleMinChange}
            className="constraint-select"
          />
          <span className="text">to</span>
          <input
            type="number"
            value={max}
            onChange={handleMaxChange}
            className="constraint-select"
          />
        </div>
    </ConstraintWrapper>
  );
};

export default RangeConstraintView;

class CategoricalConstraintView extends Component {
  constructor(props) {
    super(props);
    let constraint = this.props.constraint;
    this.state = {
      target: constraint.targetSequence,
      mode:   constraint.mode,
    }
  }
  
  addTarget = () => {
    let newTarget = this.props.constraint.addTarget();
    this.setState({ target: newTarget });
    this.props.onConstraintUpdate();
  }

  deleteTarget = () => {
    let newTarget = this.props.constraint.deleteTarget();
    this.setState({ target: newTarget });
    this.props.onConstraintUpdate();
  }

  handleChange = (event) => {
    const newValue = event.target.value;
    const index = event.target.id.split('-').pop();
    let newTarget = this.props.constraint.updateTarget(index, newValue);
    this.setState({ target: newTarget });
    this.props.onConstraintUpdate();
  };

  handleChangeMode = (event) => {
    const newMode = event.target.value;
    this.props.constraint.changeMode(newMode);
    this.setState({ mode: newMode })
    this.props.onConstraintUpdate();
  }

  render() {
    let constraint = this.props.constraint;
    let featureAttribute = constraint.feature.attribute;
    let possibleConstraintValues = constraint.range;
    let modes = Object.keys(constraint.modes);
    let target = this.state.target;

    return  <ConstraintWrapper {...this.props} >
      <select className="constraint-mode" key={constraint.id} value={constraint.mode} onChange={this.handleChangeMode}>
          {modes.map(mode => {
            return <option key={mode} value={mode}>{mode}</option>
          })}
      </select>
      <div className="constraint-target">
        {target.map(tokenTarget => {
          return <select className="constraint-select" id={`constraint-select-${constraint.id}-${tokenTarget.index}`} key={tokenTarget.index} value={tokenTarget[featureAttribute]} onChange={this.handleChange}>
            {possibleConstraintValues.map(value => {
              return <option key={value} value={value}>{value}</option>
            })}
          </select>
        })}
      </div>
      <button onClick={this.addTarget}>＋</button>
      <button onClick={this.deleteTarget}>−</button>
    </ConstraintWrapper>;
  }
}

class ConstraintWrapper extends Component {
  
  onDelete() {
    this.props.onDelete(this.props.constraint);
    this.props.onConstraintUpdate();
  }

  render() {
    const { constraint, children } = this.props;
    const id = `${constraint.id}-constraint`;
    return (
      <div id={id} className="constraint">
        {children}
        {!this.props.isTemp && <button onClick={() => this.onDelete()}>×</button>}
      </div>
    );
  }
}

const constraintViews = {
  CategoricalConstraint: CategoricalConstraintView,
  POSConstraint: CategoricalConstraintView,
  SoundConstraint: CategoricalConstraintView,
  RhymeConsntraint: CategoricalConstraintView,
  BetterRhymeConstraint: CategoricalConstraintView,
  WordLengthConstraint: RangeConstraintView,
  NumericalRangeConstraint: HistogramRangeConstraintView,
};

export class ConstraintRender extends React.Component {
  render() {
    const { constraint, ...otherProps } = this.props;
    const ConstraintView = constraintViews[constraint.constructor.name];
    return ConstraintView ? <ConstraintView key={constraint.id} constraint={constraint} {...otherProps} /> : null;
  }
}