import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { bearerToken, isInternalRequest } from "../_shared/internal-auth.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-worker-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors } });
const env = (key: string) => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Missing ${key}`);
  return value;
};
const text = (value: unknown, length = 200) => String(value ?? "").trim().slice(0, length);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const tokenError = (message: string) => {
  if (message.includes("used")) return { status: 409, message: "Link token already used" };
  if (message.includes("expired")) return { status: 410, message: "Link token expired" };
  if (message.includes("wrong_telegram")) return { status: 403, message: "This link belongs to another Telegram user" };
  if (message.includes("telegram_chat_already_linked")) return { status: 409, message: "This Telegram account is already linked to another Schood account. Unlink it there before trying again." };
  if (message.includes("schood_user_already_linked")) return { status: 409, message: "This Schood account is already linked to another Telegram account. Unlink it first." };
  if (message.includes("link_token_already_presented")) return { status: 409, message: "This link was already opened by another Telegram account. Generate a new link." };
  if (message.includes("not_presented")) return { status: 409, message: "Open the Telegram link before confirming." };
  return { status: 404, message: "Invalid link token" };
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "GET" && req.method !== "POST") return json(405, { error: "GET or POST only" });

  try {
    const supabaseUrl = env("SUPABASE_URL");
    const serviceRole = env("SUPABASE_SERVICE_ROLE_KEY");
    const sb = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });
    const url = new URL(req.url);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const action = text(url.searchParams.get("action") || body?.action || "generate", 40).toLowerCase();

    if (["validate", "unlink", "status"].includes(action)) {
      if (!(await isInternalRequest(req, serviceRole, Deno.env.get("TELEGRAM_INTERNAL_SECRET")))) {
        return json(401, { error: "Unauthorized" });
      }
      const chatId = text(url.searchParams.get("chat_id") || body?.chat_id, 80);
      if (!chatId || !/^-?\d{1,20}$/.test(chatId)) return json(400, { error: "valid chat_id required" });

      if (action === "validate") {
        const token = text(body?.token, 200);
        if (!token || !/^[A-Za-z0-9_-]{32,200}$/.test(token)) return json(400, { error: "valid token required" });
        const { data, error } = await sb.rpc("consume_telegram_link_token", { p_token: token, p_chat_id: chatId }).maybeSingle();
        if (error || !data) {
          const mapped = tokenError(error?.message ?? "invalid_link_token");
          console.warn(JSON.stringify({ event: "telegram_account_link_failed", reason: mapped.message, chat_id_suffix: chatId.slice(-4) }));
          return json(mapped.status, { error: mapped.message });
        }
        const linked = data as { user_id: string; display_name: string; acquisition_session_id: string | null; confirmation_required: boolean };
        return json(200, {
          ok: true,
          user_id: linked.user_id,
          name: linked.display_name,
          acquisition_session_id: linked.acquisition_session_id,
          confirmation_required: linked.confirmation_required,
        });
      }

      if (action === "unlink") {
        await sb.from("users").update({ telegram_chat_id: null }).eq("telegram_chat_id", chatId);
        await sb.from("academy_contacts").update({ telegram_id: null }).eq("telegram_id", chatId);
        return json(200, { ok: true });
      }

      const { data } = await sb.from("users").select("id,email,full_name").eq("telegram_chat_id", chatId).maybeSingle();
      return json(200, { linked: Boolean(data), user: data ? { id: data.id, name: data.full_name || data.email } : null });
    }

    if (!['generate', 'confirm'].includes(action)) return json(400, { error: "Unknown action" });
    const accessToken = bearerToken(req);
    if (!accessToken) return json(401, { error: "Unauthorized" });
    const authSb = createClient(supabaseUrl, env("SUPABASE_ANON_KEY"), { auth: { persistSession: false } });
    const { data: auth } = await authSb.auth.getUser(accessToken);
    if (!auth?.user) return json(401, { error: "Unauthorized" });
    const userId = auth.user.id;

    if (action === "confirm") {
      const token = text(body?.token, 200);
      if (!token || !/^[A-Za-z0-9_-]{32,200}$/.test(token)) return json(400, { error: "valid token required" });
      const { data, error } = await sb.rpc("confirm_telegram_link_token", { p_token: token, p_user_id: userId }).maybeSingle();
      if (error || !data) {
        const mapped = tokenError(error?.message ?? "invalid_link_token");
        return json(mapped.status, { error: mapped.message });
      }
      const linked = data as Record<string, unknown>;
      return json(200, { ok: true, linked: true, telegram_chat_id_suffix: String(linked.telegram_chat_id).slice(-4) });
    }

    const acquisitionSessionId = text(body?.acquisition_session_id, 80) || null;
    let boundTelegramUserId: string | null = null;
    if (acquisitionSessionId) {
      if (!uuidPattern.test(acquisitionSessionId)) return json(400, { error: "Invalid acquisition session" });
      const { data: session, error: sessionError } = await sb.from("telegram_acquisition_sessions")
        .select("id,telegram_user_id,status,expires_at").eq("id", acquisitionSessionId).maybeSingle();
      if (sessionError) throw new Error(sessionError.message);
      if (!session || session.status !== "active" || new Date(session.expires_at).getTime() <= Date.now()) {
        return json(410, { error: "Acquisition session expired" });
      }
      boundTelegramUserId = String(session.telegram_user_id);
    }

    const { data: userRow, error: userError } = await sb.from("users").select("telegram_chat_id").eq("id", userId).maybeSingle();
    if (userError) throw new Error(userError.message);
    const { data: tokenRow, error } = await sb.rpc("issue_telegram_link_token", {
      p_user_id: userId,
      p_telegram_user_id: boundTelegramUserId,
      p_acquisition_session_id: acquisitionSessionId,
    }).maybeSingle();
    if (error || !tokenRow) return json(500, { error: "Failed to generate link token" });
    const issuedToken = tokenRow as Record<string, unknown>;

    if (acquisitionSessionId) {
      const { error: eventError } = await sb.from("telegram_journey_events").insert({
        session_id: acquisitionSessionId,
        telegram_user_id: boundTelegramUserId,
        event_name: "account_link_started",
        step: "account_link",
        idempotency_key: `account_link_started:${issuedToken.token}`,
      });
      if (eventError && eventError.code !== "23505") throw new Error(eventError.message);
    }
    const botName = env("TELEGRAM_BOT_NAME").replace(/^@/, "");
    return json(200, {
      link_url: `https://t.me/${botName}?start=${issuedToken.token}`,
      token: issuedToken.token,
      expires_at: issuedToken.expires_at,
      already_linked: Boolean(userRow?.telegram_chat_id),
      resumes_acquisition_session: Boolean(acquisitionSessionId),
    });
  } catch (error) {
    console.error(JSON.stringify({ event: "telegram_link_error", error: error instanceof Error ? error.message : "unknown" }));
    return json(500, { error: "Telegram linking failed" });
  }
});
