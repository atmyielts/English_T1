import { assert, assertEquals, assertExists, assertStringIncludes } from 'jsr:@std/assert@1';
import { routes as insights } from './insights.ts';
import { requirementFor, standingOf, type RequirementRow } from './insights/framework.ts';
import { executiveData, unknownNumbers } from './insights/executive.ts';
import { valueOf } from './insights/spend.ts';
import { periodRange } from './insights/builder.ts';
import { FakeDb, testHandler } from './testing.ts';
import type { AiCall } from './types.ts';

const ORG = '7a0f5c1e-0000-4000-8000-0000000000c1';
const OTHER_ORG = '7a0f5c1e-0000-4000-8000-0000000000c2';
const DEPT_A = 'd0000000-0000-4000-8000-00000000000a';
const DEPT_B = 'd0000000-0000-4000-8000-00000000000b';
const DEPT_OTHER = 'd0000000-0000-4000-8000-00000000000c';
const user = (n: number) => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const member = (n: number) => `e0000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const OWNER = user(1), ADMIN = user(2), MANAGER = user(3), ANNA = user(4), BORIS = user(5), CHEN = user(6), DARIA = user(7), OUTSIDER = user(8), STAFF = user(9);
const NOW = new Date('2026-10-20T10:00:00Z'); // 15:00 in Tashkent, Tuesday
const DAY = 86_400_000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString();
const skills = (grammar: number, speaking: number, level: string) => ({ grammar: { score: grammar, level }, speaking: { score: speaking, level } });

function setup(options: { ai?: AiCall; status?: string; seats?: number } = {}) {
  const db = new FakeDb({
    users: [OWNER, ADMIN, MANAGER, ANNA, BORIS, CHEN, DARIA, OUTSIDER].map((id) => ({ id, role: 'user' })).concat([{ id: STAFF, role: 'admin' }]),
    company_orgs: [
      { id: ORG, name: 'Silk Road Hotels', industry: 'hospitality', size_band: '51-200', status: options.status ?? 'active', seats_limit: options.seats ?? 10, tests_limit: 10, tests_used: 4, contract_ends_at: null, settings: { locale: 'ru' }, created_at: ago(200) },
      { id: OTHER_ORG, name: 'Other', industry: 'it', size_band: '1-50', status: 'active', seats_limit: 5, tests_limit: 10, tests_used: 0, settings: {}, created_at: ago(200) },
    ],
    company_departments: [{ id: DEPT_A, org_id: ORG, name: 'Front office' }, { id: DEPT_B, org_id: ORG, name: 'Sales' }, { id: DEPT_OTHER, org_id: OTHER_ORG, name: 'Elsewhere' }],
    company_members: [
      { id: member(1), org_id: ORG, user_id: OWNER, full_name: 'Dilnoza Karimova', email: 'owner@silk.example', role: 'owner', status: 'active', seat: false, job_role: 'general', department_id: null, consent_at: ago(100), joined_at: ago(100) },
      { id: member(2), org_id: ORG, user_id: ADMIN, full_name: 'Rustam Aliev', email: 'hr@silk.example', role: 'admin', status: 'active', seat: false, job_role: 'general', department_id: null, consent_at: null, joined_at: ago(100) },
      { id: member(3), org_id: ORG, user_id: MANAGER, full_name: 'Elena Kim', email: 'elena@silk.example', role: 'manager', status: 'active', seat: true, job_role: 'hospitality', department_id: DEPT_A, level: 'b2', level_score: 70, consent_at: ago(100), joined_at: ago(100) },
      // Anna: tested twice, moved up from A2 to B1; shares; active lately.
      { id: member(4), org_id: ORG, user_id: ANNA, full_name: 'Anna Lee', email: 'anna@silk.example', role: 'employee', status: 'active', seat: true, job_role: 'hospitality', department_id: DEPT_A, level: 'b1', level_score: 55, consent_at: ago(100), joined_at: ago(100) },
      // Boris: never tested, does not share; his activity must never count.
      { id: member(5), org_id: ORG, user_id: BORIS, full_name: 'Boris Popov', email: 'boris@silk.example', role: 'employee', status: 'active', seat: true, job_role: 'hospitality', department_id: DEPT_A, level: null, level_score: null, consent_at: null, joined_at: ago(100) },
      // Chen: fell from B1 to A2; shares; quiet for a long time.
      { id: member(6), org_id: ORG, user_id: CHEN, full_name: 'Chen Wu', email: '=cmd@silk.example', role: 'employee', status: 'active', seat: true, job_role: 'sales', department_id: DEPT_B, level: 'a2', level_score: 40, consent_at: ago(100), joined_at: ago(100) },
      // Daria: sales, B2, meets everything, shares, no seat.
      { id: member(7), org_id: ORG, user_id: DARIA, full_name: 'Daria Sokolova', email: 'daria@silk.example', role: 'employee', status: 'active', seat: false, job_role: 'sales', department_id: DEPT_B, level: 'b2', level_score: 72, consent_at: ago(100), joined_at: ago(100) },
      { id: member(8), org_id: OTHER_ORG, user_id: OUTSIDER, full_name: 'Out Sider', email: 'out@x.example', role: 'owner', status: 'active', seat: false, job_role: 'general', department_id: null, consent_at: ago(10), joined_at: ago(10) },
    ],
    company_attempts: [
      { id: 't1', org_id: ORG, assessment_id: 'a1', member_id: member(4), status: 'graded', overall_level: 'a2', overall_score: 44, skill_results: skills(40, 42, 'a2'), started_at: ago(70), graded_at: ago(70) },
      { id: 't2', org_id: ORG, assessment_id: 'a1', member_id: member(4), status: 'graded', overall_level: 'b1', overall_score: 55, skill_results: skills(56, 50, 'b1'), started_at: ago(5), graded_at: ago(5) },
      { id: 't3', org_id: ORG, assessment_id: 'a1', member_id: member(6), status: 'graded', overall_level: 'b1', overall_score: 52, skill_results: skills(50, 50, 'b1'), started_at: ago(60), graded_at: ago(60) },
      { id: 't4', org_id: ORG, assessment_id: 'a1', member_id: member(6), status: 'graded', overall_level: 'a2', overall_score: 40, skill_results: skills(38, 40, 'a2'), started_at: ago(4), graded_at: ago(4) },
      { id: 't5', org_id: ORG, assessment_id: 'a1', member_id: member(7), status: 'graded', overall_level: 'b2', overall_score: 72, skill_results: skills(70, 74, 'b2'), started_at: ago(50), graded_at: ago(50) },
      { id: 't6', org_id: ORG, assessment_id: 'a1', member_id: member(3), status: 'graded', overall_level: 'b2', overall_score: 70, skill_results: skills(70, 70, 'b2'), started_at: ago(50), graded_at: ago(50) },
      { id: 't7', org_id: ORG, assessment_id: 'a2', member_id: null, status: 'graded', overall_level: 'b1', overall_score: 50, skill_results: {}, decision: 'shortlist', started_at: ago(3), graded_at: ago(3) },
      { id: 't9', org_id: OTHER_ORG, assessment_id: 'a9', member_id: member(8), status: 'graded', overall_level: 'c1', overall_score: 90, skill_results: {}, started_at: ago(3), graded_at: ago(3) },
    ],
    company_activity: [
      { id: 1, org_id: ORG, member_id: member(4), user_id: ANNA, kind: 'lesson', minutes: 30, points: 40, created_at: ago(1) },
      { id: 2, org_id: ORG, member_id: member(4), user_id: ANNA, kind: 'lesson', minutes: 30, points: 40, created_at: ago(2) },
      { id: 3, org_id: ORG, member_id: member(5), user_id: BORIS, kind: 'lesson', minutes: 500, points: 900, created_at: ago(1) },
      { id: 4, org_id: ORG, member_id: member(6), user_id: CHEN, kind: 'lesson', minutes: 60, points: 10, created_at: ago(50) },
      { id: 5, org_id: ORG, member_id: member(3), user_id: MANAGER, kind: 'lesson', minutes: 60, points: 10, created_at: ago(3) },
    ],
    company_assignments: [],
    company_lesson_progress: [],
    company_challenges: [],
    company_sessions: [],
    company_session_attendance: [],
    company_level_requirements: [],
    company_risk_actions: [],
    company_training_spend: [],
    company_saved_views: [],
    company_insight_snapshots: [],
    company_audit: [],
  });
  db.uniques.company_level_requirements = [{ columns: ['org_id', 'scope_key'] }];
  db.uniques.company_saved_views = [{ columns: ['org_id', 'name'] }];
  db.uniques.company_risk_actions = [{ columns: ['org_id', 'member_id', 'kind', 'reason', 'day'] }];
  db.uniques.company_insight_snapshots = [{ columns: ['org_id', 'period', 'kind', 'taken_on'] }];
  return { db, call: testHandler(db, insights, { now: () => NOW, ai: options.ai }) };
}
const path = (rest: string) => `orgs/${ORG}/${rest}`;

// ---------------------------------------------------------------------------
// Competency framework
// ---------------------------------------------------------------------------

Deno.test('the most specific requirement decides, and a skill bar counts', () => {
  const rows = [
    { id: 'a', job_role: null, department_id: null, level: 'a2', skills: {} },
    { id: 'b', job_role: 'sales', department_id: null, level: 'b1', skills: {} },
    { id: 'c', job_role: null, department_id: DEPT_B, level: 'b2', skills: {} },
    { id: 'd', job_role: 'sales', department_id: DEPT_B, level: 'c1', skills: { speaking: 'c1' } },
  ] as unknown as RequirementRow[];
  assertEquals(requirementFor(rows, { job_role: 'sales', department_id: DEPT_B })?.id, 'd');
  assertEquals(requirementFor(rows, { job_role: 'sales', department_id: DEPT_A })?.id, 'b');
  assertEquals(requirementFor(rows, { job_role: 'general', department_id: DEPT_B })?.id, 'c');
  assertEquals(requirementFor(rows, { job_role: 'general', department_id: null })?.id, 'a');
  assertEquals(requirementFor([], { job_role: 'general', department_id: null }), null);

  const bar = [{ id: 'x', job_role: null, department_id: null, level: 'b1', skills: { speaking: 'b2' }, due_date: '2026-10-01' }] as unknown as RequirementRow[];
  const short = standingOf(bar, { job_role: 'general', department_id: null }, 'b2', { speaking: { score: 50, level: 'b1' } }, '2026-10-20');
  assertEquals(short.meets, false);
  assertEquals(short.gaps, [{ skill: 'speaking', have: 'b1', want: 'b2' }]);
  assertEquals(short.overdue, true);
  // A required skill nobody measured is a gap, not a pass.
  assertEquals(standingOf(bar, { job_role: 'general', department_id: null }, 'b2', undefined, '2026-10-20').gaps, [{ skill: 'speaking', have: null, want: 'b2' }]);
  assertEquals(standingOf(bar, { job_role: 'general', department_id: null }, 'b2', { speaking: { score: 70, level: 'b2' } }, '2026-10-20').meets, true);
});

Deno.test('HR sets requirements; managers read; employees and other workspaces cannot', async () => {
  const { db, call } = setup();
  const created = await call('POST', path('insights/requirements'), { user: ADMIN, body: { job_role: 'sales', level: 'b2', skills: { speaking: 'b2' }, due_date: '2026-12-31' } });
  assertEquals(created.status, 200);
  assertEquals(created.body.requirement.source, 'hr');
  assertEquals((await call('POST', path('insights/requirements'), { user: MANAGER, body: { job_role: 'sales', level: 'b2' } })).status, 403);
  assertEquals((await call('POST', path('insights/requirements'), { user: ANNA, body: { job_role: 'sales', level: 'b2' } })).status, 403);
  assertEquals((await call('GET', path('insights/requirements'), { user: ANNA })).status, 403);
  assertEquals((await call('GET', path('insights/requirements'), { user: OUTSIDER })).status, 403);
  assertEquals((await call('POST', path('insights/requirements'), { user: ADMIN, body: { job_role: 'pilot', level: 'b2' } })).status, 400);
  assertEquals((await call('POST', path('insights/requirements'), { user: ADMIN, body: { job_role: 'sales', level: 'x9' } })).status, 400);
  assertEquals((await call('POST', path('insights/requirements'), { user: ADMIN, body: { job_role: 'sales', level: 'b1', skills: { typing: 'b1' } } })).status, 400);
  assertEquals((await call('POST', path('insights/requirements'), { user: ADMIN, body: { job_role: 'sales', level: 'b1', due_date: '2030-02-31' } })).status, 400);
  // Someone else's department is refused as if it does not exist.
  assertEquals((await call('POST', path('insights/requirements'), { user: ADMIN, body: { department_id: DEPT_OTHER, level: 'b1' } })).status, 400);

  const manager = await call('GET', path('insights/requirements'), { user: MANAGER });
  assertEquals(manager.status, 200);
  assertEquals(manager.body.can_manage, false);
  assertEquals(manager.body.departments.length, 1, 'a manager sees only their department');
  assert(manager.body.suggestions.some((row: { job_role: string; level: string }) => row.job_role === 'sales' && row.level === 'b2'));

  // Editing a suggestion makes it HR's own.
  db.rows('company_level_requirements')[0].source = 'suggestion';
  const edited = await call('PATCH', path(`insights/requirements/${created.body.requirement.id}`), { user: ADMIN, body: { level: 'b1' } });
  assertEquals(edited.body.requirement.source, 'hr');
  assertEquals((await call('PATCH', path(`insights/requirements/${crypto.randomUUID()}`), { user: ADMIN, body: { level: 'b1' } })).status, 404);
  assertEquals((await call('DELETE', path(`insights/requirements/${created.body.requirement.id}`), { user: ADMIN })).status, 200);
  assertEquals(db.rows('company_level_requirements').length, 0);
  assert(db.rows('company_audit').some((row) => row.action === 'requirement.deleted'));
});

Deno.test('only an unchanged suggestion keeps the Schood label', async () => {
  const { call } = setup();
  const same = await call('POST', path('insights/requirements'), { user: ADMIN, body: { job_role: 'sales', level: 'b2', skills: { speaking: 'b2' }, source: 'suggestion' } });
  assertEquals(same.body.requirement.source, 'suggestion');
  const changed = await call('POST', path('insights/requirements'), { user: ADMIN, body: { job_role: 'management', level: 'c1', skills: { speaking: 'b2', writing: 'b1' }, source: 'suggestion' } });
  assertEquals(changed.body.requirement.source, 'hr');
  const moreSkills = await call('POST', path('insights/requirements'), { user: ADMIN, body: { job_role: 'general', level: 'b1', skills: { reading: 'b1' }, source: 'suggestion' } });
  assertEquals(moreSkills.body.requirement.source, 'hr');
});

Deno.test('a requirement for an existing scope becomes a friendly 409', async () => {
  const { db, call } = setup();
  db.uniques.company_level_requirements = [{ columns: ['org_id', 'job_role'] }];
  await call('POST', path('insights/requirements'), { user: ADMIN, body: { job_role: 'sales', level: 'b2' } });
  const second = await call('POST', path('insights/requirements'), { user: ADMIN, body: { job_role: 'sales', level: 'b1' } });
  assertEquals(second.status, 409);
  assertEquals(second.body.code, 'requirement_exists');
});

Deno.test('suggestions apply to job roles in use, are marked, and add nothing the second time', async () => {
  const { db, call } = setup();
  const first = await call('POST', path('insights/requirements/apply-suggestions'), { user: ADMIN, body: {} });
  assertEquals(first.body.added, 2, 'hospitality and sales');
  assert(db.rows('company_level_requirements').every((row) => row.source === 'suggestion' && row.org_id === ORG));
  assertEquals((await call('POST', path('insights/requirements/apply-suggestions'), { user: ADMIN, body: {} })).body.added, 0);
});

Deno.test('requirements copy to targets only for people without one', async () => {
  const { db, call } = setup();
  db.rows('company_members').find((row) => row.id === member(4))!.target_level = 'c1';
  await call('POST', path('insights/requirements'), { user: ADMIN, body: { job_role: 'hospitality', level: 'b2', due_date: '2026-12-31' } });
  const synced = await call('POST', path('insights/requirements/sync-targets'), { user: ADMIN });
  assertEquals(synced.body.updated, 2);
  assertEquals(db.rows('company_members').find((row) => row.id === member(4))!.target_level, 'c1');
  assertEquals(db.rows('company_members').find((row) => row.id === member(5))!.target_level, 'b2');
  assertEquals(db.rows('company_members').find((row) => row.id === member(5))!.target_date, '2026-12-31');
});

// ---------------------------------------------------------------------------
// Skills-gap matrix
// ---------------------------------------------------------------------------

Deno.test('the skills gap counts learners, scores cells and keeps managers to their department', async () => {
  const { db, call } = setup();
  await call('POST', path('insights/requirements'), { user: ADMIN, body: { job_role: 'sales', level: 'b2', skills: { speaking: 'b2' } } });
  await call('POST', path('insights/requirements'), { user: ADMIN, body: { job_role: 'hospitality', level: 'b1', due_date: '2026-10-01' } });
  void db;
  const gap = await call('GET', path('insights/skills-gap'), { user: ADMIN });
  assertEquals(gap.status, 200);
  // Elena (b2), Anna (b1), Boris (none) in hospitality; Chen (a2), Daria (b2) in sales. Owner and admin do not count.
  assertEquals(gap.body.compliance.with_requirement, 5);
  assertEquals(gap.body.compliance.meets, 3);
  assertEquals(gap.body.compliance.percent, 60);
  assertEquals(gap.body.compliance.overdue, 1, 'Boris is past the due date');
  assertEquals(gap.body.compliance.untested, 1);
  const sales = gap.body.heat.find((row: { name: string }) => row.name === 'Sales');
  assertEquals(sales.skills.speaking.with_requirement, 2);
  assertEquals(sales.skills.speaking.met, 1);
  assertEquals(sales.skills.speaking.tested, 2);
  assertEquals(sales.skills.speaking.avg, 57);
  assertEquals(sales.skills.listening.tested, 0);
  assertEquals(sales.skills.listening.with_requirement, 0, 'nobody measured it and nobody asked for it separately');
  const salesRole = gap.body.roles.find((row: { job_role: string }) => row.job_role === 'sales');
  assertEquals(salesRole.counts.b2, 1);
  assertEquals(salesRole.counts.a2, 1);
  assertEquals(salesRole.requirement.level, 'b2');

  // The trend is measured with today's requirements on earlier results.
  assertEquals(gap.body.trend.length, 6);
  assertEquals(gap.body.trend[5].percent, 60);
  const september = gap.body.trend.find((row: { month: string }) => row.month === '2026-09');
  assertEquals(september.with_requirement, 5);
  assertEquals(september.meets, 2, 'Elena and Daria by the end of September; Anna was still A2');

  const manager = await call('GET', path('insights/skills-gap'), { user: MANAGER });
  assertEquals(manager.body.heat.length, 1);
  assertEquals(manager.body.heat[0].name, 'Front office');
  assertEquals(manager.body.compliance.with_requirement, 3);
  assertEquals((await call('GET', path('insights/skills-gap'), { user: ANNA })).status, 403);
});

Deno.test('the drill-down lists people in scope, filters, and shows no learning detail', async () => {
  const { call } = setup();
  await call('POST', path('insights/requirements'), { user: ADMIN, body: { job_role: 'sales', level: 'b2', skills: { speaking: 'b2' } } });
  const gaps = await call('GET', path(`insights/skills-gap/people?department=${DEPT_B}&status=gap`), { user: ADMIN });
  assertEquals(gaps.body.people.map((row: { name: string }) => row.name), ['Chen Wu']);
  assertEquals(gaps.body.people[0].gaps.map((row: { skill: string }) => row.skill), ['overall', 'speaking']);
  assertEquals('minutes' in gaps.body.people[0], false);
  const meets = await call('GET', path(`insights/skills-gap/people?department=${DEPT_B}&status=meets&skill=speaking`), { user: ADMIN });
  assertEquals(meets.body.people.map((row: { name: string }) => row.name), ['Daria Sokolova']);
  // A manager asking for another department gets nobody.
  const other = await call('GET', path(`insights/skills-gap/people?department=${DEPT_B}`), { user: MANAGER });
  assertEquals(other.body.total, 0);
  assertEquals((await call('GET', path('insights/skills-gap/people?status=nonsense'), { user: ADMIN })).status, 400);
  assertEquals((await call('GET', path('insights/skills-gap/people?department=x'), { user: ADMIN })).status, 400);
  assertEquals((await call('GET', path('insights/skills-gap/people?level=none'), { user: ADMIN })).body.people[0].name, 'Boris Popov');
});

// ---------------------------------------------------------------------------
// At-risk learners
// ---------------------------------------------------------------------------

Deno.test('at-risk rules: tests for everyone, learning signals only with consent and a seat', async () => {
  const { db, call } = setup();
  await call('POST', path('insights/requirements'), { user: ADMIN, body: { job_role: 'sales', level: 'b2', due_date: '2026-11-01' } });
  db.rows('company_assignments').push(
    { id: 'as1', org_id: ORG, track_code: 'sales', target_level: null, due_date: '2026-10-01', department_id: DEPT_B, member_id: null, status: 'active', created_at: ago(40) },
    { id: 'as2', org_id: ORG, track_code: 'hospitality', target_level: null, due_date: '2026-10-01', department_id: DEPT_A, member_id: null, status: 'active', created_at: ago(40) },
  );
  const risk = await call('GET', path('insights/at-risk?inactive_days=14'), { user: ADMIN });
  assertEquals(risk.status, 200);
  const by = (name: string) => risk.body.people.find((row: { name: string }) => row.name === name);
  assertEquals(by('Boris Popov').reasons.map((row: { code: string }) => row.code), ['no_placement'], 'no consent: only the test signal, not his lessons');
  assertEquals(by('Boris Popov').suggestion.action, 'placement');
  const chen = by('Chen Wu').reasons.map((row: { code: string }) => row.code);
  assert(chen.includes('falling_score'));
  assert(chen.includes('inactive'));
  assert(chen.includes('behind_assignment'));
  assert(chen.includes('behind_requirement'));
  // He is already on the sales track through his department, so the suggestion is a reminder, not the same track again.
  assertEquals(by('Chen Wu').suggestion.track_code, null);
  assertEquals(by('Chen Wu').suggestion.action, 'nudge');
  assertEquals(by('Chen Wu').suggestion.target_level, 'b2');
  // Daria has no seat: no learning signals, but she is behind nothing else.
  assertEquals(by('Daria Sokolova'), undefined);
  assertEquals(by('Anna Lee').reasons.map((row: { code: string }) => row.code), ['behind_assignment']);
  assertEquals(risk.body.counts.falling_score, 1);
  assertEquals(risk.body.can_assign, true);
  // A longer window clears nobody who is really quiet; a manager sees only their department.
  const manager = await call('GET', path('insights/at-risk'), { user: MANAGER });
  assertEquals(manager.body.people.some((row: { name: string }) => row.name === 'Chen Wu'), false);
  assertEquals(manager.body.can_assign, false);
  assertEquals((await call('GET', path('insights/at-risk?inactive_days=1'), { user: ADMIN })).status, 400);
});

Deno.test('someone not yet on their track is offered it, with their requirement as the target', async () => {
  const { call } = setup();
  await call('POST', path('insights/requirements'), { user: ADMIN, body: { job_role: 'sales', level: 'b2', due_date: '2026-11-01' } });
  const risk = await call('GET', path('insights/at-risk'), { user: ADMIN });
  const chen = risk.body.people.find((row: { name: string }) => row.name === 'Chen Wu');
  assertEquals(chen.suggestion, { action: 'assign', track_code: 'sales', target_level: 'b2', due_date: '2026-11-01' });
});

Deno.test('a pilot flags test results only, and cannot assign', async () => {
  const { call } = setup({ status: 'pilot', seats: 0 });
  const risk = await call('GET', path('insights/at-risk'), { user: ADMIN });
  assertEquals(risk.body.learning_signals, false);
  assertEquals(risk.body.can_assign, false);
  const codes = risk.body.people.flatMap((row: { reasons: { code: string }[] }) => row.reasons.map((reason) => reason.code));
  assertEquals(codes.includes('inactive'), false);
  assertEquals(codes.includes('falling_score'), true);
  const assign = await call('POST', path(`insights/at-risk/${member(6)}/assign`), { user: ADMIN, body: {} });
  assertEquals(assign.status, 402);
  assertEquals(assign.body.code, 'seat_required');
});

Deno.test('one-click assign is scoped, HR only and cannot happen twice', async () => {
  const { db, call } = setup();
  assertEquals((await call('POST', path(`insights/at-risk/${member(6)}/assign`), { user: MANAGER, body: {} })).status, 403);
  assertEquals((await call('POST', path(`insights/at-risk/${member(8)}/assign`), { user: ADMIN, body: {} })).status, 404, 'someone in another workspace');
  assertEquals((await call('POST', path('insights/at-risk/not-an-id/assign'), { user: ADMIN, body: {} })).status, 404);
  assertEquals((await call('POST', path(`insights/at-risk/${member(7)}/assign`), { user: ADMIN, body: {} })).status, 402, 'no seat');
  const assigned = await call('POST', path(`insights/at-risk/${member(6)}/assign`), { user: ADMIN, body: { target_level: 'b2', due_date: '2026-12-01' } });
  assertEquals(assigned.status, 200);
  assertEquals(assigned.body.assignment.track_code, 'sales');
  assertEquals(assigned.body.assignment.member_id, member(6));
  const again = await call('POST', path(`insights/at-risk/${member(6)}/assign`), { user: ADMIN, body: {} });
  assertEquals(again.status, 409);
  assertEquals(again.body.code, 'already_assigned');
  assertEquals(db.rows('company_assignments').length, 1);
  // The lock alone also stops a second track on the same day.
  const other = await call('POST', path(`insights/at-risk/${member(6)}/assign`), { user: ADMIN, body: { track_code: 'general' } });
  assertEquals(other.status, 409);
  assertEquals((await call('POST', path(`insights/at-risk/${member(4)}/assign`), { user: ADMIN, body: { due_date: '2020-01-01' } })).status, 400);
  assertEquals((await call('POST', path(`insights/at-risk/${member(4)}/assign`), { user: ADMIN, body: { track_code: 'nope' } })).status, 400);
});

Deno.test('the at-risk list exports to a formula-safe CSV in scope', async () => {
  const { db, call } = setup();
  db.rows('company_members').find((row) => row.id === member(5))!.full_name = '@Boris';
  const result = await call('GET', path('insights/at-risk?format=csv'), { user: ADMIN });
  assertEquals(result.status, 200);
  assertStringIncludes(result.body.csv, `'@Boris`);
  assertStringIncludes(result.body.csv, 'no_placement');
  const manager = await call('GET', path('insights/at-risk?format=csv'), { user: MANAGER });
  assertEquals(manager.body.csv.includes('Chen'), false);
  assert(db.rows('company_audit').some((row) => row.action === 'risk.exported'));
});

Deno.test('a copied nudge is one record a day; a snooze hides someone until it ends', async () => {
  const { db, call } = setup();
  const nudge = () => call('POST', path(`insights/at-risk/${member(5)}/action`), { user: MANAGER, body: { kind: 'nudge', reason: 'no_placement' } });
  assertEquals((await nudge()).status, 200);
  assertEquals((await nudge()).status, 200);
  assertEquals(db.rows('company_risk_actions').length, 1);
  // A manager cannot act on someone outside their department.
  assertEquals((await call('POST', path(`insights/at-risk/${member(6)}/action`), { user: MANAGER, body: { kind: 'nudge', reason: 'inactive' } })).status, 404);
  assertEquals((await call('POST', path(`insights/at-risk/${member(5)}/action`), { user: MANAGER, body: { kind: 'nudge', reason: 'bad' } })).status, 400);
  const before = await call('GET', path('insights/at-risk'), { user: ADMIN });
  assertEquals(before.body.people.find((row: { name: string }) => row.name === 'Boris Popov').last_nudge, '2026-10-20');

  const snoozed = await call('POST', path(`insights/at-risk/${member(5)}/action`), { user: ADMIN, body: { kind: 'snooze', days: 7 } });
  assertEquals(snoozed.body.until, '2026-10-27');
  assertEquals((await call('GET', path('insights/at-risk'), { user: ADMIN })).body.people.some((row: { name: string }) => row.name === 'Boris Popov'), false);
  assertEquals((await call('GET', path('insights/at-risk?snoozed=1'), { user: ADMIN })).body.people.find((row: { name: string }) => row.name === 'Boris Popov').snoozed_until, '2026-10-27');
  assertEquals((await call('DELETE', path(`insights/at-risk/${member(5)}/snooze`), { user: ADMIN })).status, 200);
  assertEquals((await call('GET', path('insights/at-risk'), { user: ADMIN })).body.people.some((row: { name: string }) => row.name === 'Boris Popov'), true);
});

// ---------------------------------------------------------------------------
// Cohorts
// ---------------------------------------------------------------------------

Deno.test('cohorts compare two dates per department and list who moved up', async () => {
  const { call } = setup();
  const cohorts = await call('GET', path('insights/cohorts?from=2026-09-01&to=2026-10-20'), { user: ADMIN });
  assertEquals(cohorts.status, 200);
  assertEquals(cohorts.body.total.up, 1, 'Anna');
  assertEquals(cohorts.body.total.down, 1, 'Chen');
  assertEquals(cohorts.body.total.levels_gained, 1);
  assertEquals(cohorts.body.total.not_tested, 1, 'Boris');
  assertEquals(cohorts.body.promotion.map((row: { name: string }) => row.name), ['Anna Lee']);
  assertEquals(cohorts.body.promotion[0].from_level, 'a2');
  assertEquals(cohorts.body.promotion[0].to_level, 'b1');
  assertEquals('email' in cohorts.body.promotion[0], false);
  assert(cohorts.body.matrix.some((row: { from: string; to: string; count: number }) => row.from === 'a2' && row.to === 'b1' && row.count === 1));
  const front = cohorts.body.departments.find((row: { name: string }) => row.name === 'Front office');
  assertEquals(front.up, 1);

  const manager = await call('GET', path('insights/cohorts?from=2026-09-01&to=2026-10-20'), { user: MANAGER });
  assertEquals(manager.body.total.down, 0);
  assertEquals(manager.body.departments.length, 1);
  // Before a retest nothing moved.
  const early = await call('GET', path('insights/cohorts?from=2026-08-01&to=2026-09-30'), { user: ADMIN });
  assertEquals(early.body.total.up, 0);
  assertEquals((await call('GET', path('insights/cohorts?from=2026-10-20&to=2026-01-01'), { user: ADMIN })).status, 400);
  assertEquals((await call('GET', path('insights/cohorts?from=2023-01-01&to=2026-01-01'), { user: ADMIN })).status, 400);
  assertEquals((await call('GET', path('insights/cohorts'), { user: ANNA })).status, 403);
});

Deno.test('the moved-up CSV neutralises formulas', async () => {
  const { db, call } = setup();
  db.rows('company_members').find((row) => row.id === member(4))!.full_name = '=HYPERLINK("x")';
  const result = await call('GET', path('insights/cohorts?from=2026-09-01&to=2026-10-20&format=csv'), { user: ADMIN });
  assertEquals(result.body.rows, 1);
  assertStringIncludes(result.body.csv, `"'=HYPERLINK(""x"")"`);
  assert(db.rows('company_audit').some((row) => row.action === 'cohort.exported'));
});

// ---------------------------------------------------------------------------
// Spend
// ---------------------------------------------------------------------------

Deno.test('value is plain division and an empty denominator is no number at all', () => {
  assertEquals(valueOf(1000, { active: 4, minutes: 120, levels_gained: 5 }), { per_active: 250, per_level: 200, per_hour: 500 });
  assertEquals(valueOf(1000, { active: 0, minutes: 0, levels_gained: 0 }), { per_active: null, per_level: null, per_hour: null });
});

Deno.test('spend entries are HR only, validated, and divided per currency', async () => {
  const { db, call } = setup();
  const add = (body: unknown, who = ADMIN) => call('POST', path('insights/spend'), { user: who, body });
  assertEquals((await add({ spent_on: '2026-10-01', amount: 1_000_000, currency: 'UZS', category: 'schood', description: 'October invoice' })).status, 200);
  await add({ spent_on: '2026-10-02', amount: '500 000', currency: 'UZS', category: 'trainer' });
  await add({ spent_on: '2026-10-03', amount: 300.5, currency: 'USD' });
  assertEquals((await add({ spent_on: '2026-10-03', amount: 300 }, MANAGER)).status, 403);
  assertEquals((await add({ spent_on: '2026-02-31', amount: 300 })).status, 400);
  assertEquals((await add({ spent_on: '2030-01-01', amount: 300 })).status, 400);
  assertEquals((await add({ spent_on: '2026-10-03', amount: -5 })).status, 400);
  assertEquals((await add({ spent_on: '2026-10-03', amount: 'lots' })).status, 400);
  assertEquals((await add({ spent_on: '2026-10-03', amount: 5, currency: 'GBP' })).status, 400);
  assertEquals((await add({ spent_on: '2026-10-03', amount: 5, description: 'a\u0000b' })).status, 400);
  assertEquals((await call('GET', path('insights/spend'), { user: MANAGER })).status, 403);

  const spend = await call('GET', path('insights/spend?from=2026-09-01&to=2026-10-20'), { user: ADMIN });
  assertEquals(spend.status, 200);
  // Anna and Elena were active and share; Boris's 500 minutes do not count. Anna moved up one level.
  assertEquals(spend.body.outcome.active, 2);
  assertEquals(spend.body.outcome.minutes, 120);
  assertEquals(spend.body.outcome.levels_gained, 1);
  const uzs = spend.body.value.find((row: { currency: string }) => row.currency === 'UZS');
  assertEquals(uzs.total, 1_500_000);
  assertEquals(uzs.per_active, 750_000);
  assertEquals(uzs.per_level, 1_500_000);
  assertEquals(uzs.per_hour, 750_000);
  assertEquals(uzs.by_category.map((row: { category: string }) => row.category), ['schood', 'trainer']);
  assertEquals(spend.body.value.find((row: { currency: string }) => row.currency === 'USD').total, 300.5);

  const id = spend.body.entries.find((row: { description: string | null }) => row.description === 'October invoice').id;
  assertEquals((await call('PATCH', path(`insights/spend/${id}`), { user: ADMIN, body: { amount: 2_000_000 } })).body.entry.amount, 2_000_000);
  const csvResult = await call('GET', path('insights/spend?from=2026-09-01&to=2026-10-20&format=csv'), { user: ADMIN });
  assertStringIncludes(csvResult.body.csv, 'October invoice');
  assertEquals((await call('DELETE', path(`insights/spend/${id}`), { user: ADMIN })).status, 200);
  assertEquals((await call('DELETE', path(`insights/spend/${id}`), { user: ADMIN })).status, 404);
  db.rows('company_training_spend').push({ id: 'b0000000-0000-4000-8000-000000000001', org_id: OTHER_ORG, spent_on: '2026-10-01', amount: 9, currency: 'UZS', category: 'other' });
  assertEquals((await call('DELETE', path('insights/spend/b0000000-0000-4000-8000-000000000001'), { user: ADMIN })).status, 404, 'another workspace');
});

// ---------------------------------------------------------------------------
// Executive page and snapshots
// ---------------------------------------------------------------------------

Deno.test('the executive page is HR only, and a saved month does not change later', async () => {
  const { db, call } = setup();
  assertEquals((await call('GET', path('insights/executive'), { user: MANAGER })).status, 403);
  const live = await call('GET', path('insights/executive'), { user: ADMIN });
  assertEquals(live.status, 200);
  assertEquals(live.body.frozen, null);
  assertEquals(live.body.data.people.people, 7);
  assertEquals(live.body.data.people.learners, 5);
  assertEquals(live.body.data.activity.minutes, 120, 'Boris does not count');
  assertEquals(live.body.data.hiring.shortlisted, 1);
  assertEquals(live.body.data.levels.none, 1);
  assertEquals(live.body.data.movement.up, 1);

  const saved = await call('POST', path('insights/snapshots'), { user: ADMIN, body: { month: '2026-10' } });
  assertEquals(saved.status, 200);
  assertEquals(saved.body.snapshot.kind, 'manual');
  const twice = await call('POST', path('insights/snapshots'), { user: ADMIN, body: { month: '2026-10' } });
  assertEquals(twice.status, 409);
  assertEquals(twice.body.code, 'snapshot_exists');

  // People learn more after the snapshot; the saved copy stays as it was.
  db.rows('company_activity').push({ id: 99, org_id: ORG, member_id: member(4), user_id: ANNA, kind: 'lesson', minutes: 999, points: 1, created_at: ago(0) });
  const frozen = await call('GET', path(`insights/executive?snapshot=${saved.body.snapshot.id}`), { user: ADMIN });
  assertEquals(frozen.body.frozen.id, saved.body.snapshot.id);
  assertEquals(frozen.body.data.activity.minutes, 120);
  assertEquals((await call('GET', path('insights/executive'), { user: ADMIN })).body.data.activity.minutes, 1119);
  assertEquals((await call('GET', path(`insights/executive?snapshot=${crypto.randomUUID()}`), { user: ADMIN })).status, 404);
  assertEquals((await call('POST', path('insights/snapshots'), { user: ADMIN, body: { month: '2027-01' } })).status, 400);
  assertEquals((await call('POST', path('insights/snapshots'), { user: ADMIN, body: { month: 'soon' } })).status, 400);
});

Deno.test('opening the page saves last month once when the nightly job has not', async () => {
  const { db, call } = setup();
  await call('GET', path('insights/executive'), { user: ADMIN });
  await call('GET', path('insights/executive'), { user: ADMIN });
  const rows = db.rows('company_insight_snapshots');
  assertEquals(rows.length, 1);
  assertEquals(rows[0].period, '2026-09');
  assertEquals(rows[0].kind, 'monthly');
  // A finished month is read from the frozen copy from now on.
  const september = await call('GET', path('insights/executive?month=2026-09'), { user: ADMIN });
  assertEquals(september.body.frozen.kind, 'monthly');
  assertEquals(september.body.history.length, 1);
  assertEquals(september.body.data.period.to, '2026-09-30');
  // Anna was A2 at the end of September, and the Oct retest does not count there.
  assertEquals(september.body.data.levels.a2, 1);
  assertEquals(september.body.data.levels.b1, 1);
});

Deno.test('a workspace created this month has no last month to save', async () => {
  const { db, call } = setup();
  db.rows('company_orgs').find((row) => row.id === ORG)!.created_at = ago(3);
  await call('GET', path('insights/executive'), { user: ADMIN });
  assertEquals(db.rows('company_insight_snapshots').length, 0);
});

Deno.test('the narrative sends numbers only, is kept with a snapshot and survives AI failure', async () => {
  let sent = '';
  const ok: AiCall = <T>(request: { userPayload: string }, _fallback: T) => {
    sent = request.userPayload;
    return Promise.resolve({ data: { headline: 'Compliance is 60', paragraphs: ['Up 1 level; 77 is made up.'] } as T, status: 'ok' as const });
  };
  const { db, call } = setup({ ai: ok });
  db.rpcs.company_consume_ai = () => true;
  const saved = await call('POST', path('insights/snapshots'), { user: ADMIN, body: { month: '2026-10' } });
  const result = await call('POST', path('insights/executive/narrative'), { user: ADMIN, body: { month: '2026-10', snapshot: saved.body.snapshot.id, locale: 'uz' } });
  assertEquals(result.status, 200);
  assertEquals(result.body.status, 'ok');
  assertEquals(sent.includes('anna@'), false);
  assertEquals(sent.includes('Anna'), false);
  assertEquals(result.body.narrative.numbers_to_check.includes('77'), true);
  assertEquals((db.rows('company_insight_snapshots')[0].narratives as Record<string, unknown>).uz !== undefined, true);
  const read = await call('GET', path(`insights/executive?snapshot=${saved.body.snapshot.id}`), { user: ADMIN });
  assertEquals(read.body.narratives.uz.headline, 'Compliance is 60');

  const failing = setup();
  failing.db.rpcs.company_consume_ai = () => true;
  assertEquals((await failing.call('POST', path('insights/executive/narrative'), { user: ADMIN, body: {} })).body.status, 'unavailable');
  const capped = setup({ ai: ok });
  capped.db.rpcs.company_consume_ai = () => false;
  assertEquals((await capped.call('POST', path('insights/executive/narrative'), { user: ADMIN, body: {} })).body.status, 'limit');
  const suspended = setup({ ai: ok, status: 'suspended' });
  assertEquals((await suspended.call('POST', path('insights/executive/narrative'), { user: ADMIN, body: {} })).status, 403);
  assertEquals((await suspended.call('GET', path('insights/executive'), { user: ADMIN })).status, 200);
});

Deno.test('a commentary on screen is saved with the month, and its numbers are checked again', async () => {
  const { db, call } = setup();
  const saved = await call('POST', path('insights/snapshots'), { user: ADMIN, body: { month: '2026-10', narratives: { ru: { headline: 'Итог', paragraphs: ['Выросли 1 и 999.'] }, xx: { headline: 'no' } } } });
  assertEquals(saved.status, 200);
  const row = db.rows('company_insight_snapshots')[0] as { narratives: Record<string, { numbers_to_check: string[] }> };
  assertEquals(Object.keys(row.narratives), ['ru']);
  assertEquals(row.narratives.ru.numbers_to_check, ['999']);
});

Deno.test('numbers in AI text that are not in the data are flagged', () => {
  const data = { activity: { minutes: 120 }, compliance: { with_requirement: 5, meets: 3 }, people: { people: 6, tested: 3, sharing: 3 }, departments: [] };
  assertEquals(unknownNumbers('5 people, 60% and 2 hours; 3 met it.', data), []);
  assertEquals(unknownNumbers('Up 31 points in 7 days.', data), ['31', '7']);
});

Deno.test('executiveData reads levels at the end of a finished month', async () => {
  const { db } = setup();
  const org = db.rows('company_orgs')[0];
  const ctx = { db, org, member: db.rows('company_members')[1], staff: false, now: () => NOW, user: ADMIN } as never;
  const august = await executiveData(ctx, '2026-08');
  assertEquals(august.levels.a2, 1, 'Anna');
  assertEquals(august.movement.first, 4, 'Anna, Chen, Daria and Elena were first tested in August');
  assertEquals(august.period.to, '2026-08-31');
});

// ---------------------------------------------------------------------------
// Report builder and saved views
// ---------------------------------------------------------------------------

const REPORT = { rows: 'department', columns: ['people', 'tested', 'minutes', 'moved_up'], filters: {}, period: { preset: 'custom', from: '2026-09-01', to: '2026-10-20' } };

Deno.test('the report builder groups, filters, respects consent and scope', async () => {
  const { call } = setup();
  const run = await call('POST', path('insights/builder/run'), { user: ADMIN, body: REPORT });
  assertEquals(run.status, 200);
  const front = run.body.rows.find((row: { label: string }) => row.label === 'Front office');
  assertEquals(front.values.people, 3);
  assertEquals(front.values.minutes, 120, 'Boris is left out');
  assertEquals(front.values.moved_up, 1);
  assertEquals(run.body.total.people, 5);

  const person = await call('POST', path('insights/builder/run'), { user: ADMIN, body: { ...REPORT, rows: 'person' } });
  const boris = person.body.rows.find((row: { label: string }) => row.label.startsWith('Boris'));
  assertEquals(boris.values.minutes, null, 'blank, not zero, for someone who does not share');
  assertEquals(boris.values.people, 1);

  const filtered = await call('POST', path('insights/builder/run'), { user: ADMIN, body: { ...REPORT, rows: 'level', filters: { levels: ['none'], seat: 'yes' } } });
  assertEquals(filtered.body.total.people, 1);
  assertEquals(filtered.body.rows[0].key, 'none');

  const months = await call('POST', path('insights/builder/run'), { user: ADMIN, body: { ...REPORT, rows: 'month', columns: ['tests_graded', 'minutes', 'avg_level'] } });
  assertEquals(months.body.rows.map((row: { key: string }) => row.key), ['2026-09', '2026-10']);
  assertEquals(months.body.rows[1].values.minutes, 120);
  assertEquals(months.body.rows[1].values.tests_graded, 2);

  const manager = await call('POST', path('insights/builder/run'), { user: MANAGER, body: { ...REPORT, filters: { department_ids: [DEPT_B] } } });
  assertEquals(manager.body.total.people, 0, 'a manager cannot widen their scope with a filter');
  assertEquals((await call('POST', path('insights/builder/run'), { user: ANNA, body: REPORT })).status, 403);
  assertEquals((await call('POST', path('insights/builder/run'), { user: ADMIN, body: { ...REPORT, columns: [] } })).status, 400);
  assertEquals((await call('POST', path('insights/builder/run'), { user: ADMIN, body: { ...REPORT, columns: ['salary'] } })).status, 400);
  assertEquals((await call('POST', path('insights/builder/run'), { user: ADMIN, body: { ...REPORT, rows: 'nope' } })).status, 400);
  assertEquals((await call('POST', path('insights/builder/run'), { user: ADMIN, body: { ...REPORT, period: { preset: 'custom', from: 'x', to: 'y' } } })).status, 400);
});

Deno.test('a saved period stays relative', () => {
  assertEquals(periodRange({ preset: 'last_30' }, NOW).from, '2026-09-21');
  assertEquals(periodRange({ preset: 'last_month' }, NOW).to, '2026-09-30');
  assertEquals(periodRange({ preset: 'this_year' }, NOW).from, '2026-01-01');
  assertEquals(periodRange({ preset: 'this_month' }, NOW).from, '2026-10-01');
});

Deno.test('the report CSV is formula-safe and uses the labels sent', async () => {
  const { db, call } = setup();
  db.rows('company_departments').find((row) => row.id === DEPT_A)!.name = '+Front';
  const result = await call('POST', path('insights/builder/export'), { user: ADMIN, body: { config: REPORT, labels: { 'col:people': 'Сотрудники', 'rows:department': 'Отдел', total: 'Итого', 'col:tested': '=evil' } } });
  assertEquals(result.status, 200);
  const lines = result.body.csv.split('\r\n');
  assertStringIncludes(lines[0], 'Отдел,Сотрудники');
  assertStringIncludes(lines[0], `'=evil`);
  assert(lines.some((line: string) => line.startsWith(`'+Front,`)));
  assert(lines[lines.length - 1].startsWith('Итого,5'));
});

Deno.test('saved views belong to the workspace; only their author or HR changes them', async () => {
  const { db, call } = setup();
  db.uniques.company_saved_views = [{ columns: ['org_id', 'name'] }];
  const created = await call('POST', path('insights/views'), { user: MANAGER, body: { name: 'My team', config: REPORT } });
  assertEquals(created.status, 200);
  const duplicate = await call('POST', path('insights/views'), { user: ADMIN, body: { name: 'My team', config: REPORT } });
  assertEquals(duplicate.status, 409);
  assertEquals(duplicate.body.code, 'view_name_taken');
  const id = created.body.view.id;
  const listed = await call('GET', path('insights/views'), { user: ADMIN });
  assertEquals(listed.body.views[0].can_edit, true);
  const hr = await call('POST', path('insights/views'), { user: ADMIN, body: { name: 'Whole company', config: REPORT } });
  assertEquals((await call('PATCH', path(`insights/views/${hr.body.view.id}`), { user: MANAGER, body: { name: 'Mine now' } })).status, 403);
  assertEquals((await call('DELETE', path(`insights/views/${hr.body.view.id}`), { user: MANAGER })).status, 403);
  assertEquals((await call('PATCH', path(`insights/views/${id}`), { user: MANAGER, body: { name: 'Front desk' } })).body.view.name, 'Front desk');
  assertEquals((await call('POST', path('insights/views'), { user: ADMIN, body: { name: 'x', config: REPORT } })).status, 400);
  assertEquals((await call('POST', path('insights/views'), { user: ADMIN, body: { name: 'Bad dates', config: { ...REPORT, period: { preset: 'custom', from: '2026-02-31', to: '2026-03-01' } } } })).status, 400);
  assertEquals((await call('POST', path('insights/views'), { user: ADMIN, body: { name: 'Bad', config: { rows: 'department', columns: [] } } })).status, 400);
  assertEquals((await call('DELETE', path(`insights/views/${id}`), { user: ADMIN })).status, 200);
  assertEquals((await call('GET', path('insights/views'), { user: ANNA })).status, 403);
  const stranger = await call('DELETE', path(`insights/views/${id}`), { user: ADMIN });
  assertEquals(stranger.status, 404);
});

// ---------------------------------------------------------------------------
// Manager home
// ---------------------------------------------------------------------------

Deno.test('manager home shows one department; a manager cannot open another', async () => {
  const { db, call } = setup();
  db.rows('company_sessions').push(
    { id: 's0000000-0000-4000-8000-000000000001'.replace('s', 'a'), org_id: ORG, title: 'Front desk class', kind: 'class', trainer: 'Lola', starts_at: new Date(NOW.getTime() + 2 * DAY).toISOString(), duration_minutes: 60, department_ids: [DEPT_A], member_ids: [], status: 'scheduled', location: null, link: null },
    { id: 's0000000-0000-4000-8000-000000000002'.replace('s', 'a'), org_id: ORG, title: 'Sales class', kind: 'class', trainer: null, starts_at: new Date(NOW.getTime() + 2 * DAY).toISOString(), duration_minutes: 60, department_ids: [DEPT_B], member_ids: [], status: 'scheduled', location: null, link: null },
  );
  db.rows('company_assignments').push(
    { id: 'as1', org_id: ORG, track_code: 'hospitality', target_level: null, due_date: '2026-10-01', department_id: DEPT_A, member_id: null, status: 'active', created_at: ago(40) },
    { id: 'as2', org_id: ORG, track_code: 'sales', target_level: null, due_date: '2026-10-01', department_id: DEPT_B, member_id: null, status: 'active', created_at: ago(40) },
  );
  const home = await call('GET', path(`insights/team?department=${DEPT_B}`), { user: MANAGER });
  assertEquals(home.status, 200);
  assertEquals(home.body.department.name, 'Front office', 'the URL does not widen a manager');
  assertEquals(home.body.kpis.people, 3);
  assertEquals(home.body.kpis.active7, 2, 'Anna and Elena; Boris does not share');
  assertEquals(home.body.upcoming.map((row: { title: string }) => row.title), ['Front desk class']);
  assertEquals(home.body.upcoming[0].invited, 3);
  assertEquals(home.body.overdue.map((row: { id: string }) => row.id), ['as1']);
  assert(home.body.nudge.some((row: { name: string }) => row.name === 'Boris Popov'));
  assertEquals(home.body.nudge.some((row: { name: string }) => row.name === 'Chen Wu'), false);

  const hr = await call('GET', path(`insights/team?department=${DEPT_B}`), { user: ADMIN });
  assertEquals(hr.body.department.name, 'Sales');
  assertEquals(hr.body.departments.length, 2);
  assertEquals((await call('GET', path(`insights/team?department=${DEPT_OTHER}`), { user: ADMIN })).status, 404);
  assertEquals((await call('GET', path('insights/team'), { user: ANNA })).status, 403);

  db.rows('company_members').find((row) => row.id === member(3))!.department_id = null;
  const lost = await call('GET', path('insights/team'), { user: MANAGER });
  assertEquals(lost.body.department, null);
  assertEquals(lost.body.unassigned, true);
});

// ---------------------------------------------------------------------------
// Challenges: templates, teams, active days, auto-finish, winners
// ---------------------------------------------------------------------------

const newChallenge = (extra: Record<string, unknown> = {}) => ({ title: 'Autumn cup', metric: 'minutes', starts_on: '2026-10-10', ends_on: '2026-10-30', ...extra });

Deno.test('team challenges are validated and rank teams by average per person', async () => {
  const { call } = setup();
  const teams = [{ name: 'Lobby', department_ids: [DEPT_A] }, { name: 'Deals', department_ids: [DEPT_B] }];
  const created = await call('POST', path('challenges'), { user: ADMIN, body: newChallenge({ mode: 'teams', teams, template: 'department_cup', prize: 'Team dinner' }) });
  assertEquals(created.status, 200);
  assertEquals(created.body.challenge.mode, 'teams');
  assertEquals(created.body.challenge.department_ids.sort(), [DEPT_A, DEPT_B].sort());
  assertEquals(created.body.challenge.prize, 'Team dinner');
  assertEquals('final_results' in created.body.challenge, false);
  const standings = await call('GET', path(`challenges/${created.body.challenge.id}`), { user: ANNA });
  assertEquals(standings.body.teams.map((row: { name: string }) => row.name), ['Lobby', 'Deals']);
  assertEquals(standings.body.teams[0].rank, 1);
  assertEquals(standings.body.teams[0].total, 120);

  const body = (over: unknown) => ({ user: ADMIN, body: newChallenge({ mode: 'teams', teams: over }) });
  assertEquals((await call('POST', path('challenges'), body([teams[0]]))).status, 400);
  assertEquals((await call('POST', path('challenges'), body([teams[0], { name: 'Same', department_ids: [DEPT_A] }]))).status, 400);
  assertEquals((await call('POST', path('challenges'), body([teams[0], { name: 'Other', department_ids: [DEPT_OTHER] }]))).status, 400);
  assertEquals((await call('POST', path('challenges'), body([teams[0], { name: 'None', department_ids: [] }]))).status, 400);
  assertEquals((await call('POST', path('challenges'), { user: ADMIN, body: newChallenge({ template: 'nope' }) })).status, 400);
  // Teams cannot be swapped once it runs.
  assertEquals((await call('PATCH', path(`challenges/${created.body.challenge.id}`), { user: ADMIN, body: { teams } })).status, 409);
});

Deno.test('active days count distinct days', async () => {
  const { call } = setup();
  const created = await call('POST', path('challenges'), { user: ADMIN, body: newChallenge({ metric: 'active_days' }) });
  const standings = await call('GET', path(`challenges/${created.body.challenge.id}`), { user: ADMIN });
  const anna = standings.body.people.find((row: { name: string }) => row.name === 'Anna Lee');
  assertEquals(anna.value, 2);
});

Deno.test('a finished challenge freezes its results, and the winners page reads them', async () => {
  const { db, call } = setup();
  const created = await call('POST', path('challenges'), { user: ADMIN, body: newChallenge({ ends_on: '2026-10-20', prize: 'Books' }) });
  const id = created.body.challenge.id;
  // Past its end date with nobody touching it: auto-finish.
  const row = db.rows('company_challenges').find((entry) => entry.id === id)!;
  row.ends_on = '2026-10-19';

  const winners = await call('GET', path('challenges/winners'), { user: BORIS });
  assertEquals(winners.status, 200);
  assertEquals(winners.body.winners.length, 1);
  const entry = winners.body.winners[0];
  assertEquals(entry.prize, 'Books');
  assertEquals(entry.top[0].value, 60);
  // Colleagues see a short name.
  assert(entry.top.some((person: { name: string }) => person.name === 'Anna L.'));
  assertEquals(entry.top.some((person: { name: string }) => person.name?.includes('@')), false);
  assertExists(row.final_results);
  assertExists(row.finished_at);

  // Later activity and a person leaving do not rewrite what was won.
  db.rows('company_activity').push({ id: 77, org_id: ORG, member_id: member(6), user_id: CHEN, kind: 'lesson', minutes: 500, points: 500, created_at: ago(5) });
  db.rows('company_members').find((entry) => entry.id === member(3))!.status = 'removed';
  const after = await call('GET', path(`challenges/${id}`), { user: ADMIN });
  assertEquals(after.body.total, 120);
  assertEquals(after.body.frozen_at, row.finished_at);
  assertEquals(after.body.people.some((person: { name: string | null }) => person.name === 'Chen Wu'), false);
  const nameless = after.body.people.filter((person: { name: string | null }) => person.name === null);
  assertEquals(nameless.length, 1, 'someone who left stays as a rank without a name');
  // Read twice: the first freeze stands.
  const finishedAt = row.finished_at;
  await call('GET', path('challenges'), { user: ADMIN });
  assertEquals(row.finished_at, finishedAt);
});

Deno.test('a suspended workspace can still read winners', async () => {
  const { db, call } = setup({ status: 'suspended' });
  db.rows('company_challenges').push({ id: 'c0000000-0000-4000-8000-000000000001', org_id: ORG, title: 'Old cup', metric: 'points', starts_on: '2026-09-01', ends_on: '2026-09-30', department_ids: [], teams: [], mode: 'individual', final_results: null });
  assertEquals((await call('GET', path('challenges/winners'), { user: ADMIN })).status, 200);
  assertEquals((await call('POST', path('challenges'), { user: ADMIN, body: newChallenge() })).status, 403);
});

// ---------------------------------------------------------------------------
// Sessions: series, trainer notes, attendance rates
// ---------------------------------------------------------------------------

const newSeries = (extra: Record<string, unknown> = {}) => ({ title: 'Weekly class', starts_at: new Date(NOW.getTime() + DAY).toISOString(), duration_minutes: 60, repeat: 'weekly', count: 4, department_ids: [DEPT_A], ...extra });

Deno.test('a series makes one class per date, and a repeat click makes none', async () => {
  const { db, call } = setup();
  const made = await call('POST', path('sessions/series'), { user: ADMIN, body: newSeries() });
  assertEquals(made.status, 200);
  assertEquals(made.body.created, 4);
  const rows = db.rows('company_sessions').sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)));
  assertEquals(new Set(rows.map((row) => row.series_id)).size, 1);
  assertEquals(Date.parse(String(rows[1].starts_at)) - Date.parse(String(rows[0].starts_at)), 7 * DAY);
  const again = await call('POST', path('sessions/series'), { user: ADMIN, body: newSeries() });
  assertEquals(again.status, 409);
  assertEquals(again.body.code, 'series_exists');
  assertEquals(db.rows('company_sessions').length, 4);
  assertEquals((await call('POST', path('sessions/series'), { user: MANAGER, body: newSeries() })).status, 403);
  assertEquals((await call('POST', path('sessions/series'), { user: ADMIN, body: newSeries({ title: 'Too many', count: 27 }) })).status, 400);
  assertEquals((await call('POST', path('sessions/series'), { user: ADMIN, body: newSeries({ title: 'Too far', count: 26, repeat: 'biweekly', starts_at: new Date(NOW.getTime() + 300 * DAY).toISOString() }) })).status, 400);
  assertEquals((await call('POST', path('sessions/series'), { user: ADMIN, body: newSeries({ title: 'Bad', repeat: 'daily' }) })).status, 400);

  // Cancelling from the second class on leaves the first.
  const second = rows[1].id;
  const cancelled = await call('POST', path(`sessions/${second}/cancel-series`), { user: ADMIN });
  assertEquals(cancelled.body.cancelled, 3);
  assertEquals(db.rows('company_sessions').filter((row) => row.status === 'scheduled').length, 1);
  assertEquals((await call('POST', path(`sessions/${crypto.randomUUID()}/cancel-series`), { user: ADMIN })).status, 404);
});

Deno.test('an edit can follow to the later classes of a series, but never the date or the notes', async () => {
  const { db, call } = setup();
  await call('POST', path('sessions/series'), { user: ADMIN, body: newSeries() });
  const rows = db.rows('company_sessions').sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)));
  const dates = rows.map((row) => row.starts_at);
  const edited = await call('PATCH', path(`sessions/${rows[1].id}`), { user: ADMIN, body: { location: 'Room 5', trainer_notes: 'Only this class', starts_at: new Date(NOW.getTime() + 2 * DAY).toISOString(), apply_to_series: true } });
  assertEquals(edited.body.later, 2);
  assertEquals(rows.map((row) => row.location ?? null), [null, 'Room 5', 'Room 5', 'Room 5']);
  assertEquals(rows.map((row) => row.trainer_notes ?? null), [null, 'Only this class', null, null]);
  assertEquals(rows[2].starts_at, dates[2]);
  // Without the box ticked, only that class changes.
  await call('PATCH', path(`sessions/${rows[2].id}`), { user: ADMIN, body: { location: 'Room 9' } });
  assertEquals(rows[3].location, 'Room 5');
});

Deno.test('a profile shows the requirement to anyone who may open it, from test results only', async () => {
  const { call } = setup();
  await call('POST', path('insights/requirements'), { user: ADMIN, body: { job_role: 'sales', level: 'b2', skills: { speaking: 'b2' }, due_date: '2026-10-01' } });
  const chen = await call('GET', `orgs/${ORG}/members/${member(6)}/profile`, { user: ADMIN });
  assertEquals(chen.status, 200);
  assertEquals(chen.body.requirement.level, 'b2');
  assertEquals(chen.body.requirement.meets, false);
  assertEquals(chen.body.requirement.overdue, true);
  assertEquals(chen.body.requirement.gaps.map((row: { skill: string }) => row.skill), ['overall', 'speaking']);
  const daria = await call('GET', `orgs/${ORG}/members/${member(7)}/profile`, { user: DARIA });
  assertEquals(daria.body.requirement.meets, true);
  const anna = await call('GET', `orgs/${ORG}/members/${member(4)}/profile`, { user: ADMIN });
  assertEquals(anna.body.requirement, null);
});

Deno.test('trainer notes reach leads, never learners', async () => {
  const { call } = setup();
  const created = await call('POST', path('sessions'), { user: ADMIN, body: { title: 'One class', starts_at: new Date(NOW.getTime() + DAY).toISOString(), duration_minutes: 60 } });
  const id = created.body.session.id;
  const patched = await call('PATCH', path(`sessions/${id}`), { user: ADMIN, body: { trainer_notes: 'Anna needs more speaking time.' } });
  assertEquals(patched.status, 200);
  assertEquals((await call('PATCH', path(`sessions/${id}`), { user: MANAGER, body: { trainer_notes: 'x' } })).status, 403);
  const lead = await call('GET', path('sessions'), { user: MANAGER });
  assertEquals(lead.body.sessions[0].trainer_notes, 'Anna needs more speaking time.');
  const learner = await call('GET', path('sessions'), { user: ANNA });
  assertEquals(learner.body.sessions[0].trainer_notes, null);
  assertEquals((await call('PATCH', path(`sessions/${id}`), { user: ADMIN, body: { trainer_notes: 'x'.repeat(4001) } })).status, 400);
});

Deno.test('attendance rates count sharers only and stay in scope', async () => {
  const { db, call } = setup();
  const a = 'a0000000-0000-4000-8000-0000000000a1', b = 'a0000000-0000-4000-8000-0000000000a2';
  db.rows('company_sessions').push(
    { id: a, org_id: ORG, title: 'One', kind: 'class', starts_at: ago(10), duration_minutes: 60, department_ids: [DEPT_A], member_ids: [], status: 'scheduled' },
    { id: b, org_id: ORG, title: 'Two', kind: 'class', starts_at: ago(3), duration_minutes: 60, department_ids: [DEPT_A], member_ids: [], status: 'scheduled' },
    { id: 'a0000000-0000-4000-8000-0000000000a3', org_id: ORG, title: 'Cancelled', kind: 'class', starts_at: ago(3), duration_minutes: 60, department_ids: [DEPT_A], member_ids: [], status: 'cancelled' },
    { id: 'a0000000-0000-4000-8000-0000000000a4', org_id: ORG, title: 'Future', kind: 'class', starts_at: new Date(NOW.getTime() + DAY).toISOString(), duration_minutes: 60, department_ids: [DEPT_A], member_ids: [], status: 'scheduled' },
  );
  db.rows('company_session_attendance').push(
    { session_id: a, org_id: ORG, member_id: member(4) }, { session_id: b, org_id: ORG, member_id: member(4) },
    { session_id: a, org_id: ORG, member_id: member(3) }, { session_id: a, org_id: ORG, member_id: member(5) },
    { session_id: a, org_id: ORG, member_id: member(6) },
  );
  const rates = await call('GET', path('sessions/attendance-rates'), { user: ADMIN });
  assertEquals(rates.status, 200);
  assertEquals(rates.body.sessions, 2);
  const by = (name: string) => rates.body.people.find((row: { name: string }) => row.name === name);
  assertEquals(by('Anna Lee').rate, 100);
  assertEquals(by('Elena Kim').rate, 50);
  assertEquals(by('Boris Popov'), undefined, 'does not share');
  assertEquals(by('Chen Wu').extra, 1);
  assertEquals(by('Chen Wu').rate, null);
  assertEquals(rates.body.hidden, 1);
  const front = rates.body.departments.find((row: { name: string }) => row.name === 'Front office');
  assertEquals(front.invited, 4);
  assertEquals(front.attended, 3);

  const manager = await call('GET', path('sessions/attendance-rates'), { user: MANAGER });
  assertEquals(manager.body.people.some((row: { name: string }) => row.name === 'Chen Wu'), false);
  assertEquals((await call('GET', path('sessions/attendance-rates'), { user: ANNA })).status, 403);
  const csvResult = await call('GET', path('sessions/attendance-rates?format=csv'), { user: ADMIN });
  assertStringIncludes(csvResult.body.csv, 'Anna Lee');
  assertEquals(csvResult.body.csv.includes('Boris'), false);
});

Deno.test('reads page past 1,000 rows and long id lists stay in chunks', async () => {
  const { db, call } = setup();
  db.maxRows = 1000;
  const many = Array.from({ length: 1205 }, (_, index) => ({
    id: `e1000000-0000-4000-8000-${String(index).padStart(12, '0')}`, org_id: ORG, user_id: null, full_name: `Person ${index}`, email: `p${index}@x.example`, role: 'employee', status: 'active', seat: true, job_role: 'sales', department_id: DEPT_B, level: 'b1', level_score: 50, consent_at: ago(90), joined_at: ago(90),
  }));
  db.rows('company_members').push(...many);
  await call('POST', path('insights/requirements'), { user: ADMIN, body: { job_role: 'sales', level: 'b1' } });
  const gap = await call('GET', path('insights/skills-gap'), { user: ADMIN });
  assertEquals(gap.body.compliance.with_requirement, 1207);
  const risk = await call('GET', path('insights/at-risk'), { user: ADMIN });
  assertEquals(risk.status, 200);
  assert(db.longestIn <= 100, `longest in list ${db.longestIn}`);
  const synced = await call('POST', path('insights/requirements/sync-targets'), { user: ADMIN });
  assertEquals(synced.body.updated > 1000, true);
  assert(db.longestIn <= 100, `longest in list ${db.longestIn}`);
});
