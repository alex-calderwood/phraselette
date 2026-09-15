import React from 'react';
import { categoryColor, logProbColor, humanLog } from '../lib/colors.js';
import { WELL_DEFS, wellColor } from '../core/wells.js';
import { hoverProps } from './Tooltip.jsx';

function tokenColor(showItems, token) {
  if (showItems.includes('prob') && typeof token.logProbMean === 'number') return logProbColor(token.logProbMean);
  if (showItems.includes('pos')) return categoryColor(token.pos);
  if (showItems.includes('sound')) return categoryColor(token.rhymingPart?.[0] ?? '');
  return 'rgba(255,255,255,0.4)';
}

/** How a rephrasing's words are tinted: by the well they came from, by probability, or by part of speech. */
export const COLOR_MODES = [
  { id: 'origin', label: 'source' },
  { id: 'prob', label: 'probability' },
  { id: 'pos', label: 'part of speech' },
];

function chipColor(colorBy, showItems, token, originColor) {
  if (colorBy === 'origin' && originColor) return `color-mix(in srgb, ${originColor} 60%, white)`;
  if (colorBy === 'pos') return categoryColor(token.pos);
  if (colorBy === 'prob') return typeof token.logProbMean === 'number' ? logProbColor(token.logProbMean) : 'rgba(255,255,255,0.5)';
  return tokenColor(showItems, token);
}

export function TokenChip({ token, showItems, expanded, colorBy = null, originColor = null }) {
  if (token.isSpace) return <span className="token space" key={token.id} />;
  const color = chipColor(colorBy, showItems, token, originColor);
  const prob = showItems.includes('prob') && typeof token.logProbMean === 'number' ? humanLog(token.logProbMean) : null;
  const sound = showItems.includes('sound') ? token.phonemes?.[0] ?? null : null;
  const pos = showItems.includes('pos') ? token.pos : null;
  return (
    <span className={`token ${expanded ? '' : 'simple'}`} style={{ backgroundColor: color }}>
      <span className="item heading">{token.text}</span>
      {expanded && pos && <span className="item" style={{ backgroundColor: categoryColor(pos) }}>{pos}</span>}
      {expanded && prob != null && <span className="item" style={{ backgroundColor: color }}>{prob}</span>}
      {expanded && sound && <span className="item" style={{ backgroundColor: categoryColor(token.rhymingPart?.[0] ?? '') }}>{sound}</span>}
    </span>
  );
}

/** Row of word tokens (the inlet as seen through one well). */
export function TokenRow({ tokens, wellType, expanded = true }) {
  const showItems = WELL_DEFS[wellType]?.showItems ?? ['pos'];
  return (
    <div className="token-row">
      {tokens.map((t) => <TokenChip key={t.id} token={t} showItems={showItems} expanded={expanded} />)}
    </div>
  );
}

/** One rephrasing chip; expands with all view data on hover (via the global tooltip). */
export function SequenceChip({ seq, wellType, expanded = false, onClick, setTooltip, colorBy = 'origin' }) {
  const showItems = wellType && WELL_DEFS[wellType] ? WELL_DEFS[wellType].showItems : ['pos', 'sound', 'prob'];
  const origin = wellColor(seq.origin, seq.originShade);
  const bg = colorBy === 'prob' && typeof seq.logProbMean === 'number' ? logProbColor(seq.logProbMean) : `color-mix(in srgb, ${origin} 55%, white)`;
  // Collapsed and colored by source: the chip is just the text, no per-word boxes.
  const plain = !expanded && colorBy === 'origin';
  const body = (
    <span className={`sequence ${expanded ? 'expanded' : ''} ${plain ? 'plain' : ''}`} style={{ borderColor: origin, backgroundColor: bg }} onClick={onClick ? () => onClick(seq) : undefined}>
      {plain
        ? <span className="sequence-text">{seq.text.replace(/^[ \t]+/, '').replace(/\n+/g, ' ⏎ ').replace(/\s{2,}/g, ' ')}</span>
        : seq.tokens.filter((t, i) => !(i === 0 && t.isSpace)).map((t) => <TokenChip key={t.id} token={t} showItems={showItems} expanded={expanded} colorBy={expanded ? null : colorBy} originColor={origin} />)}
      {expanded && typeof seq.logProbMean === 'number' && <span className="item tag" style={{ backgroundColor: logProbColor(seq.logProbMean) }}>{humanLog(seq.logProbMean)}</span>}
      {expanded && <span className="item tag" style={{ backgroundColor: origin }}>{seq.origin}</span>}
    </span>
  );
  if (expanded || !setTooltip) return body;
  const tip = <SequenceChip seq={seq} wellType={wellType} expanded colorBy={colorBy} />;
  return React.cloneElement(body, hoverProps(setTooltip, tip, { styled: false }));
}
