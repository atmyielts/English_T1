import { scoreResponse, type AnswerKey, type Item } from '../../../packages/assessment-core/src/mod.ts';
import {
  awaitingResult, buildDailyPlan, CERTIFICATE_GRADES, classifyError, DIFFICULTY_LOGIT, EXAM_CODES, findSection, initialMastery, knownTopics,
  masteryLevel, mockBlueprint, mockMinutes, nextMilestone, percentile, predictSection, streak, suggestNext, targetDifficulty,
  updateMastery, UZ_ADMISSION_2026, UZ_MATH_CERTIFICATE_2026, UZ_MATH_TOPICS, weekOf,
  type CertificateFormat, type CertificateGrade, type Difficulty, type ExamCode, type ExamFormat, type MasteryState, type Milestone,
  type PlanTask, type SectionPrediction, type Taxonomy,
} from '../../../packages/subject-core/src/mod.ts';

// Schood Admission API: goal, exam path, daily plan, practice, mistakes, weekly mock,
// habit and prediction. Questions are approved Assessment Cloud item versions in the
// Schood content workspace. Answer keys and worked solutions never leave the server
// before the learner has answered (or, in a mock, submitted).

export const SUBJECT = 'math';
export const MATH_SECTIONS = ['compulsory_math', 'specialised_1', 'specialised_2'] as const;
export type Mode = 'diagnostic' | 'practice' | 'review' | 'mock';
export type Plan = 'beta' | 'free' | 'plus';

export interface Goal {
  section_id: string;
  question_locale: 'uz' | 'ru';
  daily_minutes: number;
  exam_date: string | null;
  target_points: number | null;
  exam_code: string;
  format_version: string;
}
export interface Candidate { id: string; item: Item }
export interface StoredAnswer { correct: boolean; error_kind: 'slip' | 'concept' | null; topic_code: string; item_version_id: string }
export interface AnswerInput {
  client_answer_id: string;
  item_version_id: string;
  mode: Mode;
  difficulty: number;
  correct: boolean;
  error_kind: 'slip' | 'concept' | null;
  response: unknown;
  seconds: number | null;
  hints_used: number;
}
export interface HistoryRow { created_at: string; topic_code: string; item_version_id: string; correct: boolean; mode: Mode; seconds: number | null }
export interface MockRow {
  id: string;
  week: string;
  section_id: string;
  question_locale: 'uz' | 'ru';
  items: { item_version_id: string; topic_code: string }[];
  answers: Record<string, unknown>;
  started_at: string;
  deadline_at: string;
  submitted_at: string | null;
  correct: number | null;
  points: number | null;
  max_points: number | null;
  results: { item_version_id: string; topic_code: string; correct: boolean }[] | null;
}
export type MilestoneInput = Omit<Milestone, 'id'> & { predicted?: SectionPrediction | null };

export interface AdmissionRepository {
  user(token: string): Promise<string | null>;
  goal(user: string): Promise<Goal | null>;
  saveGoal(user: string, goal: Goal): Promise<void>;
  mastery(user: string): Promise<Map<string, MasteryState>>;
  plan(user: string, date: string): Promise<PlanTask[] | null>;
  /** Stores the day's plan unless one exists, and returns the stored one. */
  savePlan(user: string, date: string, tasks: PlanTask[]): Promise<PlanTask[]>;
  /** Drops the day's plan so the next read rebuilds it, after the goal changes. */
  clearPlan(user: string, date: string): Promise<void>;
  /** The learner's answers since a time, newest first. */
  history(user: string, since: Date, limit: number): Promise<HistoryRow[]>;
  candidates(topic: string, locale: 'uz' | 'ru', limit: number): Promise<Candidate[]>;
  /** Approved questions per topic in this language. */
  topicCounts(locale: 'uz' | 'ru'): Promise<Map<string, number>>;
  itemWithKey(itemVersionId: string): Promise<{ item: Item; key: AnswerKey } | null>;
  /** Throws an error with code `mastery_conflict` when the stored attempts differ from `expectedAttempts`. */
  recordAnswer(user: string, topic: string, answer: AnswerInput, expectedAttempts: number, state: MasteryState): Promise<{ replayed: boolean; answer: StoredAnswer }>;
  milestones(user: string): Promise<Milestone[]>;
  /** Inserts, or updates when `id` is given. Throws `milestone_exists` for a duplicate exam and date. */
  saveMilestone(user: string, milestone: MilestoneInput, id?: string): Promise<Milestone>;
  deleteMilestone(user: string, id: string): Promise<boolean>;
  mock(user: string, week: string): Promise<MockRow | null>;
  /** Creates the week's mock unless one exists, and returns the stored one. */
  createMock(user: string, mock: Omit<MockRow, 'id' | 'started_at' | 'submitted_at' | 'correct' | 'points' | 'max_points' | 'results'>): Promise<MockRow>;
  saveMockAnswers(user: string, id: string, answers: Record<string, unknown>): Promise<boolean>;
  /** Marks the mock submitted unless it already is; returns false if it was. */
  submitMock(user: string, id: string, result: { correct: number; points: number; max_points: number; results: MockRow['results'] }): Promise<boolean>;
  /** Points of other learners' submitted mocks in the same week and section. */
  weekScores(user: string, week: string, sectionId: string): Promise<number[]>;
  snapshot(user: string, day: string, prediction: SectionPrediction): Promise<void>;
  snapshots(user: string, since: string): Promise<{ day: string; expected: number; low: number; high: number }[]>;
}

export class AdmissionError extends Error {
  constructor(public code: string, message: string, public status = 400, public details: Record<string, unknown> = {}) {
    super(message);
  }
}

export interface AdmissionOptions {
  enabled: boolean;
  format?: ExamFormat;
  certificate?: CertificateFormat;
  taxonomy?: Taxonomy;
  now?: () => Date;
  random?: () => number;
  /** Paid access check. Without it everyone has full access (beta). */
  access?: (token: string) => Promise<'plus' | 'free'>;
  /** Practice and review answers a free learner gets each day. */
  freeDailyQuestions?: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DAY = 86_400_000;
const AUTO_GRADED = new Set(['single_choice', 'multi_choice', 'true_false', 'numeric', 'short_answer', 'ordering', 'matching', 'gap_fill']);
const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];
// Late mock answers are accepted for a short grace period (slow networks).
const MOCK_GRACE_MS = 120_000;

/** Calendar day in Tashkent (UTC+5, no daylight saving): plans change at local midnight. */
export function tashkentDate(now: Date): string {
  return new Date(now.getTime() + 5 * 3_600_000).toISOString().slice(0, 10);
}
function tashkentMidnight(now: Date): Date {
  return new Date(Date.parse(`${tashkentDate(now)}T00:00:00Z`) - 5 * 3_600_000);
}
const round1 = (value: number) => Math.round(value * 10) / 10;
const round2 = (value: number) => Math.round(value * 100) / 100;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AdmissionError('invalid_request', 'Expected a JSON object.');
  return value as Record<string, unknown>;
}
function uuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !UUID.test(value)) throw new AdmissionError('invalid_request', `${field} must be a UUID.`);
  return value.toLowerCase();
}
function integer(value: unknown, field: string, min: number, max: number, code = 'invalid_request'): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) throw new AdmissionError(code, `${field} must be a whole number from ${min} to ${max}.`);
  return value;
}
function isoDate(value: unknown, field: string, code: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) throw new AdmissionError(code, `${field} must be a date.`);
  return value;
}
/** A stable answer id for a mock question, so a resubmitted mock never records twice. */
async function derivedId(...parts: string[]): Promise<string> {
  const hex = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(parts.join(':'))))].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function validateGoal(value: unknown, format: ExamFormat, now: Date): Goal {
  const raw = record(value);
  const section = String(raw.section_id ?? '');
  if (!(MATH_SECTIONS as readonly string[]).includes(section)) throw new AdmissionError('invalid_goal', 'Choose the exam section you sit Maths in.');
  findSection(format, section);
  if (raw.question_locale !== 'uz' && raw.question_locale !== 'ru') throw new AdmissionError('invalid_goal', 'Questions are available in Uzbek or Russian.');
  const minutes = integer(raw.daily_minutes ?? 30, 'Daily minutes', 10, 120, 'invalid_goal');
  let examDate: string | null = null;
  if (raw.exam_date !== undefined && raw.exam_date !== null && raw.exam_date !== '') {
    examDate = isoDate(raw.exam_date, 'Exam date', 'invalid_goal');
    const days = (Date.parse(examDate) - Date.parse(tashkentDate(now))) / DAY;
    if (days < 0 || days > 3 * 366) throw new AdmissionError('invalid_goal', 'Exam date must be within the next three years.');
  }
  let target: number | null = null;
  if (raw.target_points !== undefined && raw.target_points !== null && raw.target_points !== '') {
    const max = findSection(format, section).questions * findSection(format, section).points_per_question;
    if (typeof raw.target_points !== 'number' || !(raw.target_points >= 0 && raw.target_points <= max)) throw new AdmissionError('invalid_goal', `Target must be from 0 to ${round1(max)} points.`);
    target = round1(raw.target_points);
  }
  return { section_id: section, question_locale: raw.question_locale, daily_minutes: minutes, exam_date: examDate, target_points: target, exam_code: format.exam_code, format_version: format.version };
}

/** A new or edited exam on the learner's path. Results can be reported only for a past date. */
export function validateMilestone(value: unknown, now: Date, existing?: Milestone): MilestoneInput {
  const raw = record(value), today = tashkentDate(now);
  const exam = (raw.exam_code ?? existing?.exam_code) as ExamCode;
  if (!(EXAM_CODES as readonly string[]).includes(exam)) throw new AdmissionError('invalid_milestone', 'Choose the certificate or the admission test.');
  const date = isoDate(raw.sitting_date ?? existing?.sitting_date, 'Exam date', 'invalid_milestone');
  const days = (Date.parse(date) - Date.parse(today)) / DAY;
  if (days > 3 * 366 || days < -366) throw new AdmissionError('invalid_milestone', 'The exam date must be within a year back and three years ahead.');
  const grade = (field: string, allowNone: boolean) => {
    const v = raw[field] === undefined ? (existing as unknown as Record<string, unknown> | undefined)?.[field] ?? null : raw[field];
    if (v === null || v === '') return null;
    if (!(CERTIFICATE_GRADES as readonly unknown[]).includes(v) && !(allowNone && v === 'none')) throw new AdmissionError('invalid_milestone', 'Unknown certificate grade.');
    return v as CertificateGrade;
  };
  const points = (field: string) => {
    const v = raw[field] === undefined ? (existing as unknown as Record<string, unknown> | undefined)?.[field] ?? null : raw[field];
    if (v === null || v === '') return null;
    if (typeof v !== 'number' || !(v >= 0 && v <= 189)) throw new AdmissionError('invalid_milestone', 'Points must be from 0 to 189.');
    return round1(v);
  };
  const status = String(raw.status ?? existing?.status ?? 'planned') as Milestone['status'];
  if (!['planned', 'done', 'skipped'].includes(status)) throw new AdmissionError('invalid_milestone', 'Unknown status.');
  const resultGrade = grade('result_grade', true), resultPoints = points('result_points');
  if (status === 'done' && date > today) throw new AdmissionError('invalid_milestone', 'A result can be reported only after the exam date.');
  if (status === 'done' && (exam === 'uz-certificate-math' ? resultGrade === null : resultPoints === null)) throw new AdmissionError('invalid_milestone', 'Enter your result.');
  return {
    exam_code: exam,
    sitting_date: date,
    target_points: exam === 'uz-admission' ? points('target_points') : null,
    target_grade: exam === 'uz-certificate-math' ? grade('target_grade', false) : null,
    status,
    result_points: status === 'done' && exam === 'uz-admission' ? resultPoints : null,
    result_grade: status === 'done' && exam === 'uz-certificate-math' ? resultGrade : null,
  };
}

/** Topics of the learner's block that have questions, in taxonomy order. */
function blockTopics(taxonomy: Taxonomy, format: ExamFormat, goal: Goal, covered: ReadonlySet<string>): string[] {
  const block = findSection(format, goal.section_id).block;
  return taxonomy.topics.filter((topic) => topic.blocks.includes(block) && covered.has(topic.code)).map((topic) => topic.code);
}
/** Diagnostic order: the block's topics with questions and no answer yet. */
export function diagnosticTopics(taxonomy: Taxonomy, format: ExamFormat, goal: Goal, mastery: ReadonlyMap<string, MasteryState>, covered: ReadonlySet<string>): string[] {
  return blockTopics(taxonomy, format, goal, covered).filter((code) => !(mastery.get(code)?.attempts));
}

/** Picks a question near the target difficulty that the learner has not seen recently. */
export function pickQuestion(candidates: Candidate[], recent: ReadonlySet<string>, target: Difficulty, random: () => number): Candidate | null {
  const fresh = candidates.filter((row) => !recent.has(row.id));
  const pool = fresh.length ? fresh : candidates;
  if (!pool.length) return null;
  const distance = (row: Candidate) => Math.abs(DIFFICULTIES.indexOf(row.item.classification?.estimated_difficulty ?? 'medium') - DIFFICULTIES.indexOf(target));
  const best = Math.min(...pool.map(distance));
  const closest = pool.filter((row) => distance(row) === best);
  return closest[Math.floor(random() * closest.length)] ?? closest[0];
}

/** Questions whose latest answer was wrong, newest first: "my mistakes". */
export function openMistakes(history: readonly HistoryRow[]): HistoryRow[] {
  const latest = new Map<string, HistoryRow>();
  for (const row of history) if (!latest.has(row.item_version_id)) latest.set(row.item_version_id, row);
  return [...latest.values()].filter((row) => !row.correct && row.mode !== 'diagnostic');
}

/** The key's correct answer in a shape the app can show after answering. */
function revealedAnswer(key: AnswerKey): unknown {
  return key.numeric ? key.numeric.value : key.correct ?? null;
}

export function createAdmissionHandler(repository: AdmissionRepository, allowedOrigins: string[], options: AdmissionOptions) {
  const format = options.format ?? UZ_ADMISSION_2026, taxonomy = options.taxonomy ?? UZ_MATH_TOPICS, certificate = options.certificate ?? UZ_MATH_CERTIFICATE_2026;
  const now = options.now ?? (() => new Date()), random = options.random ?? Math.random;
  const freeDaily = options.freeDailyQuestions ?? 10;
  const topicCodes = new Set(taxonomy.topics.map((topic) => topic.code));
  // Which topics have questions changes only when content is approved; cache it briefly per language.
  const coverage = new Map<string, { at: number; counts: Promise<Map<string, number>> }>();
  function counts(locale: 'uz' | 'ru'): Promise<Map<string, number>> {
    const cached = coverage.get(locale), at = now().getTime();
    if (cached && at - cached.at < 300_000) return cached.counts;
    const result = repository.topicCounts(locale);
    coverage.set(locale, { at, counts: result });
    result.catch(() => coverage.delete(locale));
    return result;
  }
  const covered = async (locale: 'uz' | 'ru') => new Set([...(await counts(locale))].filter(([, n]) => n > 0).map(([code]) => code));

  async function access(token: string): Promise<Plan> {
    return options.access ? await options.access(token) : 'beta';
  }
  /** Practice and review answers today, for the free daily allowance. */
  async function practisedToday(user: string, at: Date) {
    return (await repository.history(user, tashkentMidnight(at), 500)).filter((row) => row.mode === 'practice' || row.mode === 'review').length;
  }
  async function requireAllowance(user: string, plan: Plan, at: Date) {
    if (plan !== 'free') return;
    const used = await practisedToday(user, at);
    if (used >= freeDaily) throw new AdmissionError('daily_limit', 'You have used today\'s free questions.', 402, { limit: freeDaily });
  }

  /** The exam date that drives urgency: the nearest planned exam, else the goal's date. */
  function focusDate(goal: Goal, milestones: Milestone[], today: string): Date | null {
    const next = nextMilestone(milestones, today)?.sitting_date ?? goal.exam_date;
    return next ? new Date(`${next}T00:00:00+05:00`) : null;
  }

  async function journey(user: string, at: Date) {
    const today = tashkentDate(at), milestones = await repository.milestones(user);
    const next = nextMilestone(milestones, today);
    return {
      milestones: [...milestones].sort((a, b) => a.sitting_date.localeCompare(b.sitting_date)),
      next,
      days_to_next: next ? Math.round((Date.parse(next.sitting_date) - Date.parse(today)) / DAY) : null,
      awaiting_result: awaitingResult(milestones, today).map((row) => row.id),
      suggestions: suggestNext(milestones, certificate, today),
    };
  }

  async function weeklyMock(user: string, goal: Goal, at: Date, plan: Plan) {
    const week = weekOf(tashkentDate(at)), row = await repository.mock(user, week);
    const blueprint = mockBlueprint(taxonomy, format, goal.section_id, await counts(goal.question_locale));
    const questions = [...blueprint.values()].reduce((sum, n) => sum + n, 0);
    const base = { week, questions, minutes: mockMinutes(questions), locked: plan === 'free' };
    if (!row) return { ...base, status: 'none' as const };
    if (!row.submitted_at) return { ...base, status: Date.parse(row.deadline_at) + MOCK_GRACE_MS < at.getTime() ? 'expired' as const : 'in_progress' as const, id: row.id, deadline_at: row.deadline_at };
    const others = await repository.weekScores(user, week, row.section_id);
    return { ...base, status: 'submitted' as const, id: row.id, points: row.points, max_points: row.max_points, correct: row.correct, total: row.items.length, percentile: percentile(row.points ?? 0, others), participants: others.length + 1 };
  }

  async function state(user: string, token: string) {
    const at = now(), today = tashkentDate(at), goal = await repository.goal(user), plan = await access(token);
    const mastery = await repository.mastery(user);
    const available = goal ? await covered(goal.question_locale) : new Set<string>();
    const topics = taxonomy.topics.map((topic) => {
      const row = mastery.get(topic.code);
      return { code: topic.code, level: round2(masteryLevel(row ?? initialMastery(), at)), attempts: row?.attempts ?? 0, due: !!row?.next_review_at && Date.parse(row.next_review_at) <= at.getTime(), has_questions: available.has(topic.code) };
    });
    const history = await repository.history(user, new Date(at.getTime() - 400 * DAY), 5000);
    const days = history.map((row) => tashkentDate(new Date(row.created_at)));
    const todays = history.filter((row) => tashkentDate(new Date(row.created_at)) === today);
    const practised = todays.filter((row) => row.mode === 'practice' || row.mode === 'review').length;
    const habit = {
      ...streak(days, today),
      today: { answers: todays.length, minutes: Math.round(todays.reduce((sum, row) => sum + (row.seconds ?? 60), 0) / 60) },
      daily_minutes: goal?.daily_minutes ?? 30,
    };
    const accessState = { plan, daily_limit: plan === 'free' ? freeDaily : null, remaining_today: plan === 'free' ? Math.max(0, freeDaily - practised) : null };
    const mistakes = openMistakes(history).length;
    const path = await journey(user, at);
    if (!goal) return { goal: null, topics, plan: null, prediction: null, diagnostic: null, content: null, habit, access: accessState, journey: path, mistakes, mock: null, trend: [] };
    const remaining = diagnosticTopics(taxonomy, format, goal, mastery, available);
    const total = blockTopics(taxonomy, format, goal, available).length;
    const diagnostic = { remaining: remaining.length, total, done: remaining.length === 0 };
    const prediction = predictSection(taxonomy, format, goal.section_id, mastery, at);
    const content = { topics_with_questions: available.size };
    const mock = await weeklyMock(user, goal, at, plan);
    const common = { goal, topics, prediction, diagnostic, content, habit, access: accessState, journey: path, mistakes, mock };
    // The day's plan is made from diagnostic results, so it waits until the diagnostic is done.
    if (!diagnostic.done) return { ...common, plan: null, trend: [] };
    await repository.snapshot(user, today, prediction);
    const trend = await repository.snapshots(user, new Date(Date.parse(today) - 90 * DAY).toISOString().slice(0, 10));
    let tasks = await repository.plan(user, today);
    if (!tasks) {
      tasks = buildDailyPlan({ taxonomy, format, sectionId: goal.section_id, mastery, now: at, examDate: focusDate(goal, path.milestones, today), minutes: goal.daily_minutes, available });
      tasks = await repository.savePlan(user, today, tasks);
    }
    // Only practice and review count towards the day's tasks.
    const done = (code: string) => todays.filter((row) => (row.mode === 'practice' || row.mode === 'review') && row.topic_code === code).length;
    return { ...common, plan: { date: today, tasks: tasks.map((task) => ({ ...task, answered: Math.min(task.questions, done(task.topic_code)) })), answered_today: practised }, trend };
  }

  async function question(user: string, token: string, url: URL) {
    const goal = await repository.goal(user);
    if (!goal) throw new AdmissionError('goal_required', 'Set your goal first.', 409);
    const mode = url.searchParams.get('mode') ?? 'practice';
    if (!['diagnostic', 'practice', 'review', 'mistakes'].includes(mode)) throw new AdmissionError('invalid_request', 'Unknown mode.');
    const at = now();
    if (mode !== 'diagnostic') await requireAllowance(user, await access(token), at);
    const mastery = await repository.mastery(user);
    if (mode === 'mistakes') {
      // The newest open mistake, skipping ones answered in the last ten minutes.
      const recentCut = at.getTime() - 600_000;
      const open = openMistakes(await repository.history(user, new Date(at.getTime() - 180 * DAY), 3000)).filter((row) => Date.parse(row.created_at) < recentCut);
      for (const row of open) {
        const found = await repository.itemWithKey(row.item_version_id);
        if (found && found.item.locale === goal.question_locale) return { done: false, mode: 'review', topic_code: row.topic_code, item_version_id: row.item_version_id, item: found.item, remaining: open.length };
      }
      return { done: true };
    }
    let topic = url.searchParams.get('topic') ?? '';
    if (mode === 'diagnostic') {
      topic = diagnosticTopics(taxonomy, format, goal, mastery, await covered(goal.question_locale))[0] ?? '';
      if (!topic) return { done: true };
    } else if (!topicCodes.has(topic)) throw new AdmissionError('invalid_request', 'Unknown topic.');
    const recent = new Set((await repository.history(user, new Date(at.getTime() - 60 * DAY), 60)).map((row) => row.item_version_id));
    const target = mode === 'diagnostic' ? 'medium' : targetDifficulty(mastery.get(topic) ?? initialMastery());
    const picked = pickQuestion(await repository.candidates(topic, goal.question_locale, 200), recent, target, random);
    if (!picked) throw new AdmissionError('no_questions', 'There are no questions for this topic yet.', 404);
    return { done: false, mode, topic_code: topic, item_version_id: picked.id, item: picked.item };
  }

  /** Grades one answer, records it and moves the topic's mastery (retrying on a concurrent update). */
  async function grade(user: string, input: { clientId: string; itemId: string; topic: string; mode: Mode; response: unknown; seconds: number | null; hints: number }, found: { item: Item; key: AnswerKey }) {
    const score = scoreResponse(found.item, found.key, input.response);
    const correct = score.status === 'scored' && score.score === score.max_score;
    const difficulty = DIFFICULTY_LOGIT[found.item.classification?.estimated_difficulty ?? 'medium'];
    for (let attempt = 0; ; attempt++) {
      const at = now(), before = (await repository.mastery(user)).get(input.topic) ?? initialMastery();
      const error_kind = correct ? null : classifyError(before, at, difficulty);
      const after = updateMastery(before, { correct, difficulty, at, hints_used: input.hints });
      try {
        const stored = await repository.recordAnswer(user, input.topic, { client_answer_id: input.clientId, item_version_id: input.itemId, mode: input.mode, difficulty, correct, error_kind, response: input.response ?? null, seconds: input.seconds, hints_used: input.hints }, before.attempts, after);
        const final = stored.replayed ? (await repository.mastery(user)).get(input.topic) ?? after : after;
        return { stored, before: round2(masteryLevel(before, at)), after: round2(masteryLevel(final, at)) };
      } catch (cause) {
        if ((cause as { code?: string }).code === 'mastery_conflict' && attempt < 2) continue;
        throw cause;
      }
    }
  }

  async function answer(user: string, token: string, body: unknown) {
    const raw = record(body);
    const clientId = uuid(raw.client_answer_id, 'client_answer_id'), itemId = uuid(raw.item_version_id, 'item_version_id');
    const mode = String(raw.mode ?? 'practice') as Mode;
    if (!['diagnostic', 'practice', 'review'].includes(mode)) throw new AdmissionError('invalid_request', 'Unknown mode.');
    const topic = String(raw.topic_code ?? '');
    if (!topicCodes.has(topic)) throw new AdmissionError('invalid_request', 'Unknown topic.');
    const seconds = raw.seconds === undefined || raw.seconds === null ? null : integer(raw.seconds, 'Seconds', 0, 7200);
    const hints = raw.hints_used === undefined ? 0 : integer(raw.hints_used, 'Hints used', 0, 10);
    if (JSON.stringify(raw.response ?? null).length > 10_000) throw new AdmissionError('invalid_request', 'The answer is too long.');
    const found = await repository.itemWithKey(itemId);
    if (!found || !knownTopics(taxonomy, found.item.classification?.topics ?? []).includes(topic)) throw new AdmissionError('not_found', 'Question not found.', 404);
    if (!AUTO_GRADED.has(found.item.type)) throw new AdmissionError('unsupported_question', 'This question type is not checked automatically.', 422);
    if (mode !== 'diagnostic') await requireAllowance(user, await access(token), now());
    const graded = await grade(user, { clientId, itemId, topic, mode, response: raw.response, seconds, hints }, found);
    return {
      replayed: graded.stored.replayed,
      correct: graded.stored.answer.correct,
      error_kind: graded.stored.answer.error_kind,
      correct_answer: revealedAnswer(found.key),
      solution: found.key.solution ?? null,
      mastery: { before: graded.before, after: graded.after },
    };
  }

  // ---- Exam path ----
  async function saveMilestone(user: string, body: unknown, id?: string) {
    const at = now();
    const existing = id ? (await repository.milestones(user)).find((row) => row.id === id) : undefined;
    if (id && !existing) throw new AdmissionError('not_found', 'Exam not found.', 404);
    const input = validateMilestone(body, at, existing);
    // Keep the prediction shown when a result is reported, to calibrate predictions later.
    if (input.status === 'done' && existing?.status !== 'done') {
      const goal = await repository.goal(user);
      if (goal) input.predicted = predictSection(taxonomy, format, goal.section_id, await repository.mastery(user), at);
    }
    await repository.saveMilestone(user, input, id);
    await repository.clearPlan(user, tashkentDate(at));
    return journey(user, at);
  }

  // ---- Weekly mock ----
  async function publicMock(row: MockRow) {
    const items = await Promise.all(row.items.map(async (entry) => ({ ...entry, item: (await repository.itemWithKey(entry.item_version_id))?.item ?? null })));
    return { id: row.id, week: row.week, section_id: row.section_id, deadline_at: row.deadline_at, submitted: !!row.submitted_at, items: items.filter((entry) => entry.item), answers: row.answers };
  }

  async function startMock(user: string, token: string) {
    const goal = await repository.goal(user);
    if (!goal) throw new AdmissionError('goal_required', 'Set your goal first.', 409);
    if ((await access(token)) === 'free') throw new AdmissionError('plus_required', 'The weekly mock is part of the full subscription.', 402);
    const at = now(), week = weekOf(tashkentDate(at));
    const existing = await repository.mock(user, week);
    if (existing) return existing.submitted_at ? await mockResult(user, existing) : await publicMock(existing);
    const blueprint = mockBlueprint(taxonomy, format, goal.section_id, await counts(goal.question_locale));
    if (!blueprint.size) throw new AdmissionError('no_questions', 'There are not enough questions for a mock yet.', 404);
    const items: MockRow['items'] = [];
    for (const [topic, n] of blueprint) {
      const pool = [...await repository.candidates(topic, goal.question_locale, 200)].filter((row) => AUTO_GRADED.has(row.item.type));
      for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
      for (const row of pool.slice(0, n)) items.push({ item_version_id: row.id, topic_code: topic });
    }
    // Interleave topics in programme order, as an exam paper would.
    const order = new Map(taxonomy.topics.map((topic, index) => [topic.code, index]));
    items.sort((a, b) => (order.get(a.topic_code) ?? 0) - (order.get(b.topic_code) ?? 0));
    const row = await repository.createMock(user, { week, section_id: goal.section_id, question_locale: goal.question_locale, items, answers: {}, deadline_at: new Date(at.getTime() + mockMinutes(items.length) * 60_000).toISOString() });
    return row.submitted_at ? await mockResult(user, row) : await publicMock(row);
  }

  async function saveMockAnswer(user: string, body: unknown) {
    const raw = record(body), id = uuid(raw.mock_id, 'mock_id'), itemId = uuid(raw.item_version_id, 'item_version_id');
    if (JSON.stringify(raw.response ?? null).length > 10_000) throw new AdmissionError('invalid_request', 'The answer is too long.');
    const row = await repository.mock(user, weekOf(tashkentDate(now())));
    if (!row || row.id !== id) throw new AdmissionError('not_found', 'Mock not found.', 404);
    if (row.submitted_at) throw new AdmissionError('mock_submitted', 'This mock is already submitted.', 409);
    if (Date.parse(row.deadline_at) + MOCK_GRACE_MS < now().getTime()) throw new AdmissionError('mock_expired', 'Time is up for this mock.', 409);
    if (!row.items.some((entry) => entry.item_version_id === itemId)) throw new AdmissionError('not_found', 'Question not in this mock.', 404);
    await repository.saveMockAnswers(user, id, { ...row.answers, [itemId]: raw.response ?? null });
    return { saved: true };
  }

  async function mockResult(user: string, row: MockRow) {
    const others = await repository.weekScores(user, row.week, row.section_id);
    const review = await Promise.all((row.results ?? []).map(async (entry) => {
      const found = await repository.itemWithKey(entry.item_version_id);
      return { ...entry, item: found?.item ?? null, response: row.answers[entry.item_version_id] ?? null, correct_answer: found ? revealedAnswer(found.key) : null, solution: found?.key.solution ?? null };
    }));
    const byTopic = new Map<string, { correct: number; total: number }>();
    for (const entry of row.results ?? []) {
      const current = byTopic.get(entry.topic_code) ?? { correct: 0, total: 0 };
      byTopic.set(entry.topic_code, { correct: current.correct + (entry.correct ? 1 : 0), total: current.total + 1 });
    }
    return {
      id: row.id, week: row.week, section_id: row.section_id, submitted: true,
      correct: row.correct, total: row.items.length, points: row.points, max_points: row.max_points,
      percentile: percentile(row.points ?? 0, others), participants: others.length + 1,
      topics: [...byTopic].map(([topic_code, value]) => ({ topic_code, ...value })),
      review,
    };
  }

  async function submitMock(user: string, body: unknown) {
    const raw = record(body), id = uuid(raw.mock_id, 'mock_id');
    const week = weekOf(tashkentDate(now()));
    let row = await repository.mock(user, week);
    if (!row || row.id !== id) throw new AdmissionError('not_found', 'Mock not found.', 404);
    if (!row.submitted_at) {
      const results: NonNullable<MockRow['results']> = [];
      // Time spent counts towards today's minutes, shared across the mock's questions.
      const perQuestion = Math.min(7200, Math.max(0, Math.round((now().getTime() - Date.parse(row.started_at)) / 1000 / Math.max(1, row.items.length))));
      for (const entry of row.items) {
        const found = await repository.itemWithKey(entry.item_version_id);
        if (!found) continue;
        const response = row.answers[entry.item_version_id];
        if (response === undefined || response === null || response === '') {
          results.push({ ...entry, correct: false });
          continue;
        }
        const graded = await grade(user, { clientId: await derivedId(row.id, entry.item_version_id), itemId: entry.item_version_id, topic: entry.topic_code, mode: 'mock', response, seconds: Number.isFinite(perQuestion) ? perQuestion : null, hints: 0 }, found);
        results.push({ ...entry, correct: graded.stored.answer.correct });
      }
      const correct = results.filter((entry) => entry.correct).length;
      // The mock has the official question count when the bank allows; points scale to the
      // section maximum either way. No penalty for wrong answers until the rule is verified.
      const section = findSection(format, row.section_id), max = round1(section.questions * section.points_per_question);
      const points = round1(max * correct / Math.max(1, row.items.length));
      await repository.submitMock(user, id, { correct, points, max_points: max, results });
      row = (await repository.mock(user, week))!;
    }
    return mockResult(user, row);
  }

  return async (req: Request): Promise<Response> => {
    const requestId = crypto.randomUUID(), origin = req.headers.get('origin');
    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Request-ID': requestId, Vary: 'Origin' };
    if (origin && allowedOrigins.includes(origin)) {
      headers['Access-Control-Allow-Origin'] = origin;
      headers['Access-Control-Allow-Headers'] = 'authorization, apikey, content-type';
      headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
    }
    const json = (status: number, value: unknown) => new Response(JSON.stringify(value), { status, headers });
    if (origin && !allowedOrigins.includes(origin)) return json(403, { code: 'origin_denied', error: 'Origin is not allowed', request_id: requestId });
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (!options.enabled) return json(503, { code: 'not_enabled', error: 'Schood Admission is not open yet.', request_id: requestId });
    try {
      const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
      const user = token ? await repository.user(token) : null;
      if (!user) return json(401, { code: 'unauthorized', error: 'Sign in to continue.', request_id: requestId });
      const url = new URL(req.url), route = url.pathname.replace(/^.*\/admission\/?/, '');
      const body = () => req.json().catch(() => null);
      if (req.method === 'GET' && route === 'state') return json(200, await state(user, token));
      if (req.method === 'PUT' && route === 'goal') {
        await repository.saveGoal(user, validateGoal(await body(), format, now()));
        await repository.clearPlan(user, tashkentDate(now()));
        return json(200, await state(user, token));
      }
      if (req.method === 'GET' && route === 'question') return json(200, await question(user, token, url));
      if (req.method === 'POST' && route === 'answer') return json(200, await answer(user, token, await body()));
      if (req.method === 'POST' && route === 'milestones') return json(200, await saveMilestone(user, await body()));
      const milestone = /^milestones\/([0-9a-f-]{36})$/i.exec(route);
      if (milestone && req.method === 'PUT') return json(200, await saveMilestone(user, await body(), uuid(milestone[1], 'id')));
      if (milestone && req.method === 'DELETE') {
        if (!await repository.deleteMilestone(user, uuid(milestone[1], 'id'))) throw new AdmissionError('not_found', 'Exam not found.', 404);
        await repository.clearPlan(user, tashkentDate(now()));
        return json(200, await journey(user, now()));
      }
      if (req.method === 'POST' && route === 'mock') return json(200, await startMock(user, token));
      if (req.method === 'PUT' && route === 'mock/answer') return json(200, await saveMockAnswer(user, await body()));
      if (req.method === 'POST' && route === 'mock/submit') return json(200, await submitMock(user, await body()));
      return json(404, { code: 'not_found', error: 'Not found', request_id: requestId });
    } catch (cause) {
      if (cause instanceof AdmissionError) return json(cause.status, { code: cause.code, error: cause.message, ...cause.details, request_id: requestId });
      console.error(JSON.stringify({ request_id: requestId, error: String(cause) }));
      return json(500, { code: 'internal_error', error: 'Something went wrong.', request_id: requestId });
    }
  };
}
