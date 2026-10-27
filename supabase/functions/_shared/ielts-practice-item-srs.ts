// Item-level spaced repetition for IELTS Practice. The type-level queue
// (ielts_srs_question_reviews) says "practise True/False/Not Given again";
// this queue brings back the exact questions a learner missed, from the same
// delivery build, on a 5-box Leitner schedule (1, 2, 4, 8, 16 days).
// Pure helpers only: the edge function does the reads and writes.

import { isObject, scoreObjectiveQuestion } from "./ielts-practice-core.ts";

type JsonRecord = Record<string, unknown>;

const toText = (value: unknown, maxLen = 240): string => String(value ?? "").trim().slice(0, maxLen);

export const ITEM_REVIEW_INTERVAL_DAYS = [1, 2, 4, 8, 16] as const;
/** A step scored below this counts as missed and enters the item queue. */
export const ITEM_MISS_THRESHOLD = 0.75;
const DAY_MS = 24 * 60 * 60 * 1000;

export const intervalDaysForBox = (box: number): number =>
  ITEM_REVIEW_INTERVAL_DAYS[Math.min(ITEM_REVIEW_INTERVAL_DAYS.length, Math.max(1, Math.floor(box))) - 1]!;

export type ItemReviewState = {
  leitner_box: number;
  review_count: number;
  correct_count: number;
  incorrect_count: number;
  is_archived: boolean;
};

export type ItemSchedule = ItemReviewState & {
  next_review_at: string;
  last_reviewed_at: string;
  last_result: "correct" | "incorrect";
};

/**
 * Next state after one answer. Correct moves the item up a box (archived as
 * mastered when it is answered correctly while already in box 5); a miss sends
 * it back to box 1, due again tomorrow.
 */
export const scheduleItemReview = (
  previous: ItemReviewState | null,
  correct: boolean,
  now = new Date(),
): ItemSchedule => {
  const box = previous ? Math.min(5, Math.max(1, Math.floor(previous.leitner_box))) : 1;
  const nextBox = correct ? Math.min(5, box + 1) : 1;
  const mastered = correct && box >= 5;
  return {
    leitner_box: nextBox,
    review_count: (previous?.review_count ?? 0) + 1,
    correct_count: (previous?.correct_count ?? 0) + (correct ? 1 : 0),
    incorrect_count: (previous?.incorrect_count ?? 0) + (correct ? 0 : 1),
    is_archived: mastered,
    next_review_at: new Date(now.getTime() + intervalDaysForBox(nextBox) * DAY_MS).toISOString(),
    last_reviewed_at: now.toISOString(),
    last_result: correct ? "correct" : "incorrect",
  };
};

/** State for an item the learner just missed inside a lab (not a review answer). */
export const scheduleMissedInLab = (previous: ItemReviewState | null, now = new Date()): Omit<ItemSchedule, "last_result" | "last_reviewed_at"> => ({
  leitner_box: 1,
  review_count: previous?.review_count ?? 0,
  correct_count: previous?.correct_count ?? 0,
  incorrect_count: (previous?.incorrect_count ?? 0) + 1,
  is_archived: false,
  next_review_at: new Date(now.getTime() + intervalDaysForBox(1) * DAY_MS).toISOString(),
});

/** Same response unwrapping the lab scorer uses, so an item grades exactly like it did in the lab. */
export const responseDataForStep = (step: JsonRecord, response: unknown): unknown => {
  if (!isObject(response)) return response;
  const shape = isObject(step.response_shape) ? (step.response_shape as JsonRecord) : {};
  const kind = toText(shape.kind, 80).toLowerCase();
  if (kind === "single_choice") {
    return { selected_option: response.selected_option ?? response.answer ?? response.value ?? response.text };
  }
  if (kind === "multi_choice") {
    return { selected_options: Array.isArray(response.selected_options) ? response.selected_options : Array.isArray(response.answer) ? response.answer : [] };
  }
  if (kind === "map" || kind === "gap_fill") {
    const mapKey = toText(shape.map_key, 80);
    if (mapKey && isObject(response[mapKey])) return response;
    if (isObject(response.answers)) return response.answers;
    return response;
  }
  return { text: response.answer ?? response.text ?? response.value ?? "" };
};

/** Objective score of one step; null when the step cannot be auto-graded (writing, free text without key). */
export const gradeItemStep = (step: JsonRecord, response: unknown): { score: number; max: number; correct: boolean } | null => {
  const scored = scoreObjectiveQuestion(toText(step.question_type, 120), step.answer_key, responseDataForStep(step, response));
  if (!scored || scored.max <= 0) return null;
  return { score: scored.score, max: scored.max, correct: scored.score / scored.max >= ITEM_MISS_THRESHOLD };
};

/** A step can be reviewed on its own only when it has an objective answer key. */
export const isReviewableStep = (step: JsonRecord, sectionType: string): boolean => {
  if (sectionType === "writing" || toText(step.kind, 80) === "writing_rewrite") return false;
  const scored = scoreObjectiveQuestion(toText(step.question_type, 120), step.answer_key, null);
  return scored != null && scored.max > 0;
};

/** Step as shown to the learner before answering: no key, no evidence target. */
export const publicItemStep = (step: JsonRecord): JsonRecord => {
  const { answer_key: _key, evidence: _evidence, distractors: _distractors, ...rest } = step;
  return rest;
};

export type MissedItem = {
  step_id: string;
  question_type: string;
  accuracy_ratio: number;
  prompt_excerpt: string;
  title: string;
};

/** Steps of a scored lab that belong in the item queue. */
export const missedItemsFromLab = (
  steps: JsonRecord[],
  scoredSteps: JsonRecord[],
  sectionType: string,
  threshold = ITEM_MISS_THRESHOLD,
): MissedItem[] => {
  const stepById = new Map(steps.map((step) => [toText(step.id, 120), step]));
  const out: MissedItem[] = [];
  for (const scored of scoredSteps) {
    const stepId = toText(scored.step_id, 120);
    const step = stepById.get(stepId);
    if (!step || !isReviewableStep(step, sectionType)) continue;
    const accuracy = Math.max(0, Math.min(1, Number(scored.accuracy_ratio ?? 0) || 0));
    if (accuracy >= threshold) continue;
    out.push({
      step_id: stepId,
      question_type: toText(step.question_type, 120).toLowerCase() || "question_unknown",
      accuracy_ratio: accuracy,
      prompt_excerpt: toText(step.prompt, 280),
      title: toText(step.title, 160),
    });
  }
  return out;
};

/** Steps of a scored lab that were answered correctly (used to advance items already queued). */
export const passedStepIds = (scoredSteps: JsonRecord[], threshold = ITEM_MISS_THRESHOLD): string[] =>
  scoredSteps
    .filter((scored) => (Number(scored.accuracy_ratio ?? 0) || 0) >= threshold)
    .map((scored) => toText(scored.step_id, 120))
    .filter(Boolean);

/** Human-readable correct answer for feedback after the learner answered. */
export const describeAnswerKey = (step: JsonRecord): string => {
  const key = isObject(step.answer_key) ? step.answer_key as JsonRecord : {};
  const options = Array.isArray(step.options) ? step.options.filter(isObject) as JsonRecord[] : [];
  const labelFor = (id: unknown) => {
    const match = options.find((option) => toText(option.id ?? option.value ?? option.key, 80).toUpperCase() === toText(id, 80).toUpperCase());
    return match ? `${toText(id, 20)}. ${toText(match.label ?? match.text ?? match.value, 200)}` : toText(id, 200);
  };
  if (typeof key.option_id === "string") return labelFor(key.option_id);
  if (Array.isArray(key.option_ids)) return key.option_ids.map(labelFor).join(", ");
  if (Array.isArray(key.answers)) return key.answers.map((entry) => toText(entry, 120)).filter(Boolean).join(" / ");
  for (const mapKey of ["matches", "blanks", "cells", "labels", "targets"]) {
    if (isObject(key[mapKey])) {
      return Object.entries(key[mapKey] as JsonRecord)
        .map(([slot, value]) => `${slot}: ${(Array.isArray(value) ? value : [value]).map((entry) => toText(entry, 80)).join(" / ")}`)
        .join("; ");
    }
  }
  return "";
};
