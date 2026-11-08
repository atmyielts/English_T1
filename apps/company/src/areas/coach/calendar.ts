// A calendar reminder the learner adds themselves: a repeating event on their working days,
// in whatever calendar they use. Schood sends nothing, and removing it is up to them.

const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const escapeText = (value: string) => value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

export interface Reminder { time: string; restDays: readonly number[]; today: string; summary: string; description: string; url: string; minutes: number; stamp: string }

/** An iCalendar file with one weekly event on every day that is not a rest day, in Tashkent time. */
export function reminderIcs({ time, restDays, today, summary, description, url, minutes, stamp }: Reminder): string {
  const days = [0, 1, 2, 3, 4, 5, 6].filter((day) => !restDays.includes(day));
  // The first event has to fall on one of the repeating days.
  let start = new Date(`${today}T00:00:00Z`);
  while (!days.includes(start.getUTCDay())) start = new Date(start.getTime() + 86_400_000);
  const date = start.toISOString().slice(0, 10).replaceAll('-', '');
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Schood//Company English//EN', 'CALSCALE:GREGORIAN',
    'BEGIN:VTIMEZONE', 'TZID:Asia/Tashkent', 'BEGIN:STANDARD', 'DTSTART:19700101T000000', 'TZOFFSETFROM:+0500', 'TZOFFSETTO:+0500', 'TZNAME:+05', 'END:STANDARD', 'END:VTIMEZONE',
    'BEGIN:VEVENT',
    `UID:company-english-practice-${stamp}@schood.online`,
    `DTSTAMP:${stamp}`,
    `DTSTART;TZID=Asia/Tashkent:${date}T${time.replace(':', '')}00`,
    `DURATION:PT${minutes}M`,
    `RRULE:FREQ=WEEKLY;BYDAY=${days.map((day) => DAYS[day]).join(',')}`,
    `SUMMARY:${escapeText(summary)}`,
    `DESCRIPTION:${escapeText(description)}`,
    `URL:${url}`,
    'END:VEVENT', 'END:VCALENDAR', '',
  ].join('\r\n');
}
