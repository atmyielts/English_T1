// Vocabulary duels, parent progress links and the public progress page
// (hub /duel*, /progress-links, /public/progress/:token).
import { edge } from './api';
import type { CefrLevel, SkillKey } from './skills';

export type DuelStatus = 'open' | 'active' | 'finished' | 'expired';
export type DuelOutcome = 'win' | 'loss' | 'draw' | 'walkover' | 'forfeit';

export type DuelView = {
  code: string;
  status: DuelStatus;
  role: 'creator' | 'opponent';
  server_now: string;
  invite_expires_at: string;
  play_expires_at: string | null;
  opponent_name: string;
  opponent_joined: boolean;
  me: {
    started: boolean;
    finished: boolean;
    deadline_at: string | null;
    seconds_left: number;
    answered: number;
    correct: number;
    outcome: DuelOutcome | null;
    xp: number;
  };
  question: { index: number; total: number; prompt: string; options: string[] } | null;
  opponent: { started: boolean; finished: boolean; correct: number | null; answered: number | null; outcome: DuelOutcome | null } | null;
  review: Array<{ prompt: string; options: string[]; correct_index: number; mine: number | null; theirs: number | null }> | null;
  can_rematch: boolean;
  rematch_code: string | null;
};

export type DuelInvite = { status: DuelStatus; inviter_name: string };

export type DuelSummary = {
  code: string;
  status: DuelStatus;
  role: 'creator' | 'opponent';
  opponent_name: string;
  created_at: string;
  my_correct: number | null;
  their_correct: number | null;
  outcome: DuelOutcome | null;
  next: 'play' | 'wait_friend' | 'wait_join' | null;
};

export type DuelLinks = { webUrl: string; botInviteUrl: string; miniAppRoute: string };

const q = { language_code: 'en' };

export const listDuels = (signal?: AbortSignal) =>
  edge<{ duels: DuelSummary[] }>('hub', '/duels', { query: q, signal });

export const createDuel = (locale: string) =>
  edge<{ code: string; links: DuelLinks }>('hub', '/duel', { query: q, body: { locale } });

export const getDuel = (code: string, signal?: AbortSignal) =>
  edge<{ duel: DuelView | null; invite?: DuelInvite }>('hub', `/duel/${encodeURIComponent(code)}`, { query: q, signal });

export const joinDuel = (code: string, locale: string) =>
  edge<{ view: DuelView; joined: boolean }>('hub', `/duel/${encodeURIComponent(code)}/join`, { query: q, body: { locale } });

export const startDuel = (code: string, locale: string) =>
  edge<{ view: DuelView }>('hub', `/duel/${encodeURIComponent(code)}/start`, { query: q, body: { locale } });

export type DuelAnswerResponse = {
  view: DuelView;
  accepted: boolean;
  reason: string | null;
  correct: boolean | null;
  correct_index: number | null;
};

export const answerDuel = (code: string, index: number, choice: number) =>
  edge<DuelAnswerResponse>('hub', `/duel/${encodeURIComponent(code)}/answer`, { query: q, body: { index, choice } });

export const rematchDuel = (code: string, locale: string) =>
  edge<{ code: string; created: boolean }>('hub', `/duel/${encodeURIComponent(code)}/rematch`, { query: q, body: { locale } });

/** The invite page on whichever host serves the app. */
export const duelUrl = (code: string): string => {
  const origin = typeof window === 'undefined' ? 'https://english.schood.online' : window.location.origin;
  return `${origin}/duel/${code}`;
};

// === Progress links ===

export type ProgressLink = {
  id: string;
  hint: string;
  label: string | null;
  created_at: string;
  revoked_at: string | null;
  last_viewed_at: string | null;
  views: number;
  telegram_followers: number;
};

export const listProgressLinks = (signal?: AbortSignal) =>
  edge<{ links: ProgressLink[]; max_active: number }>('hub', '/progress-links', { query: q, signal });

export const createProgressLink = (label: string) =>
  edge<{ link: Pick<ProgressLink, 'id' | 'hint' | 'label' | 'created_at'>; url: string; telegram_url: string }>('hub', '/progress-links', {
    query: q,
    body: { label },
  });

export const revokeProgressLink = (id: string) =>
  edge<{ links: ProgressLink[] }>('hub', '/progress-links/revoke', { query: q, body: { id } });

export type PublicMistake = { kind: 'topic'; topic: string; count: number } | { kind: 'skill'; skill: SkillKey; count: number };

export type PublicProgress = {
  first_name: string;
  level: { overall: CefrLevel | null; per_skill: Partial<Record<SkillKey, CefrLevel>> };
  streak: number;
  week: { minutes: number; activities: number; active_days: number; by_skill: Partial<Record<SkillKey, number>> };
  achievements: Array<{ key: string; earned_at: string }>;
  mistakes: PublicMistake[];
  updated_at: string;
};

/** Works signed out: the hub answers this route before checking for a session. */
export const getPublicProgress = (token: string, signal?: AbortSignal) =>
  edge<{ progress: PublicProgress }>('hub', `/public/progress/${encodeURIComponent(token)}`, { signal });

/** The bot link a parent opens to get the weekly report, built from a page token. */
export const parentBotUrl = (token: string) => `https://t.me/schoodstudentbot?start=pl_${token}`;
