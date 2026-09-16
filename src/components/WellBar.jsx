import React from 'react';
import AddWell from './AddWell.jsx';
import { AddConstraint } from './ConstraintsPanel.jsx';

/**
 * Search, then the two add buttons (well, constraint). The open wells carry
 * their own color-the-editor toggle and close action; the constraints are
 * listed as cards in the inspector.
 */
export default function WellBar({ searchButton = null, wells, onAdd, inlet, inletTokens = [], constraints = [], otherConstraints = [], onAddConstraint }) {
  return (
    <div className="well-strip">
      {searchButton}
      <AddWell wells={wells} onAdd={onAdd} />
      <AddConstraint inlet={inlet} inletTokens={inletTokens} constraints={constraints} others={otherConstraints} onAdd={onAddConstraint} />
    </div>
  );
}
