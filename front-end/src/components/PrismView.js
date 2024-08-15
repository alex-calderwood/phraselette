import React, { Component } from "react";
import { TokenRange } from "./TokenRange";
import { TokenAlternates } from "./Alternates";
import { ConstraintRender } from "./ConstraintView";
import { ConstraintCreator } from "./ConstraintCreator";
import { SearchResults } from "./SearchResults";
import { TokenManager } from "../base/TokenManager";
import { Prism } from "../base/prism/Prism";

class PrismEditableTextFeature extends Component {
  constructor(props) {
    super(props)
    this.id = `text-feature-${this.props.feature.name}-${this.props.prism.id}`;
    this.state = {
      text: this.props.feature.text,
    };
  }

  editTextFeature() {
    let value = document.getElementById(this.id).value || '';
    this.setState({ text: value });
    let featureName = this.props.feature.name;
    this.props.prism.updateTextFeature(featureName, value);
  }

  render() {
    return <div className={`text-feature`}>
      <textarea id={this.id} value={this.state.text} onChange={this.editTextFeature.bind(this)}></textarea>
    </div>
  }
}

/**
 * @typedef {Object} PrismViewProps
 * @property {TokenManager} tokenManager - The global token manager used by the App
 * @property {Prism} prism - the prism instance 
 */


/**
 * PrismView component
 * @extends {Component<PrismViewProps>}
 */
export class PrismView extends Component {

  /**
   * @param {PrismViewProps} props
   */
  constructor(props) {
    super(props);
    this.tokenManager = this.props.tokenManager;
    this.prism = this.props.prism;
    this.state = {
      constraints: [],
      hasHistogramData: false,
    };
  }

  toggleHidden() {
    this.prism.hidden = !this.prism.hidden;
    this.forceUpdate();
  }

  removeConstraint() {
    let constraint = this.props.constraints.pop();
    this.props.removeConstraint(constraint);
  }

  prismHandleOnClick(sequence) {
    let prism     = this.prism;
    let startChar = this.props.startIndex;
    let endChar   = this.props.endIndex - 1;
  
    let tokens = startChar !== null ? this.tokenManager.tokensAt(prism.tokenType, startChar, endChar) : [];
    console.log('Handling click on sequence:', tokens, sequence);
    this.props.onSwapSequence(tokens, sequence);
  }

  prismHandleOnConstraintUpdate() {
    console.log('updating ui on constraint' , this.prism);
    this.props.onConstraintUpdate(this.prism);
    this.setState({ hasHistogramData: !!this.prism?.insights?.summary });
    this.forceUpdate();
  }

  tokenContent(prism, start, end, tokens) {
    return <div className="additional-content">
        <TokenRange 
          tokens={tokens}
          tokenType={prism.type}
          startIndex={start} endIndex={end}
          debugMode={this.props.debugMode} 
          expanded={true} />

        {tokens.map((token) => {
          return <TokenAlternates
            token={token}
            key={token.id}
            alternates={token.alternates}
            tokenManager={this.tokenManager}
            prism={prism}
            onClickSequence={this.props.onClickSequence} />;
        })}
      </div>
  }

  bulletedText(text) {
    const items = text.split('*').filter(item => item.trim() !== '');
    return (
      <ul className="bullets">
        {items.map((line, index) => (
          <li key={index} className="bullet">{line.trim()}</li>
        ))}
      </ul>
    );
  }

  render() {
    let prism = this.prism;
    let start = this.props.startIndex;
    let end = this.props.endIndex;

    let tokens = start !== null ? this.tokenManager.tokensAt(prism.tokenType, start, end) : [];
    let results = prism?.insights?.results || [];

    let text = prism?.insights?.text || null;

    let activeNotHidden = prism.active && !prism.hidden;
    let showTokenContent       = activeNotHidden && tokens.length > 0;
    let showResults     = activeNotHidden && (results.length > 0 || this.props.isSearching)
    let showtext        = activeNotHidden && text;
    let displayingFull  = showTokenContent || showResults;

    let rotated = activeNotHidden ? "rotated" : "";
    let border  = activeNotHidden ? "border"  : "";
    let searching = this.props.isSearching ? "searching" : "";

    let title = prism.title != prism.type && !activeNotHidden ? 
      <span className="subtitle"> ({prism.title})</span> : ""

    let textContent = showtext ? this.bulletedText(text) : "";

    return <div className={`prism`}>
        <div className={`title ${rotated}`} onClick={this.toggleHidden.bind(this)}>
          {prism.type} {title}
        </div>

        <div className={`prism-content ${border} ${searching}`}>
          {activeNotHidden ? Object.values(prism.textFeatures).map((feature) => {
            return <PrismEditableTextFeature key={feature.text} feature={feature} prism={prism} />
          }) : ""}

          {textContent}

          {showTokenContent ? this.tokenContent(prism, start, end, tokens) : ""}

          {showTokenContent ? this.props.constraints.map((constraint) => {
            return <ConstraintRender 
              key={constraint.id} 
              constraint={constraint}
              prism={prism}
              onDelete={this.props.removeConstraint} 
              hasHistogramData={this.state.hasHistogramData}
              onConstraintUpdate={this.prismHandleOnConstraintUpdate.bind(this)}/>}) : ""
          }

          {showTokenContent ? <ConstraintCreator
            tokens={tokens}
            startIndex={start} endIndex={end}
            prism={prism}
            onAdd={this.props.addConstraint}
            onConstraintUpdate={this.prismHandleOnConstraintUpdate.bind(this)} /> : "" }
          
          {showResults ? <SearchResults
                      isSearching={this.props.isSearching} 
                      tokenType={prism.type}
                      onClickSequence={this.prismHandleOnClick.bind(this)}
                      results={results} /> : ""}
        
      </div>
    </div>;
  }
}
