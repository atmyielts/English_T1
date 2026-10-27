import type { SatDifficulty, SatDomain, SatSectionType } from '@schood/sat-core';
import type { OfficialDomain } from './content';
import { supabase } from './supabase';
import { pendingStart, startActor, startSelection } from './start-requests';

export type Json = Record<string, unknown>;

export type MeResponse = {
  user: { id: string; email: string | null; role?: string | null };
  admin?: { permissions?: string[] } | null;
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
  task_type: 'drill' | 'notebook_review' | 'half_mock' | 'tutor_session' | 'module';
  payload: Json;
  status: string;
  estimated_minutes: number;
  completed_at?: string | null;
};
export type PlanProgress = { completed: number; total: number; minutes_planned: number; minutes_completed: number };
export type PlanWeek = { week_start: string; week_end: string; today: string; generated: boolean; items: PlanItem[]; today_items: PlanItem[]; progress: PlanProgress; goals?: SatGoals; goals_set?: boolean };
export type QuestionStatus = 'unseen' | 'missed' | 'correct';
export type SkillStat = { skill: string; bank: number; answered: number; correct: number; accuracy: number | null };
export type DomainStat = { official_domain: OfficialDomain; section_type: SatSectionType; bank: number; answered: number; correct: number; accuracy: number | null; skills: SkillStat[] };
export type ScoreImpact = { status: 'ok' | 'insufficient_data'; conservative: number | null; optimistic: number | null; min_answers: number; answered_total: number;
  domains: Array<{ official_domain: OfficialDomain; answered: number; accuracy: number; points_low: number; points_high: number }>; label?: string };
export type OfficialMastery = { official_domain: OfficialDomain; section_type: SatSectionType; attempts: number; mastery_level: number | null };
export type Facets = { total: number; section_type: Record<string, number>; official_domain: Record<string, number>; skill: Record<string, number>;
  difficulty: Record<string, number>; format: Record<string, number>; status: Record<string, number> };
export type Selection = { requested?: number; available?: number; widened?: string[]; time_limit_seconds?: number };

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
  official_domain?: OfficialDomain;
  skill?: string | null;
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
  goals_set: boolean;
  mastery: MasteryRow[];
  official_mastery: OfficialMastery[];
  insights: { domains: DomainStat[]; totals: { bank: number; answered: number; correct: number } };
  plan_items: PlanItem[];
  plan_week: { week_start: string; week_end: string; progress: PlanProgress };
  notebook: NotebookItem[];
  activity: ActivitySummary;
  mastery_percent: number | null;
  score_impact: ScoreImpact;
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
  scored_at?: string | null;
};
export type Timing = { elapsed_seconds: number; counted_seconds: number; study_minutes: number; time_limit_seconds: number | null };
export type StartResponse = { attempt: Attempt; questions: SatQuestion[]; selection?: Selection };

export type TutorResponse<T = Json> = {
  ok: boolean;
  ai_status: 'ok' | 'unconfigured' | 'failed';
  data: T;
  error?: string;
  request_id?: string;
  quota?: TutorQuota | null;
  mode?: TutorMode;
  attempt_id?: string;
  question_id?: string;
};
export type TutorMode = 'explain' | 'simpler' | 'similar' | 'why-wrong';
export type TutorQuota = { api_version: number; used: number; limit: number; remaining: number; enabled: boolean; attempts_remaining: number };
export type TutorFeedback = { steps: string[]; key_concept: string; why_distractors_wrong: Record<string, string>;
  similar_question?: { prompt: string; choices: { id: string; text: string }[]; correct_choice: string; explanation: string } };
export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) { super(message); }
}

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
  opts?: { method?: 'GET' | 'POST' | 'PATCH'; body?: unknown; timeoutMs?: number; actorId?: string },
): Promise<T> => {
  const assertActor = async () => {
    if (!opts?.actorId) return;
    const { data, error } = await supabase.auth.getSession();
    if (error || data.session?.user.id !== opts.actorId) throw new ApiError('Your account changed. Sign in and reopen your results.', 401, 'account_changed');
  };
  await assertActor();
  const method = opts?.method ?? 'GET';
  const send = (token: string) =>
    fetch(`${edgeBase}${path}`, {
      method,
      signal: method === 'GET' || opts?.timeoutMs != null
        ? AbortSignal.timeout(opts?.timeoutMs ?? 30000) : undefined,
      headers: headers(token, opts?.body != null),
      body: opts?.body != null ? JSON.stringify(opts.body) : undefined,
    });

  let res: Response;
  try { res = await send(accessToken); } catch (failure) {
    throw new ApiError(failure instanceof Error && failure.name === 'TimeoutError' ? 'The request timed out. Please retry.' : 'The connection failed. Please retry.', 0, 'network');
  }
  if (res.status === 401) {
    await readBody(res).catch(() => null);
    const refreshed = await supabase.auth.refreshSession().catch(() => null);
    const retryToken = refreshed?.data.session?.access_token ?? null;
    await assertActor();
    if (retryToken && retryToken !== accessToken && (!opts?.actorId || refreshed?.data.session?.user.id === opts.actorId)) {
      try { res = await send(retryToken); } catch { throw new ApiError('The connection failed. Please retry.', 0, 'network'); }
    }
  }

  if (!res.ok) {
    const details = await readBody(res);
    throw new ApiError(resolveApiErrorMessage(res.status, details), res.status,
      details && typeof details === 'object' && 'code' in details && typeof details.code === 'string' ? details.code : undefined);
  }
  const result = (await res.json()) as T;
  await assertActor();
  return result;
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

export const insightsGet = (accessToken: string): Promise<{ domains: DomainStat[]; score_impact: ScoreImpact; official_mastery: OfficialMastery[]; totals: { bank: number; answered: number; correct: number } }> =>
  call(accessToken, '/sat-practice/insights');

export type BankParams = Partial<{
  section_type: SatSectionType; official_domain: OfficialDomain; skill: string; difficulty: SatDifficulty;
  format: 'mcq' | 'spr'; status: QuestionStatus; limit: number; offset: number;
}>;
export const bankGet = (accessToken: string, opts?: BankParams): Promise<{ questions: SatQuestion[]; total: number; offset: number; limit: number; facets: Facets; history: Record<string, QuestionStatus> }> => {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(opts ?? {})) {
    if (value != null && value !== '') qs.set(key, String(value));
  }
  return call(accessToken, '/sat-practice/bank' + (qs.toString() ? '?' + qs.toString() : ''));
};

const starting = new Map<string, Promise<StartResponse>>();
const durableStart = async (accessToken: string, path: string, body: Record<string, unknown>) => {
  const actor = startActor(accessToken), selection = startSelection(path, body), key = actor + ':' + selection;
  const existing = starting.get(key);
  if (existing) return existing;
  let storage: Storage;
  try { storage = sessionStorage; } catch { throw new ApiError('Enable browser storage before starting a drill, then retry.', 0, 'storage'); }
  const requestId = pendingStart(storage, actor, selection);
  const promise = call<StartResponse>(accessToken, path, {
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
    official_domain: OfficialDomain;
    skill: string;
    format: 'mcq' | 'spr';
    status: QuestionStatus;
    mode: 'bank';
    difficulty: SatDifficulty;
    question_count: number;
    question_ids: string[];
    mistake_history: string;
  }>,
): Promise<StartResponse> =>
  durableStart(accessToken, '/sat-practice/attempts/start', body);

export const moduleStart = (accessToken: string, body: { section: 'math' | 'reading_writing'; profile: 'standard' | 'harder' }): Promise<StartResponse> =>
  durableStart(accessToken, '/sat-practice/modules/start', body);

export const planItemStart = (accessToken: string, itemId: string): Promise<StartResponse & { completed?: boolean }> =>
  durableStart(accessToken, '/sat-practice/plans/items/' + encodeURIComponent(itemId) + '/start', {}) as Promise<StartResponse & { completed?: boolean }>;

export const attemptSubmit = (
  accessToken: string,
  body: { attempt_id: string; answers: Record<string, unknown> },
): Promise<{ attempt: Attempt; questions: SatQuestion[]; notebook: NotebookItem[]; timing?: Timing }> =>
  call(accessToken, '/sat-practice/attempts/submit', { method: 'POST', body, timeoutMs: 30000 });

export const attemptGet = (
  accessToken: string,
  attemptId: string,
): Promise<{ attempt: Attempt; questions: SatQuestion[]; legacy_result?: boolean; timing?: Timing }> =>
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
): Promise<StartResponse> =>
  durableStart(accessToken, `/sat-practice/notebook/${encodeURIComponent(id)}/retry`, {});

export const srsDueGet = (accessToken: string): Promise<{ items: Array<NotebookItem & { question: SatQuestion | null }> }> =>
  call(accessToken, '/sat-practice/srs/due');

export const plansTodayGet = (accessToken: string): Promise<{ items: PlanItem[] }> =>
  call(accessToken, '/sat-practice/plans/today');

export const plansWeekGet = (accessToken: string): Promise<PlanWeek> => call(accessToken, '/sat-practice/plans/week');

export const plansRegenerate = (accessToken: string): Promise<{ ok: boolean; items: PlanItem[]; week: PlanWeek }> =>
  call(accessToken, '/sat-practice/plans/regenerate', { method: 'POST', body: {} });

// Admin authoring (admin-sat-practice; the server enforces admin.products.manage).
export type AdminItem = { id: string; type: string; data: Json; metadata: Json; correct: Json | null; explanation: string | null };
export type AdminIssue = { index: number; slug: string | null; message: string };
export const adminItemsGet = (accessToken: string, params: { status?: string; domain?: string; q?: string; limit?: number; offset?: number }): Promise<{ total: number; items: AdminItem[] }> => {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value != null && value !== '') qs.set(key, String(value));
  return call(accessToken, '/admin-sat-practice/items?' + qs.toString());
};
export const adminImport = (accessToken: string, items: unknown[], status: 'draft' | 'published'): Promise<{ ok: boolean; inserted: number; updated: number; status: string; warnings: AdminIssue[] }> =>
  call(accessToken, '/admin-sat-practice/import', { method: 'POST', body: { items, status }, timeoutMs: 120000 });
export const adminSetStatus = (accessToken: string, ids: string[], status: 'draft' | 'published'): Promise<{ ok: boolean; changed: number }> =>
  call(accessToken, '/admin-sat-practice/items/status', { method: 'POST', body: { ids, status } });

export const tutorQuota = (accessToken: string, actorId: string): Promise<TutorQuota> =>
  call(accessToken, '/sat-practice/tutor/explain?action=quota', { actorId });
export const tutorGenerate = (accessToken: string, actorId: string, mode: TutorMode,
  body: { question_id: string; attempt_id: string; request_id: string }): Promise<TutorResponse<TutorFeedback>> =>
  call(accessToken, '/sat-practice/tutor/' + mode, { method: 'POST', body, timeoutMs: 60000, actorId });
export const tutorResult = (accessToken: string, actorId: string, mode: TutorMode, requestId: string): Promise<TutorResponse<TutorFeedback> & { status?: string }> =>
  call(accessToken, `/sat-practice/tutor/${mode}?action=result&request_id=${encodeURIComponent(requestId)}`, { actorId });
