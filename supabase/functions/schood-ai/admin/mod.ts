import {
  CAPABILITIES, cleanSwitches, isCapability, modelProblems, providerProblems, routeProblems,
  type AdapterKind, type Capability, type RegistryModel, type RegistryProvider, type RegistryRoute,
} from '../../../../packages/ai-core/src/mod.ts';
import { bool, integer, isUuid, jsonObject, oneOf, optionalText, record, stringList, text, uuid } from '../input.ts';
import { SchoodAIError, type FeatureModule, type RequestContext, type UsageRow } from '../types.ts';

// Schood admin routes for the model registry, the test console, usage and cost,
// service switches and caps, the report queue and credit grants. Every route needs
// the repo's existing admin RBAC permission (admin-access.ts, with its MFA policy,
// rate limits and audit log); the console UI is milestone 2.

const SETTINGS = 'admin.settings.manage', ANALYTICS = 'admin.analytics.view', SUPPORT = 'admin.support.manage', BILLING = 'admin.billing.manage';
const invalid = (problems: string[]) => new SchoodAIError('invalid_request', `Check: ${problems.join(', ')}.`, 400, { fields: problems });
const capabilities = (value: unknown, field: string): Capability[] => stringList(value, field, { max: CAPABILITIES.length, pattern: /^[a-z_]+$/ }).filter(isCapability);
const stringsOf = (value: unknown, field: string, maxBytes: number): Record<string, string> =>
  Object.fromEntries(Object.entries(jsonObject(value ?? {}, field, maxBytes)).map(([key, entry]) => [key, String(entry)]));

function providerFrom(body: Record<string, unknown>): RegistryProvider {
  const provider: RegistryProvider = {
    key: text(body.key, 'key', { max: 41 }),
    adapter: oneOf(body.adapter, 'adapter', ['openai_compatible', 'anthropic', 'google_gemini', 'cloudflare_workers_ai'] as const) as AdapterKind,
    displayName: text(body.display_name, 'display_name', { max: 80 }),
    baseUrl: text(body.base_url, 'base_url', { max: 300 }),
    apiKeyEnv: text(body.api_key_env, 'api_key_env', { max: 64 }),
    headers: stringsOf(body.extra_headers, 'extra_headers', 3000),
    config: stringsOf(body.config, 'config', 3000),
    enabled: body.enabled === undefined ? true : bool(body.enabled, 'enabled'),
  };
  const problems = providerProblems(provider);
  if (problems.length) throw invalid(problems);
  return provider;
}
function modelFrom(body: Record<string, unknown>): RegistryModel {
  const optionalInt = (value: unknown, field: string) => (value === undefined || value === null ? null : integer(value, field, 1, 10_000_000));
  const price = (value: unknown, field: string) => { if (value === undefined) return 0; if (typeof value !== 'number') throw invalid([field]); return value; };
  const model: RegistryModel = {
    key: text(body.key, 'key', { max: 121 }),
    providerKey: text(body.provider_key, 'provider_key', { max: 41 }),
    modelId: text(body.model_id, 'model_id', { max: 160 }),
    displayName: text(body.display_name, 'display_name', { max: 120 }),
    capabilities: capabilities(body.capabilities, 'capabilities'),
    contextWindow: optionalInt(body.context_window, 'context_window'),
    maxOutput: optionalInt(body.max_output, 'max_output'),
    inputUsdPerMTok: price(body.input_usd_per_mtok, 'input_usd_per_mtok'),
    outputUsdPerMTok: price(body.output_usd_per_mtok, 'output_usd_per_mtok'),
    noTraining: body.no_training === undefined ? false : bool(body.no_training, 'no_training'),
    enabled: body.enabled === undefined ? true : bool(body.enabled, 'enabled'),
  };
  const problems = modelProblems(model);
  if (problems.length) throw invalid(problems);
  return model;
}
function routeFrom(body: Record<string, unknown>): RegistryRoute {
  const route: RegistryRoute = {
    key: text(body.key, 'key', { max: 61 }),
    modelKeys: stringList(body.model_keys, 'model_keys', { max: 8, pattern: /^[a-z0-9][a-z0-9_.:/-]{2,120}$/ }),
    requiredCapabilities: body.required_capabilities === undefined ? [] : capabilities(body.required_capabilities, 'required_capabilities'),
    requireNoTraining: body.require_no_training === undefined ? false : bool(body.require_no_training, 'require_no_training'),
    maxOutputTokens: body.max_output_tokens === undefined || body.max_output_tokens === null ? null : integer(body.max_output_tokens, 'max_output_tokens', 16, 64000),
    temperature: body.temperature === undefined || body.temperature === null ? null : (typeof body.temperature === 'number' ? body.temperature : NaN),
    enabled: body.enabled === undefined ? true : bool(body.enabled, 'enabled'),
  };
  const problems = routeProblems(route);
  if (problems.length) throw invalid(problems);
  return route;
}

const providerJson = (ctx: RequestContext, provider: RegistryProvider) => ({
  key: provider.key, adapter: provider.adapter, display_name: provider.displayName, base_url: provider.baseUrl, api_key_env: provider.apiKeyEnv,
  extra_headers: provider.headers, config: provider.config, enabled: provider.enabled, key_configured: ctx.gateway.keyConfigured(provider),
});
const modelJson = (model: RegistryModel) => ({
  key: model.key, provider_key: model.providerKey, model_id: model.modelId, display_name: model.displayName, capabilities: model.capabilities,
  context_window: model.contextWindow, max_output: model.maxOutput, input_usd_per_mtok: model.inputUsdPerMTok, output_usd_per_mtok: model.outputUsdPerMTok,
  no_training: model.noTraining, enabled: model.enabled,
});
const routeJson = (route: RegistryRoute) => ({
  key: route.key, model_keys: route.modelKeys, required_capabilities: route.requiredCapabilities, require_no_training: route.requireNoTraining,
  max_output_tokens: route.maxOutputTokens, temperature: route.temperature, enabled: route.enabled,
});

/** Calls, failures, cost and latency grouped by a key. */
export function summarise(rows: UsageRow[], by: (row: UsageRow) => string | null) {
  const groups = new Map<string, { calls: number; failed: number; cost_usd: number; latency_total: number; latency_n: number }>();
  for (const row of rows) {
    const key = by(row) ?? '(none)';
    const entry = groups.get(key) ?? { calls: 0, failed: 0, cost_usd: 0, latency_total: 0, latency_n: 0 };
    entry.calls += row.calls;
    if (row.status !== 'ok') entry.failed += row.calls;
    entry.cost_usd += row.costUsd;
    if (row.latencyMs !== null) { entry.latency_total += row.latencyMs * row.calls; entry.latency_n += row.calls; }
    groups.set(key, entry);
  }
  return [...groups].map(([key, entry]) => ({
    key, calls: entry.calls, failed: entry.failed, error_rate: entry.calls ? Math.round((entry.failed / entry.calls) * 1000) / 1000 : 0,
    cost_usd: Math.round(entry.cost_usd * 1_000_000) / 1_000_000, avg_latency_ms: entry.latency_n ? Math.round(entry.latency_total / entry.latency_n) : null,
  })).sort((a, b) => b.calls - a.calls);
}

export const adminModule: FeatureModule = {
  area: 'admin',
  routes: {
    settings: {
      adminPermission: SETTINGS,
      async GET(ctx) {
        const settings = await ctx.repo.settings();
        return { settings: { ai_enabled: settings.aiEnabled, features: settings.features, global_daily_calls: settings.globalDailyCalls, user_daily_calls: settings.userDailyCalls, workspace_daily_calls: settings.workspaceDailyCalls, global_daily_usd: settings.globalDailyUsd } };
      },
      async PATCH(ctx) {
        const body = record(await ctx.body());
        const patch = {
          ...(body.ai_enabled !== undefined ? { aiEnabled: bool(body.ai_enabled, 'ai_enabled') } : {}),
          ...(body.features !== undefined ? { features: cleanSwitches(jsonObject(body.features, 'features', 16000)) } : {}),
          ...(body.global_daily_calls !== undefined ? { globalDailyCalls: integer(body.global_daily_calls, 'global_daily_calls', 0, 10_000_000) } : {}),
          ...(body.user_daily_calls !== undefined ? { userDailyCalls: integer(body.user_daily_calls, 'user_daily_calls', 0, 100_000) } : {}),
          ...(body.workspace_daily_calls !== undefined ? { workspaceDailyCalls: integer(body.workspace_daily_calls, 'workspace_daily_calls', 0, 10_000_000) } : {}),
          ...(body.global_daily_usd !== undefined ? { globalDailyUsd: body.global_daily_usd === null ? null : (typeof body.global_daily_usd === 'number' && body.global_daily_usd >= 0 && body.global_daily_usd <= 100_000 ? body.global_daily_usd : (() => { throw invalid(['global_daily_usd']); })()) } : {}),
        };
        const settings = await ctx.repo.updateSettings(patch, ctx.user.id);
        await ctx.audit('admin.settings', { fields: Object.keys(patch) });
        return { settings: { ai_enabled: settings.aiEnabled, features: settings.features, global_daily_calls: settings.globalDailyCalls, user_daily_calls: settings.userDailyCalls, workspace_daily_calls: settings.workspaceDailyCalls, global_daily_usd: settings.globalDailyUsd } };
      },
    },
    providers: {
      adminPermission: SETTINGS,
      async GET(ctx) { return { providers: (await ctx.repo.registry()).providers.map((provider) => providerJson(ctx, provider)) }; },
      async POST(ctx) {
        const provider = providerFrom(record(await ctx.body()));
        await ctx.repo.saveProvider(provider, ctx.user.id);
        await ctx.audit('admin.provider.saved', { adapter: provider.adapter, api_key_env: provider.apiKeyEnv }, { type: 'provider', id: provider.key });
        return { provider: providerJson(ctx, provider) };
      },
    },
    models: {
      adminPermission: SETTINGS,
      async GET(ctx) { return { models: (await ctx.repo.registry()).models.map(modelJson) }; },
      async POST(ctx) {
        const model = modelFrom(record(await ctx.body()));
        if (!(await ctx.repo.registry()).providers.some((provider) => provider.key === model.providerKey)) throw invalid(['provider_key']);
        await ctx.repo.saveModel(model, ctx.user.id);
        await ctx.audit('admin.model.saved', { provider: model.providerKey, capabilities: model.capabilities }, { type: 'model', id: model.key });
        return { model: modelJson(model) };
      },
    },
    routes: {
      adminPermission: SETTINGS,
      async GET(ctx) { return { routes: (await ctx.repo.registry()).routes.map(routeJson) }; },
      async POST(ctx) {
        const route = routeFrom(record(await ctx.body()));
        const known = new Set((await ctx.repo.registry()).models.map((model) => model.key));
        const unknown = route.modelKeys.filter((key) => !known.has(key));
        if (unknown.length) throw new SchoodAIError('invalid_request', `Unknown models: ${unknown.join(', ')}.`, 400, { fields: ['model_keys'] });
        await ctx.repo.saveRoute(route, ctx.user.id);
        await ctx.audit('admin.route.saved', { models: route.modelKeys }, { type: 'route', id: route.key });
        return { route: routeJson(route) };
      },
    },
    /** Test console: one prompt to one chosen model, with latency, tokens and cost. No credits. */
    test: {
      adminPermission: SETTINGS,
      async POST(ctx) {
        const body = record(await ctx.body());
        const result = await ctx.gateway.testModel(text(body.model_key, 'model_key', { max: 121 }), text(body.prompt, 'prompt', { max: 2000 }));
        await ctx.audit('admin.model.tested', { status: result.status }, { type: 'model', id: String(body.model_key) });
        return result.status === 'ok'
          ? { status: 'ok', text: result.data, model_key: result.modelKey, latency_ms: result.latencyMs ?? null, input_tokens: result.inputTokens, output_tokens: result.outputTokens, cost_usd: result.costUsd }
          : { status: result.status, code: 'code' in result ? result.code : 'reason' in result ? result.reason : null, latency_ms: result.latencyMs ?? null };
      },
    },
    /** Cost and error rate per model and per feature over the last `days`. */
    usage: {
      adminPermission: ANALYTICS,
      async GET(ctx) {
        const days = Number(ctx.query.get('days') ?? '7');
        const span = Number.isInteger(days) && days >= 1 && days <= 90 ? days : 7;
        const rows = await ctx.repo.usage(new Date(ctx.now().getTime() - span * 86_400_000));
        return { days: span, by_model: summarise(rows, (row) => row.modelKey), by_feature: summarise(rows, (row) => row.feature) };
      },
    },
    reports: {
      adminPermission: SUPPORT,
      async GET(ctx) {
        const status = oneOf(ctx.query.get('status') ?? 'open', 'status', ['open', 'reviewed', 'dismissed'] as const);
        return { reports: (await ctx.repo.reports(status, 100)).map((row) => ({ id: row.id, reason: row.reason, note: row.note, excerpt: row.excerpt, status: row.status, workspace_id: row.workspaceId, created_at: row.createdAt })) };
      },
      async PATCH(ctx) {
        const body = record(await ctx.body());
        const id = uuid(body.id, 'id');
        if (!await ctx.repo.reviewReport(id, oneOf(body.status, 'status', ['reviewed', 'dismissed'] as const), ctx.user.id)) throw new SchoodAIError('not_found', 'Report not found.', 404);
        await ctx.audit('admin.report.reviewed', { status: body.status }, { type: 'report', id });
        return { ok: true };
      },
    },
    /** A support or contract credit grant into a workspace's pack credits. */
    credits: {
      adminPermission: BILLING,
      async POST(ctx) {
        const body = record(await ctx.body());
        const workspaceId = uuid(body.workspace_id, 'workspace_id');
        if (!isUuid(workspaceId) || !await ctx.repo.workspace(workspaceId)) throw new SchoodAIError('not_found', 'Workspace not found.', 404);
        const amount = integer(body.amount, 'amount', 1, 1_000_000);
        const reference = `admin:${text(body.reference, 'reference', { max: 100 })}`;
        const balance = await ctx.repo.grantCredits({ workspaceId, amount, kind: 'adjust', reference, userId: ctx.user.id });
        await ctx.audit('admin.credits.granted', { amount, reference, note: optionalText(body.note, 'note', { max: 300 }) }, { type: 'workspace', id: workspaceId });
        return { balance: { plan: balance.plan, pack: balance.pack, total: balance.total } };
      },
    },
  },
};
