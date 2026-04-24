import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { loadPublishedBlueprintCandidates } from "../_shared/ielts-practice-blueprints.ts";

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
};

type QuestionTypeDiagnostic = {
  section_type: "reading" | "listening" | "writing";
  question_type: string;
  samples: number;
  raw_score: number;
  max_score: number;
  accuracy_ratio: number | null;
  weakness_score: number;
};

type DiagnosticPayload = {
  schema_version: string;
  generated_at: string;
  overall: {
    outcomes_count: number;
    average_band: number | null;
    target_band: number;
    band_gap: number | null;
  };
  sections: Record<string, SectionDiagnostic>;
  question_types: QuestionTypeDiagnostic[];
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
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
};

const PRACTICE_PRODUCT_SLUG = "ielts-practice";
const IELTS_SIMULATOR_PRODUCT_SLUG = "ielts-academic-simulator";
const IELTS_SIMULATOR_PRODUCT_ID_FALLBACK = "ead05eae-aa97-4bda-a07c-51e5dbb062c0";
const EN_LANGUAGE_CODE = "en";
const DIAGNOSTIC_SCHEMA_VERSION = "ielts.practice.diagnostic.v1";

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
  if (!header) return null;
  const token = header.startsWith("Bearer ") ? header.slice(7) : header;
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
): { score: number; max: number } | null => {
  if (!isObject(answerKey)) return null;
  const type = toText(questionType, 120).toLowerCase();

  if (type === "question_single_choice") {
    const expected = normalizeChoiceToken(String(answerKey.option_id ?? ""));
    const actualRaw =
      typeof responseData === "string"
        ? responseData
        : isObject(responseData)
          ? String(responseData.selected_option ?? responseData.option_id ?? "")
          : "";
    const actual = normalizeChoiceToken(actualRaw);
    return { score: expected && actual === expected ? 1 : 0, max: expected ? 1 : 0 };
  }

  if (type === "question_multi_choice") {
    const expected = Array.isArray(answerKey.option_ids)
      ? answerKey.option_ids.map((entry) => normalizeChoiceToken(String(entry))).filter(Boolean)
      : [];

    let actual: string[] = [];
    if (Array.isArray(responseData)) {
      actual = responseData.map((entry) => normalizeChoiceToken(String(entry))).filter(Boolean);
    } else if (isObject(responseData) && Array.isArray(responseData.selected_options)) {
      actual = responseData.selected_options.map((entry) => normalizeChoiceToken(String(entry))).filter(Boolean);
    }

    return { score: expected.length > 0 && setEquals(expected, actual) ? 1 : 0, max: expected.length > 0 ? 1 : 0 };
  }

  if (type === "question_text") {
    const expected = Array.isArray(answerKey.answers)
      ? answerKey.answers.map((entry) => normalizeToken(String(entry))).filter(Boolean)
      : [];
    const actualRaw = typeof responseData === "string"
      ? responseData
      : isObject(responseData)
        ? String(responseData.text ?? responseData.answer ?? "")
        : "";
    const actual = normalizeToken(actualRaw);
    return { score: expected.includes(actual) ? 1 : 0, max: expected.length > 0 ? 1 : 0 };
  }

  const mapCandidates = ["matches", "blanks", "cells", "labels", "targets"];
  for (const mapKey of mapCandidates) {
    if (isObject(answerKey[mapKey])) {
      const expectedMap = answerKey[mapKey] as Record<string, unknown>;
      let actualMap: Record<string, unknown> | null = null;
      if (isObject(responseData) && isObject(responseData[mapKey])) {
        actualMap = responseData[mapKey] as Record<string, unknown>;
      } else if (isObject(responseData)) {
        actualMap = responseData;
      }
      const normalizer =
        mapKey === "matches" && (type.includes("true_false") || type.includes("yes_no") || type.includes("select_from_list"))
          ? normalizeChoiceToken
          : normalizeToken;
      return scoreMapAnswers(expectedMap, actualMap, normalizer);
    }
  }

  return null;
};

const extractRoute = (url: URL): string => {
  const marker = "/ielts-practice";
  const idx = url.pathname.indexOf(marker);
  if (idx < 0) return "";
  const tail = url.pathname.slice(idx + marker.length);
  return tail.startsWith("/") ? tail : tail ? `/${tail}` : "";
};

const authUser = async (sb: any, req: Request): Promise<AuthedContext | null> => {
  const token = getBearerToken(req);
  if (!token) return null;

  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) return null;

  return {
    userId: data.user.id,
    token,
  };
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

const defaultGoals = (scope: ResolvedScope, userId: string): GoalRow => ({
  user_id: userId,
  language_id: scope.languageId,
  product_id: scope.practiceProductId,
  target_overall_band: 6.5,
  target_section_bands: {
    reading: 6.5,
    listening: 6.5,
    writing: 6.5,
  },
  target_date: null,
  focus_modes: [],
  metadata: {},
  created_at: new Date(0).toISOString(),
  updated_at: new Date(0).toISOString(),
});

const getGoals = async (sb: any, userId: string, scope: ResolvedScope): Promise<GoalRow> => {
  const { data } = await sb
    .from("ielts_practice_user_goals")
    .select(
      "user_id,language_id,product_id,target_overall_band,target_section_bands,target_date,focus_modes,metadata,created_at,updated_at",
    )
    .eq("user_id", userId)
    .eq("language_id", scope.languageId)
    .maybeSingle();

  if (!data) return defaultGoals(scope, userId);

  const row = data as GoalRow;
  return {
    ...row,
    target_section_bands: isObject(row.target_section_bands) ? row.target_section_bands : {},
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

  const targetDate = body.target_date == null
    ? current.target_date
    : toNullableText(body.target_date, 30);

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
    focus_modes: focusModes,
    metadata,
  };

  const { data, error } = await sb
    .from("ielts_practice_user_goals")
    .upsert(upsertPayload, { onConflict: "user_id,language_id" })
    .select(
      "user_id,language_id,product_id,target_overall_band,target_section_bands,target_date,focus_modes,metadata,created_at,updated_at",
    )
    .maybeSingle();

  if (error || !data) {
    throw new Error("Failed to save goals");
  }

  return data as GoalRow;
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
  }>();

  for (const section of ["reading", "listening", "writing"] as const) {
    sectionBuckets.set(section, {
      samples: 0,
      raw: 0,
      max: 0,
      bandTotal: 0,
      bandWeight: 0,
    });
  }

  for (const outcome of outcomes) {
    const productId = String((outcome as any).product_id ?? "");
    const weight = productId === scope.simulatorProductId ? 1 : 0.65;
    if (productId === scope.simulatorProductId) simulatorOutcomeCount += 1;
    else if (productId === scope.practiceProductId) practiceOutcomeCount += 1;

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
  }>();

  if (sessionIds.length > 0) {
    const [{ data: responsesData }, { data: sessionRowsData }] = await Promise.all([
      sb
        .from("responses")
        .select("session_id,content_unit_id,data")
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
        };
        bucket.samples += 1;
        bucket.raw += score.score;
        bucket.max += score.max;
        questionBuckets.set(key, bucket);
      }
    }
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

    sections[section] = {
      section_type: section,
      samples: bucket.samples,
      raw_score: bucket.raw,
      max_score: bucket.max,
      accuracy_ratio: accuracyRatio,
      average_band: averageBand,
      target_band: targetBand,
      band_gap: bandGap,
    };
  }

  const questionTypes: QuestionTypeDiagnostic[] = Array.from(questionBuckets.values())
    .map((bucket) => {
      const accuracy = bucket.max > 0 ? bucket.raw / bucket.max : null;
      const sectionGap = Math.max(0, toNumber(sections[bucket.sectionType]?.band_gap) ?? 0);
      const weaknessFromAccuracy = accuracy == null ? 0 : 1 - clamp(accuracy, 0, 1);
      const weaknessScore = roundTo(weaknessFromAccuracy * 1.2 + sectionGap * 0.2 + Math.min(bucket.samples, 8) * 0.02, 4);

      return {
        section_type: bucket.sectionType,
        question_type: bucket.questionType,
        samples: bucket.samples,
        raw_score: bucket.raw,
        max_score: bucket.max,
        accuracy_ratio: accuracy == null ? null : roundTo(accuracy, 4),
        weakness_score: weaknessScore,
      };
    })
    .sort((a, b) => {
      if (b.weakness_score !== a.weakness_score) return b.weakness_score - a.weakness_score;
      if (b.samples !== a.samples) return b.samples - a.samples;
      return a.question_type.localeCompare(b.question_type);
    })
    .slice(0, 120);

  const payload: DiagnosticPayload = {
    schema_version: DIAGNOSTIC_SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
    overall: {
      outcomes_count: outcomes.length,
      average_band: averageOverallBand,
      target_band: targetOverallBand,
      band_gap: averageOverallBand == null ? null : roundTo(targetOverallBand - averageOverallBand, 2),
    },
    sections,
    question_types: questionTypes,
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

const parsePlanDate = (raw: unknown): string => {
  const text = toText(raw, 20);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  return new Date().toISOString().slice(0, 10);
};

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
  for (const row of diagnostics.question_types ?? []) {
    weaknessByQuestionType.set(`${row.section_type}::${row.question_type}`, Math.max(0, toNumber(row.weakness_score) ?? 0));
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
): SessionPlanCandidate[] => {
  const sectionGapBySection = new Map<string, number>();
  for (const [section, value] of Object.entries(diagnostics.sections ?? {})) {
    sectionGapBySection.set(section, Math.max(0, toNumber((value as any).band_gap) ?? 0));
  }

  const weaknessByQuestionType = new Map<string, number>();
  for (const row of diagnostics.question_types ?? []) {
    weaknessByQuestionType.set(`${row.section_type}::${row.question_type}`, Math.max(0, toNumber(row.weakness_score) ?? 0));
  }

  const targetOverallBand = clamp(toNumber(goals.target_overall_band) ?? 6.5, 0, 9);
  const now = Date.now();

  return candidates.map((row) => {
    const blueprint = isObject(row.blueprint) ? (row.blueprint as JsonRecord) : {};
    const build = isObject(row.build) ? (row.build as JsonRecord) : {};
    const buildSummary = isObject(build.build_summary) ? (build.build_summary as JsonRecord) : {};
    const sectionType = toSectionType(blueprint.section_type ?? buildSummary.section_type ?? "reading") ?? "reading";
    const sectionGap = sectionGapBySection.get(sectionType) ?? 0;

    const questionTypesRaw = Array.isArray(buildSummary.question_types)
      ? buildSummary.question_types
      : Array.isArray(blueprint.target_question_types)
        ? blueprint.target_question_types
        : [];
    const questionTypes = questionTypesRaw.map((entry) => toText(entry, 120).toLowerCase()).filter(Boolean);
    const weaknessValues = questionTypes.map((questionType) => weaknessByQuestionType.get(`${sectionType}::${questionType}`) ?? 0);
    const questionWeakness = weaknessValues.length > 0
      ? weaknessValues.reduce((sum, value) => sum + value, 0) / weaknessValues.length
      : 0;

    const buildId = toText(build.id, 80);
    const recent = recentSessionMap.get(buildId);
    let recencyPenalty = 0;
    if (recent?.latestAt) {
      const daysAgo = Math.max(0, (now - Date.parse(recent.latestAt)) / (1000 * 60 * 60 * 24));
      recencyPenalty = Math.max(0, 0.9 - Math.min(daysAgo / 14, 0.9)) + recent.attempts * 0.08;
    }

    const estimatedMinutes = clamp(Math.floor(toNumber(blueprint.estimated_minutes ?? 25) ?? 25), 5, 120);
    const durationFit = Math.max(0.2, 1 - Math.abs(estimatedMinutes - 25) / 50);
    const targetBandFit = Math.max(0.2, 1 - Math.abs(targetOverallBand - (toNumber((diagnostics.sections as any)?.[sectionType]?.target_band) ?? targetOverallBand)) / 4);
    const score = roundTo(sectionGap * 1.45 + questionWeakness * 1.6 + durationFit * 0.3 + targetBandFit * 0.2 - recencyPenalty, 6);
    const questionSummary = questionTypes.length > 0 ? questionTypes.slice(0, 4).join(", ") : "mixed question types";

    return {
      blueprint,
      build,
      sectionType,
      score,
      rationale: `${sectionType} weakness plus ${questionSummary}`,
      rationaleJson: {
        source: "practice_blueprint",
        section_gap: roundTo(sectionGap, 4),
        question_weakness: roundTo(questionWeakness, 4),
        duration_fit: roundTo(durationFit, 4),
        target_band_fit: roundTo(targetBandFit, 4),
        recency_penalty: roundTo(recencyPenalty, 4),
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
  if (!practiceSessionData) return null;

  const practiceSession = practiceSessionData as JsonRecord;
  if (String(practiceSession.user_id ?? "") !== userId || String(practiceSession.language_id ?? "") !== scope.languageId) return null;

  const [buildRes, blueprintRes, sessionRes, outcomeRes, evaluationsRes, sectionsRes] = await Promise.all([
    sb
      .from("ielts_practice_delivery_builds")
      .select("id,blueprint_id,delivery_experience_id,status,build_version,build_summary,validation_summary,metadata,created_at,updated_at")
      .eq("id", String(practiceSession.delivery_build_id ?? ""))
      .maybeSingle(),
    sb
      .from("ielts_practice_blueprints")
      .select("id,title,section_type,source_product_id,source_experience_id,source_section_id,target_question_types,estimated_minutes,status,metadata,latest_delivery_build_id")
      .eq("id", String(practiceSession.blueprint_id ?? ""))
      .maybeSingle(),
    sb
      .from("sessions")
      .select("id,experience_id,status,started_at,completed_at,metadata")
      .eq("id", String(practiceSession.session_id ?? ""))
      .maybeSingle(),
    sb
      .from("exam_outcomes")
      .select("id,computed_at,overall_band,section_scores,result")
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
        .select("id,blueprint_id,delivery_experience_id,status,build_version,build_summary,validation_summary,metadata,created_at,updated_at")
        .in("id", buildIds)
      : Promise.resolve({ data: [] }),
    blueprintIds.length > 0
      ? sb
        .from("ielts_practice_blueprints")
        .select("id,title,section_type,source_product_id,source_experience_id,source_section_id,target_question_types,estimated_minutes,status,metadata,latest_delivery_build_id")
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = getEnv("SUPABASE_URL");
    const supabaseAnonKey = getEnv("SUPABASE_ANON_KEY");
    const supabaseServiceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

    const sb = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    const auth = await authUser(sb, req);
    if (!auth) return json(401, { error: "Unauthorized" });

    const scope = await resolveScope(sb);
    const url = new URL(req.url);
    const route = extractRoute(url);

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

    if (req.method === "GET" && route === "/diagnostics") {
      const refresh = String(url.searchParams.get("refresh") ?? "").toLowerCase() === "true";
      const goals = await getGoals(sb, auth.userId, scope);

      if (!refresh) {
        const current = await loadCurrentDiagnostics(sb, auth.userId, scope);
        if (current) {
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
      const planDate = parsePlanDate(body.plan_date);
      const requestedDailyCount = Number(body.daily_count ?? 10);
      const dailyCount = Number.isFinite(requestedDailyCount) ? clamp(Math.floor(requestedDailyCount), 3, 20) : 10;
      const refreshDiagnostics = String(body.refresh_diagnostics ?? "").toLowerCase() === "true";

      const goals = await getGoals(sb, auth.userId, scope);
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
      const quotas = createSectionQuota(dailyCount, normalizedMix);

      if (publishedBlueprints.length > 0) {
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
        );

        const selectedBlueprints: SessionPlanCandidate[] = [];
        const usedBuilds = new Set<string>();
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

        if (selectedBlueprints.length < dailyCount) {
          for (const candidate of rankedBlueprints) {
            const buildId = toText(candidate.build.id, 80);
            if (usedBuilds.has(buildId)) continue;
            selectedBlueprints.push(candidate);
            usedBuilds.add(buildId);
            if (selectedBlueprints.length >= dailyCount) break;
          }
        }

        if (selectedBlueprints.length > 0) {
          await sb
            .from("ielts_practice_plan_items")
            .delete()
            .eq("user_id", auth.userId)
            .eq("language_id", scope.languageId)
            .eq("plan_date", planDate)
            .in("status", ["planned", "in_progress", "expired"]);

          const insertRows = selectedBlueprints.map((candidate, index) => ({
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
              estimated_minutes: toNumber(candidate.blueprint.estimated_minutes) ?? 25,
              question_types: Array.isArray((candidate.build.build_summary as any)?.question_types)
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
            (Array.isArray(insertedRows) ? insertedRows : []) as Array<{ id: string; exercise_id?: string | null; blueprint_id?: string | null; delivery_build_id?: string | null; practice_session_id?: string | null }>,
          );
          return json(200, {
            ok: true,
            runtime: "session_blueprints",
            plan_date: planDate,
            generated_count: planItems.length,
            quotas,
            diagnostics_snapshot_id: diagnosticsSnapshot.id,
            items: planItems,
          });
        }
      }

      const { data: exercisesData, error: exercisesError } = await sb
        .from("ielts_practice_exercises")
        .select(
          "id,title,section_type,question_type,skill_tags,difficulty_band_min,difficulty_band_max,estimated_minutes,payload_json,status,metadata,created_at,updated_at",
        )
        .eq("language_id", scope.languageId)
        .eq("product_id", scope.practiceProductId)
        .eq("status", "published")
        .order("updated_at", { ascending: false })
        .limit(1000);

      if (exercisesError) throw new Error("Failed to load exercise bank");
      const exercises = (Array.isArray(exercisesData) ? exercisesData : []) as ExerciseRow[];
      if (exercises.length === 0) {
        return json(422, {
          error: "No published exercises are available yet",
          hint: "Create and publish exercises in /admin",
        });
      }

      const { data: recentAttemptsData } = await sb
        .from("ielts_practice_attempts")
        .select("exercise_id,created_at")
        .eq("user_id", auth.userId)
        .eq("language_id", scope.languageId)
        .order("created_at", { ascending: false })
        .limit(300);

      const recentAttemptMap = new Map<string, { attempts: number; latestAt: string | null }>();
      for (const row of Array.isArray(recentAttemptsData) ? recentAttemptsData : []) {
        const exerciseId = String((row as any).exercise_id ?? "");
        if (!exerciseId) continue;
        const bucket = recentAttemptMap.get(exerciseId) ?? { attempts: 0, latestAt: null };
        bucket.attempts += 1;
        if (!bucket.latestAt) bucket.latestAt = String((row as any).created_at ?? "");
        recentAttemptMap.set(exerciseId, bucket);
      }

      const ranked = scorePlanCandidates(buildPlanCandidates(exercises, diagnostics, goals, rules, recentAttemptMap));

      const selected: PlanCandidate[] = [];
      const used = new Set<string>();
      for (const section of ["reading", "listening", "writing"] as const) {
        const needed = quotas[section];
        if (needed <= 0) continue;
        for (const candidate of ranked) {
          if (candidate.sectionType !== section || used.has(candidate.exercise.id)) continue;
          selected.push(candidate);
          used.add(candidate.exercise.id);
          if (selected.filter((item) => item.sectionType === section).length >= needed) break;
        }
      }

      if (selected.length < dailyCount) {
        for (const candidate of ranked) {
          if (used.has(candidate.exercise.id)) continue;
          selected.push(candidate);
          used.add(candidate.exercise.id);
          if (selected.length >= dailyCount) break;
        }
      }

      if (selected.length === 0) return json(422, { error: "Could not generate plan with current exercise bank" });

      await sb
        .from("ielts_practice_plan_items")
        .delete()
        .eq("user_id", auth.userId)
        .eq("language_id", scope.languageId)
        .eq("plan_date", planDate)
        .in("status", ["planned", "in_progress", "expired"]);

      const insertRows = selected.map((candidate, index) => ({
        user_id: auth.userId,
        language_id: scope.languageId,
        product_id: scope.practiceProductId,
        plan_date: planDate,
        section_type: candidate.sectionType,
        exercise_id: candidate.exercise.id,
        status: "planned",
        priority: roundTo(candidate.score, 6),
        due_at: null,
        rationale: candidate.rationale,
        rationale_json: candidate.rationaleJson,
        metadata: {
          generation_rank: index + 1,
          question_type: candidate.exercise.question_type,
          estimated_minutes: candidate.exercise.estimated_minutes,
        },
      }));

      const { data: insertedRows, error: insertError } = await sb
        .from("ielts_practice_plan_items")
        .insert(insertRows)
        .select("id,exercise_id,blueprint_id,delivery_build_id,practice_session_id");
      if (insertError) throw new Error("Failed to persist plan items");

      const planItems = await enrichPlanRows(
        sb,
        (Array.isArray(insertedRows) ? insertedRows : []) as Array<{ id: string; exercise_id?: string | null; blueprint_id?: string | null; delivery_build_id?: string | null; practice_session_id?: string | null }>,
      );
      return json(200, {
        ok: true,
        runtime: "legacy_exercises",
        plan_date: planDate,
        generated_count: planItems.length,
        quotas,
        diagnostics_snapshot_id: diagnosticsSnapshot.id,
        items: planItems,
      });
    }

    if (req.method === "GET" && route === "/plans/today") {
      const requestedDate = parsePlanDate(url.searchParams.get("date"));
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
        .select("id,blueprint_id,delivery_experience_id,status,build_summary,validation_summary,metadata")
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

    if (req.method === "GET" && route.startsWith("/sessions/")) {
      const sessionTail = route.replace("/sessions/", "");
      const [practiceSessionId, subRoute] = sessionTail.split("/", 2);
      const cleanPracticeSessionId = toText(practiceSessionId, 80);
      if (!cleanPracticeSessionId) return json(404, { error: "Practice session not found" });

      const bundle = await loadPracticeSessionBundle(sb, cleanPracticeSessionId, auth.userId, scope);
      if (!bundle) return json(404, { error: "Practice session not found" });

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
          results: {
            outcome: latestOutcome,
            auto_evaluation: autoEval,
            ai_evaluation: aiEval,
          },
        });
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
      return json(200, { ok: true, attempt: updatedAttempt, exercise, signals_enqueued: scoreResult.signals.length });
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
