import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Json = Record<string, unknown>;

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

const getEnv = (key: string): string => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Missing env var: ${key}`);
  return value;
};

const normalizeText = (value: unknown, maxLen = 500): string => String(value ?? "").trim().slice(0, maxLen);
const normalizeEmail = (value: unknown): string => normalizeText(value, 320).toLowerCase();

const hex = (buffer: ArrayBuffer): string =>
  Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, "0")).join("");

const hmac = async (key: string | Uint8Array, message: string): Promise<ArrayBuffer> => {
  const encoder = new TextEncoder();
  const rawKey = typeof key === "string" ? encoder.encode(key) : key;
  const keyData = rawKey.buffer.slice(rawKey.byteOffset, rawKey.byteOffset + rawKey.byteLength) as ArrayBuffer;
  const cryptoKey = await crypto.subtle.importKey("raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message));
};

const timingSafeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

const readTelegramContext = async (initData: string): Promise<Json | null> => {
  const botToken = Deno.env.get("TELEGRAM_PUBLIC_BOT_TOKEN") || Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
  if (!initData || !botToken) return null;

  const params = new URLSearchParams(initData);
  const receivedHash = params.get("hash") ?? "";
  if (!receivedHash) return null;

  const pairs: string[] = [];
  params.forEach((value, key) => {
    if (key !== "hash") pairs.push(`${key}=${value}`);
  });
  pairs.sort();

  const secret = new Uint8Array(await hmac("WebAppData", botToken));
  const expectedHash = hex(await hmac(secret, pairs.join("\n")));
  if (!timingSafeEqual(expectedHash, receivedHash)) return null;

  const authDate = Number(params.get("auth_date") ?? 0);
  if (!Number.isFinite(authDate) || authDate <= 0) return null;
  if (Math.floor(Date.now() / 1000) - authDate > 60 * 60 * 24 * 7) return null;

  const userRaw = params.get("user");
  if (!userRaw) return null;
  try {
    const parsed = JSON.parse(userRaw) as Json;
    return {
      telegram_user_id: normalizeText(parsed.id, 80),
      first_name: normalizeText(parsed.first_name, 120) || null,
      last_name: normalizeText(parsed.last_name, 120) || null,
      username: normalizeText(parsed.username, 120) || null,
      auth_date: authDate,
    };
  } catch {
    return null;
  }
};

const inferContact = (contact: string) => {
  const clean = contact.trim();
  if (clean.includes("@") && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
    return { email: clean.toLowerCase(), telegram: null };
  }
  if (clean.startsWith("@") || /^https?:\/\/t\.me\//i.test(clean)) {
    return { email: "telegram-lead@schood.online", telegram: clean };
  }
  return { email: "telegram-lead@schood.online", telegram: clean || null };
};

const logEvent = async (
  sb: ReturnType<typeof createClient<any>>,
  args: { action: string; status: string; telegramUserId?: string | null; metadata?: Json },
) => {
  await sb.from("telegram_app_events").insert({
    user_id: null,
    telegram_user_id: args.telegramUserId ?? null,
    action: args.action,
    status: args.status,
    metadata: args.metadata ?? {},
  }).then(() => undefined, () => undefined);
};

const createLead = async (sb: ReturnType<typeof createClient<any>>, body: Json) => {
  const contact = normalizeText(body.contact, 320);
  const message = normalizeText(body.message, 4000);
  if (!contact) return { status: 400, body: { error: "contact is required" } };
  if (!message) return { status: 400, body: { error: "message is required" } };

  const role = normalizeText(body.role, 80) || "exploring";
  const goal = normalizeText(body.goal, 200);
  const name = normalizeText(body.name, 120) || "Telegram visitor";
  const telegramContext = await readTelegramContext(normalizeText(body.initData ?? body.init_data, 12000));
  const inferred = inferContact(contact);
  const email = normalizeEmail(body.email) || inferred.email;
  const telegram = normalizeText(body.telegram, 120) || inferred.telegram || (telegramContext?.username ? `@${telegramContext.username}` : null);
  const subject = goal ? `Telegram ecosystem: ${goal}` : `Telegram ecosystem: ${role}`;
  const sourceUrl = normalizeText(body.source_url, 1000);

  const { data, error } = await sb.from("support_messages").insert({
    user_id: null,
    name,
    email,
    telegram,
    subject,
    message,
    source: "telegram_public_bot",
    service_slug: "telegram-public",
    metadata: {
      role,
      goal,
      contact,
      source_url: sourceUrl,
      telegram_chat_id: telegramContext?.telegram_user_id ?? null,
      telegram_user_id: telegramContext?.telegram_user_id ?? null,
      telegram_username: telegramContext?.username ?? null,
      telegram_context: telegramContext,
    },
    status: "new",
  }).select("id,status,created_at").maybeSingle();

  await logEvent(sb, {
    action: "public_lead_create",
    status: error ? "error" : "ok",
    telegramUserId: telegramContext?.telegram_user_id ? String(telegramContext.telegram_user_id) : null,
    metadata: { role, goal, source_url: sourceUrl, error: error?.message },
  });

  if (error) return { status: 500, body: { error: "Failed to create support request", detail: error.message } };
  return { status: 200, body: { ok: true, message: data } };
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "POST only" });

  try {
    const body = (await req.json().catch(() => ({}))) as Json;
    const action = normalizeText(body.action, 80).toLowerCase() || "bootstrap";
    const sb = createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

    if (action === "bootstrap") return json(200, { ok: true, site_url: Deno.env.get("SITE_URL") ?? "https://schood.online" });
    if (action === "lead_create" || action === "support_create") {
      const result = await createLead(sb, body);
      return json(result.status, result.body);
    }

    return json(400, { error: "Unknown action" });
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : "Unknown error" });
  }
});
