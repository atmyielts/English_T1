import {
  buildTransformationPlan,
  normalizePracticeExperienceKind,
  PRACTICE_DELIVERY_SCHEMA_VERSION,
} from "./ielts-practice-blueprints.ts";

const fail = (message: string): never => {
  throw new Error(message);
};

const assert = (condition: unknown, message: string): void => {
  if (!condition) fail(message);
};

const assertEquals = (actual: unknown, expected: unknown, message: string): void => {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    fail(`${message}\nExpected: ${expectedJson}\nReceived: ${actualJson}`);
  }
};

const unit = (id: string, partId: string, type: string, displayOrder: number, questionType?: string) => ({
  id,
  part_id: partId,
  type,
  display_order: displayOrder,
  data: questionType ? { question_type: questionType } : {},
  metadata: questionType ? { question_type: questionType } : {},
});

Deno.test("normalizePracticeExperienceKind defaults unknown values to guided_set", () => {
  assertEquals(normalizePracticeExperienceKind("repair_drill"), "repair_drill", "known experience kind should pass through");
  assertEquals(normalizePracticeExperienceKind("mystery_kind"), "guided_set", "unknown experience kind should default safely");
  assertEquals(PRACTICE_DELIVERY_SCHEMA_VERSION, "ielts.practice.delivery.v2", "delivery schema should expose v2");
});

Deno.test("buildTransformationPlan creates targeted repair drills instead of cloning full sections", () => {
  const sourceUnits = [
    unit("context-a", "part-a", "reading_passage", 1),
    unit("q-a1", "part-a", "question_true_false_not_given", 2, "question_true_false_not_given"),
    unit("q-a2", "part-a", "question_gap_fill", 3, "question_gap_fill"),
    unit("context-b", "part-b", "reading_passage", 1),
    unit("q-b1", "part-b", "question_gap_fill", 2, "question_gap_fill"),
  ];

  const plan = buildTransformationPlan("reading", "repair_drill", sourceUnits, ["question_gap_fill"]);

  assertEquals(plan.experienceKind, "repair_drill", "repair drill kind should be preserved for reading");
  assertEquals(plan.targetQuestionTypes, ["question_gap_fill"], "plan should report the selected question type");
  assertEquals(plan.selectedQuestionUnits.map((entry) => entry.id).sort(), ["q-a2", "q-b1"], "only matching question units should be selected");
  assert(plan.selectedUnits.some((entry) => entry.id === "context-a"), "context from selected part should be retained");
  assert(plan.selectedUnits.some((entry) => entry.id === "context-b"), "context from second selected part should be retained");
  assert(!plan.selectedUnits.some((entry) => entry.id === "q-a1"), "passed/non-target question units should not be cloned");
});

Deno.test("buildTransformationPlan converts writing repair drills into writing rewrites", () => {
  const sourceUnits = [
    unit("instruction", "part-1", "instruction", 1),
    unit("task", "part-1", "question_text", 2, "task_2"),
  ];

  const plan = buildTransformationPlan("writing", "repair_drill", sourceUnits, ["task_2"]);

  assertEquals(plan.experienceKind, "writing_rewrite", "writing repair drills should become rewrite experiences");
  assertEquals(plan.selectedQuestionUnits.map((entry) => entry.id), ["task"], "writing task should remain selectable");
});
