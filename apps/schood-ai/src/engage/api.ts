import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, useWorkspace, type ApiOptions } from '../core/index.ts';

// Calls to /schood-ai/engage/<action>. `useEngage` loads a view and reloads it; every
// screen shows loading, error and refusal states from it. Public pages (a shared
// Passport, a certificate check) use `publicGet`, which also works signed out once the
// core router opens `public: true` routes (requested in docs/product/ai-requests/engage.md).

export const engageCall = <T>(action: string, options: ApiOptions = {}) => api<T>(`engage/${action}`, options);

export function useEngage<T>(action: string | null, query: Record<string, string | undefined> = {}) {
  const { workspaceId } = useWorkspace();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const key = JSON.stringify([action, query, workspaceId]);
  const live = useRef(0);
  const reload = useCallback(async () => {
    if (!action) return;
    const ticket = ++live.current;
    setLoading(true);
    try {
      const result = await engageCall<T>(action, { query, workspaceId });
      if (ticket === live.current) { setData(result); setError(null); }
    } catch (cause) {
      if (ticket === live.current) setError(cause);
    } finally {
      if (ticket === live.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => { void reload(); }, [reload]);
  return { data, error, loading, reload, setData };
}

/** A write that refreshes the view it came from; returns the answer or the refusal. */
export function useAction() {
  const { workspaceId } = useWorkspace();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const run = useCallback(async <T,>(action: string, body: unknown = {}, tag = action): Promise<T | null> => {
    setBusy(tag);
    setError(null);
    try {
      return await engageCall<T>(action, { method: 'POST', body, workspaceId, idempotencyKey: crypto.randomUUID() });
    } catch (cause) {
      setError(cause);
      return null;
    } finally {
      setBusy(null);
    }
  }, [workspaceId]);
  return { run, busy, error, clear: () => setError(null) };
}

const base = String(import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/+$/, '');
const anon = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? '');
/** A public read: with the session when there is one, otherwise without (no Authorization header). */
export async function publicGet<T>(action: string, query: Record<string, string>, signedIn: boolean): Promise<T> {
  if (signedIn) return await engageCall<T>(action, { query });
  const url = new URL(`${base}/functions/v1/schood-ai/engage/${action}`);
  for (const [name, value] of Object.entries(query)) url.searchParams.set(name, value);
  let response: Response;
  try {
    response = await fetch(url, { headers: { apikey: anon, 'x-schood-locale': document.documentElement.lang || 'en' } });
  } catch {
    throw new ApiError(0, 'network', 'Network error.');
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, typeof payload.code === 'string' ? payload.code : 'request_failed', String(payload.error ?? ''), payload);
  return payload as T;
}

// --- Shapes (snake_case, as sent) ------------------------------------------------------------
export interface Quest { key: string; target: number; progress: number; done: boolean; xp: number }
export interface Streak {
  current: number; longest: number; today_done: boolean; at_risk: boolean; freezes: number; max_freezes: number; next_freeze_in_xp: number | null;
  frozen_days: string[]; comeback: { status: 'open' | 'won' | 'lost'; old_streak: number; starts: string; ends: string; done: number; needed: number } | null;
  can_buy_freeze: boolean; freeze_credits: number;
}
export interface Settings {
  adult: boolean; age_known: boolean; time_zone: string; notify_hour: number; messages: 'all' | 'important' | 'none'; region: string | null; school: string | null;
  leaderboard: 'public' | 'masked' | 'hidden'; leaderboard_chosen: boolean; league_opt_out: boolean; daily_limit_minutes: number | null; limit_set_by: 'self' | 'parent' | null;
  offers_muted: boolean; level_band: string; locale: string;
}
export interface Task { id: string; title: string; link: string; tracked: boolean; target: number; progress: number; done: boolean }
export interface JourneyMine {
  id: string; key: string; title: string; status: string; started_on: string; target_date: string | null; weeks: number; chapter: number; completed: number; graduated: boolean;
  graduated_at: string | null; behind: boolean; at_risk: boolean; scheduled_end: string; done: number; total: number; chapter_title: string; chapter_focus: string; tasks: Task[];
}
export interface Goal { key: string; stage: string; title: string; lead: string; start: string; journey: string | null; status: 'open' | 'ready' | 'active' | 'done' | 'skipped'; done_by: string | null; verified: boolean; done_at: string | null; next: string[] }
export interface DateItem { id: string; kind: string; title: string; on_date: string; at_time: string | null; goal: string | null; done: boolean; result: string | null; days_left: number }
export interface Offer { key: string; plan: string; title: string; terms: string; path: string }
export interface LeagueBrief { joined: boolean; opted_out: boolean; tier: string; rank: number | null; size: number; xp: number; zone: string | null; last_week: { tier: string; rank: number | null; outcome: string | null; xp: number } | null }
export interface EngageState {
  today: string; xp: { total: number; week: number; today: number }; streak: Streak; first_step: boolean; quests: Quest[]; all_quests_xp: number;
  challenge: { key: string; target: number; progress: number; done: boolean; xp: number; ends_at: string }; weak_spot: string | null;
  league: LeagueBrief;
  wellbeing: { minutes_today: number; xp_today: number; xp_cap: number; enough_today: boolean; enough_minutes: number; daily_limit_minutes: number | null; limit_reached: boolean; limit_set_by: string | null };
  settings: Settings; journeys: JourneyMine[]; graduated: { key: string; title: string; graduated_at: string | null }[]; next_goal: Goal | null; path_started: boolean;
  dates: DateItem[]; season: { key: string; title: string; days_left: number }; squad: { id: string; name: string } | null; inbox: number;
}
export interface InboxMessage { id: string; kind: string; text: string; buttons: { label: string; path: string }[]; created_at: string }
export interface SampleView { id: string; kind: 'voice' | 'writing'; source: string; prompt: string | null; recorded_at: string; scores: Record<string, number>; metrics: Record<string, number>; duration_ms: number | null; text?: string; url?: string | null; shown?: boolean; item_id?: string | null }
export interface PassportItemView { id: string; kind: string; source: string; title: string; data: Record<string, unknown>; verify_url: string | null; verified: boolean; shown: boolean; issued_at: string | null }
export interface PassportLinkView { id: string; label: string; items: number; created_at: string; expires_at: string | null; revoked: boolean; expired: boolean; views: number; last_viewed_at: string | null }
export interface PassportOwn { passport: { display_name: string | null; headline: string | null }; items: PassportItemView[]; samples: SampleView[]; links: PassportLinkView[] }
