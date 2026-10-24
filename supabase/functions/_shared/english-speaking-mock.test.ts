import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  CUE_CARDS,
  decideMockStart,
  issuesFromMock,
  learnerWeekStart,
  MOCK_FREE_PER_WEEK,
  MOCK_OWNER_PER_DAY,
  MOCK_PART1_QUESTIONS,
  mockAnswersProblem,
  overallBand,
  parseMockAnswers,
  parseMockScore,
  PART1_TOPICS,
  pickMockQuestions,
  readMockQuestions,
  roundBand,
  seededRandom,
} from "./english-speaking-mock.ts";

const questions = pickMockQuestions(seededRandom(42));

const sentence = (words: number) => Array.from({ length: words }, (_, i) => (i === 0 ? "Well" : "word")).join(" ");

const answersWith = (mode: "speech" | "typed", part2Words = 120) =>
  parseMockAnswers({
    part1: questions.part1.map(() => ({ text: `I am a student and I study economics at university. ${sentence(10)}`, mode, seconds: 20 })),
    part2: { text: `My most helpful person is my teacher. ${sentence(part2Words)}`, mode, seconds: 110 },
    part3: questions.part3.map(() => ({ text: sentence(30), mode, seconds: 40 })),
  }, questions);

Deno.test("question bank is valid and picks are deterministic", () => {
  assert(PART1_TOPICS.length >= 6 && CUE_CARDS.length >= 6);
  for (const card of CUE_CARDS) {
    assert(card.points.length === 4 && card.part3.length >= 3, card.id);
    assert(/^[a-z0-9-]+$/.test(card.id));
  }
  assertEquals(questions.part1.length, MOCK_PART1_QUESTIONS);
  assertEquals(questions.part1[0]!.topic, "work-study");
  assertEquals(new Set(questions.part1.map((q) => q.topic)).size, 3);
  assertEquals(questions.part3.length, 3);
  assertEquals(pickMockQuestions(seededRandom(42)), questions);
  // A recent cue card is avoided while others remain.
  const recent = CUE_CARDS.filter((card) => card.id !== "goal").map((card) => card.id);
  assertEquals(pickMockQuestions(seededRandom(7), recent).part2.id, "goal");
  assertEquals(readMockQuestions(JSON.parse(JSON.stringify(questions))), questions);
  assertEquals(readMockQuestions({}), null);
});

Deno.test("limits: one free mock a learner week, five a day with Speaking", () => {
  assertEquals(decideMockStart({ admin: false, ownsSpeaking: false, startedToday: 0, startedThisWeek: 0 }).allowed, true);
  const used = decideMockStart({ admin: false, ownsSpeaking: false, startedToday: 0, startedThisWeek: MOCK_FREE_PER_WEEK });
  assertEquals([used.allowed, used.per, used.left], [false, "week", 0]);
  assertEquals(decideMockStart({ admin: false, ownsSpeaking: true, startedToday: MOCK_OWNER_PER_DAY - 1, startedThisWeek: 20 }).allowed, true);
  const capped = decideMockStart({ admin: false, ownsSpeaking: true, startedToday: MOCK_OWNER_PER_DAY, startedThisWeek: 20 });
  assertEquals([capped.allowed, capped.per, capped.basis], [false, "day", "owner"]);
  assertEquals(decideMockStart({ admin: true, ownsSpeaking: false, startedToday: 0, startedThisWeek: 9 }).basis, "admin");
});

Deno.test("learner week starts on Monday 00:00 in Uzbekistan (UTC+5)", () => {
  // Sunday 2026-10-25 20:00 UTC is already Monday 01:00 in Tashkent.
  assertEquals(learnerWeekStart(new Date("2026-10-25T20:00:00Z")), "2026-10-25T19:00:00.000Z");
  // Sunday 2026-10-25 18:00 UTC is still Sunday in Tashkent: the week began Monday 19th.
  assertEquals(learnerWeekStart(new Date("2026-10-25T18:00:00Z")), "2026-10-18T19:00:00.000Z");
});

Deno.test("answers are bounded and checked for length", () => {
  const answers = answersWith("speech");
  assertEquals(answers.part1.length, questions.part1.length);
  assertEquals(answers.part2.mode, "speech");
  assertEquals(mockAnswersProblem(answers), null);
  assertEquals(mockAnswersProblem(answersWith("speech", 5)), "part2_too_short");
  assertEquals(mockAnswersProblem(parseMockAnswers({}, questions)), "too_short");
  const long = parseMockAnswers({ part2: { text: "word ".repeat(2000), mode: "speech", seconds: 9999 } }, questions);
  assert(long.part2.text.length <= 3500);
  assertEquals(long.part2.seconds, 150);
  // Typed answers carry no speaking time.
  assertEquals(parseMockAnswers({ part2: { text: "hello there", mode: "typed", seconds: 30 } }, questions).part2.seconds, null);
});

Deno.test("bands round to half bands; overall follows IELTS rounding", () => {
  assertEquals(roundBand(6.3), 6.5);
  assertEquals(roundBand(6.2), 6);
  assertEquals(roundBand(12), 9);
  assertEquals(roundBand("x"), null);
  assertEquals(roundBand(0), null);
  assertEquals(overallBand([6, 6.5, 6, 6.5]), 6.5); // 6.25 → 6.5
  assertEquals(overallBand([7, 7, 7, 6]), 7); // 6.75 → 7
  assertEquals(overallBand([6, 6, 6, 6.5]), 6); // 6.125 → 6
  assertEquals(overallBand([6, 7, null, null]), 6.5);
});

Deno.test("score validation: clamps, quotes, pronunciation only when spoken", () => {
  const spoken = answersWith("speech");
  const raw = {
    bands: { fluency: 6.2, lexical: 6, grammar: 5.5, pronunciation: 9 },
    comments: { fluency: "Good pace.", lexical: "Some range.", grammar: "Simple forms.", pronunciation: "Clear." },
    priorities: [
      { criterion: "fluency", text: "Extend answers with a reason.", practice: "roleplay" },
      { criterion: "grammar", text: "Use past forms.", practice: "nonsense" },
      { criterion: "made-up", text: "x" },
      { criterion: "lexical", text: "Learn topic words.", practice: "vocabulary" },
    ],
    fixes: [{ said: "I am a student and I study", better: "I'm a student and I'm studying", why: "Style." }, { said: "I has a dog", better: "I have a dog", why: "Agreement" }],
  };
  const result = parseMockScore(raw, spoken)!;
  assertEquals(result.bands.fluency, 6);
  // Pronunciation from a transcript is kept within one band of the text bands.
  assertEquals(result.bands.pronunciation, 7);
  assertEquals(result.overall, overallBand([6, 6, 5.5, 7]));
  assertEquals(result.priorities.map((p) => [p.criterion, p.practice]), [["fluency", "roleplay"], ["grammar", "grammar"], ["lexical", "vocabulary"]]);
  assertEquals(result.fixes.length, 1); // "I has a dog" was never said
  assertEquals(result.pronunciation_note, "transcript_only");
  assertEquals(issuesFromMock(result).length, 1);

  const typed = parseMockScore({ ...raw, priorities: [{ criterion: "pronunciation", text: "x" }, ...raw.priorities] }, answersWith("typed"))!;
  assertEquals(typed.bands.pronunciation, null);
  assertEquals(typed.comments.pronunciation, null);
  assertEquals(typed.pronunciation_note, "not_assessed");
  assert(!typed.priorities.some((p) => p.criterion === "pronunciation"));
  assertEquals(typed.overall, overallBand([6, 6, 5.5]));

  assertEquals(parseMockScore(null, spoken), null);
  assertEquals(parseMockScore({ bands: { fluency: 6 } }, spoken), null);
  assertEquals(parseMockScore({ ...raw, priorities: [] }, spoken), null);
});
