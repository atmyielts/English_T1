import { createMemoryRepository } from '../memory-repository.ts';
import type { Member, Role, Workspace } from '../types.ts';
import {
  TABLES, type AcceptInviteResult, type AuditRow, type CentreStore, type KnowledgeHit, type ListOptions, type MemberInfo, type Row, type Table, type TableMap, type TableName, type UsageReport,
} from './store.ts';

// The centre store over the memory repository, for tests and the local dev stack.
// It writes centre workspaces and members into the memory repository's own maps (as
// the SQL functions write ai_workspaces and ai_workspace_members) and mirrors the
// migration's defaults, unique keys and atomic operations.

export class StoreConflict extends Error {
  constructor(table: string) { super(`unique violation on ${table}`); }
}
type Memory = ReturnType<typeof createMemoryRepository>;

const json = <T>(value: T): T => structuredClone(value);
/** Fields set to undefined are left out, as JSON drops them on the way to Postgres. */
const defined = <T extends object>(value: T): T => Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
const same = (a: unknown, b: unknown) => (a !== null && typeof a === 'object') || (b !== null && typeof b === 'object') ? JSON.stringify(a) === JSON.stringify(b) : a === b;

export function createMemoryCentreStore(memory: Memory, now: () => Date = () => new Date()): CentreStore {
  const iso = () => now().toISOString();
  const id = () => crypto.randomUUID();
  let serial = 0;
  const DEFAULTS: { [N in TableName]: () => Partial<TableMap[N]> } = {
    settings: () => ({ created_by: null, embed_domains: [], widgets: {}, white_label: {}, retention_days: 180, extra_teacher_seats: 0, extra_students: 0, limits: {}, budget_defaults: {}, observation_standards: [], brief: {}, byok_fee: {}, updated_by: null, created_at: iso(), updated_at: iso() }),
    groups: () => ({ id: id(), academy_classroom_id: null, level: null, teacher_ids: [], hint_policy: 'during_homework', focus_topics: [], homework_rule: null, note: null, archived: false, created_by: null, created_at: iso(), updated_at: iso() }),
    group_members: () => ({ added_at: iso() }),
    assignment_rules: () => ({ title: null, set_by: null, updated_at: iso() }),
    invites: () => ({ id: id(), label: null, max_uses: 1, uses: 0, created_by: null, revoked_at: null, created_at: iso() }),
    results: () => ({ id: id(), result_date: null, source: 'entered', verified: false, verified_by: null, verified_at: null, evidence_note: null, consent: false, created_by: null, created_at: iso() }),
    attempts: () => ({ id: id(), test_page_id: null, test_revision: null, taker_user_id: null, prospect: {}, thread_id: null, status: 'in_progress', answers: {}, objective: null, ai_marks: null, level: null, report: null, reviewed_by: null, reviewed_at: null, submitted_at: null, created_at: iso(), updated_at: iso() }),
    curricula: () => ({ id: id(), brief: {}, status: 'draft', outline: null, created_by: null, reviewer_id: null, published_at: null, publish_action_id: null, created_at: iso(), updated_at: iso() }),
    units: () => ({ id: id(), status: 'pending', generation_id: null, content: null, review_notes: null, reviewed_by: null, reviewed_at: null, page_ids: [], attempts: 0, created_at: iso(), updated_at: iso() }),
    insights: () => ({ computed_at: iso() }),
    secrets: () => ({ id: id(), config: {}, created_by: null, created_at: iso(), revoked_at: null }),
    admissions: () => ({ enabled: false, bot_ref: null, bot_username: null, bot_id: null, webhook_secret_hash: null, faq: [], prices: [], booking: {}, handover: {}, greeting: {}, placement_page_id: null, updated_by: null, created_at: iso(), updated_at: iso() }),
    threads: () => ({ id: id(), contact: {}, language: 'uz', status: 'open', placement: null, academy_lead_id: null, turns_day: null, turns: 0, last_message_at: iso(), created_at: iso(), updated_at: iso() }),
    admissions_messages: () => ({ id: ++serial, author_id: null, flags: {}, created_at: iso() }),
    bookings: () => ({ id: id(), thread_id: null, contact: {}, action_id: null, academy_lead_id: null, academy_trial_id: null, created_at: iso(), updated_at: iso() }),
    tg_updates: () => ({ received_at: iso() }),
    staff_chats: () => ({ linked_at: iso() }),
    staff_codes: () => ({ used_at: null }),
    resell: () => ({ enabled: false, price_uzs: null, period_days: 30, gate_access: false, student_budget: null, note: null, wholesale_rate_uzs: 9000, updated_by: null, updated_at: iso() }),
    resell_periods: () => ({ id: id(), started_at: iso(), ended_at: null, paid_until: null, note: null, created_by: null }),
    wholesale: () => ({ id: id(), status: 'open', invoice_ref: null, computed_at: iso(), updated_by: null }),
    briefs: () => ({ id: id(), status: 'ready', snapshot_at: null, data: {}, text: '', suggestions: [], deliveries: [], created_by: null, created_at: iso(), updated_at: iso() }),
    snapshots: () => ({ id: id(), captured_by: null, captured_at: iso() }),
    knowledge_docs: () => ({ id: id(), filename: null, mime: null, chars: 0, storage: null, created_by: null, created_at: iso() }),
    knowledge_chunks: () => ({ id: ++serial }),
    byok_fees: () => ({ id: id(), calls: 0, input_tokens: 0, output_tokens: 0, rate_uzs_per_1000: null, fee_uzs: null, status: 'open', computed_at: iso() }),
    observations: () => ({ id: id(), observer_id: null, group_id: null, feedback: null, status: 'draft', teacher_comment: null, shared_at: null, acknowledged_at: null, created_at: iso(), updated_at: iso() }),
    campaigns: () => ({ id: id(), status: 'draft', audience: [], action_ids: [], created_by: null, created_at: iso(), updated_at: iso() }),
  };
  /** Primary and unique keys, as in the migration. */
  const UNIQUE: Partial<Record<TableName, string[][]>> = {
    settings: [['workspace_id'], ['public_key']], groups: [['id']], group_members: [['group_id', 'user_id']], assignment_rules: [['group_id', 'assignment_id']], invites: [['id'], ['code_hash']],
    insights: [['group_id', 'period', 'topic']], admissions: [['workspace_id'], ['bot_ref']], threads: [['id'], ['workspace_id', 'channel', 'external_id']],
    tg_updates: [['workspace_id', 'update_id']], staff_chats: [['workspace_id', 'user_id']], staff_codes: [['code_hash']], resell: [['workspace_id']],
    wholesale: [['workspace_id', 'period']], briefs: [['workspace_id', 'week']], byok_fees: [['workspace_id', 'period']], units: [['curriculum_id', 'position']],
    knowledge_chunks: [['doc_id', 'page', 'chunk']],
  };
  const PARTIAL_UNIQUE: Partial<Record<TableName, { columns: string[]; where(row: Row): boolean }[]>> = {
    secrets: [{ columns: ['workspace_id', 'purpose', 'label'], where: (row) => row.revoked_at === null }],
    resell_periods: [{ columns: ['workspace_id', 'user_id'], where: (row) => row.ended_at === null }],
    groups: [{ columns: ['workspace_id', 'academy_classroom_id'], where: (row) => row.academy_classroom_id !== null }],
  };
  const rows = new Map<TableName, Row[]>();
  const data = (name: TableName) => { let list = rows.get(name); if (!list) { list = []; rows.set(name, list); } return list; };
  const matches = (row: Row, filter: Row = {}, options: ListOptions<Row> = {}) => {
    for (const [key, value] of Object.entries(filter)) if (value !== undefined && !same(row[key], value)) return false;
    for (const [key, values] of Object.entries(options.in ?? {})) if (!(values ?? []).some((value) => same(row[key], value))) return false;
    for (const [key, value] of Object.entries(options.lt ?? {})) if (!(row[key] !== null && row[key] !== undefined && (row[key] as string | number) < (value as string | number))) return false;
    for (const [key, value] of Object.entries(options.gte ?? {})) if (!(row[key] !== null && row[key] !== undefined && (row[key] as string | number) >= (value as string | number))) return false;
    return true;
  };
  const violates = (name: TableName, candidate: Row, ignore?: Row) => {
    const list = data(name).filter((row) => row !== ignore);
    for (const columns of UNIQUE[name] ?? []) if (list.some((row) => columns.every((column) => same(row[column], candidate[column])))) return true;
    for (const rule of PARTIAL_UNIQUE[name] ?? []) if (rule.where(candidate) && list.some((row) => rule.where(row) && rule.columns.every((column) => same(row[column], candidate[column])))) return true;
    return false;
  };

  function table<N extends TableName>(name: N): Table<TableMap[N]> {
    type R = TableMap[N];
    return {
      list(filter = {}, options = {}) {
        let out = data(name).filter((row) => matches(row, filter as Row, options as ListOptions<Row>));
        if (options.order) {
          const key = options.order;
          out = [...out].sort((a, b) => ((a[key] as string) < (b[key] as string) ? -1 : (a[key] as string) > (b[key] as string) ? 1 : 0) * (options.desc ? -1 : 1));
        }
        return Promise.resolve(json(out.slice(0, options.limit ?? 10_000)) as R[]);
      },
      get(filter) {
        const found = data(name).find((row) => matches(row, filter as Row));
        return Promise.resolve(found ? json(found) as R : null);
      },
      insert(row) {
        const full = { ...DEFAULTS[name](), ...json(defined(row)) } as Row;
        if (violates(name, full)) return Promise.reject(new StoreConflict(TABLES[name]));
        data(name).push(full);
        return Promise.resolve(json(full) as R);
      },
      update(filter, patch, options = {}) {
        const changed: Row[] = [];
        for (const row of data(name)) {
          if (!matches(row, filter as Row, options as ListOptions<Row>)) continue;
          const next = { ...row, ...json(defined(patch)), ...('updated_at' in row ? { updated_at: iso() } : {}) };
          if (violates(name, next, row)) return Promise.reject(new StoreConflict(TABLES[name]));
          Object.assign(row, next);
          changed.push(json(row));
        }
        return Promise.resolve(changed as R[]);
      },
      remove(filter, options = {}) {
        const list = data(name), keep = list.filter((row) => !matches(row, filter as Row, options as ListOptions<Row>));
        const removed = list.length - keep.length;
        rows.set(name, keep);
        // Cascades the migration declares.
        if (name === 'knowledge_docs' || name === 'groups' || name === 'curricula' || name === 'threads') {
          const gone = new Set(list.filter((row) => !keep.includes(row)).map((row) => row.id));
          if (name === 'knowledge_docs') rows.set('knowledge_chunks', data('knowledge_chunks').filter((row) => !gone.has(row.doc_id)));
          if (name === 'groups') { rows.set('group_members', data('group_members').filter((row) => !gone.has(row.group_id))); rows.set('insights', data('insights').filter((row) => !gone.has(row.group_id))); rows.set('assignment_rules', data('assignment_rules').filter((row) => !gone.has(row.group_id))); }
          if (name === 'curricula') rows.set('units', data('units').filter((row) => !gone.has(row.curriculum_id)));
          if (name === 'threads') rows.set('admissions_messages', data('admissions_messages').filter((row) => !gone.has(row.thread_id)));
        }
        return Promise.resolve(removed);
      },
      async upsert(row, conflict) {
        const existing = data(name).find((entry) => conflict.every((column) => same(entry[column], (row as Row)[column])));
        if (existing) {
          Object.assign(existing, json(defined(row)), 'updated_at' in existing ? { updated_at: iso() } : {});
          return json(existing) as R;
        }
        return await this.insert(row);
      },
    };
  }

  const counters = new Map<string, number>();
  const member = (workspaceId: string, userId: string) => memory.members.get(`${workspaceId}:${userId}`);
  const store: CentreStore = {
    table,
    async createCentre(input) {
      if (input.academyTenantId) {
        const found = [...memory.workspaces.values()].find((ws) => ws.academyTenantId === input.academyTenantId);
        if (found) return { created: false, workspaceId: found.id };
      }
      const ws: Workspace = {
        id: id(), kind: 'centre', name: input.name.trim().slice(0, 120), ownerId: input.ownerId, academyTenantId: input.academyTenantId,
        contractPlan: input.contractPlan, contractUntil: input.contractUntil, branding: {}, houseStyle: {}, settings: {}, status: 'active',
      };
      memory.workspaces.set(ws.id, ws);
      memory.members.set(`${ws.id}:${input.ownerId}`, { workspaceId: ws.id, userId: input.ownerId, role: 'owner', status: 'active', creditBudget: null, budgetPeriod: null, budgetUsed: 0 });
      await table('settings').insert({ workspace_id: ws.id, created_via: input.via, created_by: input.createdBy, public_key: input.publicKey });
      return { created: true, workspaceId: ws.id };
    },
    async acceptInvite(input): Promise<AcceptInviteResult> {
      const invite = data('invites').find((row) => row.code_hash === input.codeHash);
      if (!invite) return { ok: false, code: 'invite_invalid' };
      const ws = memory.workspaces.get(String(invite.workspace_id));
      if (!ws || ws.kind !== 'centre' || ws.status !== 'active') return { ok: false, code: 'invite_invalid' };
      const existing = member(ws.id, input.userId);
      if (existing) return { ok: true, already: true, workspaceId: ws.id, role: existing.role, status: existing.status };
      if (invite.revoked_at) return { ok: false, code: 'invite_revoked' };
      if (Date.parse(String(invite.expires_at)) <= input.now.getTime()) return { ok: false, code: 'invite_expired' };
      if (Number(invite.uses) >= Number(invite.max_uses)) return { ok: false, code: 'invite_used_up' };
      const active = [...memory.members.values()].filter((m) => m.workspaceId === ws.id && m.status === 'active');
      const role = invite.role as Role;
      if ((role === 'admin' || role === 'teacher') && input.teacherSeats !== null && active.filter((m) => m.role === 'admin' || m.role === 'teacher').length >= input.teacherSeats) return { ok: false, code: 'seats_full', limit: input.teacherSeats };
      if (role === 'student' && input.studentSeats !== null && active.filter((m) => m.role === 'student').length >= input.studentSeats) return { ok: false, code: 'students_full', limit: input.studentSeats };
      const budget = typeof input.budgets[role] === 'number' ? Math.max(0, Math.min(10_000_000, Math.round(input.budgets[role]))) : null;
      memory.members.set(`${ws.id}:${input.userId}`, { workspaceId: ws.id, userId: input.userId, role, status: 'active', creditBudget: budget, budgetPeriod: null, budgetUsed: 0 });
      invite.uses = Number(invite.uses) + 1;
      return { ok: true, already: false, workspaceId: ws.id, role, status: 'active' };
    },
    async members(workspaceId) {
      const list = [...memory.members.values()].filter((m) => m.workspaceId === workspaceId);
      return Promise.all(list.map(async (m): Promise<MemberInfo> => ({
        userId: m.userId, role: m.role, status: m.status, creditBudget: m.creditBudget, budgetPeriod: m.budgetPeriod, budgetUsed: m.budgetUsed,
        joinedAt: iso(), name: (await memory.repository.profile(m.userId))?.name ?? null,
      })));
    },
    updateMember(workspaceId, userId, patch) {
      const m: Member | undefined = member(workspaceId, userId);
      if (!m) return Promise.resolve(false);
      if (patch.role !== undefined) m.role = patch.role;
      if (patch.status !== undefined) m.status = patch.status;
      if (patch.creditBudget !== undefined) m.creditBudget = patch.creditBudget;
      return Promise.resolve(true);
    },
    removeMember(workspaceId, userId) {
      const removed = memory.members.delete(`${workspaceId}:${userId}`);
      rows.set('group_members', data('group_members').filter((row) => !(row.workspace_id === workspaceId && row.user_id === userId)));
      return Promise.resolve(removed);
    },
    workspaceIdByTenant(tenantId) {
      return Promise.resolve([...memory.workspaces.values()].find((ws) => ws.academyTenantId === tenantId)?.id ?? null);
    },
    takePublic(workspaceId, bucket, day, cap) {
      if (cap < 1) return Promise.resolve(false);
      const key = `${workspaceId}|${bucket}|${day}`;
      const count = counters.get(key) ?? 0;
      if (count >= cap) return Promise.resolve(false);
      counters.set(key, count + 1);
      return Promise.resolve(true);
    },
    async claimStaffCode(workspaceId, codeHash, chatId, at) {
      const code = data('staff_codes').find((row) => row.code_hash === codeHash && row.workspace_id === workspaceId && row.used_at === null && Date.parse(String(row.expires_at)) > at.getTime());
      if (!code) return null;
      code.used_at = at.toISOString();
      const m = member(workspaceId, String(code.user_id));
      if (!m || m.status !== 'active' || !['owner', 'admin', 'teacher'].includes(m.role)) return null;
      await table('staff_chats').upsert({ workspace_id: workspaceId, user_id: String(code.user_id), chat_id: chatId, linked_at: at.toISOString() }, ['workspace_id', 'user_id']);
      return String(code.user_id);
    },
    searchKnowledge(workspaceId, query, limit) {
      const terms = query.split('|').map((part) => part.trim().replace(/:\*$/, '').toLowerCase()).filter(Boolean);
      const docs = new Map(data('knowledge_docs').filter((row) => row.workspace_id === workspaceId).map((row) => [row.id, row]));
      const hits: KnowledgeHit[] = [];
      for (const chunk of data('knowledge_chunks')) {
        if (chunk.workspace_id !== workspaceId || !docs.has(chunk.doc_id)) continue;
        const tokens = String(chunk.content).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
        const rank = terms.reduce((sum, term) => sum + tokens.filter((token) => token.startsWith(term)).length, 0);
        if (rank > 0) hits.push({ chunkId: Number(chunk.id), docId: String(chunk.doc_id), title: String(docs.get(chunk.doc_id)!.title), page: Number(chunk.page), content: String(chunk.content), rank: rank / (tokens.length || 1) });
      }
      hits.sort((a, b) => b.rank - a.rank || a.page - b.page);
      return Promise.resolve(hits.slice(0, Math.max(1, Math.min(limit, 20))));
    },
    usage(workspaceId, since): Promise<UsageReport> {
      const rows = memory.ledger.filter((row) => row.workspaceId === workspaceId && (row.kind === 'charge' || row.kind === 'refund') && Date.parse(row.createdAt) >= since.getTime());
      const sum = <K extends string>(key: (row: (typeof rows)[number]) => K | null) => {
        const out = new Map<K, number>();
        for (const row of rows) { const k = key(row); if (k !== null) out.set(k, (out.get(k) ?? 0) - row.delta); }
        return out;
      };
      const charges = new Map<string, Set<string>>();
      for (const row of rows) if (row.kind === 'charge') { const key = row.creditKey ?? 'other'; if (!charges.has(key)) charges.set(key, new Set()); charges.get(key)!.add(String(row.chargeId)); }
      // Memory call rows have no time: they count as made now.
      const calls = since.getTime() <= now().getTime() ? memory.calls.filter((row) => row.workspaceId === workspaceId) : [];
      const own = calls.filter((row) => row.status === 'ok' && (row.providerKey ?? '').startsWith('byok:'));
      return Promise.resolve({
        features: [...sum((row) => row.creditKey ?? 'other')].map(([key, credits]) => ({ key, credits, charges: charges.get(key)?.size ?? 0 })).sort((a, b) => b.credits - a.credits),
        members: [...sum((row) => row.userId)].map(([user_id, credits]) => ({ user_id, credits })).sort((a, b) => b.credits - a.credits),
        days: [...sum((row) => new Date(Date.parse(row.createdAt) + 5 * 3_600_000).toISOString().slice(0, 10))].map(([day, credits]) => ({ day, credits })).sort((a, b) => a.day.localeCompare(b.day)),
        cost: { usd: calls.reduce((total, row) => total + row.costUsd, 0), calls: calls.length, failed: calls.filter((row) => row.status !== 'ok' && row.status !== 'stopped').length },
        byok: { calls: own.length, input_tokens: own.reduce((t, row) => t + (row.inputTokens ?? 0), 0), output_tokens: own.reduce((t, row) => t + (row.outputTokens ?? 0), 0) },
      });
    },
    auditEvents(workspaceId, options) {
      const list: AuditRow[] = memory.audit.map((event, index) => ({ id: index + 1, actor_id: event.actorId, event: event.event, target_type: event.targetType ?? null, target_id: event.targetId ?? null, details: event.details ?? {}, created_at: iso() }))
        .filter((row, index) => memory.audit[index].workspaceId === workspaceId && (options.before === undefined || row.id < options.before));
      return Promise.resolve(list.reverse().slice(0, options.limit));
    },
  };
  return store;
}
