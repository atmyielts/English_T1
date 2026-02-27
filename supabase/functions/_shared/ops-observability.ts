type LogLevel = "info" | "warn" | "error";

type LogDetail = Record<string, unknown>;

const readEnv = (key: string): string | null => {
  const value = Deno.env.get(key);
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const appendHeaderToken = (existing: string | null, token: string): string => {
  const parts = (existing ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const set = new Set(parts.map((entry) => entry.toLowerCase()));
  if (!set.has(token.toLowerCase())) parts.push(token);
  return parts.join(", ");
};

export const requestIdFrom = (req: Request): string =>
  req.headers.get("x-request-id")?.trim() || crypto.randomUUID();

export const withRequestIdHeader = (
  headers: Record<string, string>,
  requestId: string,
): Record<string, string> => {
  const expose = appendHeaderToken(headers["Access-Control-Expose-Headers"] ?? null, "x-request-id");
  return {
    ...headers,
    "x-request-id": requestId,
    ...(expose ? { "Access-Control-Expose-Headers": expose } : {}),
  };
};

export const logOpsEvent = (
  level: LogLevel,
  domain: string,
  event: string,
  detail: LogDetail,
): void => {
  const payload = {
    ts: new Date().toISOString(),
    domain,
    level,
    event,
    ...detail,
  };
  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
};

type EmitOpsAlertInput = {
  domain: string;
  event: string;
  severity?: "info" | "warn" | "error" | "critical";
  detail: LogDetail;
};

const resolveAlertHook = (): string | null => {
  return (
    readEnv("OPS_ALERT_WEBHOOK_URL") ??
    readEnv("DOMAIN_EVENTS_ALERT_WEBHOOK_URL") ??
    readEnv("MEDIA_ALERT_WEBHOOK_URL")
  );
};

export const emitOpsAlert = (input: EmitOpsAlertInput): void => {
  const hook = resolveAlertHook();
  if (!hook) return;

  const body = {
    source: "supabase-edge",
    domain: input.domain,
    severity: input.severity ?? "error",
    event: input.event,
    at: new Date().toISOString(),
    detail: input.detail,
  };

  void fetch(hook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch((error) => {
    logOpsEvent("warn", input.domain, "alert_delivery_failed", {
      event: input.event,
      message: error instanceof Error ? error.message : String(error),
      request_id: input.detail.request_id ?? null,
    });
  });
};
