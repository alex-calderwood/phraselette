import React, { useState } from 'react';
import { CONTEXT_LIKE, POS_HIGHLIGHT } from '../core/wells.js';
import WellView from './WellView.jsx';
import { TokenRow } from './TokenRange.jsx';
import { ConstraintCard } from './ConstraintsPanel.jsx';
import { hoverProps } from './Tooltip.jsx';

const fmt = (n) => (Number.isInteger(n) ? n : Number(n).toFixed(1));

/**
 * The phrase being worked on, drawn the way it looks in the editor: rainbow
 * underlay once it is an inlet, teal dotted underline while it is only a
 * selection. Beneath it: the status, and the words with their part-of-speech
 * tags next to the toggle that colors the editor by part of speech (what the
 * former words well did).
 */
export function InletHeader({ state, inlet, rangeText, inletTokens, onSearch, actions, setTooltip }) {
  const searching = inlet ? (state.searching[inlet.id] ?? []) : [];
  const results = inlet ? state.results[inlet.id] : null;
  const words = inletTokens.filter((t) => !t.isSpace && t.pos !== 'PUNCT').length;
  const posOn = state.highlightWellId === POS_HIGHLIGHT;
  let status;
  if (!inlet) status = `selection · ${words} word${words === 1 ? '' : 's'}`;
  else if (searching.length) status = `searching · ${searching.length} well${searching.length === 1 ? '' : 's'} running`;
  else if (results) status = `${results.accepted.length} match · ${results.rejected.length} fail`;
  else status = `inlet · ${words} word${words === 1 ? '' : 's'}`;

  return (
    <div className={`inlet-header ${inlet ? 'is-inlet' : 'is-selection'}`}>
      <div className="inlet-left">
        <div className="inlet-phrase-row">
          {inlet && (
            <button className="inlet-remove" onClick={() => actions.deleteInlet(inlet.id)} {...hoverProps(setTooltip, 'Remove this inlet (the text stays).')}>×</button>
          )}
          <span className={`inlet-phrase ${inlet ? 'rain' : 'sel'}`}>{rangeText}</span>
        </div>
        <span className={`inlet-status ${searching.length ? 'rainbow-animated' : ''}`}>{status}</span>
      </div>
      {/* top right, level with the phrase: its words with their part-of-speech tags, and the toggle that colors the editor by them */}
      {inletTokens.length > 0 && (
        <div className="inlet-tags">
          <TokenRow tokens={inletTokens} wellType="words" />
          <button
            className={`inlet-paint ${posOn ? 'on' : ''}`}
            aria-pressed={posOn}
            onClick={() => actions.highlight(POS_HIGHLIGHT)}
            {...hoverProps(setTooltip, posOn ? 'Stop coloring the editor.' : 'Color every word in the editor by its part of speech.')}
          >
            <span aria-hidden="true">🎨</span> parts of speech
          </button>
        </div>
      )}
      {onSearch && (
        <button className={`search-button ${searching.length ? 'busy' : ''}`} onClick={onSearch} {...hoverProps(setTooltip, inlet ? 'Run every well again on this inlet. ⌘ + Enter' : 'Open this phrase as an inlet and run every well. ⌘ + Enter')}>
          <span className="search-icon" aria-hidden="true">🖌️</span>
          <span>{searching.length ? 'Searching…' : 'Search'}</span>
          <kbd>⌘↵</kbd>
        </button>
      )}
    </div>
  );
}

export default function Inspector({ state, session, inlet, rangeText, wells, inletTokens, inletConstraints, actions, setTooltip, onSearch, colorBy }) {
  const [dragging, setDragging] = useState(null);
  const [over, setOver] = useState(null);
  return (
    <div className="inspector glass">

      {wells.map((w, i) => (
        <WellView
          key={w.id}
          well={w}
          dragProps={{
            draggable: true,
            onDragStart: (e) => { setDragging(w.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', w.id); },
            onDragEnd: () => { setDragging(null); setOver(null); },
          }}
          dropProps={{
            onDragOver: (e) => { if (!dragging || dragging === w.id) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOver({ id: w.id, after: e.clientY > e.currentTarget.getBoundingClientRect().top + e.currentTarget.offsetHeight / 2 }); },
            onDragLeave: () => setOver((o) => (o?.id === w.id ? null : o)),
            onDrop: (e) => { e.preventDefault(); if (dragging && dragging !== w.id) actions.moveWell(dragging, w.id, over?.after ?? false); setDragging(null); setOver(null); },
          }}
          dropIndicator={over?.id === w.id ? (over.after ? 'after' : 'before') : null}
          isDragging={dragging === w.id}
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

      {inlet && (
        <section className="constraints-section" aria-label="constraints on this inlet">
          <div className="constraints-section-title">
            <span>Constraints on “{rangeText}”</span>
          </div>
          {!inletConstraints.length && <div className="constraints-section-note">None yet. A constraint (the + Constraint button, beside + Add well) narrows the rephrasings every well returns for this inlet.</div>}
          {inletConstraints.map((c) => (
            <ConstraintCard
              key={c.id}
              constraint={c}
              histogram={wells.filter((w) => CONTEXT_LIKE.has(w.type)).map((w) => state.insights[w.id]?.[inlet.id]?.histogram).find(Boolean) ?? null}
              actions={actions}
              session={session}
              sequences={state.results[inlet.id]?.all ?? []}
            />
          ))}
        </section>
      )}
    </div>
  );
}
