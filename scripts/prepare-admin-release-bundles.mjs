// Prepare isolated Edge source bundles. This script never deploys a function.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const sourceHash = source => createHash('sha256').update(source.replace(/\r\n/g, '\n')).digest('hex');
const helper = 'supabase/functions/_shared/admin-access.ts';
const patchesFor = name => [helper, ...(name === 'me' ? ['supabase/functions/me/handler.ts'] : []),
  ...(name === 'platform-settings' ? ['supabase/functions/platform-settings/index.ts', 'supabase/functions/platform-settings/handler.ts'] : [])];
const sourcePath = value => {
  if (typeof value !== 'string' || !/^supabase\/functions\/[a-z0-9_-]+\/(?:[a-zA-Z0-9_.-]+\/)*[a-zA-Z0-9_.-]+\.ts$/.test(value) ||
    value.split('/').some(part => part === '.' || part === '..')) throw Error('Invalid runtime source path');
  return value;
};

export function prepareAdminBundles({ workspaceRoot, captureRoot, outputRoot, baseline, providerInventory, reviewedCommit, reviewedSources }) {
  if (!/^[a-f0-9]{40}$/.test(reviewedCommit)) throw Error('A complete reviewed commit is required');
  if (baseline.schemaVersion !== 1 || baseline.projectRef !== 'bbjawctnqrufvnesdsel' || !Array.isArray(baseline.functions) || baseline.functions.length === 0) {
    throw Error('Invalid reviewed provider baseline');
  }
  const workspace = realpathSync(workspaceRoot), destination = path.resolve(outputRoot);
  const reserved = path.join(workspace, 'supabase', '.temp', 'admin-release');
  if (!destination.startsWith(reserved + path.sep) || existsSync(destination)) throw Error('Use a fresh directory inside supabase/.temp/admin-release');
  let ancestor = path.dirname(destination);
  while (!existsSync(ancestor)) ancestor = path.dirname(ancestor);
  const realAncestor = realpathSync(ancestor);
  if (realAncestor !== workspace && !realAncestor.startsWith(workspace + path.sep)) throw Error('Output parent escapes the workspace');
  const capture = realpathSync(captureRoot), names = new Set(), plans = [];
  for (const item of baseline.functions) {
    if (!/^[a-z][a-z0-9-]+$/.test(item.name) || names.has(item.name) || !Number.isInteger(item.version) || typeof item.verifyJwt !== 'boolean') {
      throw Error('Invalid or duplicate function baseline');
    }
    names.add(item.name);
    const current = providerInventory.find(value => value.name === item.name);
    if (!current || current.status !== 'ACTIVE' || current.version !== item.version || current.verify_jwt !== item.verifyJwt) {
      throw Error(`Published identity changed for ${item.name}; recapture and review before preparing bundles`);
    }
    const files = new Map();
    for (const file of item.files) {
      const relative = sourcePath(file.path);
      if (files.has(relative) || !/^[a-f0-9]{64}$/.test(file.sha256)) throw Error('Invalid source fingerprint');
      const capturedPath = realpathSync(path.join(capture, item.name, relative));
      if (!capturedPath.startsWith(path.join(capture, item.name) + path.sep)) throw Error('Captured source escapes its function');
      const source = readFileSync(capturedPath, 'utf8');
      if (sourceHash(source) !== file.sha256) throw Error(`Published source fingerprint changed for ${item.name}: ${relative}`);
      files.set(relative, { source, baselineSha256: file.sha256, sourceKind: 'retained-published' });
    }
    if (!files.has(`supabase/functions/${item.name}/index.ts`)) throw Error('Published entry point missing');
    for (const relative of patchesFor(item.name)) {
      const source = reviewedSources[relative];
      if (typeof source !== 'string' || source.length === 0) throw Error(`Reviewed security source missing: ${relative}`);
      files.set(relative, { source, baselineSha256: files.get(relative)?.baselineSha256 ?? null, sourceKind: 'reviewed-security-patch' });
    }
    plans.push({ name: item.name, previousVersion: item.version, verifyJwt: item.verifyJwt, files });
  }
  // Validate every function before writing any bundle; a bad capture cannot
  // leave a seemingly complete subset ready for accidental deployment.
  mkdirSync(destination, { recursive: true });
  const evidence = { schemaVersion: 1, status: 'prepared_not_deployed', preparedAt: new Date().toISOString(),
    projectRef: baseline.projectRef, reviewedCommit, functions: [] };
  for (const plan of plans) {
    const functionRoot = path.join(destination, plan.name);
    for (const [relative, file] of plan.files) {
      const output = path.join(functionRoot, relative);
      mkdirSync(path.dirname(output), { recursive: true });
      writeFileSync(output, file.source, 'utf8');
    }
    writeFileSync(path.join(functionRoot, 'supabase', 'config.toml'),
      `project_id = "schood-admin-${plan.name}"\n\n[functions.${plan.name}]\nverify_jwt = ${plan.verifyJwt}\n`, 'utf8');
    evidence.functions.push({ name: plan.name, previousVersion: plan.previousVersion, verifyJwt: plan.verifyJwt,
      files: [...plan.files].map(([relative, file]) => ({ path: relative, sha256: sourceHash(file.source),
        baselineSha256: file.baselineSha256, sourceKind: file.sourceKind })) });
  }
  writeFileSync(path.join(destination, 'prepared-bundles.json'), JSON.stringify(evidence, null, 2) + '\n', 'utf8');
  return evidence;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const option = name => process.argv.find(value => value.startsWith(name + '='))?.slice(name.length + 1);
  const captureRoot = option('--capture-root'), outputRoot = option('--output-dir'), reviewedCommit = option('--reviewed-commit');
  if (!captureRoot || !outputRoot || !reviewedCommit) throw Error('--capture-root, --output-dir and --reviewed-commit are required');
  const workspaceRoot = process.cwd();
  const git = args => execFileSync('git', args, { cwd: workspaceRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (git(['rev-parse', reviewedCommit + '^{commit}']).trim() !== reviewedCommit) throw Error('Reviewed commit is unavailable');
  const baseline = JSON.parse(git(['show', reviewedCommit + ':release/admin-published-baseline.json']));
  const manifest = JSON.parse(git(['show', reviewedCommit + ':release/manifest.json']));
  if (JSON.stringify([...manifest.sharedEdgeConsumers].sort()) !== JSON.stringify(baseline.functions.map(item => item.name).sort())) {
    throw Error('Provider baseline must exactly inventory the reviewed shared consumers');
  }
  const reviewedSources = Object.fromEntries([...new Set(baseline.functions.flatMap(item => patchesFor(item.name)))].map(relative => [relative, git(['show', reviewedCommit + ':' + relative])]));
  let providerInventory;
  try {
    providerInventory = JSON.parse(execFileSync('supabase', ['functions', 'list', '--project-ref', baseline.projectRef, '--output', 'json'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 20_000, windowsHide: true }));
  } catch { throw Error('Read-only provider identity check unavailable; no raw credentials or provider output logged'); }
  const evidence = prepareAdminBundles({ workspaceRoot, captureRoot, outputRoot, baseline, providerInventory, reviewedCommit, reviewedSources });
  console.log(JSON.stringify({ prepared: evidence.functions.length, reviewedCommit, outputRoot: path.resolve(outputRoot),
    productionChanged: false, typecheckAndHostedQualificationStillRequired: true }));
}
