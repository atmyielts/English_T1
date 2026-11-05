import { s } from '../../../../packages/ai-core/src/mod.ts';
import { integer, oneOf, optionalText, record, text, uuid } from '../input.ts';
import { SchoodAIError, type RequestContext } from '../types.ts';
import { loadPrediction, loadProfile } from './tutor.ts';
import { daysBetween, learnerInput, linksFor, ownRecord, practiceLink, receipt, requireLearner, saveRecord, store, systemFor, today, track } from './common.ts';
import type { RecordRow } from './store.ts';

// L5 Study plan: a week-by-week plan to a target score and date, every task linking
// into real Schood practice (the model picks link ids from PRACTICE_LINKS, never
// URLs). L15 Gap-to-target: "you are at X and want Y in N days; these four things
// move you", built from score-prediction and re-checked weekly. Numbers in the
// headline come from the data, never from the model.

export const PLAN_EXAMS = ['ielts', 'toefl', 'sat', 'multilevel', 'english', 'itep'] as const;
const MAX_WEEKS = 16;

const PLAN_SCHEMA = s.object({
  summary: s.string({ max: 800 }),
  weeks: s.array(s.object({
    week: s.number({ min: 1, max: MAX_WEEKS, integer: true }),
    theme: s.string({ max: 120 }),
    goal: s.string({ max: 300 }),
    tasks: s.array(s.object({ title: s.string({ min: 2, max: 200 }), minutes: s.number({ min: 5, max: 600, integer: true }), skill: s.string({ max: 40 }), link_id: s.nullable(s.string({ max: 60 })) }), { min: 1, max: 8 }),
  }), { min: 1, max: MAX_WEEKS }),
});

const linkFor = (id: unknown, exam: string) => {
  const link = practiceLink(id);
  return link && linksFor(exam).some((entry) => entry.id === link.id) ? link : null;
};

export function planView(row: RecordRow) {
  const done = (row.state.done ?? {}) as Record<string, boolean>;
  const weeks = ((row.output.weeks ?? []) as { week: number; theme: string; goal: string; tasks: { title: string; minutes: number; skill: string; link_id: string | null }[] }[]).map((week) => ({
    ...week,
    tasks: week.tasks.map((task, index) => {
      const link = practiceLink(task.link_id);
      return { ...task, index, done: !!done[`${week.week}:${index}`], link: link ? { id: link.id, url: link.url, label: link.label } : null };
    }),
  }));
  const total = weeks.reduce((sum, week) => sum + week.tasks.length, 0), finished = weeks.reduce((sum, week) => sum + week.tasks.filter((task) => task.done).length, 0);
  return { id: row.id, status: row.status, ...row.input, summary: row.output.summary, weeks, progress: { done: finished, total }, created_at: row.createdAt };
}

// POST learner/study-plan { exam, target, exam_date?, hours_per_week, current?, focus?, replan? }
export async function buildPlan(ctx: RequestContext) {
  const body = record(await ctx.body());
  const access = await requireLearner(ctx, 'study_plan.build');
  const exam = oneOf(body.exam, 'exam', PLAN_EXAMS);
  const target = text(body.target, 'target', { max: 20 });
  const examDate = body.exam_date === undefined || body.exam_date === null || body.exam_date === '' ? null : text(body.exam_date, 'exam_date', { max: 10 });
  if (examDate && (!/^\d{4}-\d{2}-\d{2}$/.test(examDate) || daysBetween(ctx.now(), examDate) < 1)) throw new SchoodAIError('invalid_request', 'The exam date must be in the future.', 400, { field: 'exam_date' });
  const hours = integer(body.hours_per_week, 'hours_per_week', 1, 40);
  const current = optionalText(body.current, 'current', { max: 20 });
  const focus = optionalText(body.focus, 'focus', { max: 300 });
  const weeks = examDate ? Math.max(1, Math.min(MAX_WEEKS, Math.ceil(daysBetween(ctx.now(), examDate) / 7))) : 8;
  const previous = (await store(ctx).records(ctx.user.id, { kind: 'plan', workspaceId: access.workspace.id, limit: 1, status: ['active'] }))[0] ?? null;
  const progress = body.replan === true && previous ? planView(previous).weeks.map((week) => ({ week: week.week, done: week.tasks.filter((task) => task.done).map((task) => task.title), missed: week.tasks.filter((task) => !task.done).map((task) => task.title) })) : null;
  const blocks = await ctx.context(['learner_profile', 'learner_prediction', 'learner_snapshot', 'learner_activity'], { specialist: 'study_plan' });
  const links = linksFor(exam);
  const out = await ctx.ai.json({
    key: 'study_plan.build', schema: PLAN_SCHEMA, maxTokens: 3500, temperature: 0.4,
    messages: [
      { role: 'system', content: systemFor(ctx, access, { name: 'Study planner', instructions: [
        `Build a ${weeks}-week study plan for ${exam.toUpperCase()} to reach ${target}${examDate ? ` by ${examDate}` : ''}, with about ${hours} hours a week (task minutes in a week must add up to no more than ${hours * 60}).`,
        'Start from the learner\'s weak spots in the reference data; build up to full mocks in the last weeks. Each week: a theme, a goal, and 3-6 tasks.',
        `Each task may link to one Schood practice page by link_id, chosen ONLY from this list (or null): ${links.map((link) => `${link.id} (${link.label})`).join('; ')}.`,
        progress ? 'This is a re-plan: keep what worked, move missed tasks forward, and adjust to the time left.' : '',
        'Never promise a score.',
      ].filter(Boolean) }, blocks) },
      { role: 'user', content: learnerInput({ exam, target, exam_date: examDate, hours_per_week: hours, current, focus, progress }) },
    ],
  });
  const plan = out.data.weeks.slice(0, weeks).map((week, index) => {
    let budget = hours * 60 * 1.1;
    const tasks = week.tasks.filter((task) => (budget -= task.minutes) >= 0 || task === week.tasks[0]).map((task) => ({ ...task, link_id: linkFor(task.link_id, exam)?.id ?? null }));
    return { week: index + 1, theme: week.theme, goal: week.goal, tasks };
  });
  if (previous) await store(ctx).updateRecord(previous.id, previous.version, { status: 'archived' });
  const row = await store(ctx).createRecord({ userId: ctx.user.id, workspaceId: access.workspace.id, kind: 'plan', status: 'active', credits: out.credits, input: { exam, target, exam_date: examDate, hours_per_week: hours, current, focus, weeks }, output: { summary: out.data.summary, weeks: plan }, state: { done: {} } });
  track(ctx, access, { feature: 'L5', kind: 'plan', summary: { exam, target, exam_date: examDate, weeks }, event: { kind: 'goal_set', skill: `${exam}.plan`, ref: row.id } });
  return { plan: planView(row), ...receipt(out) };
}

// GET learner/study-plan: the active plan (and the last gap report).
export async function currentPlan(ctx: RequestContext) {
  const access = await ctx.workspace();
  const [plan] = await store(ctx).records(ctx.user.id, { kind: 'plan', workspaceId: access.workspace.id, limit: 1, status: ['active'] });
  const [gap] = await store(ctx).records(ctx.user.id, { kind: 'gap', workspaceId: access.workspace.id, limit: 1 });
  return { plan: plan ? planView(plan) : null, gap: gap ? gapView(gap, ctx.now()) : null };
}

// PATCH learner/study-plan { id, week, task, done }: ticks a task (no model call).
export async function tickTask(ctx: RequestContext) {
  const body = record(await ctx.body());
  const access = await ctx.workspace();
  const row = await ownRecord(ctx, access, uuid(body.id, 'id'), 'plan');
  const week = integer(body.week, 'week', 1, MAX_WEEKS), task = integer(body.task, 'task', 0, 7);
  const weeks = (row.output.weeks ?? []) as { week: number; tasks: unknown[] }[];
  if (!weeks.find((entry) => entry.week === week)?.tasks[task]) throw new SchoodAIError('not_found', 'Not found.', 404);
  const done = { ...(row.state.done as Record<string, boolean> ?? {}), [`${week}:${task}`]: body.done === true };
  return { plan: planView(await saveRecord(ctx, row, { state: { ...row.state, done } })) };
}

// --- L15 -------------------------------------------------------------------------------------
const GAP_SCHEMA = s.object({
  drivers: s.array(s.object({ title: s.string({ min: 2, max: 160 }), why: s.string({ max: 400 }), action: s.string({ max: 300 }), link_id: s.nullable(s.string({ max: 60 })) }), { min: 2, max: 4 }),
  note: s.string({ max: 400 }),
});
export function gapView(row: RecordRow, now: Date) {
  const nextCheck = String(row.state.next_check_at ?? '');
  return {
    id: row.id, ...row.output, drivers: ((row.output.drivers ?? []) as { link_id: string | null }[]).map((driver) => { const link = practiceLink(driver.link_id); return { ...driver, link: link ? { url: link.url, label: link.label } : null }; }),
    next_check_at: nextCheck || null, due: !nextCheck || Date.parse(nextCheck) <= now.getTime(), created_at: row.createdAt,
  };
}

// POST learner/gap { exam, target?, exam_date? }: needs a prediction for that exam first (checked before any charge).
export async function gapToTarget(ctx: RequestContext) {
  const body = record(await ctx.body());
  const access = await requireLearner(ctx, 'gap.replan');
  const exam = oneOf(body.exam, 'exam', PLAN_EXAMS);
  const prediction = await loadPrediction(ctx).catch(() => null);
  const forExam = prediction?.predictions.find((entry) => entry.exam.toLowerCase().includes(exam === 'multilevel' ? 'multi' : exam));
  if (!forExam || forExam.current === null) throw new SchoodAIError('no_prediction', 'Take a practice test first so we can see where you are.', 409, { exam });
  const [plan] = await store(ctx).records(ctx.user.id, { kind: 'plan', workspaceId: access.workspace.id, limit: 1, status: ['active'] });
  const target = optionalText(body.target, 'target', { max: 20 }) ?? (plan?.input.exam === exam ? String(plan.input.target ?? '') : '') ?? '';
  const examDate = optionalText(body.exam_date, 'exam_date', { max: 10 }) ?? (plan?.input.exam === exam ? (plan.input.exam_date as string | null) : null);
  if (!target) throw new SchoodAIError('target_required', 'Tell us your target score.', 400, { field: 'target' });
  const days = examDate && /^\d{4}-\d{2}-\d{2}$/.test(examDate) ? daysBetween(ctx.now(), examDate) : null;
  const profile = await loadProfile(ctx).catch(() => null);
  const links = linksFor(exam);
  const out = await ctx.ai.json({
    key: 'gap.replan', schema: GAP_SCHEMA, maxTokens: 1500, temperature: 0.3,
    messages: [
      { role: 'system', content: systemFor(ctx, access, { name: 'Gap-to-target coach', instructions: [
        `The learner is at ${forExam.current} in ${exam.toUpperCase()} and wants ${target}${days !== null ? ` in ${days} days` : ''}.`,
        'Name the four things that would move their score most, from the weak spots and predictions in the data only. For each: a title, why (citing the data), one concrete action this week, and a link_id from this list or null:',
        links.map((link) => `${link.id} (${link.label})`).join('; '),
        'Do not predict a score or promise a result. note: one honest sentence about whether the time looks enough, without numbers that are not in the data.',
      ] }, [{ kind: 'learner_prediction', title: 'Predicted scores', data: prediction }, ...(profile ? [{ kind: 'learner_profile', title: 'Schood results', data: profile }] : [])]) },
      { role: 'user', content: learnerInput({ exam, target, exam_date: examDate }) },
    ],
  });
  const output = {
    exam, current: forExam.current, predicted_next: forExam.predicted_next, range: forExam.range, target, exam_date: examDate, days_left: days, data_points: forExam.data_points,
    drivers: out.data.drivers.slice(0, 4).map((driver) => ({ ...driver, link_id: linkFor(driver.link_id, exam)?.id ?? null })), note: out.data.note,
  };
  const row = await store(ctx).createRecord({ userId: ctx.user.id, workspaceId: access.workspace.id, kind: 'gap', credits: out.credits, input: { exam, target, exam_date: examDate }, output, state: { next_check_at: new Date(ctx.now().getTime() + 7 * 86_400_000).toISOString(), day: today(ctx.now()) } });
  track(ctx, access, { feature: 'L15', kind: 'gap', score: forExam.current, summary: { exam, current: forExam.current, target, drivers: output.drivers.map((driver) => driver.title).slice(0, 4) } });
  return { gap: gapView(row, ctx.now()), ...receipt(out) };
}

export const planRoutes = {
  'study-plan': { GET: currentPlan, POST: buildPlan, PATCH: tickTask },
  gap: { POST: gapToTarget },
};
