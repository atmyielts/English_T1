import type { FeatureModule } from '../types.ts';

// Schood Coaches (B1–B6): the Telegram coach engine and the /coach/<pack> Mini App
// screens. Owned by the coach agent; most routes are called by the trusted worker
// (`service: true`). See ../CONTRACT.md.
export const coachModule: FeatureModule = { area: 'coach', routes: {} };
