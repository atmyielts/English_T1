// Writing depth: draft-vs-draft score changes, criteria over time, which
// draft to resume (this device or the account), and the short model answer.
//
// Pure module with no imports, so the English app bundles it too.

export type CriterionKey = "task" | "organisation" | "vocabulary" | "grammar";
export const CRITERION_KEYS: readonly CriterionKey[] = ["task", "organisation", "vocabulary", "grammar"];

export type CriterionScore = { key: string; score: number };

export type CriterionDelta = {
  key: CriterionKey;
  before: number | null;
  after: number | null;
  /** after - before; null when either side is unknown. */
  delta: number | null;
};

const CEFR = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export type Cefr = (typeof CEFR)[number];

const asCefr = (value: unknown): Cefr | null => {
  const level = String(value ?? "").trim().toUpperCase();
  return (CEFR as readonly string[]).includes(level) ? level as Cefr : null;
};

const toScore = (value: unknown): number | null => {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(number) ? Math.round(Math.max(0, Math.min(100, number))) : null;
};

/**
 * Reads criteria in either stored shape: an array of {key, score} (feedback)
 * or an object {task: 70, ...} (compact history). Unknown keys are ignored.
 */
export const readCriteria = (raw: unknown): Partial<Record<CriterionKey, number>> => {
  const out: Partial<Record<CriterionKey, number>> = {};
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (!entry || typeof entry !== "object") continue;
      const rec = entry as Record<string, unknown>;
      const key = String(rec.key ?? "") as CriterionKey;
      const score = toScore(rec.score);
      if (CRITERION_KEYS.includes(key) && score !== null) out[key] = score;
    }
  } else if (raw && typeof raw === "object") {
    for (const key of CRITERION_KEYS) {
      const value = (raw as Record<string, unknown>)[key];
      const score = toScore(value && typeof value === "object" ? (value as Record<string, unknown>).score : value);
      if (score !== null) out[key] = score;
    }
  }
  return out;
};

/** Compact {task: 70, ...} form kept with each revision. */
export const compactCriteria = (criteria: CriterionScore[]): Partial<Record<CriterionKey, number>> => readCriteria(criteria);

/** Score change per criterion between two drafts, plus the overall change. */
export const criterionDeltas = (
  before: { overall: unknown; criteria: unknown },
  after: { overall: unknown; criteria: unknown },
): { overall: { before: number | null; after: number | null; delta: number | null }; criteria: CriterionDelta[] } => {
  const a = readCriteria(before.criteria);
  const b = readCriteria(after.criteria);
  const overallBefore = toScore(before.overall);
  const overallAfter = toScore(after.overall);
  return {
    overall: {
      before: overallBefore,
      after: overallAfter,
      delta: overallBefore !== null && overallAfter !== null ? overallAfter - overallBefore : null,
    },
    criteria: CRITERION_KEYS.map((key) => {
      const x = a[key] ?? null;
      const y = b[key] ?? null;
      return { key, before: x, after: y, delta: x !== null && y !== null ? y - x : null };
    }),
  };
};

/** The criterion that improved most and the one that dropped most (for a one-line summary). */
export const biggestMoves = (deltas: CriterionDelta[]): { up: CriterionDelta | null; down: CriterionDelta | null } => {
  const known = deltas.filter((entry) => entry.delta !== null);
  const up = known.filter((entry) => entry.delta! > 0).sort((x, y) => y.delta! - x.delta!)[0] ?? null;
  const down = known.filter((entry) => entry.delta! < 0).sort((x, y) => x.delta! - y.delta!)[0] ?? null;
  return { up, down };
};

export type RubricPoint = {
  at: string;
  overall: number | null;
  criteria: Partial<Record<CriterionKey, number>>;
  title: string | null;
  slug: string | null;
  source: "ai" | "basic" | null;
};

/** One line per criterion, oldest first, at most `limit` points (newest kept). */
export const rubricSeries = (
  points: RubricPoint[],
  limit = 12,
): { points: RubricPoint[]; series: Record<CriterionKey, Array<number | null>>; trend: Record<CriterionKey, number | null> } => {
  const sorted = [...points]
    .filter((point) => point.at && Object.keys(point.criteria).length > 0)
    .sort((a, b) => a.at.localeCompare(b.at))
    .slice(-limit);
  const series = {} as Record<CriterionKey, Array<number | null>>;
  const trend = {} as Record<CriterionKey, number | null>;
  for (const key of CRITERION_KEYS) {
    const values = sorted.map((point) => point.criteria[key] ?? null);
    series[key] = values;
    trend[key] = criterionTrend(values);
  }
  return { points: sorted, series, trend };
};

/**
 * Change from the start to now: mean of the last three known values minus
 * the mean of the first three (two points: last minus first). Null with
 * fewer than two known values.
 */
export const criterionTrend = (values: Array<number | null>): number | null => {
  const known = values.filter((value): value is number => typeof value === "number");
  if (known.length < 2) return null;
  const take = Math.min(3, Math.floor(known.length / 2));
  const mean = (list: number[]) => list.reduce((sum, value) => sum + value, 0) / list.length;
  return Math.round(mean(known.slice(-take)) - mean(known.slice(0, take)));
};

/** Points for a small SVG polyline: x across `width`, y from 0 (bottom) to 100 (top) over `height`. */
export const sparklinePoints = (values: Array<number | null>, width: number, height: number): Array<{ x: number; y: number; value: number }> => {
  const count = values.length;
  if (!count) return [];
  const step = count > 1 ? width / (count - 1) : 0;
  const out: Array<{ x: number; y: number; value: number }> = [];
  values.forEach((value, index) => {
    if (typeof value !== "number") return;
    const x = count > 1 ? Math.round(index * step * 10) / 10 : width / 2;
    const y = Math.round((height - (Math.max(0, Math.min(100, value)) / 100) * height) * 10) / 10;
    out.push({ x, y, value });
  });
  return out;
};

export type DraftCopy = { text: string; at: string | null };

/**
 * Which draft to show when the page opens: the newer of this device's copy
 * and the account copy. A device copy without a time (saved by an older app
 * version) wins only when the account has no text, or it is longer than the
 * account copy (it was typed after the last save that reached the server).
 */
export const chooseDraft = (
  local: DraftCopy | null,
  server: DraftCopy | null,
): { text: string; source: "local" | "server" | "none"; conflict: boolean } => {
  const localText = local?.text?.trim() ? local.text : "";
  const serverText = server?.text?.trim() ? server.text : "";
  if (!localText && !serverText) return { text: "", source: "none", conflict: false };
  if (!serverText) return { text: localText, source: "local", conflict: false };
  if (!localText) return { text: serverText, source: "server", conflict: false };
  if (localText === serverText) return { text: serverText, source: "server", conflict: false };
  const localAt = local?.at ? Date.parse(local.at) : NaN;
  const serverAt = server?.at ? Date.parse(server.at) : NaN;
  if (Number.isFinite(localAt) && Number.isFinite(serverAt)) {
    return localAt > serverAt
      ? { text: localText, source: "local", conflict: true }
      : { text: serverText, source: "server", conflict: true };
  }
  if (!Number.isFinite(localAt)) {
    return localText.length > serverText.length
      ? { text: localText, source: "local", conflict: true }
      : { text: serverText, source: "server", conflict: true };
  }
  return { text: localText, source: "local", conflict: true };
};

/** The level of the model answer: one above the learner's writing level (or the task's), at most C2. */
export const modelAnswerLevel = (learnerLevel: unknown, promptLevel: unknown): Cefr => {
  const base = asCefr(learnerLevel) ?? asCefr(promptLevel) ?? "B1";
  return CEFR[Math.min(CEFR.length - 1, CEFR.indexOf(base) + 1)]!;
};

/** Word range for the model answer: short, inside the task's range, a little shorter for lower levels. */
export const modelAnswerLength = (min: number, max: number): { min: number; max: number } => {
  const low = Math.max(30, Math.round(Number.isFinite(min) ? min : 60));
  const high = Math.max(low + 10, Math.min(Math.round(Number.isFinite(max) ? max : 150), 180));
  return { min: low, max: high };
};

export const MODEL_ANSWER_SYSTEM_PROMPT = [
  "You write one short model answer to an English writing task, for a learner to study after they have written their own.",
  "Write at exactly the given CEFR level: vocabulary and grammar a learner at that level can understand and reach.",
  "Follow the task: the reader, the type of text, every task point. Stay inside the word range.",
  "Use paragraphs where the text type needs them (blank line between paragraphs). No title, no notes.",
  "Then give 2 or 3 short notes on what makes it work at that level (each at most 18 words, plain English).",
  'Return strict JSON only: {"text": string, "notes": [string]}.',
].join(" ");

export const buildModelAnswerRequest = (input: {
  level: Cefr;
  title: string;
  task: string;
  points: string[];
  genre: string | null;
  audience: string | null;
  length: { min: number; max: number };
}): { systemPrompt: string; userPayload: string; temperature: number } => ({
  systemPrompt: MODEL_ANSWER_SYSTEM_PROMPT,
  userPayload: JSON.stringify({
    level: input.level,
    task_title: input.title.slice(0, 200),
    task: input.task.slice(0, 1500),
    task_points: input.points.slice(0, 8),
    text_type: input.genre,
    reader: input.audience,
    word_range: input.length,
  }),
  temperature: 0.4,
});

const countWords = (text: string): number => text.split(/\s+/).filter((token) => /[\p{L}\p{N}]/u.test(token)).length;

/** Validates the model's answer: text inside a generous word range, up to three short notes. */
export const normalizeModelAnswer = (
  raw: unknown,
  length: { min: number; max: number },
): { text: string; notes: string[]; word_count: number } | null => {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  // deno-lint-ignore no-control-regex
  const text = String(rec.text ?? rec.answer ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/\n{3,}/g, "\n\n").trim();
  const words = countWords(text);
  if (words < Math.max(15, length.min * 0.5) || words > length.max * 1.6 || text.length > 3000) return null;
  const notes = (Array.isArray(rec.notes) ? rec.notes : [])
    .map((note) => String(note ?? "").replace(/\s+/g, " ").trim().slice(0, 160))
    .filter(Boolean)
    .slice(0, 3);
  return { text, notes, word_count: words };
};

/** Notebook words the learner used, as "used of suggested" for the feedback line. */
export const wordsUsedLine = (suggested: string[], used: string[]): { used: number; total: number } => {
  const wanted = new Set(suggested.map((word) => word.toLowerCase().trim()).filter(Boolean));
  const hit = new Set(used.map((word) => word.toLowerCase().trim()).filter((word) => wanted.has(word)));
  return { used: hit.size, total: wanted.size };
};
