import React, { Component, createRef } from "react";
import { getColor, zeroToOneColor, categoryToColor } from "../scripts/color";
import { getUniqueID, scientific, debounce } from "../scripts/utils";
import { humanLog } from "../scripts/utils";
import { rgb } from "chroma-js";
const prismSettings = {
  'context': {
    'showItems': ['prob'],
    'color': "#ffadad"
  },
  'probs': {
    'showItems': ['prob'],
    'color': "#ffd6a5"
  },
  'alternate': {
    'showItems': ['prob'],
    'color': "#fdffb6"
  },
  'sound': {
    'showItems': ['sound'],
    'color': "#caffbf"
  },
  'words': {
    'showItems': ['pos'],
    'color': "#9bf6ff"
  },
  'thesaurus': {
    'showItems': ['pos', 'sound'],
    'color': "#a0c4ff"
  },
  'search': {
    'showItems': ['pos', 'sound', 'prob'],
    'color': "#bdb2ff"
  } // one more color ffc6ff
};

function tokenItemsToShow(tokenType) {
  const show = prismSettings[tokenType]['showItems'];
  if (show == null) {
    console.warn("tokenrange: no settings found for", tokenType)
  }
  return show || [];
}

function getOriginColor(tokenType) {
  const color = prismSettings[tokenType]['color'];
  if (color == null) {
    console.warn("tokenrange: no settings found for", tokenType, prismSettings)
  }
  return color || [];
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
      lastMousePosition: null,  // This is new
    };
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

  handleMouseMove = (e, id, isSequence = false) => {
    const currentPosition = { x: e.clientX, y: e.clientY };
      this.setState({ lastMousePosition: currentPosition }, () => {
        if (isSequence) {
          // this.debouncedSetHoveredSequenceId(id);
          this.setHoveredSequenceId(id);
        } else {
          this.setHoveredTokenId(id);
        }
      });
  }
  
  // causes a little glitch
  // handleMouseLeave = (isSequence = false) => {
  //   this.setState({ lastMousePosition: null });
  //   if (isSequence) {
  //     this.debouncedSetHoveredSequenceId(null);
  //   } else {
  //     this.debouncedSetHoveredTokenId(null);
  //   }
  // }

  render() {
    let tokenType = this.props.tokenType;
    let overflowing = this.state.overflowing ? " overflowing" : "";
    let short = this.props.short ? " short" : ""
    let filterSpaces = this.props.filterSpaces || false;
    let forceExpand = this.props.expanded || false;
    let verticalLayout = this.props.verticalLayout || false;

    let isSpace = (text) => { return text === ' ' || text === '\u00A0' }; // filter out ' ' and &nbsp;
    let tokens = this.props.tokens && this.props.tokens.length > 0 ? 
      this.props.tokens.filter((token) => { return !filterSpaces || !isSpace(token.text) }) :
      [];

    tokens = tokens.sort((a, b) => { return a.start - b.start });  // put in correct order

    let wrap = this.props.wrap ? ' wrap' : ' nowrap';
    let vertical = verticalLayout ? '  vertical' : '';
    let scoreLookup = tokenType === 'search' ? 'total' : tokenType;

    return (
      <div className={"token-range-parent" + overflowing + short} >
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
    let id = `${this.id}-sequence-${sequence.id}`;

    let colorBy =  this.props.colorBy == null ? "origin" : this.props.colorBy;
    let prob = sequence.getAttribute('prob', null);
    let origin = sequence.getAttribute('originPrism', null);
    let originColor = getOriginColor(origin);

    let probColor = zeroToOneColor(prob);
    let backgroundColor;
    if (colorBy == "origin" && originColor != null) {
      backgroundColor = originColor; 
    } else if (colorBy == "prob" && probColor != null) {
        backgroundColor = probColor;
    } else {
      backgroundColor = null;
    }

    let style = {
      border: `1px solid ${backgroundColor}`,
    };
    console.log('token:', backgroundColor, originColor, style)

    const simple = expanded ? '' : 'simple';

    return <div 
        id={id}
        key={id}
        className={`sequence ${simple} glass-pane`}
        onMouseMove={(e) => this.handleMouseMove(e, sequence.id, true)}
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
        {expanded && origin ? <div className="item" style={{ backgroundColor: originColor }}>
          {origin}
        </div> : ""}
    </div>;

  }

  renderToken(tokenType, token, expanded) {
    let color = tokenType ? getColor(tokenType, token) : rgb(0, 100, 0, 0);
    let space = token.isSpace() ? 'space' : '';
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
        onMouseEnter={() => this.setHoveredTokenId(token.id)}
        style={style}
        // onClick={() => { onClick(token); }}
      >
        <div className="item heading">{token.text}</div>
        {expanded && showCharRange && <div className="item range">[{token.start}-{token.end}]</div>}
        {expanded && pos   != null && <div className="item" style={{ backgroundColor: posColor }}>{pos}</div>}
        {expanded && prob  != null && <div className="item" style={{ backgroundColor: color   }}>{prob}</div>}
        {expanded && sound != null && <div className="item" style={{ backgroundColor: color   }}>{sound}</div>}
      </div>
    );
  }
}

