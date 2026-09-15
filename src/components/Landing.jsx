import React, { useEffect, useMemo, useState } from 'react';
import { CARDS, PRESETS, findModel, dtypeFor, sizeFor, formatMB, estimateMemoryMB, deviceMemoryInfo } from '../models/catalog.js';
import { detectDevice } from '../models/client.js';
import { loadCard } from '../models/session.js';
import { loadSettings, saveSettings } from '../state/settings.js';
import { rainbowColors } from '../lib/colors.js';

const cardColors = rainbowColors(CARDS.length, 0.35);

/** [[groupLabel|null, models[]], …] preserving order. */
function groupModels(models) {
  const out = [];
  for (const m of models) {
    const g = m.group ?? null;
    const last = out[out.length - 1];
    if (last && last[0] === g) last[1].push(m); else out.push([g, [m]]);
  }
  return out;
}

function Card({ card, color, choice, onChoose, progress, disabled, loaded, device }) {
  const model = findModel(card, choice);
  const dtype = dtypeFor(model, device.device, device.fp16);
  const size = sizeFor(model, dtype);
  const pct = progress ? Math.round(progress.fraction * 100) : null;
  return (
    <div className={`slot glass ${loaded ? 'loaded' : ''}`} style={{ '--slot-color': color }}>
      <div className="slot-head">
        <span className="slot-title">{card.title}</span>
        <span className="slot-emoji">{card.emoji}</span>
      </div>
      <p className="slot-blurb">{card.blurb}</p>
      <select value={model.id} disabled={disabled} onChange={(e) => onChoose(card.id, e.target.value)}>
        {groupModels(card.models).map(([group, models]) => {
          const opts = models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}{m.recommended ? ' ★' : ''} · {formatMB(sizeFor(m, dtypeFor(m, device.device, device.fp16)))}
            </option>
          ));
          return group ? <optgroup key={group} label={group}>{opts}</optgroup> : opts;
        })}
      </select>
      <div className="slot-note">
        <span>{model.note}</span>
        <span className="slot-size">{dtype ? `${dtype} · ${formatMB(size)}` : 'no download'}</span>
      </div>
      <div className="used-for">
        <div className="used-for-title">Used for</div>
        <ul>
          {card.usedFor.map((u) => (
            <li key={u.name}><b>{u.name}</b> <span>{u.desc}</span></li>
          ))}
        </ul>
      </div>
      {progress && (
        <>
          <div className="progress-track"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
          <div className="progress-label"><span>{progress.label}</span><span>{pct}%</span></div>
        </>
      )}
    </div>
  );
}

export default function Landing({ onReady, onLab }) {
  const saved = useMemo(() => loadSettings(), []);
  const [device, setDevice] = useState(null);
  const [choices, setChoices] = useState(() => {
    const init = {};
    for (const c of CARDS) init[c.id] = saved?.cards?.[c.id] ?? c.defaultModel;
    return init;
  });
  const [phase, setPhase] = useState('idle');
  const [progress, setProgress] = useState({});
  const [loaded, setLoaded] = useState({});
  const [error, setError] = useState(null);

  useEffect(() => { detectDevice().then(setDevice); }, []);

  const choose = (cardId, modelId) => setChoices((c) => ({ ...c, [cardId]: modelId }));
  const memInfo = useMemo(() => deviceMemoryInfo(), []);

  const uniqueMB = device
    ? [...new Set(CARDS.map((c) => findModel(c, choices[c.id]).id))].reduce((acc, id) => {
        const card = CARDS.find((c) => c.models.some((m) => m.id === id));
        const m = card.models.find((m) => m.id === id);
        return acc + (sizeFor(m, dtypeFor(m, device.device, device.fp16)) ?? 0);
      }, 0)
    : 0;
  const estMB = device ? estimateMemoryMB(uniqueMB, device.device) : 0;
  const activePreset = PRESETS.find((p) => CARDS.every((c) => p.cards[c.id] === choices[c.id]))?.id ?? null;

  async function begin() {
    if (!device) return;
    setPhase('loading');
    setError(null);
    saveSettings({ cards: choices });
    const slots = {};
    try {
      for (const card of CARDS) {
        const model = findModel(card, choices[card.id]);
        for (const s of card.slots) slots[s] = model.id;
        if (model.bundled) { setLoaded((l) => ({ ...l, [card.id]: true })); continue; }
        setProgress((p) => ({ ...p, [card.id]: { fraction: 0, label: 'starting…' } }));
        await loadCard(card, model.id, device, (prog) => setProgress((p) => ({ ...p, [card.id]: prog })));
        setProgress((p) => ({ ...p, [card.id]: { fraction: 1, label: 'loaded' } }));
        setLoaded((l) => ({ ...l, [card.id]: true }));
      }
      onReady({ device, cards: { ...choices }, slots });
    } catch (err) {
      console.error(err);
      setError(`Could not load a model: ${err.message}. Try a lighter preset, or reload and pick again.`);
      setPhase('error');
    }
  }

  const loading = phase === 'loading';
  const hasSaved = !!saved?.cards;

  return (
    <div className="landing rainbow">
      <header className="landing-header">
        <h1 className="landing-title">Phraselette</h1>
        <div className="landing-rule" aria-hidden="true" />
        <p className="landing-tagline">A poet's procedural palette.</p>
        <p className="landing-intro">
          Phraselette is a text editor with a row of <em>wells</em>: small language models that each look at a phrase
          differently. One knows how likely each word is, one knows how words sound, one plays whatever thesaurus you
          describe, one reads your line as a particular kind of reader would. You point them at a phrase; they hand back
          rephrasings; you keep what's good.
        </p>
        <ol className="landing-steps">
          <li><b>Write or paste</b> a poem into the editor.</li>
          <li><b>Highlight a phrase</b> (or just put the cursor on a word) and press <b>Search</b>, or ⌘↵.</li>
          <li><b>Sift the rephrasings.</b> Click one to swap it into the text. Lock a constraint, such as the part of speech, word count, or a sound, to steer the next search.</li>
        </ol>
        <p className="landing-links">
          <a href="https://arxiv.org/abs/2503.06335" target="_blank" rel="noreferrer">Read the paper</a>
          <span aria-hidden="true"> · </span>
          <a href="https://discord.gg/73KbqwFmg" target="_blank" rel="noreferrer">Join the Discord</a>
          <span aria-hidden="true"> · </span>
          <span>Calderwood, Chung, Sun, Roemmele &amp; Kreminski, DIS ’25</span>
        </p>
      </header>

      <section className="landing-models-intro">
        <h2>Choose the models</h2>
        <p>
          Everything runs inside your browser. The choices below decide which small models do each job; they are downloaded
          once from the Hugging Face Hub and cached, so later visits start instantly.
        </p>
      </section>

      {device ? (
        <span className={`device-badge glass ${device.device === 'wasm' ? 'cpu' : ''}`}>
          <span className="dot" /> {device.label}{device.device === 'webgpu' && !device.fp16 ? ' (no fp16)' : ''}
        </span>
      ) : (
        <span className="device-badge glass"><span className="dot" style={{ background: '#bbb' }} /> detecting hardware…</span>
      )}

      {device && (
        <div className="presets">
          {PRESETS.map((p) => (
            <button key={p.id} className={`preset ${activePreset === p.id ? 'active' : ''}`} disabled={loading} title={p.hint} onClick={() => setChoices({ ...p.cards })}>
              {p.label}
            </button>
          ))}
          <span className="preset-hint">{PRESETS.find((p) => p.id === activePreset)?.hint ?? 'custom mix'}</span>
        </div>
      )}

      {device && (
        <div className="slots">
          {CARDS.map((card, i) => (
            <Card key={card.id} card={card} color={cardColors[i]} choice={choices[card.id]} onChoose={choose}
              progress={progress[card.id]} loaded={!!loaded[card.id]} disabled={loading} device={device} />
          ))}
        </div>
      )}

      <div className="landing-actions">
        <button className="big-button" disabled={!device || loading} onClick={begin}>
          {loading ? 'Loading…' : hasSaved ? 'Continue' : 'Begin'}
        </button>
        {device && (
          <div className="budget glass">
            <div>
              <span className="budget-num">{formatMB(uniqueMB)}</span>
              <span className="budget-label">to download once</span>
            </div>
            <div>
              <span className="budget-num">
                ≈ {formatMB(estMB)}
                {memInfo.deviceGB && <span className="budget-of"> / {memInfo.deviceGB} GB</span>}
              </span>
              <span className="budget-label">memory while running{memInfo.deviceGB ? ', of what this browser reports' : ''}</span>
              {memInfo.deviceGB && (
                <span className="budget-gauge" aria-hidden="true">
                  <span style={{ width: `${Math.min(100, (estMB / 1000 / memInfo.deviceGB) * 100)}%` }} className={estMB / 1000 / memInfo.deviceGB > 0.5 ? 'warn' : ''} />
                </span>
              )}
            </div>
          </div>
        )}
        <div className="landing-fineprint">
          Downloads come from the Hugging Face Hub and stay in this browser's cache.
          {device?.device === 'wasm' && ' No WebGPU detected: generation will be slower; prefer the Light preset.'}
          {estMB > 3000 && ' This is a heavy set; if the tab crashes, choose a lighter preset.'}
        </div>
        {error && <div className="landing-error">{error}</div>}
      </div>
      <div className="landing-disclaimer">
        Phraselette 2.0 · re-vibecoded by Claude Fable 5.1 from the DIS ’25 paper and the original study build.
        Hosted models were replaced by models that run entirely in your browser via Transformers.js; expect rougher edges than the paper's version.
        {onLab && <> · <button className="text-link" onClick={onLab}>model lab</button></>}
      </div>
    </div>
  );
}
