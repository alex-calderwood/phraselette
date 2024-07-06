import React, { Component } from "react";
import { TokenRange } from "./TokenRange";
import { Constraint } from "../document/Constraint";
import { TokenAlternates } from "./Alternates";


export class TokenLense extends Component {
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

    console.log('token range for', prism.name, tokens);

    return <div className={`prism ${hidden}`}>
      <div className='title'>
        <span>{prism.name} tokens </span>

        {/* May want to also have highlight toggling here */}
        {/* <span className="highlight">
              <input type="checkbox" id={`highlight` + prism.name} name="highlight" checked={this.props.shouldHighlight} onChange={this.toggleHighlight.bind(this)}/>
              <label htmlFor={`highlight` + prism.name}>highlight</label>
            </span> */}
      </div>

      <TokenRange tokens={tokens}
        tokenManager={this.tokenManager}
        tokenType={prism.name}
        startIndex={start} endIndex={end}
        debugMode={this.props.debugMode} />


      {tokens.map((token) => {
        return <TokenAlternates token={token}
          alternates={token.alternates}
          tokenManager={this.tokenManager}
          prism={prism}
          onTokenClick={this.props.onSwapToken} />;
      })}
    </div>;
  }
}
