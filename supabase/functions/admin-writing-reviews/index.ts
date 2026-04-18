import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authorizeAdminRequest, type AdminRequestContext } from "../_shared/admin-access.ts";

type Json = Record<string, unknown>;

type EvaluationTaskInput = {
  content_unit_id?: string;
  task_type?: string;
  word_count?: number;
  score?: number;
  band?: number;
  feedback?: string;
  actionable_feedback?: string[];
  criteria?: {
    task_completion?: number;
    organization?: number;
    vocabulary?: number;
    grammar?: number;
  };
};

type UpsertRequestBody = {
  action?: "upsert" | "clear";
  session_id?: string;
  evaluation?: {
    overall_score?: number;
    overall_band?: number;
    notes?: string;
    tasks?: EvaluationTaskInput[];
  };
};

type QueueRow = {
  session_id: string;
  session_status: string;
  created_at: string | null;
  completed_at: string | null;
  user_id: string;
  user_email: string | null;
  candidate_name: string | null;
  candidate_email: string | null;
  experience_id: string;
  experience_name: string;
  family: string | null;
  variant: string | null;
  review_status: "awaiting_ai" | "ai_ready" | "overridden";
  ai_score: number | null;
  ai_evaluated_at: string | null;
  admin_score: number | null;
  admin_evaluated_at: string | null;
  preferred_score: number | null;
};

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
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

const asObject = (value: unknown): Json =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};

const readString = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const asFiniteNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const roundNumber = (value: number, precision = 1): number => {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
};

const average = (values: number[]): number | null => {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const toStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.map((item) => readString(item)).filter(Boolean);
};

const extractEvaluationScore = (result: unknown): number | null => {
  const row = asObject(result);
  return (
    asFiniteNumber((row as any).overall_score) ??
    asFiniteNumber((row as any).writing_score) ??
    asFiniteNumber((row as any).overall_band)
  );
};

const normalizeCriteria = (value: unknown): Json => {
  const source = asObject(value);
  const taskCompletion =
    asFiniteNumber((source as any).task_completion) ??
    asFiniteNumber((source as any).taskCompletion) ??
    asFiniteNumber((source as any).task_response) ??
    asFiniteNumber((source as any).TR);
  const organization =
    asFiniteNumber((source as any).organization) ??
    asFiniteNumber((source as any).coherence) ??
    asFiniteNumber((source as any).CC);
  const vocabulary =
    asFiniteNumber((source as any).vocabulary) ??
    asFiniteNumber((source as any).lexical_resource) ??
    asFiniteNumber((source as any).LR);
  const grammar = asFiniteNumber((source as any).grammar) ?? asFiniteNumber((source as any).GRA);

  const normalized: Json = {};
  if (taskCompletion != null) normalized.task_completion = roundNumber(clamp(taskCompletion, 0, 6), 1);
  if (organization != null) normalized.organization = roundNumber(clamp(organization, 0, 6), 1);
  if (vocabulary != null) normalized.vocabulary = roundNumber(clamp(vocabulary, 0, 6), 1);
  if (grammar != null) normalized.grammar = roundNumber(clamp(grammar, 0, 6), 1);
  return normalized;
};

const normalizeManualEvaluation = (
  evaluation: unknown,
  reviewer: Pick<AdminRequestContext, "userId" | "email">,
  reviewedAt: string,
): Json => {
  const source = asObject(evaluation);
  const tasks = Array.isArray((source as any).tasks) ? ((source as any).tasks as unknown[]) : [];

  const normalizedTasks = tasks
    .map((entry) => {
      const task = asObject(entry);
      const score = asFiniteNumber((task as any).score) ?? asFiniteNumber((task as any).band);
      const roundedScore = score != null ? roundNumber(clamp(score, 0, 6), 1) : null;
      return {
        ...(readString((task as any).content_unit_id) ? { content_unit_id: readString((task as any).content_unit_id) } : {}),
        ...(readString((task as any).task_type) ? { task_type: readString((task as any).task_type) } : {}),
        ...(asFiniteNumber((task as any).word_count) != null
          ? { word_count: Math.max(0, Math.floor(asFiniteNumber((task as any).word_count) ?? 0)) }
          : {}),
        ...(roundedScore != null ? { score: roundedScore, band: roundedScore } : {}),
        criteria: normalizeCriteria((task as any).criteria),
        ...(readString((task as any).feedback) ? { feedback: readString((task as any).feedback) } : {}),
        ...(toStringArray((task as any).actionable_feedback).length > 0
          ? { actionable_feedback: toStringArray((task as any).actionable_feedback) }
          : {}),
      };
    })
    .filter((task) => Object.keys(task).length > 0);

  const taskScores = normalizedTasks
    .map((task) => asFiniteNumber((task as any).score) ?? asFiniteNumber((task as any).band))
    .filter((value): value is number => value != null);

  const overall =
    asFiniteNumber((source as any).overall_score) ??
    asFiniteNumber((source as any).overall_band) ??
    average(taskScores);
  const roundedOverall = overall != null ? roundNumber(clamp(overall, 0, 6), 1) : null;

  return {
    overall_score: roundedOverall,
    overall_band: roundedOverall,
    notes: readString((source as any).notes),
    tasks: normalizedTasks,
    rubric: "itep",
    score_version: "itep-writing-estimate-v1",
    reviewed_at: reviewedAt,
    reviewer: {
      user_id: reviewer.userId,
      email: reviewer.email,
    },
  };
};

const resolveProductId = async (sb: any, productSlug: string): Promise<string | null> => {
  const { data, error } = await sb
    .from("products")
    .select("id")
    .eq("metadata->>slug", productSlug)
    .maybeSingle();
  if (error) throw error;
  return data?.id ? String(data.id) : null;
};

const loadWritingExperienceMap = async (sb: any, productId: string): Promise<Map<string, any>> => {
  const { data: experiences, error: experienceError } = await sb
    .from("experiences")
    .select("id, name, product_id, metadata")
    .eq("product_id", productId);
  if (experienceError) throw experienceError;

  const rows = (experiences ?? []) as any[];
  const experienceIds = rows.map((row) => String(row.id)).filter(Boolean);
  if (experienceIds.length === 0) return new Map<string, any>();

  const { data: sections, error: sectionError } = await sb
    .from("sections")
    .select("id, experience_id")
    .in("experience_id", experienceIds)
    .filter("metadata->>type", "eq", "writing");
  if (sectionError) throw sectionError;

  const writingExperienceIds = new Set(
    (sections ?? []).map((row: any) => String(row.experience_id)).filter(Boolean),
  );

  const out = new Map<string, any>();
  for (const row of rows) {
    const experienceId = String(row.id ?? "");
    if (!experienceId || !writingExperienceIds.has(experienceId)) continue;
    out.set(experienceId, row);
  }
  return out;
};

const sessionReviewStatus = (evaluationRows: any[]): "awaiting_ai" | "ai_ready" | "overridden" => {
  const hasAdmin = evaluationRows.some((row) => ["admin", "manual"].includes(String(row.method ?? "").toLowerCase()));
  if (hasAdmin) return "overridden";
  const hasAi = evaluationRows.some((row) => String(row.method ?? "").toLowerCase() === "ai");
  return hasAi ? "ai_ready" : "awaiting_ai";
};

const listQueue = async (sb: any, url: URL, productId: string) => {
  const familyFilter = readString(url.searchParams.get("family")).toLowerCase();
  const variantFilter = readString(url.searchParams.get("variant")).toLowerCase();
  const reviewStatusFilter = readString(url.searchParams.get("review_status")).toLowerCase();
  const query = readString(url.searchParams.get("q")).toLowerCase();
  const includeIncomplete = url.searchParams.get("include_incomplete") === "true";
  const limit = clamp(Math.floor(asFiniteNumber(url.searchParams.get("limit")) ?? 100), 1, 250);

  const experienceMap = await loadWritingExperienceMap(sb, productId);
  const experienceIds = Array.from(experienceMap.keys());
  if (experienceIds.length === 0) return json(200, { rows: [] });

  let sessionQuery = sb
    .from("sessions")
    .select("id, user_id, experience_id, status, metadata, created_at, completed_at")
    .in("experience_id", experienceIds)
    .order("completed_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!includeIncomplete) {
    sessionQuery = sessionQuery.eq("status", "completed");
  }

  const { data: sessions, error: sessionError } = await sessionQuery;
  if (sessionError) return json(500, { error: "Failed to load writing sessions", detail: sessionError.message });

  const sessionRows = (sessions ?? []) as any[];
  const sessionIds = sessionRows.map((row) => String(row.id)).filter(Boolean);
  const userIds = Array.from(new Set(sessionRows.map((row) => String(row.user_id ?? "")).filter(Boolean)));

  const userMap = new Map<string, { email: string | null }>();
  if (userIds.length > 0) {
    const { data: users, error: userError } = await sb.from("users").select("id, email").in("id", userIds);
    if (userError) return json(500, { error: "Failed to load session owners", detail: userError.message });
    for (const row of users ?? []) {
      userMap.set(String((row as any).id), { email: (row as any).email ?? null });
    }
  }

  const registrationMap = new Map<string, { candidate_name: string | null; email: string | null }>();
  if (sessionIds.length > 0) {
    const { data: registrations, error: registrationError } = await sb
      .from("exam_registrations")
      .select("session_id, first_name, last_name, legal_name, email")
      .in("session_id", sessionIds);
    if (registrationError) {
      return json(500, { error: "Failed to load candidate registrations", detail: registrationError.message });
    }
    for (const row of registrations ?? []) {
      const legalName = readString((row as any).legal_name);
      const firstName = readString((row as any).first_name);
      const lastName = readString((row as any).last_name);
      registrationMap.set(String((row as any).session_id), {
        candidate_name: legalName || `${firstName} ${lastName}`.trim() || null,
        email: readString((row as any).email) || null,
      });
    }
  }

  const evaluationsBySession = new Map<string, any[]>();
  if (sessionIds.length > 0) {
    const { data: evaluations, error: evaluationError } = await sb
      .from("evaluations")
      .select("id, session_id, method, status, result, evaluated_at")
      .in("session_id", sessionIds)
      .in("method", ["admin", "manual", "ai"])
      .order("evaluated_at", { ascending: false });
    if (evaluationError) return json(500, { error: "Failed to load evaluations", detail: evaluationError.message });
    for (const row of evaluations ?? []) {
      const sessionId = String((row as any).session_id ?? "");
      if (!sessionId) continue;
      const list = evaluationsBySession.get(sessionId);
      if (list) list.push(row);
      else evaluationsBySession.set(sessionId, [row]);
    }
  }

  const rows = sessionRows
    .reduce<QueueRow[]>((acc, sessionRow) => {
      const sessionId = String(sessionRow.id ?? "");
      const experience = experienceMap.get(String(sessionRow.experience_id ?? ""));
      if (!experience) return acc;
      const experienceMeta = asObject((experience as any).metadata);
      const family = readString((experienceMeta as any).family).toLowerCase() || null;
      const variant = readString((experienceMeta as any).variant).toLowerCase() || null;
      const evaluationRows = evaluationsBySession.get(sessionId) ?? [];
      const adminEval =
        evaluationRows.find((row) => ["admin", "manual"].includes(String((row as any).method ?? "").toLowerCase())) ??
        null;
      const aiEval =
        evaluationRows.find((row) => String((row as any).method ?? "").toLowerCase() === "ai") ?? null;
      const registration = registrationMap.get(sessionId) ?? null;
      const owner = userMap.get(String(sessionRow.user_id ?? "")) ?? null;
      const candidateName = registration?.candidate_name ?? null;
      const candidateEmail = registration?.email ?? owner?.email ?? null;
      const reviewStatus = sessionReviewStatus(evaluationRows);

      acc.push({
        session_id: sessionId,
        session_status: String(sessionRow.status ?? ""),
        created_at: sessionRow.created_at ?? null,
        completed_at: sessionRow.completed_at ?? null,
        user_id: String(sessionRow.user_id ?? ""),
        user_email: owner?.email ?? null,
        candidate_name: candidateName,
        candidate_email: candidateEmail,
        experience_id: String((experience as any).id ?? ""),
        experience_name: String((experience as any).name ?? ""),
        family,
        variant,
        review_status: reviewStatus,
        ai_score: extractEvaluationScore((aiEval as any)?.result),
        ai_evaluated_at: (aiEval as any)?.evaluated_at ?? null,
        admin_score: extractEvaluationScore((adminEval as any)?.result),
        admin_evaluated_at: (adminEval as any)?.evaluated_at ?? null,
        preferred_score: extractEvaluationScore((adminEval as any)?.result) ?? extractEvaluationScore((aiEval as any)?.result),
      });
      return acc;
    }, [])
    .filter((row) => {
      if (familyFilter && familyFilter !== "all" && String(row.family ?? "") !== familyFilter) return false;
      if (variantFilter && variantFilter !== "all" && String(row.variant ?? "") !== variantFilter) return false;
      if (reviewStatusFilter && reviewStatusFilter !== "all" && String(row.review_status ?? "") !== reviewStatusFilter) {
        return false;
      }
      if (!query) return true;
      const haystack = [
        row.session_id,
        row.candidate_name,
        row.candidate_email,
        row.user_email,
        row.experience_name,
        row.family,
        row.variant,
      ]
        .map((value) => String(value ?? "").toLowerCase())
        .join(" ");
      return haystack.includes(query);
    });

  return json(200, { rows });
};

const loadSessionDetail = async (sb: any, sessionId: string, productId: string) => {
  const experienceMap = await loadWritingExperienceMap(sb, productId);

  const { data: sessionRow, error: sessionError } = await sb
    .from("sessions")
    .select("id, user_id, experience_id, status, metadata, created_at, completed_at")
    .eq("id", sessionId)
    .maybeSingle();
  if (sessionError) return json(500, { error: "Failed to load session", detail: sessionError.message });
  if (!sessionRow) return json(404, { error: "Session not found" });

  const experience = experienceMap.get(String((sessionRow as any).experience_id ?? ""));
  if (!experience) return json(404, { error: "iTEP writing session not found" });

  const { data: ownerRow, error: ownerError } = await sb
    .from("users")
    .select("id, email, role")
    .eq("id", String((sessionRow as any).user_id ?? ""))
    .maybeSingle();
  if (ownerError) return json(500, { error: "Failed to load session owner", detail: ownerError.message });

  const { data: registrations, error: registrationError } = await sb
    .from("exam_registrations")
    .select("session_id, first_name, last_name, legal_name, email")
    .eq("session_id", sessionId)
    .limit(1);
  if (registrationError) {
    return json(500, { error: "Failed to load candidate registration", detail: registrationError.message });
  }

  const { data: evaluations, error: evaluationError } = await sb
    .from("evaluations")
    .select("id, session_id, method, status, result, evaluated_at, created_at")
    .eq("session_id", sessionId)
    .in("method", ["admin", "manual", "ai"])
    .order("evaluated_at", { ascending: false });
  if (evaluationError) return json(500, { error: "Failed to load evaluations", detail: evaluationError.message });

  const registration = ((registrations ?? [])[0] ?? null) as any;
  const experienceMeta = asObject((experience as any).metadata);
  const legalName = readString(registration?.legal_name);
  const firstName = readString(registration?.first_name);
  const lastName = readString(registration?.last_name);

  return json(200, {
    session: sessionRow,
    experience,
    candidate: {
      name: legalName || `${firstName} ${lastName}`.trim() || null,
      email: readString(registration?.email) || (ownerRow?.email ?? null),
      user_email: ownerRow?.email ?? null,
      role: ownerRow?.role ?? null,
    },
    family: readString((experienceMeta as any).family).toLowerCase() || null,
    variant: readString((experienceMeta as any).variant).toLowerCase() || null,
    review_status: sessionReviewStatus((evaluations ?? []) as any[]),
    evaluations: evaluations ?? [],
  });
};

const refreshScore = async (req: Request, sessionId: string): Promise<{ result: unknown | null; warning: string | null }> => {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return { result: null, warning: "Missing authorization header for score refresh." };

  const url = new URL(req.url);
  const candidates = ["score-session-v2", "score-session"];
  let lastWarning = "Score refresh is unavailable.";

  for (const candidate of candidates) {
    const refreshUrl = new URL(`/functions/v1/${candidate}`, `${url.protocol}//${url.host}`);
    const response = await fetch(refreshUrl, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ session_id: sessionId, method: "auto" }),
    });

    if (response.ok) {
      try {
        return { result: await response.json(), warning: null };
      } catch {
        return { result: null, warning: null };
      }
    }

    const details = await response.text().catch(() => "");
    lastWarning = `${candidate} refresh failed (${response.status})${details ? `: ${details}` : ""}`;
  }

  return { result: null, warning: lastWarning };
};

const upsertEvaluation = async (
  sb: any,
  req: Request,
  context: AdminRequestContext,
  productId: string,
  body: UpsertRequestBody,
) => {
  const sessionId = readString(body.session_id);
  if (!sessionId) return json(400, { error: "session_id is required" });

  const detailResponse = await loadSessionDetail(sb, sessionId, productId);
  if (detailResponse.status !== 200) return detailResponse;

  const detailBody = await detailResponse.clone().json().catch(() => null);
  const sessionStatus = String((detailBody as any)?.session?.status ?? "").toLowerCase();
  if (sessionStatus !== "completed") {
    return json(409, { error: "Session must be completed before review." });
  }

  if (body.action === "clear" || req.method === "DELETE") {
    const { error: deleteError } = await sb
      .from("evaluations")
      .delete()
      .eq("session_id", sessionId)
      .in("method", ["admin", "manual"]);
    if (deleteError) return json(500, { error: "Failed to clear override", detail: deleteError.message });

    const refreshed = await refreshScore(req, sessionId);
    return json(200, {
      ok: true,
      action: "clear",
      session_id: sessionId,
      score_result: refreshed.result,
      score_refresh_warning: refreshed.warning,
    });
  }

  const reviewedAt = new Date().toISOString();
  const result = normalizeManualEvaluation(body.evaluation ?? {}, context, reviewedAt);

  const { data: evaluationRow, error: evaluationError } = await sb
    .from("evaluations")
    .upsert(
      {
        session_id: sessionId,
        method: "admin",
        status: "completed",
        result,
        evaluated_at: reviewedAt,
      },
      { onConflict: "session_id,method" },
    )
    .select("id, session_id, method, status, result, evaluated_at, created_at")
    .maybeSingle();

  if (evaluationError) {
    return json(500, { error: "Failed to save override", detail: evaluationError.message });
  }

  const refreshed = await refreshScore(req, sessionId);

  return json(200, {
    ok: true,
    action: "upsert",
    evaluation: evaluationRow,
    score_result: refreshed.result,
    score_refresh_warning: refreshed.warning,
  });
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = getEnv("SUPABASE_URL");
    const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
    const sb = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    const authz = await authorizeAdminRequest(sb, req, corsHeaders, {
      requiredPermission: "admin.tests.manage",
      action: "admin.writing_reviews",
      rateLimitKey: "admin-writing-reviews",
    });
    if (!authz.ok) return authz.response;

    const url = new URL(req.url);
    const productSlug = readString(url.searchParams.get("product_slug")) || "itep-simulator";
    const productId = await resolveProductId(sb, productSlug);
    if (!productId) return json(404, { error: "Product not found" });

    if (req.method === "GET") {
      const sessionId = readString(url.searchParams.get("session_id"));
      if (sessionId) return await loadSessionDetail(sb, sessionId, productId);
      return await listQueue(sb, url, productId);
    }

    if (req.method === "POST") {
      const body = (await req.json().catch(() => ({}))) as UpsertRequestBody;
      return await upsertEvaluation(sb, req, authz.context, productId, body);
    }

    if (req.method === "DELETE") {
      const sessionId = readString(url.searchParams.get("session_id"));
      return await upsertEvaluation(sb, req, authz.context, productId, { action: "clear", session_id: sessionId });
    }

    return json(405, { error: "Method not allowed" });
  } catch (error) {
    console.error("admin-writing-reviews failed", error);
    return json(500, { error: error instanceof Error ? error.message : "Unexpected error" });
  }
});
