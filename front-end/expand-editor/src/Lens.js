import React, { Component } from "react";
import { TokenRange } from "./Components";

export class Prism {
  constructor(name, dataType) {
    this.name = name;
    this.dataType = dataType;
    this.active = false;
    this.activeConstraints = [];
  }

  setActive(value) {
    this.active = value;
    console.log('setting active to', value);
    return this;
  }
}

class Constraint {
  constructor(name, dataType) {
    this.name = name;
    this.dataType = dataType;
  }
}

class ConstraintWindow extends Component {
  constructor(props) {
    super(props);
  }

  render() {
    return <span className="constraint-window" key={this.props.constraint.name}>
      {this.props.constraint.name}
    </span>
  }
}

export class PrismComponent extends Component {
  constructor(props) {
    super(props);
    this.tokenManager = this.props.tokenManager;
    // this.constraints = [];
    this.state = {
      constraints: []
    }
  }

  handleAddConstraint() {
    this.setState({ 
      constraints: this.state.constraints.concat([new Constraint('constraint', this.props.type)]) 
    });
  }

  toggleHighlight() {
    this.props.toggleHighlight();
  }

  render() {
    return <div> 
        <TokenRange tokenManager={this.tokenManager} 
        type={this.props.type}
        // type={this.props.lense.dataType} // TODO
        startChar={this.props.startChar} endChar={this.props.endChar}/>
        <div className="constraint">
          <button onClick={this.handleAddConstraint.bind(this)}>constraint</button>
          {this.state.constraints.map((constraint) => {
            return <ConstraintWindow key={constraint.name} constraint={constraint} />
          })}
        </div>
        <div className="highlight">
          <label htmlFor={`highlight` + this.props.type}>highlight</label>
          <input type="checkbox" id={`highlight` + this.props.type} name="highlight" value={this.props.doHighlight} onChange={this.toggleHighlight.bind(this)}/>
        </div>
      </div>
  }
}