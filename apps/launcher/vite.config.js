import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Electron loads the built renderer via file:// - relative asset paths are
// required, an absolute base would resolve against the filesystem root.
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 5178,
  },
  build: {
    outDir: 'dist',
  },
});
