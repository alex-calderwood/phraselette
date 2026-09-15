import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Phraselette is served under https://nonsens.ing/phraselette/ in production
// and http://localhost:3027/phraselette/ in development, so every asset path
// is built relative to this base.
export const BASE = '/phraselette/';

export default defineConfig({
  base: BASE,
  plugins: [react()],
  server: { port: 3027, strictPort: true, host: true },
  preview: { port: 3027, strictPort: true, host: true },
  worker: { format: 'es' },
  // Transformers.js ships prebuilt bundles that load onnxruntime lazily; letting
  // Vite pre-bundle them breaks the wasm/worker lookups.
  optimizeDeps: { exclude: ['@huggingface/transformers'], include: ['react', 'react-dom', 'react-dom/client', 'chroma-js'] },
  build: {
    target: 'esnext',
    chunkSizeWarningLimit: 6000, // the CMU pronouncing dictionary is one big chunk by design
  },
});
