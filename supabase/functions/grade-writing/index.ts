import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { signStorageRef } from "../_shared/media-storage.ts";

type Json = Record<string, unknown>;

type GradeWritingInput = {
  session_id: string;
  force?: boolean;
};

type WritingTask = {
  content_unit_id: string;
  part_id: string;
  task_type?: string | null;
  prompt: string;
  min_words?: number | null;
  max_words?: number | null;
  answer_text: string;
  word_count: number;
  image_url?: string | null;
};

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SIGNED_URL_TTL_SECONDS = 60 * 60 * 6;

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

const jsonError = (
  status: number,
  error: string,
  code?: string,
  extra?: Record<string, unknown>,
): Response =>
  json(status, { ...(code ? { code } : {}), error, ...(extra ?? {}) });

const getEnv = (key: string): string | null => {
  const value = Deno.env.get(key);
  return value && value.trim().length > 0 ? value : null;
};

const getBearerToken = (req: Request): string | null => {
  const header = req.headers.get("Authorization") ?? "";
  if (!header) return null;
  return header.startsWith("Bearer ") ? header.slice(7) : header;
};

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

const isActiveEntitlement = (row: { starts_at: string | null; ends_at: string | null; is_active: boolean }): boolean => {
  if (!row.is_active) return false;
  const now = Date.now();
  const startsAt = row.starts_at ? Date.parse(row.starts_at) : null;
  const endsAt = row.ends_at ? Date.parse(row.ends_at) : null;
  if (startsAt && now < startsAt) return false;
  if (endsAt && now > endsAt) return false;
  return true;
};

const validateTokenSession = async (
  sb: any,
  tokenId: string,
  userId: string,
  experienceId: string,
): Promise<{ ok: boolean; reason?: string }> => {
  const { data: tokenRow, error } = await sb
    .from("exam_tokens")
    .select("id, status, expires_at, claimed_by, experience_id")
    .eq("id", tokenId)
    .maybeSingle();

  if (error || !tokenRow) return { ok: false, reason: "Invalid candidate session" };
  const token = tokenRow as any;
  if (String(token.experience_id) !== String(experienceId)) return { ok: false, reason: "Session mismatch" };
  if (String(token.claimed_by ?? "") !== String(userId)) return { ok: false, reason: "Unauthorized" };
  if (String(token.status) !== "claimed") return { ok: false, reason: "Candidate session is not active" };

  return { ok: true };
};

const extractLimits = (value: unknown): Record<string, number> => {
  if (!isObject(value)) return {};
  const raw = (value as any).limits;
  if (!isObject(raw)) return {};
  const out: Record<string, number> = {};
  for (const [key, val] of Object.entries(raw)) {
    const num = typeof val === "number" ? val : Number(val);
    if (Number.isFinite(num) && num > 0) out[String(key)] = Math.floor(num);
  }
  return out;
};

const monthWindow = (now = new Date()): { start: string; end: string } => {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
};

const extractText = (v: unknown): string => {
  if (typeof v === "string") return v;
  if (isObject(v) && typeof (v as any).text === "string") return String((v as any).text);
  if (isObject(v) && typeof (v as any).answer === "string") return String((v as any).answer);
  return "";
};

const countWords = (text: string): number => {
  const t = String(text ?? "").trim();
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
};

const inferTaskType = (index: number): string | null => {
  if (index === 0) return "task1";
  if (index === 1) return "task2";
  return null;
};

const inferTaskMinWords = (taskType: string | null): number | null => {
  if (taskType === "task1") return 150;
  if (taskType === "task2") return 250;
  return null;
};

const findFirstJsonObject = (raw: string): Json | null => {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as unknown;
    return isObject(parsed) ? (parsed as Json) : null;
  } catch {
    return null;
  }
};

const extractAssistantText = (content: unknown): string => {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((chunk) => {
      if (typeof chunk === "string") return chunk;
      if (isObject(chunk) && typeof (chunk as any).text === "string") return String((chunk as any).text);
      return "";
    })
    .join("\n")
    .trim();
};

const sanitizeProviderError = (value: unknown, maxLen = 280): string => {
  const message = typeof value === "string" ? value : value instanceof Error ? value.message : String(value ?? "");
  return message.replace(/\s+/g, " ").trim().slice(0, maxLen);
};

const asFiniteNumber = (value: unknown): number | null => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const average = (values: number[]): number | null => {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

type WritingEvaluationProfileKey = "ielts" | "itep";

type WritingEvaluationProfile = {
  key: WritingEvaluationProfileKey;
  defaultAppName: string;
  systemInstruction: string;
  outputSchema: Json;
};

const roundNumber = (value: number, precision = 1): number => {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
};

const resolveWritingEvaluationProfile = (productSlug: string): WritingEvaluationProfile => {
  if (productSlug === "itep-simulator") {
    return {
      key: "itep",
      defaultAppName: "Schood iTEP",
      systemInstruction: [
        "You are a Senior iTEP Writing Evaluator.",
        "Grade STRICTLY using an iTEP-style writing rubric on a 0.0-6.0 scale.",
        "For each task, score: task_completion, organization, vocabulary, and grammar.",
        "Use one decimal place when needed.",
        "Weight the criteria evenly when deciding each task score.",
        "When task_type is task1 and an image is provided, analyze the visual before grading.",
        "Be clinical, consistent, and exam-standard. Do not be lenient.",
        "Return ONLY valid JSON with no markdown and no extra prose.",
      ].join(" "),
      outputSchema: {
        overall_score: 0,
        overall_band: 0,
        tasks: [
          {
            content_unit_id: "uuid",
            task_type: "task1|task2|essay|opinion|null",
            word_count: 0,
            score: 0,
            band: 0,
            criteria: {
              task_completion: 0,
              organization: 0,
              vocabulary: 0,
              grammar: 0,
            },
            strengths: ["short bullet"],
            improvements: ["short bullet"],
            actionable_feedback: ["concrete action"],
            feedback: "short paragraph",
          },
        ],
        notes: "short paragraph",
      },
    };
  }

  return {
    key: "ielts",
    defaultAppName: "Schood IELTS",
    systemInstruction: [
      "You are a Senior IELTS Writing Examiner.",
      "Grade STRICTLY using IELTS Academic Writing band descriptors on a 0.0-9.0 scale.",
      "For each task, score: Task Response (TR), Coherence and Cohesion (CC), Lexical Resource (LR), Grammatical Range and Accuracy (GRA).",
      "Use 0.5 band increments only.",
      "When task_type is task1 and an image is provided, analyze the chart/diagram before grading.",
      "Be clinical and exam-standard. Do not be lenient.",
      "Return ONLY valid JSON with no markdown and no extra prose.",
    ].join(" "),
    outputSchema: {
      overall_band: 0,
      tasks: [
        {
          content_unit_id: "uuid",
          task_type: "task1|task2|null",
          word_count: 0,
          band: 0,
          criteria: { TR: 0, CC: 0, LR: 0, GRA: 0 },
          strengths: ["short bullet"],
          improvements: ["short bullet"],
          actionable_feedback: ["concrete action"],
          feedback: "short paragraph",
        },
      ],
      notes: "short paragraph",
    },
  };
};

const normalizeItepCriteria = (criteriaValue: unknown): Json => {
  const criteria = isObject(criteriaValue) ? (criteriaValue as Json) : {};
  const normalized: Record<string, number> = {};
  const taskCompletion =
    asFiniteNumber((criteria as any).task_completion) ??
    asFiniteNumber((criteria as any).taskCompletion) ??
    asFiniteNumber((criteria as any).task_response) ??
    asFiniteNumber((criteria as any).TR);
  const organization =
    asFiniteNumber((criteria as any).organization) ??
    asFiniteNumber((criteria as any).coherence) ??
    asFiniteNumber((criteria as any).CC);
  const vocabulary =
    asFiniteNumber((criteria as any).vocabulary) ??
    asFiniteNumber((criteria as any).lexical_resource) ??
    asFiniteNumber((criteria as any).LR);
  const grammar =
    asFiniteNumber((criteria as any).grammar) ??
    asFiniteNumber((criteria as any).GRA);

  if (taskCompletion != null) normalized.task_completion = roundNumber(taskCompletion, 1);
  if (organization != null) normalized.organization = roundNumber(organization, 1);
  if (vocabulary != null) normalized.vocabulary = roundNumber(vocabulary, 1);
  if (grammar != null) normalized.grammar = roundNumber(grammar, 1);

  return { ...(criteria as Json), ...normalized };
};

const normalizeWritingEvaluationResult = (rawResult: Json, profileKey: WritingEvaluationProfileKey): Json => {
  if (profileKey !== "itep") {
    return {
      ...rawResult,
      rubric: "ielts",
      score_version: (rawResult as any)?.score_version ?? "ielts-writing-estimate-v1",
    };
  }

  const tasks = Array.isArray((rawResult as any)?.tasks)
    ? ((rawResult as any).tasks as unknown[])
        .filter((entry) => isObject(entry))
        .map((entry) => {
          const task = entry as Json;
          const score = asFiniteNumber((task as any).score) ?? asFiniteNumber((task as any).band);
          return {
            ...task,
            ...(score != null ? { score: roundNumber(score, 1), band: roundNumber(score, 1) } : {}),
            criteria: normalizeItepCriteria((task as any).criteria),
          };
        })
    : [];

  const taskScores = tasks
    .map((task) => asFiniteNumber((task as any).score) ?? asFiniteNumber((task as any).band))
    .filter((value): value is number => value != null);
  const overallScore =
    asFiniteNumber((rawResult as any).overall_score) ??
    asFiniteNumber((rawResult as any).overall_band) ??
    average(taskScores);
  const roundedOverall = overallScore != null ? roundNumber(overallScore, 1) : null;

  return {
    ...rawResult,
    overall_score: roundedOverall,
    overall_band: roundedOverall,
    tasks,
    rubric: "itep",
    score_version: "itep-writing-estimate-v1",
  };
};

const parseModelList = (raw: string | null | undefined): string[] =>
  String(raw ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);

const createSignedUrlFromStorage = async (
  sb: any,
  storage: unknown,
  context?: { requestId?: string; userId?: string },
): Promise<string | null> => {
  return await signStorageRef(sb, storage, SIGNED_URL_TTL_SECONDS, {
    requestId: context?.requestId,
    route: "/functions/v1/grade-writing",
    userId: context?.userId,
  });
};

const resolveImageUrl = async (
  sb: any,
  data: unknown,
  context?: { requestId?: string; userId?: string },
): Promise<string | null> => {
  if (!isObject(data)) return null;
  const d = data as any;
  if (typeof d.url === "string" && d.url.trim().length > 0) return d.url.trim();
  if (isObject(d.image) && typeof d.image.url === "string" && d.image.url.trim().length > 0) {
    return d.image.url.trim();
  }
  const directSigned = await createSignedUrlFromStorage(sb, d.storage, context);
  if (directSigned) return directSigned;
  const nestedSigned = await createSignedUrlFromStorage(sb, d.image?.storage, context);
  if (nestedSigned) return nestedSigned;
  return null;
};

const callOpenRouterJson = async (
  apiKey: string,
  model: string,
  tasks: WritingTask[],
  profile: WritingEvaluationProfile,
  opts?: { baseUrl?: string | null; appName?: string | null; referer?: string | null; requestId?: string | null },
): Promise<Json> => {
  const baseUrl = (opts?.baseUrl ?? "https://openrouter.ai/api/v1").replace(/\/+$/, "");
  const endpoint = `${baseUrl}/chat/completions`;

  const systemInstruction = profile.systemInstruction;

  const userPayload = {
    tasks: tasks.map((t) => ({
      content_unit_id: t.content_unit_id,
      task_type: t.task_type ?? null,
      prompt: t.prompt,
      min_words: t.min_words ?? null,
      max_words: t.max_words ?? null,
      answer_text: t.answer_text,
      word_count: t.word_count,
      has_image: Boolean(t.image_url),
    })),
    output_schema: profile.outputSchema,
  };

  const buildUserContent = (includeImages: boolean): Array<Record<string, unknown>> => {
    const content: Array<Record<string, unknown>> = [{ type: "text", text: JSON.stringify(userPayload) }];
    if (!includeImages) return content;
    for (const task of tasks) {
      if (!task.image_url) continue;
      content.push({
        type: "text",
        text: `Reference visual for ${task.task_type ?? "writing task"} (${task.content_unit_id}). Analyze this before grading.`,
      });
      content.push({
        type: "image_url",
        image_url: { url: task.image_url },
      });
    }
    return content;
  };

  const createBody = (includeImages: boolean): Record<string, unknown> => ({
    model,
    temperature: 0.2,
    max_tokens: 1200,
    messages: [
      { role: "system", content: systemInstruction },
      { role: "user", content: buildUserContent(includeImages) },
    ],
    response_format: { type: "json_object" },
  });

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  if (opts?.appName && opts.appName.trim().length > 0) headers["X-Title"] = opts.appName.trim();
  if (opts?.referer && opts.referer.trim().length > 0) headers["HTTP-Referer"] = opts.referer.trim();

  const parseResponse = async (res: Response): Promise<{ ok: boolean; payload: any; text: string }> => {
    const text = await res.text();
    let payload: any = null;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
    return { ok: res.ok, payload, text };
  };

  const execute = async (reqBody: Record<string, unknown>): Promise<Json> => {
    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(reqBody),
    });
    const parsed = await parseResponse(res);
    if (!parsed.ok) {
      const msg =
        String(parsed.payload?.error?.message ?? parsed.payload?.message ?? "").trim() ||
        parsed.text.slice(0, 300) ||
        "OpenRouter error";
      const err = new Error(`OpenRouter ${res.status}: ${msg}`);
      (err as any).status = res.status;
      throw err;
    }
    const parsedObject = parsed.payload?.choices?.[0]?.message?.parsed;
    if (isObject(parsedObject)) return parsedObject as Json;
    const content = extractAssistantText(parsed.payload?.choices?.[0]?.message?.content);
    const obj = findFirstJsonObject(content);
    if (!obj) throw new Error("Failed to parse JSON from model output");
    return obj;
  };

  const hasImages = tasks.some((task) => Boolean(task.image_url));
  const isLikelyImageSupportError = (message: string): boolean =>
    /image|image_url|vision|multimodal|could not fetch|unsupported/i.test(message);

  try {
    return await execute(createBody(true));
  } catch (e) {
    const message = e instanceof Error ? e.message : "OpenRouter error";
    // Retry once without JSON mode if provider/model doesn't support response_format.
    if (/response_format|json_object|unsupported/i.test(message)) {
      console.warn("grade-writing: retrying without JSON mode", {
        request_id: opts?.requestId ?? null,
        model,
        message: sanitizeProviderError(message),
      });
      const noJsonMode = createBody(true);
      delete noJsonMode.response_format;
      return await execute(noJsonMode);
    }
    // Some models/providers reject image_url payload. Retry text-only.
    if (hasImages && isLikelyImageSupportError(message)) {
      console.warn("grade-writing: retrying without image payload", {
        request_id: opts?.requestId ?? null,
        model,
        message: sanitizeProviderError(message),
      });
      return await execute(createBody(false));
    }
    throw e;
  }
};

const callOpenRouterJsonWithFallback = async (
  apiKey: string,
  models: string[],
  tasks: WritingTask[],
  profile: WritingEvaluationProfile,
  opts?: { baseUrl?: string | null; appName?: string | null; referer?: string | null; requestId?: string | null },
): Promise<{ result: Json; model: string; failedAttempts: Array<{ model: string; reason: string }> }> => {
  const failedAttempts: Array<{ model: string; reason: string }> = [];

  for (const model of models) {
    try {
      const result = await callOpenRouterJson(apiKey, model, tasks, profile, opts);
      return { result, model, failedAttempts };
    } catch (error) {
      const reason = sanitizeProviderError(error);
      failedAttempts.push({ model, reason });
      console.warn("grade-writing: model attempt failed", {
        request_id: opts?.requestId ?? null,
        model,
        reason,
      });
    }
  }

  const reason = failedAttempts.map((a) => `${a.model}: ${a.reason}`).join(" | ");
  throw new Error(`All model attempts failed. ${reason}`.slice(0, 900));
};

serve(async (req) => {
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method !== "POST") {
    return jsonError(405, "Method not allowed", "method_not_allowed", { request_id: requestId });
  }

  try {
    const supabaseUrl = getEnv("SUPABASE_URL");
    const supabaseServiceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("grade-writing: missing Supabase env vars");
      return jsonError(503, "Service is temporarily unavailable.", "service_not_configured", { request_id: requestId });
    }

    const token = getBearerToken(req);
    if (!token) {
      return jsonError(401, "Unauthorized", "unauthorized", { request_id: requestId });
    }

    const sb = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });

    const { data: authData, error: authError } = await sb.auth.getUser(token);
    if (authError || !authData?.user) {
      return jsonError(401, "Unauthorized", "unauthorized", { request_id: requestId });
    }

    const authedUserId = authData.user.id;
    const body = (await req.json()) as GradeWritingInput;
    const sessionId = String(body?.session_id ?? "");
    const force = body?.force === true;

    if (!sessionId) {
      return jsonError(400, "session_id is required", "bad_request", { request_id: requestId });
    }

    const { data: sessionRow, error: sessionError } = await sb
      .from("sessions")
      .select("id, user_id, experience_id, status, metadata, token_id")
      .eq("id", sessionId)
      .maybeSingle();

    if (sessionError) {
      console.error("grade-writing: failed to load session", sessionError);
      return jsonError(500, "Service is temporarily unavailable.", "db_error");
    }

    if (!sessionRow) {
      return jsonError(404, "Session not found", "not_found");
    }

    const { data: userRow } = await sb.from("users").select("role").eq("id", authedUserId).maybeSingle();
    const isAdmin = String((userRow as any)?.role ?? "").toLowerCase().startsWith("admin");

    if (sessionRow.user_id !== authedUserId && !isAdmin) {
      return jsonError(403, "Forbidden", "forbidden");
    }

    const sessionStatus = String((sessionRow as any)?.status ?? "").toLowerCase();
    if (sessionStatus !== "completed") {
      return jsonError(409, "Session is not completed.", "session_not_completed");
    }

    if (!force) {
      const { data: existingEval } = await sb
        .from("evaluations")
        .select("id, method, status, result, evaluated_at")
        .eq("session_id", sessionId)
        .eq("method", "ai")
        .maybeSingle();

      if (existingEval) {
        return new Response(JSON.stringify({ evaluation: existingEval }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
    }

    // Enforce platform-level controls (admin can bypass limits).
    const { data: settingsRow, error: settingsErr } = await sb
      .from("platform_settings")
      .select("writing_ai_enabled, writing_ai_daily_limit")
      .eq("id", 1)
      .maybeSingle();

    if (settingsErr) {
      console.error("grade-writing: failed to load platform settings", settingsErr);
      return jsonError(500, "Service is temporarily unavailable.", "db_error");
    }

    const enabled = Boolean((settingsRow as any)?.writing_ai_enabled ?? true);
    const dailyLimitRaw = Number((settingsRow as any)?.writing_ai_daily_limit ?? 0);
    const dailyLimit = Number.isFinite(dailyLimitRaw) ? Math.max(0, Math.floor(dailyLimitRaw)) : 0;

    if (!enabled && !isAdmin) {
      return jsonError(403, "AI feedback is currently unavailable.", "ai_disabled", { request_id: requestId });
    }

    if (!isAdmin && dailyLimit <= 0) {
      return jsonError(403, "AI feedback is currently unavailable.", "ai_disabled", { request_id: requestId });
    }

    if (!isAdmin && dailyLimit > 0) {
      const now = new Date();
      const startUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
      const { count, error: countErr } = await sb
        .from("ai_usage_events")
        .select("id", { count: "exact", head: true })
        .eq("user_id", authedUserId)
        .eq("kind", "grade-writing")
        .gte("created_at", startUtc)
        .not("metadata->>status", "eq", "failed");

      if (countErr) {
        console.error("grade-writing: failed to check usage limits", countErr);
        return jsonError(500, "Service is temporarily unavailable.", "db_error", { request_id: requestId });
      }

      if ((count ?? 0) >= dailyLimit) {
        return jsonError(429, "AI feedback is temporarily unavailable. Daily limit reached.", "ai_limit_reached", {
          request_id: requestId,
          limit: dailyLimit,
          used: count ?? 0,
        });
      }
    }

    const experienceId = sessionRow.experience_id as string;
    const { data: experienceRow, error: expErr } = await sb
      .from("experiences")
      .select("id, product_id")
      .eq("id", experienceId)
      .maybeSingle();

    if (expErr) {
      console.error("grade-writing: failed to load experience", expErr);
      return jsonError(500, "Service is temporarily unavailable.", "db_error");
    }

    const productId = String((experienceRow as any)?.product_id ?? "");
    if (!productId) {
      return jsonError(400, "Invalid session product mapping.", "invalid_session_product");
    }

    const { data: productRow, error: productErr } = await sb
      .from("products")
      .select("id, metadata")
      .eq("id", productId)
      .maybeSingle();

    if (productErr) {
      console.error("grade-writing: failed to load product", productErr);
      return jsonError(500, "Service is temporarily unavailable.", "db_error");
    }

    const productSlug = String((productRow as any)?.metadata?.slug ?? "")
      .trim()
      .toLowerCase();
    const writingProfile = resolveWritingEvaluationProfile(productSlug);

    const tokenId = String((sessionRow as any)?.token_id ?? "");
    let tokenMode = false;
    if (tokenId && !isAdmin) {
      const tokenCheck = await validateTokenSession(sb, tokenId, authedUserId, experienceId);
      if (!tokenCheck.ok) {
        return jsonError(403, tokenCheck.reason ?? "Forbidden", "forbidden");
      }
      tokenMode = true;
    }

    const reservedCredit = Boolean((sessionRow as any)?.metadata?.writing_credit_reserved);

    // Enforce monthly writing submission limits (tenant + product scoped).
    if (!tokenMode && !isAdmin) {
      const { data: memberships, error: memErr } = await sb
        .from("tenant_memberships")
        .select("tenant_id")
        .eq("user_id", authedUserId)
        .eq("status", "active")
        .order("created_at", { ascending: true });

      if (memErr) {
        console.error("grade-writing: failed to load memberships", memErr);
        return jsonError(500, "Service is temporarily unavailable.", "db_error");
      }

      const tenantId = (memberships ?? [])[0]?.tenant_id ?? null;
      if (!tenantId) return jsonError(403, "Forbidden", "forbidden");

      const { data: entitlement, error: entErr } = await sb
        .from("entitlements")
        .select("id, tenant_id, starts_at, ends_at, is_active, value")
        .eq("tenant_id", tenantId)
        .eq("resource_type", "product")
        .eq("resource_id", productId)
        .eq("is_active", true)
        .maybeSingle();

      if (entErr) {
        console.error("grade-writing: failed to load entitlement", entErr);
        return jsonError(500, "Service is temporarily unavailable.", "db_error");
      }

      if (!entitlement || !isActiveEntitlement(entitlement as any)) {
        return jsonError(403, "Forbidden", "forbidden");
      }

      const limits = extractLimits((entitlement as any).value);
      const limit = limits["writing_submissions"];

      if (!reservedCredit && limit && limit > 0) {
        const { start, end } = monthWindow();
        const { data: result, error: rpcErr } = await sb.rpc("consume_usage_counter", {
          p_tenant_id: tenantId,
          p_product_id: productId,
          p_capability_key: "writing_submissions",
          p_period_start: start,
          p_period_end: end,
          p_amount: 1,
          p_total: limit,
        });

        if (rpcErr) {
          console.error("grade-writing: failed to consume usage", rpcErr);
          return jsonError(500, "Service is temporarily unavailable.", "db_error");
        }

        const row = Array.isArray(result) ? result[0] : result;
        const allowed = Boolean(row?.allowed);
        if (!allowed) {
          return jsonError(429, "Writing limit reached.", "usage_limit_reached");
        }
      }
    }

    const { data: sections, error: secErr } = await sb
      .from("sections")
      .select("id, metadata, display_order")
      .eq("experience_id", experienceId)
      .order("display_order", { ascending: true });

    if (secErr) {
      console.error("grade-writing: failed to load sections", secErr);
      return jsonError(500, "Service is temporarily unavailable.", "db_error");
    }

    const writingSectionIds = (sections ?? [])
      .filter((s: any) => String((s.metadata as any)?.type ?? "").toLowerCase() === "writing")
      .map((s: any) => s.id);

    if (writingSectionIds.length === 0) {
      return jsonError(400, "No writing section found for this test.", "no_writing_section");
    }

    const { data: parts, error: partErr } = await sb
      .from("parts")
      .select("id, section_id, display_order")
      .in("section_id", writingSectionIds)
      .order("display_order", { ascending: true });

    if (partErr) {
      console.error("grade-writing: failed to load parts", partErr);
      return jsonError(500, "Service is temporarily unavailable.", "db_error");
    }

    const partIds = (parts ?? []).map((p: any) => p.id);

    const { data: units, error: unitErr } = await sb
      .from("content_units")
      .select("id, part_id, type, data, display_order")
      .in("part_id", partIds)
      .order("display_order", { ascending: true });

    if (unitErr) {
      console.error("grade-writing: failed to load content units", unitErr);
      return jsonError(500, "Service is temporarily unavailable.", "db_error");
    }

    let tasksBase: WritingTask[] = (units ?? [])
      .filter((u: any) => String(u.type) === "question_text")
      .map((u: any) => {
        const d = (u.data ?? {}) as any;
        const taskType = typeof d.task_type === "string" ? String(d.task_type) : typeof d.taskType === "string" ? String(d.taskType) : null;
        return {
          content_unit_id: u.id,
          part_id: String(u.part_id),
          task_type: taskType,
          prompt: String(d.prompt ?? ""),
          min_words: typeof d.min_words === "number" ? d.min_words : null,
          max_words: typeof d.max_words === "number" ? d.max_words : null,
          answer_text: "",
          word_count: 0,
          image_url: null,
        };
      })
      .filter((t) => t.prompt.trim().length > 0);

    // Backward compatibility for old writing imports that only had instruction/image units.
    if (tasksBase.length === 0) {
      const partOrderById = new Map<string, number>();
      for (const p of parts ?? []) partOrderById.set(String((p as any).id), Number((p as any).display_order ?? 0));

      const firstInstructionByPart = new Map<string, any>();
      for (const u of units ?? []) {
        if (String((u as any).type) !== "instruction") continue;
        const pid = String((u as any).part_id ?? "");
        if (!pid || firstInstructionByPart.has(pid)) continue;
        firstInstructionByPart.set(pid, u);
      }

      const fallbackPrompts = Array.from(firstInstructionByPart.values()).sort((a: any, b: any) => {
        const aOrder = partOrderById.get(String(a.part_id)) ?? 0;
        const bOrder = partOrderById.get(String(b.part_id)) ?? 0;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return Number(a.display_order ?? 0) - Number(b.display_order ?? 0);
      });

      tasksBase = fallbackPrompts
        .map((u: any, idx: number) => {
          const d = (u.data ?? {}) as any;
          const prompt = String(d.text ?? d.prompt ?? "").trim();
          const taskType = inferTaskType(idx);
          return {
            content_unit_id: String(u.id),
            part_id: String(u.part_id ?? ""),
            task_type: taskType,
            prompt,
            min_words: inferTaskMinWords(taskType),
            max_words: null,
            answer_text: "",
            word_count: 0,
            image_url: null,
          } as WritingTask;
        })
        .filter((t) => t.prompt.length > 0);
    }

    if (tasksBase.length === 0) {
      return jsonError(400, "No writing prompts found for this test.", "no_writing_prompts");
    }

    const unitIds = tasksBase.map((t) => t.content_unit_id);

    const { data: responses, error: respErr } = await sb
      .from("responses")
      .select("content_unit_id, data, submitted_at")
      .eq("session_id", sessionId)
      .in("content_unit_id", unitIds)
      .order("submitted_at", { ascending: true });

    if (respErr) {
      console.error("grade-writing: failed to load responses", respErr);
      return jsonError(500, "Service is temporarily unavailable.", "db_error");
    }

    const latest: Record<string, unknown> = {};
    for (const r of (responses ?? []) as any[]) latest[r.content_unit_id] = r.data;

    // Attach the first image/chart URL found in each writing part.
    const partImageUrl = new Map<string, string>();
    for (const unit of units ?? []) {
      const pid = String((unit as any).part_id ?? "");
      if (!pid || partImageUrl.has(pid)) continue;
      const type = String((unit as any).type ?? "");
      if (type !== "image" && type !== "question_diagram_labeling") continue;
      const url = await resolveImageUrl(sb, (unit as any).data ?? {}, { requestId, userId: authedUserId });
      if (url) partImageUrl.set(pid, url);
    }

    const tasks: WritingTask[] = tasksBase.map((t) => {
      const imageUrl = partImageUrl.get(String(t.part_id)) ?? null;
      return {
        ...t,
        answer_text: extractText(latest[t.content_unit_id]),
        image_url: imageUrl,
      };
    });

    // Fill word counts (helps output quality).
    for (const t of tasks) t.word_count = countWords(t.answer_text);

    const totalWords = tasks.reduce((sum, t) => sum + (typeof t.word_count === "number" ? t.word_count : 0), 0);
    if (totalWords <= 0) {
      // Avoid spending tokens when the user didn't submit any writing.
      return jsonError(400, "No writing answer found.", "no_writing_answer");
    }

    const apiKey = getEnv("OPENROUTER_API_KEY") ?? getEnv("OPENAI_API_KEY");
    if (!apiKey) {
      console.error("grade-writing: OPENROUTER_API_KEY is missing");
      return jsonError(503, "AI feedback is currently unavailable.", "ai_not_configured", { request_id: requestId });
    }
    const primaryModel = getEnv("OPENROUTER_MODEL") ?? getEnv("OPENAI_MODEL") ?? "openrouter/auto";
    const fallbackModels = parseModelList(
      getEnv("OPENROUTER_FALLBACK_MODELS") ?? "openrouter/auto",
    );
    const modelCandidates = Array.from(new Set([primaryModel, ...fallbackModels]));
    const openRouterBaseUrl = getEnv("OPENROUTER_BASE_URL") ?? "https://openrouter.ai/api/v1";
    const openRouterReferer = getEnv("OPENROUTER_REFERER");
    const openRouterAppName = getEnv("OPENROUTER_APP_NAME") ?? writingProfile.defaultAppName;
    console.log("grade-writing: model candidates", {
      request_id: requestId,
      user_id: authedUserId,
      session_id: sessionId,
      models: modelCandidates,
      task_count: tasks.length,
      has_images: tasks.some((t) => Boolean(t.image_url)),
    });

    let aiCallResult: { result: Json; model: string; failedAttempts: Array<{ model: string; reason: string }> };
    try {
      aiCallResult = await callOpenRouterJsonWithFallback(apiKey, modelCandidates, tasks, writingProfile, {
        baseUrl: openRouterBaseUrl,
        referer: openRouterReferer,
        appName: openRouterAppName,
        requestId,
      });
    } catch (error) {
      const reason = sanitizeProviderError(error, 420);
      const { error: usageErr } = await sb.from("ai_usage_events").insert({
        user_id: authedUserId,
        kind: "grade-writing",
        session_id: sessionId,
        metadata: {
          model: primaryModel,
          status: "failed",
          reason,
          request_id: requestId,
        },
      });
      if (usageErr) console.error("grade-writing: failed to record failed ai usage event", usageErr);
      throw error;
    }

    const aiResult = normalizeWritingEvaluationResult(aiCallResult.result, writingProfile.key);
    const usedModel = aiCallResult.model;

    const nowIso = new Date().toISOString();
    const { data: evalRow, error: evalError } = await sb
      .from("evaluations")
      .upsert(
        {
          session_id: sessionId,
          method: "ai",
          status: "completed",
          result: {
            ...aiResult,
            model: usedModel,
            graded_at: nowIso,
          },
          evaluated_at: nowIso,
        },
        { onConflict: "session_id,method" },
      )
      .select("id, method, status, result, evaluated_at")
      .maybeSingle();

    if (evalError) {
      console.error("grade-writing: failed to write evaluation", evalError);
      return jsonError(500, "Service is temporarily unavailable.", "db_error", { request_id: requestId });
    }

    const { error: usageErr } = await sb.from("ai_usage_events").insert({
      user_id: authedUserId,
      kind: "grade-writing",
      session_id: sessionId,
      metadata: {
        model: usedModel,
        status: "success",
        fallback_attempts: aiCallResult.failedAttempts.length,
        request_id: requestId,
      },
    });
    if (usageErr) console.error("grade-writing: failed to record successful ai usage event", usageErr);

    return json(200, { evaluation: evalRow });
  } catch (err) {
    const message = sanitizeProviderError(err, 320);
    console.error("grade-writing: unhandled error", { request_id: requestId, message, err });
    return jsonError(502, "AI feedback is currently unavailable.", "ai_failed", {
      request_id: requestId,
      reason: message,
    });
  }
});
