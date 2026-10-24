import { validateItem, validateKey, type Item } from '../../../packages/assessment-core/src/mod.ts';
import type { MasteryState, Milestone, PlanTask } from '../../../packages/subject-core/src/mod.ts';
import { AdmissionError, SUBJECT, type AdmissionRepository, type Candidate, type Goal, type HistoryRow, type MockRow } from './handler.ts';

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

const MILESTONE_COLUMNS = 'id,exam_code,sitting_date,target_points,target_grade,status,result_points,result_grade';
const MOCK_COLUMNS = 'id,week,section_id,question_locale,items,answers,started_at,deadline_at,submitted_at,correct,points,max_points,results';
const num = (value: unknown) => value === null || value === undefined ? null : Number(value);

/** Reads questions only from approved item versions in the Schood content workspace. */
export function createAdmissionRepository(user: AdmissionRepository['user'], db: AdmissionDatabase, contentTenant: string): AdmissionRepository {
  const state = (row: Record<string, unknown>): MasteryState => ({
    theta: Number(row.theta), precision: Number(row.precision), attempts: Number(row.attempts), correct: Number(row.correct),
    box: Number(row.box), last_at: (row.last_at as string | null) ?? null, next_review_at: (row.next_review_at as string | null) ?? null,
  });
  const item = (payload: unknown): Item | null => {
    try { return validateItem(payload); } catch { return null; }
  };
  const milestone = (row: Record<string, unknown>): Milestone => ({ ...(row as unknown as Milestone), target_points: num(row.target_points), result_points: num(row.result_points) });
  const mock = (row: Record<string, unknown>): MockRow => ({ ...(row as unknown as MockRow), points: num(row.points), max_points: num(row.max_points) });
  return {
    user,
    async goal(actor) {
      const row = check<Record<string, unknown> | null>(await db.from('learner_subject_goals').select('section_id,question_locale,daily_minutes,exam_date,target_points,exam_code,format_version').eq('user_id', actor).eq('subject', SUBJECT).maybeSingle());
      return row ? { ...(row as unknown as Goal), target_points: num(row.target_points) } : null;
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
    async history(actor, since, limit) {
      return check<HistoryRow[]>(await db.from('learner_subject_answers').select('created_at,topic_code,item_version_id,correct,mode,seconds').eq('user_id', actor).eq('subject', SUBJECT).gte('created_at', since.toISOString()).order('created_at', { ascending: false }).limit(limit));
    },
    async candidates(topic, locale, limit) {
      const rows = check<{ id: string; payload: unknown }[]>(await db.from('assessment_item_versions').select('id,payload').eq('tenant_id', contentTenant).eq('status', 'approved').contains('payload', { locale, classification: { topics: [topic] } }).limit(limit));
      return rows.map((row) => ({ id: row.id, item: item(row.payload) })).filter((row): row is Candidate => row.item !== null);
    },
    async topicCounts(locale) {
      const rows = check<{ topics: unknown }[]>(await db.from('assessment_item_versions').select('topics:payload->classification->topics').eq('tenant_id', contentTenant).eq('status', 'approved').eq('payload->>locale', locale).limit(10000));
      const counts = new Map<string, number>();
      for (const row of rows) if (Array.isArray(row.topics)) for (const code of row.topics) if (typeof code === 'string') counts.set(code, (counts.get(code) ?? 0) + 1);
      return counts;
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
    async milestones(actor) {
      const rows = check<Record<string, unknown>[]>(await db.from('learner_subject_milestones').select(MILESTONE_COLUMNS).eq('user_id', actor).eq('subject', SUBJECT).order('sitting_date', { ascending: true }).limit(100));
      return rows.map(milestone);
    },
    async saveMilestone(actor, input, id) {
      const values = { ...input, predicted: input.predicted ?? undefined };
      const result = id
        ? await db.from('learner_subject_milestones').update(values).eq('id', id).eq('user_id', actor).eq('subject', SUBJECT).select(MILESTONE_COLUMNS).maybeSingle()
        : await db.from('learner_subject_milestones').insert({ user_id: actor, subject: SUBJECT, ...values }).select(MILESTONE_COLUMNS).maybeSingle();
      if (result.error?.code === '23505') throw new AdmissionError('milestone_exists', 'This exam is already on your path for that date.', 409);
      const row = check<Record<string, unknown> | null>(result);
      if (!row) throw new AdmissionError('not_found', 'Exam not found.', 404);
      return milestone(row);
    },
    async deleteMilestone(actor, id) {
      const rows = check<unknown[]>(await db.from('learner_subject_milestones').delete().eq('id', id).eq('user_id', actor).eq('subject', SUBJECT).select('id'));
      return rows.length > 0;
    },
    async mock(actor, week) {
      const row = check<Record<string, unknown> | null>(await db.from('learner_subject_mocks').select(MOCK_COLUMNS).eq('user_id', actor).eq('subject', SUBJECT).eq('week', week).maybeSingle());
      return row ? mock(row) : null;
    },
    async createMock(actor, value) {
      check(await db.from('learner_subject_mocks').upsert({ user_id: actor, subject: SUBJECT, ...value }, { onConflict: 'user_id,subject,week', ignoreDuplicates: true }));
      const row = await this.mock(actor, value.week);
      if (!row) throw new Error('mock was not stored');
      return row;
    },
    async saveMockAnswers(actor, id, answers) {
      const rows = check<unknown[]>(await db.from('learner_subject_mocks').update({ answers }).eq('id', id).eq('user_id', actor).is('submitted_at', null).select('id'));
      return rows.length > 0;
    },
    async submitMock(actor, id, result) {
      const rows = check<unknown[]>(await db.from('learner_subject_mocks').update({ ...result, submitted_at: new Date().toISOString() }).eq('id', id).eq('user_id', actor).is('submitted_at', null).select('id'));
      return rows.length > 0;
    },
    async weekScores(actor, week, sectionId) {
      const rows = check<{ points: unknown }[]>(await db.from('learner_subject_mocks').select('points').eq('subject', SUBJECT).eq('week', week).eq('section_id', sectionId).neq('user_id', actor).not('submitted_at', 'is', null).limit(10000));
      return rows.map((row) => Number(row.points));
    },
    async snapshot(actor, day, prediction) {
      check(await db.from('learner_subject_prediction_snapshots').upsert({ user_id: actor, subject: SUBJECT, day, section_id: prediction.section_id, expected: prediction.expected, low: prediction.low, high: prediction.high }, { onConflict: 'user_id,subject,day' }));
    },
    async snapshots(actor, since) {
      const rows = check<Record<string, unknown>[]>(await db.from('learner_subject_prediction_snapshots').select('day,expected,low,high').eq('user_id', actor).eq('subject', SUBJECT).gte('day', since).order('day', { ascending: true }).limit(400));
      return rows.map((row) => ({ day: String(row.day), expected: Number(row.expected), low: Number(row.low), high: Number(row.high) }));
    },
  };
}
