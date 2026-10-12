import { defineConfig } from 'vite';

// Relative base so the built site works from any folder (GitHub Pages, Netlify, etc.)
export default defineConfig({
  base: './',
  // Three.js alone is ~550 kB minified (~150 kB gzipped); that's expected.
  build: { chunkSizeWarningLimit: 700 },
});
