import { s } from '../../../../packages/ai-core/src/mod.ts';
import { bool, integer, record, stringList } from '../input.ts';
import { registerNotifyKind } from '../registries.ts';
import { SchoodAIError, type NotifySendResult, type RequestContext } from '../types.ts';
import { actorOf } from './runner.ts';
import type { AcademySnapshot } from './academy.ts';
import { botToken, sendText } from './bot.ts';
import { draftChecked } from './draft.ts';
import { asRecord, centrePrompt, requireCentre, tashkentHour, tashkentWeek, tashkentWeekday, type Centre } from './shared.ts';
import type { BriefRow } from './store.ts';
import { captureSnapshot } from './workspace.ts';

// C10 Monday owner brief: a weekly business brief from Academy in Telegram (leads,
// conversions, payments, debts, attendance, homework, at-risk students, teacher
// workload) plus Schood AI's own week (admissions, bookings, credits), with three
// suggested actions. Built from Academy with the person's token when they ask for
// it, or on Monday morning by the scheduler from the latest Academy snapshot a staff
// member's visit captured (the brief says how old it is). Delivery respects the
// notification budget (two a day per person, quiet 22:00-08:00).

const briefSchema = s.object({
  headline: s.string({ min: 5, max: 160 }),
  text: s.string({ min: 40, max: 1800 }),
  suggestions: s.array(s.object({ title: s.string({ min: 3, max: 120 }), why: s.string({ min: 5, max: 300 }), area: s.enumOf(['parents', 'leads', 'campaign', 'homework', 'teachers', 'payments', 'admissions', 'other'] as const) }), { min: 3, max: 3 }),
});
export const SNAPSHOT_MAX_DAYS = 8;

export interface BriefSettings { enabled: boolean; recipients: string[]; hour: number }
export const briefSettings = (centre: Centre): BriefSettings => {
  const row = asRecord(centre.settings.brief);
  return { enabled: row.enabled === true, recipients: Array.isArray(row.recipients) ? row.recipients.map(String) : [], hour: typeof row.hour === 'number' ? row.hour : 8 };
};

/** Schood AI's own numbers for the last seven days. */
async function aiWeek(ctx: RequestContext, centre: Centre) {
  const ws = centre.access.workspace, since = new Date(ctx.now().getTime() - 7 * 86_400_000).toISOString();
  const [threads, bookings, usage, pending] = await Promise.all([
    centre.deps.store.table('threads').list({ workspace_id: ws.id }, { gte: { created_at: since } }),
    centre.deps.store.table('bookings').list({ workspace_id: ws.id }, { gte: { created_at: since } }),
    centre.deps.store.usage(ws.id, new Date(since)),
    ctx.actions.list({ statuses: ['pending'] }),
  ]);
  return {
    admissions_conversations: threads.length, handed_over: threads.filter((row) => row.status === 'handed_over').length,
    trial_bookings: bookings.filter((row) => row.status !== 'cancelled').length, ai_credits_used: usage.features.reduce((sum, row) => sum + row.credits, 0),
    approvals_waiting: pending.length,
  };
}

/** Builds this week's brief (charged once per week and source; rebuilding the same week replaces it). */
export async function buildBrief(ctx: RequestContext, centre: Centre, mode: 'live' | 'scheduled'): Promise<BriefRow> {
  const ws = centre.access.workspace, now = ctx.now(), week = tashkentWeek(now);
  let academy: AcademySnapshot | null = null, source: BriefRow['source'] = 'none', snapshotAt: string | null = null;
  if (ws.academyTenantId) {
    if (mode === 'live' && ctx.caller === 'user' && ctx.user.token) {
      const fresh = await captureSnapshot(ctx, centre).catch(() => null);
      if (fresh) { academy = fresh.data as unknown as AcademySnapshot; source = 'live'; snapshotAt = fresh.captured_at; }
    }
    if (!academy) {
      const [latest] = await centre.deps.store.table('snapshots').list({ workspace_id: ws.id }, { order: 'captured_at', desc: true, limit: 1 });
      if (latest && now.getTime() - Date.parse(latest.captured_at) < SNAPSHOT_MAX_DAYS * 86_400_000) { academy = latest.data as unknown as AcademySnapshot; source = 'snapshot'; snapshotAt = latest.captured_at; }
    }
  }
  const data = {
    centre: ws.name, week, week_number: Number(week.slice(6)), academy_connected: !!ws.academyTenantId, academy_data_as_of: snapshotAt,
    academy: academy ? { leads: academy.leads, students: academy.students, money: academy.money, attendance_30d_percent: academy.attendance_30d_percent, homework_last_7_days: academy.homework, at_risk: academy.at_risk, teachers: academy.teachers, renewals_due: academy.renewals_due, missing_parts: academy.parts.filter((part) => !part.ok).map((part) => part.name) } : null,
    schood_ai: await aiWeek(ctx, centre),
  };
  const { result } = await draftChecked(ctx, {
    key: 'owner.brief', schema: briefSchema, facts: data, texts: (r) => [r.headline, r.text, ...r.suggestions.map((entry) => `${entry.title} ${entry.why}`)], free: 3,
    reference: `brief:${ws.id}:${week}:${source}:${mode === 'live' ? now.toISOString().slice(0, 13) : 'scheduled'}`, maxTokens: 1600,
    system: centrePrompt({
      workspace: ws, locale: ctx.locale,
      task: [
        'Write the Monday business brief for the owner of this education centre, for Telegram (plain text, short lines, no Markdown tables).',
        'Cover, from the data only: leads and conversions, payments and debts, attendance, homework, at-risk students (name at most five), teacher workload, and what Schood AI did this week.',
        'Say plainly when a part of the data is missing (not connected, not permitted, or out of date), and give the date of the Academy data when it is not live.',
        'Then give exactly three suggested actions, each tied to a number in the data, that a person can do in Schood AI or Academy this week.',
      ].join(' '),
      blocks: [{ kind: 'week', title: 'This week’s numbers', data }],
    }),
    brief: 'Write the brief.',
  });
  const row = { workspace_id: ws.id, week, status: 'ready' as const, source, snapshot_at: snapshotAt, data: data as Record<string, unknown>, text: `${result.headline}\n\n${result.text}`.slice(0, 8000), suggestions: result.suggestions as unknown[], created_by: actorOf(ctx) };
  const existing = await centre.deps.store.table('briefs').get({ workspace_id: ws.id, week });
  if (existing) return (await centre.deps.store.table('briefs').update({ id: existing.id }, { ...row, deliveries: existing.deliveries }))[0];
  return await centre.deps.store.table('briefs').insert(row);
}

export function briefMessage(centre: Centre, brief: BriefRow): string {
  const suggestions = (brief.suggestions as { title: string; why: string }[]).map((entry, index) => `${index + 1}. ${entry.title} — ${entry.why}`).join('\n');
  return `${centre.access.workspace.name} · ${brief.week}\n\n${brief.text}\n\n${suggestions}\n\n${centre.deps.config.appUrl}/centre/brief`;
}

interface Delivery { user_id: string; status: 'sent' | 'sent_later' | 'deferred' | 'muted' | 'in_app' | 'no_chat' | 'failed'; channel: string | null; at: string; retry_at?: string }
/** The brief's notification kind (Settings → Notifications lets managers mute it). */
export const BRIEF_KIND = 'centre.brief';
registerNotifyKind(BRIEF_KIND, { area: 'centre', label: { en: 'Monday brief of your centre', uz: 'Markazingizning dushanba xulosasi', ru: 'Понедельничная сводка центра' } });
const BRIEF_BUTTON: Record<string, string> = { en: 'Open the brief', uz: 'Xulosani ochish', ru: 'Открыть сводку' };
/** What core's notify.send answered, as a delivery status. Deferred ones are retried by the brief job. */
const SEND_STATUS: Record<Exclude<NotifySendResult, { sent: true }>['reason'], Delivery['status']> = {
  quiet_hours: 'deferred', daily_limit: 'deferred', deferred: 'sent_later', muted: 'muted', delivery_off: 'in_app', no_telegram: 'no_chat', suppressed: 'failed', failed: 'failed',
};

/** Sends the brief to each recipient who has not had it yet, within their notification budget. */
export async function deliverBrief(ctx: RequestContext, centre: Centre, brief: BriefRow): Promise<BriefRow> {
  const ws = centre.access.workspace, settings = briefSettings(centre);
  const recipients = settings.recipients.length ? settings.recipients : [ws.ownerId];
  const previous = new Map((brief.deliveries as Delivery[]).map((entry) => [entry.user_id, entry]));
  const staffChats = new Map((await centre.deps.store.table('staff_chats').list({ workspace_id: ws.id })).map((row) => [row.user_id, row.chat_id]));
  const centreBot = await botToken(centre.deps, ws.id);
  const text = briefMessage(centre, brief), at = ctx.now().toISOString();
  const deliveries: Delivery[] = [];
  for (const userId of recipients) {
    const before = previous.get(userId);
    if (before?.status === 'sent' || before?.status === 'sent_later') { deliveries.push(before); continue; }
    const member = await ctx.repo.membership(ws.id, userId);
    if (!member || member.status !== 'active' || !['owner', 'admin'].includes(member.role)) continue;
    const staffChat = staffChats.get(userId);
    if (!(centreBot && staffChat)) {
      // Core's delivery through the Schood bot, by the person's own notification choices.
      const result = await ctx.notify.send(userId, { kind: BRIEF_KIND, text, buttons: [{ label: BRIEF_BUTTON[ctx.locale] ?? BRIEF_BUTTON.en, path: '/centre/brief' }], dedupeKey: `centre-brief:${brief.id}:${userId}` });
      deliveries.push(result.sent ? { user_id: userId, status: 'sent', channel: 'schood_bot', at } : { user_id: userId, status: SEND_STATUS[result.reason], channel: null, at, ...(result.retryAt ? { retry_at: result.retryAt } : {}) });
      continue;
    }
    // The centre's own bot, for managers who linked it: the same choices and budget apply.
    const decision = await ctx.notify.allowed(userId, BRIEF_KIND);
    if (!decision.allowed && decision.reason === 'muted') { deliveries.push({ user_id: userId, status: 'muted', channel: null, at }); continue; }
    if (!decision.allowed) { deliveries.push({ user_id: userId, status: 'deferred', channel: null, at, retry_at: decision.retryAt }); continue; }
    if (!(await ctx.notify.prefs(userId)).delivery.includes('telegram')) { deliveries.push({ user_id: userId, status: 'in_app', channel: null, at }); continue; }
    const sent = await sendText(centre.deps, centreBot, staffChat, text) !== null;
    if (sent) await ctx.notify.take(userId, BRIEF_KIND);
    deliveries.push({ user_id: userId, status: sent ? 'sent' : 'failed', channel: 'centre_bot', at });
  }
  const delivered = (entry: Delivery) => entry.status === 'sent' || entry.status === 'sent_later';
  const status: BriefRow['status'] = deliveries.length && deliveries.every(delivered) ? 'sent' : deliveries.some(delivered) ? 'partial' : deliveries.some((entry) => entry.status === 'deferred') ? 'ready' : 'failed';
  const [row] = await centre.deps.store.table('briefs').update({ id: brief.id }, { deliveries: deliveries as unknown[], status });
  await ctx.repo.audit({ workspaceId: ws.id, actorId: actorOf(ctx), event: 'centre.brief_delivered', targetType: 'brief', targetId: brief.id, details: { week: brief.week, sent: deliveries.filter((entry) => entry.status === 'sent').length, deferred: deliveries.filter((entry) => entry.status === 'deferred').length } });
  return row;
}

/** Whether the scheduler should build or retry the brief now: Monday from the chosen hour, Tashkent time. */
export function briefDue(centre: Centre, now: Date, existing: BriefRow | null): 'build' | 'retry' | null {
  const settings = briefSettings(centre);
  if (!settings.enabled) return null;
  if (!existing) return tashkentWeekday(now) === 1 && tashkentHour(now) >= settings.hour ? 'build' : null;
  if ((existing.deliveries as Delivery[]).some((entry) => entry.status === 'deferred' && (!entry.retry_at || Date.parse(entry.retry_at.length === 19 ? `${entry.retry_at}+05:00` : entry.retry_at) <= now.getTime()))) return 'retry';
  if (existing.status === 'ready' && !(existing.deliveries as Delivery[]).length) return 'retry';
  return null;
}

const briefJson = (row: BriefRow) => ({ id: row.id, week: row.week, status: row.status, source: row.source, snapshot_at: row.snapshot_at, text: row.text, suggestions: row.suggestions, deliveries: row.deliveries, data: row.data, created_at: row.created_at, updated_at: row.updated_at });

export const brief = {
  async GET(ctx: RequestContext) {
    const centre = await requireCentre(ctx, ['owner', 'admin']);
    const ws = centre.access.workspace;
    const [rows, latest, members] = await Promise.all([
      centre.deps.store.table('briefs').list({ workspace_id: ws.id }, { order: 'created_at', desc: true, limit: 12 }),
      centre.deps.store.table('snapshots').list({ workspace_id: ws.id }, { order: 'captured_at', desc: true, limit: 1 }),
      centre.deps.store.members(ws.id),
    ]);
    const chats = new Set((await centre.deps.store.table('staff_chats').list({ workspace_id: ws.id })).map((row) => row.user_id));
    return {
      settings: briefSettings(centre), week: tashkentWeek(ctx.now()), briefs: rows.map(briefJson), academy_as_of: latest[0]?.captured_at ?? null,
      managers: await Promise.all(members.filter((m) => (m.role === 'owner' || m.role === 'admin') && m.status === 'active').map(async (m) => ({ user_id: m.userId, name: m.name, role: m.role, centre_bot: chats.has(m.userId), schood_bot: !!(await ctx.repo.profile(m.userId))?.telegramChatId }))),
    };
  },
  /** { enabled?, recipients?, hour? } */
  async PATCH(ctx: RequestContext) {
    const centre = await requireCentre(ctx, ['owner', 'admin']);
    const body = record(await ctx.body());
    const current = briefSettings(centre);
    const next = {
      enabled: body.enabled === undefined ? current.enabled : bool(body.enabled, 'enabled'),
      recipients: body.recipients === undefined ? current.recipients : stringList(body.recipients, 'recipients', { max: 5, pattern: /^[0-9a-f-]{36}$/ }),
      hour: body.hour === undefined ? current.hour : integer(body.hour, 'hour', 8, 12),
    };
    if (next.enabled) await ctx.requireFeature('C10');
    for (const id of next.recipients) {
      const member = await ctx.repo.membership(centre.access.workspace.id, id);
      if (!member || !['owner', 'admin'].includes(member.role)) throw new SchoodAIError('invalid_request', 'Briefs go to owners and admins of the centre.', 400, { field: 'recipients' });
    }
    await centre.deps.store.table('settings').update({ workspace_id: centre.access.workspace.id }, { brief: next, updated_by: ctx.user.id });
    await ctx.audit('centre.brief_settings', next, { type: 'workspace', id: centre.access.workspace.id });
    return { settings: next };
  },
  /** { send? }: builds this week's brief now from live Academy data; `send: true` also delivers it. */
  async POST(ctx: RequestContext) {
    const centre = await requireCentre(ctx, ['owner', 'admin']);
    await ctx.requireFeature('C10');
    const body = record(await ctx.body());
    let row = await buildBrief(ctx, centre, 'live');
    if (body.send === true) row = await deliverBrief(ctx, centre, row);
    return { brief: briefJson(row) };
  },
};

