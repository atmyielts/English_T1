import { COMEBACK_ACTIVITIES, COMEBACK_DAYS, MAX_FREEZES, MIN_COMEBACK_STREAK } from '../../_shared/english-streak.ts';
import { leagueName, leagueWeek } from '../../_shared/english-xp.ts';
import type { LearningEventKind } from '../types.ts';
import type { DayRow, EngageProfile, EventRow, LeaderboardVisibility, LevelBand } from './types.ts';

// The pure rules of the engagement layer. No storage, no clock: every function
// takes what it needs, so each healthy-habit rule is testable on its own.
//
// Reused from Schood English (supabase/functions/_shared):
//   - english-xp.ts: league tiers, groups of 30, top 7 up / bottom 5 down, ranking
//     ties, league weeks (Monday, Tashkent time) and masked names ("Aziza K.");
//   - english-streak.ts: at most 2 freezes held and the "win it back" comeback
//     (a broken streak of 3+ days comes back after 3 activities in 3 days).
// Changed on purpose: here a freeze is earned with XP (or bought by an adult) and
// each freeze covers one missed day, because each one was paid for with learning.

export const DAY_MS = 86_400_000;
export const DEFAULT_TIME_ZONE = 'Asia/Tashkent';
export const DEFAULT_NOTIFY_HOUR = 19;
export const QUIET_START = 22;
export const QUIET_END = 8;

// --- Time ------------------------------------------------------------------------------
const TIME_ZONE = /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$/;
export function validTimeZone(zone: unknown): zone is string {
  if (typeof zone !== 'string' || !TIME_ZONE.test(zone) || zone.length > 60) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: zone }); return true; } catch { return false; }
}
const formatters = new Map<string, Intl.DateTimeFormat>();
/** Local calendar day (YYYY-MM-DD), hour and weekday (0 = Monday) of a moment in a time zone. */
export function localParts(at: Date, zone: string): { day: string; hour: number; weekday: number } {
  let format = formatters.get(zone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short' });
    formatters.set(zone, format);
  }
  const parts = Object.fromEntries(format.formatToParts(at).map((part) => [part.type, part.value]));
  const weekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts.weekday);
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) % 24, weekday };
}
export const localDay = (at: Date, zone: string) => localParts(at, zone).day;
export const addDays = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
export const isDay = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);
/** League weeks start on Monday 00:00 in Tashkent for everyone, so a group shares one week. */
export const weekStart = (at: Date) => leagueWeek(at).start_date;
export const weekEndsAt = (start: string) => new Date(Date.parse(`${start}T00:00:00Z`) - 5 * 3_600_000 + 7 * DAY_MS);
/** The quiet window (22:00–08:00 local) that no engagement message may fall in. */
export const inQuietHours = (hour: number) => hour >= QUIET_START || hour < QUIET_END;

// --- Age -------------------------------------------------------------------------------------
/** Full years on a local day. */
export function ageOn(birthDate: string, today: string): number {
  const [by, bm, bd] = birthDate.split('-').map(Number), [ty, tm, td] = today.split('-').map(Number);
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}
/** Adults are people who told us a birth date at least 18 years ago. Unknown means under 18. */
export const isAdult = (profile: Pick<EngageProfile, 'birthDate'>, today: string) => !!profile.birthDate && ageOn(profile.birthDate, today) >= 18;
export const MIN_AGE = 7;
export function validBirthDate(value: unknown, today: string): value is string {
  if (!isDay(value)) return false;
  const age = ageOn(value, today);
  return age >= MIN_AGE && age <= 110;
}
/** Under 18 nobody appears on a public board unless they chose to; adults appear as "Aziza K.". */
export const leaderboardVisibility = (profile: Pick<EngageProfile, 'birthDate' | 'leaderboard'>, today: string): LeaderboardVisibility =>
  profile.leaderboard ?? (isAdult(profile, today) ? 'masked' : 'hidden');
/** What other people see for someone on a league or board. */
export function displayName(visibility: LeaderboardVisibility, fullName: string | null): string {
  if (visibility === 'hidden') return 'Learner';
  if (visibility === 'public') {
    const clean = (fullName ?? '').replace(/\s+/g, ' ').trim();
    return clean && !clean.includes('@') ? clean.slice(0, 40) : 'Learner';
  }
  return leagueName({ full: fullName ?? '' });
}

// --- XP: verified learning only -----------------------------------------------------------------
/**
 * XP for one learning event. Unverified kinds (opening a lesson, setting a goal, a
 * failed check) earn nothing. Verified kinds earn a base for the act plus two per
 * verified minute (at most 30 minutes counted per act). The database computes the
 * same number in ai_engage_event_xp; the ingest never trusts a number from an area.
 */
export const EVENT_XP_BASE: Record<LearningEventKind, number> = {
  turn_scored: 5, check_passed: 5, drill_finished: 10, mock_finished: 30, outcome_recorded: 50,
  check_failed: 0, lesson_viewed: 0, goal_set: 0,
};
export const VERIFIED_KINDS: readonly LearningEventKind[] = ['turn_scored', 'check_passed', 'drill_finished', 'mock_finished', 'outcome_recorded'];
export const XP_PER_MINUTE = 2;
export const MINUTES_COUNTED_PER_EVENT = 30;
/** A day's XP from learning stops here, so grinding past a healthy day earns nothing more. */
export const DAILY_XP_CAP = 600;
export function eventXp(kind: LearningEventKind, verifiedMinutes: number, verified: boolean): number {
  if (!verified || !VERIFIED_KINDS.includes(kind)) return 0;
  const minutes = Math.max(0, Math.min(MINUTES_COUNTED_PER_EVENT, Math.floor(verifiedMinutes)));
  return EVENT_XP_BASE[kind] + XP_PER_MINUTE * minutes;
}

// --- Streak, freezes, comeback -------------------------------------------------------------------
export const FREEZE_XP_STEP = 250;
export const FREEZE_MAX = MAX_FREEZES;
export interface Comeback { status: 'open' | 'won' | 'lost'; oldStreak: number; starts: string; ends: string; done: number; needed: number; wonOn: string | null }
export interface StreakState {
  current: number;
  longest: number;
  freezes: number;
  maxFreezes: number;
  /** XP still needed for the next earned freeze; null while holding the maximum. */
  nextFreezeInXp: number | null;
  frozenDays: string[];
  todayDone: boolean;
  atRisk: boolean;
  comeback: Comeback | null;
  /** Local days since the last verified learning (0 = today). Null before any learning. */
  idleDays: number | null;
  lastActiveDay: string | null;
}

/**
 * Replays every local day from the first verified learning to today. A day counts
 * when it has at least one verified event. Freezes: every 250 XP earns one, an adult
 * may buy one ahead of time, at most 2 are held, and each covers one missed day
 * automatically. Nobody can pay to repair a streak after it broke: the way back is
 * learning (3 activities in the 3 days after the break restores it).
 */
export function streakState(days: DayRow[], purchases: string[], today: string): StreakState {
  const byDay = new Map(days.filter((day) => day.events > 0 && day.day <= today).map((day) => [day.day, day]));
  const active = [...byDay.keys()].sort();
  const bought = new Map<string, number>();
  for (const day of purchases) bought.set(day, (bought.get(day) ?? 0) + 1);
  const empty: StreakState = { current: 0, longest: 0, freezes: 0, maxFreezes: FREEZE_MAX, nextFreezeInXp: FREEZE_XP_STEP, frozenDays: [], todayDone: false, atRisk: false, comeback: null, idleDays: null, lastActiveDay: null };
  const firstPurchase = [...bought.keys()].sort()[0];
  const first = [active[0], firstPurchase].filter(Boolean).sort()[0];
  if (!first) return empty;

  let streak = 0, longest = 0, freezes = 0, cumulative = 0, nextEarn = FREEZE_XP_STEP, windowDays = 0;
  const frozen: string[] = [];
  let comeback: Comeback | null = null;
  const earn = (xp: number) => {
    cumulative += xp;
    while (cumulative >= nextEarn) { freezes = Math.min(FREEZE_MAX, freezes + 1); nextEarn += FREEZE_XP_STEP; }
  };
  const breakStreak = (day: string) => {
    const old = streak;
    streak = 0;
    windowDays = 0;
    comeback = old >= MIN_COMEBACK_STREAK ? { status: 'open', oldStreak: old, starts: addDays(day, 1), ends: addDays(day, COMEBACK_DAYS), done: 0, needed: COMEBACK_ACTIVITIES, wonOn: null } : null;
  };

  for (let day = first; day <= today; day = addDays(day, 1)) {
    freezes = Math.min(FREEZE_MAX, freezes + (bought.get(day) ?? 0));
    const entry = byDay.get(day), count = entry?.events ?? 0, isToday = day === today;
    const open = comeback as Comeback | null;
    if (open && open.status === 'open' && day > open.ends) open.status = 'lost';
    if (open && open.status === 'open' && day >= open.starts) {
      if (count > 0) {
        streak += 1; windowDays += 1; open.done += count; earn(entry!.xp);
        if (open.done >= open.needed) { open.done = open.needed; open.status = 'won'; open.wonOn = day; streak = open.oldStreak + windowDays; }
      } else if (!isToday) {
        streak = 0;
      }
      longest = Math.max(longest, streak);
      continue;
    }
    if (count > 0) { streak += 1; earn(entry!.xp); longest = Math.max(longest, streak); continue; }
    if (isToday || streak === 0) continue;
    if (freezes > 0) { freezes -= 1; frozen.push(day); continue; }
    breakStreak(day);
  }
  const todayDone = (byDay.get(today)?.events ?? 0) > 0;
  const last = active.at(-1) ?? null;
  const shown = comeback as Comeback | null;
  return {
    current: streak, longest, freezes, maxFreezes: FREEZE_MAX,
    nextFreezeInXp: freezes >= FREEZE_MAX ? null : nextEarn - cumulative,
    frozenDays: frozen.filter((day) => day >= addDays(today, -30)),
    todayDone, atRisk: !todayDone && streak > 0,
    comeback: shown && (shown.status === 'open' || (shown.status === 'won' && !!shown.wonOn && shown.wonOn >= addDays(today, -2))) ? { ...shown } : null,
    idleDays: last ? daysBetween(last, today) : null,
    lastActiveDay: last,
  };
}

// --- Daily quests and the weekly challenge ------------------------------------------------------------
export const QUEST_XP = 10;
export const ALL_QUESTS_XP = 20;
export const CHALLENGE_XP = 50;
/** A small deterministic hash, so the day's quests are the same on every device and bot. */
export function seededIndex(seed: string, modulo: number): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) { hash ^= seed.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return Math.abs(hash) % modulo;
}

export type QuestKey = 'minutes_10' | 'checks_3' | 'scored_turn' | 'story_episode' | 'new_skill' | 'drill' | 'weak_spot' | 'minutes_20';
interface QuestRule { key: QuestKey; target: number; progress(today: EventRow[], context: { yesterdaySkills: Set<string>; weakSpot: string | null }): number; requiresWeakSpot?: boolean }
const verifiedOf = (events: EventRow[]) => events.filter((event) => event.verified);
export const QUEST_RULES: Record<QuestKey, QuestRule> = {
  minutes_10: { key: 'minutes_10', target: 10, progress: (today) => verifiedOf(today).reduce((sum, event) => sum + event.verifiedMinutes, 0) },
  minutes_20: { key: 'minutes_20', target: 20, progress: (today) => verifiedOf(today).reduce((sum, event) => sum + event.verifiedMinutes, 0) },
  checks_3: { key: 'checks_3', target: 3, progress: (today) => today.filter((event) => event.kind === 'check_passed').length },
  scored_turn: { key: 'scored_turn', target: 1, progress: (today) => today.filter((event) => event.kind === 'turn_scored').length },
  story_episode: { key: 'story_episode', target: 1, progress: (today) => today.filter((event) => event.kind === 'check_passed' && event.feature === 'E8').length },
  new_skill: { key: 'new_skill', target: 1, progress: (today, { yesterdaySkills }) => new Set(verifiedOf(today).map((event) => event.skill?.split('.').slice(0, 2).join('.')).filter((skill): skill is string => !!skill && !yesterdaySkills.has(skill))).size },
  drill: { key: 'drill', target: 1, progress: (today) => today.filter((event) => event.kind === 'drill_finished').length },
  weak_spot: { key: 'weak_spot', target: 1, requiresWeakSpot: true, progress: (today, { weakSpot }) => weakSpot ? verifiedOf(today).filter((event) => event.skill?.startsWith(weakSpot)).length : 0 },
};
const QUEST_POOL: QuestKey[] = ['checks_3', 'scored_turn', 'story_episode', 'new_skill', 'drill', 'weak_spot', 'minutes_20'];

/** The first step (any verified learning) plus three quests: always one about time, two picked for the day. */
export function dailyQuests(userId: string, day: string, weakSpot: string | null): QuestKey[] {
  const pool = QUEST_POOL.filter((key) => !QUEST_RULES[key].requiresWeakSpot || weakSpot);
  const picked: QuestKey[] = ['minutes_10'];
  let salt = 0;
  while (picked.length < 3 && salt < 50) {
    const key = pool[seededIndex(`${userId}:${day}:${salt++}`, pool.length)];
    if (!picked.includes(key) && !(key === 'minutes_20' && picked.includes('minutes_10'))) picked.push(key);
  }
  return picked;
}
export interface QuestView { key: QuestKey; target: number; progress: number; done: boolean; xp: number }
export function questProgress(keys: QuestKey[], today: EventRow[], context: { yesterdaySkills: Set<string>; weakSpot: string | null }): QuestView[] {
  return keys.map((key) => {
    const rule = QUEST_RULES[key], progress = Math.min(rule.target, rule.progress(today, context));
    return { key, target: rule.target, progress, done: progress >= rule.target, xp: QUEST_XP };
  });
}

export type ChallengeKey = 'days_5' | 'xp_300' | 'checks_15' | 'stories_3' | 'minutes_90' | 'turns_10';
interface ChallengeRule { key: ChallengeKey; target: number; progress(week: { days: DayRow[]; events: EventRow[] }): number }
export const CHALLENGES: Record<ChallengeKey, ChallengeRule> = {
  days_5: { key: 'days_5', target: 5, progress: ({ days }) => days.filter((day) => day.events > 0).length },
  xp_300: { key: 'xp_300', target: 300, progress: ({ days }) => days.reduce((sum, day) => sum + day.xp, 0) },
  checks_15: { key: 'checks_15', target: 15, progress: ({ events }) => events.filter((event) => event.kind === 'check_passed').length },
  stories_3: { key: 'stories_3', target: 3, progress: ({ events }) => events.filter((event) => event.kind === 'check_passed' && event.feature === 'E8').length },
  minutes_90: { key: 'minutes_90', target: 90, progress: ({ days }) => days.reduce((sum, day) => sum + day.minutes, 0) },
  turns_10: { key: 'turns_10', target: 10, progress: ({ events }) => events.filter((event) => event.kind === 'turn_scored').length },
};
const CHALLENGE_ORDER: ChallengeKey[] = ['days_5', 'xp_300', 'checks_15', 'stories_3', 'minutes_90', 'turns_10'];
/** One challenge per league week, the same for everyone that week (so squads and friends share it). */
export const weeklyChallenge = (week: string): ChallengeKey => CHALLENGE_ORDER[seededIndex(`challenge:${week}`, CHALLENGE_ORDER.length)];

// --- Weak spots (E9) ------------------------------------------------------------------------------------
/** The skill (two levels, `ielts.speaking`) with the most failed checks and low scores in the window, if any. */
export function weakSpot(events: EventRow[]): string | null {
  const tally = new Map<string, { failed: number; passed: number }>();
  for (const event of events) {
    if (!event.skill) continue;
    const skill = event.skill.split('.').slice(0, 2).join('.');
    const entry = tally.get(skill) ?? { failed: 0, passed: 0 };
    if (event.kind === 'check_failed') entry.failed += 1;
    else if (event.verified) entry.passed += 1;
    tally.set(skill, entry);
  }
  let best: string | null = null, worst = 0;
  for (const [skill, { failed, passed }] of tally) {
    const ratio = failed / Math.max(1, failed + passed);
    if (failed >= 2 && ratio > worst) { worst = ratio; best = skill; }
  }
  return worst >= 0.34 ? best : null;
}

// --- Squads (E6) ----------------------------------------------------------------------------------------------
export const SQUAD_MAX = 5;
export const SQUAD_GOAL_DEFAULT = 150;
/** A squad day counts when at least half the members (rounded up, at least 2) did verified learning. */
export const squadDayTarget = (members: number) => Math.max(2, Math.ceil(members / 2));
export function squadStreak(activeByDay: Map<string, number>, members: number, today: string): { current: number; todayCount: number; target: number } {
  const target = squadDayTarget(members), todayCount = activeByDay.get(today) ?? 0;
  let current = todayCount >= target ? 1 : 0;
  for (let day = addDays(today, -1); (activeByDay.get(day) ?? 0) >= target; day = addDays(day, -1)) current += 1;
  return { current, todayCount, target };
}

// --- Healthy-habit limits ----------------------------------------------------------------------------------------
/** "You've done enough today" after this much verified learning in a day. */
export const ENOUGH_MINUTES = 60;
export const ENOUGH_EVENTS = 40;
export const enoughToday = (day: DayRow | undefined) => !!day && (day.minutes >= ENOUGH_MINUTES || day.events >= ENOUGH_EVENTS);
export const DAILY_LIMIT_CHOICES = [15, 20, 30, 45, 60, 90, 120] as const;
export const limitReached = (profile: Pick<EngageProfile, 'dailyLimitMinutes'>, day: DayRow | undefined) => !!profile.dailyLimitMinutes && (day?.minutes ?? 0) >= profile.dailyLimitMinutes;

// --- Level bands for leagues ("a similar level") ------------------------------------------------------------------
export const LEVEL_BANDS: readonly LevelBand[] = ['foundation', 'core', 'advanced', 'open'];
export function bandForCefr(level: unknown): LevelBand {
  if (typeof level !== 'string') return 'open';
  const value = level.toUpperCase();
  if (value === 'A1' || value === 'A2') return 'foundation';
  if (value === 'B1' || value === 'B2') return 'core';
  if (value === 'C1' || value === 'C2') return 'advanced';
  return 'open';
}

// --- Regions for regional boards (Uzbekistan's regions, plus elsewhere) --------------------------------------------
export const REGIONS = ['tashkent_city', 'tashkent', 'andijan', 'bukhara', 'fergana', 'jizzakh', 'kashkadarya', 'khorezm', 'namangan', 'navoi', 'samarkand', 'surkhandarya', 'syrdarya', 'karakalpakstan', 'abroad'] as const;
export type Region = (typeof REGIONS)[number];
export const isRegion = (value: unknown): value is Region => typeof value === 'string' && (REGIONS as readonly string[]).includes(value);
/** One key per school however people type it ("School 110", "school  110 "). */
export function schoolKey(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const key = raw.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  return key.length >= 2 ? key : null;
}
