import { fulfillPayment } from "./fulfillment.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHash } from "node:crypto";
import {
  buildEntitlementTerms,
  buildPlanSnapshot,
} from "../_shared/payment-terms.ts";
import {
  computeConfiguredAmount,
  computeDiscount,
  computeDiscountFromEffects,
  normalizeMoney,
} from "../_shared/pricing.ts";
import {
  buildClickWebhookSignaturePayload,
  type ClickWebhookEnvelope,
  constantTimeEqual,
  validateClickWebhookEnvelope,
} from "./webhook-security.ts";
import {
  canPurchaseForInstitution,
  inspectClickConfiguration,
  isInstitutionServiceProduct,
  isTrustedClickPaymentUrl,
  normalizeCheckoutIdempotencyKey,
  normalizeSchoodReturnUrl,
  sanitizeClickCallbackPayload,
} from "./payment-safety.ts";
import {
  classifyClickOpsAlert,
  type ClickOpsAlertSeverity,
  notifyClickOperators,
} from "./ops-alerts.ts";

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
  idempotency_key?: string | null;
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
  const role = String(raw ?? "").trim().toLowerCase().replace(/-/g, "_")
    .replace(/\s+/g, "_");
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

const normalizeRedirectUrl = (raw: unknown): string | null =>
  normalizeSchoodReturnUrl(
    raw,
    (Deno.env.get("ENVIRONMENT") ?? Deno.env.get("DENO_ENV") ?? "") ===
      "development",
  );

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

// ---------------------------------------------------------------------------
// Cryptography
// ---------------------------------------------------------------------------

const md5Hex = async (message: string): Promise<string> =>
  createHash("md5").update(message, "utf8").digest("hex");

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

const clickConfiguration = () =>
  inspectClickConfiguration((key) => Deno.env.get(key));

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
} | null => {
  const merchantUserId = getClickMerchantUserId();
  if (!merchantUserId || !clickConfiguration().cardPaymentReady) return null;
  return {
    service_id: serviceId,
    merchant_id: merchantId,
    merchant_user_id: merchantUserId,
    amount: amount.toFixed(2),
    transaction_param: merchantTransId,
  };
};

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
  const paymentUrl = `${CLICK_BASE_URL}?${params.toString()}`;
  if (!isTrustedClickPaymentUrl(paymentUrl)) {
    throw new Error("CLICK payment URL failed trusted-origin validation");
  }
  return paymentUrl;
};

const assertClickAmountAllowed = (amount: number): Response | null => {
  if (amount < CLICK_MIN_AMOUNT_UZS) {
    return jsonResponse(400, {
      error:
        `Click.uz minimum amount is ${CLICK_MIN_AMOUNT_UZS.toLocaleString()} UZS after discounts and credits`,
    });
  }
  if (amount > CLICK_MAX_AMOUNT_UZS) {
    return jsonResponse(400, {
      error:
        `Click.uz maximum amount is ${CLICK_MAX_AMOUNT_UZS.toLocaleString()} UZS per transaction`,
    });
  }
  return null;
};

// Verifies the MD5 signature sent by Click.uz on webhook calls.
// action=0 (prepare): MD5(click_trans_id + service_id + secret_key + merchant_trans_id + amount + action + sign_time)
// action=1 (complete): MD5(click_trans_id + service_id + secret_key + merchant_trans_id + merchant_prepare_id + amount + action + sign_time)
const verifyClickWebhookSignature = async (
  envelope: ClickWebhookEnvelope,
  secretKey: string,
): Promise<boolean> => {
  const expected = await md5Hex(
    buildClickWebhookSignaturePayload(envelope, secretKey),
  );
  return constantTimeEqual(expected, envelope.signString);
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
    const url = `${CLICK_MERCHANT_API_BASE}/payment/status/${serviceId}/${
      encodeURIComponent(clickTransId)
    }`;
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
    "audience",
    "service",
    "source",
    "target",
    "channel",
    "landing_path",
    "landing_search",
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
    "utm_term",
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
  grant_completed_at?: string | null;
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


const syncAcademyPaymentFromPlatformPayment = async (
  sb: any,
  payment: PaymentGrantRow,
  status: string,
  metadataPatch: Record<string, unknown> = {},
): Promise<void> => {
  if (!isAcademyTuitionPayment(payment)) return;
  // Paid tuition and its grants are committed together by fulfill_paid_payment.
  // A separate status write could make apply_academy_payment skip missing grants.
  if (isSuccessStatus(status)) return;

  const platformMeta = payment.metadata ?? {};
  const academyPaymentId = String(
    (platformMeta as any)?.academy_payment_id ?? "",
  ).trim();
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
    (platformMeta as any)?.click_trans_id ?? payment.provider_transaction_id ??
      "",
  ).trim();
  const clickPaydocId = String((platformMeta as any)?.click_paydoc_id ?? "")
    .trim();
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
      provider_transaction_id: clickTransId ||
        payment.provider_transaction_id || academyPaymentId,
      metadata: {
        ...currentMetadata,
        platform_payment_id: payment.id,
        platform_payment_status: normalizedStatus || status,
        academy_payment_status: academyStatus,
        platform_provider_transaction_id: payment.provider_transaction_id ??
          null,
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

const paymentGrantSelect =
  "id, provider, provider_transaction_id, user_id, tenant_id, product_id, plan_id, status, granted_at, grant_completed_at, coupon_id, coupon_code, original_amount, discount_amount, amount, currency, credit_amount, referral_discount_amount, referral_attribution_id, purchase_type, plan_snapshot, entitlement_terms, metadata";

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
    sb.from("payments").select(paymentGrantSelect).eq(
      "provider_transaction_id",
      value,
    ).eq("provider", "click").maybeSingle(),
    sb.from("payments").select(paymentGrantSelect).eq("id", value)
      .maybeSingle(),
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

const grantPaidPaymentOnce = async (
  supabase: any,
  payment: PaymentGrantRow,
  _usedStatusId: string,
): Promise<Response | null> => {
  const result = await fulfillPayment(supabase, payment.id);
  if (result.ok) return null;
  return jsonResponse(202, {
    status: payment.status,
    transaction_id: payment.id,
    grant_completed: false,
    fulfillment_state: result.state,
    message: "Payment received; access activation is pending. Do not pay again.",
  });
};

// ---------------------------------------------------------------------------
// Click.uz webhook handler
// ---------------------------------------------------------------------------

// Parses the incoming Click.uz webhook body — Click sends JSON POST.
const parseClickWebhookBody = async (
  req: Request,
): Promise<Record<string, unknown> | null> => {
  const contentType = req.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      const json = await req.json();
      if (!json || typeof json !== "object" || Array.isArray(json)) return null;
      return json as Record<string, unknown>;
    }
    // Fallback: form-urlencoded
    const text = await req.text();
    const params: Record<string, unknown> = {};
    for (const [key, value] of new URLSearchParams(text)) params[key] = value;
    return params;
  } catch {
    return null;
  }
};

const scheduleBackground = (work: PromiseLike<unknown>): void => {
  const promise = Promise.resolve(work).catch((error) => {
    console.error("click_background_task_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  });
  const edgeRuntime = (globalThis as any).EdgeRuntime;
  if (edgeRuntime?.waitUntil) edgeRuntime.waitUntil(promise);
};

const scheduleClickOpsAlert = (
  supabase: any,
  event: string,
  severity: ClickOpsAlertSeverity,
  detail: Record<string, unknown>,
): void => {
  scheduleBackground(
    notifyClickOperators({
      supabase,
      publicBotToken: getEnv("TELEGRAM_PUBLIC_BOT_TOKEN"),
      event,
      severity,
      detail,
    }).then((result) => {
      console.info("click_ops_alert", { event, severity, ...result });
    }),
  );
};

const recordClickCallbackEvent = (
  supabase: any,
  event: {
    correlationId: string;
    params: Record<string, unknown>;
    payment?: PaymentGrantRow | null;
    httpStatus: number;
    body: Record<string, unknown>;
    startedAt: number;
  },
): void => {
  const safe = sanitizeClickCallbackPayload(event.params);
  const durationMs = Math.max(
    0,
    Math.round(performance.now() - event.startedAt),
  );
  const row = {
    correlation_id: event.correlationId,
    action: String(safe.action ?? "unknown"),
    click_transaction_id: String(safe.click_trans_id ?? "") || null,
    payment_id: event.payment?.id ?? null,
    service_id: String(safe.service_id ?? "") || null,
    tenant_id: event.payment?.tenant_id ?? null,
    payment_status: event.payment?.status ?? null,
    outcome: Number(event.body.error ?? -9) === 0 ? "accepted" : "rejected",
    protocol_error: Number(event.body.error ?? -9),
    http_status: event.httpStatus,
    duration_ms: durationMs,
  };
  console.info("click_callback", row);
  scheduleBackground(supabase.from("click_callback_events").insert(row));
};

export const handleClickWebhook = async (
  req: Request,
  supabase: any,
): Promise<Response> => {
  const startedAt = performance.now();
  const requestId = String(req.headers.get("x-request-id") ?? "").trim();
  const correlationId = requestId && requestId.length <= 128
    ? requestId
    : crypto.randomUUID();
  const params = await parseClickWebhookBody(req);
  let auditPayment: PaymentGrantRow | null = null;
  let signatureVerified = false;
  const respond = (
    status: number,
    body: Record<string, unknown>,
  ): Response => {
    recordClickCallbackEvent(supabase, {
      correlationId,
      params: params ?? {},
      payment: auditPayment,
      httpStatus: status,
      body,
      startedAt,
    });
    const protocolError = Number(body.error ?? -9);
    const alert = classifyClickOpsAlert({
      httpStatus: status,
      protocolError,
      signatureVerified,
    });
    if (alert) {
      scheduleClickOpsAlert(supabase, alert.event, alert.severity, {
        correlation_id: correlationId,
        action: String(params?.action ?? "unknown"),
        payment_id: auditPayment?.id ?? null,
        protocol_error: protocolError,
        http_status: status,
      });
    }
    return jsonResponse(status, body);
  };
  if (!params) {
    return respond(400, {
      error: -8,
      error_note: "Invalid request body",
    });
  }

  let secretKey: string;
  let serviceId: string;
  let merchantId: string;
  try {
    const readiness = clickConfiguration();
    if (!readiness.hostedPaymentReady) {
      throw new Error("CLICK configuration incomplete");
    }
    secretKey = getClickSecretKey();
    serviceId = getClickServiceId();
    merchantId = getClickMerchantId();
  } catch (error) {
    console.error("click_webhook_configuration_missing", {
      configured: false,
    });
    return respond(503, {
      error: -9,
      error_note: "Payment provider is not configured",
    });
  }

  const validation = validateClickWebhookEnvelope(params, serviceId);
  if (!validation.ok) {
    return respond(400, {
      error: validation.error,
      error_note: validation.errorNote,
    });
  }
  const envelope = validation.value;
  const safeCallbackPayload = sanitizeClickCallbackPayload(params);
  const isValidSig = await verifyClickWebhookSignature(envelope, secretKey);
  if (!isValidSig) {
    return respond(401, { error: -1, error_note: "Sign check failed!" });
  }
  signatureVerified = true;

  const { action, clickTransId, merchantTransId, merchantPrepareId } = envelope;

  // merchant_trans_id is our internal payment UUID
  const { payment, error: loadError } = await loadPaymentById(
    supabase,
    merchantTransId,
  );
  if (loadError) {
    return respond(500, {
      error: -9,
      error_note: "Internal lookup error",
    });
  }
  if (!payment) {
    return respond(200, {
      error: -6,
      error_note: "Transaction does not exist",
      click_trans_id: Number(clickTransId) || 0,
      merchant_trans_id: merchantTransId,
    });
  }
  auditPayment = payment;

  const paymentMetadata = payment.metadata ?? {};
  const storedServiceId = String(
    (paymentMetadata as any).click_service_id ?? "",
  ).trim();
  const storedMerchantId = String(
    (paymentMetadata as any).click_merchant_id ?? "",
  ).trim();
  if (
    String(payment.provider ?? "").toLowerCase() !== "click" ||
    (storedServiceId && storedServiceId !== serviceId) ||
    (storedMerchantId && storedMerchantId !== merchantId)
  ) {
    return respond(200, {
      error: -6,
      error_note: "Transaction does not exist",
      click_trans_id: Number(clickTransId),
      merchant_trans_id: merchantTransId,
    });
  }

  const paymentAmount = normalizeMoney(payment.amount);
  const receivedAmount = normalizeMoney(envelope.amount);
  if (paymentAmount !== receivedAmount) {
    return respond(200, {
      error: -2,
      error_note: "Incorrect parameter amount",
      click_trans_id: Number(clickTransId) || 0,
      merchant_trans_id: merchantTransId,
    });
  }

  // ── PREPARE (action=0) ────────────────────────────────────────────────────
  if (action === "0") {
    if (isSuccessStatus(payment.status)) {
      return respond(200, {
        error: -4,
        error_note: "Already paid",
        click_trans_id: Number(clickTransId),
        merchant_trans_id: merchantTransId,
        merchant_prepare_id: payment.id,
      });
    }
    if (isTerminalFailureStatus(payment.status)) {
      return respond(200, {
        error: -9,
        error_note: "Transaction cancelled",
        click_trans_id: Number(clickTransId) || 0,
        merchant_trans_id: merchantTransId,
        merchant_prepare_id: payment.id,
      });
    }

    const preparedClickTransId = String(
      (paymentMetadata as any).click_trans_id ?? "",
    ).trim();
    if (preparedClickTransId && preparedClickTransId !== clickTransId) {
      return respond(200, {
        error: -6,
        error_note: "Transaction does not exist",
        click_trans_id: Number(clickTransId),
        merchant_trans_id: merchantTransId,
      });
    }

    // Store click_trans_id in provider_transaction_id + metadata
    const { data: preparedPayment, error: prepareUpdateError } = await supabase
      .from("payments")
      .update({
        provider_transaction_id: clickTransId,
        status: payment.status === "created" ? "pending" : payment.status,
        metadata: {
          ...(payment.metadata ?? {}),
          click_trans_id: clickTransId,
          click_paydoc_id: String(params.click_paydoc_id ?? ""),
        },
        provider_payload: { webhook_prepare: safeCallbackPayload },
      })
      .eq("id", payment.id)
      .in("provider_transaction_id", [payment.id, "pending", clickTransId])
      .select("id")
      .maybeSingle();
    if (prepareUpdateError) {
      return respond(500, {
        error: -9,
        error_note: "Transaction update failed",
      });
    }
    if (!preparedPayment?.id) {
      return respond(200, {
        error: -6,
        error_note: "Transaction does not exist",
        click_trans_id: Number(clickTransId),
        merchant_trans_id: merchantTransId,
      });
    }

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

    return respond(200, {
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
    if (merchantPrepareId !== payment.id) {
      return respond(200, {
        error: -6,
        error_note: "Transaction does not exist",
        click_trans_id: Number(clickTransId) || 0,
        merchant_trans_id: merchantTransId,
        merchant_confirm_id: payment.id,
      });
    }

    const preparedClickTransId = String(
      (paymentMetadata as any).click_trans_id ?? "",
    ).trim();
    if (!preparedClickTransId || preparedClickTransId !== clickTransId) {
      return respond(200, {
        error: -6,
        error_note: "Transaction does not exist",
        click_trans_id: Number(clickTransId),
        merchant_trans_id: merchantTransId,
        merchant_confirm_id: payment.id,
      });
    }

    const clickError = envelope.error;
    if (isSuccessStatus(payment.status) && clickError < 0) {
      return respond(200, {
        error: -4,
        error_note: "Already paid",
        click_trans_id: Number(clickTransId),
        merchant_trans_id: merchantTransId,
        merchant_confirm_id: payment.id,
      });
    }
    if (isTerminalFailureStatus(payment.status)) {
      return respond(200, {
        error: clickError < 0 ? 0 : -9,
        error_note: clickError < 0 ? "Acknowledged" : "Transaction cancelled",
        click_trans_id: Number(clickTransId),
        merchant_trans_id: merchantTransId,
        merchant_confirm_id: payment.id,
      });
    }
    if (clickError < 0) {
      // Payment was cancelled/failed by Click.uz
      const { error: cancelUpdateError } = await supabase
        .from("payments")
        .update({
          status: "canceled",
          provider_transaction_id: clickTransId,
          metadata: {
            ...(payment.metadata ?? {}),
            click_trans_id: clickTransId,
            click_error: clickError,
          },
          provider_payload: { webhook_complete: safeCallbackPayload },
        })
        .eq("id", payment.id);
      if (cancelUpdateError) {
        return respond(500, {
          error: -9,
          error_note: "Transaction update failed",
        });
      }

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
      auditPayment = {
        ...payment,
        provider_transaction_id: clickTransId,
        status: "canceled",
      };

      return respond(200, {
        click_trans_id: Number(clickTransId) || 0,
        merchant_trans_id: merchantTransId,
        merchant_confirm_id: payment.id,
        error: 0,
        error_note: "Acknowledged",
      });
    }

    if (isSuccessStatus(payment.status) && payment.grant_completed_at) {
      // Already processed — idempotent success
      return respond(200, {
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
        provider_payload: { webhook_complete: safeCallbackPayload },
      })
      .eq("id", payment.id)
      .select(paymentGrantSelect)
      .maybeSingle();

    if (updateError || !updatedPayment?.id) {
      return respond(500, {
        error: -9,
        error_note: "Transaction update failed",
      });
    }
    auditPayment = updatedPayment as PaymentGrantRow;

    const grantResponse = await grantPaidPaymentOnce(
      supabase,
      updatedPayment as PaymentGrantRow,
      clickTransId,
    );
    if (grantResponse) {
      console.error("click_webhook_grant_failed", {
        payment_id: payment.id,
      });
      scheduleClickOpsAlert(supabase, "payment_grant_failed", "critical", {
        correlation_id: correlationId,
        action,
        payment_id: payment.id,
        protocol_error: 0,
        http_status: 200,
      });
    }

    // Notify user on Telegram — fire and forget
    await syncAcademyPaymentFromPlatformPayment(
      supabase,
      updatedPayment as PaymentGrantRow,
      "paid",
      {
        provider_stage: "complete",
        platform_grant_error: grantResponse
          ? "Failed to apply academy tuition"
          : null,
      },
    );

    if (!grantResponse && updatedPayment?.user_id) {
      const amt = updatedPayment.amount ?? 0;
      const currency = String(updatedPayment.currency ?? "UZS");
      fetch(`${getEnv("SUPABASE_URL")}/functions/v1/send-telegram`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${getEnv("SUPABASE_SERVICE_ROLE_KEY")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_id: updatedPayment.user_id,
          notification_type: "payment_confirmed",
          text:
            `✅ <b>Payment confirmed!</b>\n\n${amt.toLocaleString()} ${currency} received.\nYour access has been activated.`,
        }),
      }).catch(() => {});
    }

    return respond(200, {
      click_trans_id: Number(clickTransId) || 0,
      merchant_trans_id: merchantTransId,
      merchant_confirm_id: payment.id,
      error: 0,
      error_note: "Success",
    });
  }

  return respond(400, { error: -3, error_note: "Action not found" });
};

// Only customer purchase choices identify a request. Prices, catalogue snapshots,
// credit balances, descriptions and referral tracking context do not: retries
// must keep the original financial terms when those mutable values change.
export const checkoutIntent = (body: CreateTransactionInput): Record<string, unknown> => {
  const kind = normalizePurchaseType(body.purchase_type) || "plan";
  const meta = isPlainObject(body.metadata) ? body.metadata : {};
  const id = (raw: unknown) => String(raw ?? "").trim().toLowerCase() || null;
  return {
    purchase_type: kind, tenant_id: id(body.tenant_id), plan_id: id(body.plan_id), product_id: id(body.product_id),
    experience_id: kind === "token_pack" ? id(body.experience_id) : null,
    quantity: kind === "token_pack" ? body.quantity ?? null : kind === "seat_pack" ? body.seat_count ?? body.quantity ?? null : null,
    expires_in_days: kind === "token_pack" ? body.expires_in_days ?? (body as any).expires_in ?? (body as any).days ?? null : null,
    amount: kind === "center_wallet_topup" ? body.amount ?? null : null,
    currency: kind === "center_wallet_topup" ? String(body.currency ?? "UZS").toUpperCase() : null,
    coupon_code: normalizeCouponCode(body.coupon_code) || null,
    apply_credit: body.apply_credit === true, credit_amount: body.credit_amount ?? null,
    referral_code: normalizeReferralCode(body.referral_code) || null, referral_attribution_id: id(body.referral_attribution_id),
    requested_tier: meta.requested_tier ?? meta.center_tier ?? null, billing_period: meta.billing_period ?? null,
    tier_change_request_id: id(meta.tier_change_request_id),
    academy_id: kind === "academy_tuition" ? id(meta.academy_id ?? body.tenant_id) : null,
    offer_id: kind === "academy_tuition" ? id(meta.offer_id ?? body.plan_id) : null,
    contact_id: kind === "academy_tuition" ? id(meta.contact_id) : null,
  };
};

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export const handleClickRequest = async (req: Request, clientOverride?: any): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = getEnv("SUPABASE_URL");
    const supabaseServiceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

    const supabase = clientOverride ?? createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const url = new URL(req.url);

    const isWebhookPath = url.pathname.endsWith("/webhook");
    if (isWebhookPath && req.method !== "POST") {
      return jsonResponse(405, {
        error: -8,
        error_note: "CLICK webhook requires POST",
      });
    }

    // The only unauthenticated route is the intentional CLICK callback path.
    const isWebhookRoute = req.method === "POST" && isWebhookPath;

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

    // Safe, authenticated configuration readiness. Values and digests are never returned.
    if (req.method === "GET" && url.pathname.endsWith("/readiness")) {
      const readiness = clickConfiguration();
      return jsonResponse(200, {
        configured: readiness.configured,
        service_id: readiness.serviceId,
        service_id_matches_production: readiness.serviceIdMatchesProduction,
        hosted_payment_ready: readiness.hostedPaymentReady,
        card_payment_ready: readiness.cardPaymentReady,
        missing_configuration: readiness.missing,
      });
    }

    // ── POST /click/create-transaction ────────────────────────────────────
    if (
      req.method === "POST" &&
      url.pathname.endsWith("/create-transaction")
    ) {
      let rawBody: unknown;
      try { rawBody = await req.json(); } catch {
        return jsonResponse(400, { error: "A valid checkout request is required" });
      }
      if (!isPlainObject(rawBody) || (rawBody.metadata != null && !isPlainObject(rawBody.metadata))) {
        return jsonResponse(400, { error: "A valid checkout request is required" });
      }
      if (JSON.stringify(rawBody).length > 32768) return jsonResponse(413, { error: "Checkout request is too large" });
      const body = rawBody as CreateTransactionInput;

      const checkoutIdempotencyKey = normalizeCheckoutIdempotencyKey(
        body.idempotency_key,
      );
      if (body.idempotency_key && !checkoutIdempotencyKey) {
        return jsonResponse(400, { error: "Invalid checkout idempotency key" });
      }

      if (!body.description || typeof body.description !== "string") {
        return jsonResponse(400, { error: "Description is required" });
      }

      const checkoutRequestKey = checkoutIdempotencyKey ?? crypto.randomUUID();
      const intent = checkoutIntent(body);
      const checkoutFailure = (error: any): Response => jsonResponse(error?.code === "42501" ? 403 : 503, {
        error: error?.code === "42501" ? "This account can no longer create or reopen this checkout." : "Checkout is temporarily unavailable. Retry the same order.",
        error_code: error?.code === "42501" ? "checkout_forbidden" : "checkout_unavailable",
      });
      const checkoutResponse = async (result: any): Promise<Response | null> => {
        if (result?.ok === false && result.state === "conflict") return jsonResponse(409, {
          error: "This checkout reference belongs to different purchase choices.", error_code: "checkout_idempotency_conflict",
        });
        if (result?.ok === false && result.state === "legacy_review") return jsonResponse(409, {
          error: "This existing order needs review. Check its payment status before creating another order.",
          error_code: "checkout_legacy_review", transaction_id: result.transaction_id,
        });
        if (result?.ok === true && result.state === "absent") return null;
        const payment = result?.payment;
        if (result?.ok !== true || !["created", "existing"].includes(result.state) || !payment?.id
          || payment.user_id !== authedUserId || !["click", "platform_credit"].includes(payment.provider)) {
          return jsonResponse(503, { error: "Checkout is temporarily unavailable. Retry the same order.", error_code: "checkout_unavailable" });
        }
        const paid = ["paid", "success", "completed"].includes(normalizePaymentStatus(payment.status));
        let completed = !!payment.grant_completed_at;
        if (paid && !completed) completed = !(await grantPaidPaymentOnce(supabase, payment, payment.id));
        const payable = payment.provider === "click" && ["created", "pending"].includes(normalizePaymentStatus(payment.status));
        if (payable && !clickConfiguration().configured) return jsonResponse(503, {
          error: "This order is recorded; its payment link is temporarily unavailable. Retry the same order.",
          error_code: "click_not_configured", transaction_id: payment.id, status: payment.status,
        });
        const transactionId = payment.provider === "platform_credit" ? payment.provider_transaction_id : payment.id;
        const returnUrl = withPaymentReturnParams(normalizeRedirectUrl(body.redirect_url), transactionId, payment.purchase_type);
        return jsonResponse(paid && !completed ? 202 : 200, {
          transaction_id: transactionId, status: payment.status, grant_completed: completed,
          payment_url: payable ? buildClickPaymentUrl(getClickServiceId(), getClickMerchantId(), payment.amount, payment.id, returnUrl) : null,
          card_widget: payable ? buildCardWidgetConfig(getClickServiceId(), getClickMerchantId(), payment.amount, payment.id) : null,
          amount: payment.amount, currency: payment.currency, original_amount: payment.original_amount,
          discount_amount: payment.discount_amount, credit_amount: payment.credit_amount,
          referral_discount_amount: payment.referral_discount_amount, final_amount: payment.amount,
          coupon_code: payment.coupon_code, referral_code: payment.metadata?.referral_code ?? null,
          plan_id: payment.plan_id, product_id: payment.product_id, idempotent_replay: result.state === "existing",
          academy_payment_id: payment.purchase_type === "academy_tuition" ? payment.metadata?.academy_payment_id : undefined,
          message: paid && !completed ? "Payment received; access activation is pending. Do not pay again." : undefined,
        });
      };
      {
        const { data: existing, error: replayError } = await supabase.rpc("payment_checkout_replay", {
          p_user_id: authedUserId, p_request_key: checkoutRequestKey, p_intent: intent,
        });
        if (replayError) return checkoutFailure(replayError);
        const response = await checkoutResponse(existing);
        if (response) return response;
      }

      // Catalogue/admission/SQL failures do not prove absence of a concurrent
      // same-key order. Only fixed invalid input cannot create this exact intent.
      const checkoutInvalid = (detail: Record<string, unknown>, fixedInput = false) =>
        jsonResponse(400, { ...detail, ...(fixedInput ? { checkout_not_created: true } : {}) });
      if (normalizePurchaseType(body.purchase_type) === "center_tier_upgrade") {
        if (!clickConfiguration().configured) return jsonResponse(503, { error: "Click checkout is temporarily unavailable", error_code: "click_not_configured" });
        const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
        if (typeof intent.tenant_id !== "string" || !uuid.test(intent.tenant_id)
          || !["growth", "premium", "exclusive"].includes(String(intent.requested_tier))
          || !["monthly", "annual"].includes(String(intent.billing_period))
          || (intent.plan_id != null && !uuid.test(String(intent.plan_id)))
          || (intent.tier_change_request_id != null && !uuid.test(String(intent.tier_change_request_id)))) {
          return checkoutInvalid({ error: "Valid center, tier and billing period are required" }, true);
        }
        const { data: checkout, error: checkoutError } = await supabase.rpc("create_center_tier_checkout", {
          p_user_id: authedUserId, p_request_key: checkoutRequestKey, p_intent: intent,
          p_tenant_id: intent.tenant_id, p_tier: intent.requested_tier, p_billing: intent.billing_period,
          p_provider_metadata: { click_service_id: getClickServiceId(), click_merchant_id: getClickMerchantId() },
        });
        if (checkoutError?.code === "22023" || checkoutError?.code === "P0002" || checkoutError?.code === "P0003") return checkoutInvalid({
          error: "This center tier is unavailable for checkout. Refresh the catalogue or contact support.", error_code: "center_checkout_invalid",
        });
        if (checkoutError) return checkoutFailure(checkoutError);
        return await checkoutResponse(checkout) ?? jsonResponse(503, { error: "Checkout is temporarily unavailable. Retry the same order.", error_code: "checkout_unavailable" });
      }

      // ── Academy tuition (student-initiated; contact-based auth) ───────────────
      // Students are academy *contacts*, not tenant members, so this branch
      // resolves access via academy_contacts instead of tenant_memberships.
      if (normalizePurchaseType(body.purchase_type) === "academy_tuition") {
        if (!clickConfiguration().configured) return jsonResponse(503, { error: "Click checkout is temporarily unavailable", error_code: "click_not_configured" });
        const academyId = intent.academy_id;
        const offerId = intent.offer_id;
        const contactId = intent.contact_id;
        const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
        if (typeof academyId !== "string" || !uuid.test(academyId) || typeof offerId !== "string" || !uuid.test(offerId)
          || (contactId !== null && (typeof contactId !== "string" || !uuid.test(contactId)))) {
          return checkoutInvalid({ error: "Valid academy_id, offer_id and contact_id are required" });
        }
        const { data: checkout, error: checkoutError } = await supabase.rpc("create_academy_payment_checkout", {
          p_user_id: authedUserId, p_request_key: checkoutRequestKey, p_intent: intent,
          p_academy_id: academyId, p_offer_id: offerId, p_contact_id: contactId,
          p_provider_metadata: { click_service_id: getClickServiceId(), click_merchant_id: getClickMerchantId() },
        });
        if (checkoutError) {
          if (checkoutError.code === "22023" || checkoutError.code === "P0002" || checkoutError.code === "P0003") return checkoutInvalid({
            error: "This Academy offer or contact is unavailable for checkout. Please refresh the offer or contact the Academy.", error_code: "academy_checkout_invalid",
          });
          return checkoutFailure(checkoutError);
        }
        return await checkoutResponse(checkout) ?? jsonResponse(503, { error: "Checkout is temporarily unavailable. Retry the same order.", error_code: "checkout_unavailable" });
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
        return checkoutInvalid({
          error: "No active tenant membership",
        });
      }

      const purchaseType = normalizePurchaseType(body.purchase_type);
      let plan: PlanRow | null = null;
      // Product attributes read with the plan; kept out of the stored plan snapshot.
      let planProduct: { metadata?: unknown } | null | undefined = null;
      let experience: ExperiencePriceRow | null = null;
      let quantity = 1;
      let expiresInDays: number | null = null;
      let directAmount: number | null = null;
      let directCurrency = "UZS";

      if (purchaseType === "center_wallet_topup") {
        directAmount = normalizeMoney((body as any).amount);
        directCurrency = String((body as any).currency ?? "UZS").toUpperCase();
        if (directAmount <= 0) {
          return checkoutInvalid({ error: "amount must be positive" }, true);
        }
        if (directCurrency !== "UZS") {
          return checkoutInvalid({
            error: "Center wallet top-up currently supports UZS only",
          });
        }
        if (body.apply_credit || typeof body.credit_amount !== "undefined") {
          return checkoutInvalid({
            error: "Platform credit cannot be used to top up a center wallet",
          });
        }
        if (body.referral_code || body.referral_attribution_id) {
          return checkoutInvalid({
            error:
              "Referral discounts cannot be used to top up a center wallet",
          });
        }
      } else if (purchaseType === "token_pack") {
        const experienceId = String(body.experience_id ?? "");
        if (!experienceId) {
          return checkoutInvalid({ error: "experience_id is required" });
        }

        const qty = normalizeQuantity(body.quantity, 200);
        if (!qty) {
          return checkoutInvalid({
            error: "quantity must be between 1 and 200",
          }, true);
        }
        quantity = qty;

        const days = normalizeDays(
          body.expires_in_days ??
            (body as any).expires_in ??
            (body as any).days,
        );
        if (!days) {
          return checkoutInvalid({
            error: "expires_in_days must be between 1 and 30",
          }, true);
        }
        expiresInDays = days;

        const { data: expRow, error: expErr } = await supabase
          .from("experiences")
          .select("id, product_id, is_active, price_amount, price_currency")
          .eq("id", experienceId)
          .maybeSingle();
        if (expErr || !expRow) {
          return checkoutInvalid({ error: "Invalid experience_id" });
        }
        experience = expRow as ExperiencePriceRow;
        if (!experience.is_active) {
          return checkoutInvalid({
            error: "Experience is not active",
          });
        }
        const unitAmount = Number(experience.price_amount);
        if (!Number.isFinite(unitAmount) || unitAmount <= 0) {
          return checkoutInvalid({
            error: "Experience price is not set",
          });
        }
      } else if (purchaseType === "seat_pack") {
        const qty = normalizeQuantity(
          body.seat_count ?? body.quantity,
          200,
        );
        if (!qty) {
          return checkoutInvalid({
            error: "seat_count must be between 1 and 200",
          }, true);
        }
        quantity = qty;
        if (!body.plan_id) {
          return checkoutInvalid({ error: "plan_id is required" });
        }

        const { data: planRow, error: planError } = await supabase
          .from("plans")
          .select(
            "id, product_id, name, amount, currency, duration_days, metadata, product:products(metadata)",
          )
          .eq("id", body.plan_id)
          .eq("is_active", true)
          .maybeSingle();

        if (planError || !planRow) {
          return checkoutInvalid({ error: "Invalid plan_id" });
        }
        ({ product: planProduct, ...plan } = planRow as PlanRow & { product?: { metadata?: unknown } | null });
      } else if (body.plan_id) {
        const { data: planRow, error: planError } = await supabase
          .from("plans")
          .select(
            "id, product_id, name, amount, currency, duration_days, metadata, product:products(metadata)",
          )
          .eq("id", body.plan_id)
          .eq("is_active", true)
          .maybeSingle();

        if (planError || !planRow) {
          return checkoutInvalid({ error: "Invalid plan_id" });
        }
        ({ product: planProduct, ...plan } = planRow as PlanRow & { product?: { metadata?: unknown } | null });
      } else if (body.product_id) {
        const { data: planRow, error: planError } = await supabase
          .from("plans")
          .select(
            "id, product_id, name, amount, currency, duration_days, metadata, product:products(metadata)",
          )
          .eq("product_id", body.product_id)
          .eq("is_active", true)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (planError || !planRow) {
          return checkoutInvalid({
            error: "No active plan for product",
          });
        }
        ({ product: planProduct, ...plan } = planRow as PlanRow & { product?: { metadata?: unknown } | null });
      } else {
        return checkoutInvalid({
          error: "plan_id or product_id is required",
        });
      }

      let originalAmount = 0;
      let currency = "UZS";
      const productId = plan?.product_id ?? experience?.product_id ?? null;
      const planId = plan?.id ?? null;

      // Institution-wide services are bought for the institution, so only its
      // owner or administrator may purchase them. Other purchases are unchanged.
      if (plan && purchaseType !== "center_wallet_topup") {
        if (isInstitutionServiceProduct(planProduct?.metadata)) {
          const { data: buyer, error: buyerError } = await supabase
            .from("tenant_memberships")
            .select("role")
            .eq("tenant_id", tenantId)
            .eq("user_id", authedUserId)
            .eq("status", "active")
            .maybeSingle();
          if (buyerError) {
            return jsonResponse(500, { error: "Failed to load membership" });
          }
          if (!canPurchaseForInstitution(buyer?.role)) {
            return checkoutInvalid({
              error: "Only an institution owner or administrator can purchase this service",
              error_code: "institution_admin_required",
            });
          }
        }
      }

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
        return checkoutInvalid({ error: "Invalid plan amount" });
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
          return checkoutInvalid({
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
          return checkoutInvalid({ error: "Invalid coupon code" });
        }
        if (!plan) {
          return checkoutInvalid({
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
          return checkoutInvalid({
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
        const requestedCredit = body.credit_amount === null ||
            typeof body.credit_amount === "undefined"
          ? amount
          : normalizeMoney(body.credit_amount);
        creditAmount = Math.min(amount, availableCredit, requestedCredit);
        amount = Math.max(0, amount - creditAmount);
      }

      if (!Number.isFinite(amount) || amount < 0) {
        return checkoutInvalid({ error: "Invalid final amount" });
      }

      if (amount > 0) {
      const readiness = clickConfiguration();
      if (!readiness.configured) {
        return jsonResponse(503, {
          error: "CLICK payments are not configured",
          error_code: "click_not_configured",
          missing_configuration: readiness.missing,
          service_id_matches_production: readiness.serviceIdMatchesProduction,
        });
      }

        if (String(currency ?? "").toUpperCase() !== "UZS") {
          return checkoutInvalid({ error: "Click payments require UZS currency" });
        }
        const amountGuard = assertClickAmountAllowed(amount);
        if (amountGuard) return amountGuard;
      }

      const metadata: Record<string, unknown> = { ...(body.metadata ?? {}) };
      metadata.purchase_type = purchaseKind;
      metadata.referral_code = referralCheckout.referralCode ?? null;
      metadata.credit_applied = creditAmount;
      metadata.checkout_idempotency_key = checkoutRequestKey;
      if (amount > 0) {
        metadata.click_service_id = getClickServiceId();
        metadata.click_merchant_id = getClickMerchantId();
      }
      if (purchaseType === "token_pack") {
        metadata.experience_id = experience?.id ?? null;
        metadata.quantity = quantity;
        metadata.expires_in_days = expiresInDays ?? null;
        metadata.unit_price_amount = experience?.price_amount ?? null;
        metadata.unit_price_currency = experience?.price_currency ?? currency;
      } else if (purchaseType === "seat_pack") {
        metadata.seat_count = quantity;
        metadata.seat_plan_id = plan?.id ?? null;
      } else if (purchaseType === "center_wallet_topup") {
        metadata.wallet_topup_amount = originalAmount;
        metadata.wallet_topup_currency = currency;
        metadata.center_tenant_id = tenantId;
      }
      const { data: checkout, error: checkoutError } = await supabase.rpc("create_payment_checkout", {
        p_user_id: authedUserId, p_request_key: checkoutRequestKey, p_intent: intent,
        p_order: {
          provider: amount === 0 ? "platform_credit" : "click", user_id: authedUserId, tenant_id: tenantId,
          product_id: productId, plan_id: planId, amount, currency, purchase_type: purchaseKind,
          original_amount: originalAmount, discount_amount: discountAmount, credit_amount: creditAmount,
          referral_discount_amount: referralDiscountAmount, referral_attribution_id: referralCheckout.referralAttributionId,
          coupon_id: couponId, coupon_code: couponCode,
          plan_snapshot: plan ? buildPlanSnapshot(plan) : {}, entitlement_terms: plan ? buildEntitlementTerms(plan) : {}, metadata,
        },
      });
      if (checkoutError?.code === "22023") return checkoutInvalid({ error: "These purchase terms are unavailable. Refresh your choices.", error_code: "checkout_invalid" });
      if (checkoutError) return checkoutFailure(checkoutError);
      return await checkoutResponse(checkout) ?? jsonResponse(503, { error: "Checkout is temporarily unavailable. Retry the same order.", error_code: "checkout_unavailable" });
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

        if (
          !allowed && !isAcademyTuitionPayment(payment) && payment.tenant_id
        ) {
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
          (meta as any)?.click_trans_id ?? payment.provider_transaction_id ??
            "",
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

      const { error: statusUpdateError } = await supabase
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
      if (statusUpdateError) {
        // A stale provider poll may race a terminal callback. Read the durable
        // row rather than claiming that an unsuccessful update changed payment.
        const latest = await loadPaymentById(supabase, payment.id);
        if (latest.error || !latest.payment) return jsonResponse(503, { error: "Payment status is temporarily unavailable" });
        normalized = latest.payment.status;
      }

      let statusGrantError: string | null = null;

      if (
        isSuccessStatus(normalized) && payment.tenant_id && payment.user_id
      ) {
        // The database command commits access, financial effects and receipt together.
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
          scheduleClickOpsAlert(supabase, "status_grant_failed", "critical", {
            action: "status",
            payment_id: payment.id,
            protocol_error: 0,
            http_status: 200,
          });
          statusGrantError = "Failed to grant paid payment";
        }

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

      const { data: grantState } = await supabase
        .from("payments")
        .select("granted_at,grant_completed_at,grant_error")
        .eq("id", payment.id)
        .maybeSingle();

      return jsonResponse(200, {
        status: normalized,
        api_status: apiStatus,
        status_query_id: usedStatusId,
        credit_amount: payment.credit_amount ?? 0,
        referral_discount_amount: payment.referral_discount_amount ?? 0,
        final_amount: payment.amount ?? 0,
        grant_claimed: Boolean(grantState?.granted_at),
        grant_completed: Boolean(grantState?.grant_completed_at),
        grant_error: grantState?.grant_error || statusGrantError
          ? "Payment received; access activation is pending. Do not pay again."
          : null,
      });
    }

    return jsonResponse(404, { error: "Not found" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return jsonResponse(500, { error: message });
  }
};
