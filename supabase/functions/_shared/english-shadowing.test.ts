import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildShadowSets,
  decideShadowLog,
  levelsNear,
  parseShadowLog,
  shadowRatio,
  shadowSentences,
  speakableText,
  type ShadowSourceRow,
} from "./english-shadowing.ts";

Deno.test("speakable text drops markdown, headings and speaker labels", () => {
  const text = speakableText("## A day out\n**Anna:** Hi!\nTom: Shall we take the *early* train today?\n- Pack a [map](https://x.y) first.");
  assertEquals(text.split("\n"), ["A day out", "Anna: Hi!", "Shall we take the early train today?", "Pack a map first."]);
});

Deno.test("shadowing sentences are a comfortable length, once each, in order", () => {
  const source = [
    "# Title without a full stop",
    "Tom: Shall we take the early train today? Yes. It leaves at seven from platform two.",
    "Anna: Shall we take the early train today?",
    "Prices: 10, 20, 30, 40, 50 and 60.",
    "This sentence is far too long to repeat comfortably in one breath because it keeps going and going without any pause at all.",
  ].join("\n");
  assertEquals(shadowSentences(source), [
    "Shall we take the early train today?",
    "It leaves at seven from platform two.",
  ]);
});

Deno.test("levels are tried nearest first", () => {
  assertEquals(levelsNear("B1"), ["B1", "A2", "B2", "A1", "C1", "C2"]);
  assertEquals(levelsNear("A1"), ["A1", "A2", "B1", "B2", "C1", "C2"]);
});

const row = (kind: "listening" | "reading", slug: string, level: string, count = 6): ShadowSourceRow => ({
  kind,
  slug,
  title: slug,
  level,
  text: Array.from({ length: count }, (_, i) => `Sentence number ${i + 1} from ${slug} is here.`).join(" "),
});

Deno.test("sets prefer the requested level, alternate sources and fall back to near levels", () => {
  const rows = [row("listening", "l-b1", "B1"), row("reading", "r-b1", "B1"), row("reading", "r-a2", "A2"), row("listening", "short", "B1", 2)];
  const sets = buildShadowSets(rows, { level: "B1", seed: 1, maxSets: 3, perSet: 4 });
  assertEquals(sets.map((set) => set.id), ["listening:l-b1", "reading:r-b1", "reading:r-a2"]);
  assertEquals(sets[0]!.sentences.length, 4);
  assertEquals(sets[2]!.level, "A2");
  assertEquals(buildShadowSets(rows, { level: "B1", seed: 1 }), buildShadowSets(rows, { level: "B1", seed: 1 }), "stable for a day");
});

Deno.test("a take is logged only with real words and speaking time", () => {
  assertEquals(parseShadowLog({ score: 82.4, words: 9, seconds: 3, source: "reading" }), { score: 82, words: 9, seconds: 3, source: "reading" });
  assertEquals(parseShadowLog({ score: null, words: 9, seconds: 3, source: "nope" }), { score: null, words: 9, seconds: 3, source: "shadowing" });
  assertEquals(parseShadowLog({ score: 80, words: 2, seconds: 3 }), null);
  assertEquals(parseShadowLog({ score: 80, words: 9, seconds: 0 }), null);
  assertEquals(parseShadowLog({ score: "lots", words: 9, seconds: 3 }), null);
  assertEquals(parseShadowLog(null), null);
});

Deno.test("logging is capped per day and respects a paused speaking service", () => {
  assertEquals(decideShadowLog({ loggedToday: 0, paused: false }), { log: true, reason: "ok", left: 4 });
  assertEquals(decideShadowLog({ loggedToday: 5, paused: false }), { log: false, reason: "daily_cap", left: 0 });
  assertEquals(decideShadowLog({ loggedToday: 1, paused: true }).log, false);
  assert(shadowRatio({ score: null }) < 1, "no word check never counts as perfect");
  assertEquals(shadowRatio({ score: 90 }), 0.9);
});
