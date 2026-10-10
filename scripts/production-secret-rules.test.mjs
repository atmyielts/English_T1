import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { secretLabels } from './production-secret-rules.mjs';

const token = role => [
  Buffer.from(JSON.stringify({alg: 'HS256'})).toString('base64url'),
  Buffer.from(JSON.stringify({role, iss: 'synthetic-test'})).toString('base64url'),
  'syntheticSignature',
].join('.');
const scan = files => {
  const cwd = mkdtempSync(join(tmpdir(), 'schood-secret-contract-'));
  execFileSync('git', ['init', '--quiet'], {cwd, stdio: 'ignore', windowsHide: true});
  mkdirSync(join(cwd, 'supabase/migrations'), {recursive: true});
  for (const [name, content] of Object.entries(files)) writeFileSync(join(cwd, name), content);
  return spawnSync(process.execPath, [fileURLToPath(new URL('./verify-production-readiness.mjs', import.meta.url))], {cwd, encoding: 'utf8', windowsHide: true});
};

test('every credential shape is detected in consecutive files regardless of match position', () => {
  const fixtures = [
    ['Supabase service role literal', 'sb_' + 'secret_' + 'x'.repeat(25)],
    ['Supabase publishable literal', 'sb_' + 'publishable_' + 'x'.repeat(25)],
    ['OpenRouter key literal', 'sk-' + 'or-v1-' + 'x'.repeat(25)],
    ['OpenAI key literal', 'sk-' + 'x'.repeat(25)],
    ['AWS access key id literal', 'AK' + 'IA' + 'X'.repeat(16)],
    ['Private key block', '-----BEGIN ' + 'PRIVATE KEY-----'],
  ];
  for (const [label, fixture] of fixtures) {
    assert.deepEqual(secretLabels(' '.repeat(250) + fixture), [label]);
    assert.deepEqual(secretLabels(fixture), [label]);
  }
});

test('the actual production gate rejects two adjacent secret-bearing files without printing values', () => {
  const fixture = 'sb_' + 'secret_' + 'x'.repeat(25);
  const result = scan({'a.ts': ' '.repeat(250) + fixture, 'b.ts': fixture});
  assert.ifError(result.error);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /found in a\.ts/);
  assert.match(result.stderr, /found in b\.ts/);
  assert(!result.stderr.includes(fixture));
});

test('the actual gate detects a legacy service role JWT and permits public anon JWTs and empty key declarations', () => {
  const privateFixture = token('service_role');
  const failed = scan({'service.ts': privateFixture, 'anon.ts': token('anon')});
  assert.ifError(failed.error);
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /Supabase legacy service role JWT found in service\.ts/);
  assert(!failed.stderr.includes(privateFixture));
  assert.doesNotMatch(failed.stderr, /found in anon\.ts/);
  const allowed = scan({'anon.ts': token('anon'), '.env.example': 'SUPABASE_' + 'SERVICE_ROLE_KEY=\nOPENROUTER_API_KEY=\n'});
  assert.ifError(allowed.error);
  assert.equal(allowed.status, 0);
  assert.deepEqual(secretLabels('eyJmalformed.notJson.syntheticSignature'), []);
});
