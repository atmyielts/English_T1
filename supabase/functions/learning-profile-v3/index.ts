import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  asRecord,
  authUser,
  cefrFromPercent,
  computeServiceReadiness,
  corsHeaders,
  getEnv,
  json,
  resolveLanguageScope,
  roundTo,
  toNumber,
  toText,
} from "../_shared/english-learning.ts";

type JsonRecord = Record<string, unknown>;

const summarizeSubskills = (rows: Array<Record<string, unknown>>): Record<string, unknown> => {
  const buckets = new Map<string, { total: number; samples: number; latestAt: string | null }>();
  for (const row of rows) {
    const skillKey = toText(row.skill_key, 160);
    if (!skillKey.includes(".")) continue;
    const metricKey = toText(row.metric_key, 120).toLowerCase();
    const metricValue = toNumber(row.metric_value);
    if (metricValue == null) continue;
    if (metricKey !== "overall_score" && metricKey !== "correctness_ratio") continue;
    const bucket = buckets.get(skillKey) ?? { total: 0, samples: 0, latestAt: null };
    bucket.total += metricValue;
    bucket.samples += 1;
    bucket.latestAt = toText(row.occurred_at, 64) || bucket.latestAt;
    buckets.set(skillKey, bucket);
  }

  const out: Record<string, unknown> = {};
  for (const [skillKey, bucket] of buckets.entries()) {
    out[skillKey] = {
      value_avg: bucket.samples > 0 ? roundTo(bucket.total / bucket.samples, 4) : null,
      samples: bucket.samples,
      latest_at: bucket.latestAt,
    };
  }
  return out;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return json(405, { error: "Method not allowed" });

  try {
    const supabaseUrl = getEnv("SUPABASE_URL");
    const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
    const sb = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const auth = await authUser(sb, req);
    if (!auth) return json(401, { error: "Unauthorized" });

    const url = new URL(req.url);
    const requestedUserId = toText(url.searchParams.get("user_id"), 80);
    const { data: profileRow } = await sb.from("users").select("role").eq("id", auth.userId).maybeSingle();
    const isAdmin = String((profileRow as any)?.role ?? "").toLowerCase() === "admin";
    const targetUserId = requestedUserId && requestedUserId !== auth.userId && isAdmin ? requestedUserId : auth.userId;
    const scope = await resolveLanguageScope(sb, toText(url.searchParams.get("language_code"), 16) || "en");
    const productId = toText(url.searchParams.get("product_id"), 80);
    const limit = Math.max(1, Math.min(120, Math.floor(toNumber(url.searchParams.get("limit")) ?? 40)));

    let outcomesQuery = sb
      .from("exam_outcomes")
      .select("id, session_id, user_id, product_id, experience_id, score_method, status, schema_version, overall_score, overall_band, section_scores, skill_breakdown, computed_at")
      .eq("user_id", targetUserId)
      .order("computed_at", { ascending: false })
      .limit(limit);
    if (productId) outcomesQuery = outcomesQuery.eq("product_id", productId);

    const [languageProjectionRes, productProjectionRes, goalsRes, masteryRes, errorRes, recRes, signalRes, outcomesRes] = await Promise.all([
      sb
        .from("learner_language_profiles")
        .select("user_id, language_id, schema_version, signals_count, sessions_count, profile, service_breakdown, latest_signal_at, latest_event_id, latest_event_at, updated_at")
        .eq("user_id", targetUserId)
        .eq("language_id", scope.languageId)
        .maybeSingle(),
      productId
        ? sb
          .from("learner_skill_profiles")
          .select("user_id, product_id, schema_version, signals_count, sessions_count, profile, latest_result, latest_event_id, latest_event_at, updated_at")
          .eq("user_id", targetUserId)
          .eq("product_id", productId)
          .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      sb
        .from("learner_language_goals")
        .select("*")
        .eq("user_id", targetUserId)
        .eq("language_id", scope.languageId)
        .maybeSingle(),
      sb
        .from("learner_language_mastery")
        .select("service_key, skill_key, unit_key, state, confidence, last_practiced_at")
        .eq("user_id", targetUserId)
        .eq("language_id", scope.languageId)
        .order("updated_at", { ascending: false })
        .limit(120),
      sb
        .from("learner_language_errors")
        .select("service_key, skill_key, subskill_key, error_type, error_frequency, severity_score, mastery_status, last_seen_at")
        .eq("user_id", targetUserId)
        .eq("language_id", scope.languageId)
        .order("severity_score", { ascending: false })
        .order("last_seen_at", { ascending: false })
        .limit(12),
      sb
        .from("learner_language_recommendations")
        .select("recommended_service_key, recommendation_type, title, reason, priority, status")
        .eq("user_id", targetUserId)
        .eq("language_id", scope.languageId)
        .eq("status", "active")
        .order("priority", { ascending: false })
        .limit(10),
      sb
        .from("language_signals")
        .select("skill_key, metric_key, metric_value, confidence, occurred_at")
        .eq("user_id", targetUserId)
        .eq("language_id", scope.languageId)
        .order("occurred_at", { ascending: false })
        .limit(240),
      outcomesQuery,
    ]);

    if (outcomesRes.error) return json(500, { error: "Failed to load outcomes", details: outcomesRes.error.message });

    const languageProfile = asRecord(languageProjectionRes.data?.profile);
    const serviceBreakdown = asRecord(languageProjectionRes.data?.service_breakdown);
    const serviceScores = computeServiceReadiness(languageProfile, serviceBreakdown);
    const averageScore = serviceScores.length > 0
      ? serviceScores.reduce((sum, row) => sum + row.score, 0) / serviceScores.length
      : 72;
    const cefrEstimate = toText(goalsRes.data?.current_cefr_estimate, 8) || cefrFromPercent(averageScore);

    const masteryRows = Array.isArray(masteryRes.data) ? masteryRes.data as Array<Record<string, unknown>> : [];
    const masterySummary = {
      counts: masteryRows.reduce<Record<string, number>>((acc, row) => {
        const state = toText(row.state, 40) || "new";
        acc[state] = (acc[state] ?? 0) + 1;
        return acc;
      }, {}),
      unstable_units: masteryRows
        .filter((row) => {
          const state = toText(row.state, 40);
          return state === "unstable" || state === "learning";
        })
        .slice(0, 8)
        .map((row) => ({
          service_key: toText(row.service_key, 80),
          skill_key: toText(row.skill_key, 120),
          unit_key: toText(row.unit_key, 160),
          state: toText(row.state, 40),
          confidence: toNumber(row.confidence),
          last_practiced_at: toText(row.last_practiced_at, 64),
        })),
    };

    const recentErrors = Array.isArray(errorRes.data) ? errorRes.data : [];
    const activeRecommendations = Array.isArray(recRes.data) ? recRes.data : [];
    const subskillScores = summarizeSubskills(Array.isArray(signalRes.data) ? signalRes.data as Array<Record<string, unknown>> : []);

    return json(200, {
      user_id: targetUserId,
      generated_at: new Date().toISOString(),
      scope: {
        language_id: scope.languageId,
        language_code: scope.languageCode,
        language_name: scope.languageName,
        product_id: productId || null,
      },
      latest_outcome: Array.isArray(outcomesRes.data) ? outcomesRes.data[0] ?? null : null,
      outcomes: outcomesRes.data ?? [],
      skill_profile: asRecord(productProjectionRes.data?.profile),
      language_profile: languageProfile,
      service_breakdown: serviceBreakdown,
      projection: languageProjectionRes.data
        ? {
            schema_version: languageProjectionRes.data.schema_version,
            signals_count: languageProjectionRes.data.signals_count,
            sessions_count: languageProjectionRes.data.sessions_count,
            latest_signal_at: languageProjectionRes.data.latest_signal_at,
            latest_event_id: languageProjectionRes.data.latest_event_id,
            latest_event_at: languageProjectionRes.data.latest_event_at,
            updated_at: languageProjectionRes.data.updated_at,
          }
        : null,
      skill_scores: Object.fromEntries(serviceScores.map((row) => [row.serviceKey, row.score])),
      subskill_scores: subskillScores,
      cefr_estimate: cefrEstimate,
      target_cefr: toText(goalsRes.data?.target_cefr, 8) || null,
      learner_goals: Array.isArray(goalsRes.data?.goal_keys) ? goalsRes.data.goal_keys : [],
      daily_time_preference_minutes: Number(goalsRes.data?.daily_time_minutes ?? 40),
      mastery_summary: masterySummary,
      recent_error_clusters: recentErrors.map((row) => ({
        service_key: toText((row as any).service_key, 80),
        skill_key: toText((row as any).skill_key, 120),
        subskill_key: toText((row as any).subskill_key, 120),
        error_type: toText((row as any).error_type, 240),
        error_frequency: Number((row as any).error_frequency ?? 0),
        severity_score: toNumber((row as any).severity_score),
        mastery_status: toText((row as any).mastery_status, 40),
        last_seen_at: toText((row as any).last_seen_at, 64),
      })),
      recommendation_summary: {
        active_count: activeRecommendations.length,
        queue: activeRecommendations,
      },
    });
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : "Unknown error" });
  }
});
