/**
 * Vocabulary duels and parent progress links in @schoodstudentbot.
 *
 * Handles /duel, /start duel_<code>, /start pl_<token> and the edu:/epl:
 * buttons. The hub decides everything (POST hub/internal/telegram-social,
 * see supabase/functions/hub/social-bot.ts) and returns ready texts and
 * buttons; this module only turns them into Telegram calls. Every other
 * update is left to the existing handlers.
 */

type BotButton = { text?: unknown; callback_data?: unknown; url?: unknown; web_app_route?: unknown };
type BotReply = { text?: unknown; buttons?: unknown };
type TelegramButton = { text: string; callback_data?: string; url?: string; web_app?: { url: string } };

export type SocialBotDeps = {
  /** POST to a Supabase Edge Function with the worker secret. */
  edge: (fn: string, body: unknown) => Promise<Record<string, unknown>>;
  /** Telegram Bot API call. */
  tg: (method: string, body: unknown) => Promise<unknown>;
  /** Mini App URL for launch parameters such as "view=english&duel=CODE" ("" = home). */
  webAppUrl: (route: string) => string;
};

type Locale = "en" | "ru" | "uz";

const UNAVAILABLE: Record<Locale, string> = {
  en: "This is not available right now. Please try again in a minute.",
  ru: "Сейчас это недоступно. Попробуйте через минуту.",
  uz: "Hozir bu ishlamayapti. Bir daqiqadan keyin urinib koʻring.",
};

const localeOf = (code: unknown): Locale => {
  const value = String(code ?? "").toLowerCase();
  return value.startsWith("ru") ? "ru" : value.startsWith("uz") ? "uz" : "en";
};

const CALLBACK_PREFIX = /^(edu|epl):/;
const START_PARAM = /^(duel_|pl_)/;

/** Our buttons only: our callbacks, https links and Mini App routes. */
export const toSocialMarkup = (deps: Pick<SocialBotDeps, "webAppUrl">, rows: unknown) => ({
  inline_keyboard: (Array.isArray(rows) ? rows : []).map((row) =>
    (Array.isArray(row) ? row : []).flatMap((raw): TelegramButton[] => {
      const button = (raw ?? {}) as BotButton;
      const text = String(button.text ?? "").slice(0, 64);
      if (!text) return [];
      if (typeof button.callback_data === "string" && CALLBACK_PREFIX.test(button.callback_data) && button.callback_data.length <= 64) {
        return [{ text, callback_data: button.callback_data }];
      }
      if (typeof button.url === "string" && /^https:\/\//.test(button.url)) return [{ text, url: button.url }];
      if (typeof button.web_app_route === "string") return [{ text, web_app: { url: deps.webAppUrl(button.web_app_route) } }];
      return [];
    })).filter((row) => row.length > 0),
});

const replies = (value: unknown): Array<{ text: string; buttons: unknown }> =>
  (Array.isArray(value) ? value : [])
    .map((entry) => (entry ?? {}) as BotReply)
    .filter((entry) => typeof entry.text === "string" && entry.text.length > 0)
    .map((entry) => ({ text: String(entry.text).slice(0, 4096), buttons: entry.buttons }));

type SocialCallback = {
  id: string;
  from: { id: number; language_code?: string };
  data?: string;
  message?: { chat: { id: number }; message_id: number };
};

type SocialMessage = { chat?: { id?: number; type?: string }; from?: { id?: number; language_code?: string }; text?: string };

/** True when the update was a duel or progress-link update and has been answered. */
export const routeSocial = async (deps: SocialBotDeps, update: Record<string, unknown>): Promise<boolean> => {
  const query = update.callback_query as SocialCallback | undefined;
  const msg = update.message as SocialMessage | undefined;
  let request: Record<string, unknown> | null = null;
  let chatId: number | null = null;
  let locale: Locale = "en";

  if (query) {
    if (!CALLBACK_PREFIX.test(String(query.data ?? ""))) return false;
    chatId = query.message?.chat.id ?? query.from.id;
    locale = localeOf(query.from?.language_code);
    request = { op: "callback", data: query.data, telegram_user_id: String(query.from.id), chat_id: String(chatId), locale: query.from?.language_code ?? null };
  } else if (msg?.chat?.id && msg.chat.type === "private") {
    const [first = "", param = ""] = String(msg.text ?? "").trim().split(/\s+/);
    const command = first.replace(/@\w+$/, "").toLowerCase();
    chatId = msg.chat.id;
    locale = localeOf(msg.from?.language_code);
    const base = { telegram_user_id: String(msg.from?.id ?? chatId), chat_id: String(chatId), locale: msg.from?.language_code ?? null };
    if (command === "/duel") request = { ...base, op: "duel_create" };
    else if (command === "/start" && START_PARAM.test(param)) request = { ...base, op: "start", param };
    else return false;
  } else {
    return false;
  }

  let result: Record<string, unknown>;
  try {
    result = await deps.edge("hub/internal/telegram-social", request);
  } catch {
    result = { http_status: 0 };
  }
  const ok = Number(result.http_status) === 200 && result.ok === true;
  if (ok && result.handled === false) return false;

  if (query) {
    await deps.tg("answerCallbackQuery", {
      callback_query_id: query.id,
      text: ok ? (typeof result.toast === "string" && result.toast ? result.toast.slice(0, 200) : undefined) : UNAVAILABLE[locale],
    });
  }
  if (!ok) {
    if (!query) await deps.tg("sendMessage", { chat_id: chatId, text: UNAVAILABLE[locale] });
    return true;
  }

  // The answer is saved already: a Telegram hiccup here must not replay the update.
  try {
    const edit = result.edit as BotReply | null | undefined;
    if (query?.message && edit && typeof edit.text === "string" && edit.text) {
      await deps.tg("editMessageText", {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
        text: edit.text.slice(0, 4096),
        parse_mode: "HTML",
        disable_web_page_preview: true,
        reply_markup: toSocialMarkup(deps, edit.buttons),
      });
    }
    for (const reply of replies(result.messages)) {
      await deps.tg("sendMessage", {
        chat_id: chatId,
        text: reply.text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
        reply_markup: toSocialMarkup(deps, reply.buttons),
      });
    }
  } catch (error) {
    console.error(JSON.stringify({ event: "english_social_reply_failed", error: error instanceof Error ? error.message : "unknown" }));
  }
  return true;
};
