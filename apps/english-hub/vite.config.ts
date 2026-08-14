import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalized = id.replace(/\\/g, '/');
          if (normalized.includes('/node_modules/@supabase/')) return 'supabase-vendor';
          if (
            normalized.includes('/node_modules/react/')
            || normalized.includes('/node_modules/react-dom/')
            || normalized.includes('/node_modules/react-router/')
            || normalized.includes('/node_modules/react-router-dom/')
            || normalized.includes('/node_modules/scheduler/')
          ) return 'react-vendor';
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5183,
  },
});
