// Applies the Schood AI core migrations and the learner migration
// (20261030200000-299999) to isolated, throwaway databases (never a linked
// project) and runs the learner integration test, like test-schood-ai-db.mjs:
//   1. PGlite (PostgreSQL 17 in WASM): always; the learner migration applied twice.
//   2. A Docker postgres:16 container with no host port: the same, then real
//      concurrent sessions racing to invite and accept into one family.
//      Skipped when Docker is not available, unless SCHOOD_AI_DB_REQUIRE_DOCKER=1 (CI).
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const names = readdirSync(new URL('../supabase/migrations/', import.meta.url));
const core = names.filter((name) => /^202610301\d{5}_.*\.sql$/.test(name)).sort().map((name) => read(`supabase/migrations/${name}`)).join('\n');
const learnerNames = names.filter((name) => /^202610302\d{5}_schood_ai_.*\.sql$/.test(name)).sort();
const learner = learnerNames.map((name) => read(`supabase/migrations/${name}`)).join('\n');
const fixture = read('supabase/tests/schood-ai-core.fixture.sql');
const integration = read('supabase/tests/schood-ai-learner.integration.sql');
const OK = 'schood ai learner: ok';

// --- 1. PGlite ---------------------------------------------------------------------
{
  const db = new PGlite();
  try {
    await db.exec(fixture);
    await db.exec(core);
    await db.exec(learner);
    await db.exec(learner);
    const results = await db.exec(integration);
    assert.equal(results.at(-1).rows[0]?.['?column?'], OK);
    console.log(`PGlite (PostgreSQL 17): ${learnerNames.length} learner migration(s) apply twice; RLS and grants, family limits and invites, quiet-hour schedules, daily records, bounded summaries, 180-day retention, the erasure registry and hook (an account closed through auth.users) and account deletion passed.`);
  } finally {
    await db.close();
  }
}

// --- 2. Docker Postgres ------------------------------------------------------------
const dockerReady = spawnSync('docker', ['info'], { encoding: 'utf8', timeout: 20000 }).status === 0;
if (!dockerReady) {
  if (process.env.SCHOOD_AI_DB_REQUIRE_DOCKER === '1') throw new Error('Docker is required for the concurrency test');
  console.log('Docker unavailable: skipped the real-Postgres test.');
  process.exit(0);
}
const container = `schood-ai-learner-test-${randomUUID().slice(0, 8)}`;
function docker(args, input) {
  const result = spawnSync('docker', args, { input, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 180000 });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || String(result.error));
  return result.stdout;
}
const psql = (sql) => docker(['exec', '-i', container, 'psql', '-U', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1'], sql);
const session = (sql) => new Promise((resolve, reject) => {
  const child = spawn('docker', ['exec', '-i', container, 'psql', '-U', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1']);
  let out = '', err = '';
  child.stdout.on('data', (chunk) => { out += chunk; });
  child.stderr.on('data', (chunk) => { err += chunk; });
  child.on('close', (code) => (code === 0 ? resolve(out.trim()) : reject(new Error(err || `psql exited ${code}`))));
  child.stdin.end(sql);
});
const race = (count, sql) => Promise.all(Array.from({ length: count }, (_, index) => session(sql(index))));

try {
  docker(['run', '--detach', '--rm', '--name', container, '--env', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:16-alpine']);
  let ready = false;
  for (let i = 0; i < 60 && !ready; i++) {
    ready = spawnSync('docker', ['exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres']).status === 0;
    if (!ready) await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error('Isolated database did not become ready');
  psql(fixture);
  psql(core);
  psql(learner);
  psql(learner);
  assert.match(psql(integration), new RegExp(OK));

  // 10 sessions invite into one family at once: exactly 3 open invites win.
  const parent = '00000000-0000-4000-8000-0000000000c1';
  psql(`insert into public.users (id) values ('${parent}') on conflict do nothing;`);
  for (let i = 0; i < 8; i++) psql(`insert into public.users (id) values ('00000000-0000-4000-8000-0000000000d${i}') on conflict do nothing;`);
  const ws = psql(`select id from public.ai_ensure_personal_workspace('${parent}', 'Race family');`).trim();
  const hash = (i) => i.toString(16).padStart(64, '0');
  const invites = await race(10, (i) => `begin; select (public.ai_learner_family_invite('${ws}', '${parent}', 'Child ${i}', '${hash(100 + i)}', 'H${i}', now() + interval '7 days', 'v1', now(), 3))->>'ok'; select pg_sleep(0.1); commit;`);
  assert.equal(invites.filter((line) => line.split('\n').includes('true')).length, 3, 'three open invites at most');
  // The 3 winning codes accepted by 8 racing children: each code once, 3 links.
  const codes = psql(`select invite_hash from public.ai_learner_family_links where workspace_id = '${ws}' and status = 'invited';`).trim().split('\n');
  const accepts = await race(8, (i) => `select (public.ai_learner_family_accept('${codes[i % codes.length]}', '00000000-0000-4000-8000-0000000000d${i}', now(), 3))->>'ok';`);
  assert.equal(accepts.filter((line) => line === 'true').length, 3, 'each code is used once');
  assert.equal(psql(`select count(*) from public.ai_learner_family_links where workspace_id = '${ws}' and status = 'active';`).trim(), '3');
  console.log('Postgres 16 (Docker): learner migration applies twice; integration passed; 10 racing invites opened exactly 3, and 8 racing accepts used each of the 3 codes once.');
} finally {
  spawnSync('docker', ['rm', '--force', container]);
}
