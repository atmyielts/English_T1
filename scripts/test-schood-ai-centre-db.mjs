// Applies the Schood AI core migrations (20261030100000-199999) and the centre
// migrations (20261030400000-499999) to isolated, throwaway databases (never a
// linked project) and runs the centre integration test:
//   1. PGlite (PostgreSQL 17 in WASM): always.
//   2. A Docker postgres:16 container with no host port: the same test, applying the
//      migrations twice, then real concurrent sessions racing for invite seats,
//      max uses and public counters.
//      Skipped when Docker is not available, unless SCHOOD_AI_DB_REQUIRE_DOCKER=1 (CI).
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const fixture = read('supabase/tests/schood-ai-core.fixture.sql') + '\n' + read('supabase/tests/schood-ai-centre.fixture.sql');
const names = readdirSync(new URL('../supabase/migrations/', import.meta.url)).filter((name) => /^20261030[14]\d{5}_.*\.sql$/.test(name)).sort();
const core = names.filter((name) => name.startsWith('202610301')), centre = names.filter((name) => name.startsWith('202610304'));
assert.ok(centre.length >= 1, 'the centre migration exists');
const migration = names.map((name) => read(`supabase/migrations/${name}`)).join('\n');
const centreOnly = centre.map((name) => read(`supabase/migrations/${name}`)).join('\n');
const integration = read('supabase/tests/schood-ai-centre.integration.sql');

// --- 1. PGlite ---------------------------------------------------------------------
{
  const db = new PGlite();
  try {
    await db.exec(fixture);
    await db.exec(migration);
    await db.exec(migration);
    await db.exec(centreOnly);
    const results = await db.exec(integration);
    assert.equal(results.at(-1).rows[0]?.['?column?'], 'schood ai centre: ok');
    console.log(`PGlite (PostgreSQL 17): ${core.length} core and ${centre.length} centre migrations apply twice; centre creation, invites with seats, places, expiry, revocation and uses, role budgets, member names, public counters, staff links, knowledge search, usage, sealed secrets, homework rules, account closure through auth.users and isolation passed.`);
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
const container = `schood-ai-centre-test-${randomUUID().slice(0, 8)}`;
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
  psql(migration);
  psql(migration);
  assert.match(psql(integration), /schood ai centre: ok/);

  // 12 people race for a centre with 3 teacher seats through one 50-use invite:
  // exactly 3 join, the invite counts 3 uses.
  const people = Array.from({ length: 12 }, (_, i) => `00000000-0000-4000-8000-0000000001${String(i).padStart(2, '0')}`);
  psql(`insert into public.users (id) values ${people.map((id) => `('${id}')`).join(', ')};`);
  const ws = JSON.parse(psql(`select public.ai_centre_create_workspace('Race Centre', '00000000-0000-4000-8000-0000000000c1', null, null, null, 'admin', null, 'pk_race_0123456789abcdefgh');`).trim()).workspace_id;
  psql(`insert into public.ai_workspace_invites (workspace_id, role, code_hash, max_uses, expires_at) values ('${ws}', 'teacher', '${'9'.repeat(64)}', 50, now() + interval '1 day');`);
  const joins = await race(12, (i) => `begin; select (public.ai_centre_accept_invite('${'9'.repeat(64)}', '${people[i]}', 3, 100, '{}'))->>'ok'; select pg_sleep(0.1); commit;`);
  assert.equal(joins.filter((line) => line.split('\n').includes('true')).length, 3, 'three seats, three teachers');
  assert.equal(psql(`select count(*) from public.ai_workspace_members where workspace_id = '${ws}' and role = 'teacher';`).trim(), '3');
  assert.equal(psql(`select uses from public.ai_workspace_invites where code_hash = '${'9'.repeat(64)}';`).trim(), '3', 'uses match the joins');

  // A 4-use student invite raced by 12 people admits exactly 4.
  psql(`insert into public.ai_workspace_invites (workspace_id, role, code_hash, max_uses, expires_at) values ('${ws}', 'student', '${'8'.repeat(64)}', 4, now() + interval '1 day');`);
  const students = await race(12, (i) => `select (public.ai_centre_accept_invite('${'8'.repeat(64)}', '${people[i]}', 3, 100, '{}'))->>'already';`);
  assert.equal(psql(`select uses from public.ai_workspace_invites where code_hash = '${'8'.repeat(64)}';`).trim(), '4', 'max uses holds under contention');
  assert.ok(students.length === 12);

  // 30 widget requests race for a daily cap of 10 new conversations: exactly 10 pass.
  const takes = await race(30, () => `select public.ai_centre_take_public('${ws}', 'new_threads', '2027-01-01', 10);`);
  assert.equal(takes.filter((line) => line === 't').length, 10, 'public cap is exact under contention');
  assert.equal(psql(`select count from public.ai_centre_public_limits where workspace_id = '${ws}' and bucket = 'new_threads';`).trim(), '10');

  console.log('Postgres 16 (Docker): migrations apply twice; centre integration passed; 12 people racing for 3 teacher seats left exactly 3 teachers, a 4-use invite admitted 4 of 12, and a 10-conversation cap admitted exactly 10 of 30.');
} finally {
  spawnSync('docker', ['rm', '--force', container]);
}
