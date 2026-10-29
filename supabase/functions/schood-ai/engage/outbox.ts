import { previousWeekStart } from '../../_shared/english-xp.ts';
import { integer, oneOf, optionalText, record, text, uuid } from '../input.ts';
import type { RequestContext } from '../types.ts';
import { begin, dayEnd, dayStart, type Engage } from './base.ts';
import { journeyByKey } from './content/journeys.ts';
import { IMPORTANT, message, PRIORITY, word, type MessageKind } from './content/messages.ts';
import { goalByKey } from './content/path.ts';
import { pick } from './content/text.ts';
import { activeJourneys } from './journeys.ts';
import { progressState } from './progress.ts';
import { CHECKIN_BEFORE, memoryFacts } from './remember.ts';
import { addDays, inQuietHours, localParts, QUIET_END } from './rules.ts';
import type { OutboxRow } from './types.ts';

// Delivery for the whole engagement layer (E5 streaks, E9 check-ins, E14 win-back,
// league results, squad nudges, certificate results), to Telegram and the web.
//
//   plan     engage/tick (the person's own session, or the bots with the service
//            secret) works out what is worth saying today, at most two messages, and
//            queues them in ai_engage_outbox for the person's chosen hour, with a
//            dedupe key so nothing is ever queued twice.
//   deliver  engage/outbox (service: true) is how a bot drains the queue: each due
//            message is claimed once, then the core budget (ctx.notify.take: two a day
//            per person across all bots, never 22:00–08:00 local) decides. A refusal
//            puts the message back until the budget allows, or drops it when it would
//            be stale. engage/outbox-ack records what the bot actually sent.
//   web      engage/inbox shows the person's web messages in the app (no push, so
//            they do not use the Telegram budget).
//
// Who is due is answered by public.ai_engage_due_users (the bots' cron), documented
// in docs/product/ai-requests/engage.md.

export const MAX_PER_DAY = 2;
const LAPSE_STAGES: { days: number; kind: MessageKind }[] = [{ days: 2, kind: 'winback_2' }, { days: 7, kind: 'winback_7' }, { days: 21, kind: 'winback_21' }];
const REHEARSAL: Record<string, string> = { interview: '/speak', exam: '/coach/b1', presentation: '/coach/b6', deadline: '/write', other: '/progress/coach' };

interface Candidate { kind: MessageKind; dedupe: string; params: Record<string, string | number>; data?: Record<string, unknown> }

/** What is worth saying to this person today, highest priority first. Pure over the facts it reads. */
export async function planMessages(e: Engage): Promise<{ queued: number; candidates: MessageKind[] }> {
  if (e.profile.messages === 'none') return { queued: 0, candidates: [] };
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

  const allowed = candidates.filter((candidate) => e.profile.messages === 'all' || IMPORTANT.includes(candidate.kind))
    .sort((a, b) => PRIORITY[b.kind] - PRIORITY[a.kind]).slice(0, MAX_PER_DAY);
  const chat = e.ctx.user.telegramChatId ?? (await e.ctx.repo.profile(e.userId))?.telegramChatId ?? null;
  const channel: OutboxRow['channel'] = chat ? 'telegram' : 'web';
  const due = dueAtChosenHour(e);
  const queued = await e.b.repo.enqueue(allowed.map((candidate) => ({
    userId: e.userId, channel, kind: candidate.kind, priority: PRIORITY[candidate.kind], dedupeKey: candidate.dedupe,
    payload: { ...message(candidate.kind, locale, candidate.params), data: candidate.data ?? {} },
    dueAt: due.toISOString(), expiresAt: dayEnd(e.today, e.profile.timeZone).toISOString(),
  })));
  if (allowed.some((candidate) => candidate.kind.startsWith('winback_'))) {
    const stage = allowed.find((candidate) => candidate.kind.startsWith('winback_'))!.data!.stage as number;
    await e.b.repo.saveProfile(e.userId, { lapseStage: stage });
  }
  return { queued, candidates: allowed.map((candidate) => candidate.kind) };
}

/** Today at the person's chosen hour (or now if that has passed), never inside quiet hours. */
function dueAtChosenHour(e: Engage): Date {
  const chosen = new Date(dayStart(e.today, e.profile.timeZone).getTime() + e.profile.notifyHour * 3_600_000);
  if (chosen.getTime() > e.now.getTime()) return chosen;
  const hour = localParts(e.now, e.profile.timeZone).hour;
  return inQuietHours(hour) ? new Date(dayStart(addDays(e.today, hour >= QUIET_END ? 1 : 0), e.profile.timeZone).getTime() + QUIET_END * 3_600_000) : e.now;
}

export const rowView = (row: OutboxRow) => ({ id: row.id, kind: row.kind, text: row.payload.text, buttons: row.payload.buttons, data: row.payload.data ?? {}, created_at: row.createdAt, claim: row.claimToken });

// --- Routes ----------------------------------------------------------------------------------------
/** Plans today's messages for the caller. The bots call it with the service secret for each due person. */
export async function tick(ctx: RequestContext) {
  const e = await begin(ctx, { locale: false });
  return await planMessages(e);
}

/** A bot drains the caller's due messages: each is claimed once and passes the core budget, or waits. */
export async function claimOutbox(ctx: RequestContext) {
  const e = await begin(ctx, { locale: false });
  const body = record(await ctx.body());
  const channel = oneOf(body.channel ?? 'telegram', 'channel', ['telegram'] as const);
  const bot = body.bot === undefined ? 'student' : text(body.bot, 'bot', { max: 20 });
  if (!/^[a-z][a-z0-9_]{1,19}$/.test(bot)) return { messages: [] };
  const limit = body.limit === undefined ? MAX_PER_DAY : integer(body.limit, 'limit', 1, MAX_PER_DAY);
  return { messages: (await drainFor(e, channel, bot, limit)).map(rowView) };
}

/**
 * Claims a person's due messages for one bot. Each is claimed once; then engage's quiet
 * hours in their zone and the core budget across every bot decide: send now, try again
 * at the next allowed moment, or drop it when that would be too late.
 */
export async function drainFor(e: Engage, channel: 'telegram', bot: string, limit: number): Promise<OutboxRow[]> {
  const claimed = await e.b.repo.claim(e.userId, channel, e.now, limit);
  const out: OutboxRow[] = [];
  const local = localParts(e.now, e.profile.timeZone);
  for (const row of claimed) {
    // Engage's own quiet hours in the person's chosen zone, then the core budget across every bot.
    if (inQuietHours(local.hour)) {
      const morning = new Date(dayStart(addDays(local.day, local.hour >= QUIET_END ? 1 : 0), e.profile.timeZone).getTime() + QUIET_END * 3_600_000);
      if (morning.getTime() < Date.parse(row.expiresAt)) await e.b.repo.release(row.id, row.claimToken!, morning.toISOString(), 'quiet_hours');
      else await e.b.repo.finish(row.id, row.claimToken!, 'skipped', e.now.toISOString(), 'quiet_hours');
      continue;
    }
    const decision = await e.ctx.notify.take(e.userId, `engage.${bot}`);
    if (decision.allowed) { out.push(row); continue; }
    // The budget says when to try again; never earlier than the next local morning for a used-up day.
    const nextMorning = dayStart(addDays(local.day, 1), e.profile.timeZone).getTime() + QUIET_END * 3_600_000;
    const stated = Date.parse(decision.retryAt);
    const retry = decision.reason === 'daily_limit' ? Math.max(nextMorning, Number.isFinite(stated) ? stated : 0) : Number.isFinite(stated) && stated > e.now.getTime() ? stated : nextMorning;
    if (retry < Date.parse(row.expiresAt)) await e.b.repo.release(row.id, row.claimToken!, new Date(retry).toISOString(), decision.reason);
    else await e.b.repo.finish(row.id, row.claimToken!, 'skipped', e.now.toISOString(), decision.reason);
  }
  return out;
}

export async function ackOutbox(ctx: RequestContext) {
  const e = await begin(ctx, { locale: false });
  const body = record(await ctx.body());
  const id = uuid(body.id, 'id'), claim = uuid(body.claim, 'claim');
  const status = oneOf(body.status, 'status', ['sent', 'failed'] as const);
  const reason = optionalText(body.reason, 'reason', { max: 80 });
  const own = (await e.b.repo.outbox(e.userId, { statuses: ['claimed'], limit: 20 })).some((row) => row.id === id);
  if (!own) return { ok: false };
  return { ok: await e.b.repo.finish(id, claim, status, e.now.toISOString(), reason) };
}

/** Web messages for the signed-in person: shown once as new, then kept for a week. */
export async function inbox(ctx: RequestContext) {
  const e = await begin(ctx);
  const fresh = await e.b.repo.claim(e.userId, 'web', e.now, 5);
  for (const row of fresh) await e.b.repo.finish(row.id, row.claimToken!, 'sent', e.now.toISOString());
  const earlier = (await e.b.repo.outbox(e.userId, { channel: 'web', statuses: ['sent'], since: new Date(e.now.getTime() - 7 * 86_400_000).toISOString(), limit: 20 })).filter((row) => !fresh.some((entry) => entry.id === row.id));
  return { new: fresh.map(rowView), earlier: earlier.map(rowView) };
}

export const journeyTitle = (key: string, locale: Engage['locale']) => { const journey = journeyByKey(key); return journey ? pick(journey.title, locale) : key; };
