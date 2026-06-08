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
  admin?: {
    is_admin: boolean;
    permissions: string[];
    session_aal: string | null;
  } | null;
};

export type AccessEffectiveResponse = {
  effective_product_ids: string[];
};

export type PracticeGoal = {
  user_id: string;
  language_id: string;
  product_id: string;
  target_overall_band: number;
  target_section_bands: Json;
  target_date: string | null;
  practice_start_date: string;
  program_duration_days: number;
  daily_practice_minutes: number;
  timezone: string;
  focus_modes: string[];
  metadata: Json;
  updated_at: string;
};

export type PracticeExercise = {
  id: string;
  title: string;
  section_type: "reading" | "listening" | "writing";
  question_type: string;
  skill_tags: string[];
  difficulty_band_min: number;
  difficulty_band_max: number;
  estimated_minutes: number;
  payload_json: Json;
  status: string;
  metadata: Json;
  source_content_unit_id?: string | null;
  updated_at: string;
};

export type PracticeBlueprint = {
  id: string;
  title: string;
  section_type: "reading" | "listening" | "writing";
  source_product_id: string | null;
  source_experience_id: string | null;
  source_section_id: string | null;
  target_question_types: string[];
  estimated_minutes: number;
  status: string;
  experience_kind?: string | null;
  metadata: Json;
  latest_delivery_build_id: string | null;
};

export type PracticeDeliveryBuild = {
  id: string;
  blueprint_id: string;
  delivery_experience_id: string | null;
  source_product_id?: string | null;
  source_experience_id?: string | null;
  source_section_id?: string | null;
  status: string;
  experience_kind?: string | null;
  build_version: number;
  build_summary: Json;
  validation_summary: Json;
  metadata: Json;
  created_at?: string;
  updated_at?: string;
  blueprint?: PracticeBlueprint | null;
};

export type PracticeLabStep = Json & {
  id: string;
  kind?: string;
  title?: string;
  instructions?: string;
  question_type?: string;
  prompt?: string;
  options?: unknown[];
  response_shape?: Json;
  context?: Json;
  replay?: Json;
  evidence?: Json;
  distractors?: Json;
};

export type PracticeLabPayload = Json & {
  version?: string;
  lab_kind?: string;
  section_type?: "reading" | "listening" | "writing";
  experience_kind?: string;
  title?: string;
  coach_template?: Json;
  steps?: PracticeLabStep[];
  answer_key?: Json;
  feedback_rules?: Json;
  source_refs?: Json;
  validation?: Json;
};

export type PracticeLabAttempt = {
  id: string;
  practice_session_id: string;
  delivery_build_id: string | null;
  lab_kind: string;
  section_type: "reading" | "listening" | "writing";
  status: "in_progress" | "submitted" | "scored" | "abandoned";
  current_step_index: number;
  answers_json: Json;
  score_artifacts: Json;
  raw_score: number | null;
  max_score: number | null;
  accuracy_ratio: number | null;
  estimated_band: number | null;
  started_at: string | null;
  submitted_at: string | null;
  scored_at: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
};

export type PracticeNotebookItem = {
  id: string;
  section_type: "reading" | "listening" | "writing";
  question_type: string;
  trap_type: string;
  mistake_pattern: string;
  coach_note: string | null;
  review_count: number;
  status: string;
  priority: number;
  next_review_at: string | null;
  last_seen_at: string | null;
  metadata: Json;
  updated_at: string;
};

export type PracticeRoadmapItem = {
  id: string;
  section_type: "reading" | "listening" | "writing";
  skill_key: string;
  title: string;
  current_state: string | null;
  target_state: string | null;
  linked_lab_kind: string | null;
  priority: number;
  status: string;
  metadata: Json;
  updated_at: string;
};

export type PracticeSessionSummary = {
  id: string;
  session_id: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  metadata: Json;
  review_metadata: Json;
};

export type PracticePlanItem = {
  id: string;
  plan_date: string;
  section_type: "reading" | "listening" | "writing";
  exercise_id: string | null;
  blueprint_id?: string | null;
  delivery_build_id?: string | null;
  practice_session_id?: string | null;
  status: string;
  priority: number;
  rationale: string | null;
  rationale_json: Json;
  metadata: Json;
  attempt_id: string | null;
  exercise: PracticeExercise | null;
  blueprint?: PracticeBlueprint | null;
  delivery_build?: PracticeDeliveryBuild | null;
  practice_session?: PracticeSessionSummary | null;
};

export type PracticeAttempt = {
  id: string;
  exercise_id: string;
  plan_item_id: string | null;
  section_type: "reading" | "listening" | "writing";
  question_type: string;
  status: "started" | "submitted" | "scored" | "failed";
  answers_json: Json;
  score_artifacts: Json;
  raw_score: number | null;
  max_score: number | null;
  accuracy_ratio: number | null;
  estimated_band: number | null;
  writing_session_id: string | null;
  writing_evaluation_id: string | null;
  started_at: string;
  submitted_at: string | null;
  scored_at: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
};

export type PracticeRule = {
  id: string;
  rule_key: string;
  rule_name: string;
  description: string | null;
  status: string;
  weight: number;
  config: Json;
  updated_at: string;
};

export type PracticeSourceCatalogItem = {
  experience_id: string;
  experience_name: string;
  section_id: string;
  section_name: string;
  section_type: "reading" | "listening" | "writing";
  part_count: number;
  unit_count: number;
  question_count: number;
  question_types: string[];
  has_audio: boolean;
  has_passage: boolean;
  has_image: boolean;
};

const getEnv = (key: "VITE_SUPABASE_URL" | "VITE_SUPABASE_ANON_KEY"): string => {
  const value = import.meta.env[key] as string | undefined;
  if (!value) throw new Error(`Missing ${key}`);
  return value;
};

const supabaseUrl = getEnv("VITE_SUPABASE_URL").replace(/\/$/, "");
const supabaseAnonKey = getEnv("VITE_SUPABASE_ANON_KEY");
const edgeBase = `${supabaseUrl}/functions/v1`;

const headers = (accessToken: string, json = false): HeadersInit => ({
  apikey: supabaseAnonKey,
  Authorization: `Bearer ${accessToken}`,
  ...(json ? { "Content-Type": "application/json" } : {}),
});

const readBody = async (res: Response): Promise<unknown> => {
  const type = res.headers.get("content-type") ?? "";
  if (type.includes("application/json")) return res.json();
  return res.text();
};

const resolveApiErrorMessage = (status: number, details: unknown): string => {
  if (typeof details === "string" && details.trim().length > 0) {
    return details.trim();
  }

  if (details && typeof details === "object" && !Array.isArray(details)) {
    const payload = details as Record<string, unknown>;
    const error = typeof payload.error === "string" ? payload.error : "";
    const message = typeof payload.message === "string" ? payload.message : "";
    const hint = typeof payload.hint === "string" ? payload.hint : "";
    const base = error || message;
    if (base && hint) return `${base}. ${hint}`;
    if (base) return base;
    if (hint) return hint;
  }

  return `Request failed (${status}). Please try again.`;
};

const call = async <T>(
  accessToken: string,
  path: string,
  opts?: { method?: "GET" | "POST" | "PATCH"; body?: unknown },
): Promise<T> => {
  const method = opts?.method ?? "GET";
  const send = (token: string) =>
    fetch(`${edgeBase}${path}`, {
      method,
      headers: headers(token, opts?.body != null),
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

  if (!res.ok) {
    const details = await readBody(res);
    throw new Error(resolveApiErrorMessage(res.status, details));
  }
  return (await res.json()) as T;
};

export const getMe = (accessToken: string): Promise<MeResponse> => call<MeResponse>(accessToken, "/me");

export const getAccessEffective = (accessToken: string): Promise<AccessEffectiveResponse> =>
  call<AccessEffectiveResponse>(accessToken, "/access-effective");

export const learningProfileV2 = (
  accessToken: string,
  opts?: { productId?: string; languageCode?: string },
): Promise<{
  scope: { language_id: string | null; language_code: string | null };
  language_profile: Json | null;
  service_breakdown: Json | null;
}> => {
  const qs = new URLSearchParams();
  if (opts?.productId) qs.set("product_id", opts.productId);
  if (opts?.languageCode) qs.set("language_code", opts.languageCode);
  return call(accessToken, `/learning-profile-v2${qs.toString() ? `?${qs.toString()}` : ""}`);
};

export const practiceGoalsGet = (
  accessToken: string,
): Promise<{ scope: Json; goals: PracticeGoal }> =>
  call(accessToken, "/ielts-practice/goals");

export const practiceGoalsPatch = (
  accessToken: string,
  body: Partial<Pick<PracticeGoal, "target_overall_band" | "target_section_bands" | "target_date" | "practice_start_date" | "program_duration_days" | "daily_practice_minutes" | "timezone" | "focus_modes" | "metadata">>,
): Promise<{ ok: boolean; goals: PracticeGoal }> =>
  call(accessToken, "/ielts-practice/goals", { method: "PATCH", body });

export const practiceDiagnosticsGet = (
  accessToken: string,
  opts?: { refresh?: boolean },
): Promise<{
  scope: Json;
  goals: PracticeGoal;
  diagnostics_snapshot: {
    id: string;
    computed_at: string;
    snapshot_version: string;
    diagnostics: Json;
    source_summary: Json;
  } | null;
  refreshed: boolean;
}> => {
  const qs = new URLSearchParams();
  if (opts?.refresh) qs.set("refresh", "true");
  return call(accessToken, `/ielts-practice/diagnostics${qs.toString() ? `?${qs.toString()}` : ""}`);
};

export const practiceGeneratePlan = (
  accessToken: string,
  body?: { plan_date?: string; timezone?: string; daily_minutes?: number; daily_count?: number; refresh_diagnostics?: boolean },
): Promise<{
  ok: boolean;
  plan_date: string;
  generated_count: number;
  retained_count?: number;
  daily_practice_minutes?: number;
  quotas: Json;
  items: PracticePlanItem[];
}> => call(accessToken, "/ielts-practice/plans/generate", { method: "POST", body: body ?? {} });

export const practiceTodayPlan = (
  accessToken: string,
  opts?: { date?: string; timezone?: string },
): Promise<{ plan_date: string; items: PracticePlanItem[] }> => {
  const qs = new URLSearchParams();
  if (opts?.date) qs.set("date", opts.date);
  if (opts?.timezone) qs.set("timezone", opts.timezone);
  return call(accessToken, `/ielts-practice/plans/today${qs.toString() ? `?${qs.toString()}` : ""}`);
};

export const practiceDashboardGet = (
  accessToken: string,
  opts?: { date?: string; timezone?: string },
): Promise<{
  scope: Json;
  goals: PracticeGoal;
  diagnostics_snapshot: {
    id: string;
    computed_at: string;
    snapshot_version: string;
    diagnostics: Json;
    source_summary: Json;
  } | null;
  plan_date: string;
  items: PracticePlanItem[];
  notebook: PracticeNotebookItem[];
  roadmap: PracticeRoadmapItem[];
  plan_stale?: boolean;
}> => {
  const qs = new URLSearchParams();
  if (opts?.date) qs.set("date", opts.date);
  if (opts?.timezone) qs.set("timezone", opts.timezone);
  return call(accessToken, `/ielts-practice/dashboard${qs.toString() ? `?${qs.toString()}` : ""}`);
};

export const practicePlanItemStart = (
  accessToken: string,
  planItemId: string,
): Promise<{
  ok: boolean;
  resumed: boolean;
  practice_session: {
    id: string;
    session_id: string;
    status: string;
    metadata: Json;
  };
  blueprint: PracticeBlueprint | null;
  delivery_build: PracticeDeliveryBuild | null;
  session: {
    id: string;
    experience_id: string;
    status: string;
    metadata: Json | null;
  } | null;
  sections: Array<{ id: string; name: string; display_order: number; metadata: Json | null }>;
  first_section_id: string | null;
}> => call(accessToken, `/ielts-practice/plan-items/${encodeURIComponent(planItemId)}/start`, { method: "POST", body: {} });

export const practiceSessionGet = (
  accessToken: string,
  practiceSessionId: string,
): Promise<{
  ok: boolean;
  practice_session: {
    id: string;
    session_id: string;
    status: string;
    metadata: Json;
    review_metadata: Json;
  };
  blueprint: PracticeBlueprint | null;
  delivery_build: PracticeDeliveryBuild | null;
  session: {
    id: string;
    experience_id: string;
    status: string;
    metadata: Json | null;
    started_at: string | null;
    completed_at: string | null;
  } | null;
  sections: Array<{ id: string; name: string; display_order: number; metadata: Json | null }>;
  first_section_id: string | null;
  latest_outcome?: Json | null;
  evaluations?: Json | null;
}> => call(accessToken, `/ielts-practice/sessions/${encodeURIComponent(practiceSessionId)}`);

export const practiceSessionResultsGet = (
  accessToken: string,
  practiceSessionId: string,
): Promise<{
  ok: boolean;
  practice_session: Json;
  blueprint: PracticeBlueprint | null;
  delivery_build: PracticeDeliveryBuild | null;
  session: Json | null;
  sections: Json[];
  first_section_id: string | null;
  results: {
    outcome: Json | null;
    auto_evaluation: Json | null;
    ai_evaluation: Json | null;
  };
}> => call(accessToken, `/ielts-practice/sessions/${encodeURIComponent(practiceSessionId)}/results`);

export const practiceSessionResultsScore = (
  accessToken: string,
  practiceSessionId: string,
): Promise<{
  ok: boolean;
  practice_session: Json;
  blueprint: PracticeBlueprint | null;
  delivery_build: PracticeDeliveryBuild | null;
  session: Json | null;
  sections: Json[];
  first_section_id: string | null;
  scoring_refresh: {
    scoring: Json | null;
    mastery_updates: Json[];
    diagnostics_snapshot_id: string | null;
  } | null;
  results: {
    outcome: Json | null;
    auto_evaluation: Json | null;
    ai_evaluation: Json | null;
  };
}> => call(accessToken, `/ielts-practice/sessions/${encodeURIComponent(practiceSessionId)}/results`, { method: "POST", body: {} });

export const practiceSessionReviewGet = (
  accessToken: string,
  practiceSessionId: string,
): Promise<{
  ok: boolean;
  practice_session: Json;
  first_section_id: string | null;
  review: { first_section_id: string | null; section_count: number };
}> => call(accessToken, `/ielts-practice/sessions/${encodeURIComponent(practiceSessionId)}/review`);

export const practiceLabGet = (
  accessToken: string,
  practiceSessionId: string,
): Promise<{
  ok: boolean;
  practice_session: Json;
  blueprint: PracticeBlueprint | null;
  delivery_build: PracticeDeliveryBuild | null;
  lab: PracticeLabPayload;
  attempt: PracticeLabAttempt | null;
  notebook: PracticeNotebookItem[];
  roadmap: PracticeRoadmapItem[];
}> => call(accessToken, `/ielts-practice/labs/${encodeURIComponent(practiceSessionId)}`);

export const practiceLabSave = (
  accessToken: string,
  practiceSessionId: string,
  body: { answers: Json; current_step_index?: number; metadata?: Json },
): Promise<{ ok: boolean; attempt: PracticeLabAttempt }> =>
  call(accessToken, `/ielts-practice/labs/${encodeURIComponent(practiceSessionId)}/save`, { method: "POST", body });

export const practiceLabSubmit = (
  accessToken: string,
  practiceSessionId: string,
  body: { answers: Json; current_step_index?: number; metadata?: Json },
): Promise<{
  ok: boolean;
  lab_attempt: PracticeLabAttempt;
  score: { raw_score: number; max_score: number; accuracy_ratio: number; estimated_band: number };
  scored_steps: Json[];
  mastery_updates: Json[];
  notebook_items: PracticeNotebookItem[];
  roadmap_items: PracticeRoadmapItem[];
  diagnostics_snapshot_id: string | null;
}> => call(accessToken, `/ielts-practice/labs/${encodeURIComponent(practiceSessionId)}/submit`, { method: "POST", body });

export const practiceNotebookList = (
  accessToken: string,
): Promise<{ ok: boolean; items: PracticeNotebookItem[] }> =>
  call(accessToken, "/ielts-practice/notebook");

export const practiceNotebookPatch = (
  accessToken: string,
  notebookItemId: string,
  status: "active" | "reviewed" | "difficult" | "mastered" | "archived",
): Promise<{ ok: boolean; item: PracticeNotebookItem }> =>
  call(accessToken, `/ielts-practice/notebook/${encodeURIComponent(notebookItemId)}`, { method: "PATCH", body: { status } });

export const practiceRoadmapList = (
  accessToken: string,
  opts?: { refresh?: boolean },
): Promise<{ ok: boolean; items: PracticeRoadmapItem[] }> => {
  const qs = new URLSearchParams();
  if (opts?.refresh) qs.set("refresh", "true");
  return call(accessToken, `/ielts-practice/roadmap${qs.toString() ? `?${qs.toString()}` : ""}`);
};

export const practiceAttemptStart = (
  accessToken: string,
  body: { exercise_id?: string; plan_item_id?: string },
): Promise<{ ok: boolean; attempt: PracticeAttempt; exercise: PracticeExercise }> =>
  call(accessToken, "/ielts-practice/attempts/start", { method: "POST", body });

export const practiceAttemptSubmit = (
  accessToken: string,
  body: { attempt_id: string; answers: unknown; metadata?: Json; force?: boolean },
): Promise<{ ok: boolean; attempt: PracticeAttempt; exercise: PracticeExercise; signals_enqueued: number }> =>
  call(accessToken, "/ielts-practice/attempts/submit", { method: "POST", body });

export const practiceAttemptGet = (
  accessToken: string,
  attemptId: string,
): Promise<{ attempt: PracticeAttempt; exercise: PracticeExercise | null }> =>
  call(accessToken, `/ielts-practice/attempts/${encodeURIComponent(attemptId)}`);

export const adminPracticeExercisesList = (
  accessToken: string,
  opts?: { status?: string; section_type?: string; q?: string; limit?: number },
): Promise<{ exercises: PracticeExercise[] }> => {
  const qs = new URLSearchParams();
  if (opts?.status) qs.set("status", opts.status);
  if (opts?.section_type) qs.set("section_type", opts.section_type);
  if (opts?.q) qs.set("q", opts.q);
  if (typeof opts?.limit === "number") qs.set("limit", String(Math.floor(opts.limit)));
  return call(accessToken, `/admin-ielts-practice/exercises${qs.toString() ? `?${qs.toString()}` : ""}`);
};

export const adminPracticeSourcesList = (
  accessToken: string,
  opts?: { experience_id?: string; section_type?: string; limit?: number },
): Promise<{ sources: PracticeSourceCatalogItem[] }> => {
  const qs = new URLSearchParams();
  if (opts?.experience_id) qs.set("experience_id", opts.experience_id);
  if (opts?.section_type) qs.set("section_type", opts.section_type);
  if (typeof opts?.limit === "number") qs.set("limit", String(Math.floor(opts.limit)));
  return call(accessToken, `/admin-ielts-practice/sources${qs.toString() ? `?${qs.toString()}` : ""}`);
};

export const adminPracticeBlueprintsList = (
  accessToken: string,
  opts?: { status?: string },
): Promise<{ blueprints: Array<PracticeBlueprint & { latest_build: PracticeDeliveryBuild | null }> }> => {
  const qs = new URLSearchParams();
  if (opts?.status) qs.set("status", opts.status);
  return call(accessToken, `/admin-ielts-practice/blueprints${qs.toString() ? `?${qs.toString()}` : ""}`);
};

export const adminPracticeBlueprintCreate = (
  accessToken: string,
  body: {
    title?: string;
    source_section_id: string;
    target_question_types?: string[];
    experience_kind?: string;
    estimated_minutes?: number;
    status?: string;
    metadata?: Json;
  },
): Promise<{ blueprint: PracticeBlueprint }> =>
  call(accessToken, "/admin-ielts-practice/blueprints", { method: "POST", body });

export const adminPracticeBlueprintPatch = (
  accessToken: string,
  id: string,
  patch: Partial<PracticeBlueprint>,
): Promise<{ blueprint: PracticeBlueprint }> =>
  call(accessToken, "/admin-ielts-practice/blueprints", { method: "PATCH", body: { id, patch } });

export const adminPracticeBlueprintBuild = (
  accessToken: string,
  body: { blueprint_id: string; publish?: boolean },
): Promise<{ ok: boolean; build: PracticeDeliveryBuild }> =>
  call(accessToken, "/admin-ielts-practice/blueprints/build", { method: "POST", body });

export const adminPracticeBuildsList = (
  accessToken: string,
  opts?: { status?: string },
): Promise<{ builds: PracticeDeliveryBuild[] }> => {
  const qs = new URLSearchParams();
  if (opts?.status) qs.set("status", opts.status);
  return call(accessToken, `/admin-ielts-practice/builds${qs.toString() ? `?${qs.toString()}` : ""}`);
};

export const adminPracticeContentFactoryBuild = (
  accessToken: string,
  body?: {
    section_type?: string;
    experience_kind?: string;
    publish?: boolean;
    limit?: number;
    offset?: number;
    catalog_limit?: number;
  },
): Promise<{
  ok: boolean;
  publish: boolean;
  created: number;
  reused: number;
  built: number;
  failed: number;
  requested?: Json;
  processed_sources?: number;
  total_sources_with_questions?: number;
  next_offset?: number;
  has_more?: boolean;
  coverage: Json;
  results: Json[];
}> =>
  call(accessToken, "/admin-ielts-practice/content-factory/build", {
    method: "POST",
    body: body ?? { publish: true },
  });

export const adminPracticeExerciseCreate = (
  accessToken: string,
  body: Partial<PracticeExercise> & { title: string; section_type: string; question_type: string },
): Promise<{ exercise: PracticeExercise }> =>
  call(accessToken, "/admin-ielts-practice/exercises", { method: "POST", body });

export const adminPracticeExercisePatch = (
  accessToken: string,
  id: string,
  patch: Partial<PracticeExercise>,
): Promise<{ exercise: PracticeExercise }> =>
  call(accessToken, "/admin-ielts-practice/exercises", { method: "PATCH", body: { id, patch } });

export const adminPracticeImportFromSimulator = (
  accessToken: string,
  body: { experience_id?: string; section_type?: string; limit?: number; publish?: boolean },
): Promise<{ ok: boolean; imported: number; publish_mode: string }> =>
  call(accessToken, "/admin-ielts-practice/exercises/import-from-simulator", { method: "POST", body });

export const adminPracticeRulesList = (
  accessToken: string,
): Promise<{ rules: PracticeRule[] }> =>
  call(accessToken, "/admin-ielts-practice/rules");

export const adminPracticeRulesPatch = (
  accessToken: string,
  rules: Array<Partial<PracticeRule> & { rule_key: string }>,
): Promise<{ ok: boolean; rules: PracticeRule[] }> =>
  call(accessToken, "/admin-ielts-practice/rules", { method: "PATCH", body: { rules } });

export const adminPracticePreviewPlan = (
  accessToken: string,
  userId: string,
  count = 10,
): Promise<{ user_id: string; target_overall_band: number; preview_items: Array<Json> }> => {
  const qs = new URLSearchParams({ user_id: userId, count: String(count) });
  return call(accessToken, `/admin-ielts-practice/preview-plan?${qs.toString()}`);
};

export const adminPracticeAnalytics = (
  accessToken: string,
  days = 30,
): Promise<{
  window_days: number;
  totals: Json;
  by_section: Json[];
  by_question_type: Json[];
}> => {
  const qs = new URLSearchParams({ days: String(days) });
  return call(accessToken, `/admin-ielts-practice/analytics?${qs.toString()}`);
};

// ============================================================================
// Spaced Repetition (Leitner) for IELTS question types
// ============================================================================

export type SrsReviewItem = {
  id: string;
  user_id: string;
  language_id: string;
  product_id: string | null;
  section_type: "reading" | "listening" | "writing";
  question_type: string;
  leitner_box: number;
  next_review_at: string;
  last_reviewed_at: string | null;
  last_accuracy_ratio: number | null;
  rolling_accuracy_ratio: number | null;
  review_count: number;
  correct_count: number;
  incorrect_count: number;
  is_archived: boolean;
  metadata: Json;
  created_at: string;
  updated_at: string;
};

export type SrsListMode = "daily" | "upcoming" | "all" | "mastered";

export type SrsListResponse = {
  items: SrsReviewItem[];
  summary: { due: number; mastered: number; total: number };
};

export const srsListReviews = (
  accessToken: string,
  opts?: { mode?: SrsListMode; limit?: number; sectionType?: "reading" | "listening" | "writing" },
): Promise<SrsListResponse> => {
  const qs = new URLSearchParams();
  qs.set("mode", opts?.mode ?? "daily");
  if (typeof opts?.limit === "number") qs.set("limit", String(Math.floor(opts.limit)));
  if (opts?.sectionType) qs.set("section_type", opts.sectionType);
  return call(accessToken, `/ielts-srs?${qs.toString()}`);
};

export const srsSubmitReview = (
  accessToken: string,
  body: {
    question_type: string;
    accuracy_ratio: number;
    section_type?: "reading" | "listening" | "writing";
    product_id?: string;
  },
): Promise<{ ok: boolean; item: SrsReviewItem }> =>
  call(accessToken, "/ielts-srs", { method: "POST", body });

// Seed a question type into the SRS queue without recording a review. The new
// row is due immediately so it shows up on /practice/reviews. If the row
// already exists, this is a no-op.
export const srsAddToQueue = (
  accessToken: string,
  body: {
    question_type: string;
    section_type?: "reading" | "listening" | "writing";
    accuracy_ratio?: number;
    product_id?: string;
  },
): Promise<{ ok: boolean; item: SrsReviewItem }> =>
  call(accessToken, "/ielts-srs", {
    method: "POST",
    body: { ...body, accuracy_ratio: body.accuracy_ratio ?? 0, seed: true },
  });

export const srsBulkFromMastery = (
  accessToken: string,
  items: Array<{
    question_type: string;
    accuracy_ratio: number;
    section_type?: "reading" | "listening" | "writing";
  }>,
  productId?: string,
): Promise<{
  ok: boolean;
  results: Array<{ question_type: string; ok: boolean; box?: number; next_review_at?: string; error?: string }>;
}> =>
  call(accessToken, "/ielts-srs", {
    method: "POST",
    body: { items, ...(productId ? { product_id: productId } : {}) },
  });

export type PracticeCoachStep = {
  step_id: string;
  question_type: string;
  accuracy_ratio: number;
  what_went_wrong: string;
  correct_approach: string;
  trap_pattern: string;
  strategy_url: string;
};

export type PracticeCoachResponse = {
  ok: boolean;
  steps: PracticeCoachStep[];
  generated_at: string;
};

// Feature 1: AI feedback per attempt. Lazily fetched from the results page;
// returns concise per-question coaching for the worst-performing items in
// the latest lab attempt on this practice session.
export const practiceLabCoach = (
  accessToken: string,
  practiceSessionId: string,
  lang?: CoachLang,
): Promise<PracticeCoachResponse> =>
  call(accessToken, `/ielts-practice/labs/${encodeURIComponent(practiceSessionId)}/coach`, {
    method: "POST",
    body: lang ? { lang } : {},
  });

// ============================================================
// Insights endpoints — backing the dashboard's sophisticated UI
// ============================================================

export type TrajectoryPoint = {
  date: string;
  source: "mock" | "lab";
  overall_band: number | null;
  reading: number | null;
  listening: number | null;
  writing: number | null;
  speaking: number | null;
};

export type BandPredictorEntry = {
  band: number | null;
  sample_count: number;
  confidence: "low" | "medium" | "high";
};

export type PracticeTrajectoryResponse = {
  ok: boolean;
  series: TrajectoryPoint[];
  predictor: Record<string, BandPredictorEntry>;
  range: { from: string; to: string };
};

export const practiceTrajectoryGet = (accessToken: string): Promise<PracticeTrajectoryResponse> =>
  call(accessToken, "/ielts-practice/insights/trajectory");

export type ActivityDay = { date: string; attempts: number; sections: string[]; minutes_estimate: number };
export type PracticeActivityResponse = {
  ok: boolean;
  days: ActivityDay[];
  streak: { current_days: number; longest_days: number; last_practice_date: string | null };
  totals: { last_7_days: number; last_30_days: number; all_time: number };
};

export const practiceActivityGet = (accessToken: string): Promise<PracticeActivityResponse> =>
  call(accessToken, "/ielts-practice/insights/activity");

export type MasteryRow = {
  question_type: string;
  section_type: string;
  mastery_level: number;
  mastery_status: "new" | "weak" | "building" | "stable" | "mastered" | string;
  last_accuracy: number | null;
  rolling_accuracy: number | null;
  attempts: number;
  last_practiced_at: string | null;
};

export type TrapPatternRow = { trap_type: string; count: number; example_question_type: string | null };

export type PracticeMasteryOverviewResponse = {
  ok: boolean;
  by_status: Record<string, MasteryRow[]>;
  recent_graduations: MasteryRow[];
  trap_patterns: TrapPatternRow[];
  totals: { tracked: number; mastered: number; weak: number };
};

export const practiceMasteryOverviewGet = (
  accessToken: string,
): Promise<PracticeMasteryOverviewResponse> =>
  call(accessToken, "/ielts-practice/insights/mastery-overview");

export type PracticeNarrativeResponse = {
  ok: boolean;
  start_date: string;
  target_date: string | null;
  day_n: number;
  total_days: number | null;
  target_band: number;
  weeks_remaining: number | null;
  pace_label: "ahead" | "on_track" | "behind" | "unknown";
};

export const practiceNarrativeGet = (accessToken: string): Promise<PracticeNarrativeResponse> =>
  call(accessToken, "/ielts-practice/insights/plan-narrative");

export type ScoreImpactArea = {
  question_type: string;
  section_type: string;
  conservative: number;
  optimistic: number;
  rolling_accuracy: number | null;
  error_frequency: number;
};

export type ScoreImpactResponse = {
  ok: boolean;
  areas: ScoreImpactArea[];
  total: { conservative: number; optimistic: number };
  sample_size: number;
};

export const practiceScoreImpactGet = (accessToken: string): Promise<ScoreImpactResponse> =>
  call(accessToken, "/ielts-practice/insights/score-impact");

export type WritingAnnotation = {
  task_id: string;
  phrase: string;
  criterion: string;
  severity: "low" | "medium" | "high";
  comment: string;
};

export type AnnotatedWritingTask = {
  task_id: string;
  task_type: string | null;
  answer_text: string;
  annotations: WritingAnnotation[];
};

export type PracticeWritingAnnotateResponse = {
  ok: boolean;
  tasks: AnnotatedWritingTask[];
  generated_at: string;
};

export const practiceWritingAnnotate = (
  accessToken: string,
  practiceSessionId: string,
): Promise<PracticeWritingAnnotateResponse> =>
  call(accessToken, `/ielts-practice/sessions/${encodeURIComponent(practiceSessionId)}/annotate`, {
    method: "POST",
    body: {},
  });

export type CoachChatTurn = { role: "user" | "assistant"; content: string };

export type PracticeCoachConversation = {
  ok: boolean;
  reply: string;
  suggested_followups: string[];
};

export const practiceLabCoachChat = (
  accessToken: string,
  practiceSessionId: string,
  body: { messages: CoachChatTurn[]; question: string; lang?: CoachLang },
): Promise<PracticeCoachConversation> =>
  call(accessToken, `/ielts-practice/labs/${encodeURIComponent(practiceSessionId)}/coach`, {
    method: "POST",
    body,
  });

// Always-available tutor (not tied to a finished session) — grounded in the
// learner's own profile (target, predictors, weak types, traps).
export type CoachLang = 'en' | 'uz' | 'ru';

// Persisted, app-wide preference for the language the AI coach explains in.
// One choice (set in the tutor) follows the learner across every coaching surface.
const COACH_LANG_KEY = 'ielts_coach_lang';
export const getCoachLang = (): CoachLang => {
  if (typeof localStorage === 'undefined') return 'en';
  const v = localStorage.getItem(COACH_LANG_KEY);
  return v === 'uz' || v === 'ru' ? v : 'en';
};
export const setCoachLang = (lang: CoachLang): void => {
  if (typeof localStorage !== 'undefined') localStorage.setItem(COACH_LANG_KEY, lang);
};

export const practiceCoachAsk = (
  accessToken: string,
  body: { messages: CoachChatTurn[]; question: string; lang?: CoachLang },
): Promise<PracticeCoachConversation & { ai_available?: boolean }> =>
  call(accessToken, '/ielts-practice/insights/coach-ask', {
    method: 'POST',
    body,
  });

export type PracticeSkillLesson = {
  title: string;
  what_it_tests: string;
  steps: string[];
  common_traps: string[];
  worked_example: string;
};

export const practiceTeach = (
  accessToken: string,
  body: { question_type: string; section_type?: string; lang?: CoachLang },
): Promise<{ ok: boolean; ai_available?: boolean; lesson: PracticeSkillLesson }> =>
  call(accessToken, '/ielts-practice/insights/teach', { method: 'POST', body });

export type PracticeLabHintResponse = { ok: boolean; hint: string };

export const practiceLabHint = (
  accessToken: string,
  practiceSessionId: string,
  stepId: string,
): Promise<PracticeLabHintResponse> =>
  call(accessToken, `/ielts-practice/labs/${encodeURIComponent(practiceSessionId)}/hint`, {
    method: "POST",
    body: { step_id: stepId },
  });

export type ModelAnswerTask = {
  task_id: string;
  task_type: string | null;
  prompt: string;
  student_text: string;
  student_band: number | null;
  model_text: string;
  model_band: number;
  notes: string[];
};

export type PracticeModelAnswerResponse = { ok: boolean; tasks: ModelAnswerTask[] };

export const practiceModelAnswer = (
  accessToken: string,
  practiceSessionId: string,
): Promise<PracticeModelAnswerResponse> =>
  call(accessToken, `/ielts-practice/sessions/${encodeURIComponent(practiceSessionId)}/model-answer`, {
    method: "POST",
    body: {},
  });

export type VocabFromMistakesEntry = {
  id: string;
  word: string;
  normalized_word: string;
  context_text: string | null;
  source_type: string;
  source_label: string | null;
  leitner_box: number;
  review_count: number;
  created_at: string;
};

export type VocabFromMistakesResponse = {
  ok: boolean;
  items: VocabFromMistakesEntry[];
  total: number;
};

export const practiceVocabFromMistakesGet = (
  accessToken: string,
): Promise<VocabFromMistakesResponse> =>
  call(accessToken, `/ielts-practice/insights/vocab-from-mistakes`);

// AI Writing prep — outline + band-8 sample
export type WritingOutlineResponse = {
  ok: boolean;
  ai_available: boolean;
  thesis: string;
  body_outline: Array<{ label: string; topic_sentence: string; supporting_points: string[] }>;
  key_vocabulary: string[];
  time_management: string;
};

export const practiceWritingOutline = (
  accessToken: string,
  body: { prompt: string; task_type?: 'task1' | 'task2' },
): Promise<WritingOutlineResponse> =>
  call(accessToken, '/ielts-practice/writing/outline', { method: 'POST', body });

export type WritingSampleResponse = {
  ok: boolean;
  ai_available: boolean;
  target_band: number;
  response_text: string;
  word_count: number;
  rubric_notes: { TR: string; CC: string; LR: string; GRA: string };
  annotations: Array<{ phrase: string; criterion: string; why_band: string }>;
};

export const practiceWritingSample = (
  accessToken: string,
  body: { prompt: string; task_type?: 'task1' | 'task2'; target_band?: number },
): Promise<WritingSampleResponse> =>
  call(accessToken, '/ielts-practice/writing/sample-answer', { method: 'POST', body });

// AI study coach insights
export type CoachInsight = {
  type: 'progress' | 'risk' | 'recommendation' | 'celebration' | string;
  title: string;
  body: string;
  action_label: string;
  action_route: string;
};

export type CoachSummaryResponse = {
  ok: boolean;
  ai_available: boolean;
  summary: string;
  insights: CoachInsight[];
  generated_at: string;
};

export const practiceCoachSummaryGet = (accessToken: string): Promise<CoachSummaryResponse> =>
  call(accessToken, '/ielts-practice/insights/coach-summary');

// AI mock generator
export type MockGeneratorQuestion = {
  prompt: string;
  type: string;
  options: string[];
  correct_answer: string;
  explanation: string;
};

export type MockGeneratorResponse = {
  ok: boolean;
  ai_available: boolean;
  passage: { title: string; body: string } | null;
  questions: MockGeneratorQuestion[];
  estimated_band: number;
  section_type: 'reading' | 'listening';
  message?: string;
};

export const practiceMockGenerate = (
  accessToken: string,
  body: {
    section_type: 'reading' | 'listening';
    target_band?: number;
    topic_hint?: string;
    question_type?: string;
  },
): Promise<MockGeneratorResponse> =>
  call(accessToken, '/ielts-practice/generator/mock-passage', { method: 'POST', body });

export type NotebookRetestResponse = {
  ok: boolean;
  notebook_id: string;
  trap_type: string;
  question_type: string;
  section_type: string;
  question_text: string;
  options: string[];
  correct_index: number;
  explanation: string;
};

export const practiceNotebookRetest = (
  accessToken: string,
  notebookId: string,
): Promise<NotebookRetestResponse> =>
  call(accessToken, `/ielts-practice/notebook/${encodeURIComponent(notebookId)}/retest`, {
    method: "POST",
    body: {},
  });

