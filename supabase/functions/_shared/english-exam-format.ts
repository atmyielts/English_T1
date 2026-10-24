// Uzbekistan's national CEFR English exam ("Multilevel", Knowledge Assessment
// Agency): the scoring facts the exam track uses. Every number here is from the
// Agency's own documents; sources and what is NOT verified are listed in
// docs/english/MULTILEVEL_FORMAT.md. Pure: no I/O.

import { CEFR_ORDER, type Cefr } from "./english-today.ts";

export const EXAM_SECTIONS = ["listening", "reading", "writing", "speaking"] as const;
export type ExamSection = (typeof EXAM_SECTIONS)[number];
export const isExamSection = (value: unknown): value is ExamSection =>
  (EXAM_SECTIONS as readonly string[]).includes(String(value));

/** Each section is reported on 0-75 (no C2 tasks, so 75 is the top). */
export const EXAM_SCALE_MAX = 75;

/** Exam levels, best first. "below_b1" is the Agency's "B1dan quyi". */
export type ExamLevel = "C1" | "B2" | "B1" | "below_b1";

/** Cut scores on the 0-75 average (Agency decision of 16 March 2023). */
export const EXAM_CUTS: ReadonlyArray<{ level: Exclude<ExamLevel, "below_b1">; min: number }> = [
  { level: "C1", min: 65 },
  { level: "B2", min: 51 },
  { level: "B1", min: 38 },
];

export const examLevelFor = (score: number | null): ExamLevel | null => {
  if (score === null || !Number.isFinite(score)) return null;
  for (const cut of EXAM_CUTS) if (score >= cut.min) return cut.level;
  return "below_b1";
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/**
 * The overall result: the average of the four section scores. The sources do
 * not say how the average is rounded; we round to the nearest whole point.
 * Null until all four sections have a score.
 */
export const examOverall = (scores: Partial<Record<ExamSection, number | null>>): number | null => {
  const values = EXAM_SECTIONS.map((section) => scores[section]);
  if (values.some((value) => typeof value !== "number" || !Number.isFinite(value))) return null;
  const mean = (values as number[]).reduce((sum, value) => sum + value, 0) / values.length;
  return Math.round(clamp(mean, 0, EXAM_SCALE_MAX));
};

// --- Writing and speaking: the Agency's raw-to-score tables ---------------------

/**
 * Writing (new format, October 2025): Task 1.1 0-5 + Task 1.2 0-5 + Part 2 0-6
 * = expert score 0-16, in half points (the mean of two raters).
 */
export const WRITING_TABLE: ReadonlyArray<readonly [number, number]> = [
  [16, 75], [15.5, 72], [15, 69], [14.5, 67], [14, 65], [13.5, 64], [13, 63], [12.5, 62], [12, 61],
  [11.5, 59], [11, 57], [10.5, 55], [10, 53], [9.5, 51], [9, 50], [8.5, 48], [8, 47], [7.5, 45],
  [7, 43], [6.5, 41], [6, 40], [5.5, 38], [5, 37], [4.5, 35], [4, 33], [3.5, 31], [3, 28],
  [2.5, 25], [2, 21], [1.5, 17], [1, 14], [0.5, 10], [0, 0],
];

/** Speaking (new format, 2024): Q1-3 0-5 + Q4-6 0-5 + Q7 0-5 + Q8 0-6 = raw 0-21, half points. */
export const SPEAKING_TABLE: ReadonlyArray<readonly [number, number]> = [
  [21, 75], [20.5, 73], [20, 71], [19.5, 69], [19, 67], [18.5, 65], [18, 64], [17.5, 63], [17, 61],
  [16.5, 59], [16, 57], [15.5, 56], [15, 54], [14.5, 52], [14, 51], [13.5, 50], [13, 49], [12.5, 47],
  [12, 46], [11.5, 45], [11, 43], [10.5, 42], [10, 40], [9.5, 39], [9, 38], [8.5, 37], [8, 35],
  [7.5, 33], [7, 32], [6.5, 30], [6, 29], [5.5, 27], [5, 26], [4.5, 24], [4, 23], [3.5, 21],
  [3, 19], [2.5, 17], [2, 15], [1.5, 13], [1, 11], [0.5, 10], [0, 0],
];

export const WRITING_RAW_MAX = 16;
export const SPEAKING_RAW_MAX = 21;

/** Rounds down to the half point, then reads the table. */
const fromTable = (table: ReadonlyArray<readonly [number, number]>, max: number, raw: number): number => {
  const value = Math.floor(clamp(Number.isFinite(raw) ? raw : 0, 0, max) * 2 + 1e-9) / 2;
  return table.find(([points]) => points <= value)?.[1] ?? 0;
};

export const writingScore = (raw: number): number => fromTable(WRITING_TABLE, WRITING_RAW_MAX, raw);
export const speakingScore = (raw: number): number => fromTable(SPEAKING_TABLE, SPEAKING_RAW_MAX, raw);

// --- Listening and reading: an estimate from the share of correct answers -------

/**
 * The real test uses the Rasch model, which we cannot reproduce. The Agency
 * publishes the approximate number of correct answers (of 35) per level:
 * C1 28-35, B2 18-27, B1 10-17, below B1 0-9. We scale the learner's share to
 * 35 items and interpolate between those points, so 10/35 lands on 38 (B1),
 * 18/35 on 51 (B2) and 28/35 on 65 (C1). An estimate, labelled as one.
 */
export const OBJECTIVE_ITEMS = 35;
const OBJECTIVE_ANCHORS: ReadonlyArray<readonly [number, number]> = [[0, 0], [10, 38], [18, 51], [28, 65], [35, 75]];

const interpolate = (anchors: ReadonlyArray<readonly [number, number]>, x: number): number => {
  for (let i = 1; i < anchors.length; i += 1) {
    const [x1, y1] = anchors[i]!;
    const [x0, y0] = anchors[i - 1]!;
    if (x <= x1) return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
  }
  return anchors[anchors.length - 1]![1];
};

export const objectiveScore = (correct: number, total: number): number => {
  if (!Number.isFinite(correct) || !Number.isFinite(total) || total <= 0) return 0;
  const on35 = clamp(correct / total, 0, 1) * OBJECTIVE_ITEMS;
  // A tiny epsilon so 18/24 * 35 style fractions do not fall just below an anchor.
  return Math.floor(interpolate(OBJECTIVE_ANCHORS, on35) + 1e-9);
};

// --- Readiness from the per-skill rating (english-rating.ts) ---------------------

/**
 * Where a rating value (0 = start of A1 … 5 = start of C2) sits on 0-75: the
 * start of B1 at 38, B2 at 51, C1 at 65, C2 at the top. Straight lines in
 * between; below B1 it falls linearly to 0 at the start of A1. A rough guide
 * from practice results, never a real score.
 */
const RATING_ANCHORS: ReadonlyArray<readonly [number, number]> = [[0, 0], [2, 38], [3, 51], [4, 65], [5, EXAM_SCALE_MAX]];

export const scoreFromRating = (value: number | null | undefined): number | null => {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return Math.floor(interpolate(RATING_ANCHORS, clamp(value, 0, 5)) + 1e-9);
};

/** The CEFR level a target level means on this exam (A1/A2 targets aim at B1, C2 at C1). */
export const examTargetFor = (level: Cefr | null): Exclude<ExamLevel, "below_b1"> | null => {
  if (!level) return null;
  const index = CEFR_ORDER.indexOf(level);
  if (index <= 2) return "B1";
  return index === 3 ? "B2" : "C1";
};

export const cutFor = (level: Exclude<ExamLevel, "below_b1">): number => EXAM_CUTS.find((cut) => cut.level === level)!.min;

// --- Timings (official for writing and speaking) -----------------------------------

/** Writing: 60 minutes for both parts (official). */
export const WRITING_SECONDS = 60 * 60;
/** Speaking answer times per question, Q1..Q8 (official), and preparation for Q7 and Q8. */
export const SPEAKING_TALK_SECONDS = [30, 30, 30, 45, 30, 30, 120, 120] as const;
export const SPEAKING_PREP_SECONDS = [0, 0, 0, 0, 0, 0, 60, 60] as const;
/** Our practice timers for the parts whose official timing we could not verify. */
export const READING_SECONDS = 40 * 60;
export const LISTENING_SECONDS = 30 * 60;
export const SPEAKING_SECONDS = 20 * 60;

export const SECTION_SECONDS: Record<ExamSection, number> = {
  listening: LISTENING_SECONDS,
  reading: READING_SECONDS,
  writing: WRITING_SECONDS,
  speaking: SPEAKING_SECONDS,
};

/** Official word guidance per writing task. */
export const WRITING_WORDS = {
  task11: { min: 50, max: 50, label: "about 50" },
  task12: { min: 120, max: 150, label: "120-150" },
  part2: { min: 180, max: 200, label: "180-200" },
} as const;
