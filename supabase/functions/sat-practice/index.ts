import { AttemptError, ownedAttempt, savedAttemptResult, submitAttempt } from './completion.ts';
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callOpenRouterJsonWithStatus } from "../_shared/sat-ai.ts";
import {
  canonicalDifficulty,
  canonicalDomain,
  canonicalSection,
  expectedPointImpact,
  isObject,
  sectionForDomain,
  toNumber,
  type SatDifficulty,
  type SatDomain,
  type SatSectionType,
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

const normalizeQuestion = (unit: any, answerKey?: any) => {
  const metadata = isObject(unit.metadata) ? unit.metadata : {};
  const rawSection = canonicalSection(metadata.section_type ?? metadata.section ?? metadata.domain);
  const rawDomain = canonicalDomain(metadata.sat_domain ?? metadata.domain, rawSection);
  const section = sectionForDomain(rawDomain) === "math" || rawSection === "math" ? "math" : "reading_writing";
  return {
    id: String(unit.id),
    type: String(unit.type),
    data: isObject(unit.data) ? unit.data : {},
    metadata,
    section_type: section,
    domain: rawDomain,
    difficulty: canonicalDifficulty(metadata.difficulty ?? metadata.difficulty_tier),
    correct: answerKey?.correct ?? null,
  };
};

const loadBankQuestions = async (
  sb: any,
  filters: Partial<{
    section_type: SatSectionType;
    domain: SatDomain;
    difficulty: SatDifficulty;
    question_ids: string[];
    limit: number;
  }> = {},
) => {
  const { data: experiences, error: expError } = await sb
    .from("experiences")
    .select("id, metadata")
    .eq("metadata->>format", "sat_practice_bank")
    .eq("is_active", true);
  if (expError) throw expError;
  const experienceIds = (experiences ?? []).map((row: any) => row.id);
  if (experienceIds.length === 0) return [];

  const { data: sections, error: secError } = await sb
    .from("sections")
    .select("id, experience_id, metadata")
    .in("experience_id", experienceIds);
  if (secError) throw secError;
  const sectionIds = (sections ?? []).map((row: any) => row.id);
  if (sectionIds.length === 0) return [];

  const { data: parts, error: partError } = await sb
    .from("parts")
    .select("id, section_id")
    .in("section_id", sectionIds);
  if (partError) throw partError;
  const partIds = (parts ?? []).map((row: any) => row.id);
  if (partIds.length === 0) return [];

  let unitQuery = sb
    .from("content_units")
    .select("id, part_id, type, data, display_order, metadata")
    .in("part_id", partIds)
    .neq("type", "instruction")
    .order("display_order", { ascending: true })
    .limit(Math.max(1, Math.min(100, filters.limit ?? 30)));

  if (filters.question_ids && filters.question_ids.length > 0) {
    unitQuery = unitQuery.in("id", filters.question_ids);
  }

  const { data: units, error: unitError } = await unitQuery;
  if (unitError) throw unitError;
  const ids = (units ?? []).map((row: any) => row.id);

  const answerById = new Map<string, any>();
  if (ids.length > 0) {
    const { data: keys, error: keyError } = await sb
      .from("answer_keys")
      .select("content_unit_id, correct")
      .in("content_unit_id", ids);
    if (keyError) throw keyError;
    for (const key of keys ?? []) answerById.set(String(key.content_unit_id), key);
  }

  return (units ?? [])
    .map((unit: any) => normalizeQuestion(unit, answerById.get(String(unit.id))))
    .filter((q: any) => !filters.section_type || q.section_type === filters.section_type)
    .filter((q: any) => !filters.domain || q.domain === filters.domain)
    .filter((q: any) => !filters.difficulty || q.difficulty === filters.difficulty);
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
    const impact = expectedPointImpact(domain as SatDomain, entry.accuracy, entry.count);
    conservative += impact.conservative;
    optimistic += impact.optimistic;
  }
  return {
    conservative: Math.min(90, Math.max(0, conservative || 20)),
    optimistic: Math.min(140, Math.max(30, optimistic || 60)),
  };
};

const createSessionForAttempt = async (sb: any, userId: string, metadata: JsonRecord) => {
  const { data: exp, error: expError } = await sb
    .from("experiences")
    .select("id")
    .eq("metadata->>format", "sat_practice_bank")
    .limit(1)
    .maybeSingle();
  if (expError) throw expError;
  if (!exp?.id) return null;
  const { data, error } = await sb
    .from("sessions")
    .insert({
      user_id: userId,
      experience_id: exp.id,
      status: "active",
      started_at: new Date().toISOString(),
      metadata: { mode: "sat_practice_lab", ...metadata },
    })
    .select("id")
    .single();
  if (error) throw error;
  return data?.id ?? null;
};

const getQuestionById = async (sb: any, questionId: string) => {
  const questions = await loadBankQuestions(sb, { question_ids: [questionId], limit: 1 });
  return questions[0] ?? null;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/sat-practice/, "");
    const supabaseUrl = getEnv("SUPABASE_URL");
    const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
    const sb = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
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
      const questions = await loadBankQuestions(sb, {
        section_type: url.searchParams.get("section_type") ? canonicalSection(url.searchParams.get("section_type")) : undefined,
        domain: url.searchParams.get("domain") ? canonicalDomain(url.searchParams.get("domain")) : undefined,
        difficulty: url.searchParams.get("difficulty") ? canonicalDifficulty(url.searchParams.get("difficulty")) : undefined,
        limit: Math.round(toNumber(url.searchParams.get("limit")) ?? 30),
      });
      return json(200, { questions: questions.map(questionForLearner) });
    }

    if (req.method === "POST" && path === "/attempts/start") {
      const body = await readBody(req);
      const questionIds = Array.isArray(body.question_ids) ? body.question_ids.map(String).filter(Boolean) : [];
      const filters = {
        section_type: body.section_type ? canonicalSection(body.section_type) : undefined,
        domain: body.domain ? canonicalDomain(body.domain, body.section_type ? canonicalSection(body.section_type) : undefined) : undefined,
        difficulty: body.difficulty ? canonicalDifficulty(body.difficulty) : undefined,
        question_ids: questionIds.length > 0 ? questionIds : undefined,
        limit: Math.round(toNumber(body.question_count) ?? 10),
      };
      let questions = await loadBankQuestions(sb, filters);
      if (questions.length === 0) questions = await loadBankQuestions(sb, { limit: filters.limit });
      if (questions.length === 0) return json(409, { error: "No practice questions are available. Please try a different filter." });
      const sessionId = await createSessionForAttempt(sb, user.id, { filters });
      const { data, error } = await sb.from("sat_practice_lab_attempts").insert({
        user_id: user.id,
        session_id: sessionId,
        filters_used: filters,
        question_ids: questions.map((q: any) => q.id),
        status: "in_progress",
      }).select("*").single();
      if (error) throw error;
      return json(200, { attempt: data, questions: questions.map(questionForLearner) });
    }

    const attemptMatch = path.match(/^\/attempts\/([0-9a-f-]{36})$/i);
    if (req.method === "GET" && attemptMatch) {
      const attemptId = attemptMatch[1];
      const attempt = await ownedAttempt(sb, user.id, attemptId);
      const saved = await savedAttemptResult(sb, user.id, attempt);
      if (saved) return json(200, saved);
      const questions = await loadBankQuestions(sb, { question_ids: attempt.question_ids ?? [], limit: 100 });
      return json(200, { attempt, questions: attempt.status === "scored" ? questions : questions.map(questionForLearner) });
    }

    if (req.method === "POST" && path === "/attempts/submit") {
      const body = await readBody(req);
      const result = await submitAttempt(sb, user.id, body, ids => loadBankQuestions(sb, { question_ids: ids, limit: 100 }));
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
      const { data: item, error } = await sb.from("sat_practice_mistake_notebook").select("*").eq("id", notebookMatch[1]).eq("user_id", user.id).single();
      if (error) throw error;
      const questions = await loadBankQuestions(sb, {
        section_type: canonicalSection(item.section_type),
        domain: canonicalDomain(item.domain, canonicalSection(item.section_type)),
        difficulty: canonicalDifficulty(item.difficulty),
        limit: 6,
      });
      const sessionId = await createSessionForAttempt(sb, user.id, { retry_notebook_id: item.id });
      const { data: attempt, error: attemptError } = await sb.from("sat_practice_lab_attempts").insert({
        user_id: user.id,
        session_id: sessionId,
        filters_used: { retry_notebook_id: item.id },
        question_ids: questions.map((q: any) => q.id),
        status: "in_progress",
      }).select("*").single();
      if (attemptError) throw attemptError;
      return json(200, { attempt, questions: questions.map(questionForLearner) });
    }

    if (req.method === "GET" && path === "/srs/due") {
      const { data, error } = await sb.from("sat_practice_srs_queue").select("*").eq("user_id", user.id).lte("next_review_at", new Date().toISOString()).order("next_review_at").limit(20);
      if (error) throw error;
      const questions = await loadBankQuestions(sb, { question_ids: (data ?? []).map((row: any) => row.question_id), limit: 30 });
      const byId = new Map<string, any>(questions.map((q: any) => [q.id, questionForLearner(q)]));
      const items = (data ?? []).map((row: any) => ({
        id: row.id,
        section_type: byId.get(row.question_id)?.section_type ?? "reading_writing",
        domain: byId.get(row.question_id)?.domain ?? "grammar",
        difficulty: byId.get(row.question_id)?.difficulty ?? "medium",
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
        question: byId.get(row.question_id) ?? null,
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
    if (req.method === "POST" && tutorMatch) {
      const mode = tutorMatch[1];
      const body = await readBody(req);
      const questionId = String(body.question_id ?? "");
      const question = await getQuestionById(sb, questionId);
      if (!question) return json(404, { error: "Question not found" });
      const fallback = {
        steps: ["Identify the tested concept.", "Eliminate choices that do not match the rule.", "Select the answer that satisfies the prompt."],
        key_concept: question.domain,
        why_distractors_wrong: {},
      };
      const ai = await callOpenRouterJsonWithStatus({
        systemPrompt: "You are a precise SAT tutor. Return strict JSON only. Keep explanations concise and student-friendly.",
        userPayload: JSON.stringify({ mode, question, user_answer: body.user_answer ?? null }),
        temperature: mode === "similar" ? 0.45 : 0.2,
      }, fallback);
      if (mode === "similar" && ai.status === "ok") {
        await sb.from("sat_practice_ai_generated_questions").insert({
          user_id: user.id,
          source_question_id: question.id,
          section_type: question.section_type,
          domain: question.domain,
          difficulty: question.difficulty,
          payload: ai.data,
          generation_cost_cents: 0,
        });
      }
      return json(200, { ok: true, ai_status: ai.status, data: ai.data, error: ai.error });
    }

    return json(404, { error: "Not found", path });
  } catch (err) {
    if (err instanceof AttemptError) return json(err.status, { error: err.message });
    const message = err instanceof Error ? err.message : String(err);
    const status = message === "Unauthorized" ? 401 : 500;
    return json(status, { error: message });
  }
});
