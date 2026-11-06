// API keys for the public API: made and revoked by HR, shown once, stored as sha256.
// authenticateKey is what every api/v1 route calls first.
import { contractEnded, ORG_COLUMNS } from '../handler.ts';
import { check, checkUnique, CompanyError, UUID, type Ctx, type OrgRow, type Route } from '../types.ts';
import { int, obj, oneOf, sha256, text, token } from '../util.ts';
import { DAY, HR, rateLimit } from './shared.ts';

export type KeyScope = 'read' | 'write';
export interface ApiKeyRow { id: string; org_id: string; name: string; key_prefix: string; scope: KeyScope; expires_at: string | null; last_used_at: string | null; revoked_at: string | null; created_at: string }
const KEY_COLUMNS = 'id,org_id,name,key_prefix,scope,expires_at,last_used_at,revoked_at,created_at';

const MAX_KEYS = 10;
/** A key is recognised by this, so a stray session token never reaches the table. */
export const KEY_PREFIX = 'scl_';
export const PER_KEY_PER_MINUTE = 120;
const PER_IP_PER_MINUTE = 600;
/** last_used_at is a hint for HR; writing it once a few minutes is enough. */
const TOUCH_EVERY = 5 * 60_000;

const invalid = () => new CompanyError('api_key_invalid', 'This API key is not valid.', 401);

/**
 * Finds the workspace behind a bearer key and sets ctx.org, so everything after this is
 * scoped to it. A key opens no more than its scope, and writes stop with the agreement.
 */
export async function authenticateKey(ctx: Ctx, needed: KeyScope): Promise<ApiKeyRow> {
  await rateLimit(ctx.db, `api-ip:${ctx.ipHash}`, PER_IP_PER_MINUTE);
  const header = ctx.req.headers.get('Authorization') ?? '';
  const raw = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!raw.startsWith(KEY_PREFIX) || raw.length > 120) throw invalid();
  const key = check<ApiKeyRow | null>(await ctx.db.from('company_api_keys').select(KEY_COLUMNS).eq('key_hash', await sha256(raw)).maybeSingle());
  if (!key || key.revoked_at || (key.expires_at && Date.parse(key.expires_at) <= ctx.now().getTime())) throw invalid();
  await rateLimit(ctx.db, `api-key:${key.id}`, PER_KEY_PER_MINUTE);
  if (needed === 'write' && key.scope !== 'write') throw new CompanyError('api_key_scope', 'This API key can only read.', 403);
  const org = check<OrgRow | null>(await ctx.db.from('company_orgs').select(ORG_COLUMNS).eq('id', key.org_id).maybeSingle());
  if (!org || org.status === 'closed') throw new CompanyError('org_closed', 'This workspace is closed.', 403);
  if (needed === 'write') {
    if (org.status === 'suspended') throw new CompanyError('org_suspended', 'This workspace is paused. Contact Schood.', 403);
    if (contractEnded(org, ctx.now())) throw new CompanyError('contract_ended', 'Your agreement with Schood has ended. Contact Schood to continue.', 403);
  }
  ctx.org = org;
  if (!key.last_used_at || ctx.now().getTime() - Date.parse(key.last_used_at) > TOUCH_EVERY) {
    const { error } = await ctx.db.from('company_api_keys').update({ last_used_at: ctx.now().toISOString() }).eq('id', key.id);
    if (error) console.error(JSON.stringify({ company_api_key: 'touch_failed', error: error.message }));
  }
  return key;
}

export const apiKeyRoutes: Route[] = [
  {
    method: 'GET', path: 'orgs/:org/connect/api-keys', access: 'org', roles: HR, allowSuspended: true,
    async handle(ctx) {
      return { keys: check<ApiKeyRow[]>(await ctx.db.from('company_api_keys').select(KEY_COLUMNS).eq('org_id', ctx.org!.id).order('created_at', { ascending: false }).limit(100)), per_minute: PER_KEY_PER_MINUTE };
    },
  },
  {
    // { name, scope, expires_days? } → the row and, this once, the key.
    method: 'POST', path: 'orgs/:org/connect/api-keys', access: 'org', roles: HR,
    async handle(ctx, _params, body) {
      const input = obj(body);
      const name = text(input.name, 'name', { min: 1, max: 80 });
      const scope = oneOf<KeyScope>(input.scope, ['read', 'write'], 'scope', 'read');
      const days = int(input.expires_days === '' ? null : input.expires_days, 'expires_days', { min: 1, max: 3650, optional: true });
      const open = check<{ id: string }[]>(await ctx.db.from('company_api_keys').select('id').eq('org_id', ctx.org!.id).is('revoked_at', null));
      if (open.length >= MAX_KEYS) throw new CompanyError('too_many_keys', `A workspace can have ${MAX_KEYS} active keys. Revoke one first.`, 409, { max: MAX_KEYS });
      const raw = `${KEY_PREFIX}${token(32)}`;
      const key = checkUnique<ApiKeyRow>(await ctx.db.from('company_api_keys').insert({
        org_id: ctx.org!.id, name, scope, key_hash: await sha256(raw), key_prefix: raw.slice(0, 12), created_by: ctx.user,
        expires_at: days ? new Date(ctx.now().getTime() + days * DAY).toISOString() : null, created_at: ctx.now().toISOString(),
      }).select(KEY_COLUMNS).single(), () => new CompanyError('api_key_retry', 'Try again.', 409));
      await ctx.audit('api_key.created', key.id, { name, scope, expires_days: days });
      return { key, secret: raw };
    },
  },
  {
    // Shutting a key must work in a paused or ended workspace too.
    method: 'POST', path: 'orgs/:org/connect/api-keys/:key/revoke', access: 'org', roles: HR, allowSuspended: true,
    async handle(ctx, params) {
      if (!UUID.test(params.key)) throw new CompanyError('api_key_not_found', 'This key was not found.', 404);
      const key = check<ApiKeyRow | null>(await ctx.db.from('company_api_keys').select(KEY_COLUMNS).eq('org_id', ctx.org!.id).eq('id', params.key).maybeSingle());
      if (!key) throw new CompanyError('api_key_not_found', 'This key was not found.', 404);
      if (key.revoked_at) return { key };
      const saved = check<ApiKeyRow>(await ctx.db.from('company_api_keys').update({ revoked_at: ctx.now().toISOString() }).eq('id', key.id).select(KEY_COLUMNS).single());
      await ctx.audit('api_key.revoked', key.id, { name: key.name });
      return { key: saved };
    },
  },
];
