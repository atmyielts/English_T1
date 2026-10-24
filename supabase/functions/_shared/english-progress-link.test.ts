import { assert, assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  cleanLinkLabel,
  composePublicProgress,
  generateProgressToken,
  hashProgressToken,
  isProgressToken,
  progressPageUrl,
  tokenHint,
  topMistakes,
} from "./english-progress-link.ts";

Deno.test("tokens are 32 URL-safe characters that fit a Telegram start parameter", () => {
  const token = generateProgressToken();
  assertEquals(token.length, 32);
  assert(isProgressToken(token));
  assert(/^[A-Za-z0-9_-]+$/.test(token));
  assert(`pl_${token}`.length <= 64);
  assertNotEquals(generateProgressToken(), token);
  assertEquals(generateProgressToken(() => new Uint8Array(24).fill(255)), "_".repeat(32));
  assertEquals(isProgressToken("short"), false);
  assertEquals(isProgressToken(`${token}x`), false);
  assertEquals(isProgressToken("a".repeat(31) + "/"), false);
  assertEquals(isProgressToken(null), false);
});

Deno.test("only a hash is stored; the hint is the last four characters", async () => {
  const token = "abcdefghijklmnopqrstuvwxyzABCD_-";
  const hash = await hashProgressToken(token);
  assert(/^[0-9a-f]{64}$/.test(hash));
  assertEquals(await hashProgressToken(token), hash);
  assertNotEquals(await hashProgressToken(`${token.slice(0, -1)}x`), hash);
  assert(!hash.includes(token));
  assertEquals(tokenHint(token), "CD_-");
  assertEquals(progressPageUrl("https://english.schood.online/", token), `https://english.schood.online/p/${token}`);
});

Deno.test("link labels are short single lines without markup", () => {
  assertEquals(cleanLinkLabel("  Mum \n"), "Mum");
  assertEquals(cleanLinkLabel("<b>Teacher</b>"), "b Teacher /b");
  assertEquals(cleanLinkLabel("x".repeat(60))?.length, 40);
  assertEquals(cleanLinkLabel("   "), null);
  assertEquals(cleanLinkLabel(5), null);
});

Deno.test("top mistakes are categories and counts, never the learner's text", () => {
  const mistakes = topMistakes([
    { service_key: "grammar", subskill_key: "grammar.articles", error_frequency: 3, error_type: "I have a apple → an apple" } as never,
    { service_key: "writing", subskill_key: "grammar.articles", error_frequency: 2 },
    { service_key: "writing", subskill_key: "writing.coherence", error_frequency: 4 },
    { service_key: "academy_homework", skill_key: "speaking", subskill_key: "fluency", error_frequency: 1 },
    { service_key: "grammar", subskill_key: "grammar.past-simple", error_frequency: 1 },
    { service_key: "unknown", subskill_key: "x", error_frequency: 9 },
  ]);
  assertEquals(mistakes, [
    { kind: "topic", topic: "articles", count: 5 },
    { kind: "skill", skill: "writing", count: 4 },
    { kind: "skill", skill: "speaking", count: 1 },
  ]);
  assert(!JSON.stringify(mistakes).includes("apple"));
});

Deno.test("the public page carries only what a parent may see", () => {
  const progress = composePublicProgress({
    firstName: "Aziza",
    goal: { current_cefr_estimate: "B1", per_skill: { reading: { level: "B2" }, writing: "A2", bogus: "Z9" } },
    streak: 4.7,
    attempts: [
      { skill: "reading", submitted_at: "2026-10-26T05:00:00Z", seconds: 600 },
      { skill: "writing", submitted_at: "2026-10-27T05:00:00Z", seconds: 99_999 },
      { skill: "reading", submitted_at: "2026-10-10T05:00:00Z", seconds: 600 },
    ],
    weekFrom: "2026-10-25T19:00:00.000Z",
    weekTo: "2026-11-01T19:00:00.000Z",
    badges: [{ badge_key: "streak_3", earned_at: "2026-10-20T00:00:00Z" }, { badge_key: "first_activity", earned_at: "2026-10-26T00:00:00Z" }],
    mistakes: [{ service_key: "grammar", subskill_key: "grammar.tense", error_frequency: 2 }],
    now: new Date("2026-10-28T00:00:00Z"),
  });
  assertEquals(progress.level, { overall: "B1", per_skill: { reading: "B2", writing: "A2" } });
  assertEquals(progress.streak, 4);
  // Time on task is capped at an hour per activity.
  assertEquals(progress.week, { minutes: 70, activities: 2, active_days: 2, by_skill: { reading: 1, writing: 1 } });
  assertEquals(progress.achievements.map((badge) => badge.key), ["first_activity", "streak_3"]);
  assertEquals(Object.keys(progress).sort(), ["achievements", "first_name", "level", "mistakes", "streak", "updated_at", "week"]);
});
