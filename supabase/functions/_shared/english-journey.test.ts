import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildJourneyWeek, eventMatchesSkill, type JourneyInput, journeyEvents, journeyWeekStart, levelEvents } from "./english-journey.ts";

const EMPTY: JourneyInput = { attempts: [], reviews: [], quiz: [], words: [], roleplays: [], mocks: [], levels: [], badges: [], certificates: [] };
const NOW = new Date("2026-10-24T12:00:00Z"); // Saturday; learner week starts Monday 2026-10-19

const attempt = (id: string, skill: string, at: string, patch: Partial<JourneyInput["attempts"][number]> = {}) => ({
  id, skill, content_type: `${skill}.item`, slug: `${skill}-${id}`, title: `Title ${id}`, level: "B1", score: 0.8, submitted_at: at, seconds: 600, ...patch,
});

Deno.test("week start snaps to the learner's Monday and never goes past this week", () => {
  assertEquals(journeyWeekStart(undefined, NOW), "2026-10-19");
  assertEquals(journeyWeekStart("2026-10-15", NOW), "2026-10-12");
  assertEquals(journeyWeekStart("2026-10-12", NOW), "2026-10-12");
  assertEquals(journeyWeekStart("2027-01-01", NOW), "2026-10-19");
  assertEquals(journeyWeekStart("not-a-date", NOW), "2026-10-19");
  // Sunday 21:00 UTC is already Monday in Tashkent (UTC+5).
  assertEquals(journeyWeekStart(undefined, new Date("2026-10-25T21:00:00Z")), "2026-10-26");
});

Deno.test("events from every source, newest first, with role-plays and mocks taken from their own rows", () => {
  const events = journeyEvents({
    ...EMPTY,
    attempts: [
      attempt("a1", "reading", "2026-10-20T06:00:00Z"),
      attempt("rp", "speaking", "2026-10-21T07:00:00Z", { content_type: "speaking.roleplay" }),
      attempt("mk", "speaking", "2026-10-21T08:00:00Z", { content_type: "speaking.mock" }),
      attempt("bad", "cooking", "2026-10-21T08:00:00Z"),
    ],
    roleplays: [{ id: "r1", scenario_id: "visa-interview", title: "Visa", level: "B1", started_at: "2026-10-21T06:50:00Z", finished_at: "2026-10-21T07:00:00Z", score: 70, goals_met: 2, goals_total: 3 }],
    mocks: [{ id: "m1", started_at: "2026-10-21T07:45:00Z", finished_at: "2026-10-21T08:00:00Z", band: 6 }],
    badges: [{ key: "streak_3", earned_at: "2026-10-22T05:00:00Z" }],
    certificates: [{ code: "ABCDEFGHJKMN", overall: "B1", issued_at: "2026-10-23T05:00:00Z" }],
  });
  assertEquals(events.map((event) => event.kind), ["certificate", "badge", "mock", "roleplay", "activity"]);
  const mock = events.find((event) => event.kind === "mock")!;
  assertEquals([mock.band, mock.score, mock.minutes, mock.skill, mock.href], [6, 67, 15, "speaking", "/speaking-mock"]);
  const roleplay = events.find((event) => event.kind === "roleplay")!;
  assertEquals([roleplay.goals, roleplay.href], [{ met: 2, total: 3 }, "/roleplay/visa-interview"]);
  const activity = events.find((event) => event.kind === "activity")!;
  assertEquals([activity.score, activity.minutes, activity.href, activity.date], [80, 10, "/reading/reading-a1", "2026-10-20"]);
});

Deno.test("review answers group per learner day and channel; Telegram quiz answers are their own entry", () => {
  const events = journeyEvents({
    ...EMPTY,
    reviews: [
      { answered_at: "2026-10-20T05:00:00Z", correct: true, channel: null },
      { answered_at: "2026-10-20T05:01:00Z", correct: false, channel: "web" },
      { answered_at: "2026-10-20T06:00:00Z", correct: true, channel: "telegram" },
      // 20:00 UTC on the 20th is the 21st in Tashkent.
      { answered_at: "2026-10-20T20:00:00Z", correct: true, channel: null },
    ],
    quiz: [
      { answered_at: "2026-10-20T09:00:00Z", correct: true },
      { answered_at: "2026-10-20T09:01:00Z", correct: null },
    ],
  });
  const summary = events.map((event) => [event.kind, event.date, event.channel, event.count, event.correct, event.score]);
  assertEquals(summary, [
    ["review", "2026-10-21", "app", 1, 1, 100],
    ["telegram_quiz", "2026-10-20", "telegram", 2, 1, 50],
    ["review", "2026-10-20", "telegram", 1, 1, 100],
    ["review", "2026-10-20", "app", 2, 1, 50],
  ]);
});

Deno.test("level history becomes placement, check and level-up events with what changed", () => {
  const events = levelEvents([
    { at: "2026-09-01T05:00:00Z", source: "placement", overall: "A2", per_skill: { reading: "A2", writing: "A2" } },
    { at: "2026-10-02T05:00:00Z", source: "check", overall: "B1", per_skill: { reading: "B1", writing: "A2" } },
    { at: "2026-10-20T05:00:00Z", source: "level_up", overall: "B1", per_skill: { reading: "B1", writing: "B1" } },
  ]);
  assertEquals(events.map((event) => [event.kind, event.levels?.from, event.levels?.to, event.levels?.skills, event.skill]), [
    ["placement", null, "A2", ["reading", "writing"], null],
    ["check", "A2", "B1", ["reading"], null],
    ["level_up", "B1", "B1", ["writing"], "writing"],
  ]);
});

Deno.test("a week: only its events, grouped by day with summaries, and a skill filter", () => {
  const input: JourneyInput = {
    ...EMPTY,
    attempts: [
      attempt("old", "reading", "2026-10-18T10:00:00Z"),
      attempt("a1", "reading", "2026-10-20T06:00:00Z", { score: 0.6, seconds: 300 }),
      attempt("a2", "grammar", "2026-10-20T07:00:00Z", { score: 1, seconds: 900 }),
      attempt("a3", "grammar", "2026-10-22T07:00:00Z", { score: null, seconds: null }),
    ],
    reviews: [{ answered_at: "2026-10-20T08:00:00Z", correct: true, channel: "telegram" }],
    words: [{ created_at: "2026-10-22T08:00:00Z" }, { created_at: "2026-10-22T09:00:00Z" }],
  };
  const week = buildJourneyWeek(input, { weekStart: "2026-10-19", earliestAt: "2026-10-01T00:00:00Z", now: NOW });
  assertEquals([week.start_date, week.end_date, week.prev_start, week.next_start], ["2026-10-19", "2026-10-25", "2026-10-12", null]);
  assertEquals(week.days.map((day) => day.date), ["2026-10-22", "2026-10-20"]);
  const monday = week.days[1]!;
  assertEquals(monday.summary, { activities: 2, minutes: 20, skills: ["reading", "grammar"], reviews: 1, reviews_correct: 1, words: 0, average_score: 80 });
  assertEquals(week.days[0]!.summary.words, 2);
  assertEquals([week.totals.activities, week.totals.days_active], [3, 2]);

  const grammar = buildJourneyWeek(input, { weekStart: "2026-10-19", skill: "grammar", now: NOW });
  assertEquals(grammar.days.flatMap((day) => day.events.map((event) => event.id)), ["activity:a3", "activity:a2"]);
  // Nothing before this week is known: no "previous week".
  assertEquals(grammar.prev_start, null);

  const past = buildJourneyWeek(input, { weekStart: "2026-10-12", now: NOW });
  assertEquals([past.next_start, past.days.length], ["2026-10-19", 1]);
});

Deno.test("cross-skill events stay out of a skill view; level changes of that skill stay in", () => {
  const [placement, levelUp] = levelEvents([
    { at: "2026-09-01T05:00:00Z", source: "placement", overall: "A2", per_skill: { writing: "A2" } },
    { at: "2026-10-20T05:00:00Z", source: "level_up", overall: "A2", per_skill: { writing: "B1" } },
  ]);
  assert(eventMatchesSkill(levelUp!, "writing"));
  assert(!eventMatchesSkill(levelUp!, "reading"));
  assert(!eventMatchesSkill(placement!, "writing"));
  const [review] = journeyEvents({ ...EMPTY, reviews: [{ answered_at: "2026-10-20T05:00:00Z", correct: true, channel: null }] });
  assert(!eventMatchesSkill(review!, "grammar"));
});
