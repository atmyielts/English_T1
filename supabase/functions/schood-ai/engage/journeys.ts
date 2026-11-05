import { oneOf, optionalText, record, text } from '../input.ts';
import type { RequestContext } from '../types.ts';
import { begin, refuse, type Engage } from './base.ts';
import { JOURNEYS, journeyByKey, type Journey, type JourneyTask, type TaskMatch } from './content/journeys.ts';
import { goalByKey, PATH } from './content/path.ts';
import { pick } from './content/text.ts';
import { addDays, daysBetween, isDay, VERIFIED_KINDS } from './rules.ts';
import { currentOfferSource, type Offer } from './seams.ts';
import type { EventRow, GoalRow, JourneyRow, SampleRow } from './types.ts';

// E1 Journeys and E2 the lifetime path. A chapter completes when every tracked task
// has enough matching verified events (or a then-vs-now sample) since the previous
// chapter closed, so nothing counts twice and opening a chapter counts for nothing.
// The last chapter graduates the journey, which closes its lifetime-path goal and
// makes the next goal ready. The honest offer at graduation comes from pricing.

export function taskMatches(match: TaskMatch, event: EventRow): boolean {
  if (!event.verified || !VERIFIED_KINDS.includes(event.kind)) return false;
  if (match.sample) return false;
  if (match.arc) return event.feature === 'E8' && !!event.ref?.startsWith(`story:${match.arc}:`) && (!match.kinds || match.kinds.includes(event.kind));
  if (!match.features.includes(event.feature)) return false;
  if (match.kinds && !match.kinds.includes(event.kind)) return false;
  if (match.skill && !(event.skill ?? '').startsWith(match.skill)) return false;
  return true;
}

export interface TaskView { id: string; title: string; link: string; tracked: boolean; target: number; progress: number; done: boolean }
function taskProgress(task: JourneyTask, events: EventRow[], samples: SampleRow[], since: number, locale: Engage['locale']): TaskView {
  let progress = 0;
  if (task.match?.sample) progress = samples.filter((sample) => sample.kind === task.match!.sample && Date.parse(sample.recordedAt) >= since).length;
  else if (task.match) progress = events.filter((event) => Date.parse(event.createdAt) >= since && taskMatches(task.match!, event)).length;
  return { id: task.id, title: pick(task.title, locale), link: task.link, tracked: !!task.match, target: task.count, progress: Math.min(task.count, progress), done: !!task.match && progress >= task.count };
}

export interface JourneyProgress {
  row: JourneyRow;
  journey: Journey;
  chapter: number;
  tasks: TaskView[];
  graduated: boolean;
  /** The chapter's scheduled week (week n of the journey) and whether the person is behind it. */
  scheduledEnd: string;
  behind: boolean;
  atRisk: boolean;
  done: number;
  total: number;
  justGraduated: boolean;
}

/** Brings a journey up to date: closes every chapter whose tasks are done, graduates at the end. */
export async function advanceJourney(e: Engage, row: JourneyRow): Promise<JourneyProgress | null> {
  const journey = journeyByKey(row.journeyKey);
  if (!journey) return null;
  const samples = await e.b.repo.samples(e.userId);
  let current = row, justGraduated = false;
  for (let guard = 0; guard <= journey.weeks; guard++) {
    if (current.status !== 'active') break;
    const index = current.completed.length;
    if (index >= journey.weeks) break;
    const since = Date.parse(current.completed.at(-1)?.at ?? current.createdAt);
    const events = await e.b.repo.events(e.userId, new Date(since), e.now);
    const tasks = journey.chapters[index].tasks.map((task) => taskProgress(task, events, samples, since, e.locale));
    if (!tasks.filter((task) => task.tracked).every((task) => task.done)) break;
    const completed = [...current.completed, { chapter: index + 1, at: e.now.toISOString() }];
    const graduating = completed.length >= journey.weeks;
    const next = await e.b.repo.updateJourney(current.id, { completed, ...(graduating ? { status: 'graduated' as const, graduatedAt: e.now.toISOString() } : {}) }, index);
    if (!next) { current = (await e.b.repo.journeys(e.userId)).find((entry) => entry.id === row.id) ?? current; continue; }
    current = next;
    if (graduating) { justGraduated = true; await onGraduated(e, journey, current); }
  }
  const index = Math.min(current.completed.length, journey.weeks - 1);
  const graduated = current.status === 'graduated';
  const since = Date.parse(current.completed.at(-1)?.at ?? current.createdAt);
  const events = graduated ? [] : await e.b.repo.events(e.userId, new Date(since), e.now);
  const tasks = graduated ? [] : journey.chapters[index].tasks.map((task) => taskProgress(task, events, samples, since, e.locale));
  const scheduledEnd = addDays(current.startedOn, (index + 1) * 7 - 1);
  const tracked = tasks.filter((task) => task.tracked);
  const done = tracked.reduce((sum, task) => sum + task.progress, 0), total = tracked.reduce((sum, task) => sum + task.target, 0);
  const behind = !graduated && e.today > scheduledEnd;
  const daysLeft = daysBetween(e.today, scheduledEnd);
  return {
    row: current, journey, chapter: graduated ? journey.weeks : index + 1, tasks, graduated, scheduledEnd, behind,
    atRisk: !graduated && current.status === 'active' && (behind || (daysLeft <= 2 && total > 0 && done / total < 0.5)),
    done, total, justGraduated,
  };
}

async function onGraduated(e: Engage, journey: Journey, row: JourneyRow): Promise<void> {
  await e.b.repo.upsertPassportItem({
    userId: e.userId, kind: 'journey', source: 'engage', sourceRef: `journey:${row.id}`, title: pick(journey.title, 'en'),
    data: { journey: journey.key, weeks: journey.weeks, started_on: row.startedOn, graduated_at: row.graduatedAt, chapters: row.completed.length },
    verifyUrl: null, verified: true, issuedAt: row.graduatedAt,
  });
  await closeGoal(e, journey.goalKey, 'journey', { journey: journey.key, graduated_at: row.graduatedAt });
}

/** Closes a lifetime-path goal and makes the next goals ready (E2). */
export async function closeGoal(e: Engage, goalKey: string, by: GoalRow['doneBy'], outcome: Record<string, unknown>): Promise<string[]> {
  const goal = goalByKey(goalKey);
  if (!goal) return [];
  await e.b.repo.ensureGoal(e.userId, goalKey, 'active');
  const closed = await e.b.repo.updateGoal(e.userId, goalKey, { status: 'done', doneBy: by, outcome, doneAt: e.now.toISOString() }, ['ready', 'active']);
  if (!closed) return [];
  const ready: string[] = [];
  for (const next of goal.next) {
    const row = await e.b.repo.ensureGoal(e.userId, next, 'ready');
    if (row.status === 'ready') ready.push(next);
  }
  return ready;
}

/** Verified outcomes (a recorded exam result) close the goals they belong to. */
async function closeGoalsByOutcome(e: Engage, goals: GoalRow[]): Promise<void> {
  for (const row of goals.filter((goal) => goal.status === 'active' || goal.status === 'ready')) {
    const goal = goalByKey(row.goalKey);
    if (!goal?.closesOn.length) continue;
    const events = await e.b.repo.events(e.userId, new Date(row.createdAt), e.now);
    const hit = events.find((event) => event.verified && goal.closesOn.some((rule) => rule.kinds.includes(event.kind as 'outcome_recorded') && rule.features.includes(event.feature) && (!rule.skill || (event.skill ?? '').startsWith(rule.skill))));
    if (hit) await closeGoal(e, row.goalKey, 'outcome', { feature: hit.feature, skill: hit.skill, score: hit.score, outcome: hit.outcome, at: hit.createdAt });
  }
}

export const journeyListView = (journey: Journey, locale: Engage['locale']) => ({
  key: journey.key, title: pick(journey.title, locale), lead: pick(journey.lead, locale), weeks: journey.weeks, coach: journey.coach, level: journey.level, goal: journey.goalKey,
});

export function progressView(progress: JourneyProgress, locale: Engage['locale']) {
  const { journey, row } = progress;
  return {
    id: row.id, key: journey.key, title: pick(journey.title, locale), status: row.status, started_on: row.startedOn, target_date: row.targetDate,
    weeks: journey.weeks, chapter: progress.chapter, completed: row.completed.length, graduated: progress.graduated, graduated_at: row.graduatedAt,
    behind: progress.behind, at_risk: progress.atRisk, scheduled_end: progress.scheduledEnd, done: progress.done, total: progress.total,
    chapter_title: pick(journey.chapters[progress.chapter - 1].title, locale), chapter_focus: pick(journey.chapters[progress.chapter - 1].focus, locale),
    tasks: progress.tasks,
  };
}

async function offerFor(e: Engage, moment: 'graduation' | 'goal_done'): Promise<Offer | null> {
  if (e.profile.offersMuted) return null;
  const dismissed = await e.b.repo.offerDismissals(e.userId);
  const source = currentOfferSource();
  const offer = source ? await source(e.ctx, { userId: e.userId, moment }).catch(() => null) : null;
  // Without a pricing source there is no offer: engage never invents a price or a discount.
  return offer && !dismissed.includes(offer.key) ? offer : null;
}

export async function activeJourneys(e: Engage) {
  const rows = (await e.b.repo.journeys(e.userId)).filter((row) => row.status === 'active' || row.status === 'graduated');
  const out: JourneyProgress[] = [];
  for (const row of rows) { const progress = await advanceJourney(e, row); if (progress) out.push(progress); }
  return out;
}

// --- Routes -------------------------------------------------------------------------------------------
export async function listJourneys(ctx: RequestContext) {
  await ctx.requireFeature('E1');
  const e = await begin(ctx);
  const mine = await activeJourneys(e);
  return { journeys: JOURNEYS.map((journey) => journeyListView(journey, e.locale)), mine: mine.map((progress) => progressView(progress, e.locale)) };
}

export async function getJourney(ctx: RequestContext) {
  await ctx.requireFeature('E1');
  const e = await begin(ctx);
  const journey = journeyByKey(ctx.query.get('key') ?? '') ?? refuse('not_found', 'Journey not found.', 404);
  const row = (await e.b.repo.journeys(e.userId)).find((entry) => entry.journeyKey === journey.key && entry.status !== 'left');
  const progress = row ? await advanceJourney(e, row) : null;
  return {
    journey: {
      ...journeyListView(journey, e.locale),
      chapters: journey.chapters.map((chapter) => ({ week: chapter.week, title: pick(chapter.title, e.locale), focus: pick(chapter.focus, e.locale), tasks: chapter.tasks.length })),
      graduation: { title: pick(journey.graduation.title, e.locale), lead: pick(journey.graduation.lead, e.locale), certificate: journey.graduation.certificate },
    },
    mine: progress ? progressView(progress, e.locale) : null,
    offer: progress?.graduated ? await offerFor(e, 'graduation') : null,
  };
}

export async function startJourney(ctx: RequestContext) {
  await ctx.requireFeature('E1');
  const e = await begin(ctx);
  const body = record(await ctx.body());
  const journey = journeyByKey(text(body.journey, 'journey', { max: 40 })) ?? refuse('not_found', 'Journey not found.', 404);
  const target = body.target_date === undefined || body.target_date === null ? null : isDay(body.target_date) && body.target_date >= e.today ? body.target_date as string : refuse('invalid_request', 'target_date must be a future day.', 400, { field: 'target_date' });
  const active = (await e.b.repo.journeys(e.userId)).filter((row) => row.status === 'active');
  if (active.length >= 3 && !active.some((row) => row.journeyKey === journey.key)) refuse('journey_limit', 'Three journeys at once is the most that stays healthy. Finish or pause one first.', 409);
  const row = await e.b.repo.startJourney(e.userId, { journeyKey: journey.key, startedOn: e.today, targetDate: target });
  await e.b.repo.ensureGoal(e.userId, journey.goalKey, 'active');
  await e.b.repo.updateGoal(e.userId, journey.goalKey, { status: 'active' }, ['ready']);
  ctx.events.emit({ kind: 'goal_set', area: 'engage', feature: 'E1', ref: `journey:${journey.key}` });
  const progress = await advanceJourney(e, row);
  return { mine: progress ? progressView(progress, e.locale) : null };
}

export async function changeJourney(ctx: RequestContext) {
  await ctx.requireFeature('E1');
  const e = await begin(ctx);
  const body = record(await ctx.body());
  const action = oneOf(body.action, 'action', ['pause', 'resume', 'leave'] as const);
  const row = (await e.b.repo.journeys(e.userId)).find((entry) => entry.journeyKey === body.journey && (entry.status === 'active' || entry.status === 'paused')) ?? refuse('not_found', 'Journey not found.', 404);
  const status = action === 'pause' ? 'paused' : action === 'resume' ? 'active' : 'left';
  const next = await e.b.repo.updateJourney(row.id, { status });
  return { status: next?.status ?? status };
}

// --- E2 lifetime path ---------------------------------------------------------------------------------------
export async function pathView(e: Engage) {
  await activeJourneys(e);
  let goals = await e.b.repo.goals(e.userId);
  await closeGoalsByOutcome(e, goals);
  goals = await e.b.repo.goals(e.userId);
  const byKey = new Map(goals.map((goal) => [goal.goalKey, goal]));
  const next = goals.filter((goal) => goal.status === 'ready').sort((a, b) => PATH.findIndex((g) => g.key === a.goalKey) - PATH.findIndex((g) => g.key === b.goalKey))[0] ?? null;
  return {
    started: goals.length > 0,
    goals: PATH.map((goal) => {
      const row = byKey.get(goal.key);
      return {
        key: goal.key, stage: goal.stage, title: pick(goal.title, e.locale), lead: pick(goal.lead, e.locale), start: goal.start, journey: goal.journey, features: goal.features, next: goal.next,
        status: row?.status ?? 'open', done_by: row?.doneBy ?? null, verified: row?.doneBy === 'journey' || row?.doneBy === 'outcome', done_at: row?.doneAt ?? null,
      };
    }),
    next: next ? next.goalKey : null,
    done: goals.filter((goal) => goal.status === 'done').length,
  };
}

export async function getPath(ctx: RequestContext) {
  await ctx.requireFeature('E2');
  const e = await begin(ctx);
  const view = await pathView(e);
  return { ...view, offer: view.done > 0 ? await offerFor(e, 'goal_done') : null };
}

export async function changeGoal(ctx: RequestContext) {
  await ctx.requireFeature('E2');
  const e = await begin(ctx);
  const body = record(await ctx.body());
  const goal = goalByKey(text(body.goal, 'goal', { max: 40 })) ?? refuse('not_found', 'Goal not found.', 404);
  const action = oneOf(body.action, 'action', ['start', 'skip', 'done', 'reopen'] as const);
  if (action === 'start') {
    await e.b.repo.ensureGoal(e.userId, goal.key, 'active');
    await e.b.repo.updateGoal(e.userId, goal.key, { status: 'active' }, ['ready', 'skipped']);
    ctx.events.emit({ kind: 'goal_set', area: 'engage', feature: 'E2', ref: `goal:${goal.key}` });
  } else if (action === 'skip') {
    await e.b.repo.ensureGoal(e.userId, goal.key, 'skipped');
    await e.b.repo.updateGoal(e.userId, goal.key, { status: 'skipped' }, ['ready', 'active']);
    for (const next of goal.next) await e.b.repo.ensureGoal(e.userId, next, 'ready');
  } else if (action === 'done') {
    // The person's own word closes a goal (so the path never traps anyone), but it is never shown as verified.
    const result = optionalText(body.result, 'result', { max: 120 });
    await closeGoal(e, goal.key, 'self', result ? { result } : {});
  } else {
    await e.b.repo.updateGoal(e.userId, goal.key, { status: 'active', doneBy: null, doneAt: null, outcome: {} }, ['skipped']);
  }
  return await getPath(ctx);
}

export async function dismissOffer(ctx: RequestContext) {
  const e = await begin(ctx);
  const body = record(await ctx.body());
  const key = text(body.offer, 'offer', { max: 60 });
  if (!/^[a-z0-9_.:-]{2,60}$/.test(key)) refuse('invalid_request', 'offer is invalid.', 400, { field: 'offer' });
  await e.b.repo.dismissOffer(e.userId, key, e.now.toISOString());
  if (body.mute_all === true) await e.b.repo.saveProfile(e.userId, { offersMuted: true });
  return { ok: true };
}
