import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { HttpError } from "./core.ts";
import { correctionDecide, reviewDecide, setModuleUnlock } from "./staff.ts";
import { FakeDb } from "./test-fakes.ts";

type Row = Record<string, unknown>;
const ACADEMY = "a1a1a1a1-0000-4000-8000-000000000001";
const TEACHER = "71717171-0000-4000-8000-000000000001";
const SUB = "5b5b5b5b-0000-4000-8000-000000000001";
const K1 = "b1b1b1b1-0000-4000-8000-000000000001";
const CORRECTION = "c0c0c0c0-0000-4000-8000-000000000001";
const MODULE = "e2e2e2e2-0000-4000-8000-000000000002";
const QUIZ = "f1f1f1f1-0000-4000-8000-000000000001";

const setup = (scope: Row = { academy_wide: false, classroom_ids: [K1], contact_ids: [], roles: ["teacher"], allowed: true }) => {
  const db = new FakeDb({
    tenants: [{ id: ACADEMY, name: "Alpha Centre" }],
    academy_submissions: [{
      id: SUB, academy_id: ACADEMY, assignment_id: "h1", classroom_id: K1, contact_id: "c1", user_id: null,
      attempt_number: 1, updated_at: "2026-10-24T10:00:00Z", max_score: 10, graded_at: null,
    }],
    academy_assignments: [{ id: "h1", title: "Essay", max_score: 10, rubric_id: null, updated_at: "2026-10-20T00:00:00Z" }],
    academy_homework_ai_marks: [{
      id: "mark-1", submission_id: SUB, attempt_number: 1, status: "ready", suggested_score: 7, max_score: 10, summary: "Solid work.",
      strengths: ["clear"], improvements: ["tense"], rubric_scores: {},
      mistakes: [{ tag: "grammar.tense", excerpt: "I go yesterday", correction: "I went yesterday", explanation: "past" }],
    }],
    academy_homework_corrections: [{
      id: CORRECTION, academy_id: ACADEMY, submission_id: SUB, assignment_id: "h1", classroom_id: K1, contact_id: "c1", status: "submitted",
    }],
    academy_homework_mistakes: [],
    academy_course_modules: [{ id: MODULE, academy_id: ACADEMY, course_id: "course-1", position: 1, unlock_rule: {} }],
    academy_quizzes: [{ id: QUIZ, academy_id: ACADEMY, course_id: "course-1" }],
  }, {
    academy_homework_staff_scope: () => ({ data: scope }),
    academy_learning_plan: () => ({ data: { allowed: { homework: true, courses: true, homework_ai: true } } }),
    academy_grading_command: (args) => ({
      data: {
        actor_id: args.p_actor, request_key: args.p_request_key, command: args.p_command, replayed: false,
        submission: { id: SUB, academy_id: ACADEMY, assignment_id: "h1", contact_id: "c1" },
      },
    }),
  });
  return db;
};

const ctx = (db: FakeDb, body: Row) => ({ sb: db, actorId: TEACHER, academyId: ACADEMY, body, siteUrl: "https://schood.online" });

Deno.test("approving releases the AI draft only through academy_grading_command", async () => {
  const db = setup();
  const out = await reviewDecide(ctx(db, { decision: "approve", submission_id: SUB, expected_attempt_number: 1 }));
  assertEquals(out, { ok: true, decision: "approve", score: 7, max_score: 10 });
  const call = db.rpcCalls.find((c) => c.name === "academy_grading_command")!;
  assertEquals(call.args.p_command, "grade_submission");
  const payload = call.args.p_payload as Row;
  assertEquals(payload.score, 7);
  assertEquals(payload.expected_attempt_number, 1);
  assertEquals((payload.feedback as Row).ai_mark_id, "mark-1");
  assertEquals(db.table("academy_homework_mistakes").length, 1);
  assertEquals(db.table("academy_homework_mistakes")[0].source, "ai");
  assertEquals(db.table("academy_homework_ai_marks")[0].teacher_decision, "approved");
});

Deno.test("an edited score is the teacher's, and is bounded by the maximum", async () => {
  const db = setup();
  await reviewDecide(ctx(db, { decision: "edit", submission_id: SUB, expected_attempt_number: 1, score: 9, mistakes: [] }));
  assertEquals((db.rpcCalls.find((c) => c.name === "academy_grading_command")!.args.p_payload as Row).score, 9);
  assertEquals(db.table("academy_homework_ai_marks")[0].teacher_score, 9);
  await assertRejects(() => reviewDecide(ctx(setup(), { decision: "edit", submission_id: SUB, expected_attempt_number: 1, score: 11 })), HttpError);
});

Deno.test("returning work writes no grade and records the mistakes", async () => {
  const db = setup();
  await reviewDecide(ctx(db, {
    decision: "return", submission_id: SUB, expected_attempt_number: 1,
    mistakes: [{ tag: "spelling", excerpt: "recieve", correction: "receive" }],
  }));
  assertEquals(db.rpcCalls.filter((c) => c.name === "academy_grading_command").length, 0);
  assertEquals(db.table("academy_homework_events").map((e) => e.event), ["returned"]);
  assertEquals(db.table("academy_homework_mistakes")[0].tag, "spelling");
});

Deno.test("a newer attempt or another classroom is refused", async () => {
  await assertRejects(() => reviewDecide(ctx(setup(), { decision: "approve", submission_id: SUB, expected_attempt_number: 0 })), HttpError, "newer attempt");
  const outside = setup({ academy_wide: false, classroom_ids: ["b2b2b2b2-0000-4000-8000-000000000002"], contact_ids: [], roles: ["teacher"], allowed: true });
  await assertRejects(() => reviewDecide(ctx(outside, { decision: "approve", submission_id: SUB, expected_attempt_number: 1 })), HttpError, "Forbidden");
});

Deno.test("accepting a correction resolves open mistakes once", async () => {
  const db = setup();
  db.table("academy_homework_mistakes").push({ id: "mk", submission_id: SUB, status: "open" });
  await correctionDecide(ctx(db, { correction_id: CORRECTION, decision: "accept" }));
  assertEquals(db.table("academy_homework_mistakes")[0].status, "corrected");
  assertEquals(db.table("academy_homework_events").map((e) => e.event), ["corrected"]);
  await assertRejects(() => correctionDecide(ctx(db, { correction_id: CORRECTION, decision: "accept" })), HttpError, "already reviewed");
});

Deno.test("module unlock rules only accept a quiz from the same course", async () => {
  const db = setup({ academy_wide: true, classroom_ids: [], contact_ids: [], roles: ["owner"], allowed: true });
  const out = await setModuleUnlock(ctx(db, { module_id: MODULE, type: "quiz_pass", quiz_id: QUIZ, min_percent: 70 }));
  assertEquals(out.unlock_rule, { type: "quiz_pass", quiz_id: QUIZ, min_percent: 70 });
  await assertRejects(() => setModuleUnlock(ctx(db, { module_id: MODULE, type: "quiz_pass", quiz_id: "f9f9f9f9-0000-4000-8000-000000000009" })), HttpError, "belong to this course");
});
