// Main-thread wrapper around the model worker: promise-based requests with
// progress callbacks, plus WebGPU capability detection.
let worker = null;
let nextId = 1;
const pending = new Map();
const readyPromise = { resolve: null, promise: null };

function ensureWorker() {
  if (worker) return worker;
  readyPromise.promise = new Promise((r) => (readyPromise.resolve = r));
  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = (e) => {
    const msg = e.data;
    if (msg.type === 'ready') { readyPromise.resolve(); return; }
    const p = pending.get(msg.id);
    if (!p) return;
    if (msg.type === 'progress') { p.onProgress?.(msg); return; }
    if (msg.type === 'partial') { p.onPartial?.(msg.data); return; }
    pending.delete(msg.id);
    if (msg.type === 'error') p.reject(new Error(msg.error));
    else p.resolve(msg.result);
  };
  worker.onerror = (e) => console.error('[worker error]', e);
  return worker;
}

export function request(type, payload = {}, { onProgress, onPartial } = {}) {
  const w = ensureWorker();
  const id = nextId++;
  const promise = new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress, onPartial });
    w.postMessage({ id, type, ...payload });
  });
  promise.id = id;
  return promise;
}

export function cancel(id) {
  pending.get(id)?.reject?.(new Error("cancelled"));
  pending.delete(id);
  ensureWorker().postMessage({ id, type: 'cancel', target: id });
}

/** Detect WebGPU and shader-f16 support. */
export async function detectDevice() {
  if (typeof navigator !== 'undefined' && navigator.gpu) {
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (adapter) {
        return { device: 'webgpu', fp16: adapter.features.has('shader-f16'), label: 'WebGPU' };
      }
    } catch { /* fall through */ }
  }
  const threads = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 1 : 1;
  return { device: 'wasm', fp16: false, label: `CPU · WebAssembly · ${threads} threads` };
}

// Dev-only handle for poking the worker from the browser console.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  window.__phraselette = { request, cancel };
}
