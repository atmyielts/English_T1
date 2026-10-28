import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { foldSearch, ilikePattern, matchScore, rankSearch, type SearchLesson, searchTerms } from "./english-search.ts";

const lesson = (id: string, skill: string, title: string, level: string | null = "B1", tags: string[] = []): SearchLesson =>
  ({ id, skill, slug: id, title, level, tags });

const LESSONS: SearchLesson[] = [
  lesson("past-simple-a2", "grammar", "Past simple: regular verbs", "A2", ["past_simple"]),
  lesson("past-simple-b1", "grammar", "Past simple or present perfect?", "B1", ["past_simple"]),
  lesson("a-trip-to-samarkand", "reading", "A trip to Samarkand", "A2", ["travel"]),
  lesson("airport-talk", "listening", "At the airport", "B1", ["travel"]),
  lesson("job-interview", "speaking", "A job interview", "B2", ["work"]),
  lesson("pastries", "vocabulary", "Pastries and desserts", "A2"),
];
const SOURCES = {
  lessons: LESSONS,
  words: [{ id: "w1", word: "pastime", definition: "hobby" }, { id: "w2", word: "airport", definition: "aeroport" }],
  mistakes: [{ id: "m1", skill: "grammar", subskill: "grammar.past_simple", text: "I goed → I went", topic: "past_simple", lesson_slug: "past-simple-a2" }],
  rules: [{ slug: "past-simple-rule", title: "Past simple", level: "A2", focus_area: "past_simple" }],
};
const ALL_OPEN = { access: { owned: ["grammar", "reading", "listening", "speaking", "vocabulary"], freeLeft: 0 } };

Deno.test("query terms: folded, short queries ignored, CEFR levels pulled out", () => {
  assertEquals(searchTerms("a"), null);
  assertEquals(searchTerms("  "), null);
  assertEquals(searchTerms(42), null);
  assertEquals(searchTerms("Past B1"), { words: ["past"], levels: ["B1"], text: "past" });
  assertEquals(foldSearch("Oʻqish, CAFÉ!"), "oqish cafe");
});

Deno.test("match strength: whole title > prefix > word starts > inside > extra text", () => {
  assertEquals(matchScore(["past", "simple"], "Past simple"), 100);
  assertEquals(matchScore(["past"], "Past simple"), 80);
  assertEquals(matchScore(["simp"], "Past simple"), 60);
  assertEquals(matchScore(["imple"], "Past simple"), 40);
  assertEquals(matchScore(["travel"], "At the airport", "travel"), 20);
  assertEquals(matchScore(["cooking"], "At the airport", "travel"), 0);
});

Deno.test("ranked across lessons, rules, the learner's words and mistakes", () => {
  const results = rankSearch("past", SOURCES, { ...ALL_OPEN, learnerLevel: "A2" });
  const ids = results.map((result) => `${result.kind}:${result.id}`);
  // Own word first among prefix matches (personal boost), then the A2 lesson (closest level), the rule...
  assertEquals(ids.slice(0, 4), ["word:w1", "rule:past-simple-rule", "lesson:past-simple-a2", "lesson:pastries"]);
  assert(ids.includes("lesson:past-simple-b1"));
  const rule = results.find((result) => result.kind === "rule")!;
  assertEquals([rule.href, rule.access], ["/grammar/handbook#past-simple-rule", "open"]);
});

Deno.test("mistakes are found by the learner's own sentence and link to the lesson for that topic", () => {
  const [first] = rankSearch("goed", SOURCES, ALL_OPEN);
  assertEquals([first?.kind, first?.href, first?.skill], ["mistake", "/grammar/past-simple-a2", "grammar"]);
});

Deno.test("a level in the query filters lessons and rules and skips personal results", () => {
  const results = rankSearch("past b1", SOURCES, ALL_OPEN);
  assertEquals(results.map((result) => result.id), ["past-simple-b1"]);
  assertEquals(rankSearch("travel a2", SOURCES, ALL_OPEN).map((result) => result.id), ["a-trip-to-samarkand"]);
});

Deno.test("entitlement labels: open in the plan, free with today's free activity, otherwise locked (and ranked a little lower)", () => {
  const owned = rankSearch("airport", SOURCES, { access: { owned: ["listening"], freeLeft: 0 } });
  assertEquals(owned.find((result) => result.kind === "lesson")?.access, "open");
  const free = rankSearch("airport", SOURCES, { access: { owned: [], freeLeft: 1 } });
  assertEquals(free.find((result) => result.kind === "lesson")?.access, "free");
  const locked = rankSearch("airport", SOURCES, { access: { owned: [], freeLeft: 0 } });
  assertEquals(locked.map((result) => [result.kind, result.access]), [["word", "open"], ["lesson", "locked"]]);
});

Deno.test("results are capped and nothing matches nonsense", () => {
  const many = Array.from({ length: 40 }, (_, index) => lesson(`l${index}`, "reading", `Story ${index}`));
  assertEquals(rankSearch("story", { ...SOURCES, lessons: many }, { ...ALL_OPEN, limit: 5 }).length, 5);
  assertEquals(rankSearch("zzzz", SOURCES, ALL_OPEN), []);
});

Deno.test("ilike patterns escape wildcards", () => {
  assertEquals(ilikePattern("50%_off"), "%50\\%\\_off%");
  assertEquals(ilikePattern("a,b(c)"), "%a b c %");
});
