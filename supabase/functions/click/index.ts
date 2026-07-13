import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto as stdCrypto } from "https://deno.land/std@0.224.0/crypto/mod.ts";
import {
  buildEntitlementTerms,
  buildPlanSnapshot,
  extractIncludedProductIds,
  extractPlanLimits,
  parseEntitlementTerms,
} from "../_shared/payment-terms.ts";
import {
  computeConfiguredAmount,
  computeDiscount,
  computeDiscountFromEffects,
  normalizeMoney,
} from "../_shared/pricing.ts";
import {
  buildEntitlementValue,
  computeEntitlementEndsAt,
  getEntitlementTargets,
} from "../_shared/entitlements.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CreateTransactionInput = {
  plan_id?: string | null;
  product_id?: string | null;
  purchase_type?: string | null;
  experience_id?: string | null;
  quantity?: number | null;
  expires_in_days?: number | null;
  seat_count?: number | null;
  amount?: number | null;
  currency?: string | null;
  description: string;
  redirect_url?: string | null;
  metadata?: Record<string, unknown> | null;
  coupon_code?: string | null;
  apply_credit?: boolean | null;
  credit_amount?: number | null;
  referral_code?: string | null;
  referral_attribution_id?: string | null;
  tenant_id?: string | null;
};

type PlanRow = {
  id: string;
  product_id: string;
  name?: string | null;
  amount: number;
  currency: string;
  duration_days: number | null;
  metadata?: Record<string, unknown> | null;
};

type ExperiencePriceRow = {
  id: string;
  product_id: string;
  is_active: boolean;
  price_amount: number | null;
  price_currency: string | null;
};

const CENTER_TIER_RANK: Record<string, number> = {
  starter: 0,
  growth: 1,
  premium: 2,
  exclusive: 3,
};

type CouponEffect = {
  type: string;
  [key: string]: unknown;
};

type CouponRow = {
  id: string;
  code: string;
  discount_type: "percent" | "fixed";
  value: number;
  currency: string;
  product_id: string;
  plan_id: string | null;
  is_active: boolean;
  status: string | null;
  starts_at: string | null;
  ends_at: string | null;
  max_redemptions: number | null;
  max_per_user: number | null;
  min_amount: number | null;
  first_purchase_only: boolean | null;
  stacking_policy: string | null;
  effects: CouponEffect[] | null;
  constraints: Record<string, unknown> | null;
};

// ---------------------------------------------------------------------------
// Constants / helpers
// ---------------------------------------------------------------------------

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const CLICK_MIN_AMOUNT_UZS = 1000;
const CLICK_MAX_AMOUNT_UZS = 2_000_000_000;
const CLICK_BASE_URL = "https://my.click.uz/services/pay";
const CLICK_MERCHANT_API_BASE = "https://api.click.uz/v2/merchant";

const getEnv = (key: string): string => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Missing env var: ${key}`);
  return value;
};

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

const getBearerToken = (req: Request): string | null => {
  const header = req.headers.get("Authorization") ?? "";
  if (!header) return null;
  return header.startsWith("Bearer ") ? header.slice(7) : header;
};

const normalizePurchaseType = (raw: unknown): string =>
  String(raw ?? "").trim().toLowerCase();

const normalizeCenterTier = (
  raw: unknown,
): "starter" | "growth" | "premium" | "exclusive" | null => {
  const tier = String(raw ?? "").trim().toLowerCase();
  if (
    tier === "starter" || tier === "growth" || tier === "premium" ||
    tier === "exclusive"
  ) return tier;
  return null;
};

const normalizeBillingPeriod = (
  raw: unknown,
): "monthly" | "annual" | "manual" => {
  const period = String(raw ?? "").trim().toLowerCase();
  if (period === "annual") return "annual";
  if (period === "manual") return "manual";
  return "monthly";
};

const normalizeQuantity = (raw: unknown, max = 200): number | null => {
  const num = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(num)) return null;
  const qty = Math.floor(num);
  if (qty < 1 || qty > max) return null;
  return qty;
};

const normalizeDays = (raw: unknown): number | null => {
  const num = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(num)) return null;
  const days = Math.floor(num);
  if (days < 1 || days > 30) return null;
  return days;
};

const normalizeCouponCode = (raw: unknown): string | null => {
  const code = typeof raw === "string" ? raw.trim() : "";
  if (!code) return null;
  return code.toUpperCase();
};

const normalizeReferralCode = (raw: unknown): string | null => {
  const code = String(raw ?? "").trim().toUpperCase();
  return code || null;
};

const normalizePaymentStatus = (raw: unknown): string => {
  const s = String(raw ?? "").trim().toLowerCase();
  return s || "unknown";
};

const normalizeAcademyFinanceRole = (raw: unknown): string => {
  const role = String(raw ?? "").trim().toLowerCase().replace(/-/g, "_").replace(/\s+/g, "_");
  if (role === "center_admin") return "center_admin";
  return role;
};

const isAcademyFinanceRole = (raw: unknown): boolean =>
  ["owner", "admin", "center_admin"].includes(normalizeAcademyFinanceRole(raw));

const isAcademyTuitionPayment = (payment: PaymentGrantRow): boolean => {
  const meta = payment.metadata ?? {};
  return normalizePurchaseType(
    payment.purchase_type ?? (meta as any)?.purchase_type,
  ) === "academy_tuition";
};

const userHasAcademyFinanceAccess = async (
  sb: any,
  academyId: string | null | undefined,
  userId: string,
): Promise<{ allowed: boolean; error?: any; stage?: string }> => {
  const id = String(academyId ?? "").trim();
  if (!id || !userId) return { allowed: false };

  const { data: adminMembership, error: adminMembershipErr } = await sb
    .from("tenant_memberships")
    .select("role")
    .eq("tenant_id", id)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (adminMembershipErr) {
    return {
      allowed: false,
      error: adminMembershipErr,
      stage: "academy_membership",
    };
  }
  if (isAcademyFinanceRole(adminMembership?.role)) return { allowed: true };

  const { data: academyTenant, error: academyTenantErr } = await sb
    .from("tenants")
    .select("metadata")
    .eq("id", id)
    .maybeSingle();
  if (academyTenantErr) {
    return { allowed: false, error: academyTenantErr, stage: "academy_tenant" };
  }

  const parentCenterId = String(
    (academyTenant?.metadata as any)?.parent_center_id ?? "",
  ).trim();
  if (!parentCenterId) return { allowed: false };

  const { data: centerMembership, error: centerMembershipErr } = await sb
    .from("tenant_memberships")
    .select("role")
    .eq("tenant_id", parentCenterId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (centerMembershipErr) {
    return {
      allowed: false,
      error: centerMembershipErr,
      stage: "center_membership",
    };
  }

  return { allowed: isAcademyFinanceRole(centerMembership?.role) };
};

const isTerminalFailureStatus = (status: string): boolean =>
  ["failed", "failure", "canceled", "cancelled", "expired", "rejected"]
    .includes(status.trim().toLowerCase());

const isSuccessStatus = (status: string): boolean =>
  ["paid", "success", "completed"].includes(status.trim().toLowerCase());

const looksLikeUuid = (value: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );

const uniqIds = (values: Array<string | null | undefined>): string[] => {
  const set = new Set<string>();
  for (const raw of values) {
    const id = String(raw ?? "").trim();
    if (!id) continue;
    set.add(id);
  }
  return Array.from(set);
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const purchaseKindForProgram = (purchaseType: string): string =>
  purchaseType || "plan";

const normalizeRedirectUrl = (raw: unknown): string | null => {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== "https:" && parsed.hostname !== "localhost" &&
      parsed.hostname !== "127.0.0.1"
    ) return null;
    return parsed.toString();
  } catch {
    return null;
  }
};

const withPaymentReturnParams = (
  returnUrl: string | null,
  paymentId: string,
  purchaseKind: string,
): string | null => {
  if (!returnUrl) return null;
  try {
    const parsed = new URL(returnUrl);
    parsed.searchParams.set("payment", paymentId);
    parsed.searchParams.set("kind", purchaseKind);
    parsed.searchParams.set("provider", "click");
    return parsed.toString();
  } catch {
    return returnUrl;
  }
};

const readJsonPayload = async (res: Response): Promise<any> => {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { detail: text };
  }
};

const randomTokenCode = (len = 10): string => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
};

const ensureUniqueTokenCode = async (sb: any, attempts = 8): Promise<string> => {
  for (let i = 0; i < attempts; i += 1) {
    const code = randomTokenCode(10);
    const { data } = await sb.from("exam_tokens").select("id").eq(
      "token_code",
      code,
    ).maybeSingle();
    if (!data) return code;
  }
  throw new Error("Failed to generate unique candidate ID");
};

// ---------------------------------------------------------------------------
// Cryptography
// ---------------------------------------------------------------------------

const md5Hex = async (message: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await stdCrypto.subtle.digest("MD5", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

const sha1Hex = async (message: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-1", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

// ---------------------------------------------------------------------------
// Click.uz helpers
// ---------------------------------------------------------------------------

const getClickServiceId = (): string => getEnv("CLICK_SERVICE_ID");
const getClickMerchantId = (): string => getEnv("CLICK_MERCHANT_ID");
const getClickSecretKey = (): string => getEnv("CLICK_SECRET_KEY");
// Optional: used by the embedded "pay by card" widget (checkout.js). Not secret.
const getClickMerchantUserId = (): string | null =>
  Deno.env.get("CLICK_MERCHANT_USER_ID") ?? null;

// Config the frontend needs to render the embedded card-payment widget
// (https://my.click.uz/pay/checkout.js) as an alternative to the hosted
// services/pay redirect. service_id / merchant_id / merchant_user_id are
// public identifiers — safe to return to the browser.
const buildCardWidgetConfig = (
  serviceId: string,
  merchantId: string,
  amount: number,
  merchantTransId: string,
): {
  service_id: string;
  merchant_id: string;
  merchant_user_id: string | null;
  amount: string;
  transaction_param: string;
} => ({
  service_id: serviceId,
  merchant_id: merchantId,
  merchant_user_id: getClickMerchantUserId(),
  amount: amount.toFixed(2),
  transaction_param: merchantTransId,
});

const buildClickPaymentUrl = (
  serviceId: string,
  merchantId: string,
  amount: number,
  merchantTransId: string,
  returnUrl: string | null,
): string => {
  const params = new URLSearchParams({
    service_id: serviceId,
    merchant_id: merchantId,
    amount: amount.toFixed(2),
    transaction_param: merchantTransId,
  });
  if (returnUrl) params.set("return_url", returnUrl);
  return `${CLICK_BASE_URL}?${params.toString()}`;
};

const assertClickAmountAllowed = (amount: number): Response | null => {
  if (amount < CLICK_MIN_AMOUNT_UZS) {
    return jsonResponse(400, {
      error: `Click.uz minimum amount is ${CLICK_MIN_AMOUNT_UZS.toLocaleString()} UZS after discounts and credits`,
    });
  }
  if (amount > CLICK_MAX_AMOUNT_UZS) {
    return jsonResponse(400, {
      error: `Click.uz maximum amount is ${CLICK_MAX_AMOUNT_UZS.toLocaleString()} UZS per transaction`,
    });
  }
  return null;
};

// Verifies the MD5 signature sent by Click.uz on webhook calls.
// action=0 (prepare): MD5(click_trans_id + service_id + secret_key + merchant_trans_id + amount + action + sign_time)
// action=1 (complete): MD5(click_trans_id + service_id + secret_key + merchant_trans_id + merchant_prepare_id + amount + action + sign_time)
const verifyClickWebhookSignature = async (
  params: Record<string, string>,
  secretKey: string,
): Promise<boolean> => {
  const action = String(params.action ?? "");
  const clickTransId = String(params.click_trans_id ?? "");
  const serviceId = String(params.service_id ?? "");
  const merchantTransId = String(params.merchant_trans_id ?? "");
  const amount = String(params.amount ?? "");
  const signTime = String(params.sign_time ?? "");
  const receivedSign = String(params.sign_string ?? "");

  if (!receivedSign) return false;

  let raw: string;
  if (action === "1") {
    const merchantPrepareId = String(params.merchant_prepare_id ?? "");
    raw = `${clickTransId}${serviceId}${secretKey}${merchantTransId}${merchantPrepareId}${amount}${action}${signTime}`;
  } else {
    raw = `${clickTransId}${serviceId}${secretKey}${merchantTransId}${amount}${action}${signTime}`;
  }

  const expected = await md5Hex(raw);
  return expected === receivedSign;
};

// Auth header for Click.uz Merchant API v2:
// Format: merchant_user_id:SHA1(timestamp + secret_key):timestamp
const buildClickMerchantAuthHeader = async (
  merchantUserId: string,
  secretKey: string,
): Promise<string> => {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const digest = await sha1Hex(`${timestamp}${secretKey}`);
  return `${merchantUserId}:${digest}:${timestamp}`;
};

const normalizeClickPaymentStatus = (statusCode: unknown): string => {
  const code = Number(statusCode);
  if (code === 2) return "paid";
  if (code === -1) return "canceled";
  if (code === 1) return "pending";
  return "pending";
};

const fetchClickStatusFromApi = async (
  clickTransId: string,
): Promise<{ ok: boolean; status: string; raw: any }> => {
  const merchantUserId = Deno.env.get("CLICK_MERCHANT_USER_ID");
  const secretKey = Deno.env.get("CLICK_SECRET_KEY");
  const serviceId = Deno.env.get("CLICK_SERVICE_ID");

  if (!merchantUserId || !secretKey || !serviceId) {
    return { ok: false, status: "pending", raw: { error: "missing_config" } };
  }

  try {
    const authHeader = await buildClickMerchantAuthHeader(
      merchantUserId,
      secretKey,
    );
    const url =
      `${CLICK_MERCHANT_API_BASE}/payment/status/${serviceId}/${encodeURIComponent(clickTransId)}`;
    const res = await fetch(url, {
      method: "GET",
      headers: { "Auth": authHeader, "Content-Type": "application/json" },
    });
    const raw = await readJsonPayload(res);
    if (!res.ok) return { ok: false, status: "pending", raw };
    const status = normalizeClickPaymentStatus((raw as any)?.payment_status);
    return { ok: true, status, raw };
  } catch (err) {
    return {
      ok: false,
      status: "pending",
      raw: { error: String(err instanceof Error ? err.message : err) },
    };
  }
};

// ---------------------------------------------------------------------------
// Coupon helpers (unchanged business logic from the prior payment flow)
// ---------------------------------------------------------------------------

const getWindowError = (
  c: Pick<CouponRow, "starts_at" | "ends_at">,
): string | null => {
  const now = Date.now();
  if (c.starts_at) {
    const start = Date.parse(c.starts_at);
    if (Number.isFinite(start) && now < start) return "Coupon not started yet";
  }
  if (c.ends_at) {
    const end = Date.parse(c.ends_at);
    if (Number.isFinite(end) && now > end) return "Coupon expired";
  }
  return null;
};

const normalizeCouponStatus = (raw: unknown): string =>
  String(raw ?? "").trim().toLowerCase();

const countRedemptions = async (
  sb: any,
  couponId: string,
  userId?: string,
): Promise<number> => {
  let q = sb
    .from("coupon_redemptions")
    .select("id", { count: "exact", head: true })
    .eq("coupon_id", couponId)
    .or("status.is.null,status.in.(pending,applied)");

  if (userId) q = q.eq("user_id", userId);

  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
};

const hasPriorPaidPayment = async (
  sb: any,
  userId: string,
): Promise<boolean> => {
  const { count, error } = await sb
    .from("payments")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("status", ["paid", "success"]);
  if (error) throw error;
  return (count ?? 0) > 0;
};

type CouponValidationResult =
  | {
    ok: true;
    pricing: {
      original_amount: number;
      discount_amount: number;
      final_amount: number;
    };
  }
  | { ok: false; error: string; error_code: string };

const validateCoupon = async (
  sb: any,
  coupon: CouponRow,
  plan: Pick<PlanRow, "id" | "product_id" | "amount" | "currency">,
  userId: string,
): Promise<CouponValidationResult> => {
  if (!coupon.is_active) {
    return {
      ok: false,
      error: "Coupon is disabled",
      error_code: "coupon_inactive",
    };
  }

  const status = normalizeCouponStatus(coupon.status);
  if (status && status !== "active") {
    return {
      ok: false,
      error: status === "paused" ? "Coupon is paused" : "Coupon is expired",
      error_code: status === "paused" ? "coupon_paused" : "coupon_expired",
    };
  }

  const windowError = getWindowError(coupon);
  if (windowError) {
    return {
      ok: false,
      error: windowError,
      error_code: windowError.toLowerCase().includes("start")
        ? "coupon_not_started"
        : "coupon_expired",
    };
  }

  if (coupon.product_id !== plan.product_id) {
    return {
      ok: false,
      error: "Coupon not applicable",
      error_code: "coupon_scope",
    };
  }
  if (coupon.plan_id && coupon.plan_id !== plan.id) {
    return {
      ok: false,
      error: "Coupon not applicable",
      error_code: "coupon_scope",
    };
  }

  const original = Number(plan.amount);
  if (!Number.isFinite(original) || original <= 0) {
    return {
      ok: false,
      error: "Invalid plan amount",
      error_code: "invalid_plan",
    };
  }

  if (coupon.min_amount && original < coupon.min_amount) {
    return {
      ok: false,
      error: `Minimum purchase is ${coupon.min_amount} ${plan.currency}`,
      error_code: "coupon_min_amount",
    };
  }

  if (coupon.first_purchase_only) {
    const hasPaid = await hasPriorPaidPayment(sb, userId);
    if (hasPaid) {
      return {
        ok: false,
        error: "Coupon only valid for first purchase",
        error_code: "coupon_first_purchase",
      };
    }
  }

  if (coupon.max_redemptions) {
    const total = await countRedemptions(sb, coupon.id);
    if (total >= coupon.max_redemptions) {
      return {
        ok: false,
        error: "Coupon usage limit reached",
        error_code: "coupon_limit_reached",
      };
    }
  }

  if (coupon.max_per_user) {
    const used = await countRedemptions(sb, coupon.id, userId);
    if (used >= coupon.max_per_user) {
      return {
        ok: false,
        error: "Coupon already used",
        error_code: "coupon_used",
      };
    }
  }

  const pricing = computeDiscount(plan, coupon);
  if (!pricing) {
    return {
      ok: false,
      error: "Coupon not applicable",
      error_code: "coupon_not_applicable",
    };
  }

  return { ok: true, pricing };
};

// ---------------------------------------------------------------------------
// Referral helpers (unchanged from the prior payment flow)
// ---------------------------------------------------------------------------

const sanitizeReferralMetadata = (
  value: unknown,
): Record<string, unknown> => {
  if (!isPlainObject(value)) return {};
  const source = isPlainObject(value.referral_context)
    ? value.referral_context
    : value;
  const allowed = [
    "audience", "service", "source", "target", "channel",
    "landing_path", "landing_search", "utm_source", "utm_medium",
    "utm_campaign", "utm_content", "utm_term",
  ];
  const out: Record<string, unknown> = {};
  for (const key of allowed) {
    const text = String(source[key] ?? "").trim();
    if (text) out[key] = text.slice(0, key === "landing_search" ? 1000 : 240);
  }
  return out;
};

const hasPriorPaidPaymentExcept = async (
  sb: any,
  userId: string,
  paymentId?: string | null,
): Promise<boolean> => {
  let query = sb
    .from("payments")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("status", ["paid", "success", "completed"]);

  if (paymentId) query = query.neq("id", paymentId);

  const { count, error } = await query;
  if (error) throw error;
  return (count ?? 0) > 0;
};

const isProgramEligible = (
  program: any,
  purchaseKind: string,
  currency: string,
  originalAmount: number,
): boolean => {
  if (
    !program ||
    String(program.status ?? "").toLowerCase() !== "active"
  ) return false;
  if (
    String(program.currency ?? "UZS").toUpperCase() !==
      String(currency ?? "UZS").toUpperCase()
  ) return false;
  const eligibleTypes = Array.isArray(program.eligible_purchase_types)
    ? program.eligible_purchase_types.map((v: unknown) => String(v))
    : [];
  if (eligibleTypes.length > 0 && !eligibleTypes.includes(purchaseKind)) {
    return false;
  }
  const minAmount = normalizeMoney(program.min_purchase_amount);
  if (minAmount > 0 && originalAmount < minAmount) return false;
  return true;
};

type ReferralCheckoutResult =
  | {
    ok: true;
    referralAttributionId: string | null;
    referralCode: string | null;
    referralDiscountAmount: number;
  }
  | { ok: false; response: Response };

const resolveReferralCheckout = async (
  sb: any,
  input: {
    userId: string;
    referralCode?: string | null;
    referralAttributionId?: string | null;
    purchaseKind: string;
    currency: string;
    originalAmount: number;
    metadata?: Record<string, unknown> | null;
  },
): Promise<ReferralCheckoutResult> => {
  let attribution: any = null;
  let program: any = null;
  let referralCode = normalizeReferralCode(input.referralCode);
  const referralMetadata = sanitizeReferralMetadata(input.metadata);

  const attributionId = String(input.referralAttributionId ?? "").trim();
  if (attributionId) {
    const { data, error } = await sb
      .from("referral_attributions")
      .select(
        "id, program_id, referrer_user_id, referred_user_id, referral_code, status, referral_programs ( id, status, currency, referred_discount_type, referred_discount_value, referrer_credit_type, referrer_credit_value, referrer_credit_cap, referrer_cash_type, referrer_cash_value, referrer_cash_cap, cash_payouts_enabled, minimum_cash_payout_amount, min_purchase_amount, eligible_purchase_types, first_purchase_only )",
      )
      .eq("id", attributionId)
      .eq("referred_user_id", input.userId)
      .maybeSingle();
    if (error) {
      return {
        ok: false,
        response: jsonResponse(500, {
          error: "Failed to load referral attribution",
          details: error,
        }),
      };
    }
    if (!data) {
      return {
        ok: false,
        response: jsonResponse(400, { error: "Invalid referral attribution" }),
      };
    }
    attribution = data;
    program = (data as any).referral_programs ?? null;
    referralCode = normalizeReferralCode((data as any).referral_code);
  } else if (referralCode) {
    const { data: account, error: accountError } = await sb
      .from("referral_accounts")
      .select("user_id, referral_code, status")
      .eq("referral_code", referralCode)
      .maybeSingle();
    if (accountError) {
      return {
        ok: false,
        response: jsonResponse(500, {
          error: "Failed to load referral code",
          details: accountError,
        }),
      };
    }
    if (
      !account || String((account as any).status ?? "") !== "active"
    ) {
      return {
        ok: false,
        response: jsonResponse(400, { error: "Invalid referral code" }),
      };
    }
    if (String((account as any).user_id) === input.userId) {
      return {
        ok: false,
        response: jsonResponse(400, {
          error: "Self-referral is not allowed",
        }),
      };
    }

    const { data: programRow, error: programError } = await sb
      .from("referral_programs")
      .select(
        "id, status, currency, referred_discount_type, referred_discount_value, referrer_credit_type, referrer_credit_value, referrer_credit_cap, referrer_cash_type, referrer_cash_value, referrer_cash_cap, cash_payouts_enabled, minimum_cash_payout_amount, min_purchase_amount, eligible_purchase_types, first_purchase_only",
      )
      .eq("program_key", "default")
      .maybeSingle();
    if (programError) {
      return {
        ok: false,
        response: jsonResponse(500, {
          error: "Failed to load referral program",
          details: programError,
        }),
      };
    }
    if (!programRow?.id) {
      return {
        ok: true,
        referralAttributionId: null,
        referralCode,
        referralDiscountAmount: 0,
      };
    }
    program = programRow;

    const { data: existing, error: existingError } = await sb
      .from("referral_attributions")
      .select(
        "id, program_id, referrer_user_id, referred_user_id, referral_code, status",
      )
      .eq("program_id", program.id)
      .eq("referred_user_id", input.userId)
      .maybeSingle();
    if (existingError) {
      return {
        ok: false,
        response: jsonResponse(500, {
          error: "Failed to load referral attribution",
          details: existingError,
        }),
      };
    }

    if (existing?.id) {
      attribution = existing;
      referralCode = normalizeReferralCode((existing as any).referral_code);
    } else {
      const { data: inserted, error: insertError } = await sb
        .from("referral_attributions")
        .insert({
          program_id: program.id,
          referrer_user_id: (account as any).user_id,
          referred_user_id: input.userId,
          referral_code: referralCode,
          status: "pending",
          metadata: { source: "checkout", ...referralMetadata },
        })
        .select(
          "id, program_id, referrer_user_id, referred_user_id, referral_code, status",
        )
        .maybeSingle();
      if (insertError) {
        return {
          ok: false,
          response: jsonResponse(500, {
            error: "Failed to claim referral",
            details: insertError,
          }),
        };
      }
      attribution = inserted;
    }
  } else {
    const { data: programRow, error: programError } = await sb
      .from("referral_programs")
      .select(
        "id, status, currency, referred_discount_type, referred_discount_value, referrer_credit_type, referrer_credit_value, referrer_credit_cap, referrer_cash_type, referrer_cash_value, referrer_cash_cap, cash_payouts_enabled, minimum_cash_payout_amount, min_purchase_amount, eligible_purchase_types, first_purchase_only",
      )
      .eq("program_key", "default")
      .maybeSingle();
    if (programError) {
      return {
        ok: false,
        response: jsonResponse(500, {
          error: "Failed to load referral program",
          details: programError,
        }),
      };
    }

    if (programRow?.id) {
      const { data: existing, error: existingError } = await sb
        .from("referral_attributions")
        .select(
          "id, program_id, referrer_user_id, referred_user_id, referral_code, status",
        )
        .eq("program_id", programRow.id)
        .eq("referred_user_id", input.userId)
        .eq("status", "pending")
        .maybeSingle();
      if (existingError) {
        return {
          ok: false,
          response: jsonResponse(500, {
            error: "Failed to load referral attribution",
            details: existingError,
          }),
        };
      }

      if (existing?.id) {
        attribution = existing;
        program = programRow;
        referralCode = normalizeReferralCode(
          (existing as any).referral_code,
        );
      }
    }
  }

  if (!attribution?.id || !program) {
    return {
      ok: true,
      referralAttributionId: attribution?.id ?? null,
      referralCode,
      referralDiscountAmount: 0,
    };
  }

  let referralDiscountAmount = 0;
  if (
    String(attribution.status ?? "pending") === "pending" &&
    isProgramEligible(
      program,
      input.purchaseKind,
      input.currency,
      input.originalAmount,
    )
  ) {
    const firstPurchaseOnly = Boolean(program.first_purchase_only);
    const alreadyPaid = firstPurchaseOnly
      ? await hasPriorPaidPaymentExcept(sb, input.userId, null)
      : false;
    if (!alreadyPaid) {
      referralDiscountAmount = computeConfiguredAmount(
        input.originalAmount,
        program.referred_discount_type,
        program.referred_discount_value,
      );
    }
  }

  return {
    ok: true,
    referralAttributionId: attribution.id,
    referralCode,
    referralDiscountAmount,
  };
};

const issueReferralReward = async (
  sb: any,
  payment: PaymentGrantRow,
): Promise<void> => {
  if (!payment.referral_attribution_id || !payment.user_id) return;

  const meta = payment.metadata ?? {};
  const purchaseKind = purchaseKindForProgram(
    normalizePurchaseType(
      payment.purchase_type ?? (meta as any)?.purchase_type,
    ),
  );
  const originalAmount = normalizeMoney(
    payment.original_amount ?? payment.amount ?? 0,
  );
  const currency = String(payment.currency ?? "UZS").toUpperCase();

  const { data: attribution, error: attributionError } = await sb
    .from("referral_attributions")
    .select(
      "id, program_id, referrer_user_id, referred_user_id, referral_code, status, converted_payment_id, referral_programs ( id, status, currency, referrer_credit_type, referrer_credit_value, referrer_credit_cap, referrer_cash_type, referrer_cash_value, referrer_cash_cap, cash_payouts_enabled, minimum_cash_payout_amount, min_purchase_amount, eligible_purchase_types, first_purchase_only )",
    )
    .eq("id", payment.referral_attribution_id)
    .maybeSingle();
  if (attributionError || !attribution?.id) return;
  if (
    String((attribution as any).referred_user_id) !== payment.user_id
  ) return;

  const program = (attribution as any).referral_programs ?? null;
  if (
    !isProgramEligible(program, purchaseKind, currency, originalAmount)
  ) return;
  if (
    Boolean(program.first_purchase_only) &&
    await hasPriorPaidPaymentExcept(sb, payment.user_id, payment.id)
  ) return;

  const creditAmount = computeConfiguredAmount(
    originalAmount,
    program.referrer_credit_type,
    program.referrer_credit_value,
    program.referrer_credit_cap,
  );
  const cashAmount = Boolean(program.cash_payouts_enabled)
    ? computeConfiguredAmount(
      originalAmount,
      program.referrer_cash_type,
      program.referrer_cash_value,
      program.referrer_cash_cap,
    )
    : 0;
  if (creditAmount <= 0 && cashAmount <= 0) return;

  let reward: any = null;
  const { data: inserted, error: insertError } = await sb
    .from("referral_rewards")
    .insert({
      attribution_id: attribution.id,
      program_id: program.id,
      referrer_user_id: (attribution as any).referrer_user_id,
      referred_user_id: payment.user_id,
      payment_id: payment.id,
      status: "issued",
      credit_amount: creditAmount,
      cash_amount: cashAmount,
      cash_status: cashAmount > 0 ? "available" : "none",
      currency,
      issued_at: new Date().toISOString(),
      metadata: {
        purchase_type: purchaseKind,
        payment_original_amount: payment.original_amount ?? null,
        payment_amount: payment.amount ?? null,
      },
    })
    .select(
      "id, status, credit_amount, cash_amount, cash_status, referrer_user_id, currency",
    )
    .maybeSingle();

  if (insertError) {
    const { data: existing } = await sb
      .from("referral_rewards")
      .select(
        "id, status, credit_amount, cash_amount, cash_status, referrer_user_id, currency",
      )
      .eq("attribution_id", attribution.id)
      .eq("payment_id", payment.id)
      .maybeSingle();
    reward = existing ?? null;
  } else {
    reward = inserted;
  }

  if (!reward?.id || String(reward.status) === "reversed") return;

  const { data: existingCreditGrant } = await sb
    .from("platform_credit_ledger")
    .select("id")
    .eq("reward_id", reward.id)
    .eq("entry_kind", "grant")
    .maybeSingle();

  if (
    normalizeMoney(reward.credit_amount) > 0 && !existingCreditGrant?.id
  ) {
    await sb.from("platform_credit_ledger").insert({
      user_id: reward.referrer_user_id,
      tenant_id: payment.tenant_id ?? null,
      currency: reward.currency ?? currency,
      amount: normalizeMoney(reward.credit_amount),
      entry_kind: "grant",
      status: "posted",
      payment_id: payment.id,
      reward_id: reward.id,
      metadata: {
        attribution_id: attribution.id,
        referred_user_id: payment.user_id,
      },
    });
  }

  await sb
    .from("referral_rewards")
    .update({ status: "issued", issued_at: new Date().toISOString() })
    .eq("id", reward.id)
    .neq("status", "reversed");

  await sb
    .from("referral_attributions")
    .update({
      status: "converted",
      converted_payment_id: payment.id,
      converted_at: new Date().toISOString(),
    })
    .eq("id", attribution.id)
    .in("status", ["pending", "converted"]);
};

// ---------------------------------------------------------------------------
// Platform credit helpers
// ---------------------------------------------------------------------------

const getCreditAvailable = async (
  sb: any,
  userId: string,
  currency: string,
): Promise<number> => {
  const { data, error } = await sb.rpc("platform_credit_available", {
    p_user_id: userId,
    p_currency: currency,
  });
  if (error) throw error;
  return normalizeMoney(data);
};

const reserveCredit = async (
  sb: any,
  input: {
    userId: string;
    tenantId: string;
    amount: number;
    currency: string;
    paymentId: string;
    metadata?: Record<string, unknown>;
  },
): Promise<{ ok: boolean; details: any }> => {
  if (!input.amount) return { ok: true, details: { ok: true, amount: 0 } };
  const { data, error } = await sb.rpc("reserve_platform_credit", {
    p_user_id: input.userId,
    p_tenant_id: input.tenantId,
    p_amount: input.amount,
    p_currency: input.currency,
    p_payment_id: input.paymentId,
    p_metadata: input.metadata ?? {},
  });
  if (error) return { ok: false, details: error };
  return { ok: Boolean((data as any)?.ok), details: data };
};

// ---------------------------------------------------------------------------
// Payment grant types + helpers
// ---------------------------------------------------------------------------

type PaymentGrantRow = {
  id: string;
  provider?: string | null;
  provider_transaction_id: string;
  user_id: string | null;
  tenant_id: string | null;
  product_id: string | null;
  plan_id: string | null;
  status: string;
  granted_at: string | null;
  coupon_id: string | null;
  coupon_code?: string | null;
  original_amount?: number | null;
  discount_amount?: number | null;
  amount?: number | null;
  currency?: string | null;
  credit_amount?: number | null;
  referral_discount_amount?: number | null;
  referral_attribution_id?: string | null;
  purchase_type?: string | null;
  plan_snapshot?: Record<string, unknown> | null;
  entitlement_terms?: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
};

type ResolvedGrantTerms = {
  durationDays: number | null;
  includedProductIds: string[];
  limits: Record<string, number>;
  sourcePlanId: string | null;
};

const syncAcademyPaymentFromPlatformPayment = async (
  sb: any,
  payment: PaymentGrantRow,
  status: string,
  metadataPatch: Record<string, unknown> = {},
): Promise<void> => {
  if (!isAcademyTuitionPayment(payment)) return;

  const platformMeta = payment.metadata ?? {};
  const academyPaymentId = String((platformMeta as any)?.academy_payment_id ?? "").trim();
  if (!academyPaymentId) return;

  const { data: academyPayment, error: loadError } = await sb
    .from("academy_payments")
    .select("id, metadata")
    .eq("id", academyPaymentId)
    .maybeSingle();
  if (loadError || !academyPayment?.id) {
    console.error("academy_payment_sync_lookup_failed", {
      academy_payment_id: academyPaymentId,
      platform_payment_id: payment.id,
      error: loadError?.message ?? "not_found",
    });
    return;
  }

  const currentMetadata = isPlainObject((academyPayment as any).metadata)
    ? (academyPayment as any).metadata
    : {};
  const clickTransId = String(
    (platformMeta as any)?.click_trans_id ?? payment.provider_transaction_id ?? "",
  ).trim();
  const clickPaydocId = String((platformMeta as any)?.click_paydoc_id ?? "").trim();
  const normalizedStatus = String(status ?? "").trim().toLowerCase();
  const academyStatus = isSuccessStatus(normalizedStatus)
    ? "paid"
    : ["canceled", "cancelled", "expired"].includes(normalizedStatus)
    ? "canceled"
    : ["failed", "failure", "rejected"].includes(normalizedStatus)
    ? "failed"
    : "pending";

  const { error } = await sb
    .from("academy_payments")
    .update({
      status: academyStatus,
      provider: "click",
      provider_transaction_id: clickTransId || payment.provider_transaction_id || academyPaymentId,
      metadata: {
        ...currentMetadata,
        platform_payment_id: payment.id,
        platform_payment_status: normalizedStatus || status,
        academy_payment_status: academyStatus,
        platform_provider_transaction_id: payment.provider_transaction_id ?? null,
        click_trans_id: clickTransId || null,
        click_paydoc_id: clickPaydocId || null,
        provider_reconciled_at: new Date().toISOString(),
        ...metadataPatch,
      },
    })
    .eq("id", academyPaymentId);
  if (error) {
    console.error("academy_payment_sync_failed", {
      academy_payment_id: academyPaymentId,
      platform_payment_id: payment.id,
      status: academyStatus,
      error: error.message ?? String(error),
    });
  }
};

const resolveGrantTerms = async (
  sb: any,
  paymentRow: PaymentGrantRow,
): Promise<ResolvedGrantTerms> => {
  const directTerms = parseEntitlementTerms(
    paymentRow.entitlement_terms ?? null,
  );
  if (directTerms) {
    return {
      durationDays: directTerms.duration_days,
      includedProductIds: directTerms.included_product_ids,
      limits: directTerms.limits,
      sourcePlanId: directTerms.source_plan_id ?? paymentRow.plan_id ?? null,
    };
  }

  const planSnapshot =
    paymentRow.plan_snapshot &&
      typeof paymentRow.plan_snapshot === "object" &&
      !Array.isArray(paymentRow.plan_snapshot)
      ? paymentRow.plan_snapshot
      : null;
  if (planSnapshot) {
    const durationRaw = (planSnapshot as any).duration_days;
    const durationDays =
      durationRaw === null || typeof durationRaw === "undefined"
        ? null
        : Number.isFinite(Number(durationRaw))
        ? Math.max(1, Math.floor(Number(durationRaw)))
        : null;
    const meta = (planSnapshot as any).metadata ?? null;
    return {
      durationDays,
      includedProductIds: extractIncludedProductIds(meta),
      limits: extractPlanLimits(meta),
      sourcePlanId: String(
        (planSnapshot as any).id ?? paymentRow.plan_id ?? "",
      ),
    };
  }

  if (!paymentRow.plan_id) {
    return {
      durationDays: null,
      includedProductIds: [],
      limits: {},
      sourcePlanId: null,
    };
  }

  const { data: planRow } = await sb
    .from("plans")
    .select("id, duration_days, metadata")
    .eq("id", paymentRow.plan_id)
    .maybeSingle();

  if (!planRow) {
    throw new Error(
      `Plan terms unavailable for payment ${paymentRow.id} (plan ${paymentRow.plan_id})`,
    );
  }

  const durationRaw = (planRow as any).duration_days;
  const durationDays =
    durationRaw === null || typeof durationRaw === "undefined"
      ? null
      : Number.isFinite(Number(durationRaw))
      ? Math.max(1, Math.floor(Number(durationRaw)))
      : null;
  const meta = (planRow as any).metadata ?? null;

  return {
    durationDays,
    includedProductIds: extractIncludedProductIds(meta),
    limits: extractPlanLimits(meta),
    sourcePlanId: String((planRow as any).id ?? paymentRow.plan_id),
  };
};

const paymentGrantSelect =
  "id, provider, provider_transaction_id, user_id, tenant_id, product_id, plan_id, status, granted_at, coupon_id, coupon_code, original_amount, discount_amount, amount, currency, credit_amount, referral_discount_amount, referral_attribution_id, purchase_type, plan_snapshot, entitlement_terms, metadata";

const loadPaymentById = async (
  sb: any,
  paymentId: string,
): Promise<{ payment: PaymentGrantRow | null; error: any }> => {
  const value = String(paymentId ?? "").trim();
  if (!value) return { payment: null, error: null };

  const { data, error } = await sb
    .from("payments")
    .select(paymentGrantSelect)
    .eq("id", value)
    .maybeSingle();
  return {
    payment: (data ?? null) as PaymentGrantRow | null,
    error: error ?? null,
  };
};

// Looks up by payment UUID (merchant_trans_id we sent to Click) OR by
// provider_transaction_id (which becomes click_trans_id after PREPARE).
const loadPaymentByReference = async (
  sb: any,
  ref: string,
): Promise<{ payment: PaymentGrantRow | null; error: any }> => {
  const value = String(ref ?? "").trim();
  if (!value) return { payment: null, error: null };

  const queries = [
    sb.from("payments").select(paymentGrantSelect).eq("provider_transaction_id", value).eq("provider", "click").maybeSingle(),
    sb.from("payments").select(paymentGrantSelect).eq("id", value).maybeSingle(),
  ];

  for (const query of queries) {
    const { data, error } = await query;
    if (error) return { payment: null, error };
    if (data) return { payment: data as PaymentGrantRow, error: null };
  }

  return { payment: null, error: null };
};

// ---------------------------------------------------------------------------
// Grant helpers
// ---------------------------------------------------------------------------

const applyCenterTierUpgrade = async (
  supabase: any,
  payment: PaymentGrantRow,
): Promise<Response | null> => {
  const meta = payment.metadata ?? {};
  const targetTier = normalizeCenterTier(
    (meta as any)?.requested_tier ?? (meta as any)?.center_tier,
  );
  const previousTier =
    normalizeCenterTier((meta as any)?.previous_tier) ?? "starter";
  const billingPeriod = normalizeBillingPeriod(
    (meta as any)?.billing_period,
  );
  if (
    !payment.tenant_id || !payment.user_id || !targetTier ||
    targetTier === "starter"
  ) {
    await supabase
      .from("payments")
      .update({
        granted_at: null,
        grant_error: "Invalid center tier upgrade metadata",
      })
      .eq("id", payment.id);
    return jsonResponse(500, {
      error: "Invalid center tier upgrade metadata",
    });
  }

  const { data: currentProfile, error: profileError } = await supabase
    .from("partner_center_profiles")
    .select(
      "tenant_id, package_tier, status, powered_by_schood, wallet_settings",
    )
    .eq("tenant_id", payment.tenant_id)
    .maybeSingle();
  if (profileError || !currentProfile?.tenant_id) {
    await supabase
      .from("payments")
      .update({
        granted_at: null,
        grant_error: "Education center profile not found",
      })
      .eq("id", payment.id);
    return jsonResponse(500, {
      error: "Education center profile not found",
    });
  }

  const currentTier =
    normalizeCenterTier((currentProfile as any).package_tier) ??
      previousTier;
  if (CENTER_TIER_RANK[targetTier] < CENTER_TIER_RANK[currentTier]) {
    await supabase
      .from("payments")
      .update({
        granted_at: null,
        grant_error: "Paid tier downgrades are not automatic",
      })
      .eq("id", payment.id);
    return jsonResponse(500, {
      error: "Paid tier downgrades are not automatic",
    });
  }

  let durationDays = 30;
  if (payment.plan_id) {
    const { data: planRow } = await supabase
      .from("plans")
      .select("duration_days, metadata")
      .eq("id", payment.plan_id)
      .maybeSingle();
    const planDays = Number((planRow as any)?.duration_days ?? 0);
    if (Number.isFinite(planDays) && planDays > 0) {
      durationDays = Math.floor(planDays);
    }
  }
  if ((meta as any)?.duration_days) {
    const metaDays = Number((meta as any).duration_days);
    if (Number.isFinite(metaDays) && metaDays > 0) {
      durationDays = Math.floor(metaDays);
    }
  }

  const nowIso = new Date().toISOString();
  const periodEnd = new Date(
    Date.now() + durationDays * 86400000,
  ).toISOString();
  const patch: Record<string, unknown> = {
    package_tier: targetTier,
    status: (currentProfile as any).status === "active"
      ? "active"
      : (currentProfile as any).status,
    wallet_settings: {
      ...(((currentProfile as any).wallet_settings &&
          typeof (currentProfile as any).wallet_settings === "object" &&
          !Array.isArray((currentProfile as any).wallet_settings))
        ? (currentProfile as any).wallet_settings
        : {}),
      upgraded_by_payment_id: payment.id,
      tier_period_end: periodEnd,
      tier_billing_period: billingPeriod,
    },
  };
  if (targetTier === "growth") patch.powered_by_schood = true;

  const { error: updateError } = await supabase
    .from("partner_center_profiles")
    .update(patch)
    .eq("tenant_id", payment.tenant_id);
  if (updateError) {
    await supabase
      .from("payments")
      .update({
        granted_at: null,
        grant_error: String(updateError.message ?? updateError),
      })
      .eq("id", payment.id);
    return jsonResponse(500, {
      error: "Failed to update center tier",
      details: updateError,
    });
  }

  await supabase.from("partner_center_tier_subscriptions").upsert(
    {
      tenant_id: payment.tenant_id,
      current_tier: targetTier,
      status: "active",
      billing_period: billingPeriod,
      current_period_start: nowIso,
      current_period_end: periodEnd,
      payment_id: payment.id,
      amount: payment.amount ?? null,
      currency: payment.currency ?? "UZS",
      metadata: {
        source: "click",
        previous_tier: currentTier,
        plan_id: payment.plan_id ?? null,
      },
    },
    { onConflict: "tenant_id" },
  );

  const requestId = String(
    (meta as any)?.tier_change_request_id ?? "",
  ).trim();
  if (requestId) {
    await supabase
      .from("partner_center_tier_change_requests")
      .update({
        status: "applied",
        payment_id: payment.id,
        applied_at: nowIso,
        metadata: {
          ...meta,
          applied_tier: targetTier,
          applied_period_end: periodEnd,
        },
      })
      .eq("id", requestId)
      .eq("tenant_id", payment.tenant_id);
  }

  await supabase
    .from("payments")
    .update({
      metadata: {
        ...meta,
        center_tier_applied: targetTier,
        center_tier_period_end: periodEnd,
      },
    })
    .eq("id", payment.id);

  return null;
};

const applyCenterWalletTopup = async (
  supabase: any,
  payment: PaymentGrantRow,
): Promise<Response | null> => {
  const meta = payment.metadata ?? {};
  const amount = normalizeMoney(
    (meta as any).wallet_topup_amount ?? payment.original_amount ?? payment.amount ?? 0,
  );
  const currency = String(
    (meta as any).wallet_topup_currency ?? payment.currency ?? "UZS",
  ).toUpperCase();

  if (!payment.tenant_id || !payment.user_id || amount <= 0) {
    await supabase
      .from("payments")
      .update({
        granted_at: null,
        grant_error: "Invalid center wallet top-up metadata",
      })
      .eq("id", payment.id);
    return jsonResponse(500, {
      error: "Invalid center wallet top-up metadata",
    });
  }

  const { data: existing, error: existingError } = await supabase
    .from("partner_wallet_ledger")
    .select("id")
    .eq("payment_id", payment.id)
    .eq("entry_kind", "topup")
    .maybeSingle();
  if (existingError) {
    await supabase
      .from("payments")
      .update({ granted_at: null, grant_error: existingError.message })
      .eq("id", payment.id);
    return jsonResponse(500, {
      error: "Failed to inspect wallet ledger",
      details: existingError,
    });
  }
  if (existing?.id) return null;

  const { error } = await supabase.from("partner_wallet_ledger").insert({
    tenant_id: payment.tenant_id,
    user_id: payment.user_id,
    entry_kind: "topup",
    status: "posted",
    amount,
    currency,
    payment_id: payment.id,
    created_by: payment.user_id,
    metadata: {
      source: "click",
      click_payment_id: payment.id,
      click_transaction_id: payment.provider_transaction_id ?? null,
      note: (meta as any).note ?? null,
    },
  });
  if (error) {
    await supabase
      .from("payments")
      .update({
        granted_at: null,
        grant_error: String(error.message ?? error),
      })
      .eq("id", payment.id);
    return jsonResponse(500, {
      error: "Failed to post wallet top-up",
      details: error,
    });
  }

  await supabase
    .from("payments")
    .update({
      metadata: {
        ...meta,
        center_wallet_topup_posted: true,
        center_wallet_topup_posted_at: new Date().toISOString(),
      },
    })
    .eq("id", payment.id);

  return null;
};

const grantPaidPaymentOnce = async (
  supabase: any,
  payment: PaymentGrantRow,
  usedStatusId: string,
): Promise<Response | null> => {
  if (!payment.tenant_id || !payment.user_id) return null;

  const nowIso = new Date().toISOString();
  const { data: claim } = await supabase
    .from("payments")
    .update({ granted_at: nowIso, grant_error: null })
    .eq("id", payment.id)
    .is("granted_at", null)
    .select("id")
    .maybeSingle();

  if (claim) {
    const meta = payment.metadata ?? {};
    const purchaseType = normalizePurchaseType(
      payment.purchase_type ?? (meta as any)?.purchase_type,
    );

    if (purchaseType === "center_tier_upgrade") {
      const response = await applyCenterTierUpgrade(supabase, payment);
      if (response) return response;
    } else if (purchaseType === "center_wallet_topup") {
      const response = await applyCenterWalletTopup(supabase, payment);
      if (response) return response;
    } else if (purchaseType === "academy_tuition") {
      const academyPaymentId = String((meta as any)?.academy_payment_id ?? "").trim();
      if (!academyPaymentId) {
        await supabase
          .from("payments")
          .update({ granted_at: null, grant_error: "Missing academy_payment_id" })
          .eq("id", payment.id);
        return jsonResponse(500, { error: "Invalid academy tuition metadata" });
      }
      const { error: applyErr } = await supabase.rpc("apply_academy_payment", {
        p_payment_id: academyPaymentId,
        p_actor_id: payment.user_id,
      });
      if (applyErr) {
        await supabase
          .from("payments")
          .update({ granted_at: null, grant_error: String(applyErr.message ?? applyErr) })
          .eq("id", payment.id);
        return jsonResponse(500, { error: "Failed to apply academy tuition", details: applyErr });
      }
    } else if (purchaseType === "token_pack") {
      const experienceId = String((meta as any)?.experience_id ?? "");
      const qty = normalizeQuantity((meta as any)?.quantity, 500);
      const days = normalizeDays((meta as any)?.expires_in_days);
      if (!experienceId || !qty || !days) {
        await supabase
          .from("payments")
          .update({
            granted_at: null,
            grant_error: "Invalid token pack metadata",
          })
          .eq("id", payment.id);
        return jsonResponse(500, { error: "Invalid token pack metadata" });
      }

      const expiresAt = new Date(
        Date.now() + days * 86400000,
      ).toISOString();
      const rows = [];
      for (let i = 0; i < qty; i += 1) {
        const code = await ensureUniqueTokenCode(supabase);
        rows.push({
          tenant_id: payment.tenant_id,
          experience_id: experienceId,
          token_code: code,
          status: "active",
          expires_at: expiresAt,
          max_uses: 1,
          uses_count: 0,
          created_by: payment.user_id,
        });
      }

      const { error: tokenErr } = await supabase
        .from("exam_tokens")
        .insert(rows);
      if (tokenErr) {
        await supabase
          .from("payments")
          .update({
            granted_at: null,
            grant_error: String(tokenErr.message ?? tokenErr),
          })
          .eq("id", payment.id);
        return jsonResponse(500, {
          error: "Failed to create tokens",
          details: tokenErr,
        });
      }

      await supabase
        .from("payments")
        .update({ metadata: { ...meta, tokens_created: qty } })
        .eq("id", payment.id);
    } else if (purchaseType === "seat_pack") {
      const qty = normalizeQuantity(
        (meta as any)?.seat_count ?? (meta as any)?.quantity,
        500,
      );
      const planId = String(
        (meta as any)?.seat_plan_id ?? payment.plan_id ?? "",
      );
      if (!qty || !planId || !payment.tenant_id) {
        await supabase
          .from("payments")
          .update({
            granted_at: null,
            grant_error: "Invalid seat pack metadata",
          })
          .eq("id", payment.id);
        return jsonResponse(500, { error: "Invalid seat pack metadata" });
      }

      const { data: planRow } = await supabase
        .from("plans")
        .select("id, product_id, duration_days")
        .eq("id", planId)
        .maybeSingle();
      if (!planRow?.id) {
        await supabase
          .from("payments")
          .update({
            granted_at: null,
            grant_error: "Plan not found for seat pack",
          })
          .eq("id", payment.id);
        return jsonResponse(500, { error: "Plan not found" });
      }

      const expiresAt = new Date(
        Date.now() + 30 * 86400000,
      ).toISOString();
      const seats = Array.from({ length: qty }).map(() => ({
        tenant_id: payment.tenant_id,
        plan_id: planRow.id,
        product_id: planRow.product_id,
        purchaser_id: payment.user_id,
        status: "unassigned",
        expires_at: expiresAt,
        created_at: nowIso,
        payment_id: payment.id,
        metadata: { purchase_type: "seat_pack" },
      }));

      const { error: seatErr } = await supabase
        .from("seat_licenses")
        .insert(seats);
      if (seatErr) {
        await supabase
          .from("payments")
          .update({
            granted_at: null,
            grant_error: String(seatErr.message ?? seatErr),
          })
          .eq("id", payment.id);
        return jsonResponse(500, {
          error: "Failed to create seats",
          details: seatErr,
        });
      }
    } else if (payment.product_id) {
      let terms: ResolvedGrantTerms;
      try {
        terms = await resolveGrantTerms(supabase, payment);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await supabase
          .from("payments")
          .update({ granted_at: null, grant_error: msg })
          .eq("id", payment.id);
        return jsonResponse(500, { error: msg });
      }

      const entitlementValue = buildEntitlementValue(
        terms.sourcePlanId ?? payment.plan_id,
        terms.limits,
      );
      const targetProductIds = getEntitlementTargets(
        payment.product_id,
        terms.includedProductIds,
      );

      const { data: existingRows } = await supabase
        .from("entitlements")
        .select("resource_id, ends_at")
        .eq("tenant_id", payment.tenant_id)
        .eq("resource_type", "product")
        .in("resource_id", targetProductIds);

      const existingMap = new Map<string, string | null>();
      (existingRows ?? []).forEach((row: any) => {
        if (row?.resource_id) {
          existingMap.set(String(row.resource_id), row?.ends_at ?? null);
        }
      });

      const payload = targetProductIds.map((pid) => {
        const targetEndsAt = computeEntitlementEndsAt(terms.durationDays, existingMap.get(pid) ?? null);

        return {
          user_id: payment.user_id,
          tenant_id: payment.tenant_id,
          resource_type: "product",
          resource_id: pid,
          is_active: true,
          starts_at: nowIso,
          ends_at: targetEndsAt,
          source: "click",
          value: entitlementValue,
        };
      });

      const { error: grantError } = await supabase
        .from("entitlements")
        .upsert(payload, {
          onConflict: "tenant_id,resource_type,resource_id",
        });

      if (grantError) {
        await supabase
          .from("payments")
          .update({
            granted_at: null,
            grant_error: String(grantError.message ?? grantError),
          })
          .eq("id", payment.id);

        return jsonResponse(500, {
          error: "Failed to grant entitlement",
          details: grantError,
        });
      }

      if (payment.coupon_id) {
        const redeemedAt = new Date().toISOString();
        const snapshot = {
          coupon_id: payment.coupon_id,
          coupon_code: payment.coupon_code ?? null,
          plan_id: payment.plan_id ?? null,
          product_id: payment.product_id ?? null,
          original_amount: payment.original_amount ?? null,
          discount_amount: payment.discount_amount ?? null,
          final_amount: payment.amount ?? null,
          currency: payment.currency ?? null,
        };
        await supabase.from("coupon_redemptions").upsert(
          {
            coupon_id: payment.coupon_id,
            payment_id: payment.id,
            context_id: payment.id,
            user_id: payment.user_id,
            tenant_id: payment.tenant_id,
            status: "applied",
            redeemed_at: redeemedAt,
            snapshot,
            metadata: {
              provider: "click",
              provider_transaction_id: usedStatusId,
            },
          },
          { onConflict: "coupon_id,user_id,context_id" },
        );
      }
    }
  }

  if (normalizeMoney(payment.credit_amount) > 0) {
    await supabase.rpc("consume_platform_credit", {
      p_payment_id: payment.id,
      p_metadata: {},
    });
  }

  await issueReferralReward(supabase, payment);
  return null;
};

// ---------------------------------------------------------------------------
// Click.uz webhook handler
// ---------------------------------------------------------------------------

// Parses the incoming Click.uz webhook body — Click sends JSON POST.
const parseClickWebhookBody = async (
  req: Request,
): Promise<Record<string, string> | null> => {
  const contentType = req.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      const json = await req.json();
      return json as Record<string, string>;
    }
    // Fallback: form-urlencoded
    const text = await req.text();
    const params: Record<string, string> = {};
    for (const pair of text.split("&")) {
      const [k, v] = pair.split("=");
      if (k) params[decodeURIComponent(k)] = decodeURIComponent(v ?? "");
    }
    return params;
  } catch {
    return null;
  }
};

const handleClickWebhook = async (
  req: Request,
  supabase: any,
): Promise<Response> => {
  const params = await parseClickWebhookBody(req);
  if (!params) {
    return jsonResponse(400, {
      error: -8,
      error_note: "Invalid request body",
    });
  }

  const secretKey = getClickSecretKey();
  const isValidSig = await verifyClickWebhookSignature(params, secretKey);
  if (!isValidSig) {
    return jsonResponse(401, { error: -1, error_note: "Sign check failed!" });
  }

  const action = String(params.action ?? "").trim();
  const clickTransId = String(params.click_trans_id ?? "").trim();
  const merchantTransId = String(params.merchant_trans_id ?? "").trim();
  const amountRaw = parseFloat(String(params.amount ?? "0"));
  const merchantPrepareId = String(params.merchant_prepare_id ?? "").trim();

  if (!merchantTransId) {
    return jsonResponse(400, {
      error: -8,
      error_note: "merchant_trans_id is required",
    });
  }

  // merchant_trans_id is our internal payment UUID
  const { payment, error: loadError } = await loadPaymentById(
    supabase,
    merchantTransId,
  );
  if (loadError) {
    return jsonResponse(500, {
      error: -9,
      error_note: "Internal lookup error",
    });
  }
  if (!payment) {
    return jsonResponse(200, {
      error: -6,
      error_note: "Transaction does not exist",
      click_trans_id: Number(clickTransId) || 0,
      merchant_trans_id: merchantTransId,
    });
  }

  const paymentAmount = normalizeMoney(payment.amount);
  const receivedAmount = Math.round(amountRaw);
  if (paymentAmount !== receivedAmount) {
    return jsonResponse(200, {
      error: -2,
      error_note: "Incorrect parameter amount",
      click_trans_id: Number(clickTransId) || 0,
      merchant_trans_id: merchantTransId,
    });
  }

  // ── PREPARE (action=0) ────────────────────────────────────────────────────
  if (action === "0") {
    if (isTerminalFailureStatus(payment.status)) {
      return jsonResponse(200, {
        error: -4,
        error_note: "Already cancelled",
        click_trans_id: Number(clickTransId) || 0,
        merchant_trans_id: merchantTransId,
        merchant_prepare_id: payment.id,
      });
    }

    // Store click_trans_id in provider_transaction_id + metadata
    await supabase
      .from("payments")
      .update({
        provider_transaction_id: clickTransId,
        status: payment.status === "created" ? "pending" : payment.status,
        metadata: {
          ...(payment.metadata ?? {}),
          click_trans_id: clickTransId,
          click_paydoc_id: String(params.click_paydoc_id ?? ""),
        },
        provider_payload: { webhook_prepare: params },
      })
      .eq("id", payment.id);

    await syncAcademyPaymentFromPlatformPayment(
      supabase,
      {
        ...payment,
        provider_transaction_id: clickTransId,
        status: payment.status === "created" ? "pending" : payment.status,
        metadata: {
          ...(payment.metadata ?? {}),
          click_trans_id: clickTransId,
          click_paydoc_id: String(params.click_paydoc_id ?? ""),
        },
      },
      "pending",
      { provider_stage: "prepared" },
    );

    return jsonResponse(200, {
      click_trans_id: Number(clickTransId) || 0,
      merchant_trans_id: merchantTransId,
      merchant_prepare_id: payment.id,
      error: 0,
      error_note: "Success",
    });
  }

  // ── COMPLETE (action=1) ───────────────────────────────────────────────────
  if (action === "1") {
    // merchant_prepare_id must match our payment UUID
    if (merchantPrepareId && merchantPrepareId !== payment.id) {
      return jsonResponse(200, {
        error: -6,
        error_note: "Transaction does not exist",
        click_trans_id: Number(clickTransId) || 0,
        merchant_trans_id: merchantTransId,
        merchant_confirm_id: payment.id,
      });
    }

    const clickError = Number(params.error ?? 0);
    if (clickError < 0) {
      // Payment was cancelled/failed by Click.uz
      await supabase
        .from("payments")
        .update({
          status: "canceled",
          provider_transaction_id: clickTransId,
          metadata: {
            ...(payment.metadata ?? {}),
            click_trans_id: clickTransId,
            click_error: clickError,
          },
          provider_payload: { webhook_complete: params },
        })
        .eq("id", payment.id);

      if (normalizeMoney(payment.credit_amount) > 0) {
        await supabase.rpc("release_platform_credit", {
          p_payment_id: payment.id,
          p_reason: "click_payment_cancelled",
        });
      }

      await syncAcademyPaymentFromPlatformPayment(
        supabase,
        {
          ...payment,
          provider_transaction_id: clickTransId,
          status: "canceled",
          metadata: {
            ...(payment.metadata ?? {}),
            click_trans_id: clickTransId,
            click_error: clickError,
          },
        },
        "canceled",
        {
          provider_stage: "complete",
          provider_error: clickError,
        },
      );

      return jsonResponse(200, {
        click_trans_id: Number(clickTransId) || 0,
        merchant_trans_id: merchantTransId,
        merchant_confirm_id: payment.id,
        error: 0,
        error_note: "Acknowledged",
      });
    }

    if (isSuccessStatus(payment.status) && payment.granted_at) {
      // Already processed — idempotent success
      return jsonResponse(200, {
        click_trans_id: Number(clickTransId) || 0,
        merchant_trans_id: merchantTransId,
        merchant_confirm_id: payment.id,
        error: 0,
        error_note: "Success",
      });
    }

    const { data: updatedPayment, error: updateError } = await supabase
      .from("payments")
      .update({
        status: "paid",
        provider_transaction_id: clickTransId,
        metadata: {
          ...(payment.metadata ?? {}),
          click_trans_id: clickTransId,
          click_paydoc_id: String(params.click_paydoc_id ?? ""),
        },
        provider_payload: { webhook_complete: params },
      })
      .eq("id", payment.id)
      .select(paymentGrantSelect)
      .maybeSingle();

    if (updateError || !updatedPayment?.id) {
      return jsonResponse(500, {
        error: -9,
        error_note: "Transaction update failed",
      });
    }

    const grantResponse = await grantPaidPaymentOnce(
      supabase,
      updatedPayment as PaymentGrantRow,
      clickTransId,
    );
    if (grantResponse) {
      console.error("click_webhook_grant_failed", {
        payment_id: payment.id,
      });
    }

    // Notify user on Telegram — fire and forget
    await syncAcademyPaymentFromPlatformPayment(
      supabase,
      updatedPayment as PaymentGrantRow,
      "paid",
      {
        provider_stage: "complete",
        platform_grant_error: grantResponse ? "Failed to apply academy tuition" : null,
      },
    );

    if (updatedPayment?.user_id) {
      const amt = updatedPayment.amount ?? 0;
      const currency = String(updatedPayment.currency ?? "UZS");
      fetch(`${getEnv("SUPABASE_URL")}/functions/v1/send-telegram`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${getEnv("SUPABASE_SERVICE_ROLE_KEY")}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: updatedPayment.user_id,
          notification_type: "payment_confirmed",
          text: `✅ <b>Payment confirmed!</b>\n\n${amt.toLocaleString()} ${currency} received.\nYour access has been activated.`,
        }),
      }).catch(() => {});
    }

    return jsonResponse(200, {
      click_trans_id: Number(clickTransId) || 0,
      merchant_trans_id: merchantTransId,
      merchant_confirm_id: payment.id,
      error: 0,
      error_note: "Success",
    });
  }

  return jsonResponse(400, { error: -3, error_note: "Action not found" });
};

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = getEnv("SUPABASE_URL");
    const supabaseServiceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    const url = new URL(req.url);

    // Webhook: unauthenticated POST to /click/webhook or POST without Bearer
    const isWebhookRoute =
      req.method === "POST" &&
      (url.pathname.endsWith("/webhook") || !getBearerToken(req));

    if (isWebhookRoute) {
      return await handleClickWebhook(req, supabase);
    }

    // All other routes require auth
    const token = getBearerToken(req);
    if (!token) {
      return jsonResponse(401, { error: "Unauthorized" });
    }

    const { data: authData, error: authError } = await supabase.auth
      .getUser(token);
    if (authError || !authData?.user) {
      return jsonResponse(401, { error: "Unauthorized" });
    }

    const authedUserId = authData.user.id;

    // ── POST /click/create-transaction ────────────────────────────────────
    if (
      req.method === "POST" &&
      url.pathname.endsWith("/create-transaction")
    ) {
      const body = (await req.json()) as CreateTransactionInput;

      if (!body.description || typeof body.description !== "string") {
        return jsonResponse(400, { error: "Description is required" });
      }

      // ── Academy tuition (student-initiated; contact-based auth) ───────────────
      // Students are academy *contacts*, not tenant members, so this branch
      // resolves access via academy_contacts instead of tenant_memberships.
      if (normalizePurchaseType(body.purchase_type) === "academy_tuition") {
        const meta = isPlainObject(body.metadata) ? body.metadata : {};
        const academyId = String((meta as any).academy_id ?? body.tenant_id ?? "").trim();
        const offerId = String((meta as any).offer_id ?? body.plan_id ?? "").trim();
        const requestedContactId = String((meta as any).contact_id ?? "").trim();
        if (!academyId || !offerId) {
          return jsonResponse(400, { error: "academy_id and offer_id are required" });
        }

        const { data: offer, error: offerErr } = await supabase
          .from("academy_offers")
          .select("id, academy_id, name, price_amount, currency, is_active, classroom_id")
          .eq("id", offerId)
          .eq("academy_id", academyId)
          .maybeSingle();
        if (offerErr) return jsonResponse(500, { error: "Failed to load offer", details: offerErr });
        if (!offer?.id) return jsonResponse(404, { error: "Offer not found" });
        if (!offer.is_active) return jsonResponse(400, { error: "Offer is inactive" });

        // Resolve the contact: explicit id, else the caller's linked contact.
        let contactQuery = supabase
          .from("academy_contacts")
          .select("id, user_id")
          .eq("academy_id", academyId);
        contactQuery = requestedContactId
          ? contactQuery.eq("id", requestedContactId)
          : contactQuery.eq("user_id", authedUserId);
        const { data: contact, error: contactErr } = await contactQuery.maybeSingle();
        if (contactErr) return jsonResponse(500, { error: "Failed to load contact", details: contactErr });
        if (!contact?.id) return jsonResponse(404, { error: "Contact not found" });

        // Authorization: payer is the contact's linked user, OR an academy finance operator.
        const isContactOwner = String(contact.user_id ?? "") === authedUserId;
        let hasAcademyFinanceAccess = false;
        if (!isContactOwner) {
          const { data: adminMembership } = await supabase
            .from("tenant_memberships")
            .select("role")
            .eq("tenant_id", academyId)
            .eq("user_id", authedUserId)
            .eq("status", "active")
            .maybeSingle();
          hasAcademyFinanceAccess = isAcademyFinanceRole(adminMembership?.role);

          if (!hasAcademyFinanceAccess) {
            const { data: academyTenant, error: academyTenantErr } = await supabase
              .from("tenants")
              .select("metadata")
              .eq("id", academyId)
              .maybeSingle();
            if (academyTenantErr) return jsonResponse(500, { error: "Failed to load academy tenant", details: academyTenantErr });

            const parentCenterId = String((academyTenant?.metadata as any)?.parent_center_id ?? "").trim();
            if (parentCenterId) {
              const { data: centerMembership } = await supabase
                .from("tenant_memberships")
                .select("role")
                .eq("tenant_id", parentCenterId)
                .eq("user_id", authedUserId)
                .eq("status", "active")
                .maybeSingle();
              hasAcademyFinanceAccess = isAcademyFinanceRole(centerMembership?.role);
            }
          }

          if (!hasAcademyFinanceAccess) {
            return jsonResponse(403, { error: "Forbidden" });
          }
        }
        const paymentSource = isContactOwner ? "student_portal" : "academy_office";

        const tuitionAmount = Math.floor(Number(offer.price_amount));
        const tuitionCurrency = String(offer.currency ?? "UZS").toUpperCase();
        if (!Number.isFinite(tuitionAmount) || tuitionAmount <= 0) {
          return jsonResponse(400, { error: "Offer price is not set" });
        }
        const tuitionGuard = assertClickAmountAllowed(tuitionAmount);
        if (tuitionGuard) return tuitionGuard;

        // Create the academy_payments row that apply_academy_payment will settle.
        const academyProviderTxn = `click-${crypto.randomUUID()}`;
        const { data: academyPayment, error: academyPaymentErr } = await supabase
          .from("academy_payments")
          .insert({
            academy_id: academyId,
            offer_id: offerId,
            contact_id: contact.id,
            provider: "click",
            provider_transaction_id: academyProviderTxn,
            amount: tuitionAmount,
            currency: tuitionCurrency,
            status: "pending",
            metadata: { source: paymentSource, initiated_by: authedUserId },
            created_by: authedUserId,
          })
          .select("id")
          .maybeSingle();
        if (academyPaymentErr || !academyPayment?.id) {
          return jsonResponse(500, { error: "Failed to create academy payment", details: academyPaymentErr });
        }

        const tuitionMetadata: Record<string, unknown> = {
          ...(meta as Record<string, unknown>),
          source: paymentSource,
          purchase_type: "academy_tuition",
          academy_id: academyId,
          academy_payment_id: academyPayment.id,
          offer_id: offerId,
          contact_id: contact.id,
          classroom_id: offer.classroom_id ?? null,
        };

        const { data: tuitionPaymentRow, error: tuitionInsertErr } = await supabase
          .from("payments")
          .insert({
            provider: "click",
            provider_transaction_id: "pending",
            amount: tuitionAmount,
            currency: tuitionCurrency,
            status: "pending",
            user_id: authedUserId,
            tenant_id: academyId,
            product_id: null,
            purchase_type: "academy_tuition",
            metadata: tuitionMetadata,
            provider_payload: { stage: "local_order_created" },
          })
          .select("id")
          .maybeSingle();
        if (tuitionInsertErr || !tuitionPaymentRow?.id) {
          return jsonResponse(500, { error: "Failed to record payment", details: tuitionInsertErr });
        }

        const tuitionUuid = String(tuitionPaymentRow.id);
        await supabase
          .from("payments")
          .update({ provider_transaction_id: tuitionUuid })
          .eq("id", tuitionUuid);
        await supabase
          .from("academy_payments")
          .update({ metadata: { source: paymentSource, initiated_by: authedUserId, platform_payment_id: tuitionUuid } })
          .eq("id", academyPayment.id);

        const tuitionUrl = buildClickPaymentUrl(
          getClickServiceId(),
          getClickMerchantId(),
          tuitionAmount,
          tuitionUuid,
          withPaymentReturnParams(
            normalizeRedirectUrl(body.redirect_url),
            tuitionUuid,
            "academy_tuition",
          ),
        );

        await supabase
          .from("payments")
          .update({
            metadata: { ...tuitionMetadata, click_payment_url: tuitionUrl },
            provider_payload: { stage: "click_url_built", payment_url: tuitionUrl },
          })
          .eq("id", tuitionUuid);

        return jsonResponse(200, {
          payment_url: tuitionUrl,
          transaction_id: tuitionUuid,
          amount: tuitionAmount,
          currency: tuitionCurrency,
          final_amount: tuitionAmount,
          academy_payment_id: academyPayment.id,
        });
      }

      const { data: memberships, error: membershipError } = await supabase
        .from("tenant_memberships")
        .select("tenant_id")
        .eq("user_id", authedUserId)
        .eq("status", "active")
        .order("created_at", { ascending: true });

      if (membershipError) {
        return jsonResponse(500, {
          error: "Failed to load memberships",
          details: membershipError,
        });
      }

      const tenantIds = new Set(
        (memberships ?? []).map((m: any) => m.tenant_id),
      );
      const defaultTenantId = (memberships ?? [])[0]?.tenant_id ?? null;
      const tenantId = body.tenant_id
        ? (tenantIds.has(body.tenant_id) ? body.tenant_id : null)
        : defaultTenantId;

      if (!tenantId) {
        return jsonResponse(400, {
          error: "No active tenant membership",
        });
      }

      const purchaseType = normalizePurchaseType(body.purchase_type);
      let plan: PlanRow | null = null;
      let experience: ExperiencePriceRow | null = null;
      let quantity = 1;
      let expiresInDays: number | null = null;
      let directAmount: number | null = null;
      let directCurrency = "UZS";

      if (purchaseType === "center_wallet_topup") {
        directAmount = normalizeMoney((body as any).amount);
        directCurrency = String((body as any).currency ?? "UZS").toUpperCase();
        if (directAmount <= 0) {
          return jsonResponse(400, { error: "amount must be positive" });
        }
        if (directCurrency !== "UZS") {
          return jsonResponse(400, {
            error: "Center wallet top-up currently supports UZS only",
          });
        }
        if (body.apply_credit || typeof body.credit_amount !== "undefined") {
          return jsonResponse(400, {
            error: "Platform credit cannot be used to top up a center wallet",
          });
        }
        if (body.referral_code || body.referral_attribution_id) {
          return jsonResponse(400, {
            error: "Referral discounts cannot be used to top up a center wallet",
          });
        }
      } else if (purchaseType === "token_pack") {
        const experienceId = String(body.experience_id ?? "");
        if (!experienceId) {
          return jsonResponse(400, { error: "experience_id is required" });
        }

        const qty = normalizeQuantity(body.quantity, 200);
        if (!qty) {
          return jsonResponse(400, {
            error: "quantity must be between 1 and 200",
          });
        }
        quantity = qty;

        const days = normalizeDays(
          body.expires_in_days ??
            (body as any).expires_in ??
            (body as any).days,
        );
        if (!days) {
          return jsonResponse(400, {
            error: "expires_in_days must be between 1 and 30",
          });
        }
        expiresInDays = days;

        const { data: expRow, error: expErr } = await supabase
          .from("experiences")
          .select("id, product_id, is_active, price_amount, price_currency")
          .eq("id", experienceId)
          .maybeSingle();
        if (expErr || !expRow) {
          return jsonResponse(400, { error: "Invalid experience_id" });
        }
        experience = expRow as ExperiencePriceRow;
        if (!experience.is_active) {
          return jsonResponse(400, {
            error: "Experience is not active",
          });
        }
        const unitAmount = Number(experience.price_amount);
        if (!Number.isFinite(unitAmount) || unitAmount <= 0) {
          return jsonResponse(400, {
            error: "Experience price is not set",
          });
        }
      } else if (purchaseType === "seat_pack") {
        const qty = normalizeQuantity(
          body.seat_count ?? body.quantity,
          200,
        );
        if (!qty) {
          return jsonResponse(400, {
            error: "seat_count must be between 1 and 200",
          });
        }
        quantity = qty;
        if (!body.plan_id) {
          return jsonResponse(400, { error: "plan_id is required" });
        }

        const { data: planRow, error: planError } = await supabase
          .from("plans")
          .select(
            "id, product_id, name, amount, currency, duration_days, metadata",
          )
          .eq("id", body.plan_id)
          .eq("is_active", true)
          .maybeSingle();

        if (planError || !planRow) {
          return jsonResponse(400, { error: "Invalid plan_id" });
        }
        plan = planRow as PlanRow;
      } else if (body.plan_id) {
        const { data: planRow, error: planError } = await supabase
          .from("plans")
          .select(
            "id, product_id, name, amount, currency, duration_days, metadata",
          )
          .eq("id", body.plan_id)
          .eq("is_active", true)
          .maybeSingle();

        if (planError || !planRow) {
          return jsonResponse(400, { error: "Invalid plan_id" });
        }
        plan = planRow as PlanRow;
      } else if (body.product_id) {
        const { data: planRow, error: planError } = await supabase
          .from("plans")
          .select(
            "id, product_id, name, amount, currency, duration_days, metadata",
          )
          .eq("product_id", body.product_id)
          .eq("is_active", true)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (planError || !planRow) {
          return jsonResponse(400, {
            error: "No active plan for product",
          });
        }
        plan = planRow as PlanRow;
      } else {
        return jsonResponse(400, {
          error: "plan_id or product_id is required",
        });
      }

      let originalAmount = 0;
      let currency = "UZS";
      const productId = plan?.product_id ?? experience?.product_id ?? null;
      const planId = plan?.id ?? null;

      if (purchaseType === "center_wallet_topup") {
        originalAmount = directAmount ?? 0;
        currency = directCurrency;
      } else if (purchaseType === "token_pack") {
        const unitAmount = Number(experience?.price_amount ?? NaN);
        originalAmount = unitAmount * quantity;
        currency = String(experience?.price_currency ?? "UZS");
      } else {
        originalAmount = Number(plan?.amount ?? NaN) * quantity;
        currency = String(plan?.currency ?? "UZS");
      }

      if (!Number.isFinite(originalAmount) || originalAmount <= 0) {
        return jsonResponse(400, { error: "Invalid plan amount" });
      }

      let amount = originalAmount;
      let discountAmount = 0;
      let couponId: string | null = null;
      let couponCode: string | null = null;

      const normalizedCouponCode = normalizeCouponCode(body.coupon_code);
      if (normalizedCouponCode) {
        if (
          purchaseType === "token_pack" || purchaseType === "seat_pack" ||
          purchaseType === "center_wallet_topup"
        ) {
          return jsonResponse(400, {
            error: "Coupons are not supported for this purchase type",
          });
        }
        const { data: couponRow, error: couponError } = await supabase
          .from("coupons")
          .select(
            "id, code, discount_type, value, currency, product_id, plan_id, is_active, status, starts_at, ends_at, max_redemptions, max_per_user, min_amount, first_purchase_only, stacking_policy, effects, constraints",
          )
          .eq("code", normalizedCouponCode)
          .maybeSingle();

        if (couponError) {
          return jsonResponse(500, {
            error: "Failed to load coupon",
            details: couponError,
          });
        }
        if (!couponRow) {
          return jsonResponse(400, { error: "Invalid coupon code" });
        }
        if (!plan) {
          return jsonResponse(400, {
            error: "Coupon requires a plan purchase",
          });
        }

        const coupon = couponRow as CouponRow;
        const validation = await validateCoupon(
          supabase,
          coupon,
          plan,
          authedUserId,
        );
        if (!validation.ok) {
          return jsonResponse(400, {
            error: validation.error,
            error_code: validation.error_code,
          });
        }

        amount = validation.pricing.final_amount;
        discountAmount = validation.pricing.discount_amount;
        couponId = coupon.id;
        couponCode = coupon.code;
      }

      const purchaseKind = purchaseKindForProgram(purchaseType);
      const referralCheckout = await resolveReferralCheckout(supabase, {
        userId: authedUserId,
        referralCode: body.referral_code ?? null,
        referralAttributionId: body.referral_attribution_id ?? null,
        purchaseKind,
        currency,
        originalAmount,
        metadata: body.metadata ?? null,
      });
      if (!referralCheckout.ok) return referralCheckout.response;

      const referralDiscountAmount = Math.min(
        amount,
        referralCheckout.referralDiscountAmount,
      );
      if (referralDiscountAmount > 0) {
        amount = Math.max(0, amount - referralDiscountAmount);
        discountAmount += referralDiscountAmount;
      }

      let creditAmount = 0;
      const availableCredit = await getCreditAvailable(
        supabase,
        authedUserId,
        currency,
      );
      if (
        body.apply_credit ||
        (body.credit_amount !== null &&
          typeof body.credit_amount !== "undefined")
      ) {
        const requestedCredit =
          body.credit_amount === null ||
            typeof body.credit_amount === "undefined"
            ? amount
            : normalizeMoney(body.credit_amount);
        creditAmount = Math.min(amount, availableCredit, requestedCredit);
        amount = Math.max(0, amount - creditAmount);
      }

      if (!Number.isFinite(amount) || amount < 0) {
        return jsonResponse(400, { error: "Invalid final amount" });
      }

      // ── Full credit path (amount = 0) ────────────────────────────────────
      if (amount === 0) {
        const providerId = `credit-${crypto.randomUUID()}`;
        const metadata: Record<string, unknown> = {
          ...(body.metadata ?? {}),
        };
        metadata.purchase_type = purchaseKind;
        metadata.referral_code = referralCheckout.referralCode ?? null;
        metadata.credit_applied = creditAmount;
        if (purchaseType === "token_pack") {
          metadata.purchase_type = "token_pack";
          metadata.experience_id = experience?.id ?? null;
          metadata.quantity = quantity;
          metadata.expires_in_days = expiresInDays ?? null;
          metadata.unit_price_amount = experience?.price_amount ?? null;
          metadata.unit_price_currency =
            experience?.price_currency ?? currency;
        } else if (purchaseType === "seat_pack") {
          metadata.purchase_type = "seat_pack";
          metadata.seat_count = quantity;
          metadata.seat_plan_id = plan?.id ?? null;
        } else if (purchaseType === "center_wallet_topup") {
          metadata.purchase_type = "center_wallet_topup";
          metadata.wallet_topup_amount = originalAmount;
          metadata.wallet_topup_currency = currency;
          metadata.center_tenant_id = tenantId;
        }

        const planSnapshot = plan ? buildPlanSnapshot(plan) : {};
        const entitlementTerms = plan ? buildEntitlementTerms(plan) : {};

        const { data: insertedPayment, error: insertError } = await supabase
          .from("payments")
          .insert({
            provider: "platform_credit",
            provider_transaction_id: providerId,
            amount: 0,
            original_amount: originalAmount,
            discount_amount: discountAmount,
            credit_amount: creditAmount,
            referral_discount_amount: referralDiscountAmount,
            referral_attribution_id:
              referralCheckout.referralAttributionId,
            purchase_type: purchaseKind,
            coupon_code: couponCode,
            coupon_id: couponId,
            currency,
            status: "paid",
            user_id: authedUserId,
            tenant_id: tenantId,
            product_id: productId,
            plan_id: planId,
            plan_snapshot: planSnapshot,
            entitlement_terms: entitlementTerms,
            metadata,
            provider_payload: {
              provider: "platform_credit",
              full_credit: true,
            },
          })
          .select(
            "id, provider_transaction_id, user_id, tenant_id, product_id, plan_id, status, granted_at, coupon_id, coupon_code, original_amount, discount_amount, amount, currency, credit_amount, referral_discount_amount, referral_attribution_id, purchase_type, plan_snapshot, entitlement_terms, metadata",
          )
          .maybeSingle();

        if (insertError || !insertedPayment?.id) {
          return jsonResponse(500, {
            error: "Failed to record payment",
            details: insertError,
          });
        }

        const reserve = await reserveCredit(supabase, {
          userId: authedUserId,
          tenantId,
          amount: creditAmount,
          currency,
          paymentId: insertedPayment.id,
          metadata: {
            provider: "platform_credit",
            purchase_type: purchaseKind,
          },
        });
        if (!reserve.ok) {
          await supabase
            .from("payments")
            .update({
              status: "failed",
              grant_error: "Credit reserve failed",
            })
            .eq("id", insertedPayment.id);
          return jsonResponse(400, {
            error: "Credit reserve failed",
            details: reserve.details,
          });
        }

        const grantResponse = await grantPaidPaymentOnce(
          supabase,
          insertedPayment as PaymentGrantRow,
          providerId,
        );
        if (grantResponse) return grantResponse;

        return jsonResponse(200, {
          payment_url: null,
          transaction_id: providerId,
          status: "paid",
          amount: 0,
          currency,
          original_amount: originalAmount,
          discount_amount: discountAmount,
          credit_amount: creditAmount,
          referral_discount_amount: referralDiscountAmount,
          final_amount: 0,
          coupon_code: couponCode,
          referral_code: referralCheckout.referralCode,
          plan_id: planId,
          product_id: productId,
        });
      }

      // ── Click.uz payment path ─────────────────────────────────────────────
      const amountGuard = assertClickAmountAllowed(amount);
      if (amountGuard) return amountGuard;

      const serviceId = getClickServiceId();
      const merchantId = getClickMerchantId();
      const redirectUrl = normalizeRedirectUrl(body.redirect_url);

      const metadata: Record<string, unknown> = {
        ...(body.metadata ?? {}),
      };
      metadata.purchase_type = purchaseKind;
      metadata.referral_code = referralCheckout.referralCode ?? null;
      metadata.credit_applied = creditAmount;

      if (purchaseType === "token_pack") {
        metadata.purchase_type = "token_pack";
        metadata.experience_id = experience?.id ?? null;
        metadata.quantity = quantity;
        metadata.expires_in_days = expiresInDays ?? null;
        metadata.unit_price_amount = experience?.price_amount ?? null;
        metadata.unit_price_currency =
          experience?.price_currency ?? currency;
      } else if (purchaseType === "seat_pack") {
        metadata.purchase_type = "seat_pack";
        metadata.seat_count = quantity;
        metadata.seat_plan_id = plan?.id ?? null;
      } else if (purchaseType === "center_wallet_topup") {
        metadata.purchase_type = "center_wallet_topup";
        metadata.wallet_topup_amount = originalAmount;
        metadata.wallet_topup_currency = currency;
        metadata.center_tenant_id = tenantId;
      }

      const planSnapshot = plan ? buildPlanSnapshot(plan) : {};
      const entitlementTerms = plan ? buildEntitlementTerms(plan) : {};

      // Insert payment first — its UUID becomes merchant_trans_id for Click.
      const { data: insertedPayment, error: insertError } = await supabase
        .from("payments")
        .insert({
          provider: "click",
          provider_transaction_id: "pending",
          amount,
          original_amount: originalAmount,
          discount_amount: discountAmount,
          credit_amount: creditAmount,
          referral_discount_amount: referralDiscountAmount,
          referral_attribution_id: referralCheckout.referralAttributionId,
          purchase_type: purchaseKind,
          coupon_code: couponCode,
          coupon_id: couponId,
          currency,
          status: "pending",
          user_id: authedUserId,
          tenant_id: tenantId,
          product_id: productId,
          plan_id: planId,
          plan_snapshot: planSnapshot,
          entitlement_terms: entitlementTerms,
          metadata,
          provider_payload: { stage: "local_order_created" },
        })
        .select("id")
        .maybeSingle();

      if (insertError || !insertedPayment?.id) {
        return jsonResponse(500, {
          error: "Failed to record payment",
          details: insertError,
        });
      }

      const paymentUuid = insertedPayment.id as string;

      // Update provider_transaction_id to payment UUID (merchant_trans_id we'll send to Click)
      await supabase
        .from("payments")
        .update({ provider_transaction_id: paymentUuid })
        .eq("id", paymentUuid);

      if (creditAmount > 0) {
        const reserve = await reserveCredit(supabase, {
          userId: authedUserId,
          tenantId,
          amount: creditAmount,
          currency,
          paymentId: paymentUuid,
          metadata: {
            provider: "click",
            purchase_type: purchaseKind,
          },
        });
        if (!reserve.ok) {
          await supabase
            .from("payments")
            .update({ grant_error: "Credit reserve failed" })
            .eq("id", paymentUuid);
          return jsonResponse(400, {
            error: "Credit reserve failed",
            details: reserve.details,
          });
        }
      }

      const paymentUrl = buildClickPaymentUrl(
        serviceId,
        merchantId,
        amount,
        paymentUuid,
        withPaymentReturnParams(redirectUrl, paymentUuid, purchaseKind),
      );

      await supabase
        .from("payments")
        .update({
          metadata: {
            ...metadata,
            click_payment_url: paymentUrl,
          },
          provider_payload: { stage: "click_url_built", payment_url: paymentUrl },
        })
        .eq("id", paymentUuid);

      return jsonResponse(200, {
        payment_url: paymentUrl,
        card_widget: buildCardWidgetConfig(
          serviceId,
          merchantId,
          amount,
          paymentUuid,
        ),
        transaction_id: paymentUuid,
        amount,
        currency,
        original_amount: originalAmount,
        discount_amount: discountAmount,
        credit_amount: creditAmount,
        referral_discount_amount: referralDiscountAmount,
        final_amount: amount,
        coupon_code: couponCode,
        referral_code: referralCheckout.referralCode,
        plan_id: planId,
        product_id: productId,
      });
    }

    // ── GET /click/status ─────────────────────────────────────────────────
    if (req.method === "GET" && url.pathname.endsWith("/status")) {
      const requestedTransactionId = url.searchParams.get("transaction_id");
      if (!requestedTransactionId) {
        return jsonResponse(400, {
          error: "transaction_id is required",
        });
      }

      const { payment: paymentRow, error: paymentError } =
        await loadPaymentByReference(supabase, requestedTransactionId);

      if (paymentError) {
        return jsonResponse(500, {
          error: "Failed to load payment",
          details: paymentError,
        });
      }

      if (!paymentRow) {
        return jsonResponse(404, { error: "Payment not found" });
      }

      const payment = paymentRow as PaymentGrantRow;

      // Authorization: payer OR authorized operator OR platform admin.
      if (payment.user_id !== authedUserId) {
        let allowed = false;

        const { data: userRow } = await supabase
          .from("users")
          .select("role")
          .eq("id", authedUserId)
          .maybeSingle();
        if (userRow?.role === "admin") allowed = true;

        if (!allowed && isAcademyTuitionPayment(payment)) {
          const meta = payment.metadata ?? {};
          const academyId = String(
            payment.tenant_id ?? (meta as any)?.academy_id ?? "",
          ).trim();
          const financeAccess = await userHasAcademyFinanceAccess(
            supabase,
            academyId,
            authedUserId,
          );
          if (financeAccess.error) {
            return jsonResponse(500, {
              error: "Failed to verify academy finance access",
              details: financeAccess.error,
              stage: financeAccess.stage,
            });
          }
          allowed = financeAccess.allowed;
        }

        if (!allowed && !isAcademyTuitionPayment(payment) && payment.tenant_id) {
          const { data: membership } = await supabase
            .from("tenant_memberships")
            .select("id")
            .eq("tenant_id", payment.tenant_id)
            .eq("user_id", authedUserId)
            .eq("status", "active")
            .maybeSingle();
          if (membership) allowed = true;
        }

        if (!allowed) {
          return jsonResponse(403, { error: "Forbidden" });
        }
      }

      let normalized = normalizePaymentStatus(payment.status);
      let usedStatusId = requestedTransactionId;
      let apiStatus = "db";

      // For non-credit providers, optionally verify against Click.uz API
      if (
        String(payment.provider ?? "click") !== "platform_credit" &&
        !isSuccessStatus(normalized) && !isTerminalFailureStatus(normalized)
      ) {
        const meta = payment.metadata ?? {};
        const clickTransId = String(
          (meta as any)?.click_trans_id ?? payment.provider_transaction_id ?? "",
        ).trim();

        if (clickTransId && !looksLikeUuid(clickTransId)) {
          const checked = await fetchClickStatusFromApi(clickTransId);
          if (checked.ok) {
            normalized = checked.status;
            usedStatusId = clickTransId;
            apiStatus = "click_api";
          }
        }
      }

      await supabase
        .from("payments")
        .update({
          status: normalized,
          metadata: {
            ...(payment.metadata ?? {}),
            click_status_query_id: usedStatusId,
          },
          provider_payload: {
            api_status: apiStatus,
            status_query_id: usedStatusId,
          },
        })
        .eq("id", payment.id);

      let statusGrantError: string | null = null;

      if (
        isSuccessStatus(normalized) && payment.tenant_id && payment.user_id
      ) {
        const nowIso = new Date().toISOString();
        const { data: claim } = await supabase
          .from("payments")
          .update({ granted_at: nowIso, grant_error: null })
          .eq("id", payment.id)
          .is("granted_at", null)
          .select("id")
          .maybeSingle();

        if (claim) {
          const freshPayment = { ...payment, status: normalized };
          const grantResponse = await grantPaidPaymentOnce(
            supabase,
            freshPayment,
            usedStatusId,
          );
          if (grantResponse) {
            console.error("click_status_grant_failed", {
              payment_id: payment.id,
            });
            statusGrantError = "Failed to apply academy tuition";
          }
        }

        if (normalizeMoney(payment.credit_amount) > 0) {
          await supabase.rpc("consume_platform_credit", {
            p_payment_id: payment.id,
            p_metadata: {},
          });
        }

        await issueReferralReward(supabase, payment);
      } else if (isTerminalFailureStatus(normalized)) {
        await supabase.rpc("release_platform_credit", {
          p_payment_id: payment.id,
          p_reason: normalized,
        });
      }

      await syncAcademyPaymentFromPlatformPayment(
        supabase,
        {
          ...payment,
          status: normalized,
          metadata: {
            ...(payment.metadata ?? {}),
            click_status_query_id: usedStatusId,
          },
        },
        normalized,
        {
          provider_stage: "status",
          platform_grant_error: statusGrantError,
        },
      );

      return jsonResponse(200, {
        status: normalized,
        api_status: apiStatus,
        status_query_id: usedStatusId,
        credit_amount: payment.credit_amount ?? 0,
        referral_discount_amount: payment.referral_discount_amount ?? 0,
        final_amount: payment.amount ?? 0,
      });
    }

    return jsonResponse(404, { error: "Not found" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return jsonResponse(500, { error: message });
  }
});
