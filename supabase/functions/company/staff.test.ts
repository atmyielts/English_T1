import { assert, assertEquals } from 'jsr:@std/assert@1';
import { routes as core } from './core.ts';
import { routes as people } from './people.ts';
import { routes as site } from './site.ts';
import { routes as staff } from './staff.ts';
import { FakeDb, testHandler } from './testing.ts';

const STAFF = 'aa000000-0000-4000-8000-000000000001';
const OWNER = 'a1000000-0000-4000-8000-000000000002';
const BUYER = 'b1000000-0000-4000-8000-000000000003';
const ORG = '7a0f5c1e-0000-4000-8000-00000000c0de';

function setup() {
  const db = new FakeDb({
    users: [{ id: STAFF, role: 'admin' }, { id: OWNER, role: 'user' }, { id: BUYER, role: 'user' }],
    company_orgs: [
      { id: ORG, name: 'Silk Road Hotels', industry: 'hospitality', size_band: '51-200', city: 'Tashkent', status: 'pilot', seats_limit: 0, tests_limit: 10, tests_used: 3, settings: { locale: 'ru' }, contract_ends_at: null, created_at: '2026-10-01T00:00:00Z' },
      { id: crypto.randomUUID(), name: 'Navoi Logistics', industry: 'logistics', size_band: '201-1000', city: 'Navoi', status: 'active', seats_limit: 20, tests_limit: null, tests_used: 40, settings: {}, contract_ends_at: null, created_at: '2026-09-01T00:00:00Z' },
    ],
    company_members: [
      { id: crypto.randomUUID(), org_id: ORG, user_id: OWNER, email: 'a1000000@example.com', full_name: 'Dilnoza Karimova', role: 'owner', status: 'active', seat: false, job_role: 'general' },
      { id: crypto.randomUUID(), org_id: ORG, user_id: null, email: 'x@example.com', full_name: 'Invited', role: 'employee', status: 'invited', seat: false, job_role: 'general' },
    ],
  });
  const orgSyncs: string[] = [];
  db.rpcs.company_sync_org_access = ({ p_org }) => { orgSyncs.push(String(p_org)); return 2; };
  db.rpcs.company_sync_english_access = () => 'granted';
  return { db, orgSyncs, call: testHandler(db, [...core, ...people, ...site, ...staff]) };
}

Deno.test('the staff console is for Schood staff only', async () => {
  const { call } = setup();
  for (const path of ['staff/orgs', `staff/orgs/${ORG}`, 'staff/leads', 'staff/audit']) {
    assertEquals((await call('GET', path, { user: OWNER })).status, 403);
    assertEquals((await call('GET', path)).status, 401);
  }
});

Deno.test('workspaces list with search, status filter and people counts', async () => {
  const { call } = setup();
  const all = await call('GET', 'staff/orgs', { user: STAFF });
  assertEquals(all.body.orgs.map((org: { name: string }) => org.name), ['Silk Road Hotels', 'Navoi Logistics']);
  assertEquals([all.body.orgs[0].people, all.body.orgs[0].invited], [1, 1]);
  assertEquals(all.body.counts, { pilot: 1, active: 1, suspended: 0, closed: 0 });
  assertEquals((await call('GET', 'staff/orgs?q=navoi', { user: STAFF })).body.orgs.length, 1);
  assertEquals((await call('GET', 'staff/orgs?status=pilot', { user: STAFF })).body.orgs[0].id, ORG);
});

Deno.test('staff set status, seats, tests, contract end and the AI cap, then access is re-synced', async () => {
  const { db, orgSyncs, call } = setup();
  const saved = await call('PATCH', `staff/orgs/${ORG}`, { user: STAFF, body: { status: 'active', seats_limit: 25, tests_limit: 200, contract_ends_at: '2027-10-31', ai_daily_limit: 150 } });
  assertEquals(saved.status, 200);
  const org = db.rows('company_orgs')[0];
  assertEquals([org.status, org.seats_limit, org.tests_limit], ['active', 25, 200]);
  assertEquals(org.contract_ends_at, '2027-10-31T18:59:59.000Z');
  assertEquals(org.settings, { locale: 'ru', ai_daily_limit: 150 });
  assertEquals(orgSyncs, [ORG]);
  assertEquals(saved.body.synced, 2);
  const audit = db.rows('company_audit').at(-1)!;
  assertEquals([audit.action, audit.org_id], ['staff.org_updated', ORG]);
  assertEquals((audit.details as Record<string, unknown>).status, { from: 'pilot', to: 'active' });
  // Unlimited tests and the default AI cap; seats cannot go below those in use.
  await call('PATCH', `staff/orgs/${ORG}`, { user: STAFF, body: { tests_limit: null, ai_daily_limit: null, contract_ends_at: null } });
  assertEquals([org.tests_limit, org.contract_ends_at, org.settings], [null, null, { locale: 'ru' }]);
  db.rows('company_members')[0].seat = true;
  const below = await call('PATCH', `staff/orgs/${ORG}`, { user: STAFF, body: { seats_limit: 0 } });
  assertEquals([below.status, below.body.code, below.body.used], [409, 'seats_below_used', 1]);
  assertEquals((await call('PATCH', `staff/orgs/${ORG}`, { user: STAFF, body: { status: 'deleted' } })).body.field, 'status');
  assertEquals((await call('PATCH', `staff/orgs/${ORG}`, { user: STAFF, body: { contract_ends_at: '31/10/2027' } })).body.field, 'contract_ends_at');
  const detail = await call('GET', `staff/orgs/${ORG}`, { user: STAFF });
  assertEquals([detail.body.counts.people, detail.body.counts.invited, detail.body.admins.length], [1, 1, 1]);
  assertEquals(detail.body.audit[0].action, 'staff.org_updated');
  const log = await call('GET', `staff/audit?org=${ORG}`, { user: STAFF });
  assertEquals(log.body.audit[0].org_name, 'Silk Road Hotels');
});

Deno.test('a demo request becomes a pipeline entry, then a workspace with an owner link', async () => {
  const { db, call } = setup();
  await call('POST', 'public/leads', { body: { name: 'Aziza Rakhimova', company: 'Orient Bank', email: 'aziza@orient.example', industry: 'banking', size_band: '1000+', locale: 'uz', elapsed_ms: 9000 } });
  const list = await call('GET', 'staff/leads', { user: STAFF });
  assertEquals(list.body.counts.new, 1);
  const leadId = list.body.leads[0].id;
  const updated = await call('PATCH', `staff/leads/${leadId}`, { user: STAFF, body: { status: 'contacted', notes: 'Wants 300 tests for call centre hiring.', follow_up_at: '2026-11-05' } });
  assertEquals([updated.body.lead.status, updated.body.lead.follow_up_at], ['contacted', '2026-11-05']);
  await call('POST', `staff/leads/${leadId}/notes`, { user: STAFF, body: { body: 'Call on Tuesday, demo booked.' } });
  assertEquals((await call('PATCH', `staff/leads/${leadId}`, { user: STAFF, body: { status: 'maybe' } })).body.field, 'status');

  const opened = await call('POST', 'staff/orgs', { user: STAFF, body: { lead_id: leadId, name: 'Orient Bank', industry: 'banking', size_band: '1000+', owner_email: 'aziza@orient.example', owner_name: 'Aziza Rakhimova', locale: 'uz' } });
  assertEquals(opened.status, 200);
  assert(String(opened.body.link).includes('/join/'));
  const org = db.rows('company_orgs').find((row) => row.id === opened.body.org.id)!;
  assertEquals([org.status, org.tests_limit, org.seats_limit, org.billing_email], ['pilot', 10, 0, 'aziza@orient.example']);
  const lead = db.rows('company_leads').find((row) => row.id === leadId)!;
  assertEquals([lead.org_id, lead.status], [org.id, 'pilot']);
  assertEquals((await call('POST', 'staff/orgs', { user: STAFF, body: { lead_id: leadId, name: 'Twice', owner_name: 'X' } })).body.code, 'lead_has_workspace');

  const timeline = await call('GET', `staff/leads/${leadId}`, { user: STAFF });
  assertEquals(timeline.body.timeline.map((row: { action: string }) => row.action).sort(), ['lead.created', 'lead.note', 'lead.updated', 'lead.workspace'].sort());
  assertEquals(timeline.body.org.name, 'Orient Bank');

  // The buyer opens the owner link and becomes the owner.
  const joined = await call('POST', `join/${opened.body.link.split('/join/')[1]}`, { user: BUYER, body: { consent: true } });
  assertEquals(joined.status, 200);
  const owner = db.rows('company_members').find((row) => row.user_id === BUYER)!;
  assertEquals([owner.role, owner.status, owner.org_id], ['owner', 'active', org.id]);
  // A replacement owner link for the same email reuses the row; an active owner cannot be re-invited.
  assertEquals((await call('POST', `staff/orgs/${org.id}/owner-invite`, { user: STAFF, body: { email: 'aziza@orient.example' } })).body.code, 'member_exists');
  const second = await call('POST', `staff/orgs/${org.id}/owner-invite`, { user: STAFF, body: { email: 'deputy@orient.example', full_name: 'Deputy' } });
  assertEquals([second.status, second.body.owner.role], [200, 'owner']);
});
