import { featureAccess } from '../../../../packages/ai-core/src/mod.ts';
import { switchesOf } from '../ai.ts';
import { registerNotifyKind, registerSystemJob } from '../registries.ts';
import { SchoodAIError, type RequestContext } from '../types.ts';
import { briefPlainText, COPY, makeDailyBrief, nextOccurrence } from './brief.ts';
import { consentState, store, today, type Actor } from './common.ts';
import { parentBriefPlain, parentBriefsFor } from './family.ts';
import type { BriefSchedule } from './store.ts';

// L14 daily briefs and P1 weekly parent briefs, sent by core's scheduler (pg_cron
// ticks core/system-tick every five minutes) through ctx.notify.send, which keeps
// each person's budget, quiet hours, mutes and delivery choice. A person's own
// brief is paid from their personal workspace (ctx.paidBy); a centre parent's brief
// from the centre. Each run is bounded and idempotent: the brief and its charge are
// once per day (week), and the message has a dedupe key.

export const DAILY_KIND = 'learner.daily_brief', PARENT_KIND = 'learner.parent_brief';
const BATCH = 25;

export function registerBriefJobs(): void {
  registerNotifyKind(DAILY_KIND, { area: 'learner', label: { en: 'Daily brief', uz: 'Kunlik mashq', ru: 'Ежедневная разминка' } });
  registerNotifyKind(PARENT_KIND, { area: 'learner', label: { en: 'Weekly brief about your child', uz: 'Farzandingiz haqida haftalik xulosa', ru: 'Недельная сводка о ребёнке' } });
  registerSystemJob('learner.briefs', { area: 'learner', schedule: { everyMinutes: 15 }, timeoutMs: 110_000, run: sendDueBriefs });
}

const localTime = (iso: string, zone: string) => new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));

/**
 * The next send time. 'next': the person's next scheduled time. A retry stays on the
 * same local day and before quiet hours; otherwise it waits for the next scheduled
 * time, so a brief never arrives earlier than the time the person chose.
 */
export function nextSend(schedule: BriefSchedule, now: Date, retryAt?: string | null): string {
  const next = nextOccurrence(now, schedule.sendTime, schedule.timeZone, schedule.weekday);
  if (retryAt === undefined) return next;
  const at = retryAt && Date.parse(retryAt) > now.getTime() ? retryAt : new Date(now.getTime() + 3_600_000).toISOString();
  const sameDay = today(new Date(at), schedule.timeZone) === today(now, schedule.timeZone) && localTime(at, schedule.timeZone) < '22:00';
  return sameDay ? at : next;
}

async function reschedule(ctx: RequestContext, schedule: BriefSchedule, patch: { nextDueAt: string; lastSentAt?: string }) {
  await store(ctx).saveSchedule({ ...schedule, nextDueAt: patch.nextDueAt, lastSentAt: patch.lastSentAt ?? schedule.lastSentAt });
}

/** The person's own workspace, as an actor that pays from it. */
async function personalActor(ctx: RequestContext, userId: string, locale: BriefSchedule['locale']): Promise<Actor> {
  const profile = await ctx.repo.profile(userId);
  const workspace = await ctx.repo.ensurePersonalWorkspace(userId, profile?.name || 'My workspace');
  const member = (await ctx.repo.membership(workspace.id, userId))!;
  return { userId, locale, access: { workspace, member, role: 'owner' }, ai: await ctx.paidBy(workspace.id) };
}

export async function deliverDailyBrief(ctx: RequestContext, schedule: BriefSchedule): Promise<string> {
  const now = ctx.now(), userId = schedule.userId;
  const profile = await ctx.repo.profile(userId);
  if (!profile?.isActive) { await reschedule(ctx, schedule, { nextDueAt: nextSend(schedule, now) }); return 'inactive'; }
  if (consentState(await store(ctx).consent(userId)) !== 'ok') { await reschedule(ctx, schedule, { nextDueAt: nextSend(schedule, now) }); return 'consent'; }
  const actor = await personalActor(ctx, userId, schedule.locale);
  const plan = await ctx.planFor(actor.access.workspace.id);
  if (!featureAccess('L14', { plans: plan.plans, workspaceKind: 'personal', role: 'owner', beta: plan.beta, grants: plan.features }).allowed) {
    await reschedule(ctx, schedule, { nextDueAt: nextSend(schedule, now) });
    return 'plan';
  }
  const day = today(now, schedule.timeZone);
  const existing = await store(ctx).recordOfDay(userId, 'brief', day);
  // Already in Telegram (/brief now) or already answered on the web: nothing to push today.
  const answered = Object.keys((existing?.state.answers ?? {}) as Record<string, unknown>).length;
  if (existing && (existing.state.sent_at || answered >= 3)) { await reschedule(ctx, schedule, { nextDueAt: nextSend(schedule, now) }); return 'sent_before'; }
  // Check the budget before paying for a brief that could not be sent now.
  const allowed = await ctx.notify.allowed(userId, DAILY_KIND);
  if (!allowed.allowed) {
    await reschedule(ctx, schedule, { nextDueAt: allowed.reason === 'muted' ? nextSend(schedule, now) : nextSend(schedule, now, allowed.retryAt) });
    return allowed.reason;
  }
  const { record } = await makeDailyBrief(ctx, actor, schedule.timeZone);
  const result = await ctx.notify.send(userId, {
    kind: DAILY_KIND, text: briefPlainText(record, schedule.locale), buttons: [{ label: COPY[schedule.locale].answer, path: '/brief' }], dedupeKey: `${DAILY_KIND}:${userId}:${day}`,
  });
  if (result.sent) {
    await store(ctx).updateRecord(record.id, record.version, { state: { ...record.state, sent_at: now.toISOString() } });
    await reschedule(ctx, schedule, { nextDueAt: nextSend(schedule, now), lastSentAt: now.toISOString() });
    return 'sent';
  }
  const retry = result.reason === 'quiet_hours' || result.reason === 'daily_limit' || result.reason === 'deferred' || result.reason === 'failed';
  await reschedule(ctx, schedule, { nextDueAt: retry ? nextSend(schedule, now, result.retryAt ?? null) : nextSend(schedule, now) });
  return result.reason;
}

export async function deliverParentBrief(ctx: RequestContext, schedule: BriefSchedule): Promise<string> {
  const now = ctx.now(), parentId = schedule.userId;
  const allowed = await ctx.notify.allowed(parentId, PARENT_KIND);
  if (!allowed.allowed) {
    await reschedule(ctx, schedule, { nextDueAt: allowed.reason === 'muted' ? nextSend(schedule, now) : nextSend(schedule, now, allowed.retryAt) });
    return allowed.reason;
  }
  const links = await store(ctx).familyLinks({ parentId, statuses: ['active'] });
  const entries: { name: string; brief: Record<string, unknown> }[] = [];
  for (const workspaceId of [...new Set(links.map((link) => link.workspaceId))]) {
    const workspace = await ctx.repo.workspace(workspaceId), member = await ctx.repo.membership(workspaceId, parentId);
    if (!workspace || workspace.status !== 'active' || !member || member.status !== 'active') continue;
    const plan = await ctx.planFor(workspaceId);
    if (!featureAccess('P1', { plans: plan.plans, workspaceKind: workspace.kind, role: member.role, beta: plan.beta, grants: plan.features }).allowed) continue;
    const access = { workspace, member, role: member.role };
    if (workspace.kind === 'centre') {
      const switches = switchesOf(access) ?? {};
      if (switches.parent !== true && switches['parent.brief'] !== true) continue;
    }
    const actor: Actor = { userId: parentId, locale: schedule.locale, access, ai: await ctx.paidBy(workspaceId) };
    entries.push(...(await parentBriefsFor(ctx, actor)).map((entry) => ({ name: entry.name, brief: entry.brief })));
  }
  if (!entries.length) { await reschedule(ctx, schedule, { nextDueAt: nextSend(schedule, now) }); return 'nothing'; }
  const result = await ctx.notify.send(parentId, {
    kind: PARENT_KIND, text: parentBriefPlain(entries, schedule.locale), buttons: [{ label: COPY[schedule.locale].open, path: '/family' }], dedupeKey: `${PARENT_KIND}:${parentId}:${today(now, schedule.timeZone)}`,
  });
  const retry = !result.sent && (result.reason === 'quiet_hours' || result.reason === 'daily_limit' || result.reason === 'deferred' || result.reason === 'failed');
  await reschedule(ctx, schedule, { nextDueAt: retry ? nextSend(schedule, now, result.sent ? null : result.retryAt ?? null) : nextSend(schedule, now), ...(result.sent ? { lastSentAt: now.toISOString() } : {}) });
  return result.sent ? 'sent' : result.reason;
}

/** The scheduled job: a bounded batch of due schedules; one person's failure never stops the rest. */
export async function sendDueBriefs(ctx: RequestContext): Promise<{ due: number; results: string[] }> {
  const due = await store(ctx).dueSchedules(ctx.now().toISOString(), BATCH);
  const results: string[] = [];
  for (const schedule of due) {
    try {
      results.push(schedule.kind === 'daily' ? await deliverDailyBrief(ctx, schedule) : await deliverParentBrief(ctx, schedule));
    } catch (cause) {
      // A refusal (no credits, switched off, capped) waits for the next scheduled time; anything else retries within the day.
      const code = cause instanceof SchoodAIError ? cause.code : 'error';
      console.error(JSON.stringify({ event: 'schood_ai_learner_brief_failed', kind: schedule.kind, code }));
      await reschedule(ctx, schedule, { nextDueAt: cause instanceof SchoodAIError ? nextSend(schedule, ctx.now()) : nextSend(schedule, ctx.now(), null) }).catch(() => undefined);
      results.push(code);
    }
  }
  return { due: due.length, results };
}
