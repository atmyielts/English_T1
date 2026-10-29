import {
  escapeHtml, fill, levelLabel, overallScale, pick, plain, type CoachPack, type Delivery, type Locale, type OutButton, type ReportRow,
} from '../../../../packages/coach-packs/src/mod.ts';
import type { NotifyDecision } from '../types.ts';
import type { CoachConfig } from './runtime.ts';
import type { Claimed, CoachStore, Enrollment } from './store.ts';
import { addDays, DEFAULT_TZ, localParts, nextDaily, nextWeekly, weekStart } from './time.ts';
import { goalOf, todayPlan, weekView } from './views.ts';

// The cron's work (called by schood-coach-gate for the worker): claim due daily
// reminders and weekly reports, take the shared notification budget (2 a day per
// person across every Schood bot, never in quiet hours), render the message in
// the learner's language, and move each schedule to its next time. No AI.

export interface DeliveryDeps {
  store: CoachStore;
  packs: ReadonlyMap<string, CoachPack>;
  config: CoachConfig;
  /** The shared budget (ai_notify): `take` counts the message. */
  notify(userId: string, channel: string, take: boolean): Promise<NotifyDecision>;
  nameOf(userId: string): Promise<string | null>;
  now(): Date;
}

const hash = (text: string) => { let h = 2166136261; for (const char of text) { h ^= char.codePointAt(0)!; h = Math.imul(h, 16777619); } return h >>> 0; };
const variant = <T>(list: T[], seed: string): T => list[hash(seed) % list.length];

function nextFor(claim: Claimed, now: Date): Date {
  const tz = claim.timeZone || DEFAULT_TZ;
  return claim.kind === 'weekly' ? nextWeekly(now, claim.weekday ?? 0, claim.localTime, tz) : nextDaily(now, claim.localTime, tz);
}

export async function dueDeliveries(deps: DeliveryDeps, limit = 40): Promise<Delivery[]> {
  const now = deps.now();
  const claimed = await deps.store.claimDue(now.toISOString(), limit, 120);
  const out: Delivery[] = [];
  for (const claim of claimed) {
    try {
      const delivery = await deliver(deps, claim, now);
      if (delivery) out.push(delivery);
    } catch (cause) {
      console.error(JSON.stringify({ event: 'schood_coach_delivery_failed', pack: claim.pack, error: String(cause).slice(0, 200) }));
      await deps.store.advanceSchedule(claim.id, { nextAt: nextFor(claim, now).toISOString() });
    }
  }
  return out;
}

async function deliver(deps: DeliveryDeps, claim: Claimed, now: Date): Promise<Delivery | null> {
  const pack = deps.packs.get(claim.pack);
  const enrollment = pack ? await deps.store.enrollment(claim.userId, claim.pack) : null;
  const tz = claim.timeZone || DEFAULT_TZ, local = localParts(now, tz);
  const slot = claim.kind === 'weekly' ? `w${weekStart(local.day)}` : local.day;
  const next = nextFor(claim, now);
  if (!pack || !enrollment || enrollment.status !== 'active') { await deps.store.advanceSchedule(claim.id, { nextAt: next.toISOString() }); return null; }
  if (claim.lastSlot === slot) { await deps.store.advanceSchedule(claim.id, { nextAt: next.toISOString() }); return null; }
  // A daily reminder is skipped on a day the learner already practised.
  if (claim.kind === 'daily' && enrollment.lastActiveDay === local.day) {
    await deps.store.logDelivery({ scheduleId: claim.id, userId: claim.userId, pack: claim.pack, kind: 'daily', slot, status: 'skipped', reason: 'already_practised' });
    await deps.store.advanceSchedule(claim.id, { nextAt: next.toISOString(), lastSlot: slot });
    return null;
  }
  const decision = await deps.notify(claim.userId, `coach.${claim.pack}`, true);
  if (!decision.allowed) {
    await deps.store.logDelivery({ scheduleId: claim.id, userId: claim.userId, pack: claim.pack, kind: claim.kind, slot, status: 'skipped', reason: decision.reason });
    // Quiet hours: try again when they end, if that is still the same slot; else the next one.
    const retry = new Date(decision.retryAt);
    const sameSlot = claim.kind === 'weekly' ? weekStart(localParts(retry, tz).day) === weekStart(local.day) : localParts(retry, tz).day === local.day;
    await deps.store.advanceSchedule(claim.id, { nextAt: (decision.reason === 'quiet_hours' && sameSlot ? retry : next).toISOString() });
    return null;
  }
  const messages = claim.kind === 'weekly' ? await weeklyMessage(deps, pack, enrollment, now) : await dailyMessage(deps, pack, enrollment, now);
  const id = await deps.store.logDelivery({ scheduleId: claim.id, userId: claim.userId, pack: claim.pack, kind: claim.kind, slot, status: 'rendered' });
  await deps.store.advanceSchedule(claim.id, { nextAt: next.toISOString(), lastSlot: slot, sent: true });
  return { id: String(id), pack: claim.pack, chatId: claim.chatId, messages };
}

function placeholders(pack: CoachPack, enrollment: Enrollment, extra: Record<string, string | number>, name: string | null, locale: Locale) {
  const goal = goalOf(pack, enrollment);
  return { name: name ?? '', coach: pick(pack.manifest.name, locale), streak: enrollment.streakCurrent, target: levelLabel(pack.manifest.scale, goal.target), level: enrollment.placement ? levelLabel(pack.manifest.scale, enrollment.placement.overall) : '—', minutes: goal.dailyMinutes, days: 0, task: '', delta: '', ...extra };
}

async function dailyMessage(deps: DeliveryDeps, pack: CoachPack, enrollment: Enrollment, now: Date) {
  const locale = enrollment.locale, tz = enrollment.settings.timeZone ?? DEFAULT_TZ, today = localParts(now, tz).day;
  const plan = await todayPlan({ store: deps.store, pack, enrollment, now });
  const first = plan.tasks[0];
  const task = first ? (first.slot === 'mock' && pack.plan.weeklyMock ? pick(pack.plan.weeklyMock.title, locale) : pick(pack.byId.get(first.activityId)?.title, locale)) : pick(pack.manifest.menu[0]?.label, locale);
  const goal = goalOf(pack, enrollment);
  const days = goal.examDate ? Math.max(0, Math.round((Date.parse(`${goal.examDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000)) : null;
  const missed = enrollment.lastActiveDay !== null && enrollment.lastActiveDay < addDays(today, -1);
  const list = days !== null && days <= 21 ? pack.reminders.countdown : missed ? pack.reminders.comeback : pack.reminders.daily;
  const name = await deps.nameOf(enrollment.userId);
  const template = pick(variant(list, `${enrollment.userId}:${today}`), locale);
  const text = escapeHtml(fill(template, placeholders(pack, enrollment, { task, minutes: plan.minutes || goal.dailyMinutes, days: days ?? 0 }, name, locale)));
  const buttons: OutButton[][] = [[{ text: `${plain(locale, 'reminder.open')} · ${task}`.slice(0, 60), data: 'm:today' }]];
  return [{ kind: 'text' as const, html: text, buttons }];
}

function rowLabel(pack: CoachPack, row: ReportRow, locale: Locale): string {
  if (row.key === 'result') return pick(pack.rubricById.get(row.ref ?? '')?.name, locale);
  if (row.key === 'quiz') return plain(locale, 'report.row.quiz', { mode: plain(locale, `mode.${row.ref}` as 'mode.reading') });
  if (row.key === 'criterion') { const at = row.ref!.lastIndexOf('.'); return pick(pack.rubricById.get(row.ref!.slice(0, at))?.criteria.find((criterion) => criterion.id === row.ref!.slice(at + 1))?.name, locale); }
  return plain(locale, `report.row.${row.key}` as 'report.row.wpm');
}
function rowValue(pack: CoachPack, row: ReportRow, value: number | null): string {
  if (value === null) return '—';
  if (row.key === 'result') { const rubric = pack.rubricById.get(row.ref ?? ''); return rubric ? levelLabel(overallScale(rubric), value) : String(value); }
  return String(Math.round(value * 10) / 10);
}

async function weeklyMessage(deps: DeliveryDeps, pack: CoachPack, enrollment: Enrollment, now: Date) {
  const locale = enrollment.locale;
  const view = await weekView({ store: deps.store, pack, enrollment, now });
  const head = view.report.headline;
  const delta = head ? `${rowLabel(pack, head, locale)} ${rowValue(pack, head, head.before ?? head.start)} → ${rowValue(pack, head, head.after)}` : '';
  const name = await deps.nameOf(enrollment.userId);
  const lines = [escapeHtml(fill(pick(pack.reminders.weekly, locale), placeholders(pack, enrollment, { delta }, name, locale)))];
  const rows = view.report.rows.filter((row) => row.after !== null && row.key !== 'criterion').slice(0, 5);
  if (rows.length) lines.push(rows.map((row) => `${escapeHtml(rowLabel(pack, row, locale))}: ${rowValue(pack, row, row.before ?? row.start)} → <b>${rowValue(pack, row, row.after)}</b> ${row.verdict === 'better' ? '✅' : row.verdict === 'worse' ? '🔻' : ''}`).join('\n'));
  return [{ kind: 'text' as const, html: lines.join('\n\n'), buttons: [[{ text: plain(locale, 'btn.full_report'), app: `/coach/${pack.manifest.id}/report` }], [{ text: plain(locale, 'btn.today'), data: 'm:today' }]] }];
}

/** The worker reports what Telegram did with each delivery; a blocked bot stops further reminders. */
export async function recordDelivered(store: CoachStore, results: { id: string; status: 'sent' | 'failed' | 'blocked'; reason?: string | null }[]): Promise<number> {
  let updated = 0;
  for (const result of results.slice(0, 200)) {
    const id = Number(result.id);
    if (!Number.isInteger(id) || id <= 0 || !['sent', 'failed', 'blocked'].includes(result.status)) continue;
    const reason = typeof result.reason === 'string' && /^[a-z_]{1,40}$/.test(result.reason) ? result.reason : null;
    if (await store.updateDelivery(id, result.status, reason)) updated += 1;
  }
  return updated;
}
