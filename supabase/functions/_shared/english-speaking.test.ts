import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  appearsIn,
  buildSpeakingAIRequest,
  buildStats,
  countFillers,
  countSentences,
  coverCuePoints,
  fluencyScore,
  issuesFromFeedback,
  normalizeAIFeedback,
  ruleBasedFeedback,
  type SpeakingPromptInput,
} from "./english-speaking.ts";

const prompt: SpeakingPromptInput = {
  title: "Last weekend",
  prompt_text: "Tell a friend about your last weekend.",
  level: "A2",
  target_duration_seconds: 45,
  target_grammar: "past simple",
  target_vocabulary: ["visited", "relaxed", "weekend", "family", "cooked"],
  cue_points: ["where you went", "who you were with", "what you did", "how you felt"],
  cue_keywords: [["went", "go", "visited", "stayed", "home"], ["with", "family", "friend", "alone"], ["did", "played", "cooked", "watched", "walked"], ["felt", "happy", "tired", "great", "fun"]],
  model_answer: "Last weekend I visited my grandmother in Samarkand.",
};

const good = "Last weekend I went to my uncle's house with my family. We cooked plov together and then we played football in the garden. "
  + "In the evening we watched a film and talked a lot. I felt very happy because I don't see my cousins often.";

Deno.test("fillers count hesitation sounds and stock phrases, not 'like'", () => {
  assertEquals(countFillers("um I like it, uh, you know, it is er good"), 4);
});

Deno.test("sentences are only counted when there is punctuation", () => {
  assertEquals(countSentences("i went home i was tired"), null);
  assertEquals(countSentences("I went home. I was tired! Ok."), 2);
});

Deno.test("cue points are covered by keyword, including word forms", () => {
  const covered = coverCuePoints(prompt, good).map((cue) => cue.covered);
  assertEquals(covered, [true, true, true, true]);
  const partial = coverCuePoints(prompt, "I stayed home and slept.").map((cue) => cue.covered);
  assertEquals(partial, [true, false, false, false]);
});

Deno.test("pace is words per minute against the level band", () => {
  assertEquals(fluencyScore({ level: "A2", words: 60, speakingSeconds: 45, targetSeconds: 45, fillers: 0 }).pace, "steady");
  const slow = fluencyScore({ level: "A2", words: 20, speakingSeconds: 45, targetSeconds: 45, fillers: 0 });
  assertEquals(slow.pace, "slow");
  assert(slow.score < 70);
});

Deno.test("typed answers have no pace or fluency score", () => {
  const stats = buildStats(prompt, good, "typed", 50);
  assertEquals(stats.wpm, null);
  assertEquals(stats.fluency, null);
  assert(stats.sentences !== null);
});

Deno.test("basic feedback: a complete answer scores well and says it is basic", () => {
  const feedback = ruleBasedFeedback(prompt, good, "speech", 40);
  assertEquals(feedback.source, "basic");
  assertEquals(feedback.scores.grammar, null);
  assert(feedback.overall >= 75, `overall ${feedback.overall}`);
  assertEquals(feedback.corrections, []);
  assertEquals(feedback.model_answer_kind, "example");
  assert(feedback.strengths.length >= 1 && feedback.strengths.length <= 3);
});

Deno.test("basic feedback: a very short answer is capped and the tip names missed points", () => {
  const feedback = ruleBasedFeedback(prompt, "I stayed home.", "typed", null);
  assert(feedback.overall <= 25, `overall ${feedback.overall}`);
  assert(feedback.tip.includes("who you were with"));
});

Deno.test("AI corrections must quote the transcript; sound claims are dropped", () => {
  const transcript = "Last weekend I go to my uncle house with my family and we cooked plov. I felt happy.";
  const feedback = normalizeAIFeedback({
    cue_points_covered: [true, true, true, true],
    task_score: 85,
    vocabulary_score: "70",
    grammar_score: 140,
    strengths: ["You covered every point.", "Your pronunciation was clear."],
    corrections: [
      { said: "I go to my uncle house", better: "I went to my uncle's house", explanation: "Use the past simple for last weekend." },
      { said: "I visited Bukhara", better: "I visited Bukhara city", explanation: "Not in the transcript." },
      { said: "I felt happy", better: "I felt happy", explanation: "Same text." },
      { said: "we cooked plov", better: "we made plov", explanation: "Your accent made this unclear." },
      "nonsense",
    ],
    tip: "Practise the past simple of common verbs.",
    model_answer: "Last weekend I went to my uncle's house with my family.",
  }, prompt, transcript, "speech", 30);
  assert(feedback);
  assertEquals(feedback.source, "ai");
  assertEquals(feedback.scores.grammar, 100);
  assertEquals(feedback.scores.vocabulary, 70);
  assertEquals(feedback.strengths, ["You covered every point."]);
  assertEquals(feedback.corrections.map((c) => c.said), ["I go to my uncle house"]);
  assertEquals(feedback.model_answer_kind, "improved");
  assert(feedback.overall >= 0 && feedback.overall <= 100);
});

Deno.test("unusable AI output returns null so the caller falls back", () => {
  assertEquals(normalizeAIFeedback({ task_score: "high" }, prompt, good, "typed", null), null);
  assertEquals(normalizeAIFeedback(null, prompt, good, "typed", null), null);
  assertEquals(normalizeAIFeedback([], prompt, good, "typed", null), null);
});

Deno.test("wrong-length cue flags fall back to keyword coverage", () => {
  const feedback = normalizeAIFeedback({ cue_points_covered: [true], task_score: 80, vocabulary_score: 80, grammar_score: 80 }, prompt, "I stayed home.", "typed", null);
  assertEquals(feedback?.cue_points.map((cue) => cue.covered), [true, false, false, false]);
});

Deno.test("appearsIn ignores case and punctuation but needs whole words", () => {
  assert(appearsIn("i GO to", "Yesterday, I go to school."));
  assert(!appearsIn("go to sch", "I go to school"));
});

Deno.test("issues carry corrections and missed points for Review", () => {
  const feedback = ruleBasedFeedback(prompt, "I stayed home.", "typed", null);
  feedback.corrections = [{ said: "I go", better: "I went", explanation: "Past simple." }];
  const issues = issuesFromFeedback(feedback, "a2-last-weekend");
  assertEquals(issues[0]?.explanation, "\"I go\" → \"I went\"");
  assert(issues.some((issue) => issue.subskill_key === "speaking.task_completion"));
});

Deno.test("AI request never asks about pronunciation and carries the transcript", () => {
  const stats = buildStats(prompt, good, "speech", 40);
  const request = buildSpeakingAIRequest(prompt, good, "speech", stats);
  assert(request.systemPrompt.includes("never comment on pronunciation"));
  assertEquals(JSON.parse(request.userPayload).transcript, good);
});

Deno.test("phrase keywords match word forms in order", () => {
  const withPhrase = { ...prompt, target_vocabulary: ["struggle with", "fall behind", "a kilo of"] };
  const used = ruleBasedFeedback(withPhrase, "I struggled with maths and I was falling behind, so I bought a kilo of apples.", "typed", null).stats.target_words_used;
  assertEquals(used, ["struggle with", "fall behind", "a kilo of"]);
  const none = ruleBasedFeedback(withPhrase, "With maths I struggled. Behind them I fell.", "typed", null).stats.target_words_used;
  assertEquals(none, []);
});
