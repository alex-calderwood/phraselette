import React, { Component, createRef } from "react";
import { getColor, zeroToOneColor } from "../color";
import { getUniqueUUID, scientific} from "../scripts/utils";

function tokenItemsToShow(tokenType) {
  let show = {
    'likelihood': [],
    'probability-base': ['prob'],
    'alternate': ['prob'],
    'sound': ['sound'],
    'words': ['pos'],
    'search': ['pos', 'sound'],
    'dictionary': ['prob', 'pos', 'sound'],
  };
  return show[tokenType] || [];
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

    // console.log('TokenRange', tokenType, tokens);
    return (
      <div className={"token-range-parent " + overflowing}>
          <div id={'tokenbar-' + tokenType} className={`token-range` + wrap}>
              {tokens && tokens.map((tokenOrSeq) => {
                if (tokenOrSeq.span) { // tokenGroup is a sequence
                  let sequence = tokenOrSeq;
                  let prob = sequence?.getAttribute('prob');
                  let probColor = zeroToOneColor(prob);
                  let score = sequence?.scores[scoreLookup]?.value;
                  let color = zeroToOneColor(score);
                  return <div key={getUniqueUUID()} className="token-span"> 
                     { sequence.span.map((token) => { return this.renderToken(tokenType, token); }) }
                    <div className="item" style={{ backgroundColor: color }}>
                      {scientific(score)}
                    </div>
                    {prob ? <div className="item" style={{ backgroundColor: probColor }}>
                      {scientific(prob)}
                    </div> : ""}
                  </div>
                } else {
                  let token = tokenOrSeq;
                  return this.renderToken(tokenType, token);
                }
              })}
        </div>
      </div>
    );
  }

  renderToken(tokenType, token) {
    let color = tokenType ? getColor(tokenType, token) : 'white';
    let space = token?.isSpace === true ? 'space' : '';

    let fields = tokenItemsToShow(tokenType);

    let prob = null;
    if (fields.includes('prob') && token.prob !== undefined) {
      prob = scientific(token.prob);
    }

    let sound = null;
    if (fields.includes('sound') && token.sound !== undefined) {
      sound = token?.sound?.phonemes ? token.sound.phonemes.join(' ') : null;
    }

    let pos = null;
    if (fields.includes('pos') && token.pos !== undefined) {
      pos = token.pos;
    }

    let onClick = this.props.onTokenClick ? this.props.onTokenClick : () => { };
    let showCharRange = this.props.debugMode && token.start !== undefined && token.end !== undefined;

    return <div key={token.id} className={`token ${space}`} onClick={() => { onClick(token); } }>
      <div className="item heading">{token.text}</div>
      {showCharRange  && <div className="item range">[{token.start}-{token.end}]</div>}
      {pos !== null   && <div className="item" style={{ backgroundColor: color }}>{pos}</div>}
      {prob !== null  && <div className="item" style={{ backgroundColor: color }}>{prob}</div>}
      {sound !== null && <div className="item" style={{ backgroundColor: color }}>{sound}</div>}
    </div>;
  }
}

