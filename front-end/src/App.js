import "./App.css";
import React, { Component } from "react";

import { Prism } from "./base/prism/Prism";
import { initialPrisms, makePrism} from "./base/prism/prismCreator";
import { TokenManager } from "./base/TokenManager";
import { Document } from "./base/Document"
import { Constraint } from "./base/Constraint";

import { WordView } from "./components/WordView";
import { PrismEditor } from "./components/PrismEditor";
import { PrismView } from "./components/PrismView";
import { SearchResults } from "./components/SearchResults";

import { resolveConstraints } from "./scripts/resolution";
import { assignSocket } from "./scripts/socket";
 
//         *-*.                                 //        /    /    /
//      _-',^. `-_.                         //        /   /  /
//  ._-' ,'   `.   `-_                  //       /  /  /
// !`-_._________`-':::             //     /  / /
// !   /\ PRISM  /\::::         //    ///
// ;  /  \EDITOR/..\:::     //    //
// ! /    \    /....\::  //  / //
// !/      \  /......\:// /
// ;--.___. \/_.__.--;/
//  '-_    `:!;;;;;;;'   \
//     `-_, :!;;;''             \
//         `-!'                       \\

const initialPrismType = 'words';
const debugMode = false;

class App extends Component {
  constructor(props) {
    super(props);

    this.prismCallbacks = {
      onSearchComplete: this.onSearchComplete.bind(this),
    }
    let prisms = initialPrisms(this.prismCallbacks);

    let activePrisms = Prism.getActive(prisms);
    this.tokenManager = new TokenManager(activePrisms);
    window.tokenManager = this.tokenManager; // for debugging
    let prismToHighlight = Prism.getByType(activePrisms, initialPrismType);
    console.log('initial prism to highlight', prismToHighlight);

    this.text = null;
    this.state = {
      prisms: prisms,
      activePrisms: activePrisms,
      prismToHighlight: prismToHighlight,
      tokens: Object.keys(this.tokenManager.tokens),
      selection: null,
      constraints: [],
      isSearching: false,
      info: {},
     };

     this.editorRef = React.createRef();
     this.containerRef = React.createRef();

    // wire up websocket connection to server, should prob not be done in a component...
    const loc = window.location;
    const socketProtocol = {"http:": "ws", "https:": "wss"}[loc.protocol];

    function handleDictResponse(msg) {
      let doc = this._currentDocument();
      let dictPrism = Prism.getByID(this.state.prisms, msg.prism);
      let constraints = Constraint.subsetByFeatures(this.state.constraints, dictPrism.features);
      dictPrism.onSearchResults({message: msg}, doc, constraints);
    }

    function handleCriticResponse(msg) {
      let doc = this._currentDocument();
      let critic = Prism.getByID(this.state.prisms, msg.prism);
      console.log('critic prism', critic, this.state.prisms, msg);
      let constraints = Constraint.subsetByFeatures(this.state.constraints, critic.features);
      critic.onSearchResults({message: msg}, doc, constraints);
    }

    let handlers = {
      "thesaurusResponse": handleDictResponse.bind(this),
      "criticResponse": handleCriticResponse.bind(this),
    }
    assignSocket(socketProtocol, loc.host+'/'+loc.hash.replace('#', '?'), handlers)
  }

  /* 
   * Called when the user selects new text.
  */
  setSelection(selection) {
    this.setState({ selection: selection });
  }

  setSearchingState(isSearching) {
    this.setState({ isSearching: isSearching });
  }

  setText(text) {
    this.text = text;
  }

  _currentDocument() {
    return new Document(this.text, this.state.selection, this.tokenManager);
  }

  attemptInitialTokenization() {
    if (this.tokenManager && this.text?.length > 0) {
      this.tokenManager.tokenize(this.text);
    }
  }

  /* 
   * Add the prism indicated by the drop down to the list of active lenses.
   * Also make it currently highlighted lense. 
   * Finally, attempt to tokenize by the selected lense in order to highlight based on its probabilities.
  */
  handleAddPrism() {
    const selectedPrismType = document.getElementById('add-lense').value;
    const prism = makePrism(selectedPrismType, this.prismCallbacks);
    console.log("making prism", prism);

    // tell the editor it is active and should be the current highlighted prism
    prism.setActive(true);
    prism.setDoHighlight(true);
    this.onHighlightChange(prism.id, true);
    
    // update the state
    let prisms = this.state.prisms;
    this.setState({ 
      prisms: {...prisms, [prism.id]: prism},
      activePrisms: Prism.getActive(prisms)
    });

    // update the tokenManager
    this.tokenManager.setActivePrism(prism, true);

    // tokenize the text with the new lense
    this.attemptInitialTokenization();
  }

  // Initialize the uninitialized
  componentDidMount() {
    // Figure out which lense to initially higihlight
    let highlightPrismID =  Object.keys(this.state.prisms).filter((key) => {
      return this.state.prisms[key].shouldHighlight;
    });
    highlightPrismID = highlightPrismID.length > 0 ? highlightPrismID[0] : null;
    if (highlightPrismID) { this.onHighlightChange(highlightPrismID, true); }

    // Add top level keystroke listeners
    document.addEventListener('keydown', this.onKeyDown.bind(this));
  }

  componentWillUnmount() {
    document.removeEventListener('keydown', this.onKeyDown);
  }

  onHighlightChange(prismID, shouldHighlight) {
    // for now, we only allow one highlighted lense, so we need to uncheck all the other ones
    let prisms = Prism.getActive(this.state.prisms);
    let toHighlight = null;
    for (let prism of prisms) {
      if (prism.id === prismID) {
        prism.setDoHighlight(shouldHighlight)
        toHighlight = prism;
      } else {
        prism.setDoHighlight(false);
      }
    }

    // console.log('on highlight change', prismID, shouldHighlight, prisms, toHighlight);

    this.setState({ prismToHighlight: prismID});
  }

  /* 
   * Saearch for alternate words using each prism.
  */
  async searchPrisms(doc) {
    this.setSearchingState(true); // UI update

    let constraints = this.state.constraints;
    let prisms = Prism.getActive(this.state.prisms);

    for (let prism of prisms) {
      prism.search(doc, constraints)
    }
  }
  
  /* 
  * A callback that is triggered when a prism finishes its .search() operation
  */
  async onSearchComplete() {
    let constraints = this.state.constraints;
    let prisms = Prism.getActive(this.state.prisms);
    let predictions = prisms.map(p => p?.insights?.results).filter(r => r && r.length > 0).flat()
    let filteredPredictions = await resolveConstraints(predictions, constraints);
    this.setState({ searchResults: filteredPredictions});
    this.setSearchingState(false);  // UI update
  }

  addConstraint(constraint) {
    this.setState({
      constraints: this.state.constraints.concat([constraint])
    });
  }

  removeConstraint(constraint) {
    console.log('removing constraint', constraint);
    this.setState({
      constraints: this.state.constraints.filter((c) => { return c !== constraint; })
    });
  }

  /*
   * Handle the swapping of tokens in the editor (as when the user selects a token replacement in the sidebar).
   * First, we want to swap the tokens in the tokenManager.
   * Then, we want to change the text in the editor for the new token text.
   * TODO: this seems to break things.
  */
  swapToken(originalToken, newToken) {
    this.tokenManager.swapToken(originalToken, newToken);
    this.editorRef.current.swapText(originalToken.start, originalToken.end, newToken.text);
  }

  onKeyDown(event) {
    if (event.metaKey && event.key === 'k') {
      return this.editorRef.current?.manualRetokenizeAction();
    }

    if (event.metaKey && event.key === '\'') {
      return this.editorRef.current?.manualSearchAction();
    }
  }

  render() {
    let startIndex    = this.state.selection ? this.state.selection.startIndex : null;
    let endIndex      = this.state.selection ? this.state.selection.endIndex: null;
    let selectionText = this.state.selection ? this.state.selection.text : null;

    let showSelection = debugMode && startIndex !== null && endIndex !== null;

    let activePrisms = Prism.getActive(this.state.prisms);
    window.activePrisms = activePrisms; // for debugging
    
    // get the prism that represents word breaks
    let wordsPrism = Prism.firstByType(this.state.prisms, this.tokenManager.wordsPrism);
    let searchResults = this.state.searchResults ? this.state.searchResults : [];
    
    return (
      <div className="context-container" ref={this.containerRef}>
        <div className="editor-container">
          <div className="left"> {/* The text editor */}
            <PrismEditor tokenManager={this.tokenManager}
              setSelection={this.setSelection.bind(this)}
              setText={this.setText.bind(this)}
              prismToHighlight={this.state.prismToHighlight}
              ref={this.editorRef}
              doSearch={this.searchPrisms.bind(this)}
              />
          </div>
          
          <div className="right"> { /* Everything on the right hand side of the screen */}
            <div className={`inspector`}>
              {selectionText && selectionText.length > 0 ? <div className="selection-display">"{selectionText}"</div> : ""}
              {showSelection ? <div className="selection-info">{startIndex} - {endIndex}</div> : ""}
              
              {/* Display the selected span and some info about it */}
              <WordView
                key={"wordslense"}
                tokenManager={this.tokenManager} 
                wordsPrism={wordsPrism}
                startIndex={startIndex} endIndex={endIndex} 
                onSwapToken={(originalToken, newToken) => { this.swapToken(originalToken, newToken)}}
                debugMode={debugMode}
              />

              {/* Display the active prisms */}
              {activePrisms.map((prism) => {
                return (
                  <PrismView
                    key={prism.id}
                    tokenManager={this.tokenManager} 
                    prism={prism}
                    isSearching={prism.isSearching} 
                    startIndex={startIndex} endIndex={endIndex} 
                    onSwapToken={(originalToken, newToken) => { this.swapToken(originalToken, newToken)}}
                    debugMode={debugMode}
                    constraints={Constraint.subsetByFeatures(this.state.constraints, prism.features)}
                    addConstraint={this.addConstraint.bind(this)}
                    getDocument={() => { return this._currentDocument(); }} // TODO I don't like that onConstraintUpdate needs this, will prob be slow
                    removeConstraint={this.removeConstraint.bind(this)}
                  />
                );
              })}

              {/* Constrained search results */}
              <SearchResults results={searchResults} isSearching={this.state.isSearching} wrap={false} showLength={true}/>   {/* onTokenClick={this.onTokenClick.bind(this)} /> */}
            </div>

            <div className="lenses"> { /* A list of each active lense and a checkbox to activate/deactivate them */}
              <select title="add a lense" id="add-lense">
                {Object.values(Prism.TYPES).map((prismType) => {
                  return <option key={prismType} value={prismType}>{prismType}</option>;
                })}
              </select>
              {/* button that sets the selected lense to active */}
              <button className="selectButoon" onClick={this.handleAddPrism.bind(this)}>add</button>
              {/* 
                let shouldHighlight = prism.shouldHighlight;
                let onHighlightChange = this.onHighlightChange.bind(this)
                return <ActivePrismIndicator 
                          key={prism.id} 
                          prism={prism} 
                          shouldHighlight={shouldHighlight}
                          onHighlightChange={onHighlightChange}>{prism.id}</ActivePrismIndicator> */}

            </div>
          </div>
        </div>
      </div>
    );
  }
}

export default App;