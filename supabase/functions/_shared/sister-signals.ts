// Practice and playbook evidence for the shared learner profile.
//
// Full mock tests (exam_outcomes) stay the only input to score predictions.
// The sister apps add evidence about *where* a learner is weak:
//   - SAT Practice Lab: sat_practice_mastery (per section/domain/difficulty) and
//     scored sat_practice_lab_attempts
//   - IELTS Practice: ielts_practice_mastery (per section/question type) and
//     scored ielts_practice_attempts / ielts_practice_lab_attempts
//   - IELTS, SAT and TOEFL Playbooks: the learner's diagnostic profile
//     (*_playbook_user_profiles) and current recommendation snapshot
//   - TOEFL iBT Simulator results: the 2026 format (1-6 bands per section,
//     raw_result.toefl.score_version "toefl-2026-...") and the legacy RLW
//     estimate (0-30 section scores) are read separately, never mixed
// Practice accuracy may only change how sure a prediction is (its interval),
// never the predicted score itself.

export type ExamKey = "ielts" | "sat" | "toefl";

type Row = Record<string, unknown>;

/** TOEFL iBT Simulator product (see _shared/product-bundles.ts). */
const TOEFL_SIMULATOR_PRODUCT_ID = "b262ffa8-9912-4eba-93d7-58af3164d1cc";

export type SisterSignalRows = {
  satMastery: Row[];
  satAttempts: Row[];
  ieltsMastery: Row[];
  ieltsAttempts: Row[];
  playbookProfiles: Partial<Record<ExamKey, Row[]>>;
  playbookSnapshots: Partial<Record<ExamKey, Row[]>>;
  /** exam_outcomes rows of the TOEFL iBT Simulator (newest first). */
  toeflMocks?: Row[];
};

export type SkillSignal = {
  exam: ExamKey;
  section: string;
  skill: string;
  accuracy: number;
  attempts: number;
  source: "practice";
  last_practiced_at: string | null;
};

export type PracticeSummary = {
  attempts: number;
  recent_attempts_30d: number;
  accuracy: number | null;
  recent_accuracies: number[];
  last_activity_at: string | null;
  weak_skills: SkillSignal[];
  strong_skills: SkillSignal[];
};

export type DiagnosticSummary = {
  target: number | null;
  current_estimate: number | null;
  weakest_section: string | null;
  weakest_area: string | null;
  recommendation_slug: string | null;
  updated_at: string | null;
  /** TOEFL only: "band_2026" (1-6) or "legacy_120" (0-120). */
  scale?: string;
};

export type SimulatorSummary = {
  /** "band_2026" (1-6 bands) or "legacy_rlw" (0-30 section scores). */
  scale: "band_2026" | "legacy_rlw";
  tests: number;
  latest_overall: number | null;
  latest_cefr: string | null;
  latest_at: string | null;
  sections: Array<{ section: string; value: number }>;
  weakest_section: string | null;
};

export type ExamSignals = {
  practice: PracticeSummary | null;
  diagnostic: DiagnosticSummary | null;
};

export type SisterSignals = Record<"ielts" | "sat", ExamSignals> & {
  toefl: ExamSignals & { simulator: SimulatorSummary | null };
  generated_at: string;
  unavailable_sources: string[];
};

/** A skill needs this many practised items/sessions before it counts as evidence. */
export const MIN_SKILL_ATTEMPTS = 3;
export const WEAK_ACCURACY = 0.6;
export const STRONG_ACCURACY = 0.8;
export const STRONG_MIN_ATTEMPTS = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

const num = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
};

const text = (value: unknown): string | null => {
  const s = typeof value === "string" ? value.trim() : "";
  return s ? s : null;
};

const ratio = (value: unknown): number | null => {
  const n = num(value);
  return n === null || n < 0 || n > 1 ? null : n;
};

const round = (value: number, digits = 3): number => {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
};

const latest = (a: string | null, b: string | null): string | null => {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(a) >= Date.parse(b) ? a : b;
};

type SkillAccumulator = { exam: ExamKey; section: string; skill: string; weighted: number; attempts: number; last: string | null };

const aggregateSkills = (
  exam: ExamKey,
  rows: Row[],
  keyOf: (row: Row) => { section: string; skill: string } | null,
  accuracyOf: (row: Row) => number | null,
): SkillAccumulator[] => {
  const map = new Map<string, SkillAccumulator>();
  for (const row of rows) {
    const key = keyOf(row);
    const accuracy = accuracyOf(row);
    const attempts = Math.max(0, Math.floor(num(row.attempts) ?? 0));
    if (!key || accuracy === null || attempts <= 0) continue;
    const id = `${key.section}:${key.skill}`;
    const acc = map.get(id) ?? { exam, section: key.section, skill: key.skill, weighted: 0, attempts: 0, last: null };
    acc.weighted += accuracy * attempts;
    acc.attempts += attempts;
    acc.last = latest(acc.last, text(row.last_practiced_at));
    map.set(id, acc);
  }
  return [...map.values()];
};

const toSignal = (acc: SkillAccumulator): SkillSignal => ({
  exam: acc.exam,
  section: acc.section,
  skill: acc.skill,
  accuracy: round(acc.weighted / acc.attempts),
  attempts: acc.attempts,
  source: "practice",
  last_practiced_at: acc.last,
});

const splitSkills = (skills: SkillAccumulator[]) => {
  const signals = skills.filter((s) => s.attempts >= MIN_SKILL_ATTEMPTS).map(toSignal);
  const weak = signals
    .filter((s) => s.accuracy < WEAK_ACCURACY)
    .sort((a, b) => a.accuracy - b.accuracy || b.attempts - a.attempts)
    .slice(0, 5);
  const strong = signals
    .filter((s) => s.accuracy >= STRONG_ACCURACY && s.attempts >= STRONG_MIN_ATTEMPTS)
    .sort((a, b) => b.accuracy - a.accuracy || b.attempts - a.attempts)
    .slice(0, 5);
  return { weak, strong };
};

const summarizeAttempts = (
  rows: Row[],
  accuracyOf: (row: Row) => number | null,
  atOf: (row: Row) => string | null,
  now: number,
) => {
  const scored = rows
    .map((row) => ({ accuracy: accuracyOf(row), at: atOf(row) }))
    .filter((r): r is { accuracy: number; at: string | null } => r.accuracy !== null);
  const recent = scored.filter((r) => r.at && now - Date.parse(r.at) <= 30 * DAY_MS);
  const accuracy = scored.length ? round(scored.reduce((s, r) => s + r.accuracy, 0) / scored.length) : null;
  const last = scored.reduce<string | null>((acc, r) => latest(acc, r.at), null);
  return {
    attempts: scored.length,
    recent_attempts_30d: recent.length,
    accuracy,
    recent_accuracies: recent.map((r) => round(r.accuracy)),
    last_activity_at: last,
  };
};

const satSkillKey = (row: Row) => {
  const section = text(row.section_type);
  const skill = text(row.domain);
  return section && skill ? { section, skill } : null;
};

const ieltsSkillKey = (row: Row) => {
  const section = text(row.section_type);
  const skill = text(row.question_type);
  return section && skill ? { section, skill } : null;
};

const summarizeDiagnostic = (exam: ExamKey, profiles: Row[] = [], snapshots: Row[] = []): DiagnosticSummary | null => {
  const profile = profiles
    .slice()
    .sort((a, b) => Date.parse(String(b.updated_at ?? "")) - Date.parse(String(a.updated_at ?? "")))[0];
  const snapshot = snapshots
    .filter((row) => row.is_current !== false)
    .sort((a, b) => Date.parse(String(b.created_at ?? "")) - Date.parse(String(a.created_at ?? "")))[0];
  if (!profile && !snapshot) return null;
  const p = profile ?? {};
  const context = snapshot && typeof snapshot.derived_context === "object" && snapshot.derived_context
    ? snapshot.derived_context as Row
    : {};
  const toeflBands = exam === "toefl" && text(p.score_scale) === "band_2026";
  const target = exam === "ielts"
    ? num(p.target_overall_band)
    : toeflBands ? num(p.target_band) : num(p.target_total_score);
  const current = exam === "ielts"
    ? num(p.current_band_or_estimate)
    : toeflBands ? num(p.current_band) : num(p.current_score_or_estimate);
  const weakestSection = text(exam === "ielts" ? p.weakest_skill : p.weakest_section) ?? text(context.weakest_section);
  const weakestArea = text(p.weakest_domain) ?? text(context.weakest_domain) ?? text(context.weakest_area);
  return {
    target,
    current_estimate: current,
    weakest_section: weakestSection,
    weakest_area: weakestArea,
    recommendation_slug: snapshot ? text(snapshot.recommendation_slug) : null,
    updated_at: latest(text(p.updated_at), snapshot ? text(snapshot.created_at) : null),
    ...(exam === "toefl" && profile ? { scale: toeflBands ? "band_2026" : "legacy_120" } : {}),
  };
};

const record = (value: unknown): Row => (value && typeof value === "object" && !Array.isArray(value) ? value as Row : {});

const TOEFL_SECTIONS = ["reading", "listening", "writing", "speaking"] as const;

/** One TOEFL outcome in whichever format it was scored. */
export const readToeflOutcome = (row: Row): {
  scale: SimulatorSummary["scale"];
  overall: number | null;
  cefr: string | null;
  sections: Array<{ section: string; value: number }>;
  fullTest: boolean;
  at: string | null;
} => {
  const toefl = record(record(row.raw_result).toefl ?? row.toefl);
  const version = String(toefl.score_version ?? "");
  const at = text(row.computed_at);
  if (version.startsWith("toefl-2026") || toefl.format === "toefl-2026") {
    const sections = record(toefl.sections);
    return {
      scale: "band_2026",
      overall: num(toefl.overall_band) ?? num(row.overall_band),
      cefr: text(toefl.overall_cefr),
      sections: TOEFL_SECTIONS.flatMap((section) => {
        const band = num(record(sections[section]).band);
        return band === null ? [] : [{ section, value: band }];
      }),
      fullTest: toefl.mode === undefined || toefl.mode === "full_test",
      at,
    };
  }
  const legacy = (["reading", "listening", "writing"] as const).flatMap((section) => {
    const value = num(toefl[`${section}_score`]);
    return value === null ? [] : [{ section, value }];
  });
  return {
    scale: "legacy_rlw",
    overall: num(toefl.rlw_composite_score) ?? num(row.overall_score),
    cefr: null,
    sections: legacy,
    fullTest: true,
    at,
  };
};

/** Newest-first TOEFL outcomes; the 2026 format wins over legacy when both exist. */
export const summarizeToeflSimulator = (rows: Row[] = []): SimulatorSummary | null => {
  const parsed = rows.map(readToeflOutcome).filter((r) => r.overall !== null || r.sections.length > 0);
  if (parsed.length === 0) return null;
  const scale = parsed.some((r) => r.scale === "band_2026") ? "band_2026" : "legacy_rlw";
  const same = parsed.filter((r) => r.scale === scale);
  const latestFull = same.find((r) => r.fullTest && r.overall !== null) ?? null;
  const withSections = same.find((r) => r.sections.length >= 2) ?? null;
  const sections = withSections?.sections ?? [];
  const weakest = sections.length >= 2 ? sections.slice().sort((a, b) => a.value - b.value)[0] : null;
  // A section only counts as weakest when another section is actually higher.
  const weakestSection = weakest && sections.some((x) => x.value > weakest.value) ? weakest.section : null;
  return {
    scale,
    tests: same.length,
    latest_overall: latestFull?.overall ?? null,
    latest_cefr: latestFull?.cefr ?? null,
    latest_at: same[0]?.at ?? null,
    sections,
    weakest_section: weakestSection,
  };
};

/** Pure: turns raw sister-app rows into per-exam evidence. */
export const summarizeSisterSignals = (rows: SisterSignalRows, now = Date.now(), unavailable: string[] = []): SisterSignals => {
  const satSkills = splitSkills(
    aggregateSkills("sat", rows.satMastery, satSkillKey, (row) => ratio(row.rolling_accuracy) ?? ratio(row.last_accuracy)),
  );
  const satAttempts = summarizeAttempts(
    rows.satAttempts.filter((row) => row.status === undefined || row.status === "scored"),
    (row) => ratio(row.score_accuracy),
    (row) => text(row.scored_at) ?? text(row.submitted_at),
    now,
  );
  const ieltsSkills = splitSkills(
    aggregateSkills(
      "ielts",
      rows.ieltsMastery,
      ieltsSkillKey,
      (row) => ratio(row.rolling_accuracy_ratio) ?? ratio(row.last_accuracy_ratio),
    ),
  );
  const ieltsAttempts = summarizeAttempts(
    rows.ieltsAttempts.filter((row) => row.status === undefined || row.status === "scored"),
    (row) => ratio(row.accuracy_ratio),
    (row) => text(row.scored_at) ?? text(row.submitted_at),
    now,
  );

  const practice = (
    attempts: ReturnType<typeof summarizeAttempts>,
    skills: { weak: SkillSignal[]; strong: SkillSignal[] },
    masteryRows: Row[],
  ): PracticeSummary | null => {
    if (attempts.attempts === 0 && masteryRows.length === 0) return null;
    const masteryLast = masteryRows.reduce<string | null>((acc, row) => latest(acc, text(row.last_practiced_at)), null);
    return {
      ...attempts,
      last_activity_at: latest(attempts.last_activity_at, masteryLast),
      weak_skills: skills.weak,
      strong_skills: skills.strong,
    };
  };

  return {
    generated_at: new Date(now).toISOString(),
    unavailable_sources: unavailable,
    sat: {
      practice: practice(satAttempts, satSkills, rows.satMastery),
      diagnostic: summarizeDiagnostic("sat", rows.playbookProfiles.sat, rows.playbookSnapshots.sat),
    },
    ielts: {
      practice: practice(ieltsAttempts, ieltsSkills, rows.ieltsMastery),
      diagnostic: summarizeDiagnostic("ielts", rows.playbookProfiles.ielts, rows.playbookSnapshots.ielts),
    },
    toefl: {
      // No TOEFL practice app: the evidence is the playbook diagnostic and simulator results.
      practice: null,
      diagnostic: summarizeDiagnostic("toefl", rows.playbookProfiles.toefl, rows.playbookSnapshots.toefl),
      simulator: summarizeToeflSimulator(rows.toeflMocks),
    },
  };
};

/** Maps an exam_type / product slug to an exam family. */
export const examKeyOf = (value: string | null | undefined): ExamKey | null => {
  const v = String(value ?? "").toLowerCase();
  if (v.includes("ielts")) return "ielts";
  if (v.includes("toefl")) return "toefl";
  if (/(^|[^a-z])sat([^a-z]|$)/.test(v) || v === "sat") return "sat";
  return null;
};

export type ConfidenceAdjustment = {
  source: "practice";
  practice_attempts_30d: number;
  practice_accuracy_spread: number;
  factor: number;
};

/**
 * Practice consistency tightens or widens a mock-based interval. Fewer than
 * five scored practice sessions in 30 days changes nothing. The predicted
 * value is never moved and the interval always contains it.
 */
export const practiceConfidenceFactor = (practice: PracticeSummary | null): ConfidenceAdjustment | null => {
  const values = practice?.recent_accuracies ?? [];
  if (values.length < 5) return null;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const spread = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
  const factor = spread <= 0.1 ? 0.85 : spread <= 0.2 ? 0.95 : 1.1;
  return { source: "practice", practice_attempts_30d: values.length, practice_accuracy_spread: round(spread), factor };
};

export const adjustInterval = (
  predicted: number,
  low: number,
  high: number,
  factor: number,
  roundTo: (value: number) => number,
): { low: number; high: number } => {
  const lowHalf = Math.max(0, predicted - low) * factor;
  const highHalf = Math.max(0, high - predicted) * factor;
  return {
    low: Math.min(predicted, roundTo(predicted - lowHalf)),
    high: Math.max(predicted, roundTo(predicted + highHalf)),
  };
};

/** Practice-driven next steps, weakest first; each points at the app that trains it. */
export const examNextSteps = (signals: SisterSignals) => {
  const steps: Array<{ exam: ExamKey; kind: "practice_skill" | "playbook_diagnostic" | "simulator_section"; section: string | null; skill: string | null; accuracy: number | null; url: string }> = [];
  for (const skill of signals.sat.practice?.weak_skills ?? []) {
    steps.push({ exam: "sat", kind: "practice_skill", section: skill.section, skill: skill.skill, accuracy: skill.accuracy, url: "https://practice.sat.schood.online" });
  }
  for (const skill of signals.ielts.practice?.weak_skills ?? []) {
    steps.push({ exam: "ielts", kind: "practice_skill", section: skill.section, skill: skill.skill, accuracy: skill.accuracy, url: "https://practice.ielts.schood.online" });
  }
  steps.sort((a, b) => (a.accuracy ?? 1) - (b.accuracy ?? 1));
  const playbooks: Record<ExamKey, string> = {
    ielts: "https://playbook.ielts.schood.online",
    sat: "https://playbook.sat.schood.online",
    toefl: "https://playbook.toefl.schood.online",
  };
  const toeflSim = signals.toefl?.simulator;
  if (toeflSim?.weakest_section) {
    steps.push({ exam: "toefl", kind: "simulator_section", section: toeflSim.weakest_section, skill: null, accuracy: null, url: playbooks.toefl });
  }
  for (const exam of ["ielts", "sat", "toefl"] as const) {
    const diagnostic = signals[exam]?.diagnostic;
    if (diagnostic?.weakest_section || diagnostic?.weakest_area) {
      steps.push({
        exam,
        kind: "playbook_diagnostic",
        section: diagnostic.weakest_section,
        skill: diagnostic.weakest_area,
        accuracy: null,
        url: playbooks[exam],
      });
    }
  }
  return steps.slice(0, 8);
};

const safeSelect = async (
  label: string,
  unavailable: string[],
  run: () => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<Row[]> => {
  try {
    const { data, error } = await run();
    if (error) {
      unavailable.push(label);
      return [];
    }
    return Array.isArray(data) ? (data as Row[]) : [];
  } catch {
    unavailable.push(label);
    return [];
  }
};

/**
 * Reads every sister-app source for one learner with a service-role client.
 * A missing or failing table never fails the caller; it is reported in
 * `unavailable_sources` instead.
 */
// deno-lint-ignore no-explicit-any
export const loadSisterSignals = async (sb: any, userId: string, now = Date.now()): Promise<SisterSignals> => {
  const unavailable: string[] = [];
  const since = new Date(now - 180 * DAY_MS).toISOString();
  const [
    satMastery,
    satAttempts,
    ieltsMastery,
    ieltsAttempts,
    ieltsLabAttempts,
    satProfiles,
    ieltsProfiles,
    satSnapshots,
    ieltsSnapshots,
    toeflProfiles,
    toeflSnapshots,
    toeflMocks,
  ] = await Promise.all([
    safeSelect("sat_practice_mastery", unavailable, () =>
      sb.from("sat_practice_mastery")
        .select("section_type,domain,difficulty,attempts,rolling_accuracy,last_accuracy,mastery_status,last_practiced_at")
        .eq("user_id", userId).limit(500)),
    safeSelect("sat_practice_lab_attempts", unavailable, () =>
      sb.from("sat_practice_lab_attempts")
        .select("status,score_accuracy,scored_at,submitted_at")
        .eq("user_id", userId).eq("status", "scored").gte("started_at", since)
        .order("started_at", { ascending: false }).limit(100)),
    safeSelect("ielts_practice_mastery", unavailable, () =>
      sb.from("ielts_practice_mastery")
        .select("section_type,question_type,attempts,rolling_accuracy_ratio,last_accuracy_ratio,mastery_status,last_practiced_at")
        .eq("user_id", userId).limit(500)),
    safeSelect("ielts_practice_attempts", unavailable, () =>
      sb.from("ielts_practice_attempts")
        .select("status,section_type,question_type,accuracy_ratio,scored_at,submitted_at")
        .eq("user_id", userId).eq("status", "scored").gte("started_at", since)
        .order("started_at", { ascending: false }).limit(100)),
    safeSelect("ielts_practice_lab_attempts", unavailable, () =>
      sb.from("ielts_practice_lab_attempts")
        .select("status,section_type,accuracy_ratio,scored_at,submitted_at")
        .eq("user_id", userId).eq("status", "scored").gte("started_at", since)
        .order("started_at", { ascending: false }).limit(100)),
    safeSelect("sat_playbook_user_profiles", unavailable, () =>
      sb.from("sat_playbook_user_profiles").select("*").eq("user_id", userId).limit(5)),
    safeSelect("ielts_playbook_user_profiles", unavailable, () =>
      sb.from("ielts_playbook_user_profiles").select("*").eq("user_id", userId).limit(5)),
    safeSelect("sat_playbook_recommendation_snapshots", unavailable, () =>
      sb.from("sat_playbook_recommendation_snapshots")
        .select("recommendation_slug,derived_context,is_current,created_at")
        .eq("user_id", userId).eq("is_current", true).order("created_at", { ascending: false }).limit(3)),
    safeSelect("ielts_playbook_recommendation_snapshots", unavailable, () =>
      sb.from("ielts_playbook_recommendation_snapshots")
        .select("recommendation_slug,derived_context,is_current,created_at")
        .eq("user_id", userId).eq("is_current", true).order("created_at", { ascending: false }).limit(3)),
    safeSelect("toefl_playbook_user_profiles", unavailable, () =>
      sb.from("toefl_playbook_user_profiles").select("*").eq("user_id", userId).limit(5)),
    safeSelect("toefl_playbook_recommendation_snapshots", unavailable, () =>
      sb.from("toefl_playbook_recommendation_snapshots")
        .select("recommendation_slug,derived_context,is_current,created_at")
        .eq("user_id", userId).eq("is_current", true).order("created_at", { ascending: false }).limit(3)),
    // Only the TOEFL result block of raw_result is read, never the full answer payload.
    safeSelect("exam_outcomes:toefl", unavailable, () =>
      sb.from("exam_outcomes")
        .select("overall_band,overall_score,computed_at,toefl:raw_result->toefl")
        .eq("user_id", userId).eq("product_id", TOEFL_SIMULATOR_PRODUCT_ID).eq("status", "completed")
        .order("computed_at", { ascending: false }).limit(10)),
  ]);

  return summarizeSisterSignals(
    {
      satMastery,
      satAttempts,
      ieltsMastery,
      ieltsAttempts: [...ieltsAttempts, ...ieltsLabAttempts],
      playbookProfiles: { sat: satProfiles, ielts: ieltsProfiles, toefl: toeflProfiles },
      playbookSnapshots: { sat: satSnapshots, ielts: ieltsSnapshots, toefl: toeflSnapshots },
      toeflMocks,
    },
    now,
    unavailable,
  );
};

export type WeakSkill = {
  source: "mock" | "practice";
  exam: ExamKey | null;
  section: string | null;
  skill: string;
  accuracy: number;
  evidence: number;
};

/**
 * Weak skills from full mocks (exam_outcomes skill profile, ratio_avg) and from
 * practice, weakest first. Mock skills need at least one sample; practice skills
 * already passed MIN_SKILL_ATTEMPTS in summarizeSisterSignals.
 */
export const combinedWeakSkills = (
  mockProfile: Record<string, unknown> | null | undefined,
  signals: SisterSignals | null,
  limit = 8,
): WeakSkill[] => {
  const out: WeakSkill[] = [];
  for (const [skill, raw] of Object.entries(mockProfile ?? {})) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as Record<string, unknown>;
    const accuracy = ratio(entry.ratio_avg);
    const samples = Math.max(0, Math.floor(num(entry.samples) ?? 0));
    if (accuracy === null || samples < 1 || accuracy >= WEAK_ACCURACY) continue;
    out.push({ source: "mock", exam: null, section: null, skill, accuracy, evidence: samples });
  }
  for (const exam of ["ielts", "sat", "toefl"] as const) {
    for (const s of signals?.[exam].practice?.weak_skills ?? []) {
      out.push({ source: "practice", exam, section: s.section, skill: s.skill, accuracy: s.accuracy, evidence: s.attempts });
    }
  }
  return out.sort((a, b) => a.accuracy - b.accuracy || b.evidence - a.evidence).slice(0, limit);
};
