import React, { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { reducer, initialState, currentInlet, activeWells, inletConstraints, tokensIn, wordAt } from '../state/store.js';
import { createActions } from '../state/actions.js';
import Editor from './Editor.jsx';
import WellBar from './WellBar.jsx';
import Inspector, { InletHeader } from './Inspector.jsx';
import Results from './Results.jsx';
import { COLOR_MODES } from './TokenRange.jsx';
import Tooltip from './Tooltip.jsx';

export default function Workspace({ session, onChangeModels }) {
  const [state, dispatch] = useReducer(reducer, null, initialState);
  const [colorBy, setColorBy] = React.useState(() => { try { return localStorage.getItem('phraselette.colorBy') || 'origin'; } catch { return 'origin'; } });
  const chooseColorBy = (id) => { setColorBy(id); try { localStorage.setItem('phraselette.colorBy', id); } catch { /* ignore */ } };
  const stateRef = useRef(state);
  stateRef.current = state;
  const editorRef = useRef(null);

  const actions = useMemo(() => {
    const a = createActions(dispatch, () => stateRef.current, session);
    // swapping text lives here because it needs the textarea
    a.swap = (inlet, seq) => {
      const s = stateRef.current;
      const before = s.text.slice(0, inlet.start);
      const after = s.text.slice(inlet.end);
      const newText = before + seq.text + after;
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

  // ⌘/Ctrl + Enter = Search
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); search(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [search]);

  const results = inlet ? state.results[inlet.id] : null;
  const anySearching = inlet ? (state.searching[inlet.id] ?? []).length > 0 : false;

  return (
    <div className="workspace rainbow">
      <Tooltip tooltip={state.tooltip} />
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
            onText={actions.setText}
            onSelection={actions.setSelection}
            editorRef={editorRef}
          />
          <div className="editor-controls">
            <span className="status">
              {state.probPending ? 'scoring words…' : ''}
              {state.notice ?? ''}
            </span>
            <button onClick={onChangeModels}>models…</button>
            <button onClick={() => { if (confirm('Clear the text?')) actions.setText(''); }}>clear</button>
          </div>
        </div>
        <div className="right">
          <WellBar
            wells={state.wells}
            highlightWellId={state.highlightWellId}
            onAdd={actions.addWell}
            onRemove={actions.removeWell}
            onHighlight={actions.highlight}
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
      {range && (
        <div className="bottom glass">
          <InletHeader state={state} inlet={inlet} rangeText={rangeText} inletTokens={inletTokens} onSearch={search} actions={actions} setTooltip={setTooltip} />
          {inlet && (results || anySearching) && (
            <>
              <div className="color-mode" role="radiogroup" aria-label="colour rephrasings by">
                <span className="color-mode-label">colour by</span>
                {COLOR_MODES.map((m) => (
                  <button key={m.id} role="radio" aria-checked={colorBy === m.id} className={`color-mode-option ${colorBy === m.id ? 'on' : ''}`} onClick={() => chooseColorBy(m.id)}>{m.label}</button>
                ))}
              </div>
              <Results results={results} searching={anySearching} hasConstraints={cons.length > 0} onPick={(seq) => actions.swap(inlet, seq)} setTooltip={setTooltip} colorBy={colorBy} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
