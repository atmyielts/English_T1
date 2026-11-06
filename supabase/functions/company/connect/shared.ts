// What the connect routes share: the switches and adapters the function is started
// with, rate limits, the workspace's connect settings and the Tashkent clock.
// Browser-safe: the real adapters live in wire.deno.ts, which only index.ts imports.
import { check, CompanyError, type CompanyEnv, type Ctx, type Db } from '../types.ts';

export const HR = ['owner', 'admin'] as const;
export const DAY = 86_400_000;
const TASHKENT = 5 * 3_600_000;

/** One Telegram message through send-telegram. `retry` means it may be tried again later. */
export type TelegramAdapter = (message: { user_id: string; text: string; key: string; cta_url: string | null }) => Promise<{ ok: boolean; retry?: boolean; reason?: string }>;
export type EmailAdapter = (message: { to: string; subject: string; text: string }) => Promise<{ ok: boolean; reason?: string }>;
/** One signed POST. Refuses private addresses and never follows a redirect (see ssrf.ts). */
export type WebhookAdapter = (request: { url: string; body: string; headers: Record<string, string> }) => Promise<{ ok: boolean; status?: number; error?: string }>;

/** Everything off and absent unless the function was started with it (wire.deno.ts). */
export interface ConnectConfig {
  telegramEnabled?: boolean;
  emailEnabled?: boolean;
  webhooksEnabled?: boolean;
  /** Bot username for the link people open, without the @. */
  telegramBot?: string;
  telegram?: TelegramAdapter;
  email?: EmailAdapter;
  webhook?: WebhookAdapter;
}

export const connectConfig = (ctx: { env: CompanyEnv }): ConnectConfig => (ctx.env as CompanyEnv & { connect?: ConnectConfig }).connect ?? {};

/** The switches a page may show. Each needs its adapter as well, so a half-wired function counts as off. */
export function switches(env: CompanyEnv) {
  const config = connectConfig({ env });
  return {
    telegram: config.telegramEnabled === true && Boolean(config.telegram),
    email: config.emailEnabled === true && Boolean(config.email),
    webhooks: config.webhooksEnabled === true && Boolean(config.webhook),
  };
}

export interface ConnectSettings {
  org_id: string;
  telegram_enabled: boolean;
  email_enabled: boolean;
  quiet_start: number;
  quiet_end: number;
  daily_cap: number;
  digest_enabled: boolean;
  digest_weekday: number;
  last_digest_week: string | null;
  import_mapping: Record<string, unknown>;
  notices_swept_at: string | null;
  events_swept_at: string | null;
}
export const SETTINGS_COLUMNS = 'org_id,telegram_enabled,email_enabled,quiet_start,quiet_end,daily_cap,digest_enabled,digest_weekday,last_digest_week,import_mapping,notices_swept_at,events_swept_at';
const SETTINGS_DEFAULT = { telegram_enabled: false, email_enabled: false, quiet_start: 21, quiet_end: 9, daily_cap: 3, digest_enabled: false, digest_weekday: 1, last_digest_week: null, import_mapping: {}, notices_swept_at: null, events_swept_at: null };

/** The workspace's row, or the defaults when it has none yet. Reading never creates one. */
export async function readSettings(db: Db, orgId: string): Promise<ConnectSettings> {
  const row = check<ConnectSettings | null>(await db.from('company_connect_settings').select(SETTINGS_COLUMNS).eq('org_id', orgId).maybeSingle());
  return row ?? { org_id: orgId, ...SETTINGS_DEFAULT };
}

/** Makes sure the row exists, for routes and jobs that update one column of it. */
export async function ensureSettings(db: Db, orgId: string): Promise<void> {
  check(await db.from('company_connect_settings').upsert({ org_id: orgId }, { onConflict: 'org_id', ignoreDuplicates: true }));
}

/** Counts one hit; refuses work when the counter cannot enforce its limit. */
export async function allowHit(db: Db, bucket: string, limit: number, windowSeconds: number): Promise<boolean> {
  const { data, error } = await db.rpc('company_connect_hit', { p_bucket: bucket, p_limit: limit, p_window_seconds: windowSeconds });
  if (error || typeof data !== 'boolean') {
    console.error(JSON.stringify({ company_connect_limit: 'unavailable', error: error?.message ?? 'invalid response' }));
    throw new CompanyError('rate_limit_unavailable', 'Please try again in a moment.', 503);
  }
  return data;
}

export async function rateLimit(db: Db, bucket: string, limit: number, windowSeconds = 60): Promise<void> {
  if (!await allowHit(db, bucket, limit, windowSeconds)) throw new CompanyError('rate_limited', 'Too many requests. Wait a moment and try again.', 429, { retry_after_seconds: windowSeconds });
}

/** A local Tashkent day, with no extra reset at UTC midnight. */
export async function allowDayHit(db: Db, bucket: string, limit: number, at: Date): Promise<boolean> {
  const { data, error } = await db.rpc('company_connect_day_hit', { p_bucket: bucket, p_limit: limit, p_at: at.toISOString() });
  if (error || typeof data !== 'boolean') {
    console.error(JSON.stringify({ company_connect_limit: 'unavailable', error: error?.message ?? 'invalid response' }));
    throw new CompanyError('rate_limit_unavailable', 'Please try again in a moment.', 503);
  }
  return data;
}

/** The caller's membership; a person's own settings need one (staff browsing without one are refused). */
export function ownMember(ctx: Ctx) {
  if (!ctx.member) throw new CompanyError('not_member', 'Only members of this workspace have this.', 403);
  return ctx.member;
}

/** Hour of the day in Tashkent. */
export const tashkentHour = (at: Date): number => new Date(at.getTime() + TASHKENT).getUTCHours();
/** The instant the Tashkent day containing `at` began. */
export const tashkentMidnight = (at: Date): Date => {
  const local = new Date(at.getTime() + TASHKENT);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - TASHKENT);
};
/** Inside quiet hours? A window may run over midnight; equal start and end means none. */
export const inQuietHours = (hour: number, start: number, end: number): boolean =>
  start === end ? false : start < end ? hour >= start && hour < end : hour >= start || hour < end;

/** Pagination for lists: `limit` (1 to `max`) and `offset`. */
export function paging(query: URLSearchParams, { fallback = 50, max = 200 } = {}): { limit: number; offset: number } {
  const limit = Number(query.get('limit') ?? fallback), offset = Number(query.get('offset') ?? 0);
  if (!Number.isInteger(limit) || limit < 1 || limit > max) throw new CompanyError('invalid_field', `limit must be 1 to ${max}.`, 400, { field: 'limit' });
  if (!Number.isInteger(offset) || offset < 0 || offset > 100_000) throw new CompanyError('invalid_field', 'offset is out of range.', 400, { field: 'offset' });
  return { limit, offset };
}

/** A query value that is free of what Postgres cannot store, or null when absent. */
export function queryText(query: URLSearchParams, name: string, max = 120): string | null {
  const value = query.get(name);
  if (value === null || value.trim() === '') return null;
  // deno-lint-ignore no-control-regex
  if (value.length > max || /\u0000|[\uD800-\uDFFF]/.test(value)) throw new CompanyError('invalid_field', `${name} is not valid.`, 400, { field: name });
  return value.trim();
}

/** Characters with a meaning in a LIKE pattern, so a filter matches them literally. */
export const likeEscape = (value: string): string => value.replace(/[\\%_]/g, (char) => `\\${char}`);
