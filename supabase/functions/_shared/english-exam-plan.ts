// Exam date, readiness per section and the days-to-exam weekly plan for the
// national exam track. Pure; the exam date lives in
// learner_language_goals.metadata.exam_track (like goal_plan).

import {
  EXAM_SECTIONS,
  type ExamLevel,
  type ExamSection,
  examLevelFor,
  examOverall,
  isExamSection,
  scoreFromRating,
} from "./english-exam-format.ts";

const DAY_MS = 86_400_000;
const LEARNER_UTC_OFFSET_HOURS = 5;
/** Dates further ahead than this are refused (a typo, not a plan). */
export const EXAM_DATE_MAX_DAYS = 400;
/** A mock result counts as the section's readiness for this long. */
export const MOCK_READINESS_DAYS = 45;
/** Weeks shown in the plan. */
export const PLAN_WEEKS_SHOWN = 12;

export type ExamTrack = {
  exam: "multilevel";
  date: string | null;
  /** Sections weakest first, refreshed after each mock; used by /hub/next. */
  focus_order: ExamSection[];
  updated_at: string;
};

const isRec = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const isDate = (value: unknown): value is string =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

/** The learner's calendar date (UTC+5). */
export const learnerToday = (now: Date = new Date()): string =>
  new Date(now.getTime() + LEARNER_UTC_OFFSET_HOURS * 3_600_000).toISOString().slice(0, 10);

export const daysBetween = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

const addDays = (date: string, days: number): string => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

export const readExamTrack = (value: unknown): ExamTrack | null => {
  if (!isRec(value)) return null;
  const order = Array.isArray(value.focus_order) ? value.focus_order.filter(isExamSection) : [];
  return {
    exam: "multilevel",
    date: isDate(value.date) ? value.date : null,
    focus_order: [...new Set(order)],
    updated_at: typeof value.updated_at === "string" ? value.updated_at : "",
  };
};

/** A date the learner sends: null/"" clears it; otherwise today or later, within EXAM_DATE_MAX_DAYS. */
export const parseExamDate = (value: unknown, today: string): { ok: true; date: string | null } | { ok: false; code: string } => {
  if (value === null || value === undefined || value === "") return { ok: true, date: null };
  if (!isDate(value)) return { ok: false, code: "exam_date_invalid" };
  const days = daysBetween(today, value);
  if (days < 0) return { ok: false, code: "exam_date_past" };
  if (days > EXAM_DATE_MAX_DAYS) return { ok: false, code: "exam_date_too_far" };
  return { ok: true, date: value };
};

// --- Readiness -----------------------------------------------------------------

export type SectionReadiness = {
  section: ExamSection;
  /** Estimated 0-75, or null when nothing is known. */
  score: number | null;
  level: ExamLevel | null;
  /** mock: the latest mock result; rating: the practice rating; null: unknown. */
  source: "mock" | "rating" | null;
  at: string | null;
  /** True when the rating rests on the placement alone or very few results. */
  tentative: boolean;
};

export type RatingLike = { value: number | null; confidence?: string | null };

export const readinessFor = (input: {
  ratings: Partial<Record<ExamSection, RatingLike | undefined>>;
  /** The latest mock score per section, with when it was taken. */
  mocks: Partial<Record<ExamSection, { score: number; at: string }>>;
  now?: Date;
}): SectionReadiness[] => {
  const now = (input.now ?? new Date()).getTime();
  return EXAM_SECTIONS.map((section) => {
    const mock = input.mocks[section];
    if (mock && Number.isFinite(Date.parse(mock.at)) && now - Date.parse(mock.at) <= MOCK_READINESS_DAYS * DAY_MS) {
      return { section, score: mock.score, level: examLevelFor(mock.score), source: "mock", at: mock.at, tentative: false };
    }
    const rating = input.ratings[section];
    const score = scoreFromRating(rating?.value ?? null);
    if (score === null) return { section, score: null, level: null, source: null, at: null, tentative: true };
    const tentative = !rating?.confidence || rating.confidence === "none" || rating.confidence === "low";
    return { section, score, level: examLevelFor(score), source: "rating", at: null, tentative };
  });
};

/** The estimated overall result, once all four sections have an estimate. */
export const readinessOverall = (readiness: SectionReadiness[]): { score: number | null; level: ExamLevel | null } => {
  const score = examOverall(Object.fromEntries(readiness.map((entry) => [entry.section, entry.score])));
  return { score, level: examLevelFor(score) };
};

/** Sections weakest first; unknown sections first of all (we need a first result there). */
export const focusOrder = (readiness: Array<Pick<SectionReadiness, "section" | "score">>): ExamSection[] =>
  [...EXAM_SECTIONS]
    .map((section, index) => ({ section, index, score: readiness.find((entry) => entry.section === section)?.score ?? null }))
    .sort((a, b) => (a.score === null ? -1 : a.score) - (b.score === null ? -1 : b.score) || a.index - b.index)
    .map((entry) => entry.section);

// --- Weekly plan -------------------------------------------------------------------

/**
 * Focus per week: the weakest section every other week, the others in turn.
 * Weeks are counted back from the exam date, so a week's focus stays the same
 * all week and the last week is always the final one.
 */
const FOCUS_CYCLE = [0, 1, 0, 2, 0, 3] as const;

export const weekFocus = (weeksToGo: number, order: ExamSection[]): ExamSection => {
  const ranked = order.length === EXAM_SECTIONS.length ? order : focusOrder([]);
  return ranked[FOCUS_CYCLE[Math.abs(weeksToGo) % FOCUS_CYCLE.length]!]!;
};

export type PlanWeek = {
  /** 0 = the week that ends on exam day. */
  weeks_to_go: number;
  starts: string;
  ends: string;
  focus: ExamSection;
  /** full: a timed full mock this week; section: a mock of the focus section. */
  mock: "full" | "section";
  final: boolean;
};

export type ExamPlan = {
  status: "none" | "upcoming" | "today" | "past";
  date: string | null;
  days_left: number | null;
  weeks: PlanWeek[];
  this_week: PlanWeek | null;
};

export const buildExamPlan = (input: {
  today: string;
  date: string | null;
  order: ExamSection[];
  /** When the learner last finished a full mock, if ever. */
  lastFullMockAt: string | null;
}): ExamPlan => {
  if (!input.date) return { status: "none", date: null, days_left: null, weeks: [], this_week: null };
  const daysLeft = daysBetween(input.today, input.date);
  if (daysLeft < 0) return { status: "past", date: input.date, days_left: daysLeft, weeks: [], this_week: null };
  if (daysLeft === 0) return { status: "today", date: input.date, days_left: 0, weeks: [], this_week: null };

  const current = Math.floor((daysLeft - 1) / 7);
  const neverFull = !input.lastFullMockAt;
  const weeks: PlanWeek[] = [];
  for (let weeksToGo = current; weeksToGo >= 0 && weeks.length < PLAN_WEEKS_SHOWN; weeksToGo -= 1) {
    // Week `weeksToGo` covers the days 7w+1 … 7w+7 before the exam.
    const starts = addDays(input.date, -(7 * weeksToGo + 7));
    const ends = addDays(input.date, -(7 * weeksToGo + 1));
    const final = weeksToGo === 0;
    const baseline = weeksToGo === current && neverFull;
    weeks.push({
      weeks_to_go: weeksToGo,
      starts: starts < input.today ? input.today : starts,
      ends,
      focus: weekFocus(weeksToGo, input.order),
      mock: final || baseline || weeksToGo % 2 === 0 ? "full" : "section",
      final,
    });
  }
  return { status: "upcoming", date: input.date, days_left: daysLeft, weeks, this_week: weeks[0] ?? null };
};
