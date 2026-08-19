import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import worker, { type Env } from "./index.ts";

const env: Env = {
  SUPABASE_URL: "https://example.supabase.co",
  ACADEMY_TELEGRAM_INTERNAL_SECRET: "internal-test-secret",
  ACADEMY_TELEGRAM_WEBHOOK_SECRET: "current-webhook-secret",
  ACADEMY_TELEGRAM_WEBHOOK_SECRET_PREVIOUS: "previous-webhook-secret",
};

Deno.test("Academy bot Worker exposes a non-secret health response", async () => {
  const response = await worker.fetch(new Request("https://academy-bot.example/health"), env);
  assertEquals(response.status, 200);
  assertEquals(await response.json(), { ok: true, service: "schood-academy-bot" });
});

Deno.test("Academy bot Worker rejects invalid webhook secrets before forwarding", async () => {
  const originalFetch = globalThis.fetch;
  let forwarded = false;
  globalThis.fetch = (() => { forwarded = true; return Promise.resolve(new Response(null)); }) as typeof fetch;
  try {
    const response = await worker.fetch(new Request("https://academy-bot.example/webhook", {
      method: "POST",
      headers: { "X-Telegram-Bot-Api-Secret-Token": "wrong" },
      body: JSON.stringify({ update_id: 1 }),
    }), env);
    assertEquals(response.status, 401);
    assertEquals(forwarded, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("Academy bot Worker accepts rotation overlap and forwards only to Academy Edge", async () => {
  const originalFetch = globalThis.fetch;
  let forwardedUrl = "";
  let forwardedBody: unknown = null;
  let forwardedSecret = "";
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    forwardedUrl = String(input);
    forwardedBody = JSON.parse(String(init?.body));
    forwardedSecret = new Headers(init?.headers).get("x-worker-secret") ?? "";
    return Promise.resolve(Response.json({ ok: true }));
  }) as typeof fetch;
  try {
    const response = await worker.fetch(new Request("https://academy-bot.example/webhook", {
      method: "POST",
      headers: { "X-Telegram-Bot-Api-Secret-Token": env.ACADEMY_TELEGRAM_WEBHOOK_SECRET_PREVIOUS! },
      body: JSON.stringify({ update_id: 42, message: { text: "/today" } }),
    }), env);
    assertEquals(response.status, 200);
    assertEquals(forwardedUrl, "https://example.supabase.co/functions/v1/academy-telegram");
    assertEquals(forwardedSecret, env.ACADEMY_TELEGRAM_INTERNAL_SECRET);
    assertEquals(forwardedBody, { action: "process_webhook_update", update: { update_id: 42, message: { text: "/today" } } });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
