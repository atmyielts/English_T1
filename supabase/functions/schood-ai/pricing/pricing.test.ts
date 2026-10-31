import { AI_PLANS, COACH_PASS_PRODUCT_IDS, PLAN_PRODUCT_IDS, planBySlug, planProductIds } from '../../../../packages/ai-core/src/catalog.ts';
import { coachStore } from '../coach/runtime.ts';
import { equal, fixture, ID, ok, ORIGIN } from '../fixture.test.ts';
import type { MemoryUser } from '../memory-repository.ts';
import { annualOffer, pricingSittings } from '../seams/pricing-engage.ts';
import type { RequestContext } from '../types.ts';
import { codeHash, deriveCode, normaliseCode } from './codes.ts';
import { createMemoryPricingStore, pricingStore } from './store.ts';

// Selling Schood AI end to end, over the real handler and the memory repository, with a
// fake checkout: `twin.pay()` leaves a payment paid and grants the product (and a bundle's
// members) exactly as payment fulfilment does, then the pricing routes do the rest.

const U = {
  buyer: '00000000-0000-4000-8000-0000000005b1', friend: '00000000-0000-4000-8000-0000000005b2', parent: '00000000-0000-4000-8000-0000000005b3',
  child: '00000000-0000-4000-8000-0000000005b4', coachee: '00000000-0000-4000-8000-0000000005b5', manager: '00000000-0000-4000-8000-0000000005b6',
  sitter: '00000000-0000-4000-8000-0000000005b7', other: '00000000-0000-4000-8000-0000000005b8',
};
type Person = keyof typeof U;
const MINUTE = 60_000;

function pricingFixture(options: { launched?: boolean } = {}) {
  const users: Record<string, MemoryUser & { products: string[]; productStarts: Record<string, string> }> = Object.fromEntries((Object.keys(U) as Person[]).map((key) => [`tok-${key}`, { id: U[key], email: `${key}@example.com`, name: key, products: [] as string[], productStarts: {} as Record<string, string> }]));
  const f = fixture({ users, productIds: planProductIds(), launchSwitch: true, settings: options.launched ? { features: { 'pricing.launch': true } } : undefined });
  const byId = new Map(Object.values(users).map((user) => [user.id, user]));
  const twin = createMemoryPricingStore({
    now: f.now,
    world: {
      repo: f.memory.repository,
      grantProducts(userId, productIds) {
        const user = byId.get(userId)!;
        for (const id of productIds) {
          if (!user.products.includes(id)) user.products.push(id);
          user.productStarts[id] ??= f.now().toISOString();
        }
      },
      coach: f.stores.get(coachStore),
    },
  });
  if (options.launched) twin.setOnSale(true);
  f.stores.use(pricingStore, twin);
  const launch = async (on: boolean) => {
    // ai_pricing_launch(): the switch and the catalogue in one decision.
    await f.memory.repository.updateSettings({ features: on ? { 'pricing.launch': true } : {} }, ID.admin);
    twin.setOnSale(on);
    f.advance(MINUTE); // past the plan resolver's and the launch route's short caches
  };
  const chat = (token: string) => f.call('POST', 'core/chat', { token, body: { client_message_id: crypto.randomUUID(), message: 'Salom, yordam bering.' } });
  const me = async (token: string) => (await f.json('GET', 'core/me', { token })).body;
  return { f, twin, users, launch, chat, me };
}

Deno.test('pricing: a visitor sees every plan at the doc\'s prices, none on sale before launch', async () => {
  const { f } = pricingFixture();
  const catalog = await f.json('GET', 'pricing/catalog', { token: null });
  equal(catalog.status, 200);
  equal(catalog.body.launched, false);
  equal(catalog.body.plans.length, AI_PLANS.length);
  ok(catalog.body.plans.every((plan: { on_sale: boolean }) => !plan.on_sale), 'nothing is on sale');
  const price = (slug: string) => catalog.body.plans.find((plan: { slug: string }) => plan.slug === slug).amount;
  equal([price('schood-ai-plus-30'), price('schood-ai-plus-90'), price('schood-ai-plus-365'), price('schood-ai-family-30'), price('schood-ai-family-365')], [49000, 129000, 399000, 89000, 729000]);
  equal([price('schood-ai-teacher-30'), price('schood-ai-teacher-pro-30'), price('schood-ai-centre-30'), price('schood-ai-centre-pro-30')], [99000, 199000, 490000, 1290000]);
  equal([price('schood-coach-sales-pass-30'), price('schood-coach-team-5-30'), price('schood-ai-credits-1000'), price('schood-ai-credits-10000'), price('schood-skill-certificate-sitting')], [29000, 195000, 29000, 149000, 79000]);
  equal([price('schood-ai-centre-teacher-seat-30'), price('schood-ai-centre-students-100-30')], [79000, 59000]);
  equal(catalog.body.plans.filter((plan: { channel: string }) => plan.channel === 'request').map((plan: { slug: string }) => plan.slug).sort(),
    ['schood-ai-centre-30', 'schood-ai-centre-pro-30', 'schood-ai-centre-students-100-30', 'schood-ai-centre-teacher-seat-30'], 'centre plans are requested, not bought');
  // The other apps' "Ask Schood AI" links ask from any origin.
  const link = await f.call('GET', 'pricing/launch', { token: null, origin: 'https://ielts.schood.online' });
  equal([link.status, (await link.json()).launched, link.headers.get('access-control-allow-origin')], [200, false, 'https://ielts.schood.online']);
});

Deno.test('pricing: with the switch off only admins and beta testers have AI, whatever anyone holds', async () => {
  const { f, twin, chat, me } = pricingFixture();
  twin.pay({ userId: U.buyer, plan: 'schood-ai-plus-30' }); // granted by hand before launch
  const view = await me('tok-buyer');
  equal([view.plan.plans, view.plan.features, view.plan.grant, view.plan.launched], [[], [], 0, false]);
  const refused = await chat('tok-buyer');
  equal([refused.status, (await refused.json()).code], [402, 'plan_required']);
  equal((await chat('tok-beta')).status, 200, 'the beta allowlist');
  equal((await chat('tok-admin')).status, 200, 'Schood admins');
  await f.settle();
});

Deno.test('pricing: after launch a free user buys Plus at checkout and uses AI, with all six coaches', async () => {
  const { f, twin, launch, chat, me } = pricingFixture();
  await launch(true);
  const catalog = (await f.json('GET', 'pricing/catalog', { token: null })).body;
  equal(catalog.launched, true);
  const onSale = (slug: string) => catalog.plans.find((plan: { slug: string }) => plan.slug === slug).on_sale;
  equal([onSale('schood-ai-plus-30'), onSale('schood-ai-gift-plus-30'), onSale('schood-ai-centre-30')], [true, true, false], 'self-serve on sale, centres still by request');
  equal((await chat('tok-buyer')).status, 402, 'free users cannot use AI');
  twin.pay({ userId: U.buyer, plan: 'schood-ai-plus-30' });
  f.advance(MINUTE);
  const view = await me('tok-buyer');
  equal(view.plan.plans, ['plus']);
  equal(view.plan.grant, 1500, 'Plus credits, and no extra coach credits on top');
  equal([...view.plan.features].sort(), ['B1', 'B2', 'B3', 'B4', 'B5', 'B6'], 'the bundle\'s coach passes came with it');
  equal((await chat('tok-buyer')).status, 200);
  // Withdrawing the launch withdraws access too.
  await launch(false);
  equal((await chat('tok-buyer')).status, 402);
  await f.settle();
});

Deno.test('pricing: a Plus Family holder\'s child gets Plus', async () => {
  const { f, twin, me } = pricingFixture({ launched: true });
  twin.pay({ userId: U.parent, plan: 'schood-ai-family-30' });
  const invite = await f.json('POST', 'learner/family-invite', { token: 'tok-parent', body: { child_label: 'Aziz', consent: true } });
  equal(invite.status, 200, JSON.stringify(invite.body));
  const accepted = await f.json('POST', 'learner/family-accept', { token: 'tok-child', body: { code: invite.body.invite.code } });
  equal(accepted.status, 200, JSON.stringify(accepted.body));
  const child = await me('tok-child');
  equal(child.plan.plans, ['plus']);
  equal(child.plan.grant, 1500, 'the child\'s own Plus credits');
  equal((await me('tok-parent')).plan.plans, ['family']);
});

Deno.test('pricing: a credit pack grants its credits once, however often and however concurrently it is synced', async () => {
  const { f, twin, me } = pricingFixture({ launched: true });
  twin.pay({ userId: U.buyer, plan: 'schood-ai-plus-30' });
  twin.pay({ userId: U.buyer, plan: 'schood-ai-credits-1000' });
  const replies = await Promise.all(Array.from({ length: 6 }, () => f.json('POST', 'pricing/sync', { token: 'tok-buyer' })));
  equal(replies.map((reply) => reply.status), [200, 200, 200, 200, 200, 200]);
  equal(replies.reduce((sum, reply) => sum + reply.body.arrived.length, 0), 1, 'fulfilled by exactly one of them');
  equal((await me('tok-buyer')).credits.pack, 1000);
  await f.json('POST', 'pricing/sync', { token: 'tok-buyer' });
  await f.json('GET', 'pricing/me', { token: 'tok-buyer' });
  equal((await me('tok-buyer')).credits.pack, 1000, 'still once');
  const ledger = f.memory.ledger.filter((row) => row.reference?.startsWith("payment:"));
  equal(ledger.length, 1, 'one ledger row, referenced by the payment');
  // The scheduled job does the same for people who never came back.
  twin.pay({ userId: U.friend, plan: 'schood-ai-credits-10000' });
  equal(await twin.syncDue(100), { fulfilled: 1, failed: 0 });
  equal(await twin.syncDue(100), { fulfilled: 0, failed: 0 });
});

Deno.test('pricing: a coach pass unlocks one coach, with its credits', async () => {
  const { f, twin, me } = pricingFixture({ launched: true });
  twin.pay({ userId: U.coachee, plan: 'schood-coach-sales-pass-30' });
  f.advance(MINUTE);
  const view = await me('tok-coachee');
  equal([view.plan.plans, view.plan.features], [[], ['B4']]);
  equal(view.plan.grant, 1200, 'the coach\'s fair-use credits');
  equal(view.credits.plan, 1200);
  equal((await f.json('GET', 'core/me', { token: 'tok-coachee' })).body.specialists.find((s: { key: string }) => s.key === 'assistant')?.available ?? false, false, 'a pass is not Plus');
  equal(planBySlug('schood-coach-sales-pass-30')!.product, 'schood-coach-sales-pass');
  ok(view.plan.features.length === 1 && COACH_PASS_PRODUCT_IDS.B4.length === 36, 'one coach');
});

Deno.test('pricing: a gift is bought, shown to the buyer, and redeemed once before it expires', async () => {
  const { f, twin, me } = pricingFixture({ launched: true });
  twin.pay({ userId: U.buyer, plan: 'schood-ai-gift-plus-30' });
  const mine = (await f.json('GET', 'pricing/me', { token: 'tok-buyer' })).body;
  equal(mine.gifts.length, 1);
  const gift = mine.gifts[0];
  equal([gift.kind, gift.days, gift.status], ['plus', 30, 'issued']);
  ok(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/.test(gift.code), 'a readable code');
  equal(gift.link, `https://ai.schood.online/gift#${gift.code}`, 'the code travels in the fragment, never to a server log');
  equal((await f.json('GET', 'pricing/me', { token: 'tok-buyer' })).body.gifts[0].code, gift.code, 'the buyer sees the same code again');
  equal((await me('tok-buyer')).plan.plans, [], 'buying a gift gives the buyer nothing');

  const redeemed = await f.json('POST', 'pricing/gift-redeem', { token: 'tok-friend', body: { code: gift.code.toLowerCase().replace(/-/g, ' ') } });
  equal(redeemed.status, 200, JSON.stringify(redeemed.body));
  equal([redeemed.body.gift.kind, redeemed.body.replayed, redeemed.body.consent_step], ['plus', false, true], 'the age and consent step still applies to the recipient');
  f.advance(MINUTE);
  equal((await me('tok-friend')).plan.plans, ['plus']);
  equal((await f.json('POST', 'pricing/gift-redeem', { token: 'tok-friend', body: { code: gift.code } })).body.replayed, true, 'a second try is a replay');
  const taken = await f.json('POST', 'pricing/gift-redeem', { token: 'tok-other', body: { code: gift.code } });
  equal([taken.status, taken.body.code], [409, 'gift_used']);
  equal((await f.json('GET', 'pricing/me', { token: 'tok-buyer' })).body.gifts[0].status, 'redeemed');
  equal((await f.json('POST', 'pricing/gift-redeem', { token: 'tok-other', body: { code: 'AAAA-BBBB-CCCC-DDDD' } })).status, 404);

  // A credits gift, redeemed by two tabs at once: granted once.
  twin.pay({ userId: U.buyer, plan: 'schood-ai-gift-credits-1000' });
  const credits = (await f.json('GET', 'pricing/me', { token: 'tok-buyer' })).body.gifts.find((entry: { kind: string }) => entry.kind === 'credits');
  const both = await Promise.all([1, 2].map(() => f.json('POST', 'pricing/gift-redeem', { token: 'tok-other', body: { code: credits.code } })));
  equal(both.map((reply) => reply.status), [200, 200]);
  equal((await me('tok-other')).credits.pack, 1000);

  // An expired gift is refused, and its code is no longer shown.
  twin.pay({ userId: U.buyer, plan: 'schood-ai-gift-plus-90' });
  const later = (await f.json('GET', 'pricing/me', { token: 'tok-buyer' })).body.gifts.find((entry: { days: number }) => entry.days === 90);
  f.advance(366 * 86_400_000);
  const expired = await f.json('POST', 'pricing/gift-redeem', { token: 'tok-sitter', body: { code: later.code } });
  equal([expired.status, expired.body.code], [410, 'gift_expired']);
  const listed = (await f.json('GET', 'pricing/me', { token: 'tok-buyer' })).body.gifts.find((entry: { id: string }) => entry.id === later.id);
  equal([listed.status, listed.code], ['expired', null]);
});

Deno.test('pricing: redeeming is limited per person', async () => {
  const { f } = pricingFixture({ launched: true });
  const tries = [];
  for (let i = 0; i < 11; i++) tries.push((await f.json('POST', 'pricing/gift-redeem', { token: 'tok-other', body: { code: 'AAAA-BBBB-CCCC-DDDD' } })).status);
  equal(tries.slice(0, 10).every((status) => status === 404), true);
  equal(tries[10], 429);
});

Deno.test('pricing: gift codes are derived, normalised and hashed the same way every time', async () => {
  const code = await deriveCode('secret-0123456789abcdef0123456789', '6f0e6c38-7b7e-4bd2-9f53-2f3d0a1c9b11');
  equal(code, await deriveCode('secret-0123456789abcdef0123456789', '6f0e6c38-7b7e-4bd2-9f53-2f3d0a1c9b11'));
  ok(code !== await deriveCode('another-secret-0123456789abcdef01', '6f0e6c38-7b7e-4bd2-9f53-2f3d0a1c9b11'), 'secret-bound');
  equal(normaliseCode(code.toLowerCase().replace(/-/g, '')), code);
  equal([normaliseCode('O0O0-1111-2222-3333'), normaliseCode('short'), normaliseCode(42)], [null, null, null]);
  ok(/^[0-9a-f]{64}$/.test(await codeHash(code)), 'sha-256');
});

Deno.test('pricing: a bought certificate sitting unlocks E12', async () => {
  const { f, twin } = pricingFixture({ launched: true });
  const before = (await f.json('GET', 'engage/certificates', { token: 'tok-sitter' })).body;
  equal([before.available.sittings, before.available.for_sale], [0, true]);
  twin.pay({ userId: U.sitter, plan: 'schood-skill-certificate-sitting' });
  const after = (await f.json('GET', 'engage/certificates', { token: 'tok-sitter' })).body;
  equal(after.available.sittings, 1, 'the sitting is there without visiting /pricing first');
  const started = await f.json('POST', 'engage/sitting-start', { token: 'tok-sitter', body: { exam: 'sales_l1', consent: true, display_name: 'Sitter Example' } });
  equal(started.status, 200, JSON.stringify(started.body));
  equal(started.body.sitting.test, false, 'a real sitting, not a beta test');
  equal((await f.json('POST', 'engage/sitting-submit', { token: 'tok-sitter', body: { sitting: started.body.sitting.id } })).status, 200);
  const again = await f.json('POST', 'engage/sitting-start', { token: 'tok-sitter', body: { exam: 'sales_l1', consent: true, display_name: 'Sitter Example' } });
  equal(again.body.code, 'sitting_required', 'one payment is one sitting');
  // The seam itself: one reference per payment.
  const refs = await pricingSittings({ store: (handle: unknown) => f.stores.get(handle as typeof pricingStore) } as unknown as RequestContext, U.sitter);
  equal(refs.length, 1);
  ok(refs[0].ref.startsWith('pricing:sitting:'), 'payment reference');
});

Deno.test('pricing: a Coach Team order is set up once by its buyer and gives its coaches', async () => {
  const { f, twin, me } = pricingFixture({ launched: true });
  const payment = twin.pay({ userId: U.manager, plan: 'schood-coach-team-5-30' });
  const mine = (await f.json('GET', 'pricing/me', { token: 'tok-manager' })).body;
  equal(mine.teams_to_set_up.map((row: { payment_id: string; seats: number }) => [row.payment_id, row.seats]), [[payment.id, 5]]);
  equal((await f.json('POST', 'pricing/team-setup', { token: 'tok-other', body: { payment_id: payment.id, name: 'Not mine', packs: ['sales'] } })).status, 404, 'only the buyer');
  equal((await f.json('POST', 'pricing/team-setup', { token: 'tok-manager', body: { payment_id: payment.id, name: 'Sales floor', packs: ['karate'] } })).status, 400, 'real coaches only');
  const setup = await f.json('POST', 'pricing/team-setup', { token: 'tok-manager', body: { payment_id: payment.id, name: 'Sales floor', packs: ['sales', 'speech'] } });
  equal(setup.status, 200, JSON.stringify(setup.body));
  const teams = await f.stores.get(coachStore).teamsOf(U.manager);
  equal(teams.map(({ team, member }) => [team.name, team.seats, team.source, member.role]), [['Sales floor', 5, 'order', 'manager']]);
  equal((await f.json('POST', 'pricing/team-setup', { token: 'tok-manager', body: { payment_id: payment.id, name: 'Again', packs: ['sales'] } })).body.replayed, true);
  equal((await f.stores.get(coachStore).teamsOf(U.manager)).length, 1, 'one team per order');
  const view = await me('tok-manager');
  equal([...view.plan.features].sort(), ['B4', 'B6'], 'the manager\'s seat gives the team\'s coaches');
  equal((await f.json('GET', 'pricing/me', { token: 'tok-manager' })).body.teams_to_set_up, []);
});

Deno.test('pricing: the annual offer is honest and only shown while it can be bought', async () => {
  const twin = createMemoryPricingStore();
  const ctxFor = (locale: 'en' | 'uz' | 'ru', plans: string[], launched = true) => ({
    locale, plan: () => Promise.resolve({ workspaceKind: 'personal', plans, features: [], beta: false, grant: 0, anchor: null, launched }),
    store: () => twin,
  }) as unknown as RequestContext;
  equal(await annualOffer(ctxFor('en', ['plus']), { userId: U.buyer, moment: 'graduation' }), null, 'not on sale yet');
  twin.setOnSale(true);
  equal(await annualOffer(ctxFor('en', ['plus'], false), { userId: U.buyer, moment: 'graduation' }), null, 'not before launch');
  const offer = await annualOffer(ctxFor('en', ['plus']), { userId: U.buyer, moment: 'graduation' });
  equal(offer, { key: 'schood-ai-plus-365', plan: 'plus', title: 'Plus Annual', terms: '399,000 UZS for a year, paid once. Paying monthly for a year would be 588,000 UZS. Nothing renews automatically.', path: '/pricing?plan=schood-ai-plus-365' });
  equal((await annualOffer(ctxFor('ru', ['family']), { userId: U.buyer, moment: 'goal_done' }))?.terms, '729 000 сум за год, оплата один раз. Помесячно за год вышло бы 1 068 000 сум. Ничего не продлевается автоматически.');
  equal((await annualOffer(ctxFor('uz', ['plus']), { userId: U.buyer, moment: 'graduation' }))?.title, 'Plus yillik');
});

Deno.test('pricing: plan products are the migration\'s deterministic ids', () => {
  equal(planProductIds().plus, PLAN_PRODUCT_IDS.plus);
  equal(planProductIds({ plus: 'ABCDEF00-0000-4000-8000-000000000001' }).plus, 'abcdef00-0000-4000-8000-000000000001', 'a setting still overrides one');
});
