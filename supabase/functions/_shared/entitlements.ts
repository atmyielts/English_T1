// Pure entitlement-granting decisions shared by the payment path.
// Extracted from the click Edge function so the "what does this payment grant,
// and until when" logic is unit-testable without HTTP or a database.

/** Build the entitlement `value` blob from a plan id + limits map. */
export const buildEntitlementValue = (
  planId: string | null | undefined,
  limits: Record<string, number>,
): Record<string, unknown> => {
  const value: Record<string, unknown> = {};
  if (planId) value.plan_id = planId;
  if (Object.keys(limits).length > 0) value.limits = limits;
  return value;
};

/** Distinct set of product ids a payment grants: the purchased product + bundle. */
export const getEntitlementTargets = (
  productId: string,
  included: string[],
): string[] => {
  const set = new Set<string>([productId, ...included]);
  return Array.from(set);
};

/**
 * Compute an entitlement expiry. Renewal stacking: if the learner still has
 * unexpired access, extend from the later of (now, current expiry) so early
 * renewals add time rather than throwing it away. Lifetime (no duration)
 * returns null. An already-expired entitlement restarts from now.
 */
export const computeEntitlementEndsAt = (
  durationDays: number | null | undefined,
  existingEndsAt: string | null | undefined,
  nowMs: number = Date.now(),
): string | null => {
  if (!durationDays || durationDays <= 0) return null;
  let baseMs = nowMs;
  if (existingEndsAt) {
    const existingMs = Date.parse(existingEndsAt);
    if (Number.isFinite(existingMs)) baseMs = Math.max(nowMs, existingMs);
  }
  return new Date(baseMs + durationDays * 24 * 60 * 60 * 1000).toISOString();
};
