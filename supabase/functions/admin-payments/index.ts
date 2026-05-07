import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  extractIncludedProductIds,
  extractPlanLimits,
  parseEntitlementTerms,
} from "../_shared/payment-terms.ts";
import { authorizeAdminRequest } from "../_shared/admin-access.ts";

type Json = Record<string, unknown>;

type PaymentRow = {
  id: string;
  provider: string;
  provider_transaction_id: string;
  tspay_order_id?: string | null;
  tspay_cheque_id?: string | null;
  tspay_transaction_id?: string | null;
  amount: number;
  currency: string;
  status: string;
  user_id: string | null;
  tenant_id: string | null;
  product_id: string | null;
  plan_id: string | null;
  purchase_type?: string | null;
  granted_at: string | null;
  grant_error: string | null;
  original_amount: number | null;
  discount_amount: number | null;
  coupon_code: string | null;
  coupon_id: string | null;
  plan_snapshot: Json | null;
  entitlement_terms: Json | null;
  metadata: Json | null;
  created_at: string;
  updated_at: string;
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

const normalizePaymentStatus = (raw: unknown): string => {
  const s = String(raw ?? "").trim().toLowerCase();
  return s || "unknown";
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

const isSuccessStatus = (successes: Set<string>, status: string): boolean => successes.has(status.trim().toLowerCase());

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

  // Fallback for TsPay variants where top-level status is the payment status.
  const payStatus = hasStructuredPaymentStatus ?? statusJson?.status ?? null;

  return { paymentStatus: normalizeTsPaymentStatus(payStatus), apiStatus };
};

const uniqIds = (ids: Array<string | null | undefined>): string[] => {
  const set = new Set<string>();
  for (const id of ids) {
    const value = String(id ?? "").trim();
    if (!value) continue;
    set.add(value);
  }
  return Array.from(set);
};

const looksLikeUuid = (s: string): boolean => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

const buildEntitlementValue = (planId: string | null | undefined, planLimits: Record<string, number>): Record<string, unknown> => {
  const value: Record<string, unknown> = {};
  if (planId) value.plan_id = planId;
  if (Object.keys(planLimits).length > 0) value.limits = planLimits;
  return value;
};

const getEntitlementTargets = (productId: string, included: string[]): string[] => {
  const set = new Set<string>([productId, ...included]);
  return Array.from(set);
};

type ResolvedGrantTerms = {
  durationDays: number | null;
  includedProductIds: string[];
  limits: Record<string, number>;
  sourcePlanId: string | null;
};

const resolveGrantTerms = async (sb: any, payment: PaymentRow): Promise<ResolvedGrantTerms> => {
  const directTerms = parseEntitlementTerms(payment.entitlement_terms ?? null);
  if (directTerms) {
    return {
      durationDays: directTerms.duration_days,
      includedProductIds: directTerms.included_product_ids,
      limits: directTerms.limits,
      sourcePlanId: directTerms.source_plan_id ?? payment.plan_id ?? null,
    };
  }

  const planSnapshot = payment.plan_snapshot && typeof payment.plan_snapshot === "object" && !Array.isArray(payment.plan_snapshot)
    ? payment.plan_snapshot
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
      sourcePlanId: String((planSnapshot as any).id ?? payment.plan_id ?? ""),
    };
  }

  if (!payment.plan_id) {
    return { durationDays: null, includedProductIds: [], limits: {}, sourcePlanId: null };
  }

  const { data: planRow } = await sb.from("plans").select("id, duration_days, metadata").eq("id", payment.plan_id).maybeSingle();
  if (!planRow) {
    throw new Error(`Plan terms unavailable for payment ${payment.id} (plan ${payment.plan_id})`);
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
    sourcePlanId: String((planRow as any).id ?? payment.plan_id),
  };
};

const normalizeTspayApiBaseUrl = (raw: string | undefined): string => {
  const value = String(raw ?? "").trim();
  if (!value) return "https://api.tspay.uz/api";
  if (/\/api\/v1\/?$/i.test(value)) return "https://api.tspay.uz/api";
  return value.replace(/\/+$/, "");
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

const fetchTspayStatus = async (
  tspayBaseUrl: string,
  payment: PaymentRow,
): Promise<{ ok: boolean; statusJson: any; statusQueryId: string }> => {
  const meta = payment.metadata && typeof payment.metadata === "object" && !Array.isArray(payment.metadata)
    ? payment.metadata
    : {};
  const candidates = uniqIds([
    payment.tspay_cheque_id,
    (meta as any)?.tspay_cheque_id,
    payment.provider_transaction_id,
    payment.tspay_order_id,
    (meta as any)?.tspay_order_id,
  ]);

  for (const candidate of candidates) {
    const endpoint = looksLikeUuid(candidate)
      ? `${tspayBaseUrl}/transactions/cheque/${encodeURIComponent(candidate)}`
      : `${tspayBaseUrl}/transactions/${encodeURIComponent(candidate)}`;
    const res = await fetch(endpoint, { method: "GET" });
    const statusJson = await readJsonPayload(res);
    if (res.ok) return { ok: true, statusJson, statusQueryId: candidate };
    if (res.status !== 404) return { ok: false, statusJson, statusQueryId: candidate };
  }

  return { ok: false, statusJson: { detail: "Transaction not found" }, statusQueryId: candidates[0] ?? payment.provider_transaction_id };
};

const selectPaymentView = () =>
  [
    "id",
    "provider",
    "provider_transaction_id",
    "tspay_order_id",
    "tspay_cheque_id",
    "tspay_transaction_id",
    "amount",
    "currency",
    "status",
    "user_id",
    "tenant_id",
    "product_id",
    "plan_id",
    "purchase_type",
    "granted_at",
    "grant_error",
    "original_amount",
    "discount_amount",
    "coupon_code",
    "coupon_id",
    "plan_snapshot",
    "entitlement_terms",
    "created_at",
    "updated_at",
    "users(email)",
    "plans(name,duration_days)",
    "products(name)",
    "tenants(slug,name)",
  ].join(",");

const applyCenterTierUpgradeOnce = async (sb: any, payment: PaymentRow): Promise<boolean> => {
  if (!payment.tenant_id || !payment.user_id) return false;
  const meta = payment.metadata && typeof payment.metadata === "object" && !Array.isArray(payment.metadata) ? payment.metadata : {};
  const targetTier = normalizeCenterTier((meta as any).requested_tier ?? (meta as any).center_tier);
  if (!targetTier || targetTier === "starter") {
    await sb.from("payments").update({ granted_at: null, grant_error: "Invalid center tier upgrade metadata" }).eq("id", payment.id);
    throw new Error("Invalid center tier upgrade metadata");
  }

  const nowIso = new Date().toISOString();
  const { data: claim, error: claimErr } = await sb
    .from("payments")
    .update({ granted_at: nowIso, grant_error: null })
    .eq("id", payment.id)
    .is("granted_at", null)
    .select("id")
    .maybeSingle();
  if (claimErr) throw claimErr;
  if (!claim) return false;

  let durationDays = 30;
  if (payment.plan_id) {
    const { data: planRow } = await sb.from("plans").select("duration_days").eq("id", payment.plan_id).maybeSingle();
    const planDays = Number((planRow as any)?.duration_days ?? 0);
    if (Number.isFinite(planDays) && planDays > 0) durationDays = Math.floor(planDays);
  }
  const metaDays = Number((meta as any).duration_days ?? 0);
  if (Number.isFinite(metaDays) && metaDays > 0) durationDays = Math.floor(metaDays);

  const { data: currentProfile, error: profileError } = await sb
    .from("partner_center_profiles")
    .select("tenant_id, package_tier, wallet_settings")
    .eq("tenant_id", payment.tenant_id)
    .maybeSingle();
  if (profileError || !currentProfile?.tenant_id) {
    await sb.from("payments").update({ granted_at: null, grant_error: "Education center profile not found" }).eq("id", payment.id);
    throw new Error("Education center profile not found");
  }

  const billingPeriod = normalizeBillingPeriod((meta as any).billing_period);
  const periodEnd = new Date(Date.now() + durationDays * 86400000).toISOString();
  const existingSettings = (currentProfile as any).wallet_settings && typeof (currentProfile as any).wallet_settings === "object" && !Array.isArray((currentProfile as any).wallet_settings)
    ? (currentProfile as any).wallet_settings
    : {};

  const { error: updateError } = await sb
    .from("partner_center_profiles")
    .update({
      package_tier: targetTier,
      powered_by_schood: targetTier === "growth" ? true : undefined,
      wallet_settings: {
        ...existingSettings,
        upgraded_by_payment_id: payment.id,
        tier_period_end: periodEnd,
        tier_billing_period: billingPeriod,
      },
    })
    .eq("tenant_id", payment.tenant_id);
  if (updateError) {
    await sb.from("payments").update({ granted_at: null, grant_error: String(updateError.message ?? updateError) }).eq("id", payment.id);
    throw updateError;
  }

  await sb.from("partner_center_tier_subscriptions").upsert(
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
      metadata: { source: "admin_retry", previous_tier: (currentProfile as any).package_tier ?? null, plan_id: payment.plan_id ?? null },
    },
    { onConflict: "tenant_id" },
  );

  const requestId = String((meta as any).tier_change_request_id ?? "").trim();
  if (requestId) {
    await sb
      .from("partner_center_tier_change_requests")
      .update({ status: "applied", payment_id: payment.id, applied_at: nowIso, metadata: { ...meta, applied_tier: targetTier, applied_period_end: periodEnd } })
      .eq("id", requestId)
      .eq("tenant_id", payment.tenant_id);
  }

  return true;
};

const grantEntitlementOnce = async (sb: any, payment: PaymentRow): Promise<boolean> => {
  const purchaseType = normalizePurchaseType(payment.purchase_type ?? (payment.metadata as any)?.purchase_type);
  if (purchaseType === "center_tier_upgrade") return applyCenterTierUpgradeOnce(sb, payment);
  if (!payment.tenant_id || !payment.product_id || !payment.user_id) return false;

  const terms = await resolveGrantTerms(sb, payment);
  const entitlementValue = buildEntitlementValue(terms.sourcePlanId ?? payment.plan_id, terms.limits);

  const nowIso = new Date().toISOString();

  // Idempotency: claim this payment once.
  const { data: claim, error: claimErr } = await sb
    .from("payments")
    .update({ granted_at: nowIso, grant_error: null })
    .eq("id", payment.id)
    .is("granted_at", null)
    .select("id")
    .maybeSingle();

  if (claimErr) throw claimErr;
  if (!claim) return false;

  const targetProductIds = getEntitlementTargets(payment.product_id, terms.includedProductIds);
  const { data: existingRows } = await sb
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
    let endsAt: string | null = null;
    if (terms.durationDays && terms.durationDays > 0) {
      const nowMs = Date.now();
      const existing = existingMap.get(pid);
      const baseMs = existing ? Math.max(nowMs, Date.parse(existing)) : nowMs;
      endsAt = new Date(baseMs + terms.durationDays * 24 * 60 * 60 * 1000).toISOString();
    }

    return {
      user_id: payment.user_id,
      tenant_id: payment.tenant_id,
      resource_type: "product",
      resource_id: pid,
      is_active: true,
      starts_at: nowIso,
      ends_at: endsAt,
      source: "tspay",
      value: entitlementValue,
    };
  });

  const { error: grantError } = await sb.from("entitlements").upsert(payload, { onConflict: "tenant_id,resource_type,resource_id" });

  if (grantError) {
    await sb.from("payments").update({ granted_at: null, grant_error: String(grantError.message ?? grantError) }).eq("id", payment.id);
    throw grantError;
  }

  if (payment.coupon_id) {
    const nowIso = new Date().toISOString();
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
    const { error: redErr } = await sb.from("coupon_redemptions").upsert(
      {
        coupon_id: payment.coupon_id,
        payment_id: payment.id,
        context_id: payment.id,
        user_id: payment.user_id,
        tenant_id: payment.tenant_id,
        status: "applied",
        redeemed_at: nowIso,
        snapshot,
        metadata: { provider: payment.provider, provider_transaction_id: payment.provider_transaction_id },
      },
      { onConflict: "coupon_id,user_id,context_id" },
    );
    if (redErr && String((redErr as any).code ?? "") !== "23505") {
      // non-fatal
    }
  }

  return true;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = getEnv("SUPABASE_URL");
    const supabaseServiceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

    const sb = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });
    const authz = await authorizeAdminRequest(sb, req, corsHeaders, {
      requiredPermission: "admin.payments.manage",
      action: "admin.payments",
    });
    if (!authz.ok) return authz.response;

    const url = new URL(req.url);

    if (req.method === "GET" && url.pathname.endsWith("/list")) {
      const limitRaw = Number(url.searchParams.get("limit") ?? 50);
      const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, Math.floor(limitRaw))) : 50;

      const { data: payments, error: pErr } = await sb
        .from("payments")
        .select(selectPaymentView())
        .order("created_at", { ascending: false })
        .limit(limit);
      if (pErr) throw pErr;

      return new Response(JSON.stringify({ payments: payments ?? [] }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (req.method === "GET" && url.pathname.endsWith("/search")) {
      const query = String(url.searchParams.get("query") ?? "").trim();
      const limitRaw = Number(url.searchParams.get("limit") ?? 50);
      const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, Math.floor(limitRaw))) : 50;

      if (!query) {
        return new Response(JSON.stringify({ error: "query is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      let q = sb.from("payments").select(selectPaymentView()).order("created_at", { ascending: false }).limit(limit);

      if (query.includes("@")) {
        const { data: users, error: uErr } = await sb
          .from("users")
          .select("id")
          .ilike("email", `%${query}%`)
          .limit(25);
        if (uErr) throw uErr;
        const ids = (users ?? []).map((u: any) => u.id).filter(Boolean);
        if (ids.length === 0) {
          return new Response(JSON.stringify({ payments: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }
        q = q.in("user_id", ids);
      } else {
        const like = `%${query}%`;
        const ors = [`provider_transaction_id.ilike.${like}`, `coupon_code.ilike.${like}`];
        if (looksLikeUuid(query)) ors.push(`id.eq.${query}`);
        q = q.or(ors.join(","));
      }

      const { data: payments, error: pErr } = await q;
      if (pErr) throw pErr;

      return new Response(JSON.stringify({ payments: payments ?? [] }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (req.method === "GET" && url.pathname.endsWith("/anomalies")) {
      const minutesRaw = Number(url.searchParams.get("minutes") ?? 5);
      const limitRaw = Number(url.searchParams.get("limit") ?? 100);
      const minutes = Number.isFinite(minutesRaw) ? Math.max(1, Math.min(180, Math.floor(minutesRaw))) : 5;
      const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(500, Math.floor(limitRaw))) : 100;
      const cutoffIso = new Date(Date.now() - minutes * 60 * 1000).toISOString();
      const successStatuses = parseSuccessStatuses(Deno.env.get("TSPAY_SUCCESS_STATUSES"));

      const { data: pending, error: pendingErr } = await sb
        .from("payments")
        .select(selectPaymentView())
        .is("granted_at", null)
        .lt("created_at", cutoffIso)
        .order("created_at", { ascending: true })
        .limit(limit);
      if (pendingErr) throw pendingErr;

      const anomalies = (pending ?? []).filter((row: any) =>
        isSuccessStatus(successStatuses, normalizePaymentStatus(row?.status))
      );

      return new Response(
        JSON.stringify({
          cutoff_minutes: minutes,
          count: anomalies.length,
          anomalies,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        },
      );
    }

    if (req.method === "POST" && url.pathname.endsWith("/refresh-status")) {
      const body = (await req.json()) as any;
      const paymentId = String(body?.payment_id ?? "").trim();
      if (!paymentId) {
        return new Response(JSON.stringify({ error: "payment_id is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const { data: paymentRow, error: payErr } = await sb
        .from("payments")
        .select("id, provider, provider_transaction_id, tspay_order_id, tspay_cheque_id, tspay_transaction_id, amount, currency, status, user_id, tenant_id, product_id, plan_id, purchase_type, granted_at, grant_error, original_amount, discount_amount, coupon_code, coupon_id, plan_snapshot, entitlement_terms, metadata, created_at, updated_at")
        .eq("id", paymentId)
        .maybeSingle();
      if (payErr) throw payErr;
      if (!paymentRow) {
        return new Response(JSON.stringify({ error: "Payment not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const payment = paymentRow as PaymentRow;
      if (String(payment.provider).toLowerCase() !== "tspay") {
        return new Response(JSON.stringify({ error: "Only tspay payments are supported right now" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const tspayBaseUrl = normalizeTspayApiBaseUrl(Deno.env.get("TSPAY_API_BASE_URL") ?? Deno.env.get("TSPAY_BASE_URL"));
      const successStatuses = parseSuccessStatuses(Deno.env.get("TSPAY_SUCCESS_STATUSES"));

      const meta = payment.metadata && typeof payment.metadata === "object" && !Array.isArray(payment.metadata)
        ? payment.metadata
        : {};
      const checked = await fetchTspayStatus(tspayBaseUrl, payment);
      const statusJson = checked.statusJson;
      const usedStatusId = checked.statusQueryId;

      if (!checked.ok) {
        return new Response(JSON.stringify({ error: "TSPay status failed", details: statusJson }), {
          status: 502,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const { paymentStatus, apiStatus } = parseStatusResponse(statusJson);
      const normalized = paymentStatus;
      const nextMeta = {
        ...meta,
        tspay_status_id: usedStatusId,
      };

      const { error: updateError } = await sb
        .from("payments")
        .update({ status: normalized, metadata: nextMeta, provider_payload: { api_status: apiStatus, status_query_id: usedStatusId, ...statusJson } })
        .eq("id", payment.id);
      if (updateError) throw updateError;

      if (isSuccessStatus(successStatuses, normalized)) {
        try {
          await grantEntitlementOnce(sb, payment);
        } catch (e) {
          // Store error for support; do not fail the whole request.
          const msg = e instanceof Error ? e.message : String(e);
          await sb.from("payments").update({ grant_error: msg }).eq("id", payment.id);
        }
      }

      const { data: view } = await sb.from("payments").select(selectPaymentView()).eq("id", payment.id).maybeSingle();

      return new Response(JSON.stringify({ payment: view ?? null, status: normalized }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (req.method === "POST" && url.pathname.endsWith("/retry-grant")) {
      const body = (await req.json()) as any;
      const paymentId = String(body?.payment_id ?? "").trim();
      if (!paymentId) {
        return new Response(JSON.stringify({ error: "payment_id is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const successStatuses = parseSuccessStatuses(Deno.env.get("TSPAY_SUCCESS_STATUSES"));

      const { data: paymentRow, error: payErr } = await sb
        .from("payments")
        .select("id, provider, provider_transaction_id, tspay_order_id, tspay_cheque_id, tspay_transaction_id, amount, currency, status, user_id, tenant_id, product_id, plan_id, purchase_type, granted_at, grant_error, original_amount, discount_amount, coupon_code, coupon_id, plan_snapshot, entitlement_terms, metadata, created_at, updated_at")
        .eq("id", paymentId)
        .maybeSingle();
      if (payErr) throw payErr;
      if (!paymentRow) {
        return new Response(JSON.stringify({ error: "Payment not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const payment = paymentRow as PaymentRow;

      if (!isSuccessStatus(successStatuses, normalizePaymentStatus(payment.status))) {
        return new Response(JSON.stringify({ error: "Payment is not in a paid/success state" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      try {
        const { data: existing } = await sb
          .from("payments")
          .select("granted_at")
          .eq("id", payment.id)
          .maybeSingle();

        if (existing?.granted_at) {
          // Already processed; do not extend again.
        } else {
          await grantEntitlementOnce(sb, payment);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await sb.from("payments").update({ grant_error: msg }).eq("id", payment.id);
        return new Response(JSON.stringify({ error: "Grant failed", details: msg }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const { data: view } = await sb.from("payments").select(selectPaymentView()).eq("id", payment.id).maybeSingle();

      return new Response(JSON.stringify({ payment: view ?? null }), {
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
