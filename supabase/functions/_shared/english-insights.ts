// Cross-skill insights for the English ecosystem. Aggregates user activity,
// CEFR-aligned skill levels, and unified mistake/vocab signals across the 6
// English skill apps (reading, writing, listening, speaking, grammar, vocab).
// Mirrors the IELTS insights pattern but keyed to CEFR levels rather than
// IELTS bands.

import type { EnglishServiceKey } from "./english-learning.ts";

type JsonRecord = Record<string, unknown>;

const isObject = (v: unknown): v is JsonRecord =>
  !!v && typeof v === "object" && !Array.isArray(v);

const toNumber = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

const isoDate = (d: Date): string => d.toISOString().slice(0, 10);

export const ENGLISH_SKILL_KEYS: ReadonlyArray<EnglishServiceKey> = [
  "reading",
  "writing",
  "listening",
  "speaking",
  "grammar",
  "vocabulary",
  "immersion",
];

export type CefrLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

const CEFR_ORDER: CefrLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2"];

// CEFR mapped to a 0-100 numeric scale so we can interpolate between levels.
// A1 ≈ 10, A2 ≈ 25, B1 ≈ 45, B2 ≈ 65, C1 ≈ 80, C2 ≈ 95.
const CEFR_NUMERIC: Record<CefrLevel, number> = {
  A1: 10,
  A2: 25,
  B1: 45,
  B2: 65,
  C1: 80,
  C2: 95,
};

const numericToCefr = (n: number): CefrLevel => {
  for (let i = CEFR_ORDER.length - 1; i >= 0; i--) {
    if (n >= CEFR_NUMERIC[CEFR_ORDER[i]!]) return CEFR_ORDER[i]!;
  }
  return "A1";
};

export interface CefrEstimate {
  skill: EnglishServiceKey;
  level: CefrLevel;
  numeric: number;
  confidence: "low" | "medium" | "high";
  sample_count: number;
}

const confidenceForCount = (n: number): "low" | "medium" | "high" => {
  if (n >= 30) return "high";
  if (n >= 8) return "medium";
  return "low";
};

/**
 * Estimate CEFR level per skill from accumulated learner_skill_metrics rows.
 * Uses normalized accuracy / mastery / speed signals from each skill's
 * recorded events, weighted by recency.
 */
export const buildCefrEstimates = async (
  sb: any,
  languageId: string,
  userId: string,
): Promise<CefrEstimate[]> => {
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  // Pull recent skill metrics. The english-learning shared module records
  // per-skill events (accuracy, latency, mastery_delta) into
  // learner_skill_metrics — see SERVICE_LABELS / SERVICE_PRODUCT_SLUGS for
  // the canonical service keys.
  const { data: rows } = await sb
    .from("learner_skill_metrics")
    .select("service_key, metric_type, metric_value, recorded_at")
    .eq("user_id", userId)
    .eq("language_id", languageId)
    .gte("recorded_at", since)
    .order("recorded_at", { ascending: false })
    .limit(2000);

  const buckets = new Map<EnglishServiceKey, { sum: number; count: number; latest: number }>();
  for (const row of (rows ?? []) as JsonRecord[]) {
    const skill = String(row.service_key ?? "").toLowerCase() as EnglishServiceKey;
    if (!ENGLISH_SKILL_KEYS.includes(skill)) continue;
    const value = toNumber(row.metric_value);
    if (value == null) continue;
    const recordedAtMs = new Date(String(row.recorded_at ?? "")).getTime();
    const ageDays = Math.max(0, (Date.now() - recordedAtMs) / (24 * 60 * 60 * 1000));
    // Recency weight: 1.0 for today, 0.4 for 60 days old.
    const weight = Math.max(0.4, 1 - ageDays / 90);
    const bucket = buckets.get(skill) ?? { sum: 0, count: 0, latest: 0 };
    bucket.sum += value * weight;
    bucket.count += weight;
    bucket.latest = Math.max(bucket.latest, recordedAtMs);
    buckets.set(skill, bucket);
  }

  const estimates: CefrEstimate[] = [];
  for (const skill of ENGLISH_SKILL_KEYS) {
    const bucket = buckets.get(skill);
    if (!bucket || bucket.count === 0) {
      estimates.push({
        skill,
        level: "A1",
        numeric: CEFR_NUMERIC.A1,
        confidence: "low",
        sample_count: 0,
      });
      continue;
    }
    const avg = bucket.sum / bucket.count;
    // Skill metric values are normalised 0–1; map to CEFR's 0–100 numeric.
    const numeric = Math.round(avg * 100);
    estimates.push({
      skill,
      level: numericToCefr(numeric),
      numeric,
      confidence: confidenceForCount(bucket.count),
      sample_count: Math.round(bucket.count),
    });
  }
  return estimates;
};

export interface CrossSkillActivityDay {
  date: string;
  events: number;
  skills_touched: EnglishServiceKey[];
  minutes_estimate: number;
}

/**
 * Aggregate the last year of learner activity across all 6 English skills.
 * Used by the english-hub heatmap. Counts events from learner_session_events
 * (a unified events table the english apps write to).
 */
export const buildCrossSkillActivity = async (
  sb: any,
  languageId: string,
  userId: string,
): Promise<{
  days: CrossSkillActivityDay[];
  streak: { current_days: number; longest_days: number; last_session_date: string | null };
  totals: { last_7_days: number; last_30_days: number; all_time: number };
}> => {
  const now = new Date();
  const fromIso = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString();

  const { data: rows } = await sb
    .from("learner_session_events")
    .select("service_key, occurred_at, duration_seconds")
    .eq("user_id", userId)
    .eq("language_id", languageId)
    .gte("occurred_at", fromIso)
    .order("occurred_at", { ascending: true })
    .limit(2500);

  const byDay = new Map<string, { events: number; skills: Set<EnglishServiceKey>; minutes: number }>();
  for (const row of (rows ?? []) as JsonRecord[]) {
    const occurredAt = String(row.occurred_at ?? "");
    if (!occurredAt) continue;
    const date = occurredAt.slice(0, 10);
    const skill = String(row.service_key ?? "").toLowerCase() as EnglishServiceKey;
    const durationSec = toNumber(row.duration_seconds) ?? 0;
    const entry = byDay.get(date) ?? { events: 0, skills: new Set<EnglishServiceKey>(), minutes: 0 };
    entry.events += 1;
    if (ENGLISH_SKILL_KEYS.includes(skill)) entry.skills.add(skill);
    entry.minutes += Math.max(0, Math.round(durationSec / 60));
    byDay.set(date, entry);
  }

  const days: CrossSkillActivityDay[] = [];
  for (const [date, entry] of byDay.entries()) {
    days.push({
      date,
      events: entry.events,
      skills_touched: Array.from(entry.skills),
      minutes_estimate: entry.minutes,
    });
  }
  days.sort((a, b) => a.date.localeCompare(b.date));

  // Streak (current consecutive days ending today).
  const todayIso = isoDate(now);
  const activeSet = new Set(days.map((d) => d.date));
  let current = 0;
  for (let i = 0; i < 365; i++) {
    const day = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const iso = isoDate(day);
    if (activeSet.has(iso)) current += 1;
    else if (iso !== todayIso) break;
  }

  // Longest streak.
  let longest = 0;
  let runLength = 0;
  for (let i = 0; i < days.length; i++) {
    if (i === 0) {
      runLength = 1;
    } else {
      const prev = new Date(days[i - 1]!.date).getTime();
      const curr = new Date(days[i]!.date).getTime();
      const diffDays = Math.round((curr - prev) / (24 * 60 * 60 * 1000));
      if (diffDays === 1) runLength += 1;
      else {
        if (runLength > longest) longest = runLength;
        runLength = 1;
      }
    }
  }
  if (runLength > longest) longest = runLength;

  const last7Iso = isoDate(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));
  const last30Iso = isoDate(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));

  return {
    days,
    streak: {
      current_days: current,
      longest_days: longest,
      last_session_date: days.length > 0 ? days[days.length - 1]!.date : null,
    },
    totals: {
      last_7_days: days.filter((d) => d.date >= last7Iso).reduce((s, d) => s + d.events, 0),
      last_30_days: days.filter((d) => d.date >= last30Iso).reduce((s, d) => s + d.events, 0),
      all_time: days.reduce((s, d) => s + d.events, 0),
    },
  };
};

export interface UnifiedMistakeRow {
  service: EnglishServiceKey;
  pattern: string;
  count: number;
  last_seen_at: string;
}

/**
 * Pull a unified view of the user's recent mistakes across English apps.
 * Each app records mistakes into its own table (vocabulary_notebook_entries
 * for vocab, ielts_practice_mistake_notebook for IELTS, etc.); this function
 * UNIONs the cross-cutting ones and returns the top patterns.
 */
export const buildUnifiedMistakeNotebook = async (
  sb: any,
  languageId: string,
  userId: string,
  limit = 12,
): Promise<UnifiedMistakeRow[]> => {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const out: UnifiedMistakeRow[] = [];

  // Vocabulary mistakes — words in the unified notebook with low Leitner box.
  try {
    const { data: vocabRows } = await sb
      .from("user_vocabulary_notebook_entries")
      .select("word, source_type, last_reviewed_at, leitner_box, created_at")
      .eq("user_id", userId)
      .eq("language_id", languageId)
      .lte("leitner_box", 2)
      .eq("is_archived", false)
      .order("created_at", { ascending: false })
      .limit(limit);
    for (const row of (vocabRows ?? []) as JsonRecord[]) {
      out.push({
        service: "vocabulary",
        pattern: `Re-encountering: ${String(row.word ?? "")}`,
        count: 1,
        last_seen_at: String(row.last_reviewed_at ?? row.created_at ?? ""),
      });
    }
  } catch {
    // Best-effort — no vocab table = no vocab mistakes
  }

  return out.slice(0, limit);
};

/**
 * Pulls an at-a-glance level-per-skill grid suitable for direct rendering on
 * the hub dashboard. Combines CEFR estimates with a default skill ordering.
 */
export interface CefrSnapshotResponse {
  ok: boolean;
  estimates: CefrEstimate[];
  overall: { level: CefrLevel; numeric: number };
  generated_at: string;
}

export const buildCefrSnapshot = async (
  sb: any,
  languageId: string,
  userId: string,
): Promise<CefrSnapshotResponse> => {
  const estimates = await buildCefrEstimates(sb, languageId, userId);
  const informed = estimates.filter((e) => e.sample_count > 0);
  const overallNumeric = informed.length > 0
    ? Math.round(informed.reduce((sum, e) => sum + e.numeric, 0) / informed.length)
    : CEFR_NUMERIC.A1;
  return {
    ok: true,
    estimates,
    overall: { level: numericToCefr(overallNumeric), numeric: overallNumeric },
    generated_at: new Date().toISOString(),
  };
};
