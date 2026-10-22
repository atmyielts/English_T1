// Today's session planner for Schood English.
//
// Pure functions only: the hub function loads rows and passes them in, so the
// selection rules are testable without a database. The plan is honest by
// construction. It reasons only from the learner's placement, their real
// attempts and their due reviews, and it never invents scores.

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
  /** Topic words (tags) used to match the learner's goals. */
  tags?: string[];
};

/** Topic words that suit each learning goal (matched against item titles and tags). */
export const GOAL_KEYWORDS: Record<string, string[]> = {
  everyday: ["home", "family", "food", "shopping", "weather", "health", "daily", "routine", "friend", "neighbour", "cafe", "café", "market", "bazaar", "city", "sport", "hobby"],
  work: ["work", "workplace", "office", "meeting", "manager", "email", "team", "job", "interview", "business", "project", "career", "colleague", "client", "report", "deadline"],
  study_abroad: ["study", "university", "academic", "lecture", "essay", "campus", "student", "course", "abroad", "library", "research", "dormitory"],
  exam: ["academic", "essay", "argument", "opinion", "report", "lecture", "science", "research", "proposal", "society", "environment"],
  travel: ["travel", "airport", "hotel", "flight", "trip", "holiday", "booking", "restaurant", "transport", "train", "metro", "directions", "tourist", "guest"],
  school: ["school", "homework", "class", "teacher", "student", "exam", "lesson", "study", "sport", "friend"],
  // Older goal keys from the earlier goal picker.
  exam_prep: ["academic", "essay", "argument", "opinion", "report", "lecture", "science"],
  career: ["work", "workplace", "office", "meeting", "email", "team", "job", "interview", "business"],
};

/** True when an item's title or tags mention a topic that suits the learner's goals. */
export const matchesGoals = (item: Pick<CatalogItem, "title" | "tags">, goalKeys: string[]): boolean => {
  const words = goalKeys.flatMap((key) => GOAL_KEYWORDS[key] ?? []);
  if (!words.length) return false;
  const haystack = ` ${[item.title, ...(item.tags ?? [])].join(" ").toLowerCase()} `;
  return words.some((word) => new RegExp(`[^a-z]${word}`).test(haystack));
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
  | "fix_mistake"
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
  /** For fix_mistake tasks: one example of the mistake, as the learner wrote it. */
  detail?: string | null;
  done: boolean;
};

/** A grammar lesson that targets a mistake the learner keeps making. */
export type FixCandidate = {
  topic: string;
  /** Times the mistake was recorded recently (all instances of the topic). */
  count: number;
  example: string;
  item: CatalogItem;
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
  /** Lessons for repeated mistakes, most urgent first. The first one is planned. */
  fixes?: FixCandidate[];
  /** The learner's goals; at the same level, matching topics come first. */
  goalKeys?: string[];
  /** Cap on activities (free learners get only what today's free allowance covers). */
  maxActivities?: number;
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
  goalKeys: string[] = [],
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
    // At equal distance prefer the easier side for a learner, then topics that suit their goals.
    if (levelIndex(a.level) !== levelIndex(b.level)) return levelIndex(a.level) - levelIndex(b.level);
    const goalA = matchesGoals(a, goalKeys) ? 0 : 1;
    const goalB = matchesGoals(b, goalKeys) ? 0 : 1;
    if (goalA !== goalB) return goalA - goalB;
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
    // A mistake that became "repeated" during the day joins today's plan right away.
    const fresh = available.has("grammar") ? (input.fixes ?? [])[0] : undefined;
    if (fresh && !kept.some((task) => task.content_item_id === fresh.item.id)) {
      const at = kept[0]?.kind === "review" ? 1 : 0;
      kept.splice(at, 0, {
        id: `fix:${fresh.item.id}`,
        kind: "activity",
        skill: "grammar",
        content_item_id: fresh.item.id,
        slug: fresh.item.slug,
        title: fresh.item.title,
        level: fresh.item.level,
        minutes: Math.max(3, Math.min(30, fresh.item.minutes)),
        reason: "fix_mistake",
        item_kind: null,
        previous_score: null,
        detail: fresh.example,
        done: false,
      });
    }
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

  // A mistake the learner keeps making comes first: it is the most useful practice there is.
  const fix = available.has("grammar") && (input.maxActivities ?? 1) > 0 ? (input.fixes ?? [])[0] : undefined;
  if (fix) {
    tasks.push({
      id: `fix:${fix.item.id}`,
      kind: "activity",
      skill: "grammar",
      content_item_id: fix.item.id,
      slug: fix.item.slug,
      title: fix.item.title,
      level: fix.item.level,
      minutes: Math.max(3, Math.min(30, fix.item.minutes)),
      reason: "fix_mistake",
      item_kind: null,
      previous_score: null,
      detail: fix.example,
      done: false,
    });
    used += tasks[tasks.length - 1]!.minutes;
  }

  const signals = skillSignals(input.attempts, input.date);
  const ranked = TODAY_SKILLS
    .filter((skill) => available.has(skill) && input.items.some((item) => item.skill === skill))
    .filter((skill) => !(fix && skill === "grammar"))
    .map((skill) => ({ skill, ...skillPriority(signals.get(skill)!, input.date) }))
    .sort((a, b) => b.priority - a.priority);

  let activities = fix ? 1 : 0;
  for (const entry of ranked) {
    if (activities >= Math.min(MAX_ACTIVITIES, input.maxActivities ?? MAX_ACTIVITIES)) break;
    const target = input.perSkillLevel[entry.skill] ?? input.overallLevel;
    const picked = pickItem(
      input.items.filter((item) => item.skill === entry.skill),
      input.attempts.filter((attempt) => attempt.skill === entry.skill),
      target,
      input.goalKeys ?? [],
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

export type SkillProgress = {
  skill: TodaySkill;
  activities: number;
  /** Mean accuracy (0..100) of the five most recent scored attempts, or null. */
  recent_accuracy: number | null;
  /** Mean accuracy (0..100) on items at the learner's level for this skill, or null. */
  accuracy_at_level: number | null;
  attempts_at_level: number;
  last_practised: string | null;
};

/** Per-skill progress from real attempts. `levelOf` maps a content item to its CEFR level. */
export const skillProgress = (
  attempts: AttemptRow[],
  levelOf: (contentItemId: string) => Cefr | null,
  levelFor: (skill: TodaySkill) => Cefr | null,
): SkillProgress[] =>
  TODAY_SKILLS.map((skill) => {
    const own = attempts.filter((attempt) => attempt.skill === skill);
    const scored = own.filter((attempt) => attempt.score !== null);
    const recent = scored.slice(0, 5);
    const target = levelFor(skill);
    const atLevel = target ? scored.filter((attempt) => levelOf(attempt.content_item_id) === target) : [];
    const mean = (rows: AttemptRow[]) =>
      rows.length ? Math.round((rows.reduce((sum, row) => sum + (row.score ?? 0), 0) / rows.length) * 100) : null;
    return {
      skill,
      activities: own.length,
      recent_accuracy: mean(recent),
      accuracy_at_level: mean(atLevel),
      attempts_at_level: atLevel.length,
      last_practised: own[0]?.submitted_at ?? null,
    };
  });

/** Practice days in a window ending on `date`, oldest first. */
export const dailyCounts = (attempts: AttemptRow[], date: string, days: number): Array<{ date: string; count: number }> => {
  const counts = new Map<string, number>();
  for (const attempt of attempts) {
    const day = attempt.submitted_at.slice(0, 10);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  const end = Date.parse(date);
  return Array.from({ length: days }, (_, index) => {
    const day = new Date(end - (days - 1 - index) * 86_400_000).toISOString().slice(0, 10);
    return { date: day, count: counts.get(day) ?? 0 };
  });
};

/** Longest run of consecutive practice days ever. */
export const longestStreak = (attempts: AttemptRow[]): number => {
  const days = [...new Set(attempts.map((attempt) => attempt.submitted_at.slice(0, 10)))].sort();
  let best = 0;
  let run = 0;
  let previous: number | null = null;
  for (const day of days) {
    const time = Date.parse(day);
    run = previous !== null && time - previous === 86_400_000 ? run + 1 : 1;
    best = Math.max(best, run);
    previous = time;
  }
  return best;
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

/** Keeps topics recorded at least twice whose lesson wasn't passed since, most frequent first. */
export const pickFixes = (input: {
  mistakes: Array<{ topic: string; count: number; example: string; last_seen_at: string }>;
  lessonFor: (topic: string) => CatalogItem | null;
  attempts: AttemptRow[];
  minCount?: number;
}): FixCandidate[] => {
  const byTopic = new Map<string, { count: number; example: string; last: string }>();
  for (const mistake of input.mistakes) {
    const entry = byTopic.get(mistake.topic) ?? { count: 0, example: mistake.example, last: mistake.last_seen_at };
    entry.count += mistake.count;
    if (mistake.last_seen_at > entry.last) {
      entry.last = mistake.last_seen_at;
      entry.example = mistake.example;
    }
    byTopic.set(mistake.topic, entry);
  }
  const out: FixCandidate[] = [];
  for (const [topic, entry] of byTopic) {
    if (entry.count < (input.minCount ?? 2)) continue;
    const item = input.lessonFor(topic);
    if (!item) continue;
    const passedSince = input.attempts.some((attempt) =>
      attempt.content_item_id === item.id && (attempt.score ?? 0) >= 0.8 && attempt.submitted_at > entry.last
    );
    if (passedSince) continue;
    out.push({ topic, count: entry.count, example: entry.example, item });
  }
  return out.sort((a, b) => b.count - a.count);
};

export type LevelStatus = "ready" | "struggling" | "steady" | "new";

/**
 * How the learner is doing at their level in one skill, from the last scored
 * attempts at that level (most recent first). Three or more attempts averaging
 * 85+ means ready to move up; averaging under 50 means step down for a while.
 */
export const levelStatus = (scoresAtLevel: number[]): LevelStatus => {
  const recent = scoresAtLevel.slice(0, 5);
  if (recent.length < 3) return "new";
  const mean = recent.reduce((sum, value) => sum + value, 0) / recent.length;
  if (mean >= 0.85) return "ready";
  if (mean < 0.5) return "struggling";
  return "steady";
};

/** The level to practise at: one step down while struggling, never below A1. */
export const practiceLevel = (level: Cefr | null, status: LevelStatus): Cefr | null => {
  if (!level || status !== "struggling") return level;
  return CEFR_ORDER[Math.max(0, CEFR_ORDER.indexOf(level) - 1)] ?? level;
};

export const nextCefr = (level: Cefr): Cefr | null => CEFR_ORDER[CEFR_ORDER.indexOf(level) + 1] ?? null;

/** Weekly themes. Each skill contributes one activity whose title or tags fit the theme. */
export const WEEK_TOPICS: Array<{ key: string; keywords: string[] }> = [
  { key: "travel", keywords: ["travel", "airport", "hotel", "flight", "trip", "holiday", "booking", "transport", "train", "metro", "station", "platform", "tourist", "guest", "check-in"] },
  { key: "work", keywords: ["work", "workplace", "office", "meeting", "manager", "email", "team", "job", "interview", "project", "colleague", "deadline", "report", "client"] },
  { key: "study", keywords: ["study", "university", "school", "class", "lecture", "exam", "student", "course", "homework", "library", "research", "academic"] },
  { key: "health", keywords: ["health", "doctor", "sport", "sleep", "run", "swim", "exercise", "body", "food", "kurash"] },
  { key: "city", keywords: ["city", "home", "flat", "neighbour", "shop", "market", "bazaar", "park", "café", "street", "guest house"] },
  { key: "technology", keywords: ["technology", "phone", "online", "ai", "app", "internet", "digital", "screen", "machine", "qr"] },
  { key: "environment", keywords: ["environment", "water", "green", "climate", "shade", "nature", "weather", "clean-up", "transport"] },
  { key: "culture", keywords: ["culture", "museum", "festival", "navruz", "tradition", "music", "film", "art", "news", "language"] },
];

/** ISO-8601 week number, so the theme changes every Monday. */
export const isoWeek = (date: string): number => {
  const day = new Date(`${date}T12:00:00Z`);
  const weekday = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - weekday + 3);
  const firstThursday = new Date(Date.UTC(day.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((day.getTime() - firstThursday.getTime()) / 86_400_000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
};

const WEEK_ORDER: TodaySkill[] = ["vocabulary", "reading", "listening", "speaking", "writing", "immersion"];

export type TopicWeek = {
  topic: string;
  week: number;
  steps: Array<{ skill: TodaySkill; content_item_id: string; slug: string; title: string; level: Cefr | null; minutes: number; done: boolean }>;
};

const fitsTopic = (item: CatalogItem, keywords: string[]): boolean => {
  const haystack = ` ${[item.title, ...(item.tags ?? [])].join(" ").toLowerCase()} `;
  return keywords.some((word) => new RegExp(`[^a-z]${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(haystack));
};

/**
 * This week's theme: one activity per skill on the same topic, nearest the
 * learner's level in that skill. Themes with fewer than three skills covered
 * are skipped so every week feels like a real journey.
 */
export const topicWeek = (input: {
  date: string;
  items: CatalogItem[];
  attempts: AttemptRow[];
  levelFor: (skill: TodaySkill) => Cefr | null;
}): TopicWeek | null => {
  const week = isoWeek(input.date);
  for (let offset = 0; offset < WEEK_TOPICS.length; offset += 1) {
    const theme = WEEK_TOPICS[(week + offset) % WEEK_TOPICS.length]!;
    const steps: TopicWeek["steps"] = [];
    for (const skill of WEEK_ORDER) {
      const matches = input.items.filter((item) => item.skill === skill && fitsTopic(item, theme.keywords));
      const picked = pickItem(matches, input.attempts.filter((attempt) => attempt.skill === skill), input.levelFor(skill));
      if (!picked) continue;
      steps.push({
        skill,
        content_item_id: picked.item.id,
        slug: picked.item.slug,
        title: picked.item.title,
        level: picked.item.level,
        minutes: picked.item.minutes,
        done: input.attempts.some((attempt) => attempt.content_item_id === picked.item.id),
      });
    }
    if (steps.length >= 3) return { topic: theme.key, week, steps };
  }
  return null;
};
