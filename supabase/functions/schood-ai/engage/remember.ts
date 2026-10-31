import { oneOf, optionalText, record, text, uuid } from '../input.ts';
import type { ContextBlock, RequestContext } from '../types.ts';
import { begin, dayStart, refuse, type Engage } from './base.ts';
import { goalByKey } from './content/path.ts';
import { addDays, daysBetween, isDay, streakState, weakSpot } from './rules.ts';
import type { DateRow } from './types.ts';

// E9 A coach that remembers: the dates that matter (an exam, an interview on
// Thursday), the weak spot from the last three weeks and where the person is on
// their journey. Every coach and tutor chat can read it through the `engage_memory`
// context provider (the person's own data only), and the planner uses the same
// facts to check in at the right moment, inside the notification budget.

const KINDS = ['exam', 'interview', 'deadline', 'presentation', 'other'] as const;
/** Days before a date when a check-in is due, and the day after, for the result. */
export const CHECKIN_BEFORE = [7, 3, 1, 0] as const;

export const dateView = (row: DateRow, today: string) => ({
  id: row.id, kind: row.kind, title: row.title, on_date: row.onDate, at_time: row.atTime, goal: row.goalKey, done: row.done, result: row.result,
  days_left: daysBetween(today, row.onDate),
});

export async function memoryFacts(e: Engage) {
  const [dates, recent, days, buys] = await Promise.all([
    e.b.repo.dates(e.userId), e.b.repo.events(e.userId, dayStart(addDays(e.today, -21), e.profile.timeZone), e.now), e.b.repo.allDays(e.userId), e.b.repo.freezeBuys(e.userId),
  ]);
  const upcoming = dates.filter((row) => !row.done && row.onDate >= addDays(e.today, -1)).slice(0, 5);
  const streak = streakState(days, buys.map((buy) => buy.day), e.today);
  const journeys = (await e.b.repo.journeys(e.userId)).filter((row) => row.status === 'active');
  return {
    dates: upcoming.map((row) => dateView(row, e.today)),
    weak_spot: weakSpot(recent),
    streak: streak.current,
    active_days_last_21: new Set(recent.filter((event) => event.verified).map((event) => event.createdAt.slice(0, 10))).size,
    journeys: journeys.map((row) => ({ journey: row.journeyKey, chapter: row.completed.length + 1, started_on: row.startedOn, target_date: row.targetDate })),
  };
}

/** What every chat may know about the caller from engage (selfView: it describes only them). */
export async function engageMemoryContext(ctx: RequestContext): Promise<ContextBlock | null> {
  const e = await begin(ctx, { locale: false });
  const facts = await memoryFacts(e);
  if (!facts.dates.length && !facts.weak_spot && !facts.journeys.length && !facts.streak) return null;
  return { kind: 'engage_memory', title: 'What your coach remembers', data: facts };
}

// --- Routes -------------------------------------------------------------------------------------
export async function getMemory(ctx: RequestContext) {
  await ctx.requireFeature('E9');
  const e = await begin(ctx);
  const all = await e.b.repo.dates(e.userId);
  return { ...(await memoryFacts(e)), past: all.filter((row) => row.done || row.onDate < addDays(e.today, -1)).slice(-10).reverse().map((row) => dateView(row, e.today)) };
}

export async function addDate(ctx: RequestContext) {
  await ctx.requireFeature('E9');
  const e = await begin(ctx);
  const body = record(await ctx.body());
  const onDate = isDay(body.on_date) && body.on_date >= e.today && daysBetween(e.today, body.on_date) <= 730 ? body.on_date as string : refuse('invalid_request', 'on_date must be a day in the next two years.', 400, { field: 'on_date' });
  const atTime = body.at_time === undefined || body.at_time === null || body.at_time === '' ? null : typeof body.at_time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(body.at_time) ? body.at_time : refuse('invalid_request', 'at_time must be HH:MM.', 400, { field: 'at_time' });
  const goal = body.goal === undefined || body.goal === null ? null : goalByKey(String(body.goal))?.key ?? refuse('invalid_request', 'goal is unknown.', 400, { field: 'goal' });
  if ((await e.b.repo.dates(e.userId)).filter((row) => !row.done).length >= 20) refuse('date_limit', 'You already have 20 dates saved.', 409);
  const row = await e.b.repo.addDate({ userId: e.userId, kind: oneOf(body.kind, 'kind', KINDS), title: text(body.title, 'title', { max: 80 }), onDate, atTime, goalKey: goal });
  ctx.events.emit({ kind: 'goal_set', area: 'engage', feature: 'E9', ref: `date:${row.id}` });
  return await getMemory(ctx);
}

export async function updateDate(ctx: RequestContext) {
  await ctx.requireFeature('E9');
  const e = await begin(ctx);
  const body = record(await ctx.body());
  const id = uuid(body.id, 'id');
  if (body.delete === true) {
    if (!(await e.b.repo.deleteDate(e.userId, id))) refuse('not_found', 'Date not found.', 404);
    return await getMemory(ctx);
  }
  const patch: Partial<Pick<DateRow, 'done' | 'result' | 'title' | 'onDate'>> = {};
  if (body.done !== undefined) patch.done = body.done === true;
  if (body.result !== undefined) patch.result = optionalText(body.result, 'result', { max: 120 });
  if (body.title !== undefined) patch.title = text(body.title, 'title', { max: 80 });
  if (body.on_date !== undefined) patch.onDate = isDay(body.on_date) ? body.on_date as string : refuse('invalid_request', 'on_date must be a day.', 400, { field: 'on_date' });
  if (!(await e.b.repo.updateDate(e.userId, id, patch))) refuse('not_found', 'Date not found.', 404);
  return await getMemory(ctx);
}
