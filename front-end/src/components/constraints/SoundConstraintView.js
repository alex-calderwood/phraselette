import React, { Component } from "react";
import { makePhonemeTargetFromTokens, SoundConstraint } from "../../base/Constraint"
import { CategoryListConstraintView } from "./ConstraintView"
import { spacyTokenize } from "../../scripts/smarts"


export class SoundConstraintView extends CategoryListConstraintView {
    constructor(props) {
      super(props);
      this.state = {
        ...this.state,
        text: '',
        isLoading: false // Add loading state
      };
    }
  
    handleTextChange = (event) => {
      this.setState({ text: event.target.value });
    }
  
    // Make this an async method
    handleSubmit = async () => {
      try {
        this.setState({ isLoading: true });
        console.log("tokenizing", this.state.text)
        const spacyWordTokens = await spacyTokenize(this.state.text, {requests: ['sound']});
        let targetPhones = makePhonemeTargetFromTokens(spacyWordTokens);
        targetPhones = SoundConstraint.prepareTarget(targetPhones);
        console.log('set target', spacyWordTokens, targetPhones);
        this.replaceTarget(targetPhones) // calls constraint.replaceTarget
      } catch (error) {
        // Handle error appropriately
        console.error('Failed to tokenize:', error);
        // Optionally set error in state to display to user
      } finally {
        this.setState({ isLoading: false });
      }
    }
  
    renderExtra() {
      return <form className={'default-form'} onSubmit={e => { e.preventDefault(); this.handleSubmit(); }}>
        <input
          type="text"
          value={this.state.text}
          onChange={this.handleTextChange}
          style={this.props.styles.buttonStyle}
          disabled={this.state.isLoading}
          placeholder={'enter sound ref...'}
        />
        <button
          type="submit"
          style={this.props.styles.buttonStyle} 
          disabled={this.state.isLoading}
        >
          {this.state.isLoading ? 'loading...' : '>'}
        </button>
      </form>
    }
  }