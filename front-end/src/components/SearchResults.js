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
    let vertical = this.props.verticalLayout === true; // default to false
    let short = this.props.short == true;
    let extraPadding = this.props.extraPadding && 'extra-padding';

    if (this.props.isSearching) {
      let searching = this.props.doAnimation && 'searching'
      return <div className={`search-results  ${searching} ${extraPadding}`}></div>
    }

    let results = this.props.results;
    if (!results || results.length === 0) {
      return <div className='subtitle'>No results</div>
    }
    
    return <div className={"search-results"}>
      {this.props.showLength && <div className="subtitle">{`${results.length} results`}</div>}
      <TokenRange 
        tokenType={this.tokenType} 
        tokens={results} 
        onClickSequence={this.props.onClickSequence} 
        suppressPOS={true} 
        wrap={wrap}
        short={short}
        verticalLayout={vertical}
        onTooltipUpdate={this.props.onTooltipUpdate}
        expandMode='reduce'
        colorBy={this.props.colorBy}
        />
    </div> 
  }
}