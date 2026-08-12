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
    "click-public-ops:failure:1",
  );
  assertEquals(
    clickOpsAlertDedupeKey("failure", 7_199_999),
    "click-public-ops:failure:1",
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

Deno.test("CLICK alerts use verified admins and the public bot without leaking secrets", async () => {
  let sentBody = "";
  let sentUrl = "";
  let reservation: Record<string, unknown> = {};
  let finalUpdate: Record<string, unknown> = {};
  const updateQuery: any = {
    eq: () => updateQuery,
    then: (
      resolve: (value: unknown) => unknown,
      reject: (reason: unknown) => unknown,
    ) => Promise.resolve({ data: null, error: null }).then(resolve, reject),
  };
  const supabase = {
    from: (table: string) => {
      if (table === "users") {
        return {
          select: () => ({
            eq: (column: string, value: string) => {
              assertEquals([column, value], ["role", "admin"]);
              return {
                not: () => ({
                  limit: () =>
                    Promise.resolve({
                      data: [{
                        id: "admin-1",
                        telegram_chat_id: "chat-1",
                      }],
                      error: null,
                    }),
                }),
              };
            },
          }),
        };
      }
      assertEquals(table, "platform_notifications");
      return {
        insert: (value: Record<string, unknown>) => {
          reservation = value;
          return {
            select: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: { id: "notification-1" },
                  error: null,
                }),
            }),
          };
        },
        update: (value: Record<string, unknown>) => {
          finalUpdate = value;
          return updateQuery;
        },
      };
    },
  };
  const result = await notifyClickOperators({
    supabase,
    publicBotToken: "public-bot-token",
    event: "signed_amount_mismatch",
    severity: "critical",
    detail: { payment_id: "payment-1", sign_string: "must-not-leak" },
    fetchImpl: (url, init) => {
      sentUrl = String(url);
      sentBody = String(init?.body ?? "");
      return Promise.resolve(
        new Response(
          JSON.stringify({ ok: true, result: { message_id: 123 } }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );
    },
  });
  assertEquals(result, { delivered: 1, recipients: 1 });
  assertStringIncludes(sentUrl, "botpublic-bot-token/sendMessage");
  assertStringIncludes(sentBody, "payment-1");
  assertEquals(sentBody.includes("must-not-leak"), false);
  assertEquals(sentBody.includes("public-bot-token"), false);
  assertEquals(reservation.user_id, "admin-1");
  assertEquals(reservation.chat_id, "chat-1");
  assertEquals(
    (reservation.metadata as Record<string, unknown>).bot_scope,
    "public_ops",
  );
  assertEquals(finalUpdate.status, "sent");
  assertEquals(finalUpdate.telegram_message_id, 123);
});
