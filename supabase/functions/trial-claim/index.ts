import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type JsonObject = Record<string, unknown>;

type PlatformSettings = {
  trial_enabled: boolean;
  trial_days: number;
  trial_once_per_user: boolean;
  trial_limits: JsonObject | null;
  trial_product_overrides: JsonObject | null;
};

type EffectiveTrialConfig = {
  trial_enabled: boolean;
  trial_days: number;
  trial_limits: Record<string, number>;
};

type LoadContextSuccess = {
  userId: string;
  tenantId: string;
  settings: PlatformSettings;
};

type LoadContextError = {
  status: number;
  error: string;
  details?: unknown;
};

type LoadContextResult = LoadContextSuccess | LoadContextError;

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-user-jwt, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const getEnv = (key: string): string => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Missing env var: ${key}`);
  return value;
};

const getBearerToken = (req: Request): string | null => {
  const xUser = req.headers.get("x-user-jwt");
  if (xUser && xUser.trim()) return xUser.trim();

  const header = req.headers.get("Authorization") ?? "";
  if (!header) return null;

  const value = header.startsWith("Bearer ") ? header.slice(7) : header;
  // Defensive: don't treat publishable/service keys as user JWT.
  if (value.startsWith("sb_")) return null;
  return value;
};

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...corsHeaders } });

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const normalizeLimits = (value: unknown): Record<string, number> => {
  if (!isObject(value)) return {};
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value)) {
    const n = typeof raw === "number" ? raw : Number(raw);
    if (Number.isFinite(n) && n > 0) out[String(key)] = Math.floor(n);
  }
  return out;
};

const resolveEffectiveTrialConfig = (
  settings: PlatformSettings,
  productId: string,
): EffectiveTrialConfig => {
  const fallback: EffectiveTrialConfig = {
    trial_enabled: Boolean(settings.trial_enabled),
    trial_days: Number(settings.trial_days ?? 0),
    trial_limits: normalizeLimits(settings.trial_limits),
  };

  if (!isObject(settings.trial_product_overrides)) return fallback;
  const raw = settings.trial_product_overrides[productId];
  if (!isObject(raw)) return fallback;

  const resolved: EffectiveTrialConfig = { ...fallback };
  if (typeof raw.trial_enabled === "boolean") resolved.trial_enabled = raw.trial_enabled;

  const trialDays = typeof raw.trial_days === "number" ? raw.trial_days : Number(raw.trial_days);
  if (Number.isFinite(trialDays) && trialDays > 0) resolved.trial_days = Math.floor(trialDays);

  if ("trial_limits" in raw) resolved.trial_limits = normalizeLimits(raw.trial_limits);
  return resolved;
};

const isActiveEntitlement = (row: { starts_at: string | null; ends_at: string | null; is_active: boolean }): boolean => {
  if (!row.is_active) return false;
  const now = Date.now();
  const startsAt = row.starts_at ? Date.parse(row.starts_at) : null;
  const endsAt = row.ends_at ? Date.parse(row.ends_at) : null;
  if (startsAt && now < startsAt) return false;
  if (endsAt && now > endsAt) return false;
  return true;
};

const decodeJwtSub = (token: string): string | null => {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const payload = parts[1]
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(parts[1].length / 4) * 4, "=");
    const json = JSON.parse(atob(payload)) as Record<string, unknown>;
    const sub = typeof json.sub === "string" ? json.sub.trim() : "";
    return sub.length > 0 ? sub : null;
  } catch {
    return null;
  }
};

const loadContext = async (
  sb: any,
  authClient: any,
  token: string,
): Promise<LoadContextResult> => {
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  const userId = authData?.user?.id ?? decodeJwtSub(token);
  if (!userId) {
    console.error("trial-claim auth failed", {
      hasToken: Boolean(token),
      tokenPrefix: token.slice(0, 12),
      message: authError?.message ?? null,
    });
    return { status: 401 as const, error: "Unauthorized" };
  }

  const { data: memberships, error: memErr } = await sb
    .from("tenant_memberships")
    .select("tenant_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  if (memErr) return { status: 500 as const, error: "Failed to load memberships", details: memErr };

  const membershipRows = (memberships ?? []) as Array<{ tenant_id: string | null }>;
  const tenantId = membershipRows[0]?.tenant_id ?? null;
  if (!tenantId) return { status: 403 as const, error: "No active tenant membership" };

  const { data: settings, error: settingsErr } = await sb
    .from("platform_settings")
    .select("trial_enabled, trial_days, trial_once_per_user, trial_limits, trial_product_overrides")
    .eq("id", 1)
    .maybeSingle();

  if (settingsErr || !settings) {
    return { status: 500 as const, error: "Failed to load platform settings", details: settingsErr };
  }

  return { userId, tenantId, settings: settings as PlatformSettings };
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET" && req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const supabaseUrl = getEnv("SUPABASE_URL");
    const anonKey = getEnv("SUPABASE_ANON_KEY");
    const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

    const token = getBearerToken(req);
    if (!token) {
      console.error("trial-claim missing user token");
      return json(401, { error: "Unauthorized", code: "missing_user_token" });
    }

    const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
    const sb = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    const url = new URL(req.url);
    const productId = String(url.searchParams.get("product_id") ?? "").trim();

    if (req.method === "GET") {
      if (!productId) return json(400, { error: "product_id is required" });

      const ctx = await loadContext(sb, authClient, token);
      if ("status" in ctx) return json(ctx.status, { error: ctx.error, code: "auth_failed", details: (ctx as any).details ?? null });

      const { userId, tenantId, settings } = ctx;
      const effective = resolveEffectiveTrialConfig(settings, productId);

      const { data: product, error: productErr } = await sb
        .from("products")
        .select("id,name,status")
        .eq("id", productId)
        .eq("status", "active")
        .maybeSingle();
      if (productErr) return json(500, { error: "Failed to load product", details: productErr });
      if (!product) return json(404, { error: "Product not found" });

      const { data: claim, error: claimErr } = await sb
        .from("trial_claims")
        .select("id,claimed_at,expires_at")
        .eq("user_id", userId)
        .eq("product_id", productId)
        .maybeSingle();
      if (claimErr) return json(500, { error: "Failed to load trial claim", details: claimErr });

      const { data: ent, error: entErr } = await sb
        .from("entitlements")
        .select("id,is_active,starts_at,ends_at")
        .eq("tenant_id", tenantId)
        .eq("resource_type", "product")
        .eq("resource_id", productId)
        .eq("is_active", true)
        .maybeSingle();
      if (entErr) return json(500, { error: "Failed to load entitlement", details: entErr });

      const hasActiveEntitlement = !!ent && isActiveEntitlement(ent as any);
      const limits = effective.trial_limits;

      let reason: string | null = null;
      let eligible = true;

      if (!effective.trial_enabled) {
        eligible = false;
        reason = "trial_disabled";
      } else if ((effective.trial_days ?? 0) <= 0) {
        eligible = false;
        reason = "invalid_trial_days";
      } else if (settings.trial_once_per_user && !!claim) {
        eligible = false;
        reason = "already_claimed";
      } else if (hasActiveEntitlement) {
        eligible = false;
        reason = "already_entitled";
      }

      return json(200, {
        product_id: productId,
        trial_enabled: effective.trial_enabled,
        trial_days: effective.trial_days,
        trial_limits: limits,
        claimable: eligible,
        reason,
        already_claimed: !!claim,
        claim: claim ?? null,
        already_entitled: hasActiveEntitlement,
      });
    }

    // POST /trial-claim?product_id=<uuid>
    if (!productId) return json(400, { error: "product_id is required" });

    const ctx = await loadContext(sb, authClient, token);
    if ("status" in ctx) return json(ctx.status, { error: ctx.error, code: "auth_failed", details: (ctx as any).details ?? null });

    const { userId, tenantId, settings } = ctx;
    const effective = resolveEffectiveTrialConfig(settings, productId);

    if (!effective.trial_enabled) return json(409, { error: "Trial is disabled" });
    if ((effective.trial_days ?? 0) <= 0) return json(500, { error: "Trial days are not configured" });

    const { data: product, error: productErr } = await sb
      .from("products")
      .select("id,name,status")
      .eq("id", productId)
      .eq("status", "active")
      .maybeSingle();
    if (productErr) return json(500, { error: "Failed to load product", details: productErr });
    if (!product) return json(404, { error: "Product not found" });

    const { data: existingEnt, error: existingEntErr } = await sb
      .from("entitlements")
      .select("id,is_active,starts_at,ends_at")
      .eq("tenant_id", tenantId)
      .eq("resource_type", "product")
      .eq("resource_id", productId)
      .eq("is_active", true)
      .maybeSingle();
    if (existingEntErr) return json(500, { error: "Failed to check entitlement", details: existingEntErr });
    if (existingEnt && isActiveEntitlement(existingEnt as any)) {
      return json(409, { error: "Access is already active for this product" });
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const endsAtIso = new Date(now.getTime() + effective.trial_days * 24 * 60 * 60 * 1000).toISOString();
    const normalizedLimits = effective.trial_limits;

    // 1) Insert claim row first to guarantee one-claim semantics.
    const { data: claimRow, error: claimInsertErr } = await sb
      .from("trial_claims")
      .insert({
        user_id: userId,
        tenant_id: tenantId,
        product_id: productId,
        expires_at: endsAtIso,
        metadata: { limits: normalizedLimits, days: effective.trial_days },
      })
      .select("id,claimed_at,expires_at")
      .maybeSingle();

    if (claimInsertErr) {
      if (String((claimInsertErr as any).code ?? "") === "23505") {
        return json(409, { error: "Trial already claimed for this product" });
      }
      return json(500, { error: "Failed to create trial claim", details: claimInsertErr });
    }

    try {
      const entitlementValue: JsonObject = {
        trial: true,
        trial_days: effective.trial_days,
        trial_claimed_at: nowIso,
        trial_expires_at: endsAtIso,
        limits: normalizedLimits,
      };

      const { data: entitlement, error: entitlementErr } = await sb
        .from("entitlements")
        .upsert(
          {
            user_id: userId,
            tenant_id: tenantId,
            resource_type: "product",
            resource_id: productId,
            is_active: true,
            starts_at: nowIso,
            ends_at: endsAtIso,
            source: "trial",
            value: entitlementValue,
          },
          { onConflict: "tenant_id,resource_type,resource_id" },
        )
        .select("id,starts_at,ends_at")
        .maybeSingle();

      if (entitlementErr || !entitlement) {
        await sb.from("trial_claims").delete().eq("id", claimRow?.id ?? "");
        return json(500, { error: "Failed to grant trial entitlement", details: entitlementErr });
      }

      const { error: claimUpdateErr } = await sb
        .from("trial_claims")
        .update({ entitlement_id: entitlement.id })
        .eq("id", claimRow?.id ?? "");

      if (claimUpdateErr) {
        // non-fatal; claim is valid and entitlement is granted
      }

      return json(200, {
        ok: true,
        product_id: productId,
        trial_days: effective.trial_days,
        trial_limits: normalizedLimits,
        claim: claimRow,
        entitlement,
      });
    } catch (innerErr) {
      await sb.from("trial_claims").delete().eq("id", claimRow?.id ?? "");
      const message = innerErr instanceof Error ? innerErr.message : "Unknown error";
      return json(500, { error: message });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return json(500, { error: message });
  }
});
