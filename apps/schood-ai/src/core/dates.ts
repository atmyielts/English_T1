import { INTL, type Locale } from '../../../../packages/service-i18n/src/format.ts';

// Dates for every screen. English and Russian use the browser's Intl data. Uzbek is
// written out here: many browsers have no Uzbek date data and print "2026 M10 30", so
// Uzbek follows the CLDR patterns with Latin month and weekday names ("30-oktabr, 2026",
// "juma, 30-oktabr, 2026, 14:05"). Use useI18n().date from core, or formatDate.

const MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
const MONTHS_SHORT = ['yan', 'fev', 'mar', 'apr', 'may', 'iyn', 'iyl', 'avg', 'sen', 'okt', 'noy', 'dek'];
const WEEKDAYS = ['yakshanba', 'dushanba', 'seshanba', 'chorshanba', 'payshanba', 'juma', 'shanba'];
const WEEKDAYS_SHORT = ['Yak', 'Dush', 'Sesh', 'Chor', 'Pay', 'Jum', 'Shan'];

interface Parts { year: number; month: number; day: number; weekday: number; hour: number; minute: number; second: number }

/** The wall-clock parts of an instant, in a zone (or the browser's own). Numeric Intl data exists everywhere. */
function partsOf(date: Date, timeZone?: string): Parts {
  if (!timeZone) {
    return { year: date.getFullYear(), month: date.getMonth(), day: date.getDate(), weekday: date.getDay(), hour: date.getHours(), minute: date.getMinutes(), second: date.getSeconds() };
  }
  const read = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23',
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return {
    year: Number(read.year), month: Number(read.month) - 1, day: Number(read.day), weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(read.weekday),
    hour: Number(read.hour) % 24, minute: Number(read.minute), second: Number(read.second),
  };
}

const two = (value: number) => String(value).padStart(2, '0');

/** Uzbek (Latin) date and time, following CLDR's uz patterns. */
export function formatUzbek(date: Date, options: Intl.DateTimeFormatOptions): string {
  const p = partsOf(date, options.timeZone);
  const style = options.dateStyle, time = options.timeStyle;
  const weekday = style === 'full' ? 'long' : options.weekday;
  const month = style === 'full' || style === 'long' ? 'long' : style === 'medium' ? 'short' : style === 'short' ? '2-digit' : options.month;
  const year = style ? (style === 'short' ? '2-digit' : 'numeric') : options.year;
  const day = style ? 'numeric' : options.day;
  const hasTime = !!time || options.hour !== undefined || options.minute !== undefined;

  const out: string[] = [];
  if (weekday) out.push(weekday === 'long' ? WEEKDAYS[p.weekday] : WEEKDAYS_SHORT[p.weekday]);
  if (month === 'long' || month === 'short') {
    const name = month === 'long' ? MONTHS[p.month] : MONTHS_SHORT[p.month];
    const dayMonth = day ? `${day === '2-digit' ? two(p.day) : p.day}-${name}` : name;
    out.push(year ? `${dayMonth}, ${year === '2-digit' ? two(p.year % 100) : p.year}` : dayMonth);
  } else if (month || day || year) {
    // Numeric dates: 30/10/26 for the short style, else 30.10.2026.
    const separator = style === 'short' ? '/' : '.';
    const pieces = [day ? two(p.day) : null, month ? two(p.month + 1) : null, year ? (year === '2-digit' ? two(p.year % 100) : String(p.year)) : null].filter(Boolean);
    out.push(pieces.join(separator));
  }
  if (hasTime) {
    const seconds = time === 'medium' || time === 'long' || time === 'full' || options.second !== undefined;
    const hour = options.hour !== undefined || time ? two(p.hour) : null;
    const minute = options.minute !== undefined || time ? two(p.minute) : null;
    out.push([hour, minute, seconds ? two(p.second) : null].filter((piece) => piece !== null).join(':'));
  }
  return out.join(', ');
}

/** A date in the person's language: Intl for English and Russian, CLDR patterns written out for Uzbek. */
export function formatDate(locale: Locale, input: string | number | Date, options: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' }): string {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return '—';
  if (locale === 'uz') return formatUzbek(date, options);
  return new Intl.DateTimeFormat(INTL[locale], options).format(date);
}
