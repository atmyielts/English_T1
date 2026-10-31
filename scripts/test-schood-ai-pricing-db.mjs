// Applies the Schood AI pricing migration (20261030500000-599999) after the core
// migrations, then the coach migrations it hands Coach Team seats to, to isolated,
// throwaway databases (never a linked project) and runs its integration test:
//   1. PGlite (PostgreSQL 17 in WASM): always. The pricing migration applies twice, and
//      once more after launch to show a re-run never closes or re-prices what is on sale.
//   2. A Docker postgres:16 container with no host port: the same test, then real
//      concurrent sessions racing to fulfil one credit-pack payment and to redeem one gift.
//      Skipped when Docker is not available, unless SCHOOD_AI_DB_REQUIRE_DOCKER=1 (CI).
// Same pattern as scripts/test-schood-ai-db.mjs.
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const fixture = `${read('supabase/tests/schood-ai-core.fixture.sql')}\n${read('supabase/tests/schood-ai-pricing.fixture.sql')}`;
const all = readdirSync(new URL('../supabase/migrations/', import.meta.url)).sort();
const core = all.filter((name) => /^202610301\d{5}_.*\.sql$/.test(name)).map((name) => read(`supabase/migrations/${name}`)).join('\n');
const pricingFiles = all.filter((name) => /^202610305\d{5}_.*\.sql$/.test(name));
const pricing = pricingFiles.map((name) => read(`supabase/migrations/${name}`)).join('\n');
const coach = all.filter((name) => /^20261030[67]\d{5}_.*\.sql$/.test(name)).map((name) => read(`supabase/migrations/${name}`)).join('\n');
const integration = read('supabase/tests/schood-ai-pricing.integration.sql');
assert.ok(pricingFiles.length >= 1, 'the pricing migration is present');
const PLUS_30 = `md5('schood-plan:schood-ai-plus-30')::uuid`;

// --- 1. PGlite ---------------------------------------------------------------------
{
  const db = new PGlite();
  try {
    await db.exec(fixture);
    await db.exec(core);
    await db.exec(pricing);
    await db.exec(pricing);
    await db.exec(coach);
    const results = await db.exec(integration).catch((cause) => { throw new Error(`${cause.message} (${cause.where ?? 'no location'})`); });
    assert.equal(results.at(-1).rows[0]?.['?column?'], 'schood ai pricing: ok');
    // After launch, and after the owner changes a price, re-running the migration changes neither.
    await db.exec(`select public.ai_pricing_launch(true); update public.plans set amount = 45000 where id = ${PLUS_30};`);
    await db.exec(pricing);
    const after = await db.query(`select is_active, amount::int as amount from public.plans where id = ${PLUS_30}`);
    assert.deepEqual(after.rows[0], { is_active: true, amount: 45000 }, 'a re-run keeps what is on sale and its price');
    const product = await db.query(`select status from public.products where id = md5('schood-product:schood-ai-plus')::uuid`);
    assert.equal(product.rows[0].status, 'active');
    console.log(`PGlite (PostgreSQL 17): ${pricingFiles.length} pricing migration(s) apply twice; 17 products and 28 plans seeded inactive at the doc's prices, bundles, RLS and grants, credit packs once per payment, refusals, the per-person and scheduled syncs, gift codes (once, expiry, extension of running access, the coach passes), certificate sittings, Coach Team setup and renewal, the launch switch on and off, and account closure through auth.users passed; a re-run after launch keeps prices and sale state.`);
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
const container = `schood-ai-pricing-test-${randomUUID().slice(0, 8)}`;
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
const user = (n) => `00000000-0000-4000-8000-${String(200 + n).padStart(12, '0')}`;
const tenant = (n) => `00000000-0000-4000-8000-${String(300 + n).padStart(12, '0')}`;

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
  psql(pricing);
  psql(pricing);
  psql(coach);
  const output = psql(integration);
  assert.ok(output.includes('schood ai pricing: ok'), 'integration test');

  // People for the races, each with a personal tenant.
  psql(Array.from({ length: 12 }, (_, n) => `insert into public.users (id) values ('${user(n)}'); insert into public.tenants (id) values ('${tenant(n)}'); insert into public.tenant_memberships (tenant_id, user_id) values ('${tenant(n)}', '${user(n)}');`).join('\n'));

  // A credit pack: 12 sessions fulfil the same paid payment at once (the webhook, the
  // scheduled sync and the buyer's return all at the same moment). Granted exactly once.
  const pay = psql(`insert into public.payments (user_id, tenant_id, product_id, plan_id, status) values ('${user(0)}', '${tenant(0)}', md5('schood-product:schood-ai-credits')::uuid, md5('schood-plan:schood-ai-credits-1000')::uuid, 'paid') returning id;`).trim().split('\n')[0];
  const fulfils = await race(12, (i) => (i % 3 === 0
    ? `begin; select public.ai_pricing_sync('${user(0)}'); select pg_sleep(0.15); commit;`
    : `begin; select (public.ai_pricing_fulfil('${pay}'))->>'replayed'; select pg_sleep(0.15); commit;`));
  assert.equal(fulfils.filter((line) => line.split('\n').includes('false')).length <= 1, true, 'at most one first fulfilment');
  assert.equal(psql(`select count(*) from public.ai_pricing_fulfilments where payment_id = '${pay}';`).trim(), '1', 'one claim');
  assert.equal(psql(`select a.pack_balance from public.ai_credit_accounts a join public.ai_workspaces w on w.id = a.workspace_id where w.owner_id = '${user(0)}' and w.kind = 'personal';`).trim(), '1000', 'credits granted once');
  assert.equal(psql(`select count(*) from public.ai_credit_ledger where reference = 'payment:${pay}';`).trim(), '1', 'one ledger row');

  // A gift: 10 different people redeem the same code at once. Exactly one gets it.
  const giftPay = psql(`insert into public.payments (user_id, tenant_id, product_id, plan_id, status) values ('${user(0)}', '${tenant(0)}', md5('schood-product:schood-ai-gift')::uuid, md5('schood-plan:schood-ai-gift-plus-30')::uuid, 'paid') returning id;`).trim().split('\n')[0];
  const gift = psql(`select (public.ai_pricing_fulfil('${giftPay}'))->'outcome'->>'gift_id';`).trim();
  const hash = 'a1'.repeat(32);
  psql(`select public.ai_pricing_gift_set_hash('${gift}', '${hash}');`);
  const redeems = await race(10, (i) => `begin; select (public.ai_pricing_redeem('${hash}', '${user(i + 1)}'))->>'ok'; select pg_sleep(0.15); commit;`);
  assert.equal(redeems.filter((line) => line.split('\n').includes('true')).length, 1, 'one person redeems the gift');
  const winner = psql(`select redeemed_by from public.ai_pricing_gifts where id = '${gift}';`).trim();
  assert.equal(psql(`select count(distinct user_id) from public.entitlements where source = 'gift' and value->>'gift_id' = '${gift}';`).trim(), '1', 'entitlements for one person');
  assert.equal(psql(`select count(*) from public.entitlements where user_id = '${winner}' and resource_id = md5('schood-product:schood-ai-plus')::uuid;`).trim(), '1', 'the winner has Plus');

  // A credit gift redeemed by the same person from 8 tabs at once: granted once.
  const creditGiftPay = psql(`insert into public.payments (user_id, tenant_id, product_id, plan_id, status) values ('${user(0)}', '${tenant(0)}', md5('schood-product:schood-ai-gift')::uuid, md5('schood-plan:schood-ai-gift-credits-10000')::uuid, 'paid') returning id;`).trim().split('\n')[0];
  const creditGift = psql(`select (public.ai_pricing_fulfil('${creditGiftPay}'))->'outcome'->>'gift_id';`).trim();
  psql(`select public.ai_pricing_gift_set_hash('${creditGift}', '${'b2'.repeat(32)}');`);
  await race(8, () => `begin; select public.ai_pricing_redeem('${'b2'.repeat(32)}', '${user(11)}'); select pg_sleep(0.1); commit;`);
  assert.equal(psql(`select a.pack_balance from public.ai_credit_accounts a join public.ai_workspaces w on w.id = a.workspace_id where w.owner_id = '${user(11)}' and w.kind = 'personal';`).trim(), '10000', 'credits from a gift granted once');

  // Coach Team setup from 6 tabs at once: one team.
  const teamPay = psql(`insert into public.payments (user_id, tenant_id, product_id, plan_id, status) values ('${user(10)}', '${tenant(10)}', md5('schood-product:schood-coach-team')::uuid, md5('schood-plan:schood-coach-team-5-30')::uuid, 'paid') returning id;`).trim().split('\n')[0];
  psql(`select public.ai_pricing_fulfil('${teamPay}');`);
  await race(6, (i) => `begin; select public.ai_pricing_team_setup('${teamPay}', '${user(10)}', 'Team ${i}', array['sales']); select pg_sleep(0.1); commit;`);
  assert.equal(psql(`select count(*) from public.coach_teams where manager_id = '${user(10)}';`).trim(), '1', 'one team per order');
  console.log('Docker postgres:16: the pricing migration applies twice after the core; the integration test passed; 12 concurrent fulfilments of one credit-pack payment granted it once; 10 people racing for one gift code left exactly one recipient; 8 tabs redeeming one credit gift granted it once; 6 tabs setting up one Coach Team order made one team.');
} finally {
  spawnSync('docker', ['rm', '--force', container], { encoding: 'utf8' });
}
