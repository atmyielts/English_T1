// The national exam track's contribution to GET /hub/next: when the learner
// has an exam date coming up, one extra candidate in this week's focus
// section, ranked just after mistakes to fix. Kept apart from english-next.ts,
// which calls examPrepCandidates() in one line.

import type { CatalogItem, TodaySkill } from "./english-today.ts";
import type { NextStep } from "./english-next.ts";
import { focusOrder, learnerToday, daysBetween, readExamTrack, readinessFor, weekFocus } from "./english-exam-plan.ts";
import { EXAM_SECTIONS, type ExamSection } from "./english-exam-format.ts";

/** Exam prep enters /next from this many days before the exam. */
export const EXAM_NEXT_WINDOW_DAYS = 120;

export type ExamNextContext = { daysLeft: number; focus: ExamSection };

/**
 * From learner_language_goals.metadata and the per-skill ratings: the days
 * left and this week's focus, or null when there is no exam date in the window.
 */
export const examNextContext = (
  metadata: unknown,
  ratings: Partial<Record<TodaySkill, { value: number | null; confidence?: string | null }>>,
  now: Date = new Date(),
): ExamNextContext | null => {
  const meta = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata as Record<string, unknown> : {};
  const track = readExamTrack(meta.exam_track);
  if (!track?.date) return null;
  const daysLeft = daysBetween(learnerToday(now), track.date);
  if (daysLeft < 1 || daysLeft > EXAM_NEXT_WINDOW_DAYS) return null;
  const order = track.focus_order.length === EXAM_SECTIONS.length
    ? track.focus_order
    : focusOrder(readinessFor({ ratings, mocks: {}, now }));
  return { daysLeft, focus: weekFocus(Math.floor((daysLeft - 1) / 7), order) };
};

/** One activity in the focus section, as a /next candidate with reason "exam_prep". */
export const examPrepCandidates = (
  exam: ExamNextContext,
  itemFor: (skill: TodaySkill) => CatalogItem | null,
  activityStep: (item: CatalogItem, reason: NextStep["reason"], extra?: Partial<NextStep>) => NextStep,
): NextStep[] => {
  const item = itemFor(exam.focus);
  return item ? [activityStep(item, "exam_prep", { detail: String(exam.daysLeft) })] : [];
};
