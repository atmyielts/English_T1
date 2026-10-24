import { edge } from '../../lib/api';

export type GrammarUnit = {
  id: string;
  slug: string;
  title: string;
  level: string | null;
  focus_area: string | null;
  explanation_text: string | null;
  contrast_text: string | null;
  common_error_pattern: string | null;
  examples_json: Array<{ bad?: string; good?: string }> | null;
};

export type GrammarDrill = {
  id: string;
  drill_type: string;
  title: string | null;
  instructions: string | null;
  prompt_text: string;
  sort_order: number;
};

export type GrammarResult = {
  drill_id: string;
  prompt: string;
  response: string;
  correct: boolean;
  typo: boolean;
  expected: string;
};

export type GrammarMastery = {
  level: 0 | 1 | 2 | 3 | 4;
  name: 'new' | 'started' | 'practising' | 'secure' | 'mastered';
  attempts: number;
  best: number | null;
  last: number | null;
  last_at: string | null;
  passes: number;
  recheck_at: string | null;
  recheck_due: boolean;
};

export type GrammarSubmitResponse = {
  score: number;
  correct: number;
  total: number;
  results: GrammarResult[];
  practised_mistakes?: number;
  mastery?: GrammarMastery | null;
  focus_area?: string | null;
};

export type GrammarMasteryOverview = {
  units: Array<{ slug: string; title: string; level: string | null; focus_area: string | null; mastery: GrammarMastery }>;
  due: Array<{ slug: string; title: string; level: string | null; focus_area: string | null; mastery: GrammarMastery }>;
  counts: Record<GrammarMastery['name'], number>;
};

export const getUnit = (slug: string, signal?: AbortSignal) =>
  edge<{ unit: GrammarUnit; drills: GrammarDrill[]; mastery?: GrammarMastery | null }>('grammar-remediation', `/units/${encodeURIComponent(slug)}`, {
    query: { language_code: 'en' },
    signal,
  });

export const submitLesson = (slug: string, answers: Array<{ drill_id: string; response: string }>, timeSpentSeconds: number) =>
  edge<GrammarSubmitResponse>('grammar-remediation', `/units/${encodeURIComponent(slug)}/submit`, {
    query: { language_code: 'en' },
    body: { answers, time_spent_seconds: timeSpentSeconds },
  });

export const getGrammarMastery = (signal?: AbortSignal) =>
  edge<GrammarMasteryOverview>('grammar-remediation', '/mastery', { query: { language_code: 'en' }, signal });
