import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { loadPublishedBlueprintCandidates, PRACTICE_LAB_SCHEMA_VERSION } from "../_shared/ielts-practice-blueprints.ts";
import {
  dailyCountFromPracticeMinutes,
  daysUntilDate,
  deriveTargetDate,
  hasActiveProductEntitlement,
  hasActiveSponsoredProductAccess,
  PLAN_REGENERATION_PRESERVED_STATUSES,
  PLAN_REGENERATION_REPLACEABLE_STATUSES,
  normalizeDailyPracticeMinutes,
  normalizeProgramDurationDays,
  parsePlanDate as parsePracticePlanDate,
  safeTimezone,
  scoreObjectiveQuestion as scorePracticeObjectiveQuestion,
  todayInTimezone,
} from "../_shared/ielts-practice-core.ts";
import { signStorageRef } from "../_shared/media-storage.ts";

type JsonRecord = Record<string, unknown>;

type AuthedContext = {
  userId: string;
  token: string;
};

type ResolvedScope = {
  practiceProductId: string;
  simulatorProductId: string;
  languageId: string;
  languageCode: string;
};

type GoalRow = {
  user_id: string;
  language_id: string;
  product_id: string;
  target_overall_band: number;
  target_section_bands: JsonRecord;
  target_date: string | null;
  practice_start_date: string;
  program_duration_days: number;
  daily_practice_minutes: number;
  timezone: string;
  focus_modes: string[];
  metadata: JsonRecord;
  created_at: string;
  updated_at: string;
};

type SectionDiagnostic = {
  section_type: "reading" | "listening" | "writing";
  samples: number;
  raw_score: number;
  max_score: number;
  accuracy_ratio: number | null;
  average_band: number | null;
  target_band: number | null;
  band_gap: number | null;
  target_distance: number | null;
  confidence: number;
  last_seen_at: string | null;
  days_since_seen: number | null;
  mastery_level: number | null;
  mastery_status: string | null;
};

type QuestionTypeDiagnostic = {
  section_type: "reading" | "listening" | "writing";
  question_type: string;
  samples: number;
  raw_score: number;
  max_score: number;
  accuracy_ratio: number | null;
  weakness_score: number;
  target_band: number | null;
  target_distance: number | null;
  confidence: number;
  last_seen_at: string | null;
  days_since_seen: number | null;
  mastery_level: number | null;
  mastery_status: string | null;
};

type DiagnosticPayload = {
  schema_version: string;
  generated_at: string;
  overall: {
    outcomes_count: number;
    average_band: number | null;
    target_band: number;
    band_gap: number | null;
    target_distance: number | null;
    confidence: number;
    latest_outcome_at: string | null;
  };
  sections: Record<string, SectionDiagnostic>;
  question_types: QuestionTypeDiagnostic[];
  mastery: {
    tracked_question_types: number;
    mastered_question_types: number;
    weak_question_types: number;
  };
};

type ExerciseRow = {
  id: string;
  title: string;
  section_type: "reading" | "listening" | "writing";
  question_type: string;
  skill_tags: string[];
  difficulty_band_min: number;
  difficulty_band_max: number;
  estimated_minutes: number;
  payload_json: JsonRecord;
  status: string;
  metadata: JsonRecord;
  created_at: string;
  updated_at: string;
};

type PlanCandidate = {
  exercise: ExerciseRow;
  sectionType: "reading" | "listening" | "writing";
  score: number;
  rationale: string;
  rationaleJson: JsonRecord;
};

type SessionPlanCandidate = {
  blueprint: JsonRecord;
  build: JsonRecord;
  sectionType: "reading" | "listening" | "writing";
  score: number;
  rationale: string;
  rationaleJson: JsonRecord;
};

type SourceAvoidance = {
  passedSourceSectionIds: Set<string>;
  passedSourceExperienceIds: Set<string>;
  recentPracticeSourceSections: Map<string, { attempts: number; latestAt: string | null }>;
};

type PracticeTrainingContext = {
  notebookBoostByQuestionKey: Map<string, number>;
  roadmapBoostByQuestionKey: Map<string, number>;
  roadmapBoostBySection: Map<string, number>;
};

type AttemptRow = {
  id: string;
  user_id: string;
  language_id: string;
  product_id: string;
  exercise_id: string;
  plan_item_id: string | null;
  section_type: "reading" | "listening" | "writing";
  question_type: string;
  status: "started" | "submitted" | "scored" | "failed";
  answers_json: JsonRecord;
  score_artifacts: JsonRecord;
  raw_score: number | null;
  max_score: number | null;
  accuracy_ratio: number | null;
  estimated_band: number | null;
  writing_session_id: string | null;
  writing_evaluation_id: string | null;
  started_at: string;
  submitted_at: string | null;
  scored_at: string | null;
  metadata: JsonRecord;
  created_at: string;
  updated_at: string;
};

type PracticeRule = {
  id: string;
  rule_key: string;
  weight: number;
  config: JsonRecord;
  status: string;
};

type ScoreResult = {
  rawScore: number;
  maxScore: number;
  accuracyRatio: number | null;
  estimatedBand: number | null;
  scoreArtifacts: JsonRecord;
  writingSessionId: string | null;
  writingEvaluationId: string | null;
  signals: Array<{
    source_type: string;
    skill_key: string;
    metric_key: string;
    metric_value: number;
    confidence: number;
    occurred_at: string;
    idempotency_key: string;
    payload: JsonRecord;
  }>;
};

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-user-jwt",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
};

const PRACTICE_PRODUCT_SLUG = "ielts-practice";
const IELTS_SIMULATOR_PRODUCT_SLUG = "ielts-academic-simulator";
const IELTS_SIMULATOR_PRODUCT_ID_FALLBACK = "ead05eae-aa97-4bda-a07c-51e5dbb062c0";
const EN_LANGUAGE_CODE = "en";
const DIAGNOSTIC_SCHEMA_VERSION = "ielts.practice.diagnostic.v2";
const PRACTICE_DELIVERY_SCHEMA_VERSION = "ielts.practice.delivery.v2";
const PRACTICE_LAB_ATTEMPT_SCHEMA_VERSION = "ielts.practice.lab_attempt.v1";
const LAB_MEDIA_SIGNED_URL_TTL_SECONDS = 60 * 60 * 6;

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

// Same as json() but with a short browser cache. Used by GET insights
// endpoints so repeat page loads don't re-hit the backend within a minute.
const jsonCached = (status: number, body: unknown, maxAgeSeconds = 45): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": `private, max-age=${maxAgeSeconds}`,
      ...corsHeaders,
    },
  });

const getEnv = (key: string): string => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Missing env var: ${key}`);
  return value;
};

const toText = (value: unknown, maxLen = 240): string => String(value ?? "").trim().slice(0, maxLen);

const toNullableText = (value: unknown, maxLen = 240): string | null => {
  const clean = toText(value, maxLen);
  return clean.length > 0 ? clean : null;
};

const toNumber = (value: unknown): number | null => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
};

const roundTo = (value: number, precision = 4): number => {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
};

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const isObject = (value: unknown): value is JsonRecord => !!value && typeof value === "object" && !Array.isArray(value);

const parseBody = async (req: Request): Promise<JsonRecord> => {
  try {
    const parsed = await req.json();
    return isObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const getBearerToken = (req: Request): string | null => {
  const header = req.headers.get("Authorization") ?? "";
  const fallback = req.headers.get("x-user-jwt") ?? "";
  const raw = header.trim() ? header : fallback;
  if (!raw) return null;
  const token = raw.startsWith("Bearer ") ? raw.slice(7) : raw;
  const clean = token.trim();
  return clean.length > 0 ? clean : null;
};

const apiHeaders = (anonKey: string, token: string): HeadersInit => ({
  apikey: anonKey,
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
});

const normalizeToken = (raw: string): string =>
  raw
    .toLowerCase()
    .replace(/[’`´]/g, "'")
    .trim()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const normalizeChoiceToken = (raw: string): string =>
  raw
    .trim()
    .toUpperCase()
    .replace(/^OPTION[\s_-]*/i, "")
    .replace(/[^A-Z0-9_-]+/g, "");

const toStringList = (value: unknown): string[] => {
  if (value == null) return [];
  if (Array.isArray(value)) return value.flatMap((entry) => toStringList(entry));
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return [String(value)];
  if (isObject(value)) {
    if (typeof value.value === "string") return [value.value];
    if (typeof value.text === "string") return [value.text];
    if (typeof value.answer === "string") return [value.answer];
  }
  return [String(value)];
};

const firstTextValue = (value: unknown, keys: string[]): string => {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (!isObject(value)) return "";
  for (const key of keys) {
    const raw = value[key];
    if (typeof raw === "string" || typeof raw === "number") {
      const text = String(raw).trim();
      if (text) return text;
    }
  }
  return "";
};

const firstNormalized = (value: unknown, normalizer: (raw: string) => string): string => {
  const out = toStringList(value)
    .map((entry) => normalizer(entry))
    .filter(Boolean);
  return out[0] ?? "";
};

const setEquals = (a: string[], b: string[]): boolean => {
  if (a.length !== b.length) return false;
  const sa = new Set(a);
  if (sa.size !== a.length) return false;
  for (const item of b) {
    if (!sa.has(item)) return false;
  }
  return true;
};

const scoreMapAnswers = (
  expected: Record<string, unknown>,
  actual: Record<string, unknown> | null,
  normalizer: (raw: string) => string,
): { score: number; max: number } => {
  const keys = Object.keys(expected);
  if (keys.length === 0) return { score: 0, max: 0 };
  let score = 0;
  for (const key of keys) {
    const expectedToken = firstNormalized(expected[key], normalizer);
    if (!expectedToken) continue;
    const actualTokens = toStringList(actual?.[key])
      .map((entry) => normalizer(entry))
      .filter(Boolean);
    if (actualTokens.includes(expectedToken)) score += 1;
  }
  return { score, max: keys.length };
};

const scoreObjectiveQuestion = (
  questionType: string,
  answerKey: unknown,
  responseData: unknown,
): { score: number; max: number } | null =>
  scorePracticeObjectiveQuestion(questionType, answerKey, responseData);

const extractRoute = (url: URL): string => {
  const marker = "/ielts-practice";
  const idx = url.pathname.indexOf(marker);
  if (idx < 0) return "";
  const tail = url.pathname.slice(idx + marker.length);
  return tail.startsWith("/") ? tail : tail ? `/${tail}` : "";
};

const authUser = async (authSb: any, req: Request): Promise<AuthedContext | null> => {
  const token = getBearerToken(req);
  if (!token) return null;

  const { data, error } = await authSb.auth.getUser(token);
  if (error || !data?.user) return null;

  return {
    userId: data.user.id,
    token,
  };
};

const userHasPracticeAccess = async (sb: any, userId: string, scope: ResolvedScope): Promise<boolean> => {
  const { data: userRow, error: userError } = await sb
    .from("users")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  if (userError) throw new Error("Failed to load user role");
  if (String((userRow as any)?.role ?? "").toLowerCase() === "admin") return true;

  const { data: memberships, error: membershipError } = await sb
    .from("tenant_memberships")
    .select("tenant_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1);
  if (membershipError) throw new Error("Failed to load tenant memberships");

  const tenantId = Array.isArray(memberships) ? toNullableText((memberships[0] as any)?.tenant_id, 80) : null;
  if (tenantId) {
    const { data: entitlements, error: entitlementError } = await sb
      .from("entitlements")
      .select("id,starts_at,ends_at,is_active")
      .eq("tenant_id", tenantId)
      .eq("resource_type", "product")
      .eq("resource_id", scope.practiceProductId)
      .eq("is_active", true)
      .limit(10);
    if (entitlementError) throw new Error("Failed to load product entitlements");

    const hasPersonalAccess = hasActiveProductEntitlement(
      (Array.isArray(entitlements) ? entitlements : []).map((row: any) => ({
        ...row,
        resource_type: "product",
        resource_id: scope.practiceProductId,
      })),
      scope.practiceProductId,
    );
    if (hasPersonalAccess) return true;
  }

  const { data: sponsored, error: sponsoredError } = await sb
    .from("academy_entitlements")
    .select("id,grant_type,resource_type,resource_id,starts_at,expires_at,status")
    .eq("user_id", userId)
    .eq("status", "active")
    .eq("grant_type", "product_access")
    .eq("resource_type", "product")
    .eq("resource_id", scope.practiceProductId)
    .limit(10);
  if (sponsoredError) throw new Error("Failed to load sponsored product access");

  return hasActiveSponsoredProductAccess(sponsored, scope.practiceProductId);
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

const resolveScope = async (sb: any): Promise<ResolvedScope> => {
  const practiceProductId = (await resolveProductIdBySlug(sb, PRACTICE_PRODUCT_SLUG))
    ?? "a74195fd-b4f3-4fd4-93bf-c807e42250c6";

  const simulatorProductId = (await resolveProductIdBySlug(sb, IELTS_SIMULATOR_PRODUCT_SLUG))
    ?? IELTS_SIMULATOR_PRODUCT_ID_FALLBACK;

  const { data: languageRow } = await sb
    .from("languages")
    .select("id, code")
    .eq("code", EN_LANGUAGE_CODE)
    .maybeSingle();

  if (!languageRow?.id) {
    throw new Error("English language mapping is missing");
  }

  return {
    practiceProductId,
    simulatorProductId,
    languageId: String((languageRow as any).id),
    languageCode: String((languageRow as any).code ?? EN_LANGUAGE_CODE),
  };
};

const defaultGoals = (scope: ResolvedScope, userId: string): GoalRow => {
  const practiceStartDate = todayInTimezone("UTC");
  const programDurationDays = 30;
  return {
    user_id: userId,
    language_id: scope.languageId,
    product_id: scope.practiceProductId,
    target_overall_band: 6.5,
    target_section_bands: {
      reading: 6.5,
      listening: 6.5,
      writing: 6.5,
    },
    target_date: deriveTargetDate(practiceStartDate, programDurationDays),
    practice_start_date: practiceStartDate,
    program_duration_days: programDurationDays,
    daily_practice_minutes: 60,
    timezone: "UTC",
    focus_modes: [],
    metadata: {},
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
  };
};

const getGoals = async (sb: any, userId: string, scope: ResolvedScope): Promise<GoalRow> => {
  const { data } = await sb
    .from("ielts_practice_user_goals")
    .select(
      "user_id,language_id,product_id,target_overall_band,target_section_bands,target_date,practice_start_date,program_duration_days,daily_practice_minutes,timezone,focus_modes,metadata,created_at,updated_at",
    )
    .eq("user_id", userId)
    .eq("language_id", scope.languageId)
    .maybeSingle();

  if (!data) return defaultGoals(scope, userId);

  const row = data as GoalRow;
  const timezone = safeTimezone((row as any).timezone ?? "UTC");
  const practiceStartDate = parsePracticePlanDate((row as any).practice_start_date, timezone);
  const programDurationDays = normalizeProgramDurationDays((row as any).program_duration_days, 30);
  return {
    ...row,
    target_section_bands: isObject(row.target_section_bands) ? row.target_section_bands : {},
    target_date: toNullableText((row as any).target_date, 20) ?? deriveTargetDate(practiceStartDate, programDurationDays),
    practice_start_date: practiceStartDate,
    program_duration_days: programDurationDays,
    daily_practice_minutes: normalizeDailyPracticeMinutes((row as any).daily_practice_minutes, 60),
    timezone,
    focus_modes: Array.isArray(row.focus_modes) ? row.focus_modes.map((entry) => String(entry)) : [],
    metadata: isObject(row.metadata) ? row.metadata : {},
  };
};

const patchGoals = async (sb: any, userId: string, scope: ResolvedScope, body: JsonRecord): Promise<GoalRow> => {
  const current = await getGoals(sb, userId, scope);

  const incomingTargetBand = toNumber(body.target_overall_band);
  const targetOverallBand = incomingTargetBand != null ? clamp(roundTo(incomingTargetBand, 1), 0, 9) : current.target_overall_band;

  const currentSectionBands = isObject(current.target_section_bands)
    ? { ...current.target_section_bands }
    : {};

  const incomingSectionBands = isObject(body.target_section_bands) ? body.target_section_bands : {};

  const nextSectionBands: JsonRecord = { ...currentSectionBands };
  for (const section of ["reading", "listening", "writing"]) {
    const value = toNumber(incomingSectionBands[section]);
    if (value == null) continue;
    nextSectionBands[section] = clamp(roundTo(value, 1), 0, 9);
  }

  const timezone = safeTimezone(body.timezone ?? current.timezone ?? "UTC");
  const practiceStartDate = parsePracticePlanDate(body.practice_start_date ?? current.practice_start_date, timezone);
  const programDurationDays = normalizeProgramDurationDays(body.program_duration_days, current.program_duration_days ?? 30);
  const dailyPracticeMinutes = normalizeDailyPracticeMinutes(body.daily_practice_minutes, current.daily_practice_minutes ?? 60);
  const targetDate = deriveTargetDate(practiceStartDate, programDurationDays);

  const focusModes = Array.isArray(body.focus_modes)
    ? body.focus_modes.map((entry) => toText(entry, 80).toLowerCase()).filter(Boolean)
    : current.focus_modes;

  const metadata = isObject(body.metadata)
    ? { ...(isObject(current.metadata) ? current.metadata : {}), ...body.metadata }
    : current.metadata;

  const upsertPayload = {
    user_id: userId,
    language_id: scope.languageId,
    product_id: scope.practiceProductId,
    target_overall_band: targetOverallBand,
    target_section_bands: nextSectionBands,
    target_date: targetDate,
    practice_start_date: practiceStartDate,
    program_duration_days: programDurationDays,
    daily_practice_minutes: dailyPracticeMinutes,
    timezone,
    focus_modes: focusModes,
    metadata,
  };

  const { data, error } = await sb
    .from("ielts_practice_user_goals")
    .upsert(upsertPayload, { onConflict: "user_id,language_id" })
    .select(
      "user_id,language_id,product_id,target_overall_band,target_section_bands,target_date,practice_start_date,program_duration_days,daily_practice_minutes,timezone,focus_modes,metadata,created_at,updated_at",
    )
    .maybeSingle();

  if (error || !data) {
    throw new Error("Failed to save goals");
  }

  return {
    ...(data as GoalRow),
    target_section_bands: isObject((data as GoalRow).target_section_bands) ? (data as GoalRow).target_section_bands : {},
    focus_modes: Array.isArray((data as GoalRow).focus_modes) ? (data as GoalRow).focus_modes.map((entry) => String(entry)) : [],
    metadata: isObject((data as GoalRow).metadata) ? (data as GoalRow).metadata : {},
  };
};

const questionTypeFromUnit = (unit: any): string => {
  const fromMeta = toText(unit?.metadata?.question_type, 120).toLowerCase();
  if (fromMeta) return fromMeta;

  const fromData = toText(unit?.data?.question_type ?? unit?.data?.questionType, 120).toLowerCase();
  if (fromData) return fromData;

  const fromType = toText(unit?.type, 120).toLowerCase();
  return fromType || "question_unknown";
};

const toSectionType = (raw: unknown): "reading" | "listening" | "writing" | null => {
  const value = toText(raw, 64).toLowerCase();
  if (value === "reading" || value === "listening" || value === "writing") return value;
  return null;
};

const daysSince = (iso: string | null | undefined, nowMs = Date.now()): number | null => {
  if (!iso) return null;
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return null;
  return roundTo(Math.max(0, (nowMs - parsed) / (1000 * 60 * 60 * 24)), 1);
};

const confidenceFromSamples = (samples: number, latestAt: string | null, nowMs = Date.now()): number => {
  const sampleConfidence = Math.min(0.92, Math.max(0.15, samples / 12));
  const age = daysSince(latestAt, nowMs);
  const recencyFactor = age == null ? 0.45 : Math.max(0.35, 1 - Math.min(age, 90) / 120);
  return roundTo(clamp(sampleConfidence * recencyFactor, 0.05, 0.95), 3);
};

const masteryStatusFrom = (masteryLevel: number, attempts: number): string => {
  if (attempts <= 0) return "new";
  if (masteryLevel >= 0.86) return "mastered";
  if (masteryLevel >= 0.72) return "stable";
  if (masteryLevel >= 0.48) return "building";
  return "weak";
};

const computeDiagnostics = async (
  sb: any,
  scope: ResolvedScope,
  userId: string,
  goals: GoalRow,
): Promise<{ payload: DiagnosticPayload; sourceSummary: JsonRecord }> => {
  const { data: outcomesData, error: outcomesError } = await sb
    .from("exam_outcomes")
    .select("id,session_id,product_id,computed_at,overall_band,section_scores")
    .eq("user_id", userId)
    .in("product_id", [scope.simulatorProductId, scope.practiceProductId])
    .order("computed_at", { ascending: false })
    .limit(240);

  if (outcomesError) throw new Error("Failed to load simulator outcomes");

  const outcomes = Array.isArray(outcomesData) ? outcomesData : [];
  let overallBandWeightedSum = 0;
  let overallBandWeightTotal = 0;
  let simulatorOutcomeCount = 0;
  let practiceOutcomeCount = 0;

  const sectionBuckets = new Map<"reading" | "listening" | "writing", {
    samples: number;
    raw: number;
    max: number;
    bandTotal: number;
    bandWeight: number;
    latestAt: string | null;
  }>();

  for (const section of ["reading", "listening", "writing"] as const) {
    sectionBuckets.set(section, {
      samples: 0,
      raw: 0,
      max: 0,
      bandTotal: 0,
      bandWeight: 0,
      latestAt: null,
    });
  }

  for (const outcome of outcomes) {
    const productId = String((outcome as any).product_id ?? "");
    const weight = productId === scope.simulatorProductId ? 1 : 0.65;
    if (productId === scope.simulatorProductId) simulatorOutcomeCount += 1;
    else if (productId === scope.practiceProductId) practiceOutcomeCount += 1;
    const computedAt = toNullableText((outcome as any).computed_at, 80);

    const overallBand = toNumber((outcome as any).overall_band);
    if (overallBand != null) {
      overallBandWeightedSum += overallBand * weight;
      overallBandWeightTotal += weight;
    }

    const sectionScores = isObject((outcome as any).section_scores)
      ? ((outcome as any).section_scores as JsonRecord)
      : {};

    for (const rawSection of Object.values(sectionScores)) {
      if (!isObject(rawSection)) continue;
      const sectionType = toSectionType(rawSection.type);
      if (!sectionType) continue;
      const bucket = sectionBuckets.get(sectionType)!;
      const rawScore = toNumber(rawSection.raw_score) ?? 0;
      const maxScore = toNumber(rawSection.max_score) ?? 0;
      const band = toNumber(rawSection.band);
      bucket.samples += 1;
      bucket.raw += rawScore;
      bucket.max += maxScore;
      if (band != null) {
        bucket.bandTotal += band * weight;
        bucket.bandWeight += weight;
      }
      if (computedAt && (!bucket.latestAt || computedAt > bucket.latestAt)) bucket.latestAt = computedAt;
    }
  }

  const sessionIds = Array.from(new Set(outcomes.map((row) => String((row as any).session_id ?? "")).filter(Boolean))).slice(0, 80);

  let scoredResponseCount = 0;
  const questionBuckets = new Map<string, {
    sectionType: "reading" | "listening" | "writing";
    questionType: string;
    samples: number;
    raw: number;
    max: number;
    latestAt: string | null;
  }>();

  if (sessionIds.length > 0) {
    const [{ data: responsesData }, { data: sessionRowsData }] = await Promise.all([
      sb
        .from("responses")
        .select("session_id,content_unit_id,data,submitted_at")
        .in("session_id", sessionIds),
      sb
        .from("sessions")
        .select("id,experience_id")
        .in("id", sessionIds),
    ]);

    const responses = Array.isArray(responsesData) ? responsesData : [];
    const contentUnitIds = Array.from(new Set(responses.map((row: any) => String(row.content_unit_id ?? "")).filter(Boolean)));

    if (contentUnitIds.length > 0) {
      const [
        { data: contentUnitsData },
        { data: answerKeysData },
      ] = await Promise.all([
        sb
          .from("content_units")
          .select("id,part_id,type,data,metadata")
          .in("id", contentUnitIds),
        sb
          .from("answer_keys")
          .select("content_unit_id,correct")
          .in("content_unit_id", contentUnitIds),
      ]);

      const contentUnits = Array.isArray(contentUnitsData) ? contentUnitsData : [];
      const answerKeys = Array.isArray(answerKeysData) ? answerKeysData : [];
      const partIds = Array.from(new Set(contentUnits.map((row: any) => String(row.part_id ?? "")).filter(Boolean)));

      const [{ data: partsData }, { data: sectionsData }] = await Promise.all([
        partIds.length > 0
          ? sb.from("parts").select("id,section_id").in("id", partIds)
          : Promise.resolve({ data: [] }),
        sessionRowsData && Array.isArray(sessionRowsData)
          ? (() => {
            const experienceIds = Array.from(new Set(sessionRowsData.map((row: any) => String(row.experience_id ?? "")).filter(Boolean)));
            return experienceIds.length > 0
              ? sb.from("sections").select("id,experience_id,metadata").in("experience_id", experienceIds)
              : Promise.resolve({ data: [] });
          })()
          : Promise.resolve({ data: [] }),
      ]);

      const partToSection = new Map<string, string>();
      for (const row of Array.isArray(partsData) ? partsData : []) {
        partToSection.set(String((row as any).id), String((row as any).section_id));
      }

      const sectionTypeBySectionId = new Map<string, "reading" | "listening" | "writing">();
      for (const row of Array.isArray(sectionsData) ? sectionsData : []) {
        const type = toSectionType((row as any)?.metadata?.type);
        if (!type) continue;
        sectionTypeBySectionId.set(String((row as any).id), type);
      }

      const unitById = new Map<string, any>();
      for (const row of contentUnits) unitById.set(String((row as any).id), row);

      const answerByUnitId = new Map<string, any>();
      for (const row of answerKeys) answerByUnitId.set(String((row as any).content_unit_id), row);

      for (const response of responses) {
        const unitId = String((response as any).content_unit_id ?? "");
        if (!unitId) continue;
        const unit = unitById.get(unitId);
        const answerKey = answerByUnitId.get(unitId);
        if (!unit || !answerKey) continue;

        const partId = String((unit as any).part_id ?? "");
        const sectionId = partToSection.get(partId);
        if (!sectionId) continue;

        const sectionType = sectionTypeBySectionId.get(sectionId);
        if (!sectionType) continue;

        const score = scoreObjectiveQuestion(String((unit as any).type ?? ""), (answerKey as any).correct, (response as any).data);
        if (!score || score.max <= 0) continue;

        scoredResponseCount += 1;
        const questionType = questionTypeFromUnit(unit);
        const key = `${sectionType}::${questionType}`;
        const bucket = questionBuckets.get(key) ?? {
          sectionType,
          questionType,
          samples: 0,
          raw: 0,
          max: 0,
          latestAt: null,
        };
        bucket.samples += 1;
        bucket.raw += score.score;
        bucket.max += score.max;
        const submittedAt = toNullableText((response as any).submitted_at, 80);
        if (submittedAt && (!bucket.latestAt || submittedAt > bucket.latestAt)) bucket.latestAt = submittedAt;
        questionBuckets.set(key, bucket);
      }
    }
  }

  const { data: masteryData } = await sb
    .from("ielts_practice_mastery")
    .select("section_type,question_type,attempts,mastery_level,mastery_status,rolling_accuracy_ratio,best_accuracy_ratio,last_practiced_at")
    .eq("user_id", userId)
    .eq("language_id", scope.languageId)
    .eq("product_id", scope.practiceProductId);

  const masteryByQuestionType = new Map<string, JsonRecord>();
  for (const row of Array.isArray(masteryData) ? masteryData : []) {
    const section = toSectionType((row as any).section_type);
    const questionType = toText((row as any).question_type, 120).toLowerCase();
    if (!section || !questionType) continue;
    masteryByQuestionType.set(`${section}::${questionType}`, row as JsonRecord);
  }

  const averageOverallBand = overallBandWeightTotal > 0
    ? roundTo(overallBandWeightedSum / overallBandWeightTotal, 2)
    : null;

  const targetOverallBand = clamp(toNumber(goals.target_overall_band) ?? 6.5, 0, 9);
  const sections: Record<string, SectionDiagnostic> = {};

  for (const section of ["reading", "listening", "writing"] as const) {
    const bucket = sectionBuckets.get(section)!;
    const accuracyRatio = bucket.max > 0 ? roundTo(bucket.raw / bucket.max, 4) : null;
    const averageBand = bucket.bandWeight > 0 ? roundTo(bucket.bandTotal / bucket.bandWeight, 2) : null;
    const targetBandRaw = toNumber((goals.target_section_bands as any)?.[section]);
    const targetBand = targetBandRaw != null ? clamp(targetBandRaw, 0, 9) : targetOverallBand;
    const bandGap = averageBand == null ? null : roundTo(targetBand - averageBand, 2);
    const masteryRows = Array.from(masteryByQuestionType.values()).filter((row) => toSectionType(row.section_type) === section);
    const masteryValues = masteryRows
      .map((row) => toNumber(row.mastery_level))
      .filter((value): value is number => value != null);
    const masteryLevel = masteryValues.length > 0
      ? roundTo(masteryValues.reduce((sum, value) => sum + value, 0) / masteryValues.length, 3)
      : null;

    sections[section] = {
      section_type: section,
      samples: bucket.samples,
      raw_score: bucket.raw,
      max_score: bucket.max,
      accuracy_ratio: accuracyRatio,
      average_band: averageBand,
      target_band: targetBand,
      band_gap: bandGap,
      target_distance: bandGap,
      confidence: confidenceFromSamples(bucket.samples, bucket.latestAt),
      last_seen_at: bucket.latestAt,
      days_since_seen: daysSince(bucket.latestAt),
      mastery_level: masteryLevel,
      mastery_status: masteryLevel == null ? null : masteryStatusFrom(masteryLevel, masteryValues.length),
    };
  }

  const questionTypes: QuestionTypeDiagnostic[] = Array.from(questionBuckets.values())
    .map((bucket) => {
      const accuracy = bucket.max > 0 ? bucket.raw / bucket.max : null;
      const sectionGap = Math.max(0, toNumber(sections[bucket.sectionType]?.band_gap) ?? 0);
      const weaknessFromAccuracy = accuracy == null ? 0 : 1 - clamp(accuracy, 0, 1);
      const mastery = masteryByQuestionType.get(`${bucket.sectionType}::${bucket.questionType}`);
      const masteryLevel = toNumber(mastery?.mastery_level);
      const masteryPenalty = masteryLevel != null ? masteryLevel * 0.5 : 0;
      const weaknessScore = roundTo(Math.max(0, weaknessFromAccuracy * 1.2 + sectionGap * 0.2 + Math.min(bucket.samples, 8) * 0.02 - masteryPenalty), 4);
      const targetBand = toNumber(sections[bucket.sectionType]?.target_band);

      return {
        section_type: bucket.sectionType,
        question_type: bucket.questionType,
        samples: bucket.samples,
        raw_score: bucket.raw,
        max_score: bucket.max,
        accuracy_ratio: accuracy == null ? null : roundTo(accuracy, 4),
        weakness_score: weaknessScore,
        target_band: targetBand,
        target_distance: sectionGap,
        confidence: confidenceFromSamples(bucket.samples, bucket.latestAt),
        last_seen_at: bucket.latestAt,
        days_since_seen: daysSince(bucket.latestAt),
        mastery_level: masteryLevel,
        mastery_status: toNullableText(mastery?.mastery_status, 40),
      };
    })
    .sort((a, b) => {
      if (b.weakness_score !== a.weakness_score) return b.weakness_score - a.weakness_score;
      if (b.samples !== a.samples) return b.samples - a.samples;
      return a.question_type.localeCompare(b.question_type);
    })
    .slice(0, 120);

  for (const [key, mastery] of masteryByQuestionType.entries()) {
    if (questionTypes.some((row) => `${row.section_type}::${row.question_type}` === key)) continue;
    const [sectionTypeRaw, questionTypeRaw] = key.split("::");
    const sectionType = toSectionType(sectionTypeRaw);
    const questionType = toText(questionTypeRaw, 120).toLowerCase();
    if (!sectionType || !questionType) continue;
    const masteryLevel = toNumber(mastery.mastery_level);
    const rollingAccuracy = toNumber(mastery.rolling_accuracy_ratio);
    const lastPracticedAt = toNullableText(mastery.last_practiced_at, 80);
    const sectionGap = Math.max(0, toNumber(sections[sectionType]?.band_gap) ?? 0);
    questionTypes.push({
      section_type: sectionType,
      question_type: questionType,
      samples: Math.max(0, Math.floor(toNumber(mastery.attempts) ?? 0)),
      raw_score: rollingAccuracy ?? 0,
      max_score: 1,
      accuracy_ratio: rollingAccuracy,
      weakness_score: roundTo(Math.max(0, (1 - (rollingAccuracy ?? masteryLevel ?? 0)) * 1.1 + sectionGap * 0.2), 4),
      target_band: toNumber(sections[sectionType]?.target_band),
      target_distance: sectionGap,
      confidence: confidenceFromSamples(Math.max(0, Math.floor(toNumber(mastery.attempts) ?? 0)), lastPracticedAt),
      last_seen_at: lastPracticedAt,
      days_since_seen: daysSince(lastPracticedAt),
      mastery_level: masteryLevel,
      mastery_status: toNullableText(mastery.mastery_status, 40),
    });
  }

  questionTypes.sort((a, b) => {
    if (b.weakness_score !== a.weakness_score) return b.weakness_score - a.weakness_score;
    if (b.samples !== a.samples) return b.samples - a.samples;
    return a.question_type.localeCompare(b.question_type);
  });

  const payload: DiagnosticPayload = {
    schema_version: DIAGNOSTIC_SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
    overall: {
      outcomes_count: outcomes.length,
      average_band: averageOverallBand,
      target_band: targetOverallBand,
      band_gap: averageOverallBand == null ? null : roundTo(targetOverallBand - averageOverallBand, 2),
      target_distance: averageOverallBand == null ? null : roundTo(targetOverallBand - averageOverallBand, 2),
      confidence: confidenceFromSamples(outcomes.length, toNullableText((outcomes[0] as any)?.computed_at, 80)),
      latest_outcome_at: toNullableText((outcomes[0] as any)?.computed_at, 80),
    },
    sections,
    question_types: questionTypes,
    mastery: {
      tracked_question_types: masteryByQuestionType.size,
      mastered_question_types: Array.from(masteryByQuestionType.values()).filter((row) => toText(row.mastery_status, 40) === "mastered").length,
      weak_question_types: Array.from(masteryByQuestionType.values()).filter((row) => toText(row.mastery_status, 40) === "weak").length,
    },
  };

  return {
    payload,
    sourceSummary: {
      simulator_outcomes_count: simulatorOutcomeCount,
      practice_outcomes_count: practiceOutcomeCount,
      total_outcomes_count: outcomes.length,
      sessions_considered: sessionIds.length,
      scored_responses_count: scoredResponseCount,
      weighting: {
        simulator_outcome_weight: 1,
        practice_outcome_weight: 0.65,
      },
    },
  };
};

const persistDiagnostics = async (
  sb: any,
  userId: string,
  scope: ResolvedScope,
  diagnostics: DiagnosticPayload,
  sourceSummary: JsonRecord,
): Promise<JsonRecord> => {
  await sb
    .from("ielts_practice_diagnostic_snapshots")
    .update({ is_current: false })
    .eq("user_id", userId)
    .eq("language_id", scope.languageId)
    .eq("is_current", true);

  const { data, error } = await sb
    .from("ielts_practice_diagnostic_snapshots")
    .insert({
      user_id: userId,
      language_id: scope.languageId,
      product_id: scope.practiceProductId,
      snapshot_version: DIAGNOSTIC_SCHEMA_VERSION,
      diagnostics,
      source_summary: sourceSummary,
      is_current: true,
      metadata: { source: "ielts-practice.compute" },
    })
    .select("id,computed_at,snapshot_version,diagnostics,source_summary")
    .maybeSingle();

  if (error || !data) throw new Error("Failed to persist diagnostics snapshot");
  return data as JsonRecord;
};

const loadCurrentDiagnostics = async (sb: any, userId: string, scope: ResolvedScope): Promise<JsonRecord | null> => {
  const { data } = await sb
    .from("ielts_practice_diagnostic_snapshots")
    .select("id,computed_at,snapshot_version,diagnostics,source_summary")
    .eq("user_id", userId)
    .eq("language_id", scope.languageId)
    .eq("is_current", true)
    .order("computed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as JsonRecord | null) ?? null;
};

const getActiveRules = async (sb: any, scope: ResolvedScope): Promise<Map<string, PracticeRule>> => {
  const { data } = await sb
    .from("ielts_practice_rules")
    .select("id,rule_key,weight,config,status")
    .eq("language_id", scope.languageId)
    .eq("product_id", scope.practiceProductId)
    .eq("status", "active");

  const out = new Map<string, PracticeRule>();
  for (const row of Array.isArray(data) ? data : []) {
    const rule = row as PracticeRule;
    out.set(String(rule.rule_key), {
      ...rule,
      config: isObject(rule.config) ? rule.config : {},
    });
  }
  return out;
};

const parsePlanDate = (raw: unknown, timezone: unknown = "UTC"): string =>
  parsePracticePlanDate(raw, timezone);

const createSectionQuota = (dailyCount: number, mix: Record<string, number>): Record<"reading" | "listening" | "writing", number> => {
  const sections: Array<"reading" | "listening" | "writing"> = ["reading", "listening", "writing"];
  const base: Record<"reading" | "listening" | "writing", number> = {
    reading: 0,
    listening: 0,
    writing: 0,
  };

  const decimals: Array<{ section: "reading" | "listening" | "writing"; value: number }> = [];
  let used = 0;
  for (const section of sections) {
    const exact = Math.max(0, Number(mix[section] ?? 0)) * dailyCount;
    const floor = Math.floor(exact);
    base[section] = floor;
    decimals.push({ section, value: exact - floor });
    used += floor;
  }

  let remaining = Math.max(0, dailyCount - used);
  decimals.sort((a, b) => b.value - a.value || a.section.localeCompare(b.section));
  let idx = 0;
  while (remaining > 0) {
    const target = decimals[idx % decimals.length]?.section ?? "reading";
    base[target] += 1;
    remaining -= 1;
    idx += 1;
  }
  return base;
};

const targetBandForSection = (goals: GoalRow, section: "reading" | "listening" | "writing"): number => {
  const sectionTarget = toNumber((goals.target_section_bands as any)?.[section]);
  return clamp(sectionTarget ?? toNumber(goals.target_overall_band) ?? 6.5, 0, 9);
};

const estimatedMinutesForSessionCandidate = (candidate: SessionPlanCandidate): number => {
  const buildSummary = isObject(candidate.build.build_summary) ? candidate.build.build_summary as JsonRecord : {};
  const metadata = isObject(candidate.build.metadata) ? candidate.build.metadata as JsonRecord : {};
  return clamp(
    Math.floor(
      toNumber(candidate.blueprint.estimated_minutes)
        ?? toNumber(buildSummary.estimated_minutes)
        ?? toNumber(metadata.estimated_minutes)
        ?? 25,
    ),
    5,
    120,
  );
};

const limitSessionCandidatesByMinutes = (
  candidates: SessionPlanCandidate[],
  dailyPracticeMinutes: number,
): SessionPlanCandidate[] => {
  if (candidates.length <= 1) return candidates;
  const budget = normalizeDailyPracticeMinutes(dailyPracticeMinutes, 60);
  const total = candidates.reduce((sum, candidate) => sum + estimatedMinutesForSessionCandidate(candidate), 0);
  if (total <= budget + 10) return candidates;

  const selected: SessionPlanCandidate[] = [];
  let used = 0;
  for (const candidate of candidates) {
    const minutes = estimatedMinutesForSessionCandidate(candidate);
    const wouldFit = used + minutes <= budget;
    const nearBudgetCoverage = selected.length < 3 && used + minutes <= budget + 15;
    if (selected.length === 0 || wouldFit || nearBudgetCoverage) {
      selected.push(candidate);
      used += minutes;
    }
  }
  return selected.length > 0 ? selected : candidates.slice(0, 1);
};

const loadSourceAvoidance = async (
  sb: any,
  scope: ResolvedScope,
  userId: string,
  goals: GoalRow,
): Promise<SourceAvoidance> => {
  const avoidance: SourceAvoidance = {
    passedSourceSectionIds: new Set<string>(),
    passedSourceExperienceIds: new Set<string>(),
    recentPracticeSourceSections: new Map<string, { attempts: number; latestAt: string | null }>(),
  };

  const { data: outcomesData } = await sb
    .from("exam_outcomes")
    .select("experience_id,status,overall_band,section_scores,computed_at")
    .eq("user_id", userId)
    .eq("product_id", scope.simulatorProductId)
    .eq("status", "completed")
    .order("computed_at", { ascending: false })
    .limit(120);

  const outcomes = Array.isArray(outcomesData) ? outcomesData : [];
  const experienceIds = Array.from(new Set(outcomes.map((row: any) => toText(row.experience_id, 80)).filter(Boolean)));

  const sectionIdsByExperience = new Map<string, string[]>();
  const sectionIdsByExperienceAndType = new Map<string, string[]>();
  if (experienceIds.length > 0) {
    const { data: sectionsData } = await sb
      .from("sections")
      .select("id,experience_id,metadata")
      .in("experience_id", experienceIds);

    for (const row of Array.isArray(sectionsData) ? sectionsData : []) {
      const experienceId = toText((row as any).experience_id, 80);
      const sectionId = toText((row as any).id, 80);
      const sectionType = toSectionType((row as any)?.metadata?.type);
      if (!experienceId || !sectionId) continue;

      const allBucket = sectionIdsByExperience.get(experienceId) ?? [];
      allBucket.push(sectionId);
      sectionIdsByExperience.set(experienceId, allBucket);

      if (sectionType) {
        const key = `${experienceId}::${sectionType}`;
        const typeBucket = sectionIdsByExperienceAndType.get(key) ?? [];
        typeBucket.push(sectionId);
        sectionIdsByExperienceAndType.set(key, typeBucket);
      }
    }
  }

  const targetOverallBand = clamp(toNumber(goals.target_overall_band) ?? 6.5, 0, 9);
  for (const outcome of outcomes) {
    const experienceId = toText((outcome as any).experience_id, 80);
    if (!experienceId) continue;

    const overallBand = toNumber((outcome as any).overall_band);
    const overallPassed = overallBand != null && overallBand >= targetOverallBand - 0.25;
    if (overallPassed) avoidance.passedSourceExperienceIds.add(experienceId);

    const sectionScores = isObject((outcome as any).section_scores)
      ? ((outcome as any).section_scores as JsonRecord)
      : {};
    let sawSectionScore = false;
    for (const rawSection of Object.values(sectionScores)) {
      if (!isObject(rawSection)) continue;
      const sectionType = toSectionType(rawSection.type);
      if (!sectionType) continue;
      sawSectionScore = true;

      const sectionBand = toNumber(rawSection.band);
      const passed = sectionBand != null
        ? sectionBand >= targetBandForSection(goals, sectionType) - 0.25
        : overallPassed;
      if (!passed) continue;

      for (const sectionId of sectionIdsByExperienceAndType.get(`${experienceId}::${sectionType}`) ?? []) {
        avoidance.passedSourceSectionIds.add(sectionId);
      }
    }

    if (overallPassed && !sawSectionScore) {
      for (const sectionId of sectionIdsByExperience.get(experienceId) ?? []) {
        avoidance.passedSourceSectionIds.add(sectionId);
      }
    }
  }

  const { data: practiceSessionsData } = await sb
    .from("ielts_practice_sessions")
    .select("delivery_build_id,created_at")
    .eq("user_id", userId)
    .eq("language_id", scope.languageId)
    .eq("product_id", scope.practiceProductId)
    .order("created_at", { ascending: false })
    .limit(300);

  const buildIds = Array.from(new Set(
    (Array.isArray(practiceSessionsData) ? practiceSessionsData : [])
      .map((row: any) => toText(row.delivery_build_id, 80))
      .filter(Boolean),
  ));

  const sourceSectionByBuildId = new Map<string, string>();
  if (buildIds.length > 0) {
    const { data: buildsData } = await sb
      .from("ielts_practice_delivery_builds")
      .select("id,source_section_id,build_summary")
      .in("id", buildIds);
    for (const row of Array.isArray(buildsData) ? buildsData : []) {
      const buildId = toText((row as any).id, 80);
      const summary = isObject((row as any).build_summary) ? ((row as any).build_summary as JsonRecord) : {};
      const sourceSectionId = toText((row as any).source_section_id ?? summary.source_section_id, 80);
      if (buildId && sourceSectionId) sourceSectionByBuildId.set(buildId, sourceSectionId);
    }
  }

  for (const row of Array.isArray(practiceSessionsData) ? practiceSessionsData : []) {
    const buildId = toText((row as any).delivery_build_id, 80);
    const sourceSectionId = sourceSectionByBuildId.get(buildId);
    if (!sourceSectionId) continue;

    const bucket = avoidance.recentPracticeSourceSections.get(sourceSectionId) ?? { attempts: 0, latestAt: null };
    bucket.attempts += 1;
    const createdAt = toNullableText((row as any).created_at, 80);
    if (createdAt && (!bucket.latestAt || createdAt > bucket.latestAt)) bucket.latestAt = createdAt;
    avoidance.recentPracticeSourceSections.set(sourceSectionId, bucket);
  }

  return avoidance;
};

const loadPracticeTrainingContext = async (
  sb: any,
  scope: ResolvedScope,
  userId: string,
): Promise<PracticeTrainingContext> => {
  const context: PracticeTrainingContext = {
    notebookBoostByQuestionKey: new Map(),
    roadmapBoostByQuestionKey: new Map(),
    roadmapBoostBySection: new Map(),
  };

  const nowIso = new Date().toISOString();
  const [{ data: notebookData }, { data: roadmapData }] = await Promise.all([
    sb
      .from("ielts_practice_mistake_notebook")
      .select("section_type,question_type,priority,status,next_review_at")
      .eq("user_id", userId)
      .eq("language_id", scope.languageId)
      .eq("product_id", scope.practiceProductId)
      .in("status", ["active", "difficult", "reviewed"])
      .limit(200),
    sb
      .from("ielts_practice_roadmap_items")
      .select("section_type,skill_key,priority,status")
      .eq("user_id", userId)
      .eq("language_id", scope.languageId)
      .eq("product_id", scope.practiceProductId)
      .in("status", ["active", "in_progress"])
      .limit(200),
  ]);

  for (const row of Array.isArray(notebookData) ? notebookData : []) {
    const section = toSectionType((row as any).section_type);
    const questionType = toText((row as any).question_type, 120).toLowerCase();
    if (!section || !questionType) continue;
    const dueAt = toNullableText((row as any).next_review_at, 80);
    const dueBoost = !dueAt || dueAt <= nowIso ? 0.35 : 0.12;
    const statusBoost = toText((row as any).status, 40) === "difficult" ? 0.35 : 0;
    const priorityBoost = clamp(toNumber((row as any).priority) ?? 0, 0, 1) * 0.45;
    const key = `${section}::${questionType}`;
    context.notebookBoostByQuestionKey.set(key, Math.max(context.notebookBoostByQuestionKey.get(key) ?? 0, dueBoost + statusBoost + priorityBoost));
  }

  for (const row of Array.isArray(roadmapData) ? roadmapData : []) {
    const section = toSectionType((row as any).section_type);
    const questionType = toText((row as any).skill_key, 120).toLowerCase();
    if (!section || !questionType) continue;
    const priorityBoost = clamp((toNumber((row as any).priority) ?? 0) / 4, 0, 0.55);
    const key = `${section}::${questionType}`;
    context.roadmapBoostByQuestionKey.set(key, Math.max(context.roadmapBoostByQuestionKey.get(key) ?? 0, priorityBoost));
    context.roadmapBoostBySection.set(section, Math.max(context.roadmapBoostBySection.get(section) ?? 0, priorityBoost * 0.45));
  }

  return context;
};

const buildPlanCandidates = (
  exercises: ExerciseRow[],
  diagnostics: DiagnosticPayload,
  goals: GoalRow,
  rules: Map<string, PracticeRule>,
  recentAttemptMap: Map<string, { attempts: number; latestAt: string | null }>,
): PlanCandidate[] => {
  const nowMs = Date.now();
  const bandGapWeight = toNumber(rules.get("band_gap")?.weight) ?? 1.35;
  const questionWeight = toNumber(rules.get("question_type_error_rate")?.weight) ?? 1.45;
  const recencyWeight = toNumber(rules.get("recency_decay")?.weight) ?? 1.1;
  const recencyHalfLife = clamp(Number((rules.get("recency_decay")?.config?.half_life_days as number | undefined) ?? 21), 1, 180);
  const targetOverallBand = clamp(toNumber(goals.target_overall_band) ?? 6.5, 0, 9);

  const sectionGapBySection = new Map<string, number>();
  for (const [section, value] of Object.entries(diagnostics.sections ?? {})) {
    sectionGapBySection.set(section, Math.max(0, toNumber((value as any).band_gap) ?? 0));
  }

  const weaknessByQuestionType = new Map<string, number>();
  const masteryByQuestionType = new Map<string, number>();
  const confidenceByQuestionType = new Map<string, number>();
  for (const row of diagnostics.question_types ?? []) {
    weaknessByQuestionType.set(`${row.section_type}::${row.question_type}`, Math.max(0, toNumber(row.weakness_score) ?? 0));
    masteryByQuestionType.set(`${row.section_type}::${row.question_type}`, clamp(toNumber((row as any).mastery_level) ?? 0, 0, 1));
    confidenceByQuestionType.set(`${row.section_type}::${row.question_type}`, clamp(toNumber((row as any).confidence) ?? 0.4, 0, 1));
  }

  return exercises.map((exercise) => {
    const sectionGap = sectionGapBySection.get(exercise.section_type) ?? 0;
    const questionWeakness = weaknessByQuestionType.get(`${exercise.section_type}::${exercise.question_type}`) ?? 0;

    const difficultyCenter = (Number(exercise.difficulty_band_min) + Number(exercise.difficulty_band_max)) / 2;
    const difficultyDistance = Math.abs(difficultyCenter - targetOverallBand);
    const difficultyFit = Math.max(0, 1 - difficultyDistance / 5);

    const attemptInfo = recentAttemptMap.get(exercise.id);
    const attempts = attemptInfo?.attempts ?? 0;
    const ageDays = attemptInfo?.latestAt
      ? Math.max(0, (nowMs - Date.parse(attemptInfo.latestAt)) / (24 * 60 * 60 * 1000))
      : 365;
    const recencyDecay = Math.exp(Math.log(0.5) * (ageDays / recencyHalfLife));
    const recencyPenalty = attempts === 0 ? 0 : recencyWeight * (0.5 + attempts * 0.18) * recencyDecay;

    const score = 1 + bandGapWeight * sectionGap + questionWeight * questionWeakness + 0.55 * difficultyFit - recencyPenalty;
    return {
      exercise,
      sectionType: exercise.section_type,
      score: roundTo(score, 6),
      rationale: `Selected for ${exercise.section_type} ${exercise.question_type}: section_gap=${roundTo(sectionGap, 3)}, question_weakness=${roundTo(questionWeakness, 3)}, difficulty_fit=${roundTo(difficultyFit, 3)}, recency_penalty=${roundTo(recencyPenalty, 3)}`,
      rationaleJson: {
        section_gap: roundTo(sectionGap, 6),
        question_weakness: roundTo(questionWeakness, 6),
        difficulty_fit: roundTo(difficultyFit, 6),
        recency_penalty: roundTo(recencyPenalty, 6),
        attempts,
        latest_attempt_at: attemptInfo?.latestAt ?? null,
      },
    };
  });
};

const scorePlanCandidates = (candidates: PlanCandidate[]): PlanCandidate[] =>
  [...candidates].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.sectionType !== b.sectionType) return a.sectionType.localeCompare(b.sectionType);
    return a.exercise.id.localeCompare(b.exercise.id);
  });

const buildSessionPlanCandidates = (
  candidates: Array<JsonRecord>,
  diagnostics: DiagnosticPayload,
  goals: GoalRow,
  recentSessionMap: Map<string, { attempts: number; latestAt: string | null }>,
  sourceAvoidance: SourceAvoidance,
  trainingContext?: PracticeTrainingContext,
): SessionPlanCandidate[] => {
  const sectionGapBySection = new Map<string, number>();
  for (const [section, value] of Object.entries(diagnostics.sections ?? {})) {
    sectionGapBySection.set(section, Math.max(0, toNumber((value as any).band_gap) ?? 0));
  }

  const weaknessByQuestionType = new Map<string, number>();
  const masteryByQuestionType = new Map<string, number>();
  const confidenceByQuestionType = new Map<string, number>();
  for (const row of diagnostics.question_types ?? []) {
    weaknessByQuestionType.set(`${row.section_type}::${row.question_type}`, Math.max(0, toNumber(row.weakness_score) ?? 0));
    masteryByQuestionType.set(`${row.section_type}::${row.question_type}`, clamp(toNumber((row as any).mastery_level) ?? 0, 0, 1));
    confidenceByQuestionType.set(`${row.section_type}::${row.question_type}`, clamp(toNumber((row as any).confidence) ?? 0.4, 0, 1));
  }

  const targetOverallBand = clamp(toNumber(goals.target_overall_band) ?? 6.5, 0, 9);
  const daysRemaining = daysUntilDate(goals.target_date, goals.timezone);
  const urgencyMultiplier = daysRemaining == null ? 0 : clamp(45 / Math.max(daysRemaining, 1), 0, 1.5);
  const now = Date.now();

  return candidates.map((row) => {
    const blueprint = isObject(row.blueprint) ? (row.blueprint as JsonRecord) : {};
    const build = isObject(row.build) ? (row.build as JsonRecord) : {};
    const buildSummary = isObject(build.build_summary) ? (build.build_summary as JsonRecord) : {};
    const sectionType = toSectionType(blueprint.section_type ?? buildSummary.section_type ?? "reading") ?? "reading";
    const experienceKind = toText(build.experience_kind ?? blueprint.experience_kind ?? buildSummary.experience_kind ?? "guided_set", 80).toLowerCase();
    const sourceSectionId = toText(blueprint.source_section_id ?? build.source_section_id ?? buildSummary.source_section_id, 80);
    const sourceExperienceId = toText(blueprint.source_experience_id ?? build.source_experience_id ?? buildSummary.source_experience_id, 80);
    const sectionGap = sectionGapBySection.get(sectionType) ?? 0;

    const questionTypesRaw = Array.isArray(buildSummary.target_question_types)
      ? buildSummary.target_question_types
      : Array.isArray(buildSummary.question_types)
        ? buildSummary.question_types
        : Array.isArray(blueprint.target_question_types)
          ? blueprint.target_question_types
          : [];
    const questionTypes = questionTypesRaw.map((entry) => toText(entry, 120).toLowerCase()).filter(Boolean);
    const weaknessValues = questionTypes.map((questionType) => weaknessByQuestionType.get(`${sectionType}::${questionType}`) ?? 0);
    const questionWeakness = weaknessValues.length > 0
      ? weaknessValues.reduce((sum, value) => sum + value, 0) / weaknessValues.length
      : 0;
    const notebookBoost = questionTypes.length > 0
      ? Math.max(...questionTypes.map((questionType) => trainingContext?.notebookBoostByQuestionKey.get(`${sectionType}::${questionType}`) ?? 0), 0)
      : 0;
    const roadmapBoost = questionTypes.length > 0
      ? Math.max(...questionTypes.map((questionType) => trainingContext?.roadmapBoostByQuestionKey.get(`${sectionType}::${questionType}`) ?? 0), trainingContext?.roadmapBoostBySection.get(sectionType) ?? 0)
      : (trainingContext?.roadmapBoostBySection.get(sectionType) ?? 0);
    const masteryValues = questionTypes.map((questionType) => masteryByQuestionType.get(`${sectionType}::${questionType}`) ?? 0);
    const averageMastery = masteryValues.length > 0
      ? masteryValues.reduce((sum, value) => sum + value, 0) / masteryValues.length
      : 0;
    const confidenceValues = questionTypes.map((questionType) => confidenceByQuestionType.get(`${sectionType}::${questionType}`) ?? 0.4);
    const averageConfidence = confidenceValues.length > 0
      ? confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length
      : 0.4;

    const buildId = toText(build.id, 80);
    const recent = recentSessionMap.get(buildId);
    let recencyPenalty = 0;
    if (recent?.latestAt) {
      const daysAgo = Math.max(0, (now - Date.parse(recent.latestAt)) / (1000 * 60 * 60 * 24));
      recencyPenalty = Math.max(0, 0.9 - Math.min(daysAgo / 14, 0.9)) + recent.attempts * 0.08;
    }
    const recentSource = sourceSectionId ? sourceAvoidance.recentPracticeSourceSections.get(sourceSectionId) : null;
    let sourceRecencyPenalty = 0;
    if (recentSource?.latestAt) {
      const daysAgo = Math.max(0, (now - Date.parse(recentSource.latestAt)) / (1000 * 60 * 60 * 24));
      sourceRecencyPenalty = Math.max(0, 0.8 - Math.min(daysAgo / 21, 0.8)) + recentSource.attempts * 0.06;
    }
    const passedSourcePenalty = sourceSectionId && sourceAvoidance.passedSourceSectionIds.has(sourceSectionId)
      ? 4.5
      : sourceExperienceId && sourceAvoidance.passedSourceExperienceIds.has(sourceExperienceId)
        ? 1.6
        : 0;

    const estimatedMinutes = clamp(Math.floor(toNumber(blueprint.estimated_minutes ?? 25) ?? 25), 5, 120);
    const durationFit = Math.max(0.2, 1 - Math.abs(estimatedMinutes - 25) / 50);
    const targetBandFit = Math.max(0.2, 1 - Math.abs(targetOverallBand - (toNumber((diagnostics.sections as any)?.[sectionType]?.target_band) ?? targetOverallBand)) / 4);
    const urgencyBoost = sectionGap > 0 ? sectionGap * urgencyMultiplier * 0.45 : 0;
    const kindFit = experienceKind === "repair_drill"
      ? questionWeakness * 0.55
      : experienceKind === "mastery_check"
        ? averageMastery * 0.5 + (questionWeakness < 0.35 ? 0.2 : -0.15)
        : experienceKind === "strategy"
          ? (averageConfidence < 0.55 ? 0.28 : 0.08)
          : experienceKind === "writing_rewrite"
            ? (sectionType === "writing" ? sectionGap * 0.35 + questionWeakness * 0.2 : -0.3)
            : 0.16;
    const masteryPenalty = experienceKind === "mastery_check" ? 0 : averageMastery * 0.45;
    const score = roundTo(
      sectionGap * 1.45
        + questionWeakness * 1.7
        + durationFit * 0.25
        + targetBandFit * 0.2
        + urgencyBoost
        + kindFit
        + notebookBoost
        + roadmapBoost
        - masteryPenalty
        - recencyPenalty
        - sourceRecencyPenalty
        - passedSourcePenalty,
      6,
    );
    const questionSummary = questionTypes.length > 0
      ? questionTypes.slice(0, 4).map((questionType) =>
        questionType
          .replace(/^question_/i, "")
          .replace(/_/g, " ")
          .replace(/\b\w/g, (token) => token.toUpperCase())
      ).join(", ")
      : "mixed question types";
    const experienceSummary = experienceKind
      .replace(/_/g, " ")
      .replace(/\b\w/g, (token) => token.toUpperCase());
    const selectionSignals = [
      sectionGap > 0 ? `band gap ${roundTo(sectionGap, 2)}` : null,
      questionWeakness > 0 ? `weakness ${roundTo(questionWeakness, 2)}` : null,
      averageMastery >= 0 ? `mastery ${Math.round(clamp(averageMastery, 0, 1) * 100)}%` : null,
      urgencyBoost > 0 ? `${daysRemaining} days remaining` : null,
    ].filter(Boolean).join(", ");
    const freshnessNote = passedSourcePenalty > 0 ? " (kept low because this simulator source already met target)" : "";

    return {
      blueprint,
      build,
      sectionType,
      score,
      rationale: `${experienceSummary}: ${questionSummary}. Selected from simulator diagnostics${selectionSignals ? `: ${selectionSignals}` : ""}${freshnessNote}.`,
      rationaleJson: {
        source: "practice_blueprint",
        experience_kind: experienceKind,
        source_section_id: sourceSectionId || null,
        source_experience_id: sourceExperienceId || null,
        section_gap: roundTo(sectionGap, 4),
        question_weakness: roundTo(questionWeakness, 4),
        average_mastery: roundTo(averageMastery, 4),
        average_confidence: roundTo(averageConfidence, 4),
        duration_fit: roundTo(durationFit, 4),
        target_band_fit: roundTo(targetBandFit, 4),
        days_remaining: daysRemaining,
        urgency_boost: roundTo(urgencyBoost, 4),
        kind_fit: roundTo(kindFit, 4),
        notebook_boost: roundTo(notebookBoost, 4),
        roadmap_boost: roundTo(roadmapBoost, 4),
        mastery_penalty: roundTo(masteryPenalty, 4),
        recency_penalty: roundTo(recencyPenalty, 4),
        source_recency_penalty: roundTo(sourceRecencyPenalty, 4),
        passed_source_penalty: roundTo(passedSourcePenalty, 4),
        question_types: questionTypes,
      },
    };
  }).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.sectionType !== b.sectionType) return a.sectionType.localeCompare(b.sectionType);
    return toText(a.build.id, 80).localeCompare(toText(b.build.id, 80));
  });
};

const startRealPracticeSession = async (
  supabaseUrl: string,
  anonKey: string,
  token: string,
  experienceId: string,
  metadata: JsonRecord,
): Promise<string> => {
  const res = await fetch(`${supabaseUrl}/functions/v1/start-session`, {
    method: "POST",
    headers: apiHeaders(anonKey, token),
    body: JSON.stringify({
      experience_id: experienceId,
      capability_key: "section_practice",
      metadata: {
        ...metadata,
        mode: "practice",
      },
    }),
  });
  if (!res.ok) {
    let details: unknown = null;
    try {
      details = await res.json();
    } catch {
      details = await res.text();
    }
    throw new Error(`Failed to start real practice session: ${JSON.stringify(details)}`);
  }
  const payload = await res.json() as { session_id?: string | null };
  const sessionId = toText(payload.session_id, 80);
  if (!sessionId) throw new Error("start-session did not return session_id");
  return sessionId;
};

const loadPracticeSessionBundle = async (
  sb: any,
  practiceSessionId: string,
  userId: string,
  scope: ResolvedScope,
): Promise<JsonRecord | null> => {
  const { data: practiceSessionData } = await sb
    .from("ielts_practice_sessions")
    .select("id,user_id,language_id,product_id,blueprint_id,delivery_build_id,delivery_experience_id,session_id,plan_item_id,status,latest_outcome_id,latest_auto_evaluation_id,latest_ai_evaluation_id,review_metadata,metadata,started_at,completed_at,created_at,updated_at")
    .eq("id", practiceSessionId)
    .maybeSingle();
  let resolvedPracticeSessionData = practiceSessionData;
  if (!resolvedPracticeSessionData) {
    const { data: byRuntimeSessionData } = await sb
      .from("ielts_practice_sessions")
      .select("id,user_id,language_id,product_id,blueprint_id,delivery_build_id,delivery_experience_id,session_id,plan_item_id,status,latest_outcome_id,latest_auto_evaluation_id,latest_ai_evaluation_id,review_metadata,metadata,started_at,completed_at,created_at,updated_at")
      .eq("session_id", practiceSessionId)
      .maybeSingle();
    resolvedPracticeSessionData = byRuntimeSessionData;
  }
  if (!resolvedPracticeSessionData) return null;

  const practiceSession = resolvedPracticeSessionData as JsonRecord;
  if (String(practiceSession.user_id ?? "") !== userId || String(practiceSession.language_id ?? "") !== scope.languageId) return null;

  const [buildRes, blueprintRes, sessionRes, outcomeRes, evaluationsRes, sectionsRes] = await Promise.all([
    sb
      .from("ielts_practice_delivery_builds")
      .select("id,blueprint_id,delivery_experience_id,source_product_id,source_experience_id,source_section_id,status,experience_kind,build_version,build_summary,validation_summary,metadata,created_at,updated_at")
      .eq("id", String(practiceSession.delivery_build_id ?? ""))
      .maybeSingle(),
    sb
      .from("ielts_practice_blueprints")
      .select("id,title,section_type,source_product_id,source_experience_id,source_section_id,target_question_types,estimated_minutes,status,experience_kind,metadata,latest_delivery_build_id")
      .eq("id", String(practiceSession.blueprint_id ?? ""))
      .maybeSingle(),
    sb
      .from("sessions")
      .select("id,experience_id,status,started_at,completed_at,metadata")
      .eq("id", String(practiceSession.session_id ?? ""))
      .maybeSingle(),
    sb
      .from("exam_outcomes")
      .select("id,computed_at,overall_band,section_scores,skill_breakdown,raw_result")
      .eq("session_id", String(practiceSession.session_id ?? ""))
      .order("computed_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    sb
      .from("evaluations")
      .select("id,method,status,result,evaluated_at")
      .eq("session_id", String(practiceSession.session_id ?? ""))
      .order("evaluated_at", { ascending: false }),
    sb
      .from("sections")
      .select("id,name,display_order,metadata")
      .eq("experience_id", String(practiceSession.delivery_experience_id ?? ""))
      .order("display_order", { ascending: true }),
  ]);

  const evaluationRows = Array.isArray(evaluationsRes.data) ? evaluationsRes.data : [];
  const autoEvaluation = evaluationRows.find((row: any) => String((row as any).method ?? "") === "auto") ?? null;
  const aiEvaluation = evaluationRows.find((row: any) => String((row as any).method ?? "") === "ai") ?? null;

  return {
    practice_session: practiceSession,
    blueprint: blueprintRes.data ?? null,
    delivery_build: buildRes.data ?? null,
    session: sessionRes.data ?? null,
    sections: sectionsRes.data ?? [],
    first_section_id: Array.isArray(sectionsRes.data) && sectionsRes.data.length > 0 ? String((sectionsRes.data[0] as any).id ?? "") : null,
    latest_outcome: outcomeRes.data ?? null,
    evaluations: {
      auto: autoEvaluation,
      ai: aiEvaluation,
      items: evaluationRows,
    },
  };
};

const enrichPlanRows = async (
  sb: any,
  rows: Array<{ id: string; exercise_id?: string | null; blueprint_id?: string | null; delivery_build_id?: string | null; practice_session_id?: string | null }>,
): Promise<JsonRecord[]> => {
  if (rows.length === 0) return [];
  const exerciseIds = Array.from(new Set(rows.map((row) => String(row.exercise_id ?? "")).filter(Boolean)));
  const buildIds = Array.from(new Set(rows.map((row) => String(row.delivery_build_id ?? "")).filter(Boolean)));
  const blueprintIds = Array.from(new Set(rows.map((row) => String(row.blueprint_id ?? "")).filter(Boolean)));
  const practiceSessionIds = Array.from(new Set(rows.map((row) => String(row.practice_session_id ?? "")).filter(Boolean)));

  const [exercisesRes, buildsRes, blueprintsRes, practiceSessionsRes] = await Promise.all([
    exerciseIds.length > 0
      ? sb
        .from("ielts_practice_exercises")
        .select("id,title,section_type,question_type,skill_tags,difficulty_band_min,difficulty_band_max,estimated_minutes,payload_json,status")
        .in("id", exerciseIds)
      : Promise.resolve({ data: [] }),
    buildIds.length > 0
      ? sb
        .from("ielts_practice_delivery_builds")
        .select("id,blueprint_id,delivery_experience_id,source_product_id,source_experience_id,source_section_id,status,experience_kind,build_version,build_summary,validation_summary,metadata,created_at,updated_at")
        .in("id", buildIds)
      : Promise.resolve({ data: [] }),
    blueprintIds.length > 0
      ? sb
        .from("ielts_practice_blueprints")
        .select("id,title,section_type,source_product_id,source_experience_id,source_section_id,target_question_types,estimated_minutes,status,experience_kind,metadata,latest_delivery_build_id")
        .in("id", blueprintIds)
      : Promise.resolve({ data: [] }),
    practiceSessionIds.length > 0
      ? sb
        .from("ielts_practice_sessions")
        .select("id,session_id,status,started_at,completed_at,metadata,review_metadata")
        .in("id", practiceSessionIds)
      : Promise.resolve({ data: [] }),
  ]);

  const exerciseMap = new Map<string, JsonRecord>();
  for (const row of Array.isArray(exercisesRes.data) ? exercisesRes.data : []) exerciseMap.set(String((row as any).id), row as JsonRecord);
  const buildMap = new Map<string, JsonRecord>();
  for (const row of Array.isArray(buildsRes.data) ? buildsRes.data : []) buildMap.set(String((row as any).id), row as JsonRecord);
  const blueprintMap = new Map<string, JsonRecord>();
  for (const row of Array.isArray(blueprintsRes.data) ? blueprintsRes.data : []) blueprintMap.set(String((row as any).id), row as JsonRecord);
  const practiceSessionMap = new Map<string, JsonRecord>();
  for (const row of Array.isArray(practiceSessionsRes.data) ? practiceSessionsRes.data : []) practiceSessionMap.set(String((row as any).id), row as JsonRecord);

  const { data: plansData } = await sb
    .from("ielts_practice_plan_items")
    .select("id,user_id,language_id,product_id,plan_date,section_type,exercise_id,blueprint_id,delivery_build_id,practice_session_id,status,priority,due_at,rationale,rationale_json,metadata,attempt_id,completed_at,created_at,updated_at")
    .in("id", rows.map((row) => row.id))
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true });

  return (Array.isArray(plansData) ? plansData : []).map((row: any) => ({
    ...row,
    exercise: row.exercise_id ? exerciseMap.get(String(row.exercise_id)) ?? null : null,
    blueprint: row.blueprint_id ? blueprintMap.get(String(row.blueprint_id)) ?? null : null,
    delivery_build: row.delivery_build_id ? buildMap.get(String(row.delivery_build_id)) ?? null : null,
    practice_session: row.practice_session_id ? practiceSessionMap.get(String(row.practice_session_id)) ?? null : null,
  }));
};

const parseWritingSignalsFromEvaluation = (
  evaluationResult: unknown,
  occurredAt: string,
  attemptId: string,
): Array<ScoreResult["signals"][number]> => {
  if (!isObject(evaluationResult)) return [];
  const signals: Array<ScoreResult["signals"][number]> = [];
  const overallBand = toNumber((evaluationResult as any).overall_band);
  if (overallBand != null) {
    signals.push({
      source_type: "ielts.practice",
      skill_key: "writing",
      metric_key: "band",
      metric_value: roundTo(overallBand, 3),
      confidence: 0.92,
      occurred_at: occurredAt,
      idempotency_key: `ielts.practice:${attemptId}:writing:band`,
      payload: { from: "grade-writing-v2.overall_band" },
    });
  }

  const tasks = Array.isArray((evaluationResult as any).tasks)
    ? (evaluationResult as any).tasks.filter((entry: unknown) => isObject(entry))
    : [];

  const metrics: Record<string, number[]> = {
    task_response_band: [],
    coherence_band: [],
    vocabulary_band: [],
    grammar_band: [],
  };

  for (const task of tasks) {
    const criteria = isObject((task as any).criteria) ? ((task as any).criteria as JsonRecord) : {};
    const tr = toNumber(criteria.TR ?? criteria.tr ?? criteria.task_response);
    const cc = toNumber(criteria.CC ?? criteria.cc ?? criteria.coherence);
    const lr = toNumber(criteria.LR ?? criteria.lr ?? criteria.lexical_resource);
    const gra = toNumber(criteria.GRA ?? criteria.gra ?? criteria.grammar);
    if (tr != null) metrics.task_response_band.push(tr);
    if (cc != null) metrics.coherence_band.push(cc);
    if (lr != null) metrics.vocabulary_band.push(lr);
    if (gra != null) metrics.grammar_band.push(gra);
  }

  const avg = (values: number[]): number | null => values.length > 0
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;

  const pushMetric = (metricKey: string, values: number[], skillKey: string) => {
    const value = avg(values);
    if (value == null) return;
    signals.push({
      source_type: "ielts.practice",
      skill_key: skillKey,
      metric_key: metricKey,
      metric_value: roundTo(value, 3),
      confidence: 0.86,
      occurred_at: occurredAt,
      idempotency_key: `ielts.practice:${attemptId}:${skillKey}:${metricKey}`,
      payload: { from: "grade-writing-v2.criteria" },
    });
  };

  pushMetric("task_response_band", metrics.task_response_band, "writing");
  pushMetric("coherence_band", metrics.coherence_band, "writing");
  pushMetric("band", metrics.vocabulary_band, "vocabulary");
  pushMetric("band", metrics.grammar_band, "grammar");
  return signals;
};

const callGradeWriting = async (
  supabaseUrl: string,
  anonKey: string,
  token: string,
  sessionId: string,
): Promise<{ evaluationId: string | null; result: JsonRecord | null }> => {
  const res = await fetch(`${supabaseUrl}/functions/v1/grade-writing-v2`, {
    method: "POST",
    headers: apiHeaders(anonKey, token),
    body: JSON.stringify({ session_id: sessionId, force: false }),
  });

  if (!res.ok) return { evaluationId: null, result: null };
  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }
  const evaluation = isObject(payload) && isObject(payload.evaluation)
    ? (payload.evaluation as JsonRecord)
    : null;

  return {
    evaluationId: evaluation?.id ? String(evaluation.id) : null,
    result: evaluation && isObject(evaluation.result) ? (evaluation.result as JsonRecord) : null,
  };
};

const heuristicWritingBand = (answers: unknown): { band: number; wordCount: number; notes: string[] } => {
  const notes: string[] = [];
  let text = "";
  if (typeof answers === "string") {
    text = answers;
  } else if (isObject(answers)) {
    text = toNullableText(answers.text ?? answers.answer ?? answers.essay ?? answers.response, 20000) ?? "";
  }

  const words = text.split(/\s+/).map((entry) => entry.trim()).filter(Boolean);
  const wordCount = words.length;
  let band = 4.5;
  if (wordCount >= 80) band += 0.7;
  if (wordCount >= 150) band += 0.8;
  if (wordCount >= 230) band += 0.7;

  const uniqueRatio = wordCount > 0 ? new Set(words.map((entry) => normalizeToken(entry))).size / wordCount : 0;
  if (uniqueRatio >= 0.5) band += 0.5;
  if (uniqueRatio >= 0.62) band += 0.3;
  if (text.split(/\n{2,}/).map((entry) => entry.trim()).filter(Boolean).length >= 2) band += 0.3;

  if (wordCount < 120) notes.push("Low word count likely limits task response band.");
  if (uniqueRatio < 0.42) notes.push("Lexical repetition is high.");

  return { band: roundTo(clamp(band, 3.5, 8.5), 1), wordCount, notes };
};

const scoreSubmission = async (
  sb: any,
  supabaseUrl: string,
  anonKey: string,
  token: string,
  attempt: AttemptRow,
  exercise: ExerciseRow,
  answers: unknown,
): Promise<ScoreResult> => {
  const occurredAt = new Date().toISOString();
  const baseSignals: ScoreResult["signals"] = [];

  if (exercise.section_type === "writing") {
    let writingSessionId: string | null = null;
    if (isObject(answers)) writingSessionId = toNullableText(answers.session_id, 80);
    let writingEvaluationId: string | null = null;
    let writingEvaluationResult: JsonRecord | null = null;
    if (writingSessionId) {
      const writingEval = await callGradeWriting(supabaseUrl, anonKey, token, writingSessionId);
      writingEvaluationId = writingEval.evaluationId;
      writingEvaluationResult = writingEval.result;
    }

    const heuristic = heuristicWritingBand(answers);
    const estimatedBand = writingEvaluationResult
      ? clamp(toNumber(writingEvaluationResult.overall_band) ?? heuristic.band, 0, 9)
      : heuristic.band;

    baseSignals.push({
      source_type: "ielts.practice",
      skill_key: "writing",
      metric_key: "band",
      metric_value: roundTo(estimatedBand, 3),
      confidence: writingEvaluationResult ? 0.95 : 0.7,
      occurred_at: occurredAt,
      idempotency_key: `ielts.practice:${attempt.id}:writing:band:base`,
      payload: { method: writingEvaluationResult ? "grade-writing-v2" : "heuristic" },
    });
    if (writingEvaluationResult) baseSignals.push(...parseWritingSignalsFromEvaluation(writingEvaluationResult, occurredAt, attempt.id));

    return {
      rawScore: roundTo(estimatedBand, 2),
      maxScore: 9,
      accuracyRatio: roundTo(estimatedBand / 9, 4),
      estimatedBand: roundTo(estimatedBand, 1),
      scoreArtifacts: {
        mode: writingEvaluationResult ? "ai" : "heuristic",
        heuristic_word_count: heuristic.wordCount,
        heuristic_notes: heuristic.notes,
        evaluation_result: writingEvaluationResult,
      },
      writingSessionId,
      writingEvaluationId,
      signals: baseSignals,
    };
  }

  const answerKey = isObject(exercise.payload_json.answer_key)
    ? (exercise.payload_json.answer_key as JsonRecord)
    : {};
  const score = scoreObjectiveQuestion(exercise.question_type, answerKey, answers) ?? { score: 0, max: 0 };
  const maxScore = score.max > 0 ? score.max : 1;
  const accuracy = clamp(score.score / maxScore, 0, 1);
  const estimatedBand = roundTo(4 + accuracy * 5, 1);

  baseSignals.push({
    source_type: "ielts.practice",
    skill_key: exercise.section_type,
    metric_key: "accuracy_ratio",
    metric_value: roundTo(accuracy, 4),
    confidence: 0.9,
    occurred_at: occurredAt,
    idempotency_key: `ielts.practice:${attempt.id}:${exercise.section_type}:accuracy_ratio`,
    payload: { question_type: exercise.question_type, raw_score: score.score, max_score: maxScore },
  });
  baseSignals.push({
    source_type: "ielts.practice",
    skill_key: exercise.section_type,
    metric_key: "band",
    metric_value: estimatedBand,
    confidence: 0.82,
    occurred_at: occurredAt,
    idempotency_key: `ielts.practice:${attempt.id}:${exercise.section_type}:band`,
    payload: { method: "practice_estimate", question_type: exercise.question_type },
  });
  baseSignals.push({
    source_type: "ielts.practice",
    skill_key: `${exercise.section_type}.${exercise.question_type}`,
    metric_key: "accuracy_ratio",
    metric_value: roundTo(accuracy, 4),
    confidence: 0.84,
    occurred_at: occurredAt,
    idempotency_key: `ielts.practice:${attempt.id}:${exercise.section_type}.${exercise.question_type}:accuracy_ratio`,
    payload: { from: "exercise_submission" },
  });

  return {
    rawScore: score.score,
    maxScore,
    accuracyRatio: roundTo(accuracy, 4),
    estimatedBand,
    scoreArtifacts: { mode: "objective", answer_key: answerKey, question_type: exercise.question_type },
    writingSessionId: null,
    writingEvaluationId: null,
    signals: baseSignals,
  };
};

const emitLanguageSignalEvent = async (
  sb: any,
  scope: ResolvedScope,
  userId: string,
  attemptId: string,
  scoreResult: ScoreResult,
): Promise<void> => {
  const payload = {
    schema_version: "language.signal.v1",
    source: "ielts-practice",
    user_id: userId,
    language_id: scope.languageId,
    product_id: scope.practiceProductId,
    session_id: null,
    source_type: "ielts.practice",
    occurred_at: new Date().toISOString(),
    signals: scoreResult.signals,
  };

  await sb
    .from("domain_event_outbox")
    .upsert(
      {
        event_type: "language.signal.v1",
        event_version: "v1",
        aggregate_type: "ielts_practice_attempt",
        aggregate_id: attemptId,
        user_id: userId,
        occurred_at: payload.occurred_at,
        payload,
        status: "pending",
        attempts: 0,
        idempotency_key: `language.signal.v1:ielts.practice:${attemptId}`,
      },
      { onConflict: "idempotency_key" },
    );
};

const callScoreSession = async (
  supabaseUrl: string,
  anonKey: string,
  token: string,
  sessionId: string,
): Promise<JsonRecord | null> => {
  const preferred = toText(Deno.env.get("IELTS_PRACTICE_SCORE_SESSION_FUNCTION") ?? "score-session-v2", 80);
  const slugs = Array.from(new Set([preferred, "score-session"].filter(Boolean)));

  let lastDetails: unknown = null;
  for (const slug of slugs) {
    const res = await fetch(`${supabaseUrl}/functions/v1/${slug}`, {
      method: "POST",
      headers: apiHeaders(anonKey, token),
      body: JSON.stringify({ session_id: sessionId, method: "auto" }),
    });
    if (res.ok) {
      const payload = await res.json();
      return isObject(payload) ? payload : null;
    }
    try {
      lastDetails = await res.json();
    } catch {
      lastDetails = await res.text();
    }
    if (res.status !== 404 && res.status !== 405) break;
  }

  throw new Error(`Failed to score practice session: ${JSON.stringify(lastDetails)}`);
};

const extractWritingBand = (outcome: JsonRecord | null, aiEvaluation: JsonRecord | null): number | null => {
  const aiResult = isObject(aiEvaluation?.result) ? (aiEvaluation?.result as JsonRecord) : null;
  const aiBand = toNumber(aiResult?.overall_band);
  if (aiBand != null) return clamp(aiBand, 0, 9);

  const sectionScores = isObject(outcome?.section_scores) ? (outcome?.section_scores as JsonRecord) : {};
  for (const section of Object.values(sectionScores)) {
    if (!isObject(section)) continue;
    if (toSectionType(section.type) !== "writing") continue;
    const band = toNumber(section.band);
    if (band != null) return clamp(band, 0, 9);
  }
  return null;
};

const updateMasteryBuckets = async (
  sb: any,
  scope: ResolvedScope,
  userId: string,
  buckets: Array<{
    section_type: "reading" | "listening" | "writing";
    question_type: string;
    accuracy_ratio: number;
    raw_score: number | null;
    max_score: number | null;
    practiced_at: string;
    source: string;
  }>,
  refs: { practice_session_id?: string | null; session_id?: string | null; attempt_id?: string | null; delivery_build_id?: string | null },
): Promise<JsonRecord[]> => {
  if (buckets.length === 0) return [];

  const { data: existingData } = await sb
    .from("ielts_practice_mastery")
    .select("section_type,question_type,attempts,best_accuracy_ratio,rolling_accuracy_ratio,mastery_level,metadata")
    .eq("user_id", userId)
    .eq("language_id", scope.languageId)
    .eq("product_id", scope.practiceProductId);

  const existingByKey = new Map<string, JsonRecord>();
  for (const row of Array.isArray(existingData) ? existingData : []) {
    const section = toSectionType((row as any).section_type);
    const questionType = toText((row as any).question_type, 120).toLowerCase();
    if (!section || !questionType) continue;
    existingByKey.set(`${section}::${questionType}`, row as JsonRecord);
  }

  const upsertRows = buckets.map((bucket) => {
    const questionType = toText(bucket.question_type, 120).toLowerCase() || "question_unknown";
    const key = `${bucket.section_type}::${questionType}`;
    const current = existingByKey.get(key);
    const previousAttempts = Math.max(0, Math.floor(toNumber(current?.attempts) ?? 0));
    const previousRolling = toNumber(current?.rolling_accuracy_ratio);
    const previousBest = toNumber(current?.best_accuracy_ratio);
    const accuracy = roundTo(clamp(bucket.accuracy_ratio, 0, 1), 4);
    const nextAttempts = previousAttempts + 1;
    const rolling = previousRolling == null
      ? accuracy
      : roundTo(clamp(previousRolling * 0.65 + accuracy * 0.35, 0, 1), 4);
    const best = previousBest == null ? accuracy : Math.max(previousBest, accuracy);
    const masteryLevel = roundTo(clamp(rolling * 0.75 + best * 0.25, 0, 1), 4);

    return {
      user_id: userId,
      language_id: scope.languageId,
      product_id: scope.practiceProductId,
      section_type: bucket.section_type,
      question_type: questionType,
      attempts: nextAttempts,
      last_accuracy_ratio: accuracy,
      best_accuracy_ratio: roundTo(best, 4),
      rolling_accuracy_ratio: rolling,
      mastery_level: masteryLevel,
      mastery_status: masteryStatusFrom(masteryLevel, nextAttempts),
      last_practice_session_id: refs.practice_session_id ?? null,
      last_session_id: refs.session_id ?? null,
      last_attempt_id: refs.attempt_id ?? null,
      last_practiced_at: bucket.practiced_at,
      metadata: {
        ...(isObject(current?.metadata) ? current?.metadata : {}),
        updated_from: bucket.source,
        delivery_build_id: refs.delivery_build_id ?? null,
        raw_score: bucket.raw_score,
        max_score: bucket.max_score,
        accuracy_ratio: accuracy,
      },
    };
  });

  const { data, error } = await sb
    .from("ielts_practice_mastery")
    .upsert(upsertRows, { onConflict: "user_id,language_id,section_type,question_type" })
    .select("section_type,question_type,attempts,mastery_level,mastery_status,rolling_accuracy_ratio");

  if (error) throw new Error("Failed to update IELTS practice mastery");
  return (Array.isArray(data) ? data : []) as JsonRecord[];
};

const updateMasteryFromAttempt = async (
  sb: any,
  scope: ResolvedScope,
  userId: string,
  attempt: AttemptRow,
  scoreResult: ScoreResult,
  submittedAt: string,
): Promise<JsonRecord[]> => {
  const accuracy = scoreResult.accuracyRatio ?? (scoreResult.estimatedBand != null ? scoreResult.estimatedBand / 9 : null);
  if (accuracy == null) return [];
  return updateMasteryBuckets(
    sb,
    scope,
    userId,
    [{
      section_type: attempt.section_type,
      question_type: attempt.question_type,
      accuracy_ratio: accuracy,
      raw_score: scoreResult.rawScore,
      max_score: scoreResult.maxScore,
      practiced_at: submittedAt,
      source: "legacy_attempt",
    }],
    { attempt_id: attempt.id },
  );
};

const updateMasteryFromPracticeSession = async (
  sb: any,
  scope: ResolvedScope,
  userId: string,
  bundle: JsonRecord,
): Promise<JsonRecord[]> => {
  const practiceSession = isObject(bundle.practice_session) ? (bundle.practice_session as JsonRecord) : {};
  const runtimeSessionId = toText(practiceSession.session_id, 80);
  const deliveryExperienceId = toText(practiceSession.delivery_experience_id, 80);
  if (!runtimeSessionId || !deliveryExperienceId) return [];

  const sections = Array.isArray(bundle.sections) ? bundle.sections.filter(isObject) : [];
  const sectionIds = sections.map((section) => toText(section.id, 80)).filter(Boolean);
  if (sectionIds.length === 0) return [];

  const sectionTypeById = new Map<string, "reading" | "listening" | "writing">();
  for (const section of sections) {
    const sectionType = toSectionType((section.metadata as any)?.type);
    if (sectionType) sectionTypeById.set(toText(section.id, 80), sectionType);
  }

  const { data: partsData } = await sb
    .from("parts")
    .select("id,section_id")
    .in("section_id", sectionIds);
  const parts = Array.isArray(partsData) ? partsData.filter(isObject) : [];
  const partIds = parts.map((part) => toText(part.id, 80)).filter(Boolean);
  if (partIds.length === 0) return [];

  const partToSection = new Map<string, string>();
  for (const part of parts) partToSection.set(toText(part.id, 80), toText(part.section_id, 80));

  const { data: unitsData } = await sb
    .from("content_units")
    .select("id,part_id,type,data,metadata,display_order")
    .in("part_id", partIds);
  const units = Array.isArray(unitsData) ? unitsData.filter(isObject) : [];
  const unitIds = units.map((unit) => toText(unit.id, 80)).filter(Boolean);
  if (unitIds.length === 0) return [];

  const [{ data: keysData }, { data: responsesData }] = await Promise.all([
    sb
      .from("answer_keys")
      .select("content_unit_id,correct")
      .in("content_unit_id", unitIds),
    sb
      .from("responses")
      .select("content_unit_id,data,submitted_at")
      .eq("session_id", runtimeSessionId)
      .order("submitted_at", { ascending: true }),
  ]);

  const unitById = new Map<string, JsonRecord>();
  for (const unit of units) unitById.set(toText(unit.id, 80), unit);

  const keyByUnitId = new Map<string, JsonRecord>();
  for (const key of Array.isArray(keysData) ? keysData.filter(isObject) : []) {
    keyByUnitId.set(toText(key.content_unit_id, 80), key);
  }

  const latestResponseByUnitId = new Map<string, JsonRecord>();
  for (const response of Array.isArray(responsesData) ? responsesData.filter(isObject) : []) {
    latestResponseByUnitId.set(toText(response.content_unit_id, 80), response);
  }

  const aggregate = new Map<string, {
    section_type: "reading" | "listening" | "writing";
    question_type: string;
    raw_score: number;
    max_score: number;
    practiced_at: string;
  }>();

  for (const [unitId, key] of keyByUnitId.entries()) {
    const unit = unitById.get(unitId);
    if (!unit || !key) continue;

    const partId = toText(unit.part_id, 80);
    const sectionId = partToSection.get(partId);
    const sectionType = sectionId ? sectionTypeById.get(sectionId) : null;
    if (!sectionType || sectionType === "writing") continue;

    const response = latestResponseByUnitId.get(unitId);
    const scored = scoreObjectiveQuestion(toText(unit.type, 120), key.correct, response?.data);
    if (!scored || scored.max <= 0) continue;

    const questionType = questionTypeFromUnit(unit);
    const mapKey = `${sectionType}::${questionType}`;
    const bucket = aggregate.get(mapKey) ?? {
      section_type: sectionType,
      question_type: questionType,
      raw_score: 0,
      max_score: 0,
      practiced_at: new Date().toISOString(),
    };
    bucket.raw_score += scored.score;
    bucket.max_score += scored.max;
    const submittedAt = toNullableText(response?.submitted_at, 80);
    if (submittedAt && submittedAt > bucket.practiced_at) bucket.practiced_at = submittedAt;
    aggregate.set(mapKey, bucket);
  }

  const buckets = Array.from(aggregate.values()).map((bucket) => ({
    section_type: bucket.section_type,
    question_type: bucket.question_type,
    accuracy_ratio: bucket.max_score > 0 ? bucket.raw_score / bucket.max_score : 0,
    raw_score: bucket.raw_score,
    max_score: bucket.max_score,
    practiced_at: bucket.practiced_at,
    source: "transformed_session",
  }));

  const hasWritingSection = sections.some((section) => toSectionType((section.metadata as any)?.type) === "writing");
  if (hasWritingSection) {
    const outcome = isObject(bundle.latest_outcome) ? (bundle.latest_outcome as JsonRecord) : null;
    const evaluations = isObject(bundle.evaluations) ? (bundle.evaluations as JsonRecord) : {};
    const aiEvaluation = isObject(evaluations.ai) ? (evaluations.ai as JsonRecord) : null;
    const writingBand = extractWritingBand(outcome, aiEvaluation);
    if (writingBand != null) {
      const blueprint = isObject(bundle.blueprint) ? (bundle.blueprint as JsonRecord) : {};
      const targetTypes = Array.isArray(blueprint.target_question_types)
        ? blueprint.target_question_types.map((entry) => toText(entry, 120).toLowerCase()).filter(Boolean)
        : [];
      const questionTypes = targetTypes.length > 0 ? targetTypes : ["question_text"];
      for (const questionType of questionTypes) {
        buckets.push({
          section_type: "writing",
          question_type: questionType,
          accuracy_ratio: writingBand / 9,
          raw_score: writingBand,
          max_score: 9,
          practiced_at: toNullableText(aiEvaluation?.evaluated_at, 80) ?? new Date().toISOString(),
          source: "writing_evaluation",
        });
      }
    }
  }

  return updateMasteryBuckets(sb, scope, userId, buckets, {
    practice_session_id: toNullableText(practiceSession.id, 80),
    session_id: runtimeSessionId,
    delivery_build_id: toNullableText(practiceSession.delivery_build_id, 80),
  });
};

const scoreAndRefreshPracticeSession = async (
  sb: any,
  supabaseUrl: string,
  anonKey: string,
  token: string,
  scope: ResolvedScope,
  userId: string,
  bundle: JsonRecord,
): Promise<{ scoring: JsonRecord | null; mastery_updates: JsonRecord[]; diagnostics_snapshot_id: string | null }> => {
  const practiceSession = isObject(bundle.practice_session) ? (bundle.practice_session as JsonRecord) : {};
  const runtimeSessionId = toText(practiceSession.session_id, 80);
  if (!runtimeSessionId) throw new Error("Practice session has no runtime session id");

  const scoring = await callScoreSession(supabaseUrl, anonKey, token, runtimeSessionId);
  const sections = Array.isArray(bundle.sections) ? bundle.sections.filter(isObject) : [];
  const hasWriting = sections.some((section) => toSectionType((section.metadata as any)?.type) === "writing");
  if (hasWriting) {
    await callGradeWriting(supabaseUrl, anonKey, token, runtimeSessionId);
  }

  const refreshed = await loadPracticeSessionBundle(sb, toText(practiceSession.id, 80), userId, scope);
  const latestBundle = refreshed ?? bundle;
  const evaluations = isObject(latestBundle.evaluations) ? (latestBundle.evaluations as JsonRecord) : {};
  const autoEval = isObject(evaluations.auto) ? (evaluations.auto as JsonRecord) : null;
  const aiEval = isObject(evaluations.ai) ? (evaluations.ai as JsonRecord) : null;
  const latestOutcome = isObject(latestBundle.latest_outcome) ? (latestBundle.latest_outcome as JsonRecord) : null;
  const nowIso = new Date().toISOString();

  await sb
    .from("ielts_practice_sessions")
    .update({
      status: "completed",
      latest_outcome_id: latestOutcome ? toNullableText(latestOutcome.id, 80) : null,
      latest_auto_evaluation_id: autoEval ? toNullableText(autoEval.id, 80) : null,
      latest_ai_evaluation_id: aiEval ? toNullableText(aiEval.id, 80) : null,
      completed_at: (latestBundle.session as any)?.completed_at ?? nowIso,
      review_metadata: {
        refreshed_at: nowIso,
        scoring_schema: isObject(scoring?.result) ? (scoring?.result as JsonRecord).schema_version ?? null : null,
      },
    })
    .eq("id", toText(practiceSession.id, 80));

  const planItemId = toNullableText(practiceSession.plan_item_id, 80);
  if (planItemId) {
    await sb
      .from("ielts_practice_plan_items")
      .update({ status: "completed", completed_at: nowIso })
      .eq("id", planItemId);
  }

  const masteryUpdates = await updateMasteryFromPracticeSession(sb, scope, userId, latestBundle);
  let diagnosticsSnapshotId: string | null = null;
  try {
    const goals = await getGoals(sb, userId, scope);
    const computed = await computeDiagnostics(sb, scope, userId, goals);
    const snapshot = await persistDiagnostics(sb, userId, scope, computed.payload, computed.sourceSummary);
    diagnosticsSnapshotId = toNullableText(snapshot.id, 80);
  } catch {
    diagnosticsSnapshotId = null;
  }

  return { scoring, mastery_updates: masteryUpdates, diagnostics_snapshot_id: diagnosticsSnapshotId };
};

const formatQuestionLabel = (value: unknown): string =>
  toText(value, 120)
    .replace(/^question_/i, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (token) => token.toUpperCase())
    || "IELTS skill";

const labPayloadFromBundle = (bundle: JsonRecord): JsonRecord | null => {
  const build = isObject(bundle.delivery_build) ? (bundle.delivery_build as JsonRecord) : {};
  const metadata = isObject(build.metadata) ? (build.metadata as JsonRecord) : {};
  const payload = isObject(metadata.lab_payload) ? (metadata.lab_payload as JsonRecord) : null;
  return payload?.version === PRACTICE_LAB_SCHEMA_VERSION ? payload : null;
};

const cloneJsonRecord = (value: JsonRecord): JsonRecord => {
  try {
    return JSON.parse(JSON.stringify(value)) as JsonRecord;
  } catch {
    return { ...value };
  }
};

const isPlayableMediaUrl = (value: unknown): value is string => {
  const text = toText(value, 1600);
  return /^https?:\/\//i.test(text) || text.startsWith("/") || text.startsWith("data:") || text.startsWith("blob:");
};

const firstTextFromRecord = (value: unknown, keys: string[], maxLen = 18000): string | null => {
  if (!isObject(value)) return null;
  for (const key of keys) {
    const text = toNullableText(value[key], maxLen);
    if (text) return text;
  }
  return null;
};

const storageRefFromAudioData = (audioData: JsonRecord, context: JsonRecord): JsonRecord | null => {
  if (isObject(audioData.storage)) return audioData.storage as JsonRecord;
  if (isObject(context.audio_storage)) return context.audio_storage as JsonRecord;
  const bucket = toNullableText(audioData.bucket ?? context.audio_bucket, 200);
  const path = toNullableText(audioData.path ?? audioData.key ?? context.audio_path, 1200);
  return bucket && path ? { bucket, path } : null;
};

const hydrateLabPayloadMedia = async (
  sb: any,
  userId: string,
  labPayload: JsonRecord,
): Promise<JsonRecord> => {
  const payload = cloneJsonRecord(labPayload);
  const steps = Array.isArray(payload.steps) ? payload.steps.filter(isObject) as JsonRecord[] : [];
  if (steps.length === 0) return payload;

  const questionUnitIds = Array.from(new Set(
    steps
      .flatMap((step) => [
        toNullableText(step.delivery_content_unit_id, 80),
        toNullableText(step.source_content_unit_id, 80),
      ])
      .filter((entry): entry is string => Boolean(entry)),
  ));
  if (questionUnitIds.length === 0) return payload;

  const { data: questionRows } = await sb
    .from("content_units")
    .select("id,part_id")
    .in("id", questionUnitIds);

  const partIdByQuestionUnitId = new Map<string, string>();
  for (const row of Array.isArray(questionRows) ? questionRows : []) {
    const id = toNullableText((row as any).id, 80);
    const partId = toNullableText((row as any).part_id, 80);
    if (id && partId) partIdByQuestionUnitId.set(id, partId);
  }

  const partIds = Array.from(new Set(Array.from(partIdByQuestionUnitId.values()).filter(Boolean)));
  if (partIds.length === 0) return payload;

  const { data: audioRows } = await sb
    .from("content_units")
    .select("id,part_id,type,data")
    .in("part_id", partIds)
    .eq("type", "audio");

  const audioByPartId = new Map<string, JsonRecord>();
  for (const row of Array.isArray(audioRows) ? audioRows : []) {
    if (!isObject(row)) continue;
    const partId = toNullableText((row as any).part_id, 80);
    if (partId && !audioByPartId.has(partId)) audioByPartId.set(partId, row as JsonRecord);
  }

  const signedUrlByAudioUnitId = new Map<string, string | null>();
  for (const step of steps) {
    const context = isObject(step.context) ? { ...(step.context as JsonRecord) } : {};
    const currentAudioUrl = toNullableText(context.audio_url, 1600);
    if (currentAudioUrl && isPlayableMediaUrl(currentAudioUrl)) continue;

    const deliveryUnitId = toNullableText(step.delivery_content_unit_id, 80);
    const sourceUnitId = toNullableText(step.source_content_unit_id, 80);
    const partId = (deliveryUnitId ? partIdByQuestionUnitId.get(deliveryUnitId) : null)
      ?? (sourceUnitId ? partIdByQuestionUnitId.get(sourceUnitId) : null)
      ?? null;
    const audioUnit = partId ? audioByPartId.get(partId) : null;
    const audioData = isObject(audioUnit?.data) ? (audioUnit?.data as JsonRecord) : {};

    let audioUrl: string | null = null;
    const directUrl = toNullableText(audioData.url ?? audioData.audio_url ?? audioData.public_url, 1600);
    if (directUrl && isPlayableMediaUrl(directUrl)) {
      audioUrl = directUrl;
    }

    const audioUnitId = toNullableText(audioUnit?.id, 80);
    if (!audioUrl) {
      const storageRef = storageRefFromAudioData(audioData, context);
      if (storageRef && audioUnitId && signedUrlByAudioUnitId.has(audioUnitId)) {
        audioUrl = signedUrlByAudioUnitId.get(audioUnitId) ?? null;
      } else if (storageRef) {
        audioUrl = await signStorageRef(sb, storageRef, LAB_MEDIA_SIGNED_URL_TTL_SECONDS, {
          route: "ielts-practice.labs.media",
          userId,
        });
        if (audioUnitId) signedUrlByAudioUnitId.set(audioUnitId, audioUrl);
      }
    }

    const transcript = toNullableText(context.transcript, 18000)
      ?? firstTextFromRecord(audioData, ["transcript", "transcript_text", "text"], 18000);
    const storageRef = storageRefFromAudioData(audioData, context);

    step.context = {
      ...context,
      ...(audioUnitId ? { audio_unit_id: audioUnitId } : {}),
      ...(storageRef ? { audio_storage: storageRef } : {}),
      ...(audioUrl ? { audio_url: audioUrl } : {}),
      ...(transcript ? { transcript } : {}),
      has_audio: Boolean(audioUrl || audioUnit || context.has_audio),
      has_transcript: Boolean(transcript),
    };
    if (isObject(step.replay)) {
      step.replay = {
        ...(step.replay as JsonRecord),
        available: Boolean(audioUrl || transcript || audioUnit || context.has_audio),
        ...(audioUrl ? { audio_url: audioUrl } : {}),
        ...(transcript ? { transcript } : {}),
      };
    }
  }

  return payload;
};

const loadLatestLabAttempt = async (sb: any, practiceSessionId: string, userId: string): Promise<JsonRecord | null> => {
  const { data } = await sb
    .from("ielts_practice_lab_attempts")
    .select("id,practice_session_id,delivery_build_id,lab_kind,section_type,status,current_step_index,answers_json,score_artifacts,raw_score,max_score,accuracy_ratio,estimated_band,started_at,submitted_at,scored_at,metadata,created_at,updated_at")
    .eq("practice_session_id", practiceSessionId)
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return isObject(data) ? (data as JsonRecord) : null;
};

const upsertLabAttemptDraft = async (
  sb: any,
  scope: ResolvedScope,
  userId: string,
  practiceSession: JsonRecord,
  labPayload: JsonRecord,
  body: JsonRecord,
): Promise<JsonRecord> => {
  const practiceSessionId = toText(practiceSession.id, 80);
  const existing = await loadLatestLabAttempt(sb, practiceSessionId, userId);
  const nowIso = new Date().toISOString();
  const answers = isObject(body.answers) ? body.answers : {};
  const currentStepIndex = Math.max(0, Math.floor(toNumber(body.current_step_index) ?? toNumber(body.currentStepIndex) ?? 0));
  const row = {
    user_id: userId,
    language_id: scope.languageId,
    product_id: scope.practiceProductId,
    practice_session_id: practiceSessionId,
    delivery_build_id: toNullableText(practiceSession.delivery_build_id, 80),
    lab_kind: toText(labPayload.lab_kind, 80) || "guided_lab",
    section_type: toSectionType(labPayload.section_type) ?? "reading",
    status: "in_progress",
    current_step_index: currentStepIndex,
    answers_json: answers,
    metadata: {
      schema_version: PRACTICE_LAB_ATTEMPT_SCHEMA_VERSION,
      saved_at: nowIso,
      elapsed_seconds: Math.max(0, Math.floor(toNumber(body.elapsed_seconds) ?? 0)),
    },
  };

  const query = existing?.id
    ? sb
      .from("ielts_practice_lab_attempts")
      .update(row)
      .eq("id", toText(existing.id, 80))
      .select("id,practice_session_id,delivery_build_id,lab_kind,section_type,status,current_step_index,answers_json,score_artifacts,raw_score,max_score,accuracy_ratio,estimated_band,started_at,submitted_at,scored_at,metadata,created_at,updated_at")
      .maybeSingle()
    : sb
      .from("ielts_practice_lab_attempts")
      .insert(row)
      .select("id,practice_session_id,delivery_build_id,lab_kind,section_type,status,current_step_index,answers_json,score_artifacts,raw_score,max_score,accuracy_ratio,estimated_band,started_at,submitted_at,scored_at,metadata,created_at,updated_at")
      .maybeSingle();

  const { data, error } = await query;
  if (error || !data) throw new Error("Failed to save practice lab attempt");
  return data as JsonRecord;
};

const responseDataForStep = (step: JsonRecord, response: unknown): unknown => {
  if (!isObject(response)) return response;
  const shape = isObject(step.response_shape) ? (step.response_shape as JsonRecord) : {};
  const kind = toText(shape.kind, 80).toLowerCase();
  if (kind === "single_choice") {
    return { selected_option: response.selected_option ?? response.answer ?? response.value ?? response.text };
  }
  if (kind === "multi_choice") {
    return { selected_options: Array.isArray(response.selected_options) ? response.selected_options : Array.isArray(response.answer) ? response.answer : [] };
  }
  if (kind === "map") {
    const mapKey = toText(shape.map_key, 80);
    if (mapKey && isObject(response[mapKey])) return response;
    if (isObject(response.answers)) return response.answers;
    return response;
  }
  return { text: response.answer ?? response.text ?? response.rewrite ?? response.full_rewrite ?? response.value ?? "" };
};

const scoreLabStep = (
  labPayload: JsonRecord,
  step: JsonRecord,
  response: unknown,
): {
  step_id: string;
  question_type: string;
  trap_type: string;
  raw_score: number;
  max_score: number;
  accuracy_ratio: number;
  feedback: string;
} => {
  const stepId = toText(step.id, 120);
  const questionType = toText(step.question_type, 120).toLowerCase() || "question_unknown";
  const kind = toText(step.kind, 80).toLowerCase();
  const correct = isObject(step.answer_key) ? step.answer_key : {};
  const isWriting = toSectionType(labPayload.section_type) === "writing" || kind === "writing_rewrite";

  let rawScore = 0;
  let maxScore = 1;
  if (isWriting) {
    const text = firstTextValue(response, ["rewrite", "full_rewrite", "answer", "text", "value"]);
    const heuristic = heuristicWritingBand({ text });
    rawScore = heuristic.band;
    maxScore = 9;
  } else {
    const scored = scoreObjectiveQuestion(questionType, correct, responseDataForStep(step, response));
    rawScore = scored?.score ?? 0;
    maxScore = scored && scored.max > 0 ? scored.max : 1;
  }

  let processScore = 0;
  let processMax = 0;
  if (isObject(response)) {
    if (kind === "evidence_locator") {
      processMax += 1;
      const evidence = firstTextValue(response, ["evidence", "evidence_text", "highlight"]);
      if (evidence.length >= 12) processScore += 1;
    }
    if (kind === "distractor_elimination") {
      processMax += 1;
      const trap = toText(response.trap_type, 80);
      const reason = firstTextValue(response, ["reason", "explanation"]);
      if (trap && reason.length >= 8) processScore += 1;
    }
    if (kind === "listening_replay") {
      processMax += 1;
      const prediction = firstTextValue(response, ["prediction"]);
      const paraphrase = firstTextValue(response, ["paraphrase", "signpost"]);
      if (prediction.length >= 2) processScore += 0.4;
      if (paraphrase.length >= 6) processScore += 0.6;
    }
  }

  const totalRaw = rawScore + processScore;
  const totalMax = maxScore + processMax;
  const accuracy = totalMax > 0 ? clamp(totalRaw / totalMax, 0, 1) : 0;
  const trapType = isObject(response) ? toText(response.trap_type, 80).toLowerCase() || (accuracy < 0.75 ? "unknown" : "none") : (accuracy < 0.75 ? "unknown" : "none");

  return {
    step_id: stepId,
    question_type: questionType,
    trap_type: trapType,
    raw_score: roundTo(totalRaw, 4),
    max_score: roundTo(totalMax, 4),
    accuracy_ratio: roundTo(accuracy, 4),
    feedback: accuracy >= 0.85
      ? "Strong response. This can move toward mastery."
      : accuracy >= 0.55
        ? "Partial control. Review the evidence, paraphrase, or distractor before the next attempt."
        : "This pattern needs repair. Add it to the notebook and revisit soon.",
  };
};

const insertWritingLabResponsesAndGrade = async (
  sb: any,
  supabaseUrl: string,
  anonKey: string,
  token: string,
  bundle: JsonRecord,
  labPayload: JsonRecord,
  answers: JsonRecord,
): Promise<{ evaluation_id: string | null; result: JsonRecord | null }> => {
  if (toSectionType(labPayload.section_type) !== "writing") return { evaluation_id: null, result: null };
  const practiceSession = isObject(bundle.practice_session) ? (bundle.practice_session as JsonRecord) : {};
  const runtimeSessionId = toText(practiceSession.session_id, 80);
  if (!runtimeSessionId) return { evaluation_id: null, result: null };

  const rows: JsonRecord[] = [];
  for (const step of Array.isArray(labPayload.steps) ? labPayload.steps.filter(isObject) : []) {
    const unitId = toNullableText(step.delivery_content_unit_id, 80);
    if (!unitId) continue;
    const response = isObject(answers[toText(step.id, 120)]) ? (answers[toText(step.id, 120)] as JsonRecord) : {};
    const text = firstTextValue(response, ["rewrite", "full_rewrite", "answer", "text", "value"]);
    if (!text) continue;
    rows.push({
      session_id: runtimeSessionId,
      content_unit_id: unitId,
      type: "text",
      data: { text },
      metadata: {
        source: "ielts-practice.lab",
        lab_step_id: toText(step.id, 120),
      },
    });
  }

  if (rows.length === 0) return { evaluation_id: null, result: null };
  await sb.from("responses").insert(rows);
  await sb.from("sessions").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", runtimeSessionId);
  const grade = await callGradeWriting(supabaseUrl, anonKey, token, runtimeSessionId);
  return { evaluation_id: grade.evaluationId, result: grade.result };
};

const upsertMistakeNotebookFromLab = async (
  sb: any,
  scope: ResolvedScope,
  userId: string,
  labAttemptId: string,
  sectionType: "reading" | "listening" | "writing",
  scoredSteps: JsonRecord[],
  nowIso: string,
): Promise<JsonRecord[]> => {
  const rows: JsonRecord[] = [];
  for (const step of scoredSteps) {
    const accuracy = clamp(toNumber(step.accuracy_ratio) ?? 0, 0, 1);
    if (accuracy >= 0.75) continue;
    const questionType = toText(step.question_type, 120).toLowerCase() || "question_unknown";
    const trapType = toText(step.trap_type, 80).toLowerCase() || "unknown";
    const nextReview = new Date(Date.parse(nowIso) + (accuracy < 0.45 ? 1 : 3) * 24 * 60 * 60 * 1000).toISOString();
    const mistakePattern = `${formatQuestionLabel(questionType)}: ${trapType.replace(/_/g, " ")}`;

    const { data: existing } = await sb
      .from("ielts_practice_mistake_notebook")
      .select("id,review_count,metadata")
      .eq("user_id", userId)
      .eq("language_id", scope.languageId)
      .eq("product_id", scope.practiceProductId)
      .eq("section_type", sectionType)
      .eq("question_type", questionType)
      .eq("trap_type", trapType)
      .eq("status", "active")
      .maybeSingle();

    const payload = {
      user_id: userId,
      language_id: scope.languageId,
      product_id: scope.practiceProductId,
      section_type: sectionType,
      question_type: questionType,
      trap_type: trapType,
      mistake_pattern: mistakePattern,
      coach_note: `Next review: slow down on ${formatQuestionLabel(questionType)} and prove the answer with evidence or paraphrase.`,
      review_count: Math.max(0, Math.floor(toNumber((existing as any)?.review_count) ?? 0)) + 1,
      status: "active",
      priority: roundTo(1 - accuracy, 4),
      next_review_at: nextReview,
      last_seen_at: nowIso,
      last_lab_attempt_id: labAttemptId,
      metadata: {
        ...(isObject((existing as any)?.metadata) ? (existing as any).metadata : {}),
        last_accuracy_ratio: accuracy,
        last_step_id: toText(step.step_id, 120),
      },
    };

    const query = (existing as any)?.id
      ? sb.from("ielts_practice_mistake_notebook").update(payload).eq("id", String((existing as any).id)).select("*").maybeSingle()
      : sb.from("ielts_practice_mistake_notebook").insert(payload).select("*").maybeSingle();
    const { data } = await query;
    if (isObject(data)) rows.push(data as JsonRecord);
  }
  return rows;
};

// Feature 4: capture words/phrases from missed gap-style questions into the
// vocabulary notebook. Targeted to question types where the expected answer is
// a single word or short phrase the student presumably didn't recall — gap
// fill, summary/note/table completion, select-from-list. Other types (TFNG,
// matching, multi-choice) already feed the mistake notebook + SRS and don't
// produce a single vocab item.
const VOCAB_CAPTURE_QUESTION_TYPES = new Set([
  "question_gap_fill",
  "question_select_from_list",
  "question_summary_completion",
  "question_table_completion",
  "question_form_completion",
  "question_note_completion",
  "question_sentence_endings",
]);

const VOCAB_TOKEN_MAX_LEN = 40;
const VOCAB_TOKEN_MIN_LEN = 2;

const normalizeVocabWord = (raw: unknown): string => {
  const text = String(raw ?? "").trim().toLowerCase();
  if (!text) return "";
  // Drop trailing/leading punctuation but keep internal hyphens/apostrophes.
  const trimmed = text.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
  if (trimmed.length < VOCAB_TOKEN_MIN_LEN || trimmed.length > VOCAB_TOKEN_MAX_LEN) return "";
  // Reject purely numeric values — IELTS gap-fills sometimes accept "25%" or
  // "1999" but those aren't vocabulary worth notebooking.
  if (/^[\d\s%./-]+$/.test(trimmed)) return "";
  return trimmed;
};

const extractVocabFromAnswerKey = (answerKey: unknown): string[] => {
  const out: string[] = [];
  const seen = new Set<string>();
  const visit = (value: unknown): void => {
    if (typeof value === "string") {
      const word = normalizeVocabWord(value);
      if (word && !seen.has(word)) {
        seen.add(word);
        out.push(word);
      }
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (isObject(value)) {
      for (const v of Object.values(value)) visit(v);
    }
  };
  visit(answerKey);
  return out;
};

const captureMissedVocabularyFromLab = async (
  sb: any,
  scope: ResolvedScope,
  userId: string,
  labAttemptId: string,
  labPayload: JsonRecord,
  scoredSteps: JsonRecord[],
  nowIso: string,
): Promise<number> => {
  const sectionType = toSectionType(labPayload.section_type);
  if (!sectionType) return 0;

  const sourceSteps = Array.isArray(labPayload.steps)
    ? (labPayload.steps as unknown[]).filter(isObject) as JsonRecord[]
    : [];
  const scoredById = new Map<string, JsonRecord>();
  for (const step of scoredSteps) {
    const id = toText(step.step_id, 120);
    if (id) scoredById.set(id, step);
  }

  let captured = 0;
  for (const step of sourceSteps) {
    const stepId = toText(step.id, 120);
    if (!stepId) continue;
    const scored = scoredById.get(stepId);
    const accuracy = scored ? clamp(toNumber(scored.accuracy_ratio) ?? 0, 0, 1) : 1;
    // A fully correct answer doesn't need notebooking.
    if (accuracy >= 1) continue;

    const questionType = toText(step.question_type, 120).toLowerCase();
    if (!VOCAB_CAPTURE_QUESTION_TYPES.has(questionType)) continue;

    const answerKey = isObject(step.answer_key) ? step.answer_key : null;
    if (!answerKey) continue;

    const words = extractVocabFromAnswerKey(answerKey);
    if (words.length === 0) continue;

    const contextText = firstTextValue(step, ["context", "text", "prompt", "statement"]).slice(0, 600) || null;

    for (const word of words.slice(0, 5)) {
      const payload = {
        user_id: userId,
        language_id: scope.languageId,
        word,
        normalized_word: word,
        context_text: contextText,
        source_type: sectionType,
        source_product_id: scope.practiceProductId,
        source_label: "Missed in practice",
        source_ref: `lab_attempt:${labAttemptId}:${stepId}`,
        notes: null,
        is_archived: false,
        metadata: {
          captured_at: nowIso,
          question_type: questionType,
          accuracy_ratio: accuracy,
        },
      };
      const { error } = await sb
        .from("user_vocabulary_notebook_entries")
        .insert(payload);
      if (error) {
        // 23505 = already in notebook for this user+language — no-op.
        if ((error as { code?: string }).code === "23505") continue;
        // Don't throw — vocab capture is best-effort. Stop scanning further
        // words for this step but keep processing other steps.
        break;
      }
      captured += 1;
    }
  }
  return captured;
};

// Feature 1: AI coach. Returns per-question explanations + trap names +
// playbook strategy deep-link for the worst-performing items in a lab attempt.
// Maps canonical question types to the playbook page slug that teaches the
// matching strategy. Fall back to /diagnostic when the slug is unknown.
const PLAYBOOK_STRATEGY_SLUG: Record<string, string> = {
  question_true_false_not_given: 'reading-master-guide',
  question_yes_no_not_given: 'reading-master-guide',
  question_matching_headings: 'reading-master-guide',
  question_matching: 'reading-master-guide',
  question_summary_completion: 'reading-master-guide',
  question_sentence_endings: 'reading-master-guide',
  question_select_from_list: 'reading-master-guide',
  question_form_completion: 'listening-master-guide',
  question_note_completion: 'listening-master-guide',
  question_map_labeling: 'listening-master-guide',
  question_table_completion: 'listening-master-guide',
  question_gap_fill: 'listening-master-guide',
  question_multi_choice: 'listening-master-guide',
  question_single_choice: 'listening-master-guide',
  question_text: 'writing-master-guide',
};

const PLAYBOOK_BASE_URL = "https://playbook.ielts.schood.online";

const strategyUrlForQuestionType = (questionType: string, sectionType: string): string => {
  const slug = PLAYBOOK_STRATEGY_SLUG[questionType];
  if (slug) return `${PLAYBOOK_BASE_URL}/${slug}?source=practice&focus=${encodeURIComponent(questionType)}`;
  return `${PLAYBOOK_BASE_URL}/diagnostic?source=practice&weak_skill=${encodeURIComponent(sectionType)}`;
};

interface CoachStepFeedback {
  step_id: string;
  question_type: string;
  accuracy_ratio: number;
  what_went_wrong: string;
  correct_approach: string;
  trap_pattern: string;
  strategy_url: string;
}

interface CoachResponse {
  ok: true;
  steps: CoachStepFeedback[];
  generated_at: string;
}

const COACH_MAX_STEPS = 3;

const truncate = (text: string, maxLen: number): string => {
  const t = String(text ?? '').trim();
  return t.length > maxLen ? `${t.slice(0, maxLen - 1)}…` : t;
};

const stringifyAnswer = (value: unknown): string => {
  if (value == null) return '(no answer)';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const buildCoachPromptItems = (
  labPayload: JsonRecord,
  answers: JsonRecord,
  scoredSteps: JsonRecord[],
): Array<{ step_id: string; question_type: string; section_type: string; prompt: string; expected: string; student: string; context: string; accuracy: number }> => {
  const items = [];
  const stepsById = new Map<string, JsonRecord>();
  for (const step of Array.isArray(labPayload.steps) ? (labPayload.steps as unknown[]).filter(isObject) : []) {
    const id = toText((step as JsonRecord).id, 120);
    if (id) stepsById.set(id, step as JsonRecord);
  }
  const sectionType = toText(labPayload.section_type, 32).toLowerCase();
  const sorted = [...scoredSteps].sort((a, b) => {
    const ra = clamp(toNumber(a.accuracy_ratio) ?? 1, 0, 1);
    const rb = clamp(toNumber(b.accuracy_ratio) ?? 1, 0, 1);
    return ra - rb;
  });
  for (const scored of sorted) {
    const accuracy = clamp(toNumber(scored.accuracy_ratio) ?? 1, 0, 1);
    if (accuracy >= 0.85) continue; // Only coach where there's a real gap.
    const stepId = toText(scored.step_id, 120);
    const source = stepsById.get(stepId);
    if (!source) continue;
    const questionType = toText(source.question_type, 120).toLowerCase() || toText(scored.question_type, 120).toLowerCase();
    const prompt = truncate(firstTextValue(source, ['prompt', 'instruction', 'question']), 600);
    const context = truncate(firstTextValue(source, ['context', 'text', 'passage', 'transcript']), 1400);
    const answerKey = isObject(source.answer_key) ? source.answer_key : null;
    const expected = truncate(stringifyAnswer(answerKey), 400);
    const student = truncate(stringifyAnswer((answers as Record<string, unknown>)[stepId]), 400);
    items.push({ step_id: stepId, question_type: questionType, section_type: sectionType, prompt, expected, student, context, accuracy });
    if (items.length >= COACH_MAX_STEPS) break;
  }
  return items;
};

const callOpenRouterCoach = async (
  prompt: string,
  apiKey: string,
  model: string,
): Promise<unknown> => {
  const baseUrl = (Deno.env.get("OPENROUTER_BASE_URL") ?? "https://openrouter.ai/api/v1").replace(/\/+$/, "");
  const referer = Deno.env.get("OPENROUTER_REFERER") ?? "https://schood.online";
  const appName = Deno.env.get("OPENROUTER_APP_NAME") ?? "Schood IELTS Practice";
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": referer,
      "X-Title": appName,
    },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are an expert IELTS coach. For each missed question, give one concise paragraph explaining what trap pattern the student fell for and what the correct approach is. Be specific, cite the evidence from the context, and avoid generic advice. Reply in strict JSON only.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenRouter ${res.status}: ${text.slice(0, 300)}`);
  }
  const payload = await res.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("OpenRouter response missing content");
  try {
    return JSON.parse(content);
  } catch {
    throw new Error("OpenRouter returned non-JSON content");
  }
};

const coachLabAttempt = async (
  sb: any,
  scope: ResolvedScope,
  userId: string,
  practiceSessionId: string,
  labPayload: JsonRecord,
): Promise<CoachResponse> => {
  // unused scope check kept for future per-product gating
  void scope;
  const attempt = await loadLatestLabAttempt(sb, practiceSessionId, userId);
  if (!attempt) {
    return { ok: true, steps: [], generated_at: new Date().toISOString() };
  }
  const scoreArtifacts = isObject(attempt.score_artifacts) ? attempt.score_artifacts : {};
  const scoredSteps = Array.isArray(scoreArtifacts.scored_steps)
    ? (scoreArtifacts.scored_steps as unknown[]).filter(isObject) as JsonRecord[]
    : [];
  const answers = isObject(attempt.answers_json) ? attempt.answers_json : {};

  const items = buildCoachPromptItems(labPayload, answers, scoredSteps);
  if (items.length === 0) {
    return { ok: true, steps: [], generated_at: new Date().toISOString() };
  }

  const apiKey = Deno.env.get("OPENROUTER_API_KEY") ?? Deno.env.get("OPENAI_API_KEY");
  const model = Deno.env.get("OPENROUTER_MODEL") ?? "google/gemma-3-27b-it:free";
  if (!apiKey) {
    // Degrade gracefully: return per-step rule-based coaching only.
    return {
      ok: true,
      steps: items.map((item) => ({
        step_id: item.step_id,
        question_type: item.question_type,
        accuracy_ratio: item.accuracy,
        what_went_wrong: `Accuracy ${(item.accuracy * 100).toFixed(0)}% — likely a distractor or paraphrase trap on ${formatQuestionLabel(item.question_type)}.`,
        correct_approach: `Re-read the relevant evidence and confirm wording before answering.`,
        trap_pattern: 'unknown',
        strategy_url: strategyUrlForQuestionType(item.question_type, item.section_type),
      })),
      generated_at: new Date().toISOString(),
    };
  }

  const prompt = JSON.stringify({
    instruction:
      "For each item below, return a JSON object with key 'steps' whose value is an array of objects. Each object must have: step_id, what_went_wrong (1-2 sentences citing the evidence), correct_approach (1-2 sentences naming the technique), trap_pattern (one of: distractor, paraphrase, scope, off-topic, range, grammar, unknown).",
    items: items.map((item) => ({
      step_id: item.step_id,
      question_type: item.question_type,
      section_type: item.section_type,
      accuracy: item.accuracy,
      prompt: item.prompt,
      context: item.context,
      expected_answer: item.expected,
      student_answer: item.student,
    })),
  });

  let aiSteps: Array<{ step_id?: unknown; what_went_wrong?: unknown; correct_approach?: unknown; trap_pattern?: unknown }> = [];
  try {
    const parsed = await callOpenRouterCoach(prompt, apiKey, model);
    const root = isObject(parsed) ? parsed : {};
    const steps = Array.isArray(root.steps) ? root.steps : [];
    aiSteps = steps.filter(isObject) as typeof aiSteps;
  } catch {
    aiSteps = [];
  }

  const aiById = new Map<string, typeof aiSteps[number]>();
  for (const s of aiSteps) {
    const id = toText(s.step_id, 120);
    if (id) aiById.set(id, s);
  }

  return {
    ok: true,
    steps: items.map((item) => {
      const ai = aiById.get(item.step_id);
      const what = toText(ai?.what_went_wrong ?? '', 600);
      const approach = toText(ai?.correct_approach ?? '', 600);
      const trap = toText(ai?.trap_pattern ?? '', 80).toLowerCase() || 'unknown';
      return {
        step_id: item.step_id,
        question_type: item.question_type,
        accuracy_ratio: item.accuracy,
        what_went_wrong: what || `Accuracy ${(item.accuracy * 100).toFixed(0)}% — review the source text and confirm the wording matches.`,
        correct_approach: approach || `Slow down on ${formatQuestionLabel(item.question_type)} and prove the answer with explicit evidence.`,
        trap_pattern: trap,
        strategy_url: strategyUrlForQuestionType(item.question_type, item.section_type),
      };
    }),
    generated_at: new Date().toISOString(),
  };
};

const labKindForRoadmap = (section: string, questionType: string): string => {
  if (section === "writing") return "writing_rewrite";
  if (section === "listening") return questionType.includes("gap") ? "listening_replay" : "distractor_drill";
  if (questionType.includes("matching") || questionType.includes("choice")) return "distractor_drill";
  return "evidence_locator";
};

const refreshRoadmapFromDiagnostics = async (
  sb: any,
  scope: ResolvedScope,
  userId: string,
  goals: GoalRow,
  diagnostics: DiagnosticPayload,
  refs?: { practice_session_id?: string | null },
): Promise<JsonRecord[]> => {
  const rows: JsonRecord[] = [];
  for (const row of (diagnostics.question_types ?? []).slice(0, 12)) {
    const section = toSectionType(row.section_type);
    if (!section) continue;
    const weakness = clamp(toNumber(row.weakness_score) ?? 0, 0, 10);
    const mastery = toNumber(row.mastery_level);
    const questionType = toText(row.question_type, 120).toLowerCase() || "question_unknown";
    const targetBand = toNumber(row.target_band) ?? toNumber(goals.target_overall_band) ?? 6.5;
    const title = `${formatQuestionLabel(section)} ${formatQuestionLabel(questionType)} to band ${targetBand.toFixed(1)}`;
    const payload = {
      user_id: userId,
      language_id: scope.languageId,
      product_id: scope.practiceProductId,
      section_type: section,
      skill_key: questionType,
      title,
      current_state: `Weakness ${weakness.toFixed(2)}${mastery != null ? `, mastery ${Math.round(mastery * 100)}%` : ""}`,
      target_state: `Reliable ${formatQuestionLabel(questionType)} performance at band ${targetBand.toFixed(1)}`,
      linked_lab_kind: labKindForRoadmap(section, questionType),
      priority: roundTo(weakness + Math.max(0, toNumber(row.target_distance) ?? 0), 4),
      status: mastery != null && mastery >= 0.86 ? "completed" : "active",
      last_practice_session_id: refs?.practice_session_id ?? null,
      metadata: {
        weakness_score: weakness,
        target_distance: row.target_distance,
        mastery_level: mastery,
        confidence: row.confidence,
      },
    };
    const { data } = await sb
      .from("ielts_practice_roadmap_items")
      .upsert(payload, { onConflict: "user_id,language_id,product_id,section_type,skill_key" })
      .select("*")
      .maybeSingle();
    if (isObject(data)) rows.push(data as JsonRecord);
  }
  return rows;
};

const loadNotebookItems = async (sb: any, scope: ResolvedScope, userId: string, limit = 12): Promise<JsonRecord[]> => {
  const { data } = await sb
    .from("ielts_practice_mistake_notebook")
    .select("id,section_type,question_type,trap_type,mistake_pattern,coach_note,review_count,status,priority,next_review_at,last_seen_at,metadata,updated_at")
    .eq("user_id", userId)
    .eq("language_id", scope.languageId)
    .eq("product_id", scope.practiceProductId)
    .neq("status", "archived")
    .order("priority", { ascending: false })
    .order("next_review_at", { ascending: true })
    .limit(limit);
  return (Array.isArray(data) ? data : []).filter(isObject) as JsonRecord[];
};

const loadRoadmapItems = async (sb: any, scope: ResolvedScope, userId: string, limit = 12): Promise<JsonRecord[]> => {
  const { data } = await sb
    .from("ielts_practice_roadmap_items")
    .select("id,section_type,skill_key,title,current_state,target_state,linked_lab_kind,priority,status,metadata,updated_at")
    .eq("user_id", userId)
    .eq("language_id", scope.languageId)
    .eq("product_id", scope.practiceProductId)
    .neq("status", "archived")
    .order("priority", { ascending: false })
    .limit(limit);
  return (Array.isArray(data) ? data : []).filter(isObject) as JsonRecord[];
};

const submitLabAttempt = async (
  sb: any,
  supabaseUrl: string,
  anonKey: string,
  token: string,
  scope: ResolvedScope,
  userId: string,
  bundle: JsonRecord,
  body: JsonRecord,
): Promise<JsonRecord> => {
  const practiceSession = isObject(bundle.practice_session) ? (bundle.practice_session as JsonRecord) : {};
  const labPayload = labPayloadFromBundle(bundle);
  if (!labPayload) throw new Error("This practice session does not have a lab payload. Rebuild it in Content Factory.");
  const answers = isObject(body.answers) ? (body.answers as JsonRecord) : {};
  const attempt = await upsertLabAttemptDraft(sb, scope, userId, practiceSession, labPayload, { ...body, answers });
  const sectionType = toSectionType(labPayload.section_type) ?? "reading";
  const steps = Array.isArray(labPayload.steps) ? labPayload.steps.filter(isObject) : [];
  const scoredSteps = steps.map((step) => scoreLabStep(labPayload, step, answers[toText(step.id, 120)] ?? {}));
  let rawScore = scoredSteps.reduce((sum, step) => sum + (toNumber(step.raw_score) ?? 0), 0);
  let maxScore = scoredSteps.reduce((sum, step) => sum + (toNumber(step.max_score) ?? 0), 0);
  let writingEvaluation: { evaluation_id: string | null; result: JsonRecord | null } = { evaluation_id: null, result: null };
  if (sectionType === "writing") {
    writingEvaluation = await insertWritingLabResponsesAndGrade(sb, supabaseUrl, anonKey, token, bundle, labPayload, answers);
    const band = toNumber(writingEvaluation.result?.overall_band);
    if (band != null) {
      rawScore = band;
      maxScore = 9;
    }
  }

  const nowIso = new Date().toISOString();
  const accuracy = maxScore > 0 ? clamp(rawScore / maxScore, 0, 1) : 0;
  const estimatedBand = sectionType === "writing" && maxScore === 9 ? rawScore : roundTo(4 + accuracy * 5, 1);
  const scoreArtifacts = {
    schema_version: PRACTICE_LAB_ATTEMPT_SCHEMA_VERSION,
    lab_kind: labPayload.lab_kind,
    section_type: sectionType,
    scored_steps: scoredSteps,
    writing_evaluation: writingEvaluation,
  };

  const { data: updatedAttempt, error: updateError } = await sb
    .from("ielts_practice_lab_attempts")
    .update({
      status: "scored",
      answers_json: answers,
      score_artifacts: scoreArtifacts,
      raw_score: roundTo(rawScore, 4),
      max_score: roundTo(maxScore || 1, 4),
      accuracy_ratio: roundTo(accuracy, 4),
      estimated_band: roundTo(clamp(estimatedBand, 0, 9), 1),
      submitted_at: nowIso,
      scored_at: nowIso,
      metadata: {
        ...(isObject(attempt.metadata) ? attempt.metadata : {}),
        submitted_via: "practice_lab",
      },
    })
    .eq("id", toText(attempt.id, 80))
    .select("id,practice_session_id,delivery_build_id,lab_kind,section_type,status,current_step_index,answers_json,score_artifacts,raw_score,max_score,accuracy_ratio,estimated_band,started_at,submitted_at,scored_at,metadata,created_at,updated_at")
    .maybeSingle();
  if (updateError || !updatedAttempt) throw new Error("Failed to score practice lab attempt");

  const buckets = scoredSteps
    .map((step) => ({
      section_type: sectionType,
      question_type: toText(step.question_type, 120).toLowerCase() || "question_unknown",
      accuracy_ratio: clamp(toNumber(step.accuracy_ratio) ?? 0, 0, 1),
      raw_score: toNumber(step.raw_score),
      max_score: toNumber(step.max_score),
      practiced_at: nowIso,
      source: "practice_lab",
    }));
  const masteryUpdates = await updateMasteryBuckets(sb, scope, userId, buckets, {
    practice_session_id: toText(practiceSession.id, 80),
    session_id: toNullableText(practiceSession.session_id, 80),
    delivery_build_id: toNullableText(practiceSession.delivery_build_id, 80),
  });
  const notebookItems = await upsertMistakeNotebookFromLab(sb, scope, userId, toText(updatedAttempt.id, 80), sectionType, scoredSteps, nowIso);

  // Best-effort vocabulary capture for missed gap-style questions.
  let vocabCaptured = 0;
  try {
    vocabCaptured = await captureMissedVocabularyFromLab(
      sb,
      scope,
      userId,
      toText(updatedAttempt.id, 80),
      labPayload,
      scoredSteps,
      nowIso,
    );
  } catch {
    // Vocab capture is purely additive; never fail the lab submit because of it.
  }

  await sb.from("ielts_practice_sessions").update({
    status: "completed",
    latest_ai_evaluation_id: writingEvaluation.evaluation_id,
    completed_at: nowIso,
    review_metadata: {
      lab_scored_at: nowIso,
      lab_attempt_id: toText(updatedAttempt.id, 80),
      accuracy_ratio: roundTo(accuracy, 4),
    },
  }).eq("id", toText(practiceSession.id, 80));

  const planItemId = toNullableText(practiceSession.plan_item_id, 80);
  if (planItemId) {
    await sb.from("ielts_practice_plan_items").update({ status: "completed", completed_at: nowIso }).eq("id", planItemId);
  }

  let diagnosticsSnapshotId: string | null = null;
  let roadmapItems: JsonRecord[] = [];
  try {
    const goals = await getGoals(sb, userId, scope);
    const computed = await computeDiagnostics(sb, scope, userId, goals);
    const snapshot = await persistDiagnostics(sb, userId, scope, computed.payload, computed.sourceSummary);
    diagnosticsSnapshotId = toNullableText(snapshot.id, 80);
    roadmapItems = await refreshRoadmapFromDiagnostics(sb, scope, userId, goals, computed.payload, {
      practice_session_id: toText(practiceSession.id, 80),
    });
  } catch {
    diagnosticsSnapshotId = null;
  }

  return {
    ok: true,
    lab_attempt: updatedAttempt,
    score: {
      raw_score: roundTo(rawScore, 4),
      max_score: roundTo(maxScore || 1, 4),
      accuracy_ratio: roundTo(accuracy, 4),
      estimated_band: roundTo(clamp(estimatedBand, 0, 9), 1),
    },
    scored_steps: scoredSteps,
    mastery_updates: masteryUpdates,
    notebook_items: notebookItems,
    roadmap_items: roadmapItems,
    diagnostics_snapshot_id: diagnosticsSnapshotId,
    vocab_captured: vocabCaptured,
  };
};

// ============================================================
// OpenRouter call helper (shared by coach + hint + model answer + retest)
// ============================================================

const callOpenRouterJsonInline = async (
  systemPrompt: string,
  userPayload: string,
  apiKey: string,
  model: string,
): Promise<unknown> => {
  const baseUrl = (Deno.env.get("OPENROUTER_BASE_URL") ?? "https://openrouter.ai/api/v1").replace(/\/+$/, "");
  const referer = Deno.env.get("OPENROUTER_REFERER") ?? "https://schood.online";
  const appName = Deno.env.get("OPENROUTER_APP_NAME") ?? "Schood IELTS Practice";
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": referer,
      "X-Title": appName,
    },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPayload },
      ],
      temperature: 0.3,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenRouter ${res.status}: ${text.slice(0, 200)}`);
  }
  const payload = await res.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("OpenRouter response missing content");
  try { return JSON.parse(content); } catch { throw new Error("Non-JSON content"); }
};

// ============================================================
// Conversational coach (multi-turn)
// ============================================================

interface CoachMessage {
  role: "user" | "assistant";
  content: string;
}

const coachConversation = async (
  sb: any,
  userId: string,
  practiceSessionId: string,
  labPayload: JsonRecord,
  history: CoachMessage[],
  userQuestion: string,
): Promise<{ ok: true; reply: string; suggested_followups: string[] }> => {
  const attempt = await loadLatestLabAttempt(sb, practiceSessionId, userId);
  const scoreArtifacts = isObject(attempt?.score_artifacts) ? attempt!.score_artifacts as JsonRecord : {};
  const scoredSteps = Array.isArray(scoreArtifacts.scored_steps)
    ? (scoreArtifacts.scored_steps as unknown[]).filter(isObject) as JsonRecord[]
    : [];
  const sectionType = toText(labPayload.section_type, 32).toLowerCase();
  const accuracy = toNumber(attempt?.accuracy_ratio);

  const apiKey = Deno.env.get("OPENROUTER_API_KEY") ?? Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    return {
      ok: true,
      reply: "Coach is unavailable right now. Try opening the matching playbook strategy page for guidance.",
      suggested_followups: [],
    };
  }
  const model = Deno.env.get("OPENROUTER_MODEL") ?? "google/gemma-3-27b-it:free";

  const system = "You are an expert IELTS coach having a focused conversation with a student about a specific practice attempt. Be concise, cite the evidence, name the trap pattern, and stay grounded in IELTS rubrics. Reply in strict JSON: {reply: string, suggested_followups: string[3]}. Keep the reply 2-4 sentences. Suggested followups are short questions the student might ask next.";

  const context = {
    section: sectionType,
    accuracy: accuracy,
    scored_steps: scoredSteps.slice(0, 5).map((s) => ({
      step_id: s.step_id,
      question_type: s.question_type,
      accuracy: s.accuracy_ratio,
      trap_type: s.trap_type,
    })),
    history: history.slice(-8).map((m) => ({ role: m.role, content: m.content.slice(0, 800) })),
    user_question: userQuestion.slice(0, 800),
  };

  let parsed: unknown = null;
  try {
    parsed = await callOpenRouterJsonInline(system, JSON.stringify(context), apiKey, model);
  } catch {
    parsed = null;
  }
  const root = isObject(parsed) ? parsed : {};
  const reply = typeof root.reply === "string" && root.reply.trim().length > 0
    ? root.reply.trim()
    : "Let's break that down — could you clarify which question or which part of the rubric you want to discuss?";
  const followups = Array.isArray(root.suggested_followups)
    ? root.suggested_followups.map((v) => String(v).trim()).filter(Boolean).slice(0, 3)
    : [];
  return { ok: true, reply, suggested_followups: followups };
};

// ============================================================
// Lab in-flight strategy hint
// ============================================================

const labStrategyHint = async (
  labPayload: JsonRecord,
  stepId: string,
): Promise<{ ok: true; hint: string }> => {
  const apiKey = Deno.env.get("OPENROUTER_API_KEY") ?? Deno.env.get("OPENAI_API_KEY");
  const steps = Array.isArray(labPayload.steps) ? (labPayload.steps as unknown[]).filter(isObject) as JsonRecord[] : [];
  const step = steps.find((s) => toText(s.id, 120) === stepId) ?? null;
  if (!step) return { ok: true, hint: "Pick a strategy primer for this question type from the playbook." };

  const questionType = toText(step.question_type, 80).toLowerCase();
  const prompt = truncate(firstTextValue(step, ["prompt", "instruction", "question"]), 400);
  const context = truncate(firstTextValue(step, ["context", "text", "passage", "transcript"]), 1000);

  if (!apiKey) {
    return {
      ok: true,
      hint: `For ${formatQuestionLabel(questionType)}: identify the exact phrase in the source that matches the question, then check for paraphrase or scope traps before answering.`,
    };
  }
  const model = Deno.env.get("OPENROUTER_MODEL") ?? "google/gemma-3-27b-it:free";
  const system = "You are an IELTS coach helping a student who is stuck on a question in the middle of practice. Give a ONE-sentence strategy hint that points to the right approach without revealing the answer. Be specific: name the technique (paraphrase check, scope verification, distractor elimination, evidence locator, signpost detection). Never quote the answer. Reply in strict JSON: {hint: string}.";

  let parsed: unknown = null;
  try {
    parsed = await callOpenRouterJsonInline(
      system,
      JSON.stringify({ question_type: questionType, prompt, context }),
      apiKey,
      model,
    );
  } catch {
    parsed = null;
  }
  const root = isObject(parsed) ? parsed : {};
  const hint = typeof root.hint === "string" && root.hint.trim().length > 0
    ? root.hint.trim()
    : `For ${formatQuestionLabel(questionType)}: find the explicit evidence first, then confirm wording matches before answering.`;
  return { ok: true, hint };
};

// ============================================================
// Model answer comparator (writing)
// ============================================================

interface ModelAnswerTask {
  task_id: string;
  task_type: string | null;
  prompt: string;
  student_text: string;
  student_band: number | null;
  model_text: string;
  model_band: number;
  notes: string[];
}

const generateModelAnswers = async (
  sb: any,
  userId: string,
  sessionId: string,
): Promise<{ ok: true; tasks: ModelAnswerTask[] }> => {
  const { data: session } = await sb
    .from("sessions")
    .select("id, user_id")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session || (session as JsonRecord).user_id !== userId) throw new Error("Session not found");

  const { data: responses } = await sb
    .from("responses")
    .select("content_unit_id, data, metadata")
    .eq("session_id", sessionId)
    .limit(20);
  const { data: contentUnitsRes } = await sb
    .from("content_units")
    .select("id, data, metadata")
    .in("id", ((responses ?? []) as JsonRecord[]).map((r) => String(r.content_unit_id ?? '')))
    .limit(20);
  const cuById = new Map<string, JsonRecord>();
  for (const cu of (contentUnitsRes ?? []) as JsonRecord[]) {
    cuById.set(String(cu.id ?? ''), cu);
  }

  const apiKey = Deno.env.get("OPENROUTER_API_KEY") ?? Deno.env.get("OPENAI_API_KEY");
  const model = Deno.env.get("OPENROUTER_MODEL") ?? "google/gemma-3-27b-it:free";

  const tasks: ModelAnswerTask[] = [];
  for (const row of (responses ?? []) as JsonRecord[]) {
    const data = isObject(row.data) ? row.data : {};
    const studentText = firstTextValue(data, ["text", "answer", "rewrite", "full_rewrite", "value"]).slice(0, 3000);
    if (!studentText || studentText.length < 30) continue;
    const cu = cuById.get(String(row.content_unit_id ?? ''));
    const cuData = isObject(cu?.data) ? cu!.data as JsonRecord : {};
    const promptText = firstTextValue(cuData, ["prompt", "text", "question"]).slice(0, 1200);
    const taskType = toNullableText((isObject(row.metadata) ? row.metadata.task_type : null) ?? cuData.task_type ?? null, 32);

    let modelText = "";
    let modelBand = 8;
    let notes: string[] = [];
    if (apiKey) {
      const system = "You are an IELTS examiner writing a model band-8 response to a writing prompt. The response should be naturally written by a competent test-taker (not flawless). Match expected length conventions: 150-180 words for Task 1, 250-280 for Task 2. After the response, provide 3 short notes describing what makes it band 8. Reply in strict JSON: {response_text: string, band: number, notes: string[3]}.";
      try {
        const parsed = await callOpenRouterJsonInline(
          system,
          JSON.stringify({ task_type: taskType ?? "task2", prompt: promptText }),
          apiKey,
          model,
        );
        const root = isObject(parsed) ? parsed : {};
        modelText = typeof root.response_text === "string" ? root.response_text.trim() : "";
        modelBand = toNumber(root.band) ?? 8;
        notes = Array.isArray(root.notes) ? (root.notes as unknown[]).map((v) => String(v).trim()).filter(Boolean).slice(0, 4) : [];
      } catch {
        modelText = "";
      }
    }
    if (!modelText) {
      modelText = "Model answer generation is unavailable right now. Open the playbook's writing master guide for band-8 exemplars and rubric anchors.";
      notes = ["Try again later when the AI service is reachable."];
    }

    tasks.push({
      task_id: String(row.content_unit_id ?? ''),
      task_type: taskType,
      prompt: promptText,
      student_text: studentText,
      student_band: null,
      model_text: modelText,
      model_band: Math.max(0, Math.min(9, modelBand)),
      notes,
    });
  }

  return { ok: true, tasks };
};

// ============================================================
// Mistake notebook re-test
// ============================================================

interface RetestPayload {
  ok: true;
  notebook_id: string;
  trap_type: string;
  question_type: string;
  section_type: string;
  question_text: string;
  options: string[];
  correct_index: number;
  explanation: string;
}

const generateNotebookRetest = async (
  sb: any,
  userId: string,
  notebookId: string,
): Promise<RetestPayload> => {
  const { data: row } = await sb
    .from("ielts_practice_mistake_notebook")
    .select("id, user_id, trap_type, question_type, section_type")
    .eq("id", notebookId)
    .maybeSingle();
  if (!row || (row as JsonRecord).user_id !== userId) throw new Error("Notebook item not found");
  const trapType = String((row as JsonRecord).trap_type ?? 'unknown').toLowerCase();
  const questionType = String((row as JsonRecord).question_type ?? '').toLowerCase();
  const sectionType = String((row as JsonRecord).section_type ?? 'reading').toLowerCase();

  const apiKey = Deno.env.get("OPENROUTER_API_KEY") ?? Deno.env.get("OPENAI_API_KEY");
  let questionText = "";
  let options: string[] = [];
  let correctIndex = 0;
  let explanation = "";

  if (apiKey) {
    const model = Deno.env.get("OPENROUTER_MODEL") ?? "google/gemma-3-27b-it:free";
    const system = "You are an IELTS examiner generating a SINGLE quick-recall question that specifically tests recognition of a named trap pattern. The question must include a short context (50-100 words) and four answer options where exactly one is correct and the others embody the trap pattern. Reply in strict JSON: {question_text: string, options: string[4], correct_index: number, explanation: string}.";
    try {
      const parsed = await callOpenRouterJsonInline(
        system,
        JSON.stringify({ trap_type: trapType, question_type: questionType, section_type: sectionType }),
        apiKey,
        model,
      );
      const root = isObject(parsed) ? parsed : {};
      questionText = String(root.question_text ?? '').trim();
      options = Array.isArray(root.options) ? (root.options as unknown[]).map((v) => String(v).trim()).filter(Boolean) : [];
      correctIndex = Math.max(0, Math.min(options.length - 1, toNumber(root.correct_index) ?? 0));
      explanation = String(root.explanation ?? '').trim();
    } catch {
      questionText = "";
    }
  }

  if (!questionText || options.length < 2) {
    questionText = `Quick test on ${trapType.replace(/_/g, ' ')} (${formatQuestionLabel(questionType)}): re-attempt a real practice lab to drill this pattern.`;
    options = ["Open practice lab", "Open playbook strategy"];
    correctIndex = 0;
    explanation = "Live retest is unavailable right now — open a focused lab on this type from your plan.";
  }

  return {
    ok: true,
    notebook_id: notebookId,
    trap_type: trapType,
    question_type: questionType,
    section_type: sectionType,
    question_text: questionText,
    options,
    correct_index: correctIndex,
    explanation,
  };
};

// ============================================================
// Annotated writing retro
// ============================================================
// Loads the user's writing responses for a given session, calls
// OpenRouter for inline rubric-anchored annotations, returns
// {annotations: [{task_id, phrase, criterion, severity, comment}]}.
// Frontend overlays these on the original response text.

interface WritingAnnotation {
  task_id: string;
  phrase: string;
  criterion: string;
  severity: "low" | "medium" | "high";
  comment: string;
}

interface AnnotateWritingResponse {
  ok: true;
  tasks: Array<{
    task_id: string;
    task_type: string | null;
    answer_text: string;
    annotations: WritingAnnotation[];
  }>;
  generated_at: string;
}

const ANNOTATE_WRITING_SYSTEM = "You are an expert IELTS Writing examiner. For each task, return JSON with an 'annotations' array. Each annotation must reference an EXACT short phrase (3-12 words) copied verbatim from the student's response. Each annotation also has: criterion (one of: TR, CC, LR, GRA), severity (low|medium|high), and a one-sentence comment grounded in the IELTS rubric. Aim for 3-6 annotations per task — the most pivotal ones. Reply in strict JSON: {tasks: [{task_id, annotations: [...]}]}.";

const annotateWritingForSession = async (
  sb: any,
  userId: string,
  sessionId: string,
): Promise<AnnotateWritingResponse> => {
  // Confirm the session belongs to this user
  const { data: session } = await sb
    .from("sessions")
    .select("id, user_id")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session || (session as JsonRecord).user_id !== userId) {
    throw new Error("Session not found");
  }

  const { data: responses } = await sb
    .from("responses")
    .select("content_unit_id, data, metadata")
    .eq("session_id", sessionId)
    .limit(20);

  const tasks: Array<{ task_id: string; task_type: string | null; answer_text: string }> = [];
  for (const row of (responses ?? []) as JsonRecord[]) {
    const data = isObject(row.data) ? row.data : {};
    const text = firstTextValue(data, ["text", "answer", "rewrite", "full_rewrite", "value"]);
    if (!text || text.length < 50) continue;
    tasks.push({
      task_id: String(row.content_unit_id ?? ""),
      task_type: toNullableText((isObject(row.metadata) ? row.metadata.task_type : null), 32),
      answer_text: text.slice(0, 3000),
    });
  }
  if (tasks.length === 0) {
    return { ok: true, tasks: [], generated_at: new Date().toISOString() };
  }

  const apiKey = Deno.env.get("OPENROUTER_API_KEY") ?? Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    return {
      ok: true,
      tasks: tasks.map((t) => ({ ...t, annotations: [] })),
      generated_at: new Date().toISOString(),
    };
  }
  const model = Deno.env.get("OPENROUTER_MODEL") ?? "google/gemma-3-27b-it:free";
  const baseUrl = (Deno.env.get("OPENROUTER_BASE_URL") ?? "https://openrouter.ai/api/v1").replace(/\/+$/, "");

  const userPayload = JSON.stringify({
    instruction: "Annotate each task's response. Quote exact phrases.",
    tasks: tasks.map((t) => ({
      task_id: t.task_id,
      task_type: t.task_type,
      response: t.answer_text,
    })),
  });

  let parsed: unknown = null;
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": Deno.env.get("OPENROUTER_REFERER") ?? "https://schood.online",
        "X-Title": Deno.env.get("OPENROUTER_APP_NAME") ?? "Schood IELTS Practice",
      },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: ANNOTATE_WRITING_SYSTEM },
          { role: "user", content: userPayload },
        ],
        temperature: 0.3,
      }),
    });
    if (res.ok) {
      const payload = await res.json();
      const content = payload?.choices?.[0]?.message?.content;
      if (typeof content === "string") {
        try { parsed = JSON.parse(content); } catch { parsed = null; }
      }
    }
  } catch {
    parsed = null;
  }

  const root = isObject(parsed) ? parsed : {};
  const rawTasks = Array.isArray(root.tasks) ? root.tasks : [];
  const annotationsByTask = new Map<string, WritingAnnotation[]>();
  for (const raw of rawTasks) {
    if (!isObject(raw)) continue;
    const taskId = String(raw.task_id ?? "");
    if (!taskId) continue;
    const list: WritingAnnotation[] = [];
    const annArr = Array.isArray(raw.annotations) ? raw.annotations : [];
    for (const ann of annArr) {
      if (!isObject(ann)) continue;
      const phrase = String(ann.phrase ?? "").trim();
      const criterion = String(ann.criterion ?? "").trim().toUpperCase();
      const severity = String(ann.severity ?? "medium").toLowerCase();
      const comment = String(ann.comment ?? "").trim();
      if (!phrase || !comment) continue;
      list.push({
        task_id: taskId,
        phrase,
        criterion: ["TR", "CC", "LR", "GRA", "TA"].includes(criterion) ? criterion : "TR",
        severity: (["low", "medium", "high"].includes(severity) ? severity : "medium") as "low" | "medium" | "high",
        comment,
      });
    }
    annotationsByTask.set(taskId, list);
  }

  return {
    ok: true,
    tasks: tasks.map((t) => ({ ...t, annotations: annotationsByTask.get(t.task_id) ?? [] })),
    generated_at: new Date().toISOString(),
  };
};

// ============================================================
// Insights endpoints: trajectory, activity, mastery, narrative
// ============================================================
// Each is keyed off existing tables; no new schema. The frontend
// renders these in dedicated dashboard widgets.

const isoDate = (d: Date): string => d.toISOString().slice(0, 10);

const SECTION_KEYS: ReadonlyArray<"reading" | "listening" | "writing" | "speaking"> = [
  "reading",
  "listening",
  "writing",
  "speaking",
];

interface TrajectoryPoint {
  date: string;
  source: "mock" | "lab";
  overall_band: number | null;
  reading: number | null;
  listening: number | null;
  writing: number | null;
  speaking: number | null;
}

interface BandPredictorEntry {
  band: number | null;
  sample_count: number;
  confidence: "low" | "medium" | "high";
}

const confidenceForCount = (n: number): "low" | "medium" | "high" => {
  if (n >= 30) return "high";
  if (n >= 10) return "medium";
  return "low";
};

const buildPracticeTrajectory = async (
  sb: any,
  scope: ResolvedScope,
  userId: string,
): Promise<{
  series: TrajectoryPoint[];
  predictor: Record<string, BandPredictorEntry>;
  range: { from: string; to: string };
}> => {
  const now = new Date();
  const from = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const fromIso = from.toISOString();

  // Pull mock outcomes from the simulator (any IELTS product, scope by user)
  const [outcomesRes, labRes] = await Promise.all([
    sb
      .from("exam_outcomes")
      .select("computed_at, overall_band, section_scores, product_id")
      .eq("user_id", userId)
      .gte("computed_at", fromIso)
      .order("computed_at", { ascending: true })
      .limit(200),
    sb
      .from("ielts_practice_lab_attempts")
      .select("scored_at, section_type, estimated_band, accuracy_ratio, status")
      .eq("user_id", userId)
      .eq("product_id", scope.practiceProductId)
      .eq("status", "scored")
      .gte("scored_at", fromIso)
      .not("estimated_band", "is", null)
      .order("scored_at", { ascending: true })
      .limit(200),
  ]);

  const series: TrajectoryPoint[] = [];
  const totals = {
    reading: { sum: 0, count: 0 },
    listening: { sum: 0, count: 0 },
    writing: { sum: 0, count: 0 },
    speaking: { sum: 0, count: 0 },
    overall: { sum: 0, count: 0 },
  };

  for (const row of (outcomesRes.data ?? []) as JsonRecord[]) {
    const computedAt = String(row.computed_at ?? "");
    if (!computedAt) continue;
    const sections = isObject(row.section_scores) ? row.section_scores : {};
    const point: TrajectoryPoint = {
      date: computedAt.slice(0, 10),
      source: "mock",
      overall_band: toNumber(row.overall_band),
      reading: null,
      listening: null,
      writing: null,
      speaking: null,
    };
    for (const entry of Object.values(sections)) {
      if (!isObject(entry)) continue;
      const type = String(entry.type ?? "").toLowerCase();
      const band = toNumber(entry.band);
      if (band == null) continue;
      if (type === "reading" || type === "listening" || type === "writing" || type === "speaking") {
        point[type] = band;
        totals[type].sum += band;
        totals[type].count += 1;
      }
    }
    if (point.overall_band != null) {
      totals.overall.sum += point.overall_band;
      totals.overall.count += 1;
    }
    series.push(point);
  }

  for (const row of (labRes.data ?? []) as JsonRecord[]) {
    const scoredAt = String(row.scored_at ?? "");
    const band = toNumber(row.estimated_band);
    const sectionType = String(row.section_type ?? "").toLowerCase();
    if (!scoredAt || band == null) continue;
    if (sectionType !== "reading" && sectionType !== "listening" && sectionType !== "writing") continue;
    const point: TrajectoryPoint = {
      date: scoredAt.slice(0, 10),
      source: "lab",
      overall_band: null,
      reading: null,
      listening: null,
      writing: null,
      speaking: null,
    };
    point[sectionType] = band;
    totals[sectionType].sum += band;
    totals[sectionType].count += 1;
    series.push(point);
  }

  series.sort((a, b) => a.date.localeCompare(b.date));

  // Predictor: weight more recent half of samples twice as much
  const predictor: Record<string, BandPredictorEntry> = {};
  for (const key of SECTION_KEYS) {
    const points = series
      .map((p) => p[key])
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    if (points.length === 0) {
      predictor[key] = { band: null, sample_count: 0, confidence: "low" };
      continue;
    }
    const half = Math.max(1, Math.floor(points.length / 2));
    const older = points.slice(0, points.length - half);
    const newer = points.slice(points.length - half);
    const olderAvg = older.length > 0 ? older.reduce((a, b) => a + b, 0) / older.length : 0;
    const newerAvg = newer.reduce((a, b) => a + b, 0) / newer.length;
    const blended = older.length > 0 ? (olderAvg + newerAvg * 2) / 3 : newerAvg;
    predictor[key] = {
      band: Math.round(blended * 10) / 10,
      sample_count: points.length,
      confidence: confidenceForCount(points.length),
    };
  }
  const overallPoints = series
    .map((p) => p.overall_band)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  predictor.overall = overallPoints.length > 0
    ? {
        band: Math.round((overallPoints.reduce((a, b) => a + b, 0) / overallPoints.length) * 10) / 10,
        sample_count: overallPoints.length,
        confidence: confidenceForCount(overallPoints.length),
      }
    : { band: null, sample_count: 0, confidence: "low" };

  return {
    series,
    predictor,
    range: { from: isoDate(from), to: isoDate(now) },
  };
};

interface ActivityDay {
  date: string;
  attempts: number;
  sections: string[];
  minutes_estimate: number;
}

const buildPracticeActivity = async (
  sb: any,
  scope: ResolvedScope,
  userId: string,
): Promise<{
  days: ActivityDay[];
  streak: { current_days: number; longest_days: number; last_practice_date: string | null };
  totals: { last_7_days: number; last_30_days: number; all_time: number };
}> => {
  const now = new Date();
  const from = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
  const fromIso = from.toISOString();

  const [labRes, attemptRes] = await Promise.all([
    sb
      .from("ielts_practice_lab_attempts")
      .select("submitted_at, section_type")
      .eq("user_id", userId)
      .eq("product_id", scope.practiceProductId)
      .gte("submitted_at", fromIso)
      .order("submitted_at", { ascending: true })
      .limit(600),
    sb
      .from("ielts_practice_attempts")
      .select("submitted_at, section_type")
      .eq("user_id", userId)
      .eq("language_id", scope.languageId)
      .gte("submitted_at", fromIso)
      .order("submitted_at", { ascending: true })
      .limit(600),
  ]);

  const byDay = new Map<string, { attempts: number; sections: Set<string> }>();
  const addEvent = (iso: string, section: string) => {
    if (!iso) return;
    const date = iso.slice(0, 10);
    const entry = byDay.get(date) ?? { attempts: 0, sections: new Set<string>() };
    entry.attempts += 1;
    if (section) entry.sections.add(section);
    byDay.set(date, entry);
  };
  for (const row of (labRes.data ?? []) as JsonRecord[]) {
    addEvent(String(row.submitted_at ?? ""), String(row.section_type ?? "").toLowerCase());
  }
  for (const row of (attemptRes.data ?? []) as JsonRecord[]) {
    addEvent(String(row.submitted_at ?? ""), String(row.section_type ?? "").toLowerCase());
  }

  const days: ActivityDay[] = [];
  for (const [date, entry] of byDay.entries()) {
    days.push({
      date,
      attempts: entry.attempts,
      sections: Array.from(entry.sections),
      minutes_estimate: entry.attempts * 12, // rough estimate: 12 min per attempt
    });
  }
  days.sort((a, b) => a.date.localeCompare(b.date));

  // Streak computation: walk backward from today
  const todayIso = isoDate(now);
  const activeSet = new Set(days.map((d) => d.date));
  let current = 0;
  for (let i = 0; i < 365; i++) {
    const day = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const iso = isoDate(day);
    if (activeSet.has(iso)) {
      current += 1;
    } else if (iso !== todayIso) {
      break;
    }
  }

  // Longest streak: scan sorted days for max consecutive sequence
  let longest = 0;
  let runStart: string | null = null;
  let runLength = 0;
  for (let i = 0; i < days.length; i++) {
    if (i === 0) {
      runStart = days[i].date;
      runLength = 1;
    } else {
      const prev = new Date(days[i - 1].date).getTime();
      const curr = new Date(days[i].date).getTime();
      const diffDays = Math.round((curr - prev) / (24 * 60 * 60 * 1000));
      if (diffDays === 1) {
        runLength += 1;
      } else {
        if (runLength > longest) longest = runLength;
        runStart = days[i].date;
        runLength = 1;
      }
    }
  }
  if (runLength > longest) longest = runLength;

  const last7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const last30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const last7Iso = isoDate(last7);
  const last30Iso = isoDate(last30);

  return {
    days,
    streak: {
      current_days: current,
      longest_days: longest,
      last_practice_date: days.length > 0 ? days[days.length - 1].date : null,
    },
    totals: {
      last_7_days: days.filter((d) => d.date >= last7Iso).reduce((s, d) => s + d.attempts, 0),
      last_30_days: days.filter((d) => d.date >= last30Iso).reduce((s, d) => s + d.attempts, 0),
      all_time: days.reduce((s, d) => s + d.attempts, 0),
    },
  };
};

interface MasteryRow {
  question_type: string;
  section_type: string;
  mastery_level: number;
  mastery_status: string;
  last_accuracy: number | null;
  rolling_accuracy: number | null;
  attempts: number;
  last_practiced_at: string | null;
}

interface TrapPatternRow {
  trap_type: string;
  count: number;
  example_question_type: string | null;
}

const buildPracticeMasteryOverview = async (
  sb: any,
  scope: ResolvedScope,
  userId: string,
): Promise<{
  by_status: Record<string, MasteryRow[]>;
  recent_graduations: MasteryRow[];
  trap_patterns: TrapPatternRow[];
  totals: { tracked: number; mastered: number; weak: number };
}> => {
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  const [masteryRes, mistakeRes] = await Promise.all([
    sb
      .from("ielts_practice_mastery")
      .select("section_type,question_type,mastery_level,mastery_status,last_accuracy_ratio,rolling_accuracy_ratio,attempts,last_practiced_at,updated_at")
      .eq("user_id", userId)
      .eq("language_id", scope.languageId)
      .order("mastery_level", { ascending: false })
      .limit(200),
    sb
      .from("ielts_practice_mistake_notebook")
      .select("trap_type,question_type,review_count,status")
      .eq("user_id", userId)
      .eq("language_id", scope.languageId)
      .eq("status", "active")
      .limit(200),
  ]);

  const byStatus: Record<string, MasteryRow[]> = { new: [], weak: [], building: [], stable: [], mastered: [] };
  const recentGraduations: MasteryRow[] = [];
  for (const row of (masteryRes.data ?? []) as JsonRecord[]) {
    const entry: MasteryRow = {
      question_type: String(row.question_type ?? ""),
      section_type: String(row.section_type ?? ""),
      mastery_level: toNumber(row.mastery_level) ?? 0,
      mastery_status: String(row.mastery_status ?? "new"),
      last_accuracy: toNumber(row.last_accuracy_ratio),
      rolling_accuracy: toNumber(row.rolling_accuracy_ratio),
      attempts: Number(row.attempts ?? 0),
      last_practiced_at: String(row.last_practiced_at ?? "") || null,
    };
    const status = entry.mastery_status in byStatus ? entry.mastery_status : "new";
    byStatus[status].push(entry);
    if (status === "mastered" && String(row.updated_at ?? "") >= fourteenDaysAgo) {
      recentGraduations.push(entry);
    }
  }

  const trapCounter = new Map<string, { count: number; example: string | null }>();
  for (const row of (mistakeRes.data ?? []) as JsonRecord[]) {
    const trap = String(row.trap_type ?? "unknown").toLowerCase();
    if (!trap || trap === "none") continue;
    const entry = trapCounter.get(trap) ?? { count: 0, example: null };
    entry.count += Math.max(1, Number(row.review_count ?? 1));
    if (!entry.example) entry.example = String(row.question_type ?? "") || null;
    trapCounter.set(trap, entry);
  }
  const trapPatterns: TrapPatternRow[] = Array.from(trapCounter.entries())
    .map(([trap_type, v]) => ({ trap_type, count: v.count, example_question_type: v.example }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  return {
    by_status: byStatus,
    recent_graduations: recentGraduations,
    trap_patterns: trapPatterns,
    totals: {
      tracked: (masteryRes.data ?? []).length,
      mastered: byStatus.mastered.length,
      weak: byStatus.weak.length,
    },
  };
};

const buildPlanNarrative = async (
  sb: any,
  scope: ResolvedScope,
  userId: string,
): Promise<{
  start_date: string;
  target_date: string | null;
  day_n: number;
  total_days: number | null;
  target_band: number;
  weeks_remaining: number | null;
  pace_label: "ahead" | "on_track" | "behind" | "unknown";
}> => {
  // Avoid scope unused warning when goals lookup runs in the same session
  void scope;

  const goals = await getGoals(sb, userId, scope);
  const startDate = goals.practice_start_date || new Date().toISOString().slice(0, 10);
  const startTs = new Date(`${startDate}T00:00:00Z`).getTime();
  const nowTs = Date.now();
  const dayN = Math.max(1, Math.floor((nowTs - startTs) / (24 * 60 * 60 * 1000)) + 1);
  const totalDays = goals.target_date
    ? Math.max(1, Math.ceil((new Date(`${goals.target_date}T00:00:00Z`).getTime() - startTs) / (24 * 60 * 60 * 1000)))
    : null;
  const weeksRemaining = goals.target_date
    ? Math.max(0, Math.ceil((new Date(`${goals.target_date}T00:00:00Z`).getTime() - nowTs) / (7 * 24 * 60 * 60 * 1000)))
    : null;

  // Pace: single targeted query for recent overall band rather than the full
  // trajectory pipeline. Cheaper and avoids duplicating work in the dashboard load.
  let paceLabel: "ahead" | "on_track" | "behind" | "unknown" = "unknown";
  if (totalDays != null) {
    try {
      const since = new Date(nowTs - 60 * 24 * 60 * 60 * 1000).toISOString();
      const { data: rows } = await sb
        .from("exam_outcomes")
        .select("overall_band")
        .eq("user_id", userId)
        .gte("computed_at", since)
        .not("overall_band", "is", null)
        .order("computed_at", { ascending: false })
        .limit(12);
      const bands = ((rows ?? []) as JsonRecord[])
        .map((r) => toNumber(r.overall_band))
        .filter((v): v is number => v != null);
      if (bands.length > 0) {
        const currentBand = bands.reduce((a, b) => a + b, 0) / bands.length;
        const ratio = dayN / totalDays;
        const baseline = 5.5;
        const expected = baseline + (goals.target_overall_band - baseline) * ratio;
        if (currentBand >= expected + 0.25) paceLabel = "ahead";
        else if (currentBand >= expected - 0.25) paceLabel = "on_track";
        else paceLabel = "behind";
      }
    } catch {
      paceLabel = "unknown";
    }
  }

  return {
    start_date: startDate,
    target_date: goals.target_date,
    day_n: dayN,
    total_days: totalDays,
    target_band: goals.target_overall_band,
    weeks_remaining: weeksRemaining,
    pace_label: paceLabel,
  };
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = getEnv("SUPABASE_URL");
    const supabaseAnonKey = getEnv("SUPABASE_ANON_KEY");
    const supabaseServiceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

    const authSb = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
    });
    const sb = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    const auth = await authUser(authSb, req);
    if (!auth) return json(401, { error: "Unauthorized" });

    const scope = await resolveScope(sb);
    const url = new URL(req.url);
    const route = extractRoute(url);

    const hasPracticeAccess = await userHasPracticeAccess(sb, auth.userId, scope);
    if (!hasPracticeAccess) {
      return json(403, {
        error: "IELTS Practice access is required",
        code: "product_access_required",
        product_id: scope.practiceProductId,
        product_slug: PRACTICE_PRODUCT_SLUG,
      });
    }

    if (req.method === "GET" && route === "/goals") {
      const goals = await getGoals(sb, auth.userId, scope);
      return json(200, {
        scope: {
          user_id: auth.userId,
          language_id: scope.languageId,
          language_code: scope.languageCode,
          product_id: scope.practiceProductId,
          product_slug: PRACTICE_PRODUCT_SLUG,
        },
        goals,
      });
    }

    if (req.method === "PATCH" && route === "/goals") {
      const body = await parseBody(req);
      const goals = await patchGoals(sb, auth.userId, scope, body);
      return json(200, { ok: true, goals });
    }

    if (req.method === "GET" && route === "/dashboard") {
      const goals = await getGoals(sb, auth.userId, scope);
      const timezone = safeTimezone(url.searchParams.get("timezone") ?? goals.timezone);
      const planDate = parsePlanDate(url.searchParams.get("date"), timezone);

      const [diagnosticsSnapshot, planRowsRes, notebookItems, roadmapItems] = await Promise.all([
        loadCurrentDiagnostics(sb, auth.userId, scope),
        sb
          .from("ielts_practice_plan_items")
          .select("id,exercise_id,blueprint_id,delivery_build_id,practice_session_id,created_at")
          .eq("user_id", auth.userId)
          .eq("language_id", scope.languageId)
          .eq("plan_date", planDate)
          .order("priority", { ascending: false })
          .order("created_at", { ascending: true }),
        loadNotebookItems(sb, scope, auth.userId, 4),
        loadRoadmapItems(sb, scope, auth.userId, 5),
      ]);
      if (planRowsRes.error) throw new Error("Failed to load dashboard plan");

      const planItems = await enrichPlanRows(
        sb,
        (Array.isArray(planRowsRes.data) ? planRowsRes.data : []) as Array<{ id: string; exercise_id?: string | null; blueprint_id?: string | null; delivery_build_id?: string | null; practice_session_id?: string | null }>,
      );

      // Reactive replanning signal: when diagnostics were recomputed AFTER the
      // most recent plan item was generated, today's plan is stale relative
      // to the user's latest results. The frontend offers a regenerate CTA.
      const diagComputedAt = toNullableText(diagnosticsSnapshot?.computed_at ?? null, 80);
      const oldestPlanCreatedAt = (planRowsRes.data ?? [])
        .map((row: any) => String(row.created_at ?? ''))
        .filter(Boolean)
        .sort()[0] ?? null;
      const planStale = Boolean(
        diagComputedAt && oldestPlanCreatedAt && diagComputedAt > oldestPlanCreatedAt,
      );

      return json(200, {
        scope: {
          user_id: auth.userId,
          language_id: scope.languageId,
          language_code: scope.languageCode,
          product_id: scope.practiceProductId,
          product_slug: PRACTICE_PRODUCT_SLUG,
        },
        goals,
        diagnostics_snapshot: diagnosticsSnapshot,
        plan_date: planDate,
        items: planItems,
        notebook: notebookItems,
        roadmap: roadmapItems,
        plan_stale: planStale,
      });
    }

    if (req.method === "GET" && route === "/insights/trajectory") {
      const data = await buildPracticeTrajectory(sb, scope, auth.userId);
      return jsonCached(200, { ok: true, ...data });
    }

    if (req.method === "GET" && route === "/insights/activity") {
      const data = await buildPracticeActivity(sb, scope, auth.userId);
      return jsonCached(200, { ok: true, ...data });
    }

    if (req.method === "GET" && route === "/insights/mastery-overview") {
      const data = await buildPracticeMasteryOverview(sb, scope, auth.userId);
      return jsonCached(200, { ok: true, ...data });
    }

    if (req.method === "GET" && route === "/insights/plan-narrative") {
      const data = await buildPlanNarrative(sb, scope, auth.userId);
      return jsonCached(200, { ok: true, ...data });
    }

    if (req.method === "GET" && route === "/diagnostics") {
      const refresh = String(url.searchParams.get("refresh") ?? "").toLowerCase() === "true";
      const goals = await getGoals(sb, auth.userId, scope);

      if (!refresh) {
        const current = await loadCurrentDiagnostics(sb, auth.userId, scope);
        if (current && String(current.snapshot_version ?? "") === DIAGNOSTIC_SCHEMA_VERSION) {
          return json(200, {
            scope: {
              user_id: auth.userId,
              language_id: scope.languageId,
              language_code: scope.languageCode,
              product_id: scope.practiceProductId,
            },
            goals,
            diagnostics_snapshot: current,
            refreshed: false,
          });
        }
      }

      const { payload, sourceSummary } = await computeDiagnostics(sb, scope, auth.userId, goals);
      const snapshot = await persistDiagnostics(sb, auth.userId, scope, payload, sourceSummary);
      return json(200, {
        scope: {
          user_id: auth.userId,
          language_id: scope.languageId,
          language_code: scope.languageCode,
          product_id: scope.practiceProductId,
        },
        goals,
        diagnostics_snapshot: snapshot,
        refreshed: true,
      });
    }

    if (req.method === "POST" && route === "/plans/generate") {
      const body = await parseBody(req);
      const refreshDiagnostics = String(body.refresh_diagnostics ?? "").toLowerCase() === "true";

      const goals = await getGoals(sb, auth.userId, scope);
      const timezone = safeTimezone(body.timezone ?? goals.timezone ?? "UTC");
      const planDate = parsePlanDate(body.plan_date, timezone);
      const dailyMinutesProvided = body.daily_minutes != null;
      const dailyPracticeMinutes = normalizeDailyPracticeMinutes(body.daily_minutes, goals.daily_practice_minutes ?? 60);
      const dailyCount = dailyCountFromPracticeMinutes(dailyPracticeMinutes, body.daily_count, dailyMinutesProvided || body.daily_count == null);
      let diagnosticsSnapshot = !refreshDiagnostics ? await loadCurrentDiagnostics(sb, auth.userId, scope) : null;
      if (!diagnosticsSnapshot) {
        const computed = await computeDiagnostics(sb, scope, auth.userId, goals);
        diagnosticsSnapshot = await persistDiagnostics(sb, auth.userId, scope, computed.payload, computed.sourceSummary);
      }

      const diagnostics = isObject(diagnosticsSnapshot?.diagnostics)
        ? (diagnosticsSnapshot?.diagnostics as DiagnosticPayload)
        : null;
      if (!diagnostics) return json(422, { error: "Diagnostics data is unavailable" });

      const rules = await getActiveRules(sb, scope);
      const publishedBlueprints = await loadPublishedBlueprintCandidates(sb, scope);

      const coverageRule = rules.get("coverage_balance");
      const targetMixRaw = isObject(coverageRule?.config?.target_mix)
        ? (coverageRule?.config?.target_mix as JsonRecord)
        : { reading: 0.34, listening: 0.33, writing: 0.33 };
      const mix = {
        reading: Math.max(0, toNumber(targetMixRaw.reading) ?? 0.34),
        listening: Math.max(0, toNumber(targetMixRaw.listening) ?? 0.33),
        writing: Math.max(0, toNumber(targetMixRaw.writing) ?? 0.33),
      };
      const mixTotal = mix.reading + mix.listening + mix.writing;
      const normalizedMix = mixTotal > 0
        ? { reading: mix.reading / mixTotal, listening: mix.listening / mixTotal, writing: mix.writing / mixTotal }
        : { reading: 0.34, listening: 0.33, writing: 0.33 };

      const { data: retainedRowsData, error: retainedRowsError } = await sb
        .from("ielts_practice_plan_items")
        .select("id,exercise_id,blueprint_id,delivery_build_id,practice_session_id,section_type,status,metadata")
        .eq("user_id", auth.userId)
        .eq("language_id", scope.languageId)
        .eq("plan_date", planDate)
        .in("status", [...PLAN_REGENERATION_PRESERVED_STATUSES]);
      if (retainedRowsError) throw new Error("Failed to load active plan items");

      const retainedRows = (Array.isArray(retainedRowsData) ? retainedRowsData : []) as Array<{
        id: string;
        exercise_id?: string | null;
        blueprint_id?: string | null;
        delivery_build_id?: string | null;
        practice_session_id?: string | null;
      }>;
      const retainedBuildIds = new Set(
        retainedRows.map((row) => toText(row.delivery_build_id, 80)).filter(Boolean),
      );
      const generationCount = Math.max(0, dailyCount - retainedRows.length);
      const quotas = createSectionQuota(generationCount, normalizedMix);

      const { error: cleanupError } = await sb
        .from("ielts_practice_plan_items")
        .delete()
        .eq("user_id", auth.userId)
        .eq("language_id", scope.languageId)
        .eq("plan_date", planDate)
        .in("status", [...PLAN_REGENERATION_REPLACEABLE_STATUSES]);
      if (cleanupError) throw new Error("Failed to replace generated plan items");

      if (generationCount <= 0 && retainedRows.length > 0) {
        const planItems = await enrichPlanRows(sb, retainedRows);
        return json(200, {
          ok: true,
          runtime: "transformed_sessions",
          plan_date: planDate,
          generated_count: 0,
          retained_count: retainedRows.length,
          daily_practice_minutes: dailyPracticeMinutes,
          quotas,
          diagnostics_snapshot_id: diagnosticsSnapshot.id,
          items: planItems,
        });
      }

      if (publishedBlueprints.length > 0) {
        const sourceAvoidance = await loadSourceAvoidance(sb, scope, auth.userId, goals);
        await refreshRoadmapFromDiagnostics(sb, scope, auth.userId, goals, diagnostics).catch(() => []);
        const trainingContext = await loadPracticeTrainingContext(sb, scope, auth.userId).catch(() => ({
          notebookBoostByQuestionKey: new Map<string, number>(),
          roadmapBoostByQuestionKey: new Map<string, number>(),
          roadmapBoostBySection: new Map<string, number>(),
        }));
        const { data: recentPracticeSessionsData } = await sb
          .from("ielts_practice_sessions")
          .select("delivery_build_id,created_at")
          .eq("user_id", auth.userId)
          .eq("language_id", scope.languageId)
          .order("created_at", { ascending: false })
          .limit(300);

        const recentSessionMap = new Map<string, { attempts: number; latestAt: string | null }>();
        for (const row of Array.isArray(recentPracticeSessionsData) ? recentPracticeSessionsData : []) {
          const buildId = String((row as any).delivery_build_id ?? "");
          if (!buildId) continue;
          const bucket = recentSessionMap.get(buildId) ?? { attempts: 0, latestAt: null };
          bucket.attempts += 1;
          if (!bucket.latestAt) bucket.latestAt = String((row as any).created_at ?? "");
          recentSessionMap.set(buildId, bucket);
        }

        const rankedBlueprints = buildSessionPlanCandidates(
          publishedBlueprints.map((row) => ({ blueprint: row as unknown as JsonRecord, build: row.latest_build as unknown as JsonRecord })),
          diagnostics,
          goals,
          recentSessionMap,
          sourceAvoidance,
          trainingContext,
        );

        const selectedBlueprints: SessionPlanCandidate[] = [];
        const usedBuilds = new Set<string>(retainedBuildIds);
        for (const section of ["reading", "listening", "writing"] as const) {
          const needed = quotas[section];
          if (needed <= 0) continue;
          for (const candidate of rankedBlueprints) {
            const buildId = toText(candidate.build.id, 80);
            if (candidate.sectionType !== section || usedBuilds.has(buildId)) continue;
            selectedBlueprints.push(candidate);
            usedBuilds.add(buildId);
            if (selectedBlueprints.filter((item) => item.sectionType === section).length >= needed) break;
          }
        }

        if (selectedBlueprints.length < generationCount) {
          for (const candidate of rankedBlueprints) {
            const buildId = toText(candidate.build.id, 80);
            if (usedBuilds.has(buildId)) continue;
            selectedBlueprints.push(candidate);
            usedBuilds.add(buildId);
            if (selectedBlueprints.length >= generationCount) break;
          }
        }

        const selectedWithinBudget = limitSessionCandidatesByMinutes(selectedBlueprints, dailyPracticeMinutes);

        if (selectedWithinBudget.length > 0) {
          const insertRows = selectedWithinBudget.map((candidate, index) => ({
            user_id: auth.userId,
            language_id: scope.languageId,
            product_id: scope.practiceProductId,
            plan_date: planDate,
            section_type: candidate.sectionType,
            exercise_id: null,
            blueprint_id: toText(candidate.blueprint.id, 80),
            delivery_build_id: toText(candidate.build.id, 80),
            status: "planned",
            priority: roundTo(candidate.score, 6),
            due_at: null,
            rationale: candidate.rationale,
            rationale_json: candidate.rationaleJson,
            metadata: {
              generation_rank: index + 1,
              source: "practice_blueprint",
              runtime: "transformed_sessions",
              experience_kind: toText(candidate.rationaleJson.experience_kind, 80),
              estimated_minutes: estimatedMinutesForSessionCandidate(candidate),
              question_types: Array.isArray((candidate.build.build_summary as any)?.target_question_types)
                ? (candidate.build.build_summary as any).target_question_types
                : Array.isArray((candidate.build.build_summary as any)?.question_types)
                  ? (candidate.build.build_summary as any).question_types
                : Array.isArray(candidate.blueprint.target_question_types)
                  ? candidate.blueprint.target_question_types
                  : [],
            },
          }));

          const { data: insertedRows, error: insertError } = await sb
            .from("ielts_practice_plan_items")
            .insert(insertRows)
            .select("id,exercise_id,blueprint_id,delivery_build_id,practice_session_id");
          if (insertError) throw new Error("Failed to persist blueprint-backed plan items");

          const planItems = await enrichPlanRows(
            sb,
            [
              ...retainedRows,
              ...((Array.isArray(insertedRows) ? insertedRows : []) as Array<{ id: string; exercise_id?: string | null; blueprint_id?: string | null; delivery_build_id?: string | null; practice_session_id?: string | null }>),
            ],
          );
          return json(200, {
            ok: true,
            runtime: "transformed_sessions",
            plan_date: planDate,
            generated_count: selectedWithinBudget.length,
            retained_count: retainedRows.length,
            daily_practice_minutes: dailyPracticeMinutes,
            quotas,
            diagnostics_snapshot_id: diagnosticsSnapshot.id,
            items: planItems,
          });
        }
      }

      if (retainedRows.length > 0) {
        const planItems = await enrichPlanRows(sb, retainedRows);
        return json(200, {
          ok: true,
          runtime: "transformed_sessions",
          plan_date: planDate,
          generated_count: 0,
          retained_count: retainedRows.length,
          daily_practice_minutes: dailyPracticeMinutes,
          quotas,
          diagnostics_snapshot_id: diagnosticsSnapshot.id,
          items: planItems,
        });
      }

      return json(422, {
        error: "No published transformed IELTS Practice experiences are available for this learner yet",
        hint: "Use Admin Content Factory to build and publish transformed Reading, Listening, and Writing coverage from simulator sources.",
        runtime: "transformed_sessions",
        published_transformed_builds: publishedBlueprints.length,
      });
    }

    if (req.method === "GET" && route === "/plans/today") {
      const goals = await getGoals(sb, auth.userId, scope);
      const timezone = safeTimezone(url.searchParams.get("timezone") ?? goals.timezone);
      const requestedDate = parsePlanDate(url.searchParams.get("date"), timezone);
      const { data: rows, error } = await sb
        .from("ielts_practice_plan_items")
        .select("id,exercise_id,blueprint_id,delivery_build_id,practice_session_id")
        .eq("user_id", auth.userId)
        .eq("language_id", scope.languageId)
        .eq("plan_date", requestedDate)
        .order("priority", { ascending: false })
        .order("created_at", { ascending: true });
      if (error) throw new Error("Failed to load today plan");

      const planItems = await enrichPlanRows(
        sb,
        (Array.isArray(rows) ? rows : []) as Array<{ id: string; exercise_id?: string | null; blueprint_id?: string | null; delivery_build_id?: string | null; practice_session_id?: string | null }>,
      );
      return json(200, {
        scope: {
          user_id: auth.userId,
          language_id: scope.languageId,
          language_code: scope.languageCode,
          product_id: scope.practiceProductId,
        },
        plan_date: requestedDate,
        items: planItems,
      });
    }

    if (req.method === "GET" && route === "/notebook") {
      return json(200, {
        ok: true,
        items: await loadNotebookItems(sb, scope, auth.userId, 50),
      });
    }

    if (req.method === "POST" && route.startsWith("/notebook/") && route.endsWith("/retest")) {
      const notebookId = toText(route.replace("/notebook/", "").replace(/\/retest$/, ""), 80);
      if (!notebookId) return json(404, { error: "Notebook item not found" });
      try {
        const result = await generateNotebookRetest(sb, auth.userId, notebookId);
        return json(200, result);
      } catch (err) {
        return json(404, { error: err instanceof Error ? err.message : "Notebook item not found" });
      }
    }

    if ((req.method === "PATCH" || req.method === "POST") && route.startsWith("/notebook/")) {
      const notebookId = toText(route.replace("/notebook/", "").replace(/\/status$/, ""), 80);
      if (!notebookId) return json(404, { error: "Notebook item not found" });
      const body = await parseBody(req);
      const status = toText(body.status, 32).toLowerCase();
      if (!["active", "reviewed", "difficult", "mastered", "archived"].includes(status)) {
        return json(422, { error: "Unsupported notebook status" });
      }
      const { data, error } = await sb
        .from("ielts_practice_mistake_notebook")
        .update({
          status,
          next_review_at: status === "reviewed"
            ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
            : status === "difficult"
              ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
              : null,
        })
        .eq("id", notebookId)
        .eq("user_id", auth.userId)
        .eq("language_id", scope.languageId)
        .select("id,section_type,question_type,trap_type,mistake_pattern,coach_note,review_count,status,priority,next_review_at,last_seen_at,metadata,updated_at")
        .maybeSingle();
      if (error || !data) return json(404, { error: "Notebook item not found" });
      return json(200, { ok: true, item: data });
    }

    if (req.method === "GET" && route === "/roadmap") {
      let items = await loadRoadmapItems(sb, scope, auth.userId, 50);
      if (items.length === 0 || url.searchParams.get("refresh") === "true") {
        const goals = await getGoals(sb, auth.userId, scope);
        const diagnosticsSnapshot = await loadCurrentDiagnostics(sb, auth.userId, scope)
          ?? await (async () => {
            const computed = await computeDiagnostics(sb, scope, auth.userId, goals);
            return await persistDiagnostics(sb, auth.userId, scope, computed.payload, computed.sourceSummary);
          })();
        const diagnostics = isObject(diagnosticsSnapshot?.diagnostics)
          ? (diagnosticsSnapshot?.diagnostics as DiagnosticPayload)
          : null;
        if (diagnostics) {
          await refreshRoadmapFromDiagnostics(sb, scope, auth.userId, goals, diagnostics);
          items = await loadRoadmapItems(sb, scope, auth.userId, 50);
        }
      }
      return json(200, { ok: true, items });
    }

    if (req.method === "POST" && route.startsWith("/plan-items/") && route.endsWith("/start")) {
      const planItemId = toText(route.slice("/plan-items/".length, -"/start".length), 80);
      if (!planItemId) return json(404, { error: "Plan item not found" });

      const { data: planItemData } = await sb
        .from("ielts_practice_plan_items")
        .select("id,user_id,language_id,product_id,plan_date,section_type,exercise_id,blueprint_id,delivery_build_id,practice_session_id,status,priority,rationale,rationale_json,metadata")
        .eq("id", planItemId)
        .maybeSingle();
      if (!planItemData) return json(404, { error: "Plan item not found" });

      const planItem = planItemData as JsonRecord;
      if (String(planItem.user_id ?? "") !== auth.userId || String(planItem.language_id ?? "") !== scope.languageId) {
        return json(403, { error: "Forbidden" });
      }

      if (String(planItem.practice_session_id ?? "")) {
        const existingBundle = await loadPracticeSessionBundle(sb, String(planItem.practice_session_id), auth.userId, scope);
        if (existingBundle) {
          return json(200, {
            ok: true,
            resumed: true,
            ...existingBundle,
          });
        }
      }

      const blueprintId = toText(planItem.blueprint_id, 80);
      let buildId = toText(planItem.delivery_build_id, 80);
      if (!blueprintId && !buildId) {
        return json(409, {
          error: "This plan item is still on the legacy exercise runtime",
          hint: "Regenerate the plan after publishing practice blueprints.",
        });
      }

      if (!buildId && blueprintId) {
        const { data: blueprintRow } = await sb
          .from("ielts_practice_blueprints")
          .select("id,latest_delivery_build_id")
          .eq("id", blueprintId)
          .maybeSingle();
        buildId = toText((blueprintRow as any)?.latest_delivery_build_id, 80);
      }
      if (!buildId) return json(422, { error: "No published delivery build is attached to this plan item" });

      const { data: buildData } = await sb
        .from("ielts_practice_delivery_builds")
        .select("id,blueprint_id,delivery_experience_id,source_product_id,source_experience_id,source_section_id,status,experience_kind,build_summary,validation_summary,metadata")
        .eq("id", buildId)
        .maybeSingle();
      if (!buildData) return json(404, { error: "Delivery build not found" });

      const build = buildData as JsonRecord;
      if (String(build.status ?? "") !== "published") {
        return json(409, { error: "Delivery build is not published yet" });
      }

      const deliveryExperienceId = toText(build.delivery_experience_id, 80);
      if (!deliveryExperienceId) return json(422, { error: "Delivery build has no experience id" });

      const sessionId = await startRealPracticeSession(supabaseUrl, supabaseAnonKey, auth.token, deliveryExperienceId, {
        practice_context: {
          service: "ielts-practice",
          plan_item_id: planItemId,
          blueprint_id: blueprintId || toText(build.blueprint_id, 80),
          delivery_build_id: buildId,
          experience_kind: toText(build.experience_kind, 80),
          source_section_id: toText(build.source_section_id ?? (isObject(build.build_summary) ? (build.build_summary as JsonRecord).source_section_id : null), 80),
          runtime: "transformed_sessions",
        },
      });

      const nowIso = new Date().toISOString();
      const { data: practiceSessionData, error: practiceSessionError } = await sb
        .from("ielts_practice_sessions")
        .insert({
          user_id: auth.userId,
          language_id: scope.languageId,
          product_id: scope.practiceProductId,
          blueprint_id: blueprintId || toText(build.blueprint_id, 80),
          delivery_build_id: buildId,
          delivery_experience_id: deliveryExperienceId,
          session_id: sessionId,
          plan_item_id: planItemId,
          status: "started",
          metadata: {
            source: "ielts-practice.plan_item_start",
            plan_date: planItem.plan_date,
          },
          started_at: nowIso,
        })
        .select("id")
        .maybeSingle();
      if (practiceSessionError || !practiceSessionData) throw new Error("Failed to create practice session wrapper");

      await sb
        .from("ielts_practice_plan_items")
        .update({
          status: "in_progress",
          blueprint_id: blueprintId || toText(build.blueprint_id, 80),
          delivery_build_id: buildId,
          practice_session_id: String((practiceSessionData as any).id),
        })
        .eq("id", planItemId);

      const bundle = await loadPracticeSessionBundle(sb, String((practiceSessionData as any).id), auth.userId, scope);
      if (!bundle) throw new Error("Failed to load started practice session");

      return json(200, {
        ok: true,
        resumed: false,
        ...bundle,
      });
    }

    if (route.startsWith("/labs/")) {
      const labTail = route.replace("/labs/", "");
      const parts = labTail.split("/");
      const practiceSessionId = toText(parts[0], 80);
      const labAction = toText(parts[1], 40);
      if (!practiceSessionId) return json(404, { error: "Practice lab not found" });

      const bundle = await loadPracticeSessionBundle(sb, practiceSessionId, auth.userId, scope);
      if (!bundle) return json(404, { error: "Practice lab not found" });
      const labPayload = labPayloadFromBundle(bundle);
      if (!labPayload) {
        return json(409, {
          error: "This practice session does not have a lab payload",
          hint: "Rebuild and publish this source through Admin Content Factory.",
        });
      }
      const practiceSession = isObject(bundle.practice_session) ? (bundle.practice_session as JsonRecord) : {};

      if (req.method === "GET" && !labAction) {
        const attempt = await loadLatestLabAttempt(sb, toText(practiceSession.id, 80), auth.userId);
        const labWithMedia = await hydrateLabPayloadMedia(sb, auth.userId, labPayload);
        return json(200, {
          ok: true,
          practice_session: bundle.practice_session,
          blueprint: bundle.blueprint,
          delivery_build: bundle.delivery_build,
          lab: labWithMedia,
          attempt,
          notebook: await loadNotebookItems(sb, scope, auth.userId, 8),
          roadmap: await loadRoadmapItems(sb, scope, auth.userId, 8),
        });
      }

      if (req.method === "POST" && labAction === "save") {
        const attempt = await upsertLabAttemptDraft(sb, scope, auth.userId, practiceSession, labPayload, await parseBody(req));
        await sb.from("ielts_practice_sessions").update({ status: "in_progress" }).eq("id", toText(practiceSession.id, 80));
        return json(200, { ok: true, attempt });
      }

      if (req.method === "POST" && labAction === "submit") {
        const result = await submitLabAttempt(sb, supabaseUrl, supabaseAnonKey, auth.token, scope, auth.userId, bundle, await parseBody(req));
        return json(200, result);
      }

      if (req.method === "POST" && labAction === "coach") {
        const body = await parseBody(req);
        const messages = Array.isArray((body as JsonRecord).messages) ? (body as JsonRecord).messages as unknown[] : [];
        const userQuestion = toText((body as JsonRecord).question, 800);

        // Conversational mode: prior messages provided OR a question supplied.
        if (messages.length > 0 || userQuestion) {
          const history: CoachMessage[] = messages
            .map((m) => (isObject(m)
              ? { role: m.role === "assistant" ? "assistant" : "user", content: toText(m.content, 800) }
              : null))
            .filter((m): m is CoachMessage => m !== null && m.content.length > 0);
          const result = await coachConversation(
            sb,
            auth.userId,
            toText(practiceSession.id, 80),
            labPayload,
            history,
            userQuestion || "Continue the analysis.",
          );
          return json(200, result);
        }

        // Default: single-shot initial coaching summary
        const result = await coachLabAttempt(sb, scope, auth.userId, toText(practiceSession.id, 80), labPayload);
        return json(200, result);
      }

      if (req.method === "POST" && labAction === "hint") {
        const body = await parseBody(req);
        const stepId = toText((body as JsonRecord).step_id, 120);
        if (!stepId) return json(400, { error: "step_id required" });
        const result = await labStrategyHint(labPayload, stepId);
        return json(200, result);
      }

      return json(404, { error: "Practice lab route not found" });
    }

    if ((req.method === "GET" || req.method === "POST") && route.startsWith("/sessions/")) {
      const sessionTail = route.replace("/sessions/", "");
      const [practiceSessionId, subRoute] = sessionTail.split("/", 2);
      const cleanPracticeSessionId = toText(practiceSessionId, 80);
      if (!cleanPracticeSessionId) return json(404, { error: "Practice session not found" });

      let bundle = await loadPracticeSessionBundle(sb, cleanPracticeSessionId, auth.userId, scope);
      if (!bundle) return json(404, { error: "Practice session not found" });

      let scoringRefresh: {
        scoring: JsonRecord | null;
        mastery_updates: JsonRecord[];
        diagnostics_snapshot_id: string | null;
      } | null = null;
      if (subRoute === "results" && req.method === "POST") {
        scoringRefresh = await scoreAndRefreshPracticeSession(
          sb,
          supabaseUrl,
          supabaseAnonKey,
          auth.token,
          scope,
          auth.userId,
          bundle,
        );
        const refreshedBundle = await loadPracticeSessionBundle(
          sb,
          toText((bundle.practice_session as any)?.id, 80) || cleanPracticeSessionId,
          auth.userId,
          scope,
        );
        if (refreshedBundle) bundle = refreshedBundle;
      }

      const evaluations = isObject(bundle.evaluations) ? (bundle.evaluations as JsonRecord) : {};
      const autoEval = isObject(evaluations.auto) ? (evaluations.auto as JsonRecord) : null;
      const aiEval = isObject(evaluations.ai) ? (evaluations.ai as JsonRecord) : null;
      const latestOutcome = isObject(bundle.latest_outcome) ? (bundle.latest_outcome as JsonRecord) : null;
      const sessionRow = isObject(bundle.session) ? (bundle.session as JsonRecord) : null;
      const sessionLifecycle = toText(sessionRow?.status, 32).toLowerCase();
      const nextStatus = sessionLifecycle === "completed"
        ? "completed"
        : sessionLifecycle === "abandoned"
          ? "abandoned"
          : sessionLifecycle === "expired"
            ? "expired"
            : sessionLifecycle === "active" || sessionLifecycle === "paused"
              ? "in_progress"
              : "started";

      await sb
        .from("ielts_practice_sessions")
        .update({
          status: nextStatus || toText((bundle.practice_session as any)?.status, 32).toLowerCase() || "started",
          latest_outcome_id: latestOutcome ? toNullableText(latestOutcome.id, 80) : null,
          latest_auto_evaluation_id: autoEval ? toNullableText(autoEval.id, 80) : null,
          latest_ai_evaluation_id: aiEval ? toNullableText(aiEval.id, 80) : null,
          completed_at: sessionRow?.completed_at ?? null,
        })
        .eq("id", cleanPracticeSessionId);

      if (!subRoute) {
        return json(200, { ok: true, ...bundle });
      }

      if (subRoute === "results") {
        return json(200, {
          ok: true,
          ...bundle,
          scoring_refresh: scoringRefresh,
          results: {
            outcome: latestOutcome,
            auto_evaluation: autoEval,
            ai_evaluation: aiEval,
          },
        });
      }

      if (subRoute === "annotate" && req.method === "POST") {
        const practiceSession = isObject(bundle.practice_session) ? (bundle.practice_session as JsonRecord) : {};
        const runtimeSessionId = toText(practiceSession.session_id, 80);
        if (!runtimeSessionId) return json(200, { ok: true, tasks: [], generated_at: new Date().toISOString() });
        const result = await annotateWritingForSession(sb, auth.userId, runtimeSessionId);
        return json(200, result);
      }

      if (subRoute === "model-answer" && req.method === "POST") {
        const practiceSession = isObject(bundle.practice_session) ? (bundle.practice_session as JsonRecord) : {};
        const runtimeSessionId = toText(practiceSession.session_id, 80);
        if (!runtimeSessionId) return json(200, { ok: true, tasks: [] });
        const result = await generateModelAnswers(sb, auth.userId, runtimeSessionId);
        return json(200, result);
      }

      if (subRoute === "review") {
        return json(200, {
          ok: true,
          ...bundle,
          review: {
            first_section_id: bundle.first_section_id ?? null,
            section_count: Array.isArray(bundle.sections) ? bundle.sections.length : 0,
          },
        });
      }

      return json(404, { error: "Practice session route not found" });
    }

    if (req.method === "POST" && route === "/attempts/start") {
      const body = await parseBody(req);
      const planItemId = toNullableText(body.plan_item_id, 80);
      let exerciseId = toNullableText(body.exercise_id, 80);
      let planItemRow: JsonRecord | null = null;

      if (planItemId) {
        const { data } = await sb
          .from("ielts_practice_plan_items")
          .select("id,user_id,language_id,exercise_id,status")
          .eq("id", planItemId)
          .maybeSingle();
        if (!data || String((data as any).user_id) !== auth.userId || String((data as any).language_id) !== scope.languageId) {
          return json(404, { error: "Plan item not found" });
        }
        planItemRow = data as JsonRecord;
        exerciseId = exerciseId ?? String((data as any).exercise_id ?? "");
      }

      if (!exerciseId) return json(422, { error: "exercise_id or plan_item_id is required" });

      const { data: exerciseData } = await sb
        .from("ielts_practice_exercises")
        .select(
          "id,title,section_type,question_type,skill_tags,difficulty_band_min,difficulty_band_max,estimated_minutes,payload_json,status,metadata,created_at,updated_at",
        )
        .eq("id", exerciseId)
        .maybeSingle();
      if (!exerciseData) return json(404, { error: "Exercise not found" });

      const exercise = exerciseData as ExerciseRow;
      if (exercise.status !== "published") return json(409, { error: "Exercise is not published" });

      const { data: attemptData, error: attemptError } = await sb
        .from("ielts_practice_attempts")
        .insert({
          user_id: auth.userId,
          language_id: scope.languageId,
          product_id: scope.practiceProductId,
          exercise_id: exercise.id,
          plan_item_id: planItemId,
          section_type: exercise.section_type,
          question_type: exercise.question_type,
          status: "started",
          answers_json: {},
          score_artifacts: {},
          metadata: { started_from: planItemId ? "plan" : "direct" },
        })
        .select(
          "id,user_id,language_id,product_id,exercise_id,plan_item_id,section_type,question_type,status,answers_json,score_artifacts,raw_score,max_score,accuracy_ratio,estimated_band,writing_session_id,writing_evaluation_id,started_at,submitted_at,scored_at,metadata,created_at,updated_at",
        )
        .maybeSingle();
      if (attemptError || !attemptData) throw new Error("Failed to start attempt");

      if (planItemRow) {
        await sb.from("ielts_practice_plan_items").update({ status: "in_progress" }).eq("id", String((planItemRow as any).id));
      }

      return json(200, { ok: true, attempt: attemptData, exercise });
    }

    if (req.method === "POST" && route === "/attempts/submit") {
      const body = await parseBody(req);
      const attemptId = toNullableText(body.attempt_id, 80);
      if (!attemptId) return json(422, { error: "attempt_id is required" });
      const force = body.force === true;

      const { data: attemptData } = await sb
        .from("ielts_practice_attempts")
        .select(
          "id,user_id,language_id,product_id,exercise_id,plan_item_id,section_type,question_type,status,answers_json,score_artifacts,raw_score,max_score,accuracy_ratio,estimated_band,writing_session_id,writing_evaluation_id,started_at,submitted_at,scored_at,metadata,created_at,updated_at",
        )
        .eq("id", attemptId)
        .maybeSingle();
      if (!attemptData) return json(404, { error: "Attempt not found" });

      const attempt = attemptData as AttemptRow;
      if (attempt.user_id !== auth.userId || attempt.language_id !== scope.languageId) return json(403, { error: "Forbidden" });
      if (attempt.status === "scored" && !force) return json(200, { ok: true, attempt, already_scored: true });

      const { data: exerciseData } = await sb
        .from("ielts_practice_exercises")
        .select(
          "id,title,section_type,question_type,skill_tags,difficulty_band_min,difficulty_band_max,estimated_minutes,payload_json,status,metadata,created_at,updated_at",
        )
        .eq("id", attempt.exercise_id)
        .maybeSingle();
      if (!exerciseData) return json(404, { error: "Exercise not found" });
      const exercise = exerciseData as ExerciseRow;

      const answers = isObject(body.answers) || Array.isArray(body.answers) || typeof body.answers === "string"
        ? (body.answers as unknown)
        : {};
      const scoreResult = await scoreSubmission(sb, supabaseUrl, supabaseAnonKey, auth.token, attempt, exercise, answers);
      const nowIso = new Date().toISOString();

      const { data: updatedAttempt, error: updateError } = await sb
        .from("ielts_practice_attempts")
        .update({
          status: "scored",
          answers_json: isObject(answers) ? answers : { value: answers },
          score_artifacts: scoreResult.scoreArtifacts,
          raw_score: scoreResult.rawScore,
          max_score: scoreResult.maxScore,
          accuracy_ratio: scoreResult.accuracyRatio,
          estimated_band: scoreResult.estimatedBand,
          writing_session_id: scoreResult.writingSessionId,
          writing_evaluation_id: scoreResult.writingEvaluationId,
          submitted_at: nowIso,
          scored_at: nowIso,
          metadata: {
            ...(isObject(attempt.metadata) ? attempt.metadata : {}),
            ...(isObject(body.metadata) ? body.metadata : {}),
            submitted_via: "ielts-practice",
          },
        })
        .eq("id", attempt.id)
        .select(
          "id,user_id,language_id,product_id,exercise_id,plan_item_id,section_type,question_type,status,answers_json,score_artifacts,raw_score,max_score,accuracy_ratio,estimated_band,writing_session_id,writing_evaluation_id,started_at,submitted_at,scored_at,metadata,created_at,updated_at",
        )
        .maybeSingle();

      if (updateError || !updatedAttempt) throw new Error("Failed to finalize attempt");

      if (attempt.plan_item_id) {
        await sb
          .from("ielts_practice_plan_items")
          .update({ status: "completed", attempt_id: attempt.id, completed_at: nowIso })
          .eq("id", attempt.plan_item_id);
      }

      await emitLanguageSignalEvent(sb, scope, auth.userId, attempt.id, scoreResult);
      const masteryUpdates = await updateMasteryFromAttempt(sb, scope, auth.userId, attempt, scoreResult, nowIso);
      try {
        const goals = await getGoals(sb, auth.userId, scope);
        const computed = await computeDiagnostics(sb, scope, auth.userId, goals);
        await persistDiagnostics(sb, auth.userId, scope, computed.payload, computed.sourceSummary);
      } catch {
        // Diagnostics can be refreshed on the next dashboard load if this best-effort pass fails.
      }
      return json(200, {
        ok: true,
        attempt: updatedAttempt,
        exercise,
        signals_enqueued: scoreResult.signals.length,
        mastery_updates: masteryUpdates,
      });
    }

    if (req.method === "GET" && route.startsWith("/attempts/")) {
      const attemptId = toText(route.replace("/attempts/", ""), 120);
      if (!attemptId) return json(404, { error: "Attempt not found" });

      const { data: attemptData } = await sb
        .from("ielts_practice_attempts")
        .select(
          "id,user_id,language_id,product_id,exercise_id,plan_item_id,section_type,question_type,status,answers_json,score_artifacts,raw_score,max_score,accuracy_ratio,estimated_band,writing_session_id,writing_evaluation_id,started_at,submitted_at,scored_at,metadata,created_at,updated_at",
        )
        .eq("id", attemptId)
        .maybeSingle();
      if (!attemptData) return json(404, { error: "Attempt not found" });

      const attempt = attemptData as AttemptRow;
      if (attempt.user_id !== auth.userId || attempt.language_id !== scope.languageId) return json(403, { error: "Forbidden" });

      const { data: exerciseData } = await sb
        .from("ielts_practice_exercises")
        .select(
          "id,title,section_type,question_type,skill_tags,difficulty_band_min,difficulty_band_max,estimated_minutes,payload_json,status,metadata,created_at,updated_at",
        )
        .eq("id", attempt.exercise_id)
        .maybeSingle();

      return json(200, { attempt, exercise: exerciseData ?? null });
    }

    return json(404, { error: "Not found" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return json(500, { error: message });
  }
});
