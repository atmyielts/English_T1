import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  sb: ReturnType<typeof createClient>,
  attempts = 8,
): Promise<string> => {
  for (let i = 0; i < attempts; i += 1) {
    const code = randomCode(10);
    const { data } = await sb.from("exam_tokens").select("id").eq("token_code", code).maybeSingle();
    if (!data) return code;
  }
  throw new Error("Failed to generate unique code");
};

const loadMemberships = async (sb: ReturnType<typeof createClient>, userId: string): Promise<MembershipRow[]> => {
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

const findPersonalTenant = async (sb: ReturnType<typeof createClient>, userId: string): Promise<string | null> => {
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
      return json(200, { plans: (data ?? []) as PlanRow[] });
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
      return json(200, { seats: (data ?? []) as SeatRow[] });
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

        const seatId = String(body?.seat_id ?? "");
        const email = String(body?.email ?? "").trim().toLowerCase();
        if (!seatId) return json(400, { error: "seat_id is required" });
        if (!email) return json(400, { error: "email is required" });

        const { data: seat, error: seatErr } = await sb
          .from("seat_licenses")
          .select("id, tenant_id, plan_id, product_id, status, expires_at")
          .eq("id", seatId)
          .maybeSingle();
        if (seatErr) return json(500, { error: "Failed to load seat", detail: seatErr.message });
        if (!seat || seat.tenant_id !== tenantId) return json(404, { error: "Seat not found" });
        if (seat.status !== "unassigned") return json(400, { error: "Seat already assigned" });
        if (seat.expires_at && Date.parse(seat.expires_at) < Date.now()) {
          await sb.from("seat_licenses").update({ status: "expired" }).eq("id", seatId);
          return json(400, { error: "Seat expired" });
        }

        const { data: userRow } = await sb.from("users").select("id, email").eq("email", email).maybeSingle();
        if (!userRow?.id) return json(400, { error: "User not found. Ask them to sign up first." });

        const assignedUserId = String(userRow.id);
        const assignedTenantId = await findPersonalTenant(sb, assignedUserId);
        if (!assignedTenantId) return json(400, { error: "User has no personal tenant" });

        const { data: planRow, error: planErr } = await sb
          .from("plans")
          .select("id, product_id, duration_days, metadata")
          .eq("id", seat.plan_id)
          .maybeSingle();
        if (planErr || !planRow) return json(500, { error: "Failed to load plan" });

        const planDuration = planRow.duration_days ?? null;
        const planMeta = planRow.metadata ?? null;
        const entitlementValue = buildEntitlementValue(planRow.id, planMeta);
        const targetProductIds = getEntitlementTargets(String(planRow.product_id), planMeta);

        const { data: existingRows } = await sb
          .from("entitlements")
          .select("resource_id, ends_at")
          .eq("tenant_id", assignedTenantId)
          .eq("resource_type", "product")
          .in("resource_id", targetProductIds);

        const existingMap = new Map<string, string | null>();
        (existingRows ?? []).forEach((row: any) => {
          if (row?.resource_id) existingMap.set(String(row.resource_id), row?.ends_at ?? null);
        });

        const nowIso = new Date().toISOString();
        let seatEndsAt: string | null = null;
        const payload = targetProductIds.map((pid) => {
          let targetEndsAt: string | null = null;
          if (planDuration && planDuration > 0) {
            const nowMs = Date.now();
            const existing = existingMap.get(pid);
            const baseMs = existing ? Math.max(nowMs, Date.parse(existing)) : nowMs;
            targetEndsAt = new Date(baseMs + planDuration * 24 * 60 * 60 * 1000).toISOString();
            if (!seatEndsAt || Date.parse(targetEndsAt) > Date.parse(seatEndsAt)) {
              seatEndsAt = targetEndsAt;
            }
          }

          return {
            user_id: assignedUserId,
            tenant_id: assignedTenantId,
            resource_type: "product",
            resource_id: pid,
            is_active: true,
            starts_at: nowIso,
            ends_at: targetEndsAt,
            source: "seat",
            value: entitlementValue,
          };
        });

        const { error: grantErr } = await sb.from("entitlements").upsert(payload, {
          onConflict: "tenant_id,resource_type,resource_id",
        });
        if (grantErr) return json(500, { error: "Failed to grant entitlement", detail: grantErr.message });

        const { data: updatedSeat, error: updErr } = await sb
          .from("seat_licenses")
          .update({
            assigned_user_id: assignedUserId,
            assigned_tenant_id: assignedTenantId,
            status: "active",
            assigned_at: nowIso,
            starts_at: nowIso,
            ends_at: seatEndsAt,
          })
          .eq("id", seatId)
          .select(
            "id, status, expires_at, assigned_at, starts_at, ends_at, plan_id, product_id, assigned_user_id, plans ( name, duration_days ), assigned_user:users!seat_licenses_assigned_user_id_fkey ( email )",
          )
          .maybeSingle();

        if (updErr) return json(500, { error: "Failed to update seat", detail: updErr.message });
        return json(200, { seat: updatedSeat });
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
