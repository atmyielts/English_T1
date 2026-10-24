/**
 * /english in @schoodstudentbot: today's English status with buttons to the
 * Mini App's English section, in-app review and the daily quiz switch.
 *
 * The text and buttons come from telegram-app (english_bot_status /
 * english_bot_quiz, see supabase/functions/telegram-app/english.ts), so this
 * module only maps buttons to Telegram markup. Handles the /english command
 * and eng:* callbacks; everything else is left to the other handlers.
 */

type BotButton = { text: string; web_app_route?: string; url?: string; callback_data?: string };
type TelegramButton = { text: string; web_app?: { url: string }; url?: string; callback_data?: string };

export type EnglishBotDeps = {
  /** POST to a Supabase Edge Function with the worker secret. */
  edge: (fn: string, body: unknown) => Promise<Record<string, unknown>>;
  /** Telegram Bot API call. */
  tg: (method: string, body: unknown) => Promise<unknown>;
  /** Mini App URL for launch parameters such as "view=english" ("" = home). */
  webAppUrl: (route: string) => string;
};

type Locale = "en" | "ru" | "uz";

const ENGLISH_COMMANDS = new Set(["/english"]);
const UNAVAILABLE: Record<Locale, { text: string; button: string }> = {
  en: { text: "English is not available right now. Please try again in a minute.", button: "Open English" },
  ru: { text: "English сейчас недоступен. Попробуйте через минуту.", button: "Открыть English" },
  uz: { text: "English hozir ishlamayapti. Bir daqiqadan keyin urinib koʻring.", button: "English ni ochish" },
};

const localeOf = (code: unknown): Locale => {
  const value = String(code ?? "").toLowerCase();
  return value.startsWith("ru") ? "ru" : value.startsWith("uz") ? "uz" : "en";
};

const toMarkup = (deps: EnglishBotDeps, rows: unknown) => ({
  inline_keyboard: (Array.isArray(rows) ? rows : []).map((row) =>
    (Array.isArray(row) ? row : []).flatMap((raw): TelegramButton[] => {
      const button = (raw ?? {}) as BotButton;
      const text = String(button.text ?? "").slice(0, 64);
      if (!text) return [];
      if (typeof button.web_app_route === "string") return [{ text, web_app: { url: deps.webAppUrl(button.web_app_route) } }];
      if (typeof button.url === "string" && /^https:\/\//.test(button.url)) return [{ text, url: button.url }];
      if (typeof button.callback_data === "string" && button.callback_data.startsWith("eng:")) return [{ text, callback_data: button.callback_data }];
      return [];
    })).filter((row) => row.length > 0),
});

const message = (result: Record<string, unknown>): { text: string; buttons: unknown } | null => {
  const body = result.message as { text?: unknown; buttons?: unknown } | undefined;
  return Number(result.http_status) === 200 && result.ok === true && body && typeof body.text === "string" && body.text
    ? { text: body.text, buttons: body.buttons }
    : null;
};

const unavailable = (deps: EnglishBotDeps, chatId: number, locale: Locale) =>
  deps.tg("sendMessage", {
    chat_id: chatId,
    text: UNAVAILABLE[locale].text,
    reply_markup: { inline_keyboard: [[{ text: UNAVAILABLE[locale].button, web_app: { url: deps.webAppUrl("view=english") } }]] },
  });

type EnglishCallback = {
  id: string;
  from: { id: number; language_code?: string };
  data?: string;
  message?: { chat: { id: number }; message_id: number };
};

/** True when the update was an /english command or an eng:* button and has been answered. */
export const routeEnglish = async (deps: EnglishBotDeps, update: Record<string, unknown>): Promise<boolean> => {
  const query = update.callback_query as EnglishCallback | undefined;
  if (query) {
    const data = String(query.data ?? "");
    if (!data.startsWith("eng:")) return false;
    const locale = localeOf(query.from?.language_code);
    const quiz = data === "eng:quiz:on" ? true : data === "eng:quiz:off" ? false : null;
    let result: Record<string, unknown>;
    try {
      result = await deps.edge("telegram-app", {
        action: quiz === null ? "english_bot_status" : "english_bot_quiz",
        telegram_user_id: String(query.from.id),
        language_code: query.from?.language_code ?? null,
        enabled: quiz,
      });
    } catch {
      result = { http_status: 0 };
    }
    const reply = message(result);
    await deps.tg("answerCallbackQuery", {
      callback_query_id: query.id,
      text: reply ? (typeof result.toast === "string" ? result.toast.slice(0, 200) : undefined) : UNAVAILABLE[locale].text,
    });
    if (reply && query.message) {
      // The toggle is saved already; a failed edit must not replay the update.
      try {
        await deps.tg("editMessageText", {
          chat_id: query.message.chat.id,
          message_id: query.message.message_id,
          text: reply.text,
          parse_mode: "HTML",
          disable_web_page_preview: true,
          reply_markup: toMarkup(deps, reply.buttons),
        });
      } catch (error) {
        console.error(JSON.stringify({ event: "english_status_edit_failed", error: error instanceof Error ? error.message : "unknown" }));
      }
    }
    return true;
  }

  const msg = update.message as { chat?: { id?: number; type?: string }; from?: { id?: number; language_code?: string }; text?: string } | undefined;
  const text = String(msg?.text ?? "").trim();
  const command = (text.split(/\s+/)[0] ?? "").replace(/@\w+$/, "").toLowerCase();
  if (!msg?.chat?.id || !ENGLISH_COMMANDS.has(command)) return false;
  const chatId = msg.chat.id;
  const locale = localeOf(msg.from?.language_code);
  let result: Record<string, unknown>;
  try {
    result = await deps.edge("telegram-app", {
      action: "english_bot_status",
      telegram_user_id: String(msg.from?.id ?? chatId),
      language_code: msg.from?.language_code ?? null,
    });
  } catch {
    result = { http_status: 0 };
  }
  const reply = message(result);
  if (!reply) {
    await unavailable(deps, chatId, locale);
    return true;
  }
  await deps.tg("sendMessage", {
    chat_id: chatId,
    text: reply.text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: toMarkup(deps, reply.buttons),
  });
  return true;
};
