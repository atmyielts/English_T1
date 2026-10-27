// Deterministic diagnostic for the exam playbooks (SAT enabled).
//
// Pure functions only: callers load the learner's profile, simulator outcomes
// and (SAT) SAT Practice mastery rows, and this module turns them into ranked
// bottlenecks with evidence, point-impact estimates computed from the real
// gaps, module priorities that use the fixed playbook slugs, and a
// week-by-week plan suggestion that references the plan templates.
//
// Rules for every number produced here:
//   * it is derived from data the learner gave us or a recorded result;
//   * no defaults, floors or invented "typical gains";
//   * if the data is missing the field is null and the UI says so.

import { daysBetween, isoDate } from "./exam-playbook-plan.ts";

// --- Fixed slugs (contract section B) --------------------------------------

export const SAT_PUBLIC_MODULES = [
  "sat-essentials",
  "reading-writing-information-ideas",
  "reading-writing-craft-structure",
  "reading-writing-expression-of-ideas",
  "reading-writing-conventions",
  "math-algebra",
  "math-advanced-math",
  "math-problem-solving-data-analysis",
  "math-geometry-trigonometry",
  "desmos-and-calculator-strategy",
  "pacing-and-adaptive-modules",
  "test-day-guide",
  "score-goals-and-study-plans",
  "retake-and-superscore-strategy",
] as const;

export const SAT_PREMIUM_GUIDES = [
  "guide-rw-hard-module-traps",
  "guide-math-hard-module-traps",
  "guide-1200-to-1400-roadmap",
  "guide-1400-to-1550-roadmap",
  "guide-desmos-power-moves",
  "guide-final-14-days",
] as const;

export const SAT_PLAN_TEMPLATES = [
  "four-week-sprint",
  "eight-week-standard",
  "twelve-week-foundation",
  "math-priority",
  "reading-writing-priority",
] as const;

/** Fixed slugs per exam. Only the SAT playbook is enabled in this engine for now. */
export const contractSlugs = (exam: "sat" | "toefl"): { modules: string[]; guides: string[]; templates: string[] } =>
  exam === "sat"
    ? { modules: [...SAT_PUBLIC_MODULES], guides: [...SAT_PREMIUM_GUIDES], templates: [...SAT_PLAN_TEMPLATES] }
    : { modules: [], guides: [], templates: [] };

// --- Shared types -----------------------------------------------------------

type Json = Record<string, unknown>;

export type Evidence = {
  source: "simulator" | "practice" | "profile";
  metric: string;
  value: number | string | null;
  detail?: Json;
};

export type Bottleneck = {
  key: string;
  kind: "section" | "domain";
  section: string;
  domain: string | null;
  module_slugs: string[];
  current: number | null;
  target: number | null;
  gap: number | null;
  /** Estimated scaled points (SAT). */
  estimated_impact: number | null;
  impact_unit: "sat_points" | "overall_band";
  impact_basis: string;
  severity: "high" | "medium" | "low";
  evidence: Evidence[];
};

export type ModulePriority = {
  slug: string;
  rank: number;
  kind: "module" | "guide";
  reason: string;
  params: Json;
};

export type PlanSuggestionWeek = {
  week: number;
  starts_on: string;
  ends_on: string;
  modules: string[];
  template_week_label: string | null;
};

export type PlanSuggestion = {
  template_slug: string | null;
  template_title: string | null;
  template_published: boolean;
  reason: string;
  weeks_until_test: number | null;
  days_until_test: number | null;
  weeks: PlanSuggestionWeek[];
};

export type TemplateSummary = {
  slug: string;
  title?: string | null;
  duration_days?: number | null;
  schedule_json?: unknown;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const isNum = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const num = (value: unknown): number | null => {
  if (isNum(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};
const rec = (value: unknown): Json => (value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {});

const parseDay = (value: unknown): Date | null => {
  const raw = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(raw)) return null;
  const date = new Date(`${raw.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const dayOf = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

const timeline = (deadline: unknown, today: Date) => {
  const test = parseDay(deadline);
  if (!test) return { days: null as number | null, weeks: null as number | null };
  const days = daysBetween(dayOf(today), test);
  if (days < 0) return { days, weeks: 0 };
  return { days, weeks: Math.floor(days / 7) };
};

const pushUnique = (list: ModulePriority[], entry: Omit<ModulePriority, "rank">) => {
  if (list.some((item) => item.slug === entry.slug)) return;
  list.push({ ...entry, rank: list.length + 1 });
};

/** Spread the ranked modules across the available weeks; test-day material lands in the last week. */
const buildWeekOutline = (
  priorities: ModulePriority[],
  weeks: number,
  today: Date,
  templateWeeks: Array<{ label: string }>,
  testDayModules: string[],
): PlanSuggestionWeek[] => {
  const total = clamp(weeks, 1, 16);
  const start = dayOf(today);
  const study = priorities.map((p) => p.slug).filter((slug) => !testDayModules.includes(slug));
  const finals = priorities.map((p) => p.slug).filter((slug) => testDayModules.includes(slug));
  const studyWeeks = total > 1 && finals.length > 0 ? total - 1 : total;
  const perWeek = Math.max(1, Math.ceil(study.length / Math.max(1, studyWeeks)));
  const out: PlanSuggestionWeek[] = [];
  for (let w = 0; w < total; w += 1) {
    const startsOn = new Date(start.getTime() + w * 7 * 86400000);
    const endsOn = new Date(startsOn.getTime() + 6 * 86400000);
    let modules = study.slice(w * perWeek, (w + 1) * perWeek);
    if (w === total - 1 && finals.length > 0) modules = [...modules, ...finals];
    const templateIndex = templateWeeks.length > 0 ? Math.floor((w * templateWeeks.length) / total) : -1;
    out.push({
      week: w + 1,
      starts_on: isoDate(startsOn),
      ends_on: isoDate(endsOn),
      modules,
      template_week_label: templateIndex >= 0 ? templateWeeks[templateIndex]?.label ?? null : null,
    });
  }
  return out;
};

const templateWeekLabels = (template: TemplateSummary | undefined): Array<{ label: string }> => {
  const schedule = rec(template?.schedule_json);
  const weeks = Array.isArray(schedule.weeks) ? schedule.weeks : [];
  return weeks.map((week, index) => {
    const row = rec(week);
    const label = String(row.label ?? row.title ?? row.theme ?? (typeof week === "string" ? week : "") ?? "").trim();
    return { label: label || `#${index + 1}` };
  });
};

const confidenceFrom = (points: number) => (points >= 3 ? "high" : points >= 2 ? "medium" : "low");

// =============================================================================
// SAT
// =============================================================================

export const SAT_SECTIONS = ["reading_writing", "math"] as const;
export type SatSection = (typeof SAT_SECTIONS)[number];

/** Official domains, their share of each section (College Board Digital SAT specifications), and playbook modules. */
export const SAT_DOMAINS: ReadonlyArray<{
  domain: string;
  section: SatSection;
  weight: number;
  module: string;
  aliases: string[];
}> = [
  { domain: "information_and_ideas", section: "reading_writing", weight: 0.26, module: "reading-writing-information-ideas", aliases: ["information_and_ideas", "command_of_evidence", "central_ideas", "inferences"] },
  { domain: "craft_and_structure", section: "reading_writing", weight: 0.28, module: "reading-writing-craft-structure", aliases: ["craft_and_structure", "vocabulary_in_context", "words_in_context", "text_structure"] },
  { domain: "expression_of_ideas", section: "reading_writing", weight: 0.2, module: "reading-writing-expression-of-ideas", aliases: ["expression_of_ideas", "transitions", "rhetoric", "rhetorical_synthesis"] },
  { domain: "standard_english_conventions", section: "reading_writing", weight: 0.26, module: "reading-writing-conventions", aliases: ["standard_english_conventions", "grammar", "conventions", "boundaries"] },
  { domain: "algebra", section: "math", weight: 0.35, module: "math-algebra", aliases: ["algebra"] },
  { domain: "advanced_math", section: "math", weight: 0.35, module: "math-advanced-math", aliases: ["advanced_math"] },
  { domain: "problem_solving_data_analysis", section: "math", weight: 0.15, module: "math-problem-solving-data-analysis", aliases: ["problem_solving_data_analysis", "data_analysis"] },
  { domain: "geometry_trigonometry", section: "math", weight: 0.15, module: "math-geometry-trigonometry", aliases: ["geometry_trigonometry", "geometry_trig", "geometry"] },
];

export const satDomainFor = (raw: unknown) => {
  const key = String(raw ?? "").trim().toLowerCase();
  return SAT_DOMAINS.find((entry) => entry.aliases.includes(key)) ?? null;
};

export type SatOutcome = {
  id: string | null;
  computed_at: string | null;
  total: number | null;
  reading_writing: number | null;
  math: number | null;
};

const satSection = (value: unknown): number | null => {
  const n = num(value);
  return n != null && n >= 200 && n <= 800 ? Math.round(n) : null;
};

/** Read an `exam_outcomes` row written by score-session (raw_result.sat, then section_scores). */
export const parseSatOutcome = (row: Json): SatOutcome => {
  const raw = rec(row.raw_result);
  const sat = rec(raw.sat);
  let rw = satSection(sat.reading_writing_score);
  let math = satSection(sat.math_score);
  if (rw == null || math == null) {
    const sections = Object.values(rec(row.section_scores ?? raw.sections)).map(rec);
    const bySection = (type: string) => {
      const scaled = sections.filter((s) => s.type === type).map((s) => satSection(s.scaled_score_800)).filter(isNum);
      return scaled.length ? Math.round(scaled.reduce((a, b) => a + b, 0) / scaled.length / 10) * 10 : null;
    };
    rw = rw ?? bySection("reading_writing");
    math = math ?? bySection("math");
  }
  const totalRaw = num(sat.total_score) ?? num(row.overall_score);
  const total = rw != null && math != null ? rw + math : totalRaw != null && totalRaw >= 400 && totalRaw <= 1600 ? Math.round(totalRaw) : null;
  return {
    id: row.id ? String(row.id) : null,
    computed_at: row.computed_at ? String(row.computed_at) : null,
    total,
    reading_writing: rw,
    math,
  };
};

export type SatMasteryRow = {
  section_type?: unknown;
  domain?: unknown;
  difficulty?: unknown;
  attempts?: unknown;
  rolling_accuracy?: unknown;
  last_accuracy?: unknown;
  mastery_level?: unknown;
};

export type SatDomainStat = {
  domain: string;
  section: SatSection;
  attempts: number;
  accuracy: number;
};

/** Attempt-weighted accuracy per official domain (legacy domain keys are folded in). */
export const summarizeSatMastery = (rows: SatMasteryRow[]): SatDomainStat[] => {
  const totals = new Map<string, { attempts: number; correct: number; section: SatSection }>();
  for (const row of rows) {
    const domain = satDomainFor(row.domain);
    if (!domain) continue;
    const attempts = Math.max(0, Math.floor(num(row.attempts) ?? 0));
    const accuracy = num(row.rolling_accuracy) ?? num(row.last_accuracy);
    if (attempts <= 0 || accuracy == null) continue;
    const entry = totals.get(domain.domain) ?? { attempts: 0, correct: 0, section: domain.section };
    entry.attempts += attempts;
    entry.correct += clamp(accuracy, 0, 1) * attempts;
    totals.set(domain.domain, entry);
  }
  return Array.from(totals.entries()).map(([domain, entry]) => ({
    domain,
    section: entry.section,
    attempts: entry.attempts,
    accuracy: Math.round((entry.correct / entry.attempts) * 1000) / 1000,
  }));
};

export type SatProfileInput = {
  target_total_score?: unknown;
  current_score_or_estimate?: unknown;
  target_section_scores?: unknown;
  current_section_scores?: unknown;
  deadline_date?: unknown;
  purpose?: unknown;
  weakest_section?: unknown;
};

export type SatDiagnosticInput = {
  profile: SatProfileInput;
  outcomes: Json[];
  mastery: SatMasteryRow[];
  templates: TemplateSummary[];
  today?: Date;
};

/** Minimum attempts in a domain before its accuracy is used as evidence. */
export const SAT_MIN_DOMAIN_ATTEMPTS = 5;

const roundTo10 = (value: number) => Math.round(value / 10) * 10;
const satSeverity = (points: number | null) => (points == null ? "low" : points >= 40 ? "high" : points >= 20 ? "medium" : "low");

export const buildSatDiagnostic = (input: SatDiagnosticInput) => {
  const today = input.today ?? new Date();
  const profile = input.profile ?? {};
  const outcomes = input.outcomes.map(parseSatOutcome).filter((o) => o.total != null || o.reading_writing != null || o.math != null);
  const latest = outcomes[0] ?? null;
  const profileSections = rec(profile.current_section_scores);
  const targetSections = rec(profile.target_section_scores);

  const targetTotal = (() => {
    const n = num(profile.target_total_score);
    return n != null && n >= 400 && n <= 1600 ? Math.round(n) : null;
  })();

  // Current section scores: latest simulator result first, then the learner's own numbers.
  const current: Record<SatSection, { value: number | null; source: "simulator" | "profile" | null }> = {
    reading_writing: { value: null, source: null },
    math: { value: null, source: null },
  };
  for (const section of SAT_SECTIONS) {
    const fromSim = latest ? latest[section] : null;
    if (fromSim != null) current[section] = { value: fromSim, source: "simulator" };
    else {
      const fromProfile = satSection(profileSections[section]);
      if (fromProfile != null) current[section] = { value: fromProfile, source: "profile" };
    }
  }
  const profileTotal = (() => {
    const n = num(profile.current_score_or_estimate);
    return n != null && n >= 400 && n <= 1600 ? Math.round(n) : null;
  })();
  const currentTotal = current.reading_writing.value != null && current.math.value != null
    ? current.reading_writing.value + current.math.value
    : latest?.total ?? profileTotal;
  const currentTotalSource = current.reading_writing.value != null && current.math.value != null
    ? (current.reading_writing.source === "simulator" && current.math.source === "simulator" ? "simulator" : "mixed")
    : latest?.total != null ? "simulator" : profileTotal != null ? "profile" : null;

  // Section targets: explicit section targets, else the total target split by
  // the current section balance (so the gap is shared in proportion), else evenly.
  const target: Record<SatSection, number | null> = { reading_writing: null, math: null };
  for (const section of SAT_SECTIONS) {
    const explicit = satSection(targetSections[section]);
    if (explicit != null) target[section] = explicit;
  }
  if (targetTotal != null) {
    const missing = SAT_SECTIONS.filter((s) => target[s] == null);
    if (missing.length === 1) {
      const other = SAT_SECTIONS.find((s) => s !== missing[0])!;
      target[missing[0]] = clamp(targetTotal - (target[other] ?? 0), 200, 800);
    } else if (missing.length === 2) {
      target.reading_writing = clamp(roundTo10(targetTotal / 2), 200, 800);
      target.math = clamp(targetTotal - target.reading_writing, 200, 800);
    }
  }
  const targetSplit = SAT_SECTIONS.every((s) => satSection(targetSections[s]) != null) ? "explicit" : targetTotal != null ? "even_split" : null;

  const domainStats = summarizeSatMastery(input.mastery);
  const practiceAttempts = domainStats.reduce((sum, d) => sum + d.attempts, 0);

  const bottlenecks: Bottleneck[] = [];
  const untested: Array<{ section: string; domain: string | null; module_slugs: string[]; reason: string }> = [];
  const sectionSummaries: Json[] = [];

  for (const section of SAT_SECTIONS) {
    const cur = current[section].value;
    const tgt = target[section];
    const gap = cur != null && tgt != null ? tgt - cur : null;
    sectionSummaries.push({
      section,
      current: cur,
      current_source: current[section].source,
      target: tgt,
      gap,
      simulator_history: outcomes.slice(0, 5).map((o) => ({ computed_at: o.computed_at, score: o[section] })).filter((o) => o.score != null),
    });

    const sectionDomains = SAT_DOMAINS.filter((d) => d.section === section);
    const measured = sectionDomains
      .map((d) => ({ meta: d, stat: domainStats.find((s) => s.domain === d.domain && s.attempts >= SAT_MIN_DOMAIN_ATTEMPTS) ?? null }));
    const withData = measured.filter((m) => m.stat);

    if (withData.length > 0) {
      // Accuracy needed for the section target on the 200–800 linear scale the
      // simulator uses (score = 200 + 600 × accuracy).
      const targetAccuracy = tgt != null ? clamp((tgt - 200) / 600, 0, 1) : null;
      for (const { meta, stat } of withData) {
        const s = stat!;
        const shortfall = targetAccuracy != null ? Math.max(0, targetAccuracy - s.accuracy) : null;
        const points = shortfall != null ? roundTo10(600 * meta.weight * shortfall) : null;
        if (points != null && points <= 0) continue;
        bottlenecks.push({
          key: `domain:${meta.domain}`,
          kind: "domain",
          section,
          domain: meta.domain,
          module_slugs: [meta.module],
          current: Math.round(s.accuracy * 100),
          target: targetAccuracy != null ? Math.round(targetAccuracy * 100) : null,
          gap: shortfall != null ? Math.round(shortfall * 100) : null,
          estimated_impact: points,
          impact_unit: "sat_points",
          impact_basis: "domain_accuracy_gap",
          severity: satSeverity(points),
          evidence: [
            { source: "practice", metric: "accuracy_pct", value: Math.round(s.accuracy * 100), detail: { attempts: s.attempts } },
            { source: "practice", metric: "domain_share_pct", value: Math.round(meta.weight * 100) },
            ...(tgt != null ? [{ source: "profile" as const, metric: "section_target", value: tgt }] : []),
          ],
        });
      }
      for (const { meta } of measured.filter((m) => !m.stat)) {
        untested.push({ section, domain: meta.domain, module_slugs: [meta.module], reason: "too_few_practice_attempts" });
      }
    } else if (gap != null && gap > 0) {
      bottlenecks.push({
        key: `section:${section}`,
        kind: "section",
        section,
        domain: null,
        module_slugs: sectionDomains.map((d) => d.module),
        current: cur,
        target: tgt,
        gap,
        estimated_impact: gap,
        impact_unit: "sat_points",
        impact_basis: "section_score_gap",
        severity: satSeverity(gap),
        evidence: [
          { source: current[section].source ?? "profile", metric: "section_score", value: cur },
          { source: "profile", metric: "section_target", value: tgt, detail: { split: targetSplit } },
        ],
      });
    } else if (cur == null) {
      untested.push({ section, domain: null, module_slugs: sectionDomains.map((d) => d.module), reason: "no_section_score" });
    }
  }

  bottlenecks.sort((a, b) => (b.estimated_impact ?? -1) - (a.estimated_impact ?? -1) || (a.current ?? 0) - (b.current ?? 0));

  const weakestSection: SatSection | null = (() => {
    const gaps = SAT_SECTIONS.map((s) => ({
      s,
      g: bottlenecks.filter((b) => b.section === s).reduce((sum, b) => sum + (b.estimated_impact ?? 0), 0),
    }));
    const sorted = gaps.sort((a, b) => b.g - a.g);
    if (sorted[0].g > 0) return sorted[0].s;
    const declared = String(profile.weakest_section ?? "");
    return declared === "reading_writing" || declared === "math" ? declared : null;
  })();

  const time = timeline(profile.deadline_date, today);
  const evidencePoints = (latest ? 1 : 0) + (practiceAttempts >= SAT_MIN_DOMAIN_ATTEMPTS ? 1 : 0) + (currentTotal != null || targetTotal != null ? 1 : 0);
  const totalGap = currentTotal != null && targetTotal != null ? targetTotal - currentTotal : null;

  // --- Module priorities ---------------------------------------------------
  const priorities: ModulePriority[] = [];
  if (!latest && practiceAttempts < SAT_MIN_DOMAIN_ATTEMPTS) {
    pushUnique(priorities, { slug: "sat-essentials", kind: "module", reason: "no_evidence_yet", params: {} });
  }
  for (const b of bottlenecks) {
    for (const slug of b.module_slugs) {
      pushUnique(priorities, {
        slug,
        kind: "module",
        reason: b.kind === "domain" ? "domain_gap" : "section_gap",
        params: { section: b.section, domain: b.domain ?? "", points: b.estimated_impact ?? 0 },
      });
    }
  }
  if (weakestSection === "math") pushUnique(priorities, { slug: "desmos-and-calculator-strategy", kind: "module", reason: "math_bottleneck", params: {} });
  if (time.days != null && time.days >= 0 && time.days <= 21) {
    pushUnique(priorities, { slug: "test-day-guide", kind: "module", reason: "test_soon", params: { days: time.days } });
    pushUnique(priorities, { slug: "guide-final-14-days", kind: "guide", reason: "test_soon", params: { days: time.days } });
  }
  if (currentTotal != null) pushUnique(priorities, { slug: "pacing-and-adaptive-modules", kind: "module", reason: "adaptive_routing", params: {} });
  for (const section of SAT_SECTIONS) {
    const cur = current[section].value;
    if (cur != null && cur >= 600) {
      pushUnique(priorities, {
        slug: section === "math" ? "guide-math-hard-module-traps" : "guide-rw-hard-module-traps",
        kind: "guide",
        reason: "hard_module_level",
        params: { section, score: cur },
      });
    }
  }
  if (weakestSection === "math" && current.math.value != null && current.math.value >= 550) {
    pushUnique(priorities, { slug: "guide-desmos-power-moves", kind: "guide", reason: "math_bottleneck", params: {} });
  }
  if (currentTotal != null && targetTotal != null && targetTotal > currentTotal) {
    if (currentTotal < 1400 && targetTotal >= 1250) {
      pushUnique(priorities, { slug: "guide-1200-to-1400-roadmap", kind: "guide", reason: "score_band_roadmap", params: { current: currentTotal, target: targetTotal } });
    }
    if (currentTotal >= 1300 && targetTotal >= 1450) {
      pushUnique(priorities, { slug: "guide-1400-to-1550-roadmap", kind: "guide", reason: "score_band_roadmap", params: { current: currentTotal, target: targetTotal } });
    }
  }
  if (String(profile.purpose ?? "") === "retake") pushUnique(priorities, { slug: "retake-and-superscore-strategy", kind: "module", reason: "retake_purpose", params: {} });
  pushUnique(priorities, { slug: "score-goals-and-study-plans", kind: "module", reason: "planning", params: {} });
  if (time.days == null || time.days > 21) pushUnique(priorities, { slug: "test-day-guide", kind: "module", reason: "before_test", params: {} });

  // --- Plan template suggestion -----------------------------------------
  const sectionShare = (s: SatSection) => {
    const all = bottlenecks.reduce((sum, b) => sum + (b.estimated_impact ?? 0), 0);
    if (all <= 0) return 0;
    return bottlenecks.filter((b) => b.section === s).reduce((sum, b) => sum + (b.estimated_impact ?? 0), 0) / all;
  };
  let templateSlug: string;
  let reason: string;
  if (time.weeks != null && time.weeks <= 5) {
    templateSlug = "four-week-sprint";
    reason = "short_runway";
  } else if (sectionShare("math") >= 2 / 3) {
    templateSlug = "math-priority";
    reason = "math_dominates_gap";
  } else if (sectionShare("reading_writing") >= 2 / 3) {
    templateSlug = "reading-writing-priority";
    reason = "rw_dominates_gap";
  } else if (time.weeks != null && time.weeks <= 10) {
    templateSlug = "eight-week-standard";
    reason = "medium_runway";
  } else if (time.weeks != null) {
    templateSlug = "twelve-week-foundation";
    reason = "long_runway";
  } else if (totalGap != null && totalGap >= 200) {
    templateSlug = "twelve-week-foundation";
    reason = "large_gap_no_date";
  } else {
    templateSlug = "eight-week-standard";
    reason = "no_test_date";
  }
  const template = input.templates.find((t) => t.slug === templateSlug);
  const outlineWeeks = time.weeks != null && time.weeks > 0
    ? time.weeks
    : template?.duration_days ? Math.ceil(Number(template.duration_days) / 7) : 8;
  const planSuggestion: PlanSuggestion = {
    template_slug: templateSlug,
    template_title: template?.title ? String(template.title) : null,
    template_published: !!template,
    reason,
    weeks_until_test: time.weeks,
    days_until_test: time.days,
    weeks: buildWeekOutline(priorities, outlineWeeks, today, templateWeekLabels(template), ["test-day-guide", "guide-final-14-days"]),
  };

  return {
    exam: "sat" as const,
    version: "sat-playbook-diagnostic-v2",
    generated_at: today.toISOString(),
    score_scale: "sat_400_1600",
    current: {
      total: currentTotal,
      total_source: currentTotalSource,
      measured_at: latest?.computed_at ?? null,
      sections: sectionSummaries,
    },
    target: { total: targetTotal, sections: target, split: targetSplit },
    gap: { total: totalGap },
    bottlenecks,
    untested,
    module_priorities: priorities,
    plan_suggestion: planSuggestion,
    data_quality: {
      simulator_sessions: outcomes.length,
      practice_attempts: practiceAttempts,
      practice_domains_measured: domainStats.filter((d) => d.attempts >= SAT_MIN_DOMAIN_ATTEMPTS).length,
      profile_score: profileTotal != null || SAT_SECTIONS.some((s) => satSection(profileSections[s]) != null),
      confidence: confidenceFrom(evidencePoints),
    },
    weakest_section: weakestSection,
    latest_outcome_id: latest?.id ?? null,
  };
};

export type DiagnosticResult = ReturnType<typeof buildSatDiagnostic>;
