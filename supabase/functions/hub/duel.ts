// Vocabulary duels on the web (hub routes). Rules: _shared/english-duel.ts;
// loading and saving: _shared/english-duel-service.ts (shared with the bot and
// the Telegram Mini App). Open to every signed-in learner; the owner can pause
// them as the "duels" service.
//
//   GET  /duels                    the learner's last duels
//   POST /duel                     { locale } → new invite { code, links }
//   GET  /duel/:code               the duel as this learner sees it, or the
//                                  invite (inviter's first name) if not joined
//   POST /duel/:code/join          { locale }
//   POST /duel/:code/start         starts this learner's 60 seconds
//   POST /duel/:code/answer        { index, choice }
//   POST /duel/:code/rematch       { locale } → { code }
import { json, parseBody } from "../_shared/english-learning.ts";
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

type Input = { sb: any; req: Request; route: string; userId: string; languageId: string; supabaseUrl: string; serviceRoleKey: string };

const ROUTE = /^\/duel\/([A-Za-z0-9-]{8,16})(?:\/(join|start|answer|rematch))?$/;

const localeOf = (value: unknown): SocialLocale => (value === "ru" || value === "uz" ? value : "en");

export const duelContext = (input: { sb: any; languageId: string; supabaseUrl: string; serviceRoleKey: string }): DuelContext => ({
  sb: input.sb,
  languageId: input.languageId,
  appUrl: Deno.env.get("ENGLISH_APP_URL") ?? "https://english.schood.online",
  botName: Deno.env.get("TELEGRAM_STUDENT_BOT_NAME") ?? "schoodstudentbot",
  notify: telegramDuelNotifier({ supabaseUrl: input.supabaseUrl, serviceRoleKey: input.serviceRoleKey }),
});

export const duelErrorResponse = (error: DuelError): Response =>
  json(error.status, { error: `Duel: ${error.code.replace(/_/g, " ")}`, code: `duel_${error.code}` });

/** Hub dispatch for duels; null when the route is not a duel route. */
export const handleDuelRoute = async (input: Input): Promise<Response | null> => {
  const { req, route, userId } = input;
  const isList = req.method === "GET" && route === "/duels";
  const isCreate = req.method === "POST" && route === "/duel";
  const match = ROUTE.exec(route);
  if (!isList && !isCreate && !match) return null;

  const ctx = duelContext(input);
  try {
    if (isList) return json(200, { ok: true, duels: await listDuels(ctx, userId) });
    const body = req.method === "POST" ? await parseBody(req) as Record<string, unknown> : {};
    const locale = localeOf(body.locale);
    if (isCreate) return json(201, { ok: true, ...(await createDuel(ctx, userId, { channel: "web", locale })) });

    const code = match![1]!;
    const action = match![2] ?? null;
    if (req.method === "GET" && !action) {
      try {
        return json(200, { ok: true, duel: await getDuel(ctx, userId, code) });
      } catch (error) {
        if (error instanceof DuelError && error.code === "not_participant") {
          return json(200, { ok: true, duel: null, invite: await peekInvite(ctx, code) });
        }
        throw error;
      }
    }
    if (req.method !== "POST") return null;
    if (action === "join") return json(200, { ok: true, ...(await joinDuel(ctx, userId, code, { channel: "web", locale })) });
    if (action === "start") return json(200, { ok: true, ...(await startDuel(ctx, userId, code, { channel: "web", locale })) });
    if (action === "rematch") return json(200, { ok: true, ...(await rematchDuel(ctx, userId, code, { channel: "web", locale })) });
    if (action === "answer") {
      const result = await answerDuel(ctx, userId, code, { index: Number(body.index), choice: Number(body.choice) });
      return json(200, { ok: true, ...result });
    }
    return null;
  } catch (error) {
    if (error instanceof DuelError) return duelErrorResponse(error);
    throw error;
  }
};
