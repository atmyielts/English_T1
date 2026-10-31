import { api } from '../core/index.ts';
import type { CoachFeature, GiftTerms, SaleChannel, SaleKind } from '../../../../packages/ai-core/src/catalog.ts';

// The pricing routes (supabase/functions/schood-ai/pricing/routes.ts) and the handoff to
// the platform's own checkout (schood.online/checkout). Nothing here takes money.

export interface CatalogPlanView {
  slug: string; id: string; product: string; product_id: string; kind: SaleKind; channel: SaleChannel;
  plan: string | null; coach: CoachFeature | null; pack: string | null; amount: number; currency: string; days: number | null;
  monthly_credits: number | null; credits: number | null; gift: GiftTerms | null; seats: number | null;
  add_on: { teacherSeats?: number; students?: number } | null; order: number; recommended: boolean; on_sale: boolean;
}
export interface CatalogView { launched: boolean; plans: CatalogPlanView[]; gift_valid_days: number; sitting_valid_days: number }
export interface GiftView {
  id: string; plan: string; kind: 'plus' | 'credits'; days: number | null; credits: number | null; status: 'issued' | 'redeemed' | 'revoked' | 'expired';
  expires_at: string; redeemed_at: string | null; bought_at: string; code: string | null; link: string | null;
}
export interface PurchaseView { payment_id: string; plan: string | null; kind: 'credits' | 'gift' | 'certificate' | 'coach_team'; state: 'done' | 'awaiting_setup'; credits: number | null; seats: number | null; team_id: string | null; created_at: string }
export interface MineView {
  launched: boolean;
  plan: { plans: string[]; features: string[]; beta: boolean; grant: number };
  arrived: { payment_id: string; kind: PurchaseView['kind']; state: PurchaseView['state'] }[];
  purchases: PurchaseView[];
  gifts: GiftView[];
  gift_codes_available: boolean;
  teams_to_set_up: PurchaseView[];
}
export interface RedeemView { gift: { kind: 'plus' | 'credits'; days?: number; credits?: number; ends_at?: string | null }; replayed: boolean; consent_step: boolean }

export const getCatalog = () => api<CatalogView>('pricing/catalog', { anonymous: true });
export const getMine = () => api<MineView>('pricing/me');
export const syncMine = () => api<MineView>('pricing/sync', { method: 'POST' });
export const redeemGift = (code: string) => api<RedeemView>('pricing/gift-redeem', { method: 'POST', body: { code } });
export const setUpTeam = (body: { payment_id: string; name?: string; packs?: string[]; team_id?: string }) =>
  api<{ team: Record<string, unknown>; replayed: boolean }>('pricing/team-setup', { method: 'POST', body });

const PLATFORM = String(import.meta.env.VITE_PLATFORM_URL || 'https://schood.online').replace(/\/+$/, '');
/** The platform's checkout for one plan; it returns here, where the purchase is fulfilled. */
export function checkoutUrl(plan: Pick<CatalogPlanView, 'id' | 'product_id' | 'slug'>): string {
  const returnTo = `${location.origin}/pricing/done?plan=${encodeURIComponent(plan.slug)}`;
  return `${PLATFORM}/checkout?${new URLSearchParams({ plan_id: plan.id, product_id: plan.product_id, returnTo })}`;
}
/** Schood support (the platform's contact page): centre plans and add-ons are granted by hand. */
export const CONTACT_URL = `${PLATFORM}/contact`;

/** 1,500 in English, 1 500 in Uzbek and Russian. */
export const count = (value: number, locale: string): string => {
  const digits = Math.round(value).toLocaleString('en-US');
  return locale === 'en' ? digits : digits.replace(/,/g, ' ');
};
/** 49,000 UZS / 49 000 so‘m / 49 000 сум, the same way on every screen. */
export function money(amount: number, locale: string): string {
  const digits = Math.round(amount).toLocaleString('en-US');
  if (locale === 'uz') return `${digits.replace(/,/g, ' ')} so‘m`;
  if (locale === 'ru') return `${digits.replace(/,/g, ' ')} сум`;
  return `${digits} UZS`;
}
