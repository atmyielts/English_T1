import { planBySlug } from '../../../../packages/ai-core/src/catalog.ts';
import { registerOfferSource, registerSittingSource, type OfferSource, type SittingSource } from '../engage/seams.ts';
import { onSale } from '../pricing/routes.ts';
import { pricingStore } from '../pricing/store.ts';
import type { Locale } from '../types.ts';

// Seams between pricing and engage (docs/product/ai-requests/engage.md, "Pricing"):
//   - E12: every paid Skill Certificate sitting is one sitting reference (pricing:sitting:<payment>);
//   - the honest offer at a graduation or a closed goal: the annual plan at the catalogue's
//     real price, with the real comparison to paying monthly, and only while it is on sale.

/** The sittings a person bought, fulfilled first so a purchase shows at once. */
export const pricingSittings: SittingSource = async (ctx, userId) => {
  const store = ctx.store(pricingStore);
  await store.sync(userId).catch(() => []);
  return (await store.fulfilments(userId, 200))
    .filter((row) => row.kind === 'certificate' && row.state === 'done' && typeof row.outcome.ref === 'string')
    .map((row) => ({ ref: String(row.outcome.ref), examKey: null, expiresAt: typeof row.outcome.expires_at === 'string' ? row.outcome.expires_at : null }));
};

const money = (amount: number, locale: Locale) => `${Math.round(amount).toLocaleString('en-US').replace(/,/g, locale === 'en' ? ',' : ' ')} ${locale === 'en' ? 'UZS' : locale === 'uz' ? 'so‘m' : 'сум'}`;
const COPY: Record<Locale, { plus: string; family: string; terms: (price: string, twelve: string) => string }> = {
  en: { plus: 'Plus Annual', family: 'Plus Family Annual', terms: (price, twelve) => `${price} for a year, paid once. Paying monthly for a year would be ${twelve}. Nothing renews automatically.` },
  uz: { plus: 'Plus yillik', family: 'Plus Family yillik', terms: (price, twelve) => `Bir yil uchun ${price}, bir marta to‘lanadi. Bir yil davomida har oy to‘lasangiz, ${twelve} bo‘ladi. Hech narsa avtomatik yangilanmaydi.` },
  ru: { plus: 'Plus на год', family: 'Plus Family на год', terms: (price, twelve) => `${price} за год, оплата один раз. Помесячно за год вышло бы ${twelve}. Ничего не продлевается автоматически.` },
};

export const annualOffer: OfferSource = async (ctx) => {
  const plan = await ctx.plan();
  if (plan.launched === false) return null;
  const family = plan.plans.includes('family');
  const annual = planBySlug(family ? 'schood-ai-family-365' : 'schood-ai-plus-365')!, monthly = planBySlug(family ? 'schood-ai-family-30' : 'schood-ai-plus-30')!;
  const rows = await ctx.store(pricingStore).catalog();
  const annualRow = rows.find((row) => row.planId === annual.id), monthlyRow = rows.find((row) => row.planId === monthly.id);
  // Never an offer for something that cannot be bought right now.
  if (!onSale(annual, annualRow, true) || !annualRow || !monthlyRow) return null;
  const copy = COPY[ctx.locale];
  return {
    key: annual.slug, plan: family ? 'family' : 'plus', title: family ? copy.family : copy.plus,
    terms: copy.terms(money(annualRow.amount, ctx.locale), money(monthlyRow.amount * 12, ctx.locale)),
    path: `/pricing?plan=${annual.slug}`,
  };
};

registerSittingSource(pricingSittings);
registerOfferSource(annualOffer);
