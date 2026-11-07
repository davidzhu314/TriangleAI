import { defineConfig } from 'vite';

// The client lives in client/; built output goes to dist/ at the repo root.
export default defineConfig({
  root: 'client',
  publicDir: 'public',
  build: { outDir: '../dist', emptyOutDir: true },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
