import { equal, ID, ok, SECRET } from '../fixture.test.ts';
import { engageModule } from './mod.ts';
import { DAY, engageFixture } from './test-helpers.ts';

// Progress, XP, streaks, quests, freezes, settings and wellbeing through the real
// handler. Each test states the healthy-habit rule it enforces.

Deno.test('no plan, no engagement layer; the Passport stays open', async () => {
  const f = engageFixture();
  equal((await f.get('state', 'tok-free')).status, 402);
  equal((await f.get('state', 'tok-free')).body.code, 'plan_required');
  equal((await f.get('passport', 'tok-free')).status, 200, 'your own record is yours without a plan');
  equal((await f.get('state', 'tok-plus')).status, 200);
});

Deno.test('rule: XP and streaks count verified learning only; opening screens earns nothing', async () => {
  const f = engageFixture();
  // Open every screen a learner can open.
  for (const path of ['state', 'journeys', 'stories', 'league', 'path', 'passport', 'memory', 'events', 'squad']) equal((await f.get(path)).status, 200, path);
  await f.learn('tok-plus', [
    { kind: 'lesson_viewed', area: 'coach', feature: 'B1' },
    { kind: 'goal_set', area: 'coach', feature: 'B1' },
    { kind: 'check_failed', area: 'coach', feature: 'B1', skill: 'ielts.reading' },
  ]);
  let state = (await f.get('state')).body;
  equal([state.xp.total, state.streak.current, state.league.joined], [0, 0, false], 'nothing verified, nothing earned, no league');
  await f.learn('tok-plus', [f.scored('B1', 'ielts.speaking', 5), f.passed('B1', 'ielts.reading', 0)]);
  state = (await f.get('state')).body;
  equal(state.xp.today >= 20, true, `15 + 5 from two verified acts (plus quest bonuses), got ${state.xp.today}`);
  equal(state.streak.current, 1);
  equal(state.first_step, true);
  equal(state.league.joined, true, 'earning XP puts you in this week’s league');
  // Reading the state again never counts the same events twice.
  const again = (await f.get('state')).body;
  equal(again.xp.total, state.xp.total);
});

Deno.test('rule: at most 600 XP a day from learning', async () => {
  const f = engageFixture();
  await f.learn('tok-plus', Array.from({ length: 12 }, () => ({ kind: 'mock_finished' as const, area: 'coach' as const, feature: 'B1', skill: 'ielts.mock', verified_minutes: 30, score: 6 })));
  const state = (await f.get('state')).body;
  const memory = await f.store();
  const eventXp = (await memory.xpSince(ID.plus, '2026-11-01')).filter((row) => row.source === 'event').reduce((sum, row) => sum + row.xp, 0);
  equal(eventXp, 600, 'twelve 90-XP mocks are capped at 600');
  ok(state.wellbeing.enough_today, '360 verified minutes is more than enough for a day');
});

Deno.test('quests: three a day, bonus XP once, only for verified learning', async () => {
  const f = engageFixture();
  const first = (await f.get('state')).body;
  equal(first.quests.length, 3);
  ok(first.quests.every((quest: { done: boolean }) => !quest.done), 'nothing done before learning');
  await f.learn('tok-plus', [f.scored('B1', 'ielts.speaking', 10), f.passed('B1', 'ielts.reading', 2), f.passed('B1', 'ielts.reading', 2), f.passed('E8', 'english.reading.story', 2, { ref: 'story:tashkent_lights:e01' }), { kind: 'drill_finished', area: 'coach', feature: 'B1', skill: 'ielts.vocabulary', verified_minutes: 5, score: 9 }, f.scored('B1', 'ielts.writing', 6)]);
  const done = (await f.get('state')).body;
  const doneCount = done.quests.filter((quest: { done: boolean }) => quest.done).length;
  ok(doneCount >= 1, 'the time quest is done');
  const memory = await f.store();
  const bonuses = (await memory.xpSince(ID.plus, '2026-11-01')).filter((row) => row.source === 'quest');
  equal(bonuses.length, doneCount + (doneCount === 3 ? 1 : 0), 'one bonus per done quest (+ the all-three bonus)');
  await f.get('state');
  equal((await memory.xpSince(ID.plus, '2026-11-01')).filter((row) => row.source === 'quest').length, bonuses.length, 'never twice');
});

Deno.test('rule: under 18 (or unknown age) never pays for a streak; adults may buy one freeze a week', async () => {
  const f = engageFixture();
  const minor = await f.post('freeze-buy', {});
  equal([minor.status, minor.body.code], [403, 'adults_only'], 'unknown age is treated as under 18');
  equal((await f.get('state')).body.streak.can_buy_freeze, false);
  await f.post('settings', { birth_date: '2010-05-01' });
  equal((await f.post('freeze-buy', {})).body.code, 'adults_only', 'a 16-year-old cannot buy one');
  const locked = await f.post('settings', { birth_date: '1990-05-01' });
  equal([locked.status, locked.body.code], [409, 'birth_date_locked'], 'the date of birth cannot be changed to unlock it');

  const g = engageFixture();
  await g.adult();
  const before = (await g.json('GET', 'core/me')).body.credits.total;
  const bought = await g.post('freeze-buy', {});
  equal(bought.status, 200, JSON.stringify(bought.body));
  equal(bought.body.streak.freezes, 1);
  equal((await g.json('GET', 'core/me')).body.credits.total, before - bought.body.credits, 'charged exactly the price');
  equal((await g.post('freeze-buy', {})).body.code, 'freeze_week_used', 'one a week');
  g.advance(7 * DAY);
  equal((await g.post('freeze-buy', {})).status, 200);
  g.advance(7 * DAY);
  equal((await g.post('freeze-buy', {})).body.code, 'freeze_limit', 'at most two held');
});

Deno.test('rule: no public board by default under 18; minors can show first name and initial at most', async () => {
  const f = engageFixture();
  equal((await f.get('settings')).body.settings.leaderboard, 'hidden');
  equal((await f.post('settings', { leaderboard: 'public' })).body.code, 'adults_only');
  equal((await f.post('settings', { leaderboard: 'masked' })).body.settings.leaderboard, 'masked', 'a minor may opt in to a masked name');
  const g = engageFixture();
  await g.adult();
  equal((await g.get('settings')).body.settings.leaderboard, 'masked', 'adults appear as first name and initial');
});

Deno.test('rule: an optional daily time limit stops engage practice for the day; "enough today" after a long session', async () => {
  const f = engageFixture();
  equal((await f.post('settings', { daily_limit_minutes: 25 })).status, 400, 'only the listed choices');
  equal((await f.post('settings', { daily_limit_minutes: 20 })).body.settings.daily_limit_minutes, 20);
  await f.learn('tok-plus', [f.scored('B2', 'speaking.roleplay', 12), f.scored('B2', 'speaking.roleplay', 10)]);
  const state = (await f.get('state')).body;
  equal([state.wellbeing.limit_reached, state.wellbeing.enough_today], [true, false]);
  const story = await f.post('story-answer', { arc: 'tashkent_lights', episode: 'e01', answers: { q1: 'b', q2: 'b', q3: 'b' } });
  equal([story.status, story.body.code], [403, 'daily_limit_reached']);
  f.advance(DAY);
  equal((await f.post('story-answer', { arc: 'tashkent_lights', episode: 'e01', answers: { q1: 'b', q2: 'b', q3: 'b' } })).status, 200, 'a new day');
  await f.learn('tok-plus', Array.from({ length: 4 }, () => f.scored('B2', 'speaking.roleplay', 16)));
  equal((await f.get('state')).body.wellbeing.enough_today, true);
});

Deno.test('P1 seam: a limit a parent sets cannot be changed by the child', async () => {
  const f = engageFixture();
  await f.get('settings');
  const memory = await f.store();
  const { setChildDailyLimit } = await import('./mod.ts');
  const ctx = { repo: f.memory.repository, now: () => new Date(), audit: () => Promise.resolve() } as unknown as Parameters<typeof setChildDailyLimit>[0];
  equal(await setChildDailyLimit(ctx, ID.plus, 30), { daily_limit_minutes: 30, limit_set_by: 'parent' });
  equal((await memory.profile(ID.plus)).dailyLimitMinutes, 30);
  equal((await f.post('settings', { daily_limit_minutes: null })).body.code, 'limit_locked');
  equal((await f.get('settings')).body.settings.limit_set_by, 'parent');
});

Deno.test('parents see time, not content (P1 seam); the person sees the same in usage', async () => {
  const f = engageFixture();
  await f.learn('tok-plus', [f.scored('B1', 'ielts.speaking', 7)]);
  const usage = (await f.get('usage')).body;
  equal([usage.total_minutes, usage.active_days, usage.days.length], [7, 1, 7]);
  ok(!JSON.stringify(usage).includes('ielts.speaking'), 'no content or skills, only time and activity counts');
});

Deno.test('the Telegram worker reads progress for the linked person, and only service routes', async () => {
  const f = engageFixture();
  await f.learn('tok-plus', [f.scored('B1', 'ielts.speaking', 5)]);
  const response = await f.worker('engage/state', 'GET', ID.plus, '700100');
  equal(response.status, 200);
  equal((await response.json()).streak.current, 1);
  equal((await f.worker('engage/passport', 'GET', ID.plus, '700100')).status, 403, 'the Passport is web-only');
  equal((await f.worker('engage/state', 'GET', ID.plus, '999', undefined, SECRET)).status, 403, 'only the linked chat');
});

Deno.test('routes: the public pages are marked public for the core router; delivery routes are open to the worker', () => {
  const routes = engageModule.routes as Record<string, { public?: boolean; service?: boolean }>;
  equal([routes['passport-view'].public, routes.verify.public], [true, true]);
  equal([routes.tick.service, routes.outbox.service, routes['outbox-ack'].service], [true, true, true]);
  ok(!routes['freeze-buy'].service && !routes['passport-link'].service && !routes['talent-consent'].service, 'nothing that spends or shares is open to the worker');
});
