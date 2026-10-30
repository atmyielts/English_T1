// Applies the Schood AI teacher migration (on top of the core one) to isolated,
// throwaway databases (never a linked project) and runs its integration test:
//   1. PGlite (PostgreSQL 17 in WASM): always.
//   2. A Docker postgres:16 container with no host port: the same test, applying the
//      migration twice, then real concurrent sessions racing for quiz answers,
//      ratings, copies and verified use. Skipped when Docker is not available,
//      unless SCHOOD_AI_DB_REQUIRE_DOCKER=1 (CI). Same pattern as test-schood-ai-db.mjs.
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const fixture = read('supabase/tests/schood-ai-core.fixture.sql');
// Every core migration first (20261030100000-199999, in order), as the core test applies them.
const core = readdirSync(new URL('../supabase/migrations/', import.meta.url))
  .filter((name) => /^202610301\d{5}_.*\.sql$/.test(name)).sort()
  .map((name) => read(`supabase/migrations/${name}`)).join('\n');
const migration = read('supabase/migrations/20261030300000_schood_ai_teacher.sql');
const integration = read('supabase/tests/schood-ai-teacher.integration.sql');
// pg_cron is not in these databases. A stand-in cron schema (the same calls the
// migration makes) shows the channel autopilot is scheduled once, however often the
// migration runs, and calls core's system invoker with the teacher route.
const cronStub = `
create schema if not exists cron;
create table if not exists cron.job (jobid bigserial primary key, jobname text not null, schedule text not null, command text not null);
create or replace function cron.schedule(p_name text, p_schedule text, p_command text) returns bigint language sql as
  'insert into cron.job (jobname, schedule, command) values (p_name, p_schedule, p_command) returning jobid';
create or replace function cron.unschedule(p_job bigint) returns boolean language sql as 'delete from cron.job where jobid = p_job returning true';
`;
const scheduled = `select count(*)::text || '|' || min(schedule) || '|' || (min(command) like '%invoke_schood_ai_system(''teacher/system-channel-dispatch''%')::text
  from cron.job where jobname = 'schood-ai-teacher-channel-dispatch-v1';`;
const EXPECTED_SCHEDULE = '1|4-59/5 * * * *|true';

// --- 1. PGlite ---------------------------------------------------------------------
{
  const db = new PGlite();
  try {
    await db.exec(fixture);
    await db.exec(core);
    await db.exec(migration);
    await db.exec(migration);
    const results = await db.exec(integration);
    assert.equal(results.at(-1).rows[0]?.['?column?'], 'schood ai teacher: ok');
    await db.exec(cronStub);
    await db.exec(migration);
    await db.exec(migration);
    const job = await db.query(scheduled);
    assert.equal(Object.values(job.rows[0])[0], EXPECTED_SCHEDULE, 'the channel autopilot is scheduled once');
    console.log('PGlite (PostgreSQL 17): teacher migration applies twice; quiz codes, nicknames and one answer per question, channel ids, ratings, copies, verified use, the append-only ledger, account closure through auth.users, the channel schedule and isolation passed.');
  } finally {
    await db.close();
  }
}

// --- 2. Docker Postgres ------------------------------------------------------------
const dockerReady = spawnSync('docker', ['info'], { encoding: 'utf8', timeout: 20000 }).status === 0;
if (!dockerReady) {
  if (process.env.SCHOOD_AI_DB_REQUIRE_DOCKER === '1') throw new Error('Docker is required for the concurrency test');
  console.log('Docker unavailable: skipped the real-Postgres concurrency test.');
  process.exit(0);
}
const container = `schood-ai-teacher-test-${randomUUID().slice(0, 8)}`;
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
  psql(migration);
  psql(migration);
  assert.match(psql(integration), /schood ai teacher: ok/);
  psql(cronStub);
  psql(migration);
  psql(migration);
  assert.equal(psql(scheduled).trim(), EXPECTED_SCHEDULE, 'the channel autopilot is scheduled once');

  const teacher = '00000000-0000-4000-8000-0000000000a1', buyer = '00000000-0000-4000-8000-0000000000a2', student = '00000000-0000-4000-8000-0000000000a3';
  const ws = psql(`select id from public.ai_ensure_personal_workspace('${teacher}', 'Race teacher');`).trim();
  const buyerWs = psql(`select id from public.ai_ensure_personal_workspace('${buyer}', 'Race buyer');`).trim();
  const gen = psql(`insert into public.ai_pages (workspace_id, owner_id, kind, title, status) values ('${ws}', '${teacher}', 'live_quiz', 'Race', 'approved') returning id;`).trim().split('\n')[0];
  const quiz = psql(`insert into public.ai_teacher_quiz_sessions (workspace_id, host_id, page_id, title, code, questions) values ('${ws}', '${teacher}', '${gen}', 'Race', '100200', '[{"id":"q1"}]') returning id;`).trim().split('\n')[0];
  const player = psql(`insert into public.ai_teacher_quiz_players (session_id, user_id, nickname, token_hash) values ('${quiz}', '${student}', 'Racer', repeat('d', 64)) returning id;`).trim().split('\n')[0];

  // 12 taps on the same question from one phone at once: one answer, points once.
  const taps = await race(12, (i) => `select public.ai_teacher_quiz_answer('${quiz}', '${player}', 0, '${i % 2 ? 'A' : 'B'}', ${i % 2 === 1}, ${i % 2 ? 800 : 0});`);
  assert.equal(taps.filter((line) => line === 't').length, 1, 'one answer per question under contention');
  assert.equal(psql(`select answered from public.ai_teacher_quiz_players where id = '${player}';`).trim(), '1');
  const score = Number(psql(`select score from public.ai_teacher_quiz_players where id = '${player}';`).trim());
  const stored = Number(psql(`select points from public.ai_teacher_quiz_answers where player_id = '${player}' and question_index = 0;`).trim());
  assert.equal(score, stored, 'the score is exactly the one stored answer');

  // 10 sessions copy the same listing into the same workspace: one copy.
  const listing = psql(`insert into public.ai_teacher_listings (seller_workspace_id, seller_id, seller_name, title, kind, level, language, material, status) values ('${ws}', '${teacher}', 'T', 'Race listing', 'quiz', 'B1', 'en', '{}', 'published') returning id;`).trim().split('\n')[0];
  const copyGen = psql(`insert into public.ai_pages (workspace_id, owner_id, kind, title, status) values ('${buyerWs}', '${buyer}', 'live_quiz', 'Race copy', 'approved') returning id;`).trim().split('\n')[0];
  await race(10, () => `select public.ai_teacher_add_copy('${listing}', '${buyerWs}', '${buyer}', '${copyGen}', 0);`);
  assert.equal(psql(`select copies from public.ai_teacher_listings where id = '${listing}';`).trim(), '1', 'one copy per workspace under contention');

  // 10 sessions record the same use, 10 more a second kind: usage counts the workspace once.
  await race(20, (i) => `select public.ai_teacher_record_use('${listing}', '${buyerWs}', '${i % 2 ? 'live_quiz' : 'print'}');`);
  assert.equal(psql(`select usage_count from public.ai_teacher_listings where id = '${listing}';`).trim(), '1', 'distinct workspaces under contention');
  assert.equal(psql(`select count(*) from public.ai_teacher_listing_uses where listing_id = '${listing}';`).trim(), '2');

  // 3 people rate 8 times each at once: one rating each, totals exact.
  const raters = [teacher, buyer, student];
  await race(24, (i) => `select public.ai_teacher_rate_listing('${listing}', '${raters[i % 3]}', ${1 + (i % 5)}, null);`);
  const [sum, count] = psql(`select rating_sum, rating_count from public.ai_teacher_listings where id = '${listing}';`).trim().split('|').map(Number);
  assert.equal(count, 3, 'one rating per person');
  assert.equal(String(sum), psql(`select sum(stars) from public.ai_teacher_listing_ratings where listing_id = '${listing}';`).trim(), 'the sum matches the ratings');

  console.log('Postgres 16 (Docker): teacher migration applies twice; integration and the channel schedule passed; 12 racing taps kept one answer and its points, 10 racing copies made one, 20 racing uses counted one workspace, 24 racing ratings kept one per person with an exact sum.');
} finally {
  spawnSync('docker', ['rm', '--force', container]);
}
