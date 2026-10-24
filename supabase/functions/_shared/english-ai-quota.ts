// Learner AI credits for English (english_ai_usage_daily, one credit per AI
// call, limit from english_service_settings.ai.daily_limit).
//
// A credit is taken before the call (so parallel requests cannot overshoot)
// and given back when the call did not produce an answer: provider error, no
// key, or AI switched off. When AI is unavailable no credit is taken at all.

import { consumeEnglishAiDailyQuota, type EnglishAiQuota } from "./english-access.ts";
import {
  callEnglishAIWithStatus,
  englishAIAvailable,
  englishAIRuntimeInfo,
  type EnglishAIRequest,
  type EnglishAIResult,
} from "./english-ai.ts";
import { type EnglishAICallRecord, recordEnglishAICall } from "./english-ai-ledger.ts";
import { loadEnglishSettings } from "./english-settings.ts";

/** Gives one credit back. Never throws (an old database without the RPC just logs). */
export const refundEnglishAiDailyQuota = async (sb: any, userId: string): Promise<void> => {
  try {
    const { error } = await sb.rpc("refund_english_ai_daily_quota", { p_user_id: userId, p_amount: 1 });
    if (error) throw new Error(error.message ?? "rpc failed");
  } catch (error) {
    console.warn(JSON.stringify({
      event: "english_ai_refund_failed",
      error: error instanceof Error ? error.message.slice(0, 200) : "unknown",
    }));
  }
};

export type AICreditDeps = {
  available: (feature: string) => Promise<boolean>;
  consume: (userId: string) => Promise<EnglishAiQuota>;
  refund: (userId: string) => Promise<void>;
  call: <T>(req: EnglishAIRequest, fallback: T) => Promise<EnglishAIResult<T>>;
  record: (record: EnglishAICallRecord) => void;
};

export const defaultAICreditDeps = (sb: any): AICreditDeps => ({
  available: (feature) => englishAIAvailable(feature),
  consume: async (userId) => consumeEnglishAiDailyQuota(sb, userId, (await loadEnglishSettings(sb)).ai.daily_limit),
  refund: (userId) => refundEnglishAiDailyQuota(sb, userId),
  call: callEnglishAIWithStatus,
  record: (record) => recordEnglishAICall(record, sb),
});

/**
 * One request's AI credit, for routers that check the quota up front and call
 * the AI later (the hub). `charge()` takes the credit (or returns null when AI
 * is unavailable, so nothing is taken); `call()` tags the request with the
 * feature and learner and refunds the credit once if the call fails.
 */
export const createAICreditSession = (input: { userId: string; feature: string; deps: AICreditDeps }) => {
  const { userId, feature, deps } = input;
  let charged = false;
  return {
    feature,
    charge: async (): Promise<EnglishAiQuota | null> => {
      if (!(await deps.available(feature))) return null;
      const quota = await deps.consume(userId);
      if (quota.allowed) charged = true;
      else deps.record({ feature, userId, status: "over_limit" });
      return quota;
    },
    call: async <T>(req: EnglishAIRequest, fallback: T): Promise<EnglishAIResult<T>> => {
      const result = await deps.call<T>({ ...req, feature: req.feature ?? feature, userId: req.userId ?? userId }, fallback);
      if (result.status !== "ok" && charged) {
        charged = false;
        await deps.refund(userId);
      }
      return result;
    },
  };
};

/**
 * One AI call paid with one credit: unavailable AI is called without a charge
 * (it returns the fallback and is logged), an empty quota returns the fallback
 * with `over_limit: true`, and a failed call is refunded. Never throws: if the
 * quota cannot be checked the AI is skipped and the fallback returned.
 */
export const callEnglishAIWithCredit = async <T>(
  deps: AICreditDeps,
  userId: string,
  req: EnglishAIRequest & { feature: string },
  fallback: T,
): Promise<EnglishAIResult<T> & { over_limit?: boolean }> => {
  const session = createAICreditSession({ userId, feature: req.feature, deps });
  let quota: EnglishAiQuota | null;
  try {
    quota = await session.charge();
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 200) : "quota_check_failed";
    return { data: fallback, status: "failed", provider: englishAIRuntimeInfo().provider, error: `english_ai_quota_unavailable: ${message}` };
  }
  if (quota && !quota.allowed) {
    return { data: fallback, status: "failed", provider: englishAIRuntimeInfo().provider, error: "english_ai_daily_limit_reached", over_limit: true };
  }
  return await session.call<T>(req, fallback);
};
