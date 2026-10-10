import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildClickWebhookSignaturePayload,
  constantTimeEqual,
  validateClickWebhookEnvelope,
} from "./webhook-security.ts";

const serviceId = "24680";
const paymentId = "2d73048f-48d7-42bf-9e3b-111c70f5031f";
const clickSource = await Deno.readTextFile(
  new URL("./handler.ts", import.meta.url),
);
const supabaseConfig = await Deno.readTextFile(
  new URL("../../config.toml", import.meta.url),
);

const prepare = (): Record<string, unknown> => ({
  click_trans_id: "123456",
  service_id: serviceId,
  click_paydoc_id: "654321",
  merchant_trans_id: paymentId,
  amount: "150000.00",
  action: "0",
  error: "0",
  error_note: "Success",
  sign_time: "2026-08-12 09:00:00",
  sign_string: "0123456789abcdef0123456789abcdef",
});

Deno.test("CLICK Prepare requires the full protocol envelope and configured service", () => {
  const valid = validateClickWebhookEnvelope(prepare(), serviceId);
  assert(valid.ok);
  assertEquals(valid.value.action, "0");
  assertEquals(valid.value.amount, 150000);

  const missing = prepare();
  delete missing.click_paydoc_id;
  assertEquals(validateClickWebhookEnvelope(missing, serviceId), {
    ok: false,
    error: -8,
    errorNote: "Missing required CLICK parameters",
  });

  assertEquals(validateClickWebhookEnvelope(prepare(), "different-service"), {
    ok: false,
    error: -8,
    errorNote: "Invalid service_id",
  });
});

Deno.test("CLICK Complete requires and signs merchant_prepare_id", () => {
  const complete: Record<string, unknown> = {
    ...prepare(),
    action: "1",
    merchant_prepare_id: paymentId,
  };
  const valid = validateClickWebhookEnvelope(complete, serviceId);
  assert(valid.ok);
  assertEquals(
    buildClickWebhookSignaturePayload(valid.value, "secret"),
    `123456${serviceId}secret${paymentId}${paymentId}150000.0012026-08-12 09:00:00`,
  );

  delete complete.merchant_prepare_id;
  assertEquals(validateClickWebhookEnvelope(complete, serviceId), {
    ok: false,
    error: -8,
    errorNote: "merchant_prepare_id is required",
  });
});

Deno.test("CLICK Prepare signature payload excludes merchant_prepare_id", () => {
  const valid = validateClickWebhookEnvelope(prepare(), serviceId);
  assert(valid.ok);
  assertEquals(
    buildClickWebhookSignaturePayload(valid.value, "secret"),
    `123456${serviceId}secret${paymentId}150000.0002026-08-12 09:00:00`,
  );
});

Deno.test("CLICK protocol rejects malformed identifiers, amount, action, error, and signature", () => {
  for (
    const [field, value, expectedError] of [
      ["click_trans_id", "abc", -8],
      ["merchant_trans_id", "not-an-order", -8],
      ["amount", "150000 UZS", -2],
      ["amount", "150000.99", -2],
      ["action", "2", -3],
      ["error", "NaN", -8],
      ["sign_string", "short", -1],
    ] as const
  ) {
    const result = validateClickWebhookEnvelope({
      ...prepare(),
      [field]: value,
    }, serviceId);
    assertEquals(result.ok, false);
    if (!result.ok) assertEquals(result.error, expectedError);
  }
});

Deno.test("CLICK signature comparison is case-insensitive and exact", () => {
  assert(constantTimeEqual("abcdef0123456789", "ABCDEF0123456789"));
  assert(!constantTimeEqual("abcdef0123456789", "abcdef0123456780"));
  assert(!constantTimeEqual("abcdef", "abcdef00"));
});

Deno.test("CLICK is the only callback slug and disables gateway JWT in config", () => {
  assert(/\[functions\.click\]\r?\nverify_jwt = false/.test(supabaseConfig));
  assert(clickSource.includes('url.pathname.endsWith("/webhook")'));
  assert(clickSource.includes('error_note: "CLICK webhook requires POST"'));
});

Deno.test("CLICK mutations remain behind signature, provider, order, and replay checks", () => {
  const webhook = clickSource.slice(
    clickSource.indexOf("const handleClickWebhook"),
    clickSource.indexOf("// Main handler"),
  );
  const signatureCheck = webhook.indexOf("verifyClickWebhookSignature");
  const firstPaymentMutation = webhook.indexOf('.from("payments")');
  assert(signatureCheck >= 0 && firstPaymentMutation > signatureCheck);
  for (
    const signal of [
      'String(payment.provider ?? "").toLowerCase() !== "click"',
      "storedServiceId && storedServiceId !== serviceId",
      "storedMerchantId && storedMerchantId !== merchantId",
      "preparedClickTransId && preparedClickTransId !== clickTransId",
      "!preparedClickTransId || preparedClickTransId !== clickTransId",
      "merchantPrepareId !== payment.id",
      "isSuccessStatus(payment.status) && clickError < 0",
      "isTerminalFailureStatus(payment.status)",
      'isSuccessStatus(payment.status) && payment.grant_completed_at',
    ]
  ) assert(clickSource.includes(signal), signal);
});
