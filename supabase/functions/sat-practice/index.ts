import { loadBankQuestions } from './bank.ts';
import { AttemptError, getAttemptResult, submitAttempt } from './completion.ts';
import { readStartBody, startAttempt, startSelected } from './start.ts';
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createSatTutorHandler, generateTutorFeedback, type TutorMode } from "./tutor.ts";
import { resolveAiAllowance } from "../_shared/ai-addon.ts";
import { createCoachingCapacityReader } from "../_shared/coaching-capacity.ts";
import { canonicalDifficulty, canonicalDomain, canonicalSection, isObject } from "../_shared/sat-practice-core.ts";
import { practiceAccess, questionForLearner, SAT_PRACTICE_PRODUCT_ID } from "./access.ts";
import {
  bankPage, bankQuery, bankSelection, currentWeek, enrichNotebook, generateWeek, hasOfficialFilters, insights, loadCatalog,
  moduleSelection, startPlanItem, todayIso,
} from "./practice.ts";
import { computeStreak, goalsSet, validGoalPatch } from "./goals.ts";

type JsonRecord = Record<string, unknown>;

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
};

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

const getEnv = (key: string): string => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Missing env var: ${key}`);
  return value;
};
const env = (key: string): string => Deno.env.get(key) ?? "";
const tutorCapacity = createCoachingCapacityReader({
  key: env("OPENROUTER_API_KEY"),
  model: env("OPENROUTER_MODEL") || "google/gemma-4-31b-it:free",
  baseUrl: env("OPENROUTER_BASE_URL") || "https://openrouter.ai/api/v1",
});
// The tutor stays off until the coordinator sets SAT_TUTOR_SERVICE_DAILY_LIMIT
// (service-wide requests per UTC day); the app then shows each learner's allowance.
const configuredTutorLimit = Number(env("SAT_TUTOR_SERVICE_DAILY_LIMIT"));
const tutorServiceLimit = Number.isInteger(configuredTutorLimit) && configuredTutorLimit > 0 && configuredTutorLimit <= 1000000 ? configuredTutorLimit : 0;

const getBearerToken = (req: Request): string => {
  const header = req.headers.get("Authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7) : header;
};

const readBody = async (req: Request): Promise<JsonRecord> => {
  try {
    const parsed = await req.json();
    return isObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const assertUser = async (sb: any, token: string): Promise<{ id: string; email: string | null }> => {
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) throw new Error("Unauthorized");
  return { id: data.user.id, email: data.user.email ?? null };
};

const getOrCreateGoals = async (sb: any, userId: string) => {
  const { data } = await sb.from("sat_practice_user_goals").select("*").eq("user_id", userId).maybeSingle();
  if (data) return data;
  const { data: inserted, error } = await sb
    .from("sat_practice_user_goals")
    .insert({ user_id: userId, target_score: 1400, hours_per_week: 3 })
    .select("*")
    .single();
  if (error) throw error;
  return inserted;
};

const loadDashboard = async (sb: any, userId: string) => {
  const [goals, masteryRes, notebookRes, activityRes, entries] = await Promise.all([
    getOrCreateGoals(sb, userId),
    sb.from("sat_practice_mastery").select("*").eq("user_id", userId),
    sb.from("sat_practice_mistake_notebook").select("*").eq("user_id", userId).neq("status", "archived").order("created_at", { ascending: false }).limit(20),
    sb.from("sat_practice_daily_activity").select("*").eq("user_id", userId).order("day", { ascending: false }).limit(30),
    loadCatalog(sb, userId),
  ]);
  if (masteryRes.error) throw masteryRes.error;
  if (notebookRes.error) throw notebookRes.error;
  if (activityRes.error) throw activityRes.error;
  const week = await currentWeek(sb, userId, goals, entries);

  const mastery = masteryRes.data ?? [];
  const mastered = mastery.filter((row: any) => ["stable", "mastered"].includes(String(row.mastery_status))).length;
  const masteryPercent = mastery.length > 0 ? Math.round((mastered / mastery.length) * 100) : null;
  const activityRows = activityRes.data ?? [];
  const weekAgo = new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10);
  const thisWeek = activityRows.filter((row: any) => String(row.day) >= weekAgo);
  const weeklyMinutes = thisWeek.reduce((sum: number, row: any) => sum + Number(row.minutes_studied ?? 0), 0);
  const xpTotal = activityRows.reduce((sum: number, row: any) => sum + Number(row.xp_earned ?? 0), 0);
  const xpWeek = thisWeek.reduce((sum: number, row: any) => sum + Number(row.xp_earned ?? 0), 0);
  const view = insights(entries, mastery);

  return {
    goals,
    goals_set: goalsSet(goals),
    mastery,
    official_mastery: view.official_mastery,
    insights: { domains: view.domains, totals: view.totals },
    plan_items: week.today_items,
    plan_week: { week_start: week.week_start, week_end: week.week_end, progress: week.progress },
    notebook: enrichNotebook(notebookRes.data ?? [], entries),
    activity: {
      streak_days: computeStreak(activityRows, todayIso()),
      weekly_minutes: weeklyMinutes,
      weekly_goal_minutes: Number(goals.hours_per_week ?? 3) * 60,
      weekly_attempts: thisWeek.reduce((sum: number, row: any) => sum + Number(row.attempts ?? 0), 0),
      xp_total: xpTotal,
      xp_week: xpWeek,
    },
    mastery_percent: masteryPercent,
    score_impact: { ...view.score_impact, label: "Rough estimate from your own answers, not an official or guaranteed score." },
    plan_stale: false,
  };
};

const REASON_TAGS = ["concept_gap", "careless", "time_pressure", "misread_wording", "unknown"];
const NOTEBOOK_STATUSES = ["active", "reviewing", "mastered", "archived"];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/sat-practice/, "");
    const supabaseUrl = getEnv("SUPABASE_URL");
    const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
    const sb = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
      global: { fetch: (input, init) => fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(10000) }) },
    });
    const token = getBearerToken(req);
    const user = await assertUser(sb, token);
    const access = await practiceAccess(supabaseUrl, getEnv("SUPABASE_ANON_KEY"), token);
    if (access === "unavailable") return json(503, { error: "Access verification is temporarily unavailable. Please retry.", code: "access_unavailable" });
    if (access === "denied") return json(403, { error: "Premium access required", code: "premium_required", product_id: SAT_PRACTICE_PRODUCT_ID });

    if (req.method === "GET" && path === "/goals") {
      const goals = await getOrCreateGoals(sb, user.id);
      return json(200, { goals, goals_set: goalsSet(goals) });
    }

    if (req.method === "PATCH" && path === "/goals") {
      const current = await getOrCreateGoals(sb, user.id);
      const patch = validGoalPatch(await readBody(req), current, todayIso());
      if ("error" in patch) return json(400, { error: patch.error, code: patch.code });
      const { data, error } = await sb.from("sat_practice_user_goals").upsert({ ...patch.value, user_id: user.id, updated_at: new Date().toISOString() }).select("*").single();
      if (error) throw new AttemptError(503, "Your goal could not be saved. Please retry.", "goal_unavailable");
      // The plan follows the goal immediately; a plan failure never loses the saved goal.
      let planUpdated = true;
      try { await generateWeek(sb, user.id, data); } catch { planUpdated = false; }
      return json(200, { ok: true, goals: data, goals_set: goalsSet(data), plan_updated: planUpdated });
    }

    if (req.method === "GET" && path === "/dashboard") return json(200, await loadDashboard(sb, user.id));

    if (req.method === "GET" && path === "/insights") {
      const [entries, masteryRes] = await Promise.all([loadCatalog(sb, user.id), sb.from("sat_practice_mastery").select("*").eq("user_id", user.id)]);
      if (masteryRes.error) throw masteryRes.error;
      return json(200, insights(entries, masteryRes.data ?? []));
    }

    if (req.method === "GET" && path === "/bank") {
      const query = bankQuery(Object.fromEntries(url.searchParams));
      const entries = await loadCatalog(sb, user.id);
      const { page, facets, total } = bankPage(entries, query);
      const ids = page.map(e => e.id);
      const rows = ids.length ? await loadBankQuestions(sb, user.id, { question_ids: ids, limit: ids.length }) : [];
      const byId = new Map(rows.map((q: any) => [q.id, q]));
      const history = Object.fromEntries(page.map(e => [e.id, e.status]));
      return json(200, { questions: ids.map(id => byId.get(id)).filter(Boolean).map(questionForLearner), total, offset: query.offset, limit: query.limit, facets, history });
    }

    if (req.method === "POST" && path === "/attempts/start") {
      const body = await readStartBody(req);
      if (hasOfficialFilters(body) || body.mode === "bank") {
        const count = Number(body.question_count ?? 10);
        if (!Number.isInteger(count) || count < 1 || count > 30) throw new AttemptError(400, "Choose between 1 and 30 questions.", "invalid_filter");
        const query = bankQuery({ ...body, limit: count, offset: 0 });
        const result = await startSelected(sb, user.id, body, async () => bankSelection(await loadCatalog(sb, user.id), query, count));
        return json(200, { ...result, questions: result.questions.map(questionForLearner), selection: { requested: count, available: result.questions.length } });
      }
      const result = await startAttempt(sb, user.id, body);
      return json(200, { ...result, questions: result.questions.map(questionForLearner) });
    }

    if (req.method === "POST" && path === "/modules/start") {
      const body = await readStartBody(req);
      if (body.section !== "math" && body.section !== "reading_writing") throw new AttemptError(400, "Choose Reading and Writing or Math.", "invalid_request");
      const profile = body.profile === "harder" ? "harder" : "standard";
      let selection: JsonRecord = {};
      const result = await startSelected(sb, user.id, body, async () => {
        const m = moduleSelection(await loadCatalog(sb, user.id), body.section as "math" | "reading_writing", profile);
        selection = { requested: m.build.requested, available: m.ids.length, domains: m.build.domains, time_limit_seconds: m.build.time_limit_seconds };
        return m;
      });
      return json(200, { ...result, questions: result.questions.map(questionForLearner), selection });
    }

    const attemptMatch = path.match(/^\/attempts\/([0-9a-f-]{36})$/i);
    if (req.method === "GET" && attemptMatch) {
      const attemptId = attemptMatch[1];
      const result = await getAttemptResult(sb, user.id, attemptId,
        ids => loadBankQuestions(sb, user.id, { question_ids: ids, limit: 100 }, { includeRetired: true }), questionForLearner);
      return json(200, result);
    }

    if (req.method === "POST" && path === "/attempts/submit") {
      const body = await readBody(req);
      const result = await submitAttempt(sb, user.id, body, ids => loadBankQuestions(sb, user.id, { question_ids: ids, limit: 100 }, { includeRetired: true }));
      return json(200, result);
    }

    if (req.method === "GET" && path === "/notebook") {
      const [{ data, error }, entries] = await Promise.all([
        sb.from("sat_practice_mistake_notebook").select("*").eq("user_id", user.id).neq("status", "archived").order("created_at", { ascending: false }),
        loadCatalog(sb, user.id),
      ]);
      if (error) throw error;
      return json(200, { items: enrichNotebook(data ?? [], entries) });
    }

    const notebookMatch = path.match(/^\/notebook\/([0-9a-f-]{36})(?:\/retry)?$/i);
    if (notebookMatch && req.method === "PATCH") {
      const body = await readBody(req);
      const patch: JsonRecord = { updated_at: new Date().toISOString() };
      if (body.reason_tag !== undefined) {
        if (!REASON_TAGS.includes(String(body.reason_tag))) throw new AttemptError(400, "Invalid reason tag.", "invalid_request");
        patch.reason_tag = body.reason_tag;
      }
      if (body.status !== undefined) {
        if (!NOTEBOOK_STATUSES.includes(String(body.status))) throw new AttemptError(400, "Invalid status.", "invalid_request");
        patch.status = body.status;
      }
      if (body.coach_note !== undefined) {
        if (typeof body.coach_note !== "string" || body.coach_note.length > 1000) throw new AttemptError(400, "Notes can be up to 1000 characters.", "invalid_request");
        patch.coach_note = body.coach_note;
      }
      const { data, error } = await sb.from("sat_practice_mistake_notebook").update(patch).eq("id", notebookMatch[1]).eq("user_id", user.id).select("*").maybeSingle();
      if (error) throw new AttemptError(503, "The notebook could not be updated. Please retry.", "notebook_unavailable");
      if (!data) throw new AttemptError(404, "Review not found.", "not_found");
      return json(200, { item: data });
    }

    if (notebookMatch && req.method === "POST" && path.endsWith("/retry")) {
      const { data: item, error } = await sb.from("sat_practice_mistake_notebook").select("*").eq("id", notebookMatch[1]).eq("user_id", user.id).maybeSingle();
      if (error) throw new AttemptError(503, "Reviews are temporarily unavailable. Please retry.", "reviews_unavailable");
      if (!item) throw new AttemptError(404, "Review not found.", "not_found");
      const result = await startAttempt(sb, user.id, await readStartBody(req), {
        id: item.id,
        section_type: canonicalSection(item.section_type),
        domain: canonicalDomain(item.domain, canonicalSection(item.section_type)),
        difficulty: canonicalDifficulty(item.difficulty),
      });
      return json(200, { ...result, questions: result.questions.map(questionForLearner) });
    }

    if (req.method === "GET" && path === "/srs/due") {
      const { data, error } = await sb.rpc("select_sat_practice_due_questions", { p_user_id: user.id });
      if (error || !Array.isArray(data)) throw new AttemptError(503, "Reviews are temporarily unavailable. Please retry.", "reviews_unavailable");
      const items = data.map((row: any) => ({
        id: row.id,
        section_type: row.question.section_type,
        domain: row.question.domain,
        difficulty: row.question.difficulty,
        source: "practice_lab",
        question_id: row.question_id,
        reason_tag: "unknown",
        mistake_pattern: "Spaced review due",
        coach_note: null,
        status: "active",
        review_count: Number(row.correct_count ?? 0) + Number(row.incorrect_count ?? 0),
        next_review_at: row.next_review_at,
        last_seen_at: row.last_reviewed_at,
        created_at: row.created_at,
        question: questionForLearner(row.question),
      }));
      return json(200, { items });
    }

    if (req.method === "GET" && (path === "/plans/today" || path === "/plans/week")) {
      const goals = await getOrCreateGoals(sb, user.id);
      const week = await currentWeek(sb, user.id, goals);
      // /plans/today keeps its original shape for older app versions.
      return json(200, path === "/plans/today" ? { items: week.today_items } : { ...week, goals_set: goalsSet(goals), goals });
    }

    if (req.method === "POST" && path === "/plans/regenerate") {
      const goals = await getOrCreateGoals(sb, user.id);
      await generateWeek(sb, user.id, goals);
      const week = await currentWeek(sb, user.id, goals);
      return json(200, { ok: true, items: week.today_items, week });
    }

    const planStart = path.match(/^\/plans\/items\/([0-9a-f-]{36})\/start$/i);
    if (req.method === "POST" && planStart) {
      const body = await readStartBody(req);
      const result = await startPlanItem(sb, user.id, planStart[1], body);
      if (result.completed) return json(200, { completed: true, selection: result.selection });
      return json(200, { ...result, questions: (result.questions ?? []).map((q: any) => questionForLearner(q)) });
    }

    const tutorMatch = path.match(/^\/tutor\/(explain|simpler|similar|why-wrong)$/);
    if (["GET", "POST"].includes(req.method) && tutorMatch) {
      return createSatTutorHandler({
        client: sb,
        authenticate: async (checkedToken) => checkedToken === token ? user.id : null,
        allowance: async (checkedToken) => resolveAiAllowance({
          client: sb, base: supabaseUrl, anon: getEnv("SUPABASE_ANON_KEY"),
          addonId: env("AI_ADDON_PRODUCT_ID"), serviceLimit: tutorServiceLimit,
          providerConfigured: (await tutorCapacity()).available,
        }, checkedToken),
        generate: generateTutorFeedback,
        reportProviderFailure: event => console.warn(JSON.stringify({ event: "coaching_provider_failure", ...event })),
      }, user.id, tutorMatch[1] as TutorMode)(req);
    }

    return json(404, { error: "Not found", path });
  } catch (err) {
    if (err instanceof AttemptError) return json(err.status, { error: err.message, ...(err.code ? { code: err.code } : {}) });
    const message = err instanceof Error ? err.message : String(err);
    const status = message === "Unauthorized" ? 401 : 500;
    return json(status, { error: status === 401 ? "Sign in to continue." : "SAT Practice is temporarily unavailable. Please retry.", code: status === 401 ? "unauthorized" : "unavailable" });
  }
});
