import { assert, assertEquals, assertExists, assertStringIncludes } from 'jsr:@std/assert@1';
import { routes as insights } from './insights.ts';
import { csvCell, parseRange, summarize, weekOf } from './insights/common.ts';
import { FakeDb, testHandler } from './testing.ts';
import type { AiCall } from './types.ts';

const ORG = '7a0f5c1e-0000-4000-8000-0000000000c1';
const OTHER_ORG = '7a0f5c1e-0000-4000-8000-0000000000c2';
const DEPT_A = 'd0000000-0000-4000-8000-00000000000a';
const DEPT_B = 'd0000000-0000-4000-8000-00000000000b';
const user = (n: number) => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const member = (n: number) => `m0000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`.replace(/^m/, 'e');
const OWNER = user(1), ADMIN = user(2), MANAGER = user(3), ANNA = user(4), BORIS = user(5), CHEN = user(6), STAFF = user(9), OUTSIDER = user(8);
const NOW = new Date('2026-10-20T10:00:00Z'); // 15:00 in Tashkent, Tuesday
const day = 86_400_000;
const ago = (days: number, hours = 0) => new Date(NOW.getTime() - days * day - hours * 3_600_000).toISOString();

function setup(options: { ai?: AiCall } = {}) {
  const db = new FakeDb({
    users: [OWNER, ADMIN, MANAGER, ANNA, BORIS, CHEN, OUTSIDER].map((id) => ({ id, role: 'user' })).concat([{ id: STAFF, role: 'admin' }]),
    company_orgs: [
      { id: ORG, name: 'Silk Road Hotels', industry: 'hospitality', size_band: '51-200', status: 'pilot', seats_limit: 0, tests_limit: 10, tests_used: 4, contract_ends_at: null, settings: { locale: 'ru', schood_contact_email: 'sales@schood.example', schood_contact_phone: 'not a phone' }, contact_phone: '+998 71 200 00 00', billing_email: 'hr@silk.example', created_at: ago(90) },
      { id: OTHER_ORG, name: 'Other', industry: 'it', size_band: '1-50', status: 'active', seats_limit: 5, tests_limit: 10, tests_used: 0, settings: {}, created_at: ago(90) },
    ],
    company_departments: [{ id: DEPT_A, org_id: ORG, name: 'Front office' }, { id: DEPT_B, org_id: ORG, name: 'Sales' }],
    company_members: [
      { id: member(1), org_id: ORG, user_id: OWNER, full_name: 'Dilnoza Karimova', email: 'owner@silk.example', role: 'owner', status: 'active', seat: false, job_role: 'general', department_id: null, consent_at: ago(60) },
      { id: member(2), org_id: ORG, user_id: ADMIN, full_name: 'Rustam Aliev', email: 'hr@silk.example', role: 'admin', status: 'active', seat: false, job_role: 'general', department_id: null, consent_at: null },
      { id: member(3), org_id: ORG, user_id: MANAGER, full_name: 'Elena Kim', email: 'elena@silk.example', role: 'manager', status: 'active', seat: true, job_role: 'hospitality', department_id: DEPT_A, level: 'b2', level_score: 70, consent_at: ago(60) },
      { id: member(4), org_id: ORG, user_id: ANNA, full_name: 'Anna Lee', email: 'anna@silk.example', role: 'employee', status: 'active', seat: true, job_role: 'hospitality', department_id: DEPT_A, level: 'b1', level_score: 55, target_level: 'b2', target_date: '2026-11-10', consent_at: ago(50) },
      { id: member(5), org_id: ORG, user_id: BORIS, full_name: 'Boris Popov', email: 'boris@silk.example', role: 'employee', status: 'active', seat: true, job_role: 'hospitality', department_id: DEPT_A, level: null, level_score: null, target_level: 'b1', consent_at: null },
      { id: member(6), org_id: ORG, user_id: CHEN, full_name: 'Chen Wu', email: '=cmd@silk.example', role: 'employee', status: 'active', seat: false, job_role: 'sales', department_id: DEPT_B, level: 'a2', level_score: 40, target_level: 'a2', consent_at: ago(50) },
      { id: member(7), org_id: ORG, user_id: null, full_name: 'Invited Person', email: 'new@silk.example', role: 'employee', status: 'invited', seat: false, job_role: 'general', department_id: DEPT_B, consent_at: null },
      { id: member(8), org_id: OTHER_ORG, user_id: OUTSIDER, full_name: 'Out Sider', email: 'out@x.example', role: 'owner', status: 'active', seat: false, job_role: 'general', department_id: null, consent_at: ago(10) },
    ],
    company_activity: [
      { id: 1, org_id: ORG, member_id: member(4), user_id: ANNA, kind: 'lesson', minutes: 20, points: 30, created_at: ago(1) },
      { id: 2, org_id: ORG, member_id: member(4), user_id: ANNA, kind: 'roleplay', minutes: 10, points: 15, created_at: ago(3) },
      { id: 3, org_id: ORG, member_id: member(4), user_id: ANNA, kind: 'lesson', minutes: 15, points: 20, created_at: ago(12) },
      // Boris has not agreed to share progress: never counted.
      { id: 4, org_id: ORG, member_id: member(5), user_id: BORIS, kind: 'lesson', minutes: 300, points: 500, created_at: ago(2) },
      { id: 5, org_id: ORG, member_id: member(6), user_id: CHEN, kind: 'lesson', minutes: 25, points: 40, created_at: ago(2) },
      { id: 6, org_id: ORG, member_id: member(3), user_id: MANAGER, kind: 'writing', minutes: 5, points: 10, created_at: ago(40) },
      { id: 7, org_id: OTHER_ORG, member_id: member(8), user_id: OUTSIDER, kind: 'lesson', minutes: 99, points: 99, created_at: ago(1) },
    ],
    company_assessments: [
      { id: 'a0000000-0000-4000-8000-000000000001', org_id: ORG, kind: 'placement', title: 'Placement 2026', min_level: null, created_at: ago(80) },
      { id: 'a0000000-0000-4000-8000-000000000002', org_id: ORG, kind: 'hiring', title: 'Receptionist', min_level: 'b1', created_at: ago(30) },
    ],
    company_attempts: [
      { id: 't1', org_id: ORG, assessment_id: 'a0000000-0000-4000-8000-000000000001', member_id: member(4), status: 'graded', overall_level: 'a2', overall_score: 44, skill_results: { grammar: { score: 40, level: 'a2' }, reading: { score: 48, level: 'b1' } }, started_at: ago(70), graded_at: ago(70), certificate_code: 'CERTAAAA01' },
      { id: 't2', org_id: ORG, assessment_id: 'a0000000-0000-4000-8000-000000000001', member_id: member(4), status: 'graded', overall_level: 'b1', overall_score: 55, skill_results: { grammar: { score: 52, level: 'b1' }, reading: { score: 58, level: 'b1' } }, started_at: ago(5), graded_at: ago(5), certificate_code: 'CERTAAAA02' },
      { id: 't3', org_id: ORG, assessment_id: 'a0000000-0000-4000-8000-000000000001', member_id: member(6), status: 'graded', overall_level: 'a2', overall_score: 40, skill_results: {}, started_at: ago(60), graded_at: ago(60) },
      { id: 't4', org_id: ORG, assessment_id: 'a0000000-0000-4000-8000-000000000002', member_id: null, candidate_name: 'Kamola Q', candidate_email: 'kamola@mail.example', status: 'graded', overall_level: 'b2', overall_score: 70, decision: null, skill_results: {}, started_at: ago(4), graded_at: ago(4) },
      { id: 't5', org_id: ORG, assessment_id: 'a0000000-0000-4000-8000-000000000002', member_id: null, candidate_name: 'Sardor M', candidate_email: 'sardor@mail.example', status: 'graded', overall_level: 'a2', overall_score: 35, decision: 'reject', skill_results: {}, started_at: ago(3), graded_at: ago(3) },
    ],
    company_assignments: [
      { id: 'as1', org_id: ORG, track_code: 'hospitality', target_level: 'b2', due_date: '2026-10-01', department_id: DEPT_A, member_id: null, status: 'active', created_at: ago(30) },
      { id: 'as2', org_id: ORG, track_code: 'sales', target_level: null, due_date: '2026-12-01', department_id: DEPT_B, member_id: null, status: 'active', created_at: ago(30) },
    ],
    company_lesson_progress: [
      { id: 'lp1', org_id: ORG, member_id: member(4), track_code: 'hospitality', lesson_code: 'h-1', status: 'completed', score: 80, minutes: 20, completed_at: ago(1), updated_at: ago(1) },
      { id: 'lp2', org_id: ORG, member_id: member(5), track_code: 'hospitality', lesson_code: 'h-1', status: 'completed', score: 90, minutes: 20, completed_at: ago(2), updated_at: ago(2) },
    ],
  });
  return { db, call: testHandler(db, insights, { now: () => NOW, ai: options.ai }) };
}

Deno.test('calendar helpers follow Tashkent days and Monday weeks', () => {
  assertEquals(weekOf('2026-10-20'), '2026-10-19');
  assertEquals(weekOf('2026-10-19'), '2026-10-19');
  assertEquals(weekOf('2026-10-25'), '2026-10-19');
  const range = parseRange(new URLSearchParams(), NOW);
  assertEquals([range.from, range.to], ['2026-10-01', '2026-10-20']);
  assertEquals(range.start.toISOString(), '2026-09-30T19:00:00.000Z');
  assertEquals(range.end.toISOString(), '2026-10-20T19:00:00.000Z');
  const summary = summarize([
    { member_id: 'a', kind: 'lesson', minutes: 10, points: 5, created_at: '2026-10-18T20:30:00Z' }, // Monday 19th in Tashkent
    { member_id: 'a', kind: 'roleplay', minutes: 5, points: 5, created_at: '2026-10-18T10:00:00Z' }, // Sunday 18th
    { member_id: 'b', kind: 'lesson', minutes: 99, points: 99, created_at: '2026-10-18T10:00:00Z' },
  ], new Set(['a']));
  assertEquals(summary.members, [{ member_id: 'a', minutes: 15, points: 10, lessons: 1, events: 2, days: 2, last_at: '2026-10-18T20:30:00.000Z' }]);
  assertEquals(summary.weeks.map((week) => week.week), ['2026-10-12', '2026-10-19']);
  assertEquals(csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
  assertEquals(csvCell(-5), '-5');
});

Deno.test('the overview counts only people who share progress, and managers see only their department', async () => {
  const { call } = setup();
  const hr = await call('GET', `orgs/${ORG}/insights/overview`, { user: ADMIN });
  assertEquals(hr.status, 200);
  const k = hr.body.kpis;
  assertEquals([k.people, k.learners, k.invited, k.tested, k.active7, k.active30], [6, 4, 1, 3, 2, 2]);
  // Anna 20+10+15 = 45 and Chen 25 this month; Boris's 300 minutes are not shared.
  assertEquals(k.minutes_month, 70);
  assertEquals(k.lessons_month, 3);
  assertEquals([k.with_target, k.at_target], [3, 1]);
  assertEquals(k.tests_month, 3); // Anna's progress test plus two candidates.
  assertEquals(hr.body.levels.b1, 1);
  assertEquals(hr.body.levels.none, 1);
  assertEquals(hr.body.departments.map((row: { name: string | null }) => row.name), ['Front office', 'Sales', null]);
  const front = hr.body.departments[0];
  assertEquals([front.people, front.tested, front.active30, front.minutes30, front.sharing], [3, 2, 1, 45, 2]);
  const kinds = hr.body.todo.map((item: { kind: string }) => item.kind);
  assertEquals(kinds, ['no_placement', 'overdue_assignments', 'candidates_waiting', 'target_soon', 'no_consent', 'invites_pending']);
  assertEquals(hr.body.trend.length, 6);
  assertEquals(hr.body.trend[5].tested, 2);
  assertEquals(hr.body.trend[5].counts.b1, 1);
  assertEquals(hr.body.trend[3].counts.a2, 2); // August: both had A2.
  assertEquals(hr.body.weeks.length, 8);
  assertEquals(hr.body.usage.status, 'pilot');
  assertEquals(hr.body.contact, { email: 'sales@schood.example', phone: null });

  const manager = await call('GET', `orgs/${ORG}/insights/overview`, { user: MANAGER });
  assertEquals(manager.status, 200);
  assertEquals(manager.body.kpis.people, 3);
  assertEquals(manager.body.kpis.minutes_month, 45);
  assertEquals(manager.body.departments.map((row: { name: string }) => row.name), ['Front office']);
  assertEquals(manager.body.usage, null);
  assertEquals(manager.body.contact, null);
  assert(!manager.body.todo.some((item: { kind: string }) => item.kind === 'candidates_waiting' || item.kind === 'invites_pending'));
  assertEquals(manager.body.scope.department.name, 'Front office');

  assertEquals((await call('GET', `orgs/${ORG}/insights/overview`, { user: ANNA })).status, 403);
  assertEquals((await call('GET', `orgs/${ORG}/insights/overview`, { user: OUTSIDER })).status, 403);
  assertEquals((await call('GET', `orgs/${ORG}/insights/overview`, { user: STAFF })).status, 200);
});

Deno.test('the SQL summary is used when it is installed', async () => {
  const { db, call } = setup();
  const calls: unknown[] = [];
  db.rpcs.company_activity_summary = (args) => {
    calls.push(args);
    return { members: [{ member_id: member(4), minutes: 7, points: 1, lessons: 1, events: 1, days: 1, last_at: ago(1) }], weeks: [], kinds: { lesson: { events: 1, minutes: 7 } } };
  };
  const hr = await call('GET', `orgs/${ORG}/insights/overview`, { user: ADMIN });
  assertEquals(hr.body.kpis.minutes_month, 7);
  const sent = calls[0] as { p_members: string[] };
  assert(sent.p_members.includes(member(4)));
  assert(!sent.p_members.includes(member(5)), 'people without consent are not even asked for');
});

Deno.test('a profile hides learning detail without consent, and scope is enforced', async () => {
  const { call } = setup();
  const anna = await call('GET', `orgs/${ORG}/members/${member(4)}/profile`, { user: ADMIN });
  assertEquals(anna.status, 200);
  assertEquals(anna.body.detail, true);
  assertEquals(anna.body.tests.length, 2);
  assertEquals(anna.body.tests[0].skills, [{ skill: 'grammar', score: 52, level: 'b1' }, { skill: 'reading', score: 58, level: 'b1' }]);
  assertEquals(anna.body.certificates.map((row: { code: string }) => row.code), ['CERTAAAA02', 'CERTAAAA01']);
  assertEquals(anna.body.learning.lessons_completed, 1);
  assertEquals(anna.body.learning.minutes, 45);
  assertEquals(anna.body.learning.kinds.roleplay.events, 1);
  assertEquals(anna.body.assignments[0].overdue, true);
  assertEquals(anna.body.assignments[0].lessons_done, 1);
  assertEquals(anna.body.english_reason, 'no_data');
  assertEquals(anna.body.member.department_name, 'Front office');

  const boris = await call('GET', `orgs/${ORG}/members/${member(5)}/profile`, { user: ADMIN });
  assertEquals(boris.body.detail, false);
  assertEquals(boris.body.learning, null);
  assertEquals(boris.body.english, null);
  assertEquals(boris.body.english_reason, 'no_consent');
  assertEquals(boris.body.assignments[0].lessons_done, null);

  // Boris himself sees his own learning.
  const self = await call('GET', `orgs/${ORG}/members/${member(5)}/profile`, { user: BORIS });
  assertEquals([self.body.self, self.body.detail, self.body.learning.minutes], [true, true, 300]);
  assertEquals((await call('GET', `orgs/${ORG}/members/${member(4)}/profile`, { user: BORIS })).status, 404);
  assertEquals((await call('GET', `orgs/${ORG}/members/${member(6)}/profile`, { user: MANAGER })).status, 404);
  assertEquals((await call('GET', `orgs/${ORG}/members/${member(4)}/profile`, { user: MANAGER })).status, 200);
  assertEquals((await call('GET', `orgs/${ORG}/members/${member(8)}/profile`, { user: ADMIN })).status, 404);
  assertEquals((await call('GET', `orgs/${ORG}/members/not-an-id/profile`, { user: ADMIN })).status, 404);
});

Deno.test('Schood English activity is read for seated, consenting members and skipped when the tables are missing', async () => {
  const { db, call } = setup();
  const EN = 'l0000000-0000-4000-8000-000000000001'.replace(/^l/, 'f');
  db.rows('languages').push({ id: EN, code: 'en' });
  db.rows('learner_language_goals').push({ user_id: ANNA, language_id: EN, current_cefr_estimate: 'B1', target_cefr: 'B2', daily_time_minutes: 20 });
  db.rows('learning_attempts').push(
    { id: 'x1', user_id: ANNA, language_id: EN, content_item_id: 'c1', service_key: 'reading', status: 'scored', time_spent_seconds: 600, correctness_ratio: 0.8, submitted_at: ago(2) },
    { id: 'x2', user_id: ANNA, language_id: EN, content_item_id: 'c1', service_key: 'reading', status: 'scored', time_spent_seconds: 300, correctness_ratio: 0.5, submitted_at: ago(2, 1) },
    { id: 'x3', user_id: ANNA, language_id: EN, content_item_id: 'c2', service_key: 'listening', status: 'started', time_spent_seconds: 300, submitted_at: ago(1) },
    { id: 'x4', user_id: BORIS, language_id: EN, content_item_id: 'c2', service_key: 'listening', status: 'scored', time_spent_seconds: 300, submitted_at: ago(1) },
  );
  const anna = await call('GET', `orgs/${ORG}/members/${member(4)}/profile`, { user: ADMIN });
  const english = anna.body.english;
  assertExists(english);
  assertEquals([english.level, english.target, english.daily_goal_minutes], ['b1', 'b2', 20]);
  assertEquals([english.activities, english.minutes, english.active_days], [2, 15, 1]);
  assertEquals(english.xp, 18); // best of the two reading tries the same day: 10 + 8
  assertEquals(english.skills.reading.accuracy, 65);
  // Chen has no seat: nothing is read for him.
  const chen = await call('GET', `orgs/${ORG}/members/${member(6)}/profile`, { user: ADMIN });
  assertEquals([chen.body.english, chen.body.english_reason], [null, 'no_seat']);
});

Deno.test('the monthly report shows movement, departments, hiring and training', async () => {
  const { call } = setup();
  const report = await call('GET', `orgs/${ORG}/reports/monthly?from=2026-09-01&to=2026-10-20`, { user: OWNER });
  assertEquals(report.status, 200);
  const body = report.body;
  assertEquals(body.range, { from: '2026-09-01', to: '2026-10-20', days: 50 });
  assertEquals([body.movement.up, body.movement.same, body.movement.first], [1, 1, 0]);
  assertEquals(body.improvers[0].name, 'Anna Lee');
  assertEquals([body.improvers[0].from_level, body.improvers[0].to_level, body.improvers[0].delta], ['a2', 'b1', 11]);
  assertEquals(body.summary.minutes, 75); // Elena's September writing counts too.
  assertEquals(body.hiring.started, 2);
  assertEquals([body.hiring.graded, body.hiring.meets_min, body.hiring.rejected, body.hiring.waiting], [2, 1, 1, 1]);
  assertEquals(body.training.lessons_completed, 1, 'Boris does not share progress');
  const hospitality = body.training.assignments.find((row: { track_code: string }) => row.track_code === 'hospitality');
  assertEquals([hospitality.assignees, hospitality.learners, hospitality.target_met, hospitality.overdue], [3, 1, 1, true]);
  assertEquals(body.most_active[0].name, 'Anna Lee');

  const manager = await call('GET', `orgs/${ORG}/reports/monthly?from=2026-09-01&to=2026-10-20`, { user: MANAGER });
  assertEquals(manager.body.hiring, null);
  assertEquals(manager.body.departments.length, 1);
  assertEquals(manager.body.training.assignments.length, 1);

  assertEquals((await call('GET', `orgs/${ORG}/reports/monthly?from=2026-10-20&to=2026-10-01`, { user: OWNER })).body.code, 'invalid_range');
  assertEquals((await call('GET', `orgs/${ORG}/reports/monthly?from=2024-01-01&to=2026-10-01`, { user: OWNER })).body.code, 'invalid_range');
  assertEquals((await call('GET', `orgs/${ORG}/reports/monthly?from=2026-02-30`, { user: OWNER })).body.code, 'invalid_field');
  assertEquals((await call('GET', `orgs/${ORG}/reports/monthly`, { user: ANNA })).status, 403);
});

Deno.test('CSV exports respect consent and scope and neutralise formulas', async () => {
  const { db, call } = setup();
  const people = await call('GET', `orgs/${ORG}/reports/export?kind=people&from=2026-10-01&to=2026-10-20`, { user: ADMIN });
  assertEquals(people.status, 200);
  assertEquals(people.body.filename, 'schood-company-people-2026-10-01-2026-10-20.csv');
  const lines = people.body.csv.split('\r\n');
  assertEquals(lines.length, 8);
  assertStringIncludes(people.body.csv, `'=cmd@silk.example`);
  const boris = lines.find((line: string) => line.startsWith('Boris Popov'))!;
  assert(boris.endsWith(',no,,,,,,'), `no learning numbers without consent: ${boris}`);

  const activity = await call('GET', `orgs/${ORG}/reports/export?kind=activity&from=2026-10-01&to=2026-10-20`, { user: ADMIN });
  assertEquals(activity.body.rows, 4);
  assert(!activity.body.csv.includes('Boris'));

  const attempts = await call('GET', `orgs/${ORG}/reports/export?kind=attempts&from=2026-08-01&to=2026-10-20`, { user: ADMIN });
  assertEquals(attempts.body.rows, 5);
  assertStringIncludes(attempts.body.csv, 'kamola@mail.example');
  const managerAttempts = await call('GET', `orgs/${ORG}/reports/export?kind=attempts&from=2026-08-01&to=2026-10-20`, { user: MANAGER });
  assertEquals(managerAttempts.body.rows, 2);
  assert(!managerAttempts.body.csv.includes('kamola'), 'managers never see candidates');
  assertEquals((await call('GET', `orgs/${ORG}/reports/export?kind=secrets`, { user: ADMIN })).body.code, 'invalid_field');
  assertEquals(db.rows('company_audit').filter((row) => row.action === 'report.exported').length, 4);
});

Deno.test('the AI summary sends numbers only, respects the cap and handles failures', async () => {
  let payload = '';
  const ai: AiCall = <T>(request: { userPayload: string; feature: string }) => {
    payload = request.userPayload;
    assertEquals(request.feature, 'company-report-summary');
    return Promise.resolve({ status: 'ok' as const, data: { headline: '  Good month  ', paragraphs: ['One.', 42, 'Two.'], actions: ['Test Boris.'] } as unknown as T });
  };
  const { db, call } = setup({ ai });
  let allowed = true;
  db.rpcs.company_consume_ai = () => allowed;
  const ok = await call('POST', `orgs/${ORG}/reports/summary`, { user: ADMIN, body: { from: '2026-10-01', to: '2026-10-20', locale: 'ru' } });
  assertEquals(ok.body.status, 'ok');
  assertEquals(ok.body.summary, { headline: 'Good month', paragraphs: ['One.', 'Two.'], actions: ['Test Boris.'] });
  assert(!payload.includes('Anna') && !payload.includes('@'), 'no names or contacts go to the AI');
  assertStringIncludes(payload, 'Front office');
  allowed = false;
  assertEquals((await call('POST', `orgs/${ORG}/reports/summary`, { user: ADMIN, body: {} })).body.status, 'limit');

  const failing = setup();
  failing.db.rpcs.company_consume_ai = () => true;
  assertEquals((await failing.call('POST', `orgs/${ORG}/reports/summary`, { user: ADMIN, body: {} })).body.status, 'unavailable');
});

Deno.test('HR runs challenges; everyone sees standings with colleagues abbreviated', async () => {
  const { db, call } = setup();
  assertEquals((await call('POST', `orgs/${ORG}/challenges`, { user: ANNA, body: { title: 'Mine', starts_on: '2026-10-01', ends_on: '2026-10-31' } })).status, 403);
  const bad = await call('POST', `orgs/${ORG}/challenges`, { user: ADMIN, body: { title: 'Too long', starts_on: '2026-10-01', ends_on: '2027-03-01' } });
  assertEquals(bad.body.code, 'invalid_range');
  const created = await call('POST', `orgs/${ORG}/challenges`, { user: ADMIN, body: { title: 'October minutes', metric: 'minutes', starts_on: '2026-10-01', ends_on: '2026-10-31' } });
  assertEquals(created.status, 200);
  assertEquals(created.body.challenge.status, 'running');
  const id = created.body.challenge.id;

  const hr = await call('GET', `orgs/${ORG}/challenges/${id}`, { user: ADMIN });
  assertEquals(hr.body.people.map((row: { name: string; value: number; rank: number }) => [row.name, row.value, row.rank]), [['Anna Lee', 45, 1], ['Chen Wu', 25, 2]]);
  // Front office: Elena 0 + Anna 45 over two sharing people; Sales: Chen 25 over one.
  assertEquals(hr.body.departments.map((row: { name: string; average: number; rank: number }) => [row.name, row.average, row.rank]), [['Sales', 25, 1], ['Front office', 22.5, 2]]);
  assertEquals(hr.body.days_left, 12);

  const chen = await call('GET', `orgs/${ORG}/challenges/${id}`, { user: CHEN });
  assertEquals(chen.body.people.map((row: { name: string; me: boolean }) => [row.name, row.me]), [['Anna L.', false], ['Chen Wu', true]]);
  assertEquals(chen.body.people[0].member_id, null);
  assertEquals(chen.body.me, { participating: true, sharing: true, rank: 2, value: 25 });
  const boris = await call('GET', `orgs/${ORG}/challenges/${id}`, { user: BORIS });
  assertEquals(boris.body.me, { participating: false, sharing: false, rank: null, value: 0 });

  assertEquals((await call('PATCH', `orgs/${ORG}/challenges/${id}`, { user: ADMIN, body: { metric: 'points' } })).body.code, 'challenge_running');
  assertEquals((await call('PATCH', `orgs/${ORG}/challenges/${id}`, { user: ADMIN, body: { title: 'October minutes!', ends_on: '2026-11-05' } })).body.challenge.ends_on, '2026-11-05');
  assertEquals((await call('DELETE', `orgs/${ORG}/challenges/${id}`, { user: ADMIN })).body.code, 'challenge_started');
  const ended = await call('POST', `orgs/${ORG}/challenges/${id}/end`, { user: ADMIN });
  assertEquals([ended.body.challenge.status, ended.body.challenge.ends_on], ['finished', '2026-10-20']);
  assertEquals((await call('PATCH', `orgs/${ORG}/challenges/${id}`, { user: ADMIN, body: { ends_on: '2026-11-30' } })).body.code, 'challenge_finished');

  // A Sales-only challenge is not shown to the front office.
  const sales = await call('POST', `orgs/${ORG}/challenges`, { user: ADMIN, body: { title: 'Sales lessons', metric: 'lessons', starts_on: '2026-10-25', ends_on: '2026-11-10', department_ids: [DEPT_B] } });
  assertEquals(sales.body.challenge.status, 'upcoming');
  assertEquals((await call('GET', `orgs/${ORG}/challenges`, { user: ANNA })).body.challenges.length, 1);
  assertEquals((await call('GET', `orgs/${ORG}/challenges`, { user: CHEN })).body.challenges.map((row: { status: string }) => row.status), ['upcoming', 'finished']);
  assertEquals((await call('GET', `orgs/${ORG}/challenges/${sales.body.challenge.id}`, { user: ANNA })).status, 404);
  assertEquals((await call('POST', `orgs/${ORG}/challenges`, { user: ADMIN, body: { title: 'Foreign', starts_on: '2026-10-25', ends_on: '2026-11-10', department_ids: ['d0000000-0000-4000-8000-0000000000ff'] } })).body.code, 'invalid_field');
  assertEquals((await call('DELETE', `orgs/${ORG}/challenges/${sales.body.challenge.id}`, { user: ADMIN })).body.ok, true);
  assertEquals(db.rows('company_audit').map((row) => row.action).filter((action) => String(action).startsWith('challenge.')), ['challenge.created', 'challenge.updated', 'challenge.ended', 'challenge.created', 'challenge.deleted']);
});

Deno.test('HR schedules sessions, members see theirs, attendance logs activity', async () => {
  const { db, call } = setup();
  const future = new Date(NOW.getTime() + 2 * day).toISOString();
  const past = new Date(NOW.getTime() - 2 * 3_600_000).toISOString();
  assertEquals((await call('POST', `orgs/${ORG}/sessions`, { user: ADMIN, body: { title: 'Bad', starts_at: future, link: 'http://insecure.example' } })).body.code, 'invalid_field');
  const forFront = await call('POST', `orgs/${ORG}/sessions`, { user: ADMIN, body: { title: 'Phone English', kind: 'workshop', trainer: 'Schood trainer', starts_at: future, duration_minutes: 90, link: 'https://meet.example/x', department_ids: [DEPT_A] } });
  assertEquals(forFront.status, 200);
  const forChen = await call('POST', `orgs/${ORG}/sessions`, { user: ADMIN, body: { title: 'Sales demo', starts_at: future, member_ids: [member(6)] } });
  const happened = await call('POST', `orgs/${ORG}/sessions`, { user: ADMIN, body: { title: 'All-hands English', starts_at: past, duration_minutes: 60 } });
  assertEquals(happened.body.session.status, 'scheduled');

  const anna = await call('GET', `orgs/${ORG}/sessions`, { user: ANNA });
  assertEquals(anna.body.sessions.map((row: { title: string; for_me: boolean }) => [row.title, row.for_me]), [['Phone English', true]]);
  assertEquals(anna.body.sessions[0].counts, null);
  const chen = await call('GET', `orgs/${ORG}/sessions`, { user: CHEN });
  assertEquals(chen.body.sessions.map((row: { title: string }) => row.title), ['Sales demo']);
  assertEquals(chen.body.sessions[0].member_ids, []);
  const manager = await call('GET', `orgs/${ORG}/sessions`, { user: MANAGER });
  assertEquals(manager.body.sessions[0].counts, { invited: 3, present: 0 });

  assertEquals((await call('PUT', `orgs/${ORG}/sessions/${forFront.body.session.id}/attendance`, { user: ADMIN, body: { present: [member(4)] } })).body.code, 'session_not_started');
  const sessionId = happened.body.session.id;
  assertEquals((await call('PUT', `orgs/${ORG}/sessions/${sessionId}/attendance`, { user: MANAGER, body: { present: [member(4)] } })).status, 403);
  assertEquals((await call('PUT', `orgs/${ORG}/sessions/${sessionId}/attendance`, { user: ADMIN, body: { present: [member(8)] } })).body.code, 'invalid_field');
  const marked = await call('PUT', `orgs/${ORG}/sessions/${sessionId}/attendance`, { user: ADMIN, body: { present: [member(4), member(6)] } });
  assertEquals(marked.body, { present: 2, added: 2, removed: 0 });
  const logged = () => db.rows('company_activity').filter((row) => row.kind === 'session');
  assertEquals(logged().map((row) => [row.member_id, row.minutes, row.ref]), [[member(4), 60, `session:${sessionId}`], [member(6), 60, `session:${sessionId}`]]);
  // Marking again is harmless; taking Chen off takes back his activity.
  assertEquals((await call('PUT', `orgs/${ORG}/sessions/${sessionId}/attendance`, { user: ADMIN, body: { present: [member(4)] } })).body, { present: 1, added: 0, removed: 1 });
  assertEquals(logged().map((row) => row.member_id), [member(4)]);

  const sheet = await call('GET', `orgs/${ORG}/sessions/${sessionId}/attendance`, { user: ADMIN });
  assertEquals(sheet.body.can_mark, true);
  assertEquals(sheet.body.people.find((row: { name: string }) => row.name === 'Anna Lee').present, true);
  const pastForAnna = await call('GET', `orgs/${ORG}/sessions?when=past`, { user: ANNA });
  assertEquals(pastForAnna.body.sessions.map((row: { title: string; attended: boolean }) => [row.title, row.attended]), [['All-hands English', true]]);

  assertEquals((await call('POST', `orgs/${ORG}/sessions/${sessionId}/cancel`, { user: ADMIN })).body.code, 'session_has_attendance');
  const cancelled = await call('POST', `orgs/${ORG}/sessions/${forChen.body.session.id}/cancel`, { user: ADMIN });
  assertEquals(cancelled.body.session.status, 'cancelled');
  assertEquals((await call('PATCH', `orgs/${ORG}/sessions/${forChen.body.session.id}`, { user: ADMIN, body: { title: 'Again' } })).body.code, 'session_cancelled');
  const moved = await call('PATCH', `orgs/${ORG}/sessions/${forFront.body.session.id}`, { user: ADMIN, body: { duration_minutes: 45, location: 'Room 2' } });
  assertEquals([moved.body.session.duration_minutes, moved.body.session.location], [45, 'Room 2']);
  assertEquals((await call('GET', `orgs/${ORG}/sessions/${forChen.body.session.id}/attendance`, { user: MANAGER })).status, 404);
});

Deno.test('a seats request reaches the Schood pipeline once a day', async () => {
  const { db, call } = setup();
  assertEquals((await call('POST', `orgs/${ORG}/insights/seats-request`, { user: MANAGER, body: {} })).status, 403);
  const first = await call('POST', `orgs/${ORG}/insights/seats-request`, { user: ADMIN, body: { seats: 40, message: 'Front office first' } });
  assertEquals(first.body.duplicate, false);
  const lead = db.rows('company_leads')[0];
  assertEquals([lead.org_id, lead.source, lead.company, lead.status], [ORG, 'company_seats', 'Silk Road Hotels', 'new']);
  assertStringIncludes(String(lead.need), 'Seats wanted: 40.');
  const second = await call('POST', `orgs/${ORG}/insights/seats-request`, { user: ADMIN, body: {} });
  assertEquals(second.body.duplicate, true);
  assertEquals(db.rows('company_leads').length, 1);
  const overview = await call('GET', `orgs/${ORG}/insights/overview`, { user: ADMIN });
  assertEquals(overview.body.seats_requested_at, lead.created_at);
});

Deno.test('someone first tested inside the period still counts as moving up on a retest', async () => {
  const { db, call } = setup();
  db.rows('company_attempts').push(
    { id: 'b1', org_id: ORG, assessment_id: 'a0000000-0000-4000-8000-000000000001', member_id: member(5), status: 'graded', overall_level: 'a1', overall_score: 20, skill_results: {}, started_at: ago(15), graded_at: ago(15) },
    { id: 'b2', org_id: ORG, assessment_id: 'a0000000-0000-4000-8000-000000000001', member_id: member(5), status: 'graded', overall_level: 'a2', overall_score: 35, skill_results: {}, started_at: ago(2), graded_at: ago(2) },
  );
  const report = await call('GET', `orgs/${ORG}/reports/monthly?from=2026-10-01&to=2026-10-20`, { user: OWNER });
  // Anna (A2 before → B1) and Boris (first A1 in October → A2) moved up; Boris is also new.
  assertEquals([report.body.movement.up, report.body.movement.first], [2, 1]);
  assertEquals(report.body.improvers.map((row: { name: string }) => row.name).sort(), ['Anna Lee', 'Boris Popov']);
  assertEquals(report.body.departments[0].moved_up, 2);
});
