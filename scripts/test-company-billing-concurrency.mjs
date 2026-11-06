// Independent adversarial checks against the real invoice command in throwaway
// Postgres. No host port, provider calls, production credentials or shared state.
import { readdirSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';

const container = `schood-company-billing-review-${randomUUID().slice(0, 8)}`;
function docker(args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let out = '', err = '';
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.stderr.on('data', (chunk) => { err += chunk; });
    child.once('error', reject);
    child.once('close', (code) => code === 0 ? resolve(out.trim()) : reject(new Error(err || out || `docker exited ${code}`)));
    child.stdin.end(input);
  });
}
const sql = (query) => docker(['exec', '-i', container, 'psql', '-U', 'postgres', '-Atq', '-v', 'ON_ERROR_STOP=1'], query);
const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;
const id = (n) => `70000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const actor = id(1), org = id(2);
const command = async (invoice, action, input = {}) => JSON.parse(await sql(`select public.company_invoice_command('${invoice}','${actor}',${literal(action)},${literal(JSON.stringify(input))}::jsonb,now())::text;`));

try {
  await docker(['run', '--detach', '--rm', '--name', container, '--env', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:16-alpine']);
  let ready = false;
  for (let attempt = 0; attempt < 30 && !ready; attempt++) {
    try { await docker(['exec', container, 'pg_isready', '-U', 'postgres']); ready = true; }
    catch { await new Promise((resolve) => setTimeout(resolve, 300)); }
  }
  assert(ready, 'isolated database became ready');
  await sql(readFileSync('supabase/tests/company.fixture.sql', 'utf8'));
  for (const file of readdirSync('supabase/migrations').filter((name) => /_company_.*\.sql$/.test(name)).sort()) {
    await sql(readFileSync(`supabase/migrations/${file}`, 'utf8'));
  }
  await sql(`insert into users(id,role) values('${actor}','admin');
    insert into company_orgs(id,name,status,seats_limit,tests_limit) values('${org}','Billing concurrency fixture','pilot',0,10);
    insert into company_invoices(id,org_id,number,issue_date,total)
    select ('70000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'${org}','REVIEW-'||n,current_date,100 from generate_series(10,14) n;`);

  const competing = await Promise.all(['a', 'b'].map((key) => command(id(10), 'payment', { amount: 80, key })));
  assert.equal(competing.filter((result) => result.code === 'payment_too_large').length, 1);
  assert.equal(await sql(`select paid_amount || ':' || status from company_invoices where id='${id(10)}'`), '80:partial');
  assert.equal(await sql(`select sum(amount) from company_invoice_payments where invoice_id='${id(10)}'`), '80');

  const sameKey = await Promise.all([command(id(11), 'payment', { amount: 40, key: 'same-form' }), command(id(11), 'payment', { amount: 40, key: 'same-form' })]);
  assert.deepEqual(sameKey.map((result) => result.duplicate).sort(), [false, true]);
  assert.equal(await sql(`select count(*) || ':' || sum(amount) from company_invoice_payments where invoice_id='${id(11)}'`), '1:40');

  const voidRace = await Promise.all([command(id(12), 'void'), command(id(12), 'payment', { amount: 20, key: 'void-race' })]);
  assert.equal(voidRace.filter((result) => result.code).length, 1);
  const voidState = await sql(`select status || ':' || paid_amount from company_invoices where id='${id(12)}'`);
  assert(['void:0', 'partial:20'].includes(voidState), `serial pay/void outcome: ${voidState}`);

  await command(id(13), 'payment', { amount: 100, key: 'full' });
  const activations = await Promise.all([command(id(13), 'activate', { seats_limit: 2 }), command(id(13), 'activate', { seats_limit: 2 })]);
  assert.deepEqual(activations.map((result) => result.duplicate).sort(), [false, true]);
  assert.equal(await sql(`select status || ':' || seats_limit from company_orgs where id='${org}'`), 'active:2');

  const full = await command(id(14), 'payment', { amount: 100, key: 'remove-race' });
  const removeRace = await Promise.all([command(id(14), 'remove_payment', { payment: full.payment }), command(id(14), 'activate', { seats_limit: 3 })]);
  assert.equal(removeRace[0].code, undefined);
  const activated = await sql(`select activated_at is not null from company_invoices where id='${id(14)}'`);
  if (removeRace[1].code === 'invoice_unpaid') assert.equal(activated, 'f');
  else { assert.equal(removeRace[1].code, undefined); assert.equal(activated, 't'); }
  assert.equal(await sql(`select status || ':' || paid_amount from company_invoices where id='${id(14)}'`), 'issued:0');

  const permissions = await sql("select has_function_privilege('anon','public.company_invoice_command(uuid,uuid,text,jsonb,timestamptz)','execute')||':'||has_function_privilege('authenticated','public.company_invoice_command(uuid,uuid,text,jsonb,timestamptz)','execute')||':'||has_function_privilege('service_role','public.company_invoice_command(uuid,uuid,text,jsonb,timestamptz)','execute');");
  assert.equal(permissions, 'false:false:true');
  console.log('Company billing skeptical concurrency: competing payment, same-key retry, pay/void, duplicate activation, remove/activate, service-only grants passed.');
} finally {
  await docker(['rm', '--force', container]).catch(() => undefined);
}
