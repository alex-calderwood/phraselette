import React, { useEffect, useMemo, useState } from 'react';
import { CAUSAL_MODELS, INSTRUCT_MODELS, formatMB, sizeFor } from '../models/catalog.js';
import { detectDevice, request } from '../models/client.js';
import { describeProgress } from '../models/session.js';
import { thesaurusMessages, parseEntries } from '../models/prompts.js';
import { logProbColor, humanLog } from '../lib/colors.js';

/**
 * Model lab: exercise the worker routines (the same code the wells use) against
 * any model / dtype / device and look at the raw results. Open with ?lab.
 * The Node counterpart is scripts/lm-test.mjs (CPU, fp32).
 */
const DTYPES = ['fp32', 'fp16', 'q8', 'int8', 'uint8', 'q4', 'q4f16', 'bnb4'];

function useLocal(key, initial) {
  const [v, setV] = useState(() => { try { return JSON.parse(localStorage.getItem(key)) ?? initial; } catch { return initial; } });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* ignore */ } }, [key, v]);
  return [v, setV];
}

function Tokens({ tokens }) {
  return (
    <div className="lab-tokens">
      {tokens.map((t, i) => (
        <span key={i} className="lab-token" style={{ background: logProbColor(t.logProb) }} title={`${t.logProb?.toFixed(3)}${t.alternates ? '\nalt: ' + t.alternates.map((a) => `${JSON.stringify(a.text)} ${a.logProb.toFixed(2)}`).join(', ') : ''}`}>
          <span className="lab-token-text">{JSON.stringify(t.text).slice(1, -1) || '·'}</span>
          <span className="lab-token-lp">{humanLog(t.logProb)}</span>
        </span>
      ))}
    </div>
  );
}

export default function Lab({ onExit }) {
  const [device, setDevice] = useState(null);
  const [slotDevice, setSlotDevice] = useLocal('lab.device', 'auto');
  const [causal, setCausal] = useLocal('lab.causal', { id: 'Xenova/gpt2', dtype: 'fp32' });
  const [instruct, setInstruct] = useLocal('lab.instruct', { id: 'onnx-community/Qwen2.5-0.5B-Instruct', dtype: 'q4f16' });
  const [loaded, setLoaded] = useState({});
  const [progress, setProgress] = useState({});
  const [log, setLog] = useState([]);
  const [busy, setBusy] = useState(false);

  const [prefix, setPrefix] = useLocal('lab.prefix', 'Something interesting, go and find it.\n\nWhat do you think we');
  const [text, setText] = useLocal('lab.text', ' should do?');
  const [k, setK] = useLocal('lab.k', 12);
  const [depth, setDepth] = useLocal('lab.depth', 6);
  const [candidates, setCandidates] = useLocal('lab.candidates', ' should do?\n ought to do\n can learn from this');
  const [role, setRole] = useLocal('lab.role', "a wizard's wacky spellbook");
  const [query, setQuery] = useLocal('lab.query', 'glazed with');
  const [chatRaw, setChatRaw] = useLocal('lab.chatraw', 'List five synonyms for the word "happy", one per line.');
  const [temperature, setTemperature] = useLocal('lab.temp', 1.0);

  useEffect(() => { detectDevice().then(setDevice); }, []);
  const dev = slotDevice === 'auto' ? device?.device : slotDevice;

  const push = (entry) => setLog((l) => [{ ...entry, at: new Date().toLocaleTimeString() }, ...l].slice(0, 40));

  async function timed(label, fn) {
    setBusy(true);
    const t0 = performance.now();
    try {
      const result = await fn();
      push({ label, ms: Math.round(performance.now() - t0), result });
    } catch (e) {
      push({ label, ms: Math.round(performance.now() - t0), error: e.message });
    } finally { setBusy(false); }
  }

  const load = (slot, cfg, task) => timed(`load ${slot} ${cfg.id} ${cfg.dtype} ${dev}`, async () => {
    setLoaded((l) => ({ ...l, [slot]: false }));
    await request('load', { slot, modelId: cfg.id, task, device: dev, dtype: cfg.dtype }, {
      onProgress: (ev) => setProgress((p) => ({ ...p, [slot]: describeProgress(ev, ev.total) + (ev.progress ? ` ${Math.round(ev.progress)}%` : '') })),
    });
    setLoaded((l) => ({ ...l, [slot]: true }));
    setProgress((p) => ({ ...p, [slot]: 'ready' }));
    return 'ok';
  });

  const causalModel = CAUSAL_MODELS.find((m) => m.id === causal.id);
  const instructModel = INSTRUCT_MODELS.find((m) => m.id === instruct.id);

  return (
    <div className="lab rainbow">
      <div className="lab-head">
        <h1 className="lab-title">Phraselette lab</h1>
        <span className="device-badge glass"><span className="dot" /> {device ? device.label : 'detecting…'}{device?.device === 'webgpu' && !device.fp16 ? ' (no fp16)' : ''}</span>
        <label className="lab-field">device
          <select value={slotDevice} onChange={(e) => setSlotDevice(e.target.value)}>
            <option value="auto">auto</option><option value="webgpu">webgpu</option><option value="wasm">wasm</option>
          </select>
        </label>
        <button onClick={onExit}>← back to Phraselette</button>
      </div>

      <div className="lab-grid">
        <section className="glass lab-panel">
          <h2>Probability model <small>(slot: context)</small></h2>
          <div className="lab-row">
            <select value={causal.id} onChange={(e) => setCausal({ ...causal, id: e.target.value })}>{CAUSAL_MODELS.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
            <select value={causal.dtype} onChange={(e) => setCausal({ ...causal, dtype: e.target.value })}>{DTYPES.map((d) => <option key={d} value={d}>{d}{sizeFor(causalModel, d) ? ` · ${formatMB(sizeFor(causalModel, d))}` : ''}</option>)}</select>
            <button disabled={busy || !dev} onClick={() => load('context', causal, 'causal')}>load</button>
            <span className="lab-status">{progress.context}</span>
          </div>
          <label className="lab-field">prefix<textarea rows={3} value={prefix} onChange={(e) => setPrefix(e.target.value)} /></label>
          <div className="lab-row">
            <label className="lab-field">K <input type="number" value={k} min={1} max={64} onChange={(e) => setK(Number(e.target.value))} /></label>
            <label className="lab-field">depth <input type="number" value={depth} min={1} max={25} onChange={(e) => setDepth(Number(e.target.value))} /></label>
            <button disabled={busy || !loaded.context} onClick={() => timed('search', () => request('search', { slot: 'context', prefix, k, depth, window: 256 }))}>search</button>
          </div>
          <label className="lab-field">text to score after the prefix<input value={text} onChange={(e) => setText(e.target.value)} /></label>
          <div className="lab-row">
            <button disabled={busy || !loaded.context} onClick={() => timed('probs', () => request('probs', { slot: 'context', prefix, text, topK: 5 }))}>probs of text</button>
            <button disabled={busy || !loaded.context} onClick={() => timed('probs (whole prefix, no context)', () => request('probs', { slot: 'context', prefix: '', text: prefix, topK: 3 }))}>probs of prefix</button>
          </div>
          <label className="lab-field">candidates (one per line, leading space = word boundary)<textarea rows={3} value={candidates} onChange={(e) => setCandidates(e.target.value)} /></label>
          <div className="lab-row">
            <button disabled={busy || !loaded.context} onClick={() => timed('score', () => request('score', { slot: 'context', prefix, candidates: candidates.split('\n').filter(Boolean) }))}>score candidates</button>
          </div>
        </section>

        <section className="glass lab-panel">
          <h2>Advice model <small>(slot: thesaurus)</small></h2>
          <div className="lab-row">
            <select value={instruct.id} onChange={(e) => setInstruct({ ...instruct, id: e.target.value })}>{INSTRUCT_MODELS.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
            <select value={instruct.dtype} onChange={(e) => setInstruct({ ...instruct, dtype: e.target.value })}>{DTYPES.map((d) => <option key={d} value={d}>{d}{sizeFor(instructModel, d) ? ` · ${formatMB(sizeFor(instructModel, d))}` : ''}</option>)}</select>
            <button disabled={busy || !dev} onClick={() => load('thesaurus', instruct, 'instruct')}>load</button>
            <span className="lab-status">{progress.thesaurus}</span>
          </div>
          <div className="lab-row">
            <label className="lab-field">temperature <input type="number" step={0.1} min={0} max={2} value={temperature} onChange={(e) => setTemperature(Number(e.target.value))} /></label>
          </div>
          <label className="lab-field">thesaurus role<input value={role} onChange={(e) => setRole(e.target.value)} /></label>
          <label className="lab-field">query<input value={query} onChange={(e) => setQuery(e.target.value)} /></label>
          <div className="lab-row">
            <button disabled={busy || !loaded.thesaurus} onClick={() => timed('thesaurus (one-shot + <entry> prefix)', async () => {
              const r = await request('chat', { slot: 'thesaurus', messages: thesaurusMessages({ description: role, selection: query, advice: '' }), maxNewTokens: 320, temperature, doSample: temperature > 0, assistantPrefix: '<entry>' });
              return { raw: r.text, entries: parseEntries(r.text, query) };
            })}>run thesaurus prompt</button>
          </div>
          <label className="lab-field">raw chat message<textarea rows={3} value={chatRaw} onChange={(e) => setChatRaw(e.target.value)} /></label>
          <div className="lab-row">
            <button disabled={busy || !loaded.thesaurus} onClick={() => timed('chat greedy', () => request('chat', { slot: 'thesaurus', messages: [{ role: 'user', content: chatRaw }], maxNewTokens: 120, doSample: false }))}>chat (greedy)</button>
            <button disabled={busy || !loaded.thesaurus} onClick={() => timed('chat sampled', () => request('chat', { slot: 'thesaurus', messages: [{ role: 'user', content: chatRaw }], maxNewTokens: 120, doSample: true, temperature }))}>chat (sampled)</button>
          </div>
        </section>
      </div>

      <section className="glass lab-panel lab-log">
        <h2>Results <small>newest first</small> <button onClick={() => setLog([])}>clear</button></h2>
        {log.map((e, i) => (
          <details key={i} open={i === 0} className="lab-entry">
            <summary>{e.at} · <b>{e.label}</b> · {e.ms} ms {e.error && <span className="lab-error">· {e.error}</span>}</summary>
            {e.result?.sequences && (
              <div className="lab-seqs">
                {e.result.sequences.map((s, j) => (
                  <div key={j} className="lab-seq"><span className="lab-seq-text">{JSON.stringify(s.text)}</span><span className="lab-seq-mean">mean {humanLog(s.logProb / s.tokens.length)}</span><Tokens tokens={s.tokens} /></div>
                ))}
                {e.result.histogram && <div className="lab-hist">{e.result.histogram.counts.map((c, j) => <span key={j} style={{ height: `${Math.max(1, 40 * c / Math.max(...e.result.histogram.counts))}px`, background: logProbColor(e.result.histogram.binEdges[j]) }} />)}</div>}
              </div>
            )}
            {e.result?.tokens && <Tokens tokens={e.result.tokens} />}
            {e.result?.results && e.result.results.map((r, j) => <div key={j} className="lab-seq"><span className="lab-seq-mean">mean {humanLog(r.logProbMean)}</span><Tokens tokens={r.tokens} /></div>)}
            {e.result?.entries && <div className="lab-entries">parsed entries ({e.result.entries.length}): {e.result.entries.map((x, j) => <span key={j} className="lab-chip">{x}</span>)}</div>}
            {(e.result?.raw ?? e.result?.text) && <pre className="lab-pre">{e.result.raw ?? e.result.text}</pre>}
            {typeof e.result === 'string' && <pre className="lab-pre">{e.result}</pre>}
          </details>
        ))}
      </section>
    </div>
  );
}
