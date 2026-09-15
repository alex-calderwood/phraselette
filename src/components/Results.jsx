import React from 'react';
import { SequenceChip } from './TokenRange.jsx';

function Group({ label, seqs, wellType, onPick, setTooltip, colorBy }) {
  if (!seqs?.length) return <div className="subtitle">no rephrasings {label}</div>;
  return (
    <>
      <div className="subtitle">{seqs.length} rephrasing{seqs.length === 1 ? '' : 's'} {label}</div>
      <div className="sequence-row">
        {seqs.map((s) => <SequenceChip key={s.id} seq={s} wellType={wellType} onClick={onPick} setTooltip={setTooltip} colorBy={colorBy} />)}
      </div>
    </>
  );
}

/** Accepted / rejected rephrasings for one well or for everything. */
export default function Results({ results, searching, wellType = null, splitByFilter = true, hasConstraints = true, onPick, setTooltip, colorBy = 'origin' }) {
  if (searching && !results) return <div className="results rainbow-animated searching" />;
  if (!results) return null;
  const where = 'the constraints';
  if (!splitByFilter || !hasConstraints) {
    return <div className="results"><Group label="" seqs={results.all} wellType={wellType} onPick={onPick} setTooltip={setTooltip} colorBy={colorBy} /></div>;
  }
  return (
    <div className="results">
      <Group label={`match ${where}`} seqs={results.accepted} wellType={wellType} onPick={onPick} setTooltip={setTooltip} colorBy={colorBy} />
      <Group label={`fail to match ${where}`} seqs={results.rejected} wellType={wellType} onPick={onPick} setTooltip={setTooltip} colorBy={colorBy} />
    </div>
  );
}
