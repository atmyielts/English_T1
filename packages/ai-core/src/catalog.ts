import type { PlanCode } from './plans.ts';

// What Schood AI sells (docs/product/44_SCHOOD_AI.md, "Plans", "Selling the coaches"
// and the lifetime layer's E12 sittings), owned by the pricing phase. The migration
// 20261030500000_schood_ai_pricing.sql seeds exactly these rows, every one inactive
// (products `draft`, plans `is_active = false`) until the owner confirms prices.
//
// Ids are deterministic, like the exam bundles: products md5('schood-product:<slug>')::uuid
// and plans md5('schood-plan:<slug>')::uuid (catalog.test.ts recomputes them). They are
// not RFC 4122 v4 ids, so routes take catalog items by slug, never through `uuid()`.
//
// Prices are UZS from the doc's plans table, all `[ASSUMPTION]` until the owner confirms
// them. The amounts in `public.plans` are the truth at checkout; these are the seed and
// the fallback the app shows when the catalogue cannot be read.
//
// Imported by path (not from mod.ts), so the catalogue stays out of the app's first download.

/** The owner's launch switch: `ai_settings.features['pricing.launch'] = true`. Off until then. */
export const LAUNCH_SWITCH = 'pricing.launch';
/** True only when the switch is set on explicitly (anything else, including the area switch, is off). */
export const isLaunched = (features: Readonly<Record<string, boolean>> | null | undefined): boolean => features?.[LAUNCH_SWITCH] === true;

export type CoachFeature = 'B1' | 'B2' | 'B3' | 'B4' | 'B5' | 'B6';
export const COACH_FEATURES: readonly CoachFeature[] = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6'];
/** Coach pack id (packages/coach-packs) of each coach feature. */
export const COACH_PACK_OF: Record<CoachFeature, string> = { B1: 'ielts', B2: 'speaking', B3: 'maths', B4: 'sales', B5: 'career', B6: 'speech' };

/**
 * How a product reaches people:
 *   checkout  the normal Click → entitlements path, from the /pricing handoff;
 *   request   granted by Schood support (centre plans and add-ons, Enterprise) until tenant checkout is confirmed.
 */
export type SaleChannel = 'checkout' | 'request';
export type SaleKind = 'plan' | 'coach_pass' | 'coach_team' | 'credits' | 'gift' | 'certificate' | 'centre_addon';

export interface CatalogProduct {
  slug: string;
  id: string;
  /** English name for the seed; the app shows translated names. */
  name: string;
  kind: SaleKind;
  channel: SaleChannel;
  /** The Schood AI plan an entitlement to this product puts in force. */
  plan?: PlanCode;
  coach?: CoachFeature;
  /** Hidden from the platform's service list and pricing page (sold from ai.schood.online/pricing). */
  hidden: boolean;
  /** Coach passes a bundle product includes (bundle_product_ids). */
  bundle?: readonly string[];
}

export type GiftTerms = { plan: 'plus'; days: number } | { credits: number };
export interface CatalogPlan {
  slug: string;
  id: string;
  product: string;
  name: string;
  amount: number;
  currency: 'UZS';
  /** Access days for a plan or pass; null for things that are used up (credits, gifts, sittings). */
  days: number | null;
  kind: SaleKind;
  channel: SaleChannel;
  plan?: PlanCode;
  coach?: CoachFeature;
  /** Pack credits a credit-pack purchase grants (they do not expire). */
  credits?: number;
  /** What a gift code gives its recipient. */
  gift?: GiftTerms;
  /** Coach Team seats. */
  seats?: number;
  /** Centre add-on: extra teacher seats or student places. */
  addOn?: { teacherSeats?: number; students?: number };
  order: number;
  recommended?: boolean;
}

const COACH_SLUG: Record<CoachFeature, string> = { B1: 'schood-coach-ielts-pass', B2: 'schood-coach-speaking-pass', B3: 'schood-coach-maths-pass', B4: 'schood-coach-sales-pass', B5: 'schood-coach-career-pass', B6: 'schood-coach-speech-pass' };
const COACH_NAME: Record<CoachFeature, string> = { B1: 'IELTS Coach pass', B2: 'English Speaking Partner pass', B3: 'Admission Maths Coach pass', B4: 'Sales Coach pass', B5: 'Career and Interview Coach pass', B6: 'Public Speaking Coach pass' };
const COACH_PRODUCT_ID: Record<CoachFeature, string> = {
  B1: '59dc1644-a8e9-a645-7558-16377b620831', B2: '06bd4c0f-47ef-b1b5-aab2-8495476d1d33', B3: '98db3507-130c-dae3-0a1a-e60015e06e5a',
  B4: '28fbb0ca-11fa-f783-0865-688777df8101', B5: 'b6d66e13-a677-271b-7c75-74f44d693049', B6: '37ea8a8c-1b3e-131e-7f15-30a74965971c',
};
const COACH_PLAN_ID: Record<CoachFeature, string> = {
  B1: 'bc706b7a-0a97-190e-c1fe-20ff94b1594b', B2: 'cbcfdc88-917c-b25c-3338-8bd9a743348d', B3: '05569873-faed-b9df-af47-b51e4c49e879',
  B4: '8356bbde-9f6a-8f83-2684-5bf6c3ee8bae', B5: 'c03b19d9-ae33-8c80-097b-14cbde057c8e', B6: '93d6a666-fd2b-77c1-320a-0c657fde5c50',
};
/** Coach feature → its single-coach pass product (replaces SCHOOD_AI_COACH_PASS_PRODUCT_IDS). */
export const COACH_PASS_PRODUCT_IDS: Readonly<Record<CoachFeature, string>> = COACH_PRODUCT_ID;
const ALL_COACH_PASSES = COACH_FEATURES.map((feature) => COACH_PRODUCT_ID[feature]);

/** Schood AI plan → its product (replaces the SCHOOD_AI_*_PRODUCT_ID settings). Enterprise is a contract on the workspace. */
export const PLAN_PRODUCT_IDS: Readonly<Record<Exclude<PlanCode, 'enterprise'>, string>> = {
  plus: '6b7cb4f9-c615-1976-3183-2f6d030f6e1c',
  family: 'e1912fa6-664b-8af4-ff8d-717144e78eea',
  teacher: '5e391be4-b2ba-cc45-de7b-b9fe01ac4794',
  teacher_pro: '60bb911e-2ff9-7d07-b0a4-87609375ca3a',
  centre: '1dcca300-b9ac-cfaa-f18b-25ce856a4e11',
  centre_pro: 'd9425eaf-5d80-2827-d562-f649bc360faa',
};

export const AI_PRODUCTS: readonly CatalogProduct[] = [
  // The one Schood AI card in the platform's service list: everything else is sold from ai.schood.online/pricing.
  { slug: 'schood-ai-plus', id: PLAN_PRODUCT_IDS.plus, name: 'Schood AI Plus', kind: 'plan', channel: 'checkout', plan: 'plus', hidden: false, bundle: ALL_COACH_PASSES },
  { slug: 'schood-ai-family', id: PLAN_PRODUCT_IDS.family, name: 'Schood AI Plus Family', kind: 'plan', channel: 'checkout', plan: 'family', hidden: true, bundle: ALL_COACH_PASSES },
  { slug: 'schood-ai-teacher', id: PLAN_PRODUCT_IDS.teacher, name: 'Schood AI Teacher', kind: 'plan', channel: 'checkout', plan: 'teacher', hidden: true },
  { slug: 'schood-ai-teacher-pro', id: PLAN_PRODUCT_IDS.teacher_pro, name: 'Schood AI Teacher Pro', kind: 'plan', channel: 'checkout', plan: 'teacher_pro', hidden: true },
  { slug: 'schood-ai-centre', id: PLAN_PRODUCT_IDS.centre, name: 'Schood AI Centre', kind: 'plan', channel: 'request', plan: 'centre', hidden: true },
  { slug: 'schood-ai-centre-pro', id: PLAN_PRODUCT_IDS.centre_pro, name: 'Schood AI Centre Pro', kind: 'plan', channel: 'request', plan: 'centre_pro', hidden: true },
  ...COACH_FEATURES.map((coach): CatalogProduct => ({ slug: COACH_SLUG[coach], id: COACH_PRODUCT_ID[coach], name: COACH_NAME[coach], kind: 'coach_pass', channel: 'checkout', coach, hidden: true })),
  { slug: 'schood-coach-team', id: '89b9ccde-2c5a-f949-384e-588d3dc7b1b4', name: 'Schood Coach Team', kind: 'coach_team', channel: 'checkout', hidden: true },
  { slug: 'schood-ai-credits', id: 'fbab4318-8490-f802-80ef-97725a882790', name: 'Schood AI credits', kind: 'credits', channel: 'checkout', hidden: true },
  { slug: 'schood-ai-gift', id: '93036732-4b2b-2426-f625-e94c6dcce125', name: 'Schood AI gift', kind: 'gift', channel: 'checkout', hidden: true },
  { slug: 'schood-skill-certificate', id: '1dae30b1-efbf-5ac2-ae9d-dbcbee6fa039', name: 'Schood Skill Certificate exam', kind: 'certificate', channel: 'checkout', hidden: true },
  { slug: 'schood-ai-centre-addons', id: '2bb3f245-a3f9-323d-553c-3eb9bedac73c', name: 'Schood AI Centre add-ons', kind: 'centre_addon', channel: 'request', hidden: true },
];

const P = (slug: string) => AI_PRODUCTS.find((product) => product.slug === slug)!;
export const AI_PLANS: readonly CatalogPlan[] = [
  { slug: 'schood-ai-plus-30', id: 'd76db31b-3090-266d-2d8c-2127ce5ea6ae', product: 'schood-ai-plus', name: 'Schood AI Plus', amount: 49000, currency: 'UZS', days: 30, kind: 'plan', channel: 'checkout', plan: 'plus', order: 1 },
  { slug: 'schood-ai-plus-90', id: 'ae5a8323-4c92-f59b-8ca4-a30a2ccf222d', product: 'schood-ai-plus', name: 'Schood AI Plus (3 months)', amount: 129000, currency: 'UZS', days: 90, kind: 'plan', channel: 'checkout', plan: 'plus', order: 2 },
  { slug: 'schood-ai-plus-365', id: 'e5682f07-759a-099c-9b35-d424bd7af1b3', product: 'schood-ai-plus', name: 'Schood AI Plus Annual', amount: 399000, currency: 'UZS', days: 365, kind: 'plan', channel: 'checkout', plan: 'plus', order: 3, recommended: true },
  { slug: 'schood-ai-family-30', id: '560c7e50-6786-f6d4-4390-67dd01bed922', product: 'schood-ai-family', name: 'Schood AI Plus Family', amount: 89000, currency: 'UZS', days: 30, kind: 'plan', channel: 'checkout', plan: 'family', order: 1 },
  { slug: 'schood-ai-family-365', id: '3ea5156f-8de5-802e-9b6e-7ea20be5aa46', product: 'schood-ai-family', name: 'Schood AI Plus Family Annual', amount: 729000, currency: 'UZS', days: 365, kind: 'plan', channel: 'checkout', plan: 'family', order: 2, recommended: true },
  { slug: 'schood-ai-teacher-30', id: '8edb46d4-556d-fd93-4de4-d6fbc4e61eb5', product: 'schood-ai-teacher', name: 'Schood AI Teacher', amount: 99000, currency: 'UZS', days: 30, kind: 'plan', channel: 'checkout', plan: 'teacher', order: 1 },
  { slug: 'schood-ai-teacher-pro-30', id: '5f1863c8-a94d-9dac-7c97-30c71ab1e653', product: 'schood-ai-teacher-pro', name: 'Schood AI Teacher Pro', amount: 199000, currency: 'UZS', days: 30, kind: 'plan', channel: 'checkout', plan: 'teacher_pro', order: 1 },
  { slug: 'schood-ai-centre-30', id: '6ac0f806-6c35-14f1-9e66-5bdf1b5eae65', product: 'schood-ai-centre', name: 'Schood AI Centre', amount: 490000, currency: 'UZS', days: 30, kind: 'plan', channel: 'request', plan: 'centre', order: 1 },
  { slug: 'schood-ai-centre-pro-30', id: 'e53ff9c2-e8c8-c9a5-97a6-f8364c292243', product: 'schood-ai-centre-pro', name: 'Schood AI Centre Pro', amount: 1290000, currency: 'UZS', days: 30, kind: 'plan', channel: 'request', plan: 'centre_pro', order: 1 },
  ...COACH_FEATURES.map((coach): CatalogPlan => ({ slug: `${COACH_SLUG[coach]}-30`, id: COACH_PLAN_ID[coach], product: COACH_SLUG[coach], name: COACH_NAME[coach], amount: 29000, currency: 'UZS', days: 30, kind: 'coach_pass', channel: 'checkout', coach, order: 1 })),
  // 39,000 per seat / 30 days, at least 5 seats. Sold in fixed team sizes because the
  // checkout buys one plan at a time; the sizes are `[ASSUMPTION]`, the amounts are seats × 39,000.
  { slug: 'schood-coach-team-5-30', id: '8bb447ba-d36c-12e5-6f42-6e8cf645e8d6', product: 'schood-coach-team', name: 'Schood Coach Team, 5 seats', amount: 195000, currency: 'UZS', days: 30, kind: 'coach_team', channel: 'checkout', seats: 5, order: 1 },
  { slug: 'schood-coach-team-10-30', id: 'accb72e3-ddda-227a-5a64-5f3e4e116c56', product: 'schood-coach-team', name: 'Schood Coach Team, 10 seats', amount: 390000, currency: 'UZS', days: 30, kind: 'coach_team', channel: 'checkout', seats: 10, order: 2 },
  { slug: 'schood-coach-team-20-30', id: '25e4b770-fdbd-d019-720c-4081bbf77b8c', product: 'schood-coach-team', name: 'Schood Coach Team, 20 seats', amount: 780000, currency: 'UZS', days: 30, kind: 'coach_team', channel: 'checkout', seats: 20, order: 3 },
  { slug: 'schood-ai-credits-1000', id: '41c96ab9-313f-ef6e-282a-842b34ace296', product: 'schood-ai-credits', name: '1,000 Schood AI credits', amount: 29000, currency: 'UZS', days: null, kind: 'credits', channel: 'checkout', credits: 1000, order: 1 },
  { slug: 'schood-ai-credits-10000', id: '2656d033-0488-21b3-db2b-a5fce52d5cb6', product: 'schood-ai-credits', name: '10,000 Schood AI credits', amount: 149000, currency: 'UZS', days: null, kind: 'credits', channel: 'checkout', credits: 10000, order: 2 },
  // L18 gifts: the same prices as buying for yourself.
  { slug: 'schood-ai-gift-plus-30', id: 'd3326087-8a9f-6df9-02bd-a38e8dd4a595', product: 'schood-ai-gift', name: 'Gift: Schood AI Plus, 30 days', amount: 49000, currency: 'UZS', days: null, kind: 'gift', channel: 'checkout', gift: { plan: 'plus', days: 30 }, order: 1 },
  { slug: 'schood-ai-gift-plus-90', id: '8c08c20b-8491-b3eb-7c12-92b5a5102bfa', product: 'schood-ai-gift', name: 'Gift: Schood AI Plus, 3 months', amount: 129000, currency: 'UZS', days: null, kind: 'gift', channel: 'checkout', gift: { plan: 'plus', days: 90 }, order: 2 },
  { slug: 'schood-ai-gift-plus-365', id: 'f5080d90-2dec-8aa4-d91a-d56d0f2f1f1e', product: 'schood-ai-gift', name: 'Gift: Schood AI Plus, 1 year', amount: 399000, currency: 'UZS', days: null, kind: 'gift', channel: 'checkout', gift: { plan: 'plus', days: 365 }, order: 3 },
  { slug: 'schood-ai-gift-credits-1000', id: '44669e44-b94b-82fc-ced1-7d0035a024e4', product: 'schood-ai-gift', name: 'Gift: 1,000 Schood AI credits', amount: 29000, currency: 'UZS', days: null, kind: 'gift', channel: 'checkout', gift: { credits: 1000 }, order: 4 },
  { slug: 'schood-ai-gift-credits-10000', id: '18c4342d-dd28-6532-e4ad-2b6c8b680a0a', product: 'schood-ai-gift', name: 'Gift: 10,000 Schood AI credits', amount: 149000, currency: 'UZS', days: null, kind: 'gift', channel: 'checkout', gift: { credits: 10000 }, order: 5 },
  { slug: 'schood-skill-certificate-sitting', id: '16ff068b-d276-e606-2392-0ea7ea7a2729', product: 'schood-skill-certificate', name: 'Skill Certificate exam, one sitting', amount: 79000, currency: 'UZS', days: null, kind: 'certificate', channel: 'checkout', order: 1 },
  { slug: 'schood-ai-centre-teacher-seat-30', id: '9b0ec384-15d4-268a-c589-9056d1eb71a5', product: 'schood-ai-centre-addons', name: 'Extra teacher seat', amount: 79000, currency: 'UZS', days: 30, kind: 'centre_addon', channel: 'request', addOn: { teacherSeats: 1 }, order: 1 },
  { slug: 'schood-ai-centre-students-100-30', id: 'e53111b3-5290-e719-2e46-5a18d326a2ed', product: 'schood-ai-centre-addons', name: '100 more students', amount: 59000, currency: 'UZS', days: 30, kind: 'centre_addon', channel: 'request', addOn: { students: 100 }, order: 2 },
];

export const productBySlug = (slug: string): CatalogProduct | null => AI_PRODUCTS.find((product) => product.slug === slug) ?? null;
export const productById = (id: string): CatalogProduct | null => AI_PRODUCTS.find((product) => product.id === id.toLowerCase()) ?? null;
export const planBySlug = (slug: string): CatalogPlan | null => AI_PLANS.find((plan) => plan.slug === slug) ?? null;
export const planById = (id: string): CatalogPlan | null => AI_PLANS.find((plan) => plan.id === id.toLowerCase()) ?? null;
export const productOfPlan = (plan: CatalogPlan): CatalogProduct => P(plan.product);
/** Plans a purchase of which Schood AI fulfils itself after payment (credits, gift codes, sittings, team seats). */
export const FULFILLED_KINDS: readonly SaleKind[] = ['credits', 'gift', 'certificate', 'coach_team'];
/** Days a gift code can be redeemed after it is bought `[ASSUMPTION]`. */
export const GIFT_VALID_DAYS = 365;
/** Days a bought certificate sitting stays available `[ASSUMPTION]`. */
export const SITTING_VALID_DAYS = 365;

/** The plan-product map with optional overrides (an env id, for a product made by hand). */
export function planProductIds(overrides: Partial<Record<PlanCode, string | undefined>> = {}): Partial<Record<PlanCode, string>> {
  const out: Partial<Record<PlanCode, string>> = { ...PLAN_PRODUCT_IDS };
  for (const [plan, id] of Object.entries(overrides)) if (id) out[plan as PlanCode] = id.toLowerCase();
  return out;
}
