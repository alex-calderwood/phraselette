import React, { useEffect, useMemo, useRef, useState } from 'react';
import { WELL_TYPES, WELL_DEFS, wellColor } from '../core/wells.js';
import { ROLES } from '../lang/roles.js';
import { deepen, glassify } from '../lib/colors.js';

/**
 * One "Add well" button that opens a two-step popover: pick a well type, then
 * (for role wells) pick a preset role or write your own.
 */
export default function AddWell({ wells, onAdd }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState(null);
  const [role, setRole] = useState('');
  const [filter, setFilter] = useState('');
  const popRef = useRef(null);
  const buttonRef = useRef(null);

  const singularOpen = (t) => !WELL_DEFS[t].roles && wells.some((w) => w.type === t && w.active);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (!popRef.current?.contains(e.target) && !buttonRef.current?.contains(e.target)) close(); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const close = () => { setOpen(false); setType(null); setRole(''); setFilter(''); };

  const pick = (t) => {
    if (WELL_DEFS[t].roles) { setType(t); setRole(''); setFilter(''); }
    else { onAdd(t); close(); }
  };
  const finish = (r) => { onAdd(type, r.trim()); close(); };

  const presets = useMemo(() => {
    if (!type) return [];
    const q = filter.trim().toLowerCase();
    return (ROLES[type] ?? []).filter((r) => !q || r.toLowerCase().includes(q));
  }, [type, filter]);

  return (
    <div className="add-well">
      <button ref={buttonRef} className={`add-well-button ${open ? 'open' : ''}`} onClick={() => (open ? close() : setOpen(true))} aria-expanded={open} aria-haspopup="dialog">
        <span aria-hidden="true">＋</span> Add well
      </button>

      {open && (
        <div ref={popRef} className="popover glass creamy" role="dialog" aria-label="Add a well">
          {!type ? (
            <>
              <div className="popover-head">
                <span className="popover-title">Choose a well</span>
                <span className="popover-step">1 of 2</span>
              </div>
              <div className="well-choices">
                {WELL_TYPES.map((t) => {
                  const def = WELL_DEFS[t];
                  const color = wellColor(t);
                  const disabled = singularOpen(t);
                  return (
                    <button key={t} className="well-choice" style={{ '--well': color, '--well-deep': deepen(color), '--well-glass': glassify(color, 0.5) }} disabled={disabled} onClick={() => pick(t)}>
                      <span className="well-choice-title">{def.title}{disabled && <span className="well-choice-note"> · already open</span>}{def.roles && <span className="well-choice-note"> · takes a role</span>}</span>
                      <span className="well-choice-desc">{def.description}</span>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <div className="popover-head">
                <button className="popover-back" onClick={() => setType(null)}>‹ back</button>
                <span className="popover-title">{WELL_DEFS[type].title}: choose a role</span>
                <span className="popover-step">2 of 2</span>
              </div>
              <form className="role-own" onSubmit={(e) => { e.preventDefault(); if (role.trim()) finish(role); }}>
                <textarea
                  autoFocus
                  rows={2}
                  placeholder={`Write your own, e.g. ${(ROLES[type] ?? [''])[0]}`}
                  value={role}
                  onChange={(e) => { setRole(e.target.value); setFilter(e.target.value); }}
                />
                <button type="submit" className="primary" disabled={!role.trim()}>Add with this role</button>
              </form>
              <div className="popover-subhead">or pick a preset{filter.trim() ? ` matching “${filter.trim()}”` : ''}</div>
              <div className="role-presets">
                {presets.map((r) => (
                  <button key={r} className="role-preset" onClick={() => finish(r)} title={r}>{r}</button>
                ))}
                {presets.length === 0 && <div className="subtitle">no preset matches; add your own text above</div>}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
