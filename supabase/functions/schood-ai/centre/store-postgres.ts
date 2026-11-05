import type { SchoodAIDatabase } from '../repository.ts';
import type { Role } from '../types.ts';
import { StoreConflict } from './store-memory.ts';
import {
  TABLES, type AcceptInviteResult, type AuditRow, type CentreStore, type KnowledgeHit, type ListOptions, type MemberInfo, type Row, type Table, type TableMap, type TableName, type UsageReport,
} from './store.ts';

// The centre store on Postgres through the service role (the schood-ai function is
// the only reader and writer). Atomic steps call the SQL functions of
// 20261030400000_schood_ai_centre.sql.

type DbError = { code?: string; message: string } | null;
type Result<T> = { data: T | null; error: DbError };
// deno-lint-ignore no-explicit-any
type Query = any;

function check<T>(result: Result<T>, table = 'centre'): T {
  if (result.error) {
    if (result.error.code === '23505') throw new StoreConflict(table);
    throw new Error(`${result.error.code ?? 'db'}: ${result.error.message}`);
  }
  return result.data as T;
}
const obj = (value: unknown): Record<string, unknown> => (value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {});

function where(query: Query, filter: Row = {}, options: ListOptions<Row> = {}): Query {
  let q = query;
  for (const [key, value] of Object.entries(filter)) {
    if (value === undefined) continue;
    q = value === null ? q.is(key, null) : q.eq(key, value);
  }
  for (const [key, values] of Object.entries(options.in ?? {})) q = q.in(key, values ?? []);
  for (const [key, value] of Object.entries(options.lt ?? {})) q = q.lt(key, value);
  for (const [key, value] of Object.entries(options.gte ?? {})) q = q.gte(key, value);
  return q;
}

export function createPostgresCentreStore(db: SchoodAIDatabase): CentreStore {
  const rpc = async <T>(name: string, args: Record<string, unknown>) => check<T>(await db.rpc(name, args) as Result<T>, name);
  function table<N extends TableName>(name: N): Table<TableMap[N]> {
    type R = TableMap[N];
    const t = TABLES[name];
    return {
      async list(filter = {}, options = {}) {
        let q = where(db.from(t).select('*'), filter as Row, options as ListOptions<Row>);
        if (options.order) q = q.order(options.order, { ascending: !options.desc });
        q = q.limit(options.limit ?? 1000);
        return check<R[]>(await q, t) ?? [];
      },
      async get(filter) {
        const rows = check<R[]>(await where(db.from(t).select('*'), filter as Row).limit(1), t) ?? [];
        return rows[0] ?? null;
      },
      async insert(row) { return check<R>(await db.from(t).insert(row).select('*').single(), t); },
      async update(filter, patch, options = {}) {
        return check<R[]>(await where(db.from(t).update(patch), filter as Row, { in: options.in } as ListOptions<Row>).select('*'), t) ?? [];
      },
      async remove(filter, options = {}) {
        return (check<Row[]>(await where(db.from(t).delete(), filter as Row, options as ListOptions<Row>).select('*'), t) ?? []).length;
      },
      async upsert(row, conflict) { return check<R>(await db.from(t).upsert(row, { onConflict: conflict.join(',') }).select('*').single(), t); },
    };
  }
  return {
    table,
    async createCentre(input) {
      const result = obj(await rpc('ai_centre_create_workspace', {
        p_name: input.name, p_owner: input.ownerId, p_tenant: input.academyTenantId, p_contract: input.contractPlan, p_until: input.contractUntil,
        p_via: input.via, p_by: input.createdBy, p_public_key: input.publicKey,
      }));
      return { created: result.created === true, workspaceId: String(result.workspace_id) };
    },
    async acceptInvite(input): Promise<AcceptInviteResult> {
      const result = obj(await rpc('ai_centre_accept_invite', {
        p_code_hash: input.codeHash, p_user: input.userId, p_teacher_seats: input.teacherSeats, p_student_seats: input.studentSeats, p_budgets: input.budgets, p_now: input.now.toISOString(),
      }));
      if (result.ok === true) return { ok: true, already: result.already === true, workspaceId: String(result.workspace_id), role: result.role as Role, status: result.status === 'suspended' ? 'suspended' : 'active' };
      return { ok: false, code: result.code as 'invite_invalid', ...(typeof result.limit === 'number' ? { limit: result.limit } : {}) };
    },
    async members(workspaceId) {
      const rows = await rpc<Row[]>('ai_centre_members', { p_workspace: workspaceId }) ?? [];
      return rows.map((row): MemberInfo => ({
        userId: String(row.user_id), role: row.role as Role, status: row.status === 'suspended' ? 'suspended' : 'active', creditBudget: row.credit_budget === null ? null : Number(row.credit_budget),
        budgetPeriod: row.budget_period === null ? null : String(row.budget_period), budgetUsed: Number(row.budget_used ?? 0), joinedAt: String(row.joined_at), name: row.name === null ? null : String(row.name),
      }));
    },
    async updateMember(workspaceId, userId, patch) {
      const values: Row = {};
      if (patch.role !== undefined) values.role = patch.role;
      if (patch.status !== undefined) values.status = patch.status;
      if (patch.creditBudget !== undefined) values.credit_budget = patch.creditBudget;
      const rows = check<Row[]>(await db.from('ai_workspace_members').update(values).eq('workspace_id', workspaceId).eq('user_id', userId).neq('role', 'owner').select('user_id'));
      return rows.length > 0;
    },
    async removeMember(workspaceId, userId) {
      await db.from('ai_centre_group_members').delete().eq('workspace_id', workspaceId).eq('user_id', userId);
      const rows = check<Row[]>(await db.from('ai_workspace_members').delete().eq('workspace_id', workspaceId).eq('user_id', userId).neq('role', 'owner').select('user_id'));
      return rows.length > 0;
    },
    async workspaceIdByTenant(tenantId) {
      const row = check<Row | null>(await db.from('ai_workspaces').select('id').eq('academy_tenant_id', tenantId).maybeSingle());
      return row ? String(row.id) : null;
    },
    async takePublic(workspaceId, bucket, day, cap) {
      return (await rpc<boolean>('ai_centre_take_public', { p_workspace: workspaceId, p_bucket: bucket, p_day: day, p_cap: cap })) === true;
    },
    async claimStaffCode(workspaceId, codeHash, chatId, now) {
      const result = obj(await rpc('ai_centre_claim_staff_code', { p_workspace: workspaceId, p_code_hash: codeHash, p_chat: chatId, p_now: now.toISOString() }));
      return result.ok === true ? String(result.user_id) : null;
    },
    async searchKnowledge(workspaceId, query, limit) {
      const rows = await rpc<Row[]>('ai_centre_knowledge_search', { p_workspace: workspaceId, p_query: query, p_limit: limit }) ?? [];
      return rows.map((row): KnowledgeHit => ({ chunkId: Number(row.chunk_id), docId: String(row.doc_id), title: String(row.title), page: Number(row.page), content: String(row.content), rank: Number(row.rank) }));
    },
    async usage(workspaceId, since) {
      const result = obj(await rpc('ai_centre_usage', { p_workspace: workspaceId, p_since: since.toISOString() }));
      const list = (value: unknown) => (Array.isArray(value) ? value : []) as Record<string, unknown>[];
      const cost = obj(result.cost), byok = obj(result.byok);
      return {
        features: list(result.features).map((row) => ({ key: String(row.key), credits: Number(row.credits ?? 0), charges: Number(row.charges ?? 0) })),
        members: list(result.members).map((row) => ({ user_id: String(row.user_id), credits: Number(row.credits ?? 0) })),
        days: list(result.days).map((row) => ({ day: String(row.day), credits: Number(row.credits ?? 0) })),
        cost: { usd: Number(cost.usd ?? 0), calls: Number(cost.calls ?? 0), failed: Number(cost.failed ?? 0) },
        byok: { calls: Number(byok.calls ?? 0), input_tokens: Number(byok.input_tokens ?? 0), output_tokens: Number(byok.output_tokens ?? 0) },
      } satisfies UsageReport;
    },
    async auditEvents(workspaceId, options) {
      let query = db.from('ai_audit_events').select('id,actor_id,event,target_type,target_id,details,created_at').eq('workspace_id', workspaceId);
      if (options.before !== undefined) query = query.lt('id', options.before);
      const rows = check<Row[]>(await query.order('id', { ascending: false }).limit(options.limit)) ?? [];
      return rows.map((row): AuditRow => ({ id: Number(row.id), actor_id: row.actor_id === null ? null : String(row.actor_id), event: String(row.event), target_type: row.target_type === null ? null : String(row.target_type), target_id: row.target_id === null ? null : String(row.target_id), details: obj(row.details), created_at: String(row.created_at) }));
    },
  };
}
