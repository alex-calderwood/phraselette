// https://reactjs.org/docs/create-a-new-react-app.html
import "./App.css";
import React, { useCallback , useRef, Component } from "react";

// a library for saving and restoring selections (cursor positions / ranges) in a document
// it uses hidden elements to store the selection data
import { TokenManager } from "./tokenManager";
import { LenseBar, TokenBar } from "./components";
import { LenseEditor } from "./LenseEditor";

class App extends Component {
  constructor(props) {
    super(props);
    let initialLense = 'basic'; // TODO this might get recreated every time the App is created
    this.tokenManager = new TokenManager(initialLense);
    window.tokenManager = this.tokenManager; // for debugging
    let lenses = Object.keys(this.tokenManager.lenses)
    this.state = { 
      activeLenses: ['basic', 'words'], // TODO for each active lense, should tokenize the text
      currentLense: initialLense,
      lenses: lenses,
      selection: null,
      info: {},
     };

    // current lense is words, create a setter to pass to the LenseBar where it will change it
    this.setCurrentLense = (lense) => {
      console.log('setting current lense to', lense);
      this.tokenManager.setCurrentLense(lense);
      this.setState({ currentLense: lense });
    };

    this.setSelection = (selection) => {
      this.setState({ selection: selection });
    }

    this.setInfo = (info) => {
      this.setState({ info: info });
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
    let startChar = this.state.selection ? this.state.selection.startChar : null;
    let endChar   = this.state.selection ? this.state.selection.endChar : null;

    return (
      <div className="context-context">
        <LenseBar lenses={this.state.lenses}
          setCurrentLense={this.setCurrentLense}
          attemptInitialTokenization={this.attemptInitialTokenization.bind(this)} />
        <TokenBar tokenManager={this.tokenManager} 
          lense={"words"} 
          selection={this.state.selection} 
          startChar={startChar} endChar={endChar}/>
        <TokenBar tokenManager={this.tokenManager}
          lense={"basic"} 
          selection={this.state.selection} 
          startChar={startChar} endChar={endChar}/>
        <div className="editor-context">
          <LenseEditor
          tokenManager={this.tokenManager} 
          lense={this.state.currentLense} 
          setSelection={this.setSelection} 
          setText={this.setText} />
        </div>

        {/* if errors put them in a div otherwise don't have one*/}
        <div className="info">
          {this.state.info.error ? <div className="error">{this.state.info.error}</div> : null}
        </div>
      </div>


    );
  }
}

export default App;