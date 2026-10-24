import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authorizeAdminRequest } from "../_shared/admin-access.ts";
import { CONTROL_ROUTES, handleControlRoute } from "./control.ts";
import {
  DEFAULT_ENGLISH_RULE_CONFIGS,
  asRecord,
  loadEnglishRuleConfigs,
  logEnglishAnalyticsEvents,
  normalizeRuleServiceKey,
  normalizeServiceKey,
  resolveLanguageScope,
  toNullableText,
  toNumber,
  toText,
  type EnglishRuleConfig,
  type EnglishServiceKey,
} from "../_shared/english-learning.ts";

type JsonRecord = Record<string, unknown>;

const routeMarker = "/admin-english-ops";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
};

const getEnv = (key: string): string => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Missing env var: ${key}`);
  return value;
};

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

const isObject = (value: unknown): value is JsonRecord =>
  !!value && typeof value === "object" && !Array.isArray(value);

const extractRoute = (url: URL, marker: string): string => {
  const idx = url.pathname.indexOf(marker);
  if (idx < 0) return "";
  const tail = url.pathname.slice(idx + marker.length);
  return tail.startsWith("/") ? tail : tail ? `/${tail}` : "";
};

const parseBody = async (req: Request): Promise<JsonRecord> => {
  try {
    const parsed = await req.json();
    return isObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const toDayKey = (iso: string): string => {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
};

const getRecentDayKeys = (days: number): string[] => {
  const out: string[] = [];
  const base = new Date();
  base.setUTCHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(base);
    d.setUTCDate(base.getUTCDate() - i);
    out.push(toDayKey(d.toISOString()));
  }
  return out;
};

const isoDaysAgo = (days: number): string => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

const normalizeRuleList = (rules: Record<string, EnglishRuleConfig>): EnglishRuleConfig[] =>
  Object.values(rules).sort((a, b) => {
    if (a.serviceKey === b.serviceKey) return a.ruleKey.localeCompare(b.ruleKey);
    if (a.serviceKey === "*") return -1;
    if (b.serviceKey === "*") return 1;
    return a.serviceKey.localeCompare(b.serviceKey);
  });

const serviceKeyFromMeta = (row: Record<string, unknown>, key: string): EnglishServiceKey | null =>
  normalizeServiceKey(asRecord(row.metadata)[key] ?? asRecord(row.payload)[key] ?? row[key] ?? null);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const route = extractRoute(url, routeMarker);
    const needsSettingsPermission = req.method === "PATCH";
    const isControlRoute = CONTROL_ROUTES.includes(route);

    const sb = createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false },
    });
    const authz = await authorizeAdminRequest(sb, req, corsHeaders, {
      requiredPermission: needsSettingsPermission ? "admin.settings.manage" : "admin.analytics.view",
      action: isControlRoute
        ? (needsSettingsPermission ? "admin.english_ops.control.update" : "admin.english_ops.control.view")
        : (needsSettingsPermission ? "admin.english_ops.settings" : "admin.english_ops.analytics"),
    });
    if (!authz.ok) return authz.response;

    const body = req.method === "PATCH" || req.method === "POST" ? await parseBody(req) : {};
    const scope = await resolveLanguageScope(
      sb,
      toText(url.searchParams.get("language_code") ?? body.language_code, 16) || "en",
    );

    // === English control center: switches, AI usage, learner support view (./control.ts) ===
    if (isControlRoute) {
      const controlResponse = await handleControlRoute({
        sb,
        req,
        url,
        route,
        body,
        adminUserId: authz.context.userId,
        languageId: scope.languageId,
        json,
      });
      if (controlResponse) return controlResponse;
    }

    if (req.method === "GET" && (route === "" || route === "/" || route === "/rules")) {
      const rules = await loadEnglishRuleConfigs(sb, scope.languageId);
      return json(200, {
        rules: normalizeRuleList(rules),
        defaults: normalizeRuleList(DEFAULT_ENGLISH_RULE_CONFIGS),
        scope: {
          language_id: scope.languageId,
          language_code: scope.languageCode,
        },
      });
    }

    if (req.method === "PATCH" && (route === "" || route === "/" || route === "/rules")) {
      const updates = Array.isArray(body.updates)
        ? body.updates
        : body.rule_key
        ? [body]
        : [];
      if (updates.length === 0) return json(422, { error: "Provide rule updates in updates[] or as a single rule payload." });

      const upserts: Array<Record<string, unknown>> = [];
      const events: Array<{
        actorUserId?: string | null;
        learnerUserId?: string | null;
        languageId: string;
        eventType: "rule_updated";
        sourceServiceKey?: EnglishServiceKey | null;
        targetServiceKey?: EnglishServiceKey | null;
        relatedAttemptId?: string | null;
        payload?: JsonRecord | null;
      }> = [];

      for (const entry of updates) {
        const patch = isObject(entry) ? entry : {};
        const ruleKey = toText(patch.rule_key, 120);
        if (!ruleKey) continue;
        const serviceKey = normalizeRuleServiceKey(patch.service_key) ?? DEFAULT_ENGLISH_RULE_CONFIGS[ruleKey]?.serviceKey ?? "*";
        const thresholds = isObject(patch.thresholds) ? patch.thresholds : {};
        const enabled = typeof patch.enabled === "boolean" ? patch.enabled : DEFAULT_ENGLISH_RULE_CONFIGS[ruleKey]?.enabled ?? true;
        const notes = patch.notes === null ? null : toNullableText(patch.notes, 2000);
        const metadata = {
          ...asRecord(patch.metadata),
          updated_via: "admin-english-ops",
        };

        upserts.push({
          language_id: scope.languageId,
          rule_key: ruleKey,
          service_key: serviceKey,
          enabled,
          thresholds,
          notes,
          metadata,
          created_by: authz.context.userId,
          updated_by: authz.context.userId,
        });
        events.push({
          actorUserId: authz.context.userId,
          languageId: scope.languageId,
          eventType: "rule_updated",
          sourceServiceKey: serviceKey === "*" ? null : serviceKey,
          payload: {
            rule_key: ruleKey,
            service_key: serviceKey,
            enabled,
            thresholds,
            notes,
          },
        });
      }

      if (upserts.length === 0) return json(422, { error: "No valid rule updates were provided." });

      const { error } = await sb
        .from("english_learning_rule_configs")
        .upsert(upserts, { onConflict: "language_id,rule_key,service_key" });
      if (error) return json(500, { error: "Failed to update English rule configs", details: error.message });

      await logEnglishAnalyticsEvents(sb, events);
      const rules = await loadEnglishRuleConfigs(sb, scope.languageId);
      return json(200, {
        ok: true,
        rules: normalizeRuleList(rules),
      });
    }

    if (req.method === "GET" && route === "/dashboard") {
      const rules = await loadEnglishRuleConfigs(sb, scope.languageId);
      const handoffRule = rules.handoff_effectiveness ?? DEFAULT_ENGLISH_RULE_CONFIGS.handoff_effectiveness;
      const successWindowDays = Math.max(1, Math.floor(toNumber(handoffRule.thresholds.success_window_days) ?? 7));
      const successScore = Math.max(0.1, Math.min(0.99, toNumber(handoffRule.thresholds.success_score) ?? 0.65));
      const vocabActivationRule = rules.vocabulary_activation ?? DEFAULT_ENGLISH_RULE_CONFIGS.vocabulary_activation;
      const activationIdleDays = Math.max(1, Math.floor(toNumber(vocabActivationRule.thresholds.idle_days) ?? 5));
      const since30d = isoDaysAgo(30);
      const sinceWindow = isoDaysAgo(30 + successWindowDays);
      const since7d = isoDaysAgo(7);

      const [
        recommendationsRes,
        attemptsRes,
        masteryEventsRes,
        ruleEventsRes,
        activeRecommendationsRes,
        activationCandidatesRes,
      ] = await Promise.all([
        sb
          .from("learner_language_recommendations")
          .select("id, user_id, recommended_service_key, recommendation_type, created_at, priority, payload, metadata")
          .eq("language_id", scope.languageId)
          .gte("created_at", since30d)
          .order("created_at", { ascending: false }),
        sb
          .from("learning_attempts")
          .select("user_id, service_key, overall_score, created_at")
          .eq("language_id", scope.languageId)
          .gte("created_at", sinceWindow)
          .order("created_at", { ascending: true }),
        sb
          .from("english_learning_analytics_events")
          .select("learner_user_id, source_service_key, target_service_key, payload, created_at")
          .eq("language_id", scope.languageId)
          .eq("event_type", "mastery_reopened")
          .gte("created_at", since30d)
          .order("created_at", { ascending: false }),
        sb
          .from("english_learning_analytics_events")
          .select("actor_user_id, payload, created_at")
          .eq("language_id", scope.languageId)
          .eq("event_type", "rule_updated")
          .gte("created_at", since30d)
          .order("created_at", { ascending: false })
          .limit(20),
        sb
          .from("learner_language_recommendations")
          .select("id", { head: true, count: "exact" })
          .eq("language_id", scope.languageId)
          .eq("status", "active"),
        sb
          .from("user_vocabulary_notebook_entries")
          .select("id", { head: true, count: "exact" })
          .eq("language_id", scope.languageId)
          .eq("is_archived", false)
          .eq("correct_count", 0)
          .lte("created_at", isoDaysAgo(activationIdleDays)),
      ]);

      const recommendations = Array.isArray(recommendationsRes.data) ? recommendationsRes.data as Array<Record<string, unknown>> : [];
      const attempts = Array.isArray(attemptsRes.data) ? attemptsRes.data as Array<Record<string, unknown>> : [];
      const masteryEvents = Array.isArray(masteryEventsRes.data) ? masteryEventsRes.data as Array<Record<string, unknown>> : [];
      const ruleEvents = Array.isArray(ruleEventsRes.data) ? ruleEventsRes.data as Array<Record<string, unknown>> : [];

      const attemptsByUserService = new Map<string, Array<Record<string, unknown>>>();
      for (const attempt of attempts) {
        const userId = toText(attempt.user_id, 120);
        const serviceKey = normalizeServiceKey(attempt.service_key);
        if (!userId || !serviceKey) continue;
        const key = `${userId}:${serviceKey}`;
        const bucket = attemptsByUserService.get(key) ?? [];
        bucket.push(attempt);
        attemptsByUserService.set(key, bucket);
      }

      const handoffTypes = new Set(["transfer", "application", "activation", "remediation", "recovery"]);
      const productiveServices = new Set<EnglishServiceKey>(["writing", "speaking", "immersion"]);
      const handoffByType = new Map<string, { generated: number; attempted: number; successful: number; scoreSum: number; scoreCount: number }>();
      const routeMap = new Map<string, {
        source_service_key: string;
        target_service_key: string;
        generated: number;
        attempted: number;
        successful: number;
        score_sum: number;
        score_count: number;
      }>();
      let activationAttempted = 0;
      let activationSuccessful = 0;

      for (const rec of recommendations) {
        const recommendationType = toText(rec.recommendation_type, 80).toLowerCase();
        const targetService = normalizeServiceKey(rec.recommended_service_key);
        const sourceService = serviceKeyFromMeta(rec, "source_service_key");
        const userId = toText(rec.user_id, 120);
        const createdAt = new Date(String(rec.created_at ?? ""));
        if (!userId || !targetService || Number.isNaN(createdAt.getTime())) continue;

        const meta = asRecord(rec.metadata);
        const payload = asRecord(rec.payload);
        const windowDays = Math.max(1, Math.floor(toNumber(meta.success_window_days ?? payload.success_window_days) ?? successWindowDays));
        const successThreshold = Math.max(0.1, Math.min(0.99, toNumber(meta.success_score_threshold ?? payload.success_score_threshold) ?? successScore));
        const windowEnd = createdAt.getTime() + (windowDays * 24 * 60 * 60 * 1000);
        const attemptBucket = attemptsByUserService.get(`${userId}:${targetService}`) ?? [];
        const matchingAttempts = attemptBucket.filter((attempt) => {
          const created = new Date(String(attempt.created_at ?? ""));
          if (Number.isNaN(created.getTime())) return false;
          return created.getTime() >= createdAt.getTime() && created.getTime() <= windowEnd;
        });
        const bestScore = matchingAttempts.reduce((best, attempt) => Math.max(best, Number(attempt.overall_score ?? 0)), 0);
        const attempted = matchingAttempts.length > 0;
        const successful = attempted && bestScore >= successThreshold;

        if (handoffTypes.has(recommendationType)) {
          const typeBucket = handoffByType.get(recommendationType) ?? { generated: 0, attempted: 0, successful: 0, scoreSum: 0, scoreCount: 0 };
          typeBucket.generated += 1;
          if (attempted) typeBucket.attempted += 1;
          if (successful) typeBucket.successful += 1;
          if (attempted) {
            typeBucket.scoreSum += bestScore;
            typeBucket.scoreCount += 1;
          }
          handoffByType.set(recommendationType, typeBucket);
        }

        const routeKey = `${sourceService ?? "*"}->${targetService}`;
        const routeBucket = routeMap.get(routeKey) ?? {
          source_service_key: sourceService ?? "*",
          target_service_key: targetService,
          generated: 0,
          attempted: 0,
          successful: 0,
          score_sum: 0,
          score_count: 0,
        };
        routeBucket.generated += 1;
        if (attempted) routeBucket.attempted += 1;
        if (successful) routeBucket.successful += 1;
        if (attempted) {
          routeBucket.score_sum += bestScore;
          routeBucket.score_count += 1;
        }
        routeMap.set(routeKey, routeBucket);

        if (recommendationType === "activation") {
          const productiveAttempted = Array.from(productiveServices).some((service) => {
            const bucket = attemptsByUserService.get(`${userId}:${service}`) ?? [];
            return bucket.some((attempt) => {
              const created = new Date(String(attempt.created_at ?? ""));
              if (Number.isNaN(created.getTime())) return false;
              return created.getTime() >= createdAt.getTime() && created.getTime() <= windowEnd;
            });
          });
          if (productiveAttempted) activationAttempted += 1;
          if (productiveAttempted && successful) activationSuccessful += 1;
        }
      }

      const masteryDaily = new Map<string, number>();
      const masteryByService = new Map<string, number>();
      for (const event of masteryEvents) {
        const day = toDayKey(String(event.created_at ?? new Date().toISOString()));
        masteryDaily.set(day, (masteryDaily.get(day) ?? 0) + 1);
        const sourceService = normalizeServiceKey(event.source_service_key);
        const key = sourceService ?? "unknown";
        masteryByService.set(key, (masteryByService.get(key) ?? 0) + 1);
      }

      const masteryDailySeries = getRecentDayKeys(14).map((day) => ({
        day,
        count: masteryDaily.get(day) ?? 0,
      }));
      const masteryByServiceRows = Array.from(masteryByService.entries())
        .map(([service_key, count]) => ({ service_key, count }))
        .sort((a, b) => b.count - a.count);

      const recentRuleChanges = ruleEvents.map((event) => ({
        actor_user_id: event.actor_user_id ?? null,
        rule_key: toText(asRecord(event.payload).rule_key, 120),
        service_key: toText(asRecord(event.payload).service_key, 80) || "*",
        created_at: event.created_at,
      }));

      return json(200, {
        generated_at: new Date().toISOString(),
        scope: {
          language_id: scope.languageId,
          language_code: scope.languageCode,
        },
        rules: normalizeRuleList(rules),
        overview: {
          recommendations_30d: recommendations.length,
          active_recommendations_now: Number(activeRecommendationsRes.count ?? 0),
          mastery_reopenings_30d: masteryEvents.length,
          mastery_reopenings_7d: masteryEvents.filter((event) => String(event.created_at ?? "") >= since7d).length,
          activation_candidates_now: Number(activationCandidatesRes.count ?? 0),
          recent_rule_changes_30d: recentRuleChanges.length,
        },
        handoff_effectiveness: Array.from(handoffByType.entries())
          .map(([recommendation_type, row]) => ({
            recommendation_type,
            generated: row.generated,
            attempted: row.attempted,
            successful: row.successful,
            attempt_rate: row.generated > 0 ? row.attempted / row.generated : 0,
            success_rate: row.attempted > 0 ? row.successful / row.attempted : 0,
            avg_attempt_score: row.scoreCount > 0 ? row.scoreSum / row.scoreCount : null,
          }))
          .sort((a, b) => b.generated - a.generated),
        mastery_reopenings: {
          by_service: masteryByServiceRows,
          daily: masteryDailySeries,
        },
        vocabulary_activation: {
          activation_candidates_now: Number(activationCandidatesRes.count ?? 0),
          activation_recommendations_30d: recommendations.filter((row) => toText(row.recommendation_type, 80).toLowerCase() === "activation").length,
          productive_followthrough_30d: activationAttempted,
          successful_followthrough_30d: activationSuccessful,
          idle_days_threshold: activationIdleDays,
        },
        service_transfer: Array.from(routeMap.values())
          .map((row) => ({
            source_service_key: row.source_service_key,
            target_service_key: row.target_service_key,
            generated: row.generated,
            attempted: row.attempted,
            successful: row.successful,
            avg_attempt_score: row.score_count > 0 ? row.score_sum / row.score_count : null,
          }))
          .sort((a, b) => b.generated - a.generated)
          .slice(0, 12),
        recent_rule_changes: recentRuleChanges,
      });
    }

    return json(405, { error: "Method not allowed" });
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : "Unknown error" });
  }
});
