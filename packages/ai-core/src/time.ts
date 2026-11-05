// Schood runs on Tashkent time (UTC+5, no daylight saving): daily caps and
// member budgets turn over at local midnight and on the first of the month.

const OFFSET_MS = 5 * 3_600_000;

export const tashkentDay = (now: Date): string => new Date(now.getTime() + OFFSET_MS).toISOString().slice(0, 10);
export const tashkentMonth = (now: Date): string => tashkentDay(now).slice(0, 7);
/** The next local midnight, for "try again after" messages. */
export function nextTashkentMidnight(now: Date): Date {
  return new Date(Date.parse(`${tashkentDay(now)}T00:00:00Z`) - OFFSET_MS + 86_400_000);
}
