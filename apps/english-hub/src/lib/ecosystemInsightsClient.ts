import { edgeBase, supabase, supabaseAnonKey } from './supabase';

// Cross-skill insights client — wraps the new /hub/dashboard +
// /hub/insights/* endpoints powered by the english-ai + english-insights
// shared modules. Mirrors the auth/refresh pattern the existing hub plan
// client uses.

export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

export type EnglishSkillKey =
  | 'reading'
  | 'writing'
  | 'listening'
  | 'speaking'
  | 'grammar'
  | 'vocabulary'
  | 'immersion';

export interface CefrEstimate {
  skill: EnglishSkillKey;
  level: CefrLevel;
  numeric: number;
  confidence: 'low' | 'medium' | 'high';
  sample_count: number;
}

export interface CefrSnapshot {
  ok: boolean;
  estimates: CefrEstimate[];
  overall: { level: CefrLevel; numeric: number };
  generated_at: string;
}

export interface CrossSkillActivityDay {
  date: string;
  events: number;
  skills_touched: EnglishSkillKey[];
  minutes_estimate: number;
}

export interface CrossSkillActivity {
  ok: boolean;
  days: CrossSkillActivityDay[];
  streak: { current_days: number; longest_days: number; last_session_date: string | null };
  totals: { last_7_days: number; last_30_days: number; all_time: number };
}

export interface UnifiedMistakeRow {
  service: EnglishSkillKey;
  pattern: string;
  count: number;
  last_seen_at: string;
}

export interface CoachInsight {
  type: 'progress' | 'risk' | 'recommendation' | 'celebration' | string;
  title: string;
  body: string;
  action_label: string;
  action_route: string;
}

export interface CoachSummary {
  ok: boolean;
  ai_available: boolean;
  ai_status: 'ok' | 'unconfigured' | 'failed';
  ai_provider: 'openai' | 'anthropic' | 'google';
  ai_error: string | null;
  summary: string;
  insights: CoachInsight[];
  generated_at: string;
}

export interface EcosystemDashboard {
  ok: boolean;
  cefr: CefrSnapshot | null;
  activity: CrossSkillActivity | null;
  mistakes: UnifiedMistakeRow[];
  plan: unknown;
}

const resolveLatestAccessToken = async (): Promise<string | null> => {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
};

const runEdgeGet = (url: string, accessToken: string): Promise<Response> =>
  fetch(url, {
    method: 'GET',
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });

const callEdge = async <T>(path: string, accessToken: string): Promise<T> => {
  const url = `${edgeBase}${path}`;
  const primaryToken = accessToken.trim();
  let res = await runEdgeGet(url, primaryToken);
  if (res.status === 401) {
    const latest = (await resolveLatestAccessToken())?.trim() ?? '';
    if (latest && latest !== primaryToken) {
      res = await runEdgeGet(url, latest);
    }
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`${path} failed (${res.status}): ${text.slice(0, 200)}`);
    (err as { status?: number }).status = res.status;
    throw err;
  }
  return (await res.json()) as T;
};

export const getEcosystemDashboard = (
  accessToken: string,
  languageCode: string = 'en',
): Promise<EcosystemDashboard> =>
  callEdge<EcosystemDashboard>(
    `/hub/dashboard?language_code=${encodeURIComponent(languageCode)}`,
    accessToken,
  );

export const getCoachSummary = (
  accessToken: string,
  languageCode: string = 'en',
): Promise<CoachSummary> =>
  callEdge<CoachSummary>(
    `/hub/insights/coach-summary?language_code=${encodeURIComponent(languageCode)}`,
    accessToken,
  );
