import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  SAT_PLAN_TEMPLATES,
  SAT_PREMIUM_GUIDES,
  SAT_PUBLIC_MODULES,
  TOEFL_PLAN_TEMPLATES,
  TOEFL_PREMIUM_GUIDES,
  TOEFL_PUBLIC_MODULES,
  buildSatDiagnostic,
  buildToeflDiagnostic,
  parseSatOutcome,
  parseToeflOutcome,
} from "./exam-playbook-diagnostic.ts";
import { normalizeTemplateMeta, normalizeTemplateWeeks, planItemsFromSchedule, scheduleTemplateWeeks } from "./exam-playbook-plan.ts";

const today = new Date("2026-10-24T09:00:00Z");
const satSlugs = new Set<string>([...SAT_PUBLIC_MODULES, ...SAT_PREMIUM_GUIDES]);
const toeflSlugs = new Set<string>([...TOEFL_PUBLIC_MODULES, ...TOEFL_PREMIUM_GUIDES]);

const satOutcome = (rw: number, math: number, at = "2026-10-20T10:00:00Z") => ({
  id: crypto.randomUUID(),
  computed_at: at,
  overall_score: rw + math,
  raw_result: { sat: { reading_writing_score: rw, math_score: math, total_score: rw + math } },
});

Deno.test("SAT: simulator outcome shape from score-session is parsed (raw_result.sat, then section_scores)", () => {
  assertEquals(parseSatOutcome(satOutcome(610, 540)).total, 1150);
  const fromSections = parseSatOutcome({
    section_scores: { a: { type: "reading_writing", scaled_score_800: 600 }, b: { type: "math", scaled_score_800: 700 } },
  });
  assertEquals([fromSections.reading_writing, fromSections.math, fromSections.total], [600, 700, 1300]);
});

Deno.test("SAT: domain bottlenecks are ranked by points computed from the real accuracy gap", () => {
  const result = buildSatDiagnostic({
    profile: { target_total_score: 1400, deadline_date: "2027-01-30" },
    outcomes: [satOutcome(620, 580)],
    mastery: [
      { section_type: "math", domain: "algebra", difficulty: "medium", attempts: 20, rolling_accuracy: 0.45 },
      { section_type: "math", domain: "geometry_trig", difficulty: "medium", attempts: 10, rolling_accuracy: 0.8 },
      { section_type: "reading_writing", domain: "grammar", difficulty: "easy", attempts: 12, rolling_accuracy: 0.5 },
      { section_type: "reading_writing", domain: "transitions", difficulty: "easy", attempts: 2, rolling_accuracy: 0.1 },
    ],
    templates: [{ slug: "eight-week-standard", duration_days: 56 }, { slug: "twelve-week-foundation", duration_days: 84 }],
    today,
  });
  // Section targets: even split of 1400 = 700 each -> target accuracy (700-200)/600 = 0.8333.
  const [first, second] = result.bottlenecks;
  assertEquals(first.key, "domain:algebra");
  assertEquals(first.estimated_impact, Math.round((600 * 0.35 * (0.8333333 - 0.45)) / 10) * 10); // 80
  assertEquals(second.key, "domain:standard_english_conventions");
  assertEquals(second.estimated_impact, Math.round((600 * 0.26 * (0.8333333 - 0.5)) / 10) * 10); // 50
  // Geometry at 80% is within 3.3 points of target -> rounds to 0 -> not a bottleneck.
  assert(!result.bottlenecks.some((b) => b.domain === "geometry_trigonometry"));
  // Two attempts is too little evidence: reported as untested, not guessed.
  assert(result.untested.some((u) => u.domain === "expression_of_ideas"));
  assertEquals(result.module_priorities[0].slug, "math-algebra");
  assertEquals(result.current.total, 1200);
  assertEquals(result.gap.total, 200);
  assertEquals(first.evidence[0], { source: "practice", metric: "accuracy_pct", value: 45, detail: { attempts: 20 } });
});

Deno.test("SAT: every recommended slug and template is from the fixed contract list", () => {
  const profiles = [
    {},
    { target_total_score: 1550, current_score_or_estimate: 1450, deadline_date: "2026-11-01", purpose: "retake" },
    { target_total_score: 1300, current_section_scores: { reading_writing: 500, math: 450 }, deadline_date: "2027-06-01" },
    { target_total_score: 1500, target_section_scores: { reading_writing: 700, math: 800 }, current_section_scores: { reading_writing: 690, math: 600 } },
  ];
  for (const profile of profiles) {
    const result = buildSatDiagnostic({ profile, outcomes: [], mastery: [], templates: [], today });
    for (const p of result.module_priorities) assert(satSlugs.has(p.slug), `unexpected slug ${p.slug}`);
    for (const b of result.bottlenecks) for (const s of b.module_slugs) assert(satSlugs.has(s), s);
    for (const w of result.plan_suggestion.weeks) for (const s of w.modules) assert(satSlugs.has(s), s);
    assert((SAT_PLAN_TEMPLATES as readonly string[]).includes(result.plan_suggestion.template_slug!));
    assertEquals(result.plan_suggestion.template_published, false);
  }
});

Deno.test("SAT: no evidence means no invented numbers", () => {
  const result = buildSatDiagnostic({ profile: {}, outcomes: [], mastery: [], templates: [], today });
  assertEquals(result.bottlenecks, []);
  assertEquals(result.current.total, null);
  assertEquals(result.gap.total, null);
  assertEquals(result.module_priorities[0].slug, "sat-essentials");
  assertEquals(result.data_quality.confidence, "low");
  assertEquals(result.untested.map((u) => u.section), ["reading_writing", "math"]);
});

Deno.test("SAT: math-dominated gap picks math-priority; short runway picks the sprint", () => {
  const base = { target_total_score: 1400, current_section_scores: { reading_writing: 690, math: 520 } };
  assertEquals(buildSatDiagnostic({ profile: { ...base, deadline_date: "2027-03-01" }, outcomes: [], mastery: [], templates: [], today }).plan_suggestion.template_slug, "math-priority");
  const soon = buildSatDiagnostic({ profile: { ...base, deadline_date: "2026-11-10" }, outcomes: [], mastery: [], templates: [], today });
  assertEquals(soon.plan_suggestion.template_slug, "four-week-sprint");
  assert(soon.module_priorities.some((p) => p.slug === "test-day-guide" && p.reason === "test_soon"));
  assertEquals(soon.plan_suggestion.weeks.length, 2);
  assert(soon.plan_suggestion.weeks.at(-1)!.modules.includes("test-day-guide"));
});

Deno.test("Plan templates: IELTS-style weeks and phases normalise; schedule compresses to the test date", () => {
  const known = new Set(["math-algebra", "test-day-guide"]);
  const weeks = normalizeTemplateWeeks({
    weeks: [
      { label: "Week 1", focus: ["Baseline"], tasks: ["Read math-algebra", { title: "Timed set", minutes: 35 }] },
      { title: "Week 2", daily_routine: ["Drill"], modules: ["math-algebra"] },
      { label: "Week 3", focus: "Mocks" },
      { label: "Week 4", modules: [{ slug: "test-day-guide" }] },
    ],
  }, 28, known);
  assertEquals(weeks.length, 4);
  assertEquals(weeks[0].tasks[0].page_slug, "math-algebra");
  assertEquals(weeks[0].tasks[1].minutes, 35);
  const compressed = scheduleTemplateWeeks(weeks, { startDate: "2026-10-26", testDate: "2026-11-09" });
  assertEquals(compressed.compressed, true);
  assertEquals(compressed.weeks.length, 2);
  assertEquals(compressed.weeks[1].template_weeks, [3, 4]);
  assertEquals(compressed.weeks[1].ends_on, "2026-11-08");
  const roomy = scheduleTemplateWeeks(weeks, { startDate: "2026-10-26", testDate: "2027-01-25" });
  assertEquals([roomy.compressed, roomy.weeks.length, roomy.buffer_weeks], [false, 4, 9]);
  const items = planItemsFromSchedule(compressed);
  assert(items.every((i) => i.due_date <= "2026-11-08"));
  assert(items.some((i) => i.page_slug === "test-day-guide" && i.week_number === 2));
  const phased = normalizeTemplateWeeks({ phases: [{ label: "Foundations", weeks: 2, goal: "Fix basics" }, { label: "Mocks" }] }, 28);
  assertEquals(phased.map((w) => w.label), ["Foundations (1/2)", "Foundations (2/2)", "Mocks (1/2)", "Mocks (2/2)"]);
  assertEquals(normalizeTemplateWeeks({}, 28), []);
});

Deno.test("Plan templates: day-by-day tasks, hours and checkpoints (content contract shape) are kept and dated", () => {
  const schedule = {
    weekly_hours: { min: 8.6, max: 13.3, total: 47.4 },
    rules: ["Log every miss."],
    resources: [{ label: "SAT Practice Bank", url: "https://practice.sat.schood.online/bank" }, { label: "bad", url: "javascript:alert(1)" }],
    phases: [{ label: "Diagnose", weeks: [1], goal: "Baseline" }],
    weeks: [
      {
        week: 1, label: "Week 1", focus: ["Baseline"], hours: 12.5,
        days: [
          { day: 1, weekday: "Mon", minutes: 180, tasks: ["Full timed mock in the SAT simulator (https://sat.schood.online) at your real test time"] },
          { day: 3, weekday: "Wed", minutes: 105, tasks: ["Read R&W: Conventions (/reading-writing-conventions), 25 min"] },
        ],
        checkpoint: "Pass: fewer misses. If not: repeat week 1.",
      },
      { week: 2, label: "Week 2", hours: 11, days: [{ day: 7, tasks: ["Rest"] }] },
    ],
    checkpoints: [{ week: 1, title: "Baseline and targets", pass_rule: "Two targets chosen.", if_not: "Do not start week 2." }],
  };
  const weeks = normalizeTemplateWeeks(schedule, 14);
  assertEquals(weeks[0].hours, 12.5);
  assertEquals(weeks[0].days.map((d) => [d.day, d.minutes]), [[1, 180], [3, 105]]);
  assertEquals(weeks[0].tasks[0].url, "https://sat.schood.online");
  assertEquals(weeks[0].tasks[1].page_slug, "reading-writing-conventions");
  assertEquals(weeks[0].checkpoint, { title: "Baseline and targets", pass_rule: "Two targets chosen.", if_not: "Do not start week 2.", text: "Pass: fewer misses. If not: repeat week 1.", measure: null, target_band: null });
  const meta = normalizeTemplateMeta(schedule);
  assertEquals(meta.resources.length, 1);
  assertEquals(meta.weekly_hours, { min: 8.6, max: 13.3, total: 47.4 });
  assertEquals(meta.phases[0].weeks, [1]);

  const plan = scheduleTemplateWeeks(weeks, { startDate: "2026-10-26" });
  assertEquals(plan.weeks[0].tasks.map((t) => t.date), ["2026-10-26", "2026-10-28"]);
  assertEquals(plan.weeks[1].tasks[0].date, "2026-11-08");
  const items = planItemsFromSchedule(plan);
  const checkpoint = items.find((i) => i.metadata.checkpoint);
  assertEquals(checkpoint?.title, "Baseline and targets");
  assertEquals(checkpoint?.due_date, "2026-11-01");
  assertEquals(items[0].metadata, { day: 1, weekday: "Mon", url: "https://sat.schood.online" });

  // Compressed into one week before the test: tasks keep their order inside the week.
  const squeezed = scheduleTemplateWeeks(weeks, { startDate: "2026-10-26", testDate: "2026-11-03" });
  assertEquals(squeezed.weeks.length, 1);
  assertEquals(squeezed.weeks[0].hours, 23.5);
  const dates = squeezed.weeks[0].tasks.map((t) => t.date);
  assertEquals([...dates].sort(), dates);
  assert(dates.every((d) => d <= "2026-11-02"));
});
Deno.test("TOEFL: legacy 0-30 and 2026 band simulator results are both read", () => {
  const legacy = parseToeflOutcome({ raw_result: { toefl: { reading_score: 22, listening_score: 18, writing_score: 24, score_version: "toefl-rlw-estimate-v1" } } });
  assertEquals(legacy.format, "legacy_0_30");
  assertEquals(legacy.bands, { reading: 4.5, listening: 4, writing: 5 });
  assertEquals(legacy.overall, null); // speaking missing -> no overall
  const banded = parseToeflOutcome({ raw_result: { toefl: { reading_band: 5, listening_band: 4.5, writing_band: 4, speaking_band: 3.5, overall_band: 4.5 } } });
  assertEquals(banded.format, "band_2026");
  assertEquals(banded.overall, 4.5);
  const nested = parseToeflOutcome({ raw_result: { toefl: { bands: { reading: 3, listening: 3.5, writing: 4, speaking: 4 } } } });
  assertEquals(nested.overall, 3.5); // 3.625 -> 3.5
  const perSection = parseToeflOutcome({ section_scores: { s1: { type: "speaking", scaled_score_6: 4.5 }, s2: { type: "reading", scaled_score_30: 12 } } });
  assertEquals(perSection.bands, { speaking: 4.5 });
});

Deno.test("TOEFL: bottlenecks rank by band gap and the overall impact is projected with ETS rounding", () => {
  const result = buildToeflDiagnostic({
    profile: { target_band: 5, deadline_date: "2027-02-20" },
    outcomes: [{ id: "o1", computed_at: "2026-10-01T00:00:00Z", raw_result: { toefl: { reading_band: 5, listening_band: 4.5, writing_band: 4, speaking_band: 3.5 } } }],
    templates: [],
    today,
  });
  assertEquals(result.current.overall, 4.5); // 4.25 rounds up
  assertEquals(result.bottlenecks.map((b) => b.section), ["speaking", "writing", "listening"]);
  // Speaking 3.5 -> 5 makes the mean 4.625 -> 4.5: overall does not move.
  assertEquals(result.bottlenecks[0].estimated_impact, 0);
  assertEquals(result.bottlenecks[0].gap, 1.5);
  assertEquals(result.bottlenecks[0].evidence[0].detail?.legacy_range, { min: 18, max: 19 });
  assertEquals(result.plan_suggestion.template_slug, "speaking-writing-priority");
  assertEquals(result.target.overall_legacy_range, { min: 95, max: 106 });
  for (const p of result.module_priorities) assert(toeflSlugs.has(p.slug), p.slug);
  assert((TOEFL_PLAN_TEMPLATES as readonly string[]).includes(result.plan_suggestion.template_slug!));
});

Deno.test("TOEFL: legacy profile inputs are converted and flagged; missing sections are untested", () => {
  const result = buildToeflDiagnostic({
    profile: { score_scale: "legacy_120", target_total_score: 100, legacy_section_scores: { reading: 20, listening: 19 } },
    outcomes: [],
    templates: [],
    today,
  });
  assertEquals(result.target.overall, 5); // 100 -> band 5
  assertEquals(result.untested.map((u) => u.section), ["writing", "speaking"]);
  assertEquals(result.module_priorities.slice(0, 2).map((p) => p.slug), ["toefl-essentials", "score-scale-2026"]);
  assertEquals(result.current.overall, null);
  assertEquals(result.data_quality.legacy_inputs, true);
});

Deno.test("TOEFL: the simulator's 2026 result (sections.*.band + tasks) drives task-level module order and practice links", () => {
  // Shape written by score-session for experiences with format "toefl-2026" (toefl-2026-session.ts).
  const outcome = {
    id: "o2026",
    computed_at: "2026-10-27T08:00:00Z",
    status: "completed",
    raw_result: {
      toefl: {
        format: "toefl-2026",
        score_version: "toefl-2026-band-estimate-v1",
        sections: {
          reading: { section: "reading", band: 4, cefr: "B2", module_path: "upper" },
          listening: { section: "listening", band: 4.5, cefr: "B2" },
          writing: { section: "writing", band: 3.5, cefr: "B1" },
          speaking: { section: "speaking", band: null, pending_reason: "speaking_not_scored" },
        },
        overall_band: null,
        tasks: [
          { task: "complete_the_words", section: "reading", raw: 18, max: 20, items: 20, scale: "points" },
          { task: "read_academic_passage", section: "reading", raw: 3, max: 10, items: 10, scale: "points" },
          { task: "build_sentence", section: "writing", raw: 4, max: 10, items: 10, scale: "points" },
          { task: "write_email", section: "writing", raw: 4, max: 5, items: 1, scale: "0-5" },
        ],
        reading_score: null,
        listening_score: null,
      },
    },
  };
  const parsed = parseToeflOutcome(outcome);
  assertEquals(parsed.format, "band_2026");
  assertEquals(parsed.bands, { reading: 4, listening: 4.5, writing: 3.5 });
  assertEquals(parsed.tasks.map((t) => [t.task, t.accuracy]), [["complete_the_words", 0.9], ["read_academic_passage", 0.3], ["build_sentence", 0.4], ["write_email", 0.8]]);

  const result = buildToeflDiagnostic({ profile: { target_band: 5 }, outcomes: [outcome], templates: [], today });
  const reading = result.bottlenecks.find((b) => b.section === "reading")!;
  assertEquals(reading.module_slugs[0], "reading-daily-life-and-academic"); // weakest task first
  assertEquals(reading.practice_tasks, ["read_academic_passage", "complete_the_words"]);
  assertEquals(reading.evidence.find((e) => e.metric === "task_accuracy_pct")?.value, 30);
  const writing = result.bottlenecks.find((b) => b.section === "writing")!;
  assertEquals(writing.module_slugs[0], "writing-build-a-sentence");
  // Speaking has no band yet: reported as untested, not guessed; no overall band without all four.
  assert(result.untested.some((u) => u.section === "speaking"));
  assertEquals(result.current.overall, null);
  assertEquals(result.current.overall_partial, true);
  for (const p of result.module_priorities) assert(toeflSlugs.has(p.slug), p.slug);
});

Deno.test("TOEFL plan templates: task day prefixes, simulator actions and band checkpoints are kept", () => {
  const weeks = normalizeTemplateWeeks({
    weeks: [{
      week: 1, label: "Week 1 · Baseline", phase: "Diagnose", hours: 12,
      tasks: ["Day 1: full mock in the TOEFL simulator", "Days 3–4: 75 minutes on your largest error category"],
      modules: ["toefl-essentials"], guides: ["guide-band-4-to-5-roadmap"],
      simulator: { url: "https://toefl.schood.online/practice", action: "Task-type sets" },
      checkpoint: { measure: "Baseline bands recorded", target: "Profile identified" },
    }],
    checkpoints: [{ week: 1, check: "Full mock 1", target_band: "Entry 4–5 overall" }],
    daily_routine: ["20 minutes: one Complete the Words paragraph"],
    decision_rules: ["Never schedule a full mock in the last three days before the test."],
  }, 28, toeflSlugs);
  const w = weeks[0];
  assertEquals([w.phase, w.hours], ["Diagnose", 12]);
  assertEquals(w.tasks.map((t) => t.day), [1, 3, null]);
  assertEquals(w.tasks[2], { title: "Task-type sets", page_slug: null, url: "https://toefl.schood.online/practice", minutes: null, day: null, weekday: null });
  assertEquals(w.modules, ["toefl-essentials", "guide-band-4-to-5-roadmap"]);
  assertEquals(w.checkpoint, { title: "Full mock 1", pass_rule: "Profile identified", if_not: null, text: null, measure: "Baseline bands recorded", target_band: "Entry 4–5 overall" });
  const meta = normalizeTemplateMeta({ daily_routine: ["a"], decision_rules: ["b"], weekly_hours: { min: 10, max: 14 } });
  assertEquals([meta.daily_routine, meta.decision_rules, meta.weekly_hours], [["a"], ["b"], { min: 10, max: 14, total: null }]);
  const items = planItemsFromSchedule(scheduleTemplateWeeks(weeks, { startDate: "2026-11-02" }));
  assertEquals(items.find((i) => i.metadata.checkpoint)?.metadata.target_band, "Entry 4–5 overall");
  assertEquals(items[0].due_date, "2026-11-02");
  assertEquals(items[1].due_date, "2026-11-04");
});
