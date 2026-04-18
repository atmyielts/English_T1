import { clearLocalAuthStorage, supabase } from './supabase';

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
};
export type AdminSecurityPolicy = {
  id: number;
  require_mfa: boolean;
  session_timeout_minutes: number;
  rate_limit_per_minute: number;
  ip_allowlist: string[];
  updated_at?: string;
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

const getEnv = (key: 'VITE_SUPABASE_URL' | 'VITE_SUPABASE_ANON_KEY'): string => {
  const value = import.meta.env[key] as string | undefined;
  if (!value) throw new Error(`Missing ${key}`);
  return value;
};

const supabaseUrl = getEnv('VITE_SUPABASE_URL').replace(/\/$/, '');
const supabaseAnonKey = getEnv('VITE_SUPABASE_ANON_KEY');
const edgeBase = `${supabaseUrl}/functions/v1`;
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
      const { data, error } = await supabase.auth.refreshSession();
      if (error || !data.session?.access_token) return null;
      return data.session.access_token;
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
  grant_error: string | null;
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

export type TspayCreateInput = {
  plan_id?: string;
  product_id?: string;
  purchase_type?: string;
  experience_id?: string;
  quantity?: number;
  expires_in_days?: number;
  seat_count?: number;
  description: string;
  metadata?: Json;
  tenant_id?: string | null;
  coupon_code?: string | null;
};

export type TspayCreateResponse = {
  payment_url: string;
  transaction_id: string;
  amount: number;
  currency: string;
  original_amount: number;
  discount_amount: number;
  coupon_code: string | null;
  plan_id: string | null;
  product_id: string | null;
};

export const tspayCreateTransaction = async (
  accessToken: string,
  body: TspayCreateInput,
): Promise<TspayCreateResponse> => {
  const res = await fetch(`${edgeBase}/tspay/create-transaction`, {
    method: 'POST',
    headers: { ...apiHeaders(accessToken), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`POST /tspay/create-transaction failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as TspayCreateResponse;
};

export type TspayStatusResponse = {
  status: string;
  api_status?: string;
  status_query_id?: string;
};

export const tspayStatus = async (accessToken: string, transactionId: string): Promise<TspayStatusResponse> => {
  const url = `${edgeBase}/tspay/status?transaction_id=${encodeURIComponent(transactionId)}`;
  const res = await fetch(url, { method: 'GET', headers: apiHeaders(accessToken) });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`GET /tspay/status failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as TspayStatusResponse;
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
  opts?: { limit?: number },
): Promise<{ announcements: PlatformAnnouncement[] }> => {
  const qs = new URLSearchParams({ action: 'announcements' });
  if (typeof opts?.limit === 'number' && Number.isFinite(opts.limit)) qs.set('limit', String(Math.floor(opts.limit)));
  const res = await fetch(`${edgeBase}/support-center?${qs.toString()}`, { method: 'GET', headers: publicApiHeaders });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`GET /support-center?action=announcements failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as { announcements: PlatformAnnouncement[] };
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

export type TeacherStudioStudentDashboard = {
  academies: { id: string; name: string; slug: string; type: string; metadata?: Json | null }[];
  contacts: TeacherStudioStudentContact[];
  classrooms: TeacherStudioStudentClassroom[];
  classroom_memberships: TeacherStudioStudentClassroomMembership[];
  announcements: TeacherStudioStudentAnnouncement[];
  messages: TeacherStudioStudentFeed['messages'];
  alerts: TeacherStudioStudentFeed['alerts'];
  entitlements: TeacherStudioStudentEntitlement[];
  payments: TeacherStudioStudentPayment[];
  offers: TeacherStudioStudentOffer[];
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

export type CandidateEntryResponse = {
  session: { access_token: string; refresh_token: string; expires_in: number; token_type: string };
  session_id: string;
  experience_id: string;
  first_section_id: string | null;
  product_id: string | null;
  product_slug: string | null;
  app_url: string | null;
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
