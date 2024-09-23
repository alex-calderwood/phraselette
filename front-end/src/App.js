import "./App.css";
import React, { Component } from "react";

import { Prism } from "./base/prism/Prism";
import { initialPrisms, makePrism } from "./base/prism/prismCreator";
import { TokenManager } from "./base/TokenManager";
import { Document } from "./base/Document";
import { Constraint } from "./base/Constraint";

import { PrismEditor } from "./components/PrismEditor";
import { PrismView } from "./components/PrismView";
import { SearchResults } from "./components/SearchResults";
import ControlButtons from "./components/ControlButtons";
import InstructionsView from "./components/InstructionsView";
import PrismSelector from "./components/PrismSelector";

import { resolveConstraints } from "./scripts/resolution";
import { assignSocket } from "./scripts/socket";

import { RangeMap } from "./base/RangeMap";

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
const debugMode = true;

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
    console.log("app: initial prism to highlight", prismToHighlight);

    this.text = null;
    this.state = {
      prisms: prisms,
      activePrisms: activePrisms,
      prismToHighlight: prismToHighlight,
      tokens: Object.keys(this.tokenManager.tokens),
      selection: null,
      constraints: [],
      searchResults: new RangeMap(),
      isSearching: false,
      info: {},
    };

    window.state = this.state;

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
      let constraints = Constraint.subsetByFeatures(
        this.state.constraints,
        reader.features
      );
      console.log('reader: handleReaderResponse', {doc, reader, constraints});
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
    console.log("app: setting selection", selection);
    this.setState({ 
      selection: selection,
      start: selection.startTextIndex,
      end: selection.endTextIndex,
    });
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
  handleAddPrism(prismType) {
    const prism = makePrism(prismType, this.prismCallbacks);
    console.log("app: making prism", prism);

    // tell the editor it is active and should be the current highlighted prism
    prism.setActive(true);
    prism.setDoHighlight(true);
    this.onHighlightPrismChange(prism.id, true);

    // update the state
    let prisms = this.state.prisms;
    this.setState({
      prisms: { ...prisms, [prism.id]: prism },
      activePrisms: Prism.getActive({ ...prisms, [prism.id]: prism }),
    });

    // update the tokenManager
    this.tokenManager.setActivePrism(prism, true);

    // tokenize the text with the new lense
    this.attemptInitialTokenization();
  }

  handleRemovePrism(prism) {
    // update the tokenManager
    this.tokenManager.setActivePrism(prism, false);

    // update the state
    let prisms = this.state.prisms;
    delete prisms[prism.id]
    this.setState({
      prisms: { ...prisms, },
      activePrisms: Prism.getActive({ ...prisms, }),
    });

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
  async onSearchComplete(selectionRange) {
    console.log("app: search complete selection range", selectionRange);
    let constraints = this.state.constraints;
    let prisms = Prism.getActive(this.state.prisms);
    let predictions = prisms.map(
      (p) => p?.insights[selectionRange]?.results
    )
    .filter((r) => r && r.length > 0)
    .flat();

    let filteredPredictions = await resolveConstraints(
      predictions,
      constraints
    );

    this.setState(prevState => {
      const newSearchResults = prevState.searchResults.copy()
      newSearchResults[selectionRange] = filteredPredictions;
      return { searchResults: newSearchResults };
    });

    this.setSearchingState(false); // UI update
  }

  addConstraint(constraint) {
    this.setState({
      constraints: this.state.constraints.concat([constraint]),
    });
    console.log("app: adding constraint", constraint);
  }

  removeConstraint(constraint) {
    console.log("app: removing constraint", constraint);
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
  // swapToken(originalToken, newToken) {
  //   this.tokenManager.swapToken(originalToken, newToken);
  //   this.editorRef.current.swapText(
  //     originalToken.start,
  //     originalToken.end,
  //     newToken.text
  //   );
  // }

  /*
   * Handle the swapping of tokens in the editor (as when the user selects a token replacement in the sidebar).
   * First, we want to swap the tokens in the tokenManager.
   * Then, we want to change the text in the editor for the new token text.
   */
  swapSequence(oldTokens, newSequence) {
    if (oldTokens.length === 0 || !newSequence) {
      console.error("app: swapSequence called with old tokens", oldTokens, "new sequence", newSequence);
      return;
    }

    const start = oldTokens[0].start;
    const oldEnd = oldTokens[oldTokens.length - 1].end;
    const newEnd = start + newSequence.textContent.length - 1;
    console.log(
      "app: swapSequence to",
      newSequence,
      "from",
      oldTokens,
      'start',
      start,
      'newEnd',
      newEnd,
      'oldEnd',
      oldEnd,
    );

    // Get the new text from the sequence
    const newText = newSequence.textContent;

    // Update the tokenManager
    this.tokenManager.swapSequence(oldTokens, newSequence.span);

    // Update the editor text
    this.editorRef.current.swapText(start, oldEnd, newText);

    // Update the RangeMap
    this.updateRangeMapAfterSwap(start, oldEnd, newEnd);
  }

  // updateRangeMapAfterSwap(oldStart, oldEnd, newEnd) {
  //   console.log("openings: updating range map", 'start', oldStart, 'old end', oldEnd, 'new end', newEnd);
  //   this.setState(prevState => {
  //     const newSearchResults = prevState.searchResults.copy();
  //     newSearchResults.updateRange(oldStart, oldEnd, oldStart, newEnd);
  //     console.log('openings: old search results', prevState.searchResults, 'new results', newSearchResults)
  //     return { searchResults: newSearchResults };
  //   });
  // }

  updateRangeMapAfterSwap(oldStart, oldEnd, newEnd) {
    const lengthDiff = newEnd - oldEnd;
    
    this.setState(prevState => {
      const newSearchResults = prevState.searchResults.copy();
      
      // Update all ranges
      newSearchResults.allRanges().forEach(range => {
        if (range.start > oldStart) {
          // This range comes after the swap, shift it
          newSearchResults.updateRangeById(range.id, range.start + lengthDiff, range.end + lengthDiff);
        } else if (range.start === oldStart && range.end === oldEnd) {
          // This is the swapped range, update its end
          newSearchResults.updateRangeById(range.id, range.start, newEnd);

        }
        // Ranges that end before oldStart are unaffected
      });
  
      return { searchResults: newSearchResults };
    });
  }

  // Swap the highlighted text in the editor for a sequence in the suggestion set 
  handleSequenceClick = (newSequence) => {
    // Determine which prism type to use (e.g., 'words' or the first active prism)
    const prismType = this.state.activePrisms[0]?.type || 'words';
    
    // Retrieve the relevant tokens
    const oldTokens = this.state.start !== null ? this.tokenManager.tokensAt(prismType, this.state.start, this.state.end) : [];
  
    console.log('app: handling top-level click', oldTokens, newSequence);
    
    // Call swapSequence with the retrieved tokens and the clicked sequence
    this.swapSequence(oldTokens, newSequence);
  }

  updateOpenings = (changes) => {
    console.log("testing: app update openings changes", changes);
    this.setState(prevState => {
      const newSearchResults = prevState.searchResults.copy();

      console.log('testing: old ranges', prevState.searchResults.allRanges());
      
      changes.forEach(change => {
        newSearchResults.updateRanges(change);
        newSearchResults.allRanges().forEach(range => {
          console.log('testing: range after change', range.start, range.end);
        });
      });

      console.log('testing: new ranges', newSearchResults.allRanges());

      return { searchResults: newSearchResults };
    });
  }

  onKeyDown(event) {
    if (event.metaKey && event.key === "k") {
      return this.handleRetokenize();
    }

    if (event.metaKey && event.key === "'") {
      return this.handleSearch();
    }
  }

  onConstraintUpdate(prism, selectionRange) {
    let predictions = prism?.insights[selectionRange]?.results || [];
    let document = this._currentDocument(); // still don't love this
    let constraints = Constraint.subsetByFeatures(
      this.state.constraints,
      prism.features
    );
    console.log(
      "app: updating constraints",
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
    console.log('openings: handle search selection range', this.state.start, this.state.end);
    this.setState(prevState => {
      const newSearchResults = prevState.searchResults.copy();
      newSearchResults.set(this.state.start, this.state.end, []);
      console.log('openings: handle search reset results', newSearchResults, 'prev results', prevState.searchResults)
      return { searchResults: newSearchResults };
    });

    return this.editorRef.current?.manualSearchAction();
  };

  render() {
    let [start, end] = [this.state.start, this.state.end];
    let selectionText = this.state.selection ? this.state.selection.text : null;
    let localSearchResults = this.state.searchResults.get(start, end) || [];

    ({ start, end, localSearchResults, selectionText } = this.expandToOpening(start, end, localSearchResults, selectionText));

    const hasSelection = selectionText && selectionText.length > 0;
    const showSelection = debugMode && this.state.start !== null && this.state.end !== null;

    console.log("app: local search results", localSearchResults, 'all', this.state.searchResults, 'selection range', [start, end]);

    // openings are the ranges that are highlighted, that have active constraints or search results 
    const openings = this.state.searchResults.keys();

    const constraintSpan = {start, end};
    console.log()

    const activePrisms = Prism.getActive(this.state.prisms);
    window.activePrisms = activePrisms; // for debugging

    return (
      <div className="context-container" ref={this.containerRef}>
        <div className="editor-container rainbow">
          <div className="left">
            {/* The text editor */}
            <PrismEditor
              ref={this.editorRef}
              tokenManager={this.tokenManager}
              registerSelection={this.setSelection.bind(this)}
              setText={this.setText.bind(this)}
              prismToHighlight={this.state.prismToHighlight}
              doSearch={this.searchPrisms.bind(this)}
              updateOpenings={this.updateOpenings}
              openings={openings}
            />
          </div>

          <div className="right">
            {/* Everything on the right hand side of the screen */}
            {!hasSelection && (
              <div className={`inspector`}>
                <InstructionsView />
              </div>
            )}
            {hasSelection && (
              <div className={`inspector`}>
                {selectionText && selectionText.length > 0 ? (
                  <div className="selection-display glass-pane">{selectionText}</div>
                ) : (
                  ""
                )}
                {showSelection ? (
                  <div className="selection-info">
                    {start} - {end}
                  </div>
                ) : (
                  ""
                )}
                <ControlButtons
                  onRetokenize={this.handleRetokenize}
                  onSearch={this.handleSearch}
                />
                {/* Constrained search results */}
                <SearchResults
                  results={localSearchResults}
                  isSearching={this.state.isSearching}
                  wrap={false}
                  verticalLayout={true}
                  showLength={true}
                  onClickSequence={this.handleSequenceClick}
                />
                {/* Display the active prisms */}
                {activePrisms.map((prism) => {
                  let constraints = Constraint.subsetByFeatures(
                    this.state.constraints,
                    prism.features,
                    // constraintSpan,
                  ) // TODO we need to finish this port
                  console.log("app: rendering prism", prism.id, "with constraints", constraints, 'and span', constraintSpan, 'from all constraints', this.state.constraints);
                  return (
                    <PrismView
                      key={prism.id}
                      tokenManager={this.tokenManager}
                      prism={prism}
                      isSearching={prism.isSearching}
                      startIndex={start}
                      endIndex={end}
                      onClickSequence={this.handleSequenceClick}
                      debugMode={debugMode}
                      constraints={constraints}
                      addConstraint={this.addConstraint.bind(this)}
                      onRemovePrism={() => this.handleRemovePrism(prism)}
                      removeConstraint={this.removeConstraint.bind(this)}
                      onConstraintUpdate={this.onConstraintUpdate.bind(this)}
                    />
                  );
                })}
              </div>
            )}
            {/* End inspector */}

            <div className="lenses">
              <PrismSelector 
                prisms={this.state.prisms} 
                activePrisms={this.state.activePrisms}
                onAddPrism={this.handleAddPrism.bind(this)} 
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  expandToOpening(start, end, localSearchResults, selectionText) {
    if (this.state.searchResults.get(start, end) == undefined && start == end) {
      let enclosingRange = this.state.searchResults.findEnclosingRange(this.state.start);
      if (enclosingRange != undefined) {
        localSearchResults = enclosingRange.value;
        [start, end] = [enclosingRange.start, enclosingRange.end];
        selectionText = this.text.slice(start, end + 1);
      }
    }
    return { start, end, localSearchResults, selectionText};
  }
}

export default App;
