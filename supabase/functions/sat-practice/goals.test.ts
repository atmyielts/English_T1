import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { computeStreak, goalsSet, validGoalPatch } from "./goals.ts";

const today = "2026-10-24";
const current = { target_score: 1400, test_date: null, hours_per_week: 3, metadata: { theme: "kept" } };

Deno.test("Goal patches keep omitted fields, mark onboarding and never clamp silently", () => {
  assertEquals(validGoalPatch({ target_score: 1500, metadata: { onboarding_completed: true, injected: 1 } }, current, today),
    { value: { target_score: 1500, test_date: null, hours_per_week: 3, metadata: { theme: "kept", onboarding_completed: true } } });
  assertEquals(validGoalPatch({ test_date: "2026-12-05", hours_per_week: 6 }, current, today).hasOwnProperty("value"), true);
  for (const [body, code] of [
    [{ target_score: 1700 }, "invalid_target"], [{ target_score: 1405 }, "invalid_target"], [{ target_score: "abc" }, "invalid_target"],
    [{ hours_per_week: 0 }, "invalid_hours"], [{ hours_per_week: 2.5 }, "invalid_hours"],
    [{ test_date: "2026-02-30" }, "invalid_test_date"], [{ test_date: "tomorrow" }, "invalid_test_date"],
    [{ test_date: "2026-10-01" }, "past_test_date"], [{ test_date: "2030-01-01" }, "invalid_test_date"],
  ] as const) assertEquals((validGoalPatch(body, current, today) as { code: string }).code, code, JSON.stringify(body));
  // An already-saved past date may be kept while other fields change; clearing it is allowed.
  assertEquals("value" in validGoalPatch({ test_date: "2026-10-01", hours_per_week: 4 }, { ...current, test_date: "2026-10-01" }, today), true);
  assertEquals((validGoalPatch({ test_date: "" }, { ...current, test_date: "2026-11-01" }, today) as { value: { test_date: null } }).value.test_date, null);
});

Deno.test("Only onboarding or a chosen test date counts as a set goal", () => {
  assertEquals(goalsSet(current), false);
  assertEquals(goalsSet({ ...current, metadata: { onboarding_completed: true } }), true);
  assertEquals(goalsSet({ ...current, test_date: "2026-12-05" }), true);
  assertEquals(goalsSet(null), false);
});

Deno.test("Streaks count consecutive practice days and survive an unpractised today", () => {
  const rows = [{ day: "2026-10-23", attempts: 1 }, { day: "2026-10-22", minutes_studied: 4 }, { day: "2026-10-20", attempts: 2 }];
  assertEquals(computeStreak(rows, today), 2);
  assertEquals(computeStreak([...rows, { day: today, attempts: 1 }], today), 3);
  assertEquals(computeStreak([{ day: "2026-10-21", attempts: 1 }], today), 0);
  assertEquals(computeStreak([{ day: "2026-10-23", attempts: 0, minutes_studied: 0 }], today), 0);
});
