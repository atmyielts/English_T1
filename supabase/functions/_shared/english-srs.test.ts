import { assert, assertAlmostEquals, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  boxForStability,
  easeFromDifficulty,
  gradeFromOutcome,
  gradeFromQuality,
  intervalForStability,
  MAX_INTERVAL_DAYS,
  notebookReviewPatch,
  parseGrade,
  parseSrsState,
  previewIntervals,
  RELEARN_MINUTES,
  retrievability,
  reviewCard,
  type SrsState,
  starterDueAt,
  stateFromSm2,
  stateOfRow,
} from "./english-srs.ts";

const NOW = new Date("2026-10-24T10:00:00Z");
const DAY = 86_400_000;
const later = (days: number) => new Date(NOW.getTime() + days * DAY);

Deno.test("srs: recall is 90% after exactly one stability", () => {
  assertAlmostEquals(retrievability(10, 10), 0.9, 1e-9);
  assertAlmostEquals(intervalForStability(7), 7, 1e-9);
  assertEquals(retrievability(0, 5), 1);
  assert(retrievability(30, 5) < retrievability(5, 5));
});

Deno.test("srs: a new card's first interval grows with the grade", () => {
  const preview = previewIntervals(null, NOW);
  assertEquals(preview[1], RELEARN_MINUTES / (24 * 60));
  assert(preview[1] < preview[2]);
  assert(preview[2] < preview[3]);
  assert(preview[3] < preview[4]);
  assertEquals(preview[3], 4); // FSRS-4.5 default: stability 3.7 days for "good"
});

Deno.test("srs: successful reviews space the card further each time", () => {
  let state: SrsState | null = null;
  let at = NOW;
  const intervals: number[] = [];
  for (let i = 0; i < 6; i += 1) {
    const outcome = reviewCard(state, 3, at);
    intervals.push(outcome.intervalDays);
    state = outcome.state;
    at = outcome.due;
  }
  for (let i = 1; i < intervals.length; i += 1) {
    const grew = intervals[i]! > intervals[i - 1]! || intervals[i] === MAX_INTERVAL_DAYS;
    assert(grew, `interval ${i} should grow until the cap: ${intervals}`);
  }
  assertEquals(intervals.slice(0, 3), [4, 15, 49]);
  assertEquals(intervals[intervals.length - 1], MAX_INTERVAL_DAYS);
  assertEquals(state!.reps, 6);
});

Deno.test("srs: forgetting shrinks stability, counts a lapse and brings the card back the same day", () => {
  const learned = reviewCard(reviewCard(null, 3, NOW).state, 3, later(4));
  const forgot = reviewCard(learned.state, 1, later(20));
  assert(forgot.state.s < learned.state.s);
  assertEquals(forgot.state.lapses, 1);
  assertEquals(forgot.state.reps, 0);
  assertEquals(forgot.due.getTime() - later(20).getTime(), RELEARN_MINUTES * 60_000);
  assert(forgot.state.d > learned.state.d, "forgetting makes the card harder");
});

Deno.test("srs: easy cards get easier and wait longer than good ones", () => {
  const base = reviewCard(null, 3, NOW).state;
  const good = reviewCard(base, 3, later(4));
  const easy = reviewCard(base, 4, later(4));
  const hard = reviewCard(base, 2, later(4));
  assert(easy.intervalDays > good.intervalDays);
  assert(good.intervalDays >= hard.intervalDays);
  assert(easy.state.d < good.state.d && good.state.d < hard.state.d);
});

Deno.test("srs: a late review that is still remembered earns a bigger jump", () => {
  const base = reviewCard(null, 3, NOW).state;
  const onTime = reviewCard(base, 3, later(4));
  const late = reviewCard(base, 3, later(12));
  assert(late.recall < onTime.recall);
  assert(late.state.s > onTime.state.s);
});

Deno.test("srs: difficulty and stability stay in range under extreme sequences", () => {
  let state: SrsState | null = null;
  let at = NOW;
  for (let i = 0; i < 40; i += 1) {
    const grade = (i % 3 === 0 ? 1 : 4) as 1 | 4;
    const outcome = reviewCard(state, grade, at);
    assert(outcome.state.d >= 1 && outcome.state.d <= 10);
    assert(outcome.state.s >= 0.1);
    assert(outcome.intervalDays <= MAX_INTERVAL_DAYS);
    state = outcome.state;
    at = new Date(outcome.due.getTime() + DAY);
  }
});

Deno.test("srs: legacy Leitner rows get a seeded state; never-reviewed rows none", () => {
  assertEquals(stateOfRow({ review_count: 0, leitner_box: 1 }, NOW), null);
  const seeded = stateOfRow({ review_count: 4, incorrect_count: 1, leitner_box: 4, last_reviewed_at: "2026-10-20T10:00:00Z" }, NOW)!;
  assertEquals(seeded.s, 8);
  assertEquals(seeded.reps, 3);
  assertEquals(seeded.last, "2026-10-20T10:00:00Z");
  assert(seeded.d > 4 && seeded.d < 6);
  const stored = { s: 12, d: 3, reps: 5, lapses: 0, last: "2026-10-01T00:00:00.000Z" };
  assertEquals(stateOfRow({ review_count: 9, leitner_box: 1, metadata: { srs: stored } }, NOW), stored);
});

Deno.test("srs: malformed stored state is ignored", () => {
  assertEquals(parseSrsState(null), null);
  assertEquals(parseSrsState({ s: -1, d: 5, last: NOW.toISOString() }), null);
  assertEquals(parseSrsState({ s: 2, d: 11, last: NOW.toISOString() }), null);
  assertEquals(parseSrsState({ s: 2, d: 5, last: "never" }), null);
  assertEquals(parseSrsState({ s: 2, d: 5, last: NOW.toISOString() })?.reps, 0);
});

Deno.test("srs: notebook patch keeps metadata, counts and a box derived from stability", () => {
  const patch = notebookReviewPatch(
    { leitner_box: 2, review_count: 3, correct_count: 2, incorrect_count: 1, metadata: { definition: "x", captured_at: "y" } },
    3,
    NOW,
  );
  assertEquals([patch.review_count, patch.correct_count, patch.incorrect_count], [4, 3, 1]);
  assertEquals(patch.metadata.definition, "x");
  assertEquals(patch.metadata.captured_at, "y");
  assertEquals(patch.last_reviewed_at, NOW.toISOString());
  assertEquals(patch.leitner_box, boxForStability(patch.metadata.srs.s));
  assert(Date.parse(patch.next_review_at) > NOW.getTime() + DAY);
  const wrong = notebookReviewPatch({ leitner_box: 5, review_count: 1, correct_count: 1, incorrect_count: 0 }, 1, NOW);
  assertEquals(wrong.leitner_box, 1);
  assertEquals(wrong.incorrect_count, 1);
  assertEquals(Date.parse(wrong.next_review_at) - NOW.getTime(), RELEARN_MINUTES * 60_000);
});

Deno.test("srs: grade mapping from old inputs", () => {
  assertEquals(gradeFromOutcome(true), 3);
  assertEquals(gradeFromOutcome(false), 1);
  assertEquals([0, 1, 2, 3, 4, 5].map(gradeFromQuality), [1, 1, 1, 2, 3, 4]);
  assertEquals(gradeFromQuality("nonsense"), 2);
  assertEquals(parseGrade(4), 4);
  assertEquals(parseGrade("3"), 3);
  assertEquals(parseGrade(0), null);
  assertEquals(parseGrade(2.5), null);
});

Deno.test("srs: SM-2 cards carry their interval and ease into the new state", () => {
  assertEquals(stateFromSm2({ interval: 1, ease_factor: 2.5, repetitions: 0, last_review: null }, NOW), null);
  const state = stateFromSm2({ interval: 15, ease_factor: 2.5, repetitions: 3, last_review: "2026-10-10" }, NOW)!;
  assertEquals(state.s, 15);
  assertEquals(state.reps, 3);
  assertEquals(state.last, "2026-10-10T00:00:00.000Z");
  const hard = stateFromSm2({ interval: 2, ease_factor: 1.3, repetitions: 1, last_review: "2026-10-10" }, NOW)!;
  assertEquals(hard.d, 10);
  assertAlmostEquals(easeFromDifficulty(state.d), 2.5, 0.01);
  assertEquals(easeFromDifficulty(10), 1.3);
});

Deno.test("srs: starter words are introduced twenty a day", () => {
  assertEquals(starterDueAt(0, NOW), NOW.toISOString());
  assertEquals(starterDueAt(19, NOW), NOW.toISOString());
  assertEquals(starterDueAt(20, NOW), later(1).toISOString());
  assertEquals(starterDueAt(119, NOW), later(5).toISOString());
});
