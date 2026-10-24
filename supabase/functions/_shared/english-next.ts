// One next step across all seven skills, so the learner never has to choose
// "which app now". Pure: the hub loads the rows and passes them in.
//
// Order of preference:
//   0. continue an activity left unfinished on any device (english-resume.ts)
//   1. due reviews (words and missed questions; always free)
//   2. a lesson for a mistake the learner keeps making
//   3. the weakest skill against the goal level (by the per-skill rating)
//   4. the next unfinished task in today's plan
//   5. anything else worth doing, weakest skill first
// Entitlements decide what can be opened: a skill in the learner's plan,
// today's free activity, or one already opened free today. When the best step
// is in a skill the learner cannot open, the best open alternative is chosen
// and the locked one is returned separately as an optional suggestion.

import { type AttemptRow, type CatalogItem, CEFR_ORDER, type Cefr, type FixCandidate, pickItem, TODAY_SKILLS, type TodaySkill, type TodayTask } from "./english-today.ts";
import type { SkillRating } from "./english-rating.ts";

export type NextReason = "continue" | "review_due" | "fix_mistake" | "weakest_skill" | "today_plan" | "keep_going";

export type NextStep = {
  kind: "review" | "activity";
  skill: TodaySkill | null;
  content_item_id: string | null;
  slug: string | null;
  title: string;
  level: Cefr | null;
  minutes: number;
  reason: NextReason;
  /** fix_mistake: an example of the mistake; review_due: how many are due. */
  detail: string | null;
  due?: number;
  /** For weakest_skill: the rating and the goal it is measured against. */
  rating?: { level: Cefr | null; progress: number | null } | null;
  target_level?: Cefr | null;
  /** Opening it uses today's free activity. */
  uses_free: boolean;
  /** Where to open it, when not the usual /<skill>/<slug> (a role-play or mock to continue). */
  href?: string | null;
};

/** Something started and not finished (see english-resume.ts selectResume). */
export type NextResume = {
  kind: "activity" | "roleplay" | "mock";
  skill: TodaySkill;
  ref: string;
  title: string | null;
  href: string;
  progress: number | null;
};

export type NextInput = {
  items: CatalogItem[];
  /** Submitted attempts, newest first. */
  attempts: AttemptRow[];
  dueReviews: number;
  fixes: FixCandidate[];
  ratings: Partial<Record<TodaySkill, Pick<SkillRating, "value" | "level" | "progress" | "attempts">>>;
  targetLevel: Cefr | null;
  /** Level to practise each skill at (placement, stepped down while struggling). */
  levelFor: (skill: TodaySkill) => Cefr | null;
  /** Today's stored plan, in order. */
  planTasks: TodayTask[];
  access: { owned: TodaySkill[]; freeLeft: number; freeItemIds: string[] };
  /** The activity just finished; never suggested again straight away. */
  excludeItemId?: string | null;
  /** The skill the learner is in now; the weakest-skill step prefers another one, to keep the week balanced. */
  fromSkill?: TodaySkill | null;
  goalKeys?: string[];
  /** Unfinished activities, newest first; the newest one comes before everything else. */
  resume?: NextResume[];
};

export type NextResult = { step: NextStep | null; locked: NextStep | null };

const MINUTES_MIN = 3;
const MINUTES_MAX = 30;
const REVIEW_MINUTES = 5;
const WEAKEST_CANDIDATES = 2;

const levelValue = (level: Cefr | null): number | null => (level ? CEFR_ORDER.indexOf(level) : null);

const activityStep = (item: CatalogItem, reason: NextReason, extra: Partial<NextStep> = {}): NextStep => ({
  kind: "activity",
  skill: item.skill,
  content_item_id: item.id,
  slug: item.slug,
  title: item.title,
  level: item.level,
  minutes: Math.max(MINUTES_MIN, Math.min(MINUTES_MAX, Math.round(item.minutes || 10))),
  reason,
  detail: null,
  uses_free: false,
  ...extra,
});

/**
 * How far below the goal a skill is (bigger = weaker). Without a goal the
 * lowest-rated skill counts as weakest. Unrated skills fall back to their
 * practice level, and skills with no level at all come last.
 */
export const skillGap = (
  skill: TodaySkill,
  input: Pick<NextInput, "ratings" | "targetLevel" | "levelFor">,
): number | null => {
  const rated = input.ratings[skill]?.value;
  const practice = levelValue(input.levelFor(skill));
  const value = typeof rated === "number" ? rated : practice === null ? null : practice + 0.3;
  if (value === null) return null;
  const goal = levelValue(input.targetLevel);
  return (goal === null ? CEFR_ORDER.length : goal) - value;
};

/** Skills that have items, weakest first (ties: fewer rated attempts, then the usual skill order). */
export const rankWeakest = (input: Pick<NextInput, "items" | "ratings" | "targetLevel" | "levelFor">): TodaySkill[] =>
  TODAY_SKILLS
    .filter((skill) => input.items.some((item) => item.skill === skill))
    .map((skill, order) => ({ skill, order, gap: skillGap(skill, input), attempts: input.ratings[skill]?.attempts ?? 0 }))
    .sort((a, b) =>
      (a.gap === null ? 1 : 0) - (b.gap === null ? 1 : 0)
      || (b.gap ?? 0) - (a.gap ?? 0)
      || a.attempts - b.attempts
      || a.order - b.order)
    .map((entry) => entry.skill);

export const pickNextStep = (input: NextInput): NextResult => {
  const owned = new Set(input.access.owned);
  const freeToday = new Set(input.access.freeItemIds);
  const exclude = input.excludeItemId ?? null;
  const items = input.items.filter((item) => item.id !== exclude);
  const byId = new Map(items.map((item) => [item.id, item]));

  /** Whether the learner may open this now, and whether it uses the free activity. */
  const openable = (step: NextStep): { ok: boolean; usesFree: boolean } => {
    if (step.kind === "review" || !step.skill) return { ok: true, usesFree: false };
    // A role-play or mock already started was allowed when it started.
    if (step.reason === "continue" && step.href) return { ok: true, usesFree: false };
    if (owned.has(step.skill)) return { ok: true, usesFree: false };
    if (step.content_item_id && freeToday.has(step.content_item_id)) return { ok: true, usesFree: false };
    return input.access.freeLeft > 0 ? { ok: true, usesFree: true } : { ok: false, usesFree: false };
  };

  const candidates: NextStep[] = [];

  // 0. Something started and not finished, on any device.
  for (const open of (input.resume ?? []).slice(0, 2)) {
    if (open.kind === "activity") {
      const item = items.find((entry) => entry.skill === open.skill && entry.slug === open.ref);
      if (item) candidates.push(activityStep(item, "continue", { detail: open.progress === null ? null : String(open.progress) }));
    } else {
      candidates.push({
        kind: "activity",
        skill: open.skill,
        content_item_id: null,
        slug: null,
        title: open.title ?? open.ref,
        level: null,
        minutes: open.kind === "mock" ? 14 : 8,
        reason: "continue",
        detail: open.kind,
        uses_free: false,
        href: open.href,
      });
    }
  }

  // 1. Reviews.
  if (input.dueReviews > 0) {
    candidates.push({
      kind: "review",
      skill: null,
      content_item_id: null,
      slug: null,
      title: "review",
      level: null,
      minutes: REVIEW_MINUTES,
      reason: "review_due",
      detail: null,
      due: input.dueReviews,
      uses_free: false,
    });
  }

  // 2. Repeated mistakes.
  for (const fix of input.fixes) {
    if (fix.item.id === exclude) continue;
    candidates.push(activityStep(fix.item, "fix_mistake", { detail: fix.example || null }));
  }

  // 3. The weakest skills against the goal, preferring an unfinished plan task in that skill.
  const planOpen = input.planTasks.filter((task) =>
    task.kind === "activity" && !task.done && task.content_item_id && task.content_item_id !== exclude && byId.has(task.content_item_id));
  const itemFor = (skill: TodaySkill): CatalogItem | null => {
    const planned = planOpen.find((task) => task.skill === skill);
    if (planned) return byId.get(planned.content_item_id!) ?? null;
    return pickItem(
      items.filter((item) => item.skill === skill),
      input.attempts.filter((attempt) => attempt.skill === skill),
      input.levelFor(skill),
      input.goalKeys ?? [],
    )?.item ?? null;
  };
  const ranked = rankWeakest({ items, ratings: input.ratings, targetLevel: input.targetLevel, levelFor: input.levelFor });
  const weakest = input.fromSkill && ranked.length > 1
    ? [...ranked.filter((skill) => skill !== input.fromSkill), input.fromSkill].filter((skill) => ranked.includes(skill))
    : ranked;
  for (const skill of weakest.slice(0, WEAKEST_CANDIDATES)) {
    const item = itemFor(skill);
    if (!item) continue;
    const rating = input.ratings[skill];
    candidates.push(activityStep(item, "weakest_skill", {
      rating: rating ? { level: rating.level, progress: rating.progress } : null,
      target_level: input.targetLevel,
    }));
  }

  // 4. Today's plan.
  for (const task of planOpen) {
    const item = byId.get(task.content_item_id!);
    if (item) candidates.push(activityStep(item, "today_plan"));
  }

  // 5. Everything else, weakest first, so an open alternative is always found.
  for (const skill of ranked) {
    const item = itemFor(skill);
    if (item) candidates.push(activityStep(item, "keep_going"));
  }

  let locked: NextStep | null = null;
  for (const candidate of candidates) {
    const access = openable(candidate);
    if (access.ok) return { step: { ...candidate, uses_free: access.usesFree }, locked };
    if (!locked) locked = candidate;
  }
  return { step: null, locked };
};
