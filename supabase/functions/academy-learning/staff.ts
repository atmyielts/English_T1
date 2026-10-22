// Staff actions: review queue (V-HW-F5), decisions, corrections and the
// mistake bank (V-HW-F6), the funnel (V-HW-F8), plan and settings, and course
// module unlock rules (V-CRS-F5).

import { runGradingCommand } from "../academy/grading-command.ts";
import { LegacyImportCommandError } from "../academy/legacy-import-command.ts";
import {
  auditEvent, configFlag, type Db, HttpError, learningPlan, notifyStudent, requireCapability, requireScope, scopeCovers,
  signSubmissionFile, staffScope, submissionFiles,
} from "./core.ts";
import { cleanMistakes, isUuid, type MistakeInput, type Row, rubricCriteria, studentFeedbackMessage, text } from "./lib.ts";

type Ctx = { sb: Db; actorId: string; academyId: string; body: Row; siteUrl: string };

const QUEUE_STATUSES = ["submitted", "late", "resubmitted"];

const signFiles = async (sb: Db, metadata: unknown, owner: Row) =>
  Promise.all(submissionFiles(metadata).map(async (f) => ({
    filename: f.filename ?? null, mime_type: f.mime_type ?? null, size_bytes: f.size_bytes ?? null,
    url: await signSubmissionFile(sb, f, owner),
  })));

const contactName = (c: Row | undefined) =>
  c ? `${String(c.first_name ?? "")} ${String(c.last_name ?? "")}`.trim() || "Student" : "Student";

// ---------------------------------------------------------------------------
// Overview, plan and settings
// ---------------------------------------------------------------------------

export const overview = async ({ sb, actorId, academyId }: Ctx) => {
  const grading = await staffScope(sb, academyId, actorId, "gradeSubmissions");
  const reports = await staffScope(sb, academyId, actorId, "viewAcademicReports");
  const manage = await staffScope(sb, academyId, actorId, "manageAcademy");
  if (!grading.allowed && !reports.allowed && !manage.allowed) throw new HttpError(403, "Forbidden");
  const plan = await learningPlan(sb, academyId);
  const { data: settings } = await sb.from("academy_homework_settings").select("*").eq("academy_id", academyId).maybeSingle();
  const flags = {
    telegram_handin: await configFlag(sb, "telegram_handin.enabled"),
    premark: await configFlag(sb, "premark.enabled"),
    digest: await configFlag(sb, "digest.enabled"),
  };
  let waiting = 0;
  if (grading.allowed) {
    let q = sb.from("academy_submissions").select("id", { count: "exact", head: true })
      .eq("academy_id", academyId).in("status", QUEUE_STATUSES).is("graded_at", null);
    if (!grading.academy_wide) q = q.in("classroom_id", grading.classroom_ids.length ? grading.classroom_ids : ["00000000-0000-0000-0000-000000000000"]);
    waiting = (await q).count ?? 0;
  }
  return {
    plan,
    settings: settings ?? { academy_id: academyId, premark_enabled: true, digest_enabled: true, telegram_handin_enabled: true },
    flags,
    can: { review: grading.allowed, reports: reports.allowed || grading.allowed, manage: manage.allowed },
    waiting,
    teaching_plans: (await sb.from("plans").select("id, name, amount, currency, duration_days, is_active, metadata")
      .eq("product_id", "00000000-0000-4000-8000-000000000801").order("amount")).data ?? [],
  };
};

export const updateSettings = async ({ sb, actorId, academyId, body }: Ctx) => {
  await requireScope(sb, academyId, actorId, "manageAcademy");
  const patch: Row = { academy_id: academyId, updated_by: actorId, updated_at: new Date().toISOString() };
  for (const key of ["premark_enabled", "digest_enabled", "telegram_handin_enabled"]) {
    if (typeof body[key] === "boolean") patch[key] = body[key];
  }
  const { data, error } = await sb.from("academy_homework_settings").upsert(patch, { onConflict: "academy_id" }).select("*").maybeSingle();
  if (error) throw new HttpError(503, "Settings were not saved. Retry.");
  await auditEvent(sb, { academyId, actorUserId: actorId, action: "homework.settings_updated", targetType: "academy_homework_settings", metadata: patch });
  return { settings: data };
};

// ---------------------------------------------------------------------------
// Review queue
// ---------------------------------------------------------------------------

export const reviewQueue = async ({ sb, actorId, academyId, body }: Ctx) => {
  const scope = await requireScope(sb, academyId, actorId, "gradeSubmissions");
  await requireCapability(sb, academyId, "homework");
  const limit = Math.min(Math.max(Number(body.limit ?? 30) || 30, 1), 60);
  let q = sb.from("academy_submissions")
    .select("id, academy_id, assignment_id, classroom_id, contact_id, user_id, status, attempt_number, submitted_at, updated_at, submission_content, submission_url, metadata, max_score")
    .eq("academy_id", academyId).in("status", QUEUE_STATUSES).is("graded_at", null)
    .order("submitted_at", { ascending: true }).limit(limit);
  const classroomFilter = isUuid(body.classroom_id) ? String(body.classroom_id) : null;
  if (classroomFilter) {
    if (!scopeCovers(scope, classroomFilter)) throw new HttpError(403, "Forbidden");
    q = q.eq("classroom_id", classroomFilter);
  } else if (!scope.academy_wide) {
    const classes = scope.classroom_ids.length ? scope.classroom_ids : ["00000000-0000-0000-0000-000000000000"];
    q = scope.contact_ids.length ? q.or(`classroom_id.in.(${classes.join(",")}),contact_id.in.(${scope.contact_ids.join(",")})`) : q.in("classroom_id", classes);
  }
  const { data: rows, error } = await q;
  if (error) throw new HttpError(503, "The review queue could not load. Retry.");
  const submissions = (rows ?? []) as Row[];

  // Corrections waiting for the teacher are part of the same queue.
  let cq = sb.from("academy_homework_corrections")
    .select("id, submission_id, assignment_id, classroom_id, contact_id, content, media, created_at")
    .eq("academy_id", academyId).eq("status", "submitted").order("created_at", { ascending: true }).limit(limit);
  if (classroomFilter) cq = cq.eq("classroom_id", classroomFilter);
  else if (!scope.academy_wide) cq = cq.in("classroom_id", scope.classroom_ids.length ? scope.classroom_ids : ["00000000-0000-0000-0000-000000000000"]);
  const corrections = ((await cq).data ?? []) as Row[];

  const assignmentIds = [...new Set([...submissions, ...corrections].map((s) => String(s.assignment_id)))];
  const contactIds = [...new Set([...submissions, ...corrections].map((s) => String(s.contact_id)))];
  const submissionIds = submissions.map((s) => String(s.id));
  const [assignments, contacts, classrooms, marks, signals] = await Promise.all([
    assignmentIds.length ? sb.from("academy_assignments").select("id, title, description, assignment_type, due_at, max_score, rubric_id, updated_at, classroom_id").in("id", assignmentIds) : { data: [] },
    contactIds.length ? sb.from("academy_contacts").select("id, first_name, last_name").in("id", contactIds) : { data: [] },
    sb.from("academy_classrooms").select("id, name").eq("academy_id", academyId),
    submissionIds.length ? sb.from("academy_homework_ai_marks").select("*").in("submission_id", submissionIds).neq("status", "superseded") : { data: [] },
    submissionIds.length ? sb.from("academy_homework_integrity_signals").select("submission_id, attempt_number, signal, severity, detail").in("submission_id", submissionIds) : { data: [] },
  ]);
  const byId = <T extends Row>(list: T[] | null | undefined) => new Map((list ?? []).map((r) => [String(r.id), r]));
  const assignmentMap = byId(assignments.data as Row[]), contactMap = byId(contacts.data as Row[]), classroomMap = byId(classrooms.data as Row[]);
  const rubricIds = [...new Set([...assignmentMap.values()].map((a) => a.rubric_id).filter(isUuid))];
  const rubrics = rubricIds.length ? byId(((await sb.from("academy_rubrics").select("id, title, criteria, status").in("id", rubricIds)).data ?? []) as Row[]) : new Map();

  const items = await Promise.all(submissions.map(async (s) => {
    const a = assignmentMap.get(String(s.assignment_id)) ?? {};
    const rubric = a.rubric_id ? rubrics.get(String(a.rubric_id)) : null;
    const attempt = Number(s.attempt_number ?? 1);
    const mark = ((marks.data ?? []) as Row[]).find((m) => m.submission_id === s.id && Number(m.attempt_number) === attempt) ?? null;
    return {
      kind: "submission",
      submission: { ...s, metadata: undefined, files: await signFiles(sb, s.metadata, s), source: (s.metadata as Row | null)?.source ?? "web" },
      assignment: a,
      rubric: rubric && rubric.status !== "archived" ? { id: rubric.id, title: rubric.title, criteria: rubric.criteria, parsed: rubricCriteria(rubric.criteria) } : null,
      student: { id: s.contact_id, name: contactName(contactMap.get(String(s.contact_id))) },
      classroom: { id: s.classroom_id, name: classroomMap.get(String(s.classroom_id))?.name ?? "Group" },
      ai: mark,
      signals: ((signals.data ?? []) as Row[]).filter((g) => g.submission_id === s.id && Number(g.attempt_number) === attempt),
    };
  }));
  const correctionItems = await Promise.all(corrections.map(async (c) => {
    const mistakes = (await sb.from("academy_homework_mistakes").select("id, tag, excerpt, correction, explanation, status")
      .eq("submission_id", c.submission_id).in("status", ["open", "corrected"])).data ?? [];
    const media = await Promise.all((Array.isArray(c.media) ? c.media as Row[] : []).map(async (f) => ({
      filename: f.filename ?? null, mime_type: f.mime_type ?? null, url: await signSubmissionFile(sb, f, c),
    })));
    return {
      kind: "correction",
      correction: { ...c, media },
      assignment: assignmentMap.get(String(c.assignment_id)) ?? {},
      student: { id: c.contact_id, name: contactName(contactMap.get(String(c.contact_id))) },
      classroom: { id: c.classroom_id, name: classroomMap.get(String(c.classroom_id))?.name ?? "Group" },
      mistakes,
    };
  }));
  return { items: [...correctionItems, ...items], classrooms: classrooms.data ?? [] };
};

// ---------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------

const saveMistakes = async (sb: Db, sub: Row, mistakes: MistakeInput[], actorId: string) => {
  if (!mistakes.length) return;
  const { error } = await sb.from("academy_homework_mistakes").insert(mistakes.map((m) => ({
    academy_id: sub.academy_id, contact_id: sub.contact_id, classroom_id: sub.classroom_id, assignment_id: sub.assignment_id,
    submission_id: sub.id, tag: m.tag, excerpt: m.excerpt, correction: m.correction, explanation: m.explanation,
    source: m.source, created_by: actorId,
  })));
  if (error) console.warn(JSON.stringify({ event: "academy_learning_mistakes_failed", submission_id: sub.id }));
};

const recordEvent = (sb: Db, row: Row, event: string, actorId: string, metadata: Row = {}) =>
  sb.from("academy_homework_events").upsert({
    academy_id: row.academy_id, assignment_id: row.assignment_id, classroom_id: row.classroom_id, contact_id: row.contact_id,
    event, source: "staff", actor_user_id: actorId, metadata,
  }, { onConflict: "assignment_id,contact_id,event", ignoreDuplicates: true });

const academyName = async (sb: Db, academyId: string) =>
  String((await sb.from("tenants").select("name").eq("id", academyId).maybeSingle()).data?.name ?? "Academy");

export const reviewDecide = async ({ sb, actorId, academyId, body }: Ctx) => {
  const scope = await requireScope(sb, academyId, actorId, "gradeSubmissions");
  await requireCapability(sb, academyId, "homework");
  const decision = String(body.decision ?? "");
  if (!["approve", "edit", "return"].includes(decision)) throw new HttpError(400, "Choose approve, edit or return.");
  if (!isUuid(body.submission_id)) throw new HttpError(400, "submission_id is required");
  const { data: sub } = await sb.from("academy_submissions")
    .select("id, academy_id, assignment_id, classroom_id, contact_id, user_id, attempt_number, updated_at, max_score, graded_at")
    .eq("id", body.submission_id).eq("academy_id", academyId).maybeSingle();
  if (!sub) throw new HttpError(404, "This submission is no longer available.");
  if (!scopeCovers(scope, String(sub.classroom_id), String(sub.contact_id))) throw new HttpError(403, "Forbidden");
  if (Number(body.expected_attempt_number) !== Number(sub.attempt_number ?? 0)) {
    throw new HttpError(409, "The student sent a newer attempt. Refresh the queue.");
  }
  const { data: assignment } = await sb.from("academy_assignments").select("id, title, max_score, rubric_id, updated_at").eq("id", sub.assignment_id).maybeSingle();
  const { data: mark } = await sb.from("academy_homework_ai_marks").select("*")
    .eq("submission_id", sub.id).eq("attempt_number", Number(sub.attempt_number ?? 1)).maybeSingle();

  const comments = text(body.comments, 2000) || (decision === "approve" ? text(mark?.summary, 2000) : "") || null;
  const mistakes = body.mistakes !== undefined
    ? cleanMistakes(body.mistakes, "teacher")
    : decision === "approve" ? cleanMistakes(mark?.mistakes, "ai") : [];
  const centre = await academyName(sb, academyId);

  if (decision === "return") {
    await saveMistakes(sb, sub, mistakes, actorId);
    await recordEvent(sb, sub, "returned", actorId, { mistakes: mistakes.length });
    if (mark?.id) await sb.from("academy_homework_ai_marks").update({ teacher_decision: "returned", updated_at: new Date().toISOString() }).eq("id", mark.id);
    await auditEvent(sb, { academyId, actorUserId: actorId, action: "homework.returned", targetType: "academy_submission", targetId: String(sub.id), contactId: String(sub.contact_id), classroomId: String(sub.classroom_id), metadata: { mistakes: mistakes.length } });
    await notifyStudent({
      userId: sub.user_id ? String(sub.user_id) : null,
      text: studentFeedbackMessage({ title: String(assignment?.title ?? "Homework"), centerName: centre, decision: "returned", comments, mistakes }),
      dedupeKey: `homework_returned:${sub.id}:${sub.attempt_number ?? 1}`,
    });
    return { ok: true, decision };
  }

  // Approve or edit: the score is released only by academy_grading_command.
  let rubricPayload: Row = {};
  let score = Number(decision === "approve" && body.score == null ? mark?.suggested_score : body.score);
  let maxScore = Number(body.max_score ?? sub.max_score ?? assignment?.max_score ?? mark?.max_score);
  if (assignment?.rubric_id) {
    const { data: rubric } = await sb.from("academy_rubrics").select("id, criteria, status").eq("id", assignment.rubric_id).maybeSingle();
    const criteria = rubric ? rubricCriteria(rubric.criteria) : null;
    if (!rubric || !criteria) throw new HttpError(409, "The assignment rubric changed. Refresh and review it.");
    const given = (body.rubric_scores && typeof body.rubric_scores === "object" ? body.rubric_scores : decision === "approve" ? mark?.rubric_scores : null) as Row | null;
    if (!given) throw new HttpError(400, "Score every rubric criterion.");
    const scores: Row = {};
    let total = 0, totalMax = 0;
    for (const c of criteria) {
      const value = Number(given[c.id]);
      if (!Number.isFinite(value) || value < 0 || value > c.max) throw new HttpError(400, `Score "${c.title}" from 0 to ${c.max}.`);
      scores[c.id] = value; total += value; totalMax += c.max;
    }
    score = Math.round(total * 100) / 100;
    maxScore = Math.round(totalMax * 100) / 100;
    rubricPayload = { rubric_id: rubric.id, rubric_scores: scores, expected_rubric_criteria: rubric.criteria };
  }
  if (!Number.isFinite(score) || !Number.isFinite(maxScore) || maxScore <= 0 || score < 0 || score > maxScore) {
    throw new HttpError(400, "Use a score between 0 and the maximum.");
  }
  const feedback: Row = {
    comments, source: "homework_os", ai_mark_id: mark?.id ?? null,
    strengths: decision === "approve" ? mark?.strengths ?? [] : [], improvements: decision === "approve" ? mark?.improvements ?? [] : [],
    ...(rubricPayload.rubric_id ? { rubric_id: rubricPayload.rubric_id, rubric_scores: rubricPayload.rubric_scores } : {}),
  };
  const key = typeof body.idempotency_key === "string" && /^[A-Za-z0-9_.:-]{1,160}$/.test(body.idempotency_key)
    ? body.idempotency_key : `hw:${sub.id}:${sub.attempt_number ?? 1}`;
  try {
    await runGradingCommand(sb, academyId, actorId, "grade_submission", {
      idempotency_key: key, submission_id: sub.id, assignment_id: sub.assignment_id, contact_id: sub.contact_id,
      score, max_score: maxScore, notes: comments ?? "", feedback,
      expected_attempt_number: Number(sub.attempt_number ?? 0), expected_updated_at: sub.updated_at,
      expected_assignment_updated_at: assignment?.updated_at,
      ...(rubricPayload.expected_rubric_criteria ? { expected_rubric_criteria: rubricPayload.expected_rubric_criteria } : {}),
    });
  } catch (error) {
    if (error instanceof LegacyImportCommandError) throw new HttpError(error.status, error.message);
    throw error;
  }
  await saveMistakes(sb, sub, mistakes, actorId);
  if (mark?.id) {
    await sb.from("academy_homework_ai_marks").update({
      teacher_decision: decision === "approve" ? "approved" : "edited", teacher_score: score, updated_at: new Date().toISOString(),
    }).eq("id", mark.id);
  }
  await notifyStudent({
    userId: sub.user_id ? String(sub.user_id) : null,
    text: studentFeedbackMessage({ title: String(assignment?.title ?? "Homework"), centerName: centre, decision: "graded", score, maxScore, comments, mistakes }),
    dedupeKey: `homework_graded:${sub.id}:${sub.attempt_number ?? 1}`,
  });
  return { ok: true, decision, score, max_score: maxScore };
};

export const correctionDecide = async ({ sb, actorId, academyId, body }: Ctx) => {
  const scope = await requireScope(sb, academyId, actorId, "gradeSubmissions");
  if (!isUuid(body.correction_id)) throw new HttpError(400, "correction_id is required");
  const decision = String(body.decision ?? "");
  if (!["accept", "needs_work"].includes(decision)) throw new HttpError(400, "Choose accept or needs_work.");
  const { data: correction } = await sb.from("academy_homework_corrections").select("*")
    .eq("id", body.correction_id).eq("academy_id", academyId).maybeSingle();
  if (!correction) throw new HttpError(404, "This correction is no longer available.");
  if (!scopeCovers(scope, String(correction.classroom_id), String(correction.contact_id))) throw new HttpError(403, "Forbidden");
  const { data: updated } = await sb.from("academy_homework_corrections")
    .update({ status: decision === "accept" ? "accepted" : "needs_work", reviewed_by: actorId, reviewed_at: new Date().toISOString() })
    .eq("id", correction.id).eq("status", "submitted").select("id").maybeSingle();
  if (!updated) throw new HttpError(409, "This correction was already reviewed.");
  const now = new Date().toISOString();
  const { data: sub } = await sb.from("academy_submissions").select("user_id").eq("id", correction.submission_id).maybeSingle();
  const { data: assignment } = await sb.from("academy_assignments").select("title").eq("id", correction.assignment_id).maybeSingle();
  if (decision === "accept") {
    await sb.from("academy_homework_mistakes").update({ status: "corrected", resolved_by: actorId, resolved_at: now, updated_at: now })
      .eq("submission_id", correction.submission_id).eq("status", "open");
    await recordEvent(sb, correction, "corrected", actorId);
  } else {
    // A new correction can be sent; the "returned" event keeps it open in Telegram.
  }
  await notifyStudent({
    userId: sub?.user_id ? String(sub.user_id) : null,
    text: decision === "accept"
      ? `✅ Your correction for <b>${String(assignment?.title ?? "homework").replace(/</g, "&lt;")}</b> was accepted.`
      : `↩️ Your correction for <b>${String(assignment?.title ?? "homework").replace(/</g, "&lt;")}</b> needs a little more work. Send it again here.`,
    dedupeKey: `homework_correction:${correction.id}`,
  });
  return { ok: true, decision };
};

// ---------------------------------------------------------------------------
// Mistake bank
// ---------------------------------------------------------------------------

export const mistakes = async ({ sb, actorId, academyId, body }: Ctx) => {
  const scope = await requireScope(sb, academyId, actorId, "gradeSubmissions");
  let q = sb.from("academy_homework_mistakes")
    .select("id, contact_id, classroom_id, assignment_id, submission_id, tag, excerpt, correction, explanation, status, source, created_at, resolved_at")
    .eq("academy_id", academyId).order("created_at", { ascending: false }).limit(300);
  if (isUuid(body.contact_id)) q = q.eq("contact_id", body.contact_id);
  if (isUuid(body.classroom_id)) {
    if (!scopeCovers(scope, String(body.classroom_id))) throw new HttpError(403, "Forbidden");
    q = q.eq("classroom_id", body.classroom_id);
  } else if (!scope.academy_wide) {
    q = q.in("classroom_id", scope.classroom_ids.length ? scope.classroom_ids : ["00000000-0000-0000-0000-000000000000"]);
  }
  const rows = ((await q).data ?? []) as Row[];
  const tags = new Map<string, { tag: string; open: number; total: number }>();
  for (const m of rows) {
    const entry = tags.get(String(m.tag)) ?? { tag: String(m.tag), open: 0, total: 0 };
    entry.total += 1;
    if (m.status === "open") entry.open += 1;
    tags.set(String(m.tag), entry);
  }
  return { mistakes: rows, tags: [...tags.values()].sort((a, b) => b.open - a.open || b.total - a.total).slice(0, 30) };
};

export const mistakeUpdate = async ({ sb, actorId, academyId, body }: Ctx) => {
  const scope = await requireScope(sb, academyId, actorId, "gradeSubmissions");
  if (!isUuid(body.mistake_id)) throw new HttpError(400, "mistake_id is required");
  const status = String(body.status ?? "");
  if (!["open", "corrected", "mastered", "dismissed"].includes(status)) throw new HttpError(400, "Choose a valid status.");
  const { data: mistake } = await sb.from("academy_homework_mistakes").select("*").eq("id", body.mistake_id).eq("academy_id", academyId).maybeSingle();
  if (!mistake) throw new HttpError(404, "This mistake is no longer available.");
  if (!scopeCovers(scope, String(mistake.classroom_id), String(mistake.contact_id))) throw new HttpError(403, "Forbidden");
  const now = new Date().toISOString();
  await sb.from("academy_homework_mistakes").update({
    status, updated_at: now, resolved_by: status === "open" ? null : actorId, resolved_at: status === "open" ? null : now,
  }).eq("id", mistake.id);
  if (status === "mastered") {
    const { count } = await sb.from("academy_homework_mistakes").select("id", { count: "exact", head: true })
      .eq("submission_id", mistake.submission_id).in("status", ["open", "corrected"]);
    if ((count ?? 0) === 0) await recordEvent(sb, mistake, "mastered", actorId);
  }
  return { ok: true };
};

// ---------------------------------------------------------------------------
// Funnel
// ---------------------------------------------------------------------------

export const funnel = async ({ sb, actorId, academyId, body }: Ctx) => {
  const reports = await staffScope(sb, academyId, actorId, "viewAcademicReports");
  const grading = reports.academy_wide ? reports : await staffScope(sb, academyId, actorId, "gradeSubmissions");
  const scope = reports.academy_wide ? reports : grading.allowed ? grading : reports;
  if (!scope.allowed) throw new HttpError(403, "Forbidden");
  const to = body.to && !Number.isNaN(Date.parse(String(body.to))) ? new Date(String(body.to)) : new Date();
  const from = body.from && !Number.isNaN(Date.parse(String(body.from))) ? new Date(String(body.from)) : new Date(to.getTime() - 28 * 86400_000);
  if (to.getTime() - from.getTime() > 400 * 86400_000 || to <= from) throw new HttpError(400, "Choose a period of up to 400 days.");
  let classrooms: string[] | null = scope.academy_wide ? null : scope.classroom_ids;
  if (isUuid(body.classroom_id)) {
    if (!scopeCovers(scope, String(body.classroom_id))) throw new HttpError(403, "Forbidden");
    classrooms = [String(body.classroom_id)];
  }
  const { data, error } = await sb.rpc("academy_homework_funnel", {
    p_academy: academyId, p_from: from.toISOString(), p_to: to.toISOString(), p_classrooms: classrooms,
  });
  if (error) throw new HttpError(503, "The homework funnel could not load. Retry.");
  return data;
};

// ---------------------------------------------------------------------------
// Courses: unlock-by-check rules
// ---------------------------------------------------------------------------

export const courseModules = async ({ sb, actorId, academyId, body }: Ctx) => {
  await requireScope(sb, academyId, actorId, "manageAssignments");
  if (!isUuid(body.course_id)) {
    const { data: courses } = await sb.from("academy_courses").select("id, title, status").eq("academy_id", academyId)
      .neq("status", "archived").order("title").limit(200);
    return { courses: courses ?? [], modules: [], quizzes: [] };
  }
  const [modules, quizzes] = await Promise.all([
    sb.from("academy_course_modules").select("id, title, position, status, unlock_rule").eq("academy_id", academyId).eq("course_id", body.course_id).order("position"),
    sb.from("academy_quizzes").select("id, title, lesson_id, status, passing_score").eq("academy_id", academyId).eq("course_id", body.course_id).order("title"),
  ]);
  return { modules: modules.data ?? [], quizzes: quizzes.data ?? [] };
};

export const setModuleUnlock = async ({ sb, actorId, academyId, body }: Ctx) => {
  await requireScope(sb, academyId, actorId, "manageAssignments");
  if (!isUuid(body.module_id)) throw new HttpError(400, "module_id is required");
  const { data: mod } = await sb.from("academy_course_modules").select("id, course_id, position, unlock_rule")
    .eq("id", body.module_id).eq("academy_id", academyId).maybeSingle();
  if (!mod) throw new HttpError(404, "Module not found");
  const type = String(body.type ?? "none");
  let rule: Row = {};
  if (type === "quiz_pass") {
    if (!isUuid(body.quiz_id)) throw new HttpError(400, "Choose the check quiz.");
    const { data: quiz } = await sb.from("academy_quizzes").select("id").eq("id", body.quiz_id).eq("academy_id", academyId).eq("course_id", mod.course_id).maybeSingle();
    if (!quiz) throw new HttpError(400, "The check quiz must belong to this course.");
    const min = body.min_percent == null || body.min_percent === "" ? null : Number(body.min_percent);
    if (min != null && (!Number.isFinite(min) || min < 1 || min > 100)) throw new HttpError(400, "Pass mark must be 1 to 100.");
    rule = { type, quiz_id: body.quiz_id, ...(min != null ? { min_percent: min } : {}) };
  } else if (type === "previous_module") {
    rule = { type };
  } else if (type !== "none") {
    throw new HttpError(400, "Choose none, quiz_pass or previous_module.");
  }
  const { error } = await sb.from("academy_course_modules").update({ unlock_rule: rule, updated_at: new Date().toISOString() }).eq("id", mod.id);
  if (error) throw new HttpError(503, "The unlock rule was not saved. Retry.");
  await auditEvent(sb, { academyId, actorUserId: actorId, action: "course.module_unlock_updated", targetType: "academy_course_module", targetId: String(mod.id), metadata: { before: mod.unlock_rule, after: rule } });
  return { ok: true, unlock_rule: rule };
};
