import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authorizeAdminRequest } from "../_shared/admin-access.ts";

type Json = Record<string, unknown>;

type CouponRow = {
  id: string;
  code: string;
  description: string | null;
  discount_type: "percent" | "fixed";
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
  metadata: Json;
  created_at: string;
  updated_at: string;
};

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
};

const getEnv = (key: string): string => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Missing env var: ${key}`);
  return value;
};

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

const normalizeCode = (raw: unknown): string => String(raw ?? "").trim().toUpperCase();

const normalizeMetadata = (v: unknown): Json => (isObject(v) ? (v as Json) : {});

const normalizeStatus = (raw: unknown): string => String(raw ?? "active").trim().toLowerCase();

const normalizeStackingPolicy = (raw: unknown): string => String(raw ?? "none").trim().toLowerCase();

const validateCoupon = (c: {
  discount_type: string;
  value: number;
  currency: string;
  status?: string;
  stacking_policy?: string;
  max_redemptions?: number | null;
  max_per_user?: number | null;
  min_amount?: number | null;
}): string | null => {
  const t = String(c.discount_type).trim().toLowerCase();
  if (t !== "percent" && t !== "fixed") return "discount_type must be percent or fixed";
  if (!Number.isFinite(c.value) || c.value <= 0) return "value must be a positive number";
  if (t === "percent" && (c.value < 1 || c.value > 100)) return "percent value must be 1..100";
  if (!String(c.currency).trim()) return "currency is required";
  if (c.status && !["active", "paused", "expired"].includes(String(c.status).trim().toLowerCase())) {
    return "status must be active, paused, or expired";
  }
  if (c.stacking_policy && !["none", "allow_with_same_type", "allow"].includes(String(c.stacking_policy).trim().toLowerCase())) {
    return "stacking_policy must be none, allow_with_same_type, or allow";
  }
  if (c.max_redemptions !== null && c.max_redemptions !== undefined && (!Number.isFinite(c.max_redemptions) || c.max_redemptions <= 0)) {
    return "max_redemptions must be a positive number";
  }
  if (c.max_per_user !== null && c.max_per_user !== undefined && (!Number.isFinite(c.max_per_user) || c.max_per_user <= 0)) {
    return "max_per_user must be a positive number";
  }
  if (c.min_amount !== null && c.min_amount !== undefined && (!Number.isFinite(c.min_amount) || c.min_amount < 0)) {
    return "min_amount must be >= 0";
  }
  return null;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = getEnv("SUPABASE_URL");
    const supabaseServiceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

    const sb = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });
    const authz = await authorizeAdminRequest(sb, req, corsHeaders, {
      requiredPermission: "admin.coupons.manage",
      action: "admin.coupons",
    });
    if (!authz.ok) return authz.response;

    const url = new URL(req.url);

    if (url.pathname.endsWith("/coupons") && req.method === "GET") {
      const productId = String(url.searchParams.get("product_id") ?? "").trim();
      if (!productId) {
        return new Response(JSON.stringify({ error: "product_id is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const { data: coupons, error: couponsError } = await sb
        .from("coupons")
        .select(
          "id, code, description, discount_type, value, currency, product_id, plan_id, is_active, status, starts_at, ends_at, max_redemptions, max_per_user, min_amount, first_purchase_only, stacking_policy, effects, constraints, metadata, created_at, updated_at",
        )
        .eq("product_id", productId)
        .order("created_at", { ascending: true });

      if (couponsError) throw couponsError;

      return new Response(JSON.stringify({ coupons: (coupons ?? []) as CouponRow[] }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (url.pathname.endsWith("/coupons") && req.method === "POST") {
      const body = (await req.json()) as any;
      const productId = String(body?.product_id ?? "").trim();
      const planId = body?.plan_id ? String(body.plan_id).trim() : null;
      const code = normalizeCode(body?.code);
      const description = typeof body?.description === "string" ? body.description : null;
      const discountType = String(body?.discount_type ?? "").trim().toLowerCase();
      const value = Number(body?.value ?? NaN);
      const currency = String(body?.currency ?? "UZS").trim().toUpperCase() || "UZS";
      const isActive = typeof body?.is_active === "boolean" ? body.is_active : true;
      const status = normalizeStatus(body?.status);
      const startsAt = typeof body?.starts_at === "string" ? body.starts_at : null;
      const endsAt = typeof body?.ends_at === "string" ? body.ends_at : null;
      const maxRedemptions = body?.max_redemptions === null || body?.max_redemptions === undefined
        ? null
        : Number(body.max_redemptions);
      const maxPerUser = body?.max_per_user === null || body?.max_per_user === undefined ? null : Number(body.max_per_user);
      const minAmount = body?.min_amount === null || body?.min_amount === undefined ? null : Number(body.min_amount);
      const firstPurchaseOnly = typeof body?.first_purchase_only === "boolean" ? body.first_purchase_only : false;
      const stackingPolicy = normalizeStackingPolicy(body?.stacking_policy);
      const effects = Array.isArray(body?.effects) ? body.effects : [];
      const constraints = isObject(body?.constraints) ? body.constraints : {};
      const metadata = normalizeMetadata(body?.metadata);

      if (!productId) {
        return new Response(JSON.stringify({ error: "product_id is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      if (!code) {
        return new Response(JSON.stringify({ error: "code is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const validation = validateCoupon({
        discount_type: discountType,
        value,
        currency,
        status,
        stacking_policy: stackingPolicy,
        max_redemptions: maxRedemptions,
        max_per_user: maxPerUser,
        min_amount: minAmount,
      });
      if (validation) {
        return new Response(JSON.stringify({ error: validation }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      if (planId) {
        const { data: planRow } = await sb.from("plans").select("id, product_id").eq("id", planId).maybeSingle();
        if (!planRow || String((planRow as any).product_id) !== productId) {
          return new Response(JSON.stringify({ error: "plan_id does not belong to product" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }
      }

      const { data: inserted, error: insertError } = await sb
        .from("coupons")
        .insert({
          product_id: productId,
          plan_id: planId,
          code,
          description,
          discount_type: discountType,
          value,
          currency,
          is_active: isActive,
          status,
          starts_at: startsAt,
          ends_at: endsAt,
          max_redemptions: Number.isFinite(maxRedemptions ?? NaN) ? Math.floor(maxRedemptions as number) : null,
          max_per_user: Number.isFinite(maxPerUser ?? NaN) ? Math.floor(maxPerUser as number) : null,
          min_amount: Number.isFinite(minAmount ?? NaN) ? Math.floor(minAmount as number) : null,
          first_purchase_only: firstPurchaseOnly,
          stacking_policy: stackingPolicy,
          effects,
          constraints,
          metadata,
        })
        .select(
          "id, code, description, discount_type, value, currency, product_id, plan_id, is_active, status, starts_at, ends_at, max_redemptions, max_per_user, min_amount, first_purchase_only, stacking_policy, effects, constraints, metadata, created_at, updated_at",
        )
        .maybeSingle();

      if (insertError) throw insertError;

      return new Response(JSON.stringify({ coupon: inserted ?? null }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (url.pathname.endsWith("/coupons") && req.method === "PATCH") {
      const body = (await req.json()) as any;
      const couponId = String(body?.coupon_id ?? "").trim();
      const patch = isObject(body?.patch) ? (body.patch as Json) : {};

      if (!couponId) {
        return new Response(JSON.stringify({ error: "coupon_id is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const update: any = {};

      if (typeof patch.code === "string") update.code = normalizeCode(patch.code);
      if (typeof patch.description === "string") update.description = patch.description;
      if (patch.description === null) update.description = null;

      if (typeof patch.discount_type === "string") update.discount_type = String(patch.discount_type).trim().toLowerCase();
      if (typeof patch.value === "number" && Number.isFinite(patch.value)) update.value = patch.value;
      if (typeof patch.currency === "string" && patch.currency.trim()) update.currency = String(patch.currency).trim().toUpperCase();

      if (typeof patch.is_active === "boolean") update.is_active = patch.is_active;
      if (typeof patch.status === "string") update.status = normalizeStatus(patch.status);
      if (typeof patch.starts_at === "string") update.starts_at = patch.starts_at;
      if (patch.starts_at === null) update.starts_at = null;
      if (typeof patch.ends_at === "string") update.ends_at = patch.ends_at;
      if (patch.ends_at === null) update.ends_at = null;
      if (patch.max_redemptions === null) update.max_redemptions = null;
      if (typeof patch.max_redemptions === "number" && Number.isFinite(patch.max_redemptions)) update.max_redemptions = patch.max_redemptions;
      if (patch.max_per_user === null) update.max_per_user = null;
      if (typeof patch.max_per_user === "number" && Number.isFinite(patch.max_per_user)) update.max_per_user = patch.max_per_user;
      if (patch.min_amount === null) update.min_amount = null;
      if (typeof patch.min_amount === "number" && Number.isFinite(patch.min_amount)) update.min_amount = patch.min_amount;
      if (typeof patch.first_purchase_only === "boolean") update.first_purchase_only = patch.first_purchase_only;
      if (typeof patch.stacking_policy === "string") update.stacking_policy = normalizeStackingPolicy(patch.stacking_policy);
      if (Array.isArray(patch.effects)) update.effects = patch.effects;
      if (patch.constraints && isObject(patch.constraints)) update.constraints = patch.constraints;
      if (patch.metadata && isObject(patch.metadata)) update.metadata = patch.metadata;

      if (typeof patch.plan_id === "string") update.plan_id = patch.plan_id;
      if (patch.plan_id === null) update.plan_id = null;

      // If we touched discount fields, validate. We'll fetch current row to validate safely.
      const needsValidate =
        "discount_type" in update ||
        "value" in update ||
        "currency" in update ||
        "status" in update ||
        "stacking_policy" in update ||
        "max_redemptions" in update ||
        "max_per_user" in update ||
        "min_amount" in update;

      if (needsValidate) {
        const { data: current, error: curErr } = await sb
          .from("coupons")
          .select("discount_type, value, currency, status, stacking_policy, max_redemptions, max_per_user, min_amount")
          .eq("id", couponId)
          .maybeSingle();
        if (curErr) throw curErr;
        const discountType = String((update.discount_type ?? (current as any)?.discount_type) ?? "");
        const value = Number(update.value ?? (current as any)?.value ?? NaN);
        const currency = String(update.currency ?? (current as any)?.currency ?? "UZS");
        const status = String(update.status ?? (current as any)?.status ?? "active");
        const stackingPolicy = String(update.stacking_policy ?? (current as any)?.stacking_policy ?? "none");
        const maxRedemptions = update.max_redemptions ?? (current as any)?.max_redemptions ?? null;
        const maxPerUser = update.max_per_user ?? (current as any)?.max_per_user ?? null;
        const minAmount = update.min_amount ?? (current as any)?.min_amount ?? null;
        const validation = validateCoupon({
          discount_type: discountType,
          value,
          currency,
          status,
          stacking_policy: stackingPolicy,
          max_redemptions: maxRedemptions,
          max_per_user: maxPerUser,
          min_amount: minAmount,
        });
        if (validation) {
          return new Response(JSON.stringify({ error: validation }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }
      }

      if ("plan_id" in update && update.plan_id) {
        const { data: couponRow } = await sb.from("coupons").select("product_id").eq("id", couponId).maybeSingle();
        const productId = String((couponRow as any)?.product_id ?? "");
        const { data: planRow } = await sb.from("plans").select("product_id").eq("id", update.plan_id).maybeSingle();
        if (!productId || !planRow || String((planRow as any).product_id) !== productId) {
          return new Response(JSON.stringify({ error: "plan_id does not belong to coupon product" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }
      }

      const { data: updated, error: updateError } = await sb
        .from("coupons")
        .update(update)
        .eq("id", couponId)
        .select(
          "id, code, description, discount_type, value, currency, product_id, plan_id, is_active, status, starts_at, ends_at, max_redemptions, max_per_user, min_amount, first_purchase_only, stacking_policy, effects, constraints, metadata, created_at, updated_at",
        )
        .maybeSingle();

      if (updateError) throw updateError;

      return new Response(JSON.stringify({ coupon: updated ?? null }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
