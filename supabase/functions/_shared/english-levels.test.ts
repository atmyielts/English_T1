import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { appendLevelHistory, levelCheckStatus, perSkillLevels, readLevelHistory } from "./english-levels.ts";

Deno.test("an older placement becomes the first history entry", () => {
  const meta = { placement: { overall_level: "A2", per_skill: { reading: { level: "B1" }, writing: "A2", junk: "Z9" }, completed_at: "2026-09-01T10:00:00.000Z" } };
  assertEquals(readLevelHistory(meta), [{
    at: "2026-09-01T10:00:00.000Z",
    source: "placement",
    overall: "A2",
    per_skill: { reading: "B1", writing: "A2" },
  }]);
  assertEquals(readLevelHistory({}), []);
  assertEquals(perSkillLevels(null), {});
});

Deno.test("checks append to history and the next check is four weeks after the last one", () => {
  const meta: Record<string, unknown> = { placement: { overall_level: "A2", per_skill: {}, completed_at: "2026-09-01T10:00:00.000Z" } };
  assertEquals(levelCheckStatus(meta, new Date("2026-09-20T00:00:00Z")).due, false);
  assertEquals(levelCheckStatus(meta, new Date("2026-09-29T10:00:00Z")).due, true);
  meta.level_history = appendLevelHistory(meta, { at: "2026-10-01T10:00:00.000Z", source: "check", overall: "B1", per_skill: { reading: "B1" } });
  meta.level_history = appendLevelHistory(meta, { at: "2026-10-10T10:00:00.000Z", source: "level_up", overall: "B1", per_skill: { reading: "B2" } });
  assertEquals((meta.level_history as unknown[]).length, 3);
  // A move-up does not reset the monthly clock.
  assertEquals(levelCheckStatus(meta, new Date("2026-10-20T00:00:00Z")), {
    due: false,
    last_at: "2026-10-01T10:00:00.000Z",
    next_at: "2026-10-29T10:00:00.000Z",
  });
  assertEquals(levelCheckStatus({}, new Date()).due, false);
});
