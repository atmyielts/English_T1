import { ciValidatedPacks } from '../../../packages/coach-packs/src/registry.ts';
import { createWorker, type Env } from './worker.ts';

// Cloudflare entry: webhooks and the Mini App sign-in (fetch), reminders (cron).
// Configuration and secrets: README.md. Never deployed from a laptop for schood-*;
// the coordinator ships it.

interface ExecutionContext { waitUntil(promise: Promise<unknown>): void }
let worker: ReturnType<typeof createWorker> | null = null;
const workerFor = (env: Env) => (worker ??= createWorker({ env, packs: ciValidatedPacks(), fetch: (input, init) => fetch(input, init) }));

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return workerFor(env).fetch(request, ctx);
  },
  scheduled(_controller: unknown, env: Env, ctx: ExecutionContext): void {
    ctx.waitUntil(workerFor(env).cron().then((result) => console.log(JSON.stringify({ event: 'coach_cron', ...result }))).catch((cause) => console.error(JSON.stringify({ event: 'coach_cron_failed', error: String(cause).slice(0, 300) }))));
  },
};
