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
    // Ignore and fall through.
  }

  try {
    const { data, error } = await supabase.auth.refreshSession();
    if (!error && data.session?.access_token) return data.session.access_token;
  } catch {
    // Ignore and let the caller surface the failure.
  }

  return null;
};

export type HubPlanTask = {
  id: string;
  recommendation_id?: string | null;
  service_key: string;
  service_label: string;
  title: string;
  reason: string;
  intent: string;
  skill: string;
  estimated_minutes: number;
  href: string | null;
  content_item_id?: string | null;
};

export type HubPlanSnapshot = {
  generated_at?: string;
  scope?: {
    user_id?: string;
    language_id?: string;
    minutes_budget?: number;
    plan_date?: string;
  } | null;
  urgent_reviews?: {
    vocabulary_due_count?: number;
  } | null;
  weakest_skills?: Array<{
    service_key: string;
    label: string;
    score: number;
    gap: number;
  }>;
  suggested_focus?: string[];
  focus_story?: string;
  transfer_context?: string;
  priority_tone?: string;
  celebration_level?: string;
  carryover_tasks?: HubPlanTask[];
  today_plan?: {
    plan_date?: string;
    minutes_budget?: number;
    total_estimated_minutes?: number;
    tasks?: HubPlanTask[];
  } | null;
};

export const getHubPlan = async (
  accessToken: string,
  query: { languageCode?: string; rebuild?: boolean } = {},
): Promise<HubPlanSnapshot> => {
  const params = new URLSearchParams();
  params.set('language_code', query.languageCode ?? 'en');
  if (query.rebuild) params.set('rebuild', '1');
  const url = `${edgeBase}/hub/plan?${params.toString()}`;
  const primaryToken = accessToken.trim();

  let res = await runEdgeGet(url, primaryToken);
  if (res.status === 401) {
    const latestToken = (await resolveLatestAccessToken())?.trim() ?? '';
    if (latestToken && latestToken !== primaryToken) {
      res = await runEdgeGet(url, latestToken);
    }
  }

  if (!res.ok) {
    const details = await readJsonOrText(res);
    const err = new Error(`hub plan failed (${res.status}): ${JSON.stringify(details)}`);
    (err as { status?: number }).status = res.status;
    throw err;
  }

  return (await readJsonOrText(res)) as HubPlanSnapshot;
};
