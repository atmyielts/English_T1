import { registerSystemJob, type SystemJob } from '../registries.ts';
import type { RequestContext } from '../types.ts';
import { beginFor } from './base.ts';
import { engage } from './binding.ts';
import { settleIfDue } from './league.ts';
import { deliverDue, planMessages } from './outbox.ts';
import { weekStart } from './rules.ts';

// Engage's scheduled work, run by core's scheduler (pg_cron calls core/system-tick every
// five minutes; each job runs once a period, retried up to three times). Every job has a
// system ctx: no user, so nothing here can act as a person; each person's failure is
// logged and never stops the others. Batches are bounded; repeating one is harmless
// (ticks, dedupe keys, claim tokens and settle-once).

const log = (ctx: RequestContext, event: string, cause: unknown) =>
  console.error(JSON.stringify({ event, request_id: ctx.requestId, error: String(cause).slice(0, 200) }));

/**
 * engage.plan: for each person whose preferred hour has come today (core's notification
 * preferences), queues what is worth saying: check-ins, streak at risk, comeback, a journey
 * behind, win-back on lapse days 2, 7 and 21, last week's league result, the national mock.
 */
export async function planDue(ctx: RequestContext, limit = 150) {
  const due = await engage(ctx).repo.dueUsers(ctx.now(), limit);
  let queued = 0, failed = 0;
  for (const person of due) {
    try {
      queued += (await planMessages(await beginFor(ctx, person.userId))).queued;
    } catch (cause) {
      failed++;
      log(ctx, 'engage_plan_failed', cause);
    }
  }
  return { people: due.length, queued, failed };
}

/** engage.league_rollover: settles every finished league week once, even if nobody opens a league. */
export async function rolloverLeagues(ctx: RequestContext, limit = 200) {
  const b = engage(ctx), now = ctx.now();
  const groups = await b.repo.unsettledGroups(weekStart(now), limit);
  let settled = 0;
  for (const group of groups) {
    try {
      if (await settleIfDue({ b, now }, group)) settled++;
    } catch (cause) {
      log(ctx, 'engage_rollover_failed', cause);
    }
  }
  return { checked: groups.length, settled };
}

/**
 * engage.media_sweep: deletes the stored audio of engage rows that are gone (closed accounts,
 * pruned samples, sittings), queued by the database's delete triggers. A failed delete is
 * tried again later (an hour per attempt); an object already gone counts as deleted.
 */
export async function sweepMedia(ctx: RequestContext, limit = 200) {
  const b = engage(ctx), now = ctx.now();
  const claimed = await b.repo.claimMediaTrash(now, limit);
  const done: string[] = [];
  let failed = 0;
  for (const row of claimed) {
    try {
      await b.storage.remove(row.storage);
      done.push(row.id);
    } catch (cause) {
      failed++;
      await b.repo.mediaTrashFailed(row.id, String(cause instanceof Error ? cause.message : cause), new Date(now.getTime() + row.attempts * 3_600_000).toISOString());
    }
  }
  await b.repo.mediaTrashDone(done);
  return { deleted: done.length, failed };
}

export const ENGAGE_SYSTEM_JOBS: [string, SystemJob][] = [
  ['engage.plan', { area: 'engage', schedule: { everyMinutes: 5 }, timeoutMs: 110_000, run: (ctx) => planDue(ctx) }],
  ['engage.deliver', { area: 'engage', schedule: { everyMinutes: 5 }, timeoutMs: 60_000, run: (ctx) => deliverDue(ctx, engage(ctx).repo, 150) }],
  // Weeks end on Monday 00:00 Tashkent and settle an hour later; daily, so a missed run catches up.
  ['engage.league_rollover', { area: 'engage', schedule: { dailyAt: '01:10' }, run: (ctx) => rolloverLeagues(ctx) }],
  ['engage.media_sweep', { area: 'engage', schedule: { dailyAt: '04:20' }, run: (ctx) => sweepMedia(ctx) }],
];

let registered = false;
/** Registers the jobs with core's scheduler once (mod.ts calls it at module load). */
export function registerEngageJobs() {
  if (registered) return;
  registered = true;
  for (const [name, job] of ENGAGE_SYSTEM_JOBS) registerSystemJob(name, job);
}
