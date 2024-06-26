// https://reactjs.org/docs/create-a-new-react-app.html
import "./App.css";
import React, { useCallback , useRef, Component } from "react";

// a library for aing and restoring selections (cursor positions / ranges) in a document
// it uses hidden elements to store the selection data
import { TokenManager } from "./tokens/TokenManager";
import { LenseBar, TokenBar } from "./Components";
import { LenseEditor } from "./LenseEditor";

class App extends Component {
  constructor(props) {
    super(props);
    let initialLense = 'basic'; // TODO this might get recreated every time the App is created
    this.tokenManager = new TokenManager(initialLense);
    window.tokenManager = this.tokenManager; // for debugging
    let tokens = Object.keys(this.tokenManager.tokens)
    this.state = { 
      possibleLenses: [
        { name: 'words',        active: true,  dataType: 'string', constraints: []},
        { name: 'basic',        active: true,  dataType: 'string', constraints: []},
        { name: 'probability',  active: false, dataType: 'number', constraints: []},
        { name: 'POS',          active: false, dataType: 'string', constraints: []},
        { name: 'embedding',    active: false, dataType: 'vector', constraints: []},
        { name: 'basic',        active: false, dataType: 'string', constraints: []},
        { name: 'critic' ,      active: false, dataType: 'string', constraints: []}
      ], 
      currentLense: initialLense,
      tokens: tokens,
      selection: null,
      info: {},
     };

    // current token is words, create a setter to pass to the LenseBar where it will change it
    this.setCurrentToken = (token) => {
      console.log('setting current lense to', token);
      this.tokenManager.setCurrentLense(token); //TODO refactor name
      this.setState({ currentLense: token });
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
        && this.tokenManager.tokens
        && this.tokenManager.tokens[this.state.currentLense].length > 0
        && this.text
      ) {
        this.tokenManager.tokenize(this.text);
      }
    }


    this.handleAddLense = () => {
      // const selectedLense = this.lenseSelect.value;
      const selectedLense = document.getElementById('add_lense').value;
      console.log('adding lense', selectedLense);
      this.setState(prevState => {
        const updatedLenses = prevState.possibleLenses.map(lense => {
          if (lense.name === selectedLense) {
            return { ...lense, active: true };
          }
          return lense;
        });
        return { possibleLenses: updatedLenses };
      });
    };

  }

  render() {
    let startChar = this.state.selection ? this.state.selection.startChar : null;
    let endChar   = this.state.selection ? this.state.selection.endChar : null;

    console.log('rendering with selection', startChar, endChar);

    let activeLenses = this.state.possibleLenses.filter((lense) => lense.active);
    return (

      <div className="context-container">
        <LenseBar tokens={this.state.tokens}
          setCurrentLense={this.setCurrentToken}
          attemptInitialTokenization={this.attemptInitialTokenization.bind(this)} />

        <div className="editor-container">
          <div className="left">
            <LenseEditor
            tokenManager={this.tokenManager} 
            token={this.state.currentLense} 
            setSelection={this.setSelection} 
            setText={this.setText} />
          </div>

          <div className="right">
            <div className="lenses"> 
              <label htmlFor="add_lense">add a lense</label>
              <select id="add_lense">
                {this.state.possibleLenses.map((lense) => {
                  return <option key={lense.name} value={lense.name}>{lense.name}</option>;
                })}
              </select>
              {/* button that sets the selected lense to active */}
              <button onClick={this.handleAddLense.bind(this)}>add</button>
            </div>

            <div className={`sidebar-container`}>

              {/* for each active lense */}
              {activeLenses.map((lense) => {
                return (
                  <TokenBar tokenManager={this.tokenManager} 
                    type={lense.name} 
                    selection={this.state.selection} 
                    startChar={startChar} endChar={endChar}/>
                );
              })}

              {/* <TokenBar tokenManager={this.tokenManager} 
                type={"words"} 
                selection={this.state.selection} 
                startChar={startChar} endChar={endChar}/>
              <TokenBar tokenManager={this.tokenManager}
                type={"basic"} 
                selection={this.state.selection} 
                startChar={startChar} endChar={endChar}/> */}
            </div>
          </div>
        </div>

        {/* if errors put them in a div otherwise don't have one*/}
        {/* <div className="info">
          {this.state.info.error ? <div className="error">{this.state.info.error}</div> : null}
        </div> */}
      </div> 


    );
  }
}

export default App;