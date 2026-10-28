import { looksLikeUserToken } from "./ielts-playbook-routes.ts";

type JsonRecord = Record<string, unknown>;

export type AuthedContext = {
  userId: string;
  token: string;
  email: string | null;
};

export type PlaybookScope = {
  playbookProductId: string;
  simulatorProductId: string;
  practiceProductId: string;
  languageCode: string;
  languageId: string | null;
};

export type PlaybookProfileRow = {
  user_id: string;
  product_id: string;
  target_overall_band: number;
  current_band_or_estimate: number | null;
  deadline_date: string | null;
  weakest_skill: string | null;
  purpose: string;
  destination_country_code: string | null;
  test_market_country_code: string | null;
  preferred_delivery_mode: string | null;
  provider_key: string;
  program_requires_academic: boolean;
  metadata: JsonRecord;
  created_at: string;
  updated_at: string;
};

export type MarketGuidanceRow = {
  id: string;
  country_code: string;
  provider_key: string;
  summary: string;
  status: string;
  ukvi_available: boolean;
  computer_available: boolean;
  writing_on_paper_available: boolean;
  one_skill_retake_available: boolean;
  result_timing_note: string | null;
  booking_url: string | null;
  verified_at: string | null;
  published_at: string | null;
  metadata: JsonRecord;
};

export type PlanTemplateRow = {
  id: string;
  slug: string;
  plan_type: "crash" | "balanced" | "improvement" | "skill_recovery";
  title: string;
  summary: string;
  duration_days: number;
  band_min: number;
  band_max: number;
  focus_skill: string | null;
  intensity: string;
  schedule_json: JsonRecord;
  metadata: JsonRecord;
};

export type PageRow = {
  id: string;
  parent_page_id: string | null;
  page_type: string;
  module_key: string | null;
  slug: string;
  title: string;
  summary: string;
  status: string;
  visibility: string;
  locale_code: string;
  country_scope: string[];
  variant_scope: JsonRecord;
  sort_order: number;
  seo_title: string | null;
  seo_description: string | null;
  published_at: string | null;
  metadata: JsonRecord;
};

export type PageSectionRow = {
  id: string;
  page_id: string;
  block_type: string;
  heading: string | null;
  status: string;
  sort_order: number;
  content: JsonRecord;
  metadata: JsonRecord;
};

export type SourceRow = {
  id: string;
  source_type: string;
  provider_key: string | null;
  title: string;
  url: string | null;
  summary: string;
  status: string;
  verified_at: string | null;
  published_at: string | null;
  last_checked_at: string | null;
  metadata: JsonRecord;
};

export type OutcomeRow = {
  id: string;
  session_id: string;
  product_id?: string | null;
  overall_band: number | null;
  section_scores: JsonRecord;
  computed_at: string;
};

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-user-jwt",
  // DELETE is needed by the notes page (removing a highlight); without it the
  // browser preflight fails and the Remove button silently does nothing.
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
};

export const PLAYBOOK_PRODUCT_SLUG = "ielts-playbook";
export const PLAYBOOK_PRODUCT_ID_FALLBACK = "9de6c9e7-31df-4d1d-9574-1f8f84a53b54";
export const SIMULATOR_PRODUCT_SLUG = "ielts-academic-simulator";
export const SIMULATOR_PRODUCT_ID_FALLBACK = "ead05eae-aa97-4bda-a07c-51e5dbb062c0";
export const PRACTICE_PRODUCT_SLUG = "ielts-practice";
export const PRACTICE_PRODUCT_ID_FALLBACK = "a74195fd-b4f3-4fd4-93bf-c807e42250c6";
export const PLAYBOOK_DEFAULT_PROVIDER = "british-council";
export const MODULE_ORDER = [
  "essentials",
  "test-types-booking",
  "listening-master-guide",
  "reading-master-guide",
  "writing-master-guide",
  "speaking-master-guide",
  "band-scores-improvement-map",
  "intricacies-traps-myths",
  "updates-policy",
  "study-plans",
  "test-day-guide",
  "retake-results-strategy",
];

export const json = (status: number, body: unknown, extraHeaders: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders, ...extraHeaders },
  });

export const getEnv = (key: string): string => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Missing env var: ${key}`);
  return value;
};

export const toText = (value: unknown, maxLen = 320): string => String(value ?? "").trim().slice(0, maxLen);
export const toNullableText = (value: unknown, maxLen = 320): string | null => {
  const clean = toText(value, maxLen);
  return clean.length > 0 ? clean : null;
};

export const toNumber = (value: unknown): number | null => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const isObject = (value: unknown): value is JsonRecord =>
  !!value && typeof value === "object" && !Array.isArray(value);

export const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
export const roundTo = (value: number, precision = 2): number => {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
};

export const parseBody = async (req: Request): Promise<JsonRecord> => {
  try {
    const parsed = await req.json();
    return isObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

export const getBearerToken = (req: Request): string | null => {
  const auth = req.headers.get("Authorization") ?? "";
  if (auth.startsWith("Bearer ")) return auth.slice(7).trim();
  if (auth.trim()) return auth.trim();
  const fallback = req.headers.get("x-user-jwt") ?? "";
  return fallback.trim() || null;
};

export const extractRoute = (url: URL, marker: string): string => {
  const idx = url.pathname.indexOf(marker);
  if (idx < 0) return "";
  const tail = url.pathname.slice(idx + marker.length);
  return tail.startsWith("/") ? tail : tail ? `/${tail}` : "";
};

const resolveProductIdBySlug = async (sb: any, slug: string): Promise<string | null> => {
  const { data, error } = await sb
    .from("products")
    .select("id")
    .eq("metadata->>slug", slug)
    .maybeSingle();
  if (error) return null;
  return data?.id ? String((data as any).id) : null;
};

const resolveLanguageIdByCode = async (sb: any, code: string): Promise<string | null> => {
  const { data, error } = await sb
    .from("languages")
    .select("id")
    .eq("code", code)
    .maybeSingle();
  if (error) return null;
  return data?.id ? String((data as any).id) : null;
};

export const authUser = async (sb: any, req: Request): Promise<AuthedContext | null> => {
  const token = getBearerToken(req);
  // Anonymous visitors send the public anon key as the bearer token. Asking
  // the auth server about it always fails, so skip that round trip.
  if (!token || !looksLikeUserToken(token)) return null;
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) return null;
  return { userId: data.user.id, token, email: data.user.email ?? null };
};

// Product and language ids practically never change, but resolving them took
// four sequential database round trips on every request. Resolve them in
// parallel once per isolate and reuse the result for a few minutes.
const SCOPE_TTL_MS = 10 * 60 * 1000;
let scopeCache: { value: PlaybookScope; expiresAt: number } | null = null;

export const resolveScope = async (sb: any): Promise<PlaybookScope> => {
  if (scopeCache && scopeCache.expiresAt > Date.now()) return scopeCache.value;
  const [playbookId, simulatorId, practiceId, languageId] = await Promise.all([
    resolveProductIdBySlug(sb, PLAYBOOK_PRODUCT_SLUG),
    resolveProductIdBySlug(sb, SIMULATOR_PRODUCT_SLUG),
    resolveProductIdBySlug(sb, PRACTICE_PRODUCT_SLUG),
    resolveLanguageIdByCode(sb, "en"),
  ]);
  const value: PlaybookScope = {
    playbookProductId: playbookId ?? PLAYBOOK_PRODUCT_ID_FALLBACK,
    simulatorProductId: simulatorId ?? SIMULATOR_PRODUCT_ID_FALLBACK,
    practiceProductId: practiceId ?? PRACTICE_PRODUCT_ID_FALLBACK,
    languageCode: "en",
    languageId,
  };
  // Only cache a complete lookup so a transient failure is retried next time.
  if (playbookId && languageId) scopeCache = { value, expiresAt: Date.now() + SCOPE_TTL_MS };
  return value;
};

export const resolveEffectiveProductIds = async (
  supabaseUrl: string,
  anonKey: string,
  token: string,
  productId?: string,
): Promise<string[]> => {
  const qs = new URLSearchParams();
  if (productId) qs.set("product_id", productId);
  const res = await fetch(`${supabaseUrl.replace(/\/$/, "")}/functions/v1/access-effective${qs.toString() ? `?${qs.toString()}` : ""}`, {
    method: "GET",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) return [];
  const body = await res.json().catch(() => null);
  if (!body || !Array.isArray(body.effective_product_ids)) return [];
  return body.effective_product_ids.map((entry: unknown) => String(entry ?? "")).filter(Boolean);
};

export const hasPremiumAccess = async (
  supabaseUrl: string,
  anonKey: string,
  token: string,
  productId: string,
): Promise<boolean> => {
  const effectiveIds = await resolveEffectiveProductIds(supabaseUrl, anonKey, token, productId);
  return effectiveIds.includes(productId);
};

export const defaultProfile = (scope: PlaybookScope, userId: string): PlaybookProfileRow => ({
  user_id: userId,
  product_id: scope.playbookProductId,
  target_overall_band: 6.5,
  current_band_or_estimate: null,
  deadline_date: null,
  weakest_skill: null,
  purpose: "study",
  destination_country_code: null,
  test_market_country_code: "GLOBAL",
  preferred_delivery_mode: null,
  provider_key: PLAYBOOK_DEFAULT_PROVIDER,
  program_requires_academic: false,
  metadata: {},
  created_at: new Date(0).toISOString(),
  updated_at: new Date(0).toISOString(),
});

export const loadProfile = async (sb: any, scope: PlaybookScope, userId: string): Promise<PlaybookProfileRow> => {
  const { data } = await sb
    .from("ielts_playbook_user_profiles")
    .select("*")
    .eq("user_id", userId)
    .eq("product_id", scope.playbookProductId)
    .maybeSingle();
  if (!data) return defaultProfile(scope, userId);
  return {
    ...(data as PlaybookProfileRow),
    metadata: isObject((data as any).metadata) ? ((data as any).metadata as JsonRecord) : {},
  };
};

export const saveProfile = async (
  sb: any,
  scope: PlaybookScope,
  userId: string,
  body: JsonRecord,
): Promise<PlaybookProfileRow> => {
  const current = await loadProfile(sb, scope, userId);
  const targetOverallBand = clamp(roundTo(toNumber(body.target_overall_band) ?? current.target_overall_band, 1), 0, 9);
  const currentBand = body.current_band_or_estimate === null
    ? null
    : (() => {
      const value = toNumber(body.current_band_or_estimate);
      return value == null ? current.current_band_or_estimate : clamp(roundTo(value, 1), 0, 9);
    })();

  const weakestSkill = ["listening", "reading", "writing", "speaking"].includes(toText(body.weakest_skill, 32).toLowerCase())
    ? toText(body.weakest_skill, 32).toLowerCase()
    : current.weakest_skill;

  const purpose = ["study", "work", "migration", "job", "visa"].includes(toText(body.purpose, 32).toLowerCase())
    ? toText(body.purpose, 32).toLowerCase()
    : current.purpose;

  const row = {
    user_id: userId,
    product_id: scope.playbookProductId,
    target_overall_band: targetOverallBand,
    current_band_or_estimate: currentBand,
    deadline_date: body.deadline_date === null ? null : (toNullableText(body.deadline_date, 32) ?? current.deadline_date),
    weakest_skill: weakestSkill,
    purpose,
    destination_country_code: body.destination_country_code === null ? null : (toNullableText(body.destination_country_code, 12) ?? current.destination_country_code),
    test_market_country_code: body.test_market_country_code === null ? null : (toNullableText(body.test_market_country_code, 12) ?? current.test_market_country_code ?? "GLOBAL"),
    preferred_delivery_mode: body.preferred_delivery_mode === null
      ? null
      : (["computer", "writing_on_paper", "paper", "unsure"].includes(toText(body.preferred_delivery_mode, 32).toLowerCase())
        ? toText(body.preferred_delivery_mode, 32).toLowerCase()
        : current.preferred_delivery_mode),
    provider_key: toNullableText(body.provider_key, 64) ?? current.provider_key ?? PLAYBOOK_DEFAULT_PROVIDER,
    program_requires_academic: typeof body.program_requires_academic === "boolean"
      ? body.program_requires_academic
      : current.program_requires_academic,
    metadata: isObject(body.metadata) ? { ...(current.metadata ?? {}), ...body.metadata } : current.metadata,
  };

  const { data, error } = await sb
    .from("ielts_playbook_user_profiles")
    .upsert(row, { onConflict: "user_id,product_id" })
    .select("*")
    .maybeSingle();

  if (error || !data) throw new Error("Failed to save onboarding profile");
  return data as PlaybookProfileRow;
};

export const loadRules = async (sb: any, scope: PlaybookScope): Promise<Map<string, JsonRecord>> => {
  const { data } = await sb
    .from("ielts_playbook_rule_sets")
    .select("rule_key,config")
    .eq("product_id", scope.playbookProductId)
    .eq("status", "active")
    .order("sort_order", { ascending: true });

  const out = new Map<string, JsonRecord>();
  for (const row of Array.isArray(data) ? data : []) {
    const key = toText((row as any).rule_key, 120);
    if (!key) continue;
    out.set(key, isObject((row as any).config) ? ((row as any).config as JsonRecord) : {});
  }
  return out;
};

export const loadLatestOutcome = async (sb: any, scope: PlaybookScope, userId: string): Promise<OutcomeRow | null> => {
  return loadLatestOutcomeForProduct(sb, userId, scope.simulatorProductId);
};

export const loadLatestOutcomeForProduct = async (
  sb: any,
  userId: string,
  productId: string,
): Promise<OutcomeRow | null> => {
  const { data } = await sb
    .from("exam_outcomes")
    .select("id,session_id,product_id,overall_band,section_scores,computed_at")
    .eq("user_id", userId)
    .eq("product_id", productId)
    .order("computed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  return {
    ...(data as OutcomeRow),
    section_scores: isObject((data as any).section_scores) ? ((data as any).section_scores as JsonRecord) : {},
  };
};

/** The scored outcome of one specific simulator/practice session, if it belongs to the user. */
export const loadOutcomeForSession = async (
  sb: any,
  scope: PlaybookScope,
  userId: string,
  sessionId: string,
): Promise<OutcomeRow | null> => {
  const { data } = await sb
    .from("exam_outcomes")
    .select("id,session_id,product_id,overall_band,section_scores,computed_at")
    .eq("user_id", userId)
    .eq("session_id", sessionId)
    .in("product_id", [scope.simulatorProductId, scope.practiceProductId])
    .order("computed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return {
    ...(data as OutcomeRow),
    section_scores: isObject((data as any).section_scores) ? ((data as any).section_scores as JsonRecord) : {},
  };
};

/** Lightweight page lookup for routes that only need the id and visibility. */
export const loadPageRef = async (
  sb: any,
  scope: PlaybookScope,
  slug: string,
): Promise<{ id: string; slug: string; visibility: string } | null> => {
  const { data } = await sb
    .from("ielts_playbook_pages")
    .select("id,slug,visibility")
    .eq("product_id", scope.playbookProductId)
    .eq("locale_code", "en")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  if (!data?.id) return null;
  return { id: String(data.id), slug: String(data.slug), visibility: String(data.visibility ?? "public") };
};

export const extractSectionBands = (outcome: OutcomeRow | null): Record<string, number> => {
  const out: Record<string, number> = {};
  const sectionScores = isObject(outcome?.section_scores) ? (outcome?.section_scores as JsonRecord) : {};
  for (const [key, value] of Object.entries(sectionScores)) {
    const directBand = toNumber(value);
    if (directBand != null) {
      const directSection = toText(key, 24).toLowerCase();
      if (directSection) out[directSection] = directBand;
      continue;
    }
    if (!isObject(value)) continue;
    const sectionType = toText(value.type ?? key, 24).toLowerCase();
    const band = toNumber(value.band ?? value.estimated_band ?? value.average_band);
    if (!sectionType || band == null) continue;
    out[sectionType] = band;
  }
  return out;
};

const safeRows = async <T = Record<string, unknown>>(
  label: string,
  query: PromiseLike<{ data: unknown; error?: { message?: string } | null }>,
  errors: string[],
): Promise<T[]> => {
  try {
    const { data, error } = await query;
    if (error) {
      errors.push(`${label}: ${error.message ?? "query failed"}`);
      return [];
    }
    return Array.isArray(data) ? (data as T[]) : [];
  } catch (error) {
    errors.push(`${label}: ${error instanceof Error ? error.message : "query failed"}`);
    return [];
  }
};

const safeMaybe = async <T = Record<string, unknown>>(
  label: string,
  query: PromiseLike<{ data: unknown; error?: { message?: string } | null }>,
  errors: string[],
): Promise<T | null> => {
  try {
    const { data, error } = await query;
    if (error) {
      errors.push(`${label}: ${error.message ?? "query failed"}`);
      return null;
    }
    return data && typeof data === "object" ? (data as T) : null;
  } catch (error) {
    errors.push(`${label}: ${error instanceof Error ? error.message : "query failed"}`);
    return null;
  }
};

const maxIso = (values: Array<unknown>): string | null => {
  const clean = values.map((value) => toNullableText(value, 80)).filter((value): value is string => Boolean(value));
  if (clean.length === 0) return null;
  return clean.sort().at(-1) ?? null;
};

const sectionFrom = (value: unknown): string | null => {
  const section = toText(value, 24).toLowerCase();
  return ["listening", "reading", "writing", "speaking"].includes(section) ? section : null;
};

const summarizePracticeMastery = (masteryRows: Array<Record<string, unknown>>): JsonRecord => {
  const sectionSummaries = new Map<string, {
    tracked: number;
    weak: number;
    mastered: number;
    attempts: number;
    masteryTotal: number;
    masteryCount: number;
    accuracyTotal: number;
    accuracyCount: number;
    latest: string | null;
  }>();

  const weakQuestionTypes: JsonRecord[] = [];

  for (const row of masteryRows) {
    const section = sectionFrom(row.section_type);
    if (!section) continue;
    const summary = sectionSummaries.get(section) ?? {
      tracked: 0,
      weak: 0,
      mastered: 0,
      attempts: 0,
      masteryTotal: 0,
      masteryCount: 0,
      accuracyTotal: 0,
      accuracyCount: 0,
      latest: null,
    };
    const attempts = Math.max(0, Math.floor(toNumber(row.attempts) ?? 0));
    const masteryLevel = toNumber(row.mastery_level);
    const rollingAccuracy = toNumber(row.rolling_accuracy_ratio);
    const status = toText(row.mastery_status, 40).toLowerCase();
    const lastPracticedAt = toNullableText(row.last_practiced_at, 80);

    summary.tracked += 1;
    summary.attempts += attempts;
    if (status === "weak" || (masteryLevel != null && masteryLevel < 0.48)) summary.weak += 1;
    if (status === "mastered") summary.mastered += 1;
    if (masteryLevel != null) {
      summary.masteryTotal += masteryLevel;
      summary.masteryCount += 1;
    }
    if (rollingAccuracy != null) {
      summary.accuracyTotal += rollingAccuracy;
      summary.accuracyCount += 1;
    }
    if (lastPracticedAt && (!summary.latest || lastPracticedAt > summary.latest)) summary.latest = lastPracticedAt;
    sectionSummaries.set(section, summary);

    if (status === "weak" || (masteryLevel != null && masteryLevel < 0.55)) {
      weakQuestionTypes.push({
        section_type: section,
        question_type: toText(row.question_type, 120),
        attempts,
        mastery_level: masteryLevel,
        mastery_status: status || null,
        rolling_accuracy_ratio: rollingAccuracy,
        last_practiced_at: lastPracticedAt,
      });
    }
  }

  const bySection: Record<string, JsonRecord> = {};
  for (const [section, summary] of sectionSummaries.entries()) {
    bySection[section] = {
      tracked_question_types: summary.tracked,
      weak_question_types: summary.weak,
      mastered_question_types: summary.mastered,
      attempts: summary.attempts,
      average_mastery_level: summary.masteryCount > 0 ? roundTo(summary.masteryTotal / summary.masteryCount, 3) : null,
      average_accuracy_ratio: summary.accuracyCount > 0 ? roundTo(summary.accuracyTotal / summary.accuracyCount, 3) : null,
      last_practiced_at: summary.latest,
    };
  }

  weakQuestionTypes.sort((a, b) => {
    const aMastery = toNumber(a.mastery_level) ?? 1;
    const bMastery = toNumber(b.mastery_level) ?? 1;
    if (aMastery !== bMastery) return aMastery - bMastery;
    return String(a.question_type ?? "").localeCompare(String(b.question_type ?? ""));
  });

  const weakestSection = Object.entries(bySection)
    .sort(([, a], [, b]) => {
      const aMastery = toNumber(a.average_mastery_level) ?? 1;
      const bMastery = toNumber(b.average_mastery_level) ?? 1;
      if (aMastery !== bMastery) return aMastery - bMastery;
      return (toNumber(b.weak_question_types) ?? 0) - (toNumber(a.weak_question_types) ?? 0);
    })[0]?.[0] ?? null;

  return {
    tracked_question_types: masteryRows.length,
    weak_question_types: weakQuestionTypes.length,
    mastered_question_types: masteryRows.filter((row) => toText(row.mastery_status, 40).toLowerCase() === "mastered").length,
    weakest_section: weakestSection,
    by_section: bySection,
    weakest_question_types: weakQuestionTypes.slice(0, 8),
  };
};

const extractPracticeDiagnosticBands = (diagnostic: Record<string, unknown> | null): Record<string, number> => {
  const diagnostics = isObject(diagnostic?.diagnostics) ? (diagnostic?.diagnostics as JsonRecord) : {};
  const sections = isObject(diagnostics.sections) ? (diagnostics.sections as JsonRecord) : {};
  const out: Record<string, number> = {};
  for (const [section, value] of Object.entries(sections)) {
    if (!isObject(value)) continue;
    const band = toNumber(value.average_band);
    const key = sectionFrom((value as JsonRecord).section_type ?? section);
    if (key && band != null) out[key] = band;
  }
  return out;
};

const extractPracticeOverallBand = (diagnostic: Record<string, unknown> | null): number | null => {
  const directOverall = isObject(diagnostic?.overall) ? (diagnostic?.overall as JsonRecord) : {};
  const directBand = toNumber(directOverall.average_band);
  if (directBand != null) return directBand;

  const diagnostics = isObject(diagnostic?.diagnostics) ? (diagnostic?.diagnostics as JsonRecord) : {};
  const overall = isObject(diagnostics.overall) ? (diagnostics.overall as JsonRecord) : {};
  return toNumber(overall.average_band);
};

export const loadRecentOutcomeEvidence = async (
  sb: any,
  scope: PlaybookScope,
  userId: string,
): Promise<JsonRecord[]> => {
  const { data } = await sb
    .from("exam_outcomes")
    .select("id,session_id,product_id,overall_band,section_scores,computed_at,status,score_method")
    .eq("user_id", userId)
    .in("product_id", [scope.simulatorProductId, scope.practiceProductId])
    .order("computed_at", { ascending: false })
    .limit(16);

  return (Array.isArray(data) ? data : []).map((row: any) => {
    const outcome = {
      ...(row as OutcomeRow),
      section_scores: isObject(row.section_scores) ? row.section_scores : {},
    };
    return {
      ...outcome,
      source_service: String(row.product_id) === scope.practiceProductId ? "ielts-practice" : "ielts-simulator",
      section_bands: extractSectionBands(outcome),
    };
  });
};

export const loadPracticeEvidence = async (
  sb: any,
  scope: PlaybookScope,
  userId: string,
): Promise<JsonRecord> => {
  const errors: string[] = [];
  if (!scope.languageId) {
    return {
      connected: false,
      language_id: null,
      errors: ["English language id could not be resolved"],
    };
  }

  const [
    goal,
    currentDiagnostic,
    masteryRows,
    labAttempts,
    mistakes,
    roadmapItems,
    planItems,
    sessions,
  ] = await Promise.all([
    safeMaybe("practice_goal", sb
      .from("ielts_practice_user_goals")
      .select("target_overall_band,target_section_bands,target_date,practice_start_date,program_duration_days,daily_practice_minutes,timezone,focus_modes,metadata,updated_at")
      .eq("user_id", userId)
      .eq("language_id", scope.languageId)
      .eq("product_id", scope.practiceProductId)
      .maybeSingle(), errors),
    safeMaybe("practice_diagnostic", sb
      .from("ielts_practice_diagnostic_snapshots")
      .select("id,computed_at,snapshot_version,diagnostics,source_summary")
      .eq("user_id", userId)
      .eq("language_id", scope.languageId)
      .eq("product_id", scope.practiceProductId)
      .eq("is_current", true)
      .order("computed_at", { ascending: false })
      .limit(1)
      .maybeSingle(), errors),
    safeRows("practice_mastery", sb
      .from("ielts_practice_mastery")
      .select("section_type,question_type,attempts,mastery_level,mastery_status,last_accuracy_ratio,best_accuracy_ratio,rolling_accuracy_ratio,last_practiced_at,updated_at")
      .eq("user_id", userId)
      .eq("language_id", scope.languageId)
      .eq("product_id", scope.practiceProductId)
      .order("updated_at", { ascending: false })
      .limit(80), errors),
    safeRows("practice_lab_attempts", sb
      .from("ielts_practice_lab_attempts")
      .select("id,practice_session_id,lab_kind,section_type,status,raw_score,max_score,accuracy_ratio,estimated_band,started_at,submitted_at,scored_at,updated_at")
      .eq("user_id", userId)
      .eq("language_id", scope.languageId)
      .eq("product_id", scope.practiceProductId)
      .order("updated_at", { ascending: false })
      .limit(12), errors),
    safeRows("practice_mistake_notebook", sb
      .from("ielts_practice_mistake_notebook")
      .select("section_type,question_type,trap_type,mistake_pattern,coach_note,review_count,status,priority,next_review_at,last_seen_at,updated_at")
      .eq("user_id", userId)
      .eq("language_id", scope.languageId)
      .eq("product_id", scope.practiceProductId)
      .in("status", ["active", "difficult"])
      .order("priority", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(12), errors),
    safeRows("practice_roadmap", sb
      .from("ielts_practice_roadmap_items")
      .select("section_type,skill_key,title,current_state,target_state,linked_lab_kind,priority,status,updated_at")
      .eq("user_id", userId)
      .eq("language_id", scope.languageId)
      .eq("product_id", scope.practiceProductId)
      .in("status", ["active", "in_progress"])
      .order("priority", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(12), errors),
    safeRows("practice_plan_items", sb
      .from("ielts_practice_plan_items")
      .select("id,plan_date,section_type,status,priority,due_at,rationale,completed_at,updated_at")
      .eq("user_id", userId)
      .eq("language_id", scope.languageId)
      .eq("product_id", scope.practiceProductId)
      .order("plan_date", { ascending: true })
      .order("priority", { ascending: false })
      .limit(14), errors),
    safeRows("practice_sessions", sb
      .from("ielts_practice_sessions")
      .select("id,status,latest_outcome_id,started_at,completed_at,updated_at")
      .eq("user_id", userId)
      .eq("language_id", scope.languageId)
      .eq("product_id", scope.practiceProductId)
      .order("updated_at", { ascending: false })
      .limit(8), errors),
  ]);

  const masterySummary = summarizePracticeMastery(masteryRows);
  const diagnosticBands = extractPracticeDiagnosticBands(currentDiagnostic);
  const latestPracticeAt = maxIso([
    currentDiagnostic?.computed_at,
    goal?.updated_at,
    ...masteryRows.map((row) => row.last_practiced_at ?? row.updated_at),
    ...labAttempts.map((row) => row.scored_at ?? row.submitted_at ?? row.updated_at),
    ...mistakes.map((row) => row.last_seen_at ?? row.updated_at),
    ...roadmapItems.map((row) => row.updated_at),
    ...sessions.map((row) => row.completed_at ?? row.updated_at ?? row.started_at),
  ]);

  return {
    connected: Boolean(goal || currentDiagnostic || masteryRows.length || labAttempts.length || mistakes.length || roadmapItems.length || planItems.length || sessions.length),
    language_id: scope.languageId,
    goal,
    current_diagnostic: currentDiagnostic
      ? {
        id: currentDiagnostic.id,
        computed_at: currentDiagnostic.computed_at,
        snapshot_version: currentDiagnostic.snapshot_version,
        overall: isObject((currentDiagnostic.diagnostics as JsonRecord | undefined)?.overall)
          ? (currentDiagnostic.diagnostics as JsonRecord).overall
          : null,
        sections: isObject((currentDiagnostic.diagnostics as JsonRecord | undefined)?.sections)
          ? (currentDiagnostic.diagnostics as JsonRecord).sections
          : {},
        question_types: Array.isArray((currentDiagnostic.diagnostics as JsonRecord | undefined)?.question_types)
          ? ((currentDiagnostic.diagnostics as JsonRecord).question_types as unknown[]).slice(0, 12)
          : [],
        source_summary: isObject(currentDiagnostic.source_summary) ? currentDiagnostic.source_summary : {},
      }
      : null,
    diagnostic_section_bands: diagnosticBands,
    mastery_summary: masterySummary,
    recent_lab_attempts: labAttempts,
    mistake_notebook: mistakes,
    roadmap_items: roadmapItems,
    plan_items: planItems,
    recent_sessions: sessions,
    freshness: {
      latest_practice_at: latestPracticeAt,
      latest_diagnostic_at: toNullableText(currentDiagnostic?.computed_at, 80),
      has_current_diagnostic: Boolean(currentDiagnostic),
    },
    errors,
  };
};

export const resolveMarketGuidance = async (
  sb: any,
  scope: PlaybookScope,
  countryCode: string | null | undefined,
  providerKey: string | null | undefined,
): Promise<MarketGuidanceRow | null> => {
  const provider = providerKey?.trim() || PLAYBOOK_DEFAULT_PROVIDER;
  const requestedCountry = countryCode?.trim() || "GLOBAL";
  const candidates = Array.from(new Set([requestedCountry, "GLOBAL"]));

  const { data } = await sb
    .from("ielts_playbook_market_guidance")
    .select("*")
    .eq("product_id", scope.playbookProductId)
    .eq("status", "published")
    .in("country_code", candidates);

  const row = pickMarketGuidance(Array.isArray(data) ? data : [], requestedCountry, provider);
  if (!row) return null;
  return { ...row, metadata: isObject((row as any).metadata) ? ((row as any).metadata as JsonRecord) : {} };
};

/**
 * Preference order: the requested country with the requested provider, then
 * the requested country with any provider (a local guide beats a generic one),
 * then GLOBAL with the provider, then any GLOBAL guide.
 */
export const pickMarketGuidance = <T extends { country_code?: unknown; provider_key?: unknown }>(
  rows: T[],
  country: string,
  provider: string,
): T | null => {
  const find = (c: string, p?: string) =>
    rows.find((row) => String(row.country_code) === c && (p == null || String(row.provider_key) === p));
  return find(country, provider) ?? find(country) ?? find("GLOBAL", provider) ?? find("GLOBAL") ?? null;
};

/** Published markets for the "where will you sit the test" selector. */
export const listMarkets = async (sb: any, scope: PlaybookScope): Promise<JsonRecord[]> => {
  const { data } = await sb
    .from("ielts_playbook_market_guidance")
    .select("id,country_code,provider_key,summary,ukvi_available,computer_available,writing_on_paper_available,one_skill_retake_available,result_timing_note,booking_url,verified_at,metadata")
    .eq("product_id", scope.playbookProductId)
    .eq("status", "published")
    .order("country_code", { ascending: true })
    .order("provider_key", { ascending: true });
  return (Array.isArray(data) ? data : []).map((row: any) => ({
    ...row,
    metadata: isObject(row.metadata) ? row.metadata : {},
  }));
};

export const loadPlanTemplates = async (sb: any, scope: PlaybookScope): Promise<PlanTemplateRow[]> => {
  const { data } = await sb
    .from("ielts_playbook_plan_templates")
    .select("*")
    .eq("product_id", scope.playbookProductId)
    .eq("status", "published")
    .order("duration_days", { ascending: true });
  return (Array.isArray(data) ? data : []).map((row: any) => ({
    ...(row as PlanTemplateRow),
    schedule_json: isObject(row.schedule_json) ? row.schedule_json : {},
    metadata: isObject(row.metadata) ? row.metadata : {},
  }));
};

export const pickDeadlineBucket = (rules: Map<string, JsonRecord>, deadlineDate: string | null): "crash" | "balanced" | "improvement" | "extended" => {
  if (!deadlineDate) return "improvement";
  const diff = Math.max(0, Math.ceil((Date.parse(deadlineDate) - Date.now()) / (1000 * 60 * 60 * 24)));
  const config = rules.get("deadline_bucket") ?? {};
  const crashMax = Math.max(1, Math.floor(toNumber(config.crash_max_days) ?? 14));
  const balancedMax = Math.max(crashMax + 1, Math.floor(toNumber(config.balanced_max_days) ?? 35));
  const improvementMax = Math.max(balancedMax + 1, Math.floor(toNumber(config.improvement_max_days) ?? 84));
  if (diff <= crashMax) return "crash";
  if (diff <= balancedMax) return "balanced";
  if (diff <= improvementMax) return "improvement";
  return "extended";
};

export const resolveTrack = (rules: Map<string, JsonRecord>, profile: PlaybookProfileRow): "academic" | "general" => {
  if (profile.program_requires_academic) return "academic";
  const purposeRule = rules.get("purpose_default_track") ?? {};
  const fromRule = toText(purposeRule[profile.purpose], 24).toLowerCase();
  return fromRule === "academic" ? "academic" : "general";
};

export const resolveWeakestSkill = (
  profile: PlaybookProfileRow,
  sectionBands: Record<string, number>,
  practiceWeakestSkill?: string | null,
): string => {
  const candidates = ["listening", "reading", "writing", "speaking"];
  const scored = candidates
    .map((skill) => ({ skill, band: sectionBands[skill] }))
    .filter((entry) => typeof entry.band === "number");

  if (scored.length > 0) {
    scored.sort((a, b) => {
      const aAdjustedBand = a.band - (a.skill === practiceWeakestSkill ? 0.35 : 0);
      const bAdjustedBand = b.band - (b.skill === practiceWeakestSkill ? 0.35 : 0);
      return aAdjustedBand - bAdjustedBand || a.band - b.band || a.skill.localeCompare(b.skill);
    });
    return scored[0].skill;
  }

  if (practiceWeakestSkill && candidates.includes(practiceWeakestSkill)) return practiceWeakestSkill;
  if (profile.weakest_skill && candidates.includes(profile.weakest_skill)) return profile.weakest_skill;
  return "writing";
};

export const resolveDeliveryMode = (
  rules: Map<string, JsonRecord>,
  profile: PlaybookProfileRow,
  market: MarketGuidanceRow | null,
): string => {
  const configuredDefault = toText(rules.get("delivery_mode_preference")?.default_mode, 32).toLowerCase() || "computer";
  const preferred = toText(profile.preferred_delivery_mode, 32).toLowerCase();

  if (preferred === "writing_on_paper" && market?.writing_on_paper_available) return "writing_on_paper";
  if (preferred === "paper" && market?.writing_on_paper_available) return "writing_on_paper";
  if (preferred === "computer" && (market?.computer_available ?? true)) return "computer";
  if (market?.writing_on_paper_available && configuredDefault === "writing_on_paper") return "writing_on_paper";
  return market?.computer_available === false && market?.writing_on_paper_available ? "writing_on_paper" : "computer";
};

const pickTemplate = (
  templates: PlanTemplateRow[],
  bucket: "crash" | "balanced" | "improvement" | "extended",
  weakestSkill: string,
): PlanTemplateRow | null => {
  if (bucket !== "crash" && bucket !== "balanced" && weakestSkill === "writing") {
    const writingRecovery = templates.find((row) => row.plan_type === "skill_recovery" && row.focus_skill === "writing");
    if (writingRecovery) return writingRecovery;
  }

  const slugMap: Record<string, string> = {
    crash: "crash-14",
    balanced: "balanced-28",
    improvement: "improvement-56",
    extended: "extended-84",
  };
  return templates.find((row) => row.slug === slugMap[bucket]) ?? templates[0] ?? null;
};

const moduleForSkill = (skill: string): string => {
  if (skill === "listening") return "listening-master-guide";
  if (skill === "reading") return "reading-master-guide";
  if (skill === "writing") return "writing-master-guide";
  return "speaking-master-guide";
};

const buildPriorityModules = (weakestSkill: string, bucket: string): Array<{ slug: string; reason: string }> => {
  const modules: Array<{ slug: string; reason: string }> = [
    { slug: moduleForSkill(weakestSkill), reason: `Primary repair should start with ${weakestSkill}.` },
    { slug: "band-scores-improvement-map", reason: "Use the band map to identify what is actually holding the score down." },
    { slug: "intricacies-traps-myths", reason: "Remove common IELTS mistakes before adding more practice volume." },
    { slug: "study-plans", reason: `Use a ${bucket} planning frame so the routine matches the deadline.` },
  ];

  if (weakestSkill !== "writing") {
    modules.push({ slug: "writing-master-guide", reason: "Writing often becomes the second hidden bottleneck even when another skill feels weaker." });
  }

  modules.push({ slug: "test-day-guide", reason: "Keep logistics and panic management out of the score loss equation." });
  return modules.filter((entry, index, arr) => arr.findIndex((other) => other.slug === entry.slug) === index);
};

const buildLikelyBottlenecks = (
  weakestSkill: string,
  track: string,
  bandGap: number,
  practiceEvidence?: JsonRecord | null,
): string[] => {
  const items = [
    `Score progress will probably stay uneven across skills while ${weakestSkill} is lagging.`,
    weakestSkill === "writing"
      ? "Task response and weak development will usually hurt more than a few isolated grammar mistakes."
      : `Raw English ability will not be enough unless ${weakestSkill} execution becomes exam-specific and repeatable.`,
    track === "general"
      ? "Do not assume General Training is easy; timing and task response still punish weak habits."
      : "Academic task demands stay manageable only when structure and paraphrase recognition are deliberate.",
  ];

  if (bandGap >= 1) items.push("A full-band jump usually needs repeated feedback loops, not just more untimed practice.");

  const masterySummary = isObject(practiceEvidence?.mastery_summary) ? (practiceEvidence?.mastery_summary as JsonRecord) : {};
  const weakQuestionTypes = Array.isArray(masterySummary.weakest_question_types)
    ? masterySummary.weakest_question_types as Array<Record<string, unknown>>
    : [];
  if (weakQuestionTypes.length > 0) {
    const labels = weakQuestionTypes
      .slice(0, 3)
      .map((row) => `${toText(row.section_type, 24)} ${toText(row.question_type, 80)}`.trim())
      .filter(Boolean)
      .join(", ");
    if (labels) items.push(`Practice mastery data is still flagging: ${labels}.`);
  }

  const mistakes = Array.isArray(practiceEvidence?.mistake_notebook) ? (practiceEvidence?.mistake_notebook as unknown[]) : [];
  if (mistakes.length > 0) items.push(`${mistakes.length} active practice mistake patterns should be reviewed before adding new volume.`);
  return items;
};

const buildTimelineAssessment = (bucket: string, bandGap: number): string => {
  if (bucket === "crash") {
    return bandGap <= 0.5
      ? "The timeline is tight but realistic if execution errors are the main problem."
      : "The timeline is aggressive; expect score stabilization before major band movement.";
  }
  if (bucket === "balanced") {
    return bandGap <= 1
      ? "This is a realistic window for measurable improvement if practice stays focused."
      : "The goal is possible, but improvement has to be highly targeted and consistent.";
  }
  return bandGap <= 1.5
    ? "The timeline supports solid improvement and repeated diagnostic resets."
    : "The timeline is workable, but the gap suggests a longer feedback cycle may still be needed.";
};

export const generateRecommendation = async (
  sb: any,
  scope: PlaybookScope,
  userId: string,
  profile: PlaybookProfileRow,
  opts: { anchorSessionId?: string | null } = {},
): Promise<JsonRecord> => {
  const anchorSessionId = toNullableText(opts.anchorSessionId, 80);
  const [rules, templates, latestSimulatorOutcome, anchorOutcome, practiceOutcome, practiceEvidence, market] = await Promise.all([
    loadRules(sb, scope),
    loadPlanTemplates(sb, scope),
    loadLatestOutcome(sb, scope, userId),
    anchorSessionId ? loadOutcomeForSession(sb, scope, userId, anchorSessionId) : Promise.resolve(null),
    loadLatestOutcomeForProduct(sb, userId, scope.practiceProductId),
    loadPracticeEvidence(sb, scope, userId),
    resolveMarketGuidance(sb, scope, profile.test_market_country_code, profile.provider_key),
  ]);

  // A learner arriving from a finished simulator test (?source=simulator&session_id=)
  // gets the plan anchored to that exact result instead of whatever is latest.
  const simulatorOutcome = anchorOutcome ?? latestSimulatorOutcome;
  const simulatorSectionBands = extractSectionBands(simulatorOutcome);
  const practiceOutcomeSectionBands = extractSectionBands(practiceOutcome);
  const practiceDiagnosticSectionBands = isObject(practiceEvidence.diagnostic_section_bands)
    ? (practiceEvidence.diagnostic_section_bands as Record<string, number>)
    : {};
  const sectionBands = {
    ...practiceDiagnosticSectionBands,
    ...practiceOutcomeSectionBands,
    ...simulatorSectionBands,
  };
  const practiceMasterySummary = isObject(practiceEvidence.mastery_summary) ? (practiceEvidence.mastery_summary as JsonRecord) : {};
  const practiceWeakestSkill = sectionFrom(practiceMasterySummary.weakest_section);
  const weakestSkill = resolveWeakestSkill(profile, sectionBands, practiceWeakestSkill);
  const currentOverallBand =
    simulatorOutcome?.overall_band ??
    practiceOutcome?.overall_band ??
    extractPracticeOverallBand(isObject(practiceEvidence.current_diagnostic) ? (practiceEvidence.current_diagnostic as Record<string, unknown>) : null) ??
    profile.current_band_or_estimate ??
    null;
  const bandGap = currentOverallBand == null ? Math.max(0, profile.target_overall_band - 6) : Math.max(0, profile.target_overall_band - currentOverallBand);
  const bucket = pickDeadlineBucket(rules, profile.deadline_date);
  const track = resolveTrack(rules, profile);
  const deliveryMode = resolveDeliveryMode(rules, profile, market);
  const template = pickTemplate(templates, bucket, weakestSkill);
  const ukviNeeded = profile.purpose === "visa" && (profile.destination_country_code ?? "").toUpperCase() === "GB";
  const oneSkillRetakeRule = rules.get("one_skill_retake_eligibility") ?? {};
  const osrWindowDays = Math.max(1, Math.floor(toNumber(oneSkillRetakeRule.window_days) ?? 60));
  const sectionEntries = Object.entries(sectionBands).sort((a, b) => a[1] - b[1]);
  const blockerCount = sectionEntries.length > 0 && currentOverallBand != null
    ? sectionEntries.filter(([, band]) => band + 0.49 < profile.target_overall_band).length
    : 0;
  const osrEligible = blockerCount === 1 && Boolean(market?.one_skill_retake_available);

  const templateSchedule = isObject(template?.schedule_json) ? (template?.schedule_json as JsonRecord) : {};
  const dailyRoutine = Array.isArray(templateSchedule.daily_routine)
    ? templateSchedule.daily_routine.map((entry) => String(entry))
    : ["Target weakest skill first", "Run one timed task or drill", "Log mistakes and next actions"];
  const weeklyRoutine = Array.isArray(templateSchedule.weekly_rhythm)
    ? templateSchedule.weekly_rhythm.map((entry) => String(entry))
    : ["1 diagnostic review", "3-4 focused skill sessions", "1 full or section-level timed simulation"];

  return {
    generated_at: new Date().toISOString(),
    profile,
    scope: {
      playbook_product_id: scope.playbookProductId,
      simulator_product_id: scope.simulatorProductId,
      practice_product_id: scope.practiceProductId,
    },
    outcome_summary: {
      latest_exam_outcome_id: simulatorOutcome?.id ?? practiceOutcome?.id ?? null,
      latest_session_id: simulatorOutcome?.session_id ?? practiceOutcome?.session_id ?? null,
      latest_computed_at: simulatorOutcome?.computed_at ?? practiceOutcome?.computed_at ?? null,
      current_overall_band: currentOverallBand,
      section_bands: sectionBands,
      simulator_section_bands: simulatorSectionBands,
      practice_section_bands: practiceOutcomeSectionBands,
      practice_diagnostic_section_bands: practiceDiagnosticSectionBands,
      used_simulator_outcome: Boolean(simulatorOutcome),
      used_practice_outcome: Boolean(practiceOutcome),
      used_practice_evidence: Boolean(practiceEvidence.connected),
    },
    evidence_summary: {
      simulator: {
        connected: Boolean(simulatorOutcome),
        latest_outcome_id: simulatorOutcome?.id ?? null,
        latest_computed_at: simulatorOutcome?.computed_at ?? null,
        overall_band: simulatorOutcome?.overall_band ?? null,
        section_bands: simulatorSectionBands,
      },
      practice: {
        connected: Boolean(practiceEvidence.connected),
        latest_outcome_id: practiceOutcome?.id ?? null,
        latest_computed_at: practiceOutcome?.computed_at ?? null,
        latest_practice_at: isObject(practiceEvidence.freshness) ? (practiceEvidence.freshness as JsonRecord).latest_practice_at ?? null : null,
        overall_band: practiceOutcome?.overall_band ?? extractPracticeOverallBand(isObject(practiceEvidence.current_diagnostic) ? (practiceEvidence.current_diagnostic as Record<string, unknown>) : null),
        mastery: practiceMasterySummary,
      },
    },
    decision: {
      selected_track: track,
      ukvi_needed: ukviNeeded,
      recommended_delivery_mode: deliveryMode,
      one_skill_retake_eligible: osrEligible,
      one_skill_retake_window_days: osrWindowDays,
      market_guidance_id: market?.id ?? null,
    },
    planning: {
      deadline_bucket: bucket,
      band_gap: roundTo(bandGap, 1),
      weakest_skill: weakestSkill,
      likely_bottlenecks: buildLikelyBottlenecks(weakestSkill, track, bandGap, practiceEvidence),
      realistic_timeline: buildTimelineAssessment(bucket, bandGap),
    },
    recommended_module_order: buildPriorityModules(weakestSkill, bucket),
    plan_template: template
      ? {
        id: template.id,
        slug: template.slug,
        title: template.title,
        summary: template.summary,
        duration_days: template.duration_days,
        intensity: template.intensity,
        schedule_json: template.schedule_json,
      }
      : null,
    daily_routine: dailyRoutine,
    weekly_routine: weeklyRoutine,
    simulator_cta: {
      label: "Run a scored simulator session",
      url: `https://ielts.schood.online/?source=playbook&target=${encodeURIComponent(String(profile.target_overall_band))}&skill=${encodeURIComponent(weakestSkill)}`,
    },
    practice_cta: {
      label: "Open targeted practice",
      url: `https://practice.ielts.schood.online/dashboard?source=playbook&weak_skill=${encodeURIComponent(weakestSkill)}`,
    },
    practice_evidence: practiceEvidence,
    post_result_strategy: {
      recommended_path: osrEligible ? "one_skill_retake" : "full_retake",
      rationale: osrEligible
        ? "Exactly one skill is acting as the blocker and the current market guidance supports One Skill Retake."
        : "A broader retake path is safer because either multiple skills are blocking the goal or One Skill Retake is not supported in the selected market.",
      eor_note: "Enquiry on Results should be treated as informational only, not as guaranteed score movement.",
    },
    market_guidance: market,
    simulator_anchor: anchorSessionId
      ? {
        session_id: anchorSessionId,
        found: Boolean(anchorOutcome),
        outcome_id: anchorOutcome?.id ?? null,
        computed_at: anchorOutcome?.computed_at ?? null,
        overall_band: anchorOutcome?.overall_band ?? null,
        section_bands: anchorOutcome ? extractSectionBands(anchorOutcome) : {},
      }
      : null,
  };
};

export const persistRecommendation = async (
  sb: any,
  scope: PlaybookScope,
  userId: string,
  profile: PlaybookProfileRow,
  recommendation: JsonRecord,
): Promise<{ id: string; created_at: string }> => {
  await sb
    .from("ielts_playbook_recommendation_snapshots")
    .update({ is_current: false })
    .eq("user_id", userId)
    .eq("product_id", scope.playbookProductId)
    .eq("is_current", true);

  const planTemplate = isObject(recommendation.plan_template) ? (recommendation.plan_template as JsonRecord) : null;
  const outcomeSummary = isObject(recommendation.outcome_summary) ? (recommendation.outcome_summary as JsonRecord) : null;
  const inputsJson = {
    target_overall_band: profile.target_overall_band,
    current_band_or_estimate: profile.current_band_or_estimate,
    deadline_date: profile.deadline_date,
    weakest_skill: profile.weakest_skill,
    purpose: profile.purpose,
    destination_country_code: profile.destination_country_code,
    test_market_country_code: profile.test_market_country_code,
    preferred_delivery_mode: profile.preferred_delivery_mode,
  };

  const { data, error } = await sb
    .from("ielts_playbook_recommendation_snapshots")
    .insert({
      user_id: userId,
      product_id: scope.playbookProductId,
      plan_template_id: toNullableText(planTemplate?.id, 80),
      latest_exam_outcome_id: toNullableText(outcomeSummary?.latest_exam_outcome_id, 80),
      recommendation_slug: toNullableText(planTemplate?.slug, 120),
      recommendation_json: recommendation,
      inputs_json: inputsJson,
      derived_context: {
        deadline_bucket: isObject(recommendation.planning) ? recommendation.planning.deadline_bucket : null,
        selected_track: isObject(recommendation.decision) ? recommendation.decision.selected_track : null,
      },
      is_current: true,
      metadata: { source: "ielts-playbook.edge" },
    })
    .select("id,created_at")
    .maybeSingle();

  if (error || !data) throw new Error("Failed to save recommendation snapshot");
  return { id: String((data as any).id), created_at: String((data as any).created_at) };
};

export const recordEvent = async (
  sb: any,
  scope: PlaybookScope,
  body: JsonRecord,
  userId?: string | null,
): Promise<void> => {
  const eventName = toText(body.event_name, 80);
  const allowed = new Set([
    "page_view",
    "premium_gate_seen",
    "premium_gate_clicked",
    "onboarding_completed",
    "recommendation_generated",
    "simulator_referral_opened",
    "practice_referral_opened",
    "resource_clicked",
    "official_source_clicked",
  ]);
  if (!allowed.has(eventName)) throw new Error("Unsupported event_name");

  await sb.from("ielts_playbook_events").insert({
    user_id: userId ?? null,
    product_id: scope.playbookProductId,
    page_id: toNullableText(body.page_id, 80),
    event_name: eventName,
    page_type: toNullableText(body.page_type, 80),
    module_key: toNullableText(body.module_key, 80),
    market_country_code: toNullableText(body.market_country_code, 16),
    metadata: isObject(body.metadata) ? body.metadata : {},
    occurred_at: toNullableText(body.occurred_at, 64) ?? new Date().toISOString(),
  });
};

export const loadCurrentRecommendation = async (sb: any, scope: PlaybookScope, userId: string): Promise<JsonRecord | null> => {
  const { data } = await sb
    .from("ielts_playbook_recommendation_snapshots")
    .select("recommendation_json,created_at,id")
    .eq("user_id", userId)
    .eq("product_id", scope.playbookProductId)
    .eq("is_current", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data || !isObject((data as any).recommendation_json)) return null;
  return {
    id: String((data as any).id),
    created_at: String((data as any).created_at),
    ...((data as any).recommendation_json as JsonRecord),
  };
};

export const listCatalog = async (sb: any, scope: PlaybookScope): Promise<JsonRecord> => {
  const { data } = await sb
    .from("ielts_playbook_pages")
    .select("id,parent_page_id,page_type,module_key,slug,title,summary,visibility,sort_order,metadata,published_at")
    .eq("product_id", scope.playbookProductId)
    .eq("status", "published")
    .order("sort_order", { ascending: true });

  const pages = (Array.isArray(data) ? data : []) as Array<Record<string, unknown>>;
  const modules = pages.filter((page) => String(page.page_type) === "module").sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0));
  const premiumGuides = pages
    .filter((page) => String(page.visibility) === "premium")
    .map((page) => ({
      id: String(page.id),
      parent_page_id: page.parent_page_id ? String(page.parent_page_id) : null,
      module_key: page.module_key ? String(page.module_key) : null,
      slug: String(page.slug),
      title: String(page.title),
      summary: String(page.summary ?? ""),
      page_type: String(page.page_type),
      published_at: page.published_at ? String(page.published_at) : null,
    }));

  return {
    product_slug: PLAYBOOK_PRODUCT_SLUG,
    modules: modules.map((page) => ({
      id: String(page.id),
      slug: String(page.slug),
      module_key: page.module_key ? String(page.module_key) : null,
      title: String(page.title),
      summary: String(page.summary ?? ""),
      sort_order: Number(page.sort_order ?? 0),
      metadata: isObject(page.metadata) ? page.metadata : {},
      published_at: page.published_at ? String(page.published_at) : null,
    })),
    premium_guides: premiumGuides,
  };
};

// One PostgREST request returns the page with its sections, child guides and
// sources. The edge runtime is often far from the database, so every extra
// sequential query used to add hundreds of milliseconds to a public page.
export const PAGE_DETAIL_SELECT = [
  "id,parent_page_id,page_type,module_key,slug,title,summary,status,visibility,locale_code,country_scope,variant_scope,sort_order,seo_title,seo_description,published_at,metadata",
  "sections:ielts_playbook_page_sections(id,page_id,block_type,heading,status,sort_order,content,metadata)",
  "child_pages:ielts_playbook_pages!parent_page_id(id,parent_page_id,page_type,module_key,slug,title,summary,status,visibility,sort_order,published_at,metadata)",
  "sources:ielts_playbook_page_sources(sort_order,citation_note,is_primary,source:ielts_playbook_sources(id,source_type,provider_key,title,url,summary,status,verified_at,published_at,last_checked_at,metadata))",
].join(",");

export const loadPageDetail = async (sb: any, scope: PlaybookScope, slug: string): Promise<JsonRecord | null> => {
  const { data: pageData } = await sb
    .from("ielts_playbook_pages")
    .select(PAGE_DETAIL_SELECT)
    .eq("product_id", scope.playbookProductId)
    .eq("locale_code", "en")
    .eq("slug", slug)
    .eq("status", "published")
    .eq("sections.status", "published")
    .eq("child_pages.status", "published")
    .order("sort_order", { referencedTable: "sections", ascending: true })
    .order("sort_order", { referencedTable: "child_pages", ascending: true })
    .order("sort_order", { referencedTable: "sources", ascending: true })
    .maybeSingle();

  if (!pageData) return null;
  return shapePageDetail(pageData as JsonRecord);
};

export const shapePageDetail = (pageData: JsonRecord): JsonRecord => {
  const { sections: sectionData, child_pages: childPages, sources: pageSources, ...pageRow } = pageData as Record<string, any>;
  const page = {
    ...(pageRow as PageRow),
    variant_scope: isObject(pageRow.variant_scope) ? (pageRow.variant_scope as JsonRecord) : {},
    metadata: isObject(pageRow.metadata) ? (pageRow.metadata as JsonRecord) : {},
    country_scope: Array.isArray(pageRow.country_scope) ? (pageRow.country_scope as string[]) : [],
  };
  const bySortOrder = (a: any, b: any) => Number(a?.sort_order ?? 0) - Number(b?.sort_order ?? 0);

  return {
    page,
    // The embedded filters already restrict to published rows; the extra
    // filter and sort keep the shape stable if a filter is ever dropped.
    sections: (Array.isArray(sectionData) ? sectionData : [])
      .filter((row: any) => !row?.status || row.status === "published")
      .sort(bySortOrder)
      .map((row: any) => ({
        ...(row as PageSectionRow),
        content: isObject(row.content) ? row.content : {},
        metadata: isObject(row.metadata) ? row.metadata : {},
      })),
    child_pages: (Array.isArray(childPages) ? childPages : [])
      .filter((row: any) => !row?.status || row.status === "published")
      .sort(bySortOrder)
      .map(({ status: _status, ...row }: any) => ({
        ...row,
        metadata: isObject(row.metadata) ? row.metadata : {},
      })),
    sources: (Array.isArray(pageSources) ? pageSources : []).sort(bySortOrder).map((row: any) => ({
      sort_order: Number(row.sort_order ?? 0),
      citation_note: row.citation_note ? String(row.citation_note) : null,
      is_primary: Boolean(row.is_primary),
      source: row.source && typeof row.source === "object"
        ? {
          ...(row.source as SourceRow),
          metadata: isObject((row.source as any).metadata) ? ((row.source as any).metadata as JsonRecord) : {},
        }
        : null,
    })),
  };
};

export const loadUpdatesPayload = async (sb: any, scope: PlaybookScope): Promise<JsonRecord> => {
  const [updatesModule, recentSources, markets] = await Promise.all([
    loadPageDetail(sb, scope, "updates-policy"),
    sb
      .from("ielts_playbook_sources")
      .select("*")
      .eq("status", "published")
      .order("verified_at", { ascending: false })
      .limit(10),
    sb
      .from("ielts_playbook_market_guidance")
      .select("*")
      .eq("product_id", scope.playbookProductId)
      .eq("status", "published")
      .order("verified_at", { ascending: false })
      .limit(20),
  ]);

  return {
    updates_page: updatesModule,
    recent_sources: (Array.isArray(recentSources.data) ? recentSources.data : []).map((row: any) => ({
      ...row,
      metadata: isObject(row.metadata) ? row.metadata : {},
    })),
    markets: (Array.isArray(markets.data) ? markets.data : []).map((row: any) => ({
      ...row,
      metadata: isObject(row.metadata) ? row.metadata : {},
    })),
  };
};

export const buildDashboardPayload = async (sb: any, scope: PlaybookScope, userId: string): Promise<JsonRecord> => {
  const [profile, recommendation, simulatorOutcome, practiceOutcome, recentOutcomes, practiceEvidence, premiumGuides] = await Promise.all([
    loadProfile(sb, scope, userId),
    loadCurrentRecommendation(sb, scope, userId),
    loadLatestOutcome(sb, scope, userId),
    loadLatestOutcomeForProduct(sb, userId, scope.practiceProductId),
    loadRecentOutcomeEvidence(sb, scope, userId),
    loadPracticeEvidence(sb, scope, userId),
    sb
      .from("ielts_playbook_pages")
      .select("id,slug,title,summary,module_key,page_type,sort_order")
      .eq("product_id", scope.playbookProductId)
      .eq("status", "published")
      .eq("visibility", "premium")
      .order("sort_order", { ascending: true })
      .limit(8),
  ]);

  return {
    profile,
    latest_recommendation: recommendation,
    latest_outcome: simulatorOutcome ? { ...simulatorOutcome, section_bands: extractSectionBands(simulatorOutcome) } : null,
    latest_simulator_outcome: simulatorOutcome ? { ...simulatorOutcome, section_bands: extractSectionBands(simulatorOutcome) } : null,
    latest_practice_outcome: practiceOutcome ? { ...practiceOutcome, section_bands: extractSectionBands(practiceOutcome) } : null,
    recent_outcomes: recentOutcomes,
    practice_evidence: practiceEvidence,
    connected_services: {
      simulator: {
        connected: Boolean(simulatorOutcome),
        latest_outcome_at: simulatorOutcome?.computed_at ?? null,
        overall_band: simulatorOutcome?.overall_band ?? null,
      },
      practice: {
        connected: Boolean(practiceEvidence.connected || practiceOutcome),
        latest_outcome_at: practiceOutcome?.computed_at ?? null,
        latest_practice_at: isObject(practiceEvidence.freshness) ? (practiceEvidence.freshness as JsonRecord).latest_practice_at ?? null : null,
        mastery: isObject(practiceEvidence.mastery_summary) ? practiceEvidence.mastery_summary : {},
      },
    },
    premium_guides: premiumGuides.data ?? [],
  };
};
