import React, { useEffect, useRef, useState } from 'react';
import { MODES } from '../core/constraints.js';
import { tagWithWink, attachPhones } from '../lang/tagger.js';
import { phonesOfTokens } from '../core/constraints.js';
import { logProbColor, humanLog } from '../lib/colors.js';

function Wrapper({ styles, onDelete, children }) {
  return (
    <div className="constraint">
      {children}
      <button className="constraint-delete" style={styles.button} title="remove constraint" onClick={onDelete}>×</button>
    </div>
  );
}

/** POS or sound: a mode select plus an editable list of categories. */
export function CategoryConstraintView({ constraint, styles, onPatch, onDelete }) {
  const setTarget = (target) => onPatch({ target });
  const [ref, setRef] = useState(constraint.reference ?? '');
  const isSound = constraint.kind === 'sound';

  const useReference = () => {
    const toks = attachPhones(tagWithWink(ref));
    const target = phonesOfTokens(toks);
    onPatch({ target, reference: ref });
  };

  return (
    <Wrapper styles={styles} onDelete={onDelete}>
      {isSound && (
        <form className="constraint-ref" onSubmit={(e) => { e.preventDefault(); useReference(); }}>
          <input style={styles.button} placeholder="type a word to borrow its sound…" value={ref} onChange={(e) => setRef(e.target.value)} />
          <button type="submit" style={styles.button}>›</button>
        </form>
      )}
      <div className="constraint-line">
        <select style={styles.button} value={constraint.mode} onChange={(e) => onPatch({ mode: e.target.value })}>
          {MODES.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <div className="constraint-targets">
          {constraint.target.map((v, i) => (
            <span className="constraint-target" key={i}>
              <select style={styles.button} value={v} onChange={(e) => setTarget(constraint.target.map((x, j) => (j === i ? e.target.value : x)))}>
                {constraint.range.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <button className="mini-delete" onClick={() => setTarget(constraint.target.filter((_, j) => j !== i))}>×</button>
            </span>
          ))}
        </div>
        <button style={styles.button} title="add" onClick={() => setTarget([...constraint.target, constraint.range[isSound ? 0 : 7]])}>＋</button>
        <button style={styles.button} title="remove last" onClick={() => setTarget(constraint.target.slice(0, -1))}>−</button>
      </div>
    </Wrapper>
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

export function LogHistogram({ data, min, max, onChange }) {
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
        const colour = logProbColor(edge);
        ctx.fillStyle = edge >= local.min && edge <= local.max ? colour : '#c9c4cf';
        ctx.fillRect(x, h - base - gap - bh, Math.ceil(bw), bh);
        ctx.fillStyle = colour;
        ctx.fillRect(x, h - base, Math.ceil(bw), base);
      });
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.font = '10px sans-serif';
      ctx.fillText('run the context well to see the distribution', 6, h / 2);
    }
    ctx.strokeStyle = 'rgba(230,40,40,0.85)'; ctx.fillStyle = 'rgba(230,40,40,0.85)'; ctx.lineWidth = 2;
    for (const v of [local.min, local.max]) {
      const x = Math.max(1, Math.min(w - 1, toX(v, w)));
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, 3, 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#2f2f2f'; ctx.font = '9px sans-serif';
    ctx.fillText(humanLog(local.min), Math.min(w - 24, toX(local.min, w) + 4), h - 8);
    ctx.fillText(humanLog(local.max), Math.max(2, toX(local.max, w) - 22), h - 8);
  }, [data, local]);

  const pos = (e) => { const r = canvasRef.current.getBoundingClientRect(); return { x: e.clientX - r.left, w: r.width }; };
  const down = (e) => {
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
    <div className="histogram">
      <canvas ref={canvasRef} onMouseDown={down} onMouseMove={move} onMouseUp={up} onMouseLeave={up} />
    </div>
  );
}

export function ConstraintView(props) {
  const { constraint } = props;
  if (constraint.kind === 'pos' || constraint.kind === 'sound') return <CategoryConstraintView {...props} />;
  if (constraint.kind === 'length') return <RangeConstraintView {...props} />;
  if (constraint.kind === 'prob') return <HistogramConstraintView {...props} />;
  return null;
}
