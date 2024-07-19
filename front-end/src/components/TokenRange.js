import React, { Component, createRef } from "react";
import { getColor, zeroToOneColor } from "../color";
import { getUniqueUUID } from "../scripts/utils";

function scientific(num) {
  return (num !== 0 && (num < 1e-3 || num >= 1e+7)) ? num.toExponential(2) : num.toPrecision(3);
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
    let filterSpaces = this.props.filterSpaces || false;

    // filter out ' ' and &nbsp;
    let isSpace = (text) => { return text === ' ' || text === '\u00A0' };

    let tokens = this.props.tokens && this.props.tokens.length > 0 ? 
      this.props.tokens.filter((token) => { return !filterSpaces || !isSpace(token.text) }) :
      [];
    tokens = tokens.sort((a, b) => { return a.start - b.start });

    let wrap = this.props.wrap ? ' wrap' : ' nowrap';

    let scoreLookup = tokenType === 'search' ? 'total' : tokenType;

    return (
      <div className={"token-range-parent " + overflowing}>
          <div id={'tokenbar-' + tokenType} className={`token-range` + wrap}>
              {tokens && tokens.map((tokenGroup) => {
                if (tokenGroup.scores) {
                  let score = tokenGroup.scores[scoreLookup];
                  let color = zeroToOneColor(score);
                  return <div key={getUniqueUUID()} className="token-span"> 
                     {
                      tokenGroup.span.map((token) => {
                        return this.renderToken(tokenType, token);
                      })
                     }
                    <div className="item" style={{ backgroundColor: color }}>
                      {scientific(score)}
                    </div>
                    </div>
                } else {
                  return this.renderToken(tokenType, tokenGroup);
                }
              })}
        </div>
      </div>
    );
  }

  renderToken(tokenType, token) {
    let color = tokenType ? getColor(tokenType, token) : 'white';

    let prob = null;
    let showProb = tokenType === 'probability' || tokenType === 'alternate';
    if (showProb) {
      prob = scientific(token.prob);
    }

    let sound = null;
    let showSound = tokenType === 'sound';
    if (showSound) {
      sound = token?.sound?.phonemes ? token.sound.phonemes.join(' ') : null;
    }

    let pos = this.props.suppressPOS || tokenType === 'sound' ? null : token.pos;

    let onClick = this.props.onTokenClick ? this.props.onTokenClick : () => { };
    let showCharRange = this.props.debugMode && token.start !== undefined && token.end !== undefined;

    return <div key={token.id} className="token" onClick={() => { onClick(token); } }>
      <div className="item heading">{token.text}</div>
      {showCharRange && <div className="item range">[{token.start}-{token.end}]</div>}
      {pos !== null && <div className="item" style={{ backgroundColor: color }}>{pos}</div>}
      {prob !== null && <div className="item" style={{ backgroundColor: color }}>{prob}</div>}
      {sound !== null && <div className="item" style={{ backgroundColor: color }}>{sound}</div>}
    </div>;
  }
}

