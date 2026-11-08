// Tracks and the lesson player: content without answer keys, server-side
// checking, progress in company_lesson_progress and `lesson` activity. Browsing
// the tracks is open to everyone; the lessons themselves need a learning seat.
// Company courses (`c-<id>`) and their lessons (`co-<id>`) go through the same routes
// and the same player; a learner's progress is keyed by the lesson's id, so it stays
// across new versions.
import { logActivity } from '../core.ts';
import { fetchAll } from '../people/shared.ts';
import { check, CompanyError, type Ctx, type Route } from '../types.ts';
import { obj } from '../util.ts';
import { awardAfterLesson } from './certificates.ts';
import { normalizeAnswer, type Exercise, type Lesson, type Localized, type Track } from './content.ts';
import { courseIdOf, lessonIdOf, liveCourses, resolveScenario, type CustomLesson, type LiveCourse, type LiveLesson } from './custom.ts';
import { missionView } from './missions.ts';
import { canLearn, learner, minutesSpent, requireSeat, seatReason, selfReportedMinutes } from './shared.ts';
import { findLesson, findTrack, TRACKS } from './tracks/index.ts';

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

export function checkLesson(lesson: Pick<Lesson, 'exercises'>, answers: Record<string, unknown>) {
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
  return await fetchAll<ProgressRow>(() => ctx.db.from('company_lesson_progress').select(PROGRESS_COLUMNS).eq('member_id', memberId).order('id'), 10_000);
}

/** Company lessons have a CEFR level rather than a stage; this keeps the player's badge meaningful. */
const stageOf = (content: Pick<CustomLesson, 'level'>): 'foundation' | 'professional' => ['pre_a1', 'a1', 'a2', 'b1'].includes(content.level) ? 'foundation' : 'professional';

export function courseSummary(course: LiveCourse) {
  return { code: course.code, title: course.title, summary: course.summary, lessons: course.lessons.length, foundation: 0, professional: 0, scenarios: 0, templates: 0, company: true };
}

/** What the routes need to know about a lesson, whichever kind it is. */
interface Resolved {
  track: { code: string; title: Localized; lessons: number };
  trackCode: string; code: string; index: number; next: string | null; previous: string | null;
  lesson: { stage: string; level: string; title: Localized; goal: Localized; phrases: unknown[]; words: unknown[]; dialogue: unknown; exercises: Exercise[] };
  mission: ReturnType<typeof missionView>;
  version: number | null;
}

async function resolveLesson(ctx: Ctx, code: string, trackHint: string | null): Promise<Resolved> {
  const builtIn = findLesson(code);
  if (builtIn) {
    const { track, lesson, index } = builtIn;
    return {
      track: { code: track.code, title: track.title, lessons: track.lessons.length }, trackCode: track.code, code: lesson.code, index,
      next: track.lessons[index + 1]?.code ?? null, previous: track.lessons[index - 1]?.code ?? null,
      lesson, mission: missionView(lesson.mission), version: null,
    };
  }
  if (lessonIdOf(code)) {
    const courses = await liveCourses(ctx);
    const inCourse = courses.filter((course) => course.lessons.some((lesson) => lesson.code === code));
    const course = inCourse.find((entry) => entry.code === trackHint) ?? inCourse[0];
    if (course) {
      const index = course.lessons.findIndex((lesson) => lesson.code === code);
      const live: LiveLesson = course.lessons[index];
      const content = live.content;
      const mission = content.mission;
      const scenario = mission?.kind === 'roleplay' && mission.scenario ? await resolveScenario(ctx, mission.scenario) : null;
      return {
        track: { code: course.code, title: course.title, lessons: course.lessons.length }, trackCode: course.code, code, index,
        next: course.lessons[index + 1]?.code ?? null, previous: course.lessons[index - 1]?.code ?? null,
        lesson: { stage: stageOf(content), level: content.level, title: content.title, goal: content.goal, phrases: content.phrases, words: content.words, dialogue: content.dialogue, exercises: content.exercises },
        mission: missionView(mission, scenario?.custom ? scenario.scenario.title : null), version: live.version,
      };
    }
  }
  throw new CompanyError('lesson_not_found', 'No such lesson.', 404);
}

export const routes: Route[] = [
  {
    method: 'GET', path: 'orgs/:org/tracks', access: 'org', allowSuspended: true,
    async handle(ctx) {
      const progress = ctx.member ? await memberProgress(ctx, ctx.member.id) : [];
      const courses = await liveCourses(ctx);
      return {
        recommended: ctx.member?.job_role ?? 'general',
        can_learn: canLearn(ctx),
        seat_reason: seatReason(ctx),
        tracks: TRACKS.map((track) => {
          const mine = progress.filter((row) => row.track_code === track.code);
          return { ...trackSummary(track), completed: mine.filter((row) => row.status === 'completed').length, started: mine.length };
        }),
        courses: courses.map((course) => {
          const mine = progress.filter((row) => course.lessons.some((lesson) => lesson.code === row.lesson_code));
          return { ...courseSummary(course), completed: mine.filter((row) => row.status === 'completed').length, started: mine.length };
        }),
      };
    },
  },
  {
    method: 'GET', path: 'orgs/:org/tracks/:track', access: 'org', allowSuspended: true,
    async handle(ctx, params) {
      if (courseIdOf(params.track)) {
        const course = (await liveCourses(ctx)).find((entry) => entry.code === params.track);
        if (!course) throw new CompanyError('track_not_found', 'No such track.', 404);
        const progress = ctx.member ? await memberProgress(ctx, ctx.member.id) : [];
        return {
          can_learn: canLearn(ctx),
          seat_reason: seatReason(ctx),
          track: courseSummary(course),
          lessons: course.lessons.map((lesson) => {
            const row = progress.find((entry) => entry.lesson_code === lesson.code);
            const taken = row?.data?.version;
            return {
              code: lesson.code, stage: stageOf(lesson.content), level: lesson.content.level, title: lesson.content.title, goal: lesson.content.goal,
              mission: lesson.content.mission?.kind ?? 'task', status: row?.status ?? 'new', score: row?.score ?? null,
              updated: row?.status === 'completed' && typeof taken === 'number' && taken < lesson.version,
            };
          }),
          scenarios: [], templates: [],
        };
      }
      const track = findTrack(params.track);
      if (!track) throw new CompanyError('track_not_found', 'No such track.', 404);
      const progress = ctx.member ? await memberProgress(ctx, ctx.member.id) : [];
      return {
        can_learn: canLearn(ctx),
        seat_reason: seatReason(ctx),
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
    // Needs a working seat, and a paused or ended workspace has none: the page says why (seat_required carries a reason).
    method: 'GET', path: 'orgs/:org/learn/:lesson', access: 'org',
    async handle(ctx, params, _body, query) {
      requireSeat(ctx);
      const found = await resolveLesson(ctx, params.lesson, query.get('track'));
      const { lesson, code } = found;
      const row = ctx.member
        ? check<ProgressRow | null>(await ctx.db.from('company_lesson_progress').select(PROGRESS_COLUMNS).eq('member_id', ctx.member.id).eq('lesson_code', code).maybeSingle())
        : null;
      const taken = row?.data?.version;
      return {
        track: found.track,
        position: found.index + 1,
        next: found.next,
        previous: found.previous,
        lesson: {
          code, stage: lesson.stage, level: lesson.level, title: lesson.title, goal: lesson.goal,
          phrases: lesson.phrases, words: lesson.words, dialogue: lesson.dialogue,
          exercises: lesson.exercises.map((exercise) => publicExercise(exercise, code)),
          mission: found.mission,
          version: found.version,
        },
        progress: row ? { status: row.status, score: row.score, attempts: row.attempts, minutes: row.minutes, step: row.data?.step ?? null, results: row.data?.results ?? null, updated: row.status === 'completed' && found.version !== null && typeof taken === 'number' && taken < found.version } : null,
        pass_score: PASS_SCORE,
      };
    },
  },
  {
    // Opening a lesson (or moving to a new step) remembers where the learner is, for "Continue".
    method: 'POST', path: 'orgs/:org/learn/:lesson/start', access: 'org',
    async handle(ctx, params, body, query) {
      const member = learner(ctx);
      requireSeat(ctx);
      const found = await resolveLesson(ctx, params.lesson, query.get('track'));
      const track = { code: found.trackCode }, lesson = { code: found.code };
      const input = body === undefined ? {} : obj(body);
      const step = ['phrases', 'words', 'dialogue', 'exercises', 'results'].includes(String(input.step)) ? String(input.step) : 'phrases';
      const existing = check<ProgressRow | null>(await ctx.db.from('company_lesson_progress').select(PROGRESS_COLUMNS).eq('member_id', member.id).eq('lesson_code', lesson.code).maybeSingle());
      if (existing) {
        check(await ctx.db.from('company_lesson_progress').update({ data: { ...existing.data, step } }).eq('id', existing.id));
        return { status: existing.status, step };
      }
      const created = await ctx.db.from('company_lesson_progress').insert({
        org_id: ctx.org!.id, member_id: member.id, user_id: ctx.user, track_code: track.code, lesson_code: lesson.code,
        status: 'started', minutes: 0, attempts: 0, data: { step },
      });
      // Opened twice at once: the other request made the row, and that is all this one wanted.
      if (created.error?.code !== '23505') check(created);
      return { status: 'started', step };
    },
  },
  {
    method: 'POST', path: 'orgs/:org/learn/:lesson/check', access: 'org',
    async handle(ctx, params, body, query) {
      const member = learner(ctx);
      requireSeat(ctx);
      const found = await resolveLesson(ctx, params.lesson, query.get('track'));
      const track = { code: found.trackCode }, lesson = { code: found.code, exercises: found.lesson.exercises };
      const input = obj(body);
      // A company may publish while someone is answering. Grade only the version
      // the current player displayed. Omitted versions remain valid for one deploy
      // so older clients keep working while the new frontend rolls out.
      if (found.version !== null && input.version !== undefined && input.version !== found.version) {
        throw new CompanyError('lesson_updated', 'This lesson was updated while you were working. Reopen it to answer the current exercises.', 409, { version: found.version });
      }
      const answers = input.answers && typeof input.answers === 'object' && !Array.isArray(input.answers) ? input.answers as Record<string, unknown> : {};
      const asked = minutesSpent(input.minutes);
      const result = checkLesson(lesson, answers);
      const passed = result.score >= PASS_SCORE;
      const now = ctx.now().toISOString();
      const read = () => ctx.db.from('company_lesson_progress').select(PROGRESS_COLUMNS).eq('member_id', member.id).eq('lesson_code', lesson.code).maybeSingle();
      let existing = check<ProgressRow | null>(await read());
      if (!existing) {
        // Two first checks at once: the unique index lets one create the row, the other uses it.
        const created = await ctx.db.from('company_lesson_progress').insert({
          org_id: ctx.org!.id, member_id: member.id, user_id: ctx.user, track_code: track.code, lesson_code: lesson.code, status: 'started', minutes: 0, attempts: 0, data: {},
        }).select(PROGRESS_COLUMNS).single();
        existing = created.error?.code === '23505' ? check<ProgressRow>(await read()) : check<ProgressRow>(created);
      }
      // One 'lesson' per lesson completed, so KPIs and challenges count lessons, not clicks on
      // Check. The database picks the one request that completes it; a passing check that loses
      // that race is a retry like any other.
      let firstCompletion = false;
      if (passed && existing!.status !== 'completed') {
        const claimed = check<{ id: string }[]>(await ctx.db.from('company_lesson_progress').update({ status: 'completed', completed_at: now }).eq('id', existing!.id).neq('status', 'completed').select('id'));
        firstCompletion = claimed.length === 1;
      }
      // Other attempts keep their minutes, up to a daily allowance, and earn no points.
      const minutes = firstCompletion ? asked : await selfReportedMinutes(ctx, member.id, asked);
      const best = Math.max(existing!.score ?? 0, result.score);
      check(await ctx.db.from('company_lesson_progress').update({
        score: best,
        minutes: Math.min(100_000, existing!.minutes + minutes),
        attempts: existing!.attempts + 1,
        data: { ...existing!.data, step: 'results', results: result.results.map(({ id, correct, total }) => ({ id, correct, total })), last_score: result.score, ...(found.version === null ? {} : { version: found.version }) },
      }).eq('id', existing!.id));
      await logActivity(ctx.db, {
        org_id: ctx.org!.id, member_id: member.id, user_id: ctx.user, kind: firstCompletion ? 'lesson' : 'lesson_retry', minutes,
        points: firstCompletion ? Math.round(result.score / 10) + 10 : 0, ref: lesson.code,
      });
      const certificates = firstCompletion ? await awardAfterLesson(ctx, member, lesson.code) : [];
      return { ...result, passed, first_completion: firstCompletion, best, status: passed || existing!.status === 'completed' ? 'completed' : 'started', next: found.next, pass_score: PASS_SCORE, certificates };
    },
  },
];
