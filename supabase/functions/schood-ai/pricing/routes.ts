import { AI_PLANS, COACH_PACK_OF, GIFT_VALID_DAYS, isLaunched, productOfPlan, SITTING_VALID_DAYS, type CatalogPlan } from '../../../../packages/ai-core/src/catalog.ts';
import { MONTHLY_CREDITS } from '../../../../packages/ai-core/src/mod.ts';
import { requireAdult } from '../age.ts';
import { forgetTeamSeats } from '../coach/access.ts';
import { optionalUuid, record, text, uuid } from '../input.ts';
import { SchoodAIError, type RequestContext, type RouteHandler, type SchoodAIRepository } from '../types.ts';
import { codeHash, deriveCode, normaliseCode } from './codes.ts';
import { pricingStore, TEAM_PACKS, type CatalogRow, type FulfilReply, type Fulfilment, type Gift, type PricingStore } from './store.ts';

// pricing/* routes (docs/product/44_SCHOOD_AI.md, "Plans"; L18 gifts; Coach Team):
//   catalog      anyone (anonymous): every plan with its price now and whether it is on sale;
//   launch       anyone, any origin: { launched }, for the "Ask Schood AI" links in other apps;
//   me / sync    the signed-in person: fulfils what they paid for (credits, gift codes, sittings,
//                team orders), then lists their purchases, gifts and teams to set up;
//   gift-redeem  the signed-in recipient, once per code, before it expires;
//   team-setup   the buyer of a Coach Team names it and picks its coaches, or extends a team.
// Buying itself is the platform's checkout (schood.online/checkout); nothing here takes money.

export const APP_URL = 'https://ai.schood.online';
const store = (ctx: RequestContext): PricingStore => ctx.store(pricingStore);

// The launch switch, read with the service settings. Cached briefly per repository: the
// links in the other apps ask often, and the switch changes once.
const launchCache = new WeakMap<SchoodAIRepository, { at: number; value: boolean }>();
export async function launchState(ctx: RequestContext): Promise<boolean> {
  const at = ctx.now().getTime(), hit = launchCache.get(ctx.repo);
  if (hit && at - hit.at >= 0 && at - hit.at < 30_000) return hit.value;
  const value = isLaunched((await ctx.repo.settings()).features);
  launchCache.set(ctx.repo, { at, value });
  return value;
}

/** Whether a plan can be bought now: launched, sold by checkout, and active in the catalogue. */
export const onSale = (plan: CatalogPlan, row: CatalogRow | undefined, launched: boolean) =>
  launched && plan.channel === 'checkout' && !!row?.planActive && row.productStatus === 'active';

export function catalogView(rows: CatalogRow[], launched: boolean) {
  const byId = new Map(rows.map((row) => [row.planId, row]));
  return AI_PLANS.map((plan) => {
    const row = byId.get(plan.id), product = productOfPlan(plan);
    return {
      slug: plan.slug, id: plan.id, product: product.slug, product_id: product.id, kind: plan.kind, channel: plan.channel,
      plan: plan.plan ?? null, coach: plan.coach ?? null, pack: plan.coach ? COACH_PACK_OF[plan.coach] : null,
      // The catalogue's amount wins: it is what checkout charges.
      amount: row?.amount ?? plan.amount, currency: row?.currency ?? plan.currency, days: row ? row.days : plan.days,
      monthly_credits: plan.plan ? MONTHLY_CREDITS[plan.plan] : null, credits: plan.credits ?? null,
      gift: plan.gift ?? null, seats: plan.seats ?? null, add_on: plan.addOn ?? null,
      order: plan.order, recommended: plan.recommended === true, on_sale: onSale(plan, row, launched),
    };
  });
}

async function catalog(ctx: RequestContext) {
  const [rows, launched] = await Promise.all([store(ctx).catalog().catch(() => [] as CatalogRow[]), launchState(ctx)]);
  return { launched, plans: catalogView(rows, launched), gift_valid_days: GIFT_VALID_DAYS, sitting_valid_days: SITTING_VALID_DAYS };
}

// --- The signed-in person's purchases ------------------------------------------------------
async function giftView(ctx: RequestContext, gift: Gift, secret: string | null) {
  let code: string | null = null;
  if (secret && gift.status === 'issued' && Date.parse(gift.expiresAt) > ctx.now().getTime()) {
    const derived = await deriveCode(secret, gift.id), hash = await codeHash(derived);
    // Set once; a code is shown only when it is the one the table can redeem.
    if (gift.codeHash === hash || (!gift.codeHash && await store(ctx).setGiftHash(gift.id, hash))) code = derived;
  }
  return {
    id: gift.id, plan: gift.planSlug, kind: gift.grantCredits ? 'credits' : 'plus', days: gift.grantDays, credits: gift.grantCredits,
    status: gift.status === 'issued' && Date.parse(gift.expiresAt) <= ctx.now().getTime() ? 'expired' : gift.status,
    expires_at: gift.expiresAt, redeemed_at: gift.redeemedAt, bought_at: gift.createdAt,
    code, link: code ? `${APP_URL}/gift#${code}` : null,
  };
}
const purchaseView = (row: Fulfilment) => ({
  payment_id: row.paymentId, plan: AI_PLANS.find((plan) => plan.id === row.planId)?.slug ?? null, kind: row.kind, state: row.state,
  credits: typeof row.outcome.credits === 'number' ? row.outcome.credits : null, seats: typeof row.outcome.seats === 'number' ? row.outcome.seats : null,
  team_id: typeof row.outcome.team_id === 'string' ? row.outcome.team_id : null, created_at: row.createdAt,
});

/** Fulfils what the person paid for, then lists it. The checkout's return page calls this. */
async function mine(ctx: RequestContext) {
  const userId = ctx.user.id;
  let synced: FulfilReply[] = [];
  try {
    synced = await store(ctx).sync(userId);
  } catch (cause) {
    // The next call or the scheduled job fulfils it; the person still sees what they have.
    console.error(JSON.stringify({ event: 'schood_ai_pricing_sync_failed', error: String(cause).slice(0, 200) }));
  }
  if (synced.some((reply) => reply.ok && reply.kind === 'coach_team')) forgetTeamSeats(userId);
  for (const reply of synced.filter((entry) => entry.ok && !entry.replayed)) {
    await ctx.audit('pricing.fulfilled', { kind: reply.kind, state: reply.state }, { type: 'payment', id: String(reply.payment_id) });
  }
  const [plan, purchases, gifts, secret] = await Promise.all([ctx.plan(), store(ctx).fulfilments(userId, 100), store(ctx).gifts(userId, 100), ctx.repo.systemSecret().catch(() => null)]);
  return {
    launched: plan.launched !== false,
    plan: { plans: plan.plans, features: plan.features, beta: plan.beta, grant: plan.grant },
    // Just fulfilled by this call (the return page shows them).
    arrived: synced.filter((reply) => reply.ok && !reply.replayed).map((reply) => ({ payment_id: reply.payment_id, kind: reply.kind, state: reply.state })),
    purchases: purchases.filter((row) => row.state !== 'refused').map(purchaseView),
    gifts: await Promise.all(gifts.map((gift) => giftView(ctx, gift, secret))),
    gift_codes_available: !!secret,
    teams_to_set_up: purchases.filter((row) => row.kind === 'coach_team' && row.state === 'awaiting_setup').map(purchaseView),
  };
}

// --- Gifts ---------------------------------------------------------------------------
const REDEEM_REFUSALS: Record<string, [number, string]> = {
  gift_not_found: [404, 'This gift code is not valid.'],
  gift_used: [409, 'This gift has already been redeemed.'],
  gift_revoked: [410, 'This gift was withdrawn.'],
  gift_expired: [410, 'This gift has expired.'],
  account_inactive: [403, 'This account cannot redeem gifts.'],
  no_account_tenant: [409, 'Your Schood account is not ready yet. Try again later.'],
};
async function redeem(ctx: RequestContext) {
  const userId = ctx.user.id;
  // Codes are 80 bits, so guessing is hopeless; this keeps it so.
  const rate = await ctx.repo.takeRate(`pricing.redeem:${userId}`, 10, 3600);
  if (!rate.ok) throw new SchoodAIError('rate_limited', 'Too many tries. Try again later.', 429, { retry_after: rate.retryAt });
  const body = record(await ctx.body());
  const code = normaliseCode(body.code);
  if (!code) throw new SchoodAIError('gift_not_found', REDEEM_REFUSALS.gift_not_found[1], 404);
  const reply = await store(ctx).redeem(await codeHash(code), userId, ctx.now());
  if (!reply.ok) {
    const [status, message] = REDEEM_REFUSALS[reply.code] ?? [400, 'This gift cannot be redeemed.'];
    throw new SchoodAIError(reply.code, message, status, reply.expired_at ? { expired_at: reply.expired_at } : {});
  }
  if (!reply.replayed) await ctx.audit('pricing.gift_redeemed', { kind: reply.redemption.kind }, { type: 'gift', id: reply.gift_id });
  // The doc's consent rules still apply to whoever uses it: a minor (or anyone whose age is not
  // confirmed yet) takes the age and guardian step before the assistant answers. A gift never skips it.
  let adult = false;
  try { await requireAdult(ctx, userId); adult = true; } catch { /* minor or unknown */ }
  return { gift: reply.redemption, replayed: reply.replayed, consent_step: !adult };
}

// --- Coach Team ------------------------------------------------------------------------
async function teamSetup(ctx: RequestContext) {
  const body = record(await ctx.body());
  const paymentId = uuid(body.payment_id, 'payment_id');
  const teamId = optionalUuid(body.team_id, 'team_id');
  let name: string | null = null, packs: string[] | null = null;
  if (!teamId) {
    name = text(body.name, 'name', { min: 2, max: 80 });
    packs = Array.isArray(body.packs) ? [...new Set(body.packs.map(String))] : [];
    if (!packs.length || packs.length > 6 || packs.some((pack) => !TEAM_PACKS.includes(pack))) throw new SchoodAIError('invalid_request', 'packs must name coaches.', 400, { field: 'packs' });
  }
  const reply = await store(ctx).teamSetup({ paymentId, userId: ctx.user.id, name, packs, teamId, now: ctx.now() });
  if (!reply.ok) {
    const status = reply.code === 'invalid_packs' || reply.code === 'invalid_name' ? 400 : 404;
    throw new SchoodAIError(reply.code === 'invalid_packs' || reply.code === 'invalid_name' ? 'invalid_request' : reply.code, 'This team order cannot be set up.', status);
  }
  forgetTeamSeats(ctx.user.id);
  if (!reply.replayed) await ctx.audit('pricing.team_setup', { extended: !!teamId }, { type: 'coach_team', id: String(reply.outcome.team_id ?? '') });
  return { team: reply.outcome, replayed: reply.replayed };
}

export function pricingRoutes(): Record<string, RouteHandler> {
  return {
    // The /pricing page, signed in or not (an ordinary anonymous limit per visitor).
    catalog: { GET: catalog, anonymous: { perMinute: 60, perDay: 5000 } },
    // The other apps' results screens ask this before showing "Ask Schood AI". Tiny, any origin.
    launch: { GET: async (ctx) => ({ launched: await launchState(ctx) }), anonymous: { perMinute: 600, perDay: 100000, cors: 'any' } },
    me: { GET: mine },
    sync: { POST: mine },
    'gift-redeem': { POST: redeem, maxBody: 2 * 1024 },
    'team-setup': { POST: teamSetup, maxBody: 4 * 1024 },
  };
}
