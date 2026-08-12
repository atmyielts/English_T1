import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  classifyClickOpsAlert,
  clickOpsAlertDedupeKey,
  notifyClickOperators,
  sanitizeClickOpsAlertDetail,
} from "./ops-alerts.ts";

Deno.test("CLICK callback alert classification ignores ordinary protocol rejects", () => {
  assertEquals(
    classifyClickOpsAlert({
      httpStatus: 400,
      protocolError: -8,
      signatureVerified: false,
    }),
    null,
  );
  assertEquals(
    classifyClickOpsAlert({
      httpStatus: 200,
      protocolError: 0,
      signatureVerified: true,
    }),
    null,
  );
  assertEquals(
    classifyClickOpsAlert({
      httpStatus: 401,
      protocolError: -1,
      signatureVerified: false,
    }),
    {
      event: "callback_signature_rejected",
      severity: "warn",
    },
  );
  assertEquals(
    classifyClickOpsAlert({
      httpStatus: 200,
      protocolError: -2,
      signatureVerified: true,
    }),
    {
      event: "signed_amount_mismatch",
      severity: "critical",
    },
  );
  assertEquals(
    classifyClickOpsAlert({
      httpStatus: 500,
      protocolError: -9,
      signatureVerified: false,
    }),
    {
      event: "callback_internal_failure",
      severity: "critical",
    },
  );
});

Deno.test("CLICK alerts deduplicate hourly and discard unknown detail fields", () => {
  assertEquals(
    clickOpsAlertDedupeKey("failure", 3_600_001),
    "click-ops:failure:1",
  );
  assertEquals(
    clickOpsAlertDedupeKey("failure", 7_199_999),
    "click-ops:failure:1",
  );
  assertEquals(
    sanitizeClickOpsAlertDetail({
      payment_id: "payment-1",
      protocol_error: -2,
      sign_string: "must-not-leak",
      secret_key: "must-not-leak",
    }),
    { payment_id: "payment-1", protocol_error: -2 },
  );
});

Deno.test("CLICK operator alerts use the private Telegram gateway without secrets in the body", async () => {
  let sentBody = "";
  let authorization = "";
  const supabase = {
    from: () => ({
      select: () => ({
        eq: () => ({
          not: () => ({
            limit: () =>
              Promise.resolve({ data: [{ id: "admin-1" }], error: null }),
          }),
        }),
      }),
    }),
  };
  const result = await notifyClickOperators({
    supabase,
    supabaseUrl: "https://project.supabase.co",
    serviceRoleKey: "service-role-value",
    event: "signed_amount_mismatch",
    severity: "critical",
    detail: { payment_id: "payment-1", sign_string: "must-not-leak" },
    fetchImpl: (_url, init) => {
      sentBody = String(init?.body ?? "");
      authorization = new Headers(init?.headers).get("authorization") ?? "";
      return Promise.resolve(
        new Response(JSON.stringify({ results: [{ ok: true }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    },
  });
  assertEquals(result, { delivered: 1, recipients: 1 });
  assertEquals(authorization, "Bearer service-role-value");
  assertStringIncludes(sentBody, "payment-1");
  assertEquals(sentBody.includes("must-not-leak"), false);
  assertEquals(sentBody.includes("service-role-value"), false);
});
