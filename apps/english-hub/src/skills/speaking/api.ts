import { edge } from '../../lib/api';

export type SpeakingTaskType = 'describe' | 'explain' | 'opinion' | 'story' | 'roleplay' | 'presentation';

export type SpeakingPrompt = {
  id: string;
  slug: string;
  title: string;
  prompt_text: string;
  prompt_type: string;
  level: string | null;
  target_duration_seconds: number;
  target_grammar: string | null;
  target_vocabulary: string[] | null;
  fluency_objective: string | null;
  pronunciation_objective: string | null;
  cue_points: string[];
  metadata: { task_type?: SpeakingTaskType; model_opening?: string } | null;
};

export type SpeakingMode = 'speech' | 'typed';

export type SpeakingFeedback = {
  source: 'ai' | 'basic';
  overall: number;
  scores: { task: number; vocabulary: number; grammar: number | null; fluency: number | null };
  cue_points: Array<{ text: string; covered: boolean }>;
  strengths: string[];
  corrections: Array<{ said: string; better: string; explanation: string }>;
  tip: string;
  model_answer: string | null;
  model_answer_kind: 'improved' | 'example' | null;
  stats: {
    words: number;
    speaking_seconds: number | null;
    wpm: number | null;
    pace: 'slow' | 'steady' | 'fast' | null;
    pace_band: [number, number];
    filler_count: number;
    sentences: number | null;
    variety: number;
    linkers: number;
    target_words_used: string[];
  };
};

export type SpeakingSubmitResponse = {
  ok: true;
  attempt_id: string;
  score: number;
  previous_score: number | null;
  mode: SpeakingMode;
  transcript: string;
  feedback: SpeakingFeedback;
};

export const getPrompt = (slug: string, signal?: AbortSignal) =>
  edge<{ prompt: SpeakingPrompt }>('speaking-studio', `/prompts/${encodeURIComponent(slug)}`, {
    query: { language_code: 'en' },
    signal,
  });

export const submitAnswer = (
  slug: string,
  input: { transcript: string; mode: SpeakingMode; speakingSeconds: number | null; timeSpentSeconds: number },
) =>
  edge<SpeakingSubmitResponse>('speaking-studio', `/prompts/${encodeURIComponent(slug)}/submit`, {
    query: { language_code: 'en' },
    body: {
      transcript: input.transcript,
      mode: input.mode,
      speaking_seconds: input.speakingSeconds,
      time_spent_seconds: input.timeSpentSeconds,
    },
  });
