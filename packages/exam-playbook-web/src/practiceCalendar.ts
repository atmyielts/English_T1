export const PRACTICE_WEEKS = 8;
export type PracticeSessionState = 'next' | 'started' | 'later' | 'complete';

/** Build a fixed sequence from ordered, disjoint pools. Each item is assigned once. */
export function buildPracticeCalendar<Key extends string, Item>(
  pools: Readonly<Partial<Record<Key, readonly Item[]>>>,
  pattern: readonly (readonly Key[])[],
): Item[][][] {
  const next = new Map<Key, number>();
  const weeks: Item[][][] = [];
  for (let week = 0; week < PRACTICE_WEEKS; week += 1) {
    const days: Item[][] = [];
    for (const template of pattern) {
      const activities: Item[] = [];
      for (const key of template) {
        const index = next.get(key) ?? 0;
        const activity = pools[key]?.[index];
        if (activity === undefined) return [];
        activities.push(activity);
        next.set(key, index + 1);
      }
      days.push(activities);
    }
    weeks.push(days);
  }
  return weeks;
}

export function nextPracticeSession<Item>(weeks: readonly Item[][][], done: (item: Item) => boolean) {
  for (const [week, days] of weeks.entries()) {
    const day = days.findIndex(activities => activities.some(item => !done(item)));
    if (day >= 0) return { week: week + 1, day };
  }
  return null;
}

export function selectPracticeWeek<Item>(weeks: readonly Item[][][], value: string | null, done: (item: Item) => boolean): number {
  const selected = Number(value);
  if (Number.isInteger(selected) && selected >= 1 && selected <= weeks.length) return selected;
  return nextPracticeSession(weeks, done)?.week ?? Math.max(1, weeks.length);
}

export function practiceSessionState<Item>(
  items: readonly Item[], done: (item: Item) => boolean, recommended: boolean, started = done,
): PracticeSessionState {
  if (items.every(done)) return 'complete';
  if (recommended) return 'next';
  return items.some(started) ? 'started' : 'later';
}
