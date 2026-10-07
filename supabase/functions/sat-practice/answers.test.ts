import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isCorrectAnswer } from "../_shared/sat-practice-core.ts";

Deno.test("SAT constructed responses compare the entered scalar with the published key", () => {
  assertEquals(isCorrectAnswer({ text: "12" }, { correct: "12" }), true);
  assertEquals(isCorrectAnswer({ text: "13" }, { correct: "12" }), false);
  assertEquals(isCorrectAnswer({ value: 12 }, { value: 12 }), true);
  assertEquals(isCorrectAnswer({ text: "12" }, ["12", "12.0"]), true);
});
Deno.test("SAT malformed objects, blank responses and non-finite numbers cannot earn credit", () => {
  for (
    const [answer, key] of [
      [{}, {}],
      [{ text: "wrong" }, { unrelated: "right" }],
      [{ unrelated: "wrong" }, { unrelated: "right" }],
      ["", ""],
      [{ text: "  " }, { text: "  " }],
      [NaN, NaN],
      [Infinity, Infinity],
      [[{}], [{}]],
    ]
  ) {
    assertEquals(isCorrectAnswer(answer, key), false);
  }
});
Deno.test("SAT multiple-choice scalar and object responses retain their supported formats", () => {
  for (const answer of [" b ", { selected_option: "B" }, { option_id: "b" }]) {
    assertEquals(isCorrectAnswer(answer, { option_id: "B" }), true);
    assertEquals(isCorrectAnswer(answer, { option_id: "A" }), false);
  }
});
