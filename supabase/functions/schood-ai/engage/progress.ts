import { creditPrice } from '../../../../packages/ai-core/src/mod.ts';
import { bool, integer, oneOf, optionalText, record, uuid } from '../input.ts';
import type { RequestContext } from '../types.ts';
import { begin, dayEnd, dayStart, refuse, requireSchoodAdmin, type Engage } from './base.ts';
import { leagueSummary } from './league.ts';
import {
  addDays, ALL_QUESTS_XP, CHALLENGE_XP, CHALLENGES, DAILY_LIMIT_CHOICES, DAILY_XP_CAP, dailyQuests, ENOUGH_MINUTES, enoughToday, isAdult, isRegion, leaderboardVisibility,
  LEVEL_BANDS, limitReached, questProgress, REGIONS, schoolKey, streakState, validBirthDate, validTimeZone, weakSpot, weeklyChallenge,
} from './rules.ts';
import type { ProfilePatch } from './store.ts';
import type { DayRow, EngageProfile } from './types.ts';

// E5 streaks, daily quests and the weekly challenge, freezes, the engage settings
// (time, quiet messages, age, boards, daily limit) and the shared progress state
// every engage screen and the bots start from.

export interface ProgressCore {
  days: DayRow[];
  today: DayRow | undefined;
  streak: ReturnType<typeof streakState>;
  totalXp: number;
  weekXp: number;
}

/** Counts new verified learning, then reads the person's days, XP and streak. */
export async function progressCore(e: Engage): Promise<ProgressCore> {
  await e.b.repo.ingest(e.userId, e.now);
  const [days, buys, totalXp] = await Promise.all([e.b.repo.allDays(e.userId), e.b.repo.freezeBuys(e.userId), e.b.repo.totalXp(e.userId)]);
  const streak = streakState(days, buys.map((buy) => buy.day), e.today);
  const weekXp = (await e.b.repo.xpSince(e.userId, e.week)).filter((row) => row.weekStart === e.week).reduce((sum, row) => sum + row.xp, 0);
  return { days, today: days.find((day) => day.day === e.today), streak, totalXp, weekXp };
}

/** Today's quests and this week's challenge, awarding their bonus once when done. */
export async function questsAndChallenge(e: Engage) {
  const zone = e.profile.timeZone;
  const [todayEvents, yesterdayEvents, recent] = await Promise.all([
    e.b.repo.events(e.userId, dayStart(e.today, zone), e.now),
    e.b.repo.events(e.userId, dayStart(addDays(e.today, -1), zone), dayStart(e.today, zone)),
    e.b.repo.events(e.userId, dayStart(addDays(e.today, -21), zone), e.now),
  ]);
  const spot = weakSpot(recent);
  const yesterdaySkills = new Set(yesterdayEvents.filter((event) => event.verified && event.skill).map((event) => event.skill!.split('.').slice(0, 2).join('.')));
  const quests = questProgress(dailyQuests(e.userId, e.today, spot), todayEvents, { yesterdaySkills, weakSpot: spot });
  let awarded = 0;
  for (const quest of quests) if (quest.done && await e.b.repo.awardBonus(e.userId, { source: 'quest', key: `${e.today}:${quest.key}`, xp: quest.xp, day: e.today, weekStart: e.week })) awarded += quest.xp;
  const allDone = quests.every((quest) => quest.done);
  if (allDone && await e.b.repo.awardBonus(e.userId, { source: 'quest', key: `${e.today}:all`, xp: ALL_QUESTS_XP, day: e.today, weekStart: e.week })) awarded += ALL_QUESTS_XP;

  const challengeKey = weeklyChallenge(e.week), rule = CHALLENGES[challengeKey];
  const weekDays = await e.b.repo.days(e.userId, e.week, addDays(e.week, 6));
  const weekEvents = await e.b.repo.events(e.userId, dayStart(e.week, 'Asia/Tashkent'), e.now);
  const progress = Math.min(rule.target, rule.progress({ days: weekDays, events: weekEvents }));
  const challengeDone = progress >= rule.target;
  if (challengeDone && await e.b.repo.awardBonus(e.userId, { source: 'challenge', key: `${e.week}:${challengeKey}`, xp: CHALLENGE_XP, day: e.today, weekStart: e.week })) awarded += CHALLENGE_XP;
  const firstStep = todayEvents.some((event) => event.verified);
  return {
    awarded, weakSpot: spot,
    firstStep,
    quests: quests.map((quest) => ({ key: quest.key, target: quest.target, progress: quest.progress, done: quest.done, xp: quest.xp })),
    allDoneXp: ALL_QUESTS_XP,
    challenge: { key: challengeKey, target: rule.target, progress, done: challengeDone, xp: CHALLENGE_XP, ends_at: dayEnd(addDays(e.week, 6), 'Asia/Tashkent').toISOString() },
  };
}

export const streakView = (streak: ProgressCore['streak'], adult: boolean) => ({
  current: streak.current, longest: streak.longest, today_done: streak.todayDone, at_risk: streak.atRisk,
  freezes: streak.freezes, max_freezes: streak.maxFreezes, next_freeze_in_xp: streak.nextFreezeInXp, frozen_days: streak.frozenDays,
  comeback: streak.comeback ? { status: streak.comeback.status, old_streak: streak.comeback.oldStreak, starts: streak.comeback.starts, ends: streak.comeback.ends, done: streak.comeback.done, needed: streak.comeback.needed } : null,
  // Under 18 nobody is offered a paid freeze; adults may buy one a week with credits.
  can_buy_freeze: adult && streak.freezes < streak.maxFreezes,
  freeze_credits: creditPrice('streak.freeze').credits,
});

export const wellbeingView = (profile: EngageProfile, today: DayRow | undefined) => ({
  minutes_today: today?.minutes ?? 0,
  xp_today: today?.xp ?? 0,
  xp_cap: DAILY_XP_CAP,
  enough_today: enoughToday(today),
  enough_minutes: ENOUGH_MINUTES,
  daily_limit_minutes: profile.dailyLimitMinutes,
  limit_reached: limitReached(profile, today),
  limit_set_by: profile.limitSetBy,
});

export const profileView = (profile: EngageProfile, today: string) => ({
  adult: isAdult(profile, today),
  age_known: !!profile.birthDate,
  // Read-only here: time zone and preferred hour are set in Settings → Notifications (core/notify-prefs).
  time_zone: profile.timeZone,
  notify_hour: profile.notifyHour,
  region: profile.region,
  school: profile.school,
  leaderboard: leaderboardVisibility(profile, today),
  leaderboard_chosen: profile.leaderboard !== null,
  league_opt_out: profile.leagueOptOut,
  daily_limit_minutes: profile.dailyLimitMinutes,
  limit_set_by: profile.limitSetBy,
  offers_muted: profile.offersMuted,
  level_band: profile.levelBand,
  locale: profile.locale,
});

// --- Settings ----------------------------------------------------------------------------
export async function getSettings(ctx: RequestContext) {
  const e = await begin(ctx);
  return { settings: profileView(e.profile, e.today), regions: REGIONS, daily_limit_choices: DAILY_LIMIT_CHOICES, level_bands: LEVEL_BANDS };
}

export async function saveSettings(ctx: RequestContext) {
  const e = await begin(ctx);
  const body = record(await ctx.body());
  const patch: ProfilePatch = {};
  if (body.birth_date !== undefined) {
    if (!validBirthDate(body.birth_date, e.today)) refuse('invalid_request', 'birth_date must be a real date.', 400, { field: 'birth_date' });
    if (!(await e.b.repo.setBirthDate(e.userId, body.birth_date as string))) refuse('birth_date_locked', 'Your date of birth is already set. Schood support can correct it.', 409);
  }
  for (const field of ['time_zone', 'notify_hour', 'messages'] as const) {
    if (body[field] !== undefined) refuse('use_notify_prefs', 'Time zone, hour and messages are set in core/notify-prefs.', 400, { field });
  }
  if (body.region !== undefined) patch.region = body.region === null ? null : isRegion(body.region) ? body.region : refuse('invalid_request', 'region is unknown.', 400, { field: 'region' });
  if (body.school !== undefined) patch.school = body.school === null || body.school === '' ? null : schoolKey(optionalText(body.school, 'school', { max: 80 })) ?? refuse('invalid_request', 'school is too short.', 400, { field: 'school' });
  if (body.league_opt_out !== undefined) patch.leagueOptOut = bool(body.league_opt_out, 'league_opt_out');
  if (body.offers_muted !== undefined) patch.offersMuted = bool(body.offers_muted, 'offers_muted');
  if (body.level_band !== undefined) patch.levelBand = oneOf(body.level_band, 'level_band', LEVEL_BANDS);
  const adult = isAdult(await e.b.repo.profile(e.userId), e.today);
  if (body.leaderboard !== undefined) {
    const value = body.leaderboard === null ? null : oneOf(body.leaderboard, 'leaderboard', ['public', 'masked', 'hidden'] as const);
    // Under 18 a full name never goes on a board; "masked" (first name and initial) is the most they can show.
    if (value === 'public' && !adult) refuse('adults_only', 'Under 18, boards show at most your first name and initial.', 403);
    patch.leaderboard = value;
  }
  if (body.daily_limit_minutes !== undefined) {
    if (e.profile.limitSetBy === 'parent') refuse('limit_locked', 'Your parent set this limit.', 403);
    const value = body.daily_limit_minutes === null ? null : integer(body.daily_limit_minutes, 'daily_limit_minutes', 15, 120);
    if (value !== null && !(DAILY_LIMIT_CHOICES as readonly number[]).includes(value)) refuse('invalid_request', 'daily_limit_minutes is not one of the choices.', 400, { field: 'daily_limit_minutes' });
    patch.dailyLimitMinutes = value;
    patch.limitSetBy = value === null ? null : 'self';
  }
  const profile = Object.keys(patch).length ? await e.b.repo.saveProfile(e.userId, patch) : await e.b.repo.profile(e.userId);
  return { settings: profileView(profile, e.today) };
}

/** Schood support corrects a wrong date of birth (the person cannot change it twice). */
export async function clearBirthDate(ctx: RequestContext) {
  await requireSchoodAdmin(ctx);
  const body = record(await ctx.body());
  const userId = uuid(body.user_id, 'user_id');
  const e = await begin(ctx, { locale: false });
  await e.b.repo.clearBirthDate(userId);
  await ctx.audit('engage.birth_date_cleared', {}, { type: 'user', id: userId });
  return { ok: true };
}

// --- Freeze purchase (adults only, credits) -----------------------------------------------------
export async function buyFreeze(ctx: RequestContext) {
  if (ctx.query.get('workspace_id')) refuse('personal_only', 'Freezes are bought with your own credits.', 400);
  await ctx.requireFeature('E5');
  const e = await begin(ctx);
  if (!e.adult) refuse('adults_only', 'Streak freezes are earned with XP under 18; nobody under 18 pays for a streak.', 403);
  const core = await progressCore(e);
  if (core.streak.freezes >= core.streak.maxFreezes) refuse('freeze_limit', 'You already hold the most freezes you can.', 409, { max: core.streak.maxFreezes });
  const cost = creditPrice('streak.freeze').credits;
  const reference = `engage.freeze:${e.userId}:${e.week}`;
  // One a week, also under racing requests; a reservation left by a failed attempt is resumed.
  const reserved = await e.b.repo.reserveFreeze(e.userId, { day: e.today, weekStart: e.week, reference, credits: cost });
  if (!reserved) refuse('freeze_week_used', 'One freeze can be bought per week.', 409);
  // Core's credit spend: plan, switches and adults only (age sources; a minor is never charged), once per reference.
  const receipt = await ctx.credits.spend({ key: 'streak.freeze', reference }).catch(async (cause) => { await e.b.repo.cancelFreeze(reserved!.id); throw cause; });
  try {
    await e.b.repo.confirmFreeze(reserved!.id);
  } catch (cause) {
    await receipt.refund();
    throw cause;
  }
  await ctx.audit('engage.freeze_bought', { credits: receipt.credits, week: e.week });
  const after = await progressCore(e);
  return { streak: streakView(after.streak, e.adult), credits: receipt.credits, balance: receipt.balance.total };
}

/** The progress snapshot: streak, quests, challenge, league, wellbeing. The web home and the bots read this. */
export async function progressState(e: Engage) {
  const core = await progressCore(e);
  const quests = await questsAndChallenge(e);
  const afterBonus = quests.awarded ? await progressCore(e) : core;
  const league = await leagueSummary(e, afterBonus.weekXp);
  return {
    core: afterBonus,
    view: {
      today: e.today,
      xp: { total: afterBonus.totalXp, week: afterBonus.weekXp, today: afterBonus.today?.xp ?? 0 },
      streak: streakView(afterBonus.streak, e.adult),
      first_step: quests.firstStep,
      quests: quests.quests,
      all_quests_xp: quests.allDoneXp,
      challenge: quests.challenge,
      weak_spot: quests.weakSpot,
      league: { joined: league.summary.joined, opted_out: league.summary.optedOut, tier: league.summary.tier, rank: league.summary.rank, size: league.summary.size, xp: league.summary.xp, zone: league.summary.zone, last_week: league.summary.lastWeek },
      wellbeing: wellbeingView(e.profile, afterBonus.today),
      settings: profileView(e.profile, e.today),
    },
  };
}

/** What a parent sees in the weekly brief (P1): time and verified learning, never content. */
export async function usageSummary(e: Pick<Engage, 'b' | 'today' | 'now'>, userId: string, days = 7) {
  await e.b.repo.ingest(userId, e.now);
  const from = addDays(e.today, -(days - 1));
  const [rows, all, profile] = await Promise.all([e.b.repo.days(userId, from, e.today), e.b.repo.allDays(userId), e.b.repo.profile(userId)]);
  const streak = streakState(all, (await e.b.repo.freezeBuys(userId)).map((buy) => buy.day), e.today);
  const byDay = new Map(rows.map((row) => [row.day, row]));
  const list = Array.from({ length: days }, (_, index) => addDays(from, index)).map((day) => ({ day, minutes: byDay.get(day)?.minutes ?? 0, xp: byDay.get(day)?.xp ?? 0, activities: byDay.get(day)?.events ?? 0 }));
  return {
    days: list,
    total_minutes: list.reduce((sum, row) => sum + row.minutes, 0),
    active_days: list.filter((row) => row.activities > 0).length,
    streak: streak.current,
    daily_limit_minutes: profile.dailyLimitMinutes,
    limit_reached_days: profile.dailyLimitMinutes ? list.filter((row) => row.minutes >= profile.dailyLimitMinutes!).length : 0,
  };
}
