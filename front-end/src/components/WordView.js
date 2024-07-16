import React, { Component } from "react";
import { TokenRange } from "./TokenRange";
import { Constraint } from "../document/Constraint";
import { CategoricalConstraintView } from "./ConstraintView";
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

  onTokenClick(clickedToken) {
    let originalToken = this.tokens[0]; // TODO this is a placeholder since we are currently only supporting one token
    this.props.onSwapToken(originalToken, clickedToken)
  }

  render() {
    let prism = this.prism;
    let start = this.props.startIndex;
    let end = this.props.endIndex;

    this.tokens = [];
    if (start !== null) {
      this.tokens = this.tokenManager.tokensAt(prism.name, start, end);
    }

    let hidden = !prism.active || this.tokens.length == 0;

    if (hidden) {
      return <div></div>;
    }

    return <div className={`prism`}>
      <TokenRange tokens={this.tokens}
        tokenManager={this.tokenManager}
        tokenType={prism.name}
        startIndex={start} endIndex={end}
        debugMode={this.props.debugMode} />

      { this.props.constraints.map((constraint) => {
          return <CategoricalConstraintView key={constraint.id} constraint={constraint} />
      })}
    </div>;


  }
}
