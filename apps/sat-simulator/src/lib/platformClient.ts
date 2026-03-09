import { supabase } from './supabase';
import { cookieStorage } from './cookieStorage';

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
const authStorageKey =
  (import.meta.env.VITE_AUTH_STORAGE_KEY as string | undefined)?.trim() || 'schood-auth';
const authDebug =
  import.meta.env.DEV || String(import.meta.env.VITE_DEBUG_AUTH ?? '').toLowerCase() === 'true';

const decodeJwtExp = (token: string): number | null => {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4 || 4)) % 4);
    const raw = typeof atob === 'function' ? atob(padded) : '';
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { exp?: unknown };
    const exp = Number(parsed.exp);
    return Number.isFinite(exp) ? exp * 1000 : null;
  } catch {
    return null;
  }
};

const summarizeToken = (token: string | null | undefined): Record<string, unknown> => {
  const clean = String(token ?? '').trim();
  if (!clean) return { present: false };
  const expMs = decodeJwtExp(clean);
  return {
    present: true,
    length: clean.length,
    preview: `${clean.slice(0, 10)}...${clean.slice(-6)}`,
    expiresAt: expMs ? new Date(expMs).toISOString() : null,
    expiresInSec: expMs ? Math.round((expMs - Date.now()) / 1000) : null,
  };
};

const authLog = (event: string, meta: Record<string, unknown>): void => {
  if (!authDebug || typeof console === 'undefined') return;
  console.debug(`[platformClient auth] ${event}`, { at: new Date().toISOString(), ...meta });
};

const readDebugBody = async (res: Response): Promise<string | null> => {
  if (!authDebug) return null;
  try {
    const text = (await res.clone().text()).trim();
    if (!text) return null;
    return text.length > 500 ? `${text.slice(0, 500)}...` : text;
  } catch {
    return null;
  }
};

const apiHeaders = (accessToken: string): HeadersInit => ({
  apikey: supabaseAnonKey,
  Authorization: `Bearer ${accessToken}`,
});

// Small, in-memory caches mainly to dedupe React StrictMode double-invocations in dev.
const ME_CACHE_TTL_MS = 30_000;
const meCache = new Map<string, { at: number; value: MeResponse }>();
const meInFlight = new Map<string, Promise<MeResponse>>();

const ACCESS_EFFECTIVE_CACHE_TTL_MS = 10_000;
const accessEffectiveCache = new Map<string, { at: number; value: AccessEffectiveResponse }>();
const accessEffectiveInFlight = new Map<string, Promise<AccessEffectiveResponse>>();

const EXAM_STATE_CACHE_TTL_MS = 2_000;
const examStateCache = new Map<string, { at: number; value: ExamStateResponse }>();
const examStateInFlight = new Map<string, Promise<ExamStateResponse>>();

const BILLING_PLANS_CACHE_TTL_MS = 30_000;
const billingPlansCache = new Map<string, { at: number; value: { plans: BillingPlan[] } }>();
const billingPlansInFlight = new Map<string, Promise<{ plans: BillingPlan[] }>>();

type StoredSession = {
  access_token?: string;
  refresh_token?: string;
  user?: { id?: string };
};

const readStoredSession = (): StoredSession | null => {
  try {
    const raw = cookieStorage.getItem(authStorageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as StoredSession;
  } catch {
    return null;
  }
};

const resolveStoredAuthTokens = (): { accessToken: string | null; refreshToken: string | null; userId: string | null } => {
  const session = readStoredSession();
  const accessToken = String(session?.access_token ?? '').trim() || null;
  const refreshToken = String(session?.refresh_token ?? '').trim() || null;
  const userId = String(session?.user?.id ?? '').trim() || null;
  return { accessToken, refreshToken, userId };
};

const resolveSessionAccessToken = async (): Promise<string | null> => {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      authLog('getSession.error', { message: error.message });
      return null;
    }
    const token = data.session?.access_token ?? null;
    authLog('getSession.ok', { token: summarizeToken(token) });
    return token;
  } catch {
    authLog('getSession.exception', {});
    return null;
  }
};

const syncSessionFromStorage = async (): Promise<string | null> => {
  const { accessToken, refreshToken, userId } = resolveStoredAuthTokens();
  if (!accessToken || !refreshToken) {
    authLog('setSession.skipped.no-storage-tokens', {
      storageToken: summarizeToken(accessToken),
      hasRefreshToken: Boolean(refreshToken),
      storedUserId: userId,
    });
    return null;
  }

  try {
    const { data, error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) {
      authLog('setSession.error', {
        message: error.message,
        storageToken: summarizeToken(accessToken),
        storedUserId: userId,
      });
      return null;
    }
    const token = data.session?.access_token ?? accessToken;
    authLog('setSession.ok', {
      token: summarizeToken(token),
      userId: data.session?.user?.id ?? userId,
    });
    return token;
  } catch {
    authLog('setSession.exception', {
      storageToken: summarizeToken(accessToken),
      storedUserId: userId,
    });
    return null;
  }
};

const fetchWithTokenRetry = async (
  accessToken: string,
  run: (token: string) => Promise<Response>,
  opts?: { label?: string },
): Promise<Response> => {
  const label = opts?.label ?? 'unknown';
  const initialToken = accessToken || '';
  authLog('request.start', { label, initialToken: summarizeToken(initialToken) });
  const first = await run(initialToken);
  authLog('request.first', {
    label,
    status: first.status,
    wwwAuthenticate: first.headers.get('www-authenticate') ?? null,
    body: first.status === 401 ? await readDebugBody(first) : null,
  });
  if (first.status !== 401) return first;

  const { accessToken: storedAccessToken, refreshToken: storedRefreshToken, userId: storedUserId } = resolveStoredAuthTokens();
  const sessionToken = await resolveSessionAccessToken();
  authLog('request.retry.lookup', {
    label,
    initialToken: summarizeToken(initialToken),
    sessionToken: summarizeToken(sessionToken),
    storedToken: summarizeToken(storedAccessToken),
    hasStoredRefreshToken: Boolean(storedRefreshToken),
    storedUserId,
  });

  const retryTokens = Array.from(
    new Set([storedAccessToken, sessionToken].filter((token): token is string => Boolean(token && token !== initialToken))),
  );

  for (const retryToken of retryTokens) {
    const second = await run(retryToken);
    authLog('request.retry.result', {
      label,
      retryToken: summarizeToken(retryToken),
      status: second.status,
      wwwAuthenticate: second.headers.get('www-authenticate') ?? null,
      body: second.status === 401 ? await readDebugBody(second) : null,
    });
    if (second.status !== 401) return second;
  }

  const syncedToken = await syncSessionFromStorage();
  if (syncedToken && syncedToken !== initialToken && !retryTokens.includes(syncedToken)) {
    const syncedRetry = await run(syncedToken);
    authLog('request.retry.setSession.result', {
      label,
      retryToken: summarizeToken(syncedToken),
      status: syncedRetry.status,
      wwwAuthenticate: syncedRetry.headers.get('www-authenticate') ?? null,
      body: syncedRetry.status === 401 ? await readDebugBody(syncedRetry) : null,
    });
    if (syncedRetry.status !== 401) return syncedRetry;
  }

  authLog('request.retry.exhausted', { label });

  return first;
};

const readJsonOrText = async (res: Response): Promise<unknown> => {
  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) return res.json();
  return res.text();
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
    const res = await fetchWithTokenRetry(accessToken, (token) =>
      fetch(`${edgeBase}/me`, { headers: apiHeaders(token) }),
      { label: 'GET /me' },
    );
    if (!res.ok) {
      const details = await readJsonOrText(res);
      const err = new Error(`GET /me failed (${res.status}): ${JSON.stringify(details)}`);
      (err as any).status = res.status;
      (err as any).details = details;
      throw err;
    }

    const value = (await res.json()) as MeResponse;
    meCache.set(key, { at: Date.now(), value });
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
  const cacheKey = `${accessToken}:${opts?.productId ?? ''}`;
  const now = Date.now();
  const cached = accessEffectiveCache.get(cacheKey);
  if (cached && now - cached.at < ACCESS_EFFECTIVE_CACHE_TTL_MS) return cached.value;

  const inFlight = accessEffectiveInFlight.get(cacheKey);
  if (inFlight) return inFlight;

  const qs = new URLSearchParams();
  if (opts?.productId) qs.set('product_id', opts.productId);
  const url = `${edgeBase}/access-effective${qs.toString() ? `?${qs.toString()}` : ''}`;
  const p = (async () => {
    const res = await fetchWithTokenRetry(accessToken, (token) =>
      fetch(url, { headers: apiHeaders(token) }),
      { label: 'GET /access-effective' },
    );
    if (!res.ok) {
      const details = await readJsonOrText(res);
      const err = new Error(`GET /access-effective failed (${res.status}): ${JSON.stringify(details)}`);
      (err as any).status = res.status;
      (err as any).details = details;
      throw err;
    }
    const value = (await res.json()) as AccessEffectiveResponse;
    accessEffectiveCache.set(cacheKey, { at: Date.now(), value });
    return value;
  })();

  accessEffectiveInFlight.set(cacheKey, p);
  try {
    return await p;
  } finally {
    accessEffectiveInFlight.delete(cacheKey);
  }
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
    headers: { ...apiHeaders(accessToken), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    const err = new Error(`POST /start-session failed (${res.status}): ${JSON.stringify(details)}`);
    (err as any).status = res.status;
    (err as any).details = details;
    throw err;
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
    sat?: {
      reading_writing_score: number | null;
      math_score: number | null;
      total_score: number | null;
      score_version?: string | null;
      is_estimated?: boolean;
    } | null;
    sections: Record<
      string,
      {
        type: string;
        raw_score: number;
        max_score: number;
        scaled_score_40: number;
        scaled_score_800?: number | null;
        band: number | null;
      }
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
  productId?: string | null,
): Promise<ReviewSessionResponse> => {
  const qs = new URLSearchParams({ session_id: sessionId });
  if (sectionId) qs.set('section_id', sectionId);
  if (productId) qs.set('product_id', productId);

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
  opts?: { kind?: 'audio' | 'image'; bucket?: string; durationSeconds?: number },
): Promise<AdminUploadAssetResponse> => {
  const body = new FormData();
  body.set('file', file);
  if (opts?.kind) body.set('kind', opts.kind);
  if (opts?.bucket) body.set('bucket', opts.bucket);
  if (typeof opts?.durationSeconds === 'number' && Number.isFinite(opts.durationSeconds) && opts.durationSeconds > 0) {
    body.set('duration_seconds', String(opts.durationSeconds));
  }

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

  const res = await fetchWithTokenRetry(accessToken, (token) =>
    fetch(`${edgeBase}/admin-assets/list?${qs.toString()}`, { method: 'GET', headers: apiHeaders(token) }),
  );
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
  price_amount?: number | null;
  price_currency?: string | null;
  metadata: Json | null;
  created_at: string;
  counts: { sections: number; parts: number; units: number };
};

export const adminTestsList = async (
  accessToken: string,
  productId: string,
): Promise<{ experiences: AdminTestRow[] }> => {
  const url = `${edgeBase}/admin-tests/list?product_id=${encodeURIComponent(productId)}`;
  const res = await fetchWithTokenRetry(accessToken, (token) =>
    fetch(url, { method: 'GET', headers: apiHeaders(token) }),
  );
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`GET /admin-tests/list failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as { experiences: AdminTestRow[] };
};

export type AdminBuilderPayload = {
  product_id: string;
  experience: {
    id?: string;
    version?: number;
    name: string;
    display_order?: number;
    is_active?: boolean;
    price_amount?: number | null;
    price_currency?: string | null;
    metadata?: Json;
  };
  sections: Array<{
    id?: string;
    name: string;
    display_order?: number;
    metadata?: Json;
    parts: Array<{
      id?: string;
      name: string;
      display_order?: number;
      metadata?: Json;
      content_units: Array<{
        id?: string;
        type: string;
        display_order?: number;
        data: Json;
        metadata?: Json;
        answer_key?: { correct: Json; metadata?: Json } | null;
      }>;
    }>;
  }>;
  deleted?: { section_ids?: string[]; part_ids?: string[]; unit_ids?: string[] };
  answer_key_unit_ids?: string[];
};

export const adminBuilderLoad = async (
  accessToken: string,
  experienceId: string,
): Promise<{ payload: AdminBuilderPayload }> => {
  const url = `${edgeBase}/admin-builder/load?experience_id=${encodeURIComponent(experienceId)}`;
  const res = await fetchWithTokenRetry(accessToken, (token) =>
    fetch(url, { method: 'GET', headers: apiHeaders(token) }),
    { label: 'GET /admin-builder/load' },
  );
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`GET /admin-builder/load failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as { payload: AdminBuilderPayload };
};

export const adminBuilderSave = async (
  accessToken: string,
  payload: AdminBuilderPayload,
): Promise<{
  experience_id: string;
  version: number;
  snapshot_id: string;
  counts: { sections: number; parts: number; content_units: number; answer_keys: number };
  section_instances_synced?: boolean;
  section_instances_count?: number;
  section_instances_error?: string | null;
}> => {
  const res = await fetchWithTokenRetry(accessToken, (token) =>
    fetch(`${edgeBase}/admin-builder/save`, {
      method: 'POST',
      headers: { ...apiHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
    { label: 'POST /admin-builder/save' },
  );
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`POST /admin-builder/save failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as {
    experience_id: string;
    version: number;
    snapshot_id: string;
    counts: { sections: number; parts: number; content_units: number; answer_keys: number };
    section_instances_synced?: boolean;
    section_instances_count?: number;
    section_instances_error?: string | null;
  };
};

export type AdminBuilderSnapshot = {
  id: string;
  experience_id: string;
  version: number;
  action: string;
  created_by: string | null;
  created_at: string;
};

export type AdminSectionTemplateSummary = {
  template_id: string;
  template_name: string;
  section_type: 'listening' | 'reading' | 'writing' | 'reading_writing' | 'math';
  latest_version: number;
  latest_version_id: string;
  latest_source_snapshot_id: string | null;
  version_count: number;
  updated_at: string;
  created_at: string;
};

export type AdminSectionTemplatePayload = {
  template_version_id: string;
  template_id: string;
  template_name: string;
  section_type: 'listening' | 'reading' | 'writing' | 'reading_writing' | 'math';
  version: number;
  source_snapshot_id: string | null;
  section_payload: Json;
};

export const adminBuilderSnapshots = async (
  accessToken: string,
  experienceId: string,
  opts?: { limit?: number },
): Promise<{ snapshots: AdminBuilderSnapshot[] }> => {
  const qs = new URLSearchParams({ experience_id: experienceId });
  if (typeof opts?.limit === 'number' && Number.isFinite(opts.limit)) qs.set('limit', String(Math.floor(opts.limit)));
  const res = await fetchWithTokenRetry(accessToken, (token) =>
    fetch(`${edgeBase}/admin-builder/snapshots?${qs.toString()}`, {
      method: 'GET',
      headers: apiHeaders(token),
    }),
    { label: 'GET /admin-builder/snapshots' },
  );
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`GET /admin-builder/snapshots failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as { snapshots: AdminBuilderSnapshot[] };
};

export const adminBuilderRollback = async (
  accessToken: string,
  snapshotId: string,
): Promise<{
  experience_id: string;
  version: number;
  snapshot_id: string;
  source_snapshot_id: string;
  counts: { sections: number; parts: number; content_units: number; answer_keys: number };
}> => {
  const res = await fetchWithTokenRetry(accessToken, (token) =>
    fetch(`${edgeBase}/admin-builder/rollback`, {
      method: 'POST',
      headers: { ...apiHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ snapshot_id: snapshotId }),
    }),
    { label: 'POST /admin-builder/rollback' },
  );
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`POST /admin-builder/rollback failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as {
    experience_id: string;
    version: number;
    snapshot_id: string;
    source_snapshot_id: string;
    counts: { sections: number; parts: number; content_units: number; answer_keys: number };
  };
};

export const adminBuilderTemplates = async (
  accessToken: string,
  productId: string,
): Promise<{ templates: AdminSectionTemplateSummary[] }> => {
  const qs = new URLSearchParams({ product_id: productId });
  const res = await fetchWithTokenRetry(accessToken, (token) =>
    fetch(`${edgeBase}/admin-builder/templates?${qs.toString()}`, {
      method: 'GET',
      headers: apiHeaders(token),
    }),
    { label: 'GET /admin-builder/templates' },
  );
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`GET /admin-builder/templates failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as { templates: AdminSectionTemplateSummary[] };
};

export const adminBuilderTemplatePayload = async (
  accessToken: string,
  templateVersionId: string,
): Promise<AdminSectionTemplatePayload> => {
  const qs = new URLSearchParams({ template_version_id: templateVersionId });
  const res = await fetchWithTokenRetry(accessToken, (token) =>
    fetch(`${edgeBase}/admin-builder/templates?${qs.toString()}`, {
      method: 'GET',
      headers: apiHeaders(token),
    }),
    { label: 'GET /admin-builder/templates?template_version_id' },
  );
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`GET /admin-builder/templates?template_version_id failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as AdminSectionTemplatePayload;
};

export const adminBuilderTemplateUpsert = async (
  accessToken: string,
  body: {
    product_id: string;
    template_name: string;
    section_type: 'listening' | 'reading' | 'writing' | 'reading_writing' | 'math';
    section_payload: Json;
    template_id?: string | null;
    source_snapshot_id?: string | null;
  },
): Promise<{
  template_id: string;
  template_name: string;
  section_type: string;
  version: number;
  template_version_id: string;
  source_snapshot_id: string | null;
}> => {
  const res = await fetchWithTokenRetry(accessToken, (token) =>
    fetch(`${edgeBase}/admin-builder/templates/upsert`, {
      method: 'POST',
      headers: { ...apiHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { label: 'POST /admin-builder/templates/upsert' },
  );
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`POST /admin-builder/templates/upsert failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as {
    template_id: string;
    template_name: string;
    section_type: string;
    version: number;
    template_version_id: string;
    source_snapshot_id: string | null;
  };
};

type AdminTestsPatch = Partial<
  Pick<AdminTestRow, 'name' | 'display_order' | 'is_active' | 'metadata' | 'price_amount' | 'price_currency'>
> & {
  version: number;
};

export const adminTestsUpdate = async (
  accessToken: string,
  experienceId: string,
  patch: AdminTestsPatch,
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

export type AdminUserSearchResponse = {
  user: AdminUserRow | null;
  memberships: AdminMembershipRow[];
  tenants: AdminTenantRow[];
  entitlements: AdminEntitlementRow[];
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

export type TeacherStudioStudentFeed = {
  academies: { id: string; name: string; slug: string; type: string }[];
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
      headers: apiHeaders(accessToken),
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
  const res = await fetchWithTokenRetry(accessToken, (token) => fetch(url, { method: 'GET', headers: apiHeaders(token) }), {
    label: `GET /${learningProfileEdgeSlug}`,
  });
  if (!res.ok) {
    const details = await readJsonOrText(res);
    throw new Error(`GET /${learningProfileEdgeSlug} failed (${res.status}): ${JSON.stringify(details)}`);
  }
  return (await res.json()) as LearningProfileSeedResponse;
};

export type GradeWritingResponse = {
  evaluation: { id: string; method: string; status: string; result: Json; evaluated_at: string } | null;
};

export const gradeWriting = async (
  accessToken: string,
  sessionId: string,
  opts?: { force?: boolean },
): Promise<GradeWritingResponse> => {
  const res = await fetchWithTokenRetry(
    accessToken,
    (token) =>
      fetch(`${edgeBase}/${gradeWritingEdgeSlug}`, {
        method: 'POST',
        headers: { ...apiHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, force: opts?.force === true }),
      }),
    { label: `POST /${gradeWritingEdgeSlug}` },
  );
  if (!res.ok) {
    const details = await readJsonOrText(res);
    const err = new Error('AI feedback request failed');
    (err as any).status = res.status;
    (err as any).details = details;
    throw err;
  }
  return (await res.json()) as GradeWritingResponse;
};
