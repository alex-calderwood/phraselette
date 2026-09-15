// Loading the models a session needs, and making sure they are still loaded.
// The worker can be recreated underneath us (dev hot-reload, a crashed worker),
// so the workspace calls ensureModels() before running wells.
import { CARDS, findModel, dtypeFor } from './catalog.js';
import { request } from './client.js';

/** Load every model for one landing-page card, reporting merged file progress. */
export async function loadCard(card, modelId, device, onProgress) {
  const model = findModel(card, modelId);
  if (model.bundled) return model;
  const dtype = dtypeFor(model, device.device, device.fp16);
  const files = {};
  for (const slot of card.slots) {
    await request('load', { slot, modelId: model.id, task: model.task ?? card.kind, device: device.device, dtype }, {
      onProgress: (ev) => {
        if (!onProgress) return;
        if (ev.status === 'progress' && ev.total) files[ev.file] = { loaded: ev.loaded, total: ev.total };
        else if (ev.status === 'done' && files[ev.file]) files[ev.file].loaded = files[ev.file].total;
        const list = Object.values(files);
        const total = list.reduce((a, f) => a + f.total, 0);
        const done = list.reduce((a, f) => a + f.loaded, 0);
        onProgress({ fraction: total ? Math.min(1, done / total) : 0, label: describeProgress(ev, total) });
      },
    });
  }
  return model;
}

/** Turn a Transformers.js progress event into a sentence a person would want to read. */
export function describeProgress(ev, totalBytes) {
  const mb = (b) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.round(b / 1e6)} MB`);
  const file = ev.file ?? '';
  if (ev.status === 'ready') return 'loaded and ready';
  if (ev.status === 'initiate' || ev.status === 'download') {
    if (/\.onnx/.test(file)) return 'starting weights download';
    return 'fetching model files';
  }
  if (/config\.json$/.test(file)) return 'reading model configuration';
  if (/tokenizer/.test(file)) return 'loading tokenizer';
  if (/generation_config/.test(file)) return 'reading generation settings';
  if (/\.onnx_data/.test(file)) return `downloading weights, part 2${totalBytes ? ` of ${mb(totalBytes)}` : ''}`;
  if (/\.onnx$/.test(file)) {
    if (ev.status === 'done') return 'weights downloaded, building the model';
    return `downloading weights${totalBytes ? ` (${mb(totalBytes)})` : ''}`;
  }
  if (ev.status === 'done') return 'preparing model';
  return ev.status;
}

let inflight = null;

/** Resolve once every slot the session uses is loaded in the worker (reloading from cache if needed). */
export function ensureModels(session, onNotice) {
  if (inflight) return inflight;
  inflight = (async () => {
    const { slots } = await request('status');
    const missing = CARDS.filter((c) => c.slots.some((s) => session.slots[s] && !slots.includes(s)) && !findModel(c, session.cards[c.id]).bundled);
    if (missing.length === 0) return;
    onNotice?.('reloading models…');
    for (const card of missing) {
      await loadCard(card, session.cards[card.id], session.device, (p) => onNotice?.(`reloading ${card.title.toLowerCase()} model · ${Math.round(p.fraction * 100)}%`));
    }
    onNotice?.(null);
  })().finally(() => { inflight = null; });
  return inflight;
}
