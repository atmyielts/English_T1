/**
 * Schood AI in @schoodstudentbot (ai.schood.online, learner area).
 *
 * Claims only:
 *   - /ai, /brief, /child and /aiduel commands;
 *   - a text reply to a message that starts with "Schood AI" (continues the tutor);
 *   - aib:<brief>:<q>:<choice> buttons (daily brief answers).
 * Everything else, homework hand-in included, goes on to the existing handlers.
 *
 * The function decides everything (POST schood-ai/learner/telegram with the
 * service secret and the Telegram-linked Schood user) and returns ready texts
 * and buttons; this module turns them into Telegram calls. The cron
 * (runSchoodAISchedule) sends daily and weekly parent briefs that are due, and
 * the function keeps them within the notification budget and quiet hours.
 */

export type SchoodAIEnv = { SUPABASE_URL: string; SUPABASE_SERVICE_KEY: string; SCHOOD_AI_SERVICE_SECRET?: string };
export type SchoodAIDeps = {
  env: SchoodAIEnv;
  /** Telegram Bot API call. */
  tg: (method: string, body: unknown) => Promise<unknown>;
  /** The Schood user linked to this Telegram account, or null. */
  getUser: (telegramUserId: number) => Promise<{ id: string } | null>;
  fetch?: typeof fetch;
};

type Locale = "en" | "ru" | "uz";
type Button = { text?: unknown; callback_data?: unknown; url?: unknown };
type Message = { text?: unknown; buttons?: unknown; force_reply?: unknown };

export const AI_COMMANDS = new Set(["/ai", "/brief", "/child", "/aiduel"]);
const MARK = "Schood AI";
const SECRET_MIN = 32;

const COPY: Record<Locale, { link: string; off: string; busy: string }> = {
  en: { link: "Link your Schood account first: open Schood, then Account → Link Telegram.", off: "Schood AI is not available in this bot yet.", busy: "Schood AI is busy. Please try again in a minute." },
  ru: { link: "Сначала привяжите аккаунт Schood: откройте Schood, затем Аккаунт → Привязать Telegram.", off: "Schood AI пока недоступен в этом боте.", busy: "Schood AI занят. Попробуйте через минуту." },
  uz: { link: "Avval Schood hisobingizni bogʻlang: Schoodni oching, keyin Hisob → Telegramni bogʻlash.", off: "Schood AI hali bu botda ishlamaydi.", busy: "Schood AI band. Bir daqiqadan keyin urinib koʻring." },
};
const localeOf = (code: unknown): Locale => {
  const value = String(code ?? "").toLowerCase();
  return value.startsWith("ru") ? "ru" : value.startsWith("uz") ? "uz" : "en";
};

/** Only our own buttons: aib: callbacks and https links. */
export const toMarkup = (message: Message) => {
  if (message.force_reply === true) return { force_reply: true, input_field_placeholder: MARK };
  const rows = (Array.isArray(message.buttons) ? message.buttons : []).map((row) => (Array.isArray(row) ? row : []).flatMap((raw) => {
    const button = (raw ?? {}) as Button;
    const text = String(button.text ?? "").slice(0, 64);
    if (!text) return [];
    if (typeof button.callback_data === "string" && /^aib:[0-9a-f-]{36}:[0-3]:[0-3]$/.test(button.callback_data)) return [{ text, callback_data: button.callback_data }];
    if (typeof button.url === "string" && /^https:\/\/[^\s]+$/.test(button.url)) return [{ text, url: button.url }];
    return [];
  })).filter((row) => row.length > 0);
  return rows.length ? { inline_keyboard: rows } : undefined;
};

type Classified =
  | { kind: "command"; command: string; args: string; from: Record<string, unknown>; chatId: number }
  | { kind: "reply"; text: string; from: Record<string, unknown>; chatId: number }
  | { kind: "callback"; data: string; id: string; from: Record<string, unknown>; chatId: number; messageId: number | null };

/** Which updates are Schood AI's; null for every other update. */
export const classify = (update: Record<string, unknown>): Classified | null => {
  const callback = update.callback_query as Record<string, unknown> | undefined;
  if (callback) {
    const data = String(callback.data ?? "");
    if (!data.startsWith("aib:")) return null;
    const message = callback.message as { chat?: { id?: number }; message_id?: number } | undefined;
    const from = (callback.from ?? {}) as Record<string, unknown>;
    return { kind: "callback", data, id: String(callback.id ?? ""), from, chatId: Number(message?.chat?.id ?? from.id), messageId: message?.message_id ?? null };
  }
  const msg = update.message as Record<string, unknown> | undefined;
  if (!msg || (msg.chat as { type?: string } | undefined)?.type !== "private") return null;
  const text = typeof msg.text === "string" ? msg.text.trim() : "";
  if (!text) return null;
  const from = (msg.from ?? {}) as Record<string, unknown>;
  const chatId = Number((msg.chat as { id?: number }).id);
  const [first, ...rest] = text.split(/\s+/);
  const command = first.replace(/@\w+$/, "").toLowerCase();
  if (AI_COMMANDS.has(command)) return { kind: "command", command, args: text.slice(first.length).trim() || rest.join(" "), from, chatId };
  if (text.startsWith("/")) return null;
  const replied = msg.reply_to_message as { from?: { is_bot?: boolean }; text?: string } | undefined;
  if (replied?.from?.is_bot === true && typeof replied.text === "string" && replied.text.startsWith(MARK)) return { kind: "reply", text, from, chatId };
  return null;
};

const call = async (deps: SchoodAIDeps, path: string, userId: string, chatId: string, locale: Locale, body: unknown) => {
  const doFetch = deps.fetch ?? fetch;
  const response = await doFetch(`${deps.env.SUPABASE_URL.replace(/\/$/, "")}/functions/v1/schood-ai/learner/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Schood-Service-Secret": deps.env.SCHOOD_AI_SERVICE_SECRET ?? "",
      "X-Schood-User-Id": userId,
      "X-Schood-Telegram-Chat-Id": chatId,
      "X-Schood-Locale": locale,
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  return { ...payload, http_status: response.status };
};

const sendAll = async (deps: SchoodAIDeps, chatId: number | string, messages: unknown) => {
  for (const raw of (Array.isArray(messages) ? messages : []).slice(0, 6)) {
    const message = (raw ?? {}) as Message;
    if (typeof message.text !== "string" || !message.text) continue;
    await deps.tg("sendMessage", { chat_id: chatId, text: message.text.slice(0, 4096), parse_mode: "HTML", disable_web_page_preview: true, reply_markup: toMarkup(message) });
  }
};

/** Handles a Schood AI update; false lets the other handlers run. */
export const routeSchoodAI = async (deps: SchoodAIDeps, update: Record<string, unknown>): Promise<boolean> => {
  const item = classify(update);
  if (!item) return false;
  const locale = localeOf(item.from.language_code);
  const telegramUserId = Number(item.from.id ?? item.chatId);
  if (item.kind === "callback") await deps.tg("answerCallbackQuery", { callback_query_id: item.id }).catch(() => null);
  if (!deps.env.SCHOOD_AI_SERVICE_SECRET || deps.env.SCHOOD_AI_SERVICE_SECRET.length < SECRET_MIN) {
    await deps.tg("sendMessage", { chat_id: item.chatId, text: COPY[locale].off });
    return true;
  }
  const user = await deps.getUser(telegramUserId);
  if (!user) {
    await deps.tg("sendMessage", { chat_id: item.chatId, text: COPY[locale].link });
    return true;
  }
  const updateId = Number(update.update_id ?? 0);
  const body = item.kind === "command" ? { kind: "command", command: item.command, args: item.args, update_id: updateId }
    : item.kind === "reply" ? { kind: "reply", text: item.text, update_id: updateId }
    : { kind: "callback", data: item.data, update_id: updateId };
  let result: Record<string, unknown>;
  try {
    result = await call(deps, "telegram", user.id, String(telegramUserId), locale, body);
  } catch {
    result = { http_status: 0 };
  }
  if (Number(result.http_status) !== 200) {
    await deps.tg("sendMessage", { chat_id: item.chatId, text: Number(result.http_status) === 403 ? COPY[locale].link : COPY[locale].busy });
    return true;
  }
  if (result.handled !== true) return false;
  if (item.kind === "callback") {
    if (typeof result.toast === "string" && result.toast) await deps.tg("answerCallbackQuery", { callback_query_id: item.id, text: result.toast.slice(0, 200) }).catch(() => null);
    if (typeof result.edit === "string" && result.edit && item.messageId) {
      // The answer is saved already: a Telegram hiccup here must not replay the update.
      await deps.tg("editMessageText", { chat_id: item.chatId, message_id: item.messageId, text: result.edit.slice(0, 4096), parse_mode: "HTML", reply_markup: { inline_keyboard: [] } }).catch(() => null);
    }
  }
  await sendAll(deps, item.chatId, result.messages);
  return true;
};

/** Cron: sends the daily and parent briefs that are due now. */
export const runSchoodAISchedule = async (deps: SchoodAIDeps, now = new Date(), limit = 50): Promise<{ due: number; sent: number }> => {
  if (!deps.env.SCHOOD_AI_SERVICE_SECRET || deps.env.SCHOOD_AI_SERVICE_SECRET.length < SECRET_MIN) return { due: 0, sent: 0 };
  const doFetch = deps.fetch ?? fetch;
  const query = new URLSearchParams({ enabled: "eq.true", next_due_at: `lte.${now.toISOString()}`, select: "user_id,kind,locale,users(telegram_chat_id)", order: "next_due_at.asc", limit: String(limit) });
  const response = await doFetch(`${deps.env.SUPABASE_URL.replace(/\/$/, "")}/rest/v1/ai_learner_briefs?${query}`, {
    headers: { apikey: deps.env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${deps.env.SUPABASE_SERVICE_KEY}`, Accept: "application/json" },
  });
  const rows = response.ok ? await response.json().catch(() => []) as Record<string, unknown>[] : [];
  let sent = 0;
  for (const row of Array.isArray(rows) ? rows : []) {
    const chat = String((row.users as { telegram_chat_id?: unknown } | null)?.telegram_chat_id ?? "");
    const kind = row.kind === "parent" ? "parent" : "daily";
    if (!/^\d{1,20}$/.test(chat)) continue;
    const locale = localeOf(row.locale);
    try {
      const result = await call(deps, "telegram-brief", String(row.user_id), chat, locale, { kind });
      if (result.status !== "ready" || !Array.isArray(result.messages) || !result.messages.length) continue;
      await sendAll(deps, chat, result.messages);
      await call(deps, "brief-sent", String(row.user_id), chat, locale, { kind, ids: Array.isArray(result.ids) ? result.ids : [] });
      sent++;
    } catch (error) {
      // One learner's failure never stops the others; the function retries later.
      console.error(JSON.stringify({ event: "schood_ai_brief_send_failed", kind, error: error instanceof Error ? error.message : "unknown" }));
    }
  }
  return { due: Array.isArray(rows) ? rows.length : 0, sent };
};
