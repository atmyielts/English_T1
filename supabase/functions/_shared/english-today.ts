// Today's session planner for Schood English.
//
// Pure functions only: the hub function loads rows and passes them in, so the
// selection rules are testable without a database. The plan is honest by
// construction. It reasons only from the learner's placement, their real
// attempts and their due reviews, and it never invents readiness scores.

export const TODAY_SKILLS = [
  "reading",
  "listening",
  "writing",
  "speaking",
  "grammar",
  "vocabulary",
  "immersion",
] as const;
export type TodaySkill = (typeof TODAY_SKILLS)[number];

export const CEFR_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export type Cefr = (typeof CEFR_ORDER)[number];

export const isCefr = (value: unknown): value is Cefr =>
  typeof value === "string" && (CEFR_ORDER as readonly string[]).includes(value);

export type CatalogItem = {
  id: string;
  skill: TodaySkill;
  slug: string;
  title: string;
  level: Cefr | null;
  minutes: number;
  difficulty: number;
};

export type AttemptRow = {
  content_item_id: string;
  skill: TodaySkill;
  /** 0..1, null when not scored. */
  score: number | null;
  submitted_at: string;
};

export type TodayReason =
  | "review_due"
  | "not_started"
  | "weakest"
  | "keep_fresh"
  | "balance";

export type TodayItemKind = "new" | "stretch" | "retry" | "easier";

export type TodayTask = {
  id: string;
  kind: "review" | "activity";
  skill: TodaySkill;
  content_item_id: string | null;
  slug: string | null;
  title: string;
  level: Cefr | null;
  minutes: number;
  reason: TodayReason;
  item_kind: TodayItemKind | null;
  /** Score (0..100) of the learner's best earlier attempt on this item, for retries. */
  previous_score: number | null;
  done: boolean;
};

export type TodayInput = {
  /** Plan date, YYYY-MM-DD, in the learner's day. */
  date: string;
  dailyMinutes: number;
  overallLevel: Cefr | null;
  perSkillLevel: Partial<Record<TodaySkill, Cefr>>;
  items: CatalogItem[];
  /** Submitted attempts, newest first, typically the last 60 days. */
  attempts: AttemptRow[];
  dueReviews: number;
  /** Skills the learner may open. Locked skills are never planned. */
  availableSkills: TodaySkill[];
  /** A plan already stored for this date. Its selection is kept so the day stays stable. */
  existing?: TodayTask[] | null;
};

export type TodayPlan = {
  date: string;
  tasks: TodayTask[];
  minutes_total: number;
  done_count: number;
};

const REVIEW_MINUTES = 5;
const MAX_ACTIVITIES = 4;

const levelIndex = (level: Cefr | null): number => (level ? CEFR_ORDER.indexOf(level) : -1);

/** Small deterministic hash so the same learner sees the same order all day. */
export const dayHash = (text: string): number => {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 1000;
};

const daysBetween = (fromIso: string, toDate: string): number => {
  const from = Date.parse(fromIso.slice(0, 10));
  const to = Date.parse(toDate);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 999;
  return Math.max(0, Math.round((to - from) / 86_400_000));
};

type SkillSignal = {
  skill: TodaySkill;
  attempts: number;
  recentAverage: number | null;
  daysSince: number | null;
};

export const skillSignals = (attempts: AttemptRow[], date: string): Map<TodaySkill, SkillSignal> => {
  const signals = new Map<TodaySkill, SkillSignal>();
  for (const skill of TODAY_SKILLS) signals.set(skill, { skill, attempts: 0, recentAverage: null, daysSince: null });
  const recentScores = new Map<TodaySkill, number[]>();
  for (const attempt of attempts) {
    const signal = signals.get(attempt.skill);
    if (!signal) continue;
    signal.attempts += 1;
    const since = daysBetween(attempt.submitted_at, date);
    signal.daysSince = signal.daysSince === null ? since : Math.min(signal.daysSince, since);
    if (attempt.score !== null && Number.isFinite(attempt.score)) {
      const list = recentScores.get(attempt.skill) ?? [];
      if (list.length < 5) list.push(attempt.score);
      recentScores.set(attempt.skill, list);
    }
  }
  for (const [skill, scores] of recentScores) {
    const signal = signals.get(skill);
    if (signal && scores.length) signal.recentAverage = scores.reduce((sum, value) => sum + value, 0) / scores.length;
  }
  return signals;
};

/** Why this skill deserves time today, and how urgent it is (higher first). */
export const skillPriority = (signal: SkillSignal, date: string): { reason: TodayReason; priority: number } => {
  const jitter = dayHash(`${date}:${signal.skill}`) / 1000;
  if (signal.attempts === 0) return { reason: "not_started", priority: 60 + jitter * 10 };
  if (signal.recentAverage !== null && signal.recentAverage < 0.65) {
    return { reason: "weakest", priority: 70 + (0.65 - signal.recentAverage) * 60 + jitter };
  }
  if ((signal.daysSince ?? 0) >= 3) {
    return { reason: "keep_fresh", priority: 40 + Math.min(20, signal.daysSince ?? 0) + jitter * 5 };
  }
  return { reason: "balance", priority: 20 + jitter * 20 };
};

/**
 * Picks the next item in a skill. Prefers unseen items at the learner's level,
 * then one level below, then one above; once everything is seen it offers a
 * retry of the lowest-scoring item.
 */
export const pickItem = (
  items: CatalogItem[],
  attempts: AttemptRow[],
  target: Cefr | null,
): { item: CatalogItem; kind: TodayItemKind; previousScore: number | null } | null => {
  if (!items.length) return null;
  const best = new Map<string, number>();
  for (const attempt of attempts) {
    const score = attempt.score ?? 0;
    best.set(attempt.content_item_id, Math.max(best.get(attempt.content_item_id) ?? 0, score));
  }
  const unseen = items.filter((item) => !best.has(item.id));
  const targetIndex = target ? levelIndex(target) : 1;
  const byDistance = (a: CatalogItem, b: CatalogItem) => {
    const da = Math.abs(levelIndex(a.level) - targetIndex);
    const db = Math.abs(levelIndex(b.level) - targetIndex);
    if (da !== db) return da - db;
    // At equal distance prefer the easier side for a learner, then lower difficulty.
    if (levelIndex(a.level) !== levelIndex(b.level)) return levelIndex(a.level) - levelIndex(b.level);
    return a.difficulty - b.difficulty || a.slug.localeCompare(b.slug);
  };
  if (unseen.length) {
    const item = [...unseen].sort(byDistance)[0]!;
    const delta = levelIndex(item.level) - targetIndex;
    return { item, kind: delta > 0 ? "stretch" : delta < 0 ? "easier" : "new", previousScore: null };
  }
  const retry = [...items].sort((a, b) => (best.get(a.id) ?? 0) - (best.get(b.id) ?? 0) || byDistance(a, b))[0]!;
  return { item: retry, kind: "retry", previousScore: Math.round((best.get(retry.id) ?? 0) * 100) };
};

const doneToday = (attempts: AttemptRow[], date: string): Set<string> =>
  new Set(attempts.filter((attempt) => attempt.submitted_at.slice(0, 10) === date).map((attempt) => attempt.content_item_id));

const withDone = (tasks: TodayTask[], attempts: AttemptRow[], date: string, dueReviews: number): TodayTask[] => {
  const done = doneToday(attempts, date);
  return tasks.map((task) => ({
    ...task,
    done: task.kind === "review" ? dueReviews === 0 : Boolean(task.content_item_id && done.has(task.content_item_id)),
  }));
};

const finish = (date: string, tasks: TodayTask[]): TodayPlan => ({
  date,
  tasks,
  minutes_total: tasks.reduce((sum, task) => sum + task.minutes, 0),
  done_count: tasks.filter((task) => task.done).length,
});

export const planToday = (input: TodayInput): TodayPlan => {
  const available = new Set(input.availableSkills);

  // Keep the day's selection stable once made; only refresh completion.
  if (input.existing && input.existing.length) {
    const kept = input.existing.filter((task) => task.kind === "review" || available.has(task.skill));
    if (kept.length) return finish(input.date, withDone(kept, input.attempts, input.date, input.dueReviews));
  }

  const budget = Math.max(10, Math.min(120, Math.round(input.dailyMinutes || 20)));
  const tasks: TodayTask[] = [];
  let used = 0;

  if (input.dueReviews > 0) {
    tasks.push({
      id: `review:${input.date}`,
      kind: "review",
      skill: "vocabulary",
      content_item_id: null,
      slug: null,
      title: "review",
      level: null,
      minutes: REVIEW_MINUTES,
      reason: "review_due",
      item_kind: null,
      previous_score: null,
      done: false,
    });
    used += REVIEW_MINUTES;
  }

  const signals = skillSignals(input.attempts, input.date);
  const ranked = TODAY_SKILLS
    .filter((skill) => available.has(skill) && input.items.some((item) => item.skill === skill))
    .map((skill) => ({ skill, ...skillPriority(signals.get(skill)!, input.date) }))
    .sort((a, b) => b.priority - a.priority);

  let activities = 0;
  for (const entry of ranked) {
    if (activities >= MAX_ACTIVITIES) break;
    const target = input.perSkillLevel[entry.skill] ?? input.overallLevel;
    const picked = pickItem(
      input.items.filter((item) => item.skill === entry.skill),
      input.attempts.filter((attempt) => attempt.skill === entry.skill),
      target,
    );
    if (!picked) continue;
    const minutes = Math.max(3, Math.min(30, picked.item.minutes));
    // Always plan at least one activity; after that stay within the budget (+5 min grace).
    if (activities > 0 && used + minutes > budget + 5) continue;
    tasks.push({
      id: `activity:${picked.item.id}`,
      kind: "activity",
      skill: entry.skill,
      content_item_id: picked.item.id,
      slug: picked.item.slug,
      title: picked.item.title,
      level: picked.item.level,
      minutes,
      reason: entry.reason,
      item_kind: picked.kind,
      previous_score: picked.previousScore,
      done: false,
    });
    used += minutes;
    activities += 1;
  }

  return finish(input.date, withDone(tasks, input.attempts, input.date, input.dueReviews));
};

/** Seven-day activity strip, oldest first, for the Today screen. */
export const weekStrip = (attempts: AttemptRow[], date: string): Array<{ date: string; count: number }> => {
  const counts = new Map<string, number>();
  for (const attempt of attempts) {
    const day = attempt.submitted_at.slice(0, 10);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  const end = Date.parse(date);
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(end - (6 - index) * 86_400_000).toISOString().slice(0, 10);
    return { date: day, count: counts.get(day) ?? 0 };
  });
};

/** Consecutive days with at least one submitted attempt, ending today or yesterday. */
export const currentStreak = (attempts: AttemptRow[], date: string): number => {
  const days = new Set(attempts.map((attempt) => attempt.submitted_at.slice(0, 10)));
  let cursor = Date.parse(date);
  if (!days.has(date)) cursor -= 86_400_000;
  let streak = 0;
  while (days.has(new Date(cursor).toISOString().slice(0, 10))) {
    streak += 1;
    cursor -= 86_400_000;
  }
  return streak;
};
