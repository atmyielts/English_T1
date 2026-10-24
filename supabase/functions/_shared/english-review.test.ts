import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  checkReviewAnswer,
  parseReviewPayload,
  publicReviewPayload,
  type ReviewPayload,
  scheduleAfterAnswer,
} from "./english-review.ts";

const now = new Date("2026-10-22T12:00:00.000Z");
const days = (iso: string) => Math.round((Date.parse(iso) - now.getTime()) / 86_400_000);

Deno.test("items come back after 1, 3 and 7 days and retire after three correct reviews", () => {
  let state = { box: 1 };
  const steps: number[] = [];
  for (let i = 0; i < 3; i += 1) {
    const next = scheduleAfterAnswer(state.box, true, now);
    steps.push(next.box);
    state = next;
  }
  assertEquals(steps, [2, 3, 4]);
  assertEquals(days(scheduleAfterAnswer(1, true, now).next_due_at), 3);
  assertEquals(days(scheduleAfterAnswer(2, true, now).next_due_at), 7);
  const wrong = scheduleAfterAnswer(3, false, now);
  assertEquals(wrong.box, 1);
  assertEquals(days(wrong.next_due_at), 1);
});

const grammar: ReviewPayload = {
  type: "grammar",
  prompt: "I bought ___ umbrella before the storm.",
  instructions: "Type the best article.",
  accepted: ["an umbrella"],
  source_title: "Articles",
  source_slug: "articles-basic-control",
};
const choice: ReviewPayload = {
  type: "choice",
  prompt: "Why is the group starting later?",
  options: ["A lecture", "An exam in the room", "Timur asked", "The library closes"],
  answer_index: 1,
  explanation: "Lola says the room is booked for an exam.",
  source_title: "Study group",
  source_slug: "study-group",
};
const dictation: ReviewPayload = {
  type: "dictation",
  sentence: "The next train will leave from platform four.",
  source_title: "Platform change",
  source_slug: "platform",
};

Deno.test("answer keys are never in the public payload", () => {
  const publicGrammar = JSON.stringify(publicReviewPayload(grammar));
  assert(!publicGrammar.includes("an umbrella"));
  const publicChoice = publicReviewPayload(choice);
  assertEquals(publicChoice.answer_index, undefined);
  assertEquals(publicChoice.explanation, undefined);
  assertEquals(publicReviewPayload(dictation).speak, "The next train will leave from platform four.");
});

Deno.test("answers are checked by the same rules as the original activity", () => {
  assertEquals(checkReviewAnswer(grammar, "an").correct, true);
  assertEquals(checkReviewAnswer(grammar, "a").correct, false);
  assertEquals(checkReviewAnswer(choice, 1).correct, true);
  assertEquals(checkReviewAnswer(choice, "1").correct, true);
  assertEquals(checkReviewAnswer(choice, 0).explanation, "Lola says the room is booked for an exam.");
  assertEquals(checkReviewAnswer(dictation, "the next train will leave from platform 4").correct, true);
  assertEquals(checkReviewAnswer(dictation, "the train leaves").correct, false);
});

Deno.test("stored payloads are validated", () => {
  assertEquals(parseReviewPayload({ type: "grammar", prompt: "x ___", accepted: ["y"] })?.type, "grammar");
  assertEquals(parseReviewPayload({ type: "choice", prompt: "q", options: ["a"], answer_index: "0" }), null);
  assertEquals(parseReviewPayload(null), null);
  assertEquals(parseReviewPayload({ type: "nope" }), null);
});

Deno.test("homework mistakes shared from a centre are corrected in Review and show the teacher's explanation afterwards", () => {
  // The shape written by academy_homework_feed_mistake (20261025210000).
  const stored = {
    type: "grammar",
    prompt: "I have car",
    instructions: "Write this correctly.",
    accepted: ["I have a car"],
    explanation: "Use a before a singular noun.",
    source_title: "Homework · Alpha Centre",
    source_slug: "",
  };
  const payload = parseReviewPayload(stored);
  assert(payload);
  const shown = publicReviewPayload(payload);
  assertEquals("explanation" in shown, false);
  assertEquals("accepted" in shown, false);
  assertEquals(shown.source_title, "Homework · Alpha Centre");
  const right = checkReviewAnswer(payload, "I have a car.");
  assertEquals(right.correct, true);
  assertEquals(right.explanation, "Use a before a singular noun.");
  assertEquals(checkReviewAnswer(payload, "I have car").correct, false);
  // Items without an explanation behave as before.
  const plain = parseReviewPayload({ ...stored, explanation: "" });
  assert(plain);
  assertEquals("explanation" in plain, false);
  assertEquals(checkReviewAnswer(plain, "I have a car").explanation, null);
});
