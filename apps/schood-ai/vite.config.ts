import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { pagesAssetOutput } from '../../scripts/pages-asset-policy.mjs';
import { schoodDesignAssets } from '../../packages/service-design/build-assets';

export default defineConfig({
  plugins: [react(), schoodDesignAssets()],
  build: { rollupOptions: { output: pagesAssetOutput(new URL('./public/_headers', import.meta.url)) } },
  resolve: { dedupe: ['react', 'react-dom'] },
});
