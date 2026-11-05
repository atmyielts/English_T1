import { record, text } from '../input.ts';
import { registerOwnKeyResolver } from '../registries.ts';
import { SchoodAIError, type RequestContext } from '../types.ts';
import type { StoreHandle } from '../stores.ts';
import { centreStore, CentreStoreUnbound, type CentreDeps } from './binding.ts';
import { secretContext, sha256Hex } from './crypto.ts';
import { monthOf, requireCentre } from './shared.ts';
import type { CentreStore, SecretRow } from './store.ts';

// C15 bring your own model key (Enterprise). The centre stores its own key for one of the
// providers in Schood's model registry (sealed, crypto.ts). Core's gateway asks the
// resolver below for it: when a centre has a key for a provider on the route, the gateway
// calls only that provider's models with it, logs the calls as `byok:<label>` with no
// USD cost, and charges no credits. Schood charges a platform fee per call instead, at
// the rate in the centre's contract, from the monthly ledger below.

const LABEL = /^[a-z0-9][a-z0-9_.-]{0,40}$/;
const keyJson = (row: SecretRow) => ({ label: row.label, provider: typeof row.config.provider === 'string' ? row.config.provider : null, hint: row.hint, created_at: row.created_at });

/** A centre's own keys, cached briefly per function instance (the gateway asks on every call). */
const recent = new Map<string, { at: number; rows: SecretRow[] }>();
const KEYS_CACHE_MS = 30_000;
async function ownKeys(store: CentreStore, workspaceId: string, now: number): Promise<SecretRow[]> {
  const hit = recent.get(workspaceId);
  if (hit && now - hit.at < KEYS_CACHE_MS) return hit.rows;
  const rows = await store.table('secrets').list({ workspace_id: workspaceId, purpose: 'byok', revoked_at: null });
  if (recent.size > 500) recent.clear();
  recent.set(workspaceId, { at: now, rows });
  return rows;
}
const forget = (workspaceId: string) => recent.delete(workspaceId);

/** The area's dependencies, or null when the area store is not bound (core's own tests have no centre keys). Real failures throw. */
async function keyStore(store: <T>(handle: StoreHandle<T>) => T): Promise<CentreDeps | null> {
  try {
    return await store(centreStore).deps();
  } catch (cause) {
    if (cause instanceof CentreStoreUnbound) return null;
    throw cause;
  }
}

/**
 * Core's own-key hook. Core asks the resolver only when the centre's plan grants C15, and
 * asks `configured` when it does not: a centre that still has keys is then refused
 * (plan_required) rather than moved to Schood's keys and credits. Anything that throws here
 * (the store, or a key that cannot be opened) makes core refuse the call (ai_unavailable).
 */
export function registerOwnKeys(): void {
  registerOwnKeyResolver(async ({ workspaceId, providerKey, store }) => {
    const deps = await keyStore(store);
    if (!deps) return null;
    const row = (await ownKeys(deps.store, workspaceId, Date.now())).find((entry) => entry.config.provider === providerKey);
    if (!row) return null;
    if (!deps.secrets) throw new Error('own key cannot be opened: SCHOOD_AI_CENTRE_KEYS is not set');
    const apiKey = await deps.secrets.open(row.sealed, secretContext(workspaceId, 'byok', row.label));
    // No credits per call: the platform fee is billed monthly from the calls (computeByokFees).
    return { label: row.label, apiKey, feeCredits: 0 };
  }, {
    // Has the centre any own key? Read fresh, never unsealed.
    configured: async ({ workspaceId, store }) => {
      const deps = await keyStore(store);
      return !!deps && (await deps.store.table('secrets').list({ workspace_id: workspaceId, purpose: 'byok', revoked_at: null }, { limit: 1 })).length > 0;
    },
  });
}

/** The fee row of a month from the calls logged with the centre's own key. */
export async function computeByokFees(store: CentreStore, workspaceId: string, period: string) {
  const settings = await store.table('settings').get({ workspace_id: workspaceId });
  const rate = typeof settings?.byok_fee?.uzs_per_1000_calls === 'number' ? Number(settings.byok_fee.uzs_per_1000_calls) : null;
  const start = new Date(`${period}-01T00:00:00+05:00`), end = new Date(start); end.setUTCMonth(end.getUTCMonth() + 1);
  const [from, after] = await Promise.all([store.usage(workspaceId, start), store.usage(workspaceId, end)]);
  const usage = { byok: { calls: from.byok.calls - after.byok.calls, input_tokens: from.byok.input_tokens - after.byok.input_tokens, output_tokens: from.byok.output_tokens - after.byok.output_tokens } };
  const existing = await store.table('byok_fees').get({ workspace_id: workspaceId, period });
  if (existing && existing.status !== 'open') return existing;
  if (!usage.byok.calls && !existing) return null;
  const values = { calls: usage.byok.calls, input_tokens: usage.byok.input_tokens, output_tokens: usage.byok.output_tokens, rate_uzs_per_1000: rate, fee_uzs: rate === null ? null : Math.ceil((usage.byok.calls * rate) / 1000), computed_at: new Date().toISOString() };
  if (existing) return (await store.table('byok_fees').update({ id: existing.id }, values))[0];
  return await store.table('byok_fees').insert({ workspace_id: workspaceId, period, ...values });
}

export const byok = {
  async GET(ctx: RequestContext) {
    const centre = await requireCentre(ctx, ['owner', 'admin']);
    const ws = centre.access.workspace;
    const [keys, fees, registry] = await Promise.all([
      centre.deps.store.table('secrets').list({ workspace_id: ws.id, purpose: 'byok', revoked_at: null }),
      centre.deps.store.table('byok_fees').list({ workspace_id: ws.id }, { order: 'period', desc: true, limit: 24 }),
      ctx.repo.registry(),
    ]);
    const access = await ctx.access('C15');
    return {
      allowed: access.allowed, keys: keys.map(keyJson), fees, rate_uzs_per_1000_calls: typeof centre.settings.byok_fee.uzs_per_1000_calls === 'number' ? centre.settings.byok_fee.uzs_per_1000_calls : null,
      providers: registry.providers.filter((provider) => provider.enabled).map((provider) => ({ key: provider.key, name: provider.displayName })),
      secrets_ready: !!centre.deps.secrets, period: monthOf(ctx.now()),
    };
  },
  /** { label, provider, api_key } (owner, Enterprise): the centre's key for a provider in Schood's registry. Replaces a key with the same label or provider. */
  async POST(ctx: RequestContext) {
    const centre = await requireCentre(ctx, ['owner']);
    await ctx.requireFeature('C15');
    if (!centre.deps.secrets) throw new SchoodAIError('secrets_unconfigured', 'Storing keys is not set up yet. Ask Schood support.', 503);
    const body = record(await ctx.body());
    const label = text(body.label, 'label', { max: 41 }).toLowerCase();
    if (!LABEL.test(label)) throw new SchoodAIError('invalid_request', 'label is lowercase letters, digits, dots, dashes and underscores.', 400, { field: 'label' });
    const provider = text(body.provider, 'provider', { max: 60 });
    if (!(await ctx.repo.registry()).providers.some((entry) => entry.enabled && entry.key === provider)) throw new SchoodAIError('invalid_request', 'Choose one of the providers Schood uses.', 400, { field: 'provider' });
    const apiKey = text(body.api_key, 'api_key', { min: 16, max: 400 });
    if (/\s/.test(apiKey)) throw new SchoodAIError('invalid_request', 'The key has spaces in it.', 400, { field: 'api_key' });
    const ws = centre.access.workspace, now = ctx.now().toISOString();
    // One key per label and one per provider.
    await centre.deps.store.table('secrets').update({ workspace_id: ws.id, purpose: 'byok', label, revoked_at: null }, { revoked_at: now });
    for (const row of await centre.deps.store.table('secrets').list({ workspace_id: ws.id, purpose: 'byok', revoked_at: null })) {
      if (row.config.provider === provider) await centre.deps.store.table('secrets').update({ id: row.id, revoked_at: null }, { revoked_at: now });
    }
    const row = await centre.deps.store.table('secrets').insert({
      workspace_id: ws.id, purpose: 'byok', label, sealed: await centre.deps.secrets.seal(apiKey, secretContext(ws.id, 'byok', label)), hint: apiKey.slice(-4), fingerprint: await sha256Hex(apiKey),
      config: { provider }, created_by: ctx.user.id,
    });
    forget(ws.id);
    await ctx.audit('centre.byok_key_saved', { label, provider }, { type: 'byok_key', id: row.id });
    return { key: keyJson(row) };
  },
  /** { label }: revokes the key. */
  async DELETE(ctx: RequestContext) {
    const centre = await requireCentre(ctx, ['owner']);
    const label = text(record(await ctx.body()).label, 'label', { max: 41 });
    const rows = await centre.deps.store.table('secrets').update({ workspace_id: centre.access.workspace.id, purpose: 'byok', label, revoked_at: null }, { revoked_at: ctx.now().toISOString() });
    if (!rows.length) throw new SchoodAIError('not_found', 'Key not found.', 404);
    forget(centre.access.workspace.id);
    await ctx.audit('centre.byok_key_revoked', { label }, { type: 'byok_key', id: rows[0].id });
    return { ok: true };
  },
};
