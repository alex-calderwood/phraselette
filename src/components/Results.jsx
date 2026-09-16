import React from 'react';
import { SequenceChip } from './TokenRange.jsx';
import { constraintSummary } from './ConstraintsPanel.jsx';

function Group({ label, seqs, wellType, onPick, setTooltip, colorBy, constraints }) {
  if (!seqs?.length) return null;
  return (
    <div className="result-group">
      <div className="sequence-row">
        {seqs.map((s) => <SequenceChip key={s.id} seq={s} wellType={wellType} onClick={onPick} setTooltip={setTooltip} colorBy={colorBy} constraints={constraints} />)}
      </div>
      <div className="subtitle result-caption">{label}</div>
    </div>
  );
}

/** Pass/fail as decided by the constraint itself (see evaluateConstraint), not a cut on the score. */
const matches = (seq, c) => seq.satisfied?.[c.id] ?? false;
const plural = (n) => `${n} rephrasing${n === 1 ? '' : 's'}`;

/**
 * Group rephrasings by the constraints they satisfy: first those that meet
 * every constraint, then one group per constraint (largest first, each
 * rephrasing shown once, under the best-populated constraint it meets), then
 * the rest.
 */
function groupByConstraints(all, constraints) {
  if (!constraints?.length) return [{ label: plural(all.length), seqs: all }];
  const groups = [];
  const remaining = new Set(all);
  if (constraints.length > 1) {
    const every = all.filter((s) => constraints.every((c) => matches(s, c)));
    if (every.length) {
      groups.push({ label: `${plural(every.length)} match all ${constraints.length} constraints`, seqs: every });
      every.forEach((s) => remaining.delete(s));
    }
  }
  const counted = constraints
    .map((c) => ({ c, count: all.filter((s) => matches(s, c)).length }))
    .sort((a, b) => b.count - a.count);
  for (const { c, count } of counted) {
    const seqs = [...remaining].filter((s) => matches(s, c));
    if (!seqs.length) continue;
    const hidden = count - seqs.length;
    groups.push({ label: `${plural(count)} match ${constraintSummary(c)}${hidden ? ` (${hidden} shown above)` : ''}`, seqs });
    seqs.forEach((s) => remaining.delete(s));
  }
  const rest = [...remaining];
  if (rest.length) groups.push({ label: `${plural(rest.length)} match no constraint`, seqs: rest });
  return groups;
}

/** Rephrasings for one well or for everything, grouped by the constraints they meet. */
export default function Results({ results, searching, constraints = [], wellType = null, onPick, setTooltip, colorBy = 'origin' }) {
  if (searching && !results) return <div className="results rainbow-animated searching" />;
  if (!results) return null;
  const all = results.all ?? [];
  if (!all.length) return <div className="results"><div className="subtitle">no rephrasings</div></div>;
  const groups = groupByConstraints(all, constraints);
  return (
    <div className="results">
      {groups.map((g) => <Group key={g.label} label={g.label} seqs={g.seqs} wellType={wellType} onPick={onPick} setTooltip={setTooltip} colorBy={colorBy} constraints={constraints} />)}
    </div>
  );
}
