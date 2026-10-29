// Applies the Schood AI engage migration (on top of the core one) to isolated,
// throwaway databases (never a linked project) and runs its integration test:
//   1. PGlite (PostgreSQL 17 in WASM): always.
//   2. A Docker postgres:16 container with no host port: the same test, applying both
//      migrations twice, then real concurrent sessions racing on XP, leagues, squads,
//      freezes, bonuses, journey chapters, the outbox and the due-people scan.
//      Skipped when Docker is not available, unless SCHOOD_AI_DB_REQUIRE_DOCKER=1 (CI).
// Same pattern as scripts/test-schood-ai-db.mjs.
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const coreFixture = read('supabase/tests/schood-ai-core.fixture.sql');
const engageFixture = read('supabase/tests/schood-ai-engage.fixture.sql');
// Every core migration (20261030100000-199999) in order, then engage's.
const core = readdirSync(new URL('../supabase/migrations/', import.meta.url))
  .filter((name) => /^202610301\d{5}_.*\.sql$/.test(name)).sort()
  .map((name) => read(`supabase/migrations/${name}`)).join('\n');
const migration = read('supabase/migrations/20261030800000_schood_ai_engage.sql');
const integration = read('supabase/tests/schood-ai-engage.integration.sql');

// --- 1. PGlite ---------------------------------------------------------------------
{
  const db = new PGlite();
  try {
    await db.exec(coreFixture);
    await db.exec(core);
    await db.exec(engageFixture);
    await db.exec(migration);
    await db.exec(migration);
    const results = await db.exec(integration).catch((cause) => { throw new Error(`${cause.message} (${cause.where ?? 'no location'})`); });
    assert.equal(results.at(-1).rows[0]?.['?column?'], 'schood ai engage: ok');
    console.log('PGlite (PostgreSQL 17): engage migration applies twice; XP rule, verified-only ingest, daily cap, local days, bonuses, freezes, league groups and settling, journeys, squads, outbox, due people, boards, append-only rows, the erasure registry, account closure through auth.users with the engage hook, account deletion and isolation passed.');
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
const container = `schood-ai-engage-test-${randomUUID().slice(0, 8)}`;
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
const user = (n) => `00000000-0000-4000-8000-${String(100 + n).padStart(12, '0')}`;

try {
  docker(['run', '--detach', '--rm', '--name', container, '--env', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:16-alpine']);
  let ready = false;
  for (let i = 0; i < 60 && !ready; i++) {
    ready = spawnSync('docker', ['exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres']).status === 0;
    if (!ready) await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error('Isolated database did not become ready');
  psql(coreFixture);
  psql(core);
  psql(core);
  psql(engageFixture);
  psql(migration);
  psql(migration);
  assert.match(psql(integration), /schood ai engage: ok/);

  // XP: 10 sessions ingest the same person's 50 verified (and 20 unverified) events at once.
  const p = user(40);
  psql(`insert into public.ai_learning_events (user_id, area, kind, verified, feature, verified_minutes, created_at)
          select '${p}', 'coach', 'turn_scored', true, 'B1', 1, '2026-11-02T06:00:00Z' from generate_series(1, 50);
        insert into public.ai_learning_events (user_id, area, kind, verified, feature, verified_minutes, created_at)
          select '${p}', 'coach', 'lesson_viewed', false, 'B1', 0, '2026-11-02T06:00:00Z' from generate_series(1, 20);`);
  await race(10, () => `begin; select public.ai_engage_ingest('${p}', '2026-11-02T07:00:00Z'); select pg_sleep(0.05); commit;`);
  assert.equal(psql(`select count(*) from public.ai_engage_xp where user_id = '${p}' and source = 'event';`).trim(), '50', 'each verified event once');
  assert.equal(psql(`select xp from public.ai_engage_days where user_id = '${p}';`).trim(), '350', 'the day adds up (50 x 7)');
  assert.equal(psql(`select events from public.ai_engage_days where user_id = '${p}';`).trim(), '50');

  // Leagues: 40 people join the same week, tier and band at once: groups of 30 and 10.
  await race(40, (i) => `select public.ai_engage_league_join('${user(i + 1)}', '2026-11-09', 'silver', 'core');`);
  assert.equal(psql(`select string_agg(c::text, ',' order by c desc) from (select count(*) c from public.ai_engage_league_members where week_start = '2026-11-09' and tier = 'silver' group by group_id) x;`).trim(), '30,10', 'never more than 30 in a group');

  // Settling the same group from 6 sessions: once.
  const group = psql(`select group_id from public.ai_engage_league_members where week_start = '2026-11-09' limit 1;`).trim();
  const settled = await race(6, () => `select public.ai_engage_league_settle('${group}', '[]'::jsonb);`);
  assert.equal(settled.filter((line) => line === 't').length, 1, 'settled once');

  // Squads: 8 people race for the 4 free places of a squad of 5.
  const squad = psql(`select public.ai_engage_squad_create('Racers', '${user(50)}', 'RACERSAB', 100, null);`).trim();
  const joins = await race(8, (i) => `select public.ai_engage_squad_join('${squad}', '${user(51 + i)}', 5, null);`);
  assert.equal(joins.filter((line) => line === 'ok').length, 4, 'four of eight');
  assert.equal(psql(`select count(*) from public.ai_engage_squad_members where squad_id = '${squad}' and left_at is null;`).trim(), '5');

  // Freezes: 6 sessions try to reserve this week's freeze with different references: one.
  await race(6, (i) => `select public.ai_engage_freeze_reserve('${p}', '2026-11-02', '2026-11-02', 'engage.freeze:race-${i}', 10);`);
  assert.equal(psql(`select count(*) from public.ai_engage_freeze_buys where user_id = '${p}';`).trim(), '1', 'one freeze a week');

  // Quest bonuses: the same key from 6 sessions: one row.
  await race(6, () => `select public.ai_engage_award_bonus('${p}', 'quest', '2026-11-02:all', 20, '2026-11-02', '2026-11-02');`);
  assert.equal(psql(`select count(*) from public.ai_engage_xp where user_id = '${p}' and source = 'quest';`).trim(), '1', 'one bonus');

  // Journey chapters: 4 sessions close chapter 1 at once: one wins.
  const journey = psql(`insert into public.ai_engage_journeys (user_id, journey_key, started_on) values ('${p}', 'sales_90', '2026-11-02') returning id;`).trim().split('\n')[0];
  const closes = await race(4, (i) => `select (public.ai_engage_journey_advance('${journey}', 0, '[{"chapter":1,"at":"2026-11-02T10:00:0${i}Z"}]', null, null)).id is not null;`);
  assert.equal(closes.filter((line) => line === 't').length, 1, 'a chapter closes once');

  // The outbox: 5 bots claim the same person's 6 due messages at once: each delivered once.
  psql(`insert into public.ai_engage_outbox (user_id, channel, kind, priority, dedupe_key, payload, due_at, expires_at)
          select '${p}', 'telegram', 'streak_risk', 50, 'race-' || n, '{"text":"x"}', '2026-11-02T06:00:00Z', '2026-11-02T20:00:00Z' from generate_series(1, 6) n;`);
  const claimed = await race(5, () => `select count(*) from public.ai_engage_outbox_claim('${p}', 'telegram', '2026-11-02T14:00:00Z', 10);`);
  assert.equal(claimed.reduce((sum, line) => sum + Number(line), 0), 6, 'six messages, claimed once in total');

  // Who is due: 5 bot crons scan at once: every linked person once.
  psql(`update public.users set telegram_chat_id = '9' || substr(id::text, 25) where id::text like '00000000-0000-4000-8000-0000000001%';
        insert into public.ai_engage_profiles (user_id) select id from public.users where telegram_chat_id is not null on conflict do nothing;`);
  const linked = Number(psql(`select count(*) from public.ai_engage_profiles p join public.users u on u.id = p.user_id where u.telegram_chat_id is not null and p.messages <> 'none';`).trim());
  const scans = await race(5, () => `select count(*) from public.ai_engage_due_users('2026-11-10T15:00:00Z', 1000);`);
  assert.equal(scans.reduce((sum, line) => sum + Number(line), 0), linked, 'each person planned once a day');

  // The catch-up run counts people with uncounted events.
  psql(`insert into public.ai_learning_events (user_id, area, kind, verified, feature, verified_minutes) values ('${user(45)}', 'coach', 'check_passed', true, 'B4', 2);`);
  assert.ok(Number(psql(`select public.ai_engage_ingest_pending(100);`).trim()) >= 1, 'pending people counted');
  assert.equal(psql(`select count(*) from public.ai_engage_xp where user_id = '${user(45)}';`).trim(), '1');

  console.log('Postgres 16 (Docker): both migrations apply twice; integration passed; 10 racing ingests counted 50 events once, 40 racing joins filled groups of 30 and 10, a group settled once from 6 sessions, 8 racers got the 4 free squad places, one freeze a week from 6 sessions, one bonus from 6, a chapter closed once from 4, 5 bots claimed 6 messages once, 5 crons planned each person once, and the catch-up run counted pending people.');
} finally {
  spawnSync('docker', ['rm', '--force', container]);
}
