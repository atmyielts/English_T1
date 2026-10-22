import { edge } from './api';
import type { CefrLevel, SkillKey } from './skills';

export type TodayReason = 'review_due' | 'not_started' | 'weakest' | 'keep_fresh' | 'balance';
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
  done: boolean;
};

export type TodayResponse = {
  date: string;
  level: CefrLevel | null;
  target_level: CefrLevel | null;
  per_skill_level: Partial<Record<SkillKey, CefrLevel>>;
  daily_minutes: number;
  placement_done: boolean;
  available_skills: SkillKey[];
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

export type SkillEstimate = {
  skill: SkillKey;
  level: CefrLevel;
  numeric: number;
  confidence: 'low' | 'medium' | 'high';
  sample_count: number;
};

export type DashboardResponse = {
  cefr: { estimates: SkillEstimate[]; overall: { level: CefrLevel; numeric: number } } | null;
  activity: {
    days: Array<{ date: string; events: number; skills_touched: SkillKey[]; minutes_estimate: number }>;
    streak: { current_days: number; longest_days: number; last_session_date: string | null };
    totals: { last_7_days: number; last_30_days: number; all_time: number };
  } | null;
  mistakes: Array<{ service: SkillKey; pattern: string; count: number; last_seen_at: string }>;
};

export const getDashboard = (signal?: AbortSignal) =>
  edge<DashboardResponse>('hub', '/dashboard', { query: { language_code: 'en' }, signal });

export type SaveOnboardingBody = {
  placement?: { overall_level: CefrLevel; per_skill: Partial<Record<SkillKey, { level: CefrLevel }>> };
  goal?: { goal_keys: string[]; target_cefr?: CefrLevel; daily_time_minutes?: number };
};

export const saveOnboarding = (body: SaveOnboardingBody) =>
  edge<{ ok: boolean }>('hub', '/onboarding/save', { query: { language_code: 'en' }, body });

/** Where a planned task opens. Reviews go to the Review page. */
export const taskHref = (task: Pick<TodayTask, 'kind' | 'skill' | 'slug'>): string =>
  task.kind === 'review' ? '/review' : `/${task.skill}/${encodeURIComponent(task.slug ?? '')}`;
