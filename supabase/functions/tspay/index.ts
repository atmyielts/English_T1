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
  metadata?: Record<string, unknown> | null;
  coupon_code?: string | null;
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
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const getEnv = (key: string): string => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Missing env var: ${key}`);
  return value;
};

const parseSuccessStatuses = (raw: string | undefined): Set<string> => {
  // IMPORTANT:
  // TsPay responses often include a top-level { status: "success" } meaning "API call ok",
  // while the *payment* status is in data.pay_status (e.g. "paid"). Default to "paid".
  const list = (raw ?? "paid,success,completed").split(",").map((v) => v.trim().toLowerCase());
  return new Set(list.filter(Boolean));
};

const normalizePurchaseType = (raw: unknown): string => String(raw ?? "").trim().toLowerCase();

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

const fetchShopAccessToken = async (baseUrl: string): Promise<string> => {
  const directToken = Deno.env.get("TSPAY_SHOP_ACCESS_TOKEN");
  if (directToken) return directToken;

  const email = Deno.env.get("TSPAY_EMAIL");
  const password = Deno.env.get("TSPAY_PASSWORD");
  if (!email || !password) {
    throw new Error("Missing TSPAY_SHOP_ACCESS_TOKEN or TSPAY_EMAIL/TSPAY_PASSWORD");
  }

  const loginRes = await fetch(`${baseUrl}/auth/login/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const loginJson = await loginRes.json();
  if (!loginRes.ok || !loginJson?.access_token) {
    throw new Error("TSPay login failed");
  }

  const userToken = loginJson.access_token as string;

  const shopRes = await fetch(`${baseUrl}/shops/access-token/`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${userToken}`,
      "Content-Type": "application/json",
    },
  });

  const shopJson = await shopRes.json();
  const shopToken = shopJson?.shops?.[0]?.access_token as string | undefined;
  if (!shopRes.ok || !shopToken) {
    throw new Error("TSPay shop access token fetch failed");
  }

  return shopToken;
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
  const tx = createJson?.transaction ?? null;
  if (!tx) return null;

  // Newer docs: transaction.id + transaction.url
  // Older / existing code: transaction.cheque_id + transaction.payment_url
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = getEnv("SUPABASE_URL");
    const supabaseServiceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
    const tspayBaseUrl = Deno.env.get("TSPAY_BASE_URL") ?? "https://tspay.uz/api/v1";
    const successStatuses = parseSuccessStatuses(Deno.env.get("TSPAY_SUCCESS_STATUSES"));
    const shopAccessToken = await fetchShopAccessToken(tspayBaseUrl);

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

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

    const url = new URL(req.url);

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

      if (!Number.isFinite(amount) || amount <= 0) {
        return new Response(JSON.stringify({ error: "Invalid final amount" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const createRes = await fetch(`${tspayBaseUrl}/transactions/create/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          access_token: shopAccessToken,
          // Official docs call this "comment"; older docs use "description".
          comment: body.description,
          description: body.description,
        }),
      });

      const createJson = await createRes.json();
      if (!createRes.ok) {
        return new Response(JSON.stringify({ error: "TSPay create failed", details: createJson }), {
          status: 502,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const parsed = parseCreateResponse(createJson);
      if (!parsed) {
        return new Response(JSON.stringify({ error: "Missing transaction data" }), {
          status: 502,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const { paymentUrl, preferredStatusId, rawIds } = parsed;
      const providerId = preferredStatusId || (rawIds[0] ?? null);

      if (!providerId) {
        return new Response(JSON.stringify({ error: "Missing transaction id" }), {
          status: 502,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const metadata: Record<string, unknown> = {
        ...(body.metadata ?? {}),
      };

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

      const { error: insertError } = await supabase
        .from("payments")
        .insert({
          provider: "tspay",
          provider_transaction_id: providerId,
          amount,
          original_amount: originalAmount,
          discount_amount: discountAmount,
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
            tspay_ids: rawIds,
            tspay_payment_url: paymentUrl,
          },
          provider_payload: createJson,
        });

      if (insertError) {
        return new Response(JSON.stringify({ error: "Failed to record payment", details: insertError }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      return new Response(
        JSON.stringify({
          payment_url: paymentUrl,
          transaction_id: providerId,
          amount,
          currency,
          original_amount: originalAmount,
          discount_amount: discountAmount,
          coupon_code: couponCode,
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

      const { data: paymentRow, error: paymentError } = await supabase
        .from("payments")
        .select(
          "id, provider_transaction_id, user_id, tenant_id, product_id, plan_id, status, granted_at, coupon_id, coupon_code, original_amount, discount_amount, plan_snapshot, entitlement_terms, metadata, amount, currency",
        )
        .eq("provider", "tspay")
        .eq("provider_transaction_id", requestedTransactionId)
        .maybeSingle();

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

      const tspayIdsFromMeta = Array.isArray((payment.metadata as any)?.tspay_ids)
        ? ((payment.metadata as any).tspay_ids as unknown[]).map((v) => String(v))
        : [];
      const hintedStatusId = String((payment.metadata as any)?.tspay_status_id ?? "").trim();
      const candidateIds = uniqIds([
        hintedStatusId,
        requestedTransactionId,
        payment.provider_transaction_id,
        ...tspayIdsFromMeta,
      ]);
      console.log("tspay_status_candidates", {
        payment_id: payment.id,
        requested_transaction_id: requestedTransactionId,
        candidate_ids: candidateIds,
      });

      let statusJson: any = null;
      let statusRes: Response | null = null;
      let statusText = "";
      let usedStatusId = candidateIds[0] ?? requestedTransactionId;

      const fetchStatusJson = async (statusId: string): Promise<{ ok: boolean; json: any | null; text: string; response: Response }> => {
        const statusUrl = new URL(`${tspayBaseUrl}/transactions/${statusId}/`);
        statusUrl.searchParams.set("access_token", shopAccessToken);

        let res = await fetch(statusUrl.toString(), { method: "GET" });
        if (!res.ok) {
          // Backwards compatible fallback (older variants used Authorization: Bearer).
          res = await fetch(`${tspayBaseUrl}/transactions/${statusId}/`, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${shopAccessToken}`,
              "Content-Type": "application/json",
            },
          });
        }

        const text = await res.text();
        try {
          return { ok: true, json: JSON.parse(text), text, response: res };
        } catch {
          return { ok: false, json: null, text, response: res };
        }
      };

      for (const candidateId of candidateIds) {
        const checked = await fetchStatusJson(candidateId);
        statusRes = checked.response;
        statusText = checked.text;
        if (!checked.ok) continue;
        statusJson = checked.json;
        usedStatusId = candidateId;
        break;
      }

      if (!statusJson || !statusRes) {
        console.error("tspay_status_invalid_json", {
          payment_id: payment.id,
          requested_transaction_id: requestedTransactionId,
          body_preview: statusText.slice(0, 300),
        });
        return new Response(JSON.stringify({ error: "TSPay status returned invalid JSON", body: statusText.slice(0, 300) }), {
          status: 502,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      if (!statusRes.ok) {
        return new Response(JSON.stringify({ error: "TSPay status failed", details: statusJson }), {
          status: 502,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const { paymentStatus, apiStatus } = parseStatusResponse(statusJson);
      const normalized = paymentStatus;
      console.log("tspay_status_resolved", {
        payment_id: payment.id,
        status_query_id: usedStatusId,
        api_status: apiStatus,
        payment_status: normalized,
      });

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

            if (purchaseType === "token_pack") {
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
        }
      }

      return new Response(
        JSON.stringify({
          status: normalized,
          api_status: apiStatus,
          status_query_id: usedStatusId,
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
