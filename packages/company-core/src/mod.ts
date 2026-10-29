// Schood Company English: the shared vocabulary of the service. Pure TypeScript,
// no Deno or DOM APIs, so the `company` function and `apps/company` both import it.

/** CEFR levels in order. `pre_a1` is below A1. */
export const LEVELS = ['pre_a1', 'a1', 'a2', 'b1', 'b2', 'c1', 'c2'] as const;
export type Level = (typeof LEVELS)[number];
export const isLevel = (value: unknown): value is Level => (LEVELS as readonly string[]).includes(String(value));
export const levelIndex = (level: Level): number => LEVELS.indexOf(level);
export const LEVEL_LABEL: Record<Level, string> = { pre_a1: 'Pre-A1', a1: 'A1', a2: 'A2', b1: 'B1', b2: 'B2', c1: 'C1', c2: 'C2' };
/** How many levels `level` is short of `target` (0 when it meets or beats it). */
export const levelGap = (level: Level | null, target: Level | null): number =>
  target === null ? 0 : Math.max(0, levelIndex(target) - (level === null ? 0 : levelIndex(level)));

/** The six skills a test can measure. */
export const SKILLS = ['grammar', 'vocabulary', 'reading', 'listening', 'writing', 'speaking'] as const;
export type Skill = (typeof SKILLS)[number];
export const isSkill = (value: unknown): value is Skill => (SKILLS as readonly string[]).includes(String(value));

/**
 * Turns a 0–100 skill score into a CEFR level. The bands are Schood's own
 * scale, not an official mapping; reports say "Schood estimate".
 */
export const LEVEL_FLOORS: readonly [Level, number][] = [['c2', 92], ['c1', 80], ['b2', 65], ['b1', 48], ['a2', 32], ['a1', 16], ['pre_a1', 0]];
export function scoreToLevel(score: number): Level {
  const value = Number.isFinite(score) ? Math.min(100, Math.max(0, score)) : 0;
  return LEVEL_FLOORS.find(([, floor]) => value >= floor)![0];
}
/** Overall level from skill scores: the rounded mean, so one weak skill pulls it down. */
export function overallScore(scores: Partial<Record<Skill, number>>): number | null {
  const values = Object.values(scores).filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 10) / 10 : null;
}

/** Workspace roles, most powerful first. Owners and admins run HR; managers see their department. */
export const ORG_ROLES = ['owner', 'admin', 'manager', 'employee'] as const;
export type OrgRole = (typeof ORG_ROLES)[number];
export const isOrgRole = (value: unknown): value is OrgRole => (ORG_ROLES as readonly string[]).includes(String(value));
export const HR_ROLES: readonly OrgRole[] = ['owner', 'admin'];
export const LEAD_ROLES: readonly OrgRole[] = ['owner', 'admin', 'manager'];

export const ORG_STATUSES = ['pilot', 'active', 'suspended', 'closed'] as const;
export type OrgStatus = (typeof ORG_STATUSES)[number];
export const SIZE_BANDS = ['1-50', '51-200', '201-1000', '1000+'] as const;
export type SizeBand = (typeof SIZE_BANDS)[number];

/** Industries a workspace can pick; each maps to the job-role tracks shown first. */
export const INDUSTRIES = ['hospitality', 'banking', 'it', 'healthcare', 'logistics', 'retail', 'manufacturing', 'telecom', 'education', 'government', 'other'] as const;
export type Industry = (typeof INDUSTRIES)[number];

/**
 * Job-role tracks. Every test and learning path can be tailored to one.
 * `general` is workplace English with no specialism.
 */
export const JOB_ROLES = [
  'general',
  'customer_service',
  'sales',
  'hospitality',
  'banking_finance',
  'it_software',
  'healthcare',
  'logistics',
  'office_admin',
  'management',
  'engineering',
] as const;
export type JobRole = (typeof JOB_ROLES)[number];
export const isJobRole = (value: unknown): value is JobRole => (JOB_ROLES as readonly string[]).includes(String(value));
export const INDUSTRY_ROLES: Record<Industry, JobRole[]> = {
  hospitality: ['hospitality', 'customer_service', 'management'],
  banking: ['banking_finance', 'customer_service', 'sales', 'office_admin'],
  it: ['it_software', 'management', 'sales'],
  healthcare: ['healthcare', 'customer_service', 'office_admin'],
  logistics: ['logistics', 'office_admin', 'customer_service'],
  retail: ['sales', 'customer_service', 'management'],
  manufacturing: ['engineering', 'logistics', 'management'],
  telecom: ['customer_service', 'sales', 'it_software'],
  education: ['office_admin', 'management', 'general'],
  government: ['office_admin', 'management', 'general'],
  other: ['general', 'office_admin', 'customer_service'],
};

/** Kinds of company assessment. */
export const ASSESSMENT_KINDS = ['hiring', 'placement', 'progress'] as const;
export type AssessmentKind = (typeof ASSESSMENT_KINDS)[number];

/** What a row in company_activity records; insights and challenges sum these. */
export const ACTIVITY_KINDS = ['lesson', 'roleplay', 'writing', 'test', 'glossary', 'session', 'english'] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

/** The Schood English "All Skills" product a company learning seat unlocks. */
export const ENGLISH_BUNDLE_PRODUCT_ID = '3a7bd983-58c5-4c75-b5f8-5ac46c94a0fa';
