// Minimal static server for the production build. Serves dist/ on port 3027
// (inside and outside the container) under the /phraselette/ base path, and
// also at / for proxies that strip the prefix, with a single-page-app fallback
// to index.html. No dependencies.
import { createServer } from 'node:http';
import { createReadStream, statSync, existsSync } from 'node:fs';
import { join, extname, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), 'dist');
const BASE = '/phraselette/';
const PORT = Number(process.env.PORT || 3027);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json',
  '.woff2': 'font/woff2',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', ...headers });
  res.end(body);
}

function serveFile(res, filePath, cacheControl) {
  const type = TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
  let size;
  try {
    ({ size } = statSync(filePath));
  } catch {
    // dist/ is being rebuilt (or was never built): fail soft instead of crashing the process
    send(res, 503, 'Phraselette is rebuilding; try again in a moment.', { 'Retry-After': '2' });
    return;
  }
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': size, 'Cache-Control': cacheControl });
  createReadStream(filePath).on('error', () => res.destroy()).pipe(res);
}

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let pathname = decodeURIComponent(url.pathname);

  if (pathname === '/healthz' || pathname === `${BASE}healthz`) { send(res, 200, 'ok'); return; }

  // Accept both "/phraselette/x" (direct, or a proxy that passes the prefix
  // through) and "/x" (a proxy that strips the prefix before forwarding).
  // Never redirect: a prefix-stripping proxy would turn that into a loop.
  const withoutBase = pathname.startsWith(BASE) ? pathname.slice(BASE.length)
    : pathname === BASE.slice(0, -1) ? ''
    : pathname.slice(1);
  const rel = normalize(withoutBase).replace(/^(\.\.[/\\])+/, '').replace(/^\.$/, '');
  const filePath = join(ROOT, rel);
  if (!filePath.startsWith(ROOT)) { send(res, 403, 'forbidden'); return; }

  if (rel && existsSync(filePath) && statSync(filePath).isFile()) {
    // Vite fingerprints everything under assets/; the ORT files and models are versioned by URL too.
    const immutable = rel.startsWith('assets/') || rel.startsWith('ort/');
    serveFile(res, filePath, immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=300');
    return;
  }
  // SPA fallback
  serveFile(res, join(ROOT, 'index.html'), 'no-cache');
});

server.listen(PORT, '0.0.0.0', () => {
  // Same shape as Vite's startup banner: a clickable local URL plus every LAN address.
  const pad = (s) => s.padEnd(9);
  console.log(`\n  Phraselette · serving ${ROOT}\n`);
  console.log(`  ➜  ${pad('Local:')} http://localhost:${PORT}${BASE}`);
  for (const addrs of Object.values(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal) console.log(`  ➜  ${pad('Network:')} http://${a.address}:${PORT}${BASE}`);
    }
  }
  console.log('');
});
