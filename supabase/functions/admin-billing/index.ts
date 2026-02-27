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

const normalizeMetadata = (v: unknown): Json => {
  if (!v) return {};
  if (!isObject(v)) return {};
  return v as Json;
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
        .order("created_at", { ascending: true });

      if (plansError) throw plansError;

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

    if (url.pathname.endsWith("/plans") && req.method === "POST") {
      const body = (await req.json()) as any;
      const productId = String(body?.product_id ?? "");
      const name = String(body?.name ?? "").trim();
      const amount = Number(body?.amount ?? NaN);
      const currency = String(body?.currency ?? "UZS").trim() || "UZS";
      const durationDaysRaw = body?.duration_days;
      const durationDays = durationDaysRaw === null || typeof durationDaysRaw === "undefined" ? null : Number(durationDaysRaw);
      const isActive = typeof body?.is_active === "boolean" ? body.is_active : true;
      const metadata = normalizeMetadata(body?.metadata);

      if (!productId) {
        return new Response(JSON.stringify({ error: "product_id is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      if (!name) {
        return new Response(JSON.stringify({ error: "name is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      if (!Number.isFinite(amount) || amount <= 0) {
        return new Response(JSON.stringify({ error: "amount must be a positive number" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      if (durationDays !== null && (!Number.isFinite(durationDays) || durationDays <= 0)) {
        return new Response(JSON.stringify({ error: "duration_days must be null or a positive number" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

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

      if (insertError) throw insertError;

      return new Response(JSON.stringify({ plan: inserted }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (url.pathname.endsWith("/plans") && req.method === "PATCH") {
      const body = (await req.json()) as any;
      const planId = String(body?.plan_id ?? "");
      const patch = isObject(body?.patch) ? (body.patch as Json) : {};

      if (!planId) {
        return new Response(JSON.stringify({ error: "plan_id is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const update: any = {};
      if (typeof patch.name === "string") update.name = patch.name;
      if (typeof patch.amount === "number" && Number.isFinite(patch.amount) && patch.amount > 0) update.amount = patch.amount;
      if (typeof patch.currency === "string" && patch.currency.trim()) update.currency = patch.currency.trim();
      if (patch.duration_days === null) update.duration_days = null;
      if (typeof patch.duration_days === "number" && Number.isFinite(patch.duration_days) && patch.duration_days > 0) {
        update.duration_days = patch.duration_days;
      }
      if (typeof patch.is_active === "boolean") update.is_active = patch.is_active;
      if (patch.metadata && isObject(patch.metadata)) update.metadata = patch.metadata;

      const { data: updated, error: updateError } = await sb
        .from("plans")
        .update(update)
        .eq("id", planId)
        .select("id, product_id, name, amount, currency, duration_days, is_active, metadata, created_at")
        .maybeSingle();

      if (updateError) throw updateError;

      return new Response(JSON.stringify({ plan: updated }), {
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
