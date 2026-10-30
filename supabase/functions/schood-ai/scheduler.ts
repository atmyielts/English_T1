import { systemJobs, type SystemJob } from './registries.ts';
import { periodStart } from './schedule.ts';
import { SchoodAIError, type Area, type RequestContext, type SchoodAIRepository } from './types.ts';

// core/system-tick: pg_cron calls it every five minutes (20261030180000). The route
// answers at once (pg_net waits only a few seconds) and runs the due jobs after the
// response: each is claimed for its period (ai_system_claim), so overlapping ticks
// never run a job twice, then finished as ok, failed or timeout (ai_system_finish).
// A failure hands the period back, so the next tick retries it, at most three times.

export type TickStatus = 'ok' | 'failed' | 'timeout' | 'not_due' | 'later';
export interface TickDeps {
  repo: SchoodAIRepository;
  now(): Date;
  /** A system ctx for the job's area (no user, see CONTRACT.md). */
  contextFor(area: Area, job: string): RequestContext;
  jobs?: [string, SystemJob][];
  /** Jobs that would not finish inside this many ms of the tick wait for the next one. */
  budgetMs?: number;
  /** Jobs run side by side, at most this many at once. */
  concurrency?: number;
}

const DEFAULT_TIMEOUT = 60_000, BUDGET = 130_000, CONCURRENCY = 3, LEASE_SLACK_SECONDS = 30;

/** A short, data-free reason for ai_system_runs.last_error and the log. */
function reason(cause: unknown): string {
  if (cause instanceof SchoodAIError) return cause.code;
  if (cause instanceof Error) return `${cause.name}: ${cause.message}`.slice(0, 200);
  return String(cause).slice(0, 200);
}

export async function runSystemTick(deps: TickDeps): Promise<{ job: string; status: TickStatus }[]> {
  const started = Date.now(), budget = deps.budgetMs ?? BUDGET;
  const queue = [...(deps.jobs ?? systemJobs())];
  const results: { job: string; status: TickStatus }[] = [];

  async function runOne(name: string, job: SystemJob): Promise<TickStatus> {
    const timeoutMs = job.timeoutMs ?? DEFAULT_TIMEOUT;
    if (Date.now() - started + timeoutMs > budget) return 'later';
    const start = periodStart(job.schedule, deps.now()).toISOString();
    const leaseSeconds = Math.min(900, Math.ceil(timeoutMs / 1000) + LEASE_SLACK_SECONDS);
    if (!(await deps.repo.claimSystemJob(name, start, leaseSeconds))) return 'not_due';
    let timer: number | undefined;
    let status: 'ok' | 'failed' | 'timeout' = 'ok', error: string | null = null;
    try {
      const work = Promise.resolve().then(() => job.run(deps.contextFor(job.area, name)));
      const expired = new Promise<'timeout'>((resolve) => { timer = setTimeout(() => resolve('timeout'), timeoutMs); });
      // A job that runs out of time is left to finish on its own; its next run is the retry.
      work.catch(() => {});
      if ((await Promise.race([work.then(() => 'done' as const), expired])) === 'timeout') { status = 'timeout'; error = `timed out after ${timeoutMs} ms`; }
    } catch (cause) {
      status = 'failed';
      error = reason(cause);
    } finally {
      clearTimeout(timer);
    }
    if (status !== 'ok') console.error(JSON.stringify({ event: 'schood_ai_system_job_failed', job: name, status, error }));
    await deps.repo.finishSystemJob(name, status, error);
    return status;
  }

  const worker = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      const [name, job] = next;
      const status = await runOne(name, job).catch((cause) => {
        // The claim or finish itself failed (the database): the lease runs out and the next tick retries.
        console.error(JSON.stringify({ event: 'schood_ai_system_tick_failed', job: name, error: reason(cause) }));
        return 'failed' as const;
      });
      results.push({ job: name, status });
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, deps.concurrency ?? CONCURRENCY) }, worker));
  return results.sort((a, b) => a.job.localeCompare(b.job));
}
