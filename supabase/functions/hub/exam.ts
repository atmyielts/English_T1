// National exam track routes (hub): practice for Uzbekistan's Multilevel
// English exam. The rules (format, scoring, limits, plan) live in
// _shared/english-exam*.ts; this file checks access, loads and stores rows,
// and records each scored section as a learning attempt in its skill so XP,
// streaks, ratings and mistakes pick it up.
//
//   GET  /exam                  readiness per section, exam date + weekly plan, allowance, history
//   POST /exam/date             { date: "YYYY-MM-DD" | null }
//   POST /exam/mock/start       { kind: full|listening|reading|writing|speaking }  (or resumes)
//   GET  /exam/mock/section     ?mock_id=&section=  the section without answer keys; starts its clock
//   POST /exam/mock/submit      { mock_id, section, answers }  scores the section; finishes the mock
import { defaultAICreditDeps, callEnglishAIWithCredit } from "../_shared/english-ai-quota.ts";
import { englishAIAvailable } from "../_shared/english-ai.ts";
import { checkActivityAccess, learnerDayStart } from "../_shared/english-allowance.ts";
import {
  buildFeedbackPayload,
  calculateAttemptScore,
  json,
  parseBody,
  recordEvaluatedAttempt,
  resolveEnglishProducts,
  resolveOrCreateContentItem,
  toText,
} from "../_shared/english-learning.ts";
import { servicePausedBody } from "../_shared/english-settings.ts";
import { learnerWeekStart, seededRandom } from "../_shared/english-speaking-mock.ts";
import { EXAM_SECTIONS, type ExamLevel, type ExamSection, isExamSection, SECTION_SECONDS, SPEAKING_PREP_SECONDS, SPEAKING_TALK_SECONDS } from "../_shared/english-exam-format.ts";
import {
  buildSpeakingRequest,
  buildWritingRequest,
  decideExamStart,
  EXAM_RESUME_MS,
  type ExamPaper,
  isMockKind,
  isOvertime,
  issuesFromMark,
  markedSection,
  type MockKind,
  objectiveSection,
  parseObjectiveAnswers,
  parseSpeakingAnswers,
  parseSpeakingMark,
  parseWritingAnswers,
  parseWritingMark,
  pickPaper,
  publicSection,
  readSectionResult,
  scoreObjective,
  type SectionResult,
  sectionsOf,
  speakingTooShort,
  summarizeMock,
  validatePaper,
  writingTooShort,
} from "../_shared/english-exam.ts";
import {
  buildExamPlan,
  focusOrder,
  learnerToday,
  parseExamDate,
  readExamTrack,
  readinessFor,
  readinessOverall,
} from "../_shared/english-exam-plan.ts";
import { CEFR_ORDER, type Cefr } from "../_shared/english-today.ts";
import { loadGoal, ratingsFor, setMetaKey } from "./engine.ts";

type Products = Awaited<ReturnType<typeof resolveEnglishProducts>>;
type Ctx = { sb: any; req: Request; url: URL; route: string; userId: string; languageId: string; products: Products };
type Row = Record<string, unknown>;

const MOCK_COLUMNS = "id, paper_id, kind, basis, status, sections, result, overall_score, level, started_at, updated_at, finished_at";
const UUID = /^[0-9a-f-]{36}$/i;
/** Each skill's main activity type, for links into practice. */
const PRACTICE_TYPES: Record<ExamSection, string> = {
  reading: "reading.article",
  listening: "listening.item",
  writing: "writing.prompt",
  speaking: "speaking.prompt",
};

const isRec = (value: unknown): value is Row => !!value && typeof value === "object" && !Array.isArray(value);
const sectionsOfRow = (row: Row): Row => (isRec(row.sections) ? row.sections : {});
const sectionEntry = (row: Row, section: ExamSection): Row => (isRec(sectionsOfRow(row)[section]) ? sectionsOfRow(row)[section] as Row : {});
const sectionResultOf = (row: Row, section: ExamSection): SectionResult | null => readSectionResult(sectionEntry(row, section).result);

// --- Loading ---------------------------------------------------------------------

const loadPapers = async (ctx: Ctx): Promise<ExamPaper[]> => {
  const { data, error } = await ctx.sb.from("english_exam_papers")
    .select("id, content")
    .eq("exam", "multilevel")
    .eq("status", "published")
    .order("id")
    .limit(100);
  if (error) throw new Error(`Failed to load exam papers: ${error.message}`);
  const papers: ExamPaper[] = [];
  for (const row of (data ?? []) as Row[]) {
    const checked = validatePaper(row.content);
    if (checked.ok) papers.push(checked.paper);
    else console.warn(JSON.stringify({ event: "exam_paper_invalid", paper_id: row.id, problems: checked.problems.slice(0, 5) }));
  }
  return papers;
};

const loadPaper = async (ctx: Ctx, id: string): Promise<ExamPaper | null> => {
  const { data } = await ctx.sb.from("english_exam_papers").select("content").eq("id", id).maybeSingle();
  const checked = data ? validatePaper((data as Row).content) : null;
  return checked?.ok ? checked.paper : null;
};

const loadMocks = async (ctx: Ctx, limit = 60): Promise<Row[]> => {
  const { data, error } = await ctx.sb.from("english_exam_mocks")
    .select(MOCK_COLUMNS)
    .eq("user_id", ctx.userId)
    .eq("language_id", ctx.languageId)
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Failed to load exam mocks: ${error.message}`);
  return (data ?? []) as Row[];
};

const loadMock = async (ctx: Ctx, id: string): Promise<Row | null> => {
  if (!UUID.test(id)) return null;
  const { data } = await ctx.sb.from("english_exam_mocks")
    .select(MOCK_COLUMNS)
    .eq("id", id)
    .eq("user_id", ctx.userId)
    .eq("language_id", ctx.languageId)
    .maybeSingle();
  return (data ?? null) as Row | null;
};

// --- Access and limits ---------------------------------------------------------------

const accessOf = async (ctx: Ctx) => {
  const access = await checkActivityAccess(ctx.sb, { userId: ctx.userId, languageId: ctx.languageId, products: ctx.products, skill: null });
  return {
    admin: access.admin,
    holdsEnglish: access.entitled_skills.length > 0,
    paused: !access.admin && (access.paused_services as string[]).includes("exam"),
  };
};

const counts = (rows: Row[], now = new Date()) => {
  const dayStart = Date.parse(learnerDayStart(now));
  const weekStart = Date.parse(learnerWeekStart(now));
  const at = (row: Row) => Date.parse(String(row.started_at));
  return {
    fullToday: rows.filter((row) => row.kind === "full" && at(row) >= dayStart).length,
    fullThisWeek: rows.filter((row) => row.kind === "full" && at(row) >= weekStart).length,
    sectionsToday: rows.filter((row) => row.kind !== "full" && at(row) >= dayStart).length,
  };
};

const allowanceFor = (kind: MockKind, access: { admin: boolean; holdsEnglish: boolean }, rows: Row[]) =>
  decideExamStart({ kind, admin: access.admin, holdsEnglish: access.holdsEnglish, ...counts(rows) });

/** An unfinished mock of this kind the learner can still complete. */
const resumable = (rows: Row[], kind?: MockKind): Row | null =>
  rows.find((row) =>
    row.status === "in_progress"
    && (!kind || row.kind === kind)
    && Date.now() - Date.parse(String(row.started_at)) < EXAM_RESUME_MS) ?? null;

const aiReady = async (): Promise<boolean> =>
  (await englishAIAvailable("exam-writing")) && (await englishAIAvailable("exam-speaking"));

const needsAI = (kind: MockKind): boolean => kind === "full" || kind === "writing" || kind === "speaking";

// --- Views -------------------------------------------------------------------------------

const publicMock = (row: Row, title: string | null) => {
  const kind = String(row.kind) as MockKind;
  return {
    id: String(row.id),
    kind,
    paper_id: String(row.paper_id),
    paper_title: title,
    started_at: String(row.started_at),
    sections: sectionsOf(kind).map((section) => {
      const result = sectionResultOf(row, section);
      return { section, done: Boolean(result), score: result?.score ?? null, level: result?.level ?? null };
    }),
  };
};

const historyEntry = (row: Row) => ({
  id: String(row.id),
  kind: String(row.kind),
  finished_at: String(row.finished_at ?? row.updated_at ?? row.started_at),
  overall_score: typeof row.overall_score === "number" ? row.overall_score : null,
  level: typeof row.level === "string" ? row.level : null,
  result: isRec(row.result) ? row.result : null,
});

/** The latest scored result per section, from any mock (finished or not). */
const latestSectionScores = (rows: Row[]): Partial<Record<ExamSection, { score: number; at: string }>> => {
  const out: Partial<Record<ExamSection, { score: number; at: string }>> = {};
  for (const row of rows) {
    for (const section of EXAM_SECTIONS) {
      const result = sectionResultOf(row, section);
      if (!result) continue;
      const current = out[section];
      if (!current || Date.parse(result.submitted_at) > Date.parse(current.at)) out[section] = { score: result.score, at: result.submitted_at };
    }
  }
  return out;
};

const examCefr = (level: ExamLevel): Cefr => (level === "below_b1" ? "A2" : level);

/** Up to two activities per weak section at the learner's practice level, for "fix this next" links. */
const practiceLinks = async (ctx: Ctx, weak: Array<{ section: ExamSection; level: ExamLevel }>) => {
  const links: Array<{ section: ExamSection; skill: ExamSection; slug: string; title: string; level: Cefr | null }> = [];
  for (const entry of weak.slice(0, 2)) {
    const target = examCefr(entry.level);
    const near = [target, CEFR_ORDER[CEFR_ORDER.indexOf(target) - 1]].filter((level): level is Cefr => Boolean(level));
    const { data } = await ctx.sb.from("learning_content_registry_items")
      .select("source_ref, title, cefr_level")
      .eq("language_id", ctx.languageId)
      .eq("service_key", entry.section)
      .eq("content_type", PRACTICE_TYPES[entry.section])
      .eq("status", "published")
      .in("cefr_level", near)
      .limit(20);
    const rows = ((data ?? []) as Row[]).filter((row) => row.source_ref);
    rows.sort((a, b) => (a.cefr_level === target ? 0 : 1) - (b.cefr_level === target ? 0 : 1));
    for (const row of rows.slice(0, 2)) {
      links.push({ section: entry.section, skill: entry.section, slug: String(row.source_ref), title: String(row.title ?? ""), level: (row.cefr_level as Cefr) ?? null });
    }
  }
  return links;
};

// --- GET /exam ----------------------------------------------------------------------------

const overview = async (ctx: Ctx): Promise<Response> => {
  const [goal, rows, access, ai] = await Promise.all([loadGoal(ctx), loadMocks(ctx), accessOf(ctx), aiReady()]);
  const ratings = await ratingsFor(ctx, goal);
  const meta = isRec(goal?.metadata) ? goal!.metadata as Row : {};
  const track = readExamTrack(meta.exam_track);
  const readiness = readinessFor({ ratings: ratings.skills, mocks: latestSectionScores(rows) });
  const lastFull = rows.find((row) => row.kind === "full" && row.status === "finished");
  const plan = buildExamPlan({
    today: learnerToday(),
    date: track?.date ?? null,
    order: focusOrder(readiness),
    lastFullMockAt: lastFull ? String(lastFull.finished_at ?? lastFull.started_at) : null,
  });
  const open = resumable(rows);
  const papers = open ? await loadPaper(ctx, String(open.paper_id)) : null;
  return json(200, {
    ok: true,
    paused: access.paused,
    ai_available: ai,
    onboarded: Boolean(goal),
    target_level: typeof goal?.target_cefr === "string" ? goal.target_cefr : null,
    estimates: readiness,
    estimate: readinessOverall(readiness),
    plan,
    allowance: {
      full: allowanceFor("full", access, rows),
      section: allowanceFor("reading", access, rows),
    },
    timing: { seconds: SECTION_SECONDS, speaking_talk: SPEAKING_TALK_SECONDS, speaking_prep: SPEAKING_PREP_SECONDS },
    in_progress: open ? publicMock(open, papers?.title ?? null) : null,
    history: rows.filter((row) => row.status === "finished").slice(0, 10).map(historyEntry),
  });
};

// --- POST /exam/date --------------------------------------------------------------------

/**
 * Stores metadata.exam_track: the date and the sections weakest first (the
 * same order the page shows), which /hub/next uses for this week's focus.
 */
const saveTrack = async (ctx: Ctx, goal: Row, date: string | null): Promise<void> => {
  const [rows, ratings] = await Promise.all([loadMocks(ctx), ratingsFor(ctx, goal)]);
  await setMetaKey(ctx, "exam_track", {
    exam: "multilevel",
    date,
    focus_order: focusOrder(readinessFor({ ratings: ratings.skills, mocks: latestSectionScores(rows) })),
    updated_at: new Date().toISOString(),
  });
};

const saveDate = async (ctx: Ctx): Promise<Response> => {
  const body = await parseBody(ctx.req);
  const parsed = parseExamDate((body as Row).date, learnerToday());
  if (!parsed.ok) return json(422, { error: "Choose a date from today up to about a year ahead.", code: parsed.code });
  const goal = await loadGoal(ctx);
  if (!goal) return json(409, { error: "Finish the level test first", code: "english_onboarding_required" });
  await saveTrack(ctx, goal, parsed.date);
  return await overview(ctx);
};

// --- POST /exam/mock/start ---------------------------------------------------------------

const start = async (ctx: Ctx): Promise<Response> => {
  const body = await parseBody(ctx.req) as Row;
  const kind = isMockKind(body.kind) ? body.kind : null;
  if (!kind) return json(422, { error: "Choose a full mock or one section.", code: "exam_kind_invalid" });
  const [access, rows] = await Promise.all([accessOf(ctx), loadMocks(ctx)]);
  if (access.paused) return json(503, servicePausedBody("exam"));

  const open = resumable(rows, kind);
  if (open) {
    const paper = await loadPaper(ctx, String(open.paper_id));
    if (paper) return json(200, { ok: true, resumed: true, allowance: allowanceFor(kind, access, rows), mock: publicMock(open, paper.title) });
  }
  if (needsAI(kind) && !(await aiReady())) {
    return json(503, { error: "Writing and speaking marking is not available right now. Reading and listening still work.", code: "english_ai_unavailable" });
  }
  const allowance = allowanceFor(kind, access, rows);
  if (!allowance.allowed) {
    return json(402, {
      error: allowance.basis === "free"
        ? (kind === "full" ? "You've used this week's free full mock." : "You've used today's free section mock.")
        : "You've done today's mocks. Come back tomorrow.",
      code: "exam_mock_limit_reached",
      allowance,
    });
  }

  const papers = await loadPapers(ctx);
  const recent = rows.map((row) => String(row.paper_id));
  const seed = crypto.getRandomValues(new Uint32Array(1))[0] ?? Date.now();
  const paperId = pickPaper(papers.map((paper) => paper.id), recent, seededRandom(seed));
  const paper = papers.find((entry) => entry.id === paperId);
  if (!paper) return json(503, { error: "Practice papers are not available yet. Please try again later.", code: "exam_papers_missing" });

  const { data, error } = await ctx.sb.from("english_exam_mocks")
    .insert({ user_id: ctx.userId, language_id: ctx.languageId, paper_id: paper.id, kind, basis: allowance.basis })
    .select(MOCK_COLUMNS)
    .maybeSingle();
  if (error || !data?.id) throw new Error(`Failed to start exam mock: ${error?.message ?? "no id"}`);
  return json(200, {
    ok: true,
    resumed: false,
    allowance: { ...allowance, left: Math.max(0, allowance.left - 1) },
    mock: publicMock(data as Row, paper.title),
  });
};

// --- Saving a section (optimistic: retried if another section was saved meanwhile) ---------

const saveSection = async (ctx: Ctx, row: Row, section: ExamSection, patch: Row, finish?: (sections: Row) => Row | null): Promise<Row> => {
  let current = row;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const sections = { ...sectionsOfRow(current), [section]: { ...sectionEntry(current, section), ...patch } };
    const extra = finish ? finish(sections) : null;
    const nowIso = new Date().toISOString();
    const { data, error } = await ctx.sb.from("english_exam_mocks")
      .update({ sections, updated_at: nowIso, ...(extra ?? {}) })
      .eq("id", current.id)
      .eq("updated_at", current.updated_at)
      .select(MOCK_COLUMNS);
    if (error) throw new Error(`Failed to save exam section: ${error.message}`);
    const saved = ((data ?? []) as Row[])[0];
    if (saved) return saved;
    const reloaded = await loadMock(ctx, String(current.id));
    if (!reloaded) break;
    current = reloaded;
  }
  throw new Error("Failed to save exam section: kept conflicting");
};

// --- GET /exam/mock/section -----------------------------------------------------------------

const openSection = async (ctx: Ctx): Promise<Response> => {
  const mock = await loadMock(ctx, toText(ctx.url.searchParams.get("mock_id"), 64));
  const section = ctx.url.searchParams.get("section");
  if (!mock || !isExamSection(section) || !sectionsOf(String(mock.kind) as MockKind).includes(section)) {
    return json(404, { error: "Mock not found", code: "exam_mock_not_found" });
  }
  if (mock.status !== "in_progress") return json(409, { error: "This mock is finished.", code: "exam_mock_finished" });
  const done = sectionResultOf(mock, section);
  if (done) return json(409, { error: "You've already handed in this section.", code: "exam_section_done", result: done });
  const paper = await loadPaper(ctx, String(mock.paper_id));
  if (!paper) return json(404, { error: "Mock not found", code: "exam_mock_not_found" });

  let startedAt = typeof sectionEntry(mock, section).started_at === "string" ? String(sectionEntry(mock, section).started_at) : null;
  if (!startedAt) {
    startedAt = new Date().toISOString();
    await saveSection(ctx, mock, section, { started_at: startedAt });
  }
  return json(200, {
    ok: true,
    mock_id: String(mock.id),
    section,
    started_at: startedAt,
    seconds: SECTION_SECONDS[section],
    content: publicSection(paper, section),
  });
};

// --- POST /exam/mock/submit -------------------------------------------------------------------

/** Records a scored section as a learning attempt in its skill. Never throws. */
const recordAttempt = async (ctx: Ctx, mock: Row, paper: ExamPaper, result: SectionResult, issues: Array<Record<string, unknown>>) => {
  try {
    const productId = (ctx.products as Record<string, { productId?: string | null }>)[result.section]?.productId;
    if (!productId) return;
    const minutes = Math.round(SECTION_SECONDS[result.section] / 60);
    const contentItem = await resolveOrCreateContentItem(ctx.sb, {
      productId,
      languageId: ctx.languageId,
      serviceKey: result.section,
      contentType: `${result.section}.exam`,
      sourceRef: `exam-${paper.id}-${result.section}`,
      title: `National exam practice: ${result.section} (${paper.title})`,
      skillKey: result.section,
      cefrLevel: null,
      estimatedMinutes: minutes,
      tags: ["exam.multilevel"],
    });
    const ratio = Math.max(0, Math.min(1, result.score / 75));
    const started = Date.parse(String(sectionEntry(mock, result.section).started_at ?? ""));
    const timeSpent = Number.isFinite(started) ? Math.max(30, Math.min(SECTION_SECONDS[result.section] * 2, Math.round((Date.now() - started) / 1000))) : null;
    const score = calculateAttemptScore({
      correctnessRatio: ratio,
      estimatedMinutes: minutes,
      timeSpentSeconds: timeSpent,
      hintUsageCount: 0,
      retryCount: 0,
      correctionQualityRatio: ratio,
    });
    await recordEvaluatedAttempt(ctx.sb, {
      userId: ctx.userId,
      languageId: ctx.languageId,
      productId,
      serviceKey: result.section,
      contentItem,
      attemptType: `${result.section}.exam`,
      responseJson: { exam_mock_id: mock.id, paper_id: paper.id, section: result.section, score: result.score, level: result.level },
      metadata: { source_ref: `exam-${paper.id}-${result.section}` },
      timeSpentSeconds: timeSpent,
      score,
      feedback: buildFeedbackPayload({ serviceKey: result.section, score: score.overallScore, title: `National exam practice: ${result.section}`, issues }),
      products: ctx.products,
    });
  } catch (error) {
    console.warn(JSON.stringify({ event: "exam_attempt_store_failed", error: error instanceof Error ? error.message.slice(0, 200) : "unknown" }));
  }
};

const markingFailed = () =>
  json(503, { error: "We couldn't mark this section right now. Your answers are saved: try again in a minute.", code: "english_ai_unavailable" });

const submit = async (ctx: Ctx): Promise<Response> => {
  const body = await parseBody(ctx.req) as Row;
  const mock = await loadMock(ctx, toText(body.mock_id, 64));
  const section = body.section;
  if (!mock || !isExamSection(section) || !sectionsOf(String(mock.kind) as MockKind).includes(section)) {
    return json(404, { error: "Mock not found", code: "exam_mock_not_found" });
  }
  const already = sectionResultOf(mock, section);
  if (already) return json(200, { ok: true, mock_id: mock.id, section, section_result: already, finished: mock.status === "finished", result: mock.result ?? null });
  if (mock.status !== "in_progress") return json(409, { error: "This mock is finished.", code: "exam_mock_finished" });
  const paper = await loadPaper(ctx, String(mock.paper_id));
  if (!paper) return json(404, { error: "Mock not found", code: "exam_mock_not_found" });

  const startedAt = typeof sectionEntry(mock, section).started_at === "string" ? String(sectionEntry(mock, section).started_at) : null;
  const overtime = isOvertime(section, startedAt);
  let result: SectionResult;
  let answers: unknown;
  let issues: Array<Record<string, unknown>> = [];
  let current = mock;

  if (section === "reading" || section === "listening") {
    const parts = section === "reading" ? paper.reading.parts : paper.listening.parts;
    const parsed = parseObjectiveAnswers(body.answers, parts);
    answers = parsed;
    result = objectiveSection(section, scoreObjective(parts, parsed), overtime);
  } else if (section === "writing") {
    const parsed = parseWritingAnswers(body.answers);
    if (writingTooShort(parsed)) return json(422, { error: "Write a little more before you hand in this section.", code: "exam_answer_too_short" });
    answers = parsed;
    // Keep the answers, so nothing is lost if marking has to be retried.
    current = await saveSection(ctx, current, section, { answers: parsed });
    const ai = await callEnglishAIWithCredit(defaultAICreditDeps(ctx.sb), ctx.userId, { ...buildWritingRequest(paper, parsed), feature: "exam-writing", userId: ctx.userId }, null as unknown);
    if (ai.over_limit) return json(429, { error: "Daily English AI limit reached. Your answers are saved: mark them tomorrow.", code: "english_ai_daily_limit_reached" });
    const marked = ai.status === "ok" ? parseWritingMark(ai.data, parsed) : null;
    if (!marked) {
      console.warn(JSON.stringify({ event: "exam_writing_unusable", status: ai.status, error: ai.error?.slice(0, 200) ?? null }));
      return markingFailed();
    }
    issues = issuesFromMark("writing", marked);
    result = markedSection("writing", marked, overtime);
  } else {
    const parsed = parseSpeakingAnswers(body.answers);
    if (speakingTooShort(parsed)) return json(422, { error: "Your answers are too short to mark. Answer each question in full sentences.", code: "exam_answer_too_short" });
    answers = parsed;
    current = await saveSection(ctx, current, section, { answers: parsed });
    const ai = await callEnglishAIWithCredit(defaultAICreditDeps(ctx.sb), ctx.userId, { ...buildSpeakingRequest(paper, parsed), feature: "exam-speaking", userId: ctx.userId }, null as unknown);
    if (ai.over_limit) return json(429, { error: "Daily English AI limit reached. Your answers are saved: mark them tomorrow.", code: "english_ai_daily_limit_reached" });
    const marked = ai.status === "ok" ? parseSpeakingMark(ai.data, parsed) : null;
    if (!marked) {
      console.warn(JSON.stringify({ event: "exam_speaking_unusable", status: ai.status, error: ai.error?.slice(0, 200) ?? null }));
      return markingFailed();
    }
    issues = issuesFromMark("speaking", marked);
    result = markedSection("speaking", marked, overtime, { spoken: parsed.some((answer) => answer.mode === "speech" && answer.words > 0) });
  }

  const kind = String(mock.kind) as MockKind;
  let finishedResult: Row | null = null;
  const saved = await saveSection(ctx, current, section, { answers, result }, (sections) => {
    const results: Partial<Record<ExamSection, SectionResult>> = {};
    for (const name of sectionsOf(kind)) {
      const stored = readSectionResult(isRec(sections[name]) ? (sections[name] as Row).result : null);
      if (stored) results[name] = stored;
    }
    if (Object.keys(results).length < sectionsOf(kind).length) return null;
    const summary = summarizeMock(results);
    const score = kind === "full" ? summary.overall : results[kind as ExamSection]?.score ?? null;
    const level = kind === "full" ? summary.level : results[kind as ExamSection]?.level ?? null;
    finishedResult = { kind, paper_id: paper.id, paper_title: paper.title, summary, sections: results };
    return { status: "finished", result: finishedResult, overall_score: score, level, finished_at: new Date().toISOString() };
  });

  await recordAttempt(ctx, saved, paper, result, issues);

  if (finishedResult) {
    const summary = (finishedResult as Row).summary as ReturnType<typeof summarizeMock>;
    const weak = kind === "full"
      ? [...EXAM_SECTIONS].sort((a, b) => (summary.scores[a] ?? 75) - (summary.scores[b] ?? 75)).slice(0, 2)
      : [kind as ExamSection];
    const sections = (finishedResult as Row).sections as Partial<Record<ExamSection, SectionResult>>;
    const practice = await practiceLinks(ctx, weak.map((name) => ({ section: name, level: sections[name]?.level ?? "B1" })));
    finishedResult = { ...(finishedResult as Row), practice };
    await ctx.sb.from("english_exam_mocks").update({ result: finishedResult }).eq("id", saved.id);
    // Keep /hub/next's weekly focus in step with the newest results.
    try {
      const goal = await loadGoal(ctx);
      if (goal) await saveTrack(ctx, goal, readExamTrack((goal.metadata as Row | undefined)?.exam_track)?.date ?? null);
    } catch (error) {
      console.warn(JSON.stringify({ event: "exam_focus_update_failed", error: error instanceof Error ? error.message.slice(0, 200) : "unknown" }));
    }
  }

  return json(200, { ok: true, mock_id: saved.id, section, section_result: result, finished: Boolean(finishedResult), result: finishedResult });
};

/** Handles the exam routes; null when the route is not one of them. */
export const handleExamRoute = async (ctx: Ctx): Promise<Response | null> => {
  const { req, route } = ctx;
  if (req.method === "GET" && route === "/exam") return await overview(ctx);
  if (req.method === "POST" && route === "/exam/date") return await saveDate(ctx);
  if (req.method === "POST" && route === "/exam/mock/start") return await start(ctx);
  if (req.method === "GET" && route === "/exam/mock/section") return await openSection(ctx);
  if (req.method === "POST" && route === "/exam/mock/submit") return await submit(ctx);
  return null;
};
