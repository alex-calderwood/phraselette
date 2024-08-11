import React, { Component } from 'react';
import { TokenRange } from './TokenRange';

export class SearchResults extends Component {
  constructor(props) {
    super(props);
    this.prism = this.props.prism;
    this.tokenType = this.props.tokenType || 'search';
  }

  render() {
    let wrap = this.props.wrap !== false; // default to true

    if (this.props.isSearching) {
      return <div className="search-results searching"></div>
    }

    let results = this.props.results;
    if (!results || results.length === 0) {
      return <div className='subtitle'>No results</div>
    }
    
    console.log('SearchResults', results, this.tokenType)
    return <div className={"search-results"}>
      {this.props.showLength && <div className="subtitle">{`${results.length} combined results`}</div>}
      <TokenRange tokenType={this.tokenType} tokens={results} onClickSequence={this.props.onClickSequence} suppressPOS={true} wrap={wrap} />
    </div> 
  }
}