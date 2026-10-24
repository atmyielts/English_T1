import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { dictationFeedback, differsByEnding, gistQuestionIds, parseQuestions, publicQuestions, scoreDictation } from "./english-listening.ts";

Deno.test("listening depth: gist questions are marked, else the first one is used", () => {
  const questions = parseQuestions([
    { id: "q1", prompt: "Which platform?", options: ["2", "4"], answer_index: 1 },
    { id: "q2", prompt: "What is the conversation about?", options: ["A", "B"], answer_index: 0, focus: "gist" },
    { id: "q3", prompt: "When?", options: ["Now", "Later"], answer_index: 0, focus: "nonsense" },
  ]);
  assertEquals(questions[1]!.focus, "gist");
  assertEquals(questions[2]!.focus, undefined);
  assertEquals(gistQuestionIds(questions), ["q2"]);
  assertEquals(gistQuestionIds(questions.filter((question) => question.id !== "q2")), ["q1"]);
  assertEquals(gistQuestionIds([]), []);
  assertEquals(publicQuestions(questions)[1], { id: "q2", type: "mcq", prompt: "What is the conversation about?", options: ["A", "B"], focus: "gist" });
  assertEquals("focus" in publicQuestions(questions)[0]!, false);
});

Deno.test("listening depth: endings are recognised", () => {
  assertEquals(differsByEnding("walked", "walk"), true);
  assertEquals(differsByEnding("stopped", "stop"), true);
  assertEquals(differsByEnding("lived", "live"), true);
  assertEquals(differsByEnding("tickets", "ticket"), true);
  assertEquals(differsByEnding("leaving", "leave"), true);
  assertEquals(differsByEnding("train", "rain"), false);
  assertEquals(differsByEnding("walk", "walk"), false);
});

Deno.test("listening depth: dictation advice names what kind of thing was lost", () => {
  const results = [
    scoreDictation("The train to Samarkand leaves from platform four.", "train to Samarkand leave from platform 5"),
    scoreDictation("She's booked two tickets and we walked there.", "She booked two ticket and we walk their"),
  ];
  const issues = dictationFeedback(results);
  const byKind = Object.fromEntries(issues.map((issue) => [issue.kind, issue]));
  assertEquals(byKind.small_words?.examples, ["the"]);
  assertEquals(byKind.endings?.count, 3);
  assertEquals(byKind.endings?.examples, ["leave → leaves", "ticket → tickets", "walk → walked"]);
  assertEquals(byKind.numbers?.examples, ["5 → four"]);
  assertEquals(byKind.missed_words?.examples, ["their → there"]);
  assertEquals(byKind.contractions?.examples, ["she → she's"]);
  assertEquals(issues[0]!.kind, "endings", "the most frequent kind comes first");
});

Deno.test("listening depth: a perfect dictation has no advice", () => {
  assertEquals(dictationFeedback([scoreDictation("I live in Tashkent.", "I live in Tashkent")]), []);
});

Deno.test("listening depth: extra and spelling slips are reported", () => {
  const issues = dictationFeedback([scoreDictation("We need the documents tomorrow.", "We really need the documants tomorrow")]);
  const kinds = issues.map((issue) => issue.kind).sort();
  assertEquals(kinds, ["extra_words", "spelling"]);
  assertEquals(issues.find((issue) => issue.kind === "spelling")!.examples, ["documants → documents"]);
});
