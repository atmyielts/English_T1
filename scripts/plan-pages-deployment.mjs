import { appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// Deliberately narrow: shared Edge files are imported by the platform UI.
// Unknown paths, app removals, dependencies and workflow changes publish all apps.
export function needsPagesDeployment(files) {
  if (!files.length) return true;
  return files.some(file => !(
    /^(?:docs|brand-materials|release)\//.test(file)
    || /^supabase\/migrations\/[^/]+\.sql$/.test(file)
    || /^(?:README|AGENTS|CLAUDE)\.md$/.test(file)
  ));
}

export function deploymentPlan(env = process.env, gitRead = execFileSync) {
  if (env.DEPLOY_EVENT !== 'push') return { deploy: true, reason: 'manual or unknown event' };
  const sha = /^[a-f0-9]{40}$/;
  if (!sha.test(env.DEPLOY_BEFORE ?? '') || /^0+$/.test(env.DEPLOY_BEFORE)
      || !sha.test(env.DEPLOY_HEAD ?? '')) return { deploy: true, reason: 'missing comparison history' };
  try {
    // --no-renames includes both paths of moves; a move out of apps must publish.
    const output = gitRead('git', ['diff', '--name-only', '--no-renames', '-z',
      env.DEPLOY_BEFORE, env.DEPLOY_HEAD, '--'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const deploy = needsPagesDeployment(output.split('\0').filter(Boolean));
    return { deploy, reason: deploy ? 'frontend or unclassified changes' : 'only documentation, release records or SQL migrations' };
  } catch {
    return { deploy: true, reason: 'comparison unavailable; publish conservatively' };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const plan = deploymentPlan();
  if (!process.env.GITHUB_OUTPUT) throw new Error('GITHUB_OUTPUT is required');
  appendFileSync(process.env.GITHUB_OUTPUT, `deploy=${plan.deploy}\n`);
  console.log(`Pages publication: ${plan.deploy ? 'required' : 'skipped'} (${plan.reason}).`);
}
