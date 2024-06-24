import React, { Component } from "react";

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
export class Sidebar extends Component {
  constructor(props) {
    super(props);
    this.tokenManager = this.props.tokenManager;
  }

  render() {
    // TODO we shouldn't actually use startChar / encChar because if you select one character it still should show something
    // let hidden = this.props.selection && this.props.selection.rangy.isCollapsed ? 'hidden' : "";
    // for now we want to always show it
    let hidden = "";

    let start = this.props.startChar;
    let end   = this.props.endChar;

    let tokens = [];
    if (start !== null) {
      tokens = this.tokenManager.tokensAt(this.tokenManager.currentLense, start, end);
    }

    // filter out ' ' and &nbsp;
    let isSpace = (text) => { return text === ' ' || text === '\u00A0' };
    tokens = tokens.filter((token) => { return !isSpace(token.text) });

    return (
      <div className={`sidebar-container`}>
        <div className={`sidebar ${hidden}`}>
          {/* for each token show a little thing */}
          <div>
            {tokens && tokens.map((token) => {
              return <div key={token.id} className="token">
                      {/* {JSON.stringify(token)} */}
                      <div className="item heading">{token.text}</div>
                      <div className="item range">[{token.start}-{token.end}]</div>
                      <div className="item">{token.prob.toPrecision(3)}</div>
                      <div className="item">{singular(token.type)}</div>
                    </div>;
            })}
          </div>
      </div>
      </div>
    );
  }
}


