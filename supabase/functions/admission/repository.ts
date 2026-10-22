import { validateItem, validateKey, type Item } from '../../../packages/assessment-core/src/mod.ts';
import type { MasteryState, PlanTask } from '../../../packages/subject-core/src/mod.ts';
import { AdmissionError, SUBJECT, type AdmissionRepository, type Candidate, type Goal } from './handler.ts';

type DbError = { code?: string; message: string } | null;
type Result<T> = { data: T | null; error: DbError };
// The subset of the Supabase query builder this repository uses.
// deno-lint-ignore no-explicit-any
type Query = any;
export interface AdmissionDatabase {
  from(table: string): Query;
  rpc(name: string, args: Record<string, unknown>): PromiseLike<Result<unknown>>;
}

function check<T>(result: Result<T>): T {
  if (result.error) throw new Error(`${result.error.code ?? 'db'}: ${result.error.message}`);
  return result.data as T;
}

/** Reads questions only from approved item versions in the Schood content workspace. */
export function createAdmissionRepository(user: AdmissionRepository['user'], db: AdmissionDatabase, contentTenant: string): AdmissionRepository {
  const state = (row: Record<string, unknown>): MasteryState => ({
    theta: Number(row.theta), precision: Number(row.precision), attempts: Number(row.attempts), correct: Number(row.correct),
    box: Number(row.box), last_at: (row.last_at as string | null) ?? null, next_review_at: (row.next_review_at as string | null) ?? null,
  });
  const item = (payload: unknown): Item | null => {
    try { return validateItem(payload); } catch { return null; }
  };
  return {
    user,
    async goal(actor) {
      const row = check<Record<string, unknown> | null>(await db.from('learner_subject_goals').select('section_id,question_locale,daily_minutes,exam_date,target_points,exam_code,format_version').eq('user_id', actor).eq('subject', SUBJECT).maybeSingle());
      return row ? { ...(row as unknown as Goal), target_points: row.target_points === null ? null : Number(row.target_points) } : null;
    },
    async saveGoal(actor, goal) {
      check(await db.from('learner_subject_goals').upsert({ user_id: actor, subject: SUBJECT, ...goal }, { onConflict: 'user_id,subject' }));
    },
    async mastery(actor) {
      const rows = check<Record<string, unknown>[]>(await db.from('learner_subject_mastery').select('topic_code,theta,precision,attempts,correct,box,last_at,next_review_at').eq('user_id', actor).eq('subject', SUBJECT));
      return new Map(rows.map((row) => [String(row.topic_code), state(row)]));
    },
    async plan(actor, date) {
      const row = check<{ tasks: PlanTask[] } | null>(await db.from('learner_subject_daily_plans').select('tasks').eq('user_id', actor).eq('subject', SUBJECT).eq('plan_date', date).maybeSingle());
      return row?.tasks ?? null;
    },
    async savePlan(actor, date, tasks) {
      check(await db.from('learner_subject_daily_plans').upsert({ user_id: actor, subject: SUBJECT, plan_date: date, tasks }, { onConflict: 'user_id,subject,plan_date', ignoreDuplicates: true }));
      return (await this.plan(actor, date)) ?? tasks;
    },
    async clearPlan(actor, date) {
      check(await db.from('learner_subject_daily_plans').delete().eq('user_id', actor).eq('subject', SUBJECT).eq('plan_date', date));
    },
    async answeredSince(actor, since) {
      return check<{ topic_code: string; correct: boolean; mode: 'diagnostic' | 'practice' | 'review' }[]>(await db.from('learner_subject_answers').select('topic_code,correct,mode').eq('user_id', actor).eq('subject', SUBJECT).gte('created_at', since.toISOString()).limit(500));
    },
    async recentItems(actor, limit) {
      const rows = check<{ item_version_id: string }[]>(await db.from('learner_subject_answers').select('item_version_id').eq('user_id', actor).eq('subject', SUBJECT).order('created_at', { ascending: false }).limit(limit));
      return rows.map((row) => row.item_version_id);
    },
    async candidates(topic, locale, limit) {
      const rows = check<{ id: string; payload: unknown }[]>(await db.from('assessment_item_versions').select('id,payload').eq('tenant_id', contentTenant).eq('status', 'approved').contains('payload', { locale, classification: { topics: [topic] } }).limit(limit));
      return rows.map((row) => ({ id: row.id, item: item(row.payload) })).filter((row): row is Candidate => row.item !== null);
    },
    async coveredTopics(locale) {
      const rows = check<{ topics: unknown }[]>(await db.from('assessment_item_versions').select('topics:payload->classification->topics').eq('tenant_id', contentTenant).eq('status', 'approved').eq('payload->>locale', locale).limit(10000));
      return new Set(rows.flatMap((row) => Array.isArray(row.topics) ? row.topics.filter((code): code is string => typeof code === 'string') : []));
    },
    async itemWithKey(itemVersionId) {
      const version = check<{ payload: unknown } | null>(await db.from('assessment_item_versions').select('payload').eq('id', itemVersionId).eq('tenant_id', contentTenant).eq('status', 'approved').maybeSingle());
      const parsed = version ? item(version.payload) : null;
      if (!parsed) return null;
      const key = check<{ key: unknown } | null>(await db.from('assessment_item_keys').select('key').eq('item_version_id', itemVersionId).eq('tenant_id', contentTenant).maybeSingle());
      if (!key) return null;
      try { return { item: parsed, key: validateKey(parsed, key.key) }; } catch { return null; }
    },
    async recordAnswer(actor, topic, answer, expectedAttempts, next) {
      const result = await db.rpc('learner_subject_record_answer', { p_user: actor, p_subject: SUBJECT, p_topic: topic, p_answer: answer, p_expected_attempts: expectedAttempts, p_state: next });
      if (result.error?.message?.includes('mastery_conflict')) throw new AdmissionError('mastery_conflict', 'Mastery changed; try again.', 409);
      const data = check(result) as { replayed: boolean; answer: { correct: boolean; error_kind: 'slip' | 'concept' | null; topic_code: string; item_version_id: string } };
      return { replayed: data.replayed, answer: data.answer };
    },
  };
}
