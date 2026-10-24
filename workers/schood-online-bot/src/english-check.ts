/**
 * "Check my English" in @schoodonlinebot. A visitor taps the start-menu button
 * or sends /check, gets a prompt (a force-reply message), and replies with a
 * sentence or short paragraph; /check <text> works in one go too. The text is
 * sent to telegram-public (action english_check), which enforces the daily
 * caps, calls the AI gateway and returns the finished, escaped reply.
 * Everything else is left to the existing journey handlers.
 */

type ApiResult = Record<string, any>;

export type EnglishCheckDeps = {
  /** POST to telegram-public with the worker secret. */
  edge: (body: Record<string, unknown>) => Promise<ApiResult>;
  /** Telegram Bot API call. */
  tg: (method: string, body: unknown) => Promise<unknown>;
};

export const ENGLISH_CHECK_CALLBACK = "english_check";
/** Same as TG_CHECK_PROMPT_MARKER in supabase/functions/_shared/english-tg-check.ts. */
const PROMPT_MARKER = "✍️";
const PLACEMENT_URL = "https://english.schood.online/check";

export const englishCheckMenuRow = () => [{ text: `${PROMPT_MARKER} Check my English`, callback_data: ENGLISH_CHECK_CALLBACK }];

type Locale = "en" | "ru" | "uz";
const localeOf = (code: unknown): Locale => {
  const value = String(code ?? "").toLowerCase();
  return value.startsWith("ru") ? "ru" : value.startsWith("uz") ? "uz" : "en";
};
const UNAVAILABLE: Record<Locale, { text: string; button: string }> = {
  en: { text: "I couldn't check your text right now. Please try again later, or take the free placement test.", button: "Free placement test" },
  ru: { text: "Сейчас не получилось проверить текст. Попробуйте позже или пройдите бесплатный тест уровня.", button: "Бесплатный тест уровня" },
  uz: { text: "Hozir matnni tekshirib boʻlmadi. Keyinroq urinib koʻring yoki bepul testdan oʻting.", button: "Bepul daraja testi" },
};

type Reply = {
  text?: unknown;
  buttons?: Array<Array<{ text?: unknown; url?: unknown }>>;
  force_reply?: { input_field_placeholder?: unknown };
};

const replyMarkup = (reply: Reply) => {
  if (reply.force_reply) {
    return { force_reply: true, input_field_placeholder: String(reply.force_reply.input_field_placeholder ?? "").slice(0, 64) || undefined };
  }
  const rows = (reply.buttons ?? [])
    .map((row) => (Array.isArray(row) ? row : [])
      .filter((button) => typeof button?.url === "string" && /^https:\/\//.test(String(button.url)) && button.text)
      .map((button) => ({ text: String(button.text).slice(0, 64), url: String(button.url) })))
    .filter((row) => row.length > 0);
  return rows.length ? { inline_keyboard: rows } : undefined;
};

const runCheck = async (
  deps: EnglishCheckDeps,
  input: { updateId: number; chatId: number | string; languageCode: unknown; text: string },
) => {
  const locale = localeOf(input.languageCode);
  if (input.text) await deps.tg("sendChatAction", { chat_id: input.chatId, action: "typing" }).catch(() => undefined);
  let result: ApiResult;
  try {
    result = await deps.edge({
      action: "english_check",
      chat_id: String(input.chatId),
      language_code: input.languageCode ?? null,
      update_id: input.updateId,
      text: input.text,
    });
  } catch {
    result = { ok: false };
  }
  const reply = (result.ok === true ? result.reply : null) as Reply | null;
  if (!reply || typeof reply.text !== "string" || !reply.text) {
    await deps.tg("sendMessage", {
      chat_id: input.chatId,
      text: UNAVAILABLE[locale].text,
      disable_web_page_preview: true,
      reply_markup: { inline_keyboard: [[{ text: UNAVAILABLE[locale].button, url: PLACEMENT_URL }]] },
    });
    return;
  }
  await deps.tg("sendMessage", {
    chat_id: input.chatId,
    text: reply.text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: replyMarkup(reply),
  });
};

type Message = {
  chat?: { id?: number | string };
  from?: { id?: number; language_code?: string };
  text?: string;
  reply_to_message?: { from?: { is_bot?: boolean }; text?: string };
};
type Callback = { id: string; from: { id: number; language_code?: string }; data?: string; message?: { chat?: { id?: number | string } } };

/** True when the update was a "Check my English" button, /check, or a reply to the check prompt. */
export const routeEnglishCheck = async (deps: EnglishCheckDeps, updateId: number, update: Record<string, any>): Promise<boolean> => {
  const query = update.callback_query as Callback | undefined;
  if (query) {
    if (query.data !== ENGLISH_CHECK_CALLBACK) return false;
    await deps.tg("answerCallbackQuery", { callback_query_id: query.id });
    await runCheck(deps, { updateId, chatId: query.message?.chat?.id ?? query.from.id, languageCode: query.from.language_code, text: "" });
    return true;
  }
  const message = update.message as Message | undefined;
  const chatId = message?.chat?.id;
  const raw = String(message?.text ?? "").trim();
  if (!message || !chatId || !raw) return false;
  const [first = "", ...rest] = raw.split(/\s+/);
  const command = first.replace(/@\w+$/, "").toLowerCase();
  if (command === "/check") {
    // Everything after the command, keeping the visitor's line breaks.
    const text = raw.slice(raw.indexOf(first) + first.length).trim();
    await runCheck(deps, { updateId, chatId, languageCode: message.from?.language_code, text: rest.length ? text : "" });
    return true;
  }
  const replyTo = message.reply_to_message;
  if (!raw.startsWith("/") && replyTo?.from?.is_bot === true && String(replyTo.text ?? "").startsWith(PROMPT_MARKER)) {
    await runCheck(deps, { updateId, chatId, languageCode: message.from?.language_code, text: raw });
    return true;
  }
  return false;
};
