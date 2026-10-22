import { ServiceRequestError, supabase } from '../../../packages/assessment-web/src/client';
import { LocalizedError } from '../../../packages/assessment-web/src/i18n/translate.ts';
import type { Item } from '../../../packages/assessment-core/src/mod.ts';
import type { PlanTask, SectionPrediction } from '../../../packages/subject-core/src/mod.ts';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export type SectionId = 'compulsory_math' | 'specialised_1' | 'specialised_2';
export interface Goal {
  section_id: SectionId;
  question_locale: 'uz' | 'ru';
  daily_minutes: number;
  exam_date: string | null;
  target_points: number | null;
}
export interface TopicProgress { code: string; level: number; attempts: number; due: boolean; has_questions: boolean }
export interface LearnerState {
  goal: Goal | null;
  topics: TopicProgress[];
  plan: { date: string; tasks: (PlanTask & { answered: number })[]; answered_today: number } | null;
  prediction: SectionPrediction | null;
  diagnostic: { remaining: number; total: number; done: boolean } | null;
}
export type Mode = 'diagnostic' | 'practice' | 'review';
export type Question = { done: true } | { done: false; mode: Mode; topic_code: string; item_version_id: string; item: Item };
export interface Feedback {
  replayed: boolean;
  correct: boolean;
  error_kind: 'slip' | 'concept' | null;
  correct_answer: unknown;
  solution: string | null;
  mastery: { before: number; after: number };
}

/** Calls the admission function as the signed-in learner. */
export async function admission<T>(path: string, method: 'GET' | 'PUT' | 'POST' = 'GET', body?: unknown, expectedActor?: string): Promise<T> {
  if (!supabase || !url || !anon) throw new LocalizedError('client.unconfigured');
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new LocalizedError('common.signIn');
  if (expectedActor && data.session.user.id !== expectedActor) throw new LocalizedError('common.accountChanged');
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${url}/functions/v1/admission/${path}`, {
      method,
      headers: { Authorization: `Bearer ${data.session.access_token}`, apikey: anon, 'Content-Type': 'application/json' },
      signal: controller.signal,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new ServiceRequestError(response.status, payload.code ?? 'request_failed', payload.error ?? 'Request failed');
    return payload as T;
  } finally {
    clearTimeout(timer);
  }
}
