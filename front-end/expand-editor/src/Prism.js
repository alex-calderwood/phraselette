import React, { Component } from "react";
import { TokenRange } from "./Components";

export class Prism {
  constructor(name, dataType) {
    this.name = name;
    this.dataType = dataType;
    this.active = false;
    this.doHighlight = false;
    this.activeConstraints = [];
  }

  setActive(value) {
    this.active = value;
    console.log('setting active to', value);
    return this;
  }

  setDoHighlight(value) {
    this.doHighlight = value;
    return this;
  }

  static getActive(prisms) {
    return Object.keys(prisms).filter((key) => {
      return prisms[key].active;
    });
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
    console.log('prism props', props);
    this.tokenManager = this.props.tokenManager;
    this.state = {
      doHighlight: this.props.prism.doHighlight,
      constraints: []
    }
  }

  handleAddConstraint() {
    this.setState({ 
      constraints: this.state.constraints.concat([new Constraint('constraint', this.props.type)]) 
    });
  }

  toggleHighlight() {
    console.log('toggling highlight', this.props.prism.name, this.props.prism.doHighlight)
    this.props.prism.setDoHighlight(!this.props.prism.doHighlight);
    this.setState({ doHighlight: this.props.prism.doHighlight });
    console.log('toggling highlight', this.props.prism.name, this.props.prism.doHighlight)

  }

  render() {
    console.log('rendering prism', this.props.prism.name, 'active', this.props.prism.active, 'doHighlight', this.props.prism.doHighlight);
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
          <label htmlFor={`highlight` + this.props.prism.name}>highlight</label>
          <input type="checkbox" id={`highlight` + this.props.prism.name} name="highlight" checked={this.state.doHighlight} onChange={this.toggleHighlight.bind(this)}/>
        </div>
      </div>
  }
}