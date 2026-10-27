// Learner insights computed only from real answers (no invented floors).
import { OFFICIAL_DOMAIN_IDS, OFFICIAL_DOMAINS, type OfficialDomain } from "./sat-practice-content.ts";
import type { CatalogEntry } from "./sat-practice-selection.ts";

export type DomainStat = {
  official_domain: OfficialDomain; section_type: "math" | "reading_writing"; bank: number; answered: number; correct: number;
  accuracy: number | null; skills: Array<{ skill: string; bank: number; answered: number; correct: number; accuracy: number | null }>;
};

/** Per official domain and skill: questions in the bank, distinct questions answered, and the share answered correctly on the latest try. */
export function domainStats(entries: CatalogEntry[]): DomainStat[] {
  return OFFICIAL_DOMAIN_IDS.map(domain => {
    const pool = entries.filter(q => q.official_domain === domain);
    const answered = pool.filter(q => q.status !== "unseen"), correct = answered.filter(q => q.status === "correct");
    const skills = OFFICIAL_DOMAINS[domain].skills.map(skill => {
      const s = pool.filter(q => q.skill === skill), a = s.filter(q => q.status !== "unseen"), c = a.filter(q => q.status === "correct");
      return { skill, bank: s.length, answered: a.length, correct: c.length, accuracy: a.length ? Math.round((c.length / a.length) * 1000) / 1000 : null };
    });
    return { official_domain: domain, section_type: OFFICIAL_DOMAINS[domain].section, bank: pool.length, answered: answered.length, correct: correct.length,
      accuracy: answered.length ? Math.round((correct.length / answered.length) * 1000) / 1000 : null, skills };
  });
}

// Approximate share of each section's questions per domain (College Board test
// specifications). A section is reported on a 200-800 scale, so a domain
// "carries" about share x 600 scaled points if every question counted equally.
export const DOMAIN_SHARE: Record<OfficialDomain, number> = {
  craft_and_structure: 0.28, information_and_ideas: 0.26, standard_english_conventions: 0.26, expression_of_ideas: 0.2,
  algebra: 0.35, advanced_math: 0.35, problem_solving_data_analysis: 0.15, geometry_trigonometry: 0.15,
};
export const MIN_ANSWERS_FOR_ESTIMATE = 8;
const TARGET_ACCURACY = 0.9;

export type ScoreImpact =
  | { status: "insufficient_data"; answered_total: number; min_answers: number; conservative: null; optimistic: null; domains: [] }
  | { status: "ok"; conservative: number; optimistic: number; min_answers: number; answered_total: number;
    domains: Array<{ official_domain: OfficialDomain; answered: number; accuracy: number; points_low: number; points_high: number }> };

const round10 = (n: number) => Math.round(n / 10) * 10;

/**
 * Rough "if you fixed your weakest domains" range from the learner's own
 * accuracy: (90% - accuracy) x domain share x 600 points, for up to three
 * domains with at least MIN_ANSWERS_FOR_ESTIMATE answered questions. The low
 * end assumes half of that gap is closed. Without enough answers it says so.
 */
export function scoreImpact(stats: DomainStat[]): ScoreImpact {
  const answeredTotal = stats.reduce((s, d) => s + d.answered, 0);
  const eligible = stats.filter(d => d.answered >= MIN_ANSWERS_FOR_ESTIMATE && d.accuracy !== null)
    .map(d => {
      const gap = Math.max(0, TARGET_ACCURACY - (d.accuracy as number));
      const high = gap * DOMAIN_SHARE[d.official_domain] * 600;
      return { official_domain: d.official_domain, answered: d.answered, accuracy: d.accuracy as number, points_low: round10(high / 2), points_high: round10(high) };
    })
    .filter(d => d.points_high > 0)
    .sort((a, b) => b.points_high - a.points_high)
    .slice(0, 3);
  if (!stats.some(d => d.answered >= MIN_ANSWERS_FOR_ESTIMATE)) {
    return { status: "insufficient_data", answered_total: answeredTotal, min_answers: MIN_ANSWERS_FOR_ESTIMATE, conservative: null, optimistic: null, domains: [] };
  }
  return { status: "ok", conservative: eligible.reduce((s, d) => s + d.points_low, 0), optimistic: eligible.reduce((s, d) => s + d.points_high, 0),
    min_answers: MIN_ANSWERS_FOR_ESTIMATE, answered_total: answeredTotal, domains: eligible };
}
