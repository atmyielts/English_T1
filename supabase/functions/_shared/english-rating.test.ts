import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  attemptEvidence,
  ieltsBand,
  ieltsEstimate,
  ieltsOverall,
  isRatingFresh,
  rateSkill,
  rateSkills,
  type RatedAttempt,
  readRatingSummary,
  recencyWeight,
  scoreOffset,
} from "./english-rating.ts";

const NOW = new Date("2026-10-24T12:00:00Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();
const at = (level: RatedAttempt["level"], score: number | null, days = 1, skill = "reading"): RatedAttempt =>
  ({ skill, level, score, submitted_at: daysAgo(days) });

Deno.test("a score maps to a point inside, above or below the item's level", () => {
  assertEquals(Math.round(scoreOffset(0.6) * 100) / 100, 0.1);
  assertEquals(Math.round(scoreOffset(0.85) * 100) / 100, 0.6);
  assertEquals(Math.round(scoreOffset(1) * 100) / 100, 0.9);
  assertEquals(scoreOffset(0), -1);
  // Never below A1 or above C2.
  assertEquals(attemptEvidence("A1", 0), 0);
  assertEquals(attemptEvidence("C2", 1), 5.9);
  assertEquals(recencyWeight(0), 1);
  assertEquals(recencyWeight(21), 0.5);
});

Deno.test("nothing known means no rating; a placement alone sits 30% into the level", () => {
  const none = rateSkill({ skill: "reading", attempts: [], baseLevel: null, now: NOW });
  assertEquals([none.value, none.level, none.progress, none.confidence], [null, null, null, "none"]);
  const placed = rateSkill({ skill: "reading", attempts: [], baseLevel: "B1", now: NOW });
  assertEquals([placed.level, placed.progress, placed.next_level, placed.confidence], ["B1", 30, "B2", "none"]);
});

Deno.test("strong results at the level move the learner up through it, not past it", () => {
  const rating = rateSkill({
    skill: "reading",
    attempts: [at("B1", 0.9, 1), at("B1", 0.85, 2), at("B1", 0.95, 3), at("B1", 0.9, 4)],
    baseLevel: "B1",
    now: NOW,
  });
  assertEquals(rating.level, "B1");
  assert((rating.progress ?? 0) > 55, `progress ${rating.progress}`);
  assertEquals(rating.confidence, "medium");
});

Deno.test("passing items at the next level lifts the rating into it", () => {
  const rating = rateSkill({
    skill: "listening",
    attempts: Array.from({ length: 8 }, (_, index) => at("B2", 0.8, index + 1, "listening")),
    baseLevel: "B1",
    now: NOW,
  });
  assertEquals(rating.level, "B2");
  assertEquals(rating.confidence, "high");
});

Deno.test("easy passes and hard misses do not drag the rating across the placement", () => {
  const easy = rateSkill({ skill: "reading", attempts: Array.from({ length: 6 }, () => at("A1", 1)), baseLevel: "B1", now: NOW });
  assertEquals(easy.level, "B1");
  assert((easy.progress ?? 0) >= 30);
  const hard = rateSkill({ skill: "reading", attempts: Array.from({ length: 6 }, () => at("C1", 0.2)), baseLevel: "B1", now: NOW });
  assertEquals(hard.level, "B1");
  assert((hard.progress ?? 100) <= 30);
});

Deno.test("recent results count more than old ones; unscored, unlevelled and other skills are ignored", () => {
  const recentGood = rateSkill({ skill: "reading", attempts: [at("B1", 0.3, 60), at("B1", 0.95, 1)], baseLevel: null, now: NOW });
  const recentBad = rateSkill({ skill: "reading", attempts: [at("B1", 0.95, 60), at("B1", 0.3, 1)], baseLevel: null, now: NOW });
  assert((recentGood.value ?? 0) > (recentBad.value ?? 0));
  const ignored = rateSkill({
    skill: "reading",
    attempts: [at(null, 0.9), at("B1", null), at("C1", 1, 1, "writing"), at("B1", 0.9, 200)],
    baseLevel: null,
    now: NOW,
  });
  assertEquals([ignored.value, ignored.attempts], [null, 0]);
});

Deno.test("overall is the mean of the skills that have a rating", () => {
  const summary = rateSkills({
    attempts: [at("B2", 0.6, 1, "reading"), at("B2", 0.6, 1, "writing")],
    baseLevelFor: () => null,
    now: NOW,
  });
  assertEquals(summary.skills.reading.value, 3.1);
  assertEquals(summary.skills.speaking.value, null);
  assertEquals(summary.overall.level, "B2");
  assertEquals(summary.overall.progress, 10);
  assertEquals(readRatingSummary(JSON.parse(JSON.stringify(summary)))?.overall.value, 3.1);
  assertEquals(readRatingSummary({ version: 0 }), null);
});

Deno.test("a cached rating is stale after a newer attempt, a newer placement or a day", () => {
  const cached = rateSkills({ attempts: [], baseLevelFor: () => "B1", now: NOW });
  const later = new Date(NOW.getTime() + 3_600_000);
  assertEquals(isRatingFresh({ cached, latestAttemptAt: daysAgo(1), placementAt: daysAgo(10), now: later }), true);
  assertEquals(isRatingFresh({ cached, latestAttemptAt: later.toISOString(), placementAt: null, now: later }), false);
  assertEquals(isRatingFresh({ cached, latestAttemptAt: null, placementAt: later.toISOString(), now: later }), false);
  assertEquals(isRatingFresh({ cached, latestAttemptAt: null, placementAt: null, now: new Date(NOW.getTime() + 2 * 86_400_000) }), false);
  assertEquals(isRatingFresh({ cached: null, latestAttemptAt: null, placementAt: null, now: later }), false);
});

Deno.test("IELTS bands follow the CEFR alignment, rounded down per skill and IELTS-style overall", () => {
  assertEquals(ieltsBand(2), 4); // start of B1
  assertEquals(ieltsBand(3), 5.5); // start of B2
  assertEquals(ieltsBand(3.5), 6); // mid B2: 6.25 rounds down
  assertEquals(ieltsBand(4), 7); // start of C1
  assertEquals(ieltsBand(null), null);
  assertEquals(ieltsOverall([6, 6, 6.5, 6.5]), 6.5); // 6.25 → 6.5
  assertEquals(ieltsOverall([6.5, 7, 7, 7.5]), 7);
  assertEquals(ieltsOverall([6.5, 7, 7.5, 7.5]), 7); // 7.125 → 7.0
  assertEquals(ieltsOverall([6.5, 7, 7.5, 8]), 7.5); // 7.25 → 7.5
  assertEquals(ieltsOverall([]), null);
});

Deno.test("the IELTS estimate needs two skills for an overall and flags thin evidence", () => {
  const summary = rateSkills({
    attempts: [at("B2", 0.6, 1, "reading"), ...Array.from({ length: 4 }, () => at("B2", 0.6, 1, "listening"))],
    baseLevelFor: () => null,
    now: NOW,
  });
  const estimate = ieltsEstimate(summary.skills);
  assertEquals(estimate.per_skill, { listening: 5.5, reading: 5.5 });
  assertEquals(estimate.based_on, ["listening", "reading"]);
  assertEquals(estimate.overall, 5.5);
  assertEquals(estimate.tentative, true);
  const one = ieltsEstimate(rateSkills({ attempts: [at("B2", 0.6, 1, "reading")], baseLevelFor: () => null, now: NOW }).skills);
  assertEquals(one.overall, null);
});
