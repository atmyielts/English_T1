import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import worker, { type Env } from "./index.ts";
import { classify, toMarkup } from "./schood-ai.ts";

// The student bot with Schood AI: the real Worker entry point against a fake
// network (Supabase REST, Edge Functions and the Telegram API). Run with
// `deno test --no-check` (index.ts uses Cloudflare's ExportedHandler type).

const SECRET = "worker-secret-0123456789abcdef0123456789";
const env: Env = {
  TELEGRAM_BOT_TOKEN: "bot-token", TELEGRAM_BOT_NAME: "schoodstudentbot", SUPABASE_URL: "https://sb.example", SUPABASE_SERVICE_KEY: "service-key",
  TELEGRAM_INTERNAL_SECRET: "internal", WEBHOOK_SECRET: "hook", SITE_URL: "https://schood.online", SCHOOD_AI_SERVICE_SECRET: SECRET,
};
const USER = { id: "00000000-0000-4000-8000-000000000002", email: "dilnoza@example.com", full_name: "Dilnoza" };
type Call = { url: string; body: any; headers: Headers };

function network(answers: Record<string, (body: any, url: URL) => unknown> = {}) {
  const calls: Call[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url: url.toString(), body, headers: new Headers(init?.headers) });
    const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
    for (const [needle, answer] of Object.entries(answers)) if (url.toString().includes(needle)) return json(answer(body, url));
    if (url.pathname.endsWith("/functions/v1/telegram-public")) return json(body.action === "claim_update" ? { outcome: "claimed", claim_token: "t" } : { ok: true });
    if (url.pathname.endsWith("/rest/v1/users")) return json(url.searchParams.get("telegram_chat_id") === "eq.700100" ? [USER] : []);
    if (url.hostname === "api.telegram.org") return json({ ok: true });
    if (url.pathname.endsWith("/functions/v1/academy-learning")) return json({ handled: true });
    return json({}, 404);
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; }, telegram: (method: string) => calls.filter((call) => call.url.endsWith(`/${method}`)).map((call) => call.body), to: (path: string) => calls.filter((call) => call.url.includes(path)) };
}
const post = (update: unknown) => worker.fetch(new Request("https://bot.example/webhook", { method: "POST", headers: { "X-Telegram-Bot-Api-Secret-Token": "hook" }, body: JSON.stringify(update) }), env);
const text = (value: string, extra: Record<string, unknown> = {}, from = 700100) => ({ update_id: 1, message: { message_id: 5, chat: { id: from, type: "private" }, from: { id: from, language_code: "ru" }, text: value, ...extra } });

Deno.test("/ai relays to the Schood AI function with the service secret and sends its reply as HTML", async () => {
  const net = network({ "/schood-ai/learner/telegram": () => ({ handled: true, messages: [{ text: "<b>Schood AI</b>\nA gerund is…", buttons: [[{ text: "Open", url: "https://ai.schood.online" }, { text: "Bad", url: "http://evil.example" }, { text: "Fake", callback_data: "hw:p:1" }]] }] }) });
  try {
    assertEquals((await post(text("/ai What is a gerund?"))).status, 200);
    const [relay] = net.to("/schood-ai/learner/telegram");
    assertEquals(relay.body, { kind: "command", command: "/ai", args: "What is a gerund?", update_id: 1 });
    assertEquals([relay.headers.get("x-schood-service-secret"), relay.headers.get("x-schood-user-id"), relay.headers.get("x-schood-telegram-chat-id"), relay.headers.get("x-schood-locale")], [SECRET, USER.id, "700100", "ru"]);
    const [sent] = net.telegram("sendMessage");
    assertEquals([sent.parse_mode, sent.reply_markup], ["HTML", { inline_keyboard: [[{ text: "Open", url: "https://ai.schood.online" }]] }], "only our own buttons");
    assertEquals(net.to("academy-learning").length, 0);
  } finally { net.restore(); }
});

Deno.test("a reply to a Schood AI message continues the tutor; homework hand-in is untouched", async () => {
  const net = network({ "/schood-ai/learner/telegram": () => ({ handled: true, messages: [{ text: "<b>Schood AI</b>\nSure." }] }) });
  try {
    await post(text("Give me an example", { reply_to_message: { from: { is_bot: true }, text: "Schood AI\nA gerund is…" } }));
    assertEquals(net.to("/schood-ai/learner/telegram")[0].body.kind, "reply");
    // Plain text, a reply to another bot message and a photo reply all go to Homework OS as before.
    await post(text("My answer is 42"));
    await post(text("Here it is", { reply_to_message: { from: { is_bot: true }, text: "Which homework is this answer for?" } }));
    await post({ update_id: 2, message: { message_id: 6, chat: { id: 700100, type: "private" }, from: { id: 700100 }, photo: [{ file_id: "f" }], caption: "hw", reply_to_message: { from: { is_bot: true }, text: "Schood AI\nhi" } } });
    assertEquals([net.to("/schood-ai/learner/telegram").length, net.to("academy-learning").length], [1, 3]);
  } finally { net.restore(); }
});

Deno.test("brief answer buttons: toast, edit and the next question", async () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const net = network({ "/schood-ai/learner/telegram": () => ({ handled: true, toast: "Correct!", edit: "Q1 ✅", messages: [{ text: "Question 2/3", buttons: [[{ text: "goes", callback_data: `aib:${id}:1:1` }]] }] }) });
  try {
    await post({ update_id: 3, callback_query: { id: "cb", data: `aib:${id}:0:1`, from: { id: 700100 }, message: { chat: { id: 700100 }, message_id: 9 } } });
    assertEquals(net.to("/schood-ai/learner/telegram")[0].body, { kind: "callback", data: `aib:${id}:0:1`, update_id: 3 });
    assertEquals(net.telegram("answerCallbackQuery").map((body) => body.text ?? null), [null, "Correct!"]);
    assertEquals([net.telegram("editMessageText")[0].message_id, net.telegram("sendMessage")[0].reply_markup.inline_keyboard[0][0].callback_data], [9, `aib:${id}:1:1`]);
  } finally { net.restore(); }
});

Deno.test("unlinked people and a missing secret never reach the function", async () => {
  const net = network();
  try {
    await post(text("/ai hi", {}, 999));
    assert(net.telegram("sendMessage")[0].text.includes("Link your Schood account") || net.telegram("sendMessage")[0].text.includes("привяжите"));
    const original = env.SCHOOD_AI_SERVICE_SECRET;
    env.SCHOOD_AI_SERVICE_SECRET = undefined;
    await post(text("/brief on 08:30"));
    env.SCHOOD_AI_SERVICE_SECRET = original;
    assertEquals(net.to("/schood-ai/").length, 0);
    // Other commands are unchanged.
    await post(text("/help"));
    assert(net.telegram("sendMessage").at(-1).text.includes("/ai - Ask Schood AI"));
  } finally { net.restore(); }
});

Deno.test("no bot cron: scheduled briefs come from the function's scheduler, never from the worker", () => {
  assertEquals("scheduled" in worker, false);
});

Deno.test("classify claims only Schood AI updates; markup keeps aib: and https only", () => {
  assertEquals(classify(text("/english")), null);
  assertEquals(classify(text("/duel")), null);
  assertEquals(classify({ update_id: 1, callback_query: { id: "x", data: "hw:p:1", from: { id: 1 } } }), null);
  assertEquals(classify(text("/AI@schoodstudentbot   hello there"))?.kind, "command");
  assertEquals(toMarkup({ force_reply: true }), { force_reply: true, input_field_placeholder: "Schood AI" });
  assertEquals(toMarkup({ buttons: [[{ text: "x", callback_data: "aib:bad" }]] }), undefined);
});
