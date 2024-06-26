import React, { Component } from "react";
import { getColor } from "./color";

function singular(lense) {
  switch(lense) {
    case 'words':
      return 'word';
    case 'spacy':
      return 'extraction';
    case 'basic':
      return 'token';
  }
}

export class LenseBar extends Component {
  constructor(props) {
    super(props);
  }

  /* 
   * When a user selects a new lense from the dropdown, update the state of the parent
  */
  handleChange(event) {
    let lense = event.target.value;

    if (this.props.setCurrentLense)
      this.props.setCurrentLense(lense);

    if (this.props.attemptInitialTokenization)
      this.props.attemptInitialTokenization();
  }

  render() {
    return (
      <div className="lense-bar">
        <label htmlFor="lenses">color by </label>
        {/* a dropdown with each lense type */}
        <select onChange={this.handleChange.bind(this)}>
          {this.props.lenses.map((lense) => {
            return <option key={lense} value={lense}>{lense}</option>;
          })}
        </select>
      </div>
    );
  }
}

export class TokenBar extends Component {
  constructor(props) {
    super(props);
    this.tokenManager = this.props.tokenManager;
  }

  render() {
    console.log('rendering TokenBar', this.props.selection, this.props.startChar, this.props.endChar);
    // let hidden = this.props.selection && this.props.selection.rangy.isCollapsed ? 'hidden' : "";
    // for now we want to always show it
    let hidden = "";

    let lense = this.props.lense;

    let start = this.props.startChar;
    let end   = this.props.endChar;

    let tokens = [];
    if (start !== null) {
      tokens = this.tokenManager.tokensAt(lense, start, end);
    }

    // filter out ' ' and &nbsp;
    let isSpace = (text) => { return text === ' ' || text === '\u00A0' };
    tokens = tokens.filter((token) => { return !isSpace(token.text) });

    // sort by start
    tokens = tokens.sort((a, b) => { return a.start - b.start });

    function scientific(num) {
      return (num !== 0 && (num < 1e-3 || num >= 1e+7)) ? num.toExponential(2) : num.toPrecision(3);
  }

    return (
      <div className={`sidebar-container`}>
        <div className={`sidebar ${hidden}`}>
          <div>
            {tokens && tokens.map((token) => {
              let color = getColor(lense, token);
              let prob = scientific(token.prob);
              // return <div key={token.id} className="token" style={{backgroundColor: color}}>
              return <div key={token.id} className="token">
                      <div className="item heading">{token.text}</div>
                      <div className="item range">[{token.start}-{token.end}]</div>
                      {token.type !== 'words' && <div className="item" style={{backgroundColor: color}}>{prob}</div>}
                      <div className="item">{singular(token.type)}</div>
                    </div>;
            })}
          </div>
      </div>
      </div>
    );
  }
}


