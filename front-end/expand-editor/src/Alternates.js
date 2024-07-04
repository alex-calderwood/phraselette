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
    if (this.props.onTokenClick) {
      this.props.onTokenClick(originalToken, clickedToken); // swapping the order of the arguments
    }
  }

  render() {
    let token = this.props.token; 

    if (!token || !token.alternates || token.alternates.length === 0) {
      return <div></div>
    }
    
    let alternates = token.alternates; // array of token objects

    return <div id={'alternate-' + this.props.token.id} className="alternates">
        <div className='title'> Alternates for {token.text}</div>
        <TokenRange 
          tokens={alternates}
          tokenType='alternate'
          tokenManager={this.tokenManager}
          onTokenClick={(clickedToken) => { this.onTokenClick(clickedToken, token) }}
          />
      </div> 
  }
}


