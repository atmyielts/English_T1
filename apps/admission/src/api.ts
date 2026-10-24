import { ServiceRequestError, supabase } from '../../../packages/assessment-web/src/client';
import { LocalizedError } from '../../../packages/assessment-web/src/i18n/translate.ts';
import type { Item } from '../../../packages/assessment-core/src/mod.ts';
import type { CertificateGrade, Milestone, PlanTask, SectionPrediction } from '../../../packages/subject-core/src/mod.ts';
export type { Milestone };

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
export interface Habit { current: number; best: number; active_today: boolean; today: { answers: number; minutes: number }; daily_minutes: number }
export interface Access { plan: 'beta' | 'free' | 'plus'; daily_limit: number | null; remaining_today: number | null }
export type Suggestion =
  | { kind: 'retake_certificate'; from: CertificateGrade | null; to: CertificateGrade }
  | { kind: 'certificate_counts'; grade: CertificateGrade; points: { section_id: string; points: number }[] }
  | { kind: 'plan_admission' } | { kind: 'plan_certificate' } | { kind: 'keep_reviewing' };
export interface Journey { milestones: Milestone[]; next: Milestone | null; days_to_next: number | null; awaiting_result: string[]; suggestions: Suggestion[] }
export type WeeklyMock = { week: string; questions: number; minutes: number; locked: boolean } & (
  | { status: 'none' }
  | { status: 'in_progress' | 'expired'; id: string; deadline_at: string }
  | { status: 'submitted'; id: string; points: number; max_points: number; correct: number; total: number; percentile: number | null; participants: number });
export interface LearnerState {
  goal: Goal | null;
  topics: TopicProgress[];
  plan: { date: string; tasks: (PlanTask & { answered: number })[]; answered_today: number } | null;
  prediction: SectionPrediction | null;
  diagnostic: { remaining: number; total: number; done: boolean } | null;
  habit: Habit;
  access: Access;
  journey: Journey;
  mistakes: number;
  mock: WeeklyMock | null;
  trend: { day: string; expected: number; low: number; high: number }[];
}
export type Mode = 'diagnostic' | 'practice' | 'review' | 'mistakes';
export type Question = { done: true } | { done: false; mode: Mode; topic_code: string; item_version_id: string; item: Item; remaining?: number };
export interface MockItem { item_version_id: string; topic_code: string; item: Item }
export interface MockSitting { id: string; week: string; section_id: string; deadline_at: string; submitted: false; items: MockItem[]; answers: Record<string, unknown> }
export interface MockResult {
  id: string; week: string; section_id: string; submitted: true; correct: number; total: number; points: number; max_points: number;
  percentile: number | null; participants: number; topics: { topic_code: string; correct: number; total: number }[];
  review: { item_version_id: string; topic_code: string; correct: boolean; item: Item | null; response: unknown; correct_answer: unknown; solution: string | null }[];
}
export interface Feedback {
  replayed: boolean;
  correct: boolean;
  error_kind: 'slip' | 'concept' | null;
  correct_answer: unknown;
  solution: string | null;
  mastery: { before: number; after: number };
}

/** Calls the admission function as the signed-in learner. */
export async function admission<T>(path: string, method: 'GET' | 'PUT' | 'POST' | 'DELETE' = 'GET', body?: unknown, expectedActor?: string): Promise<T> {
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
