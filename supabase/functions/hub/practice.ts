// Speaking practice routes (hub): real-life role-plays, the IELTS-style
// speaking mock and the learner's typical first-language traps. The rules
// (limits, prompts, output validation) live in the _shared modules; this file
// only checks access, loads and stores rows, and records finished practice as
// speaking learning attempts so XP, streaks, progress and mistakes pick it up.
//
//   GET  /roleplay/scenarios      ?locale=en|ru|uz  scenarios, best results, allowance
//   POST /roleplay/turn           { scenario_id, session_id?, text }  one learner line → partner reply
//   POST /roleplay/finish         { session_id }  goals, fixes, phrases (idempotent)
//   GET  /speaking-mock           allowance, an unfinished mock, history
//   POST /speaking-mock/start     questions for a new (or resumed) mock
//   POST /speaking-mock/finish    { mock_id, part1: [...], part2: {...}, part3: [...] }  estimated bands
//   GET  /l1/traps                top 3 first-language traps from the learner's mistakes
import { callEnglishAIWithStatus, isEnglishAIConfigured } from "../_shared/english-ai.ts";
import { consumeEnglishAiDailyQuota, parseEnglishAiDailyLimit } from "../_shared/english-access.ts";
import { checkActivityAccess, freeLimitBody, learnerDayStart } from "../_shared/english-allowance.ts";
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
import { matchL1Notes, topL1Traps } from "../_shared/english-l1-notes.ts";
import {
  asLocale,
  basicFinish,
  buildFinishRequest,
  buildTurnRequest,
  cleanLearnerText,
  decideRoleplayStart,
  issuesFromRoleplay,
  learnerLines,
  parseFinishOutput,
  parseTurnOutput,
  partnerLevel,
  publicScenario,
  readMessages,
  ROLEPLAY_MAX_TURNS,
  ROLEPLAY_MIN_TURNS,
  ROLEPLAY_SCENARIOS,
  ROLEPLAY_SESSION_TTL_MS,
  ROLEPLAY_SESSIONS_PER_DAY,
  roleplayScenario,
  type RoleplayResult,
  type RoleplayTip,
  type ScenarioProgress,
} from "../_shared/english-roleplay.ts";
import {
  buildMockScoringRequest,
  decideMockStart,
  issuesFromMock,
  learnerWeekStart,
  MOCK_PREP_SECONDS,
  MOCK_RESUME_MS,
  MOCK_TALK_SECONDS,
  mockAnswersProblem,
  type MockQuestions,
  parseMockAnswers,
  parseMockScore,
  pickMockQuestions,
  readMockQuestions,
  seededRandom,
} from "../_shared/english-speaking-mock.ts";
import { type Cefr, isCefr } from "../_shared/english-today.ts";

type Products = Awaited<ReturnType<typeof resolveEnglishProducts>>;
type Ctx = { sb: any; req: Request; url: URL; route: string; userId: string; languageId: string; products: Products };
type Row = Record<string, unknown>;

const aiUnavailable = () => json(503, { error: "The speaking partner is not available right now. Please try again later.", code: "english_ai_unavailable" });

const quotaOrResponse = async (ctx: Ctx): Promise<Response | null> => {
  const quota = await consumeEnglishAiDailyQuota(ctx.sb, ctx.userId, parseEnglishAiDailyLimit(Deno.env.get("ENGLISH_AI_DAILY_LIMIT")));
  return quota.allowed
    ? null
    : json(429, { error: "Daily English AI limit reached. Try again tomorrow.", code: "english_ai_daily_limit_reached", remaining: quota.remaining, total: quota.total });
};

/** The learner's speaking level (placement per skill, else overall), or null. */
const speakingLevel = async (ctx: Ctx): Promise<Cefr | null> => {
  const { data } = await ctx.sb.from("learner_language_goals")
    .select("current_cefr_estimate, metadata")
    .eq("user_id", ctx.userId)
    .eq("language_id", ctx.languageId)
    .maybeSingle();
  const row = (data ?? {}) as Row;
  const placement = ((row.metadata as Row | undefined)?.placement ?? {}) as Row;
  const entry = (placement.per_skill as Row | undefined)?.speaking;
  const level = typeof entry === "string" ? entry : (entry as Row | undefined)?.level;
  if (isCefr(level)) return level;
  return isCefr(row.current_cefr_estimate) ? row.current_cefr_estimate : null;
};

const speakingAccess = (ctx: Ctx) =>
  checkActivityAccess(ctx.sb, { userId: ctx.userId, languageId: ctx.languageId, products: ctx.products, skill: "speaking" });

/** Records finished practice as one speaking learning attempt. Returns its id. */
const recordPractice = async (ctx: Ctx, input: {
  contentType: "speaking.roleplay" | "speaking.mock";
  sourceRef: string;
  title: string;
  level: string | null;
  minutes: number;
  ratio: number;
  timeSpentSeconds: number | null;
  issues: Array<Record<string, unknown>>;
  responseJson: Record<string, unknown>;
}): Promise<string | null> => {
  const productId = ctx.products.speaking?.productId;
  if (!productId) return null;
  const contentItem = await resolveOrCreateContentItem(ctx.sb, {
    productId,
    languageId: ctx.languageId,
    serviceKey: "speaking",
    contentType: input.contentType,
    sourceRef: input.sourceRef,
    title: input.title,
    skillKey: "speaking",
    subskillKeys: ["speaking.fluency", "speaking.grammar", "speaking.task_completion", "vocabulary.usage"],
    cefrLevel: input.level,
    estimatedMinutes: input.minutes,
    tags: [input.contentType],
  });
  const ratio = Math.max(0, Math.min(1, input.ratio));
  const score = calculateAttemptScore({
    correctnessRatio: ratio,
    estimatedMinutes: input.minutes,
    timeSpentSeconds: input.timeSpentSeconds,
    hintUsageCount: 0,
    retryCount: 0,
    correctionQualityRatio: ratio,
  });
  const recorded = await recordEvaluatedAttempt(ctx.sb, {
    userId: ctx.userId,
    languageId: ctx.languageId,
    productId,
    serviceKey: "speaking",
    contentItem,
    attemptType: input.contentType,
    responseJson: input.responseJson,
    metadata: { source_ref: input.sourceRef },
    timeSpentSeconds: input.timeSpentSeconds,
    score,
    feedback: buildFeedbackPayload({ serviceKey: "speaking", score: score.overallScore, title: input.title, issues: input.issues }),
    products: ctx.products,
  });
  return String(recorded.attempt.id ?? "") || null;
};

// --- Role-plays ---------------------------------------------------------------

const countSessionsToday = async (ctx: Ctx): Promise<{ all: number; free: number }> => {
  const { data } = await ctx.sb.from("english_roleplay_sessions")
    .select("basis")
    .eq("user_id", ctx.userId)
    .eq("language_id", ctx.languageId)
    .gte("started_at", learnerDayStart())
    .limit(100);
  const rows = (data ?? []) as Row[];
  return { all: rows.length, free: rows.filter((row) => row.basis === "free").length };
};

const roleplayScenarios = async (ctx: Ctx): Promise<Response> => {
  const locale = asLocale(ctx.url.searchParams.get("locale"));
  const [finishedRes, access, counts] = await Promise.all([
    ctx.sb.from("english_roleplay_sessions")
      .select("scenario_id, result, finished_at")
      .eq("user_id", ctx.userId)
      .eq("language_id", ctx.languageId)
      .eq("status", "finished")
      .order("finished_at", { ascending: false })
      .limit(200),
    speakingAccess(ctx),
    countSessionsToday(ctx),
  ]);
  const best = new Map<string, ScenarioProgress>();
  for (const row of (finishedRes.data ?? []) as Row[]) {
    const result = (row.result ?? {}) as Row;
    const progress = { goals_met: Number(result.goals_met ?? 0) || 0, goals_total: Number(result.goals_total ?? 0) || 0, finished_at: String(row.finished_at ?? "") };
    const current = best.get(String(row.scenario_id));
    if (!current || progress.goals_met > current.goals_met) best.set(String(row.scenario_id), progress);
  }
  const owner = access.basis === "admin" || access.basis === "entitled";
  return json(200, {
    ok: true,
    ai_available: isEnglishAIConfigured(),
    max_turns: ROLEPLAY_MAX_TURNS,
    min_turns: ROLEPLAY_MIN_TURNS,
    allowance: owner
      ? { basis: "entitled", sessions_left: Math.max(0, ROLEPLAY_SESSIONS_PER_DAY - counts.all) }
      : { basis: "free", sessions_left: access.free_left > 0 && counts.free === 0 ? 1 : 0 },
    scenarios: ROLEPLAY_SCENARIOS.map((scenario) => publicScenario(scenario, locale, best.get(scenario.id) ?? null)),
  });
};

const loadSession = async (ctx: Ctx, id: string): Promise<Row | null> => {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await ctx.sb.from("english_roleplay_sessions")
    .select("*")
    .eq("id", id)
    .eq("user_id", ctx.userId)
    .eq("language_id", ctx.languageId)
    .maybeSingle();
  return (data ?? null) as Row | null;
};

const readTips = (value: unknown): RoleplayTip[] =>
  (Array.isArray(value) ? value : [])
    .filter((entry): entry is Row => !!entry && typeof entry === "object")
    .map((entry) => ({ said: String(entry.said ?? ""), better: String(entry.better ?? "") }))
    .filter((tip) => tip.said && tip.better);

const roleplayTurn = async (ctx: Ctx): Promise<Response> => {
  const body = await parseBody(ctx.req);
  const scenario = roleplayScenario(toText(body.scenario_id, 64));
  if (!scenario) return json(404, { error: "Role-play not found", code: "roleplay_not_found" });
  const text = cleanLearnerText(body.text);
  if (!text) return json(422, { error: "Say or type something first.", code: "roleplay_empty" });
  if (!isEnglishAIConfigured()) return aiUnavailable();

  const sessionId = toText(body.session_id, 64);
  let session: Row | null = null;
  let basis: "entitled" | "admin" | "free" = "free";
  if (sessionId) {
    session = await loadSession(ctx, sessionId);
    const fresh = session && Date.now() - Date.parse(String(session.updated_at ?? session.started_at)) < ROLEPLAY_SESSION_TTL_MS;
    if (!session || session.status !== "active" || session.scenario_id !== scenario.id || !fresh) {
      return json(409, { error: "This conversation has ended. Start a new one.", code: "roleplay_session_closed" });
    }
  } else {
    const [access, counts] = await Promise.all([speakingAccess(ctx), countSessionsToday(ctx)]);
    const decision = decideRoleplayStart({
      admin: access.basis === "admin",
      entitled: access.basis === "entitled",
      freeLeft: access.free_left,
      sessionsToday: counts.all,
      freeSessionsToday: counts.free,
    });
    if (!decision.allowed) {
      return decision.code === "english_free_limit_reached"
        ? json(402, freeLimitBody(access))
        : json(429, { error: "You've done today's role-plays. Come back tomorrow.", code: decision.code });
    }
    basis = decision.basis;
  }

  const turns = Number(session?.learner_turns ?? 0);
  if (turns >= ROLEPLAY_MAX_TURNS) {
    return json(409, { error: "This conversation is complete. Finish it to see your results.", code: "roleplay_turn_limit" });
  }
  const level = session && isCefr(session.level) ? session.level : partnerLevel(scenario, await speakingLevel(ctx));
  const history = session ? readMessages(session.messages) : [{ role: "partner" as const, text: scenario.opening }];

  const blocked = await quotaOrResponse(ctx);
  if (blocked) return blocked;
  const ai = await callEnglishAIWithStatus<unknown>(
    { ...buildTurnRequest(scenario, level, history, text), feature: "roleplay", userId: ctx.userId },
    null,
  );
  const turn = ai.status === "ok" ? parseTurnOutput(ai.data, scenario, text) : null;
  if (!turn) {
    console.warn(JSON.stringify({ event: "roleplay_turn_unusable", status: ai.status, error: ai.error?.slice(0, 200) ?? null }));
    return aiUnavailable();
  }

  const messages = [...history, { role: "learner" as const, text }, { role: "partner" as const, text: turn.reply }];
  const goalsMet = [...new Set([...(Array.isArray(session?.goals_met) ? (session!.goals_met as unknown[]).map(String) : []), ...turn.goals_met])];
  const tips = [...readTips(session?.tips), ...(turn.tip ? [turn.tip] : [])].slice(-6);
  const nowIso = new Date().toISOString();
  let id = sessionId;
  if (session) {
    // Only if no other turn was saved meanwhile, so the limit can't be raced.
    const { data, error } = await ctx.sb.from("english_roleplay_sessions")
      .update({ messages, goals_met: goalsMet, tips, learner_turns: turns + 1, updated_at: nowIso })
      .eq("id", sessionId)
      .eq("status", "active")
      .eq("learner_turns", turns)
      .select("id");
    if (error) throw new Error(`Failed to save role-play turn: ${error.message}`);
    if (!(data ?? []).length) return json(409, { error: "Your previous message is still being answered.", code: "roleplay_turn_conflict" });
  } else {
    const { data, error } = await ctx.sb.from("english_roleplay_sessions")
      .insert({
        user_id: ctx.userId,
        language_id: ctx.languageId,
        scenario_id: scenario.id,
        basis,
        level,
        messages,
        goals_met: goalsMet,
        tips,
        learner_turns: 1,
        updated_at: nowIso,
      })
      .select("id")
      .maybeSingle();
    if (error || !data?.id) throw new Error(`Failed to start role-play: ${error?.message ?? "no id"}`);
    id = String(data.id);
  }

  const turnsLeft = ROLEPLAY_MAX_TURNS - (turns + 1);
  return json(200, {
    ok: true,
    session_id: id,
    level,
    reply: turn.reply,
    goals_met: goalsMet,
    tip: turn.tip ? { ...turn.tip, l1: matchL1Notes({ original: turn.tip.said, corrected: turn.tip.better })[0]?.id ?? null } : null,
    turns_left: turnsLeft,
    can_finish: turns + 1 >= ROLEPLAY_MIN_TURNS,
    should_finish: turn.end || turnsLeft <= 0,
  });
};

const roleplayFinish = async (ctx: Ctx): Promise<Response> => {
  const body = await parseBody(ctx.req);
  const session = await loadSession(ctx, toText(body.session_id, 64));
  if (!session) return json(404, { error: "Role-play not found", code: "roleplay_not_found" });
  const scenario = roleplayScenario(session.scenario_id);
  if (!scenario) return json(404, { error: "Role-play not found", code: "roleplay_not_found" });
  if (session.status === "finished" && session.result) return json(200, { ok: true, session_id: session.id, result: session.result });
  const turns = Number(session.learner_turns ?? 0);
  if (turns < ROLEPLAY_MIN_TURNS) {
    return json(422, { error: "Say a little more before you finish.", code: "roleplay_too_short", min_turns: ROLEPLAY_MIN_TURNS });
  }

  const messages = readMessages(session.messages);
  const learnerText = learnerLines(messages).join("\n");
  const tracked = Array.isArray(session.goals_met) ? (session.goals_met as unknown[]).map(String) : [];
  const level = isCefr(session.level) ? session.level : scenario.levels[0];
  let result: RoleplayResult | null = null;
  // The review uses AI when it can; without it the learner still gets goals, tips and phrases.
  if (isEnglishAIConfigured()) {
    const quota = await consumeEnglishAiDailyQuota(ctx.sb, ctx.userId, parseEnglishAiDailyLimit(Deno.env.get("ENGLISH_AI_DAILY_LIMIT")));
    if (quota.allowed) {
      const ai = await callEnglishAIWithStatus<unknown>(
        { ...buildFinishRequest(scenario, level, messages), feature: "roleplay", userId: ctx.userId },
        null,
      );
      result = ai.status === "ok" ? parseFinishOutput(ai.data, scenario, learnerText, tracked) : null;
      if (!result) console.warn(JSON.stringify({ event: "roleplay_finish_unusable", status: ai.status, error: ai.error?.slice(0, 200) ?? null }));
    }
  }
  result ??= basicFinish(scenario, tracked, readTips(session.tips), learnerText);

  const nowIso = new Date().toISOString();
  const claim = await ctx.sb.from("english_roleplay_sessions")
    .update({ status: "finished", result, finished_at: nowIso, updated_at: nowIso })
    .eq("id", session.id)
    .eq("status", "active")
    .select("id");
  if (claim.error) throw new Error(`Failed to finish role-play: ${claim.error.message}`);
  if (!(claim.data ?? []).length) {
    const stored = await loadSession(ctx, String(session.id));
    return json(200, { ok: true, session_id: session.id, result: stored?.result ?? result });
  }

  const startedMs = Date.parse(String(session.started_at ?? nowIso));
  const attemptId = await recordPractice(ctx, {
    contentType: "speaking.roleplay",
    sourceRef: `roleplay-${scenario.id}`,
    title: `Role-play: ${scenario.title.en}`,
    level: scenario.levels[0],
    minutes: 8,
    ratio: result.score / 100,
    timeSpentSeconds: Number.isFinite(startedMs) ? Math.max(30, Math.min(3600, Math.round((Date.now() - startedMs) / 1000))) : null,
    issues: issuesFromRoleplay(result, scenario.id),
    responseJson: { roleplay_session_id: session.id, scenario_id: scenario.id, learner_lines: learnerLines(messages).slice(0, 20), result },
  }).catch((error) => {
    console.warn(JSON.stringify({ event: "roleplay_attempt_store_failed", error: error instanceof Error ? error.message.slice(0, 200) : "unknown" }));
    return null;
  });
  if (attemptId) await ctx.sb.from("english_roleplay_sessions").update({ attempt_id: attemptId }).eq("id", session.id);
  return json(200, { ok: true, session_id: session.id, result });
};

// --- Speaking mock --------------------------------------------------------------

const mockCounts = async (ctx: Ctx) => {
  const { data } = await ctx.sb.from("english_speaking_mocks")
    .select("id, started_at, status, cue_card_id, questions")
    .eq("user_id", ctx.userId)
    .eq("language_id", ctx.languageId)
    .gte("started_at", learnerWeekStart())
    .order("started_at", { ascending: false })
    .limit(60);
  const rows = (data ?? []) as Row[];
  const dayStart = Date.parse(learnerDayStart());
  return {
    rows,
    startedThisWeek: rows.length,
    startedToday: rows.filter((row) => Date.parse(String(row.started_at)) >= dayStart).length,
  };
};

const mockAllowance = async (ctx: Ctx) => {
  const [access, counts] = await Promise.all([speakingAccess(ctx), mockCounts(ctx)]);
  const allowance = decideMockStart({
    admin: access.basis === "admin",
    ownsSpeaking: access.basis === "entitled",
    startedToday: counts.startedToday,
    startedThisWeek: counts.startedThisWeek,
  });
  return { allowance, counts };
};

/** An unfinished mock the learner can still complete (same questions). */
const resumable = (rows: Row[]): Row | null =>
  rows.find((row) => row.status === "in_progress" && Date.now() - Date.parse(String(row.started_at)) < MOCK_RESUME_MS) ?? null;

const publicMock = (row: Row) => ({ id: String(row.id), started_at: String(row.started_at), questions: readMockQuestions(row.questions) });

const mockTimes = { prep_seconds: MOCK_PREP_SECONDS, talk_seconds: MOCK_TALK_SECONDS };

const mockOverview = async (ctx: Ctx): Promise<Response> => {
  const [{ allowance, counts }, historyRes] = await Promise.all([
    mockAllowance(ctx),
    ctx.sb.from("english_speaking_mocks")
      .select("id, finished_at, overall_band, cue_card_id, questions, result")
      .eq("user_id", ctx.userId)
      .eq("language_id", ctx.languageId)
      .eq("status", "finished")
      .order("finished_at", { ascending: false })
      .limit(10),
  ]);
  const open = resumable(counts.rows);
  return json(200, {
    ok: true,
    ai_available: isEnglishAIConfigured(),
    allowance,
    ...mockTimes,
    in_progress: open ? publicMock(open) : null,
    history: ((historyRes.data ?? []) as Row[]).map((row) => ({
      id: String(row.id),
      finished_at: String(row.finished_at),
      overall: Number(row.overall_band ?? 0),
      cue_card: readMockQuestions(row.questions)?.part2.prompt ?? null,
      result: row.result ?? null,
    })),
  });
};

const mockStart = async (ctx: Ctx): Promise<Response> => {
  if (!isEnglishAIConfigured()) return aiUnavailable();
  const { allowance, counts } = await mockAllowance(ctx);
  const open = resumable(counts.rows);
  if (open) return json(200, { ok: true, resumed: true, allowance, ...mockTimes, mock: publicMock(open) });
  if (!allowance.allowed) {
    return json(402, {
      error: allowance.per === "week"
        ? "You've used this week's free speaking mock. Get Speaking to practise more often."
        : "You've done today's speaking mocks. Come back tomorrow.",
      code: "speaking_mock_limit_reached",
      allowance,
    });
  }
  const recentCards = counts.rows.map((row) => String(row.cue_card_id ?? "")).filter(Boolean);
  const seed = crypto.getRandomValues(new Uint32Array(1))[0] ?? Date.now();
  const questions: MockQuestions = pickMockQuestions(seededRandom(seed), recentCards);
  const { data, error } = await ctx.sb.from("english_speaking_mocks")
    .insert({
      user_id: ctx.userId,
      language_id: ctx.languageId,
      basis: allowance.basis,
      cue_card_id: questions.part2.id,
      questions,
    })
    .select("id, started_at, questions")
    .maybeSingle();
  if (error || !data?.id) throw new Error(`Failed to start speaking mock: ${error?.message ?? "no id"}`);
  return json(200, { ok: true, resumed: false, allowance: { ...allowance, left: Math.max(0, allowance.left - 1) }, ...mockTimes, mock: publicMock(data as Row) });
};

const mockFinish = async (ctx: Ctx): Promise<Response> => {
  const body = await parseBody(ctx.req);
  const mockId = toText(body.mock_id, 64);
  if (!/^[0-9a-f-]{36}$/i.test(mockId)) return json(404, { error: "Mock not found", code: "speaking_mock_not_found" });
  const { data: row } = await ctx.sb.from("english_speaking_mocks")
    .select("*")
    .eq("id", mockId)
    .eq("user_id", ctx.userId)
    .eq("language_id", ctx.languageId)
    .maybeSingle();
  if (!row) return json(404, { error: "Mock not found", code: "speaking_mock_not_found" });
  if (row.status === "finished" && row.result) return json(200, { ok: true, mock_id: mockId, result: row.result });
  const questions = readMockQuestions(row.questions);
  if (!questions) return json(404, { error: "Mock not found", code: "speaking_mock_not_found" });

  const answers = parseMockAnswers(body, questions);
  const problem = mockAnswersProblem(answers);
  if (problem) {
    return json(422, {
      error: problem === "part2_too_short" ? "Your Part 2 talk is too short to score. Try to speak for at least a minute." : "Your answers are too short to score. Answer each question in full sentences.",
      code: `speaking_mock_${problem}`,
    });
  }
  // Keep the answers, so nothing is lost if scoring has to be retried.
  await ctx.sb.from("english_speaking_mocks").update({ answers }).eq("id", mockId).eq("status", "in_progress");
  if (!isEnglishAIConfigured()) return aiUnavailable();
  const blocked = await quotaOrResponse(ctx);
  if (blocked) return blocked;
  const ai = await callEnglishAIWithStatus<unknown>(
    { ...buildMockScoringRequest(questions, answers), feature: "speaking-mock", userId: ctx.userId },
    null,
  );
  const result = ai.status === "ok" ? parseMockScore(ai.data, answers) : null;
  if (!result) {
    console.warn(JSON.stringify({ event: "speaking_mock_score_unusable", status: ai.status, error: ai.error?.slice(0, 200) ?? null }));
    return json(503, { error: "We couldn't score your mock right now. Your answers are saved: try again in a minute.", code: "english_ai_unavailable" });
  }

  const nowIso = new Date().toISOString();
  const claim = await ctx.sb.from("english_speaking_mocks")
    .update({ status: "finished", result, overall_band: result.overall, finished_at: nowIso })
    .eq("id", mockId)
    .eq("status", "in_progress")
    .select("id");
  if (claim.error) throw new Error(`Failed to store speaking mock: ${claim.error.message}`);
  if (!(claim.data ?? []).length) {
    const { data: stored } = await ctx.sb.from("english_speaking_mocks").select("result").eq("id", mockId).maybeSingle();
    return json(200, { ok: true, mock_id: mockId, result: stored?.result ?? result });
  }

  const startedMs = Date.parse(String(row.started_at ?? nowIso));
  const attemptId = await recordPractice(ctx, {
    contentType: "speaking.mock",
    sourceRef: "ielts-speaking-mock",
    title: "IELTS Speaking mock",
    level: null,
    minutes: 14,
    ratio: result.overall / 9,
    timeSpentSeconds: Number.isFinite(startedMs) ? Math.max(60, Math.min(5400, Math.round((Date.now() - startedMs) / 1000))) : null,
    issues: issuesFromMock(result),
    responseJson: { speaking_mock_id: mockId, cue_card_id: questions.part2.id, bands: result.bands, overall: result.overall },
  }).catch((error) => {
    console.warn(JSON.stringify({ event: "speaking_mock_attempt_store_failed", error: error instanceof Error ? error.message.slice(0, 200) : "unknown" }));
    return null;
  });
  if (attemptId) await ctx.sb.from("english_speaking_mocks").update({ attempt_id: attemptId }).eq("id", mockId);
  return json(200, { ok: true, mock_id: mockId, result });
};

// --- First-language traps ---------------------------------------------------------

const l1Traps = async (ctx: Ctx): Promise<Response> => {
  const { data, error } = await ctx.sb.from("learner_language_errors")
    .select("subskill_key, error_type, error_frequency")
    .eq("user_id", ctx.userId)
    .eq("language_id", ctx.languageId)
    .in("mastery_status", ["open", "reopened", "improving"])
    .gte("last_seen_at", new Date(Date.now() - 120 * 86_400_000).toISOString())
    .order("last_seen_at", { ascending: false })
    .limit(400);
  if (error) throw new Error(`Failed to load mistakes: ${error.message}`);
  return json(200, { ok: true, traps: topL1Traps((data ?? []) as Row[], 3) });
};

/** Handles the practice routes; null when the route is not one of them. */
export const handlePracticeRoute = async (ctx: Ctx): Promise<Response | null> => {
  const { req, route } = ctx;
  if (req.method === "GET" && route === "/roleplay/scenarios") return await roleplayScenarios(ctx);
  if (req.method === "POST" && route === "/roleplay/turn") return await roleplayTurn(ctx);
  if (req.method === "POST" && route === "/roleplay/finish") return await roleplayFinish(ctx);
  if (req.method === "GET" && route === "/speaking-mock") return await mockOverview(ctx);
  if (req.method === "POST" && route === "/speaking-mock/start") return await mockStart(ctx);
  if (req.method === "POST" && route === "/speaking-mock/finish") return await mockFinish(ctx);
  if (req.method === "GET" && route === "/l1/traps") return await l1Traps(ctx);
  return null;
};
