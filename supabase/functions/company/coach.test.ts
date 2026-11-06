import { assert, assertEquals, assertFalse } from 'jsr:@std/assert@1';
import { JOB_ROLES } from '../../../packages/company-core/src/mod.ts';
import { routes as coach } from './coach.ts';
import { routes as core } from './core.ts';
import { evaluateBadges } from './coach/badges.ts';
import { compareSpoken, frontKey, typedMatch, words } from './coach/compare.ts';
import { MAX_DECK, NEW_PER_DAY } from './coach/deck.ts';
import { FEATURE, FINDER_DAILY, readOptions } from './coach/finder.ts';
import { buildPlan, mainWeights, pickMain, ROLE_SITUATIONS, situationsFor, whyPicked } from './coach/plan.ts';
import { DIALOGUES } from './coach/phrasebook/dialogues.ts';
import { ALL_PHRASES, findPhrase, findSituation, phrasesFor, searchPhrases, SITUATIONS } from './coach/phrasebook/index.ts';
import { addDay, MAX_INTERVAL, modeFor, schedule, type Schedule } from './coach/srs.ts';
import { computeStreak, FREEZES_PER_MONTH, mondayOf, practiceCalendar, weekGoal } from './coach/streak.ts';
import { KUDOS_DAILY } from './coach/team.ts';
import { reminderIcs } from '../../../apps/company/src/areas/coach/calendar.ts';
import { FakeDb, testHandler } from './testing.ts';
import { DAILY_POINTS } from './training/glossary.ts';
import { TRACKS } from './training/tracks/index.ts';
import type { AiCall } from './types.ts';
import { tashkentDay } from './util.ts';

const ORG = '7a0f5c1e-0000-4000-8000-00000000c0de';
const OTHER_ORG = '7a0f5c1e-0000-4000-8000-00000000c0df';
const HR = '00000000-0000-4000-8000-0000000000c1';
const EMPLOYEE = '00000000-0000-4000-8000-0000000000c2';
const COLLEAGUE = '00000000-0000-4000-8000-0000000000c3';
const NO_SEAT = '00000000-0000-4000-8000-0000000000c4';
const STRANGER = '00000000-0000-4000-8000-0000000000c5';
const STAFF = '00000000-0000-4000-8000-0000000000c6';
const FRONT = '00000000-0000-4000-8000-0000000000d1';
const SALES = '00000000-0000-4000-8000-0000000000d2';
const M = {
  hr: '00000000-0000-4000-8000-0000000000e1', employee: '00000000-0000-4000-8000-0000000000e2', colleague: '00000000-0000-4000-8000-0000000000e3',
  noSeat: '00000000-0000-4000-8000-0000000000e4', stranger: '00000000-0000-4000-8000-0000000000e5',
};
const PATH = `orgs/${ORG}/coach`;

function setup(options: { ai?: AiCall; aiAllowed?: () => boolean; org?: Record<string, unknown> } = {}) {
  const consent = '2026-01-01T00:00:00.000Z';
  const member = (id: string, user: string, role: string, extra: Record<string, unknown> = {}) => ({
    id, org_id: ORG, user_id: user, email: `${role}@hotel.example`, full_name: `Person ${role}`, role, department_id: FRONT, job_role: 'hospitality', status: 'active', seat: true,
    level: 'a2', level_score: 38, level_source: 'placement', level_at: null, target_level: 'b1', target_date: null, consent_at: consent, joined_at: consent, ...extra,
  });
  const db = new FakeDb({
    users: [{ id: HR, role: 'user' }, { id: EMPLOYEE, role: 'user' }, { id: COLLEAGUE, role: 'user' }, { id: NO_SEAT, role: 'user' }, { id: STRANGER, role: 'user' }, { id: STAFF, role: 'admin' }],
    company_orgs: [
      { id: ORG, name: 'Silk Road Hotels', industry: 'hospitality', size_band: '51-200', status: 'active', seats_limit: 10, tests_limit: 50, tests_used: 0, settings: { locale: 'ru' }, created_at: consent, ...options.org },
      { id: OTHER_ORG, name: 'Other', industry: 'other', size_band: '1-50', status: 'active', seats_limit: 10, tests_limit: 50, tests_used: 0, settings: {}, created_at: consent },
    ],
    company_departments: [{ id: FRONT, org_id: ORG, name: 'Front office' }, { id: SALES, org_id: ORG, name: 'Sales' }],
    company_members: [
      member(M.hr, HR, 'admin', { seat: false, job_role: 'general' }),
      member(M.employee, EMPLOYEE, 'employee'),
      member(M.colleague, COLLEAGUE, 'employee', { department_id: SALES, job_role: 'sales' }),
      member(M.noSeat, NO_SEAT, 'employee', { seat: false }),
      member(M.stranger, STRANGER, 'employee', { org_id: OTHER_ORG }),
    ],
  });
  db.uniques.company_coach_cards = [{ columns: ['member_id', 'front_key'] }];
  db.uniques.company_coach_kudos = [
    { columns: ['from_member', 'to_member', 'day'], where: (row) => row.kind === 'kudos' },
    { columns: ['from_member', 'badge'], where: (row) => row.kind === 'badge' },
  ];
  db.rpcs.company_consume_ai = () => options.aiAllowed ? options.aiAllowed() : true;
  return { db, call: testHandler(db, [...core, ...coach], { ai: options.ai }) };
}

const dayNow = () => tashkentDay(new Date());
const card = (id: string, memberId: string, extra: Record<string, unknown> = {}) => ({
  id, org_id: ORG, member_id: memberId, user_id: EMPLOYEE, source: 'own', source_ref: null, front: `Phrase ${id.slice(-4)}`, front_key: `phrase ${id.slice(-4)}`, ru: 'Фраза', uz: 'Ibora', note: null,
  state: 'new', stability: 0, difficulty: 5, reps: 0, lapses: 0, due_on: null, last_reviewed_at: null, suspended: false, created_at: new Date().toISOString(), ...extra,
});
const uuidN = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const seedCards = (db: FakeDb, count: number, extra: Record<string, unknown> = {}) => {
  for (let n = 1; n <= count; n++) db.rows('company_coach_cards').push(card(uuidN(n), M.employee, extra));
};
const review = (call: ReturnType<typeof setup>['call'], id: string, reps = 0, grade = 3) => call('POST', `${PATH}/reviews`, { user: EMPLOYEE, body: { card: id, reps, grade, mode: 'recall' } });

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

Deno.test('phrasebook: 300+ phrases, every situation, unique ids and text', () => {
  assert(ALL_PHRASES.length >= 300, `${ALL_PHRASES.length} phrases`);
  assertEquals(SITUATIONS.map((row) => row.code).sort(), ['apology', 'complaint', 'delay', 'email', 'handover', 'invoice', 'meeting', 'negotiation', 'phone', 'presentation', 'small_talk']);
  assertEquals(new Set(ALL_PHRASES.map((row) => row.id)).size, ALL_PHRASES.length);
  assertEquals(new Set(ALL_PHRASES.map((row) => row.en.toLowerCase())).size, ALL_PHRASES.length);
  for (const situation of SITUATIONS) {
    assert(situation.phrases.length >= 30, situation.code);
    for (const level of ['a2', 'b1', 'b2']) assert(situation.phrases.some((row) => row.level === level), `${situation.code} has ${level}`);
    for (const field of ['en', 'ru', 'uz'] as const) assert(situation.title[field] && situation.lead[field], `${situation.code} title ${field}`);
  }
});

Deno.test('phrasebook: English is English, Russian is Cyrillic, Uzbek is Latin with the right apostrophes', () => {
  for (const phrase of ALL_PHRASES) {
    assert(phrase.en.length <= 120 && /^[A-Z]/.test(phrase.en) && !/[Ѐ-ӿ]/.test(phrase.en), phrase.id);
    assert(/[Ѐ-ӿ]/.test(phrase.ru), `${phrase.id} ru`);
    assert(!/[Ѐ-ӿ]/.test(phrase.uz), `${phrase.id} uz is Latin`);
    assert(!/'/.test(phrase.uz), `${phrase.id} uz uses ‘ and ’`);
    assert(!/[og]’/i.test(phrase.uz), `${phrase.id} o‘ and g‘ use U+2018`);
  }
});

Deno.test('phrasebook: phrases suit a level, search finds any of the three languages', () => {
  assert(phrasesFor('phone', 'a1').every((row) => row.level === 'a2'));
  assert(phrasesFor('phone', 'b1').some((row) => row.level === 'b2'));
  assertEquals(phrasesFor('nope', 'b1'), []);
  assert(findPhrase('phone-01'));
  assertEquals(searchPhrases('invoice overdue', null)[0].situation, 'invoice');
  assert(searchPhrases('счёт просрочен', null).some((row) => row.situation === 'invoice'));
  assert(searchPhrases('kechikkanim uchun uzr', null).some((row) => row.situation === 'apology'));
  assertEquals(searchPhrases('a', null), []);
  for (const role of JOB_ROLES) assert(situationsFor(role).every((code) => findSituation(code)), role);
});

// ---------------------------------------------------------------------------
// Pure rules
// ---------------------------------------------------------------------------

const fresh: Schedule = { state: 'new', stability: 0, difficulty: 5, reps: 0, lapses: 0, due_on: null, last_reviewed_at: null };

Deno.test('schedule: spacing grows with success, "again" stays today, same-day repeats do not grow', () => {
  const start = '2026-11-02';
  const first = schedule(fresh, 3, start, `${start}T06:00:00Z`);
  assertEquals(first.reps, 1);
  assert(first.due_on! > start);
  const again = schedule(fresh, 1, start, `${start}T06:00:00Z`);
  assertEquals(again.due_on, start);
  assertEquals(again.state, 'learning');
  const repeat = schedule(first, 3, start, `${start}T06:05:00Z`);
  assertEquals(repeat.stability, first.stability);
  const later = first.due_on!;
  const second = schedule(first, 3, later, `${later}T06:00:00Z`);
  assert(second.stability > first.stability, 'stability grows');
  const easy = schedule(first, 4, later, `${later}T06:00:00Z`);
  const hard = schedule(first, 2, later, `${later}T06:00:00Z`);
  assert(easy.stability > second.stability && second.stability > hard.stability, 'easy > good > hard');
  const lapse = schedule(second, 1, addDay(later, 3), `${addDay(later, 3)}T06:00:00Z`);
  assertEquals(lapse.lapses, 1);
  assert(lapse.stability < second.stability);
  assertEquals(lapse.due_on, addDay(later, 3));
});

Deno.test('schedule: intervals are capped and modes rotate', () => {
  let card = fresh, day = '2026-01-05';
  for (let round = 0; round < 12; round++) {
    card = schedule(card, 4, day, `${day}T06:00:00Z`);
    const gap = (Date.parse(card.due_on!) - Date.parse(day)) / 86_400_000;
    assert(gap <= MAX_INTERVAL && gap >= 1);
    assert(card.difficulty >= 1 && card.difficulty <= 10);
    day = card.due_on!;
  }
  assertEquals(modeFor({ state: 'new', reps: 0 }), 'intro');
  assertEquals(new Set([1, 2, 3].map((reps) => modeFor({ state: 'review', reps }))), new Set(['listen', 'recall', 'type']));
});

// 2026-11-02 is a Monday.
const streakOf = (today: string, days: string[], extra: Partial<Parameters<typeof computeStreak>[0]> = {}) =>
  computeStreak({ today, practiced: new Set(days), restDays: [0, 6], leave: [], ...extra });

Deno.test('streak: counts practice days, rest days and the unfinished today never break it', () => {
  const result = streakOf('2026-11-09', ['2026-11-04', '2026-11-05', '2026-11-06']);
  assertEquals(result.current, 3, 'the weekend and an open Monday leave it alone');
  assertEquals(result.best, 3);
  assertEquals(result.days.get('2026-11-07'), 'rest');
  assertEquals(result.days.get('2026-11-09'), 'open');
  assertEquals(streakOf('2026-11-09', []).current, 0);
});

Deno.test('streak: freezes forgive missed working days, up to the monthly allowance, once a streak exists', () => {
  const kept = streakOf('2026-11-13', ['2026-11-02', '2026-11-03', '2026-11-05', '2026-11-12', '2026-11-13'], { restDays: [] });
  // Misses Nov 4 and 6 (frozen), then 7 (third miss: broken), so only the last two remain.
  assertEquals(kept.current, 2);
  assertEquals(kept.best, 3);
  assertEquals(kept.days.get('2026-11-04'), 'frozen');
  assertEquals(kept.days.get('2026-11-07'), 'missed');
  assertEquals(kept.freezes_left, 0);
  const oneMiss = streakOf('2026-11-05', ['2026-11-03', '2026-11-05'], { restDays: [] });
  assertEquals(oneMiss.current, 2);
  assertEquals(oneMiss.freezes_left, FREEZES_PER_MONTH - 1);
  // The allowance starts again with the month.
  const across = streakOf('2026-12-02', ['2026-11-27', '2026-11-30', '2026-12-02'], { restDays: [], today: '2026-12-02' });
  assertEquals(across.current, 3);
  assertEquals(across.freezes_left, FREEZES_PER_MONTH - 1);
});

Deno.test('streak: leave keeps it safe; a calendar has whole weeks ending in the future', () => {
  const result = streakOf('2026-11-20', ['2026-11-02', '2026-11-20'], { leave: [{ from: '2026-11-03', to: '2026-11-19' }] });
  assertEquals(result.current, 2);
  assertEquals(result.days.get('2026-11-10'), 'leave');
  assertEquals(mondayOf('2026-11-08'), '2026-11-02');
  assertEquals(mondayOf('2026-11-02'), '2026-11-02');
  const calendar = practiceCalendar('2026-11-04', result.days, new Map(), 4);
  assertEquals(calendar.length, 28);
  assertEquals(calendar[27].status, 'future');
  assertEquals(calendar[27].day, '2026-11-08');
  const goal = weekGoal('2026-11-04', new Set(['2026-11-02', '2026-11-03', '2026-10-26']), 2, 2);
  assertEquals(goal.done, 2);
  assert(goal.met);
  assertFalse(goal.history[0].met);
});

Deno.test('compare: contractions, numbers and punctuation do not count against the speaker', () => {
  assertEquals(words("I'm sorry, we can't."), ['i', 'am', 'sorry', 'we', 'can', 'not']);
  assertEquals(compareSpoken("I'll call you in ten minutes.", 'I will call you in 10 minutes').score, 100);
  const partial = compareSpoken('Could you repeat that, please?', 'could you repeat please');
  assertEquals(partial.score, 80);
  assertEquals(partial.words.filter((row) => !row.ok).map((row) => row.word), ['that']);
  assertEquals(compareSpoken('Thank you', 'thank you very much').extra, ['very', 'much']);
  assertEquals(compareSpoken('Thank you', '').score, 0);
  assertEquals(typedMatch('Could you repeat that?', 'could you repeat that'), 'exact');
  assertEquals(typedMatch('Could you repeat that?', 'could you repeet that'), 'close');
  assertEquals(typedMatch('Could you repeat that?', 'no idea'), 'wrong');
  assertEquals(typedMatch('Could you repeat that?', ''), 'wrong');
  assertEquals(frontKey('  Thank   You!! '), 'thank you');
});

Deno.test('plan: fits the length, weighs job and weak skills, does not repeat a day', () => {
  const base = { minutes: 10 as const, reviewable: 20, lesson: 'l', scenario: 's', template: 't', situation: 'phone', jobRole: 'general', weak: [], previous: null, seed: 'x' };
  const long = buildPlan(base);
  assert(long.reduce((sum, item) => sum + item.minutes, 0) <= 10);
  assert(long.reduce((sum, item) => sum + item.minutes, 0) >= 5);
  assertEquals(long[0], { type: 'review', target: 8, minutes: 3 });
  assertEquals(long[long.length - 1].type, 'shadow');
  const short = buildPlan({ ...base, minutes: 5 });
  assertEquals(short.length, 2);
  assert(short.reduce((sum, item) => sum + item.minutes, 0) <= 7);
  assertEquals(buildPlan({ ...base, reviewable: 2 })[0], { type: 'review', target: 2, minutes: 3 });
  // Nothing at all to do still gives a step.
  assertEquals(buildPlan({ ...base, minutes: 5, reviewable: 0, lesson: null, scenario: null, template: null }).map((item) => item.type), ['shadow']);
  assertEquals(buildPlan(base), buildPlan(base));
  assert(mainWeights('sales', [], null).roleplay > mainWeights('engineering', [], null).roleplay);
  assert(mainWeights('general', ['writing'], null).writing > mainWeights('general', [], null).writing);
  assert(mainWeights('sales', [], 'roleplay').roleplay < mainWeights('sales', [], null).roleplay);
  assertEquals(pickMain({ writing: 't' }, mainWeights('general', [], null), 'seed'), 'writing');
  assertEquals(pickMain({}, mainWeights('general', [], null), 'seed'), null);
  const picks = Array.from({ length: 200 }, (_, index) => pickMain({ lesson: 'l', roleplay: 's', writing: 't' }, mainWeights('sales', ['speaking'], null), `seed-${index}`));
  assert(picks.filter((kind) => kind === 'roleplay').length > picks.filter((kind) => kind === 'writing').length);
});

Deno.test('calendar: a reminder repeats on working days and starts on one', () => {
  const ics = reminderIcs({ time: '09:30', restDays: [0, 6], today: '2026-11-07', minutes: 10, summary: 'English, practice; today', description: 'Line\nnext', url: 'https://company.schood.online/w/x/today', stamp: '20261107T060000Z' });
  assert(ics.includes('RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'));
  assert(ics.includes('DTSTART;TZID=Asia/Tashkent:20261109T093000'), 'Saturday moves on to Monday');
  assert(ics.includes('SUMMARY:English\\, practice\\; today'));
  assert(ics.includes('DESCRIPTION:Line\\nnext'));
  assert(ics.includes('DURATION:PT10M'));
  assert(ics.includes('\r\n'));
});

Deno.test('plan: says why a main item was picked', () => {
  assertEquals(whyPicked('roleplay', 'general', ['speaking']), 'speaking');
  assertEquals(whyPicked('writing', 'office_admin', []), 'job');
  assertEquals(whyPicked('lesson', 'general', []), undefined);
  const items = buildPlan({ minutes: 5, reviewable: 0, lesson: null, scenario: 's', template: null, situation: 'phone', jobRole: 'sales', weak: [], previous: null, seed: 'x' });
  assertEquals(items[0], { type: 'roleplay', scenario: 's', minutes: 5, why: 'job' });
});

Deno.test('phrasebook: every situation has a model conversation with both people speaking', () => {
  assertEquals(DIALOGUES.length, SITUATIONS.length);
  for (const situation of SITUATIONS) {
    const talk = situation.dialogue;
    assert(talk, situation.code);
    assert(talk.lines.length >= 6, situation.code);
    assert(talk.lines.some((row) => row.who === 'a') && talk.lines.some((row) => row.who === 'b'), situation.code);
    for (const field of ['en', 'ru', 'uz'] as const) assert(talk.title[field], situation.code);
    for (const row of talk.lines) {
      assert(/[\u0400-\u04FF]/.test(row.ru), row.en);
      assert(!/[\u0400-\u04FF]/.test(row.uz) && !/'/.test(row.uz) && !/[og]’/i.test(row.uz), row.uz);
    }
  }
});

Deno.test('badges: progress is capped at the target and nobody is compared', () => {
  const facts = { plans: 12, reviews: 3, shadow: 0, lessons: 0, roleplays: 0, writing: 0, best_streak: 7, weeks_met: 0, level_steps: 0 };
  const badges = evaluateBadges(facts);
  assert(badges.find((row) => row.code === 'plans_10')!.earned);
  assertEquals(badges.find((row) => row.code === 'plans_10')!.value, 10);
  assertFalse(badges.find((row) => row.code === 'plans_50')!.earned);
  assert(badges.find((row) => row.code === 'streak_7')!.earned);
  assertEquals(new Set(badges.map((row) => row.code)).size, badges.length);
});

// ---------------------------------------------------------------------------
// Who may use it
// ---------------------------------------------------------------------------

Deno.test('seat: learning routes need a working seat and say why not', async () => {
  const { call } = setup();
  for (const path of ['today', 'queue', 'deck', 'progress', 'phrasebook', 'shadow', 'finder']) {
    const refused = await call('GET', `${PATH}/${path}`, { user: NO_SEAT });
    assertEquals(refused.status, 402, path);
    assertEquals(refused.body.code, 'seat_required');
    assertEquals(refused.body.reason, 'no_seat');
  }
  assertEquals((await call('GET', `${PATH}/today`)).status, 401);
  assertEquals((await call('GET', `${PATH}/today`, { user: STRANGER })).status, 403, 'another workspace');
  assertEquals((await call('GET', `${PATH}/today`, { user: STAFF })).body.code, 'not_member');
});

Deno.test('seat: a pilot has tests only, a paused or ended workspace gives the reason', async () => {
  assertEquals((await setup({ org: { status: 'pilot' } }).call('GET', `${PATH}/today`, { user: EMPLOYEE })).body.reason, 'pilot');
  assertEquals((await setup({ org: { status: 'suspended' } }).call('GET', `${PATH}/today`, { user: EMPLOYEE })).body.reason, 'paused');
  assertEquals((await setup({ org: { contract_ends_at: '2020-01-01T00:00:00Z' } }).call('GET', `${PATH}/today`, { user: EMPLOYEE })).body.reason, 'contract_ended');
  const paused = setup({ org: { status: 'suspended' } });
  assertEquals((await paused.call('POST', `${PATH}/reviews`, { user: EMPLOYEE, body: {} })).body.code, 'org_suspended');
  assertEquals((await paused.call('PUT', `${PATH}/settings`, { user: EMPLOYEE, body: { weekly_goal: 2 } })).body.code, 'org_suspended');
});

// ---------------------------------------------------------------------------
// The deck
// ---------------------------------------------------------------------------

function completeLesson(db: FakeDb, code: string, memberId = M.employee) {
  db.rows('company_lesson_progress').push({ id: crypto.randomUUID(), org_id: ORG, member_id: memberId, user_id: EMPLOYEE, track_code: 'hospitality', lesson_code: code, status: 'completed', score: 90, minutes: 10, attempts: 1, data: {}, completed_at: new Date().toISOString() });
}

Deno.test('deck: fills from completed lessons and visible glossary terms, never another department or workspace', async () => {
  const { db, call } = setup();
  const lesson = TRACKS.find((track) => track.code === 'hospitality')!.lessons[0];
  completeLesson(db, lesson.code);
  completeLesson(db, lesson.code, M.colleague);
  db.rows('company_glossary_terms').push(
    { id: uuidN(901), org_id: ORG, term: 'Rack rate', meaning: 'Full price', ru: 'Тариф', uz: 'Tarif', department_id: null },
    { id: uuidN(902), org_id: ORG, term: 'Sales only', meaning: 'Hidden', ru: null, uz: null, department_id: SALES },
    { id: uuidN(903), org_id: OTHER_ORG, term: 'Other company', meaning: 'Hidden', ru: null, uz: null, department_id: null },
  );
  const { body, status } = await call('GET', `${PATH}/deck`, { user: EMPLOYEE });
  assertEquals(status, 200);
  const fronts = body.cards.map((row: { front: string }) => row.front);
  assert(fronts.includes(lesson.phrases[0].en));
  assert(fronts.includes(lesson.words[0].en));
  assert(fronts.includes('Rack rate'));
  assertFalse(fronts.includes('Sales only'));
  assertFalse(fronts.includes('Other company'));
  assertEquals(db.rows('company_coach_cards').every((row) => row.member_id === M.employee), true, 'only the caller');
  const before = db.rows('company_coach_cards').length;
  await call('GET', `${PATH}/deck`, { user: EMPLOYEE });
  assertEquals(db.rows('company_coach_cards').length, before, 'a second sync adds nothing');
});

Deno.test('deck: an empty deck starts with phrases for the job, removed cards stay removed', async () => {
  const { db, call } = setup();
  const first = await call('GET', `${PATH}/deck`, { user: EMPLOYEE });
  assertEquals(first.body.cards.length, 12);
  assert(first.body.cards.every((row: { source: string }) => row.source === 'phrasebook'));
  completeLesson(db, TRACKS.find((track) => track.code === 'hospitality')!.lessons[0].code);
  const second = await call('GET', `${PATH}/deck`, { user: EMPLOYEE });
  const lessonCard = second.body.cards.find((row: { source: string }) => row.source === 'lesson');
  assertEquals((await call('DELETE', `${PATH}/cards/${lessonCard.id}`, { user: EMPLOYEE })).status, 200);
  completeLesson(db, TRACKS.find((track) => track.code === 'hospitality')!.lessons[1].code);
  const third = await call('GET', `${PATH}/deck`, { user: EMPLOYEE });
  assertFalse(third.body.cards.some((row: { id: string }) => row.id === lessonCard.id), 'the sync leaves it out');
  const own = await call('POST', `${PATH}/cards`, { user: EMPLOYEE, body: { front: 'See you at the gate' } });
  await call('DELETE', `${PATH}/cards/${own.body.card.id}`, { user: EMPLOYEE });
  assertFalse(db.rows('company_coach_cards').some((row) => row.id === own.body.card.id), 'own text goes for good');
});

Deno.test('deck: reads a large deck in pages, within its limit', async () => {
  const { db, call } = setup();
  db.maxRows = 1000;
  seedCards(db, 2500);
  const { body } = await call('GET', `${PATH}/deck`, { user: EMPLOYEE });
  assertEquals(body.cards.length, 2500);
  assertEquals(body.max, MAX_DECK);
  assertEquals(body.stats.new, 2500);
});

Deno.test('cards: saving twice is harmless, a removed one comes back fresh, bad input is refused', async () => {
  const { db, call } = setup();
  const saved = await call('POST', `${PATH}/cards`, { user: EMPLOYEE, body: { phrase: 'phone-01' } });
  assertEquals(saved.status, 200);
  assertEquals(saved.body.already, false);
  assertEquals(saved.body.card.source, 'phrasebook');
  const twice = await call('POST', `${PATH}/cards`, { user: EMPLOYEE, body: { phrase: 'phone-01' } });
  assertEquals(twice.body.already, true);
  const same = await call('POST', `${PATH}/cards`, { user: EMPLOYEE, body: { front: ' good morning,  how can I help you ' } });
  assertEquals(same.body.already, true, 'case, spacing and punctuation do not make a new card');
  assertEquals(db.rows('company_coach_cards').length, 1);
  assertEquals((await call('POST', `${PATH}/cards`, { user: EMPLOYEE, body: { phrase: 'nope' } })).status, 404);
  assertEquals((await call('POST', `${PATH}/cards`, { user: EMPLOYEE, body: { front: 'a\u0000b' } })).status, 400);
  assertEquals((await call('POST', `${PATH}/cards`, { user: EMPLOYEE, body: { front: '!!!' } })).status, 400);
  const marker = card(uuidN(50), M.employee, { source: 'lesson', front: 'Old lesson phrase', front_key: 'old lesson phrase', deleted_at: new Date().toISOString(), suspended: true, reps: 9, stability: 40 });
  db.rows('company_coach_cards').push(marker);
  const back = await call('POST', `${PATH}/cards`, { user: EMPLOYEE, body: { front: 'Old lesson phrase', source: 'own' } });
  assertEquals(back.body.already, false);
  assertEquals(back.body.card.reps, 0);
  assertEquals(back.body.card.suspended, false);
  // Two tabs racing: the database refuses the second insert, and the answer stays friendly.
  const racing = setup();
  const insert = racing.db.from.bind(racing.db);
  let raced = false;
  racing.db.from = (table: string) => {
    const query = insert(table);
    if (table === 'company_coach_cards' && !raced) {
      const original = query.maybeSingle.bind(query);
      query.maybeSingle = () => {
        raced = true;
        const result = original();
        racing.db.rows('company_coach_cards').push(card(uuidN(77), M.employee, { front: 'Racing', front_key: 'racing' }));
        return result;
      };
    }
    return query;
  };
  const answer = await racing.call('POST', `${PATH}/cards`, { user: EMPLOYEE, body: { front: 'Racing' } });
  assertEquals(answer.status, 200);
  assertEquals(answer.body.already, true);
});

Deno.test('cards: editing and pausing, duplicates refused politely, nobody reaches another person\'s card', async () => {
  const { db, call } = setup();
  seedCards(db, 2);
  db.rows('company_coach_cards').push(card(uuidN(30), M.colleague));
  const edited = await call('PATCH', `${PATH}/cards/${uuidN(1)}`, { user: EMPLOYEE, body: { note: 'For the front desk', suspended: true } });
  assertEquals(edited.body.card.note, 'For the front desk');
  assertEquals(edited.body.card.suspended, true);
  assertEquals((await call('PATCH', `${PATH}/cards/${uuidN(1)}`, { user: EMPLOYEE, body: { suspended: 'yes' } })).status, 400);
  const clash = await call('PATCH', `${PATH}/cards/${uuidN(1)}`, { user: EMPLOYEE, body: { front: `Phrase ${uuidN(2).slice(-4)}` } });
  assertEquals(clash.status, 409);
  assertEquals(clash.body.code, 'card_duplicate');
  for (const [method, path] of [['PATCH', `cards/${uuidN(30)}`], ['DELETE', `cards/${uuidN(30)}`]] as const) {
    assertEquals((await call(method, `${PATH}/${path}`, { user: EMPLOYEE, body: method === 'PATCH' ? { note: 'x' } : undefined })).status, 404);
  }
  assertEquals((await review(call, uuidN(30))).status, 404);
  assertEquals((await call('PATCH', `${PATH}/cards/not-an-id`, { user: EMPLOYEE, body: {} })).status, 400);
  assertEquals(db.rows('company_coach_cards').some((row) => row.id === uuidN(30)), true);
});

Deno.test('export: a spreadsheet cannot run what is in a phrase', async () => {
  const { db, call } = setup();
  db.rows('company_coach_cards').push(card(uuidN(1), M.employee, { front: '=SUM(A1:A9)', front_key: '=sum(a1:a9)', ru: '+7 999', uz: '@cmd' }));
  const { body } = await call('GET', `${PATH}/deck/export`, { user: EMPLOYEE });
  assert(body.csv.startsWith('english,russian'));
  assertFalse(/(^|,|")=SUM/m.test(body.csv), body.csv);
  assertFalse(/(^|,|")\+7/m.test(body.csv), body.csv);
  assertFalse(/(^|,|")@cmd/m.test(body.csv), body.csv);
});

// ---------------------------------------------------------------------------
// Reviews and credit
// ---------------------------------------------------------------------------

Deno.test('queue: what is due comes first, with a few new cards a day, own phrases first', async () => {
  const { db, call } = setup();
  const day = dayNow();
  db.rows('company_coach_settings').push({ member_id: M.employee, org_id: ORG, user_id: EMPLOYEE, weekly_goal: 3, daily_minutes: 10, rest_days: [0, 6], leave: [], kudos_opt_in: false, sync_key: '0:0:' });
  for (let n = 1; n <= 3; n++) db.rows('company_coach_cards').push(card(uuidN(n), M.employee, { state: 'review', reps: 3, stability: 4, due_on: addDay(day, -n) }));
  db.rows('company_coach_cards').push(card(uuidN(4), M.employee, { state: 'review', reps: 3, stability: 4, due_on: addDay(day, 5) }));
  db.rows('company_coach_cards').push(card(uuidN(5), M.employee, { state: 'review', reps: 3, stability: 4, due_on: day, suspended: true }));
  for (let n = 10; n < 30; n++) db.rows('company_coach_cards').push(card(uuidN(n), M.employee, { source: 'lesson' }));
  db.rows('company_coach_cards').push(card(uuidN(40), M.employee, { source: 'finder' }));
  const { body } = await call('GET', `${PATH}/queue`, { user: EMPLOYEE });
  assertEquals(body.due, 3);
  assertEquals(body.cards[0].id, uuidN(3), 'most overdue first');
  assertEquals(body.cards.length, 3 + NEW_PER_DAY);
  assertEquals(body.cards[3].id, uuidN(40), 'a phrase the learner saved comes before lesson cards');
  assertFalse(body.cards.some((row: { id: string }) => row.id === uuidN(4) || row.id === uuidN(5)));
  assertEquals(body.cards[3].mode, 'intro');
});

Deno.test('review: a double click or a second tab counts once', async () => {
  const { db, call } = setup();
  seedCards(db, 1);
  const first = await review(call, uuidN(1));
  assertEquals(first.body.status, 'ok');
  assertEquals(first.body.card.reps, 1);
  assertEquals(first.body.reviewed_today, 1);
  const second = await review(call, uuidN(1));
  assertEquals(second.body.status, 'duplicate');
  assertEquals(db.rows('company_coach_log').filter((row) => row.kind === 'review').length, 1);
  assertEquals((db.rows('company_coach_cards')[0] as { reps: number }).reps, 1);
  assertEquals((await call('POST', `${PATH}/reviews`, { user: EMPLOYEE, body: { card: uuidN(1), reps: 1, grade: 9, mode: 'recall' } })).status, 400);
  assertEquals((await call('POST', `${PATH}/reviews`, { user: EMPLOYEE, body: { card: uuidN(1), reps: 1, grade: 3, mode: 'dance' } })).status, 400);
});

Deno.test('review: typing is checked on the server, whatever grade is sent', async () => {
  const { db, call } = setup();
  seedCards(db, 3, { front: 'Could you repeat that?', state: 'review', reps: 3, stability: 5, due_on: dayNow() });
  db.rows('company_coach_cards').forEach((row, index) => { row.front_key = `could you repeat that ${index}`; });
  const ask = (n: number, typed: string) => call('POST', `${PATH}/reviews`, { user: EMPLOYEE, body: { card: uuidN(n), reps: 3, mode: 'type', grade: 4, typed } });
  const exact = await ask(1, 'could you repeat that');
  assertEquals(exact.body.match, 'exact');
  assertEquals(exact.body.expected, 'Could you repeat that?');
  assertFalse(exact.body.again);
  assertEquals((await ask(2, 'could you repeet that')).body.match, 'close');
  const wrong = await ask(3, 'hello');
  assertEquals(wrong.body.match, 'wrong');
  assert(wrong.body.again);
  assertEquals(wrong.body.card.due_on, dayNow(), 'comes back today');
});

Deno.test('credit: five practice events make one glossary activity, reaching the same points as everyone else', async () => {
  const { db, call } = setup();
  seedCards(db, 12);
  for (let n = 1; n <= 4; n++) await review(call, uuidN(n));
  assertEquals(db.rows('company_activity').length, 0);
  await review(call, uuidN(5));
  await review(call, uuidN(5), 0); // A repeat counts for nothing.
  assertEquals(db.rows('company_activity').length, 1);
  assertEquals(db.rows('company_activity')[0].kind, 'glossary');
  assertEquals(db.rows('company_activity')[0].ref, 'coach:practice');
  assertEquals(db.rows('company_activity')[0].member_id, M.employee);
  for (let n = 6; n <= 10; n++) await review(call, uuidN(n));
  assertEquals(db.rows('company_activity').length, 2);
  assertEquals(db.rows('company_activity').reduce((sum, row) => sum + Number(row.points), 0), 6);
});

Deno.test('credit: more practice cannot pass the day\'s points, which it shares with glossary rounds', async () => {
  const { db, call } = setup();
  db.rows('company_activity').push({ id: 1, org_id: ORG, member_id: M.employee, user_id: EMPLOYEE, kind: 'glossary', minutes: 179, points: DAILY_POINTS - 1, ref: 'quiz', created_at: new Date().toISOString() });
  seedCards(db, 10);
  for (let n = 1; n <= 10; n++) await review(call, uuidN(n));
  const total = db.rows('company_activity').reduce((sum, row) => sum + Number(row.points), 0);
  assertEquals(total, DAILY_POINTS);
  assert(db.rows('company_activity').reduce((sum, row) => sum + Number(row.minutes), 0) <= 180);
});

// ---------------------------------------------------------------------------
// Phrase finder
// ---------------------------------------------------------------------------

const goodAi: AiCall = <T>(_request: unknown, _fallback: T) => Promise.resolve({
  status: 'ok' as const,
  data: { options: [{ english: 'Could we move the meeting to Friday?', note: 'Вежливо', back: 'Можем перенести встречу на пятницу?' }, { english: 'I need to reschedule our meeting.', note: 'Прямо', back: 'Мне нужно перенести встречу.' }] } as unknown as T,
});

Deno.test('finder: gives options with notes in the learner\'s language, keeps nothing of what was typed', async () => {
  const requests: { systemPrompt: string; feature: string; userPayload: string }[] = [];
  const ai: AiCall = <T>(request: { systemPrompt: string; feature: string; userPayload: string }, fallback: T) => {
    requests.push(request);
    return goodAi(request, fallback);
  };
  const { db, call } = setup({ ai });
  const secret = 'перенести встречу с директором завода';
  const { body } = await call('POST', `${PATH}/finder`, { user: EMPLOYEE, body: { text: secret, tone: 'formal', situation: 'meeting', locale: 'uz' } });
  assertEquals(body.status, 'ok');
  assertEquals(body.options.length, 2);
  assertEquals(body.used, 1);
  assertEquals(requests[0].feature, FEATURE);
  assert(requests[0].systemPrompt.includes('Uzbek'));
  assertFalse(JSON.stringify(db.tables).includes(secret), 'the text is not stored');
});

Deno.test('finder: when AI fails or is capped the phrasebook still answers and the search is not used up', async () => {
  const failed = setup({ ai: <T>(_request: unknown, fallback: T) => Promise.resolve({ data: fallback, status: 'failed' as const, error: 'boom' }) });
  const reply = await failed.call('POST', `${PATH}/finder`, { user: EMPLOYEE, body: { text: 'invoice is overdue' } });
  assertEquals(reply.status, 200);
  assertEquals(reply.body.status, 'ai_unavailable');
  assert(reply.body.matches.length > 0);
  assertEquals(reply.body.used, 0);
  assertFalse(JSON.stringify(reply.body).includes('boom'), 'no raw error');
  const capped = setup({ ai: goodAi, aiAllowed: () => false });
  const limited = await capped.call('POST', `${PATH}/finder`, { user: EMPLOYEE, body: { text: 'invoice is overdue' } });
  assertEquals(limited.body.status, 'ai_limit');
  assertEquals(limited.body.used, 0);
  const nothing = setup({ ai: <T>(_request: unknown, _fallback: T) => Promise.resolve({ data: { options: [] } as unknown as T, status: 'ok' as const }) });
  assertEquals((await nothing.call('POST', `${PATH}/finder`, { user: EMPLOYEE, body: { text: 'blah blah' } })).body.status, 'no_options');
});

Deno.test('finder: stops at the daily limit per person and validates input', async () => {
  const { call } = setup({ ai: goodAi });
  for (let n = 0; n < FINDER_DAILY; n++) assertEquals((await call('POST', `${PATH}/finder`, { user: EMPLOYEE, body: { text: 'hello there' } })).body.status, 'ok');
  const over = await call('POST', `${PATH}/finder`, { user: EMPLOYEE, body: { text: 'hello there' } });
  assertEquals(over.body.status, 'person_limit');
  assertEquals(over.body.limit, FINDER_DAILY);
  assertEquals((await call('POST', `${PATH}/finder`, { user: COLLEAGUE, body: { text: 'hello there' } })).body.status, 'ok', 'per person');
  assertEquals((await call('POST', `${PATH}/finder`, { user: COLLEAGUE, body: { text: 'x' } })).status, 400);
  assertEquals((await call('POST', `${PATH}/finder`, { user: COLLEAGUE, body: { text: 'hello', tone: 'rude' } })).status, 400);
  assertEquals((await call('POST', `${PATH}/finder`, { user: COLLEAGUE, body: { text: 'hello', situation: 'mars' } })).status, 400);
  assertEquals((await call('POST', `${PATH}/finder`, { user: COLLEAGUE, body: { text: 'he\uD800llo' } })).status, 400);
});

Deno.test('finder: unusable AI output is cleaned or dropped', () => {
  assertEquals(readOptions(null), []);
  assertEquals(readOptions({ options: 'no' }), []);
  assertEquals(readOptions({ options: [{ english: 'Только кириллица' }, { english: 42 }, {}] }), []);
  const cleaned = readOptions({ options: [{ english: 'Good morning.' }, { english: 'good morning.' }, { english: 'Hello.', note: 'n', back: 'b' }, { english: 'Hi.' }, { english: 'Skipped.' }] });
  assertEquals(cleaned.map((row) => row.english), ['Good morning.', 'Hello.']);
  assertEquals(cleaned[1], { english: 'Hello.', note: 'n', back: 'b' });
});

// ---------------------------------------------------------------------------
// Phrasebook and shadowing
// ---------------------------------------------------------------------------

Deno.test('phrasebook route: sends everything and remembers what is saved', async () => {
  const { call } = setup();
  await call('POST', `${PATH}/cards`, { user: EMPLOYEE, body: { phrase: 'delay-03' } });
  const { body } = await call('GET', `${PATH}/phrasebook`, { user: EMPLOYEE });
  assert(body.total >= 300);
  assertEquals(body.situations.length, SITUATIONS.length);
  assertEquals(body.saved, ['delay-03']);
  assertEquals(body.recommended, ROLE_SITUATIONS.hospitality);
});

Deno.test('shadow: compares words, labels the input, counts a phrase once a day and keeps the best score', async () => {
  const { db, call } = setup();
  const round = await call('GET', `${PATH}/shadow?situation=phone`, { user: EMPLOYEE });
  assertEquals(round.body.situation, 'phone');
  assertEquals(round.body.items.length, 8);
  assert(round.body.items.every((row: { ref: string }) => row.ref.startsWith('p:phone-')));
  assertEquals(round.body.items, (await call('GET', `${PATH}/shadow?situation=phone`, { user: EMPLOYEE })).body.items, 'stable through the day');
  const unknown = await call('GET', `${PATH}/shadow?situation=mars`, { user: EMPLOYEE });
  assertEquals(unknown.body.situation, ROLE_SITUATIONS.hospitality[0]);
  const ref = 'p:phone-05';
  const expected = findPhrase('phone-05')!.en;
  const bad = await call('POST', `${PATH}/shadow`, { user: EMPLOYEE, body: { ref, said: 'could you', input: 'speech' } });
  assertEquals(bad.body.input, 'speech');
  assertEquals(bad.body.expected, expected);
  assertFalse(bad.body.passed);
  assertEquals(bad.body.done_today, 1);
  const good = await call('POST', `${PATH}/shadow`, { user: EMPLOYEE, body: { ref, said: expected, input: 'typed' } });
  assertEquals(good.body.score, 100);
  assert(good.body.passed);
  assertEquals(good.body.done_today, 1, 'a retry is not another phrase');
  await call('POST', `${PATH}/shadow`, { user: EMPLOYEE, body: { ref, said: 'could', input: 'speech' } });
  assertEquals(db.rows('company_coach_log').find((row) => row.kind === 'shadow')!.score, 100);
  assertEquals((await call('POST', `${PATH}/shadow`, { user: EMPLOYEE, body: { ref: 'p:nope', said: 'x', input: 'speech' } })).status, 404);
  assertEquals((await call('POST', `${PATH}/shadow`, { user: EMPLOYEE, body: { ref, said: 'x', input: 'telepathy' } })).status, 400);
});

Deno.test('shadow: a lesson dialogue, from the lesson touched last', async () => {
  const { db, call } = setup();
  const hospitality = TRACKS.find((track) => track.code === 'hospitality')!;
  const first = await call('GET', `${PATH}/shadow?situation=lesson`, { user: EMPLOYEE });
  assertEquals(first.body.items[0].en, hospitality.lessons[0].dialogue.lines[0].text, 'nothing started yet: the first of the job track');
  db.rows('company_lesson_progress').push({ id: uuidN(60), org_id: ORG, member_id: M.employee, track_code: 'hospitality', lesson_code: hospitality.lessons[2].code, status: 'started', data: {}, updated_at: new Date().toISOString() });
  const { body } = await call('GET', `${PATH}/shadow?situation=lesson`, { user: EMPLOYEE });
  assertEquals(body.items.length, hospitality.lessons[2].dialogue.lines.length);
  assertEquals(body.lesson_title, hospitality.lessons[2].title);
  const said = await call('POST', `${PATH}/shadow`, { user: EMPLOYEE, body: { ref: body.items[1].ref, said: body.items[1].en, input: 'speech' } });
  assertEquals(said.body.score, 100);
  assertEquals((await call('POST', `${PATH}/shadow`, { user: EMPLOYEE, body: { ref: 'l:nope:0', said: 'x', input: 'speech' } })).status, 404);
  assertEquals((await call('POST', `${PATH}/shadow`, { user: EMPLOYEE, body: { ref: `l:${hospitality.lessons[0].code}:999`, said: 'x', input: 'speech' } })).status, 404);
});

Deno.test('shadow: a model conversation, line by line', async () => {
  const { call } = setup();
  const { body } = await call('GET', `${PATH}/shadow?situation=talk:complaint`, { user: EMPLOYEE });
  const talk = findSituation('complaint')!.dialogue!;
  assertEquals(body.items.length, talk.lines.length);
  assertEquals(body.lesson_title, talk.title);
  assertEquals(body.items[0].ru, talk.lines[0].ru);
  assertEquals((await call('POST', `${PATH}/shadow`, { user: EMPLOYEE, body: { ref: body.items[0].ref, said: talk.lines[0].en, input: 'speech' } })).body.score, 100);
  assertEquals((await call('POST', `${PATH}/shadow`, { user: EMPLOYEE, body: { ref: 'd:complaint:99', said: 'x', input: 'speech' } })).status, 404);
  assertEquals((await call('GET', `${PATH}/shadow?situation=talk:mars`, { user: EMPLOYEE })).body.situation, ROLE_SITUATIONS.hospitality[0]);
});

Deno.test('shadow: from the deck, only the person\'s own cards', async () => {
  const { db, call } = setup();
  db.rows('company_coach_cards').push(card(uuidN(1), M.employee, { reps: 2, last_reviewed_at: new Date().toISOString() }));
  db.rows('company_coach_cards').push(card(uuidN(2), M.employee, { reps: 0 }));
  db.rows('company_coach_cards').push(card(uuidN(3), M.colleague, { reps: 2, last_reviewed_at: new Date().toISOString() }));
  const { body } = await call('GET', `${PATH}/shadow?situation=deck`, { user: EMPLOYEE });
  assertEquals(body.items.map((row: { ref: string }) => row.ref), [`c:${uuidN(1)}`]);
  assertEquals((await call('POST', `${PATH}/shadow`, { user: EMPLOYEE, body: { ref: `c:${uuidN(3)}`, said: 'x', input: 'typed' } })).status, 404);
  assertEquals((await call('POST', `${PATH}/shadow`, { user: EMPLOYEE, body: { ref: `c:${uuidN(1)}`, said: 'phrase', input: 'typed' } })).status, 200);
});

// ---------------------------------------------------------------------------
// Today
// ---------------------------------------------------------------------------

Deno.test('today: builds one plan a day, fits the time, and stays the same', async () => {
  const { db, call } = setup();
  const first = await call('GET', `${PATH}/today`, { user: EMPLOYEE });
  assertEquals(first.status, 200);
  const items = first.body.plan.items;
  assert(first.body.plan.minutes >= 5 && first.body.plan.minutes <= 10);
  assertEquals(items[0].type, 'review');
  assert(items.some((item: { type: string }) => ['lesson', 'roleplay', 'writing'].includes(item.type)));
  assertEquals(items[items.length - 1].type, 'shadow');
  assertFalse(first.body.plan.finished);
  assert(first.body.phrase.en);
  assertEquals(db.rows('company_coach_plans').length, 1);
  assertEquals((await call('GET', `${PATH}/today`, { user: EMPLOYEE })).body.plan.items, items);
  assertEquals(db.rows('company_coach_plans').length, 1);
  assertEquals(db.rows('company_coach_plans')[0].day, dayNow());
});

Deno.test('today: the short plan is shorter, and settings are checked', async () => {
  const { call } = setup();
  assertEquals((await call('PUT', `${PATH}/settings`, { user: EMPLOYEE, body: { daily_minutes: 5, weekly_goal: 4, rest_days: [0] } })).body.settings.daily_minutes, 5);
  const { body } = await call('GET', `${PATH}/today`, { user: EMPLOYEE });
  assertEquals(body.plan.length, 5);
  assertEquals(body.plan.items.length, 2);
  assertEquals(body.week.goal, 4);
  assertEquals((await call('PUT', `${PATH}/settings`, { user: EMPLOYEE, body: { daily_minutes: 7 } })).status, 400);
  assertEquals((await call('PUT', `${PATH}/settings`, { user: EMPLOYEE, body: { weekly_goal: 8 } })).status, 400);
  assertEquals((await call('PUT', `${PATH}/settings`, { user: EMPLOYEE, body: { rest_days: [9] } })).status, 400);
  assertEquals((await call('PUT', `${PATH}/settings`, { user: EMPLOYEE, body: { rest_days: [0, 1, 2, 3] } })).status, 400);
});

/** Does everything in the plan for real, as the pages would. */
async function workThrough(db: FakeDb, call: ReturnType<typeof setup>['call'], items: { type: string; target?: number; lesson?: string }[]) {
  const review_ = items.find((item) => item.type === 'review');
  if (review_) {
    const queue = await call('GET', `${PATH}/queue`, { user: EMPLOYEE });
    for (const entry of queue.body.cards.slice(0, review_.target)) await review(call, entry.id, entry.reps);
  }
  for (const item of items) {
    if (item.type === 'roleplay' || item.type === 'writing') db.rows('company_activity').push({ id: db.rows('company_activity').length + 1, org_id: ORG, member_id: M.employee, user_id: EMPLOYEE, kind: item.type, minutes: 5, points: 5, ref: null, created_at: new Date().toISOString() });
    if (item.type === 'lesson') db.rows('company_lesson_progress').push({ id: crypto.randomUUID(), org_id: ORG, member_id: M.employee, track_code: 'hospitality', lesson_code: item.lesson, status: 'started', data: {}, updated_at: new Date().toISOString() });
    if (item.type === 'shadow') for (const ref of ['p:phone-01', 'p:phone-02', 'p:phone-03']) await call('POST', `${PATH}/shadow`, { user: EMPLOYEE, body: { ref, said: 'hello', input: 'typed' } });
  }
}

Deno.test('today: steps tick off from what happened, finished once, with its points once', async () => {
  const { db, call } = setup();
  const first = await call('GET', `${PATH}/today`, { user: EMPLOYEE });
  await workThrough(db, call, first.body.plan.items);
  const done = await call('GET', `${PATH}/today`, { user: EMPLOYEE });
  assert(done.body.plan.items.every((item: { done: boolean }) => item.done), JSON.stringify(done.body.plan.items));
  assert(done.body.plan.finished);
  assertEquals(db.rows('company_coach_log').filter((row) => row.kind === 'plan_done').length, 1);
  const bonus = () => db.rows('company_activity').filter((row) => row.ref === 'coach:plan').length;
  assertEquals(bonus(), 1);
  await call('GET', `${PATH}/today`, { user: EMPLOYEE });
  assertEquals(bonus(), 1, 'a reload pays nothing more');
  assert(done.body.streak.practiced_today);
  assertEquals(done.body.streak.current, 1);
});

Deno.test('today: "not today" leaves a step out, but skipping everything does not finish a plan', async () => {
  const { db, call } = setup();
  const { body } = await call('GET', `${PATH}/today`, { user: EMPLOYEE });
  for (const item of body.plan.items) assertEquals((await call('POST', `${PATH}/today/skip`, { user: EMPLOYEE, body: { index: item.index } })).status, 200);
  const skipped = await call('GET', `${PATH}/today`, { user: EMPLOYEE });
  assert(skipped.body.plan.items.every((item: { skipped: boolean }) => item.skipped));
  assertFalse(skipped.body.plan.finished);
  assertEquals((await call('POST', `${PATH}/today/skip`, { user: EMPLOYEE, body: { index: 9 } })).status, 404);
  await call('POST', `${PATH}/today/skip`, { user: EMPLOYEE, body: { index: 0, skipped: false } });
  assertFalse((await call('GET', `${PATH}/today`, { user: EMPLOYEE })).body.plan.items[0].skipped);
  assertEquals(db.rows('company_coach_log').filter((row) => row.kind === 'plan_done').length, 0);
});

Deno.test('today: weak skills from the last company test shape the plan', async () => {
  const { db, call } = setup();
  db.rows('company_attempts').push({ id: uuidN(1), org_id: ORG, assessment_id: uuidN(2), member_id: M.employee, status: 'graded', graded_at: new Date().toISOString(), overall_level: 'a2', overall_score: 40, skill_results: { speaking: { score: 20 }, reading: { score: 90 } } });
  const { modeForSkills, weakSkills } = await import('./coach/skills.ts');
  const ctx = { db, org: { id: ORG } } as unknown as Parameters<typeof weakSkills>[0];
  const member = db.rows('company_members').find((row) => row.id === M.employee) as unknown as Parameters<typeof weakSkills>[1];
  assertEquals(await weakSkills(ctx, member), ['speaking']);
  assertEquals(modeForSkills('recall', ['listening']), 'listen');
  assertEquals(modeForSkills('recall', ['writing']), 'type');
  assertEquals(modeForSkills('recall', ['speaking']), 'recall');
  assertEquals(modeForSkills('intro', ['listening']), 'intro');
  assertEquals((await call('GET', `${PATH}/today`, { user: EMPLOYEE })).status, 200);
});

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

const activityOn = (db: FakeDb, member: string, days: number, kind = 'lesson', points = 10) => db.rows('company_activity').push({
  id: db.rows('company_activity').length + 1, org_id: ORG, member_id: member, user_id: EMPLOYEE, kind, minutes: 10, points, ref: null, created_at: new Date(Date.now() - days * 86_400_000).toISOString(),
});

Deno.test('progress: streak, points and calendar come from company_activity, and tests do not hold a streak', async () => {
  const { db, call } = setup();
  await call('PUT', `${PATH}/settings`, { user: EMPLOYEE, body: { rest_days: [] } });
  activityOn(db, M.employee, 0);
  activityOn(db, M.employee, 1);
  activityOn(db, M.employee, 2, 'test', 50);
  activityOn(db, M.colleague, 2);
  const { body, status } = await call('GET', `${PATH}/progress`, { user: EMPLOYEE });
  assertEquals(status, 200);
  assertEquals(body.streak.current, 2);
  assertEquals(body.points.total, 70, 'the same points insights count, tests included');
  assertEquals(body.calendar.length, 18 * 7);
  assert(body.calendar.some((row: { day: string; status: string; minutes: number }) => row.day === dayNow() && row.status === 'practiced' && row.minutes === 10));
  assert(body.badges.length >= 10);
  assertEquals(body.consent, true);
});

Deno.test('progress: Schood English time before joining or agreeing is left out', async () => {
  const { db, call } = setup();
  const member = db.rows('company_members').find((row) => row.id === M.employee)!;
  member.consent_at = new Date(Date.now() - 2 * 86_400_000).toISOString();
  activityOn(db, M.employee, 5, 'english', 100);
  activityOn(db, M.employee, 1, 'english', 7);
  const { body } = await call('GET', `${PATH}/progress`, { user: EMPLOYEE });
  assertEquals(body.points.total, 7);
});

Deno.test('progress: then versus now shows the first and the latest test, from this workspace', async () => {
  const { db, call } = setup();
  const attempt = (id: number, at: string, level: string, score: number, skills: Record<string, unknown>, extra: Record<string, unknown> = {}) => db.rows('company_attempts').push({ id: uuidN(id), org_id: ORG, assessment_id: uuidN(100 + id), member_id: M.employee, status: 'graded', graded_at: at, overall_level: level, overall_score: score, skill_results: skills, ...extra });
  db.rows('company_assessments').push({ id: uuidN(101), org_id: ORG, title: 'Placement' }, { id: uuidN(103), org_id: ORG, title: 'Progress' });
  const none = await call('GET', `${PATH}/progress`, { user: EMPLOYEE });
  assertEquals(none.body.scores.first, null);
  attempt(1, '2026-03-01T10:00:00Z', 'a2', 40, { reading: { score: 40 }, speaking: { score: 30 } });
  const one = await call('GET', `${PATH}/progress`, { user: EMPLOYEE });
  assertEquals(one.body.scores.first.title, 'Placement');
  assertEquals(one.body.scores.latest, null);
  attempt(2, '2026-05-01T10:00:00Z', 'b1', 55, { reading: { score: 50 } }, { status: 'submitted' });
  attempt(3, '2026-07-01T10:00:00Z', 'b1', 60, { reading: { score: 62 }, speaking: { score: 48 } });
  attempt(4, '2026-08-01T10:00:00Z', 'c2', 99, {}, { org_id: OTHER_ORG, assessment_id: uuidN(999) });
  const { body } = await call('GET', `${PATH}/progress`, { user: EMPLOYEE });
  assertEquals(body.scores.tests, 2);
  assertEquals(body.scores.latest.score, 60);
  assertEquals(body.scores.skills.find((row: { skill: string }) => row.skill === 'reading'), { skill: 'reading', then: 40, now: 62 });
  assert(body.badges.find((row: { code: string }) => row.code === 'level_up').earned);
});

Deno.test('leave: protects a streak within limits, and ends early', async () => {
  const { db, call } = setup();
  const day = dayNow();
  assertEquals((await call('POST', `${PATH}/leave`, { user: EMPLOYEE, body: { until: addDay(day, 61) } })).status, 400);
  assertEquals((await call('POST', `${PATH}/leave`, { user: EMPLOYEE, body: { until: addDay(day, -1) } })).status, 400);
  assertEquals((await call('POST', `${PATH}/leave`, { user: EMPLOYEE, body: { until: '2030-02-31' } })).status, 400);
  const on = await call('POST', `${PATH}/leave`, { user: EMPLOYEE, body: { until: addDay(day, 10) } });
  assertEquals(on.body.settings.leave, { from: day, to: addDay(day, 10) });
  const moved = await call('POST', `${PATH}/leave`, { user: EMPLOYEE, body: { until: addDay(day, 20) } });
  assertEquals(moved.body.settings.leave.to, addDay(day, 20));
  assertEquals((db.rows('company_coach_settings')[0].leave as unknown[]).length, 1, 'extending does not stack');
  assertEquals((await call('DELETE', `${PATH}/leave`, { user: EMPLOYEE })).body.settings.leave, null);
});

// ---------------------------------------------------------------------------
// Team feed
// ---------------------------------------------------------------------------

const join = (call: ReturnType<typeof setup>['call'], user: string, joined = true) => call('PUT', `${PATH}/team/membership`, { user, body: { joined } });
const kudos = (call: ReturnType<typeof setup>['call'], user: string, to: string, extra: Record<string, unknown> = {}) => call('POST', `${PATH}/team/kudos`, { user, body: { to, message: 'great_call', ...extra } });

Deno.test('team: nobody is in the feed until they join, and only people who joined can be thanked', async () => {
  const { db, call } = setup();
  const before = await call('GET', `${PATH}/team`, { user: EMPLOYEE });
  assertEquals(before.body.joined, false);
  assertEquals(before.body.people, []);
  assertEquals((await kudos(call, EMPLOYEE, M.colleague)).body.code, 'kudos_opt_in_required');
  await join(call, EMPLOYEE);
  assertEquals((await kudos(call, EMPLOYEE, M.colleague)).status, 404, 'the colleague has not joined');
  await join(call, COLLEAGUE);
  const roster = await call('GET', `${PATH}/team`, { user: EMPLOYEE });
  assertEquals(roster.body.people, [{ id: M.colleague, name: 'Person employee' }]);
  assertFalse(JSON.stringify(roster.body).includes('@hotel.example'), 'no addresses');
  assertEquals((await kudos(call, EMPLOYEE, M.employee)).body.code, 'kudos_self');
  assertEquals((await kudos(call, EMPLOYEE, M.stranger)).status, 404, 'another workspace');
  assertEquals((await kudos(call, EMPLOYEE, M.colleague, { message: 'bribe' })).status, 400);
  assertEquals((await kudos(call, EMPLOYEE, M.colleague, { note: 'x'.repeat(141) })).status, 400);
  assertEquals((await kudos(call, EMPLOYEE, M.colleague, { note: 'Thanks for the Tuesday call' })).status, 200);
  const dup = await kudos(call, EMPLOYEE, M.colleague);
  assertEquals(dup.status, 409);
  assertEquals(dup.body.code, 'kudos_duplicate');
  const seen = await call('GET', `${PATH}/team`, { user: COLLEAGUE });
  assertEquals(seen.body.feed.length, 1);
  assertEquals(seen.body.feed[0].about_me, true);
  assertEquals(seen.body.feed[0].note, 'Thanks for the Tuesday call');
  assertEquals(db.rows('company_activity').length, 0, 'kudos earn no points');
});

Deno.test('team: a seat is not needed, but a pilot has no feed; leaving works even when paused', async () => {
  const { call } = setup();
  assertEquals((await join(call, NO_SEAT)).status, 200);
  assertEquals((await call('GET', `${PATH}/team`, { user: NO_SEAT })).body.joined, true);
  const pilot = setup({ org: { status: 'pilot' } });
  assertEquals((await pilot.call('GET', `${PATH}/team`, { user: EMPLOYEE })).body.reason, 'pilot');
  assertEquals((await join(pilot.call, EMPLOYEE)).body.reason, 'pilot');
  const paused = setup({ org: { status: 'suspended' } });
  assertEquals((await join(paused.call, EMPLOYEE)).body.reason, 'paused');
  assertEquals((await join(paused.call, EMPLOYEE, false)).status, 200);
});

Deno.test('team: the daily limit holds', async () => {
  const { db, call } = setup();
  await join(call, EMPLOYEE);
  await join(call, COLLEAGUE);
  for (let n = 0; n < KUDOS_DAILY; n++) db.rows('company_coach_kudos').push({ id: uuidN(n), org_id: ORG, from_member: M.employee, to_member: uuidN(500 + n), kind: 'kudos', message: 'keep_going', day: dayNow(), created_at: new Date().toISOString() });
  const over = await kudos(call, EMPLOYEE, M.colleague);
  assertEquals(over.status, 429);
  assertEquals(over.body.code, 'kudos_limit');
});

Deno.test('team: leaving removes a person\'s entries from view; removed colleagues disappear', async () => {
  const { db, call } = setup();
  await join(call, EMPLOYEE);
  await join(call, COLLEAGUE);
  await kudos(call, EMPLOYEE, M.colleague);
  assertEquals((await call('GET', `${PATH}/team`, { user: EMPLOYEE })).body.feed.length, 1);
  await join(call, COLLEAGUE, false);
  assertEquals((await call('GET', `${PATH}/team`, { user: EMPLOYEE })).body.feed.length, 0);
  await join(call, COLLEAGUE);
  db.rows('company_members').find((row) => row.id === M.colleague)!.status = 'removed';
  const after = await call('GET', `${PATH}/team`, { user: EMPLOYEE });
  assertEquals(after.body.feed.length, 0);
  assertEquals(after.body.people, []);
});

Deno.test('team: HR switches it off for everyone, sees the feed without joining, and can remove entries', async () => {
  const { db, call } = setup();
  await join(call, EMPLOYEE);
  await join(call, COLLEAGUE);
  await kudos(call, EMPLOYEE, M.colleague);
  const hrView = await call('GET', `${PATH}/team`, { user: HR });
  assertEquals(hrView.body.joined, false);
  assertEquals(hrView.body.can_manage, true);
  assertEquals(hrView.body.feed.length, 1);
  assert(hrView.body.feed[0].can_remove);
  assertEquals((await call('PUT', `${PATH}/team/settings`, { user: EMPLOYEE, body: { kudos_off: true } })).status, 403);
  assertEquals((await call('PUT', `${PATH}/team/settings`, { user: HR, body: { kudos_off: 'yes' } })).status, 400);
  assertEquals((await call('PUT', `${PATH}/team/settings`, { user: HR, body: { kudos_off: true } })).status, 200);
  assert(db.rows('company_audit').some((row) => row.action === 'coach.feed_switched'));
  const off = await call('GET', `${PATH}/team`, { user: EMPLOYEE });
  assertEquals(off.body.enabled, false);
  assertEquals(off.body.feed, []);
  assertEquals((await kudos(call, COLLEAGUE, M.employee)).body.code, 'kudos_off');
  assertEquals((await join(call, NO_SEAT)).body.code, 'kudos_off');
  await call('PUT', `${PATH}/team/settings`, { user: HR, body: { kudos_off: false } });
  const entry = (await call('GET', `${PATH}/team`, { user: HR })).body.feed[0];
  assertEquals((await call('DELETE', `${PATH}/team/kudos/${entry.id}`, { user: NO_SEAT })).status, 403, 'not their entry');
  assertEquals((await call('DELETE', `${PATH}/team/kudos/${entry.id}`, { user: HR })).status, 200);
  assert(db.rows('company_audit').some((row) => row.action === 'coach.kudos_removed'));
  assertEquals((await call('DELETE', `${PATH}/team/kudos/${entry.id}`, { user: HR })).status, 404);
});

Deno.test('team: the person it is about can remove it; an entry of another workspace is out of reach', async () => {
  const { db, call } = setup();
  await join(call, EMPLOYEE);
  await join(call, COLLEAGUE);
  await kudos(call, EMPLOYEE, M.colleague);
  const entry = db.rows('company_coach_kudos')[0];
  assertEquals((await call('DELETE', `${PATH}/team/kudos/${entry.id}`, { user: COLLEAGUE })).status, 200);
  db.rows('company_coach_kudos').push({ id: uuidN(70), org_id: OTHER_ORG, from_member: M.stranger, to_member: M.stranger, kind: 'kudos', message: 'keep_going', day: dayNow(), created_at: new Date().toISOString() });
  assertEquals((await call('DELETE', `${PATH}/team/kudos/${uuidN(70)}`, { user: HR })).status, 404);
  assertEquals((await call('GET', `${PATH}/team`, { user: HR })).body.feed.length, 0);
});

Deno.test('team: a badge is shared only by its owner, once, when earned and with consent', async () => {
  const { db, call } = setup();
  await join(call, EMPLOYEE);
  const share = () => call('POST', `${PATH}/team/share`, { user: EMPLOYEE, body: { badge: 'lessons_5' } });
  assertEquals((await share()).body.code, 'badge_not_earned');
  assertEquals((await call('POST', `${PATH}/team/share`, { user: EMPLOYEE, body: { badge: 'nope' } })).status, 400);
  for (const lesson of TRACKS.find((track) => track.code === 'hospitality')!.lessons.slice(0, 5)) completeLesson(db, lesson.code);
  const member = db.rows('company_members').find((row) => row.id === M.employee)!;
  const consent = member.consent_at;
  member.consent_at = null;
  assertEquals((await share()).body.code, 'consent_required');
  member.consent_at = consent;
  assertEquals((await share()).status, 200);
  const again = await share();
  assertEquals(again.status, 409);
  assertEquals(again.body.code, 'badge_already_shared');
  const feed = (await call('GET', `${PATH}/team`, { user: EMPLOYEE })).body.feed;
  assertEquals(feed[0].kind, 'badge');
  assertEquals(feed[0].badge, 'lessons_5');
});

Deno.test('team: the feed holds no learning detail, however much the person has practised', async () => {
  const { db, call } = setup();
  await join(call, EMPLOYEE);
  await join(call, COLLEAGUE);
  seedCards(db, 6);
  for (let n = 1; n <= 6; n++) await review(call, uuidN(n));
  activityOn(db, M.colleague, 0);
  await kudos(call, EMPLOYEE, M.colleague);
  const { body } = await call('GET', `${PATH}/team`, { user: COLLEAGUE });
  assertEquals(Object.keys(body.feed[0]).sort(), ['about_me', 'badge', 'can_remove', 'created_at', 'from', 'id', 'kind', 'message', 'mine', 'note', 'to']);
  assertFalse(JSON.stringify(body).includes('level'));
  assertFalse(JSON.stringify(body).includes('Phrase'));
});

Deno.test('privacy: HR has no route to a learner\'s deck, reviews or progress', async () => {
  const { db, call } = setup();
  seedCards(db, 1);
  // HR has no seat, and even with one the routes answer about the caller alone.
  assertEquals((await call('GET', `${PATH}/deck`, { user: HR })).status, 402);
  db.rows('company_members').find((row) => row.id === M.hr)!.seat = true;
  const own = await call('GET', `${PATH}/deck`, { user: HR });
  assertFalse(own.body.cards.some((row: { id: string }) => row.id === uuidN(1)));
  assertEquals((await call('GET', `${PATH}/progress?member=${M.employee}`, { user: HR })).body.points.total, 0);
});

Deno.test('adoption: totals only, from people who agreed, no small groups, managers see their department', async () => {
  const { db, call } = setup();
  assertEquals((await call('GET', `${PATH}/adoption`, { user: EMPLOYEE })).status, 403);
  const few = await call('GET', `${PATH}/adoption`, { user: HR });
  assertEquals(few.body.enough, false);
  assertEquals(few.body.overall, null);
  const person = (n: number, department: string | null, extra: Record<string, unknown> = {}) => db.rows('company_members').push({
    id: uuidN(800 + n), org_id: ORG, user_id: uuidN(700 + n), email: `p${n}@hotel.example`, full_name: `Secret Name ${n}`, role: 'employee', department_id: department, job_role: 'general', status: 'active', seat: true,
    level: null, level_score: null, level_source: null, level_at: null, target_level: null, target_date: null, consent_at: '2026-01-01T00:00:00.000Z', joined_at: '2026-01-01T00:00:00.000Z', ...extra,
  });
  for (let n = 1; n <= 3; n++) person(n, FRONT);
  person(4, SALES, { consent_at: null });
  activityOn(db, uuidN(801), 0);
  activityOn(db, uuidN(801), 1);
  activityOn(db, uuidN(801), 2);
  activityOn(db, uuidN(802), 3);
  activityOn(db, uuidN(804), 0); // Not sharing: never counted.
  activityOn(db, uuidN(803), 0, 'test');
  const { body } = await call('GET', `${PATH}/adoption`, { user: HR });
  assertEquals(body.enough, true);
  // The employee, the colleague in sales and the three new people share; the seatless and the unconsented do not count.
  assertEquals(body.sharing, 5);
  assertEquals(body.not_sharing, 1);
  assertEquals(body.overall.active_week, 2);
  assertEquals(body.overall.regular_week, 1);
  assertEquals(body.weeks.length, 8);
  assertFalse(JSON.stringify(body).includes('Secret Name'), 'no names');
  assertFalse(JSON.stringify(body).includes(uuidN(801)), 'no member ids');
  const front = body.departments.find((row: { id: string }) => row.id === FRONT);
  assertEquals(front.hidden, false);
  const small = body.departments.find((row: { id: string }) => row.id === SALES);
  assertEquals(small.hidden, true);
  assertEquals(small.people, undefined);
  db.rows('company_members').find((row) => row.id === M.colleague)!.role = 'manager';
  const manager = await call('GET', `${PATH}/adoption`, { user: COLLEAGUE });
  assertEquals(manager.body.enough, false, 'the manager sees only sales, which is too small');
  assertEquals(manager.body.overall, null);
});

Deno.test('coach routes all declare org access under their own namespace', () => {
  for (const route of coach) {
    assert(route.path.startsWith('orgs/:org/coach/'), route.path);
    assertEquals(route.access, 'org', route.path);
  }
  const keys = coach.map((route) => `${route.method} ${route.path}`);
  assertEquals(new Set(keys).size, keys.length);
});
