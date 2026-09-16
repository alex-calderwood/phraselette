import React from 'react';
import { WELL_DEFS, VIEW_WELLS, wellColor } from '../core/wells.js';
import { deepen, glassify } from '../lib/colors.js';
import AddWell from './AddWell.jsx';
import { AddConstraint, constraintSummary, constraintWellType } from './ConstraintsPanel.jsx';

/**
 * Search, then the Add well / Add constraint buttons, then one chip per open well
 * and per constraint.
 * Chips carry the color-the-editor toggle for view wells and a close action.
 */
export default function WellBar({ searchButton = null, wells, highlightWellId, onAdd, onRemove, onHighlight, inlet, inletTokens, constraints = [], otherConstraints = [], onAddConstraint, onRemoveConstraint }) {
  const open = wells.filter((w) => w.active);
  return (
    <div className="well-strip">
      {searchButton}
      {/* the add buttons stay put beside Search; chips grow to the right of them */}
      <AddWell wells={wells} onAdd={onAdd} />
      <AddConstraint inlet={inlet} inletTokens={inletTokens} constraints={constraints} others={otherConstraints} onAdd={onAddConstraint} />
      {open.map((w) => {
        const def = WELL_DEFS[w.type];
        const color = wellColor(w.type, w.shade);
        const highlighted = w.id === highlightWellId;
        return (
          <div key={w.id} className={`well-chip ${highlighted ? 'highlighted' : ''}`} style={{ '--well': color, '--well-deep': deepen(color), '--well-glass': glassify(color, 0.55) }} title={w.role ?? def.description}>
            <span className="well-chip-title">{def.title}</span>
            {w.role && <span className="well-chip-role">{w.role}</span>}
            <span className="well-chip-actions">
              {VIEW_WELLS.has(w.type) && (
                <button className={`icon-button ${highlighted ? 'on' : ''}`} aria-pressed={highlighted} title={highlighted ? 'stop coloring the editor' : `color the editor by ${def.title}`} onClick={() => onHighlight(w.id)}>🎨</button>
              )}
              {!def.undestroyable && <button className="icon-button remove" title="close this well" onClick={() => onRemove(w.id)}>×</button>}
            </span>
          </div>
        );
      })}
      {constraints.map((c) => {
        const color = wellColor(constraintWellType(c));
        return (
          <div key={c.id} className="well-chip constraint-chip" style={{ '--well': color, '--well-deep': deepen(color), '--well-glass': glassify(color, 0.55) }} title="a constraint on this inlet's rephrasings">
            <span className="well-chip-kind">constraint</span>
            <span className="well-chip-title">{constraintSummary(c)}</span>
            <span className="well-chip-actions">
              <button className="icon-button remove" title="remove this constraint" onClick={() => onRemoveConstraint(c)}>×</button>
            </span>
          </div>
        );
      })}
    </div>
  );
}
