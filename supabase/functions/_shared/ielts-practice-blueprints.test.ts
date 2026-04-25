import {
  buildPracticeLabPayload,
  buildTransformationPlan,
  normalizePracticeExperienceKind,
  PRACTICE_DELIVERY_SCHEMA_VERSION,
  PRACTICE_LAB_SCHEMA_VERSION,
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

Deno.test("buildPracticeLabPayload creates a reading evidence locator with passage context", () => {
  const sourceUnits = [
    {
      ...unit("passage", "part-a", "reading_passage", 1),
      data: { title: "Urban markets", text: "Paragraph A. The central market moved north after the railway opened." },
    },
    {
      ...unit("q1", "part-a", "question_gap_fill", 2, "question_gap_fill"),
      data: { prompt: "Complete the sentence: The market moved ____." },
    },
  ];
  const plan = buildTransformationPlan("reading", "guided_set", sourceUnits, ["question_gap_fill"]);
  const payload = buildPracticeLabPayload(plan, [
    { content_unit_id: "q1", correct: { blanks: { "1": "north" } }, metadata: { evidence: "moved north" } },
  ], {
    sourceExperienceId: "exp-1",
    sourceSectionId: "section-1",
    clonedUnitIdBySourceUnitId: new Map([["q1", "delivery-q1"]]),
  });

  assertEquals(payload.version, PRACTICE_LAB_SCHEMA_VERSION, "lab payload should expose the v1 runtime contract");
  assertEquals(payload.lab_kind, "evidence_locator", "guided reading should become evidence locator lab");
  assertEquals(payload.steps[0].kind, "evidence_locator", "first step should require evidence work");
  assertEquals(payload.steps[0].delivery_content_unit_id, "delivery-q1", "delivery unit id should be linked for runtime grading");
  assertEquals((payload.steps[0].context as Record<string, unknown>).has_passage, true, "passage context should be attached");
  assertEquals((payload.validation as Record<string, unknown>).valid, true, "payload should validate when answer key and passage exist");
});

Deno.test("buildPracticeLabPayload creates distractor drills with trap taxonomy", () => {
  const sourceUnits = [
    {
      ...unit("passage", "part-a", "reading_passage", 1),
      data: { text: "The notice says registration closes on Friday, not Monday." },
    },
    {
      ...unit("q1", "part-a", "question_single_choice", 2, "question_single_choice"),
      data: {
        prompt: "When does registration close?",
        options: [{ id: "a", label: "Monday" }, { id: "b", label: "Friday" }],
      },
    },
  ];
  const plan = buildTransformationPlan("reading", "repair_drill", sourceUnits, ["question_single_choice"]);
  const payload = buildPracticeLabPayload(plan, [
    { content_unit_id: "q1", correct: { option_id: "b" }, metadata: {} },
  ]);
  const distractors = payload.steps[0].distractors as Record<string, unknown>;

  assertEquals(payload.lab_kind, "distractor_drill", "repair drills should become distractor labs");
  assertEquals(payload.steps[0].kind, "distractor_elimination", "step should score distractor explanation");
  assert(Array.isArray(distractors.trap_types), "distractor trap taxonomy should be present");
});

Deno.test("buildPracticeLabPayload flags listening replay fallback when transcript is missing", () => {
  const sourceUnits = [
    { ...unit("audio", "part-a", "audio", 1), data: { url: "https://cdn.example.test/listening.mp3" } },
    {
      ...unit("q1", "part-a", "question_gap_fill", 2, "question_gap_fill"),
      data: { prompt: "Write the missing number." },
    },
  ];
  const plan = buildTransformationPlan("listening", "guided_set", sourceUnits, ["question_gap_fill"]);
  const payload = buildPracticeLabPayload(plan, [
    { content_unit_id: "q1", correct: { blanks: { "1": "42" } }, metadata: {} },
  ]);
  const validation = payload.validation as Record<string, unknown>;

  assertEquals(payload.lab_kind, "listening_replay", "listening guided sets should use replay trainer runtime");
  assertEquals((payload.steps[0].replay as Record<string, unknown>).available, true, "audio should make replay available");
  assert(Array.isArray(validation.warnings) && validation.warnings.length > 0, "missing transcript should create validation warning");
});

Deno.test("buildPracticeLabPayload preserves timed and mastery lab kinds for listening", () => {
  const sourceUnits = [
    { ...unit("audio", "part-a", "audio", 1), data: { transcript: "The appointment is at six." } },
    {
      ...unit("q1", "part-a", "question_gap_fill", 2, "question_gap_fill"),
      data: { prompt: "Write the appointment time." },
    },
  ];
  const answerKeys = [{ content_unit_id: "q1", correct: { blanks: { "1": "six" } }, metadata: {} }];

  const timed = buildPracticeLabPayload(buildTransformationPlan("listening", "timed_mini", sourceUnits, ["question_gap_fill"]), answerKeys);
  const mastery = buildPracticeLabPayload(buildTransformationPlan("listening", "mastery_check", sourceUnits, ["question_gap_fill"]), answerKeys);

  assertEquals(timed.lab_kind, "timed_mini", "listening timed mini should stay a timed lab");
  assertEquals(mastery.lab_kind, "mastery_check", "listening mastery check should stay a mastery lab");
});

Deno.test("buildPracticeLabPayload validates writing rewrite labs without objective answer keys", () => {
  const sourceUnits = [
    {
      ...unit("task", "part-a", "question_text", 1, "task_2"),
      data: { prompt: "Some people believe cities should be car-free. Discuss both views and give your opinion." },
    },
  ];
  const plan = buildTransformationPlan("writing", "writing_rewrite", sourceUnits, ["task_2"]);
  const payload = buildPracticeLabPayload(plan, []);

  assertEquals(payload.lab_kind, "writing_rewrite", "writing should run in rewrite lab");
  assertEquals(payload.steps[0].kind, "writing_rewrite", "writing step should expose rewrite fields");
  assertEquals((payload.validation as Record<string, unknown>).valid, true, "writing labs should not require objective answer keys");
});
