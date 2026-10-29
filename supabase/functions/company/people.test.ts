import { assert, assertEquals, assertNotEquals } from 'jsr:@std/assert@1';
import { routes as core } from './core.ts';
import { routes as people } from './people.ts';
import { parseCsv, readImport } from './people/csv.ts';
import { maskEmail } from './people/join.ts';
import { FakeDb, testHandler } from './testing.ts';
import { sha256 } from './util.ts';

// testHandler gives each user the email "<first 8 characters>@example.com", so ids differ early.
const OWNER = 'a1000000-0000-4000-8000-000000000001';
const OWNER2 = 'a2000000-0000-4000-8000-000000000002';
const ADMIN = 'b1000000-0000-4000-8000-000000000003';
const MANAGER = 'c1000000-0000-4000-8000-000000000004';
const EMPLOYEE = 'd1000000-0000-4000-8000-000000000005';
const NEWCOMER = 'e1000000-0000-4000-8000-000000000006';
const OTHER = 'f1000000-0000-4000-8000-000000000007';
const STAFF = 'aa000000-0000-4000-8000-000000000008';
const ORG = '7a0f5c1e-0000-4000-8000-00000000c0de';
const FRONT = '0d000000-0000-4000-8000-0000000000f1';
const SALES = '0d000000-0000-4000-8000-0000000000f2';

function setup(status: 'pilot' | 'active' = 'active', options: { now?: () => Date } = {}) {
  const db = new FakeDb({
    users: [OWNER, OWNER2, ADMIN, MANAGER, EMPLOYEE, NEWCOMER, OTHER].map((id) => ({ id, role: 'user' })).concat([{ id: STAFF, role: 'admin' }]),
    company_orgs: [{ id: ORG, name: 'Silk Road Hotels', industry: 'hospitality', size_band: '51-200', status, seats_limit: 2, tests_limit: 10, tests_used: 0, settings: { locale: 'ru', ai_daily_limit: 40 }, contract_ends_at: null }],
    company_departments: [{ id: FRONT, org_id: ORG, name: 'Front office' }, { id: SALES, org_id: ORG, name: 'Sales' }],
  });
  const member = (id: string, user: string | null, role: string, extra: Record<string, unknown> = {}) => ({
    id, org_id: ORG, user_id: user, email: user ? `${user.slice(0, 8)}@example.com` : null, full_name: `Person ${id.slice(-2)}`, role, department_id: null, job_role: 'general',
    status: 'active', seat: false, level: null, level_score: null, level_source: null, level_at: null, target_level: null, target_date: null, consent_at: null, joined_at: '2026-10-01T00:00:00Z', ...extra,
  });
  db.rows('company_members').push(
    member('90000000-0000-4000-8000-0000000000a1', OWNER, 'owner'),
    member('90000000-0000-4000-8000-0000000000a3', ADMIN, 'admin'),
    member('90000000-0000-4000-8000-0000000000a4', MANAGER, 'manager', { department_id: FRONT }),
    member('90000000-0000-4000-8000-0000000000a5', EMPLOYEE, 'employee', { department_id: FRONT }),
    member('90000000-0000-4000-8000-0000000000a6', null, 'employee', { status: 'invited', email: 'sales.rep@example.com', department_id: SALES, joined_at: null }),
  );
  const synced: string[] = [];
  db.rpcs.company_sync_english_access = ({ p_user }) => { synced.push(String(p_user)); return 'granted'; };
  return { db, synced, call: testHandler(db, [...core, ...people], options) };
}
const memberOf = (db: FakeDb, user: string) => db.rows('company_members').find((row) => row.user_id === user)!;
const tokenOf = (link: string) => link.split('/join/')[1];

Deno.test('HR invites one person: a personal link whose token is stored only as a hash', async () => {
  const { db, call } = setup();
  const invited = await call('POST', `orgs/${ORG}/invites`, { user: ADMIN, body: { kind: 'personal', full_name: 'Malika Yusupova', email: 'Malika@Example.com', role: 'employee', department_id: FRONT, job_role: 'hospitality', target_level: 'b1' } });
  assertEquals(invited.status, 200);
  assert(String(invited.body.link).startsWith('https://company.schood.online/join/'));
  const raw = tokenOf(invited.body.link);
  const stored = db.rows('company_invites').find((row) => row.id === invited.body.invite.id)!;
  assertEquals(stored.token_hash, await sha256(raw));
  assertNotEquals(stored.token_hash, raw);
  assertEquals(JSON.stringify(invited.body).includes(String(stored.token_hash)), false);
  const member = db.rows('company_members').find((row) => row.id === invited.body.member.id)!;
  assertEquals([member.status, member.email, member.target_level, member.user_id], ['invited', 'malika@example.com', 'b1', undefined]);
  assertEquals(db.rows('company_audit').at(-1)!.action, 'member.invited');
  // The same email twice is refused; employees and managers cannot invite.
  assertEquals((await call('POST', `orgs/${ORG}/invites`, { user: ADMIN, body: { full_name: 'Again', email: 'malika@example.com' } })).body.code, 'member_exists');
  assertEquals((await call('POST', `orgs/${ORG}/invites`, { user: MANAGER, body: { full_name: 'Nope Person' } })).status, 403);
  // Only owners create owners.
  assertEquals((await call('POST', `orgs/${ORG}/invites`, { user: ADMIN, body: { full_name: 'New Owner', role: 'owner' } })).body.code, 'owner_protected');
  assertEquals((await call('POST', `orgs/${ORG}/invites`, { user: OWNER, body: { full_name: 'New Owner', role: 'owner' } })).status, 200);
});

Deno.test('joining from a personal link: preview, consent, access sync, and joining twice is harmless', async () => {
  const { db, synced, call } = setup();
  const invited = await call('POST', `orgs/${ORG}/invites`, { user: OWNER, body: { full_name: 'Malika Yusupova', email: 'malika@example.com', role: 'manager', department_id: SALES } });
  const raw = tokenOf(invited.body.link);
  const preview = await call('GET', `join/${raw}`);
  assertEquals(preview.status, 200);
  assertEquals([preview.body.state, preview.body.org.name, preview.body.role, preview.body.department, preview.body.signed_in], ['open', 'Silk Road Hotels', 'manager', 'Sales', false]);
  assertEquals(preview.body.email_hint, 'm*****@example.com');
  assertEquals((await call('GET', 'join/not-a-real-token-at-all')).body.code, 'invite_not_found');
  assertEquals((await call('POST', `join/${raw}`)).status, 401);
  assertEquals((await call('POST', `join/${raw}`, { user: NEWCOMER, body: { consent: false } })).body.code, 'consent_required');
  const joined = await call('POST', `join/${raw}`, { user: NEWCOMER, body: { consent: true } });
  assertEquals(joined.status, 200);
  assertEquals([joined.body.state, joined.body.home], ['joined', `/w/${ORG}`]);
  const member = memberOf(db, NEWCOMER);
  assertEquals([member.status, member.role, member.department_id, member.email], ['active', 'manager', SALES, 'malika@example.com']);
  assert(member.consent_at);
  assertEquals(synced, [NEWCOMER]);
  assertEquals(db.rows('company_invites').find((row) => row.id === invited.body.invite.id)!.uses, 1);
  // Again: nothing changes, no extra use is counted.
  const again = await call('POST', `join/${raw}`, { user: NEWCOMER, body: { consent: true } });
  assertEquals([again.status, again.body.already], [200, true]);
  assertEquals(db.rows('company_invites').find((row) => row.id === invited.body.invite.id)!.uses, 1);
  assertEquals((await call('GET', `join/${raw}`, { user: NEWCOMER })).body.state, 'joined');
  // Somebody else with the same link: it has been used.
  assertEquals((await call('GET', `join/${raw}`, { user: OTHER })).body.state, 'used_up');
  assertEquals((await call('POST', `join/${raw}`, { user: OTHER, body: { consent: true } })).body.code, 'invite_used_up');
  assertEquals(db.rows('company_audit').filter((row) => row.action === 'member.joined').length, 1);
});

Deno.test('expired, revoked and renewed personal links', async () => {
  let clock = new Date('2026-11-01T09:00:00Z');
  const { db, call } = setup('active', { now: () => clock });
  const invited = await call('POST', `orgs/${ORG}/invites`, { user: OWNER, body: { full_name: 'Timur Sadykov' } });
  const raw = tokenOf(invited.body.link);
  clock = new Date('2026-11-20T09:00:00Z');
  assertEquals((await call('GET', `join/${raw}`)).body.state, 'expired');
  assertEquals((await call('POST', `join/${raw}`, { user: NEWCOMER, body: { consent: true } })).body.code, 'invite_expired');
  const renewed = await call('POST', `orgs/${ORG}/invites/${invited.body.invite.id}/renew`, { user: ADMIN });
  assertEquals(renewed.status, 200);
  assertEquals((await call('GET', `join/${raw}`)).body.state, 'revoked');
  const fresh = tokenOf(renewed.body.link);
  assertEquals((await call('GET', `join/${fresh}`)).body.state, 'open');
  // Revoking the new one closes it too.
  await call('POST', `orgs/${ORG}/invites/${renewed.body.invite.id}/revoke`, { user: ADMIN });
  assertEquals((await call('POST', `join/${fresh}`, { user: NEWCOMER, body: { consent: true } })).body.code, 'invite_revoked');
  assertEquals(db.rows('company_audit').map((row) => row.action).includes('invite.revoked'), true);
});

Deno.test('team links: department and job role, use limit, revoke, and an invited email joins as that person', async () => {
  const { db, call } = setup();
  const created = await call('POST', `orgs/${ORG}/invites`, { user: ADMIN, body: { kind: 'link', department_id: FRONT, job_role: 'hospitality', max_uses: 2, expires_days: 7 } });
  assertEquals(created.status, 200);
  assertEquals((await call('POST', `orgs/${ORG}/invites`, { user: ADMIN, body: { kind: 'link', role: 'admin' } })).body.code, 'invalid_field');
  const raw = tokenOf(created.body.link);
  const first = await call('POST', `join/${raw}`, { user: NEWCOMER, body: { consent: true, full_name: 'Aziza Rakhimova' } });
  assertEquals([first.status, first.body.home], [200, `/w/${ORG}/me`]);
  const joined = memberOf(db, NEWCOMER);
  assertEquals([joined.department_id, joined.job_role, joined.role, joined.full_name, joined.seat], [FRONT, 'hospitality', 'employee', 'Aziza Rakhimova', false]);
  // A person HR already invited by email binds to that row instead of making a second one.
  const invitedRow = db.rows('company_members').find((row) => row.email === 'sales.rep@example.com')!;
  invitedRow.email = `${OTHER.slice(0, 8)}@example.com`;
  await call('POST', `join/${raw}`, { user: OTHER, body: { consent: true } });
  assertEquals(memberOf(db, OTHER).id, invitedRow.id);
  assertEquals(memberOf(db, OTHER).department_id, SALES);
  // Two uses taken: the third person is turned away; the people list shows the link as used up.
  db.rows('users').push({ id: 'ab000000-0000-4000-8000-000000000009', role: 'user' });
  assertEquals((await call('POST', `join/${raw}`, { user: 'ab000000-0000-4000-8000-000000000009', body: { consent: true } })).body.code, 'invite_used_up');
  const list = await call('GET', `orgs/${ORG}/people`, { user: ADMIN });
  assertEquals(list.body.links[0].state, 'used_up');
  // Revoked links are refused.
  const second = await call('POST', `orgs/${ORG}/invites`, { user: ADMIN, body: { kind: 'link' } });
  await call('POST', `orgs/${ORG}/invites/${second.body.invite.id}/revoke`, { user: ADMIN });
  assertEquals((await call('GET', `join/${tokenOf(second.body.link)}`)).body.state, 'revoked');
});

Deno.test('a removed person who joins again keeps one membership row', async () => {
  const { db, call } = setup();
  const employeeRow = memberOf(db, EMPLOYEE);
  assertEquals((await call('DELETE', `orgs/${ORG}/people/${employeeRow.id}`, { user: ADMIN })).status, 200);
  const link = await call('POST', `orgs/${ORG}/invites`, { user: ADMIN, body: { kind: 'link', department_id: SALES } });
  await call('POST', `join/${tokenOf(link.body.link)}`, { user: EMPLOYEE, body: { consent: true } });
  const rows = db.rows('company_members').filter((row) => row.user_id === EMPLOYEE);
  assertEquals(rows.length, 1);
  assertEquals([rows[0].status, rows[0].department_id], ['active', SALES]);
});

Deno.test('learning seats: only in active workspaces, within the limit, then English access is synced', async () => {
  const pilot = setup('pilot');
  const target = memberOf(pilot.db, EMPLOYEE).id as string;
  assertEquals((await pilot.call('POST', `orgs/${ORG}/people/${target}/seat`, { user: ADMIN, body: { seat: true } })).body.code, 'seats_inactive');

  const { db, synced, call } = setup('active');
  const ids = [EMPLOYEE, MANAGER, ADMIN].map((user) => memberOf(db, user).id as string);
  const on = await call('POST', `orgs/${ORG}/people/${ids[0]}/seat`, { user: ADMIN, body: { seat: true } });
  assertEquals([on.status, on.body.member.seat, on.body.usage.seats_used], [200, true, 1]);
  assertEquals(synced, [EMPLOYEE]);
  await call('POST', `orgs/${ORG}/people/${ids[1]}/seat`, { user: ADMIN, body: { seat: true } });
  const full = await call('POST', `orgs/${ORG}/people/${ids[2]}/seat`, { user: ADMIN, body: { seat: true } });
  assertEquals([full.status, full.body.code, full.body.limit], [409, 'seats_full', 2]);
  const off = await call('POST', `orgs/${ORG}/people/${ids[0]}/seat`, { user: OWNER, body: { seat: false } });
  assertEquals([off.body.member.seat, off.body.usage.seats_used], [false, 1]);
  assertEquals(synced, [EMPLOYEE, MANAGER, EMPLOYEE]);
  assertEquals(db.rows('company_audit').filter((row) => String(row.action).startsWith('member.seat')).length, 3);
  assertEquals((await call('POST', `orgs/${ORG}/people/${ids[2]}/seat`, { user: MANAGER, body: { seat: true } })).status, 403);
  // An ended contract gives no new seats.
  db.rows('company_orgs')[0].contract_ends_at = '2020-01-01T00:00:00Z';
  assertEquals((await call('POST', `orgs/${ORG}/people/${ids[0]}/seat`, { user: ADMIN, body: { seat: true } })).body.code, 'contract_ended');
});

Deno.test('removing a person turns the seat off, revokes their links and re-syncs access', async () => {
  const { db, synced, call } = setup();
  const employeeRow = memberOf(db, EMPLOYEE);
  employeeRow.seat = true;
  const invitedRow = db.rows('company_members').find((row) => row.status === 'invited')!;
  const renewed = await call('POST', `orgs/${ORG}/invites`, { user: ADMIN, body: { full_name: 'Will Remove', email: 'will@example.com' } });
  const removed = await call('DELETE', `orgs/${ORG}/people/${employeeRow.id}`, { user: ADMIN });
  assertEquals([removed.body.member.status, removed.body.member.seat], ['removed', false]);
  assertEquals(synced, [EMPLOYEE]);
  await call('DELETE', `orgs/${ORG}/people/${renewed.body.member.id}`, { user: ADMIN });
  assertEquals((await call('GET', `join/${tokenOf(renewed.body.link)}`)).body.state, 'revoked');
  // Removed people are hidden unless asked for.
  const list = await call('GET', `orgs/${ORG}/people`, { user: ADMIN });
  assertEquals(list.body.members.some((row: { id: string }) => row.id === employeeRow.id), false);
  assertEquals((await call('GET', `orgs/${ORG}/people?removed=1`, { user: ADMIN })).body.members.some((row: { id: string }) => row.id === employeeRow.id), true);
  assertEquals(list.body.members.some((row: { id: string }) => row.id === invitedRow.id), true);
  // The removed person loses the workspace.
  assertEquals((await call('GET', `orgs/${ORG}/people`, { user: EMPLOYEE })).status, 403);
});

Deno.test('owners: admins cannot remove or demote them, and the last owner stays', async () => {
  const { db, call } = setup();
  const owner = memberOf(db, OWNER).id as string;
  assertEquals((await call('DELETE', `orgs/${ORG}/people/${owner}`, { user: ADMIN })).body.code, 'owner_protected');
  assertEquals((await call('PATCH', `orgs/${ORG}/people/${owner}`, { user: ADMIN, body: { role: 'admin' } })).body.code, 'owner_protected');
  assertEquals((await call('PATCH', `orgs/${ORG}/people/${memberOf(db, EMPLOYEE).id}`, { user: ADMIN, body: { role: 'owner' } })).body.code, 'owner_protected');
  // Admins may still fix an owner's department.
  assertEquals((await call('PATCH', `orgs/${ORG}/people/${owner}`, { user: ADMIN, body: { department_id: SALES } })).status, 200);
  assertEquals((await call('PATCH', `orgs/${ORG}/people/${owner}`, { user: OWNER, body: { role: 'admin' } })).body.code, 'last_owner');
  assertEquals((await call('DELETE', `orgs/${ORG}/people/${owner}`, { user: OWNER })).body.code, 'last_owner');
  assertEquals((await call('POST', `orgs/${ORG}/people/me/leave`, { user: OWNER })).body.code, 'last_owner');
  // With a second owner, the first may step down or leave.
  db.rows('company_members').push({ id: '90000000-0000-4000-8000-0000000000a2', org_id: ORG, user_id: OWNER2, role: 'owner', status: 'active', seat: false, job_role: 'general', department_id: null });
  assertEquals((await call('PATCH', `orgs/${ORG}/people/${owner}`, { user: OWNER2, body: { role: 'admin' } })).body.member.role, 'admin');
  assertEquals((await call('POST', `orgs/${ORG}/people/me/leave`, { user: OWNER2 })).body.code, 'last_owner');
  assertEquals((await call('POST', `orgs/${ORG}/people/me/leave`, { user: EMPLOYEE })).body.left, true);
  assertEquals(memberOf(db, EMPLOYEE).status, 'removed');
});

Deno.test('managers see their own department and cannot edit', async () => {
  const { db, call } = setup();
  const list = await call('GET', `orgs/${ORG}/people`, { user: MANAGER });
  assertEquals(list.status, 200);
  assertEquals(list.body.scope, 'department');
  assertEquals(list.body.can_edit, false);
  assertEquals(list.body.usage, null);
  assertEquals(list.body.links, []);
  assertEquals(list.body.members.map((row: { user_id: string }) => row.user_id).sort(), [MANAGER, EMPLOYEE].sort());
  assertEquals((await call('PATCH', `orgs/${ORG}/people/${memberOf(db, EMPLOYEE).id}`, { user: MANAGER, body: { job_role: 'sales' } })).status, 403);
  assertEquals((await call('GET', `orgs/${ORG}/people`, { user: EMPLOYEE })).status, 403);
  const all = await call('GET', `orgs/${ORG}/people`, { user: ADMIN });
  assertEquals([all.body.scope, all.body.members.length, all.body.usage.seats_limit], ['all', 5, 2]);
  assertEquals((await call('GET', `orgs/${ORG}/people`, { user: STAFF })).body.can_edit, true);
});

Deno.test('HR edits role, department, job role, target level and date with validation and audit', async () => {
  const { db, call } = setup();
  const employee = memberOf(db, EMPLOYEE).id as string;
  const edited = await call('PATCH', `orgs/${ORG}/people/${employee}`, { user: ADMIN, body: { role: 'manager', department_id: SALES, job_role: 'sales', target_level: 'b2', target_date: '2027-03-01' } });
  assertEquals(edited.status, 200);
  assertEquals([edited.body.member.role, edited.body.member.department_id, edited.body.member.job_role, edited.body.member.target_level, edited.body.member.target_date], ['manager', SALES, 'sales', 'b2', '2027-03-01']);
  const audit = db.rows('company_audit').at(-1)!;
  assertEquals(audit.action, 'member.updated');
  assertEquals((audit.details as Record<string, { from: unknown; to: unknown }>).role, { from: 'employee', to: 'manager' });
  assertEquals((await call('PATCH', `orgs/${ORG}/people/${employee}`, { user: ADMIN, body: { target_level: 'z9' } })).body.field, 'target_level');
  assertEquals((await call('PATCH', `orgs/${ORG}/people/${employee}`, { user: ADMIN, body: { target_date: '31.12.2026' } })).body.field, 'target_date');
  assertEquals((await call('PATCH', `orgs/${ORG}/people/${employee}`, { user: ADMIN, body: { department_id: crypto.randomUUID() } })).body.field, 'department_id');
  assertEquals((await call('PATCH', `orgs/${ORG}/people/${employee}`, { user: ADMIN, body: { email: 'x@example.com' } })).body.code, 'email_locked');
  assertEquals((await call('PATCH', `orgs/${ORG}/people/${crypto.randomUUID()}`, { user: ADMIN, body: { job_role: 'sales' } })).status, 404);
  // A suspended workspace is read-only.
  db.rows('company_orgs')[0].status = 'suspended';
  assertEquals((await call('PATCH', `orgs/${ORG}/people/${employee}`, { user: ADMIN, body: { job_role: 'general' } })).body.code, 'org_suspended');
  assertEquals((await call('GET', `orgs/${ORG}/people`, { user: ADMIN })).status, 200);
});

Deno.test('CSV import: preview with per-row problems, then people with personal links', async () => {
  const { db, call } = setup();
  const csv = [
    'ФИО;Email;Отдел;Должность;Роль',
    'Jasur Nazarov;jasur@example.com;Front office;hospitality;сотрудник',
    'Nodira Ergasheva;NODIRA@example.com;Housekeeping;;',
    'X;bad@example.com;;;',
    'Anvar Kholmatov;not-an-email;;;',
    'Olga Petrova;jasur@example.com;;;',
    'Sardor Mirzaev;sales.rep@example.com;;;',
    'Kamola Ismoilova;;Sales;astronaut;',
    '"Farrukh ""Fara"" Ahmedov";farrukh@example.com;"Sales; B2B";sales;manager',
  ].join('\r\n');
  const preview = await call('POST', `orgs/${ORG}/people/import`, { user: ADMIN, body: { csv, dry_run: true } });
  assertEquals(preview.status, 200);
  assertEquals([preview.body.total, preview.body.valid, preview.body.invalid], [8, 3, 5]);
  assertEquals(preview.body.rows.map((row: { error: string | null }) => row.error), [null, null, 'name', 'email', 'duplicate', 'exists', 'job_role', null]);
  assertEquals(preview.body.rows[7].name, 'Farrukh "Fara" Ahmedov');
  assertEquals(preview.body.new_departments, ['Housekeeping', 'Sales; B2B']);
  assertEquals(db.rows('company_members').length, 5);
  const done = await call('POST', `orgs/${ORG}/people/import`, { user: ADMIN, body: { csv, dry_run: false } });
  assertEquals(done.status, 200);
  assertEquals(done.body.created.length, 3);
  assert(done.body.created.every((row: { link: string }) => row.link.includes('/join/')));
  const nodira = db.rows('company_members').find((row) => row.email === 'nodira@example.com')!;
  assertEquals(nodira.status, 'invited');
  assertEquals(db.rows('company_departments').find((row) => row.id === nodira.department_id)!.name, 'Housekeeping');
  assertEquals(db.rows('company_members').find((row) => row.email === 'farrukh@example.com')!.role, 'manager');
  assertEquals((await call('GET', `join/${tokenOf(done.body.created[0].link)}`)).body.state, 'open');
  assertEquals(db.rows('company_audit').at(-1)!.action, 'member.imported');
  // Importing the same file again finds everyone already there.
  const again = await call('POST', `orgs/${ORG}/people/import`, { user: ADMIN, body: { csv, dry_run: false } });
  assertEquals(again.body.code, 'import_empty');
  assertEquals((await call('POST', `orgs/${ORG}/people/import`, { user: MANAGER, body: { csv } })).status, 403);
});

Deno.test('CSV parsing: commas, tabs, quotes, BOM and no header', () => {
  assertEquals(parseCsv('﻿name,email\n"A, B",a@b.co\n\n'), [['name', 'email'], ['A, B', 'a@b.co']]);
  assertEquals(parseCsv('a\tb\tc\n1\t2\t3'), [['a', 'b', 'c'], ['1', '2', '3']]);
  const { rows, header } = readImport('Ali Valiyev,ali@example.com,Finance,banking,admin\n', new Set());
  assertEquals(header, false);
  assertEquals([rows[0].name, rows[0].department, rows[0].job_role, rows[0].role, rows[0].error], ['Ali Valiyev', 'Finance', 'banking_finance', 'admin', null]);
  assertEquals(readImport("Ism;Bo'lim\nZarina Usmonova;Savdo", new Set()).rows[0].department, 'Savdo');
  assertEquals(maskEmail('dilnoza@silkroad.uz'), 'd*****@silkroad.uz');
});

Deno.test('departments: create several, refuse duplicates, rename, delete moves people to no department', async () => {
  const { db, call } = setup();
  const many = await call('POST', `orgs/${ORG}/departments`, { user: ADMIN, body: { names: ['Housekeeping', 'sales', 'Restaurant  &  bar'] } });
  assertEquals([many.body.departments.length, many.body.skipped], [2, 1]);
  assertEquals(many.body.departments[1].name, 'Restaurant & bar');
  assertEquals((await call('POST', `orgs/${ORG}/departments`, { user: ADMIN, body: { name: ' front OFFICE ' } })).body.code, 'department_exists');
  assertEquals((await call('PATCH', `orgs/${ORG}/departments/${SALES}`, { user: ADMIN, body: { name: 'Housekeeping' } })).body.code, 'department_exists');
  assertEquals((await call('PATCH', `orgs/${ORG}/departments/${SALES}`, { user: ADMIN, body: { name: 'Sales and events' } })).body.department.name, 'Sales and events');
  const counted = await call('GET', `orgs/${ORG}/departments`, { user: MANAGER });
  const front = counted.body.departments.find((row: { id: string }) => row.id === FRONT);
  assertEquals([front.people, counted.body.unassigned.people], [2, 2]);
  const deleted = await call('DELETE', `orgs/${ORG}/departments/${FRONT}`, { user: OWNER });
  assertEquals(deleted.body.moved, 2);
  assertEquals(memberOf(db, EMPLOYEE).department_id, null);
  assertEquals(db.rows('company_departments').some((row) => row.id === FRONT), false);
  assertEquals((await call('POST', `orgs/${ORG}/departments`, { user: MANAGER, body: { name: 'Mine' } })).status, 403);
  assertEquals(db.rows('company_audit').filter((row) => String(row.action).startsWith('department.')).map((row) => row.action), ['department.created', 'department.created', 'department.renamed', 'department.deleted']);
});

Deno.test('settings: profile and default language for HR; plan fields stay with Schood', async () => {
  const { db, call } = setup();
  const read = await call('GET', `orgs/${ORG}/settings`, { user: ADMIN });
  assertEquals(read.status, 200);
  assertEquals(read.body.admins.map((row: { role: string }) => row.role), ['admin', 'owner']);
  assertEquals(read.body.usage.seats_limit, 2);
  const saved = await call('PATCH', `orgs/${ORG}/settings`, { user: ADMIN, body: { name: 'Silk Road Hotels Group', locale: 'uz', billing_email: 'Finance@SilkRoad.uz', tax_id: '301234567', seats_limit: 999, status: 'active' } });
  assertEquals(saved.status, 200);
  const org = db.rows('company_orgs')[0];
  assertEquals([org.name, org.billing_email, org.tax_id, org.seats_limit], ['Silk Road Hotels Group', 'finance@silkroad.uz', '301234567', 2]);
  assertEquals(org.settings, { locale: 'uz', ai_daily_limit: 40 });
  assertEquals((await call('PATCH', `orgs/${ORG}/settings`, { user: ADMIN, body: { locale: 'de' } })).body.field, 'locale');
  assertEquals((await call('GET', `orgs/${ORG}/settings`, { user: MANAGER })).status, 403);
  assertEquals(db.rows('company_audit').at(-1)!.action, 'settings.updated');
});
