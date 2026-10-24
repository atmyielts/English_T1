// telegram-public action "english_check" (@schoodonlinebot Worker only, x-worker-secret).
//
//   { action: "english_check", chat_id, language_code, update_id, text }
//   → { ok: true, outcome, reply: TgReply }
//
// Empty text returns the prompt that asks for a sentence. Otherwise the text
// is validated, one daily slot is reserved (3 per chat, plus a global cap),
// the AI gateway estimates a rough band, and the slot is marked ok or failed
// (failed checks do not count). Rules and wording: _shared/english-tg-check.ts.
import { callEnglishAIWithStatus } from "../_shared/english-ai.ts";
import {
  chatHash,
  checkDay,
  checkLocale,
  checkSystemPrompt,
  checkUserPayload,
  limitReply,
  parseCheckResult,
  parseGlobalDailyLimit,
  problemReply,
  promptReply,
  resultReply,
  TG_CHECK_PER_CHAT_DAILY,
  type TgReply,
  unavailableReply,
  validateCheckInput,
} from "../_shared/english-tg-check.ts";

type Result = { status: number; body: { ok: boolean; outcome: string; reply?: TgReply; error?: string } };

const hashSecret = (): string => {
  const secret = Deno.env.get("TELEGRAM_RATE_LIMIT_SECRET") || Deno.env.get("TELEGRAM_INTERNAL_SECRET") || "";
  if (!secret) throw new Error("Missing env var: TELEGRAM_RATE_LIMIT_SECRET");
  return secret;
};

const finish = async (sb: any, id: string, patch: Record<string, unknown>) => {
  const { error } = await sb.from("english_tg_checks").update({ ...patch, finished_at: new Date().toISOString() }).eq("id", id);
  if (error) console.error(JSON.stringify({ event: "english_tg_check_finish_failed", message: error.message }));
};

export const runEnglishCheck = async (sb: any, body: Record<string, unknown>): Promise<Result> => {
  const locale = checkLocale(body.language_code);
  const chatId = String(body.chat_id ?? "").trim();
  if (!/^-?\d{1,20}$/.test(chatId)) return { status: 400, body: { ok: false, outcome: "invalid", error: "valid chat_id required" } };

  if (!String(body.text ?? "").trim()) return { status: 200, body: { ok: true, outcome: "prompt", reply: promptReply(locale) } };
  const input = validateCheckInput(body.text);
  if (!input.ok) return { status: 200, body: { ok: true, outcome: input.problem, reply: problemReply(locale, input.problem) } };

  const updateId = Number(body.update_id);
  const { data: reserved, error: reserveError } = await sb.rpc("english_tg_check_reserve", {
    p_chat_hash: await chatHash(hashSecret(), chatId),
    p_check_date: checkDay(),
    p_update_id: Number.isSafeInteger(updateId) ? updateId : null,
    p_chat_limit: TG_CHECK_PER_CHAT_DAILY,
    p_global_limit: parseGlobalDailyLimit(Deno.env.get("ENGLISH_TG_CHECK_DAILY_LIMIT")),
    p_locale: locale,
    p_input_chars: input.text.length,
  });
  if (reserveError || !reserved) throw new Error(reserveError?.message ?? "english_tg_check_reserve_failed");
  const slot = reserved as Record<string, unknown>;
  if (slot.allowed !== true) {
    const reason = slot.reason === "global_limit" ? "global_limit" : "chat_limit";
    if (reason === "global_limit") console.warn(JSON.stringify({ event: "english_tg_check_global_cap" }));
    return { status: 200, body: { ok: true, outcome: reason, reply: limitReply(locale, reason) } };
  }
  const slotId = String(slot.id);
  const used = Number(slot.chat_used);
  const checksLeft = slot.replay !== true && Number.isFinite(used) ? TG_CHECK_PER_CHAT_DAILY - used : null;

  const ai = await callEnglishAIWithStatus<unknown>({
    systemPrompt: checkSystemPrompt(locale),
    userPayload: checkUserPayload(input.text),
    temperature: 0.2,
    feature: "tg-english-check",
    userId: null,
  }, null);
  const result = ai.status === "ok" ? parseCheckResult(ai.data, input.text) : null;
  if (!result) {
    const reason = ai.status === "ok" ? "invalid_output" : ai.status;
    console.warn(JSON.stringify({ event: "english_tg_check_failed", reason, provider: ai.provider }));
    await finish(sb, slotId, { status: "failed", failure_reason: reason });
    return { status: 200, body: { ok: true, outcome: "unavailable", reply: unavailableReply(locale) } };
  }
  await finish(sb, slotId, { status: "ok", cefr: result.cefr, corrections_count: result.corrections.length });
  return { status: 200, body: { ok: true, outcome: "checked", reply: resultReply(locale, result, checksLeft) } };
};
