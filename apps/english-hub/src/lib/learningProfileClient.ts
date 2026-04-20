import { edgeBase, supabase, supabaseAnonKey } from './supabase';

const readJsonOrText = async (res: Response): Promise<unknown> => {
  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) return res.json();
  return res.text();
};

const runEdgeGet = async (url: string, accessToken: string): Promise<Response> =>
  fetch(url, {
    method: 'GET',
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });

const resolveLatestAccessToken = async (): Promise<string | null> => {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (!error && data.session?.access_token) return data.session.access_token;
  } catch {
    // Ignore and fall through to refresh attempt.
  }

  try {
    const { data, error } = await supabase.auth.refreshSession();
    if (!error && data.session?.access_token) return data.session.access_token;
  } catch {
    // Ignore: caller will handle final 401.
  }

  return null;
};

export type LearningProfileSnapshot = {
  generated_at?: string;
  scope?: {
    language_id?: string | null;
    language_code?: string | null;
    language_name?: string | null;
    product_id?: string | null;
  } | null;
  skill_profile?: Record<string, unknown> | null;
  language_profile?: Record<string, unknown> | null;
  service_breakdown?: Record<string, unknown> | null;
  skill_scores?: Record<string, number> | null;
  subskill_scores?: Record<string, unknown> | null;
  cefr_estimate?: string | null;
  target_cefr?: string | null;
  learner_goals?: string[];
  daily_time_preference_minutes?: number | null;
  mastery_summary?: Record<string, unknown> | null;
  recent_error_clusters?: Array<Record<string, unknown>>;
  recommendation_summary?: {
    active_count?: number;
    queue?: Array<Record<string, unknown>>;
  } | null;
  outcomes?: Array<Record<string, unknown>>;
};

export const getLearningProfileSnapshot = async (
  accessToken: string,
  query: { languageCode?: string; limit?: number; productId?: string } = {},
): Promise<LearningProfileSnapshot> => {
  const params = new URLSearchParams();
  params.set('language_code', query.languageCode ?? 'en');
  params.set('limit', String(query.limit ?? 40));
  if (query.productId) params.set('product_id', query.productId);
  const primaryUrl = `${edgeBase}/learning-profile-v3?${params.toString()}`;
  const fallbackUrl = `${edgeBase}/learning-profile-v2?${params.toString()}`;
  const primaryToken = accessToken.trim();

  let res = await runEdgeGet(primaryUrl, primaryToken);

  if (res.status === 401) {
    const latestToken = (await resolveLatestAccessToken())?.trim() ?? '';
    if (latestToken && latestToken !== primaryToken) {
      res = await runEdgeGet(primaryUrl, latestToken);
    }
  }

  if (res.status === 404) {
    res = await runEdgeGet(fallbackUrl, primaryToken);
  }

  if (!res.ok) {
    const details = await readJsonOrText(res);
    const err = new Error(`learning-profile failed (${res.status}): ${JSON.stringify(details)}`);
    (err as { status?: number }).status = res.status;
    throw err;
  }

  return (await readJsonOrText(res)) as LearningProfileSnapshot;
};
