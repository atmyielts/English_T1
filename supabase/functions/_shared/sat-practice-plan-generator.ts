// Weekly SAT Practice plan from the learner's goal (target score, test date,
// hours per week) and real per-domain accuracy. Each item is startable and is
// marked done by the completion RPC when its drill or module is submitted.
import { type Difficulty, legacyDomainFor, OFFICIAL_DOMAINS, type OfficialDomain } from "./sat-practice-content.ts";
import type { DomainStat } from "./sat-practice-insights.ts";
import { DOMAIN_SHARE } from "./sat-practice-insights.ts";
import { estimateMinutes, MODULE_SPEC, SECONDS_PER_QUESTION } from "./sat-practice-selection.ts";

export type PlanTask = {
  scheduled_for: string;
  task_type: "drill" | "notebook_review" | "module";
  payload: Record<string, unknown>;
  estimated_minutes: number;
};
export type PlanGoals = { targetScore: number; testDate: string | null; hoursPerWeek: number };

const DIFFS: Difficulty[] = ["easy", "medium", "hard"];
const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00.000Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10);
};
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

export function baseDifficulty(targetScore: number): Difficulty {
  return targetScore >= 1450 ? "hard" : targetScore >= 1200 ? "medium" : "easy";
}

/** Domains ordered by need: undiagnosed first, then by score points at stake given current accuracy. */
export function domainPriorities(stats: DomainStat[]) {
  return stats.filter(d => d.bank > 0).map(d => {
    const diagnosed = d.answered >= 5 && d.accuracy !== null;
    const need = diagnosed ? (1 - (d.accuracy as number)) * DOMAIN_SHARE[d.official_domain] : 1 + DOMAIN_SHARE[d.official_domain];
    return { stat: d, diagnosed, need };
  }).sort((a, b) => b.need - a.need);
}

export function buildSatPracticePlan(stats: DomainStat[], goals: PlanGoals, opts: { today: string; dueReviews: number }): PlanTask[] {
  const today = opts.today;
  const daysToTest = goals.testDate ? daysBetween(today, goals.testDate) : null;
  const upcoming = daysToTest !== null && daysToTest >= 0 ? daysToTest : null;
  const dailyBudget = Math.max(15, Math.round((Math.max(1, Math.min(40, goals.hoursPerWeek)) * 60) / 7));
  const base = baseDifficulty(goals.targetScore);
  const priorities = domainPriorities(stats);
  const focus = priorities.slice(0, Math.min(5, priorities.length));
  const sections = new Set(priorities.map(p => p.stat.section_type));
  const tasks: PlanTask[] = [];
  if (!focus.length) return tasks;
  // Timed modules: one a week, two when the test is four weeks away or less.
  const weakerSection = (["reading_writing", "math"] as const).filter(s => sections.has(s))
    .map(s => ({ s, need: priorities.filter(p => p.stat.section_type === s).reduce((n, p) => n + p.need, 0) }))
    .sort((a, b) => b.need - a.need).map(x => x.s);
  const moduleDays = new Map<number, "reading_writing" | "math">();
  if (weakerSection.length) {
    moduleDays.set(2, weakerSection[0]!);
    if (upcoming !== null && upcoming <= 28) moduleDays.set(5, weakerSection[1] ?? weakerSection[0]!);
  }
  let cursor = 0;
  for (let day = 0; day < 7; day += 1) {
    const date = addDays(today, day);
    if (upcoming !== null && day > upcoming) break; // nothing scheduled after the test
    let budget = dailyBudget;
    const moduleSection = moduleDays.get(day);
    if (moduleSection && budget >= 20) {
      const spec = MODULE_SPEC[moduleSection];
      const strong = priorities.filter(p => p.stat.section_type === moduleSection && p.diagnosed && (p.stat.accuracy ?? 0) >= 0.7).length >= 2;
      tasks.push({ scheduled_for: date, task_type: "module", estimated_minutes: spec.minutes + 5,
        payload: { section_type: moduleSection, module_section: moduleSection, profile: strong && goals.targetScore >= 1400 ? "harder" : "standard",
          reason: upcoming !== null && upcoming <= 28 ? "test_soon" : "pacing", day_index: day } });
      budget -= spec.minutes + 5;
    }
    if ((day === 0 && opts.dueReviews > 0) || day % 2 === 1) {
      tasks.push({ scheduled_for: date, task_type: "notebook_review", estimated_minutes: 10,
        payload: { count: 5, reason: opts.dueReviews > 0 ? "reviews_due" : "retention", day_index: day } });
      budget -= 10;
    }
    let drills = 0;
    while (budget >= 10 && drills < 2) {
      const pick = focus[cursor % focus.length]!; cursor += 1;
      const d = pick.stat;
      let level = DIFFS.indexOf(base);
      if (pick.diagnosed && (d.accuracy as number) < 0.5) level -= 1;
      if (pick.diagnosed && (d.accuracy as number) >= 0.85) level += 1;
      const difficulty = DIFFS[Math.max(0, Math.min(2, level))]!;
      const perQuestion = SECONDS_PER_QUESTION[d.section_type] / 60;
      const count = Math.max(5, Math.min(15, Math.floor((Math.min(budget, 25) - 3) / perQuestion)));
      // Weakest skill inside the domain when there is data for it.
      const skill = d.skills.filter(s => s.bank > 0).sort((a, b) => (a.accuracy ?? -1) - (b.accuracy ?? -1))[0];
      const official = d.official_domain as OfficialDomain;
      const minutes = estimateMinutes(d.section_type, count);
      tasks.push({ scheduled_for: date, task_type: "drill", estimated_minutes: minutes,
        payload: { section_type: d.section_type, official_domain: official, skill: pick.diagnosed && skill ? skill.skill : null,
          domain: legacyDomainFor(official, pick.diagnosed && skill ? skill.skill : null), difficulty, question_count: count,
          reason: pick.diagnosed ? (d.accuracy as number) < 0.7 ? "weak" : "maintain" : "no_data",
          accuracy: d.accuracy, day_index: day, section_label: OFFICIAL_DOMAINS[official].label } });
      budget -= minutes;
      drills += 1;
    }
  }
  return tasks;
}
