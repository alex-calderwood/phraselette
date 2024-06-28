import React, { Component } from "react";
import { TokenRange } from "./TokenRange";
import { Constraint, ConstraintWindow } from "./Constraint";

export class Prism {
  constructor(name, dataType) {
    this.name = name;
    this.dataType = dataType;
    this.active = false;
    this.shouldHighlight = false;
    this.activeConstraints = [];
  }

  setActive(value) {
    this.active = value;
    console.log('setting active to', value);
    return this;
  }

  setDoHighlight(value) {
    this.shouldHighlight = value;
    return this;
  }

  static getActive(prisms) {
    return Object.keys(prisms).filter((key) => {
      return prisms[key].active;
    });
  }
}

export class PrismComponent extends Component {
  constructor(props) {
    super(props);
    console.log('prism props', props);
    this.tokenManager = this.props.tokenManager;
    this.state = {
      shouldHighlight: this.props.prism.shouldHighlight,
      constraints: [],
    }
  }

  handleAddConstraint() {
    this.setState({ 
      constraints: this.state.constraints.concat([new Constraint('constraint', this.props.prism.dataType)]) 
    });
  }

  toggleHighlight() {
    console.log('toggling highlight', this.props.prism.name, this.props.prism.shouldHighlight)
    this.props.prism.setDoHighlight(!this.props.prism.shouldHighlight);
    this.setState({ shouldHighlight: this.props.prism.shouldHighlight });
    console.log('toggling highlight', this.props.prism.name, this.props.prism.shouldHighlight)

    // tell the parent that the highlight has changed
    if (this.props.onHighlightChange) { // TODO this
      this.props.onHighlightChange(this.props.prism.name, this.props.prism.shouldHighlight);
    }
  }

  render() {
    let prism = this.props.prism;
    let start = this.props.startChar;
    let end   = this.props.endChar;

    console.log('prism start end', start, end);

    let tokens = [];
    if (start !== null) {
      tokens = this.tokenManager.tokensAt(prism.name, start, end);
    }

    let hidden = prism.active && tokens.length > 0 ? '' : 'hidden';

    console.log('tokens for', prism.name, tokens);

    return <div className={`prism ${hidden}`}>
        <div className='title'> 
          
          <span>{prism.name} tokens </span>
          
          <span className="highlight">
            <input type="checkbox" id={`highlight` + prism.name} name="highlight" checked={this.state.shouldHighlight} onChange={this.toggleHighlight.bind(this)}/>
            <label htmlFor={`highlight` + prism.name}>highlight</label>
          </span>
        </div>

        <TokenRange tokens={tokens} 
          tokenManager={this.tokenManager} 
          prismName={prism.name}
          startChar={start} endChar={end}/>


        <div className="constraint-container">
          <button onClick={this.handleAddConstraint.bind(this)}>constrain</button>
          {this.state.constraints.map((constraint) => {
            return <ConstraintWindow constraint={constraint} />
          })}
        </div>
        
      </div>
  }
}