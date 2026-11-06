import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';
import { companySiteAssets, COMPANY_ICON } from './site-assets';

const icon = () => readFileSync(new URL('../../packages/service-design/assets/mark-navy.svg', import.meta.url), 'utf8');
export function companyPublicAssets(): Plugin {
  return {
    name: 'company-public-assets',
    generateBundle() {
      for (const [fileName, source] of Object.entries(companySiteAssets())) this.emitFile({ type: 'asset', fileName, source });
      this.emitFile({ type: 'asset', fileName: COMPANY_ICON.slice(1), source: icon() });
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? '').split('?')[0];
        const assets: Record<string, string> = companySiteAssets();
        const source = path === COMPANY_ICON ? icon() : assets[path.slice(1)];
        if (source === undefined) return next();
        res.setHeader('Content-Type', path.endsWith('.svg') ? 'image/svg+xml' : path.endsWith('.xml') ? 'application/xml' : path.endsWith('.webmanifest') ? 'application/manifest+json' : 'text/plain');
        res.end(source);
      });
    },
  };
}
