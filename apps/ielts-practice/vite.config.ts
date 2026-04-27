import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('ielts-simulator/src')) return 'shared-simulator-runtime';
          if (id.includes('@supabase')) return 'supabase';
          if (id.includes('react-router')) return 'router';
          if (id.includes('lucide-react')) return 'icons';
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) return 'react';
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5195,
    fs: {
      allow: ['..'],
    },
  },
});

