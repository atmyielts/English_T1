// Route tests for the second training release: course builder, AI drafts, custom
// role-plays, role-play depth, writing depth, learning paths, certificates and due items.
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { routes as core } from './core.ts';
import { routes as training } from './training.ts';
import { aiLesson, blankLesson, exerciseProblems, lessonProblems, readLesson, type CustomLesson } from './training/custom.ts';
import { applyTranslations, missingTranslations } from './training/builderExtras.ts';
import { csvCell, toCsv } from '../../../apps/company/src/areas/training/csv.ts';
import { alignCriteria } from './training/roleplay.ts';
import { defaultTarget, estimate, stepViews, suggestPath } from './training/paths.ts';
import { TRACKS, findTrack } from './training/tracks/index.ts';
import { FakeDb, testHandler } from './testing.ts';
import type { AiCall } from './types.ts';

const ORG = '7a0f5c1e-0000-4000-8000-00000000c0de';
const ELSEWHERE = '7a0f5c1e-0000-4000-8000-00000000dead';
const HR = '00000000-0000-4000-8000-0000000000c1';
const EMPLOYEE = '00000000-0000-4000-8000-0000000000c2';
const MANAGER = '00000000-0000-4000-8000-0000000000c3';
const OTHER = '00000000-0000-4000-8000-0000000000c4';
const FRONT = '00000000-0000-4000-8000-0000000000d1';
const SALES = '00000000-0000-4000-8000-0000000000d2';
const M = { hr: '00000000-0000-4000-8000-0000000000e1', employee: '00000000-0000-4000-8000-0000000000e2', manager: '00000000-0000-4000-8000-0000000000e3', other: '00000000-0000-4000-8000-0000000000e4' };
const FAR = '2099-01-01T00:00:00.000Z';

function setup(options: { ai?: AiCall; aiAllowed?: () => boolean; now?: () => Date; status?: string } = {}) {
  const consent = '2026-10-01T00:00:00.000Z';
  const member = (id: string, user: string, role: string, extra: Record<string, unknown> = {}) => ({
    id, org_id: ORG, user_id: user, email: `${role}@hotel.example`, full_name: role, role, department_id: null, job_role: 'general', status: 'active', seat: false,
    level: null, level_score: null, level_source: null, level_at: null, target_level: null, target_date: null, consent_at: consent, joined_at: consent, ...extra,
  });
  const db = new FakeDb({
    users: [HR, EMPLOYEE, MANAGER, OTHER].map((id) => ({ id, role: 'user' })),
    company_orgs: [
      { id: ORG, name: 'Silk Road Hotels', industry: 'hospitality', size_band: '51-200', status: options.status ?? 'active', seats_limit: 10, tests_limit: 50, tests_used: 0, settings: { locale: 'ru' }, created_at: consent, contract_ends_at: FAR },
      { id: ELSEWHERE, name: 'Other Co', industry: 'other', size_band: '1-50', status: 'active', seats_limit: 1, tests_limit: 1, tests_used: 0, settings: {}, created_at: consent, contract_ends_at: FAR },
    ],
    company_departments: [{ id: FRONT, org_id: ORG, name: 'Front office' }, { id: SALES, org_id: ORG, name: 'Sales' }],
    company_members: [
      member(M.hr, HR, 'admin'),
      member(M.employee, EMPLOYEE, 'employee', { department_id: FRONT, job_role: 'hospitality', seat: true, level: 'a2', target_level: 'b1' }),
      member(M.manager, MANAGER, 'manager', { department_id: FRONT, job_role: 'hospitality', seat: true, level: 'b2' }),
      member(M.other, OTHER, 'employee', { department_id: SALES, job_role: 'sales', seat: true, consent_at: null, level: 'b1' }),
    ],
  });
  db.uniques.company_lesson_progress = [{ columns: ['member_id', 'lesson_code'] }];
  db.uniques.company_training_certificates = [{ columns: ['member_id', 'kind', 'ref_code'] }, { columns: ['code'] }];
  db.uniques.company_lesson_versions = [{ columns: ['lesson_id', 'version'] }];
  db.uniques.company_learning_paths = [
    { columns: ['member_id'], where: (row) => row.status === 'active' && row.member_id !== null },
    { columns: ['department_id'], where: (row) => row.status === 'active' && row.department_id !== null },
  ];
  db.uniques.company_writing_snippets = [{ columns: ['member_id', 'title'] }];
  let aiCalls = 0, hits = 0;
  db.rpcs.company_consume_ai = () => { aiCalls++; return options.aiAllowed ? options.aiAllowed() : true; };
  db.rpcs.company_training_hit = ({ p_limit }) => ++hits <= Number(p_limit);
  const call = testHandler(db, [...core, ...training], { ai: options.ai, now: options.now });
  return { db, call, aiCalls: () => aiCalls };
}

const content = (title: string): CustomLesson => ({
  ...blankLesson(title, 'a2'),
  goal: { en: 'Explain the rule to a guest', ru: 'Объяснить правило гостю', uz: 'Qoidani mehmonga tushuntirish' },
  phrases: [{ en: 'Check-out is at noon.', ru: 'Выезд в полдень.', uz: 'Chiqish tushda.' }],
  words: [{ en: 'late check-out', ru: 'поздний выезд', uz: 'kech chiqish' }],
  dialogue: { setting: { en: 'At reception', ru: 'На ресепшн', uz: 'Qabulxonada' }, lines: [{ speaker: 'Guest', text: 'May I stay longer?' }, { speaker: 'Clerk', text: 'Until two, for a fee.' }] },
  exercises: [
    { id: 'e1', kind: 'choice', items: [{ q: 'When is check-out?', options: ['At noon', 'At night'], answer: 0 }] },
    { id: 'e2', kind: 'gap', items: [{ text: 'Check-out is at ___.', answers: ['noon'] }] },
  ],
  mission: { kind: 'task', brief: { en: 'Explain this to one guest today.', ru: 'Объясните это сегодня одному гостю.', uz: 'Bugun buni bitta mehmonga tushuntiring.' } },
});

async function publishedLesson(call: ReturnType<typeof setup>['call'], title = 'Our late check-out') {
  const created = await call('POST', `orgs/${ORG}/builder/lessons`, { user: HR, body: { title, level: 'a2' } });
  assertEquals(created.status, 200);
  const id = created.body.lesson.id as string;
  const saved = await call('PUT', `orgs/${ORG}/builder/lessons/${id}`, { user: HR, body: { revision: created.body.lesson.revision, draft: content(title) } });
  assertEquals(saved.status, 200, JSON.stringify(saved.body));
  const published = await call('POST', `orgs/${ORG}/builder/lessons/${id}/publish`, { user: HR, body: {} });
  assertEquals(published.status, 200, JSON.stringify(published.body));
  return { id, code: `co-${id}`, revision: published.body.lesson.revision as number };
}

async function publishedCourse(call: ReturnType<typeof setup>['call'], lessonIds: string[], title = 'Welcome to Silk Road') {
  const created = await call('POST', `orgs/${ORG}/builder/courses`, { user: HR, body: { title } });
  const id = created.body.course.id as string;
  const saved = await call('PUT', `orgs/${ORG}/builder/courses/${id}`, { user: HR, body: { revision: created.body.course.revision, lesson_ids: lessonIds } });
  assertEquals(saved.status, 200, JSON.stringify(saved.body));
  const published = await call('POST', `orgs/${ORG}/builder/courses/${id}/publish`, { user: HR });
  assertEquals(published.status, 200, JSON.stringify(published.body));
  return { id, code: `c-${id}` };
}

const right = { e1: [0], e2: ['Noon.'] };

Deno.test('a republished lesson cannot grade answers to the previous displayed version', async () => {
  const { call, db } = setup();
  const lesson = await publishedLesson(call);
  const course = await publishedCourse(call, [lesson.id]);
  const path = `orgs/${ORG}/learn/${lesson.code}?track=${course.code}`;
  const displayed = await call('GET', path, { user: EMPLOYEE });
  assertEquals(displayed.body.lesson.version, 1);
  const changed = content('Updated checkout rule');
  const question = changed.exercises[0];
  if (question.kind !== 'choice') throw new Error('choice fixture required');
  question.items[0].options = ['At night', 'At noon'];
  question.items[0].answer = 1;
  await call('PUT', `orgs/${ORG}/builder/lessons/${lesson.id}`, { user: HR, body: { revision: lesson.revision, draft: changed } });
  await call('POST', `orgs/${ORG}/builder/lessons/${lesson.id}/publish`, { user: HR });
  const stale = await call('POST', `orgs/${ORG}/learn/${lesson.code}/check?track=${course.code}`, { user: EMPLOYEE, body: { version: displayed.body.lesson.version, answers: right, minutes: 5 } });
  assertEquals([stale.status, stale.body.code], [409, 'lesson_updated']);
  assertEquals(db.rows('company_lesson_progress').length, 0);
  assertEquals(db.rows('company_activity').length, 0);
  const current = await call('POST', `orgs/${ORG}/learn/${lesson.code}/check?track=${course.code}`, { user: EMPLOYEE, body: { version: 2, answers: { ...right, e1: [1] }, minutes: 5 } });
  assertEquals(current.status, 200);
  assertEquals(current.body.score, 100);
  // Existing deployed clients did not send a version; tolerate those for the
  // frontend rollout while enforcing the guard for all updated clients.
  assertEquals((await call('POST', `orgs/${ORG}/learn/${lesson.code}/check?track=${course.code}`, { user: EMPLOYEE, body: { answers: { ...right, e1: [1] }, minutes: 1 } })).status, 200);
});

Deno.test('builder routes are for HR only, and lessons of another workspace stay out of reach', async () => {
  const { call, db } = setup();
  for (const user of [EMPLOYEE, MANAGER, OTHER]) {
    assertEquals((await call('GET', `orgs/${ORG}/builder`, { user })).status, 403);
    assertEquals((await call('POST', `orgs/${ORG}/builder/lessons`, { user, body: { title: 'x' } })).status, 403);
  }
  const foreign = crypto.randomUUID();
  db.rows('company_lessons').push({ id: foreign, org_id: ELSEWHERE, title: { en: 'Theirs' }, draft: content('Theirs'), status: 'published', revision: 1, published_version: 1, published_revision: 1, published: content('Theirs'), source: 'manual', level: 'a2' });
  assertEquals((await call('GET', `orgs/${ORG}/builder/lessons/${foreign}`, { user: HR })).status, 404);
  assertEquals((await call('POST', `orgs/${ORG}/builder/lessons/${foreign}/publish`, { user: HR, body: {} })).status, 404);
  assertEquals((await call('DELETE', `orgs/${ORG}/builder/lessons/${foreign}`, { user: HR })).status, 404);
  assertEquals((await call('GET', `orgs/${ORG}/learn/co-${foreign}`, { user: EMPLOYEE })).status, 404);
  const course = await call('POST', `orgs/${ORG}/builder/courses`, { user: HR, body: { title: 'Mine' } });
  const stolen = await call('PUT', `orgs/${ORG}/builder/courses/${course.body.course.id}`, { user: HR, body: { revision: 1, lesson_ids: [foreign] } });
  assertEquals([stolen.status, stolen.body.field], [400, 'lesson_ids']);
});

Deno.test('a lesson is drafted, refused until ready, published, then played and checked server-side', async () => {
  const { call, db } = setup();
  const created = await call('POST', `orgs/${ORG}/builder/lessons`, { user: HR, body: { title: 'Late check-out', level: 'a2' } });
  const id = created.body.lesson.id;
  assert(created.body.problems.some((problem: { code: string }) => problem.code === 'goal'));
  // Not ready: says why, in codes the app can translate.
  const early = await call('POST', `orgs/${ORG}/builder/lessons/${id}/publish`, { user: HR, body: {} });
  assertEquals(early.status, 409);
  assertEquals(early.body.code, 'publish_blocked');
  assert(early.body.problems.some((problem: { code: string }) => problem.code === 'no_exercises'));
  // A learner cannot open a draft.
  assertEquals((await call('GET', `orgs/${ORG}/learn/co-${id}`, { user: EMPLOYEE })).status, 404);

  const saved = await call('PUT', `orgs/${ORG}/builder/lessons/${id}`, { user: HR, body: { revision: 1, draft: content('Late check-out') } });
  assertEquals(saved.body.problems, []);
  // Saved in another tab: the older revision is refused.
  const stale = await call('PUT', `orgs/${ORG}/builder/lessons/${id}`, { user: HR, body: { revision: 1, draft: content('Overwrites') } });
  assertEquals([stale.status, stale.body.code], [409, 'builder_conflict']);

  const first = await call('POST', `orgs/${ORG}/builder/lessons/${id}/publish`, { user: HR, body: {} });
  assertEquals([first.status, first.body.lesson.status, first.body.lesson.version], [200, 'published', 1]);
  // A double click makes no second version.
  await call('POST', `orgs/${ORG}/builder/lessons/${id}/publish`, { user: HR, body: {} });
  assertEquals(db.rows('company_lesson_versions').length, 1);

  // Published but in no course: still closed to learners.
  assertEquals((await call('GET', `orgs/${ORG}/learn/co-${id}`, { user: EMPLOYEE })).status, 404);
  const course = await publishedCourse(call, [id]);

  const view = await call('GET', `orgs/${ORG}/learn/co-${id}`, { user: EMPLOYEE });
  assertEquals(view.status, 200);
  assertEquals(view.body.track.code, course.code);
  assertEquals(view.body.lesson.mission.kind, 'task');
  assertEquals(view.body.lesson.version, 1);
  assert(!JSON.stringify(view.body.lesson.exercises).includes('"answer"'), 'no answer keys');
  assert(!JSON.stringify(view.body.lesson.exercises).includes('"answers"'), 'no accepted answers');

  const wrong = await call('POST', `orgs/${ORG}/learn/co-${id}/check`, { user: EMPLOYEE, body: { answers: { e1: [1], e2: ['night'] }, minutes: 5 } });
  assertEquals([wrong.status, wrong.body.score, wrong.body.passed], [200, 0, false]);
  const pass = await call('POST', `orgs/${ORG}/learn/co-${id}/check`, { user: EMPLOYEE, body: { answers: right, minutes: 5 } });
  assertEquals([pass.body.score, pass.body.passed, pass.body.first_completion], [100, true, true]);
  // It counts as a lesson for dashboards, once.
  await call('POST', `orgs/${ORG}/learn/co-${id}/check`, { user: EMPLOYEE, body: { answers: right, minutes: 5 } });
  assertEquals(db.rows('company_activity').filter((row) => row.kind === 'lesson' && row.ref === `co-${id}`).length, 1);
  const row = db.rows('company_lesson_progress').find((entry) => entry.lesson_code === `co-${id}`)!;
  assertEquals(row.track_code, course.code);
});

Deno.test('a new version keeps progress, and learners see the draft only once it is published', async () => {
  const { call, db } = setup();
  const lesson = await publishedLesson(call);
  await publishedCourse(call, [lesson.id]);
  await call('POST', `orgs/${ORG}/learn/${lesson.code}/check`, { user: EMPLOYEE, body: { answers: right, minutes: 5 } });

  const edited = { ...content('Changed title'), exercises: [{ id: 'e1', kind: 'choice' as const, items: [{ q: 'When?', options: ['At noon', 'At dawn'], answer: 0 }] }] };
  const saved = await call('PUT', `orgs/${ORG}/builder/lessons/${lesson.id}`, { user: HR, body: { revision: lesson.revision, draft: edited } });
  assertEquals(saved.status, 200);
  assertEquals(saved.body.lesson.has_changes, true);
  const before = await call('GET', `orgs/${ORG}/learn/${lesson.code}`, { user: EMPLOYEE });
  assertEquals(before.body.lesson.title.en, 'Our late check-out');
  assertEquals(before.body.progress.status, 'completed');

  const next = await call('POST', `orgs/${ORG}/builder/lessons/${lesson.id}/publish`, { user: HR, body: {} });
  assertEquals(next.body.lesson.version, 2);
  const after = await call('GET', `orgs/${ORG}/learn/${lesson.code}`, { user: EMPLOYEE });
  assertEquals(after.body.lesson.title.en, 'Changed title');
  assertEquals([after.body.progress.status, after.body.progress.updated], ['completed', true]);
  assertEquals(db.rows('company_lesson_versions').map((row) => row.version).sort(), [1, 2]);

  // The old version can come back into the draft; learners keep v2 until it is published.
  const restored = await call('POST', `orgs/${ORG}/builder/lessons/${lesson.id}/restore`, { user: HR, body: { version: 1 } });
  assertEquals(restored.body.lesson.draft.title.en, 'Our late check-out');
  assertEquals((await call('GET', `orgs/${ORG}/learn/${lesson.code}`, { user: EMPLOYEE })).body.lesson.title.en, 'Changed title');
});

Deno.test('a course needs published lessons; archived lessons leave it; published lessons are archived, not deleted', async () => {
  const { call, db } = setup();
  const lesson = await publishedLesson(call);
  const draft = await call('POST', `orgs/${ORG}/builder/lessons`, { user: HR, body: { title: 'Unfinished' } });
  const course = await call('POST', `orgs/${ORG}/builder/courses`, { user: HR, body: { title: 'Mixed' } });
  const empty = await call('POST', `orgs/${ORG}/builder/courses/${course.body.course.id}/publish`, { user: HR });
  assertEquals([empty.status, empty.body.problems[0].code], [409, 'course_empty']);
  await call('PUT', `orgs/${ORG}/builder/courses/${course.body.course.id}`, { user: HR, body: { revision: 1, lesson_ids: [lesson.id, draft.body.lesson.id] } });
  const blocked = await call('POST', `orgs/${ORG}/builder/courses/${course.body.course.id}/publish`, { user: HR });
  assertEquals([blocked.status, blocked.body.problems[0].code, blocked.body.problems[0].n], [409, 'course_unpublished', 2]);
  await call('DELETE', `orgs/${ORG}/builder/lessons/${draft.body.lesson.id}`, { user: HR });
  assertEquals(db.rows('company_lessons').some((row) => row.id === draft.body.lesson.id), false);
  const detail = await call('GET', `orgs/${ORG}/builder/courses/${course.body.course.id}`, { user: HR });
  assertEquals(detail.body.course.lesson_ids, [lesson.id]);
  const done = await call('POST', `orgs/${ORG}/builder/courses/${course.body.course.id}/publish`, { user: HR, body: { revision: detail.body.course.revision } });
  assertEquals(done.status, 200);
  const code = `c-${course.body.course.id}`;
  const list = await call('GET', `orgs/${ORG}/tracks`, { user: EMPLOYEE });
  assertEquals(list.body.courses.map((entry: { code: string }) => entry.code), [code]);
  const track = await call('GET', `orgs/${ORG}/tracks/${code}`, { user: EMPLOYEE });
  assertEquals([track.status, track.body.track.company, track.body.lessons.length], [200, true, 1]);

  const removed = await call('DELETE', `orgs/${ORG}/builder/lessons/${lesson.id}`, { user: HR });
  assertEquals(removed.body, { archived: true });
  assertEquals((await call('GET', `orgs/${ORG}/learn/${lesson.code}`, { user: EMPLOYEE })).status, 404);
  assertEquals((await call('GET', `orgs/${ORG}/tracks`, { user: EMPLOYEE })).body.courses, []);
});

Deno.test('a company lesson needs a seat like any other, and a pilot has none', async () => {
  const { call, db } = setup();
  const lesson = await publishedLesson(call);
  await publishedCourse(call, [lesson.id]);
  db.rows('company_members').find((row) => row.id === M.employee)!.seat = false;
  const refused = await call('GET', `orgs/${ORG}/learn/${lesson.code}`, { user: EMPLOYEE });
  assertEquals([refused.status, refused.body.code, refused.body.reason], [402, 'seat_required', 'no_seat']);
  assertEquals((await call('POST', `orgs/${ORG}/learn/${lesson.code}/check`, { user: EMPLOYEE, body: { answers: right } })).status, 402);
  db.rows('company_orgs')[0].status = 'pilot';
  assertEquals((await call('GET', `orgs/${ORG}/learn/${lesson.code}`, { user: EMPLOYEE })).body.reason, 'pilot');
  // HR tries the draft without a seat, and nothing is saved.
  const preview = await call('GET', `orgs/${ORG}/builder/lessons/${lesson.id}/preview`, { user: HR });
  assertEquals(preview.status, 200);
  const tried = await call('POST', `orgs/${ORG}/builder/lessons/${lesson.id}/preview-check`, { user: HR, body: { answers: right } });
  assertEquals([tried.status, tried.body.score], [200, 100]);
  assertEquals(db.rows('company_lesson_progress').length, 0);
});

Deno.test('readLesson refuses what cannot be stored and bounds lists', () => {
  const cases: unknown[] = [
    { title: { en: 'a\u0000b' } },
    { exercises: [{ kind: 'quiz' }] },
    { phrases: Array.from({ length: 41 }, () => ({ en: 'x' })) },
    { exercises: [{ kind: 'gap', items: 'nope' }] },
    { mission: { kind: 'nothing', brief: {} } },
  ];
  for (const body of cases) {
    let failed = false;
    try { readLesson(body); } catch { failed = true; }
    assert(failed, JSON.stringify(body).slice(0, 60));
  }
  const repeated = readLesson({ exercises: [{ id: 'same', kind: 'order', lines: ['a', 'b'] }, { id: 'same', kind: 'order', lines: ['c', 'd'] }] });
  assertEquals(new Set(repeated.exercises.map((exercise) => exercise.id)).size, 2);
});

Deno.test('publishing checks each exercise type', () => {
  assertEquals(exerciseProblems({ id: 'a', kind: 'choice', items: [{ q: '', options: ['x', 'x'], answer: 5 }] }, 1).map((problem) => problem.code), ['ex_question', 'ex_options_repeat', 'ex_correct']);
  assertEquals(exerciseProblems({ id: 'a', kind: 'gap', items: [{ text: 'no gap', answers: [] }] }, 1).map((problem) => problem.code), ['ex_gap', 'ex_gap_answer']);
  assertEquals(exerciseProblems({ id: 'a', kind: 'order', lines: ['one'] }, 1).map((problem) => problem.code), ['ex_lines']);
  assertEquals(exerciseProblems({ id: 'a', kind: 'match', pairs: [['a', '1'], ['a', '2']] }, 1).map((problem) => problem.code), ['ex_pairs_repeat']);
  assertEquals(lessonProblems(content('Fine')), []);
});

const AI_CORE = {
  title: { en: 'Our pool rules', ru: 'Правила бассейна', uz: 'Basseyn qoidalari' }, goal: { en: 'Explain the pool rules', ru: 'Объяснить правила', uz: 'Qoidalarni tushuntirish' },
  phrases: [{ en: 'The pool opens at seven.', ru: 'Бассейн открывается в семь.', uz: 'Basseyn yettida ochiladi.' }, { en: 'The pool opens at seven.', ru: 'дубль', uz: 'takror' }],
  words: [{ en: 'lifeguard', ru: 'спасатель', uz: 'qutqaruvchi', note: 'noun' }],
  mission: { brief: { en: 'Tell a guest the rules.', ru: 'Расскажите гостю правила.', uz: 'Mehmonga qoidalarni ayting.' } },
};
const AI_PRACTICE = {
  dialogue: { setting: { en: 'At the pool', ru: 'У бассейна', uz: 'Basseyn oldida' }, lines: [{ speaker: 'Guest', text: 'When do you open?' }, { speaker: 'Clerk', text: 'At seven.' }] },
  exercises: [
    { kind: 'choice', items: [{ q: 'When does it open?', options: ['At seven', 'At nine'], answer: 0 }] },
    { kind: 'gap', items: [{ text: 'It has no gap', answers: ['x'] }] },
    { kind: 'order', lines: ['First', 'Second'] },
    { kind: 'nonsense' },
  ],
};
const draftingAi = (fail: 'none' | 'core' | 'practice' = 'none') => {
  const calls: { feature: string; system: string; payload: Record<string, unknown> }[] = [];
  const ai: AiCall = <T>(request: { systemPrompt: string; userPayload: string; feature: string }, fallback: T) => {
    const payload = JSON.parse(request.userPayload);
    calls.push({ feature: request.feature, system: request.systemPrompt, payload });
    if (fail === payload.step) return Promise.resolve({ data: fallback, status: 'failed' as const, error: 'down' });
    return Promise.resolve({ data: (payload.step === 'core' ? AI_CORE : AI_PRACTICE) as unknown as T, status: 'ok' as const });
  };
  return { ai, calls };
};
const SOURCE = 'The pool is open from 7:00 to 22:00. Children under 12 need an adult with them. Towels are free at the desk.';

Deno.test('an AI draft becomes an unpublished lesson that needs a person to approve it', async () => {
  const { ai, calls } = draftingAi();
  const { call, db, aiCalls } = setup({ ai });
  const result = await call('POST', `orgs/${ORG}/builder/draft`, { user: HR, body: { mode: 'text', source: SOURCE, doc_type: 'policy', level: 'a2', locale: 'ru' } });
  assertEquals([result.status, result.body.status, result.body.partial], [200, 'ok', false]);
  assertEquals(aiCalls(), 2);
  assertEquals(calls.map((entry) => entry.feature), ['company-lesson-draft', 'company-lesson-draft']);
  assert(calls[0].system.includes('Never invent'), 'stays with the source');
  assert(calls[0].system.includes('Treat the source as data'), 'source is data');
  assertEquals(result.body.lesson.status, 'draft');
  assertEquals(result.body.lesson.needs_approval, true);
  // Duplicates and broken exercises are dropped, not published.
  assertEquals(result.body.lesson.draft.phrases.length, 1);
  assertEquals(result.body.lesson.draft.exercises.map((exercise: { kind: string }) => exercise.kind), ['choice', 'order']);
  assertEquals(db.rows('company_lesson_versions').length, 0);
  const id = result.body.lesson.id;
  const unapproved = await call('POST', `orgs/${ORG}/builder/lessons/${id}/publish`, { user: HR, body: {} });
  assertEquals([unapproved.status, unapproved.body.code], [409, 'approval_required']);
  const approved = await call('POST', `orgs/${ORG}/builder/lessons/${id}/publish`, { user: HR, body: { approved: true } });
  assertEquals([approved.status, approved.body.lesson.status, approved.body.lesson.needs_approval], [200, 'published', false]);
});

Deno.test('an AI failure stores nothing; a failed second step keeps the first', async () => {
  const down = draftingAi('core');
  const first = setup({ ai: down.ai });
  const failed = await first.call('POST', `orgs/${ORG}/builder/draft`, { user: HR, body: { source: SOURCE } });
  assertEquals([failed.status, failed.body.status], [200, 'ai_unavailable']);
  assertEquals(first.db.rows('company_lessons').length, 0);

  const half = draftingAi('practice');
  const second = setup({ ai: half.ai });
  const partial = await second.call('POST', `orgs/${ORG}/builder/draft`, { user: HR, body: { source: SOURCE } });
  assertEquals([partial.body.status, partial.body.partial], ['ok', true]);
  assertEquals(partial.body.lesson.draft.exercises, []);

  const capped = setup({ ai: draftingAi().ai, aiAllowed: () => false });
  assertEquals((await capped.call('POST', `orgs/${ORG}/builder/draft`, { user: HR, body: { source: SOURCE } })).body.status, 'ai_limit');
  assertEquals(capped.db.rows('company_lessons').length, 0);
  assertEquals((await capped.call('POST', `orgs/${ORG}/builder/draft`, { user: HR, body: { source: 'short' } })).status, 400);
});

Deno.test('a draft can come from the company glossary, scoped to this workspace', async () => {
  const { ai, calls } = draftingAi();
  const { call, db } = setup({ ai });
  assertEquals((await call('POST', `orgs/${ORG}/builder/draft`, { user: HR, body: { mode: 'glossary' } })).body.code, 'glossary_empty');
  db.rows('company_glossary_terms').push(
    { id: crypto.randomUUID(), org_id: ORG, term: 'Folio', meaning: 'The guest bill', ru: 'Счёт', uz: 'Hisob', example: null, department_id: null },
    { id: crypto.randomUUID(), org_id: ELSEWHERE, term: 'Secret', meaning: 'Other company', ru: null, uz: null, example: null, department_id: null },
  );
  const result = await call('POST', `orgs/${ORG}/builder/draft`, { user: HR, body: { mode: 'glossary', level: 'b1' } });
  assertEquals(result.body.status, 'ok');
  const sent = JSON.stringify(calls[0].payload);
  assert(sent.includes('Folio') && !sent.includes('Secret'));
});

Deno.test('aiLesson needs at least a title and something to learn', () => {
  assertEquals(aiLesson({ title: { en: '' }, phrases: [{ en: 'x' }] }, 'b1'), null);
  assertEquals(aiLesson({ title: { en: 'x' } }, 'b1'), null);
  assertEquals(aiLesson(null, 'b1'), null);
  const lesson = aiLesson({ title: { en: 'x'.repeat(500) }, phrases: [{ en: 'a\u0000' }] }, 'b1')!;
  assertEquals(lesson.title.en.length, 200);
});

const SCENARIO = {
  title: { en: 'A guest disputes the minibar', ru: 'Гость оспаривает счёт', uz: 'Mehmon hisobga e’tiroz bildiradi' }, goal: { en: 'Solve it politely', ru: 'Решить вежливо', uz: 'Muloyim hal qilish' },
  persona: 'An annoyed guest who says he never opened the minibar.', learner_role: 'Front desk clerk', setting: 'Hotel reception at check-out', opening: 'Why is there a minibar charge on my bill?', difficulty: 'hard',
  checklist: ['Apologises', 'Offers to check the record', 'Removes or explains the charge'],
};

Deno.test('a custom scenario is written, published and practised; feedback answers each criterion', async () => {
  const seen: string[] = [];
  const ai: AiCall = <T>(request: { systemPrompt: string; userPayload: string }, _fallback: T) => {
    seen.push(request.systemPrompt);
    const payload = JSON.parse(request.userPayload);
    if (payload.transcript) return Promise.resolve({ status: 'ok' as const, data: { score: 70, summary: 'Хорошо', goal_met: true, good_phrases: [], better_phrases: [], checklist: [{ item: 'Offers to check the record', done: true }, { item: 'invented criterion', done: true }], next_step: '' } as unknown as T });
    return Promise.resolve({ status: 'ok' as const, data: { reply: 'I see.', done: false, tip: '' } as unknown as T });
  };
  const { call, db } = setup({ ai });
  assertEquals((await call('POST', `orgs/${ORG}/builder/scenarios`, { user: EMPLOYEE, body: SCENARIO })).status, 403);
  const created = await call('POST', `orgs/${ORG}/builder/scenarios`, { user: HR, body: { ...SCENARIO, checklist: ['Only one'] } });
  assertEquals(created.status, 200);
  const id = created.body.scenario.id;
  const early = await call('POST', `orgs/${ORG}/builder/scenarios/${id}/publish`, { user: HR });
  assertEquals([early.status, early.body.problems[0].code], [409, 'criteria']);
  // A draft is not open to employees.
  assertEquals((await call('POST', `orgs/${ORG}/roleplay`, { user: EMPLOYEE, body: { scenario: `cs-${id}` } })).status, 404);
  await call('PUT', `orgs/${ORG}/builder/scenarios/${id}`, { user: HR, body: SCENARIO });
  assertEquals((await call('POST', `orgs/${ORG}/builder/scenarios/${id}/publish`, { user: HR })).status, 200);

  const home = await call('GET', `orgs/${ORG}/roleplay`, { user: EMPLOYEE });
  assertEquals(home.body.first_group, 'company');
  assertEquals(home.body.tracks[0].scenarios[0].code, `cs-${id}`);
  assert(!JSON.stringify(home.body.tracks[0].scenarios[0]).includes('annoyed guest'), 'the persona stays with the AI');

  const started = await call('POST', `orgs/${ORG}/roleplay`, { user: EMPLOYEE, body: { scenario: `cs-${id}`, locale: 'ru' } });
  const session = started.body.session;
  assertEquals([session.custom, session.difficulty, session.turns[0].text], [true, 'hard', SCENARIO.opening]);

  // HR edits it while someone is practising: the session keeps its own copy.
  await call('PUT', `orgs/${ORG}/builder/scenarios/${id}`, { user: HR, body: { ...SCENARIO, opening: 'Changed', checklist: ['New one', 'New two'] } });
  await call('POST', `orgs/${ORG}/roleplay/${session.id}/turn`, { user: EMPLOYEE, body: { text: 'I am sorry, let me check.' } });
  const finished = await call('POST', `orgs/${ORG}/roleplay/${session.id}/finish`, { user: EMPLOYEE, body: { locale: 'ru' } });
  assertEquals(finished.body.status, 'ok');
  assertEquals(finished.body.session.feedback.checklist, [{ item: 'Apologises', done: false }, { item: 'Offers to check the record', done: true }, { item: 'Removes or explains the charge', done: false }]);
  assert(seen[seen.length - 1].includes('word for word'), 'the prompt asks for each criterion');

  // HR sees how much it is practised by people who share, never what they said.
  const stats = await call('GET', `orgs/${ORG}/builder/scenarios/${id}`, { user: HR });
  assertEquals(stats.body.practice, { sessions: 1, people: 1, average: 70 });
  assert(!JSON.stringify(stats.body).includes('let me check'));
  db.rows('company_members').find((row) => row.id === M.employee)!.consent_at = null;
  assertEquals((await call('GET', `orgs/${ORG}/builder/scenarios/${id}`, { user: HR })).body.practice, { sessions: 0, people: 0, average: null });

  // Published scenarios are archived regardless of anybody's private practice.
  assertEquals((await call('DELETE', `orgs/${ORG}/builder/scenarios/${id}`, { user: HR })).body, { archived: true });
  assertEquals((await call('POST', `orgs/${ORG}/roleplay`, { user: EMPLOYEE, body: { scenario: `cs-${id}` } })).status, 404);
});

Deno.test('deleting a published scenario does not disclose private practice', async () => {
  const { call, db } = setup();
  for (const practised of [false, true]) {
    const created = await call('POST', `orgs/${ORG}/builder/scenarios`, { user: HR, body: SCENARIO });
    const id = created.body.scenario.id;
    await call('POST', `orgs/${ORG}/builder/scenarios/${id}/publish`, { user: HR });
    if (practised) await call('POST', `orgs/${ORG}/roleplay`, { user: OTHER, body: { scenario: `cs-${id}` } });
    assertEquals((await call('GET', `orgs/${ORG}/builder/scenarios/${id}`, { user: HR })).body.practice, { sessions: 0, people: 0, average: null });
    assertEquals((await call('DELETE', `orgs/${ORG}/builder/scenarios/${id}`, { user: HR })).body, { archived: true });
    assert(db.rows('company_scenarios').some((row) => row.id === id && row.status === 'archived'));
  }
  const draft = await call('POST', `orgs/${ORG}/builder/scenarios`, { user: HR, body: SCENARIO });
  assertEquals((await call('DELETE', `orgs/${ORG}/builder/scenarios/${draft.body.scenario.id}`, { user: HR })).body, { deleted: true });
});

Deno.test('alignCriteria answers each criterion and ignores invented ones', () => {
  assertEquals(alignCriteria(['A', 'B'], [{ item: 'b', done: true }]), [{ item: 'A', done: false }, { item: 'B', done: true }]);
  assertEquals(alignCriteria(['A', 'B'], [{ item: 'x', done: true }, { item: 'y', done: false }]), [{ item: 'A', done: true }, { item: 'B', done: false }]);
  assertEquals(alignCriteria(['A'], []), [{ item: 'A', done: false }]);
});

Deno.test('role-play depth: difficulty, hints, replay and score history', async () => {
  const prompts: string[] = [];
  let score = 50;
  const ai: AiCall = <T>(request: { systemPrompt: string; userPayload: string }, _fallback: T) => {
    prompts.push(request.systemPrompt);
    const payload = JSON.parse(request.userPayload);
    if (payload.hint_for) return Promise.resolve({ status: 'ok' as const, data: { say: 'I am so sorry for the wait.', why: 'Сначала извинитесь.' } as unknown as T });
    if (payload.transcript) return Promise.resolve({ status: 'ok' as const, data: { score: score, summary: 'ok', goal_met: true, good_phrases: [], better_phrases: [], checklist: [], next_step: '' } as unknown as T });
    return Promise.resolve({ status: 'ok' as const, data: { reply: 'Go on.', done: false, tip: '' } as unknown as T });
  };
  const { call, db } = setup({ ai });
  const scenario = findTrack('hospitality')!.scenarios[0].code;
  const bad = await call('POST', `orgs/${ORG}/roleplay`, { user: EMPLOYEE, body: { scenario, difficulty: 'impossible' } });
  assertEquals(bad.status, 400);
  const started = await call('POST', `orgs/${ORG}/roleplay`, { user: EMPLOYEE, body: { scenario, difficulty: 'hard' } });
  const id = started.body.session.id;
  assertEquals(started.body.session.difficulty, 'hard');

  const hint = await call('POST', `orgs/${ORG}/roleplay/${id}/hint`, { user: EMPLOYEE, body: { locale: 'ru' } });
  assertEquals([hint.body.status, hint.body.say, hint.body.hints], ['ok', 'I am so sorry for the wait.', 1]);

  const turned = await call('POST', `orgs/${ORG}/roleplay/${id}/turn`, { user: EMPLOYEE, body: { text: 'Sorry.' } });
  assertEquals(turned.body.status, 'ok');
  assert(prompts[prompts.length - 1].includes('demanding and in a hurry'), 'the chosen difficulty reaches the AI');
  await call('POST', `orgs/${ORG}/roleplay/${id}/turn`, { user: EMPLOYEE, body: { text: 'Second answer.' } });
  await call('POST', `orgs/${ORG}/roleplay/${id}/finish`, { user: EMPLOYEE, body: {} });
  assertEquals((await call('POST', `orgs/${ORG}/roleplay/${id}/hint`, { user: EMPLOYEE, body: {} })).body.code, 'roleplay_ended');

  // Replay from the second reply: the first exchange stays, the original is untouched.
  const session = db.rows('company_roleplay_sessions').find((row) => row.id === id)! as { turns: { role: string }[] };
  const secondReply = session.turns.map((turn, index) => turn.role === 'learner' ? index : -1).filter((index) => index >= 0)[1];
  assertEquals((await call('POST', `orgs/${ORG}/roleplay/${id}/replay`, { user: EMPLOYEE, body: { turn: 0 } })).status, 400);
  const replay = await call('POST', `orgs/${ORG}/roleplay/${id}/replay`, { user: EMPLOYEE, body: { turn: secondReply } });
  assertEquals(replay.status, 200);
  assertEquals([replay.body.original, replay.body.session.learner_turns, replay.body.session.replay_of, replay.body.session.difficulty], ['Second answer.', 1, id, 'hard']);
  assertEquals((db.rows('company_roleplay_sessions').find((row) => row.id === id) as { learner_turns: number }).learner_turns, 2);

  score = 80;
  await call('POST', `orgs/${ORG}/roleplay/${replay.body.session.id}/turn`, { user: EMPLOYEE, body: { text: 'A better answer.' } });
  await call('POST', `orgs/${ORG}/roleplay/${replay.body.session.id}/finish`, { user: EMPLOYEE, body: {} });
  const history = await call('GET', `orgs/${ORG}/roleplay/history?scenario=${scenario}`, { user: EMPLOYEE });
  assertEquals(history.status, 200);
  assertEquals([history.body.scenarios.length, history.body.scenarios[0].best, history.body.scenarios[0].first, history.body.scenarios[0].last], [1, 80, 50, 80]);
  assertEquals((await call('GET', `orgs/${ORG}/roleplay`, { user: EMPLOYEE })).body.history[0].attempts.length, 2);
  // Someone else's session and scores stay theirs.
  assertEquals((await call('POST', `orgs/${ORG}/roleplay/${id}/replay`, { user: OTHER, body: { turn: secondReply } })).status, 404);
  assertEquals((await call('GET', `orgs/${ORG}/roleplay/history`, { user: OTHER })).body.scenarios, []);
});

Deno.test('hints: a cap, and the next aim when AI cannot help; no seat, no hint', async () => {
  const down: AiCall = <T>(_request: unknown, fallback: T) => Promise.resolve({ data: fallback, status: 'failed' as const, error: 'down' });
  const { call, db } = setup({ ai: down });
  const scenario = findTrack('hospitality')!.scenarios[0];
  const started = await call('POST', `orgs/${ORG}/roleplay`, { user: EMPLOYEE, body: { scenario: scenario.code } });
  const id = started.body.session.id;
  const hint = await call('POST', `orgs/${ORG}/roleplay/${id}/hint`, { user: EMPLOYEE, body: {} });
  assertEquals([hint.body.status, hint.body.aim, hint.body.hints], ['ai_unavailable', scenario.checklist[0], 0]);
  (db.rows('company_roleplay_sessions').find((row) => row.id === id) as { hints: number }).hints = 5;
  assertEquals((await call('POST', `orgs/${ORG}/roleplay/${id}/hint`, { user: EMPLOYEE, body: {} })).body.code, 'roleplay_hints_used');
  db.rows('company_members').find((row) => row.id === M.employee)!.seat = false;
  assertEquals((await call('POST', `orgs/${ORG}/roleplay/${id}/hint`, { user: EMPLOYEE, body: {} })).status, 402);
});

const WRITING_REPLY = { corrected: 'Dear Mr Lee, thank you.', score: 72, summary: 'Хорошо', tone: 'Официально', tone_notes: [], changes: [], checklist: [] };

Deno.test('writing depth: tone, rewrite, shorten and reply modes', async () => {
  const seen: { system: string; payload: Record<string, unknown> }[] = [];
  const ai: AiCall = <T>(request: { systemPrompt: string; userPayload: string }, _fallback: T) => {
    seen.push({ system: request.systemPrompt, payload: JSON.parse(request.userPayload) });
    return Promise.resolve({ status: 'ok' as const, data: WRITING_REPLY as unknown as T });
  };
  const { call, db } = setup({ ai });
  const text = 'Dear Mr Lee, we are send the goods next week, please wait.';
  const firm = await call('POST', `orgs/${ORG}/writing/check`, { user: EMPLOYEE, body: { text, tone: 'firm' } });
  assertEquals([firm.body.status, firm.body.check.mode, firm.body.check.tone], ['ok', 'check', 'firm']);
  assert(seen[0].system.includes('firm and clear'));
  const customer = await call('POST', `orgs/${ORG}/writing/check`, { user: EMPLOYEE, body: { text, mode: 'customer' } });
  assertEquals(customer.body.check.mode, 'customer');
  assert(seen[1].system.includes('Rewrite the text for a customer'));
  await call('POST', `orgs/${ORG}/writing/check`, { user: EMPLOYEE, body: { text, mode: 'shorten', tone: 'friendly' } });
  assert(seen[2].system.includes('Shorten') && seen[2].system.includes('warm and friendly'));
  // A reply is written from short notes, and answers the email it is given.
  assertEquals((await call('POST', `orgs/${ORG}/writing/check`, { user: EMPLOYEE, body: { text: 'yes, Friday', mode: 'reply' } })).status, 400);
  const reply = await call('POST', `orgs/${ORG}/writing/check`, { user: EMPLOYEE, body: { text: 'yes, Friday', mode: 'reply', reply_to: 'Can you deliver the order by Friday afternoon?' } });
  assertEquals([reply.status, reply.body.check.mode], [200, 'reply']);
  assertEquals(seen[3].payload.reply_to, 'Can you deliver the order by Friday afternoon?');
  assertEquals(reply.body.check.result.reply_to, 'Can you deliver the order by Friday afternoon?');
  assertEquals((await call('POST', `orgs/${ORG}/writing/check`, { user: EMPLOYEE, body: { text, tone: 'rude' } })).status, 400);
  assertEquals((await call('POST', `orgs/${ORG}/writing/check`, { user: EMPLOYEE, body: { text, mode: 'poem' } })).status, 400);
  // The old shape still works, and short text is still refused when checking.
  assertEquals((await call('POST', `orgs/${ORG}/writing/check`, { user: EMPLOYEE, body: { text } })).body.check.mode, 'check');
  assertEquals((await call('POST', `orgs/${ORG}/writing/check`, { user: EMPLOYEE, body: { text: 'short' } })).status, 400);
  assertEquals(db.rows('company_activity').filter((row) => row.kind === 'writing').length, 5);
  const list = await call('GET', `orgs/${ORG}/writing`, { user: EMPLOYEE });
  assert(list.body.checks.some((entry: { mode: string }) => entry.mode === 'reply'));
});

Deno.test('saved writing templates belong to one person', async () => {
  const { call, db } = setup();
  const created = await call('POST', `orgs/${ORG}/writing/saved`, { user: EMPLOYEE, body: { title: 'Late delivery', body: 'Dear customer,', tone: 'formal' } });
  assertEquals(created.status, 200);
  const id = created.body.template.id;
  db.uniques.company_writing_snippets = [{ columns: ['member_id', 'title'] }];
  const twice = await call('POST', `orgs/${ORG}/writing/saved`, { user: EMPLOYEE, body: { title: 'Late delivery', body: 'Again' } });
  assertEquals([twice.status, twice.body.code], [409, 'snippet_duplicate']);
  // The rest of the writing routes still answer: "saved" is not taken for a check id.
  assertEquals((await call('GET', `orgs/${ORG}/writing/saved`, { user: EMPLOYEE })).body.templates.length, 1);
  assertEquals((await call('GET', `orgs/${ORG}/writing/saved`, { user: OTHER })).body.templates, []);
  assertEquals((await call('GET', `orgs/${ORG}/writing/saved`, { user: HR })).body.templates, []);
  assertEquals((await call('PATCH', `orgs/${ORG}/writing/saved/${id}`, { user: OTHER, body: { title: 'Mine' } })).status, 404);
  assertEquals((await call('DELETE', `orgs/${ORG}/writing/saved/${id}`, { user: HR })).status, 404);
  const renamed = await call('PATCH', `orgs/${ORG}/writing/saved/${id}`, { user: EMPLOYEE, body: { title: 'Delay', tone: null } });
  assertEquals([renamed.body.template.title, renamed.body.template.tone], ['Delay', null]);
  assertEquals((await call('POST', `orgs/${ORG}/writing/saved`, { user: EMPLOYEE, body: { title: 'x\u0000', body: 'y' } })).status, 400);
  // Saving needs a seat; removing does not.
  db.rows('company_members').find((row) => row.id === M.employee)!.seat = false;
  assertEquals((await call('POST', `orgs/${ORG}/writing/saved`, { user: EMPLOYEE, body: { title: 'New', body: 'y' } })).status, 402);
  assertEquals((await call('DELETE', `orgs/${ORG}/writing/saved/${id}`, { user: EMPLOYEE })).status, 200);
});

Deno.test('suggestPath orders steps by level, role and courses', () => {
  const courses = [{ code: 'c-a', job_role: null }, { code: 'c-b', job_role: 'hospitality' }, { code: 'c-c', job_role: 'sales' }];
  const beginner = suggestPath({ level: 'a1', target: 'b1', jobRole: 'hospitality', courses });
  assertEquals(beginner.steps.map((step) => `${step.code}/${step.stage ?? ''}`), ['general/foundation', 'hospitality/foundation', 'c-b/', 'c-a/', 'hospitality/professional']);
  const strong = suggestPath({ level: 'b2', target: 'c1', jobRole: 'hospitality', courses: [] });
  assertEquals(strong.steps.map((step) => `${step.code}/${step.stage}`), ['hospitality/professional', 'general/professional']);
  const unknown = suggestPath({ level: null, target: null, jobRole: 'nonsense', courses: [] });
  assertEquals(unknown.target, 'b1');
  assert(unknown.steps.every((step) => step.code === 'general'));
  assertEquals(defaultTarget('b1'), 'b2');
  assertEquals(defaultTarget('c2'), 'c2');
});

Deno.test('the estimate uses what is left and is never a promise of speed', () => {
  const views = stepViews([{ kind: 'track', code: 'hospitality', stage: 'foundation' }], [], new Set());
  const lessons = views[0].lessons;
  const plan = estimate(views, 'a2', 'b1', 120);
  assertEquals(plan.lessons_left, lessons);
  assertEquals(plan.level_hours, 80);
  assertEquals(plan.weeks, Math.ceil(plan.hours * 60 / 120));
  assertEquals(estimate(views, 'b2', 'b1', 120).level_hours, 0);
  const finished = stepViews([{ kind: 'track', code: 'hospitality', stage: 'foundation' }], [], new Set(findTrack('hospitality')!.lessons.map((lesson) => lesson.code)));
  assertEquals(estimate(finished, 'b1', 'b1', 120).weeks, 0);
});

Deno.test('paths: suggested, saved by HR, for a department, with progress only under consent', async () => {
  const { call, db } = setup();
  const lesson = await publishedLesson(call);
  const course = await publishedCourse(call, [lesson.id]);

  const mine = await call('GET', `orgs/${ORG}/my/path`, { user: EMPLOYEE });
  assertEquals(mine.body.source, 'suggested');
  assert(mine.body.steps.some((step: { code: string }) => step.code === course.code), 'company courses join the path');
  assert(mine.body.estimate.weeks > 0);
  assertEquals(mine.body.estimate.pace, 'assumed');

  const steps = [{ kind: 'course', code: course.code }, { kind: 'track', code: 'sales', stage: 'foundation' }];
  assertEquals((await call('POST', `orgs/${ORG}/paths`, { user: EMPLOYEE, body: { member_id: M.employee, steps } })).status, 403);
  const bad = await call('POST', `orgs/${ORG}/paths`, { user: HR, body: { member_id: M.employee, steps: [{ kind: 'course', code: `c-${crypto.randomUUID()}` }] } });
  assertEquals([bad.status, bad.body.field], [400, 'steps']);
  const repeated = await call('POST', `orgs/${ORG}/paths`, { user: HR, body: { member_id: M.employee, steps: [steps[0], steps[0]] } });
  assertEquals(repeated.status, 400);
  const foreign = await call('POST', `orgs/${ORG}/paths`, { user: HR, body: { member_id: crypto.randomUUID(), steps } });
  assertEquals(foreign.status, 404);
  const wrongDay = await call('POST', `orgs/${ORG}/paths`, { user: HR, body: { member_id: M.employee, steps, due_date: '2030-02-31' } });
  assertEquals(wrongDay.status, 400);

  const saved = await call('POST', `orgs/${ORG}/paths`, { user: HR, body: { member_id: M.employee, steps, target_level: 'b1', due_date: '2030-01-15' } });
  assertEquals(saved.status, 200);
  // Saving again replaces it rather than failing on the unique index.
  const again = await call('POST', `orgs/${ORG}/paths`, { user: HR, body: { member_id: M.employee, steps: [steps[0]], target_level: 'b2' } });
  assertEquals(again.body.path.id, saved.body.path.id);
  assertEquals(db.rows('company_learning_paths').length, 1);
  assertEquals((await call('GET', `orgs/${ORG}/my/path`, { user: EMPLOYEE })).body.source, 'member');

  // A department's path reaches its people unless they have their own.
  const dept = await call('POST', `orgs/${ORG}/paths`, { user: HR, body: { department_id: SALES, steps: [steps[1]], target_level: 'b2' } });
  assertEquals(dept.status, 200);
  assertEquals((await call('GET', `orgs/${ORG}/my/path`, { user: OTHER })).body.source, 'department');
  assertEquals((await call('POST', `orgs/${ORG}/paths`, { user: HR, body: { department_id: crypto.randomUUID(), steps } })).status, 400);

  await call('POST', `orgs/${ORG}/learn/${lesson.code}/check`, { user: EMPLOYEE, body: { answers: right } });
  await call('POST', `orgs/${ORG}/learn/${findTrack('sales')!.lessons[0].code}/check`, { user: OTHER, body: { answers: {} } });
  db.rows('company_lesson_progress').filter((row) => row.member_id === M.other).forEach((row) => { row.status = 'completed'; });

  const board = await call('GET', `orgs/${ORG}/paths`, { user: HR });
  const row = (id: string) => board.body.people.find((person: { id: string }) => person.id === id);
  assertEquals([row(M.employee).shared, row(M.employee).path.done, row(M.employee).path.lessons], [true, 1, 1]);
  // Agreed to nothing: HR sees the path but not the progress.
  assertEquals([row(M.other).shared, row(M.other).path.done], [false, null]);
  const detail = await call('GET', `orgs/${ORG}/paths/member/${M.other}`, { user: HR });
  assertEquals([detail.body.shared, detail.body.steps[0].done], [false, null]);
  assertEquals(detail.body.steps[0].next.code, findTrack('sales')!.lessons[0].code);

  // A manager sees their own department only.
  const managerBoard = await call('GET', `orgs/${ORG}/paths`, { user: MANAGER });
  assertEquals(managerBoard.body.people.map((person: { id: string }) => person.id).sort(), [M.employee, M.manager].sort());
  assertEquals(managerBoard.body.can_manage, false);
  assertEquals(managerBoard.body.department_paths, []);
  assertEquals((await call('GET', `orgs/${ORG}/paths/member/${M.other}`, { user: MANAGER })).status, 404);
  assertEquals((await call('GET', `orgs/${ORG}/paths`, { user: EMPLOYEE })).status, 403);

  const suggestion = await call('POST', `orgs/${ORG}/paths/suggest`, { user: HR, body: { job_role: 'sales', level: 'a2', target_level: 'b1' } });
  assert(suggestion.body.steps.length > 0 && suggestion.body.estimate.hours > 0);

  assertEquals((await call('DELETE', `orgs/${ORG}/paths/${saved.body.path.id}`, { user: HR })).status, 200);
  assertEquals((await call('GET', `orgs/${ORG}/my/path`, { user: EMPLOYEE })).body.source, 'suggested');
  assertEquals((await call('DELETE', `orgs/${ORG}/paths/${crypto.randomUUID()}`, { user: HR })).status, 404);
});

Deno.test('finishing a course gives one certificate; the public check shows no contact details', async () => {
  const { call, db } = setup();
  const lesson = await publishedLesson(call);
  const course = await publishedCourse(call, [lesson.id]);
  const pass = await call('POST', `orgs/${ORG}/learn/${lesson.code}/check`, { user: EMPLOYEE, body: { answers: right, minutes: 5 } });
  assertEquals(pass.body.certificates.length, 1);
  const code = pass.body.certificates[0].code;
  assertEquals(db.rows('company_training_certificates').length, 1);
  // A second pass is not a second certificate.
  assertEquals((await call('POST', `orgs/${ORG}/learn/${lesson.code}/check`, { user: EMPLOYEE, body: { answers: right, minutes: 5 } })).body.certificates, []);

  const checked = await call('GET', `public/c/${code.toLowerCase()}`);
  assertEquals(checked.status, 200);
  assertEquals([checked.body.certificate.name, checked.body.certificate.company, checked.body.certificate.kind, checked.body.certificate.revoked], ['employee', 'Silk Road Hotels', 'course', false]);
  assert(!JSON.stringify(checked.body).includes('@'), 'no email');
  assertEquals((await call('GET', 'public/c/NOPE')).status, 404);
  assertEquals((await call('GET', 'public/c/ABCDEFGHJK')).status, 404);

  const mine = await call('GET', `orgs/${ORG}/my/certificates`, { user: EMPLOYEE });
  assertEquals([mine.body.certificates.length, mine.body.certificates[0].code, mine.body.claimable], [1, code, []]);
  // Someone else cannot claim it, and has not earned it.
  const claim = await call('POST', `orgs/${ORG}/my/certificates`, { user: MANAGER, body: { kind: 'course', code: course.code } });
  assertEquals([claim.status, claim.body.code], [409, 'certificate_not_earned']);

  // HR can withdraw it; the public check says so.
  const certificate = db.rows('company_training_certificates')[0];
  assertEquals((await call('POST', `orgs/${ORG}/certificates/${certificate.id}/revoke`, { user: EMPLOYEE, body: {} })).status, 403);
  await call('POST', `orgs/${ORG}/certificates/${certificate.id}/revoke`, { user: HR, body: {} });
  assertEquals((await call('GET', `public/c/${code}`)).body.certificate.revoked, true);
  await call('POST', `orgs/${ORG}/certificates/${certificate.id}/revoke`, { user: HR, body: { revoke: false } });
  assertEquals((await call('GET', `public/c/${code}`)).body.certificate.revoked, false);
  assertEquals((await call('POST', `orgs/${ORG}/certificates/${crypto.randomUUID()}/revoke`, { user: HR, body: {} })).status, 404);
});

Deno.test('a track finished before certificates existed can be claimed; a double claim gives one', async () => {
  const { call, db } = setup();
  const track = findTrack('hospitality')!;
  for (const lesson of track.lessons) {
    db.rows('company_lesson_progress').push({ id: crypto.randomUUID(), org_id: ORG, member_id: M.employee, user_id: EMPLOYEE, track_code: track.code, lesson_code: lesson.code, status: 'completed', score: 90, minutes: 5, attempts: 1, data: {} });
  }
  const list = await call('GET', `orgs/${ORG}/my/certificates`, { user: EMPLOYEE });
  assertEquals(list.body.claimable.map((entry: { code: string }) => entry.code), ['hospitality']);
  const [one, two] = await Promise.all([
    call('POST', `orgs/${ORG}/my/certificates`, { user: EMPLOYEE, body: { kind: 'track', code: 'hospitality' } }),
    call('POST', `orgs/${ORG}/my/certificates`, { user: EMPLOYEE, body: { kind: 'track', code: 'hospitality' } }),
  ]);
  assertEquals(one.body.certificate.code, two.body.certificate.code);
  assertEquals(db.rows('company_training_certificates').length, 1);
  assertEquals((await call('POST', `orgs/${ORG}/my/certificates`, { user: EMPLOYEE, body: { kind: 'track', code: 'sales' } })).status, 409);
  assertEquals((await call('POST', `orgs/${ORG}/my/certificates`, { user: EMPLOYEE, body: { kind: 'track', code: 'nope' } })).status, 409);
});

Deno.test('HR sees certificates only of people who share, managers only their department', async () => {
  const { call, db } = setup();
  const row = (member: string, code: string) => ({ id: crypto.randomUUID(), org_id: ORG, member_id: member, user_id: null, kind: 'track', ref_code: 'general', title: { en: 'General' }, holder_name: 'X', lessons: 8, score: 80, code, issued_at: '2026-11-01T00:00:00.000Z', revoked_at: null });
  db.rows('company_training_certificates').push(row(M.employee, 'AAAAAAAAAA'), row(M.other, 'BBBBBBBBBB'), row(M.hr, 'CCCCCCCCCC'));
  const hr = await call('GET', `orgs/${ORG}/certificates`, { user: HR });
  assertEquals(hr.body.certificates.map((entry: { code: string }) => entry.code).sort(), ['AAAAAAAAAA', 'CCCCCCCCCC']);
  assertEquals(hr.body.hidden, 1);
  const manager = await call('GET', `orgs/${ORG}/certificates`, { user: MANAGER });
  assertEquals(manager.body.certificates.map((entry: { code: string }) => entry.code), ['AAAAAAAAAA']);
  assertEquals((await call('GET', `orgs/${ORG}/certificates`, { user: EMPLOYEE })).status, 403);
});

Deno.test('the public certificate check is rate limited per address', async () => {
  const { call, db } = setup();
  let hits = 0;
  db.rpcs.company_training_hit = () => ++hits <= 2;
  assertEquals((await call('GET', 'public/c/ABCDEFGHJK')).status, 404);
  assertEquals((await call('GET', 'public/c/ABCDEFGHJK')).status, 404);
  const blocked = await call('GET', 'public/c/ABCDEFGHJK');
  assertEquals([blocked.status, blocked.body.code], [429, 'too_many_requests']);
});

Deno.test('training/due lists a member\'s open work with dates, most urgent first', async () => {
  const now = () => new Date('2026-11-10T08:00:00.000Z');
  const { call, db } = setup({ now });
  const lesson = await publishedLesson(call);
  const course = await publishedCourse(call, [lesson.id]);
  const assignment = (row: Record<string, unknown>) => db.rows('company_assignments').push({ id: crypto.randomUUID(), org_id: ORG, track_code: null, target_level: null, due_date: null, department_id: null, member_id: null, note: null, status: 'active', created_at: '2026-10-01T00:00:00.000Z', ...row });
  assignment({ track_code: 'hospitality', due_date: '2026-11-01', department_id: FRONT });
  assignment({ track_code: course.code, due_date: '2026-11-14', member_id: M.employee });
  assignment({ track_code: 'sales', due_date: '2026-11-02', department_id: SALES });
  assignment({ target_level: 'a1', due_date: '2026-11-03' }); // Already met by this level.
  assignment({ track_code: 'general', status: 'done', due_date: '2026-11-01', member_id: M.employee });

  const due = await call('GET', `orgs/${ORG}/training/due`, { user: EMPLOYEE });
  assertEquals(due.status, 200);
  assertEquals(due.body.items.map((item: { due_date: string }) => item.due_date), ['2026-11-01', '2026-11-14']);
  assertEquals([due.body.overdue, due.body.due_soon], [1, 1]);
  assertEquals([due.body.items[0].overdue, due.body.items[0].days_left], [true, -9]);
  assertEquals([due.body.items[1].overdue, due.body.items[1].due_soon, due.body.items[1].days_left], [false, true, 4]);
  assertEquals(due.body.items[1].href, `/w/${ORG}/learn?track=${course.code}`);

  // Finished work drops off the list.
  await call('POST', `orgs/${ORG}/learn/${lesson.code}/check`, { user: EMPLOYEE, body: { answers: right } });
  assertEquals((await call('GET', `orgs/${ORG}/training/due`, { user: EMPLOYEE })).body.items.length, 1);

  // A dated path of their own joins in.
  await call('POST', `orgs/${ORG}/paths`, { user: HR, body: { member_id: M.employee, steps: [{ kind: 'track', code: 'sales' }], due_date: '2026-12-01' } });
  const withPath = await call('GET', `orgs/${ORG}/training/due`, { user: EMPLOYEE });
  assertEquals(withPath.body.items.map((item: { kind: string }) => item.kind), ['assignment', 'path']);
});

Deno.test('a company course is assigned like a track and counted in the plan', async () => {
  const { call } = setup();
  const lesson = await publishedLesson(call);
  const course = await publishedCourse(call, [lesson.id]);
  assertEquals((await call('POST', `orgs/${ORG}/assignments`, { user: HR, body: { scope: 'all', track_code: `c-${crypto.randomUUID()}` } })).status, 400);
  const created = await call('POST', `orgs/${ORG}/assignments`, { user: HR, body: { scope: 'departments', department_ids: [FRONT], track_code: course.code, due_date: '2030-01-01' } });
  assertEquals(created.status, 200);
  await call('POST', `orgs/${ORG}/learn/${lesson.code}/check`, { user: EMPLOYEE, body: { answers: right } });
  const plan = await call('GET', `orgs/${ORG}/assignments`, { user: HR });
  assertEquals(plan.body.courses.map((entry: { code: string }) => entry.code), [course.code]);
  const row = plan.body.assignments[0];
  assertEquals([row.track_title.en, row.track_lessons, row.is_course, row.stats.people, row.stats.done, row.stats.unfinished], ['Welcome to Silk Road', 1, true, 2, 1, 1]);
  const home = await call('GET', `orgs/${ORG}/my/home`, { user: MANAGER });
  assertEquals(home.status, 200);
  assertEquals(home.body.assignments[0].next.code, lesson.code);
  assertEquals(home.body.assignments[0].next.track_code, course.code);
});

Deno.test('bulk re-assign extends dates or hands unfinished people a personal assignment, once', async () => {
  const now = () => new Date('2026-11-10T08:00:00.000Z');
  const { call, db } = setup({ now });
  const track = findTrack('hospitality')!;
  const group = crypto.randomUUID(), personal = crypto.randomUUID(), foreign = crypto.randomUUID();
  const base = { org_id: ORG, target_level: null, note: null, status: 'active', created_at: '2026-10-01T00:00:00.000Z', due_date: '2026-11-01' };
  db.rows('company_assignments').push(
    { ...base, id: group, track_code: 'hospitality', department_id: FRONT, member_id: null },
    { ...base, id: personal, track_code: 'general', department_id: null, member_id: M.other },
    { ...base, id: foreign, org_id: ELSEWHERE, track_code: 'general', department_id: null, member_id: null },
  );
  // The manager finished; the employee has not.
  for (const lesson of track.lessons) db.rows('company_lesson_progress').push({ id: crypto.randomUUID(), org_id: ORG, member_id: M.manager, user_id: MANAGER, track_code: track.code, lesson_code: lesson.code, status: 'completed', score: 90, minutes: 5, attempts: 1, data: {} });

  const body = { mode: 'unfinished', assignment_ids: [group, personal], due_date: '2026-12-01' };
  assertEquals((await call('POST', `orgs/${ORG}/assignments/reassign`, { user: MANAGER, body })).status, 403);
  assertEquals((await call('POST', `orgs/${ORG}/assignments/reassign`, { user: HR, body: { ...body, assignment_ids: [foreign] } })).status, 404);
  assertEquals((await call('POST', `orgs/${ORG}/assignments/reassign`, { user: HR, body: { ...body, due_date: '2026-11-01' } })).status, 400);
  assertEquals((await call('POST', `orgs/${ORG}/assignments/reassign`, { user: HR, body: { ...body, due_date: '2026-02-31' } })).status, 400);

  const result = await call('POST', `orgs/${ORG}/assignments/reassign`, { user: HR, body });
  assertEquals([result.status, result.body.created, result.body.extended, result.body.skipped], [200, 1, 1, 0]);
  const rows = db.rows('company_assignments');
  assertEquals(rows.find((row) => row.id === group)!.status, 'done');
  assertEquals(rows.find((row) => row.id === personal)!.due_date, '2026-12-01');
  const fresh = rows.filter((row) => row.member_id === M.employee);
  assertEquals([fresh.length, fresh[0].track_code, fresh[0].due_date], [1, 'hospitality', '2026-12-01']);
  // A double click does nothing more.
  const again = await call('POST', `orgs/${ORG}/assignments/reassign`, { user: HR, body: { ...body, assignment_ids: [group] } });
  assertEquals([again.body.created, again.body.skipped], [0, 1]);

  const extend = await call('POST', `orgs/${ORG}/assignments/reassign`, { user: HR, body: { mode: 'extend', assignment_ids: [group], due_date: '2026-12-15' } });
  assertEquals(extend.body.extended, 1);
  assertEquals([rows.find((row) => row.id === group)!.due_date, rows.find((row) => row.id === group)!.status], ['2026-12-15', 'active']);
});

Deno.test('bulk re-assign never reveals who finished among people who do not share', async () => {
  const { call, db } = setup({ now: () => new Date('2026-11-10T08:00:00.000Z') });
  const track = findTrack('sales')!;
  const group = crypto.randomUUID();
  db.rows('company_assignments').push({ id: group, org_id: ORG, track_code: 'sales', target_level: null, note: null, status: 'active', created_at: '2026-10-01T00:00:00.000Z', due_date: '2026-11-01', department_id: SALES, member_id: null });
  for (const lesson of track.lessons) db.rows('company_lesson_progress').push({ id: crypto.randomUUID(), org_id: ORG, member_id: M.other, user_id: OTHER, track_code: 'sales', lesson_code: lesson.code, status: 'completed', score: 90, minutes: 5, attempts: 1, data: {} });
  const result = await call('POST', `orgs/${ORG}/assignments/reassign`, { user: HR, body: { mode: 'unfinished', assignment_ids: [group], due_date: '2026-12-01' } });
  assertEquals(result.body.created, 1);
});

Deno.test('my home shows the path, company courses and certificates', async () => {
  const { call } = setup();
  const lesson = await publishedLesson(call);
  const course = await publishedCourse(call, [lesson.id]);
  const before = await call('GET', `orgs/${ORG}/my/home`, { user: EMPLOYEE });
  assertEquals(before.status, 200);
  assertEquals(before.body.path.source, 'suggested');
  assertEquals(before.body.courses.map((entry: { code: string; completed: number }) => [entry.code, entry.completed]), [[course.code, 0]]);
  await call('POST', `orgs/${ORG}/learn/${lesson.code}/start`, { user: EMPLOYEE, body: { step: 'words' } });
  const resuming = await call('GET', `orgs/${ORG}/my/home`, { user: EMPLOYEE });
  assertEquals([resuming.body.resuming, resuming.body.continue.code, resuming.body.continue.track_code], [true, lesson.code, course.code]);
  await call('POST', `orgs/${ORG}/learn/${lesson.code}/check`, { user: EMPLOYEE, body: { answers: right } });
  const after = await call('GET', `orgs/${ORG}/my/home`, { user: EMPLOYEE });
  assertEquals(after.body.training_certificates.length, 1);
  assertEquals(after.body.courses[0].completed, 1);
});

Deno.test('a replay earns only for what is said anew, and finishing twice logs once', async () => {
  const ai: AiCall = <T>(request: { userPayload: string }, _fallback: T) => {
    const payload = JSON.parse(request.userPayload);
    if (payload.transcript) return Promise.resolve({ status: 'ok' as const, data: { score: 60, summary: 'ok', goal_met: false, good_phrases: [], better_phrases: [], checklist: [], next_step: '' } as unknown as T });
    return Promise.resolve({ status: 'ok' as const, data: { reply: 'Go on.', done: false, tip: '' } as unknown as T });
  };
  const { call, db, aiCalls } = setup({ ai });
  const started = await call('POST', `orgs/${ORG}/roleplay`, { user: EMPLOYEE, body: { scenario: TRACKS[0].scenarios[0].code } });
  const id = started.body.session.id;
  await call('POST', `orgs/${ORG}/roleplay/${id}/turn`, { user: EMPLOYEE, body: { text: 'One.' } });
  await call('POST', `orgs/${ORG}/roleplay/${id}/turn`, { user: EMPLOYEE, body: { text: 'Two.' } });
  await Promise.all([call('POST', `orgs/${ORG}/roleplay/${id}/finish`, { user: EMPLOYEE, body: {} }), call('POST', `orgs/${ORG}/roleplay/${id}/finish`, { user: EMPLOYEE, body: {} })]);
  const logged = () => db.rows('company_activity').filter((row) => row.kind === 'roleplay');
  assertEquals(logged().length, 1);
  assertEquals(logged()[0].points, 9);

  const replay = await call('POST', `orgs/${ORG}/roleplay/${id}/replay`, { user: EMPLOYEE, body: { turn: 3 } });
  const again = replay.body.session.id;
  assertEquals(replay.body.session.learner_turns, 1);
  // Finishing without saying anything new: no points, no feedback call.
  const before = aiCalls();
  const empty = await call('POST', `orgs/${ORG}/roleplay/${again}/finish`, { user: EMPLOYEE, body: {} });
  assertEquals(empty.body.status, 'no_turns');
  assertEquals(aiCalls(), before);
  assertEquals(logged().length, 1);

  const third = await call('POST', `orgs/${ORG}/roleplay/${id}/replay`, { user: EMPLOYEE, body: { turn: 3 } });
  await call('POST', `orgs/${ORG}/roleplay/${third.body.session.id}/turn`, { user: EMPLOYEE, body: { text: 'Better.' } });
  await call('POST', `orgs/${ORG}/roleplay/${third.body.session.id}/finish`, { user: EMPLOYEE, body: {} });
  assertEquals(logged().length, 2);
  assertEquals(logged()[1].points, 7);
});

Deno.test('a path date cannot be set in the past, and a removed person gets no path', async () => {
  const { call, db } = setup({ now: () => new Date('2026-11-10T08:00:00.000Z') });
  const steps = [{ kind: 'track', code: 'sales' }];
  assertEquals((await call('POST', `orgs/${ORG}/paths`, { user: HR, body: { member_id: M.employee, steps, due_date: '2026-11-01' } })).status, 400);
  const saved = await call('POST', `orgs/${ORG}/paths`, { user: HR, body: { member_id: M.employee, steps, due_date: '2026-12-01' } });
  assertEquals(saved.status, 200);
  (db.rows('company_learning_paths')[0] as { due_date: string }).due_date = '2026-11-01';
  // Already on the path and now past: changing the steps does not need a new date.
  assertEquals((await call('POST', `orgs/${ORG}/paths`, { user: HR, body: { member_id: M.employee, steps: [{ kind: 'track', code: 'general' }], due_date: '2026-11-01' } })).status, 200);
  db.rows('company_members').find((row) => row.id === M.other)!.status = 'removed';
  assertEquals((await call('POST', `orgs/${ORG}/paths`, { user: HR, body: { member_id: M.other, steps } })).status, 404);
});

Deno.test('a built-in lesson becomes an editable draft, and a lesson can be copied', async () => {
  const { call, db } = setup();
  const code = TRACKS[0].lessons[0].code;
  assertEquals((await call('POST', `orgs/${ORG}/builder/lessons/from-track`, { user: EMPLOYEE, body: { lesson_code: code } })).status, 403);
  assertEquals((await call('POST', `orgs/${ORG}/builder/lessons/from-track`, { user: HR, body: { lesson_code: 'nope' } })).status, 404);
  const made = await call('POST', `orgs/${ORG}/builder/lessons/from-track`, { user: HR, body: { lesson_code: code } });
  assertEquals(made.status, 200);
  const detail = await call('GET', `orgs/${ORG}/builder/lessons/${made.body.id}`, { user: HR });
  assertEquals([detail.body.lesson.status, detail.body.lesson.draft.title.en, detail.body.problems], ['draft', TRACKS[0].lessons[0].title.en, []]);
  // Publishing it works, and learners are untouched until then.
  assertEquals((await call('POST', `orgs/${ORG}/builder/lessons/${made.body.id}/publish`, { user: HR, body: {} })).status, 200);

  const copy = await call('POST', `orgs/${ORG}/builder/lessons/${made.body.id}/duplicate`, { user: HR });
  const copied = await call('GET', `orgs/${ORG}/builder/lessons/${copy.body.id}`, { user: HR });
  assertEquals([copied.body.lesson.status, copied.body.lesson.version], ['draft', 0]);
  assert(copied.body.lesson.draft.title.en.endsWith('(copy)'));
  // A copy of an AI draft still needs approval.
  const ai = crypto.randomUUID();
  db.rows('company_lessons').push({ id: ai, org_id: ORG, title: { en: 'AI' }, level: 'b1', draft: content('AI'), published: null, status: 'draft', revision: 1, published_version: 0, published_revision: 0, source: 'ai', approved_at: null });
  const aiCopy = await call('POST', `orgs/${ORG}/builder/lessons/${ai}/duplicate`, { user: HR });
  assertEquals((await call('GET', `orgs/${ORG}/builder/lessons/${aiCopy.body.id}`, { user: HR })).body.lesson.needs_approval, true);
  assertEquals((await call('POST', `orgs/${ORG}/builder/lessons/${crypto.randomUUID()}/duplicate`, { user: HR })).status, 404);
});

Deno.test('translations fill blanks only, HR wording stays, and a failure changes nothing', async () => {
  const lesson = content('Pool');
  lesson.phrases = [{ en: 'One', ru: 'Своё', uz: '' }, { en: 'Two', ru: '', uz: '' }, { en: '', ru: '', uz: '' }];
  assertEquals(missingTranslations(lesson).map((entry) => entry.key), ['title', 'phrases.0', 'phrases.1']);
  const { lesson: next, filled } = applyTranslations(lesson, [
    { key: 'phrases.0', ru: 'Чужое', uz: 'Bir' }, { key: 'phrases.1', ru: 'Два', uz: 'Ikki' }, { key: 'words.99', ru: 'x', uz: 'y' }, { key: 'constructor', ru: 'x' }, null,
  ]);
  assertEquals(filled, 2);
  assertEquals(next.phrases[0], { en: 'One', ru: 'Своё', uz: 'Bir' });
  assertEquals(next.phrases[1], { en: 'Two', ru: 'Два', uz: 'Ikki' });
  assertEquals(lesson.phrases[1].ru, '', 'the original is not changed');

  let reply: 'ok' | 'failed' = 'failed';
  const ai: AiCall = <T>(request: { userPayload: string }, fallback: T) => {
    if (reply === 'failed') return Promise.resolve({ data: fallback, status: 'failed' as const, error: 'down' });
    const items = JSON.parse(request.userPayload).items as { key: string }[];
    return Promise.resolve({ status: 'ok' as const, data: { items: items.map((item) => ({ key: item.key, ru: 'Рус', uz: 'Oz' })) } as unknown as T });
  };
  const { call, db } = setup({ ai });
  const created = await call('POST', `orgs/${ORG}/builder/lessons`, { user: HR, body: { title: 'Pool' } });
  const id = created.body.lesson.id;
  const failed = await call('POST', `orgs/${ORG}/builder/lessons/${id}/translate`, { user: HR, body: { revision: 1 } });
  assertEquals(failed.body.status, 'ai_unavailable');
  assertEquals(db.rows('company_lessons')[0].revision, 1);
  reply = 'ok';
  assertEquals((await call('POST', `orgs/${ORG}/builder/lessons/${id}/translate`, { user: HR, body: { revision: 9 } })).body.code, 'builder_conflict');
  const done = await call('POST', `orgs/${ORG}/builder/lessons/${id}/translate`, { user: HR, body: { revision: 1 } });
  assertEquals([done.body.status, done.body.filled, done.body.remaining, done.body.revision, done.body.draft.title.ru], ['ok', 1, 0, 2, 'Рус']);
  assertEquals((await call('POST', `orgs/${ORG}/builder/lessons/${id}/translate`, { user: EMPLOYEE, body: {} })).status, 403);
});

Deno.test('a role-play can be drafted with AI and stays a draft', async () => {
  const good = { title: { en: 'A complaint', ru: 'Жалоба', uz: 'Shikoyat' }, goal: { en: 'Solve it', ru: 'Решить', uz: 'Hal qilish' }, persona: 'Angry guest', learner_role: 'Clerk', setting: 'Reception', opening: 'Why?', difficulty: 'hard', checklist: ['Apologises', 'Explains', 'x'.repeat(500)] };
  let data: unknown = good;
  const ai: AiCall = <T>() => Promise.resolve({ status: 'ok' as const, data: data as T });
  const { call, db } = setup({ ai });
  assertEquals((await call('POST', `orgs/${ORG}/builder/scenarios/draft`, { user: HR, body: { source: 'short' } })).status, 400);
  const made = await call('POST', `orgs/${ORG}/builder/scenarios/draft`, { user: HR, body: { source: SOURCE } });
  assertEquals(made.body.status, 'ok');
  const row = db.rows('company_scenarios')[0] as { status: string; difficulty: string; checklist: string[] };
  assertEquals([row.status, row.difficulty, row.checklist[2].length], ['draft', 'hard', 200]);
  assertEquals((await call('POST', `orgs/${ORG}/roleplay`, { user: EMPLOYEE, body: { scenario: made.body.code } })).status, 404);
  data = { title: { en: 'No persona' } };
  assertEquals((await call('POST', `orgs/${ORG}/builder/scenarios/draft`, { user: HR, body: { source: SOURCE } })).body.status, 'ai_unavailable');
  assertEquals(db.rows('company_scenarios').length, 1);
  assertEquals((await call('POST', `orgs/${ORG}/builder/scenarios/draft`, { user: MANAGER, body: { source: SOURCE } })).status, 403);
});

Deno.test('lesson and course results count only people who share', async () => {
  const { call, db } = setup();
  const lesson = await publishedLesson(call);
  const course = await publishedCourse(call, [lesson.id]);
  assertEquals((await call('GET', `orgs/${ORG}/builder/lessons/${lesson.id}/results`, { user: HR })).body.started, 0);
  await call('POST', `orgs/${ORG}/learn/${lesson.code}/check`, { user: EMPLOYEE, body: { answers: { e1: [0], e2: ['wrong'] } } });
  // The manager shares too, and has it right. The other person has not agreed to share and must not count.
  await call('POST', `orgs/${ORG}/learn/${lesson.code}/check`, { user: MANAGER, body: { answers: right } });
  await call('POST', `orgs/${ORG}/learn/${lesson.code}/check`, { user: OTHER, body: { answers: {} } });
  const results = await call('GET', `orgs/${ORG}/builder/lessons/${lesson.id}/results`, { user: HR });
  // Only the manager passed: scoring 50% starts the lesson but does not finish it.
  assertEquals([results.status, results.body.started, results.body.completed, results.body.average_score], [200, 2, 1, 75]);
  assertEquals(results.body.exercises.map((exercise: { id: string; percent: number }) => [exercise.id, exercise.percent]), [['e2', 50], ['e1', 100]]);
  const funnel = await call('GET', `orgs/${ORG}/builder/courses/${course.id}/results`, { user: HR });
  assertEquals([funnel.body.people_started, funnel.body.people_finished, funnel.body.lessons[0].started], [2, 1, 2]);
  assertEquals((await call('GET', `orgs/${ORG}/builder/lessons/${lesson.id}/results`, { user: MANAGER })).status, 403);
  assertEquals((await call('GET', `orgs/${ORG}/builder/courses/${crypto.randomUUID()}/results`, { user: HR })).status, 404);
  assert(db.rows('company_lesson_progress').some((row) => row.member_id === M.other), 'the other person did try');
});

Deno.test('CSV cells cannot run as formulas', () => {
  assertEquals(csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
  assertEquals(csvCell('+998901234567'), "'+998901234567");
  assertEquals(csvCell('-1'), "'-1");
  assertEquals(csvCell('@me'), "'@me");
  assertEquals(csvCell('a, b'), '"a, b"');
  assertEquals(csvCell(null), '');
  assertEquals(csvCell(5), '5');
  assert(toCsv([['Имя'], ['=1']]).startsWith('\uFEFFИмя\r\n\'=1'));
});
