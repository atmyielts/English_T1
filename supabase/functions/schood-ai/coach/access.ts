import { registerPlanSource, type PlanSourceInput, type PlanSourceResult } from '../plan.ts';
import type { RequestContext } from '../types.ts';
import { runtimeOf, type CoachRuntime } from './runtime.ts';

// Who has a coach (docs/product/44_SCHOOD_AI.md, "Selling the coaches"):
//   - Plus and Plus Family include all six (the plan matrix, B1–B6) with their own credits;
//   - a single-coach pass grants one coach feature (plan source `coach-pass`);
//   - a Coach Team seat grants the team's coaches (plan source `coach-team`).
// A pass or seat also brings credits for that coach's AI: `credits.monthly` per
// 30-day cycle from the pass or seat start (core grants them once per cycle and
// expires them at its end). None when Plus or Family already covers the coaches.
// The amount (SCHOOD_AI_COACH_FAIR_USE_CREDITS a coach, default 1200) is an assumption.

let registered = false;
const teamCache = new Map<string, { at: number; rows: Awaited<ReturnType<CoachRuntime['store']['teamsOf']>> }>();
/** Tests and joins: forget cached team seats (a join or removal takes effect at once). */
export const forgetTeamSeats = (userId?: string) => { if (userId) teamCache.delete(userId); else teamCache.clear(); };

/** Plus and Family include every coach and their own credits. */
const coveredByPlan = async (input: PlanSourceInput) => (await input.plansOf(input.user.id)).some((plan) => plan === 'plus' || plan === 'family');
const earliest = (dates: (string | null | undefined)[]) => dates.filter((date): date is string => !!date && !Number.isNaN(Date.parse(date))).sort()[0] ?? null;
const creditsFor = (runtime: CoachRuntime, coaches: number, anchor: string | null): PlanSourceResult['credits'] =>
  ({ monthly: Math.min(100000, runtime.config.fairUseCredits * coaches), anchor });

export function registerCoachPlanSources(): void {
  if (registered) return;
  registered = true;
  registerPlanSource('coach-pass', async (input) => {
    const { user, workspace, repo, store } = input;
    if (workspace.kind !== 'personal') return null;
    const runtime = runtimeOf(store);
    const sold = Object.entries(runtime.config.passProducts);
    if (!sold.length) return null;
    const held = new Set(await repo.productsHeldBy(user.id));
    const passes = sold.filter(([, ids]) => ids.some((id) => held.has(id)));
    if (!passes.length) return null;
    const features = passes.map(([feature]) => feature);
    if (await coveredByPlan(input)) return { features };
    const starts = await repo.productStarts(user.id);
    // Cycles follow the pass: the earliest start of the passes held (unknown: from first use).
    const anchor = earliest(passes.flatMap(([, ids]) => ids.filter((id) => held.has(id)).map((id) => starts[id])));
    return { features, credits: creditsFor(runtime, features.length, anchor) };
  });
  registerPlanSource('coach-team', async (input) => {
    const { user, workspace, now, store: storeOf } = input;
    if (workspace.kind !== 'personal') return null;
    const runtime = runtimeOf(storeOf);
    // Every Schood AI request resolves plans: team seats are cached for a minute per isolate.
    const hit = teamCache.get(user.id);
    const memberships = hit && now.getTime() - hit.at < 60_000 ? hit.rows : await runtime.store.teamsOf(user.id);
    if (!hit || hit.rows !== memberships) { teamCache.set(user.id, { at: now.getTime(), rows: memberships }); if (teamCache.size > 20000) teamCache.clear(); }
    const seats = memberships.filter(({ team }) => team.status === 'active' && Date.parse(team.validUntil) > now.getTime());
    const features = [...new Set(seats.flatMap(({ team }) => team.packs.map((pack) => runtime.packs.get(pack)?.manifest.feature)).filter((feature): feature is NonNullable<typeof feature> => !!feature))];
    if (!features.length) return null;
    if (await coveredByPlan(input)) return { features };
    // Cycles follow the seat: when the person joined their earliest active team.
    return { features, credits: creditsFor(runtime, features.length, earliest(seats.map(({ member }) => member.joinedAt))) };
  });
}

/** How this person has the coach: a plan, beta, a pass or a team seat; null without access. */
export async function accessKind(ctx: RequestContext, feature: string): Promise<'plan' | 'beta' | 'pass' | 'team' | null> {
  const decision = await ctx.access(feature);
  if (!decision.allowed) return null;
  const plan = await ctx.plan();
  if (plan.beta) return 'beta';
  if (plan.plans.includes('plus') || plan.plans.includes('family')) return 'plan';
  return 'pass';
}
