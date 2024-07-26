import React, { Component } from "react";
import { TokenRange } from "./TokenRange";
import { TokenAlternates } from "./Alternates";
import { ConstraintRender } from "./ConstraintView";
import { ConstraintCreator } from "./ConstraintCreator";
import { SearchResults } from "./SearchResults";
import { TokenManager } from "../document/TokenManager";
import { Prism } from "../document/Prism";

class PrismEditableTextFeature extends Component {
  constructor(props) {
    super(props)
    this.id = `text-feature-area-` + this.props.feature.name
    this.state = {
      text: this.props.feature.text,
    };
  }

  editTextFeature() {
    let value = document.getElementById(this.id).value || '';
    this.setState({ text: value });
    let featureName = this.props.feature.name;
    this.props.prism.updateTextFeature(featureName, value);
    console.log('value', this.props.prism)
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

  additionalContent(prism, start, end, tokens) {
    return <div className="additional-content">
        <TokenRange 
          tokens={tokens}
          tokenType={prism.name}
          startIndex={start} endIndex={end}
          debugMode={this.props.debugMode} /> 
              
        {this.props.constraints.map((constraint) => {
          return <ConstraintRender key={constraint.id} constraint={constraint} />
        })}
          
        <ConstraintCreator 
          tokens={tokens}
          startIndex={start} endIndex={end}
          prism={prism}
          onAdd={this.props.addConstraint}
          onRemove={this.removeConstraint.bind(this)}/>

        {tokens.map((token) => {
          return <TokenAlternates 
            token={token}
            key={token.id}
            alternates={token.alternates}
            tokenManager={this.tokenManager}
            prism={prism}
            onTokenClick={this.props.onSwapToken} />;
        })}
      </div>
  }

  render() {
    let prism = this.prism;
    let start = this.props.startIndex;
    let end = this.props.endIndex;

    let tokens = start !== null ? this.tokenManager.tokensAt(prism.parentToken, start, end) : [];
    let results = prism.results || [];

    let activeNotHidden = prism.active && !prism.hidden;
    let collapsed       = activeNotHidden && tokens.length > 0;
    let showResults     = activeNotHidden && (results.length > 0 || this.props.isSearching)
    let displayingFull  = collapsed || showResults;

    let rotated = activeNotHidden ? "rotated" : "";
    let border  = activeNotHidden ? "border"  : "";

    let subtitle = prism.subTitle != prism.name && !activeNotHidden ? 
      <span className="subtitle"> ({prism.subTitle})</span> : ""

    return <div className={`prism`}>
        <div className={`title ${rotated}`} onClick={this.toggleHidden.bind(this)}>
          {prism.name} {subtitle}
        </div>

        <div className={`prism-content ${border}`}>
          {activeNotHidden ? Object.values(prism.textFeatures).map((feature) => {
            return <PrismEditableTextFeature key={feature.text} feature={feature} prism={prism} />
          }) : ""}

          {showResults ? <SearchResults 
            isSearching={this.props.isSearching} 
            tokenType={prism.name} results={results} /> : ""}

          {collapsed ? this.additionalContent(prism, start, end, tokens) : ""}
      </div>
    </div>;
  }
}
