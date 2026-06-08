// Pure pricing / discount / referral math shared by the payment functions.
// Extracted from the click Edge function so the money math is unit-testable
// without HTTP or a database. Behavior must stay identical to the original.

export type PricingPlan = {
  id?: string;
  product_id?: string;
  amount: number;
  currency: string;
};

export type PricingCouponEffect = {
  type: string;
  [key: string]: unknown;
};

export type PricingCoupon = {
  discount_type: "percent" | "fixed";
  value: number;
  currency: string;
  effects?: PricingCouponEffect[] | null;
};

export type DiscountResult = {
  original_amount: number;
  discount_amount: number;
  final_amount: number;
};

/** Floor a money-ish value to a non-negative integer; 0 for invalid/negative input. */
export const normalizeMoney = (raw: unknown): number => {
  const n = Number(raw ?? 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
};

/**
 * Resolve a configured percent/fixed amount against a base, capped and clamped
 * to [0, base]. Used for referral discounts, credits, and cash payouts.
 */
export const computeConfiguredAmount = (
  baseAmount: number,
  type: unknown,
  value: unknown,
  cap?: unknown,
): number => {
  const normalizedType = String(type ?? "").trim().toLowerCase();
  const numericValue = Number(value ?? 0);
  if (
    !Number.isFinite(baseAmount) || baseAmount <= 0 ||
    !Number.isFinite(numericValue) || numericValue <= 0
  ) return 0;

  let amount = 0;
  if (normalizedType === "percent") {
    amount = Math.round((baseAmount * Math.min(numericValue, 100)) / 100);
  } else if (normalizedType === "fixed") {
    amount = numericValue;
  }

  const numericCap = cap === null || typeof cap === "undefined" ? null : Number(cap);
  if (numericCap !== null && Number.isFinite(numericCap) && numericCap >= 0) {
    amount = Math.min(amount, numericCap);
  }

  return Math.max(0, Math.min(baseAmount, Math.floor(amount)));
};

/**
 * Sum coupon `effects` (percent_off / fixed_off) into a discount amount.
 * Returns null when there are no applicable effects.
 */
export const computeDiscountFromEffects = (
  plan: Pick<PricingPlan, "amount" | "currency">,
  coupon: Pick<PricingCoupon, "effects" | "currency">,
): number | null => {
  const effects = Array.isArray(coupon.effects) ? coupon.effects : [];
  if (effects.length === 0) return null;

  const original = Number(plan.amount);
  if (!Number.isFinite(original) || original <= 0) return null;

  let discount = 0;
  let applied = false;

  for (const effect of effects) {
    const type = String((effect as any)?.type ?? "").trim().toLowerCase();
    if (!type) continue;
    if (type === "percent_off") {
      const pct = Number((effect as any)?.percent ?? (effect as any)?.value ?? NaN);
      if (!Number.isFinite(pct) || pct <= 0 || pct > 100) continue;
      discount += Math.round((original * pct) / 100);
      applied = true;
    } else if (type === "fixed_off") {
      const amt = Number((effect as any)?.amount ?? (effect as any)?.value ?? NaN);
      if (!Number.isFinite(amt) || amt <= 0) continue;
      const currency = String((effect as any)?.currency ?? coupon.currency ?? plan.currency).toUpperCase();
      if (currency !== String(plan.currency).toUpperCase()) continue;
      discount += amt;
      applied = true;
    }
  }

  if (!applied) return null;
  return Math.max(0, Math.min(original, Math.floor(discount)));
};

/**
 * Full discount calculation: prefers structured `effects`, falls back to the
 * coupon's discount_type/value. Returns null when nothing applies.
 */
export const computeDiscount = (
  plan: Pick<PricingPlan, "id" | "product_id" | "amount" | "currency">,
  coupon: PricingCoupon,
): DiscountResult | null => {
  const original = Number(plan.amount);
  if (!Number.isFinite(original) || original <= 0) return null;

  let discount = computeDiscountFromEffects(plan, coupon);
  if (discount === null) {
    if (coupon.discount_type === "percent") {
      const pct = Number(coupon.value);
      if (!Number.isFinite(pct) || pct <= 0 || pct > 100) return null;
      discount = Math.round((original * pct) / 100);
    } else if (coupon.discount_type === "fixed") {
      const fixed = Number(coupon.value);
      if (!Number.isFinite(fixed) || fixed <= 0) return null;
      if (String(coupon.currency).toUpperCase() !== String(plan.currency).toUpperCase()) return null;
      discount = fixed;
    } else {
      return null;
    }
  }

  discount = Math.max(0, Math.min(original, Math.floor(discount)));
  const final = Math.max(0, original - discount);
  return { original_amount: original, discount_amount: discount, final_amount: final };
};
