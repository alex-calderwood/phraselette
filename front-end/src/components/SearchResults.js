import React, { Component } from 'react';
import { TokenRange } from './TokenRange';

export class SearchResults extends Component {
  constructor(props) {
    super(props);
    this.prism = this.props.prism;
  }

  onTokenClick(clickedToken, originalToken) {
    console.log('clicked', clickedToken, originalToken);
    if (this.props.onTokenClick) {
      this.props.onTokenClick(originalToken, clickedToken); // swapping the order of the arguments
    }
  }

  render() {
    let tokens = this.props.tokens;
    if (!tokens || tokens.length === 0) {
      return <div></div>
    }

    return <div id={"search-results"}>
      <div className="title"> Search Results </div>
      <TokenRange tokens={tokens} />
    </div> 
  }
}

