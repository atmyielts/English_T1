// Local time for a learner: days, weeks and reminder times in their time zone
// (Asia/Tashkent by default). Reminder times are kept between 08:00 and 21:59,
// outside the quiet hours (22:00–08:00) every coach respects.

export const DEFAULT_TZ = 'Asia/Tashkent';
const DAY = 86_400_000;

export function validTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$/.test(tz)) return false;
  try { new Intl.DateTimeFormat('en-CA', { timeZone: tz }); return true; } catch { return false; }
}

export function localParts(at: Date, tz = DEFAULT_TZ): { day: string; weekday: number; hour: number; minute: number } {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' })
    .formatToParts(at).map((part) => [part.type, part.value]));
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
  return { day: `${parts.year}-${parts.month}-${parts.day}`, weekday, hour: Number(parts.hour), minute: Number(parts.minute) };
}

export const addDays = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);

/** The UTC instant of a local wall-clock time (two passes handle offset changes). */
export function zonedTime(day: string, hhmm: string, tz = DEFAULT_TZ): Date {
  const [hour, minute] = hhmm.split(':').map(Number);
  const guess = Date.parse(`${day}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`);
  let instant = guess;
  for (let i = 0; i < 2; i++) {
    const local = localParts(new Date(instant), tz);
    const shown = Date.parse(`${local.day}T${String(local.hour).padStart(2, '0')}:${String(local.minute).padStart(2, '0')}:00Z`);
    instant += guess - shown;
  }
  return new Date(instant);
}

/** The next time `hhmm` happens after `now` (today if still ahead, else tomorrow). */
export function nextDaily(now: Date, hhmm: string, tz = DEFAULT_TZ): Date {
  const today = localParts(now, tz).day;
  const at = zonedTime(today, hhmm, tz);
  return at.getTime() > now.getTime() ? at : zonedTime(addDays(today, 1), hhmm, tz);
}

/** The next `weekday` (0 = Sunday) at `hhmm` after `now`. */
export function nextWeekly(now: Date, weekday: number, hhmm: string, tz = DEFAULT_TZ): Date {
  const local = localParts(now, tz);
  for (let offset = 0; offset <= 7; offset++) {
    const day = addDays(local.day, offset);
    if (new Date(`${day}T12:00:00Z`).getUTCDay() !== weekday) continue;
    const at = zonedTime(day, hhmm, tz);
    if (at.getTime() > now.getTime()) return at;
  }
  return zonedTime(addDays(local.day, 7), hhmm, tz);
}

/** Monday of the local week containing `day`. */
export function weekStart(day: string): string {
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  return addDays(day, -((weekday + 6) % 7));
}

/** Reminder times people can pick: all outside quiet hours. */
export const REMINDER_TIMES = ['08:00', '09:30', '12:30', '15:00', '18:00', '19:30', '21:00'] as const;
export const validReminder = (value: unknown): value is string => typeof value === 'string' && /^(0[8-9]|1\d|2[01]):[0-5]\d$/.test(value);

/** `15.03.2027`, `15/03/2027`, `2027-03-15` → `2027-03-15`, or null. */
export function parseDate(text: string): string | null {
  const value = text.trim();
  let year: number, month: number, day: number;
  const dotted = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(value), iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dotted) { day = Number(dotted[1]); month = Number(dotted[2]); year = Number(dotted[3]); }
  else if (iso) { year = Number(iso[1]); month = Number(iso[2]); day = Number(iso[3]); }
  else return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}
