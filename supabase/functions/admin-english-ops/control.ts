// English control center routes (platform admin):
//   GET   /control             settings, defaults, AI runtime (provider/model from env, read-only)
//   PATCH /control             validated change to services / free tier / AI switches
//   GET   /ai-usage?days=1..30 usage summary from english_ai_calls
//   GET   /learner?email=      support view of one learner (POST {email} keeps the email out of URLs and logs)
// Authorisation happens in index.ts (reads: admin.analytics.view, writes: admin.settings.manage).

import { englishAIRuntimeInfo } from "../_shared/english-ai.ts";
import { checkActivityAccess, learnerDayStart } from "../_shared/english-allowance.ts";
import { resolveEnglishProducts } from "../_shared/english-learning.ts";
import {
  clearEnglishSettingsCache,
  defaultEnglishSettings,
  ENGLISH_SERVICES,
  KNOWN_ENGLISH_AI_FEATURES,
  loadEnglishSettings,
  validateEnglishSettingsPatch,
} from "../_shared/english-settings.ts";
import { type AttemptRow, currentStreak, TODAY_SKILLS, type TodaySkill } from "../_shared/english-today.ts";

type Json = (status: number, body: unknown) => Response;
type Row = Record<string, unknown>;

export const CONTROL_ROUTES = ["/control", "/ai-usage", "/learner"];

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;

/** days query value, clamped to 1..30 (default 7). */
export const parseUsageDays = (raw: string | null): number => {
  const n = Number(raw);
  return Number.isInteger(n) ? Math.min(30, Math.max(1, n)) : 7;
};

const describe = (error: unknown): string =>
  error && typeof error === "object" && "message" in error ? String((error as { message?: unknown }).message ?? "") : String(error ?? "");

const loadControl = async (sb: any) => {
  const [settings, rowsRes, seenRes] = await Promise.all([
    loadEnglishSettings(sb, { fresh: true }),
    sb.from("english_service_settings").select("key, updated_at, updated_by"),
    sb.from("english_ai_calls").select("feature").gte("created_at", new Date(Date.now() - 30 * 86_400_000).toISOString())
      .order("created_at", { ascending: false }).limit(1000),
  ]);
  const seen = new Set<string>(((seenRes.data ?? []) as Row[]).map((row) => String(row.feature ?? "")).filter(Boolean));
  const envLimit = Deno.env.get("ENGLISH_AI_DAILY_LIMIT") ?? null;
  return {
    settings,
    defaults: defaultEnglishSettings(),
    services: ENGLISH_SERVICES,
    features: [...new Set([...KNOWN_ENGLISH_AI_FEATURES, ...seen, ...Object.keys(settings.ai.features)])].sort(),
    table_ready: !rowsRes.error,
    updated: ((rowsRes.data ?? []) as Row[]).map((row) => ({
      key: String(row.key),
      updated_at: row.updated_at ?? null,
      updated_by: row.updated_by ?? null,
    })),
    runtime: { ...englishAIRuntimeInfo(), env_daily_limit: envLimit ? Number(envLimit) || null : null },
  };
};

const learnerView = async (sb: any, email: string, languageId: string, json: Json): Promise<Response> => {
  const { data: user, error } = await sb.from("users")
    .select("id, role, created_at, telegram_chat_id")
    // Exact match, ignoring case (LIKE wildcards in the email are escaped).
    .ilike("email", email.replace(/[\\%_]/g, (char) => "\\" + char))
    .limit(2);
  if (error) return json(500, { error: "Could not look up the learner", details: describe(error) });
  const rows = (user ?? []) as Row[];
  if (rows.length === 0) return json(404, { error: "No Schood account with this email.", code: "learner_not_found" });
  if (rows.length > 1) return json(409, { error: "More than one account matches; type the full email.", code: "learner_ambiguous" });
  const learner = rows[0]!;
  const userId = String(learner.id);

  const products = await resolveEnglishProducts(sb) as Record<string, { productId?: string | null }>;
  const productIds = Object.values(products).map((product) => String(product?.productId ?? "")).filter(Boolean);
  const utcDayStart = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z").toISOString();

  const [access, memberships, goalRes, attemptsRes, streakRes, aiCallsRes, aiDailyRes] = await Promise.all([
    checkActivityAccess(sb, { userId, languageId, products, skill: null }),
    sb.from("tenant_memberships").select("tenant_id").eq("user_id", userId).eq("status", "active")
      .order("created_at", { ascending: true }).limit(1),
    sb.from("learner_language_goals").select("current_cefr_estimate, target_cefr, daily_time_minutes, metadata")
      .eq("user_id", userId).eq("language_id", languageId).maybeSingle(),
    sb.from("learning_attempts")
      .select("id, content_item_id, service_key, status, overall_score, correctness_ratio, submitted_at, created_at")
      .eq("user_id", userId).eq("language_id", languageId)
      .order("created_at", { ascending: false }).limit(10),
    sb.from("learning_attempts").select("content_item_id, service_key, submitted_at")
      .eq("user_id", userId).eq("language_id", languageId)
      .in("status", ["submitted", "scored", "failed"]).not("submitted_at", "is", null)
      .gte("submitted_at", new Date(Date.now() - 60 * 86_400_000).toISOString())
      .limit(1000),
    sb.from("english_ai_calls").select("status").eq("user_id", userId).gte("created_at", utcDayStart).limit(1000),
    sb.from("english_ai_usage_daily").select("request_count").eq("user_id", userId)
      .eq("usage_date", utcDayStart.slice(0, 10)).maybeSingle(),
  ]);

  const tenantId = String(memberships.data?.[0]?.tenant_id ?? "") || null;
  const { data: entRows } = tenantId && productIds.length
    ? await sb.from("entitlements").select("resource_id, is_active, starts_at, ends_at")
      .eq("tenant_id", tenantId).eq("resource_type", "product").in("resource_id", productIds)
    : { data: [] };
  const entitlements = Object.entries(products).map(([skill, product]) => {
    const matches = ((entRows ?? []) as Row[]).filter((row) => String(row.resource_id) === String(product?.productId ?? ""));
    const latest = matches.sort((a, b) => String(b.ends_at ?? "9999").localeCompare(String(a.ends_at ?? "9999")))[0];
    return {
      skill,
      active: access.admin || access.entitled_skills.includes(skill),
      ends_at: latest?.ends_at ?? null,
      starts_at: latest?.starts_at ?? null,
    };
  });

  const learnerDate = new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 10);
  const streakAttempts: AttemptRow[] = ((streakRes.data ?? []) as Row[])
    .filter((row) => (TODAY_SKILLS as readonly string[]).includes(String(row.service_key)))
    .map((row) => ({
      content_item_id: String(row.content_item_id ?? ""),
      skill: String(row.service_key) as TodaySkill,
      score: null,
      submitted_at: String(row.submitted_at),
    }));

  const recent = (attemptsRes.data ?? []) as Row[];
  const itemIds = [...new Set(recent.map((row) => String(row.content_item_id ?? "")).filter((id) => /^[0-9a-f-]{36}$/i.test(id)))];
  const { data: itemRows } = itemIds.length
    ? await sb.from("learning_content_registry_items").select("id, title, source_ref").in("id", itemIds)
    : { data: [] };
  const titles = new Map(((itemRows ?? []) as Row[]).map((row) => [String(row.id), String(row.title ?? row.source_ref ?? "")]));

  const goal = goalRes.data as Row | null;
  const meta = (goal?.metadata && typeof goal.metadata === "object" ? goal.metadata : {}) as Row;
  const placement = (meta.placement && typeof meta.placement === "object" ? meta.placement : null) as Row | null;
  const aiCalls = (aiCallsRes.data ?? []) as Row[];

  return json(200, {
    ok: true,
    learner: {
      user_id: userId,
      role: String(learner.role ?? "student"),
      created_at: learner.created_at ?? null,
      telegram_linked: Boolean(learner.telegram_chat_id),
      tenant_id: tenantId,
    },
    entitlements,
    free: {
      left_today: access.admin ? null : access.free_left,
      per_day: access.free_per_day,
      day_started_at: learnerDayStart(),
    },
    level: {
      current: goal?.current_cefr_estimate ?? null,
      target: goal?.target_cefr ?? null,
      placement_done: Boolean(placement?.completed_at),
      daily_minutes: goal?.daily_time_minutes ?? null,
    },
    streak: currentStreak(streakAttempts, learnerDate),
    recent_attempts: recent.map((row) => {
      // Same as the learner sees: accuracy 0..1 shown as a percentage.
      const raw = Number(row.correctness_ratio ?? row.overall_score);
      const scored = row.correctness_ratio != null || row.overall_score != null;
      return {
        id: row.id,
        skill: row.service_key,
        status: row.status,
        score_percent: scored && Number.isFinite(raw) ? Math.round(Math.max(0, Math.min(1, raw)) * 100) : null,
        title: titles.get(String(row.content_item_id ?? "")) || null,
        at: row.submitted_at ?? row.created_at ?? null,
      };
    }),
    ai_today: {
      credits_used: Number((aiDailyRes.data as Row | null)?.request_count ?? 0),
      calls: aiCalls.length,
      ok: aiCalls.filter((row) => row.status === "ok").length,
      failed: aiCalls.filter((row) => row.status === "failed").length,
      over_limit: aiCalls.filter((row) => row.status === "over_limit").length,
    },
  });
};

/** Handles the control-center routes, or returns null for any other route. */
export const handleControlRoute = async (input: {
  sb: any;
  req: Request;
  url: URL;
  route: string;
  body: Row;
  adminUserId: string;
  languageId: string;
  json: Json;
}): Promise<Response | null> => {
  const { sb, req, url, route, body, adminUserId, languageId, json } = input;

  if (route === "/control" && req.method === "GET") {
    return json(200, { ok: true, ...(await loadControl(sb)) });
  }

  if (route === "/control" && req.method === "PATCH") {
    const current = await loadEnglishSettings(sb, { fresh: true });
    const result = validateEnglishSettingsPatch(current, body);
    if (!result.ok) return json(422, { error: result.errors[0], errors: result.errors, code: "invalid_settings" });
    const now = new Date().toISOString();
    const { error } = await sb.from("english_service_settings").upsert(
      result.rows.map((row) => ({ key: row.key, value: row.value, updated_at: now, updated_by: adminUserId })),
      { onConflict: "key" },
    );
    if (error) return json(500, { error: "Could not save the settings", details: describe(error) });
    clearEnglishSettingsCache();
    console.log(JSON.stringify({ event: "english_settings_changed", by: adminUserId, keys: result.rows.map((row) => row.key) }));
    return json(200, { ok: true, ...(await loadControl(sb)) });
  }

  if (route === "/ai-usage" && req.method === "GET") {
    const days = parseUsageDays(url.searchParams.get("days"));
    const { data, error } = await sb.rpc("english_ai_usage_summary", { p_days: days });
    if (error) return json(500, { error: "Could not load AI usage", details: describe(error) });
    return json(200, { ok: true, days, ...(data && typeof data === "object" ? data as Row : {}) });
  }

  if (route === "/learner" && (req.method === "GET" || req.method === "POST")) {
    const email = String((req.method === "POST" ? body.email : url.searchParams.get("email")) ?? "").trim().toLowerCase();
    if (!EMAIL.test(email)) return json(422, { error: "Type the learner's full email address.", code: "invalid_email" });
    return await learnerView(sb, email, languageId, json);
  }

  return null;
};
