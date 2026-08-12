/** Central Telegram notification gateway. All non-conversational sends pass policy here. */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isInternalRequest } from "../_shared/internal-auth.ts";
import {
  categoryForNotificationType,
  type NotificationCategory,
} from "../_shared/telegram-growth.ts";
import { classifyTelegramFailure, evaluateCurrentDeliveryPolicy } from "../_shared/telegram-delivery.ts";

const headers = { "Content-Type": "application/json" };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });
const env = (key: string) => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Missing ${key}`);
  return value;
};
const nowIso = () => new Date().toISOString();
const notificationCategories = new Set(["transactional", "academic_required", "study_habit", "commercial", "system"]);

type DbClient = ReturnType<typeof createClient<any>>;
type Candidate = {
  userId: string | null;
  chatId: string | null;
  text: string;
  notificationType: string;
  category: NotificationCategory;
  dedupeKey: string | null;
  metadata: Record<string, unknown>;
  ctaUrl: string | null;
  parseMode: string | null;
  replyMarkup?: unknown;
  disableNotification: boolean;
  mandatory: boolean;
};

const sendMessage = async (botToken: string, candidate: Candidate) => {
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: candidate.chatId,
        text: candidate.text,
        parse_mode: candidate.parseMode ?? undefined,
        reply_markup: candidate.replyMarkup,
        disable_notification: candidate.disableNotification,
        disable_web_page_preview: true,
      }),
    });
    const payload = await response.json().catch(() => ({ ok: false, description: `HTTP ${response.status}` }));
    return { ...payload, httpStatus: response.status } as Record<string, any>;
  } catch (error) {
    return { ok: false, httpStatus: 0, description: error instanceof Error ? error.message : "Telegram network error" };
  }
};

const specificPreference = (type: string, preferences: Record<string, any>): boolean => {
  if (/assignment/.test(type)) return preferences.assignment_reminders !== false;
  if (/class|schedule/.test(type)) return preferences.class_reminders !== false;
  if (/grade|score|result/.test(type)) return preferences.grade_notifications !== false && preferences.score_notifications !== false;
  if (/payment|invoice/.test(type)) return preferences.payment_notifications !== false;
  if (/vocab/.test(type)) return preferences.vocabulary_reminders !== false;
  if (/certificate/.test(type)) return preferences.certificate_notifications !== false;
  return true;
};

const categoryPreference = (category: NotificationCategory, preferences: Record<string, any>): boolean => {
  if (category === "academic_required") return preferences.academic_required_enabled !== false;
  if (category === "study_habit") return preferences.study_habit_enabled !== false;
  if (category === "commercial") return preferences.commercial_enabled === true;
  return true;
};

const frequencyWindowStart = (category: NotificationCategory): string | null => {
  if (category === "study_habit") return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  if (category === "commercial") return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  return null;
};

const currentPolicyDecision = async (sb: DbClient, candidate: Candidate) => {
  let preferences: Record<string, any> = {};
  if (candidate.userId) {
    const { data, error } = await sb.from("telegram_user_preferences").select("*").eq("user_id", candidate.userId).maybeSingle();
    if (error) throw new Error(`Failed to load Telegram preferences: ${error.message}`);
    preferences = data ?? {};
  }

  let recentCategoryCount = 0;
  const windowStart = frequencyWindowStart(candidate.category);
  if (candidate.userId && windowStart) {
    const { count, error } = await sb.from("platform_notifications").select("id", { count: "exact", head: true })
      .eq("user_id", candidate.userId).eq("channel", "telegram").eq("category", candidate.category)
      .eq("status", "sent").gte("sent_at", windowStart);
    if (error) throw new Error(`Failed to load Telegram delivery history: ${error.message}`);
    recentCategoryCount = count ?? 0;
  }

  return evaluateCurrentDeliveryPolicy({
    category: candidate.category,
    timezone: preferences.timezone,
    quietHoursStart: preferences.quiet_hours_start,
    quietHoursEnd: preferences.quiet_hours_end,
    notificationsEnabled: preferences.notifications_enabled !== false,
    telegramEnabled: preferences.telegram_enabled !== false,
    categoryEnabled: categoryPreference(candidate.category, preferences),
    specificEnabled: specificPreference(candidate.notificationType, preferences),
    recentCategoryCount,
    mandatory: candidate.mandatory,
  });
};

const reserveAndDeliver = async (sb: DbClient, botToken: string, candidate: Candidate) => {
  if (!candidate.chatId) {
    await sb.from("platform_notifications").insert({
      user_id: candidate.userId,
      channel: "telegram",
      type: candidate.notificationType,
      category: candidate.category,
      body: candidate.text,
      metadata: candidate.metadata,
      dedupe_key: candidate.dedupeKey,
      cta_url: candidate.ctaUrl,
      status: "skipped",
      suppression_reason: "no_telegram_linked",
      policy_decision: { outcome: "suppress", reason: "no_telegram_linked" },
    });
    return { ok: false, outcome: "suppressed", reason: "no_telegram_linked" };
  }

  const decision = await currentPolicyDecision(sb, candidate);

  const claimToken = decision.outcome === "send" ? crypto.randomUUID() : null;
  const initialStatus = decision.outcome === "defer" ? "queued" : decision.outcome === "suppress" ? "suppressed" : "processing";
  const { data: delivery, error: reserveError } = await sb.from("platform_notifications").insert({
    user_id: candidate.userId,
    chat_id: candidate.chatId,
    channel: "telegram",
    type: candidate.notificationType,
    category: candidate.category,
    body: candidate.text,
    metadata: { ...candidate.metadata, parse_mode: candidate.parseMode, reply_markup: candidate.replyMarkup, disable_notification: candidate.disableNotification, mandatory: candidate.mandatory },
    dedupe_key: candidate.dedupeKey,
    cta_url: candidate.ctaUrl,
    status: initialStatus,
    scheduled_at: decision.deliverAt ?? nowIso(),
    suppression_reason: decision.outcome === "suppress" ? decision.reason : null,
    policy_decision: decision,
    attempts: decision.outcome === "send" ? 1 : 0,
    claimed_at: decision.outcome === "send" ? nowIso() : null,
    last_attempt_at: decision.outcome === "send" ? nowIso() : null,
    claim_token: claimToken,
  }).select("id").maybeSingle();

  if (reserveError?.code === "23505" && candidate.dedupeKey) {
    const { data: existing } = await sb.from("platform_notifications")
      .select("status,scheduled_at,sent_at").eq("dedupe_key", candidate.dedupeKey).maybeSingle();
    if (existing?.status === "sent") return { ok: true, outcome: "sent", reason: "existing_delivery", sent_at: existing.sent_at };
    if (existing?.status === "queued") return { ok: false, outcome: "defer", reason: "existing_queue", deliver_at: existing.scheduled_at };
    if (existing?.status === "processing") return { ok: false, outcome: "defer", reason: "existing_processing" };
    if (existing?.status === "failed") return { ok: false, outcome: "failed", reason: "existing_failed_delivery" };
    return { ok: false, outcome: "suppressed", reason: "duplicate" };
  }
  if (reserveError || !delivery) throw new Error(`Notification reservation failed: ${reserveError?.message ?? "unknown"}`);
  if (decision.outcome !== "send") return { ok: false, outcome: decision.outcome, reason: decision.reason, deliver_at: decision.deliverAt };

  const result = await sendMessage(botToken, candidate);
  if (result.ok) {
    const messageId = Number(result.result?.message_id);
    await sb.from("platform_notifications").update({
      status: "sent", sent_at: nowIso(), error: null, claimed_at: null, claim_token: null,
      telegram_message_id: Number.isSafeInteger(messageId) ? messageId : null,
    }).eq("id", delivery.id).eq("status", "processing").eq("claim_token", claimToken);
    return { ok: true, outcome: "sent", message_id: result.result?.message_id ?? null };
  }

  const failure = classifyTelegramFailure(result, 1);
  const scheduledAt = failure.retryable
    ? new Date(Date.now() + Number(failure.retryAfterSeconds ?? 60) * 1000).toISOString()
    : nowIso();
  await sb.from("platform_notifications").update({
    status: failure.retryable ? "queued" : "failed",
    scheduled_at: scheduledAt,
    claimed_at: null,
    claim_token: null,
    suppression_reason: failure.retryable ? null : failure.reason,
    error: String(result.description ?? `Telegram HTTP ${result.httpStatus}`).slice(0, 1000),
  }).eq("id", delivery.id).eq("status", "processing").eq("claim_token", claimToken);
  return failure.retryable
    ? { ok: false, outcome: "deferred", reason: failure.reason, retry_at: scheduledAt }
    : { ok: false, outcome: "failed", reason: failure.reason };
};

const processQueue = async (sb: DbClient, botToken: string, limit: number) => {
  const { data: rows, error } = await sb.rpc("claim_telegram_notification_batch", {
    p_limit: Math.min(Math.max(limit, 1), 100),
  });
  if (error) throw new Error(error.message);
  let sent = 0;
  let failed = 0;
  let suppressed = 0;
  let deferred = 0;
  for (const row of rows ?? []) {
    const metadata = (row.metadata ?? {}) as Record<string, any>;
    const candidate: Candidate = {
      userId: row.user_id, chatId: row.chat_id, text: row.body, notificationType: row.type,
      category: row.category, dedupeKey: row.dedupe_key, ctaUrl: row.cta_url,
      metadata, parseMode: metadata.parse_mode === null ? null : String(metadata.parse_mode ?? "HTML"), replyMarkup: metadata.reply_markup,
      disableNotification: Boolean(metadata.disable_notification), mandatory: Boolean(metadata.mandatory),
    };
    const claimToken = String(row.claim_token ?? "");
    if (!claimToken) throw new Error(`Notification ${row.id} has no claim token`);
    const policy = await currentPolicyDecision(sb, candidate);
    if (policy.outcome === "suppress") {
      suppressed += 1;
      await sb.from("platform_notifications").update({
        status: "suppressed", suppression_reason: policy.reason, policy_decision: policy,
        claimed_at: null, claim_token: null,
      }).eq("id", row.id).eq("status", "processing").eq("claim_token", claimToken);
      continue;
    }
    if (policy.outcome === "defer") {
      deferred += 1;
      await sb.from("platform_notifications").update({
        status: "queued", scheduled_at: policy.deliverAt ?? new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        policy_decision: policy, claimed_at: null, claim_token: null,
      }).eq("id", row.id).eq("status", "processing").eq("claim_token", claimToken);
      continue;
    }

    const result = await sendMessage(botToken, candidate);
    const attempts = Number(row.attempts ?? 1);
    if (result.ok) {
      sent += 1;
      const messageId = Number(result.result?.message_id);
      await sb.from("platform_notifications").update({
        status: "sent", sent_at: nowIso(), error: null, claimed_at: null, claim_token: null,
        policy_decision: policy,
        telegram_message_id: Number.isSafeInteger(messageId) ? messageId : null,
      }).eq("id", row.id).eq("status", "processing").eq("claim_token", claimToken);
    } else {
      failed += 1;
      const failure = classifyTelegramFailure(result, attempts);
      const willRetry = failure.retryable && attempts < 4;
      await sb.from("platform_notifications").update({
        status: willRetry ? "queued" : "failed",
        scheduled_at: willRetry ? new Date(Date.now() + Number(failure.retryAfterSeconds ?? 60) * 1000).toISOString() : nowIso(),
        claimed_at: null,
        claim_token: null,
        suppression_reason: willRetry ? null : failure.reason,
        policy_decision: policy,
        error: String(result.description ?? "Telegram delivery failed").slice(0, 1000),
      }).eq("id", row.id).eq("status", "processing").eq("claim_token", claimToken);
    }
  }
  return { processed: rows?.length ?? 0, sent, failed, suppressed, deferred };
};

serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "POST only" });
  try {
    const serviceRole = env("SUPABASE_SERVICE_ROLE_KEY");
    if (!(await isInternalRequest(req, serviceRole, Deno.env.get("TELEGRAM_INTERNAL_SECRET")))) {
      return json(401, { error: "Unauthorized" });
    }
    const sb = createClient(env("SUPABASE_URL"), serviceRole, { auth: { persistSession: false } });
    const botToken = env("TELEGRAM_STUDENT_BOT_TOKEN");
    const body = await req.json().catch(() => ({}));
    if (body?.action === "process_queue") return json(200, await processQueue(sb, botToken, Number(body.limit ?? 50)));

    const text = String(body?.text ?? "").trim().slice(0, 4096);
    if (!text) return json(400, { error: "text is required" });
    const notificationType = String(body?.notification_type ?? "general").trim().toLowerCase().slice(0, 100);
    const requestedCategory = String(body?.category ?? "").trim().toLowerCase();
    const category = (notificationCategories.has(requestedCategory) ? requestedCategory : categoryForNotificationType(notificationType)) as NotificationCategory;
    const userIds: string[] = Array.isArray(body?.user_ids)
      ? [...new Set<string>(body.user_ids.map((value: unknown) => String(value)).filter(Boolean))].slice(0, 500)
      : body?.user_id ? [String(body.user_id)] : [];
    const recipients: Array<{ userId: string | null; chatId: string | null }> = [];
    if (userIds.length) {
      const { data } = await sb.from("users").select("id,telegram_chat_id").in("id", userIds);
      const byId = new Map((data ?? []).map((row: any) => [String(row.id), row.telegram_chat_id ? String(row.telegram_chat_id) : null]));
      for (const userId of userIds) recipients.push({ userId, chatId: byId.get(userId) ?? null });
    } else {
      const directChatId = body?.chat_id ? String(body.chat_id).trim() : null;
      let mappedUserId: string | null = null;
      if (directChatId) {
        const { data: mapped } = await sb.from("users").select("id").eq("telegram_chat_id", directChatId).maybeSingle();
        mappedUserId = mapped?.id ? String(mapped.id) : null;
      }
      recipients.push({ userId: mappedUserId, chatId: directChatId });
    }

    const results = [];
    for (const recipient of recipients) {
      results.push(await reserveAndDeliver(sb, botToken, {
        ...recipient,
        text,
        notificationType,
        category,
        dedupeKey: body?.dedupe_key ? `${String(body.dedupe_key).slice(0, 180)}:${recipient.userId ?? recipient.chatId}` : null,
        metadata: body?.metadata && typeof body.metadata === "object" ? body.metadata : {},
        ctaUrl: body?.cta_url ? String(body.cta_url).slice(0, 1000) : null,
        parseMode: Object.prototype.hasOwnProperty.call(body, "parse_mode") && body.parse_mode === null ? null : body?.parse_mode ? String(body.parse_mode) : "HTML",
        replyMarkup: body?.reply_markup,
        disableNotification: Boolean(body?.disable_notification),
        mandatory: Boolean(body?.mandatory) && (category === "system" || category === "transactional"),
      }));
    }
    return json(200, recipients.length === 1 ? results[0] : { results });
  } catch (error) {
    console.error(JSON.stringify({ event: "telegram_notification_gateway_failed", error: error instanceof Error ? error.message : "unknown" }));
    return json(500, { error: "Telegram notification processing failed" });
  }
});
