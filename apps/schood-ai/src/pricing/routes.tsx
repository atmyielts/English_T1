import { lazy, type ComponentType, type ReactNode } from 'react';
import type { AreaNavItem, AreaRoute, HomeCard } from '../core/areas.ts';
import { LoadingState } from '../core/index.ts';
import { preloadPageText, usePageText } from './i18n/lazy.ts';

// Selling Schood AI (phase 5): the pricing page, the return from checkout, and gift
// redemption. Every page loads on demand with its own text, so the first download carries
// only this file. /plans (where core's paywall, the coach bots and engage link) opens the
// same pricing page.

type Page = ComponentType<{ params: Record<string, string> }>;
function WithText({ children }: { children: ReactNode }) {
  return <>{usePageText() ? children : <LoadingState/>}</>;
}
const page = <K extends string>(load: () => Promise<Record<K, ComponentType<never>>>, name: K) =>
  lazy(async () => {
    const [module] = await Promise.all([load(), preloadPageText()]);
    const Inner = module[name] as Page;
    const WithItsText: Page = (props) => <WithText><Inner {...props}/></WithText>;
    return { default: WithItsText };
  });
const PricingPage = page(() => import('./pages/Pricing.tsx'), 'PricingPage');
const DonePage = page(() => import('./pages/Done.tsx'), 'DonePage');
const GiftPage = page(() => import('./pages/Gift.tsx'), 'GiftPage');

export const routes: AreaRoute[] = [
  { path: '/pricing', component: PricingPage, title: 'pricing.title', public: true },
  { path: '/plans', component: PricingPage, title: 'pricing.title', public: true },
  { path: '/pricing/done', component: DonePage, title: 'pricing.done.title' },
  // Opens signed out too: the page keeps the code in this tab while the person signs in.
  { path: '/gift', component: GiftPage, title: 'pricing.gift.title', public: true },
];
export const nav: AreaNavItem[] = [];
export const homeCards: HomeCard[] = [];
