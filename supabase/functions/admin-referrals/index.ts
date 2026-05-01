import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authorizeAdminRequest } from "../_shared/admin-access.ts";

type Json = Record<string, unknown>;

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
};

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...corsHeaders } });

const getEnv = (key: string): string => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Missing env var: ${key}`);
  return value;
};

const isObject = (value: unknown): value is Json => Boolean(value && typeof value === "object" && !Array.isArray(value));

const toNonNegativeInt = (value: unknown, fallback: number | null = null): number | null => {
  if (value === null || typeof value === "undefined" || value === "") return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
};

const normalizeType = (value: unknown): string | null => {
  const type = String(value ?? "").trim().toLowerCase();
  if (!type) return null;
  return type === "fixed" || type === "percent" ? type : "__invalid__";
};

const validateProgramPatch = (body: Json): { ok: true; patch: Json } | { ok: false; error: string } => {
  const patch: Json = {};

  if ("name" in body) {
    const name = String(body.name ?? "").trim();
    if (!name) return { ok: false, error: "name is required" };
    patch.name = name;
  }

  if ("status" in body) {
    const status = String(body.status ?? "").trim().toLowerCase();
    if (!["inactive", "active", "paused", "archived"].includes(status)) {
      return { ok: false, error: "status must be inactive, active, paused, or archived" };
    }
    patch.status = status;
  }

  if ("currency" in body) {
    const currency = String(body.currency ?? "UZS").trim().toUpperCase();
    if (!currency) return { ok: false, error: "currency is required" };
    patch.currency = currency;
  }

  for (const key of ["referred_discount_type", "referrer_credit_type", "referrer_cash_type"]) {
    if (key in body) {
      const type = normalizeType(body[key]);
      if (type === "__invalid__") return { ok: false, error: `${key} must be fixed or percent` };
      patch[key] = type;
    }
  }

  for (const key of [
    "referred_discount_value",
    "referrer_credit_value",
    "referrer_credit_cap",
    "referrer_cash_value",
    "referrer_cash_cap",
    "min_purchase_amount",
    "minimum_cash_payout_amount",
  ]) {
    if (key in body) {
      const value = toNonNegativeInt(body[key], null);
      if (value === null && body[key] !== null && typeof body[key] !== "undefined" && body[key] !== "") {
        return { ok: false, error: `${key} must be >= 0` };
      }
      patch[key] = value;
    }
  }

  if ("eligible_purchase_types" in body) {
    if (!Array.isArray(body.eligible_purchase_types)) return { ok: false, error: "eligible_purchase_types must be an array" };
    const allowed = new Set(["plan", "token_pack", "seat_pack"]);
    const values = body.eligible_purchase_types.map((v) => String(v).trim()).filter(Boolean);
    if (values.some((v) => !allowed.has(v))) return { ok: false, error: "eligible_purchase_types contains an unsupported value" };
    patch.eligible_purchase_types = values;
  }

  if ("first_purchase_only" in body) patch.first_purchase_only = Boolean(body.first_purchase_only);
  if ("cash_payouts_enabled" in body) patch.cash_payouts_enabled = Boolean(body.cash_payouts_enabled);
  if ("metadata" in body) patch.metadata = isObject(body.metadata) ? body.metadata : {};

  return { ok: true, patch };
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = getEnv("SUPABASE_URL");
    const serviceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
    const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const authz = await authorizeAdminRequest(sb, req, corsHeaders, {
      requiredPermission: "admin.referrals.manage",
      action: "admin.referrals",
    });
    if (!authz.ok) return authz.response;

    const url = new URL(req.url);

    if (req.method === "GET") {
      const [programs, accounts, attributions, rewards, ledger, payoutRequests] = await Promise.all([
        sb
          .from("referral_programs")
          .select("id, program_key, name, status, currency, referred_discount_type, referred_discount_value, referrer_credit_type, referrer_credit_value, referrer_credit_cap, referrer_cash_type, referrer_cash_value, referrer_cash_cap, cash_payouts_enabled, minimum_cash_payout_amount, min_purchase_amount, eligible_purchase_types, first_purchase_only, metadata, created_at, updated_at")
          .order("created_at", { ascending: true }),
        sb.from("referral_accounts").select("id, user_id, referral_code, status, created_at").order("created_at", { ascending: false }).limit(100),
        sb
          .from("referral_attributions")
          .select("id, program_id, referrer_user_id, referred_user_id, referral_code, status, claimed_at, converted_payment_id, converted_at, metadata")
          .order("claimed_at", { ascending: false })
          .limit(100),
        sb
          .from("referral_rewards")
          .select("id, attribution_id, program_id, payment_id, referrer_user_id, referred_user_id, status, credit_amount, cash_amount, cash_status, cash_payout_request_id, cash_payout_requested_at, cash_paid_at, archived_at, archive_reason, currency, issued_at, reversed_at, metadata")
          .order("created_at", { ascending: false })
          .limit(100),
        sb
          .from("platform_credit_ledger")
          .select("id, user_id, tenant_id, entry_kind, status, amount, currency, payment_id, reward_id, metadata, created_at")
          .order("created_at", { ascending: false })
          .limit(200),
        sb
          .from("referral_cash_payout_requests")
          .select("id, user_id, status, amount, currency, payout_method, payout_details, note, requested_at, reviewed_by, reviewed_at, paid_at, rejected_reason, metadata, created_at, updated_at")
          .order("created_at", { ascending: false })
          .limit(100),
      ]);

      const issuedCredit = (rewards.data ?? [])
        .filter((row: any) => row.status === "issued")
        .reduce((sum: number, row: any) => sum + Number(row.credit_amount ?? 0), 0);
      const issuedCash = (rewards.data ?? [])
        .filter((row: any) => row.status === "issued")
        .reduce((sum: number, row: any) => sum + Number(row.cash_amount ?? 0), 0);
      const activeCash = (rewards.data ?? [])
        .filter((row: any) => row.status === "issued" && ["available", "requested", "approved"].includes(String(row.cash_status ?? "")))
        .reduce((sum: number, row: any) => sum + Number(row.cash_amount ?? 0), 0);
      const paidCash = (rewards.data ?? [])
        .filter((row: any) => row.cash_status === "paid")
        .reduce((sum: number, row: any) => sum + Number(row.cash_amount ?? 0), 0);
      const converted = (attributions.data ?? []).filter((row: any) => row.status === "converted").length;

      return json(200, {
        programs: programs.data ?? [],
        accounts: accounts.data ?? [],
        attributions: attributions.data ?? [],
        rewards: rewards.data ?? [],
        ledger: ledger.data ?? [],
        cash_payout_requests: payoutRequests.data ?? [],
        analytics: {
          referral_accounts: accounts.data?.length ?? 0,
          attributions: attributions.data?.length ?? 0,
          converted_attributions: converted,
          issued_credit: issuedCredit,
          issued_cash: issuedCash,
          active_cash: activeCash,
          paid_cash: paidCash,
        },
      });
    }

    if (req.method === "PATCH" && url.pathname.endsWith("/programs/default")) {
      const body = (await req.json().catch(() => ({}))) as Json;
      const validation = validateProgramPatch(body);
      if (!validation.ok) return json(400, { error: validation.error });

      const { data, error } = await sb
        .from("referral_programs")
        .update(validation.patch)
        .eq("program_key", "default")
        .select("id, program_key, name, status, currency, referred_discount_type, referred_discount_value, referrer_credit_type, referrer_credit_value, referrer_credit_cap, referrer_cash_type, referrer_cash_value, referrer_cash_cap, cash_payouts_enabled, minimum_cash_payout_amount, min_purchase_amount, eligible_purchase_types, first_purchase_only, metadata, created_at, updated_at")
        .maybeSingle();
      if (error) return json(500, { error: "Failed to update referral program", detail: error.message });
      return json(200, { program: data });
    }

    if (req.method === "POST" && url.pathname.endsWith("/cash-payouts/settle")) {
      const body = (await req.json().catch(() => ({}))) as Json;
      const requestId = String(body.request_id ?? "").trim();
      const action = String(body.action ?? body.status ?? "").trim().toLowerCase();
      const note = String(body.note ?? "").trim().slice(0, 2000) || null;
      const providerReference = String(body.provider_reference ?? "").trim().slice(0, 256) || null;
      if (!requestId) return json(400, { error: "request_id is required" });
      if (!["approve", "paid", "reject"].includes(action)) return json(400, { error: "action must be approve, paid, or reject" });

      const { data: requestRow, error: requestError } = await sb
        .from("referral_cash_payout_requests")
        .select("id, user_id, status, amount, currency, metadata")
        .eq("id", requestId)
        .maybeSingle();
      if (requestError) return json(500, { error: "Failed to load cash payout request", detail: requestError.message });
      if (!requestRow?.id) return json(404, { error: "Cash payout request not found" });

      const now = new Date().toISOString();
      const metadata = {
        ...(((requestRow as any).metadata ?? {}) as Json),
        admin_user_id: authz.context.userId,
        settlement_note: note,
        provider_reference: providerReference,
      };

      if (action === "approve") {
        const { data, error } = await sb
          .from("referral_cash_payout_requests")
          .update({
            status: "approved",
            reviewed_by: authz.context.userId,
            reviewed_at: now,
            metadata,
          })
          .eq("id", requestId)
          .in("status", ["requested", "approved"])
          .select("id, user_id, status, amount, currency, payout_method, payout_details, note, requested_at, reviewed_by, reviewed_at, paid_at, rejected_reason, metadata")
          .maybeSingle();
        if (error) return json(500, { error: "Failed to approve cash payout", detail: error.message });
        await sb.from("referral_rewards").update({ cash_status: "approved" }).eq("cash_payout_request_id", requestId).eq("cash_status", "requested");
        return json(200, { cash_payout_request: data });
      }

      if (action === "paid") {
        const { data, error } = await sb
          .from("referral_cash_payout_requests")
          .update({
            status: "paid",
            reviewed_by: authz.context.userId,
            reviewed_at: now,
            paid_at: now,
            metadata,
          })
          .eq("id", requestId)
          .in("status", ["requested", "approved", "paid"])
          .select("id, user_id, status, amount, currency, payout_method, payout_details, note, requested_at, reviewed_by, reviewed_at, paid_at, rejected_reason, metadata")
          .maybeSingle();
        if (error) return json(500, { error: "Failed to mark cash payout paid", detail: error.message });
        await sb
          .from("referral_rewards")
          .update({
            cash_status: "paid",
            cash_paid_at: now,
            archived_at: now,
            archive_reason: "cash_paid",
          })
          .eq("cash_payout_request_id", requestId)
          .in("cash_status", ["requested", "approved", "paid"]);
        return json(200, { cash_payout_request: data });
      }

      const { data, error } = await sb
        .from("referral_cash_payout_requests")
        .update({
          status: "rejected",
          reviewed_by: authz.context.userId,
          reviewed_at: now,
          rejected_reason: note ?? "Rejected by admin",
          metadata,
        })
        .eq("id", requestId)
        .in("status", ["requested", "approved"])
        .select("id, user_id, status, amount, currency, payout_method, payout_details, note, requested_at, reviewed_by, reviewed_at, paid_at, rejected_reason, metadata")
        .maybeSingle();
      if (error) return json(500, { error: "Failed to reject cash payout", detail: error.message });
      await sb
        .from("referral_rewards")
        .update({
          cash_status: "available",
          cash_payout_request_id: null,
          cash_payout_requested_at: null,
        })
        .eq("cash_payout_request_id", requestId)
        .in("cash_status", ["requested", "approved"]);
      return json(200, { cash_payout_request: data });
    }

    if (req.method === "POST" && url.pathname.endsWith("/credits/reverse")) {
      const body = (await req.json().catch(() => ({}))) as Json;
      const rewardId = String(body.reward_id ?? "").trim();
      const amountRaw = body.amount;
      const reason = String(body.reason ?? "admin_reversal").trim() || "admin_reversal";
      if (!rewardId) return json(400, { error: "reward_id is required" });

      const { data: reward, error: rewardError } = await sb
        .from("referral_rewards")
        .select("id, referrer_user_id, credit_amount, currency, status")
        .eq("id", rewardId)
        .maybeSingle();
      if (rewardError) return json(500, { error: "Failed to load reward", detail: rewardError.message });
      if (!reward) return json(404, { error: "Reward not found" });

      const amount = toNonNegativeInt(amountRaw, Number((reward as any).credit_amount ?? 0));
      if (!amount || amount <= 0) return json(400, { error: "amount must be positive" });

      const { data: inserted, error: insertError } = await sb
        .from("platform_credit_ledger")
        .insert({
          user_id: (reward as any).referrer_user_id,
          reward_id: reward.id,
          amount,
          currency: (reward as any).currency ?? "UZS",
          entry_kind: "reversal",
          status: "posted",
          metadata: { reason, admin_user_id: authz.context.userId },
        })
        .select("id, user_id, entry_kind, status, amount, currency, reward_id, metadata, created_at")
        .maybeSingle();
      if (insertError) return json(500, { error: "Failed to reverse credit", detail: insertError.message });

      await sb
        .from("referral_rewards")
        .update({ status: "reversed", reversed_at: new Date().toISOString(), metadata: { reason, admin_user_id: authz.context.userId } })
        .eq("id", reward.id);

      return json(200, { ledger_entry: inserted });
    }

    return json(404, { error: "Not found" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return json(500, { error: message });
  }
});
