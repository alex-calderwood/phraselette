import React, { Component } from "react";
import { getColor } from "./color";

function singular(token) {
  switch(token) {
    case 'words':
      return 'word';
    case 'spacy':
      return 'extraction';
    case 'basic':
      return 'token';
  }
}

export class HighlightBar extends Component {
  constructor(props) {
    super(props);
  }

  /* 
   * When a user selects a new token from the dropdown, update the state of the parent
  */
  handleChange(event) {
    let token = event.target.value;

    if (this.props.setCurrentLense)
      this.props.setCurrentLense(token);

    if (this.props.attemptInitialTokenization)
      this.props.attemptInitialTokenization();
  }

  render() {
    return (
      <div className="lense-bar">
        <label htmlFor="tokens">color by </label>
        {/* a dropdown with each lense type */}
        <select onChange={this.handleChange.bind(this)} id="tokens">
          {this.props.tokens.map((token) => {
            return <option key={token} value={token}>{token}</option>;
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
    console.log('rendering TokenBar', this.props.startChar, this.props.endChar);
    // let hidden = this.props.selection && this.props.selection.rangy.isCollapsed ? 'hidden' : "";
    // for now we want to always show it
    let hidden = "";

    let type = this.props.type;

    let start = this.props.startChar;
    let end   = this.props.endChar;

    let tokens = [];
    if (start !== null) {
      tokens = this.tokenManager.tokensAt(type, start, end);
    }

    // filter out ' ' and &nbsp;
    let isSpace = (text) => { return text === ' ' || text === '\u00A0' };
    tokens = tokens.filter((token) => { return !isSpace(token.text) });
    tokens = tokens.sort((a, b) => { return a.start - b.start });

    function scientific(num) {
      return (num !== 0 && (num < 1e-3 || num >= 1e+7)) ? num.toExponential(2) : num.toPrecision(3);
    }

    return (
        <div id={'tokenbar' + type} className={`sidebar ${hidden}`}>
            {tokens && tokens.length > 0 ? <div className='title'> {type} tokens</div> : ''}
            {tokens && tokens.map((token) => {
              let color = getColor(type, token);
              let prob = scientific(token.prob);
              return <div key={token.id} className="token">
                      <div className="item heading">{token.text}</div>
                      <div className="item range">[{token.start}-{token.end}]</div>
                      {token.type !== 'words' && <div className="item" style={{backgroundColor: color}}>{prob}</div>}
                      <div className="item">{singular(token.type)}</div>
                    </div>;
            })}
      </div>
    );
  }
}

