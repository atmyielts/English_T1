// Independent regressions for the full personal-data lifecycle, including the
// learner's explicitly shared badges and social feed records.
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { routes as connect } from './connect.ts';
import { routes as team } from './coach/team.ts';
import { routes as insights } from './insights.ts';
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

Deno.test('withoutMember adjusts the department the person was in at freeze, and leaves groups alone for older results', async () => {
  const { withoutMember } = await import('./insights/challenges.ts');
  const group = (id: string, total: number, participants: number, active: number, rank: number) => ({ id, name: id, total, participants, active, average: Math.round(total / participants * 10) / 10, rank });
  const final = {
    finished_at: '2026-11-02T00:00:00Z', participants: 3, active: 3, total: 70,
    people: [{ member_id: 'm1', value: 60, rank: 1, department_id: 'A' }, { member_id: 'm2', value: 6, rank: 2, department_id: 'B' }, { member_id: 'm3', value: 4, rank: 3, department_id: 'B' }],
    departments: [group('A', 60, 1, 1, 1), group('B', 10, 2, 2, 2)],
    teams: [group('team-1', 60, 1, 1, 1), group('team-2', 10, 2, 2, 2)],
  };
  const teams = [{ id: 'team-1', name: 'One', department_ids: ['A'] }, { id: 'team-2', name: 'Two', department_ids: ['B'] }];
  // m1 has since moved to B; their 60 still comes off A, and B is untouched.
  const next = withoutMember(final, { id: 'm1' }, teams)!;
  const byId = (rows: { id: string; total: number; active: number }[]) => Object.fromEntries(rows.map((row) => [row.id, [row.total, row.active]]));
  assertEquals(byId(next.departments), { A: [0, 0], B: [10, 2] });
  assertEquals(byId(next.teams), { 'team-1': [0, 0], 'team-2': [10, 2] });
  assertEquals(next.people.map((row) => [row.member_id, row.rank, row.department_id]), [['m2', 1, 'B'], ['m3', 2, 'B']]);
  // A result frozen before departments were recorded: the person leaves the ranking and the total, groups stay.
  const old = { ...final, people: final.people.map(({ department_id: _d, ...row }) => row) };
  const legacy = withoutMember(old, { id: 'm1' }, teams)!;
  assertEquals([legacy.total, legacy.people.length], [10, 2]);
  assertEquals(byId(legacy.departments), { A: [60, 1], B: [10, 2] });
  assertEquals(byId(legacy.teams), { 'team-1': [60, 1], 'team-2': [10, 2] });
});

Deno.test('erasing learning takes the person out of finished challenges: winners, standings and totals', async () => {
  const { db } = setup();
  const DEPT = '50000000-0000-4000-8000-000000000001', CHALLENGE = '60000000-0000-4000-8000-000000000001';
  const OTHER_EMP = '20000000-0000-4000-8000-000000000003', M_OTHER = '30000000-0000-4000-8000-000000000003';
  db.rows('users').push({ id: OTHER_EMP, role: 'user' });
  db.rows('company_members').push({ id: M_OTHER, user_id: OTHER_EMP, org_id: ORG, role: 'employee', status: 'active', full_name: 'Boris Popov', email: 'boris@example.test', seat: true, department_id: DEPT, job_role: 'general', consent_at: '2026-01-01T00:00:00Z', joined_at: '2026-01-01T00:00:00Z' });
  Object.assign(db.rows('company_members').find((row) => row.id === M_EMP)!, { full_name: 'Anna Lee', department_id: DEPT });
  db.rows('company_departments').push({ id: DEPT, org_id: ORG, name: 'Front office' });
  db.rows('company_activity').push(
    { id: 1, org_id: ORG, member_id: M_EMP, user_id: EMP, kind: 'lesson', minutes: 60, points: 40, created_at: '2026-10-28T08:00:00Z' },
    { id: 2, org_id: ORG, member_id: M_OTHER, user_id: OTHER_EMP, kind: 'lesson', minutes: 10, points: 10, created_at: '2026-10-28T09:00:00Z' },
  );
  db.rows('company_challenges').push({
    id: CHALLENGE, org_id: ORG, title: 'Autumn cup', description: null, metric: 'minutes', starts_on: '2026-10-25', ends_on: '2026-11-01', department_ids: [], ended_at: null,
    created_by: M_OWNER, created_at: '2026-10-20T00:00:00Z', updated_at: '2026-10-20T00:00:00Z', template: null, mode: 'individual', teams: [], prize: null, final_results: null, finished_at: null,
  });
  const call = testHandler(db, [...connect, ...insights], { now: () => NOW });
  const before = await call('GET', `orgs/${ORG}/challenges/winners`, { user: OTHER_EMP });
  assertEquals(before.status, 200, JSON.stringify(before.body));
  assertEquals(before.body.winners[0].top.map((row: { rank: number; value: number }) => [row.rank, row.value]), [[1, 60], [2, 10]]);
  assert(db.rows('company_challenges')[0].final_results, 'frozen');

  const erased = await call('POST', `orgs/${ORG}/connect/privacy/people/${M_EMP}/erase-learning`, { user: OWNER, body: { confirm: 'ERASE' } });
  assertEquals([erased.status, erased.body.erased.company_challenges], [200, 1]);
  const after = await call('GET', `orgs/${ORG}/challenges/winners`, { user: OTHER_EMP });
  const top = after.body.winners[0].top;
  assertEquals(top.map((row: { rank: number; value: number; me: boolean }) => [row.rank, row.value, row.me]), [[1, 10, true]]);
  assert(!JSON.stringify(after.body).includes('Anna'), 'no name left');
  assertEquals([after.body.winners[0].total, after.body.winners[0].active], [10, 1]);
  assertEquals(after.body.winners[0].department?.total, 10);
  const standings = await call('GET', `orgs/${ORG}/challenges/${CHALLENGE}`, { user: OWNER });
  assertEquals(standings.status, 200);
  assertEquals(standings.body.people.map((row: { name: string; value: number }) => [row.name, row.value]), [['Boris Popov', 10]]);
  assertEquals([standings.body.total, standings.body.departments[0].total, standings.body.departments[0].active], [10, 10, 1]);
  // Departments are adjusted by where the person was at freeze time, not where they are now.
  assertEquals((db.rows('company_challenges')[0].final_results as { people: { department_id?: string }[] }).people.every((row) => row.department_id === DEPT), true);
  // Erasing again finds nothing more to change.
  assertEquals((await call('POST', `orgs/${ORG}/connect/privacy/people/${M_EMP}/erase-learning`, { user: OWNER, body: { confirm: 'ERASE' } })).body.erased.company_challenges, 0);
});
