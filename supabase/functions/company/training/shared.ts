// Helpers the training routes share: who is learning, which language feedback
// uses, Tashkent week boundaries and safe reading of AI JSON.
import { check, CompanyError, type Ctx, type MemberRow } from '../types.ts';
import { storable, tashkentDay } from '../util.ts';

export type Locale = 'en' | 'ru' | 'uz';
export const LOCALES: readonly Locale[] = ['en', 'ru', 'uz'];
export const LOCALE_NAME: Record<Locale, string> = { en: 'English', ru: 'Russian', uz: 'Uzbek (Latin script)' };

/** The caller's membership; learner routes need one (staff browsing without one are refused). */
export function learner(ctx: Ctx): MemberRow {
  if (!ctx.member) throw new CompanyError('not_member', 'Only workspace members can learn here.', 403);
  return ctx.member;
}

/** Why lessons and AI practice are closed. Only `no_seat` is something the company's HR can change. */
export type SeatReason = 'no_seat' | 'pilot' | 'paused' | 'contract_ended';

const SEAT_MESSAGE: Record<SeatReason, string> = {
  no_seat: 'This needs a learning seat. Your HR team arranges seats.',
  pilot: 'A pilot includes tests only. Lessons and AI practice come with an agreement with Schood.',
  paused: 'This workspace is paused, so lessons and AI practice are off. Contact Schood.',
  contract_ended: 'Your agreement with Schood has ended, so lessons and AI practice are off. Contact Schood to continue.',
};

/** What stops this member learning here, or null when the seat works. The workspace comes first: HR cannot fix those by seating someone. */
export function seatBlock(ctx: Ctx, member: Pick<MemberRow, 'seat'>): SeatReason | null {
  const org = ctx.org!;
  if (org.status === 'suspended' || org.status === 'closed') return 'paused';
  if (org.contract_ends_at && new Date(org.contract_ends_at).getTime() <= ctx.now().getTime()) return 'contract_ended';
  if (org.status !== 'active') return 'pilot';
  return member.seat ? null : 'no_seat';
}

/** The seat works: it is on, the agreement is active and it has not ended. A pilot has no seats. */
export const seatOpen = (ctx: Ctx, member: MemberRow): boolean => seatBlock(ctx, member) === null;

/** Whether the caller can use lessons and AI practice (Schood staff always can). */
export const canLearn = (ctx: Ctx) => ctx.staff || Boolean(ctx.member && seatOpen(ctx, ctx.member));

/** Why the caller cannot learn, for pages that show the locked state; null when they can. */
export const seatReason = (ctx: Ctx): SeatReason | null => ctx.staff ? null : seatBlock(ctx, ctx.member ?? { seat: false });

/** Lessons and AI practice need a learning seat. The catalogue, My English and HR's own tools do not. */
export function requireSeat(ctx: Ctx): void {
  const reason = seatReason(ctx);
  if (reason) throw new CompanyError('seat_required', SEAT_MESSAGE[reason], 402, { reason });
}

/** Minutes a member can claim in a Tashkent day on rows they report themselves. More clicks must not top a minutes challenge. */
export const DAILY_SELF_REPORTED_MINUTES = 180;
const SELF_REPORTED_KINDS = ['lesson_retry', 'glossary'];

/** How many of the minutes asked for still count today (0 once the day's allowance is used). Rows with minutes number at most the cap, so one read is enough. */
export async function selfReportedMinutes(ctx: Ctx, memberId: string, asked: number): Promise<number> {
  const since = new Date(`${tashkentDay(ctx.now())}T00:00:00+05:00`).toISOString();
  const rows = check<{ minutes: number }[]>(await ctx.db.from('company_activity').select('minutes').eq('member_id', memberId).in('kind', SELF_REPORTED_KINDS).gt('minutes', 0).gte('created_at', since));
  const used = rows.reduce((sum, row) => sum + row.minutes, 0);
  return Math.max(0, Math.min(asked, DAILY_SELF_REPORTED_MINUTES - used));
}

export const isHr = (ctx: Ctx) => ctx.staff || ctx.member?.role === 'owner' || ctx.member?.role === 'admin';

/** Feedback language: what the app sent, else the workspace default, else Russian. */
export function feedbackLocale(ctx: Ctx, value: unknown): Locale {
  if (LOCALES.includes(value as Locale)) return value as Locale;
  const org = (ctx.org?.settings as Record<string, unknown> | undefined)?.locale;
  return LOCALES.includes(org as Locale) ? org as Locale : 'ru';
}

const DAY = 86_400_000;
const TASHKENT = 5 * 3_600_000;
/** Monday 00:00 in Tashkent of the week containing `date`, as a UTC Date. */
export function weekStart(date: Date): Date {
  const local = new Date(date.getTime() + TASHKENT);
  const sinceMonday = (local.getUTCDay() + 6) % 7;
  const midnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  return new Date(midnight - sinceMonday * DAY - TASHKENT);
}
export const daysAgo = (date: Date, days: number) => new Date(date.getTime() - days * DAY);

/** A string from AI output, trimmed and cut to `max` (empty when absent). */
export function aiText(value: unknown, max: number): string {
  return typeof value === 'string' ? storable(value.replace(/\s+\n/g, '\n').trim().slice(0, max)) : '';
}
/** A list of strings from AI output. */
export function aiList(value: unknown, max: number, each: number): string[] {
  return Array.isArray(value) ? value.map((item) => aiText(item, each)).filter(Boolean).slice(0, max) : [];
}
export function aiScore(value: unknown): number | null {
  const number = Math.round(Number(value));
  return Number.isFinite(number) && number >= 0 && number <= 100 ? number : null;
}

/** Minutes the learner says they spent, clamped to something believable. */
export function minutesSpent(value: unknown, max = 60): number {
  const number = Math.round(Number(value));
  return Number.isFinite(number) ? Math.min(max, Math.max(1, number)) : 1;
}
