import { LEARNING_ROLES, MANAGER_ROLES, STAFF_ROLES, type Role } from './roles.ts';

// Plans and the plan → feature matrix (docs/product/44_SCHOOD_AI.md, "Plans" and
// "Feature catalogue"). There is no free AI: a user without a plan, a centre seat
// or beta access can browse, see the example gallery and buy, nothing more.
//
// Personal plans are held by one person (Click → entitlements) and apply in that
// person's personal workspace. Workspace plans belong to a centre workspace (the
// owner's entitlement, or a contract for Enterprise) and apply to its members by role.

export const PLAN_CODES = ['plus', 'family', 'teacher', 'teacher_pro', 'centre', 'centre_pro', 'enterprise'] as const;
export type PlanCode = (typeof PLAN_CODES)[number];
export type PlanScope = 'personal' | 'workspace';
export type WorkspaceKind = 'personal' | 'centre';

export const PLAN_SCOPE: Record<PlanCode, PlanScope> = {
  plus: 'personal', family: 'personal', teacher: 'personal', teacher_pro: 'personal',
  centre: 'workspace', centre_pro: 'workspace', enterprise: 'workspace',
};

/** A higher plan includes everything in the plans it lists. */
export const PLAN_INCLUDES: Record<PlanCode, readonly PlanCode[]> = {
  plus: [], family: [], teacher: [], teacher_pro: ['teacher'],
  centre: [], centre_pro: ['centre'], enterprise: ['centre_pro', 'centre'],
};

/** Edge Function env var naming each plan's Schood product id. Enterprise is a contract set on the workspace. */
export const PLAN_PRODUCT_ENV: Partial<Record<PlanCode, string>> = {
  plus: 'SCHOOD_AI_PLUS_PRODUCT_ID', family: 'SCHOOD_AI_FAMILY_PRODUCT_ID',
  teacher: 'SCHOOD_AI_TEACHER_PRODUCT_ID', teacher_pro: 'SCHOOD_AI_TEACHER_PRO_PRODUCT_ID',
  centre: 'SCHOOD_AI_CENTRE_PRODUCT_ID', centre_pro: 'SCHOOD_AI_CENTRE_PRO_PRODUCT_ID',
};

/**
 * Credits granted per 30-day cycle while the plan is active `[ASSUMPTION]`, owner to confirm.
 * Family: the holder's own allowance for P1/P2; each linked child gets Plus (1,500) in
 * their own workspace through a plan source. Enterprise starts at the Centre Pro grant;
 * contract top-ups are credit grants.
 */
export const MONTHLY_CREDITS: Record<PlanCode, number> = {
  plus: 1500, family: 300, teacher: 3000, teacher_pro: 8000, centre: 10000, centre_pro: 40000, enterprise: 40000,
};
/** Beta testers (Schood admins and SCHOOD_AI_BETA_USER_IDS) get this per cycle so features can be tested end to end. */
export const BETA_CREDITS: Record<WorkspaceKind, number> = { personal: 2000, centre: 5000 };

/** Seats and student places per centre plan. `null` means set by contract. */
export const PLAN_SEATS: Partial<Record<PlanCode, { teachers: number | null; students: number | null }>> = {
  centre: { teachers: 5, students: 100 }, centre_pro: { teachers: 15, students: 400 }, enterprise: { teachers: null, students: null },
};

export const isPlanCode = (value: unknown): value is PlanCode => typeof value === 'string' && (PLAN_CODES as readonly string[]).includes(value);

/** The plans held plus every plan they include. */
export function expandPlans(plans: Iterable<PlanCode>): Set<PlanCode> {
  const out = new Set<PlanCode>();
  const visit = (plan: PlanCode) => {
    if (out.has(plan)) return;
    out.add(plan);
    for (const included of PLAN_INCLUDES[plan]) visit(included);
  };
  for (const plan of plans) visit(plan);
  return out;
}

/** Credits per cycle for the plans held: included plans do not add their own grant. */
export function monthlyGrant(plans: Iterable<PlanCode>): number {
  const held = new Set(plans);
  const covered = new Set([...held].flatMap((plan) => [...expandPlans(PLAN_INCLUDES[plan])]));
  let total = 0;
  for (const plan of held) if (!covered.has(plan)) total += MONTHLY_CREDITS[plan];
  return total;
}

// --- Feature matrix ------------------------------------------------------------

export type Audience = 'core' | 'learner' | 'parent' | 'teacher' | 'centre' | 'coach';
export interface FeatureRule {
  id: string;
  audience: Audience;
  /** Plans that include the feature (included plans count, see PLAN_INCLUDES). */
  plans: readonly PlanCode[];
  /** Roles that get it through a workspace plan in a centre workspace. */
  roles: readonly Role[];
  /** Not an AI call (for example buying a gift): open to every signed-in user. */
  open?: boolean;
}

const STUDENT_FACING = LEARNING_ROLES;
const rule = (id: string, audience: Audience, plans: readonly PlanCode[], roles: readonly Role[], open = false): FeatureRule => ({ id, audience, plans, roles, ...(open ? { open } : {}) });

export const FEATURES: Record<string, FeatureRule> = Object.fromEntries([
  // Core: the general Schood AI assistant comes with every paid plan.
  rule('CORE', 'core', ['plus', 'family', 'teacher', 'centre'], ['owner', 'admin', 'teacher', 'student', 'parent']),
  // Learners. L1, L2, L6, L7 and L10 also reach centre students through the Student Assistant (C2).
  rule('L1', 'learner', ['plus', 'centre'], STUDENT_FACING),
  rule('L2', 'learner', ['plus', 'centre'], STUDENT_FACING),
  ...['L3', 'L4', 'L5', 'L8', 'L9', 'L11', 'L12', 'L13', 'L14', 'L15', 'L16', 'L17'].map((id) => rule(id, 'learner', ['plus'], STUDENT_FACING)),
  rule('L6', 'learner', ['plus', 'centre'], STUDENT_FACING),
  rule('L7', 'learner', ['centre'], STUDENT_FACING),
  rule('L10', 'learner', ['plus', 'centre'], STUDENT_FACING),
  rule('L18', 'learner', [], STUDENT_FACING, true),
  // Parents.
  rule('P1', 'parent', ['family', 'centre'], ['parent']),
  rule('P2', 'parent', ['family', 'centre'], ['parent']),
  // Teachers, independent (Teacher plans) or centre staff (Centre plans).
  ...['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T9', 'T10', 'T14', 'T15'].map((id) => rule(id, 'teacher', ['teacher', 'centre'], STAFF_ROLES)),
  rule('T11', 'teacher', ['teacher_pro', 'centre_pro'], STAFF_ROLES),
  rule('T12', 'teacher', ['teacher_pro', 'centre'], STAFF_ROLES),
  rule('T13', 'teacher', ['teacher_pro'], STAFF_ROLES),
  // Centres.
  rule('T7', 'centre', ['centre'], STAFF_ROLES),
  rule('T8', 'centre', ['centre'], STAFF_ROLES),
  ...['C1', 'C3', 'C4', 'C7', 'C9'].map((id) => rule(id, 'centre', ['centre'], MANAGER_ROLES)),
  rule('C2', 'centre', ['centre'], STUDENT_FACING),
  rule('C5', 'centre', ['centre'], STAFF_ROLES),
  rule('C6', 'centre', ['centre'], STAFF_ROLES),
  ...['C8', 'C10', 'C11', 'C14'].map((id) => rule(id, 'centre', ['centre_pro'], MANAGER_ROLES)),
  ...['C12', 'C13', 'C16'].map((id) => rule(id, 'centre', ['centre_pro'], STAFF_ROLES)),
  rule('C15', 'centre', ['enterprise'], ['owner']),
  // Schood Coaches (Telegram bots B1–B6): all six come with Plus and Plus Family; a
  // single-coach pass or a team seat grants one coach directly (see AccessInput.grants).
  ...['B1', 'B2', 'B3', 'B4', 'B5', 'B6'].map((id) => rule(id, 'coach', ['plus', 'family'], STUDENT_FACING)),
  // Lifetime engagement (E1–E14, `[ASSUMPTION]` owner to confirm). The habit layer comes with
  // every learner plan and reaches centre students by role. The Skill Passport (E3) is the
  // person's own record, so it stays open after a plan ends. Certificate exams (E12) are open
  // to see; each sitting is a separate purchase checked by the engage area. The talent pool
  // (E13) opt-in is open; employers are granted by contract and the pool ships switched off.
  ...['E1', 'E2', 'E4', 'E5', 'E6', 'E7', 'E8', 'E9', 'E10', 'E11', 'E14'].map((id) => rule(id, 'learner', ['plus', 'family', 'centre'], STUDENT_FACING)),
  rule('E3', 'learner', [], STUDENT_FACING, true),
  rule('E12', 'learner', [], STUDENT_FACING, true),
  rule('E13', 'learner', [], STUDENT_FACING, true),
].map((entry) => [entry.id, entry]));

export interface AccessInput {
  /** Plans in force for this workspace (personal plans in a personal workspace, workspace plans in a centre). */
  plans: Iterable<PlanCode>;
  workspaceKind: WorkspaceKind;
  role: Role;
  /** Schood admins and allowlisted testers: every plan, roles still apply in centres. */
  beta?: boolean;
  /** Features granted directly rather than by a plan (a coach pass, a team seat). */
  grants?: Iterable<string>;
}
export type AccessDecision =
  | { allowed: true }
  | { allowed: false; reason: 'plan_required'; plans: PlanCode[] }
  | { allowed: false; reason: 'role_required'; roles: Role[] }
  | { allowed: false; reason: 'unknown_feature' };

/** Whether a feature can be used here. Pure; the function and the app use the same rule. */
export function featureAccess(featureId: string, input: AccessInput): AccessDecision {
  const feature = FEATURES[featureId];
  if (!feature) return { allowed: false, reason: 'unknown_feature' };
  if (feature.open) return { allowed: true };
  const scope: PlanScope = input.workspaceKind === 'personal' ? 'personal' : 'workspace';
  if (scope === 'workspace' && !feature.roles.includes(input.role)) return { allowed: false, reason: 'role_required', roles: [...feature.roles] };
  if (input.beta) return { allowed: true };
  if (input.grants && [...input.grants].includes(featureId)) return { allowed: true };
  const held = expandPlans([...input.plans].filter((plan) => PLAN_SCOPE[plan] === scope));
  if (feature.plans.some((plan) => held.has(plan))) return { allowed: true };
  // The cheapest plans that would unlock it here, for the paywall.
  const offers = PLAN_CODES.filter((plan) => PLAN_SCOPE[plan] === scope && [...expandPlans([plan])].some((included) => feature.plans.includes(included)));
  return { allowed: false, reason: 'plan_required', plans: offers.filter((plan) => !offers.some((other) => other !== plan && expandPlans([plan]).has(other))) };
}
