import { scoreResponse, type AnswerKey, type Item } from '../../../packages/assessment-core/src/mod.ts';
import {
  buildDailyPlan, classifyError, DIFFICULTY_LOGIT, findSection, initialMastery, knownTopics, masteryLevel, predictSection,
  targetDifficulty, updateMastery, UZ_ADMISSION_2026, UZ_MATH_TOPICS,
  type Difficulty, type ExamFormat, type MasteryState, type PlanTask, type Taxonomy,
} from '../../../packages/subject-core/src/mod.ts';

// Schood Admission API: goal, daily plan, practice questions, answers and prediction.
// Questions are approved Assessment Cloud item versions in the Schood content
// workspace. Answer keys and worked solutions never leave the server before the
// learner has answered.

export const SUBJECT = 'math';
export const MATH_SECTIONS = ['compulsory_math', 'specialised_1', 'specialised_2'] as const;
export type Mode = 'diagnostic' | 'practice' | 'review';

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
  answeredSince(user: string, since: Date): Promise<{ topic_code: string; correct: boolean; mode: Mode }[]>;
  recentItems(user: string, limit: number): Promise<string[]>;
  candidates(topic: string, locale: 'uz' | 'ru', limit: number): Promise<Candidate[]>;
  /** Topic codes that have at least one approved question in this language. */
  coveredTopics(locale: 'uz' | 'ru'): Promise<Set<string>>;
  itemWithKey(itemVersionId: string): Promise<{ item: Item; key: AnswerKey } | null>;
  /** Throws an error with code `mastery_conflict` when the stored attempts differ from `expectedAttempts`. */
  recordAnswer(user: string, topic: string, answer: AnswerInput, expectedAttempts: number, state: MasteryState): Promise<{ replayed: boolean; answer: StoredAnswer }>;
}

export class AdmissionError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

export interface AdmissionOptions {
  enabled: boolean;
  format?: ExamFormat;
  taxonomy?: Taxonomy;
  now?: () => Date;
  random?: () => number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DAY = 86_400_000;
const AUTO_GRADED = new Set(['single_choice', 'multi_choice', 'true_false', 'numeric', 'short_answer', 'ordering', 'matching', 'gap_fill']);
const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

/** Calendar day in Tashkent (UTC+5, no daylight saving): plans change at local midnight. */
export function tashkentDate(now: Date): string {
  return new Date(now.getTime() + 5 * 3_600_000).toISOString().slice(0, 10);
}
function tashkentMidnight(now: Date): Date {
  return new Date(Date.parse(`${tashkentDate(now)}T00:00:00Z`) - 5 * 3_600_000);
}
const round1 = (value: number) => Math.round(value * 10) / 10;

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

export function validateGoal(value: unknown, format: ExamFormat, now: Date): Goal {
  const raw = record(value);
  const section = String(raw.section_id ?? '');
  if (!(MATH_SECTIONS as readonly string[]).includes(section)) throw new AdmissionError('invalid_goal', 'Choose the exam section you sit Maths in.');
  findSection(format, section);
  if (raw.question_locale !== 'uz' && raw.question_locale !== 'ru') throw new AdmissionError('invalid_goal', 'Questions are available in Uzbek or Russian.');
  const minutes = integer(raw.daily_minutes ?? 30, 'Daily minutes', 10, 120, 'invalid_goal');
  let examDate: string | null = null;
  if (raw.exam_date !== undefined && raw.exam_date !== null && raw.exam_date !== '') {
    if (typeof raw.exam_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw.exam_date) || Number.isNaN(Date.parse(raw.exam_date))) throw new AdmissionError('invalid_goal', 'Exam date must be a date.');
    const days = (Date.parse(raw.exam_date) - Date.parse(tashkentDate(now))) / DAY;
    if (days < 0 || days > 3 * 366) throw new AdmissionError('invalid_goal', 'Exam date must be within the next three years.');
    examDate = raw.exam_date;
  }
  let target: number | null = null;
  if (raw.target_points !== undefined && raw.target_points !== null && raw.target_points !== '') {
    const max = findSection(format, section).questions * findSection(format, section).points_per_question;
    if (typeof raw.target_points !== 'number' || !(raw.target_points >= 0 && raw.target_points <= max)) throw new AdmissionError('invalid_goal', `Target must be from 0 to ${round1(max)} points.`);
    target = round1(raw.target_points);
  }
  return { section_id: section, question_locale: raw.question_locale, daily_minutes: minutes, exam_date: examDate, target_points: target, exam_code: format.exam_code, format_version: format.version };
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

/** The key's correct answer in a shape the app can show after answering. */
function revealedAnswer(key: AnswerKey): unknown {
  return key.numeric ? key.numeric.value : key.correct ?? null;
}

export function createAdmissionHandler(repository: AdmissionRepository, allowedOrigins: string[], options: AdmissionOptions) {
  const format = options.format ?? UZ_ADMISSION_2026, taxonomy = options.taxonomy ?? UZ_MATH_TOPICS;
  const now = options.now ?? (() => new Date()), random = options.random ?? Math.random;
  const topicCodes = new Set(taxonomy.topics.map((topic) => topic.code));
  // Which topics have questions changes only when content is approved; cache it briefly per language.
  const coverage = new Map<string, { at: number; topics: Promise<Set<string>> }>();
  function covered(locale: 'uz' | 'ru'): Promise<Set<string>> {
    const cached = coverage.get(locale), at = now().getTime();
    if (cached && at - cached.at < 300_000) return cached.topics;
    const topics = repository.coveredTopics(locale);
    coverage.set(locale, { at, topics });
    topics.catch(() => coverage.delete(locale));
    return topics;
  }

  async function state(user: string) {
    const at = now(), goal = await repository.goal(user);
    const mastery = await repository.mastery(user);
    const available = goal ? await covered(goal.question_locale) : new Set<string>();
    const topics = taxonomy.topics.map((topic) => {
      const row = mastery.get(topic.code);
      return { code: topic.code, level: Math.round(masteryLevel(row ?? initialMastery(), at) * 100) / 100, attempts: row?.attempts ?? 0, due: !!row?.next_review_at && Date.parse(row.next_review_at) <= at.getTime(), has_questions: available.has(topic.code) };
    });
    if (!goal) return { goal: null, topics, plan: null, prediction: null, diagnostic: null, content: null };
    const date = tashkentDate(at);
    const remaining = diagnosticTopics(taxonomy, format, goal, mastery, available);
    const total = blockTopics(taxonomy, format, goal, available).length;
    const diagnostic = { remaining: remaining.length, total, done: remaining.length === 0 };
    const prediction = predictSection(taxonomy, format, goal.section_id, mastery, at);
    const content = { topics_with_questions: available.size };
    // The day's plan is made from diagnostic results, so it waits until the diagnostic is done.
    if (!diagnostic.done) return { goal, topics, plan: null, prediction, diagnostic, content };
    let tasks = await repository.plan(user, date);
    if (!tasks) {
      tasks = buildDailyPlan({ taxonomy, format, sectionId: goal.section_id, mastery, now: at, examDate: goal.exam_date ? new Date(`${goal.exam_date}T00:00:00+05:00`) : null, minutes: goal.daily_minutes, available });
      tasks = await repository.savePlan(user, date, tasks);
    }
    // Diagnostic answers are not practice: only practice and review count towards the day's tasks.
    const today = (await repository.answeredSince(user, tashkentMidnight(at))).filter((row) => row.mode !== 'diagnostic');
    const done = (code: string) => today.filter((row) => row.topic_code === code).length;
    return {
      goal,
      topics,
      plan: { date, tasks: tasks.map((task) => ({ ...task, answered: Math.min(task.questions, done(task.topic_code)) })), answered_today: today.length },
      prediction,
      diagnostic,
      content,
    };
  }

  async function question(user: string, url: URL) {
    const goal = await repository.goal(user);
    if (!goal) throw new AdmissionError('goal_required', 'Set your goal first.', 409);
    const mode = url.searchParams.get('mode') ?? 'practice';
    if (!['diagnostic', 'practice', 'review'].includes(mode)) throw new AdmissionError('invalid_request', 'Unknown mode.');
    const mastery = await repository.mastery(user);
    let topic = url.searchParams.get('topic') ?? '';
    if (mode === 'diagnostic') {
      topic = diagnosticTopics(taxonomy, format, goal, mastery, await covered(goal.question_locale))[0] ?? '';
      if (!topic) return { done: true };
    } else if (!topicCodes.has(topic)) throw new AdmissionError('invalid_request', 'Unknown topic.');
    const recent = new Set(await repository.recentItems(user, 60));
    const target = mode === 'diagnostic' ? 'medium' : targetDifficulty(mastery.get(topic) ?? initialMastery());
    const picked = pickQuestion(await repository.candidates(topic, goal.question_locale, 200), recent, target, random);
    if (!picked) throw new AdmissionError('no_questions', 'There are no questions for this topic yet.', 404);
    return { done: false, mode, topic_code: topic, item_version_id: picked.id, item: picked.item };
  }

  async function answer(user: string, body: unknown) {
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
    const score = scoreResponse(found.item, found.key, raw.response);
    const correct = score.status === 'scored' && score.score === score.max_score;
    const difficulty = DIFFICULTY_LOGIT[found.item.classification?.estimated_difficulty ?? 'medium'];
    for (let attempt = 0; ; attempt++) {
      const at = now(), before = (await repository.mastery(user)).get(topic) ?? initialMastery();
      const error_kind = correct ? null : classifyError(before, at, difficulty);
      const after = updateMastery(before, { correct, difficulty, at, hints_used: hints });
      try {
        const stored = await repository.recordAnswer(user, topic, { client_answer_id: clientId, item_version_id: itemId, mode, difficulty, correct, error_kind, response: raw.response ?? null, seconds, hints_used: hints }, before.attempts, after);
        const final = stored.replayed ? (await repository.mastery(user)).get(topic) ?? after : after;
        return {
          replayed: stored.replayed,
          correct: stored.answer.correct,
          error_kind: stored.answer.error_kind,
          correct_answer: revealedAnswer(found.key),
          solution: found.key.solution ?? null,
          mastery: { before: Math.round(masteryLevel(before, at) * 100) / 100, after: Math.round(masteryLevel(final, at) * 100) / 100 },
        };
      } catch (cause) {
        if ((cause as { code?: string }).code === 'mastery_conflict' && attempt < 2) continue;
        throw cause;
      }
    }
  }

  return async (req: Request): Promise<Response> => {
    const requestId = crypto.randomUUID(), origin = req.headers.get('origin');
    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Request-ID': requestId, Vary: 'Origin' };
    if (origin && allowedOrigins.includes(origin)) {
      headers['Access-Control-Allow-Origin'] = origin;
      headers['Access-Control-Allow-Headers'] = 'authorization, apikey, content-type';
      headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, OPTIONS';
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
      if (req.method === 'GET' && route === 'state') return json(200, await state(user));
      if (req.method === 'PUT' && route === 'goal') {
        await repository.saveGoal(user, validateGoal(await req.json().catch(() => null), format, now()));
        await repository.clearPlan(user, tashkentDate(now()));
        return json(200, await state(user));
      }
      if (req.method === 'GET' && route === 'question') return json(200, await question(user, url));
      if (req.method === 'POST' && route === 'answer') return json(200, await answer(user, await req.json().catch(() => null)));
      return json(404, { code: 'not_found', error: 'Not found', request_id: requestId });
    } catch (cause) {
      if (cause instanceof AdmissionError) return json(cause.status, { code: cause.code, error: cause.message, request_id: requestId });
      console.error(JSON.stringify({ request_id: requestId, error: String(cause) }));
      return json(500, { code: 'internal_error', error: 'Something went wrong.', request_id: requestId });
    }
  };
}
