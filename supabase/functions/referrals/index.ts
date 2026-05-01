import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Json = Record<string, unknown>;

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

const normalizeCode = (raw: unknown): string => String(raw ?? "").trim().toUpperCase();

const isObject = (value: unknown): value is Json => Boolean(value && typeof value === "object" && !Array.isArray(value));

const normalizeIdList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? "").trim()).filter(Boolean).slice(0, 100);
};

const randomReferralCode = (len = 8): string => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i += 1) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
};

const ensureUniqueReferralCode = async (sb: any): Promise<string> => {
  for (let i = 0; i < 10; i += 1) {
    const code = randomReferralCode(8);
    const { data } = await sb.from("referral_accounts").select("id").eq("referral_code", code).maybeSingle();
    if (!data) return code;
  }
  throw new Error("Failed to generate referral code");
};

const ensureReferralAccount = async (sb: any, userId: string): Promise<any> => {
  const { data: existing, error: existingError } = await sb
    .from("referral_accounts")
    .select("id, user_id, referral_code, status, metadata, created_at, updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing?.id) return existing;

  const code = await ensureUniqueReferralCode(sb);
  const { data: inserted, error: insertError } = await sb
    .from("referral_accounts")
    .insert({ user_id: userId, referral_code: code, status: "active", metadata: { source: "referrals.me" } })
    .select("id, user_id, referral_code, status, metadata, created_at, updated_at")
    .maybeSingle();
  if (insertError) throw insertError;
  return inserted;
};

const loadDefaultProgram = async (sb: any): Promise<any | null> => {
  const { data, error } = await sb
    .from("referral_programs")
    .select(
      "id, program_key, name, status, currency, referred_discount_type, referred_discount_value, referrer_credit_type, referrer_credit_value, referrer_credit_cap, referrer_cash_type, referrer_cash_value, referrer_cash_cap, cash_payouts_enabled, minimum_cash_payout_amount, min_purchase_amount, eligible_purchase_types, first_purchase_only, metadata, created_at, updated_at",
    )
    .eq("program_key", "default")
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = getEnv("SUPABASE_URL");
    const serviceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
    const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const token = getBearerToken(req);
    if (!token) return json(401, { error: "Unauthorized" });

    const { data: authData, error: authError } = await sb.auth.getUser(token);
    if (authError || !authData?.user) return json(401, { error: "Unauthorized" });

    const userId = authData.user.id;
    const url = new URL(req.url);

    if (req.method === "GET" && url.pathname.endsWith("/me")) {
      const account = await ensureReferralAccount(sb, userId);
      const program = await loadDefaultProgram(sb);
      const currency = String(program?.currency ?? "UZS").toUpperCase();
      const { data: creditData } = await sb.rpc("platform_credit_available", {
        p_user_id: userId,
        p_currency: currency,
      });

      const { data: attributions } = await sb
        .from("referral_attributions")
        .select("id, program_id, referrer_user_id, referred_user_id, referral_code, status, claimed_at, converted_payment_id, converted_at, metadata")
        .or(`referrer_user_id.eq.${userId},referred_user_id.eq.${userId}`)
        .order("claimed_at", { ascending: false })
        .limit(50);

      const { data: rewards } = await sb
        .from("referral_rewards")
        .select("id, attribution_id, payment_id, referrer_user_id, referred_user_id, status, credit_amount, cash_amount, cash_status, cash_payout_request_id, cash_payout_requested_at, cash_paid_at, archived_at, archive_reason, currency, issued_at, reversed_at, metadata")
        .or(`referrer_user_id.eq.${userId},referred_user_id.eq.${userId}`)
        .order("created_at", { ascending: false })
        .limit(50);

      const { data: rewardSummary } = await sb
        .from("referral_rewards")
        .select("status, referrer_user_id, credit_amount, cash_amount, cash_status, currency")
        .eq("referrer_user_id", userId)
        .limit(1000);

      const { data: cashPayoutRequests } = await sb
        .from("referral_cash_payout_requests")
        .select("id, user_id, status, amount, currency, payout_method, payout_details, note, requested_at, reviewed_at, paid_at, rejected_reason, metadata, created_at, updated_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50);

      const { data: ledger } = await sb
        .from("platform_credit_ledger")
        .select("id, amount, currency, entry_kind, status, payment_id, reward_id, metadata, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50);

      const earnedCredit = (rewards ?? [])
        .filter((row: any) => row.referrer_user_id === userId && row.status === "issued")
        .reduce((sum: number, row: any) => sum + Number(row.credit_amount ?? 0), 0);
      const cashRows = rewardSummary ?? [];
      const cashAvailable = cashRows
        .filter((row: any) => row.status === "issued" && row.cash_status === "available")
        .reduce((sum: number, row: any) => sum + Number(row.cash_amount ?? 0), 0);
      const cashRequested = cashRows
        .filter((row: any) => ["requested", "approved"].includes(String(row.cash_status ?? "")))
        .reduce((sum: number, row: any) => sum + Number(row.cash_amount ?? 0), 0);
      const cashPaid = cashRows
        .filter((row: any) => row.cash_status === "paid")
        .reduce((sum: number, row: any) => sum + Number(row.cash_amount ?? 0), 0);

      return json(200, {
        account,
        program,
        referral_url_path: `/r/${encodeURIComponent(account.referral_code)}`,
        legacy_referral_url_path: `/?ref=${encodeURIComponent(account.referral_code)}`,
        affiliate_urls: {
          landing: `/r/${encodeURIComponent(account.referral_code)}`,
          signup: `/auth?mode=signup&ref=${encodeURIComponent(account.referral_code)}`,
          plans: `/plans?ref=${encodeURIComponent(account.referral_code)}`,
        },
        credit: {
          currency,
          available_amount: Number(creditData ?? 0),
          earned_amount: earnedCredit,
        },
        cash: {
          currency,
          available_amount: cashAvailable,
          requested_amount: cashRequested,
          paid_amount: cashPaid,
          payouts_enabled: Boolean(program?.cash_payouts_enabled),
          minimum_payout_amount: Number(program?.minimum_cash_payout_amount ?? 0),
        },
        attributions: attributions ?? [],
        rewards: rewards ?? [],
        ledger: ledger ?? [],
        cash_payout_requests: cashPayoutRequests ?? [],
      });
    }

    if (req.method === "POST" && url.pathname.endsWith("/cash-payouts/request")) {
      const body = (await req.json().catch(() => ({}))) as Json;
      const program = await loadDefaultProgram(sb);
      const currency = String(program?.currency ?? "UZS").toUpperCase();
      if (!program?.cash_payouts_enabled) return json(400, { error: "Cash payouts are not enabled" });

      const payoutMethod = String(body.payout_method ?? "cash").trim().slice(0, 64) || "cash";
      const payoutDetails = isObject(body.payout_details) ? body.payout_details : {};
      const note = String(body.note ?? "").trim().slice(0, 2000) || null;
      const rewardIds = normalizeIdList(body.reward_ids);

      let query = sb
        .from("referral_rewards")
        .select("id, referrer_user_id, status, cash_amount, cash_status, currency")
        .eq("referrer_user_id", userId)
        .eq("status", "issued")
        .eq("cash_status", "available")
        .gt("cash_amount", 0)
        .eq("currency", currency)
        .order("created_at", { ascending: true })
        .limit(100);

      if (rewardIds.length > 0) query = query.in("id", rewardIds);

      const { data: rewards, error: rewardError } = await query;
      if (rewardError) return json(500, { error: "Failed to load cash rewards", detail: rewardError.message });

      const eligibleRewards = rewards ?? [];
      const amount = eligibleRewards.reduce((sum: number, row: any) => sum + Number(row.cash_amount ?? 0), 0);
      if (amount <= 0) return json(400, { error: "No cash rewards are available for payout" });

      const minimum = Number(program.minimum_cash_payout_amount ?? 0);
      if (minimum > 0 && amount < minimum) {
        return json(400, { error: `Minimum cash payout is ${minimum} ${currency}` });
      }

      const now = new Date().toISOString();
      const { data: requestRow, error: requestError } = await sb
        .from("referral_cash_payout_requests")
        .insert({
          user_id: userId,
          status: "requested",
          amount,
          currency,
          payout_method: payoutMethod,
          payout_details: payoutDetails,
          note,
          requested_at: now,
          metadata: { reward_count: eligibleRewards.length },
        })
        .select("id, user_id, status, amount, currency, payout_method, payout_details, note, requested_at, created_at")
        .maybeSingle();
      if (requestError || !requestRow?.id) {
        return json(500, { error: "Failed to create cash payout request", detail: requestError?.message });
      }

      const ids = eligibleRewards.map((row: any) => row.id);
      const { error: updateError } = await sb
        .from("referral_rewards")
        .update({
          cash_status: "requested",
          cash_payout_request_id: requestRow.id,
          cash_payout_requested_at: now,
        })
        .in("id", ids)
        .eq("referrer_user_id", userId)
        .eq("cash_status", "available");

      if (updateError) return json(500, { error: "Failed to reserve cash rewards", detail: updateError.message });

      return json(200, { cash_payout_request: requestRow, reward_ids: ids });
    }

    if (req.method === "POST" && url.pathname.endsWith("/claim")) {
      const body = (await req.json().catch(() => ({}))) as Json;
      const code = normalizeCode(body.code ?? body.referral_code);
      if (!code) return json(400, { error: "referral code is required" });

      await ensureReferralAccount(sb, userId);

      const { data: account, error: accountError } = await sb
        .from("referral_accounts")
        .select("user_id, referral_code, status")
        .eq("referral_code", code)
        .maybeSingle();
      if (accountError) return json(500, { error: "Failed to load referral code", detail: accountError.message });
      if (!account || account.status !== "active") return json(404, { error: "Referral code not found" });
      if (String(account.user_id) === userId) return json(400, { error: "Self-referral is not allowed" });

      const program = await loadDefaultProgram(sb);
      if (!program?.id) return json(400, { error: "Referral program is not configured" });

      const { data: existing, error: existingError } = await sb
        .from("referral_attributions")
        .select("id, program_id, referrer_user_id, referred_user_id, referral_code, status, claimed_at, converted_payment_id, converted_at, metadata")
        .eq("program_id", program.id)
        .eq("referred_user_id", userId)
        .maybeSingle();
      if (existingError) return json(500, { error: "Failed to load attribution", detail: existingError.message });
      if (existing?.id) return json(200, { attribution: existing, program });

      const { data: attribution, error: insertError } = await sb
        .from("referral_attributions")
        .insert({
          program_id: program.id,
          referrer_user_id: account.user_id,
          referred_user_id: userId,
          referral_code: code,
          status: "pending",
          metadata: { source: "referrals.claim" },
        })
        .select("id, program_id, referrer_user_id, referred_user_id, referral_code, status, claimed_at, converted_payment_id, converted_at, metadata")
        .maybeSingle();
      if (insertError) return json(500, { error: "Failed to claim referral", detail: insertError.message });

      return json(200, { attribution, program });
    }

    return json(404, { error: "Not found" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return json(500, { error: message });
  }
});
