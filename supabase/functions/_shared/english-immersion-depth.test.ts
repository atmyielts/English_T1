import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  applyDayResult,
  canSubmitDay,
  dayExpected,
  learnerDay,
  pickWatchItems,
  previousExcerpt,
  projectByKey,
  projectState,
  projectSummary,
  PROJECTS,
  type ProjectDayResult,
  type ProjectRun,
  splitWatchMistake,
  watchOutcomes,
  watchResult,
} from "./english-immersion-depth.ts";
import { basicReplyCheck, matchPoints, normalizeText, parsePoints } from "./english-immersion.ts";

Deno.test("watch items come only from the learner's own 'wrong → right' sentences", () => {
  assertEquals(splitWatchMistake("I am agree → I agree"), { wrong: "I am agree", right: "I agree" });
  assertEquals(splitWatchMistake("Article missing before singular noun"), null);
  assertEquals(splitWatchMistake("same → same"), null);
  const items = pickWatchItems([
    { id: "1", error_type: "informations → information", topic: null, times: 1, last_seen_at: "2026-10-01" },
    { id: "2", error_type: "I am agree → I agree", topic: "to-be", times: 3, last_seen_at: "2026-10-02" },
    { id: "3", error_type: "i am agree → I agree", topic: "to-be", times: 1, last_seen_at: "2026-10-03" },
    { id: "4", error_type: "no arrow here", topic: null },
  ]);
  assertEquals(items.map((item) => item.id), ["2", "1"]);
});

Deno.test("watch result: repeated, avoided or not seen; the wrong form inside the right one does not count", () => {
  assertEquals(watchResult("Yes, I am agree with you.", { wrong: "I am agree", right: "I agree" }), "repeated");
  assertEquals(watchResult("I agree with you completely.", { wrong: "I am agree", right: "I agree" }), "avoided");
  assertEquals(watchResult("Let's meet at six.", { wrong: "I am agree", right: "I agree" }), "not_seen");
  assertEquals(watchResult("We go to school by bus.", { wrong: "go school", right: "go to school" }), "avoided");
  assertEquals(watchResult("We go school and then go to school.", { wrong: "go school", right: "go to school" }), "repeated");
  const outcomes = watchOutcomes(["first reply", "I need informations"], [{ id: "1", wrong: "informations", right: "information", topic: null }]);
  assertEquals(outcomes[0]?.result, "repeated");
});

Deno.test("every project day can be checked without AI: each point has a phrase not already in the task", () => {
  assert(PROJECTS.length >= 3);
  for (const project of PROJECTS) {
    assertEquals(project.days.map((day) => day.day), [1, 2, 3], project.key);
    for (const day of project.days) {
      const points = parsePoints(dayExpected(day));
      assertEquals(points.length, day.points.length, `${project.key} day ${day.day}: malformed point`);
      const checked = matchPoints({ prompt: day.task, response: "", points });
      assertEquals(checked.length, points.length, `${project.key} day ${day.day}: a point can only be met by copying the task`);
      // The model answer itself passes the basic check.
      const result = basicReplyCheck({ kind: day.kind, level: project.level, prompt: day.task, response: day.model_answer, expected: dayExpected(day) });
      const missed = result.points.filter((point) => !point.met).map((point) => point.label);
      assertEquals(missed, [], `${project.key} day ${day.day} model answer misses ${missed.join(", ")}`);
      assert(normalizeText(day.model_answer).split(" ").length >= day.min_words, `${project.key} day ${day.day} model answer too short`);
    }
  }
});

const result = (day: number, doneOn: string, score = 80): ProjectDayResult => ({
  day,
  score,
  response: `Answer for day ${day} `.repeat(3),
  mode: "typed",
  achieved: score >= 70,
  points: [{ label: "a", met: true }, { label: "b", met: score >= 70 }],
  corrections: day === 2 ? [{ original: "x", better: "y", explanation: "" }] : [],
  summary: "",
  words_used: day === 1 ? ["decide"] : ["decide", "afford"],
  feedback_mode: "basic",
  done_on: doneOn,
  at: `${doneOn}T10:00:00Z`,
});

Deno.test("learner day is UTC+5", () => {
  assertEquals(learnerDay("2026-10-24T18:59:00Z"), "2026-10-24");
  assertEquals(learnerDay("2026-10-24T19:00:00Z"), "2026-10-25");
});

Deno.test("one day per learner day: next day opens tomorrow, today's day can be redone", () => {
  const project = projectByKey("weekend-trip")!;
  const start = projectState(project, [], "2026-10-24");
  assertEquals(start.days.map((day) => day.status), ["open", "locked", "locked"]);
  assertEquals(start.current, 1);

  const afterDay1 = projectState(project, [result(1, "2026-10-24")], "2026-10-24");
  assertEquals(afterDay1.days.map((day) => day.status), ["done", "tomorrow", "locked"]);
  assertEquals(afterDay1.current, null);
  assertEquals(afterDay1.opens_on, "2026-10-25");
  assertEquals(afterDay1.days[0]?.can_redo, true);
  assertEquals(canSubmitDay(project, [result(1, "2026-10-24")], 1, "2026-10-24"), { ok: true });
  assertEquals(canSubmitDay(project, [result(1, "2026-10-24")], 2, "2026-10-24"), { ok: false, reason: "tomorrow" });
  assertEquals(canSubmitDay(project, [result(1, "2026-10-24")], 3, "2026-10-24"), { ok: false, reason: "locked" });

  const nextDay = projectState(project, [result(1, "2026-10-24")], "2026-10-25");
  assertEquals(nextDay.days.map((day) => day.status), ["done", "open", "locked"]);
  assertEquals(nextDay.days[0]?.can_redo, false);
  assertEquals(canSubmitDay(project, [result(1, "2026-10-24")], 1, "2026-10-25"), { ok: false, reason: "done" });
  assertEquals(canSubmitDay(project, [], 9, "2026-10-25"), { ok: false, reason: "unknown_day" });

  // A gap of several days is fine: the next day simply waits.
  const later = projectState(project, [result(1, "2026-10-24"), result(2, "2026-10-28")], "2026-11-02");
  assertEquals(later.days.map((day) => day.status), ["done", "done", "open"]);
});

Deno.test("results: redo replaces the day, the run completes after the last day, summary from stored results only", () => {
  const project = projectByKey("weekend-trip")!;
  let run: ProjectRun = { status: "active", days: [], started_at: "2026-10-24T09:00:00Z", completed_at: null };
  run = applyDayResult(project, run, result(1, "2026-10-24", 50));
  run = applyDayResult(project, run, result(1, "2026-10-24", 82));
  assertEquals(run.days.length, 1);
  assertEquals(run.days[0]?.score, 82);
  run = applyDayResult(project, run, result(2, "2026-10-25", 70));
  assertEquals(run.status, "active");
  assertEquals(previousExcerpt(run.days, 3)?.startsWith("Answer for day 2"), true);
  assertEquals(previousExcerpt(run.days, 1), null);
  run = applyDayResult(project, run, result(3, "2026-10-26", 60));
  assertEquals(run.status, "completed");
  assertEquals(run.completed_at, "2026-10-26T10:00:00Z");
  const summary = projectSummary(project, run.days);
  assertEquals(summary.score, 71);
  assertEquals(summary.words_used.sort(), ["afford", "decide"]);
  assertEquals(summary.corrections, 1);
  assertEquals(summary.points_total, 6);
  assertEquals(summary.points_met, 5);
  assertEquals(summary.achieved_all, false);
  assertEquals(summary.can_do, project.can_do);
});
