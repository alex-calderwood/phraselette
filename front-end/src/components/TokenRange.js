import React, { Component, createRef } from "react";
import { getColor, zeroToOneColor, categoryToColor } from "../scripts/color";
import { getUniqueID, scientific, debounce } from "../scripts/utils";
import { humanLog } from "../scripts/utils";

function tokenItemsToShow(tokenType) {
  let show = {
    'context': ['prob'],
    'probs': ['prob'],
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
    this.id = getUniqueID();
    this.state = {
      overflowing: false,
      hoveredTokenId: null,
      hoverSequenceId: null,
    };
    this.debouncedSetHoveredSequenceId = debounce(this.setHoveredSequenceId, 5);
    this.debouncedSetHoveredTokenId = debounce(this.setHoveredTokenId, 5);

    let tokenType = this.props.tokenType;
    let tokens = this.props.tokens;

    console.log('tokenrange: constructor tokens for type', tokenType, tokens);
  }

  setHoveredSequenceId = (id) => {
    this.setState({ hoverSequenceId: id });
  }

  setHoveredTokenId = (id) => {
    this.setState({ hoveredTokenId: id });
  }

  componentDidMount() {
    this.checkOverflow();
    window.addEventListener('resize', this.checkOverflow); // Optionally handle window resize

    const tokenBar = this.tokenBarRef.current;
    if (tokenBar) {
      tokenBar.addEventListener('wheel', this.handleWheel, { passive: false });
    }
  }

  componentWillUnmount() {
    window.removeEventListener('resize', this.checkOverflow);

    const tokenBar = this.tokenBarRef.current;
    if (tokenBar) {
      tokenBar.removeEventListener('wheel', this.handleWheel);
    }
  }
  
  checkOverflow = () => {
    const node = this.tokenBarRef.current;
    if (node) {
      const isOverflowing = node.scrollWidth > node.clientWidth;
      this.setState({ overflowing: isOverflowing });
    }
  }


  handleWheel = (e) => {
    e.preventDefault();
    const tokenBar = this.tokenBarRef.current;
    if (tokenBar) {
      tokenBar.scrollLeft += e.deltaY + e.deltaX;
    }
  }


  render() {
    let tokenType = this.props.tokenType;
    let overflowing = this.state.overflowing ? "overflowing" : "";
    let filterSpaces = this.props.filterSpaces || false;
    let forceExpand = this.props.expanded || false;
    let verticalLayout = this.props.verticalLayout || false;

    // filter out ' ' and &nbsp;
    let isSpace = (text) => { return text === ' ' || text === '\u00A0' };

    let tokens = this.props.tokens && this.props.tokens.length > 0 ? 
      this.props.tokens.filter((token) => { return !filterSpaces || !isSpace(token.text) }) :
      [];
    tokens = tokens.sort((a, b) => { return a.start - b.start });

    let wrap = this.props.wrap ? ' wrap' : ' nowrap';
    let vertical = verticalLayout ? '  vertical' : '';
    let scoreLookup = tokenType === 'search' ? 'total' : tokenType;

    return (
      <div className={"token-range-parent " + overflowing} >
          <div id={`tokenbar-${tokenType}-${this.id}`} className={`token-range${wrap}${vertical}`} >
              {tokens && tokens.map((tokenOrSeq) => {
                if (tokenOrSeq.span) {
                  let sequence = tokenOrSeq;
                  const expanded = forceExpand || this.state.hoverSequenceId === sequence.id;
                  return this.renderSequence(sequence, tokenType, expanded);
                } else {
                  let token = tokenOrSeq;
                  const expanded = forceExpand || this.state.hoveredTokenId === token.id;
                  return this.renderToken(tokenType, token, expanded);
                }
              })}
        </div>
      </div>
    );
  }


  renderSequence(sequence, tokenType, expanded) {
    let prob = sequence.getAttribute('prob', null);
    let probColor = zeroToOneColor(prob);
    let id = `${this.id}-sequence-${sequence.id}`;

    let style = probColor ? { backgroundColor: probColor } : {};
    const simple = expanded ? '' : 'simple';

    return <div 
        id={id}
        key={id}
        className={`sequence ${simple}`}
        onMouseEnter={() => this.debouncedSetHoveredSequenceId(sequence.id)}
        onMouseLeave={() => this.debouncedSetHoveredSequenceId(null)}
        style={style}
        onClick={() => { 
          if (this.props.onClickSequence) {
            this.props.onClickSequence(sequence); 
          }
        }}
  
      >
        {/* Render tokens */}
        {sequence.span.map((token) => { return this.renderToken(tokenType, token, expanded); })}

        {/* Other sequence data */}
        {/* <div className="item" style={{ backgroundColor: color }}>
            {scientific(score)}
          </div> */}
        {expanded && prob ? <div className="item" style={{ backgroundColor: probColor }}>
          {humanLog(prob)}
        </div> : ""}
    </div>;
  }

  renderToken(tokenType, token, expanded) {
    let color = tokenType ? getColor(tokenType, token) : 'white';
    let space = token.getAttribute('isSpacySpace') === true ? 'space' : '';
    let fields = tokenItemsToShow(tokenType);

    let prob = fields.includes('prob') ? token.getAttribute('prob') : null;
    if (prob != null) {
        prob = humanLog(prob);
    }

    let sound = fields.includes('sound') ? token.getAttribute('phonemes', null)?.join(' ') : null;

    let pos = fields.includes('pos') ? token.getAttribute('pos', null) : null;
    let posColor = color;
    if (pos != null) { posColor = categoryToColor(pos); }

    let showCharRange = this.props.debugMode && token.start !== undefined && token.end !== undefined;

    const simple = expanded ? '' : 'simple';
    let style = color ? { backgroundColor: color } : {};
    let key = `${this.id}-token-${token.id}`;

    return (
      <div
        key={key} 
        className={`token ${space} ${simple}`} 
        // onMouseEnter={() => this.setState({ hoveredTokenId: token.id })}
        // onMouseLeave={() => this.setState({ hoveredTokenId: null })}
        onMouseEnter={() => this.debouncedSetHoveredTokenId(token.id)}
        onMouseLeave={() => this.debouncedSetHoveredTokenId(null)}
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

