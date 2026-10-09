import { fulfillPayment } from "../click/fulfillment.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
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
  grant_completed_at?: string | null;
  grant_error: string | null;
  fiscalization_status?: string | null;
  fiscal_receipt_id?: string | null;
  fiscalized_at?: string | null;
  fiscalization_error?: string | null;
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
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const CLICK_MERCHANT_API_BASE = "https://api.click.uz/v2/merchant";

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
  const list = (raw ?? "paid,success,completed").split(",").map((v) =>
    v.trim().toLowerCase()
  );
  return new Set(list.filter(Boolean));
};

const paymentSuccessStatuses = (): Set<string> =>
  parseSuccessStatuses(Deno.env.get("PAYMENT_SUCCESS_STATUSES"));

const isSuccessStatus = (successes: Set<string>, status: string): boolean =>
  successes.has(status.trim().toLowerCase());

const uniqIds = (ids: Array<string | null | undefined>): string[] => {
  const set = new Set<string>();
  for (const id of ids) {
    const value = String(id ?? "").trim();
    if (!value) continue;
    set.add(value);
  }
  return Array.from(set);
};

const looksLikeUuid = (s: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

const readJsonPayload = async (res: Response): Promise<any> => {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { detail: text };
  }
};

const sha1Hex = async (message: string): Promise<string> => {
  const data = new TextEncoder().encode(message);
  const hash = await crypto.subtle.digest("SHA-1", data);
  return Array.from(new Uint8Array(hash)).map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
};

const buildClickMerchantAuthHeader = async (
  merchantUserId: string,
  secretKey: string,
): Promise<string> => {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const digest = await sha1Hex(`${timestamp}${secretKey}`);
  return `${merchantUserId}:${digest}:${timestamp}`;
};

const normalizeClickPaymentStatus = (statusCode: unknown): string => {
  const code = Number(statusCode);
  if (code === 2) return "paid";
  if (code === -1) return "canceled";
  if (code === 1) return "pending";
  return normalizePaymentStatus(statusCode) || "pending";
};

const fetchClickStatus = async (
  payment: PaymentRow,
): Promise<
  {
    ok: boolean;
    statusJson: any;
    statusQueryId: string;
    paymentStatus: string;
    apiStatus: string;
  }
> => {
  const merchantUserId = Deno.env.get("CLICK_MERCHANT_USER_ID");
  const secretKey = Deno.env.get("CLICK_SECRET_KEY");
  const serviceId = Deno.env.get("CLICK_SERVICE_ID");
  if (!merchantUserId || !secretKey || !serviceId) {
    return {
      ok: false,
      statusJson: { error: "missing_click_config" },
      statusQueryId: payment.provider_transaction_id,
      paymentStatus: "pending",
      apiStatus: "missing_config",
    };
  }

  const meta = payment.metadata && typeof payment.metadata === "object" &&
      !Array.isArray(payment.metadata)
    ? payment.metadata
    : {};
  const candidates = uniqIds([
    (meta as any)?.click_trans_id,
    payment.provider_transaction_id,
  ]).filter((candidate) => !looksLikeUuid(candidate));

  if (candidates.length === 0) {
    return {
      ok: false,
      statusJson: { error: "missing_click_transaction_id" },
      statusQueryId: payment.provider_transaction_id,
      paymentStatus: "pending",
      apiStatus: "missing_transaction_id",
    };
  }

  const authHeader = await buildClickMerchantAuthHeader(
    merchantUserId,
    secretKey,
  );
  for (const candidate of candidates) {
    const res = await fetch(
      `${CLICK_MERCHANT_API_BASE}/payment/status/${serviceId}/${
        encodeURIComponent(candidate)
      }`,
      {
        method: "GET",
        headers: { "Auth": authHeader, "Content-Type": "application/json" },
      },
    );
    const statusJson = await readJsonPayload(res);
    if (!res.ok) {
      if (res.status !== 404) {
        return {
          ok: false,
          statusJson,
          statusQueryId: candidate,
          paymentStatus: "pending",
          apiStatus: normalizePaymentStatus(
            statusJson?.status ?? statusJson?.error ?? "click_api_error",
          ),
        };
      }
      continue;
    }
    return {
      ok: true,
      statusJson,
      statusQueryId: candidate,
      paymentStatus: normalizeClickPaymentStatus(statusJson?.payment_status),
      apiStatus: normalizePaymentStatus(statusJson?.status ?? "click_api"),
    };
  }

  return {
    ok: false,
    statusJson: { detail: "Click transaction not found" },
    statusQueryId: candidates[0],
    paymentStatus: "pending",
    apiStatus: "not_found",
  };
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
    "grant_completed_at",
    "grant_error",
    "fiscalization_status",
    "fiscal_receipt_id",
    "fiscalized_at",
    "fiscalization_error",
    "original_amount",
    "discount_amount",
    "coupon_code",
    "coupon_id",
    "plan_snapshot",
    "entitlement_terms",
    "metadata",
    "created_at",
    "updated_at",
    "users(email)",
    "plans(name,duration_days)",
    "products(name)",
    "tenants(slug,name)",
  ].join(",");

const grantEntitlementOnce = async (sb: any, payment: PaymentRow): Promise<boolean> => {
  const result = await fulfillPayment(sb, payment.id);
  if (!result.ok) {
    throw new Error(result.state === "reconciliation"
      ? "Grant requires operator reconciliation. Automatic replay is disabled to prevent duplicate access or credit."
      : "Payment received; access activation is pending. Do not pay again.");
  }
  return !result.deduped;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = getEnv("SUPABASE_URL");
    const supabaseServiceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

    const sb = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const authz = await authorizeAdminRequest(sb, req, corsHeaders, {
      requiredPermission: "admin.payments.manage",
      action: "admin.payments",
    });
    if (!authz.ok) return authz.response;

    const url = new URL(req.url);

    if (req.method === "GET" && url.pathname.endsWith("/list")) {
      const limitRaw = Number(url.searchParams.get("limit") ?? 50);
      const limit = Number.isFinite(limitRaw)
        ? Math.max(1, Math.min(200, Math.floor(limitRaw)))
        : 50;

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
      const limit = Number.isFinite(limitRaw)
        ? Math.max(1, Math.min(200, Math.floor(limitRaw)))
        : 50;

      if (!query) {
        return new Response(JSON.stringify({ error: "query is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      let q = sb.from("payments").select(selectPaymentView()).order(
        "created_at",
        { ascending: false },
      ).limit(limit);

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
        const ors = [
          `provider_transaction_id.ilike.${like}`,
          `coupon_code.ilike.${like}`,
        ];
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
      const minutes = Number.isFinite(minutesRaw)
        ? Math.max(1, Math.min(180, Math.floor(minutesRaw)))
        : 5;
      const limit = Number.isFinite(limitRaw)
        ? Math.max(1, Math.min(500, Math.floor(limitRaw)))
        : 100;
      const cutoffIso = new Date(Date.now() - minutes * 60 * 1000)
        .toISOString();
      const successStatuses = paymentSuccessStatuses();

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

      const { data: incompleteGrantRows, error: incompleteGrantError } =
        await sb
          .from("payments")
          .select(selectPaymentView())
          .eq("provider", "click")
          .not("granted_at", "is", null)
          .is("grant_completed_at", null)
          .lt("granted_at", cutoffIso)
          .order("granted_at", { ascending: true })
          .limit(limit);
      if (incompleteGrantError) throw incompleteGrantError;
      const incompleteGrants = (incompleteGrantRows ?? []).filter((row: any) =>
        isSuccessStatus(successStatuses, normalizePaymentStatus(row?.status))
      );
      const grantAnomalies = [
        ...anomalies,
        ...incompleteGrants.filter((candidate: any) =>
          !anomalies.some((row: any) => row.id === candidate.id)
        ),
      ].slice(0, limit);

      const { data: stuckPending, error: stuckPendingError } = await sb
        .from("payments")
        .select(selectPaymentView())
        .eq("provider", "click")
        .eq("status", "pending")
        .lt("updated_at", cutoffIso)
        .order("updated_at", { ascending: true })
        .limit(limit);
      if (stuckPendingError) throw stuckPendingError;

      const { data: grantedWithoutPaid, error: grantedWithoutPaidError } =
        await sb
          .from("payments")
          .select(selectPaymentView())
          .eq("provider", "click")
          .not("granted_at", "is", null)
          .not("status", "in", "(paid,success,completed)")
          .limit(limit);
      if (grantedWithoutPaidError) throw grantedWithoutPaidError;

      const { data: fiscalFailures, error: fiscalFailuresError } = await sb
        .from("payments")
        .select(selectPaymentView())
        .eq("provider", "click")
        .eq("fiscalization_status", "failed")
        .order("updated_at", { ascending: true })
        .limit(limit);
      if (fiscalFailuresError) throw fiscalFailuresError;

      const callbackCutoff = new Date(Date.now() - 15 * 60 * 1000)
        .toISOString();
      const { data: callbackEvents, error: callbackEventsError } = await sb
        .from("click_callback_events")
        .select("protocol_error,http_status")
        .gte("created_at", callbackCutoff)
        .limit(1000);
      if (callbackEventsError) throw callbackEventsError;
      const callbackRows = callbackEvents ?? [];

      return new Response(
        JSON.stringify({
          cutoff_minutes: minutes,
          count: grantAnomalies.length,
          anomalies: grantAnomalies,
          operational: {
            stuck_pending_or_prepared: (stuckPending ?? []).length,
            incomplete_grants: incompleteGrants.length,
            granted_without_paid: (grantedWithoutPaid ?? []).length,
            fiscalization_failures: (fiscalFailures ?? []).length,
            callbacks_15m: callbackRows.length,
            callback_rejections_15m: callbackRows.filter((row: any) =>
              Number(row.protocol_error) !== 0
            ).length,
            signature_failures_15m: callbackRows.filter((row: any) =>
              Number(row.protocol_error) === -1
            ).length,
            callback_5xx_15m: callbackRows.filter((row: any) =>
              Number(row.http_status) >= 500
            ).length,
          },
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
        return new Response(
          JSON.stringify({ error: "payment_id is required" }),
          {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          },
        );
      }

      const { data: paymentRow, error: payErr } = await sb
        .from("payments")
        .select(
          "id, provider, provider_transaction_id, tspay_order_id, tspay_cheque_id, tspay_transaction_id, amount, currency, status, user_id, tenant_id, product_id, plan_id, purchase_type, granted_at, grant_completed_at, grant_error, original_amount, discount_amount, coupon_code, coupon_id, plan_snapshot, entitlement_terms, metadata, created_at, updated_at",
        )
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
      const provider = String(payment.provider ?? "").toLowerCase();
      const successStatuses = paymentSuccessStatuses();

      const meta = payment.metadata && typeof payment.metadata === "object" &&
          !Array.isArray(payment.metadata)
        ? payment.metadata
        : {};
      let statusJson: any = {};
      let usedStatusId = payment.provider_transaction_id;
      let paymentStatus = "pending";
      let apiStatus = "unknown";

      if (provider === "click") {
        const checked = await fetchClickStatus(payment);
        statusJson = checked.statusJson;
        usedStatusId = checked.statusQueryId;
        paymentStatus = checked.paymentStatus;
        apiStatus = checked.apiStatus;
        if (!checked.ok) {
          return new Response(
            JSON.stringify({
              error: "Click status failed",
              details: statusJson,
            }),
            {
              status: 502,
              headers: { "Content-Type": "application/json", ...corsHeaders },
            },
          );
        }
      } else if (provider === "tspay") {
        return new Response(
          JSON.stringify({
            error:
              "TsPay has been retired. Historical TsPay rows remain visible, but status refresh is disabled. Use Click for all new payments.",
            error_code: "tspay_retired",
            provider: "tspay",
            replacement_provider: "click",
          }),
          {
            status: 410,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          },
        );
      } else {
        return new Response(
          JSON.stringify({
            error: `Unsupported payment provider: ${payment.provider}`,
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          },
        );
      }

      const normalized = paymentStatus;
      const nextMeta = {
        ...meta,
        click_status_id: usedStatusId,
      };

      const { error: updateError } = await sb
        .from("payments")
        .update({
          status: normalized,
          metadata: nextMeta,
          provider_payload: {
            api_status: apiStatus,
            status_query_id: usedStatusId,
            ...statusJson,
          },
        })
        .eq("id", payment.id);
      if (updateError) throw updateError;

      if (isSuccessStatus(successStatuses, normalized)) {
        try {
          await grantEntitlementOnce(sb, {
            ...payment,
            status: normalized,
            metadata: nextMeta,
          });
        } catch (e) {
          // Store error for support; do not fail the whole request.
          const msg = e instanceof Error ? e.message : String(e);
          await sb.from("payments").update({ grant_error: msg }).eq(
            "id",
            payment.id,
          );
        }
      }

      const { data: view } = await sb.from("payments").select(
        selectPaymentView(),
      ).eq("id", payment.id).maybeSingle();

      return new Response(
        JSON.stringify({ payment: view ?? null, status: normalized }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        },
      );
    }

    if (req.method === "POST" && url.pathname.endsWith("/retry-grant")) {
      const body = (await req.json()) as any;
      const paymentId = String(body?.payment_id ?? "").trim();
      if (!paymentId) {
        return new Response(
          JSON.stringify({ error: "payment_id is required" }),
          {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          },
        );
      }

      const successStatuses = paymentSuccessStatuses();

      const { data: paymentRow, error: payErr } = await sb
        .from("payments")
        .select(
          "id, provider, provider_transaction_id, tspay_order_id, tspay_cheque_id, tspay_transaction_id, amount, currency, status, user_id, tenant_id, product_id, plan_id, purchase_type, granted_at, grant_error, original_amount, discount_amount, coupon_code, coupon_id, plan_snapshot, entitlement_terms, metadata, created_at, updated_at",
        )
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

      if (
        !isSuccessStatus(
          successStatuses,
          normalizePaymentStatus(payment.status),
        )
      ) {
        return new Response(
          JSON.stringify({ error: "Payment is not in a paid/success state" }),
          {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          },
        );
      }

      try {
        await grantEntitlementOnce(sb, payment);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await sb.from("payments").update({ grant_error: msg }).eq(
          "id",
          payment.id,
        );
        return new Response(
          JSON.stringify({ error: "Grant failed", details: msg }),
          {
            status: 500,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          },
        );
      }

      const { data: view } = await sb.from("payments").select(
        selectPaymentView(),
      ).eq("id", payment.id).maybeSingle();

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
    const status = message === "Unauthorized"
      ? 401
      : message === "Forbidden"
      ? 403
      : 500;
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
