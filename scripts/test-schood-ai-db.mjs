// Applies the Schood AI core migration to isolated, throwaway databases (never a
// linked project) and runs its integration test:
//   1. PGlite (PostgreSQL 17 in WASM): always.
//   2. A Docker postgres:16 container with no host port: the same test, applying the
//      migration twice, then real concurrent sessions racing for credits and caps.
//      Skipped when Docker is not available, unless SCHOOD_AI_DB_REQUIRE_DOCKER=1 (CI).
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const fixture = read('supabase/tests/schood-ai-core.fixture.sql');
const migration = read('supabase/migrations/20261030100000_schood_ai_core.sql');
const integration = read('supabase/tests/schood-ai-core.integration.sql');

// --- 1. PGlite ---------------------------------------------------------------------
{
  const db = new PGlite();
  try {
    await db.exec(fixture);
    await db.exec(migration);
    await db.exec(migration);
    const results = await db.exec(integration);
    assert.equal(results.at(-1).rows[0]?.['?column?'], 'schood ai core: ok');
    console.log('PGlite (PostgreSQL 17): migration applies twice; workspaces, credit cycles, charges, refunds, budgets, caps, ledger, learning events, notification budget and isolation passed.');
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
  assert.match(output, /schood ai core: ok/);

  // Concurrency: 20 sessions each hold a 3-credit charge open for 150 ms against a
  // 50-credit pack. Exactly 16 may succeed and the balance must end at 2.
  const ws = psql(`select id from public.ai_ensure_personal_workspace('00000000-0000-4000-8000-0000000000a4', 'Race');`).trim();
  psql(`select public.ai_credit_grant('${ws}', 50, 'pack', 'race-pack');`);
  const charges = await race(20, (i) => `begin; select (public.ai_credit_charge('${ws}', '00000000-0000-4000-8000-0000000000a4', 3, 'tutor.reply', 'race-${i}', 0))->>'ok'; select pg_sleep(0.15); commit;`);
  const wins = charges.filter((line) => line.split('\n').includes('true')).length;
  assert.equal(wins, 16, `16 of 20 charges fit in 50 credits, got ${wins}`);
  assert.equal(psql(`select pack_balance from public.ai_credit_accounts where workspace_id = '${ws}';`).trim(), '2');
  assert.equal(psql(`select sum(delta) from public.ai_credit_ledger where workspace_id = '${ws}' and bucket = 'pack';`).trim(), '2', 'ledger matches the balance');

  // The same request key sent by 8 sessions at once is charged once.
  psql(`select public.ai_credit_grant('${ws}', 30, 'pack', 'race-pack-2');`);
  await race(8, () => `select public.ai_credit_charge('${ws}', '00000000-0000-4000-8000-0000000000a4', 5, 'tutor.reply', 'same-key', 0);`);
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
  await race(10, (i) => `select public.ai_credit_charge('${planWs}', '00000000-0000-4000-8000-0000000000a1', 1, 'tutor.reply', 'grant-race-${i}', 1500);`);
  assert.equal(psql(`select count(*) from public.ai_credit_ledger where workspace_id = '${planWs}' and kind = 'grant';`).trim(), '1', 'one grant per cycle');
  assert.equal(psql(`select plan_balance from public.ai_credit_accounts where workspace_id = '${planWs}';`).trim(), '1490');

  console.log('Postgres 16 (Docker): migration applies twice; integration passed; 20 racing charges kept the balance exact (16 won, 2 left), duplicate request keys charged once, racing refunds refunded once, a 12-call cap admitted exactly 12 of 30, racing first charges granted the cycle once.');
} finally {
  spawnSync('docker', ['rm', '--force', container]);
}
