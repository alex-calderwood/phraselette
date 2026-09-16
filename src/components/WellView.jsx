import React, { useEffect, useRef, useState } from 'react';
import { searchSettings, SEARCH_DEFAULTS, WELL_DEFS, VIEW_WELLS, CONTEXT_LIKE, wellStyles } from '../core/wells.js';
import { randomRole } from '../lang/roles.js';
import { parseBullets, TEMPLATES, TEMPLATE_LABELS } from '../models/prompts.js';
import { TokenRow, SequenceChip } from './TokenRange.jsx';
import { LogHistogram } from './ConstraintViews.jsx';
import Results from './Results.jsx';
import { hoverProps } from './Tooltip.jsx';
import { modelLabelFor, taskFor } from '../models/catalog.js';
import { ROLE_GUIDE } from './AddWell.jsx';
import { constraintSummary } from './ConstraintsPanel.jsx';
import { gateMode } from '../core/constraints.js';

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
      <button className="icon-button well-more" style={style} title="more" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>⋯</button>
      {open && (
        <div className="well-menu-list glass creamy" role="menu">
          {items.map((it, i) => it.divider
            ? <div key={i} className="well-menu-divider" />
            : it.static
              ? <div key={i} className="well-menu-static">{it.label}</div>
              : it.fields
                ? (
                  <div key={i} className="well-menu-fields">
                    {it.title && <div className="well-menu-static">{it.title}</div>}
                    {it.fields.map((f) => (
                      <label key={f.key} title={f.hint} className={f.type === 'checkbox' ? 'check' : ''}>
                        <span>{f.label}</span>
                        {f.type === 'checkbox'
                          ? <input type="checkbox" checked={!!f.value} onChange={(e) => f.onChange(e.target.checked)} />
                          : <input type="number" value={f.value} min={f.min} max={f.max} step={f.step ?? 1} onChange={(e) => f.onChange(Number(e.target.value))} />}
                      </label>
                    ))}
                    {it.note && <div className="well-menu-static">{it.note}</div>}
                  </div>
                )
              : <button key={i} role="menuitem" className={`well-menu-item ${it.danger ? 'danger' : ''}`} onClick={() => { setOpen(false); it.onClick(); }}>{it.label}</button>)}
        </div>
      )}
    </span>
  );
}

/** Menu block with the knobs of the well's current search mode; values live on well.params[mode] (see SEARCH_DEFAULTS). */
function searchFields(well, actions) {
  const ss = searchSettings(well);
  const set = (key) => (v) => actions.patchWell(well.id, { params: { ...(well.params ?? {}), [ss.mode]: { ...(well.params?.[ss.mode] ?? {}), [key]: v } } });
  const beamKnobs = [
    { key: 'beams', label: 'beams', value: ss.beams, min: 1, max: 64, hint: 'How many hypotheses run side by side. More is slower and uses more memory.', onChange: set('beams') },
    { key: 'groups', label: 'groups', value: ss.groups, min: 1, max: ss.beams, hint: 'Diverse beam search: the beams are split into this many groups, and a token an earlier group picked at the same step is penalized for later ones, so the groups spread out. Must divide the number of beams; 1 is plain beam search; groups = beams forces every beam apart.', onChange: set('groups') },
    { key: 'diversity', label: 'beam diversity', value: ss.diversity, min: 0, max: 5, step: 0.1, hint: 'How strongly later groups are pushed away from tokens earlier groups picked at the same step (log-probability subtracted per prior use). 0 turns it off.', onChange: set('diversity') },
  ];
  const examples = { key: 'examples', type: 'checkbox', label: 'include 2 shot examples', value: well.examples !== false, hint: 'Send the two worked user/assistant exchanges before the request. Off sends only the system prompt and the request.', onChange: (v) => actions.patchWell(well.id, { examples: v }) };
  const notes = { key: 'notes', type: 'checkbox', label: 'notes on the thesaurus first', value: well.notes !== false, hint: 'Before the entries, ask the model to think freely about the thesaurus for a few sentences; the notes are shown in the request (and in the examples). Off drops the notes lines from every prompt.', onChange: (v) => actions.patchWell(well.id, { notes: v }) };
  let fields;
  let note;
  const steer = { key: 'steer', label: 'steering', value: ss.steer, min: 0, max: 3, step: 0.1, hint: 'How hard beams are pulled toward a "contains" constraint they have not met yet: their rank is lowered by this times the log-chance of still meeting it in the tokens left. 0 only drops failures at the end; 1 takes the estimate at face value and tends to leave the letter to the last word; 2 (default) commits to a fitting word early.', onChange: set('steer') };
  if (CONTEXT_LIKE.has(well.type) && ss.mode === 'beam') {
    fields = [...beamKnobs, { key: 'noRepeat', label: 'no-repeat n-gram', value: ss.noRepeat, min: 0, max: 4, hint: 'A word n-gram already generated in a beam may not recur (2 was the original build\'s setting; 0 turns it off).', onChange: set('noRepeat') }, ...(well.type === 'sieve' ? [steer] : [])];
    note = `${ss.beams} rephrasings`;
  } else if (CONTEXT_LIKE.has(well.type)) {
    fields = [{ key: 'k', label: 'continuations', value: ss.k, min: 1, max: 64, hint: 'Top-K first tokens, each continued greedily.', onChange: set('k') }, ...(well.type === 'sieve' ? [steer] : [])];
    note = `${ss.k} rephrasings`;
  } else if (ss.mode === 'beam') {
    fields = [...beamKnobs,
      { key: 'perBeam', label: 'entries per beam', value: ss.perBeam, min: 1, max: 12, hint: 'Each beam writes this many entries in a row, seeing its own earlier ones.', onChange: set('perBeam') },
      notes, examples];
    note = `up to ${ss.beams * ss.perBeam} entries`;
  } else {
    fields = [
      { key: 'temperature', label: 'temperature', value: ss.temperature, min: 0, max: 2, step: 0.1, hint: 'Sampling temperature; 0 is greedy. The original build used 1.0.', onChange: set('temperature') },
      { key: 'topP', label: 'top-p', value: ss.topP, min: 0.05, max: 1, step: 0.05, hint: 'Nucleus sampling: only the smallest set of tokens whose probabilities sum to p are sampled. 1 = off.', onChange: set('topP') },
      { key: 'maxNewTokens', label: 'max tokens', value: ss.maxNewTokens, min: 16, max: 1024, step: 16, hint: 'Length cap on the whole reply.', onChange: set('maxNewTokens') },
      notes, examples,
    ];
  }
  const changed = Object.keys(well.params?.[ss.mode] ?? {}).filter((k) => Number.isFinite(well.params[ss.mode][k]) && well.params[ss.mode][k] !== SEARCH_DEFAULTS[well.type]?.[ss.mode]?.[k]);
  const title = `${ss.mode === 'beam' ? 'beam search' : ss.mode === 'fast' ? 'fast search' : 'sampling'}${changed.length ? ` · changed: ${changed.join(', ')}` : ' · defaults'}`;
  return { fields, note, title };
}

/**
 * The sieve's account of the inlet's constraints: which it applies while
 * searching and which only sift afterwards, plus (after a run) how much of the
 * vocabulary the gate let through at the first token.
 */
function GateNote({ constraints, gate, bidirectional }) {
  if (bidirectional) return <div className="gate-note">A context-fill model is loaded; the sieve cannot gate its candidates yet, so this well behaves like the context well.</div>;
  const masked = constraints.filter((c) => gateMode(c) === 'mask');
  const steered = constraints.filter((c) => gateMode(c) === 'steer');
  const sifted = constraints.filter((c) => !gateMode(c));
  const st = gate?.stats;
  return (
    <div className="gate-note">
      <div className="gate-line">
        <span className="gate-label">cut while searching</span>
        {masked.length
          ? masked.map((c) => <span key={c.id} className="gate-chip on">{constraintSummary(c)}</span>)
          : <span className="gate-none">nothing yet · letters (starts with, must not contain), sounds (starts with, exactly, must not contain) and the probability window cut tokens here; letters or sounds “contains” steers the beams</span>}
      </div>
      {steered.length > 0 && (
        <div className="gate-line">
          <span className="gate-label">steered toward</span>
          {steered.map((c) => <span key={c.id} className="gate-chip on steer">{constraintSummary(c)}</span>)}
        </div>
      )}
      {sifted.length > 0 && (
        <div className="gate-line">
          <span className="gate-label">sifting afterwards</span>
          {sifted.map((c) => <span key={c.id} className="gate-chip">{constraintSummary(c)}</span>)}
        </div>
      )}
      {st && (
        <div className="gate-line gate-stats">
          first token: {st.allowed.toLocaleString()} of {st.vocab.toLocaleString()} tokens allowed ({(100 * st.allowed / st.vocab).toFixed(1)}% of the vocabulary, {(100 * st.mass).toFixed(1)}% of the probability)
        </div>
      )}
    </div>
  );
}

export default function WellView({ well, inlet, inletTokens, constraints, insight, searching, actions, setTooltip, highlighted, session, colorBy = 'origin', dragProps = {}, dropProps = {}, dropIndicator = null, isDragging = false }) {
  const def = WELL_DEFS[well.type];
  const st = wellStyles(well.type, true, well.shade);
  const open = !well.collapsed;
  const modelLabel = modelLabelFor(session, well.type);
  const ctxLike = CONTEXT_LIKE.has(well.type);
  const bidirectional = ctxLike && taskFor(session, well.type === 'sieve' ? 'sieve' : 'context') === 'fill-mask';
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
    ...((ctxLike && !bidirectional) || well.type === 'thesaurus' ? [
      // 'beam' (diverse beam search, beam.js) is the default; the alternative is lm.js fast search or plain sampling
      { label: searchSettings(well).mode === 'beam' ? (ctxLike ? 'use fast search instead' : 'use sampling instead') : 'use beam search instead',
        onClick: () => actions.patchWell(well.id, { search: searchSettings(well).mode === 'beam' ? (ctxLike ? 'fast' : 'sample') : 'beam' }) },
      searchFields(well, actions),
      ...(well.params?.[searchSettings(well).mode] && Object.keys(well.params[searchSettings(well).mode]).length
        ? [{ label: 'reset search settings', onClick: () => actions.patchWell(well.id, { params: { ...well.params, [searchSettings(well).mode]: {} } }) }] : []),
      { divider: true },
    ] : []),
    ...(modelLabel ? [{ static: true, label: `${modelLabel}${(ctxLike && !bidirectional) || well.type === 'thesaurus' ? ` · ${searchSettings(well).mode === 'beam' ? 'beam search' : ctxLike ? 'fast search' : 'sampling'}` : ''}` }, { divider: true }] : []),
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
            ? results.all.map((s) => <SequenceChip key={s.id} seq={s} wellType={well.type} onClick={(seq) => actions.swap(inlet, seq)} setTooltip={setTooltip} colorBy={colorBy} constraints={constraints} />)
            : <span className="well-empty">{inlet ? (def.canSearch ? 'not run yet' : '') : 'no phrase selected'}</span>}
        </div>
      )}

      {/* body */}
      {open && (
        <div className={`well-content ${searching ? 'searching' : ''}`}>
          {error && <div className="well-error">{error}</div>}

          {showPrompt && def.roles && well.templates && (
            <div className="prompt-editor">
              <div className="prompt-help">Placeholders: {'{{description}}'} role · {'{{selection}}'} inlet · {'{{context}}'} passage with ⟦inlet⟧ · {'{{advice}}'} constraints · {'{{rules}}'} entry-format rules{well.type === 'reader' ? ' · {{feedback}} the reader\'s comments' : ''}{well.type === 'thesaurus' ? ' · {{notes}} the notes on the thesaurus (lines mentioning <notes> are dropped when the notes step is off)' : ''}</div>
              {Object.entries(well.templates).map(([key, tpl]) => (
                <label key={key} className="prompt-field">
                  <span>{TEMPLATE_LABELS[key] ?? key}</span>
                  <textarea rows={6} value={tpl} onChange={(e) => actions.patchWell(well.id, { templates: { ...well.templates, [key]: e.target.value } })} />
                </label>
              ))}
              {/* the thesaurus's free notes about itself, written before the entries (part of the prompt, so shown with it) */}
              {well.type === 'thesaurus' && (insight?.notes || insight?.notesStreaming) && (
                <section className="well-section">
                  <div className="well-section-title">notes on the thesaurus</div>
                  <p className={`well-notes ${insight?.notesStreaming ? 'streaming-text' : ''}`}>{insight?.notes || '…'}</p>
                </section>
              )}
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

          {/* the inlet's words with their tags: only for the wells that view or search by those tags, not the role wells */}
          {inletTokens.length > 0 && !def.roles && <TokenRow tokens={inletTokens} wellType={well.type} />}
          {well.type === 'sieve' && inlet && <GateNote constraints={constraints} gate={insight?.gate} bidirectional={bidirectional} />}
          {ctxLike && inlet && insight?.histogram && (
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
