import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  paceFor,
  readingWpm,
  rereadAdvice,
  savedWordsInText,
  sentencesOf,
  speedSummary,
  wordCount,
} from "./english-reading-depth.ts";
import { harvestCandidates, isCommonWord } from "./english-harvest.ts";

const TEXT = `## A new commute

Jasur commutes to work by metro. The carriages are always crowded at rush hour, but he decided to stay calm.

Yesterday the train was delayed, so he walked. *Walking* was quicker than waiting on the crowded platform.`;

Deno.test("reading depth: words are counted without markdown marks", () => {
  assertEquals(wordCount("## Title\n\n*One* two - three."), 4);
  assertEquals(wordCount(""), 0);
});

Deno.test("reading depth: words per minute only for believable timings", () => {
  assertEquals(readingWpm(300, 120), 150);
  assertEquals(readingWpm(300, 10), null, "under 15 seconds is not reading");
  assertEquals(readingWpm(300, 3600), null, "5 wpm: the tab was left open");
  assertEquals(readingWpm(2000, 60), null, "2000 wpm is skimming");
  assertEquals(readingWpm(20, 60), null, "too short to time");
  assertEquals(readingWpm(300, null), null);
});

Deno.test("reading depth: speed summary compares the last five readings with the five before", () => {
  const at = (day: number) => new Date(Date.UTC(2026, 9, day)).toISOString();
  const points = [80, 82, 85, 84, 86, 100, 104, 98, 102, 110].map((wpm, index) => ({ at: at(index + 1), wpm, level: "B1", accuracy: 0.8 }));
  const summary = speedSummary([...points, { at: at(20), wpm: 5000, level: "B1", accuracy: 1 }]);
  assertEquals(summary.points.length, 10, "an impossible timing is ignored");
  assertEquals(summary.latest, 110);
  assertEquals(summary.recent, 102);
  assertEquals(summary.previous, 84);
  assertEquals(summary.change, 21);
  assertEquals(summary.effective, Math.round((100 + 104 + 98 + 102 + 110) / 5 * 0.8));
  const few = speedSummary(points.slice(0, 3));
  assertEquals(few.previous, null);
  assertEquals(few.change, null);
});

Deno.test("reading depth: pace is judged against the level", () => {
  assertEquals(paceFor("B1", 60), "slow");
  assertEquals(paceFor("B1", 120), "typical");
  assertEquals(paceFor("B1", 200), "fast");
  assertEquals(paceFor("Z9", 120), null);
  assertEquals(paceFor("B1", null), null);
});

Deno.test("reading depth: what to read next follows comprehension, then pace", () => {
  assertEquals(rereadAdvice({ level: "B1", score: 40, wpm: 120 }), { action: "reread", level: "A2", pace: "typical" });
  assertEquals(rereadAdvice({ level: "A1", score: 20, wpm: null }).level, "A1");
  assertEquals(rereadAdvice({ level: "B1", score: 60, wpm: 120 }).action, "reread");
  assertEquals(rereadAdvice({ level: "B1", score: 60, wpm: 120 }).level, "B1");
  assertEquals(rereadAdvice({ level: "B1", score: 90, wpm: 130 }), { action: "harder", level: "B2", pace: "typical" });
  assertEquals(rereadAdvice({ level: "B1", score: 90, wpm: 60 }).action, "same", "accurate but slow: stay");
  assertEquals(rereadAdvice({ level: "B1", score: 100, wpm: 60 }).action, "harder");
  assertEquals(rereadAdvice({ level: "C2", score: 100, wpm: 300 }).action, "same");
  assertEquals(rereadAdvice({ level: "B2", score: null, wpm: 250 }).action, "harder");
  assertEquals(rereadAdvice({ level: "B2", score: null, wpm: 60 }).action, "easier");
  assertEquals(rereadAdvice({ level: null, score: 90, wpm: 100 }).action, "same");
});

Deno.test("reading depth: saved words are found in any simple form, with their sentence", () => {
  const matches = savedWordsInText(TEXT, [
    { id: "1", word: "commute" },
    { id: "2", word: "crowded" },
    { id: "3", word: "delay" },
    { id: "4", word: "rush hour" },
    { id: "5", word: "umbrella" },
    { id: "6", word: "a very long phrase here" },
  ]);
  assertEquals(matches.map((match) => match.id), ["1", "2", "3", "4"]);
  assertEquals(matches[0]!.forms, ["commute", "commutes"].filter((form) => matches[0]!.forms.includes(form)));
  assert(matches[0]!.forms.includes("commutes"));
  assertEquals(matches[2]!.forms, ["delayed"]);
  assertEquals(matches[2]!.sentence, "Yesterday the train was delayed, so he walked.");
  assertEquals(matches[3]!.forms, [], "phrases are not highlighted word by word");
  assertEquals(matches[3]!.sentence, "The carriages are always crowded at rush hour, but he decided to stay calm.");
});

Deno.test("reading depth: sentences drop headings and emphasis marks", () => {
  assertEquals(sentencesOf(TEXT)[0], "A new commute");
  assertEquals(sentencesOf(TEXT).at(-1), "Walking was quicker than waiting on the crowded platform.");
});

Deno.test("harvest: common words, names and saved words are not offered", () => {
  assert(isCommonWord("walked"));
  assert(isCommonWord("stopping"));
  assert(isCommonWord("studies"));
  assert(!isCommonWord("carriages"));
  const candidates = harvestCandidates([
    "Jasur commutes to work by metro.",
    "The carriages are always crowded, but Jasur stays calm.",
    "Delays are inevitable in Tashkent.",
  ], { exclude: ["crowded"] });
  const words = candidates.map((candidate) => candidate.word);
  assert(words.includes("carriages"));
  assert(words.includes("inevitable"));
  assert(!words.includes("jasur"), "a name is skipped");
  assert(!words.includes("tashkent"));
  assert(!words.includes("crowded"), "already saved");
  assert(!words.includes("always"));
  assertEquals(candidates[0]!.word, "inevitable", "longest first");
  assertEquals(candidates.find((candidate) => candidate.word === "carriages")!.sentence, "The carriages are always crowded, but Jasur stays calm.");
});

Deno.test("harvest: a capitalised word that also appears in lower case is a word, not a name", () => {
  const words = harvestCandidates(["Lightning struck twice.", "We saw lightning again."]).map((candidate) => candidate.word);
  assert(words.includes("lightning"));
});
