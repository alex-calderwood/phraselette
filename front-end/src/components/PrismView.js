import React, { Component } from "react";
import { TokenRange } from "./TokenRange";
import { Constraint } from "../document/Constraint";
import { TokenAlternates } from "./Alternates";
import { CategoricalConstraintView } from "./ConstraintView";
import { ConstraintCreator } from "./ConstraintCreator";
import { SearchResults } from "./SearchResults";


export class PrismView extends Component {
  constructor(props) {
    super(props);
    this.tokenManager = this.props.tokenManager;
    this.prism = this.props.prism;
    this.state = {
      constraints: [],
    };
  }

  toggleHidden() {
    this.props.prism.hidden = !this.props.prism.hidden;
    this.forceUpdate();
  }

  removeConstraint() {
    let constraint = this.props.constraints.pop();
    this.props.removeConstraint(constraint);
  }

  renderActiveView(prism, start, end, tokens) {
    return <div className="prism-contents">
      <TokenRange tokens={tokens}
        tokenType={prism.name}
        startIndex={start} endIndex={end}
        debugMode={this.props.debugMode} />

      { this.props.constraints.map((constraint) => {
        return <CategoricalConstraintView key={constraint.id} constraint={constraint} />
      })}

      <ConstraintCreator tokens={tokens} prism={prism} onAdd={this.props.addConstraint} onRemove={this.removeConstraint.bind(this)}/>

      {tokens.map((token) => {
        return <TokenAlternates token={token}
          alternates={token.alternates}
          tokenManager={this.tokenManager}
          prism={prism}
          onTokenClick={this.props.onSwapToken} />;
      })}
    </div>;
  }

  render() {
    let prism = this.prism;
    let start = this.props.startIndex;
    let end = this.props.endIndex;

    let tokens = [];
    if (start !== null) {
      tokens = this.tokenManager.tokensAt(prism.name, start, end);
    }

    let show = prism.active && !prism.hidden;

    let results = prism.results || [];

    return <div className="prism">
      <div className="title" onClick={this.toggleHidden.bind(this)}>
        <span>{prism.name}</span>
      </div>
      {show && tokens.length > 0      ? this.renderActiveView(prism, start, end, tokens) : ""}
      {show && results.length > 0 ? <SearchResults results={results} /> : ""}
    </div>;


  }
}
