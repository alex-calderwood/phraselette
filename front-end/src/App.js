// Used https://reactjs.org/docs/create-a-new-react-app.html
import "./App.css";
import React, { Component } from "react";
import { ActivePrismIndicator } from "./components/ActivePrismIndicator";
import { TokenManager } from "./document/TokenManager";
import { Prism, LLMProbabilityPrism } from "./document/Prism";
import { WordView } from "./components/WordView";
import { LenseEditor } from "./components/LenseEditor";
import { PrismView } from "./components/PrismView";
import { SearchResults } from "./components/SearchResults";

const initialPrism = 'spacy';
const debugMode = false;

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
    super(props);
    let prisms = {
      'likelihood':      new LLMProbabilityPrism().setActive(true),
      'spacy':        new Prism('spacy',       'string', ['pos']).setActive(true).setDoHighlight(true),                                                                 
      'words':        new Prism('words',       'string'),                                              
      'probability':  new Prism('probability', 'number'),
      'critic':       new Prism('critic',      'string'),
      'sound':        new Prism('sound',       'list'  ),
    }
    let activePrisms = Prism.getActive(prisms);

    // TODO move the token management in the prisms themselves
    this.tokenManager = new TokenManager(activePrisms);
    window.tokenManager = this.tokenManager; // for debugging

    this.text = null;
    this.state = {
      prisms: prisms,
      activePrisms: activePrisms,
      prismToHighlight: initialPrism,
      tokens: Object.keys(this.tokenManager.tokens),
      selection: null,
      constraints: [], // [new POSConstraint(['NN', 'JJ'])],
      isSearching: false,
      info: {},
     };

     this.editorRef = React.createRef();
  }

  /* 
   * Called when the 
  */
  setSelection(selection) {
    this.setState({ selection: selection });

    if(this.automaticSearch) {

    }
  }

  setSearchingState(isSearching) {
    this.setState({ isSearching: isSearching });
  }

  setText(text) {
    this.text = text;
  }

  attemptInitialTokenization() {
    if (this.tokenManager && this.text) {
      this.tokenManager.tokenize(this.text);
    }
  }

  /* 
   * Add the prism indicated by the drop down to the list of active lenses.
   * Also make it currently highlighted lense. 
   * Finally, attempt to tokenize by the selected lense in order to highlight based on its probabilities.
  */
  handleAddPrism() {
    const selectedLense = document.getElementById('add-lense').value;

    // set the prism to active
    let prisms = this.state.prisms;
    prisms[selectedLense].setActive(true);

    // set the prism highlight to on
    prisms[selectedLense].setDoHighlight(true);
    this.onHighlightChange(selectedLense, true);
    
    // update the state
    this.setState({ activeLenses: Prism.getActive(prisms) });

    // update the tokenManager
    this.tokenManager.setActiveLense(selectedLense, true);

    // tokenize the text with the new lense
    this.attemptInitialTokenization();
  }

  // Initialize the uninitialized
  componentDidMount() {
    // Figure out which lense to initially higihlight
    let highlightPrism =  Object.keys(this.state.prisms).filter((key) => {
      return this.state.prisms[key].shouldHighlight;
    });
    highlightPrism = highlightPrism.length > 0 ? highlightPrism[0] : null;
    if (highlightPrism)
      this.onHighlightChange(highlightPrism, true);
  }

  onHighlightChange(prismName, shouldHighlight) {
    let prisms = this.state.prisms;

    // for now, we only allow one highlighted lense, so we need to uncheck all the other ones
    let activeLenses = Prism.getActive(prisms);
    for (let lense of activeLenses) {
      if (lense === prismName) {
        prisms[lense].setDoHighlight(shouldHighlight)
      } else {
        prisms[lense].setDoHighlight(false);
      }
    }

    // after the update print out the new state
    this.setState({ lenseToHighlight: prismName});
  }

  onSearchResults(results) {
    this.setSearchingState(false);
    this.setState({ searchResults: results});
  }

  addConstraint(constraint) {
    this.setState({
      constraints: this.state.constraints.concat([constraint])
    });
  }

  removeConstraint(constraint) {
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

  render() {
    let startIndex    = this.state.selection ? this.state.selection.startIndex : null;
    let endIndex      = this.state.selection ? this.state.selection.endIndex: null;
    let selectionText = this.state.selection ? this.state.selection.text : null;

    let showSelection = debugMode && startIndex !== null && endIndex !== null;

    let activePrisms = Object.entries(this.state.prisms).filter(([key, prism]) => prism.active).map(([key, prism]) => prism);
    window.activeLenses = activePrisms; // for debugging
    
    let wordsPrism = this.state.prisms[this.tokenManager.wordsLense]; // which prism represents word breaks
    let searchResults = this.state.searchResults ? this.state.searchResults : [];

    return (
      <div className="context-container">
        <div className="editor-container">
          <div className="left"> {/* The text editor */}
            <LenseEditor tokenManager={this.tokenManager}
              setSelection={this.setSelection.bind(this)}
              setText={this.setText.bind(this)}
              lenseToHighlight={this.state.prismToHighlight}
              ref={this.editorRef}
              testPrism={this.state.prisms['likelihood']}
              onSearch={() => { this.setSearchingState(true); }}
              onSearchResults={this.onSearchResults.bind(this)}
              constraints={this.state.constraints}
              />
          </div>
          
          <div className="right"> {/* Everything on the right hand side of the screen */}
            <div className="lenses"> {/* A list of each active lense and a checkbox to activate/deactivate them */}
              <select title="add a lense" id="add-lense">
                {Object.entries(this.state.prisms).map(([name, lense]) => {
                  return <option key={lense.name} value={lense.name}>{lense.name}</option>;
                })}
              </select>
              {/* button that sets the selected lense to active */}
              <button className="selectButoon" onClick={this.handleAddPrism.bind(this)}>add</button>
              <span id="selected" className="info">
                <span id="active" >active: </span>
                {activePrisms.map((prism) => {
                  let shouldHighlight = prism.shouldHighlight;
                  let onHighlightChange = this.onHighlightChange.bind(this)
                  return <ActivePrismIndicator 
                            key={prism.name} 
                            prism={prism} 
                            shouldHighlight={shouldHighlight}
                            onHighlightChange={onHighlightChange}>{prism.name}</ActivePrismIndicator>
                })}
              </span>
            </div>

            <div className={`prism-inspector`}>
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
              {/* A bit distracting */}
              {activePrisms.map((prism) => {
                return (
                  <PrismView
                    key={prism.name}
                    tokenManager={this.tokenManager} 
                    prism={prism}
                    startIndex={startIndex} endIndex={endIndex} 
                    onSwapToken={(originalToken, newToken) => { this.swapToken(originalToken, newToken)}}
                    debugMode={debugMode}
                    constraints={this.state.constraints.filter((constraint) => prism.features.includes(constraint.targetFeature))}
                    addConstraint={this.addConstraint.bind(this)}
                    removeConstraint={this.removeConstraint.bind(this)}
                  />
                );
              })}

              {/* Constrained search results */}
              <SearchResults results={searchResults} isSearching={this.state.isSearching} wrap={false}/>   {/* onTokenClick={this.onTokenClick.bind(this)} /> */}
            </div>
          </div>
        </div>
      </div>
    );
  }
}

export default App;