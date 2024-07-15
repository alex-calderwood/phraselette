import React, { Component } from "react";
import { TokenRange } from "./TokenRange";
import { Constraint } from "../document/Constraint";
import { CategoricalConstraintView } from "./ConstraintWindow";
import { SearchResults } from "./SearchResults";


export class WordView extends Component {
  constructor(props) {
    super(props);
    this.tokenManager = this.props.tokenManager;
    this.prism = this.props.prism;
  }

  handleAddConstraint() {
    this.setState({
      constraints: this.state.constraints.concat([new Constraint('constraint', this.prism.dataType)])
    });
  }

  render() {
    let prism = this.prism;
    let start = this.props.startIndex;
    let end = this.props.endIndex;

    let constraintResults = this.props.constraintResults;

    let tokens = [];
    if (start !== null) {
      tokens = this.tokenManager.tokensAt(prism.name, start, end);
    }

    let hidden = !prism.active || tokens.length == 0;

    if (hidden) {
      return <div></div>;
    }

    return <div className={`prism`}>
      <TokenRange tokens={tokens}
        tokenManager={this.tokenManager}
        tokenType={prism.name}
        startIndex={start} endIndex={end}
        debugMode={this.props.debugMode} />

      { this.props.constraints.map((constraint) => {
          return <CategoricalConstraintView key={constraint.id} constraint={constraint} />
      })}
              
      {/* Constrained search results */}
      <SearchResults tokens={this.props.constraintResults} />

    </div>;


  }
}
