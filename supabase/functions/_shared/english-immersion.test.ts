import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  applyJudgement,
  basicCorrections,
  basicReplyCheck,
  checkChoices,
  matchPoints,
  minWordsFor,
  missionScore,
  ownWordCount,
  parseQuestions,
  publicQuestions,
  stepKind,
} from "./english-immersion.ts";

const expectedChoices = {
  questions: [
    { id: "q1", prompt: "When is the viewing?", options: ["Monday", "Tuesday", "Friday"], answer: 1, explanation: "The note says Tuesday." },
    { id: "q2", prompt: "What should you bring?", options: ["Passport", "Photo"], answer: 0, explanation: "Bring your passport." },
    { id: "bad", prompt: "Broken", options: ["Only one"], answer: 0 },
  ],
};

Deno.test("step types map old and new names", () => {
  assertEquals(stepKind("read"), "read");
  assertEquals(stepKind("listening"), "listen");
  assertEquals(stepKind("writing"), "reply");
  assertEquals(stepKind("speak"), "speak");
  assertEquals(stepKind("decision"), null);
});

Deno.test("public questions never contain the key", () => {
  const visible = publicQuestions(expectedChoices);
  assertEquals(visible.length, 2);
  for (const question of visible) {
    assertEquals(Object.keys(question).sort(), ["id", "options", "prompt"]);
  }
});

Deno.test("choice answers are checked by index; invalid input counts as unanswered", () => {
  const questions = parseQuestions(expectedChoices);
  const { results, score } = checkChoices(questions, { q1: 1, q2: 5 });
  assertEquals(results[0]!.correct, true);
  assertEquals(results[1]!.chosen, null);
  assertEquals(results[1]!.correct, false);
  assertEquals(score, 0.5);
  assertEquals(checkChoices(questions, "nonsense").score, 0);
});

const reschedule = {
  goal: "Reply to the clinic and move the appointment.",
  points: [
    { label: "say you cannot come", any: ["can't come", "cannot come", "can't make it", "won't be able", "not able to come", "unable"] },
    { label: "ask for a new time", any: ["another time", "another day", "reschedul*", "change the time", "move the appointment", "later", "next week"] },
    { label: "say thank you", any: ["thank*"] },
  ],
};
const clinicPrompt = "The clinic wrote: Your appointment is on Monday at 9:00. Please reply if you cannot come. You can move the appointment online.";

Deno.test("synonyms copied from the prompt earn nothing", () => {
  // "cannot come" and "move the appointment" are in the prompt, so they do not count.
  const copied = matchPoints({ prompt: clinicPrompt, response: "I cannot come. Please move the appointment.", points: reschedule.points });
  assertEquals(copied, [
    { label: "say you cannot come", met: false },
    { label: "ask for a new time", met: false },
    { label: "say thank you", met: false },
  ]);
  const own = matchPoints({ prompt: clinicPrompt, response: "Sorry, I can't make it on Monday. Could I reschedule for next week? Thanks!", points: reschedule.points });
  assertEquals(own.every((point) => point.met), true);
});

Deno.test("a point with only prompt words is left out instead of being impossible", () => {
  const points = matchPoints({ prompt: "Please reply today.", response: "OK", points: [{ label: "reply", any: ["reply"] }] });
  assertEquals(points, []);
});

Deno.test("own words exclude words already in the task text", () => {
  assertEquals(ownWordCount("Please reply if you cannot come", "Please reply if you cannot come"), 0);
  assertEquals(ownWordCount("Please reply", "I am sorry, please"), 3);
});

Deno.test("basic check: copying the prompt scores zero", () => {
  const check = basicReplyCheck({ kind: "reply", level: "A2", prompt: clinicPrompt, response: clinicPrompt, expected: reschedule });
  assertEquals(check.score, 0);
  assertEquals(check.achieved, false);
  assertEquals(check.feedback_mode, "basic");
});

Deno.test("basic check: a real reply that covers the points scores well", () => {
  const response = "Hello, I am sorry but I can't make it on Monday because I have an exam. Could we reschedule for another day next week? Thank you very much.";
  const check = basicReplyCheck({ kind: "reply", level: "A2", prompt: clinicPrompt, response, expected: reschedule });
  assert(check.score >= 0.95, `score ${check.score}`);
  assertEquals(check.achieved, true);
  assertEquals(check.too_short, false);
});

Deno.test("basic check: short replies lose the length part and are flagged", () => {
  const check = basicReplyCheck({ kind: "reply", level: "B1", prompt: clinicPrompt, response: "Sorry, can't make it. Reschedule? Thanks", expected: reschedule });
  assertEquals(check.too_short, true);
  assertEquals(check.score, 0.6);
});

Deno.test("minimum length depends on level and kind, with an override", () => {
  assertEquals(minWordsFor("reply", "A2"), 20);
  assertEquals(minWordsFor("speak", "C1"), 35);
  assertEquals(minWordsFor("reply", "B2", { min_words: 25 }), 25);
  assertEquals(minWordsFor("reply", "zz"), 30);
});

Deno.test("basic corrections fix lowercase i and missing capitals/punctuation in typed replies only", () => {
  const fixes = basicCorrections("hello, yes i can come on friday", "reply");
  assertEquals(fixes.length, 2);
  assertEquals(fixes[0], { original: "hello, yes i can come", better: "hello, yes I can come", explanation: "Write \"I\" with a capital letter." });
  assertEquals(fixes[1]!.better, "Hello, yes i");
  assertEquals(basicCorrections("hello i can come", "speak"), []);
  assertEquals(basicCorrections("I can come on Friday. Best, Aziz", "reply"), []);
  assertEquals(basicCorrections("I can come. See you on Friday morning then", "reply"), []);
  assertEquals(basicCorrections("I can come. The meeting room on the left is fine", "reply")[0]!.better, "left is fine.");
});

Deno.test("AI judgement is validated: unknown labels, invented corrections and bad tone are dropped", () => {
  const response = "Hello, sorry but I can't make it on Monday. Can I come another day next week? Thank you.";
  const check = applyJudgement({
    raw: {
      achieved: true,
      points_met: ["say you cannot come", "ASK FOR A NEW TIME", "made-up point"],
      tone: "excellent",
      tone_note: "Polite and clear.",
      corrections: [
        { original: "Can I come another day", better: "Could I come on another day", explanation: "More polite." },
        { original: "words that are not in the reply", better: "x", explanation: "y" },
        { original: "Thank you", better: "Thank you", explanation: "same" },
      ],
      summary: "You did the task.",
    },
    kind: "reply",
    level: "A2",
    prompt: clinicPrompt,
    response,
    expected: reschedule,
  });
  assert(check);
  assertEquals(check.feedback_mode, "ai");
  assertEquals(check.points.filter((point) => point.met).map((point) => point.label), ["say you cannot come", "ask for a new time"]);
  assertEquals(check.tone, null);
  assertEquals(check.corrections.length, 1);
  // 2/3 coverage * 0.5 + achieved 0.3 + unknown tone 0.75 * 0.2
  assert(Math.abs(check.score - (2 / 3 * 0.5 + 0.3 + 0.15)) < 1e-9, `score ${check.score}`);
});

Deno.test("AI judgement without usable fields falls back; AI cannot rescue a copied prompt", () => {
  assertEquals(applyJudgement({ raw: { summary: "hi" }, kind: "reply", level: "B1", prompt: "", response: "x", expected: reschedule }), null);
  const copied = applyJudgement({
    raw: { achieved: true, points_met: ["say you cannot come"], tone: "good" },
    kind: "reply",
    level: "B1",
    prompt: clinicPrompt,
    response: "Please reply if you cannot come.",
    expected: reschedule,
  });
  assertEquals(copied?.score, 0);
});

Deno.test("mission score is the mean of step scores", () => {
  assertEquals(missionScore([1, 0.5, 0]), 0.5);
  assertEquals(missionScore([]), 0);
});
