import { tashkentMonth, type Registry } from '../../../packages/ai-core/src/mod.ts';
import type {
  ActionRow, AuditEvent, Balance, CallRecord, ChargeOutcome, GenerationRow, LearningEvent, Member, Message, NotifyDecision, PageRevisionRow, PageRow, ReportRow,
  SchoodAIRepository, ServiceSettings, SpecialistRow, Thread, UserProfile, Workspace,
} from './types.ts';

// In-memory repository for tests and local development. Never used by the deployed
// function. Mirrors the migration's behaviour: 30-day plan cycles, plan-then-pack
// charging, budgets, replay of request keys, single refunds, all-or-nothing caps and
// the notification budget in each person's time zone.

const CYCLE_MS = 30 * 86_400_000;
const DEFAULT_SETTINGS: ServiceSettings = { aiEnabled: true, features: {}, globalDailyCalls: 1000, userDailyCalls: 300, workspaceDailyCalls: 5000, globalDailyUsd: null };

export const SEED_REGISTRY: Registry = {
  providers: [{ key: 'openrouter', adapter: 'openai_compatible', displayName: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', apiKeyEnv: 'OPENROUTER_API_KEY', headers: { 'HTTP-Referer': 'https://ai.schood.online', 'X-Title': 'Schood AI' }, config: {}, enabled: true }],
  models: [{ key: 'openrouter/google/gemma-4-31b-it:free', providerKey: 'openrouter', modelId: 'google/gemma-4-31b-it:free', displayName: 'Gemma 4 31B (free)', capabilities: ['chat', 'stream', 'json', 'vision'], contextWindow: null, maxOutput: 4096, inputUsdPerMTok: 0, outputUsdPerMTok: 0, noTraining: false, enabled: true }],
  routes: [{ key: 'default', modelKeys: ['openrouter/google/gemma-4-31b-it:free'], requiredCapabilities: [], requireNoTraining: false, maxOutputTokens: null, temperature: null, enabled: true }],
};

interface Account { plan: number; grant: number; anchor: number | null; cycle: number | null; seen: number | null; pack: number }
interface LedgerEntry { id: number; workspaceId: string; userId: string | null; kind: string; bucket: 'plan' | 'pack'; delta: number; balanceAfter: number; creditKey: string | null; chargeId: string | null; reference: string | null; createdAt: string }
export interface MemoryUser { id: string; email?: string; role?: string; isActive?: boolean; telegramChatId?: string | null; name?: string | null; products?: string[]; productStarts?: Record<string, string>; permissions?: string[]; timeZone?: string }

export function createMemoryRepository(options: { users: Record<string, MemoryUser>; now?: () => Date; registry?: Registry; settings?: Partial<ServiceSettings> }) {
  const now = options.now ?? (() => new Date());
  const iso = () => now().toISOString();
  const users = new Map(Object.entries(options.users).map(([token, user]) => [token, user]));
  const byId = new Map([...users.values()].map((user) => [user.id, user]));
  let settings: ServiceSettings = { ...DEFAULT_SETTINGS, ...options.settings };
  const registry: Registry = structuredClone(options.registry ?? SEED_REGISTRY);
  const workspaces = new Map<string, Workspace>(), members = new Map<string, Member>(), accounts = new Map<string, Account>();
  const ledger: LedgerEntry[] = [], calls: CallRecord[] = [], usage = new Map<string, { calls: number; cost: number }>();
  const threads = new Map<string, Thread>(), messages = new Map<string, Message>(), specialists = new Map<string, SpecialistRow[]>();
  const actions = new Map<string, ActionRow>(), generations = new Map<string, GenerationRow>(), reports = new Map<string, ReportRow>();
  const audit: AuditEvent[] = [], learning: LearningEvent[] = [], notified = new Map<string, number>();
  const pages = new Map<string, PageRow>(), revisions = new Map<string, PageRevisionRow[]>();
  let ledgerId = 0;
  const memberKey = (workspaceId: string, userId: string) => `${workspaceId}:${userId}`;
  const view = (a: Account): Balance => ({ plan: a.plan, planGrant: a.grant, pack: a.pack, total: a.plan + a.pack, cycleEndsAt: a.anchor === null ? null : new Date(a.anchor + ((a.cycle ?? 0) + 1) * CYCLE_MS).toISOString() });
  const write = (entry: Omit<LedgerEntry, 'id' | 'createdAt'>) => ledger.push({ ...entry, id: ++ledgerId, createdAt: iso() });
  const account = (workspaceId: string) => {
    let a = accounts.get(workspaceId);
    if (!a) { a = { plan: 0, grant: 0, anchor: null, cycle: null, seen: null, pack: 0 }; accounts.set(workspaceId, a); }
    return a;
  };
  function sync(workspaceId: string, grant: number, planAnchor: string | null): Account {
    const a = account(workspaceId), t = now().getTime();
    if (grant <= 0) return a;
    const base = { workspaceId, userId: null, creditKey: null, chargeId: null };
    const anchor = planAnchor ? Date.parse(planAnchor) : a.anchor ?? t;
    const cycle = Math.max(0, Math.floor((t - anchor) / CYCLE_MS));
    if (a.anchor !== anchor || cycle > (a.cycle ?? 0)) {
      if (a.plan > 0) write({ ...base, kind: 'expire', bucket: 'plan', delta: -a.plan, balanceAfter: 0, reference: `expire:${a.anchor ?? 'none'}:${a.cycle}` });
      Object.assign(a, { anchor, cycle, grant, plan: grant });
      write({ ...base, kind: 'grant', bucket: 'plan', delta: grant, balanceAfter: grant, reference: `grant:${anchor}:${cycle}` });
    } else if (grant > a.grant) {
      a.plan += grant - a.grant;
      write({ ...base, kind: 'grant', bucket: 'plan', delta: grant - a.grant, balanceAfter: a.plan, reference: `grant:${anchor}:${a.cycle}:to:${grant}` });
      a.grant = grant;
    }
    a.seen = Math.max(a.seen ?? 0, t);
    return a;
  }
  function localParts(timeZone: string) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(now()).map((part) => [part.type, part.value]));
    return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
  }

  const repository: SchoodAIRepository = {
    user: (token) => Promise.resolve(users.has(token) ? { id: users.get(token)!.id, email: users.get(token)!.email ?? null } : null),
    profile: (userId) => {
      const user = byId.get(userId);
      return Promise.resolve(user ? { id: user.id, role: user.role ?? 'user', isActive: user.isActive !== false, telegramChatId: user.telegramChatId ?? null, name: user.name ?? null } satisfies UserProfile : null);
    },
    adminPermissions: (userId) => Promise.resolve(byId.get(userId)?.permissions ?? []),
    productsHeldBy: (userId) => Promise.resolve(byId.get(userId)?.products ?? []),
    productStarts: (userId) => Promise.resolve({ ...(byId.get(userId)?.productStarts ?? {}) }),

    ensurePersonalWorkspace(userId, name) {
      let found = [...workspaces.values()].find((ws) => ws.kind === 'personal' && ws.ownerId === userId);
      if (!found) {
        found = { id: crypto.randomUUID(), kind: 'personal', name: name.slice(0, 120) || 'My workspace', ownerId: userId, academyTenantId: null, contractPlan: null, contractUntil: null, branding: {}, houseStyle: {}, settings: {}, status: 'active' };
        workspaces.set(found.id, found);
        members.set(memberKey(found.id, userId), { workspaceId: found.id, userId, role: 'owner', status: 'active', creditBudget: null, budgetPeriod: null, budgetUsed: 0 });
      }
      return Promise.resolve(structuredClone(found));
    },
    workspace: (id) => Promise.resolve(workspaces.has(id) ? structuredClone(workspaces.get(id)!) : null),
    membership: (workspaceId, userId) => Promise.resolve(members.has(memberKey(workspaceId, userId)) ? { ...members.get(memberKey(workspaceId, userId))! } : null),
    memberships: (userId) => Promise.resolve([...members.values()].filter((m) => m.userId === userId).map((m) => ({ member: { ...m }, workspace: structuredClone(workspaces.get(m.workspaceId)!) }))),
    updateWorkspace(id, patch) {
      const ws = workspaces.get(id)!;
      Object.assign(ws, structuredClone(patch));
      return Promise.resolve(structuredClone(ws));
    },

    settings: () => Promise.resolve(structuredClone(settings)),
    updateSettings(patch) { settings = { ...settings, ...patch }; return Promise.resolve(structuredClone(settings)); },
    registry: () => Promise.resolve(structuredClone(registry)),
    saveProvider(value) { registry.providers = [...registry.providers.filter((p) => p.key !== value.key), structuredClone(value)]; return Promise.resolve(); },
    saveModel(value) { registry.models = [...registry.models.filter((m) => m.key !== value.key), structuredClone(value)]; return Promise.resolve(); },
    saveRoute(value) { registry.routes = [...registry.routes.filter((r) => r.key !== value.key), structuredClone(value)]; return Promise.resolve(); },

    takeCall(input) {
      const key = (scope: string, id: string | null) => `${input.day}:${scope}:${id}`;
      const read = (scope: string, id: string | null) => usage.get(key(scope, id)) ?? { calls: 0, cost: 0 };
      const g = read('global', null);
      if (g.calls >= input.globalCap) return Promise.resolve({ ok: false, scope: 'global' });
      if (input.globalUsd !== null && g.cost >= input.globalUsd) return Promise.resolve({ ok: false, scope: 'spend' });
      if (input.workspaceId && read('workspace', input.workspaceId).calls >= input.workspaceCap) return Promise.resolve({ ok: false, scope: 'workspace' });
      if (input.userId && read('user', input.userId).calls >= input.userCap) return Promise.resolve({ ok: false, scope: 'user' });
      for (const [scope, id] of [['global', null], ['workspace', input.workspaceId], ['user', input.userId]] as const) {
        if (scope !== 'global' && !id) continue;
        const entry = read(scope, id);
        usage.set(key(scope, id), { ...entry, calls: entry.calls + 1 });
      }
      return Promise.resolve({ ok: true });
    },
    recordCalls(rows) {
      calls.push(...structuredClone(rows));
      return Promise.resolve();
    },
    usage: () => Promise.resolve(calls.map((row) => ({ feature: row.feature, modelKey: row.modelKey, status: row.status, calls: 1, costUsd: row.costUsd, latencyMs: row.latencyMs }))),

    creditBalance: (workspaceId, grant, anchor) => Promise.resolve(view(sync(workspaceId, grant, anchor))),
    charge(input): Promise<ChargeOutcome> {
      const ws = workspaces.get(input.workspaceId);
      if (!ws) return Promise.reject(new Error('workspace_not_found'));
      const a = sync(input.workspaceId, input.grant, input.anchor);
      const previous = ledger.filter((row) => row.workspaceId === input.workspaceId && row.kind === 'charge' && row.reference === input.reference);
      if (previous.length) {
        if (ledger.some((row) => row.kind === 'refund' && row.chargeId === previous[0].chargeId)) return Promise.resolve({ ok: false, code: 'reference_refunded' });
        return Promise.resolve({ ok: true, chargeId: previous[0].chargeId!, cost: previous.reduce((sum, row) => sum - row.delta, 0), replayed: true, balance: view(a) });
      }
      const month = tashkentMonth(now());
      let m: Member | undefined, used = 0;
      if (ws.kind === 'centre') {
        m = members.get(memberKey(ws.id, input.userId));
        if (!m || m.status !== 'active') return Promise.resolve({ ok: false, code: 'not_member' });
        used = m.budgetPeriod === month ? m.budgetUsed : 0;
        if (m.creditBudget !== null && used + input.cost > m.creditBudget) return Promise.resolve({ ok: false, code: 'budget_exhausted', cost: input.cost, budget: m.creditBudget, used, balance: view(a) });
      }
      if (a.plan + a.pack < input.cost) return Promise.resolve({ ok: false, code: 'insufficient_credits', cost: input.cost, available: a.plan + a.pack, balance: view(a) });
      const chargeId = crypto.randomUUID(), fromPlan = Math.min(a.plan, input.cost), fromPack = input.cost - fromPlan;
      const base = { workspaceId: ws.id, userId: input.userId, kind: 'charge', creditKey: input.creditKey, chargeId, reference: input.reference };
      if (fromPlan) { a.plan -= fromPlan; write({ ...base, bucket: 'plan', delta: -fromPlan, balanceAfter: a.plan }); }
      if (fromPack) { a.pack -= fromPack; write({ ...base, bucket: 'pack', delta: -fromPack, balanceAfter: a.pack }); }
      if (m) Object.assign(m, { budgetPeriod: month, budgetUsed: used + input.cost });
      return Promise.resolve({ ok: true, chargeId, cost: input.cost, replayed: false, balance: view(a) });
    },
    refund(chargeId) {
      const rows = ledger.filter((row) => row.chargeId === chargeId && row.kind === 'charge');
      if (!rows.length || ledger.some((row) => row.chargeId === chargeId && row.kind === 'refund')) return Promise.resolve({ refunded: 0 });
      const a = account(rows[0].workspaceId);
      let total = 0;
      for (const row of rows) {
        if (row.bucket === 'plan') a.plan -= row.delta; else a.pack -= row.delta;
        write({ ...row, kind: 'refund', delta: -row.delta, balanceAfter: row.bucket === 'plan' ? a.plan : a.pack, reference: null });
        total -= row.delta;
      }
      const ws = workspaces.get(rows[0].workspaceId), m = rows[0].userId ? members.get(memberKey(rows[0].workspaceId, rows[0].userId)) : undefined;
      if (ws?.kind === 'centre' && m && m.budgetPeriod === tashkentMonth(new Date(rows[0].createdAt))) m.budgetUsed = Math.max(0, m.budgetUsed - total);
      return Promise.resolve({ refunded: total });
    },
    grantCredits(input) {
      const a = account(input.workspaceId);
      if (!ledger.some((row) => row.workspaceId === input.workspaceId && row.kind === input.kind && row.reference === input.reference)) {
        a.pack += input.amount;
        write({ workspaceId: input.workspaceId, userId: input.userId, kind: input.kind, bucket: 'pack', delta: input.amount, balanceAfter: a.pack, creditKey: null, chargeId: null, reference: input.reference });
      }
      return Promise.resolve(view(a));
    },
    ledger: (workspaceId, options) => Promise.resolve(ledger.filter((row) => row.workspaceId === workspaceId && (!options.userId || row.userId === options.userId)).reverse().slice(0, options.limit).map((row) => ({ ...row }))),

    threads: (workspaceId, userId, limit) => Promise.resolve([...threads.values()].filter((t) => t.workspaceId === workspaceId && t.userId === userId).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.lastMessageAt.localeCompare(a.lastMessageAt)).slice(0, limit).map((t) => ({ ...t }))),
    thread: (id) => Promise.resolve(threads.has(id) ? { ...threads.get(id)! } : null),
    createThread(input) {
      const row: Thread = { ...input, id: crypto.randomUUID(), pinned: false, createdAt: iso(), lastMessageAt: iso() };
      threads.set(row.id, row);
      return Promise.resolve({ ...row });
    },
    updateThread(id, patch) {
      const row = threads.get(id);
      if (!row) return Promise.resolve(null);
      const { touch, ...fields } = patch;
      Object.assign(row, fields, touch ? { lastMessageAt: iso() } : {});
      return Promise.resolve({ ...row });
    },
    deleteThreads(workspaceId, userId, ids) {
      const doomed = [...threads.values()].filter((t) => t.workspaceId === workspaceId && t.userId === userId && (ids === 'all' || ids.includes(t.id)));
      for (const t of doomed) {
        threads.delete(t.id);
        for (const [key, m] of messages) if (m.threadId === t.id) messages.delete(key);
      }
      return Promise.resolve(doomed.length);
    },
    messages: (threadId, limit) => Promise.resolve([...messages.values()].filter((m) => m.threadId === threadId).slice(-limit).map((m) => ({ ...m }))),
    message: (id) => Promise.resolve(messages.has(id) ? { ...messages.get(id)! } : null),
    addMessage(input) {
      if (input.clientMessageId && [...messages.values()].some((m) => m.threadId === input.threadId && m.clientMessageId === input.clientMessageId)) return Promise.resolve(null);
      const row: Message = { ...input, id: crypto.randomUUID(), createdAt: iso() };
      messages.set(row.id, row);
      return Promise.resolve({ ...row });
    },
    updateMessage(id, patch) { Object.assign(messages.get(id) ?? {}, patch); return Promise.resolve(); },
    deleteMessage(id) { messages.delete(id); return Promise.resolve(); },

    specialists: (workspaceId) => Promise.resolve(structuredClone(specialists.get(workspaceId) ?? [])),

    createAction(input) {
      const row: ActionRow = { ...structuredClone(input), id: crypto.randomUUID(), status: 'pending', decidedBy: null, decidedAt: null, startedAt: null, finishedAt: null, attempts: 0, result: null, errorCode: null, createdAt: iso() };
      actions.set(row.id, row);
      return Promise.resolve(structuredClone(row));
    },
    action: (id) => Promise.resolve(actions.has(id) ? structuredClone(actions.get(id)!) : null),
    actions: (workspaceId, options) => Promise.resolve([...actions.values()].filter((a) => a.workspaceId === workspaceId && (!options.statuses?.length || options.statuses.includes(a.status))).reverse().slice(0, options.limit).map((a) => structuredClone(a))),
    transitionAction(id, from, patch) {
      const row = actions.get(id);
      if (!row || !from.includes(row.status)) return Promise.resolve(null);
      Object.assign(row, structuredClone(patch));
      return Promise.resolve(structuredClone(row));
    },

    createGeneration(input) {
      const row: GenerationRow = { status: 'requested', output: null, verification: null, progress: {}, errorCode: null, credits: 0, chargeId: null, modelKey: null, decidedBy: null, decidedAt: null, heartbeatAt: null, ...structuredClone(input), id: crypto.randomUUID(), createdAt: iso(), updatedAt: iso() };
      generations.set(row.id, row);
      return Promise.resolve(structuredClone(row));
    },
    generation: (id) => Promise.resolve(generations.has(id) ? structuredClone(generations.get(id)!) : null),
    generations: (workspaceId, userId, limit) => Promise.resolve([...generations.values()].filter((g) => g.workspaceId === workspaceId && (!userId || g.userId === userId)).reverse().slice(0, limit).map((g) => structuredClone(g))),
    updateGeneration(id, patch, from) {
      const row = generations.get(id);
      if (!row || (from?.length && !from.includes(row.status))) return Promise.resolve(null);
      Object.assign(row, structuredClone(patch), { updatedAt: iso() });
      return Promise.resolve(structuredClone(row));
    },

    createReport(input) {
      const existing = [...reports.values()].find((r) => r.messageId === input.messageId && r.reporterId === input.reporterId);
      if (existing) return Promise.resolve({ id: existing.id, created: false });
      const row: ReportRow = { ...input, id: crypto.randomUUID(), status: 'open', createdAt: iso() };
      reports.set(row.id, row);
      return Promise.resolve({ id: row.id, created: true });
    },
    reports: (status, limit) => Promise.resolve([...reports.values()].filter((r) => r.status === status).slice(0, limit)),
    reviewReport(id, status) {
      const row = reports.get(id);
      if (row) row.status = status;
      return Promise.resolve(!!row);
    },
    audit(event) { audit.push(structuredClone(event)); return Promise.resolve(); },

    addLearningEvents(events) { learning.push(...structuredClone(events)); return Promise.resolve(); },
    createPage(input) {
      const row: PageRow = { ...structuredClone(input), id: crypto.randomUUID(), revision: 1, updatedBy: input.ownerId, createdAt: iso(), updatedAt: iso() };
      pages.set(row.id, row);
      return Promise.resolve(structuredClone(row));
    },
    page: (id) => Promise.resolve(pages.has(id) ? structuredClone(pages.get(id)!) : null),
    pages(q) {
      const words = (q.query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
      const visible = [...pages.values()].filter((p) => p.workspaceId === q.workspaceId
        && (q.scope === 'mine' ? p.ownerId === q.viewerId : q.scope === 'workspace' ? p.visibility === 'workspace' : q.manager || p.ownerId === q.viewerId || p.visibility === 'workspace')
        && (q.folder === undefined || q.folder === null || p.folder === q.folder) && (!q.kind || p.kind === q.kind)
        && (q.status ? p.status === q.status : p.status !== 'archived') && (!q.before || p.updatedAt < q.before)
        && words.every((word) => `${p.title} ${p.folder} ${p.body}`.toLowerCase().includes(word)));
      return Promise.resolve(visible.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, q.limit).map((p) => ({ ...structuredClone(p), body: p.body.replace(/\s+/g, ' ').slice(0, 240) })));
    },
    savePage(id, expected, patch, authorId, snapshot) {
      const p = pages.get(id);
      if (!p) return Promise.resolve({ ok: false, code: 'not_found', current: null });
      if (p.revision !== expected) return Promise.resolve({ ok: false, code: 'revision_conflict', current: structuredClone(p) });
      const history = revisions.get(id) ?? [];
      const recent = history.some((r) => Date.parse(r.createdAt) > now().getTime() - 600_000);
      if (snapshot || p.updatedBy !== authorId || !recent) {
        if (!history.some((r) => r.revision === p.revision)) history.push({ pageId: id, revision: p.revision, title: p.title, body: p.body, material: structuredClone(p.material), authorId: p.updatedBy, createdAt: iso() });
      }
      revisions.set(id, history.sort((a, b) => b.revision - a.revision).slice(0, 200));
      Object.assign(p, structuredClone(patch), { revision: p.revision + 1, updatedAt: iso(), updatedBy: authorId });
      return Promise.resolve({ ok: true, page: structuredClone(p) });
    },
    deletePage(id) { revisions.delete(id); return Promise.resolve(pages.delete(id)); },
    pageRevisions: (id, limit) => Promise.resolve((revisions.get(id) ?? []).slice(0, limit).map((r) => ({ ...structuredClone(r), body: '', material: null }))),
    pageRevision: (id, revision) => Promise.resolve(structuredClone((revisions.get(id) ?? []).find((r) => r.revision === revision) ?? null)),
    folders(q) {
      const counts = new Map<string, number>();
      for (const p of pages.values()) if (p.workspaceId === q.workspaceId && p.status !== 'archived' && (q.manager || p.ownerId === q.viewerId || p.visibility === 'workspace')) counts.set(p.folder, (counts.get(p.folder) ?? 0) + 1);
      return Promise.resolve([...counts].map(([path, count]) => ({ path, count })).sort((a, b) => a.path.localeCompare(b.path)));
    },
    moveFolder(q, from, to) {
      let moved = 0;
      for (const p of pages.values()) {
        if (p.workspaceId !== q.workspaceId || (!q.manager && p.ownerId !== q.viewerId) || !(p.folder === from || p.folder.startsWith(`${from}/`))) continue;
        p.folder = `${to}${p.folder.slice(from.length)}`.replace(/^\//, '');
        moved++;
      }
      return Promise.resolve(moved);
    },
    notify(userId, _channel, take): Promise<NotifyDecision> {
      const zone = byId.get(userId)?.timeZone ?? 'Asia/Tashkent';
      const { day, hour } = localParts(zone);
      // Quiet 22:00-08:00 local; the next allowed moment is reported as 08:00 local (approximated for tests in UTC+5 zones).
      if (hour >= 22 || hour < 8) return Promise.resolve({ allowed: false, reason: 'quiet_hours', retryAt: `${day}T08:00:00` });
      const key = `${userId}:${day}`, sent = notified.get(key) ?? 0;
      if (sent >= 2) return Promise.resolve({ allowed: false, reason: 'daily_limit', retryAt: `${day}T08:00:00` });
      if (take) notified.set(key, sent + 1);
      return Promise.resolve({ allowed: true, remaining: 2 - sent - (take ? 1 : 0) });
    },
  };

  /** Test helpers: create centre workspaces and members directly. */
  const seed = {
    centre(input: { name: string; ownerId: string; contractPlan?: 'enterprise' | null; settings?: Record<string, unknown>; branding?: Record<string, unknown> }): Workspace {
      const ws: Workspace = { id: crypto.randomUUID(), kind: 'centre', name: input.name, ownerId: input.ownerId, academyTenantId: null, contractPlan: input.contractPlan ?? null, contractUntil: null, branding: input.branding ?? {}, houseStyle: {}, settings: input.settings ?? {}, status: 'active' };
      workspaces.set(ws.id, ws);
      members.set(memberKey(ws.id, input.ownerId), { workspaceId: ws.id, userId: input.ownerId, role: 'owner', status: 'active', creditBudget: null, budgetPeriod: null, budgetUsed: 0 });
      return ws;
    },
    member(workspaceId: string, userId: string, role: Member['role'], extra: Partial<Member> = {}) {
      members.set(memberKey(workspaceId, userId), { workspaceId, userId, role, status: 'active', creditBudget: null, budgetPeriod: null, budgetUsed: 0, ...extra });
    },
    specialist(workspaceId: string, row: SpecialistRow) { specialists.set(workspaceId, [...(specialists.get(workspaceId) ?? []), row]); },
  };
  return { repository, seed, ledger, calls, audit, learning, workspaces, members, threads, messages, actions, generations, reports, accounts, pages, revisions };
}
