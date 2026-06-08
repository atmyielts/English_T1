/**
 * send-telegram — unified Telegram notification sender.
 *
 * Called by every other edge function that needs to notify a user.
 * POST body:
 *   { user_id?, chat_id?, text, parse_mode?, reply_markup?, notification_type?, metadata? }
 *
 * Resolves chat_id from user_id if not provided. Logs to platform_notifications.
 * No-op (200) if user has no telegram_chat_id — never throws.
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...cors } });
const getEnv = (k: string) => { const v = Deno.env.get(k); if (!v) throw new Error(`Missing ${k}`); return v; };

const TG_API = "https://api.telegram.org";

const sendMessage = async (botToken: string, chatId: string, text: string, options?: { parse_mode?: string; reply_markup?: unknown; disable_notification?: boolean }) => {
  const res = await fetch(`${TG_API}/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, ...options }),
  });
  return res.ok ? (await res.json()) : { ok: false, error: await res.text() };
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "POST only" });

  try {
    const botToken = getEnv("TELEGRAM_BOT_TOKEN");
    const sb = createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

    const body = await req.json().catch(() => ({}));
    const text = String(body?.text ?? "").trim();
    if (!text) return json(400, { error: "text is required" });

    const notificationType = String(body?.notification_type ?? "general");
    const parseMode = body?.parse_mode ? String(body.parse_mode) : "HTML";
    const replyMarkup = body?.reply_markup ?? undefined;
    const metadata = body?.metadata && typeof body.metadata === "object" ? body.metadata : {};
    const disableNotif = Boolean(body?.disable_notification);

    // Resolve chat_id from user_id if needed
    let chatId = body?.chat_id ? String(body.chat_id).trim() : null;
    let userId = body?.user_id ? String(body.user_id).trim() : null;

    if (!chatId && userId) {
      const { data } = await sb.from("users").select("telegram_chat_id").eq("id", userId).maybeSingle();
      chatId = (data as any)?.telegram_chat_id ?? null;
    }

    // Handle multi-user broadcast (array of user_ids)
    if (!chatId && Array.isArray(body?.user_ids) && body.user_ids.length > 0) {
      const userIds = (body.user_ids as string[]).slice(0, 500);
      const { data: rows } = await sb.from("users").select("id, telegram_chat_id").in("id", userIds).not("telegram_chat_id", "is", null);
      let sent = 0, skipped = 0, failed = 0;
      for (const row of (rows ?? []) as Array<{ id: string; telegram_chat_id: string }>) {
        if (!row.telegram_chat_id) { skipped++; continue; }
        const result = await sendMessage(botToken, row.telegram_chat_id, text, { parse_mode: parseMode, reply_markup: replyMarkup, disable_notification: disableNotif });
        if (result.ok) {
          sent++;
          await sb.from("platform_notifications").insert({ user_id: row.id, chat_id: row.telegram_chat_id, channel: "telegram", type: notificationType, body: text, metadata, status: "sent", sent_at: new Date().toISOString() });
        } else {
          failed++;
          await sb.from("platform_notifications").insert({ user_id: row.id, chat_id: row.telegram_chat_id, channel: "telegram", type: notificationType, body: text, metadata, status: "failed", error: String(result.error ?? "") });
        }
      }
      return json(200, { sent, skipped, failed, total: userIds.length });
    }

    // Single message
    if (!chatId) {
      // Log as skipped — user not linked
      if (userId) await sb.from("platform_notifications").insert({ user_id: userId, channel: "telegram", type: notificationType, body: text, metadata, status: "skipped" }).catch(() => {});
      return json(200, { ok: false, reason: "no_telegram_linked" });
    }

    const result = await sendMessage(botToken, chatId, text, { parse_mode: parseMode, reply_markup: replyMarkup, disable_notification: disableNotif });
    const status = result.ok ? "sent" : "failed";

    await sb.from("platform_notifications").insert({
      user_id: userId ?? null, chat_id: chatId, channel: "telegram",
      type: notificationType, body: text, metadata, status,
      sent_at: result.ok ? new Date().toISOString() : null,
      error: result.ok ? null : String(result.error ?? result.description ?? ""),
    }).catch(() => {});

    return json(200, { ok: result.ok, message_id: result.result?.message_id ?? null });
  } catch (err) {
    return json(500, { error: err instanceof Error ? err.message : "Unknown" });
  }
});
