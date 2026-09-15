import React, { useEffect, useRef, useState } from 'react';
import { ConstraintView } from './ConstraintViews.jsx';
import { makePosConstraint, makeSoundConstraint, makeLengthConstraint, makeProbConstraint } from '../core/constraints.js';
import { wellStyles, FEATURE_LABELS } from '../core/wells.js';

/** Which well's colours a constraint kind borrows, so the two stay visually related. */
const KIND_WELL = { pos: 'words', length: 'words', sound: 'sound', prob: 'context' };

const KINDS = [
  { id: 'pos', title: 'Part of speech', desc: 'Rephrasings must contain, start with, end with, or follow a pattern of parts of speech. Starts from the selection\'s own pattern.' },
  { id: 'length', title: 'Word count', desc: 'A minimum and maximum number of words. Starts at the selection\'s length.' },
  { id: 'sound', title: 'Sound', desc: 'Phonemes the rephrasing should contain or start/end with. Starts from the selection\'s pronunciation; type another word to borrow its sound.' },
  { id: 'prob', title: 'Probability', desc: 'A window on the probability histogram; only rephrasings inside it match. Fill it by running the context well.' },
];

function make(kind, inletId, tokens) {
  switch (kind) {
    case 'pos': return makePosConstraint(inletId, tokens);
    case 'length': return makeLengthConstraint(inletId, tokens);
    case 'sound': return makeSoundConstraint(inletId, tokens);
    case 'prob': return makeProbConstraint(inletId);
    default: return null;
  }
}

/**
 * Constraints for the current inlet, independent of any well: a list of
 * editors plus one "+ Constraint" button that opens a chooser.
 */
export default function ConstraintsPanel({ inlet, inletTokens, constraints, histogram, actions }) {
  const [open, setOpen] = useState(false);
  const popRef = useRef(null);
  const btnRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (!popRef.current?.contains(e.target) && !btnRef.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const add = (kind) => {
    const c = make(kind, inlet.id, inletTokens);
    if (c) actions.addConstraint(c);
    setOpen(false);
  };

  return (
    <section className="constraints-panel">
      <div className="constraints-head">
        <span className="constraints-title">Constraints{constraints.length ? ` · ${constraints.length}` : ''}</span>
        <div className="add-well">
          <button ref={btnRef} className={`add-well-button ${open ? 'open' : ''}`} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="dialog">
            <span aria-hidden="true">＋</span> Constraint
          </button>
          {open && (
            <div ref={popRef} className="popover glass creamy right" role="dialog" aria-label="Add a constraint">
              <div className="popover-head"><span className="popover-title">Constrain the rephrasings by</span></div>
              <div className="well-choices">
                {KINDS.map((k) => {
                  const st = wellStyles(KIND_WELL[k.id], true);
                  return (
                    <button key={k.id} className="well-choice" style={{ '--well': st.color, '--well-deep': st.textColor, '--well-glass': st.solid }} onClick={() => add(k.id)}>
                      <span className="well-choice-title">{k.title}</span>
                      <span className="well-choice-desc">{k.desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {constraints.length === 0 && (
        <div className="subtitle">No constraints. Add one to steer what counts as a match; rephrasings that miss it are listed separately, not hidden.</div>
      )}
      {constraints.map((c) => {
        const st = wellStyles(KIND_WELL[c.kind], true);
        return (
          <div key={c.id} className="constraint-card" style={{ '--well': st.color }}>
            <div className="constraint-card-title" style={{ color: st.textColor }}>{FEATURE_LABELS[c.kind]}</div>
            <ConstraintView
              constraint={c}
              styles={st}
              histogram={histogram}
              onPatch={(patch) => actions.patchConstraint(c, patch)}
              onDelete={() => actions.removeConstraint(c)}
            />
          </div>
        );
      })}
    </section>
  );
}
