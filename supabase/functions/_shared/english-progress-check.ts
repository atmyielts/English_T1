// The monthly progress check: a shorter form of the placement test.
//
// Two rounds of reading, writing and grammar questions, about
// 8–10 minutes, starting at the learner's own levels instead of B1. The
// result is saved through the same placement path as the level test
// (/onboarding/save with source "check"), so the level history, certificates
// and the "monthly_check" badge all work from it unchanged.
//
// When a check is due is decided by levelCheckStatus (english-levels.ts):
// 28 days after the placement or the last check. History is the
// learner_language_goals.metadata.level_history list (entries with source
// "check"); no separate table is needed.

import { CEFR_ORDER, type Cefr, isCefr } from "./english-today.ts";
import { perSkillLevels } from "./english-levels.ts";

/** Listening requires a recorded, server-assigned question bank. */
export const ACTIVE_PLACEMENT_SKILLS = ["reading", "writing", "grammar"] as const;
type PlacementSkill = (typeof ACTIVE_PLACEMENT_SKILLS)[number];
export const CHECK_ROUNDS = 2;
export const CHECK_QUESTIONS_PER_ROUND = ACTIVE_PLACEMENT_SKILLS.length;

export type CheckQuestion = {
  skill: PlacementSkill;
  prompt: string;
  passage: string;
  choices: string[];
  expected_answer_pattern: string;
};

export type CheckHistoryEntry = { question: CheckQuestion; answer: string };

const text = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);
const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** The learner's current levels for the tested skills (placement, checks and move-ups applied). */
export const currentTestedLevels = (meta: Record<string, unknown>, overall: unknown): { overall: Cefr | null; per_skill: Partial<Record<PlacementSkill, Cefr>> } => {
  const fallback = isCefr(overall) ? overall : null;
  const stored = perSkillLevels(asObject(meta.placement));
  const per: Partial<Record<PlacementSkill, Cefr>> = {};
  for (const skill of ACTIVE_PLACEMENT_SKILLS) {
    const level = stored[skill] ?? fallback;
    if (level) per[skill] = level;
  }
  return { overall: fallback, per_skill: per };
};

/** The question set for one round: exactly one per tested skill, cleaned and capped. */
export const cleanCheckQuestions = (raw: unknown): CheckQuestion[] => {
  const seen = new Set<string>();
  const out: CheckQuestion[] = [];
  for (const entry of Array.isArray(raw) ? raw : []) {
    const q = asObject(entry);
    const skill = text(q.skill, 24).toLowerCase();
    if (!(ACTIVE_PLACEMENT_SKILLS as readonly string[]).includes(skill) || seen.has(skill)) continue;
    const prompt = text(q.prompt, 600);
    if (!prompt) continue;
    seen.add(skill);
    out.push({
      skill: skill as PlacementSkill,
      prompt,
      passage: text(q.passage, 1200),
      choices: Array.isArray(q.choices) ? q.choices.map((choice) => text(choice, 200)).filter(Boolean).slice(0, 4) : [],
      expected_answer_pattern: text(q.expected_answer_pattern, 400),
    });
  }
  return out;
};

/** What the browser sends back: earlier questions and answers, cleaned and capped at two rounds. */
export const cleanCheckHistory = (raw: unknown, rounds = CHECK_ROUNDS): CheckHistoryEntry[] =>
  (Array.isArray(raw) ? raw : [])
    .map((entry) => asObject(entry))
    .map((entry) => ({ question: cleanCheckQuestions([entry.question])[0], answer: text(entry.answer, 800) }))
    .filter((entry): entry is CheckHistoryEntry => Boolean(entry.question))
    .slice(0, rounds * CHECK_QUESTIONS_PER_ROUND);

/** Round number from the request, never beyond the last round; the last one always finalizes. */
export const checkRound = (body: Record<string, unknown>): { round: number; finalize: boolean } => {
  const round = Math.max(0, Math.min(CHECK_ROUNDS, Math.floor(Number(body.round) || 0)));
  return { round, finalize: body.finalize === true || round >= CHECK_ROUNDS };
};

export type CheckResult = {
  overall_level: Cefr;
  per_skill: Record<PlacementSkill, { level: Cefr; evidence: string }>;
  narrative: string;
  next_steps: string[];
};

/** The AI's verdict, kept to valid levels; missing skills fall back to the overall level. */
export const parseCheckResult = (raw: unknown, fallback: Cefr): CheckResult => {
  const result = asObject(raw);
  const upper = (value: unknown) => text(value, 8).toUpperCase();
  const overall = isCefr(upper(result.overall_level)) ? upper(result.overall_level) as Cefr : fallback;
  const perRaw = asObject(result.per_skill);
  const per = {} as CheckResult["per_skill"];
  for (const skill of ACTIVE_PLACEMENT_SKILLS) {
    const row = perRaw[skill];
    const level = upper(typeof row === "string" ? row : asObject(row).level);
    per[skill] = { level: isCefr(level) ? level as Cefr : overall, evidence: text(asObject(row).evidence, 400) };
  }
  return {
    overall_level: overall,
    per_skill: per,
    narrative: text(result.narrative, 1200),
    next_steps: (Array.isArray(result.next_steps) ? result.next_steps : []).map((step) => text(step, 320)).filter(Boolean).slice(0, 3),
  };
};

/** Where round one starts: the learner's overall level, or the middle of their skills. */
export const checkStartLevel = (levels: { overall: Cefr | null; per_skill: Partial<Record<PlacementSkill, Cefr>> }): Cefr => {
  if (levels.overall) return levels.overall;
  const indexes = Object.values(levels.per_skill).map((level) => CEFR_ORDER.indexOf(level!)).sort((a, b) => a - b);
  return indexes.length ? CEFR_ORDER[indexes[Math.floor(indexes.length / 2)]!]! : "B1";
};

export const CHECK_ROUND_PROMPT =
  "You are a CEFR examiner running a short monthly progress check for a learner who already has levels. "
  + "Produce EXACTLY 3 short questions, ONE per skill (reading, writing, grammar). Reading: a 2-3 sentence passage + question. "
  + "Writing: a short rewrite or sentence-completion prompt. "
  + "Grammar: multiple choice with 4 options. Round 0: aim each question at the learner's current level in that skill "
  + "(given in `levels`), slightly above it so improvement can show. Round 1: adjust each skill up or down from the answers in `history`. "
  + "Return strict JSON: {questions: [{skill, prompt, passage, choices, expected_answer_pattern}]}.";

export const CHECK_FINAL_PROMPT =
  "You are a CEFR examiner finishing a short monthly progress check. You get the learner's levels before the check and "
  + "the questions, their answers and expected_answer_patterns. Be honest and calibrated: keep a level unless the answers clearly "
  + "show a change. Base the overall estimate, narrative and recommendations on the assessed skills only. "
  + "Return strict JSON: {overall_level: 'A1'|'A2'|'B1'|'B2'|'C1'|'C2', per_skill: {reading, writing, grammar: "
  + "{level, evidence: 1 line}}, narrative: 2 sentences on what changed, next_steps: up to 3 short concrete tips}.";
