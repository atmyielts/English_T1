// A candidate against what the role needs, skill by skill, with a clear verdict, and the
// ranking and funnel built from those verdicts. Pure functions, no database.
import { isLevel, levelIndex, SKILLS, type Level, type Skill } from '../../../../packages/company-core/src/mod.ts';
import type { Results } from './engine.ts';

export type SkillMinimums = Partial<Record<Skill, Level>>;
export type Verdict = 'meets' | 'below' | 'pending' | 'none';

export const STAGES = ['new', 'reviewing', 'interview', 'offer', 'hired', 'rejected'] as const;
export type Stage = (typeof STAGES)[number];
/** The stages a person passes through in order. `rejected` is an exit, not a step. */
export const STAGE_ORDER: readonly Stage[] = ['new', 'reviewing', 'interview', 'offer', 'hired'];

export interface BenchmarkInput {
  status: string;
  overall_level: string | null;
  overall_score: number | string | null;
  skill_results: Results;
}

export interface BenchmarkSkill { skill: Skill; required: Level | null; level: Level | null; score: number | null; meets: boolean | null; gap: number }
export interface Benchmark {
  verdict: Verdict;
  overall: { required: Level | null; level: Level | null; score: number | null; meets: boolean | null };
  skills: BenchmarkSkill[];
  /** Skills below their minimum. */
  below: number;
  /** Levels short across all skills, so "one level under in one skill" ranks above "two levels under". */
  gap: number;
}

export function readMinimums(value: unknown, skills: readonly string[]): SkillMinimums {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: SkillMinimums = {};
  for (const skill of SKILLS) {
    const level = (value as Record<string, unknown>)[skill];
    if (skills.includes(skill) && isLevel(level)) out[skill] = level;
  }
  return out;
}

export function benchmark(attempt: BenchmarkInput | null, test: { skills: readonly string[]; min_level: Level | null; settings?: { skill_minimums?: SkillMinimums } | null }): Benchmark {
  const minimums = test.settings?.skill_minimums ?? {};
  const graded = attempt?.status === 'graded';
  const results = attempt?.skill_results ?? {};
  const skills: BenchmarkSkill[] = SKILLS.filter((skill) => test.skills.includes(skill)).map((skill) => {
    const required = minimums[skill] ?? null;
    const result = results[skill];
    const level = result && isLevel(result.level) ? result.level : null;
    const meets = required && level ? levelIndex(level) >= levelIndex(required) : null;
    return { skill, required, level, score: result ? Number(result.score) : null, meets, gap: required && level ? Math.max(0, levelIndex(required) - levelIndex(level)) : 0 };
  });
  const overallLevel = attempt?.overall_level && isLevel(attempt.overall_level) ? attempt.overall_level : null;
  const overallMeets = test.min_level && overallLevel ? levelIndex(overallLevel) >= levelIndex(test.min_level) : null;
  const below = skills.filter((entry) => entry.meets === false).length;
  const gap = skills.reduce((sum, entry) => sum + entry.gap, 0) + (test.min_level && overallLevel ? Math.max(0, levelIndex(test.min_level) - levelIndex(overallLevel)) : 0);
  const hasRequirement = Boolean(test.min_level) || skills.some((entry) => entry.required);
  const verdict: Verdict = !graded ? 'pending' : !hasRequirement ? 'none' : below === 0 && overallMeets !== false ? 'meets' : 'below';
  return {
    verdict,
    overall: { required: test.min_level, level: overallLevel, score: attempt?.overall_score === null || attempt?.overall_score === undefined ? null : Number(attempt.overall_score), meets: overallMeets },
    skills, below, gap,
  };
}

/** Best fit first: graded before unfinished, meets before below, fewer levels short, then the higher score. */
export function byFit<T extends { benchmark: Benchmark; submitted_at?: string | null }>(a: T, b: T): number {
  const order = (verdict: Verdict) => verdict === 'meets' ? 0 : verdict === 'none' ? 1 : verdict === 'below' ? 2 : 3;
  return order(a.benchmark.verdict) - order(b.benchmark.verdict)
    || a.benchmark.gap - b.benchmark.gap
    || (b.benchmark.overall.score ?? -1) - (a.benchmark.overall.score ?? -1)
    || String(a.submitted_at ?? '').localeCompare(String(b.submitted_at ?? ''));
}

/** The skills to probe at interview: those below the role's minimum, else the lowest two. */
export function weakSkills(result: Benchmark, max = 3): Skill[] {
  const scored = result.skills.filter((entry) => entry.score !== null);
  const below = scored.filter((entry) => entry.meets === false).sort((a, b) => b.gap - a.gap || (a.score ?? 0) - (b.score ?? 0));
  if (below.length) return below.slice(0, max).map((entry) => entry.skill);
  return [...scored].sort((a, b) => (a.score ?? 0) - (b.score ?? 0)).slice(0, Math.min(2, max)).map((entry) => entry.skill);
}

export const median = (values: number[]): number | null => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

export interface FunnelInput {
  invited_at: string | null; opened_at: string | null; created_at: string; hired_at: string | null;
  stage: Stage; furthest_stage: Stage;
  attempt: { status: string; started_at: string; submitted_at: string | null } | null;
  verdict: Verdict;
}

/** How many people reached each step, and how long the steps took. */
export function funnel(rows: FunnelInput[]) {
  const reached = (stage: Stage) => rows.filter((row) => STAGE_ORDER.indexOf(row.furthest_stage) >= STAGE_ORDER.indexOf(stage)).length;
  const finished = rows.filter((row) => row.attempt && (row.attempt.status === 'submitted' || row.attempt.status === 'graded'));
  return {
    candidates: rows.length,
    invited: rows.filter((row) => row.invited_at).length,
    opened: rows.filter((row) => row.opened_at || row.attempt).length,
    started: rows.filter((row) => row.attempt).length,
    finished: finished.length,
    graded: rows.filter((row) => row.attempt?.status === 'graded').length,
    meets: rows.filter((row) => row.verdict === 'meets').length,
    reviewing: reached('reviewing'),
    interview: reached('interview'),
    offer: reached('offer'),
    hired: reached('hired'),
    rejected: rows.filter((row) => row.stage === 'rejected').length,
    median_minutes_to_finish: median(finished.map((row) => (Date.parse(row.attempt!.submitted_at!) - Date.parse(row.attempt!.started_at)) / 60_000)),
    median_days_to_hire: median(rows.filter((row) => row.hired_at).map((row) => (Date.parse(row.hired_at!) - Date.parse(row.created_at)) / 86_400_000)),
  };
}
