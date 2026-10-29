import { cleanSwitches, isCapability, type Registry, type RegistryModel, type RegistryProvider, type RegistryRoute } from '../../../packages/ai-core/src/mod.ts';
import { resolvePermissions } from '../_shared/admin-access.ts';
import { computeEffectiveAccess, type EntitlementRow, type SponsoredRow } from '../access-effective/logic.ts';
import type {
  ActionRow, AuthUser, Balance, CallRecord, ChargeOutcome, GenerationRow, LearningEvent, LedgerRow, Member, Message, NotifyDecision, ReportRow,
  SchoodAIRepository, ServiceSettings, SpecialistRow, Thread, UsageRow, UserProfile, Workspace,
} from './types.ts';

// The Postgres repository, through the service role. Credits, caps and notifications
// go through the SECURITY DEFINER functions of 20261030100000_schood_ai_core.sql;
// everything else is plain table access the function has already authorised.

type DbError = { code?: string; message: string } | null;
type Result<T> = { data: T | null; error: DbError };
// deno-lint-ignore no-explicit-any
type Query = any;
export interface SchoodAIDatabase {
  from(table: string): Query;
  rpc(name: string, args: Record<string, unknown>): PromiseLike<Result<unknown>>;
}
type Row = Record<string, unknown>;

function check<T>(result: Result<T>): T {
  if (result.error) throw new Error(`${result.error.code ?? 'db'}: ${result.error.message}`);
  return result.data as T;
}
const str = (value: unknown) => (value === null || value === undefined ? null : String(value));
const num = (value: unknown) => (value === null || value === undefined ? null : Number(value));
const obj = (value: unknown): Record<string, unknown> => (value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {});

const workspace = (row: Row): Workspace => ({
  id: String(row.id), kind: row.kind as Workspace['kind'], name: String(row.name), ownerId: String(row.owner_id),
  academyTenantId: str(row.academy_tenant_id), contractPlan: row.contract_plan === 'enterprise' ? 'enterprise' : null, contractUntil: str(row.contract_until),
  branding: obj(row.branding), houseStyle: obj(row.house_style), settings: obj(row.settings), status: row.status === 'suspended' ? 'suspended' : 'active',
});
const member = (row: Row): Member => ({
  workspaceId: String(row.workspace_id), userId: String(row.user_id), role: row.role as Member['role'], status: row.status === 'suspended' ? 'suspended' : 'active',
  creditBudget: num(row.credit_budget), budgetPeriod: str(row.budget_period), budgetUsed: Number(row.budget_used ?? 0),
});
const balance = (value: unknown): Balance => {
  const row = obj(value);
  return { plan: Number(row.plan ?? 0), planGrant: Number(row.plan_grant ?? 0), pack: Number(row.pack ?? 0), total: Number(row.total ?? 0), cycleEndsAt: str(row.cycle_ends_at) };
};
const thread = (row: Row): Thread => ({
  id: String(row.id), workspaceId: String(row.workspace_id), userId: String(row.user_id), specialistKey: String(row.specialist_key), pageId: str(row.page_id),
  title: String(row.title ?? ''), pinned: row.pinned === true, createdAt: String(row.created_at), lastMessageAt: String(row.last_message_at),
});
const message = (row: Row): Message => ({
  id: String(row.id), threadId: String(row.thread_id), role: row.role as Message['role'], content: String(row.content ?? ''), status: row.status as Message['status'],
  clientMessageId: str(row.client_message_id), creditKey: str(row.credit_key), credits: Number(row.credits ?? 0), callId: str(row.call_id), chargeId: str(row.charge_id),
  contextKinds: Array.isArray(row.context_kinds) ? row.context_kinds.map(String) : [], errorCode: str(row.error_code), createdAt: String(row.created_at),
});
const action = (row: Row): ActionRow => ({
  id: String(row.id), workspaceId: String(row.workspace_id), kind: String(row.kind), payload: obj(row.payload), summary: String(row.summary), status: row.status as ActionRow['status'],
  proposedBy: str(row.proposed_by), threadId: str(row.thread_id), messageId: str(row.message_id), decidedBy: str(row.decided_by), decidedAt: str(row.decided_at),
  startedAt: str(row.started_at), finishedAt: str(row.finished_at), attempts: Number(row.attempts ?? 0), result: row.result ? obj(row.result) : null,
  errorCode: str(row.error_code), expiresAt: String(row.expires_at), createdAt: String(row.created_at),
});
const generation = (row: Row): GenerationRow => ({
  id: String(row.id), workspaceId: String(row.workspace_id), userId: str(row.user_id), feature: String(row.feature), status: row.status as GenerationRow['status'],
  input: obj(row.input), output: row.output ?? null, verification: row.verification ?? null, progress: obj(row.progress), errorCode: str(row.error_code),
  credits: Number(row.credits ?? 0), chargeId: str(row.charge_id), modelKey: str(row.model_key), decidedBy: str(row.decided_by), decidedAt: str(row.decided_at),
  heartbeatAt: str(row.heartbeat_at), createdAt: String(row.created_at), updatedAt: String(row.updated_at),
});
const settings = (row: Row): ServiceSettings => ({
  aiEnabled: row.ai_enabled !== false, features: cleanSwitches(row.features), globalDailyCalls: Number(row.global_daily_calls ?? 0),
  userDailyCalls: Number(row.user_daily_calls ?? 0), workspaceDailyCalls: Number(row.workspace_daily_calls ?? 0), globalDailyUsd: num(row.global_daily_usd),
});
const provider = (row: Row): RegistryProvider => ({
  key: String(row.key), adapter: row.adapter as RegistryProvider['adapter'], displayName: String(row.display_name), baseUrl: String(row.base_url),
  apiKeyEnv: String(row.api_key_env), headers: Object.fromEntries(Object.entries(obj(row.extra_headers)).map(([k, v]) => [k, String(v)])),
  config: Object.fromEntries(Object.entries(obj(row.config)).map(([k, v]) => [k, String(v)])), enabled: row.enabled !== false,
});
const model = (row: Row): RegistryModel => ({
  key: String(row.key), providerKey: String(row.provider_key), modelId: String(row.model_id), displayName: String(row.display_name),
  capabilities: (Array.isArray(row.capabilities) ? row.capabilities : []).filter(isCapability), contextWindow: num(row.context_window), maxOutput: num(row.max_output),
  inputUsdPerMTok: Number(row.input_usd_per_mtok ?? 0), outputUsdPerMTok: Number(row.output_usd_per_mtok ?? 0), noTraining: row.no_training === true, enabled: row.enabled !== false,
});
const route = (row: Row): RegistryRoute => ({
  key: String(row.key), modelKeys: (Array.isArray(row.model_keys) ? row.model_keys : []).map(String),
  requiredCapabilities: (Array.isArray(row.required_capabilities) ? row.required_capabilities : []).filter(isCapability),
  requireNoTraining: row.require_no_training === true, maxOutputTokens: num(row.max_output_tokens), temperature: num(row.temperature), enabled: row.enabled !== false,
});
const toSnake = (patch: Record<string, unknown>) => Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined).map(([key, value]) => [key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`), value]));

export function createSchoodAIRepository(user: (token: string) => Promise<AuthUser | null>, db: SchoodAIDatabase): SchoodAIRepository {
  const rpc = async (name: string, args: Record<string, unknown>) => check(await db.rpc(name, args));
  return {
    user,
    async profile(userId) {
      const row = check<Row | null>(await db.from('users').select('id,role,is_active,telegram_chat_id,full_name').eq('id', userId).maybeSingle());
      return row ? { id: String(row.id), role: String(row.role ?? 'user'), isActive: row.is_active !== false, telegramChatId: str(row.telegram_chat_id), name: str(row.full_name) } satisfies UserProfile : null;
    },
    adminPermissions: (userId, role) => resolvePermissions(db, userId, role),
    async productsHeldBy(userId) {
      // The same rows and logic as access-effective, for a person who is not the caller.
      const membership = check<Row[]>(await db.from('tenant_memberships').select('tenant_id').eq('user_id', userId).eq('status', 'active').order('created_at', { ascending: true }).limit(1));
      const tenant = membership[0]?.tenant_id;
      const personal = tenant ? check<EntitlementRow[]>(await db.from('entitlements').select('resource_type,resource_id,starts_at,ends_at').eq('tenant_id', tenant).eq('is_active', true).eq('resource_type', 'product')) : [];
      const sponsored = check<SponsoredRow[]>(await db.from('academy_entitlements').select('grant_type,resource_type,resource_id,starts_at,expires_at,status').eq('user_id', userId).eq('status', 'active'));
      return computeEffectiveAccess(personal, sponsored, null).effective_product_ids;
    },
    async productStarts(userId) {
      const membership = check<Row[]>(await db.from('tenant_memberships').select('tenant_id').eq('user_id', userId).eq('status', 'active').order('created_at', { ascending: true }).limit(1));
      const tenant = membership[0]?.tenant_id;
      const personal = tenant ? check<EntitlementRow[]>(await db.from('entitlements').select('resource_type,resource_id,starts_at,ends_at').eq('tenant_id', tenant).eq('is_active', true).eq('resource_type', 'product')) : [];
      const sponsored = check<SponsoredRow[]>(await db.from('academy_entitlements').select('grant_type,resource_type,resource_id,starts_at,expires_at,status').eq('user_id', userId).eq('status', 'active'));
      const now = Date.now(), starts: Record<string, string> = {};
      const keep = (id: string | null, start: string | null, end: string | null) => {
        if (!id || !start || Date.parse(start) > now || (end && Date.parse(end) < now)) return;
        if (!starts[id] || start < starts[id]) starts[id] = new Date(start).toISOString();
      };
      for (const row of personal) keep(row.resource_id, row.starts_at, row.ends_at);
      for (const row of sponsored) if (row.grant_type === 'product_access') keep(row.resource_id, row.starts_at, row.expires_at);
      return starts;
    },

    async ensurePersonalWorkspace(userId, name) { return workspace(obj(await rpc('ai_ensure_personal_workspace', { p_user: userId, p_name: name }))); },
    async workspace(id) {
      const row = check<Row | null>(await db.from('ai_workspaces').select('*').eq('id', id).maybeSingle());
      return row ? workspace(row) : null;
    },
    async membership(workspaceId, userId) {
      const row = check<Row | null>(await db.from('ai_workspace_members').select('*').eq('workspace_id', workspaceId).eq('user_id', userId).maybeSingle());
      return row ? member(row) : null;
    },
    async memberships(userId) {
      const rows = check<Row[]>(await db.from('ai_workspace_members').select('*, workspace:ai_workspaces(*)').eq('user_id', userId).limit(200));
      return rows.filter((row) => row.workspace).map((row) => ({ member: member(row), workspace: workspace(obj(row.workspace)) }));
    },
    async updateWorkspace(id, patch) {
      const row = check<Row>(await db.from('ai_workspaces').update(toSnake(patch)).eq('id', id).select('*').single());
      return workspace(row);
    },

    async settings() { return settings(check<Row>(await db.from('ai_settings').select('*').eq('id', 1).single())); },
    async updateSettings(patch, actor) {
      return settings(check<Row>(await db.from('ai_settings').update({ ...toSnake(patch), updated_by: actor }).eq('id', 1).select('*').single()));
    },
    async registry(): Promise<Registry> {
      const [providers, models, routes] = await Promise.all([db.from('ai_providers').select('*'), db.from('ai_models').select('*'), db.from('ai_model_routes').select('*')]);
      return { providers: check<Row[]>(providers).map(provider), models: check<Row[]>(models).map(model), routes: check<Row[]>(routes).map(route) };
    },
    async saveProvider(value, actor) {
      check(await db.from('ai_providers').upsert({ key: value.key, adapter: value.adapter, display_name: value.displayName, base_url: value.baseUrl, api_key_env: value.apiKeyEnv, extra_headers: value.headers, config: value.config, enabled: value.enabled, updated_by: actor }, { onConflict: 'key' }));
    },
    async saveModel(value, actor) {
      check(await db.from('ai_models').upsert({ key: value.key, provider_key: value.providerKey, model_id: value.modelId, display_name: value.displayName, capabilities: value.capabilities, context_window: value.contextWindow, max_output: value.maxOutput, input_usd_per_mtok: value.inputUsdPerMTok, output_usd_per_mtok: value.outputUsdPerMTok, no_training: value.noTraining, enabled: value.enabled, updated_by: actor }, { onConflict: 'key' }));
    },
    async saveRoute(value, actor) {
      check(await db.from('ai_model_routes').upsert({ key: value.key, model_keys: value.modelKeys, required_capabilities: value.requiredCapabilities, require_no_training: value.requireNoTraining, max_output_tokens: value.maxOutputTokens, temperature: value.temperature, enabled: value.enabled, updated_by: actor }, { onConflict: 'key' }));
    },

    async takeCall(input) {
      const result = obj(await rpc('ai_take_call', { p_day: input.day, p_user: input.userId, p_workspace: input.workspaceId, p_global_cap: input.globalCap, p_user_cap: input.userCap, p_workspace_cap: input.workspaceCap, p_global_usd: input.globalUsd }));
      return result.ok === true ? { ok: true } : { ok: false, scope: result.scope as 'global' };
    },
    async recordCalls(rows: CallRecord[]) {
      check(await db.from('ai_calls').insert(rows.map((row) => ({
        call_id: row.callId, attempt: row.attempt, request_id: row.requestId, feature: row.feature, user_id: row.userId, workspace_id: row.workspaceId,
        route_key: row.routeKey, provider_key: row.providerKey, model_key: row.modelKey, status: row.status, error_code: row.errorCode, latency_ms: row.latencyMs,
        input_tokens: row.inputTokens, output_tokens: row.outputTokens, usage_estimated: row.usageEstimated, cost_usd: row.costUsd, credits: row.credits,
        charge_id: row.chargeId, streamed: row.streamed,
      }))));
    },
    async usage(since) {
      const rows = check<Row[]>(await db.from('ai_calls').select('feature,model_key,status,cost_usd,latency_ms').gte('created_at', since.toISOString()).order('created_at', { ascending: false }).limit(50000));
      return rows.map((row): UsageRow => ({ feature: String(row.feature), modelKey: str(row.model_key), status: row.status as UsageRow['status'], calls: 1, costUsd: Number(row.cost_usd ?? 0), latencyMs: num(row.latency_ms) }));
    },

    async creditBalance(workspaceId, grant, anchor) { return balance(await rpc('ai_credit_balance', { p_workspace: workspaceId, p_grant: grant, p_anchor: anchor })); },
    async charge(input): Promise<ChargeOutcome> {
      const result = obj(await rpc('ai_credit_charge', { p_workspace: input.workspaceId, p_user: input.userId, p_cost: input.cost, p_credit_key: input.creditKey, p_reference: input.reference, p_grant: input.grant, p_anchor: input.anchor }));
      if (result.ok === true) return { ok: true, chargeId: String(result.charge_id), cost: Number(result.cost), replayed: result.replayed === true, balance: balance(result.balance) };
      return { ok: false, code: result.code as 'insufficient_credits', cost: num(result.cost) ?? undefined, available: num(result.available) ?? undefined, budget: num(result.budget) ?? undefined, used: num(result.used) ?? undefined, balance: result.balance ? balance(result.balance) : undefined };
    },
    async refund(chargeId) {
      const result = obj(await rpc('ai_credit_refund', { p_charge: chargeId }));
      return { refunded: Number(result.refunded ?? 0) };
    },
    async grantCredits(input) {
      const result = obj(await rpc('ai_credit_grant', { p_workspace: input.workspaceId, p_amount: input.amount, p_kind: input.kind, p_reference: input.reference, p_user: input.userId }));
      return balance(result.balance);
    },
    async ledger(workspaceId, options) {
      let query = db.from('ai_credit_ledger').select('id,user_id,kind,bucket,delta,balance_after,credit_key,reference,created_at').eq('workspace_id', workspaceId);
      if (options.userId) query = query.eq('user_id', options.userId);
      const rows = check<Row[]>(await query.order('id', { ascending: false }).limit(options.limit));
      return rows.map((row): LedgerRow => ({ id: Number(row.id), userId: str(row.user_id), kind: String(row.kind), bucket: row.bucket as 'plan', delta: Number(row.delta), balanceAfter: Number(row.balance_after), creditKey: str(row.credit_key), reference: str(row.reference), createdAt: String(row.created_at) }));
    },

    async threads(workspaceId, userId, limit) {
      return check<Row[]>(await db.from('ai_threads').select('*').eq('workspace_id', workspaceId).eq('user_id', userId).order('pinned', { ascending: false }).order('last_message_at', { ascending: false }).limit(limit)).map(thread);
    },
    async thread(id) {
      const row = check<Row | null>(await db.from('ai_threads').select('*').eq('id', id).maybeSingle());
      return row ? thread(row) : null;
    },
    async createThread(input) {
      return thread(check<Row>(await db.from('ai_threads').insert({ workspace_id: input.workspaceId, user_id: input.userId, specialist_key: input.specialistKey, page_id: input.pageId, title: input.title }).select('*').single()));
    },
    async updateThread(id, patch) {
      const { touch, ...fields } = patch;
      const values = { ...toSnake(fields), ...(touch ? { last_message_at: new Date().toISOString() } : {}) };
      const row = check<Row | null>(await db.from('ai_threads').update(values).eq('id', id).select('*').maybeSingle());
      return row ? thread(row) : null;
    },
    async deleteThreads(workspaceId, userId, ids) {
      let query = db.from('ai_threads').delete().eq('workspace_id', workspaceId).eq('user_id', userId);
      if (ids !== 'all') query = query.in('id', ids);
      return check<Row[]>(await query.select('id')).length;
    },
    async messages(threadId, limit) {
      const rows = check<Row[]>(await db.from('ai_messages').select('*').eq('thread_id', threadId).order('created_at', { ascending: false }).limit(limit));
      return rows.reverse().map(message);
    },
    async message(id) {
      const row = check<Row | null>(await db.from('ai_messages').select('*').eq('id', id).maybeSingle());
      return row ? message(row) : null;
    },
    async addMessage(input) {
      const result = await db.from('ai_messages').insert({
        thread_id: input.threadId, role: input.role, content: input.content, status: input.status, client_message_id: input.clientMessageId, credit_key: input.creditKey,
        credits: input.credits, call_id: input.callId, charge_id: input.chargeId, context_kinds: input.contextKinds, error_code: input.errorCode,
      }).select('*').single();
      if (result.error?.code === '23505') return null;
      return message(check<Row>(result));
    },
    async updateMessage(id, patch) { check(await db.from('ai_messages').update(toSnake(patch)).eq('id', id)); },
    async deleteMessage(id) { check(await db.from('ai_messages').delete().eq('id', id)); },

    async specialists(workspaceId) {
      return check<Row[]>(await db.from('ai_specialists').select('key,name,description,instructions,context_kinds,roles,enabled').eq('workspace_id', workspaceId).limit(100)).map((row): SpecialistRow => ({
        key: String(row.key), name: String(row.name), description: str(row.description), instructions: String(row.instructions ?? ''),
        contextKinds: Array.isArray(row.context_kinds) ? row.context_kinds.map(String) : [], roles: (Array.isArray(row.roles) ? row.roles : []) as SpecialistRow['roles'], enabled: row.enabled !== false,
      }));
    },

    async createAction(input) {
      return action(check<Row>(await db.from('ai_actions').insert({ workspace_id: input.workspaceId, kind: input.kind, payload: input.payload, summary: input.summary, proposed_by: input.proposedBy, thread_id: input.threadId, message_id: input.messageId, expires_at: input.expiresAt }).select('*').single()));
    },
    async action(id) {
      const row = check<Row | null>(await db.from('ai_actions').select('*').eq('id', id).maybeSingle());
      return row ? action(row) : null;
    },
    async actions(workspaceId, options) {
      let query = db.from('ai_actions').select('*').eq('workspace_id', workspaceId);
      if (options.statuses?.length) query = query.in('status', options.statuses);
      return check<Row[]>(await query.order('created_at', { ascending: false }).limit(options.limit)).map(action);
    },
    async transitionAction(id, from, patch) {
      const { id: _id, workspaceId: _ws, kind: _kind, payload: _payload, createdAt: _created, ...fields } = patch;
      const row = check<Row | null>(await db.from('ai_actions').update(toSnake(fields)).eq('id', id).in('status', from).select('*').maybeSingle());
      return row ? action(row) : null;
    },

    async createGeneration(input) {
      return generation(check<Row>(await db.from('ai_generations').insert(toSnake({ ...input })).select('*').single()));
    },
    async generation(id) {
      const row = check<Row | null>(await db.from('ai_generations').select('*').eq('id', id).maybeSingle());
      return row ? generation(row) : null;
    },
    async generations(workspaceId, userId, limit) {
      let query = db.from('ai_generations').select('*').eq('workspace_id', workspaceId);
      if (userId) query = query.eq('user_id', userId);
      return check<Row[]>(await query.order('created_at', { ascending: false }).limit(limit)).map(generation);
    },
    async updateGeneration(id, patch, from) {
      const { id: _id, workspaceId: _ws, createdAt: _created, updatedAt: _updated, ...fields } = patch;
      let query = db.from('ai_generations').update(toSnake(fields)).eq('id', id);
      if (from?.length) query = query.in('status', from);
      const row = check<Row | null>(await query.select('*').maybeSingle());
      return row ? generation(row) : null;
    },

    async createReport(input) {
      const result = await db.from('ai_reports').insert({ message_id: input.messageId, workspace_id: input.workspaceId, reporter_id: input.reporterId, reason: input.reason, note: input.note, excerpt: input.excerpt }).select('id').single();
      if (result.error?.code === '23505') {
        const existing = check<Row>(await db.from('ai_reports').select('id').eq('message_id', input.messageId).eq('reporter_id', input.reporterId).single());
        return { id: String(existing.id), created: false };
      }
      return { id: String(check<Row>(result).id), created: true };
    },
    async reports(status, limit) {
      return check<Row[]>(await db.from('ai_reports').select('*').eq('status', status).order('created_at', { ascending: false }).limit(limit)).map((row): ReportRow => ({
        id: String(row.id), messageId: str(row.message_id), workspaceId: str(row.workspace_id), reporterId: str(row.reporter_id), reason: String(row.reason),
        note: str(row.note), excerpt: String(row.excerpt ?? ''), status: row.status as ReportRow['status'], createdAt: String(row.created_at),
      }));
    },
    async reviewReport(id, status, actor) {
      return check<Row[]>(await db.from('ai_reports').update({ status, reviewed_by: actor, reviewed_at: new Date().toISOString() }).eq('id', id).select('id')).length > 0;
    },
    async audit(event) {
      check(await db.from('ai_audit_events').insert({ workspace_id: event.workspaceId, actor_id: event.actorId, event: event.event, target_type: event.targetType ?? null, target_id: event.targetId ?? null, details: event.details ?? {} }));
    },

    async addLearningEvents(events: LearningEvent[]) {
      check(await db.from('ai_learning_events').insert(events.map((event) => ({
        user_id: event.userId, workspace_id: event.workspaceId, area: event.area, kind: event.kind, verified: event.verified, feature: event.feature,
        skill: event.skill, verified_minutes: event.verifiedMinutes, score: event.score, outcome: event.outcome, ref: event.ref, source: event.source,
      }))));
    },
    async notify(userId, channel, take): Promise<NotifyDecision> {
      const result = obj(await rpc('ai_notify', { p_user: userId, p_channel: channel, p_take: take }));
      return result.allowed === true ? { allowed: true, remaining: Number(result.remaining ?? 0) } : { allowed: false, reason: result.reason as 'daily_limit', retryAt: String(result.retry_at) };
    },
  };
}
