import { assert, assertEquals, assertNotEquals } from 'jsr:@std/assert@1';
import { routes as core } from './core.ts';
import { routes as people } from './people.ts';
import { parseCsv, readImport } from './people/csv.ts';
import { routes as hiring } from './hiring.ts';
import { CERTIFICATE_CHECKS_PER_HOUR } from './hiring/public.ts';
import { JOIN_VIEWS_PER_HOUR, maskEmail } from './people/join.ts';
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
  // The row shows the account that joined; the audit log keeps the address HR invited.
  assertEquals([member.status, member.role, member.department_id, member.email], ['active', 'manager', SALES, 'e1000000@example.com']);
  assertEquals((db.rows('company_audit').at(-1)!.details as Record<string, unknown>).invited_email, 'malika@example.com');
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
  employeeRow.removed_at = '2026-01-01T00:00:00Z';
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
  // An ended contract gives no new seats: HR is stopped at the door like any other change, staff by the route.
  db.rows('company_orgs')[0].contract_ends_at = '2020-01-01T00:00:00Z';
  const ended = await call('POST', `orgs/${ORG}/people/${ids[0]}/seat`, { user: ADMIN, body: { seat: true } });
  assertEquals([ended.status, ended.body.code], [403, 'contract_ended']);
  const forStaff = await call('POST', `orgs/${ORG}/people/${ids[0]}/seat`, { user: STAFF, body: { seat: true } });
  assertEquals([forStaff.status, forStaff.body.code], [409, 'seats_contract_ended']);
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
  // Headcounts of every department are for HR; a manager sees their own in People.
  assertEquals((await call('GET', `orgs/${ORG}/departments`, { user: MANAGER })).status, 403);
  const counted = await call('GET', `orgs/${ORG}/departments`, { user: ADMIN });
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

/** Runs `act` as each company_invites query starts; the first query of a join finds the link, the second claims it. */
function onInviteQuery(db: FakeDb, act: (query: number) => void) {
  const from = db.from.bind(db);
  let query = 0;
  db.from = (table: string) => {
    if (table === 'company_invites') act(++query);
    return from(table);
  };
}
const inviteRow = (db: FakeDb, id: string) => db.rows('company_invites').find((row) => row.id === id)!;
/** No two people still in the workspace share an address (company_members_email_key, which FakeDb does not enforce). */
function assertEmailsUnique(db: FakeDb) {
  const live = db.rows('company_members').filter((row) => row.status !== 'removed' && row.email).map((row) => String(row.email).toLowerCase());
  assertEquals(live.length, new Set(live).size);
}

Deno.test('an admin cannot rewrite a pending owner\'s email, so a team link cannot make someone owner', async () => {
  const { db, call } = setup();
  const pending = (await call('POST', `orgs/${ORG}/invites`, { user: OWNER, body: { full_name: 'Next Owner', email: 'next.owner@example.com', role: 'owner' } })).body.member;
  const row = db.rows('company_members').find((candidate) => candidate.id === pending.id)!;
  const attacker = `${OTHER.slice(0, 8)}@example.com`;
  // Rewriting or clearing the address is refused; the row keeps it.
  const rewrite = await call('PATCH', `orgs/${ORG}/people/${pending.id}`, { user: ADMIN, body: { email: attacker } });
  assertEquals([rewrite.status, rewrite.body.code], [403, 'owner_protected']);
  assertEquals((await call('PATCH', `orgs/${ORG}/people/${pending.id}`, { user: ADMIN, body: { email: null } })).body.code, 'owner_protected');
  assertEquals((await call('PATCH', `orgs/${ORG}/people/${pending.id}`, { user: ADMIN, body: { email: '' } })).body.code, 'owner_protected');
  assertEquals(row.email, 'next.owner@example.com');
  // Saving the form unchanged, or fixing other fields, still works for an admin.
  assertEquals((await call('PATCH', `orgs/${ORG}/people/${pending.id}`, { user: ADMIN, body: { email: 'Next.Owner@example.com', department_id: SALES, full_name: 'Next Owner Jr' } })).status, 200);
  assertEquals([row.email, row.department_id, row.full_name], ['next.owner@example.com', SALES, 'Next Owner Jr']);
  // The attack goes nowhere: the second account joins the team link as an ordinary employee.
  const link = await call('POST', `orgs/${ORG}/invites`, { user: ADMIN, body: { kind: 'link' } });
  assertEquals((await call('POST', `join/${tokenOf(link.body.link)}`, { user: OTHER, body: { consent: true } })).status, 200);
  assertEquals(memberOf(db, OTHER).role, 'employee');
  assertEquals([row.status, row.role, row.user_id ?? null], ['invited', 'owner', null]);
  // Admins may still correct the email of other invited people; owners and staff may correct an owner's.
  const invitedAdmin = (await call('POST', `orgs/${ORG}/invites`, { user: ADMIN, body: { full_name: 'New Admin', email: 'typo@example.com', role: 'admin' } })).body.member;
  assertEquals((await call('PATCH', `orgs/${ORG}/people/${invitedAdmin.id}`, { user: ADMIN, body: { email: 'fixed@example.com' } })).body.member.email, 'fixed@example.com');
  assertEquals((await call('PATCH', `orgs/${ORG}/people/${pending.id}`, { user: OWNER, body: { email: 'owner.two@example.com' } })).body.member.email, 'owner.two@example.com');
  assertEquals((await call('PATCH', `orgs/${ORG}/people/${pending.id}`, { user: STAFF, body: { email: 'owner.three@example.com' } })).body.member.email, 'owner.three@example.com');
});

Deno.test('a team link from before a removal does not bring the person back; a newer link does', async () => {
  const { db, synced, call } = setup();
  const old = await call('POST', `orgs/${ORG}/invites`, { user: ADMIN, body: { kind: 'link', role: 'manager', department_id: SALES } });
  const raw = tokenOf(old.body.link);
  const employeeRow = memberOf(db, EMPLOYEE);
  await call('DELETE', `orgs/${ORG}/people/${employeeRow.id}`, { user: ADMIN });
  synced.length = 0;
  // The preview and the join agree, and no use of the link is burned.
  assertEquals((await call('GET', `join/${raw}`, { user: EMPLOYEE })).body.state, 'revoked');
  const refused = await call('POST', `join/${raw}`, { user: EMPLOYEE, body: { consent: true } });
  assertEquals([refused.status, refused.body.code], [410, 'invite_revoked']);
  assertEquals([employeeRow.status, employeeRow.role, inviteRow(db, old.body.invite.id).uses, synced.length], ['removed', 'employee', 0, 0]);
  assertEquals((await call('GET', `orgs/${ORG}/people`, { user: EMPLOYEE })).status, 403);
  // Someone who left on their own needs a newer link too.
  await call('POST', `orgs/${ORG}/people/me/leave`, { user: MANAGER });
  assertEquals((await call('POST', `join/${raw}`, { user: MANAGER, body: { consent: true } })).body.code, 'invite_revoked');
  // The link still works for everybody else, and for anyone not signed in it looks open.
  assertEquals((await call('GET', `join/${raw}`)).body.state, 'open');
  assertEquals((await call('POST', `join/${raw}`, { user: NEWCOMER, body: { consent: true } })).status, 200);
  // A link HR makes after the removal is a decision to let them back in.
  employeeRow.removed_at = '2026-01-01T00:00:00Z';
  const newer = await call('POST', `orgs/${ORG}/invites`, { user: ADMIN, body: { kind: 'link', department_id: SALES } });
  assertEquals((await call('POST', `join/${tokenOf(newer.body.link)}`, { user: EMPLOYEE, body: { consent: true } })).status, 200);
  assertEquals(employeeRow.status, 'active');
});

Deno.test('joining at the same moment as someone else retries instead of saying the link was used', async () => {
  // Another join takes a use between reading the link and claiming it: the unlimited link still works.
  const unlimited = setup();
  const open = await unlimited.call('POST', `orgs/${ORG}/invites`, { user: ADMIN, body: { kind: 'link', department_id: FRONT } });
  const row = inviteRow(unlimited.db, open.body.invite.id);
  onInviteQuery(unlimited.db, (query) => { if (query === 2) (row.uses as number)++; });
  const won = await unlimited.call('POST', `join/${tokenOf(open.body.link)}`, { user: NEWCOMER, body: { consent: true } });
  assertEquals([won.status, memberOf(unlimited.db, NEWCOMER).status, row.uses], [200, 'active', 2]);

  // That join took the last use: now the link really is used up, and nobody joined.
  const capped = setup();
  const last = await capped.call('POST', `orgs/${ORG}/invites`, { user: ADMIN, body: { kind: 'link', max_uses: 1 } });
  const lastRow = inviteRow(capped.db, last.body.invite.id);
  onInviteQuery(capped.db, (query) => { if (query === 2) (lastRow.uses as number)++; });
  const usedUp = await capped.call('POST', `join/${tokenOf(last.body.link)}`, { user: NEWCOMER, body: { consent: true } });
  assertEquals([usedUp.status, usedUp.body.code, lastRow.uses], [410, 'invite_used_up', 1]);
  assertEquals(capped.db.rows('company_members').some((candidate) => candidate.user_id === NEWCOMER), false);

  // HR revoked it in that moment: the person is told so.
  const revoked = setup();
  const pulled = await revoked.call('POST', `orgs/${ORG}/invites`, { user: ADMIN, body: { kind: 'link' } });
  const pulledRow = inviteRow(revoked.db, pulled.body.invite.id);
  onInviteQuery(revoked.db, (query) => { if (query === 2) pulledRow.revoked_at = '2026-11-01T00:00:00Z'; });
  assertEquals((await revoked.call('POST', `join/${tokenOf(pulled.body.link)}`, { user: NEWCOMER, body: { consent: true } })).body.code, 'invite_revoked');

  // A race lost on every try says "try again", not "used up", and burns nothing for this person.
  const busy = setup();
  const crowded = await busy.call('POST', `orgs/${ORG}/invites`, { user: ADMIN, body: { kind: 'link' } });
  const crowdedRow = inviteRow(busy.db, crowded.body.invite.id);
  onInviteQuery(busy.db, (query) => { if (query % 2 === 0) (crowdedRow.uses as number)++; });
  const tooBusy = await busy.call('POST', `join/${tokenOf(crowded.body.link)}`, { user: NEWCOMER, body: { consent: true } });
  assertEquals([tooBusy.status, tooBusy.body.code], [409, 'invite_busy']);

  // Several people really joining at once all get in, and every use is counted.
  const crowd = setup();
  const shared = await crowd.call('POST', `orgs/${ORG}/invites`, { user: ADMIN, body: { kind: 'link', department_id: FRONT } });
  const joins = await Promise.all([NEWCOMER, OTHER, OWNER2].map((user) => crowd.call('POST', `join/${tokenOf(shared.body.link)}`, { user, body: { consent: true } })));
  assertEquals(joins.map((result) => result.status), [200, 200, 200]);
  assertEquals(inviteRow(crowd.db, shared.body.invite.id).uses, 3);
});

Deno.test('a personal link accepted from another account shows that account\'s email', async () => {
  const { db, call } = setup();
  const invited = await call('POST', `orgs/${ORG}/invites`, { user: OWNER, body: { full_name: 'Boss', email: 'boss@corp.example', role: 'admin' } });
  assertEquals((await call('POST', `join/${tokenOf(invited.body.link)}`, { user: NEWCOMER, body: { consent: true } })).status, 200);
  assertEquals(memberOf(db, NEWCOMER).email, 'e1000000@example.com');
  const joined = db.rows('company_audit').at(-1)!;
  assertEquals([joined.action, (joined.details as Record<string, unknown>).invited_email], ['member.joined', 'boss@corp.example']);
  // The address is free again for the person it belongs to.
  assertEquals((await call('POST', `orgs/${ORG}/invites`, { user: OWNER, body: { full_name: 'Boss', email: 'boss@corp.example' } })).status, 200);

  // The same address as the account: nothing to report.
  const same = await call('POST', `orgs/${ORG}/invites`, { user: OWNER, body: { full_name: 'Exact Match', email: `${OTHER.slice(0, 8)}@example.com` } });
  await call('POST', `join/${tokenOf(same.body.link)}`, { user: OTHER, body: { consent: true } });
  assertEquals((db.rows('company_audit').at(-1)!.details as Record<string, unknown>).invited_email, undefined);

  // No email on the invitation: the account fills it in.
  const blank = await call('POST', `orgs/${ORG}/invites`, { user: OWNER, body: { full_name: 'No Email' } });
  await call('POST', `join/${tokenOf(blank.body.link)}`, { user: OWNER2, body: { consent: true } });
  assertEquals(memberOf(db, OWNER2).email, 'a2000000@example.com');

  // The account's address already belongs to someone else in the workspace: keep the invited one.
  db.rows('users').push({ id: 'ab000000-0000-4000-8000-000000000009', role: 'user' });
  await call('POST', `orgs/${ORG}/invites`, { user: OWNER, body: { full_name: 'Holder', email: 'ab000000@example.com' } });
  const taken = await call('POST', `orgs/${ORG}/invites`, { user: OWNER, body: { full_name: 'Second', email: 'second@example.com' } });
  await call('POST', `join/${tokenOf(taken.body.link)}`, { user: 'ab000000-0000-4000-8000-000000000009', body: { consent: true } });
  assertEquals(memberOf(db, 'ab000000-0000-4000-8000-000000000009').email, 'second@example.com');
  assertEmailsUnique(db);
});

Deno.test('a team link never gives more than its own role, even to a matching pending row', async () => {
  const { db, call } = setup();
  const oldRow = memberOf(db, EMPLOYEE);
  const address = String(oldRow.email);
  await call('DELETE', `orgs/${ORG}/people/${oldRow.id}`, { user: ADMIN });
  oldRow.removed_at = '2026-01-01T00:00:00Z';
  const again = await call('POST', `orgs/${ORG}/invites`, { user: ADMIN, body: { full_name: 'Back Again', email: address, role: 'manager' } });
  const link = await call('POST', `orgs/${ORG}/invites`, { user: ADMIN, body: { kind: 'link', department_id: FRONT } });
  const joined = await call('POST', `join/${tokenOf(link.body.link)}`, { user: EMPLOYEE, body: { consent: true } });
  assertEquals([joined.status, joined.body.code], [409, 'personal_link_needed']);
  assertEquals(inviteRow(db, link.body.invite.id).uses, 0);
  assertEquals(db.rows('company_members').find((row) => row.id === again.body.member.id)!.status, 'invited');
});

Deno.test('a removed person HR invited again can join by a newer team link or the personal link, in their old row', async () => {
  // Team link: HR's new row steps aside, its settings move to the old row, and no use is lost to an error.
  const team = setup();
  const oldRow = memberOf(team.db, EMPLOYEE);
  const address = String(oldRow.email);
  await team.call('DELETE', `orgs/${ORG}/people/${oldRow.id}`, { user: ADMIN });
  oldRow.removed_at = '2026-01-01T00:00:00Z';
  const again = await team.call('POST', `orgs/${ORG}/invites`, { user: ADMIN, body: { full_name: 'Back Again', email: address, role: 'employee', department_id: SALES, job_role: 'sales', target_level: 'b1' } });
  const link = await team.call('POST', `orgs/${ORG}/invites`, { user: ADMIN, body: { kind: 'link', department_id: FRONT } });
  const joined = await team.call('POST', `join/${tokenOf(link.body.link)}`, { user: EMPLOYEE, body: { consent: true } });
  assertEquals([joined.status, joined.body.role], [200, 'employee']);
  assertEmailsUnique(team.db);
  const prepared = team.db.rows('company_members').find((row) => row.id === again.body.member.id)!;
  assertEquals([prepared.status, prepared.seat], ['removed', false]);
  assertEquals(team.db.rows('company_members').filter((row) => row.user_id === EMPLOYEE).length, 1);
  assertEquals([oldRow.status, oldRow.role, oldRow.department_id, oldRow.job_role, oldRow.target_level, oldRow.email, oldRow.removed_at], ['active', 'employee', SALES, 'sales', 'b1', address, null]);
  assert(inviteRow(team.db, again.body.invite.id).revoked_at);
  assertEquals(inviteRow(team.db, link.body.invite.id).uses, 1);

  // Personal link: the same outcome.
  const personal = setup();
  const row = memberOf(personal.db, EMPLOYEE);
  await personal.call('DELETE', `orgs/${ORG}/people/${row.id}`, { user: ADMIN });
  const invited = await personal.call('POST', `orgs/${ORG}/invites`, { user: ADMIN, body: { full_name: 'Back Again', email: String(row.email), role: 'manager', department_id: SALES } });
  assertEquals((await personal.call('POST', `join/${tokenOf(invited.body.link)}`, { user: EMPLOYEE, body: { consent: true } })).status, 200);
  assertEmailsUnique(personal.db);
  assertEquals([row.status, row.role, row.department_id], ['active', 'manager', SALES]);

  // Their old address now belongs to somebody else's invitation: the row takes the account's address.
  const moved = setup();
  const movedRow = memberOf(moved.db, EMPLOYEE);
  await moved.call('DELETE', `orgs/${ORG}/people/${movedRow.id}`, { user: ADMIN });
  movedRow.removed_at = '2026-01-01T00:00:00Z';
  movedRow.email = 'old.address@example.com';
  await moved.call('POST', `orgs/${ORG}/invites`, { user: ADMIN, body: { full_name: 'New Hire', email: 'old.address@example.com' } });
  const movedLink = await moved.call('POST', `orgs/${ORG}/invites`, { user: ADMIN, body: { kind: 'link' } });
  assertEquals((await moved.call('POST', `join/${tokenOf(movedLink.body.link)}`, { user: EMPLOYEE, body: { consent: true } })).status, 200);
  assertEquals(movedRow.email, 'd1000000@example.com');
  assertEmailsUnique(moved.db);

  // Both addresses are held by others: the row goes without one rather than failing.
  const none = setup();
  const noneRow = memberOf(none.db, EMPLOYEE);
  await none.call('DELETE', `orgs/${ORG}/people/${noneRow.id}`, { user: ADMIN });
  noneRow.removed_at = '2026-01-01T00:00:00Z';
  noneRow.email = 'old.address@example.com';
  await none.call('POST', `orgs/${ORG}/invites`, { user: ADMIN, body: { full_name: 'New Hire', email: 'old.address@example.com' } });
  none.db.rows('company_members').push({ id: crypto.randomUUID(), org_id: ORG, user_id: OTHER, email: 'd1000000@example.com', role: 'employee', status: 'active', seat: false, job_role: 'general', department_id: null });
  const noneLink = await none.call('POST', `orgs/${ORG}/invites`, { user: ADMIN, body: { kind: 'link' } });
  assertEquals((await none.call('POST', `join/${tokenOf(noneLink.body.link)}`, { user: EMPLOYEE, body: { consent: true } })).status, 200);
  assertEquals(noneRow.email, null);
  assertEmailsUnique(none.db);
});

Deno.test('an admin cannot withdraw a pending owner\'s invitation', async () => {
  const { db, call } = setup();
  const owner = await call('POST', `orgs/${ORG}/invites`, { user: OWNER, body: { full_name: 'Next Owner', role: 'owner' } });
  const refused = await call('POST', `orgs/${ORG}/invites/${owner.body.invite.id}/revoke`, { user: ADMIN });
  assertEquals([refused.status, refused.body.code], [403, 'owner_protected']);
  assertEquals(inviteRow(db, owner.body.invite.id).revoked_at, null);
  assertEquals((await call('GET', `join/${tokenOf(owner.body.link)}`)).body.state, 'open');
  // Admins still withdraw everyone else's; an owner or staff can withdraw an owner's.
  const staffer = await call('POST', `orgs/${ORG}/invites`, { user: ADMIN, body: { full_name: 'Someone Else' } });
  assertEquals((await call('POST', `orgs/${ORG}/invites/${staffer.body.invite.id}/revoke`, { user: ADMIN })).status, 200);
  const link = await call('POST', `orgs/${ORG}/invites`, { user: ADMIN, body: { kind: 'link' } });
  assertEquals((await call('POST', `orgs/${ORG}/invites/${link.body.invite.id}/revoke`, { user: ADMIN })).status, 200);
  assertEquals((await call('POST', `orgs/${ORG}/invites/${owner.body.invite.id}/revoke`, { user: OWNER })).status, 200);
});

Deno.test('staff can demote an invited owner in a workspace with no active owner', async () => {
  const { db, call } = setup();
  const pending = (await call('POST', `orgs/${ORG}/invites`, { user: STAFF, body: { full_name: 'Next Owner', role: 'owner' } })).body.member;
  memberOf(db, OWNER).status = 'removed';
  const demoted = await call('PATCH', `orgs/${ORG}/people/${pending.id}`, { user: STAFF, body: { role: 'admin' } });
  assertEquals([demoted.status, demoted.body.member?.role], [200, 'admin']);
  assertEquals(db.rows('company_members').find((row) => row.id === pending.id)!.role, 'admin');
});

Deno.test('two accepts of a team link at once make one member and use one use', async () => {
  const { db, call } = setup();
  db.uniques.company_members = [{ columns: ['org_id', 'user_id'] }];
  const link = await call('POST', `orgs/${ORG}/invites`, { user: OWNER, body: { kind: 'link', max_uses: 5 } });
  const token = tokenOf(link.body.link);
  const [one, two] = await Promise.all([
    call('POST', `join/${token}`, { user: NEWCOMER, body: { consent: true } }),
    call('POST', `join/${token}`, { user: NEWCOMER, body: { consent: true } }),
  ]);
  assertEquals([one.status, two.status, one.body.state, two.body.state], [200, 200, 'joined', 'joined']);
  assertEquals(db.rows('company_members').filter((row) => row.user_id === NEWCOMER).length, 1);
  assertEquals(inviteRow(db, link.body.invite.id).uses, 1);
});

Deno.test('two accepts of the last use both end joined; a stranger then finds it used up', async () => {
  const { db, call } = setup();
  db.uniques.company_members = [{ columns: ['org_id', 'user_id'] }];
  const link = await call('POST', `orgs/${ORG}/invites`, { user: OWNER, body: { kind: 'link', max_uses: 1 } });
  const token = tokenOf(link.body.link);
  const [one, two] = await Promise.all([
    call('POST', `join/${token}`, { user: NEWCOMER, body: { consent: true } }),
    call('POST', `join/${token}`, { user: NEWCOMER, body: { consent: true } }),
  ]);
  assertEquals([one.status, two.status], [200, 200]);
  assertEquals(inviteRow(db, link.body.invite.id).uses, 1);
  const stranger = await call('POST', `join/${token}`, { user: OTHER, body: { consent: true } });
  assertEquals([stranger.status, stranger.body.code], [410, 'invite_used_up']);
});

Deno.test('after the contract ends nobody joins; the preview says so and members still see they joined', async () => {
  const now = new Date('2026-10-30T09:00:00Z');
  const { db, call } = setup('active', { now: () => now });
  const link = await call('POST', `orgs/${ORG}/invites`, { user: OWNER, body: { kind: 'link' } });
  const token = tokenOf(link.body.link);
  db.rows('company_orgs')[0].contract_ends_at = '2026-10-29T00:00:00Z';
  assertEquals((await call('GET', `join/${token}`)).body.state, 'ended');
  const refused = await call('POST', `join/${token}`, { user: NEWCOMER, body: { consent: true } });
  assertEquals([refused.status, refused.body.code], [403, 'contract_ended']);
  assertEquals(inviteRow(db, link.body.invite.id).uses, 0);
  assertEquals((await call('GET', `join/${token}`, { user: EMPLOYEE })).body.state, 'joined');
});

Deno.test('department names collapse inner spaces and races answer 409, not 500', async () => {
  const { db, call } = setup();
  db.uniques.company_departments = [{ columns: ['org_id', 'name'] }];
  db.uniques.company_members = [{ columns: ['org_id', 'email'], where: (row) => row.status !== 'removed' }];
  const created = await call('POST', `orgs/${ORG}/departments`, { user: OWNER, body: { names: ['Night  Shift', 'night shift'] } });
  assertEquals([created.status, created.body.skipped, created.body.departments[0].name], [200, 1, 'Night Shift']);
  const dup = await call('POST', `orgs/${ORG}/departments`, { user: OWNER, body: { name: 'NIGHT   shift' } });
  assertEquals([dup.status, dup.body.code], [409, 'department_exists']);
  const race = await Promise.all([1, 2].map(() => call('POST', `orgs/${ORG}/departments`, { user: OWNER, body: { name: 'Racing' } })));
  assertEquals(race.map((row) => row.status).sort(), [200, 409]);
  assertEquals(race.find((row) => row.status === 409)!.body.code, 'department_exists');
  const invites = await Promise.all([1, 2].map(() => call('POST', `orgs/${ORG}/invites`, { user: OWNER, body: { full_name: 'Same Person', email: 'same@example.com' } })));
  assertEquals(invites.map((row) => row.status).sort(), [200, 409]);
  assertEquals(invites.find((row) => row.status === 409)!.body.code, 'member_exists');
});

Deno.test('dates, text and lists that Postgres would refuse are a 400', async () => {
  const { db, call } = setup();
  const member = memberOf(db, EMPLOYEE).id;
  for (const target_date of ['2030-02-31', '2030-13-01', '0000-01-01', '9999-12-31', 20300101]) {
    const refused = await call('PATCH', `orgs/${ORG}/people/${member}`, { user: OWNER, body: { target_date } });
    assertEquals([refused.status, refused.body.field], [400, 'target_date'], String(target_date));
  }
  assertEquals((await call('PATCH', `orgs/${ORG}/people/${member}`, { user: OWNER, body: { target_date: '2030-02-28' } })).status, 200);
  for (const name of ['A\u0000B', 'Lone \ud83d surrogate']) {
    const refused = await call('POST', `orgs/${ORG}/departments`, { user: OWNER, body: { name } });
    assertEquals([refused.status, refused.body.field], [400, 'name'], name);
  }
  const role = await call('PATCH', `orgs/${ORG}/settings`, { user: OWNER, body: { locale: ['en'] } });
  assertEquals([role.status, role.body.field], [400, 'locale']);
});

const inviteOf = (db: FakeDb, id: string) => db.rows('company_invites').find((row) => row.id === id)!;
const seatMember = (db: FakeDb, user: string) => { memberOf(db, user).seat = true; return memberOf(db, user).id as string; };
const failSync = (db: FakeDb) => { db.rpcs.company_sync_english_access = () => { throw new Error('outage'); }; };

Deno.test('raising a pending role stops the link already sent, and whoever raised it can send a new one', async () => {
  const { db, call } = setup();
  const invited = await call('POST', `orgs/${ORG}/invites`, { user: ADMIN, body: { full_name: 'Held Link', email: 'held@example.com', role: 'employee' } });
  const held = tokenOf(invited.body.link);
  const raised = await call('PATCH', `orgs/${ORG}/people/${invited.body.member.id}`, { user: OWNER, body: { role: 'owner' } });
  assertEquals([raised.status, raised.body.link_revoked, raised.body.member.role], [200, true, 'owner']);
  assert(inviteOf(db, invited.body.invite.id).revoked_at, 'old invite revoked');
  assertEquals((db.rows('company_audit').at(-1)!.details as Record<string, unknown>).link_revoked, true);
  // The admin who kept that link cannot become owner with a second account.
  const refused = await call('POST', `join/${held}`, { user: NEWCOMER, body: { consent: true } });
  assertEquals([refused.status, refused.body.code], [410, 'invite_revoked']);
  const row = db.rows('company_members').find((entry) => entry.id === invited.body.member.id)!;
  assertEquals([row.status, row.user_id ?? null], ['invited', null]);
  // The list offers a new link: the withdrawn one can be renewed.
  const list = await call('GET', `orgs/${ORG}/people`, { user: OWNER });
  const listed = list.body.members.find((entry: { id: string }) => entry.id === invited.body.member.id);
  assertEquals([listed.invite.id, listed.invite.state], [invited.body.invite.id, 'revoked']);
  // An admin may not renew an owner's link; the owner and staff may, and that link makes them owner.
  assertEquals((await call('POST', `orgs/${ORG}/invites/${invited.body.invite.id}/renew`, { user: ADMIN })).body.code, 'owner_protected');
  const renewed = await call('POST', `orgs/${ORG}/invites/${invited.body.invite.id}/renew`, { user: STAFF });
  assertEquals(renewed.status, 200);
  const fresh = await call('POST', `orgs/${ORG}/invites/${renewed.body.invite.id}/renew`, { user: OWNER });
  assertEquals(fresh.status, 200);
  const listedAgain = (await call('GET', `orgs/${ORG}/people`, { user: OWNER })).body.members.find((entry: { id: string }) => entry.id === invited.body.member.id);
  assertEquals([listedAgain.invite.id, listedAgain.invite.state], [fresh.body.invite.id, 'open']);
  assertEquals((await call('POST', `join/${tokenOf(renewed.body.link)}`, { user: NEWCOMER, body: { consent: true } })).body.code, 'invite_revoked');
  const joined = await call('POST', `join/${tokenOf(fresh.body.link)}`, { user: NEWCOMER, body: { consent: true } });
  assertEquals([joined.status, joined.body.role], [200, 'owner']);
});

Deno.test('any raise of a pending role stops the link; a demotion and other edits leave it alone', async () => {
  const { db, call } = setup();
  const invited = await call('POST', `orgs/${ORG}/invites`, { user: ADMIN, body: { full_name: 'Step By Step', email: 'steps@example.com', role: 'manager' } });
  const id = invited.body.member.id, held = tokenOf(invited.body.link);
  // Down, and sideways edits: the link lives and its placeholder follows.
  const down = await call('PATCH', `orgs/${ORG}/people/${id}`, { user: ADMIN, body: { role: 'employee', full_name: 'Step Two', job_role: 'sales', department_id: SALES } });
  assertEquals([down.status, down.body.link_revoked], [200, undefined]);
  assertEquals([inviteOf(db, invited.body.invite.id).revoked_at, inviteOf(db, invited.body.invite.id).role], [null, 'employee']);
  assertEquals((await call('GET', `join/${held}`)).body.state, 'open');
  // Up: employee to manager is a raise, by an admin too, and the admin can renew.
  const up = await call('PATCH', `orgs/${ORG}/people/${id}`, { user: ADMIN, body: { role: 'manager' } });
  assertEquals([up.status, up.body.link_revoked], [200, true]);
  assertEquals((await call('GET', `join/${held}`)).body.state, 'revoked');
  const renewed = await call('POST', `orgs/${ORG}/invites/${invited.body.invite.id}/renew`, { user: ADMIN });
  assertEquals([renewed.status, renewed.body.invite.role], [200, 'manager']);
  assertEquals((await call('GET', `join/${tokenOf(renewed.body.link)}`)).body.state, 'open');
  // A joined person's role change has no link to stop.
  const employeeRow = memberOf(db, EMPLOYEE);
  const promoted = await call('PATCH', `orgs/${ORG}/people/${employeeRow.id}`, { user: ADMIN, body: { role: 'manager' } });
  assertEquals([promoted.status, promoted.body.link_revoked], [200, undefined]);
});

Deno.test('correcting a pending email stops the old link; saving the same email does not', async () => {
  const { db, call } = setup();
  const invited = await call('POST', `orgs/${ORG}/invites`, { user: OWNER, body: { full_name: 'Wrong Person', email: 'wrong.person@example.com', role: 'admin' } });
  const id = invited.body.member.id, held = tokenOf(invited.body.link);
  // The form saved unchanged: same address, in any case, and no address at all left out.
  for (const body of [{ email: 'wrong.person@example.com' }, { email: 'WRONG.person@example.com' }, { full_name: 'Wrong Person', job_role: 'general' }]) {
    const same = await call('PATCH', `orgs/${ORG}/people/${id}`, { user: OWNER, body });
    assertEquals([same.status, same.body.link_revoked], [200, undefined], JSON.stringify(body));
    assertEquals(inviteOf(db, invited.body.invite.id).revoked_at, null, 'the link stays');
  }
  assertEquals((await call('GET', `join/${held}`)).body.state, 'open');
  const fixed = await call('PATCH', `orgs/${ORG}/people/${id}`, { user: OWNER, body: { email: 'right.person@example.com' } });
  assertEquals([fixed.status, fixed.body.link_revoked, fixed.body.member.email], [200, true, 'right.person@example.com']);
  const refused = await call('POST', `join/${held}`, { user: NEWCOMER, body: { consent: true } });
  assertEquals([refused.status, refused.body.code], [410, 'invite_revoked']);
  assertEquals(db.rows('company_members').find((row) => row.id === id)!.status, 'invited');
  const renewed = await call('POST', `orgs/${ORG}/invites/${invited.body.invite.id}/renew`, { user: ADMIN });
  assertEquals(renewed.status, 200);
  assertEquals((await call('POST', `join/${tokenOf(renewed.body.link)}`, { user: NEWCOMER, body: { consent: true } })).body.role, 'admin');
  // Removing the address counts as a change too.
  const second = await call('POST', `orgs/${ORG}/invites`, { user: OWNER, body: { full_name: 'No Address', email: 'gone@example.com' } });
  const cleared = await call('PATCH', `orgs/${ORG}/people/${second.body.member.id}`, { user: OWNER, body: { email: null } });
  assertEquals([cleared.body.link_revoked, cleared.body.member.email], [true, null]);
});

Deno.test('a join already past the link check stops when HR raises the role or corrects the address meanwhile', async () => {
  for (const change of [{ role: 'owner' }, { email: 'right@example.com' }]) {
    const { db, call } = setup();
    const invited = await call('POST', `orgs/${ORG}/invites`, { user: OWNER, body: { full_name: 'In Flight', email: 'flight@example.com', role: 'employee' } });
    const row = db.rows('company_members').find((entry) => entry.id === invited.body.member.id)!;
    const real = db.from.bind(db);
    let invitesRead = 0;
    // HR's change lands between the join's reads and its write to the invite.
    db.from = ((table: string) => {
      if (table === 'company_invites' && ++invitesRead === 2) Object.assign(row, change);
      return real(table);
    }) as typeof db.from;
    const joined = await call('POST', `join/${tokenOf(invited.body.link)}`, { user: NEWCOMER, body: { consent: true } });
    assertEquals([joined.status, joined.body.code], [409, 'invite_busy'], JSON.stringify(change));
    assertEquals([row.status, row.user_id ?? null], ['invited', null]);
    assertEquals(inviteOf(db, invited.body.invite.id).uses, 0, 'the use is handed back');
  }
});

Deno.test('a link that cannot be used shows only that, and at most the company name', async () => {
  const closedAnswer = (state: string, signedIn = false) => ({ state, org: { name: 'Silk Road Hotels' }, signed_in: signedIn });
  const { db, call } = setup('active', { now: () => new Date('2026-11-01T10:00:00Z') });
  const secret = { full_name: 'Very Private Name', email: 'private.person@example.com', role: 'admin', department_id: SALES, job_role: 'sales' };

  const withdrawn = await call('POST', `orgs/${ORG}/invites`, { user: OWNER, body: secret });
  await call('POST', `orgs/${ORG}/invites/${withdrawn.body.invite.id}/revoke`, { user: OWNER });
  assertEquals((await call('GET', `join/${tokenOf(withdrawn.body.link)}`)).body, closedAnswer('revoked'));
  assertEquals((await call('GET', `join/${tokenOf(withdrawn.body.link)}`, { user: OTHER })).body, closedAnswer('revoked', true));

  const expired = await call('POST', `orgs/${ORG}/invites`, { user: OWNER, body: { ...secret, email: 'expired.person@example.com' } });
  inviteOf(db, expired.body.invite.id).expires_at = '2026-10-01T00:00:00Z';
  assertEquals((await call('GET', `join/${tokenOf(expired.body.link)}`)).body, closedAnswer('expired'));

  const used = await call('POST', `orgs/${ORG}/invites`, { user: OWNER, body: { ...secret, email: 'used.person@example.com' } });
  await call('POST', `join/${tokenOf(used.body.link)}`, { user: NEWCOMER, body: { consent: true } });
  assertEquals((await call('GET', `join/${tokenOf(used.body.link)}`)).body, closedAnswer('used_up'));

  const removed = await call('POST', `orgs/${ORG}/invites`, { user: OWNER, body: { ...secret, email: 'removed.person@example.com' } });
  await call('DELETE', `orgs/${ORG}/people/${removed.body.member.id}`, { user: OWNER });
  assertEquals((await call('GET', `join/${tokenOf(removed.body.link)}`)).body, closedAnswer('revoked'));

  // A closed workspace hides who a link was for as well.
  const open = await call('POST', `orgs/${ORG}/invites`, { user: OWNER, body: { ...secret, email: 'open.person@example.com' } });
  const preview = await call('GET', `join/${tokenOf(open.body.link)}`);
  assertEquals([preview.body.state, preview.body.full_name, preview.body.role, preview.body.department, preview.body.email_hint], ['open', 'Very Private Name', 'admin', 'Sales', 'o*****@example.com']);
  db.rows('company_orgs')[0].status = 'suspended';
  assertEquals((await call('GET', `join/${tokenOf(open.body.link)}`)).body, closedAnswer('paused'));
  db.rows('company_orgs')[0].status = 'closed';
  assertEquals((await call('GET', `join/${tokenOf(open.body.link)}`)).body, closedAnswer('closed'));
  db.rows('company_orgs')[0].status = 'active';

  // The person who joined still sees their own place; a colleague holding that link sees theirs, not the invitee's.
  const own = await call('GET', `join/${tokenOf(used.body.link)}`, { user: NEWCOMER });
  assertEquals([own.body.state, own.body.full_name, own.body.role, own.body.department, own.body.home], ['joined', 'Very Private Name', 'admin', 'Sales', `/w/${ORG}`]);
  const colleague = await call('GET', `join/${tokenOf(withdrawn.body.link)}`, { user: EMPLOYEE });
  assertEquals([colleague.body.state, colleague.body.role, colleague.body.department, colleague.body.job_role], ['joined', 'employee', 'Front office', 'general']);
  assert(!JSON.stringify(colleague.body).includes('Very Private'), 'not the invitee');
  assert(!JSON.stringify(colleague.body).includes('p*****'), 'not the invitee');
});

Deno.test('a team link renewed after someone was removed does bring them back; created_at stays', async () => {
  let at = new Date('2026-11-01T10:00:00Z');
  const { db, call } = setup('active', { now: () => at });
  const link = await call('POST', `orgs/${ORG}/invites`, { user: ADMIN, body: { kind: 'link', role: 'employee', job_role: 'sales', department_id: SALES } });
  const stored = inviteOf(db, link.body.invite.id);
  assertEquals([stored.created_at, stored.token_issued_at], [at.toISOString(), at.toISOString()]);
  at = new Date('2026-11-02T10:00:00Z');
  const employeeRow = memberOf(db, EMPLOYEE);
  await call('DELETE', `orgs/${ORG}/people/${employeeRow.id}`, { user: ADMIN });
  assertEquals((await call('POST', `join/${tokenOf(link.body.link)}`, { user: EMPLOYEE, body: { consent: true } })).body.code, 'invite_revoked');
  at = new Date('2026-11-03T10:00:00Z');
  const renewed = await call('POST', `orgs/${ORG}/invites/${link.body.invite.id}/renew`, { user: ADMIN });
  assertEquals(renewed.status, 200);
  assertEquals([stored.created_at, stored.token_issued_at], ['2026-11-01T10:00:00.000Z', at.toISOString()], 'lists and audit keep created_at');
  assertEquals(renewed.body.invite.created_at, '2026-11-01T10:00:00.000Z');
  // The old token is gone; the new one works and is not refused as older than the removal.
  assertEquals((await call('GET', `join/${tokenOf(link.body.link)}`)).body.code, 'invite_not_found');
  assertEquals((await call('GET', `join/${tokenOf(renewed.body.link)}`, { user: EMPLOYEE })).body.state, 'open');
  const back = await call('POST', `join/${tokenOf(renewed.body.link)}`, { user: EMPLOYEE, body: { consent: true } });
  assertEquals([back.status, back.body.state, employeeRow.status], [200, 'joined', 'active']);
  // Renewed before the removal: still refused.
  const second = await call('POST', `orgs/${ORG}/invites`, { user: ADMIN, body: { kind: 'link', role: 'employee' } });
  at = new Date('2026-11-04T10:00:00Z');
  const earlier = await call('POST', `orgs/${ORG}/invites/${second.body.invite.id}/renew`, { user: ADMIN });
  at = new Date('2026-11-05T10:00:00Z');
  await call('DELETE', `orgs/${ORG}/people/${employeeRow.id}`, { user: ADMIN });
  assertEquals((await call('POST', `join/${tokenOf(earlier.body.link)}`, { user: EMPLOYEE, body: { consent: true } })).body.code, 'invite_revoked');
});

Deno.test('a failed access sync is reported on seat changes and removal, and repeating the call repairs it', async () => {
  const { db, synced, call } = setup();
  const seated = seatMember(db, EMPLOYEE);
  const healthy = db.rpcs.company_sync_english_access;
  failSync(db);
  const off = await call('POST', `orgs/${ORG}/people/${seated}/seat`, { user: ADMIN, body: { seat: false } });
  assertEquals([off.status, off.body.member.seat, off.body.access_sync_failed], [200, false, true]);
  assertEquals((db.rows('company_audit').at(-1)!.details as Record<string, unknown>).access, 'failed');
  // The same click again while it is still down: still told.
  const stillOff = await call('POST', `orgs/${ORG}/people/${seated}/seat`, { user: ADMIN, body: { seat: false } });
  assertEquals([stillOff.status, stillOff.body.access_sync_failed], [200, true]);
  db.rpcs.company_sync_english_access = healthy;
  synced.length = 0;
  const repaired = await call('POST', `orgs/${ORG}/people/${seated}/seat`, { user: ADMIN, body: { seat: false } });
  assertEquals([repaired.status, repaired.body.access_sync_failed, synced], [200, undefined, [EMPLOYEE]]);
  assertEquals(db.rows('company_audit').at(-1)!.action, 'member.access_repaired');

  // Removal: told, and a repeat of DELETE on the removed row syncs again.
  failSync(db);
  const removed = await call('DELETE', `orgs/${ORG}/people/${seated}`, { user: ADMIN });
  assertEquals([removed.status, removed.body.member.status, removed.body.access_sync_failed], [200, 'removed', true]);
  const stillRemoved = await call('DELETE', `orgs/${ORG}/people/${seated}`, { user: ADMIN });
  assertEquals([stillRemoved.status, stillRemoved.body.access_sync_failed], [200, true]);
  db.rpcs.company_sync_english_access = healthy;
  synced.length = 0;
  const removedAgain = await call('DELETE', `orgs/${ORG}/people/${seated}`, { user: ADMIN });
  assertEquals([removedAgain.status, removedAgain.body.access_sync_failed, synced], [200, undefined, [EMPLOYEE]]);

  // A healthy change says nothing about it.
  const manager = memberOf(db, MANAGER).id as string;
  const on = await call('POST', `orgs/${ORG}/people/${manager}/seat`, { user: ADMIN, body: { seat: true } });
  assert(!('access_sync_failed' in on.body));
  // A seat turned on while the sync is down is reported as well.
  failSync(db);
  const newcomer = await call('POST', `orgs/${ORG}/people/${memberOf(db, ADMIN).id}/seat`, { user: ADMIN, body: { seat: true } });
  assertEquals([newcomer.status, newcomer.body.member.seat, newcomer.body.access_sync_failed], [200, true, true]);
});

Deno.test('leaving and joining report a failed access sync, and the person can retry their own', async () => {
  const { db, synced, call } = setup();
  seatMember(db, EMPLOYEE);
  const healthy = db.rpcs.company_sync_english_access;
  failSync(db);
  const left = await call('POST', `orgs/${ORG}/people/me/leave`, { user: EMPLOYEE });
  assertEquals([left.status, left.body.left, left.body.access_sync_failed], [200, true, true]);
  // They are out of the workspace, so their retry is a route of their own.
  assertEquals((await call('POST', `orgs/${ORG}/people/me/leave`, { user: EMPLOYEE })).status, 403);
  const stillDown = await call('POST', 'me/access/sync', { user: EMPLOYEE });
  assertEquals([stillDown.status, stillDown.body.access, stillDown.body.access_sync_failed], [200, 'failed', true]);
  assertEquals((await call('POST', 'me/access/sync')).status, 401);
  db.rpcs.company_sync_english_access = healthy;
  synced.length = 0;
  const fixed = await call('POST', 'me/access/sync', { user: EMPLOYEE });
  assertEquals([fixed.status, fixed.body.access_sync_failed, synced], [200, undefined, [EMPLOYEE]]);

  const invited = await call('POST', `orgs/${ORG}/invites`, { user: ADMIN, body: { full_name: 'New Joiner', email: 'joiner@example.com' } });
  failSync(db);
  const joined = await call('POST', `join/${tokenOf(invited.body.link)}`, { user: NEWCOMER, body: { consent: true } });
  assertEquals([joined.status, joined.body.state, joined.body.access_sync_failed], [200, 'joined', true]);
  // Joining again repairs it.
  const stillBroken = await call('POST', `join/${tokenOf(invited.body.link)}`, { user: NEWCOMER, body: { consent: true } });
  assertEquals([stillBroken.body.already, stillBroken.body.access_sync_failed], [true, true]);
  db.rpcs.company_sync_english_access = healthy;
  synced.length = 0;
  const repaired = await call('POST', `join/${tokenOf(invited.body.link)}`, { user: NEWCOMER, body: { consent: true } });
  assertEquals([repaired.body.already, repaired.body.access_sync_failed, synced], [true, undefined, [NEWCOMER]]);
});

Deno.test('invitation and certificate links are rate limited per network, like the other public links', async () => {
  const { db } = setup();
  const call = testHandler(db, [...core, ...people, ...hiring]);
  const asked: { bucket: string; limit: number }[] = [];
  let allow = true;
  db.rpcs.company_hiring_hit = ({ p_bucket, p_limit }) => { asked.push({ bucket: String(p_bucket).split(':')[0], limit: Number(p_limit) }); return allow; };
  assertEquals((await call('GET', 'join/not-a-real-token-at-all')).body.code, 'invite_not_found');
  assertEquals((await call('GET', 'public/v/AAAAAAAAAA')).status, 404);
  assertEquals(asked, [{ bucket: 'join', limit: JOIN_VIEWS_PER_HOUR }, { bucket: 'certificate', limit: CERTIFICATE_CHECKS_PER_HOUR }]);
  allow = false;
  for (const path of ['join/not-a-real-token-at-all', 'public/v/AAAAAAAAAA']) {
    const refused = await call('GET', path);
    assertEquals([refused.status, refused.body.code], [429, 'too_many_requests'], path);
  }
});
