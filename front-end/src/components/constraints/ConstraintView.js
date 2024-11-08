import React, { Component, useState } from "react";
import { BetterRhymeConstraint, CategoricalConstraint, 
  NumericalRangeConstraint, WordLengthConstraint, SoundConstraint} from "../../base/Constraint";
import { LogHistogram } from "../Histogram"

export class HistogramRangeConstraintView extends Component {
  constructor(props) {
    super(props);
  }

  update = (newMin, newMax) => {
    this.props.constraint.updateTargetAtIndexMin(newMin);
    this.props.constraint.updateTargetAtIndexMax(newMax);
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
export const RangeConstraintView = (props) => {
  const { constraint, onConstraintUpdate } = props;
  const [min, setMin] = useState(constraint.targetMin);
  const [max, setMax] = useState(constraint.targetMax);
  const text = `${constraint.feature.plain} min, max`;

  const handleMinChange = (e) => {
    const newMin = parseFloat(e.target.value);
    setMin(newMin);
    constraint.updateTargetAtIndexMin(newMin);
    onConstraintUpdate();
  };

  const handleMaxChange = (e) => {
    const newMax = parseFloat(e.target.value);
    setMax(newMax);
    constraint.updateTargetAtIndexMax(newMax);
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

export class CategoryListConstraintView extends Component {
  constructor(props) {
    super(props);
    let constraint = this.props.constraint;
    this.state = {
      target: constraint.targetSequence,
      mode:   constraint.mode,
    }
  }

  renderExtra() { // for subclasses to override
    return null;
  }

  replaceTarget = (newTarget) => {
    this.setState({ target: newTarget });
    this.props.constraint.replaceTarget(newTarget)
    this.props.onConstraintUpdate();
  }
  
  pushTarget = () => {
    let newTarget = this.props.constraint.pushTarget();
    this.setState({ target: newTarget });
    this.props.onConstraintUpdate();
  }

  popTarget = () => {
    let newTarget = this.props.constraint.popTarget();
    this.setState({ target: newTarget });
    this.props.onConstraintUpdate();
  }

  handleChange = (event) => {
    const newValue = event.target.value;
    const index = event.target.id.split('-').pop();
    let newTarget = this.props.constraint.updateTargetAtIndex(index, newValue);
    this.setState({ target: newTarget });
    this.props.onConstraintUpdate();
  };

  handleChangeMode = (event) => {
    const newMode = event.target.value;
    this.props.constraint.changeMode(newMode);
    this.setState({ mode: newMode })
    this.props.onConstraintUpdate();
  }

  deleteTargetAtIndex = (indexToDelete) => {
    let newTarget = this.state.target.filter((_, index) => index !== indexToDelete)
      .map((item, index) => ({ ...item, index })); // reindex remaining items
    
    this.props.constraint.replaceTarget(newTarget);
    this.setState({ target: newTarget });
    this.props.onConstraintUpdate();
  };

  render() {
    let constraint = this.props.constraint;
    let featureAttribute = constraint.feature.attribute;
    let possibleConstraintValues = constraint.range;
    let modes = Object.keys(constraint.modes);
    let target = this.state.target;

    return (
      <ConstraintWrapper {...this.props}>
        {this.renderExtra()}
        <div className="constraint-content">
          <select 
            className="constraint-mode" 
            style={this.props.styles.buttonStyle}
            key={constraint.id} 
            value={constraint.mode} 
            onChange={this.handleChangeMode}
          >
            {modes.map(mode => (
              <option key={mode} value={mode}>{mode}</option>
            ))}
          </select>
          <div className="constraint-target">
            {target.map((tokenTarget, index) => (
              <div 
                className="constraint-select-container" 
                key={`container-${tokenTarget.index}`}
              >
                <select
                  className="constraint-select"
                  id={`constraint-select-${constraint.id}-${tokenTarget.index}`}
                  value={tokenTarget[featureAttribute]}
                  onChange={this.handleChange}
                  style={this.props.styles.buttonStyle}
                >
                  {possibleConstraintValues.map(value => (
                    <option key={value} value={value}>{value}</option>
                  ))}
                </select>
                <button
                  className="constraint-delete-button glass"
                  onClick={() => this.deleteTargetAtIndex(index)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <button style={this.props.styles.buttonStyle} onClick={this.pushTarget}>＋</button>
          <button style={this.props.styles.buttonStyle} onClick={this.popTarget}>−</button>
        </div>
      </ConstraintWrapper>
    );
  }
}

export class ConstraintWrapper extends Component {
  
  onDelete() {
    this.props.onDelete(this.props.constraint);
  }

  render() {
    const { constraint, children } = this.props;
    const id = `${constraint.id}-constraint`;
    
    return (
      <div id={id} className="constraint">
        {children}
        {!this.props.isTemp && <button 
          style={this.props.styles.buttonStyle} 
          className="constraint-main-delete"
          onClick={() => this.onDelete()}>×</button>}
      </div>
    );
  }
}
