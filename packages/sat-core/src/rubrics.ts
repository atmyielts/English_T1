import type { SatDomain } from './question-types.ts';

export const SAT_DOMAIN_WEIGHTS: Record<SatDomain, number> = {
  grammar: 0.11,
  transitions: 0.08,
  rhetoric: 0.1,
  vocabulary_in_context: 0.08,
  command_of_evidence: 0.13,
  algebra: 0.17,
  advanced_math: 0.13,
  problem_solving_data_analysis: 0.11,
  geometry_trig: 0.09,
};

export const SAT_TARGET_SCORE_PRESETS = [1200, 1300, 1400, 1500] as const;
