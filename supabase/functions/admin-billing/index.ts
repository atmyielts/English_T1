import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authorizeAdminRequest } from "../_shared/admin-access.ts";

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

type ProductRow = {
  id: string;
  name: string;
  status: string;
};

type DbErrorLike = {
  message?: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
};

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
};

const MAX_INT32 = 2147483647;

const getEnv = (key: string): string => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Missing env var: ${key}`);
  return value;
};

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

const normalizeMetadata = (v: unknown): Json => {
  if (!v) return {};
  if (!isObject(v)) return {};
  return v as Json;
};

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

const isPositiveInt32 = (value: number): boolean => Number.isInteger(value) && value > 0 && value <= MAX_INT32;

const loadProduct = async (sb: any, productId: string): Promise<ProductRow | null> => {
  const { data, error } = await sb.from("products").select("id, name, status").eq("id", productId).maybeSingle();
  if (error) throw error;
  return (data ?? null) as ProductRow | null;
};

const productStatusError = (product: ProductRow): Response =>
  json(400, {
    error: `Cannot create an active plan for "${product.name}" while the service is ${product.status}.`,
    hint: "Reactivate the service first, or create the plan as inactive.",
  });

const dbErrorResponse = (err: unknown): Response | null => {
  if (!err || typeof err !== "object") return null;
  const { message, code, details, hint } = err as DbErrorLike;
  if (!message) return null;
  if (["22P02", "23503", "23505", "23514", "P0001"].includes(String(code ?? ""))) {
    return json(400, {
      error: message,
      code: code ?? null,
      details: details ?? null,
      hint: hint ?? null,
    });
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
      requiredPermission: "admin.billing.manage",
      action: "admin.billing",
    });
    if (!authz.ok) return authz.response;

    const url = new URL(req.url);

    if (url.pathname.endsWith("/plans") && req.method === "GET") {
      const productId = url.searchParams.get("product_id");
      if (!productId) return json(400, { error: "product_id is required" });

      const { data: plans, error: plansError } = await sb
        .from("plans")
        .select("id, product_id, name, amount, currency, duration_days, is_active, metadata, created_at")
        .eq("product_id", productId)
        .order("created_at", { ascending: true });

      if (plansError) throw plansError;

      const rows = (plans ?? []) as PlanRow[];
      rows.sort((a, b) => {
        const ao = Number((a.metadata as { display_order?: unknown } | null)?.display_order ?? NaN);
        const bo = Number((b.metadata as { display_order?: unknown } | null)?.display_order ?? NaN);
        if (Number.isFinite(ao) && Number.isFinite(bo) && ao !== bo) return ao - bo;
        if (Number.isFinite(ao) && !Number.isFinite(bo)) return -1;
        if (!Number.isFinite(ao) && Number.isFinite(bo)) return 1;
        return String(a.created_at).localeCompare(String(b.created_at));
      });

      return json(200, { plans: rows });
    }

    if (url.pathname.endsWith("/plans") && req.method === "POST") {
      const body = (await req.json()) as Record<string, unknown>;
      const productId = String(body?.product_id ?? "");
      const name = String(body?.name ?? "").trim();
      const amount = Number(body?.amount ?? NaN);
      const currency = String(body?.currency ?? "UZS").trim() || "UZS";
      const durationDaysRaw = body?.duration_days;
      const durationDays = durationDaysRaw === null || typeof durationDaysRaw === "undefined" ? null : Number(durationDaysRaw);
      const isActive = typeof body?.is_active === "boolean" ? body.is_active : true;
      const metadata = normalizeMetadata(body?.metadata);

      if (!productId) return json(400, { error: "product_id is required" });
      if (!name) return json(400, { error: "name is required" });
      if (!isPositiveInt32(amount)) {
        return json(400, { error: "amount must be a positive whole number within the supported range" });
      }
      if (durationDays !== null && !isPositiveInt32(durationDays)) {
        return json(400, { error: "duration_days must be null or a positive whole number within the supported range" });
      }

      const product = await loadProduct(sb, productId);
      if (!product) return json(400, { error: "product_id is invalid" });
      if (isActive && product.status !== "active") return productStatusError(product);

      const { data: inserted, error: insertError } = await sb
        .from("plans")
        .insert({
          product_id: productId,
          name,
          amount,
          currency,
          duration_days: durationDays,
          is_active: isActive,
          metadata,
        })
        .select("id, product_id, name, amount, currency, duration_days, is_active, metadata, created_at")
        .maybeSingle();

      if (insertError) {
        const response = dbErrorResponse(insertError);
        if (response) return response;
        throw insertError;
      }

      return json(200, { plan: inserted });
    }

    if (url.pathname.endsWith("/plans") && req.method === "PATCH") {
      const body = (await req.json()) as Record<string, unknown>;
      const planId = String(body?.plan_id ?? "");
      const patch = isObject(body?.patch) ? (body.patch as Json) : {};

      if (!planId) return json(400, { error: "plan_id is required" });

      const update: Record<string, unknown> = {};
      if (typeof patch.name === "string") update.name = patch.name;
      if (typeof patch.amount !== "undefined") {
        const amount = Number(patch.amount);
        if (!isPositiveInt32(amount)) {
          return json(400, { error: "amount must be a positive whole number within the supported range" });
        }
        update.amount = amount;
      }
      if (typeof patch.currency === "string" && patch.currency.trim()) update.currency = patch.currency.trim();
      if (patch.duration_days === null) update.duration_days = null;
      if (typeof patch.duration_days !== "undefined" && patch.duration_days !== null) {
        const durationDays = Number(patch.duration_days);
        if (!isPositiveInt32(durationDays)) {
          return json(400, { error: "duration_days must be null or a positive whole number within the supported range" });
        }
        update.duration_days = durationDays;
      }
      if (typeof patch.is_active === "boolean") update.is_active = patch.is_active;
      if (patch.metadata && isObject(patch.metadata)) update.metadata = patch.metadata;

      if (Object.keys(update).length === 0) {
        return json(400, { error: "No supported fields were provided for update" });
      }

      if (update.is_active === true) {
        const { data: existingPlan, error: existingPlanError } = await sb
          .from("plans")
          .select("id, product_id")
          .eq("id", planId)
          .maybeSingle();
        if (existingPlanError) throw existingPlanError;
        if (!existingPlan) return json(404, { error: "Plan not found" });

        const product = await loadProduct(sb, String((existingPlan as { product_id?: string }).product_id ?? ""));
        if (!product) return json(400, { error: "Plan product could not be found" });
        if (product.status !== "active") return productStatusError(product);
      }

      const { data: updated, error: updateError } = await sb
        .from("plans")
        .update(update)
        .eq("id", planId)
        .select("id, product_id, name, amount, currency, duration_days, is_active, metadata, created_at")
        .maybeSingle();

      if (updateError) {
        const response = dbErrorResponse(updateError);
        if (response) return response;
        throw updateError;
      }

      return json(200, { plan: updated });
    }

    return json(404, { error: "Not found" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return json(status, { error: message });
  }
});
