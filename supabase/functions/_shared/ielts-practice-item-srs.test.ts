import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  describeAnswerKey,
  gradeItemStep,
  intervalDaysForBox,
  isReviewableStep,
  missedItemsFromLab,
  passedStepIds,
  publicItemStep,
  scheduleItemReview,
  scheduleMissedInLab,
} from "./ielts-practice-item-srs.ts";

const now = new Date("2026-10-24T10:00:00.000Z");
const day = 24 * 60 * 60 * 1000;
const fresh = { leitner_box: 1, review_count: 0, correct_count: 0, incorrect_count: 1, is_archived: false };

const choiceStep = {
  id: "step_1_question_single_choice",
  kind: "evidence_locator",
  question_type: "question_single_choice",
  prompt: "Why did the town move its market?",
  options: [{ id: "A", label: "Flooding" }, { id: "B", label: "A new road" }],
  response_shape: { kind: "single_choice" },
  answer_key: { option_id: "B" },
  evidence: { target: "the new road brought traders" },
};
const tfngStep = {
  id: "step_2_question_true_false_not_given",
  kind: "evidence_locator",
  question_type: "question_true_false_not_given",
  prompt: "Statements",
  response_shape: { kind: "map", map_key: "matches", keys: ["1", "2"] },
  answer_key: { matches: { "1": "T", "2": "NG" } },
};
const writingStep = { id: "step_3_writing", kind: "writing_rewrite", question_type: "writing_task_2", answer_key: {} };

Deno.test("Leitner intervals are 1, 2, 4, 8, 16 days", () => {
  assertEquals([1, 2, 3, 4, 5].map(intervalDaysForBox), [1, 2, 4, 8, 16]);
  assertEquals(intervalDaysForBox(0), 1);
  assertEquals(intervalDaysForBox(9), 16);
});

Deno.test("a correct answer moves the item up one box and spaces it out", () => {
  const next = scheduleItemReview(fresh, true, now);
  assertEquals(next.leitner_box, 2);
  assertEquals(next.next_review_at, new Date(now.getTime() + 2 * day).toISOString());
  assertEquals(next.review_count, 1);
  assertEquals(next.correct_count, 1);
  assertEquals(next.is_archived, false);
  assertEquals(next.last_result, "correct");
});

Deno.test("a miss sends the item back to box 1, due tomorrow", () => {
  const next = scheduleItemReview({ ...fresh, leitner_box: 4 }, false, now);
  assertEquals(next.leitner_box, 1);
  assertEquals(next.next_review_at, new Date(now.getTime() + day).toISOString());
  assertEquals(next.incorrect_count, 2);
  assertEquals(next.last_result, "incorrect");
});

Deno.test("answering correctly in box 5 retires the item as mastered", () => {
  const next = scheduleItemReview({ ...fresh, leitner_box: 5 }, true, now);
  assertEquals(next.leitner_box, 5);
  assertEquals(next.is_archived, true);
});

Deno.test("missing a question inside a lab resets it without counting a review", () => {
  const next = scheduleMissedInLab({ ...fresh, leitner_box: 3, review_count: 4, correct_count: 3 }, now);
  assertEquals(next.leitner_box, 1);
  assertEquals(next.review_count, 4);
  assertEquals(next.incorrect_count, 2);
  assertEquals(next.next_review_at, new Date(now.getTime() + day).toISOString());
  assertEquals(scheduleMissedInLab(null, now).incorrect_count, 1);
});

Deno.test("only missed, objectively gradable steps enter the item queue", () => {
  const steps = [choiceStep, tfngStep, writingStep];
  const scored = [
    { step_id: choiceStep.id, accuracy_ratio: 0.4 },
    { step_id: tfngStep.id, accuracy_ratio: 1 },
    { step_id: writingStep.id, accuracy_ratio: 0.1 },
  ];
  const missed = missedItemsFromLab(steps, scored, "reading");
  assertEquals(missed.map((item) => item.step_id), [choiceStep.id]);
  assertEquals(missed[0]?.question_type, "question_single_choice");
  assertEquals(passedStepIds(scored), [tfngStep.id]);
  assertEquals(isReviewableStep(writingStep, "writing"), false);
  assertEquals(isReviewableStep(choiceStep, "listening"), true);
});

Deno.test("an item grades exactly like the lab: same key, same response shape", () => {
  assertEquals(gradeItemStep(choiceStep, { selected_option: "B" })?.correct, true);
  assertEquals(gradeItemStep(choiceStep, { selected_option: "a" })?.correct, false);
  assertEquals(gradeItemStep(tfngStep, { matches: { "1": "true", "2": "not given" } })?.correct, true);
  // 1 of 2 statements is below the 0.75 threshold.
  assertEquals(gradeItemStep(tfngStep, { matches: { "1": "true", "2": "false" } })?.correct, false);
  assertEquals(gradeItemStep(writingStep, { text: "essay" }), null);
});

Deno.test("the learner never sees the key or evidence before answering", () => {
  const shown = publicItemStep(choiceStep);
  assertEquals("answer_key" in shown, false);
  assertEquals("evidence" in shown, false);
  assertEquals(shown.prompt, choiceStep.prompt);
  assertEquals(describeAnswerKey(choiceStep), "B. A new road");
  assertEquals(describeAnswerKey(tfngStep), "1: T; 2: NG");
});
