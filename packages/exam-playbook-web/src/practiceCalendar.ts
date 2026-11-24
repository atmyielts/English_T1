export const PRACTICE_WEEKS = 8;

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

export function selectPracticeWeek<Item>(weeks: readonly Item[][][], value: string | null, done: (item: Item) => boolean): number {
  const selected = Number(value);
  if (Number.isInteger(selected) && selected >= 1 && selected <= weeks.length) return selected;
  const pending = weeks.findIndex(week => week.some(day => day.some(item => !done(item))));
  return pending < 0 ? Math.max(1, weeks.length) : pending + 1;
}
