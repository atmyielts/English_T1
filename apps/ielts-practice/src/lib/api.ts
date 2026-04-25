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

export type PracticeGoal = {
  user_id: string;
  language_id: string;
  product_id: string;
  target_overall_band: number;
  target_section_bands: Json;
  target_date: string | null;
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
  const res = await fetch(`${edgeBase}${path}`, {
    method,
    headers: headers(accessToken, opts?.body != null),
    body: opts?.body != null ? JSON.stringify(opts.body) : undefined,
  });
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
  body: Partial<Pick<PracticeGoal, "target_overall_band" | "target_section_bands" | "target_date" | "focus_modes" | "metadata">>,
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
  body?: { plan_date?: string; daily_count?: number; refresh_diagnostics?: boolean },
): Promise<{
  ok: boolean;
  plan_date: string;
  generated_count: number;
  quotas: Json;
  items: PracticePlanItem[];
}> => call(accessToken, "/ielts-practice/plans/generate", { method: "POST", body: body ?? {} });

export const practiceTodayPlan = (
  accessToken: string,
  opts?: { date?: string },
): Promise<{ plan_date: string; items: PracticePlanItem[] }> => {
  const qs = new URLSearchParams();
  if (opts?.date) qs.set("date", opts.date);
  return call(accessToken, `/ielts-practice/plans/today${qs.toString() ? `?${qs.toString()}` : ""}`);
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

