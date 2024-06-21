// https://docs.slatejs.org/
// https://reactjs.org/docs/create-a-new-react-app.html
import "./App.css";
import React, { useState, useCallback , useRef, Component } from "react";
import styled from 'styled-components';

// a library for saving and restoring selections (cursor positions / ranges) in a document
// it uses hidden elements to store the selection data
import { TokenManager } from "./TokenManager";
import { LenseBar, Sidebar, LenseEditor } from "./Components";

function debounce(fn, delay) {
  let timeoutID;
  return function (...args) {
    if (timeoutID) {
      clearTimeout(timeoutID);
    }
    timeoutID = setTimeout(() => {
      fn(...args);
      timeoutID = null;
    }, delay);
  };
}

class App extends Component {
  constructor(props) {
    super(props);
    this.tokenManager = new TokenManager();
    window.tokenManager = this.tokenManager; // for debugging
    this.state = { 
      lenses: Object.keys(this.tokenManager.lenses),
      activeLenses: ['words', 'gpt-2'], // TODO for each active lense, should tokenize the text
      currentLense: 'words',
      selection: null,
     };

    // current lense is words, create a setter to pass to the LenseBar where it will change it
    this.setCurrentLense = (lense) => {
      console.log('setting current lense to', lense);
      this.tokenManager.setCurrentLense(lense);
      this.setState({ currentLense: lense });
      // recolor each character
      // this.colorAllCharactersByProb(); // eventually this should be a state thing so it is managed by react
    };

    this.setSelection = (selection) => {
      this.setState({ selection: selection });
    }

    this.setText = (text) => {
      this.text = text;
    }

    this.attemptInitialTokenization = () => {
      if (
        this.tokenManager 
        && this.tokenManager.lenses
        && this.tokenManager.lenses[this.state.currentLense].length > 0
      ) {
        this.tokenManager.tokenize(this.text);
      }
    }
  }

  render() {
    return (
      <div className="context-context">
          <LenseBar lenses={this.state.lenses} setCurrentLense={this.setCurrentLense} attemptInitialTokenization={this.attemptInitialTokenization.bind(this)} />
          <Sidebar tokenManager={this.tokenManager} lense={this.lense} color={this.color} selection={this.state.selection} />
          <div className="editor-context">
            <LenseEditor tokenManager={this.tokenManager} lense={this.state.currentLense} setSelection={this.setSelection} setText={this.setText} />
          </div>
      </div>
    );
  }
}

export function getColor(lense, prob) {
  // console.log('lense', lense, 'prob', prob);
  if (lense === 'words') {
    return probToColor(prob);
  } else if (lense === 'gpt-2') {
    return probToColorExponential(prob);
  } else {
    return probToColor(prob);
  }
}

let prevColor = 100;
let prevColor2 = 138;
const probToColorRandom = (prob) => {
  if (!prob || prob <= 0) {
    return 'white';
  }
  return "rgba(" + prevColor + ", " + prevColor2 + ", 0, " + prevColor / 255 + ")";
};

const probToColor = (prob) => {
  if (!prob || prob <= 0) {
    return 'white';
  }

  let g = prob * 255;
  return "rgba(" + 0 + ", " + g + ", 0, " + prob + ")";
};


const probToColorExponential = (prob) => {
  // the probabilities are very small so lets make them more visible
  if (!prob || prob <= 0) {
    return 'white';
  }
  let g = Math.min(Math.pow(prob, 1/3) * 255, 255);
  return "rgba(" + 0 + ", " + g + ", 0, " + 0.5 + ")";
}


export default App;