// Local preview without Supabase: the real `company` function runs in the browser
// on an in-memory database (preview/boot.ts), and sign-in is a persona switch.
// npm run preview:local --workspace apps/company   (or the launch.json entries)
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { schoodDesignAssets } from '../../../packages/service-design/build-assets';

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const stubClient = here('./client.ts');

export default defineConfig({
  root: here('..'),
  plugins: [
    schoodDesignAssets(),
    {
      name: 'company-preview',
      enforce: 'pre',
      resolveId(source, importer) {
        if (importer && !importer.includes('/preview/') && /assessment-web\/src\/client(\.ts)?$/.test(source)) return stubClient;
        return null;
      },
      transformIndexHtml(html) {
        return html.replace('<script type="module" src="/src/main.tsx"></script>', '<script type="module" src="/preview/boot.ts"></script><script type="module" src="/src/main.tsx"></script>');
      },
    },
  ],
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://preview.local'),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('preview-anon'),
  },
  server: { fs: { allow: [here('../../..')] } },
});
