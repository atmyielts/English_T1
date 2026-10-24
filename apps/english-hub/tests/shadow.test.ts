import { assert, assertAlmostEquals, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  alignEnvelopes,
  estimateModelEnvelope,
  estimateSpeechMs,
  expectedPauses,
  findPauses,
  FRAME_MS,
  resample,
  rhythmHints,
  rmsEnvelope,
  speechBounds,
  speechMs,
  splitForShadowing,
  syllables,
} from "../src/lib/shadow/envelope.ts";
import { matchSpoken, spokenDiff } from "../src/lib/spokenMatch.ts";

/** A fake envelope: silence, then `pattern` (1 = speech, 0 = quiet) frame by frame, then silence. */
const envelopeOf = (pattern: string, lead = 10, tail = 10): number[] => [
  ...new Array(lead).fill(0.001),
  ...[...pattern].map((char) => (char === "1" ? 0.3 : 0.001)),
  ...new Array(tail).fill(0.001),
];

Deno.test("rms envelope: one value per frame, louder input is louder", () => {
  const sampleRate = 1000;
  const quiet = new Float32Array(200).fill(0.01);
  const loud = new Float32Array(200).fill(0.5);
  const env = rmsEnvelope([...quiet, ...loud], sampleRate, FRAME_MS);
  assertEquals(env.length, 20);
  assertAlmostEquals(env[0]!, 0.01, 1e-6);
  assertAlmostEquals(env[19]!, 0.5, 1e-6);
});

Deno.test("speech bounds skip leading and trailing silence and ignore a single click", () => {
  assertEquals(speechBounds(envelopeOf("1111011", 5, 7)), { start: 5, end: 11 });
  assertEquals(speechBounds(new Array(40).fill(0.001)), null);
  assertEquals(speechBounds(envelopeOf("1", 5, 5)), null);
});

Deno.test("long pauses are found only inside the speech", () => {
  // 40 quiet frames = 800 ms in the middle; the 10-frame lead and tail do not count.
  const env = envelopeOf(`${"1".repeat(30)}${"0".repeat(40)}${"1".repeat(30)}${"0".repeat(10)}${"1".repeat(10)}`);
  const pauses = findPauses(env, { minMs: 600 });
  assertEquals(pauses, [{ atMs: 30 * FRAME_MS, ms: 40 * FRAME_MS }]);
  assertEquals(speechMs(env), 120 * FRAME_MS);
});

Deno.test("resampling keeps the shape and the length asked for", () => {
  assertEquals(resample([0, 0, 1, 1], 2), [0, 1]);
  assertEquals(resample([1, 3], 4), [1, 1, 3, 3]);
  assertEquals(resample([], 3), [0, 0, 0]);
});

Deno.test("aligned envelopes start and end with the speech, whatever the speed", () => {
  const model = estimateModelEnvelope("The next train leaves at seven.", 1800);
  const slow = envelopeOf("1".repeat(200), 50, 50);
  const aligned = alignEnvelopes(model, slow, 32);
  assertEquals(aligned.model.length, 32);
  assertEquals(aligned.learner.length, 32);
  assert(aligned.learner[0]! > 0.5 && aligned.learner[31]! > 0.5, "learner bars start and end with speech, not silence");
  assert(Math.max(...aligned.model) === 1 && Math.max(...aligned.learner) === 1, "both normalised to their own peak");
});

Deno.test("the model envelope follows syllables and pauses", () => {
  assertEquals(syllables("train"), 1);
  assertEquals(syllables("seven"), 2);
  assertEquals(syllables("beautiful"), 3);
  assertEquals(expectedPauses("Well, I think so. Do you?"), 2);
  const env = estimateModelEnvelope("Yes, no.", 1000);
  assertEquals(env.length, 1000 / FRAME_MS);
  const middle = env.slice(Math.floor(env.length * 0.45), Math.ceil(env.length * 0.55));
  assert(Math.min(...middle) < 0.05, "a comma leaves a gap in the middle");
  assert(estimateSpeechMs("one two three four five six", 0.75) > estimateSpeechMs("one two three four five six", 1));
});

Deno.test("rhythm hints: pace bands and pauses beyond the sentence's natural ones", () => {
  assertEquals(rhythmHints({ modelMs: 2000, learnerMs: 3000, text: "I am here." }).pace, "slow");
  assertEquals(rhythmHints({ modelMs: 2000, learnerMs: 1400, text: "I am here." }).pace, "fast");
  const good = rhythmHints({ modelMs: 2000, learnerMs: 2200, text: "Well, I am here." , pauses: [{ atMs: 300, ms: 700 }, { atMs: 900, ms: 800 }] });
  assertEquals(good.pace, "good");
  assertEquals(good.ratio, 1.1);
  assertEquals(good.extraPauses, 1, "one pause is the comma's");
  assertEquals(rhythmHints({ modelMs: 2000, learnerMs: null, text: "Hi there." }).pace, null);
});

Deno.test("long text is split into whole sentences of a comfortable size", () => {
  const text = "I live in Tashkent. It is a big city with many parks. In summer it is very hot, so we go to the mountains. We stay there for a week.";
  const pieces = splitForShadowing(text, 15);
  assertEquals(pieces, [
    "I live in Tashkent. It is a big city with many parks.",
    "In summer it is very hot, so we go to the mountains.",
    "We stay there for a week.",
  ]);
  assertEquals(splitForShadowing("No end punctuation here"), ["No end punctuation here"]);
});

Deno.test("spoken diff: score, missed words and extra words", () => {
  const diff = spokenDiff("The next train leaves at seven.", "um the train leaves at at seven");
  assertEquals(diff.words.map((entry) => (entry.heard ? entry.word : `-${entry.word}`)).join(" "), "The -next train leaves at seven.");
  assertEquals(diff.extra, ["um", "at"]);
  assertEquals(diff.score, 83);
  assertEquals(spokenDiff("Hello there", "").score, null);
  assertEquals(spokenDiff("I'd like a refund, please.", "I'd like a refund please").score, 100);
});

Deno.test("spoken diff agrees with the existing word match", () => {
  for (const [target, said] of [["The next train leaves at seven.", "the train leaves at seven"], ["Can I pay by card?", "can I pay with card"]] as const) {
    assertEquals(spokenDiff(target, said).words, matchSpoken(target, said));
  }
});
