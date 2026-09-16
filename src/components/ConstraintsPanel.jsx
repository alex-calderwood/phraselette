import React, { useEffect, useRef, useState } from 'react';
import { usePopoverPosition } from './usePopover.js';
import { ConstraintView } from './ConstraintViews.jsx';
import {
  makePosConstraint, makeSoundConstraint, makeLengthConstraint, makeProbConstraint,
  makeRhymeConstraint, makeSyllableConstraint, makeStressConstraint, makeLettersConstraint, makeCharsConstraint,
  makeSemanticConstraint, cloneConstraint, sameConstraint,
} from '../core/constraints.js';
import { wellStyles, FEATURE_LABELS } from '../core/wells.js';

/** Which well's colors a constraint kind borrows, so the two stay visually related. */
const KIND_WELL = { pos: 'words', length: 'words', letters: 'words', chars: 'words', sound: 'sound', rhyme: 'sound', syllables: 'sound', stress: 'sound', prob: 'context', semantic: 'dictionary' };

const KINDS = [
  { id: 'pos', title: 'Part of speech', desc: 'Rephrasings must contain, start with, end with, or follow a pattern of parts of speech. Starts from the selection\'s own pattern.' },
  { id: 'length', title: 'Word count', desc: 'A minimum and maximum number of words. Starts at the selection\'s length.' },
  { id: 'sound', title: 'Sound', desc: 'Phonemes the rephrasing should contain or start/end with. Starts from the selection\'s pronunciation; type another word to borrow its sound.' },
  { id: 'rhyme', title: 'Rhyme', desc: 'End on a word that rhymes with a reference word, or echo its vowels (assonance), consonants (consonance) or opening sound (alliteration). Starts from the selection\'s last word.' },
  { id: 'syllables', title: 'Syllables', desc: 'A minimum and maximum number of syllables, counted from the pronouncing dictionary. Starts at exactly the selection\'s count.' },
  { id: 'stress', title: 'Stress pattern', desc: 'A rhythm of stressed and unstressed syllables the rephrasing should follow, contain, or start/end with. Starts from the selection\'s own scansion.' },
  { id: 'letters', title: 'Letters', desc: 'Letters the rephrasing must start with (acrostics), contain, or avoid (lipograms: switch to “must not”). Starts from the selection\'s first letter.' },
  { id: 'chars', title: 'Characters', desc: 'A minimum and maximum number of letters, spaces and punctuation not counted, for lines that must fit a shape.' },
  { id: 'prob', title: 'Probability', desc: 'A window on the probability histogram; only rephrasings inside it match. Fill it by running the context well.' },
  { id: 'semantic', title: 'Semantic similarity', desc: 'Rephrasings must stay close to, or far from, the meaning of a reference phrase, as judged by a sentence-embedding model. Starts from the selection itself; needs the semantic similarity model from the landing page.' },
];

function make(kind, inletId, tokens) {
  switch (kind) {
    case 'pos': return makePosConstraint(inletId, tokens);
    case 'length': return makeLengthConstraint(inletId, tokens);
    case 'sound': return makeSoundConstraint(inletId, tokens);
    case 'rhyme': return makeRhymeConstraint(inletId, tokens);
    case 'syllables': return makeSyllableConstraint(inletId, tokens);
    case 'stress': return makeStressConstraint(inletId, tokens);
    case 'letters': return makeLettersConstraint(inletId, tokens);
    case 'chars': return makeCharsConstraint(inletId, tokens);
    case 'prob': return makeProbConstraint(inletId);
    case 'semantic': return makeSemanticConstraint(inletId, tokens);
    default: return null;
  }
}

/**
 * "+ Constraint" button with its chooser popover; lives next to "+ Add well".
 * `others` lists the other inlets that carry constraints ([{ id, text, constraints }])
 * so the same constraints can be reapplied to this inlet in one click.
 */
export function AddConstraint({ inlet, inletTokens, constraints = [], others = [], onAdd }) {
  const [open, setOpen] = useState(false);
  const popRef = useRef(null);
  const btnRef = useRef(null);
  const pos = usePopoverPosition(open, btnRef, 460);

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
    if (c) onAdd(c);
    setOpen(false);
  };
  // constraints on other inlets that this inlet does not already have
  const have = (c) => constraints.some((x) => sameConstraint(x, c));
  const reusable = others.map((o) => ({ ...o, constraints: o.constraints.filter((c) => !have(c)) })).filter((o) => o.constraints.length);
  const reuse = (cs) => {
    cs.forEach((c) => onAdd(cloneConstraint(c, inlet.id)));
    setOpen(false);
  };

  return (
    <div className="add-well">
      <button
        ref={btnRef}
        className={`add-well-button ${open ? 'open' : ''}`}
        disabled={!inlet}
        title={inlet ? 'constrain the rephrasings for this inlet' : 'select a phrase and search first'}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <span aria-hidden="true">＋</span> Constraint
      </button>
      {open && inlet && (
        <div ref={popRef} className="popover glass creamy" style={pos ?? undefined} role="dialog" aria-label="Add a constraint">
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
          {reusable.length > 0 && (
            <>
              <div className="popover-subhead">or reuse a constraint from another inlet</div>
              <div className="reuse-list">
                {reusable.map((o) => (
                  <div key={o.id} className="reuse-row">
                    <span className="reuse-inlet" title={o.text}>{o.text}</span>
                    <span className="reuse-chips">
                      {o.constraints.map((c) => {
                        const st = wellStyles(KIND_WELL[c.kind], true);
                        return (
                          <button key={c.id} className="reuse-chip" style={{ '--well': st.color, '--well-deep': st.textColor, '--well-glass': st.solid }} title={`apply “${constraintSummary(c)}” to this inlet`} onClick={() => reuse([c])}>
                            {constraintSummary(c)}
                          </button>
                        );
                      })}
                      {o.constraints.length > 1 && (
                        <button className="reuse-chip all" title="apply every constraint from this inlet" onClick={() => reuse(o.constraints)}>all {o.constraints.length}</button>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Short label for a constraint chip: "part of speech · contains ADJ ADP". */
export function constraintSummary(c) {
  const fmt = (n) => (Number.isInteger(n) ? n : Number(n).toFixed(1));
  const span = (unit) => (c.min === c.max ? `${c.min} ${unit}` : `${c.min}–${c.max} ${unit}`);
  if (c.kind === 'length') return span('words');
  if (c.kind === 'syllables') return span('syllables');
  if (c.kind === 'chars') return span('characters');
  if (c.kind === 'prob') return `probability ${fmt(c.min)} → ${fmt(c.max)}`;
  if (c.kind === 'semantic') return `meaning ${c.mode} “${c.reference || '?'}”`;
  const not = c.negate ? 'not ' : '';
  if (c.kind === 'rhyme') {
    const negated = { 'rhymes with': 'does not rhyme with', 'assonance with': 'no assonance with', 'consonance with': 'no consonance with', 'alliterates with': 'does not alliterate with' };
    return `${c.negate ? negated[c.mode] : c.mode} “${c.reference || '?'}”`;
  }
  if (c.kind === 'stress') return `stress · ${not}${c.mode} ${c.target.map((x) => (x === '1' ? 'ˈ' : '˘')).join('') || '∅'}`;
  if (c.kind === 'letters') return `letters · ${not}${c.mode} ${c.target.join('') || '∅'}`;
  return `${FEATURE_LABELS[c.kind]} · ${not}${c.mode} ${c.target.join(' ') || '∅'}`;
}

export const constraintWellType = (c) => KIND_WELL[c.kind];

/**
 * One constraint as a card of the same shape as a well: rotated title on the
 * left, editor on the right. Rendered in the same column as the wells.
 */
export function ConstraintCard({ constraint, histogram, actions, session = null, sequences = [] }) {
  const st = wellStyles(KIND_WELL[constraint.kind], true);
  return (
    <div className="constraint-well" style={{ '--well': st.color, '--well-deep': st.textColor }}>
      <div className="constraint-well-title" style={{ color: st.textColor }} title="a constraint on this inlet's rephrasings">
        <span className="well-kind-tag">constraint</span>
        <span className="constraint-well-name">{FEATURE_LABELS[constraint.kind]}</span>
      </div>
      <div className="well-content">
        <ConstraintView
          constraint={constraint}
          styles={st}
          histogram={histogram}
          session={session}
          sequences={sequences}
          onPatch={(patch) => actions.patchConstraint(constraint, patch)}
          onDelete={() => actions.removeConstraint(constraint)}
        />
      </div>
    </div>
  );
}
