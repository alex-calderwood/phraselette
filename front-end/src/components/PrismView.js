import React, { Component } from "react";
import { TokenRange } from "./TokenRange";
import { TokenAlternates } from "./Alternates";
import { ConstraintRender } from "./constraints/ConstraintRender";
import { PrismControls } from "./PrismControls";
import { SearchResults } from "./SearchResults";
import { TokenManager } from "../base/TokenManager";
import { Prism } from "../base/prism/Prism";
import { useTooltip } from './Tooltip'; // need to turn this into a hook component to be able to use this

import { prismStyles } from '../base/prism/prismSettings';
import { IoColorPaletteOutline } from "react-icons/io5";

import { appState } from "../index"
import { EVENT_NAMES } from "../base/Logging";

const PrismTitle = ({ prism, rotated, title, onRemovePrism, toggleHidden, onTooltipUpdate, isSearching, styles}) => {
  const { handleMouseEnter, handleMouseLeave, handleMouseMove } = useTooltip(onTooltipUpdate);

  const prismDescriptionText = ` (click to ${rotated ? 'collapse' : 'expand'})` + prism.description;
  let searching = isSearching ? "searching-light" : "";

  let type = <div className={`prism-type-text ${rotated}`} style={{color: styles.style.color}} >
    {prism.type} <IoColorPaletteOutline className="prism-icon small" />
  </div>

  return (
    <div 
      className={`prism-title ${rotated} ${searching}`} 
      onClick={toggleHidden}
      onMouseEnter={(e) => handleMouseEnter(prismDescriptionText, e)}
      onMouseLeave={handleMouseLeave}
      onMouseMove={handleMouseMove}
      style={styles.titleStyle}
    >
      {prism.undestroyable ? <div></div> : (
        <button className={`light-button`} onClick={() => onRemovePrism(prism)}>×</button>
      )}
      {title && <div style={styles.titleStyle} className="colorless-subtitle">{title}</div>}
      {type}
    </div>
  );
};

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
    console.log("textfield: updating to", value);
    this.setState({ text: value });
    this.props.prism.updateTextField(this.props.field.name, value);

    this.props.addEvent({
      eventName: EVENT_NAMES.UpdateTextField,
      eventDetails: {
        userId: appState.userData?.userId,
        prism: this.props.prism,
        to: value
      }
    });
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
      isSettingsView: false
    };
  }

  toggleHidden() {
    this.prism.hidden = !this.prism.hidden;
    this.forceUpdate();
  }

  toggleView = () => {
    this.setState(prevState => ({ isSettingsView: !prevState.isSettingsView }));
  }

  // componentDidUpdate(prevProps, prevState) {
  //     if (prevProps.constraints !== this.props.constraints) {
  //       // constraints changed, do your update here
  //       // this.handleConstraintsChanged();
  //       this.prismHandleOnConstraintUpdate();
  //     }
  //   }

  onAddConstraint(constraint) {
    this.props.addConstraint(constraint);
    this.prismHandleOnConstraintUpdate(this.prism, this.props.opening);
  }

  onRemoveConstraint(constraint) {
    this.props.removeConstraint(constraint);
    this.prismHandleOnConstraintUpdate(this.prism, this.props.opening);
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
          expandMode={'reduce'} 
          onTooltipUpdate={this.props.onTooltipUpdate}
          />

        {/* {tokens.map((token) => {
          return <TokenAlternates
            token={token}
            key={token.id}
            alternates={token.alternates}
            tokenManager={this.tokenManager}
            prism={prism}
            onClickSequence={this.props.onClickSequence} />;
        })} */}
      </div>
  }

  parseText = (text) => {
    let split = text.split(/(<i>.*?<\/i>)/);
    return split.map((part, index) => {
      if (part.startsWith('<i>') && part.endsWith('</i>')) {
        return <i key={index}>{part.slice(3, -4)}</i>;
      }
      return part;
    });
  };

  bulletedText(text) {
    try {
      const items = text.split('*').filter(item => item.trim() !== '');
      return (
        <ul className="bullets">
          {items.map((line, index) => (
            <li key={index} className="bullet">{this.parseText(line.trim())}</li>
          ))}
        </ul>
      );
    } catch (error) {
      console.warn("prismview:", error)
    }
  }

  onRandomize() {
    this.props.onRandomize();
    this.forceUpdate()
  }

  render() {
    let prism = this.prism;
    let start = this.props.startIndex;
    let end = this.props.endIndex;
    let opening = this.props.opening;

    const styles = prismStyles(prism);

    let tokens = start !== null ? this.tokenManager.tokensAt(prism.tokenType, start, end) : [];

    let results = prism?.insights[opening?.id]?.results || [];
    let text = prism?.insights[opening?.id]?.text || null;

    let activeNotHidden     = prism.active && !prism.hidden;
    let showTokenContent    = activeNotHidden && tokens.length > 0;
    let showtext            = activeNotHidden && text;
    let showOpeningElements = activeNotHidden && opening != null;
    let showResults         = showOpeningElements && activeNotHidden && (results.length > 0 || this.props.isSearching)
    let displayingFull      = showTokenContent || showResults;

    let rotated = activeNotHidden ? "rotated" : "";
    let activeClass  = activeNotHidden ? "active"  : "";
    let searching = this.props.isSearching && activeNotHidden ? "searching" : "";

    let title = "";
    if (!activeNotHidden && prism.title != null && prism.title != prism.type) {
      title = prism.title;
      title = <div style={styles.titleStyle} className="colorless-subtitle"> {title} </div>
    }

    let textContent = showtext ? this.bulletedText(text) : "";


    return <div className={`prism`} style={styles.style}>
        <PrismTitle 
          prism={prism}
          rotated={rotated}
          title={title}
          isSearching={this.props.isSearching}
          onRemovePrism={this.props.onRemovePrism}
          toggleHidden={this.toggleHidden.bind(this)}
          onTooltipUpdate={this.props.onTooltipUpdate}
          styles={styles}
        />

        <div className={`prism-content ${activeClass} ${searching}`}>
          {/* {this.state.isSettingsView ? (
            <div>Settings View Placeholder</div>
          ) : (
            'hi'
          )} */}

          {activeNotHidden ? Object.values(prism.textFields).map((field) => {
            return <PrismEditableTextField key={field.text} field={field} prism={prism} addEvent={this.props.addEvent} />
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
              styles={styles}
              onDelete={this.onRemoveConstraint.bind(this)} 
              hasHistogramData={this.state.hasHistogramData}
              onConstraintUpdate={this.prismHandleOnConstraintUpdate.bind(this)}/>}) : ""
          }

          {showOpeningElements ? <PrismControls
            tokens={tokens}
            opening={opening}
            onSearch={this.props.onSearch}
            onRandomize={this.onRandomize.bind(this)}
            prism={prism}
            onAdd={this.onAddConstraint.bind(this)}
            styles={styles}
            onConstraintUpdate={this.prismHandleOnConstraintUpdate.bind(this)} /> : "" }
          
          {showResults ? <SearchResults
                      showLength={true}
                      wrap={false}
                      short={true}
                      doAnimation={false}
                      isSearching={this.props.isSearching}
                      tokenType={prism.type}
                      onClickSequence={this.props.onClickSequence}
                      onTooltipUpdate={this.props.onTooltipUpdate}
                      results={results} 
                      styles={styles}
                      colorBy={'origin'}
                      /> : ""}
      </div>
    </div>;
  }
}
