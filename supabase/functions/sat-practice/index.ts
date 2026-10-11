import { bankFilters, loadBankQuestions } from './bank.ts';
import { AttemptError, getAttemptResult, submitAttempt } from './completion.ts';
import { readStartBody, startAttempt } from './start.ts';
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createSatTutorHandler, generateTutorFeedback, type TutorMode } from "./tutor.ts";
import { resolveAiAllowance } from "../_shared/ai-addon.ts";
import { createCoachingCapacityReader } from "../_shared/coaching-capacity.ts";
import {
  canonicalDifficulty,
  canonicalDomain,
  canonicalSection,
  expectedPointImpact,
  isObject,
  toNumber,
} from "../_shared/sat-practice-core.ts";
import { buildSatPracticePlan } from "../_shared/sat-practice-plan-generator.ts";
import { practiceAccess, questionForLearner, SAT_PRACTICE_PRODUCT_ID } from "./access.ts";

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
const configuredTutorLimit = Number(env("SAT_TUTOR_SERVICE_DAILY_LIMIT"));
const tutorServiceLimit = Number.isInteger(configuredTutorLimit) && configuredTutorLimit > 0 && configuredTutorLimit <= 1000000 ? configuredTutorLimit : 0;

const getBearerToken = (req: Request): string => {
  const header = req.headers.get("Authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7) : header;
};

const todayIso = (): string => new Date().toISOString().slice(0, 10);

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
  const [goals, masteryRes, planRes, notebookRes, activityRes] = await Promise.all([
    getOrCreateGoals(sb, userId),
    sb.from("sat_practice_mastery").select("*").eq("user_id", userId),
    sb.from("sat_practice_plan_items").select("*").eq("user_id", userId).eq("scheduled_for", todayIso()).order("created_at"),
    sb.from("sat_practice_mistake_notebook").select("*").eq("user_id", userId).neq("status", "archived").order("created_at", { ascending: false }).limit(20),
    sb.from("sat_practice_daily_activity").select("*").eq("user_id", userId).order("day", { ascending: false }).limit(30),
  ]);
  if (masteryRes.error) throw masteryRes.error;
  if (planRes.error) throw planRes.error;
  if (notebookRes.error) throw notebookRes.error;
  if (activityRes.error) throw activityRes.error;

  const mastery = masteryRes.data ?? [];
  const mastered = mastery.filter((row: any) => ["stable", "mastered"].includes(String(row.mastery_status))).length;
  const masteryPercent = mastery.length > 0 ? Math.round((mastered / mastery.length) * 100) : 0;
  const activityRows = activityRes.data ?? [];
  const weeklyMinutes = activityRows.slice(0, 7).reduce((sum: number, row: any) => sum + Number(row.minutes_studied ?? 0), 0);
  const xpTotal = activityRows.reduce((sum: number, row: any) => sum + Number(row.xp_earned ?? 0), 0);
  const xpWeek = activityRows.slice(0, 7).reduce((sum: number, row: any) => sum + Number(row.xp_earned ?? 0), 0);
  const streakDays = computeStreak(activityRows);
  const scoreImpact = computeScoreImpact(notebookRes.data ?? [], mastery);

  return {
    goals,
    mastery,
    plan_items: planRes.data ?? [],
    notebook: notebookRes.data ?? [],
    activity: {
      streak_days: streakDays,
      weekly_minutes: weeklyMinutes,
      weekly_goal_minutes: Number(goals.hours_per_week ?? 3) * 60,
      xp_total: xpTotal,
      xp_week: xpWeek,
    },
    mastery_percent: masteryPercent,
    score_impact: { ...scoreImpact, label: "Range is an if-mastered estimate, not a guaranteed score gain." },
    plan_stale: false,
  };
};

const computeStreak = (rows: any[]): number => {
  const days = new Set(rows.filter((row) => Number(row.minutes_studied ?? 0) > 0 || Number(row.attempts ?? 0) > 0).map((row) => String(row.day)));
  let streak = 0;
  const cursor = new Date(`${todayIso()}T00:00:00.000Z`);
  while (days.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
};

const computeScoreImpact = (notebook: any[], mastery: any[]) => {
  const byDomain = new Map<string, { count: number; accuracy: number | null }>();
  for (const item of notebook) {
    const domain = canonicalDomain(item.domain, canonicalSection(item.section_type));
    const row = mastery.find((entry: any) => entry.domain === domain);
    const current = byDomain.get(domain) ?? { count: 0, accuracy: toNumber(row?.rolling_accuracy) };
    current.count += 1;
    byDomain.set(domain, current);
  }
  let conservative = 0;
  let optimistic = 0;
  for (const [domain, entry] of byDomain.entries()) {
    const impact = expectedPointImpact(domain as Parameters<typeof expectedPointImpact>[0], entry.accuracy, entry.count);
    conservative += impact.conservative;
    optimistic += impact.optimistic;
  }
  return {
    conservative: Math.min(90, Math.max(0, conservative || 20)),
    optimistic: Math.min(140, Math.max(30, optimistic || 60)),
  };
};

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
      return json(200, { goals: await getOrCreateGoals(sb, user.id) });
    }

    if (req.method === "PATCH" && path === "/goals") {
      const body = await readBody(req);
      const patch = {
        user_id: user.id,
        target_score: Math.max(400, Math.min(1600, Math.round(toNumber(body.target_score) ?? 1400))),
        test_date: typeof body.test_date === "string" && body.test_date ? body.test_date : null,
        hours_per_week: Math.max(1, Math.min(40, Math.round(toNumber(body.hours_per_week) ?? 3))),
        metadata: isObject(body.metadata) ? body.metadata : {},
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await sb.from("sat_practice_user_goals").upsert(patch).select("*").single();
      if (error) throw error;
      return json(200, { ok: true, goals: data });
    }

    if (req.method === "GET" && path === "/dashboard") return json(200, await loadDashboard(sb, user.id));

    if (req.method === "GET" && path === "/insights/mastery") {
      const { data, error } = await sb.from("sat_practice_mastery").select("*").eq("user_id", user.id);
      if (error) throw error;
      return json(200, { mastery: data ?? [] });
    }

    if (req.method === "GET" && path === "/insights/score-impact") {
      const dashboard = await loadDashboard(sb, user.id);
      return json(200, dashboard.score_impact);
    }

    if (req.method === "GET" && path === "/bank") {
      const filters = bankFilters(Object.fromEntries(url.searchParams));
      const questions = await loadBankQuestions(sb, user.id, filters);
      return json(200, { questions: questions.map(questionForLearner) });
    }

    if (req.method === "POST" && path === "/attempts/start") {
      const body = await readStartBody(req);
      const result = await startAttempt(sb, user.id, body);
      return json(200, { ...result, questions: result.questions.map(questionForLearner) });
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
      const { data, error } = await sb.from("sat_practice_mistake_notebook").select("*").eq("user_id", user.id).neq("status", "archived").order("created_at", { ascending: false });
      if (error) throw error;
      return json(200, { items: data ?? [] });
    }

    const notebookMatch = path.match(/^\/notebook\/([0-9a-f-]{36})(?:\/retry)?$/i);
    if (notebookMatch && req.method === "PATCH") {
      const body = await readBody(req);
      const patch: JsonRecord = { updated_at: new Date().toISOString() };
      if (typeof body.reason_tag === "string") patch.reason_tag = body.reason_tag;
      if (typeof body.status === "string") patch.status = body.status;
      if (typeof body.coach_note === "string") patch.coach_note = body.coach_note;
      const { data, error } = await sb.from("sat_practice_mistake_notebook").update(patch).eq("id", notebookMatch[1]).eq("user_id", user.id).select("*").single();
      if (error) throw error;
      return json(200, { item: data });
    }

    if (notebookMatch && req.method === "POST" && path.endsWith("/retry")) {
      const { data: item, error } = await sb.from("sat_practice_mistake_notebook").select("*").eq("id", notebookMatch[1]).eq("user_id", user.id).maybeSingle();
      if (error) throw new AttemptError(503, "Reviews are temporarily unavailable. Please retry.");
      if (!item) throw new AttemptError(404, "Review not found.");
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
      if (error || !Array.isArray(data)) throw new AttemptError(503, "Reviews are temporarily unavailable. Please retry.");
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

    if (req.method === "GET" && path === "/plans/today") {
      const { data, error } = await sb.from("sat_practice_plan_items").select("*").eq("user_id", user.id).eq("scheduled_for", todayIso()).order("created_at");
      if (error) throw error;
      return json(200, { items: data ?? [] });
    }

    if (req.method === "POST" && path === "/plans/regenerate") {
      const goals = await getOrCreateGoals(sb, user.id);
      const { data: masteryRows, error } = await sb.from("sat_practice_mastery").select("*").eq("user_id", user.id);
      if (error) throw error;
      await sb.from("sat_practice_plan_items").delete().eq("user_id", user.id).eq("scheduled_for", todayIso()).in("status", ["pending", "skipped"]);
      const items = buildSatPracticePlan(masteryRows ?? [], {
        targetScore: Number(goals.target_score ?? 1400),
        testDate: goals.test_date ?? null,
        today: todayIso(),
      }).map((item) => ({ ...item, user_id: user.id, status: "pending" }));
      const { data, error: insertError } = await sb.from("sat_practice_plan_items").insert(items).select("*");
      if (insertError) throw insertError;
      return json(200, { ok: true, items: data ?? [] });
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
    if (err instanceof AttemptError) return json(err.status, { error: err.message });
    const message = err instanceof Error ? err.message : String(err);
    const status = message === "Unauthorized" ? 401 : 500;
    return json(status, { error: status === 401 ? "Sign in to continue." : "SAT Practice is temporarily unavailable. Please retry." });
  }
});
