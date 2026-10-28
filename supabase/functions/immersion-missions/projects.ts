// Multi-day projects (immersion-missions):
//   GET  /projects                         every project with the learner's progress
//   GET  /projects/:key                    one project: days, state, personal targets, summary when done
//   POST /projects/:key/start              start (or start again after finishing)
//   POST /projects/:key/days/:n/submit     check one day's reply or spoken message
//   POST /projects/:key/abandon            stop the active run (it can be started again)
// Definitions and rules: _shared/english-immersion-depth.ts. Progress:
// english_immersion_project_runs. Each checked day is one learning attempt
// (content type immersion.project) so XP, streaks and ratings count it.

import { guardActivity } from "../_shared/english-allowance.ts";
import { grammarTopicFor, topicSubskill } from "../_shared/english-mistakes.ts";
import {
  buildFeedbackPayload,
  calculateAttemptScore,
  type EnglishProductInfo,
  type EnglishServiceKey,
  json,
  recordEvaluatedAttempt,
  resolveOrCreateContentItem,
  toNumber,
  toText,
} from "../_shared/english-learning.ts";
import { callEnglishAIWithCredit, defaultAICreditDeps } from "../_shared/english-ai-quota.ts";
import { applyJudgement, basicReplyCheck, buildJudgeRequest, ownWordCount, type ReplyCheck } from "../_shared/english-immersion.ts";
import {
  applyDayResult,
  canSubmitDay,
  dayExpected,
  learnerDay,
  previousExcerpt,
  type ProjectDayResult,
  type ProjectDef,
  projectByKey,
  type ProjectRun,
  PROJECTS,
  projectState,
  projectSummary,
  readRunDays,
} from "../_shared/english-immersion-depth.ts";
import { loadPersonalTargets, personalResult } from "./personal.ts";

type JsonRecord = Record<string, unknown>;

export type ProjectContext = {
  sb: any;
  req: Request;
  route: string;
  body: JsonRecord;
  userId: string;
  languageId: string;
  productId: string;
  products: Record<EnglishServiceKey, EnglishProductInfo>;
};

const RUN_COLUMNS = "id, project_key, status, days, started_at, completed_at, updated_at";

const toRun = (row: JsonRecord): ProjectRun & { id: string } => ({
  id: String(row.id),
  status: row.status === "completed" ? "completed" : row.status === "abandoned" ? "abandoned" : "active",
  days: readRunDays(row.days),
  started_at: String(row.started_at ?? ""),
  completed_at: row.completed_at ? String(row.completed_at) : null,
});

/** The learner's latest run of each project (active first, else the newest finished one). */
const loadRuns = async (ctx: ProjectContext, key?: string): Promise<Map<string, ProjectRun & { id: string }>> => {
  let query = ctx.sb
    .from("english_immersion_project_runs")
    .select(RUN_COLUMNS)
    .eq("user_id", ctx.userId)
    .eq("language_id", ctx.languageId)
    .neq("status", "abandoned")
    .order("updated_at", { ascending: false })
    .limit(30);
  if (key) query = query.eq("project_key", key);
  const { data, error } = await query;
  if (error) throw new Error(`Failed to load projects: ${error.message}`);
  const out = new Map<string, ProjectRun & { id: string }>();
  for (const row of (data ?? []) as JsonRecord[]) {
    const projectKey = String(row.project_key ?? "");
    const run = toRun(row);
    const current = out.get(projectKey);
    if (!current || (current.status !== "active" && run.status === "active")) out.set(projectKey, run);
  }
  return out;
};

/** A day as the learner sees it; the model answer only once the day is done. */
const publicDay = (project: ProjectDef, dayNumber: number, done: boolean) => {
  const day = project.days.find((entry) => entry.day === dayNumber)!;
  return {
    day: day.day,
    kind: day.kind,
    title: day.title,
    situation: day.situation,
    task: day.task,
    goal: day.goal,
    min_words: day.min_words,
    points: day.points.map((point) => point.label),
    model_answer: done ? day.model_answer : null,
  };
};

const overview = (project: ProjectDef, run: (ProjectRun & { id: string }) | undefined, today: string) => {
  const state = run ? projectState(project, run.days, today) : null;
  return {
    key: project.key,
    title: project.title,
    level: project.level,
    summary: project.summary,
    days: project.days.length,
    status: run?.status ?? "not_started",
    done_days: run ? run.days.length : 0,
    current: state?.current ?? null,
    opens_on: state?.opens_on ?? null,
  };
};

const projectDetail = async (ctx: ProjectContext, project: ProjectDef, run: (ProjectRun & { id: string }) | undefined, today: string) => {
  const state = run ? projectState(project, run.days, today) : null;
  const doneDays = new Set(run?.days.map((entry) => entry.day) ?? []);
  const current = state?.current ?? null;
  return {
    project: {
      key: project.key,
      title: project.title,
      level: project.level,
      summary: project.summary,
      can_do: project.can_do,
      days: project.days.map((day) => publicDay(project, day.day, doneDays.has(day.day))),
    },
    run: run && state
      ? { status: run.status, started_at: run.started_at, completed_at: run.completed_at, state }
      : null,
    previous_excerpt: current && run ? previousExcerpt(run.days, current) : null,
    personal: run && run.status === "active" ? await loadPersonalTargets(ctx.sb, ctx.userId, ctx.languageId) : null,
    summary: run && run.status === "completed" ? projectSummary(project, run.days) : null,
  };
};

const startRun = async (ctx: ProjectContext, project: ProjectDef): Promise<Response> => {
  const runs = await loadRuns(ctx, project.key);
  const existing = runs.get(project.key);
  if (!existing || existing.status !== "active") {
    const { error } = await ctx.sb.from("english_immersion_project_runs").insert({
      user_id: ctx.userId,
      language_id: ctx.languageId,
      project_key: project.key,
      status: "active",
      days: [],
    });
    // A second tab may have started it at the same moment (unique active run): that is fine.
    if (error && !String(error.message ?? "").toLowerCase().includes("duplicate")) {
      return json(500, { error: "Could not start the project." });
    }
  }
  const fresh = (await loadRuns(ctx, project.key)).get(project.key);
  return json(200, await projectDetail(ctx, project, fresh, learnerDay(new Date())));
};

const abandonRun = async (ctx: ProjectContext, project: ProjectDef): Promise<Response> => {
  await ctx.sb
    .from("english_immersion_project_runs")
    .update({ status: "abandoned", updated_at: new Date().toISOString() })
    .eq("user_id", ctx.userId)
    .eq("language_id", ctx.languageId)
    .eq("project_key", project.key)
    .eq("status", "active");
  return json(200, { ok: true });
};

const judgeDay = async (ctx: ProjectContext, project: ProjectDef, dayNumber: number, response: string, situation: string): Promise<ReplyCheck> => {
  const day = project.days.find((entry) => entry.day === dayNumber)!;
  const expected = dayExpected(day);
  const basic = basicReplyCheck({ kind: day.kind, level: project.level, prompt: day.task, response, expected });
  if (ownWordCount(day.task, response) < 3) return basic;
  // One AI credit per checked day (refunded if the call fails); basic check otherwise.
  const ai = await callEnglishAIWithCredit<unknown>(
    defaultAICreditDeps(ctx.sb),
    ctx.userId,
    {
      ...buildJudgeRequest({
        kind: day.kind,
        level: project.level,
        situation,
        stepTitle: `${project.title}, day ${day.day}: ${day.title}`,
        instructions: day.task,
        prompt: day.task,
        response,
        expected,
      }),
      feature: "immersion-project-judge",
      userId: ctx.userId,
    },
    null,
  );
  if (ai.status !== "ok") return basic;
  return applyJudgement({ raw: ai.data, kind: day.kind, level: project.level, prompt: day.task, response, expected }) ?? basic;
};

const submitDay = async (ctx: ProjectContext, project: ProjectDef, dayNumber: number): Promise<Response> => {
  const blocked = await guardActivity(ctx.sb, ctx.userId, ctx.languageId, "immersion", ctx.route);
  if (blocked) return blocked;
  const runs = await loadRuns(ctx, project.key);
  const run = runs.get(project.key);
  if (!run || run.status !== "active") return json(409, { error: "Start the project first.", code: "not_started" });
  const now = new Date();
  const today = learnerDay(now);
  const allowed = canSubmitDay(project, run.days, dayNumber, today);
  if (!allowed.ok) {
    const message = allowed.reason === "tomorrow"
      ? "This day opens tomorrow. Come back then to keep the story going."
      : allowed.reason === "done" ? "You finished this day already." : "Finish the earlier days first.";
    return json(409, { error: message, code: `day_${allowed.reason}` });
  }
  const day = project.days.find((entry) => entry.day === dayNumber)!;
  const response = toText(ctx.body.text, 3000);
  if (!response.trim()) return json(422, { error: "Write or say your answer first.", code: "empty" });
  const mode: "voice" | "typed" = day.kind === "speak" && ctx.body.mode === "voice" ? "voice" : "typed";

  const excerpt = previousExcerpt(run.days, dayNumber);
  const situation = `${project.summary} ${day.situation}${excerpt ? ` Yesterday the learner wrote: "${excerpt}"` : ""}`;
  const wordIds = Array.isArray(ctx.body.your_word_ids) ? (ctx.body.your_word_ids as unknown[]).map(String).slice(0, 5) : [];
  const [check, personal] = await Promise.all([
    judgeDay(ctx, project, dayNumber, response, situation),
    personalResult(ctx.sb, { userId: ctx.userId, languageId: ctx.languageId, wordIds, texts: [response] }),
  ]);

  const result: ProjectDayResult = {
    day: dayNumber,
    score: Math.round(check.score * 100),
    response,
    mode,
    achieved: check.achieved,
    points: check.points,
    corrections: check.corrections,
    summary: check.summary,
    words_used: personal.words_used,
    feedback_mode: check.feedback_mode,
    done_on: today,
    at: now.toISOString(),
  };
  const next = applyDayResult(project, run, result);
  const { error: updateError } = await ctx.sb
    .from("english_immersion_project_runs")
    .update({ days: next.days, status: next.status, completed_at: next.completed_at, updated_at: now.toISOString() })
    .eq("id", run.id)
    .eq("user_id", ctx.userId);
  if (updateError) return json(500, { error: "Could not save your progress. Please try again." });

  // The learning record (XP, streak, ratings, mistakes). Best effort after progress is saved.
  try {
    const contentItem = await resolveOrCreateContentItem(ctx.sb, {
      productId: ctx.productId,
      languageId: ctx.languageId,
      serviceKey: "immersion",
      contentType: "immersion.project",
      sourceRef: `project:${project.key}`,
      title: project.title,
      description: project.summary,
      skillKey: "immersion",
      subskillKeys: ["immersion.transfer", "immersion.communication"],
      cefrLevel: project.level,
      estimatedMinutes: 8,
      learningObjective: project.can_do,
      tags: ["project"],
    });
    const score = calculateAttemptScore({
      correctnessRatio: check.score,
      estimatedMinutes: 8,
      timeSpentSeconds: toNumber(ctx.body.time_spent_seconds),
      hintUsageCount: 0,
      retryCount: 0,
      correctionQualityRatio: check.score,
    });
    const skill = day.kind === "speak" ? "speaking" : "writing";
    const location = `project:${project.key}#day${dayNumber}`;
    const issues: Array<Record<string, unknown>> = [
      ...check.points.filter((point) => !point.met).map((point) => ({
        category: "immersion",
        subskill_key: "immersion.task_completion",
        location_ref: location,
        explanation: `The reply did not ${point.label}.`,
        correction_hint: `Next time, ${point.label}.`,
        severity: 0.55,
      })),
      ...check.corrections.map((correction) => {
        const topic = grammarTopicFor({ original: correction.original, corrected: correction.better, explanation: correction.explanation });
        return {
          category: topic ? "grammar" : skill,
          subskill_key: topic ? topicSubskill(topic) : `${skill}.accuracy`,
          location_ref: location,
          explanation: correction.explanation || `Better: ${correction.better}`,
          correction_hint: `${correction.original} → ${correction.better}`,
          severity: 0.45,
        };
      }),
    ];
    await recordEvaluatedAttempt(ctx.sb, {
      userId: ctx.userId,
      languageId: ctx.languageId,
      productId: ctx.productId,
      serviceKey: "immersion",
      contentItem,
      attemptType: "immersion.project-day",
      responseJson: { project_key: project.key, day: dayNumber, response, mode, points: check.points, corrections: check.corrections },
      metadata: { project_key: project.key, day: dayNumber, feedback_mode: check.feedback_mode },
      timeSpentSeconds: toNumber(ctx.body.time_spent_seconds),
      score,
      feedback: buildFeedbackPayload({ serviceKey: "immersion", score: score.overallScore, title: project.title, reason: day.task, issues: issues.slice(0, 8) }),
      products: ctx.products,
    });
  } catch (error) {
    console.warn(JSON.stringify({ event: "immersion_project_attempt_failed", error: error instanceof Error ? error.message.slice(0, 200) : "unknown" }));
  }

  const state = projectState(project, next.days, today);
  return json(200, {
    ok: true,
    day: {
      ...result,
      tone: check.tone,
      tone_note: check.tone_note,
      word_count: check.word_count,
      min_words: check.min_words,
      too_short: check.too_short,
      model_answer: day.model_answer,
    },
    personal,
    run: { status: next.status, started_at: next.started_at, completed_at: next.completed_at, state },
    summary: next.status === "completed" ? projectSummary(project, next.days) : null,
  });
};

/** Handles /projects routes; null for anything else. */
export const handleProjectRoute = async (ctx: ProjectContext): Promise<Response | null> => {
  const { req, route } = ctx;
  if (route !== "/projects" && !route.startsWith("/projects/")) return null;
  const today = learnerDay(new Date());
  if (req.method === "GET" && route === "/projects") {
    const runs = await loadRuns(ctx);
    return json(200, { projects: PROJECTS.map((project) => overview(project, runs.get(project.key), today)) });
  }
  const match = /^\/projects\/([a-z0-9-]+)(?:\/(start|abandon)|\/days\/(\d+)\/submit)?$/.exec(route);
  const project = match ? projectByKey(match[1]!) : null;
  if (!match || !project) return json(404, { error: "Project not found" });
  if (req.method === "GET" && !match[2] && !match[3]) {
    const runs = await loadRuns(ctx, project.key);
    return json(200, await projectDetail(ctx, project, runs.get(project.key), today));
  }
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });
  if (match[2] === "start") return await startRun(ctx, project);
  if (match[2] === "abandon") return await abandonRun(ctx, project);
  if (match[3]) return await submitDay(ctx, project, Number(match[3]));
  return json(405, { error: "Method not allowed" });
};
