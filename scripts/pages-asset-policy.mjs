import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

// Header changes must invalidate immutable assets as well as HTML deployments.
export function pagesAssetOutput(headersFile) {
  const policy = readFileSync(headersFile, 'utf8').replace(/\r\n?/g, '\n');
  if (!/^\/\*\s*$/m.test(policy)) {
    throw new Error('Every Pages build requires a universal response policy.');
  }
  const revision = createHash('sha256').update(policy).digest('hex').slice(0, 12);
  return {
    entryFileNames: `assets/[name]-[hash]-p${revision}.js`,
    chunkFileNames: `assets/[name]-[hash]-p${revision}.js`,
    assetFileNames: `assets/[name]-[hash]-p${revision}[extname]`,
  };
}
