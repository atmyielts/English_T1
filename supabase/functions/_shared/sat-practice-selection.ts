// Pure question selection for SAT Practice: bank filters, plan drills that fill
// to the promised count, and Digital SAT style timed modules. Works on the
// answer-key-free catalog returned by select_sat_practice_catalog().
import {
  answerFormatOf, type AnswerFormat, type Difficulty, LEGACY_SKILLS, LEGACY_TO_OFFICIAL, type LegacyDomain, MATH_DOMAIN_ORDER,
  OFFICIAL_DOMAINS, type OfficialDomain, officialTaxonomy, RW_MODULE_ORDER, type SatSection,
} from "./sat-practice-content.ts";

export type QuestionStatus = "unseen" | "missed" | "correct";
export type CatalogEntry = {
  id: string; section_type: SatSection; domain: LegacyDomain; difficulty: Difficulty; official_domain: OfficialDomain;
  skill: string | null; format: AnswerFormat; status: QuestionStatus; seen: number; correct_count: number;
  last_seen_at: string | null; bank_order: number; has_table: boolean; has_figure: boolean; has_passage: boolean;
};

const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];
const difficultyIndex = (d: Difficulty) => DIFFICULTIES.indexOf(d);
const str = (v: unknown) => typeof v === "string" ? v : null;

export function normalizeCatalog(rows: unknown): CatalogEntry[] {
  if (!Array.isArray(rows)) return [];
  const out: CatalogEntry[] = [];
  for (const raw of rows) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    if (typeof r.id !== "string") continue;
    const section = r.section_type === "math" ? "math" : "reading_writing";
    const domain = (str(r.domain) ?? (section === "math" ? "algebra" : "grammar")) as LegacyDomain;
    const taxonomy = officialTaxonomy({ sat_official_domain: r.official_domain, sat_skill: r.skill, sat_domain: r.sat_domain }, domain);
    const seen = Number(r.seen ?? 0) || 0;
    const status: QuestionStatus = seen === 0 ? "unseen" : r.last_correct === true ? "correct" : r.last_correct === false ? "missed"
      : Number(r.correct_count ?? 0) >= seen ? "correct" : "missed";
    out.push({
      id: r.id, section_type: section, domain, difficulty: (DIFFICULTIES as string[]).includes(String(r.difficulty)) ? r.difficulty as Difficulty : "medium",
      official_domain: OFFICIAL_DOMAINS[taxonomy.official_domain].section === section ? taxonomy.official_domain : LEGACY_TO_OFFICIAL[domain],
      skill: taxonomy.skill, format: answerFormatOf(r.type, { answer_format: r.answer_format }), status, seen,
      correct_count: Number(r.correct_count ?? 0) || 0, last_seen_at: str(r.last_seen_at),
      bank_order: Number(r.bank_order ?? out.length + 1) || out.length + 1,
      has_table: r.has_table === true, has_figure: r.has_figure === true, has_passage: r.has_passage === true,
    });
  }
  return out;
}

export type CatalogFilters = {
  section_type?: SatSection; official_domain?: OfficialDomain; skill?: string; difficulty?: Difficulty;
  format?: AnswerFormat; status?: QuestionStatus; domain?: LegacyDomain;
};

export function filterCatalog(entries: CatalogEntry[], f: CatalogFilters): CatalogEntry[] {
  return entries.filter(q => (!f.section_type || q.section_type === f.section_type)
    && (!f.official_domain || q.official_domain === f.official_domain)
    && (!f.skill || q.skill === f.skill)
    && (!f.difficulty || q.difficulty === f.difficulty)
    && (!f.format || q.format === f.format)
    && (!f.status || q.status === f.status)
    && (!f.domain || q.domain === f.domain));
}

/** Unseen first (bank order), then missed questions seen longest ago, then correct ones seen longest ago. */
export function preferenceOrder(entries: CatalogEntry[]): CatalogEntry[] {
  const rank = (q: CatalogEntry) => q.status === "unseen" ? 0 : q.status === "missed" ? 1 : 2;
  const time = (q: CatalogEntry) => q.last_seen_at ? Date.parse(q.last_seen_at) || 0 : 0;
  return [...entries].sort((a, b) => rank(a) - rank(b) || (rank(a) ? time(a) - time(b) : 0) || a.bank_order - b.bank_order);
}

export type DrillTarget = {
  section_type: SatSection; official_domain: OfficialDomain; skills?: string[] | null; legacy_domain?: LegacyDomain | null; difficulty: Difficulty;
};

/** Plan target for a legacy mastery row (old plans and mastery are keyed by the nine internal domains). */
export function targetFromLegacy(domain: LegacyDomain, difficulty: Difficulty): DrillTarget {
  const official = LEGACY_TO_OFFICIAL[domain];
  return { section_type: OFFICIAL_DOMAINS[official].section, official_domain: official, skills: LEGACY_SKILLS[domain] ?? null, legacy_domain: domain, difficulty };
}

export type DrillSelection = { ids: string[]; requested: number; available: number; widened: Array<"difficulty" | "neighbouring_skills"> };

/**
 * Fill a drill to `count`: the target skill at the target difficulty, then the
 * same skill at neighbouring then remaining difficulties, then neighbouring
 * skills of the same official domain. Never repeats a question; prefers unseen,
 * then questions missed longest ago. `available` < `requested` means the bank
 * is smaller than promised and the learner must be told.
 */
export function selectDrill(entries: CatalogEntry[], target: DrillTarget, count: number): DrillSelection {
  const inDomain = entries.filter(q => q.section_type === target.section_type && q.official_domain === target.official_domain);
  const exact = (q: CatalogEntry) => target.skills?.length ? (q.skill ? target.skills.includes(q.skill) : q.domain === target.legacy_domain)
    : target.legacy_domain ? q.domain === target.legacy_domain || !q.skill : true;
  const distance = (q: CatalogEntry) => Math.abs(difficultyIndex(q.difficulty) - difficultyIndex(target.difficulty));
  const tiers: Array<{ pick: (q: CatalogEntry) => boolean; widened?: "difficulty" | "neighbouring_skills" }> = [
    { pick: q => exact(q) && distance(q) === 0 },
    { pick: q => exact(q) && distance(q) === 1, widened: "difficulty" },
    { pick: q => exact(q) && distance(q) === 2, widened: "difficulty" },
    { pick: q => !exact(q) && distance(q) === 0, widened: "neighbouring_skills" },
    { pick: q => !exact(q) && distance(q) === 1, widened: "neighbouring_skills" },
    { pick: q => !exact(q) && distance(q) === 2, widened: "neighbouring_skills" },
  ];
  const chosen = new Set<string>(), widened = new Set<"difficulty" | "neighbouring_skills">();
  for (const tier of tiers) {
    if (chosen.size >= count) break;
    for (const q of preferenceOrder(inDomain.filter(tier.pick))) {
      if (chosen.size >= count) break;
      if (chosen.has(q.id)) continue;
      chosen.add(q.id);
      if (tier.widened) widened.add(tier.widened);
    }
  }
  return { ids: [...chosen], requested: count, available: chosen.size, widened: [...widened] };
}

// ------------------------------------------------------------------ modules
export type ModuleSection = SatSection;
export type ModuleProfile = "standard" | "harder";
export const MODULE_SPEC: Record<ModuleSection, { questions: number; minutes: number; mix: Partial<Record<OfficialDomain, number>> }> = {
  // Digital SAT: R&W module = 27 questions / 32 minutes, Math module = 22 / 35.
  // Domain mix from the College Board test specifications (per-module share).
  reading_writing: { questions: 27, minutes: 32, mix: { craft_and_structure: 7, information_and_ideas: 7, standard_english_conventions: 7, expression_of_ideas: 6 } },
  math: { questions: 22, minutes: 35, mix: { algebra: 8, advanced_math: 7, problem_solving_data_analysis: 4, geometry_trigonometry: 3 } },
};
const PROFILE: Record<ModuleProfile, Record<Difficulty, number>> = {
  standard: { easy: 0.3, medium: 0.4, hard: 0.3 },
  harder: { easy: 0.1, medium: 0.4, hard: 0.5 },
};

export type ModuleBuild = {
  section: ModuleSection; profile: ModuleProfile; ids: string[]; requested: number; time_limit_seconds: number;
  domains: Array<{ official_domain: OfficialDomain; wanted: number; selected: number }>;
};

function splitByDifficulty(total: number, profile: ModuleProfile): Record<Difficulty, number> {
  const shares = PROFILE[profile];
  const base = Object.fromEntries(DIFFICULTIES.map(d => [d, Math.floor(total * shares[d])])) as Record<Difficulty, number>;
  let left = total - DIFFICULTIES.reduce((s, d) => s + base[d], 0);
  for (const d of [...DIFFICULTIES].sort((a, b) => (total * shares[b] % 1) - (total * shares[a] % 1))) { if (left <= 0) break; base[d] += 1; left -= 1; }
  return base;
}

/** Round-robin over skills so one module covers the domain rather than one skill. */
function spreadSkills(pool: CatalogEntry[]): CatalogEntry[] {
  const groups = new Map<string, CatalogEntry[]>();
  for (const q of preferenceOrder(pool)) {
    const key = q.skill ?? q.domain;
    groups.set(key, [...(groups.get(key) ?? []), q]);
  }
  const lists = [...groups.values()], out: CatalogEntry[] = [];
  for (let i = 0; out.length < pool.length; i += 1) for (const list of lists) if (list[i]) out.push(list[i]!);
  return out;
}

export function buildModule(entries: CatalogEntry[], section: ModuleSection, profile: ModuleProfile = "standard"): ModuleBuild {
  const spec = MODULE_SPEC[section];
  const sectionPool = entries.filter(q => q.section_type === section);
  const chosen = new Map<string, CatalogEntry>();
  const domains: ModuleBuild["domains"] = [];
  const order = section === "math" ? MATH_DOMAIN_ORDER : RW_MODULE_ORDER;
  for (const domain of order) {
    const wanted = spec.mix[domain] ?? 0;
    const pool = sectionPool.filter(q => q.official_domain === domain);
    const split = splitByDifficulty(wanted, profile);
    const picked: CatalogEntry[] = [];
    for (const d of DIFFICULTIES) for (const q of spreadSkills(pool.filter(x => x.difficulty === d)).slice(0, split[d])) picked.push(q);
    // A difficulty band that is short borrows from the domain's other bands.
    for (const q of spreadSkills(pool)) { if (picked.length >= wanted) break; if (!picked.includes(q)) picked.push(q); }
    for (const q of picked.slice(0, wanted)) chosen.set(q.id, q);
    domains.push({ official_domain: domain, wanted, selected: Math.min(wanted, picked.length) });
  }
  // A domain the bank cannot fill yet: complete the module from the rest of the section.
  for (const q of spreadSkills(sectionPool)) { if (chosen.size >= spec.questions) break; if (!chosen.has(q.id)) chosen.set(q.id, q); }
  const ordered = [...chosen.values()].sort((a, b) => section === "math"
    ? difficultyIndex(a.difficulty) - difficultyIndex(b.difficulty) || order.indexOf(a.official_domain) - order.indexOf(b.official_domain) || a.bank_order - b.bank_order
    : order.indexOf(a.official_domain) - order.indexOf(b.official_domain) || difficultyIndex(a.difficulty) - difficultyIndex(b.difficulty) || a.bank_order - b.bank_order);
  const n = ordered.length;
  // Same pace as the real module when the bank cannot fill all questions yet.
  const seconds = n >= spec.questions ? spec.minutes * 60 : Math.max(60, Math.round((spec.minutes * 60 * n) / spec.questions / 60) * 60);
  return { section, profile, ids: ordered.map(q => q.id), requested: spec.questions, time_limit_seconds: seconds, domains };
}

/** Facet counts for the bank filters (over the rows that match every other filter). */
export function catalogFacets(entries: CatalogEntry[]) {
  const count = <K extends string>(key: (q: CatalogEntry) => K | null) => {
    const out: Record<string, number> = {};
    for (const q of entries) { const k = key(q); if (k) out[k] = (out[k] ?? 0) + 1; }
    return out;
  };
  return {
    total: entries.length,
    section_type: count(q => q.section_type), official_domain: count(q => q.official_domain), skill: count(q => q.skill),
    difficulty: count(q => q.difficulty), format: count(q => q.format), status: count(q => q.status),
  };
}

/** Typical Digital SAT pace per question, used only to estimate plan task minutes. */
export const SECONDS_PER_QUESTION: Record<SatSection, number> = { reading_writing: 71, math: 95 };
export const estimateMinutes = (section: SatSection, questions: number) => Math.max(5, Math.ceil((questions * SECONDS_PER_QUESTION[section]) / 60) + 3);
