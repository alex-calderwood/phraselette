// What Transformers.js has stored in this browser, and how to get rid of it.
// Model files are kept by the browser's Cache Storage API under one bucket
// (env.cacheKey, "transformers-cache"), keyed by their Hugging Face URL. The
// bucket belongs to the page origin, so localhost, 127.0.0.1 and the LAN
// address each hold their own copy; nothing is written to disk by our code.
import { ALL_MODELS } from './catalog.js';

const CACHE_NAME = 'transformers-cache';
const HASH_CACHE_NAME = 'experimental_transformers-hash-cache';
const HF_FILE = /^https:\/\/huggingface\.co\/([^/]+\/[^/]+)\/resolve\//;

const hasCaches = () => typeof caches !== 'undefined';

/**
 * Ask the browser to treat this origin's storage as persistent, so the model
 * files are not the first thing evicted when the disk fills (Safari otherwise
 * drops them after a week without a visit). Resolves to the granted state.
 */
export async function requestPersistentStorage() {
  try {
    if (!navigator.storage?.persist) return null;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}

/** [{ id, name, files, bytes }] for every Hugging Face repo with files in the cache, largest first. */
export async function listCachedModels() {
  if (!hasCaches()) return [];
  try {
    const cache = await caches.open(CACHE_NAME);
    const byRepo = new Map();
    for (const req of await cache.keys()) {
      const m = HF_FILE.exec(req.url);
      if (!m) continue; // ORT wasm and other non-model entries
      const entry = byRepo.get(m[1]) ?? { id: m[1], files: 0, bytes: 0 };
      entry.files += 1;
      entry.bytes += await entrySize(cache, req);
      byRepo.set(m[1], entry);
    }
    return [...byRepo.values()]
      .map((e) => ({ ...e, name: ALL_MODELS.find((m) => m.id === e.id)?.name ?? e.id }))
      .sort((a, b) => b.bytes - a.bytes);
  } catch {
    return [];
  }
}

async function entrySize(cache, req) {
  const res = await cache.match(req);
  if (!res) return 0;
  const len = Number(res.headers.get('content-length'));
  if (Number.isFinite(len) && len > 0) return len;
  try { return (await res.blob()).size; } catch { return 0; }
}

/** Remove every cached file of one Hugging Face repo. */
export async function deleteCachedModel(id) {
  if (!hasCaches()) return;
  const cache = await caches.open(CACHE_NAME);
  for (const req of await cache.keys()) {
    const m = HF_FILE.exec(req.url);
    if (m && m[1] === id) await cache.delete(req);
  }
}

/** Drop the whole model cache (ORT wasm files included; they are small and re-fetched from this server). */
export async function clearModelCache() {
  if (!hasCaches()) return;
  await caches.delete(CACHE_NAME);
  await caches.delete(HASH_CACHE_NAME);
}
