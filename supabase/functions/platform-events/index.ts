import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Json = Record<string, unknown>;

const EVENT_NAMES = new Set([
  "platform_home_viewed",
  "platform_path_selected",
  "english_discovery_viewed",
  "english_hub_viewed",
  "english_skill_selected",
  "signin_started",
  "signup_started",
  "pricing_viewed",
  "checkout_started",
  "authenticated_return_completed",
]);
const SURFACES = new Set(["platform", "english_hub"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SENSITIVE_METADATA_KEY = /(email|phone|name|token|password|secret|address|message)/i;

const env = (key: string): string => {
  const value = Deno.env.get(key)?.trim();
  if (!value) throw new Error(`Missing env var: ${key}`);
  return value;
};

const normalize = (value: unknown, maxLength: number): string => String(value ?? "").trim().slice(0, maxLength);

const allowedOrigin = (origin: string): boolean => {
  try {
    const url = new URL(origin);
    if (url.protocol === "https:" && (url.hostname === "schood.online" || url.hostname.endsWith(".schood.online"))) return true;
    return (url.protocol === "http:" || url.protocol === "https:") && ["127.0.0.1", "localhost"].includes(url.hostname);
  } catch {
    return false;
  }
};

const corsHeaders = (req: Request): Record<string, string> => {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": allowedOrigin(origin) ? origin : "https://schood.online",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
};

const jsonResponse = (req: Request, status: number, body: unknown, extra: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(req), ...extra },
  });

const cleanPath = (value: unknown): string | null => {
  const raw = normalize(value, 400);
  if (!raw.startsWith("/")) return null;
  const path = raw.split(/[?#]/, 1)[0].slice(0, 240);
  return path || "/";
};

const cleanMetadata = (value: unknown): Json => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Json = {};
  for (const [rawKey, rawValue] of Object.entries(value as Json).slice(0, 12)) {
    const key = normalize(rawKey, 40).replace(/[^a-z0-9_.-]/gi, "_");
    if (!key || SENSITIVE_METADATA_KEY.test(key)) continue;
    if (rawValue === null || typeof rawValue === "boolean") result[key] = rawValue;
    else if (typeof rawValue === "number" && Number.isFinite(rawValue)) result[key] = rawValue;
    else if (typeof rawValue === "string") result[key] = rawValue.slice(0, 160);
  }
  return result;
};

const hex = (buffer: ArrayBuffer): string =>
  Array.from(new Uint8Array(buffer)).map((value) => value.toString(16).padStart(2, "0")).join("");

const keyedHash = async (secret: string, value: string): Promise<string> => {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
};

const requestAddress = (req: Request): string =>
  normalize(req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown", 120);

const authenticatedUserId = async (sb: any, req: Request): Promise<string | null> => {
  const authorization = req.headers.get("authorization") ?? "";
  if (!authorization.toLowerCase().startsWith("bearer ")) return null;
  const token = authorization.slice(7).trim();
  if (!token) return null;
  const { data, error } = await sb.auth.getUser(token);
  return error ? null : data.user?.id ?? null;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return jsonResponse(req, 405, { error: "POST only" });

  const origin = req.headers.get("origin");
  if (origin && !allowedOrigin(origin)) return jsonResponse(req, 403, { error: "Origin not allowed" });
  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > 8_192) return jsonResponse(req, 413, { error: "Payload too large" });

  try {
    const body = await req.json() as Json;
    const visitorId = normalize(body.visitor_id, 36);
    const eventName = normalize(body.event_name, 80);
    const surface = normalize(body.surface, 40);
    const path = cleanPath(body.path);
    if (!UUID_PATTERN.test(visitorId) || !EVENT_NAMES.has(eventName) || !SURFACES.has(surface) || !path) {
      return jsonResponse(req, 400, { error: "Invalid journey event" });
    }

    const sb = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false },
    });
    const rateKey = await keyedHash(env("PUBLIC_JOURNEY_HASH_SECRET"), `${requestAddress(req)}\u001f${visitorId}`);
    const { data: rateLimit, error: rateLimitError } = await sb.rpc("platform_journey_rate_limit_consume", {
      p_rate_key: rateKey,
      p_window_seconds: 600,
      p_max_requests: 120,
    }).maybeSingle();
    if (rateLimitError || !rateLimit) throw new Error("rate_limit_check_failed");
    const rate = rateLimit as { allowed: boolean; retry_after_seconds: number };
    if (!rate.allowed) {
      const retryAfter = Math.max(1, Number(rate.retry_after_seconds ?? 60));
      return jsonResponse(req, 429, { error: "Too many requests", retry_after: retryAfter }, { "Retry-After": String(retryAfter) });
    }

    const userId = await authenticatedUserId(sb, req);
    const { error } = await sb.from("platform_journey_events").insert({
      visitor_id: visitorId,
      user_id: userId,
      event_name: eventName,
      surface,
      path,
      target: normalize(body.target, 120) || null,
      release_sha: normalize(body.release_sha, 64) || null,
      source: normalize(body.source, 120) || null,
      medium: normalize(body.medium, 120) || null,
      campaign: normalize(body.campaign, 120) || null,
      idempotency_key: normalize(body.idempotency_key, 500) || null,
      metadata: cleanMetadata(body.metadata),
    });
    if (error?.code === "23505") return jsonResponse(req, 202, { ok: true, duplicate: true });
    if (error) throw new Error(error.message);
    return jsonResponse(req, 202, { ok: true });
  } catch (error) {
    console.error(JSON.stringify({
      event: "platform_journey_event_failed",
      reason: error instanceof Error ? error.message : "unknown",
    }));
    return jsonResponse(req, 500, { error: "Journey event was not recorded" });
  }
});
