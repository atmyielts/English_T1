// XP, weekly leagues and badges for Schood English.
//
// Pure functions only: the hub loads rows and passes them in, so every rule
// here is testable without a database. Nothing is ever reported by the
// browser: XP is derived from submitted attempts, correct answers to due
// review items, completed daily plans and finished vocabulary duels (small,
// capped per day; see english-duel.ts). Days and weeks follow Uzbekistan
// time (UTC+5, no daylight saving), like the free allowance and reminders.

import { cappedDuelXp } from "./english-duel.ts";
import { longestStreak, TODAY_SKILLS } from "./english-today.ts";

const LEARNER_UTC_OFFSET_MS = 5 * 3_600_000;
const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

// === XP ===

export const XP_PER_ACTIVITY = 10;
export const XP_SCORE_BONUS_MAX = 10;
export const XP_PER_REVIEW_CORRECT = 2;
export const XP_DAILY_GOAL_BONUS = 10;

/** A submitted primary activity (not a sub-item such as a single drill). */
export type XpAttempt = {
  id: string;
  content_item_id: string;
  /** Accuracy 0..1, or null while the activity is not scored yet. */
  score: number | null;
  submitted_at: string;
};

/** One answer to a review item. Only correct answers to due items earn XP. */
export type XpReviewAnswer = { item_id: string; correct: boolean; was_due: boolean; answered_at: string };

/** XP a finished duel gave one player (english_duel_players.xp at xp_at). */
export type XpDuel = { xp: number; at: string };

export type XpDay = { date: string; activity: number; review: number; bonus: number; duel: number; total: number };

/** The learner's calendar date (UTC+5) for an instant. */
export const learnerDate = (at: string | number | Date): string =>
  new Date(new Date(at).getTime() + LEARNER_UTC_OFFSET_MS).toISOString().slice(0, 10);

/** 10 XP for finishing an activity plus up to 10 for accuracy. */
export const activityXp = (score: number | null): number => {
  if (score === null || !Number.isFinite(score)) return XP_PER_ACTIVITY;
  return XP_PER_ACTIVITY + Math.round(Math.max(0, Math.min(1, score)) * XP_SCORE_BONUS_MAX);
};

/**
 * XP per learner day. Repeating the same activity on the same day counts once
 * (the best result), and a review item earns XP at most once a day, so XP
 * cannot be farmed by resubmitting. `goalDates` are days whose Today plan was
 * completed; they earn the bonus only if some activity was done that day.
 */
export const xpByDay = (input: {
  attempts: XpAttempt[];
  reviews?: XpReviewAnswer[];
  goalDates?: Iterable<string>;
  duels?: XpDuel[];
}): Map<string, XpDay> => {
  const bestPerItemDay = new Map<string, number>();
  for (const attempt of input.attempts) {
    const date = learnerDate(attempt.submitted_at);
    const key = `${date}|${attempt.content_item_id || attempt.id}`;
    bestPerItemDay.set(key, Math.max(bestPerItemDay.get(key) ?? 0, activityXp(attempt.score)));
  }
  const days = new Map<string, XpDay>();
  const day = (date: string): XpDay => {
    let entry = days.get(date);
    if (!entry) {
      entry = { date, activity: 0, review: 0, bonus: 0, duel: 0, total: 0 };
      days.set(date, entry);
    }
    return entry;
  };
  for (const [key, xp] of bestPerItemDay) day(key.slice(0, 10)).activity += xp;

  const reviewed = new Set<string>();
  for (const answer of input.reviews ?? []) {
    if (!answer.correct || !answer.was_due) continue;
    const date = learnerDate(answer.answered_at);
    const key = `${date}|${answer.item_id}`;
    if (reviewed.has(key)) continue;
    reviewed.add(key);
    day(date).review += XP_PER_REVIEW_CORRECT;
  }

  for (const date of new Set(input.goalDates ?? [])) {
    const entry = days.get(date);
    if (entry && entry.activity > 0) entry.bonus = XP_DAILY_GOAL_BONUS;
  }
  // Duel XP never counts toward the daily-goal bonus, and is capped per day.
  for (const [date, xp] of cappedDuelXp((input.duels ?? []).map((duel) => ({ date: learnerDate(duel.at), xp: duel.xp })))) {
    day(date).duel = xp;
  }
  for (const entry of days.values()) entry.total = entry.activity + entry.review + entry.bonus + entry.duel;
  return days;
};

export const totalXp = (days: Map<string, XpDay>): number =>
  [...days.values()].reduce((sum, entry) => sum + entry.total, 0);

/**
 * XP that one attempt added to its day's activity XP: 0 for a repeat that did
 * not beat an earlier result the same day, the difference if it did.
 */
export const xpGainedBy = (attempts: XpAttempt[], attemptId: string): number => {
  const target = attempts.find((attempt) => attempt.id === attemptId);
  if (!target) return 0;
  const date = learnerDate(target.submitted_at);
  const sameItemSameDay = attempts.filter((attempt) =>
    attempt.id !== target.id
    && (attempt.content_item_id || attempt.id) === (target.content_item_id || target.id)
    && learnerDate(attempt.submitted_at) === date
    && Date.parse(attempt.submitted_at) <= Date.parse(target.submitted_at));
  const before = sameItemSameDay.reduce((best, attempt) => Math.max(best, activityXp(attempt.score)), 0);
  return Math.max(0, activityXp(target.score) - before);
};

// === Weeks ===

/** The league week containing `now`: Monday 00:00 learner time to the next Monday. */
export const leagueWeek = (now: Date = new Date()) => {
  const local = new Date(now.getTime() + LEARNER_UTC_OFFSET_MS);
  const sinceMonday = (local.getUTCDay() + 6) % 7;
  const mondayLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - sinceMonday * DAY_MS;
  return weekFromStartDate(new Date(mondayLocal).toISOString().slice(0, 10));
};

/** Bounds of the week that starts on `startDate` (a learner-local Monday, YYYY-MM-DD). */
export const weekFromStartDate = (startDate: string) => {
  const startMs = Date.parse(`${startDate}T00:00:00Z`) - LEARNER_UTC_OFFSET_MS;
  return {
    start_date: startDate,
    starts_at: new Date(startMs).toISOString(),
    ends_at: new Date(startMs + WEEK_MS).toISOString(),
    /** Learner-local dates of the seven days, Monday first. */
    dates: Array.from({ length: 7 }, (_, index) => new Date(Date.parse(`${startDate}T00:00:00Z`) + index * DAY_MS).toISOString().slice(0, 10)),
  };
};

export const previousWeekStart = (startDate: string): string =>
  new Date(Date.parse(`${startDate}T00:00:00Z`) - WEEK_MS).toISOString().slice(0, 10);

// === Leagues ===

export const LEAGUE_TIERS = ["bronze", "silver", "gold", "sapphire", "diamond"] as const;
export type LeagueTier = (typeof LEAGUE_TIERS)[number];
export const LEAGUE_GROUP_SIZE = 30;
export const LEAGUE_PROMOTE = 7;
export const LEAGUE_DEMOTE = 5;

export const isLeagueTier = (value: unknown): value is LeagueTier =>
  typeof value === "string" && (LEAGUE_TIERS as readonly string[]).includes(value);

export type LeagueZone = "promote" | "demote" | "stay";
export type LeagueOutcome = "promoted" | "stayed" | "demoted";

export type LeagueEntry = { user_id: string; xp: number; joined_at: string };

/** Highest XP first; ties go to whoever joined the group first. */
export const rankLeague = <T extends LeagueEntry>(entries: T[]): Array<T & { rank: number }> =>
  [...entries]
    .sort((a, b) => b.xp - a.xp || Date.parse(a.joined_at) - Date.parse(b.joined_at) || a.user_id.localeCompare(b.user_id))
    .map((entry, index) => ({ ...entry, rank: index + 1 }));

/**
 * Top 7 move up if they earned XP this week. The bottom 5 move down, never
 * below Bronze, and never anyone in the top 7 (small groups).
 */
export const leagueZone = (input: { rank: number; size: number; tier: LeagueTier; xp: number }): LeagueZone => {
  const top = LEAGUE_TIERS.indexOf(input.tier) === LEAGUE_TIERS.length - 1;
  if (input.rank <= LEAGUE_PROMOTE) return input.xp > 0 && !top ? "promote" : "stay";
  if (input.tier !== "bronze" && input.rank > input.size - LEAGUE_DEMOTE) return "demote";
  return "stay";
};

export const zoneOutcome = (zone: LeagueZone): LeagueOutcome =>
  zone === "promote" ? "promoted" : zone === "demote" ? "demoted" : "stayed";

/** The tier for next week after `outcome` in `tier`. */
export const tierAfter = (tier: LeagueTier, outcome: LeagueOutcome | null): LeagueTier => {
  const index = LEAGUE_TIERS.indexOf(tier);
  const next = outcome === "promoted" ? index + 1 : outcome === "demoted" ? index - 1 : index;
  return LEAGUE_TIERS[Math.max(0, Math.min(LEAGUE_TIERS.length - 1, next))]!;
};

/** Final standings of a finished week: rank, XP and what happens next for each member. */
export const finalizeStandings = (tier: LeagueTier, entries: LeagueEntry[]) => {
  const ranked = rankLeague(entries);
  return ranked.map((entry) => ({
    user_id: entry.user_id,
    rank: entry.rank,
    xp: entry.xp,
    outcome: zoneOutcome(leagueZone({ rank: entry.rank, size: ranked.length, tier, xp: entry.xp })),
  }));
};

/**
 * What other learners see: first name and last initial ("Aziza K."), or
 * "Learner" when the learner chose to hide or no name is known. Never an email.
 */
export const leagueName = (input: { first?: unknown; last?: unknown; full?: unknown; hidden?: boolean }): string => {
  if (input.hidden) return "Learner";
  const clean = (value: unknown) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "");
  const looksLikeEmail = (value: string) => value.includes("@");
  let first = clean(input.first);
  let last = clean(input.last);
  if (!first) {
    const parts = clean(input.full).split(" ").filter(Boolean);
    first = parts[0] ?? "";
    if (!last) last = parts.length > 1 ? parts[parts.length - 1]! : "";
  }
  if (!first || looksLikeEmail(first)) return "Learner";
  const firstWord = first.split(" ")[0]!.slice(0, 24);
  const initial = last && !looksLikeEmail(last) ? Array.from(last)[0]?.toUpperCase() : "";
  return initial ? `${firstWord} ${initial}.` : firstWord;
};

export type LeagueSettings = { hidden: boolean; opted_out: boolean };

export const readLeagueSettings = (metadata: unknown): LeagueSettings => {
  const meta = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata as Record<string, unknown> : {};
  const raw = meta.league && typeof meta.league === "object" && !Array.isArray(meta.league) ? meta.league as Record<string, unknown> : {};
  return { hidden: raw.hidden === true, opted_out: raw.opted_out === true };
};

export const mergeLeagueSettings = (current: LeagueSettings, patch: Record<string, unknown>): LeagueSettings => ({
  hidden: typeof patch.hidden === "boolean" ? patch.hidden : current.hidden,
  opted_out: typeof patch.opted_out === "boolean" ? patch.opted_out : current.opted_out,
});

// === Badges ===

export type BadgeFacts = {
  activities: number;
  longest_streak: number;
  saved_words: number;
  /** Most different skills practised in one league week. */
  best_week_skills: number;
  level_ups: number;
  level_checks: number;
  perfect_scores: number;
  promotions: number;
};

type BadgeRule = { key: string; fact: keyof BadgeFacts; target: number };

/** Badge order is the display order. Each is earned once and kept. */
export const BADGES: readonly BadgeRule[] = [
  { key: "first_activity", fact: "activities", target: 1 },
  { key: "streak_3", fact: "longest_streak", target: 3 },
  { key: "streak_7", fact: "longest_streak", target: 7 },
  { key: "streak_30", fact: "longest_streak", target: 30 },
  { key: "activities_10", fact: "activities", target: 10 },
  { key: "activities_50", fact: "activities", target: 50 },
  { key: "activities_200", fact: "activities", target: 200 },
  { key: "words_50", fact: "saved_words", target: 50 },
  { key: "words_200", fact: "saved_words", target: 200 },
  { key: "all_skills_week", fact: "best_week_skills", target: TODAY_SKILLS.length },
  { key: "first_level_up", fact: "level_ups", target: 1 },
  { key: "monthly_check", fact: "level_checks", target: 1 },
  { key: "perfect_5", fact: "perfect_scores", target: 5 },
  { key: "league_promotion", fact: "promotions", target: 1 },
];

export const BADGE_KEYS = BADGES.map((badge) => badge.key);

export type BadgeStatus = { key: string; earned: boolean; current: number; target: number };

/** Earned now, or kept from before (`alreadyEarned`), with progress toward each. */
export const evaluateBadges = (facts: BadgeFacts, alreadyEarned: Iterable<string> = []): BadgeStatus[] => {
  const kept = new Set(alreadyEarned);
  return BADGES.map((badge) => {
    const current = Math.max(0, Math.floor(facts[badge.fact] ?? 0));
    const earned = kept.has(badge.key) || current >= badge.target;
    return { key: badge.key, earned, current: earned ? Math.max(current, badge.target) : current, target: badge.target };
  });
};

/** Facts derived from attempt rows. `skill` is the attempt's service key. */
export const attemptFacts = (attempts: Array<{ content_item_id: string; skill: string; score: number | null; submitted_at: string }>) => {
  const skillsByWeek = new Map<string, Set<string>>();
  for (const attempt of attempts) {
    const week = leagueWeek(new Date(attempt.submitted_at)).start_date;
    const skills = skillsByWeek.get(week) ?? new Set<string>();
    skills.add(attempt.skill);
    skillsByWeek.set(week, skills);
  }
  const known = new Set<string>(TODAY_SKILLS);
  return {
    longest_streak: longestStreak(attempts.map((attempt) => ({ content_item_id: "", skill: "reading", score: attempt.score, submitted_at: attempt.submitted_at }))),
    best_week_skills: Math.max(0, ...[...skillsByWeek.values()].map((skills) => [...skills].filter((skill) => known.has(skill)).length)),
    // Different activities, so redoing one easy activity does not count five times.
    perfect_scores: new Set(attempts
      .filter((attempt) => attempt.score !== null && attempt.score >= 0.999)
      .map((attempt) => attempt.content_item_id)).size,
  };
};
