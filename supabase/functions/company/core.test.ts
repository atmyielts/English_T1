import { assertEquals } from 'jsr:@std/assert@1';
import { routes as core } from './core.ts';
import { FakeDb, testHandler } from './testing.ts';
import type { Route } from './types.ts';

const OWNER = '00000000-0000-4000-8000-0000000000a1';
const EMPLOYEE = '00000000-0000-4000-8000-0000000000a2';
const STRANGER = '00000000-0000-4000-8000-0000000000a3';
const STAFF = '00000000-0000-4000-8000-0000000000a4';

function setup() {
  const db = new FakeDb({ users: [{ id: OWNER, role: 'user' }, { id: EMPLOYEE, role: 'user' }, { id: STRANGER, role: 'user' }, { id: STAFF, role: 'admin' }] });
  const hrOnly: Route = { method: 'POST', path: 'orgs/:org/hr-thing', access: 'org', roles: ['owner', 'admin'], handle: () => Promise.resolve({ ok: 'hr' }) };
  return { db, call: testHandler(db, [...core, hrOnly]) };
}

async function createOrg(call: ReturnType<typeof setup>['call']) {
  const created = await call('POST', 'orgs', { user: OWNER, body: { name: 'Silk Road Hotels', industry: 'hospitality', size_band: '51-200' } });
  assertEquals(created.status, 200);
  return created.body.org.id as string;
}

Deno.test('signed-out callers are turned away from user routes', async () => {
  const { call } = setup();
  assertEquals((await call('GET', 'me')).status, 401);
  assertEquals((await call('GET', 'nowhere', { user: OWNER })).status, 404);
  assertEquals((await call('DELETE', 'me', { user: OWNER })).status, 405);
});

Deno.test('creating a workspace makes a pilot with the creator as owner', async () => {
  const { db, call } = setup();
  const orgId = await createOrg(call);
  const org = db.rows('company_orgs')[0];
  assertEquals([org.status, org.seats_limit, org.tests_limit, org.industry], ['pilot', 0, 10, 'hospitality']);
  const me = await call('GET', 'me', { user: OWNER });
  assertEquals(me.body.workspaces.length, 1);
  assertEquals(me.body.workspaces[0].member.role, 'owner');
  assertEquals(me.body.workspaces[0].org.id, orgId);
  assertEquals(db.rows('company_audit')[0].action, 'org.created');
});

Deno.test('workspace routes check membership, role and status', async () => {
  const { db, call } = setup();
  const orgId = await createOrg(call);
  db.rows('company_members').push({ id: crypto.randomUUID(), org_id: orgId, user_id: EMPLOYEE, role: 'employee', status: 'active', seat: false, job_role: 'general' });
  assertEquals((await call('GET', `orgs/${orgId}`, { user: STRANGER })).status, 403);
  const asEmployee = await call('GET', `orgs/${orgId}`, { user: EMPLOYEE });
  assertEquals(asEmployee.status, 200);
  assertEquals(asEmployee.body.usage, null);
  assertEquals(asEmployee.body.org.tests_limit, undefined);
  assertEquals((await call('POST', `orgs/${orgId}/hr-thing`, { user: EMPLOYEE })).status, 403);
  assertEquals((await call('POST', `orgs/${orgId}/hr-thing`, { user: OWNER })).body.ok, 'hr');
  assertEquals((await call('POST', `orgs/${orgId}/hr-thing`, { user: STAFF })).body.ok, 'hr');
  db.rows('company_orgs')[0].status = 'suspended';
  assertEquals((await call('POST', `orgs/${orgId}/hr-thing`, { user: OWNER })).body.code, 'org_suspended');
  assertEquals((await call('GET', `orgs/${orgId}`, { user: OWNER })).status, 200);
});

Deno.test('consent is recorded once', async () => {
  const { db, call } = setup();
  const orgId = await createOrg(call);
  const first = await call('POST', `orgs/${orgId}/consent`, { user: OWNER });
  const second = await call('POST', `orgs/${orgId}/consent`, { user: OWNER });
  assertEquals(first.body.consent_at, second.body.consent_at);
  assertEquals(db.rows('company_members')[0].consent_at, first.body.consent_at);
});

Deno.test('a person owns at most three workspaces', async () => {
  const { call } = setup();
  for (let index = 0; index < 3; index++) await createOrg(call);
  assertEquals((await call('POST', 'orgs', { user: OWNER, body: { name: 'Fourth' } })).body.code, 'too_many_workspaces');
});
