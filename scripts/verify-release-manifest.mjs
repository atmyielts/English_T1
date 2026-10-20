import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { edgeRuntimeInventory } from './edge-release-inventory.mjs';

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
};
const base = option('--base') || (process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : 'origin/main');
const manifestPath = option('--manifest') || 'release/manifest.json';

const normalize = (value) => String(value ?? '').replace(/\\/g, '/').trim();
const uniqueSorted = (values) => [...new Set(values.map(normalize).filter(Boolean))].sort();
const sameList = (left, right) => JSON.stringify(uniqueSorted(left)) === JSON.stringify(uniqueSorted(right));

let changedFiles;
try {
  const gitReadOptions = { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] };
  const diffFiles = execFileSync('git', ['diff', '--name-only', base, '--'], gitReadOptions)
    .split(/\r?\n/)
    .map(normalize)
    .filter(Boolean);
  const untrackedFiles = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], gitReadOptions)
    .split(/\r?\n/)
    .map(normalize)
    .filter(Boolean);
  changedFiles = uniqueSorted([...diffFiles, ...untrackedFiles]);
} catch (error) {
  console.error(`Release manifest verification could not compare against ${base}. Fetch the base branch and retry.`);
  process.exit(error?.status || 1);
}

const changedFrontends = uniqueSorted(changedFiles.flatMap((file) => {
  const match = file.match(/^apps\/([^/]+)\//);
  return match ? [match[1]] : [];
}));
const migrations = uniqueSorted(changedFiles.flatMap((file) => {
  const match = file.match(/^supabase\/migrations\/([^/]+\.sql)$/);
  return match ? [match[1]] : [];
}));
const { edgeFunctions, sharedEdgeChanged } = edgeRuntimeInventory(changedFiles);
const workers = uniqueSorted(changedFiles.flatMap((file) => {
  const match = file.match(/^workers\/([^/]+)\//);
  return match ? [match[1]] : [];
}));
const hasManualBackend = migrations.length > 0 || edgeFunctions.length > 0 || workers.length > 0 || sharedEdgeChanged;

if (!hasManualBackend) {
  console.log(`Release plan: frontend-only (${changedFrontends.join(', ') || 'no app workspace changes'}). No manual backend manifest required.`);
  process.exit(0);
}

if (!existsSync(manifestPath)) {
  console.error(`Manual backend changes require ${manifestPath}.`);
  process.exit(1);
}

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
} catch (error) {
  console.error(`${manifestPath} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

const errors = [];
const expectList = (field, actual) => {
  const declared = Array.isArray(manifest[field]) ? manifest[field] : [];
  if (!sameList(declared, actual)) {
    errors.push(`${field} must exactly match the diff. expected=${JSON.stringify(actual)} declared=${JSON.stringify(uniqueSorted(declared))}`);
  }
};

if (manifest.schemaVersion !== 1) errors.push('schemaVersion must be 1');
if (!/^[a-z0-9][a-z0-9-]{2,80}$/.test(String(manifest.releaseId ?? ''))) errors.push('releaseId must be a stable lowercase slug');
if (manifest.status !== 'code_ready') errors.push('status must be code_ready; deployment and public launch are separate states');
if (manifest.backwardCompatible !== true) errors.push('backwardCompatible must be true for the production-only one-deploy boundary');
expectList('frontends', changedFrontends);
expectList('migrations', migrations);
expectList('edgeFunctions', edgeFunctions);
expectList('workers', workers);

if (sharedEdgeChanged && !Array.isArray(manifest.sharedEdgeConsumers)) {
  errors.push('sharedEdgeConsumers is required when supabase/functions/_shared changes');
}

const standardEnv = new Set(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY']);
const detectedSecrets = new Set();
for (const functionName of edgeFunctions) {
  for (const file of changedFiles.filter((item) => item.startsWith(`supabase/functions/${functionName}/`) && /\.(?:ts|js|mjs)$/.test(item))) {
    if (!existsSync(file)) continue;
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/(?:Deno\.env\.get|env|getEnv)\(\s*["']([A-Z][A-Z0-9_]+)["']\s*\)/g)) {
      if (!standardEnv.has(match[1])) detectedSecrets.add(match[1]);
    }
  }
}
if (!sameList(manifest.requiredSecrets ?? [], [...detectedSecrets])) {
  errors.push(`requiredSecrets must match non-standard env lookups. expected=${JSON.stringify(uniqueSorted([...detectedSecrets]))}`);
}

const rollout = Array.isArray(manifest.rolloutOrder) ? manifest.rolloutOrder.map(normalize) : [];
const pagesIndex = rollout.indexOf('pages');
if (changedFrontends.length > 0 && pagesIndex < 0) errors.push('rolloutOrder must include pages for changed frontends');
for (const migration of migrations) {
  const step = `migration:${migration}`;
  const index = rollout.indexOf(step);
  if (index < 0) errors.push(`rolloutOrder is missing ${step}`);
  if (pagesIndex >= 0 && index >= 0 && index < pagesIndex) errors.push(`${step} must not precede the backward-compatible Pages release`);
}
for (const secret of detectedSecrets) {
  if (!rollout.includes(`secret:${secret}`)) errors.push(`rolloutOrder is missing secret:${secret}`);
}
for (const functionName of edgeFunctions) {
  const step = `function:${functionName}`;
  const index = rollout.indexOf(step);
  if (index < 0) errors.push(`rolloutOrder is missing ${step}`);
  for (const migration of migrations) {
    const migrationIndex = rollout.indexOf(`migration:${migration}`);
    if (index >= 0 && migrationIndex >= 0 && index < migrationIndex) errors.push(`${step} must follow ${migration}`);
  }
}
for (const worker of workers) {
  if (!rollout.includes(`worker:${worker}`)) errors.push(`rolloutOrder is missing worker:${worker}`);
}

const followUps = Array.isArray(manifest.manualFollowUps) ? manifest.manualFollowUps.map(String) : [];
if (migrations.length > 0 && !followUps.some((step) => step.includes('supabase db push --linked'))) {
  errors.push('manualFollowUps must include supabase db push --linked');
}
for (const functionName of edgeFunctions) {
  if (!followUps.some((step) => step.includes(`supabase functions deploy ${functionName}`))) {
    errors.push(`manualFollowUps must include deployment of ${functionName}`);
  }
}
for (const secret of detectedSecrets) {
  if (!followUps.some((step) => step.includes(`supabase secrets set ${secret}=`))) {
    errors.push(`manualFollowUps must include configuration of ${secret}`);
  }
}

if (!Array.isArray(manifest.verification) || manifest.verification.length === 0) errors.push('verification must list post-release evidence');
if (!manifest.rollback || typeof manifest.rollback !== 'object') errors.push('rollback instructions are required');

if (errors.length > 0) {
  console.error('Release manifest verification failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Release manifest verified: ${manifest.releaseId}`);
console.log(`- Frontends: ${changedFrontends.join(', ') || 'none'}`);
console.log(`- Migrations: ${migrations.join(', ') || 'none'}`);
console.log(`- Edge Functions: ${edgeFunctions.join(', ') || 'none'}`);
console.log(`- Workers: ${workers.join(', ') || 'none'}`);
console.log(`- Required secrets: ${uniqueSorted([...detectedSecrets]).join(', ') || 'none'}`);
