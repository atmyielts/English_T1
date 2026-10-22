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

export type GrammarSubmitResponse = { score: number; correct: number; total: number; results: GrammarResult[] };

export const getUnit = (slug: string, signal?: AbortSignal) =>
  edge<{ unit: GrammarUnit; drills: GrammarDrill[] }>('grammar-remediation', `/units/${encodeURIComponent(slug)}`, {
    query: { language_code: 'en' },
    signal,
  });

export const submitLesson = (slug: string, answers: Array<{ drill_id: string; response: string }>, timeSpentSeconds: number) =>
  edge<GrammarSubmitResponse>('grammar-remediation', `/units/${encodeURIComponent(slug)}/submit`, {
    query: { language_code: 'en' },
    body: { answers, time_spent_seconds: timeSpentSeconds },
  });
