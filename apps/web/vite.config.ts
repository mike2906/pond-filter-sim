import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The app is served from a sub-path on GitHub Pages and may later be embedded
// in another site. A relative base works anywhere; BASE_PATH overrides it.
export default defineConfig({
  base: process.env.BASE_PATH ?? './',
  plugins: [react()],
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
