import { edge } from '../../lib/api';
import type { YourWord } from '../YourWords';

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

export type WatchItem = { id: string; wrong: string; right: string; topic: string | null };
export type WatchOutcome = WatchItem & { result: 'repeated' | 'avoided' | 'not_seen' };

/** Saved words to use and recent mistakes to watch (missions with replies, and projects). */
export type PersonalTargets = { words: YourWord[]; watch: WatchItem[] };
export type PersonalResult = { words_suggested: number; words_used: string[]; watch: WatchOutcome[] };

export type MissionSubmitResponse = {
  ok: boolean;
  personal?: PersonalResult | null;
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
  edge<{ mission: Mission; steps: MissionStep[]; personal?: PersonalTargets | null }>('immersion-missions', `/missions/${encodeURIComponent(slug)}`, {
    query: { language_code: 'en' },
    signal,
  });

export const submitMission = (slug: string, steps: StepAnswer[], timeSpentSeconds: number, yourWordIds: string[] = []) =>
  edge<MissionSubmitResponse>('immersion-missions', `/missions/${encodeURIComponent(slug)}/submit`, {
    query: { language_code: 'en' },
    body: { steps, time_spent_seconds: timeSpentSeconds, your_word_ids: yourWordIds },
  });

// ---- Multi-day projects ----

export type ProjectOverview = {
  key: string;
  title: string;
  level: string;
  summary: string;
  days: number;
  status: 'not_started' | 'active' | 'completed';
  done_days: number;
  current: number | null;
  opens_on: string | null;
};

export type ProjectDayPublic = {
  day: number;
  kind: 'reply' | 'speak';
  title: string;
  situation: string;
  task: string;
  goal: string;
  min_words: number;
  points: string[];
  model_answer: string | null;
};

export type ProjectDayResult = {
  day: number;
  score: number;
  response: string;
  mode: 'voice' | 'typed';
  achieved: boolean;
  points: Array<{ label: string; met: boolean }>;
  corrections: Correction[];
  summary: string;
  words_used: string[];
  feedback_mode: 'ai' | 'basic';
  done_on: string;
  at: string;
};

export type ProjectState = {
  days: Array<{ day: number; status: 'done' | 'open' | 'tomorrow' | 'locked'; result: ProjectDayResult | null; can_redo: boolean }>;
  current: number | null;
  opens_on: string | null;
  done: boolean;
};

export type ProjectSummary = {
  score: number;
  days: Array<{ day: number; title: string; score: number; achieved: boolean }>;
  points_met: number;
  points_total: number;
  words_used: string[];
  corrections: number;
  can_do: string;
  achieved_all: boolean;
};

export type ProjectDetail = {
  project: { key: string; title: string; level: string; summary: string; can_do: string; days: ProjectDayPublic[] };
  run: { status: 'active' | 'completed'; started_at: string; completed_at: string | null; state: ProjectState } | null;
  previous_excerpt: string | null;
  personal: PersonalTargets | null;
  summary: ProjectSummary | null;
};

export type ProjectDaySubmitResponse = {
  ok: boolean;
  day: ProjectDayResult & { tone: string | null; tone_note: string; word_count: number; min_words: number; too_short: boolean; model_answer: string };
  personal: PersonalResult;
  run: { status: 'active' | 'completed'; started_at: string; completed_at: string | null; state: ProjectState };
  summary: ProjectSummary | null;
};

export const getProjects = (signal?: AbortSignal) =>
  edge<{ projects: ProjectOverview[] }>('immersion-missions', '/projects', { query: { language_code: 'en' }, signal });

export const getProject = (key: string, signal?: AbortSignal) =>
  edge<ProjectDetail>('immersion-missions', `/projects/${encodeURIComponent(key)}`, { query: { language_code: 'en' }, signal });

export const startProject = (key: string) =>
  edge<ProjectDetail>('immersion-missions', `/projects/${encodeURIComponent(key)}/start`, { query: { language_code: 'en' }, body: {} });

export const abandonProject = (key: string) =>
  edge<{ ok: boolean }>('immersion-missions', `/projects/${encodeURIComponent(key)}/abandon`, { query: { language_code: 'en' }, body: {} });

export const submitProjectDay = (key: string, day: number, input: { text: string; mode: 'voice' | 'typed'; yourWordIds: string[]; timeSpentSeconds: number }) =>
  edge<ProjectDaySubmitResponse>('immersion-missions', `/projects/${encodeURIComponent(key)}/days/${day}/submit`, {
    query: { language_code: 'en' },
    body: { text: input.text, mode: input.mode, your_word_ids: input.yourWordIds, time_spent_seconds: input.timeSpentSeconds },
  });
