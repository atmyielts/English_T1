// Builds one Tashkent day's plan: due reviews, one main item chosen by the job role and
// the weakest skills from the last company test, and a short shadowing round. Pure, and
// seeded by person and day, so it stays the same however often it is rebuilt.
import type { Skill } from '../../../../packages/company-core/src/mod.ts';

export type MainKind = 'lesson' | 'roleplay' | 'writing';
export type PlanItem =
  | { type: 'review'; target: number; minutes: number; skipped?: boolean; why?: string }
  | { type: 'lesson'; code: string; minutes: number; skipped?: boolean; why?: string }
  | { type: 'roleplay'; scenario: string; minutes: number; skipped?: boolean; why?: string }
  | { type: 'writing'; template: string; minutes: number; skipped?: boolean; why?: string }
  | { type: 'shadow'; target: number; minutes: number; situation: string; skipped?: boolean; why?: string };

/** Jobs that mostly talk to people, and jobs that write a lot, lean towards that practice. */
const TALKING = ['customer_service', 'sales', 'hospitality', 'healthcare', 'management', 'call_centre', 'retail', 'tourism'];
const WRITING = ['office_admin', 'banking_finance', 'it_software', 'logistics', 'engineering', 'management'];

export function hash(seed: string): number {
  let state = 2166136261;
  for (const char of seed) state = Math.imul(state ^ char.charCodeAt(0), 16777619) >>> 0;
  return state;
}

/** A stable pick from a list, so a reload shows the same choice. */
export function seededPick<T>(items: readonly T[], seed: string): T | undefined {
  return items.length ? items[hash(seed) % items.length] : undefined;
}

/** How much each kind of main item suits this person. `previous` keeps two days from feeling the same. */
export function mainWeights(jobRole: string, weak: readonly Skill[], previous: MainKind | null): Record<MainKind, number> {
  const weights: Record<MainKind, number> = { lesson: 5, roleplay: TALKING.includes(jobRole) ? 3 : 1, writing: WRITING.includes(jobRole) ? 3 : 1 };
  for (const skill of weak) {
    if (skill === 'speaking' || skill === 'listening') weights.roleplay += 3;
    else if (skill === 'writing' || skill === 'grammar') weights.writing += 3;
    else weights.lesson += 2;
  }
  if (previous && previous !== 'lesson') weights[previous] = Math.max(1, Math.floor(weights[previous] / 3));
  return weights;
}

export function pickMain(available: Partial<Record<MainKind, string>>, weights: Record<MainKind, number>, seed: string): MainKind | null {
  const options = (['lesson', 'roleplay', 'writing'] as const).filter((kind) => available[kind]);
  if (!options.length) return null;
  const total = options.reduce((sum, kind) => sum + weights[kind], 0);
  let roll = hash(seed) % total;
  for (const kind of options) {
    if (roll < weights[kind]) return kind;
    roll -= weights[kind];
  }
  return options[0];
}

/** Why a main item suits this person: a skill code from their last test, or "job". The app turns it into a sentence. */
export function whyPicked(main: MainKind, jobRole: string, weak: readonly Skill[]): string | undefined {
  const skills: Record<MainKind, readonly string[]> = { roleplay: ['speaking', 'listening'], writing: ['writing', 'grammar'], lesson: ['reading', 'vocabulary'] };
  const skill = weak.find((entry) => skills[main].includes(entry));
  if (skill) return skill;
  if ((main === 'roleplay' && TALKING.includes(jobRole)) || (main === 'writing' && WRITING.includes(jobRole))) return 'job';
  return undefined;
}

export interface PlanInput {
  minutes: 5 | 10;
  reviewable: number;
  lesson: string | null;
  scenario: string | null;
  template: string | null;
  situation: string;
  jobRole: string;
  weak: readonly Skill[];
  previous: MainKind | null;
  seed: string;
}

export function buildPlan(input: PlanInput): PlanItem[] {
  const items: PlanItem[] = [];
  const target = Math.min(input.minutes === 5 ? 5 : 8, input.reviewable);
  if (target > 0) items.push({ type: 'review', target, minutes: input.minutes === 5 ? 2 : 3 });
  const available = { lesson: input.lesson ?? undefined, roleplay: input.scenario ?? undefined, writing: input.template ?? undefined };
  const main = pickMain(available, mainWeights(input.jobRole, input.weak, input.previous), input.seed);
  const why = main ? whyPicked(main, input.jobRole, input.weak) : undefined;
  const reason = why ? { why } : {};
  if (main === 'lesson') items.push({ type: 'lesson', code: input.lesson!, minutes: 5, ...reason });
  else if (main === 'roleplay') items.push({ type: 'roleplay', scenario: input.scenario!, minutes: 5, ...reason });
  else if (main === 'writing') items.push({ type: 'writing', template: input.template!, minutes: 5, ...reason });
  // The short plan drops shadowing unless there is nothing else to do.
  if (input.minutes === 10 || items.length === 0) items.push({ type: 'shadow', target: 3, minutes: 2, situation: input.situation });
  return items;
}

/** The situation each job meets first, for starter cards and shadowing. */
export const ROLE_SITUATIONS: Record<string, string[]> = {
  general: ['small_talk', 'meeting', 'phone'],
  customer_service: ['complaint', 'phone', 'apology'],
  sales: ['negotiation', 'phone', 'small_talk'],
  hospitality: ['complaint', 'small_talk', 'apology'],
  banking_finance: ['invoice', 'phone', 'complaint'],
  it_software: ['meeting', 'email', 'handover'],
  healthcare: ['apology', 'handover', 'phone'],
  logistics: ['delay', 'invoice', 'phone'],
  office_admin: ['email', 'phone', 'meeting'],
  management: ['meeting', 'presentation', 'negotiation'],
  engineering: ['handover', 'delay', 'meeting'],
  call_centre: ['complaint', 'phone', 'apology'],
  retail: ['complaint', 'small_talk', 'invoice'],
  tourism: ['small_talk', 'delay', 'apology'],
};
export const situationsFor = (jobRole: string): string[] => ROLE_SITUATIONS[jobRole] ?? ROLE_SITUATIONS.general;
