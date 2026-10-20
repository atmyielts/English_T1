// Isolated failure fixtures from the real production entrypoints. Never writes
// app dist directories or contacts production. Use only for local browser QA.
import { build } from 'vite';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { resolve, join, extname, sep } from 'node:path';

const root = process.cwd();
const output = resolve(root, 'supabase/.temp/ui-recovery/fixtures');
const port = Number(process.argv.find((arg) => arg.startsWith('--port='))?.slice(7) ?? 4289);
const inventory = JSON.parse(readFileSync('packages/ui-recovery/tests/apps.json', 'utf8'));
const fixtureEnv = {
  VITE_SUPABASE_URL: 'https://recovery-fixture.invalid', VITE_SUPABASE_ANON_KEY: 'synthetic-recovery-test-key',
  VITE_PLATFORM_URL: `http://127.0.0.1:${port}`, VITE_ACADEMY_URL: `http://127.0.0.1:${port}/academy/`,
  VITE_AUTH_SHARED_COOKIE: 'false', VITE_AUTH_COOKIE_DOMAIN: '', VITE_RELEASE_SHA: 'local-recovery-check',
  VITE_SHOW_ERROR_DETAILS: 'true',
};
Object.assign(process.env, fixtureEnv);
mkdirSync(output, { recursive: true });
for (const entry of inventory) {
  const app = entry.workspace.replace('apps/', '');
  const appRoot = resolve(root, entry.workspace);
  const target = join(appRoot, 'src/App.tsx').replaceAll('\\', '/');
  // Match npm --workspace build's cwd: Tailwind/PostCSS config discovery uses it.
  process.chdir(appRoot);
  await build({ root: appRoot, configFile: join(appRoot, 'vite.config.ts'), envDir: false,
    define: Object.fromEntries(Object.entries(fixtureEnv).map(([key, value]) => [`import.meta.env.${key}`, JSON.stringify(value)])),
    base: `/${app}/`, publicDir: false, logLevel: 'error', mode: 'production',
    build: { outDir: join(output, app), emptyOutDir: false },
    plugins: [{ name: 'local-controlled-render-failure', enforce: 'pre', load(id) {
      if (id.replaceAll('\\', '/') !== target) return null;
      return `export default function ControlledFailure() {
        if (sessionStorage.getItem('recovery-fixture-healthy') === 'true') return 'Recovered application';
        throw new Error('SYNTHETIC_PRIVATE_ERROR token=fixture-only component=SecretFixture');
      }`;
    } }],
  });
  process.chdir(root);
  console.log(`${app}: production recovery fixture built`);
}
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = createServer((req, res) => {
  const pathname = new URL(req.url, `http://127.0.0.1:${port}`).pathname;
  if (pathname === '/' || pathname === '/student-center') {
    res.setHeader('Content-Type', 'text/html');
    res.end(`<html lang="en"><head><title>Local recovery checks</title></head><body><h1>Local recovery checks</h1>${inventory.map((entry) => {
      const app = entry.workspace.replace('apps/', ''); return `<p><a href="/${app}/">${app}</a></p>`;
    }).join('')}</body></html>`);
    return;
  }
  const file = resolve(output, '.' + decodeURIComponent(pathname), pathname.endsWith('/') ? 'index.html' : '');
  if (!file.startsWith(output + sep) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', mime[extname(file)] ?? 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-store');
  res.end(readFileSync(file));
});
server.listen(port, '127.0.0.1', () => console.log(`Recovery preview ready: http://127.0.0.1:${port}`));
