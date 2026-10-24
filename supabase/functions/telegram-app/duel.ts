// Vocabulary duels in the Telegram Mini App (action english_duel). Same
// service and rules as the web app and the chat (_shared/english-duel-service.ts),
// for the linked learner the Mini App already verified.
//
//   { op: "list" }                         the learner's last duels
//   { op: "create", locale }               new invite → { code, links }
//   { op: "get", code }                    the duel, or the invite if not joined
//   { op: "join" | "start" | "rematch", code, locale }
//   { op: "answer", code, index, choice }
import {
  answerDuel,
  createDuel,
  type DuelContext,
  DuelError,
  getDuel,
  joinDuel,
  listDuels,
  peekInvite,
  rematchDuel,
  startDuel,
  telegramDuelNotifier,
} from "../_shared/english-duel-service.ts";
import type { SocialLocale } from "../_shared/english-social-telegram.ts";

type Row = Record<string, unknown>;
type Result = { status: number; body: Record<string, unknown> };

export const ENGLISH_DUEL_ACTION = "english_duel";

const localeOf = (value: unknown): SocialLocale => (value === "ru" || value === "uz" ? value : "en");

export const handleEnglishDuelAction = async (
  sb: any,
  userId: string,
  body: Row,
  env: { supabaseUrl: string; serviceRoleKey: string },
): Promise<Result> => {
  const { data: language, error } = await sb.from("languages").select("id").eq("code", "en").maybeSingle();
  if (error || !language?.id) return { status: 500, body: { error: "Language not found" } };
  const ctx: DuelContext = {
    sb,
    languageId: String(language.id),
    appUrl: Deno.env.get("ENGLISH_APP_URL") ?? "https://english.schood.online",
    botName: Deno.env.get("TELEGRAM_STUDENT_BOT_NAME") ?? "schoodstudentbot",
    notify: telegramDuelNotifier(env),
  };
  const op = String(body.op ?? "");
  const code = body.code;
  const input = { channel: "mini_app" as const, locale: localeOf(body.locale) };
  try {
    if (op === "list") return { status: 200, body: { ok: true, duels: await listDuels(ctx, userId) } };
    if (op === "create") return { status: 200, body: { ok: true, ...(await createDuel(ctx, userId, input)) } };
    if (op === "get") {
      try {
        return { status: 200, body: { ok: true, duel: await getDuel(ctx, userId, code) } };
      } catch (cause) {
        if (cause instanceof DuelError && cause.code === "not_participant") {
          return { status: 200, body: { ok: true, duel: null, invite: await peekInvite(ctx, code) } };
        }
        throw cause;
      }
    }
    if (op === "join") return { status: 200, body: { ok: true, ...(await joinDuel(ctx, userId, code, input)) } };
    if (op === "start") return { status: 200, body: { ok: true, ...(await startDuel(ctx, userId, code, input)) } };
    if (op === "rematch") return { status: 200, body: { ok: true, ...(await rematchDuel(ctx, userId, code, input)) } };
    if (op === "answer") {
      return { status: 200, body: { ok: true, ...(await answerDuel(ctx, userId, code, { index: Number(body.index), choice: Number(body.choice) })) } };
    }
    return { status: 422, body: { error: "Unknown duel op" } };
  } catch (cause) {
    if (cause instanceof DuelError) return { status: cause.status, body: { error: cause.code, code: `duel_${cause.code}` } };
    throw cause;
  }
};
