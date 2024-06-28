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

// export class HighlightBar extends Component {
//   constructor(props) {
//     super(props);
//   }

//   /* 
//    * When a user selects a new token from the dropdown, update the state of the Component's parent.
//   */
//   handleChange(event) {
//     let prismName = event.target.value;

//     if (this.props.setCurrentLense)
//       this.props.setCurrentLense(prismName);        // trigger an update in the parent component

//     if (this.props.attemptInitialTokenization)
//       this.props.attemptInitialTokenization();  // another update, run the tokenizer on the initial currently activated Highlights
//   }

//   render() {
//     return (
//       <div className="lense-bar">
//         <label htmlFor="tokens">color by </label>
//         {/* a dropdown with each prism type */}
//         <select onChange={this.handleChange.bind(this)} id="tokens">
//           {this.props.tokens.map((token) => {
//             return <option key={token} value={token}>{token}</option>;
//           })}
//         </select>
//       </div>
//     );
//   }
// }

export class TokenRange extends Component {
  constructor(props) {
    super(props);
    this.tokenManager = this.props.tokenManager;
  }

  render() {
    // let hidden = this.props.selection && this.props.selection.rangy.isCollapsed ? 'hidden' : "";
    // for now we want to always show it
    let prismName = this.props.prismName;

    // filter out ' ' and &nbsp;
    let isSpace = (text) => { return text === ' ' || text === '\u00A0' };
    let tokens = this.props.tokens.filter((token) => { return !isSpace(token.text) });
    tokens = tokens.sort((a, b) => { return a.start - b.start });

    function scientific(num) {
      return (num !== 0 && (num < 1e-3 || num >= 1e+7)) ? num.toExponential(2) : num.toPrecision(3);
    }

    console.log('token range for', prismName, tokens);

    return (
        <div id={'tokenbar' + prismName} className={`sidebar`}>
            {tokens && tokens.map((token) => {
              let color = getColor(prismName, token);

              let prob = null;
              let pos = null;
              if (token.type === 'probability') {
                prob = scientific(token.prob);
              } else if (token.type === 'spacy') {
                pos = token.raw.pos; // id: 6, start: 27, end: 31, tag: NN, pos: NOUN, morph: Number=Sing, lemma: rain, dep: pobj, head: 5
                
              }

              return <div key={token.id} className="token">
                      <div className="item heading">{token.text}</div>
                      {/* <div className="item range">[{token.start}-{token.end}]</div> */}
                      {pos !== null && <div className="item" style={{backgroundColor: color}}>{pos}</div>}
                      {prob !== null && <div className="item" style={{backgroundColor: color}}>{prob}</div>}
                      <div className="item">{singular(token.type)}</div>
                    </div>;
            })}
      </div>
    );
  }
}

