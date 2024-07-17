import React, { Component } from 'react';
import { TokenRange } from './TokenRange';

export class SearchResults extends Component {
  constructor(props) {
    super(props);
    this.prism = this.props.prism;
  }

  render() {
    let results = this.props.results;
    if (!results || results.length === 0) {
      return <div class='title'>No results</div>
    }

    let tokens = results;
    if (results[0].span) {
      tokens = results.map(result => result.span);
    }

    if (!tokens || tokens.length === 0) {
      return <div class='title'>No results</div>
    }

    return <div id={"search-results"}>
      <TokenRange tokens={tokens} onTokenClick={this.props.onTokenClick} />
    </div> 
  }
}