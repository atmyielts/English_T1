import { edge } from './api';
import type { CefrLevel, SkillKey } from './skills';

export type TodayReason = 'review_due' | 'fix_mistake' | 'not_started' | 'weakest' | 'keep_fresh' | 'balance';
export type TodayItemKind = 'new' | 'stretch' | 'retry' | 'easier';

export type TodayTask = {
  id: string;
  kind: 'review' | 'activity';
  skill: SkillKey;
  content_item_id: string | null;
  slug: string | null;
  title: string;
  level: CefrLevel | null;
  minutes: number;
  reason: TodayReason;
  item_kind: TodayItemKind | null;
  previous_score: number | null;
  /** For fix_mistake tasks: an example of the mistake, as "what you wrote → correct". */
  detail?: string | null;
  done: boolean;
};

export type TodayResponse = {
  date: string;
  level: CefrLevel | null;
  target_level: CefrLevel | null;
  per_skill_level: Partial<Record<SkillKey, CefrLevel>>;
  level_status?: Partial<Record<SkillKey, 'ready' | 'struggling' | 'steady' | 'new'>>;
  daily_minutes: number;
  placement_done: boolean;
  level_check?: LevelCheck;
  available_skills: SkillKey[];
  /** Present for learners without a plan: today's free activities. */
  free?: { left: number; per_day: number } | null;
  tasks: TodayTask[];
  minutes_total: number;
  done_count: number;
  due_reviews: number;
  total_words: number;
  streak: number;
  week: Array<{ date: string; count: number }>;
};

export type CatalogEntry = {
  id: string;
  skill: SkillKey;
  slug: string;
  title: string;
  level: CefrLevel | null;
  minutes: number;
  difficulty: number;
  /** The item's topic suits the learner's goals. */
  goal_match?: boolean;
};

export type CatalogResponse = { items: CatalogEntry[]; best_scores: Record<string, number> };

export type HistoryEntry = {
  id: string;
  skill: SkillKey;
  title: string | null;
  slug: string | null;
  level: CefrLevel | null;
  score: number | null;
  submitted_at: string;
  time_spent_seconds: number | null;
};

/** The learner's calendar date, so "today" matches their clock, not UTC. */
export const localDate = (): string => {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

export const getToday = (signal?: AbortSignal) =>
  edge<TodayResponse>('hub', '/today', { query: { language_code: 'en', date: localDate() }, signal });

export const getCatalog = (skill?: SkillKey, signal?: AbortSignal) =>
  edge<CatalogResponse>('hub', '/catalog', { query: { language_code: 'en', skill }, signal });

export const getHistory = (skill?: SkillKey, signal?: AbortSignal) =>
  edge<{ attempts: HistoryEntry[] }>('hub', '/history', { query: { language_code: 'en', skill }, signal });

export type SkillProgress = {
  skill: SkillKey;
  level: CefrLevel | null;
  activities: number;
  recent_accuracy: number | null;
  accuracy_at_level: number | null;
  attempts_at_level: number;
  last_practised: string | null;
  /** ready: strong at this level; struggling: practising a level lower for now. */
  status?: 'ready' | 'struggling' | 'steady' | 'new';
  next_level?: CefrLevel | null;
};

/** Mistakes for Review: grammar ones grouped by topic and linked to the lesson that practises them. */
export type MistakeGroup = {
  key: string;
  topic: string | null;
  skill: SkillKey;
  count: number;
  examples: string[];
  status: 'open' | 'improving';
  last_seen_at: string;
  lesson: { slug: string; title: string } | null;
};

export type ProgressResponse = {
  level_history?: LevelEntry[];
  level_check?: LevelCheck;
  streak: { current: number; longest: number };
  totals: { last_7_days: number; last_30_days: number; all_time: number };
  days: Array<{ date: string; count: number }>;
  skills: SkillProgress[];
  mistakes: MistakeGroup[];
};

export const getProgress = (signal?: AbortSignal) =>
  edge<ProgressResponse>('hub', '/progress', { query: { language_code: 'en', date: localDate() }, signal });

export const moveUpLevel = (skill: SkillKey) =>
  edge<{ ok: boolean; skill: SkillKey; level: CefrLevel; previous_level: CefrLevel }>('hub', '/level/up', {
    query: { language_code: 'en' },
    body: { skill },
  });

export type TopicWeek = {
  topic: string;
  week: number;
  steps: Array<{ skill: SkillKey; content_item_id: string; slug: string; title: string; level: CefrLevel | null; minutes: number; done: boolean }>;
};

export const getTopicWeek = (signal?: AbortSignal) =>
  edge<{ week: TopicWeek | null }>('hub', '/week', { query: { language_code: 'en', date: localDate() }, signal });

export type ReminderSettings = {
  telegram_linked: boolean;
  enabled: boolean;
  hour: number;
  weekly: boolean;
  /** Daily review quiz in Telegram (up to 3 questions at the same hour). */
  quiz: boolean;
  locale: 'en' | 'ru' | 'uz';
  hours: { min: number; max: number };
};

export const getReminders = (signal?: AbortSignal) =>
  edge<ReminderSettings>('hub', '/reminders', { query: { language_code: 'en' }, signal });

export const saveReminders = (body: Partial<Pick<ReminderSettings, 'enabled' | 'hour' | 'weekly' | 'quiz' | 'locale'>>) =>
  edge<ReminderSettings>('hub', '/reminders', { query: { language_code: 'en' }, body });

export type SaveOnboardingBody = {
  placement?: { overall_level: CefrLevel; per_skill: Partial<Record<SkillKey, { level: CefrLevel }>> };
  goal?: { goal_keys: string[]; target_cefr?: CefrLevel; daily_time_minutes?: number };
  /** The monthly level check: keeps goals and untested skills. */
  source?: 'check';
};

export type LevelCheck = { due: boolean; last_at: string | null; next_at: string | null };
export type LevelEntry = {
  at: string;
  source: 'placement' | 'check' | 'level_up';
  overall: CefrLevel | null;
  per_skill: Partial<Record<SkillKey, CefrLevel>>;
};

export const saveOnboarding = (body: SaveOnboardingBody) =>
  edge<{ ok: boolean }>('hub', '/onboarding/save', { query: { language_code: 'en' }, body });

/** Where a planned task opens. Reviews go to the Review page. */
export const taskHref = (task: Pick<TodayTask, 'kind' | 'skill' | 'slug'>): string =>
  task.kind === 'review' ? '/review' : `/${task.skill}/${encodeURIComponent(task.slug ?? '')}`;
