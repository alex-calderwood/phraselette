import React, { Component } from "react";
import { TokenRange } from "./TokenRange";


export class TokenAlternates extends Component {
  constructor(props) {
    super(props);
    this.prism = this.props.prism;
  }

  onClickSequence(clickedToken, originalToken) {
    console.log('clicked', clickedToken, originalToken);
    if (this.props.onClickSequence) {
      this.props.onClickSequence(originalToken, clickedToken); // swapping the order of the arguments
    }
  }

  render() {
    let token = this.props.token; 

    if (!token || !token.alternates || token.alternates.size === 0) {
      return <div></div>
    }
    
    let alternates = token.alternates; // array of token objects

    console.log('alternates', alternates)

    return <div id={'alternate-' + this.props.token.id} className="alternates">
        <div className='title'> Alternates for {token.text}</div>
        <TokenRange 
          tokens={alternates}
          tokenType='alternate'
          onClickSequence={(clickedToken) => { this.onClickSequence(clickedToken, token) }}
          expandMode='reduce'
          />
      </div> 
  }
}
