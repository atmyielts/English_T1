import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  levelChangesBetween,
  pickNextFocus,
  summarizeWeek,
  topicLabel,
  type WeeklyReportFacts,
  weeklyReportText,
} from "./english-weekly-report.ts";

const from = "2026-10-25T19:00:00.000Z"; // Monday 00:00 in Tashkent
const to = "2026-11-01T19:00:00.000Z";

Deno.test("a week's practice: minutes, activities by skill and active Tashkent days", () => {
  const week = summarizeWeek([
    { skill: "reading", submitted_at: "2026-10-25T19:30:00Z", seconds: 300 }, // Monday 00:30 local
    { skill: "reading", submitted_at: "2026-10-26T18:30:00Z", seconds: 300 }, // Monday 23:30 local
    { skill: "grammar", submitted_at: "2026-10-27T10:00:00Z", seconds: null },
    { skill: "vocabulary", submitted_at: "2026-10-25T18:00:00Z", seconds: 900 }, // Sunday before
    { skill: "tutor", submitted_at: "2026-10-27T10:00:00Z", seconds: 900 }, // not a skill
  ], from, to);
  assertEquals(week, { minutes: 10, activities: 3, active_days: 2, by_skill: { reading: 2, grammar: 1 } });
});

Deno.test("level changes during the week compare with the level before it", () => {
  const history = [
    { at: "2026-10-01T00:00:00Z", source: "placement" as const, overall: "A2" as const, per_skill: { reading: "A2" as const, grammar: "A2" as const } },
    { at: "2026-10-27T00:00:00Z", source: "level_up" as const, overall: "A2" as const, per_skill: { reading: "B1" as const, grammar: "A2" as const } },
  ];
  assertEquals(levelChangesBetween(history, from, to), [{ skill: "reading", from: "A2", to: "B1" }]);
  assertEquals(levelChangesBetween(history, "2026-11-02T00:00:00Z", "2026-11-09T00:00:00Z"), []);
  const first = [{ at: "2026-10-27T00:00:00Z", source: "placement" as const, overall: "B1" as const, per_skill: { reading: "B1" as const } }];
  assertEquals(levelChangesBetween(first, from, to), [{ skill: "overall", from: null, to: "B1" }, { skill: "reading", from: null, to: "B1" }]);
});

Deno.test("next week's focus: a repeated grammar topic, then a skipped skill, then the habit", () => {
  const week = { minutes: 30, activities: 4, active_days: 2, by_skill: { reading: 3, grammar: 1 } };
  assertEquals(pickNextFocus({ topics: [{ topic: "articles", count: 1 }, { topic: "present-perfect", count: 3 }], week, practised: ["reading"] }), { kind: "topic", topic: "present-perfect" });
  assertEquals(pickNextFocus({ topics: [{ topic: "articles", count: 1 }], week, practised: ["reading", "grammar", "listening"] }), { kind: "skill", skill: "listening" });
  assertEquals(pickNextFocus({ topics: [], week, practised: ["reading", "grammar"] }), { kind: "habit" });
  assertEquals(topicLabel("present-perfect"), "present perfect");
});

const facts = (patch: Partial<WeeklyReportFacts> = {}): WeeklyReportFacts => ({
  firstName: "Aziza",
  week: { minutes: 95, activities: 9, active_days: 5, by_skill: { reading: 4, listening: 3, grammar: 2 } },
  xp: 180,
  streak: 12,
  levelChanges: [{ skill: "reading", from: "A2", to: "B1" }],
  focus: { kind: "topic", topic: "present-perfect" },
  ...patch,
});

Deno.test("the learner's report lists the week, levels and focus", () => {
  const text = weeklyReportText("en", facts(), "learner");
  assertStringIncludes(text, "Your English week");
  assertStringIncludes(text, "95 min");
  assertStringIncludes(text, "9 activities on 5 of 7 days");
  assertStringIncludes(text, "Reading 4 · Listening 3 · Grammar 2");
  assertStringIncludes(text, "180 XP");
  assertStringIncludes(text, "12-day streak");
  assertStringIncludes(text, "Reading: A2 → <b>B1</b>");
  assertStringIncludes(text, "grammar: present perfect");
  assert(text.length < 4096);
});

Deno.test("the parent's report names the learner (escaped) and works in Russian and Uzbek", () => {
  const ru = weeklyReportText("ru", facts({ firstName: "<Aziza>" }), "parent");
  assertStringIncludes(ru, "Неделя английского: &lt;Aziza&gt;");
  assert(!ru.includes("<Aziza>"));
  assertStringIncludes(ru, "Чтение: A2 → <b>B1</b>");
  const uz = weeklyReportText("uz", facts({ focus: { kind: "skill", skill: "speaking" } }), "parent");
  assertStringIncludes(uz, "«Gapirish» boʻlimidan mashq");
  const nameless = weeklyReportText("en", facts({ firstName: "" }), "parent");
  assertStringIncludes(nameless, "Learner's English week");
});

Deno.test("a quiet week gets an encouraging line instead of zeros", () => {
  const text = weeklyReportText("en", facts({ week: { minutes: 0, activities: 0, active_days: 0, by_skill: {} }, xp: 0, streak: 0, levelChanges: [], focus: { kind: "habit" } }), "learner");
  assertStringIncludes(text, "No practice this week");
  assert(!text.includes("0 min"));
  assertStringIncludes(text, "a little English every day");
});
