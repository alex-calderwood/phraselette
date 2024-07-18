import React, { Component } from 'react';
import { TokenRange } from './TokenRange';

export class SearchResults extends Component {
  constructor(props) {
    super(props);
    this.prism = this.props.prism;
  }

  render() {
    // default to true
    let wrap = this.props.wrap !== false;

    if (this.props.isSearching) {
      return <div className="search-results searching">Searching</div>
    }

    let results = this.props.results;
    if (!results || results.length === 0) {
      return <div className='title'>No results</div>
    }

    if (!results || results.length === 0) {
      return <div className='title'>No results</div>
    }

    return <div id={"search-results"}>
      <TokenRange tokens={results} onTokenClick={this.props.onTokenClick} suppressPOS={true} wrap={wrap} />
    </div> 
  }
}