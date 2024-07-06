import React, { Component } from "react";
import { TokenRange } from "./TokenRange";
import { Constraint } from "../document/Constraint";


export class WordView extends Component {
  constructor(props) {
    super(props);
    this.tokenManager = this.props.tokenManager;
    this.prism = this.props.prism;
    this.state = {
      constraints: [],
    };
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

    let tokens = [];
    if (start !== null) {
      tokens = this.tokenManager.tokensAt(prism.name, start, end);
    }

    let hidden = prism.active && tokens.length > 0 ? '' : 'hidden';

    return <div className={`prism ${hidden}`}>
      <TokenRange tokens={tokens}
        tokenManager={this.tokenManager}
        tokenType={prism.name}
        startIndex={start} endIndex={end}
        debugMode={this.props.debugMode} />
    </div>;
  }
}
