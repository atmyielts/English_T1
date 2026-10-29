import { CAPABILITIES } from '../../../../packages/ai-core/src/mod.ts';
import { oneOf, record, stringList, text } from '../input.ts';
import { SchoodAIError, type RequestContext } from '../types.ts';
import { secretContext, sha256Hex } from './crypto.ts';
import { monthOf, requireCentre } from './shared.ts';
import type { CentreStore, SecretRow } from './store.ts';

// C15 bring your own model key (Enterprise). The centre stores its own provider key
// (sealed, crypto.ts); calls made with it are not charged in credits, and Schood
// charges a platform fee per call instead, at the rate in the centre's contract.
// Using the key needs a hook in core's gateway, requested in
// docs/product/ai-requests/centre.md: until that ships, keys are stored and shown
// but every call still goes through Schood's own models and credits.

const ADAPTERS = ['openai_compatible', 'anthropic', 'google_gemini'] as const;
const LABEL = /^[a-z0-9][a-z0-9_.-]{0,40}$/;
const PINNED: Record<string, RegExp> = { anthropic: /^https:\/\/api\.anthropic\.com(\/|$)/, google_gemini: /^https:\/\/generativelanguage\.googleapis\.com(\/|$)/ };

const keyJson = (row: SecretRow) => ({ label: row.label, adapter: row.config.adapter, base_url: row.config.base_url, models: row.config.models, hint: row.hint, created_at: row.created_at });

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
    const [keys, fees] = await Promise.all([
      centre.deps.store.table('secrets').list({ workspace_id: ws.id, purpose: 'byok', revoked_at: null }),
      centre.deps.store.table('byok_fees').list({ workspace_id: ws.id }, { order: 'period', desc: true, limit: 24 }),
    ]);
    const access = await ctx.access('C15');
    return {
      allowed: access.allowed, keys: keys.map(keyJson), fees, rate_uzs_per_1000_calls: typeof centre.settings.byok_fee.uzs_per_1000_calls === 'number' ? centre.settings.byok_fee.uzs_per_1000_calls : null,
      gateway_ready: false, secrets_ready: !!centre.deps.secrets, period: monthOf(ctx.now()),
    };
  },
  /** { label, adapter, base_url, api_key, models: [model ids], capabilities? } (owner, Enterprise). Replaces a key with the same label. */
  async POST(ctx: RequestContext) {
    const centre = await requireCentre(ctx, ['owner']);
    await ctx.requireFeature('C15');
    if (!centre.deps.secrets) throw new SchoodAIError('secrets_unconfigured', 'Storing keys is not set up yet. Ask Schood support.', 503);
    const body = record(await ctx.body());
    const label = text(body.label, 'label', { max: 41 }).toLowerCase();
    if (!LABEL.test(label)) throw new SchoodAIError('invalid_request', 'label is lowercase letters, digits, dots, dashes and underscores.', 400, { field: 'label' });
    const adapter = oneOf(body.adapter, 'adapter', ADAPTERS);
    const baseUrl = text(body.base_url, 'base_url', { max: 300 }).replace(/\/+$/, '');
    if (!/^https:\/\/[^\s/@]+(\/[^\s]*)?$/.test(baseUrl) || /^https:\/\/(localhost|127\.|10\.|192\.168\.|169\.254\.|\[)/i.test(baseUrl)) throw new SchoodAIError('invalid_request', 'base_url must be a public https address.', 400, { field: 'base_url' });
    if (PINNED[adapter] && !PINNED[adapter].test(baseUrl)) throw new SchoodAIError('invalid_request', 'This provider is reached only at its own address.', 400, { field: 'base_url' });
    const apiKey = text(body.api_key, 'api_key', { min: 16, max: 400 });
    if (/\s/.test(apiKey)) throw new SchoodAIError('invalid_request', 'The key has spaces in it.', 400, { field: 'api_key' });
    const models = stringList(body.models, 'models', { max: 8, pattern: /^[A-Za-z0-9][A-Za-z0-9_.:/@-]{0,159}$/ });
    if (!models.length) throw new SchoodAIError('invalid_request', 'Name at least one model.', 400, { field: 'models' });
    const capabilities = body.capabilities === undefined ? ['chat', 'stream', 'json'] : stringList(body.capabilities, 'capabilities', { max: 7, pattern: /^[a-z_]+$/ }).filter((cap) => (CAPABILITIES as readonly string[]).includes(cap));
    const ws = centre.access.workspace;
    await centre.deps.store.table('secrets').update({ workspace_id: ws.id, purpose: 'byok', label, revoked_at: null }, { revoked_at: ctx.now().toISOString() });
    const row = await centre.deps.store.table('secrets').insert({
      workspace_id: ws.id, purpose: 'byok', label, sealed: await centre.deps.secrets.seal(apiKey, secretContext(ws.id, 'byok', label)), hint: apiKey.slice(-4), fingerprint: await sha256Hex(apiKey),
      config: { adapter, base_url: baseUrl, models, capabilities }, created_by: ctx.user.id,
    });
    await ctx.audit('centre.byok_key_saved', { label, adapter, models: models.length }, { type: 'byok_key', id: row.id });
    return { key: keyJson(row) };
  },
  /** { label }: revokes the key. */
  async DELETE(ctx: RequestContext) {
    const centre = await requireCentre(ctx, ['owner']);
    const label = text(record(await ctx.body()).label, 'label', { max: 41 });
    const rows = await centre.deps.store.table('secrets').update({ workspace_id: centre.access.workspace.id, purpose: 'byok', label, revoked_at: null }, { revoked_at: ctx.now().toISOString() });
    if (!rows.length) throw new SchoodAIError('not_found', 'Key not found.', 404);
    await ctx.audit('centre.byok_key_revoked', { label }, { type: 'byok_key', id: rows[0].id });
    return { ok: true };
  },
};
