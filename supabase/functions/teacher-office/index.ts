import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { assignPurchasedSeat } from "./assignment.ts";

type Json = Record<string, unknown>;

type MembershipRow = { tenant_id: string; role: string; status: string };

type ExperienceRow = {
  id: string;
  name: string;
  is_active: boolean;
  product_id: string;
  price_amount?: number | null;
  price_currency?: string | null;
  products?: { name: string | null; slug: string | null } | null;
};

type TokenRow = {
  id: string;
  token_code: string;
  status: string;
  expires_at: string;
  created_at: string;
  experience_id: string;
  uses_count: number;
  max_uses: number;
  claimed_by: string | null;
};

type PlanRow = {
  id: string;
  product_id: string;
  name: string;
  amount: number;
  currency: string;
  duration_days: number | null;
  metadata?: Json | null;
  products?: { name: string | null; slug: string | null } | null;
};

type SeatRow = {
  id: string;
  status: string;
  expires_at: string;
  assigned_at: string | null;
  starts_at: string | null;
  ends_at: string | null;
  plan_id: string;
  product_id: string;
  assigned_user_id: string | null;
  assigned_user?: { email: string | null } | null;
  plans?: { name: string | null; duration_days: number | null } | null;
};

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...corsHeaders } });

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

const normalizeDays = (value: unknown): number | null => {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return null;
  const days = Math.floor(num);
  if (days < 1) return null;
  if (days > 30) return null;
  return days;
};

const randomCode = (len = 10): string => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
};

const ensureUniqueCode = async (
  sb: SupabaseClient<any>,
  attempts = 8,
): Promise<string> => {
  for (let i = 0; i < attempts; i += 1) {
    const code = randomCode(10);
    const { data } = await sb.from("exam_tokens").select("id").eq("token_code", code).maybeSingle();
    if (!data) return code;
  }
  throw new Error("Failed to generate unique code");
};

const loadMemberships = async (sb: SupabaseClient<any>, userId: string): Promise<MembershipRow[]> => {
  const { data, error } = await sb
    .from("tenant_memberships")
    .select("tenant_id, role, status")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: true });
  if (error) throw new Error("Failed to load memberships");
  return (data ?? []) as MembershipRow[];
};

const looksLikeUuid = (value: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

const extractIncludedProductIds = (meta: unknown): string[] => {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return [];
  const raw = (meta as any).included_product_ids;
  if (!Array.isArray(raw)) return [];
  return raw.map((v) => String(v)).filter((v) => looksLikeUuid(v));
};

const extractPlanLimits = (meta: unknown): Record<string, number> => {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return {};
  const raw = (meta as any).limits;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};
  Object.entries(raw as Record<string, unknown>).forEach(([key, value]) => {
    const num = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(num) && num > 0) out[String(key)] = Math.floor(num);
  });
  return out;
};

const buildEntitlementValue = (planId: string | null | undefined, planMeta: unknown): Record<string, unknown> => {
  const value: Record<string, unknown> = {};
  if (planId) value.plan_id = planId;
  const limits = extractPlanLimits(planMeta);
  if (Object.keys(limits).length > 0) value.limits = limits;
  return value;
};

const getEntitlementTargets = (productId: string, planMeta: unknown): string[] => {
  const included = extractIncludedProductIds(planMeta ?? null);
  const set = new Set<string>([productId, ...included]);
  return Array.from(set);
};

const findPersonalTenant = async (sb: SupabaseClient<any>, userId: string): Promise<string | null> => {
  const { data, error } = await sb
    .from("tenant_memberships")
    .select("tenant_id, tenants ( type )")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as any[];
  const personal = rows.find((r) => String(r?.tenants?.type ?? "") === "personal");
  if (personal?.tenant_id) return String(personal.tenant_id);
  return rows[0]?.tenant_id ? String(rows[0].tenant_id) : null;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = getEnv("SUPABASE_URL");
    const serviceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

    const token = getBearerToken(req);
    if (!token) return json(401, { error: "Unauthorized" });

    const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const { data: authData, error: authError } = await sb.auth.getUser(token);
    if (authError || !authData?.user) return json(401, { error: "Unauthorized" });

    const authedUserId = authData.user.id;
    const memberships = await loadMemberships(sb, authedUserId);
    if (memberships.length === 0) return json(403, { error: "No active tenant" });

    const url = new URL(req.url);
    const action = url.searchParams.get("action") ?? "";

    if (req.method === "GET" && action === "experiences") {
      const { data, error } = await sb
        .from("experiences")
        .select("id, name, is_active, product_id, price_amount, price_currency")
        .eq("is_active", true)
        .order("created_at", { ascending: false });
      if (error) return json(500, { error: "Failed to load experiences", detail: error.message });

      const rows = (data ?? []) as ExperienceRow[];
      const productIds = Array.from(
        new Set(rows.map((row) => row.product_id).filter((id): id is string => Boolean(id))),
      );

      if (productIds.length > 0) {
        const { data: products, error: productError } = await sb
          .from("products")
          .select("id, name")
          .in("id", productIds);
        if (!productError && products) {
          const map = new Map<string, { name: string | null; slug: string | null }>();
          for (const product of products as any[]) {
            map.set(String(product.id), { name: product.name ?? null, slug: null });
          }
          for (const row of rows) {
            const product = map.get(String(row.product_id));
            if (product) row.products = product;
          }
        }
      }

      return json(200, { experiences: rows });
    }

    if (req.method === "GET" && action === "plans") {
      const { data, error } = await sb
        .from("plans")
        .select("id, product_id, name, amount, currency, duration_days, metadata, is_active, products ( name )")
        .eq("is_active", true)
        .order("created_at", { ascending: true });
      if (error) return json(500, { error: "Failed to load plans", detail: error.message });
      return json(200, { plans: data ?? [] });
    }

    if (req.method === "GET" && action === "tokens") {
      const tenantId = url.searchParams.get("tenant_id") || memberships[0].tenant_id;
      const { data, error } = await sb
        .from("exam_tokens")
        .select(
          "id, token_code, status, expires_at, created_at, experience_id, uses_count, max_uses, claimed_by, experiences ( name, product_id )",
        )
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });
      if (error) return json(500, { error: "Failed to load tokens", detail: error.message });
      return json(200, { tokens: (data ?? []) as TokenRow[] });
    }

    if (req.method === "GET" && action === "results") {
      const tenantId = url.searchParams.get("tenant_id") || memberships[0].tenant_id;
      const tokenId = url.searchParams.get("token_id");

      let query = sb
        .from("exam_registrations")
        .select(
          "id, token_id, status, created_at, first_name, last_name, legal_name, email, phone, session_id, experiences ( name ), exam_tokens ( token_code ), sessions!exam_registrations_session_id_fkey ( status )",
        )
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });

      if (tokenId) query = query.eq("token_id", tokenId);

      const { data, error } = await query;
      if (error) return json(500, { error: "Failed to load results", detail: error.message });

      const rows = (data ?? []) as any[];
      const sessionIds = rows.map((row) => row.session_id).filter(Boolean);

      const evalMap = new Map<string, any>();
      if (sessionIds.length > 0) {
        const { data: evalRows } = await sb
          .from("evaluations")
          .select("session_id, method, status, result")
          .in("session_id", sessionIds);
        for (const row of evalRows ?? []) {
          const sid = String((row as any).session_id ?? "");
          if (!sid) continue;
          const existing = evalMap.get(sid);
          if (!existing || (row as any).method === "auto") {
            evalMap.set(sid, row);
          }
        }
      }

      const results = rows.map((row) => {
        const evaluation = evalMap.get(String(row.session_id ?? "")) ?? null;
        const overallScore = evaluation?.result?.overall_score ?? null;
        const overallBand = evaluation?.result?.overall_band ?? overallScore ?? null;
        return {
          id: row.id,
          token_id: row.token_id,
          token_code: row.exam_tokens?.token_code ?? null,
          experience_name: row.experiences?.name ?? null,
          candidate_name: row.legal_name || `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim(),
          email: row.email,
          phone: row.phone,
          session_id: row.session_id,
          session_status: row.sessions?.status ?? null,
          registration_status: row.status,
          overall_score: overallScore,
          overall_band: overallBand,
          created_at: row.created_at,
        };
      });

      return json(200, { results });
    }

    if (req.method === "GET" && action === "seats") {
      const tenantId = url.searchParams.get("tenant_id") || memberships[0].tenant_id;
      const { data, error } = await sb
        .from("seat_licenses")
        .select(
          "id, status, expires_at, assigned_at, starts_at, ends_at, plan_id, product_id, assigned_user_id, plans ( name, duration_days ), assigned_user:users!seat_licenses_assigned_user_id_fkey ( email )",
        )
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });
      if (error) return json(500, { error: "Failed to load seats", detail: error.message });
      return json(200, { seats: data ?? [] });
    }

    if (req.method === "POST") {
      const body = (await req.json()) as Json;
      const actionBody = String(body?.action ?? "");

      if (actionBody === "assign_seat") {
        const tenantId = String(body?.tenant_id ?? memberships[0].tenant_id ?? "");
        if (!tenantId) return json(400, { error: "tenant_id is required" });

        const membership = memberships.find((m) => m.tenant_id === tenantId);
        if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
          return json(403, { error: "Forbidden" });
        }

        const result = await assignPurchasedSeat(sb, authedUserId, tenantId, body);
        return json(result.status, result.body);
      }

      if (actionBody === "create_token") {
        return json(400, { error: "Tokens require payment. Use the purchase flow." });
      }

      return json(400, { error: "Unknown action" });
    }

    return json(404, { error: "Not found" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return json(500, { error: message });
  }
});
