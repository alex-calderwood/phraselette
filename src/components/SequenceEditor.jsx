import React, { useEffect, useRef, useState } from 'react';
import { categoryColor } from '../lib/colors.js';
import { createPortal } from 'react-dom';
import { usePopoverPosition } from './usePopover.js';
import { phonesOfTokens, stressesOfTokens, lettersOfText } from '../core/constraints.js';
import { VOWELS, CONSONANTS, PHONE_DETAILS } from '../lang/phones.js';
import { tagWithWink, attachPhones } from '../lang/tagger.js';

/**
 * Editor for a constraint's target sequence (phonemes, letters, stresses or
 * POS tags), built like a tag input:
 *   - the sequence is a row of tiles; click one to remove it, drag to reorder;
 *   - an input sits at the end: type a word and press Enter (or space) to
 *     append what the word is made of, Backspace on an empty input drops the
 *     last tile, and a symbol typed in capitals (AA, NOUN) is taken literally;
 *   - hovering or focusing the editor floats a palette of every symbol beneath
 *     it; clicking a palette tile appends it. The palette is portalled to the
 *     body: the inspector's backdrop filter would otherwise trap a fixed
 *     element inside its scroll box. React still routes its hover events
 *     through this component, so leaving the editor for the palette does not
 *     close it.
 * Sound tiles stack the ARPAbet symbol, its IPA value and Wikipedia's
 * respelling with an example word.
 */

/** Lines shown on one tile, top to bottom. */
export function tileLines(kind, item, labels) {
  if (kind === 'sound') {
    const d = PHONE_DETAILS[item];
    return d ? [item, d.ipa, `${d.respell} · ${d.example}`] : [item];
  }
  if (kind === 'stress') return [item === '1' ? 'ˈ' : '˘', item === '1' ? 'stressed' : 'unstressed'];
  return [labels?.[item] ?? item];
}

/** Palette groups for a kind: [[label|null, items], …]. */
function paletteGroups(kind, range) {
  if (kind === 'sound') return [['vowels', range.filter((p) => VOWELS.has(p))], ['consonants', range.filter((p) => CONSONANTS.includes(p))]];
  return [[null, range]];
}

/** What typed text adds to the sequence: a literal symbol, or the parts of the word(s) typed. */
export function itemsFromText(kind, text, range) {
  const t = text.trim();
  if (!t) return [];
  const upper = t.toUpperCase();
  if ((kind === 'sound' || kind === 'pos') && range.includes(upper)) return [upper];
  if (kind === 'letters') return lettersOfText(t).filter((l) => range.includes(l));
  if (kind === 'stress') {
    if (/^[01˘ˈ]+$/.test(t)) return t.split('').map((ch) => (ch === 'ˈ' ? '1' : ch === '˘' ? '0' : ch));
    return stressesOfTokens(attachPhones(tagWithWink(t)));
  }
  const tokens = attachPhones(tagWithWink(t));
  if (kind === 'sound') return phonesOfTokens(tokens);
  if (kind === 'pos') return tokens.filter((tok) => !tok.isSpace && tok.pos !== '_SP' && range.includes(tok.pos)).map((tok) => tok.pos);
  return range.includes(t) ? [t] : [];
}

const PLACEHOLDER = { sound: 'type a word or click a sound…', letters: 'type letters or a word…', stress: 'type a word, or 0 and 1…', pos: 'type a word or a tag…' };
const WIDTH = { sound: 430, letters: 330, stress: 200, pos: 330 };

/** Tile colors: part-of-speech tiles wear the tag's own color (as in the editor and the token chips); other kinds wear the well's. */
function tileStyle(kind, item, styles) {
  return kind === 'pos' ? { ...styles.button, backgroundColor: categoryColor(item), color: 'var(--primary-text)' } : styles.button;
}

function Tile({ kind, item, labels, style, className = '', ...rest }) {
  const lines = tileLines(kind, item, labels);
  return (
    <span className={`seq-tile ${className}`} style={style} {...rest}>
      {lines.map((l, i) => <span key={i} className={`t${i + 1}`}>{l}</span>)}
    </span>
  );
}

export default function SequenceEditor({ kind, range, labels = null, target, onChange, styles }) {
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const closeTimer = useRef(null);
  const [text, setText] = useState('');
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [drag, setDrag] = useState(null); // { from, over, after }
  const open = hover || focus;
  const pos = usePopoverPosition(open, wrapRef, WIDTH[kind] ?? 330, 240);
  useEffect(() => () => clearTimeout(closeTimer.current), []);

  const enter = () => { clearTimeout(closeTimer.current); setHover(true); };
  const leave = () => { clearTimeout(closeTimer.current); closeTimer.current = setTimeout(() => setHover(false), 180); };

  const append = (items) => { if (items.length) onChange([...target, ...items]); };
  const commit = () => { append(itemsFromText(kind, text, range)); setText(''); };
  const removeAt = (i) => onChange(target.filter((_, j) => j !== i));

  const onKey = (e) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === ',') { e.preventDefault(); commit(); }
    else if (e.key === 'Backspace' && !text && target.length) { e.preventDefault(); removeAt(target.length - 1); }
    else if (e.key === 'Escape') { setText(''); inputRef.current?.blur(); }
  };

  // reorder by dragging a tile onto another (dropped on the left half: before it; right half: after)
  const onDrop = (e) => {
    e.preventDefault();
    if (!drag || drag.over == null) { setDrag(null); return; }
    const next = [...target];
    const [moved] = next.splice(drag.from, 1);
    let to = drag.over + (drag.after ? 1 : 0);
    if (drag.from < to) to -= 1;
    next.splice(to, 0, moved);
    setDrag(null);
    onChange(next);
  };

  return (
    <div
      ref={wrapRef}
      className={`seq-editor ${open ? 'open' : ''}`}
      onMouseEnter={enter}
      onMouseLeave={leave}
      onFocus={() => setFocus(true)}
      onBlur={(e) => { if (!wrapRef.current?.contains(e.relatedTarget)) { setFocus(false); commit(); } }}
      onClick={(e) => { if (e.target === e.currentTarget) inputRef.current?.focus(); }}
      onDragOver={(e) => { if (drag) e.preventDefault(); }}
      onDrop={onDrop}
    >
      {target.map((item, i) => (
        <Tile
          key={i}
          kind={kind}
          item={item}
          labels={labels}
          style={tileStyle(kind, item, styles)}
          className={`in-sequence ${drag?.from === i ? 'dragging' : ''} ${drag?.over === i && drag.from !== i ? (drag.after ? 'drop-after' : 'drop-before') : ''}`}
          title="click to remove · drag to reorder"
          draggable
          onClick={() => removeAt(i)}
          onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', item); setDrag({ from: i, over: null, after: false }); }}
          onDragEnd={() => setDrag(null)}
          onDragOver={(e) => { if (!drag) return; e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); setDrag((d) => d && { ...d, over: i, after: e.clientX > r.left + r.width / 2 }); }}
        />
      ))}
      <input
        ref={inputRef}
        className="seq-input"
        value={text}
        placeholder={target.length ? '' : PLACEHOLDER[kind] ?? 'type…'}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKey}
        aria-label="add to the sequence"
      />
      {open && pos && createPortal(
        <div className="seq-palette glass creamy" style={pos} onMouseDown={(e) => e.preventDefault()} onMouseEnter={enter} onMouseLeave={leave} role="listbox" aria-label="symbols to add">
          {paletteGroups(kind, range).map(([label, items]) => (
            <div key={label ?? 'all'} className="seq-palette-group">
              {label && <span className="seq-palette-label">{label}</span>}
              {items.map((item) => (
                <Tile key={item} kind={kind} item={item} labels={labels} style={tileStyle(kind, item, styles)} className="in-palette" role="option" title="add" onClick={() => append([item])} />
              ))}
            </div>
          ))}
          <div className="seq-hint">click to add · click a tile in the sequence to remove it · drag to reorder · type a word and press Enter · ⌫ drops the last</div>
        </div>,
        document.body,
      )}
    </div>
  );
}
