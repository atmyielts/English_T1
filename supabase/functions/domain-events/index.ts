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

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-worker-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

const roundNumber = (value: number, precision = 4): number => {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
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
      ratio_avg: entry.ratioCount > 0 ? roundNumber(entry.ratioTotal / entry.ratioCount, 4) : null,
      scaled_score_40_avg: entry.score40Count > 0 ? Math.round(entry.score40Total / entry.score40Count) : null,
      scaled_score_800_avg: entry.score800Count > 0 ? Math.round(entry.score800Total / entry.score800Count) : null,
      band_avg: entry.bandCount > 0 ? roundNumber(entry.bandTotal / entry.bandCount, 2) : null,
      last_computed_at: entry.lastComputedAt,
    };
  }
  return profile;
};

// ---------------------------------------------------------------------------
// IELTS feedback loop: seed SRS queue + mark playbook evidence fresh
// ---------------------------------------------------------------------------
// Mirrors `packages/ielts-core` (frontend). Kept inline because Deno can't
// resolve a workspace npm package by name — keep the whitelist in sync if you
// add a new question type to the package.

const IELTS_QUESTION_TYPES_SET: ReadonlySet<string> = new Set([
  "question_text",
  "question_single_choice",
  "question_multi_choice",
  "question_matching",
  "question_true_false_not_given",
  "question_yes_no_not_given",
  "question_matching_headings",
  "question_sentence_endings",
  "question_gap_fill",
  "question_select_from_list",
  "question_table_completion",
  "question_form_completion",
  "question_note_completion",
  "question_summary_completion",
  "question_diagram_labeling",
  "question_map_labeling",
  "question_drag_drop",
]);

const IELTS_QUESTION_TYPE_ALIASES: Record<string, string> = {
  question_tfng: "question_true_false_not_given",
  question_ynng: "question_yes_no_not_given",
  question_multiple_choice: "question_multi_choice",
  tfng: "question_true_false_not_given",
  ynng: "question_yes_no_not_given",
};

const canonicalizeIeltsQuestionType = (raw: unknown): string | null => {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;
  if (IELTS_QUESTION_TYPES_SET.has(trimmed)) return trimmed;
  const aliased = IELTS_QUESTION_TYPE_ALIASES[trimmed];
  if (aliased) return aliased;
  const prefixed = `question_${trimmed}`;
  if (IELTS_QUESTION_TYPES_SET.has(prefixed)) return prefixed;
  return null;
};

const inferIeltsSection = (questionType: string): "reading" | "listening" | "writing" | null => {
  // Listening-only types
  if (
    questionType === "question_form_completion" ||
    questionType === "question_note_completion" ||
    questionType === "question_map_labeling"
  ) return "listening";
  // Writing-only types
  if (questionType === "question_text") return "writing";
  // Reading-only types
  if (
    questionType === "question_true_false_not_given" ||
    questionType === "question_yes_no_not_given" ||
    questionType === "question_matching_headings" ||
    questionType === "question_summary_completion" ||
    questionType === "question_sentence_endings" ||
    questionType === "question_drag_drop"
  ) return "reading";
  // Ambiguous (multi_choice, matching, gap_fill, table_completion, etc.) — default reading.
  return "reading";
};

const resolveIeltsTargetBand = async (sb: any, userId: string): Promise<number> => {
  try {
    const { data } = await sb
      .from("ielts_playbook_user_profiles")
      .select("target_overall_band")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const band = toNumber((data as { target_overall_band?: unknown } | null)?.target_overall_band);
    if (band != null) return band;
  } catch {
    // Fall through to default
  }
  return 7.0;
};

interface IeltsFeedbackResult {
  applicable: boolean;
  seeded: number;
  skipped: number;
  reason?: string;
}

const seedIeltsSrsFromOutcome = async (
  sb: any,
  userId: string,
  outcome: ExamOutcomeRow,
): Promise<IeltsFeedbackResult> => {
  const breakdown = isObject(outcome.skill_breakdown) ? outcome.skill_breakdown : {};
  const ieltsEntries: Array<{ canonical: string; ratio: number | null; band: number | null }> = [];
  for (const [rawType, value] of Object.entries(breakdown)) {
    if (!isObject(value)) continue;
    const canonical = canonicalizeIeltsQuestionType(rawType);
    if (!canonical) continue;
    ieltsEntries.push({
      canonical,
      ratio: toNumber((value as JsonRecord).ratio),
      band: toNumber((value as JsonRecord).band),
    });
  }
  if (ieltsEntries.length === 0) return { applicable: false, seeded: 0, skipped: 0 };

  const { data: lang } = await sb
    .from("languages")
    .select("id")
    .eq("code", "en")
    .limit(1)
    .maybeSingle();
  const languageId = (lang as { id?: string } | null)?.id;
  if (!languageId) return { applicable: true, seeded: 0, skipped: 0, reason: "language_missing" };

  // Resolve the IELTS Practice product id. The frontend hardcodes this
  // constant and the SRS table's unique constraint includes product_id, so the
  // worker MUST write the same value the UI writes — otherwise the user ends
  // up with duplicate rows that the reviews page can't advance. Look up by
  // slug so we don't carry a second copy of the UUID.
  const { data: practiceProduct } = await sb
    .from("products")
    .select("id")
    .eq("slug", "ielts-practice")
    .limit(1)
    .maybeSingle();
  const practiceProductId = (practiceProduct as { id?: string } | null)?.id ?? null;
  if (!practiceProductId) {
    return { applicable: true, seeded: 0, skipped: 0, reason: "practice_product_missing" };
  }

  const targetBand = await resolveIeltsTargetBand(sb, userId);
  const accuracyFloor = 0.7;
  const bandGap = 0.5;
  const weakBandThreshold = targetBand - bandGap;
  const nowIso = new Date().toISOString();

  let seeded = 0;
  let skipped = 0;

  for (const entry of ieltsEntries) {
    const lowAccuracy = entry.ratio != null && entry.ratio < accuracyFloor;
    const lowBand = entry.band != null && entry.band < weakBandThreshold;
    if (!lowAccuracy && !lowBand) continue;

    const sectionType = inferIeltsSection(entry.canonical);
    if (!sectionType) { skipped += 1; continue; }
    // SRS table check constraint forbids 'speaking', and Writing review goes through
    // grade-writing rather than SRS, so skip writing-only types when seeding from an
    // exam-wide breakdown — those would be drilled in the writing workbench.
    if (sectionType === "writing") { skipped += 1; continue; }

    // Check for an existing row before inserting. Postgres treats NULL as
    // distinct in UNIQUE constraints, so relying on 23505 alone would let
    // duplicates through whenever product_id is null on either side.
    const { data: existing } = await sb
      .from("ielts_srs_question_reviews")
      .select("id")
      .eq("user_id", userId)
      .eq("language_id", languageId)
      .eq("product_id", practiceProductId)
      .eq("section_type", sectionType)
      .eq("question_type", entry.canonical)
      .limit(1)
      .maybeSingle();
    if (existing) { skipped += 1; continue; }

    const { error } = await sb.from("ielts_srs_question_reviews").insert({
      user_id: userId,
      language_id: languageId,
      product_id: practiceProductId,
      section_type: sectionType,
      question_type: entry.canonical,
      leitner_box: 1,
      next_review_at: nowIso,
      last_accuracy_ratio: entry.ratio,
      rolling_accuracy_ratio: entry.ratio,
      review_count: 0,
      correct_count: 0,
      incorrect_count: 0,
      is_archived: false,
      metadata: {
        seeded_from_event: true,
        source_outcome_id: outcome.id,
        source_session_id: outcome.session_id,
        ratio: entry.ratio,
        band: entry.band,
      },
    });

    if (error) {
      // 23505 = unique_violation. Could happen if another worker invocation
      // raced us between the SELECT and INSERT. Honor seed semantic: no-op.
      if ((error as { code?: string }).code === "23505") {
        skipped += 1;
        continue;
      }
      logOpsEvent("warn", opsDomain, "srs_seed_failed", {
        user_id: userId,
        question_type: entry.canonical,
        section_type: sectionType,
        error: (error as { message?: string }).message ?? String(error),
      });
      skipped += 1;
      continue;
    }
    seeded += 1;
  }

  return { applicable: true, seeded, skipped };
};

const markPlaybookEvidenceFresh = async (
  sb: any,
  userId: string,
  occurredAtIso: string,
): Promise<boolean> => {
  const { error } = await sb
    .from("ielts_playbook_user_profiles")
    .update({ evidence_updated_at: occurredAtIso })
    .eq("user_id", userId);
  if (error) {
    logOpsEvent("warn", opsDomain, "playbook_evidence_update_failed", {
      user_id: userId,
      error: (error as { message?: string }).message ?? String(error),
    });
    return false;
  }
  return true;
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

  // Allow internal scheduler calls that use the project service role key.
  const serviceRoleKey = getOptionalEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (serviceRoleKey && token === serviceRoleKey) return;

  const { data: authData, error: authError } = await sb.auth.getUser(token);
  if (authError || !authData?.user) throw new Error("Unauthorized");

  const { data: userRow } = await sb.from("users").select("role").eq("id", authData.user.id).maybeSingle();
  if (String((userRow as any)?.role ?? "").toLowerCase() !== "admin") throw new Error("Forbidden");
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
    const eventType = String(body.event_type ?? "exam.result").trim() || "exam.result";
    logOpsEvent("info", opsDomain, "run_started", {
      request_id: requestId,
      dry_run: dryRun,
      event_type: eventType,
      requested_limit: limit,
    });

    const { data: events, error: eventsError } = await sb
      .from("domain_event_outbox")
      .select("id, event_type, event_version, aggregate_type, aggregate_id, user_id, occurred_at, payload, status, attempts")
      .eq("event_type", eventType)
      .in("status", ["pending", "failed"])
      .order("created_at", { ascending: true })
      .limit(limit);

    if (eventsError) {
      logOpsEvent("error", opsDomain, "outbox_query_failed", {
        request_id: requestId,
        event_type: eventType,
        error: eventsError,
      });
      emitOpsAlert({
        domain: opsDomain,
        event: "outbox_query_failed",
        severity: "error",
        detail: {
          request_id: requestId,
          event_type: eventType,
          error: eventsError,
        },
      });
      return json(500, { error: "Failed to load outbox events", details: eventsError }, requestId);
    }

    const rows = (events ?? []) as OutboxEventRow[];
    let delivered = 0;
    let failed = 0;
    let skipped = 0;
    const details: Array<{ event_id: string; status: string; message?: string }> = [];

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
          details.push({ event_id: event.id, status: "skipped", message: "Could not claim event (already processing)" });
          continue;
        }

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

        // IELTS feedback loop side-effect. Best-effort: failures here do not
        // un-deliver the event (the profile upsert is the primary contract).
        let ieltsFeedback: IeltsFeedbackResult | null = null;
        if (!dryRun && latestOutcome && eventType === "exam.result") {
          try {
            ieltsFeedback = await seedIeltsSrsFromOutcome(sb, ctx.userId, latestOutcome);
            if (ieltsFeedback.applicable) {
              await markPlaybookEvidenceFresh(sb, ctx.userId, event.occurred_at);
            }
          } catch (err) {
            logOpsEvent("warn", opsDomain, "ielts_feedback_loop_failed", {
              event_id: event.id,
              user_id: ctx.userId,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }

        delivered += 1;
        const baseMessage = `sessions=${outcomeRows.length}`;
        const ieltsSuffix = ieltsFeedback?.applicable
          ? ` srs_seeded=${ieltsFeedback.seeded} srs_skipped=${ieltsFeedback.skipped}`
          : "";
        details.push({
          event_id: event.id,
          status: dryRun ? "validated" : "delivered",
          message: `${baseMessage}${ieltsSuffix}`,
        });
      } catch (err) {
        failed += 1;
        const message = err instanceof Error ? err.message : String(err);
        details.push({ event_id: event.id, status: "failed", message });
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
          .eq("event_type", eventType)
          .eq("status", "pending"),
        sb
          .from("domain_event_outbox")
          .select("id", { head: true, count: "exact" })
          .eq("event_type", eventType)
          .eq("status", "failed"),
        sb
          .from("domain_event_outbox")
          .select("created_at")
          .eq("event_type", eventType)
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
          event_type: eventType,
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
      event_type: eventType,
      processed: rows.length,
      delivered,
      failed,
      skipped,
      pending_count: pendingCount,
      failed_count: failedCount,
      oldest_pending_created_at: oldestPendingCreatedAt,
    });
    return json(200, {
      ok: true,
      dry_run: dryRun,
      event_type: eventType,
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
    }, requestId);
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
