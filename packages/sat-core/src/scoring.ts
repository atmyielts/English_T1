import type { SatDifficulty, SatDomain } from './question-types.ts';
import { SAT_DIFFICULTIES } from './question-types.ts';
import { SAT_DOMAIN_WEIGHTS } from './rubrics.ts';

export type SatMasteryStatus = 'new' | 'weak' | 'building' | 'stable' | 'mastered';

export const masteryLevelToStatus = (level: number): SatMasteryStatus => {
  if (level >= 0.9) return 'mastered';
  if (level >= 0.72) return 'stable';
  if (level >= 0.48) return 'building';
  if (level > 0) return 'weak';
  return 'new';
};

export const accuracyToMasteryLevel = (
  rollingAccuracy: number | null | undefined,
  attempts: number,
): number => {
  const accuracy = typeof rollingAccuracy === 'number' && Number.isFinite(rollingAccuracy)
    ? Math.max(0, Math.min(1, rollingAccuracy))
    : 0;
  const confidence = Math.min(1, Math.max(0, attempts) / 12);
  return Math.round((accuracy * 0.75 + confidence * 0.25) * 1000) / 1000;
};

export const nextDifficultyForCell = (
  current: SatDifficulty,
  rollingAccuracy: number,
  attempts: number,
): SatDifficulty => {
  if (attempts < 5) return current;
  const idx = SAT_DIFFICULTIES.indexOf(current);
  if (rollingAccuracy > 0.75) return SAT_DIFFICULTIES[Math.min(idx + 1, SAT_DIFFICULTIES.length - 1)] ?? current;
  if (rollingAccuracy < 0.5) return SAT_DIFFICULTIES[Math.max(idx - 1, 0)] ?? current;
  return current;
};

export const expectedPointImpact = (
  domain: SatDomain,
  currentAccuracy: number | null | undefined,
  errorFrequency: number,
): { conservative: number; optimistic: number } => {
  const weight = SAT_DOMAIN_WEIGHTS[domain] ?? 0.08;
  const accuracy = typeof currentAccuracy === 'number' && Number.isFinite(currentAccuracy)
    ? Math.max(0, Math.min(1, currentAccuracy))
    : 0.5;
  const gap = Math.max(0.15, 1 - accuracy);
  const frequency = Math.max(1, Math.min(10, errorFrequency));
  const base = 400 * weight * gap * (0.65 + frequency * 0.08);
  const conservative = Math.max(10, Math.round(base / 10) * 10);
  const optimistic = Math.max(conservative + 10, Math.round(base * 1.55 / 10) * 10);
  return { conservative, optimistic };
};
