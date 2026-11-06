// Shapes the analytics routes return: framework, skills gap, at-risk, cohorts, spend,
// the executive page, custom reports, manager home, winners and attendance rates.
import type { Avg, Department, LevelCode, LevelCounts } from './api.ts';

export const SKILL_CODES = ['grammar', 'vocabulary', 'reading', 'listening', 'writing', 'speaking'] as const;
export type SkillCode = (typeof SKILL_CODES)[number];
export type SkillLevels = Partial<Record<SkillCode, LevelCode>>;

export interface Requirement {
  id: string; job_role: string | null; department_id: string | null; level: LevelCode; skills: SkillLevels; due_date: string | null;
  source: 'hr' | 'suggestion'; note: string | null; people: number;
}
export interface FrameworkData {
  can_manage: boolean; requirements: Requirement[]; without_requirement: number; departments: Department[];
  suggestions: { job_role: string; level: LevelCode; skills: SkillLevels; in_use: boolean; covered: boolean }[];
}

export interface Tally { people: number; with_requirement: number; meets: number; percent: number | null; overdue: number; due_soon: number; untested: number }
export interface HeatCell { avg: number | null; level: LevelCode | null; tested: number; met: number; with_requirement: number }
export interface SkillsGap {
  today: string; scope: { department: Department | null; unassigned: boolean }; skills: SkillCode[]; has_requirements: boolean;
  compliance: Tally;
  trend: { month: string; with_requirement: number; meets: number; percent: number | null }[];
  heat: (Tally & { id: string | null; name: string | null; overall: HeatCell; skills: Record<SkillCode, HeatCell> })[];
  roles: (Tally & { job_role: string; counts: LevelCounts; requirement: { level: LevelCode; skills: SkillLevels; due_date: string | null; source: string } | null })[];
}
export interface GapPerson {
  member_id: string; name: string; department: string | null; job_role: string; level: LevelCode | null; level_score: number | null;
  requirement: { level: LevelCode; skills: SkillLevels; due_date: string | null; source: string } | null;
  meets: boolean | null; overdue: boolean; due_soon: boolean;
  gaps: { skill: SkillCode | 'overall'; have: LevelCode | null; want: LevelCode }[];
  skills: Partial<Record<SkillCode, { score: number | null; level: LevelCode }>>;
}

export type RiskReasonCode = 'no_placement' | 'inactive' | 'behind_assignment' | 'falling_score' | 'behind_requirement';
export interface RiskPerson {
  member_id: string; name: string; department: string | null; job_role: string; level: LevelCode | null; seat: boolean; shares: boolean;
  reasons: { code: RiskReasonCode; days?: number; capped?: boolean; assignment_id?: string; track_code?: string | null; due_date?: string | null; done?: number; total?: number; from_score?: number | null; to_score?: number | null; want?: LevelCode }[];
  suggestion: { action: 'placement' | 'assign' | 'nudge'; track_code: string | null; target_level: LevelCode | null; due_date: string | null };
  last_nudge: string | null; last_assign: string | null; snoozed_until: string | null;
}
export interface RiskList {
  today: string; inactive_days: number; can_assign: boolean; people: RiskPerson[]; counts: Record<RiskReasonCode, number>; departments: Department[];
  learners: number; untracked: number; learning_signals: boolean; scope: { department: Department | null; unassigned: boolean };
}

export interface CohortTotals { people: number; compared: number; up: number; same: number; down: number; first: number; not_tested: number; levels_gained: number; avg_start: Avg; avg_end: Avg }
export interface Cohorts {
  range: { from: string; to: string; days: number }; scope: { department: Department | null; unassigned: boolean }; departments_list: Department[];
  total: CohortTotals; matrix: { from: LevelCode; to: LevelCode; count: number }[];
  departments: (CohortTotals & { id: string | null; name: string | null })[];
  promotion: { member_id: string; name: string; department: string | null; job_role: string; from_level: LevelCode; to_level: LevelCode; levels: number; from_score: number | null; to_score: number | null; tested_at: string | null; meets_requirement: boolean | null }[];
}

export const CURRENCIES = ['UZS', 'USD', 'EUR', 'RUB', 'KZT', 'KGS', 'TJS', 'TMT'] as const;
export const SPEND_CATEGORIES = ['schood', 'trainer', 'materials', 'other'] as const;
export interface SpendEntry { id: string; spent_on: string; amount: number; currency: string; category: string; description: string | null }
export interface SpendData {
  range: { from: string; to: string; days: number }; entries: SpendEntry[];
  outcome: { active: number; minutes: number; levels_gained: number; moved_up: number; learners: number; sharing: number };
  value: { currency: string; total: number; entries: number; per_active: number | null; per_level: number | null; per_hour: number | null; by_category: { category: string; total: number }[] }[];
}

export interface ExecData {
  version: number; period: { month: string; from: string; to: string };
  people: { people: number; learners: number; sharing: number; tested: number }; levels: LevelCounts; avg_score: number | null;
  compliance: { with_requirement: number; meets: number; overdue: number };
  activity: { active: number; minutes: number; lessons: number };
  movement: { up: number; down: number; same: number; first: number; levels_gained: number };
  hiring: { graded: number; shortlisted: number };
  departments: { id: string | null; name: string | null; people: number; tested: number; with_requirement: number; meets: number; active: number; minutes: number; moved_up: number }[];
  spend: { currency: string; total: number }[];
}
export interface Narrative { headline: string; paragraphs: string[]; generated_at: string; numbers_to_check: string[] }
export interface HistoryRow { id: string; period: string; kind: 'monthly' | 'manual'; taken_on: string; source: string; created_at: string; compliance_percent: number | null; active: number; minutes: number; tested: number; people: number; levels_gained: number }
export interface Executive {
  today: string; month: string; org: { name: string; industry: string };
  frozen: { id: string; kind: 'monthly' | 'manual'; taken_on: string; source: string } | null;
  data: ExecData; narratives: Record<string, Narrative>; history: HistoryRow[];
}

export const ROW_KINDS = ['department', 'job_role', 'level', 'month', 'person'] as const;
export type RowKind = (typeof ROW_KINDS)[number];
export const COLUMN_GROUPS = {
  people: ['people', 'tested', 'avg_score', 'avg_level', 'tests_graded'],
  requirement: ['with_requirement', 'meets_requirement', 'compliance_pct'],
  progress: ['moved_up', 'levels_gained'],
  learning: ['sharing', 'active', 'minutes', 'hours', 'lessons', 'points', 'minutes_per_active', 'sessions_attended'],
} as const;
export type ColumnCode = (typeof COLUMN_GROUPS)[keyof typeof COLUMN_GROUPS][number];
export const PERIOD_PRESETS = ['this_month', 'last_month', 'last_30', 'last_90', 'this_year', 'custom'] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];
export interface ViewConfig {
  rows: RowKind; columns: ColumnCode[];
  filters: { department_ids: string[]; job_roles: string[]; levels: string[]; seat: 'any' | 'yes' | 'no' };
  period: { preset: PeriodPreset; from?: string; to?: string };
}
export interface SavedView { id: string; name: string; config: ViewConfig; can_edit: boolean; updated_at: string }
export interface BuilderResult {
  config: ViewConfig; range: { from: string; to: string; days: number };
  rows: { key: string; label: string | null; kind: RowKind; values: Partial<Record<ColumnCode, number | string | null>> }[];
  total: Partial<Record<ColumnCode, number | string | null>>;
  people: number; sharing: number; scope: { department: Department | null; unassigned: boolean }; departments: Department[];
}

export interface TeamHome {
  today?: string; department: Department | null; departments: Department[]; unassigned: boolean; inactive_days?: number; can_assign: boolean;
  kpis?: { people: number; tested: number; sharing: number; active7: number; minutes7: number; with_requirement: number; meets: number; percent: number | null };
  levels?: LevelCounts; untracked?: number; nudge?: RiskPerson[];
  upcoming?: { id: string; title: string; kind: string; starts_at: string; duration_minutes: number; trainer: string | null; location: string | null; invited: number }[];
  overdue?: { id: string; track_code: string | null; target_level: LevelCode | null; due_date: string | null; scope: string; people: number; person: string | null }[];
}

export interface Winners {
  can_manage: boolean;
  winners: {
    id: string; title: string; metric: 'points' | 'minutes' | 'lessons' | 'active_days'; mode: string; starts_on: string; ends_on: string; prize: string | null; participants: number; active: number; total: number;
    team: { name: string; average: number; total: number } | null; department: { name: string; average: number; total: number } | null;
    top: { rank: number; name: string | null; department: string | null; value: number; me: boolean }[];
  }[];
}

export interface AttendanceRates {
  range: { from: string; to: string; days: number }; sessions: number; hidden: number;
  total: { people: number; invited: number; attended: number; rate: number | null };
  departments: { id: string | null; name: string | null; people: number; invited: number; attended: number; rate: number | null }[];
  people: { member_id: string; name: string; department: string | null; invited: number; attended: number; extra: number; rate: number | null }[];
}
