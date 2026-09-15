import React from 'react';
import { WELL_DEFS, VIEW_WELLS, wellStyles } from '../core/wells.js';
import { randomRole } from '../lang/roles.js';
import { parseBullets, TEMPLATES, TEMPLATE_LABELS } from '../models/prompts.js';
import { TokenRow } from './TokenRange.jsx';
import Results from './Results.jsx';
import { hoverProps } from './Tooltip.jsx';
import { modelLabelFor, taskFor } from '../models/catalog.js';

function italics(text) {
  return text.split(/(<i>.*?<\/i>)/g).map((part, i) =>
    part.startsWith('<i>') ? <i key={i}>{part.slice(3, -4)}</i> : <React.Fragment key={i}>{part.replace(/<\/?[a-z]+>/g, '')}</React.Fragment>,
  );
}

export default function WellView({ well, inlet, inletTokens, constraints, insight, searching, actions, setTooltip, highlighted, session, colorBy = 'origin' }) {
  const def = WELL_DEFS[well.type];
  const st = wellStyles(well.type, true);
  const open = !well.collapsed;

  const text = insight?.text;
  const bullets = text ? parseBullets(text) : [];
  const modelLabel = modelLabelFor(session, well.type);
  const bidirectional = well.type === 'context' && taskFor(session, 'context') === 'fill-mask';
  const showRole = def.roles;

  return (
    <div className={`well ${open ? 'open' : 'closed'}`} style={st.panel}>
      <div
        className={`well-title ${open ? 'rotated' : ''} ${searching ? 'rainbow-animated' : ''}`}
        style={{ color: st.textColor }}
        onClick={() => actions.patchWell(well.id, { collapsed: open })}
        {...hoverProps(setTooltip, `${open ? 'Collapse' : 'Expand'}. ${def.description}`)}
      >
        {!def.undestroyable && <button className="light-button" onClick={(e) => { e.stopPropagation(); actions.removeWell(well.id); }} title="remove well">×</button>}
        {!open && well.role && <span className="well-title-role">{well.role}</span>}
        <span className="well-type">{def.title}</span>
      </div>

      {open && (
        <div className={`well-content ${searching ? 'searching' : ''}`}>
          {modelLabel && <div className="well-model" title="model behind this well">{modelLabel}</div>}
          {showRole && (
            <textarea className="role-field" value={well.role ?? ''} onChange={(e) => actions.patchWell(well.id, { role: e.target.value })} rows={2} />
          )}


          {insight?.error && <div className="well-error">{insight.error}</div>}
          {insight?.progress && <div className="subtitle">searching… step {insight.progress.step} of {insight.progress.total}</div>}
          {showRole && well.templates && (
            <details className="raw-output prompt-editor">
              <summary>prompt {JSON.stringify(well.templates) !== JSON.stringify(TEMPLATES[well.type]) ? '(edited)' : ''}</summary>
              <div className="prompt-help">Placeholders: {'{{description}}'} role · {'{{selection}}'} inlet · {'{{context}}'} passage with ⟦inlet⟧ · {'{{advice}}'} constraints · {'{{rules}}'} entry-format rules{well.type === 'reader' ? ' · {{feedback}} the reader\'s comments' : ''}</div>
              {Object.entries(well.templates).map(([key, tpl]) => (
                <label key={key} className="prompt-field">
                  <span>{TEMPLATE_LABELS[key] ?? key}</span>
                  <textarea rows={6} value={tpl} onChange={(e) => actions.patchWell(well.id, { templates: { ...well.templates, [key]: e.target.value } })} />
                </label>
              ))}
              <button style={st.button} onClick={() => actions.patchWell(well.id, { templates: { ...TEMPLATES[well.type] } })}>reset to original</button>
              {insight?.prompt && (
                <details className="raw-output">
                  <summary>last prompt sent</summary>
                  <pre className="streaming">{insight.prompt}</pre>
                </details>
              )}
            </details>
          )}
          {(insight?.streaming || insight?.raw) && (
            <details className="raw-output">
              <summary>{insight?.streaming ? 'generating… (model output)' : 'model output'}</summary>
              <pre className="streaming">{insight?.streaming ?? insight?.raw}</pre>
            </details>
          )}
          {bullets.length > 0 && (
            <ul className="bullets">{bullets.map((b, i) => <li key={i}>{italics(b)}</li>)}</ul>
          )}

          {inletTokens.length > 0 && <TokenRow tokens={inletTokens} wellType={well.type} />}
          {!inlet && <div className="well-empty">{def.canSearch ? 'Select a phrase and press Search to fill this well.' : 'Select a phrase to view it through this well.'}</div>}

          {inlet && (
            <div className="well-controls">
              {VIEW_WELLS.has(well.type) && (
                <button className={`paint ${highlighted ? 'on' : ''}`} style={st.button} onClick={() => actions.highlight(well.id)} {...hoverProps(setTooltip, highlighted ? 'Stop colouring the editor.' : `Colour the editor by ${def.title}.`)}>🎨</button>
              )}
              {showRole && <button style={st.button} onClick={() => actions.patchWell(well.id, { role: randomRole(well.type, well.role) })} {...hoverProps(setTooltip, 'Roll a random role.')}>🎲</button>}
              {def.canSearch && <button style={st.button} onClick={() => actions.runWell(inlet, well)} {...hoverProps(setTooltip, 'Run this well.')}>🖌️</button>}
            </div>
          )}

          {inlet && def.canSearch && (insight?.results || searching) && (
            <Results
              results={insight?.results}
              searching={searching}
              wellType={well.type}
              hasConstraints={constraints.length > 0}
              onPick={(seq) => actions.swap(inlet, seq)}
              setTooltip={setTooltip}
              colorBy={colorBy}
            />
          )}
        </div>
      )}
    </div>
  );
}
