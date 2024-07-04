import React, { Component } from "react";
import {TokenRange} from "./TokenRange";


export class TokenAlternates extends Component {
  constructor(props) {
    super(props);
    this.tokenManager = this.props.tokenManager;
    this.prism = this.props.prism;
  }

  onTokenClick(clickedToken, originalToken) {
    console.log('clicked', clickedToken, originalToken);
    // this.tokenManager.swapToken(originalToken, clickedToken);
    if (this.props.onTokenClick) {
      this.props.onTokenClick(originalToken, clickedToken);
    }
  }

  render() {
    let token = this.props.token; 

    if (!token || !token.alternates || token.alternates.length === 0) {
      return <div></div>
    }

    console.log('token alternates for', token, token.alternates)
    let alternates = token.alternates; // array of token objects

    return <div className="alternates">
        <div className='title'> Alternates for {token.text}</div>
        
        <TokenRange 
          tokens={alternates}
          tokenManager={this.tokenManager}
          onTokenClick={(clickedToken) => { this.onTokenClick(clickedToken, token) }}
          />
      </div> 
  }
}


