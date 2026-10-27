import { anonKey, edgeBase, supabase } from './supabase';

export type Json = Record<string, unknown>;

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly details: Json) {
    super(message);
  }
}

export type MeResponse = {
  user: { id: string; email: string | null; role?: string | null };
  entitlements: Array<{ resource_type: string; resource_id: string | null }>;
  admin?: { is_admin?: boolean; permissions?: string[] } | null;
};

export type CatalogEntry = {
  id: string;
  parent_page_id: string | null;
  slug: string;
  module_key: string | null;
  title: string;
  summary: string;
  page_type: string;
  visibility: string;
  sort_order: number;
  metadata: Json;
  published_at: string | null;
};

export type TemplateSummary = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  plan_type: string;
  duration_days: number;
  focus_section: string | null;
  intensity: string;
};

export type Catalog = {
  product_slug: string;
  exam: string;
  modules: CatalogEntry[];
  premium_guides: CatalogEntry[];
  plan_templates: TemplateSummary[];
};

export type Section = { id: string; block_type: string; heading: string | null; sort_order: number; content: Json; metadata: Json; status?: string };
export type PagePayload = { page: Json; sections: Section[]; child_pages: Json[]; sources: Json[] };

export type PlanItem = {
  id: string;
  user_plan_id: string | null;
  kind: 'module' | 'task';
  page_slug: string | null;
  title: string;
  week_number: number | null;
  due_date: string | null;
  status: 'todo' | 'done';
  done_at: string | null;
  sort_order: number;
  metadata: Json;
};

export type MyPlan = {
  plan: Json | null;
  plan_items: PlanItem[];
  module_items: PlanItem[];
  progress: { total: number; done: number; modules_total: number; modules_done: number };
};

export type Note = { id: string; page_id: string; section_id: string | null; anchor_text: string; body: string; color: string; created_at: string; updated_at: string; page?: Json | null };
export type ThreadMessage = { role: 'user' | 'assistant'; content: string; at: string; ai?: boolean };

const readJson = async (res: Response): Promise<Json> => {
  try {
    const body = await res.json();
    return body && typeof body === 'object' && !Array.isArray(body) ? (body as Json) : {};
  } catch {
    return {};
  }
};

const toError = (status: number, body: Json): ApiError =>
  new ApiError(status, String(body.code ?? (status === 401 ? 'auth_required' : status === 403 ? 'forbidden' : status === 404 ? 'not_found' : 'request_failed')), String(body.error ?? `Request failed (${status})`), body);

type Options = { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown; signal?: AbortSignal; token?: string | null };

/** One request. Signed-in calls retry once after a session refresh on 401. */
export const request = async <T>(path: string, options: Options = {}): Promise<T> => {
  const send = (token: string | null) =>
    fetch(`${edgeBase}${path}`, {
      method: options.method ?? 'GET',
      signal: options.signal,
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${token ?? anonKey}`,
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  let res = await send(options.token ?? null);
  if (res.status === 401 && options.token) {
    const refreshed = await supabase.auth.refreshSession().catch(() => null);
    const next = refreshed?.data.session?.access_token ?? null;
    if (next && next !== options.token) res = await send(next);
  }
  const body = await readJson(res);
  if (!res.ok) throw toError(res.status, body);
  return body as T;
};

export const createApi = (fn: string) => {
  const p = (path: string) => `/${fn}${path}`;
  const enc = encodeURIComponent;
  return {
    catalog: (signal?: AbortSignal) => request<Catalog>(p('/catalog'), { signal }),
    page: (slug: string, token: string | null, signal?: AbortSignal) => request<PagePayload>(p(`/pages/${enc(slug)}`), { token, signal }),
    pageMe: (slug: string, token: string) => request<{ completed_section_ids: string[]; module_item: PlanItem | null; plan_tasks: PlanItem[]; notes: Note[] }>(p(`/pages/${enc(slug)}/me`), { token }),
    sectionComplete: (slug: string, sectionId: string, done: boolean, token: string) =>
      request<{ ok: boolean }>(p(`/pages/${enc(slug)}/sections/${enc(sectionId)}/complete`), { method: 'POST', body: { done }, token }),
    sectionThread: (slug: string, sectionId: string, token: string) =>
      request<{ messages: ThreadMessage[] }>(p(`/pages/${enc(slug)}/sections/${enc(sectionId)}/thread`), { token }),
    sectionAsk: (slug: string, sectionId: string, message: string, token: string) =>
      request<{ ok: boolean; code?: string; messages: ThreadMessage[] }>(p(`/pages/${enc(slug)}/sections/${enc(sectionId)}/ask`), { method: 'POST', body: { message }, token }),
    dashboard: (token: string) => request<Json & MyPlan>(p('/dashboard'), { token }),
    profile: (token: string) => request<{ profile: Json }>(p('/profile'), { token }),
    saveProfile: (token: string, body: Json) => request<{ profile: Json; snapshot: Json | null; diagnostic_rerun: boolean }>(p('/profile'), { method: 'PATCH', body, token }),
    diagnostic: (token: string) => request<{ profile: Json; snapshot: Json | null }>(p('/diagnostic'), { token }),
    runDiagnostic: (token: string) => request<{ snapshot: Json }>(p('/diagnostic/run'), { method: 'POST', body: {}, token }),
    narrative: (token: string) => request<{ ok: boolean; code?: string; narrative?: Json }>(p('/diagnostic/narrative'), { method: 'POST', body: {}, token }),
    plan: (slug: string, token: string) => request<{ plan: Json; weeks: Json[]; schedule_preview: Json; adopted: MyPlan | null }>(p(`/plans/${enc(slug)}`), { token }),
    adoptPlan: (slug: string, token: string, body: Json) => request<MyPlan>(p(`/plans/${enc(slug)}/adopt`), { method: 'POST', body, token }),
    myPlan: (token: string) => request<MyPlan>(p('/my-plan'), { token }),
    addToPlan: (slug: string, token: string) => request<{ item: PlanItem; created: boolean }>(p('/my-plan/items'), { method: 'POST', body: { page_slug: slug }, token }),
    setItem: (id: string, status: 'todo' | 'done', token: string) => request<{ item: PlanItem }>(p(`/my-plan/items/${enc(id)}`), { method: 'PATCH', body: { status }, token }),
    removeItem: (id: string, token: string) => request<{ ok: boolean }>(p(`/my-plan/items/${enc(id)}`), { method: 'DELETE', token }),
    notes: (token: string) => request<{ notes: Note[] }>(p('/notes'), { token }),
    addNote: (token: string, body: Json) => request<{ note: Note }>(p('/notes'), { method: 'POST', body, token }),
    deleteNote: (id: string, token: string) => request<{ ok: boolean }>(p(`/notes/${enc(id)}`), { method: 'DELETE', token }),
    track: (body: Json, token: string | null) => request<{ ok: boolean }>(p('/events'), { method: 'POST', body, token }).catch(() => ({ ok: false })),
  };
};

export type PlaybookApi = ReturnType<typeof createApi>;

/** Admin authoring API (one function for both exams). */
export const createAdminApi = (exam: string) => {
  const p = (path: string, query = '') => `/admin-exam-playbook${path}?exam=${exam}${query}`;
  return {
    overview: (token: string) => request<Json>(p('/overview'), { token }),
    pages: (token: string) => request<{ pages: Json[] }>(p('/pages'), { token }),
    page: (id: string, token: string) => request<PagePayload & { source_ids: string[] }>(p(`/pages/${encodeURIComponent(id)}`), { token }),
    createPage: (token: string, body: Json) => request<{ page: Json }>(p('/pages'), { method: 'POST', body, token }),
    patchPage: (token: string, body: Json) => request<{ page: Json }>(p('/pages'), { method: 'PATCH', body, token }),
    createSection: (token: string, body: Json) => request<{ section: Json }>(p('/sections'), { method: 'POST', body, token }),
    patchSection: (token: string, body: Json) => request<{ section: Json }>(p('/sections'), { method: 'PATCH', body, token }),
    sources: (token: string) => request<{ sources: Json[] }>(p('/sources'), { token }),
    createSource: (token: string, body: Json) => request<{ source: Json }>(p('/sources'), { method: 'POST', body, token }),
    patchSource: (token: string, body: Json) => request<{ source: Json }>(p('/sources'), { method: 'PATCH', body, token }),
    templates: (token: string) => request<{ plan_templates: Json[] }>(p('/plan-templates'), { token }),
    createTemplate: (token: string, body: Json) => request<{ plan_template: Json }>(p('/plan-templates'), { method: 'POST', body, token }),
    patchTemplate: (token: string, body: Json) => request<{ plan_template: Json }>(p('/plan-templates'), { method: 'PATCH', body, token }),
    publish: (token: string, kind: string, id: string, published: boolean) => request<{ row: Json }>(p('/publish'), { method: 'POST', body: { kind, id, published }, token }),
    previewPage: (token: string, slug: string) => request<PagePayload>(p(`/preview/pages/${encodeURIComponent(slug)}`), { token }),
    previewDiagnostic: (token: string, profile: Json) => request<{ diagnostic: Json }>(p('/preview/diagnostic'), { method: 'POST', body: { profile }, token }),
    qa: (token: string) => request<Json>(p('/qa'), { token }),
    analytics: (token: string, days: number) => request<Json>(p('/analytics', `&days=${days}`), { token }),
  };
};

export type AdminApi = ReturnType<typeof createAdminApi>;

export const getMe = (token: string) => request<MeResponse>('/me', { token });
export const getEffective = (token: string) => request<{ effective_product_ids: string[] }>('/access-effective', { token });
