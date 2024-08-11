import "./App.css";
import React, { Component } from "react";

import { Prism } from "./base/prism/Prism";
import { initialPrisms, makePrism } from "./base/prism/prismCreator";
import { TokenManager } from "./base/TokenManager";
import { Document } from "./base/Document";
import { Constraint } from "./base/Constraint";

import { WordView } from "./components/WordView";
import { PrismEditor } from "./components/PrismEditor";
import { PrismView } from "./components/PrismView";
import { SearchResults } from "./components/SearchResults";
import ControlButtons from "./components/ControlButtons";
import InstructionsView from "./components/InstructionsView";

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

const initialPrismType = "words";
const debugMode = false;

class App extends Component {
  constructor(props) {
    super(props);

    this.prismCallbacks = {
      onSearchComplete: this.onSearchComplete.bind(this),
    };
    let prisms = initialPrisms(this.prismCallbacks);

    let activePrisms = Prism.getActive(prisms);
    this.tokenManager = new TokenManager(activePrisms);
    window.tokenManager = this.tokenManager; // for debugging
    let prismToHighlight = Prism.getByType(activePrisms, initialPrismType);
    console.log("initial prism to highlight", prismToHighlight);

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
    const socketProtocol = { "http:": "ws", "https:": "wss" }[loc.protocol];

    function handleDictResponse(msg) {
      let doc = this._currentDocument();
      let dictPrism = Prism.getByID(this.state.prisms, msg.prism);
      let constraints = Constraint.subsetByFeatures(
        this.state.constraints,
        dictPrism.features
      );
      dictPrism.onSearchResults({ message: msg }, doc, constraints);
    }

    function handleReaderResponse(msg) {
      let doc = this._currentDocument();
      let reader = Prism.getByID(this.state.prisms, msg.prism);
      console.log("reader prism", reader, this.state.prisms, msg);
      let constraints = Constraint.subsetByFeatures(
        this.state.constraints,
        reader.features
      );
      reader.onSearchResults({ message: msg }, doc, constraints);
    }

    let handlers = {
      thesaurusResponse: handleDictResponse.bind(this),
      readerResponse: handleReaderResponse.bind(this),
    };
    assignSocket(
      socketProtocol,
      loc.host + "/" + loc.hash.replace("#", "?"),
      handlers
    );
  }

  /*
   * Called when the user selects new text.
   */
  setSelection(selection) {
    console.log("app selection", selection);
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
    const selectedPrismType = document.getElementById("add-lense").value;
    const prism = makePrism(selectedPrismType, this.prismCallbacks);
    console.log("making prism", prism);

    // tell the editor it is active and should be the current highlighted prism
    prism.setActive(true);
    prism.setDoHighlight(true);
    this.onHighlightPrismChange(prism.id, true);

    // update the state
    let prisms = this.state.prisms;
    this.setState({
      prisms: { ...prisms, [prism.id]: prism },
      activePrisms: Prism.getActive(prisms),
    });

    // update the tokenManager
    this.tokenManager.setActivePrism(prism, true);

    // tokenize the text with the new lense
    this.attemptInitialTokenization();
  }

  // Initialize the uninitialized
  componentDidMount() {
    // Figure out which lense to initially higihlight
    let highlightPrismID = Object.keys(this.state.prisms).filter((key) => {
      return this.state.prisms[key].shouldHighlight;
    });
    highlightPrismID = highlightPrismID.length > 0 ? highlightPrismID[0] : null;
    if (highlightPrismID) {
      this.onHighlightPrismChange(highlightPrismID, true);
    }

    // Add top level keystroke listeners
    document.addEventListener("keydown", this.onKeyDown.bind(this));
  }

  componentWillUnmount() {
    document.removeEventListener("keydown", this.onKeyDown);
  }

  onHighlightPrismChange(prismID, shouldHighlight) {
    // for now, we only allow one highlighted lense, so we need to uncheck all the other ones
    let prisms = Prism.getActive(this.state.prisms);
    let toHighlight = null;
    for (let prism of prisms) {
      if (prism.id === prismID) {
        prism.setDoHighlight(shouldHighlight);
        toHighlight = prism;
      } else {
        prism.setDoHighlight(false);
      }
    }

    // console.log('on highlight change', prismID, shouldHighlight, prisms, toHighlight);

    this.setState({ prismToHighlight: prismID });
  }

  /*
   * Saearch for alternate words using each prism.
   */
  async searchPrisms(doc) {
    this.setSearchingState(true); // UI update

    let constraints = this.state.constraints;
    let prisms = Prism.getActive(this.state.prisms);

    for (let prism of prisms) {
      prism.search(doc, constraints);
      // prism.search(doc, [])
    }
  }

  /*
   * A callback that is triggered when a prism finishes its .search() operation
   */
  async onSearchComplete() {
    let constraints = this.state.constraints;
    let prisms = Prism.getActive(this.state.prisms);
    let predictions = prisms
      .map((p) => p?.insights?.results)
      .filter((r) => r && r.length > 0)
      .flat();
    let filteredPredictions = await resolveConstraints(
      predictions,
      constraints
    );
    this.setState({ searchResults: filteredPredictions });
    this.setSearchingState(false); // UI update
  }

  addConstraint(constraint) {
    this.setState({
      constraints: this.state.constraints.concat([constraint]),
    });
    console.log("adding constraint", constraint);
  }

  removeConstraint(constraint) {
    console.log("removing constraint", constraint);
    this.setState({
      constraints: this.state.constraints.filter((c) => {
        return c !== constraint;
      }),
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
    this.editorRef.current.swapText(
      originalToken.start,
      originalToken.end,
      newToken.text
    );
  }

  swapSequence(oldTokens, newSequence) {
    // Calculate the start and end positions
    if (oldTokens.length === 0 || !newSequence) {
      console.error("swapSequence called with", oldTokens, newSequence);
      return;
    }

    const start = oldTokens[0].start;
    const end = oldTokens[oldTokens.length - 1].end;
    console.log(
      "app swapSequence for",
      newSequence,
      "from",
      oldTokens,
      start,
      end
    );

    // Get the new text from the sequence
    const newText = newSequence.textContent;

    // Update the tokenManager
    this.tokenManager.swapSequence(oldTokens, newSequence.span);

    // Update the editor text
    this.editorRef.current.swapText(start, end, newText);
  }

  onKeyDown(event) {
    if (event.metaKey && event.key === "k") {
      return this.handleRetokenize();
    }

    if (event.metaKey && event.key === "'") {
      return this.handleSearch();
    }
  }

  onConstraintUpdate(prism) {
    let predictions = prism?.insights?.results || [];
    let document = this._currentDocument(); // still don't love this
    let constraints = Constraint.subsetByFeatures(
      this.state.constraints,
      prism.features
    );
    console.log(
      "updating constraints in app",
      predictions,
      document,
      constraints
    );
    prism.onSearchResults({ predictions: predictions }, document, constraints);
  }

  handleRetokenize = () => {
    return this.editorRef.current?.manualRetokenizeAction();
  };

  handleSearch = () => {
    return this.editorRef.current?.manualSearchAction();
  };

  render() {
    let startIndex = this.state.selection
      ? this.state.selection.startIndex
      : null;
    let endIndex = this.state.selection ? this.state.selection.endIndex : null;
    let selectionText = this.state.selection ? this.state.selection.text : null;

    const hasSelection = selectionText && selectionText.length > 0;
    let showSelection = debugMode && startIndex !== null && endIndex !== null;

    let activePrisms = Prism.getActive(this.state.prisms);
    window.activePrisms = activePrisms; // for debugging

    // get the prism that represents word breaks
    let wordsPrism = Prism.firstByType(
      this.state.prisms,
      this.tokenManager.wordsPrism
    );
    let searchResults = this.state.searchResults
      ? this.state.searchResults
      : [];

    return (
      <div className="context-container" ref={this.containerRef}>
        <div className="editor-container">
          <div className="left">
            {/* The text editor */}
            <PrismEditor
              tokenManager={this.tokenManager}
              setSelection={this.setSelection.bind(this)}
              setText={this.setText.bind(this)}
              prismToHighlight={this.state.prismToHighlight}
              ref={this.editorRef}
              doSearch={this.searchPrisms.bind(this)}
            />
          </div>

          <div className="right">
            {/* Everything on the right hand side of the screen */}
            {!hasSelection && (
              <div className={`inspector`}>
                <ControlButtons
                  onRetokenize={this.handleRetokenize}
                  onSearch={this.handleSearch}
                />
                <InstructionsView />
              </div>
            )}
            {hasSelection && (
              <div className={`inspector`}>
                {selectionText && selectionText.length > 0 ? (
                  <div className="selection-display">"{selectionText}"</div>
                ) : (
                  ""
                )}
                {showSelection ? (
                  <div className="selection-info">
                    {startIndex} - {endIndex}
                  </div>
                ) : (
                  ""
                )}
                <ControlButtons
                  onRetokenize={this.handleRetokenize}
                  onSearch={this.handleSearch}
                />
                {/* Display the selected span and some info about it */}
                {/* <WordView
                key={"wordslense"}
                tokenManager={this.tokenManager} 
                wordsPrism={wordsPrism}
                startIndex={startIndex} endIndex={endIndex} 
                onSwapToken={(originalToken, newToken) => { this.swapToken(originalToken, newToken)}}
                debugMode={debugMode}
              /> */}
                {/* Constrained search results */}
                <SearchResults
                  results={searchResults}
                  isSearching={this.state.isSearching}
                  wrap={false}
                  showLength={true}
                  onClickSequence={(oldS, newS) => {
                    this.swapSequence(oldS, newS);
                  }}
                />
                {/* onClickSequence={this.onClickSequence.bind(this)} /> */}
                {/* Display the active prisms */}
                {activePrisms.map((prism) => {
                  console.log("rendering", prism.id);
                  return (
                    <PrismView
                      key={prism.id}
                      tokenManager={this.tokenManager}
                      prism={prism}
                      isSearching={prism.isSearching}
                      startIndex={startIndex}
                      endIndex={endIndex}
                      onSwapSequence={this.swapSequence.bind(this)}
                      debugMode={debugMode}
                      constraints={Constraint.subsetByFeatures(
                        this.state.constraints,
                        prism.features
                      )}
                      addConstraint={this.addConstraint.bind(this)}
                      removeConstraint={this.removeConstraint.bind(this)}
                      onConstraintUpdate={this.onConstraintUpdate.bind(this)}
                    />
                  );
                })}
              </div>
            )}
            {/* End inspector */}

            <div className="lenses">
              {/* A list of each active lense and a checkbox to activate/deactivate them */}
              <select title="add a lense" id="add-lense">
                {Object.values(Prism.TYPES).map((prismType) => {
                  return (
                    <option key={prismType} value={prismType}>
                      {prismType}
                    </option>
                  );
                })}
              </select>
              {/* button that sets the selected lense to active */}
              <button
                className="selectButoon"
                onClick={this.handleAddPrism.bind(this)}
              >
                add
              </button>
              {/* 
                let shouldHighlight = prism.shouldHighlight;
                let onHighlightPrismChange = this.onHighlightPrismChange.bind(this)
                return <ActivePrismIndicator 
                          key={prism.id} 
                          prism={prism} 
                          shouldHighlight={shouldHighlight}
                          onHighlightPrismChange={onHighlightPrismChange}>{prism.id}</ActivePrismIndicator> */}
            </div>
          </div>
        </div>
      </div>
    );
  }
}

export default App;
