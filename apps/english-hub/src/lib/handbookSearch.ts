// Search and lookup for the grammar handbook. Pure (no imports), so it is
// unit-tested with Deno in tests/handbook-search.test.ts.

export const HANDBOOK_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export type HandbookLevel = (typeof HANDBOOK_LEVELS)[number];
export type HandbookLocale = 'en' | 'ru' | 'uz';

export type HandbookEntry = {
  slug: string;
  title: string;
  level: HandbookLevel;
  focus_area: string | null;
  explanation: { en: string; ru: string | null; uz: string | null };
  contrast_text: string | null;
  common_error_pattern: string | null;
  examples: Array<{ bad: string | null; good: string }>;
};

/**
 * Text folded for matching: lower case, accents and other diacritics removed
 * (é → e, ё → е, й → и), apostrophes dropped so "o'qish", "oʻqish" and
 * "oqish" all match, and punctuation turned into single spaces.
 */
export const normalizeForSearch = (value: string): string =>
  value
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[ʻʼʹ‘’‛`´']/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/** The explanation in the learner's language; English (fallback) when there is no translation yet. */
export const explanationFor = (entry: HandbookEntry, locale: HandbookLocale): { text: string; fallback: boolean } => {
  if (locale === 'en') return { text: entry.explanation.en, fallback: false };
  const local = entry.explanation[locale];
  return local ? { text: local, fallback: false } : { text: entry.explanation.en, fallback: true };
};

/**
 * Entries matching every word of the query (in any order, in any language),
 * best first: title matches, then topic matches, then the rest. `topicLabels`
 * adds the topic's display names (in every language) to what is searched.
 */
export const searchHandbook = (
  entries: HandbookEntry[],
  query: string,
  options: { level?: HandbookLevel | 'all'; topicLabels?: (focus: string) => string[] } = {},
): HandbookEntry[] => {
  const level = options.level ?? 'all';
  const pool = level === 'all' ? entries : entries.filter((entry) => entry.level === level);
  const words = normalizeForSearch(query).split(' ').filter(Boolean);
  if (!words.length) return pool;

  const scored = pool.flatMap((entry, index) => {
    const title = normalizeForSearch(entry.title);
    const focus = normalizeForSearch([entry.focus_area ?? '', ...(entry.focus_area ? options.topicLabels?.(entry.focus_area) ?? [] : [])].join(' '));
    const body = normalizeForSearch([
      entry.explanation.en,
      entry.explanation.ru ?? '',
      entry.explanation.uz ?? '',
      entry.common_error_pattern ?? '',
    ].join(' '));
    const all = `${title} ${focus} ${body}`;
    if (!words.every((word) => all.includes(word))) return [];
    const score = words.reduce((sum, word) => sum + (title.includes(word) ? 3 : focus.includes(word) ? 2 : 1), 0);
    return [{ entry, index, score }];
  });
  return scored.sort((a, b) => b.score - a.score || a.index - b.index).map((item) => item.entry);
};

/**
 * The rule to read for a grammar topic: the hardest unit on that topic at or
 * below the learner's level, else the easiest one. Null when no unit covers it.
 */
export const ruleSlugForTopic = (entries: HandbookEntry[], topic: string, level: string | null | undefined): string | null => {
  const matches = entries.filter((entry) => entry.focus_area === topic);
  if (!matches.length) return null;
  const rank = (entry: HandbookEntry) => HANDBOOK_LEVELS.indexOf(entry.level);
  const target = HANDBOOK_LEVELS.indexOf(String(level ?? '').toUpperCase() as HandbookLevel);
  const atOrBelow = target >= 0 ? matches.filter((entry) => rank(entry) <= target) : [];
  if (atOrBelow.length) return [...atOrBelow].sort((a, b) => rank(b) - rank(a))[0]?.slug ?? null;
  return [...matches].sort((a, b) => rank(a) - rank(b))[0]?.slug ?? null;
};

/** Where "Read the rule" points for a mistake topic; the handbook picks the unit for the learner's level. */
export const handbookTopicHref = (topic: string): string => `/grammar/handbook?topic=${encodeURIComponent(topic)}`;
