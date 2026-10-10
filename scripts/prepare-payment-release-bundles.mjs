// Build isolated, source-preserving bundles. This command does not deploy.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const option = name => process.argv.find(value => value.startsWith(name + '='))?.slice(name.length + 1);
const captureArgument = option('--capture-root'), outputArgument = option('--output-dir'), commit = option('--reviewed-commit');
if (!captureArgument || !outputArgument || !/^[a-f0-9]{40}$/.test(commit ?? '')) throw Error('Capture, fresh output directory and complete reviewed commit are required');
const workspace = realpathSync(process.cwd()), capture = realpathSync(captureArgument), destination = path.resolve(outputArgument);
const reserved = path.join(workspace, 'supabase', '.temp', 'payment-release');
if (!destination.startsWith(reserved + path.sep) || existsSync(destination)) throw Error('Use a fresh directory inside supabase/.temp/payment-release');
let ancestor = path.dirname(destination);
while (!existsSync(ancestor)) ancestor = path.dirname(ancestor);
if (!realpathSync(ancestor).startsWith(workspace + path.sep)) throw Error('Output parent escapes workspace');
const git = args => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
if (git(['rev-parse', commit + '^{commit}']).trim() !== commit) throw Error('Reviewed commit unavailable');
const baseline = JSON.parse(git(['show', commit + ':release/payment-published-baseline.json']));
const manifest = JSON.parse(git(['show', commit + ':release/manifest.json']));
const patches = {
  'admin-payments': ['admin-payments/index.ts', 'click/fulfillment.ts'],
  click: ['click/index.ts', 'click/handler.ts', 'click/fulfillment.ts'],
  'partner-office': ['partner-office/index.ts', 'partner-office/checkout.ts', 'partner-office/voucher-batches.ts'],
  'teacher-office': ['teacher-office/index.ts', 'teacher-office/assignment.ts'],
  'voucher-redeem': ['voucher-redeem/index.ts', 'voucher-redeem/preview.ts', 'voucher-redeem/redemption.ts'],
  'candidate-entry': ['candidate-entry/index.ts', 'candidate-entry/auth.ts', 'candidate-entry/atomic.ts'],
};
const sameNames = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
if (baseline.schemaVersion !== 1 || baseline.projectRef !== 'bbjawctnqrufvnesdsel' ||
    !sameNames(manifest.edgeFunctions, Object.keys(patches)) || !sameNames(baseline.functions.map(f => f.name), Object.keys(patches))) throw Error('Reviewed function inventory mismatch');
let inventory;
try {
  inventory = JSON.parse(execFileSync('supabase', ['functions', 'list', '--project-ref', baseline.projectRef, '--output', 'json'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000, windowsHide: true }));
} catch { throw Error('Read-only provider identity check failed; raw output suppressed'); }
const hash = source => createHash('sha256').update(source.replaceAll('\r\n', '\n')).digest('hex');
const validPath = value => typeof value === 'string' && /^supabase\/functions\/[a-z0-9_-]+\/(?:[a-zA-Z0-9_.-]+\/)*[a-zA-Z0-9_.-]+\.ts$/.test(value) && !value.split('/').some(p => p === '.' || p === '..');
const plans = [];
for (const item of baseline.functions) {
  const current = inventory.find(f => f.name === item.name);
  if (!current || current.id !== item.id || current.status !== 'ACTIVE' || current.version !== item.version || current.verify_jwt !== item.verifyJwt) throw Error('Provider baseline drift: ' + item.name);
  const files = new Map();
  const functionCapture = realpathSync(path.join(capture, item.name));
  if (!functionCapture.startsWith(capture + path.sep)) throw Error('Capture escapes root');
  for (const file of item.files) {
    if (!validPath(file.path) || files.has(file.path)) throw Error('Invalid published runtime path');
    const full = realpathSync(path.join(functionCapture, file.path));
    if (!full.startsWith(functionCapture + path.sep)) throw Error('Captured source escapes function');
    const source = readFileSync(full, 'utf8');
    if (hash(source) !== file.sha256) throw Error('Published source changed: ' + item.name);
    files.set(file.path, { source, baselineSha256: file.sha256, sourceKind: 'retained-published' });
  }
  for (const suffix of patches[item.name]) {
    const relative = 'supabase/functions/' + suffix, source = git(['show', commit + ':' + relative]);
    files.set(relative, { source, baselineSha256: files.get(relative)?.baselineSha256 ?? null, sourceKind: 'reviewed-payment-patch' });
  }
  // Every local runtime import must resolve inside this isolated bundle.
  for (const [relative, file] of files) for (const match of file.source.matchAll(/(?:from|import)\s*["'](\.{1,2}\/[^"']+)["']/g)) {
    const dependency = path.posix.normalize(path.posix.join(path.posix.dirname(relative), match[1]));
    if (!files.has(dependency)) throw Error('Uncaptured runtime dependency: ' + item.name + '/' + dependency);
  }
  plans.push({ item, files });
}
mkdirSync(destination, { recursive: true });
const proof = { schemaVersion: 1, status: 'prepared_not_deployed', productionChanged: false, preparedAt: new Date().toISOString(), reviewedCommit: commit, projectRef: baseline.projectRef, functions: [] };
for (const { item, files } of plans) {
  const root = path.join(destination, item.name);
  for (const [relative, file] of files) { const output = path.join(root, relative); mkdirSync(path.dirname(output), { recursive: true }); writeFileSync(output, file.source); }
  writeFileSync(path.join(root, 'supabase/config.toml'), `project_id = "schood-payment-${item.name}"\n\n[functions.${item.name}]\nverify_jwt = ${item.verifyJwt}\n`);
  proof.functions.push({ name: item.name, previousVersion: item.version, verifyJwt: item.verifyJwt, files: [...files].map(([relative, file]) => ({ path: relative, sha256: hash(file.source), baselineSha256: file.baselineSha256, sourceKind: file.sourceKind })) });
}
writeFileSync(path.join(destination, 'prepared-bundles.json'), JSON.stringify(proof, null, 2) + '\n');
console.log(JSON.stringify({ prepared: proof.functions.length, reviewedCommit: commit, productionChanged: false, typecheckAndHostedQualificationRequired: true }));
