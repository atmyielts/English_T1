import { createHash } from 'node:crypto';

type SetDefinition = {
  slug: string;
  title: string;
  category: 'paired' | 'evidence' | 'hard-math' | 'timed';
  time_limit_seconds?: number;
  checkpoint_week?: 2 | 4 | 6 | 8;
};

export const SHORT_SETS: readonly SetDefinition[] = [
  { slug: 'paired-01', title: 'Compare interpretations', category: 'paired' },
  { slug: 'paired-02', title: 'Test the assumptions', category: 'paired' },
  { slug: 'paired-03', title: 'Find the common ground', category: 'paired' },
  { slug: 'evidence-01', title: 'Baselines and thresholds', category: 'evidence' },
  { slug: 'evidence-02', title: 'Rates and reporting periods', category: 'evidence' },
  { slug: 'evidence-03', title: 'Compare groups fairly', category: 'evidence', checkpoint_week: 2, time_limit_seconds: 360 },
  { slug: 'hard-math-01', title: 'Models and measurements', category: 'hard-math' },
  { slug: 'hard-math-02', title: 'Constraints and exact values', category: 'hard-math' },
  { slug: 'hard-math-03', title: 'Recover the missing quantity', category: 'hard-math' },
  { slug: 'timed-01', title: 'Inference and calculation', category: 'timed', checkpoint_week: 4, time_limit_seconds: 360 },
  { slug: 'timed-02', title: 'Words, evidence and quantities', category: 'timed', checkpoint_week: 6, time_limit_seconds: 360 },
  { slug: 'timed-03', title: 'Connections and models', category: 'timed', checkpoint_week: 8, time_limit_seconds: 360 },
];

export function shortSetQuestionIds(slug: string): string[] {
  return Array.from({ length: 4 }, (_, index) => {
    const number = String(index + 1).padStart(2, '0');
    const hex = createHash('md5').update(`schood-sat-q:eight-week-${slug}-${number}`).digest('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  });
}
