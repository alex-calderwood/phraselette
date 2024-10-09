import React, { Component } from "react";
import { TokenRange } from "./TokenRange";
import { TokenAlternates } from "./Alternates";
import { ConstraintRender } from "./ConstraintView";
import { ConstraintCreator } from "./ConstraintCreator";
import { SearchResults } from "./SearchResults";
import { TokenManager } from "../base/TokenManager";
import { Prism } from "../base/prism/Prism";

class PrismEditableTextField extends Component {
  constructor(props) {
    super(props)
    this.id = `text-field-${this.props.field.name}-${this.props.prism.id}`;
    this.state = {
      text: this.props.field.text,
    };
  }

  editTextField() {
    let value = document.getElementById(this.id).value || '';
    console.log("textfield: updating", value);
    this.setState({ text: value });
    this.props.prism.updateTextField(this.props.field.name, value);
  }

  render() {
    return <div className={`text-field`}>
      <textarea id={this.id} value={this.state.text} onChange={this.editTextField.bind(this)}></textarea>
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

  prismHandleOnConstraintUpdate() {
    this.props.onConstraintUpdate(this.prism, this.props.opening);
    const hasHistogramData = !!this.prism?.insights[this.props.opening?.id]?.summary;
    this.setState({ hasHistogramData: hasHistogramData});
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
    let opening = this.props.opening;
    let onRemovePrism = this.props.onRemovePrism;

    let tokens = start !== null ? this.tokenManager.tokensAt(prism.tokenType, start, end) : [];
    let results = prism?.insights[opening?.id]?.results || [];
    let text = prism?.insights[opening?.id]?.text || null;

    let activeNotHidden = prism.active && !prism.hidden;
    let showTokenContent       = activeNotHidden && tokens.length > 0;
    let showResults     = activeNotHidden && (results.length > 0 || this.props.isSearching)
    let showtext        = activeNotHidden && text;
    let displayingFull 
     = showTokenContent || showResults;

    let rotated = activeNotHidden ? "rotated" : "";
    let border  = activeNotHidden ? "border"  : "";
    let searching = this.props.isSearching ? "searching" : "";

    let title = prism.title != prism.type && !activeNotHidden ? 
      <span className="subtitle"> ({prism.title})</span> : ""

    let textContent = showtext ? this.bulletedText(text) : "";

    return <div className={`prism`}>
        <div className={`prism-title ${rotated}`} onClick={this.toggleHidden.bind(this)}>
          {/* Header stuff */}
          {prism.type} {title}
          {/* Button to delete the prism */}
          {prism.undestroyable ? "" :  <button className={`light-button`} onClick={() => onRemovePrism(prism)}>×</button> } 
        </div>

        <div className={`prism-content ${border} ${searching}`}>
          {activeNotHidden ? Object.values(prism.textFields).map((field) => {
            return <PrismEditableTextField key={field.text} field={field} prism={prism} />
          }) : ""}

          {textContent}

          {showTokenContent ? this.tokenContent(prism, start, end, tokens) : ""}

          {showTokenContent ? this.props.constraints.map((constraint) => {
            return <ConstraintRender 
              key={constraint.id} 
              constraint={constraint}
              prism={prism}
              startIndex={start}
              endIndex={end}
              opening={opening}
              onDelete={this.props.removeConstraint} 
              hasHistogramData={this.state.hasHistogramData}
              onConstraintUpdate={this.prismHandleOnConstraintUpdate.bind(this)}/>}) : ""
          }

          {showTokenContent ? <ConstraintCreator
            tokens={tokens}
            // startIndex={start} endIndex={end}
            opening={opening}
            prism={prism}
            onAdd={this.props.addConstraint}
            onConstraintUpdate={this.prismHandleOnConstraintUpdate.bind(this)} /> : "" }
          
          {showResults ? <SearchResults
                      showLength={true}
                      isSearching={this.props.isSearching} 
                      tokenType={prism.type}
                      onClickSequence={this.props.onClickSequence}
                      results={results} /> : ""}
      </div>
    </div>;
  }
}
