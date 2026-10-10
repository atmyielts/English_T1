import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const source = fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8').replace(/\r\n/g, '\n');
const pages = fs.readFileSync(path.join(root, '.github/workflows/deploy-pages.yml'), 'utf8');
const job = name => {
  const marker = `  ${name}:\n`;
  const start = source.indexOf(marker, source.indexOf('jobs:\n'));
  assert(start >= 0, `Missing ${name} job`);
  const rest = source.slice(start + marker.length);
  const next = rest.search(/^  [a-z][a-z-]*:\n/m);
  return next < 0 ? rest : rest.slice(0, next);
};

test('parallel CI builds each deployed frontend exactly once', () => {
  const expected = [...pages.matchAll(/^\s+workspace: (apps\/\S+)\s*$/gm)].map(match => match[1]).sort();
  const actual = [...job('build').matchAll(/^\s+workspaces: (.+)$/gm)].flatMap(match => match[1].trim().split(/\s+/)).sort();
  assert.equal(expected.length, 13);
  assert.deepEqual(actual, expected);
  assert.match(job('build'), /fail-fast: false/);
  assert.match(job('build'), /max-parallel: 3/);
  assert.match(job('build'), /npm --workspace "\$workspace" run build \|\| exit 1/);
  assert.match(job('build'), /if: matrix\.group == 'platform-academy'\s+run: npm run smoke:academy/);
});

test('test, security, browser and audit gates remain in the checks job', () => {
  const checks = job('checks');
  for (const command of [
    'npm ci', 'npm run verify:prod', "npm run verify:release -- --base origin/${{ github.base_ref || 'main' }}",
    'npm run verify:academy', 'npm --workspace apps/academy run lint',
    'npx playwright install --with-deps chromium', 'npm run test:academy:routes', 'npm test',
    'npm run test:guide && npm run check:guide', 'npm run test:guide:browser',
    'deno check supabase/functions/hub/index.ts', 'npm run --if-present test:english:mass-readiness',
    'deno check supabase/functions/academy/index.ts', 'npm run test:academy:edge',
    'node scripts/audit-runtime-dependencies.mjs',
  ]) assert(checks.includes(`run: ${command}\n`), `Missing gate: ${command}`);
  assert.match(source, /permissions:\s+contents: read/);
  assert.doesNotMatch(source, /wrangler pages deploy|supabase (?:db push|functions deploy|secrets set)|gh pr merge/);
});

test('validate waits for every group and cannot pass a failed, canceled or skipped dependency', () => {
  const validate = job('validate');
  assert.match(validate, /needs: \[checks, build\]/);
  assert.match(validate, /if: \$\{\{ always\(\) \}\}/);
  assert.match(validate, /CHECKS_RESULT: \$\{\{ needs\.checks\.result \}\}/);
  assert.match(validate, /BUILDS_RESULT: \$\{\{ needs\.build\.result \}\}/);
  const match = validate.match(/        run: \|\n((?:          .*(?:\n|$))+)/);
  assert(match, 'Missing executable aggregate gate');
  const script = match[1].replace(/^          /gm, '');
  const shell = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : '/bin/bash';
  for (const checks of ['success', 'failure', 'cancelled', 'skipped', 'timed_out', '']) {
    for (const builds of ['success', 'failure', 'cancelled', 'skipped', 'timed_out', '']) {
      const result = spawnSync(shell, ['-c', script], {env: {...process.env, CHECKS_RESULT: checks, BUILDS_RESULT: builds}, encoding: 'utf8'});
      assert.ifError(result.error);
      assert.equal(result.status === 0, checks === 'success' && builds === 'success', `${checks}/${builds}`);
    }
  }
});
