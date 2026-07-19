import dotenv from 'dotenv';
import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

// Load .env before baking OAuth vars into the main bundle (define runs at config load).
dotenv.config({ path: fileURLToPath(new URL('./.env', import.meta.url)) });

// Config for the Electron main process build.
export default defineConfig({
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      // Native modules and Node builtins must stay external (not bundled).
      external: ['better-sqlite3'],
    },
  },
  define: {
    'process.env.GOOGLE_OAUTH_CLIENT_ID': JSON.stringify(process.env.GOOGLE_OAUTH_CLIENT_ID ?? ''),
    'process.env.GOOGLE_OAUTH_CLIENT_SECRET': JSON.stringify(
      process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? ''
    ),
  },
});
