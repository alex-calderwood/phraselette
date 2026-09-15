import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { categoryColor, logProbColor } from '../lib/colors.js';

/**
 * Plain textarea for typing; a mirrored layer behind it paints token colors
 * (part of speech, probability, sound) and the inlets. The two share font,
 * padding and wrapping so the overlay lines up with the text.
 */
export default function Editor({ text, tokens, probTokens, inlets, highlightType, range, isInlet, searching, onSearch, onRemoveInlet, onText, onSelection, editorRef }) {
  const backdropRef = useRef(null);
  const shellRef = useRef(null);
  const taRef = editorRef;
  const [fab, setFab] = useState(null); // { top, left, below } position of the floating Search button
  const [fabVisible, setFabVisible] = useState(false);

  const segments = useMemo(() => buildSegments(text, tokens, probTokens, inlets, highlightType, range), [text, tokens, probTokens, inlets, highlightType, range]);

  // Position the floating Search button next to the selection. Coordinates come
  // from a hidden mirror of the textarea (the standard caret-coordinates trick),
  // measured relative to the shell, so the pill sits directly above the phrase.
  useLayoutEffect(() => {
    if (!range || !fabVisible || !taRef.current || !shellRef.current) { setFab(null); return; }
    const ta = taRef.current;
    const shell = shellRef.current.getBoundingClientRect();
    const a = caretCoords(ta, range.start);
    const b = caretCoords(ta, range.end);
    if (!a || !b) { setFab(null); return; }
    const taRect = ta.getBoundingClientRect();
    const toShell = (c) => ({ x: taRect.left - shell.left + c.left - ta.scrollLeft, y: taRect.top - shell.top + c.top - ta.scrollTop, h: c.height });
    const A = toShell(a); const B = toShell(b);
    const roomAbove = A.y > 44;
    const anchorX = roomAbove ? A.x : B.x;
    const left = Math.max(8, Math.min(shell.width - 170, anchorX - 12));
    setFab(roomAbove ? { top: A.y - 38, left, below: false } : { top: B.y + B.h + 8, left, below: true });
  }, [range, fabVisible, text]);

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
          <span key={s.key} className={s.inlet ? 'seg rain' : 'seg'} style={s.color ? { backgroundColor: s.color } : undefined}>{s.text}</span>
        ))}
        {/* trailing newline keeps the backdrop the same height as the textarea */}
        {'\n'}
      </div>
      <textarea
        ref={taRef}
        className="editor-textarea"
        value={text}
        spellCheck={false}
        placeholder="Write a poem. Then highlight a phrase."
        onChange={(e) => { setFabVisible(false); onText(e.target.value); }}
        onSelect={report}
        onKeyUp={report}
        onMouseUp={report}
        onBlur={(e) => { if (!e.relatedTarget?.closest?.('.editor-fab')) setFabVisible(false); }}
        onScroll={() => { syncScroll(); setFabVisible(false); }}
      />
      {fab && range && !searching && (
        <div className={`editor-fab ${fab.below ? 'below' : 'above'}`} style={{ top: fab.top, left: fab.left }} onMouseDown={(e) => e.preventDefault()} /* keep the textarea's selection */>
          <button className="editor-fab-main" onClick={() => onSearch()} title={isInlet ? 'Run every well again on this inlet (⌘↵)' : 'Open this phrase as an inlet and run every well (⌘↵)'}>
            <span aria-hidden="true">🖌️</span> {isInlet ? 'Search again' : 'Search'}
          </button>
          {isInlet && (
            <button className="editor-fab-remove" onClick={() => onRemoveInlet()} title="Remove this inlet (the text stays)">×</button>
          )}
        </div>
      )}
    </div>
  );
}

function buildSegments(text, tokens, probTokens, inlets, highlightType, range = null) {
  const bounds = new Set([0, text.length]);
  if (range) { bounds.add(range.start); bounds.add(range.end); }
  const colorSpans = [];
  if (highlightType === 'context' && probTokens) {
    for (const t of probTokens) if (t.logProb != null) colorSpans.push({ start: t.start, end: t.end, color: logProbColor(t.logProb) });
  } else if (highlightType === 'words' || highlightType === 'sound') {
    for (const t of tokens) {
      if (t.isSpace) continue;
      const key = highlightType === 'words' ? t.pos : (t.rhymingPart?.[0] ?? null);
      if (key) colorSpans.push({ start: t.start, end: t.end, color: categoryColor(key) });
    }
  }
  for (const s of colorSpans) { bounds.add(s.start); bounds.add(s.end); }
  for (const i of inlets) { bounds.add(i.start); bounds.add(i.end); }
  const cuts = [...bounds].filter((b) => b >= 0 && b <= text.length).sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i + 1 < cuts.length; i++) {
    const s = cuts[i]; const e = cuts[i + 1];
    if (e <= s) continue;
    const mid = (s + e) / 2;
    const span = colorSpans.find((c) => c.start <= s && c.end >= e);
    const inlet = inlets.some((n) => n.start <= mid && mid <= n.end);
    out.push({ key: `${s}-${e}`, start: s, text: text.slice(s, e), color: span?.color ?? null, inlet });
  }
  return out;
}


const MIRROR_PROPS = [
  'boxSizing', 'width', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
  'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontVariant', 'letterSpacing', 'wordSpacing',
  'lineHeight', 'textTransform', 'textIndent', 'whiteSpace', 'wordBreak', 'overflowWrap', 'tabSize',
];
let mirror = null;

/** Pixel position of character `index` inside a textarea, relative to its padding box (before scrolling). */
function caretCoords(ta, index) {
  if (!mirror) {
    mirror = document.createElement('div');
    mirror.setAttribute('aria-hidden', 'true');
    Object.assign(mirror.style, { position: 'absolute', visibility: 'hidden', top: '0', left: '-9999px', overflow: 'hidden', pointerEvents: 'none' });
    document.body.appendChild(mirror);
  }
  const cs = getComputedStyle(ta);
  for (const p of MIRROR_PROPS) mirror.style[p] = cs[p];
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.height = 'auto';
  mirror.textContent = ta.value.slice(0, index);
  const span = document.createElement('span');
  span.textContent = ta.value.slice(index, index + 1) || '.';
  mirror.appendChild(span);
  const rect = { left: span.offsetLeft, top: span.offsetTop, height: span.offsetHeight || parseFloat(cs.lineHeight) || 20 };
  mirror.textContent = '';
  return rect;
}
