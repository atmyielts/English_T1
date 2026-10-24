import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { emitOpsAlert, logOpsEvent, requestIdFrom, withRequestIdHeader } from "../_shared/ops-observability.ts";
import { scoreToefl2026Unit } from "../_shared/toefl-2026.ts";
import { applyToefl2026ToSections, computeToefl2026Session, isToefl2026Experience, toefl2026Summary } from "../_shared/toefl-2026-session.ts";

type Json = Record<string, unknown>;

type ScoreSessionInput = {
  session_id: string;
  method?: "auto";
};

type SectionRow = {
  id: string;
  display_order: number;
  metadata: Json | null;
};

type PartRow = { id: string; section_id: string };

type ContentUnitRow = {
  id: string;
  part_id: string;
  type: string;
};

type AnswerKeyRow = { content_unit_id: string; correct: any };

type ResponseRow = { content_unit_id: string; data: any; submitted_at: string };

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const opsDomain = "score-session";
const jsonHeaders = (requestId: string): Record<string, string> =>
  withRequestIdHeader({ "Content-Type": "application/json", ...corsHeaders }, requestId);

const getEnv = (key: string): string => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Missing env var: ${key}`);
  return value;
};

const getBearerToken = (req: Request): string | null => {
  const header = req.headers.get("Authorization") ?? "";
  if (!header) return null;
  return header.startsWith("Bearer ") ? header.slice(7) : header;
};

const normalizeText = (raw: string): string =>
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

const normalizeTfngToken = (raw: string): string => {
  const v = raw.toLowerCase().replace(/[^a-z]/g, "");
  if (v === "t" || v === "true") return "T";
  if (v === "f" || v === "false") return "F";
  if (v === "ng" || v === "notgiven") return "NG";
  return "";
};

const normalizeYnngToken = (raw: string): string => {
  const v = raw.toLowerCase().replace(/[^a-z]/g, "");
  if (v === "y" || v === "yes") return "Y";
  if (v === "n" || v === "no") return "N";
  if (v === "ng" || v === "notgiven") return "NG";
  return "";
};

const toCandidateStrings = (value: unknown): string[] => {
  if (value == null) return [];
  if (Array.isArray(value)) return value.flatMap((entry) => toCandidateStrings(entry));
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return [String(value)];
  if (typeof value === "object") {
    const v = value as Record<string, unknown>;
    if (typeof v.value === "string") return [v.value];
    if (typeof v.text === "string") return [v.text];
    if (typeof v.answer === "string") return [v.answer];
  }
  return [String(value)];
};

const firstNormalized = (value: unknown, normalizer: (raw: string) => string): string => {
  const candidates = toCandidateStrings(value).map((entry) => normalizer(entry)).filter(Boolean);
  return candidates[0] ?? "";
};

const arraysEqualAsSets = (a: string[], b: string[]): boolean => {
  if (a.length !== b.length) return false;
  const sa = new Set(a);
  if (sa.size !== a.length) return false;
  for (const x of b) if (!sa.has(x)) return false;
  return true;
};

const toHalfBand = (n: number): number => Math.round(n * 2) / 2;

const toSatScaledScore = (ratio: number): number => {
  const clamped = Math.max(0, Math.min(1, ratio));
  const scaled = 200 + clamped * 600;
  return Math.round(scaled / 10) * 10;
};

const toToeflScaledScore = (ratio: number): number => {
  const clamped = Math.max(0, Math.min(1, ratio));
  return Math.round(clamped * 30);
};

const roundNumber = (value: number, precision = 2): number => {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
};

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const averageNumbers = (values: number[]): number | null => {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

type ItepCalibrationEntry = {
  score: number;
  min_raw?: number | null;
  max_raw?: number | null;
  min_ratio?: number | null;
  max_ratio?: number | null;
  min_percent?: number | null;
  max_percent?: number | null;
};

const asFinite = (value: unknown): number | null => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeItepCalibrationEntries = (value: unknown): ItepCalibrationEntry[] => {
  if (!Array.isArray(value)) return [];
  return value.reduce<ItepCalibrationEntry[]>((entries, entry) => {
    const row = asObject(entry);
    const score = asFinite(row.score);
    if (score == null) return entries;
    entries.push({
      score,
      min_raw: asFinite(row.min_raw),
      max_raw: asFinite(row.max_raw),
      min_ratio: asFinite(row.min_ratio),
      max_ratio: asFinite(row.max_ratio),
      min_percent: asFinite(row.min_percent),
      max_percent: asFinite(row.max_percent),
    });
    return entries;
  }, []);
};

const resolveItepCalibrationEntries = (
  sectionType: string,
  sectionMetadata: Json | null,
  experienceMetadata: Json | null,
): ItepCalibrationEntry[] => {
  const sectionMeta = asObject(sectionMetadata);
  const experienceMeta = asObject(experienceMetadata);
  const sectionScoreProfile = asObject(sectionMeta.score_profile);
  const experienceScoreProfile = asObject(experienceMeta.score_profile);
  const experienceCalibration = asObject(experienceScoreProfile.objective_calibration ?? experienceMeta.itep_calibration);

  return normalizeItepCalibrationEntries(
    sectionScoreProfile.calibration ??
      sectionMeta.itep_calibration ??
      experienceCalibration[sectionType] ??
      asObject(experienceScoreProfile.calibration)[sectionType],
  );
};

const resolveItepObjectiveScore = (
  sectionType: string,
  rawScore: number,
  maxScore: number,
  sectionMetadata: Json | null,
  experienceMetadata: Json | null,
): number | null => {
  if (maxScore <= 0) return null;
  const ratio = clamp(rawScore / maxScore, 0, 1);
  const percent = ratio * 100;
  const calibrationEntries = resolveItepCalibrationEntries(sectionType, sectionMetadata, experienceMetadata);

  const matched = calibrationEntries
    .filter((entry) => {
      if (entry.min_raw != null && rawScore < entry.min_raw) return false;
      if (entry.max_raw != null && rawScore > entry.max_raw) return false;
      if (entry.min_ratio != null && ratio < entry.min_ratio) return false;
      if (entry.max_ratio != null && ratio > entry.max_ratio) return false;
      if (entry.min_percent != null && percent < entry.min_percent) return false;
      if (entry.max_percent != null && percent > entry.max_percent) return false;
      return true;
    })
    .sort((a, b) => a.score - b.score)
    .at(-1);

  if (matched) return clamp(roundNumber(matched.score, 1), 0, 6);
  return clamp(roundNumber(ratio * 6, 1), 0, 6);
};

const extractWritingEvaluationScore = (result: unknown): number | null => {
  const row = asObject(result);
  const direct =
    asFinite(row.overall_score) ??
    asFinite(row.itep_score) ??
    asFinite(row.writing_score) ??
    asFinite(row.overall_band);
  if (direct != null) return direct;

  const tasks = Array.isArray(row.tasks) ? row.tasks : [];
  const taskScores = tasks
    .map((task) => {
      const taskRow = asObject(task);
      return asFinite(taskRow.score) ?? asFinite(taskRow.band) ?? asFinite(taskRow.writing_score);
    })
    .filter((value): value is number => value != null);

  const averageTaskScore = averageNumbers(taskScores);
  return averageTaskScore != null ? roundNumber(averageTaskScore, 1) : null;
};

const bandFromScaled40 = (sectionType: string, scaledScore: number): number => {
  const s = Math.max(0, Math.min(40, Math.round(scaledScore)));

  // Typical IELTS band conversion (listening), and reading academic.
  if (sectionType === "listening") {
    if (s >= 39) return 9.0;
    if (s >= 37) return 8.5;
    if (s >= 35) return 8.0;
    if (s >= 32) return 7.5;
    if (s >= 30) return 7.0;
    if (s >= 26) return 6.5;
    if (s >= 23) return 6.0;
    if (s >= 18) return 5.5;
    if (s >= 16) return 5.0;
    if (s >= 13) return 4.5;
    if (s >= 10) return 4.0;
    if (s >= 8) return 3.5;
    if (s >= 6) return 3.0;
    if (s >= 4) return 2.5;
    if (s >= 2) return 2.0;
    if (s >= 1) return 1.0;
    return 0.0;
  }

  // reading (default academic)
  if (sectionType === "reading") {
    if (s >= 39) return 9.0;
    if (s >= 37) return 8.5;
    if (s >= 35) return 8.0;
    if (s >= 33) return 7.5;
    if (s >= 30) return 7.0;
    if (s >= 27) return 6.5;
    if (s >= 23) return 6.0;
    if (s >= 19) return 5.5;
    if (s >= 15) return 5.0;
    if (s >= 13) return 4.5;
    if (s >= 10) return 4.0;
    if (s >= 8) return 3.5;
    if (s >= 6) return 3.0;
    if (s >= 4) return 2.5;
    if (s >= 2) return 2.0;
    if (s >= 1) return 1.0;
    return 0.0;
  }

  return 0.0;
};

type UnitScore = { score: number; max: number };

const scoreTextMap = (expected: Record<string, unknown>, actual: Record<string, unknown> | null): UnitScore => {
  const keys = Object.keys(expected);
  if (keys.length === 0) return { score: 0, max: 0 };
  let score = 0;
  for (const k of keys) {
    const expectedAnswers = toCandidateStrings(expected[k]).map((value) => normalizeText(value)).filter(Boolean);
    const actualAnswers = toCandidateStrings(actual?.[k]).map((value) => normalizeText(value)).filter(Boolean);
    if (expectedAnswers.length > 0 && actualAnswers.some((actualNorm) => expectedAnswers.includes(actualNorm))) score += 1;
  }
  return { score, max: keys.length };
};

const scoreTokenMap = (
  expected: Record<string, unknown>,
  actual: Record<string, unknown> | null,
  normalizer: (raw: string) => string,
): UnitScore => {
  const keys = Object.keys(expected);
  if (keys.length === 0) return { score: 0, max: 0 };
  let score = 0;
  for (const key of keys) {
    const expectedToken = firstNormalized(expected[key], normalizer);
    const actualTokens = toCandidateStrings(actual?.[key]).map((entry) => normalizer(entry)).filter(Boolean);
    if (expectedToken && actualTokens.includes(expectedToken)) score += 1;
  }
  return { score, max: keys.length };
};

const scoreUnit = (unitType: string, correct: any, responseData: any): UnitScore => {
  if (!correct) return { score: 0, max: 0 };

  if (unitType === "question_single_choice") {
    const expected = normalizeChoiceToken(String(correct.option_id ?? ""));
    const actualRaw =
      typeof responseData === "string"
        ? responseData
        : String(responseData?.selected_option ?? responseData?.option_id ?? "");
    const actual = normalizeChoiceToken(actualRaw);
    return { score: expected !== "" && actual === expected ? 1 : 0, max: expected !== "" ? 1 : 0 };
  }

  if (unitType === "question_multi_choice") {
    const expected: string[] = Array.isArray(correct.option_ids) ? correct.option_ids.map((entry: unknown) => normalizeChoiceToken(String(entry))).filter(Boolean) : [];
    const actual: string[] = Array.isArray(responseData)
      ? responseData.map((entry: unknown) => normalizeChoiceToken(String(entry))).filter(Boolean)
      : Array.isArray(responseData?.selected_options)
        ? responseData.selected_options.map((entry: unknown) => normalizeChoiceToken(String(entry))).filter(Boolean)
        : [];
    return { score: expected.length > 0 && arraysEqualAsSets(expected, actual) ? 1 : 0, max: expected.length > 0 ? 1 : 0 };
  }

  if (unitType === "question_text") {
    const expected: string[] = Array.isArray(correct.answers) ? correct.answers.map((entry: unknown) => String(entry)) : [];
    const actualRaw =
      typeof responseData === "string" ? responseData : String(responseData?.text ?? responseData?.answer ?? "");
    const actual = normalizeText(actualRaw);
    const ok = expected.some((e) => normalizeText(e) === actual);
    return { score: ok ? 1 : 0, max: expected.length > 0 ? 1 : 0 };
  }

  if (
    unitType === "question_matching" ||
    unitType === "question_matching_headings" ||
    unitType === "question_sentence_endings"
  ) {
    const expected = correct.matches && typeof correct.matches === "object" ? (correct.matches as Record<string, unknown>) : null;
    const actualSource =
      responseData && typeof responseData === "object" && (responseData as any).matches && typeof (responseData as any).matches === "object"
        ? (responseData as any).matches
        : responseData;
    const actual = actualSource && typeof actualSource === "object" ? (actualSource as Record<string, unknown>) : null;
    if (!expected) return { score: 0, max: 0 };
    return scoreTokenMap(expected, actual, normalizeChoiceToken);
  }

  if (unitType === "question_true_false_not_given") {
    const expected = correct.matches && typeof correct.matches === "object" ? (correct.matches as Record<string, unknown>) : null;
    const actualSource =
      responseData && typeof responseData === "object" && (responseData as any).matches && typeof (responseData as any).matches === "object"
        ? (responseData as any).matches
        : responseData;
    const actual = actualSource && typeof actualSource === "object" ? (actualSource as Record<string, unknown>) : null;
    if (!expected) return { score: 0, max: 0 };
    return scoreTokenMap(expected, actual, normalizeTfngToken);
  }

  if (unitType === "question_yes_no_not_given") {
    const expected = correct.matches && typeof correct.matches === "object" ? (correct.matches as Record<string, unknown>) : null;
    const actualSource =
      responseData && typeof responseData === "object" && (responseData as any).matches && typeof (responseData as any).matches === "object"
        ? (responseData as any).matches
        : responseData;
    const actual = actualSource && typeof actualSource === "object" ? (actualSource as Record<string, unknown>) : null;
    if (!expected) return { score: 0, max: 0 };
    return scoreTokenMap(expected, actual, normalizeYnngToken);
  }

  if (unitType === "question_gap_fill" || unitType === "question_select_from_list") {
    const expected = correct.blanks && typeof correct.blanks === "object" ? (correct.blanks as Record<string, unknown>) : null;
    const actualSource =
      responseData && typeof responseData === "object" && (responseData as any).blanks && typeof (responseData as any).blanks === "object"
        ? (responseData as any).blanks
        : responseData;
    const actual = actualSource && typeof actualSource === "object" ? (actualSource as Record<string, unknown>) : null;
    if (!expected) return { score: 0, max: 0 };
    return unitType === "question_select_from_list"
      ? scoreTokenMap(expected, actual, normalizeChoiceToken)
      : scoreTextMap(expected, actual);
  }

  if (unitType === "question_table_completion") {
    const expected = correct.cells && typeof correct.cells === "object" ? (correct.cells as Record<string, unknown>) : null;
    const actualSource =
      responseData && typeof responseData === "object" && (responseData as any).cells && typeof (responseData as any).cells === "object"
        ? (responseData as any).cells
        : responseData;
    const actual = actualSource && typeof actualSource === "object" ? (actualSource as Record<string, unknown>) : null;
    if (!expected) return { score: 0, max: 0 };
    return scoreTextMap(expected, actual);
  }

  if (unitType === "question_diagram_labeling") {
    const expected = correct.labels && typeof correct.labels === "object" ? (correct.labels as Record<string, unknown>) : null;
    const actualSource =
      responseData && typeof responseData === "object" && (responseData as any).labels && typeof (responseData as any).labels === "object"
        ? (responseData as any).labels
        : responseData;
    const actual = actualSource && typeof actualSource === "object" ? (actualSource as Record<string, unknown>) : null;
    if (!expected) return { score: 0, max: 0 };
    return scoreTextMap(expected, actual);
  }

  if (unitType === "question_drag_drop") {
    const expected = correct.targets && typeof correct.targets === "object" ? (correct.targets as Record<string, unknown>) : null;
    const actualSource =
      responseData && typeof responseData === "object" && (responseData as any).targets && typeof (responseData as any).targets === "object"
        ? (responseData as any).targets
        : responseData;
    const actual = actualSource && typeof actualSource === "object" ? (actualSource as Record<string, unknown>) : null;
    if (!expected) return { score: 0, max: 0 };
    return scoreTokenMap(expected, actual, normalizeChoiceToken);
  }

  // TOEFL 2026 unit types only (Complete the Words, Build a Sentence); null for every other type.
  const toefl2026Score = scoreToefl2026Unit(unitType, correct, responseData);
  if (toefl2026Score) return toefl2026Score;

  return { score: 0, max: 0 };
};

const buildSkillBreakdown = (
  sectionScores: Record<string, { type?: string; raw_score?: number; max_score?: number; scaled_score_40?: number; scaled_score_800?: number | null; band?: number | null }>,
): Record<string, unknown> => {
  const bucket = new Map<
    string,
    {
      raw: number;
      max: number;
      scaled40Total: number;
      scaled40Count: number;
      scaled800Total: number;
      scaled800Count: number;
      bandTotal: number;
      bandCount: number;
      sectionIds: string[];
    }
  >();

  for (const [sectionId, section] of Object.entries(sectionScores)) {
    const skill = String(section.type ?? "unknown").trim() || "unknown";
    const entry = bucket.get(skill) ?? {
      raw: 0,
      max: 0,
      scaled40Total: 0,
      scaled40Count: 0,
      scaled800Total: 0,
      scaled800Count: 0,
      bandTotal: 0,
      bandCount: 0,
      sectionIds: [],
    };

    const raw = Number(section.raw_score ?? 0);
    const max = Number(section.max_score ?? 0);
    const scaled40 = Number(section.scaled_score_40 ?? NaN);
    const scaled800 = Number(section.scaled_score_800 ?? NaN);
    const band = Number(section.band ?? NaN);

    if (Number.isFinite(raw)) entry.raw += raw;
    if (Number.isFinite(max)) entry.max += max;
    if (Number.isFinite(scaled40)) {
      entry.scaled40Total += scaled40;
      entry.scaled40Count += 1;
    }
    if (Number.isFinite(scaled800)) {
      entry.scaled800Total += scaled800;
      entry.scaled800Count += 1;
    }
    if (Number.isFinite(band)) {
      entry.bandTotal += band;
      entry.bandCount += 1;
    }

    entry.sectionIds.push(sectionId);
    bucket.set(skill, entry);
  }

  const out: Record<string, unknown> = {};
  for (const [skill, entry] of bucket.entries()) {
    const ratio = entry.max > 0 ? roundNumber(entry.raw / entry.max, 4) : null;
    out[skill] = {
      raw_score: entry.raw,
      max_score: entry.max,
      ratio,
      scaled_score_40: entry.scaled40Count > 0 ? Math.round(entry.scaled40Total / entry.scaled40Count) : null,
      scaled_score_800: entry.scaled800Count > 0 ? Math.round(entry.scaled800Total / entry.scaled800Count) : null,
      band: entry.bandCount > 0 ? roundNumber(entry.bandTotal / entry.bandCount, 1) : null,
      section_ids: entry.sectionIds,
    };
  }
  return out;
};

const buildLanguageSignalsFromSkillBreakdown = (
  skillBreakdown: Record<string, unknown>,
  occurredAt: string,
): Array<{
  source_type: string;
  skill_key: string;
  metric_key: string;
  metric_value: number;
  confidence: number;
  occurred_at: string;
  payload: Record<string, unknown>;
}> => {
  const signals: Array<{
    source_type: string;
    skill_key: string;
    metric_key: string;
    metric_value: number;
    confidence: number;
    occurred_at: string;
    payload: Record<string, unknown>;
  }> = [];

  const addSignal = (skillKey: string, metricKey: string, rawValue: unknown) => {
    const value = typeof rawValue === "number" ? rawValue : Number(rawValue);
    if (!Number.isFinite(value)) return;
    signals.push({
      source_type: "score-session.auto",
      skill_key: skillKey,
      metric_key: metricKey,
      metric_value: roundNumber(value, 4),
      confidence: 1,
      occurred_at: occurredAt,
      payload: { from: "skill_breakdown" },
    });
  };

  for (const [rawSkill, rawValue] of Object.entries(skillBreakdown)) {
    if (!rawValue || typeof rawValue !== "object" || Array.isArray(rawValue)) continue;
    const skill = String(rawSkill ?? "").trim().toLowerCase();
    if (!skill) continue;
    const value = rawValue as Record<string, unknown>;
    addSignal(skill, "ratio", value.ratio);
    addSignal(skill, "scaled_score_40", value.scaled_score_40);
    addSignal(skill, "scaled_score_800", value.scaled_score_800);
    addSignal(skill, "band", value.band);
  }

  return signals;
};

const computeOverallScore = (
  sectionValues: Array<{ raw_score: number; max_score: number }>,
  overallBand: number | null,
  sat: { total_score: number | null } | null,
  toefl: { rlw_composite_score: number | null } | null,
): number | null => {
  if (sat?.total_score != null) return sat.total_score;
  if (toefl?.rlw_composite_score != null) return toefl.rlw_composite_score;
  if (overallBand != null) return overallBand;
  const totalRaw = sectionValues.reduce((sum, section) => sum + Number(section.raw_score ?? 0), 0);
  const totalMax = sectionValues.reduce((sum, section) => sum + Number(section.max_score ?? 0), 0);
  if (totalMax <= 0) return null;
  return roundNumber((totalRaw / totalMax) * 100, 1);
};

serve(async (req) => {
  const requestId = requestIdFrom(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: withRequestIdHeader(corsHeaders, requestId) });

  if (req.method !== "POST") {
    logOpsEvent("warn", opsDomain, "method_not_allowed", {
      request_id: requestId,
      method: req.method,
    });
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: jsonHeaders(requestId),
    });
  }

  try {
    const supabaseUrl = getEnv("SUPABASE_URL");
    const supabaseServiceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
    logOpsEvent("info", opsDomain, "request_started", {
      request_id: requestId,
    });

    const token = getBearerToken(req);
    if (!token) {
      logOpsEvent("warn", opsDomain, "missing_token", { request_id: requestId });
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: jsonHeaders(requestId),
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData?.user) {
      logOpsEvent("warn", opsDomain, "auth_failed", {
        request_id: requestId,
        error: authError?.message ?? null,
      });
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: jsonHeaders(requestId),
      });
    }

    const authedUserId = authData.user.id;
    const { data: userRow } = await supabase.from("users").select("role").eq("id", authedUserId).maybeSingle();
    const isAdmin = String((userRow as any)?.role ?? "").toLowerCase().startsWith("admin");
    const body = (await req.json()) as ScoreSessionInput;
    const sessionId = body.session_id;
    if (!sessionId) {
      logOpsEvent("warn", opsDomain, "invalid_input", {
        request_id: requestId,
        reason: "missing_session_id",
      });
      return new Response(JSON.stringify({ error: "session_id is required" }), {
        status: 400,
        headers: jsonHeaders(requestId),
      });
    }

    const { data: sessionRow, error: sessionError } = await supabase
      .from("sessions")
      .select("id, user_id, experience_id, status, metadata, token_id")
      .eq("id", sessionId)
      .maybeSingle();

    if (sessionError) {
      return new Response(JSON.stringify({ error: "Failed to load session", details: sessionError }), {
        status: 500,
        headers: jsonHeaders(requestId),
      });
    }

    if (!sessionRow) {
      return new Response(JSON.stringify({ error: "Session not found" }), {
        status: 404,
        headers: jsonHeaders(requestId),
      });
    }

    if (sessionRow.user_id !== authedUserId && !isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: jsonHeaders(requestId),
      });
    }

    const sessionStatus = String((sessionRow as any)?.status ?? "").toLowerCase();
    if (sessionStatus !== "completed") {
      return new Response(JSON.stringify({ error: "Session is not completed" }), {
        status: 409,
        headers: jsonHeaders(requestId),
      });
    }

    const experienceId = sessionRow.experience_id as string;
    const { data: experienceRow, error: experienceError } = await supabase
      .from("experiences")
      .select("id, product_id, metadata")
      .eq("id", experienceId)
      .maybeSingle();

    if (experienceError) {
      return new Response(JSON.stringify({ error: "Failed to load experience", details: experienceError }), {
        status: 500,
        headers: jsonHeaders(requestId),
      });
    }

    if (!experienceRow?.product_id) {
      return new Response(JSON.stringify({ error: "Experience product not found" }), {
        status: 404,
        headers: jsonHeaders(requestId),
      });
    }

    const { data: productRow, error: productError } = await supabase
      .from("products")
      .select("id, name, metadata")
      .eq("id", String(experienceRow.product_id))
      .maybeSingle();

    if (productError) {
      return new Response(JSON.stringify({ error: "Failed to load product", details: productError }), {
        status: 500,
        headers: jsonHeaders(requestId),
      });
    }

    const productSlug = String((productRow as any)?.metadata?.slug ?? "")
      .trim()
      .toLowerCase();
    const isToeflProduct =
      productSlug === "toefl-ibt-simulator" ||
      String(experienceRow.product_id) === "b262ffa8-9912-4eba-93d7-58af3164d1cc";
    const isItepProduct =
      productSlug === "itep-simulator" ||
      String(experienceRow.product_id) === "a6c7887c-633c-4d88-8b70-397ed04dbbb1";
    const experienceMetadata = ((experienceRow as any)?.metadata ?? {}) as Json;

    const allowedSectionIdsRaw = (sessionRow as any)?.metadata?.allowed_section_ids;
    const allowedSectionIds =
      Array.isArray(allowedSectionIdsRaw) && allowedSectionIdsRaw.length > 0 ? allowedSectionIdsRaw.map(String) : null;

    const { data: sections, error: sectionsError } = await supabase
      .from("sections")
      .select("id, display_order, metadata")
      .eq("experience_id", experienceId)
      .order("display_order", { ascending: true });

    if (sectionsError) {
      return new Response(JSON.stringify({ error: "Failed to load sections", details: sectionsError }), {
        status: 500,
        headers: jsonHeaders(requestId),
      });
    }

    let sectionRows = (sections ?? []) as SectionRow[];
    if (allowedSectionIds) sectionRows = sectionRows.filter((s) => allowedSectionIds.includes(s.id));
    const sectionIds = sectionRows.map((s) => s.id);

    const { data: parts, error: partsError } = await supabase
      .from("parts")
      .select("id, section_id")
      .in("section_id", sectionIds);

    if (partsError) {
      return new Response(JSON.stringify({ error: "Failed to load parts", details: partsError }), {
        status: 500,
        headers: jsonHeaders(requestId),
      });
    }

    const partRows = (parts ?? []) as PartRow[];
    const partIds = partRows.map((p) => p.id);
    const partIdToSectionId = new Map(partRows.map((p) => [p.id, p.section_id]));

    const { data: units, error: unitsError } = await supabase
      .from("content_units")
      .select("id, part_id, type")
      .in("part_id", partIds);

    if (unitsError) {
      return new Response(JSON.stringify({ error: "Failed to load content units", details: unitsError }), {
        status: 500,
        headers: jsonHeaders(requestId),
      });
    }

    const unitRows = (units ?? []) as ContentUnitRow[];
    const unitById = new Map(unitRows.map((u) => [u.id, u]));
    const unitIds = unitRows.map((u) => u.id);

    const { data: keys, error: keysError } = await supabase
      .from("answer_keys")
      .select("content_unit_id, correct")
      .in("content_unit_id", unitIds);

    if (keysError) {
      return new Response(JSON.stringify({ error: "Failed to load answer keys", details: keysError }), {
        status: 500,
        headers: jsonHeaders(requestId),
      });
    }

    const keyRows = (keys ?? []) as AnswerKeyRow[];
    const keyByUnitId = new Map(keyRows.map((k) => [k.content_unit_id, k]));

    const { data: responses, error: responsesError } = await supabase
      .from("responses")
      .select("content_unit_id, data, submitted_at")
      .eq("session_id", sessionId)
      .order("submitted_at", { ascending: true });

    if (responsesError) {
      return new Response(JSON.stringify({ error: "Failed to load responses", details: responsesError }), {
        status: 500,
        headers: jsonHeaders(requestId),
      });
    }

    const responseRows = (responses ?? []) as ResponseRow[];
    const latestResponseByUnitId = new Map<string, any>();
    for (const r of responseRows) latestResponseByUnitId.set(r.content_unit_id, r.data);

    let writingEvaluationRows: Array<{ method: string; result: unknown }> = [];
    if (isToeflProduct || isItepProduct) {
      const { data: evaluations } = await supabase
        .from("evaluations")
        .select("method, result, evaluated_at")
        .eq("session_id", sessionId)
        .order("evaluated_at", { ascending: false });
      writingEvaluationRows = (evaluations ?? []) as Array<{ method: string; result: unknown }>;
    }

    const preferredWritingEval =
      writingEvaluationRows.find((row) => ["admin", "manual"].includes(String(row.method ?? "").toLowerCase())) ??
      writingEvaluationRows.find((row) => String(row.method ?? "").toLowerCase() === "ai") ??
      null;

    const sectionScores: Record<string, any> = {};
    const bands: number[] = [];

    for (const s of sectionRows) {
      const type = String((s.metadata as any)?.type ?? "unknown");

      // Collect scorable unit ids in this section
      const scorableUnitIds: string[] = [];
      for (const u of unitRows) {
        const sectionId = partIdToSectionId.get(u.part_id);
        if (sectionId !== s.id) continue;
        if (!keyByUnitId.has(u.id)) continue;
        scorableUnitIds.push(u.id);
      }

      let raw = 0;
      let max = 0;

      for (const unitId of scorableUnitIds) {
        const unit = unitById.get(unitId);
        const key = keyByUnitId.get(unitId);
        const resp = latestResponseByUnitId.get(unitId);
        if (!unit || !key) continue;
        const { score, max: unitMax } = scoreUnit(unit.type, key.correct, resp);
        raw += score;
        max += unitMax;
      }

      const scaled40 = max > 0 ? (raw / max) * 40 : 0;
      const scaled30 =
        max > 0 && (type === "reading" || type === "listening" || type === "writing")
          ? toToeflScaledScore(raw / max)
          : null;
      const scaled800 =
        max > 0 && (type === "reading_writing" || type === "math")
          ? toSatScaledScore(raw / max)
          : null;
      const scaled6 =
        isItepProduct && (type === "reading" || type === "listening" || type === "grammar")
          ? resolveItepObjectiveScore(type, raw, max, s.metadata, experienceMetadata)
          : null;
      const band =
        scaled6 ??
        (max > 0 && (type === "listening" || type === "reading") ? bandFromScaled40(type, scaled40) : null);

      if (typeof band === "number") bands.push(band);

      sectionScores[s.id] = {
        type,
        raw_score: raw,
        max_score: max,
        scaled_score_40: Math.round(scaled40),
        scaled_score_30: scaled30,
        scaled_score_800: scaled800,
        scaled_score_6: scaled6,
        band,
      };
    }

    let overallBand =
      bands.length > 0
        ? isItepProduct
          ? roundNumber(bands.reduce((a, b) => a + b, 0) / bands.length, 1)
          : toHalfBand(bands.reduce((a, b) => a + b, 0) / bands.length)
        : null;

    const baseSectionValues = Object.values(sectionScores) as Array<{
      type: string;
      raw_score: number;
      max_score: number;
      scaled_score_40: number;
      scaled_score_30?: number | null;
      scaled_score_800?: number | null;
      scaled_score_6?: number | null;
      band: number | null;
    }>;

    const rw = baseSectionValues.filter((section) => section.type === "reading_writing");
    const math = baseSectionValues.filter((section) => section.type === "math");
    const rwMax = rw.reduce((sum, section) => sum + section.max_score, 0);
    const rwRaw = rw.reduce((sum, section) => sum + section.raw_score, 0);
    const mathMax = math.reduce((sum, section) => sum + section.max_score, 0);
    const mathRaw = math.reduce((sum, section) => sum + section.raw_score, 0);

    const rwScore = rwMax > 0 ? toSatScaledScore(rwRaw / rwMax) : null;
    const mathScore = mathMax > 0 ? toSatScaledScore(mathRaw / mathMax) : null;
    const satTotal = rwScore != null && mathScore != null ? rwScore + mathScore : null;
    const sat =
      rw.length > 0 || math.length > 0
        ? {
            reading_writing_score: rwScore,
            math_score: mathScore,
            total_score: satTotal,
            score_version: "sat-estimate-v1",
            is_estimated: true,
          }
        : null;

    const reading = baseSectionValues.filter((section) => section.type === "reading");
    const listening = baseSectionValues.filter((section) => section.type === "listening");
    const writing = baseSectionValues.filter((section) => section.type === "writing");
    const readingMax = reading.reduce((sum, section) => sum + section.max_score, 0);
    const readingRaw = reading.reduce((sum, section) => sum + section.raw_score, 0);
    const listeningMax = listening.reduce((sum, section) => sum + section.max_score, 0);
    const listeningRaw = listening.reduce((sum, section) => sum + section.raw_score, 0);
    const writingMax = writing.reduce((sum, section) => sum + section.max_score, 0);
    const writingRaw = writing.reduce((sum, section) => sum + section.raw_score, 0);

    const readingScore = readingMax > 0 ? toToeflScaledScore(readingRaw / readingMax) : null;
    const listeningScore = listeningMax > 0 ? toToeflScaledScore(listeningRaw / listeningMax) : null;

    let writingScore = writingMax > 0 ? toToeflScaledScore(writingRaw / writingMax) : null;

    if (isToeflProduct && writingScore == null) {
      const aiResult = preferredWritingEval?.result ?? null;
      const aiWritingScore = Number((aiResult as any)?.writing_score ?? NaN);
      if (Number.isFinite(aiWritingScore)) {
        writingScore = Math.max(0, Math.min(30, Math.round(aiWritingScore)));
      } else {
        const aiBand = Number((aiResult as any)?.overall_band ?? NaN);
        if (Number.isFinite(aiBand)) {
          writingScore = toToeflScaledScore(Math.max(0, Math.min(9, aiBand)) / 9);
        }
      }
    }

    const rlwComposite =
      readingScore != null && listeningScore != null && writingScore != null
        ? readingScore + listeningScore + writingScore
        : null;

    const toefl = isToeflProduct
      ? {
          reading_score: readingScore,
          listening_score: listeningScore,
          writing_score: writingScore,
          rlw_composite_score: rlwComposite,
          score_version: "toefl-rlw-estimate-v1",
          is_estimated: true,
          speaking_available: false,
        }
      : null;

    // TOEFL iBT 2026 format (experience metadata format "toefl-2026"): 1-6 bands,
    // adaptive module filtering and constructed-response scores. Other exams and
    // pre-2026 TOEFL tests never enter this branch, so `toeflOut === toefl` for them.
    let toeflOut: Record<string, unknown> | null = toefl;
    if (isToeflProduct && isToefl2026Experience(experienceMetadata)) {
      const toefl2026 = await computeToefl2026Session(supabase, {
        sessionId,
        sessionMetadata: ((sessionRow as any)?.metadata ?? {}) as Json,
        experienceMetadata,
        sectionRows,
        unitRows,
        partIdToSectionId,
        keyByUnitId,
        latestResponseByUnitId,
        scoreUnit,
        writingEvaluationResult: preferredWritingEval?.result ?? null,
      });
      applyToefl2026ToSections(sectionScores, toefl2026);
      overallBand = toefl2026.result.overall_band;
      toeflOut = toefl2026Summary(toefl2026.result);
    }

    let itep: {
      reading_score: number | null;
      listening_score: number | null;
      grammar_score: number | null;
      writing_score: number | null;
      composite_score: number | null;
      score_version: string;
      is_estimated: boolean;
      speaking_available: boolean;
      visible_scored_sections: string[];
    } | null = null;

    if (isItepProduct) {
      const grammar = baseSectionValues.filter((section) => section.type === "grammar");
      const readingScore6 = averageNumbers(
        reading.map((section) => asFinite((section as any).scaled_score_6 ?? section.band)).filter((value): value is number => value != null),
      );
      const listeningScore6 = averageNumbers(
        listening
          .map((section) => asFinite((section as any).scaled_score_6 ?? section.band))
          .filter((value): value is number => value != null),
      );
      const grammarScore6 = averageNumbers(
        grammar.map((section) => asFinite((section as any).scaled_score_6 ?? section.band)).filter((value): value is number => value != null),
      );
      const writingScore6 = preferredWritingEval ? extractWritingEvaluationScore(preferredWritingEval.result) : null;

      if (writingScore6 != null) {
        for (const [sectionId, section] of Object.entries(sectionScores)) {
          if (String((section as any)?.type ?? "") !== "writing") continue;
          (section as any).scaled_score_6 = writingScore6;
          (section as any).band = writingScore6;
        }
      }

      const visibleScores = [
        { type: "reading", score: readingScore6 },
        { type: "listening", score: listeningScore6 },
        { type: "grammar", score: grammarScore6 },
        { type: "writing", score: writingScore6 },
      ].filter((entry) => entry.score != null) as Array<{ type: string; score: number }>;

      const compositeScore = averageNumbers(visibleScores.map((entry) => entry.score));
      overallBand = compositeScore != null ? roundNumber(compositeScore, 1) : overallBand;

      itep = {
        reading_score: readingScore6 != null ? roundNumber(readingScore6, 1) : null,
        listening_score: listeningScore6 != null ? roundNumber(listeningScore6, 1) : null,
        grammar_score: grammarScore6 != null ? roundNumber(grammarScore6, 1) : null,
        writing_score: writingScore6 != null ? roundNumber(writingScore6, 1) : null,
        composite_score: overallBand,
        score_version: "itep-estimate-v1",
        is_estimated: true,
        speaking_available: false,
        visible_scored_sections: visibleScores.map((entry) => entry.type),
      };
    }

    const sectionValues = Object.values(sectionScores) as Array<{
      type: string;
      raw_score: number;
      max_score: number;
      scaled_score_40: number;
      scaled_score_30?: number | null;
      scaled_score_800?: number | null;
      scaled_score_6?: number | null;
      band: number | null;
    }>;
    const skillBreakdown = buildSkillBreakdown(sectionScores);
    const overallScore = isItepProduct
      ? (itep?.composite_score ?? overallBand)
      : computeOverallScore(sectionValues, overallBand, sat, toeflOut as { rlw_composite_score: number | null } | null);
    const schemaVersion = "exam.result.v1";
    const computedAtIso = new Date().toISOString();

    const result = {
      session_id: sessionId,
      computed_at: computedAtIso,
      overall_band: overallBand,
      overall_score: overallScore,
      sections: sectionScores,
      sat,
      toefl: toeflOut,
      itep,
    };

    const nowIso = new Date().toISOString();
    const { data: evalRow, error: evalError } = await supabase
      .from("evaluations")
      .upsert(
        {
          session_id: sessionId,
          method: "auto",
          status: "completed",
          result,
          evaluated_at: nowIso,
        },
        { onConflict: "session_id,method" },
      )
      .select("*")
      .maybeSingle();

    if (evalError) {
      return new Response(JSON.stringify({ error: "Failed to write evaluation", details: evalError }), {
        status: 500,
        headers: jsonHeaders(requestId),
      });
    }

    const persistenceWarnings: string[] = [];
    try {
      const { error: outcomeError } = await supabase.from("exam_outcomes").upsert(
        {
          session_id: sessionId,
          user_id: authedUserId,
          product_id: String(experienceRow.product_id),
          experience_id: experienceId,
          score_method: "auto",
          status: "completed",
          schema_version: schemaVersion,
          overall_score: overallScore,
          overall_band: overallBand,
          section_scores: sectionScores,
          skill_breakdown: skillBreakdown,
          raw_result: result,
          computed_at: computedAtIso,
        },
        { onConflict: "session_id" },
      );
      if (outcomeError) {
        logOpsEvent("warn", opsDomain, "exam_outcomes_sync_failed", {
          request_id: requestId,
          session_id: sessionId,
          user_id: authedUserId,
          product_id: String(experienceRow.product_id),
          error: outcomeError?.message ?? outcomeError,
        });
        emitOpsAlert({
          domain: opsDomain,
          event: "exam_outcomes_sync_failed",
          severity: "warn",
          detail: {
            request_id: requestId,
            session_id: sessionId,
            user_id: authedUserId,
            product_id: String(experienceRow.product_id),
            error: outcomeError?.message ?? String(outcomeError),
          },
        });
        persistenceWarnings.push("exam_outcomes sync failed");
      }
    } catch (err) {
      logOpsEvent("warn", opsDomain, "exam_outcomes_sync_exception", {
        request_id: requestId,
        session_id: sessionId,
        user_id: authedUserId,
        product_id: String(experienceRow.product_id),
        error: err instanceof Error ? err.message : String(err),
      });
      emitOpsAlert({
        domain: opsDomain,
        event: "exam_outcomes_sync_failed",
        severity: "warn",
        detail: {
          request_id: requestId,
          session_id: sessionId,
          user_id: authedUserId,
          product_id: String(experienceRow.product_id),
          error: err instanceof Error ? err.message : String(err),
        },
      });
      persistenceWarnings.push("exam_outcomes sync failed");
    }

    try {
      const outboxPayload = {
        schema: schemaVersion,
        session_id: sessionId,
        user_id: authedUserId,
        product_id: String(experienceRow.product_id),
        experience_id: experienceId,
        method: "auto",
        status: "completed",
        computed_at: computedAtIso,
        overall: {
          score: overallScore,
          band: overallBand,
          sat_total: sat?.total_score ?? null,
          toefl_rlw_composite: (toeflOut as { rlw_composite_score?: number | null } | null)?.rlw_composite_score ?? null,
        },
        skill_breakdown: skillBreakdown,
        sections: sectionScores,
      };

      const { error: outboxError } = await supabase.from("domain_event_outbox").upsert(
        {
          event_type: "exam.result",
          event_version: "v1",
          aggregate_type: "session",
          aggregate_id: sessionId,
          user_id: authedUserId,
          occurred_at: computedAtIso,
          payload: outboxPayload,
          status: "pending",
          idempotency_key: `${schemaVersion}:${sessionId}`,
        },
        { onConflict: "idempotency_key" },
      );
      if (outboxError) {
        logOpsEvent("error", opsDomain, "domain_event_outbox_enqueue_failed", {
          request_id: requestId,
          session_id: sessionId,
          user_id: authedUserId,
          product_id: String(experienceRow.product_id),
          error: outboxError?.message ?? outboxError,
        });
        emitOpsAlert({
          domain: opsDomain,
          event: "domain_event_outbox_enqueue_failed",
          severity: "error",
          detail: {
            request_id: requestId,
            session_id: sessionId,
            user_id: authedUserId,
            product_id: String(experienceRow.product_id),
            error: outboxError?.message ?? String(outboxError),
          },
        });
        persistenceWarnings.push("domain_event_outbox enqueue failed");
      }

      const languageSignals = buildLanguageSignalsFromSkillBreakdown(skillBreakdown, computedAtIso);
      if (languageSignals.length > 0) {
        const languageSignalPayload = {
          schema_version: "language.signal.v1",
          source: "score-session-v2",
          user_id: authedUserId,
          product_id: String(experienceRow.product_id),
          session_id: sessionId,
          source_type: "score-session.auto",
          occurred_at: computedAtIso,
          signals: languageSignals,
        };
        const { error: languageSignalOutboxError } = await supabase.from("domain_event_outbox").upsert(
          {
            event_type: "language.signal.v1",
            event_version: "v1",
            aggregate_type: "session",
            aggregate_id: sessionId,
            user_id: authedUserId,
            occurred_at: computedAtIso,
            payload: languageSignalPayload,
            status: "pending",
            idempotency_key: `language.signal.v1:${sessionId}:score-session.auto`,
          },
          { onConflict: "idempotency_key" },
        );

        if (languageSignalOutboxError) {
          logOpsEvent("warn", opsDomain, "language_signal_outbox_enqueue_failed", {
            request_id: requestId,
            session_id: sessionId,
            user_id: authedUserId,
            product_id: String(experienceRow.product_id),
            error: languageSignalOutboxError?.message ?? languageSignalOutboxError,
          });
          persistenceWarnings.push("language signal outbox enqueue failed");
        }
      }
    } catch (err) {
      logOpsEvent("error", opsDomain, "domain_event_outbox_enqueue_exception", {
        request_id: requestId,
        session_id: sessionId,
        user_id: authedUserId,
        product_id: String(experienceRow.product_id),
        error: err instanceof Error ? err.message : String(err),
      });
      emitOpsAlert({
        domain: opsDomain,
        event: "domain_event_outbox_enqueue_failed",
        severity: "error",
        detail: {
          request_id: requestId,
          session_id: sessionId,
          user_id: authedUserId,
          product_id: String(experienceRow.product_id),
          error: err instanceof Error ? err.message : String(err),
        },
      });
      persistenceWarnings.push("domain_event_outbox enqueue failed");
    }

    logOpsEvent("info", opsDomain, "request_completed", {
      request_id: requestId,
      session_id: sessionId,
      user_id: authedUserId,
      product_id: String(experienceRow.product_id),
      warnings: persistenceWarnings.length,
    });

    return new Response(
      JSON.stringify({
        evaluation: evalRow,
        result,
        outcome_sync: {
          ok: persistenceWarnings.length === 0,
          warnings: persistenceWarnings,
        },
        session: {
          id: sessionRow.id,
          status: sessionRow.status,
          metadata: sessionRow.metadata ?? {},
          token_id: (sessionRow as any).token_id ?? null,
        },
      }),
      {
        status: 200,
        headers: jsonHeaders(requestId),
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logOpsEvent("error", opsDomain, "request_failed", {
      request_id: requestId,
      error: message,
    });
    emitOpsAlert({
      domain: opsDomain,
      event: "request_failed",
      severity: "error",
      detail: {
        request_id: requestId,
        error: message,
      },
    });
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: jsonHeaders(requestId),
    });
  }
});
