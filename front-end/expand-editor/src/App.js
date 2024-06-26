// https://reactjs.org/docs/create-a-new-react-app.html
import "./App.css";
import React, { useCallback , useRef, Component } from "react";

// a library for aing and restoring selections (cursor positions / ranges) in a document
// it uses hidden elements to store the selection data
import { TokenManager } from "./tokens/TokenManager";
import { HighlightBar } from "./Components";
import { PrismComponent, Prism} from "./Lens";
import { LenseEditor } from "./LenseEditor";

class App extends Component {
  constructor(props) {
    super(props);
    let initialLense = 'basic'; // TODO this might get recreated every time the App is created
    this.tokenManager = new TokenManager(initialLense);
    window.tokenManager = this.tokenManager; // for debugging
    this.text = null;
    this.state = {
      prisms: {
        'words':        new Prism('words', 'string').setActive(true),
        'basic':        new Prism('basic', 'string').setActive(true),
        'probability':  new Prism('probability', 'number'),
        'POS':          new Prism('POS', 'string'),
        'embedding':    new Prism('embedding', 'vector'),
        'critic':       new Prism('critic', 'string'),
      },
      currentLense: initialLense, // TODO turn this into active lenses.... (deprecate)
      tokens: Object.keys(this.tokenManager.tokens),
      selection: null,
      info: {},
     };
  }

  // current token is words, create a setter to pass to the LensBar where it will change it
  setCurrentToken(token) {
    console.log('setting current lense to', token);
    this.tokenManager.setCurrentLense(token); //TODO refactor name
    this.setState({ currentLense: token });
  }


  setSelection(selection) {
    this.setState({ selection: selection });
  }

  setInfo(info) {
    this.setState({ info: info });
  }

  setText(text) {
    this.text = text;
  }

  attemptInitialTokenization() {
    if (
      this.tokenManager 
      && this.tokenManager.tokens
      && this.tokenManager.tokens[this.state.currentLense].length > 0
      && this.text
    ) {
      this.tokenManager.tokenize(this.text);
    }
  }

  handleAddLense() {
    // const selectedLense = this.lenseSelect.value;
    const selectedLense = document.getElementById('add-lense').value;
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
  }

  render() {
    let startChar = this.state.selection ? this.state.selection.startChar : null;
    let endChar   = this.state.selection ? this.state.selection.endChar : null;

    console.log('rendering with selection', startChar, endChar);

    let activeLenses = Object.entries(this.state.prisms).filter(([key, prism]) => prism.active).map(([key, prism]) => prism);
    

    return (

      <div className="context-container">
        <HighlightBar tokens={this.state.tokens}
          setCurrentLense={this.setCurrentToken.bind(this)}
          attemptInitialTokenization={this.attemptInitialTokenization.bind(this)} />

        <div className="editor-container">
          <div className="left">
            <LenseEditor tokenManager={this.tokenManager} 
            token={this.state.currentLense} 
            setSelection={this.setSelection.bind(this)} 
            setText={this.setText.bind(this)} />
          </div>
          <div className="right">
            <div className="lenses">
              <label htmlFor="add-lense">add a lense</label>
              <select id="add-lense">
                {Object.entries(this.state.prisms).map(([name, lense]) => {
                  return <option key={lense.name} value={lense.name}>{lense.name}</option>;
                })}
              </select>
              {/* button that sets the selected lense to active */}
              <button className="selectButoon" onClick={this.handleAddLense.bind(this)}>add</button>
              <div id="selected" className="info">
                <span >active: </span>
                {activeLenses.map((lense) => {
                  return <span key={lense.name}>{lense.name} </span>;
                })}
              </div>
            </div>

            <div className={`sidebar-container`}>
              {activeLenses.map((lense) => {
                return (
                  <PrismComponent 
                    key={lense.name}
                    tokenManager={this.tokenManager} 
                    doHighlight={lense.active} // TODO fix this, something to do with state?
                    toggleHighlight={lense.setActive.bind(lense, !lense.active)}
                    type={lense.name}
                    selection={this.state.selection} 
                    startChar={startChar} endChar={endChar} />
                );
              })}
            </div>
          </div>
        </div>
      </div> 
    );
  }
}

export default App;