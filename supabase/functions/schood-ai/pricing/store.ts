import { AI_PLANS, AI_PRODUCTS, COACH_PACK_OF, FULFILLED_KINDS, GIFT_VALID_DAYS, PLAN_PRODUCT_IDS, planById, productOfPlan, SITTING_VALID_DAYS, type CoachFeature } from '../../../../packages/ai-core/src/catalog.ts';
import { defineStore, type ServiceDb } from '../stores.ts';
import type { SchoodAIRepository } from '../types.ts';

// The pricing area's data (migration 20261030500000_schood_ai_pricing.sql). Every write
// is one SQL function call, so each paid payment is fulfilled once and each gift redeemed
// once even under concurrency: the Postgres store only calls them. The memory twin
// mirrors the same rules for tests and dev stacks, with fake payments.

export type FulfilKind = 'credits' | 'gift' | 'certificate' | 'coach_team';
export interface Fulfilment {
  paymentId: string;
  userId: string | null;
  planId: string;
  kind: FulfilKind;
  state: 'done' | 'awaiting_setup' | 'refused';
  outcome: Record<string, unknown>;
  createdAt: string;
  appliedAt: string | null;
}
export interface Gift {
  id: string;
  paymentId: string;
  buyerId: string | null;
  planSlug: string;
  grantPlan: 'plus' | null;
  grantDays: number | null;
  grantCredits: number | null;
  codeHash: string | null;
  status: 'issued' | 'redeemed' | 'revoked';
  expiresAt: string;
  redeemedBy: string | null;
  redeemedAt: string | null;
  redemption: Record<string, unknown>;
  createdAt: string;
}
/** A catalogue row as `public.plans` and `public.products` hold it now. */
export interface CatalogRow { planId: string; productId: string; amount: number; currency: string; days: number | null; planActive: boolean; productStatus: string }
export interface FulfilReply { ok: boolean; replayed?: boolean; code?: string; payment_id?: string; kind?: FulfilKind; state?: Fulfilment['state']; outcome?: Record<string, unknown> }
export type RedeemReply =
  | { ok: true; replayed: boolean; gift_id: string; redemption: Record<string, unknown> }
  | { ok: false; code: 'gift_not_found' | 'gift_used' | 'gift_revoked' | 'gift_expired' | 'account_inactive' | 'no_account_tenant'; expired_at?: string };
export type TeamSetupReply =
  | { ok: true; replayed: boolean; outcome: Record<string, unknown> }
  | { ok: false; code: 'not_found' | 'team_not_found' | 'invalid_packs' | 'invalid_name' };

export interface PricingStore {
  /** The Schood AI plans as the catalogue holds them now (amount, active, product status). */
  catalog(): Promise<CatalogRow[]>;
  /** Fulfils one person's paid, not yet fulfilled payments (credit packs, gifts, sittings, team orders). */
  sync(userId: string): Promise<FulfilReply[]>;
  /** The same for everyone paid in the last 60 days (the scheduled job). */
  syncDue(limit: number): Promise<{ fulfilled: number; failed: number }>;
  fulfilments(userId: string, limit: number): Promise<Fulfilment[]>;
  gifts(buyerId: string, limit: number): Promise<Gift[]>;
  gift(id: string): Promise<Gift | null>;
  /** Sets a gift's code hash once; true when the stored hash is this one. */
  setGiftHash(giftId: string, hash: string): Promise<boolean>;
  redeem(hash: string, userId: string, now: Date): Promise<RedeemReply>;
  teamSetup(input: { paymentId: string; userId: string; name: string | null; packs: string[] | null; teamId: string | null; now: Date }): Promise<TeamSetupReply>;
}

// --- Postgres ---------------------------------------------------------------------------
type Row = Record<string, unknown>;
const obj = (value: unknown): Record<string, unknown> => (value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {});
const str = (value: unknown) => (value === null || value === undefined ? null : String(value));
const num = (value: unknown) => (value === null || value === undefined ? null : Number(value));
function check<T>(result: { data: unknown; error: { code?: string; message: string } | null }): T {
  if (result.error) throw new Error(`${result.error.code ?? 'db'}: ${result.error.message}`);
  return result.data as T;
}
const fulfilment = (row: Row): Fulfilment => ({
  paymentId: String(row.payment_id), userId: str(row.user_id), planId: String(row.plan_id), kind: row.kind as FulfilKind,
  state: row.state as Fulfilment['state'], outcome: obj(row.outcome), createdAt: String(row.created_at), appliedAt: str(row.applied_at),
});
const gift = (row: Row): Gift => ({
  id: String(row.id), paymentId: String(row.payment_id), buyerId: str(row.buyer_id), planSlug: String(row.plan_slug),
  grantPlan: row.grant_plan === 'plus' ? 'plus' : null, grantDays: num(row.grant_days), grantCredits: num(row.grant_credits), codeHash: str(row.code_hash),
  status: row.status as Gift['status'], expiresAt: String(row.expires_at), redeemedBy: str(row.redeemed_by), redeemedAt: str(row.redeemed_at),
  redemption: obj(row.redemption), createdAt: String(row.created_at),
});

export function createPostgresPricingStore(db: ServiceDb): PricingStore {
  const rpc = async <T>(name: string, args: Record<string, unknown>) => check<T>(await db.rpc(name, args));
  const planIds = AI_PLANS.map((plan) => plan.id), productIds = AI_PRODUCTS.map((product) => product.id);
  return {
    async catalog() {
      const [plans, products] = await Promise.all([
        db.from('plans').select('id,product_id,amount,currency,duration_days,is_active').in('id', planIds),
        db.from('products').select('id,status').in('id', productIds),
      ]);
      const status = new Map(check<Row[]>(products).map((row) => [String(row.id), String(row.status)]));
      return check<Row[]>(plans).map((row) => ({
        planId: String(row.id), productId: String(row.product_id), amount: Number(row.amount), currency: String(row.currency ?? 'UZS'),
        days: num(row.duration_days), planActive: row.is_active === true, productStatus: status.get(String(row.product_id)) ?? 'draft',
      }));
    },
    async sync(userId) { return (await rpc<FulfilReply[] | null>('ai_pricing_sync', { p_user: userId, p_limit: 20 })) ?? []; },
    async syncDue(limit) { const reply = obj(await rpc('ai_pricing_sync_due', { p_limit: limit })); return { fulfilled: Number(reply.fulfilled ?? 0), failed: Number(reply.failed ?? 0) }; },
    async fulfilments(userId, limit) {
      return check<Row[]>(await db.from('ai_pricing_fulfilments').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(limit)).map(fulfilment);
    },
    async gifts(buyerId, limit) {
      return check<Row[]>(await db.from('ai_pricing_gifts').select('*').eq('buyer_id', buyerId).order('created_at', { ascending: false }).limit(limit)).map(gift);
    },
    async gift(id) {
      const row = check<Row | null>(await db.from('ai_pricing_gifts').select('*').eq('id', id).maybeSingle());
      return row ? gift(row) : null;
    },
    async setGiftHash(giftId, hash) { return (await rpc<boolean>('ai_pricing_gift_set_hash', { p_gift: giftId, p_hash: hash })) === true; },
    async redeem(hash, userId, now) { return await rpc<RedeemReply>('ai_pricing_redeem', { p_hash: hash, p_user: userId, p_now: now.toISOString() }); },
    async teamSetup(input) {
      return await rpc<TeamSetupReply>('ai_pricing_team_setup', { p_payment: input.paymentId, p_user: input.userId, p_name: input.name, p_packs: input.packs, p_team: input.teamId, p_now: input.now.toISOString() });
    },
  };
}

// --- Memory twin ------------------------------------------------------------------------
export interface MemoryPayment { id: string; userId: string | null; planId: string; productId: string; status: string; createdAt: string }
export interface MemoryPricingWorld {
  /** Core's repository: personal workspaces and pack credits (ai_credit_grant's twin). */
  repo?: Pick<SchoodAIRepository, 'ensurePersonalWorkspace' | 'grantCredits'>;
  /** What payment fulfilment and a Plus gift write: an entitlement to these products for N days (null: no end). */
  grantProducts?(userId: string, productIds: string[], days: number | null, source: 'click' | 'gift'): void;
  /** The coach engine's teams (Coach Team setup). */
  coach?: { createTeam(input: { name: string; managerId: string; packs: string[]; seats: number; validUntil: string; source: string; createdBy: string }): Promise<{ id: string; validUntil: string }>; addTeamMember(teamId: string, userId: string, role: 'manager'): Promise<void> };
  inactiveUsers?: Set<string>;
}
export interface MemoryPricingStore extends PricingStore {
  /** A payment marked paid, as the Click webhook leaves it (plan purchases also get their entitlement, as fulfilment does). */
  pay(input: { userId: string; plan: string; status?: string; id?: string }): MemoryPayment;
  /** The catalogue part of ai_pricing_launch: self-serve plans on or off sale. */
  setOnSale(on: boolean): void;
  payments: MemoryPayment[];
}
const PAID = new Set(['paid', 'success', 'completed']);

export function createMemoryPricingStore(options: { now?: () => Date; world?: MemoryPricingWorld } = {}): MemoryPricingStore {
  const now = options.now ?? (() => new Date());
  const world = options.world ?? {};
  const payments: MemoryPayment[] = [];
  const fulfilments = new Map<string, Fulfilment>();
  const gifts = new Map<string, Gift>();
  const sale = new Map<string, boolean>(AI_PLANS.map((plan) => [plan.id, false]));
  let productsOn = false;
  const clone = <T>(value: T): T => structuredClone(value);
  const iso = () => now().toISOString();

  async function fulfil(payment: MemoryPayment): Promise<FulfilReply> {
    if (!PAID.has(payment.status)) return { ok: false, code: 'not_paid' };
    const plan = planById(payment.planId);
    if (!plan || !(FULFILLED_KINDS as readonly string[]).includes(plan.kind)) return { ok: false, code: 'not_fulfilled_here' };
    const existing = fulfilments.get(payment.id);
    if (existing) return { ok: existing.state !== 'refused', replayed: true, payment_id: payment.id, kind: existing.kind, state: existing.state, outcome: clone(existing.outcome) };
    const kind = plan.kind as FulfilKind;
    const row: Fulfilment = { paymentId: payment.id, userId: payment.userId, planId: plan.id, kind, state: 'done', outcome: {}, createdAt: iso(), appliedAt: null };
    fulfilments.set(payment.id, row);
    if (!payment.userId || payment.productId !== productOfPlan(plan).id) {
      row.state = 'refused';
      row.outcome = { code: payment.userId ? 'product_mismatch' : 'no_buyer' };
      return { ok: false, code: String(row.outcome.code), payment_id: payment.id };
    }
    if (kind === 'credits') {
      if (!world.repo) throw new Error('memory pricing store: no repository for credit grants');
      const ws = await world.repo.ensurePersonalWorkspace(payment.userId, 'My workspace');
      await world.repo.grantCredits({ workspaceId: ws.id, amount: plan.credits!, kind: 'pack', reference: `payment:${payment.id}`, userId: payment.userId });
      row.outcome = { credits: plan.credits, workspace_id: ws.id };
    } else if (kind === 'gift') {
      const id = crypto.randomUUID();
      const terms = plan.gift!;
      gifts.set(id, {
        id, paymentId: payment.id, buyerId: payment.userId, planSlug: plan.slug, grantPlan: 'plan' in terms ? 'plus' : null, grantDays: 'plan' in terms ? terms.days : null,
        grantCredits: 'credits' in terms ? terms.credits : null, codeHash: null, status: 'issued', expiresAt: new Date(now().getTime() + GIFT_VALID_DAYS * 86_400_000).toISOString(),
        redeemedBy: null, redeemedAt: null, redemption: {}, createdAt: iso(),
      });
      row.outcome = { gift_id: id, slug: plan.slug };
    } else if (kind === 'certificate') {
      row.outcome = { ref: `pricing:sitting:${payment.id}`, expires_at: new Date(now().getTime() + SITTING_VALID_DAYS * 86_400_000).toISOString() };
    } else {
      row.outcome = { seats: plan.seats, days: plan.days };
      row.state = 'awaiting_setup';
    }
    if (row.state === 'done') row.appliedAt = iso();
    return { ok: true, replayed: false, payment_id: payment.id, kind, state: row.state, outcome: clone(row.outcome) };
  }
  const pending = (userId?: string) => payments
    .filter((payment) => PAID.has(payment.status) && (!userId || payment.userId === userId) && !fulfilments.has(payment.id) && !!planById(payment.planId) && (FULFILLED_KINDS as readonly string[]).includes(planById(payment.planId)!.kind))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return {
    payments,
    pay({ userId, plan: slug, status = 'paid', id = crypto.randomUUID() }) {
      const plan = AI_PLANS.find((entry) => entry.slug === slug);
      if (!plan) throw new Error(`unknown plan ${slug}`);
      const product = productOfPlan(plan);
      const payment: MemoryPayment = { id, userId, planId: plan.id, productId: product.id, status, createdAt: iso() };
      payments.push(payment);
      // Payment fulfilment (Click → entitlements) grants the product and the bundle's members.
      if (PAID.has(status)) world.grantProducts?.(userId, [product.id, ...(product.bundle ?? [])], plan.days, 'click');
      return payment;
    },
    setOnSale(on) {
      productsOn = on;
      for (const plan of AI_PLANS) sale.set(plan.id, on && plan.channel === 'checkout');
    },
    async catalog() {
      return AI_PLANS.map((plan) => ({
        planId: plan.id, productId: productOfPlan(plan).id, amount: plan.amount, currency: plan.currency, days: plan.days, planActive: sale.get(plan.id) === true,
        productStatus: productsOn && productOfPlan(plan).channel === 'checkout' ? 'active' : 'draft',
      }));
    },
    async sync(userId) {
      const out: FulfilReply[] = [];
      for (const payment of pending(userId).slice(0, 20)) out.push(await fulfil(payment));
      return out;
    },
    async syncDue(limit) {
      let fulfilled = 0, failed = 0;
      for (const payment of pending().slice(0, limit)) {
        try { (await fulfil(payment)).ok ? fulfilled++ : failed++; } catch { failed++; }
      }
      return { fulfilled, failed };
    },
    async fulfilments(userId, limit) { return [...fulfilments.values()].filter((row) => row.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit).map(clone); },
    async gifts(buyerId, limit) { return [...gifts.values()].filter((row) => row.buyerId === buyerId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit).map(clone); },
    async gift(id) { const row = gifts.get(id); return row ? clone(row) : null; },
    async setGiftHash(giftId, hash) {
      const row = gifts.get(giftId);
      if (!row) return false;
      if (!row.codeHash && ![...gifts.values()].some((other) => other.codeHash === hash)) row.codeHash = hash;
      return row.codeHash === hash;
    },
    async redeem(hash, userId, at) {
      const row = [...gifts.values()].find((entry) => entry.codeHash === hash);
      if (!row) return { ok: false, code: 'gift_not_found' };
      if (row.status === 'redeemed') return row.redeemedBy === userId ? { ok: true, replayed: true, gift_id: row.id, redemption: clone(row.redemption) } : { ok: false, code: 'gift_used' };
      if (row.status === 'revoked') return { ok: false, code: 'gift_revoked' };
      if (Date.parse(row.expiresAt) <= at.getTime()) return { ok: false, code: 'gift_expired', expired_at: row.expiresAt };
      if (world.inactiveUsers?.has(userId)) return { ok: false, code: 'account_inactive' };
      // Claimed before any await, so two redemptions in flight cannot both apply.
      row.status = 'redeemed'; row.redeemedBy = userId; row.redeemedAt = at.toISOString();
      if (row.grantCredits) {
        if (!world.repo) throw new Error('memory pricing store: no repository for credit grants');
        const ws = await world.repo.ensurePersonalWorkspace(userId, 'My workspace');
        await world.repo.grantCredits({ workspaceId: ws.id, amount: row.grantCredits, kind: 'pack', reference: `gift:${row.id}`, userId });
        row.redemption = { kind: 'credits', credits: row.grantCredits };
      } else {
        const plus = AI_PRODUCTS.find((product) => product.id === PLAN_PRODUCT_IDS.plus)!;
        world.grantProducts?.(userId, [plus.id, ...(plus.bundle ?? [])], row.grantDays, 'gift');
        row.redemption = { kind: 'plus', days: row.grantDays, ends_at: new Date(at.getTime() + (row.grantDays ?? 0) * 86_400_000).toISOString() };
      }
      return { ok: true, replayed: false, gift_id: row.id, redemption: clone(row.redemption) };
    },
    async teamSetup({ paymentId, userId, name, packs, teamId, now: at }) {
      const row = fulfilments.get(paymentId);
      if (!row || row.kind !== 'coach_team' || row.userId !== userId) return { ok: false, code: 'not_found' };
      if (row.state === 'done') return { ok: true, replayed: true, outcome: clone(row.outcome) };
      if (row.state !== 'awaiting_setup') return { ok: false, code: 'not_found' };
      if (teamId) return { ok: false, code: 'team_not_found' };
      if (!packs?.length || packs.length > 6) return { ok: false, code: 'invalid_packs' };
      if (!name || name.trim().length < 2 || name.trim().length > 80) return { ok: false, code: 'invalid_name' };
      if (!world.coach) throw new Error('memory pricing store: no coach store for teams');
      row.state = 'done';
      const days = Number(row.outcome.days ?? 30), seats = Number(row.outcome.seats ?? 5);
      const team = await world.coach.createTeam({ name: name.trim(), managerId: userId, packs, seats, validUntil: new Date(at.getTime() + days * 86_400_000).toISOString(), source: 'order', createdBy: userId });
      await world.coach.addTeamMember(team.id, userId, 'manager');
      row.outcome = { ...row.outcome, team_id: team.id, valid_until: team.validUntil };
      row.appliedAt = at.toISOString();
      return { ok: true, replayed: false, outcome: clone(row.outcome) };
    },
  };
}

export const pricingStore = defineStore<PricingStore>('pricing', {
  postgres: (db) => createPostgresPricingStore(db),
  // Other areas' tests and plain dev stacks: an empty twin (no payments, nothing on sale).
  memory: ({ now }) => createMemoryPricingStore({ now }),
});

/** Coach pack ids a Coach Team may include. */
export const TEAM_PACKS: readonly string[] = (Object.keys(COACH_PACK_OF) as CoachFeature[]).map((feature) => COACH_PACK_OF[feature]);
