// Duels and parent progress links in @schoodstudentbot. The student bot Worker
// (workers/schood-bot/src/social.ts) forwards /duel, /start duel_<code>,
// /start pl_<token> and edu:/epl: button taps to
// POST /hub/internal/telegram-social (x-worker-secret = TELEGRAM_INTERNAL_SECRET)
// and sends back exactly what this returns. Texts: _shared/english-social-telegram.ts.
import {
  answerDuel,
  createDuel,
  DuelError,
  type DuelErrorCode,
  duelLinks,
  getDuel,
  joinDuel,
  rematchDuel,
  startDuel,
  userForTelegram,
} from "../_shared/english-duel-service.ts";
import type { DuelView } from "../_shared/english-duel.ts";
import {
  type BotReply,
  duelAnsweredText,
  duelCreatedReply,
  duelQuestionReply,
  duelReadyReply,
  duelResultReply,
  notLinkedReply,
  parentPlain,
  parentSubscribedReply,
  parentText,
  parseSocialCallback,
  parseSocialStart,
  plainReply,
  socialLocale,
  type SocialLocale,
  socialPlain,
  socialText,
} from "../_shared/english-social-telegram.ts";
import { duelContext } from "./duel.ts";
import { stopWatcher, subscribeWatcher } from "./progress-link.ts";

type Row = Record<string, unknown>;

export type SocialBotResult = {
  ok: true;
  /** False when the update is not a duel or progress-link update (the bot carries on). */
  handled: boolean;
  toast: string | null;
  edit: BotReply | null;
  messages: BotReply[];
};

const reply = (messages: BotReply[], extra: Partial<SocialBotResult> = {}): SocialBotResult => ({
  ok: true, handled: true, toast: null, edit: null, messages, ...extra,
});

const ERROR_KEY: Record<DuelErrorCode, string> = {
  not_found: "notFound",
  expired: "expired",
  taken: "taken",
  own_duel: "own",
  limit: "limit",
  no_words: "noWords",
  not_participant: "notYours",
  not_active: "expired",
  paused: "paused",
};

/** Where a player stands: the next question, the start button, or the result. */
const stateReply = (locale: SocialLocale, view: DuelView, links: ReturnType<typeof duelLinks>): BotReply => {
  if (view.question) return duelQuestionReply(locale, view.code, view.question, view.me.seconds_left);
  if (view.me.finished || view.status === "finished" || view.status === "expired") return duelResultReply(locale, view, links);
  return duelReadyReply(locale, view.code, view.opponent_name);
};

type Input = { sb: any; languageId: string; supabaseUrl: string; serviceRoleKey: string; body: Row };

export const handleSocialBotUpdate = async (input: Input): Promise<SocialBotResult> => {
  const { sb, body } = input;
  const locale = socialLocale(body.locale);
  const ctx = duelContext(input);
  const chatId = String(body.chat_id ?? "").trim();
  const op = String(body.op ?? "");
  const notHandled: SocialBotResult = { ok: true, handled: false, toast: null, edit: null, messages: [] };

  // Parent links work without a Schood account.
  const start = op === "start" ? parseSocialStart(body.param) : null;
  const callback = op === "callback" ? parseSocialCallback(body.data) : null;
  if (op === "start" && !start) return notHandled;
  if (op === "callback" && !callback) return notHandled;
  if (op !== "start" && op !== "callback" && op !== "duel_create") return notHandled;

  if (start?.kind === "parent") {
    const result = await subscribeWatcher(sb, start.token, chatId, locale);
    if (!("watcherId" in result)) return reply([{ text: parentText(locale, result.status), buttons: [] }]);
    return reply([parentSubscribedReply(locale, {
      firstName: result.firstName,
      watcherId: result.watcherId,
      pageUrl: result.pageUrl,
      again: result.status === "again",
    })]);
  }
  if (callback?.kind === "parent_stop") {
    const stopped = await stopWatcher(sb, callback.watcher_id, chatId);
    return reply([], {
      toast: parentPlain(locale, "stoppedToast"),
      edit: stopped ? { text: parentText(locale, "stopped"), buttons: [] } : null,
    });
  }

  const userId = await userForTelegram(sb, body.telegram_user_id);
  if (!userId) return reply([notLinkedReply(locale)], { toast: callback ? socialPlain(locale, "openApp") : null });

  try {
    if (op === "duel_create") {
      const created = await createDuel(ctx, userId, { channel: "telegram", locale });
      return reply([duelCreatedReply(locale, created.links)]);
    }
    if (start?.kind === "duel") {
      const { view } = await joinDuel(ctx, userId, start.code, { channel: "telegram", locale });
      return reply([stateReply(locale, view, duelLinks(ctx, view.code))]);
    }
    if (callback?.kind === "duel_start") {
      const { view } = await startDuel(ctx, userId, callback.code, { channel: "telegram", locale });
      return reply([stateReply(locale, view, duelLinks(ctx, view.code))]);
    }
    if (callback?.kind === "duel_rematch") {
      const rematch = await rematchDuel(ctx, userId, callback.code, { channel: "telegram", locale });
      const view = await getDuel(ctx, userId, rematch.code);
      // Ready, not started: starting the clock is the learner's own tap.
      return reply([stateReply(locale, view, duelLinks(ctx, view.code))], {
        toast: socialPlain(locale, "rematchSent", { name: view.opponent_name || socialPlain(locale, "friend") }),
      });
    }
    if (callback?.kind === "duel_answer") {
      const result = await answerDuel(ctx, userId, callback.code, { index: callback.index, choice: callback.choice });
      const links = duelLinks(ctx, result.view.code);
      if (result.accepted && result.answered && result.correct !== null && result.correct_index !== null) {
        const toast = socialPlain(locale, result.correct ? "rightToast" : "wrongToast");
        if (result.view.question) {
          // One message for the whole run: the verdict on top, the next question and its buttons below.
          const next = duelQuestionReply(locale, result.view.code, result.view.question, result.view.me.seconds_left);
          const verdict = socialText(locale, result.correct ? "right" : "wrong", { word: result.answered.options[result.correct_index] ?? "" });
          return reply([], { toast, edit: { text: `${verdict}\n\n${next.text}`, buttons: next.buttons } });
        }
        return reply([stateReply(locale, result.view, links)], {
          toast,
          edit: { text: duelAnsweredText(locale, result.answered, result.correct, result.correct_index), buttons: [] },
        });
      }
      if (result.reason === "already_answered" || result.reason === "wrong_question") {
        return reply([], { toast: socialPlain(locale, "alreadyAnswered") });
      }
      // Time is up (or the duel ended): close this question and show where things stand.
      return reply([stateReply(locale, result.view, links)], {
        toast: socialPlain(locale, "timeUp"),
        edit: result.answered ? { text: socialText(locale, "timeUp"), buttons: [] } : null,
      });
    }
  } catch (error) {
    if (error instanceof DuelError) {
      if (callback) return reply([], { toast: socialPlain(locale, ERROR_KEY[error.code]).replace(/<[^>]+>/g, "").slice(0, 190) });
      return reply([plainReply(locale, ERROR_KEY[error.code])]);
    }
    throw error;
  }
  return notHandled;
};
