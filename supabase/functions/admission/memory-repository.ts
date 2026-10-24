import type { AnswerKey, Item } from '../../../packages/assessment-core/src/mod.ts';
import type { MasteryState, Milestone, PlanTask } from '../../../packages/subject-core/src/mod.ts';
import { AdmissionError, type AdmissionRepository, type AnswerInput, type Goal, type HistoryRow, type MockRow } from './handler.ts';

// In-memory repository for tests and the local dev stack. Never used by the deployed
// function. Mirrors the database's replay, conflict and uniqueness behaviour.

export type BankRow = { id: string; item: Item; key: AnswerKey };

export function createMemoryRepository(options: { bank: BankRow[]; users?: Record<string, string>; conflicts?: number; now?: () => Date }) {
  const users = options.users ?? { valid: '00000000-0000-4000-8000-0000000000a2' };
  const now = options.now ?? (() => new Date());
  let conflicts = options.conflicts ?? 0;
  const goals = new Map<string, Goal>(), mastery = new Map<string, Map<string, MasteryState>>(), plans = new Map<string, PlanTask[]>();
  const answers = new Map<string, AnswerInput & { user: string; topic: string; created_at: string }>();
  const milestones = new Map<string, Milestone & { user: string }>(), mocks = new Map<string, MockRow & { user: string }>();
  const snapshots = new Map<string, { day: string; expected: number; low: number; high: number }>();
  const calls: string[] = [];
  const own = <T extends { user: string }>(rows: Iterable<T>, user: string) => [...rows].filter((row) => row.user === user);
  const strip = <T extends { user: string }>(row: T): Omit<T, 'user'> => { const { user: _user, ...rest } = row; return rest; };
  const repository: AdmissionRepository = {
    user: (token) => Promise.resolve(users[token] ?? null),
    goal: (user) => Promise.resolve(goals.get(user) ?? null),
    saveGoal: (user, goal) => { goals.set(user, goal); calls.push('saveGoal'); return Promise.resolve(); },
    mastery: (user) => Promise.resolve(new Map(mastery.get(user) ?? [])),
    plan: (user, date) => Promise.resolve(plans.get(`${user}:${date}`) ?? null),
    savePlan: (user, date, tasks) => { const key = `${user}:${date}`; if (!plans.has(key)) plans.set(key, tasks); calls.push(`savePlan:${date}`); return Promise.resolve(plans.get(key)!); },
    clearPlan: (user, date) => { plans.delete(`${user}:${date}`); calls.push(`clearPlan:${date}`); return Promise.resolve(); },
    history: (user, since, limit) => Promise.resolve(own(answers.values(), user).filter((row) => Date.parse(row.created_at) >= since.getTime()).reverse().slice(0, limit)
      .map((row): HistoryRow => ({ created_at: row.created_at, topic_code: row.topic, item_version_id: row.item_version_id, correct: row.correct, mode: row.mode, seconds: row.seconds }))),
    candidates: (topic, locale) => Promise.resolve(options.bank.filter((row) => row.item.locale === locale && row.item.classification?.topics.includes(topic)).map(({ id, item }) => ({ id, item }))),
    topicCounts: (locale) => {
      const counts = new Map<string, number>();
      for (const row of options.bank) if (row.item.locale === locale) for (const code of row.item.classification?.topics ?? []) counts.set(code, (counts.get(code) ?? 0) + 1);
      return Promise.resolve(counts);
    },
    itemWithKey: (id) => Promise.resolve(options.bank.find((row) => row.id === id) ?? null),
    recordAnswer: (user, topic, answer, expected, state) => {
      const existing = answers.get(`${user}:${answer.client_answer_id}`);
      if (existing) return Promise.resolve({ replayed: true, answer: { correct: existing.correct, error_kind: existing.error_kind, topic_code: existing.topic, item_version_id: existing.item_version_id } });
      const topics = mastery.get(user) ?? new Map<string, MasteryState>();
      if (conflicts-- > 0 || (topics.get(topic)?.attempts ?? 0) !== expected) return Promise.reject(new AdmissionError('mastery_conflict', 'conflict', 409));
      answers.set(`${user}:${answer.client_answer_id}`, { ...answer, user, topic, created_at: now().toISOString() });
      topics.set(topic, state);
      mastery.set(user, topics);
      return Promise.resolve({ replayed: false, answer: { correct: answer.correct, error_kind: answer.error_kind, topic_code: topic, item_version_id: answer.item_version_id } });
    },
    milestones: (user) => Promise.resolve(own(milestones.values(), user).map((row) => strip(row) as Milestone)),
    saveMilestone: (user, input, id) => {
      const { predicted: _predicted, ...values } = input;
      if (own(milestones.values(), user).some((row) => row.id !== id && row.exam_code === values.exam_code && row.sitting_date === values.sitting_date)) return Promise.reject(new AdmissionError('milestone_exists', 'exists', 409));
      if (id && milestones.get(id)?.user !== user) return Promise.reject(new AdmissionError('not_found', 'Exam not found.', 404));
      const row = { ...values, id: id ?? crypto.randomUUID(), user };
      milestones.set(row.id, row);
      calls.push(`saveMilestone:${row.status}`);
      return Promise.resolve(strip(row) as Milestone);
    },
    deleteMilestone: (user, id) => Promise.resolve(milestones.get(id)?.user === user && milestones.delete(id)),
    mock: (user, week) => Promise.resolve((own(mocks.values(), user).find((row) => row.week === week) as MockRow | undefined) ?? null),
    createMock: (user, value) => {
      const existing = own(mocks.values(), user).find((row) => row.week === value.week);
      if (existing) return Promise.resolve(existing);
      const row = { ...value, id: crypto.randomUUID(), user, started_at: now().toISOString(), submitted_at: null, correct: null, points: null, max_points: null, results: null };
      mocks.set(row.id, row);
      return Promise.resolve(row);
    },
    saveMockAnswers: (user, id, value) => {
      const row = mocks.get(id);
      if (!row || row.user !== user || row.submitted_at) return Promise.resolve(false);
      row.answers = value;
      return Promise.resolve(true);
    },
    submitMock: (user, id, result) => {
      const row = mocks.get(id);
      if (!row || row.user !== user || row.submitted_at) return Promise.resolve(false);
      Object.assign(row, result, { submitted_at: now().toISOString() });
      return Promise.resolve(true);
    },
    weekScores: (user, week, sectionId) => Promise.resolve([...mocks.values()].filter((row) => row.user !== user && row.week === week && row.section_id === sectionId && row.submitted_at).map((row) => row.points ?? 0)),
    snapshot: (user, day, prediction) => { snapshots.set(`${user}:${day}`, { day, expected: prediction.expected, low: prediction.low, high: prediction.high }); return Promise.resolve(); },
    snapshots: (user, since) => Promise.resolve([...snapshots].filter(([key, row]) => key.startsWith(`${user}:`) && row.day >= since).map(([, row]) => row).sort((a, b) => a.day.localeCompare(b.day))),
  };
  return { repository, calls, goals, mastery, answers, milestones, mocks, snapshots };
}
