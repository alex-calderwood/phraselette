import React, { Component, createRef } from "react";
import { getColor } from "../color";

function singular(token) {
  switch(token) {
    case 'words':
      return 'word';
    case 'spacy':
      return 'spacy';
    case 'probability':
      return 'token';
    case 'alternate':
      return 'alternate';
    default:
      console.error('no singular for', token);
      return token;
  }
}

export class TokenRange extends Component {
  constructor(props) {
    super(props);
    this.tokenBarRef = createRef(); // Create a reference to the token bar div
    this.state = {
      overflowing: false
    };
  }

  componentDidMount() {
    this.checkOverflow();
    window.addEventListener('resize', this.checkOverflow); // Optionally handle window resize
  }

  componentWillUnmount() {
    window.removeEventListener('resize', this.checkOverflow);
  }

  checkOverflow = () => {
    const node = this.tokenBarRef.current;
    if (node) {
      const isOverflowing = node.scrollWidth > node.clientWidth;
      this.setState({ overflowing: isOverflowing });
    }
  }

  render() {
    let tokenType = this.props.tokenType;
    let overflowing = this.state.overflowing ? "overflowing" : "";

    // filter out ' ' and &nbsp;
    let isSpace = (text) => { return text === ' ' || text === '\u00A0' };
    let tokens = this.props.tokens && this.props.tokens.length > 0? 
      this.props.tokens.filter((token) => { return !isSpace(token.text) }) :
      [];
    tokens = tokens.sort((a, b) => { return a.start - b.start });

    console.log('<TokenRange>', tokens);

    return (
      <div className={"token-range-parent " + overflowing}>
          <div id={'tokenbar' + tokenType} className={`token-range`}>
              {tokens && tokens.map((token) => {
                let type = typeof token;
                console.log("type", type)
                if (Array.isArray(token)) {
                  return <div className="token-span"> 
                     {
                      token.map((t) => {
                        return this.renderToken(tokenType, t);
                      })
                     }
                    </div>
                } else {
                  return this.renderToken(tokenType, token);
                }
              })}
        </div>
      </div>
    );
  }

  renderToken(tokenType, token) {
    function scientific(num) {
      return (num !== 0 && (num < 1e-3 || num >= 1e+7)) ? num.toExponential(2) : num.toPrecision(3);
    }

    let color = tokenType ? getColor(tokenType, token) : 'white';

    let prob = null;
    let pos = token.pos;

    let showProb = tokenType === 'probability' || tokenType === 'alternate';
    if (showProb) {
      prob = scientific(token.prob);
    }

    let onClick = this.props.onTokenClick ? this.props.onTokenClick : () => { };
    let showCharRange = this.props.debugMode && token.start !== undefined && token.end !== undefined;

    return <div key={token.id} className="token" onClick={() => { onClick(token); } }>
      <div className="item heading">{token.text}</div>
      {showCharRange && <div className="item range">[{token.start}-{token.end}]</div>}
      {pos !== null && <div className="item" style={{ backgroundColor: color }}>{pos}</div>}
      {prob !== null && <div className="item" style={{ backgroundColor: color }}>{prob}</div>}
      {/* <div className="item">{singular(token.type)}</div> */}
    </div>;
  }
}

