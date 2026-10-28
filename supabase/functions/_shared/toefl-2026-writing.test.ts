import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { normalizeToefl2026WritingResult, toefl2026WritingModels } from "./toefl-2026-writing.ts";

Deno.test("writing normalization clamps to whole 0-5 scores and zeroes blank answers", () => {
  const out = normalizeToefl2026WritingResult(
    { tasks: [{ content_unit_id: "e", score: 4.4, feedback: "Clear." }, { content_unit_id: "d", score: 7 }], notes: "n" },
    [{ content_unit_id: "e", task_type: "toefl_email", word_count: 120 }, { content_unit_id: "d", task_type: "toefl_academic_discussion", word_count: 0 }],
  );
  const tasks = out.tasks as Array<{ content_unit_id: string; score: number }>;
  assertEquals(tasks.map((t) => [t.content_unit_id, t.score]), [["e", 4], ["d", 0]]);
  assertEquals(out.rubric, "toefl-2026");
});

Deno.test("writing grader defaults to the free model", () => {
  assertEquals(toefl2026WritingModels(() => null), ["google/gemma-4-31b-it:free"]);
  assertEquals(toefl2026WritingModels((k) => (k === "TOEFL_WRITING_MODEL" ? "m1" : null)), ["m1", "google/gemma-4-31b-it:free"]);
});
