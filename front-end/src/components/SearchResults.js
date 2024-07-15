import React, { Component } from 'react';
import { TokenRange } from './TokenRange';

export class SearchResults extends Component {
  constructor(props) {
    super(props);
    this.prism = this.props.prism;
  }

  render() {
    let tokens = this.props.tokens;
    if (!tokens || tokens.length === 0) {
      return <div></div>
    }

    return <div id={"search-results"}>
      <div className="title"> Search Results </div>
      <TokenRange tokens={tokens} onTokenClick={this.props.onTokenClick} />
    </div> 
  }
}

