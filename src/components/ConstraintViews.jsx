import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MODES, SEMANTIC_MODES, SEMANTIC_CUTOFF, semanticSimilarity } from '../core/constraints.js';
import { embeddingsLoaded } from '../models/catalog.js';
import SequenceEditor from './SequenceEditor.jsx';
import { logProbColor, humanLog } from '../lib/colors.js';

function Wrapper({ styles, onDelete, children }) {
  return (
    <div className="constraint">
      {children}
      <button className="constraint-delete" style={styles.button} title="remove constraint" onClick={onDelete}>×</button>
    </div>
  );
}

/** "must" / "must not": flips the constraint's score. */
function NegateSelect({ constraint, styles, onPatch }) {
  return (
    <select style={styles.button} value={constraint.negate ? 'not' : 'must'} onChange={(e) => onPatch({ negate: e.target.value === 'not' })} title="require or forbid">
      <option value="must">must</option>
      <option value="not">must not</option>
    </select>
  );
}

/** POS, sound, stress or letters: must / must not, a mode, and the target sequence in a tag-style editor (SequenceEditor). */
export function CategoryConstraintView({ constraint, styles, onPatch, onDelete }) {
  return (
    <Wrapper styles={styles} onDelete={onDelete}>
      <div className="constraint-line">
        <NegateSelect constraint={constraint} styles={styles} onPatch={onPatch} />
        <select style={styles.button} value={constraint.mode} onChange={(e) => onPatch({ mode: e.target.value })}>
          {MODES.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      <SequenceEditor kind={constraint.kind} range={constraint.range} labels={constraint.labels} target={constraint.target} onChange={(target) => onPatch({ target })} styles={styles} />
    </Wrapper>
  );
}

/**
 * Semantic similarity: a reference phrase, "close to" / "far from", and the
 * cosine cutoff between the two. The reference is embedded by actions.js after
 * each change; until then the hint says so.
 */
export function SemanticConstraintView({ constraint, styles, onPatch, onDelete, session, sequences = [] }) {
  const [ref, setRef] = useState(constraint.reference ?? '');
  const useReference = () => { const r = ref.trim(); if (r !== (constraint.reference ?? '')) onPatch({ reference: r }); };
  const cutoff = constraint.cutoff ?? SEMANTIC_CUTOFF;
  // similarity of every suggestion for the inlet that has been embedded so far (the histogram's data points)
  const sims = useMemo(() => sequences.map((s) => semanticSimilarity(constraint, s)).filter((v) => v != null), [sequences, constraint.vector]);
  const matching = sims.filter((v) => (constraint.mode === 'close to' ? v >= cutoff : v < cutoff)).length;
  let hint;
  if (!embeddingsLoaded(session)) hint = 'no embedding model loaded: choose one under “models…” for this constraint to take effect';
  else if (!constraint.reference) hint = 'type a phrase to compare with';
  else if (!constraint.vector) hint = 'embedding the reference…';
  else if (!sims.length) hint = `a similarity ${constraint.mode === 'close to' ? 'of at least' : 'below'} ${cutoff.toFixed(2)} counts as a match; search to see where the suggestions fall`;
  else hint = `${matching} of ${sims.length} suggestion${sims.length === 1 ? '' : 's'} ${constraint.mode === 'close to' ? 'at or above' : 'below'} the cutoff of ${cutoff.toFixed(2)}`;
  return (
    <Wrapper styles={styles} onDelete={onDelete}>
      <div className="constraint-line">
        <span className="text">meaning</span>
        <select style={styles.button} value={constraint.mode} onChange={(e) => onPatch({ mode: e.target.value })} title="which side of the cutoff matches">
          {SEMANTIC_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <form className="constraint-ref" onSubmit={(e) => { e.preventDefault(); useReference(); }}>
          <input style={styles.button} placeholder="a phrase to compare with…" value={ref} onChange={(e) => setRef(e.target.value)} onBlur={useReference} />
          <button type="submit" style={styles.button}>›</button>
        </form>
      </div>
      <SimilarityHistogram sims={sims} cutoff={cutoff} mode={constraint.mode} color={styles.color} deepColor={styles.textColor} onChange={(v) => onPatch({ cutoff: v })} />
      <div className="constraint-line"><span className="text constraint-hint">{hint}</span></div>
    </Wrapper>
  );
}

const SIM_BINS = 25;

/**
 * Where the inlet's suggestions fall in similarity to the reference, on a 0..1
 * axis (sentence embeddings almost never go negative; anything that does lands
 * in the first bin). Bars count suggestions per bin and a tick at the base marks
 * each one, so a handful of results still reads. The side that matches is drawn
 * in the constraint's color, the other side in grey, and the cutoff is one line
 * you drag to choose the threshold.
 */
export function SimilarityHistogram({ sims, cutoff, mode, color, deepColor, onChange }) {
  const canvasRef = useRef(null);
  const dragging = useRef(false);
  const [local, setLocal] = useState(cutoff);
  useEffect(() => setLocal(cutoff), [cutoff]);
  const clamp01 = (v) => Math.max(0, Math.min(1, v));

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const parent = canvas.parentElement;
    const scale = window.devicePixelRatio || 1;
    const w = parent.clientWidth; const h = parent.clientHeight;
    canvas.width = w * scale; canvas.height = h * scale;
    canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const base = 5; const gap = 3;
    const matches = (v) => (mode === 'close to' ? v >= local : v < local);
    if (sims.length) {
      const counts = Array(SIM_BINS).fill(0);
      for (const v of sims) counts[Math.min(SIM_BINS - 1, Math.floor(clamp01(v) * SIM_BINS))]++;
      const maxC = Math.max(...counts, 1);
      const bw = w / SIM_BINS;
      counts.forEach((c, i) => {
        const mid = (i + 0.5) / SIM_BINS;
        ctx.fillStyle = matches(mid) ? color : '#c9c4cf';
        if (c) ctx.fillRect(i * bw, h - base - gap - Math.ceil((c / maxC) * (h - base - gap - 4)), Math.ceil(bw) - 1, Math.ceil((c / maxC) * (h - base - gap - 4)));
        ctx.globalAlpha = 0.35; ctx.fillRect(i * bw, h - base, Math.ceil(bw), base); ctx.globalAlpha = 1;
      });
      // one tick per suggestion along the base, so sparse results still show where they sit
      for (const v of sims) {
        ctx.fillStyle = matches(v) ? deepColor : 'rgba(60,44,72,0.55)';
        ctx.fillRect(Math.round(clamp01(v) * (w - 1)), h - base - 1, 1, base + 1);
      }
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.font = '10px sans-serif';
      ctx.fillText('search to see where the suggestions fall', 6, h / 2);
    }
    // the cutoff
    const x = Math.max(1, Math.min(w - 1, local * w));
    ctx.strokeStyle = deepColor; ctx.fillStyle = deepColor; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, 3, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2f2f2f'; ctx.font = '9px sans-serif';
    ctx.fillText(local.toFixed(2), x + 4 + 24 > w ? x - 26 : x + 4, h - 8);
    ctx.fillStyle = 'rgba(60,44,72,0.45)';
    ctx.fillText('0', 2, 9); ctx.fillText('1', w - 8, 9);
  }, [sims, local, mode, color, deepColor]);

  const valueAt = (e) => { const r = canvasRef.current.getBoundingClientRect(); return clamp01((e.clientX - r.left) / r.width); };
  const down = (e) => { dragging.current = true; setLocal(valueAt(e)); };
  const move = (e) => { if (dragging.current) setLocal(valueAt(e)); };
  const up = () => { if (dragging.current) { dragging.current = false; onChange(Number(local.toFixed(2))); } };

  return (
    <div className="histogram similarity" title="drag to set the similarity cutoff">
      <canvas ref={canvasRef} onMouseDown={down} onMouseMove={move} onMouseUp={up} onMouseLeave={up} />
    </div>
  );
}

export function RangeConstraintView({ constraint, styles, onPatch, onDelete }) {
  return (
    <Wrapper styles={styles} onDelete={onDelete}>
      <div className="constraint-line">
        <span className="text">{constraint.label} min, max</span>
        <input type="number" min={0} style={styles.button} value={constraint.min} onChange={(e) => onPatch({ min: Number(e.target.value) })} />
        <span className="text">to</span>
        <input type="number" min={0} style={styles.button} value={constraint.max} onChange={(e) => onPatch({ max: Number(e.target.value) })} />
      </div>
    </Wrapper>
  );
}

const DEFAULT_RANGE = [Math.log(1e-12), 0];

/** Log-probability histogram with two draggable bounds (the probability constraint). */
export function HistogramConstraintView({ constraint, histogram, styles, onPatch, onDelete }) {
  return (
    <Wrapper styles={styles} onDelete={onDelete}>
      <LogHistogram data={histogram} min={constraint.min} max={constraint.max} onChange={(min, max) => onPatch({ min, max })} />
    </Wrapper>
  );
}

export function LogHistogram({ data, min, max, onChange, readOnly = false }) {
  const canvasRef = useRef(null);
  const dragging = useRef(null);
  const [local, setLocal] = useState({ min, max });
  useEffect(() => setLocal({ min, max }), [min, max]);

  const range = data?.binEdges?.length ? [data.binEdges[0], data.binEdges[data.binEdges.length - 1]] : DEFAULT_RANGE;
  const toX = (v, w) => ((v - range[0]) / (range[1] - range[0])) * w;
  const fromX = (x, w) => range[0] + (x / w) * (range[1] - range[0]);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const parent = canvas.parentElement;
    const scale = window.devicePixelRatio || 1;
    const w = parent.clientWidth; const h = parent.clientHeight;
    canvas.width = w * scale; canvas.height = h * scale;
    canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const base = 5; const gap = 3;
    if (data?.counts?.length) {
      const maxC = Math.max(...data.counts, 1);
      const bw = Math.max(1, w / data.counts.length);
      data.counts.forEach((c, i) => {
        const edge = data.binEdges[i];
        const x = toX(edge, w);
        const bh = Math.ceil((c / maxC) * (h - base - gap));
        const color = logProbColor(edge);
        ctx.fillStyle = edge >= local.min && edge <= local.max ? color : '#c9c4cf';
        ctx.fillRect(x, h - base - gap - bh, Math.ceil(bw), bh);
        ctx.fillStyle = color;
        ctx.fillRect(x, h - base, Math.ceil(bw), base);
      });
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.font = '10px sans-serif';
      ctx.fillText('run the context well to see the distribution', 6, h / 2);
    }
    ctx.strokeStyle = readOnly ? 'rgba(60,44,72,0.35)' : 'rgba(230,40,40,0.85)'; ctx.fillStyle = ctx.strokeStyle; ctx.lineWidth = readOnly ? 1 : 2;
    for (const v of [local.min, local.max]) {
      const x = Math.max(1, Math.min(w - 1, toX(v, w)));
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, 3, 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#2f2f2f'; ctx.font = '9px sans-serif';
    ctx.fillText(humanLog(local.min), Math.min(w - 24, toX(local.min, w) + 4), h - 8);
    ctx.fillText(humanLog(local.max), Math.max(2, toX(local.max, w) - 22), h - 8);
  }, [data, local, readOnly]);

  const pos = (e) => { const r = canvasRef.current.getBoundingClientRect(); return { x: e.clientX - r.left, w: r.width }; };
  const down = (e) => {
    if (readOnly) return;
    const { x, w } = pos(e);
    const dMin = Math.abs(x - toX(local.min, w)); const dMax = Math.abs(x - toX(local.max, w));
    dragging.current = dMin <= dMax ? 'min' : 'max';
    move(e);
  };
  const move = (e) => {
    if (!dragging.current) return;
    const { x, w } = pos(e);
    const v = Math.max(range[0], Math.min(range[1], fromX(x, w)));
    setLocal((l) => (dragging.current === 'min' ? { ...l, min: Math.min(v, l.max) } : { ...l, max: Math.max(v, l.min) }));
  };
  const up = () => { if (dragging.current) { dragging.current = null; onChange(local.min, local.max); } };

  return (
    <div className={`histogram ${readOnly ? 'readonly' : ''}`}>
      <canvas ref={canvasRef} onMouseDown={down} onMouseMove={move} onMouseUp={up} onMouseLeave={up} />
    </div>
  );
}

export function ConstraintView(props) {
  const { constraint } = props;
  if (['pos', 'sound', 'stress', 'letters'].includes(constraint.kind)) return <CategoryConstraintView {...props} />;
  if (['length', 'syllables', 'chars'].includes(constraint.kind)) return <RangeConstraintView {...props} />;
  if (constraint.kind === 'prob') return <HistogramConstraintView {...props} />;
  if (constraint.kind === 'semantic') return <SemanticConstraintView {...props} />;
  return null;
}
