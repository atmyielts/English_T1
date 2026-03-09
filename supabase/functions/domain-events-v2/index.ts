import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { emitOpsAlert, logOpsEvent, requestIdFrom, withRequestIdHeader } from "../_shared/ops-observability.ts";

type JsonRecord = Record<string, unknown>;

type OutboxEventRow = {
  id: string;
  event_type: string;
  event_version: string;
  aggregate_type: string;
  aggregate_id: string;
  user_id: string | null;
  occurred_at: string;
  payload: JsonRecord | null;
  status: string;
  attempts: number | null;
};

type ExamOutcomeRow = {
  id: string;
  session_id: string;
  user_id: string;
  product_id: string;
  experience_id: string;
  score_method: string;
  status: string;
  schema_version: string;
  overall_score: number | null;
  overall_band: number | null;
  section_scores: JsonRecord | null;
  skill_breakdown: JsonRecord | null;
  computed_at: string;
};

type ProductLanguageRow = {
  product_id: string;
  language_id: string;
  included_in_shared_profile: boolean;
};

type SignalMetric = {
  skill_key: string;
  metric_key: string;
  metric_value: number;
};

type ParsedLanguageSignal = {
  userId: string;
  languageId: string | null;
  productId: string | null;
  sessionId: string | null;
  defaultSourceType: string;
  defaultOccurredAt: string;
  payload: JsonRecord;
  signals: Array<{
    source_type?: unknown;
    skill_key?: unknown;
    metric_key?: unknown;
    metric_value?: unknown;
    confidence?: unknown;
    occurred_at?: unknown;
    idempotency_key?: unknown;
    language_id?: unknown;
    product_id?: unknown;
    session_id?: unknown;
    payload?: unknown;
  }>;
};

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-worker-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_EVENT_TYPES = ["exam.result", "language.signal.v1"];
const opsDomain = "domain-events";

const json = (status: number, body: unknown, requestId: string): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: withRequestIdHeader({ "Content-Type": "application/json", ...corsHeaders }, requestId),
  });

let cachedDbWorkerSecret: string | null = null;
let cachedDbWorkerSecretAt = 0;
const DB_WORKER_SECRET_CACHE_MS = 60_000;

const getEnv = (key: string): string => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Missing env var: ${key}`);
  return value;
};

const getOptionalEnv = (key: string): string | null => {
  const value = Deno.env.get(key);
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const getOptionalIntEnv = (key: string, fallback: number): number => {
  const raw = getOptionalEnv(key);
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(value));
};

const getBearerToken = (req: Request): string | null => {
  const header = req.headers.get("Authorization") ?? "";
  if (!header) return null;
  return header.startsWith("Bearer ") ? header.slice(7) : header;
};

const isObject = (value: unknown): value is JsonRecord =>
  !!value && typeof value === "object" && !Array.isArray(value);

const toNumber = (value: unknown): number | null => {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : null;
};

const clampConfidence = (value: unknown): number => {
  const num = toNumber(value);
  if (num == null) return 1;
  if (num <= 0) return 0;
  if (num >= 1) return 1;
  return num;
};

const parseEventTypes = (raw: unknown): string[] => {
  const rawType = String(raw ?? "").trim();
  if (!rawType || rawType.toLowerCase() === "all") return [...DEFAULT_EVENT_TYPES];
  return [rawType];
};

const buildSkillProfile = (outcomes: ExamOutcomeRow[]): Record<string, unknown> => {
  const stats = new Map<
    string,
    {
      samples: number;
      ratioTotal: number;
      ratioCount: number;
      score40Total: number;
      score40Count: number;
      score800Total: number;
      score800Count: number;
      bandTotal: number;
      bandCount: number;
      lastComputedAt: string | null;
    }
  >();

  for (const outcome of outcomes) {
    const breakdown = isObject(outcome.skill_breakdown) ? outcome.skill_breakdown : {};
    for (const [skill, value] of Object.entries(breakdown)) {
      if (!isObject(value)) continue;
      const entry = stats.get(skill) ?? {
        samples: 0,
        ratioTotal: 0,
        ratioCount: 0,
        score40Total: 0,
        score40Count: 0,
        score800Total: 0,
        score800Count: 0,
        bandTotal: 0,
        bandCount: 0,
        lastComputedAt: null,
      };

      const ratio = toNumber(value.ratio);
      const score40 = toNumber(value.scaled_score_40);
      const score800 = toNumber(value.scaled_score_800);
      const band = toNumber(value.band);

      entry.samples += 1;
      if (ratio != null) {
        entry.ratioTotal += ratio;
        entry.ratioCount += 1;
      }
      if (score40 != null) {
        entry.score40Total += score40;
        entry.score40Count += 1;
      }
      if (score800 != null) {
        entry.score800Total += score800;
        entry.score800Count += 1;
      }
      if (band != null) {
        entry.bandTotal += band;
        entry.bandCount += 1;
      }
      entry.lastComputedAt = outcome.computed_at;
      stats.set(skill, entry);
    }
  }

  const profile: Record<string, unknown> = {};
  for (const [skill, entry] of stats.entries()) {
    profile[skill] = {
      samples: entry.samples,
      ratio_avg: entry.ratioCount > 0 ? Math.round((entry.ratioTotal / entry.ratioCount) * 10000) / 10000 : null,
      scaled_score_40_avg: entry.score40Count > 0 ? Math.round(entry.score40Total / entry.score40Count) : null,
      scaled_score_800_avg: entry.score800Count > 0 ? Math.round(entry.score800Total / entry.score800Count) : null,
      band_avg: entry.bandCount > 0 ? Math.round((entry.bandTotal / entry.bandCount) * 100) / 100 : null,
      last_computed_at: entry.lastComputedAt,
    };
  }
  return profile;
};

const parseEventContext = (
  event: OutboxEventRow,
): { userId: string; productId: string; sessionId: string } => {
  const payload = isObject(event.payload) ? event.payload : {};
  const userId = String(payload.user_id ?? event.user_id ?? "").trim();
  const productId = String(payload.product_id ?? "").trim();
  const sessionId = String(payload.session_id ?? event.aggregate_id ?? "").trim();
  if (!userId || !productId || !sessionId) {
    throw new Error("Missing user_id/product_id/session_id in event payload");
  }
  return { userId, productId, sessionId };
};

const toSignalMetrics = (skillBreakdown: unknown): SignalMetric[] => {
  const out: SignalMetric[] = [];
  const breakdown = isObject(skillBreakdown) ? skillBreakdown : {};
  for (const [skillKeyRaw, value] of Object.entries(breakdown)) {
    if (!isObject(value)) continue;
    const skillKey = String(skillKeyRaw ?? "").trim().toLowerCase();
    if (!skillKey) continue;

    const candidates: Array<[string, unknown]> = [
      ["ratio", value.ratio],
      ["scaled_score_40", value.scaled_score_40],
      ["scaled_score_800", value.scaled_score_800],
      ["band", value.band],
    ];

    for (const [metricKey, metricValueRaw] of candidates) {
      const metricValue = toNumber(metricValueRaw);
      if (metricValue == null) continue;
      out.push({ skill_key: skillKey, metric_key: metricKey, metric_value: metricValue });
    }
  }
  return out;
};

const parseLanguageSignalEvent = (event: OutboxEventRow): ParsedLanguageSignal => {
  const payload = isObject(event.payload) ? event.payload : {};
  const userId = String(payload.user_id ?? event.user_id ?? "").trim();
  if (!userId) throw new Error("Missing user_id in language.signal.v1 payload");

  const languageIdRaw = String(payload.language_id ?? "").trim();
  const productIdRaw = String(payload.product_id ?? "").trim();
  const sessionIdRaw = String(payload.session_id ?? event.aggregate_id ?? "").trim();
  const defaultSourceType = String(payload.source_type ?? "module.signal").trim() || "module.signal";
  const defaultOccurredAt = String(payload.occurred_at ?? event.occurred_at ?? "").trim() || event.occurred_at;

  const signalList = Array.isArray(payload.signals) ? payload.signals : [];
  return {
    userId,
    languageId: languageIdRaw || null,
    productId: productIdRaw || null,
    sessionId: sessionIdRaw || null,
    defaultSourceType,
    defaultOccurredAt,
    payload,
    signals: signalList
      .filter((entry) => isObject(entry))
      .map((entry) => entry as ParsedLanguageSignal["signals"][number]),
  };
};

const loadDbWorkerSecret = async (sb: any): Promise<string | null> => {
  const now = Date.now();
  if (now - cachedDbWorkerSecretAt < DB_WORKER_SECRET_CACHE_MS) {
    return cachedDbWorkerSecret;
  }

  try {
    const { data, error } = await sb
      .from("internal_runtime_secrets")
      .select("secret")
      .eq("key", "domain_events_worker_secret")
      .maybeSingle();
    if (error) {
      cachedDbWorkerSecret = null;
      cachedDbWorkerSecretAt = now;
      return null;
    }
    const secret = String((data as { secret?: string } | null)?.secret ?? "").trim();
    cachedDbWorkerSecret = secret.length > 0 ? secret : null;
    cachedDbWorkerSecretAt = now;
    return cachedDbWorkerSecret;
  } catch {
    cachedDbWorkerSecret = null;
    cachedDbWorkerSecretAt = now;
    return null;
  }
};

const assertAuthorized = async (req: Request, sb: any): Promise<void> => {
  const envWorkerSecret = getOptionalEnv("DOMAIN_EVENTS_WORKER_SECRET");
  const dbWorkerSecret = envWorkerSecret ? null : await loadDbWorkerSecret(sb);
  const workerSecret = envWorkerSecret ?? dbWorkerSecret;
  const providedSecret = String(req.headers.get("x-worker-secret") ?? "").trim();
  if (workerSecret && providedSecret && providedSecret === workerSecret) return;

  const token = getBearerToken(req);
  if (!token) throw new Error("Unauthorized");

  const serviceRoleKey = getOptionalEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (serviceRoleKey && token === serviceRoleKey) return;

  const { data: authData, error: authError } = await sb.auth.getUser(token);
  if (authError || !authData?.user) throw new Error("Unauthorized");

  const { data: userRow } = await sb.from("users").select("role").eq("id", authData.user.id).maybeSingle();
  if (String((userRow as any)?.role ?? "").toLowerCase() !== "admin") throw new Error("Forbidden");
};

const loadProductLanguage = async (
  sb: any,
  productId: string,
  cache: Map<string, ProductLanguageRow | null>,
): Promise<ProductLanguageRow | null> => {
  if (!productId) return null;
  if (cache.has(productId)) return cache.get(productId) ?? null;

  const { data, error } = await sb
    .from("product_languages")
    .select("product_id, language_id, included_in_shared_profile")
    .eq("product_id", productId)
    .maybeSingle();

  if (error) throw error;
  const row = data ? (data as ProductLanguageRow) : null;
  cache.set(productId, row);
  return row;
};

const upsertExamSignals = async (
  sb: any,
  event: OutboxEventRow,
  ctx: { userId: string; productId: string; sessionId: string },
  mapping: ProductLanguageRow,
  dryRun: boolean,
): Promise<number> => {
  if (!mapping.included_in_shared_profile) return 0;

  const { data: outcomeRow, error: outcomeError } = await sb
    .from("exam_outcomes")
    .select("id, skill_breakdown, computed_at, score_method, status, schema_version")
    .eq("session_id", ctx.sessionId)
    .maybeSingle();
  if (outcomeError) throw outcomeError;

  const payload = isObject(event.payload) ? event.payload : {};
  const skillBreakdown = (outcomeRow as any)?.skill_breakdown ?? payload.skill_breakdown ?? {};
  const metrics = toSignalMetrics(skillBreakdown);
  if (metrics.length === 0) return 0;
  if (dryRun) return metrics.length;

  const occurredAt = String((outcomeRow as any)?.computed_at ?? event.occurred_at);
  const outcomeId = String((outcomeRow as any)?.id ?? "").trim();
  const schemaVersion = String((outcomeRow as any)?.schema_version ?? payload.schema_version ?? "exam.result.v1").trim() || "exam.result.v1";
  const scoreMethod = String((outcomeRow as any)?.score_method ?? payload.score_method ?? payload.method ?? "auto").trim() || "auto";
  const status = String((outcomeRow as any)?.status ?? payload.status ?? "completed").trim() || "completed";

  const rows = metrics.map((metric) => ({
    user_id: ctx.userId,
    language_id: mapping.language_id,
    product_id: ctx.productId,
    session_id: ctx.sessionId,
    source_type: "exam.result",
    skill_key: metric.skill_key,
    metric_key: metric.metric_key,
    metric_value: metric.metric_value,
    confidence: 1,
    occurred_at: occurredAt,
    idempotency_key: `exam.signal:${ctx.sessionId}:${metric.skill_key}:${metric.metric_key}`,
    payload: {
      schema_version: schemaVersion,
      outcome_id: outcomeId || null,
      score_method: scoreMethod,
      status,
      event_id: event.id,
    },
  }));

  const { error: upsertError } = await sb.from("language_signals").upsert(rows, { onConflict: "idempotency_key" });
  if (upsertError) throw upsertError;
  return rows.length;
};

const upsertLanguageSignalEventRows = async (
  sb: any,
  event: OutboxEventRow,
  parsed: ParsedLanguageSignal,
  mappingCache: Map<string, ProductLanguageRow | null>,
  dryRun: boolean,
): Promise<{ languageId: string; inserted: number; sessionId: string | null }> => {
  if (parsed.signals.length === 0) {
    throw new Error("language.signal.v1 payload.signals must be a non-empty array");
  }

  const rows: Array<Record<string, unknown>> = [];
  let resolvedLanguageId: string | null = parsed.languageId;
  let resolvedSessionId: string | null = parsed.sessionId;

  for (let idx = 0; idx < parsed.signals.length; idx += 1) {
    const raw = parsed.signals[idx];
    const sourceType = String(raw.source_type ?? parsed.defaultSourceType ?? "module.signal").trim() || "module.signal";
    const skillKey = String(raw.skill_key ?? "").trim().toLowerCase();
    const metricKey = String(raw.metric_key ?? "").trim().toLowerCase();
    const metricValue = toNumber(raw.metric_value);

    if (!skillKey || !metricKey || metricValue == null) continue;

    const rowProductId = String(raw.product_id ?? parsed.productId ?? "").trim();
    if (!rowProductId) {
      throw new Error("language.signal.v1 signal is missing product_id");
    }

    const mapping = await loadProductLanguage(sb, rowProductId, mappingCache);
    if (!mapping) {
      throw new Error(`language.signal.v1 product ${rowProductId} is not mapped to any language`);
    }
    if (!mapping.included_in_shared_profile) {
      continue;
    }

    const candidateLanguageId = String(raw.language_id ?? resolvedLanguageId ?? mapping.language_id ?? "").trim();
    if (!candidateLanguageId) {
      throw new Error("language.signal.v1 could not resolve language_id");
    }
    if (candidateLanguageId !== mapping.language_id) {
      throw new Error(`language.signal.v1 language_id mismatch for product ${rowProductId}`);
    }

    if (resolvedLanguageId && resolvedLanguageId !== candidateLanguageId) {
      throw new Error("language.signal.v1 event contains multiple language_id values");
    }
    resolvedLanguageId = candidateLanguageId;

    const rowSessionIdRaw = String(raw.session_id ?? resolvedSessionId ?? "").trim();
    const rowSessionId = rowSessionIdRaw || null;
    if (resolvedSessionId && rowSessionId && resolvedSessionId !== rowSessionId) {
      throw new Error("language.signal.v1 event contains multiple session_id values");
    }
    resolvedSessionId = resolvedSessionId ?? rowSessionId;

    const occurredAt = String(raw.occurred_at ?? parsed.defaultOccurredAt ?? event.occurred_at).trim() || event.occurred_at;
    const confidence = clampConfidence(raw.confidence);
    const idempotencyKey = String(raw.idempotency_key ?? "").trim() || `language.signal.v1:${event.id}:${idx}`;
    const rowPayload = isObject(raw.payload) ? raw.payload : {};

    rows.push({
      user_id: parsed.userId,
      language_id: candidateLanguageId,
      product_id: rowProductId,
      session_id: rowSessionId,
      source_type: sourceType,
      skill_key: skillKey,
      metric_key: metricKey,
      metric_value: metricValue,
      confidence,
      occurred_at: occurredAt,
      idempotency_key: idempotencyKey,
      payload: {
        ...(isObject(parsed.payload.metadata) ? (parsed.payload.metadata as JsonRecord) : {}),
        ...rowPayload,
        event_id: event.id,
        event_type: event.event_type,
      },
    });
  }

  if (!resolvedLanguageId) {
    throw new Error("language.signal.v1 did not resolve a language_id after filtering");
  }

  if (dryRun) {
    return { languageId: resolvedLanguageId, inserted: rows.length, sessionId: resolvedSessionId };
  }

  if (rows.length > 0) {
    const { error: upsertError } = await sb.from("language_signals").upsert(rows, { onConflict: "idempotency_key" });
    if (upsertError) throw upsertError;
  }

  return {
    languageId: resolvedLanguageId,
    inserted: rows.length,
    sessionId: resolvedSessionId,
  };
};

const recomputeLanguageProfile = async (
  sb: any,
  userId: string,
  languageId: string,
  event: OutboxEventRow,
  dryRun: boolean,
): Promise<void> => {
  if (dryRun) return;

  const { error: recomputeError } = await sb.rpc("recompute_learner_language_profile", {
    p_user_id: userId,
    p_language_id: languageId,
    p_latest_event_id: event.id,
    p_latest_event_at: event.occurred_at,
  });
  if (recomputeError) throw recomputeError;
};

serve(async (req) => {
  const requestId = requestIdFrom(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: withRequestIdHeader(corsHeaders, requestId) });
  }
  if (req.method !== "POST") return json(405, { error: "Method not allowed" }, requestId);

  try {
    const supabaseUrl = getEnv("SUPABASE_URL");
    const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
    const sb = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    await assertAuthorized(req, sb);

    let body: JsonRecord = {};
    try {
      const parsed = await req.json();
      body = isObject(parsed) ? parsed : {};
    } catch {
      body = {};
    }

    const requestedLimit = toNumber(body.limit);
    const limit = requestedLimit != null ? Math.max(1, Math.min(200, Math.floor(requestedLimit))) : 50;
    const dryRun = Boolean(body.dry_run ?? false);
    const eventTypes = parseEventTypes(body.event_type);

    logOpsEvent("info", opsDomain, "run_started", {
      request_id: requestId,
      dry_run: dryRun,
      event_types: eventTypes,
      requested_limit: limit,
    });

    const { data: events, error: eventsError } = await sb
      .from("domain_event_outbox")
      .select("id, event_type, event_version, aggregate_type, aggregate_id, user_id, occurred_at, payload, status, attempts")
      .in("event_type", eventTypes)
      .in("status", ["pending", "failed"])
      .order("created_at", { ascending: true })
      .limit(limit);

    if (eventsError) {
      logOpsEvent("error", opsDomain, "outbox_query_failed", {
        request_id: requestId,
        event_types: eventTypes,
        error: eventsError,
      });
      emitOpsAlert({
        domain: opsDomain,
        event: "outbox_query_failed",
        severity: "error",
        detail: {
          request_id: requestId,
          event_types: eventTypes,
          error: eventsError,
        },
      });
      return json(500, { error: "Failed to load outbox events", details: eventsError }, requestId);
    }

    const rows = (events ?? []) as OutboxEventRow[];
    let delivered = 0;
    let failed = 0;
    let skipped = 0;
    const details: Array<{ event_id: string; event_type: string; status: string; message?: string }> = [];
    const productLanguageCache = new Map<string, ProductLanguageRow | null>();

    for (const event of rows) {
      try {
        const attempts = Number(event.attempts ?? 0);
        const attemptNumber = dryRun ? attempts : attempts + 1;
        const { data: claimed, error: claimError } = await sb
          .from("domain_event_outbox")
          .update({
            status: dryRun ? event.status : "processing",
            attempts: attemptNumber,
            last_error: null,
          })
          .eq("id", event.id)
          .in("status", ["pending", "failed"])
          .select("id")
          .maybeSingle();

        if (!dryRun && claimError) throw claimError;
        if (!dryRun && !claimed) {
          skipped += 1;
          details.push({
            event_id: event.id,
            event_type: event.event_type,
            status: "skipped",
            message: "Could not claim event (already processing)",
          });
          continue;
        }

        if (event.event_type === "exam.result") {
          const ctx = parseEventContext(event);

          if (!dryRun) {
            const { error: markerError } = await sb.from("learner_skill_profile_events").insert({
              event_id: event.id,
              user_id: ctx.userId,
              product_id: ctx.productId,
              session_id: ctx.sessionId,
              occurred_at: event.occurred_at,
            });

            if (markerError && markerError.code !== "23505") throw markerError;
          }

          const { data: outcomes, error: outcomesError } = await sb
            .from("exam_outcomes")
            .select(
              "id, session_id, user_id, product_id, experience_id, score_method, status, schema_version, overall_score, overall_band, section_scores, skill_breakdown, computed_at",
            )
            .eq("user_id", ctx.userId)
            .eq("product_id", ctx.productId)
            .order("computed_at", { ascending: false })
            .limit(200);
          if (outcomesError) throw outcomesError;

          const outcomeRows = (outcomes ?? []) as ExamOutcomeRow[];
          const profile = buildSkillProfile(outcomeRows);
          const latestOutcome = outcomeRows[0] ?? null;

          const productLanguage = await loadProductLanguage(sb, ctx.productId, productLanguageCache);
          let languageSignalsUpserted = 0;

          if (productLanguage?.included_in_shared_profile) {
            languageSignalsUpserted = await upsertExamSignals(sb, event, ctx, productLanguage, dryRun);
            if (!dryRun) {
              const { error: languageEventMarkerError } = await sb.from("learner_language_profile_events").insert({
                event_id: event.id,
                user_id: ctx.userId,
                language_id: productLanguage.language_id,
                session_id: ctx.sessionId,
                occurred_at: event.occurred_at,
              });
              if (languageEventMarkerError && languageEventMarkerError.code !== "23505") throw languageEventMarkerError;

              await recomputeLanguageProfile(sb, ctx.userId, productLanguage.language_id, event, dryRun);
            }
          }

          if (!dryRun) {
            const { error: profileError } = await sb.from("learner_skill_profiles").upsert(
              {
                user_id: ctx.userId,
                product_id: ctx.productId,
                schema_version: "profile.v1",
                signals_count: outcomeRows.length,
                sessions_count: outcomeRows.length,
                profile,
                latest_result: latestOutcome,
                latest_event_id: event.id,
                latest_event_at: event.occurred_at,
              },
              { onConflict: "user_id,product_id" },
            );
            if (profileError) throw profileError;

            const { error: doneError } = await sb
              .from("domain_event_outbox")
              .update({ status: "delivered", last_error: null })
              .eq("id", event.id);
            if (doneError) throw doneError;
          }

          delivered += 1;
          details.push({
            event_id: event.id,
            event_type: event.event_type,
            status: dryRun ? "validated" : "delivered",
            message: `sessions=${outcomeRows.length}, signals=${languageSignalsUpserted}`,
          });
          continue;
        }

        if (event.event_type === "language.signal.v1") {
          const parsedSignalEvent = parseLanguageSignalEvent(event);
          const signalResult = await upsertLanguageSignalEventRows(sb, event, parsedSignalEvent, productLanguageCache, dryRun);

          if (!dryRun) {
            const { error: markerError } = await sb.from("learner_language_profile_events").insert({
              event_id: event.id,
              user_id: parsedSignalEvent.userId,
              language_id: signalResult.languageId,
              session_id: signalResult.sessionId,
              occurred_at: event.occurred_at,
            });
            if (markerError && markerError.code !== "23505") throw markerError;

            await recomputeLanguageProfile(sb, parsedSignalEvent.userId, signalResult.languageId, event, dryRun);

            const { error: doneError } = await sb
              .from("domain_event_outbox")
              .update({ status: "delivered", last_error: null })
              .eq("id", event.id);
            if (doneError) throw doneError;
          }

          delivered += 1;
          details.push({
            event_id: event.id,
            event_type: event.event_type,
            status: dryRun ? "validated" : "delivered",
            message: `signals=${signalResult.inserted}`,
          });
          continue;
        }

        if (!dryRun) {
          await sb
            .from("domain_event_outbox")
            .update({ status: "delivered", last_error: null })
            .eq("id", event.id);
        }

        skipped += 1;
        details.push({
          event_id: event.id,
          event_type: event.event_type,
          status: "skipped",
          message: "Unsupported event_type",
        });
      } catch (err) {
        failed += 1;
        const message = err instanceof Error ? err.message : String(err);
        details.push({ event_id: event.id, event_type: event.event_type, status: "failed", message });
        const attemptNumber = Number(event.attempts ?? 0) + (dryRun ? 0 : 1);
        const errorDetail = {
          request_id: requestId,
          event_id: event.id,
          event_type: event.event_type,
          aggregate_id: event.aggregate_id,
          user_id: event.user_id,
          attempt: attemptNumber,
          message,
        };
        logOpsEvent("warn", opsDomain, "event_processing_failed", errorDetail);
        if (attemptNumber >= 3) {
          emitOpsAlert({
            domain: opsDomain,
            event: "event_processing_failed",
            severity: "error",
            detail: errorDetail,
          });
        }

        if (!dryRun) {
          const safeMessage = message.length > 600 ? `${message.slice(0, 600)}...` : message;
          await sb
            .from("domain_event_outbox")
            .update({ status: "failed", last_error: safeMessage })
            .eq("id", event.id);
        }
      }
    }

    let pendingCount: number | null = null;
    let failedCount: number | null = null;
    let oldestPendingCreatedAt: string | null = null;
    try {
      const [pendingRes, failedRes, oldestPendingRes] = await Promise.all([
        sb
          .from("domain_event_outbox")
          .select("id", { head: true, count: "exact" })
          .in("event_type", eventTypes)
          .eq("status", "pending"),
        sb
          .from("domain_event_outbox")
          .select("id", { head: true, count: "exact" })
          .in("event_type", eventTypes)
          .eq("status", "failed"),
        sb
          .from("domain_event_outbox")
          .select("created_at")
          .in("event_type", eventTypes)
          .eq("status", "pending")
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle(),
      ]);
      if (!pendingRes.error) pendingCount = pendingRes.count ?? 0;
      if (!failedRes.error) failedCount = failedRes.count ?? 0;
      if (!oldestPendingRes.error && oldestPendingRes.data) {
        oldestPendingCreatedAt = String((oldestPendingRes.data as { created_at?: string }).created_at ?? "").trim() || null;
      }
    } catch {
      pendingCount = null;
      failedCount = null;
      oldestPendingCreatedAt = null;
    }

    const pendingThreshold = getOptionalIntEnv("DOMAIN_EVENTS_ALERT_PENDING_THRESHOLD", 200);
    const failedThreshold = getOptionalIntEnv("DOMAIN_EVENTS_ALERT_FAILED_THRESHOLD", 20);
    const shouldAlertBacklog =
      (pendingCount != null && pendingCount >= pendingThreshold && pendingThreshold > 0) ||
      (failedCount != null && failedCount >= failedThreshold && failedThreshold > 0);
    if (shouldAlertBacklog) {
      emitOpsAlert({
        domain: opsDomain,
        event: "pipeline_backlog_threshold_exceeded",
        severity: "error",
        detail: {
          request_id: requestId,
          event_types: eventTypes,
          pending_count: pendingCount,
          failed_count: failedCount,
          pending_threshold: pendingThreshold,
          failed_threshold: failedThreshold,
          oldest_pending_created_at: oldestPendingCreatedAt,
        },
      });
    }

    logOpsEvent("info", opsDomain, "run_completed", {
      request_id: requestId,
      dry_run: dryRun,
      event_types: eventTypes,
      processed: rows.length,
      delivered,
      failed,
      skipped,
      pending_count: pendingCount,
      failed_count: failedCount,
      oldest_pending_created_at: oldestPendingCreatedAt,
    });

    return json(
      200,
      {
        ok: true,
        dry_run: dryRun,
        event_types: eventTypes,
        requested_limit: limit,
        processed: rows.length,
        delivered,
        failed,
        skipped,
        backlog: {
          pending_count: pendingCount,
          failed_count: failedCount,
          oldest_pending_created_at: oldestPendingCreatedAt,
        },
        details,
      },
      requestId,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    const level = status >= 500 ? "error" : "warn";
    logOpsEvent(level, opsDomain, "request_failed", {
      request_id: requestId,
      status,
      message,
    });
    if (status >= 500) {
      emitOpsAlert({
        domain: opsDomain,
        event: "request_failed",
        severity: "error",
        detail: {
          request_id: requestId,
          status,
          message,
        },
      });
    }
    return json(status, { error: message }, requestId);
  }
});
