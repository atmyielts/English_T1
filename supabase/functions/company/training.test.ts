import { assert, assertEquals } from 'jsr:@std/assert@1';
import { ACTIVITY_KINDS, JOB_ROLES } from '../../../packages/company-core/src/mod.ts';
import { insightsEn } from '../../../apps/company/src/i18n/insights.en.ts';
import { insightsRu } from '../../../apps/company/src/i18n/insights.ru.ts';
import { insightsUz } from '../../../apps/company/src/i18n/insights.uz.ts';
import { peopleEn } from '../../../apps/company/src/i18n/people.en.ts';
import { routes as core } from './core.ts';
import { routes as training } from './training.ts';
import { validateTrack, normalizeAnswer, type Exercise } from './training/content.ts';
import { checkExercise, publicExercise, seededShuffle } from './training/lessons.ts';
import { parseCsv } from './training/glossary.ts';
import { DAILY_SELF_REPORTED_MINUTES, weekStart } from './training/shared.ts';
import { tashkentDate } from '../../../apps/company/src/areas/training/dates.ts';
import { findLesson, TRACKS } from './training/tracks/index.ts';
import { FakeDb, testHandler } from './testing.ts';
import type { AiCall } from './types.ts';

const ORG = '7a0f5c1e-0000-4000-8000-00000000c0de';
const HR = '00000000-0000-4000-8000-0000000000c1';
const EMPLOYEE = '00000000-0000-4000-8000-0000000000c2';
const MANAGER = '00000000-0000-4000-8000-0000000000c3';
const OTHER = '00000000-0000-4000-8000-0000000000c4';
const FRONT = '00000000-0000-4000-8000-0000000000d1';
const SALES = '00000000-0000-4000-8000-0000000000d2';
const M = { hr: '00000000-0000-4000-8000-0000000000e1', employee: '00000000-0000-4000-8000-0000000000e2', manager: '00000000-0000-4000-8000-0000000000e3', other: '00000000-0000-4000-8000-0000000000e4' };

function setup(options: { ai?: AiCall; aiAllowed?: () => boolean; now?: () => Date } = {}) {
  const consent = '2026-10-01T00:00:00.000Z';
  const member = (id: string, user: string, role: string, extra: Record<string, unknown> = {}) => ({
    id, org_id: ORG, user_id: user, email: `${role}@hotel.example`, full_name: role, role, department_id: null, job_role: 'general', status: 'active', seat: false,
    level: null, level_score: null, level_source: null, level_at: null, target_level: null, target_date: null, consent_at: consent, joined_at: consent, ...extra,
  });
  const db = new FakeDb({
    users: [HR, EMPLOYEE, MANAGER, OTHER].map((id) => ({ id, role: 'user' })),
    company_orgs: [{ id: ORG, name: 'Silk Road Hotels', industry: 'hospitality', size_band: '51-200', status: 'active', seats_limit: 10, tests_limit: 50, tests_used: 0, settings: { locale: 'ru' }, created_at: consent }],
    company_departments: [{ id: FRONT, org_id: ORG, name: 'Front office' }, { id: SALES, org_id: ORG, name: 'Sales' }],
    company_members: [
      member(M.hr, HR, 'admin'),
      member(M.employee, EMPLOYEE, 'employee', { department_id: FRONT, job_role: 'hospitality', seat: true, level: 'a2', target_level: 'b1' }),
      member(M.manager, MANAGER, 'manager', { department_id: FRONT, job_role: 'hospitality', level: 'b2' }),
      member(M.other, OTHER, 'employee', { department_id: SALES, job_role: 'sales', consent_at: null, level: 'b1' }),
    ],
  });
  let aiCalls = 0;
  db.rpcs.company_consume_ai = () => { aiCalls++; return options.aiAllowed ? options.aiAllowed() : true; };
  const call = testHandler(db, [...core, ...training], { ai: options.ai, now: options.now });
  return { db, call, aiCalls: () => aiCalls };
}

/** Answers every exercise of a lesson correctly, from the server-side content. */
function correctAnswers(code: string): Record<string, unknown> {
  const { lesson } = findLesson(code)!;
  return Object.fromEntries(lesson.exercises.map((exercise: Exercise) => {
    switch (exercise.kind) {
      case 'choice': return [exercise.id, exercise.items.map((item) => item.answer)];
      case 'gap': return [exercise.id, exercise.items.map((item) => item.answers[0].toUpperCase() + '.')];
      case 'order': return [exercise.id, exercise.lines];
      case 'match': return [exercise.id, exercise.pairs.map((pair) => pair[1])];
    }
  }));
}

Deno.test('every job role has a valid track of at least 8 lessons in two stages', () => {
  assertEquals(TRACKS.map((track) => track.code), [...JOB_ROLES]);
  const codes = new Set<string>(), scenarios = new Set<string>(), templates = new Set<string>();
  for (const track of TRACKS) {
    assertEquals(validateTrack(track), [], track.code);
    assert(track.lessons.length >= 8, track.code);
    assert(track.scenarios.length >= 3 && track.templates.length >= 3, track.code);
    for (const lesson of track.lessons) { assert(!codes.has(lesson.code), lesson.code); codes.add(lesson.code); }
    for (const scenario of track.scenarios) { assert(!scenarios.has(scenario.code), scenario.code); scenarios.add(scenario.code); }
    for (const template of track.templates) { assert(!templates.has(template.code), template.code); templates.add(template.code); }
  }
  assert(codes.size >= 88);
});

Deno.test('the validator catches broken content', () => {
  const broken = structuredClone(TRACKS[0]);
  broken.lessons[0].phrases = broken.lessons[0].phrases.slice(0, 3);
  broken.lessons[1].phrases[0].uz = "o'qituvchi";
  broken.lessons[2].exercises[0] = { id: 'e1', kind: 'choice', items: [{ q: 'x', options: ['a', 'b'], answer: 5 }] };
  broken.lessons[3].mission = { kind: 'roleplay', scenario: 'nope', brief: { en: 'x', ru: 'х', uz: 'x' } };
  const errors = validateTrack(broken).join('\n');
  for (const expected of ['phrases: 8–12', 'U+2018', 'answer: out of range', 'unknown scenario']) assert(errors.includes(expected), expected);
});

Deno.test('exercises reach the learner without answer keys and are checked on the server', () => {
  const order: Exercise = { id: 'e3', kind: 'order', lines: ['Hello.', 'Hi, how can I help?', 'I have a booking.', 'May I see your passport?'] };
  const shown = publicExercise(order, 'x-f1') as { lines: string[] };
  assert(shown.lines.join() !== order.lines.join());
  assertEquals(seededShuffle(order.lines, 'x-f1:e3'), shown.lines);
  assertEquals(checkExercise(order, order.lines).correct, 4);
  assertEquals(checkExercise(order, shown.lines).correct < 4, true);
  const gap: Exercise = { id: 'e2', kind: 'gap', items: [{ text: 'I ___ like a room.', answers: ['would', "'d"] }] , bank: ['would', 'will'] };
  assertEquals(checkExercise(gap, ['  WOULD. ']).correct, 1);
  assertEquals(checkExercise(gap, ['will']).correct, 0);
  assertEquals(checkExercise(gap, 'nonsense').correct, 0);
  assertEquals(normalizeAnswer('It’s  fine!'), "it's fine");
  for (const track of TRACKS) for (const lesson of track.lessons) {
    const json = JSON.stringify(lesson.exercises.map((exercise) => publicExercise(exercise, lesson.code)));
    assert(!json.includes('"answer') && !json.includes('"pairs"'), lesson.code);
  }
});

Deno.test('tracks list, lesson view and progress through the lesson player', async () => {
  const { db, call } = setup();
  const list = await call('GET', `orgs/${ORG}/tracks`, { user: EMPLOYEE });
  assertEquals(list.status, 200);
  assertEquals(list.body.recommended, 'hospitality');
  assertEquals(list.body.tracks.length, 11);
  const track = await call('GET', `orgs/${ORG}/tracks/hospitality`, { user: EMPLOYEE });
  assertEquals(track.body.lessons[0].status, 'new');
  assertEquals((await call('GET', `orgs/${ORG}/tracks/astronaut`, { user: EMPLOYEE })).status, 404);

  const code = track.body.lessons[0].code;
  const view = await call('GET', `orgs/${ORG}/learn/${code}`, { user: EMPLOYEE });
  assertEquals(view.status, 200);
  assert(!JSON.stringify(view.body.lesson.exercises).includes('"answer'));
  assert(view.body.lesson.mission.title.en);
  assertEquals((await call('POST', `orgs/${ORG}/learn/${code}/start`, { user: EMPLOYEE, body: { step: 'dialogue' } })).body.step, 'dialogue');

  const wrong = await call('POST', `orgs/${ORG}/learn/${code}/check`, { user: EMPLOYEE, body: { answers: {}, minutes: 9 } });
  assertEquals([wrong.body.score, wrong.body.passed, wrong.body.status], [0, false, 'started']);
  const right = await call('POST', `orgs/${ORG}/learn/${code}/check`, { user: EMPLOYEE, body: { answers: correctAnswers(code), minutes: 500 } });
  assertEquals([right.body.score, right.body.passed, right.body.first_completion, right.body.status], [100, true, true, 'completed']);
  const again = await call('POST', `orgs/${ORG}/learn/${code}/check`, { user: EMPLOYEE, body: { answers: {}, minutes: 3 } });
  assertEquals([again.body.status, again.body.best, again.body.first_completion], ['completed', 100, false]);

  const progress = db.rows('company_lesson_progress');
  assertEquals(progress.length, 1);
  assertEquals([progress[0].status, progress[0].score, progress[0].attempts, progress[0].minutes], ['completed', 100, 3, 9 + 60 + 3]);
  const lessons = db.rows('company_activity').filter((row) => row.kind === 'lesson');
  assertEquals(lessons.map((row) => [row.minutes, row.points]), [[60, 20]]);
  assertEquals(db.rows('company_activity').filter((row) => row.kind === 'lesson_retry').map((row) => [row.minutes, row.points]), [[9, 0], [3, 0]]);
  assertEquals((await call('GET', `orgs/${ORG}/tracks/hospitality`, { user: EMPLOYEE })).body.lessons[0].status, 'completed');
  assertEquals((await call('POST', `orgs/${ORG}/learn/nope-f1/check`, { user: EMPLOYEE, body: { answers: {} } })).status, 404);
});

Deno.test('My English shows level gap, assignments, continue, this week and certificates', async () => {
  const { db, call } = setup();
  db.rows('company_assignments').push(
    { id: crypto.randomUUID(), org_id: ORG, track_code: 'hospitality', target_level: 'b1', due_date: '2020-01-01', department_id: FRONT, member_id: null, note: 'Before the season', status: 'active', created_at: '2026-10-01' },
    { id: crypto.randomUUID(), org_id: ORG, track_code: 'sales', target_level: null, due_date: null, department_id: SALES, member_id: null, note: null, status: 'active', created_at: '2026-10-01' },
  );
  const assessment = crypto.randomUUID();
  db.rows('company_assessments').push({ id: assessment, org_id: ORG, kind: 'placement', title: 'Autumn placement' });
  db.rows('company_attempts').push({ id: crypto.randomUUID(), org_id: ORG, assessment_id: assessment, member_id: M.employee, status: 'graded', overall_level: 'a2', graded_at: '2026-10-10T10:00:00Z', certificate_code: 'ABCD234567' });
  await call('POST', `orgs/${ORG}/learn/hospitality-f2/start`, { user: EMPLOYEE, body: { step: 'words' } });
  await call('POST', `orgs/${ORG}/learn/hospitality-f1/check`, { user: EMPLOYEE, body: { answers: correctAnswers('hospitality-f1'), minutes: 12 } });

  const home = await call('GET', `orgs/${ORG}/my/home`, { user: EMPLOYEE });
  assertEquals(home.status, 200);
  assertEquals([home.body.member.level, home.body.member.target_level, home.body.member.gap], ['a2', 'b1', 1]);
  assertEquals(home.body.english_url, 'https://english.schood.online');
  assertEquals(home.body.assignments.length, 1);
  assertEquals([home.body.assignments[0].lessons_done, home.body.assignments[0].overdue, home.body.assignments[0].meets_target], [1, true, false]);
  assertEquals([home.body.continue.code, home.body.continue.step, home.body.resuming], ['hospitality-f2', 'words', true]);
  assertEquals([home.body.week.minutes, home.body.week.lessons], [12, 1]);
  assertEquals(home.body.week.days.length, 7);
  assertEquals(home.body.certificates[0].title, 'Autumn placement');
  assertEquals((await call('GET', `orgs/${ORG}/my/home`, { user: OTHER })).body.english_url, null);
});

Deno.test('a Tashkent week starts on Monday at midnight local time', () => {
  // Sunday 23:30 in Tashkent is still the old week; Monday 00:30 starts the new one.
  assertEquals(weekStart(new Date('2026-11-01T18:30:00Z')).toISOString(), '2026-10-25T19:00:00.000Z');
  assertEquals(weekStart(new Date('2026-11-01T19:30:00Z')).toISOString(), '2026-11-01T19:00:00.000Z');
});

const roleplayAi = (fail: { turn?: boolean; feedback?: boolean } = {}): AiCall => <T>(request: { systemPrompt: string; userPayload: string }, fallback: T) => {
  const feedback = request.systemPrompt.includes('coach');
  if ((feedback && fail.feedback) || (!feedback && fail.turn)) return Promise.resolve({ data: fallback, status: 'failed' as const, error: 'timeout' });
  const data = feedback
    ? { score: 78, summary: 'Хорошо справились.', goal_met: true, good_phrases: ['I am sorry for the wait'], better_phrases: [{ said: 'wait please', better: 'Could you wait a moment, please?', why: 'Вежливее.' }], checklist: [{ item: 'Apologises', done: true }], next_step: 'Предложите время.' }
    : { reply: 'I see. When will it be ready?', done: false, tip: '' };
  return Promise.resolve({ data: data as T, status: 'ok' as const });
};

Deno.test('a role-play runs turn by turn, keeps work on AI failure and ends with feedback', async () => {
  let allowed = true, failTurn = false;
  const ai: AiCall = (request, fallback) => roleplayAi({ turn: failTurn })(request, fallback);
  const { db, call, aiCalls } = setup({ ai, aiAllowed: () => allowed });
  const list = await call('GET', `orgs/${ORG}/roleplay`, { user: EMPLOYEE });
  assertEquals(list.body.tracks.length, 11);
  const scenario = list.body.tracks.find((track: { code: string }) => track.code === 'hospitality').scenarios[0].code;
  const started = await call('POST', `orgs/${ORG}/roleplay`, { user: EMPLOYEE, body: { scenario, locale: 'ru' } });
  const id = started.body.session.id;
  assertEquals(started.body.session.turns.length, 1);
  assertEquals(aiCalls(), 0);

  const turn = await call('POST', `orgs/${ORG}/roleplay/${id}/turn`, { user: EMPLOYEE, body: { text: 'I am sorry for the wait, sir.', mode: 'voice' } });
  assertEquals([turn.body.status, turn.body.session.turns.length, turn.body.session.learner_turns], ['ok', 3, 1]);
  assertEquals(turn.body.session.turns[1].mode, 'voice');

  failTurn = true;
  const failed = await call('POST', `orgs/${ORG}/roleplay/${id}/turn`, { user: EMPLOYEE, body: { text: 'Your room will be ready at two.' } });
  assertEquals([failed.body.status, failed.body.session.turns.length], ['ai_unavailable', 3]);
  failTurn = false;
  allowed = false;
  assertEquals((await call('POST', `orgs/${ORG}/roleplay/${id}/turn`, { user: EMPLOYEE, body: { text: 'Hello?' } })).body.status, 'ai_limit');
  allowed = true;
  assertEquals((await call('GET', `orgs/${ORG}/roleplay/${id}`, { user: MANAGER })).status, 404);

  const session = db.rows('company_roleplay_sessions')[0];
  session.learner_turns = 12;
  assertEquals((await call('POST', `orgs/${ORG}/roleplay/${id}/turn`, { user: EMPLOYEE, body: { text: 'One more.' } })).body.code, 'roleplay_turns_used');
  session.learner_turns = 1;

  const finished = await call('POST', `orgs/${ORG}/roleplay/${id}/finish`, { user: EMPLOYEE, body: { locale: 'ru' } });
  assertEquals([finished.body.status, finished.body.session.status, finished.body.session.score], ['ok', 'ended', 78]);
  assertEquals(finished.body.session.feedback.better_phrases[0].better, 'Could you wait a moment, please?');
  await call('POST', `orgs/${ORG}/roleplay/${id}/finish`, { user: EMPLOYEE });
  assertEquals(db.rows('company_activity').filter((row) => row.kind === 'roleplay').length, 1);
  assertEquals((await call('POST', `orgs/${ORG}/roleplay/${id}/turn`, { user: EMPLOYEE, body: { text: 'Hi' } })).body.code, 'roleplay_ended');
});

Deno.test('role-play feedback can be retried after the AI fails', async () => {
  let failFeedback = true;
  const ai: AiCall = (request, fallback) => roleplayAi({ feedback: failFeedback })(request, fallback);
  const { db, call } = setup({ ai });
  const started = await call('POST', `orgs/${ORG}/roleplay`, { user: EMPLOYEE, body: { scenario: 'hospitality-rp-phone-booking' } });
  const id = started.body.session.id;
  await call('POST', `orgs/${ORG}/roleplay/${id}/turn`, { user: EMPLOYEE, body: { text: 'Good afternoon, Old Gate Guesthouse.' } });
  const first = await call('POST', `orgs/${ORG}/roleplay/${id}/finish`, { user: EMPLOYEE });
  assertEquals([first.body.status, first.body.session.status, first.body.session.feedback], ['ai_unavailable', 'ended', null]);
  failFeedback = false;
  assertEquals((await call('POST', `orgs/${ORG}/roleplay/${id}/finish`, { user: EMPLOYEE })).body.session.score, 78);
  assertEquals(db.rows('company_activity').filter((row) => row.kind === 'roleplay').length, 1);
  const empty = await call('POST', `orgs/${ORG}/roleplay`, { user: EMPLOYEE, body: { scenario: 'hospitality-rp-phone-booking' } });
  assertEquals((await call('POST', `orgs/${ORG}/roleplay/${empty.body.session.id}/finish`, { user: EMPLOYEE })).body.status, 'no_turns');
  assertEquals((await call('POST', `orgs/${ORG}/roleplay`, { user: EMPLOYEE, body: { scenario: 'nope' } })).status, 404);
});

Deno.test('the writing checker corrects, stores for 90 days and keeps drafts on AI failure', async () => {
  let fail = false;
  const ai: AiCall = <T>(_request: unknown, fallback: T) => Promise.resolve(fail
    ? { data: fallback, status: 'failed' as const, error: 'down' }
    : { data: { corrected: 'Dear Mr Hoffmann,\n\nThank you for your message.', score: 64, summary: 'Хорошее начало.', tone: 'Вежливо.', tone_notes: ['Добавьте извинение.'], changes: [{ original: 'thank for', corrected: 'thank you for', why: 'Нужно you.' }], checklist: [] } as T, status: 'ok' as const });
  const now = new Date('2026-10-30T09:00:00Z');
  const { db, call } = setup({ ai, now: () => now });
  const page = await call('GET', `orgs/${ORG}/writing`, { user: EMPLOYEE });
  assertEquals(page.body.retention_days, 90);
  const template = page.body.tracks.find((track: { code: string }) => track.code === 'hospitality').templates[0].code;
  db.rows('company_writing_checks').push({ id: crypto.randomUUID(), org_id: ORG, member_id: M.employee, draft: 'old', result: {}, created_at: '2026-07-01T00:00:00Z' });

  assertEquals((await call('POST', `orgs/${ORG}/writing/check`, { user: EMPLOYEE, body: { text: 'too short' } })).status, 400);
  fail = true;
  const failed = await call('POST', `orgs/${ORG}/writing/check`, { user: EMPLOYEE, body: { text: 'Dear Mr Hoffmann, thank for your message about the room.', template } });
  assertEquals(failed.body.status, 'ai_unavailable');
  assertEquals(db.rows('company_writing_checks').length, 0);
  fail = false;
  const ok = await call('POST', `orgs/${ORG}/writing/check`, { user: EMPLOYEE, body: { text: 'Dear Mr Hoffmann, thank for your message about the room.', template, locale: 'ru' } });
  assertEquals([ok.body.status, ok.body.check.score, ok.body.check.result.changes.length], ['ok', 64, 1]);
  assertEquals(ok.body.check.result.checklist.length > 0, true);
  assertEquals(db.rows('company_activity').filter((row) => row.kind === 'writing').length, 1);
  const id = ok.body.check.id;
  assertEquals((await call('GET', `orgs/${ORG}/writing/${id}`, { user: OTHER })).status, 404);
  assertEquals((await call('GET', `orgs/${ORG}/writing`, { user: EMPLOYEE })).body.checks.length, 1);
  assertEquals((await call('DELETE', `orgs/${ORG}/writing/${id}`, { user: EMPLOYEE })).status, 200);
  assertEquals(db.rows('company_writing_checks').length, 0);
});

Deno.test('HR manages the glossary, imports CSV and employees practise it', async () => {
  const { db, call } = setup();
  const added = await call('POST', `orgs/${ORG}/glossary`, { user: HR, body: { term: 'Late check-out', meaning: 'Leaving the room after 12:00', ru: 'Поздний выезд', uz: 'Kech chiqish', department_id: FRONT } });
  assertEquals(added.status, 200);
  assertEquals((await call('POST', `orgs/${ORG}/glossary`, { user: HR, body: { term: ' late CHECK-OUT', meaning: 'x' } })).body.code, 'glossary_duplicate');
  assertEquals((await call('POST', `orgs/${ORG}/glossary`, { user: EMPLOYEE, body: { term: 'x', meaning: 'y' } })).status, 403);

  const csv = '﻿term;meaning;ru;uz;example;department\n"Rack rate";"The full price of a room, before discounts";Базовый тариф;Asosiy narx;"Our rack rate is 90 dollars; today it is 75.";\nLate check-out;Leaving after noon for a fee;Поздний выезд;Kech chiqish;;Front office\nNo-show;A guest who does not arrive;Неявка;Kelmaslik;;Kitchen\n;missing term;;;;\n';
  const imported = await call('POST', `orgs/${ORG}/glossary/import`, { user: HR, body: { csv } });
  assertEquals([imported.body.added, imported.body.updated], [1, 1]);
  assertEquals(imported.body.skipped, [{ line: 4, reason: 'department' }, { line: 5, reason: 'term' }]);
  assertEquals(db.rows('company_glossary_terms').find((row) => row.term === 'Rack rate')?.example, 'Our rack rate is 90 dollars; today it is 75.');

  db.rows('company_glossary_terms').push({ id: crypto.randomUUID(), org_id: ORG, term: 'Pipeline', meaning: 'Deals in progress', department_id: SALES });
  const employeeView = await call('GET', `orgs/${ORG}/glossary`, { user: EMPLOYEE });
  assertEquals(employeeView.body.terms.map((row: { term: string }) => row.term).sort(), ['Late check-out', 'Rack rate']);
  assertEquals(employeeView.body.can_manage, false);
  assertEquals((await call('GET', `orgs/${ORG}/glossary`, { user: HR })).body.terms.length, 3);

  const [first, second] = employeeView.body.terms;
  const quiz = await call('POST', `orgs/${ORG}/glossary/practice`, { user: EMPLOYEE, body: { mode: 'quiz', minutes: 4, answers: [{ term: first.id, choice: first.id }, { term: second.id, choice: first.id }, { term: 'forged', choice: 'forged' }] } });
  assertEquals([quiz.body.correct, quiz.body.total], [1, 2]);
  await call('POST', `orgs/${ORG}/glossary/practice`, { user: EMPLOYEE, body: { mode: 'cards', seen: 8, known: 5, minutes: 3 } });
  assertEquals(db.rows('company_activity').filter((row) => row.kind === 'glossary').map((row) => row.points), [2, 8]);

  const patched = await call('PATCH', `orgs/${ORG}/glossary/${first.id}`, { user: HR, body: { example: 'Late check-out costs 50% of the rate.' } });
  assertEquals(patched.body.term.example, 'Late check-out costs 50% of the rate.');
  assertEquals((await call('DELETE', `orgs/${ORG}/glossary/${first.id}`, { user: HR })).status, 200);
  assert(db.rows('company_audit').some((row) => row.action === 'glossary.imported'));
});

Deno.test('CSV parsing handles quotes, commas, tabs and Windows line ends', () => {
  assertEquals(parseCsv('a,b\r\n"x, y","say ""hi"""\r\n'), [['a', 'b'], ['x, y', 'say "hi"']]);
  assertEquals(parseCsv('a\tb\nc\td'), [['a', 'b'], ['c', 'd']]);
  assertEquals(parseCsv('\n\n'), []);
});

Deno.test('HR assigns training and sees completion without private progress', async () => {
  const { db, call } = setup();
  const created = await call('POST', `orgs/${ORG}/assignments`, { user: HR, body: { scope: 'departments', department_ids: [FRONT, SALES], track_code: 'hospitality', target_level: 'b1', due_date: '2099-01-31' } });
  assertEquals(created.body.created, 2);
  assertEquals((await call('POST', `orgs/${ORG}/assignments`, { user: EMPLOYEE, body: { scope: 'all', target_level: 'b1' } })).status, 403);
  assertEquals((await call('POST', `orgs/${ORG}/assignments`, { user: HR, body: { scope: 'all' } })).body.code, 'assignment_empty');
  assertEquals((await call('POST', `orgs/${ORG}/assignments`, { user: HR, body: { scope: 'all', target_level: 'b1', due_date: '2001-01-01' } })).body.field, 'due_date');
  assertEquals((await call('POST', `orgs/${ORG}/assignments`, { user: HR, body: { scope: 'people', member_ids: [M.other], track_code: 'sales' } })).body.created, 1);

  // The employee completes every hospitality lesson.
  const { track } = findLesson('hospitality-f1')!;
  for (const lesson of track.lessons) db.rows('company_lesson_progress').push({ id: crypto.randomUUID(), org_id: ORG, member_id: M.employee, track_code: 'hospitality', lesson_code: lesson.code, status: 'completed', score: 90, updated_at: '2026-10-20T00:00:00Z' });

  const list = await call('GET', `orgs/${ORG}/assignments`, { user: HR });
  assertEquals(list.body.can_manage, true);
  assertEquals(list.body.assignments.length, 3);
  const front = list.body.assignments.find((row: { department_id: string }) => row.department_id === FRONT);
  // Employee: all lessons but A2 < B1; manager: B2 but no lessons.
  assertEquals([front.stats.people, front.stats.done, front.stats.at_target, front.stats.lessons_percent], [2, 0, 1, 50]);
  const sales = list.body.assignments.find((row: { department_id: string }) => row.department_id === SALES);
  assertEquals([sales.stats.people, sales.stats.hidden, sales.stats.completion], [1, 1, null]);
  const detail = await call('GET', `orgs/${ORG}/assignments/${sales.id}`, { user: HR });
  assertEquals([detail.body.people[0].shared, detail.body.people[0].lessons_done, detail.body.people[0].level], [false, null, 'b1']);

  db.rows('company_members').find((row) => row.id === M.employee)!.level = 'b1';
  const detailFront = await call('GET', `orgs/${ORG}/assignments/${front.id}`, { user: HR });
  assertEquals(detailFront.body.people.find((row: { member_id: string }) => row.member_id === M.employee).done, true);

  // A manager sees their department's and everyone's assignments only.
  const managerView = await call('GET', `orgs/${ORG}/assignments`, { user: MANAGER });
  assertEquals(managerView.body.assignments.map((row: { department_id: string }) => row.department_id), [FRONT]);
  assertEquals((await call('GET', `orgs/${ORG}/assignments/${sales.id}`, { user: MANAGER })).status, 404);
  assertEquals((await call('PATCH', `orgs/${ORG}/assignments/${front.id}`, { user: MANAGER, body: { status: 'done' } })).status, 403);
  assertEquals((await call('PATCH', `orgs/${ORG}/assignments/${front.id}`, { user: HR, body: { status: 'cancelled' } })).body.assignment.status, 'cancelled');
  assertEquals((await call('GET', `orgs/${ORG}/my/home`, { user: EMPLOYEE })).body.assignments.length, 0);
});

Deno.test('learner routes need a membership; staff without one are refused politely', async () => {
  const { db, call } = setup();
  const STAFF = '00000000-0000-4000-8000-0000000000c9';
  db.rows('users').push({ id: STAFF, role: 'admin' });
  assertEquals((await call('GET', `orgs/${ORG}/tracks`, { user: STAFF })).status, 200);
  assertEquals((await call('GET', `orgs/${ORG}/my/home`, { user: STAFF })).body.code, 'not_member');
  assertEquals((await call('POST', `orgs/${ORG}/learn/hospitality-f1/check`, { user: STAFF, body: { answers: {} } })).body.code, 'not_member');
  db.rows('company_orgs')[0].status = 'suspended';
  assertEquals((await call('POST', `orgs/${ORG}/learn/hospitality-f1/check`, { user: EMPLOYEE, body: { answers: {} } })).body.code, 'org_suspended');
  assertEquals((await call('GET', `orgs/${ORG}/my/home`, { user: EMPLOYEE })).status, 200);
});

const SESSION = '00000000-0000-4000-8000-0000000000f1';
const addSession = (db: FakeDb, member: string) => db.rows('company_roleplay_sessions').push({
  id: SESSION, org_id: ORG, member_id: member, user_id: null, scenario_code: 'hospitality-rp-phone-booking', track_code: 'hospitality', status: 'active',
  turns: [{ role: 'ai', text: 'Hello.', at: '2026-10-01T00:00:00Z' }], learner_turns: 1, locale: 'ru', feedback: null, score: null, minutes: 0, created_at: '2026-10-01T00:00:00Z', ended_at: null,
});
/** Every route lessons and AI practice go through, for a learner with session SESSION. */
const practiceCalls = (user: string): [string, string, { user: string; body?: unknown }][] => [
  ['GET', `orgs/${ORG}/learn/hospitality-f1`, { user }],
  ['POST', `orgs/${ORG}/learn/hospitality-f1/start`, { user, body: { step: 'words' } }],
  ['POST', `orgs/${ORG}/learn/hospitality-f1/check`, { user, body: { answers: {} } }],
  ['POST', `orgs/${ORG}/roleplay`, { user, body: { scenario: 'hospitality-rp-phone-booking' } }],
  ['POST', `orgs/${ORG}/roleplay/${SESSION}/turn`, { user, body: { text: 'Good afternoon.' } }],
  ['POST', `orgs/${ORG}/roleplay/${SESSION}/finish`, { user }],
  ['POST', `orgs/${ORG}/writing/check`, { user, body: { text: 'Dear Mr Hoffmann, thank for your message about the room.' } }],
  ['POST', `orgs/${ORG}/glossary/practice`, { user, body: { mode: 'cards', seen: 5, known: 3 } }],
];

Deno.test('lessons and AI practice need a learning seat; browsing and HR tools do not', async () => {
  const { db, call, aiCalls } = setup({ ai: roleplayAi() });
  addSession(db, M.other);
  for (const [method, path, options] of practiceCalls(OTHER)) {
    const refused = await call(method, path, options);
    assertEquals([refused.status, refused.body.code, refused.body.reason], [402, 'seat_required', 'no_seat'], path);
  }
  assertEquals(aiCalls(), 0);
  assertEquals(db.rows('company_activity').length, 0);
  assertEquals(db.rows('company_lesson_progress').length, 0);
  assertEquals(db.rows('company_roleplay_sessions').length, 1);

  // What a seat unlocks stays visible, and the pages know it is locked.
  const tracks = await call('GET', `orgs/${ORG}/tracks`, { user: OTHER });
  assertEquals([tracks.status, tracks.body.can_learn, tracks.body.tracks.length], [200, false, 11]);
  const track = await call('GET', `orgs/${ORG}/tracks/hospitality`, { user: OTHER });
  assertEquals([track.status, track.body.can_learn, track.body.lessons[0].status], [200, false, 'new']);
  for (const page of ['roleplay', 'writing', 'glossary']) assertEquals((await call('GET', `orgs/${ORG}/${page}`, { user: OTHER })).body.can_learn, false, page);
  assertEquals((await call('GET', `orgs/${ORG}/roleplay/${SESSION}`, { user: OTHER })).body.can_learn, false);

  // My English opens but offers no lesson that would be refused.
  db.rows('company_assignments').push({ id: crypto.randomUUID(), org_id: ORG, track_code: 'sales', target_level: null, due_date: null, department_id: SALES, member_id: null, note: null, status: 'active', created_at: '2026-10-01' });
  const home = await call('GET', `orgs/${ORG}/my/home`, { user: OTHER });
  assertEquals([home.status, home.body.can_learn, home.body.continue, home.body.resuming, home.body.english_url], [200, false, null, false, null]);
  assertEquals([home.body.assignments.length, home.body.assignments[0].next], [1, null]);

  // HR needs no seat to manage; they do to practise.
  assertEquals((await call('POST', `orgs/${ORG}/glossary`, { user: HR, body: { term: 'Rack rate', meaning: 'The full price' } })).status, 200);
  assertEquals((await call('POST', `orgs/${ORG}/assignments`, { user: HR, body: { scope: 'all', target_level: 'b1' } })).status, 200);
  assertEquals((await call('GET', `orgs/${ORG}/assignments`, { user: HR })).status, 200);
  assertEquals((await call('POST', `orgs/${ORG}/glossary/practice`, { user: HR, body: { mode: 'cards', seen: 5 } })).status, 402);

  // A seated learner goes through every one of them.
  db.rows('company_roleplay_sessions')[0].member_id = M.employee;
  for (const [method, path, options] of practiceCalls(EMPLOYEE)) assertEquals((await call(method, path, options)).status, 200, path);
  assertEquals((await call('GET', `orgs/${ORG}/my/home`, { user: EMPLOYEE })).body.can_learn, true);
});

Deno.test('a pilot or an ended agreement closes seats and the Schood English link; staff are exempt', async () => {
  const now = new Date('2026-10-30T09:00:00Z');
  const { db, call } = setup({ ai: roleplayAi(), now: () => now });
  addSession(db, M.employee);
  const org = db.rows('company_orgs')[0];
  const locked = async (writes: string, reason: string) => {
    for (const [method, path, options] of practiceCalls(EMPLOYEE)) assertEquals((await call(method, path, options)).body.code, method === 'GET' ? 'seat_required' : writes, path);
    const home = await call('GET', `orgs/${ORG}/my/home`, { user: EMPLOYEE });
    assertEquals([home.body.can_learn, home.body.english_url, home.body.member.seat, home.body.seat_reason], [false, null, true, reason]);
    const refused = await call('GET', `orgs/${ORG}/learn/hospitality-f1`, { user: EMPLOYEE });
    assertEquals([refused.status, refused.body.code, refused.body.reason], [402, 'seat_required', reason]);
    for (const page of ['tracks', 'roleplay', 'writing', 'glossary']) assertEquals((await call('GET', `orgs/${ORG}/${page}`, { user: EMPLOYEE })).body.seat_reason, reason, page);
  };

  org.status = 'pilot';
  await locked('seat_required', 'pilot');
  // After an agreement ends the handler already refuses every write.
  org.status = 'active';
  org.contract_ends_at = '2026-10-29T00:00:00Z';
  await locked('contract_ended', 'contract_ended');

  // Paused: the same closed door, and the reason says who can open it.
  org.contract_ends_at = null;
  org.status = 'suspended';
  await locked('org_suspended', 'paused');
  org.status = 'active';

  org.contract_ends_at = '2026-11-30T00:00:00Z';
  const open = await call('GET', `orgs/${ORG}/my/home`, { user: EMPLOYEE });
  assertEquals([open.body.can_learn, open.body.english_url], [true, 'https://english.schood.online']);
  assertEquals((await call('GET', `orgs/${ORG}/learn/hospitality-f1`, { user: EMPLOYEE })).status, 200);

  // Staff browse lessons without a seat, even in a pilot, and can try them from a membership.
  org.status = 'pilot';
  const STAFF = '00000000-0000-4000-8000-0000000000c9';
  db.rows('users').push({ id: STAFF, role: 'admin' });
  assertEquals((await call('GET', `orgs/${ORG}/learn/hospitality-f1`, { user: STAFF })).status, 200);
  assertEquals((await call('GET', `orgs/${ORG}/tracks`, { user: STAFF })).body.can_learn, true);
  db.rows('company_members').push({ ...db.rows('company_members')[0], id: crypto.randomUUID(), user_id: STAFF, seat: false });
  assertEquals((await call('POST', `orgs/${ORG}/roleplay`, { user: STAFF, body: { scenario: 'hospitality-rp-phone-booking' } })).status, 200);
});

/** Behaves like production, where PostgREST returns at most 1,000 rows per request. */
function capAt1000(db: FakeDb) {
  const from = db.from.bind(db);
  db.from = (table: string) => from(table).limit(1000);
}
const filler = (index: number) => `00000000-0000-0000-0000-${String(index).padStart(12, '0')}`;

Deno.test('the training plan reads every member and every lesson row past the 1,000-row limit', async () => {
  const { db, call } = setup();
  capAt1000(db);
  // More people than one page, sorted ahead of the real ones, and all in the employee's department.
  const template = db.rows('company_members').find((row) => row.id === M.employee)!;
  db.tables.company_members.unshift(...Array.from({ length: 1100 }, (_, index) => ({ ...template, id: filler(index), user_id: null, email: null, full_name: `Person ${index}`, seat: false })));
  const assignment = (await call('POST', `orgs/${ORG}/assignments`, { user: HR, body: { scope: 'departments', department_ids: [FRONT], track_code: 'hospitality' } })).body.assignments[0];

  // More lesson rows than one page, ahead of the employee's completed lessons.
  db.rows('company_lesson_progress').push(...Array.from({ length: 1100 }, (_, index) => ({ id: filler(index), org_id: ORG, member_id: filler(index), track_code: 'general', lesson_code: 'general-f1', status: 'started', updated_at: '2026-10-01T00:00:00Z' })));
  const { track } = findLesson('hospitality-f1')!;
  track.lessons.forEach((lesson, index) => db.rows('company_lesson_progress').push({ id: `ffffffff-0000-4000-8000-${String(index).padStart(12, '0')}`, org_id: ORG, member_id: M.employee, track_code: 'hospitality', lesson_code: lesson.code, status: 'completed', updated_at: '2026-10-20T00:00:00Z' }));

  const list = await call('GET', `orgs/${ORG}/assignments`, { user: HR });
  assertEquals(list.body.assignments[0].stats.people, 1102);
  assertEquals(list.body.assignments[0].stats.done, 1);
  const detail = await call('GET', `orgs/${ORG}/assignments/${assignment.id}`, { user: HR });
  const employee = detail.body.people.find((row: { member_id: string }) => row.member_id === M.employee);
  assertEquals([employee.lessons_done, employee.done, employee.last_active], [track.lessons.length, true, '2026-10-20T00:00:00Z']);

  // HR can choose someone past the first page, and sees every assignment.
  const late = (await call('POST', `orgs/${ORG}/assignments`, { user: HR, body: { scope: 'people', member_ids: [M.other], target_level: 'b1' } }));
  assertEquals(late.status, 200);
  db.rows('company_assignments').unshift(...Array.from({ length: 1100 }, (_, index) => ({ id: filler(index), org_id: ORG, track_code: null, target_level: 'b1', due_date: null, department_id: null, member_id: filler(index), note: null, status: 'active', created_at: '2020-01-01' })));
  assertEquals((await call('GET', `orgs/${ORG}/assignments`, { user: HR })).body.assignments.length, 1102);
});

Deno.test('My English finds a member\'s assignments past the 1,000-row limit', async () => {
  const { db, call } = setup();
  capAt1000(db);
  db.rows('company_assignments').push(
    ...Array.from({ length: 1100 }, (_, index) => ({ id: filler(index), org_id: ORG, track_code: 'general', target_level: null, due_date: null, department_id: null, member_id: crypto.randomUUID(), note: null, status: 'active', created_at: '2026-10-01' })),
    { id: 'ffffffff-0000-4000-8000-000000000001', org_id: ORG, track_code: 'hospitality', target_level: null, due_date: null, department_id: null, member_id: null, note: 'Everyone', status: 'active', created_at: '2026-10-01' },
    { id: 'ffffffff-0000-4000-8000-000000000002', org_id: ORG, track_code: 'hospitality', target_level: null, due_date: null, department_id: FRONT, member_id: null, note: 'Front office', status: 'active', created_at: '2026-10-01' },
    { id: 'ffffffff-0000-4000-8000-000000000003', org_id: ORG, track_code: 'hospitality', target_level: null, due_date: null, department_id: null, member_id: M.employee, note: 'Just you', status: 'active', created_at: '2026-10-01' },
  );
  const home = await call('GET', `orgs/${ORG}/my/home`, { user: EMPLOYEE });
  assertEquals(home.body.assignments.map((row: { note: string }) => row.note).sort(), ['Everyone', 'Front office', 'Just you']);
});

Deno.test('a manager with no department sees nobody through company-wide assignments', async () => {
  const { db, call } = setup();
  const manager = db.rows('company_members').find((row) => row.id === M.manager)!;
  manager.department_id = null;
  db.rows('company_members').find((row) => row.id === M.other)!.department_id = null;
  const assignment = (await call('POST', `orgs/${ORG}/assignments`, { user: HR, body: { scope: 'all', track_code: 'general' } })).body.assignments[0];

  const detail = await call('GET', `orgs/${ORG}/assignments/${assignment.id}`, { user: MANAGER });
  assertEquals(detail.status, 200);
  assertEquals([detail.body.people, detail.body.stats.people, detail.body.stats.completion], [[], 0, null]);
  const list = await call('GET', `orgs/${ORG}/assignments`, { user: MANAGER });
  assertEquals([list.body.assignments.length, list.body.assignments[0].stats.people, list.body.assignments[0].stats.hidden], [1, 0, 0]);

  // HR still sees the same people, and a manager with a department sees theirs.
  assertEquals((await call('GET', `orgs/${ORG}/assignments/${assignment.id}`, { user: HR })).body.stats.people, 3);
  manager.department_id = FRONT;
  assertEquals((await call('GET', `orgs/${ORG}/assignments/${assignment.id}`, { user: MANAGER })).body.people.map((row: { member_id: string }) => row.member_id).sort(), [M.employee, M.manager]);
});

Deno.test('only a first completion counts as a lesson and earns points', async () => {
  const { db, call } = setup();
  const code = 'hospitality-f1';
  const check = (answers: unknown) => call('POST', `orgs/${ORG}/learn/${code}/check`, { user: EMPLOYEE, body: { answers, minutes: 5 } });
  for (let attempt = 0; attempt < 5; attempt++) await check({});
  const activity = () => db.rows('company_activity');
  assertEquals(activity().filter((row) => row.kind === 'lesson').length, 0);
  assertEquals(activity().filter((row) => row.kind === 'lesson_retry').length, 5);

  assertEquals((await check(correctAnswers(code))).body.first_completion, true);
  for (let attempt = 0; attempt < 3; attempt++) assertEquals((await check(correctAnswers(code))).body.first_completion, false);
  assertEquals(activity().filter((row) => row.kind === 'lesson').length, 1);
  assertEquals(activity().reduce((sum, row) => sum + Number(row.points), 0), 20);
  assertEquals(activity().reduce((sum, row) => sum + Number(row.minutes), 0), 45);
});

Deno.test('glossary practice earns at most 40 points a Tashkent day, and earns again the next day', async () => {
  let now = new Date('2026-10-30T18:30:00Z'); // 23:30 in Tashkent
  const { db, call } = setup({ now: () => now });
  const term = crypto.randomUUID();
  db.rows('company_glossary_terms').push({ id: term, org_id: ORG, term: 'Rack rate', meaning: 'The full price', department_id: null });
  const round = async (body: Record<string, unknown>) => {
    assertEquals((await call('POST', `orgs/${ORG}/glossary/practice`, { user: EMPLOYEE, body: { minutes: 2, ...body } })).status, 200);
    db.rows('company_activity').at(-1)!.created_at = now.toISOString();
  };
  await round({ mode: 'cards', seen: 30 });
  await round({ mode: 'cards', seen: 200 });
  await round({ mode: 'quiz', answers: Array.from({ length: 50 }, () => ({ term, choice: term })) });
  assertEquals(db.rows('company_activity').map((row) => row.points), [30, 10, 0]);
  assertEquals(db.rows('company_activity').map((row) => row.minutes), [2, 2, 2]);

  now = new Date('2026-10-30T19:30:00Z'); // 00:30 the next day in Tashkent
  await round({ mode: 'cards', seen: 5 });
  assertEquals(db.rows('company_activity').at(-1)!.points, 5);
});

Deno.test('the glossary reads all its terms past the 1,000-row limit', async () => {
  const { db, call } = setup();
  capAt1000(db);
  const terms = db.rows('company_glossary_terms');
  terms.push(...Array.from({ length: 1100 }, (_, index) => ({ id: crypto.randomUUID(), org_id: ORG, term: `Term ${String(index).padStart(4, '0')}`, meaning: 'x', department_id: null })));
  const hidden = terms[1050];

  assertEquals((await call('GET', `orgs/${ORG}/glossary`, { user: HR })).body.terms.length, 1100);
  const patched = await call('PATCH', `orgs/${ORG}/glossary/${hidden.id}`, { user: HR, body: { meaning: 'Now explained' } });
  assertEquals([patched.status, patched.body.term.meaning], [200, 'Now explained']);
  assertEquals((await call('POST', `orgs/${ORG}/glossary`, { user: HR, body: { term: String(hidden.term).toUpperCase(), meaning: 'Again' } })).body.code, 'glossary_duplicate');
  const imported = await call('POST', `orgs/${ORG}/glossary/import`, { user: HR, body: { csv: `term,meaning\n${hidden.term},From the file\n` } });
  assertEquals([imported.body.added, imported.body.updated], [0, 1]);

  terms.push(...Array.from({ length: 900 }, (_, index) => ({ id: crypto.randomUUID(), org_id: ORG, term: `Extra ${index}`, meaning: 'x', department_id: null })));
  assertEquals((await call('POST', `orgs/${ORG}/glossary`, { user: HR, body: { term: 'One too many', meaning: 'x' } })).body.code, 'glossary_full');
});

Deno.test('assignment dates follow Tashkent, like My English and the overview', async () => {
  const now = new Date('2026-11-01T20:00:00Z'); // 01:00 on 2 November in Tashkent
  const { db, call } = setup({ now: () => now });
  assertEquals((await call('POST', `orgs/${ORG}/assignments`, { user: HR, body: { scope: 'all', target_level: 'b1', due_date: '2026-11-01' } })).body.field, 'due_date');
  assertEquals((await call('POST', `orgs/${ORG}/assignments`, { user: HR, body: { scope: 'all', target_level: 'b1', due_date: '2026-11-02' } })).status, 200);
  const row = db.rows('company_assignments')[0];
  assertEquals((await call('GET', `orgs/${ORG}/assignments`, { user: HR })).body.assignments[0].stats.overdue, false);
  row.due_date = '2026-11-01';
  assertEquals((await call('GET', `orgs/${ORG}/assignments`, { user: HR })).body.assignments[0].stats.overdue, true);
  assertEquals((await call('GET', `orgs/${ORG}/assignments/${row.id}`, { user: HR })).body.stats.overdue, true);
  assertEquals((await call('GET', `orgs/${ORG}/my/home`, { user: EMPLOYEE })).body.assignments[0].overdue, true);
});

Deno.test('every activity kind has a label in every language; a person not found says only that', () => {
  assert(ACTIVITY_KINDS.includes('lesson_retry'));
  for (const [locale, catalogue] of Object.entries({ en: insightsEn, ru: insightsRu, uz: insightsUz }) as [string, Record<string, string>][]) {
    for (const kind of ACTIVITY_KINDS) assert(catalogue[`insights.kind.${kind}`], `${locale}: ${kind}`);
    assert(!('insights.error.member_not_found' in catalogue), locale);
  }
  assertEquals(peopleEn['people.error.member_not_found'], 'Person not found.');
});

Deno.test('the due-date minimum is the Tashkent day, as on the server', () => {
  assertEquals(tashkentDate(new Date('2026-11-05T18:59:00Z')), '2026-11-05');
  assertEquals(tashkentDate(new Date('2026-11-05T19:00:00Z')), '2026-11-06');
});

Deno.test('passing checks at once log one lesson, whether or not the row exists yet', async () => {
  const { db, call } = setup();
  db.uniques.company_lesson_progress = [{ columns: ['member_id', 'lesson_code'] }];
  const activity = (code: string) => db.rows('company_activity').filter((row) => row.ref === code);
  const check = (code: string) => call('POST', `orgs/${ORG}/learn/${code}/check`, { user: EMPLOYEE, body: { answers: correctAnswers(code), minutes: 5 } });
  for (const [code, started] of [['hospitality-f1', false], ['hospitality-f2', true]] as const) {
    if (started) assertEquals((await call('POST', `orgs/${ORG}/learn/${code}/start`, { user: EMPLOYEE, body: {} })).status, 200);
    const replies = await Promise.all([check(code), check(code), check(code)]);
    assertEquals(replies.map((reply) => reply.status), [200, 200, 200], code);
    assertEquals(replies.filter((reply) => reply.body.first_completion).length, 1, code);
    assertEquals(activity(code).filter((row) => row.kind === 'lesson').length, 1, code);
    assertEquals(activity(code).filter((row) => row.kind === 'lesson_retry').length, 2, code);
    assertEquals(db.rows('company_lesson_progress').filter((row) => row.lesson_code === code).map((row) => row.status), ['completed'], code);
  }
});

Deno.test('a failing check after a pass leaves the lesson completed', async () => {
  const { db, call } = setup();
  const code = 'hospitality-f1';
  await call('POST', `orgs/${ORG}/learn/${code}/check`, { user: EMPLOYEE, body: { answers: correctAnswers(code), minutes: 5 } });
  const failed = await call('POST', `orgs/${ORG}/learn/${code}/check`, { user: EMPLOYEE, body: { answers: {}, minutes: 5 } });
  assertEquals([failed.body.passed, failed.body.status, failed.body.best], [false, 'completed', 100]);
  const row = db.rows('company_lesson_progress').find((entry) => entry.lesson_code === code)!;
  assertEquals([row.status, row.score, row.attempts], ['completed', 100, 2]);
  assert(row.completed_at);
});

Deno.test('clicking cannot top a minutes challenge: self-reported minutes stop at the daily cap', async () => {
  const { db, call } = setup();
  const code = 'hospitality-f1';
  const logged = () => db.rows('company_activity').filter((row) => row.kind === 'lesson_retry' || row.kind === 'glossary').reduce((sum, row) => sum + (row.minutes as number), 0);
  await call('POST', `orgs/${ORG}/learn/${code}/check`, { user: EMPLOYEE, body: { answers: correctAnswers(code), minutes: 60 } });
  assertEquals(logged(), 0);
  for (let round = 0; round < 3; round++) await call('POST', `orgs/${ORG}/learn/${code}/check`, { user: EMPLOYEE, body: { answers: {}, minutes: 50 } });
  assertEquals(logged(), 150);
  const glossary = await call('POST', `orgs/${ORG}/glossary/practice`, { user: EMPLOYEE, body: { mode: 'cards', seen: 5, known: 3, minutes: 30 } });
  assertEquals([glossary.status, logged()], [200, DAILY_SELF_REPORTED_MINUTES]);
  await call('POST', `orgs/${ORG}/learn/${code}/check`, { user: EMPLOYEE, body: { answers: {}, minutes: 60 } });
  await call('POST', `orgs/${ORG}/glossary/practice`, { user: EMPLOYEE, body: { mode: 'cards', seen: 5, known: 3, minutes: 30 } });
  assertEquals(logged(), DAILY_SELF_REPORTED_MINUTES);
  // Yesterday's minutes leave today's allowance alone.
  for (const row of db.rows('company_activity')) row.created_at = new Date(Date.now() - 2 * 86_400_000).toISOString();
  await call('POST', `orgs/${ORG}/learn/${code}/check`, { user: EMPLOYEE, body: { answers: {}, minutes: 10 } });
  assertEquals(logged(), DAILY_SELF_REPORTED_MINUTES + 10);
});

Deno.test('assigning to people reads every member past the 1,000-row limit', async () => {
  const { db, call } = setup();
  capAt1000(db);
  const ids = Array.from({ length: 1200 }, (_, index) => filler(index));
  for (const id of ids) db.rows('company_members').push({ id, org_id: ORG, user_id: null, full_name: 'P', email: null, role: 'employee', status: 'active', department_id: null, job_role: 'general', seat: false, level: null, consent_at: null });
  const last = [...ids].sort().at(-1)!;
  const made = await call('POST', `orgs/${ORG}/assignments`, { user: HR, body: { scope: 'people', track_code: 'general', member_ids: [last] } });
  assertEquals([made.status, made.body.created], [200, 1]);
});

Deno.test('home: the week reads every activity row, past the 1000 rows PostgREST returns at a time', async () => {
  const now = new Date('2026-10-14T09:00:00+05:00');
  const { db, call } = setup({ now: () => now });
  db.maxRows = 1000;
  // More rows than one page, all today: an unpaged read would count only the first 1000.
  for (let index = 0; index < 1500; index++) db.rows('company_activity').push({ id: index + 1, org_id: ORG, member_id: M.employee, user_id: EMPLOYEE, kind: 'lesson', minutes: 1, points: 0, created_at: new Date(now.getTime() - index * 1000).toISOString() });
  const home = await call('GET', `orgs/${ORG}/my/home`, { user: EMPLOYEE });
  assertEquals(home.status, 200);
  assertEquals(home.body.week.minutes, 1500);
  assertEquals(home.body.week.days.at(-1).minutes, 1500);
});
