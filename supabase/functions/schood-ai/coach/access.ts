import { registerPlanSource } from '../plan.ts';
import type { RequestContext } from '../types.ts';
import { coachRuntime, type CoachRuntime } from './runtime.ts';
import type { Enrollment } from './store.ts';

// Who has a coach (docs/product/44_SCHOOD_AI.md, "Selling the coaches"):
//   - Plus and Plus Family include all six (the plan matrix, B1–B6);
//   - a single-coach pass grants one coach feature (plan source `coach-pass`);
//   - a Coach Team seat grants the team's coaches (plan source `coach-team`).
// A pass or seat carries no Plus credits, so fair use is topped up with credits
// once per 30-day cycle (core request: plan sources that grant credits).

const DAY = 86_400_000, CYCLE = 30 * DAY;

let registered = false;
const teamCache = new Map<string, { at: number; rows: Awaited<ReturnType<CoachRuntime['store']['teamsOf']>> }>();
/** Tests and joins: forget cached team seats (a join or removal takes effect at once). */
export const forgetTeamSeats = (userId?: string) => { if (userId) teamCache.delete(userId); else teamCache.clear(); };
export function registerCoachPlanSources(runtime: () => Promise<CoachRuntime> = coachRuntime): void {
  if (registered) return;
  registered = true;
  registerPlanSource('coach-pass', async ({ user, workspace, repo }) => {
    if (workspace.kind !== 'personal') return null;
    const { config } = await runtime();
    const sold = Object.entries(config.passProducts);
    if (!sold.length) return null;
    const held = new Set(await repo.productsHeldBy(user.id));
    const features = sold.filter(([, ids]) => ids.some((id) => held.has(id))).map(([feature]) => feature);
    return features.length ? { features } : null;
  });
  registerPlanSource('coach-team', async ({ user, workspace, now }) => {
    if (workspace.kind !== 'personal') return null;
    const { store, packs } = await runtime();
    // Every Schood AI request resolves plans: team seats are cached for a minute per isolate.
    const hit = teamCache.get(user.id);
    const memberships = hit && now.getTime() - hit.at < 60_000 ? hit.rows : await store.teamsOf(user.id);
    if (!hit || hit.rows !== memberships) { teamCache.set(user.id, { at: now.getTime(), rows: memberships }); if (teamCache.size > 20000) teamCache.clear(); }
    const features = memberships
      .filter(({ team }) => team.status === 'active' && Date.parse(team.validUntil) > now.getTime())
      .flatMap(({ team }) => team.packs.map((pack) => packs.get(pack)?.manifest.feature))
      .filter((feature): feature is NonNullable<typeof feature> => !!feature);
    return features.length ? { features: [...new Set(features)] } : null;
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

/**
 * The fair-use cycle of a pass or seat (`pass:B1:<start>:<n>` / `team:<id>:<n>`),
 * from the entitlement's own start so cycles follow the purchase.
 */
async function grantCycle(ctx: RequestContext, runtime: CoachRuntime, feature: string): Promise<string | null> {
  const now = ctx.now().getTime();
  const ids = runtime.config.passProducts[feature] ?? [];
  if (ids.length) {
    const starts = await ctx.repo.productStarts(ctx.user.id);
    const start = ids.map((id) => starts[id]).filter(Boolean).sort()[0];
    if (start) return `pass:${feature}:${Math.floor(Date.parse(start) / 1000)}:${Math.floor((now - Date.parse(start)) / CYCLE)}`;
  }
  for (const { team, member } of await runtime.store.teamsOf(ctx.user.id)) {
    if (team.status !== 'active' || Date.parse(team.validUntil) <= now) continue;
    if (!team.packs.some((pack) => runtime.packs.get(pack)?.manifest.feature === feature)) continue;
    return `team:${team.id}:${Math.floor((now - Date.parse(member.joinedAt)) / CYCLE)}`;
  }
  return null;
}

/**
 * Tops a pass or seat holder's credits up to the fair-use amount once per cycle
 * (never above it, so unused credits do not pile up). Plus, Family and beta
 * already have their own credits. Idempotent per cycle in the ledger.
 */
export async function ensureFairUse(ctx: RequestContext, runtime: CoachRuntime, enrollment: Enrollment, feature: string): Promise<Enrollment> {
  if ((await accessKind(ctx, feature)) !== 'pass') return enrollment;
  const cycle = await grantCycle(ctx, runtime, feature);
  if (!cycle || enrollment.fairUseCycle === cycle) return enrollment;
  const access = await ctx.workspace();
  const plan = await ctx.plan();
  const balance = await ctx.repo.creditBalance(access.workspace.id, plan.grant, plan.anchor);
  const amount = runtime.config.fairUseCredits - Math.min(runtime.config.fairUseCredits, balance.total);
  if (amount > 0) await ctx.repo.grantCredits({ workspaceId: access.workspace.id, amount, kind: 'adjust', reference: `coach_fair_use:${cycle}`.slice(0, 200), userId: ctx.user.id });
  await ctx.audit('coach.fair_use_topup', { feature, cycle, amount: Math.max(0, amount) });
  const updated = await runtime.store.updateEnrollment(enrollment.id, enrollment.revision, { fairUseCycle: cycle });
  return updated ?? (await runtime.store.enrollment(enrollment.userId, enrollment.pack)) ?? enrollment;
}

export { DAY };
