// Independent regressions for the full personal-data lifecycle, including the
// learner's explicitly shared badges and social feed records.
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { routes as connect } from './connect.ts';
import { routes as team } from './coach/team.ts';
import { FakeDb, testHandler } from './testing.ts';

const ORG = '10000000-0000-4000-8000-000000000001';
const OWNER = '20000000-0000-4000-8000-000000000001', EMP = '20000000-0000-4000-8000-000000000002';
const M_OWNER = '30000000-0000-4000-8000-000000000001', M_EMP = '30000000-0000-4000-8000-000000000002';
const NOW = new Date('2026-11-07T07:00:00Z');

function setup() {
  const member = (id: string, user_id: string, role: string) => ({ id, user_id, org_id: ORG, role, status: 'active', full_name: role, email: `${role}@example.test`, seat: true, department_id: null, job_role: 'general', consent_at: '2026-01-01T00:00:00Z', joined_at: '2026-01-01T00:00:00Z' });
  const db = new FakeDb({
    users: [{ id: OWNER, role: 'user' }, { id: EMP, role: 'user' }],
    company_orgs: [{ id: ORG, name: 'Privacy fixture', industry: 'it', size_band: '1-50', status: 'active', seats_limit: 5, tests_limit: 10, tests_used: 0, contract_ends_at: null, settings: {}, created_at: '2026-01-01T00:00:00Z' }],
    company_members: [member(M_OWNER, OWNER, 'owner'), member(M_EMP, EMP, 'employee')],
    company_coach_settings: [{ org_id: ORG, member_id: M_EMP, user_id: EMP, kudos_opt_in: true }],
    company_coach_kudos: [{ id: '40000000-0000-4000-8000-000000000001', org_id: ORG, from_member: M_EMP, to_member: null, kind: 'badge', badge: 'first_week', note: 'SHARED_BADGE_PERSONAL_RECORD', created_at: NOW.toISOString(), day: '2026-11-07' }],
  });
  return { db, call: testHandler(db, [...connect, ...team], { now: () => NOW }) };
}

Deno.test('own privacy export includes the learner’s shared badge records', async () => {
  const { call } = setup();
  const exported = await call('GET', `orgs/${ORG}/connect/privacy/me/export`, { user: EMP });
  assertEquals(exported.status, 200);
  assert(JSON.stringify(exported.body).includes('SHARED_BADGE_PERSONAL_RECORD'));
});

Deno.test('erasing learning cannot resurrect a shared badge when the learner rejoins the feed', async () => {
  const { call } = setup();
  const erased = await call('POST', `orgs/${ORG}/connect/privacy/people/${M_EMP}/erase-learning`, { user: OWNER, body: { confirm: 'ERASE' } });
  assertEquals(erased.status, 200);
  assertEquals((await call('PUT', `orgs/${ORG}/coach/team/membership`, { user: EMP, body: { joined: true } })).status, 200);
  const feed = await call('GET', `orgs/${ORG}/coach/team`, { user: EMP });
  assertEquals(feed.status, 200);
  assertEquals(feed.body.feed, []);
});

Deno.test('own privacy export pages beyond one thousand private cards and HR never receives them', async () => {
  const { db, call } = setup();
  db.maxRows = 1000;
  for (let index = 0; index < 1101; index++) db.rows('company_coach_cards').push({
    id: `card-${String(index).padStart(4, '0')}`, org_id: ORG, member_id: M_EMP, user_id: EMP,
    front: `PRIVATE_REVIEW_CARD_${index}`, created_at: NOW.toISOString(),
  });
  db.rows('company_coach_cards').push({ id: 'card-foreign-person', org_id: ORG, member_id: M_OWNER, user_id: OWNER, front: 'FOREIGN_PRIVATE_CARD', created_at: NOW.toISOString() });
  const own = await call('GET', `orgs/${ORG}/connect/privacy/me/export`, { user: EMP });
  assertEquals(own.status, 200);
  assertEquals(own.body.learning.coach_cards.length, 1101);
  assertEquals(new Set(own.body.learning.coach_cards.map((row: { id: string }) => row.id)).size, 1101);
  assert(!JSON.stringify(own.body).includes('FOREIGN_PRIVATE_CARD'));
  const hr = await call('GET', `orgs/${ORG}/connect/privacy/people/${M_EMP}/export`, { user: OWNER });
  assertEquals(hr.status, 200);
  assert(!JSON.stringify(hr.body).includes('PRIVATE_REVIEW_CARD_'));
  assert(!('coach_cards' in hr.body.learning));
});
