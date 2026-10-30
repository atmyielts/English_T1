// When a scheduled job's current period started: every N minutes (UTC-aligned),
// daily at a local time, or weekly on a local weekday and time. A job runs once a
// period, on the first system tick (every five minutes) at or after its start.

export type JobSchedule =
  | { everyMinutes: number }
  | { dailyAt: string; timeZone?: string }
  | { weeklyAt: string; weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6; timeZone?: string };

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function scheduleProblems(schedule: JobSchedule): string[] {
  if ('everyMinutes' in schedule) return Number.isInteger(schedule.everyMinutes) && schedule.everyMinutes >= 5 && schedule.everyMinutes <= 1440 ? [] : ['everyMinutes must be 5 to 1440'];
  const at = 'dailyAt' in schedule ? schedule.dailyAt : schedule.weeklyAt;
  const problems = HHMM.test(at) ? [] : ['time must be HH:MM'];
  if ('weekday' in schedule && !(Number.isInteger(schedule.weekday) && schedule.weekday >= 0 && schedule.weekday <= 6)) problems.push('weekday must be 0 (Sunday) to 6');
  try { new Intl.DateTimeFormat('en', { timeZone: schedule.timeZone ?? 'Asia/Tashkent' }); } catch { problems.push('unknown time zone'); }
  return problems;
}

/** Local wall-clock parts of an instant in a zone. */
function local(zone: string, at: Date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23',
  }).formatToParts(at).map((part) => [part.type, part.value]));
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day), hour: Number(parts.hour), minute: Number(parts.minute), weekday };
}
/** The instant a local date and time happens in a zone. */
function instant(zone: string, year: number, month: number, day: number, hour: number, minute: number): Date {
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  const seen = local(zone, new Date(wall));
  const offset = Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute) - wall;
  return new Date(wall - offset);
}

/** The start of the period that contains `now`. */
export function periodStart(schedule: JobSchedule, now: Date): Date {
  if ('everyMinutes' in schedule) {
    const size = schedule.everyMinutes * 60_000;
    return new Date(Math.floor(now.getTime() / size) * size);
  }
  const zone = schedule.timeZone ?? 'Asia/Tashkent';
  const [hour, minute] = ('dailyAt' in schedule ? schedule.dailyAt : schedule.weeklyAt).split(':').map(Number);
  const today = local(zone, now);
  for (let back = 0; back <= 7; back++) {
    const date = new Date(Date.UTC(today.year, today.month - 1, today.day - back));
    const candidate = instant(zone, date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), hour, minute);
    if (candidate.getTime() > now.getTime()) continue;
    if ('weekday' in schedule && local(zone, candidate).weekday !== schedule.weekday) continue;
    return candidate;
  }
  throw new Error('no period start found');
}
