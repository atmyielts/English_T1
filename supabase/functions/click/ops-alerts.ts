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
  return `click-ops:${event}:${bucket}`;
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
  supabaseUrl: string;
  serviceRoleKey: string;
  event: string;
  severity: ClickOpsAlertSeverity;
  detail: Record<string, unknown>;
  fetchImpl?: typeof fetch;
}): Promise<{ delivered: number; recipients: number }> => {
  const { data: admins, error } = await input.supabase
    .from("users")
    .select("id")
    .eq("role", "admin")
    .not("telegram_chat_id", "is", null)
    .limit(20);
  if (error) {
    throw new Error(`CLICK alert recipient lookup failed: ${error.message}`);
  }

  const userIds = [
    ...new Set(
      (admins ?? []).map((row: any) => String(row.id ?? "").trim()).filter(
        Boolean,
      ),
    ),
  ];
  if (userIds.length === 0) return { delivered: 0, recipients: 0 };

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
  const response = await fetchImpl(
    `${input.supabaseUrl}/functions/v1/send-telegram`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${input.serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        user_ids: userIds,
        notification_type: `click_ops_${input.event}`.slice(0, 100),
        category: "system",
        mandatory: true,
        parse_mode: null,
        dedupe_key: clickOpsAlertDedupeKey(input.event),
        text,
        metadata: {
          source: "click_edge",
          severity: input.severity,
          ...safeDetail,
        },
      }),
    },
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`CLICK alert delivery failed with HTTP ${response.status}`);
  }

  const results = Array.isArray((payload as any)?.results)
    ? (payload as any).results
    : [payload];
  const delivered = results.filter((result: any) => result?.ok === true).length;
  return { delivered, recipients: userIds.length };
};
