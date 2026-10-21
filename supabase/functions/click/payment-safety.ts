export const CLICK_PRODUCTION_SERVICE_ID = "104316";

export const CLICK_REQUIRED_SECRETS = [
  "CLICK_SERVICE_ID",
  "CLICK_MERCHANT_ID",
  "CLICK_MERCHANT_USER_ID",
  "CLICK_SECRET_KEY",
] as const;

export type ClickConfiguration = {
  configured: boolean;
  serviceId: string | null;
  serviceIdMatchesProduction: boolean;
  hostedPaymentReady: boolean;
  cardPaymentReady: boolean;
  missing: string[];
};

export const inspectClickConfiguration = (
  read: (key: string) => string | undefined,
): ClickConfiguration => {
  const values = Object.fromEntries(
    CLICK_REQUIRED_SECRETS.map((key) => [key, String(read(key) ?? "").trim()]),
  ) as Record<(typeof CLICK_REQUIRED_SECRETS)[number], string>;
  const missing = CLICK_REQUIRED_SECRETS.filter((key) => !values[key]);
  const serviceIdMatchesProduction =
    values.CLICK_SERVICE_ID === CLICK_PRODUCTION_SERVICE_ID;

  return {
    configured: missing.length === 0 && serviceIdMatchesProduction,
    serviceId: values.CLICK_SERVICE_ID || null,
    serviceIdMatchesProduction,
    hostedPaymentReady: Boolean(
      values.CLICK_SERVICE_ID && values.CLICK_MERCHANT_ID &&
        values.CLICK_SECRET_KEY && serviceIdMatchesProduction,
    ),
    cardPaymentReady: missing.length === 0 && serviceIdMatchesProduction,
    missing: [...missing],
  };
};

export const normalizeCheckoutIdempotencyKey = (
  raw: unknown,
): string | null => {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(value)) return null;
  return value;
};

export const normalizeSchoodReturnUrl = (
  raw: unknown,
  allowLocalDevelopment = false,
): string | null => {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    const isSchood = host === "schood.online" ||
      host.endsWith(".schood.online");
    const isLocal = allowLocalDevelopment &&
      (host === "localhost" || host === "127.0.0.1");
    if ((isSchood && parsed.protocol === "https:") || isLocal) {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
};

export const isTrustedClickPaymentUrl = (raw: unknown): boolean => {
  try {
    const parsed = new URL(String(raw ?? ""));
    return parsed.protocol === "https:" && parsed.hostname === "my.click.uz" &&
      parsed.pathname === "/services/pay";
  } catch {
    return false;
  }
};

export const sanitizeClickCallbackPayload = (
  params: Record<string, unknown>,
): Record<string, unknown> => {
  const safe: Record<string, unknown> = {};
  for (
    const key of [
      "click_trans_id",
      "service_id",
      "click_paydoc_id",
      "merchant_trans_id",
      "merchant_prepare_id",
      "amount",
      "action",
      "error",
      "error_note",
      "sign_time",
    ]
  ) {
    if (typeof params[key] !== "undefined") safe[key] = params[key];
  }
  return safe;
};

export const isAllowedClickStatusTransition = (
  fromRaw: unknown,
  toRaw: unknown,
): boolean => {
  const from = String(fromRaw ?? "").trim().toLowerCase();
  const to = String(toRaw ?? "").trim().toLowerCase();
  if (from === to) return true;
  if (["created", "pending"].includes(from)) {
    return ["pending", "paid", "canceled", "failed", "expired"].includes(to);
  }
  return false;
};

/** Products sold to an institution as a whole (for example Schood Assessment
 * Cloud) are marked `metadata.kind = "institution_service"`. Only the
 * institution's owner or administrator may buy them for that tenant. */
export const isInstitutionServiceProduct = (metadata: unknown): boolean =>
  !!metadata && typeof metadata === "object" && !Array.isArray(metadata) &&
  (metadata as Record<string, unknown>).kind === "institution_service";
export const canPurchaseForInstitution = (role: unknown): boolean =>
  role === "owner" || role === "admin";
