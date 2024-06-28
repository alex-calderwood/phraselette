// https://reactjs.org/docs/create-a-new-react-app.html
import "./App.css";
import React, { useCallback , useRef, Component } from "react";

// a library for aing and restoring selections (cursor positions / ranges) in a document
// it uses hidden elements to store the selection data
import { TokenManager } from "./tokens/TokenManager";
import { HighlightBar } from "./TokenRange";
import { PrismComponent, Prism} from "./Prism";
import { LenseEditor } from "./LenseEditor";
                                     
//         _-_.
//      _-',^. `-_.
//  ._-' ,'   `.   `-_ 
// !`-_._________`-':::
// !   /\        /\::::
// ;  /  \      /..\:::
// ! /    \    /....\::
// !/      \  /......\:
// ;--.___. \/_.__.--;; 
//  '-_    `:!;;;;;;;'
//     `-_, :!;;;''
//         `-!'         mn


class App extends Component {
  constructor(props) {

    let prisms = {
      'words':        new Prism('words',       'string').setActive(false).setDoHighlight(false),                                                      
      'probability':  new Prism('probability', 'number'  ).setActive(true).setDoHighlight(true),                                                         
      'POS':          new Prism('POS',         'string'  ),                                                                             
      'embedding':    new Prism('embedding',   'vector'  ),                                                                       
      'critic':       new Prism('critic',      'string'  ),                                                                          
    }

    super(props);
    let initialLense = 'probability';
    window.tokenManager = this.tokenManager; // for debugging
    let activeLenses = Prism.getActive(prisms);
    this.tokenManager = new TokenManager(activeLenses);

    this.text = null;
    this.state = {
      prisms: prisms,
      activeLenses: activeLenses,
      tokens: Object.keys(this.tokenManager.tokens),
      selection: null,
      info: {},
     };
     window.state = this.state; // for debugging
     console.log('new app state', this.state);

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

  attemptInitialTokenization() { // TODO this should go somewhere else
    console.log('attempting initial tokenization', this.text, this.tokenManager);
    if (this.tokenManager && this.text) {
      this.tokenManager.tokenize(this.text);
    }
  }

  handleAddLense() {
    // const selectedLense = this.lenseSelect.value;
    const selectedLense = document.getElementById('add-lense').value;
    console.log('adding lense', selectedLense);

    // call Prism.setActive on the selected lense
    let prisms = this.state.prisms;
    prisms[selectedLense].setActive(true);
    
    // update the state
    this.setState({ activeLenses: Prism.getActive(prisms) });

    // update the tokenManager
    this.tokenManager.setActiveLense(selectedLense, true);

    // tokenize the text with the new lense
    this.attemptInitialTokenization();
  }

  onHighlightChange(prismName, shouldHighlight) {
    console.log('App highlight change', prismName, shouldHighlight);
    let prisms = this.state.prisms;
    prisms[prismName].setDoHighlight(shouldHighlight);
    this.setState({ prisms: prisms });

    // for now, we only allow one highlighted lense, so we need to uncheck all the other ones
    let activeLenses = Prism.getActive(prisms);
    for (let lense of activeLenses) {
      if (lense !== prismName) {
        prisms[lense].setDoHighlight(false);
      }
      console.log('after setting do highlight', lense, prisms[lense].shouldHighlight);
    }

    this.tokenManager.setActiveLense(prismName, true);
  }

  render() {
    let startChar = this.state.selection ? this.state.selection.startChar : null;
    let endChar   = this.state.selection ? this.state.selection.endChar : null;
    let selectionText = this.state.selection ? this.state.selection.text : null;

    console.log('rendering app with prism', this.state.prisms);

    let activeLenses = Object.entries(this.state.prisms).filter(([key, prism]) => prism.active).map(([key, prism]) => prism);
    window.activeLenses = activeLenses; // for debugging
    return (
      <div className="context-container">
        {/* <HighlightBar tokens={this.state.tokens}
          setCurrentLense={this.setCurrentToken.bind(this)}
          attemptInitialTokenization={this.attemptInitialTokenization.bind(this)} /> */}

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
              <span id="selected" className="info">
                <span >active: </span>
                {activeLenses.map((prism) => {
                  return <span key={prism.name}>{prism.name} </span>;
                })}
              </span>
            </div>

            <div className={`prism-inspector`}>

              {selectionText && selectionText.length > 0 ? <div className="selection-text">"{selectionText}"</div> : ""}
              
              {activeLenses.map((prism) => {
                return (
                  <PrismComponent 
                    key={prism.name}
                    tokenManager={this.tokenManager} 
                    prism={prism}
                    selection={this.state.selection} 
                    startChar={startChar} endChar={endChar} 
                    shouldHighlight={prism.shouldHighlight}
                    onHighlightChange={this.onHighlightChange.bind(this)} />
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