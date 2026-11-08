// Bulk actions, saved filters, manager departments, requests, profile, plan, checklist, search.
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { routes as core } from './core.ts';
import { routes as people } from './people.ts';
import { routes as staff } from './staff.ts';
import { likePattern } from './people/search.ts';
import { FakeDb, testHandler } from './testing.ts';
import { stubInvoiceCommands } from './testing-billing.ts';

const STAFF = 'aa000000-0000-4000-8000-000000000001';
const OWNER = 'a1000000-0000-4000-8000-000000000002';
const HR = 'a1000000-0000-4000-8000-000000000003';
const MANAGER = 'a1000000-0000-4000-8000-000000000004';
const WORKER = 'a1000000-0000-4000-8000-000000000005';
const WORKER2 = 'a1000000-0000-4000-8000-000000000006';
const STRANGER = 'a1000000-0000-4000-8000-000000000007';
const ORG = '7a0f5c1e-0000-4000-8000-00000000c0de';
const ORG2 = '7a0f5c1e-0000-4000-8000-00000000c0df';
const DEPT_A = 'd0000000-0000-4000-8000-00000000000a';
const DEPT_B = 'd0000000-0000-4000-8000-00000000000b';
const DEPT_X = 'd0000000-0000-4000-8000-00000000000c';
const ID = {
  owner: 'b0000000-0000-4000-8000-000000000001', hr: 'b0000000-0000-4000-8000-000000000002', manager: 'b0000000-0000-4000-8000-000000000003',
  worker: 'b0000000-0000-4000-8000-000000000004', worker2: 'b0000000-0000-4000-8000-000000000005', invited: 'b0000000-0000-4000-8000-000000000006',
  foreign: 'b0000000-0000-4000-8000-000000000007',
};
const NOW = new Date('2026-11-06T07:00:00Z');

const member = (row: Record<string, unknown>) => ({ email: null, full_name: null, role: 'employee', department_id: null, job_role: 'general', status: 'active', seat: false, level: null, level_score: null, level_source: null, level_at: null, target_level: null, target_date: null, consent_at: null, joined_at: '2026-01-01T00:00:00Z', ...row });

function setup(org: Record<string, unknown> = {}) {
  const db = new FakeDb({
    users: [STAFF, OWNER, HR, MANAGER, WORKER, WORKER2, STRANGER].map((id) => ({ id, role: id === STAFF ? 'admin' : 'user' })),
    company_orgs: [
      { id: ORG, name: 'Silk Road Hotels', industry: 'hospitality', size_band: '51-200', status: 'active', seats_limit: 2, tests_limit: 10, tests_used: 0, settings: { locale: 'ru', ai_daily_limit: 5 }, contract_ends_at: null, billing_email: 'hr@example.com', ...org },
      { id: ORG2, name: 'Navoi', industry: 'logistics', size_band: '51-200', status: 'active', seats_limit: 5, tests_limit: 10, tests_used: 0, settings: {}, contract_ends_at: null },
    ],
    company_departments: [
      { id: DEPT_A, org_id: ORG, name: 'Front office' }, { id: DEPT_B, org_id: ORG, name: 'Finance' }, { id: DEPT_X, org_id: ORG2, name: 'Foreign department' },
    ],
    company_members: [
      member({ id: ID.owner, org_id: ORG, user_id: OWNER, full_name: 'Dilnoza Owner', email: 'owner@example.com', role: 'owner' }),
      member({ id: ID.hr, org_id: ORG, user_id: HR, full_name: 'Rustam Admin', email: 'hr@example.com', role: 'admin' }),
      member({ id: ID.manager, org_id: ORG, user_id: MANAGER, full_name: 'Elena Manager', email: 'elena@example.com', role: 'manager', department_id: DEPT_A }),
      member({ id: ID.worker, org_id: ORG, user_id: WORKER, full_name: 'Bekzod Worker', email: 'bek@example.com', department_id: DEPT_A, level: 'a2', consent_at: '2026-01-01T00:00:00Z' }),
      member({ id: ID.worker2, org_id: ORG, user_id: WORKER2, full_name: 'Anvar Finance', email: 'anvar@example.com', department_id: DEPT_B }),
      member({ id: ID.invited, org_id: ORG, user_id: null, full_name: 'Invited Person', email: 'inv@example.com', status: 'invited', joined_at: null, department_id: DEPT_A }),
      member({ id: ID.foreign, org_id: ORG2, user_id: STRANGER, full_name: 'Foreign Worker', email: 'x@example.com', department_id: DEPT_X }),
    ],
  });
  const syncs: string[] = [];
  db.rpcs.company_sync_english_access = ({ p_user }) => { syncs.push(String(p_user)); return 'granted'; };
  stubInvoiceCommands(db);
  db.uniques.company_member_requests = [{ columns: ['member_id', 'kind'], where: (row) => row.status === 'pending' }];
  db.uniques.company_saved_filters = [{ columns: ['org_id', 'user_id', 'name'] }];
  return { db, syncs, call: testHandler(db, [...core, ...people, ...staff], { now: () => NOW }) };
}
const bulk = (ORGID = ORG) => `orgs/${ORGID}/people/bulk`;

Deno.test('bulk: only HR, and another workspace’s people are simply not found', async () => {
  const { db, call } = setup();
  for (const user of [MANAGER, WORKER]) assertEquals((await call('POST', bulk(), { user, body: { action: 'seat_off', ids: [ID.worker] } })).status, 403);
  const made = await call('POST', bulk(), { user: HR, body: { action: 'department', department_id: DEPT_B, ids: [ID.worker, ID.foreign] } });
  assertEquals(made.status, 200);
  assertEquals(made.body.results.map((row: { ok: boolean; code?: string }) => [row.ok, row.code]), [[true, undefined], [false, 'member_not_found']]);
  assertEquals(db.rows('company_members').find((row) => row.id === ID.foreign)!.department_id, DEPT_X);
});

Deno.test('bulk: department, job role and target change every chosen row, checked first', async () => {
  const { db, call } = setup();
  const row = (id: string) => db.rows('company_members').find((entry) => entry.id === id)!;
  const moved = await call('POST', bulk(), { user: HR, body: { action: 'department', department_id: DEPT_B, ids: [ID.worker, ID.invited] } });
  assertEquals([moved.body.changed, row(ID.worker).department_id, row(ID.invited).department_id], [2, DEPT_B, DEPT_B]);
  assertEquals((await call('POST', bulk(), { user: HR, body: { action: 'department', department_id: DEPT_X, ids: [ID.worker] } })).status, 400);
  await call('POST', bulk(), { user: HR, body: { action: 'department', department_id: null, ids: [ID.worker] } });
  assertEquals(row(ID.worker).department_id, null);
  await call('POST', bulk(), { user: HR, body: { action: 'job_role', job_role: 'sales', ids: [ID.worker] } });
  assertEquals(row(ID.worker).job_role, 'sales');
  assertEquals((await call('POST', bulk(), { user: HR, body: { action: 'job_role', job_role: 'pirate', ids: [ID.worker] } })).status, 400);
  assertEquals((await call('POST', bulk(), { user: HR, body: { action: 'job_role', ids: [ID.worker] } })).status, 400);
  await call('POST', bulk(), { user: HR, body: { action: 'target', target_level: 'b2', target_date: '2027-06-30', ids: [ID.worker] } });
  assertEquals([row(ID.worker).target_level, row(ID.worker).target_date], ['b2', '2027-06-30']);
  assertEquals((await call('POST', bulk(), { user: HR, body: { action: 'target', target_date: '2027-02-31', ids: [ID.worker] } })).status, 400);
  assertEquals((await call('POST', bulk(), { user: HR, body: { action: 'target', ids: [ID.worker] } })).status, 400);
  assertEquals(db.rows('company_audit').filter((entry) => entry.action === 'member.bulk_updated').length, 4);
});

Deno.test('bulk: input limits', async () => {
  const { call } = setup();
  assertEquals((await call('POST', bulk(), { user: HR, body: { action: 'nope', ids: [ID.worker] } })).status, 400);
  assertEquals((await call('POST', bulk(), { user: HR, body: { action: 'seat_off', ids: [] } })).status, 400);
  assertEquals((await call('POST', bulk(), { user: HR, body: { action: 'seat_off', ids: ['not-an-id'] } })).status, 400);
  const many = Array.from({ length: 501 }, () => crypto.randomUUID());
  assertEquals((await call('POST', bulk(), { user: HR, body: { action: 'seat_off', ids: many } })).body.code, 'bulk_too_large');
});

Deno.test('bulk: seats stop at the limit, row by row, and access follows', async () => {
  const { db, syncs, call } = setup();
  const seatOn = await call('POST', bulk(), { user: HR, body: { action: 'seat_on', ids: [ID.worker, ID.worker2, ID.manager] } });
  assertEquals(seatOn.status, 200);
  assertEquals(seatOn.body.results.map((row: { ok: boolean; code?: string }) => row.code ?? 'ok'), ['ok', 'ok', 'seats_full']);
  assertEquals([seatOn.body.changed, seatOn.body.failed], [2, 1]);
  assertEquals(syncs.sort(), [WORKER, WORKER2].sort());
  assertEquals(db.rows('company_members').filter((row) => row.seat).length, 2);
  // Already seated is no change; a double click uses nothing more.
  const again = await call('POST', bulk(), { user: HR, body: { action: 'seat_on', ids: [ID.worker, ID.worker2] } });
  assertEquals([again.body.changed, again.body.results[0].unchanged], [0, true]);
  const off = await call('POST', bulk(), { user: HR, body: { action: 'seat_off', ids: [ID.worker, ID.manager] } });
  assertEquals([off.body.changed, off.body.results[1].unchanged], [1, true]);
  assertEquals(db.rows('company_members').find((row) => row.id === ID.worker)!.seat, false);
});

Deno.test('bulk: seats need an active workspace, and a failed sync is reported per row', async () => {
  const pilot = setup({ status: 'pilot', seats_limit: 0 });
  assertEquals((await pilot.call('POST', bulk(), { user: HR, body: { action: 'seat_on', ids: [ID.worker] } })).body.code, 'seats_inactive');
  const { db, call } = setup();
  db.rpcs.company_sync_english_access = () => { throw new Error('down'); };
  const made = await call('POST', bulk(), { user: HR, body: { action: 'seat_on', ids: [ID.worker] } });
  assertEquals([made.status, made.body.results[0].ok, made.body.results[0].access_sync_failed, made.body.access_sync_failed], [200, true, true, true]);
});

Deno.test('bulk: writes stop while a workspace is paused or its contract has ended', async () => {
  const paused = setup({ status: 'suspended' });
  assertEquals((await paused.call('POST', bulk(), { user: HR, body: { action: 'seat_off', ids: [ID.worker] } })).body.code, 'org_suspended');
  const ended = setup({ contract_ends_at: '2026-01-01T00:00:00Z' });
  assertEquals((await ended.call('POST', bulk(), { user: HR, body: { action: 'seat_off', ids: [ID.worker] } })).body.code, 'contract_ended');
});

Deno.test('bulk: removal protects owners and the person doing it, and revokes links', async () => {
  const { db, syncs, call } = setup();
  db.rows('company_invites').push({ id: crypto.randomUUID(), org_id: ORG, member_id: ID.invited, kind: 'personal', revoked_at: null, expires_at: '2027-01-01T00:00:00Z' });
  const made = await call('POST', bulk(), { user: HR, body: { action: 'remove', ids: [ID.worker, ID.invited, ID.owner, ID.hr] } });
  assertEquals(made.body.results.map((row: { code?: string }) => row.code ?? 'ok'), ['ok', 'ok', 'owner_protected', 'bulk_not_yourself']);
  const row = (id: string) => db.rows('company_members').find((entry) => entry.id === id)!;
  assertEquals([row(ID.worker).status, row(ID.worker).seat, row(ID.invited).status, row(ID.owner).status], ['removed', false, 'removed', 'active']);
  assert(db.rows('company_invites')[0].revoked_at);
  assertEquals(syncs, [WORKER]);
  // Already removed: said so, nothing else.
  const again = await call('POST', bulk(), { user: HR, body: { action: 'remove', ids: [ID.worker] } });
  assertEquals(again.body.results[0].code, 'member_removed');
  // Staff may remove owners, but not the last one.
  const last = await call('POST', bulk(), { user: STAFF, body: { action: 'remove', ids: [ID.owner] } });
  assertEquals(last.body.results[0].code, 'last_owner');
});

Deno.test('saved filters belong to the person who saved them', async () => {
  const { db, call } = setup();
  const url = `orgs/${ORG}/people/filters`;
  const saved = await call('POST', url, { user: HR, body: { name: 'No seat', filters: { seat: 'no', ignored: 'x', q: '' } } });
  assertEquals(saved.status, 200);
  assertEquals(saved.body.filter.filters, { seat: 'no' });
  const dup = await call('POST', url, { user: HR, body: { name: 'No seat', filters: { seat: 'yes' } } });
  assertEquals([dup.status, dup.body.code], [409, 'filter_exists']);
  assertEquals((await call('POST', url, { user: HR, body: { name: 'Empty', filters: {} } })).body.code, 'filter_empty');
  assertEquals((await call('POST', url, { user: HR, body: { name: 'x', filters: { q: 'a\u0000' } } })).status, 400);
  assertEquals((await call('GET', url, { user: HR })).body.filters.length, 1);
  assertEquals((await call('GET', url, { user: OWNER })).body.filters.length, 0);
  assertEquals((await call('GET', url, { user: WORKER })).status, 403);
  const id = saved.body.filter.id;
  assertEquals((await call('DELETE', `${url}/${id}`, { user: OWNER })).status, 404);
  assertEquals((await call('DELETE', `${url}/${id}`, { user: HR })).status, 200);
  assertEquals(db.rows('company_saved_filters').length, 0);
});

Deno.test('a manager can look after several departments, added additively', async () => {
  const { db, call } = setup();
  const url = `orgs/${ORG}/people/${ID.manager}/departments`;
  const seen = async () => (await call('GET', `orgs/${ORG}/people`, { user: MANAGER })).body.members.map((row: { id: string }) => row.id).sort();
  assertEquals(await seen(), [ID.manager, ID.worker, ID.invited].sort());
  assertEquals((await call('PUT', url, { user: MANAGER, body: { department_ids: [DEPT_B] } })).status, 403);
  assertEquals((await call('PUT', url, { user: HR, body: { department_ids: [DEPT_X] } })).status, 400);
  assertEquals((await call('PUT', `orgs/${ORG}/people/${ID.worker}/departments`, { user: HR, body: { department_ids: [DEPT_B] } })).body.code, 'not_a_manager');
  const saved = await call('PUT', url, { user: HR, body: { department_ids: [DEPT_B, DEPT_A] } });
  assertEquals(saved.body.department_ids, [DEPT_B]);
  assertEquals(await seen(), [ID.manager, ID.worker, ID.invited, ID.worker2].sort());
  assertEquals((await call('GET', `orgs/${ORG}/people`, { user: HR })).body.manager_departments, { [ID.manager]: [DEPT_B] });
  await call('PUT', url, { user: HR, body: { department_ids: [] } });
  assertEquals(db.rows('company_manager_departments').length, 0);
  assertEquals(await seen(), [ID.manager, ID.worker, ID.invited].sort());
});

Deno.test('the people list still answers if the manager table is not there yet', async () => {
  const { db, call } = setup();
  const real = db.from.bind(db);
  // deno-lint-ignore no-explicit-any
  (db as any).from = (table: string) => {
    if (table !== 'company_manager_departments') return real(table);
    const failing = { select: () => failing, eq: () => failing, limit: () => failing, then: (done: (value: unknown) => unknown) => Promise.resolve({ data: null, error: { message: 'relation does not exist' } }).then(done) };
    return failing;
  };
  assertEquals((await call('GET', `orgs/${ORG}/people`, { user: HR })).status, 200);
  assertEquals((await call('GET', `orgs/${ORG}/people`, { user: MANAGER })).status, 200);
});

Deno.test('seat requests: the employee asks, HR decides within the limit, once', async () => {
  const { db, syncs, call } = setup({ seats_limit: 1 });
  const url = `orgs/${ORG}/profile/requests`;
  const asked = await call('POST', url, { user: WORKER, body: { kind: 'seat', note: 'For the new client' } });
  assertEquals(asked.status, 200);
  const dup = await call('POST', url, { user: WORKER, body: { kind: 'seat' } });
  assertEquals([dup.status, dup.body.code], [409, 'request_pending']);
  const inbox = await call('GET', `orgs/${ORG}/people/requests`, { user: HR });
  assertEquals(inbox.body.requests.map((row: { person: string }) => row.person), ['Bekzod Worker']);
  assertEquals((await call('GET', `orgs/${ORG}/people/requests`, { user: MANAGER })).status, 403);
  const decide = `orgs/${ORG}/people/requests/${asked.body.request.id}`;
  assertEquals((await call('POST', decide, { user: WORKER, body: { decision: 'approve' } })).status, 403);
  const done = await call('POST', decide, { user: HR, body: { decision: 'approve' } });
  assertEquals([done.status, done.body.request.status], [200, 'approved']);
  assertEquals(db.rows('company_members').find((row) => row.id === ID.worker)!.seat, true);
  assertEquals(syncs, [WORKER]);
  const twice = await call('POST', decide, { user: HR, body: { decision: 'approve' } });
  assertEquals([twice.status, twice.body.code], [409, 'request_decided']);
  assertEquals(syncs, [WORKER]);
  // Seated already: nothing to ask for. Full: stays pending.
  assertEquals((await call('POST', url, { user: WORKER, body: { kind: 'seat' } })).body.code, 'already_seated');
  const second = await call('POST', url, { user: WORKER2, body: { kind: 'seat' } });
  const full = await call('POST', `orgs/${ORG}/people/requests/${second.body.request.id}`, { user: HR, body: { decision: 'approve' } });
  assertEquals([full.status, full.body.code], [409, 'seats_full']);
  assertEquals(db.rows('company_member_requests').find((row) => row.id === second.body.request.id)!.status, 'pending');
  const declined = await call('POST', `orgs/${ORG}/people/requests/${second.body.request.id}`, { user: HR, body: { decision: 'decline' } });
  assertEquals(declined.body.request.status, 'declined');
  assertEquals(db.rows('company_members').find((row) => row.id === ID.worker2)!.seat, false);
});

Deno.test('seat requests: approvals racing for the last free seat give it to exactly one', async () => {
  const { db, call } = setup({ seats_limit: 3 });
  // Two of three seats are taken, three people ask, and HR approves all three at once.
  db.rows('company_members').find((row) => row.id === ID.owner)!.seat = true;
  db.rows('company_members').find((row) => row.id === ID.hr)!.seat = true;
  const asked = [];
  for (const [user, id] of [[WORKER, ID.worker], [WORKER2, ID.worker2], [MANAGER, ID.manager]] as const) {
    const reply = await call('POST', `orgs/${ORG}/profile/requests`, { user, body: { kind: 'seat' } });
    assertEquals(reply.status, 200, id);
    asked.push(reply.body.request.id as string);
  }
  const decided = await Promise.all(asked.map((id, index) => call('POST', `orgs/${ORG}/people/requests/${id}`, { user: index % 2 ? OWNER : HR, body: { decision: 'approve' } })));
  // Before, each turned the seat on, counted too many and backed out, so all could fail.
  assertEquals(decided.filter((reply) => reply.status === 200).length, 1);
  assertEquals(decided.filter((reply) => reply.status === 409).map((reply) => reply.body.code), ['seats_full', 'seats_full']);
  assertEquals(db.rows('company_members').filter((row) => row.org_id === ORG && row.seat).length, 3);
  assertEquals(db.rows('company_member_requests').filter((row) => row.status === 'pending').length, 2);
});

Deno.test('requests: a pilot has no seats to ask for; a job role change goes through HR; another workspace’s request is not found', async () => {
  const pilot = setup({ status: 'pilot', seats_limit: 0 });
  assertEquals((await pilot.call('POST', `orgs/${ORG}/profile/requests`, { user: WORKER, body: { kind: 'seat' } })).body.code, 'seats_inactive');
  const { db, call } = setup();
  const url = `orgs/${ORG}/profile/requests`;
  assertEquals((await call('POST', url, { user: WORKER, body: { kind: 'job_role', job_role: 'pirate' } })).status, 400);
  assertEquals((await call('POST', url, { user: WORKER, body: { kind: 'job_role', job_role: 'general' } })).body.code, 'job_role_same');
  const asked = await call('POST', url, { user: WORKER, body: { kind: 'job_role', job_role: 'sales' } });
  assertEquals(db.rows('company_members').find((row) => row.id === ID.worker)!.job_role, 'general');
  assertEquals((await call('POST', `orgs/${ORG2}/people/requests/${asked.body.request.id}`, { user: STRANGER, body: { decision: 'approve' } })).status, 403);
  await call('POST', `orgs/${ORG}/people/requests/${asked.body.request.id}`, { user: HR, body: { decision: 'approve' } });
  assertEquals(db.rows('company_members').find((row) => row.id === ID.worker)!.job_role, 'sales');
  // Withdrawing: own, and pending only.
  const next = await call('POST', url, { user: WORKER, body: { kind: 'seat' } });
  assertEquals((await call('DELETE', `${url}/${next.body.request.id}`, { user: WORKER2 })).status, 409);
  assertEquals((await call('DELETE', `${url}/${next.body.request.id}`, { user: WORKER })).status, 200);
  assertEquals((await call('DELETE', `${url}/${next.body.request.id}`, { user: WORKER })).body.code, 'request_decided');
});

Deno.test('profile: a person edits their own name and language, nothing else', async () => {
  const { db, call } = setup();
  const url = `orgs/${ORG}/profile`;
  const view = await call('GET', url, { user: WORKER });
  assertEquals([view.body.member.id, view.body.department, view.body.last_owner], [ID.worker, 'Front office', false]);
  assertEquals((await call('GET', url, { user: OWNER })).body.last_owner, true);
  assertEquals((await call('GET', url, { user: STAFF })).status, 403);
  const saved = await call('PATCH', url, { user: WORKER, body: { full_name: 'Bekzod T.', locale: 'uz', role: 'owner', seat: true } });
  assertEquals(saved.status, 200);
  const row = db.rows('company_members').find((entry) => entry.id === ID.worker)!;
  assertEquals([row.full_name, row.locale, row.role, row.seat], ['Bekzod T.', 'uz', 'employee', false]);
  assertEquals((await call('PATCH', url, { user: WORKER, body: { locale: 'fr' } })).status, 400);
  assertEquals((await call('PATCH', url, { user: WORKER, body: { full_name: 'x' } })).status, 400);
  assertEquals((await call('PATCH', url, { user: WORKER, body: { full_name: 'Bad\u0000name' } })).status, 400);
});

Deno.test('download my data: only the asker’s rows, no hashes', async () => {
  const { db, call } = setup();
  db.rows('company_attempts').push(
    { id: crypto.randomUUID(), org_id: ORG, member_id: ID.worker, assessment_id: 'a', status: 'graded', overall_level: 'a2', access_token_hash: 'SECRET', started_at: '2026-10-01T00:00:00Z' },
    { id: crypto.randomUUID(), org_id: ORG, member_id: ID.worker2, assessment_id: 'a', status: 'graded', overall_level: 'b2', started_at: '2026-10-01T00:00:00Z' },
  );
  db.rows('company_activity').push(
    { id: 1, org_id: ORG, member_id: ID.worker, kind: 'lesson', minutes: 10, created_at: '2026-10-01T00:00:00Z' },
    { id: 2, org_id: ORG, member_id: ID.worker2, kind: 'lesson', minutes: 99, created_at: '2026-10-01T00:00:00Z' },
  );
  db.rows('company_lesson_progress').push({ id: 'x', org_id: ORG, member_id: ID.worker, lesson_code: 'a' }, { id: 'y', org_id: ORG, member_id: ID.worker2, lesson_code: 'b' });
  const data = await call('GET', `orgs/${ORG}/profile/export`, { user: WORKER });
  assertEquals(data.status, 200);
  assertEquals([data.body.tests.length, data.body.activity.length, data.body.lessons.length], [1, 1, 1]);
  assertEquals(data.body.person.id, ID.worker);
  assert(!JSON.stringify(data.body).includes('SECRET'));
  assert(!JSON.stringify(data.body).includes('Anvar'));
  assertEquals(db.rows('company_audit').filter((row) => row.action === 'member.data_exported').length, 1);
});

Deno.test('HR presence is recorded at most once an hour, for HR only', async () => {
  const { db, call } = setup();
  const url = `orgs/${ORG}/people/me/seen`;
  assertEquals((await call('POST', url, { user: WORKER })).status, 403);
  assertEquals((await call('POST', url, { user: STAFF })).status, 200);
  await call('POST', url, { user: HR });
  const row = db.rows('company_members').find((entry) => entry.id === ID.hr)!;
  assertEquals(row.last_seen_at, NOW.toISOString());
  row.last_seen_at = '2026-11-06T06:30:00.000Z';
  await call('POST', url, { user: HR });
  assertEquals(row.last_seen_at, '2026-11-06T06:30:00.000Z');
  row.last_seen_at = '2026-11-06T05:00:00.000Z';
  await call('POST', url, { user: HR });
  assertEquals(row.last_seen_at, NOW.toISOString());
});

Deno.test('checklist: derived from real data, dismissible, and pilots are not asked for seats', async () => {
  const { db, call } = setup({ status: 'pilot', seats_limit: 0 });
  const url = `orgs/${ORG}/onboarding`;
  assertEquals((await call('GET', url, { user: WORKER })).status, 403);
  const first = await call('GET', url, { user: HR });
  const item = (body: { items: { key: string; done: boolean; applies: boolean }[] }, key: string) => body.items.find((row) => row.key === key)!;
  assertEquals([item(first.body, 'departments').done, item(first.body, 'people').done, item(first.body, 'first_test').done, item(first.body, 'first_report').done], [true, true, false, false]);
  assertEquals(item(first.body, 'seats').applies, false);
  assertEquals(first.body.total, 4);
  db.rows('company_assessments').push({ id: crypto.randomUUID(), org_id: ORG, title: 'T', kind: 'hiring' });
  db.rows('company_attempts').push({ id: crypto.randomUUID(), org_id: ORG, status: 'graded' });
  const later = await call('GET', url, { user: HR });
  assertEquals([later.body.done, later.body.complete], [4, true]);
  // Another workspace's data does not tick anything here.
  const other = await call('GET', `orgs/${ORG2}/onboarding`, { user: STAFF });
  assertEquals([item(other.body, 'first_test').done, item(other.body, 'seats').done], [false, false]);
  const hidden = await call('POST', `${url}/dismiss`, { user: HR, body: {} });
  assertEquals(hidden.body.dismissed_at, NOW.toISOString());
  const stored = db.rows('company_orgs')[0].settings as Record<string, unknown>;
  assertEquals([stored.ai_daily_limit, stored.locale], [5, 'ru']);
  const back = await call('POST', `${url}/dismiss`, { user: HR, body: { dismissed: false } });
  assertEquals(back.body.dismissed_at, null);
});

Deno.test('search: HR finds people, departments, tests and courses', async () => {
  const { db, call } = setup();
  db.rows('company_assessments').push({ id: 'a1', org_id: ORG, title: 'Front desk test', kind: 'hiring', status: 'open' }, { id: 'a2', org_id: ORG2, title: 'Front foreign test', kind: 'hiring', status: 'open' });
  const found = await call('GET', `orgs/${ORG}/search?q=front&locale=en`, { user: HR });
  assertEquals(found.status, 200);
  assertEquals(found.body.departments.map((row: { name: string }) => row.name), ['Front office']);
  assertEquals(found.body.tests.map((row: { id: string }) => row.id), ['a1']);
  const byEmail = await call('GET', `orgs/${ORG}/search?q=anvar@`, { user: HR });
  assertEquals(byEmail.body.people.map((row: { id: string }) => row.id), [ID.worker2]);
  const course = await call('GET', `orgs/${ORG}/search?q=hospitality&locale=en`, { user: WORKER });
  assert(course.body.courses.some((row: { track: string }) => row.track === 'hospitality'));
});

Deno.test('search: stays inside the workspace, the manager’s departments and the employee’s lane', async () => {
  const { db, call } = setup();
  db.rows('company_assessments').push({ id: 'h', org_id: ORG, title: 'Finance hiring', kind: 'hiring', status: 'open' }, { id: 'p', org_id: ORG, title: 'Finance placement', kind: 'placement', status: 'open' });
  const names = (body: { people: { id: string }[] }) => body.people.map((row) => row.id);
  assertEquals(names((await call('GET', `orgs/${ORG}/search?q=foreign`, { user: HR })).body), []);
  // A manager of Front office does not find Finance's people or department, or hiring tests.
  const manager = (await call('GET', `orgs/${ORG}/search?q=finance`, { user: MANAGER })).body;
  assertEquals([manager.people.length, manager.departments.length], [0, 0]);
  assertEquals(manager.tests.map((row: { id: string }) => row.id), ['p']);
  assertEquals(names((await call('GET', `orgs/${ORG}/search?q=bekzod`, { user: MANAGER })).body), [ID.worker]);
  // After HR gives them Finance they do.
  await call('PUT', `orgs/${ORG}/people/${ID.manager}/departments`, { user: HR, body: { department_ids: [DEPT_B] } });
  assertEquals(names((await call('GET', `orgs/${ORG}/search?q=finance`, { user: MANAGER })).body), [ID.worker2]);
  // An employee finds no colleagues and no tests.
  const worker = (await call('GET', `orgs/${ORG}/search?q=finance&locale=en`, { user: WORKER })).body;
  assertEquals([worker.people.length, worker.departments.length, worker.tests.length], [0, 0, 0]);
  // Someone from elsewhere gets nothing at all.
  assertEquals((await call('GET', `orgs/${ORG}/search?q=finance`, { user: STRANGER })).status, 403);
});

Deno.test('search: shows no level or learning detail, and treats wildcards as text', async () => {
  const { call } = setup();
  const found = await call('GET', `orgs/${ORG}/search?q=bekzod`, { user: HR });
  assertEquals(Object.keys(found.body.people[0]).sort(), ['department_id', 'email', 'id', 'name', 'role', 'status']);
  assertEquals((await call('GET', `orgs/${ORG}/search?q=a`, { user: HR })).body.people, []);
  assertEquals((await call('GET', `orgs/${ORG}/search?q=%25%25`, { user: HR })).body.people, []);
  assertEquals(likePattern('50%_a\\b'), '%50\\%\\_a\\\\b%');
  assertEquals((await call('GET', `orgs/${ORG}/search?q=${encodeURIComponent('a\u0000b')}`, { user: HR })).status, 200);
  assertEquals((await call('GET', `orgs/${ORG}/search`, { user: HR })).body.people, []);
});

Deno.test('plan page: HR sees their contract and invoices, without staff notes or other workspaces', async () => {
  const { db, call } = setup();
  const url = `orgs/${ORG}/plan`;
  assertEquals((await call('GET', url, { user: MANAGER })).status, 403);
  const made = await call('POST', `staff/orgs/${ORG}/contracts`, { user: STAFF, body: { title: 'Year', seats: 2, price_per_seat: 100, term_months: 12, status: 'signed', notes: 'STAFF ONLY' } });
  assertEquals(made.status, 200);
  await call('PUT', 'staff/billing-settings', { user: STAFF, body: { legal_name: 'Typed', tax_id: '123456789', bank_name: 'Bank', mfo: '00014', account: '20208000100000000001' } });
  const invoice = await call('POST', `staff/orgs/${ORG}/invoices`, { user: STAFF, body: { lines: [{ description: 'Seats', quantity: 2, unit_price: 100 }], notes: 'INTERNAL' } });
  const voided = await call('POST', `staff/orgs/${ORG}/invoices`, { user: STAFF, body: { lines: [{ description: 'Seats', quantity: 2, unit_price: 100 }] } });
  await call('POST', `staff/invoices/${voided.body.invoice.id}/void`, { user: STAFF });
  const foreign = await call('POST', `staff/orgs/${ORG2}/invoices`, { user: STAFF, body: { lines: [{ description: 'Seats', quantity: 1, unit_price: 100 }] } });
  const plan = await call('GET', url, { user: HR });
  assertEquals(plan.status, 200);
  assertEquals(plan.body.contract.title, 'Year');
  assert(!JSON.stringify(plan.body).includes('STAFF ONLY'));
  assert(!JSON.stringify(plan.body).includes('INTERNAL'));
  assertEquals(plan.body.invoices.map((row: { id: string }) => row.id), [invoice.body.invoice.id]);
  assertEquals((await call('GET', `${url}/invoices/${invoice.body.invoice.id}`, { user: HR })).body.invoice.total, 200);
  assertEquals((await call('GET', `${url}/invoices/${foreign.body.invoice.id}`, { user: HR })).status, 404);
  assertEquals((await call('GET', `${url}/invoices/${voided.body.invoice.id}`, { user: HR })).status, 404);
  assertEquals((await call('GET', `${url}/invoices/${invoice.body.invoice.id}`, { user: WORKER })).status, 403);
  assert(db.rows('company_orgs').length === 2);
});

Deno.test('plan page: HR keeps their bank details right, checked as Uzbek formats, also while paused', async () => {
  const { db, call } = setup({ status: 'suspended' });
  const url = `orgs/${ORG}/plan/billing`;
  const bad = await call('PUT', url, { user: HR, body: { mfo: '123' } });
  assertEquals([bad.status, bad.body.field], [400, 'mfo']);
  assertEquals((await call('PUT', url, { user: HR, body: { account: '12345' } })).body.field, 'account');
  assertEquals((await call('PUT', url, { user: HR, body: { tax_id: '12' } })).body.field, 'tax_id');
  const saved = await call('PUT', url, { user: HR, body: { legal_name: 'Silk Road Hotels LLC', bank_name: 'Bank', mfo: '00 123', account: '2020 8000 2000 0000 0002', tax_id: '305123456', address: 'Tashkent' } });
  assertEquals(saved.status, 200);
  assertEquals([saved.body.buyer.mfo, saved.body.buyer.account, saved.body.buyer.tax_id], ['00123', '20208000200000000002', '305123456']);
  assertEquals(db.rows('company_orgs')[0].tax_id, '305123456');
  assertEquals((await call('PUT', url, { user: WORKER, body: { mfo: '00123' } })).status, 403);
  assertEquals(db.rows('company_org_billing').length, 1);
});

Deno.test('bulk: new links only for people who have not joined, the token stored only as a hash', async () => {
  const { db, call } = setup();
  const old = { id: crypto.randomUUID(), org_id: ORG, member_id: ID.invited, kind: 'personal', revoked_at: null, expires_at: '2027-01-01T00:00:00Z', token_hash: 'old' };
  db.rows('company_invites').push(old);
  const made = await call('POST', bulk(), { user: HR, body: { action: 'renew_links', ids: [ID.invited, ID.worker] } });
  assertEquals(made.status, 200);
  assertEquals(made.body.results[1].code, 'invite_closed');
  const link = made.body.results[0].link as string;
  assert(link.startsWith('https://company.schood.online/join/'));
  const stored = db.rows('company_invites');
  assert(stored[0].revoked_at);
  assertEquals(stored.length, 2);
  assert(!JSON.stringify(stored).includes(link.split('/').at(-1)!));
  assertEquals(made.body.changed, 1);
  // A pending owner's link stays with owners.
  db.rows('company_members').find((row) => row.id === ID.invited)!.role = 'owner';
  assertEquals((await call('POST', bulk(), { user: HR, body: { action: 'renew_links', ids: [ID.invited] } })).body.results[0].code, 'owner_protected');
  assertEquals((await call('POST', bulk(), { user: OWNER, body: { action: 'renew_links', ids: [ID.invited] } })).body.results[0].ok, true);
});

Deno.test('idle seats read activity only for people who agreed to share', async () => {
  const { db, call } = setup({ seats_limit: 10 });
  const row = (id: string) => db.rows('company_members').find((entry) => entry.id === id)!;
  // Agreed, seated, nothing in 30 days: idle.
  Object.assign(row(ID.worker), { seat: true, consent_at: '2026-01-01T00:00:00Z' });
  // Agreed, seated, active: not idle.
  Object.assign(row(ID.manager), { seat: true, consent_at: '2026-01-01T00:00:00Z' });
  // Seated without consent: counted, never named, even with activity.
  Object.assign(row(ID.worker2), { seat: true, consent_at: null });
  // Invited with a seat: membership only.
  Object.assign(row(ID.invited), { seat: true });
  // Joined this week: too soon to call idle.
  Object.assign(row(ID.hr), { seat: true, consent_at: '2026-11-04T00:00:00Z', joined_at: '2026-11-04T00:00:00Z' });
  // Another workspace's seated person with activity changes nothing here.
  Object.assign(row(ID.foreign), { seat: true, consent_at: '2026-01-01T00:00:00Z' });
  db.rows('company_activity').push(
    { id: 1, org_id: ORG, member_id: ID.manager, kind: 'lesson', minutes: 5, created_at: '2026-11-01T00:00:00Z' },
    { id: 2, org_id: ORG, member_id: ID.worker2, kind: 'lesson', minutes: 5, created_at: '2026-11-01T00:00:00Z' },
    // Too long ago.
    { id: 3, org_id: ORG, member_id: ID.worker, kind: 'lesson', minutes: 5, created_at: '2026-09-01T00:00:00Z' },
  );
  const view = await call('GET', `orgs/${ORG}/people/seats/idle`, { user: HR });
  assertEquals(view.status, 200);
  assertEquals(view.body.idle.map((entry: { id: string }) => entry.id), [ID.worker]);
  assertEquals(view.body.not_joined.map((entry: { id: string }) => entry.id), [ID.invited]);
  assertEquals(view.body.not_sharing, 1);
  assert(!JSON.stringify(view.body).includes('Anvar'));
  assertEquals((await call('GET', `orgs/${ORG}/people/seats/idle`, { user: MANAGER })).status, 403);
  // Schood English time before agreeing does not make someone busy.
  row(ID.worker).consent_at = '2026-10-20T00:00:00Z';
  db.rows('company_activity').push({ id: 4, org_id: ORG, member_id: ID.worker, kind: 'english', minutes: 5, created_at: '2026-10-15T00:00:00Z' });
  assertEquals((await call('GET', `orgs/${ORG}/people/seats/idle`, { user: HR })).body.idle.map((entry: { id: string }) => entry.id), [ID.worker]);
});
