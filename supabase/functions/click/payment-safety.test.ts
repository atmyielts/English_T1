import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  inspectClickConfiguration,
  isAllowedClickStatusTransition,
  isTrustedClickPaymentUrl,
  normalizeCheckoutIdempotencyKey,
  normalizeSchoodReturnUrl,
  sanitizeClickCallbackPayload,
} from "./payment-safety.ts";

Deno.test("CLICK configuration fails closed without every production credential", () => {
  const partial: Record<string, string> = {
    CLICK_SERVICE_ID: "104316",
    CLICK_MERCHANT_ID: "merchant",
    CLICK_SECRET_KEY: "secret",
  };
  const result = inspectClickConfiguration((key) => partial[key]);
  assert(!result.configured);
  assert(result.hostedPaymentReady);
  assert(!result.cardPaymentReady);
  assertEquals(result.missing, ["CLICK_MERCHANT_USER_ID"]);

  partial.CLICK_MERCHANT_USER_ID = "merchant-user";
  assert(inspectClickConfiguration((key) => partial[key]).configured);
  partial.CLICK_SERVICE_ID = "wrong";
  assert(!inspectClickConfiguration((key) => partial[key]).configured);
});

Deno.test("return and payment URLs are constrained to trusted origins", () => {
  assertEquals(
    normalizeSchoodReturnUrl("https://english.schood.online/account"),
    "https://english.schood.online/account",
  );
  assertEquals(normalizeSchoodReturnUrl("https://evil.example/collect"), null);
  assertEquals(normalizeSchoodReturnUrl("http://schood.online/account"), null);
  assertEquals(normalizeSchoodReturnUrl("http://localhost:5173/account"), null);
  assertEquals(
    normalizeSchoodReturnUrl("http://localhost:5173/account", true),
    "http://localhost:5173/account",
  );
  assert(
    isTrustedClickPaymentUrl("https://my.click.uz/services/pay?service_id=1"),
  );
  assert(
    !isTrustedClickPaymentUrl("https://my.click.uz.evil.example/services/pay"),
  );
});

Deno.test("callback persistence strips signatures and unknown fields", () => {
  const safe = sanitizeClickCallbackPayload({
    click_trans_id: "123",
    merchant_trans_id: "order",
    action: "1",
    sign_string: "do-not-store",
    card_number: "do-not-store",
  });
  assertEquals(safe, {
    click_trans_id: "123",
    merchant_trans_id: "order",
    action: "1",
  });
});

Deno.test("checkout idempotency keys are bounded and state transitions are terminal", () => {
  assertEquals(
    normalizeCheckoutIdempotencyKey("checkout:12345678"),
    "checkout:12345678",
  );
  assertEquals(normalizeCheckoutIdempotencyKey("short"), null);
  assert(isAllowedClickStatusTransition("pending", "paid"));
  assert(isAllowedClickStatusTransition("pending", "canceled"));
  assert(isAllowedClickStatusTransition("paid", "paid"));
  assert(!isAllowedClickStatusTransition("paid", "canceled"));
  assert(!isAllowedClickStatusTransition("canceled", "paid"));
});

Deno.test("institution service products require the tenant owner or administrator", async () => {
  const { isInstitutionServiceProduct, canPurchaseForInstitution } = await import("./payment-safety.ts");
  assertEquals(isInstitutionServiceProduct({ kind: "institution_service", service: "assessment-cloud" }), true);
  assertEquals([null, [], {}, { kind: "course" }, "institution_service"].map(isInstitutionServiceProduct), [false, false, false, false, false]);
  assertEquals(["owner", "admin", "member", "teacher", "counselor", null].map(canPurchaseForInstitution), [true, true, false, false, false, false]);
});
