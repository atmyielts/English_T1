import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { configureAcademyTelegramProvider } from "./provider-config.ts";

Deno.test("Academy Telegram provider setup verifies identity before applying exact safe configuration", async () => {
  const calls: Array<{ method: string; body: Record<string, unknown> }> = [];
  await configureAcademyTelegramProvider({
    botName: "schoodacademybot",
    siteUrl: "https://academy.schood.online/",
    workerUrl: "https://academy-bot.schood.online/",
    webhookSecret: "test-webhook-secret",
    call: (method, body) => {
      calls.push({ method, body });
      return Promise.resolve(method === "getMe" ? { ok: true, result: { username: "SchoodAcademyBot" } } : { ok: true });
    },
  });
  assertEquals(calls.map((entry) => entry.method), [
    "getMe", "setWebhook", "setChatMenuButton", "setMyCommands", "setMyName", "setMyShortDescription", "setMyDescription",
  ]);
  assertEquals(calls[1].body, {
    url: "https://academy-bot.schood.online/webhook",
    secret_token: "test-webhook-secret",
    allowed_updates: ["message", "callback_query", "my_chat_member"],
    drop_pending_updates: false,
  });
  assertEquals(calls[2].body, {
    menu_button: { type: "web_app", text: "Open Academy", web_app: { url: "https://academy.schood.online/telegram" } },
  });
});

Deno.test("Academy Telegram provider setup rejects a token for another bot before mutation", async () => {
  const methods: string[] = [];
  await assertRejects(
    () => configureAcademyTelegramProvider({
      botName: "schoodacademybot",
      siteUrl: "https://academy.schood.online",
      workerUrl: "https://academy-bot.schood.online",
      webhookSecret: "test-webhook-secret",
      call: (method) => {
        methods.push(method);
        return Promise.resolve({ ok: true, result: { username: "another_bot" } });
      },
    }),
    Error,
    "does not match the configured bot username",
  );
  assertEquals(methods, ["getMe"]);
});

Deno.test("Academy Telegram provider setup rejects a bot that can read ordinary group conversation", async () => {
  const methods: string[] = [];
  await assertRejects(
    () => configureAcademyTelegramProvider({
      botName: "schoodacademybot",
      siteUrl: "https://academy.schood.online",
      workerUrl: "https://academy-bot.schood.online",
      webhookSecret: "test-webhook-secret",
      call: (method) => {
        methods.push(method);
        return Promise.resolve({ ok: true, result: { username: "schoodacademybot", can_read_all_group_messages: true } });
      },
    }),
    Error,
    "group privacy mode must be enabled",
  );
  assertEquals(methods, ["getMe"]);
});
