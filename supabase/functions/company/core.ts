// Core routes: who am I, create a pilot workspace, read a workspace, consent.
// Also the helpers other areas reuse (English access sync, seat and test usage).
import { INDUSTRIES, SIZE_BANDS, type Industry, type SizeBand } from '../../../packages/company-core/src/mod.ts';
import { MEMBER_COLUMNS, ORG_COLUMNS } from './handler.ts';
import { check, CompanyError, type Ctx, type Db, type MemberRow, type OrgRow, type Route } from './types.ts';
import { obj, oneOf, text } from './util.ts';

/** Makes the person's Schood English access match their company seats. Never throws. */
export async function syncAccess(db: Db, userId: string | null): Promise<string> {
  if (!userId) return 'none';
  const { data, error } = await db.rpc('company_sync_english_access', { p_user: userId });
  if (error) {
    console.error(JSON.stringify({ company_sync: 'failed', user: userId, error: error.message }));
    return 'failed';
  }
  return String(data);
}

export async function seatsUsed(db: Db, orgId: string): Promise<number> {
  const { count, error } = await db.from('company_members').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('seat', true).neq('status', 'removed');
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function usage(db: Db, org: OrgRow) {
  return { seats_used: await seatsUsed(db, org.id), seats_limit: org.seats_limit, tests_used: org.tests_used, tests_limit: org.tests_limit };
}

/** Reserves one test attempt for the workspace or throws `tests_exhausted`. */
export async function reserveTest(db: Db, orgId: string): Promise<void> {
  const ok = check<boolean>(await db.rpc('company_reserve_test', { p_org: orgId }));
  if (!ok) throw new CompanyError('tests_exhausted', 'This workspace has used all its tests. Contact Schood to add more.', 402);
}

/** Counts one AI call for the workspace; false once today's cap is reached. */
export async function consumeAi(ctx: Ctx): Promise<boolean> {
  if (!ctx.org) return true;
  const configured = Number((ctx.org.settings as Record<string, unknown>)?.ai_daily_limit);
  const limit = Number.isInteger(configured) && configured >= 0 ? configured : ctx.env.aiDailyLimit;
  const { data, error } = await ctx.db.rpc('company_consume_ai', { p_org: ctx.org.id, p_limit: limit });
  if (error) {
    console.error(JSON.stringify({ company_ai_cap: 'unavailable', error: error.message }));
    return true;
  }
  return data === true;
}

/** Records a learning or testing event for dashboards and challenges. Never throws. */
export async function logActivity(db: Db, row: { org_id: string; member_id: string | null; user_id: string | null; kind: string; minutes?: number; points?: number; ref?: string | null }): Promise<void> {
  const { error } = await db.from('company_activity').insert({ ...row, ref: row.ref ?? null, minutes: Math.min(600, Math.max(0, Math.round(row.minutes ?? 0))), points: Math.min(10000, Math.max(0, Math.round(row.points ?? 0))) });
  if (error) console.error(JSON.stringify({ company_activity: 'failed', kind: row.kind, error: error.message }));
}

/** Org fields an employee may see; HR and staff see everything. */
export function orgView(org: OrgRow, member: MemberRow | null, staff: boolean) {
  if (staff || member?.role === 'owner' || member?.role === 'admin') return org;
  const { id, name, industry, size_band, status, settings } = org;
  return { id, name, industry, size_band, status, settings: { locale: (settings as Record<string, unknown>)?.locale ?? null } };
}

export const routes: Route[] = [
  {
    method: 'GET', path: 'me', access: 'user',
    async handle(ctx) {
      const members = check<(MemberRow & { company_orgs: Pick<OrgRow, 'id' | 'name' | 'status' | 'industry'> })[]>(
        await ctx.db.from('company_members').select(`${MEMBER_COLUMNS},company_orgs(id,name,status,industry)`).eq('user_id', ctx.user).eq('status', 'active').order('joined_at', { ascending: true }),
      );
      return {
        user: { id: ctx.user, email: ctx.email },
        staff: ctx.staff,
        self_serve: ctx.env.selfServe,
        workspaces: members.filter((row) => row.company_orgs && row.company_orgs.status !== 'closed').map(({ company_orgs, ...member }) => ({ org: company_orgs, member })),
      };
    },
  },
  {
    method: 'POST', path: 'orgs', access: 'user',
    async handle(ctx, _params, body) {
      if (!ctx.env.selfServe && !ctx.staff) throw new CompanyError('self_serve_closed', 'Ask Schood to open a workspace for you.', 403);
      const input = obj(body);
      const owned = check<{ id: string }[]>(await ctx.db.from('company_members').select('id').eq('user_id', ctx.user).eq('role', 'owner').neq('status', 'removed'));
      if (owned.length >= 3 && !ctx.staff) throw new CompanyError('too_many_workspaces', 'You already own three workspaces. Contact Schood for more.', 409);
      const org = check<OrgRow>(await ctx.db.from('company_orgs').insert({
        name: text(input.name, 'name', { min: 2, max: 120 }),
        industry: oneOf<Industry>(input.industry, INDUSTRIES, 'industry', 'other'),
        size_band: oneOf<SizeBand>(input.size_band, SIZE_BANDS, 'size_band', '1-50'),
        city: text(input.city, 'city', { max: 80, optional: true }),
        contact_phone: text(input.contact_phone, 'contact_phone', { max: 40, optional: true }),
        billing_email: ctx.email,
        status: 'pilot',
        seats_limit: 0,
        tests_limit: ctx.env.pilotTests,
        tests_used: 0,
        created_by: ctx.user,
        settings: { locale: oneOf(input.locale, ['en', 'ru', 'uz'] as const, 'locale', 'ru') },
      }).select(ORG_COLUMNS).single());
      const member = check<MemberRow>(await ctx.db.from('company_members').insert({
        org_id: org.id, user_id: ctx.user, email: ctx.email, full_name: text(input.full_name, 'full_name', { max: 120, optional: true }),
        role: 'owner', status: 'active', joined_at: ctx.now().toISOString(), invited_by: ctx.user,
      }).select(MEMBER_COLUMNS).single());
      ctx.org = org;
      await ctx.audit('org.created', org.id, { name: org.name });
      return { org, member };
    },
  },
  {
    method: 'GET', path: 'orgs/:org', access: 'org', allowSuspended: true,
    async handle(ctx) {
      const org = ctx.org!;
      const departments = check<{ id: string; name: string }[]>(await ctx.db.from('company_departments').select('id,name').eq('org_id', org.id).order('name'));
      const hr = ctx.staff || ctx.member?.role === 'owner' || ctx.member?.role === 'admin';
      return { org: orgView(org, ctx.member, ctx.staff), member: ctx.member, departments, usage: hr ? await usage(ctx.db, org) : null };
    },
  },
  {
    // The employee agrees to share their English progress with the workspace.
    method: 'POST', path: 'orgs/:org/consent', access: 'org', allowSuspended: true,
    async handle(ctx) {
      if (!ctx.member) throw new CompanyError('not_member', 'Only members give consent.', 403);
      const at = ctx.member.consent_at ?? ctx.now().toISOString();
      check(await ctx.db.from('company_members').update({ consent_at: at }).eq('id', ctx.member.id));
      await ctx.audit('member.consented', ctx.member.id);
      return { consent_at: at };
    },
  },
];
