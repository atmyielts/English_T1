import { assert, assertEquals, assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  type CourseVersion,
  learnerQuestion,
  loadRunVersion,
  pinnedVersionId,
  snapshotLesson,
  snapshotQuestions,
  snapshotQuiz,
  versionCurriculum,
} from "./course-version.ts";
import { lockedModuleIds } from "./module-unlock.ts";

const academy = "00000000-0000-4000-8000-0000000000a1";
const course = "00000000-0000-4000-8000-0000000000c1";
const versionId = "00000000-0000-4000-8000-0000000000f1";
const m1 = "00000000-0000-4000-8000-0000000000d1";
const m2 = "00000000-0000-4000-8000-0000000000d2";
const l1 = "00000000-0000-4000-8000-0000000000e1";
const l2 = "00000000-0000-4000-8000-0000000000e2";
const quiz = "00000000-0000-4000-8000-0000000000b1";

const version: CourseVersion = {
  id: versionId,
  course_id: course,
  version: 2,
  published_at: "2026-10-24T09:00:00Z",
  snapshot: {
    course: { id: course, title: "IELTS evening", level: "B2", estimated_minutes: 600, metadata: {} },
    modules: [
      { id: m2, title: "Writing", position: 1, unlock_rule: { type: "quiz_pass", quiz_id: quiz, min_percent: 70 } },
      { id: m1, title: "Reading", position: 0, unlock_rule: {} },
    ],
    lessons: [
      { id: l2, module_id: m2, title: "Task 2", position: 0 },
      { id: l1, module_id: m1, title: "Skimming", position: 0, available_from: null },
    ],
    quizzes: [{ id: quiz, lesson_id: l1, title: "Reading check", passing_score: 60, attempts_allowed: 2 }],
    questions: [
      { id: "q2", quiz_id: quiz, question_type: "true_false", prompt: "B", correct_answer: true, points: 1, position: 1, explanation: "why" },
      { id: "q1", quiz_id: quiz, question_type: "single_choice", prompt: "A", options: ["x", "y"], correct_answer: "x", points: 1, position: 0, explanation: "why" },
    ],
  },
};

Deno.test("only pinned runs with a version read a snapshot; live and waiting runs read live rows", () => {
  assertEquals(pinnedVersionId({ version_mode: "pinned", course_version_id: versionId }), versionId);
  assertEquals(pinnedVersionId({ version_mode: "live", course_version_id: versionId }), null);
  assertEquals(pinnedVersionId({ version_mode: "pinned", course_version_id: null }), null);
  assertEquals(pinnedVersionId({ course_version_id: versionId }), null);
  assertEquals(pinnedVersionId(null), null);
});

Deno.test("a pinned curriculum has the live row shape, in published order, without answers", () => {
  const curriculum = versionCurriculum(academy, version);
  assertEquals(curriculum.course.id, course);
  assertEquals(curriculum.course.title, "IELTS evening");
  assertEquals(curriculum.course.status, "published");
  assertEquals(curriculum.course.course_version, 2);
  assertEquals(curriculum.modules.map((row) => row.id), [m1, m2]);
  for (const row of [...curriculum.modules, ...curriculum.lessons, ...curriculum.quizzes]) {
    assertEquals(row.academy_id, academy);
    assertEquals(row.course_id, course);
    assertEquals(row.status, "published");
  }
  assertEquals(curriculum.questions.map((row) => row.id), ["q1", "q2"]);
  for (const question of curriculum.questions) {
    assert(!("correct_answer" in question), "learners never receive correct answers");
    assert(!("explanation" in question), "explanations are released only with results");
  }
  assertEquals(Object.keys(learnerQuestion({ id: "x", correct_answer: 1 })).includes("correct_answer"), false);
});

Deno.test("unlock rules come from the version, not from later edits to the live module", () => {
  const curriculum = versionCurriculum(academy, version);
  const locked = lockedModuleIds(curriculum.modules, curriculum.lessons, new Set(), []);
  assert(locked.has(m2), "the published quiz_pass rule still locks module 2");
  const passed = lockedModuleIds(curriculum.modules, curriculum.lessons, new Set(), [{ quiz_id: quiz, status: "graded", percentage: 80 }]);
  assert(!passed.has(m2));
});

Deno.test("grading and gates read the version's lesson, quiz and full questions", () => {
  assertEquals(snapshotLesson(version, l2)?.module_id, m2);
  assertEquals(snapshotLesson(version, "missing"), null);
  assertEquals(snapshotQuiz(version, quiz)?.attempts_allowed, 2);
  const questions = snapshotQuestions(version, quiz);
  assertEquals(questions.map((row) => row.id), ["q1", "q2"]);
  assertEquals(questions[0].correct_answer, "x");
  assertEquals(snapshotQuestions(version, "other"), []);
});

type Call = { table: string; filters: Array<[string, unknown]> };
const fakeDb = (tables: Record<string, unknown>, calls: Call[]) => ({
  from(table: string) {
    const call: Call = { table, filters: [] };
    calls.push(call);
    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => (call.filters.push([column, value]), builder),
      in: (column: string, value: unknown) => (call.filters.push([column, value]), builder),
      limit: () => Promise.resolve({ data: tables[table] ?? [], error: null }),
      maybeSingle: () => Promise.resolve({ data: tables[table] ?? null, error: null }),
    };
    return builder;
  },
});

Deno.test("a learner's run loads its pinned version, scoped to the academy", async () => {
  const calls: Call[] = [];
  const db = fakeDb({
    academy_classroom_courses: { id: "run", status: "active", version_mode: "pinned", course_version_id: versionId },
    academy_course_versions: [version],
  }, calls);
  const result = await loadRunVersion(db, academy, "classroom", course);
  assertEquals(result.version?.version, 2);
  assertEquals(calls.map((call) => call.table), ["academy_classroom_courses", "academy_course_versions"]);
  assert(calls.every((call) => call.filters.some(([column, value]) => column === "academy_id" && value === academy)));
});

Deno.test("a live run never loads a version", async () => {
  const calls: Call[] = [];
  const db = fakeDb({ academy_classroom_courses: { id: "run", status: "active", version_mode: "live", course_version_id: null } }, calls);
  const result = await loadRunVersion(db, academy, "classroom", course);
  assertEquals(result.version, null);
  assertEquals(result.run?.id, "run");
  assertEquals(calls.length, 1);
});

const root = new URL("../../../", import.meta.url);
const migration = await Deno.readTextFile(new URL("supabase/migrations/20261024231500_academy_course_versions.sql", root));

Deno.test("course versions are service-only, tenant-scoped and keep existing runs live", () => {
  assertMatch(migration, /create table if not exists public\.academy_course_versions/);
  assertMatch(migration, /foreign key \(course_id, academy_id\) references public\.academy_courses\(id, academy_id\) on delete cascade/);
  assertMatch(migration, /alter table public\.academy_course_versions enable row level security;/);
  assertMatch(migration, /revoke all on public\.academy_course_versions from anon, authenticated;/);
  assertEquals(/grant [a-z, ]+ on public\.academy_course_versions to (anon|authenticated)/i.test(migration), false);
  // Existing rows are filled with 'live' before the default becomes 'pinned'.
  const live = migration.indexOf("add column if not exists version_mode text not null default 'live'");
  const pinned = migration.indexOf("alter column version_mode set default 'pinned'");
  assert(live > 0 && pinned > live);
  assertMatch(migration, /references public\.academy_course_versions\(id, course_id, academy_id\) on delete set null \(course_version_id\)/);
});

Deno.test("every version function is private to the service role", () => {
  for (const fn of [
    "academy_course_publish_version",
    "academy_run_snapshot",
    "academy_classroom_course_move_version",
    "academy_course_version_summaries",
    "academy_module_unlocked",
    "academy_course_completion",
    "academy_public_course_catalog",
  ]) {
    assertMatch(migration, new RegExp(`create or replace function public\\.${fn}\\(`));
    assertMatch(migration, new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon, authenticated;`));
    assertMatch(migration, new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to service_role;`));
  }
  assertMatch(migration, /revoke all on function public\.academy_course_snapshot\(uuid, uuid\) from public, anon, authenticated;/);
});

Deno.test("publishing snapshots, assignment pins, and moving is explicit and authority-checked", () => {
  assertMatch(migration, /after update of status, published_at on public\.academy_courses/);
  assertMatch(migration, /before insert on public\.academy_classroom_courses/);
  assertMatch(migration, /latest\.checksum = digest/);
  assertMatch(migration, /academy_command_covers\(public\.academy_current_authorities\(p_academy, p_actor\), 'manageAssignments', scope\)/);
  assertMatch(migration, /p_expected_version is not null and latest\.version <> p_expected_version/);
  assertMatch(migration, /\('move_course_version', 'write', array\['manageAssignments'\]\)/);
});
