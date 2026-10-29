import type { FeatureModule } from '../types.ts';

// Centres (T7, T8, C1–C16): centre workspace admin, Student Assistant, office,
// admissions agent, marketing, insights, owner brief. Owned by the centre agent.
// See ../CONTRACT.md.
export const centreModule: FeatureModule = { area: 'centre', routes: {} };
