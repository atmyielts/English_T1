export type ClickOpsAlertSeverity = "warn" | "critical";

export type ClickOpsAlertDecision = {
  event: string;
  severity: ClickOpsAlertSeverity;
} | null;

type AlertClassificationInput = {
  httpStatus: number;
  protocolError: number;
  signatureVerified: boolean;
};

const ALERT_WINDOW_MS = 60 * 60 * 1000;
const SAFE_DETAIL_KEYS = new Set([
  "action",
  "correlation_id",
  "http_status",
  "payment_id",
  "protocol_error",
]);

export const classifyClickOpsAlert = (
  input: AlertClassificationInput,
): ClickOpsAlertDecision => {
  if (input.httpStatus >= 500) {
    return { event: "callback_internal_failure", severity: "critical" };
  }
  if (input.protocolError === -1) {
    return { event: "callback_signature_rejected", severity: "warn" };
  }
  if (input.signatureVerified && input.protocolError === -2) {
    return { event: "signed_amount_mismatch", severity: "critical" };
  }
  if (input.signatureVerified && input.protocolError === -6) {
    return { event: "signed_transaction_mismatch", severity: "warn" };
  }
  if (input.signatureVerified && input.protocolError === -3) {
    return { event: "signed_action_rejected", severity: "warn" };
  }
  return null;
};

export const clickOpsAlertDedupeKey = (
  event: string,
  nowMs = Date.now(),
): string => {
  const bucket = Math.floor(nowMs / ALERT_WINDOW_MS);
  return `click-public-ops:${event}:${bucket}`;
};

export const sanitizeClickOpsAlertDetail = (
  detail: Record<string, unknown>,
): Record<string, string | number | null> => {
  const safe: Record<string, string | number | null> = {};
  for (const [key, value] of Object.entries(detail)) {
    if (!SAFE_DETAIL_KEYS.has(key)) continue;
    if (value === null || typeof value === "number") safe[key] = value;
    else safe[key] = String(value).slice(0, 160);
  }
  return safe;
};

export const notifyClickOperators = async (input: {
  supabase: any;
  publicBotToken: string;
  event: string;
  severity: ClickOpsAlertSeverity;
  detail: Record<string, unknown>;
  fetchImpl?: typeof fetch;
}): Promise<{ delivered: number; recipients: number }> => {
  const { data: admins, error } = await input.supabase
    .from("users")
    .select("id,telegram_chat_id")
    .eq("role", "admin")
    .not("telegram_chat_id", "is", null)
    .limit(20);
  if (error) {
    throw new Error(`CLICK alert recipient lookup failed: ${error.message}`);
  }

  const recipientMap = new Map<string, string>();
  for (const row of admins ?? []) {
    const userId = String(row.id ?? "").trim();
    const chatId = String(row.telegram_chat_id ?? "").trim();
    if (userId && chatId) recipientMap.set(userId, chatId);
  }
  const recipients = [...recipientMap.entries()].map(([userId, chatId]) => ({
    userId,
    chatId,
  }));
  if (recipients.length === 0) return { delivered: 0, recipients: 0 };

  const safeDetail = sanitizeClickOpsAlertDetail(input.detail);
  const detailLines = Object.entries(safeDetail)
    .map(([key, value]) => `${key}: ${value ?? "null"}`)
    .join("\n");
  const text = [
    `[CLICK ${input.severity.toUpperCase()}] ${input.event}`,
    detailLines,
    "Review Admin > Payments before changing payment state.",
  ].filter(Boolean).join("\n");

  const fetchImpl = input.fetchImpl ?? fetch;
  let delivered = 0;
  for (const recipient of recipients) {
    const claimToken = crypto.randomUUID();
    const now = new Date().toISOString();
    const dedupeKey = `${
      clickOpsAlertDedupeKey(input.event)
    }:${recipient.userId}`;
    const { data: reservation, error: reservationError } = await input.supabase
      .from("platform_notifications")
      .insert({
        user_id: recipient.userId,
        chat_id: recipient.chatId,
        channel: "telegram",
        type: `click_ops_${input.event}`.slice(0, 100),
        category: "system",
        body: text,
        metadata: {
          source: "click_edge",
          bot_scope: "public_ops",
          severity: input.severity,
          mandatory: true,
          parse_mode: null,
          ...safeDetail,
        },
        dedupe_key: dedupeKey,
        status: "processing",
        scheduled_at: now,
        attempts: 1,
        claimed_at: now,
        last_attempt_at: now,
        claim_token: claimToken,
      })
      .select("id")
      .maybeSingle();

    if (reservationError?.code === "23505") continue;
    if (reservationError || !reservation) {
      throw new Error(
        `CLICK alert reservation failed: ${
          reservationError?.message ?? "unknown"
        }`,
      );
    }

    const response = await fetchImpl(
      `https://api.telegram.org/bot${input.publicBotToken}/sendMessage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: recipient.chatId,
          text,
          disable_web_page_preview: true,
        }),
      },
    );
    const payload = await response.json().catch(() => ({}));
    const telegramOk = response.ok && (payload as any)?.ok === true;
    const messageId = Number((payload as any)?.result?.message_id);
    await input.supabase.from("platform_notifications").update({
      status: telegramOk ? "sent" : "failed",
      sent_at: telegramOk ? new Date().toISOString() : null,
      telegram_message_id: telegramOk && Number.isSafeInteger(messageId)
        ? messageId
        : null,
      error: telegramOk ? null : String(
        (payload as any)?.description ??
          `Telegram HTTP ${response.status}`,
      ).slice(0, 1000),
      claimed_at: null,
      claim_token: null,
    }).eq("id", reservation.id).eq("status", "processing").eq(
      "claim_token",
      claimToken,
    );
    if (telegramOk) delivered += 1;
  }
  return { delivered, recipients: recipients.length };
};
