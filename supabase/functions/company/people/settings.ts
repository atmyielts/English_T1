// Workspace settings for HR: company profile, default language, plan and usage,
// and who runs the workspace. Plan fields (status, seats, tests, contract, AI cap)
// are set by Schood staff only (staff.ts).
import { HR_ROLES, INDUSTRIES, SIZE_BANDS, type Industry, type SizeBand } from '../../../../packages/company-core/src/mod.ts';
import { usage } from '../core.ts';
import { MEMBER_COLUMNS, ORG_COLUMNS } from '../handler.ts';
import { check, type MemberRow, type OrgRow, type Route } from '../types.ts';
import { email as readEmail, obj, oneOf, text } from '../util.ts';

export const LOCALES = ['en', 'ru', 'uz'] as const;

export const settingsRoutes: Route[] = [
  {
    method: 'GET', path: 'orgs/:org/settings', access: 'org', roles: HR_ROLES, allowSuspended: true,
    async handle(ctx) {
      const org = ctx.org!;
      const admins = check<MemberRow[]>(await ctx.db.from('company_members').select(MEMBER_COLUMNS).eq('org_id', org.id).in('role', ['owner', 'admin']).neq('status', 'removed').order('role').order('full_name'));
      return { org, usage: await usage(ctx.db, org), admins, member: ctx.member, pilot_tests: ctx.env.pilotTests };
    },
  },
  {
    method: 'PATCH', path: 'orgs/:org/settings', access: 'org', roles: HR_ROLES,
    async handle(ctx, _params, body) {
      const org = ctx.org!, input = obj(body);
      const patch: Record<string, unknown> = {};
      if ('name' in input) patch.name = text(input.name, 'name', { min: 2, max: 120 });
      if ('industry' in input) patch.industry = oneOf<Industry>(input.industry, INDUSTRIES, 'industry');
      if ('size_band' in input) patch.size_band = oneOf<SizeBand>(input.size_band, SIZE_BANDS, 'size_band');
      if ('city' in input) patch.city = text(input.city, 'city', { max: 80, optional: true });
      if ('contact_phone' in input) patch.contact_phone = text(input.contact_phone, 'contact_phone', { max: 40, optional: true });
      if ('billing_email' in input) patch.billing_email = readEmail(input.billing_email, 'billing_email', true);
      if ('tax_id' in input) patch.tax_id = text(input.tax_id, 'tax_id', { max: 40, optional: true });
      if ('locale' in input) {
        // Merge into settings so staff-only keys (ai_daily_limit) are kept.
        patch.settings = { ...(org.settings ?? {}), locale: oneOf(input.locale, LOCALES, 'locale') };
      }
      if (!Object.keys(patch).length) return { org };
      const updated = check<OrgRow>(await ctx.db.from('company_orgs').update(patch).eq('id', org.id).select(ORG_COLUMNS).single());
      const changes = Object.fromEntries(Object.keys(patch).map((field) => [field, field === 'settings' ? { locale: (patch.settings as Record<string, unknown>).locale } : patch[field]]));
      await ctx.audit('settings.updated', org.id, changes);
      return { org: updated };
    },
  },
];
