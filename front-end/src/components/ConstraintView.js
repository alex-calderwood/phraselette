import React, { Component } from "react";

export class CategoricalConstraintView extends Component {
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
    let feature = constraint.targetFeature;
    let type;
    switch (constraint.dataType) {
      case 'string':
        type = 'text';
        break;
      case 'number':
        type = 'number';
        break;
      default:
        type = 'text';
    }

    let possibleConstraintValues = constraint.range;
    let target = this.state.target;

    let id = `${constraint.id}-constraint`

    return  <div id={constraint.id} className="constraint">
      {target.map(tokenTarget => {
        return <select className="constraint-select" id={`constraint-select-${tokenTarget.index}`} key={tokenTarget.index} value={tokenTarget[feature]} onChange={this.handleChange}>
          {possibleConstraintValues.map(value => {
            return <option key={value} value={value}>{value}</option>
          })}
        </select>
      })}
      {/* <label for={id}>comparator</label> */}
      {/* <input id={id} className="info-item" value={"=="}></input> */}
      <button onClick={this.addTarget}>+</button>
      <button onClick={this.deleteTarget}>-</button>
    </div>;
  }
}
