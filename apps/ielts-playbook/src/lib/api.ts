import { supabase } from './supabase';

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
  opts?: { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown; fresh?: boolean },
): Promise<T> => {
  const method = opts?.method ?? 'GET';
  const send = (token: string) =>
    fetch(`${edgeBase}${path}`, {
      method,
      // Reads right after a change must not come from the short private cache.
      ...(opts?.fresh ? { cache: 'no-store' as RequestCache } : {}),
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

export const playbookCatalogGet = (): Promise<PlaybookCatalog> => callPublic('/ielts-playbook/catalog');
export const playbookUpdatesGet = (): Promise<Record<string, unknown>> => callPublic('/ielts-playbook/updates');
export const playbookMarketGuidanceGet = (
  countryCode?: string,
  providerKey?: string,
): Promise<{ market_guidance: PlaybookMarket; sources: Array<{ sort_order: number; source: Record<string, unknown> | null }> }> => {
  const qs = new URLSearchParams();
  if (countryCode) qs.set('country_code', countryCode);
  if (providerKey) qs.set('provider_key', providerKey);
  return callPublic(`/ielts-playbook/market-guidance${qs.toString() ? `?${qs.toString()}` : ''}`);
};
export const playbookPageGet = (slug: string, accessToken?: string | null): Promise<PlaybookPagePayload> =>
  accessToken
    ? callAuthed(accessToken, `/ielts-playbook/pages/${encodeURIComponent(slug)}`)
    : callPublic(`/ielts-playbook/pages/${encodeURIComponent(slug)}`);

export const playbookDashboardGet = (
  accessToken: string,
  opts?: { sessionId?: string | null },
): Promise<Record<string, unknown>> =>
  callAuthed(
    accessToken,
    `/ielts-playbook/dashboard${opts?.sessionId ? `?session_id=${encodeURIComponent(opts.sessionId)}` : ''}`,
    { fresh: true },
  );

export type ApiError = Error & { status?: number; details?: unknown };

export const apiErrorStatus = (error: unknown): number | null => {
  const status = (error as ApiError | null)?.status;
  return typeof status === 'number' ? status : null;
};

/** A locked premium page answers 401/403 with a teaser describing what is inside. */
export type PlaybookPageTeaser = {
  slug: string;
  title: string;
  summary: string;
  module_key: string | null;
  page_type: string | null;
  section_count: number;
  headings: string[];
};

export const pageTeaserFromError = (error: unknown): PlaybookPageTeaser | null => {
  const details = (error as ApiError | null)?.details;
  if (!details || typeof details !== 'object') return null;
  const teaser = (details as Record<string, unknown>).teaser;
  if (!teaser || typeof teaser !== 'object') return null;
  const row = teaser as Record<string, unknown>;
  return {
    slug: String(row.slug ?? ''),
    title: String(row.title ?? ''),
    summary: String(row.summary ?? ''),
    module_key: row.module_key ? String(row.module_key) : null,
    page_type: row.page_type ? String(row.page_type) : null,
    section_count: Number(row.section_count ?? 0) || 0,
    headings: Array.isArray(row.headings) ? row.headings.map((h) => String(h ?? '')).filter(Boolean) : [],
  };
};

export type PlaybookMarket = {
  id: string;
  country_code: string;
  provider_key: string;
  summary: string;
  ukvi_available: boolean;
  computer_available: boolean;
  writing_on_paper_available: boolean;
  one_skill_retake_available: boolean;
  result_timing_note: string | null;
  booking_url: string | null;
  verified_at: string | null;
  metadata: Record<string, unknown>;
};

export const playbookMarketsGet = (): Promise<{ markets: PlaybookMarket[] }> => callPublic('/ielts-playbook/markets');

export const playbookProfileGet = (
  accessToken: string,
  opts?: { fresh?: boolean },
): Promise<{ profile: Record<string, unknown> }> =>
  callAuthed(accessToken, '/ielts-playbook/profile', { fresh: opts?.fresh });

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

// AI strategy explainer — personalized walkthrough of a playbook strategy
// grounded in the user's recent mistakes on the matching question type.
export type PlaybookExplainResponse = {
  ok: boolean;
  ai_available: boolean;
  ai_status?: 'ok' | 'unconfigured' | 'failed';
  ai_error?: string | null;
  explanation: string;
  examples: Array<{ mistake_pattern: string; how_strategy_applies: string }>;
  recent_mistake_count?: number;
  generated_at: string;
};

export const playbookPageExplain = (
  accessToken: string,
  slug: string,
): Promise<PlaybookExplainResponse> =>
  callAuthed(accessToken, `/ielts-playbook/pages/${encodeURIComponent(slug)}/explain`, {
    method: 'POST',
    body: {},
  });

// --- Deep diagnostic: AI skills probe + synthesis + AI plan ---
export type SkillsProbePrompt = {
  section: 'reading' | 'listening' | 'writing' | 'speaking' | string;
  id: string;
  instruction: string;
  kind: string;
  passage_or_audio_transcript: string | null;
  options: string[] | null;
  expected_format: string | null;
};

export type SkillsProbeResponse = {
  ok: boolean;
  probe_id: string | null;
  ai_status?: 'ok' | 'unconfigured' | 'failed';
  ai_error?: string | null;
  prompts: SkillsProbePrompt[];
};

export const playbookProbeGenerate = (
  accessToken: string,
  body: { target_band?: number; self_assessment?: Record<string, unknown> },
): Promise<SkillsProbeResponse> =>
  callAuthed(accessToken, '/ielts-playbook/diagnostic/probe', { method: 'POST', body });

export type SkillsProbeGradeResponse = {
  ok: boolean;
  ai_status?: 'ok' | 'unconfigured' | 'failed';
  per_skill: Record<string, { band_estimate: number | null; reasoning: string }>;
  overall_band_estimate: number | null;
  confidence: 'low' | 'medium' | 'high' | string;
  notes: string;
};

export const playbookProbeGrade = (
  accessToken: string,
  probe_id: string,
  responses: Record<string, string | number>,
): Promise<SkillsProbeGradeResponse> =>
  callAuthed(accessToken, '/ielts-playbook/diagnostic/probe/grade', {
    method: 'POST',
    body: { probe_id, responses },
  });

export type DiagnosticSynthesisResponse = {
  ok: boolean;
  ai_status?: 'ok' | 'unconfigured' | 'failed';
  narrative: string;
  section_priority: string[];
  risks: Array<{ risk: string; severity: 'low' | 'medium' | 'high' | string; mitigation: string }>;
  weekly_hours_needed: number | null;
  feasibility: 'comfortable' | 'tight' | 'aggressive' | 'unrealistic' | string;
  generated_at: string;
};

export const playbookDiagnosticSynthesize = (
  accessToken: string,
): Promise<DiagnosticSynthesisResponse> =>
  callAuthed(accessToken, '/ielts-playbook/diagnostic/synthesize', { method: 'POST', body: {} });

export type PlanWeek = {
  week_number: number;
  theme: string;
  focus_sections: string[];
  hours: number;
  key_activities: string[];
  success_criteria: string;
  playbook_modules: string[];
};

export type PlanAiResponse = {
  ok: boolean;
  ai_status?: 'ok' | 'unconfigured' | 'failed';
  plan_slug: string;
  intro: string;
  weeks: PlanWeek[];
  weekly_hours: number;
  generated_at: string;
};

export const playbookPlanGenerateAi = (
  accessToken: string,
  slug: string,
  body: { weekly_hours: number; section_priority: string[] },
): Promise<PlanAiResponse> =>
  callAuthed(accessToken, `/ielts-playbook/plans/${encodeURIComponent(slug)}/generate-ai`, {
    method: 'POST',
    body,
  });

// --- Enrichments: drills, diagnostic, section chat, worked example, band-render, notes ---
export type PlaybookDrill = {
  id: string;
  prompt: string;
  options: string[];
  correct_index: number;
  explanation: string;
};
export type PlaybookDrillsResponse = {
  ok: boolean;
  ai_available: boolean;
  ai_status?: 'ok' | 'unconfigured' | 'failed';
  ai_error?: string | null;
  drills: PlaybookDrill[];
  question_type: string;
  generated_at: string;
};

export const playbookDrillsGenerate = (accessToken: string, slug: string): Promise<PlaybookDrillsResponse> =>
  callAuthed(accessToken, `/ielts-playbook/pages/${encodeURIComponent(slug)}/drills`, { method: 'POST', body: {} });

export const playbookDrillSubmit = (
  accessToken: string,
  slug: string,
  body: { drill_id: string; is_correct: boolean; response?: Record<string, unknown> },
): Promise<{ ok: boolean }> =>
  callAuthed(accessToken, `/ielts-playbook/pages/${encodeURIComponent(slug)}/drills/submit`, { method: 'POST', body });

export type PlaybookDiagnosticQuestion = {
  id: string;
  prompt: string;
  options: string[];
  correct_index: number;
  explanation: string;
};
export type PlaybookDiagnosticResponse = {
  ok: boolean;
  ai_available: boolean;
  ai_status?: 'ok' | 'unconfigured' | 'failed';
  questions: PlaybookDiagnosticQuestion[];
  generated_at: string;
};

export const playbookDiagnosticGenerate = (accessToken: string, slug: string): Promise<PlaybookDiagnosticResponse> =>
  callAuthed(accessToken, `/ielts-playbook/pages/${encodeURIComponent(slug)}/diagnostic`, { method: 'POST', body: {} });

export const playbookDiagnosticSubmit = (
  accessToken: string,
  slug: string,
  body: { score: number; total: number; detail?: Record<string, unknown> },
): Promise<{ ok: boolean; score: number; total: number; recommended_skip: boolean }> =>
  callAuthed(accessToken, `/ielts-playbook/pages/${encodeURIComponent(slug)}/diagnostic/submit`, { method: 'POST', body });

export type PlaybookThreadMessage = { role: 'user' | 'assistant'; content: string; at: string };
export type PlaybookSectionAskResponse = {
  ok: boolean;
  ai_status?: 'ok' | 'unconfigured' | 'failed';
  reply: string;
  messages: PlaybookThreadMessage[];
};

export const playbookSectionAsk = (
  accessToken: string,
  slug: string,
  sectionId: string,
  message: string,
): Promise<PlaybookSectionAskResponse> =>
  callAuthed(accessToken, `/ielts-playbook/pages/${encodeURIComponent(slug)}/sections/${encodeURIComponent(sectionId)}/ask`, {
    method: 'POST',
    body: { message },
  });

export const playbookSectionThreadGet = (
  accessToken: string,
  slug: string,
  sectionId: string,
): Promise<{ ok: boolean; messages: PlaybookThreadMessage[] }> =>
  callAuthed(accessToken, `/ielts-playbook/pages/${encodeURIComponent(slug)}/sections/${encodeURIComponent(sectionId)}/thread`);

export type PlaybookWorkedExampleStep = {
  reveal_label: string;
  explanation: string;
  evidence: string | null;
};
export type PlaybookWorkedExampleResponse = {
  ok: boolean;
  ai_available: boolean;
  ai_status?: 'ok' | 'unconfigured' | 'failed';
  setup: string;
  steps: PlaybookWorkedExampleStep[];
  generated_at: string;
};

export const playbookWorkedExampleGenerate = (
  accessToken: string,
  slug: string,
): Promise<PlaybookWorkedExampleResponse> =>
  callAuthed(accessToken, `/ielts-playbook/pages/${encodeURIComponent(slug)}/worked-example`, { method: 'POST', body: {} });

export type PlaybookBandRenderResponse = {
  ok: boolean;
  ai_available: boolean;
  ai_status?: 'ok' | 'unconfigured' | 'failed';
  target_band: number;
  framing: string;
  focus_points: string[];
  generated_at: string;
};

export const playbookBandRender = (
  accessToken: string,
  slug: string,
  target_band: number,
): Promise<PlaybookBandRenderResponse> =>
  callAuthed(accessToken, `/ielts-playbook/pages/${encodeURIComponent(slug)}/band-render`, {
    method: 'POST',
    body: { target_band },
  });

export type PlaybookNote = {
  id: string;
  page_id: string;
  section_id: string | null;
  anchor_text: string;
  body: string;
  color: string;
  updated_at: string;
  page?: { slug: string; title: string; module_key: string | null } | null;
};

export const playbookNotesList = (accessToken: string): Promise<{ ok: boolean; notes: PlaybookNote[] }> =>
  callAuthed(accessToken, '/ielts-playbook/notes');

export const playbookNoteCreate = (
  accessToken: string,
  body: { page_slug: string; section_id?: string | null; anchor_text: string; body: string; color?: string },
): Promise<{ ok: boolean; note: PlaybookNote }> =>
  callAuthed(accessToken, '/ielts-playbook/notes', { method: 'POST', body });

export const playbookNoteDelete = (accessToken: string, id: string): Promise<{ ok: boolean }> =>
  callAuthed(accessToken, `/ielts-playbook/notes/${encodeURIComponent(id)}`, { method: 'DELETE' });

// Track that the user opened a playbook module so the dashboard can show progress.
export const playbookModuleVisit = (
  accessToken: string,
  slug: string,
): Promise<{ ok: boolean; visited_modules: string[]; last_visited_slug: string }> =>
  callAuthed(accessToken, `/ielts-playbook/modules/${encodeURIComponent(slug)}/visit`, {
    method: 'POST',
    body: {},
  });

// Cross-app insights — same data the practice dashboard renders, called
// directly against the practice edge function so the playbook can mirror
// the band trajectory + activity + mastery without duplicating logic.
export type TrajectoryPoint = {
  date: string;
  source: 'mock' | 'lab';
  overall_band: number | null;
  reading: number | null;
  listening: number | null;
  writing: number | null;
  speaking: number | null;
};

export type BandPredictorEntry = {
  band: number | null;
  sample_count: number;
  confidence: 'low' | 'medium' | 'high';
};

export type PracticeTrajectoryResponse = {
  ok: boolean;
  series: TrajectoryPoint[];
  predictor: Record<string, BandPredictorEntry>;
};

export const practiceTrajectoryGet = (accessToken: string): Promise<PracticeTrajectoryResponse> =>
  callAuthed(accessToken, '/ielts-practice/insights/trajectory');

export type ActivityDay = { date: string; attempts: number; sections: string[]; minutes_estimate: number };
export type PracticeActivityResponse = {
  ok: boolean;
  days: ActivityDay[];
  streak: { current_days: number; longest_days: number; last_practice_date: string | null };
  totals: { last_7_days: number; last_30_days: number; all_time: number };
};

export const practiceActivityGet = (accessToken: string): Promise<PracticeActivityResponse> =>
  callAuthed(accessToken, '/ielts-practice/insights/activity');

export type MasteryRow = {
  question_type: string;
  section_type: string;
  mastery_level: number;
  mastery_status: string;
  last_accuracy: number | null;
  rolling_accuracy: number | null;
  attempts: number;
  last_practiced_at: string | null;
};

export type PracticeMasteryOverviewResponse = {
  ok: boolean;
  by_status: Record<string, MasteryRow[]>;
  recent_graduations: MasteryRow[];
  totals: { tracked: number; mastered: number; weak: number };
};

export const practiceMasteryOverviewGet = (
  accessToken: string,
): Promise<PracticeMasteryOverviewResponse> =>
  callAuthed(accessToken, '/ielts-practice/insights/mastery-overview');

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
