// SAT Playbook configuration for the shared exam-playbook engine.
// Digital SAT: Reading and Writing + Math, 200–800 per section, 400–1600 total.

import { buildSatDiagnostic } from "./exam-playbook-diagnostic.ts";
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

export const PLAYBOOK_PRODUCT_SLUG = "sat-playbook";
export const PLAYBOOK_PRODUCT_ID = "a8b41e2c-9a36-4caf-9bba-7212e35a8b8c";
export const SIMULATOR_PRODUCT_ID = "5cf6e8e2-e6b1-4f8f-9d35-1c932866d6ef";
export const PRACTICE_PRODUCT_ID = "2cf7b1a7-4df9-4de8-99e8-5b9d5bb85010";

export const SAT_BLOCK_TYPES = ["rich_text", "comparison_table", "domain_grid", "faq", "checklist", "resource_cards", "timeline", "cta_strip", "callout", "stat_grid"];

const sectionScores = (value: unknown, field: string): JsonRecord => {
  if (value == null) return {};
  if (!isObject(value)) throw new PlaybookError(400, "invalid_field", `${field} must be an object.`, { field });
  const out: JsonRecord = {};
  for (const key of ["reading_writing", "math"]) {
    const score = pickInt(value[key], 200, 800, `${field}.${key}`, 10);
    if (score != null) out[key] = score;
  }
  return out;
};

export const cleanSatProfilePatch = (patch: JsonRecord, _existing: JsonRecord): JsonRecord => {
  const out: JsonRecord = {};
  if ("target_total_score" in patch) {
    const target = pickInt(patch.target_total_score, 400, 1600, "target_total_score", 10);
    if (target == null) throw new PlaybookError(400, "invalid_field", "target_total_score is required.", { field: "target_total_score" });
    out.target_total_score = target;
  }
  if ("current_score_or_estimate" in patch) out.current_score_or_estimate = pickInt(patch.current_score_or_estimate, 400, 1600, "current_score_or_estimate", 10);
  if ("current_section_scores" in patch) out.current_section_scores = sectionScores(patch.current_section_scores, "current_section_scores");
  if ("target_section_scores" in patch) out.target_section_scores = sectionScores(patch.target_section_scores, "target_section_scores");
  if ("deadline_date" in patch) out.deadline_date = parseDateOnly(patch.deadline_date, "deadline_date");
  if ("weakest_section" in patch) out.weakest_section = pickEnum(patch.weakest_section, ["reading_writing", "math"], "weakest_section");
  if ("purpose" in patch) out.purpose = pickEnum(patch.purpose, ["university", "scholarship", "merit", "placement", "retake"], "purpose", false);
  if ("preferred_delivery_mode" in patch) out.preferred_delivery_mode = pickEnum(patch.preferred_delivery_mode, ["digital_bluebook", "paper", "unsure"], "preferred_delivery_mode");
  if ("prep_intensity" in patch) out.prep_intensity = pickEnum(patch.prep_intensity, ["crash", "balanced", "thorough"], "prep_intensity", false);
  if ("weekly_hours" in patch) out.weekly_hours = pickInt(patch.weekly_hours, 0, 80, "weekly_hours");
  // A section pair implies the total; keep the legacy total column consistent.
  const sections = out.current_section_scores as JsonRecord | undefined;
  if (sections && typeof sections.reading_writing === "number" && typeof sections.math === "number" && !("current_score_or_estimate" in patch)) {
    out.current_score_or_estimate = Number(sections.reading_writing) + Number(sections.math);
  }
  return out;
};

export const SAT_PLAYBOOK_CONFIG: ExamPlaybookConfig = {
  exam: "sat",
  examLabel: "SAT",
  functionName: "sat-playbook",
  routeMarker: "/sat-playbook",
  tables: tablesFor("sat_playbook"),
  playbookProductId: PLAYBOOK_PRODUCT_ID,
  playbookProductSlug: PLAYBOOK_PRODUCT_SLUG,
  simulatorProductId: SIMULATOR_PRODUCT_ID,
  practiceProductId: PRACTICE_PRODUCT_ID,
  blockTypes: SAT_BLOCK_TYPES,
  focusSections: ["reading_writing", "math", "both"],
  cleanProfilePatch: cleanSatProfilePatch,
  diagnosticFields: ["target_total_score", "current_score_or_estimate", "current_section_scores", "target_section_scores", "deadline_date", "weakest_section", "purpose"],
  buildDiagnostic: ({ profile, outcomes, mastery, templates, today }) =>
    buildSatDiagnostic({ profile, outcomes, mastery, templates: templates.map((t) => ({ slug: String(t.slug), title: t.title as string, duration_days: Number(t.duration_days ?? 0), schedule_json: t.schedule_json })), today }),
  aiExamContext: "Digital SAT (Reading and Writing, Math; 400–1600)",
};
