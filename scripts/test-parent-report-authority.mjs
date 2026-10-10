// Canonical DDL, real independent PostgreSQL transactions, owned local data.
// No production API, credentials, customer records or reports are accessed.
import { spawn } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const name = 'schood-report-authority-' + randomUUID().slice(0, 8);
const image = 'postgres:17.5-alpine@sha256:6567bca8d7bc8c82c5922425a0baee57be8402df92bae5eacad5f01ae9544daa';
const migrationPath = 'supabase/migrations/20261010153000_parent_report_revocation_authority.sql';
const migration = readFileSync(migrationPath, 'utf8');
const checks = [];
let owned = false, passed = false, cleanupVerified = false;
const q = value => "'" + String(value).replaceAll("'", "''") + "'";
function run(args, input = '') {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '';
    child.stdout.on('data', d => out += d); child.stderr.on('data', d => err += d);
    const timer = setTimeout(() => { child.kill(); reject(Error('Owned database operation timed out')); }, 45_000);
    child.on('error', e => { clearTimeout(timer); reject(e); });
    child.on('close', code => { clearTimeout(timer); code === 0 ? resolve(out.trim()) : reject(Error(err.trim() || 'Owned database operation failed')); });
    child.stdin.end(input);
  });
}
const sql = text => run(['exec', '-i', name, 'psql', '-U', 'postgres', '-d', 'postgres', '-Atq', '-v', 'ON_ERROR_STOP=1'], text);
const pause = () => new Promise(resolve => setTimeout(resolve, 75));
const ddl = (file, table) => {
  const source = readFileSync('supabase/migrations/' + file, 'utf8').replaceAll('\r\n', '\n');
  const start = source.indexOf('create table if not exists public.' + table + ' (');
  assert.ok(start >= 0, 'Canonical DDL not found: ' + table);
  return source.slice(start, source.indexOf('\n);', start) + 4);
};
const check = async (label, test) => { await test(); checks.push({ case: label, passed: true }); console.log('PASS: ' + label); };
const expr = (actor, token) => `public.parent_report_revoke(${actor ? q(actor) : 'null'}::uuid,${token ? q(token) : 'null'}::uuid)`;
const revoke = async (actor, token) => JSON.parse(await sql(`set role service_role;select ${expr(actor, token)};`));
const state = token => sql(`select is_active from parent_report_tokens where id=${q(token)};`);
const allow = async (actor, token) => { assert.deepEqual(await revoke(actor, token), { ok: true }); assert.equal(await state(token), 'f'); };
const deny = async (actor, token, code = 'report_revoke_denied') => { assert.deepEqual(await revoke(actor, token), { ok: false, code }); assert.equal(await state(token), 't'); };
async function actor() {
  const id = randomUUID();
  await sql(`insert into auth.users(id,email,email_confirmed_at) values(${q(id)},${q(id + '@qa.invalid')},now());insert into users(id,email) values(${q(id)},${q(id + '@qa.invalid')});`);
  return id;
}
async function academy() {
  const id = randomUUID(); await sql(`insert into tenants(id,name,slug,type) values(${q(id)},'Owned QA academy',${q(id)},'team');`); return id;
}
async function membership(actor, academy, role = 'owner') {
  const id = randomUUID(); await sql(`insert into tenant_memberships(id,tenant_id,user_id,role,status) values(${q(id)},${q(academy)},${q(actor)},${q(role)},'active');`); return id;
}
async function report(creator, academyId = null) {
  const a = academyId || await academy(), c = randomUUID(), t = randomUUID();
  await sql(`insert into academy_contacts(id,academy_id,first_name) values(${q(c)},${q(a)},'Synthetic student');insert into parent_report_tokens(id,academy_id,contact_id,created_by) values(${q(t)},${q(a)},${q(c)},${q(creator)});`);
  return { a, c, t };
}
async function grant(actorId, a, options = {}) {
  const id = randomUUID(), { role = 'manager', scope = 'academy', ids = [], status = 'active' } = options;
  await sql(`insert into academy_role_grants(id,academy_id,user_id,email,role,scope_type,scope_ids,status) values(${q(id)},${q(a)},${q(actorId)},${q(actorId + '@qa.invalid')},${q(role)},${q(scope)},${q(JSON.stringify(ids))}::jsonb,${q(status)});`); return id;
}
async function staff(actorId, a, role = 'manager') {
  const id = randomUUID(); await sql(`insert into academy_staff(id,academy_id,user_id,email,role) values(${q(id)},${q(a)},${q(actorId)},${q(actorId + '@qa.invalid')},${q(role)});`); return id;
}
async function classroom(a, c) {
  const id = randomUUID(); await sql(`insert into academy_classrooms(id,academy_id,name) values(${q(id)},${q(a)},${q(id)});insert into academy_classroom_memberships(academy_id,classroom_id,contact_id) values(${q(a)},${q(id)},${q(c)});`); return id;
}
async function branch(a) {
  const id = randomUUID(); await sql(`insert into academy_branches(id,academy_id,branch_key,name) values(${q(id)},${q(a)},${q(id)},'Owned branch');`); return id;
}
async function barrier(id) {
  for (let i = 0; i < 50; i++) { if (await sql(`select count(*) from pg_locks where locktype='advisory' and objid=${id} and granted;`) === '1') return; await pause(); }
  throw Error('Independent transaction barrier unavailable');
}
try {
  await run(['run', '--detach', '--name', name, '--network', 'none', '--label', 'schood.qa=parent-report-authority', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', image]); owned = true;
  let ready = false;
  for (let i = 0; i < 120; i++) {
    try { if (await run(['exec', name, 'cat', '/proc/1/comm']) === 'postgres') { await sql('select 1;'); ready = true; break; } } catch { /* wait for exclusively owned PG */ }
    await pause();
  }
  assert.ok(ready, 'Owned native PostgreSQL did not become ready');
  await sql(`create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,deleted_at timestamptz);
    grant usage on schema public,auth to anon,authenticated,service_role;`);
  for (const table of ['users', 'tenants', 'tenant_memberships']) await sql(ddl('20260202170000_platform_spine.sql', table));
  await sql(`alter table tenants add column metadata jsonb not null default '{}';`);
  for (const table of ['academy_contacts', 'academy_classrooms', 'academy_classroom_memberships']) await sql(ddl('20260212000000_teacher_studio_core.sql', table));
  await sql(ddl('20260608170000_academy_staff.sql', 'academy_staff'));
  for (const table of ['academy_role_grants', 'academy_access_audit_logs']) await sql(ddl('20260618103000_academy_role_grants.sql', table));
  await sql(ddl('20260507120000_partner_centers_vouchers.sql', 'partner_center_profiles'));
  await sql(ddl('20260608130000_monetization_features.sql', 'parent_report_tokens'));
  await sql(ddl('20260810130000_academy_business_os_phase_a.sql', 'academy_branches'));
  await sql(`alter table academy_contacts add column primary_branch_id uuid;alter table academy_classrooms add column branch_id uuid;
    alter table academy_staff add unique(academy_id,id);`);
  const phaseG = readFileSync('supabase/migrations/20260810190000_academy_business_os_phase_g.sql', 'utf8');
  await sql(phaseG.slice(phaseG.indexOf('alter table public.academy_staff drop constraint'), phaseG.indexOf('create table if not exists public.academy_staff_branch_assignments')));
  await sql(ddl('20260810190000_academy_business_os_phase_g.sql', 'academy_staff_branch_assignments'));
  await sql(`alter table parent_report_tokens enable row level security;alter table academy_access_audit_logs enable row level security;`);
  await sql(migration);
  for (const role of ['anon', 'authenticated']) await check(role + ' cannot execute or impersonate a report revocation', async () => {
    await assert.rejects(sql(`set role ${role};select ${expr(randomUUID(), randomUUID())};`), /permission denied/);
  });
  await check('null actors and unknown links have fixed private denials', async () => {
    assert.deepEqual(await revoke(null, randomUUID()), { ok: false, code: 'report_revoke_denied' });
    assert.deepEqual(await revoke(await actor(), randomUUID()), { ok: false, code: 'report_revoke_denied' });
  });
  for (const role of ['owner', 'admin']) await check('replacement ' + role + ' can revoke the previous issuer link', async () => {
    const creator = await actor(), current = await actor(), r = await report(creator); await membership(current, r.a, role); await allow(current, r.t);
  });
  await check('historical creator without current academy access cannot revoke', async () => { const u = await actor(), r = await report(u); await deny(u, r.t); });
  await check('another academy owner and a regular member cannot revoke', async () => {
    const u = await actor(), r = await report(await actor()); await membership(u, await academy()); await deny(u, r.t);
    await membership(u, r.a, 'member'); await deny(u, r.t);
  });
  for (const field of ['public', 'auth']) await check(field + ' account deactivation prevents revocation', async () => {
    const u = await actor(), r = await report(u); await membership(u, r.a);
    await sql(field === 'public' ? `update users set is_active=false where id=${q(u)};` : `update auth.users set deleted_at=now() where id=${q(u)};`);
    await deny(u, r.t, 'report_session_required');
  });
  await check('disabled membership and malformed center metadata do not grant authority', async () => {
    const u = await actor(), r = await report(u), m = await membership(u, r.a);
    await sql(`update tenant_memberships set status='disabled' where id=${q(m)};update tenants set metadata='{"service_family":"academy","parent_center_id":"invalid"}' where id=${q(r.a)};`);
    await deny(u, r.t);
  });
  await check('current parent-center owner can revoke a child link and loses access after unlinking', async () => {
    const u = await actor(), r = await report(await actor()), center = await academy(); await membership(u, center);
    await sql(`insert into partner_center_profiles(tenant_id,display_name,slug) values(${q(center)},'Owned center',${q(center)});
      update tenants set metadata=jsonb_build_object('service_family','academy','parent_center_id',${q(center)}) where id=${q(r.a)};`);
    await allow(u, r.t); await sql(`update parent_report_tokens set is_active=true where id=${q(r.t)};update tenants set metadata='{}' where id=${q(r.a)};`); await deny(u, r.t);
  });
  await check('accepted academy admin grant can revoke another issuer link', async () => {
    const u = await actor(), r = await report(await actor()); await grant(u, r.a, { role: 'admin' }); await allow(u, r.t);
  });
  for (const kind of ['invited', 'revoked', 'expired', 'future']) await check(kind + ' grant cannot revoke', async () => {
    const u = await actor(), r = await report(u), g = await grant(u, r.a, { role: 'admin', status: ['invited','revoked'].includes(kind) ? kind : 'active' });
    if (kind === 'expired') await sql(`update academy_role_grants set expires_at=now()-interval '1 second' where id=${q(g)};`);
    if (kind === 'future') await sql(`update academy_role_grants set starts_at=now()+interval '1 day' where id=${q(g)};`);
    await deny(u, r.t);
  });
  for (const scope of ['students', 'classrooms', 'branches']) await check(scope + ' delegate can revoke only own in-scope student link', async () => {
    const u = await actor(), r = await report(u), outside = await report(u, r.a), notOwn = await report(await actor(), r.a);
    let scopeId = r.c;
    if (scope === 'classrooms') scopeId = await classroom(r.a, r.c);
    if (scope === 'branches') { scopeId = await branch(r.a); await sql(`update academy_contacts set primary_branch_id=${q(scopeId)} where id=${q(r.c)};`); }
    await grant(u, r.a, { role: 'admin', scope, ids: [scopeId] });
    await deny(u, outside.t); await deny(u, notOwn.t); await allow(u, r.t);
  });
  await check('classroom scope removal prevents historical issuer access', async () => {
    const u = await actor(), r = await report(u), c = await classroom(r.a, r.c); await grant(u, r.a, { scope: 'classrooms', ids: [c] });
    await sql(`delete from academy_classroom_memberships where classroom_id=${q(c)};`); await deny(u, r.t);
  });
  await check('malformed delegated scope objects or scalar IDs cannot supply authority', async () => {
    for (const value of ['object', 'scalar']) {
      const u = await actor(), r = await report(u), g = await grant(u, r.a, { scope: 'students', ids: [r.c] });
      await sql(`update academy_role_grants set scope_ids=${q(JSON.stringify(value === 'object' ? { [r.c]: true } : r.c))}::jsonb where id=${q(g)};`);
      await deny(u, r.t);
    }
  });
  await check('current staff manager can revoke own link but not another issuer link', async () => {
    const u = await actor(), r = await report(u), other = await report(await actor(), r.a); await staff(u, r.a); await deny(u, other.t); await allow(u, r.t);
  });
  await check('staff admin can revoke another issuer link until deactivated', async () => {
    const u = await actor(), r = await report(await actor()), s = await staff(u, r.a, 'admin');
    await allow(u, r.t); await sql(`update parent_report_tokens set is_active=true where id=${q(r.t)};update academy_staff set is_active=false where id=${q(s)};`); await deny(u, r.t);
  });
  await check('teacher and assistant staff have no reporting authority', async () => {
    for (const role of ['teacher', 'assistant']) { const u = await actor(), r = await report(u); await staff(u, r.a, role); await deny(u, r.t); }
  });
  await check('unlinked email grant requires verified current Auth email and cannot bind another user', async () => {
    const u = await actor(), r = await report(u), g = await grant(u, r.a, { role: 'admin' });
    await sql(`update academy_role_grants set user_id=null where id=${q(g)};update auth.users set email_confirmed_at=null where id=${q(u)};`); await deny(u, r.t);
    await sql(`update auth.users set email_confirmed_at=now() where id=${q(u)};update academy_role_grants set user_id=${q(await actor())} where id=${q(g)};`); await deny(u, r.t);
    await sql(`update academy_role_grants set user_id=null where id=${q(g)};`); await allow(u, r.t);
  });
  await check('branch staff current assignment controls own-link authority', async () => {
    const u = await actor(), r = await report(u), s = await staff(u, r.a, 'branch_manager'), b = await branch(r.a), assignment = randomUUID();
    await sql(`update academy_contacts set primary_branch_id=${q(b)} where id=${q(r.c)};
      insert into academy_staff_branch_assignments(id,academy_id,staff_id,branch_id,assignment_role) values(${q(assignment)},${q(r.a)},${q(s)},${q(b)},'branch_manager');`);
    await allow(u, r.t); await sql(`update parent_report_tokens set is_active=true where id=${q(r.t)};update academy_staff_branch_assignments set status='ended' where id=${q(assignment)};`); await deny(u, r.t);
  });
  await check('repeated revocation is idempotent and audit never contains the bearer token', async () => {
    const u = await actor(), r = await report(await actor()); await membership(u, r.a); await allow(u, r.t); await allow(u, r.t);
    assert.equal(await sql(`select count(*) from academy_access_audit_logs where academy_id=${q(r.a)};`), '1');
    assert.equal(await sql(`select count(*) from academy_access_audit_logs a join parent_report_tokens t on t.academy_id=a.academy_id where a.metadata::text like '%'||t.token||'%';`), '0');
  });
  await check('audit failure rolls back token revocation instead of returning false success', async () => {
    const u = await actor(), r = await report(u); await membership(u, r.a);
    await sql(`alter table academy_access_audit_logs add constraint owned_audit_failure check(action<>'parent_report_revoked') not valid;`);
    await assert.rejects(revoke(u, r.t), /owned_audit_failure/); assert.equal(await state(r.t), 't');
    await sql('alter table academy_access_audit_logs drop constraint owned_audit_failure;');
  });
  await check('simultaneous current-owner revocations commit one audit entry', async () => {
    const u = await actor(), r = await report(await actor()); await membership(u, r.a);
    assert.deepEqual(await Promise.all([revoke(u, r.t), revoke(u, r.t)]), [{ ok: true }, { ok: true }]);
    assert.equal(await sql(`select count(*) from academy_access_audit_logs where academy_id=${q(r.a)};`), '1');
  });
  for (const source of ['membership', 'grant', 'staff', 'principal']) await check('concurrent ' + source + ' demotion wins before revocation', async () => {
    const u = await actor(), r = await report(u); let update;
    if (source === 'membership') { const id = await membership(u, r.a); update = `update tenant_memberships set role='member' where id=${q(id)};`; }
    if (source === 'grant') { const id = await grant(u, r.a, { role: 'admin' }); update = `update academy_role_grants set status='revoked' where id=${q(id)};`; }
    if (source === 'staff') { const id = await staff(u, r.a, 'admin'); update = `update academy_staff set is_active=false where id=${q(id)};`; }
    if (source === 'principal') { await membership(u, r.a); update = `update users set is_active=false where id=${q(u)};`; }
    const id = 651200 + checks.length;
    const holder = sql(`begin;${update}select pg_advisory_xact_lock(${id});select pg_sleep(0.8);commit;`);
    await barrier(id); const decision = revoke(u, r.t); await holder;
    assert.deepEqual(await decision, { ok: false, code: source === 'principal' ? 'report_session_required' : 'report_revoke_denied' }); assert.equal(await state(r.t), 't');
  });
  await check('a grant that expires while waiting for the token lock cannot revoke', async () => {
    const u = await actor(), r = await report(await actor()), g = await grant(u, r.a, { role: 'admin' });
    await sql(`update academy_role_grants set expires_at=clock_timestamp()+interval '0.65 seconds' where id=${q(g)};`);
    const holder = sql(`begin;select id from parent_report_tokens where id=${q(r.t)} for update;select pg_advisory_xact_lock(651299);select pg_sleep(1);commit;`);
    await barrier(651299); const decision = revoke(u, r.t); await holder;
    assert.deepEqual(await decision, { ok: false, code: 'report_revoke_denied' }); assert.equal(await state(r.t), 't');
  });
  await check('concurrent token scope change cannot use authority from its old academy', async () => {
    const u = await actor(), r = await report(u), moved = await report(await actor()); await membership(u, r.a);
    const holder = sql(`begin;update parent_report_tokens set academy_id=${q(moved.a)},contact_id=${q(moved.c)} where id=${q(r.t)};select pg_advisory_xact_lock(651298);select pg_sleep(0.8);commit;`);
    await barrier(651298); const decision = revoke(u, r.t); await holder;
    assert.deepEqual(await decision, { ok: false, code: 'report_revoke_unavailable' }); assert.equal(await state(r.t), 't');
  });
  await check('long contention is bounded and leaves the report active without an audit entry', async () => {
    const u = await actor(), r = await report(u), m = await membership(u, r.a);
    const holder = sql(`begin;update tenant_memberships set role='member' where id=${q(m)};select pg_advisory_xact_lock(651297);select pg_sleep(2.6);rollback;`);
    await barrier(651297); await assert.rejects(revoke(u, r.t), /lock timeout/); await holder;
    assert.equal(await state(r.t), 't'); assert.equal(await sql(`select count(*) from academy_access_audit_logs where academy_id=${q(r.a)};`), '0');
  });
  await check('additive migration replay preserves revoked links and private execute permissions', async () => {
    await sql(migration);
    assert.equal(await sql("select has_function_privilege('authenticated','public.parent_report_revoke(uuid,uuid)','execute');"), 'f');
    assert.equal(await sql("select has_function_privilege('service_role','public.parent_report_revoke(uuid,uuid)','execute');"), 't');
    assert.ok(Number(await sql('select count(*) from parent_report_tokens where not is_active;')) > 0);
  });
  passed = true;
} finally {
  if (owned) {
    const label = await run(['inspect', '--format', '{{index .Config.Labels "schood.qa"}}', name]);
    assert.equal(label, 'parent-report-authority'); await run(['rm', '-f', name]);
    assert.equal(await run(['ps', '-a', '--filter', 'name=^/' + name + '$', '--format', '{{.Names}}']), ''); cleanupVerified = true;
  }
  const directory = 'supabase/.temp/parent-report-authority'; mkdirSync(directory, { recursive: true });
  writeFileSync(directory + '/native-proof.json', JSON.stringify({ status: passed ? 'passed' : 'failed', capturedAt: new Date().toISOString(), image,
    checks, count: checks.length, cleanupVerified, productionMutation: false, customerDataRead: false,
    migration: migrationPath, migrationSha256: createHash('sha256').update(migration.replaceAll('\r\n', '\n')).digest('hex'),
    limits: ['Synthetic Auth table, not a provider Auth emulator.', 'Selected canonical authority/FK DDL, not the complete installed schema.', 'Installed Edge/provider and production own-account canaries remain required.'] }, null, 2) + '\n');
}
console.log(`Passed ${checks.length} native report authority checks; owned container removed.`);
