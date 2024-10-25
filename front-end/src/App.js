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
import { PrismBar } from "./components/PrismBar";
import { Tooltip } from "./components/Tooltip";
import { Modal } from "./components/Modal";
import { EVENT_NAMES } from './base/Logging';

import { resolveConstraints } from "./scripts/resolution";
import { assignSocket, registerHandlers, sendEventstoServer } from "./scripts/socket";

import { RangeMap } from "./base/RangeMap";
import { ChangeType, TextChange } from "./base/TextChange";

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

    this.text = null;
    this.state = {
      prisms: prisms,
      activePrisms: activePrisms,
      prismToHighlight: prismToHighlight,
      tokens: Object.keys(this.tokenManager.tokens),
      selection: null,
      constraints: [],
      openings: new RangeMap(),
      isSearching: {},
      start: 0,
      end: 0,
      localResults: [],
      opening: undefined,
      showModal: true,
      userData: null,
      events: [],
    };

    window.state = this.state;

    this.editorRef = React.createRef();
    this.containerRef = React.createRef();

    // wire up websocket connection to server, should prob not be done in a component...
    const loc = window.location;
    const socketProtocol = { "http:": "ws", "https:": "wss" }[loc.protocol];

    function handleThesResponse(msg) {
      let thesaurus = Prism.getByID(this.state.prisms, msg.prism);
      let constraints = this.state.constraints;
      // let constraints = Constraint.subsetByFeatures(
      //   this.state.constraints,
      //   thesaurus.features
      // );
      let opening = this.state.openings.findRangeById(msg.opening);
      let doc = this._currentDocument().updateToOpening(opening);
      // console.log('thesaurus: handleThesResponse', {doc, thesaurus, constraints, opening});
      thesaurus.onSearchResults(opening, { message: msg }, doc, constraints);
    }

    function handleReaderResponse(msg) {
      let reader = Prism.getByID(this.state.prisms, msg.prism);
      let constraints = this.state.constraints;
      // let constraints = Constraint.subsetByFeatures(
      //   this.state.constraints,
      //   reader.features
      // );
      let opening = this.state.openings.findRangeById(msg.opening);
      let doc = this._currentDocument().updateToOpening(opening);
      // console.log('reader: handleReaderResponse', {doc, reader, constraints, opening});
      reader.onSearchResults(opening, { message: msg }, doc, constraints);
    }

    function handleDictionaryResponse(msg) {
      let dict = Prism.getByID(this.state.prisms, msg.prism);
      let constraints = this.state.constraints;
      // let constraints = Constraint.subsetByFeatures(
      //   this.state.constraints,
      //   dict.features
      // );
      let opening = this.state.openings.findRangeById(msg.opening);
      let doc = this._currentDocument().updateToOpening(opening);
      dict.onSearchResults(opening, { message: msg }, doc, constraints);
    }

    registerHandlers({
      thesaurusResponse: handleThesResponse.bind(this),
      readerResponse: handleReaderResponse.bind(this),
      dictionaryResponse: handleDictionaryResponse.bind(this),
    });

    assignSocket(
      socketProtocol,
      loc.host + "/" + loc.hash.replace("#", "?")
    );
  }

  componentDidMount() {
    // Figure out which lense to initially higihlight // not really used at the moment, would love to get it back up
    let highlightPrismID = Object.keys(this.state.prisms).filter((key) => {
      return this.state.prisms[key].shouldHighlight;
    });
    highlightPrismID = highlightPrismID.length > 0 ? highlightPrismID[0] : null;
    if (highlightPrismID) {
      this.onHighlightPrismChange(highlightPrismID, true);
    }

    // Add top level keystroke listeners
    document.addEventListener("keydown", this.onKeyDown.bind(this));

    // Show modal on page refresh
    window.addEventListener('beforeunload', this.handleBeforeUnload);
  }

  componentWillUnmount() {
    document.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener('beforeunload', this.handleBeforeUnload);
  }


  handleBeforeUnload = () => { 
    this.setState({ showModal: true }) 
  };

  addEvent = (newEvent, sendEvents=true) => { // note this should be set to false except at the end
    this.setState((prevState) => {
      const updatedEvents = [...prevState.events, newEvent];

      if (sendEvents) {
        console.log("send log data to server...");
        sendEventstoServer(newEvent, prevState.userData, this.state);
      }

      return {
        events: updatedEvents,
      }
    });
  }

  /*
   * Called when the user selects new text.
   */
  setSelection(selection) {
    let [start, end] = [selection.startTextIndex, selection.endTextIndex];
    let selectionText = this.state.selection ? this.state.selection.text : null;
    let localResults = [];
    let opening = null;
    ({start, end, localResults, selectionText, opening} = this.expandToOpening(start, end, localResults, opening));

    console.log("app: setting selection", {selection, start, end, selectionText, localResults, opening});

    this.setState({
      selection: selection,
      selectionText: selectionText,
      start: start,
      end: end,
      localResults: localResults,
      opening: opening,
      tooltipState: {}
    });
  }

  setSearchingState(openingID, isSearching) {
    this.setState({
      isSearching: { ...this.state.isSearching, [openingID]: isSearching },
    });
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

    // tell the prism it's not active
    prism.active = false;

    // update the state
    // let prisms = this.state.prisms;
    // delete prisms[prism.id]
    let newActive = Prism.getActive({ ...this.state.prisms, });
    delete newActive[prism.id];
    this.setState({
      // prisms: { ...prisms, },
      activePrisms: newActive,
    });


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
  async searchPrisms(prisms, opening, document) {
    this.setSearchingState(opening.id, true); // UI update
    let constraints = this.state.constraints;

    console.log("constraints: searchPrismsConstratins", constraints)

    if (opening == null) {
      console.error("app: no opening found for search");
      return;
    }

    for (let prism of prisms) {
      prism.search(opening, document, constraints);
    }
  }

  // async searchOnePrism(prism, opening, document) {
  //   this.setSearchingState(opening.id, true); // UI update
  //   let constraints = this.state.constraints;
  //   prism.search(opening, document, constraints);
  // }

  /*
   * A callback that is triggered when a prism finishes its .search() operation
   */
  async onSearchComplete(opening) {
    let constraints = this.state.constraints;
    let prisms = Prism.getActive(this.state.prisms);
    let predictions = prisms.map(
      (p) => p?.insights[opening.id]?.results
    ).filter((r) => r && r.length > 0)
    .flat();

    let filteredPredictions = await resolveConstraints(
      predictions,
      constraints,
      opening
    );

    this.setState(prevState => {
      const newOpenings = prevState.openings.copy();
      newOpenings.setById(opening.id, filteredPredictions); // Don't I want this to be the filtered ones?

      return { 
        openings: newOpenings,
        localResults: filteredPredictions
      };
    });

    console.log('app: search complete', opening, 'search results', filteredPredictions);
    this.setSearchingState(opening.id, false); // UI update
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

    // Update the tokenManager TODO should use the range logic...
    this.tokenManager.swapSequence(oldTokens, newSequence.span);

    // Update the editor text
    this.editorRef.current.swapText(start, oldEnd, newText);

    this.updateOpeningsAfterSwap(start, oldEnd, newEnd, newText);
  }

  updateOpeningsAfterSwap(oldStart, oldEnd, newEnd, newText) {
    const lengthDiff = newEnd - oldEnd;

    this.setState(prevState => {
      const newOpenings = prevState.openings.copy();
      
      newOpenings.allRanges().forEach(opening => {
        if (opening.start > oldStart) {
          // This range comes after the swap, shift it
          newOpenings.updateRangeById(opening.id, opening.start + lengthDiff, opening.end + lengthDiff);
        } else if (opening.start === oldStart && opening.end === oldEnd) {
          // This is the swapped range, update its end
          newOpenings.updateRangeById(opening.id, opening.start, newEnd);
        }  // Ranges that end before oldStart are unaffected
      });
  
      return { openings: newOpenings };
    });
  }

  // Swap the highlighted text in the editor for a sequence in the suggestion set 
  handleSequenceClick = (newSequence) => {
    // Determine which prism type to use (e.g., 'words' or the first active prism)
    const prismType = this.state.activePrisms[0]?.type || 'words';
    
    // Retrieve the relevant tokens
    const oldTokens = this.state.start !== null ? this.tokenManager.tokensAt(prismType, this.state.start, this.state.end) : [];
  
    console.log("todo are these tokens right?", oldTokens);
    console.log('app: handling top-level click', {oldTokens, newSequence});
    
    // Call swapSequence with the retrieved tokens and the clicked sequence
    this.swapSequence(oldTokens, newSequence);

    this.addEvent({
      eventName: EVENT_NAMES.Swap,
      timestamp: Date.now(),
      eventDetails: {
        userId: this.state.userData?.userId,
        from: oldTokens,
        to: newSequence
      }
    });
  }

  updateOpenings = (changes) => {
    this.setState(prevState => {
      const newSearchResults = prevState.openings.copy();
      
      changes.forEach(change => {
        newSearchResults.updateRanges(change);
      });

      return { openings: newSearchResults };
    });
  }

  onKeyDown(event) {
    if (event.metaKey && event.key === "k") {
      return this.handleRetokenize();
    }

    if (event.metaKey && event.key === "'") {
      return this.triggerSearchAll();
    }
  }

  onConstraintUpdate(prism, opening) {
    let predictions = prism?.insights[opening.id]?.results || [];
    let document = this._currentDocument().updateToOpening(opening);
    // alex do the subsetting now
    // let constraints = Constraint.subsetByFeatures( // why are we subsetting?
    //   this.state.constraints,
    //   prism.features
    // );
    let constraints = this.state.constraints;
    console.log(
      "app: updating constraints",
      {
        opening,
        predictions,
        document,
        constraints,
        prism,
        insights: prism?.insights
      }
    );
    prism.onSearchResults(opening, { predictions: predictions }, document, constraints);
  }

  handleRetokenize = () => {
    return this.editorRef.current?.manualRetokenizeAction();
  };

  triggerSearch = (prisms, doReset) => {
    console.log('app: handle search selection range', this.state.start, this.state.end);

    if (this.state.start === null || this.state.end === null || this.state.start === this.state.end) {
      console.error("app: not supporting search with no selection or single letter");
      return;
    }

    let opening = null;
    this.setState(prevState => {
      const newOpenings = prevState.openings.copy();

      let resetTo = [];
      if (!doReset) {
        let oldResult = newOpenings.get(this.state.start, this.state.end);
        resetTo = oldResult != null ? oldResult : [];
      }

      opening = newOpenings.set(this.state.start, this.state.end, resetTo, true); // create a new opening or reset what is there
      console.log('app: handle search reset results', newOpenings, 'prev results', prevState.openings);
      return {
        opening: opening,
        openings: newOpenings 
      };
    },
    () => { // After the state updates, trigger the search
      return this.editorRef.current?.manualSearchAction(prisms, opening);
    });
  };

  triggerSearchAll = () => {
    let prisms = Prism.getActive(this.state.prisms);
    this.triggerSearch(prisms, true);
  }

  triggerSingleSearch = (prism) => {
    this.triggerSearch([prism], false);
  }

  deleteOpening = () => {
    let toDelete = this.state.opening?.id;

    if (toDelete == null) {
      console.warn("app: no opening to delete");
      return;
    }

    this.setState(prevState => {
      const newOpenings = prevState.openings.copy();
      newOpenings.deleteById(toDelete)
      return {
        opening: undefined,
        openings: newOpenings,
        localResults: [],
      }
    })
  }

  handleTooltipUpdate = (newState) => {
    this.setState(
      {tooltipState: {
        content: newState?.content,
        position: newState?.position,
        options: newState?.options
      }});
  };

  handleModalSubmit = (data) => {
    this.setState({
      userData: data,
      showModal: false,
    })
    console.log('userData:', data)
  };

  /*
   * If the current selection is within a larger opening, use that opening.
  */
  expandToOpening(start, end, localResults, opening) {
    if (start == end) {
      opening = this.state.openings.findEnclosingRange(start);
    } else {
      opening = this.state.openings.findExactRange(start, end);
    }

    if (opening == undefined) {
      localResults = [];
    } else {
      localResults = opening.value;
      [start, end] = [opening.start, opening.end];
    }

    let selectionText = this.text.slice(start, end + 1);

    return { start, end, localResults: localResults, selectionText, opening};
  }

  render() {
    if (this.state.showModal) {
      return <Modal onSubmit={this.handleModalSubmit} addEvent={this.addEvent} eventName={EVENT_NAMES.StudyStarted} />;
    }

    let [start, end] = [this.state.start, this.state.end];
    let selectionText = this.state.selectionText;
    let localResults = this.state.localResults;
    let opening = this.state.opening;
    let openings = this.state.openings;

    const hasSelection = selectionText && selectionText.length > 0;
    const showSelection = debugMode && this.state.start !== null && this.state.end !== null;

    const activePrisms = Prism.getActive(this.state.prisms);
    window.activePrisms = activePrisms; // for debugging

    const renderData = {start, end, selectionText, localResults, opening}
    window.renderData = renderData;
    window.state = this.state;

    return (
      <div className="context-container" ref={this.containerRef}>
        <Tooltip
          content={this.state.tooltipState?.content}
          position={this.state.tooltipState?.position}
          options={this.state.tooltipState?.options}
        />
        <div className="editor-container rainbow">
          <div className="left">
            {/* The text editor */}
            <PrismEditor
              ref={this.editorRef}
              tokenManager={this.tokenManager}
              registerSelection={this.setSelection.bind(this)}
              setText={this.setText.bind(this)}
              prismToHighlight={this.state.prismToHighlight}
              searchPrisms={this.searchPrisms.bind(this)}
              updateOpenings={this.updateOpenings}
              openings={openings}
              // opening={opening} 
              // document={document} // could send these in if needed
            />
          </div>

          <div className="right">  {/* Everything on the right hand side of the screen */}
            <div className="lenses">
              <PrismBar
                prisms={this.state.prisms} 
                activePrisms={this.state.activePrisms}
                onAddPrism={this.handleAddPrism.bind(this)}
                onTooltipUpdate={this.handleTooltipUpdate}
                onRemovePrism={this.handleRemovePrism.bind(this)}
                />
            </div>

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
                    onSearch={this.triggerSearchAll}
                    onDelete={this.deleteOpening}
                    opening={opening}
                  />
                  {/* Constrained search results */}
                  <SearchResults
                    results={localResults}
                    isSearching={this.state.isSearching[opening?.id]}
                    extraPadding={true}
                    wrap={false}
                    verticalLayout={true}
                    showLength={true}
                    onClickSequence={this.handleSequenceClick}
                    onTooltipUpdate={this.handleTooltipUpdate}
                  />
                  {/* Display the active prisms */}
                  {activePrisms.map((prism) => {
                    let constraints = Constraint.subsetByFeatures(
                      this.state.constraints,
                      prism.features,
                      opening,
                      true,
                    )

                    return (
                      <PrismView
                        key={prism.id}
                        tokenManager={this.tokenManager}
                        prism={prism}
                        isSearching={prism.isSearching}
                        startIndex={start}
                        endIndex={end}
                        opening={opening}
                        constraints={constraints}
                        onSearch={() => this.triggerSingleSearch(prism)}
                        onClickSequence={this.handleSequenceClick}
                        onConstraintUpdate={this.onConstraintUpdate.bind(this)}
                        onRemovePrism={() => this.handleRemovePrism(prism)}
                        addConstraint={this.addConstraint.bind(this)}
                        removeConstraint={this.removeConstraint.bind(this)}
                        debugMode={debugMode}
                        onTooltipUpdate={this.handleTooltipUpdate}
                      />
                    );
                  })}
                </div>
              )}
              {/* End inspector */}

          </div>
        </div>
      </div>
    );
  }
}

export default App;
