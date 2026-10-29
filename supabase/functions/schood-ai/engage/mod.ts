import type { FeatureModule } from '../types.ts';

// The lifetime engagement layer (E1–E14): journeys, leagues, streaks, Skill Passport,
// win-back. Owned by the engage agent; it reads ai_learning_events and uses
// ctx.notify for every message. See ../CONTRACT.md.
export const engageModule: FeatureModule = { area: 'engage', routes: {} };
