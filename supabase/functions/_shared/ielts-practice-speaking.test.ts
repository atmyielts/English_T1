import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  countWords,
  normalizeSpeakingFeedback,
  orderSpeakingPrompts,
  parseSpeakingSubmission,
  SPEAKING_PROMPTS,
  wordsPerMinute,
} from "./ielts-practice-speaking.ts";

const answer = "I grew up in Samarkand, which is an old city famous for its blue domes and busy markets, and I still love walking there.";

Deno.test("prompt bank covers all three parts with unique ids and official timings", () => {
  const ids = new Set(SPEAKING_PROMPTS.map((prompt) => prompt.id));
  assertEquals(ids.size, SPEAKING_PROMPTS.length);
  for (const part of ["part1", "part2", "part3"] as const) {
    assertEquals(SPEAKING_PROMPTS.filter((prompt) => prompt.part === part).length >= 8, true);
  }
  for (const cue of SPEAKING_PROMPTS.filter((prompt) => prompt.part === "part2")) {
    assertEquals(cue.prep_seconds, 60);
    assertEquals(cue.target_seconds, 120);
    assertEquals(cue.cue_points.length, 4);
  }
});

Deno.test("least recently practised prompts come first", () => {
  const ordered = orderSpeakingPrompts("part1", ["p1-hometown", "p1-music"]);
  assertEquals(ordered.length, 8);
  assertEquals(ordered.slice(-2).map((prompt) => prompt.id), ["p1-music", "p1-hometown"]);
});

Deno.test("submission validation", () => {
  const parsed = parseSpeakingSubmission({ prompt_id: "p1-hometown", transcript: answer, transcript_source: "speech_recognition", duration_seconds: 30 });
  assertEquals(parsed.word_count, countWords(answer));
  assertEquals(parsed.transcript_source, "speech_recognition");
  assertThrows(() => parseSpeakingSubmission({ prompt_id: "nope", transcript: answer }), Error, "unknown_prompt");
  assertThrows(() => parseSpeakingSubmission({ prompt_id: "p1-hometown", transcript: "Too short." }), Error, "transcript_too_short");
  assertEquals(parseSpeakingSubmission({ prompt_id: "p2-skill", transcript: answer, transcript_source: "weird", duration_seconds: 5000 }).duration_seconds, null);
});

Deno.test("words per minute only for timed, recognised speech", () => {
  assertEquals(wordsPerMinute({ word_count: 120, duration_seconds: 60, transcript_source: "speech_recognition" }), 120);
  assertEquals(wordsPerMinute({ word_count: 120, duration_seconds: 60, transcript_source: "typed" }), null);
  assertEquals(wordsPerMinute({ word_count: 10, duration_seconds: 5, transcript_source: "speech_recognition" }), null);
});

Deno.test("feedback keeps only text criteria and never passes a band through", () => {
  const feedback = normalizeSpeakingFeedback({
    overall_band: 7,
    pronunciation: "great",
    fluency_and_coherence: "Ideas are linked with 'which' and 'and'.",
    lexical_resource: "Good topic words: 'blue domes'.",
    grammatical_range: "Mostly simple sentences.",
    strengths: ["Clear answer", "Personal detail"],
    improvements: ["Extend with a reason"],
    upgrades: [{ original: "busy markets", better: "bustling bazaars", why: "more precise" }, { original: "", better: "x" }],
    part2_coverage: ["covered"],
  }, "part1")!;
  assertEquals("overall_band" in feedback, false);
  assertEquals("pronunciation" in feedback, false);
  assertEquals(feedback.assessment_scope, "transcript_only");
  assertEquals(feedback.upgrades.length, 1);
  assertEquals(feedback.part2_coverage, []);
  assertEquals(normalizeSpeakingFeedback({ fluency_and_coherence: "only one" }, "part1"), null);
  assertEquals(normalizeSpeakingFeedback(null, "part2"), null);
});
