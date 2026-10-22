import { edge } from '../../lib/api';

export type StepKind = 'read' | 'listen' | 'reply' | 'speak';

export type Mission = {
  id: string;
  slug: string;
  title: string;
  context_text: string;
  objective_text: string;
  mission_type: string;
  level: string | null;
  target_vocabulary: string[];
  success_conditions: string[];
  estimated_minutes: number;
  step_count: number;
};

export type MissionQuestion = { id: string; prompt: string; options: string[] };

export type MissionStep = {
  id: string;
  step_index: number;
  kind: StepKind | null;
  title: string;
  instructions: string;
  /** read: the notice; listen: the script read aloud (shown after checking); reply/speak: the cue. */
  text: string;
  estimated_minutes: number;
  questions: MissionQuestion[];
  min_words: number | null;
  accent: 'gb' | 'us' | null;
};

export type Correction = { original: string; better: string; explanation: string };

export type StepFeedback = {
  mode: 'ai' | 'basic';
  achieved: boolean;
  points: Array<{ label: string; met: boolean }>;
  tone: 'good' | 'could_be_better' | 'inappropriate' | null;
  tone_note: string;
  corrections: Correction[];
  summary: string;
  word_count: number;
  min_words: number;
  too_short: boolean;
};

export type StepResult = {
  step_id: string;
  kind: StepKind;
  title: string;
  /** 0..100 */
  score: number;
  questions: Array<MissionQuestion & { chosen: number | null; answer: number; correct: boolean; explanation: string }>;
  transcript: string | null;
  response: string | null;
  mode: 'voice' | 'typed' | null;
  feedback: StepFeedback | null;
  model_answer: string | null;
};

export type MissionSubmitResponse = {
  ok: boolean;
  attempt_id: string;
  /** 0..100 */
  score: number;
  feedback_mode: 'ai' | 'basic' | null;
  cultural_note: string | null;
  success_conditions: string[];
  steps: StepResult[];
};

export type StepAnswer = { step_id: string; answers?: Record<string, number>; text?: string; mode?: 'voice' | 'typed' };

export const getMission = (slug: string, signal?: AbortSignal) =>
  edge<{ mission: Mission; steps: MissionStep[] }>('immersion-missions', `/missions/${encodeURIComponent(slug)}`, {
    query: { language_code: 'en' },
    signal,
  });

export const submitMission = (slug: string, steps: StepAnswer[], timeSpentSeconds: number) =>
  edge<MissionSubmitResponse>('immersion-missions', `/missions/${encodeURIComponent(slug)}/submit`, {
    query: { language_code: 'en' },
    body: { steps, time_spent_seconds: timeSpentSeconds },
  });
