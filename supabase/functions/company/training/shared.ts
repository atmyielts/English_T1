// Helpers the training routes share: who is learning, which language feedback
// uses, Tashkent week boundaries and safe reading of AI JSON.
import { CompanyError, type Ctx, type MemberRow } from '../types.ts';

export type Locale = 'en' | 'ru' | 'uz';
export const LOCALES: readonly Locale[] = ['en', 'ru', 'uz'];
export const LOCALE_NAME: Record<Locale, string> = { en: 'English', ru: 'Russian', uz: 'Uzbek (Latin script)' };

/** The caller's membership; learner routes need one (staff browsing without one are refused). */
export function learner(ctx: Ctx): MemberRow {
  if (!ctx.member) throw new CompanyError('not_member', 'Only workspace members can learn here.', 403);
  return ctx.member;
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
  return typeof value === 'string' ? value.replace(/\s+\n/g, '\n').trim().slice(0, max) : '';
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
