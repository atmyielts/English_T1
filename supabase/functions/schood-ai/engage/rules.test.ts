import { equal, ok } from '../fixture.test.ts';
import { CERT_EXAMS, examProblems } from './content/certificates.ts';
import { JOURNEYS, journeyProblems } from './content/journeys.ts';
import { message } from './content/messages.ts';
import { pathProblems } from './content/path.ts';
import { seasonOf, tournamentScore } from './content/seasons.ts';
import { storyProblems, STORY_ARCS } from './content/stories.ts';
import {
  ageOn, DAILY_XP_CAP, dailyQuests, displayName, eventXp, FREEZE_XP_STEP, isAdult, leaderboardVisibility, localParts, schoolKey, squadStreak, streakState, weakSpot, weeklyChallenge,
} from './rules.ts';
import { generatedProblems } from './stories.ts';
import { voiceMetrics, writingMetrics } from './samples.ts';
import type { DayRow, EventRow } from './types.ts';

// The pure rules of the engagement layer, each healthy-habit rule on its own.

/** The XP table shared with the SQL test (supabase/tests/schood-ai-engage.integration.sql). */
export const XP_CASES: [string, number, boolean, number][] = [
  ['turn_scored', 5, true, 15], ['check_passed', 0, true, 5], ['drill_finished', 10, true, 30], ['mock_finished', 45, true, 90],
  ['outcome_recorded', 0, true, 50], ['check_failed', 0, false, 0], ['lesson_viewed', 0, false, 0], ['goal_set', 0, false, 0], ['turn_scored', 240, true, 65],
];

Deno.test('XP comes only from verified learning; opening something earns nothing', () => {
  for (const [kind, minutes, verified, xp] of XP_CASES) equal(eventXp(kind as never, minutes, verified), xp, `${kind}/${minutes}`);
  equal(eventXp('turn_scored', 10, false), 0, 'an unverified row never earns, whatever its kind');
  ok(DAILY_XP_CAP === 600, 'the daily cap is 600');
});

const days = (list: [string, number, number?][]): DayRow[] => list.map(([day, xp, events = 1]) => ({ day, xp, minutes: 10, events }));

Deno.test('streak: freezes are earned with XP and each covers one missed day', () => {
  // 260 XP on day 1 earns a freeze; day 2 missed is covered (kept, not counted); day 3 continues it.
  const one = streakState(days([['2026-11-01', 260], ['2026-11-03', 20]]), [], '2026-11-03');
  equal([one.current, one.freezes, one.frozenDays], [2, 0, ['2026-11-02']]);
  // Without enough XP the same gap breaks the streak.
  const broken = streakState(days([['2026-11-01', 40], ['2026-11-03', 20]]), [], '2026-11-03');
  equal(broken.current, 1);
  // At most two are held, however much XP.
  const rich = streakState(days([['2026-11-01', 5 * FREEZE_XP_STEP]]), [], '2026-11-01');
  equal([rich.freezes, rich.nextFreezeInXp], [2, null]);
});

Deno.test('streak: a bought freeze protects later days only; nobody repairs a broken streak with money', () => {
  // Bought on day 2 (ahead of the miss on day 3): it covers day 3.
  const ahead = streakState(days([['2026-11-01', 20], ['2026-11-02', 20], ['2026-11-04', 20]]), ['2026-11-02'], '2026-11-04');
  equal([ahead.current, ahead.frozenDays], [3, ['2026-11-03']]);
  // Bought on day 4 after missing day 3: the streak already broke on day 3 and stays broken.
  const after = streakState(days([['2026-11-01', 20], ['2026-11-02', 20], ['2026-11-04', 20]]), ['2026-11-04'], '2026-11-04');
  equal([after.current, after.freezes], [1, 1]);
});

Deno.test('streak: the comeback restores a 3+ day streak after 3 activities in 3 days', () => {
  const base: [string, number, number?][] = [['2026-11-01', 20], ['2026-11-02', 20], ['2026-11-03', 20], ['2026-11-04', 20]];
  const open = streakState(days([...base, ['2026-11-06', 20, 1]]), [], '2026-11-06');
  equal([open.comeback?.status, open.comeback?.oldStreak, open.comeback?.done], ['open', 4, 1]);
  const won = streakState(days([...base, ['2026-11-06', 20, 2], ['2026-11-07', 20, 1]]), [], '2026-11-07');
  equal([won.comeback?.status, won.current], ['won', 6]);
  equal(streakState(days(base), [], '2026-11-05').atRisk, true, 'a running streak with nothing today is at risk');
});

Deno.test('quests and the weekly challenge are deterministic per person and day', () => {
  const a = dailyQuests('u1', '2026-11-02', null), b = dailyQuests('u1', '2026-11-02', null);
  equal(a, b);
  equal(a.length, 3);
  equal(a[0], 'minutes_10', 'the first quest is always about a little verified time');
  ok(!a.includes('weak_spot'), 'no weak-spot quest without a weak spot');
  equal(weeklyChallenge('2026-11-02'), weeklyChallenge('2026-11-02'));
});

Deno.test('age: unknown is under 18; boards hide minors by default and never show their full name', () => {
  equal(ageOn('2008-11-03', '2026-11-02'), 17);
  equal(isAdult({ birthDate: null }, '2026-11-02'), false);
  equal(isAdult({ birthDate: '2008-11-02' }, '2026-11-02'), true);
  equal(leaderboardVisibility({ birthDate: null, leaderboard: null }, '2026-11-02'), 'hidden');
  equal(leaderboardVisibility({ birthDate: '1990-01-01', leaderboard: null }, '2026-11-02'), 'masked');
  equal(displayName('masked', 'Dilnoza Karimova'), 'Dilnoza K.');
  equal(displayName('hidden', 'Dilnoza Karimova'), 'Learner');
  equal(displayName('masked', 'someone@example.com'), 'Learner', 'never an email');
  equal(schoolKey('  School  No.110 '), 'school no 110');
});

Deno.test('squad streak counts days when at least half of the squad learned', () => {
  const active = new Map([['2026-11-02', 2], ['2026-11-01', 3], ['2026-10-31', 1]]);
  equal(squadStreak(active, 4, '2026-11-02'), { current: 2, todayCount: 2, target: 2 });
  equal(squadStreak(active, 5, '2026-11-02').target, 3);
});

Deno.test('weak spot: the skill with most failed checks in the window', () => {
  const event = (kind: EventRow['kind'], skill: string): EventRow => ({ id: 1, userId: 'u', workspaceId: null, area: 'coach', kind, verified: kind !== 'check_failed', feature: 'B1', skill, verifiedMinutes: 0, score: null, outcome: null, ref: null, source: 'web', createdAt: '2026-11-01T00:00:00Z' });
  equal(weakSpot([event('check_failed', 'ielts.listening.s3'), event('check_failed', 'ielts.listening.s4'), event('check_passed', 'ielts.listening.s1'), event('check_passed', 'ielts.reading')]), 'ielts.listening');
  equal(weakSpot([event('check_passed', 'ielts.reading')]), null);
});

Deno.test('local time follows the person’s zone; Tashkent by default', () => {
  equal(localParts(new Date('2026-11-02T18:30:00Z'), 'Asia/Tashkent'), { day: '2026-11-02', hour: 23, weekday: 0 });
  equal(localParts(new Date('2026-11-02T18:30:00Z'), 'Europe/London').hour, 18);
});

Deno.test('authored content passes its checks: journeys, the lifetime path, stories, certificate exams', () => {
  equal(journeyProblems(), []);
  equal(pathProblems(JOURNEYS.map((journey) => journey.key)), []);
  equal(storyProblems(), []);
  equal(examProblems(), []);
  for (const key of ['ielts_55_70', 'sales_90', 'speaking_60']) ok(JOURNEYS.some((journey) => journey.key === key), `journey ${key}`);
  const drama = STORY_ARCS.find((arc) => arc.key === 'tashkent_lights')!, sales = STORY_ARCS.find((arc) => arc.key === 'first_month_sales')!;
  equal([...new Set(drama.episodes.map((episode) => episode.level))], ['A1', 'A2', 'B1', 'B2', 'C1'], 'the drama runs from A1 to C1');
  for (const level of ['A1', 'A2', 'B1', 'B2', 'C1']) ok(drama.episodes.filter((episode) => episode.level === level && episode.scene).length >= 2, `${level} has written episodes`);
  ok(sales.episodes.filter((episode) => episode.scene).length >= 8, 'the sales month has eight written days');
  equal(CERT_EXAMS.map((exam) => exam.key), ['speaking_b1', 'speaking_b2', 'sales_l1', 'sales_l2']);
});

Deno.test('AI-written episodes are checked like T2 keys before anyone sees them', () => {
  const good = {
    title: 'Coffee and Sophie', scene: Array.from({ length: 80 }, (_, index) => `word${index}`).join(' ') + '.',
    listen: [{ speaker: 'A', line: 'Hello there.' }, { speaker: 'B', line: 'Hi.' }, { speaker: 'A', line: 'Tea?' }],
    questions: [
      { id: 'q1', mode: 'reading' as const, prompt: 'Who comes in?', options: [{ id: 'a', text: 'Sophie' }, { id: 'b', text: 'Timur' }, { id: 'c', text: 'Rustam' }], answer: 'a' },
      { id: 'q2', mode: 'reading' as const, prompt: 'What does she order?', options: [{ id: 'a', text: 'Tea' }, { id: 'b', text: 'Coffee' }, { id: 'c', text: 'Water' }], answer: 'a' },
      { id: 'q3', mode: 'listening' as const, prompt: 'What is offered?', options: [{ id: 'a', text: 'Tea' }, { id: 'b', text: 'Cake' }, { id: 'c', text: 'Juice' }], answer: 'a' },
    ],
    choice: { prompt: 'What next?', options: [{ id: 'x', label: 'Stay' }, { id: 'y', label: 'Go' }] }, cliffhanger: 'Then the door opens again.',
  };
  equal(generatedProblems(good, 'A1'), []);
  ok(generatedProblems({ ...good, questions: good.questions.map((question) => ({ ...question, answer: 'z' })) }, 'A1').length > 0, 'a key outside the options fails');
  ok(generatedProblems({ ...good, questions: good.questions.map((question) => ({ ...question, mode: 'reading' as const })) }, 'A1').includes('no listening question'), 'a listening check is required');
  ok(generatedProblems({ ...good, scene: `${good.scene} https://example.com` }, 'A1').includes('links or markup'), 'links are refused');
});

Deno.test('messages carry real numbers and no fake urgency', () => {
  const text = message('streak_risk', 'en', { streak: 12, freeze_line: '' }).text;
  ok(text.includes('12-day streak'), text);
  for (const kind of ['streak_risk', 'winback_2', 'winback_7', 'winback_21', 'journey_risk', 'league_result'] as const) {
    for (const locale of ['en', 'uz', 'ru'] as const) {
      const body = message(kind, locale, { streak: 3, xp: 120, days: 4, minutes: 6, progress_line: 'x', journey: 'J', journey_key: 'ielts_55_70', chapter: 2, left: 1, done: 2, total: 3, rank: 4, tier: 'Gold', outcome: 'x', freeze_line: '' }).text;
      ok(!/last chance|hurry|only today|expires|последний шанс|скорее|oxirgi imkon/i.test(body), `${kind}/${locale}: ${body}`);
      ok(!/\{[a-z_]+\}/.test(body), `${kind}/${locale} filled: ${body}`);
    }
  }
});

Deno.test('seasons, tournaments and measured sample numbers', () => {
  equal(seasonOf(new Date('2026-11-02T06:00:00Z')).key, 'season:2026-q4');
  equal(seasonOf(new Date('2026-12-31T20:00:00Z')).key, 'season:2027-q1', 'Tashkent midnight decides the quarter');
  equal(tournamentScore([6, 7]), null, 'three scored turns at least');
  equal(tournamentScore([90, 80, 70, 60, 50, 40]), 70);
  const voice = voiceMetrics('um I think uh the city is very beautiful and green', 10_000);
  equal([voice.words, voice.words_per_minute], [11, 54]);
  ok(voice.filler_per_100 > 0, 'fillers counted');
  equal(writingMetrics('One sentence here. Another sentence, longer than before!').sentences, 2);
});
