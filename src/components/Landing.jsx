import React, { useEffect, useMemo, useState } from 'react';
import { CARDS, PRESETS, findModel, dtypeFor, sizeFor, formatMB, estimateMemoryMB, deviceMemoryInfo, benchLabel, BENCH_SYMBOL, BENCHMARK_NOTE } from '../models/catalog.js';
import { listCachedModels, deleteCachedModel, clearModelCache } from '../models/cache.js';
import { detectDevice } from '../models/client.js';
import { loadCard } from '../models/session.js';
import { loadSettings, saveSettings } from '../state/settings.js';
import { rainbowColors } from '../lib/colors.js';

/** Cards offered on the page; hidden ones (part of speech) keep their default and still load with the rest. */
const VISIBLE_CARDS = CARDS.filter((c) => !c.hidden);
const cardColors = rainbowColors(VISIBLE_CARDS.length, 0.35);

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

function ModelRow({ card, color, choice, onChoose, progress, disabled, loaded, device, cachedIds }) {
  const model = findModel(card, choice);
  const dtype = dtypeFor(model, device.device, device.fp16);
  const pct = progress ? Math.round(progress.fraction * 100) : null;
  return (
    <div className={`model-row ${loaded ? 'loaded' : ''}`} style={{ '--slot-color': color }}>
      <div className="model-row-main">
        <div className="model-row-text">
          <span className="model-row-title">{card.title}</span>
          <span className="model-row-uses"><span className="model-row-uses-label">used for: </span>{card.usedFor.map((u) => u.name).join(' · ')}</span>
        </div>
        <div className="model-row-pick">
          <select value={model.id} disabled={disabled} onChange={(e) => onChoose(card.id, e.target.value)} aria-label={`${card.title} model`}>
            {groupModels(card.models).map(([group, models]) => {
              const opts = models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}{m.recommended ? ' ★' : ''} · {formatMB(sizeFor(m, dtypeFor(m, device.device, device.fp16)))}{benchLabel(m) ? ` · ${benchLabel(m)}` : ''}{cachedIds.has(m.id) ? ' · cached' : ''}
                </option>
              ));
              return group ? <optgroup key={group} label={group}>{opts}</optgroup> : opts;
            })}
          </select>
          <span className="model-row-note" title={card.blurb}>{model.note}{dtype ? ` · ${dtype}` : ''}</span>
          {model.bench && <span className="model-row-note" title={`${BENCHMARK_NOTE} ${model.bench.about} Source: ${model.bench.note}.`}><span className="bench-symbol" aria-label="benchmark">{BENCH_SYMBOL}</span> {model.bench.score} · {model.bench.name}</span>}
        </div>
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

export default function Landing({ onReady }) {
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
  const [cached, setCached] = useState([]);

  useEffect(() => { detectDevice().then(setDevice); }, []);
  const refreshCache = () => listCachedModels().then(setCached);
  useEffect(() => { refreshCache(); }, []);
  const cachedIds = useMemo(() => new Set(cached.map((c) => c.id)), [cached]);
  const cachedMB = cached.reduce((a, c) => a + c.bytes, 0) / 1e6;

  async function forget(id) {
    if (id) await deleteCachedModel(id); else await clearModelCache();
    refreshCache();
  }

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
      refreshCache();
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
        <p className="landing-tagline">A poet's procedural palette.</p>
        <p className="landing-intro">
          Phraselette is a word (and phrase) search toolbox. It is centered on the idea of 'word wells'. Each well is a customizable word search tool that gives you a new lens on your language choices. Each provides phrase alternatives using attributes of probablistic language models not surfaced by chatbots, and gives you a variety of tunable linguistic probes or search procedures. Phraselette also allows you to constrain text generation using a number of 'poetic' constraint procedures.
        </p>
        <p className="landing-links">
          <a href="https://arxiv.org/abs/2503.06335" target="_blank" rel="noreferrer">Read the paper</a>
          <span aria-hidden="true"> · </span>
          <a href="https://discord.gg/73KbqwFmg" target="_blank" rel="noreferrer">Join the Discord</a>
          <span aria-hidden="true"> · </span>
          <span>Calderwood, Chung, Sun, Roemmele &amp; Kreminski, DIS ’25</span>
        </p>
      </header>

      {/* how to use, with Begin / Continue beside it */}
      <div className="landing-row">
        <section className="howto" aria-label="how to use">
          <div className="howto-title">How to use</div>
          <ol className="landing-steps">
            <li><span><b>Write</b> in the editor.</span></li>
            <li><span><b>Highlight a phrase</b>, press <b>Search</b>.</span></li>
            <li><span><b>Click a rephrasing</b> to swap it in. Add constraints to steer the next search.</span></li>
          </ol>
        </section>
        <div className="landing-actions">
          <button className="big-button" disabled={!device || loading} onClick={begin}>
            {loading ? 'Loading…' : hasSaved ? 'Continue' : 'Begin'}
          </button>
          {!device && <div className="budget-line">detecting hardware…</div>}
          {error && <div className="landing-error">{error}</div>}
        </div>
      </div>

      {device && (
        <section className="models-panel glass" aria-label="model selection">
          <div className="models-panel-head">
            <div>
              <div className="models-panel-title">Models</div>
              <div className="models-panel-note">Phraselette runs small language models inside your browser, so nothing you write leaves your machine. The models are downloaded once, on Begin, and kept in the browser's cache. If you are on a system without a GPU or with less RAM, choose a smaller model.</div>
              {/*  {BENCHMARK_NOTE} used to be here but it is obviously not meant to be in the main description of Phraselette */}
            </div>
            <div className="presets compact">
              {PRESETS.map((p) => (
                <button key={p.id} className={`preset ${activePreset === p.id ? 'active' : ''}`} disabled={loading} title={p.hint} onClick={() => setChoices({ ...p.cards })}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div className="models-stats" aria-label="what this selection costs">
            <span className="models-stat" title="Model files fetched the first time, then kept in the browser's cache."><span className="models-stat-label">download</span>{formatMB(uniqueMB)}{CARDS.every((c) => { const m = findModel(c, choices[c.id]); return m.bundled || cachedIds.has(m.id); }) ? ' · cached' : ''}</span>
            <span className="models-stat" title="Rough memory the models take while running, against what this device reports."><span className="models-stat-label">memory</span>≈ {formatMB(estMB)}{memInfo.deviceGB ? ` of ${memInfo.deviceGB} GB` : ''}</span>
            <span className={`models-stat device-inline ${device.device === 'wasm' ? 'cpu' : ''}`} title="Where the models run."><span className="models-stat-label">runs on</span><span className="dot" /> {device.label}{device.device === 'webgpu' && !device.fp16 ? ' (no fp16)' : ''}</span>
          </div>
          <div className="model-rows">
            {VISIBLE_CARDS.map((card, i) => (
              <ModelRow key={card.id} card={card} color={cardColors[i]} choice={choices[card.id]} onChoose={choose}
                progress={progress[card.id]} loaded={!!loaded[card.id]} disabled={loading} device={device} cachedIds={cachedIds} />
            ))}
          </div>
          <details className="cached" onToggle={(e) => e.currentTarget.open && refreshCache()}>
            <summary title="Model files this browser has stored so they are not downloaded again (Cache Storage). Deleting only frees disk space; the model re-downloads next time it is chosen.">
              <span aria-hidden="true">💾</span> Cached models{cached.length ? ` · ${cached.length} · ${formatMB(cachedMB)}` : ' · none yet'}
            </summary>
            {cached.length > 0 ? (
              <ul className="cached-list">
                {cached.map((c) => (
                  <li key={c.id} title={`${c.id} · ${c.files} files`}>
                    <span className="cached-name">{c.name}</span>
                    <span className="cached-size">{formatMB(c.bytes / 1e6)}</span>
                    <button className="cached-remove" disabled={loading} title={`Delete ${c.name} from the cache`} onClick={() => forget(c.id)}>delete</button>
                  </li>
                ))}
                {cached.length > 1 && <li className="cached-all"><button className="cached-clear" disabled={loading} onClick={() => forget(null)}>delete all</button></li>}
              </ul>
            ) : (
              <div className="cached-empty">Nothing stored on this address yet. Each address (localhost, 127.0.0.1, your LAN IP) keeps its own cache.</div>
            )}
          </details>
          {(device.device === 'wasm' || estMB > 3000) && (
            <div className="landing-fineprint">
              {device.device === 'wasm' && 'No WebGPU detected: generation will be slower; prefer the Light preset. '}
              {estMB > 3000 && 'This is a heavy set; if the tab crashes, choose a lighter preset.'}
            </div>
          )}
        </section>
      )}

      <div className="landing-disclaimer">
        Phraselette 2.0 · re-vibecoded by Fable 5.1 from the DIS ’25 paper and the original study build.
        Hosted models were replaced by models that run entirely in your browser via Transformers.js; expect rougher edges than the paper's version.
      </div>
    </div>
  );
}
