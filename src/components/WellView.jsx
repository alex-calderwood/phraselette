import React, { useEffect, useRef, useState } from 'react';
import { WELL_DEFS, VIEW_WELLS, wellStyles } from '../core/wells.js';
import { randomRole } from '../lang/roles.js';
import { parseBullets, TEMPLATES, TEMPLATE_LABELS } from '../models/prompts.js';
import { TokenRow, SequenceChip } from './TokenRange.jsx';
import { LogHistogram } from './ConstraintViews.jsx';
import Results from './Results.jsx';
import { hoverProps } from './Tooltip.jsx';
import { modelLabelFor, taskFor } from '../models/catalog.js';
import { ROLE_GUIDE } from './AddWell.jsx';

/** Render <i>…</i> from the model and bold the headword when an entry starts with it. */
function entry(text, headword) {
  const parts = text.split(/(<i>.*?<\/i>)/g).map((part, i) =>
    part.startsWith('<i>') ? <i key={i}>{part.slice(3, -4)}</i> : <React.Fragment key={i}>{part.replace(/<\/?[a-z]+>/g, '')}</React.Fragment>,
  );
  if (headword && text.toLowerCase().startsWith(headword.toLowerCase())) {
    const first = parts[0];
    const raw = typeof first?.props?.children === 'string' ? first.props.children : null;
    if (raw) parts[0] = <React.Fragment key="hw"><b>{raw.slice(0, headword.length)}</b>{raw.slice(headword.length)}</React.Fragment>;
  }
  return parts;
}

/** Bounds shown on the context well's histogram: the probability constraint's window if any, else the full range. */
function probRange(constraints) {
  const c = constraints.find((x) => x.kind === 'prob');
  return c ? [c.min, c.max] : [Math.log(1e-12), 0];
}

/** Gentle nudge when a thesaurus / dictionary role does not name the thing it is. */
function roleWarning(well) {
  const r = (well.role ?? '').trim().toLowerCase();
  if (!r) return null;
  if (well.type === 'thesaurus' && !/thesaurus|lexicon|glossary|vocabulary|spellbook|almanac|phrasebook|word ?list|dictionary/.test(r)) return 'Tip: phrase it as a thing, e.g. “a thesaurus of …”. The prompt reads “You are a thesaurus written in the style of [this]”.';
  if (well.type === 'dictionary' && !/dictionary|lexicon|glossary|wordbook|encyclopedia/.test(r)) return 'Tip: phrase it as a thing, e.g. “a dictionary …”. The prompt reads “You are a dictionary written in the style of [this]”.';
  return null;
}

/** Inline-editable role: reads as the well's title text, click to edit. */
function RoleTitle({ well, onChange, style, guide }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(well.role ?? '');
  const ref = useRef(null);
  useEffect(() => { if (!editing) setDraft(well.role ?? ''); }, [well.role, editing]);
  useEffect(() => { if (editing) { ref.current?.focus(); ref.current?.select(); } }, [editing]);
  const commit = () => { setEditing(false); if (draft.trim() !== (well.role ?? '')) onChange(draft.trim()); };
  if (!editing) {
    return (
      <button className="role-title" style={style} title="click to edit the role" onClick={() => setEditing(true)}>
        {well.role?.trim() ? well.role : <span className="role-placeholder">{guide}</span>}
      </button>
    );
  }
  return (
    <span className="role-edit">
      <textarea
        ref={ref}
        className="role-field"
        rows={2}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit(); } if (e.key === 'Escape') { setDraft(well.role ?? ''); setEditing(false); } }}
      />
      {roleWarning({ ...well, role: draft }) && <div className="role-warning">{roleWarning({ ...well, role: draft })}</div>}
    </span>
  );
}

function Menu({ items, style }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  return (
    <span className="well-menu" ref={ref}>
      <button className="icon-button" style={style} title="more" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>⋯</button>
      {open && (
        <div className="well-menu-list glass creamy" role="menu">
          {items.map((it, i) => it.divider
            ? <div key={i} className="well-menu-divider" />
            : it.static
              ? <div key={i} className="well-menu-static">{it.label}</div>
              : <button key={i} role="menuitem" className={`well-menu-item ${it.danger ? 'danger' : ''}`} onClick={() => { setOpen(false); it.onClick(); }}>{it.label}</button>)}
        </div>
      )}
    </span>
  );
}

export default function WellView({ well, inlet, inletTokens, constraints, insight, searching, actions, setTooltip, highlighted, session, colorBy = 'origin', dragProps = {}, dropProps = {}, dropIndicator = null, isDragging = false }) {
  const def = WELL_DEFS[well.type];
  const st = wellStyles(well.type, true);
  const open = !well.collapsed;
  const modelLabel = modelLabelFor(session, well.type);
  const bidirectional = well.type === 'context' && taskFor(session, 'context') === 'fill-mask';
  const [showPrompt, setShowPrompt] = useState(false);

  const text = insight?.text;
  const bullets = text ? parseBullets(text) : [];
  const results = insight?.results;
  const count = results?.all?.length ?? (insight?.sequences?.length ?? null);
  const error = insight?.error;
  const headword = inlet ? (inletTokens.filter((t) => !t.isSpace).map((t) => t.text).join(' ') || null) : null;
  const promptEdited = well.templates && JSON.stringify(well.templates) !== JSON.stringify(TEMPLATES[well.type]);

  const menu = [
    ...(def.roles ? [
      { label: showPrompt ? 'hide prompt' : `edit prompt${promptEdited ? ' (edited)' : ''}`, onClick: () => { setShowPrompt((v) => !v); if (well.collapsed) actions.patchWell(well.id, { collapsed: false }); } },
      ...(promptEdited ? [{ label: 'reset prompt to original', onClick: () => actions.patchWell(well.id, { templates: { ...TEMPLATES[well.type] } }) }] : []),
      { divider: true },
    ] : []),
    ...(modelLabel ? [{ static: true, label: modelLabel }, { divider: true }] : []),
    ...(!def.undestroyable ? [{ label: 'close well', danger: true, onClick: () => actions.removeWell(well.id) }] : []),
  ];

  const status = error ? 'error' : searching ? 'busy' : count != null && inlet ? 'done' : 'idle';

  return (
    <div className={`well ${open ? 'open' : 'closed'} ${isDragging ? 'dragging' : ''} ${dropIndicator ? `drop-${dropIndicator}` : ''} status-${status}`} style={st.panel} {...dropProps}>
      {/* drag handle: the whole left edge */}
      <div className="drag-rail" style={{ background: st.solid }} {...dragProps} {...hoverProps(setTooltip, 'Drag to reorder.')} aria-hidden="true"><span>⋮</span></div>
      {/* header */}
      <div className="well-head" style={{ color: st.textColor }}>
        <button className="well-name" style={{ color: st.textColor }} onClick={() => actions.patchWell(well.id, { collapsed: open })} aria-expanded={open} {...hoverProps(setTooltip, def.description)}>{def.title}</button>
        {def.roles && (
          <>
            <RoleTitle well={well} style={{ color: st.textColor }} guide={`${well.type === 'reader' ? 'who is reading?' : `a ${well.type} …`}`} onChange={(role) => actions.patchWell(well.id, { role })} />
            <button className="icon-button" style={st.button} onClick={() => actions.patchWell(well.id, { role: randomRole(well.type, well.role) })} {...hoverProps(setTooltip, 'Roll a random role.')}>🎲</button>
          </>
        )}
        <span className="well-head-spacer" />
        {status === 'error' && <button className="well-badge error" onClick={() => inlet && actions.runWell(inlet, well)} title={error}>failed · retry</button>}
        {status === 'busy' && <span className="well-badge busy rainbow-animated">{insight?.progress ? `step ${insight.progress.step}/${insight.progress.total}` : 'searching…'}</span>}
        {status === 'done' && def.canSearch && <span className="well-badge">{count} rephrasing{count === 1 ? '' : 's'}</span>}
        {VIEW_WELLS.has(well.type) && (
          <button className={`well-action paint icon-only ${highlighted ? 'on' : ''}`} style={st.button} aria-pressed={highlighted} aria-label={highlighted ? 'stop coloring the editor' : `color the editor by ${def.title}`} onClick={() => actions.highlight(well.id)} {...hoverProps(setTooltip, highlighted ? 'Stop coloring the editor.' : `Color the editor by ${def.title}.`)}>
            <span className="well-action-icon" aria-hidden="true">🎨</span>
          </button>
        )}
        {def.canSearch && (
          <button className="well-action run" style={st.button} disabled={!inlet || searching} onClick={() => actions.runWell(inlet, well)} {...hoverProps(setTooltip, inlet ? `Run only this well on “${headword}”.` : 'Select a phrase first.')}>
            <span className="well-action-icon" aria-hidden="true">🖌️</span><span>{searching ? 'running' : 'run'}</span>
          </button>
        )}
        <Menu items={menu} style={st.button} />
      </div>

      {/* collapsed summary */}
      {!open && (
        <div className="well-summary" onClick={() => actions.patchWell(well.id, { collapsed: false })}>
          {results?.all?.length
            ? results.all.map((s) => <SequenceChip key={s.id} seq={s} wellType={well.type} onClick={(seq) => actions.swap(inlet, seq)} setTooltip={setTooltip} colorBy={colorBy} />)
            : <span className="well-empty">{inlet ? (def.canSearch ? 'not run yet' : '') : 'no phrase selected'}</span>}
        </div>
      )}

      {/* body */}
      {open && (
        <div className={`well-content ${searching ? 'searching' : ''}`}>
          {error && <div className="well-error">{error}</div>}

          {showPrompt && def.roles && well.templates && (
            <div className="prompt-editor">
              <div className="prompt-help">Placeholders: {'{{description}}'} role · {'{{selection}}'} inlet · {'{{context}}'} passage with ⟦inlet⟧ · {'{{advice}}'} constraints · {'{{rules}}'} entry-format rules{well.type === 'reader' ? ' · {{feedback}} the reader\'s comments' : ''}</div>
              {Object.entries(well.templates).map(([key, tpl]) => (
                <label key={key} className="prompt-field">
                  <span>{TEMPLATE_LABELS[key] ?? key}</span>
                  <textarea rows={6} value={tpl} onChange={(e) => actions.patchWell(well.id, { templates: { ...well.templates, [key]: e.target.value } })} />
                </label>
              ))}
              {insight?.prompt && (
                <details className="raw-output"><summary>last prompt sent</summary><pre className="streaming">{insight.prompt}</pre></details>
              )}
            </div>
          )}

          {(insight?.streaming || insight?.raw) && (
            <details className="raw-output">
              <summary>{insight?.streaming ? 'generating… (model output)' : 'model output'}</summary>
              <pre className="streaming">{insight?.streaming ?? insight?.raw}</pre>
            </details>
          )}

          {/* insights: what the reader said / the dictionary's entries */}
          {bullets.length > 0 && (
            <section className="well-section">
              <div className="well-section-title">{well.type === 'reader' ? 'what the reader said' : well.type === 'dictionary' ? 'entries' : 'notes'}</div>
              {well.type === 'dictionary'
                ? <dl className="entries">{bullets.map((b, i) => <dd key={i}>{entry(b, headword)}</dd>)}</dl>
                : <ul className="bullets">{bullets.map((b, i) => <li key={i}>{entry(b, null)}</li>)}</ul>}
            </section>
          )}

          {inletTokens.length > 0 && <TokenRow tokens={inletTokens} wellType={well.type} />}
          {well.type === 'context' && inlet && insight?.histogram && (
            <div className="insight-histogram" title="log-probability of every candidate the model weighed while searching">
              <LogHistogram data={insight.histogram} min={probRange(constraints)[0]} max={probRange(constraints)[1]} onChange={() => {}} readOnly />
              <div className="insight-histogram-label">what the model considered likely here (log-probability, left = unlikely){bidirectional ? ', reading both sides' : ''}</div>
            </div>
          )}
          {!inlet && <div className="well-empty">{def.canSearch ? 'Select a phrase and press Search to fill this well.' : 'Select a phrase to view it through this well.'}</div>}

          {inlet && def.canSearch && (results || searching) && (
            <section className="well-section">
              <div className="well-section-title">{well.type === 'reader' ? "how they'd rewrite it" : 'rephrasings'}</div>
              <Results results={results} searching={searching} wellType={well.type} constraints={constraints} onPick={(seq) => actions.swap(inlet, seq)} setTooltip={setTooltip} colorBy={colorBy} />
            </section>
          )}
        </div>
      )}
    </div>
  );
}
