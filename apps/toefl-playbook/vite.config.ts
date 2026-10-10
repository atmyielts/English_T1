import { pagesAssetOutput } from '../../scripts/pages-asset-policy.mjs'
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: { output: pagesAssetOutput(new URL('./public/_headers', import.meta.url)) },
  },
  server: {
    port: 5199,
  },
});
