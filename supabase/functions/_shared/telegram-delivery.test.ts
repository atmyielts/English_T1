import { classifyTelegramFailure, evaluateCurrentDeliveryPolicy } from "./telegram-delivery.ts";

const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };

Deno.test("deferred delivery honors a later Telegram opt-out", () => {
  const decision = evaluateCurrentDeliveryPolicy({ category: "study_habit", notificationsEnabled: false, telegramEnabled: true, categoryEnabled: true, specificEnabled: true, recentCategoryCount: 0, mandatory: false });
  assert(decision.reason === "telegram_disabled", "current global opt-out must suppress");
});

Deno.test("deferred commercial delivery honors a later category opt-out", () => {
  const decision = evaluateCurrentDeliveryPolicy({ category: "commercial", notificationsEnabled: true, telegramEnabled: true, categoryEnabled: false, specificEnabled: true, recentCategoryCount: 0, mandatory: false });
  assert(decision.reason === "category_disabled", "current commercial opt-out must suppress");
});

Deno.test("deferred delivery rechecks exhausted frequency caps", () => {
  const decision = evaluateCurrentDeliveryPolicy({ category: "study_habit", notificationsEnabled: true, telegramEnabled: true, categoryEnabled: true, specificEnabled: true, recentCategoryCount: 2, mandatory: false });
  assert(decision.reason === "frequency_cap", "new sent history must suppress queued work");
});

Deno.test("quiet hours are re-evaluated at drain time", () => {
  const inside = evaluateCurrentDeliveryPolicy({ category: "academic_required", notificationsEnabled: true, telegramEnabled: true, categoryEnabled: true, specificEnabled: true, recentCategoryCount: 0, mandatory: false, timezone: "Asia/Tashkent", quietHoursStart: "22:00", quietHoursEnd: "07:00", now: new Date("2026-08-12T20:00:00Z") });
  const ended = evaluateCurrentDeliveryPolicy({ category: "academic_required", notificationsEnabled: true, telegramEnabled: true, categoryEnabled: true, specificEnabled: true, recentCategoryCount: 0, mandatory: false, timezone: "Asia/Tashkent", quietHoursStart: "22:00", quietHoursEnd: "07:00", now: new Date("2026-08-13T03:00:00Z") });
  assert(inside.outcome === "defer", "quiet hours must keep the row queued");
  assert(ended.outcome === "send", "row must become eligible after quiet hours");
});

Deno.test("system mandatory policy remains eligible", () => {
  const decision = evaluateCurrentDeliveryPolicy({ category: "system", notificationsEnabled: false, telegramEnabled: false, categoryEnabled: false, specificEnabled: false, recentCategoryCount: 99, mandatory: true });
  assert(decision.outcome === "send", "mandatory system traffic must remain eligible");
});

Deno.test("multiple queued rows consume the cap sequentially", () => {
  let sentCount = 1;
  const first = evaluateCurrentDeliveryPolicy({ category: "study_habit", notificationsEnabled: true, telegramEnabled: true, categoryEnabled: true, specificEnabled: true, recentCategoryCount: sentCount, mandatory: false });
  if (first.outcome === "send") sentCount += 1;
  const second = evaluateCurrentDeliveryPolicy({ category: "study_habit", notificationsEnabled: true, telegramEnabled: true, categoryEnabled: true, specificEnabled: true, recentCategoryCount: sentCount, mandatory: false });
  assert(first.outcome === "send" && second.reason === "frequency_cap", "drain must observe earlier sends in the same batch");
});

Deno.test("Telegram retry classification separates permanent and transient failures", () => {
  assert(classifyTelegramFailure({ httpStatus: 400 }, 1).retryable === false, "400 must be permanent");
  assert(classifyTelegramFailure({ httpStatus: 403 }, 1).reason === "blocked", "403 must be blocked");
  assert(classifyTelegramFailure({ httpStatus: 429, parameters: { retry_after: 37 } }, 1).retryAfterSeconds === 37, "429 must honor retry_after");
  assert(classifyTelegramFailure({ httpStatus: 429, parameters: { retry_after: -5 } }, 1).retryAfterSeconds === 1, "negative retry_after must be bounded");
  assert(classifyTelegramFailure({ httpStatus: 429, parameters: { retry_after: 999999 } }, 1).retryAfterSeconds === 86400, "large retry_after must be bounded");
  assert(classifyTelegramFailure({ httpStatus: 429, parameters: { retry_after: Number.NaN } }, 1).retryAfterSeconds === 60, "invalid retry_after must use fallback");
  assert(classifyTelegramFailure({ httpStatus: 503 }, 2).retryAfterSeconds === 120, "5xx must use bounded backoff");
});
