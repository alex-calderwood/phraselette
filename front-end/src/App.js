import "./App.css";
import React, { Component } from "react";
import { Document } from "./document/Document"
import { TokenManager } from "./document/TokenManager";
import { Prism, LLMProbabilityPrism, DictionaryPrism } from "./document/Prism";
import { WordView } from "./components/WordView";
import { PrismEditor } from "./components/PrismEditor";
import { PrismView } from "./components/PrismView";
import { SearchResults } from "./components/SearchResults";
import { resolveConstraints } from "./scripts/resolution";
import { assignSocket } from "./scripts/socket";
 
const initialPrism = 'words';
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
      'likelihood':   new LLMProbabilityPrism().setActive(true),
      'words':        new Prism('words',       'string', ['pos']).setActive(true).setDoHighlight(true),                                                                 
      'sound':        new Prism('sound',       'list',   ['sound', 'rhyme'], 'words'),
      'basic':        new Prism('basic',       'string'),                                              
      'probability':  new Prism('probability', 'number'),
      'dictionary':   new DictionaryPrism("the Spacefarer's Almanac").setActive(true),
      // 'critic':       new Prism('critic',      'string'),
    }
    // bind a UI state callback to the prisms
    for(let prism of Object.values(prisms)) {
      prism.onSearchComplete = this.onSearchComplete.bind(this);
    }

    let activePrisms = Prism.getActive(prisms);

    // eventually move the token management to the prisms themselves... it's a mess at the moment
    this.tokenManager = new TokenManager(activePrisms.map((prism) => prism.name));
    window.tokenManager = this.tokenManager; // for debugging

    this.text = null;
    this.state = {
      prisms: prisms,
      activePrisms: activePrisms,
      prismToHighlight: initialPrism,
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
      return prisms.dictionary.onSearchResults(msg, doc);
    }

    let handlers = {
      "dictionaryResponse": handleDictResponse.bind(this),
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
    const selectedLense = document.getElementById('add-lense').value;

    // set the prism to active
    let prisms = this.state.prisms;
    prisms[selectedLense].setActive(true);

    // set the prism highlight to on
    prisms[selectedLense].setDoHighlight(true);
    this.onHighlightChange(selectedLense, true);
    
    // update the state
    this.setState({ activePrisms: Prism.getActive(prisms) });

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

    // Add top level keystroke listeners
    document.addEventListener('keydown', this.onKeyDown.bind(this));
  }

  componentWillUnmount() {
    document.removeEventListener('keydown', this.onKeyDown);
  }

  onHighlightChange(prismName, shouldHighlight) {
    // for now, we only allow one highlighted lense, so we need to uncheck all the other ones
    let prisms = Prism.getActive(this.state.prisms);
    for (let prism of prisms) {
      if (prism.name === prismName) {
        prism.setDoHighlight(shouldHighlight)
      } else {
        prism.setDoHighlight(false);
      }
    }

    // after the update print out the new state
    this.setState({ lenseToHighlight: prismName});
  }
  /* 
   * Saearch for alternate words using each prism.
   * Aggregate them and display them.
  */
  async doSearch(doc) {
    this.setSearchingState(true); // UI update

    // try {
    let constraints = this.state.constraints;
    let prisms = Prism.getActive(this.state.prisms);

    for (let prism of prisms) {
      prism.search(doc, constraints)
    }

    // const searches = prisms.map((prism) => { return prism.search(document, constraints) });
      // we should only send out the searches here
      
      // we need to also register prism.onSearchResult() which will set the result of the search. this will create a message that we should be listening for elsewhere
      
    //   // const results = await Promise.all(searches);
    //   let predictions = results.flat();
    //   let filteredPredictions = await resolveConstraints(predictions, constraints);
      
    //   this.setState({ searchResults: filteredPredictions});
    // } catch (error) {
    //   console.error(error);
    // } finally {
    //   this.setSearchingState(false);  // UI update
    // }
  }
  
  async onSearchComplete() {
    let constraints = this.state.constraints;
    let prisms = Prism.getActive(this.state.prisms);
    let predictions = prisms.map(p => p.results).filter(r => r && r.length > 0).flat()
    console.log("predictions", predictions)
    let filteredPredictions = await resolveConstraints(predictions, constraints);
    this.setState({ searchResults: filteredPredictions});
    this.setSearchingState(false);  // UI update
  }

  addConstraint(constraint) {
    console.log('adding constraint', constraint);
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
    
    let wordsPrism = this.state.prisms[this.tokenManager.wordsLense]; // which prism represents word breaks
    let searchResults = this.state.searchResults ? this.state.searchResults : [];

    return (
      <div className="context-container" ref={this.containerRef}>
        <div className="editor-container">
          <div className="left"> {/* The text editor */}
            <PrismEditor tokenManager={this.tokenManager}
              setSelection={this.setSelection.bind(this)}
              setText={this.setText.bind(this)}
              lenseToHighlight={this.state.prismToHighlight}
              ref={this.editorRef}
              doSearch={this.doSearch.bind(this)}
              />
          </div>
          
          <div className="right"> { /* Everything on the right hand side of the screen */}
            <div className="lenses"> { /* A list of each active lense and a checkbox to activate/deactivate them */}
              <select title="add a lense" id="add-lense">
                {Object.entries(this.state.prisms).map(([name, lense]) => {
                  return <option key={lense.name} value={lense.name}>{lense.name}</option>;
                })}
              </select>
              {/* button that sets the selected lense to active */}
              <button className="selectButoon" onClick={this.handleAddPrism.bind(this)}>add</button>
              {/* <span id="selected" className="info">
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
              </span> */}
            </div>

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
                    key={prism.name}
                    tokenManager={this.tokenManager} 
                    prism={prism}
                    isSearching={prism.isSearching} 
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