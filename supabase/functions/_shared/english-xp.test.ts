import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  activityXp,
  attemptFacts,
  BADGE_KEYS,
  evaluateBadges,
  finalizeStandings,
  leagueName,
  leagueWeek,
  leagueZone,
  learnerDate,
  mergeLeagueSettings,
  previousWeekStart,
  rankLeague,
  readLeagueSettings,
  tierAfter,
  totalXp,
  weekFromStartDate,
  xpByDay,
  xpGainedBy,
  type BadgeFacts,
} from "./english-xp.ts";

Deno.test("activity XP is 10 for finishing plus up to 10 for accuracy", () => {
  assertEquals(activityXp(null), 10);
  assertEquals(activityXp(0), 10);
  assertEquals(activityXp(0.84), 18);
  assertEquals(activityXp(1), 20);
  assertEquals(activityXp(7), 20);
  assertEquals(activityXp(Number.NaN), 10);
});

Deno.test("learner days follow UTC+5", () => {
  assertEquals(learnerDate("2026-10-25T18:59:00Z"), "2026-10-25");
  assertEquals(learnerDate("2026-10-25T19:00:00Z"), "2026-10-26");
});

Deno.test("repeating an activity the same day counts once, at its best result", () => {
  const days = xpByDay({
    attempts: [
      { id: "a1", content_item_id: "item", score: 0.5, submitted_at: "2026-10-26T06:00:00Z" },
      { id: "a2", content_item_id: "item", score: 0.9, submitted_at: "2026-10-26T07:00:00Z" },
      { id: "a3", content_item_id: "item", score: 0.2, submitted_at: "2026-10-26T08:00:00Z" },
      // Same item on another day counts again.
      { id: "a4", content_item_id: "item", score: 1, submitted_at: "2026-10-27T06:00:00Z" },
    ],
  });
  assertEquals(days.get("2026-10-26")?.activity, 19);
  assertEquals(days.get("2026-10-27")?.activity, 20);
  assertEquals(totalXp(days), 39);
});

Deno.test("review XP: correct answers to due items, once per item per day", () => {
  const days = xpByDay({
    attempts: [],
    reviews: [
      { item_id: "r1", correct: true, was_due: true, answered_at: "2026-10-26T06:00:00Z" },
      { item_id: "r1", correct: true, was_due: true, answered_at: "2026-10-26T06:01:00Z" },
      { item_id: "r2", correct: false, was_due: true, answered_at: "2026-10-26T06:02:00Z" },
      { item_id: "r3", correct: true, was_due: false, answered_at: "2026-10-26T06:03:00Z" },
      { item_id: "r4", correct: true, was_due: true, answered_at: "2026-10-26T06:04:00Z" },
    ],
  });
  assertEquals(days.get("2026-10-26")?.review, 4);
});

Deno.test("the daily goal bonus needs a completed plan and real activity that day", () => {
  const days = xpByDay({
    attempts: [{ id: "a1", content_item_id: "x", score: 1, submitted_at: "2026-10-26T06:00:00Z" }],
    reviews: [{ item_id: "r1", correct: true, was_due: true, answered_at: "2026-10-27T06:00:00Z" }],
    goalDates: ["2026-10-26", "2026-10-27", "2026-10-28"],
  });
  assertEquals(days.get("2026-10-26")?.bonus, 10);
  assertEquals(days.get("2026-10-26")?.total, 30);
  assertEquals(days.get("2026-10-27")?.bonus, 0);
  assertEquals(days.has("2026-10-28"), false);
});

Deno.test("XP gained by an attempt is only its improvement on the same day", () => {
  const attempts = [
    { id: "a1", content_item_id: "item", score: 0.5, submitted_at: "2026-10-26T06:00:00Z" },
    { id: "a2", content_item_id: "item", score: 0.9, submitted_at: "2026-10-26T07:00:00Z" },
    { id: "a3", content_item_id: "item", score: 0.4, submitted_at: "2026-10-26T08:00:00Z" },
  ];
  assertEquals(xpGainedBy(attempts, "a1"), 15);
  assertEquals(xpGainedBy(attempts, "a2"), 4);
  assertEquals(xpGainedBy(attempts, "a3"), 0);
  assertEquals(xpGainedBy(attempts, "missing"), 0);
});

Deno.test("league weeks start on Monday 00:00 learner time", () => {
  // Sunday 23:30 in Tashkent is still the old week.
  assertEquals(leagueWeek(new Date("2026-10-25T18:30:00Z")).start_date, "2026-10-19");
  // Monday 00:00 in Tashkent is Sunday 19:00 UTC.
  const week = leagueWeek(new Date("2026-10-25T19:00:00Z"));
  assertEquals(week.start_date, "2026-10-26");
  assertEquals(week.starts_at, "2026-10-25T19:00:00.000Z");
  assertEquals(week.ends_at, "2026-11-01T19:00:00.000Z");
  assertEquals(week.dates.length, 7);
  assertEquals(week.dates[6], "2026-11-01");
  assertEquals(weekFromStartDate("2026-10-26").ends_at, week.ends_at);
  assertEquals(previousWeekStart("2026-10-26"), "2026-10-19");
});

Deno.test("ranking: XP first, then who joined first", () => {
  const ranked = rankLeague([
    { user_id: "b", xp: 40, joined_at: "2026-10-26T08:00:00Z" },
    { user_id: "a", xp: 40, joined_at: "2026-10-26T07:00:00Z" },
    { user_id: "c", xp: 90, joined_at: "2026-10-27T07:00:00Z" },
  ]);
  assertEquals(ranked.map((row) => [row.user_id, row.rank]), [["c", 1], ["a", 2], ["b", 3]]);
});

Deno.test("zones: top 7 with XP promote, bottom 5 demote, Bronze is the floor", () => {
  assertEquals(leagueZone({ rank: 1, size: 30, tier: "silver", xp: 50 }), "promote");
  assertEquals(leagueZone({ rank: 7, size: 30, tier: "silver", xp: 5 }), "promote");
  assertEquals(leagueZone({ rank: 3, size: 30, tier: "silver", xp: 0 }), "stay");
  assertEquals(leagueZone({ rank: 1, size: 30, tier: "diamond", xp: 500 }), "stay");
  assertEquals(leagueZone({ rank: 8, size: 30, tier: "silver", xp: 5 }), "stay");
  assertEquals(leagueZone({ rank: 26, size: 30, tier: "silver", xp: 0 }), "demote");
  assertEquals(leagueZone({ rank: 30, size: 30, tier: "bronze", xp: 0 }), "stay");
  // A small group never demotes someone from the top 7.
  assertEquals(leagueZone({ rank: 6, size: 8, tier: "gold", xp: 0 }), "stay");
  assertEquals(leagueZone({ rank: 8, size: 8, tier: "gold", xp: 0 }), "demote");
});

Deno.test("final standings move tiers up and down", () => {
  const entries = Array.from({ length: 12 }, (_, index) => ({
    user_id: `u${index}`,
    xp: index < 10 ? 100 - index : 0,
    joined_at: "2026-10-26T07:00:00Z",
  }));
  const standings = finalizeStandings("gold", entries);
  assertEquals(standings.filter((row) => row.outcome === "promoted").length, 7);
  assertEquals(standings.filter((row) => row.outcome === "demoted").length, 5);
  assertEquals(tierAfter("gold", "promoted"), "sapphire");
  assertEquals(tierAfter("gold", "demoted"), "silver");
  assertEquals(tierAfter("bronze", "demoted"), "bronze");
  assertEquals(tierAfter("diamond", "promoted"), "diamond");
  assertEquals(tierAfter("silver", null), "silver");
});

Deno.test("league names show a first name and last initial, never an email", () => {
  assertEquals(leagueName({ first: "Aziza", last: "Karimova" }), "Aziza K.");
  assertEquals(leagueName({ full: "Timur  Rashidov" }), "Timur R.");
  assertEquals(leagueName({ full: "Dilnoza" }), "Dilnoza");
  assertEquals(leagueName({ first: "Олег", last: "иванов" }), "Олег И.");
  assertEquals(leagueName({ first: "Aziza", last: "Karimova", hidden: true }), "Learner");
  assertEquals(leagueName({ full: "someone@example.com" }), "Learner");
  assertEquals(leagueName({}), "Learner");
});

Deno.test("league settings read and merge safely", () => {
  assertEquals(readLeagueSettings(null), { hidden: false, opted_out: false });
  assertEquals(readLeagueSettings({ league: { hidden: true } }), { hidden: true, opted_out: false });
  assertEquals(mergeLeagueSettings({ hidden: true, opted_out: false }, { opted_out: true, hidden: "yes" }), { hidden: true, opted_out: true });
});

const noFacts: BadgeFacts = {
  activities: 0,
  longest_streak: 0,
  saved_words: 0,
  best_week_skills: 0,
  level_ups: 0,
  level_checks: 0,
  perfect_scores: 0,
  promotions: 0,
};

Deno.test("badges are earned from facts and kept once earned", () => {
  const fresh = evaluateBadges(noFacts);
  assertEquals(fresh.length, BADGE_KEYS.length);
  assert(fresh.every((badge) => !badge.earned));

  const some = evaluateBadges({ ...noFacts, activities: 12, longest_streak: 4, best_week_skills: 7 });
  const earned = some.filter((badge) => badge.earned).map((badge) => badge.key);
  assertEquals(earned, ["first_activity", "streak_3", "activities_10", "all_skills_week"]);
  assertEquals(some.find((badge) => badge.key === "activities_50"), { key: "activities_50", earned: false, current: 12, target: 50 });

  // A streak badge stays after the streak window has passed.
  const kept = evaluateBadges(noFacts, ["streak_7"]);
  assertEquals(kept.find((badge) => badge.key === "streak_7"), { key: "streak_7", earned: true, current: 7, target: 7 });
});

Deno.test("attempt facts: streaks, skills in one week, distinct perfect scores", () => {
  const facts = attemptFacts([
    { content_item_id: "a", skill: "reading", score: 1, submitted_at: "2026-10-26T06:00:00Z" },
    { content_item_id: "a", skill: "reading", score: 1, submitted_at: "2026-10-27T06:00:00Z" },
    { content_item_id: "b", skill: "listening", score: 0.5, submitted_at: "2026-10-28T06:00:00Z" },
    { content_item_id: "c", skill: "grammar", score: 1, submitted_at: "2026-11-03T06:00:00Z" },
  ]);
  assertEquals(facts.longest_streak, 3);
  assertEquals(facts.best_week_skills, 2);
  assertEquals(facts.perfect_scores, 2);
  assertEquals(attemptFacts([]).best_week_skills, 0);
});
