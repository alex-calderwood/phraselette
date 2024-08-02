import React, { Component } from "react";
import { TokenRange } from "./TokenRange";

export class WordView extends Component {
  constructor(props) {
    super(props);
    this.tokenManager = this.props.tokenManager;
  }

  onTokenClick(clickedToken) {
    let originalToken = this.tokens[0]; // TODO this is a placeholder since we are currently only supporting one token
    this.props.onSwapToken(originalToken, clickedToken)
  }

  render() {
    let wordsPrism = this.props.wordsPrism;
    let start = this.props.startIndex;
    let end = this.props.endIndex;

    this.tokens = [];
    if (start !== null) {
      this.tokens = this.tokenManager.tokensAt(wordsPrism.tokenType, start, end);
    }

    let hidden = this.tokens.length == 0;

    if (hidden) {
      return <div></div>;
    }

    return <div className="word-view">
      <TokenRange tokens={this.tokens}
        tokenManager={this.tokenManager}
        tokenType={wordsPrism.type}
        startIndex={start} endIndex={end}
        filterSpaces={false}
        debugMode={this.props.debugMode} />
    </div>;

  }
}
