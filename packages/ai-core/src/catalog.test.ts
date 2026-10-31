import { AI_PLANS, AI_PRODUCTS, COACH_FEATURES, COACH_PASS_PRODUCT_IDS, FULFILLED_KINDS, isLaunched, LAUNCH_SWITCH, PLAN_PRODUCT_IDS, planById, planBySlug, planProductIds, productById, productOfPlan } from './catalog.ts';
import { FEATURES, PLAN_CODES } from './plans.ts';

// The catalogue the pricing migration seeds (20261030500000_schood_ai_pricing.sql, whose
// integration test checks the same numbers in the database).

const equal = (actual: unknown, expected: unknown, label = '') => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
const ok = (value: unknown, label: string) => { if (!value) throw new Error(label); };
// MD5 (RFC 1321), inline: this job runs without node_modules, and Web Crypto has no MD5.
function md5(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const words = new Uint32Array(((bytes.length + 8) >> 6) + 1 << 4);
  bytes.forEach((byte, i) => { words[i >> 2] |= byte << ((i % 4) * 8); });
  words[bytes.length >> 2] |= 0x80 << ((bytes.length % 4) * 8);
  words[words.length - 2] = bytes.length * 8;
  const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);
  const R = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
  let [a0, b0, c0, d0] = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476];
  for (let block = 0; block < words.length; block += 16) {
    let [a, b, c, d] = [a0, b0, c0, d0];
    for (let i = 0; i < 64; i++) {
      const round = i >> 4;
      const f = round === 0 ? (b & c) | (~b & d) : round === 1 ? (d & b) | (~d & c) : round === 2 ? b ^ c ^ d : c ^ (b | ~d);
      const g = round === 0 ? i : round === 1 ? (5 * i + 1) % 16 : round === 2 ? (3 * i + 5) % 16 : (7 * i) % 16;
      const shift = R[round * 4 + (i % 4)];
      const sum = (a + f + K[i] + words[block + g]) >>> 0;
      [a, d, c] = [d, c, b];
      b = (b + ((sum << shift) | (sum >>> (32 - shift)))) >>> 0;
    }
    [a0, b0, c0, d0] = [(a0 + a) >>> 0, (b0 + b) >>> 0, (c0 + c) >>> 0, (d0 + d) >>> 0];
  }
  return [a0, b0, c0, d0].map((word) => [0, 8, 16, 24].map((bit) => ((word >>> bit) & 0xff).toString(16).padStart(2, '0')).join('')).join('');
}
/** Postgres md5(text)::uuid. */
const md5uuid = (text: string) => {
  const hex = md5(text);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

Deno.test('catalog: ids are md5(schood-product|plan:<slug>)::uuid and unique', () => {
  for (const product of AI_PRODUCTS) equal(product.id, md5uuid(`schood-product:${product.slug}`), product.slug);
  for (const plan of AI_PLANS) equal(plan.id, md5uuid(`schood-plan:${plan.slug}`), plan.slug);
  equal(new Set(AI_PRODUCTS.map((product) => product.id)).size, AI_PRODUCTS.length);
  equal(new Set(AI_PLANS.map((plan) => plan.id)).size, AI_PLANS.length);
  equal([AI_PRODUCTS.length, AI_PLANS.length], [17, 28]);
  for (const plan of AI_PLANS) ok(productOfPlan(plan), `${plan.slug} has a product`);
});

Deno.test('catalog: the doc\'s prices in UZS', () => {
  const price = (slug: string) => [planBySlug(slug)!.amount, planBySlug(slug)!.days];
  equal(price('schood-ai-plus-30'), [49000, 30]);
  equal(price('schood-ai-plus-90'), [129000, 90]);
  equal(price('schood-ai-plus-365'), [399000, 365]);
  equal(price('schood-ai-family-30'), [89000, 30]);
  equal(price('schood-ai-family-365'), [729000, 365]);
  equal(price('schood-ai-teacher-30'), [99000, 30]);
  equal(price('schood-ai-teacher-pro-30'), [199000, 30]);
  equal(price('schood-ai-centre-30'), [490000, 30]);
  equal(price('schood-ai-centre-pro-30'), [1290000, 30]);
  for (const coach of COACH_FEATURES) equal(AI_PLANS.filter((plan) => plan.coach === coach).map((plan) => [plan.amount, plan.days]), [[29000, 30]], coach);
  for (const plan of AI_PLANS.filter((entry) => entry.kind === 'coach_team')) equal(plan.amount, plan.seats! * 39000, `${plan.slug} is seats x 39,000`);
  ok(AI_PLANS.filter((plan) => plan.kind === 'coach_team').every((plan) => plan.seats! >= 5), 'at least 5 seats');
  equal(price('schood-ai-credits-1000'), [29000, null]);
  equal(price('schood-ai-credits-10000'), [149000, null]);
  equal([planBySlug('schood-ai-credits-1000')!.credits, planBySlug('schood-ai-credits-10000')!.credits], [1000, 10000]);
  equal(price('schood-skill-certificate-sitting'), [79000, null]);
  equal(price('schood-ai-centre-teacher-seat-30'), [79000, 30]);
  equal(price('schood-ai-centre-students-100-30'), [59000, 30]);
  ok(AI_PLANS.every((plan) => plan.currency === 'UZS'), 'UZS');
  // Gifts cost what buying for yourself costs.
  equal(planBySlug('schood-ai-gift-plus-30')!.amount, planBySlug('schood-ai-plus-30')!.amount);
  equal(planBySlug('schood-ai-gift-plus-90')!.amount, planBySlug('schood-ai-plus-90')!.amount);
  equal(planBySlug('schood-ai-gift-plus-365')!.amount, planBySlug('schood-ai-plus-365')!.amount);
  equal(planBySlug('schood-ai-gift-credits-1000')!.amount, planBySlug('schood-ai-credits-1000')!.amount);
  equal(planBySlug('schood-ai-gift-credits-10000')!.amount, planBySlug('schood-ai-credits-10000')!.amount);
});

Deno.test('catalog: plans, coaches and channels line up with the plan matrix', () => {
  // Every personal and centre plan has a product; Enterprise is a contract.
  equal(Object.keys(PLAN_PRODUCT_IDS).sort(), PLAN_CODES.filter((plan) => plan !== 'enterprise').sort());
  for (const [plan, id] of Object.entries(PLAN_PRODUCT_IDS)) equal(productById(id)?.plan, plan);
  for (const coach of COACH_FEATURES) { ok(FEATURES[coach], `${coach} is a feature`); equal(productById(COACH_PASS_PRODUCT_IDS[coach])?.coach, coach); }
  // Plus and Plus Family include the six coach passes.
  for (const slug of ['schood-ai-plus', 'schood-ai-family']) equal([...(AI_PRODUCTS.find((product) => product.slug === slug)!.bundle ?? [])].sort(), Object.values(COACH_PASS_PRODUCT_IDS).sort(), slug);
  // Centre plans and add-ons are granted by support; everything else sells at checkout.
  equal(AI_PLANS.filter((plan) => plan.channel === 'request').map((plan) => plan.kind).sort(), ['centre_addon', 'centre_addon', 'plan', 'plan']);
  ok(AI_PLANS.filter((plan) => plan.channel === 'request').every((plan) => plan.plan === undefined || plan.plan === 'centre' || plan.plan === 'centre_pro'), 'only centre plans by request');
  // Only the Plus product shows in the platform's service list.
  equal(AI_PRODUCTS.filter((product) => !product.hidden).map((product) => product.slug), ['schood-ai-plus']);
  ok(AI_PLANS.filter((plan) => (FULFILLED_KINDS as readonly string[]).includes(plan.kind)).every((plan) => plan.days === null || plan.kind === 'coach_team'), 'used-up purchases have no access days');
  equal(planById(planBySlug('schood-ai-plus-30')!.id.toUpperCase())?.slug, 'schood-ai-plus-30');
});

Deno.test('catalog: the launch switch is one explicit key; overrides replace one product id', () => {
  equal(LAUNCH_SWITCH, 'pricing.launch');
  equal([isLaunched(undefined), isLaunched({}), isLaunched({ pricing: true }), isLaunched({ 'pricing.launch': false }), isLaunched({ 'pricing.launch': true })], [false, false, false, false, true]);
  equal(planProductIds({ family: undefined }).family, PLAN_PRODUCT_IDS.family);
  equal(planProductIds({ teacher: 'AAAAAAAA-0000-4000-8000-000000000003' }).teacher, 'aaaaaaaa-0000-4000-8000-000000000003');
});
