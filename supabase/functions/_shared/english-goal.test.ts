import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  attemptMinutes,
  buildGoalPlan,
  type GoalInput,
  hoursToTarget,
  isGoalDate,
  learnerDate,
  MAX_SESSION_MINUTES,
  parseGoalUpdate,
  readCurrentLevels,
  readGoalDate,
  weekStart,
} from "./english-goal.ts";

// Saturday 24 October 2026, 10:00 in Tashkent.
const NOW = new Date("2026-10-24T05:00:00.000Z");

/** `minutes` of practice on each of the last `days` days. */
const daily = (days: number, minutes: number, now = NOW) =>
  Array.from({ length: days }, (_, index) => ({ at: new Date(now.getTime() - index * 86_400_000 - 3_600_000).toISOString(), minutes }));

const base = (overrides: Partial<GoalInput> = {}): GoalInput => ({
  now: NOW,
  targetLevel: "B2",
  targetDate: "2027-06-01",
  levels: { reading: "B1", listening: "B1", writing: "B1", grammar: "B1" },
  overallLevel: "B1",
  levelMeasuredAt: "2026-10-20T00:00:00.000Z",
  dailyMinutes: 20,
  sessions: daily(40, 30),
  firstActivityAt: "2026-09-01T00:00:00.000Z",
  ...overrides,
});

Deno.test("learner dates and weeks use Tashkent time with Monday starts", () => {
  assertEquals(learnerDate("2026-10-24T20:30:00Z"), "2026-10-25");
  assertEquals(weekStart("2026-10-24"), "2026-10-19");
  assertEquals(weekStart("2026-10-19"), "2026-10-19");
  assertEquals(weekStart("2026-10-25"), "2026-10-19");
  assertEquals(isGoalDate("2027-02-30"), false);
  assertEquals(isGoalDate("2027-06-01"), true);
});

Deno.test("attempt minutes fall back to the item's estimate and ignore tabs left open", () => {
  assertEquals(attemptMinutes(600, 15), 10);
  assertEquals(attemptMinutes(0, 15), 15);
  assertEquals(attemptMinutes(null, 12), 12);
  assertEquals(attemptMinutes(null, null), 0);
  assertEquals(attemptMinutes(5 * 3600, 10), MAX_SESSION_MINUTES);
});

Deno.test("hours come from the guided-hour ranges, averaged over skills", () => {
  assertEquals(hoursToTarget({ reading: "B1" }, null, "B2"), { low: 150, high: 200, mid: 175, used: { reading: "B1" } });
  // A skill already at the target needs nothing; the others are averaged.
  const mixed = hoursToTarget({ reading: "B2", writing: "A2" }, "B1", "B2")!;
  assertEquals([mixed.low, mixed.high], [160, 200]);
  // Without per-skill levels the overall level is used.
  assertEquals(hoursToTarget({}, "A2", "B1")?.mid, 185);
  assertEquals(hoursToTarget({}, null, "B1"), null);
  // C2 target from C1 and from A1.
  assertEquals(hoursToTarget({}, "C1", "C2")?.mid, 350);
  assertEquals(hoursToTarget({}, "A1", "C2")?.mid, 1005);
});

Deno.test("a steady learner with enough time is on track and gets a projected date", () => {
  // B1 → B2 by June 2027 needs about 340 minutes a week; this learner does an hour a day.
  const plan = buildGoalPlan(base({ sessions: daily(40, 60) }));
  assertEquals(plan.status, "on_track");
  assertEquals(plan.pace.minutes_per_week, 420);
  assertEquals(plan.pace.enough_data, true);
  assertEquals(plan.estimate?.hours_needed, 175);
  // Practice since the last level check counts towards the goal.
  assert(plan.estimate!.hours_done_since_level > 0);
  assert(plan.projection.projected_date !== null && plan.projection.projected_date > "2026-10-24");
  assert(plan.projection.required_minutes_per_week! <= 420);
  assert(plan.projection.projected_date! < "2027-06-01");
  assertEquals(plan.weeks.length, 8);
  assertEquals(plan.weeks.at(-1)!.start, "2026-10-19");
  assertEquals(plan.this_week.start, "2026-10-19");
  // Mon 19 → Sat 24: six days of an hour.
  assertEquals(plan.this_week.minutes, 360);
  assertEquals(plan.this_week.target_minutes, plan.projection.required_minutes_per_week);
});

Deno.test("too little practice for the chosen date is a little behind, then behind", () => {
  // About 330 minutes a week are needed; 40 a day (280) is a little behind, 30 a day (210) is behind.
  const close = buildGoalPlan(base({ sessions: daily(40, 40) }));
  assertEquals(close.status, "slightly_behind");
  assert(close.projection.projected_date! > "2027-06-01");
  assertEquals(close.projection.suggested_daily_minutes, 50);

  const far = buildGoalPlan(base({ sessions: daily(40, 30) }));
  assertEquals(far.status, "behind");
  assertEquals(far.pace.minutes_per_week, 210);
  assertEquals(far.projection.suggested_daily_minutes! % 5, 0);
});

Deno.test("a date in the past asks for a new date", () => {
  const plan = buildGoalPlan(base({ targetDate: "2026-10-01" }));
  assertEquals(plan.status, "date_passed");
  assertEquals(plan.projection.required_minutes_per_week, null);
  assertEquals(plan.this_week.target_minutes, 140);
  // Today is not a future date either.
  assertEquals(buildGoalPlan(base({ targetDate: "2026-10-24" })).status, "date_passed");
});

Deno.test("a learner already at the target has reached it", () => {
  const plan = buildGoalPlan(base({ levels: { reading: "B2", writing: "C1" }, overallLevel: "B2" }));
  assertEquals(plan.status, "reached");
  assertEquals(plan.estimate?.hours_needed, 0);
  assertEquals(plan.projection.projected_date, null);
  assertEquals(plan.this_week.target_minutes, 140);
});

Deno.test("zero activity: not enough data, no projection, but the needed weekly time is shown", () => {
  const plan = buildGoalPlan(base({ sessions: [], firstActivityAt: null }));
  assertEquals(plan.status, "not_enough_data");
  assertEquals(plan.pace.minutes_per_week, 0);
  assertEquals(plan.projection.projected_date, null);
  assert(plan.projection.required_minutes_per_week! > 0);
  assertEquals(plan.weeks.every((week) => week.minutes === 0), true);
});

Deno.test("less than a week of activity is not enough data", () => {
  const plan = buildGoalPlan(base({ sessions: daily(3, 30), firstActivityAt: null }));
  assertEquals(plan.status, "not_enough_data");
  assertEquals(plan.pace.days_of_data, 2);
});

Deno.test("an older learner with no practice in four weeks is behind and has no projected date", () => {
  const plan = buildGoalPlan(base({ sessions: [], firstActivityAt: "2026-01-01T00:00:00.000Z" }));
  assertEquals(plan.status, "behind");
  assertEquals(plan.pace.minutes_per_week, 0);
  assertEquals(plan.projection.projected_date, null);
});

Deno.test("C2 target needs many hours; no date set still shows the pace projection", () => {
  const plan = buildGoalPlan(base({ targetLevel: "C2", targetDate: null, levels: {}, overallLevel: "C1" }));
  assertEquals(plan.status, "no_date");
  assertEquals(plan.estimate?.hours_low, 300);
  assertEquals(plan.estimate?.hours_high, 400);
  assert(plan.projection.projected_date !== null);
  assertEquals(plan.projection.required_minutes_per_week, null);
  assertEquals(plan.this_week.target_minutes, 140);
});

Deno.test("practice that covers the estimate suggests a level check instead of a date", () => {
  const plan = buildGoalPlan(base({
    levels: { reading: "B2" },
    overallLevel: "B2",
    targetLevel: "C1",
    levelMeasuredAt: "2026-09-01T00:00:00.000Z",
    sessions: daily(50, 90),
  }));
  // B2 → C1 is 200 h; 50 days × 90 min is 75 h, so not yet covered.
  assertEquals(plan.estimate?.hours_remaining, 125);
  const covered = buildGoalPlan(base({ levelMeasuredAt: "2026-06-01T00:00:00.000Z", sessions: Array.from({ length: 140 }, (_, i) => ({ at: new Date(NOW.getTime() - i * 86_400_000 - 3_600_000).toISOString(), minutes: 90 })) }));
  assertEquals(covered.estimate?.hours_remaining, 0);
  assertEquals(covered.projection.projected_date, null);
  assertEquals(covered.status, "on_track");
});

Deno.test("no level yet, and no target yet", () => {
  assertEquals(buildGoalPlan(base({ levels: {}, overallLevel: null })).status, "no_level");
  assertEquals(buildGoalPlan(base({ targetLevel: null })).status, "no_date");
});

Deno.test("future sessions and bad timestamps are ignored", () => {
  const plan = buildGoalPlan(base({
    sessions: [{ at: "2027-01-01T00:00:00Z", minutes: 500 }, { at: "not a date", minutes: 500 }],
    firstActivityAt: null,
  }));
  assertEquals(plan.pace.minutes_per_week, 0);
  assertEquals(plan.status, "not_enough_data");
});

Deno.test("goal updates are validated", () => {
  assertEquals(parseGoalUpdate({ target_date: "2027-06-01", target_cefr: "c1" }, NOW), { ok: true, update: { target_date: "2027-06-01", target_cefr: "C1" } });
  assertEquals(parseGoalUpdate({ target_date: null }, NOW), { ok: true, update: { target_date: null } });
  assertEquals(parseGoalUpdate({ target_date: "2026-10-24" }, NOW), { ok: false, code: "invalid_target_date" });
  assertEquals(parseGoalUpdate({ target_date: "2040-01-01" }, NOW), { ok: false, code: "invalid_target_date" });
  assertEquals(parseGoalUpdate({ target_date: "tomorrow" }, NOW), { ok: false, code: "invalid_target_date" });
  assertEquals(parseGoalUpdate({ target_cefr: "A1" }, NOW), { ok: false, code: "invalid_target_level" });
  assertEquals(parseGoalUpdate({ daily_time_minutes: 300 }, NOW), { ok: false, code: "invalid_daily_minutes" });
  assertEquals(parseGoalUpdate({ daily_time_minutes: 30 }, NOW), { ok: true, update: { daily_time_minutes: 30 } });
  assertEquals(parseGoalUpdate({}, NOW), { ok: false, code: "empty_goal_update" });
});

Deno.test("stored goal date and current levels are read from metadata", () => {
  assertEquals(readGoalDate({ goal_plan: { target_date: "2027-06-01" } }), "2027-06-01");
  assertEquals(readGoalDate({ goal_plan: { target_date: "June" } }), null);
  assertEquals(readGoalDate(null), null);
  const meta = {
    placement: { overall_level: "B1", per_skill: { reading: { level: "B2" }, writing: "B1" }, completed_at: "2026-09-01T00:00:00.000Z" },
    level_history: [{ at: "2026-10-10T00:00:00.000Z", source: "level_up", overall: "B1", per_skill: { reading: "B2", writing: "B1" } }],
  };
  assertEquals(readCurrentLevels(meta), { levels: { reading: "B2", writing: "B1" }, measuredAt: "2026-10-10T00:00:00.000Z" });
  assertEquals(readCurrentLevels({}), { levels: {}, measuredAt: null });
});
