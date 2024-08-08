import React, { Component, createRef } from "react";
import { getColor, zeroToOneColor, categoryToColor } from "../color";
import { getUniqueUUID, scientific} from "../scripts/utils";

function tokenItemsToShow(tokenType) {
  let show = {
    'context': ['prob'],
    'probability-base': ['prob'],
    'alternate': ['prob'],
    'sound': ['sound'],
    'words': ['pos'],
    'thesaurus': ['pos', 'sound'],
    'search': ['pos', 'sound', 'prob'],
  };
  return show[tokenType] || [];
}

export class TokenRange extends Component {
  constructor(props) {
    super(props);
    this.tokenBarRef = createRef(); // Create a reference to the token bar div
    this.id = getUniqueUUID();
    this.state = {
      overflowing: false,
      hoveredTokenId: null,
      hoverSequenceId: null,
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
      <div className={"token-range-parent " + overflowing} >
          <div id={`tokenbar-${tokenType}-${this.id}`} className={`token-range` + wrap}>
              {tokens && tokens.map((tokenOrSeq) => {
                if (tokenOrSeq.span) {
                  let sequence = tokenOrSeq;
                  const expanded = this.state.hoverSequenceId === sequence.id;
                  return this.renderSequence(sequence, tokenType, expanded);
                } else {
                  let token = tokenOrSeq;
                  const expanded = this.state.hoveredTokenId === token.id;
                  return this.renderToken(tokenType, token, expanded);
                }
              })}
        </div>
      </div>
    );
  }


  renderSequence(sequence, tokenType, expanded) {
    let prob = sequence.getAttribute('probGeometricMean', null);
    let probColor = zeroToOneColor(prob);
    let id = `${this.id}-sequence-${sequence.id}`;
    // let score = sequence?.scores[scoreLookup]?.value;
    // let color = zeroToOneColor(score);

    let style = probColor ? { backgroundColor: probColor } : {};
    const simple = expanded ? '' : 'simple';

    return <div 
        id={id}
        key={id}
        className={`sequence ${simple}`}
        onMouseEnter={() => this.setState({ hoverSequenceId: sequence.id })}
        onMouseLeave={() => this.setState({ hoverSequenceId: null })}
        style={style}
        onClick={() => { 
          this.props.onClickSequence(sequence); 
        }}
      >
        {/* Render tokens */}
        {sequence.span.map((token) => { return this.renderToken(tokenType, token, expanded); })}

        {/* Other sequence data */}
        {/* <div className="item" style={{ backgroundColor: color }}>
            {scientific(score)}
          </div> */}
        {expanded && prob ? <div className="item" style={{ backgroundColor: probColor }}>
          {scientific(prob)}
        </div> : ""}
    </div>;
  }

  renderToken(tokenType, token, expanded) {
    let color = tokenType ? getColor(tokenType, token) : 'white';
    let space = token.getAttribute('isSpacySpace') === true ? 'space' : '';
    let fields = tokenItemsToShow(tokenType);

    let prob = fields.includes('prob') ? token.getAttribute('probGeometricMean') : null;
    if (prob != null) {
        prob = scientific(prob);
    }

    let sound = fields.includes('sound') ? token.getAttribute('phonemes', null)?.join(' ') : null;

    let pos = fields.includes('pos') ? token.getAttribute('pos', null) : null;
    let posColor = color;
    if (pos != null) { posColor = categoryToColor(pos); }

    // let onClick = this.props.onTokenClick ? this.props.onTokenClick : () => { };
    let showCharRange = this.props.debugMode && token.start !== undefined && token.end !== undefined;

    const simple = expanded ? '' : 'simple';
    let style = color ? { backgroundColor: color } : {};

    let key = `${this.id}-token-${token.id}`;

    return (
      <div
        key={key} 
        className={`token ${space} ${simple}`} 
        onMouseEnter={() => this.setState({ hoveredTokenId: token.id })}
        onMouseLeave={() => this.setState({ hoveredTokenId: null })}
        style={style}
        // onClick={() => { onClick(token); }}
      >
        <div className="item heading">{token.text}</div>
        {expanded && showCharRange && <div className="item range">[{token.start}-{token.end}]</div>}
        {expanded && pos   != null && <div className="item" style={{ backgroundColor: posColor }}>{pos}</div>}
        {expanded && prob  != null && <div className="item" style={{ backgroundColor: color }}>{prob}</div>}
        {expanded && sound != null && <div className="item" style={{ backgroundColor: color }}>{sound}</div>}
      </div>
    );
  }
}

