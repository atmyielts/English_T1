import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildEntitlementTerms,
  buildPlanSnapshot,
  extractIncludedProductIds,
  extractPlanLimits,
  parseEntitlementTerms,
} from "../_shared/payment-terms.ts";

type CreateTransactionInput = {
  plan_id?: string | null;
  product_id?: string | null;
  purchase_type?: string | null;
  experience_id?: string | null;
  quantity?: number | null;
  expires_in_days?: number | null;
  seat_count?: number | null;
  description: string;
  redirect_url?: string | null;
  metadata?: Record<string, unknown> | null;
  coupon_code?: string | null;
  apply_credit?: boolean | null;
  credit_amount?: number | null;
  referral_code?: string | null;
  referral_attribution_id?: string | null;
  /**
   * Optional: allow choosing a tenant if the user belongs to it.
   * If omitted, the user's first active membership is used.
   */
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

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-signature, x-timestamp",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const getEnv = (key: string): string => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Missing env var: ${key}`);
  return value;
};

const parseSuccessStatuses = (raw: string | undefined): Set<string> => {
  // TSPay docs use "success"; the app stores successful provider payments as "paid".
  const list = (raw ?? "paid,success,completed").split(",").map((v) => v.trim().toLowerCase());
  return new Set(list.filter(Boolean));
};

const normalizePurchaseType = (raw: unknown): string => String(raw ?? "").trim().toLowerCase();

const normalizeCenterTier = (raw: unknown): "starter" | "growth" | "premium" | "exclusive" | null => {
  const tier = String(raw ?? "").trim().toLowerCase();
  if (tier === "starter" || tier === "growth" || tier === "premium" || tier === "exclusive") return tier;
  return null;
};

const normalizeBillingPeriod = (raw: unknown): "monthly" | "annual" | "manual" => {
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

const getBearerToken = (req: Request): string | null => {
  const header = req.headers.get("Authorization") ?? "";
  if (!header) return null;
  return header.startsWith("Bearer ") ? header.slice(7) : header;
};

const normalizeCouponCode = (raw: unknown): string | null => {
  const code = typeof raw === "string" ? raw.trim() : "";
  if (!code) return null;
  // Store coupon codes as UPPERCASE in DB; normalize user input to match.
  return code.toUpperCase();
};

const getWindowError = (c: Pick<CouponRow, "starts_at" | "ends_at">): string | null => {
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

const normalizeCouponStatus = (raw: unknown): string => String(raw ?? "").trim().toLowerCase();

const computeDiscountFromEffects = (
  plan: Pick<PlanRow, "amount" | "currency">,
  coupon: Pick<CouponRow, "effects" | "currency">,
): number | null => {
  const effects = Array.isArray(coupon.effects) ? coupon.effects : [];
  if (effects.length === 0) return null;

  const original = Number(plan.amount);
  if (!Number.isFinite(original) || original <= 0) return null;

  let discount = 0;
  let applied = false;

  for (const effect of effects) {
    const type = String((effect as any)?.type ?? "").trim().toLowerCase();
    if (!type) continue;
    if (type === "percent_off") {
      const pct = Number((effect as any)?.percent ?? (effect as any)?.value ?? NaN);
      if (!Number.isFinite(pct) || pct <= 0 || pct > 100) continue;
      discount += Math.round((original * pct) / 100);
      applied = true;
    } else if (type === "fixed_off") {
      const amt = Number((effect as any)?.amount ?? (effect as any)?.value ?? NaN);
      if (!Number.isFinite(amt) || amt <= 0) continue;
      const currency = String((effect as any)?.currency ?? coupon.currency ?? plan.currency).toUpperCase();
      if (currency !== String(plan.currency).toUpperCase()) continue;
      discount += amt;
      applied = true;
    }
  }

  if (!applied) return null;
  return Math.max(0, Math.min(original, Math.floor(discount)));
};

const computeDiscount = (
  plan: Pick<PlanRow, "id" | "product_id" | "amount" | "currency">,
  coupon: CouponRow,
): { original_amount: number; discount_amount: number; final_amount: number } | null => {
  const original = Number(plan.amount);
  if (!Number.isFinite(original) || original <= 0) return null;

  let discount = computeDiscountFromEffects(plan, coupon);
  if (discount === null) {
    if (coupon.discount_type === "percent") {
      const pct = Number(coupon.value);
      if (!Number.isFinite(pct) || pct <= 0 || pct > 100) return null;
      discount = Math.round((original * pct) / 100);
    } else if (coupon.discount_type === "fixed") {
      const fixed = Number(coupon.value);
      if (!Number.isFinite(fixed) || fixed <= 0) return null;
      if (String(coupon.currency).toUpperCase() !== String(plan.currency).toUpperCase()) return null;
      discount = fixed;
    } else {
      return null;
    }
  }

  discount = Math.max(0, Math.min(original, Math.floor(discount)));
  const final = Math.max(0, original - discount);
  return { original_amount: original, discount_amount: discount, final_amount: final };
};

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

const hasPriorPaidPayment = async (sb: any, userId: string): Promise<boolean> => {
  const { count, error } = await sb
    .from("payments")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("status", ["paid", "success"]);
  if (error) throw error;
  return (count ?? 0) > 0;
};

type CouponValidationResult =
  | { ok: true; pricing: { original_amount: number; discount_amount: number; final_amount: number } }
  | { ok: false; error: string; error_code: string };

const validateCoupon = async (
  sb: any,
  coupon: CouponRow,
  plan: Pick<PlanRow, "id" | "product_id" | "amount" | "currency">,
  userId: string,
): Promise<CouponValidationResult> => {
  if (!coupon.is_active) return { ok: false, error: "Coupon is disabled", error_code: "coupon_inactive" };

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
      error_code: windowError.toLowerCase().includes("start") ? "coupon_not_started" : "coupon_expired",
    };
  }

  if (coupon.product_id !== plan.product_id) return { ok: false, error: "Coupon not applicable", error_code: "coupon_scope" };
  if (coupon.plan_id && coupon.plan_id !== plan.id) return { ok: false, error: "Coupon not applicable", error_code: "coupon_scope" };

  const original = Number(plan.amount);
  if (!Number.isFinite(original) || original <= 0) return { ok: false, error: "Invalid plan amount", error_code: "invalid_plan" };

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
      return { ok: false, error: "Coupon only valid for first purchase", error_code: "coupon_first_purchase" };
    }
  }

  if (coupon.max_redemptions) {
    const total = await countRedemptions(sb, coupon.id);
    if (total >= coupon.max_redemptions) {
      return { ok: false, error: "Coupon usage limit reached", error_code: "coupon_limit_reached" };
    }
  }

  if (coupon.max_per_user) {
    const used = await countRedemptions(sb, coupon.id, userId);
    if (used >= coupon.max_per_user) {
      return { ok: false, error: "Coupon already used", error_code: "coupon_used" };
    }
  }

  const pricing = computeDiscount(plan, coupon);
  if (!pricing) return { ok: false, error: "Coupon not applicable", error_code: "coupon_not_applicable" };

  return { ok: true, pricing };
};

const isSuccessStatus = (successes: Set<string>, status: string): boolean =>
  successes.has(status.trim().toLowerCase());

const normalizePaymentStatus = (raw: unknown): string => {
  const s = String(raw ?? "").trim().toLowerCase();
  return s || "unknown";
};

const looksLikeUuid = (value: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

const uniqIds = (values: Array<string | null | undefined>): string[] => {
  const set = new Set<string>();
  for (const raw of values) {
    const id = String(raw ?? "").trim();
    if (!id) continue;
    set.add(id);
  }
  return Array.from(set);
};

const parseCreateResponse = (
  createJson: any,
): { paymentUrl: string; preferredStatusId: string | null; rawIds: string[] } | null => {
  const tx = createJson?.transaction ?? createJson ?? null;
  if (!tx) return null;

  // Current docs: cheque_id + payment_url. Keep older variants for rollback safety.
  const paymentUrl = tx?.url ?? tx?.payment_url ?? tx?.paymentUrl ?? null;
  const chequeId = tx?.cheque_id ?? tx?.chequeId ?? null;
  const rawId = tx?.id ?? tx?.transaction_id ?? tx?.tx_id ?? null;
  const txUuid = tx?.uuid ?? tx?.uid ?? null;
  const rawIds = uniqIds([chequeId, rawId, txUuid]);

  if (!paymentUrl && rawIds.length === 0) return null;

  let parsedId: string | null = null;
  if (paymentUrl) {
    try {
      const u = new URL(String(paymentUrl));
      const parts = u.pathname.split("/").filter(Boolean);
      const last = parts[parts.length - 1];
      if (last) parsedId = last;
    } catch {
      // ignore
    }
  }

  const allIds = uniqIds([...rawIds, parsedId]);
  const preferredStatusId = String(chequeId ?? parsedId ?? rawId ?? txUuid ?? "").trim() || null;
  return { paymentUrl: String(paymentUrl ?? ""), preferredStatusId, rawIds: allIds };
};

const normalizeTsPaymentStatus = (raw: unknown): string => {
  const s = normalizePaymentStatus(raw);
  if (s === "success" || s === "paid" || s === "completed") return "paid";
  if (s === "canceled" || s === "cancelled") return "canceled";
  return s;
};

const parseStatusResponse = (statusJson: any): { paymentStatus: string; apiStatus: string } => {
  const apiStatus = normalizePaymentStatus(statusJson?.status);
  const hasStructuredPaymentStatus =
    statusJson?.data?.pay_status ??
    statusJson?.data?.status ??
    statusJson?.transaction?.pay_status ??
    statusJson?.transaction?.status ??
    statusJson?.pay_status ??
    null;

  // Fallback for TsPay variant that returns payment status in top-level `status`.
  const payStatus = hasStructuredPaymentStatus ?? statusJson?.status ?? null;

  return { paymentStatus: normalizeTsPaymentStatus(payStatus), apiStatus };
};

const buildEntitlementValue = (planId: string | null | undefined, limits: Record<string, number>): Record<string, unknown> => {
  const value: Record<string, unknown> = {};
  if (planId) value.plan_id = planId;
  if (Object.keys(limits).length > 0) value.limits = limits;
  return value;
};

const getEntitlementTargets = (productId: string, included: string[]): string[] => {
  const set = new Set<string>([productId, ...included]);
  return Array.from(set);
};

type PaymentGrantRow = {
  id: string;
  provider?: string | null;
  provider_transaction_id: string;
  tspay_order_id?: string | null;
  tspay_cheque_id?: string | null;
  tspay_transaction_id?: string | null;
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

const resolveGrantTerms = async (
  sb: any,
  paymentRow: PaymentGrantRow,
): Promise<ResolvedGrantTerms> => {
  const directTerms = parseEntitlementTerms(paymentRow.entitlement_terms ?? null);
  if (directTerms) {
    return {
      durationDays: directTerms.duration_days,
      includedProductIds: directTerms.included_product_ids,
      limits: directTerms.limits,
      sourcePlanId: directTerms.source_plan_id ?? paymentRow.plan_id ?? null,
    };
  }

  const planSnapshot =
    paymentRow.plan_snapshot && typeof paymentRow.plan_snapshot === "object" && !Array.isArray(paymentRow.plan_snapshot)
      ? paymentRow.plan_snapshot
      : null;
  if (planSnapshot) {
    const durationRaw = (planSnapshot as any).duration_days;
    const durationDays = durationRaw === null || typeof durationRaw === "undefined"
      ? null
      : Number.isFinite(Number(durationRaw))
      ? Math.max(1, Math.floor(Number(durationRaw)))
      : null;
    const meta = (planSnapshot as any).metadata ?? null;
    return {
      durationDays,
      includedProductIds: extractIncludedProductIds(meta),
      limits: extractPlanLimits(meta),
      sourcePlanId: String((planSnapshot as any).id ?? paymentRow.plan_id ?? ""),
    };
  }

  if (!paymentRow.plan_id) {
    return { durationDays: null, includedProductIds: [], limits: {}, sourcePlanId: null };
  }

  const { data: planRow } = await sb
    .from("plans")
    .select("id, duration_days, metadata")
    .eq("id", paymentRow.plan_id)
    .maybeSingle();

  if (!planRow) {
    throw new Error(`Plan terms unavailable for payment ${paymentRow.id} (plan ${paymentRow.plan_id})`);
  }

  const durationRaw = (planRow as any).duration_days;
  const durationDays = durationRaw === null || typeof durationRaw === "undefined"
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
    const { data } = await sb.from("exam_tokens").select("id").eq("token_code", code).maybeSingle();
    if (!data) return code;
  }
  throw new Error("Failed to generate unique candidate ID");
};

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

const normalizeReferralCode = (raw: unknown): string | null => {
  const code = String(raw ?? "").trim().toUpperCase();
  return code || null;
};

const normalizeMoney = (raw: unknown): number => {
  const n = Number(raw ?? 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
};

const purchaseKindForProgram = (purchaseType: string): string => purchaseType || "plan";

const computeConfiguredAmount = (
  baseAmount: number,
  type: unknown,
  value: unknown,
  cap?: unknown,
): number => {
  const normalizedType = String(type ?? "").trim().toLowerCase();
  const numericValue = Number(value ?? 0);
  if (!Number.isFinite(baseAmount) || baseAmount <= 0 || !Number.isFinite(numericValue) || numericValue <= 0) return 0;

  let amount = 0;
  if (normalizedType === "percent") {
    amount = Math.round((baseAmount * Math.min(numericValue, 100)) / 100);
  } else if (normalizedType === "fixed") {
    amount = numericValue;
  }

  const numericCap = cap === null || typeof cap === "undefined" ? null : Number(cap);
  if (numericCap !== null && Number.isFinite(numericCap) && numericCap >= 0) {
    amount = Math.min(amount, numericCap);
  }

  return Math.max(0, Math.min(baseAmount, Math.floor(amount)));
};

const hasPriorPaidPaymentExcept = async (sb: any, userId: string, paymentId?: string | null): Promise<boolean> => {
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

const getCreditAvailable = async (sb: any, userId: string, currency: string): Promise<number> => {
  const { data, error } = await sb.rpc("platform_credit_available", {
    p_user_id: userId,
    p_currency: currency,
  });
  if (error) throw error;
  return normalizeMoney(data);
};

const reserveCredit = async (
  sb: any,
  input: { userId: string; tenantId: string; amount: number; currency: string; paymentId: string; metadata?: Record<string, unknown> },
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

const isProgramEligible = (
  program: any,
  purchaseKind: string,
  currency: string,
  originalAmount: number,
): boolean => {
  if (!program || String(program.status ?? "").toLowerCase() !== "active") return false;
  if (String(program.currency ?? "UZS").toUpperCase() !== String(currency ?? "UZS").toUpperCase()) return false;
  const eligibleTypes = Array.isArray(program.eligible_purchase_types) ? program.eligible_purchase_types.map((v: unknown) => String(v)) : [];
  if (eligibleTypes.length > 0 && !eligibleTypes.includes(purchaseKind)) return false;
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
  },
): Promise<ReferralCheckoutResult> => {
  let attribution: any = null;
  let program: any = null;
  let referralCode = normalizeReferralCode(input.referralCode);

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
    if (error) return { ok: false, response: jsonResponse(500, { error: "Failed to load referral attribution", details: error }) };
    if (!data) return { ok: false, response: jsonResponse(400, { error: "Invalid referral attribution" }) };
    attribution = data;
    program = (data as any).referral_programs ?? null;
    referralCode = normalizeReferralCode((data as any).referral_code);
  } else if (referralCode) {
    const { data: account, error: accountError } = await sb
      .from("referral_accounts")
      .select("user_id, referral_code, status")
      .eq("referral_code", referralCode)
      .maybeSingle();
    if (accountError) return { ok: false, response: jsonResponse(500, { error: "Failed to load referral code", details: accountError }) };
    if (!account || String((account as any).status ?? "") !== "active") {
      return { ok: false, response: jsonResponse(400, { error: "Invalid referral code" }) };
    }
    if (String((account as any).user_id) === input.userId) {
      return { ok: false, response: jsonResponse(400, { error: "Self-referral is not allowed" }) };
    }

    const { data: programRow, error: programError } = await sb
      .from("referral_programs")
      .select(
        "id, status, currency, referred_discount_type, referred_discount_value, referrer_credit_type, referrer_credit_value, referrer_credit_cap, referrer_cash_type, referrer_cash_value, referrer_cash_cap, cash_payouts_enabled, minimum_cash_payout_amount, min_purchase_amount, eligible_purchase_types, first_purchase_only",
      )
      .eq("program_key", "default")
      .maybeSingle();
    if (programError) return { ok: false, response: jsonResponse(500, { error: "Failed to load referral program", details: programError }) };
    if (!programRow?.id) return { ok: true, referralAttributionId: null, referralCode, referralDiscountAmount: 0 };
    program = programRow;

    const { data: existing, error: existingError } = await sb
      .from("referral_attributions")
      .select("id, program_id, referrer_user_id, referred_user_id, referral_code, status")
      .eq("program_id", program.id)
      .eq("referred_user_id", input.userId)
      .maybeSingle();
    if (existingError) return { ok: false, response: jsonResponse(500, { error: "Failed to load referral attribution", details: existingError }) };

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
          metadata: { source: "checkout" },
        })
        .select("id, program_id, referrer_user_id, referred_user_id, referral_code, status")
        .maybeSingle();
      if (insertError) return { ok: false, response: jsonResponse(500, { error: "Failed to claim referral", details: insertError }) };
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
    if (programError) return { ok: false, response: jsonResponse(500, { error: "Failed to load referral program", details: programError }) };

    if (programRow?.id) {
      const { data: existing, error: existingError } = await sb
        .from("referral_attributions")
        .select("id, program_id, referrer_user_id, referred_user_id, referral_code, status")
        .eq("program_id", programRow.id)
        .eq("referred_user_id", input.userId)
        .eq("status", "pending")
        .maybeSingle();
      if (existingError) return { ok: false, response: jsonResponse(500, { error: "Failed to load referral attribution", details: existingError }) };

      if (existing?.id) {
        attribution = existing;
        program = programRow;
        referralCode = normalizeReferralCode((existing as any).referral_code);
      }
    }
  }

  if (!attribution?.id || !program) {
    return { ok: true, referralAttributionId: attribution?.id ?? null, referralCode, referralDiscountAmount: 0 };
  }

  let referralDiscountAmount = 0;
  if (String(attribution.status ?? "pending") === "pending" && isProgramEligible(program, input.purchaseKind, input.currency, input.originalAmount)) {
    const firstPurchaseOnly = Boolean(program.first_purchase_only);
    const alreadyPaid = firstPurchaseOnly ? await hasPriorPaidPaymentExcept(sb, input.userId, null) : false;
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

const issueReferralReward = async (sb: any, payment: PaymentGrantRow): Promise<void> => {
  if (!payment.referral_attribution_id || !payment.user_id) return;

  const meta = payment.metadata ?? {};
  const purchaseKind = purchaseKindForProgram(normalizePurchaseType(payment.purchase_type ?? (meta as any)?.purchase_type));
  const originalAmount = normalizeMoney(payment.original_amount ?? payment.amount ?? 0);
  const currency = String(payment.currency ?? "UZS").toUpperCase();

  const { data: attribution, error: attributionError } = await sb
    .from("referral_attributions")
    .select(
      "id, program_id, referrer_user_id, referred_user_id, referral_code, status, converted_payment_id, referral_programs ( id, status, currency, referrer_credit_type, referrer_credit_value, referrer_credit_cap, referrer_cash_type, referrer_cash_value, referrer_cash_cap, cash_payouts_enabled, minimum_cash_payout_amount, min_purchase_amount, eligible_purchase_types, first_purchase_only )",
    )
    .eq("id", payment.referral_attribution_id)
    .maybeSingle();
  if (attributionError || !attribution?.id) return;
  if (String((attribution as any).referred_user_id) !== payment.user_id) return;

  const program = (attribution as any).referral_programs ?? null;
  if (!isProgramEligible(program, purchaseKind, currency, originalAmount)) return;
  if (Boolean(program.first_purchase_only) && await hasPriorPaidPaymentExcept(sb, payment.user_id, payment.id)) return;

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
    .select("id, status, credit_amount, cash_amount, cash_status, referrer_user_id, currency")
    .maybeSingle();

  if (insertError) {
    const { data: existing } = await sb
      .from("referral_rewards")
      .select("id, status, credit_amount, cash_amount, cash_status, referrer_user_id, currency")
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

  if (normalizeMoney(reward.credit_amount) > 0 && !existingCreditGrant?.id) {
    await sb.from("platform_credit_ledger").insert({
      user_id: reward.referrer_user_id,
      tenant_id: payment.tenant_id ?? null,
      currency: reward.currency ?? currency,
      amount: normalizeMoney(reward.credit_amount),
      entry_kind: "grant",
      status: "posted",
      payment_id: payment.id,
      reward_id: reward.id,
      metadata: { attribution_id: attribution.id, referred_user_id: payment.user_id },
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

const isTerminalFailureStatus = (status: string): boolean =>
  ["failed", "failure", "canceled", "cancelled", "expired", "rejected"].includes(status.trim().toLowerCase());

const applyCenterTierUpgrade = async (
  supabase: any,
  payment: PaymentGrantRow,
): Promise<Response | null> => {
  const meta = payment.metadata ?? {};
  const targetTier = normalizeCenterTier((meta as any)?.requested_tier ?? (meta as any)?.center_tier);
  const previousTier = normalizeCenterTier((meta as any)?.previous_tier) ?? "starter";
  const billingPeriod = normalizeBillingPeriod((meta as any)?.billing_period);
  if (!payment.tenant_id || !payment.user_id || !targetTier || targetTier === "starter") {
    await supabase
      .from("payments")
      .update({ granted_at: null, grant_error: "Invalid center tier upgrade metadata" })
      .eq("id", payment.id);
    return jsonResponse(500, { error: "Invalid center tier upgrade metadata" });
  }

  const { data: currentProfile, error: profileError } = await supabase
    .from("partner_center_profiles")
    .select("tenant_id, package_tier, status, powered_by_schood, wallet_settings")
    .eq("tenant_id", payment.tenant_id)
    .maybeSingle();
  if (profileError || !currentProfile?.tenant_id) {
    await supabase
      .from("payments")
      .update({ granted_at: null, grant_error: "Education center profile not found" })
      .eq("id", payment.id);
    return jsonResponse(500, { error: "Education center profile not found" });
  }

  const currentTier = normalizeCenterTier((currentProfile as any).package_tier) ?? previousTier;
  if (CENTER_TIER_RANK[targetTier] < CENTER_TIER_RANK[currentTier]) {
    await supabase
      .from("payments")
      .update({ granted_at: null, grant_error: "Paid tier downgrades are not automatic" })
      .eq("id", payment.id);
    return jsonResponse(500, { error: "Paid tier downgrades are not automatic" });
  }

  let durationDays = 30;
  if (payment.plan_id) {
    const { data: planRow } = await supabase
      .from("plans")
      .select("duration_days, metadata")
      .eq("id", payment.plan_id)
      .maybeSingle();
    const planDays = Number((planRow as any)?.duration_days ?? 0);
    if (Number.isFinite(planDays) && planDays > 0) durationDays = Math.floor(planDays);
  }
  if ((meta as any)?.duration_days) {
    const metaDays = Number((meta as any).duration_days);
    if (Number.isFinite(metaDays) && metaDays > 0) durationDays = Math.floor(metaDays);
  }

  const nowIso = new Date().toISOString();
  const periodEnd = new Date(Date.now() + durationDays * 86400000).toISOString();
  const patch: Record<string, unknown> = {
    package_tier: targetTier,
    status: (currentProfile as any).status === "active" ? "active" : (currentProfile as any).status,
    wallet_settings: {
      ...(((currentProfile as any).wallet_settings && typeof (currentProfile as any).wallet_settings === "object" && !Array.isArray((currentProfile as any).wallet_settings))
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
      .update({ granted_at: null, grant_error: String(updateError.message ?? updateError) })
      .eq("id", payment.id);
    return jsonResponse(500, { error: "Failed to update center tier", details: updateError });
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
        source: "tspay",
        previous_tier: currentTier,
        plan_id: payment.plan_id ?? null,
      },
    },
    { onConflict: "tenant_id" },
  );

  const requestId = String((meta as any)?.tier_change_request_id ?? "").trim();
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
    const purchaseType = normalizePurchaseType(payment.purchase_type ?? (meta as any)?.purchase_type);

    if (purchaseType === "center_tier_upgrade") {
      const response = await applyCenterTierUpgrade(supabase, payment);
      if (response) return response;
    } else if (purchaseType === "token_pack") {
      const experienceId = String((meta as any)?.experience_id ?? "");
      const qty = normalizeQuantity((meta as any)?.quantity, 500);
      const days = normalizeDays((meta as any)?.expires_in_days);
      if (!experienceId || !qty || !days) {
        await supabase
          .from("payments")
          .update({ granted_at: null, grant_error: "Invalid token pack metadata" })
          .eq("id", payment.id);
        return jsonResponse(500, { error: "Invalid token pack metadata" });
      }

      const expiresAt = new Date(Date.now() + days * 86400000).toISOString();
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

      const { error: tokenErr } = await supabase.from("exam_tokens").insert(rows);
      if (tokenErr) {
        await supabase
          .from("payments")
          .update({ granted_at: null, grant_error: String(tokenErr.message ?? tokenErr) })
          .eq("id", payment.id);
        return jsonResponse(500, { error: "Failed to create tokens", details: tokenErr });
      }

      await supabase
        .from("payments")
        .update({ metadata: { ...meta, tokens_created: qty } })
        .eq("id", payment.id);
    } else if (purchaseType === "seat_pack") {
      const qty = normalizeQuantity((meta as any)?.seat_count ?? (meta as any)?.quantity, 500);
      const planId = String((meta as any)?.seat_plan_id ?? payment.plan_id ?? "");
      if (!qty || !planId || !payment.tenant_id) {
        await supabase
          .from("payments")
          .update({ granted_at: null, grant_error: "Invalid seat pack metadata" })
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
          .update({ granted_at: null, grant_error: "Plan not found for seat pack" })
          .eq("id", payment.id);
        return jsonResponse(500, { error: "Plan not found" });
      }

      const expiresAt = new Date(Date.now() + 30 * 86400000).toISOString();
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

      const { error: seatErr } = await supabase.from("seat_licenses").insert(seats);
      if (seatErr) {
        await supabase
          .from("payments")
          .update({ granted_at: null, grant_error: String(seatErr.message ?? seatErr) })
          .eq("id", payment.id);
        return jsonResponse(500, { error: "Failed to create seats", details: seatErr });
      }
    } else if (payment.product_id) {
      let terms: ResolvedGrantTerms;
      try {
        terms = await resolveGrantTerms(supabase, payment);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await supabase.from("payments").update({ granted_at: null, grant_error: msg }).eq("id", payment.id);
        return jsonResponse(500, { error: msg });
      }

      const entitlementValue = buildEntitlementValue(terms.sourcePlanId ?? payment.plan_id, terms.limits);
      const targetProductIds = getEntitlementTargets(payment.product_id, terms.includedProductIds);

      const { data: existingRows } = await supabase
        .from("entitlements")
        .select("resource_id, ends_at")
        .eq("tenant_id", payment.tenant_id)
        .eq("resource_type", "product")
        .in("resource_id", targetProductIds);

      const existingMap = new Map<string, string | null>();
      (existingRows ?? []).forEach((row: any) => {
        if (row?.resource_id) existingMap.set(String(row.resource_id), row?.ends_at ?? null);
      });

      const payload = targetProductIds.map((pid) => {
        let targetEndsAt: string | null = null;
        if (terms.durationDays && terms.durationDays > 0) {
          const nowMs = Date.now();
          const existing = existingMap.get(pid);
          const baseMs = existing ? Math.max(nowMs, Date.parse(existing)) : nowMs;
          targetEndsAt = new Date(baseMs + terms.durationDays * 24 * 60 * 60 * 1000).toISOString();
        }

        return {
          user_id: payment.user_id,
          tenant_id: payment.tenant_id,
          resource_type: "product",
          resource_id: pid,
          is_active: true,
          starts_at: nowIso,
          ends_at: targetEndsAt,
          source: "tspay",
          value: entitlementValue,
        };
      });

      const { error: grantError } = await supabase.from("entitlements").upsert(payload, {
        onConflict: "tenant_id,resource_type,resource_id",
      });

      if (grantError) {
        await supabase
          .from("payments")
          .update({ granted_at: null, grant_error: String(grantError.message ?? grantError) })
          .eq("id", payment.id);

        return jsonResponse(500, { error: "Failed to grant entitlement", details: grantError });
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
        const { error: redErr } = await supabase.from("coupon_redemptions").upsert(
          {
            coupon_id: payment.coupon_id,
            payment_id: payment.id,
            context_id: payment.id,
            user_id: payment.user_id,
            tenant_id: payment.tenant_id,
            status: "applied",
            redeemed_at: redeemedAt,
            snapshot,
            metadata: { provider: "tspay", provider_transaction_id: usedStatusId },
          },
          { onConflict: "coupon_id,user_id,context_id" },
        );
        if (redErr && String((redErr as any).code ?? "") !== "23505") {
          // non-fatal admin/support trail
        }
      }
    }
  }

  if (normalizeMoney(payment.credit_amount) > 0) {
    await supabase.rpc("consume_platform_credit", { p_payment_id: payment.id, p_metadata: {} });
  }

  await issueReferralReward(supabase, payment);
  return null;
};

const paymentGrantSelect =
  "id, provider, provider_transaction_id, tspay_order_id, tspay_cheque_id, tspay_transaction_id, user_id, tenant_id, product_id, plan_id, status, granted_at, coupon_id, coupon_code, original_amount, discount_amount, amount, currency, credit_amount, referral_discount_amount, referral_attribution_id, purchase_type, plan_snapshot, entitlement_terms, metadata";

const normalizeTspayApiBaseUrl = (raw: string | undefined): string => {
  const value = String(raw ?? "").trim();
  if (!value) return "https://api.tspay.uz/api";
  if (/\/api\/v1\/?$/i.test(value)) return "https://api.tspay.uz/api";
  return value.replace(/\/+$/, "");
};

const getTspayMerchantId = (): string => getEnv("TSPAY_MERCHANT_ID");

const getWebhookSecret = (): string => getEnv("TSPAY_WEBHOOK_SECRET");

const generateTspayOrderId = (): string => {
  const random = new Uint32Array(1);
  crypto.getRandomValues(random);
  const value = BigInt(Date.now()) * 1000n + BigInt(random[0] % 1000);
  return value.toString();
};

const normalizeRedirectUrl = (raw: unknown): string | null => {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") return null;
    return parsed.toString();
  } catch {
    return null;
  }
};

const amountForSignatureCandidates = (raw: unknown): string[] => {
  const values = new Set<string>();
  const asString = String(raw ?? "");
  if (asString) {
    values.add(asString);
    if (!asString.includes(".")) values.add(`${asString}.0`);
  }
  const numeric = Number(raw);
  if (Number.isFinite(numeric)) {
    values.add(String(numeric));
    values.add(numeric.toFixed(1));
  }
  if (values.size === 0) values.add("");
  return Array.from(values);
};

const hmacSha256Hex = async (secret: string, message: string): Promise<string> => {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
};

const constantTimeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

const verifyTspayWebhookSignature = async (
  req: Request,
  body: any,
  webhookSecret: string,
): Promise<boolean> => {
  const signature = req.headers.get("x-signature") ?? "";
  const timestamp = req.headers.get("x-timestamp") ?? "";
  const params = body?.params ?? {};
  const orderId = String(params?.order_id ?? "");
  if (!signature || !timestamp) return false;

  for (const amount of amountForSignatureCandidates(params?.amount)) {
    const expected = `sha256=${await hmacSha256Hex(webhookSecret, `${orderId}:${amount}:${timestamp}`)}`;
    if (constantTimeEqual(signature, expected)) return true;
  }
  return false;
};

const normalizeWebhookAmount = (raw: unknown): number | null => {
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
};

const amountsMatch = (expected: unknown, actual: unknown): boolean => {
  const a = normalizeWebhookAmount(expected);
  const b = normalizeWebhookAmount(actual);
  return a !== null && b !== null && a === b;
};

const loadPaymentByReference = async (sb: any, ref: string): Promise<{ payment: PaymentGrantRow | null; error: any }> => {
  const value = String(ref ?? "").trim();
  if (!value) return { payment: null, error: null };

  const queries = [
    sb.from("payments").select(paymentGrantSelect).eq("provider_transaction_id", value).maybeSingle(),
    sb.from("payments").select(paymentGrantSelect).eq("provider", "tspay").eq("tspay_cheque_id", value).maybeSingle(),
    sb.from("payments").select(paymentGrantSelect).eq("provider", "tspay").eq("tspay_order_id", value).maybeSingle(),
  ];

  for (const query of queries) {
    const { data, error } = await query;
    if (error) return { payment: null, error };
    if (data) return { payment: data as PaymentGrantRow, error: null };
  }

  return { payment: null, error: null };
};

const loadTspayPaymentByOrderId = async (sb: any, orderId: string): Promise<{ payment: PaymentGrantRow | null; error: any }> => {
  const value = String(orderId ?? "").trim();
  if (!value) return { payment: null, error: null };

  const { data, error } = await sb
    .from("payments")
    .select(paymentGrantSelect)
    .eq("provider", "tspay")
    .eq("tspay_order_id", value)
    .maybeSingle();
  if (error || data) return { payment: (data ?? null) as PaymentGrantRow | null, error };

  const fallback = await sb
    .from("payments")
    .select(paymentGrantSelect)
    .eq("provider", "tspay")
    .eq("provider_transaction_id", value)
    .maybeSingle();
  return { payment: (fallback.data ?? null) as PaymentGrantRow | null, error: fallback.error };
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

const assertTspayAmountAllowed = (amount: number): Response | null => {
  if (amount < 1000) {
    return jsonResponse(400, { error: "TSPay minimum amount is 1,000 UZS after discounts and credits" });
  }
  if (amount > 200000000) {
    return jsonResponse(400, { error: "TSPay maximum amount is 200,000,000 UZS per transaction" });
  }
  return null;
};

const fetchTspayStatus = async (
  tspayBaseUrl: string,
  payment: PaymentGrantRow,
  requestedTransactionId: string,
): Promise<{ ok: boolean; statusJson: any; statusQueryId: string; responseStatus: number }> => {
  const meta = payment.metadata ?? {};
  const chequeId = String(payment.tspay_cheque_id ?? (meta as any)?.tspay_cheque_id ?? "").trim();
  const orderId = String(payment.tspay_order_id ?? (meta as any)?.tspay_order_id ?? "").trim();
  const candidates = uniqIds([chequeId, requestedTransactionId, payment.provider_transaction_id, orderId]);

  for (const candidate of candidates) {
    const isCheque = looksLikeUuid(candidate);
    const endpoint = isCheque
      ? `${tspayBaseUrl}/transactions/cheque/${encodeURIComponent(candidate)}`
      : `${tspayBaseUrl}/transactions/${encodeURIComponent(candidate)}`;
    const res = await fetch(endpoint, { method: "GET" });
    const statusJson = await readJsonPayload(res);
    if (res.ok) return { ok: true, statusJson, statusQueryId: candidate, responseStatus: res.status };
    if (res.status !== 404) return { ok: false, statusJson, statusQueryId: candidate, responseStatus: res.status };
  }

  return {
    ok: false,
    statusJson: { detail: "Transaction not found" },
    statusQueryId: candidates[0] ?? requestedTransactionId,
    responseStatus: 404,
  };
};

const handleTspayWebhook = async (
  req: Request,
  supabase: any,
  successStatuses: Set<string>,
): Promise<Response> => {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { error: { code: -31000, message: "Invalid JSON" } });
  }

  const webhookSecret = getWebhookSecret();
  const isValidSignature = await verifyTspayWebhookSignature(req, body, webhookSecret);
  if (!isValidSignature) {
    return jsonResponse(401, { allow: false, reason: "Invalid signature" });
  }

  const method = String(body?.method ?? "").trim();
  const params = body?.params ?? {};
  const orderId = String(params?.order_id ?? "").trim();
  const chequeId = String(params?.cheque_id ?? "").trim() || null;
  const merchantId = String(params?.merchant_id ?? "").trim();
  const configuredMerchantId = String(Deno.env.get("TSPAY_MERCHANT_ID") ?? "").trim();

  if (configuredMerchantId && merchantId && merchantId !== configuredMerchantId) {
    return jsonResponse(400, { allow: false, reason: "Merchant mismatch" });
  }

  if (!orderId) {
    return jsonResponse(400, { allow: false, reason: "order_id is required" });
  }

  const { payment, error } = await loadTspayPaymentByOrderId(supabase, orderId);
  if (error) return jsonResponse(500, { error: { code: -31099, message: "Payment lookup failed" } });

  if (method === "checkPerform") {
    if (!payment) return jsonResponse(200, { allow: false, reason: "Order not found" });
    if (!amountsMatch(payment.amount, params?.amount)) return jsonResponse(200, { allow: false, reason: "Amount mismatch" });
    if (isTerminalFailureStatus(payment.status)) return jsonResponse(200, { allow: false, reason: "Order is not payable" });

    return jsonResponse(200, {
      allow: true,
      additional: {
        payment_id: payment.id,
        tenant_id: payment.tenant_id,
        user_id: payment.user_id,
      },
    });
  }

  if (method === "createTransaction") {
    if (!payment) {
      return jsonResponse(400, { error: { code: -31002, message: "Order not found" } });
    }
    if (!amountsMatch(payment.amount, params?.amount)) {
      return jsonResponse(400, { error: { code: -31001, message: "Amount mismatch" } });
    }

    const tspayTransactionId = String(params?.transaction_id ?? params?.id ?? "").trim() || null;
    const metadata = {
      ...(payment.metadata ?? {}),
      tspay_order_id: orderId,
      tspay_cheque_id: chequeId,
      tspay_transaction_id: tspayTransactionId,
      tspay_webhook_additional: params?.additional ?? null,
    };

    const { data: updated, error: updateError } = await supabase
      .from("payments")
      .update({
        provider_transaction_id: chequeId ?? payment.provider_transaction_id,
        tspay_order_id: orderId,
        tspay_cheque_id: chequeId,
        tspay_transaction_id: tspayTransactionId,
        status: payment.status === "created" ? "pending" : payment.status,
        metadata,
        provider_payload: { webhook_create_transaction: body },
      })
      .eq("id", payment.id)
      .select("id")
      .maybeSingle();

    if (updateError || !updated?.id) {
      return jsonResponse(500, { error: { code: -31003, message: "Could not create merchant transaction" } });
    }

    return jsonResponse(200, { success: true, transaction_id: payment.id });
  }

  if (method === "performTransaction") {
    const ref = chequeId ?? orderId;
    const loaded = chequeId ? await loadPaymentByReference(supabase, chequeId) : { payment, error: null };
    const row = loaded.payment ?? payment;
    if (loaded.error) return jsonResponse(500, { success: false });
    if (!row) return jsonResponse(200, { success: false });
    if (!amountsMatch(row.amount, params?.amount)) return jsonResponse(200, { success: false });

    const tspayTransactionId = String(params?.transaction_id ?? "").trim() || row.tspay_transaction_id || null;
    const metadata = {
      ...(row.metadata ?? {}),
      tspay_order_id: orderId,
      tspay_cheque_id: chequeId ?? row.tspay_cheque_id ?? null,
      tspay_transaction_id: tspayTransactionId,
      tspay_webhook_additional: params?.additional ?? null,
    };

    const { data: updatedPayment, error: updateError } = await supabase
      .from("payments")
      .update({
        provider_transaction_id: chequeId ?? row.provider_transaction_id,
        tspay_order_id: orderId,
        tspay_cheque_id: chequeId ?? row.tspay_cheque_id ?? null,
        tspay_transaction_id: tspayTransactionId,
        status: "paid",
        metadata,
        provider_payload: { webhook_perform_transaction: body },
      })
      .eq("id", row.id)
      .select(paymentGrantSelect)
      .maybeSingle();

    if (updateError || !updatedPayment?.id) return jsonResponse(500, { success: false });

    if (isSuccessStatus(successStatuses, "paid")) {
      const grantResponse = await grantPaidPaymentOnce(supabase, updatedPayment as PaymentGrantRow, ref);
      if (grantResponse) {
        console.error("tspay_webhook_grant_failed", { payment_id: row.id });
      }
    }

    return jsonResponse(200, { success: true });
  }

  return jsonResponse(400, { allow: false, reason: "Unknown method" });
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = getEnv("SUPABASE_URL");
    const supabaseServiceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
    const tspayBaseUrl = normalizeTspayApiBaseUrl(Deno.env.get("TSPAY_API_BASE_URL") ?? Deno.env.get("TSPAY_BASE_URL"));
    const successStatuses = parseSuccessStatuses(Deno.env.get("TSPAY_SUCCESS_STATUSES"));

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    const url = new URL(req.url);

    const isWebhookRoute =
      req.method === "POST" &&
      (url.pathname.endsWith("/webhook") || !getBearerToken(req));

    if (isWebhookRoute) {
      return await handleTspayWebhook(req, supabase, successStatuses);
    }

    const token = getBearerToken(req);
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const authedUserId = authData.user.id;

    if (req.method === "POST" && url.pathname.endsWith("/create-transaction")) {
      const body = (await req.json()) as CreateTransactionInput;

      if (!body.description || typeof body.description !== "string") {
        return new Response(JSON.stringify({ error: "Description is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const { data: memberships, error: membershipError } = await supabase
        .from("tenant_memberships")
        .select("tenant_id")
        .eq("user_id", authedUserId)
        .eq("status", "active")
        .order("created_at", { ascending: true });

      if (membershipError) {
        return new Response(JSON.stringify({ error: "Failed to load memberships", details: membershipError }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const tenantIds = new Set((memberships ?? []).map((m: any) => m.tenant_id));
      const defaultTenantId = (memberships ?? [])[0]?.tenant_id ?? null;
      const tenantId = body.tenant_id ? (tenantIds.has(body.tenant_id) ? body.tenant_id : null) : defaultTenantId;

      if (!tenantId) {
        return new Response(JSON.stringify({ error: "No active tenant membership" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const purchaseType = normalizePurchaseType(body.purchase_type);
      let plan: PlanRow | null = null;
      let experience: ExperiencePriceRow | null = null;
      let quantity = 1;
      let expiresInDays: number | null = null;

      if (purchaseType === "token_pack") {
        const experienceId = String(body.experience_id ?? "");
        if (!experienceId) {
          return new Response(JSON.stringify({ error: "experience_id is required" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }

        const qty = normalizeQuantity(body.quantity, 200);
        if (!qty) {
          return new Response(JSON.stringify({ error: "quantity must be between 1 and 200" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }
        quantity = qty;

        const days = normalizeDays(body.expires_in_days ?? (body as any).expires_in ?? (body as any).days);
        if (!days) {
          return new Response(JSON.stringify({ error: "expires_in_days must be between 1 and 30" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }
        expiresInDays = days;

        const { data: expRow, error: expErr } = await supabase
          .from("experiences")
          .select("id, product_id, is_active, price_amount, price_currency")
          .eq("id", experienceId)
          .maybeSingle();
        if (expErr || !expRow) {
          return new Response(JSON.stringify({ error: "Invalid experience_id" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }
        experience = expRow as ExperiencePriceRow;
        if (!experience.is_active) {
          return new Response(JSON.stringify({ error: "Experience is not active" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }
        const unitAmount = Number(experience.price_amount);
        if (!Number.isFinite(unitAmount) || unitAmount <= 0) {
          return new Response(JSON.stringify({ error: "Experience price is not set" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }
      } else if (purchaseType === "seat_pack") {
        const qty = normalizeQuantity(body.seat_count ?? body.quantity, 200);
        if (!qty) {
          return new Response(JSON.stringify({ error: "seat_count must be between 1 and 200" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }
        quantity = qty;
        if (!body.plan_id) {
          return new Response(JSON.stringify({ error: "plan_id is required" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }

        const { data: planRow, error: planError } = await supabase
          .from("plans")
          .select("id, product_id, name, amount, currency, duration_days, metadata")
          .eq("id", body.plan_id)
          .eq("is_active", true)
          .maybeSingle();

        if (planError || !planRow) {
          return new Response(JSON.stringify({ error: "Invalid plan_id" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }
        plan = planRow as PlanRow;
      } else if (body.plan_id) {
        const { data: planRow, error: planError } = await supabase
          .from("plans")
          .select("id, product_id, name, amount, currency, duration_days, metadata")
          .eq("id", body.plan_id)
          .eq("is_active", true)
          .maybeSingle();

        if (planError || !planRow) {
          return new Response(JSON.stringify({ error: "Invalid plan_id" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }
        plan = planRow as PlanRow;
      } else if (body.product_id) {
        const { data: planRow, error: planError } = await supabase
          .from("plans")
          .select("id, product_id, name, amount, currency, duration_days, metadata")
          .eq("product_id", body.product_id)
          .eq("is_active", true)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (planError || !planRow) {
          return new Response(JSON.stringify({ error: "No active plan for product" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }
        plan = planRow as PlanRow;
      } else {
        return new Response(JSON.stringify({ error: "plan_id or product_id is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      let originalAmount = 0;
      let currency = "UZS";
      let productId = plan?.product_id ?? experience?.product_id ?? null;
      let planId = plan?.id ?? null;

      if (purchaseType === "token_pack") {
        const unitAmount = Number(experience?.price_amount ?? NaN);
        originalAmount = unitAmount * quantity;
        currency = String(experience?.price_currency ?? "UZS");
      } else {
        originalAmount = Number(plan?.amount ?? NaN) * quantity;
        currency = String(plan?.currency ?? "UZS");
      }

      if (!Number.isFinite(originalAmount) || originalAmount <= 0) {
        return new Response(JSON.stringify({ error: "Invalid plan amount" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      let amount = originalAmount;
      let discountAmount = 0;
      let couponId: string | null = null;
      let couponCode: string | null = null;

      const normalizedCouponCode = normalizeCouponCode(body.coupon_code);
      if (normalizedCouponCode) {
        if (purchaseType === "token_pack" || purchaseType === "seat_pack") {
          return new Response(JSON.stringify({ error: "Coupons are not supported for this purchase type" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders },
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
          return new Response(JSON.stringify({ error: "Failed to load coupon", details: couponError }), {
            status: 500,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }

        if (!couponRow) {
          return new Response(JSON.stringify({ error: "Invalid coupon code" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }
        if (!plan) {
          return new Response(JSON.stringify({ error: "Coupon requires a plan purchase" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }

        const coupon = couponRow as CouponRow;
        const validation = await validateCoupon(supabase, coupon, plan, authedUserId);
        if (!validation.ok) {
          return new Response(JSON.stringify({ error: validation.error, error_code: validation.error_code }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders },
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
      });
      if (!referralCheckout.ok) return referralCheckout.response;

      const referralDiscountAmount = Math.min(amount, referralCheckout.referralDiscountAmount);
      if (referralDiscountAmount > 0) {
        amount = Math.max(0, amount - referralDiscountAmount);
        discountAmount += referralDiscountAmount;
      }

      let creditAmount = 0;
      const availableCredit = await getCreditAvailable(supabase, authedUserId, currency);
      if (body.apply_credit || body.credit_amount !== null && typeof body.credit_amount !== "undefined") {
        const requestedCredit = body.credit_amount === null || typeof body.credit_amount === "undefined"
          ? amount
          : normalizeMoney(body.credit_amount);
        creditAmount = Math.min(amount, availableCredit, requestedCredit);
        amount = Math.max(0, amount - creditAmount);
      }

      if (!Number.isFinite(amount) || amount < 0) {
        return new Response(JSON.stringify({ error: "Invalid final amount" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      if (amount === 0) {
        const providerId = `credit-${crypto.randomUUID()}`;
        const metadata: Record<string, unknown> = { ...(body.metadata ?? {}) };

        metadata.purchase_type = purchaseKind;
        metadata.referral_code = referralCheckout.referralCode ?? null;
        metadata.credit_applied = creditAmount;
        if (purchaseType === "token_pack") {
          metadata.purchase_type = "token_pack";
          metadata.experience_id = experience?.id ?? null;
          metadata.quantity = quantity;
          metadata.expires_in_days = expiresInDays ?? null;
          metadata.unit_price_amount = experience?.price_amount ?? null;
          metadata.unit_price_currency = experience?.price_currency ?? currency;
        } else if (purchaseType === "seat_pack") {
          metadata.purchase_type = "seat_pack";
          metadata.seat_count = quantity;
          metadata.seat_plan_id = plan?.id ?? null;
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
            referral_attribution_id: referralCheckout.referralAttributionId,
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
            provider_payload: { provider: "platform_credit", full_credit: true },
          })
          .select(
            "id, provider_transaction_id, user_id, tenant_id, product_id, plan_id, status, granted_at, coupon_id, coupon_code, original_amount, discount_amount, amount, currency, credit_amount, referral_discount_amount, referral_attribution_id, purchase_type, plan_snapshot, entitlement_terms, metadata",
          )
          .maybeSingle();

        if (insertError || !insertedPayment?.id) {
          return jsonResponse(500, { error: "Failed to record payment", details: insertError });
        }

        const reserve = await reserveCredit(supabase, {
          userId: authedUserId,
          tenantId,
          amount: creditAmount,
          currency,
          paymentId: insertedPayment.id,
          metadata: { provider: "platform_credit", purchase_type: purchaseKind },
        });
        if (!reserve.ok) {
          await supabase.from("payments").update({ status: "failed", grant_error: "Credit reserve failed" }).eq("id", insertedPayment.id);
          return jsonResponse(400, { error: "Credit reserve failed", details: reserve.details });
        }

        const grantResponse = await grantPaidPaymentOnce(supabase, insertedPayment as PaymentGrantRow, providerId);
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
        metadata.unit_price_currency = experience?.price_currency ?? currency;
      } else if (purchaseType === "seat_pack") {
        metadata.purchase_type = "seat_pack";
        metadata.seat_count = quantity;
        metadata.seat_plan_id = plan?.id ?? null;
      }

      const planSnapshot = plan ? buildPlanSnapshot(plan) : {};
      const entitlementTerms = plan ? buildEntitlementTerms(plan) : {};
      const amountGuard = assertTspayAmountAllowed(amount);
      if (amountGuard) return amountGuard;

      const merchantId = getTspayMerchantId();
      const tspayOrderId = generateTspayOrderId();
      const redirectUrl = normalizeRedirectUrl(body.redirect_url);
      metadata.tspay_order_id = tspayOrderId;

      const { data: insertedPayment, error: insertError } = await supabase
        .from("payments")
        .insert({
          provider: "tspay",
          provider_transaction_id: tspayOrderId,
          tspay_order_id: tspayOrderId,
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
          metadata: {
            ...metadata,
          },
          provider_payload: { stage: "local_order_created" },
        })
        .select("id")
        .maybeSingle();

      if (insertError || !insertedPayment?.id) {
        return new Response(JSON.stringify({ error: "Failed to record payment", details: insertError }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      if (creditAmount > 0) {
        const reserve = await reserveCredit(supabase, {
          userId: authedUserId,
          tenantId,
          amount: creditAmount,
          currency,
          paymentId: insertedPayment.id,
          metadata: { provider: "tspay", tspay_order_id: tspayOrderId, purchase_type: purchaseKind },
        });
        if (!reserve.ok) {
          await supabase
            .from("payments")
            .update({ grant_error: "Credit reserve failed" })
            .eq("id", insertedPayment.id);
          return jsonResponse(400, { error: "Credit reserve failed", details: reserve.details });
        }
      }

      const createRes = await fetch(`${tspayBaseUrl}/transactions/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchant_id: merchantId,
          amount,
          order_id: Number(tspayOrderId),
          ...(redirectUrl ? { redirect_url: redirectUrl } : {}),
        }),
      });

      const createJson = await readJsonPayload(createRes);
      if (!createRes.ok) {
        await supabase
          .from("payments")
          .update({ status: "failed", grant_error: "TSPay create failed", provider_payload: createJson })
          .eq("id", insertedPayment.id);
        if (creditAmount > 0) {
          await supabase.rpc("release_platform_credit", {
            p_payment_id: insertedPayment.id,
            p_reason: "tspay_create_failed",
          });
        }
        return new Response(JSON.stringify({ error: "TSPay create failed", details: createJson }), {
          status: 502,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const parsed = parseCreateResponse(createJson);
      if (!parsed) {
        await supabase
          .from("payments")
          .update({ status: "failed", grant_error: "Missing TSPay transaction data", provider_payload: createJson })
          .eq("id", insertedPayment.id);
        if (creditAmount > 0) {
          await supabase.rpc("release_platform_credit", {
            p_payment_id: insertedPayment.id,
            p_reason: "tspay_missing_transaction_data",
          });
        }
        return new Response(JSON.stringify({ error: "Missing transaction data" }), {
          status: 502,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const { paymentUrl, preferredStatusId, rawIds } = parsed;
      const providerId = preferredStatusId || (rawIds[0] ?? null);
      const tspayTransactionId = String((createJson as any)?.id ?? (createJson as any)?.transaction?.id ?? "").trim() || null;

      if (!providerId) {
        await supabase
          .from("payments")
          .update({ status: "failed", grant_error: "Missing TSPay transaction id", provider_payload: createJson })
          .eq("id", insertedPayment.id);
        if (creditAmount > 0) {
          await supabase.rpc("release_platform_credit", {
            p_payment_id: insertedPayment.id,
            p_reason: "tspay_missing_transaction_id",
          });
        }
        return new Response(JSON.stringify({ error: "Missing transaction id" }), {
          status: 502,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const { error: updateError } = await supabase
        .from("payments")
        .update({
          provider_transaction_id: providerId,
          tspay_cheque_id: providerId,
          tspay_transaction_id: tspayTransactionId,
          metadata: {
            ...metadata,
            tspay_cheque_id: providerId,
            tspay_transaction_id: tspayTransactionId,
            tspay_ids: rawIds,
            tspay_payment_url: paymentUrl,
          },
          provider_payload: createJson,
        })
        .eq("id", insertedPayment.id);

      if (updateError) {
        return new Response(JSON.stringify({ error: "Failed to record TSPay transaction", details: updateError }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      return new Response(
        JSON.stringify({
          payment_url: paymentUrl,
          transaction_id: providerId,
          order_id: tspayOrderId,
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
          debug: {
            tspay_ids: rawIds,
            status_id_hint: preferredStatusId,
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        },
      );
    }

    if (req.method === "GET" && url.pathname.endsWith("/status")) {
      const requestedTransactionId = url.searchParams.get("transaction_id");
      if (!requestedTransactionId) {
        return new Response(JSON.stringify({ error: "transaction_id is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const { payment: paymentRow, error: paymentError } = await loadPaymentByReference(supabase, requestedTransactionId);

      if (paymentError) {
        return new Response(JSON.stringify({ error: "Failed to load payment", details: paymentError }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      if (!paymentRow) {
        return new Response(JSON.stringify({ error: "Payment not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const payment = paymentRow as PaymentGrantRow;

      let statusJson: any = { status: "paid", provider: payment.provider ?? "platform_credit" };
      let usedStatusId = requestedTransactionId;
      let apiStatus = "internal";
      let normalized = "paid";

      if (String(payment.provider ?? "tspay") !== "platform_credit") {
        const checked = await fetchTspayStatus(tspayBaseUrl, payment, requestedTransactionId);
        statusJson = checked.statusJson;
        usedStatusId = checked.statusQueryId;

        if (!checked.ok) {
          return new Response(JSON.stringify({ error: "TSPay status failed", details: statusJson }), {
            status: 502,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }

        const parsedStatus = parseStatusResponse(statusJson);
        apiStatus = parsedStatus.apiStatus;
        normalized = parsedStatus.paymentStatus;
        console.log("tspay_status_resolved", {
          payment_id: payment.id,
          status_query_id: usedStatusId,
          api_status: apiStatus,
          payment_status: normalized,
        });
      }

      // Authorization: payer OR tenant member OR admin.
      if (payment.user_id !== authedUserId) {
        let allowed = false;

        if (payment.tenant_id) {
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
          const { data: userRow } = await supabase
            .from("users")
            .select("role")
            .eq("id", authedUserId)
            .maybeSingle();

          if (userRow?.role === "admin") allowed = true;
        }

        if (!allowed) {
          return new Response(JSON.stringify({ error: "Forbidden" }), {
            status: 403,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }
      }

      if (payment) {
        const { error: updateError } = await supabase
          .from("payments")
          .update({
            status: normalized,
            metadata: { ...(payment.metadata ?? {}), tspay_status_id: usedStatusId },
            provider_payload: { api_status: apiStatus, status_query_id: usedStatusId, ...statusJson },
          })
          .eq("id", payment.id);

        if (updateError) {
          return new Response(JSON.stringify({ error: "Failed to update payment", details: updateError }), {
            status: 500,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }

        if (isSuccessStatus(successStatuses, normalized) && payment.tenant_id && payment.user_id) {
          // Idempotency: claim granting by setting granted_at once.
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
            const purchaseType = normalizePurchaseType((meta as any)?.purchase_type);

            if (purchaseType === "center_tier_upgrade") {
              const grantResponse = await applyCenterTierUpgrade(supabase, payment);
              if (grantResponse) return grantResponse;
            } else if (purchaseType === "token_pack") {
              const experienceId = String((meta as any)?.experience_id ?? "");
              const qty = normalizeQuantity((meta as any)?.quantity, 500);
              const days = normalizeDays((meta as any)?.expires_in_days);
              if (!experienceId || !qty || !days) {
                await supabase
                  .from("payments")
                  .update({ granted_at: null, grant_error: "Invalid token pack metadata" })
                  .eq("id", payment.id);
                return new Response(JSON.stringify({ error: "Invalid token pack metadata" }), {
                  status: 500,
                  headers: { "Content-Type": "application/json", ...corsHeaders },
                });
              }

              const expiresAt = new Date(Date.now() + days * 86400000).toISOString();
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

              const { error: tokenErr } = await supabase.from("exam_tokens").insert(rows);
              if (tokenErr) {
                await supabase
                  .from("payments")
                  .update({ granted_at: null, grant_error: String(tokenErr.message ?? tokenErr) })
                  .eq("id", payment.id);
                return new Response(JSON.stringify({ error: "Failed to create tokens", details: tokenErr }), {
                  status: 500,
                  headers: { "Content-Type": "application/json", ...corsHeaders },
                });
              }

              await supabase
                .from("payments")
                .update({ metadata: { ...meta, tokens_created: qty } })
                .eq("id", payment.id);
            } else if (purchaseType === "seat_pack") {
              const qty = normalizeQuantity((meta as any)?.seat_count ?? (meta as any)?.quantity, 500);
              const planId = String((meta as any)?.seat_plan_id ?? payment.plan_id ?? "");
              if (!qty || !planId || !payment.tenant_id) {
                await supabase
                  .from("payments")
                  .update({ granted_at: null, grant_error: "Invalid seat pack metadata" })
                  .eq("id", payment.id);
                return new Response(JSON.stringify({ error: "Invalid seat pack metadata" }), {
                  status: 500,
                  headers: { "Content-Type": "application/json", ...corsHeaders },
                });
              }

              const { data: planRow } = await supabase
                .from("plans")
                .select("id, product_id, duration_days")
                .eq("id", planId)
                .maybeSingle();
              if (!planRow?.id) {
                await supabase
                  .from("payments")
                  .update({ granted_at: null, grant_error: "Plan not found for seat pack" })
                  .eq("id", payment.id);
                return new Response(JSON.stringify({ error: "Plan not found" }), {
                  status: 500,
                  headers: { "Content-Type": "application/json", ...corsHeaders },
                });
              }

              const expiresAt = new Date(Date.now() + 30 * 86400000).toISOString();
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

              const { error: seatErr } = await supabase.from("seat_licenses").insert(seats);
              if (seatErr) {
                await supabase
                  .from("payments")
                  .update({ granted_at: null, grant_error: String(seatErr.message ?? seatErr) })
                  .eq("id", payment.id);
                return new Response(JSON.stringify({ error: "Failed to create seats", details: seatErr }), {
                  status: 500,
                  headers: { "Content-Type": "application/json", ...corsHeaders },
                });
              }
            } else if (payment.product_id) {
              // Standard plan purchase -> entitlements
              let terms: ResolvedGrantTerms;
              try {
                terms = await resolveGrantTerms(supabase, payment);
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                await supabase.from("payments").update({ granted_at: null, grant_error: msg }).eq("id", payment.id);
                return new Response(JSON.stringify({ error: msg }), {
                  status: 500,
                  headers: { "Content-Type": "application/json", ...corsHeaders },
                });
              }

              const entitlementValue = buildEntitlementValue(terms.sourcePlanId ?? payment.plan_id, terms.limits);
              const targetProductIds = getEntitlementTargets(payment.product_id, terms.includedProductIds);

              const { data: existingRows } = await supabase
                .from("entitlements")
                .select("resource_id, ends_at")
                .eq("tenant_id", payment.tenant_id)
                .eq("resource_type", "product")
                .in("resource_id", targetProductIds);

              const existingMap = new Map<string, string | null>();
              (existingRows ?? []).forEach((row: any) => {
                if (row?.resource_id) existingMap.set(String(row.resource_id), row?.ends_at ?? null);
              });

              const payload = targetProductIds.map((pid) => {
                let targetEndsAt: string | null = null;
                if (terms.durationDays && terms.durationDays > 0) {
                  const nowMs = Date.now();
                  const existing = existingMap.get(pid);
                  const baseMs = existing ? Math.max(nowMs, Date.parse(existing)) : nowMs;
                  targetEndsAt = new Date(baseMs + terms.durationDays * 24 * 60 * 60 * 1000).toISOString();
                }

                return {
                  user_id: payment.user_id,
                  tenant_id: payment.tenant_id,
                  resource_type: "product",
                  resource_id: pid,
                  is_active: true,
                  starts_at: nowIso,
                  ends_at: targetEndsAt,
                  source: "tspay",
                  value: entitlementValue,
                };
              });

              const { error: grantError } = await supabase.from("entitlements").upsert(payload, {
                onConflict: "tenant_id,resource_type,resource_id",
              });

              if (grantError) {
                await supabase
                  .from("payments")
                  .update({ granted_at: null, grant_error: String(grantError.message ?? grantError) })
                  .eq("id", payment.id);

                return new Response(JSON.stringify({ error: "Failed to grant entitlement", details: grantError }), {
                  status: 500,
                  headers: { "Content-Type": "application/json", ...corsHeaders },
                });
              }

              // Best-effort: record coupon redemption for admin/support.
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
                const { error: redErr } = await supabase.from("coupon_redemptions").upsert(
                  {
                    coupon_id: payment.coupon_id,
                    payment_id: payment.id,
                    context_id: payment.id,
                    user_id: payment.user_id,
                    tenant_id: payment.tenant_id,
                    status: "applied",
                    redeemed_at: redeemedAt,
                    snapshot,
                    metadata: { provider: "tspay", provider_transaction_id: usedStatusId },
                  },
                  { onConflict: "coupon_id,user_id,context_id" },
                );
                // Ignore duplicates (idempotency).
                if (redErr && String((redErr as any).code ?? "") !== "23505") {
                  // non-fatal
                }
              }
            }
          }

          if (normalizeMoney(payment.credit_amount) > 0) {
            await supabase.rpc("consume_platform_credit", { p_payment_id: payment.id, p_metadata: {} });
          }

          await issueReferralReward(supabase, payment);
        } else if (isTerminalFailureStatus(normalized)) {
          await supabase.rpc("release_platform_credit", {
            p_payment_id: payment.id,
            p_reason: normalized,
          });
        }
      }

      return new Response(
        JSON.stringify({
          status: normalized,
          api_status: apiStatus,
          status_query_id: usedStatusId,
          credit_amount: payment.credit_amount ?? 0,
          referral_discount_amount: payment.referral_discount_amount ?? 0,
          final_amount: payment.amount ?? 0,
        }),
        {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
        },
      );
    }

    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
