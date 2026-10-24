// Per-skill rating: a fine-grained level ("B1 · 62% of the way to B2") from
// the learner's recent scored activities, plus an IELTS band estimate.
//
// Pure functions only: the hub loads attempts (with each item's CEFR level)
// and the stored placement, and passes them in. Nothing here is invented: a
// skill with no placement and no scored activity has no rating.
//
// The scale is continuous: 0 = start of A1 … 5 = start of C2, 5.99 = top.
// floor(value) is the level and the fraction is the progress to the next one.

import { CEFR_ORDER, type Cefr, isCefr, TODAY_SKILLS, type TodaySkill } from "./english-today.ts";

export const RATING_VERSION = 1;
/** Most recent scored activities per skill that count. */
export const RATING_WINDOW = 20;
/** An activity this many days old counts half as much as one done today. */
export const RATING_HALF_LIFE_DAYS = 21;
export const RATING_MAX_AGE_DAYS = 120;
/** The placement counts like this many fresh activities, so a few results move the rating gently. */
export const PLACEMENT_WEIGHT = 1.5;
/** Where a placement puts the learner inside their level (30% of the way up). */
const PLACEMENT_OFFSET = 0.3;
/** Results that say little about the level (an easy pass, a hard miss) count this much. */
const WEAK_EVIDENCE_WEIGHT = 0.25;
const PASS_SCORE = 0.6;
const TOP = CEFR_ORDER.length - 0.01;
const DAY_MS = 86_400_000;

export type RatedAttempt = {
  skill: string;
  /** CEFR level of the item; attempts at items without a level are ignored. */
  level: Cefr | null;
  /** Accuracy 0..1; unscored attempts are ignored. */
  score: number | null;
  submitted_at: string;
};

export type RatingConfidence = "none" | "low" | "medium" | "high";

export type SkillRating = {
  skill: TodaySkill;
  /** Continuous level, 0..5.99, rounded to 2 decimals; null when nothing is known. */
  value: number | null;
  level: Cefr | null;
  /** 0..99: how far through `level` toward `next_level`. */
  progress: number | null;
  next_level: Cefr | null;
  /** Scored activities that counted. */
  attempts: number;
  /** none: placement only; low: 1–2 results; medium: 3–7; high: 8+. */
  confidence: RatingConfidence;
  /** The placement (or moved-up) level the rating started from. */
  base_level: Cefr | null;
};

export type RatingSummary = {
  version: number;
  computed_at: string;
  skills: Record<TodaySkill, SkillRating>;
  overall: { value: number | null; level: Cefr | null; progress: number | null; next_level: Cefr | null };
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const round2 = (value: number) => Math.round(value * 100) / 100;
const indexOf = (level: Cefr) => CEFR_ORDER.indexOf(level);

/**
 * Where one score puts the learner relative to the item's level: 60% is just
 * at the level (+0.1), 85% is well into it (+0.6), 100% is nearly the next
 * level (+0.9); 0% is a whole level below.
 */
export const scoreOffset = (score: number): number => {
  const s = clamp(score, 0, 1);
  return s >= PASS_SCORE ? 0.1 + (s - PASS_SCORE) * 2 : -1 + s * (1.1 / PASS_SCORE);
};

/** The level one result points to, on the 0..5.99 scale. */
export const attemptEvidence = (level: Cefr, score: number): number => clamp(indexOf(level) + scoreOffset(score), 0, TOP);

/** Recency weight: halves every RATING_HALF_LIFE_DAYS. */
export const recencyWeight = (ageDays: number): number => Math.pow(0.5, Math.max(0, ageDays) / RATING_HALF_LIFE_DAYS);

const describe = (value: number | null) => {
  if (value === null) return { value: null, level: null, progress: null, next_level: null };
  const v = round2(clamp(value, 0, TOP));
  const index = Math.floor(v);
  return {
    value: v,
    level: CEFR_ORDER[index] ?? null,
    progress: clamp(Math.floor((v - index) * 100 + 1e-6), 0, 99),
    next_level: CEFR_ORDER[index + 1] ?? null,
  };
};

const confidenceFor = (count: number): RatingConfidence =>
  count === 0 ? "none" : count < 3 ? "low" : count < 8 ? "medium" : "high";

/**
 * One skill's rating: a weighted mean of the placement and recent results.
 * Each result is weighted by recency and by what its item level can tell:
 * passing an item below the learner's level, or missing one above it, says
 * little, so it counts a quarter and never pulls the rating across the
 * placement point.
 */
export const rateSkill = (input: {
  skill: TodaySkill;
  attempts: RatedAttempt[];
  baseLevel: Cefr | null;
  now?: Date;
}): SkillRating => {
  const now = (input.now ?? new Date()).getTime();
  const scored = input.attempts
    .filter((attempt) =>
      attempt.skill === input.skill
      && isCefr(attempt.level)
      && attempt.score !== null
      && Number.isFinite(attempt.score)
      && Number.isFinite(Date.parse(attempt.submitted_at))
      && now - Date.parse(attempt.submitted_at) <= RATING_MAX_AGE_DAYS * DAY_MS)
    .sort((a, b) => Date.parse(b.submitted_at) - Date.parse(a.submitted_at))
    .slice(0, RATING_WINDOW);

  const base = input.baseLevel && isCefr(input.baseLevel) ? input.baseLevel : null;
  const anchor = base ? indexOf(base) + PLACEMENT_OFFSET : null;
  let weightSum = 0;
  let total = 0;
  if (anchor !== null) {
    weightSum += PLACEMENT_WEIGHT;
    total += PLACEMENT_WEIGHT * anchor;
  }
  for (const attempt of scored) {
    const level = attempt.level as Cefr;
    const score = clamp(attempt.score as number, 0, 1);
    let evidence = attemptEvidence(level, score);
    let weight = recencyWeight((now - Date.parse(attempt.submitted_at)) / DAY_MS);
    if (base) {
      const passed = score >= PASS_SCORE;
      if (passed && indexOf(level) < indexOf(base)) {
        weight *= WEAK_EVIDENCE_WEIGHT;
        evidence = Math.max(evidence, anchor!);
      } else if (!passed && indexOf(level) > indexOf(base)) {
        weight *= WEAK_EVIDENCE_WEIGHT;
        evidence = Math.min(evidence, anchor!);
      }
    }
    weightSum += weight;
    total += weight * evidence;
  }

  const value = weightSum > 0 ? total / weightSum : null;
  return {
    skill: input.skill,
    ...describe(value),
    attempts: scored.length,
    confidence: confidenceFor(scored.length),
    base_level: base,
  };
};

/** Every skill's rating and an overall rating (mean of the skills that have one). */
export const rateSkills = (input: {
  attempts: RatedAttempt[];
  baseLevelFor: (skill: TodaySkill) => Cefr | null;
  now?: Date;
}): RatingSummary => {
  const now = input.now ?? new Date();
  const skills = {} as Record<TodaySkill, SkillRating>;
  for (const skill of TODAY_SKILLS) {
    skills[skill] = rateSkill({ skill, attempts: input.attempts, baseLevel: input.baseLevelFor(skill), now });
  }
  const values = TODAY_SKILLS.map((skill) => skills[skill].value).filter((value): value is number => value !== null);
  return {
    version: RATING_VERSION,
    computed_at: now.toISOString(),
    skills,
    overall: describe(values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null),
  };
};

/** A stored summary, if it is one this version wrote. */
export const readRatingSummary = (raw: unknown): RatingSummary | null => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  if (row.version !== RATING_VERSION || typeof row.computed_at !== "string") return null;
  if (!row.skills || typeof row.skills !== "object" || !row.overall || typeof row.overall !== "object") return null;
  return row as unknown as RatingSummary;
};

/**
 * A cached summary is reused while nothing that shaped it changed: no newer
 * attempt, no newer placement or check, and computed in the last day (the
 * recency weights drift slowly).
 */
export const isRatingFresh = (input: {
  cached: RatingSummary | null;
  latestAttemptAt: string | null;
  placementAt: string | null;
  now?: Date;
  maxAgeMs?: number;
}): boolean => {
  if (!input.cached) return false;
  const computed = Date.parse(input.cached.computed_at);
  if (!Number.isFinite(computed)) return false;
  const now = (input.now ?? new Date()).getTime();
  if (now - computed > (input.maxAgeMs ?? DAY_MS) || computed > now + 60_000) return false;
  if (input.latestAttemptAt && Date.parse(input.latestAttemptAt) > computed) return false;
  if (input.placementAt && Date.parse(input.placementAt) > computed) return false;
  return true;
};

// === IELTS estimate ===

export const IELTS_SKILLS = ["listening", "reading", "writing", "speaking"] as const;
export type IeltsSkill = (typeof IELTS_SKILLS)[number];

/**
 * Band at the start of each CEFR level, from the published CEFR–IELTS
 * alignment (B1 ≈ 4.0–5.0, B2 ≈ 5.5–6.5, C1 ≈ 7.0–8.0, C2 ≈ 8.5+), with
 * straight lines in between. A rough guide only, never a real score.
 */
const IELTS_ANCHORS: Array<[number, number]> = [[0, 2], [1, 3], [2, 4], [3, 5.5], [4, 7], [5, 8.5], [6, 9]];

/** Estimated band for a rating value, rounded down to the half band (conservative). */
export const ieltsBand = (value: number | null): number | null => {
  if (value === null || !Number.isFinite(value)) return null;
  const v = clamp(value, 0, 6);
  for (let i = 1; i < IELTS_ANCHORS.length; i += 1) {
    const [x1, y1] = IELTS_ANCHORS[i]!;
    const [x0, y0] = IELTS_ANCHORS[i - 1]!;
    if (v <= x1) {
      const band = y0 + ((v - x0) / (x1 - x0)) * (y1 - y0);
      return Math.floor(band * 2 + 1e-9) / 2;
    }
  }
  return 9;
};

/** Overall band the IELTS way: the mean of the four, rounded to the nearest half (.25 and .75 round up). */
export const ieltsOverall = (bands: number[]): number | null => {
  if (!bands.length) return null;
  const mean = bands.reduce((sum, band) => sum + band, 0) / bands.length;
  return Math.round(mean * 2 + 1e-9) / 2;
};

export type IeltsEstimate = {
  per_skill: Partial<Record<IeltsSkill, number>>;
  /** Null until at least two of the four IELTS skills have a rating. */
  overall: number | null;
  /** IELTS skills the overall is based on. */
  based_on: IeltsSkill[];
  /** True when any skill in the estimate rests on the placement alone or on 1–2 results. */
  tentative: boolean;
};

export const ieltsEstimate = (skills: Record<TodaySkill, SkillRating>): IeltsEstimate => {
  const per: Partial<Record<IeltsSkill, number>> = {};
  const based: IeltsSkill[] = [];
  let tentative = false;
  for (const skill of IELTS_SKILLS) {
    const rating = skills[skill];
    const band = ieltsBand(rating?.value ?? null);
    if (band === null || !rating) continue;
    per[skill] = band;
    based.push(skill);
    if (rating.confidence === "none" || rating.confidence === "low") tentative = true;
  }
  return {
    per_skill: per,
    overall: based.length >= 2 ? ieltsOverall(based.map((skill) => per[skill]!)) : null,
    based_on: based,
    tentative,
  };
};
