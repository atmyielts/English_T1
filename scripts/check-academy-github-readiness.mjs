import { execFileSync } from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {academySmokeDeploymentDecision} from './academy-smoke-deployment-gate.mjs';

const repo = process.env.GITHUB_REPOSITORY || 'atmyielts/English_T1';
const requiredSecrets = [
  'ACADEMY_EDGE_URL',
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

const ownerTokenConfigured = secretNames.has('ACADEMY_SMOKE_TOKEN');
const ownerCredentialsConfigured = secretNames.has('ACADEMY_SMOKE_EMAIL') && secretNames.has('ACADEMY_SMOKE_PASSWORD');
addCheck(
  'GitHub owner smoke auth configured',
  ownerTokenConfigured || ownerCredentialsConfigured,
  'set ACADEMY_SMOKE_TOKEN or ACADEMY_SMOKE_EMAIL + ACADEMY_SMOKE_PASSWORD',
);

const studentTokenConfigured = secretNames.has('ACADEMY_STUDENT_SMOKE_TOKEN');
const studentCredentialsConfigured = secretNames.has('ACADEMY_STUDENT_SMOKE_EMAIL') && secretNames.has('ACADEMY_STUDENT_SMOKE_PASSWORD');
addCheck(
  'GitHub student smoke auth configured',
  studentTokenConfigured || studentCredentialsConfigured,
  'set ACADEMY_STUDENT_SMOKE_TOKEN or ACADEMY_STUDENT_SMOKE_EMAIL + ACADEMY_STUDENT_SMOKE_PASSWORD',
);

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
  const raw = gh(['run', 'list', '--repo', repo, '--workflow', 'deploy-pages.yml', '--limit', '20', '--json', 'databaseId,status,conclusion,headSha,displayTitle,createdAt']);
  const runs = JSON.parse(raw);
  const latest = Array.isArray(runs) ? runs[0] : null;
  addCheck('Latest Deploy Pages run is visible', !!latest, latest ? `${latest.createdAt} ${latest.displayTitle ?? ''}` : '');
  if (latest) {
    addCheck('Latest Deploy Pages run succeeded', latest.conclusion === 'success', `conclusion ${latest.conclusion ?? 'unknown'}, sha ${latest.headSha ?? 'unknown'}`);
    let publicationFound=false;
    for(const run of runs){
      const jobs=JSON.parse(gh(['run','view',String(run.databaseId),'--repo',repo,'--json','jobs'])).jobs??[];
      const academyJob=jobs.find(job=>job.name==='deploy (academy, apps/academy, apps/academy/dist, schood-academy)');
      if(academyJob){
        publicationFound=true;
        addCheck('Latest published Academy job succeeded',run.status==='completed'&&run.conclusion==='success'&&academyJob.conclusion==='success',`run ${run.databaseId}, sha ${run.headSha}, conclusion ${academyJob.conclusion??'unknown'}`);
        break;
      }
      const prefix=path.join(tmpdir(),'schood-pages-plan-'),directory=mkdtempSync(prefix);
      try{
        gh(['run','download',String(run.databaseId),'--repo',repo,'--name','pages-deployment-plan','--dir',directory]);
        const plan=JSON.parse(readFileSync(path.join(directory,'pages-deployment-plan.json'),'utf8'));
        const decision=academySmokeDeploymentDecision(plan,{status:run.status,conclusion:run.conclusion,head_sha:run.headSha},jobs);
        addCheck('Pages run explicitly skipped frontend publication',!decision.runSmoke,`run ${run.databaseId}, sha ${run.headSha}`);
      }finally{
        if(!path.resolve(directory).startsWith(path.resolve(prefix)))throw Error('Owned temporary plan path changed');
        rmSync(directory,{recursive:true});
      }
    }
    addCheck('Recent tracked Academy publication is visible',publicationFound);
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
