import React, { Component } from "react";
import { getColor } from "./color";

function singular(token) {
  switch(token) {
    case 'words':
      return 'word';
    case 'spacy':
      return 'spacy';
    case 'probability':
      return 'token';
    default:
      console.error('no singular for', token);
      return token;
  }
}

export class TokenRange extends Component {
  constructor(props) {
    super(props);
    this.tokenManager = this.props.tokenManager;
  }

  render() {
    let prismName = this.props.prismName;

    // filter out ' ' and &nbsp;
    let isSpace = (text) => { return text === ' ' || text === '\u00A0' };
    let tokens = this.props.tokens && this.props.tokens.length > 0? 
      this.props.tokens.filter((token) => { return !isSpace(token.text) }) :
      [];
    tokens = tokens.sort((a, b) => { return a.start - b.start });

    function scientific(num) {
      return (num !== 0 && (num < 1e-3 || num >= 1e+7)) ? num.toExponential(2) : num.toPrecision(3);
    }

    console.log('token range for', prismName, tokens);

    return (
      <div className="token-range-parent">
          <div id={'tokenbar' + prismName} className={`token-range`}>
              {tokens && tokens.map((token) => {

                let color = prismName ? getColor(prismName, token) : 'white';

                let prob = null;
                let pos = null;
                if (token.type === 'probability') {
                  prob = scientific(token.prob);
                } else if (token.type === 'spacy') {
                  pos = token.raw.pos; // id: 6, start: 27, end: 31, tag: NN, pos: NOUN, morph: Number=Sing, lemma: rain, dep: pobj, head: 5
                }

                let onClick = this.props.onTokenClick ? this.props.onTokenClick : () => {};

                return <div key={token.id} className="token" onClick={() => { onClick(token) }}>
                        <div className="item heading">{token.text}</div>
                        {/* <div className="item range">[{token.start}-{token.end}]</div> */}
                        {pos !== null && <div className="item" style={{backgroundColor: color}}>{pos}</div>}
                        {prob !== null && <div className="item" style={{backgroundColor: color}}>{prob}</div>}
                        {/* <div className="item">{singular(token.type)}</div> */}
                      </div>;
              })}
        </div>
      </div>
    );
  }
}

