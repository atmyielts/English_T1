import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  leaseUntil,
  libraryStoryFor,
  lockDecision,
  MAX_ATTEMPTS,
  parseStoryOutput,
  storyDate,
  storyPrompt,
  themeFor,
} from "./english-daily-story.ts";
import { publicQuestions } from "./english-reading.ts";

const NOW = new Date("2026-10-24T10:00:00Z");
const words = (count: number) => Array.from({ length: count }, (_, index) => (index % 12 === 11 ? "end." : "word")).join(" ");
const questions = [
  { prompt: "What is the story mainly about?", options: ["A lost phone", "A trip", "A party"], answer_index: 0, explanation: "Paragraph 1.", skill: "main_idea" },
  { prompt: "Where was the phone?", options: ["In a taxi", "At home", "In a cafe"], answer_index: 2, explanation: "\"…on the cafe table.\"", skill: "detail" },
  { prompt: "How does Lola feel at the end?", options: ["Angry", "Relieved", "Bored"], answer_index: 1, explanation: "She smiles.", skill: "inference" },
];

Deno.test("daily story: the day follows Uzbekistan time", () => {
  assertEquals(storyDate(new Date("2026-10-24T18:59:00Z")), "2026-10-24");
  assertEquals(storyDate(new Date("2026-10-24T19:00:00Z")), "2026-10-25");
});

Deno.test("daily story: lock decisions", () => {
  assertEquals(lockDecision({ status: "ready", locked_until: null, attempts: 1 }, NOW), "serve");
  assertEquals(lockDecision({ status: "generating", locked_until: leaseUntil(NOW), attempts: 1 }, NOW), "wait");
  assertEquals(lockDecision({ status: "generating", locked_until: "2026-10-24T09:00:00Z", attempts: 1 }, NOW), "take_over", "a dead writer's lease can be taken over");
  assertEquals(lockDecision({ status: "failed", locked_until: null, attempts: 1 }, NOW), "take_over");
  assertEquals(lockDecision({ status: "failed", locked_until: null, attempts: MAX_ATTEMPTS }, NOW), "fallback");
  assertEquals(lockDecision({ status: "generating", locked_until: null, attempts: MAX_ATTEMPTS }, NOW), "fallback");
});

Deno.test("daily story: prompt is small and themes rotate by date and level", () => {
  const prompt = storyPrompt("B1", "2026-10-24");
  assert(prompt.systemPrompt.length < 1200);
  assertEquals(JSON.parse(prompt.userPayload).level, "B1");
  const themes = new Set(Array.from({ length: 14 }, (_, day) => themeFor(`2026-10-${String(day + 1).padStart(2, "0")}`, "B1")));
  assert(themes.size > 5, "two weeks should not repeat one theme");
});

Deno.test("daily story: a good AI answer is accepted with exactly three questions", () => {
  const story = parseStoryOutput({ title: "“The lost phone”", text: `${words(80)}\n\n\n${words(80)}`, questions }, "B1")!;
  assertEquals(story.title, "The lost phone");
  assertEquals(story.questions.map((question) => question.id), ["q1", "q2", "q3"]);
  assertEquals(story.word_count, 160);
  assert(!story.body.includes("\n\n\n"));
  const shown = JSON.stringify(publicQuestions(story.questions));
  assert(!shown.includes("answer_index") && !shown.includes("explanation"));
});

Deno.test("daily story: wrong length, missing questions or repeated options are rejected", () => {
  assertEquals(parseStoryOutput({ title: "T", text: words(40), questions }, "B1"), null, "too short for B1");
  assertEquals(parseStoryOutput({ title: "T", text: words(400), questions }, "A1"), null, "too long for A1");
  assertEquals(parseStoryOutput({ title: "T", text: words(160), questions: questions.slice(0, 2) }, "B1"), null);
  assertEquals(parseStoryOutput({ title: "T", text: words(160), questions: [questions[0], questions[1], { ...questions[2], options: ["Yes", "yes", "No"] }] }, "B1"), null);
  assertEquals(parseStoryOutput({ title: "", text: words(160), questions }, "B1"), null);
  assertEquals(parseStoryOutput("not json", "B1"), null);
  assertEquals(parseStoryOutput(null, "B1"), null);
});

Deno.test("daily story: the library fallback is the same all day and prefers the level", () => {
  const article = (slug: string, level: string, count = 3) => ({
    slug,
    title: slug,
    level,
    content_markdown: words(150),
    questions: questions.slice(0, count).map((question, index) => ({ ...question, id: `q${index + 1}` })),
  });
  const library = [article("b1-a", "B1"), article("b1-b", "B1"), article("b2-a", "B2"), article("b1-short", "B1", 2)];
  const first = libraryStoryFor(library, "B1", "2026-10-24")!;
  assertEquals(libraryStoryFor(library, "B1", "2026-10-24")!.slug, first.slug);
  assert(["b1-a", "b1-b"].includes(first.slug), "texts with fewer than three choice questions are skipped");
  assertEquals(first.questions.length, 3);
  assertEquals(libraryStoryFor(library, "C1", "2026-10-24")!.slug, "b2-a", "nearest level when none at the level");
  assertEquals(libraryStoryFor([], "B1", "2026-10-24"), null);
});
