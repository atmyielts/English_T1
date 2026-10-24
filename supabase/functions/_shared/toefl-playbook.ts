// TOEFL Playbook configuration for the shared exam-playbook engine.
// TOEFL iBT from January 2026: Reading, Listening, Writing, Speaking, each
// reported on a 1–6 band in 0.5 steps; overall = mean of the four rounded to
// 0.5. The legacy 0–30 / 0–120 scale is accepted and shown alongside.
// TOEFL practice lives inside the TOEFL iBT Simulator (no separate product).

import { buildToeflDiagnostic } from "./exam-playbook-diagnostic.ts";
import {
  type ExamPlaybookConfig,
  type JsonRecord,
  PlaybookError,
  isObject,
  parseDateOnly,
  pickEnum,
  pickInt,
  tablesFor,
} from "./exam-playbook.ts";
import {
  TOEFL_SKILLS,
  bandToLegacyTotalRange,
  legacySectionToBand,
  legacyTotalToBand,
  normalizeBand,
} from "./toefl-score-scale.ts";

export const PLAYBOOK_PRODUCT_SLUG = "toefl-playbook";
export const PLAYBOOK_PRODUCT_ID = "f9512c15-ec1c-4fcb-a5ec-a2c6ac3a020e";
export const SIMULATOR_PRODUCT_ID = "b262ffa8-9912-4eba-93d7-58af3164d1cc";

export const TOEFL_BLOCK_TYPES = ["rich_text", "comparison_table", "skill_grid", "faq", "checklist", "resource_cards", "timeline", "cta_strip", "callout", "stat_grid"];

const band = (value: unknown, field: string): number | null => {
  if (value == null || value === "") return null;
  const normalized = normalizeBand(value);
  if (normalized == null) throw new PlaybookError(400, "invalid_field", `${field} must be a band from 1 to 6.`, { field });
  return normalized;
};

const bandsBySkill = (value: unknown, field: string): JsonRecord => {
  if (value == null) return {};
  if (!isObject(value)) throw new PlaybookError(400, "invalid_field", `${field} must be an object.`, { field });
  const out: JsonRecord = {};
  for (const skill of TOEFL_SKILLS) {
    const b = band(value[skill], `${field}.${skill}`);
    if (b != null) out[skill] = b;
  }
  return out;
};

const legacySections = (value: unknown, field: string): JsonRecord => {
  if (value == null) return {};
  if (!isObject(value)) throw new PlaybookError(400, "invalid_field", `${field} must be an object.`, { field });
  const out: JsonRecord = {};
  for (const skill of TOEFL_SKILLS) {
    const score = pickInt(value[skill], 0, 30, `${field}.${skill}`);
    if (score != null) out[skill] = score;
  }
  return out;
};

export const cleanToeflProfilePatch = (patch: JsonRecord, _existing: JsonRecord): JsonRecord => {
  const out: JsonRecord = {};
  if ("score_scale" in patch) out.score_scale = pickEnum(patch.score_scale, ["band_2026", "legacy_120"], "score_scale", false);
  if ("target_band" in patch) out.target_band = band(patch.target_band, "target_band");
  if ("current_band" in patch) out.current_band = band(patch.current_band, "current_band");
  if ("section_target_bands" in patch) out.section_target_bands = bandsBySkill(patch.section_target_bands, "section_target_bands");
  if ("section_current_bands" in patch) out.section_current_bands = bandsBySkill(patch.section_current_bands, "section_current_bands");
  if ("legacy_section_scores" in patch) out.legacy_section_scores = legacySections(patch.legacy_section_scores, "legacy_section_scores");
  if ("target_total_score" in patch) {
    const total = pickInt(patch.target_total_score, 0, 120, "target_total_score");
    if (total != null) out.target_total_score = total;
  }
  if ("current_score_or_estimate" in patch) out.current_score_or_estimate = pickInt(patch.current_score_or_estimate, 0, 120, "current_score_or_estimate");
  if ("deadline_date" in patch) out.deadline_date = parseDateOnly(patch.deadline_date, "deadline_date");
  if ("weakest_section" in patch) out.weakest_section = pickEnum(patch.weakest_section, [...TOEFL_SKILLS], "weakest_section");
  if ("purpose" in patch) out.purpose = pickEnum(patch.purpose, ["university", "scholarship", "graduate", "visa", "placement", "retake"], "purpose", false);
  if ("preferred_delivery_mode" in patch) out.preferred_delivery_mode = pickEnum(patch.preferred_delivery_mode, ["home_edition", "test_center", "unsure"], "preferred_delivery_mode");
  if ("prep_intensity" in patch) out.prep_intensity = pickEnum(patch.prep_intensity, ["crash", "balanced", "thorough"], "prep_intensity", false);
  if ("weekly_hours" in patch) out.weekly_hours = pickInt(patch.weekly_hours, 0, 80, "weekly_hours");

  // Keep the 2026 band columns and the legacy 0–120 columns consistent so both
  // old and new readers see the same goal (ETS Table 6 comparison).
  const has = (key: string) => key in patch;
  if (has("target_band") && !has("target_total_score") && typeof out.target_band === "number") {
    const legacyMin = bandToLegacyTotalRange(out.target_band)?.min;
    if (legacyMin != null) out.target_total_score = legacyMin;
  } else if (has("target_total_score") && !has("target_band") && typeof out.target_total_score === "number") {
    out.target_band = legacyTotalToBand(out.target_total_score);
  }
  if (has("current_band") && !has("current_score_or_estimate")) {
    out.current_score_or_estimate = typeof out.current_band === "number" ? bandToLegacyTotalRange(out.current_band)?.min ?? null : null;
  } else if (has("current_score_or_estimate") && !has("current_band")) {
    out.current_band = typeof out.current_score_or_estimate === "number" ? legacyTotalToBand(out.current_score_or_estimate) : null;
  }
  if (isObject(out.legacy_section_scores) && !("section_current_bands" in patch)) {
    const derived: JsonRecord = {};
    for (const skill of TOEFL_SKILLS) {
      const converted = legacySectionToBand(skill, (out.legacy_section_scores as JsonRecord)[skill]);
      if (converted != null) derived[skill] = converted;
    }
    out.section_current_bands = derived;
  }
  return out;
};

export const TOEFL_PLAYBOOK_CONFIG: ExamPlaybookConfig = {
  exam: "toefl",
  examLabel: "TOEFL",
  functionName: "toefl-playbook",
  routeMarker: "/toefl-playbook",
  tables: tablesFor("toefl_playbook"),
  playbookProductId: PLAYBOOK_PRODUCT_ID,
  playbookProductSlug: PLAYBOOK_PRODUCT_SLUG,
  simulatorProductId: SIMULATOR_PRODUCT_ID,
  practiceProductId: null,
  blockTypes: TOEFL_BLOCK_TYPES,
  focusSections: ["reading", "listening", "speaking", "writing", "all"],
  cleanProfilePatch: cleanToeflProfilePatch,
  diagnosticFields: [
    "target_band",
    "current_band",
    "section_target_bands",
    "section_current_bands",
    "legacy_section_scores",
    "target_total_score",
    "current_score_or_estimate",
    "deadline_date",
    "weakest_section",
    "purpose",
  ],
  buildDiagnostic: ({ profile, outcomes, templates, today }) =>
    buildToeflDiagnostic({ profile, outcomes, templates: templates.map((t) => ({ slug: String(t.slug), title: t.title as string, duration_days: Number(t.duration_days ?? 0), schedule_json: t.schedule_json })), today }),
  aiExamContext: "TOEFL iBT (2026 format: Reading, Listening, Writing, Speaking on 1–6 bands)",
};
