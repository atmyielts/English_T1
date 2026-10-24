import { edge } from './api';
import { localDate } from './hub';
import type { CefrLevel, SkillKey } from './skills';

// === Per-skill rating and IELTS estimate (GET /hub/ratings) ===

export type SkillRating = {
  skill: SkillKey;
  value: number | null;
  level: CefrLevel | null;
  /** 0..99 toward next_level. */
  progress: number | null;
  next_level: CefrLevel | null;
  attempts: number;
  confidence: 'none' | 'low' | 'medium' | 'high';
  base_level: CefrLevel | null;
};

export type IeltsSkill = 'listening' | 'reading' | 'writing' | 'speaking';

export type RatingsResponse = {
  computed_at: string;
  target_level: CefrLevel | null;
  skills: SkillRating[];
  overall: { value: number | null; level: CefrLevel | null; progress: number | null; next_level: CefrLevel | null };
  ielts: { per_skill: Partial<Record<IeltsSkill, number>>; overall: number | null; based_on: IeltsSkill[]; tentative: boolean };
};

export const getRatings = (signal?: AbortSignal) =>
  edge<RatingsResponse>('hub', '/ratings', { query: { language_code: 'en' }, signal });

export const IELTS_PRACTICE_URL = 'https://practice.ielts.schood.online';
export const IELTS_MOCK_URL = 'https://ielts.schood.online';

// === One next step across all skills (GET /hub/next) ===

export type NextReason = 'continue' | 'review_due' | 'fix_mistake' | 'weakest_skill' | 'today_plan' | 'keep_going';

export type NextStep = {
  kind: 'review' | 'activity';
  skill: SkillKey | null;
  content_item_id: string | null;
  slug: string | null;
  title: string;
  level: CefrLevel | null;
  minutes: number;
  reason: NextReason;
  detail: string | null;
  due?: number;
  rating?: { level: CefrLevel | null; progress: number | null } | null;
  target_level?: CefrLevel | null;
  uses_free: boolean;
  /** A role-play or mock to continue opens here. */
  href?: string | null;
};

export type NextResponse = { date: string; step: NextStep | null; locked: NextStep | null };

export const nextHref = (step: Pick<NextStep, 'kind' | 'skill' | 'slug' | 'href'>): string =>
  step.href && step.href.startsWith('/') ? step.href
    : step.kind === 'review' || !step.skill ? '/review' : `/${step.skill}/${encodeURIComponent(step.slug ?? '')}`;

const NEXT_TTL_MS = 60_000;
let nextCache: { key: string; at: number; value: Promise<NextResponse> } | null = null;

/** Forget the cached step (after an activity is submitted the answer changes). */
export const invalidateNext = () => { nextCache = null; };

/**
 * The next step. `after` is the activity just finished (never suggested
 * again); `from` is the skill the learner is in. Without `after`, the answer
 * is reused for a minute so moving between pages of a skill stays quick.
 */
export const getNext = (
  options: { from?: SkillKey | null; after?: { skill: SkillKey; slug: string } | null; locale?: string },
  signal?: AbortSignal,
): Promise<NextResponse> => {
  const query = {
    language_code: 'en',
    date: localDate(),
    from_skill: options.after?.skill ?? options.from ?? undefined,
    slug: options.after?.slug,
    // Names a role-play to continue in the learner's language.
    locale: options.locale,
  };
  if (options.after) {
    invalidateNext();
    return edge<NextResponse>('hub', '/next', { query, signal });
  }
  const key = JSON.stringify(query);
  if (nextCache && nextCache.key === key && Date.now() - nextCache.at < NEXT_TTL_MS) return nextCache.value;
  // Shared between callers, so it is not tied to one caller's abort signal.
  const value = edge<NextResponse>('hub', '/next', { query });
  value.catch(() => { if (nextCache?.value === value) nextCache = null; });
  nextCache = { key, at: Date.now(), value };
  return value;
};

// === Streak freezes and "Win it back" (GET /hub/streak) ===

export type Comeback = {
  status: 'open' | 'won' | 'lost';
  old_streak: number;
  starts: string;
  ends: string;
  done: number;
  needed: number;
  won_on: string | null;
};

export type StreakResponse = {
  today: string;
  current: number;
  freezes: number;
  max_freezes: number;
  next_freeze_in: number | null;
  frozen_days: string[];
  today_done: boolean;
  at_risk: boolean;
  comeback: Comeback | null;
};

export const getStreak = (signal?: AbortSignal) =>
  edge<StreakResponse>('hub', '/streak', { query: { language_code: 'en' }, signal });
