import { previousWeekStart } from '../../_shared/english-xp.ts';
import type { NotifyPrefs, RequestContext } from '../types.ts';
import { begin, dayEnd, dayStart, type Engage } from './base.ts';
import { journeyByKey } from './content/journeys.ts';
import { message, NOTIFY_KIND, PRIORITY, word, type MessageKind } from './content/messages.ts';
import { goalByKey } from './content/path.ts';
import { pick } from './content/text.ts';
import { activeJourneys } from './journeys.ts';
import { progressState } from './progress.ts';
import { CHECKIN_BEFORE, memoryFacts } from './remember.ts';
import { localParts } from './rules.ts';
import type { EngageRepository } from './store.ts';
import type { OutboxRow } from './types.ts';

// Delivery for the whole engagement layer (E5 streaks, E9 check-ins, E14 win-back,
// league results, squad nudges, certificate results), to Telegram and the web.
//
//   plan     the engage.plan system job (every 15 minutes) works out, for each person
//            whose preferred hour has come today (core's notification preferences;
//            ai_engage_due_users), what is worth saying: at most two messages, never a
//            kind they muted. They are queued in ai_engage_outbox with a dedupe key, so
//            nothing is queued twice. Squad nudges and certificate results queue too.
//   deliver  the engage.deliver job (every 5 minutes) claims due Telegram messages across
//            everyone and sends each with ctx.notify.send, which applies the person's
//            delivery choice, mutes, quiet hours and daily limit. "Later" puts a message
//            back until then (or drops it when it would be stale); "no Telegram" moves it
//            to the in-app inbox when they get messages there.
//   web      engage/inbox shows web messages in the app; they use no push budget.

export const MAX_PER_DAY = 2;
const LAPSE_STAGES: { days: number; kind: MessageKind }[] = [{ days: 2, kind: 'winback_2' }, { days: 7, kind: 'winback_7' }, { days: 21, kind: 'winback_21' }];
const REHEARSAL: Record<string, string> = { interview: '/speak', exam: '/coach/b1', presentation: '/coach/b6', deadline: '/write', other: '/progress/coach' };
const WINBACK: readonly MessageKind[] = ['winback_2', 'winback_7', 'winback_21'];

interface Candidate { kind: MessageKind; dedupe: string; params: Record<string, string | number>; data?: Record<string, unknown> }

/** True when the person muted this kind of message, or everything from engage (core's notification settings). */
export const isMuted = (prefs: NotifyPrefs, kind: MessageKind) => prefs.muted.includes('engage') || prefs.muted.includes(NOTIFY_KIND[kind]);

/** Where a person gets engage messages: Telegram when they chose it and linked a chat, else the in-app inbox when they chose that. */
export async function channelFor(ctx: Pick<RequestContext, 'repo'>, userId: string, prefs: NotifyPrefs): Promise<OutboxRow['channel'] | null> {
  if (prefs.dailyLimit === 0 || prefs.muted.includes('engage')) return null;
  if (prefs.delivery.includes('telegram') && (await ctx.repo.profile(userId))?.telegramChatId) return 'telegram';
  return prefs.delivery.includes('web') ? 'web' : null;
}

/** Queues one message from an action (a squad nudge, a certificate result) for whoever it is for. */
export async function queueFor(ctx: Pick<RequestContext, 'repo' | 'notify'>, repo: EngageRepository, input: { userId: string; kind: MessageKind; dedupe: string; payload: OutboxRow['payload']; dueAt: string; expiresAt: string }): Promise<{ queued: boolean; reason: string | null }> {
  const prefs = await ctx.notify.prefs(input.userId);
  if (isMuted(prefs, input.kind)) return { queued: false, reason: 'muted' };
  const channel = await channelFor(ctx, input.userId, prefs);
  if (!channel) return { queued: false, reason: 'messages_off' };
  const queued = await repo.enqueue([{ userId: input.userId, channel, kind: input.kind, priority: PRIORITY[input.kind], dedupeKey: input.dedupe, payload: input.payload, dueAt: input.dueAt, expiresAt: input.expiresAt }]);
  return { queued: queued > 0, reason: queued > 0 ? null : 'already_queued' };
}

/** What is worth saying to this person today, highest priority first. Pure over the facts it reads. */
export async function planMessages(e: Engage): Promise<{ queued: number; candidates: MessageKind[] }> {
  const target = await channelFor(e.ctx, e.userId, e.prefs);
  if (!target) return { queued: 0, candidates: [] };
  const { core, view } = await progressState(e);
  const [journeys, facts] = await Promise.all([activeJourneys(e), memoryFacts(e)]);
  const candidates: Candidate[] = [];
  const locale = e.profile.locale;

  for (const date of facts.dates) {
    const kindWord = word(date.kind, locale);
    if ((CHECKIN_BEFORE as readonly number[]).includes(date.days_left)) {
      const when = date.days_left === 0 ? word('today', locale) : date.days_left === 1 ? word('tomorrow', locale) : word('in_days', locale, { days: date.days_left });
      const link = date.goal ? goalByKey(date.goal)?.start ?? REHEARSAL[date.kind] : REHEARSAL[date.kind];
      candidates.push({ kind: 'checkin_soon', dedupe: `checkin:${date.id}:${date.days_left}`, params: { kind: kindWord, title: date.title, when, minutes: date.kind === 'exam' ? 20 : 10, link }, data: { date: date.id } });
    } else if (date.days_left === -1) {
      candidates.push({ kind: 'checkin_after', dedupe: `checkin_after:${date.id}`, params: { title: date.title }, data: { date: date.id } });
    }
  }
  const streak = core.streak;
  const limitHit = view.wellbeing.limit_reached;
  if (streak.atRisk && streak.current >= 2 && !limitHit) {
    candidates.push({ kind: 'streak_risk', dedupe: `streak:${e.userId}:${e.today}`, params: { streak: streak.current, freeze_line: streak.freezes > 0 ? word('freeze_held', locale, { count: streak.freezes }) : '' } });
  }
  if (streak.comeback?.status === 'open') {
    candidates.push({ kind: 'comeback_open', dedupe: `comeback:${e.userId}:${streak.comeback.starts}`, params: { old: streak.comeback.oldStreak, left: Math.max(1, streak.comeback.needed - streak.comeback.done), date: streak.comeback.ends } });
  }
  for (const journey of journeys.filter((entry) => entry.atRisk && !limitHit)) {
    candidates.push({ kind: 'journey_risk', dedupe: `journey:${journey.row.id}:${journey.chapter}:${e.today}`, params: { journey: pick(journey.journey.title, locale), journey_key: journey.journey.key, chapter: journey.chapter, left: Math.max(0, journey.total - journey.done), done: journey.done, total: journey.total } });
  }
  // Win-back: three messages per lapse at most (day 2, day 7, day 21), each with the person's real record.
  if (streak.idleDays !== null && streak.idleDays === 0 && e.profile.lapseStage !== 0) await e.b.repo.saveProfile(e.userId, { lapseStage: 0 });
  if (streak.idleDays !== null && streak.idleDays >= 2) {
    const stage = LAPSE_STAGES.findLastIndex((entry) => streak.idleDays! >= entry.days) + 1;
    if (stage > e.profile.lapseStage) {
      const active = journeys.find((entry) => !entry.graduated);
      const journeyLine = active ? word('progress_journey', locale, { chapter: active.chapter, journey: pick(active.journey.title, locale) }) : '';
      const progressLine = word('progress', locale, { xp: core.totalXp, longest: streak.longest, journey: journeyLine });
      const activeDays = core.days.filter((day) => day.events > 0).length;
      candidates.push({ kind: LAPSE_STAGES[stage - 1].kind, dedupe: `winback:${e.userId}:${streak.lastActiveDay}:${stage}`, params: { xp: core.totalXp, days: activeDays, minutes: 6, progress_line: progressLine }, data: { stage } });
    }
  }
  // Only last week's result, on Monday or Tuesday; an older league is never announced again.
  if (view.league.last_week && view.league.last_week.weekStart === previousWeekStart(e.week) && localParts(e.now, 'Asia/Tashkent').weekday <= 1) {
    const last = view.league.last_week;
    candidates.push({ kind: 'league_result', dedupe: `league:${e.userId}:${e.week}`, params: { rank: last.rank ?? '-', tier: word(last.tier, locale), xp: last.xp, outcome: word(last.outcome ?? 'stayed', locale) } });
  }
  if (journeys.some((entry) => entry.journey.key === 'ielts_55_70' && !entry.graduated) && localParts(e.now, 'Asia/Tashkent').weekday === 5) {
    candidates.push({ kind: 'event_mock', dedupe: `mock:${e.userId}:${e.week}`, params: {} });
  }

  // Never a kind they muted; win-back only where it can reach them (not the in-app inbox they are not opening).
  const allowed = candidates.filter((candidate) => !isMuted(e.prefs, candidate.kind) && (target === 'telegram' || !WINBACK.includes(candidate.kind)))
    .sort((a, b) => PRIORITY[b.kind] - PRIORITY[a.kind]).slice(0, target === 'telegram' ? Math.min(MAX_PER_DAY, e.prefs.dailyLimit) : MAX_PER_DAY);
  const due = dueAtChosenHour(e);
  const queued = await e.b.repo.enqueue(allowed.map((candidate) => ({
    userId: e.userId, channel: target, kind: candidate.kind, priority: PRIORITY[candidate.kind], dedupeKey: candidate.dedupe,
    payload: { ...message(candidate.kind, locale, candidate.params), data: candidate.data ?? {} },
    dueAt: due.toISOString(), expiresAt: dayEnd(e.today, e.profile.timeZone).toISOString(),
  })));
  if (allowed.some((candidate) => WINBACK.includes(candidate.kind))) {
    const stage = allowed.find((candidate) => WINBACK.includes(candidate.kind))!.data!.stage as number;
    await e.b.repo.saveProfile(e.userId, { lapseStage: stage });
  }
  return { queued, candidates: allowed.map((candidate) => candidate.kind) };
}

/** Today at the person's preferred hour, or now if that has passed (core's quiet hours apply when it is sent). */
function dueAtChosenHour(e: Engage): Date {
  const chosen = new Date(dayStart(e.today, e.profile.timeZone).getTime() + e.profile.notifyHour * 3_600_000);
  return chosen.getTime() > e.now.getTime() ? chosen : e.now;
}

/**
 * The engage.deliver job: claims due Telegram messages across everyone and sends each
 * through ctx.notify.send (the Schood bot, inside the person's own choices and budget).
 */
export async function deliverDue(ctx: RequestContext, repo: EngageRepository, limit = 100) {
  const now = ctx.now(), at = now.toISOString();
  const counts = { claimed: 0, sent: 0, later: 0, skipped: 0, moved_to_inbox: 0, failed: 0 };
  for (const row of await repo.claimDue(now, limit)) {
    counts.claimed++;
    const kind = row.kind as MessageKind;
    try {
      const result = await ctx.notify.send(row.userId, { kind: NOTIFY_KIND[kind] ?? 'engage.progress', text: row.payload.text, buttons: row.payload.buttons.slice(0, 4), dedupeKey: `engage:${row.dedupeKey}` });
      if (result.sent) { await repo.finish(row.id, row.claimToken!, 'sent', at); counts.sent++; continue; }
      const retry = result.retryAt ? Date.parse(result.retryAt) : NaN;
      switch (result.reason) {
        case 'deferred':
          // The Schood bot queued it for the person's own delivery time.
          await repo.finish(row.id, row.claimToken!, 'sent', at, 'deferred');
          counts.sent++;
          break;
        case 'quiet_hours':
        case 'daily_limit':
          if (Number.isFinite(retry) && retry > now.getTime() && retry < Date.parse(row.expiresAt)) { await repo.release(row.id, row.claimToken!, new Date(retry).toISOString(), result.reason); counts.later++; }
          else { await repo.finish(row.id, row.claimToken!, 'skipped', at, result.reason); counts.skipped++; }
          break;
        case 'delivery_off':
        case 'no_telegram': {
          await repo.finish(row.id, row.claimToken!, 'skipped', at, result.reason);
          const prefs = await ctx.notify.prefs(row.userId);
          if (prefs.delivery.includes('web') && !isMuted(prefs, kind) && !WINBACK.includes(kind)) {
            counts.moved_to_inbox += await repo.enqueue([{ userId: row.userId, channel: 'web', kind: row.kind, priority: row.priority, dedupeKey: `${row.dedupeKey}:web`.slice(0, 200), payload: row.payload, dueAt: at, expiresAt: row.expiresAt }]);
          } else counts.skipped++;
          break;
        }
        case 'failed':
          if (row.attempts < 3) { await repo.release(row.id, row.claimToken!, new Date(now.getTime() + 15 * 60_000).toISOString(), 'failed'); counts.later++; }
          else { await repo.finish(row.id, row.claimToken!, 'failed', at, 'failed'); counts.failed++; }
          break;
        default:
          // muted or suppressed: the person said no; drop it.
          await repo.finish(row.id, row.claimToken!, 'skipped', at, result.reason);
          counts.skipped++;
      }
    } catch (cause) {
      // One message's failure never stops the others; it is tried again on the next run.
      counts.failed++;
      console.error(JSON.stringify({ event: 'engage_deliver_failed', request_id: ctx.requestId, error: String(cause).slice(0, 200) }));
      await repo.release(row.id, row.claimToken!, new Date(now.getTime() + 15 * 60_000).toISOString(), 'error').catch(() => {});
    }
  }
  return counts;
}

export const rowView = (row: OutboxRow) => ({ id: row.id, kind: row.kind, text: row.payload.text, buttons: row.payload.buttons, data: row.payload.data ?? {}, created_at: row.createdAt });

/** Web messages for the signed-in person: shown once as new, then kept for a week. */
export async function inbox(ctx: RequestContext) {
  const e = await begin(ctx);
  const fresh = await e.b.repo.claim(e.userId, 'web', e.now, 5);
  for (const row of fresh) await e.b.repo.finish(row.id, row.claimToken!, 'sent', e.now.toISOString());
  const earlier = (await e.b.repo.outbox(e.userId, { channel: 'web', statuses: ['sent'], since: new Date(e.now.getTime() - 7 * 86_400_000).toISOString(), limit: 20 })).filter((row) => !fresh.some((entry) => entry.id === row.id));
  return { new: fresh.map(rowView), earlier: earlier.map(rowView) };
}

export const journeyTitle = (key: string, locale: Engage['locale']) => { const journey = journeyByKey(key); return journey ? pick(journey.title, locale) : key; };
