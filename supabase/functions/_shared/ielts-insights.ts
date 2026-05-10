// Shared cross-app insights builders for IELTS.
// Used by both ielts-practice (existing /insights/* endpoints) and
// ielts-playbook (embedded into /dashboard response) so the frontends
// can render the same trajectory / activity / mastery without a second
// network round-trip.

type JsonRecord = Record<string, unknown>;

const isObject = (v: unknown): v is JsonRecord =>
  !!v && typeof v === "object" && !Array.isArray(v);

const toNumber = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

const isoDate = (d: Date): string => d.toISOString().slice(0, 10);

const SECTION_KEYS = ["reading", "listening", "writing", "speaking"] as const;
type SectionKey = (typeof SECTION_KEYS)[number];

export interface TrajectoryPoint {
  date: string;
  source: "mock" | "lab";
  overall_band: number | null;
  reading: number | null;
  listening: number | null;
  writing: number | null;
  speaking: number | null;
}

export interface BandPredictorEntry {
  band: number | null;
  sample_count: number;
  confidence: "low" | "medium" | "high";
}

const confidenceForCount = (n: number): "low" | "medium" | "high" => {
  if (n >= 30) return "high";
  if (n >= 10) return "medium";
  return "low";
};

export const buildPracticeTrajectory = async (
  sb: any,
  practiceProductId: string,
  userId: string,
): Promise<{
  series: TrajectoryPoint[];
  predictor: Record<string, BandPredictorEntry>;
  range: { from: string; to: string };
}> => {
  const now = new Date();
  const from = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const fromIso = from.toISOString();

  const [outcomesRes, labRes] = await Promise.all([
    sb
      .from("exam_outcomes")
      .select("computed_at, overall_band, section_scores, product_id")
      .eq("user_id", userId)
      .gte("computed_at", fromIso)
      .order("computed_at", { ascending: true })
      .limit(200),
    sb
      .from("ielts_practice_lab_attempts")
      .select("scored_at, section_type, estimated_band, accuracy_ratio, status")
      .eq("user_id", userId)
      .eq("product_id", practiceProductId)
      .eq("status", "scored")
      .gte("scored_at", fromIso)
      .not("estimated_band", "is", null)
      .order("scored_at", { ascending: true })
      .limit(200),
  ]);

  const series: TrajectoryPoint[] = [];
  const totals = {
    reading: { sum: 0, count: 0 },
    listening: { sum: 0, count: 0 },
    writing: { sum: 0, count: 0 },
    speaking: { sum: 0, count: 0 },
    overall: { sum: 0, count: 0 },
  };

  for (const row of (outcomesRes.data ?? []) as JsonRecord[]) {
    const computedAt = String(row.computed_at ?? "");
    if (!computedAt) continue;
    const sections = isObject(row.section_scores) ? row.section_scores : {};
    const point: TrajectoryPoint = {
      date: computedAt.slice(0, 10),
      source: "mock",
      overall_band: toNumber(row.overall_band),
      reading: null,
      listening: null,
      writing: null,
      speaking: null,
    };
    for (const entry of Object.values(sections)) {
      if (!isObject(entry)) continue;
      const type = String(entry.type ?? "").toLowerCase();
      const band = toNumber(entry.band);
      if (band == null) continue;
      if (type === "reading" || type === "listening" || type === "writing" || type === "speaking") {
        point[type] = band;
        totals[type].sum += band;
        totals[type].count += 1;
      }
    }
    if (point.overall_band != null) {
      totals.overall.sum += point.overall_band;
      totals.overall.count += 1;
    }
    series.push(point);
  }

  for (const row of (labRes.data ?? []) as JsonRecord[]) {
    const scoredAt = String(row.scored_at ?? "");
    const band = toNumber(row.estimated_band);
    const sectionType = String(row.section_type ?? "").toLowerCase();
    if (!scoredAt || band == null) continue;
    if (sectionType !== "reading" && sectionType !== "listening" && sectionType !== "writing") continue;
    const point: TrajectoryPoint = {
      date: scoredAt.slice(0, 10),
      source: "lab",
      overall_band: null,
      reading: null,
      listening: null,
      writing: null,
      speaking: null,
    };
    point[sectionType as SectionKey] = band;
    totals[sectionType as SectionKey].sum += band;
    totals[sectionType as SectionKey].count += 1;
    series.push(point);
  }

  series.sort((a, b) => a.date.localeCompare(b.date));

  const predictor: Record<string, BandPredictorEntry> = {};
  for (const key of SECTION_KEYS) {
    const points = series
      .map((p) => p[key])
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    if (points.length === 0) {
      predictor[key] = { band: null, sample_count: 0, confidence: "low" };
      continue;
    }
    const half = Math.max(1, Math.floor(points.length / 2));
    const older = points.slice(0, points.length - half);
    const newer = points.slice(points.length - half);
    const olderAvg = older.length > 0 ? older.reduce((a, b) => a + b, 0) / older.length : 0;
    const newerAvg = newer.reduce((a, b) => a + b, 0) / newer.length;
    const blended = older.length > 0 ? (olderAvg + newerAvg * 2) / 3 : newerAvg;
    predictor[key] = {
      band: Math.round(blended * 10) / 10,
      sample_count: points.length,
      confidence: confidenceForCount(points.length),
    };
  }
  const overallPoints = series
    .map((p) => p.overall_band)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  predictor.overall = overallPoints.length > 0
    ? {
        band: Math.round((overallPoints.reduce((a, b) => a + b, 0) / overallPoints.length) * 10) / 10,
        sample_count: overallPoints.length,
        confidence: confidenceForCount(overallPoints.length),
      }
    : { band: null, sample_count: 0, confidence: "low" };

  return {
    series,
    predictor,
    range: { from: isoDate(from), to: isoDate(now) },
  };
};

export interface ActivityDay {
  date: string;
  attempts: number;
  sections: string[];
  minutes_estimate: number;
}

export const buildPracticeActivity = async (
  sb: any,
  languageId: string,
  practiceProductId: string,
  userId: string,
): Promise<{
  days: ActivityDay[];
  streak: { current_days: number; longest_days: number; last_practice_date: string | null };
  totals: { last_7_days: number; last_30_days: number; all_time: number };
}> => {
  const now = new Date();
  const from = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
  const fromIso = from.toISOString();

  const [labRes, attemptRes] = await Promise.all([
    sb
      .from("ielts_practice_lab_attempts")
      .select("submitted_at, section_type")
      .eq("user_id", userId)
      .eq("product_id", practiceProductId)
      .gte("submitted_at", fromIso)
      .order("submitted_at", { ascending: true })
      .limit(600),
    sb
      .from("ielts_practice_attempts")
      .select("submitted_at, section_type")
      .eq("user_id", userId)
      .eq("language_id", languageId)
      .gte("submitted_at", fromIso)
      .order("submitted_at", { ascending: true })
      .limit(600),
  ]);

  const byDay = new Map<string, { attempts: number; sections: Set<string> }>();
  const addEvent = (iso: string, section: string) => {
    if (!iso) return;
    const date = iso.slice(0, 10);
    const entry = byDay.get(date) ?? { attempts: 0, sections: new Set<string>() };
    entry.attempts += 1;
    if (section) entry.sections.add(section);
    byDay.set(date, entry);
  };
  for (const row of (labRes.data ?? []) as JsonRecord[]) {
    addEvent(String(row.submitted_at ?? ""), String(row.section_type ?? "").toLowerCase());
  }
  for (const row of (attemptRes.data ?? []) as JsonRecord[]) {
    addEvent(String(row.submitted_at ?? ""), String(row.section_type ?? "").toLowerCase());
  }

  const days: ActivityDay[] = [];
  for (const [date, entry] of byDay.entries()) {
    days.push({
      date,
      attempts: entry.attempts,
      sections: Array.from(entry.sections),
      minutes_estimate: entry.attempts * 12,
    });
  }
  days.sort((a, b) => a.date.localeCompare(b.date));

  const todayIso = isoDate(now);
  const activeSet = new Set(days.map((d) => d.date));
  let current = 0;
  for (let i = 0; i < 365; i++) {
    const day = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const iso = isoDate(day);
    if (activeSet.has(iso)) {
      current += 1;
    } else if (iso !== todayIso) {
      break;
    }
  }

  let longest = 0;
  let runLength = 0;
  for (let i = 0; i < days.length; i++) {
    if (i === 0) {
      runLength = 1;
    } else {
      const prev = new Date(days[i - 1].date).getTime();
      const curr = new Date(days[i].date).getTime();
      const diffDays = Math.round((curr - prev) / (24 * 60 * 60 * 1000));
      if (diffDays === 1) {
        runLength += 1;
      } else {
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
      last_practice_date: days.length > 0 ? days[days.length - 1].date : null,
    },
    totals: {
      last_7_days: days.filter((d) => d.date >= last7Iso).reduce((s, d) => s + d.attempts, 0),
      last_30_days: days.filter((d) => d.date >= last30Iso).reduce((s, d) => s + d.attempts, 0),
      all_time: days.reduce((s, d) => s + d.attempts, 0),
    },
  };
};

export interface MasteryRow {
  question_type: string;
  section_type: string;
  mastery_level: number;
  mastery_status: string;
  last_accuracy: number | null;
  rolling_accuracy: number | null;
  attempts: number;
  last_practiced_at: string | null;
}

export interface TrapPatternRow {
  trap_type: string;
  count: number;
  example_question_type: string | null;
}

export const buildPracticeMasteryOverview = async (
  sb: any,
  languageId: string,
  userId: string,
): Promise<{
  by_status: Record<string, MasteryRow[]>;
  recent_graduations: MasteryRow[];
  trap_patterns: TrapPatternRow[];
  totals: { tracked: number; mastered: number; weak: number };
}> => {
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  const [masteryRes, mistakeRes] = await Promise.all([
    sb
      .from("ielts_practice_mastery")
      .select("section_type,question_type,mastery_level,mastery_status,last_accuracy_ratio,rolling_accuracy_ratio,attempts,last_practiced_at,updated_at")
      .eq("user_id", userId)
      .eq("language_id", languageId)
      .order("mastery_level", { ascending: false })
      .limit(200),
    sb
      .from("ielts_practice_mistake_notebook")
      .select("trap_type,question_type,review_count,status")
      .eq("user_id", userId)
      .eq("language_id", languageId)
      .eq("status", "active")
      .limit(200),
  ]);

  const byStatus: Record<string, MasteryRow[]> = { new: [], weak: [], building: [], stable: [], mastered: [] };
  const recentGraduations: MasteryRow[] = [];
  for (const row of (masteryRes.data ?? []) as JsonRecord[]) {
    const entry: MasteryRow = {
      question_type: String(row.question_type ?? ""),
      section_type: String(row.section_type ?? ""),
      mastery_level: toNumber(row.mastery_level) ?? 0,
      mastery_status: String(row.mastery_status ?? "new"),
      last_accuracy: toNumber(row.last_accuracy_ratio),
      rolling_accuracy: toNumber(row.rolling_accuracy_ratio),
      attempts: Number(row.attempts ?? 0),
      last_practiced_at: String(row.last_practiced_at ?? "") || null,
    };
    const status = entry.mastery_status in byStatus ? entry.mastery_status : "new";
    byStatus[status].push(entry);
    if (status === "mastered" && String(row.updated_at ?? "") >= fourteenDaysAgo) {
      recentGraduations.push(entry);
    }
  }

  const trapCounter = new Map<string, { count: number; example: string | null }>();
  for (const row of (mistakeRes.data ?? []) as JsonRecord[]) {
    const trap = String(row.trap_type ?? "unknown").toLowerCase();
    if (!trap || trap === "none") continue;
    const entry = trapCounter.get(trap) ?? { count: 0, example: null };
    entry.count += Math.max(1, Number(row.review_count ?? 1));
    if (!entry.example) entry.example = String(row.question_type ?? "") || null;
    trapCounter.set(trap, entry);
  }
  const trapPatterns: TrapPatternRow[] = Array.from(trapCounter.entries())
    .map(([trap_type, v]) => ({ trap_type, count: v.count, example_question_type: v.example }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  return {
    by_status: byStatus,
    recent_graduations: recentGraduations,
    trap_patterns: trapPatterns,
    totals: {
      tracked: (masteryRes.data ?? []).length,
      mastered: byStatus.mastered.length,
      weak: byStatus.weak.length,
    },
  };
};
