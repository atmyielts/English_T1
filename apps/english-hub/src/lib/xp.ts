import { edge } from './api';
import type { SkillKey } from './skills';

/** XP is computed on the server from real attempts and reviews; the app only displays it. */
export type XpSummary = {
  today: { date: string; xp: number; goal_bonus: boolean };
  week: { start_date: string; ends_at: string; xp: number; days: Array<{ date: string; xp: number }> };
  /** What the latest attempt at the requested activity earned (last 30 minutes). */
  last_gain: { xp: number; at: string } | null;
};

export const getXp = (activity?: { skill: SkillKey; slug: string }, signal?: AbortSignal) =>
  edge<XpSummary>('hub', '/xp', { query: { language_code: 'en', skill: activity?.skill, slug: activity?.slug }, signal });

export const LEAGUE_TIERS = ['bronze', 'silver', 'gold', 'sapphire', 'diamond'] as const;
export type LeagueTier = (typeof LEAGUE_TIERS)[number];
export type LeagueZone = 'promote' | 'demote' | 'stay';
export type LeagueSettings = { hidden: boolean; opted_out: boolean };

export type LeagueMember = { rank: number; name: string; xp: number; me: boolean; zone: LeagueZone };

export type LeagueResponse = {
  settings: LeagueSettings;
  tiers: LeagueTier[];
  week: { start_date: string; ends_at: string };
  tier: LeagueTier | null;
  group: { size: number; capacity: number; promote: number; demote: number; members: LeagueMember[] } | null;
  last_week: { week_start: string; tier: LeagueTier; rank: number | null; xp: number | null; outcome: 'promoted' | 'stayed' | 'demoted' | null } | null;
};

export const getLeague = (signal?: AbortSignal) =>
  edge<LeagueResponse>('hub', '/league', { query: { language_code: 'en' }, signal });

export const getLeagueSettings = (signal?: AbortSignal) =>
  edge<{ settings: LeagueSettings; can_save: boolean }>('hub', '/league/settings', { query: { language_code: 'en' }, signal });

export const saveLeagueSettings = (patch: Partial<LeagueSettings>) =>
  edge<{ settings: LeagueSettings }>('hub', '/league/settings', { query: { language_code: 'en' }, body: patch });

export type Badge = {
  key: string;
  earned: boolean;
  current: number;
  target: number;
  earned_at: string | null;
  /** Earned and not yet celebrated. */
  new: boolean;
};

export const getAchievements = (signal?: AbortSignal) =>
  edge<{ badges: Badge[] }>('hub', '/achievements', { query: { language_code: 'en' }, signal });

export const markBadgesSeen = (keys: string[]) =>
  edge<{ ok: boolean }>('hub', '/achievements/seen', { query: { language_code: 'en' }, body: { keys } });

/** The short mark shown inside a badge medallion. */
export const badgeMark = (key: string): string => {
  const marks: Record<string, string> = {
    first_activity: '1',
    streak_3: '3',
    streak_7: '7',
    streak_30: '30',
    activities_10: '10',
    activities_50: '50',
    activities_200: '200',
    words_50: '50',
    words_200: '200',
    all_skills_week: '7',
    first_level_up: '↑',
    monthly_check: '✓',
    perfect_5: '100',
    league_promotion: '▲',
  };
  return marks[key] ?? '★';
};

/** Badge colour family. */
export const badgeFamily = (key: string): string => {
  if (key.startsWith('streak_')) return 'streak';
  if (key.startsWith('activities_') || key === 'first_activity') return 'activity';
  if (key.startsWith('words_')) return 'words';
  if (key === 'all_skills_week') return 'skills';
  if (key === 'first_level_up' || key === 'monthly_check') return 'level';
  if (key === 'league_promotion') return 'league';
  return 'perfect';
};

/** Days, hours and minutes left until `endsAt`. */
export const timeLeft = (endsAt: string, now = Date.now()) => {
  const ms = Math.max(0, Date.parse(endsAt) - now);
  const minutes = Math.floor(ms / 60_000);
  return { days: Math.floor(minutes / 1440), hours: Math.floor((minutes % 1440) / 60), minutes: minutes % 60 };
};
