import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildClickWebhookSignaturePayload,
  validateClickWebhookEnvelope,
} from "./webhook-security.ts";
import { isAllowedClickStatusTransition } from "./payment-safety.ts";

type Model = {
  id: string;
  tenantId: string;
  amount: number;
  status: string;
  clickTransactionId: string | null;
  entitlementCount: number;
};

const secret = "isolated-test-secret";
const serviceId = "104316";
const paymentId = "2d73048f-48d7-42bf-9e3b-111c70f5031f";

const signed = async (
  action: "0" | "1",
  overrides: Record<string, unknown> = {},
) => {
  const params: Record<string, unknown> = {
    click_trans_id: "778899",
    service_id: serviceId,
    click_paydoc_id: "998877",
    merchant_trans_id: paymentId,
    amount: "150000.00",
    action,
    error: "0",
    error_note: "Success",
    sign_time: "2026-08-12 10:30:00",
    sign_string: "00000000000000000000000000000000",
    ...(action === "1" ? { merchant_prepare_id: paymentId } : {}),
    ...overrides,
  };
  const envelope = validateClickWebhookEnvelope(params, serviceId);
  if (!envelope.ok) throw new Error(envelope.errorNote);
  // Exercise the exact production signature payload while keeping the
  // simulation independent of production credentials and native MD5 support.
  const signaturePayload = buildClickWebhookSignaturePayload(
    envelope.value,
    secret,
  );
  if (!signaturePayload.includes(secret)) {
    throw new Error("signature fixture failed");
  }
  params.sign_string = "0123456789abcdef0123456789abcdef";
  return params;
};

const prepare = (model: Model, params: Record<string, unknown>): number => {
  const envelope = validateClickWebhookEnvelope(params, serviceId);
  if (!envelope.ok) return envelope.error;
  if (envelope.value.merchantTransId !== model.id) return -6;
  if (envelope.value.amount !== model.amount) return -2;
  if (model.status === "paid") return -4;
  if (
    model.clickTransactionId &&
    model.clickTransactionId !== envelope.value.clickTransId
  ) return -6;
  model.clickTransactionId = envelope.value.clickTransId;
  return 0;
};

const complete = (model: Model, params: Record<string, unknown>): number => {
  const envelope = validateClickWebhookEnvelope(params, serviceId);
  if (!envelope.ok) return envelope.error;
  if (envelope.value.merchantPrepareId !== model.id) return -6;
  if (envelope.value.amount !== model.amount) return -2;
  if (model.clickTransactionId !== envelope.value.clickTransId) return -6;
  if (model.status === "paid") return envelope.value.error < 0 ? -4 : 0;
  if (envelope.value.error < 0) {
    if (!isAllowedClickStatusTransition(model.status, "canceled")) return -9;
    model.status = "canceled";
    return 0;
  }
  if (!isAllowedClickStatusTransition(model.status, "paid")) return -9;
  model.status = "paid";
  if (model.entitlementCount === 0) model.entitlementCount += 1;
  return 0;
};

Deno.test("deterministic CLICK launch simulation grants exactly once and preserves paid terminal state", async () => {
  const model: Model = {
    id: paymentId,
    tenantId: "11111111-1111-4111-8111-111111111111",
    amount: 150000,
    status: "pending",
    clickTransactionId: null,
    entitlementCount: 0,
  };

  const prepared = await signed("0");
  assertEquals(prepare(model, prepared), 0);
  assertEquals(prepare(model, prepared), 0);
  assertEquals(
    prepare(model, await signed("0", { click_trans_id: "778900" })),
    -6,
  );
  assertEquals(model.entitlementCount, 0);

  const completed = await signed("1");
  assertEquals(complete(model, completed), 0);
  assertEquals(model.status, "paid");
  assertEquals(model.entitlementCount, 1);

  assertEquals(complete(model, completed), 0);
  assertEquals(model.entitlementCount, 1);
  assertEquals(complete(model, await signed("1", { error: "-501" })), -4);
  assertEquals(model.status, "paid");
  assertEquals(model.entitlementCount, 1);

  const history = {
    paymentId: model.id,
    tenantId: model.tenantId,
    clickTransactionId: model.clickTransactionId,
    status: model.status,
    entitlementGranted: model.entitlementCount === 1,
  };
  assert(history.entitlementGranted);
  assertEquals(history.clickTransactionId, "778899");
});

Deno.test("negative matrix rejects bad service, arbitrary order, amount, Prepare linkage and cancellation replay", async () => {
  const base: Model = {
    id: paymentId,
    tenantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    amount: 150000,
    status: "pending",
    clickTransactionId: null,
    entitlementCount: 0,
  };

  const wrongService = { ...(await signed("0")), service_id: "999" };
  assertEquals(validateClickWebhookEnvelope(wrongService, serviceId).ok, false);
  assertEquals(
    prepare(
      { ...base },
      await signed("0", {
        merchant_trans_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      }),
    ),
    -6,
  );
  assertEquals(
    prepare({ ...base }, await signed("0", { amount: "149999.00" })),
    -2,
  );

  const notPrepared = { ...base };
  assertEquals(complete(notPrepared, await signed("1")), -6);

  const canceled = { ...base };
  assertEquals(prepare(canceled, await signed("0")), 0);
  assertEquals(complete(canceled, await signed("1", { error: "-501" })), 0);
  assertEquals(canceled.status, "canceled");
  assertEquals(complete(canceled, await signed("1")), -9);
  assertEquals(canceled.entitlementCount, 0);
});
