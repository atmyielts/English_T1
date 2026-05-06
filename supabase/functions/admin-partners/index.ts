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

const toPositiveInt = (value: unknown): number | null => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const sb = createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
    const authz = await authorizeAdminRequest(sb, req, corsHeaders, {
      requiredPermission: "admin.partners.manage",
      action: "admin.partners",
    });
    if (!authz.ok) return authz.response;

    const url = new URL(req.url);

    if (req.method === "GET") {
      const [profiles, topups, vouchers] = await Promise.all([
        sb
          .from("partner_center_profiles")
          .select("*, tenants ( id, name, slug, type )")
          .order("updated_at", { ascending: false })
          .limit(200),
        sb
          .from("partner_wallet_ledger")
          .select("id, tenant_id, user_id, entry_kind, status, amount, currency, metadata, created_at")
          .eq("entry_kind", "topup")
          .eq("status", "reserved")
          .order("created_at", { ascending: false })
          .limit(100),
        sb
          .from("partner_vouchers")
          .select("tenant_id, status")
          .limit(5000),
      ]);
      if (profiles.error) return json(500, { error: "Failed to load partners", detail: profiles.error.message });
      if (topups.error) return json(500, { error: "Failed to load top-ups", detail: topups.error.message });

      const voucherCounts = new Map<string, Record<string, number>>();
      for (const row of vouchers.data ?? []) {
        const tenantId = String((row as any).tenant_id ?? "");
        if (!tenantId) continue;
        const counts = voucherCounts.get(tenantId) ?? {};
        counts.total = (counts.total ?? 0) + 1;
        const status = String((row as any).status ?? "unknown");
        counts[status] = (counts[status] ?? 0) + 1;
        voucherCounts.set(tenantId, counts);
      }

      const rows = [];
      for (const profile of profiles.data ?? []) {
        const tenantId = String((profile as any).tenant_id);
        const { data: balance } = await sb.rpc("partner_wallet_available", { p_tenant_id: tenantId, p_currency: "UZS" });
        rows.push({
          ...profile,
          wallet: { currency: "UZS", available_amount: Number(balance ?? 0) },
          voucher_counts: voucherCounts.get(tenantId) ?? {},
        });
      }

      return json(200, { partners: rows, topup_requests: topups.data ?? [] });
    }

    if (req.method === "PATCH" && url.pathname.endsWith("/profile")) {
      const body = (await req.json().catch(() => ({}))) as Json;
      const tenantId = String(body.tenant_id ?? "").trim();
      if (!tenantId) return json(400, { error: "tenant_id is required" });
      const patch: Json = {};
      for (const key of ["display_name", "slug", "logo_url", "status", "package_tier", "commercial_model", "public_instructions"]) {
        if (key in body) patch[key] = body[key];
      }
      if ("powered_by_schood" in body) patch.powered_by_schood = Boolean(body.powered_by_schood);
      if ("branding" in body) patch.branding = isObject(body.branding) ? body.branding : {};
      if ("commission_rules" in body) patch.commission_rules = isObject(body.commission_rules) ? body.commission_rules : {};
      if ("wholesale_pricing" in body) patch.wholesale_pricing = isObject(body.wholesale_pricing) ? body.wholesale_pricing : {};
      if ("wallet_settings" in body) patch.wallet_settings = isObject(body.wallet_settings) ? body.wallet_settings : {};

      const { data, error } = await sb
        .from("partner_center_profiles")
        .update(patch)
        .eq("tenant_id", tenantId)
        .select("*")
        .maybeSingle();
      if (error) return json(500, { error: "Failed to update partner", detail: error.message });
      return json(200, { partner: data });
    }

    if (req.method === "POST" && url.pathname.endsWith("/wallet")) {
      const body = (await req.json().catch(() => ({}))) as Json;
      const action = String(body.action ?? "").trim();
      const tenantId = String(body.tenant_id ?? "").trim();
      if (!tenantId) return json(400, { error: "tenant_id is required" });

      if (action === "settle_topup") {
        const ledgerId = String(body.ledger_id ?? "").trim();
        const nextStatus = String(body.status ?? "posted").trim();
        if (!ledgerId) return json(400, { error: "ledger_id is required" });
        if (!["posted", "void"].includes(nextStatus)) return json(400, { error: "status must be posted or void" });
        const { data, error } = await sb
          .from("partner_wallet_ledger")
          .update({
            status: nextStatus,
            metadata: { admin_user_id: authz.context.userId, settlement_note: body.note ?? null },
          })
          .eq("id", ledgerId)
          .eq("tenant_id", tenantId)
          .eq("status", "reserved")
          .select("*")
          .maybeSingle();
        if (error) return json(500, { error: "Failed to settle top-up", detail: error.message });
        if (!data?.id) return json(404, { error: "Reserved top-up not found" });
        return json(200, { ledger_entry: data });
      }

      if (action === "adjust") {
        const amount = toPositiveInt(body.amount);
        const entryKind = String(body.entry_kind ?? "adjustment");
        if (!amount) return json(400, { error: "amount must be positive" });
        if (!["adjustment", "credit", "refund", "debit", "commission"].includes(entryKind)) return json(400, { error: "Unsupported entry_kind" });
        const { data, error } = await sb
          .from("partner_wallet_ledger")
          .insert({
            tenant_id: tenantId,
            entry_kind: entryKind,
            status: "posted",
            amount,
            currency: String(body.currency ?? "UZS").toUpperCase(),
            created_by: authz.context.userId,
            metadata: { admin_user_id: authz.context.userId, note: body.note ?? null },
          })
          .select("*")
          .maybeSingle();
        if (error) return json(500, { error: "Failed to adjust wallet", detail: error.message });
        return json(200, { ledger_entry: data });
      }
    }

    return json(404, { error: "Not found" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return json(500, { error: message });
  }
});
