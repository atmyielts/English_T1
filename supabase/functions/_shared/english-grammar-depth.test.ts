import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { dueRechecks, gapAfter, unitMastery, type UnitAttempt } from "./english-grammar-mastery.ts";
import { checkGrammarAnswer, usesAllTiles, wordOrderTiles } from "./english-grammar.ts";
import { normalizeStudioItem } from "./english-content-studio.ts";

const NOW = new Date("2026-10-24T10:00:00Z");
const day = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString();
const run = (...entries: Array<[number, number | null]>): UnitAttempt[] => entries.map(([at, score]) => ({ submitted_at: day(at), score }));

Deno.test("mastery: levels from new to secure", () => {
  assertEquals(unitMastery([], NOW).name, "new");
  assertEquals(unitMastery(run([-1, 0.4]), NOW).name, "started");
  assertEquals(unitMastery(run([-1, 0.4], [-1, 0.7]), NOW).name, "practising");
  const secure = unitMastery(run([-1, 0.9]), NOW);
  assertEquals(secure.name, "secure");
  assertEquals(secure.passes, 1);
  assertEquals(secure.recheck_at, day(2), "first re-check three days after the pass");
  assertEquals(secure.recheck_due, false);
});

Deno.test("mastery: a pass right after another does not count; a spaced one does", () => {
  const sameDay = unitMastery(run([-10, 0.9], [-10, 1]), NOW);
  assertEquals(sameDay.passes, 1);
  assertEquals(sameDay.recheck_due, true, "the 3-day re-check is overdue");
  const spaced = unitMastery(run([-20, 0.9], [-16, 0.85]), NOW);
  assertEquals(spaced.passes, 2);
  assertEquals(spaced.recheck_at, day(-6), "next re-check 10 days after the second pass");
  assertEquals(spaced.recheck_due, true);
});

Deno.test("mastery: three spaced passes master a unit; re-checks then every 30 and 60 days", () => {
  const mastered = unitMastery(run([-40, 0.8], [-36, 0.9], [-25, 0.85]), NOW);
  assertEquals(mastered.name, "mastered");
  assertEquals(mastered.passes, 3);
  assertEquals(mastered.recheck_at, day(5));
  assertEquals(gapAfter(4), 60);
});

Deno.test("mastery: forgetting sets a unit back and asks for a re-check the next day", () => {
  const forgot = unitMastery(run([-40, 0.8], [-36, 0.9], [-3, 0.4]), NOW);
  assertEquals(forgot.name, "practising");
  assertEquals(forgot.passes, 1);
  assertEquals(forgot.recheck_at, day(-2));
  assertEquals(forgot.recheck_due, true);
  const recovered = unitMastery(run([-40, 0.8], [-36, 0.9], [-3, 0.4], [-2, 0.9]), NOW);
  assertEquals(recovered.name, "secure", "the pass after a set-back counts at once");
  assertEquals(recovered.passes, 2);
});

Deno.test("mastery: unscored attempts count as tried only", () => {
  const mastery = unitMastery(run([-1, null]), NOW);
  assertEquals(mastery.name, "started");
  assertEquals(mastery.best, null);
  assertEquals(mastery.recheck_at, null);
});

Deno.test("mastery: due re-checks, longest overdue first", () => {
  const units = [
    { slug: "a", mastery: unitMastery(run([-10, 0.9]), NOW) },
    { slug: "b", mastery: unitMastery(run([-1, 0.9]), NOW) },
    { slug: "c", mastery: unitMastery(run([-30, 0.9]), NOW) },
  ];
  assertEquals(dueRechecks(units).map((unit) => unit.slug), ["c", "a"]);
});

Deno.test("word order: tiles, full use and checking", () => {
  const prompt = "always / she / breakfast / at seven / has";
  assertEquals(wordOrderTiles(prompt), ["always", "she", "breakfast", "at seven", "has"]);
  assert(usesAllTiles(prompt, "She always has breakfast at seven."));
  assert(!usesAllTiles(prompt, "She always has breakfast."));
  assert(!usesAllTiles("one tile only", "one tile only"));
  const check = checkGrammarAnswer({ prompt, accepted: ["She always has breakfast at seven."], response: "she always has breakfast at seven" });
  assertEquals(check, { correct: true, typo: false, expected: "She always has breakfast at seven." });
  assertEquals(checkGrammarAnswer({ prompt, accepted: ["She always has breakfast at seven."], response: "She has always breakfast at seven" }).correct, false);
});

Deno.test("studio: word-order and transformation practice items are validated", () => {
  const base = {
    slug: "adverbs-of-frequency",
    title: "Adverbs of frequency",
    level: "A2",
    status: "published",
    focus_area: "present-simple",
    explanation_text: "x",
  };
  const ok = normalizeStudioItem("grammar", base, [
    { drill_type: "word_order", prompt_text: "always / she / late / is", accepted_answers: ["She is always late."] },
    { drill_type: "transformation", prompt_text: "Make it negative: She likes tea.", accepted_answers: ["She doesn't like tea.", "She does not like tea."] },
  ]);
  assert(ok.ok, JSON.stringify(!ok.ok ? ok.errors : null));
  assertEquals(ok.children.map((child) => child.title), ["Put the words in order", "Rewrite the sentence"]);
  const bad = normalizeStudioItem("grammar", base, [
    { drill_type: "word_order", prompt_text: "always / she / late / is", accepted_answers: ["She is late."] },
    { drill_type: "word_order", prompt_text: "no slashes here", accepted_answers: ["no slashes here"] },
  ]);
  assert(!bad.ok);
  assertEquals(bad.errors.map((error) => error.field).sort(), ["children[0].accepted_answers", "children[1].prompt_text"]);
});

Deno.test("next step: a grammar unit due for a re-check comes after reviews and mistakes", async () => {
  const { pickNextStep } = await import("./english-next.ts");
  const { TODAY_SKILLS } = await import("./english-today.ts");
  const unit = { id: "grammar-past", skill: "grammar" as const, slug: "past-simple", title: "Past simple", level: "A2" as const, minutes: 8, difficulty: 0.3 };
  const other = { id: "reading-one", skill: "reading" as const, slug: "one", title: "Reading one", level: "B1" as const, minutes: 10, difficulty: 0.5 };
  const input = {
    items: [unit, other],
    attempts: [],
    dueReviews: 0,
    fixes: [],
    rechecks: [unit],
    ratings: {},
    targetLevel: null,
    levelFor: () => "B1" as const,
    planTasks: [],
    access: { owned: [...TODAY_SKILLS], freeLeft: 0, freeItemIds: [] },
  };
  const result = pickNextStep(input);
  assertEquals(result.step?.reason, "grammar_recheck");
  assertEquals(result.step?.slug, "past-simple");
  assertEquals(pickNextStep({ ...input, dueReviews: 3 }).step?.reason, "review_due");
  assertEquals(pickNextStep({ ...input, rechecks: [] }).step?.reason === "grammar_recheck", false);
});
