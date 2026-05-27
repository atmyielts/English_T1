import { supabase } from './supabase';

type Json = Record<string, unknown>;

export type MeResponse = {
  user: { id: string; email: string | null; role?: string | null };
  entitlements: Array<{
    id: string;
    resource_type: string;
    resource_id: string | null;
    starts_at: string | null;
    ends_at: string | null;
    value: Json | null;
  }>;
};

export type AccessEffectiveResponse = {
  effective_product_ids: string[];
};

const getEnv = (key: 'VITE_SUPABASE_URL' | 'VITE_SUPABASE_ANON_KEY'): string => {
  const value = import.meta.env[key] as string | undefined;
  if (!value) throw new Error(`Missing ${key}`);
  return value;
};

const supabaseUrl = getEnv('VITE_SUPABASE_URL').replace(/\/$/, '');
const supabaseAnonKey = getEnv('VITE_SUPABASE_ANON_KEY');
const edgeBase = `${supabaseUrl}/functions/v1`;

const authHeaders = (accessToken: string, jsonBody = false): HeadersInit => ({
  apikey: supabaseAnonKey,
  Authorization: `Bearer ${accessToken}`,
  ...(jsonBody ? { 'Content-Type': 'application/json' } : {}),
});

const publicHeaders = (jsonBody = false): HeadersInit => ({
  apikey: supabaseAnonKey,
  Authorization: `Bearer ${supabaseAnonKey}`,
  ...(jsonBody ? { 'Content-Type': 'application/json' } : {}),
});

const readBody = async (res: Response): Promise<unknown> => {
  const type = res.headers.get('content-type') ?? '';
  if (type.includes('application/json')) return res.json();
  return res.text();
};

const resolveApiError = (status: number, details: unknown): Error => {
  const message =
    typeof details === 'string'
      ? details
      : details && typeof details === 'object' && 'error' in details
        ? String((details as Record<string, unknown>).error ?? `Request failed (${status})`)
        : `Request failed (${status})`;
  const err = new Error(message);
  (err as Error & { status?: number; details?: unknown }).status = status;
  (err as Error & { status?: number; details?: unknown }).details = details;
  return err;
};

const callPublic = async <T>(path: string): Promise<T> => {
  const res = await fetch(`${edgeBase}${path}`, { headers: publicHeaders() });
  if (!res.ok) throw resolveApiError(res.status, await readBody(res));
  return (await res.json()) as T;
};

const callAuthed = async <T>(
  accessToken: string,
  path: string,
  opts?: { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown },
): Promise<T> => {
  const method = opts?.method ?? 'GET';
  const send = (token: string) =>
    fetch(`${edgeBase}${path}`, {
      method,
      headers: authHeaders(token, opts?.body != null),
      body: opts?.body != null ? JSON.stringify(opts.body) : undefined,
    });

  let res = await send(accessToken);
  if (res.status === 401) {
    await readBody(res).catch(() => null);
    const refreshed = await supabase.auth.refreshSession().catch(() => null);
    const retryToken = refreshed?.data.session?.access_token ?? null;
    if (retryToken && retryToken !== accessToken) {
      res = await send(retryToken);
    }
  }

  if (!res.ok) throw resolveApiError(res.status, await readBody(res));
  return (await res.json()) as T;
};

export const getMe = (accessToken: string): Promise<MeResponse> => callAuthed(accessToken, '/me');
export const getAccessEffective = (accessToken: string): Promise<AccessEffectiveResponse> =>
  callAuthed(accessToken, '/access-effective');

// ----- SAT Playbook endpoints --------------------------------------------

export type SatPlaybookCatalog = {
  product_slug: string;
  modules: Array<{
    id: string;
    slug: string;
    module_key: string | null;
    title: string;
    summary: string;
    sort_order: number;
    metadata: Json;
    published_at: string | null;
  }>;
  premium_guides: Array<{
    id: string;
    parent_page_id: string | null;
    module_key: string | null;
    slug: string;
    title: string;
    summary: string;
    page_type: string;
    published_at: string | null;
  }>;
};

export type SatPlaybookPagePayload = {
  page: Json;
  sections: Json[];
  child_pages: Json[];
  sources: Json[];
};

export const satPlaybookCatalogGet = (): Promise<SatPlaybookCatalog> =>
  callPublic('/sat-playbook/catalog');

export const satPlaybookPageGet = (slug: string, accessToken?: string | null): Promise<SatPlaybookPagePayload> =>
  accessToken
    ? callAuthed(accessToken, `/sat-playbook/pages/${encodeURIComponent(slug)}`)
    : callPublic(`/sat-playbook/pages/${encodeURIComponent(slug)}`);

export const satPlaybookDashboardGet = (accessToken: string): Promise<Json> =>
  callAuthed(accessToken, '/sat-playbook/dashboard');

export const satPlaybookProfileGet = (accessToken: string): Promise<{ profile: Json }> =>
  callAuthed(accessToken, '/sat-playbook/profile');

export const satPlaybookProfilePatch = (accessToken: string, body: Json): Promise<{ ok: boolean; profile: Json }> =>
  callAuthed(accessToken, '/sat-playbook/profile', { method: 'PATCH', body });

export const satPlaybookRecommendationGenerate = (
  accessToken: string,
  body: Json,
): Promise<{ ok: boolean; snapshot: Json; recommendation: Json }> =>
  callAuthed(accessToken, '/sat-playbook/recommendations/generate', { method: 'POST', body });

export const satPlaybookPlanGet = (
  accessToken: string,
  slug: string,
): Promise<{ plan: Json; latest_recommendation: Json | null }> =>
  callAuthed(accessToken, `/sat-playbook/plans/${encodeURIComponent(slug)}`);

export const satPlaybookTrackEvent = (body: Json, accessToken?: string | null): Promise<{ ok: boolean }> =>
  accessToken
    ? callAuthed(accessToken, '/sat-playbook/events', { method: 'POST', body })
    : (async () => {
        const res = await fetch(`${edgeBase}/sat-playbook/events`, {
          method: 'POST',
          headers: publicHeaders(true),
          body: JSON.stringify(body),
        });
        if (!res.ok) throw resolveApiError(res.status, await readBody(res));
        return (await res.json()) as { ok: boolean };
      })();
