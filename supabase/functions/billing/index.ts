import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Json = Record<string, unknown>;

type PlanRow = {
  id: string;
  product_id: string;
  name: string;
  amount: number;
  currency: string;
  duration_days: number | null;
  is_active: boolean;
  metadata: Json;
  created_at: string;
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
  constraints: Json | null;
};

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const getEnv = (key: string): string => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Missing env var: ${key}`);
  return value;
};

const getBearerToken = (req: Request): string | null => {
  const header = req.headers.get("Authorization") ?? "";
  if (!header) return null;
  return header.startsWith("Bearer ") ? header.slice(7) : header;
};

const normalizeCouponCode = (raw: string | null): string | null => {
  const code = String(raw ?? "").trim();
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
  sb: ReturnType<typeof createClient>,
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

const hasPriorPaidPayment = async (sb: ReturnType<typeof createClient>, userId: string): Promise<boolean> => {
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
  sb: ReturnType<typeof createClient>,
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  try {
    const supabaseUrl = getEnv("SUPABASE_URL");
    const supabaseServiceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

    const token = getBearerToken(req);
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const sb = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });
    const { data: authData, error: authError } = await sb.auth.getUser(token);
    if (authError || !authData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const url = new URL(req.url);

    if (url.pathname.endsWith("/plans")) {
      const productId = url.searchParams.get("product_id");
      if (!productId) {
        return new Response(JSON.stringify({ error: "product_id is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const { data: plans, error: plansError } = await sb
        .from("plans")
        .select("id, product_id, name, amount, currency, duration_days, is_active, metadata, created_at")
        .eq("product_id", productId)
        .eq("is_active", true)
        .order("created_at", { ascending: true });

      if (plansError) {
        return new Response(JSON.stringify({ error: "Failed to load plans", details: plansError }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const rows = (plans ?? []) as PlanRow[];
      rows.sort((a, b) => {
        const ao = Number((a.metadata as any)?.display_order ?? NaN);
        const bo = Number((b.metadata as any)?.display_order ?? NaN);
        if (Number.isFinite(ao) && Number.isFinite(bo) && ao !== bo) return ao - bo;
        if (Number.isFinite(ao) && !Number.isFinite(bo)) return -1;
        if (!Number.isFinite(ao) && Number.isFinite(bo)) return 1;
        return String(a.created_at).localeCompare(String(b.created_at));
      });

      return new Response(JSON.stringify({ plans: rows }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (url.pathname.endsWith("/quote")) {
      const planId = url.searchParams.get("plan_id");
      if (!planId) {
        return new Response(JSON.stringify({ error: "plan_id is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const couponCode = normalizeCouponCode(url.searchParams.get("coupon_code"));

      const { data: planRow, error: planError } = await sb
        .from("plans")
        .select("id, product_id, name, amount, currency, duration_days, is_active, metadata, created_at")
        .eq("id", planId)
        .eq("is_active", true)
        .maybeSingle();

      if (planError) {
        return new Response(JSON.stringify({ error: "Failed to load plan", details: planError }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      if (!planRow) {
        return new Response(JSON.stringify({ error: "Plan not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const plan = planRow as PlanRow;
      const original = Number(plan.amount);
      if (!Number.isFinite(original) || original <= 0) {
        return new Response(JSON.stringify({ error: "Invalid plan amount" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      if (!couponCode) {
        return new Response(
          JSON.stringify({
            plan: { id: plan.id, name: plan.name, amount: plan.amount, currency: plan.currency, duration_days: plan.duration_days },
            coupon: null,
            pricing: { original_amount: original, discount_amount: 0, final_amount: original },
          }),
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
        );
      }

      const { data: couponRow, error: couponError } = await sb
        .from("coupons")
        .select(
          "id, code, discount_type, value, currency, product_id, plan_id, is_active, status, starts_at, ends_at, max_redemptions, max_per_user, min_amount, first_purchase_only, stacking_policy, effects, constraints",
        )
        .eq("code", couponCode)
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

      const coupon = couponRow as CouponRow;
      const validation = await validateCoupon(sb, coupon, plan, authData.user.id);
      if (!validation.ok) {
        return new Response(JSON.stringify({ error: validation.error, error_code: validation.error_code }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      return new Response(
        JSON.stringify({
          plan: { id: plan.id, name: plan.name, amount: plan.amount, currency: plan.currency, duration_days: plan.duration_days },
          coupon: { id: coupon.id, code: coupon.code, discount_type: coupon.discount_type, value: coupon.value, currency: coupon.currency },
          pricing: validation.pricing,
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
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
