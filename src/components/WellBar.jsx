import React from 'react';
import { WELL_DEFS, VIEW_WELLS, wellColor } from '../core/wells.js';
import { deepen, glassify } from '../lib/colors.js';
import AddWell from './AddWell.jsx';

/**
 * Strip of open wells (one chip per instance) plus the single Add well button.
 * Chips carry the colour-the-editor toggle for view wells and a close action.
 */
export default function WellBar({ wells, highlightWellId, onAdd, onRemove, onHighlight }) {
  const open = wells.filter((w) => w.active);
  return (
    <div className="well-strip">
      {open.map((w) => {
        const def = WELL_DEFS[w.type];
        const color = wellColor(w.type);
        const highlighted = w.id === highlightWellId;
        return (
          <div key={w.id} className={`well-chip ${highlighted ? 'highlighted' : ''}`} style={{ '--well': color, '--well-deep': deepen(color), '--well-glass': glassify(color, 0.55) }} title={w.role ?? def.description}>
            <span className="well-chip-title">{def.title}</span>
            {w.role && <span className="well-chip-role">{w.role}</span>}
            <span className="well-chip-actions">
              {VIEW_WELLS.has(w.type) && (
                <button className={`icon-button ${highlighted ? 'on' : ''}`} aria-pressed={highlighted} title={highlighted ? 'stop colouring the editor' : `colour the editor by ${def.title}`} onClick={() => onHighlight(w.id)}>🎨</button>
              )}
              {!def.undestroyable && <button className="icon-button remove" title="close this well" onClick={() => onRemove(w.id)}>×</button>}
            </span>
          </div>
        );
      })}
      <AddWell wells={wells} onAdd={onAdd} />
    </div>
  );
}
