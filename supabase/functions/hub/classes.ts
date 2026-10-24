// English classes (hub routes): a teacher opens a class, learners join with a
// code after consenting, the teacher sets assignments and sees progress.
// Rules live in _shared/english-classes.ts; this file checks who is asking,
// loads rows and stores results. Separate from the Academy LMS.
//
// Learner (any signed-in user):
//   GET  /classes                         my classes (teaching + joined), my assignments, caps
//   GET  /classes/assignments             my open assignments (Today card)
//   POST /classes                         { name, level?, school_name?, locale? } open a class (become its teacher)
//   POST /classes/lookup                  { code } what joining shows on the consent screen
//   POST /classes/join                    { code, consent: true }
//   POST /classes/:id/leave
// Teacher of that class only:
//   GET  /classes/:id                     dashboard (?locale=) roster, assignments, weak skills, mistakes
//   GET  /classes/:id/digest              the last seven days
//   GET  /classes/:id/content             ?skill=&level=&q= lessons to assign
//   POST /classes/:id/update              { name?, level?, school_name?, digest_telegram?, digest_locale? }
//   POST /classes/:id/code                new join code (the old one stops working)
//   POST /classes/:id/archive
//   POST /classes/:id/remove              { user_id }
//   POST /classes/:id/assignments         new assignment (see parseAssignmentInput)
//   POST /classes/:id/assignments/:aid/cancel
// Worker (reminder cron, see index.ts): runClassReminders.
import { ENGLISH_BUNDLE_PRODUCT_ID, expandBundleEntitlements, isActiveAccessWindow } from "../_shared/english-access.ts";
import { json, parseBody, toText } from "../_shared/english-learning.ts";
import { readReminderSettings } from "../_shared/english-reminders.ts";
import { asLocale, publicScenario, ROLEPLAY_SCENARIOS, roleplayScenario } from "../_shared/english-roleplay.ts";
import { isServicePaused, loadEnglishSettings, servicePausedBody } from "../_shared/english-settings.ts";
import {
  asClassLocale,
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
  CLASS_LIMITS,
  cleanClassFields,
  decideCreateClass,
  decideJoin,
  digestText,
  dueAtFor,
  generateJoinCode,
  isAssignmentVisible,
  isDigestTime,
  joinLink,
  joinOutcome,
  learnerDateOf,
  normalizeJoinCode,
  parseAssignmentInput,
  planTier,
  PRIMARY_CONTENT_TYPES,
  readAssignment,
  skillLevelsFrom,
  studentActivity,
  tomorrowOf,
  topClassMistakes,
} from "../_shared/english-classes.ts";
import type { NextStep } from "../_shared/english-next.ts";
import { topicFromSubskill } from "../_shared/english-mistakes.ts";
import { type AttemptRow, type CatalogItem, type Cefr, isCefr, TODAY_SKILLS, type TodaySkill } from "../_shared/english-today.ts";
import { leagueName } from "../_shared/english-xp.ts";

type Row = Record<string, unknown>;
type Products = Record<string, { productId?: string | null }>;
type Ctx = { sb: any; userId: string; languageId: string };

const DAY_MS = 86_400_000;
const DONE_STATUSES = ["submitted", "scored", "failed"];
const ACTIVITY_DAYS = 60;
const ATTEMPT_LOOKBACK_MAX_DAYS = 120;
const PAGE = 1000;
const MAX_ATTEMPT_PAGES = 12;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CLASS_COLUMNS = "id, teacher_id, name, level, school_name, join_code, status, digest_telegram, digest_locale, created_at, archived_at";
const ASSIGNMENT_COLUMNS = "id, class_id, kind, title, skill, level, required_count, content_item_ids, scenario_id, note, due_at, created_at";

const isSkill = (value: unknown): value is TodaySkill => (TODAY_SKILLS as readonly string[]).includes(String(value));
const describe = (error: unknown): string =>
  error && typeof error === "object" && "message" in error ? String((error as { message?: unknown }).message ?? "") : String(error ?? "");
const relation = (row: Row): Row => {
  const value = row.learning_content_registry_items;
  return (Array.isArray(value) ? value[0] : value) as Row ?? {};
};

// --- Loading ----------------------------------------------------------------------------

const loadClass = async (ctx: Ctx, id: string): Promise<Row | null> => {
  if (!UUID.test(id)) return null;
  const { data, error } = await ctx.sb.from("english_classes").select(CLASS_COLUMNS)
    .eq("id", id).eq("language_id", ctx.languageId).maybeSingle();
  if (error) throw new Error(`Failed to load class: ${describe(error)}`);
  return (data ?? null) as Row | null;
};

const classByCode = async (ctx: Ctx, code: string): Promise<Row | null> => {
  const { data, error } = await ctx.sb.from("english_classes").select(CLASS_COLUMNS)
    .eq("join_code", code).eq("language_id", ctx.languageId).maybeSingle();
  if (error) throw new Error(`Failed to look up class: ${describe(error)}`);
  return (data ?? null) as Row | null;
};

const activeMembers = async (sb: any, classIds: string[]): Promise<Row[]> => {
  if (!classIds.length) return [];
  const { data, error } = await sb.from("english_class_members")
    .select("class_id, user_id, joined_at")
    .in("class_id", classIds)
    .eq("status", "active")
    .order("joined_at", { ascending: true })
    .limit(5000);
  if (error) throw new Error(`Failed to load class members: ${describe(error)}`);
  return (data ?? []) as Row[];
};

const loadAssignments = async (sb: any, classIds: string[], limit = 200): Promise<ClassAssignment[]> => {
  if (!classIds.length) return [];
  const { data, error } = await sb.from("english_class_assignments")
    .select(ASSIGNMENT_COLUMNS)
    .in("class_id", classIds)
    .is("archived_at", null)
    .order("due_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Failed to load assignments: ${describe(error)}`);
  return ((data ?? []) as Row[]).map(readAssignment).filter((entry): entry is ClassAssignment => entry !== null);
};

/** Display names: first name and last initial, or "Learner". Never emails. */
const loadNames = async (sb: any, userIds: string[]): Promise<Map<string, string>> => {
  const out = new Map<string, string>();
  if (!userIds.length) return out;
  const [profilesRes, usersRes] = await Promise.all([
    sb.from("user_profiles").select("user_id, first_name, last_name").in("user_id", userIds),
    sb.from("users").select("id, full_name").in("id", userIds),
  ]);
  const profiles = new Map(((profilesRes.data ?? []) as Row[]).map((row) => [String(row.user_id), row]));
  const users = new Map(((usersRes.data ?? []) as Row[]).map((row) => [String(row.id), row]));
  for (const id of userIds) {
    const profile = profiles.get(id);
    out.set(id, leagueName({ first: profile?.first_name, last: profile?.last_name, full: users.get(id)?.full_name }));
  }
  return out;
};

/** Finished activities of these learners since `since`, newest first. */
const loadClassAttempts = async (sb: any, languageId: string, userIds: string[], since: string): Promise<ClassAttempt[]> => {
  if (!userIds.length) return [];
  const out: ClassAttempt[] = [];
  for (let page = 0; page < MAX_ATTEMPT_PAGES; page += 1) {
    const { data, error } = await sb.from("learning_attempts")
      .select("id, user_id, content_item_id, service_key, correctness_ratio, overall_score, submitted_at, time_spent_seconds, learning_content_registry_items!inner(content_type, source_ref, cefr_level, estimated_minutes)")
      .eq("language_id", languageId)
      .in("user_id", userIds)
      .in("status", DONE_STATUSES)
      .not("submitted_at", "is", null)
      .gte("submitted_at", since)
      .order("submitted_at", { ascending: false })
      .order("id", { ascending: true })
      .range(page * PAGE, (page + 1) * PAGE - 1);
    if (error) throw new Error(`Failed to load class activity: ${describe(error)}`);
    const rows = (data ?? []) as Row[];
    for (const row of rows) {
      if (!isSkill(row.service_key)) continue;
      const item = relation(row);
      const raw = row.correctness_ratio ?? row.overall_score;
      const score = raw === null || raw === undefined || !Number.isFinite(Number(raw)) ? null : Math.max(0, Math.min(1, Number(raw)));
      const seconds = Number(row.time_spent_seconds);
      const minutes = Number(item.estimated_minutes);
      out.push({
        user_id: String(row.user_id),
        content_item_id: String(row.content_item_id ?? ""),
        skill: row.service_key,
        content_type: String(item.content_type ?? ""),
        source_ref: String(item.source_ref ?? ""),
        level: isCefr(item.cefr_level) ? item.cefr_level : null,
        score,
        submitted_at: String(row.submitted_at),
        seconds: Number.isFinite(seconds) && seconds > 0 ? seconds : null,
        minutes: Number.isFinite(minutes) && minutes > 0 ? minutes : null,
      });
    }
    if (rows.length < PAGE) break;
  }
  return out;
};

/** How far back activity must be read: the activity window, or the oldest assignment (capped). */
const attemptsSince = (assignments: ClassAssignment[], now: Date): string => {
  const floor = now.getTime() - ATTEMPT_LOOKBACK_MAX_DAYS * DAY_MS;
  const oldest = assignments.reduce((min, entry) => Math.min(min, Date.parse(entry.created_at)), now.getTime() - ACTIVITY_DAYS * DAY_MS);
  return new Date(Math.max(floor, oldest)).toISOString();
};

/** Published items by id (titles and links for assigned lessons). */
const loadItems = async (sb: any, languageId: string, ids: string[]): Promise<Map<string, CatalogItem>> => {
  const out = new Map<string, CatalogItem>();
  if (!ids.length) return out;
  const { data, error } = await sb.from("learning_content_registry_items")
    .select("id, service_key, source_ref, title, cefr_level, estimated_minutes, difficulty, tags")
    .eq("language_id", languageId)
    .in("id", [...new Set(ids)].slice(0, 500));
  if (error) throw new Error(`Failed to load lessons: ${describe(error)}`);
  for (const row of (data ?? []) as Row[]) {
    if (!isSkill(row.service_key) || !row.source_ref) continue;
    out.set(String(row.id), {
      id: String(row.id),
      skill: row.service_key,
      slug: String(row.source_ref),
      title: String(row.title ?? ""),
      level: isCefr(row.cefr_level) ? row.cefr_level : null,
      minutes: Math.max(1, Number(row.estimated_minutes ?? 10)),
      difficulty: Number(row.difficulty ?? 0.5),
      tags: Array.isArray(row.tags) ? (row.tags as unknown[]).map(String).slice(0, 12) : [],
    });
  }
  return out;
};

/** Plan tier per learner, in a few batched queries (same rules as requireEnglishSuiteAccess). */
const loadPlanTiers = async (sb: any, userIds: string[], products: Products) => {
  const out = new Map<string, ReturnType<typeof planTier>>();
  if (!userIds.length) return out;
  const skillProducts = TODAY_SKILLS
    .map((skill) => [skill, String(products[skill]?.productId ?? "")] as const)
    .filter(([, id]) => id);
  const productIds = skillProducts.map(([, id]) => id);
  const [usersRes, membershipsRes] = await Promise.all([
    sb.from("users").select("id, role").in("id", userIds),
    sb.from("tenant_memberships").select("user_id, tenant_id, created_at").in("user_id", userIds).eq("status", "active")
      .order("created_at", { ascending: true }).limit(5000),
  ]);
  const admins = new Set(((usersRes.data ?? []) as Row[])
    .filter((row) => String(row.role ?? "").trim().toLowerCase().startsWith("admin"))
    .map((row) => String(row.id)));
  const tenantOf = new Map<string, string>();
  for (const row of (membershipsRes.data ?? []) as Row[]) {
    const user = String(row.user_id);
    if (!tenantOf.has(user) && row.tenant_id) tenantOf.set(user, String(row.tenant_id));
  }
  const tenants = [...new Set(tenantOf.values())];
  const byTenant = new Map<string, string[]>();
  if (tenants.length && productIds.length) {
    const { data } = await sb.from("entitlements")
      .select("tenant_id, resource_id, is_active, starts_at, ends_at")
      .in("tenant_id", tenants)
      .eq("resource_type", "product")
      .eq("is_active", true)
      .in("resource_id", [...productIds, ENGLISH_BUNDLE_PRODUCT_ID])
      .limit(5000);
    for (const row of (data ?? []) as Row[]) {
      if (!isActiveAccessWindow(row as { is_active?: boolean | null; starts_at?: string | null; ends_at?: string | null })) continue;
      const list = byTenant.get(String(row.tenant_id)) ?? [];
      list.push(String(row.resource_id));
      byTenant.set(String(row.tenant_id), list);
    }
  }
  for (const id of userIds) {
    const tenant = tenantOf.get(id);
    const held = expandBundleEntitlements(tenant ? byTenant.get(tenant) ?? [] : [], productIds);
    const owned = skillProducts.filter(([, productId]) => held.includes(productId)).length;
    out.set(id, planTier({ admin: admins.has(id), ownedSkills: owned, totalSkills: skillProducts.length }));
  }
  return out;
};

const scenarioTitle = (id: string | null, locale: "en" | "ru" | "uz"): string | null => {
  const scenario = id ? roleplayScenario(id) : null;
  return scenario ? scenario.title[locale] : null;
};

const labelOf = (assignment: ClassAssignment, locale: "en" | "ru" | "uz", items: Map<string, CatalogItem>): string =>
  assignmentLabel(assignment, locale, {
    firstLessonTitle: assignment.content_item_ids[0] ? items.get(assignment.content_item_ids[0])?.title ?? null : null,
    scenarioTitle: scenarioTitle(assignment.scenario_id, locale),
  });

// --- Learner side ----------------------------------------------------------------------

type LearnerAssignments = {
  classes: Row[];
  teacherNames: Map<string, string>;
  rows: Array<{ assignment: ClassAssignment; className: string; progress: ReturnType<typeof assignmentProgress> }>;
  attempts: ClassAttempt[];
  items: Map<string, CatalogItem>;
};

/** The learner's active classes and their visible assignments with progress. */
const loadLearnerAssignments = async (ctx: Ctx, now = new Date()): Promise<LearnerAssignments> => {
  const { data: memberships, error } = await ctx.sb.from("english_class_members")
    .select("class_id, joined_at")
    .eq("user_id", ctx.userId)
    .eq("status", "active")
    .limit(50);
  if (error) throw new Error(`Failed to load memberships: ${describe(error)}`);
  const ids = ((memberships ?? []) as Row[]).map((row) => String(row.class_id));
  if (!ids.length) return { classes: [], teacherNames: new Map(), rows: [], attempts: [], items: new Map() };
  const { data: classRows, error: classError } = await ctx.sb.from("english_classes").select(CLASS_COLUMNS)
    .in("id", ids).eq("language_id", ctx.languageId).eq("status", "active");
  if (classError) throw new Error(`Failed to load classes: ${describe(classError)}`);
  const classes = (classRows ?? []) as Row[];
  const nameOf = new Map(classes.map((row) => [String(row.id), String(row.name ?? "")]));
  const assignments = (await loadAssignments(ctx.sb, classes.map((row) => String(row.id))))
    // Recent ones too (done or not), so /classes shows the last month.
    .filter((entry) => Date.parse(entry.due_at) >= now.getTime() - 30 * DAY_MS);
  const [attempts, items, teacherNames] = await Promise.all([
    loadClassAttempts(ctx.sb, ctx.languageId, [ctx.userId], attemptsSince(assignments, now)),
    loadItems(ctx.sb, ctx.languageId, assignments.flatMap((entry) => entry.content_item_ids)),
    loadNames(ctx.sb, [...new Set(classes.map((row) => String(row.teacher_id)))]),
  ]);
  const rows = assignments.map((assignment) => ({
    assignment,
    className: nameOf.get(assignment.class_id) ?? "",
    progress: assignmentProgress(assignment, attempts),
  }));
  return { classes, teacherNames, rows, attempts, items };
};

const learnerAssignmentView = (
  entry: LearnerAssignments["rows"][number],
  items: Map<string, CatalogItem>,
  attempts: ClassAttempt[],
  locale: "en" | "ru" | "uz",
  now: Date,
) => {
  const { assignment, progress } = entry;
  const since = Date.parse(assignment.created_at);
  const doneIds = new Set(attempts.filter((attempt) => Date.parse(attempt.submitted_at) >= since).map((attempt) => attempt.content_item_id));
  const lessons = assignment.content_item_ids
    .map((id) => items.get(id))
    .filter((item): item is CatalogItem => Boolean(item))
    .map((item) => ({ id: item.id, skill: item.skill, slug: item.slug, title: item.title, level: item.level, done: doneIds.has(item.id) }));
  const firstOpen = lessons.find((lesson) => !lesson.done);
  const href = assignment.kind === "lessons"
    ? (firstOpen ? `/${firstOpen.skill}/${encodeURIComponent(firstOpen.slug)}` : null)
    : assignment.kind === "skill_count"
      ? (assignment.skill ? `/${assignment.skill}` : null)
      : assignment.kind === "roleplay"
        ? (assignment.scenario_id ? `/roleplay/${assignment.scenario_id}` : "/roleplay")
        : "/speaking-mock";
  return {
    id: assignment.id,
    class_id: assignment.class_id,
    class_name: entry.className,
    kind: assignment.kind,
    label: labelOf(assignment, locale, items),
    custom_title: assignment.title !== null,
    skill: assignment.skill,
    level: assignment.level,
    required_count: assignment.required_count,
    scenario_id: assignment.scenario_id,
    note: assignment.note,
    due_at: assignment.due_at,
    due_date: learnerDateOf(assignment.due_at),
    done: progress.done,
    required: progress.required,
    state: assignmentState(progress, assignment.due_at, now),
    completed_at: progress.completed_at,
    lessons,
    href,
  };
};

const listMine = async (ctx: Ctx, url: URL, enabled: boolean, caps: { max_classes_per_teacher: number; max_students_per_class: number }) => {
  const locale = asLocale(url.searchParams.get("locale"));
  const now = new Date();
  const { data: teaching, error } = await ctx.sb.from("english_classes").select(CLASS_COLUMNS)
    .eq("teacher_id", ctx.userId).eq("language_id", ctx.languageId)
    .order("created_at", { ascending: false }).limit(100);
  if (error) throw new Error(`Failed to load your classes: ${describe(error)}`);
  const teachingRows = (teaching ?? []) as Row[];
  const [members, learner] = await Promise.all([
    activeMembers(ctx.sb, teachingRows.map((row) => String(row.id))),
    loadLearnerAssignments(ctx, now),
  ]);
  const counts = new Map<string, number>();
  for (const member of members) counts.set(String(member.class_id), (counts.get(String(member.class_id)) ?? 0) + 1);
  const appUrl = Deno.env.get("ENGLISH_APP_URL") ?? "https://english.schood.online";
  return json(200, {
    ok: true,
    enabled,
    caps,
    teaching: teachingRows.map((row) => ({
      id: String(row.id),
      name: row.name,
      level: row.level ?? null,
      school_name: row.school_name ?? null,
      status: row.status,
      students: counts.get(String(row.id)) ?? 0,
      join_code: row.status === "active" ? row.join_code : null,
      join_link: row.status === "active" ? joinLink(appUrl, String(row.join_code)) : null,
    })),
    joined: learner.classes.map((row) => ({
      id: String(row.id),
      name: row.name,
      level: row.level ?? null,
      school_name: row.school_name ?? null,
      teacher: learner.teacherNames.get(String(row.teacher_id)) ?? "Learner",
      assignments: learner.rows
        .filter((entry) => entry.assignment.class_id === String(row.id))
        .sort((a, b) => Date.parse(a.assignment.due_at) - Date.parse(b.assignment.due_at))
        .map((entry) => learnerAssignmentView(entry, learner.items, learner.attempts, locale, now)),
    })),
  });
};

const myOpenAssignments = async (ctx: Ctx, url: URL) => {
  const locale = asLocale(url.searchParams.get("locale"));
  const now = new Date();
  const learner = await loadLearnerAssignments(ctx, now);
  const open = learner.rows
    .filter((entry) => !entry.progress.complete && isAssignmentVisible(entry.assignment, now))
    .sort((a, b) => Date.parse(a.assignment.due_at) - Date.parse(b.assignment.due_at))
    .slice(0, 10)
    .map((entry) => learnerAssignmentView(entry, learner.items, learner.attempts, locale, now));
  return json(200, { ok: true, enabled: true, assignments: open });
};

/**
 * Class assignments as next steps for GET /hub/next. Never throws: a problem
 * here (or classes switched off) just means no assignment steps.
 */
export const loadAssignmentNextSteps = async (input: Ctx & {
  items: CatalogItem[];
  attempts: AttemptRow[];
  levelFor: (skill: TodaySkill) => Cefr | null;
}): Promise<NextStep[]> => {
  try {
    if (isServicePaused(await loadEnglishSettings(input.sb), "classes")) return [];
    const learner = await loadLearnerAssignments(input);
    if (!learner.rows.length) return [];
    return assignmentNextSteps({
      assignments: learner.rows,
      items: input.items,
      attempts: input.attempts,
      classAttempts: learner.attempts,
      levelFor: input.levelFor,
      labelFor: (assignment) => labelOf(assignment, "en", learner.items),
    });
  } catch (error) {
    console.error(JSON.stringify({ event: "english_class_next_failed", user_id: input.userId, message: describe(error).slice(0, 200) }));
    return [];
  }
};

const createClass = async (ctx: Ctx, req: Request, cap: number) => {
  const body = await parseBody(req) as Row;
  const fields = cleanClassFields(body);
  if (!fields.ok) return json(422, { error: fields.error, code: fields.code });
  const { count } = await ctx.sb.from("english_classes")
    .select("id", { head: true, count: "exact" })
    .eq("teacher_id", ctx.userId).eq("status", "active");
  const decision = decideCreateClass({ activeOwned: Number(count ?? 0), cap });
  if (!decision.ok) return json(409, { error: decision.error, code: decision.code });
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data, error } = await ctx.sb.from("english_classes")
      .insert({
        language_id: ctx.languageId,
        teacher_id: ctx.userId,
        name: fields.value.name,
        level: fields.value.level ?? null,
        school_name: fields.value.school_name ?? null,
        join_code: generateJoinCode(),
        digest_locale: asClassLocale(body.locale),
      })
      .select("id, join_code")
      .maybeSingle();
    if (!error && data?.id) {
      console.log(JSON.stringify({ event: "english_class_created", class_id: data.id, teacher_id: ctx.userId }));
      return json(200, { ok: true, id: String(data.id), join_code: data.join_code });
    }
    if (error?.code !== "23505") throw new Error(`Failed to create class: ${describe(error)}`);
  }
  throw new Error("Failed to create class: no free join code");
};

const lookup = async (ctx: Ctx, req: Request) => {
  const body = await parseBody(req) as Row;
  const code = normalizeJoinCode(body.code);
  const cls = code ? await classByCode(ctx, code) : null;
  if (!cls || cls.status !== "active") {
    return json(404, { error: "No class with this code. Check the code with your teacher.", code: "class_not_found" });
  }
  const { data: member } = await ctx.sb.from("english_class_members").select("status")
    .eq("class_id", cls.id).eq("user_id", ctx.userId).maybeSingle();
  const teacher = (await loadNames(ctx.sb, [String(cls.teacher_id)])).get(String(cls.teacher_id)) ?? "Learner";
  return json(200, {
    ok: true,
    code,
    class: { id: String(cls.id), name: cls.name, level: cls.level ?? null, school_name: cls.school_name ?? null, teacher },
    role: classRole(cls, member as Row | null, ctx.userId),
  });
};

const join = async (ctx: Ctx, req: Request, maxStudents: number) => {
  const body = await parseBody(req) as Row;
  const code = normalizeJoinCode(body.code);
  const cls = code ? await classByCode(ctx, code) : null;
  const decision = decideJoin({ cls, userId: ctx.userId, consent: body.consent === true });
  if (!decision.ok) return json(decision.status, { error: decision.error, code: decision.code });
  const { data, error } = await ctx.sb.rpc("english_class_join", {
    p_class_id: cls!.id,
    p_user_id: ctx.userId,
    p_code: code,
    p_max_students: maxStudents,
  });
  if (error) throw new Error(`Failed to join class: ${describe(error)}`);
  const outcome = joinOutcome(data);
  if (outcome.error) return json(outcome.status, { error: outcome.error, code: outcome.code });
  if (outcome.code === "joined") console.log(JSON.stringify({ event: "english_class_joined", class_id: cls!.id, user_id: ctx.userId }));
  return json(200, { ok: true, class_id: String(cls!.id), result: outcome.code });
};

const leave = async (ctx: Ctx, classId: string) => {
  if (!UUID.test(classId)) return json(404, { error: "Class not found", code: "class_not_found" });
  const { error } = await ctx.sb.from("english_class_members")
    .update({ status: "left", left_at: new Date().toISOString() })
    .eq("class_id", classId).eq("user_id", ctx.userId).eq("status", "active");
  if (error) throw new Error(`Failed to leave class: ${describe(error)}`);
  return json(200, { ok: true });
};

// --- Teacher side ------------------------------------------------------------------------

/** The class if the caller teaches it; otherwise the refusal to send. */
const teacherClass = async (ctx: Ctx, classId: string): Promise<{ cls: Row } | { response: Response }> => {
  const cls = await loadClass(ctx, classId);
  if (!cls) return { response: json(404, { error: "Class not found", code: "class_not_found" }) };
  if (classRole(cls, null, ctx.userId) !== "teacher") {
    return { response: json(403, { error: "Only the class teacher can see this.", code: "class_teacher_only" }) };
  }
  return { cls };
};

const archivedRefusal = () => json(409, { error: "This class is archived.", code: "class_archived" });

/** Everything the dashboard and the digest need about one class. */
const classData = async (sb: any, languageId: string, cls: Row, products: Products | null, now = new Date()) => {
  const classId = String(cls.id);
  const [members, assignments] = await Promise.all([activeMembers(sb, [classId]), loadAssignments(sb, [classId], CLASS_LIMITS.openAssignmentsMax)]);
  const userIds = members.map((row) => String(row.user_id));
  const since = attemptsSince(assignments, now);
  const [names, goalsRes, attempts, errorsRes, items, plans] = await Promise.all([
    loadNames(sb, userIds),
    userIds.length
      ? sb.from("learner_language_goals")
        .select("user_id, current_cefr_estimate, ratings:metadata->skill_ratings, placement:metadata->placement")
        .eq("language_id", languageId).in("user_id", userIds)
      : Promise.resolve({ data: [] }),
    loadClassAttempts(sb, languageId, userIds, since),
    userIds.length
      ? sb.from("learner_language_errors")
        .select("user_id, subskill_key, error_frequency")
        .eq("language_id", languageId).in("user_id", userIds)
        .like("subskill_key", "grammar.%")
        .in("mastery_status", ["open", "reopened"])
        .gte("last_seen_at", new Date(now.getTime() - 30 * DAY_MS).toISOString())
        .limit(3000)
      : Promise.resolve({ data: [] }),
    loadItems(sb, languageId, assignments.flatMap((entry) => entry.content_item_ids)),
    products ? loadPlanTiers(sb, userIds, products) : Promise.resolve(new Map<string, ReturnType<typeof planTier>>()),
  ]);
  const goals = new Map(((goalsRes.data ?? []) as Row[]).map((row) => [String(row.user_id), row]));
  const byUser = new Map<string, ClassAttempt[]>();
  for (const attempt of attempts) {
    const list = byUser.get(attempt.user_id) ?? [];
    list.push(attempt);
    byUser.set(attempt.user_id, list);
  }
  const mistakes = ((errorsRes.data ?? []) as Row[]).map((row) => ({
    user_id: String(row.user_id),
    topic: topicFromSubskill(String(row.subskill_key ?? "")),
    count: Number(row.error_frequency ?? 1),
  }));
  const students = members.map((member) => {
    const id = String(member.user_id);
    const goal = goals.get(id);
    return {
      user_id: id,
      name: names.get(id) ?? "Learner",
      joined_at: String(member.joined_at ?? ""),
      levels: skillLevelsFrom({ ratings: goal?.ratings, placement: goal?.placement, overall: goal?.current_cefr_estimate }),
      attempts: byUser.get(id) ?? [],
    };
  });
  const progress = new Map(assignments.map((assignment) => [
    assignment.id,
    new Map(students.map((student) => [student.user_id, assignmentProgress(assignment, student.attempts)])),
  ]));
  return { students, assignments, attempts, mistakes, items, plans, progress };
};

const dashboard = async (ctx: Ctx, cls: Row, url: URL, products: Products, caps: { max_students_per_class: number }) => {
  const locale = asLocale(url.searchParams.get("locale"));
  const now = new Date();
  const data = await classData(ctx.sb, ctx.languageId, cls, products, now);
  const appUrl = Deno.env.get("ENGLISH_APP_URL") ?? "https://english.schood.online";
  const active = cls.status === "active";
  return json(200, {
    ok: true,
    class: {
      id: String(cls.id),
      name: cls.name,
      level: cls.level ?? null,
      school_name: cls.school_name ?? null,
      status: cls.status,
      join_code: active ? cls.join_code : null,
      join_link: active ? joinLink(appUrl, String(cls.join_code)) : null,
      digest_telegram: cls.digest_telegram === true,
      digest_locale: asClassLocale(cls.digest_locale),
      created_at: cls.created_at,
      max_students: caps.max_students_per_class,
    },
    roster: data.students.map((student) => {
      const activity = studentActivity(student.attempts, now);
      const done = data.assignments.filter((assignment) => data.progress.get(assignment.id)?.get(student.user_id)?.complete).length;
      return {
        user_id: student.user_id,
        name: student.name,
        joined_at: student.joined_at,
        levels: student.levels,
        ...activity,
        assignments_done: done,
        assignments_total: data.assignments.length,
        plan: data.plans.get(student.user_id) ?? "free",
      };
    }),
    assignments: data.assignments.map((assignment) => {
      const per = data.progress.get(assignment.id) ?? new Map();
      const states = data.students.map((student) => assignmentState(per.get(student.user_id) ?? { done: 0, required: 1, complete: false, completed_at: null }, assignment.due_at, now));
      return {
        id: assignment.id,
        kind: assignment.kind,
        label: labelOf(assignment, locale, data.items),
        custom_title: assignment.title !== null,
        skill: assignment.skill,
        level: assignment.level,
        required_count: assignment.required_count,
        scenario_id: assignment.scenario_id,
        note: assignment.note,
        lessons: assignment.content_item_ids.map((id) => data.items.get(id)).filter((item): item is CatalogItem => Boolean(item))
          .map((item) => ({ id: item.id, skill: item.skill, slug: item.slug, title: item.title, level: item.level })),
        due_at: assignment.due_at,
        due_date: learnerDateOf(assignment.due_at),
        created_at: assignment.created_at,
        done: states.filter((state) => state === "done").length,
        overdue: states.filter((state) => state === "overdue").length,
        students: data.students.length,
        // Who has finished (roster ids), so the teacher can follow up with the rest.
        finished: data.students.filter((student) => per.get(student.user_id)?.complete).map((student) => student.user_id),
      };
    }),
    weak_skills: classWeakSkills(data.students.map((student) => student.levels)),
    mistakes: topClassMistakes(data.mistakes),
    scenarios: ROLEPLAY_SCENARIOS.map((scenario) => {
      const view = publicScenario(scenario, locale);
      return { id: view.id, title: view.title, levels: view.levels };
    }),
  });
};

const digestFor = async (sb: any, languageId: string, cls: Row, locale: "en" | "ru" | "uz", now = new Date()) => {
  const data = await classData(sb, languageId, cls, null, now);
  return buildDigest({
    now,
    students: data.students.map((student) => ({ user_id: student.user_id, name: student.name, levels: student.levels })),
    attempts: data.attempts,
    assignments: data.assignments.map((assignment) => ({
      assignment,
      label: labelOf(assignment, locale, data.items),
      doneBy: [...(data.progress.get(assignment.id)?.values() ?? [])].filter((entry) => entry.complete).length,
    })),
    mistakes: data.mistakes,
  });
};

const searchContent = async (ctx: Ctx, url: URL) => {
  const skill = toText(url.searchParams.get("skill"), 24);
  const level = toText(url.searchParams.get("level"), 4).toUpperCase();
  const q = toText(url.searchParams.get("q"), 60).replace(/[%_,()\\{}"*:]/g, " ").trim();
  let query = ctx.sb.from("learning_content_registry_items")
    .select("id, service_key, source_ref, title, cefr_level, estimated_minutes, tags")
    .eq("language_id", ctx.languageId)
    .eq("status", "published")
    .in("content_type", PRIMARY_CONTENT_TYPES as unknown as string[])
    .order("cefr_level", { ascending: true })
    .order("title", { ascending: true })
    .limit(40);
  if (isSkill(skill)) query = query.eq("service_key", skill);
  if (isCefr(level)) query = query.eq("cefr_level", level);
  if (q) {
    const topic = q.toLowerCase().replace(/\s+/g, "-");
    // Quoted values: spaces and dots in the search stay literal (reserved characters were stripped above).
    query = query.or(`title.ilike."%${q}%",tags.cs.{"${topic}"}`);
  }
  const { data, error } = await query;
  if (error) throw new Error(`Failed to search lessons: ${describe(error)}`);
  return json(200, {
    ok: true,
    items: ((data ?? []) as Row[])
      .filter((row) => isSkill(row.service_key) && row.source_ref)
      .map((row) => ({
        id: String(row.id),
        skill: row.service_key,
        slug: String(row.source_ref),
        title: String(row.title ?? ""),
        level: isCefr(row.cefr_level) ? row.cefr_level : null,
        minutes: Math.max(1, Number(row.estimated_minutes ?? 10)),
        tags: Array.isArray(row.tags) ? (row.tags as unknown[]).map(String).slice(0, 6) : [],
      })),
  });
};

const updateClass = async (ctx: Ctx, cls: Row, req: Request) => {
  if (cls.status !== "active") return archivedRefusal();
  const body = await parseBody(req) as Row;
  const fields = cleanClassFields(body, true);
  if (!fields.ok) return json(422, { error: fields.error, code: fields.code });
  const patch: Row = { ...fields.value, updated_at: new Date().toISOString() };
  if (typeof body.digest_telegram === "boolean") patch.digest_telegram = body.digest_telegram;
  if ("digest_locale" in body) patch.digest_locale = asClassLocale(body.digest_locale);
  const { error } = await ctx.sb.from("english_classes").update(patch).eq("id", cls.id).eq("teacher_id", ctx.userId);
  if (error) throw new Error(`Failed to update class: ${describe(error)}`);
  return json(200, { ok: true });
};

const newCode = async (ctx: Ctx, cls: Row) => {
  if (cls.status !== "active") return archivedRefusal();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateJoinCode();
    const { error } = await ctx.sb.from("english_classes")
      .update({ join_code: code, updated_at: new Date().toISOString() })
      .eq("id", cls.id).eq("teacher_id", ctx.userId);
    if (!error) {
      const appUrl = Deno.env.get("ENGLISH_APP_URL") ?? "https://english.schood.online";
      return json(200, { ok: true, join_code: code, join_link: joinLink(appUrl, code) });
    }
    if (error.code !== "23505") throw new Error(`Failed to change the code: ${describe(error)}`);
  }
  throw new Error("Failed to change the code: no free join code");
};

const archiveClass = async (ctx: Ctx, cls: Row) => {
  if (cls.status !== "active") return json(200, { ok: true });
  const now = new Date().toISOString();
  const { error } = await ctx.sb.from("english_classes")
    .update({ status: "archived", archived_at: now, updated_at: now, digest_telegram: false })
    .eq("id", cls.id).eq("teacher_id", ctx.userId);
  if (error) throw new Error(`Failed to archive class: ${describe(error)}`);
  return json(200, { ok: true });
};

const removeStudent = async (ctx: Ctx, cls: Row, req: Request) => {
  const body = await parseBody(req) as Row;
  const userId = toText(body.user_id, 64);
  if (!UUID.test(userId)) return json(422, { error: "Choose a learner.", code: "class_member_invalid" });
  const { data, error } = await ctx.sb.from("english_class_members")
    .update({ status: "removed", left_at: new Date().toISOString(), removed_code: cls.join_code })
    .eq("class_id", cls.id).eq("user_id", userId).eq("status", "active")
    .select("user_id");
  if (error) throw new Error(`Failed to remove learner: ${describe(error)}`);
  if (!(data ?? []).length) return json(404, { error: "This learner is not in the class.", code: "class_member_not_found" });
  return json(200, { ok: true });
};

const createAssignment = async (ctx: Ctx, cls: Row, req: Request) => {
  if (cls.status !== "active") return archivedRefusal();
  const body = await parseBody(req) as Row;
  const parsed = parseAssignmentInput(body, { today: learnerDateOf(new Date()), isScenario: (id) => roleplayScenario(id) !== null });
  if (!parsed.ok) return json(422, { error: parsed.error, code: parsed.code });
  const input = parsed.value;
  if (input.kind === "lessons") {
    const { data } = await ctx.sb.from("learning_content_registry_items").select("id")
      .eq("language_id", ctx.languageId).eq("status", "published").in("id", input.content_item_ids);
    if (((data ?? []) as Row[]).length !== input.content_item_ids.length) {
      return json(422, { error: "One of the lessons was not found.", code: "assignment_lessons_invalid" });
    }
  }
  const { count } = await ctx.sb.from("english_class_assignments")
    .select("id", { head: true, count: "exact" })
    .eq("class_id", cls.id).is("archived_at", null).gte("due_at", new Date().toISOString());
  if (Number(count ?? 0) >= CLASS_LIMITS.openAssignmentsMax) {
    return json(409, { error: `A class can have up to ${CLASS_LIMITS.openAssignmentsMax} open assignments.`, code: "assignment_limit_reached" });
  }
  const { data, error } = await ctx.sb.from("english_class_assignments")
    .insert({
      class_id: cls.id,
      created_by: ctx.userId,
      kind: input.kind,
      title: input.title,
      skill: input.skill,
      level: input.level,
      required_count: input.required_count,
      content_item_ids: input.content_item_ids,
      scenario_id: input.scenario_id,
      note: input.note,
      due_at: dueAtFor(input.due_date),
    })
    .select("id")
    .maybeSingle();
  if (error || !data?.id) throw new Error(`Failed to create assignment: ${describe(error)}`);
  return json(200, { ok: true, id: String(data.id) });
};

const cancelAssignment = async (ctx: Ctx, cls: Row, assignmentId: string) => {
  if (!UUID.test(assignmentId)) return json(404, { error: "Assignment not found", code: "assignment_not_found" });
  const { data, error } = await ctx.sb.from("english_class_assignments")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", assignmentId).eq("class_id", cls.id).is("archived_at", null)
    .select("id");
  if (error) throw new Error(`Failed to cancel assignment: ${describe(error)}`);
  if (!(data ?? []).length) return json(404, { error: "Assignment not found", code: "assignment_not_found" });
  return json(200, { ok: true });
};

// --- Dispatch -----------------------------------------------------------------------------

/** Hub dispatch for /classes; null when the route is not one of these. */
export const handleClassesRoute = async (input: Ctx & { req: Request; url: URL; route: string; products: unknown }): Promise<Response | null> => {
  const { req, url, route } = input;
  if (route !== "/classes" && !route.startsWith("/classes/")) return null;
  const ctx: Ctx = { sb: input.sb, userId: input.userId, languageId: input.languageId };
  const settings = await loadEnglishSettings(ctx.sb);
  const enabled = !isServicePaused(settings, "classes");
  const caps = settings.classes;
  const products = input.products as Products;

  if (req.method === "GET" && route === "/classes") {
    if (!enabled) return json(200, { ok: true, enabled: false, caps, teaching: [], joined: [] });
    return await listMine(ctx, url, enabled, caps);
  }
  if (req.method === "GET" && route === "/classes/assignments") {
    if (!enabled) return json(200, { ok: true, enabled: false, assignments: [] });
    return await myOpenAssignments(ctx, url);
  }
  if (!enabled) return json(503, servicePausedBody("classes"));

  if (req.method === "POST" && route === "/classes") return await createClass(ctx, req, caps.max_classes_per_teacher);
  if (req.method === "POST" && route === "/classes/lookup") return await lookup(ctx, req);
  if (req.method === "POST" && route === "/classes/join") return await join(ctx, req, caps.max_students_per_class);

  const match = route.match(/^\/classes\/([^/]+)(?:\/(.+))?$/);
  if (!match) return json(404, { error: "Not found", code: "not_found" });
  const classId = match[1]!;
  const rest = match[2] ?? "";
  if (req.method === "POST" && rest === "leave") return await leave(ctx, classId);

  const owned = await teacherClass(ctx, classId);
  if ("response" in owned) return owned.response;
  const { cls } = owned;

  if (req.method === "GET" && rest === "") return await dashboard(ctx, cls, url, products, caps);
  if (req.method === "GET" && rest === "digest") {
    const locale = asLocale(url.searchParams.get("locale"));
    return json(200, { ok: true, class_name: cls.name, digest: await digestFor(ctx.sb, ctx.languageId, cls, locale) });
  }
  if (req.method === "GET" && rest === "content") return await searchContent(ctx, url);
  if (req.method === "POST" && rest === "update") return await updateClass(ctx, cls, req);
  if (req.method === "POST" && rest === "code") return await newCode(ctx, cls);
  if (req.method === "POST" && rest === "archive") return await archiveClass(ctx, cls);
  if (req.method === "POST" && rest === "remove") return await removeStudent(ctx, cls, req);
  if (req.method === "POST" && rest === "assignments") return await createAssignment(ctx, cls, req);
  const cancel = rest.match(/^assignments\/([^/]+)\/cancel$/);
  if (req.method === "POST" && cancel) return await cancelAssignment(ctx, cls, cancel[1]!);
  return json(404, { error: "Not found", code: "not_found" });
};

// --- Reminders and digests (hourly cron) ------------------------------------------------------

const MAX_REMINDER_ASSIGNMENTS = 300;
const MAX_DIGEST_CLASSES = 100;

/**
 * Runs with the hourly reminder cycle:
 *   * learners who switched Telegram reminders on get one message, at their
 *     reminder hour, for each unfinished assignment due tomorrow;
 *   * on Monday at 09:00 (learner time) teachers who asked for it get the
 *     class's weekly digest.
 * Delivery goes through send-telegram (quiet hours, dedupe per assignment / week).
 */
export const runClassReminders = async (options: {
  sb: any;
  languageId: string;
  appUrl: string;
  now?: Date;
  dryRun?: boolean;
  onlyUserIds?: string[];
  forceDigest?: boolean;
  send: (body: Record<string, unknown>) => Promise<{ status: number }>;
}) => {
  const { sb, languageId } = options;
  const now = options.now ?? new Date();
  const report: unknown[] = [];
  if (isServicePaused(await loadEnglishSettings(sb), "classes")) return { skipped: "classes_paused", sent: report };
  const appUrl = options.appUrl.replace(/\/$/, "");
  const hour = new Date(now.getTime() + 5 * 3_600_000).getUTCHours();

  // 1. Assignments due tomorrow.
  const tomorrow = tomorrowOf(now);
  const { data: dueRows } = await sb.from("english_class_assignments")
    .select(`${ASSIGNMENT_COLUMNS}, english_classes!inner(id, name, status, language_id)`)
    .is("archived_at", null)
    .gt("due_at", dueAtFor(learnerDateOf(now)))
    .lte("due_at", dueAtFor(tomorrow))
    .eq("english_classes.status", "active")
    .eq("english_classes.language_id", languageId)
    .limit(MAX_REMINDER_ASSIGNMENTS);
  const due = ((dueRows ?? []) as Row[])
    .map((row) => ({ assignment: readAssignment(row), className: String((Array.isArray(row.english_classes) ? (row.english_classes as Row[])[0] : row.english_classes as Row)?.name ?? "") }))
    .filter((entry): entry is { assignment: ClassAssignment; className: string } => entry.assignment !== null);
  if (due.length) {
    const members = await activeMembers(sb, [...new Set(due.map((entry) => entry.assignment.class_id))]);
    let userIds = [...new Set(members.map((row) => String(row.user_id)))];
    if (options.onlyUserIds?.length) userIds = userIds.filter((id) => options.onlyUserIds!.includes(id));
    const [goalsRes, usersRes] = await Promise.all([
      userIds.length ? sb.from("learner_language_goals").select("user_id, metadata").eq("language_id", languageId).in("user_id", userIds) : Promise.resolve({ data: [] }),
      userIds.length ? sb.from("users").select("id, telegram_chat_id").in("id", userIds) : Promise.resolve({ data: [] }),
    ]);
    const linked = new Set(((usersRes.data ?? []) as Row[]).filter((row) => row.telegram_chat_id).map((row) => String(row.id)));
    const settingsOf = new Map(((goalsRes.data ?? []) as Row[]).map((row) => [String(row.user_id), readReminderSettings(row.metadata)]));
    const recipients = userIds.filter((id) => {
      const settings = settingsOf.get(id);
      return settings?.enabled && linked.has(id) && (options.onlyUserIds?.length || settings.hour === hour);
    });
    const attempts = await loadClassAttempts(sb, languageId, recipients, attemptsSince(due.map((entry) => entry.assignment), now));
    const items = await loadItems(sb, languageId, due.flatMap((entry) => entry.assignment.content_item_ids));
    for (const userId of recipients) {
      const locale = settingsOf.get(userId)!.locale;
      const mine = attempts.filter((attempt) => attempt.user_id === userId);
      const classesOf = new Set(members.filter((row) => String(row.user_id) === userId).map((row) => String(row.class_id)));
      for (const { assignment, className } of due) {
        if (!classesOf.has(assignment.class_id)) continue;
        const progress = assignmentProgress(assignment, mine);
        if (progress.complete) continue;
        const text = assignmentReminderText(locale, { className, label: labelOf(assignment, locale, items), done: progress.done, required: progress.required });
        if (options.dryRun) {
          report.push({ user_id: userId, kind: "english_class_assignment_due", assignment_id: assignment.id, text, dry_run: true });
          continue;
        }
        const delivery = await options.send({
          user_id: userId,
          text,
          parse_mode: null,
          notification_type: "english_class_assignment_due",
          category: "academic_required",
          dedupe_key: `english-class-due:${assignment.id}`,
          cta_url: `${appUrl}/classes`,
        });
        report.push({ user_id: userId, kind: "english_class_assignment_due", assignment_id: assignment.id, status: delivery.status });
      }
    }
  }

  // 2. Monday digests for teachers who asked for them.
  if (options.forceDigest || isDigestTime(now)) {
    const { data: classRows } = await sb.from("english_classes").select(CLASS_COLUMNS)
      .eq("language_id", languageId).eq("status", "active").eq("digest_telegram", true)
      .limit(MAX_DIGEST_CLASSES);
    let classes = (classRows ?? []) as Row[];
    if (options.onlyUserIds?.length) classes = classes.filter((row) => options.onlyUserIds!.includes(String(row.teacher_id)));
    const teacherIds = [...new Set(classes.map((row) => String(row.teacher_id)))];
    const { data: teachers } = teacherIds.length ? await sb.from("users").select("id, telegram_chat_id").in("id", teacherIds) : { data: [] };
    const linked = new Set(((teachers ?? []) as Row[]).filter((row) => row.telegram_chat_id).map((row) => String(row.id)));
    for (const cls of classes) {
      if (!linked.has(String(cls.teacher_id))) {
        report.push({ class_id: cls.id, kind: "english_class_digest", skipped: "telegram_not_linked" });
        continue;
      }
      try {
        const locale = asClassLocale(cls.digest_locale);
        const digest = await digestFor(sb, languageId, cls, locale, now);
        if (!digest.students) continue;
        const text = digestText(locale, String(cls.name ?? ""), digest);
        if (options.dryRun) {
          report.push({ class_id: cls.id, kind: "english_class_digest", text, dry_run: true });
          continue;
        }
        const delivery = await options.send({
          user_id: String(cls.teacher_id),
          text,
          parse_mode: null,
          notification_type: "english_class_digest",
          category: "academic_required",
          dedupe_key: `english-class-digest:${cls.id}:${digest.week_end}`,
          cta_url: `${appUrl}/classes/${cls.id}?tab=digest`,
        });
        report.push({ class_id: cls.id, kind: "english_class_digest", status: delivery.status });
      } catch (error) {
        report.push({ class_id: cls.id, kind: "english_class_digest", error: describe(error).slice(0, 200) });
      }
    }
  }
  return { sent: report };
};
