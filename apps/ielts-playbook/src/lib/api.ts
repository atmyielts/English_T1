type Json = Record<string, unknown> | unknown[];

export type MeResponse = {
  user: { id: string; email: string | null; role?: string | null };
  entitlements: Array<{
    id: string;
    resource_type: string;
    resource_id: string | null;
    starts_at: string | null;
    ends_at: string | null;
    value?: Json | null;
  }>;
  admin?: {
    is_admin: boolean;
    permissions: string[];
    session_aal: string | null;
  } | null;
};

export type AccessEffectiveResponse = {
  effective_product_ids: string[];
};

export type PlaybookCatalog = {
  product_slug: string;
  modules: Array<{
    id: string;
    slug: string;
    module_key: string | null;
    title: string;
    summary: string;
    sort_order: number;
    metadata: Record<string, unknown>;
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

export type PlaybookPagePayload = {
  page: Record<string, unknown>;
  sections: Array<Record<string, unknown>>;
  child_pages: Array<Record<string, unknown>>;
  sources: Array<Record<string, unknown>>;
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
  const error = new Error(message);
  (error as Error & { status?: number; details?: unknown }).status = status;
  (error as Error & { status?: number; details?: unknown }).details = details;
  return error;
};

const callPublic = async <T>(path: string): Promise<T> => {
  const res = await fetch(`${edgeBase}${path}`, { headers: publicHeaders() });
  if (!res.ok) throw resolveApiError(res.status, await readBody(res));
  return (await res.json()) as T;
};

const callAuthed = async <T>(
  accessToken: string,
  path: string,
  opts?: { method?: 'GET' | 'POST' | 'PATCH'; body?: unknown },
): Promise<T> => {
  const method = opts?.method ?? 'GET';
  const res = await fetch(`${edgeBase}${path}`, {
    method,
    headers: authHeaders(accessToken, opts?.body != null),
    body: opts?.body != null ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) throw resolveApiError(res.status, await readBody(res));
  return (await res.json()) as T;
};

export const getMe = (accessToken: string): Promise<MeResponse> => callAuthed(accessToken, '/me');
export const getAccessEffective = (accessToken: string): Promise<AccessEffectiveResponse> =>
  callAuthed(accessToken, '/access-effective');

export const playbookCatalogGet = (): Promise<PlaybookCatalog> => callPublic('/ielts-playbook/catalog');
export const playbookUpdatesGet = (): Promise<Record<string, unknown>> => callPublic('/ielts-playbook/updates');
export const playbookMarketGuidanceGet = (countryCode?: string, providerKey?: string): Promise<Record<string, unknown>> => {
  const qs = new URLSearchParams();
  if (countryCode) qs.set('country_code', countryCode);
  if (providerKey) qs.set('provider_key', providerKey);
  return callPublic(`/ielts-playbook/market-guidance${qs.toString() ? `?${qs.toString()}` : ''}`);
};
export const playbookPageGet = (slug: string, accessToken?: string | null): Promise<PlaybookPagePayload> =>
  accessToken
    ? callAuthed(accessToken, `/ielts-playbook/pages/${encodeURIComponent(slug)}`)
    : callPublic(`/ielts-playbook/pages/${encodeURIComponent(slug)}`);

export const playbookDashboardGet = (accessToken: string): Promise<Record<string, unknown>> =>
  callAuthed(accessToken, '/ielts-playbook/dashboard');

export const playbookProfileGet = (accessToken: string): Promise<{ profile: Record<string, unknown> }> =>
  callAuthed(accessToken, '/ielts-playbook/profile');

export const playbookProfilePatch = (
  accessToken: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; profile: Record<string, unknown> }> =>
  callAuthed(accessToken, '/ielts-playbook/profile', { method: 'PATCH', body });

export const playbookRecommendationGenerate = (
  accessToken: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; snapshot: Record<string, unknown>; recommendation: Record<string, unknown> }> =>
  callAuthed(accessToken, '/ielts-playbook/recommendations/generate', { method: 'POST', body });

export const playbookPlanGet = (
  accessToken: string,
  slug: string,
): Promise<{ plan: Record<string, unknown>; latest_recommendation: Record<string, unknown> | null }> =>
  callAuthed(accessToken, `/ielts-playbook/plans/${encodeURIComponent(slug)}`);

export const playbookTrackEvent = (
  body: Record<string, unknown>,
  accessToken?: string | null,
): Promise<{ ok: boolean }> =>
  accessToken
    ? callAuthed(accessToken, '/ielts-playbook/events', { method: 'POST', body })
    : (async () => {
        const res = await fetch(`${edgeBase}/ielts-playbook/events`, {
          method: 'POST',
          headers: publicHeaders(true),
          body: JSON.stringify(body),
        });
        if (!res.ok) throw resolveApiError(res.status, await readBody(res));
        return (await res.json()) as { ok: boolean };
      })();

export const adminPlaybookPagesList = (accessToken: string): Promise<{ pages: Record<string, unknown>[] }> =>
  callAuthed(accessToken, '/admin-ielts-playbook/pages');
export const adminPlaybookPageCreate = (accessToken: string, body: Record<string, unknown>) =>
  callAuthed<{ page: Record<string, unknown> }>(accessToken, '/admin-ielts-playbook/pages', { method: 'POST', body });
export const adminPlaybookPagePatch = (accessToken: string, body: Record<string, unknown>) =>
  callAuthed<{ page: Record<string, unknown> }>(accessToken, '/admin-ielts-playbook/pages', { method: 'PATCH', body });

export const adminPlaybookSectionsList = (accessToken: string, pageId?: string) => {
  const qs = new URLSearchParams();
  if (pageId) qs.set('page_id', pageId);
  return callAuthed<{ sections: Record<string, unknown>[] }>(accessToken, `/admin-ielts-playbook/sections${qs.toString() ? `?${qs.toString()}` : ''}`);
};
export const adminPlaybookSectionCreate = (accessToken: string, body: Record<string, unknown>) =>
  callAuthed<{ section: Record<string, unknown> }>(accessToken, '/admin-ielts-playbook/sections', { method: 'POST', body });
export const adminPlaybookSectionPatch = (accessToken: string, body: Record<string, unknown>) =>
  callAuthed<{ section: Record<string, unknown> }>(accessToken, '/admin-ielts-playbook/sections', { method: 'PATCH', body });

export const adminPlaybookSourcesList = (accessToken: string): Promise<{ sources: Record<string, unknown>[] }> =>
  callAuthed(accessToken, '/admin-ielts-playbook/sources');
export const adminPlaybookSourceCreate = (accessToken: string, body: Record<string, unknown>) =>
  callAuthed<{ source: Record<string, unknown> }>(accessToken, '/admin-ielts-playbook/sources', { method: 'POST', body });
export const adminPlaybookSourcePatch = (accessToken: string, body: Record<string, unknown>) =>
  callAuthed<{ source: Record<string, unknown> }>(accessToken, '/admin-ielts-playbook/sources', { method: 'PATCH', body });

export const adminPlaybookMarketsList = (accessToken: string): Promise<{ markets: Record<string, unknown>[] }> =>
  callAuthed(accessToken, '/admin-ielts-playbook/markets');
export const adminPlaybookMarketCreate = (accessToken: string, body: Record<string, unknown>) =>
  callAuthed<{ market: Record<string, unknown> }>(accessToken, '/admin-ielts-playbook/markets', { method: 'POST', body });
export const adminPlaybookMarketPatch = (accessToken: string, body: Record<string, unknown>) =>
  callAuthed<{ market: Record<string, unknown> }>(accessToken, '/admin-ielts-playbook/markets', { method: 'PATCH', body });

export const adminPlaybookPlanTemplatesList = (accessToken: string): Promise<{ plan_templates: Record<string, unknown>[] }> =>
  callAuthed(accessToken, '/admin-ielts-playbook/plan-templates');
export const adminPlaybookPlanTemplateCreate = (accessToken: string, body: Record<string, unknown>) =>
  callAuthed<{ plan_template: Record<string, unknown> }>(accessToken, '/admin-ielts-playbook/plan-templates', { method: 'POST', body });
export const adminPlaybookPlanTemplatePatch = (accessToken: string, body: Record<string, unknown>) =>
  callAuthed<{ plan_template: Record<string, unknown> }>(accessToken, '/admin-ielts-playbook/plan-templates', { method: 'PATCH', body });

export const adminPlaybookRulesList = (accessToken: string): Promise<{ rules: Record<string, unknown>[] }> =>
  callAuthed(accessToken, '/admin-ielts-playbook/rules');
export const adminPlaybookRulesPatch = (accessToken: string, body: Record<string, unknown>) =>
  callAuthed<{ ok: boolean; rules: Record<string, unknown>[] }>(accessToken, '/admin-ielts-playbook/rules', { method: 'PATCH', body });

export const adminPlaybookPreview = (accessToken: string, body: Record<string, unknown>) =>
  callAuthed<{ recommendation: Record<string, unknown> }>(accessToken, '/admin-ielts-playbook/preview', { method: 'POST', body });
export const adminPlaybookQa = (accessToken: string): Promise<Record<string, unknown>> =>
  callAuthed(accessToken, '/admin-ielts-playbook/qa');
export const adminPlaybookAnalytics = (accessToken: string, days = 30): Promise<Record<string, unknown>> =>
  callAuthed(accessToken, `/admin-ielts-playbook/analytics?days=${encodeURIComponent(String(days))}`);
