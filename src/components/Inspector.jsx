import React from 'react';
import WellView from './WellView.jsx';
import ConstraintsPanel from './ConstraintsPanel.jsx';
import { hoverProps } from './Tooltip.jsx';

const fmt = (n) => (Number.isInteger(n) ? n : Number(n).toFixed(1));

/**
 * The phrase being worked on, drawn the way it looks in the editor: rainbow
 * underlay once it is an inlet, teal dotted underline while it is only a
 * selection. Status and the single Search action sit beneath it.
 */
export function InletHeader({ state, inlet, rangeText, inletTokens, onSearch, actions, setTooltip }) {
  const searching = inlet ? (state.searching[inlet.id] ?? []) : [];
  const results = inlet ? state.results[inlet.id] : null;
  const words = inletTokens.filter((t) => !t.isSpace && t.pos !== 'PUNCT').length;
  let status;
  if (!inlet) status = `selection · ${words} word${words === 1 ? '' : 's'}`;
  else if (searching.length) status = `searching · ${searching.length} well${searching.length === 1 ? '' : 's'} running`;
  else if (results) status = `${results.accepted.length} match · ${results.rejected.length} fail`;
  else status = `inlet · ${words} word${words === 1 ? '' : 's'}`;

  return (
    <div className={`inlet-header ${inlet ? 'is-inlet' : 'is-selection'}`}>
      <div className="inlet-left">
        <div className="inlet-phrase-row">
          <span className={`inlet-phrase ${inlet ? 'rain' : 'sel'}`}>{rangeText}</span>
          {inlet && (
            <button className="inlet-remove" onClick={() => actions.deleteInlet(inlet.id)} {...hoverProps(setTooltip, 'Remove this inlet (the text stays).')}>×</button>
          )}
        </div>
        <span className={`inlet-status ${searching.length ? 'rainbow-animated' : ''}`}>{status}</span>
      </div>
      <button className={`search-button ${searching.length ? 'busy' : ''}`} onClick={onSearch} {...hoverProps(setTooltip, inlet ? 'Run every well again on this inlet. ⌘ + Enter' : 'Open this phrase as an inlet and run every well. ⌘ + Enter')}>
        <span className="search-icon" aria-hidden="true">🖌️</span>
        <span>{searching.length ? 'Searching…' : 'Search'}</span>
        <kbd>⌘↵</kbd>
      </button>
    </div>
  );
}

export default function Inspector({ state, session, inlet, rangeText, hasRange, wells, inletTokens, inletConstraints, actions, setTooltip, onSearch, colorBy }) {
  return (
    <div className="inspector glass">
      {!hasRange && (
        <div className="hint">
          {state.text.trim()
            ? <>Click a word or highlight a phrase in the editor, then press <b>Search</b> (⌘↵). The wells below will fill with rephrasings for it.</>
            : <>Paste or write a poem on the left. Then click a word or highlight a phrase and press <b>Search</b> (⌘↵).</>}
        </div>
      )}

      {inlet && (
        <ConstraintsPanel
          inlet={inlet}
          inletTokens={inletTokens}
          constraints={inletConstraints}
          histogram={wells.filter((w) => w.type === 'context').map((w) => state.insights[w.id]?.[inlet.id]?.histogram).find(Boolean) ?? null}
          actions={actions}
        />
      )}

      {wells.map((w) => (
        <WellView
          key={w.id}
          well={w}
          inlet={inlet}
          inletTokens={inletTokens}
          constraints={inletConstraints}
          insight={inlet ? state.insights[w.id]?.[inlet.id] : null}
          searching={inlet ? (state.searching[inlet.id] ?? []).includes(w.id) : false}
          actions={actions}
          setTooltip={setTooltip}
          highlighted={state.highlightWellId === w.id}
          session={session}
          colorBy={colorBy}
        />
      ))}
    </div>
  );
}
