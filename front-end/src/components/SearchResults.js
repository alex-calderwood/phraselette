import React, { Component } from 'react';
import { TokenRange } from './TokenRange';

export class SearchResults extends Component {
  constructor(props) {
    super(props);
    this.prism = this.props.prism;
    this.splitByFilter = this.props.splitByFilter == true;
    this.constraintType = this.props.tokenType || 'all';
    this.tokenType = this.props.tokenType || 'search';
    this.fullHeight = this.props.fullHeight == true;
  }

  render() {
    let wrap = this.props.wrap !== false;              // default to true
    let vertical = this.props.verticalLayout === true; // default to false
    let short = this.props.short == true;
    let extraPadding = this.props.extraPadding && 'extra-padding';
    let fullHeight = this.fullHeight ? 'full-height' : '';

    if (this.props.isSearching) {
      let searching = this.props.doAnimation && 'searching'
      return <div className={`search-results  ${searching} ${extraPadding}`}></div>
    }

    let results = this.props.results;
    let additionalResults = this.props.additionalResults;
    let top, additional;

    if (this.splitByFilter) {
      top = this.renderResults(results, ' match', wrap, short, vertical);
      additional = this.renderResults(additionalResults, ' fail to match', wrap, short, vertical);
    } else {
      if (this.props.additionalResults) {
        results = results.concat(this.props.additionalResults);
      }
      top = this.renderResults(results, '', wrap, short, vertical);
      additional = null;
    }

    return <div className={`search-results ${fullHeight}`}>
      {top}
      {additional}
    </div>
  }

  renderResults(results, name, wrap, short, vertical) {
    let matchText = this.splitByFilter ? `${name} ${this.constraintType} constraints` : '';
    if (!results || results.length === 0) {
      return <div className='subtitle'>{`No rephrasings${matchText}`}</div>;
    } else {
      let plural = results.length > 1;
      return <>
        {this.props.showLength && <div className="subtitle">{`${results.length} rephrasing${plural ? 's' : ''}${matchText}`}</div>}
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
          colorBy={this.props.colorBy} />
      </>;
    }
  }
}