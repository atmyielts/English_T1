import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const source = await Deno.readTextFile(new URL("./handler.ts", import.meta.url));
const migration = await Deno.readTextFile(
  new URL(
    "../../migrations/20260812120000_click_payment_launch_guardrails.sql",
    import.meta.url,
  ),
);
const platformCheckout = await Deno.readTextFile(
  new URL("../../../apps/platform/src/pages/CheckoutPage.tsx", import.meta.url),
);
const platformClient = await Deno.readTextFile(
  new URL("../../../apps/platform/src/lib/platformClient.ts", import.meta.url),
);
const adminPayments = await Deno.readTextFile(
  new URL("../admin-payments/index.ts", import.meta.url),
);
const opsAlerts = await Deno.readTextFile(
  new URL("./ops-alerts.ts", import.meta.url),
);

Deno.test("CLICK launch contract keeps only the callback public and fails closed before credentials", () => {
  assert(
    source.includes(
      'const isWebhookRoute = req.method === "POST" && isWebhookPath',
    ),
  );
  assert(source.includes('url.pathname.endsWith("/readiness")'));
  assert(source.includes('error_code: "click_not_configured"'));
  assert(source.includes("!readiness.hostedPaymentReady"));
});

Deno.test("CLICK launch contract removes placeholder transaction races and status double-claim", () => {
  assert(!source.includes('provider_transaction_id: "pending"'));
  const statusSection = source.slice(source.indexOf("GET /click/status"));
  const grantCall = statusSection.indexOf("grantPaidPaymentOnce(");
  const priorClaim = statusSection.slice(0, grantCall).lastIndexOf(
    '.is("granted_at", null)',
  );
  assert(grantCall > 0 && priorClaim < 0);
  assert(migration.includes("payments_click_checkout_idempotency_unique"));
  assert(migration.includes("payments_click_immutability"));
});

Deno.test("CLICK launch contract does not persist signatures and locks Academy grant RPC", () => {
  assert(source.includes("sanitizeClickCallbackPayload(params)"));
  assert(!source.includes("webhook_prepare: params"));
  assert(!source.includes("webhook_complete: params"));
  assert(migration.includes("#- '{webhook_prepare,sign_string}'"));
  assert(
    migration.includes(
      "revoke all on function public.apply_academy_payment(uuid, uuid) from authenticated",
    ),
  );
  assert(
    migration.includes(
      "grant execute on function public.apply_academy_payment(uuid, uuid) to service_role",
    ),
  );
});

Deno.test("grant claims require completion evidence and unsafe automatic replay is blocked", () => {
  assert(source.includes("grant_completed_at"));
  assert(migration.includes("add column if not exists grant_completed_at"));
  assert(adminPayments.includes('await fulfillPayment(sb, payment.id)'));
  assert(!adminPayments.includes('.update({ granted_at: null, grant_error: null })'));
  assert(
    adminPayments.includes(
      "Automatic replay is disabled to prevent duplicate access or credit.",
    ),
  );
});

Deno.test("CLICK launch alerts are private, deduplicated, and never include signatures", () => {
  assert(source.includes("scheduleClickOpsAlert"));
  assert(
    source.includes('event: "callback_signature_rejected"') ||
      opsAlerts.includes('event: "callback_signature_rejected"'),
  );
  assert(opsAlerts.includes("click-public-ops:${event}:${bucket}"));
  assert(opsAlerts.includes('bot_scope: "public_ops"'));
  assert(source.includes('getEnv("TELEGRAM_PUBLIC_BOT_TOKEN")'));
  assert(!opsAlerts.includes("/functions/v1/send-telegram"));
  assert(!opsAlerts.includes('SAFE_DETAIL_KEYS = new Set([\n  "sign_string"'));
});

Deno.test("frontend gates missing configuration, reuses an attempt key and validates CLICK origin", () => {
  assert(platformCheckout.includes("clickReady !== true"));
  assert(platformCheckout.includes("checkoutAttemptKey.current"));
  assert(platformClient.includes("CLICK returned an untrusted payment URL"));
});
