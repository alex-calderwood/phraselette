import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { reducer, initialState, currentInlet, activeWells, inletConstraints, tokensIn, wordAt } from '../state/store.js';
import { createActions } from '../state/actions.js';
import Editor from './Editor.jsx';
import WellBar from './WellBar.jsx';
import Inspector, { InletHeader } from './Inspector.jsx';
import Results from './Results.jsx';
import Tooltip from './Tooltip.jsx';

export default function Workspace({ session, onChangeModels }) {
  const [state, dispatch] = useReducer(reducer, null, initialState);
  const colorBy = 'origin'; // rephrasings are tinted by the well they came from
  const stateRef = useRef(state);
  stateRef.current = state;
  const editorRef = useRef(null);

  // Swaps replace the textarea's value programmatically, which breaks the
  // browser's own undo, so swaps keep their own history: ⌘Z / ⇧⌘Z step through it.
  const historyRef = useRef({ undo: [], redo: [] });
  const [historyLen, setHistoryLen] = useState([0, 0]);
  const bumpHistory = () => setHistoryLen([historyRef.current.undo.length, historyRef.current.redo.length]);

  const actions = useMemo(() => {
    const a = createActions(dispatch, () => stateRef.current, session);
    // swapping text lives here because it needs the textarea
    a.swap = (inlet, seq) => {
      const s = stateRef.current;
      const before = s.text.slice(0, inlet.start);
      const after = s.text.slice(inlet.end);
      const newText = before + seq.text + after;
      historyRef.current.undo.push({ before: s.text, after: newText, sel: [inlet.start, inlet.start + seq.text.length] });
      historyRef.current.redo = [];
      bumpHistory();
      a.setText(newText);
      const ta = editorRef.current;
      if (ta) {
        requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(inlet.start, inlet.start + seq.text.length); a.setSelection(inlet.start, inlet.start + seq.text.length); });
      } else {
        a.setSelection(inlet.start, inlet.start + seq.text.length);
      }
    };
    return a;
  }, [session]);

  useEffect(() => { actions.init(); }, [actions]);

  const restore = (text, sel) => {
    actions.setText(text);
    const ta = editorRef.current;
    requestAnimationFrame(() => { if (ta) { ta.focus(); ta.setSelectionRange(sel[0], sel[1]); } actions.setSelection(sel[0], sel[1]); });
  };
  /** Undo the last swap if the text still reflects it; otherwise let the browser handle ⌘Z. */
  const undoSwap = useCallback(() => {
    const h = historyRef.current;
    const last = h.undo[h.undo.length - 1];
    if (!last || stateRef.current.text !== last.after) return false;
    h.undo.pop(); h.redo.push(last); bumpHistory();
    restore(last.before, [last.sel[0], last.sel[0]]);
    return true;
  }, [actions]);
  const redoSwap = useCallback(() => {
    const h = historyRef.current;
    const last = h.redo[h.redo.length - 1];
    if (!last || stateRef.current.text !== last.before) return false;
    h.redo.pop(); h.undo.push(last); bumpHistory();
    restore(last.after, last.sel);
    return true;
  }, [actions]);
  if (import.meta.env.DEV && typeof window !== 'undefined') window.__state = state;

  const inlet = currentInlet(state);
  const { start, end } = state.selection;
  const hasSelection = end > start;
  const selectionText = state.text.slice(start, end);
  const wells = activeWells(state);
  const highlightWell = state.wells.find((w) => w.id === state.highlightWellId);
  const caretWord = !inlet && !hasSelection ? wordAt(state.tokens, start) : null;
  const range = inlet ?? (hasSelection ? { start, end } : caretWord ? { start: caretWord.start, end: caretWord.end } : null);
  const inletTokens = range ? tokensIn(state.tokens, range.start, range.end) : [];
  const rangeText = range ? state.text.slice(range.start, range.end).replace(/^[ \t]+/, '') : '';
  const cons = inlet ? inletConstraints(state, inlet.id) : [];
  const setTooltip = useCallback((t) => dispatch({ type: 'tooltip', tooltip: t }), []);

  /** Search: make an inlet from the selection (or the word under the caret) if there is none, then run every well. */
  const search = useCallback(() => {
    const s = stateRef.current;
    let target = currentInlet(s);
    if (!target) {
      let { start: a, end: b } = s.selection;
      if (b <= a) {
        const w = wordAt(s.tokens, a);
        if (!w) return null;
        a = w.start; b = w.end;
      }
      target = actions.createInlet(a, b);
    }
    if (target) actions.runWells(target);
    return target;
  }, [actions]);

  // ⌘/Ctrl + Enter = Search · ⌘Z / ⇧⌘Z step through swaps (falls through to the browser otherwise)
  useEffect(() => {
    const onKey = (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === 'Enter') { e.preventDefault(); search(); return; }
      if (mod && (e.key === 'z' || e.key === 'Z')) {
        const handled = e.shiftKey ? redoSwap() : undoSwap();
        if (handled) e.preventDefault();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [search, undoSwap, redoSwap]);

  const results = inlet ? state.results[inlet.id] : null;
  const anySearching = inlet ? (state.searching[inlet.id] ?? []).length > 0 : false;

  return (
    <div className="workspace rainbow">
      <Tooltip tooltip={state.tooltip} />
      <div className="topbar glass">
        {range ? (
          <>
            <InletHeader state={state} inlet={inlet} rangeText={rangeText} inletTokens={inletTokens} onSearch={null} actions={actions} setTooltip={setTooltip} />
            {inlet && (results || anySearching) && (
              <Results results={results} searching={anySearching} constraints={cons} onPick={(seq) => actions.swap(inlet, seq)} setTooltip={setTooltip} colorBy={colorBy} />
            )}
          </>
        ) : (
          <div className="topbar-empty">
            {state.inlets.length
              ? 'Click inside an inlet in the editor to see its rephrasings here.'
              : 'Click a word or highlight a phrase in the editor, then press Search.'}
          </div>
        )}
      </div>
      <div className="columns">
        <div className="left">
          <Editor
            text={state.text}
            tokens={state.tokens}
            probTokens={state.probTokens}
            inlets={state.inlets}
            highlightType={highlightWell?.active ? highlightWell.type : null}
            range={range}
            isInlet={!!inlet}
            searching={anySearching}
            onSearch={search}
            onRemoveInlet={() => inlet && actions.deleteInlet(inlet.id)}
            onText={actions.setText}
            onSelection={actions.setSelection}
            editorRef={editorRef}
          />
          <div className="editor-controls">
            <span className="status">
              {state.probPending ? 'scoring words…' : ''}
              {state.notice ?? ''}
            </span>
            <button disabled={!historyLen[0]} title="undo last swap (⌘Z)" onClick={undoSwap}>↶ undo swap{historyLen[0] ? ` (${historyLen[0]})` : ''}</button>
            <button disabled={!historyLen[1]} title="redo swap (⇧⌘Z)" onClick={redoSwap}>↷</button>
            <button onClick={onChangeModels}>models…</button>
            <button onClick={() => { if (confirm('Clear the text?')) actions.setText(''); }}>clear</button>
          </div>
        </div>
        <div className="right">
          <WellBar
            searchButton={(
              <button className={`search-button ${anySearching ? 'busy' : ''}`} disabled={!range} onClick={search} title={inlet ? 'Run every well again on this inlet (⌘↵)' : range ? 'Open this phrase as an inlet and run every well (⌘↵)' : 'select a phrase first'}>
                <span className="search-icon" aria-hidden="true">🖌️</span>
                <span>{anySearching ? 'Searching…' : 'Search'}</span>
                <kbd>⌘↵</kbd>
              </button>
            )}
            wells={state.wells}
            highlightWellId={state.highlightWellId}
            onAdd={actions.addWell}
            onRemove={actions.removeWell}
            onHighlight={actions.highlight}
            inlet={inlet}
            inletTokens={inletTokens}
            constraints={cons}
            onAddConstraint={actions.addConstraint}
            onRemoveConstraint={actions.removeConstraint}
          />
          <Inspector
            state={state}
            session={session}
            inlet={inlet}
            rangeText={rangeText}
            hasRange={!!range}
            wells={wells}
            inletTokens={inletTokens}
            inletConstraints={cons}
            actions={actions}
            setTooltip={setTooltip}
            onSearch={search}
            colorBy={colorBy}
          />
        </div>
      </div>
    </div>
  );
}
