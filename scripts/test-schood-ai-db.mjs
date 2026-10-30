// Applies the Schood AI core migrations (20261030100000-199999, in order) to isolated,
// throwaway databases (never a linked project) and runs their integration tests:
//   1. PGlite (PostgreSQL 17 in WASM): always.
//   2. A Docker postgres:16 container with no host port: the same test, applying the
//      migrations twice, then real concurrent sessions racing for credits, caps and page saves.
//      Skipped when Docker is not available, unless SCHOOD_AI_DB_REQUIRE_DOCKER=1 (CI).
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const fixture = read('supabase/tests/schood-ai-core.fixture.sql');
const migrations = readdirSync(new URL('../supabase/migrations/', import.meta.url))
  .filter((name) => /^202610301\d{5}_.*\.sql$/.test(name)).sort();
const migration = migrations.map((name) => read(`supabase/migrations/${name}`)).join('\n');
const integration = ['schood-ai-core', 'schood-ai-library', 'schood-ai-polish', 'schood-ai-erasure', 'schood-ai-callers', 'schood-ai-scheduler'].map((name) => read(`supabase/tests/${name}.integration.sql`)).join('\n');
const OK = ['schood ai core: ok', 'schood ai library: ok', 'schood ai polish: ok', 'schood ai erasure: ok', 'schood ai callers: ok', 'schood ai scheduler: ok'];

// --- 1. PGlite ---------------------------------------------------------------------
{
  const db = new PGlite();
  try {
    await db.exec(fixture);
    await db.exec(migration);
    await db.exec(migration);
    const results = await db.exec(integration);
    assert.deepEqual(results.map((result) => result.rows[0]?.['?column?']).filter((value) => typeof value === 'string' && value.startsWith('schood ai')), OK);
    console.log(`PGlite (PostgreSQL 17): ${migrations.length} migrations apply twice; workspaces, credit cycles, charges, refunds, budgets, caps, ledger, learning events, notification budget, library saves and versions, specialist overrides, 180-day chat retention, the erasure registry, account closure through auth.users, workspace-paid charges, rate limits, notification preferences, scheduled job claims and retries, and isolation passed.`);
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
const container = `schood-ai-test-${randomUUID().slice(0, 8)}`;
function docker(args, input) {
  const result = spawnSync('docker', args, { input, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 180000 });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || String(result.error));
  return result.stdout;
}
const psql = (sql) => docker(['exec', '-i', container, 'psql', '-U', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1'], sql);
// One separate session per call, started together, so they truly race.
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
  const output = psql(integration);
  for (const line of OK) assert.ok(output.includes(line), line);

  // Concurrency: 20 sessions each hold a 3-credit charge open for 150 ms against a
  // 50-credit pack. Exactly 16 may succeed and the balance must end at 2.
  const ws = psql(`select id from public.ai_ensure_personal_workspace('00000000-0000-4000-8000-0000000000a4', 'Race');`).trim();
  psql(`select public.ai_credit_grant('${ws}', 50, 'pack', 'race-pack');`);
  const charges = await race(20, (i) => `begin; select (public.ai_credit_charge('${ws}', '00000000-0000-4000-8000-0000000000a4', 3, 'tutor.reply', 'race-${i}', 0, null))->>'ok'; select pg_sleep(0.15); commit;`);
  const wins = charges.filter((line) => line.split('\n').includes('true')).length;
  assert.equal(wins, 16, `16 of 20 charges fit in 50 credits, got ${wins}`);
  assert.equal(psql(`select pack_balance from public.ai_credit_accounts where workspace_id = '${ws}';`).trim(), '2');
  assert.equal(psql(`select sum(delta) from public.ai_credit_ledger where workspace_id = '${ws}' and bucket = 'pack';`).trim(), '2', 'ledger matches the balance');

  // The same request key sent by 8 sessions at once is charged once.
  psql(`select public.ai_credit_grant('${ws}', 30, 'pack', 'race-pack-2');`);
  await race(8, () => `select public.ai_credit_charge('${ws}', '00000000-0000-4000-8000-0000000000a4', 5, 'tutor.reply', 'same-key', 0, null);`);
  assert.equal(psql(`select count(*) from public.ai_credit_ledger where workspace_id = '${ws}' and reference = 'same-key';`).trim(), '1', 'one charge per request key');
  assert.equal(psql(`select pack_balance from public.ai_credit_accounts where workspace_id = '${ws}';`).trim(), '27');

  // Refunding the same charge from 6 sessions at once refunds it once.
  const charge = psql(`select ledger.charge_id from public.ai_credit_ledger ledger where reference = 'same-key';`).trim();
  await race(6, () => `select public.ai_credit_refund('${charge}');`);
  assert.equal(psql(`select pack_balance from public.ai_credit_accounts where workspace_id = '${ws}';`).trim(), '32');

  // 30 sessions race for a global cap of 12 calls: exactly 12 get through.
  const takes = await race(30, () => `select (public.ai_take_call('2027-01-01', null, null, 12, 100, 100))->>'ok';`);
  assert.equal(takes.filter((line) => line === 'true').length, 12, 'cap is exact under contention');
  assert.equal(psql(`select calls from public.ai_usage_daily where day = '2027-01-01' and scope = 'global';`).trim(), '12');

  // Plan grants under contention: 10 sessions open the first cycle together; one grant.
  const planWs = psql(`select id from public.ai_ensure_personal_workspace('00000000-0000-4000-8000-0000000000a1', 'Plan race');`).trim();
  await race(10, (i) => `select public.ai_credit_charge('${planWs}', '00000000-0000-4000-8000-0000000000a1', 1, 'tutor.reply', 'grant-race-${i}', 1500, null);`);
  assert.equal(psql(`select count(*) from public.ai_credit_ledger where workspace_id = '${planWs}' and kind = 'grant';`).trim(), '1', 'one grant per cycle');
  assert.equal(psql(`select plan_balance from public.ai_credit_accounts where workspace_id = '${planWs}';`).trim(), '1490');

  // Ten tabs save the same page from revision 1 at once: exactly one wins, the rest are conflicts.
  const pageId = psql(`insert into public.ai_pages (workspace_id, owner_id, kind, title, updated_by) values ('${planWs}', '00000000-0000-4000-8000-0000000000a1', 'note', 'Race', '00000000-0000-4000-8000-0000000000a1') returning id;`).trim().split('\n')[0];
  const saves = await race(10, (i) => `select public.ai_page_save('${pageId}', 1, '{"body": "tab ${i}"}', '00000000-0000-4000-8000-0000000000a1', false, now())->>'ok';`);
  assert.equal(saves.filter((line) => line === 'true').length, 1, 'one save wins');
  assert.equal(psql(`select revision from public.ai_pages where id = '${pageId}';`).trim(), '2');
  assert.equal(psql(`select count(*) from public.ai_page_revisions where page_id = '${pageId}';`).trim(), '1', 'one version for one save');

  // 20 sessions race for 5 slots of one anonymous window: exactly 5 get in.
  const slots = await race(20, () => `select (public.ai_rate_take('anon:race:203', 5, 60, '2027-01-01T00:00:10Z'))->>'ok';`);
  assert.equal(slots.filter((line) => line === 'true').length, 5, 'rate limits are exact under contention');

  // Two pg_cron ticks overlap: 10 sessions claim one job for one period, exactly 1 runs it.
  const claims = await race(10, () => `begin; select public.ai_system_claim('centre.race', '2027-01-01T00:00:00Z', 60, '2027-01-01T00:00:30Z'); select pg_sleep(0.1); commit;`);
  assert.equal(claims.filter((output) => output.split('\n').includes('t')).length, 1, 'a job runs once a period under contention');

  console.log(`Postgres 16 (Docker): ${migrations.length} migrations apply twice; integration passed; 20 racing charges kept the balance exact (16 won, 2 left), duplicate request keys charged once, racing refunds refunded once, a 12-call cap admitted exactly 12 of 30, racing first charges granted the cycle once, 10 racing page saves from one revision: exactly 1 won, 20 racing visitors took exactly 5 of 5 rate slots, 10 racing ticks claimed a job exactly once.`);
} finally {
  spawnSync('docker', ['rm', '--force', container]);
}
