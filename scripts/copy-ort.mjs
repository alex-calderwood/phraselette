// Copies the ONNX Runtime Web wasm/loader files into public/ort so the app is
// fully self-hosted (Transformers.js would otherwise fetch them from jsdelivr).
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = join(root, 'node_modules', 'onnxruntime-web', 'dist');
const dst = join(root, 'public', 'ort');
mkdirSync(dst, { recursive: true });
let n = 0;
for (const f of readdirSync(src)) {
  if (/^ort-wasm-simd-threaded.*\.(wasm|mjs)$/.test(f)) {
    copyFileSync(join(src, f), join(dst, f));
    n++;
  }
}
console.log(`copied ${n} onnxruntime-web files to public/ort`);
