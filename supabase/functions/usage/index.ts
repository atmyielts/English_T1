import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Json = Record<string, unknown>;

type EntitlementRow = {
  id: string;
  tenant_id: string;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
  value: Json | null;
};

type LimitEntry = { key: string; limit: number | null; remaining: number | null; total: number | null; unlimited: boolean };

type ConsumeResult = { allowed: boolean; remaining: number | null; total: number | null };

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

const getBearerToken = (req: Request): string | null => {
  const header = req.headers.get("Authorization") ?? "";
  if (!header) return null;
  return header.startsWith("Bearer ") ? header.slice(7) : header;
};

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

const isActiveEntitlement = (row: { starts_at: string | null; ends_at: string | null; is_active: boolean }): boolean => {
  if (!row.is_active) return false;
  const now = Date.now();
  const startsAt = row.starts_at ? Date.parse(row.starts_at) : null;
  const endsAt = row.ends_at ? Date.parse(row.ends_at) : null;
  if (startsAt && now < startsAt) return false;
  if (endsAt && now > endsAt) return false;
  return true;
};

const extractLimits = (value: unknown): Record<string, number> => {
  if (!isObject(value)) return {};
  const raw = (value as any).limits;
  if (!isObject(raw)) return {};
  const out: Record<string, number> = {};
  for (const [key, val] of Object.entries(raw)) {
    const num = typeof val === "number" ? val : Number(val);
    if (Number.isFinite(num) && num > 0) out[String(key)] = Math.floor(num);
  }
  return out;
};

const monthWindow = (now = new Date()): { start: string; end: string } => {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
};

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...corsHeaders } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = getEnv("SUPABASE_URL");
    const supabaseServiceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

    const token = getBearerToken(req);
    if (!token) return json(401, { error: "Unauthorized" });

    const sb = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });

    const { data: authData, error: authError } = await sb.auth.getUser(token);
    if (authError || !authData?.user) return json(401, { error: "Unauthorized" });

    const authedUserId = authData.user.id;

    const { data: userRow } = await sb.from("users").select("role").eq("id", authedUserId).maybeSingle();
    const isAdmin = String((userRow as any)?.role ?? "").toLowerCase() === "admin";

    const url = new URL(req.url);

    if (req.method === "GET") {
      const productId = String(url.searchParams.get("product_id") ?? "");
      if (!productId) return json(400, { error: "product_id is required" });

      const keysRaw = String(url.searchParams.get("keys") ?? "").trim();
      const requestedKeys = keysRaw ? keysRaw.split(",").map((k) => k.trim()).filter(Boolean) : null;

      if (isAdmin) {
        const window = monthWindow();
        return json(200, { period_start: window.start, period_end: window.end, items: [] });
      }

      const { data: memberships, error: membershipError } = await sb
        .from("tenant_memberships")
        .select("tenant_id")
        .eq("user_id", authedUserId)
        .eq("status", "active")
        .order("created_at", { ascending: true });

      if (membershipError) return json(500, { error: "Failed to load memberships", details: membershipError });
      const tenantId = (memberships ?? [])[0]?.tenant_id ?? null;
      if (!tenantId) return json(403, { error: "No active tenant membership" });

      const { data: entitlement, error: entErr } = await sb
        .from("entitlements")
        .select("id, tenant_id, starts_at, ends_at, is_active, value")
        .eq("tenant_id", tenantId)
        .eq("resource_type", "product")
        .eq("resource_id", productId)
        .eq("is_active", true)
        .maybeSingle();

      if (entErr) return json(500, { error: "Failed to load entitlements", details: entErr });
      if (!entitlement || !isActiveEntitlement(entitlement as EntitlementRow)) {
        return json(403, { error: "No entitlement for product" });
      }

      const limits = extractLimits((entitlement as any).value);
      const keys = requestedKeys ?? Object.keys(limits);

      const { start, end } = monthWindow();

      if (keys.length === 0) {
        return json(200, { period_start: start, period_end: end, items: [] });
      }

      const { data: counterRows, error: counterErr } = await sb
        .from("usage_counters")
        .select("capability_key, remaining, total")
        .eq("tenant_id", tenantId)
        .eq("product_id", productId)
        .eq("period_start", start)
        .in("capability_key", keys);

      if (counterErr) return json(500, { error: "Failed to load counters", details: counterErr });

      const counterMap = new Map<string, { remaining: number; total: number }>();
      (counterRows ?? []).forEach((row: any) => {
        counterMap.set(String(row.capability_key), { remaining: Number(row.remaining), total: Number(row.total) });
      });

      const items: LimitEntry[] = keys.map((key) => {
        const limit = limits[key];
        if (!limit || limit <= 0) {
          return { key, limit: null, remaining: null, total: null, unlimited: true };
        }
        const counter = counterMap.get(key);
        return {
          key,
          limit,
          remaining: counter ? counter.remaining : limit,
          total: counter ? counter.total : limit,
          unlimited: false,
        };
      });

      return json(200, { period_start: start, period_end: end, items });
    }

    if (req.method === "POST") {
      const body = (await req.json()) as any;
      const productId = String(body?.product_id ?? "");
      const capabilityKey = String(body?.capability_key ?? "");
      const amount = Number(body?.amount ?? 1);

      if (!productId || !capabilityKey) {
        return json(400, { error: "product_id and capability_key are required" });
      }

      if (isAdmin) {
        return json(200, { allowed: true, remaining: null, total: null, unlimited: true });
      }

      const { data: memberships, error: membershipError } = await sb
        .from("tenant_memberships")
        .select("tenant_id")
        .eq("user_id", authedUserId)
        .eq("status", "active")
        .order("created_at", { ascending: true });

      if (membershipError) return json(500, { error: "Failed to load memberships", details: membershipError });
      const tenantId = (memberships ?? [])[0]?.tenant_id ?? null;
      if (!tenantId) return json(403, { error: "No active tenant membership" });

      const { data: entitlement, error: entErr } = await sb
        .from("entitlements")
        .select("id, tenant_id, starts_at, ends_at, is_active, value")
        .eq("tenant_id", tenantId)
        .eq("resource_type", "product")
        .eq("resource_id", productId)
        .eq("is_active", true)
        .maybeSingle();

      if (entErr) return json(500, { error: "Failed to load entitlements", details: entErr });
      if (!entitlement || !isActiveEntitlement(entitlement as EntitlementRow)) {
        return json(403, { error: "No entitlement for product" });
      }

      const limits = extractLimits((entitlement as any).value);
      const limit = limits[capabilityKey];
      if (!limit || limit <= 0) {
        return json(200, { allowed: true, remaining: null, total: null, unlimited: true });
      }

      const { start, end } = monthWindow();

      const { data: result, error: rpcErr } = await sb.rpc("consume_usage_counter", {
        p_tenant_id: tenantId,
        p_product_id: productId,
        p_capability_key: capabilityKey,
        p_period_start: start,
        p_period_end: end,
        p_amount: Number.isFinite(amount) && amount > 0 ? Math.floor(amount) : 1,
        p_total: limit,
      });

      if (rpcErr) return json(500, { error: "Failed to consume usage", details: rpcErr });

      const row = Array.isArray(result) ? result[0] : result;
      const allowed = Boolean(row?.allowed);
      const remaining = row?.remaining ?? null;
      const total = row?.total ?? null;

      if (!allowed) {
        return json(429, { error: "Usage limit reached", code: "usage_limit_reached", remaining, total });
      }

      return json(200, { allowed: true, remaining, total, unlimited: false });
    }

    return json(405, { error: "Method not allowed" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return json(500, { error: message });
  }
});
