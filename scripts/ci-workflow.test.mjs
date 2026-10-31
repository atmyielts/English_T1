import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { deploymentPlan, needsPagesDeployment } from './plan-pages-deployment.mjs';
import { isFullAcademyRouteCommand } from './academy-route-command.mjs';
import { academySmokeDeploymentDecision } from './academy-smoke-deployment-gate.mjs';

const root = path.resolve(import.meta.dirname, '..');
const source = fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8').replace(/\r\n/g, '\n');
const pages = fs.readFileSync(path.join(root, '.github/workflows/deploy-pages.yml'), 'utf8');
const packageScripts = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).scripts;
const job = name => {
  const marker = `  ${name}:\n`;
  const start = source.indexOf(marker, source.indexOf('jobs:\n'));
  assert(start >= 0, `Missing ${name} job`);
  const rest = source.slice(start + marker.length);
  const next = rest.search(/^  [a-z][a-z-]*:\n/m);
  return next < 0 ? rest : rest.slice(0, next);
};

test('superseded PR checks cancel without interrupting main validation', () => {
  assert.match(source, /group: ci-\$\{\{ github\.event\.pull_request\.number \|\| github\.sha \}\}/);
  assert.match(source, /cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/);
});

test('Pages skips only documented non-frontend changes and keeps shared imports', () => {
  assert.equal(needsPagesDeployment(['docs/release.md', 'supabase/migrations/123.sql', 'release/manifest.json']), false);
  for (const file of ['apps/platform/src/App.tsx', 'packages/shared/index.ts', 'package-lock.json',
    'supabase/functions/_shared/guide.ts', 'supabase/functions/writing-tutor/index.ts',
    'scripts/pages-asset-policy.mjs', '.github/workflows/deploy-pages.yml', 'unknown-path']) {
    assert.equal(needsPagesDeployment(['docs/release.md', file]), true, file);
  }
  assert.equal(needsPagesDeployment([]), true);
  assert.match(pages, /needs: plan\s+if: \$\{\{ needs\.plan\.outputs\.deploy == 'true' \}\}/);
  assert.match(pages, /fetch-depth: 0/);
  assert.match(pages, /run: node scripts\/plan-pages-deployment\.mjs/);
  assert.match(pages, /if: \$\{\{ github\.event_name == 'workflow_dispatch' && needs\.deploy\.result == 'success' \}\}/);
});

test('manual, new branch and unreadable history publish; push compares the entire change', () => {
  const env = { DEPLOY_EVENT: 'push', DEPLOY_BEFORE: 'a'.repeat(40), DEPLOY_HEAD: 'b'.repeat(40) };
  const mustNotRead = () => { throw new Error('unexpected comparison'); };
  assert.equal(deploymentPlan({ ...env, DEPLOY_EVENT: 'workflow_dispatch' }, mustNotRead).deploy, true);
  assert.equal(deploymentPlan({ ...env, DEPLOY_BEFORE: '0'.repeat(40) }, mustNotRead).deploy, true);
  assert.equal(deploymentPlan({ ...env, DEPLOY_BEFORE: 'invalid' }, mustNotRead).deploy, true);
  assert.equal(deploymentPlan(env, () => { throw new Error('missing history'); }).deploy, true);
  const read = (command, args) => {
    assert.equal(command, 'git');
    assert.deepEqual(args, ['diff', '--name-only', '--no-renames', '-z', env.DEPLOY_BEFORE, env.DEPLOY_HEAD, '--']);
    return 'docs/a file.md\0supabase/migrations/1.sql\0';
  };
  assert.equal(deploymentPlan(env, read).deploy, false);
  assert.equal(deploymentPlan(env, () => 'apps/platform/deleted.tsx\0docs/moved.tsx\0').deploy, true);
});

test('smoke requires exact-head plan and successful real Academy deployment',()=>{
 const head='b'.repeat(40),run={head_sha:head,status:'completed',conclusion:'success'},plan={schemaVersion:1,head,deploy:true};
 const jobs=[{name:'plan',status:'completed',conclusion:'success'},{name:'deploy (academy, apps/academy, apps/academy/dist, schood-academy)',status:'completed',conclusion:'success'}];
 assert.equal(academySmokeDeploymentDecision(plan,run,jobs).runSmoke,true);
 for(const conclusion of ['failure','cancelled','skipped',null])assert.throws(()=>academySmokeDeploymentDecision(plan,run,[jobs[0],{...jobs[1],conclusion}]));
 assert.throws(()=>academySmokeDeploymentDecision(plan,run,[jobs[0]]));
 for(const bad of [null,{...plan,head:'a'.repeat(40)},{...plan,deploy:'false'},{...plan,schemaVersion:2}])assert.throws(()=>academySmokeDeploymentDecision(bad,run,jobs));
 assert.throws(()=>academySmokeDeploymentDecision(plan,{...run,conclusion:'failure'},jobs));
 assert.throws(()=>academySmokeDeploymentDecision(plan,run,[{...jobs[0],conclusion:'failure'},jobs[1]]));
});

test('docs-only smoke is skipped only when its exact plan and actual jobs agree',()=>{
 const head='b'.repeat(40),run={head_sha:head,status:'completed',conclusion:'success'},plan={schemaVersion:1,head,deploy:false};
 const jobs=[{name:'plan',status:'completed',conclusion:'success'},{name:'deploy',status:'completed',conclusion:'skipped'}];
 assert.equal(academySmokeDeploymentDecision(plan,run,jobs).runSmoke,false);
 assert.throws(()=>academySmokeDeploymentDecision(plan,run,[jobs[0]]));
 assert.throws(()=>academySmokeDeploymentDecision(plan,run,[jobs[0],{...jobs[1],conclusion:'success'}]));
 assert.throws(()=>academySmokeDeploymentDecision(plan,run,[...jobs,{name:'deploy (platform, apps/platform, apps/platform/dist, schood-platform)',status:'completed',conclusion:'success'}]));
});

test('deployment plan is carried between runs and manual live smoke remains executable',()=>{
 const smoke=fs.readFileSync(path.join(root,'.github/workflows/academy-live-smoke.yml'),'utf8');
 assert.match(pages,/PAGES_PLAN_FILE: \$\{\{ runner\.temp \}\}\/pages-deployment-plan\.json/);
 assert.match(pages,/uses: actions\/upload-artifact@v4[\s\S]*name: pages-deployment-plan[\s\S]*if-no-files-found: error/);
 assert.match(smoke,/uses: actions\/download-artifact@v4[\s\S]*run-id: \$\{\{ github\.event\.workflow_run\.id \}\}/);
 assert.match(smoke,/academySmokeDeploymentDecision/);
 assert.equal((smoke.match(/if: \$\{\{ github\.event_name == 'workflow_dispatch' \|\| steps\.deploygate\.outputs\.run == 'true' \}\}/g)??[]).length,5);
});

test('parallel CI builds each deployed frontend exactly once', () => {
  const expected = [...pages.matchAll(/^\s+workspace: (apps\/\S+)\s*$/gm)].map(match => match[1]).sort();
  const actual = [...job('build').matchAll(/^\s+workspaces: (.+)$/gm)].flatMap(match => match[1].trim().split(/\s+/)).sort();
  assert.equal(expected.length, 18);
  assert.deepEqual(actual, expected);
  assert.match(job('build'), /fail-fast: false/);
  assert.match(job('build'), /max-parallel: 3/);
  assert.match(job('build'), /npm --workspace "\$workspace" run build \|\| exit 1/);
  assert.match(job('build'), /if: matrix\.group == 'platform-academy'\s+run: npm run smoke:academy/);
});

test('security, typecheck and audit gates remain in the checks job', () => {
  const checks = job('checks');
  for (const command of [
    'npm ci', 'npm run verify:prod', "npm run verify:release -- --base origin/${{ github.base_ref || 'main' }}",
    'npm run verify:academy', 'npm --workspace apps/academy run lint',
    'npm run test:guide && npm run check:guide',
    'deno check supabase/functions/hub/index.ts', 'npm run --if-present test:english:mass-readiness',
    'deno check supabase/functions/academy/index.ts', 'npm run test:academy:edge',
    'node scripts/audit-runtime-dependencies.mjs',
  ]) assert(checks.includes(`run: ${command}\n`), `Missing gate: ${command}`);
  assert.match(source, /permissions:\s+contents: read/);
  assert.doesNotMatch(source, /wrangler pages deploy|supabase (?:db push|functions deploy|secrets set)|gh pr merge/);
});

test('isolated contract groups cover every root test alias exactly once', () => {
  const aliases = packageScripts.test.split(' && ').map(command => {
    const match = /^npm run (test:[a-z0-9:-]+)$/.exec(command);
    assert(match, `Unclassified root test command: ${command}`);
    return match[1];
  });
  const groups = [...job('tests').matchAll(/^\s+suites: (.+)$/gm)].map(match => match[1].trim().split(/\s+/));
  assert.equal(groups.length, 4);
  const actual = groups.flat();
  assert.equal(new Set(actual).size, actual.length, 'Repeated test alias');
  assert.deepEqual(actual.sort(), aliases.sort(), 'A root test alias is missing or unclassified');
  for (const alias of actual) assert(packageScripts[alias], `Undefined test alias: ${alias}`);
  assert.match(job('tests'), /fail-fast: false/);
  assert.match(job('tests'), /max-parallel: 4/);
  assert.match(job('tests'), /uses: denoland\/setup-deno@v2/);
  assert.match(job('tests'), /if: matrix\.group != 'payments'\s+run: npx playwright install --with-deps chromium/);
  assert.match(job('tests'), /TEST_SUITES: \$\{\{ matrix\.suites \}\}/);
  assert.match(job('tests'), /npm run "\$suite" \|\| exit 1/);
  assert.doesNotMatch(job('checks'), /run: npm test\n/);
});

test('contract group execution stops at the first failing suite', () => {
  const match = job('tests').match(/        run: \|\n((?:          .*(?:\n|$))+)/);
  assert(match);
  const script = match[1].replace(/^          /gm, '');
  const shell = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : '/bin/bash';
  const aliases = ['test:first', 'test:middle', 'test:last'];
  for (const failed of ['', ...aliases]) {
    const mock = 'npm() { printf "%s\\n" "$2"; [ "$2" != "$FAILED_SUITE" ]; }\n';
    const result = spawnSync(shell, ['-c', mock + script], {env: {...process.env, TEST_SUITES: aliases.join(' '), FAILED_SUITE: failed}, encoding:'utf8'});
    assert.ifError(result.error);
    assert.equal(result.status === 0, failed === '');
    assert.deepEqual(result.stdout.trim().split('\n'), failed ? aliases.slice(0, aliases.indexOf(failed) + 1) : aliases);
  }
});

test('route browser groups remain isolated and retain complete suites', () => {
  const browser = job('browser');
  assert.match(browser, /group: \[academy, guide\]/);
  assert.match(browser, /fail-fast: false/);
  assert.match(browser, /max-parallel: 2/);
  assert.match(browser, /run: npx playwright install --with-deps chromium/);
  assert.match(browser, /if: matrix\.group == 'academy'\s+run: npm run test:academy:routes/);
  assert.match(browser, /if: matrix\.group == 'guide' && hashFiles\('apps\/platform\/tests\/guide\.spec\.ts'\) != ''\s+run: npm run test:guide:browser/);
  assert.doesNotMatch(job('checks'), /run: npm run test:academy:routes|run: npm run test:guide:browser/);
});

test('both release gates run the entire Academy browser suite with bounded parallelism', () => {
  const command = packageScripts['test:academy:routes'];
  assert.equal(command, 'npm --workspace apps/academy run test:routes -- --workers=2 --fully-parallel');
  assert.equal(packageScripts.test.includes('npm run test:academy:routes'), false, 'Browser gate must not run twice inside the unit suite');
  assert.match(job('browser'), /run: npm run test:academy:routes\n/);
  assert.match(pages, /name: Academy mocked route smoke\s+if: \$\{\{ matrix\.label == 'academy' \}\}\s+run: npm run test:academy:routes/);
});

test('Academy readiness rejects filtered suites, command changes and unbounded workers', () => {
  const base = 'npm --workspace apps/academy run test:routes';
  for (const valid of [base, `${base} -- --workers=2 --fully-parallel`, `${base} -- --fully-parallel --workers=1`]) {
    assert.equal(isFullAcademyRouteCommand(valid), true, valid);
  }
  for (const invalid of [undefined, '', 'npm run test', base.replace('apps/academy', 'apps/platform'),
    `${base} -- --grep contacts`, `${base} -- --workers=2 --fully-parallel --grep contacts`,
    `${base} -- --workers=2 --fully-parallel tests/one.spec.ts`, `${base} -- --last-failed`,
    `${base} -- --workers=0 --fully-parallel`, `${base} -- --workers=8 --fully-parallel`,
    `${base} --workers=2 --fully-parallel`, `${base} -- --workers=2 --workers=2`,
    `${base} -- --workers=2 --fully-parallel --list`, `${base} && echo success`]) {
    assert.equal(isFullAcademyRouteCommand(invalid), false, String(invalid));
  }
});

test('validate waits for every group and cannot pass a failed, canceled or skipped dependency', () => {
  const validate = job('validate');
  assert.match(validate, /needs: \[checks, tests, browser, build\]/);
  assert.match(validate, /if: \$\{\{ always\(\) \}\}/);
  assert.match(validate, /CHECKS_RESULT: \$\{\{ needs\.checks\.result \}\}/);
  assert.match(validate, /TESTS_RESULT: \$\{\{ needs\.tests\.result \}\}/);
  assert.match(validate, /BROWSER_RESULT: \$\{\{ needs\.browser\.result \}\}/);
  assert.match(validate, /BUILDS_RESULT: \$\{\{ needs\.build\.result \}\}/);
  const match = validate.match(/        run: \|\n((?:          .*(?:\n|$))+)/);
  assert(match, 'Missing executable aggregate gate');
  const script = match[1].replace(/^          /gm, '');
  const shell = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : '/bin/bash';
  // One shell evaluates all 1,296 dependency combinations without spawning
  // a process for every combination, preserving exhaustive failure coverage.
  const values = 'success failure cancelled skipped timed_out ""';
  const expected = '[ "$CHECKS_RESULT" = success ] && [ "$TESTS_RESULT" = success ] && [ "$BROWSER_RESULT" = success ] && [ "$BUILDS_RESULT" = success ]';
  const harness = `gate() {\n${script}\n}\ncount=0\nfor CHECKS_RESULT in ${values}; do\nfor TESTS_RESULT in ${values}; do\nfor BROWSER_RESULT in ${values}; do\nfor BUILDS_RESULT in ${values}; do\nif gate; then ${expected} || exit 1; else if ${expected}; then exit 1; fi; fi\ncount=$((count+1))\ndone; done; done; done\n[ "$count" = 1296 ]\n`;
  const result = spawnSync(shell, ['-c', harness], {env:process.env, encoding:'utf8'});
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
});
