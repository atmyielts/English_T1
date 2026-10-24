// Loads what the TOEFL 2026 scorer needs for one session and applies the
// result to the shared score-session output. Used only when the experience
// metadata says `format: "toefl-2026"`; every other exam keeps the existing
// score-session code path untouched.

import {
  buildToefl2026Result,
  type ConstructedScore,
  sectionKind,
  sectionModule,
  TOEFL_2026_FORMAT,
  TOEFL_2026_SCORE_VERSION,
  type Toefl2026Result,
  type Toefl2026UnitInput,
  tierFromExamState as tierFromExamStateValue,
  unitVisibleForTier,
} from "./toefl-2026.ts";

type Json = Record<string, unknown>;
type UnitScore = { score: number; max: number };

const isRecord = (value: unknown): value is Json => !!value && typeof value === "object" && !Array.isArray(value);
const finite = (value: unknown): number | null => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
};

export const isToefl2026Experience = (metadata: unknown): boolean =>
  isRecord(metadata) && String(metadata.format ?? "").trim().toLowerCase() === TOEFL_2026_FORMAT;

/** Pulls `{content_unit_id, score}` pairs (0-5) from a writing or speaking evaluation result. */
export const constructedScoresFrom = (result: unknown, listKey: "tasks" | "items"): ConstructedScore[] | null => {
  if (!isRecord(result)) return null;
  const list = Array.isArray(result[listKey]) ? (result[listKey] as unknown[]) : [];
  const out: ConstructedScore[] = [];
  for (const entry of list) {
    if (!isRecord(entry)) continue;
    const id = typeof entry.content_unit_id === "string" ? entry.content_unit_id : "";
    if (!id) continue;
    const score = finite(entry.score) ?? finite(entry.band);
    out.push({ content_unit_id: id, score: score == null ? null : Math.max(0, Math.min(5, score)) });
  }
  return out;
};

export type Toefl2026SessionComputation = {
  result: Toefl2026Result;
  /** Tier-filtered machine points per DB section (for the shared section rows). */
  sectionPoints: Record<string, UnitScore>;
};

export const computeToefl2026Session = async (
  supabase: any,
  input: {
    sessionId: string;
    sessionMetadata: Json;
    experienceMetadata: Json;
    sectionRows: Array<{ id: string; metadata: Json | null }>;
    unitRows: Array<{ id: string; part_id: string; type: string }>;
    partIdToSectionId: Map<string, string>;
    keyByUnitId: Map<string, { correct: unknown }>;
    latestResponseByUnitId: Map<string, unknown>;
    scoreUnit: (unitType: string, correct: any, responseData: any) => UnitScore;
    writingEvaluationResult: unknown;
  },
): Promise<Toefl2026SessionComputation> => {
  const unitIds = input.unitRows.map((u) => u.id);
  const metadataById = new Map<string, Json>();
  if (unitIds.length > 0) {
    const { data } = await supabase.from("content_units").select("id, metadata").in("id", unitIds);
    for (const row of (data ?? []) as Array<{ id: string; metadata: unknown }>) {
      metadataById.set(String(row.id), isRecord(row.metadata) ? row.metadata : {});
    }
  }

  const { data: speakingRows } = await supabase
    .from("evaluations")
    .select("method, result, evaluated_at")
    .eq("session_id", input.sessionId)
    .eq("method", "ai_speaking")
    .order("evaluated_at", { ascending: false })
    .limit(1);
  const speakingResult = Array.isArray(speakingRows) && speakingRows.length > 0 ? (speakingRows[0] as Json).result : null;

  const units: Toefl2026UnitInput[] = [];
  for (const u of input.unitRows) {
    const sectionId = input.partIdToSectionId.get(u.part_id);
    if (!sectionId) continue;
    const metadata = metadataById.get(u.id) ?? {};
    if (typeof metadata.toefl_task !== "string") continue;
    const key = input.keyByUnitId.get(u.id);
    const scored = key ? input.scoreUnit(u.type, key.correct, input.latestResponseByUnitId.get(u.id)) : { score: 0, max: 0 };
    units.push({ id: u.id, section_id: sectionId, type: u.type, metadata, score: scored.score, max: scored.max });
  }

  const allowed = Array.isArray(input.sessionMetadata.allowed_section_ids) && input.sessionMetadata.allowed_section_ids.length > 0;
  const mode = String(input.experienceMetadata.catalog ?? "") === "practice_bank_2026"
    ? "practice"
    : allowed
      ? "section"
      : "full_test";

  const sections = input.sectionRows.map((s) => ({ id: s.id, type: String(s.metadata?.type ?? ""), metadata: s.metadata }));
  const result = buildToefl2026Result({
    sections,
    units,
    routeDecisions: isRecord(input.sessionMetadata.route_decisions) ? input.sessionMetadata.route_decisions : {},
    writing: constructedScoresFrom(input.writingEvaluationResult, "tasks"),
    speaking: constructedScoresFrom(speakingResult, "items"),
    speakingUnscored: isRecord(speakingResult) && Array.isArray(speakingResult.unscored)
      ? (speakingResult.unscored as unknown[]).map(String)
      : [],
    mode,
  });

  const sectionPoints: Record<string, UnitScore> = {};
  for (const s of sections) {
    const kind = sectionKind(s);
    const tier = kind ? result.sections[kind]?.module_path ?? null : null;
    const isSecond = sectionModule(s) === "second";
    let raw = 0;
    let max = 0;
    for (const u of units) {
      if (u.section_id !== s.id) continue;
      if (isSecond && !unitVisibleForTier(u, tier)) continue;
      raw += u.score;
      max += u.max;
    }
    sectionPoints[s.id] = { score: raw, max };
  }
  return { result, sectionPoints };
};

/**
 * Rewrites the shared per-section rows for a 2026 session: tier-filtered
 * machine points and the skill band (router and second module share one band).
 */
export const applyToefl2026ToSections = (
  sectionScores: Record<string, Json>,
  computation: Toefl2026SessionComputation,
): void => {
  for (const [sectionId, row] of Object.entries(sectionScores)) {
    const points = computation.sectionPoints[sectionId];
    if (!points) continue;
    const kind = String(row.type ?? "") as keyof Toefl2026Result["sections"];
    const skill = computation.result.sections[kind] ?? null;
    row.raw_score = points.score;
    row.max_score = points.max;
    row.scaled_score_40 = points.max > 0 ? Math.round((points.score / points.max) * 40) : 0;
    row.scaled_score_30 = null;
    row.band = skill?.band ?? null;
    row.toefl_2026 = { band: skill?.band ?? null, cefr: skill?.cefr ?? null, module_path: skill?.module_path ?? null };
  }
};

/** The `toefl` block of the score-session result for a 2026 session. */
export const toefl2026Summary = (result: Toefl2026Result): Json => ({
  ...result,
  reading_score: null,
  listening_score: null,
  writing_score: null,
  rlw_composite_score: null,
  score_version: TOEFL_2026_SCORE_VERSION,
  is_estimated: true,
  speaking_available: true,
});

/**
 * For review screens: hides second-module units from the tier the learner did
 * not take. Returns an allow-all filter for every non-2026 experience.
 */
export const toefl2026TierFilterFor = async (
  supabase: any,
  sessionId: string,
  experienceMetadata: unknown,
): Promise<(unit: { metadata?: unknown }, sectionId: string | undefined) => boolean> => {
  if (!isToefl2026Experience(experienceMetadata)) return () => true;
  const { data } = await supabase.from("sessions").select("metadata").eq("id", sessionId).maybeSingle();
  const decisions = isRecord(data?.metadata) && isRecord((data.metadata as Json).route_decisions)
    ? ((data.metadata as Json).route_decisions as Json)
    : {};
  return (unit, sectionId) => {
    const meta = isRecord(unit.metadata) ? unit.metadata : {};
    if (meta.difficulty_tier == null || !sectionId) return true;
    const decision = isRecord(decisions[sectionId]) ? (decisions[sectionId] as Json) : null;
    if (!decision) return true;
    return unitVisibleForTier({ metadata: meta }, tierFromExamStateValue(decision.tier));
  };
};
