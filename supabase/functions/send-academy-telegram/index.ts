/** Dedicated delivery gateway for Academy staff and group Telegram messages. */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isInternalRequest } from "../_shared/internal-auth.ts";
import { classifyTelegramFailure } from "../_shared/telegram-delivery.ts";

const headers = { "Content-Type": "application/json" };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });
const clean = (value: unknown, max = 600): string => String(value ?? "").trim().slice(0, max);
const env = (key: string): string => {
  const value = Deno.env.get(key)?.trim();
  if (!value) throw new Error(`Missing ${key}`);
  return value;
};

type Db = ReturnType<typeof createClient<any>>;
type TelegramResult = {
  ok?: boolean;
  httpStatus?: number;
  description?: string;
  parameters?: { retry_after?: number };
  result?: { message_id?: number };
};

const sendMessage = async (body: Record<string, unknown>): Promise<TelegramResult> => {
  try {
    const response = await fetch(`https://api.telegram.org/bot${env("ACADEMY_TELEGRAM_BOT_TOKEN")}/sendMessage`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({ ok: false, description: `HTTP ${response.status}` }));
    return { ...payload, httpStatus: response.status } as TelegramResult;
  } catch (error) {
    return { ok: false, httpStatus: 0, description: error instanceof Error ? error.message : "Telegram network error" };
  }
};

const localMinutes = (timezone: string): number => {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
    const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
    const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
    return hour * 60 + minute;
  } catch {
    return new Date().getUTCHours() * 60 + new Date().getUTCMinutes();
  }
};
const clockMinutes = (value: unknown): number | null => {
  const match = /^(\d{2}):(\d{2})/.exec(clean(value, 8));
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
};
const inQuietHours = (timezone: string, startRaw: unknown, endRaw: unknown): boolean => {
  const start = clockMinutes(startRaw); const end = clockMinutes(endRaw);
  if (start === null || end === null || start === end) return false;
  const now = localMinutes(timezone);
  return start < end ? now >= start && now < end : now >= start || now < end;
};
const nextClockOccurrence = (timezone: string, clockRaw: unknown): string => {
  const target = clockMinutes(clockRaw) ?? 8 * 60;
  const current = localMinutes(timezone);
  let minutes = target - current;
  if (minutes <= 0) minutes += 24 * 60;
  return new Date(Date.now() + minutes * 60_000).toISOString();
};

const recordAttempt = async (
  sb: Db,
  notification: Record<string, any>,
  status: "sent" | "failed" | "skipped",
  errorMessage: string | null,
  providerMessageId: string | null,
  metadata: Record<string, unknown> = {},
) => {
  await sb.from("academy_notification_delivery_attempts").insert({
    academy_id: notification.academy_id,
    notification_id: notification.id,
    attempt_number: Number(notification.attempts ?? 0) + 1,
    channel: "telegram",
    provider: "academy_telegram_bot_api",
    status,
    error_message: errorMessage ? clean(errorMessage, 1000) : null,
    provider_message_id: providerMessageId,
    metadata,
  });
};

const processNotification = async (sb: Db, notification: Record<string, any>) => {
  const claimToken = crypto.randomUUID();
  const { data: claimed, error: claimError } = await sb.from("academy_notifications")
    .update({ status: "processing", claim_token: claimToken, claimed_at: new Date().toISOString(), last_attempt_at: new Date().toISOString(), attempts: Number(notification.attempts ?? 0) + 1 })
    .eq("id", notification.id).eq("academy_id", notification.academy_id).eq("status", "queued")
    .select("id").maybeSingle();
  if (claimError) throw new Error(`Failed to claim Academy Telegram delivery: ${claimError.message}`);
  if (!claimed?.id) return { outcome: "already_claimed" };

  const { data: settings, error: settingsError } = await sb.from("academy_telegram_settings")
    .select("enabled,timezone,digest_time").eq("academy_id", notification.academy_id).maybeSingle();
  if (settingsError) throw new Error(`Failed to load Academy Telegram settings: ${settingsError.message}`);
  if (settings?.enabled !== true) {
    await sb.from("academy_notifications").update({ status: "suppressed", suppression_reason: "academy_telegram_disabled", policy_decision: { outcome: "suppress", reason: "academy_telegram_disabled" }, claim_token: null, claimed_at: null }).eq("id", notification.id).eq("claim_token", claimToken);
    await recordAttempt(sb, notification, "skipped", "Academy Telegram is disabled", null);
    return { outcome: "suppressed", reason: "academy_telegram_disabled" };
  }

  let chatId = clean(notification.target, 40);
  let threadId: number | null = null;
  let binding: Record<string, any> | null = null;
  let subscription: Record<string, any> | null = null;
  if (notification.audience_kind === "group") {
    const { data, error } = await sb.from("academy_telegram_chats").select("*")
      .eq("academy_id", notification.academy_id).eq("id", notification.chat_binding_id).maybeSingle();
    if (error) throw new Error(`Failed to load Telegram group: ${error.message}`);
    binding = data;
    if (!binding?.id || binding.status !== "active") {
      await sb.from("academy_notifications").update({ status: "failed", error: "Telegram group is not active", claim_token: null, claimed_at: null }).eq("id", notification.id).eq("claim_token", claimToken);
      await recordAttempt(sb, notification, "failed", "Telegram group is not active", null);
      return { outcome: "failed", reason: "inactive_group" };
    }
    chatId = clean(binding.chat_id, 40);
    threadId = binding.message_thread_id ? Number(binding.message_thread_id) : null;
    const result = await sb.from("academy_telegram_chat_subscriptions").select("*")
      .eq("academy_id", notification.academy_id).eq("chat_binding_id", binding.id).eq("event_type", notification.type).maybeSingle();
    if (result.error) throw new Error(`Failed to load group subscription: ${result.error.message}`);
    subscription = result.data;
    if (!subscription?.enabled || subscription.delivery_mode === "off") {
      await sb.from("academy_notifications").update({ status: "suppressed", suppression_reason: "group_subscription_off", policy_decision: { outcome: "suppress", reason: "group_subscription_off" }, claim_token: null, claimed_at: null }).eq("id", notification.id).eq("claim_token", claimToken);
      await recordAttempt(sb, notification, "skipped", "Group subscription is off", null);
      return { outcome: "suppressed", reason: "group_subscription_off" };
    }
    const timezone = clean(settings.timezone, 80) || "Asia/Tashkent";
    const digestAlreadyReleased = notification.policy_decision?.digest_released === true;
    const shouldDeferDigest = subscription.delivery_mode === "daily_digest" && !digestAlreadyReleased;
    const shouldDeferQuiet = inQuietHours(timezone, subscription.quiet_hours_start, subscription.quiet_hours_end);
    if (shouldDeferDigest || shouldDeferQuiet) {
      const reason = shouldDeferDigest ? "daily_digest" : "group_quiet_hours";
      const deferUntil = shouldDeferDigest
        ? nextClockOccurrence(timezone, settings.digest_time)
        : new Date(Date.now() + 60 * 60_000).toISOString();
      await sb.from("academy_notifications").update({ status: "queued", scheduled_at: deferUntil, policy_decision: { outcome: "defer", reason, release_after: deferUntil, digest_released: digestAlreadyReleased || shouldDeferDigest }, attempts: Number(notification.attempts ?? 0), claim_token: null, claimed_at: null }).eq("id", notification.id).eq("claim_token", claimToken);
      return { outcome: "deferred", deliver_at: deferUntil };
    }
  } else if (!chatId && notification.user_id) {
    const { data } = await sb.from("users").select("telegram_chat_id").eq("id", notification.user_id).maybeSingle();
    chatId = clean(data?.telegram_chat_id, 40);
  }

  if (!chatId) {
    await sb.from("academy_notifications").update({ status: "skipped", error: "No Academy Telegram destination", claim_token: null, claimed_at: null }).eq("id", notification.id).eq("claim_token", claimToken);
    await recordAttempt(sb, notification, "skipped", "No Academy Telegram destination", null);
    return { outcome: "skipped", reason: "no_destination" };
  }

  const text = `${notification.title ? `${clean(notification.title, 160)}\n\n` : ""}${clean(notification.body, 3500)}`;
  const result = await sendMessage({
    chat_id: chatId,
    message_thread_id: threadId ?? undefined,
    text,
    disable_web_page_preview: true,
    disable_notification: Boolean(notification.metadata?.disable_notification),
    reply_markup: notification.cta_url ? { inline_keyboard: [[{ text: clean(notification.metadata?.cta_label, 60) || "Open Schood", url: notification.cta_url }]] } : undefined,
  });
  if (result.ok) {
    const messageId = Number(result.result?.message_id ?? 0) || null;
    await sb.from("academy_notifications").update({ status: "sent", sent_at: new Date().toISOString(), error: null, telegram_message_id: messageId, claim_token: null, claimed_at: null, policy_decision: { outcome: "sent" } }).eq("id", notification.id).eq("claim_token", claimToken);
    await recordAttempt(sb, notification, "sent", null, messageId ? String(messageId) : null);
    if (binding?.id) await sb.from("academy_telegram_chats").update({ last_verified_at: new Date().toISOString(), last_error: null, status: "active" }).eq("id", binding.id);
    return { outcome: "sent", message_id: messageId };
  }

  const decision = classifyTelegramFailure(result, Number(notification.attempts ?? 0) + 1);
  const retryable = decision.retryable && Number(notification.attempts ?? 0) + 1 < 5;
  const retryAt = retryable ? new Date(Date.now() + Number(decision.retryAfterSeconds ?? 60) * 1000).toISOString() : null;
  await sb.from("academy_notifications").update({
    status: retryable ? "queued" : "failed",
    scheduled_at: retryAt ?? notification.scheduled_at,
    error: clean(result.description ?? decision.reason, 400),
    claim_token: null,
    claimed_at: null,
    policy_decision: { outcome: retryable ? "defer" : "failed", reason: decision.reason, retry_at: retryAt },
  }).eq("id", notification.id).eq("claim_token", claimToken);
  await recordAttempt(sb, notification, "failed", result.description ?? decision.reason, null, { retryable, retry_at: retryAt });
  if (binding?.id && ["blocked", "permanent"].includes(decision.reason)) {
    await sb.from("academy_telegram_chats").update({ status: "degraded", last_error: clean(result.description ?? decision.reason, 400), last_verified_at: new Date().toISOString() }).eq("id", binding.id);
  }
  return { outcome: retryable ? "deferred" : "failed", reason: decision.reason, retry_at: retryAt };
};

serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });
  try {
    const serviceRole = env("SUPABASE_SERVICE_ROLE_KEY");
    if (!(await isInternalRequest(req, serviceRole, Deno.env.get("TELEGRAM_INTERNAL_SECRET")))) return json(401, { error: "Unauthorized" });
    const sb = createClient(env("SUPABASE_URL"), serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    if (body.action !== "process_queue") return json(400, { error: "Unsupported action" });
    const limit = Math.min(Math.max(Number(body.limit ?? 50), 1), 100);
    const { data, error } = await sb.from("academy_notifications").select("*")
      .eq("channel", "telegram").eq("bot_kind", "academy_staff").eq("status", "queued")
      .lte("scheduled_at", new Date().toISOString()).order("scheduled_at").limit(limit);
    if (error) throw new Error(`Failed to load Academy Telegram queue: ${error.message}`);
    const outcomes: Record<string, number> = {};
    for (const notification of data ?? []) {
      const result = await processNotification(sb, notification);
      outcomes[result.outcome] = (outcomes[result.outcome] ?? 0) + 1;
    }
    return json(200, { processed: data?.length ?? 0, outcomes });
  } catch (error) {
    return json(500, { error: "Academy Telegram delivery failed", detail: clean(error instanceof Error ? error.message : error, 800) });
  }
});
