import { registerSystemJob } from '../registries.ts';
import type { FeatureModule } from '../types.ts';
import { pricingRoutes } from './routes.ts';
import { pricingStore } from './store.ts';

// Selling Schood AI (phase 5): what is on sale and at what price, fulfilment of what
// people paid for (credit packs, L18 gift codes, E12 sittings, Coach Team orders) and
// the launch switch. Buying itself goes through the platform's checkout (Click →
// payments → entitlements), which this area does not change; plans (Plus, Family,
// Teacher, coach passes) reach people through core's plan resolution from their
// entitlements. The certificate sittings and the annual offer reach engage through
// seams/pricing-engage.ts. See docs/product/44_SCHOOD_AI.md and the two CONTRACT.md files.

// Paid payments nobody came back for (a closed tab after paying) are fulfilled within
// five minutes; the person's own return to /pricing/done does it at once. Idempotent.
registerSystemJob('pricing.sync', {
  area: 'pricing',
  schedule: { everyMinutes: 5 },
  timeoutMs: 60_000,
  run: (ctx) => ctx.store(pricingStore).syncDue(100),
});

export const pricingModule: FeatureModule = { area: 'pricing', routes: pricingRoutes() };
