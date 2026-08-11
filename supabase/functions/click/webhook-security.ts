export type ClickWebhookAction = "0" | "1";

export type ClickWebhookEnvelope = {
  action: ClickWebhookAction;
  amount: number;
  amountText: string;
  clickPaydocId: string;
  clickTransId: string;
  error: number;
  merchantPrepareId: string;
  merchantTransId: string;
  serviceId: string;
  signString: string;
  signTime: string;
};

export type ClickWebhookValidation =
  | { ok: true; value: ClickWebhookEnvelope }
  | { ok: false; error: number; errorNote: string };

const BASE_REQUIRED_FIELDS = [
  "click_trans_id",
  "service_id",
  "click_paydoc_id",
  "merchant_trans_id",
  "amount",
  "action",
  "error",
  "error_note",
  "sign_time",
  "sign_string",
] as const;

const text = (params: Record<string, unknown>, key: string): string =>
  String(params[key] ?? "").trim();

const isPresent = (params: Record<string, unknown>, key: string): boolean =>
  params[key] !== null && typeof params[key] !== "undefined" &&
  String(params[key]).trim().length > 0;

const isPositiveIntegerText = (value: string): boolean =>
  /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) &&
  Number(value) > 0;

const isUuid = (value: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export const validateClickWebhookEnvelope = (
  params: Record<string, unknown>,
  expectedServiceId: string,
): ClickWebhookValidation => {
  const missing = BASE_REQUIRED_FIELDS.filter((field) =>
    !isPresent(params, field)
  );
  if (missing.length > 0) {
    return {
      ok: false,
      error: -8,
      errorNote: "Missing required CLICK parameters",
    };
  }

  const action = text(params, "action");
  if (action !== "0" && action !== "1") {
    return { ok: false, error: -3, errorNote: "Action not found" };
  }
  if (action === "1" && !isPresent(params, "merchant_prepare_id")) {
    return {
      ok: false,
      error: -8,
      errorNote: "merchant_prepare_id is required",
    };
  }

  const serviceId = text(params, "service_id");
  if (!expectedServiceId || serviceId !== expectedServiceId) {
    return { ok: false, error: -8, errorNote: "Invalid service_id" };
  }

  const clickTransId = text(params, "click_trans_id");
  const clickPaydocId = text(params, "click_paydoc_id");
  const merchantTransId = text(params, "merchant_trans_id");
  const merchantPrepareId = text(params, "merchant_prepare_id");
  const amountText = text(params, "amount");
  const errorText = text(params, "error");
  const signString = text(params, "sign_string").toLowerCase();
  const signTime = text(params, "sign_time");

  if (
    !isPositiveIntegerText(clickTransId) ||
    !isPositiveIntegerText(clickPaydocId)
  ) {
    return {
      ok: false,
      error: -8,
      errorNote: "Invalid CLICK transaction identifiers",
    };
  }
  if (
    !isUuid(merchantTransId) || (action === "1" && !isUuid(merchantPrepareId))
  ) {
    return {
      ok: false,
      error: -8,
      errorNote: "Invalid merchant transaction identifiers",
    };
  }
  if (!/^\d+(?:\.\d{1,2})?$/.test(amountText)) {
    return { ok: false, error: -2, errorNote: "Incorrect parameter amount" };
  }
  const amount = Number(amountText);
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount)) {
    return { ok: false, error: -2, errorNote: "Incorrect parameter amount" };
  }
  if (!/^-?\d+$/.test(errorText) || !Number.isSafeInteger(Number(errorText))) {
    return { ok: false, error: -8, errorNote: "Invalid CLICK error code" };
  }
  if (!/^[0-9a-f]{32}$/.test(signString) || signTime.length > 64) {
    return { ok: false, error: -1, errorNote: "Sign check failed!" };
  }

  return {
    ok: true,
    value: {
      action,
      amount,
      amountText,
      clickPaydocId,
      clickTransId,
      error: Number(errorText),
      merchantPrepareId,
      merchantTransId,
      serviceId,
      signString,
      signTime,
    },
  };
};

export const buildClickWebhookSignaturePayload = (
  envelope: ClickWebhookEnvelope,
  secretKey: string,
): string =>
  envelope.action === "1"
    ? `${envelope.clickTransId}${envelope.serviceId}${secretKey}${envelope.merchantTransId}${envelope.merchantPrepareId}${envelope.amountText}${envelope.action}${envelope.signTime}`
    : `${envelope.clickTransId}${envelope.serviceId}${secretKey}${envelope.merchantTransId}${envelope.amountText}${envelope.action}${envelope.signTime}`;

export const constantTimeEqual = (
  leftRaw: string,
  rightRaw: string,
): boolean => {
  const left = leftRaw.toLowerCase();
  const right = rightRaw.toLowerCase();
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^
      (right.charCodeAt(index) || 0);
  }
  return difference === 0;
};
