import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Json = Record<string, unknown>;

type StartSessionInput = {
  experience_id: string;
  metadata?: Json | null;
  tenant_id?: string | null;
  capability_key?: string | null;
};

type EntitlementRow = {
  id: string;
  tenant_id: string;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
  value: Json | null;
};

type SessionGuardrails = {
  enabled: boolean;
  maxConcurrentSessionsPerProduct: number;
  deviceWindowDays: number;
  maxDevicesPerWindow: number;
};

type DeviceRow = {
  id: string;
  seen_count: number | null;
};

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-user-jwt, x-client-info, apikey, content-type, x-device-fingerprint",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const getEnv = (key: string): string => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Missing env var: ${key}`);
  return value;
};

const getBearerToken = (req: Request): string | null => {
  const header = req.headers.get("Authorization") ?? "";
  if (header) return header.startsWith("Bearer ") ? header.slice(7) : header;
  const fallback = req.headers.get("x-user-jwt") ?? "";
  if (!fallback) return null;
  return fallback;
};

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

const normalizePositiveInt = (value: unknown, fallback: number, min: number, max: number): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = Math.floor(parsed);
  if (normalized < min || normalized > max) return fallback;
  return normalized;
};

const normalizeText = (value: string | null | undefined, maxLength: number): string | null => {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  return normalized.slice(0, maxLength);
};

const getClientIp = (req: Request): string | null => {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }

  const cfIp = req.headers.get("cf-connecting-ip");
  if (cfIp?.trim()) return cfIp.trim();

  const realIp = req.headers.get("x-real-ip");
  if (realIp?.trim()) return realIp.trim();

  return null;
};

const toHex = (bytes: Uint8Array): string => Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");

const sha256Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return toHex(new Uint8Array(digest));
};

const deriveDeviceKey = async (req: Request): Promise<string> => {
  const explicit = normalizeText(req.headers.get("x-device-fingerprint"), 256);
  if (explicit) return `fp:${explicit.toLowerCase()}`;

  const userAgent = normalizeText(req.headers.get("user-agent"), 500) ?? "unknown";
  const language = normalizeText(req.headers.get("accept-language"), 120) ?? "";
  const secUa = normalizeText(req.headers.get("sec-ch-ua"), 220) ?? "";
  const platform = normalizeText(req.headers.get("sec-ch-ua-platform"), 120) ?? "";
  return `ua:${await sha256Hex(`${userAgent}|${language}|${secUa}|${platform}`)}`;
};

const readSessionDeviceKey = (metadata: unknown): string | null => {
  if (!isObject(metadata)) return null;
  const raw = (metadata as Record<string, unknown>)._guardrail_device_key;
  return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;
};

const isRelationMissingError = (error: unknown): boolean => {
  const code = String((error as any)?.code ?? "");
  return code === "42P01" || code === "42703";
};

const loadSessionGuardrails = async (sb: any): Promise<SessionGuardrails> => {
  const defaults: SessionGuardrails = {
    enabled: true,
    maxConcurrentSessionsPerProduct: 1,
    deviceWindowDays: 30,
    maxDevicesPerWindow: 3,
  };

  const { data, error } = await sb.from("platform_settings").select("*").eq("id", 1).maybeSingle();
  if (error || !data) return defaults;

  const row = data as Record<string, unknown>;
  return {
    enabled: typeof row.anti_sharing_enabled === "boolean" ? row.anti_sharing_enabled : defaults.enabled,
    maxConcurrentSessionsPerProduct: normalizePositiveInt(
      row.anti_sharing_max_concurrent_sessions_per_product,
      defaults.maxConcurrentSessionsPerProduct,
      1,
      10,
    ),
    deviceWindowDays: normalizePositiveInt(row.anti_sharing_device_window_days, defaults.deviceWindowDays, 1, 365),
    maxDevicesPerWindow: normalizePositiveInt(
      row.anti_sharing_max_devices_per_window,
      defaults.maxDevicesPerWindow,
      1,
      20,
    ),
  };
};

const readAdaptivePath = (value: unknown): Record<string, unknown> | null => {
  if (!isObject(value)) return null;
  const path = (value as Record<string, unknown>).adaptive_path;
  return isObject(path) ? { ...path } : null;
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

const extractLimits = (value: unknown): Record<string, number> => {
  if (!isObject(value)) return {};
  const raw = (value as any).limits;
  if (!isObject(raw)) return {};
  const out: Record<string, number> = {};
  for (const [key, val] of Object.entries(raw)) {
    const num = typeof val === "number" ? val : Number(val);
    if (Number.isFinite(num) && num > 0) out[String(key)] = Math.floor(num);
  }
  return out;
};

const monthWindow = (now = new Date()): { start: string; end: string } => {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
};

const determineCapabilityKey = (metadata: Json | null | undefined, override?: string | null): string => {
  if (override && override.trim().length > 0) return override;
  const mode = String((metadata as any)?.mode ?? "").toLowerCase();
  const allowedSections = (metadata as any)?.allowed_section_ids;
  if (mode === "practice" || mode === "section_only") return "section_practice";
  if (Array.isArray(allowedSections) && allowedSections.length > 0) return "section_practice";
  return "full_mock_tests";
};

const normalizeSectionIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v)).filter((v) => v.trim().length > 0);
};

const sessionIncludesWriting = async (
  sb: any,
  experienceId: string,
  metadata: Json,
): Promise<boolean> => {
  const allowed = normalizeSectionIds((metadata as any)?.allowed_section_ids);
  if (allowed.length > 0) {
    const { data, error } = await sb
      .from("sections")
      .select("id")
      .in("id", allowed)
      .filter("metadata->>type", "eq", "writing")
      .limit(1);
    if (error) return false;
    return (data ?? []).length > 0;
  }

  const { data, error } = await sb
    .from("sections")
    .select("id, metadata")
    .eq("experience_id", experienceId)
    .filter("metadata->>type", "eq", "writing")
    .limit(1);
  if (error) return false;
  return (data ?? []).length > 0;
};

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...corsHeaders } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const supabaseUrl = getEnv("SUPABASE_URL");
    const supabaseAnonKey = getEnv("SUPABASE_ANON_KEY");
    const supabaseServiceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

    const token = getBearerToken(req);
    if (!token) return json(401, { error: "Unauthorized" });

    // Validate user token with anon key (same pattern as /me).
    const authClient = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } });
    const sb = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });

    const { data: authData, error: authError } = await authClient.auth.getUser(token);
    if (authError || !authData?.user) {
      console.error("start-session auth failed", {
        hasToken: Boolean(token),
        tokenPrefix: token.slice(0, 12),
        message: authError?.message ?? null,
      });
      return json(401, { error: "Unauthorized" });
    }

    const authedUserId = authData.user.id;
    const body = (await req.json()) as StartSessionInput;
    const experienceId = String(body?.experience_id ?? "");
    const metadata = (body?.metadata ?? {}) as Json;
    const sessionMetadata: Json = { ...(metadata ?? {}) };
    const clientIp = normalizeText(getClientIp(req), 120);
    const userAgent = normalizeText(req.headers.get("user-agent"), 500);
    const deviceKey = await deriveDeviceKey(req);

    if (!experienceId) return json(400, { error: "experience_id is required" });

    const { data: experienceRow, error: expErr } = await sb
      .from("experiences")
      .select("id, product_id, metadata")
      .eq("id", experienceId)
      .maybeSingle();

    if (expErr) return json(500, { error: "Failed to load experience", details: expErr });
    if (!experienceRow) return json(404, { error: "Experience not found" });

    const productId = String((experienceRow as any).product_id ?? "");
    const experienceMetadata = isObject((experienceRow as any)?.metadata) ? ((experienceRow as any).metadata as Record<string, unknown>) : {};
    const adaptivePath = readAdaptivePath(experienceMetadata);
    if (adaptivePath && !isObject((sessionMetadata as any).adaptive_path)) {
      (sessionMetadata as any).adaptive_path = adaptivePath;
    }

    const { data: userRow } = await sb.from("users").select("role").eq("id", authedUserId).maybeSingle();
    const isAdmin = String((userRow as any)?.role ?? "").toLowerCase() === "admin";

    let tenantId: string | null = body?.tenant_id ? String(body.tenant_id) : null;

    if (!tenantId) {
      const { data: memberships, error: memErr } = await sb
        .from("tenant_memberships")
        .select("tenant_id")
        .eq("user_id", authedUserId)
        .eq("status", "active")
        .order("created_at", { ascending: true });

      if (memErr) return json(500, { error: "Failed to load memberships", details: memErr });
      tenantId = (memberships ?? [])[0]?.tenant_id ?? null;
    }

    if (!tenantId) return json(403, { error: "No active tenant membership" });

    (sessionMetadata as any)._guardrail_device_key = deviceKey;
    if (clientIp) (sessionMetadata as any)._guardrail_client_ip = clientIp;
    if (userAgent) (sessionMetadata as any)._guardrail_user_agent = userAgent;

    if (!isAdmin) {
      const guardrails = await loadSessionGuardrails(sb);

      const { data: entitlement, error: entErr } = await sb
        .from("entitlements")
        .select("id, tenant_id, starts_at, ends_at, is_active, value")
        .eq("tenant_id", tenantId)
        .eq("resource_type", "product")
        .eq("resource_id", productId)
        .eq("is_active", true)
        .maybeSingle();

      if (entErr) return json(500, { error: "Failed to load entitlements", details: entErr });
      if (!entitlement || !isActiveEntitlement(entitlement as EntitlementRow)) {
        return json(403, { error: "No entitlement for product" });
      }

      if (guardrails.enabled) {
        const sessionLimit = Math.max(1, guardrails.maxConcurrentSessionsPerProduct);
        const { data: openSessions, error: openSessionsError } = await sb
          .from("sessions")
          .select("id, status, created_at, metadata, experiences!inner(product_id)")
          .eq("user_id", authedUserId)
          .eq("experiences.product_id", productId)
          .in("status", ["created", "active", "paused"])
          .order("created_at", { ascending: false })
          .limit(sessionLimit + 2);

        if (openSessionsError) return json(500, { error: "Failed to enforce active session guard", details: openSessionsError });
        const openRows = (openSessions ?? []) as Array<{ id: string; metadata: unknown }>;

        if (openRows.length >= sessionLimit) {
          const latest = openRows[0];
          const latestDeviceKey = readSessionDeviceKey(latest?.metadata);
          if (latest?.id && (!latestDeviceKey || latestDeviceKey === deviceKey)) {
            return json(200, { session_id: latest.id, reused: true });
          }

          return json(409, {
            error: "Another active session already exists for this product on a different device",
            code: "concurrent_session_limit_reached",
          });
        }

        let ledgerAvailable = true;
        let deviceRow: DeviceRow | null = null;
        const { data: knownDevice, error: knownDeviceError } = await sb
          .from("user_device_activity")
          .select("id, seen_count")
          .eq("user_id", authedUserId)
          .eq("device_key", deviceKey)
          .maybeSingle();

        if (knownDeviceError) {
          if (isRelationMissingError(knownDeviceError)) {
            ledgerAvailable = false;
          } else {
            return json(500, { error: "Failed to validate known device", details: knownDeviceError });
          }
        } else {
          deviceRow = (knownDevice as DeviceRow | null) ?? null;
        }

        if (ledgerAvailable && !deviceRow) {
          const cutoffIso = new Date(Date.now() - guardrails.deviceWindowDays * 24 * 60 * 60 * 1000).toISOString();
          const { count, error: countError } = await sb
            .from("user_device_activity")
            .select("id", { count: "exact", head: true })
            .eq("user_id", authedUserId)
            .gte("last_seen_at", cutoffIso);

          if (countError) {
            if (isRelationMissingError(countError)) {
              ledgerAvailable = false;
            } else {
              return json(500, { error: "Failed to enforce device window limit", details: countError });
            }
          } else if ((count ?? 0) >= Math.max(1, guardrails.maxDevicesPerWindow)) {
            return json(429, {
              error: `Too many devices used on this account in the last ${guardrails.deviceWindowDays} day(s)`,
              code: "device_limit_reached",
            });
          }
        }

        if (ledgerAvailable) {
          const nowIso = new Date().toISOString();

          if (deviceRow?.id) {
            const seenCount = Number(deviceRow.seen_count ?? 1);
            const { error: updateDeviceError } = await sb
              .from("user_device_activity")
              .update({
                last_seen_at: nowIso,
                last_ip: clientIp,
                last_user_agent: userAgent,
                last_product_id: productId,
                seen_count: Number.isFinite(seenCount) && seenCount > 0 ? seenCount + 1 : 1,
              })
              .eq("id", deviceRow.id);

            if (updateDeviceError) return json(500, { error: "Failed to update device activity", details: updateDeviceError });
          } else {
            const { error: insertDeviceError } = await sb.from("user_device_activity").insert({
              user_id: authedUserId,
              device_key: deviceKey,
              first_seen_at: nowIso,
              last_seen_at: nowIso,
              last_ip: clientIp,
              last_user_agent: userAgent,
              last_product_id: productId,
              seen_count: 1,
              metadata: { source: "start-session" },
            });

            if (insertDeviceError) return json(500, { error: "Failed to record device activity", details: insertDeviceError });
          }
        }
      }

      const capabilityKey = determineCapabilityKey(metadata, body?.capability_key ?? null);
      const limits = extractLimits((entitlement as any).value);
      const limit = limits[capabilityKey];

      if (limit && limit > 0) {
        const { start, end } = monthWindow();
        const { data: result, error: rpcErr } = await sb.rpc("consume_usage_counter", {
          p_tenant_id: tenantId,
          p_product_id: productId,
          p_capability_key: capabilityKey,
          p_period_start: start,
          p_period_end: end,
          p_amount: 1,
          p_total: limit,
        });

        if (rpcErr) return json(500, { error: "Failed to consume usage", details: rpcErr });

        const row = Array.isArray(result) ? result[0] : result;
        const allowed = Boolean(row?.allowed);
        if (!allowed) {
          return json(429, { error: "Usage limit reached", code: "usage_limit_reached", capability_key: capabilityKey });
        }
      }

      const includesWriting = await sessionIncludesWriting(sb, experienceId, metadata);
      const writingLimit = limits["writing_submissions"];
      if (includesWriting && writingLimit && writingLimit > 0) {
        const { start, end } = monthWindow();
        const { data: result, error: rpcErr } = await sb.rpc("consume_usage_counter", {
          p_tenant_id: tenantId,
          p_product_id: productId,
          p_capability_key: "writing_submissions",
          p_period_start: start,
          p_period_end: end,
          p_amount: 1,
          p_total: writingLimit,
        });

        if (rpcErr) return json(500, { error: "Failed to consume usage", details: rpcErr });

        const row = Array.isArray(result) ? result[0] : result;
        const allowed = Boolean(row?.allowed);
        if (!allowed) {
          return json(429, { error: "Writing limit reached", code: "usage_limit_reached", capability_key: "writing_submissions" });
        }

        (sessionMetadata as any).writing_credit_reserved = true;
      }
    }

    const { data: sessionRow, error: insertErr } = await sb
      .from("sessions")
      .insert({
        user_id: authedUserId,
        experience_id: experienceId,
        status: "active",
        started_at: new Date().toISOString(),
        metadata: sessionMetadata,
      })
      .select("id")
      .maybeSingle();

    if (insertErr) return json(500, { error: "Failed to create session", details: insertErr });

    return json(200, { session_id: (sessionRow as any)?.id ?? null });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return json(500, { error: message });
  }
});
