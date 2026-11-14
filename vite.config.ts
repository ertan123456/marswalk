import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// The app is served from the domain root on Vercel, but from a project
// subpath on GitHub Pages. Everything that loads a static asset goes through
// import.meta.env.BASE_URL, so setting this is all that is needed to support
// both. The Pages workflow sets PAGES_BASE; Vercel does not.
const base = process.env.PAGES_BASE || '/';

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  build: { target: 'es2022', chunkSizeWarningLimit: 1600 },
});
