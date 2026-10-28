// The learner's journey: one chronological view of everything they did in
// Schood English, wherever they did it (the web app, the installed app or
// Telegram). Built only from rows that already exist; nothing is stored.
//
// Pure: the hub (hub/journey.ts) loads one learner-local week of rows and
// passes them in. Days and weeks follow learner time (UTC+5), like XP,
// streaks and leagues.

import { type Cefr, CEFR_ORDER, isCefr, TODAY_SKILLS, type TodaySkill } from "./english-today.ts";
import type { LevelEntry } from "./english-levels.ts";
import { leagueWeek, learnerDate, weekFromStartDate } from "./english-xp.ts";

const DAY_MS = 86_400_000;
const MAX_PRACTICE_SECONDS = 3600;

export const JOURNEY_KINDS = [
  "activity",
  "roleplay",
  "mock",
  "review",
  "telegram_quiz",
  "words",
  "placement",
  "check",
  "level_up",
  "badge",
  "certificate",
] as const;
export type JourneyKind = (typeof JOURNEY_KINDS)[number];

/** Where it happened. "app" is the English app (browser or installed). */
export type JourneyChannel = "app" | "telegram";

// --- Input rows (already scoped to the learner and the week by the hub) -------

export type JourneyAttempt = {
  id: string;
  skill: string;
  content_type: string | null;
  slug: string | null;
  title: string | null;
  level: string | null;
  /** 0..1, or null when the activity has no score. */
  score: number | null;
  submitted_at: string;
  seconds: number | null;
};
export type JourneyReviewAnswer = { answered_at: string; correct: boolean; channel: string | null };
export type JourneyQuizAnswer = { answered_at: string; correct: boolean | null };
export type JourneyWord = { created_at: string };
export type JourneyRoleplay = {
  id: string;
  scenario_id: string;
  title: string | null;
  level: string | null;
  started_at: string | null;
  finished_at: string;
  /** 0..100 */
  score: number | null;
  goals_met: number | null;
  goals_total: number | null;
};
export type JourneyMock = { id: string; started_at: string | null; finished_at: string; band: number | null };
export type JourneyBadge = { key: string; earned_at: string };
export type JourneyCertificate = { code: string; overall: string; issued_at: string };

export type JourneyInput = {
  attempts: JourneyAttempt[];
  reviews: JourneyReviewAnswer[];
  quiz: JourneyQuizAnswer[];
  words: JourneyWord[];
  roleplays: JourneyRoleplay[];
  mocks: JourneyMock[];
  /** The whole level history, oldest first (changes are worked out from neighbours). */
  levels: LevelEntry[];
  badges: JourneyBadge[];
  certificates: JourneyCertificate[];
};

// --- Output ---------------------------------------------------------------------

export type JourneyEvent = {
  id: string;
  kind: JourneyKind;
  at: string;
  /** Learner-local date (YYYY-MM-DD). */
  date: string;
  skill: TodaySkill | null;
  channel: JourneyChannel;
  title: string | null;
  slug: string | null;
  level: Cefr | null;
  /** 0..100 */
  score: number | null;
  /** IELTS band for a speaking mock. */
  band?: number | null;
  /** Grouped events (reviews, quiz answers, saved words): how many, and how many right. */
  count?: number;
  correct?: number;
  minutes?: number | null;
  /** Level events: overall before and after, and the skills whose level changed. */
  levels?: { from: Cefr | null; to: Cefr | null; skills: string[]; per_skill: Record<string, Cefr> };
  goals?: { met: number; total: number } | null;
  badge?: string;
  code?: string;
  href: string | null;
};

export type JourneySummary = {
  activities: number;
  minutes: number;
  skills: TodaySkill[];
  reviews: number;
  reviews_correct: number;
  words: number;
  /** Mean score of scored activities, 0..100. */
  average_score: number | null;
};

export type JourneyDay = { date: string; summary: JourneySummary; events: JourneyEvent[] };

export type JourneyWeek = {
  start_date: string;
  end_date: string;
  starts_at: string;
  ends_at: string;
  /** Monday of the week before, or null when nothing can be there. */
  prev_start: string | null;
  /** Monday of the week after, or null for the current week. */
  next_start: string | null;
  skill: TodaySkill | null;
  days: JourneyDay[];
  totals: JourneySummary & { days_active: number };
};

// --- Helpers ----------------------------------------------------------------------

const isSkill = (value: unknown): value is TodaySkill => (TODAY_SKILLS as readonly string[]).includes(String(value));
const validTime = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));
const pct = (ratio: number | null): number | null =>
  ratio === null || !Number.isFinite(ratio) ? null : Math.round(Math.max(0, Math.min(1, ratio)) * 100);
const minutesBetween = (from: string | null, to: string): number | null => {
  if (!from || !validTime(from)) return null;
  const seconds = (Date.parse(to) - Date.parse(from)) / 1000;
  return seconds > 0 ? Math.max(1, Math.round(Math.min(seconds, MAX_PRACTICE_SECONDS) / 60)) : null;
};
const addDays = (date: string, days: number): string =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

/**
 * The Monday (learner time) of the week to show. Any date snaps to its week;
 * nothing after the current week; anything missing or invalid is this week.
 */
export const journeyWeekStart = (requested: unknown, now: Date = new Date()): string => {
  const current = leagueWeek(now).start_date;
  if (typeof requested !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(requested) || !Number.isFinite(Date.parse(`${requested}T00:00:00Z`))) {
    return current;
  }
  const day = new Date(`${requested}T00:00:00Z`);
  const monday = addDays(requested, -((day.getUTCDay() + 6) % 7));
  return monday > current ? current : monday;
};

/** A level history as events: each entry compared with the one before it. */
export const levelEvents = (history: LevelEntry[]): JourneyEvent[] => {
  const sorted = history.filter((entry) => validTime(entry.at)).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return sorted.map((entry, index) => {
    const before = index > 0 ? sorted[index - 1]! : null;
    const changed = Object.entries(entry.per_skill)
      .filter(([skill, level]) => !before || (before.per_skill[skill] ?? before.overall) !== level)
      .map(([skill]) => skill)
      .filter(isSkill);
    return {
      id: `level:${entry.at}`,
      kind: entry.source,
      at: entry.at,
      date: learnerDate(entry.at),
      skill: entry.source === "level_up" && changed.length === 1 ? changed[0]! : null,
      channel: "app" as const,
      title: null,
      slug: null,
      level: entry.overall,
      score: null,
      levels: { from: before?.overall ?? null, to: entry.overall, skills: changed, per_skill: entry.per_skill },
      href: "/progress",
    };
  });
};

/** One event per learner day and channel for answers given one by one (reviews, quiz). */
const groupAnswers = (
  answers: Array<{ at: string; correct: boolean; channel: JourneyChannel }>,
  kind: "review" | "telegram_quiz",
): JourneyEvent[] => {
  const groups = new Map<string, JourneyEvent>();
  for (const answer of answers) {
    if (!validTime(answer.at)) continue;
    const date = learnerDate(answer.at);
    const id = `${kind}:${date}:${answer.channel}`;
    const event = groups.get(id) ?? {
      id,
      kind,
      at: answer.at,
      date,
      skill: null,
      channel: answer.channel,
      title: null,
      slug: null,
      level: null,
      score: null,
      count: 0,
      correct: 0,
      href: "/review",
    };
    event.count = (event.count ?? 0) + 1;
    event.correct = (event.correct ?? 0) + (answer.correct ? 1 : 0);
    if (Date.parse(answer.at) > Date.parse(event.at)) event.at = answer.at;
    groups.set(id, event);
  }
  for (const event of groups.values()) event.score = event.count ? Math.round(((event.correct ?? 0) / event.count) * 100) : null;
  return [...groups.values()];
};

/** Every event from the rows, newest first. Role-plays and mocks come from their own rows, not their attempts. */
export const journeyEvents = (input: JourneyInput): JourneyEvent[] => {
  const events: JourneyEvent[] = [];

  for (const attempt of input.attempts) {
    if (!isSkill(attempt.skill) || !validTime(attempt.submitted_at)) continue;
    if (attempt.content_type === "speaking.roleplay" || attempt.content_type === "speaking.mock") continue;
    events.push({
      id: `activity:${attempt.id}`,
      kind: "activity",
      at: attempt.submitted_at,
      date: learnerDate(attempt.submitted_at),
      skill: attempt.skill,
      channel: "app",
      title: attempt.title,
      slug: attempt.slug,
      level: isCefr(attempt.level) ? attempt.level : null,
      score: pct(attempt.score),
      minutes: attempt.seconds && attempt.seconds > 0 ? Math.max(1, Math.round(Math.min(attempt.seconds, MAX_PRACTICE_SECONDS) / 60)) : null,
      href: attempt.slug ? `/${attempt.skill}/${encodeURIComponent(attempt.slug)}` : `/${attempt.skill}`,
    });
  }

  for (const session of input.roleplays) {
    if (!validTime(session.finished_at)) continue;
    events.push({
      id: `roleplay:${session.id}`,
      kind: "roleplay",
      at: session.finished_at,
      date: learnerDate(session.finished_at),
      skill: "speaking",
      channel: "app",
      title: session.title,
      slug: session.scenario_id,
      level: isCefr(session.level) ? session.level : null,
      score: session.score === null ? null : Math.max(0, Math.min(100, Math.round(session.score))),
      minutes: minutesBetween(session.started_at, session.finished_at),
      goals: session.goals_total ? { met: session.goals_met ?? 0, total: session.goals_total } : null,
      href: `/roleplay/${encodeURIComponent(session.scenario_id)}`,
    });
  }

  for (const mock of input.mocks) {
    if (!validTime(mock.finished_at)) continue;
    events.push({
      id: `mock:${mock.id}`,
      kind: "mock",
      at: mock.finished_at,
      date: learnerDate(mock.finished_at),
      skill: "speaking",
      channel: "app",
      title: null,
      slug: null,
      level: null,
      score: mock.band === null ? null : Math.round((mock.band / 9) * 100),
      band: mock.band,
      minutes: minutesBetween(mock.started_at, mock.finished_at),
      href: "/speaking-mock",
    });
  }

  events.push(...groupAnswers(
    input.reviews.map((answer) => ({ at: answer.answered_at, correct: answer.correct, channel: answer.channel === "telegram" ? "telegram" : "app" })),
    "review",
  ));
  events.push(...groupAnswers(
    input.quiz.map((answer) => ({ at: answer.answered_at, correct: answer.correct === true, channel: "telegram" as const })),
    "telegram_quiz",
  ));

  const words = new Map<string, JourneyEvent>();
  for (const word of input.words) {
    if (!validTime(word.created_at)) continue;
    const date = learnerDate(word.created_at);
    const event = words.get(date) ?? {
      id: `words:${date}`, kind: "words" as const, at: word.created_at, date, skill: null, channel: "app" as const,
      title: null, slug: null, level: null, score: null, count: 0, href: "/vocabulary",
    };
    event.count = (event.count ?? 0) + 1;
    if (Date.parse(word.created_at) > Date.parse(event.at)) event.at = word.created_at;
    words.set(date, event);
  }
  events.push(...words.values());

  events.push(...levelEvents(input.levels));

  for (const badge of input.badges) {
    if (!validTime(badge.earned_at) || !/^[a-z0-9_]{2,64}$/.test(badge.key)) continue;
    events.push({
      id: `badge:${badge.key}`, kind: "badge", at: badge.earned_at, date: learnerDate(badge.earned_at), skill: null, channel: "app",
      title: null, slug: null, level: null, score: null, badge: badge.key, href: "/progress",
    });
  }

  for (const certificate of input.certificates) {
    if (!validTime(certificate.issued_at)) continue;
    events.push({
      id: `certificate:${certificate.code}`, kind: "certificate", at: certificate.issued_at, date: learnerDate(certificate.issued_at),
      skill: null, channel: "app", title: null, slug: null, level: isCefr(certificate.overall) ? certificate.overall : null,
      score: null, code: certificate.code, href: "/certificate",
    });
  }

  return events.sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || a.id.localeCompare(b.id));
};

/** Whether an event belongs to one skill's view. Cross-skill events (reviews, words, badges) don't. */
export const eventMatchesSkill = (event: JourneyEvent, skill: TodaySkill): boolean =>
  event.skill === skill || Boolean(event.levels && event.kind !== "placement" && event.levels.skills.includes(skill));

export const summarize = (events: JourneyEvent[]): JourneySummary => {
  const practice = events.filter((event) => event.kind === "activity" || event.kind === "roleplay" || event.kind === "mock");
  const scored = practice.map((event) => event.score).filter((score): score is number => score !== null);
  const answers = events.filter((event) => event.kind === "review" || event.kind === "telegram_quiz");
  return {
    activities: practice.length,
    minutes: practice.reduce((sum, event) => sum + (event.minutes ?? 0), 0),
    skills: TODAY_SKILLS.filter((skill) => practice.some((event) => event.skill === skill)),
    reviews: answers.reduce((sum, event) => sum + (event.count ?? 0), 0),
    reviews_correct: answers.reduce((sum, event) => sum + (event.correct ?? 0), 0),
    words: events.filter((event) => event.kind === "words").reduce((sum, event) => sum + (event.count ?? 0), 0),
    average_score: scored.length ? Math.round(scored.reduce((sum, score) => sum + score, 0) / scored.length) : null,
  };
};

/**
 * One week of the journey: events inside the week (optionally one skill's),
 * grouped by learner day, newest first, each day with its summary.
 * `earliestAt` is the learner's first recorded activity, so the page knows
 * whether there is anything before this week.
 */
export const buildJourneyWeek = (
  input: JourneyInput,
  options: { weekStart: string; skill?: TodaySkill | null; earliestAt?: string | null; now?: Date },
): JourneyWeek => {
  const now = options.now ?? new Date();
  const week = weekFromStartDate(options.weekStart);
  const from = Date.parse(week.starts_at);
  const to = Date.parse(week.ends_at);
  const skill = options.skill ?? null;
  const events = journeyEvents(input).filter((event) => {
    const at = Date.parse(event.at);
    return at >= from && at < to && (!skill || eventMatchesSkill(event, skill));
  });

  const byDate = new Map<string, JourneyEvent[]>();
  for (const event of events) byDate.set(event.date, [...(byDate.get(event.date) ?? []), event]);
  const days = [...byDate.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, list]) => ({ date, summary: summarize(list), events: list }));

  const current = leagueWeek(now).start_date;
  const earliest = options.earliestAt && validTime(options.earliestAt) ? Date.parse(options.earliestAt) : null;
  return {
    start_date: week.start_date,
    end_date: week.dates[6]!,
    starts_at: week.starts_at,
    ends_at: week.ends_at,
    prev_start: earliest !== null && earliest < from ? addDays(week.start_date, -7) : null,
    next_start: week.start_date < current ? addDays(week.start_date, 7) : null,
    skill,
    days,
    totals: { ...summarize(events), days_active: days.filter((day) => day.summary.activities > 0 || day.summary.reviews > 0).length },
  };
};

/** True when `level` is above `before` (both CEFR). */
export const isLevelUp = (before: Cefr | null, level: Cefr | null): boolean =>
  Boolean(before && level && CEFR_ORDER.indexOf(level) > CEFR_ORDER.indexOf(before));
