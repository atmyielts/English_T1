import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  computeConfiguredAmount,
  computeDiscount,
  computeDiscountFromEffects,
  normalizeMoney,
} from "./pricing.ts";

Deno.test("normalizeMoney floors and rejects invalid/negative", () => {
  assertEquals(normalizeMoney(1000), 1000);
  assertEquals(normalizeMoney(1000.9), 1000);
  assertEquals(normalizeMoney("2500"), 2500);
  assertEquals(normalizeMoney(0), 0);
  assertEquals(normalizeMoney(-5), 0);
  assertEquals(normalizeMoney("nan"), 0);
  assertEquals(normalizeMoney(null), 0);
});

Deno.test("computeConfiguredAmount: percent, fixed, cap, clamp", () => {
  assertEquals(computeConfiguredAmount(10000, "percent", 10), 1000);
  assertEquals(computeConfiguredAmount(10000, "percent", 150), 10000); // pct clamped to 100
  assertEquals(computeConfiguredAmount(10000, "fixed", 3000), 3000);
  assertEquals(computeConfiguredAmount(10000, "fixed", 3000, 2000), 2000); // cap applies
  assertEquals(computeConfiguredAmount(1000, "fixed", 5000), 1000); // clamped to base
  assertEquals(computeConfiguredAmount(10000, "unknown", 10), 0);
  assertEquals(computeConfiguredAmount(0, "percent", 10), 0);
  assertEquals(computeConfiguredAmount(10000, "percent", 0), 0);
});

Deno.test("computeDiscountFromEffects sums percent_off and fixed_off", () => {
  assertEquals(
    computeDiscountFromEffects(
      { amount: 10000, currency: "UZS" },
      { currency: "UZS", effects: [{ type: "percent_off", percent: 10 }, { type: "fixed_off", amount: 500 }] },
    ),
    1500,
  );
});

Deno.test("computeDiscountFromEffects skips mismatched currency fixed_off and caps at original", () => {
  assertEquals(
    computeDiscountFromEffects(
      { amount: 10000, currency: "UZS" },
      { currency: "UZS", effects: [{ type: "fixed_off", amount: 999, currency: "USD" }] },
    ),
    null, // currency mismatch => no applied effect
  );
  assertEquals(
    computeDiscountFromEffects(
      { amount: 1000, currency: "UZS" },
      { currency: "UZS", effects: [{ type: "fixed_off", amount: 999999 }] },
    ),
    1000, // capped at original
  );
});

Deno.test("computeDiscountFromEffects returns null with no effects", () => {
  assertEquals(computeDiscountFromEffects({ amount: 1000, currency: "UZS" }, { currency: "UZS", effects: [] }), null);
  assertEquals(computeDiscountFromEffects({ amount: 1000, currency: "UZS" }, { currency: "UZS", effects: null }), null);
});

Deno.test("computeDiscount falls back to discount_type/value", () => {
  assertEquals(
    computeDiscount({ id: "p", product_id: "x", amount: 10000, currency: "UZS" }, { discount_type: "percent", value: 25, currency: "UZS" }),
    { original_amount: 10000, discount_amount: 2500, final_amount: 7500 },
  );
  assertEquals(
    computeDiscount({ id: "p", product_id: "x", amount: 10000, currency: "UZS" }, { discount_type: "fixed", value: 3000, currency: "UZS" }),
    { original_amount: 10000, discount_amount: 3000, final_amount: 7000 },
  );
});

Deno.test("computeDiscount prefers effects over discount_type", () => {
  assertEquals(
    computeDiscount(
      { id: "p", product_id: "x", amount: 10000, currency: "UZS" },
      { discount_type: "fixed", value: 9000, currency: "UZS", effects: [{ type: "percent_off", percent: 10 }] },
    ),
    { original_amount: 10000, discount_amount: 1000, final_amount: 9000 },
  );
});

Deno.test("computeDiscount rejects invalid plan/coupon", () => {
  assertEquals(computeDiscount({ amount: 0, currency: "UZS" }, { discount_type: "percent", value: 10, currency: "UZS" }), null);
  assertEquals(computeDiscount({ amount: 1000, currency: "UZS" }, { discount_type: "percent", value: 0, currency: "UZS" }), null);
  assertEquals(computeDiscount({ amount: 1000, currency: "UZS" }, { discount_type: "fixed", value: 100, currency: "USD" }), null); // currency mismatch
});

Deno.test("computeDiscount never produces a negative final amount", () => {
  const r = computeDiscount({ amount: 1000, currency: "UZS" }, { discount_type: "fixed", value: 999999, currency: "UZS" });
  assertEquals(r, { original_amount: 1000, discount_amount: 1000, final_amount: 0 });
});
