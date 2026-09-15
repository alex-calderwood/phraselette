import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { categoryColor, logProbColor } from '../lib/colors.js';

/**
 * Plain textarea for typing; a mirrored layer behind it paints token colours
 * (part of speech, probability, sound) and the inlets. The two share font,
 * padding and wrapping so the overlay lines up with the text.
 */
export default function Editor({ text, tokens, probTokens, inlets, highlightType, range, isInlet, searching, onSearch, onText, onSelection, editorRef }) {
  const backdropRef = useRef(null);
  const shellRef = useRef(null);
  const taRef = editorRef;
  const [fab, setFab] = useState(null); // { top, left, below } position of the floating Search button
  const [fabVisible, setFabVisible] = useState(false);

  const segments = useMemo(() => buildSegments(text, tokens, probTokens, inlets, highlightType, range), [text, tokens, probTokens, inlets, highlightType, range]);

  // Position the floating Search button next to the selection, using the mirror layer's marker spans.
  useLayoutEffect(() => {
    if (!range || !fabVisible || !backdropRef.current || !shellRef.current) { setFab(null); return; }
    const shell = shellRef.current.getBoundingClientRect();
    const startEl = backdropRef.current.querySelector('[data-marker="start"]');
    const endEl = backdropRef.current.querySelector('[data-marker="end"]');
    if (!startEl || !endEl) { setFab(null); return; }
    const a = startEl.getBoundingClientRect();
    const b = endEl.getBoundingClientRect();
    const roomAbove = a.top - shell.top > 44;
    const left = Math.max(8, Math.min(shell.width - 150, (roomAbove ? a.left : b.left) - shell.left));
    setFab(roomAbove ? { top: a.top - shell.top - 40, left, below: false } : { top: b.bottom - shell.top + 8, left, below: true });
  }, [range, fabVisible, segments]);

  const syncScroll = () => {
    if (backdropRef.current && taRef.current) {
      backdropRef.current.scrollTop = taRef.current.scrollTop;
      backdropRef.current.scrollLeft = taRef.current.scrollLeft;
    }
  };
  useEffect(syncScroll, [segments]);

  const report = () => {
    const ta = taRef.current;
    if (ta) { onSelection(ta.selectionStart, ta.selectionEnd); setFabVisible(true); }
  };

  return (
    <div className="editor-shell" ref={shellRef}>
      <div className="editor-backdrop" ref={backdropRef} aria-hidden="true">
        {segments.map((s) => (
          <React.Fragment key={s.key}>
            {range && s.start === range.start && <span className="marker" data-marker="start" />}
            {range && s.start === range.end && <span className="marker" data-marker="end" />}
            <span className={s.inlet ? 'seg rain' : 'seg'} style={s.color ? { backgroundColor: s.color } : undefined}>{s.text}</span>
          </React.Fragment>
        ))}
        {range && range.end === text.length && <span className="marker" data-marker="end" />}
        {/* trailing newline keeps the backdrop the same height as the textarea */}
        {'\n'}
      </div>
      <textarea
        ref={taRef}
        className="editor-textarea"
        value={text}
        spellCheck={false}
        placeholder="Paste or write a poem. Then highlight a phrase."
        onChange={(e) => { setFabVisible(false); onText(e.target.value); }}
        onSelect={report}
        onKeyUp={report}
        onMouseUp={report}
        onBlur={(e) => { if (!e.relatedTarget?.closest?.('.editor-fab')) setFabVisible(false); }}
        onScroll={() => { syncScroll(); setFabVisible(false); }}
      />
      {fab && range && (
        <button
          className={`editor-fab ${fab.below ? 'below' : 'above'} ${searching ? 'busy' : ''}`}
          style={{ top: fab.top, left: fab.left }}
          onMouseDown={(e) => e.preventDefault()} /* keep the textarea's selection */
          onClick={() => onSearch()}
          title={isInlet ? 'Run every well again on this inlet (⌘↵)' : 'Open this phrase as an inlet and run every well (⌘↵)'}
        >
          <span aria-hidden="true">🖌️</span> {searching ? 'Searching…' : isInlet ? 'Search again' : 'Search'}
        </button>
      )}
    </div>
  );
}

function buildSegments(text, tokens, probTokens, inlets, highlightType, range = null) {
  const bounds = new Set([0, text.length]);
  if (range) { bounds.add(range.start); bounds.add(range.end); }
  const colourSpans = [];
  if (highlightType === 'context' && probTokens) {
    for (const t of probTokens) if (t.logProb != null) colourSpans.push({ start: t.start, end: t.end, color: logProbColor(t.logProb) });
  } else if (highlightType === 'words' || highlightType === 'sound') {
    for (const t of tokens) {
      if (t.isSpace) continue;
      const key = highlightType === 'words' ? t.pos : (t.rhymingPart?.[0] ?? null);
      if (key) colourSpans.push({ start: t.start, end: t.end, color: categoryColor(key) });
    }
  }
  for (const s of colourSpans) { bounds.add(s.start); bounds.add(s.end); }
  for (const i of inlets) { bounds.add(i.start); bounds.add(i.end); }
  const cuts = [...bounds].filter((b) => b >= 0 && b <= text.length).sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i + 1 < cuts.length; i++) {
    const s = cuts[i]; const e = cuts[i + 1];
    if (e <= s) continue;
    const mid = (s + e) / 2;
    const span = colourSpans.find((c) => c.start <= s && c.end >= e);
    const inlet = inlets.some((n) => n.start <= mid && mid <= n.end);
    out.push({ key: `${s}-${e}`, start: s, text: text.slice(s, e), color: span?.color ?? null, inlet });
  }
  return out;
}
