import { assert, assertEquals, assertMatch, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  assignmentLabel,
  assignmentNextSteps,
  assignmentProgress,
  assignmentReminderText,
  assignmentState,
  buildDigest,
  type ClassAssignment,
  type ClassAttempt,
  classRole,
  classWeakSkills,
  cleanClassFields,
  decideCreateClass,
  decideJoin,
  digestText,
  dueAtFor,
  generateJoinCode,
  isAssignmentVisible,
  isDigestTime,
  JOIN_CODE_ALPHABET,
  joinLink,
  joinOutcome,
  learnerDateOf,
  learnerStreak,
  normalizeJoinCode,
  parseAssignmentInput,
  planTier,
  skillLevelsFrom,
  studentActivity,
  tomorrowOf,
  topClassMistakes,
} from "./english-classes.ts";
import { pickNextStep } from "./english-next.ts";
import { type CatalogItem, TODAY_SKILLS, type TodaySkill } from "./english-today.ts";
import { defaultEnglishSettings, isServicePaused, parseEnglishSettingsRows, validateEnglishSettingsPatch } from "./english-settings.ts";

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const assignment = (patch: Partial<ClassAssignment> = {}): ClassAssignment => ({
  id: ID(900),
  class_id: ID(800),
  kind: "skill_count",
  title: null,
  skill: "listening",
  level: "B1",
  required_count: 3,
  content_item_ids: [],
  scenario_id: null,
  note: null,
  due_at: "2026-11-02T18:59:59.999Z",
  created_at: "2026-10-26T08:00:00.000Z",
  ...patch,
});

const attempt = (patch: Partial<ClassAttempt> = {}): ClassAttempt => ({
  user_id: ID(1),
  content_item_id: ID(100),
  skill: "listening",
  content_type: "listening.item",
  source_ref: "some-item",
  level: "B1",
  score: 0.8,
  submitted_at: "2026-10-27T10:00:00.000Z",
  seconds: 600,
  minutes: 10,
  ...patch,
});

// --- Join codes -------------------------------------------------------------------

Deno.test("join codes use 6 characters with no look-alikes", () => {
  for (const banned of ["0", "O", "1", "I", "L"]) assert(!JOIN_CODE_ALPHABET.includes(banned), banned);
  assertEquals(new Set(JOIN_CODE_ALPHABET).size, JOIN_CODE_ALPHABET.length);
  const seen = new Set<string>();
  for (let i = 0; i < 200; i += 1) {
    const code = generateJoinCode();
    assertMatch(code, /^[A-HJKMNP-Z2-9]{6}$/);
    seen.add(code);
  }
  assert(seen.size > 195, "codes should rarely repeat");
});

Deno.test("join code generation skips biased bytes and stays in the alphabet", () => {
  // 248 and above would bias the first characters; they must be skipped.
  let call = 0;
  const bytes = (count: number) => {
    call += 1;
    return new Uint8Array(Array.from({ length: count }, (_, i) => (call === 1 ? 255 : i)));
  };
  assertEquals(generateJoinCode(bytes), JOIN_CODE_ALPHABET.slice(0, 6));
});

Deno.test("codes are read the way learners type or paste them", () => {
  assertEquals(normalizeJoinCode("abc-234"), "ABC234");
  assertEquals(normalizeJoinCode("  k7m 9pq "), "K7M9PQ");
  assertEquals(normalizeJoinCode("https://english.schood.online/classes?join=hjk234"), "HJK234");
  assertEquals(normalizeJoinCode("ABCO12"), null); // O and 1 are never in a code
  assertEquals(normalizeJoinCode("ABC23"), null);
  assertEquals(normalizeJoinCode(42), null);
  assertEquals(normalizeJoinCode(""), null);
  assertEquals(joinLink("https://english.schood.online/", "ABC234"), "https://english.schood.online/classes?join=ABC234");
});

// --- Classes and permissions -----------------------------------------------------------

Deno.test("class fields: a name is needed, level and school are optional", () => {
  assertEquals(cleanClassFields({ name: "  Group  7A \n" }), { ok: true, value: { name: "Group 7A" } });
  assertEquals(cleanClassFields({ name: "" }).ok, false);
  assertEquals(cleanClassFields({ name: "X", level: "Z9" }).ok, false);
  assertEquals(cleanClassFields({ name: "X", level: "B1", school_name: " " }), { ok: true, value: { name: "X", level: "B1", school_name: null } });
  // Editing accepts any subset.
  assertEquals(cleanClassFields({ school_name: "Registon LC" }, true), { ok: true, value: { school_name: "Registon LC" } });
  assertEquals(cleanClassFields({ name: "a".repeat(200) }, false).ok && (cleanClassFields({ name: "a".repeat(200) }) as { value: { name: string } }).value.name.length, 80);
});

Deno.test("teachers can open classes up to the cap", () => {
  assertEquals(decideCreateClass({ activeOwned: 9, cap: 10 }).ok, true);
  assertEquals(decideCreateClass({ activeOwned: 10, cap: 10 }).ok, false);
});

Deno.test("roles: the teacher, an active member, or nobody", () => {
  const cls = { teacher_id: ID(1) };
  assertEquals(classRole(cls, null, ID(1)), "teacher");
  assertEquals(classRole(cls, { status: "active" }, ID(2)), "member");
  assertEquals(classRole(cls, { status: "left" }, ID(2)), "none");
  assertEquals(classRole(cls, { status: "removed" }, ID(2)), "none");
  assertEquals(classRole(cls, null, ID(3)), "none");
});

Deno.test("joining needs an active class, someone else's class and explicit consent", () => {
  const cls = { teacher_id: ID(1), status: "active" };
  assertEquals(decideJoin({ cls, userId: ID(2), consent: true }), { ok: true });
  assertEquals((decideJoin({ cls, userId: ID(2), consent: false }) as { code: string }).code, "class_consent_required");
  assertEquals((decideJoin({ cls, userId: ID(1), consent: true }) as { code: string }).code, "class_own");
  assertEquals((decideJoin({ cls: { ...cls, status: "archived" }, userId: ID(2), consent: true }) as { code: string }).code, "class_not_found");
  assertEquals((decideJoin({ cls: null, userId: ID(2), consent: true }) as { status: number }).status, 404);
  assertEquals(joinOutcome("joined"), { status: 200, code: "joined" });
  assertEquals(joinOutcome("removed").status, 403);
  assertEquals(joinOutcome("class_full").status, 409);
  assertEquals(joinOutcome(null).status, 404);
});

Deno.test("plan tier: free, some skills, or everything", () => {
  assertEquals(planTier({ admin: false, ownedSkills: 0, totalSkills: 7 }), "free");
  assertEquals(planTier({ admin: false, ownedSkills: 2, totalSkills: 7 }), "partial");
  assertEquals(planTier({ admin: false, ownedSkills: 7, totalSkills: 7 }), "full");
  assertEquals(planTier({ admin: true, ownedSkills: 0, totalSkills: 7 }), "full");
});

// --- Assignment input --------------------------------------------------------------------

const ctx = { today: "2026-10-26", isScenario: (id: string) => id === "cafe-order" };

Deno.test("due dates end at midnight learner time and must be today..90 days ahead", () => {
  assertEquals(dueAtFor("2026-11-02"), "2026-11-02T18:59:59.999Z");
  assertEquals(learnerDateOf(dueAtFor("2026-11-02")), "2026-11-02");
  assertEquals((parseAssignmentInput({ kind: "speaking_mock", due_date: "2026-10-25" }, ctx) as { code: string }).code, "assignment_due_past");
  assertEquals((parseAssignmentInput({ kind: "speaking_mock", due_date: "2027-03-01" }, ctx) as { code: string }).code, "assignment_due_far");
  assertEquals((parseAssignmentInput({ kind: "speaking_mock", due_date: "soon" }, ctx) as { code: string }).code, "assignment_due_invalid");
  assertEquals(parseAssignmentInput({ kind: "speaking_mock", due_date: "2026-10-26" }, ctx).ok, true);
});

Deno.test("assignment kinds validate what they need", () => {
  const lessons = parseAssignmentInput({ kind: "lessons", content_item_ids: [ID(1), ID(2), ID(1)], due_date: "2026-11-01", note: " Read carefully " }, ctx);
  assert(lessons.ok);
  assertEquals([lessons.value.content_item_ids.length, lessons.value.required_count, lessons.value.note], [2, 2, "Read carefully"]);
  assertEquals((parseAssignmentInput({ kind: "lessons", content_item_ids: [], due_date: "2026-11-01" }, ctx) as { code: string }).code, "assignment_lessons_required");
  assertEquals((parseAssignmentInput({ kind: "lessons", content_item_ids: ["nope"], due_date: "2026-11-01" }, ctx) as { code: string }).code, "assignment_lessons_invalid");
  assertEquals((parseAssignmentInput({ kind: "lessons", content_item_ids: Array.from({ length: 11 }, (_, i) => ID(i)), due_date: "2026-11-01" }, ctx) as { code: string }).code, "assignment_lessons_too_many");

  const count = parseAssignmentInput({ kind: "skill_count", skill: "listening", level: "B1", count: 3, due_date: "2026-11-01" }, ctx);
  assert(count.ok);
  assertEquals([count.value.skill, count.value.level, count.value.required_count], ["listening", "B1", 3]);
  assertEquals((parseAssignmentInput({ kind: "skill_count", skill: "cooking", count: 3, due_date: "2026-11-01" }, ctx) as { code: string }).code, "assignment_skill_invalid");
  assertEquals((parseAssignmentInput({ kind: "skill_count", skill: "reading", count: 0, due_date: "2026-11-01" }, ctx) as { code: string }).code, "assignment_count_invalid");
  assertEquals((parseAssignmentInput({ kind: "skill_count", skill: "reading", count: 21, due_date: "2026-11-01" }, ctx) as { code: string }).code, "assignment_count_invalid");

  const roleplay = parseAssignmentInput({ kind: "roleplay", scenario_id: "cafe-order", due_date: "2026-11-01" }, ctx);
  assert(roleplay.ok);
  assertEquals([roleplay.value.skill, roleplay.value.scenario_id], ["speaking", "cafe-order"]);
  assertEquals(parseAssignmentInput({ kind: "roleplay", due_date: "2026-11-01" }, ctx).ok, true);
  assertEquals((parseAssignmentInput({ kind: "roleplay", scenario_id: "moon-landing", due_date: "2026-11-01" }, ctx) as { code: string }).code, "assignment_scenario_invalid");
  assertEquals((parseAssignmentInput({ kind: "homework", due_date: "2026-11-01" }, ctx) as { code: string }).code, "assignment_kind_invalid");
});

// --- Completion from real attempts ----------------------------------------------------------

Deno.test("skill_count: distinct activities in that skill and level since the assignment was set", () => {
  const a = assignment();
  const attempts = [
    attempt({ content_item_id: ID(101), submitted_at: "2026-10-25T10:00:00.000Z" }), // before it was set
    attempt({ content_item_id: ID(102) }),
    attempt({ content_item_id: ID(102), submitted_at: "2026-10-27T11:00:00.000Z" }), // a redo
    attempt({ content_item_id: ID(103), level: "A2" }), // another level
    attempt({ content_item_id: ID(104), skill: "reading", content_type: "reading.article" }), // another skill
    attempt({ content_item_id: ID(105), submitted_at: "2026-10-28T09:00:00.000Z" }),
  ];
  assertEquals(assignmentProgress(a, attempts), { done: 2, required: 3, complete: false, completed_at: null });
  const done = assignmentProgress(a, [...attempts, attempt({ content_item_id: ID(106), submitted_at: "2026-10-29T09:00:00.000Z" })]);
  assertEquals([done.done, done.complete, done.completed_at], [3, true, "2026-10-29T09:00:00.000Z"]);
  // Without a level, any level counts.
  assertEquals(assignmentProgress(assignment({ level: null }), attempts).done, 3);
});

Deno.test("lessons: each assigned lesson once; other lessons do not count", () => {
  const a = assignment({ kind: "lessons", skill: null, level: null, content_item_ids: [ID(201), ID(202)], required_count: 2 });
  const p = assignmentProgress(a, [attempt({ content_item_id: ID(201) }), attempt({ content_item_id: ID(201) }), attempt({ content_item_id: ID(299) })]);
  assertEquals([p.done, p.required, p.complete], [1, 2, false]);
  assert(assignmentProgress(a, [attempt({ content_item_id: ID(201) }), attempt({ content_item_id: ID(202), skill: "reading" })]).complete);
});

Deno.test("role-plays and the mock count once finished (any scenario unless one is set)", () => {
  const roleplay = attempt({ skill: "speaking", content_type: "speaking.roleplay", source_ref: "roleplay-cafe-order" });
  assert(assignmentProgress(assignment({ kind: "roleplay", skill: "speaking", scenario_id: null }), [roleplay]).complete);
  assert(assignmentProgress(assignment({ kind: "roleplay", skill: "speaking", scenario_id: "cafe-order" }), [roleplay]).complete);
  assertEquals(assignmentProgress(assignment({ kind: "roleplay", skill: "speaking", scenario_id: "job-interview" }), [roleplay]).complete, false);
  const mock = attempt({ skill: "speaking", content_type: "speaking.mock", source_ref: "ielts-speaking-mock" });
  assertEquals(assignmentProgress(assignment({ kind: "speaking_mock", skill: "speaking" }), [roleplay]).complete, false);
  assertEquals(assignmentProgress(assignment({ kind: "speaking_mock", skill: "speaking" }), [mock, mock]), { done: 1, required: 1, complete: true, completed_at: mock.submitted_at });
  // A practice prompt in speaking is not a role-play.
  assertEquals(assignmentProgress(assignment({ kind: "roleplay", skill: "speaking" }), [attempt({ skill: "speaking", content_type: "speaking.prompt" })]).complete, false);
});

Deno.test("state: done, pending before the due time, overdue after; overdue stays visible a week", () => {
  const a = assignment();
  const open = { done: 1, required: 3, complete: false, completed_at: null };
  assertEquals(assignmentState(open, a.due_at, new Date("2026-11-02T18:00:00Z")), "pending");
  assertEquals(assignmentState(open, a.due_at, new Date("2026-11-02T19:30:00Z")), "overdue");
  assertEquals(assignmentState({ ...open, done: 3, complete: true }, a.due_at, new Date("2026-11-05T00:00:00Z")), "done");
  assert(isAssignmentVisible(a, new Date("2026-11-08T00:00:00Z")));
  assertEquals(isAssignmentVisible(a, new Date("2026-11-10T00:00:00Z")), false);
});

// --- Next step integration ---------------------------------------------------------------------

const item = (skill: TodaySkill, n: number, level: CatalogItem["level"] = "B1"): CatalogItem =>
  ({ id: ID(n), skill, slug: `${skill}-${n}`, title: `${skill} ${n}`, level, minutes: 10, difficulty: 0.5 });
const ITEMS: CatalogItem[] = TODAY_SKILLS.flatMap((skill, index) => [item(skill, 300 + index * 10), item(skill, 301 + index * 10, "A2")]);

const nextBase = {
  items: ITEMS,
  attempts: [],
  dueReviews: 3,
  fixes: [],
  ratings: {},
  targetLevel: "B2" as const,
  levelFor: () => "B1" as const,
  planTasks: [],
  access: { owned: [...TODAY_SKILLS], freeLeft: 0, freeItemIds: [] },
};

Deno.test("assignment steps: next unfinished lesson, a fitting activity, or the practice page", () => {
  const now = new Date("2026-10-30T10:00:00Z");
  const lessons = assignment({ id: ID(901), kind: "lessons", skill: null, level: null, content_item_ids: [ID(300), ID(320)], required_count: 2 });
  const count = assignment({ id: ID(902), skill: "listening", level: "A2" });
  const mock = assignment({ id: ID(903), kind: "speaking_mock", skill: "speaking", level: null });
  const finished = assignment({ id: ID(904), kind: "roleplay", skill: "speaking", scenario_id: "cafe-order" });
  const classAttempts = [attempt({ content_item_id: ID(300), skill: "reading", content_type: "reading.article" })];
  const steps = assignmentNextSteps({
    assignments: [
      { assignment: lessons, className: "7A", progress: assignmentProgress(lessons, classAttempts) },
      { assignment: count, className: "7A", progress: assignmentProgress(count, classAttempts) },
      { assignment: mock, className: "7A", progress: assignmentProgress(mock, classAttempts) },
      { assignment: finished, className: "7A", progress: { done: 1, required: 1, complete: true, completed_at: "x" } },
    ],
    items: ITEMS,
    attempts: [],
    classAttempts,
    levelFor: () => "B1",
    now,
  });
  assertEquals(steps.map((step) => [step.kind, step.content_item_id ?? step.href]), [
    ["activity", ID(320)],
    ["activity", ID(311)],
    ["practice", "/speaking-mock"],
  ]);
  assertEquals(steps[0]!.assignment, { id: ID(901), class_name: "7A", due_at: lessons.due_at, done: 1, required: 2 });
  assert(steps.every((step) => step.reason === "class_assignment"));
});

Deno.test("/next: an assignment due soon goes before reviews; a later one right after", () => {
  const now = new Date("2026-11-01T10:00:00Z");
  const step = (id: number, dueAt: string) => ({
    kind: "activity" as const, skill: "listening" as const, content_item_id: ID(id), slug: `listening-${id}`, title: "L", level: "B1" as const,
    minutes: 10, reason: "class_assignment" as const, detail: null, uses_free: false,
    assignment: { id: ID(id + 1000), class_name: "7A", due_at: dueAt, done: 0, required: 1 },
  });
  const soon = pickNextStep({ ...nextBase, now, assignments: [step(310, "2026-11-05T18:59:59.999Z"), step(311, "2026-11-02T18:59:59.999Z")] });
  assertEquals([soon.step?.reason, soon.step?.content_item_id], ["class_assignment", ID(311)]);
  const later = pickNextStep({ ...nextBase, now, assignments: [step(310, "2026-11-09T18:59:59.999Z")] });
  assertEquals(later.step?.reason, "review_due");
  const noReviews = pickNextStep({ ...nextBase, dueReviews: 0, now, assignments: [step(310, "2026-11-09T18:59:59.999Z")] });
  assertEquals(noReviews.step?.reason, "class_assignment");
});

Deno.test("/next: a class never unlocks a skill; the locked assignment is offered as optional", () => {
  const now = new Date("2026-11-01T10:00:00Z");
  const locked = {
    kind: "activity" as const, skill: "writing" as const, content_item_id: ID(330), slug: "writing-330", title: "W", level: "B1" as const,
    minutes: 10, reason: "class_assignment" as const, detail: null, uses_free: false,
    assignment: { id: ID(1330), class_name: "7A", due_at: "2026-11-01T18:59:59.999Z", done: 0, required: 1 },
  };
  const result = pickNextStep({ ...nextBase, now, access: { owned: ["reading"], freeLeft: 0, freeItemIds: [] }, assignments: [locked] });
  assertEquals([result.step?.reason, result.locked?.reason], ["review_due", "class_assignment"]);
  // With the free activity left it is offered, using it.
  const free = pickNextStep({ ...nextBase, dueReviews: 0, now, access: { owned: [], freeLeft: 1, freeItemIds: [] }, assignments: [locked] });
  assertEquals([free.step?.reason, free.step?.uses_free], ["class_assignment", true]);
  // Practice steps (role-play, mock) open their own page, which applies its own allowance.
  const practice = pickNextStep({ ...nextBase, dueReviews: 0, now, access: { owned: [], freeLeft: 0, freeItemIds: [] }, assignments: [{ ...locked, kind: "practice", skill: "speaking", content_item_id: null, href: "/speaking-mock" }] });
  assertEquals([practice.step?.kind, practice.step?.href], ["practice", "/speaking-mock"]);
});

// --- Dashboard facts ---------------------------------------------------------------------------

Deno.test("activity: streak in learner days, minutes and activities this week, last active", () => {
  const now = new Date("2026-10-29T12:00:00Z"); // Thursday
  const attempts = [
    attempt({ submitted_at: "2026-10-29T05:00:00Z", seconds: 900 }),
    attempt({ submitted_at: "2026-10-28T20:00:00Z", seconds: null, minutes: 8 }), // 01:00 on the 29th in Tashkent
    attempt({ submitted_at: "2026-10-27T10:00:00Z", seconds: 99_999 }), // capped at an hour
    attempt({ submitted_at: "2026-10-26T10:00:00Z", seconds: 60 }),
    attempt({ submitted_at: "2026-10-24T10:00:00Z", seconds: 600 }), // last week
  ];
  const facts = studentActivity(attempts, now);
  assertEquals(facts, { streak: 1, minutes_week: 15 + 8 + 60 + 1, activities_week: 4, last_active: "2026-10-29T05:00:00Z" });
  assertEquals(learnerStreak(["2026-10-27T10:00:00Z", "2026-10-28T10:00:00Z"], "2026-10-29"), 2);
  assertEquals(learnerStreak([], "2026-10-29"), 0);
});

Deno.test("levels per skill: rating, then placement, then overall", () => {
  const levels = skillLevelsFrom({
    ratings: { skills: { reading: { level: "B2" } } },
    placement: { per_skill: { listening: "A2", writing: { level: "B1" } } },
    overall: "A2",
  });
  assertEquals([levels.reading, levels.listening, levels.writing, levels.grammar], ["B2", "A2", "B1", "A2"]);
  assertEquals(skillLevelsFrom({ ratings: null, placement: null, overall: null }).reading, null);
});

Deno.test("class weak skills and mistakes are aggregated, never per sentence", () => {
  const base = Object.fromEntries(TODAY_SKILLS.map((skill) => [skill, "B1"])) as Record<TodaySkill, "B1" | "A1" | "A2" | null>;
  const weak = classWeakSkills([{ ...base, writing: "A1" }, { ...base, writing: "A2", speaking: "A2" }, { ...base, immersion: null }]);
  assertEquals(weak.map((entry) => entry.skill), ["writing", "speaking", "reading"]);
  assertEquals(weak[0]!.average_level, "A2");
  const mistakes = topClassMistakes([
    { user_id: ID(1), topic: "articles", count: 4 },
    { user_id: ID(2), topic: "articles", count: 1 },
    { user_id: ID(1), topic: "past-simple", count: 9 },
    { user_id: ID(3), topic: null, count: 50 },
  ]);
  assertEquals(mistakes, [{ topic: "articles", students: 2, count: 5 }, { topic: "past-simple", students: 1, count: 9 }]);
});

Deno.test("weekly digest: the last seven days, who practised, assignments and a Telegram text", () => {
  const now = new Date("2026-11-02T04:30:00Z"); // Monday 09:30 in Tashkent
  assert(isDigestTime(now));
  assert(!isDigestTime(new Date("2026-11-02T05:00:00Z")));
  assert(!isDigestTime(new Date("2026-11-03T04:00:00Z")));
  const levels = Object.fromEntries(TODAY_SKILLS.map((skill) => [skill, "B1"])) as Record<TodaySkill, "B1">;
  const digest = buildDigest({
    now,
    students: [{ user_id: ID(1), name: "Aziza K.", levels }, { user_id: ID(2), name: "Timur", levels }],
    attempts: [attempt({ user_id: ID(1), submitted_at: "2026-10-30T10:00:00Z" }), attempt({ user_id: ID(1), submitted_at: "2026-10-20T10:00:00Z" })],
    assignments: [{ assignment: assignment(), label: "3 × Listening (B1)", doneBy: 1 }],
    mistakes: [],
  });
  assertEquals([digest.week_start, digest.week_end, digest.students, digest.active_students, digest.activities], ["2026-10-27", "2026-11-02", 2, 1, 1]);
  assertEquals(digest.inactive, { names: ["Timur"], total: 1 });
  assertEquals(digest.assignments[0]?.done, 1);
  for (const locale of ["en", "ru", "uz"] as const) {
    const text = digestText(locale, "7A", digest);
    assert(text.includes("7A") && text.includes("Aziza K.") && text.includes("Timur"), locale);
    assert(!/[og]'/i.test(text), `${locale} apostrophe`);
  }
});

Deno.test("labels and reminder texts in three languages", () => {
  assertEquals(assignmentLabel(assignment(), "en"), "3 × Listening (B1)");
  assertEquals(assignmentLabel(assignment({ title: "Unit 4 homework" }), "ru"), "Unit 4 homework");
  assertEquals(assignmentLabel(assignment({ kind: "lessons", content_item_ids: [ID(1), ID(2)] }), "en", { firstLessonTitle: "Cafe talk" }), "Cafe talk +1");
  assertEquals(assignmentLabel(assignment({ kind: "roleplay" }), "uz", { scenarioTitle: "Kafeda" }), "Kafeda");
  assertNotEquals(assignmentLabel(assignment({ kind: "speaking_mock" }), "ru"), assignmentLabel(assignment({ kind: "speaking_mock" }), "en"));
  for (const locale of ["en", "ru", "uz"] as const) {
    const text = assignmentReminderText(locale, { className: "7A", label: "3 × Listening", done: 1, required: 3 });
    assert(text.includes("7A") && text.includes("1/3"), locale);
  }
  assertEquals(tomorrowOf(new Date("2026-11-01T20:00:00Z")), "2026-11-03"); // already the 2nd in Tashkent
});

// --- Settings ------------------------------------------------------------------------------------

Deno.test("classes switch and caps follow the settings pattern (default on, sane caps)", () => {
  const defaults = defaultEnglishSettings({});
  assertEquals(isServicePaused(defaults, "classes"), false);
  assertEquals(defaults.classes, { max_classes_per_teacher: 10, max_students_per_class: 60 });
  const parsed = parseEnglishSettingsRows([
    { key: "services", value: { classes: false } },
    { key: "classes", value: { max_classes_per_teacher: 3, max_students_per_class: 9999 } },
  ], defaults);
  assertEquals(isServicePaused(parsed, "classes"), true);
  assertEquals(parsed.classes, { max_classes_per_teacher: 3, max_students_per_class: 60 });
  const patch = validateEnglishSettingsPatch(defaults, { classes: { max_students_per_class: 120 } });
  assert(patch.ok);
  assertEquals(patch.rows, [{ key: "classes", value: { max_classes_per_teacher: 10, max_students_per_class: 120 } }]);
  assertEquals(validateEnglishSettingsPatch(defaults, { classes: { max_students_per_class: 1 } }).ok, false);
  assertEquals(validateEnglishSettingsPatch(defaults, { classes: { colour: 1 } }).ok, false);
});
