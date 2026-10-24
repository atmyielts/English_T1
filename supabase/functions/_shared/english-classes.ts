// English classes for teachers and learning centres: the pure rules.
//
// A class is personal and lightweight (any signed-in user can open one and
// becomes its teacher); it is not the Academy LMS. Learners join with a short
// code after an explicit consent screen. Teachers set assignments; completion
// is read from real learning_attempts, never ticked by hand. A class never
// unlocks content: every learner keeps their own plan or free tier.
//
// The hub (hub/classes.ts) loads rows and stores results; everything that
// decides something lives here so it can be tested.

import type { NextStep } from "./english-next.ts";
import { type AttemptRow, type CatalogItem, CEFR_ORDER, type Cefr, isCefr, pickItem, TODAY_SKILLS, type TodaySkill } from "./english-today.ts";

export type ClassLocale = "en" | "ru" | "uz";
export type ClassRole = "teacher" | "member" | "none";
export type AssignmentKind = "lessons" | "skill_count" | "roleplay" | "speaking_mock";
export const ASSIGNMENT_KINDS: readonly AssignmentKind[] = ["lessons", "skill_count", "roleplay", "speaking_mock"];

const DAY_MS = 86_400_000;
const LEARNER_OFFSET_MS = 5 * 3_600_000;

export const CLASS_LIMITS = {
  nameMax: 80,
  schoolMax: 120,
  titleMax: 120,
  noteMax: 280,
  lessonsMax: 10,
  countMax: 20,
  /** Open (not cancelled) assignments per class. */
  openAssignmentsMax: 60,
  /** Due date at most this many days ahead. */
  dueDaysMax: 90,
  /** Overdue assignments stay on the learner's list (and in /next) this long. */
  overdueVisibleDays: 7,
} as const;

// --- Join codes ------------------------------------------------------------------

/** No look-alikes: no 0/O, no 1/I/L. 31 characters, 6 long: about 887 million codes. */
export const JOIN_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const JOIN_CODE_LENGTH = 6;
const JOIN_CODE_PATTERN = /^[A-HJKMNP-Z2-9]{6}$/;

/** A fresh random code (rejection sampling, so every character is equally likely). */
export const generateJoinCode = (
  randomBytes: (count: number) => Uint8Array = (count) => crypto.getRandomValues(new Uint8Array(count)),
): string => {
  const size = JOIN_CODE_ALPHABET.length;
  const limit = Math.floor(256 / size) * size;
  let code = "";
  while (code.length < JOIN_CODE_LENGTH) {
    for (const byte of randomBytes(16)) {
      if (byte >= limit) continue;
      code += JOIN_CODE_ALPHABET[byte % size];
      if (code.length === JOIN_CODE_LENGTH) break;
    }
  }
  return code;
};

/**
 * Reads a code as a learner might type or paste it: any case, with spaces or
 * dashes, or a whole join link. Null when it cannot be a code.
 */
export const normalizeJoinCode = (raw: unknown): string | null => {
  let text = typeof raw === "string" ? raw.trim() : "";
  if (!text || text.length > 300) return null;
  const fromLink = text.match(/[?&]join=([^&#\s]+)/i);
  if (fromLink) text = decodeURIComponent(fromLink[1]!);
  const code = text.toUpperCase().replace(/[\s\-_.]/g, "");
  return JOIN_CODE_PATTERN.test(code) ? code : null;
};

export const joinLink = (appUrl: string, code: string): string =>
  `${appUrl.replace(/\/$/, "")}/classes?join=${encodeURIComponent(code)}`;

// --- Classes ------------------------------------------------------------------------

const cleanText = (value: unknown, max: number): string =>
  typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";

export type ClassFields = { name?: string; level?: Cefr | null; school_name?: string | null };

/**
 * Validates class fields. `partial` (editing) accepts any subset; creating
 * needs a name. Level and school are optional.
 */
export const cleanClassFields = (
  body: Record<string, unknown>,
  partial = false,
): { ok: true; value: ClassFields } | { ok: false; code: string; error: string } => {
  const value: ClassFields = {};
  if (!partial || "name" in body) {
    const name = cleanText(body.name, CLASS_LIMITS.nameMax);
    if (!name) return { ok: false, code: "class_name_required", error: "Give the class a name." };
    value.name = name;
  }
  if ("level" in body) {
    if (body.level === null || body.level === "") value.level = null;
    else if (isCefr(body.level)) value.level = body.level;
    else return { ok: false, code: "class_level_invalid", error: "Choose a level from A1 to C2." };
  }
  if ("school_name" in body) value.school_name = cleanText(body.school_name, CLASS_LIMITS.schoolMax) || null;
  return { ok: true, value };
};

export const decideCreateClass = (input: { activeOwned: number; cap: number }) =>
  input.activeOwned >= input.cap
    ? { ok: false as const, code: "class_limit_reached", error: `You can run up to ${input.cap} classes at a time. Archive one to open another.` }
    : { ok: true as const };

/** The caller's role in a class. Only an active membership counts. */
export const classRole = (
  cls: { teacher_id?: unknown },
  member: { status?: unknown } | null | undefined,
  userId: string,
): ClassRole => {
  if (String(cls.teacher_id) === userId) return "teacher";
  return member?.status === "active" ? "member" : "none";
};

export type JoinDecision =
  | { ok: true }
  | { ok: false; status: number; code: string; error: string };

/** Checks before the (serialised) join: archived class, own class, consent. */
export const decideJoin = (input: {
  cls: { teacher_id?: unknown; status?: unknown } | null;
  userId: string;
  consent: boolean;
}): JoinDecision => {
  if (!input.cls || input.cls.status !== "active") {
    return { ok: false, status: 404, code: "class_not_found", error: "No class with this code. Check the code with your teacher." };
  }
  if (String(input.cls.teacher_id) === input.userId) {
    return { ok: false, status: 409, code: "class_own", error: "You teach this class, so you are already in it." };
  }
  if (!input.consent) {
    return { ok: false, status: 422, code: "class_consent_required", error: "Please confirm that your teacher may see your progress in this class." };
  }
  return { ok: true };
};

/** Maps the database join result to a response. */
export const joinOutcome = (result: unknown): { status: number; code: string; error?: string } => {
  switch (result) {
    case "joined":
      return { status: 200, code: "joined" };
    case "already_member":
      return { status: 200, code: "already_member" };
    case "removed":
      return { status: 403, code: "class_removed", error: "Your teacher removed you from this class. Ask them for a new code." };
    case "class_full":
      return { status: 409, code: "class_full", error: "This class is full. Ask your teacher." };
    default:
      return { status: 404, code: "class_not_found", error: "No class with this code. Check the code with your teacher." };
  }
};

// --- Assignments ----------------------------------------------------------------------

export type ClassAssignment = {
  id: string;
  class_id: string;
  kind: AssignmentKind;
  title: string | null;
  skill: TodaySkill | null;
  level: Cefr | null;
  required_count: number;
  content_item_ids: string[];
  scenario_id: string | null;
  note: string | null;
  due_at: string;
  created_at: string;
};

const isSkill = (value: unknown): value is TodaySkill => (TODAY_SKILLS as readonly string[]).includes(String(value));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Learner-local (UTC+5) calendar date of a moment. */
export const learnerDateOf = (at: string | number | Date): string =>
  new Date(new Date(at).getTime() + LEARNER_OFFSET_MS).toISOString().slice(0, 10);

/** End of a learner-local day (23:59:59.999 at UTC+5), as an ISO timestamp. */
export const dueAtFor = (date: string): string =>
  new Date(Date.parse(`${date}T00:00:00Z`) + DAY_MS - 1 - LEARNER_OFFSET_MS).toISOString();

export const readAssignment = (row: Record<string, unknown>): ClassAssignment | null => {
  const kind = String(row.kind ?? "") as AssignmentKind;
  if (!ASSIGNMENT_KINDS.includes(kind)) return null;
  return {
    id: String(row.id),
    class_id: String(row.class_id),
    kind,
    title: typeof row.title === "string" && row.title.trim() ? row.title : null,
    skill: isSkill(row.skill) ? row.skill : null,
    level: isCefr(row.level) ? row.level : null,
    required_count: Math.max(1, Math.min(CLASS_LIMITS.countMax, Number(row.required_count ?? 1) || 1)),
    content_item_ids: Array.isArray(row.content_item_ids) ? (row.content_item_ids as unknown[]).map(String).filter((id) => UUID.test(id)) : [],
    scenario_id: typeof row.scenario_id === "string" && row.scenario_id ? row.scenario_id : null,
    note: typeof row.note === "string" && row.note.trim() ? row.note : null,
    due_at: String(row.due_at),
    created_at: String(row.created_at),
  };
};

export type AssignmentInput = {
  kind: AssignmentKind;
  title: string | null;
  skill: TodaySkill | null;
  level: Cefr | null;
  required_count: number;
  content_item_ids: string[];
  scenario_id: string | null;
  note: string | null;
  due_date: string;
  due_at: string;
};

/**
 * Validates a new assignment. `today` is the learner-local date; the due date
 * may be today up to CLASS_LIMITS.dueDaysMax ahead. Item ids are checked
 * against the content registry by the caller.
 */
export const parseAssignmentInput = (
  body: Record<string, unknown>,
  context: { today: string; isScenario: (id: string) => boolean },
): { ok: true; value: AssignmentInput } | { ok: false; code: string; error: string } => {
  const fail = (code: string, error: string) => ({ ok: false as const, code, error });
  const kind = String(body.kind ?? "") as AssignmentKind;
  if (!ASSIGNMENT_KINDS.includes(kind)) return fail("assignment_kind_invalid", "Choose what to assign.");

  const dueDate = typeof body.due_date === "string" ? body.due_date.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || !Number.isFinite(Date.parse(`${dueDate}T00:00:00Z`))) {
    return fail("assignment_due_invalid", "Choose a due date.");
  }
  const daysAhead = Math.round((Date.parse(`${dueDate}T00:00:00Z`) - Date.parse(`${context.today}T00:00:00Z`)) / DAY_MS);
  if (daysAhead < 0) return fail("assignment_due_past", "The due date is in the past.");
  if (daysAhead > CLASS_LIMITS.dueDaysMax) return fail("assignment_due_far", `Choose a due date within ${CLASS_LIMITS.dueDaysMax} days.`);

  const value: AssignmentInput = {
    kind,
    title: cleanText(body.title, CLASS_LIMITS.titleMax) || null,
    skill: null,
    level: isCefr(body.level) ? body.level : null,
    required_count: 1,
    content_item_ids: [],
    scenario_id: null,
    note: cleanText(body.note, CLASS_LIMITS.noteMax) || null,
    due_date: dueDate,
    due_at: dueAtFor(dueDate),
  };

  if (kind === "lessons") {
    const ids = Array.isArray(body.content_item_ids) ? [...new Set((body.content_item_ids as unknown[]).map(String))] : [];
    if (!ids.length) return fail("assignment_lessons_required", "Add at least one lesson.");
    if (ids.length > CLASS_LIMITS.lessonsMax) return fail("assignment_lessons_too_many", `Assign up to ${CLASS_LIMITS.lessonsMax} lessons at once.`);
    if (!ids.every((id) => UUID.test(id))) return fail("assignment_lessons_invalid", "One of the lessons was not found.");
    value.content_item_ids = ids;
    value.required_count = ids.length;
    value.level = null;
  } else if (kind === "skill_count") {
    if (!isSkill(body.skill)) return fail("assignment_skill_invalid", "Choose a skill.");
    const count = Number(body.count ?? body.required_count);
    if (!Number.isInteger(count) || count < 1 || count > CLASS_LIMITS.countMax) {
      return fail("assignment_count_invalid", `Choose from 1 to ${CLASS_LIMITS.countMax} activities.`);
    }
    value.skill = body.skill;
    value.required_count = count;
  } else if (kind === "roleplay") {
    const scenario = typeof body.scenario_id === "string" && body.scenario_id ? body.scenario_id : null;
    if (scenario && !context.isScenario(scenario)) return fail("assignment_scenario_invalid", "That role-play was not found.");
    value.scenario_id = scenario;
    value.skill = "speaking";
    value.level = null;
  } else {
    value.skill = "speaking";
    value.level = null;
  }
  return { ok: true, value };
};

/** One finished activity, with what the registry knows about it. */
export type ClassAttempt = {
  user_id: string;
  content_item_id: string;
  skill: TodaySkill;
  content_type: string;
  source_ref: string;
  level: Cefr | null;
  score: number | null;
  submitted_at: string;
  /** Time on task reported by the activity, if any. */
  seconds: number | null;
  /** The item's estimated minutes, used when no time was reported. */
  minutes: number | null;
};

/** Content types that count as "an activity" for skill_count assignments. */
export const PRIMARY_CONTENT_TYPES = [
  "reading.article",
  "listening.item",
  "writing.prompt",
  "speaking.prompt",
  "grammar.unit",
  "immersion.mission",
  "vocabulary.deck",
] as const;

const countsFor = (assignment: ClassAssignment, attempt: ClassAttempt): boolean => {
  if (Date.parse(attempt.submitted_at) < Date.parse(assignment.created_at)) return false;
  switch (assignment.kind) {
    case "lessons":
      return assignment.content_item_ids.includes(attempt.content_item_id);
    case "skill_count":
      return attempt.skill === assignment.skill
        && (PRIMARY_CONTENT_TYPES as readonly string[]).includes(attempt.content_type)
        && (!assignment.level || attempt.level === assignment.level);
    case "roleplay":
      return attempt.content_type === "speaking.roleplay"
        && (!assignment.scenario_id || attempt.source_ref === `roleplay-${assignment.scenario_id}`);
    case "speaking_mock":
      return attempt.content_type === "speaking.mock";
  }
};

export type AssignmentProgress = { done: number; required: number; complete: boolean; completed_at: string | null };

/**
 * How far one learner is with an assignment, from their real attempts since
 * it was set. Lessons and "N activities" count distinct activities, so redoing
 * one does not count twice; a role-play or the mock counts once finished.
 */
export const assignmentProgress = (assignment: ClassAssignment, attempts: ClassAttempt[]): AssignmentProgress => {
  const required = assignment.kind === "lessons" ? Math.max(1, assignment.content_item_ids.length)
    : assignment.kind === "skill_count" ? assignment.required_count
    : 1;
  const relevant = attempts
    .filter((attempt) => countsFor(assignment, attempt))
    .sort((a, b) => Date.parse(a.submitted_at) - Date.parse(b.submitted_at));
  const seen = new Set<string>();
  let completedAt: string | null = null;
  for (const attempt of relevant) {
    const key = assignment.kind === "roleplay" || assignment.kind === "speaking_mock" ? "once" : attempt.content_item_id;
    if (seen.has(key)) continue;
    seen.add(key);
    if (seen.size >= required && !completedAt) completedAt = attempt.submitted_at;
  }
  const done = Math.min(required, seen.size);
  return { done, required, complete: done >= required, completed_at: completedAt };
};

export type AssignmentState = "done" | "pending" | "overdue";

export const assignmentState = (progress: AssignmentProgress, dueAt: string, now: Date = new Date()): AssignmentState =>
  progress.complete ? "done" : Date.parse(dueAt) < now.getTime() ? "overdue" : "pending";

/** Whether an unfinished assignment is still shown to the learner (and offered in /next). */
export const isAssignmentVisible = (assignment: Pick<ClassAssignment, "due_at">, now: Date = new Date()): boolean =>
  Date.parse(assignment.due_at) + CLASS_LIMITS.overdueVisibleDays * DAY_MS >= now.getTime();

/**
 * Next steps for the learner's open assignments (english-next.ts puts them
 * first while due soon). Lessons point at the first unfinished lesson; "N
 * activities" picks a fitting activity in that skill and level; role-plays and
 * the mock open their page.
 */
export const assignmentNextSteps = (input: {
  assignments: Array<{ assignment: ClassAssignment; className: string; progress: AssignmentProgress }>;
  items: CatalogItem[];
  attempts: AttemptRow[];
  /** The learner's attempts in ClassAttempt form, to skip activities already counted. */
  classAttempts: ClassAttempt[];
  levelFor: (skill: TodaySkill) => Cefr | null;
  now?: Date;
  labelFor?: (assignment: ClassAssignment) => string;
}): NextStep[] => {
  const now = input.now ?? new Date();
  const byId = new Map(input.items.map((item) => [item.id, item]));
  const steps: NextStep[] = [];
  for (const { assignment, className, progress } of input.assignments) {
    if (progress.complete || !isAssignmentVisible(assignment, now)) continue;
    const meta = { id: assignment.id, class_name: className, due_at: assignment.due_at, done: progress.done, required: progress.required };
    const counted = new Set(input.classAttempts
      .filter((attempt) => Date.parse(attempt.submitted_at) >= Date.parse(assignment.created_at))
      .map((attempt) => attempt.content_item_id));
    const base = {
      reason: "class_assignment" as const,
      detail: assignment.note,
      uses_free: false,
      assignment: meta,
    };
    if (assignment.kind === "lessons") {
      const item = assignment.content_item_ids.map((id) => byId.get(id)).find((entry) => entry && !counted.has(entry.id));
      if (!item) continue;
      steps.push({
        ...base,
        kind: "activity",
        skill: item.skill,
        content_item_id: item.id,
        slug: item.slug,
        title: item.title,
        level: item.level,
        minutes: Math.max(3, Math.min(30, Math.round(item.minutes || 10))),
      });
    } else if (assignment.kind === "skill_count" && assignment.skill) {
      const skill = assignment.skill;
      const pool = input.items.filter((item) => item.skill === skill && !counted.has(item.id) && (!assignment.level || item.level === assignment.level));
      const picked = pickItem(pool, input.attempts.filter((attempt) => attempt.skill === skill), assignment.level ?? input.levelFor(skill))?.item;
      if (!picked) continue;
      steps.push({
        ...base,
        kind: "activity",
        skill,
        content_item_id: picked.id,
        slug: picked.slug,
        title: picked.title,
        level: picked.level,
        minutes: Math.max(3, Math.min(30, Math.round(picked.minutes || 10))),
      });
    } else if (assignment.kind === "roleplay" || assignment.kind === "speaking_mock") {
      steps.push({
        ...base,
        kind: "practice",
        skill: "speaking",
        content_item_id: null,
        slug: null,
        title: input.labelFor?.(assignment) ?? assignment.title ?? (assignment.kind === "roleplay" ? "Role-play" : "Speaking mock"),
        level: null,
        minutes: assignment.kind === "roleplay" ? 10 : 15,
        href: assignment.kind === "roleplay"
          ? (assignment.scenario_id ? `/roleplay/${assignment.scenario_id}` : "/roleplay")
          : "/speaking-mock",
      });
    }
  }
  return steps;
};

// --- Teacher dashboard -----------------------------------------------------------------

/** Monday 00:00 learner time of the week containing `now`, as an ISO timestamp, plus its date. */
export const learnerWeekStart = (now: Date = new Date()): { date: string; at: string } => {
  const local = new Date(now.getTime() + LEARNER_OFFSET_MS);
  const sinceMonday = (local.getUTCDay() + 6) % 7;
  const mondayMs = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - sinceMonday * DAY_MS;
  return { date: new Date(mondayMs).toISOString().slice(0, 10), at: new Date(mondayMs - LEARNER_OFFSET_MS).toISOString() };
};

/** Minutes an attempt took: reported time (capped at an hour), else the item's estimate. */
export const attemptMinutes = (attempt: Pick<ClassAttempt, "seconds" | "minutes">): number => {
  if (typeof attempt.seconds === "number" && attempt.seconds > 0) return Math.min(60, attempt.seconds / 60);
  return Math.max(0, Math.min(60, attempt.minutes ?? 0));
};

/** Days in a row with at least one activity, in learner time, ending today (or yesterday). */
export const learnerStreak = (submittedAt: string[], today: string): number => {
  const days = new Set(submittedAt.map(learnerDateOf));
  let cursor = Date.parse(`${today}T00:00:00Z`);
  if (!days.has(today)) cursor -= DAY_MS;
  let streak = 0;
  while (days.has(new Date(cursor).toISOString().slice(0, 10))) {
    streak += 1;
    cursor -= DAY_MS;
  }
  return streak;
};

export type StudentActivity = {
  streak: number;
  minutes_week: number;
  activities_week: number;
  last_active: string | null;
};

/** Activity facts for one learner from their attempts (any order). */
export const studentActivity = (attempts: ClassAttempt[], now: Date = new Date(), since?: string): StudentActivity => {
  const weekStart = since ?? learnerWeekStart(now).at;
  const week = attempts.filter((attempt) => attempt.submitted_at >= weekStart && Date.parse(attempt.submitted_at) <= now.getTime());
  const last = attempts.reduce<string | null>((best, attempt) => (!best || attempt.submitted_at > best ? attempt.submitted_at : best), null);
  return {
    streak: learnerStreak(attempts.map((attempt) => attempt.submitted_at), learnerDateOf(now)),
    minutes_week: Math.round(week.reduce((sum, attempt) => sum + attemptMinutes(attempt), 0)),
    activities_week: week.length,
    last_active: last,
  };
};

/** A learner's level per skill: cached rating, else placement level, else overall level. */
export const skillLevelsFrom = (input: {
  ratings: unknown;
  placement: unknown;
  overall: unknown;
}): Record<TodaySkill, Cefr | null> => {
  const asRecord = (value: unknown): Record<string, unknown> =>
    value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const rated = asRecord(asRecord(input.ratings).skills);
  const placed = asRecord(asRecord(input.placement).per_skill);
  const overall = isCefr(input.overall) ? input.overall : null;
  return Object.fromEntries(TODAY_SKILLS.map((skill) => {
    const fromRating = asRecord(rated[skill]).level;
    const entry = placed[skill];
    const fromPlacement = typeof entry === "string" ? entry : asRecord(entry).level;
    const level = isCefr(fromRating) ? fromRating : isCefr(fromPlacement) ? fromPlacement : overall;
    return [skill, level];
  })) as Record<TodaySkill, Cefr | null>;
};

/** Skills the class is weakest in: lowest average level first (skills with no levels are left out). */
export const classWeakSkills = (levels: Array<Record<TodaySkill, Cefr | null>>, limit = 3) =>
  TODAY_SKILLS
    .map((skill) => {
      const values = levels.map((entry) => entry[skill]).filter((level): level is Cefr => level !== null).map((level) => CEFR_ORDER.indexOf(level));
      if (!values.length) return null;
      const average = values.reduce((sum, value) => sum + value, 0) / values.length;
      return { skill, average_level: CEFR_ORDER[Math.round(average)] ?? null, average: Math.round(average * 100) / 100, students: values.length };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((a, b) => a.average - b.average || b.students - a.students)
    .slice(0, limit);

/**
 * The class's most common grammar mistakes, by topic only (never the learners'
 * sentences): how many learners make it and how often.
 */
export const topClassMistakes = (
  rows: Array<{ user_id: string; topic: string | null; count: number }>,
  limit = 5,
) => {
  const byTopic = new Map<string, { topic: string; students: Set<string>; count: number }>();
  for (const row of rows) {
    if (!row.topic) continue;
    const entry = byTopic.get(row.topic) ?? { topic: row.topic, students: new Set<string>(), count: 0 };
    entry.students.add(row.user_id);
    entry.count += Math.max(1, Math.round(row.count) || 1);
    byTopic.set(row.topic, entry);
  }
  return [...byTopic.values()]
    .map((entry) => ({ topic: entry.topic, students: entry.students.size, count: entry.count }))
    .sort((a, b) => b.students - a.students || b.count - a.count || a.topic.localeCompare(b.topic))
    .slice(0, limit);
};

/** Free tier, some skills, or every skill (the whole suite or the bundle). */
export type PlanTier = "free" | "partial" | "full";

export const planTier = (input: { admin: boolean; ownedSkills: number; totalSkills: number }): PlanTier =>
  input.admin || (input.totalSkills > 0 && input.ownedSkills >= input.totalSkills) ? "full" : input.ownedSkills > 0 ? "partial" : "free";

// --- Weekly digest -----------------------------------------------------------------------

export type DigestStudent = { name: string; activities: number; minutes: number };

export type ClassDigest = {
  week_start: string;
  week_end: string;
  students: number;
  active_students: number;
  activities: number;
  minutes: number;
  /** Most active learners this week (up to 3). */
  top: DigestStudent[];
  /** Learners with no activity this week (names, up to 10, plus how many in all). */
  inactive: { names: string[]; total: number };
  assignments: Array<{ id: string; label: string; due_at: string; done: number; total: number }>;
  weak_skills: ReturnType<typeof classWeakSkills>;
  mistakes: ReturnType<typeof topClassMistakes>;
};

/** The last seven learner days (ending today): who practised, how much, and what is due. */
export const buildDigest = (input: {
  now?: Date;
  students: Array<{ user_id: string; name: string; levels: Record<TodaySkill, Cefr | null> }>;
  attempts: ClassAttempt[];
  assignments: Array<{ assignment: ClassAssignment; label: string; doneBy: number }>;
  mistakes: Array<{ user_id: string; topic: string | null; count: number }>;
}): ClassDigest => {
  const now = input.now ?? new Date();
  const today = learnerDateOf(now);
  const weekStartDate = new Date(Date.parse(`${today}T00:00:00Z`) - 6 * DAY_MS).toISOString().slice(0, 10);
  const since = new Date(Date.parse(`${weekStartDate}T00:00:00Z`) - LEARNER_OFFSET_MS).toISOString();
  const members = new Set(input.students.map((student) => student.user_id));
  const week = input.attempts.filter((attempt) => members.has(attempt.user_id) && attempt.submitted_at >= since);
  const per = input.students.map((student) => {
    const mine = week.filter((attempt) => attempt.user_id === student.user_id);
    return { name: student.name, activities: mine.length, minutes: Math.round(mine.reduce((sum, attempt) => sum + attemptMinutes(attempt), 0)) };
  });
  const inactive = per.filter((entry) => entry.activities === 0).map((entry) => entry.name);
  const weekAssignments = input.assignments
    .filter(({ assignment }) => assignment.due_at >= since || Date.parse(assignment.due_at) >= now.getTime())
    .sort((a, b) => Date.parse(a.assignment.due_at) - Date.parse(b.assignment.due_at))
    .slice(0, 10);
  return {
    week_start: weekStartDate,
    week_end: today,
    students: input.students.length,
    active_students: per.filter((entry) => entry.activities > 0).length,
    activities: week.length,
    minutes: per.reduce((sum, entry) => sum + entry.minutes, 0),
    top: per.filter((entry) => entry.activities > 0).sort((a, b) => b.activities - a.activities || b.minutes - a.minutes).slice(0, 3),
    inactive: { names: inactive.slice(0, 10), total: inactive.length },
    assignments: weekAssignments.map(({ assignment, label, doneBy }) => ({
      id: assignment.id,
      label,
      due_at: assignment.due_at,
      done: doneBy,
      total: input.students.length,
    })),
    weak_skills: classWeakSkills(input.students.map((student) => student.levels), 2),
    mistakes: topClassMistakes(input.mistakes, 3),
  };
};

// --- Telegram texts (plain text; send-telegram applies quiet hours and dedupe) ----------

const SKILL_NAMES: Record<ClassLocale, Record<TodaySkill, string>> = {
  en: { reading: "Reading", listening: "Listening", writing: "Writing", speaking: "Speaking", grammar: "Grammar", vocabulary: "Vocabulary", immersion: "Immersion" },
  ru: { reading: "Чтение", listening: "Аудирование", writing: "Письмо", speaking: "Говорение", grammar: "Грамматика", vocabulary: "Словарь", immersion: "Погружение" },
  uz: { reading: "Oʻqish", listening: "Tinglash", writing: "Yozish", speaking: "Gapirish", grammar: "Grammatika", vocabulary: "Lugʻat", immersion: "Muhit" },
};

export const asClassLocale = (value: unknown): ClassLocale => (value === "ru" || value === "uz" ? value : "en");

/** A short description of an assignment when the teacher gave no title. */
export const assignmentLabel = (
  assignment: Pick<ClassAssignment, "kind" | "title" | "skill" | "level" | "required_count" | "content_item_ids">,
  locale: ClassLocale,
  extra: { firstLessonTitle?: string | null; scenarioTitle?: string | null } = {},
): string => {
  if (assignment.title) return assignment.title;
  const level = assignment.level ? ` (${assignment.level})` : "";
  switch (assignment.kind) {
    case "lessons": {
      const more = assignment.content_item_ids.length - 1;
      const first = extra.firstLessonTitle ?? { en: "Lessons", ru: "Уроки", uz: "Darslar" }[locale];
      return more > 0 ? `${first} +${more}` : first;
    }
    case "skill_count": {
      const skill = assignment.skill ? SKILL_NAMES[locale][assignment.skill] : "";
      return `${assignment.required_count} × ${skill}${level}`;
    }
    case "roleplay":
      return extra.scenarioTitle ?? { en: "Role-play", ru: "Ролевая игра", uz: "Rolli oʻyin" }[locale];
    case "speaking_mock":
      return { en: "Speaking mock (IELTS style)", ru: "Пробный экзамен по говорению (как IELTS)", uz: "Gapirish boʻyicha sinov imtihoni (IELTS uslubida)" }[locale];
  }
};

export const assignmentReminderText = (locale: ClassLocale, facts: { className: string; label: string; done: number; required: number }): string => {
  const progress = facts.done > 0 ? ` (${facts.done}/${facts.required})` : "";
  switch (locale) {
    case "ru":
      return `Напоминание от класса «${facts.className}»: задание «${facts.label}»${progress} нужно сдать завтра. Откройте Schood English, чтобы закончить его.`;
    case "uz":
      return `«${facts.className}» sinfidan eslatma: «${facts.label}» topshirigʻi${progress} ertaga topshirilishi kerak. Uni tugatish uchun Schood English’ni oching.`;
    default:
      return `Reminder from your class "${facts.className}": "${facts.label}"${progress} is due tomorrow. Open Schood English to finish it.`;
  }
};

export const digestText = (locale: ClassLocale, className: string, digest: ClassDigest): string => {
  const lines: string[] = [];
  const skill = (key: TodaySkill) => SKILL_NAMES[locale][key];
  if (locale === "ru") {
    lines.push(`Неделя класса «${className}» (${digest.week_start} – ${digest.week_end})`);
    lines.push(`Занимались: ${digest.active_students} из ${digest.students}. Заданий выполнено: ${digest.activities}, минут: ${digest.minutes}.`);
    if (digest.top.length) lines.push(`Активнее всех: ${digest.top.map((entry) => entry.name).join(", ")}.`);
    if (digest.inactive.total) lines.push(`Не занимались: ${digest.inactive.names.join(", ")}${digest.inactive.total > digest.inactive.names.length ? " и другие" : ""}.`);
    for (const entry of digest.assignments.slice(0, 5)) lines.push(`• ${entry.label}: ${entry.done}/${entry.total} сдали`);
    if (digest.weak_skills[0]) lines.push(`Слабее всего: ${skill(digest.weak_skills[0].skill)}.`);
  } else if (locale === "uz") {
    lines.push(`«${className}» sinfining haftasi (${digest.week_start} – ${digest.week_end})`);
    lines.push(`Shugʻullandi: ${digest.students} tadan ${digest.active_students} tasi. Mashgʻulotlar: ${digest.activities}, daqiqalar: ${digest.minutes}.`);
    if (digest.top.length) lines.push(`Eng faollar: ${digest.top.map((entry) => entry.name).join(", ")}.`);
    if (digest.inactive.total) lines.push(`Shugʻullanmaganlar: ${digest.inactive.names.join(", ")}${digest.inactive.total > digest.inactive.names.length ? " va boshqalar" : ""}.`);
    for (const entry of digest.assignments.slice(0, 5)) lines.push(`• ${entry.label}: ${entry.done}/${entry.total} bajardi`);
    if (digest.weak_skills[0]) lines.push(`Eng zaif koʻnikma: ${skill(digest.weak_skills[0].skill)}.`);
  } else {
    lines.push(`Your class "${className}" this week (${digest.week_start} – ${digest.week_end})`);
    lines.push(`Practised: ${digest.active_students} of ${digest.students}. Activities: ${digest.activities}, minutes: ${digest.minutes}.`);
    if (digest.top.length) lines.push(`Most active: ${digest.top.map((entry) => entry.name).join(", ")}.`);
    if (digest.inactive.total) lines.push(`No practice yet: ${digest.inactive.names.join(", ")}${digest.inactive.total > digest.inactive.names.length ? " and others" : ""}.`);
    for (const entry of digest.assignments.slice(0, 5)) lines.push(`• ${entry.label}: ${entry.done}/${entry.total} done`);
    if (digest.weak_skills[0]) lines.push(`Weakest skill: ${skill(digest.weak_skills[0].skill)}.`);
  }
  return lines.join("\n");
};

/** Monday morning (learner time) is when the Telegram digest goes out. */
export const DIGEST_HOUR = 9;
export const isDigestTime = (now: Date = new Date()): boolean => {
  const local = new Date(now.getTime() + LEARNER_OFFSET_MS);
  return local.getUTCDay() === 1 && local.getUTCHours() === DIGEST_HOUR;
};

/** The learner-local date of tomorrow (assignments due then get a reminder today). */
export const tomorrowOf = (now: Date = new Date()): string => learnerDateOf(now.getTime() + DAY_MS);
