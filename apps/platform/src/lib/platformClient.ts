import { clearLocalAuthStorage, edgeBase, refreshAuthSession, supabaseAnonKey } from './supabase';

type Json = Record<string, unknown> | unknown[];

export type MeResponse = {
  user: { id: string; email: string | null; role?: string | null };
  current_tenant: { id: string; name: string; slug: string; type: string } | null;
  memberships: { tenant_id: string; role: string; status: string }[];
  entitlements: {
    id: string;
    resource_type: string;
    resource_id: string | null;
    starts_at: string | null;
    ends_at: string | null;
    value: Json | null;
  }[];
  admin?: {
    is_admin: boolean;
    permissions: string[];
    session_aal: string | null;
    security_policy: {
      require_mfa: boolean;
      session_timeout_minutes: number;
      rate_limit_per_minute: number;
      ip_allowlist: string[];
    } | null;
  } | null;
};

export type AccessEffectiveResponse = {
  user: { id: string; email: string | null };
  tenant_id: string | null;
  personal_product_ids: string[];
  sponsored_product_ids: string[];
  effective_product_ids: string[];
  has_access: boolean | null;
};

export type PlatformSettings = {
  id: number;
  trial_enabled: boolean;
  trial_days: number;
  trial_autogrant_on_signup: boolean;
  trial_once_per_user: boolean;
  trial_resource_type: string;
  trial_resource_id: string | null;
  trial_limits: Record<string, number> | null;
  trial_product_overrides: Record<string, { trial_enabled?: boolean; trial_days?: number; trial_limits?: Record<string, number> }> | null;
  writing_ai_enabled: boolean;
  writing_ai_daily_limit: number;
  student_center_enabled: boolean;
  classroom_v2_enabled: boolean;
  academy_video_provider: 'cloudflare_stream';
  academy_video_uploads_enabled: boolean;
};
export type AdminSecurityPolicy = {
  id: number;
  require_mfa: boolean;
  session_timeout_minutes: number;
  rate_limit_per_minute: number;
  ip_allowlist: string[];
  updated_at?: string;
};

export type StudentCenterService = {
  id: string;
  source: 'academy' | 'platform' | string;
  kind: string;
  title: string;
  subtitle: string;
  status: string;
  href: string;
  metadata: Record<string, unknown>;
};

export type StudentCenterAction = {
  id: string;
  source: string;
  kind: string;
  title: string;
  context: string;
  due_at: string | null;
  priority: 'urgent' | 'normal';
  href: string;
};

export type StudentCenterCalendarItem = {
  id: string;
  source: string;
  kind: string;
  title: string;
  context: string;
  starts_at: string;
  ends_at: string;
  status: string;
  delivery_mode: string;
  join_available: boolean;
  join_url: string | null;
  href: string;
};

export type StudentCenterProgress = {
  id: string;
  source: string;
  title: string;
  completed: number;
  total: number;
  percent: number | null;
  score?: number | null;
  href: string;
};

export type StudentCenterCommunication = {
  id: string;
  source: string;
  kind: string;
  title: string;
  body: string;
  created_at: string;
  context: string;
};

export type StudentCenterAccess = {
  id: string;
  source: string;
  title: string;
  status: string;
  expires_at: string | null;
  href: string;
};

export type StudentCenterDashboard = {
  identity: { id: string; email: string | null };
  services: StudentCenterService[];
  next_actions: StudentCenterAction[];
  calendar: StudentCenterCalendarItem[];
  progress: StudentCenterProgress[];
  communications: StudentCenterCommunication[];
  access: StudentCenterAccess[];
  partial_errors: Array<{ source: string; message: string; retryable: boolean }>;
  generated_at: string;
};

export type AcademyVideoHealth = {
  provider: 'cloudflare_stream';
  configured: boolean;
  fields: Record<string, boolean>;
  reachable?: boolean;
  latency_ms?: number;
};

export type AcademyVideoPolicy = {
  academy_id: string;
  upload_enabled: boolean;
  max_asset_duration_seconds: number;
  max_total_stored_minutes: number;
  max_monthly_upload_minutes: number;
  approved_by: string | null;
  approved_at: string | null;
  updated_at: string;
};

export type AcademyVideoPolicyRow = {
  academy: { id: string; name: string; slug: string; type: string };
  policy: AcademyVideoPolicy | null;
  usage: { stored_minutes: number; monthly_upload_minutes: number };
};

export type BillingPlan = {
  id: string;
  product_id: string;
  name: string;
  amount: number;
  currency: string;
  duration_days: number | null;
  is_active: boolean;
  metadata: Json | null;
  created_at: string;
};

const learningProfileEdgeSlug =
  String(import.meta.env.VITE_USE_LEARNING_PROFILE_V2 ?? '').toLowerCase() === 'true'
    ? 'learning-profile-v2'
    : 'learning-profile';
const scoreSessionEdgeSlug =
  String(import.meta.env.VITE_USE_SCORE_SESSION_V2 ?? '').toLowerCase() === 'true'
    ? 'score-session-v2'
    : 'score-session';
const gradeWritingEdgeSlug =
  String(import.meta.env.VITE_USE_GRADE_WRITING_V2 ?? '').toLowerCase() === 'true'
    ? 'grade-writing-v2'
    : 'grade-writing';

const apiHeaders = (accessToken: string): HeadersInit => ({
  apikey: supabaseAnonKey,
  Authorization: `Bearer ${accessToken}`,
});
const publicApiHeaders: HeadersInit = {
  apikey: supabaseAnonKey,
};

// Small, in-memory caches mainly to dedupe React StrictMode double-invocations in dev.
const ME_CACHE_TTL_MS = 30_000;
const meCache = new Map<string, { at: number; value: MeResponse }>();
const meInFlight = new Map<string, Promise<MeResponse>>();

const EXAM_STATE_CACHE_TTL_MS = 2_000;
const examStateCache = new Map<string, { at: number; value: ExamStateResponse }>();
const examStateInFlight = new Map<string, Promise<ExamStateResponse>>();

const BILLING_PLANS_CACHE_TTL_MS = 30_000;
const billingPlansCache = new Map<string, { at: number; value: { plans: BillingPlan[] } }>();
const billingPlansInFlight = new Map<string, Promise<{ plans: BillingPlan[] }>>();

const readJsonOrText = async (res: Response): Promise<unknown> => {
  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) return res.json();
  return res.text();
};

const authErrorPattern = /unauthorized|invalid jwt|session not found|session_not_found/i;

const isAuthErrorResponse = (status: number, details: unknown): boolean => {
  if (status === 401) return true;
  if (status !== 403) return false;
  const text = typeof details === 'string' ? details : JSON.stringify(details ?? '');
  return authErrorPattern.test(text);
};

let authExpirySignOutInFlight: Promise<void> | null = null;
let refreshAccessTokenInFlight: Promise<string | null> | null = null;

const forceLocalSignOut = async (): Promise<void> => {
  if (!authExpirySignOutInFlight) {
    authExpirySignOutInFlight = Promise.resolve()
      .then(() => clearLocalAuthStorage())
      .finally(() => {
        authExpirySignOutInFlight = null;
      });
  }
  await authExpirySignOutInFlight;
};

const tryRefreshAccessToken = async (): Promise<string | null> => {
  if (!refreshAccessTokenInFlight) {
    refreshAccessTokenInFlight = (async () => {
      const session = await refreshAuthSession();
      return session?.access_token ?? null;
    })().finally(() => {
      refreshAccessTokenInFlight = null;
    });
  }
  return refreshAccessTokenInFlight;
};

export const getMe = async (accessToken: string, opts?: { force?: boolean }): Promise<MeResponse> => {
  const key = accessToken;
  const now = Date.now();

  if (!opts?.force) {
    const cached = meCache.get(key);
    if (cached && now - cached.at < ME_CACHE_TTL_MS) return cached.value;

    const inFlight = meInFlight.get(key);
    if (inFlight) return inFlight;
  }

  const p = (async () => {
    let activeToken = accessToken;
    let res = await fetch(`${edgeBase}/me`, { headers: apiHeaders(activeToken) });
    let details: unknown = null;

    if (!res.ok) {
      details = await readJsonOrText(res);
      if (isAuthErrorResponse(res.status, details)) {
        const refreshedToken = await tryRefreshAccessToken();
        if (refreshedToken) {
          activeToken = refreshedToken;
          res = await fetch(`${edgeBase}/me`, { headers: apiHeaders(activeToken) });
          if (!res.ok) details = await readJsonOrText(res);
        }
      }
    }

    if (!res.ok) {
      if (isAuthErrorResponse(res.status, details)) await forceLocalSignOut();
      const err = new Error(`GET /me failed (${res.status}): ${JSON.stringify(details)}`);
      (err as any).status = res.status;
      (err as any).details = details;
      throw err;
    }

    const value = (await res.json()) as MeResponse;
    meCache.set(activeToken, { at: Date.now(), value });
    return value;
  })();

  meInFlight.set(key, p);
  try {
    return await p;
  } finally {
    meInFlight.delete(key);
  }
};

export const getAccessEffective = async (
  accessToken: string,
  opts?: { productId?: string | null },
): Promise<AccessEffectiveResponse> => {
  const qs = new URLSearchParams();
  if (opts?.productId) qs.set('product_id', opts.productId);
  const url = `${edgeBase}/access-effective${qs.toString() ? `?${qs.toString()}` : ''}`;

  let activeToken = accessToken;
  let res = await fetch(url, { method: 'GET', headers: apiHeaders(activeToken) });
  let details: unknown = null;

  if (!res.ok) {
    details = await readJsonOrText(res);
    if (isAuthErrorResponse(res.status, details)) {
      const refreshedToken = await tryRefreshAccessToken();
      if (refreshedToken) {
        activeToken = refreshedToken;
        res = await fetch(url, { method: 'GET', headers: apiHeaders(activeToken) });
        if (!res.ok) details = await readJsonOrText(res);
      }
    }
  }

  if (!res.ok) {
    if (isAuthErrorResponse(res.status, details)) await forceLocalSignOut();
    const err = new Error(`GET /access-effective failed (${res.status}): ${JSON.stringify(details)}`);
    (err as any).status = res.status;
    (err as any).details = details;
    throw err;
  }
  return (await res.json()) as AccessEffectiveResponse;
};

export const platformSettingsGet = async (accessToken: string): Promise<PlatformSettings> => {
  const res = await fetch(`${edgeBase}/platform-settings`, {
    method: 'GET',
    headers: apiHeaders(accessToken),
  });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`GET /platform-settings failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as PlatformSettings;
};

export const platformSettingsPatch = async (
  accessToken: string,
  patch: Partial<Omit<PlatformSettings, 'id'>>,
): Promise<PlatformSettings> => {
  const res = await fetch(`${edgeBase}/platform-settings`, {
    method: 'PATCH',
    headers: { ...apiHeaders(accessToken), 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`PATCH /platform-settings failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as PlatformSettings;
};

export const studentCenterDashboard = async (accessToken: string): Promise<StudentCenterDashboard> => {
  const res = await fetch(`${edgeBase}/student-center?action=dashboard`, {
    method: 'GET',
    headers: apiHeaders(accessToken),
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`GET /student-center failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as StudentCenterDashboard;
};

export const academyVideoProviderHealth = async (
  accessToken: string,
  test = false,
): Promise<AcademyVideoHealth> => {
  const res = await fetch(`${edgeBase}/academy-video?action=provider-health${test ? '&test=true' : ''}`, {
    method: 'GET',
    headers: apiHeaders(accessToken),
  });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`GET /academy-video provider health failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as AcademyVideoHealth;
};

export const academyVideoPolicyList = async (
  accessToken: string,
): Promise<{ health: AcademyVideoHealth; academies: AcademyVideoPolicyRow[] }> => {
  const res = await fetch(`${edgeBase}/academy-video?action=policy-list`, {
    method: 'GET',
    headers: apiHeaders(accessToken),
  });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`GET /academy-video policies failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as { health: AcademyVideoHealth; academies: AcademyVideoPolicyRow[] };
};

export const academyVideoPolicyUpdate = async (
  accessToken: string,
  patch: Pick<AcademyVideoPolicy, 'academy_id' | 'upload_enabled' | 'max_asset_duration_seconds' | 'max_total_stored_minutes' | 'max_monthly_upload_minutes'>,
): Promise<{ policy: AcademyVideoPolicy }> => {
  const res = await fetch(`${edgeBase}/academy-video?action=policy-update`, {
    method: 'PATCH',
    headers: { ...apiHeaders(accessToken), 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`PATCH /academy-video policy failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as { policy: AcademyVideoPolicy };
};

export const adminSecurityPolicyGet = async (accessToken: string): Promise<AdminSecurityPolicy> => {
  const res = await fetch(`${edgeBase}/platform-settings?scope=admin_security`, {
    method: 'GET',
    headers: apiHeaders(accessToken),
  });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`GET /platform-settings?scope=admin_security failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as AdminSecurityPolicy;
};

export const adminSecurityPolicyPatch = async (
  accessToken: string,
  patch: Partial<Omit<AdminSecurityPolicy, 'id'>>,
): Promise<AdminSecurityPolicy> => {
  const res = await fetch(`${edgeBase}/platform-settings?scope=admin_security`, {
    method: 'PATCH',
    headers: { ...apiHeaders(accessToken), 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`PATCH /platform-settings?scope=admin_security failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as AdminSecurityPolicy;
};

export type TrialStatusResponse = {
  product_id: string;
  trial_enabled: boolean;
  trial_days: number;
  trial_limits: Record<string, number>;
  claimable: boolean;
  reason: string | null;
  already_claimed: boolean;
  claim: { id: string; claimed_at: string; expires_at: string } | null;
  already_entitled: boolean;
};

export const trialStatus = async (accessToken: string, productId: string): Promise<TrialStatusResponse> => {
  const url = `${edgeBase}/trial-claim?product_id=${encodeURIComponent(productId)}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { ...apiHeaders(accessToken), 'x-user-jwt': accessToken },
  });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`GET /trial-claim failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as TrialStatusResponse;
};

export type TrialClaimResponse = {
  ok: boolean;
  product_id: string;
  trial_days: number;
  trial_limits: Record<string, number>;
  claim: { id: string; claimed_at: string; expires_at: string } | null;
  entitlement: { id: string; starts_at: string | null; ends_at: string | null } | null;
};

export const trialClaim = async (accessToken: string, productId: string): Promise<TrialClaimResponse> => {
  const url = `${edgeBase}/trial-claim?product_id=${encodeURIComponent(productId)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...apiHeaders(accessToken), 'x-user-jwt': accessToken },
  });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`POST /trial-claim failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as TrialClaimResponse;
};

export const accountDelete = async (accessToken: string): Promise<{ ok: boolean }> => {
  const res = await fetch(`${edgeBase}/account`, {
    method: 'DELETE',
    headers: apiHeaders(accessToken),
  });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    const err = new Error('Account deletion failed');
    (err as any).status = res.status;
    (err as any).details = details;
    throw err;
  }
  return (await res.json()) as { ok: boolean };
};

export const billingPlansList = async (
  accessToken: string,
  productId: string,
): Promise<{ plans: BillingPlan[] }> => {
  const key = `${accessToken}:${productId}`;
  const now = Date.now();

  const cached = billingPlansCache.get(key);
  if (cached && now - cached.at < BILLING_PLANS_CACHE_TTL_MS) return cached.value;

  const inFlight = billingPlansInFlight.get(key);
  if (inFlight) return inFlight;

  const p = (async () => {
    const url = `${edgeBase}/billing/plans?product_id=${encodeURIComponent(productId)}`;
    const res = await fetch(url, { method: 'GET', headers: apiHeaders(accessToken) });
    if (!res.ok) {
      const details = await readJsonOrText(res);
      throw new Error(`GET /billing/plans failed (${res.status}): ${JSON.stringify(details)}`);
    }
    const value = (await res.json()) as { plans: BillingPlan[] };
    billingPlansCache.set(key, { at: Date.now(), value });
    return value;
  })();

  billingPlansInFlight.set(key, p);
  try {
    return await p;
  } finally {
    billingPlansInFlight.delete(key);
  }
};

export type StartSessionInput = {
  experience_id: string;
  metadata?: Json | null;
  tenant_id?: string | null;
  capability_key?: string | null;
};

export type StartSessionResponse = { session_id: string | null };

export const startSession = async (
  accessToken: string,
  body: StartSessionInput,
): Promise<StartSessionResponse> => {
  const res = await fetch(`${edgeBase}/start-session`, {
    method: 'POST',
    headers: { ...apiHeaders(accessToken), 'x-user-jwt': accessToken, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`POST /start-session failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as StartSessionResponse;
};

export type UsageStatusResponse = {
  period_start: string;
  period_end: string;
  items: { key: string; limit: number | null; remaining: number | null; total: number | null; unlimited: boolean }[];
};

export const usageStatus = async (
  accessToken: string,
  productId: string,
  keys?: string[],
): Promise<UsageStatusResponse> => {
  const qs = new URLSearchParams({ product_id: productId });
  if (keys && keys.length > 0) qs.set('keys', keys.join(','));
  const res = await fetch(`${edgeBase}/usage?${qs.toString()}`, { method: 'GET', headers: apiHeaders(accessToken) });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`GET /usage failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as UsageStatusResponse;
};

export type UsageConsumeInput = { product_id: string; capability_key: string; amount?: number };
export type UsageConsumeResponse = { allowed: boolean; remaining: number | null; total: number | null; unlimited: boolean };

export const usageConsume = async (
  accessToken: string,
  body: UsageConsumeInput,
): Promise<UsageConsumeResponse> => {
  const res = await fetch(`${edgeBase}/usage`, {
    method: 'POST',
    headers: { ...apiHeaders(accessToken), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`POST /usage failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as UsageConsumeResponse;
};

export type BillingQuoteResponse = {
  plan: Pick<BillingPlan, 'id' | 'name' | 'amount' | 'currency' | 'duration_days'>;
  coupon: { id: string; code: string; discount_type: string; value: number; currency: string } | null;
  pricing: { original_amount: number; discount_amount: number; final_amount: number };
};

export const billingQuote = async (
  accessToken: string,
  planId: string,
  couponCode?: string | null,
): Promise<BillingQuoteResponse> => {
  const qs = new URLSearchParams({ plan_id: planId });
  if (couponCode && couponCode.trim()) qs.set('coupon_code', couponCode.trim());

  const url = `${edgeBase}/billing/quote?${qs.toString()}`;
  const res = await fetch(url, { method: 'GET', headers: apiHeaders(accessToken) });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`GET /billing/quote failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as BillingQuoteResponse;
};

export type AdminProductRow = {
  id: string;
  name: string;
  type: string;
  status: string;
  description: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export const adminProductsList = async (
  accessToken: string,
  opts?: { query?: string; status?: string; limit?: number },
): Promise<{ products: AdminProductRow[] }> => {
  const qs = new URLSearchParams();
  if (opts?.query?.trim()) qs.set('query', opts.query.trim());
  if (opts?.status?.trim()) qs.set('status', opts.status.trim());
  if (typeof opts?.limit === 'number' && Number.isFinite(opts.limit)) qs.set('limit', String(Math.floor(opts.limit)));
  const suffix = qs.toString();
  const url = `${edgeBase}/admin-products/list${suffix ? `?${suffix}` : ''}`;
  const res = await fetch(url, { method: 'GET', headers: apiHeaders(accessToken) });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`GET /admin-products/list failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as { products: AdminProductRow[] };
};

export const adminProductsCreate = async (
  accessToken: string,
  body: Pick<AdminProductRow, 'name' | 'type' | 'status' | 'description' | 'metadata'>,
): Promise<{ product: AdminProductRow | null }> => {
  const res = await fetch(`${edgeBase}/admin-products/create`, {
    method: 'POST',
    headers: { ...apiHeaders(accessToken), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`POST /admin-products/create failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as { product: AdminProductRow | null };
};

export const adminProductsUpdate = async (
  accessToken: string,
  productId: string,
  patch: Partial<Pick<AdminProductRow, 'name' | 'type' | 'status' | 'description' | 'metadata'>>,
): Promise<{ product: AdminProductRow | null }> => {
  const res = await fetch(`${edgeBase}/admin-products/update`, {
    method: 'PATCH',
    headers: { ...apiHeaders(accessToken), 'Content-Type': 'application/json' },
    body: JSON.stringify({ product_id: productId, patch }),
  });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`PATCH /admin-products/update failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as { product: AdminProductRow | null };
};

export type EnglishPresentationMeta = {
  scene_label?: string;
  hero_note?: string;
  cover_style_key?: string;
  coach_tone?: string;
  difficulty_badge?: string;
  support_mode_labels?: string[];
  target_badges?: string[];
  ambient_audio_key?: string;
  celebration_copy?: string;
  preview_media_url?: string;
};

export type AdminEnglishContentSummaryRow = {
  service_key: string;
  label: string;
  total_count: number;
  published_count: number;
  draft_count: number;
  archived_count: number;
  latest_updated_at: string | null;
  readiness: string;
  note?: string;
};

export type AdminEnglishContentItem = {
  id: string;
  service_key: string;
  item_kind: string;
  slug?: string;
  title: string;
  summary?: string;
  level?: string;
  status?: string;
  sort_order?: number;
  updated_at?: string | null;
  presentation_meta?: EnglishPresentationMeta | null;
  detail_badges?: string[];
  notes?: string[];
  metrics?: Record<string, number>;
  raw?: Record<string, unknown>;
};

export type AdminEnglishOpsDashboard = {
  generated_at: string;
  scope: { language_id: string; language_code: string };
  overview: {
    recommendations_30d: number;
    active_recommendations_now: number;
    mastery_reopenings_30d: number;
    mastery_reopenings_7d: number;
    activation_candidates_now: number;
    recent_rule_changes_30d: number;
  };
  handoff_effectiveness: Array<{
    recommendation_type: string;
    generated: number;
    attempted: number;
    successful: number;
    attempt_rate: number;
    success_rate: number;
    avg_attempt_score: number | null;
  }>;
  mastery_reopenings: {
    by_service: Array<{ service_key: string; count: number }>;
    daily: Array<{ day: string; count: number }>;
  };
  vocabulary_activation: {
    activation_candidates_now: number;
    activation_recommendations_30d: number;
    productive_followthrough_30d: number;
    successful_followthrough_30d: number;
    idle_days_threshold: number;
  };
  service_transfer: Array<{
    source_service_key: string;
    target_service_key: string;
    generated: number;
    attempted: number;
    successful: number;
    avg_attempt_score: number | null;
  }>;
  recent_rule_changes: Array<{
    actor_user_id: string | null;
    rule_key: string;
    service_key: string;
    created_at: string;
  }>;
  rules?: AdminEnglishRuleConfig[];
};

export type AdminEnglishRuleConfig = {
  ruleKey: string;
  serviceKey: string;
  enabled: boolean;
  thresholds: Record<string, unknown>;
  notes?: string | null;
};

const callAdminEnglish = async (
  accessToken: string,
  pathname: string,
  init: RequestInit = {},
): Promise<unknown> => {
  const res = await fetch(`${edgeBase}${pathname}`, {
    ...init,
    headers: {
      ...apiHeaders(accessToken),
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`${init.method ?? 'GET'} ${pathname} failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return readJsonOrText(res);
};

export const adminEnglishContentSummary = async (
  accessToken: string,
): Promise<{ services: AdminEnglishContentSummaryRow[]; generated_at: string }> =>
  (await callAdminEnglish(accessToken, '/admin-english-content/summary?language_code=en', {
    method: 'GET',
  })) as { services: AdminEnglishContentSummaryRow[]; generated_at: string };

export const adminEnglishContentList = async (
  accessToken: string,
  params: { service_key: string; status?: string; limit?: number },
): Promise<{ service_key: string; label?: string; items: AdminEnglishContentItem[]; note?: string }> => {
  const query = new URLSearchParams({ language_code: 'en', service_key: params.service_key });
  if (params.status?.trim()) query.set('status', params.status.trim());
  if (typeof params.limit === 'number' && Number.isFinite(params.limit)) query.set('limit', String(Math.floor(params.limit)));
  return (await callAdminEnglish(accessToken, `/admin-english-content/content?${query.toString()}`, {
    method: 'GET',
  })) as { service_key: string; label?: string; items: AdminEnglishContentItem[]; note?: string };
};

export const adminEnglishContentUpdate = async (
  accessToken: string,
  body: { service_key: string; id: string; patch: Record<string, unknown> },
): Promise<{ ok: boolean; item: AdminEnglishContentItem }> =>
  (await callAdminEnglish(accessToken, '/admin-english-content/content', {
    method: 'PATCH',
    body: JSON.stringify({ language_code: 'en', ...body }),
  })) as { ok: boolean; item: AdminEnglishContentItem };

export const adminEnglishOpsDashboard = async (accessToken: string): Promise<AdminEnglishOpsDashboard> =>
  (await callAdminEnglish(accessToken, '/admin-english-ops/dashboard?language_code=en', {
    method: 'GET',
  })) as AdminEnglishOpsDashboard;

export const adminEnglishRulesGet = async (
  accessToken: string,
): Promise<{ rules: AdminEnglishRuleConfig[]; defaults: AdminEnglishRuleConfig[] }> => {
  const payload = (await callAdminEnglish(accessToken, '/admin-english-ops/rules?language_code=en', {
    method: 'GET',
  })) as { rules?: Array<Record<string, unknown>>; defaults?: Array<Record<string, unknown>> };
  const mapRule = (row: Record<string, unknown>): AdminEnglishRuleConfig => ({
    ruleKey: String(row.rule_key ?? row.ruleKey ?? ''),
    serviceKey: String(row.service_key ?? row.serviceKey ?? '*'),
    enabled: row.enabled !== false,
    thresholds:
      row.thresholds && typeof row.thresholds === 'object' && !Array.isArray(row.thresholds)
        ? (row.thresholds as Record<string, unknown>)
        : {},
    notes: typeof row.notes === 'string' ? row.notes : null,
  });
  return {
    rules: Array.isArray(payload.rules) ? payload.rules.map((row) => mapRule(row)) : [],
    defaults: Array.isArray(payload.defaults) ? payload.defaults.map((row) => mapRule(row)) : [],
  };
};

export const adminEnglishRulesPatch = async (
  accessToken: string,
  updates: Array<{
    rule_key: string;
    service_key: string;
    enabled: boolean;
    thresholds: Record<string, unknown>;
    notes?: string | null;
  }>,
): Promise<{ ok: boolean; rules: AdminEnglishRuleConfig[] }> => {
  const payload = (await callAdminEnglish(accessToken, '/admin-english-ops/rules', {
    method: 'PATCH',
    body: JSON.stringify({ language_code: 'en', updates }),
  })) as { ok: boolean; rules?: Array<Record<string, unknown>> };
  return {
    ok: payload.ok === true,
    rules: Array.isArray(payload.rules)
      ? payload.rules.map((row) => ({
          ruleKey: String(row.rule_key ?? row.ruleKey ?? ''),
          serviceKey: String(row.service_key ?? row.serviceKey ?? '*'),
          enabled: row.enabled !== false,
          thresholds:
            row.thresholds && typeof row.thresholds === 'object' && !Array.isArray(row.thresholds)
              ? (row.thresholds as Record<string, unknown>)
              : {},
          notes: typeof row.notes === 'string' ? row.notes : null,
        }))
      : [],
  };
};

export const adminBillingPlansList = async (
  accessToken: string,
  productId: string,
): Promise<{ plans: BillingPlan[] }> => {
  const url = `${edgeBase}/admin-billing/plans?product_id=${encodeURIComponent(productId)}`;
  const res = await fetch(url, { method: 'GET', headers: apiHeaders(accessToken) });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`GET /admin-billing/plans failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as { plans: BillingPlan[] };
};

export const adminBillingPlanCreate = async (
  accessToken: string,
  body: Pick<BillingPlan, 'product_id' | 'name' | 'amount' | 'currency' | 'duration_days' | 'is_active' | 'metadata'>,
): Promise<{ plan: BillingPlan | null }> => {
  const res = await fetch(`${edgeBase}/admin-billing/plans`, {
    method: 'POST',
    headers: { ...apiHeaders(accessToken), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`POST /admin-billing/plans failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as { plan: BillingPlan | null };
};

export const adminBillingPlanUpdate = async (
  accessToken: string,
  planId: string,
  patch: Partial<Pick<BillingPlan, 'name' | 'amount' | 'currency' | 'duration_days' | 'is_active' | 'metadata'>>,
): Promise<{ plan: BillingPlan | null }> => {
  const res = await fetch(`${edgeBase}/admin-billing/plans`, {
    method: 'PATCH',
    headers: { ...apiHeaders(accessToken), 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan_id: planId, patch }),
  });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`PATCH /admin-billing/plans failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as { plan: BillingPlan | null };
};

export type AdminCoupon = {
  id: string;
  code: string;
  description: string | null;
  discount_type: 'percent' | 'fixed';
  value: number;
  currency: string;
  product_id: string;
  plan_id: string | null;
  is_active: boolean;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  max_redemptions: number | null;
  max_per_user: number | null;
  min_amount: number | null;
  first_purchase_only: boolean | null;
  stacking_policy: string | null;
  effects: Json | null;
  constraints: Json | null;
  metadata: Json | null;
  created_at: string;
  updated_at: string;
};

export const adminCouponsList = async (accessToken: string, productId: string): Promise<{ coupons: AdminCoupon[] }> => {
  const url = `${edgeBase}/admin-coupons/coupons?product_id=${encodeURIComponent(productId)}`;
  const res = await fetch(url, { method: 'GET', headers: apiHeaders(accessToken) });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`GET /admin-coupons/coupons failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as { coupons: AdminCoupon[] };
};

export const adminCouponCreate = async (
  accessToken: string,
  body: Pick<
    AdminCoupon,
    | 'product_id'
    | 'plan_id'
    | 'code'
    | 'description'
    | 'discount_type'
    | 'value'
    | 'currency'
    | 'is_active'
    | 'status'
    | 'starts_at'
    | 'ends_at'
    | 'max_redemptions'
    | 'max_per_user'
    | 'min_amount'
    | 'first_purchase_only'
    | 'stacking_policy'
    | 'effects'
    | 'constraints'
    | 'metadata'
  >,
): Promise<{ coupon: AdminCoupon | null }> => {
  const res = await fetch(`${edgeBase}/admin-coupons/coupons`, {
    method: 'POST',
    headers: { ...apiHeaders(accessToken), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`POST /admin-coupons/coupons failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as { coupon: AdminCoupon | null };
};

export const adminCouponUpdate = async (
  accessToken: string,
  couponId: string,
  patch: Partial<
    Pick<
      AdminCoupon,
      | 'code'
      | 'description'
      | 'discount_type'
      | 'value'
      | 'currency'
      | 'plan_id'
      | 'is_active'
      | 'status'
      | 'starts_at'
      | 'ends_at'
      | 'max_redemptions'
      | 'max_per_user'
      | 'min_amount'
      | 'first_purchase_only'
      | 'stacking_policy'
      | 'effects'
      | 'constraints'
      | 'metadata'
    >
  >,
): Promise<{ coupon: AdminCoupon | null }> => {
  const res = await fetch(`${edgeBase}/admin-coupons/coupons`, {
    method: 'PATCH',
    headers: { ...apiHeaders(accessToken), 'Content-Type': 'application/json' },
    body: JSON.stringify({ coupon_id: couponId, patch }),
  });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`PATCH /admin-coupons/coupons failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as { coupon: AdminCoupon | null };
};

export type AdminPayment = {
  id: string;
  provider: string;
  provider_transaction_id: string;
  amount: number;
  currency: string;
  status: string;
  user_id: string | null;
  tenant_id: string | null;
  product_id: string | null;
  plan_id: string | null;
  granted_at: string | null;
  grant_completed_at?: string | null;
  grant_error: string | null;
  fiscalization_status?: string | null;
  fiscal_receipt_id?: string | null;
  fiscalized_at?: string | null;
  fiscalization_error?: string | null;
  original_amount: number | null;
  discount_amount: number | null;
  coupon_code: string | null;
  coupon_id: string | null;
  created_at: string;
  updated_at: string;
  users?: { email: string | null } | null;
  plans?: { name: string; duration_days: number | null } | null;
  products?: { name: string } | null;
  tenants?: { slug: string; name: string } | null;
};

export const adminPaymentsSearch = async (
  accessToken: string,
  query: string,
  opts?: { limit?: number },
): Promise<{ payments: AdminPayment[] }> => {
  const qs = new URLSearchParams({ query });
  if (typeof opts?.limit === 'number' && Number.isFinite(opts.limit)) qs.set('limit', String(opts.limit));
  const url = `${edgeBase}/admin-payments/search?${qs.toString()}`;
  const res = await fetch(url, { method: 'GET', headers: apiHeaders(accessToken) });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`GET /admin-payments/search failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as { payments: AdminPayment[] };
};

export const adminPaymentsList = async (
  accessToken: string,
  opts?: { limit?: number },
): Promise<{ payments: AdminPayment[] }> => {
  const qs = new URLSearchParams();
  if (typeof opts?.limit === 'number' && Number.isFinite(opts.limit)) qs.set('limit', String(opts.limit));
  const suffix = qs.toString();
  const url = `${edgeBase}/admin-payments/list${suffix ? `?${suffix}` : ''}`;
  const res = await fetch(url, { method: 'GET', headers: apiHeaders(accessToken) });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`GET /admin-payments/list failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as { payments: AdminPayment[] };
};

export type AdminPaymentAnomaliesResponse = {
  cutoff_minutes: number;
  count: number;
  anomalies: AdminPayment[];
  operational?: {
    stuck_pending_or_prepared: number;
    incomplete_grants: number;
    granted_without_paid: number;
    fiscalization_failures: number;
    callbacks_15m: number;
    callback_rejections_15m: number;
    signature_failures_15m: number;
    callback_5xx_15m: number;
  };
};

export const adminPaymentsAnomalies = async (
  accessToken: string,
  opts?: { minutes?: number; limit?: number },
): Promise<AdminPaymentAnomaliesResponse> => {
  const qs = new URLSearchParams();
  if (typeof opts?.minutes === 'number' && Number.isFinite(opts.minutes)) qs.set('minutes', String(opts.minutes));
  if (typeof opts?.limit === 'number' && Number.isFinite(opts.limit)) qs.set('limit', String(opts.limit));
  const suffix = qs.toString();
  const url = `${edgeBase}/admin-payments/anomalies${suffix ? `?${suffix}` : ''}`;
  const res = await fetch(url, { method: 'GET', headers: apiHeaders(accessToken) });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`GET /admin-payments/anomalies failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as AdminPaymentAnomaliesResponse;
};

export const adminPaymentsRefreshStatus = async (
  accessToken: string,
  paymentId: string,
): Promise<{ payment: AdminPayment | null; status: string }> => {
  const res = await fetch(`${edgeBase}/admin-payments/refresh-status`, {
    method: 'POST',
    headers: { ...apiHeaders(accessToken), 'Content-Type': 'application/json' },
    body: JSON.stringify({ payment_id: paymentId }),
  });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`POST /admin-payments/refresh-status failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as { payment: AdminPayment | null; status: string };
};

export const adminPaymentsRetryGrant = async (
  accessToken: string,
  paymentId: string,
): Promise<{ payment: AdminPayment | null }> => {
  const res = await fetch(`${edgeBase}/admin-payments/retry-grant`, {
    method: 'POST',
    headers: { ...apiHeaders(accessToken), 'Content-Type': 'application/json' },
    body: JSON.stringify({ payment_id: paymentId }),
  });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`POST /admin-payments/retry-grant failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as { payment: AdminPayment | null };
};

export type ClickCreateInput = {
  plan_id?: string;
  product_id?: string;
  purchase_type?: string;
  experience_id?: string;
  quantity?: number;
  expires_in_days?: number;
  seat_count?: number;
  amount?: number;
  currency?: string;
  description: string;
  redirect_url?: string | null;
  metadata?: Json;
  tenant_id?: string | null;
  coupon_code?: string | null;
  apply_credit?: boolean | null;
  credit_amount?: number | null;
  referral_code?: string | null;
  referral_attribution_id?: string | null;
  idempotency_key?: string | null;
};

export type ClickReadinessResponse = {
  configured: boolean;
  service_id: string | null;
  service_id_matches_production: boolean;
  hosted_payment_ready: boolean;
  card_payment_ready: boolean;
  missing_configuration: string[];
};

export type ClickCardWidgetConfig = {
  service_id: string;
  merchant_id: string;
  merchant_user_id: string | null;
  amount: string;
  transaction_param: string;
};

export type ClickCreateResponse = {
  payment_url: string | null;
  card_widget?: ClickCardWidgetConfig | null;
  transaction_id: string;
  status?: string;
  grant_completed?: boolean;
  amount: number;
  currency: string;
  original_amount: number;
  discount_amount: number;
  credit_amount?: number;
  referral_discount_amount?: number;
  final_amount?: number;
  coupon_code: string | null;
  referral_code?: string | null;
  plan_id: string | null;
  product_id: string | null;
};

export const clickCreateTransaction = async (
  accessToken: string,
  body: ClickCreateInput,
): Promise<ClickCreateResponse> => {
  const res = await fetch(`${edgeBase}/click/create-transaction`, {
    method: 'POST',
    headers: { ...apiHeaders(accessToken), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`POST /click/create-transaction failed (${res.status}): ${JSON.stringify(details)}`);
  }
  const payload = (await res.json()) as ClickCreateResponse;
  if (payload.payment_url) {
    const paymentUrl = new URL(payload.payment_url);
    if (
      paymentUrl.protocol !== 'https:' || paymentUrl.hostname !== 'my.click.uz' ||
      paymentUrl.pathname !== '/services/pay'
    ) throw new Error('CLICK returned an untrusted payment URL');
  }
  return payload;
};

export type ClickStatusResponse = {
  status: string;
  grant_completed?: boolean;
  grant_error?: string | null;
  api_status?: string;
  status_query_id?: string;
  credit_amount?: number;
  referral_discount_amount?: number;
  final_amount?: number;
};

export const clickStatus = async (accessToken: string, transactionId: string): Promise<ClickStatusResponse> => {
  const url = `${edgeBase}/click/status?transaction_id=${encodeURIComponent(transactionId)}`;
  const res = await fetch(url, { method: 'GET', headers: apiHeaders(accessToken) });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`GET /click/status failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as ClickStatusResponse;
};

export const clickReadiness = async (accessToken: string): Promise<ClickReadinessResponse> => {
  const res = await fetch(`${edgeBase}/click/readiness`, {
    method: 'GET',
    headers: apiHeaders(accessToken),
  });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`GET /click/readiness failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as ClickReadinessResponse;
};

export type ScoreSessionResponse = {
  evaluation: unknown;
  session?: {
    id: string;
    status: string;
    metadata: Json | null;
    token_id?: string | null;
  };
  result: {
    session_id: string;
    computed_at: string;
    overall_band: number | null;
    sections: Record<
      string,
      { type: string; raw_score: number; max_score: number; scaled_score_40: number; band: number | null }
    >;
  };
};

export const scoreSession = async (accessToken: string, sessionId: string): Promise<ScoreSessionResponse> => {
  const res = await fetch(`${edgeBase}/${scoreSessionEdgeSlug}`, {
    method: 'POST',
    headers: { ...apiHeaders(accessToken), 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, method: 'auto' }),
  });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`POST /score-session failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as ScoreSessionResponse;
};

export type ExamStateResponse = {
  session: {
    id: string;
    status: string;
    metadata: Json | null;
    started_at: string | null;
    completed_at: string | null;
    created_at: string;
  };
  experience: { id: string; name: string; product_id: string };
  sections: { id: string; name: string; display_order: number; metadata: Json | null }[];
  current_section: { id: string; name: string; display_order: number; metadata: Json | null };
  next_section_id: string | null;
  deadline_iso: string | null;
  units: {
    id: string;
    part_id: string;
    part_name: string | null;
    part_order: number | null;
    type: string;
    data: Json;
    display_order: number;
    metadata: Json;
  }[];
  answers: Record<string, unknown>;
  server_time_iso: string;
};

export const getExamState = async (
  accessToken: string,
  sessionId: string,
  sectionId: string,
  opts?: { prefetch?: boolean; force?: boolean },
): Promise<ExamStateResponse> => {
  const qs = new URLSearchParams({
    session_id: sessionId,
    section_id: sectionId,
  });
  if (opts?.prefetch) qs.set('prefetch', 'true');

  const cacheKey = `${sessionId}:${sectionId}:${opts?.prefetch ? 'prefetch' : 'live'}`;
  const now = Date.now();

  if (!opts?.force) {
    const cached = examStateCache.get(cacheKey);
    if (cached && now - cached.at < EXAM_STATE_CACHE_TTL_MS) return cached.value;

    const inFlight = examStateInFlight.get(cacheKey);
    if (inFlight) return inFlight;
  }

  const p = (async () => {
    const url = `${edgeBase}/exam-state?${qs.toString()}`;
    const res = await fetch(url, { method: 'GET', headers: apiHeaders(accessToken) });
    if (!res.ok) {
      const details = await readJsonOrText(res);
      throw new Error(`GET /exam-state failed (${res.status}): ${JSON.stringify(details)}`);
    }
    const value = (await res.json()) as ExamStateResponse;
    examStateCache.set(cacheKey, { at: Date.now(), value });
    return value;
  })();

  examStateInFlight.set(cacheKey, p);
  try {
    return await p;
  } finally {
    examStateInFlight.delete(cacheKey);
  }
};

export type AudioPlaybackEventInput = {
  session_id: string;
  content_unit_id: string;
  event: 'start' | 'progress' | 'end';
  current_time_seconds?: number | null;
  duration_seconds?: number | null;
};

export type AudioPlaybackEventResponse = { ok: boolean; locked: boolean; playback: Json | null };

export const audioPlaybackEvent = async (
  accessToken: string,
  body: AudioPlaybackEventInput,
): Promise<AudioPlaybackEventResponse> => {
  const res = await fetch(`${edgeBase}/audio-playback`, {
    method: 'POST',
    headers: { ...apiHeaders(accessToken), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`POST /audio-playback failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as AudioPlaybackEventResponse;
};

export type ReviewSessionResponse = {
  session: {
    id: string;
    status: string;
    started_at: string | null;
    completed_at: string | null;
    created_at: string;
  };
  experience: { id: string; name: string; product_id: string };
  sections: { id: string; name: string; display_order: number; metadata: Json | null }[];
  units: {
    id: string;
    section_id: string;
    part_id: string;
    part_name: string | null;
    part_order: number | null;
    type: string;
    data: Json;
    display_order: number;
    metadata: Json;
    answer: unknown | null;
    correct: Json | null;
    is_correct: boolean | null;
    score: number | null;
    max_score: number | null;
  }[];
  server_time_iso: string;
};

export const getReviewSession = async (
  accessToken: string,
  sessionId: string,
  sectionId?: string | null,
): Promise<ReviewSessionResponse> => {
  const qs = new URLSearchParams({ session_id: sessionId });
  if (sectionId) qs.set('section_id', sectionId);

  const res = await fetch(`${edgeBase}/review-session?${qs.toString()}`, { method: 'GET', headers: apiHeaders(accessToken) });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`GET /review-session failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as ReviewSessionResponse;
};

export type ImportExperienceResponse = {
  experience_id: string;
  dry_run?: boolean;
  counts: { sections: number; parts: number; content_units: number; answer_keys: number };
  normalized: unknown;
};

export const importExperience = async (accessToken: string, payload: unknown): Promise<ImportExperienceResponse> => {
  const res = await fetch(`${edgeBase}/import-experience`, {
    method: 'POST',
    headers: { ...apiHeaders(accessToken), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`POST /import-experience failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as ImportExperienceResponse;
};

export const validateExperienceImport = async (accessToken: string, payload: unknown): Promise<ImportExperienceResponse> => {
  const res = await fetch(`${edgeBase}/import-experience?dry_run=true`, {
    method: 'POST',
    headers: { ...apiHeaders(accessToken), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`POST /import-experience?dry_run=true failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as ImportExperienceResponse;
};

export type AdminUploadAssetResponse = {
  asset_id?: string | null;
  bucket: string;
  path: string;
  signed_url: string | null;
};

export const adminUploadAsset = async (
  accessToken: string,
  file: File,
  opts?: { kind?: 'audio' | 'image'; bucket?: string },
): Promise<AdminUploadAssetResponse> => {
  const body = new FormData();
  body.set('file', file);
  if (opts?.kind) body.set('kind', opts.kind);
  if (opts?.bucket) body.set('bucket', opts.bucket);

  const res = await fetch(`${edgeBase}/admin-assets/upload`, {
    method: 'POST',
    headers: apiHeaders(accessToken),
    body,
  });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`POST /admin-assets/upload failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as AdminUploadAssetResponse;
};

export type AdminAssetRow = {
  id: string;
  kind: string;
  bucket: string;
  path: string;
  filename: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  created_by: string | null;
  created_at: string;
  metadata: Json;
  signed_url: string | null;
};

export const adminAssetsList = async (
  accessToken: string,
  opts?: { kind?: string; q?: string; limit?: number; signed?: boolean },
): Promise<{ assets: AdminAssetRow[] }> => {
  const qs = new URLSearchParams();
  if (opts?.kind) qs.set('kind', opts.kind);
  if (opts?.q) qs.set('q', opts.q);
  if (typeof opts?.limit === 'number') qs.set('limit', String(opts.limit));
  if (opts?.signed) qs.set('signed', 'true');

  const res = await fetch(`${edgeBase}/admin-assets/list?${qs.toString()}`, { method: 'GET', headers: apiHeaders(accessToken) });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`GET /admin-assets/list failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as { assets: AdminAssetRow[] };
};

export type AdminTestRow = {
  id: string;
  product_id: string;
  name: string;
  display_order: number;
  is_active: boolean;
  version: number;
  metadata: Json | null;
  created_at: string;
  counts: { sections: number; parts: number; units: number };
};

export const adminTestsList = async (
  accessToken: string,
  productId: string,
): Promise<{ experiences: AdminTestRow[] }> => {
  const url = `${edgeBase}/admin-tests/list?product_id=${encodeURIComponent(productId)}`;
  const res = await fetch(url, { method: 'GET', headers: apiHeaders(accessToken) });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`GET /admin-tests/list failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as { experiences: AdminTestRow[] };
};

export const adminTestsUpdate = async (
  accessToken: string,
  experienceId: string,
  patch: Partial<Pick<AdminTestRow, 'name' | 'display_order' | 'is_active' | 'metadata'>> & { version: number },
): Promise<{ experience: AdminTestRow | null }> => {
  const res = await fetch(`${edgeBase}/admin-tests/update`, {
    method: 'PATCH',
    headers: { ...apiHeaders(accessToken), 'Content-Type': 'application/json' },
    body: JSON.stringify({ experience_id: experienceId, patch }),
  });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`PATCH /admin-tests/update failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as { experience: AdminTestRow | null };
};

export const adminTestsReorder = async (
  accessToken: string,
  order: Array<{ experience_id: string; display_order: number }>,
): Promise<{ ok: boolean }> => {
  const res = await fetch(`${edgeBase}/admin-tests/reorder`, {
    method: 'POST',
    headers: { ...apiHeaders(accessToken), 'Content-Type': 'application/json' },
    body: JSON.stringify({ order }),
  });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`POST /admin-tests/reorder failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as { ok: boolean };
};

export const adminTestsClone = async (
  accessToken: string,
  experienceId: string,
  opts?: { new_name?: string },
): Promise<{ experience_id: string }> => {
  const res = await fetch(`${edgeBase}/admin-tests/clone`, {
    method: 'POST',
    headers: { ...apiHeaders(accessToken), 'Content-Type': 'application/json' },
    body: JSON.stringify({ experience_id: experienceId, new_name: opts?.new_name }),
  });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`POST /admin-tests/clone failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as { experience_id: string };
};

export type AdminUserRow = { id: string; email: string | null; role: string | null; created_at: string };
export type AdminTenantRow = { id: string; name: string; slug: string; type: string; created_at: string };
export type AdminMembershipRow = { tenant_id: string; role: string; status: string; created_at: string };
export type AdminEntitlementRow = {
  id: string;
  tenant_id: string;
  resource_type: string;
  resource_id: string | null;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  source: string | null;
  created_at: string;
  value: Json | null;
};
export type AdminEntitlementProductRow = {
  id: string;
  name: string;
  type: string;
  status: string;
  metadata: Record<string, unknown> | null;
};

export type AdminUserSearchResponse = {
  user: AdminUserRow | null;
  memberships: AdminMembershipRow[];
  tenants: AdminTenantRow[];
  entitlements: AdminEntitlementRow[];
  products: AdminEntitlementProductRow[];
};

export const adminUsersList = async (
  accessToken: string,
  opts?: { query?: string; limit?: number },
): Promise<{ users: AdminUserRow[] }> => {
  const qs = new URLSearchParams();
  if (opts?.query && opts.query.trim()) qs.set('query', opts.query.trim());
  if (typeof opts?.limit === 'number' && Number.isFinite(opts.limit)) qs.set('limit', String(opts.limit));
  const suffix = qs.toString();
  const url = `${edgeBase}/admin-users/list${suffix ? `?${suffix}` : ''}`;
  const res = await fetch(url, { method: 'GET', headers: apiHeaders(accessToken) });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`GET /admin-users/list failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as { users: AdminUserRow[] };
};

export const adminUsersSearch = async (accessToken: string, email: string): Promise<AdminUserSearchResponse> => {
  const url = `${edgeBase}/admin-users/search?email=${encodeURIComponent(email)}`;
  const res = await fetch(url, { method: 'GET', headers: apiHeaders(accessToken) });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`GET /admin-users/search failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as AdminUserSearchResponse;
};

export const adminUsersSetRole = async (
  accessToken: string,
  body: { user_id: string; role: string },
): Promise<{ user: AdminUserRow | null }> => {
  const res = await fetch(`${edgeBase}/admin-users/role`, {
    method: 'PATCH',
    headers: { ...apiHeaders(accessToken), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`PATCH /admin-users/role failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as { user: AdminUserRow | null };
};

export const adminUsersGrantProduct = async (
  accessToken: string,
  body: { product_id: string; tenant_id?: string | null; user_id?: string | null; email?: string | null; days?: number | null; ends_at?: string | null },
): Promise<{ entitlement: AdminEntitlementRow | null }> => {
  const res = await fetch(`${edgeBase}/admin-users/grant-product`, {
    method: 'POST',
    headers: { ...apiHeaders(accessToken), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`POST /admin-users/grant-product failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as { entitlement: AdminEntitlementRow | null };
};

export const adminUsersRevokeProduct = async (
  accessToken: string,
  body: { product_id: string; tenant_id: string },
): Promise<{ entitlement: AdminEntitlementRow | null }> => {
  const res = await fetch(`${edgeBase}/admin-users/revoke-product`, {
    method: 'POST',
    headers: { ...apiHeaders(accessToken), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`POST /admin-users/revoke-product failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as { entitlement: AdminEntitlementRow | null };
};

export type AdminAnalyticsDailyPoint = { day: string; count: number };
export type AdminAnalyticsDailyRevenuePoint = { day: string; count: number; revenue: number };
export type AdminAnalyticsServiceRow = {
  product_id: string;
  name: string;
  type: string;
  status: string;
  sessions_30d: number;
  users_30d: number;
  active_entitlements: number;
  paid_payments_30d: number;
  revenue_30d: number;
};

export type AdminAnalyticsOverviewResponse = {
  generated_at: string;
  totals: {
    users_total: number;
    users_new_7d: number;
    users_new_30d: number;
    visits_users_24h: number;
    visits_users_7d: number;
    visits_users_30d: number;
    sessions_total: number;
    sessions_7d: number;
    sessions_30d: number;
    sessions_completed_30d: number;
    products_active: number;
    plans_active: number;
    entitlements_active: number;
    payments_total: number;
    payments_paid_ungranted_5m: number;
    payments_paid_ungranted_30m: number;
    payments_paid_ungranted_2h: number;
    payments_paid_ungranted_24h: number;
    payments_with_grant_error: number;
    paid_payments_30d: number;
    revenue_30d: number;
  };
  trends_30d: {
    signups_by_day: AdminAnalyticsDailyPoint[];
    sessions_by_day: AdminAnalyticsDailyPoint[];
    grant_errors_by_day: AdminAnalyticsDailyPoint[];
    paid_payments_by_day: AdminAnalyticsDailyRevenuePoint[];
  };
  public_journey: {
    available: boolean;
    since: string;
    events: Record<string, { events: number; visitors: number }>;
    funnel: {
      discovered: number;
      intent: number;
      auth_started: number;
      activated: number;
    };
    daily: Array<{ day: string; discovered: number; auth_started: number; activated: number }>;
  };
  reliability: {
    stale_paid_ungranted: {
      over_5m: number;
      over_30m: number;
      over_2h: number;
      over_24h: number;
    };
    grant_errors_30d: number;
    hard_delete_blocks_24h: number;
    hard_delete_blocks_7d: number;
    recent_hard_delete_blocks: Array<{
      table_name: string | null;
      row_id: string | null;
      actor_user_id: string | null;
      created_at: string;
      details: Json | null;
    }>;
    unavailable_sources: string[];
  };
  services: AdminAnalyticsServiceRow[];
  admin_activity?: {
    available: boolean;
    requests_24h: number;
    failed_requests_24h: number;
    unique_admins_24h: number;
    top_actions_24h: Array<{ action: string; count: number }>;
    top_admins_24h: Array<{ user_id: string | null; user_email: string | null; count: number }>;
    status_buckets_24h: Array<{ bucket: string; count: number }>;
    daily_requests_30d: AdminAnalyticsDailyPoint[];
    recent_events: Array<{
      created_at: string;
      user_id: string | null;
      user_email: string | null;
      action: string;
      method: string;
      path: string;
      status_code: number;
      permission_key: string | null;
      ip: string | null;
      request_id: string | null;
    }>;
  };
  diagnostics?: {
    truncated_sources?: string[];
  };
};

export const adminAnalyticsOverview = async (accessToken: string): Promise<AdminAnalyticsOverviewResponse> => {
  const res = await fetch(`${edgeBase}/admin-analytics`, {
    method: 'GET',
    headers: apiHeaders(accessToken),
  });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`GET /admin-analytics failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as AdminAnalyticsOverviewResponse;
};

export type FunctionErrorLogRow = {
  id: string;
  function_name: string;
  route: string | null;
  http_status: number | null;
  user_id: string | null;
  error_message: string;
  error_stack: string | null;
  request_summary: Record<string, unknown> | null;
  occurred_at: string;
};

export const adminFunctionErrors = async (
  accessToken: string,
  opts?: { limit?: number; function_name?: string; since?: string },
): Promise<{ ok: boolean; rows: FunctionErrorLogRow[] }> => {
  const params = new URLSearchParams();
  if (opts?.limit) params.set('limit', String(opts.limit));
  if (opts?.function_name) params.set('function_name', opts.function_name);
  if (opts?.since) params.set('since', opts.since);
  const qs = params.toString();
  const res = await fetch(`${edgeBase}/admin-function-errors${qs ? `?${qs}` : ''}`, {
    method: 'GET',
    headers: apiHeaders(accessToken),
  });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`GET /admin-function-errors failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as { ok: boolean; rows: FunctionErrorLogRow[] };
};

export type SupportLink = {
  id: string;
  label: string;
  type: 'email' | 'telegram' | 'url';
  value: string;
  is_active: boolean;
  display_order: number;
  metadata: Json | null;
  created_at?: string;
  updated_at?: string;
};

export type SupportMessage = {
  id: string;
  user_id: string | null;
  name: string;
  email: string;
  telegram: string | null;
  subject: string | null;
  message: string;
  source: string;
  service_slug: string | null;
  status: 'new' | 'in_progress' | 'resolved' | 'closed';
  admin_note: string | null;
  metadata: Json | null;
  handled_by: string | null;
  handled_at: string | null;
  created_at: string;
  updated_at: string;
  replies?: SupportMessageReply[];
};

export type SupportMessageReply = {
  id: string;
  support_message_id: string;
  author_user_id: string | null;
  author_type: 'admin' | 'system';
  body: string;
  delivery_channel: 'internal' | 'telegram' | 'email';
  delivery_status: 'sent' | 'prepared' | 'failed' | 'skipped';
  delivery_target: string | null;
  delivery_error: string | null;
  provider_message_id: string | null;
  metadata: Json | null;
  created_at: string;
};

export type SupportMessageCreateInput = {
  name: string;
  email: string;
  telegram?: string;
  subject?: string;
  message: string;
  source?: string;
  service_slug?: string;
  metadata?: Json | null;
};

export type PlatformAnnouncement = {
  id: string;
  title: string;
  body: string;
  cta_label: string | null;
  cta_href: string | null;
  audience: 'all' | 'authenticated';
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  priority: number;
  metadata: Json | null;
  created_by?: string | null;
  updated_by?: string | null;
  is_read?: boolean;
  read_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type PlatformAnnouncementSaveInput = {
  id?: string;
  title: string;
  body: string;
  cta_label?: string | null;
  cta_href?: string | null;
  audience?: 'all' | 'authenticated';
  is_active?: boolean;
  starts_at?: string | null;
  ends_at?: string | null;
  priority?: number;
  metadata?: Json | null;
};

export const supportLinksList = async (): Promise<{ links: SupportLink[] }> => {
  const res = await fetch(`${edgeBase}/support-center?action=links`, { method: 'GET', headers: publicApiHeaders });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`GET /support-center?action=links failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as { links: SupportLink[] };
};

export const supportAnnouncementsList = async (
  opts?: { limit?: number; accessToken?: string | null },
): Promise<{ announcements: PlatformAnnouncement[] }> => {
  const qs = new URLSearchParams({ action: 'announcements' });
  if (typeof opts?.limit === 'number' && Number.isFinite(opts.limit)) qs.set('limit', String(Math.floor(opts.limit)));
  const headers = opts?.accessToken ? apiHeaders(opts.accessToken) : publicApiHeaders;
  const res = await fetch(`${edgeBase}/support-center?${qs.toString()}`, { method: 'GET', headers });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`GET /support-center?action=announcements failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as { announcements: PlatformAnnouncement[] };
};

export const supportAnnouncementsMarkRead = async (
  accessToken: string,
  announcementIds: string[],
): Promise<{ ok: boolean; read_count: number }> => {
  const ids = Array.from(new Set(announcementIds.filter((id) => typeof id === 'string' && id.length > 0))).slice(0, 200);
  const res = await fetch(`${edgeBase}/support-center?action=announcements-read`, {
    method: 'POST',
    headers: { ...apiHeaders(accessToken), 'Content-Type': 'application/json' },
    body: JSON.stringify({ announcement_ids: ids }),
  });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`POST /support-center?action=announcements-read failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as { ok: boolean; read_count: number };
};

export const supportMessageCreate = async (
  body: SupportMessageCreateInput,
  accessToken?: string | null,
): Promise<{ ok: boolean; message: { id: string; created_at: string; status: string } | null }> => {
  const headers: HeadersInit = {
    ...publicApiHeaders,
    'Content-Type': 'application/json',
  };
  if (accessToken) (headers as Record<string, string>).Authorization = `Bearer ${accessToken}`;

  const res = await fetch(`${edgeBase}/support-center?action=message`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`POST /support-center?action=message failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as { ok: boolean; message: { id: string; created_at: string; status: string } | null };
};

export const adminSupportLinksList = async (accessToken: string): Promise<{ links: SupportLink[] }> => {
  const res = await fetch(`${edgeBase}/support-center?action=admin-links`, { method: 'GET', headers: apiHeaders(accessToken) });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`GET /support-center?action=admin-links failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as { links: SupportLink[] };
};

export const adminSupportLinkSave = async (
  accessToken: string,
  body: Partial<Pick<SupportLink, 'id' | 'label' | 'type' | 'value' | 'is_active' | 'display_order' | 'metadata'>>,
): Promise<{ link: SupportLink | null }> => {
  const res = await fetch(`${edgeBase}/support-center?action=admin-link`, {
    method: 'POST',
    headers: { ...apiHeaders(accessToken), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`POST /support-center?action=admin-link failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as { link: SupportLink | null };
};

export const adminSupportLinkDelete = async (accessToken: string, linkId: string): Promise<{ ok: boolean }> => {
  const url = `${edgeBase}/support-center?action=admin-link&id=${encodeURIComponent(linkId)}`;
  const res = await fetch(url, { method: 'DELETE', headers: apiHeaders(accessToken) });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`DELETE /support-center?action=admin-link failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as { ok: boolean };
};

export const adminSupportMessagesList = async (
  accessToken: string,
  opts?: { status?: string; query?: string; limit?: number },
): Promise<{ messages: SupportMessage[] }> => {
  const qs = new URLSearchParams({ action: 'admin-messages' });
  if (opts?.status) qs.set('status', opts.status);
  if (opts?.query) qs.set('query', opts.query);
  if (typeof opts?.limit === 'number' && Number.isFinite(opts.limit)) qs.set('limit', String(opts.limit));
  const res = await fetch(`${edgeBase}/support-center?${qs.toString()}`, { method: 'GET', headers: apiHeaders(accessToken) });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`GET /support-center?action=admin-messages failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as { messages: SupportMessage[] };
};

export const adminAnnouncementsList = async (
  accessToken: string,
  opts?: { limit?: number },
): Promise<{ announcements: PlatformAnnouncement[] }> => {
  const qs = new URLSearchParams({ action: 'admin-announcements' });
  if (typeof opts?.limit === 'number' && Number.isFinite(opts.limit)) qs.set('limit', String(Math.floor(opts.limit)));
  const res = await fetch(`${edgeBase}/support-center?${qs.toString()}`, { method: 'GET', headers: apiHeaders(accessToken) });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`GET /support-center?action=admin-announcements failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as { announcements: PlatformAnnouncement[] };
};

export const adminAnnouncementSave = async (
  accessToken: string,
  body: PlatformAnnouncementSaveInput,
): Promise<{ announcement: PlatformAnnouncement | null }> => {
  const res = await fetch(`${edgeBase}/support-center?action=admin-announcement`, {
    method: 'POST',
    headers: { ...apiHeaders(accessToken), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`POST /support-center?action=admin-announcement failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as { announcement: PlatformAnnouncement | null };
};

export const adminAnnouncementDelete = async (accessToken: string, id: string): Promise<{ ok: boolean }> => {
  const url = `${edgeBase}/support-center?action=admin-announcement&id=${encodeURIComponent(id)}`;
  const res = await fetch(url, { method: 'DELETE', headers: apiHeaders(accessToken) });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`DELETE /support-center?action=admin-announcement failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as { ok: boolean };
};

export const adminSupportMessageUpdate = async (
  accessToken: string,
  id: string,
  patch: { status?: SupportMessage['status']; admin_note?: string | null },
): Promise<{ message: SupportMessage | null }> => {
  const res = await fetch(`${edgeBase}/support-center?action=admin-message`, {
    method: 'PATCH',
    headers: { ...apiHeaders(accessToken), 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, ...patch }),
  });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`PATCH /support-center?action=admin-message failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as { message: SupportMessage | null };
};

export const adminSupportMessageReply = async (
  accessToken: string,
  body: { message_id: string; body: string; channel?: 'auto' | 'telegram' | 'email' | 'internal' },
): Promise<{ ok: boolean; reply: SupportMessageReply | null; message: SupportMessage | null; mailto_url?: string | null }> => {
  const res = await fetch(`${edgeBase}/support-center?action=admin-message-reply`, {
    method: 'POST',
    headers: { ...apiHeaders(accessToken), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`POST /support-center?action=admin-message-reply failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as { ok: boolean; reply: SupportMessageReply | null; message: SupportMessage | null; mailto_url?: string | null };
};

export type TeacherStudioStudentFeed = {
  academies: { id: string; name: string; slug: string; type: string; metadata?: Json | null }[];
  contacts: { id: string; academy_id: string; first_name: string; last_name: string; email: string | null; status: string }[];
  messages: {
    id: string;
    academy_id: string;
    conversation_id: string;
    contact_id: string | null;
    sender_type: string;
    message_type: string;
    content: string;
    metadata: Json | null;
    created_at: string;
  }[];
  alerts: {
    id: string;
    academy_id: string;
    contact_id: string | null;
    type: string;
    severity: string;
    message: string;
    resolved: boolean;
    resolved_at: string | null;
    metadata: Json | null;
    created_at: string;
  }[];
};

export type TeacherStudioStudentContact = {
  id: string;
  academy_id: string;
  user_id: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  telegram_id: string | null;
  status: string;
  metadata: Json | null;
  created_at: string;
  updated_at: string;
};

export type TeacherStudioStudentClassroom = {
  id: string;
  academy_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  metadata: Json | null;
  member_count: number;
  created_at: string;
  updated_at: string;
};

export type TeacherStudioStudentClassroomMembership = {
  id: string;
  academy_id: string;
  classroom_id: string;
  contact_id: string;
  role: string;
  joined_at: string;
  metadata: Json | null;
};

export type TeacherStudioStudentAnnouncement = {
  id: string;
  academy_id: string;
  classroom_id: string | null;
  title: string;
  body: string;
  metadata: Json | null;
  created_by: string | null;
  created_at: string;
};

export type TeacherStudioStudentEntitlement = {
  id: string;
  academy_id: string;
  contact_id: string;
  user_id: string | null;
  offer_id: string | null;
  payment_id: string | null;
  grant_type: string;
  resource_type: string | null;
  resource_id: string | null;
  capability_key: string | null;
  quantity: number | null;
  remaining: number | null;
  starts_at: string;
  expires_at: string | null;
  status: string;
  source: string;
  metadata: Json | null;
  created_at: string;
  updated_at: string;
};

export type TeacherStudioStudentPayment = {
  id: string;
  academy_id: string;
  contact_id: string;
  offer_id: string;
  provider: string;
  provider_transaction_id: string;
  amount: number;
  currency: string;
  status: string;
  metadata: Json | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type TeacherStudioStudentOffer = {
  id: string;
  academy_id: string;
  name: string;
  type: string;
  price_amount: number;
  currency: string;
  duration_days: number | null;
  description: string | null;
  is_active: boolean;
  metadata: Json | null;
  created_at: string;
  updated_at: string;
};

export type AcademyAccessPermissions = Partial<Record<
  | 'viewAcademy'
  | 'manageAcademy'
  | 'manageStaff'
  | 'manageFinance'
  | 'manageOffers'
  | 'manageBranding'
  | 'manageAutomation'
  | 'viewContacts'
  | 'manageContacts'
  | 'viewClassrooms'
  | 'manageClassrooms'
  | 'manageRoster'
  | 'manageMessages'
  | 'manageAnnouncements'
  | 'sendGlobalAnnouncements'
  | 'manageAlerts'
  | 'resolveAlerts'
  | 'viewEducationOS'
  | 'resolveActionItems'
  | 'manageAssignments'
  | 'gradeSubmissions'
  | 'markAttendance'
  | 'manageSchedule'
  | 'manageResources'
  | 'viewReports'
  | 'issueCertificates'
  | 'dispatchNotifications'
  | 'viewNotifications'
  | 'viewReferrals',
  boolean
>>;

export type AcademyAccessProfile = {
  role: string;
  source?: string | null;
  scope?: 'academy' | 'assigned_classrooms' | string;
  classroom_ids?: string[];
  center_tenant_id?: string | null;
  permissions?: AcademyAccessPermissions;
};

export type AcademyListItem = {
  id: string;
  name: string;
  slug: string;
  type: string;
  metadata?: Json | null;
  created_at?: string;
  role: string;
  status?: string;
  access?: AcademyAccessProfile;
};

export type AcademySummary = {
  academy_id: string;
  access?: AcademyAccessProfile;
  counts?: {
    contacts?: number;
    classrooms?: number;
    offers?: number;
    active_entitlements?: number;
    open_alerts?: number;
  };
};

export type TeacherStudioStudentDashboard = {
  academies: AcademyListItem[];
  contacts: TeacherStudioStudentContact[];
  classrooms: TeacherStudioStudentClassroom[];
  classroom_memberships: TeacherStudioStudentClassroomMembership[];
  announcements: TeacherStudioStudentAnnouncement[];
  messages: TeacherStudioStudentFeed['messages'];
  alerts: TeacherStudioStudentFeed['alerts'];
  entitlements: TeacherStudioStudentEntitlement[];
  payments: TeacherStudioStudentPayment[];
  offers: TeacherStudioStudentOffer[];
  access?: AcademyAccessProfile | null;
  summary?: AcademySummary | null;
};

const academyFeedFunctions = ['academy', 'teacher-studio'] as const;

const parseStatusFromMessage = (message: string): number | null => {
  const match = message.match(/\((\d{3})\)/);
  if (!match) return null;
  const status = Number(match[1]);
  return Number.isFinite(status) ? status : null;
};

export const teacherStudioStudentFeed = async (accessToken: string): Promise<TeacherStudioStudentFeed> => {
  let lastError: unknown = null;
  for (const fnName of academyFeedFunctions) {
    const res = await fetch(`${edgeBase}/${fnName}?action=student-feed`, {
      method: 'GET',
      headers: { ...apiHeaders(accessToken), 'x-user-jwt': accessToken },
    });
    if (res.ok) return (await res.json()) as TeacherStudioStudentFeed;

    const details = await readJsonOrText(res);
    const error = new Error(`GET /${fnName}?action=student-feed failed (${res.status}): ${JSON.stringify(details)}`);
    lastError = error;
    if (res.status !== 404 && res.status !== 405) throw error;
  }

  if (lastError instanceof Error && parseStatusFromMessage(lastError.message) !== null) {
    throw lastError;
  }
  throw new Error('GET /academy?action=student-feed failed');
};

export type LearningProfileSeedResponse = {
  user_id: string;
  generated_at: string;
  source: { rows: number; schema: string };
  latest_outcome: {
    id: string;
    session_id: string;
    user_id: string;
    product_id: string;
    experience_id: string;
    score_method: string;
    status: string;
    schema_version: string;
    overall_score: number | null;
    overall_band: number | null;
    section_scores: Json | null;
    skill_breakdown: Json | null;
    computed_at: string;
  } | null;
  skill_profile: Record<string, Json>;
  outcomes: Array<{
    id: string;
    session_id: string;
    user_id: string;
    product_id: string;
    experience_id: string;
    score_method: string;
    status: string;
    schema_version: string;
    overall_score: number | null;
    overall_band: number | null;
    section_scores: Json | null;
    skill_breakdown: Json | null;
    computed_at: string;
  }>;
};

export const learningProfileSeed = async (
  accessToken: string,
  opts?: { userId?: string; productId?: string; limit?: number },
): Promise<LearningProfileSeedResponse> => {
  const qs = new URLSearchParams();
  if (opts?.userId) qs.set('user_id', opts.userId);
  if (opts?.productId) qs.set('product_id', opts.productId);
  if (typeof opts?.limit === 'number' && Number.isFinite(opts.limit)) qs.set('limit', String(Math.floor(opts.limit)));

  const url = `${edgeBase}/${learningProfileEdgeSlug}${qs.toString() ? `?${qs.toString()}` : ''}`;
  const res = await fetch(url, { method: 'GET', headers: apiHeaders(accessToken) });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`GET /${learningProfileEdgeSlug} failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as LearningProfileSeedResponse;
};

export const teacherStudioStudentDashboard = async (accessToken: string): Promise<TeacherStudioStudentDashboard> => {
  let lastError: unknown = null;
  for (const fnName of academyFeedFunctions) {
    const res = await fetch(`${edgeBase}/${fnName}?action=student-dashboard`, {
      method: 'GET',
      headers: { ...apiHeaders(accessToken), 'x-user-jwt': accessToken },
    });
    if (res.ok) return (await res.json()) as TeacherStudioStudentDashboard;

    const details = await readJsonOrText(res);
    const error = new Error(`GET /${fnName}?action=student-dashboard failed (${res.status}): ${JSON.stringify(details)}`);
    lastError = error;
    if (res.status !== 404 && res.status !== 405) throw error;
  }

  if (lastError instanceof Error && parseStatusFromMessage(lastError.message) !== null) {
    throw lastError;
  }
  throw new Error('GET /academy?action=student-dashboard failed');
};

export type GradeWritingResponse = {
  evaluation: { id: string; method: string; status: string; result: Json; evaluated_at: string } | null;
};

export const gradeWriting = async (
  accessToken: string,
  sessionId: string,
  opts?: { force?: boolean },
): Promise<GradeWritingResponse> => {
  const res = await fetch(`${edgeBase}/${gradeWritingEdgeSlug}`, {
    method: 'POST',
    headers: { ...apiHeaders(accessToken), 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, force: opts?.force === true }),
  });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    const err = new Error('AI feedback request failed');
    (err as any).status = res.status;
    (err as any).details = details;
    throw err;
  }
  return (await res.json()) as GradeWritingResponse;
};

export type TeacherOfficeExperience = {
  id: string;
  name: string;
  is_active: boolean;
  product_id: string;
  price_amount?: number | null;
  price_currency?: string | null;
  products?: { name: string | null; slug: string | null } | null;
};

export type TeacherOfficeToken = {
  id: string;
  token_code: string;
  status: string;
  expires_at: string;
  created_at: string;
  experience_id: string;
  uses_count: number;
  max_uses: number;
  claimed_by?: string | null;
  experiences?: { name: string | null; product_id?: string | null } | null;
};

export type TeacherOfficePlan = {
  id: string;
  product_id: string;
  name: string;
  amount: number;
  currency: string;
  duration_days: number | null;
  metadata?: Json | null;
  products?: { name: string | null; slug: string | null } | null;
};

export type TeacherOfficeSeat = {
  id: string;
  status: string;
  expires_at: string;
  assigned_at: string | null;
  starts_at: string | null;
  ends_at: string | null;
  plan_id: string;
  product_id: string;
  assigned_user_id: string | null;
  assigned_user?: { email: string | null } | null;
  plans?: { name: string | null; duration_days: number | null } | null;
};

export type TeacherOfficeResult = {
  id: string;
  token_id: string;
  token_code: string | null;
  experience_name: string | null;
  candidate_name: string;
  email: string | null;
  phone: string | null;
  session_id: string | null;
  session_status: string | null;
  registration_status: string;
  overall_band: number | null;
  overall_score?: number | null;
  created_at: string;
};

export const teacherOfficeExperiences = async (accessToken: string): Promise<{ experiences: TeacherOfficeExperience[] }> => {
  const res = await fetch(`${edgeBase}/teacher-office?action=experiences`, { method: 'GET', headers: apiHeaders(accessToken) });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`GET /teacher-office experiences failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as { experiences: TeacherOfficeExperience[] };
};

export const teacherOfficeTokens = async (
  accessToken: string,
  tenantId?: string | null,
): Promise<{ tokens: TeacherOfficeToken[] }> => {
  const qs = new URLSearchParams({ action: 'tokens' });
  if (tenantId) qs.set('tenant_id', tenantId);
  const res = await fetch(`${edgeBase}/teacher-office?${qs.toString()}`, { method: 'GET', headers: apiHeaders(accessToken) });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`GET /teacher-office tokens failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as { tokens: TeacherOfficeToken[] };
};

export const teacherOfficeResults = async (
  accessToken: string,
  params?: { tenant_id?: string | null; token_id?: string | null },
): Promise<{ results: TeacherOfficeResult[] }> => {
  const qs = new URLSearchParams({ action: 'results' });
  if (params?.tenant_id) qs.set('tenant_id', params.tenant_id);
  if (params?.token_id) qs.set('token_id', params.token_id);
  const res = await fetch(`${edgeBase}/teacher-office?${qs.toString()}`, { method: 'GET', headers: apiHeaders(accessToken) });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`GET /teacher-office results failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as { results: TeacherOfficeResult[] };
};

export const teacherOfficePlans = async (accessToken: string): Promise<{ plans: TeacherOfficePlan[] }> => {
  const res = await fetch(`${edgeBase}/teacher-office?action=plans`, { method: 'GET', headers: apiHeaders(accessToken) });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`GET /teacher-office plans failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as { plans: TeacherOfficePlan[] };
};

export const teacherOfficeSeats = async (
  accessToken: string,
  tenantId?: string | null,
): Promise<{ seats: TeacherOfficeSeat[] }> => {
  const qs = new URLSearchParams({ action: 'seats' });
  if (tenantId) qs.set('tenant_id', tenantId);
  const res = await fetch(`${edgeBase}/teacher-office?${qs.toString()}`, { method: 'GET', headers: apiHeaders(accessToken) });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`GET /teacher-office seats failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as { seats: TeacherOfficeSeat[] };
};

export const teacherOfficeAssignSeat = async (
  accessToken: string,
  body: { tenant_id?: string | null; seat_id: string; email: string },
): Promise<{ seat: TeacherOfficeSeat | null }> => {
  const res = await fetch(`${edgeBase}/teacher-office`, {
    method: 'POST',
    headers: { ...apiHeaders(accessToken), 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'assign_seat', ...body }),
  });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`POST /teacher-office assign seat failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as { seat: TeacherOfficeSeat | null };
};

export type PartnerOfficeExperience = TeacherOfficeExperience & {
  product_name?: string | null;
  app_url?: string | null;
  ticketing?: Json | null;
  is_ticket_ready?: boolean;
};
export type PartnerOfficeTicket = TeacherOfficeToken;
export type PartnerOfficePlan = TeacherOfficePlan;
export type PartnerOfficeSeat = TeacherOfficeSeat;
export type PartnerOfficeResult = TeacherOfficeResult;

export type PartnerCenterProfile = {
  tenant_id: string;
  display_name: string;
  slug: string;
  logo_url?: string | null;
  status: string;
  package_tier: string;
  commercial_model: string;
  public_instructions?: string | null;
  powered_by_schood: boolean;
  branding?: Json | null;
  commission_rules?: Json | null;
  wholesale_pricing?: Json | null;
  wallet_settings?: Json | null;
  capabilities?: PartnerCenterCapabilities | null;
  created_at?: string;
  updated_at?: string;
};

export type PartnerCenterCapabilities = {
  tier: 'starter' | 'growth' | 'premium' | 'exclusive';
  tier_label: string;
  staff_limit: number;
  max_voucher_batch_quantity: number;
  max_active_groups: number;
  max_upcoming_events: number;
  groups_enabled: boolean;
  student_invites_enabled: boolean;
  mock_events_enabled: boolean;
  review_queue_enabled: boolean;
  analytics_enabled: boolean;
  pdf_reports_enabled: boolean;
  statements_enabled: boolean;
  advanced_branding_enabled: boolean;
  public_events_enabled: boolean;
  payouts_enabled: boolean;
  white_label_enabled: boolean;
  included_features: string[];
};

export type PartnerCenterAccess = {
  role: 'owner' | 'admin' | 'teacher' | 'counselor' | null;
  can_manage: boolean;
  can_operate: boolean;
  can_invite_students: boolean;
  can_manage_finance: boolean;
  can_manage_inventory: boolean;
  can_manage_staff: boolean;
  can_manage_academies: boolean;
  can_manage_branding: boolean;
  can_view_results: boolean;
  can_manage_reviews: boolean;
};

export type PartnerVoucherBatch = {
  id: string;
  tenant_id: string;
  batch_code: string;
  access_kind: 'mock_exam' | 'subscription' | 'seat';
  product_id: string | null;
  experience_id: string | null;
  plan_id: string | null;
  classroom_id?: string | null;
  quantity: number;
  created_by?: string | null;
  expires_at: string;
  status: string;
  prefix?: string | null;
  source_model: string;
  metadata?: Json | null;
  created_at: string;
  products?: { name: string | null; metadata?: Json | null } | null;
  experiences?: { name: string | null } | null;
  plans?: { name: string | null; duration_days?: number | null } | null;
  academy_classrooms?: { id?: string | null; name?: string | null; academy_id?: string | null } | null;
};

export type PartnerVoucherDispatch = {
  id: string;
  channel: 'sms' | 'telegram';
  provider?: string | null;
  recipient_name?: string | null;
  recipient_phone?: string | null;
  recipient_email?: string | null;
  telegram_chat_id?: string | null;
  redeem_url?: string | null;
  status: 'prepared' | 'sent' | 'failed';
  attempted_at: string;
};

export type PartnerVoucher = {
  id: string;
  tenant_id: string;
  batch_id: string | null;
  code: string;
  access_kind: 'mock_exam' | 'subscription' | 'seat';
  product_id: string | null;
  experience_id: string | null;
  plan_id: string | null;
  classroom_id?: string | null;
  exam_token_id?: string | null;
  seat_license_id?: string | null;
  status: string;
  max_uses: number;
  uses_count: number;
  expires_at: string;
  assigned_name?: string | null;
  assigned_email?: string | null;
  assigned_phone?: string | null;
  redeemed_by?: string | null;
  redeemed_at?: string | null;
  metadata?: Json | null;
  created_at: string;
  products?: { name: string | null; metadata?: Json | null } | null;
  experiences?: { name: string | null } | null;
  plans?: { name: string | null; duration_days?: number | null } | null;
  academy_classrooms?: { id?: string | null; name?: string | null; academy_id?: string | null } | null;
  partner_voucher_dispatches?: PartnerVoucherDispatch[];
};

export type PartnerStudent = {
  id: string;
  student_id?: string | null;
  voucher_code?: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  access_kind: string;
  product_name: string | null;
  status: string;
  redeemed_by?: string | null;
  redeemed_at?: string | null;
  expires_at?: string | null;
  last_activity_at?: string | null;
  groups?: Array<{ id: string; name: string }>;
  metadata?: Json | null;
};

export type PartnerCenterStaffMember = {
  id: string;
  tenant_id: string;
  user_id: string;
  role: string;
  status: string;
  created_at: string;
  users?: { email?: string | null; full_name?: string | null } | null;
};

export type PartnerCenterStaffInvite = {
  id: string;
  tenant_id: string;
  email: string;
  role: string;
  status: string;
  expires_at: string;
  accepted_by?: string | null;
  accepted_at?: string | null;
  created_at: string;
};

export type PartnerReportSummary = {
  completed_exams: number;
  average_score: number | null;
  active_students: number;
  inactive_vouchers: number;
  expiring_vouchers: number;
  unassigned_seats: number;
  active_groups?: number;
  upcoming_events?: number;
  pending_reviews?: number;
  registered_students?: number;
};

export type PartnerPaymentCapability = {
  provider: string;
  label: string;
  currency: string;
  min_amount: number;
  max_amount: number;
  enabled: boolean;
  temporary?: boolean;
};

export type PartnerClassroomHeatmap = {
  classroom_id: string | null;
  classroom_name: string;
  attempts: number;
  completed_attempts: number;
  average_score: number | null;
  skills: Array<{ id: string; label: string; average_score: number | null; attempts: number }>;
  weakest_subskill: string | null;
  systemic_gaps: Array<{ label: string; count: number; share: number }>;
  focus_areas: string[];
};

export type PartnerOfficeAnalytics = Json & {
  classroom_heatmaps?: PartnerClassroomHeatmap[];
};

export type PartnerCenterTierPlan = {
  id: string;
  name: string;
  tier: 'growth' | 'premium' | 'exclusive';
  billing_period: 'monthly' | 'annual';
  amount: number;
  currency: string;
  duration_days?: number | null;
  metadata?: Json | null;
};

export type PartnerCenterTierCatalogItem = {
  tier: 'growth' | 'premium' | 'exclusive';
  tier_label: string;
  capabilities: PartnerCenterCapabilities;
  plans: PartnerCenterTierPlan[];
  current: boolean;
  upgrade_available: boolean;
};

export type PartnerCenterTierRequest = {
  id: string;
  tenant_id: string;
  previous_tier: string;
  requested_tier: string;
  billing_period: string;
  amount: number;
  currency: string;
  status: string;
  payment_id?: string | null;
  requested_by?: string | null;
  approved_by?: string | null;
  applied_at?: string | null;
  expires_at?: string | null;
  metadata?: Json | null;
  created_at: string;
  payments?: PartnerOfficePayment | null;
  center?: PartnerCenterProfile | null;
};

export type PartnerCenterTierCatalog = {
  product_id: string;
  current_tier: string;
  current_capabilities: PartnerCenterCapabilities;
  tiers: PartnerCenterTierCatalogItem[];
  subscription?: Json | null;
  requests: PartnerCenterTierRequest[];
};

export type PartnerCenterAcademy = {
  id: string;
  name: string;
  slug: string;
  type: string;
  metadata?: Json | null;
  created_at: string;
  counts?: {
    staff?: number;
    admins?: number;
    contacts?: number;
    active_contacts?: number;
    classrooms?: number;
    active_classrooms?: number;
    offers?: number;
    active_offers?: number;
  };
  classrooms?: Array<{ id: string; academy_id: string; name: string; is_active: boolean }>;
  academy_url?: string;
  academy_office_url?: string;
  teacher_office_url?: string;
  student_workspace_url?: string;
  classroom_directory_url?: string;
};

export type PartnerCenterGroup = {
  id: string;
  tenant_id: string;
  name: string;
  description?: string | null;
  product_id?: string | null;
  assigned_teacher_membership_id?: string | null;
  status: string;
  metadata?: Json | null;
  created_at: string;
  student_count?: number;
};

export type PartnerCenterMockEvent = {
  id: string;
  tenant_id: string;
  title: string;
  product_id?: string | null;
  experience_id?: string | null;
  group_id?: string | null;
  voucher_batch_id?: string | null;
  starts_at: string;
  ends_at?: string | null;
  mode: 'online' | 'offline' | 'hybrid';
  location?: string | null;
  meeting_url?: string | null;
  capacity?: number | null;
  status: string;
  instructions?: string | null;
  metadata?: Json | null;
  registered_count?: number;
  present_count?: number;
  registrations?: PartnerCenterEventRegistration[];
  experiences?: { name?: string | null } | null;
  partner_center_groups?: { name?: string | null } | null;
  partner_voucher_batches?: { batch_code?: string | null } | null;
};

export type PartnerCenterEventRegistration = {
  id: string;
  tenant_id: string;
  event_id: string;
  student_id?: string | null;
  voucher_id?: string | null;
  registration_status: string;
  attendance_status: 'pending' | 'present' | 'absent' | 'late';
  checked_in_at?: string | null;
  created_at?: string | null;
  partner_center_students?: { full_name?: string | null; email?: string | null; phone?: string | null } | null;
  partner_vouchers?: { code?: string | null; assigned_name?: string | null; assigned_email?: string | null; assigned_phone?: string | null; status?: string | null } | null;
};

export type PartnerCenterStudentInvite = {
  id: string;
  tenant_id: string;
  student_id?: string | null;
  group_id?: string | null;
  voucher_batch_id?: string | null;
  voucher_id?: string | null;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  invite_url?: string | null;
  message?: string | null;
  expires_at: string;
  metadata?: Json | null;
  created_at: string;
  partner_center_groups?: { name?: string | null } | null;
  partner_voucher_batches?: { batch_code?: string | null } | null;
  partner_vouchers?: { code?: string | null; status?: string | null } | null;
};

export type PartnerCenterReviewItem = {
  id: string;
  tenant_id: string;
  student_id?: string | null;
  group_id?: string | null;
  event_id?: string | null;
  skill: 'writing' | 'speaking' | 'manual';
  assigned_staff_membership_id?: string | null;
  status: string;
  due_at?: string | null;
  score?: number | null;
  max_score?: number | null;
  notes?: string | null;
  created_at: string;
  partner_center_students?: { full_name?: string | null; email?: string | null } | null;
  partner_center_groups?: { name?: string | null } | null;
  partner_center_mock_events?: { title?: string | null } | null;
};

export type PartnerCenterStatement = {
  id: string;
  tenant_id: string;
  period_start: string;
  period_end: string;
  currency: string;
  opening_balance: number;
  credits_total: number;
  debits_total: number;
  closing_balance: number;
  status: string;
  created_at: string;
};

export type PartnerOfficePayment = {
  id: string;
  provider: string | null;
  provider_transaction_id: string | null;
  status: string;
  amount: number;
  original_amount: number | null;
  discount_amount: number | null;
  credit_amount?: number | null;
  referral_discount_amount?: number | null;
  final_amount?: number | null;
  currency: string;
  purchase_type?: string | null;
  product_id?: string | null;
  plan_id?: string | null;
  created_at: string;
  granted_at?: string | null;
  metadata?: Json | null;
};

export type PartnerCreditLedgerEntry = {
  id: string;
  amount: number;
  currency: string;
  entry_kind: string;
  status: string;
  payment_id?: string | null;
  reward_id?: string | null;
  metadata?: Json | null;
  created_at: string;
};

export type ReferralProgram = {
  id: string;
  program_key: string;
  name: string;
  status: string;
  currency: string;
  referred_discount_type: 'percent' | 'fixed' | null;
  referred_discount_value: number | null;
  referrer_credit_type: 'percent' | 'fixed' | null;
  referrer_credit_value: number | null;
  referrer_credit_cap: number | null;
  referrer_cash_type?: 'percent' | 'fixed' | null;
  referrer_cash_value?: number | null;
  referrer_cash_cap?: number | null;
  cash_payouts_enabled?: boolean;
  minimum_cash_payout_amount?: number;
  min_purchase_amount: number | null;
  eligible_purchase_types: string[];
  first_purchase_only: boolean;
  metadata?: Json | null;
  created_at?: string;
  updated_at?: string;
};

export type ReferralShareLink = {
  id: string;
  label: string;
  description?: string;
  path: string;
  audience?: string;
  service?: string;
  primary?: boolean;
};

export type ReferralProgramStrategy = {
  brand_name: string;
  tagline: string;
  description?: string;
  audiences?: Array<{ id: string; label: string; description?: string }>;
  milestones?: Array<{ label: string; description?: string }>;
  rules?: string[];
};

export type AffiliateProgramStrategy = {
  brand_name: string;
  tagline: string;
  guarantee_label?: string;
  guarantee_window_days?: number;
  description?: string;
  terms?: string[];
  proof_points?: string[];
};

export type AffiliateGuaranteeSummary = {
  mode: string;
  status: string;
  tracked_attributions: number;
  pending_attributions: number;
  converted_attributions: number;
  issued_rewards: number;
  guaranteed_rewards: number;
  reserved_credit_amount: number;
  reserved_cash_amount: number;
  available_cash_amount: number;
  requested_cash_amount: number;
  paid_cash_amount: number;
  minimum_cash_payout_amount: number;
  cash_payouts_enabled: boolean;
  currency: string;
};

export type ReferralMeResponse = {
  account: { id: string; user_id: string; referral_code: string; status: string; metadata?: Json | null };
  program: ReferralProgram | null;
  referral_url_path: string;
  legacy_referral_url_path?: string;
  affiliate_urls?: { landing?: string; signup?: string; plans?: string };
  share_links?: ReferralShareLink[];
  program_strategy?: ReferralProgramStrategy;
  affiliate_links?: ReferralShareLink[];
  affiliate_program?: AffiliateProgramStrategy;
  affiliate_guarantee?: AffiliateGuaranteeSummary;
  credit: { currency: string; available_amount: number; earned_amount?: number };
  cash?: {
    currency: string;
    available_amount: number;
    requested_amount: number;
    paid_amount: number;
    payouts_enabled: boolean;
    minimum_payout_amount: number;
  };
  attributions: any[];
  rewards: any[];
  ledger: PartnerCreditLedgerEntry[];
  cash_payout_requests?: any[];
};

export const partnerOfficeGet = async <T = unknown>(
  accessToken: string,
  action: string,
  params?: Record<string, string | number | null | undefined>,
): Promise<T> => {
  const qs = new URLSearchParams({ action });
  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value !== null && typeof value !== 'undefined' && value !== '') qs.set(key, String(value));
  });
  const res = await fetch(`${edgeBase}/partner-office?${qs.toString()}`, { method: 'GET', headers: apiHeaders(accessToken) });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`GET /partner-office ${action} failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as T;
};

export class PartnerOfficeRequestError extends Error {
  readonly status: number;
  readonly details: unknown;
  constructor(status: number, details: unknown) {
    super(`POST /partner-office failed (${status}): ${JSON.stringify(details)}`);
    this.status = status; this.details = details;
  }
}

export const partnerOfficePost = async <T = unknown>(
  accessToken: string,
  body: Json,
): Promise<T> => {
  const res = await fetch(`${edgeBase}/partner-office`, {
    method: 'POST',
    headers: { ...apiHeaders(accessToken), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new PartnerOfficeRequestError(res.status, details);
  }
  return (await res.json()) as T;
};

export const partnerOfficeDashboard = (accessToken: string, tenantId?: string | null) =>
  partnerOfficeGet<{
    tenant_id: string;
    center?: PartnerCenterProfile | null;
    capabilities?: PartnerCenterCapabilities | null;
    counts: Record<string, number>;
    wallet?: { currency: string; available_amount: number };
    credit: { currency: string; available_amount: number };
  }>(
    accessToken,
    'dashboard',
    { tenant_id: tenantId },
  );
export const partnerOfficeCenter = (accessToken: string, tenantId?: string | null) =>
  partnerOfficeGet<{ center: PartnerCenterProfile | null; tenant: { id: string; name: string; slug: string } | null; access?: PartnerCenterAccess; needs_application?: boolean }>(
    accessToken,
    'center',
    { tenant_id: tenantId },
  );
export const partnerOfficeAcademies = (accessToken: string, tenantId?: string | null) =>
  partnerOfficeGet<{ academies: PartnerCenterAcademy[] }>(accessToken, 'academies', { tenant_id: tenantId });
export const partnerOfficeCatalog = (accessToken: string) =>
  partnerOfficeGet<{ experiences: PartnerOfficeExperience[]; plans?: PartnerOfficePlan[]; products?: AdminProductRow[] }>(accessToken, 'catalog');
export const partnerOfficeTickets = (accessToken: string, tenantId?: string | null) =>
  partnerOfficeGet<{ tickets: PartnerOfficeTicket[] }>(accessToken, 'tickets', { tenant_id: tenantId });
export const partnerOfficeVoucherBatches = (accessToken: string, tenantId?: string | null) =>
  partnerOfficeGet<{ batches: PartnerVoucherBatch[] }>(accessToken, 'voucher_batches', { tenant_id: tenantId });
export const partnerOfficeVouchers = (accessToken: string, params?: { tenant_id?: string | null; status?: string | null }) =>
  partnerOfficeGet<{ vouchers: PartnerVoucher[] }>(accessToken, 'vouchers', params);
export const partnerOfficeStudents = (accessToken: string, tenantId?: string | null) =>
  partnerOfficeGet<{ students: PartnerStudent[] }>(accessToken, 'students', { tenant_id: tenantId });
export const partnerOfficeStudentInvites = (accessToken: string, tenantId?: string | null) =>
  partnerOfficeGet<{ invites: PartnerCenterStudentInvite[] }>(accessToken, 'student_invites', { tenant_id: tenantId });
export const partnerOfficeStaff = (accessToken: string, tenantId?: string | null) =>
  partnerOfficeGet<{ members: PartnerCenterStaffMember[]; invites: PartnerCenterStaffInvite[] }>(accessToken, 'staff', { tenant_id: tenantId });
export const partnerOfficeResults = (accessToken: string, params?: { tenant_id?: string | null; token_id?: string | null }) =>
  partnerOfficeGet<{ results: PartnerOfficeResult[] }>(accessToken, 'results', params);
export const partnerOfficeReports = (accessToken: string, tenantId?: string | null) =>
  partnerOfficeGet<{ reports: PartnerReportSummary; results: PartnerOfficeResult[] }>(accessToken, 'reports', { tenant_id: tenantId });
export const partnerOfficePlans = (accessToken: string) =>
  partnerOfficeGet<{ plans: PartnerOfficePlan[] }>(accessToken, 'plans');
export const partnerOfficeSeats = (accessToken: string, tenantId?: string | null) =>
  partnerOfficeGet<{ seats: PartnerOfficeSeat[] }>(accessToken, 'seats', { tenant_id: tenantId });
export const partnerOfficePayments = (accessToken: string, tenantId?: string | null) =>
  partnerOfficeGet<{ payments: PartnerOfficePayment[] }>(accessToken, 'payments', { tenant_id: tenantId });
export const partnerOfficeWallet = (accessToken: string, tenantId?: string | null) =>
  partnerOfficeGet<{ wallet: { currency: string; available_amount: number }; credit: { currency: string; available_amount: number }; ledger: PartnerCreditLedgerEntry[] }>(
    accessToken,
    'wallet',
    { tenant_id: tenantId },
  );
export const partnerOfficeCredits = (accessToken: string) =>
  partnerOfficeGet<{ wallet?: { currency: string; available_amount: number }; credit: { currency: string; available_amount: number }; ledger: PartnerCreditLedgerEntry[] }>(accessToken, 'credits');
export const partnerOfficeReferrals = (accessToken: string) =>
  partnerOfficeGet<ReferralMeResponse>(accessToken, 'referrals');
export const partnerOfficeCommissions = (accessToken: string) =>
  partnerOfficeGet<{ account: any; cash: any; rewards: any[]; cash_payout_requests: any[] }>(accessToken, 'commissions');
export const partnerOfficePaymentCapabilities = (accessToken: string) =>
  partnerOfficeGet<{ providers: PartnerPaymentCapability[]; default_provider: string }>(accessToken, 'payment_capabilities');
export const partnerOfficeTierCatalog = (accessToken: string, tenantId?: string | null) =>
  partnerOfficeGet<PartnerCenterTierCatalog>(accessToken, 'tier_catalog', { tenant_id: tenantId });
export const partnerOfficeGroups = (accessToken: string, tenantId?: string | null) =>
  partnerOfficeGet<{ groups: PartnerCenterGroup[] }>(accessToken, 'groups', { tenant_id: tenantId });
export const partnerOfficeMockEvents = (accessToken: string, tenantId?: string | null) =>
  partnerOfficeGet<{ events: PartnerCenterMockEvent[] }>(accessToken, 'mock_events', { tenant_id: tenantId });
export const partnerOfficeReviewQueue = (accessToken: string, tenantId?: string | null) =>
  partnerOfficeGet<{ review_items: PartnerCenterReviewItem[] }>(accessToken, 'review_queue', { tenant_id: tenantId });
export const partnerOfficeAnalytics = (accessToken: string, tenantId?: string | null) =>
  partnerOfficeGet<{ analytics: PartnerOfficeAnalytics }>(accessToken, 'analytics', { tenant_id: tenantId });
export const partnerOfficeStatements = (accessToken: string, tenantId?: string | null) =>
  partnerOfficeGet<{ statements: PartnerCenterStatement[] }>(accessToken, 'statements', { tenant_id: tenantId });

export const partnerOfficeUpdateCenter = (
  accessToken: string,
  body: Partial<Pick<PartnerCenterProfile, 'display_name' | 'slug' | 'logo_url' | 'public_instructions' | 'powered_by_schood' | 'branding'>> & {
    tenant_id?: string | null;
    center_office?: boolean;
  },
) => partnerOfficePost<{ center: PartnerCenterProfile }>(accessToken, { action: 'update_center_profile', ...body });

export const partnerOfficeApplyCenter = (
  accessToken: string,
  body: {
    display_name: string;
    slug?: string;
    logo_url?: string;
    public_instructions?: string;
    contact_name?: string;
    contact_email?: string;
    contact_phone?: string;
  },
) => partnerOfficePost<{ center: PartnerCenterProfile; tenant: { id: string; name: string; slug: string; type?: string }; status: string; note?: string }>(
  accessToken,
  { action: 'apply_center', ...body },
);

export const partnerOfficeAcceptStaffInvites = (accessToken: string) =>
  partnerOfficePost<{ accepted: PartnerCenterStaffMember[] }>(accessToken, { action: 'accept_staff_invites' });

export const partnerOfficeInviteStaff = (
  accessToken: string,
  body: { tenant_id?: string | null; email: string; role: 'admin' | 'member' | 'teacher' | 'counselor' },
) => partnerOfficePost<{ members: PartnerCenterStaffMember[]; invites: PartnerCenterStaffInvite[]; mode?: string }>(accessToken, { action: 'invite_staff', ...body });

export const partnerOfficeUpdateStaff = (
  accessToken: string,
  body: { tenant_id?: string | null; membership_id: string; role?: 'admin' | 'member' | 'teacher' | 'counselor'; status?: 'active' | 'disabled' },
) => partnerOfficePost<{ members: PartnerCenterStaffMember[]; invites: PartnerCenterStaffInvite[] }>(accessToken, { action: 'update_staff', ...body });

export const partnerOfficeCreateAcademy = (
  accessToken: string,
  body: { tenant_id?: string | null; name: string; slug?: string | null; center_office?: boolean },
) => partnerOfficePost<{ academy: PartnerCenterAcademy; academies: PartnerCenterAcademy[] }>(accessToken, { action: 'create_academy', ...body });

export const partnerOfficeSyncAcademyContacts = (
  accessToken: string,
  body: { tenant_id?: string | null; academy_id: string },
) => partnerOfficePost<{ academy: PartnerCenterAcademy; academies: PartnerCenterAcademy[]; synced_count: number }>(accessToken, { action: 'sync_academy_contacts', ...body });

export const partnerOfficeCreateGroup = (accessToken: string, body: { tenant_id?: string | null; name: string; description?: string | null; assigned_teacher_membership_id?: string | null; product_id?: string | null }) =>
  partnerOfficePost<{ group: PartnerCenterGroup; groups: PartnerCenterGroup[] }>(accessToken, { action: 'create_group', ...body });
export const partnerOfficeUpdateGroup = (accessToken: string, body: { tenant_id?: string | null; group_id: string; name?: string; description?: string | null; status?: string; assigned_teacher_membership_id?: string | null; product_id?: string | null }) =>
  partnerOfficePost<{ group: PartnerCenterGroup; groups: PartnerCenterGroup[] }>(accessToken, { action: 'update_group', ...body });
export const partnerOfficeAssignStudentGroup = (accessToken: string, body: { tenant_id?: string | null; student_id: string; group_id: string; status?: 'active' | 'removed' }) =>
  partnerOfficePost<{ membership: any; groups: PartnerCenterGroup[]; students: PartnerStudent[] }>(accessToken, { action: 'assign_student_group', ...body });
export const partnerOfficeCreateStudentInvites = (
  accessToken: string,
  body: { tenant_id?: string | null; students: Array<{ name?: string; full_name?: string; email?: string; phone?: string }>; group_id?: string | null; voucher_batch_id?: string | null; origin?: string },
) => partnerOfficePost<{ invites: PartnerCenterStudentInvite[]; all_invites?: PartnerCenterStudentInvite[]; students: PartnerStudent[] }>(accessToken, { action: 'create_student_invites', ...body });
export const partnerOfficeResendStudentInvite = (
  accessToken: string,
  body: { tenant_id?: string | null; invite_id: string; origin?: string | null },
) => partnerOfficePost<{ invite: PartnerCenterStudentInvite; invites: PartnerCenterStudentInvite[]; message?: string | null; status?: string }>(accessToken, { action: 'resend_student_invite', ...body });
export const partnerOfficeRevokeStudentInvite = (
  accessToken: string,
  body: { tenant_id?: string | null; invite_id: string },
) => partnerOfficePost<{ invite: PartnerCenterStudentInvite; invites: PartnerCenterStudentInvite[] }>(accessToken, { action: 'revoke_student_invite', ...body });
export const partnerOfficeCreateMockEvent = (
  accessToken: string,
  body: Partial<PartnerCenterMockEvent> & { tenant_id?: string | null; title: string; starts_at: string },
) => partnerOfficePost<{ event: PartnerCenterMockEvent; events: PartnerCenterMockEvent[] }>(accessToken, { action: 'create_mock_event', ...body });
export const partnerOfficeUpdateMockEvent = (
  accessToken: string,
  body: Partial<PartnerCenterMockEvent> & { tenant_id?: string | null; event_id: string },
) => partnerOfficePost<{ event: PartnerCenterMockEvent; events: PartnerCenterMockEvent[] }>(accessToken, { action: 'update_mock_event', ...body });
export const partnerOfficeMarkEventAttendance = (
  accessToken: string,
  body: { tenant_id?: string | null; event_id?: string; registration_id?: string | null; student_id?: string | null; voucher_id?: string | null; attendance_status: 'pending' | 'present' | 'absent' | 'late' },
) => partnerOfficePost<{ registration: any; events: PartnerCenterMockEvent[] }>(accessToken, { action: 'mark_event_attendance', ...body });
export const partnerOfficeUpdateReviewItem = (
  accessToken: string,
  body: Partial<PartnerCenterReviewItem> & { tenant_id?: string | null; review_item_id?: string },
) => partnerOfficePost<{ review_item: PartnerCenterReviewItem; review_items: PartnerCenterReviewItem[] }>(accessToken, { action: body.review_item_id ? 'update_review_item' : 'assign_review_item', ...body });

export const partnerOfficeUploadCenterLogo = async (
  accessToken: string,
  tenantId: string,
  file: File,
): Promise<{ center: PartnerCenterProfile; logo_url: string | null; storage: Json }> => {
  const body = new FormData();
  body.set('file', file);
  const res = await fetch(`${edgeBase}/partner-office?action=upload_center_logo&tenant_id=${encodeURIComponent(tenantId)}`, {
    method: 'POST',
    headers: apiHeaders(accessToken),
    body,
  });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`POST /partner-office upload_center_logo failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as { center: PartnerCenterProfile; logo_url: string | null; storage: Json };
};

export const partnerOfficeCreateWalletTopup = (
  accessToken: string,
  body: { idempotency_key?: string; tenant_id?: string | null; amount: number; currency?: string; note?: string | null; center_office?: boolean; settlement_mode?: 'online' | 'manual'; redirect_url?: string | null },
) => partnerOfficePost<ClickCreateResponse | { ledger_entry: PartnerCreditLedgerEntry }>(accessToken, { action: 'create_wallet_topup', ...body });

export type IssuedVoucherBatch = {state:'issued';idempotency_key:string;deduped:boolean;batch:PartnerVoucherBatch;vouchers:PartnerVoucher[]};
export type VoucherRequestOutcome = IssuedVoucherBatch | {state:'canceled';idempotency_key:string};

export const partnerOfficeCreateVoucherBatch = (
  accessToken: string,
  body: {
    tenant_id?: string | null;
    idempotency_key?: string | null;
    access_kind: 'mock_exam' | 'subscription' | 'seat';
    experience_id?: string | null;
    plan_id?: string | null;
    product_id?: string | null;
    quantity: number;
    expires_in_days?: number | null;
    expires_at?: string | null;
    prefix?: string | null;
    source_model?: string | null;
    classroom_id?: string | null;
    center_office?: boolean;
    assigned_students?: Array<{ name?: string; email?: string; phone?: string }>;
  },
) => partnerOfficePost<IssuedVoucherBatch>(accessToken, { action: 'create_voucher_batch', ...body });

export const partnerOfficeCancelVoucherRequest = (accessToken:string,body:Parameters<typeof partnerOfficeCreateVoucherBatch>[1]) =>
  partnerOfficePost<VoucherRequestOutcome>(accessToken,{action:'cancel_voucher_request',...body});

export const partnerOfficeExportVoucherSheet = (
  accessToken: string,
  body: { tenant_id?: string | null; batch_id: string; origin?: string; center_office?: boolean },
) => partnerOfficePost<{ filename: string; content_type: string; pdf_base64: string; count: number }>(accessToken, { action: 'export_voucher_sheet', ...body });

export const partnerOfficeDispatchVoucherBatch = (
  accessToken: string,
  body: {
    tenant_id?: string | null;
    batch_id: string;
    channel?: 'sms' | 'telegram';
    recipients: string | Array<{ name?: string; full_name?: string; email?: string; phone?: string; phone_number?: string; telegram_chat_id?: string; chat_id?: string }>;
    message_template?: string | null;
    origin?: string;
    center_office?: boolean;
  },
) => partnerOfficePost<{ batch_id: string; channel: string; sent: number; prepared: number; failed: number; dispatches: Array<Json> }>(
  accessToken,
  { action: 'dispatch_voucher_batch', ...body },
);

export const partnerOfficeGenerateClassroomLessonPlan = (
  accessToken: string,
  body: { tenant_id?: string | null; classroom_id?: string | null; center_office?: boolean },
) => partnerOfficePost<{ classroom_id: string | null; classroom_name: string; heatmap: PartnerClassroomHeatmap; lesson_plan: string }>(
  accessToken,
  { action: 'generate_classroom_lesson_plan', ...body },
);

export const partnerOfficeVoidVoucher = (
  accessToken: string,
  body: { tenant_id?: string | null; voucher_id: string; reason?: string | null; center_office?: boolean },
) => partnerOfficePost<{ voucher: PartnerVoucher }>(accessToken, { action: 'void_voucher', ...body });

export const partnerOfficeExportReport = (accessToken: string, tenantId?: string | null, centerOffice = false) =>
  partnerOfficePost<{ filename: string; csv: string }>(accessToken, { action: 'export_report', tenant_id: tenantId, center_office: centerOffice });
export const partnerOfficeExportPdfReport = (
  accessToken: string,
  body: { tenant_id?: string | null; report_type: 'student' | 'group' | 'event'; filters?: Json; center_office?: boolean },
) => {
  const action =
    body.report_type === 'student' ? 'export_student_report_pdf' : body.report_type === 'group' ? 'export_group_report_pdf' : 'export_event_report_pdf';
  return partnerOfficePost<{ filename: string; content_type: string; pdf_base64: string; report_export?: any }>(accessToken, { action, ...body });
};
export const partnerOfficeGenerateStatement = (
  accessToken: string,
  body: { tenant_id?: string | null; period_start?: string; period_end?: string; currency?: string; center_office?: boolean },
) => partnerOfficePost<{ statement: PartnerCenterStatement; filename: string; content_type: string; pdf_base64: string }>(accessToken, { action: 'generate_statement', ...body });

export const partnerOfficeRequestCashPayout = (
  accessToken: string,
  body: { payout_method: string; payout_details?: Json | null; note?: string | null; reward_ids?: string[]; tenant_id?: string | null; center_office?: boolean },
) => partnerOfficePost<{ cash_payout_request: any; reward_ids: string[] }>(accessToken, { action: 'request_cash_payout', ...body });

export const partnerOfficeAssignSeat = (
  accessToken: string,
  body: { tenant_id?: string | null; seat_id: string; email: string; center_office?: boolean },
) => partnerOfficePost<{ seat: PartnerOfficeSeat | null }>(accessToken, { action: 'assign_seat', ...body });

export const partnerOfficeCreateTicketPurchase = (
  accessToken: string,
  body: {
    idempotency_key?: string;
    tenant_id?: string | null;
    experience_id: string;
    quantity: number;
    expires_in_days?: number;
    apply_credit?: boolean;
    credit_amount?: number | null;
    referral_code?: string | null;
    center_office?: boolean;
    redirect_url?: string | null;
  },
) => partnerOfficePost<ClickCreateResponse>(accessToken, { action: 'create_ticket_purchase', ...body });

export const partnerOfficeCreateSeatPurchase = (
  accessToken: string,
  body: {
    idempotency_key?: string;
    tenant_id?: string | null;
    plan_id: string;
    seat_count: number;
    apply_credit?: boolean;
    credit_amount?: number | null;
    referral_code?: string | null;
    center_office?: boolean;
    redirect_url?: string | null;
  },
) => partnerOfficePost<ClickCreateResponse>(accessToken, { action: 'create_seat_purchase', ...body });

export const partnerOfficeCreateTierUpgradePayment = (
  accessToken: string,
  body: {
    idempotency_key?: string;
    tenant_id?: string | null;
    requested_tier: 'growth' | 'premium' | 'exclusive';
    billing_period: 'monthly' | 'annual';
    center_office?: boolean;
    redirect_url?: string | null;
  },
) => partnerOfficePost<ClickCreateResponse & { tier_request?: PartnerCenterTierRequest }>(accessToken, { action: 'create_tier_upgrade_payment', ...body });

export const referralsMe = async (accessToken: string): Promise<ReferralMeResponse> => {
  const res = await fetch(`${edgeBase}/referrals/me`, { method: 'GET', headers: apiHeaders(accessToken) });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`GET /referrals/me failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as ReferralMeResponse;
};

export const referralsClaim = async (
  accessToken: string,
  code: string,
  metadata?: Record<string, unknown> | null,
): Promise<{ attribution: any; program: ReferralProgram | null }> => {
  const res = await fetch(`${edgeBase}/referrals/claim`, {
    method: 'POST',
    headers: { ...apiHeaders(accessToken), 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, metadata: metadata ?? undefined }),
  });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`POST /referrals/claim failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as { attribution: any; program: ReferralProgram | null };
};

export const referralsRequestCashPayout = async (
  accessToken: string,
  body: { payout_method: string; payout_details?: Json | null; note?: string | null; reward_ids?: string[] },
): Promise<{ cash_payout_request: any; reward_ids: string[] }> => {
  const res = await fetch(`${edgeBase}/referrals/cash-payouts/request`, {
    method: 'POST',
    headers: { ...apiHeaders(accessToken), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`POST /referrals/cash-payouts/request failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as { cash_payout_request: any; reward_ids: string[] };
};

export type AdminReferralsSummary = {
  programs: ReferralProgram[];
  accounts: any[];
  attributions: any[];
  rewards: any[];
  ledger: any[];
  cash_payout_requests?: any[];
  analytics: {
    referral_accounts: number;
    attributions: number;
    converted_attributions: number;
    issued_credit: number;
    issued_cash?: number;
    active_cash?: number;
    paid_cash?: number;
  };
};

export const adminReferralsSummary = async (accessToken: string): Promise<AdminReferralsSummary> => {
  const res = await fetch(`${edgeBase}/admin-referrals`, { method: 'GET', headers: apiHeaders(accessToken) });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`GET /admin-referrals failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as AdminReferralsSummary;
};

export const adminReferralsUpdateDefaultProgram = async (
  accessToken: string,
  patch: Partial<ReferralProgram>,
): Promise<{ program: ReferralProgram | null }> => {
  const res = await fetch(`${edgeBase}/admin-referrals/programs/default`, {
    method: 'PATCH',
    headers: { ...apiHeaders(accessToken), 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`PATCH /admin-referrals/programs/default failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as { program: ReferralProgram | null };
};

export const adminReferralsReverseCredit = async (
  accessToken: string,
  body: { reward_id: string; amount?: number | null; reason?: string },
): Promise<{ ledger_entry: any }> => {
  const res = await fetch(`${edgeBase}/admin-referrals/credits/reverse`, {
    method: 'POST',
    headers: { ...apiHeaders(accessToken), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`POST /admin-referrals/credits/reverse failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as { ledger_entry: any };
};

export const adminReferralsSettleCashPayout = async (
  accessToken: string,
  body: { request_id: string; action: 'approve' | 'paid' | 'reject'; note?: string | null; provider_reference?: string | null },
): Promise<{ cash_payout_request: any }> => {
  const res = await fetch(`${edgeBase}/admin-referrals/cash-payouts/settle`, {
    method: 'POST',
    headers: { ...apiHeaders(accessToken), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`POST /admin-referrals/cash-payouts/settle failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as { cash_payout_request: any };
};

export type AdminPartnerRow = PartnerCenterProfile & {
  tenants?: { id: string; name: string; slug: string; type: string } | null;
  wallet?: { currency: string; available_amount: number };
  voucher_counts?: Record<string, number>;
};

export const adminPartnersSummary = async (accessToken: string): Promise<{ partners: AdminPartnerRow[]; topup_requests: any[]; tier_requests?: PartnerCenterTierRequest[] }> => {
  const res = await fetch(`${edgeBase}/admin-partners`, { method: 'GET', headers: apiHeaders(accessToken) });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`GET /admin-partners failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as { partners: AdminPartnerRow[]; topup_requests: any[]; tier_requests?: PartnerCenterTierRequest[] };
};

export const adminPartnersUpdateProfile = async (
  accessToken: string,
  body: { tenant_id: string } & Partial<PartnerCenterProfile>,
): Promise<{ partner: AdminPartnerRow | null }> => {
  const res = await fetch(`${edgeBase}/admin-partners/profile`, {
    method: 'PATCH',
    headers: { ...apiHeaders(accessToken), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`PATCH /admin-partners/profile failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as { partner: AdminPartnerRow | null };
};

export const adminPartnersWallet = async (
  accessToken: string,
  body:
    | { action: 'settle_topup'; tenant_id: string; ledger_id: string; status: 'posted' | 'void'; note?: string | null }
    | { action: 'adjust'; tenant_id: string; entry_kind: 'adjustment' | 'credit' | 'refund' | 'debit' | 'commission'; amount: number; currency?: string; note?: string | null }
    | { action: 'apply_tier_request'; tenant_id: string; request_id: string; note?: string | null },
): Promise<{ ledger_entry?: any; partner?: AdminPartnerRow | null; tier_request?: PartnerCenterTierRequest }> => {
  const res = await fetch(`${edgeBase}/admin-partners/wallet`, {
    method: 'POST',
    headers: { ...apiHeaders(accessToken), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`POST /admin-partners/wallet failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as { ledger_entry?: any; partner?: AdminPartnerRow | null; tier_request?: PartnerCenterTierRequest };
};

export type CandidateEntryResponse = {
  session: { access_token: string; refresh_token: string; expires_in: number; token_type: string };
  session_id: string;
  experience_id: string;
  first_section_id: string | null;
  product_id: string | null;
  product_slug: string | null;
  app_url: string | null;
  strict_mode?: boolean;
  launch_kind?: 'candidate_id' | 'center_voucher' | string;
  voucher_id?: string | null;
  voucher_code?: string | null;
  center_tenant_id?: string | null;
  classroom_id?: string | null;
};

export const candidateEntry = async (body: {
  token_code: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
}): Promise<CandidateEntryResponse> => {
  const res = await fetch(`${edgeBase}/candidate-entry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`POST /candidate-entry failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as CandidateEntryResponse;
};

export const buildCandidateHandoffUrl = (
  res: CandidateEntryResponse,
  opts?: {
    launchKind?: 'candidate_id' | 'center_voucher' | string;
    voucherCode?: string | null;
    centerTenantId?: string | null;
    classroomId?: string | null;
    centerSlug?: string | null;
  },
): string => {
  const appBase = String(res.app_url ?? '').trim().replace(/\/$/, '');
  if (!appBase) throw new Error('Exam app URL is not configured');

  const qs = new URLSearchParams({
    access_token: res.session.access_token,
    refresh_token: res.session.refresh_token,
    expires_in: String(res.session.expires_in),
    session_id: res.session_id,
    strict_mode: res.strict_mode === false ? '0' : '1',
    launch_kind: String(res.launch_kind ?? opts?.launchKind ?? 'candidate_id'),
  });

  if (res.first_section_id) qs.set('first_section_id', res.first_section_id);
  const voucherCode = String(res.voucher_code ?? opts?.voucherCode ?? '').trim();
  if (voucherCode) qs.set('voucher_code', voucherCode);
  const centerTenantId = String(res.center_tenant_id ?? opts?.centerTenantId ?? '').trim();
  if (centerTenantId) qs.set('center_tenant_id', centerTenantId);
  const classroomId = String(res.classroom_id ?? opts?.classroomId ?? '').trim();
  if (classroomId) qs.set('classroom_id', classroomId);
  const centerSlug = String(opts?.centerSlug ?? '').trim();
  if (centerSlug) qs.set('center_slug', centerSlug);

  return `${appBase}/candidate?${qs.toString()}`;
};

export type VoucherPreview = {
  id: string;
  code: string;
  access_kind: 'mock_exam' | 'subscription' | 'seat';
  status: string;
  expires_at: string | null;
  assigned_name?: string | null;
  assigned_email?: string | null;
  center: PartnerCenterProfile | null;
  product: { id: string | null; name: string | null; slug?: string | null; app_url?: string | null };
  experience: { id: string | null; name: string | null } | null;
  plan: { id: string | null; name: string | null; duration_days?: number | null } | null;
  classroom: { id: string; name: string | null; academy_id: string | null } | null;
};

export type VoucherPreviewResponse = {
  voucher: VoucherPreview;
  redeem_action: 'candidate_entry' | 'authenticated_redeem' | 'open_product';
  token_code?: string;
};

export type VoucherRedeemResponse = VoucherPreviewResponse & {
  grant?: { product_ids: string[]; starts_at: string; ends_at: string | null };
  next_url?: string;
};

export const voucherPreview = async (code: string): Promise<VoucherPreviewResponse> => {
  const qs = new URLSearchParams({ action: 'preview', code });
  const res = await fetch(`${edgeBase}/voucher-redeem?${qs.toString()}`, { method: 'GET', headers: publicApiHeaders });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`GET /voucher-redeem preview failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as VoucherPreviewResponse;
};

export const voucherRedeem = async (code: string, accessToken?: string | null): Promise<VoucherRedeemResponse> => {
  const headers: HeadersInit = { ...publicApiHeaders, 'Content-Type': 'application/json' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const res = await fetch(`${edgeBase}/voucher-redeem`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action: 'redeem', code }),
  });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`POST /voucher-redeem redeem failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as VoucherRedeemResponse;
};

export type PublicCenterResponse = {
  center: {
    tenant_id: string;
    name: string;
    display_name?: string | null;
    slug: string;
    logo_url?: string | null;
    status: string;
    package_tier?: string | null;
    public_instructions?: string | null;
    powered_by_schood: boolean;
    branding?: Json | null;
  };
  services: { mock_exams: any[]; subscriptions: any[] };
  events?: PartnerCenterMockEvent[];
};

export const publicCenter = async (slug: string): Promise<PublicCenterResponse> => {
  const qs = new URLSearchParams({ action: 'center', slug });
  const res = await fetch(`${edgeBase}/voucher-redeem?${qs.toString()}`, { method: 'GET', headers: publicApiHeaders });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`GET /voucher-redeem center failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as PublicCenterResponse;
};

// ─────────────────────────────────────────────────────────────────────────────
// Academy LMS — Teacher Control Panel
// ─────────────────────────────────────────────────────────────────────────────

const academyGet = async <T>(accessToken: string, action: string, params?: Record<string, string>): Promise<T> => {
  const qs = new URLSearchParams({ action, ...(params ?? {}) });
  const res = await fetch(`${edgeBase}/academy?${qs.toString()}`, { method: 'GET', headers: apiHeaders(accessToken) });
  if (!res.ok) { const d = await readJsonOrText(res); throw new Error(`GET /academy?action=${action} failed (${res.status}): ${JSON.stringify(d)}`); }
  return (await res.json()) as T;
};

const academyPost = async <T>(accessToken: string, body: Json): Promise<T> => {
  const res = await fetch(`${edgeBase}/academy`, { method: 'POST', headers: { ...apiHeaders(accessToken), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) { const d = await readJsonOrText(res); throw new Error(`POST /academy failed (${res.status}): ${JSON.stringify(d)}`); }
  return (await res.json()) as T;
};

export const academyListAcademies = (accessToken: string) =>
  academyGet<{ academies: AcademyListItem[] }>(accessToken, 'academies');

export const academyControlDashboard = async (
  accessToken: string,
  academyId: string,
): Promise<TeacherStudioStudentDashboard> => {
  const params = { academy_id: academyId };
  const summary = await academyGet<AcademySummary>(accessToken, 'summary', params);
  const [contacts, classrooms, memberships, announcements, alerts, offers, payments] = await Promise.all([
    academyGet<{ contacts: TeacherStudioStudentContact[] }>(accessToken, 'contacts', params),
    academyGet<{ classrooms: TeacherStudioStudentClassroom[] }>(accessToken, 'classrooms', params),
    academyGet<{ classroom_memberships: TeacherStudioStudentClassroomMembership[] }>(accessToken, 'classroom-memberships', params),
    academyGet<{ announcements: TeacherStudioStudentAnnouncement[] }>(accessToken, 'announcements', params),
    academyGet<{ alerts: TeacherStudioStudentFeed['alerts'] }>(accessToken, 'alerts', params),
    academyGet<{ offers: TeacherStudioStudentOffer[] }>(accessToken, 'offers', params),
    academyGet<{ payments: TeacherStudioStudentPayment[] }>(accessToken, 'payments', params),
  ]);

  return {
    academies: [],
    contacts: contacts.contacts ?? [],
    classrooms: classrooms.classrooms ?? [],
    classroom_memberships: memberships.classroom_memberships ?? [],
    announcements: announcements.announcements ?? [],
    messages: [],
    alerts: alerts.alerts ?? [],
    entitlements: [],
    payments: payments.payments ?? [],
    offers: offers.offers ?? [],
    access: summary.access ?? null,
    summary,
  };
};

export type AcademyAssignment = {
  id: string; academy_id: string; classroom_id: string; title: string;
  description: string | null; assignment_type: string; experience_id: string | null;
  due_at: string | null; released_at: string | null; prerequisite_id: string | null;
  position: number; max_score: number | null; score_weight: number; status: string;
  metadata: Json | null; created_by: string | null; created_at: string; updated_at: string;
};

export type AcademySubmission = {
  id: string; assignment_id: string; contact_id: string; score: number | null;
  max_score: number | null; status: string; submitted_at: string | null;
  graded_at: string | null; notes: string | null;
};

export type AcademyGradebookRow = {
  contact_id: string; first_name: string; last_name: string; email: string | null;
  status: string; role: string;
  submissions: Record<string, { score: number | null; max_score: number | null; status: string; submitted_at: string | null; graded_at: string | null; notes: string | null }>;
  composite_score: number | null; submitted_count: number; total_assignments: number;
};

export type AcademyGradebook = {
  classroom_id: string;
  assignments: Pick<AcademyAssignment, 'id' | 'title' | 'assignment_type' | 'due_at' | 'max_score' | 'score_weight' | 'position' | 'status'>[];
  rows: AcademyGradebookRow[];
};

export type AcademyAttendanceRecord = {
  id?: string; classroom_id: string; contact_id: string; session_date: string;
  status: string; notes: string | null; marked_by?: string | null; marked_at?: string | null;
};

export type AcademyStudentProgress = {
  contact: Json; classrooms: Json[]; submissions: Json[]; attendance: Json[];
  stats: { total_submissions: number; graded_submissions: number; avg_score: number | null; attendance_rate: number | null; total_attendance_days: number; present_days: number };
};

export type AcademyClassroomLessonPlan = {
  classroom_id: string;
  classroom_name: string;
  ai_status: 'ok' | 'unconfigured' | 'failed';
  ai_error?: string | null;
  evidence: {
    classroom?: Json;
    lms?: Json;
    focus_areas?: string[];
    center_voucher_heatmap?: PartnerClassroomHeatmap | null;
  };
  heatmap?: PartnerClassroomHeatmap | null;
  plan?: Json;
  lesson_plan: string;
};

export const academyListAssignments = (accessToken: string, academyId: string, classroomId?: string) =>
  academyGet<{ assignments: AcademyAssignment[] }>(accessToken, 'assignments', { academy_id: academyId, ...(classroomId ? { classroom_id: classroomId } : {}) });

export const academyCreateAssignment = (accessToken: string, body: { academy_id: string; classroom_id: string; title: string; description?: string | null; assignment_type?: string; experience_id?: string | null; due_at?: string | null; released_at?: string | null; prerequisite_id?: string | null; position?: number; max_score?: number | null; score_weight?: number; status?: string }) =>
  academyPost<{ assignment: AcademyAssignment }>(accessToken, { action: 'create_assignment', ...body });

export const academyUpdateAssignment = (accessToken: string, body: { academy_id: string; assignment_id: string } & Partial<AcademyAssignment>) =>
  academyPost<{ assignment: AcademyAssignment }>(accessToken, { action: 'update_assignment', ...body });

export const academySubmitAssignment = (accessToken: string, body: { academy_id: string; assignment_id: string; contact_id: string; score?: number | null; max_score?: number | null; session_id?: string | null; notes?: string | null }) =>
  academyPost<{ submission: AcademySubmission }>(accessToken, { action: 'submit_assignment', ...body });

export const academyGradeSubmission = (accessToken: string, body: { academy_id: string; submission_id?: string; assignment_id?: string; contact_id?: string; score: number; max_score?: number | null; notes?: string | null }) =>
  academyPost<{ submission: AcademySubmission }>(accessToken, { action: 'grade_submission', ...body });

export const academyGradebook = (accessToken: string, academyId: string, classroomId: string) =>
  academyGet<AcademyGradebook>(accessToken, 'gradebook', { academy_id: academyId, classroom_id: classroomId });

export const academyStudentProgress = (accessToken: string, academyId: string, contactId: string) =>
  academyGet<AcademyStudentProgress>(accessToken, 'student_progress', { academy_id: academyId, contact_id: contactId });

export const academyListAttendance = (accessToken: string, academyId: string, classroomId: string) =>
  academyGet<{ attendance: AcademyAttendanceRecord[] }>(accessToken, 'attendance', { academy_id: academyId, classroom_id: classroomId });

export const academyMarkAttendance = (accessToken: string, body: { academy_id: string; classroom_id: string; session_date?: string; records: Array<{ contact_id: string; status: string; notes?: string | null }> }) =>
  academyPost<{ attendance: AcademyAttendanceRecord[]; count: number }>(accessToken, { action: 'mark_attendance', ...body });

export const academyBulkInvite = (accessToken: string, body: { academy_id: string; classroom_id?: string | null; contacts: Array<{ email: string; first_name?: string; last_name?: string }> }) =>
  academyPost<{ results: Json[]; summary: { ok: number; failed: number; total: number } }>(accessToken, { action: 'bulk_invite', ...body });

export const academyUpdateClassroomSettings = (accessToken: string, body: { academy_id: string; classroom_id: string; name?: string; description?: string | null; is_active?: boolean; score_weights?: Json | null }) =>
  academyPost<{ classroom: Json }>(accessToken, { action: 'update_classroom_settings', ...body });

export const academyGenerateClassroomLessonPlan = (
  accessToken: string,
  body: { academy_id: string; classroom_id?: string | null },
) => academyPost<AcademyClassroomLessonPlan>(accessToken, { action: 'generate_classroom_lesson_plan', ...body });

// ─────────────────────────────────────────────────────────────────────────────
// Certificates
// ─────────────────────────────────────────────────────────────────────────────

export type IssuedCertificate = { id: string; public_token: string; exam_type: string; overall_band: number | null; overall_score: number | null; candidate_name: string; exam_date: string; center_name: string | null; issued_at: string };

export const certificateIssue = async (accessToken: string, body: { session_id?: string; exam_type: string; candidate_name?: string; overall_band?: number | null; overall_score?: number | null; center_name?: string }) =>
  (await fetch(`${edgeBase}/certificates`, { method: 'POST', headers: { ...apiHeaders(accessToken), 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'issue', ...body }) }).then((r) => r.json())) as { certificate: IssuedCertificate; share_url: string };

export const certificateList = async (accessToken: string) =>
  (await fetch(`${edgeBase}/certificates?action=list`, { headers: apiHeaders(accessToken) }).then((r) => r.json())) as { certificates: IssuedCertificate[] };

export const certificateGet = async (token: string) =>
  (await fetch(`${edgeBase}/certificates?token=${encodeURIComponent(token)}`).then((r) => r.json())) as { certificate: IssuedCertificate & { exam_config: Json } };

// ─────────────────────────────────────────────────────────────────────────────
// Score Prediction
// ─────────────────────────────────────────────────────────────────────────────

export type ScorePrediction = { exam_type: string; current_score: number; predicted_next: number; confidence_low: number; confidence_high: number; trend: 'improving' | 'stable' | 'declining'; data_points: number; uses_band: boolean; max_score: number; history: { index: number; date: string; score: number }[]; message: string };

export const scorePredictions = async (accessToken: string, examType?: string) =>
  (await fetch(`${edgeBase}/score-prediction${examType ? `?exam_type=${encodeURIComponent(examType)}` : ''}`, { headers: apiHeaders(accessToken) }).then((r) => r.json())) as { predictions: ScorePrediction[]; total_exams: number };

// ─────────────────────────────────────────────────────────────────────────────
// Parent Report
// ─────────────────────────────────────────────────────────────────────────────

export const parentReportGenerateToken = async (accessToken: string, body: { academy_id: string; contact_id: string; label?: string; expires_in_days?: number }) =>
  (await fetch(`${edgeBase}/parent-report`, { method: 'POST', headers: { ...apiHeaders(accessToken), 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'generate_token', ...body }) }).then((r) => r.json())) as { token: { id: string; token: string; label: string | null; expires_at: string | null }; share_url: string; contact: { id: string; name: string } };

export const parentReportListTokens = async (accessToken: string, academyId: string) =>
  (await fetch(`${edgeBase}/parent-report?action=list_tokens&academy_id=${encodeURIComponent(academyId)}`, { headers: apiHeaders(accessToken) }).then((r) => r.json())) as { tokens: Json[] };

// ─────────────────────────────────────────────────────────────────────────────
// Writing Tutor
// ─────────────────────────────────────────────────────────────────────────────

export const writingTutorQuota = async (accessToken: string) =>
  (await fetch(`${edgeBase}/writing-tutor?action=quota`, { headers: apiHeaders(accessToken) }).then((r) => r.json())) as { used: number; limit: number; remaining: number; has_paid_access: boolean };

export const writingTutorGrade = async (accessToken: string, body: { essay: string; prompt?: string; exam_type?: string; task_type?: string }) =>
  (await fetch(`${edgeBase}/writing-tutor`, { method: 'POST', headers: { ...apiHeaders(accessToken), 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'grade', ...body }) }).then((r) => r.json())) as Json;

export const academyExportGradebook = async (accessToken: string, academyId: string, classroomId: string): Promise<string> => {
  const res = await fetch(`${edgeBase}/academy`, {
    method: 'POST',
    headers: { ...apiHeaders(accessToken), 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'export_gradebook', academy_id: academyId, classroom_id: classroomId }),
  });
  if (!res.ok) { const d = await readJsonOrText(res); throw new Error(`export_gradebook failed (${res.status}): ${JSON.stringify(d)}`); }
  return res.text();
};
