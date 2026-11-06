// The getting-started checklist on the HR side. Nothing is ticked by hand: each item
// reads the workspace's real data, so it stays true whatever way the work was done.
import { HR_ROLES } from '../../../../packages/company-core/src/mod.ts';
import { check, type Ctx, type OrgRow, type Route } from '../types.ts';
import { obj } from '../util.ts';

export type ChecklistKey = 'departments' | 'people' | 'first_test' | 'seats' | 'first_report';
export interface ChecklistItem { key: ChecklistKey; done: boolean; count: number; applies: boolean }

const headCount = async (query: PromiseLike<{ count?: number | null; error: { message: string } | null }>): Promise<number> => {
  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count ?? 0;
};

export async function onboardingState(ctx: Ctx, org: OrgRow) {
  const db = ctx.db, id = org.id;
  const head = (table: string) => db.from(table).select('id', { count: 'exact', head: true }).eq('org_id', id);
  const [departments, people, links, tests, seats, graded, exported] = await Promise.all([
    headCount(head('company_departments')),
    headCount(head('company_members').neq('status', 'removed')),
    headCount(head('company_invites').eq('kind', 'link').is('revoked_at', null)),
    headCount(head('company_assessments')),
    headCount(head('company_members').eq('seat', true).neq('status', 'removed')),
    headCount(head('company_attempts').eq('status', 'graded')),
    headCount(head('company_audit').eq('action', 'report.exported')),
  ]);
  const seatsApply = org.status === 'active' && org.seats_limit > 0;
  const items: ChecklistItem[] = [
    { key: 'departments', done: departments > 0, count: departments, applies: true },
    // The owner alone is not a team yet; an open team link means people are on their way.
    { key: 'people', done: people > 1 || links > 0, count: Math.max(0, people - 1), applies: true },
    { key: 'first_test', done: tests > 0, count: tests, applies: true },
    // A pilot has no seats, so it is not asked to hand any out.
    { key: 'seats', done: seats > 0, count: seats, applies: seatsApply },
    // A graded attempt is a report HR can open; an export counts too.
    { key: 'first_report', done: graded > 0 || exported > 0, count: graded, applies: true },
  ];
  const relevant = items.filter((item) => item.applies);
  const dismissed_at = (org.settings as Record<string, unknown> | null)?.onboarding_dismissed_at ?? null;
  return { items, done: relevant.filter((item) => item.done).length, total: relevant.length, complete: relevant.every((item) => item.done), dismissed_at };
}

export const onboardingRoutes: Route[] = [
  {
    method: 'GET', path: 'orgs/:org/onboarding', access: 'org', roles: HR_ROLES, allowSuspended: true,
    handle: (ctx) => onboardingState(ctx, ctx.org!),
  },
  {
    // { dismissed: boolean }: hiding it, or bringing it back.
    method: 'POST', path: 'orgs/:org/onboarding/dismiss', access: 'org', roles: HR_ROLES,
    async handle(ctx, _params, body) {
      const org = ctx.org!;
      const dismissed = obj(body ?? {}).dismissed !== false;
      const settings = { ...(org.settings ?? {}) } as Record<string, unknown>;
      if (dismissed) settings.onboarding_dismissed_at = settings.onboarding_dismissed_at ?? ctx.now().toISOString();
      else delete settings.onboarding_dismissed_at;
      check(await ctx.db.from('company_orgs').update({ settings }).eq('id', org.id));
      org.settings = settings;
      await ctx.audit(dismissed ? 'onboarding.dismissed' : 'onboarding.restored', org.id);
      return onboardingState(ctx, org);
    },
  },
];
