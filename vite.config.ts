import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  plugins: [
    react(),
    wasm(),
    nodePolyfills({ include: ['buffer'], globals: { Buffer: true } }),
  ],
  optimizeDeps: {
    exclude: [
      '@midnight-ntwrk/onchain-runtime-v3',
      '@midnight-ntwrk/ledger-v8',
      '@midnight-ntwrk/compact-runtime',
      '@midnight-ntwrk/midnight-js-protocol',
    ],
    include: ['object-inspect'],
  },
  build: {
    target: 'esnext',
    chunkSizeWarningLimit: 4096,
  },
});
