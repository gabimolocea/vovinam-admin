import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const sharedDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * Shared Vite configuration for every FRVV frontend app.
 * Apps pass their dev `port` and any extra `plugins` (e.g. PWA).
 */
export function createAppViteConfig({ port, appDir, plugins = [], proxyMedia = true } = {}) {
  const proxy = { '/api': 'http://localhost:8000' };
  if (proxyMedia) proxy['/media'] = 'http://localhost:8000';

  return defineConfig({
    plugins: [react(), ...plugins],
    resolve: {
      alias: { '@shared': sharedDir },
      dedupe: ['react', 'react-dom', 'react-router-dom', 'axios'],
    },
    optimizeDeps: {
      include: ['react', 'react-dom', 'react-router-dom', 'axios'],
    },
    server: {
      host: '0.0.0.0',
      port,
      proxy,
    },
  });
}
