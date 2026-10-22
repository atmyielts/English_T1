import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  type AttemptRow,
  type CatalogItem,
  currentStreak,
  dailyCounts,
  longestStreak,
  pickFixes,
  pickItem,
  planToday,
  skillProgress,
  TODAY_SKILLS,
  weekStrip,
} from "./english-today.ts";

const item = (id: string, skill: CatalogItem["skill"], level: CatalogItem["level"], minutes = 6): CatalogItem => ({
  id,
  skill,
  slug: id,
  title: `Title ${id}`,
  level,
  minutes,
  difficulty: 0.5,
});

const attempt = (id: string, skill: AttemptRow["skill"], score: number | null, day: string): AttemptRow => ({
  content_item_id: id,
  skill,
  score,
  submitted_at: `${day}T10:00:00.000Z`,
});

const catalog: CatalogItem[] = [
  item("r-a2", "reading", "A2"),
  item("r-b1", "reading", "B1"),
  item("r-b2", "reading", "B2"),
  item("g-b1", "grammar", "B1", 8),
  item("w-b1", "writing", "B1", 9),
  item("s-b1", "speaking", "B1", 6),
  item("l-b1", "listening", "B1", 5),
];

Deno.test("new learner gets unseen items at their level and no invented weakness", () => {
  const plan = planToday({
    date: "2026-10-22",
    dailyMinutes: 20,
    overallLevel: "B1",
    perSkillLevel: {},
    items: catalog,
    attempts: [],
    dueReviews: 0,
    availableSkills: [...TODAY_SKILLS],
  });
  assert(plan.tasks.length >= 2);
  for (const task of plan.tasks) {
    assertEquals(task.kind, "activity");
    assertEquals(task.reason, "not_started");
    assertEquals(task.level, "B1");
    assertEquals(task.item_kind, "new");
  }
  assert(plan.minutes_total <= 25);
});

Deno.test("due reviews come first and count against the budget", () => {
  const plan = planToday({
    date: "2026-10-22",
    dailyMinutes: 15,
    overallLevel: "B1",
    perSkillLevel: {},
    items: catalog,
    attempts: [],
    dueReviews: 12,
    availableSkills: [...TODAY_SKILLS],
  });
  assertEquals(plan.tasks[0]?.kind, "review");
  assertEquals(plan.tasks[0]?.reason, "review_due");
  assert(plan.tasks.some((task) => task.kind === "activity"));
});

Deno.test("locked skills are never planned", () => {
  const plan = planToday({
    date: "2026-10-22",
    dailyMinutes: 60,
    overallLevel: "B1",
    perSkillLevel: {},
    items: catalog,
    attempts: [],
    dueReviews: 0,
    availableSkills: ["grammar"],
  });
  assertEquals(plan.tasks.map((task) => task.skill), ["grammar"]);
});

Deno.test("a skill with low recent scores is prioritised as weakest", () => {
  const plan = planToday({
    date: "2026-10-22",
    dailyMinutes: 10,
    overallLevel: "B1",
    perSkillLevel: {},
    items: catalog,
    attempts: [
      attempt("r-a2", "reading", 0.9, "2026-10-21"),
      attempt("g-b1", "grammar", 0.3, "2026-10-21"),
      attempt("w-b1", "writing", 0.9, "2026-10-21"),
      attempt("s-b1", "speaking", 0.9, "2026-10-21"),
      attempt("l-b1", "listening", 0.9, "2026-10-21"),
    ],
    dueReviews: 0,
    availableSkills: [...TODAY_SKILLS],
  });
  assertEquals(plan.tasks[0]?.skill, "grammar");
  assertEquals(plan.tasks[0]?.reason, "weakest");
  // Only one grammar item exists and it was attempted, so it is offered as a retry.
  assertEquals(plan.tasks[0]?.item_kind, "retry");
  assertEquals(plan.tasks[0]?.previous_score, 30);
});

Deno.test("pickItem steps down a level before stretching up", () => {
  const items = [item("a", "reading", "A2"), item("c", "reading", "B2")];
  const picked = pickItem(items, [], "B1");
  assertEquals(picked?.item.id, "a");
  assertEquals(picked?.kind, "easier");
});

Deno.test("an existing plan keeps its selection and marks finished work done", () => {
  const first = planToday({
    date: "2026-10-22",
    dailyMinutes: 20,
    overallLevel: "B1",
    perSkillLevel: {},
    items: catalog,
    attempts: [],
    dueReviews: 3,
    availableSkills: [...TODAY_SKILLS],
  });
  const activity = first.tasks.find((task) => task.kind === "activity")!;
  const second = planToday({
    date: "2026-10-22",
    dailyMinutes: 20,
    overallLevel: "B1",
    perSkillLevel: {},
    items: catalog,
    attempts: [attempt(activity.content_item_id!, activity.skill, 0.4, "2026-10-22")],
    dueReviews: 0,
    availableSkills: [...TODAY_SKILLS],
    existing: first.tasks,
  });
  assertEquals(second.tasks.map((task) => task.id), first.tasks.map((task) => task.id));
  assertEquals(second.tasks.find((task) => task.id === activity.id)?.done, true);
  assertEquals(second.tasks.find((task) => task.kind === "review")?.done, true);
  assertEquals(second.done_count, 2);
});

Deno.test("skill progress uses only real attempts and the learner's level", () => {
  const attempts = [
    attempt("r-b1", "reading", 0.8, "2026-10-22"),
    attempt("r-a2", "reading", 0.4, "2026-10-21"),
    attempt("g-b1", "grammar", null, "2026-10-20"),
  ];
  const levels: Record<string, "A2" | "B1"> = { "r-b1": "B1", "r-a2": "A2", "g-b1": "B1" };
  const rows = skillProgress(attempts, (id) => levels[id] ?? null, () => "B1");
  const reading = rows.find((row) => row.skill === "reading")!;
  assertEquals(reading.activities, 2);
  assertEquals(reading.recent_accuracy, 60);
  assertEquals(reading.accuracy_at_level, 80);
  assertEquals(reading.attempts_at_level, 1);
  const grammar = rows.find((row) => row.skill === "grammar")!;
  assertEquals(grammar.activities, 1);
  assertEquals(grammar.recent_accuracy, null);
  assertEquals(rows.find((row) => row.skill === "writing")!.activities, 0);
});

Deno.test("longest streak and daily counts", () => {
  const attempts = [
    attempt("a", "reading", 1, "2026-10-01"),
    attempt("b", "reading", 1, "2026-10-02"),
    attempt("c", "reading", 1, "2026-10-03"),
    attempt("d", "reading", 1, "2026-10-10"),
    attempt("e", "grammar", 1, "2026-10-10"),
  ];
  assertEquals(longestStreak(attempts), 3);
  assertEquals(longestStreak([]), 0);
  const days = dailyCounts(attempts, "2026-10-10", 10);
  assertEquals(days.length, 10);
  assertEquals(days[9], { date: "2026-10-10", count: 2 });
  assertEquals(days[0], { date: "2026-10-01", count: 1 });
});

Deno.test("streak counts consecutive days ending today or yesterday", () => {
  const attempts = [
    attempt("x", "reading", 1, "2026-10-21"),
    attempt("y", "reading", 1, "2026-10-20"),
    attempt("z", "reading", 1, "2026-10-18"),
  ];
  assertEquals(currentStreak(attempts, "2026-10-22"), 2);
  assertEquals(currentStreak([], "2026-10-22"), 0);
  const strip = weekStrip(attempts, "2026-10-22");
  assertEquals(strip.length, 7);
  assertEquals(strip[6], { date: "2026-10-22", count: 0 });
  assertEquals(strip[5], { date: "2026-10-21", count: 1 });
});

Deno.test("a repeated mistake puts its grammar lesson first, instead of another grammar item", () => {
  const lesson = item("g-art", "grammar", "A2", 8);
  const plan = planToday({
    date: "2026-10-22",
    dailyMinutes: 20,
    overallLevel: "B1",
    perSkillLevel: {},
    items: [...catalog, lesson],
    attempts: [],
    dueReviews: 0,
    availableSkills: [...TODAY_SKILLS],
    fixes: [{ topic: "articles", count: 3, example: "She opened door → She opened the door", item: lesson }],
  });
  assertEquals(plan.tasks[0]?.reason, "fix_mistake");
  assertEquals(plan.tasks[0]?.slug, "g-art");
  assertEquals(plan.tasks[0]?.detail, "She opened door → She opened the door");
  assertEquals(plan.tasks.filter((task) => task.skill === "grammar").length, 1);
});

Deno.test("fix candidates need two mistakes and drop topics whose lesson was passed since", () => {
  const lesson = item("g-art", "grammar", "A2");
  const lessons: Record<string, CatalogItem> = { articles: lesson, comparatives: item("g-cmp", "grammar", "A2") };
  const mistakes = [
    { topic: "articles", count: 1, example: "a umbrella → an umbrella", last_seen_at: "2026-10-20T10:00:00Z" },
    { topic: "articles", count: 1, example: "She opened door → She opened the door", last_seen_at: "2026-10-21T10:00:00Z" },
    { topic: "comparatives", count: 1, example: "more better → better", last_seen_at: "2026-10-21T10:00:00Z" },
  ];
  const fixes = pickFixes({ mistakes, lessonFor: (topic) => lessons[topic] ?? null, attempts: [] });
  assertEquals(fixes.map((fix) => fix.topic), ["articles"]);
  assertEquals(fixes[0]?.count, 2);
  assertEquals(fixes[0]?.example, "She opened door → She opened the door");
  const passed = pickFixes({
    mistakes,
    lessonFor: (topic) => lessons[topic] ?? null,
    attempts: [attempt("g-art", "grammar", 0.9, "2026-10-22")],
  });
  assertEquals(passed, []);
  const failedAgain = pickFixes({
    mistakes,
    lessonFor: (topic) => lessons[topic] ?? null,
    attempts: [attempt("g-art", "grammar", 0.5, "2026-10-22")],
  });
  assertEquals(failedAgain.map((fix) => fix.topic), ["articles"]);
});
