import React, { Component } from "react";
import { TokenRange } from "./TokenRange";
import { Constraint, ConstraintWindow } from "./Constraint";
import { Alternates } from "./Alternates";

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

  // deactivate all prisms passed in
  static unhighlightAll(prisms) {
    // for now, we only allow one highlighted lense, so we need to uncheck all the other ones
    let activeLenses = Prism.getActive(prisms);
    for (let lense of activeLenses) {
      prisms[lense].setDoHighlight(false);  
    }
  }
}

export class PrismComponent extends Component {
  constructor(props) {
    super(props);
    this.tokenManager = this.props.tokenManager;
    this.prism = this.props.prism;
    this.shouldHighlight = this.props.shouldHighlight; // passed in as a prop to trigger changes correctly
    this.state = {
      constraints: [],
    }
  }

  handleAddConstraint() {
    this.setState({ 
      constraints: this.state.constraints.concat([new Constraint('constraint', this.prism.dataType)]) 
    });
  }

  toggleHighlight() {
    this.setState({ shouldHighlight: !this.prism.shouldHighlight });

    // tell the parent that the highlight has changed, which will update the prism.shouldHighlight
    if (this.props.onHighlightChange) {
      this.props.onHighlightChange(this.prism.name, !this.prism.shouldHighlight);
    }
  }

  render() {
    let prism = this.prism;
    let start = this.props.startChar;
    let end   = this.props.endChar;

    let tokens = [];
    if (start !== null) {
      tokens = this.tokenManager.tokensAt(prism.name, start, end);
    }

    let hidden = prism.active && tokens.length > 0 ? '' : 'hidden';

    return <div className={`prism ${hidden}`}>
        <div className='title'> 
          <span>{prism.name} tokens </span>
          
          <span className="highlight">
            <input type="checkbox" id={`highlight` + prism.name} name="highlight" checked={this.props.shouldHighlight} onChange={this.toggleHighlight.bind(this)}/>
            <label htmlFor={`highlight` + prism.name}>highlight</label>
          </span>
        </div>

        <TokenRange tokens={tokens} 
          tokenManager={this.tokenManager} 
          prismName={prism.name}
          startChar={start} endChar={end}/>

        <Alternates tokenManager={this.tokenManager} prism={prism} />

        <div className="constraint-container">
          <button onClick={this.handleAddConstraint.bind(this)}>constrain</button>
          {this.state.constraints.map((constraint) => {
            return <ConstraintWindow constraint={constraint} />
          })}
        </div>
        
      </div>
  }
}