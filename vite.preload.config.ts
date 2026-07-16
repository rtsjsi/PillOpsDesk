import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

// Config for the Electron preload script build.
export default defineConfig({
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
    },
  },
});
