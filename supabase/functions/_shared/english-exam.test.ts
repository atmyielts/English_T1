import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  EXAM_SECTIONS,
  examLevelFor,
  examOverall,
  examTargetFor,
  objectiveScore,
  scoreFromRating,
  speakingScore,
  SPEAKING_TABLE,
  writingScore,
  WRITING_TABLE,
} from "./english-exam-format.ts";
import {
  decideExamStart,
  isOvertime,
  objectiveSection,
  parseObjectiveAnswers,
  parseSpeakingAnswers,
  parseSpeakingMark,
  parseWritingAnswers,
  parseWritingMark,
  partItemIds,
  pickPaper,
  publicSection,
  scoreObjective,
  speakingCap,
  speakingTooShort,
  summarizeMock,
  validatePaper,
  writingCap,
  writingTooShort,
  type ExamPaper,
  type SectionResult,
} from "./english-exam.ts";
import { buildExamPlan, focusOrder, parseExamDate, readExamTrack, readinessFor, weekFocus } from "./english-exam-plan.ts";
import { examNextContext, examPrepCandidates } from "./english-exam-next.ts";
import { type NextInput, pickNextStep } from "./english-next.ts";
import { type CatalogItem, TODAY_SKILLS, type TodaySkill } from "./english-today.ts";

const paperFile = (n: number): unknown =>
  JSON.parse(Deno.readTextFileSync(new URL(`../../content/english/exam/multilevel-practice-${n}.json`, import.meta.url)));
const paper = (n = 1): ExamPaper => {
  const result = validatePaper(paperFile(n));
  if (!result.ok) throw new Error(JSON.stringify(result.problems));
  return result.paper;
};

// --- Official scales ---------------------------------------------------------------

Deno.test("level cut scores follow the Agency's table (C1 65, B2 51, B1 38)", () => {
  assertEquals([75, 65, 64.9, 51, 50, 38, 37, 0].map(examLevelFor), ["C1", "C1", "B2", "B2", "B1", "B1", "below_b1", "below_b1"]);
  assertEquals(examLevelFor(null), null);
});

Deno.test("the overall result is the rounded average of all four sections", () => {
  assertEquals(examOverall({ listening: 72, reading: 60, writing: 48, speaking: 64 }), 61);
  assertEquals(examOverall({ listening: 51, reading: 51, writing: 50, speaking: 51 }), 51);
  assertEquals(examOverall({ listening: 70, reading: 60 }), null);
});

Deno.test("writing expert score converts with the official 0-16 table", () => {
  assertEquals(WRITING_TABLE.length, 33);
  assertEquals([16, 15.5, 14, 12, 9, 6, 5.5, 3, 1, 0.5, 0].map(writingScore), [75, 72, 65, 61, 50, 40, 38, 28, 14, 10, 0]);
  assertEquals(writingScore(7.3), 43, "rounds down to the half point");
  assertEquals(writingScore(40), 75);
  assertEquals(writingScore(-2), 0);
});

Deno.test("speaking raw score converts with the official 0-21 table", () => {
  assertEquals(SPEAKING_TABLE.length, 43);
  assertEquals([21, 20.5, 18, 14, 13.5, 10.5, 9, 3, 0.5, 0].map(speakingScore), [75, 73, 64, 51, 50, 42, 38, 19, 10, 0]);
});

Deno.test("listening/reading estimate lands on the published correct-answer bands", () => {
  assertEquals([0, 9, 10, 17, 18, 27, 28, 35].map((n) => examLevelFor(objectiveScore(n, 35))), ["below_b1", "below_b1", "B1", "B1", "B2", "B2", "C1", "C1"]);
  assertEquals(objectiveScore(10, 35), 38);
  assertEquals(objectiveScore(18, 35), 51);
  assertEquals(objectiveScore(28, 35), 65);
  assertEquals(objectiveScore(24, 24), 75);
  assertEquals(objectiveScore(5, 0), 0);
});

Deno.test("ratings map onto the exam scale at each level's start", () => {
  assertEquals([2, 3, 4, 5, 5.9].map(scoreFromRating), [38, 51, 65, 75, 75]);
  assertEquals(scoreFromRating(null), null);
  assertEquals(examTargetFor("A2"), "B1");
  assertEquals(examTargetFor("B2"), "B2");
  assertEquals(examTargetFor("C2"), "C1");
});

// --- Papers --------------------------------------------------------------------------

Deno.test("all three practice papers validate, with 24 reading and 24 listening items", () => {
  for (const n of [1, 2, 3]) {
    const p = paper(n);
    assertEquals(p.reading.parts.flatMap(partItemIds).length, 24, `paper ${n} reading`);
    assertEquals(p.listening.parts.flatMap(partItemIds).length, 24, `paper ${n} listening`);
    assertEquals(new Set(p.reading.parts.map((part) => part.level)).size > 1, true);
  }
  assertEquals(new Set([1, 2, 3].map((n) => paper(n).level_focus)), new Set(["B1", "B2", "C1"]));
});

Deno.test("validation catches broken answer keys", () => {
  const raw = structuredClone(paperFile(1)) as { reading: { parts: Array<Record<string, unknown>> } };
  (raw.reading.parts[0]!.answers as Record<string, string>)["1"] = "elephant";
  ((raw.reading.parts[1]!.questions as Array<Record<string, unknown>>)[0]!).answer = "Z";
  const result = validatePaper(raw);
  assertEquals(result.ok, false);
  if (!result.ok) {
    assert(result.problems.some((problem) => problem.message.includes("must appear elsewhere")));
    assert(result.problems.some((problem) => problem.message.includes("answer must be one of the option ids")));
  }
  assertEquals(validatePaper(null).ok, false);
});

Deno.test("public sections never carry answer keys", () => {
  const p = paper(2);
  for (const section of EXAM_SECTIONS) {
    const text = JSON.stringify(publicSection(p, section));
    assertEquals(/"answers?"\s*:/.test(text), false, section);
  }
});

const allCorrect = (p: ExamPaper, section: "reading" | "listening"): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const part of p[section].parts) {
    for (const key of partItemIds(part)) {
      const id = key.slice(part.id.length + 1);
      if (part.type === "gap_fill") out[key] = part.answers[id]!.toUpperCase() + ".";
      else if (part.type === "mcq") out[key] = part.questions.find((q) => q.id === id)!.answer;
      else if (part.type === "headings") out[key] = part.paragraphs.find((q) => q.id === id)!.answer;
      else if (part.type === "dialogues") out[key] = part.items.find((q) => q.id === id)!.answer;
      else out[key] = part.notes.find((q) => q.id === id)!.answers.at(-1)!;
    }
  }
  return out;
};

Deno.test("objective scoring: everything right, nothing right, and bounded input", () => {
  const p = paper(1);
  const right = scoreObjective(p.reading.parts, parseObjectiveAnswers(allCorrect(p, "reading"), p.reading.parts));
  assertEquals([right.correct, right.total], [24, 24]);
  assertEquals(objectiveSection("reading", right, false).level, "C1");
  const listening = scoreObjective(p.listening.parts, parseObjectiveAnswers(allCorrect(p, "listening"), p.listening.parts));
  assertEquals(listening.correct, 24, "alternative note answers (e.g. a number) count");
  const none = scoreObjective(p.reading.parts, parseObjectiveAnswers({ "r1.1": "x".repeat(500), unknown: "A" }, p.reading.parts));
  assertEquals([none.correct, none.items.length], [0, 24]);
  assertEquals(objectiveSection("reading", none, true).score, 0);
});

// --- Limits ---------------------------------------------------------------------------

Deno.test("free learners: one full mock a week and one section mock a day", () => {
  const free = { admin: false, holdsEnglish: false, fullToday: 0, fullThisWeek: 0, sectionsToday: 0 };
  assertEquals(decideExamStart({ ...free, kind: "full" }), { allowed: true, basis: "free", left: 1, per: "week", limit: 1 });
  assertEquals(decideExamStart({ ...free, kind: "full", fullThisWeek: 1 }).allowed, false);
  assertEquals(decideExamStart({ ...free, kind: "reading", sectionsToday: 1 }).allowed, false);
  assertEquals(decideExamStart({ ...free, kind: "writing" }).left, 1);
});

Deno.test("learners with any English product get more; admins too", () => {
  const owner = { admin: false, holdsEnglish: true, fullToday: 1, fullThisWeek: 5, sectionsToday: 7 };
  assertEquals(decideExamStart({ ...owner, kind: "full" }), { allowed: true, basis: "owner", left: 1, per: "day", limit: 2 });
  assertEquals(decideExamStart({ ...owner, kind: "speaking" }).left, 1);
  assertEquals(decideExamStart({ ...owner, kind: "full", fullToday: 2 }).allowed, false);
  assertEquals(decideExamStart({ ...owner, admin: true, holdsEnglish: false, kind: "full" }).basis, "admin");
});

Deno.test("papers rotate: a fresh one first, else the one seen longest ago", () => {
  assertEquals(pickPaper(["a", "b", "c"], ["a", "b"], () => 0), "c");
  assertEquals(pickPaper(["a", "b", "c"], ["c", "a", "b"], () => 0), "b");
  assertEquals(pickPaper([], [], () => 0), null);
});

Deno.test("a section handed in long after its timer is marked over time", () => {
  const now = new Date("2026-10-24T10:00:00Z");
  assertEquals(isOvertime("writing", "2026-10-24T09:00:00Z", now), false);
  assertEquals(isOvertime("writing", "2026-10-24T08:55:00Z", now), true);
  assertEquals(isOvertime("reading", null, now), false);
});

// --- Writing and speaking marking ------------------------------------------------------------

const words = (n: number) => Array.from({ length: n }, (_, i) => (i % 7 === 0 ? "Because" : "word")).join(" ");

Deno.test("writing caps follow the official length notes", () => {
  assertEquals([writingCap("task11", 3), writingCap("task11", 20), writingCap("task11", 45)], [0, 2, 5]);
  assertEquals([writingCap("task12", 24), writingCap("task12", 60), writingCap("task12", 130)], [1, 2, 5]);
  assertEquals([writingCap("part2", 37), writingCap("part2", 90), writingCap("part2", 190)], [1, 2, 6]);
  assertEquals(writingTooShort(parseWritingAnswers({ task11: "Hi there", task12: "", part2: "" })), true);
});

Deno.test("writing marks are validated, clamped and capped by length", () => {
  const answers = parseWritingAnswers({ task11: words(48), task12: `I is very upset about the change. ${words(20)}`, part2: words(190) });
  const marked = parseWritingMark({
    task11: { score: 4, comment: "Clear and friendly." },
    task12: { score: 5, comment: "Good." },
    part2: { score: 9 },
    priorities: [{ area: "grammar", text: "Check subject-verb agreement.", practice: "grammar" }, { area: "nonsense", text: "x" }],
    fixes: [{ said: "I is very upset", better: "I am very upset", why: "Agreement." }, { said: "not in the text", better: "x", why: "" }],
  }, answers);
  assert(marked);
  assertEquals(marked.parts.task12!.score, 2, "27 words is capped at band 2");
  assertEquals(marked.parts.part2!.score, 6, "clamped to the scale");
  assertEquals(marked.raw, 12);
  assertEquals(marked.fixes.length, 1);
  assertEquals(marked.priorities.length, 1);
  assertEquals(parseWritingMark({ task11: { score: "x" } }, answers), null);
  assertEquals(parseWritingMark("nope", answers), null);
});

Deno.test("speaking caps follow how many answers were given", () => {
  const answers = parseSpeakingAnswers([{ text: "I live in Tashkent with my family", mode: "speech", seconds: 20 }, { text: "" }, { text: "I like football very much" }, { text: "ok" }]);
  assertEquals(speakingCap("q1_3", answers), 3);
  assertEquals(speakingCap("q4_6", answers), 0);
  assertEquals(speakingCap("q8", answers), 0);
  assertEquals(answers.length, 8);
  assertEquals(answers[0]!.seconds, 20);
  assertEquals(answers[2]!.seconds, null, "typed answers have no time");
  assertEquals(speakingTooShort(answers), true);
});

Deno.test("speaking marks convert through the official raw table", () => {
  const full = Array.from({ length: 8 }, () => ({ text: "I think this is a really interesting question for me", mode: "typed" }));
  const answers = parseSpeakingAnswers(full);
  const marked = parseSpeakingMark({ q1_3: { score: 4 }, q4_6: { score: 4 }, q7: { score: 3 }, q8: { score: 3 }, priorities: [], fixes: [] }, answers);
  assert(marked);
  assertEquals([marked.raw, marked.raw_max, speakingScore(marked.raw)], [14, 21, 51]);
});

Deno.test("a mock summary finds the overall level and the weakest section", () => {
  const section = (name: SectionResult["section"], score: number): SectionResult =>
    ({ section: name, score, level: examLevelFor(score)!, overtime: false, submitted_at: "2026-10-24T10:00:00Z" });
  const summary = summarizeMock({ listening: section("listening", 70), reading: section("reading", 60), writing: section("writing", 45), speaking: section("speaking", 55) });
  assertEquals([summary.overall, summary.level, summary.weakest], [58, "B2", "writing"]);
  assertEquals(summarizeMock({ reading: section("reading", 40) }).overall, null);
});

// --- Exam date, readiness and plan --------------------------------------------------------------

Deno.test("exam dates: today or later, within about a year; empty clears", () => {
  assertEquals(parseExamDate("2026-12-01", "2026-10-24"), { ok: true, date: "2026-12-01" });
  assertEquals(parseExamDate(null, "2026-10-24"), { ok: true, date: null });
  assertEquals(parseExamDate("2026-10-23", "2026-10-24"), { ok: false, code: "exam_date_past" });
  assertEquals(parseExamDate("2028-01-01", "2026-10-24"), { ok: false, code: "exam_date_too_far" });
  assertEquals(parseExamDate("2026-02-30", "2026-10-24"), { ok: false, code: "exam_date_invalid" });
  assertEquals(readExamTrack({ date: "bad", focus_order: ["writing", "x", "writing"] })?.focus_order, ["writing"]);
});

Deno.test("readiness prefers a recent mock, then the practice rating", () => {
  const now = new Date("2026-10-24T10:00:00Z");
  const readiness = readinessFor({
    ratings: { reading: { value: 3.2, confidence: "high" }, listening: { value: 2.1, confidence: "low" }, writing: { value: null } },
    mocks: { speaking: { score: 48, at: "2026-10-20T10:00:00Z" }, reading: { score: 30, at: "2026-07-01T10:00:00Z" } },
    now,
  });
  const by = Object.fromEntries(readiness.map((entry) => [entry.section, entry]));
  assertEquals([by.speaking!.source, by.speaking!.score], ["mock", 48]);
  assertEquals([by.reading!.source, by.reading!.level, by.reading!.tentative], ["rating", "B2", false]);
  assertEquals(by.listening!.tentative, true);
  assertEquals([by.writing!.score, by.writing!.source], [null, null]);
  assertEquals(focusOrder(readiness), ["writing", "listening", "speaking", "reading"]);
});

Deno.test("the weekly plan counts back from the exam, with a full mock in the final week", () => {
  const order = ["writing", "speaking", "listening", "reading"] as const;
  const plan = buildExamPlan({ today: "2026-10-24", date: "2026-11-20", order: [...order], lastFullMockAt: null });
  assertEquals([plan.status, plan.days_left, plan.weeks.length], ["upcoming", 27, 4]);
  assertEquals(plan.this_week?.mock, "full", "baseline: no full mock yet");
  assertEquals(plan.weeks.at(-1), { weeks_to_go: 0, starts: "2026-11-13", ends: "2026-11-19", focus: "writing", mock: "full", final: true });
  assertEquals(plan.weeks[0]!.starts, "2026-10-24");
  assertEquals(buildExamPlan({ today: "2026-10-24", date: null, order: [], lastFullMockAt: null }).status, "none");
  assertEquals(buildExamPlan({ today: "2026-10-24", date: "2026-10-24", order: [], lastFullMockAt: null }).status, "today");
  assertEquals(buildExamPlan({ today: "2026-10-25", date: "2026-10-24", order: [], lastFullMockAt: null }).status, "past");
  // The weakest section comes back every other week.
  assertEquals([0, 1, 2, 3, 4, 5].map((w) => weekFocus(w, [...order])), ["writing", "speaking", "writing", "listening", "writing", "reading"]);
});

// --- /hub/next -----------------------------------------------------------------------------------

const item = (skill: TodaySkill, slug: string): CatalogItem => ({ id: `${skill}-${slug}`, skill, slug, title: `${skill} ${slug}`, level: "B1", minutes: 10, difficulty: 0.5 });

Deno.test("exam prep enters /next only with an exam date in the window", () => {
  const now = new Date("2026-10-24T10:00:00Z");
  const ratings = { reading: { value: 3.5 }, listening: { value: 3.1 }, writing: { value: 2.2 }, speaking: { value: 2.9 } };
  assertEquals(examNextContext({}, ratings, now), null);
  assertEquals(examNextContext({ exam_track: { date: "2027-10-01" } }, ratings, now), null);
  assertEquals(examNextContext({ exam_track: { date: "2026-11-01" } }, ratings, now), { daysLeft: 8, focus: "speaking" });
  assertEquals(examNextContext({ exam_track: { date: "2026-10-30", focus_order: ["listening", "writing", "speaking", "reading"] } }, ratings, now), { daysLeft: 6, focus: "listening" });
  const steps = examPrepCandidates({ daysLeft: 6, focus: "listening" }, (skill) => item(skill, "x"), (entry, reason, extra) => ({
    kind: "activity", skill: entry.skill, content_item_id: entry.id, slug: entry.slug, title: entry.title, level: entry.level, minutes: 10, reason, detail: null, uses_free: false, ...extra,
  }));
  assertEquals([steps[0]?.reason, steps[0]?.skill, steps[0]?.detail], ["exam_prep", "listening", "6"]);
});

Deno.test("pickNextStep ranks exam prep after mistakes and before the weakest skill", () => {
  const items = TODAY_SKILLS.map((skill) => item(skill, "one"));
  const base: NextInput = {
    items,
    attempts: [],
    dueReviews: 0,
    fixes: [],
    ratings: { writing: { value: 1.5, level: "A2", progress: 50, attempts: 4 } },
    targetLevel: "B2",
    levelFor: () => "B1",
    planTasks: [],
    access: { owned: [...TODAY_SKILLS], freeLeft: 0, freeItemIds: [] },
  };
  assertEquals(pickNextStep(base).step?.reason, "weakest_skill");
  const withExam = pickNextStep({ ...base, exam: { daysLeft: 20, focus: "listening" } });
  assertEquals([withExam.step?.reason, withExam.step?.skill, withExam.step?.detail], ["exam_prep", "listening", "20"]);
  const lesson = item("grammar", "articles");
  const withFix = pickNextStep({ ...base, items: [...items, lesson], fixes: [{ topic: "articles", count: 3, example: "x", item: lesson }], exam: { daysLeft: 20, focus: "listening" } });
  assertEquals(withFix.step?.reason, "fix_mistake");
});
