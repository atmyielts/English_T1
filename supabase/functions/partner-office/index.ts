import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Json = Record<string, unknown>;

type MembershipRow = { tenant_id: string; role: string; status: string };

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

const loadMemberships = async (sb: any, userId: string): Promise<MembershipRow[]> => {
  const { data, error } = await sb
    .from("tenant_memberships")
    .select("tenant_id, role, status")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as MembershipRow[];
};

const requireTenant = (memberships: MembershipRow[], requested?: string | null): string | null => {
  if (requested) return memberships.some((m) => m.tenant_id === requested) ? requested : null;
  return memberships[0]?.tenant_id ?? null;
};

const forwardEdge = async (
  supabaseUrl: string,
  anonKey: string,
  token: string,
  functionName: string,
  init: RequestInit,
): Promise<Response> => {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("apikey", anonKey);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return fetch(`${supabaseUrl}/functions/v1/${functionName}`, { ...init, headers });
};

const isTicketEligible = (metadata: unknown): boolean => {
  const ticketing = metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? (metadata as any).ticketing
    : null;
  return Boolean(ticketing?.eligible === true && String(ticketing?.mode ?? "") === "single_sitting");
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = getEnv("SUPABASE_URL");
    const serviceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const token = getBearerToken(req);
    if (!token) return json(401, { error: "Unauthorized" });
    const { data: authData, error: authError } = await sb.auth.getUser(token);
    if (authError || !authData?.user) return json(401, { error: "Unauthorized" });

    const userId = authData.user.id;
    const memberships = await loadMemberships(sb, userId);
    if (memberships.length === 0) return json(403, { error: "No active tenant" });

    const url = new URL(req.url);
    const action = url.searchParams.get("action") ?? "";
    const tenantId = requireTenant(memberships, url.searchParams.get("tenant_id"));
    if (!tenantId) return json(403, { error: "Forbidden" });

    if (req.method === "GET" && (action === "catalog" || action === "experiences")) {
      const { data, error } = await sb
        .from("experiences")
        .select("id, name, is_active, product_id, price_amount, price_currency, metadata, products ( name, type, status, metadata )")
        .eq("is_active", true)
        .order("created_at", { ascending: false });
      if (error) return json(500, { error: "Failed to load catalog", detail: error.message });

      const experiences = (data ?? [])
        .filter((row: any) => isTicketEligible(row.metadata))
        .map((row: any) => ({
          id: row.id,
          name: row.name,
          product_id: row.product_id,
          product_name: row.products?.name ?? null,
          app_url: row.products?.metadata?.app_url ?? null,
          price_amount: row.price_amount ?? null,
          price_currency: row.price_currency ?? "UZS",
          ticketing: row.metadata?.ticketing ?? null,
          is_ticket_ready: Number(row.price_amount ?? 0) > 0,
        }));

      return json(200, { experiences });
    }

    if (req.method === "GET" && action === "tickets") {
      const { data, error } = await sb
        .from("exam_tokens")
        .select("id, token_code, status, expires_at, created_at, experience_id, uses_count, max_uses, claimed_by, experiences ( name, product_id )")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });
      if (error) return json(500, { error: "Failed to load tickets", detail: error.message });
      return json(200, { tickets: data ?? [] });
    }

    if (req.method === "GET" && action === "results") {
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
        const { data: evalRows } = await sb.from("evaluations").select("session_id, method, status, result").in("session_id", sessionIds);
        for (const row of evalRows ?? []) {
          const sid = String((row as any).session_id ?? "");
          if (!sid) continue;
          const existing = evalMap.get(sid);
          if (!existing || (row as any).method === "auto") evalMap.set(sid, row);
        }
      }

      return json(200, {
        results: rows.map((row) => {
          const evaluation = evalMap.get(String(row.session_id ?? "")) ?? null;
          const overallScore = evaluation?.result?.overall_score ?? null;
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
            overall_band: evaluation?.result?.overall_band ?? overallScore,
            created_at: row.created_at,
          };
        }),
      });
    }

    if (req.method === "GET" && action === "seats") {
      const { data, error } = await sb
        .from("seat_licenses")
        .select("id, status, expires_at, assigned_at, starts_at, ends_at, plan_id, product_id, assigned_user_id, plans ( name, duration_days ), assigned_user:users!seat_licenses_assigned_user_id_fkey ( email )")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });
      if (error) return json(500, { error: "Failed to load seats", detail: error.message });
      return json(200, { seats: data ?? [] });
    }

    if (req.method === "GET" && action === "payments") {
      const { data, error } = await sb
        .from("payments")
        .select("id, provider, provider_transaction_id, status, amount, original_amount, discount_amount, credit_amount, referral_discount_amount, currency, purchase_type, product_id, plan_id, created_at, granted_at, metadata")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) return json(500, { error: "Failed to load payments", detail: error.message });
      return json(200, { payments: data ?? [] });
    }

    if (req.method === "GET" && action === "credits") {
      const currency = String(url.searchParams.get("currency") ?? "UZS").toUpperCase();
      const { data: balance } = await sb.rpc("platform_credit_available", { p_user_id: userId, p_currency: currency });
      const { data, error } = await sb
        .from("platform_credit_ledger")
        .select("id, amount, currency, entry_kind, status, payment_id, reward_id, metadata, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) return json(500, { error: "Failed to load credits", detail: error.message });
      return json(200, { credit: { currency, available_amount: Number(balance ?? 0) }, ledger: data ?? [] });
    }

    if (req.method === "GET" && action === "referrals") {
      const forwarded = await forwardEdge(supabaseUrl, anonKey, token, "referrals/me", { method: "GET" });
      const body = await forwarded.text();
      return new Response(body, { status: forwarded.status, headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    if (req.method === "GET" && action === "dashboard") {
      const [tickets, seats, payments, results, credits] = await Promise.all([
        sb.from("exam_tokens").select("id, status", { count: "exact", head: true }).eq("tenant_id", tenantId),
        sb.from("seat_licenses").select("id, status", { count: "exact", head: true }).eq("tenant_id", tenantId),
        sb.from("payments").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
        sb.from("exam_registrations").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
        sb.rpc("platform_credit_available", { p_user_id: userId, p_currency: "UZS" }),
      ]);
      return json(200, {
        tenant_id: tenantId,
        counts: {
          tickets: tickets.count ?? 0,
          seats: seats.count ?? 0,
          payments: payments.count ?? 0,
          results: results.count ?? 0,
        },
        credit: { currency: "UZS", available_amount: Number(credits.data ?? 0) },
      });
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

    if (req.method === "POST") {
      const body = (await req.json().catch(() => ({}))) as Json;
      const actionBody = String(body.action ?? "");

      if (actionBody === "assign_seat") {
        const forwarded = await forwardEdge(supabaseUrl, anonKey, token, "teacher-office", {
          method: "POST",
          body: JSON.stringify(body),
        });
        const text = await forwarded.text();
        return new Response(text, { status: forwarded.status, headers: { "Content-Type": "application/json", ...corsHeaders } });
      }

      if (actionBody === "quote_purchase") {
        const purchaseType = String(body.purchase_type ?? "").trim();
        const quantity = normalizeQuantity(body.quantity ?? body.seat_count, 500) ?? 1;
        let originalAmount = 0;
        let currency = "UZS";

        if (purchaseType === "token_pack") {
          const experienceId = String(body.experience_id ?? "");
          const { data: exp } = await sb
            .from("experiences")
            .select("id, price_amount, price_currency")
            .eq("id", experienceId)
            .eq("is_active", true)
            .maybeSingle();
          originalAmount = Number((exp as any)?.price_amount ?? 0) * quantity;
          currency = String((exp as any)?.price_currency ?? "UZS");
        } else {
          const planId = String(body.plan_id ?? "");
          const { data: plan } = await sb
            .from("plans")
            .select("id, amount, currency")
            .eq("id", planId)
            .eq("is_active", true)
            .maybeSingle();
          originalAmount = Number((plan as any)?.amount ?? 0) * quantity;
          currency = String((plan as any)?.currency ?? "UZS");
        }

        if (!Number.isFinite(originalAmount) || originalAmount <= 0) return json(400, { error: "Purchase is not priced" });
        const { data: creditAvailable } = await sb.rpc("platform_credit_available", { p_user_id: userId, p_currency: currency });
        const requestedCredit = body.apply_credit ? originalAmount : Math.max(0, Number(body.credit_amount ?? 0));
        const creditAmount = Math.min(originalAmount, Number(creditAvailable ?? 0), requestedCredit);
        return json(200, {
          quote: {
            purchase_type: purchaseType || "plan",
            quantity,
            currency,
            original_amount: originalAmount,
            credit_available: Number(creditAvailable ?? 0),
            credit_amount: creditAmount,
            final_amount: Math.max(0, originalAmount - creditAmount),
          },
        });
      }

      if (actionBody === "create_ticket_purchase" || actionBody === "create_seat_purchase") {
        const purchaseType = actionBody === "create_ticket_purchase" ? "token_pack" : "seat_pack";
        const payload = {
          ...body,
          purchase_type: purchaseType,
          tenant_id: String(body.tenant_id ?? tenantId),
          description: String(body.description ?? (purchaseType === "token_pack" ? "Partner mock ticket pack" : "Partner seat pack")),
        };
        delete (payload as any).action;

        if (purchaseType === "token_pack" && !normalizeDays((payload as any).expires_in_days)) {
          (payload as any).expires_in_days = 30;
        }

        const forwarded = await forwardEdge(supabaseUrl, anonKey, token, "tspay/create-transaction", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        const text = await forwarded.text();
        return new Response(text, { status: forwarded.status, headers: { "Content-Type": "application/json", ...corsHeaders } });
      }

      return json(400, { error: "Unknown action" });
    }

    return json(404, { error: "Not found" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return json(500, { error: message });
  }
});
