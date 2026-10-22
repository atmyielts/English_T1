// Who may submit an English activity.
//
// A learner with the skill in their plan (or an admin) always may. Everyone
// else signed in gets a small free allowance: FREE_ACTIVITIES_PER_DAY
// activities a day across the skills they haven't bought. The day follows
// Uzbekistan time (UTC+5, no daylight saving), where most learners are.
// Review of saved words and the placement test are always free and never
// pass through here.

import { requireEnglishSuiteAccess } from "./english-access.ts";
import { json, resolveEnglishProducts } from "./english-learning.ts";

export const FREE_ACTIVITIES_PER_DAY = 1;
const LEARNER_UTC_OFFSET_HOURS = 5;

export type ActivityAccess = {
  allowed: boolean;
  /** entitled: the skill is in the learner's plan; free: uses today's free activity. */
  basis: "entitled" | "admin" | "free" | "free_used";
  free_left: number;
  free_per_day: number;
  entitled_skills: string[];
};

/** Start of the learner's current day, as an ISO timestamp in UTC. */
export const learnerDayStart = (now: Date = new Date()): string => {
  const shifted = new Date(now.getTime() + LEARNER_UTC_OFFSET_HOURS * 3_600_000);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - LEARNER_UTC_OFFSET_HOURS * 3_600_000).toISOString();
};

/** Pure decision, for tests. `usedFreeToday` counts today's activities in skills the learner hasn't bought. */
export const decideAccess = (input: {
  admin: boolean;
  entitled: boolean;
  usedFreeToday: number;
  perDay?: number;
}): Pick<ActivityAccess, "allowed" | "basis" | "free_left"> => {
  const perDay = input.perDay ?? FREE_ACTIVITIES_PER_DAY;
  const freeLeft = Math.max(0, perDay - input.usedFreeToday);
  if (input.admin) return { allowed: true, basis: "admin", free_left: freeLeft };
  if (input.entitled) return { allowed: true, basis: "entitled", free_left: freeLeft };
  return freeLeft > 0 ? { allowed: true, basis: "free", free_left: freeLeft } : { allowed: false, basis: "free_used", free_left: 0 };
};

type ProductMap = Record<string, { productId?: string | null }>;

/** Skills (service keys) whose product the learner holds. */
const entitledSkills = (products: ProductMap, productIds: string[]): string[] =>
  Object.entries(products)
    .filter(([, product]) => product?.productId && productIds.includes(String(product.productId)))
    .map(([skill]) => skill);

/**
 * The learner's access to `skill` right now. Pass `skill = null` for an
 * overview (free activities left, skills in the plan) without a decision.
 */
export const checkActivityAccess = async (
  sb: any,
  input: { userId: string; languageId: string; products: ProductMap; skill: string | null },
): Promise<ActivityAccess> => {
  const suite = await requireEnglishSuiteAccess(sb, input.userId, input.products);
  const owned = suite.admin ? Object.keys(input.products) : entitledSkills(input.products, suite.entitlementProductIds);
  const notOwned = Object.keys(input.products).filter((skill) => !owned.includes(skill));
  let used = 0;
  if (notOwned.length) {
    const { count } = await sb
      .from("learning_attempts")
      .select("id", { head: true, count: "exact" })
      .eq("user_id", input.userId)
      .eq("language_id", input.languageId)
      .in("service_key", notOwned)
      .gte("created_at", learnerDayStart());
    used = Number(count ?? 0);
  }
  const decision = decideAccess({
    admin: suite.admin,
    entitled: input.skill !== null && owned.includes(input.skill),
    usedFreeToday: used,
  });
  return { ...decision, free_per_day: FREE_ACTIVITIES_PER_DAY, entitled_skills: owned };
};

/** Standard refusal when today's free activity is used and the skill isn't in the learner's plan. */
export const freeLimitBody = (access: ActivityAccess) => ({
  error: "You've used today's free activity. Come back tomorrow, or choose a plan to practise as much as you like.",
  code: "english_free_limit_reached",
  free_per_day: access.free_per_day,
});

/**
 * One-call guard for submit routes: resolves the product list itself and
 * returns a 402 response when the learner can't submit, or null when they can.
 */
export const guardActivity = async (sb: any, userId: string, languageId: string, skill: string): Promise<Response | null> => {
  const products = await resolveEnglishProducts(sb) as ProductMap;
  const access = await checkActivityAccess(sb, { userId, languageId, products, skill });
  return access.allowed ? null : json(402, freeLimitBody(access));
};
