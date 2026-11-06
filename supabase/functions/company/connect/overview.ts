// The Connect hub for HR: which switches are on, the workspace's reminder rules, and
// how much is set up. Turning a workspace switch on sends nothing by itself.
import { check, CompanyError, type Ctx, type Route } from '../types.ts';
import { int, obj } from '../util.ts';
import { LOCALES, sampleMessages, type Locale } from './messages.ts';
import { ensureSettings, HR, readSettings, SETTINGS_COLUMNS, switches, type ConnectSettings } from './shared.ts';

async function countOf(ctx: Ctx, table: string, apply: (query: { eq: (column: string, value: unknown) => unknown; is: (column: string, value: null) => unknown }) => unknown): Promise<number> {
  const query = ctx.db.from(table).select('org_id', { count: 'exact', head: true }).eq('org_id', ctx.org!.id);
  const { count, error } = await (apply(query) as PromiseLike<{ count: number | null; error: { message: string } | null }>);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

const publicSettings = (settings: ConnectSettings) => ({
  telegram_enabled: settings.telegram_enabled, email_enabled: settings.email_enabled, quiet_start: settings.quiet_start, quiet_end: settings.quiet_end,
  daily_cap: settings.daily_cap, digest_enabled: settings.digest_enabled, digest_weekday: settings.digest_weekday,
});

export const overviewRoutes: Route[] = [
  {
    method: 'GET', path: 'orgs/:org/connect/overview', access: 'org', roles: HR, allowSuspended: true,
    async handle(ctx, _params, _body, query) {
      const settings = await readSettings(ctx.db, ctx.org!.id);
      const locale = query.get('locale');
      return {
        switches: switches(ctx.env),
        settings: publicSettings(settings),
        counts: {
          api_keys: await countOf(ctx, 'company_api_keys', (list) => list.is('revoked_at', null)),
          webhooks: await countOf(ctx, 'company_webhooks', (list) => list.eq('active', true)),
          queued: await countOf(ctx, 'company_webhook_deliveries', (list) => list.eq('status', 'queued')),
          opted_in: await countOf(ctx, 'company_connect_prefs', (list) => list.eq('telegram_opt_in', true)),
          invited: await countOf(ctx, 'company_members', (list) => list.eq('status', 'invited')),
        },
        samples: sampleMessages(LOCALES.includes(locale as Locale) ? locale as Locale : 'ru'),
      };
    },
  },
  {
    method: 'PATCH', path: 'orgs/:org/connect/settings', access: 'org', roles: HR,
    async handle(ctx, _params, body) {
      const input = obj(body);
      const patch: Record<string, unknown> = {};
      for (const field of ['telegram_enabled', 'email_enabled', 'digest_enabled'] as const) {
        if (!(field in input)) continue;
        if (typeof input[field] !== 'boolean') throw new CompanyError('invalid_field', `${field} must be true or false.`, 400, { field });
        patch[field] = input[field];
      }
      for (const field of ['quiet_start', 'quiet_end'] as const) if (field in input) patch[field] = int(input[field], field, { min: 0, max: 23 });
      if ('daily_cap' in input) patch.daily_cap = int(input.daily_cap, 'daily_cap', { min: 1, max: 20 });
      if ('digest_weekday' in input) patch.digest_weekday = int(input.digest_weekday, 'digest_weekday', { min: 1, max: 7 });
      await ensureSettings(ctx.db, ctx.org!.id);
      if (!Object.keys(patch).length) return { settings: publicSettings(await readSettings(ctx.db, ctx.org!.id)) };
      const saved = check<ConnectSettings>(await ctx.db.from('company_connect_settings').update(patch).eq('org_id', ctx.org!.id).select(SETTINGS_COLUMNS).single());
      await ctx.audit('connect.settings_updated', ctx.org!.id, patch);
      return { settings: publicSettings(saved) };
    },
  },
];
