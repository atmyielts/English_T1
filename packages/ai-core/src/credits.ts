import { FEATURES } from './plans.ts';
import type { Capability } from './models.ts';

// The credit price table (docs/product/44_SCHOOD_AI.md, "Credits"). One credit is
// about one tutor reply. The app shows `quoteCredits` before every action and the
// function charges exactly that; a cost sent by a client is never used.
// All prices are `[ASSUMPTION]` until the owner confirms them.

export type ModelTier = 'standard' | 'vision' | 'premium';
export interface CreditPrice {
  /** Feature id in the plan matrix (`FEATURES`). */
  feature: string;
  credits: number;
  /** Default model route when no route names this key (see models.ts `routeKeysFor`). */
  tier: ModelTier;
  /** Capabilities every call for this key needs, whatever the route. */
  requires?: readonly Capability[];
  /** Keys that may be added on top of this one in a single quote (for example three-level variants). */
  addOns?: readonly string[];
  /** Priced here although the doc's table has no row for it; reuses the closest row. */
  assumed?: true;
}

const price = (feature: string, credits: number, tier: ModelTier = 'standard', extra: Partial<CreditPrice> = {}): CreditPrice => ({ feature, credits, tier, ...extra });

export const CREDIT_PRICES = {
  // Replies: tutor or assistant (L1, C2, T7, P2, C8, C13) and the core assistant.
  'assistant.reply': price('CORE', 1),
  'tutor.reply': price('L1', 1),
  'student_assistant.reply': price('C2', 1),
  'teacher_assistant.reply': price('T7', 1),
  'parent.ask': price('P2', 1),
  'admissions.reply': price('C8', 1),
  'knowledge.answer': price('C13', 1),
  'homework.hint': price('L7', 1, 'standard', { assumed: true }),
  'office.draft': price('C3', 1, 'standard', { assumed: true }),
  // Learners.
  'explain.mistake': price('L2', 2),
  'writing.feedback': price('L3', 5, 'premium'),
  'writing.ladder': price('L11', 8, 'premium'),
  'speaking.turn': price('L4', 1),
  'interview.turn': price('L12', 1),
  'speaking.mock_report': price('L4', 10, 'premium'),
  'interview.report': price('L12', 10, 'premium'),
  'pronunciation.drill': price('L13', 1),
  'daily.brief': price('L14', 2),
  'study_plan.build': price('L5', 3),
  'gap.replan': price('L15', 3),
  'words.from_text': price('L6', 2),
  'reading.graded': price('L10', 3),
  'photo.explain': price('L9', 3, 'vision', { requires: ['vision'] }),
  'essay.review': price('L8', 8, 'premium'),
  'abroad.plan': price('L16', 5),
  'duel.quiz': price('L17', 2, 'standard', { assumed: true }),
  // Parents.
  'parent.brief': price('P1', 1),
  // Teachers.
  'material.generate': price('T1', 10, 'standard', { addOns: ['material.differentiate'] }),
  'textbook.lesson': price('T9', 10, 'vision', { requires: ['vision'], addOns: ['material.differentiate'] }),
  'material.exam_set': price('T1', 15, 'premium', { addOns: ['material.differentiate'] }),
  'material.differentiate': price('T1', 10),
  'quiz.pack': price('T10', 15),
  'marking.script': price('T3', 4, 'premium'),
  'speaking.marking': price('T14', 4, 'premium'),
  'writing.signal': price('T15', 1),
  'lesson.plan': price('T5', 5),
  'course.outline': price('T5', 10),
  'feedback.comment': price('T4', 1),
  'channel.post': price('T11', 3),
  'brand.post': price('T13', 3),
  // Centres.
  'parent.message': price('T8', 1),
  'placement.generate': price('C5', 15, 'premium'),
  'marketing.post': price('C4', 3),
  'owner.brief': price('C10', 10),
  'winback.message': price('C11', 1, 'standard', { assumed: true }),
  'curriculum.unit': price('C12', 20, 'premium'),
  'observation.feedback': price('C16', 5, 'standard', { assumed: true }),
  // Lifetime engagement. A story episode written inside an authored arc is priced like a
  // graded reading (L10). A streak freeze bought by an adult is not a model call; it is a
  // credit spend the engage area charges directly, and the pricing phase owns its number.
  'story.episode': price('E8', 3, 'standard', { assumed: true }),
  'streak.freeze': price('E5', 10, 'standard', { assumed: true }),
} satisfies Record<string, CreditPrice>;

export type CreditKey = keyof typeof CREDIT_PRICES;
const PRICES: Record<string, CreditPrice> = CREDIT_PRICES;

export const CREDIT_KEY_PATTERN = /^[a-z][a-z0-9_]{1,30}\.[a-z][a-z0-9_]{1,30}$/;
export const isCreditKey = (value: unknown): value is CreditKey => typeof value === 'string' && Object.hasOwn(PRICES, value);
export const creditPrice = (key: CreditKey): CreditPrice => PRICES[key];

export interface CreditQuote { key: CreditKey; feature: string; credits: number; addOns: CreditKey[]; tier: ModelTier; requires: Capability[] }

/** The exact cost of an action and its add-ons. Throws on an unknown key or an add-on the key does not allow. */
export function quoteCredits(key: string, addOns: readonly string[] = []): CreditQuote {
  if (!isCreditKey(key)) throw new Error(`unknown_credit_key: ${key}`);
  const base = PRICES[key];
  const unique = [...new Set(addOns)];
  for (const addOn of unique) if (!base.addOns?.includes(addOn) || !isCreditKey(addOn)) throw new Error(`invalid_add_on: ${addOn}`);
  const credits = base.credits + unique.reduce((sum, addOn) => sum + PRICES[addOn].credits, 0);
  return { key, feature: base.feature, credits, addOns: unique as CreditKey[], tier: base.tier, requires: [...(base.requires ?? [])] };
}

/** Every price must point at a feature in the plan matrix; checked by tests and at function start. */
export function priceTableProblems(): string[] {
  const problems: string[] = [];
  for (const [key, entry] of Object.entries(PRICES)) {
    if (!CREDIT_KEY_PATTERN.test(key)) problems.push(`${key}: bad key`);
    if (!FEATURES[entry.feature]) problems.push(`${key}: unknown feature ${entry.feature}`);
    if (!Number.isInteger(entry.credits) || entry.credits < 1 || entry.credits > 1000) problems.push(`${key}: bad credits`);
    for (const addOn of entry.addOns ?? []) if (!Object.hasOwn(PRICES, addOn)) problems.push(`${key}: unknown add-on ${addOn}`);
  }
  return problems;
}
