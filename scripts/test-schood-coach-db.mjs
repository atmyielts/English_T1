// Applies the Schood AI core migrations and the coach migrations (the engine's
// 20261030600000–699999 and the coach packs' 20261030700000–799999) to isolated,
// throwaway databases (never a linked project), twice, and runs the coach integration
// tests:
//   1. PGlite (PostgreSQL 17 in WASM): always.
//   2. A Docker postgres:16 container with no host port: the same test, then real
//      concurrent cron runs claiming the same due reminders and racing team joins.
//      Skipped without Docker unless SCHOOD_COACH_DB_REQUIRE_DOCKER=1 (CI).
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
// The core fixture plus the column the coach claim reads (users.telegram_chat_id, set by telegram-link).
const fixture = `${read('supabase/tests/schood-ai-core.fixture.sql')}\nalter table public.users add column if not exists telegram_chat_id text;\n`;
const all = readdirSync(new URL('../supabase/migrations/', import.meta.url)).sort();
const core = all.filter((name) => /^202610301\d{5}_.*\.sql$/.test(name)).map((name) => read(`supabase/migrations/${name}`)).join('\n');
const coachFiles = all.filter((name) => /^20261030[67]\d{5}_.*\.sql$/.test(name));
const coach = coachFiles.map((name) => read(`supabase/migrations/${name}`)).join('\n');
const integration = read('supabase/tests/schood-coach.integration.sql');
// The coach packs' additions (saved scripts, the anonymous cohort histogram), after the engine's own test.
const packsIntegration = read('supabase/tests/schood-coach-packs.integration.sql');
assert.ok(coachFiles.length >= 1, 'the coach migration is present');

// --- 1. PGlite ---------------------------------------------------------------------
{
  const db = new PGlite();
  try {
    await db.exec(fixture);
    await db.exec(core);
    await db.exec(coach);
    await db.exec(coach);
    const results = await db.exec(integration);
    assert.equal(results.at(-1).rows[0]?.['?column?'], 'schood coach: ok');
    const packs = await db.exec(packsIntegration);
    assert.equal(packs.at(-1).rows[0]?.['?column?'], 'schood coach packs: ok');
    console.log(`PGlite (PostgreSQL 17): ${coachFiles.length} coach migration(s) apply twice after the core; RLS and grants, enrolment state and revisions, turns and clip references, evidence-bearing scores, retention, certificates, leased reminder claims, team seats, the erasure registry and account closure through auth.users passed; saved scripts and the anonymous cohort histogram passed.`);
  } finally {
    await db.close();
  }
}

// --- 2. Docker Postgres ------------------------------------------------------------
const dockerReady = spawnSync('docker', ['info'], { encoding: 'utf8', timeout: 20000 }).status === 0;
if (!dockerReady) {
  if (process.env.SCHOOD_COACH_DB_REQUIRE_DOCKER === '1') throw new Error('Docker is required for the concurrency test');
  console.log('Docker unavailable: skipped the real-Postgres concurrency test.');
  process.exit(0);
}
const container = `schood-coach-test-${randomUUID().slice(0, 8)}`;
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
  psql(coach);
  psql(coach);
  assert.match(psql(integration), /schood coach: ok/);
  assert.match(psql(packsIntegration), /schood coach packs: ok/);

  // Thirty due reminders, eight cron runs at once: every reminder is claimed exactly once.
  const users = Array.from({ length: 30 }, (_, i) => `00000000-0000-4000-8000-${String(1000 + i).padStart(12, '0')}`);
  psql(users.map((id, i) => `insert into public.users (id, telegram_chat_id) values ('${id}', '${800000 + i}');`).join('\n'));
  psql(users.map((id) => `with ws as (select id from public.ai_ensure_personal_workspace('${id}', 'R')), e as (
    insert into public.coach_enrollments (user_id, workspace_id, pack, pack_version) select '${id}', ws.id, 'speaking', '1.0.0' from ws returning id)
    insert into public.coach_schedules (enrollment_id, user_id, pack, kind, local_time, next_at) select e.id, '${id}', 'speaking', 'daily', '09:00', now() - interval '1 minute' from e;`).join('\n'));
  const runs = await race(8, () => `select schedule_id from public.coach_claim_due(now(), 10, 120);`);
  const claimed = runs.flatMap((out) => out.split('\n').filter(Boolean));
  assert.equal(claimed.length, 30, `all 30 reminders claimed, got ${claimed.length}`);
  assert.equal(new Set(claimed).size, 30, 'no reminder claimed twice');

  // Twelve people race for the last three seats of a five-seat team.
  const team = psql(`insert into public.coach_teams (name, packs, seats, valid_until) values ('Race team', array['speaking'], 5, now() + interval '30 days') returning id;`).trim().split('\n')[0];
  psql(`insert into public.coach_team_invites (code, team_id, expires_at, max_uses) values ('RACECODE01', '${team}', now() + interval '1 day', 100);
    insert into public.coach_team_members (team_id, user_id, role) values ('${team}', '${users[0]}', 'manager'), ('${team}', '${users[1]}', 'member');`);
  const joins = await race(12, (i) => `do $$ begin perform public.coach_team_join('RACECODE01', '${users[10 + i]}'); raise notice 'joined'; exception when others then raise notice 'refused %', sqlerrm; end $$; select count(*) from public.coach_team_members where team_id = '${team}' and status = 'active';`);
  assert.ok(joins.length === 12);
  assert.equal(psql(`select count(*) from public.coach_team_members where team_id = '${team}' and status = 'active';`).trim(), '5', 'exactly five seats taken');

  console.log(`Postgres 16 (Docker): ${coachFiles.length} coach migration(s) apply twice after the core; integration passed; 8 racing cron runs claimed 30 reminders exactly once; 12 people racing for 3 seats left exactly 5 members.`);
} finally {
  spawnSync('docker', ['rm', '--force', container], { encoding: 'utf8', timeout: 60000 });
}
