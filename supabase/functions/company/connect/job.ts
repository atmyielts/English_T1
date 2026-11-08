// The job pg_cron wakes (company_connect_tick): new notices and digests for every
// workspace, then Telegram and webhooks where their switches are on. Authenticated by the
// private company_connect_secret from internal_runtime_secrets, as the English reminders are.
import { ORG_COLUMNS } from '../handler.ts';
import { fetchAll } from '../insights/common.ts';
import { CompanyError, type Ctx, type OrgRow, type Route } from '../types.ts';
import { sha256 } from '../util.ts';
import { maybeSweep } from './notices.ts';
import { rateLimit, switches } from './shared.ts';
import { pushOrg } from './telegram.ts';
import { processQueue, scanEvents } from './webhooks.ts';

/** Between sweeps from this job. The bell may sweep sooner. */
const SWEEP_EVERY = 60 * 60_000;
/** Stop starting new workspaces after this, so the run ends before the function's limit. */
const BUDGET_MS = 45_000;

async function isWorker(ctx: Ctx): Promise<boolean> {
  const supplied = ctx.req.headers.get('x-worker-secret')?.trim() ?? '';
  if (supplied.length < 32) return false;
  const { data, error } = await ctx.db.from('internal_runtime_secrets').select('secret').eq('key', 'company_connect_secret').maybeSingle();
  if (error) return false;
  const expected = String((data as { secret?: string } | null)?.secret ?? '').trim();
  // Compared as digests, so the comparison takes the same time wherever they differ.
  if (expected.length < 32) return false;
  const [left, right] = await Promise.all([sha256(supplied), sha256(expected)]);
  let mismatch = 0;
  for (let index = 0; index < left.length; index++) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}

export interface RunResult { orgs: number; notices: number; events: number; telegram: { sent: number; held: number; skipped: number; failed: number }; webhooks: { sent: number; failed: number; dropped: number } }

export async function runConnectJob(ctx: Pick<Ctx, 'db' | 'env' | 'now'>): Promise<RunResult> {
  const started = Date.now();
  const on = switches(ctx.env);
  const orgs = await fetchAll<OrgRow>(() => ctx.db.from('company_orgs').select(ORG_COLUMNS).in('status', ['pilot', 'active']).order('id'), 5000);
  const result: RunResult = { orgs: orgs.length, notices: 0, events: 0, telegram: { sent: 0, held: 0, skipped: 0, failed: 0 }, webhooks: { sent: 0, failed: 0, dropped: 0 } };
  for (const org of orgs) {
    if (Date.now() - started > BUDGET_MS) break;
    try {
      result.notices += await maybeSweep(ctx.db, org, ctx.now(), SWEEP_EVERY) ?? 0;
      if (on.webhooks) result.events += await scanEvents(ctx.db, ctx.env, org, ctx.now());
      if (on.telegram) {
        const pushed = await pushOrg(ctx.db, ctx.env, org, ctx.now());
        for (const key of ['sent', 'held', 'skipped', 'failed'] as const) result.telegram[key] += pushed[key];
      }
    } catch (cause) {
      // One workspace's problem must not stop the others.
      console.error(JSON.stringify({ company_connect_job: 'org_failed', org: org.id, error: String(cause) }));
    }
  }
  // Each send is signed at the moment it leaves, not when the run started.
  if (on.webhooks) result.webhooks = await processQueue(ctx.db, ctx.env, ctx.now(), 100, { clock: ctx.now });
  return result;
}

export const jobRoutes: Route[] = [
  {
    method: 'POST', path: 'internal/connect/run', access: 'public',
    async handle(ctx) {
      await rateLimit(ctx.db, `connect-job:${ctx.ipHash}`, 30);
      if (!await isWorker(ctx)) throw new CompanyError('unauthorized', 'Sign in first.', 401);
      return await runConnectJob(ctx);
    },
  },
];
