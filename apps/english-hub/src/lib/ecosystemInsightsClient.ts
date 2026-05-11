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

// === New AI features (Tier B #12, #14) ===

export interface VocabInContextResponse {
  ok: boolean;
  ai_available: boolean;
  ai_status: 'ok' | 'unconfigured' | 'failed';
  ai_provider?: 'openai' | 'anthropic' | 'google';
  ai_error?: string | null;
  words: string[];
  passage: string;
  translations: Record<string, string>;
  topic: string | null;
  message?: string;
  generated_at?: string;
}

const callEdgePost = async <T>(path: string, accessToken: string, body: unknown): Promise<T> => {
  const url = `${edgeBase}${path}`;
  const primaryToken = accessToken.trim();
  const send = (token: string) =>
    fetch(url, {
      method: 'POST',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body ?? {}),
    });
  let res = await send(primaryToken);
  if (res.status === 401) {
    const latest = (await resolveLatestAccessToken())?.trim() ?? '';
    if (latest && latest !== primaryToken) res = await send(latest);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`${path} failed (${res.status}): ${text.slice(0, 200)}`);
    (err as { status?: number }).status = res.status;
    throw err;
  }
  return (await res.json()) as T;
};

export const generateVocabInContext = (
  accessToken: string,
  body: { words?: string[]; topic?: string } = {},
): Promise<VocabInContextResponse> =>
  callEdgePost<VocabInContextResponse>('/hub/ai/vocab-in-context', accessToken, body);

export interface GrammarDecodeResponse {
  ok: boolean;
  ai_available: boolean;
  ai_status: 'ok' | 'unconfigured' | 'failed';
  ai_provider?: 'openai' | 'anthropic' | 'google';
  ai_error?: string | null;
  sentence: string;
  clauses: Array<{ role: string; text: string; function: string }>;
  tense: string;
  voice: string;
  register: string;
  notes: string[];
  rephrasings: Array<{ text: string; why_different: string }>;
  generated_at?: string;
}

export const decodeGrammar = (
  accessToken: string,
  sentence: string,
): Promise<GrammarDecodeResponse> =>
  callEdgePost<GrammarDecodeResponse>('/hub/ai/grammar-decode', accessToken, { sentence });

// === Iter 3: essay grader, translation comparison, idiom explorer ===

export type CefrTargetLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

export interface EssayGradeResponse {
  ok: boolean;
  ai_available: boolean;
  ai_status: 'ok' | 'unconfigured' | 'failed';
  ai_provider?: 'openai' | 'anthropic' | 'google';
  ai_error?: string | null;
  target_level: CefrTargetLevel;
  word_count: number;
  overall_level: CefrTargetLevel | string;
  criteria: Record<'task' | 'coherence' | 'range' | 'accuracy', { level: string; comment: string }>;
  strengths: string[];
  improvements: string[];
  actionable_next_step: string;
  rewrite_sample: string;
  generated_at?: string;
}

export const gradeEssay = (
  accessToken: string,
  body: { text: string; target_level?: CefrTargetLevel; prompt?: string },
): Promise<EssayGradeResponse> =>
  callEdgePost<EssayGradeResponse>('/hub/ai/essay-grade', accessToken, body);

export interface TranslationCompareResponse {
  ok: boolean;
  ai_available: boolean;
  ai_status: 'ok' | 'unconfigured' | 'failed';
  ai_provider?: 'openai' | 'anthropic' | 'google';
  ai_error?: string | null;
  source_text: string;
  detected_language: string;
  translations: Array<{ text: string; register: string; style_note: string }>;
  nuance_summary: string;
  generated_at?: string;
}

export const compareTranslations = (
  accessToken: string,
  body: { source_text: string; source_language?: string },
): Promise<TranslationCompareResponse> =>
  callEdgePost<TranslationCompareResponse>('/hub/ai/translation-compare', accessToken, body);

export interface IdiomExtractResponse {
  ok: boolean;
  ai_available: boolean;
  ai_status: 'ok' | 'unconfigured' | 'failed';
  ai_provider?: 'openai' | 'anthropic' | 'google';
  ai_error?: string | null;
  target_level: CefrTargetLevel;
  source_text_length: number;
  idioms: Array<{ phrase: string; meaning: string; register: string; example: string }>;
  collocations: Array<{ phrase: string; type: string; meaning: string; example: string }>;
  cultural_notes: string[];
  generated_at?: string;
}

export const extractIdioms = (
  accessToken: string,
  body: { source_text: string; target_level?: CefrTargetLevel },
): Promise<IdiomExtractResponse> =>
  callEdgePost<IdiomExtractResponse>('/hub/ai/idiom-extract', accessToken, body);

// === Iter 4: dictation, daily challenge, cultural notes ===

export interface DictationGenerateResponse {
  ok: boolean;
  ai_available: boolean;
  ai_status: 'ok' | 'unconfigured' | 'failed';
  ai_provider?: 'openai' | 'anthropic' | 'google';
  ai_error?: string | null;
  target_level: CefrTargetLevel;
  topic: string | null;
  accent: string;
  speed: string;
  text: string;
  tricky_tokens: string[];
  comprehension_question: string;
  comprehension_answer: string;
  generated_at?: string;
}

export const generateDictation = (
  accessToken: string,
  body: { target_level?: CefrTargetLevel; topic?: string; accent?: string; speed?: string },
): Promise<DictationGenerateResponse> =>
  callEdgePost<DictationGenerateResponse>('/hub/ai/dictation/generate', accessToken, body);

export interface DailyChallengeTask {
  skill: 'reading' | 'writing' | 'listening' | 'speaking' | 'grammar' | 'vocabulary';
  label: string;
  instruction: string;
  estimated_minutes: number;
  route_hint: string;
}

export interface DailyChallengeResponse {
  ok: boolean;
  ai_available: boolean;
  ai_status: 'ok' | 'unconfigured' | 'failed';
  ai_provider?: 'openai' | 'anthropic' | 'google';
  ai_error?: string | null;
  theme: string;
  why_this_theme: string;
  tasks: DailyChallengeTask[];
  cefr_level: CefrLevel;
  minutes_budget: number;
  generated_at?: string;
}

export const generateDailyChallenge = (
  accessToken: string,
  body: { minutes_budget?: number } = {},
): Promise<DailyChallengeResponse> =>
  callEdgePost<DailyChallengeResponse>('/hub/ai/daily-challenge', accessToken, body);

export interface CulturalNotesResponse {
  ok: boolean;
  ai_available: boolean;
  ai_status: 'ok' | 'unconfigured' | 'failed';
  ai_provider?: 'openai' | 'anthropic' | 'google';
  ai_error?: string | null;
  cultural_references: string[];
  register_observations: string[];
  regional_variants: string[];
  tone_pitfalls: string[];
  generated_at?: string;
}

export const extractCulturalNotes = (
  accessToken: string,
  body: { source_text: string },
): Promise<CulturalNotesResponse> =>
  callEdgePost<CulturalNotesResponse>('/hub/ai/cultural-notes', accessToken, body);

// === Iter 5: goal templates, writing rubric calibration, themed week ===

export type EnglishGoalKey =
  | 'study_abroad'
  | 'business'
  | 'immigration'
  | 'academic'
  | 'conversational'
  | 'exam_prep';

export interface GoalTemplateResponse {
  ok: boolean;
  ai_available: boolean;
  ai_status: 'ok' | 'unconfigured' | 'failed';
  ai_provider?: 'openai' | 'anthropic' | 'google';
  ai_error?: string | null;
  goal: EnglishGoalKey;
  cefr_level: CefrLevel;
  horizon_weeks: number;
  minutes_per_day: number;
  plan_title: string;
  narrative: string;
  weekly_hours: Record<EnglishSkillKey, number>;
  priorities: Array<{ skill: EnglishSkillKey; why: string }>;
  skill_focus: Record<EnglishSkillKey, string>;
  recommended_routes: Array<{ label: string; route: string; why: string }>;
  success_criteria: string[];
  risks: string[];
  generated_at?: string;
}

export const generateGoalTemplate = (
  accessToken: string,
  body: { goal: EnglishGoalKey; horizon_weeks?: number; minutes_per_day?: number },
): Promise<GoalTemplateResponse> =>
  callEdgePost<GoalTemplateResponse>('/hub/ai/goal-templates', accessToken, body);

export interface RubricCalibrateResponse {
  ok: boolean;
  ai_available: boolean;
  ai_status: 'ok' | 'unconfigured' | 'failed';
  ai_provider?: 'openai' | 'anthropic' | 'google';
  ai_error?: string | null;
  prompt: string;
  lower_level: CefrTargetLevel;
  mid_level: CefrTargetLevel;
  upper_level: CefrTargetLevel;
  samples: Array<{
    level: CefrTargetLevel | string;
    word_count_target: number;
    text: string;
    examiner_note: string;
  }>;
  deltas: Array<{
    from_level: CefrTargetLevel | string;
    to_level: CefrTargetLevel | string;
    axes: { task: string; coherence: string; range: string; accuracy: string; register: string };
  }>;
  what_to_practise: string[];
  generated_at?: string;
}

export const calibrateWritingRubric = (
  accessToken: string,
  body: { prompt: string; lower_level?: CefrTargetLevel; mid_level?: CefrTargetLevel; upper_level?: CefrTargetLevel },
): Promise<RubricCalibrateResponse> =>
  callEdgePost<RubricCalibrateResponse>('/hub/ai/rubric-calibrate', accessToken, body);

export interface ThemedWeekDay {
  day_index: number;
  day_label: string;
  skill: 'reading' | 'writing' | 'listening' | 'speaking' | 'grammar' | 'vocabulary';
  activity_label: string;
  instruction: string;
  recycles_words: string[];
  route_hint: string;
}

export interface ThemedWeekResponse {
  ok: boolean;
  ai_available: boolean;
  ai_status: 'ok' | 'unconfigured' | 'failed';
  ai_provider?: 'openai' | 'anthropic' | 'google';
  ai_error?: string | null;
  theme: string;
  why_this_theme: string;
  cefr_level: CefrLevel;
  minutes_per_day: number;
  anchor_vocabulary: string[];
  days: ThemedWeekDay[];
  weekend_review: string;
  generated_at?: string;
}

export const generateThemedWeek = (
  accessToken: string,
  body: { theme?: string; minutes_per_day?: number } = {},
): Promise<ThemedWeekResponse> =>
  callEdgePost<ThemedWeekResponse>('/hub/ai/themed-week', accessToken, body);
