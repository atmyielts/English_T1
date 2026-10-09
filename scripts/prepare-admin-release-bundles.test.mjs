import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { prepareAdminBundles, sourceHash } from './prepare-admin-release-bundles.mjs';

const ownedRoots = [], temporaryRoot = realpathSync(os.tmpdir());
afterEach(() => {
  for (const root of ownedRoots.splice(0)) {
    // Recursive cleanup is restricted to the exact exclusive root we created.
    assert.equal(realpathSync(root), root);
    assert.equal(path.dirname(root), temporaryRoot);
    assert.ok(path.basename(root).startsWith('schood-admin-bundle-test-'));
    rmSync(root, { recursive: true, force: false });
  }
});
function fixture() {
  const root = realpathSync(mkdtempSync(path.join(temporaryRoot, 'schood-admin-bundle-test-')));
  ownedRoots.push(root);
  const workspaceRoot = path.join(root, 'workspace'), captureRoot = path.join(root, 'capture');
  mkdirSync(workspaceRoot); mkdirSync(captureRoot);
  const baseline = { schemaVersion: 1, projectRef: 'bbjawctnqrufvnesdsel', functions: [] };
  const providerInventory = [], reviewedSources = {
    'supabase/functions/_shared/admin-access.ts': 'export const reviewedSecurity = true;\n',
    'supabase/functions/me/handler.ts': 'export const activeAccountPolicy = true;\n',
    'supabase/functions/platform-settings/index.ts': 'import "./handler.ts";\n',
    'supabase/functions/platform-settings/handler.ts': 'export const preserveSavedPolicy = true;\n',
    'supabase/functions/admin-assets/index.ts': 'unrelated checkout changes must be ignored',
  };
  for (const [name, verifyJwt] of [['admin-assets', false], ['me', false], ['platform-settings', true]]) {
    const sources = {
      [`supabase/functions/${name}/index.ts`]: 'export const publishedEndpoint = "' + name + '";\n',
      'supabase/functions/_shared/published-only.ts': 'export const learningEvidenceRetained = true;\n',
    };
    const files = Object.entries(sources).map(([relative, source]) => {
      const p = path.join(captureRoot, name, relative); mkdirSync(path.dirname(p), { recursive: true }); writeFileSync(p, source);
      return { path: relative, sha256: sourceHash(source) };
    });
    baseline.functions.push({ name, version: 8, verifyJwt, files });
    providerInventory.push({ name, version: 8, verify_jwt: verifyJwt, status: 'ACTIVE' });
  }
  const outputRoot = path.join(workspaceRoot, 'supabase', '.temp', 'admin-release', 'exclusive-test');
  return { workspaceRoot, captureRoot, outputRoot, baseline, providerInventory, reviewedSources, reviewedCommit: 'a'.repeat(40) };
}
const expectRefusal = (change, expression) => {
  const f = fixture(); change(f); assert.throws(() => prepareAdminBundles(f), expression); assert.equal(existsSync(f.outputRoot), false);
};
test('only reviewed security files replace published code; legacy learning/media endpoints survive', () => {
  const f = fixture(), evidence = prepareAdminBundles(f);
  assert.equal(evidence.functions.length, 3); assert.equal(evidence.status, 'prepared_not_deployed');
  const assets = evidence.functions.find(value => value.name === 'admin-assets');
  assert.equal(readFileSync(path.join(f.outputRoot, 'admin-assets/supabase/functions/admin-assets/index.ts'), 'utf8'), 'export const publishedEndpoint = "admin-assets";\n');
  for (const entry of evidence.functions) {
    assert.equal(readFileSync(path.join(f.outputRoot, entry.name, 'supabase/functions/_shared/published-only.ts'), 'utf8'), 'export const learningEvidenceRetained = true;\n');
    assert.equal(readFileSync(path.join(f.outputRoot, entry.name, 'supabase/functions/_shared/admin-access.ts'), 'utf8'), f.reviewedSources['supabase/functions/_shared/admin-access.ts']);
    assert.ok(readFileSync(path.join(f.outputRoot, entry.name, 'supabase/config.toml'), 'utf8').includes(`verify_jwt = ${entry.verifyJwt}`));
  }
  assert.equal(assets.files.find(file => file.path.endsWith('published-only.ts')).sourceKind, 'retained-published');
  assert.equal(readFileSync(path.join(f.outputRoot, 'me/supabase/functions/me/handler.ts'), 'utf8'), f.reviewedSources['supabase/functions/me/handler.ts']);
  assert.equal(readFileSync(path.join(f.outputRoot, 'platform-settings/supabase/functions/platform-settings/index.ts'), 'utf8'), f.reviewedSources['supabase/functions/platform-settings/index.ts']);
  assert.equal(JSON.parse(readFileSync(path.join(f.outputRoot, 'prepared-bundles.json'), 'utf8')).reviewedCommit, f.reviewedCommit);
});
test('changed published version refuses every bundle before any output', () => expectRefusal(f => f.providerInventory[2].version++, /Published identity changed/));
test('changed gateway refuses every bundle', () => expectRefusal(f => f.providerInventory[2].verify_jwt = false, /Published identity changed/));
test('inactive published endpoint refuses every bundle', () => expectRefusal(f => f.providerInventory[2].status = 'REMOVED', /Published identity changed/));
test('missing provider endpoint refuses every bundle', () => expectRefusal(f => f.providerInventory.pop(), /Published identity changed/));
test('changed captured source cannot silently enter release', () => expectRefusal(f => writeFileSync(path.join(f.captureRoot, 'me', f.baseline.functions[1].files[0].path), 'changed source'), /fingerprint changed/));
test('missing reviewed patch refuses all output', () => expectRefusal(f => delete f.reviewedSources['supabase/functions/me/handler.ts'], /security source missing/));
test('source traversal cannot read other files', () => expectRefusal(f => f.baseline.functions[0].files[0].path = 'supabase/functions/../outside.ts', /Invalid runtime source path/));
test('absolute source paths are refused', () => expectRefusal(f => f.baseline.functions[0].files[0].path = 'C:/outside.ts', /Invalid runtime source path/));
test('duplicate function baseline is refused', () => expectRefusal(f => f.baseline.functions.push(f.baseline.functions[0]), /duplicate function/));
test('duplicate source entry is refused', () => expectRefusal(f => f.baseline.functions[0].files.push(f.baseline.functions[0].files[0]), /Invalid source fingerprint/));
test('unknown project is refused', () => expectRefusal(f => f.baseline.projectRef = 'other-project', /Invalid reviewed provider baseline/));
test('incomplete reviewed commit is refused', () => expectRefusal(f => f.reviewedCommit = 'a'.repeat(7), /complete reviewed commit/));
test('output outside the reserved workspace location is refused', () => {
  const f = fixture(); f.outputRoot = path.join(path.dirname(f.workspaceRoot), 'outside');
  assert.throws(() => prepareAdminBundles(f), /fresh directory inside/); assert.equal(existsSync(f.outputRoot), false);
});
test('existing output is never overwritten', () => {
  const f = fixture(); mkdirSync(f.outputRoot, { recursive: true }); writeFileSync(path.join(f.outputRoot, 'sentinel.txt'), 'preserve');
  assert.throws(() => prepareAdminBundles(f), /fresh directory inside/);
  assert.equal(readFileSync(path.join(f.outputRoot, 'sentinel.txt'), 'utf8'), 'preserve');
});
