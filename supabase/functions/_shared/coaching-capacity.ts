import { boundedJson } from "./ai-response.ts";

export type CoachingCapacity = {
  available: boolean;
  reason: string;
  free_requests_remaining: number | null;
  free_requests_limit: number | null;
  budget_remaining_usd: number | null;
};
const unknown = (reason: string): CoachingCapacity => ({
  available: false,
  reason,
  free_requests_remaining: null,
  free_requests_limit: null,
  budget_remaining_usd: null,
});
const number = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 &&
  value <= 1e9;
const count = (value: unknown): value is number =>
  number(value) && Number.isInteger(value);
const remainingCurrency = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) &&
  Math.abs(value) <= 1e9;
const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

export function coachingCapacity(
  payload: unknown,
  freeModel: boolean,
): CoachingCapacity {
  if (!record(payload) || !record(payload.data)) {
    return unknown("provider_capacity_unconfirmed");
  }
  const data = payload.data;
  if (freeModel) {
    const quota = data.free_model_daily_requests;
    if (
      !record(quota) || !count(quota.used) || !count(quota.limit) ||
      !count(quota.remaining) ||
      (quota.remaining > 0 && quota.used + quota.remaining !== quota.limit) ||
      (quota.remaining === 0 && quota.used < quota.limit)
    ) return unknown("provider_capacity_unconfirmed");
    return {
      available: quota.remaining > 0,
      reason: quota.remaining > 0
        ? "available"
        : "provider_free_quota_exhausted",
      free_requests_remaining: quota.remaining,
      free_requests_limit: quota.limit,
      budget_remaining_usd: null,
    };
  }
  // Paid dispatch requires a provider-enforced spend cap, not just an API key.
  const remaining: number[] = [];
  if (data.limit !== null && data.limit !== undefined) {
    if (
      !number(data.limit) || !remainingCurrency(data.limit_remaining) ||
      data.limit_remaining > data.limit
    ) {
      return unknown("provider_capacity_unconfirmed");
    }
    remaining.push(data.limit_remaining);
  }
  if (data.budgets !== undefined) {
    if (!Array.isArray(data.budgets)) {
      return unknown("provider_capacity_unconfirmed");
    }
    for (const budget of data.budgets) {
      if (
        !record(budget) || !number(budget.limit_usd) ||
        !remainingCurrency(budget.remaining_usd) ||
        budget.remaining_usd > budget.limit_usd
      ) {
        return unknown("provider_capacity_unconfirmed");
      }
      remaining.push(budget.remaining_usd);
    }
  }
  if (!remaining.length) return unknown("provider_budget_unconfigured");
  const budget = Math.min(...remaining);
  return {
    available: budget > 0,
    reason: budget > 0 ? "available" : "provider_budget_exhausted",
    free_requests_remaining: null,
    free_requests_limit: null,
    budget_remaining_usd: budget,
  };
}

export function createCoachingCapacityReader(
  config: { key: string; model: string; baseUrl: string },
  fetcher: typeof fetch = fetch,
  report?: (status: CoachingCapacity) => void,
  now: () => number = Date.now,
) {
  let cached: CoachingCapacity | undefined, expires = 0;
  let pending: Promise<CoachingCapacity> | undefined;
  const read = async () => {
    if (!config.key) return unknown("provider_unconfigured");
    try {
      const response = await fetcher(
        config.baseUrl.replace(/\/+$/, "") + "/key",
        {
          headers: { Authorization: "Bearer " + config.key },
          signal: AbortSignal.timeout(5000),
        },
      );
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        return unknown("provider_capacity_http_" + response.status);
      }
      return coachingCapacity(
        await boundedJson(response, 65536),
        config.model.endsWith(":free"),
      );
    } catch {
      return unknown("provider_capacity_unconfirmed");
    }
  };
  return (): Promise<CoachingCapacity> => {
    if (cached && now() < expires) return Promise.resolve(cached);
    if (pending) return pending;
    pending = read().then((status) => {
      cached = status;
      expires = now() + 30000;
      try {
        report?.(status);
      } catch { /* Metrics cannot change availability. */ }
      return status;
    }).finally(() => {
      pending = undefined;
    });
    return pending;
  };
}
