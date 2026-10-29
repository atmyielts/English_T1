import { bool, integer, oneOf, optionalText, record, stringList, uuid } from '../input.ts';
import { SchoodAIError, type RequestContext } from '../types.ts';
import { centreDeps } from './binding.ts';
import { monthOf, requireCentre, type Centre } from './shared.ts';
import type { CentreStore, ResellRow, WholesaleRow } from './store.ts';

// C9 resell AI to students. The centre sells its branded Student Assistant to its
// students' parents at its own price; collecting that money is the centre's own
// business and never passes through Schood. Schood charges the centre a wholesale
// rate for each student who had the resold assistant switched on at any time in a
// month (9,000 UZS [ASSUMPTION]). Until tenant checkout exists, Schood invoices the
// wholesale amount by hand: the ledger is computed here and marked invoiced or paid
// by a Schood admin. With "only paying students" on, students without an active
// resale get a monthly budget of 0 credits, so the assistant refuses them.

export const WHOLESALE_RATE_UZS = 9000;

async function resellRow(store: CentreStore, workspaceId: string): Promise<ResellRow> {
  return await store.table('resell').get({ workspace_id: workspaceId }) ?? await store.table('resell').insert({ workspace_id: workspaceId });
}

/** Distinct students whose resale overlapped the month (Tashkent). */
export async function activeInMonth(store: CentreStore, workspaceId: string, period: string): Promise<string[]> {
  const start = Date.parse(`${period}-01T00:00:00+05:00`);
  const end = new Date(start); end.setUTCMonth(end.getUTCMonth() + 1);
  const rows = await store.table('resell_periods').list({ workspace_id: workspaceId }, { lt: { started_at: end.toISOString() } });
  return [...new Set(rows.filter((row) => !row.ended_at || Date.parse(row.ended_at) >= start).map((row) => row.user_id))];
}

/** Computes (or recomputes, while still open) the wholesale row of a month. */
export async function computeWholesale(store: CentreStore, workspaceId: string, period: string): Promise<WholesaleRow | null> {
  const resell = await resellRow(store, workspaceId);
  const active = await activeInMonth(store, workspaceId, period);
  const existing = await store.table('wholesale').get({ workspace_id: workspaceId, period });
  if (existing && existing.status !== 'open') return existing;
  if (!active.length && !existing) return null;
  const values = { active_students: active.length, rate_uzs: resell.wholesale_rate_uzs, amount_uzs: active.length * resell.wholesale_rate_uzs, computed_at: new Date().toISOString() };
  if (existing) return (await store.table('wholesale').update({ id: existing.id }, values))[0];
  return await store.table('wholesale').insert({ workspace_id: workspaceId, period, ...values });
}

async function applyGate(ctx: RequestContext, centre: Centre, resell: ResellRow) {
  if (!resell.gate_access) return 0;
  const open = new Set((await centre.deps.store.table('resell_periods').list({ workspace_id: centre.access.workspace.id, ended_at: null })).map((row) => row.user_id));
  let changed = 0;
  for (const member of await centre.deps.store.members(centre.access.workspace.id)) {
    if (member.role !== 'student') continue;
    const budget = open.has(member.userId) ? resell.student_budget : 0;
    if (member.creditBudget !== budget && await centre.deps.store.updateMember(centre.access.workspace.id, member.userId, { creditBudget: budget })) changed++;
  }
  return changed;
}

const resellJson = (row: ResellRow) => ({ enabled: row.enabled, price_uzs: row.price_uzs, period_days: row.period_days, gate_access: row.gate_access, student_budget: row.student_budget, note: row.note, wholesale_rate_uzs: row.wholesale_rate_uzs });

export const resell = {
  async GET(ctx: RequestContext) {
    const centre = await requireCentre(ctx, ['owner', 'admin']);
    const ws = centre.access.workspace, period = monthOf(ctx.now());
    const [row, periods, ledger, members] = await Promise.all([
      resellRow(centre.deps.store, ws.id), centre.deps.store.table('resell_periods').list({ workspace_id: ws.id }, { order: 'started_at', desc: true, limit: 2000 }),
      centre.deps.store.table('wholesale').list({ workspace_id: ws.id }, { order: 'period', desc: true, limit: 24 }), centre.deps.store.members(ws.id),
    ]);
    const active = await activeInMonth(centre.deps.store, ws.id, period);
    const open = new Map(periods.filter((entry) => !entry.ended_at).map((entry) => [entry.user_id, entry]));
    return {
      resell: resellJson(row),
      month: { period, active_students: active.length, estimate_uzs: active.length * row.wholesale_rate_uzs },
      students: members.filter((m) => m.role === 'student').map((m) => ({ user_id: m.userId, name: m.name, active: open.has(m.userId), since: open.get(m.userId)?.started_at ?? null, paid_until: open.get(m.userId)?.paid_until ?? null, note: open.get(m.userId)?.note ?? null, budget: m.creditBudget })),
      ledger: ledger.map((entry) => ({ id: entry.id, period: entry.period, active_students: entry.active_students, rate_uzs: entry.rate_uzs, amount_uzs: entry.amount_uzs, status: entry.status, invoice_ref: entry.invoice_ref, computed_at: entry.computed_at })),
      billing: 'manual_invoice',
    };
  },
  /** { enabled?, price_uzs?, period_days?, gate_access?, student_budget?, note? } */
  async PATCH(ctx: RequestContext) {
    const centre = await requireCentre(ctx, ['owner', 'admin']);
    const body = record(await ctx.body());
    const patch: Partial<ResellRow> = { updated_by: ctx.user.id };
    if (body.enabled !== undefined) { patch.enabled = bool(body.enabled, 'enabled'); if (patch.enabled) await ctx.requireFeature('C9'); }
    if (body.price_uzs !== undefined) patch.price_uzs = body.price_uzs === null ? null : integer(body.price_uzs, 'price_uzs', 0, 100_000_000);
    if (body.period_days !== undefined) patch.period_days = integer(body.period_days, 'period_days', 1, 366);
    if (body.gate_access !== undefined) patch.gate_access = bool(body.gate_access, 'gate_access');
    if (body.student_budget !== undefined) patch.student_budget = body.student_budget === null ? null : integer(body.student_budget, 'student_budget', 0, 100_000);
    if (body.note !== undefined) patch.note = optionalText(body.note, 'note', { max: 500 });
    await resellRow(centre.deps.store, centre.access.workspace.id);
    const [row] = await centre.deps.store.table('resell').update({ workspace_id: centre.access.workspace.id }, patch);
    const changed = await applyGate(ctx, centre, row);
    await ctx.audit('centre.resell_settings', { ...Object.fromEntries(Object.entries(patch).filter(([key]) => key !== 'updated_by')), budgets_changed: changed }, { type: 'workspace', id: centre.access.workspace.id });
    return { resell: resellJson(row), budgets_changed: changed };
  },
};

/** POST centre/resell-students { user_ids, active, paid_until?, note? }: switch the resold assistant on or off for students. */
export async function resellStudents(ctx: RequestContext) {
  const centre = await requireCentre(ctx, ['owner', 'admin']);
  const body = record(await ctx.body());
  const ws = centre.access.workspace;
  const ids = stringList(body.user_ids, 'user_ids', { max: 400, pattern: /^[0-9a-f-]{36}$/ });
  const active = bool(body.active, 'active');
  const paidUntil = optionalText(body.paid_until, 'paid_until', { max: 10 });
  if (paidUntil && !/^\d{4}-\d{2}-\d{2}$/.test(paidUntil)) throw new SchoodAIError('invalid_request', 'paid_until is YYYY-MM-DD.', 400, { field: 'paid_until' });
  const row = await resellRow(centre.deps.store, ws.id);
  if (active && !row.enabled) throw new SchoodAIError('resell_off', 'Switch reselling on first.', 409);
  const students = new Set((await centre.deps.store.members(ws.id)).filter((m) => m.role === 'student').map((m) => m.userId));
  let changed = 0;
  for (const id of ids) {
    if (!students.has(id)) continue;
    const open = await centre.deps.store.table('resell_periods').get({ workspace_id: ws.id, user_id: id, ended_at: null });
    if (active && !open) { await centre.deps.store.table('resell_periods').insert({ workspace_id: ws.id, user_id: id, started_at: ctx.now().toISOString(), paid_until: paidUntil, note: optionalText(body.note, 'note', { max: 200 }), created_by: ctx.user.id }); changed++; }
    else if (active && open && paidUntil) await centre.deps.store.table('resell_periods').update({ id: open.id }, { paid_until: paidUntil });
    else if (!active && open) { await centre.deps.store.table('resell_periods').update({ id: open.id }, { ended_at: ctx.now().toISOString() }); changed++; }
  }
  await applyGate(ctx, centre, row);
  await computeWholesale(centre.deps.store, ws.id, monthOf(ctx.now()));
  await ctx.audit('centre.resell_students', { active, changed }, { type: 'workspace', id: ws.id });
  return { changed };
}

/** PATCH centre/wholesale { id, status, invoice_ref? }: Schood admins mark a month invoiced, paid or void. */
export async function wholesale(ctx: RequestContext) {
  if (!await ctx.isSchoodAdmin()) throw new SchoodAIError('admin_required', 'Only Schood admins invoice centres.', 403);
  const body = record(await ctx.body());
  const deps = await centreDeps(ctx);
  const [row] = await deps.store.table('wholesale').update({ id: uuid(body.id, 'id') }, { status: oneOf(body.status, 'status', ['open', 'invoiced', 'paid', 'void'] as const), invoice_ref: body.invoice_ref === undefined ? undefined : optionalText(body.invoice_ref, 'invoice_ref', { max: 80 }), updated_by: ctx.user.id });
  if (!row) throw new SchoodAIError('not_found', 'Ledger row not found.', 404);
  await ctx.repo.audit({ workspaceId: row.workspace_id, actorId: ctx.user.id, event: 'centre.wholesale_status', targetType: 'wholesale', targetId: row.id, details: { status: row.status, period: row.period } });
  return { ledger: row };
}

