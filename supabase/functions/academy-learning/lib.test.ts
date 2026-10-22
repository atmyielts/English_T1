import { assert, assertEquals, assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  botCommand, cleanMistakes, fileExtension, openAssignments, parseCallback, rubricCriteria, sortOpenWork,
  studentFeedbackMessage, telegramItem, textSimilarity,
} from "./lib.ts";
import { lockedModuleIds } from "../academy/module-unlock.ts";

const ID = "d1d1d1d1-0000-4000-8000-000000000001";

Deno.test("picks the highest-resolution photo and keeps document metadata", () => {
  const photo = telegramItem({ photo: [{ file_id: "s", width: 90, height: 90, file_size: 1 }, { file_id: "l", width: 1280, height: 960, file_size: 9 }] });
  assertEquals(photo?.file_id, "l");
  assertEquals(photo?.mime_type, "image/jpeg");
  const doc = telegramItem({ document: { file_id: "d", mime_type: "application/pdf", file_name: "hw.PDF", file_size: 5 } });
  assertEquals(doc?.kind, "document");
  assertEquals(fileExtension(doc!), "pdf");
  assertEquals(telegramItem({ text: "hi" }), null);
});

Deno.test("parses only well-formed callback data", () => {
  assertEquals(parseCallback(`hw:p:${ID}:2`), { kind: "pick", draftId: ID, index: 2 });
  assertEquals(parseCallback(`hw:v:${ID}`), { kind: "view", assignmentId: ID });
  assertEquals(parseCallback("ctr:all"), { kind: "center", academyId: null });
  assertEquals(parseCallback("hw:p:not-a-uuid:1"), null);
  assert(`hw:p:${ID}:12`.length <= 64);
  assertEquals(botCommand("/homework@schoodstudentbot now"), { command: "/homework", args: "now" });
});

Deno.test("open assignments follow release, late and attempt rules", () => {
  const now = Date.parse("2026-10-24T10:00:00Z");
  const base = { academy_id: "a", classroom_id: "k", title: "t", status: "active", attempts_allowed: 1, allow_late_submission: true, released_at: null, due_at: null };
  const assignments = [
    { ...base, id: "open" },
    { ...base, id: "future", released_at: "2026-10-25T00:00:00Z" },
    { ...base, id: "closed", due_at: "2026-10-23T00:00:00Z", allow_late_submission: false },
    { ...base, id: "late-ok", due_at: "2026-10-23T00:00:00Z" },
    { ...base, id: "used" },
    { ...base, id: "retry", attempts_allowed: 2 },
    { ...base, id: "other-class", classroom_id: "x" },
  ];
  const subs = [
    { id: "s1", assignment_id: "used", contact_id: "c", attempt_number: 1, status: "graded" },
    { id: "s2", assignment_id: "retry", contact_id: "c", attempt_number: 1, status: "graded" },
  ];
  const ids = openAssignments(assignments, subs, new Map([["k", "c"]]), now).map((a) => a.id);
  assertEquals(ids, ["open", "late-ok", "retry"]);
});

Deno.test("corrections come first, then the nearest due date", () => {
  const w = (type: "assignment" | "correction", title: string, due_at: string | null) =>
    ({ type, title, due_at, assignment_id: title, submission_id: null, academy_id: "a", classroom_id: "k", contact_id: "c", center_name: "A" });
  const sorted = sortOpenWork([w("assignment", "later", "2026-11-01T00:00:00Z"), w("assignment", "none", null), w("correction", "fix", null), w("assignment", "soon", "2026-10-25T00:00:00Z")]);
  assertEquals(sorted.map((x) => x.title), ["fix", "soon", "later", "none"]);
});

Deno.test("text similarity flags copied essays but not short answers", () => {
  const essay = "The city where I live is very big and it has many parks museums and old buildings that tourists like to visit every summer when the weather is warm";
  assert(textSimilarity(essay, essay.replace("very big", "really big")) > 0.6);
  assertEquals(textSimilarity("1b 2c 3a", "1b 2c 3a"), 0);
  assert(textSimilarity(essay, "Mathematics homework about fractions and decimals with twelve exercises from the textbook page forty two and three word problems") < 0.1);
});

Deno.test("rubric criteria are read the way the grading command reads them", () => {
  assertEquals(rubricCriteria([{ title: "Task", max_points: 4 }, { id: "gra", name: "Grammar", max_score: 5 }]),
    [{ id: "criterion-1", title: "Task", max: 4, description: undefined }, { id: "gra", title: "Grammar", max: 5, description: undefined }]);
  assertEquals(rubricCriteria([{ title: "No max" }]), null);
  assertEquals(rubricCriteria([]), null);
});

Deno.test("mistakes are cleaned and feedback is HTML-escaped", () => {
  const mistakes = cleanMistakes([{ tag: "Grammar.Tense", excerpt: "I go <yesterday>", correction: "I went" }, { tag: "x" }, "bad"], "teacher");
  assertEquals(mistakes.length, 1);
  assertEquals(mistakes[0].tag, "grammar.tense");
  const message = studentFeedbackMessage({ title: "Essay <1>", centerName: "Alpha", decision: "returned", comments: "Fix tense", mistakes });
  assertMatch(message, /Essay &lt;1&gt;/);
  assertMatch(message, /I go &lt;yesterday&gt; → <i>I went<\/i>/);
  assertMatch(message, /Send your corrected work here/);
});

Deno.test("module unlock rules match the SQL gate", () => {
  const modules = [
    { id: "m1", course_id: "c", position: 0, unlock_rule: {} },
    { id: "m2", course_id: "c", position: 1, unlock_rule: { type: "previous_module" } },
    { id: "m3", course_id: "c", position: 2, unlock_rule: { type: "quiz_pass", quiz_id: "q1", min_percent: 70 } },
    { id: "m4", course_id: "c", position: 3, unlock_rule: { type: "quiz_pass", quiz_id: "q2" } },
  ];
  const lessons = [{ id: "l1", module_id: "m1" }, { id: "l2", module_id: "m1" }];
  const attempts = [
    { quiz_id: "q1", status: "graded", percentage: 65, passed: true },
    { quiz_id: "q2", status: "submitted", passed: true },
  ];
  assertEquals([...lockedModuleIds(modules, lessons, new Set(["l1"]), attempts)].sort(), ["m2", "m3"]);
  assertEquals([...lockedModuleIds(modules, lessons, new Set(["l1", "l2"]), [...attempts, { quiz_id: "q1", status: "graded", percentage: 80 }])], []);
});
