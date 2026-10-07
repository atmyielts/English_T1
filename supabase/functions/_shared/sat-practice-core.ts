export type SatSectionType = "reading_writing" | "math";
export type SatDifficulty = "easy" | "medium" | "hard";
export type SatDomain =
  | "grammar"
  | "transitions"
  | "rhetoric"
  | "vocabulary_in_context"
  | "command_of_evidence"
  | "algebra"
  | "advanced_math"
  | "problem_solving_data_analysis"
  | "geometry_trig";

export const SAT_DOMAINS: SatDomain[] = [
  "grammar",
  "transitions",
  "rhetoric",
  "vocabulary_in_context",
  "command_of_evidence",
  "algebra",
  "advanced_math",
  "problem_solving_data_analysis",
  "geometry_trig",
];

const MATH_DOMAINS = new Set(["algebra", "advanced_math", "problem_solving_data_analysis", "geometry_trig"]);

export const toNumber = (value: unknown): number | null => {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : null;
};

export const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

export const canonicalSection = (value: unknown): SatSectionType => {
  const raw = String(value ?? "").toLowerCase().trim();
  return raw === "math" ? "math" : "reading_writing";
};

export const canonicalDifficulty = (value: unknown): SatDifficulty => {
  const raw = String(value ?? "").toLowerCase().trim();
  if (raw === "easy" || raw === "medium" || raw === "hard") return raw;
  return "medium";
};

export const canonicalDomain = (value: unknown, section?: SatSectionType): SatDomain => {
  const raw = String(value ?? "").toLowerCase().trim().replace(/[\s-]+/g, "_").replace(/&/g, "and");
  const aliases: Record<string, SatDomain> = {
    reading_writing: "grammar",
    rw: "grammar",
    math: "algebra",
    vocabulary: "vocabulary_in_context",
    vocab: "vocabulary_in_context",
    evidence: "command_of_evidence",
    geometry: "geometry_trig",
    trig: "geometry_trig",
    data_analysis: "problem_solving_data_analysis",
  };
  if ((SAT_DOMAINS as string[]).includes(raw)) return raw as SatDomain;
  if (aliases[raw]) return aliases[raw];
  return section === "math" ? "algebra" : "grammar";
};

export const sectionForDomain = (domain: SatDomain): SatSectionType =>
  MATH_DOMAINS.has(domain) ? "math" : "reading_writing";

export const masteryLevel = (rollingAccuracy: number | null, attempts: number): number => {
  const accuracy = rollingAccuracy == null ? 0 : Math.max(0, Math.min(1, rollingAccuracy));
  const confidence = Math.min(1, Math.max(0, attempts) / 12);
  return Math.round((accuracy * 0.75 + confidence * 0.25) * 1000) / 1000;
};

export const masteryStatus = (level: number): "new" | "weak" | "building" | "stable" | "mastered" => {
  if (level >= 0.9) return "mastered";
  if (level >= 0.72) return "stable";
  if (level >= 0.48) return "building";
  if (level > 0) return "weak";
  return "new";
};

export const expectedPointImpact = (
  domain: SatDomain,
  accuracy: number | null,
  frequency: number,
): { conservative: number; optimistic: number } => {
  const weights: Record<SatDomain, number> = {
    grammar: 0.11,
    transitions: 0.08,
    rhetoric: 0.1,
    vocabulary_in_context: 0.08,
    command_of_evidence: 0.13,
    algebra: 0.17,
    advanced_math: 0.13,
    problem_solving_data_analysis: 0.11,
    geometry_trig: 0.09,
  };
  const gap = Math.max(0.15, 1 - (accuracy ?? 0.5));
  const base = 400 * weights[domain] * gap * (0.65 + Math.min(10, Math.max(1, frequency)) * 0.08);
  const conservative = Math.max(10, Math.round(base / 10) * 10);
  return { conservative, optimistic: Math.max(conservative + 10, Math.round(base * 1.55 / 10) * 10) };
};

export const isCorrectAnswer = (answer: unknown, correct: unknown): boolean => {
  const answerObj = isObject(answer) ? answer : {};
  const correctObj = isObject(correct) ? correct : {};
  const token = (value: unknown): string | null => {
    if (typeof value !== "string" && (typeof value !== "number" || !Number.isFinite(value))) return null;
    const text = String(value).trim().toUpperCase();
    return text || null;
  };
  const selected = token(answerObj.selected_option ?? answerObj.option_id ?? answerObj.text ?? answerObj.value ?? answer);
  const key = correctObj.option_id ?? correctObj.selected_option ?? correctObj.correct ?? correctObj.text ?? correctObj.value ?? correct;
  // Never compare arbitrary objects via their identical '[object Object]' representation.
  const expected = Array.isArray(key) ? key.map(token).filter((value): value is string => value !== null) : [token(key)];
  return selected !== null && expected.includes(selected);
};

export const nextLeitner = (wasCorrect: boolean, currentBox = 1): { box: number; interval: number } => {
  const box = wasCorrect ? Math.min(5, currentBox + 1) : 1;
  const intervals = [1, 2, 4, 8, 16];
  return { box, interval: intervals[box - 1] ?? 1 };
};
