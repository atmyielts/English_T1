import type { FeatureModule } from '../types.ts';

// Teachers (T1–T6, T9–T15): Materials Studio, marking, planner, Live Quiz, channel
// autopilot, marketplace. Owned by the teacher agent. See ../CONTRACT.md.
export const teacherModule: FeatureModule = { area: 'teacher', routes: {} };
