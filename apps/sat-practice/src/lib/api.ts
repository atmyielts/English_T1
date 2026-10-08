import type { SatDifficulty, SatDomain, SatSectionType } from '@schood/sat-core';
import { supabase } from './supabase';
import { pendingStart, startActor, startSelection } from './start-requests';

export type Json = Record<string, unknown>;

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

export type SatGoals = {
  user_id: string;
  target_score: number;
  test_date: string | null;
  hours_per_week: number;
  metadata: Json;
  updated_at: string;
};

export type SatQuestion = {
  id: string;
  type: string;
  data: Json;
  metadata: Json;
  section_type: SatSectionType;
  domain: SatDomain;
  difficulty: SatDifficulty;
  correct?: Json | null;
};

export type MasteryRow = {
  section_type: SatSectionType;
  domain: SatDomain;
  difficulty: SatDifficulty;
  attempts: number;
  rolling_accuracy: number | null;
  last_accuracy: number | null;
  mastery_status: string;
  mastery_level: number;
  last_practiced_at: string | null;
};

export type PlanItem = {
  id: string;
  scheduled_for: string;
  task_type: 'drill' | 'notebook_review' | 'half_mock' | 'tutor_session';
  payload: Json;
  status: string;
  estimated_minutes: number;
};

export type NotebookItem = {
  id: string;
  section_type: SatSectionType;
  domain: SatDomain;
  difficulty: SatDifficulty;
  source: string;
  question_id: string | null;
  reason_tag: string;
  mistake_pattern: string;
  coach_note: string | null;
  status: string;
  review_count: number;
  next_review_at: string | null;
  last_seen_at: string | null;
  created_at: string;
};

export type ActivitySummary = {
  streak_days: number;
  weekly_minutes: number;
  weekly_goal_minutes: number;
  xp_total: number;
  xp_week: number;
};

export type DashboardResponse = {
  goals: SatGoals;
  mastery: MasteryRow[];
  plan_items: PlanItem[];
  notebook: NotebookItem[];
  activity: ActivitySummary;
  mastery_percent: number;
  score_impact: { conservative: number; optimistic: number; label: string };
  plan_stale: boolean;
};

export type Attempt = {
  id: string;
  status: string;
  filters_used: Json;
  question_ids: string[];
  answers: Json;
  scored_items: Array<Json>;
  score_raw: number | null;
  score_accuracy: number | null;
  started_at: string;
  submitted_at: string | null;
};

export type TutorResponse<T = Json> = {
  ok: boolean;
  ai_status: 'ok' | 'unconfigured' | 'failed';
  data: T;
  error?: string;
};

const getEnv = (key: 'VITE_SUPABASE_URL' | 'VITE_SUPABASE_ANON_KEY'): string => {
  const value = import.meta.env[key] as string | undefined;
  if (!value) throw new Error(`Missing ${key}`);
  return value;
};

const supabaseUrl = getEnv('VITE_SUPABASE_URL').replace(/\/$/, '');
const supabaseAnonKey = getEnv('VITE_SUPABASE_ANON_KEY');
const edgeBase = `${supabaseUrl}/functions/v1`;

const headers = (accessToken: string, json = false): HeadersInit => ({
  apikey: supabaseAnonKey,
  Authorization: `Bearer ${accessToken}`,
  ...(json ? { 'Content-Type': 'application/json' } : {}),
});

const readBody = async (res: Response): Promise<unknown> => {
  const type = res.headers.get('content-type') ?? '';
  if (type.includes('application/json')) return res.json();
  return res.text();
};

const resolveApiErrorMessage = (status: number, details: unknown): string => {
  if (typeof details === 'string' && details.trim()) return details.trim();
  if (details && typeof details === 'object' && !Array.isArray(details)) {
    const payload = details as Record<string, unknown>;
    const error = typeof payload.error === 'string' ? payload.error : '';
    const message = typeof payload.message === 'string' ? payload.message : '';
    return error || message || `Request failed (${status}). Please try again.`;
  }
  return `Request failed (${status}). Please try again.`;
};

const call = async <T>(
  accessToken: string,
  path: string,
  opts?: { method?: 'GET' | 'POST' | 'PATCH'; body?: unknown; timeoutMs?: number },
): Promise<T> => {
  const method = opts?.method ?? 'GET';
  const send = (token: string) =>
    fetch(`${edgeBase}${path}`, {
      method,
      signal: method === 'GET' || opts?.timeoutMs != null
        ? AbortSignal.timeout(opts?.timeoutMs ?? 30000) : undefined,
      headers: headers(token, opts?.body != null),
      body: opts?.body != null ? JSON.stringify(opts.body) : undefined,
    });

  let res = await send(accessToken);
  if (res.status === 401) {
    await readBody(res).catch(() => null);
    const refreshed = await supabase.auth.refreshSession().catch(() => null);
    const retryToken = refreshed?.data.session?.access_token ?? null;
    if (retryToken && retryToken !== accessToken) res = await send(retryToken);
  }

  if (!res.ok) {
    const details = await readBody(res);
    throw new Error(resolveApiErrorMessage(res.status, details));
  }
  return (await res.json()) as T;
};

export const getMe = (accessToken: string): Promise<MeResponse> => call(accessToken, '/me');

export const getAccessEffective = (accessToken: string): Promise<AccessEffectiveResponse> =>
  call(accessToken, '/access-effective');

export const goalsGet = (accessToken: string): Promise<{ goals: SatGoals }> =>
  call(accessToken, '/sat-practice/goals');

export const goalsPatch = (
  accessToken: string,
  body: Partial<Pick<SatGoals, 'target_score' | 'test_date' | 'hours_per_week' | 'metadata'>>,
): Promise<{ ok: boolean; goals: SatGoals }> =>
  call(accessToken, '/sat-practice/goals', { method: 'PATCH', body });

export const dashboardGet = (accessToken: string): Promise<DashboardResponse> =>
  call(accessToken, '/sat-practice/dashboard');

export const masteryGet = (accessToken: string): Promise<{ mastery: MasteryRow[] }> =>
  call(accessToken, '/sat-practice/insights/mastery');

export const scoreImpactGet = (
  accessToken: string,
): Promise<{ conservative: number; optimistic: number; label: string }> =>
  call(accessToken, '/sat-practice/insights/score-impact');

export const bankGet = (
  accessToken: string,
  opts?: Partial<{
    section_type: SatSectionType;
    domain: SatDomain;
    difficulty: SatDifficulty;
    mistake_history: string;
    limit: number;
  }>,
): Promise<{ questions: SatQuestion[] }> => {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(opts ?? {})) {
    if (value != null && value !== '') qs.set(key, String(value));
  }
  return call(accessToken, `/sat-practice/bank${qs.toString() ? `?${qs.toString()}` : ''}`);
};

const starting = new Map<string, Promise<{ attempt: Attempt; questions: SatQuestion[] }>>();
const durableStart = async (accessToken: string, path: string, body: Record<string, unknown>) => {
  const actor = startActor(accessToken), selection = startSelection(path, body), key = actor + ':' + selection;
  const existing = starting.get(key);
  if (existing) return existing;
  let storage: Storage;
  try { storage = sessionStorage; } catch { throw new Error('Enable browser storage before starting a drill, then retry.'); }
  const requestId = pendingStart(storage, actor, selection);
  const promise = call<{ attempt: Attempt; questions: SatQuestion[] }>(accessToken, path, {
    method: 'POST', body: { ...body, request_id: requestId }, timeoutMs: 30000,
  }).finally(() => { if (starting.get(key) === promise) starting.delete(key); });
  // Retain the ID until Lab confirms the owned drill loaded. A reload between
  // the start response and navigation must also reopen the original attempt.
  starting.set(key, promise);
  return promise;
};

export const attemptStart = (
  accessToken: string,
  body: Partial<{
    section_type: SatSectionType;
    domain: SatDomain;
    difficulty: SatDifficulty;
    question_count: number;
    question_ids: string[];
    mistake_history: string;
  }>,
): Promise<{ attempt: Attempt; questions: SatQuestion[] }> =>
  durableStart(accessToken, '/sat-practice/attempts/start', body);

export const attemptSubmit = (
  accessToken: string,
  body: { attempt_id: string; answers: Record<string, unknown> },
): Promise<{ attempt: Attempt; questions: SatQuestion[]; notebook: NotebookItem[] }> =>
  call(accessToken, '/sat-practice/attempts/submit', { method: 'POST', body, timeoutMs: 30000 });

export const attemptGet = (
  accessToken: string,
  attemptId: string,
): Promise<{ attempt: Attempt; questions: SatQuestion[]; legacy_result?: boolean }> =>
  call(accessToken, `/sat-practice/attempts/${encodeURIComponent(attemptId)}`);

export const notebookGet = (accessToken: string): Promise<{ items: NotebookItem[] }> =>
  call(accessToken, '/sat-practice/notebook');

export const notebookPatch = (
  accessToken: string,
  id: string,
  body: Partial<Pick<NotebookItem, 'reason_tag' | 'status' | 'coach_note'>>,
): Promise<{ item: NotebookItem }> =>
  call(accessToken, `/sat-practice/notebook/${encodeURIComponent(id)}`, { method: 'PATCH', body });

export const notebookRetry = (
  accessToken: string,
  id: string,
): Promise<{ attempt: Attempt; questions: SatQuestion[] }> =>
  durableStart(accessToken, `/sat-practice/notebook/${encodeURIComponent(id)}/retry`, {});

export const srsDueGet = (accessToken: string): Promise<{ items: Array<NotebookItem & { question: SatQuestion | null }> }> =>
  call(accessToken, '/sat-practice/srs/due');

export const plansTodayGet = (accessToken: string): Promise<{ items: PlanItem[] }> =>
  call(accessToken, '/sat-practice/plans/today');

export const plansRegenerate = (accessToken: string): Promise<{ ok: boolean; items: PlanItem[] }> =>
  call(accessToken, '/sat-practice/plans/regenerate', { method: 'POST', body: {} });

export const tutorExplain = <T = Json>(
  accessToken: string,
  body: { question_id: string; user_answer?: unknown },
): Promise<TutorResponse<T>> =>
  call(accessToken, '/sat-practice/tutor/explain', { method: 'POST', body });

export const tutorSimpler = <T = Json>(accessToken: string, questionId: string): Promise<TutorResponse<T>> =>
  call(accessToken, '/sat-practice/tutor/simpler', { method: 'POST', body: { question_id: questionId } });

export const tutorSimilar = <T = Json>(accessToken: string, questionId: string): Promise<TutorResponse<T>> =>
  call(accessToken, '/sat-practice/tutor/similar', { method: 'POST', body: { question_id: questionId } });

export const tutorWhyWrong = <T = Json>(
  accessToken: string,
  body: { question_id: string; user_answer?: unknown },
): Promise<TutorResponse<T>> =>
  call(accessToken, '/sat-practice/tutor/why-wrong', { method: 'POST', body });
