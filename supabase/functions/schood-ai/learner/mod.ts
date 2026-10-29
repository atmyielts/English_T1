import type { FeatureModule } from '../types.ts';

// Learners and parents (L1–L18, P1–P2). Owned by the learner agent: add routes here
// and register specialists, context providers, plan sources and action kinds at
// module load. See ../CONTRACT.md.
export const learnerModule: FeatureModule = { area: 'learner', routes: {} };
