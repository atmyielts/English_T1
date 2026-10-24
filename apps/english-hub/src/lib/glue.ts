import { edge } from './api';
import type { CefrLevel, SkillKey } from './skills';

// The parts that make Schood English one system across skills and devices:
// the journey timeline, the inbox, search inside the content and
// "continue anywhere". Everything is computed on the server (hub).

/** XP for a right answer to a due review question (XP_PER_REVIEW_CORRECT in supabase/functions/_shared/english-xp.ts). */
export const XP_PER_REVIEW_CORRECT = 2;

// === Journey (GET /hub/journey) ===

export type JourneyKind =
  | 'activity' | 'roleplay' | 'mock' | 'review' | 'telegram_quiz' | 'words'
  | 'placement' | 'check' | 'level_up' | 'badge' | 'certificate';

export type JourneyEvent = {
  id: string;
  kind: JourneyKind;
  at: string;
  date: string;
  skill: SkillKey | null;
  channel: 'app' | 'telegram';
  title: string | null;
  slug: string | null;
  level: CefrLevel | null;
  score: number | null;
  band?: number | null;
  count?: number;
  correct?: number;
  minutes?: number | null;
  levels?: { from: CefrLevel | null; to: CefrLevel | null; skills: SkillKey[]; per_skill: Partial<Record<SkillKey, CefrLevel>> };
  goals?: { met: number; total: number } | null;
  badge?: string;
  code?: string;
  href: string | null;
};

export type JourneySummary = {
  activities: number;
  minutes: number;
  skills: SkillKey[];
  reviews: number;
  reviews_correct: number;
  words: number;
  average_score: number | null;
};

export type JourneyWeek = {
  start_date: string;
  end_date: string;
  prev_start: string | null;
  next_start: string | null;
  skill: SkillKey | null;
  days: Array<{ date: string; summary: JourneySummary; events: JourneyEvent[] }>;
  totals: JourneySummary & { days_active: number };
  first_at: string | null;
};

export const getJourney = (options: { week?: string | null; skill?: SkillKey | null; locale: string }, signal?: AbortSignal) =>
  edge<JourneyWeek>('hub', '/journey', {
    query: { language_code: 'en', week: options.week ?? undefined, skill: options.skill ?? undefined, locale: options.locale },
    signal,
  });

// === Inbox (GET /hub/inbox, POST /hub/inbox/read) ===

export type InboxKind =
  | 'level_up' | 'badge' | 'streak_risk' | 'review_due' | 'check_ready' | 'assignment_due'
  | 'weekly_report' | 'certificate' | 'service_paused' | 'system';

export type InboxItem = {
  id: string;
  kind: InboxKind;
  key: string;
  params: Record<string, string | number | boolean | null>;
  title: string | null;
  body: string | null;
  link: string | null;
  created_at: string;
  read: boolean;
  live: boolean;
};

export const getInbox = (signal?: AbortSignal) =>
  edge<{ unread: number; items: InboxItem[] }>('hub', '/inbox', { query: { language_code: 'en' }, signal });

// The bell's count, shared across page changes (like the XP chip) so moving around doesn't refetch each time.
let unreadCache: { at: number; value: number } | null = null;
const UNREAD_TTL_MS = 60_000;
const unreadListeners = new Set<(value: number) => void>();

export const getUnreadCount = async (signal?: AbortSignal): Promise<number> => {
  if (unreadCache && Date.now() - unreadCache.at < UNREAD_TTL_MS) return unreadCache.value;
  const { unread } = await edge<{ unread: number }>('hub', '/inbox', { query: { language_code: 'en', summary: 1 }, signal });
  unreadCache = { at: Date.now(), value: unread };
  return unread;
};

/** Updates the bell everywhere (after reading notices on the Inbox page). */
export const setUnreadCount = (value: number) => {
  unreadCache = { at: Date.now(), value };
  unreadListeners.forEach((listener) => listener(value));
};

export const onUnreadCount = (listener: (value: number) => void): (() => void) => {
  unreadListeners.add(listener);
  return () => { unreadListeners.delete(listener); };
};

export const markInboxRead = (body: { ids: string[] } | { all: true }) =>
  edge<{ updated: number }>('hub', '/inbox/read', { query: { language_code: 'en' }, body });

// === Search (GET /hub/search) ===

export type SearchResult = {
  kind: 'lesson' | 'word' | 'mistake' | 'rule';
  id: string;
  title: string;
  detail: string | null;
  skill: SkillKey | null;
  level: CefrLevel | null;
  href: string;
  access: 'open' | 'free' | 'locked';
};

export const SEARCH_MIN_LENGTH = 2;

export const searchContent = (query: string, signal?: AbortSignal) =>
  edge<{ results: SearchResult[] }>('hub', '/search', { query: { language_code: 'en', q: query.slice(0, 80) }, signal });

// === Continue anywhere (GET/POST /hub/resume) ===

export type ResumePosition = {
  draft?: string;
  answers?: Record<string, number>;
  typed?: Record<string, string>;
  plays?: number;
  step?: number;
  total?: number;
};

export type ResumeItem = {
  kind: 'activity' | 'roleplay' | 'mock';
  skill: SkillKey;
  ref: string;
  title: string | null;
  href: string;
  position: ResumePosition | null;
  progress: number | null;
  words: number | null;
  updated_at: string;
};

export const getResume = (locale: string, signal?: AbortSignal) =>
  edge<{ items: ResumeItem[] }>('hub', '/resume', { query: { language_code: 'en', locale }, signal });

/** Where the learner is in an activity, for every device. Best effort: never throws. */
export const saveResume = async (point: { skill: SkillKey; slug: string; position?: ResumePosition | null }): Promise<void> => {
  try {
    await edge('hub', '/resume', { query: { language_code: 'en' }, body: { skill: point.skill, slug: point.slug, position: point.position ?? null } });
  } catch {
    /* Continuing elsewhere is a convenience; the activity works without it. */
  }
};

/** Forget a skill's point (the activity was finished, or the learner dismissed it). Best effort. */
export const clearResume = async (skill: SkillKey, slug?: string): Promise<void> => {
  try {
    await edge('hub', '/resume/clear', { query: { language_code: 'en' }, body: { skill, slug } });
  } catch {
    /* Ignored: a finished activity is also hidden by the server. */
  }
};

/** The saved place in one activity, when there is one (another device may have saved it). */
export const getResumePoint = async (skill: SkillKey, slug: string, signal?: AbortSignal): Promise<ResumeItem | null> => {
  try {
    const { items } = await getResume('en', signal);
    return items.find((item) => item.kind === 'activity' && item.skill === skill && item.ref === slug) ?? null;
  } catch {
    return null;
  }
};

export type RoleplayState = {
  session_id: string;
  scenario_id: string;
  level: string | null;
  messages: Array<{ role: 'partner' | 'learner'; text: string }>;
  goals_met: string[];
  turns_left: number;
  can_finish: boolean;
  should_finish: boolean;
};

export const getRoleplayState = (sessionId: string, signal?: AbortSignal) =>
  edge<RoleplayState>('hub', '/resume/roleplay', { query: { language_code: 'en', id: sessionId }, signal });
