// The one workspace's navigation: what the sidebar, the phone tab bar and the
// quick switcher (Ctrl+K) offer. Pure data so every surface lists the same
// places in the same order, and so it can be tested without React.

import { SKILLS, type SkillKey } from '../lib/skills.ts';

export type NavGroupId = 'day' | 'skills' | 'you';

export type NavEntry = {
  /** Route path, e.g. "/today" or "/grammar/handbook". */
  to: string;
  /** i18n key for the label. */
  labelKey: string;
  /** Extra i18n params for the label. */
  labelParams?: Record<string, string>;
  group: NavGroupId;
  /** Set on skill entries and a skill's own pages. */
  skill?: SkillKey;
  /** Extra words the quick switcher matches (English, any case). */
  keywords?: string;
};

/** Daily-loop pages, in sidebar order. */
export const DAY_ENTRIES: NavEntry[] = [
  { to: '/today', labelKey: 'nav.today', group: 'day', keywords: 'home plan daily' },
  { to: '/review', labelKey: 'nav.review', group: 'day', keywords: 'flashcards words mistakes spaced' },
  { to: '/tutor', labelKey: 'nav.tutor', group: 'day', keywords: 'ai chat coach conversation voice' },
  { to: '/roleplay', labelKey: 'ws.roleplay', group: 'day', keywords: 'roleplay scenario interview visa conversation speaking' },
  { to: '/speaking-mock', labelKey: 'ws.mock', group: 'day', keywords: 'ielts mock exam test band speaking' },
  { to: '/practice', labelKey: 'nav.practice', group: 'day', keywords: 'skills catalog library lessons' },
];

/** Personal pages, in sidebar order. */
export const YOU_ENTRIES: NavEntry[] = [
  { to: '/progress', labelKey: 'nav.progress', group: 'you', keywords: 'level stats goal history' },
  { to: '/league', labelKey: 'nav.league', group: 'you', keywords: 'xp ranking leaderboard badges' },
  { to: '/certificate', labelKey: 'ws.certificate', group: 'you', keywords: 'certificate cefr share' },
  { to: '/settings', labelKey: 'nav.settings', group: 'you', keywords: 'account language reminders telegram install' },
];

/** A skill's own pages beyond its home, shown under the skill while you are in it. */
export const SKILL_PAGES: Partial<Record<SkillKey, NavEntry[]>> = {
  grammar: [{ to: '/grammar/handbook', labelKey: 'ws.handbook', group: 'skills', skill: 'grammar', keywords: 'rules handbook explanations russian uzbek' }],
  speaking: [{ to: '/speaking/shadowing', labelKey: 'shadow.nav', group: 'skills', skill: 'speaking', keywords: 'shadowing repeat pronunciation rhythm read aloud' }],
};

export const skillEntries = (): NavEntry[] =>
  SKILLS.map((skill) => ({ to: skill.path, labelKey: `skill.${skill.key}`, group: 'skills', skill: skill.key, keywords: skill.key }));

/** Every place the quick switcher can open. */
export const allEntries = (): NavEntry[] => [
  ...DAY_ENTRIES,
  ...skillEntries(),
  ...Object.values(SKILL_PAGES).flat().filter((entry): entry is NavEntry => Boolean(entry)),
  ...YOU_ENTRIES,
];

/** Which sidebar entry is current for a path: the longest matching prefix wins. */
export const activeEntry = (pathname: string, entries: NavEntry[]): NavEntry | null => {
  let best: NavEntry | null = null;
  for (const entry of entries) {
    if (pathname === entry.to || pathname.startsWith(`${entry.to}/`)) {
      if (!best || entry.to.length > best.to.length) best = entry;
    }
  }
  return best;
};

const fold = (value: string): string =>
  value.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[ʻʼ‘’'`]/g, '');

/**
 * Quick-switcher ranking. `labelOf` gives the label in the learner's language;
 * a match at the start of the label ranks first, then anywhere in the label,
 * then in the English keywords. An empty query lists everything in order.
 */
export const searchEntries = (
  query: string,
  entries: NavEntry[],
  labelOf: (entry: NavEntry) => string,
  limit = 8,
): NavEntry[] => {
  const q = fold(query.trim());
  if (!q) return entries.slice(0, limit);
  const scored: Array<{ entry: NavEntry; score: number; index: number }> = [];
  entries.forEach((entry, index) => {
    const label = fold(labelOf(entry));
    const words = fold(`${entry.keywords ?? ''} ${entry.to}`);
    let score = -1;
    if (label.startsWith(q)) score = 3;
    else if (label.split(/\s+/).some((word) => word.startsWith(q))) score = 2;
    else if (label.includes(q)) score = 1;
    else if (words.split(/[\s/]+/).some((word) => word.startsWith(q))) score = 0.5;
    if (score >= 0) scored.push({ entry, score, index });
  });
  return scored
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((item) => item.entry);
};
