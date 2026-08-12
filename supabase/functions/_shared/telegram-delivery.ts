import { evaluateNotificationPolicy, type NotificationCategory, type NotificationDecision } from "./telegram-growth.ts";

export type TelegramApiResult = {
  ok?: boolean;
  httpStatus?: number;
  description?: string;
  parameters?: { retry_after?: number };
  result?: { message_id?: number };
};

export type TelegramFailureDecision = {
  retryable: boolean;
  reason: "rate_limited" | "transient" | "network" | "blocked" | "permanent";
  retryAfterSeconds: number | null;
};

const boundedRetryAfter = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(Math.max(Math.ceil(parsed), 1), 86400) : fallback;
};

export const classifyTelegramFailure = (result: TelegramApiResult, attempt: number): TelegramFailureDecision => {
  const status = Number(result.httpStatus ?? 0);
  if (status === 429) {
    return { retryable: true, reason: "rate_limited", retryAfterSeconds: boundedRetryAfter(result.parameters?.retry_after, 60) };
  }
  if (status === 0) {
    return { retryable: true, reason: "network", retryAfterSeconds: Math.min(60 * Math.max(attempt, 1), 3600) };
  }
  if (status >= 500) {
    return { retryable: true, reason: "transient", retryAfterSeconds: Math.min(60 * Math.max(attempt, 1), 3600) };
  }
  if (status === 403) return { retryable: false, reason: "blocked", retryAfterSeconds: null };
  return { retryable: false, reason: "permanent", retryAfterSeconds: null };
};

export type CurrentDeliveryPolicy = {
  category: NotificationCategory;
  timezone?: string | null;
  quietHoursStart?: string | null;
  quietHoursEnd?: string | null;
  notificationsEnabled: boolean;
  telegramEnabled: boolean;
  categoryEnabled: boolean;
  specificEnabled: boolean;
  recentCategoryCount: number;
  mandatory: boolean;
  now?: Date;
};

export const evaluateCurrentDeliveryPolicy = (input: CurrentDeliveryPolicy): NotificationDecision =>
  evaluateNotificationPolicy({
    category: input.category,
    timezone: input.timezone,
    quietHoursStart: input.quietHoursStart,
    quietHoursEnd: input.quietHoursEnd,
    telegramEnabled: input.notificationsEnabled && input.telegramEnabled,
    categoryEnabled: input.categoryEnabled,
    specificEnabled: input.specificEnabled,
    recentCategoryCount: input.recentCategoryCount,
    mandatory: input.mandatory,
    now: input.now,
  });
