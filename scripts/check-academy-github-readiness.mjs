import { execFileSync } from 'node:child_process';

const repo = process.env.GITHUB_REPOSITORY || 'atmyielts/English_T1';
const requiredSecrets = [
  'ACADEMY_EDGE_URL',
  'ACADEMY_SMOKE_TOKEN',
  'ACADEMY_STUDENT_SMOKE_TOKEN',
  'CLOUDFLARE_ACCOUNT_ID',
  'CLOUDFLARE_API_TOKEN',
  'VITE_SUPABASE_ANON_KEY',
  'VITE_SUPABASE_URL',
];

const checks = [];
const errors = [];

const addCheck = (label, pass, detail = '') => {
  checks.push({ label, pass, detail });
  if (!pass) errors.push(`${label}${detail ? `: ${detail}` : ''}`);
};

const gh = (args) => execFileSync('gh', args, { encoding: 'utf8' });

let secretNames = new Set();
try {
  const raw = gh(['secret', 'list', '--repo', repo]);
  secretNames = new Set(
    raw
      .split(/\r?\n/)
      .map((line) => line.trim().split(/\s+/)[0])
      .filter(Boolean),
  );
  addCheck('GitHub secrets can be listed', true);
} catch (error) {
  addCheck('GitHub secrets can be listed', false, error instanceof Error ? error.message : String(error));
}

for (const secret of requiredSecrets) {
  addCheck(`GitHub secret configured: ${secret}`, secretNames.has(secret));
}

let workflowList = '';
try {
  workflowList = gh(['workflow', 'list', '--repo', repo]);
  addCheck('GitHub workflows can be listed', true);
} catch (error) {
  addCheck('GitHub workflows can be listed', false, error instanceof Error ? error.message : String(error));
}

addCheck('Deploy Pages workflow exists on GitHub', workflowList.includes('Deploy Pages'));
addCheck('Academy Live Smoke workflow exists on GitHub', workflowList.includes('Academy Live Smoke'));

try {
  const raw = gh(['run', 'list', '--repo', repo, '--workflow', 'deploy-pages.yml', '--limit', '1', '--json', 'databaseId,conclusion,headSha,displayTitle,createdAt']);
  const runs = JSON.parse(raw);
  const latest = Array.isArray(runs) ? runs[0] : null;
  addCheck('Latest Deploy Pages run is visible', !!latest, latest ? `${latest.createdAt} ${latest.displayTitle ?? ''}` : '');
  if (latest) {
    addCheck('Latest Deploy Pages run succeeded', latest.conclusion === 'success', `conclusion ${latest.conclusion ?? 'unknown'}, sha ${latest.headSha ?? 'unknown'}`);
    const jobsRaw = gh(['run', 'view', String(latest.databaseId), '--repo', repo, '--json', 'jobs']);
    const jobsPayload = JSON.parse(jobsRaw);
    const academyJob = (jobsPayload.jobs ?? []).find((job) =>
      String(job.name ?? '').includes('deploy (academy, apps/academy, apps/academy/dist, schood-academy)')
    );
    addCheck('Latest Deploy Pages academy job is visible', !!academyJob, academyJob?.url ?? '');
    if (academyJob) {
      addCheck('Latest Deploy Pages academy job succeeded', academyJob.conclusion === 'success', `conclusion ${academyJob.conclusion ?? 'unknown'}`);
    }
  }
} catch (error) {
  addCheck('Latest Deploy Pages run can be inspected', false, error instanceof Error ? error.message : String(error));
}

for (const check of checks) {
  console.log(`${check.pass ? 'ok' : 'fail'} - ${check.label}${check.detail ? ` (${check.detail})` : ''}`);
}

if (errors.length > 0) {
  console.error('\nAcademy GitHub readiness checks failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`\nAcademy GitHub readiness checks passed (${checks.length} checks).`);
