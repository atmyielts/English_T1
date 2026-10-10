import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { productView, voucherPreview } from "./preview.ts";
import { redeemVoucherRequest } from "./redemption.ts";
import { signStorageRef } from "../_shared/media-storage.ts";

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

const isObject = (value: unknown): value is Json => Boolean(value && typeof value === "object" && !Array.isArray(value));

const normalizeCode = (raw: unknown): string =>
  String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");

const normalizeSlug = (raw: unknown): string =>
  String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

const publicEventsEnabled = (center: any): boolean =>
  ["growth", "premium", "exclusive"].includes(String(center?.package_tier ?? "starter").trim().toLowerCase());

const publicCenterView = async (sb: any, center: any, tenant?: any) => ({
  tenant_id: center?.tenant_id ?? tenant?.id ?? null,
  name: center?.display_name ?? tenant?.name ?? "Education center",
  display_name: center?.display_name ?? tenant?.name ?? "Education center",
  slug: center?.slug ?? tenant?.slug ?? null,
  logo_url: isObject(center?.branding?.logo_storage)
    ? await signStorageRef(sb, center.branding.logo_storage, 60 * 60 * 6, { route: "voucher-redeem:center" })
    : center?.logo_url ?? null,
  status: center?.status ?? null,
  package_tier: center?.package_tier ?? null,
  public_instructions: center?.public_instructions ?? null,
  powered_by_schood: center?.powered_by_schood ?? true,
  branding: center?.branding ?? {},
});

const loadVoucher = async (sb: any, code: string) => {
  const { data, error } = await sb
    .from("partner_vouchers")
    .select(
      "*, products ( id, name, metadata ), experiences ( id, name ), plans ( id, name, duration_days, metadata, product_id ), academy_classrooms ( id, name, academy_id )",
    )
    .eq("code", code)
    .maybeSingle();
  if (error) throw error;
  return data;
};

const loadCenter = async (sb: any, tenantId: string) => {
  const { data, error } = await sb
    .from("partner_center_profiles")
    .select("tenant_id, display_name, slug, logo_url, status, package_tier, public_instructions, powered_by_schood, branding")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw error;
  return data;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = getEnv("SUPABASE_URL");
    const serviceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
    const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const url = new URL(req.url);
    const methodAction = req.method === "GET" ? url.searchParams.get("action") : null;

    if (req.method === "GET" && methodAction === "center") {
      const slug = normalizeSlug(url.searchParams.get("slug"));
      if (!slug) return json(400, { error: "slug is required" });
      const { data: center, error } = await sb
        .from("partner_center_profiles")
        .select("*, tenants ( id, name, slug )")
        .eq("slug", slug)
        .eq("status", "active")
        .maybeSingle();
      if (error) return json(500, { error: "Failed to load center" });
      if (!center?.tenant_id) return json(404, { error: "Center not found" });

      const events = await sb
        .from("partner_center_mock_events")
        .select("id, title, starts_at, mode, location, capacity, status, experience_id, metadata, experiences ( name )")
        .eq("tenant_id", center.tenant_id)
        .eq("status", "scheduled")
        .gte("starts_at", new Date().toISOString())
        .order("starts_at", { ascending: true })
        .limit(12);
      const publicEvents = publicEventsEnabled(center)
        ? (events.data ?? []).filter((event: any) => {
          const metadata = isObject(event?.metadata) ? event.metadata as Json : {};
          return metadata.visibility === "public" || metadata.public_event === true;
        }).slice(0, 6)
        : [];
      return json(200, {
        center: await publicCenterView(sb, center, center.tenants),
        services: { mock_exams: [], subscriptions: [] },
        events: publicEvents,
      });
    }

    const body = req.method === "POST" ? ((await req.json().catch(() => ({}))) as Json) : {};
    const action = req.method === "GET" ? methodAction : String(body.action ?? "preview");
    const code = normalizeCode(req.method === "GET" ? url.searchParams.get("code") : body.code);

    if (!code) return json(400, { error: "code is required" });
    const voucher = await loadVoucher(sb, code);
    if (!voucher?.id) {
      const { data: token } = await sb
        .from("exam_tokens")
        .select("id, token_code, status, expires_at, experiences ( id, name, products ( id, name, metadata ) )")
        .eq("token_code", code)
        .maybeSingle();
      if (!token?.id) return json(404, { error: "Voucher not found" });
      const status = token.expires_at && Date.parse(token.expires_at) < Date.now() ? "expired" : token.status;
      return json(200, {
        voucher: {
          id: token.id,
          code: token.token_code,
          access_kind: "mock_exam",
          status,
          expires_at: token.expires_at,
          center: null,
          product: productView((token as any).experiences?.products),
          experience: { id: (token as any).experiences?.id, name: (token as any).experiences?.name },
          plan: null,
        },
        redeem_action: "candidate_entry",
      });
    }

    const center = await publicCenterView(sb, await loadCenter(sb, voucher.tenant_id));
    const preview = voucherPreview(voucher, center);
    if (action === "preview" || req.method === "GET") {
      return json(200, {
        voucher: preview,
        redeem_action: voucher.access_kind === "mock_exam" ? "candidate_entry" : "authenticated_redeem",
      });
    }

    if (action !== "redeem") return json(400, { error: "Unsupported action" });

    if (voucher.access_kind !== "mock_exam") {
      const token = getBearerToken(req);
      if (!token) return json(401, { error: "Login is required to redeem this voucher" });
      const { data: authData, error: authError } = await sb.auth.getUser(token);
      if (authError || !authData?.user) return json(401, { error: "Login is required to redeem this voucher" });
      const outcome = await redeemVoucherRequest(sb, authData.user.id, voucher);
      if (outcome.status !== 200) return json(outcome.status, outcome.body);
      return json(200, {
        voucher: { ...preview, status: "redeemed", redeemed_at: outcome.body.redeemed_at },
        redeem_action: "open_product", grant: outcome.body.grant, deduped: outcome.body.deduped,
        next_url: preview.product?.app_url ?? "/account",
      });
    }
    const expiresAt = voucher.expires_at ? Date.parse(voucher.expires_at) : null;
    if (expiresAt && Date.now() > expiresAt) return json(400, { error: "Voucher has expired", voucher: { ...preview, status: "expired" } });
    if (voucher.status === "void") return json(400, { error: "Voucher is void", voucher: preview });
    if (voucher.status === "redeemed") return json(400, { error: "Voucher has already been redeemed", voucher: preview });
    if (voucher.status !== "unused") return json(400, { error: "Voucher is not available", voucher: preview });

    if (voucher.access_kind === "mock_exam") {
      return json(200, {
        voucher: preview,
        redeem_action: "candidate_entry",
        token_code: code,
      });
    }

    return json(400, { error: "Unsupported voucher access" });
  } catch {
    return json(503, { error: "Voucher confirmation is unavailable. Retry the same voucher in this account." });
  }
});
