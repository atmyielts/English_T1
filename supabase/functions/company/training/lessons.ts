// Tracks and the lesson player: content without answer keys, server-side
// checking, progress in company_lesson_progress and `lesson` activity.
import { logActivity } from '../core.ts';
import { check, CompanyError, type Ctx, type Route } from '../types.ts';
import { obj } from '../util.ts';
import { normalizeAnswer, type Exercise, type Lesson, type Track } from './content.ts';
import { learner, minutesSpent } from './shared.ts';
import { findLesson, findScenario, findTemplate, findTrack, TRACKS } from './tracks/index.ts';

/** Score a lesson must reach to count as completed. */
export const PASS_SCORE = 60;

export interface ProgressRow {
  id: string; org_id: string; member_id: string; user_id: string | null; track_code: string; lesson_code: string;
  status: 'started' | 'completed'; score: number | null; minutes: number; attempts: number; data: Record<string, unknown>;
  completed_at: string | null; created_at?: string; updated_at?: string;
}
export const PROGRESS_COLUMNS = 'id,org_id,member_id,user_id,track_code,lesson_code,status,score,minutes,attempts,data,completed_at,created_at,updated_at';

/** A stable shuffle, so the same exercise looks the same after a reload. */
export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  let state = 2166136261;
  for (const char of seed) state = Math.imul(state ^ char.charCodeAt(0), 16777619) >>> 0;
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...items];
  for (let index = out.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    [out[index], out[swap]] = [out[swap], out[index]];
  }
  // Never hand back the answer already in order.
  if (out.length > 1 && out.every((item, index) => item === items[index])) out.push(out.shift()!);
  return out;
}

/** What the learner sees: no answers, order and match sides shuffled. */
export function publicExercise(exercise: Exercise, lessonCode: string) {
  const seed = `${lessonCode}:${exercise.id}`;
  switch (exercise.kind) {
    case 'choice': return { id: exercise.id, kind: exercise.kind, prompt: exercise.prompt ?? null, items: exercise.items.map((item) => ({ q: item.q, options: item.options })) };
    case 'gap': return { id: exercise.id, kind: exercise.kind, prompt: exercise.prompt ?? null, bank: exercise.bank ? seededShuffle(exercise.bank, seed) : null, items: exercise.items.map((item) => ({ text: item.text })) };
    case 'order': return { id: exercise.id, kind: exercise.kind, prompt: exercise.prompt ?? null, lines: seededShuffle(exercise.lines, seed) };
    case 'match': return { id: exercise.id, kind: exercise.kind, prompt: exercise.prompt ?? null, left: exercise.pairs.map((pair) => pair[0]), right: seededShuffle(exercise.pairs.map((pair) => pair[1]), seed) };
  }
}

export interface ExerciseResult { id: string; correct: number; total: number; items: { ok: boolean; expected: string }[] }

/** Checks one exercise. Missing or malformed answers count as wrong. */
export function checkExercise(exercise: Exercise, answer: unknown): ExerciseResult {
  const given = Array.isArray(answer) ? answer : [];
  let items: { ok: boolean; expected: string }[];
  switch (exercise.kind) {
    case 'choice':
      items = exercise.items.map((item, index) => ({ ok: Number(given[index]) === item.answer && given[index] !== null && given[index] !== '', expected: item.options[item.answer] }));
      break;
    case 'gap':
      items = exercise.items.map((item, index) => {
        const typed = normalizeAnswer(String(given[index] ?? ''));
        return { ok: typed !== '' && item.answers.some((accepted) => normalizeAnswer(accepted) === typed), expected: item.answers[0] };
      });
      break;
    case 'order':
      items = exercise.lines.map((line, index) => ({ ok: typeof given[index] === 'string' && given[index] === line, expected: line }));
      break;
    case 'match':
      items = exercise.pairs.map((pair, index) => ({ ok: typeof given[index] === 'string' && given[index] === pair[1], expected: pair[1] }));
      break;
  }
  return { id: exercise.id, correct: items.filter((item) => item.ok).length, total: items.length, items };
}

export function checkLesson(lesson: Lesson, answers: Record<string, unknown>) {
  const results = lesson.exercises.map((exercise) => checkExercise(exercise, answers[exercise.id]));
  const correct = results.reduce((sum, result) => sum + result.correct, 0);
  const total = results.reduce((sum, result) => sum + result.total, 0);
  return { results, correct, total, score: total ? Math.round(correct / total * 100) : 0 };
}

export function lessonSummary(lesson: Lesson) {
  return { code: lesson.code, stage: lesson.stage, level: lesson.level, title: lesson.title, goal: lesson.goal, mission: lesson.mission.kind };
}
export function trackSummary(track: Track) {
  return {
    code: track.code, title: track.title, summary: track.summary, lessons: track.lessons.length,
    foundation: track.lessons.filter((lesson) => lesson.stage === 'foundation').length,
    professional: track.lessons.filter((lesson) => lesson.stage === 'professional').length,
    scenarios: track.scenarios.length, templates: track.templates.length,
  };
}

export async function memberProgress(ctx: Ctx, memberId: string): Promise<ProgressRow[]> {
  return check<ProgressRow[]>(await ctx.db.from('company_lesson_progress').select(PROGRESS_COLUMNS).eq('member_id', memberId));
}

function missionView(lesson: Lesson) {
  const mission = lesson.mission;
  if (mission.kind === 'roleplay') {
    const found = findScenario(mission.scenario);
    return { kind: mission.kind, code: mission.scenario, title: found?.scenario.title ?? null, brief: mission.brief };
  }
  const found = findTemplate(mission.template);
  return { kind: mission.kind, code: mission.template, title: found?.template.title ?? null, brief: mission.brief };
}

function lessonOr404(code: string) {
  const found = findLesson(code);
  if (!found) throw new CompanyError('lesson_not_found', 'No such lesson.', 404);
  return found;
}

export const routes: Route[] = [
  {
    method: 'GET', path: 'orgs/:org/tracks', access: 'org', allowSuspended: true,
    async handle(ctx) {
      const progress = ctx.member ? await memberProgress(ctx, ctx.member.id) : [];
      return {
        recommended: ctx.member?.job_role ?? 'general',
        tracks: TRACKS.map((track) => {
          const mine = progress.filter((row) => row.track_code === track.code);
          return { ...trackSummary(track), completed: mine.filter((row) => row.status === 'completed').length, started: mine.length };
        }),
      };
    },
  },
  {
    method: 'GET', path: 'orgs/:org/tracks/:track', access: 'org', allowSuspended: true,
    async handle(ctx, params) {
      const track = findTrack(params.track);
      if (!track) throw new CompanyError('track_not_found', 'No such track.', 404);
      const progress = ctx.member ? await memberProgress(ctx, ctx.member.id) : [];
      return {
        track: trackSummary(track),
        lessons: track.lessons.map((lesson) => {
          const row = progress.find((entry) => entry.lesson_code === lesson.code);
          return { ...lessonSummary(lesson), status: row?.status ?? 'new', score: row?.score ?? null };
        }),
        scenarios: track.scenarios.map((scenario) => ({ code: scenario.code, title: scenario.title, difficulty: scenario.difficulty })),
        templates: track.templates.map((template) => ({ code: template.code, title: template.title, kind: template.kind })),
      };
    },
  },
  {
    method: 'GET', path: 'orgs/:org/learn/:lesson', access: 'org', allowSuspended: true,
    async handle(ctx, params) {
      const { track, lesson, index } = lessonOr404(params.lesson);
      const row = ctx.member
        ? check<ProgressRow | null>(await ctx.db.from('company_lesson_progress').select(PROGRESS_COLUMNS).eq('member_id', ctx.member.id).eq('lesson_code', lesson.code).maybeSingle())
        : null;
      return {
        track: { code: track.code, title: track.title, lessons: track.lessons.length },
        position: index + 1,
        next: track.lessons[index + 1]?.code ?? null,
        previous: track.lessons[index - 1]?.code ?? null,
        lesson: {
          code: lesson.code, stage: lesson.stage, level: lesson.level, title: lesson.title, goal: lesson.goal,
          phrases: lesson.phrases, words: lesson.words, dialogue: lesson.dialogue,
          exercises: lesson.exercises.map((exercise) => publicExercise(exercise, lesson.code)),
          mission: missionView(lesson),
        },
        progress: row ? { status: row.status, score: row.score, attempts: row.attempts, minutes: row.minutes, step: row.data?.step ?? null, results: row.data?.results ?? null } : null,
        pass_score: PASS_SCORE,
      };
    },
  },
  {
    // Opening a lesson (or moving to a new step) remembers where the learner is, for "Continue".
    method: 'POST', path: 'orgs/:org/learn/:lesson/start', access: 'org',
    async handle(ctx, params, body) {
      const member = learner(ctx);
      const { track, lesson } = lessonOr404(params.lesson);
      const input = body === undefined ? {} : obj(body);
      const step = ['phrases', 'words', 'dialogue', 'exercises', 'results'].includes(String(input.step)) ? String(input.step) : 'phrases';
      const existing = check<ProgressRow | null>(await ctx.db.from('company_lesson_progress').select(PROGRESS_COLUMNS).eq('member_id', member.id).eq('lesson_code', lesson.code).maybeSingle());
      if (existing) {
        check(await ctx.db.from('company_lesson_progress').update({ data: { ...existing.data, step } }).eq('id', existing.id));
        return { status: existing.status, step };
      }
      check(await ctx.db.from('company_lesson_progress').insert({
        org_id: ctx.org!.id, member_id: member.id, user_id: ctx.user, track_code: track.code, lesson_code: lesson.code,
        status: 'started', minutes: 0, attempts: 0, data: { step },
      }));
      return { status: 'started', step };
    },
  },
  {
    method: 'POST', path: 'orgs/:org/learn/:lesson/check', access: 'org',
    async handle(ctx, params, body) {
      const member = learner(ctx);
      const { track, lesson, index } = lessonOr404(params.lesson);
      const input = obj(body);
      const answers = input.answers && typeof input.answers === 'object' && !Array.isArray(input.answers) ? input.answers as Record<string, unknown> : {};
      const minutes = minutesSpent(input.minutes);
      const result = checkLesson(lesson, answers);
      const passed = result.score >= PASS_SCORE;
      const now = ctx.now().toISOString();
      const existing = check<ProgressRow | null>(await ctx.db.from('company_lesson_progress').select(PROGRESS_COLUMNS).eq('member_id', member.id).eq('lesson_code', lesson.code).maybeSingle());
      const firstCompletion = passed && existing?.status !== 'completed';
      const row = {
        status: existing?.status === 'completed' || passed ? 'completed' : 'started',
        score: Math.max(existing?.score ?? 0, result.score),
        minutes: Math.min(100_000, (existing?.minutes ?? 0) + minutes),
        attempts: (existing?.attempts ?? 0) + 1,
        data: { ...(existing?.data ?? {}), step: 'results', results: result.results.map(({ id, correct, total }) => ({ id, correct, total })), last_score: result.score },
        completed_at: existing?.completed_at ?? (passed ? now : null),
      };
      if (existing) check(await ctx.db.from('company_lesson_progress').update(row).eq('id', existing.id));
      else check(await ctx.db.from('company_lesson_progress').insert({ org_id: ctx.org!.id, member_id: member.id, user_id: ctx.user, track_code: track.code, lesson_code: lesson.code, ...row }));
      await logActivity(ctx.db, {
        org_id: ctx.org!.id, member_id: member.id, user_id: ctx.user, kind: 'lesson', minutes,
        points: Math.round(result.score / 10) + (firstCompletion ? 10 : 0), ref: lesson.code,
      });
      return { ...result, passed, first_completion: firstCompletion, best: row.score, status: row.status, next: track.lessons[index + 1]?.code ?? null, pass_score: PASS_SCORE };
    },
  },
];
