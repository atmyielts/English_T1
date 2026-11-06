// Outgoing webhooks. Events are found by reading the tables (or sent by emitEvent) and
// queued per endpoint; a job delivers them with HMAC signatures, backing off on failure.
// Payloads carry ids and levels only, so the log holds nobody's name or address.
// While the function's switch is off nothing is scanned, queued or sent.
import { fetchAll } from '../insights/common.ts';
import { check, checkUnique, CompanyError, UUID, type CompanyEnv, type Db, type OrgRow, type Route } from '../types.ts';
import { inChunks, obj, text, token } from '../util.ts';
import { contractEnded } from '../handler.ts';
import { pushNotices } from './notices.ts';
import { connectConfig, ensureSettings, HR, paging, rateLimit, readSettings, switches } from './shared.ts';
import { urlProblem } from './ssrf.ts';

export const WEBHOOK_EVENTS = ['test.graded', 'candidate.finished', 'member.joined', 'member.level_changed', 'seat.changed'] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export interface WebhookRow {
  id: string; org_id: string; url: string; secret: string; events: string[]; description: string | null; active: boolean; disabled_reason: string | null;
  failure_count: number; last_success_at: string | null; last_failure_at: string | null; created_at: string;
}
const WEBHOOK_COLUMNS = 'id,org_id,url,secret,events,description,active,disabled_reason,failure_count,last_success_at,last_failure_at,created_at';
export interface DeliveryRow {
  id: string; org_id: string; webhook_id: string; event: string; event_id: string; payload: Record<string, unknown>; status: 'queued' | 'delivering' | 'sent' | 'dead';
  attempts: number; next_attempt_at: string; response_status: number | null; error: string | null; is_test: boolean; delivered_at: string | null; created_at: string; updated_at?: string;
}
const DELIVERY_COLUMNS = 'id,org_id,webhook_id,event,event_id,payload,status,attempts,next_attempt_at,response_status,error,is_test,delivered_at,created_at,updated_at';

const MAX_WEBHOOKS = 5;
/** After the first try: one minute, five, thirty, two hours, six, a day. Then it stops. */
export const BACKOFF_SECONDS = [60, 300, 1800, 7200, 21600, 86400];
/** So many failures in a row turn an endpoint off, and HR is told. */
const DISABLE_AFTER = 30;
const STUCK = 15 * 60_000;
const OVERLAP = 2 * 3_600_000;

/** The signature header: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<body>">. */
export async function signPayload(secret: string, body: string, at: Date): Promise<string> {
  const stamp = Math.floor(at.getTime() / 1000);
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`${stamp}.${body}`));
  return `t=${stamp},v1=${[...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function readUrl(value: unknown): string {
  const url = text(value, 'url', { min: 9, max: 500 })!;
  const problem = urlProblem(url);
  if (problem) throw new CompanyError('webhook_url_refused', 'Use a public https address.', 400, { field: 'url', reason: problem });
  return new URL(url).href;
}

function readEvents(value: unknown): string[] {
  if (!Array.isArray(value) || !value.length || value.some((event) => !(WEBHOOK_EVENTS as readonly unknown[]).includes(event))) throw new CompanyError('invalid_field', 'Choose at least one event.', 400, { field: 'events' });
  return [...new Set(value as string[])];
}

/** A row as pages see it. The secret never leaves after it is made. */
const publicView = ({ secret: _secret, ...row }: WebhookRow) => row;

async function loadWebhook(ctx: { db: Db; org: OrgRow | null }, id: string): Promise<WebhookRow> {
  if (!UUID.test(id)) throw new CompanyError('webhook_not_found', 'This webhook was not found.', 404);
  const row = check<WebhookRow | null>(await ctx.db.from('company_webhooks').select(WEBHOOK_COLUMNS).eq('org_id', ctx.org!.id).eq('id', id).maybeSingle());
  if (!row) throw new CompanyError('webhook_not_found', 'This webhook was not found.', 404);
  return row;
}

/** The body as sent: stable field names, newest format only. */
export const eventBody = (delivery: Pick<DeliveryRow, 'event' | 'event_id' | 'payload' | 'created_at' | 'is_test' | 'org_id'>) => JSON.stringify({
  id: delivery.event_id, type: delivery.event, created_at: delivery.created_at, workspace_id: delivery.org_id, test: delivery.is_test, data: delivery.payload,
});

type HookTarget = Pick<WebhookRow, 'id' | 'events' | 'created_at'>;
const activeHooks = async (db: Db, orgId: string) => check<HookTarget[]>(await db.from('company_webhooks').select('id,events,created_at').eq('org_id', orgId).eq('active', true));

/** Queues one event for every endpoint of the workspace that wants it. Safe to repeat: the event id keeps it to one delivery each. */
export async function emitEvent(db: Db, env: CompanyEnv, event: { org_id: string; type: WebhookEvent; id: string; data: Record<string, unknown>; at?: string }, now: Date, loaded?: HookTarget[]): Promise<number> {
  if (!switches(env).webhooks) return 0;
  const hooks = loaded ?? await activeHooks(db, event.org_id);
  const wanted = hooks.filter((hook) => hook.events.includes(event.type) && (!event.at || Date.parse(hook.created_at) <= Date.parse(event.at)));
  if (!wanted.length) return 0;
  const rows = wanted.map((hook) => ({ org_id: event.org_id, webhook_id: hook.id, event: event.type, event_id: event.id, payload: event.data, status: 'queued', next_attempt_at: now.toISOString() }));
  return check<unknown[]>(await db.from('company_webhook_deliveries').upsert(rows, { onConflict: 'webhook_id,event_id', ignoreDuplicates: true }).select('id')).length;
}

/** Finds what happened since the last scan and queues it. Runs only for workspaces with an active endpoint. */
export async function scanEvents(db: Db, env: CompanyEnv, org: OrgRow, now: Date): Promise<number> {
  if (!switches(env).webhooks) return 0;
  const hooks = await activeHooks(db, org.id);
  if (!hooks.length) return 0;
  await ensureSettings(db, org.id);
  const settings = await readSettings(db, org.id);
  // Nothing from before the oldest endpoint existed.
  const oldest = Math.min(...hooks.map((hook) => Date.parse(hook.created_at)));
  const from = Math.max(oldest, settings.events_swept_at ? Date.parse(settings.events_swept_at) - OVERLAP : oldest);
  const since = new Date(from).toISOString();
  const orgId = org.id;
  let queued = 0;
  const emit = async (type: WebhookEvent, id: string, at: string, data: Record<string, unknown>) => { queued += await emitEvent(db, env, { org_id: orgId, type, id, at, data }, now, hooks); };

  const graded = await fetchAll<{ id: string; assessment_id: string; member_id: string | null; overall_level: string | null; overall_score: number | null; graded_at: string; certificate_code: string | null }>(() =>
    db.from('company_attempts').select('id,assessment_id,member_id,overall_level,overall_score,graded_at,certificate_code').eq('org_id', orgId).eq('status', 'graded').gte('graded_at', since).order('id'), 5000);
  for (const row of graded) await emit('test.graded', `test.graded:${row.id}:${row.graded_at}`, row.graded_at, { attempt_id: row.id, assessment_id: row.assessment_id, member_id: row.member_id, overall_level: row.overall_level, overall_score: row.overall_score === null ? null : Number(row.overall_score), certificate_code: row.certificate_code, graded_at: row.graded_at });

  const finished = await fetchAll<{ id: string; assessment_id: string; status: string; submitted_at: string }>(() =>
    db.from('company_attempts').select('id,assessment_id,status,submitted_at').eq('org_id', orgId).is('member_id', null).in('status', ['submitted', 'graded']).gte('submitted_at', since).order('id'), 5000);
  for (const row of finished) await emit('candidate.finished', `candidate.finished:${row.id}`, row.submitted_at, { attempt_id: row.id, assessment_id: row.assessment_id, status: row.status, submitted_at: row.submitted_at });

  const joined = await fetchAll<{ id: string; department_id: string | null; job_role: string; role: string; joined_at: string }>(() =>
    db.from('company_members').select('id,department_id,job_role,role,joined_at').eq('org_id', orgId).eq('status', 'active').gte('joined_at', since).order('id'), 5000);
  for (const row of joined) await emit('member.joined', `member.joined:${row.id}`, row.joined_at, { member_id: row.id, department_id: row.department_id, job_role: row.job_role, role: row.role, joined_at: row.joined_at });

  const levels = await fetchAll<{ id: string; level: string | null; level_source: string | null; level_at: string }>(() =>
    db.from('company_members').select('id,level,level_source,level_at').eq('org_id', orgId).neq('status', 'removed').gte('level_at', since).order('id'), 5000);
  for (const row of levels) await emit('member.level_changed', `member.level_changed:${row.id}:${row.level_at}`, row.level_at, { member_id: row.id, level: row.level, level_source: row.level_source, level_at: row.level_at });

  const seats = check<{ id: string | number; action: string; target: string | null; created_at: string }[]>(await db.from('company_audit').select('id,action,target,created_at').eq('org_id', orgId).in('action', ['member.seat_on', 'member.seat_off']).gte('created_at', since).order('created_at', { ascending: true }).limit(1000));
  for (const row of seats) if (row.target) await emit('seat.changed', `seat.changed:${row.id}`, row.created_at, { member_id: row.target, seat: row.action === 'member.seat_on', changed_at: row.created_at });

  check(await db.from('company_connect_settings').update({ events_swept_at: now.toISOString() }).eq('org_id', orgId));
  return queued;
}

async function afterFailure(db: Db, hook: WebhookRow, orgId: string, now: Date): Promise<void> {
  const failures = hook.failure_count + 1;
  const stop = failures >= DISABLE_AFTER;
  check(await db.from('company_webhooks').update({ failure_count: failures, last_failure_at: now.toISOString(), ...(stop ? { active: false, disabled_reason: 'too_many_failures' } : {}) }).eq('id', hook.id));
  hook.failure_count = failures;
  if (!stop) return;
  hook.active = false;
  const hr = check<{ id: string }[]>(await db.from('company_members').select('id').eq('org_id', orgId).in('role', ['owner', 'admin']).eq('status', 'active'));
  await pushNotices(db, hr.map((member) => ({ org_id: orgId, member_id: member.id, kind: 'webhook_disabled', key: `webhook_disabled:${hook.id}:${now.toISOString().slice(0, 10)}`, params: { title: new URL(hook.url).hostname }, link: `/w/${orgId}/connect/webhooks` })));
}

/** Sends one claimed delivery and records what happened. */
async function deliverOne(db: Db, env: CompanyEnv, delivery: DeliveryRow, hook: WebhookRow, now: Date): Promise<boolean> {
  const body = eventBody(delivery);
  const attempt = delivery.attempts;
  // Checked again at send time: the rules may be stricter than when the URL was saved.
  const outcome = urlProblem(hook.url) ? { ok: false, error: 'blocked_address' as string, status: undefined as number | undefined } : await connectConfig({ env }).webhook!({
    url: hook.url, body,
    headers: { 'X-Schood-Event': delivery.event, 'X-Schood-Delivery': delivery.id, 'X-Schood-Signature': await signPayload(hook.secret, body, now) },
  }).catch(() => ({ ok: false, error: 'network' as string, status: undefined as number | undefined }));
  if (outcome.ok) {
    check(await db.from('company_webhook_deliveries').update({ status: 'sent', response_status: outcome.status ?? null, error: null, delivered_at: now.toISOString() }).eq('id', delivery.id));
    check(await db.from('company_webhooks').update({ failure_count: 0, last_success_at: now.toISOString() }).eq('id', hook.id));
    hook.failure_count = 0;
    return true;
  }
  const wait = BACKOFF_SECONDS[attempt - 1];
  check(await db.from('company_webhook_deliveries').update({
    status: wait ? 'queued' : 'dead', response_status: outcome.status ?? null, error: String(outcome.error ?? 'failed').slice(0, 60),
    next_attempt_at: new Date(now.getTime() + (wait ?? 0) * 1000).toISOString(),
  }).eq('id', delivery.id));
  await afterFailure(db, hook, delivery.org_id, now);
  return false;
}

/** Takes a queued row for this run; false when another run got there first. */
async function claim(db: Db, delivery: DeliveryRow): Promise<boolean> {
  const taken = check<unknown[]>(await db.from('company_webhook_deliveries').update({ status: 'delivering', attempts: delivery.attempts + 1 }).eq('id', delivery.id).eq('status', 'queued').eq('attempts', delivery.attempts).select('id'));
  if (taken.length) delivery.attempts += 1;
  return taken.length > 0;
}

export interface QueueResult { sent: number; failed: number; dropped: number }

/** Delivers what is due. Nothing leaves while the switch is off. */
export async function processQueue(db: Db, env: CompanyEnv, now: Date, limit = 100): Promise<QueueResult> {
  const result: QueueResult = { sent: 0, failed: 0, dropped: 0 };
  if (!switches(env).webhooks) return result;
  // A run that died mid-send leaves rows behind; they may go again.
  check(await db.from('company_webhook_deliveries').update({ status: 'queued' }).eq('status', 'delivering').lt('updated_at', new Date(now.getTime() - STUCK).toISOString()).select('id'));
  const due = check<DeliveryRow[]>(await db.from('company_webhook_deliveries').select(DELIVERY_COLUMNS).eq('status', 'queued').lte('next_attempt_at', now.toISOString()).order('next_attempt_at', { ascending: true }).limit(limit));
  if (!due.length) return result;
  const hooks = await inChunks([...new Set(due.map((row) => row.webhook_id))], async (chunk) => check<WebhookRow[]>(await db.from('company_webhooks').select(WEBHOOK_COLUMNS).in('id', chunk)));
  const byId = new Map(hooks.map((hook) => [hook.id, hook]));
  const orgs = await inChunks([...new Set(due.map((row) => row.org_id))], async (chunk) => check<Pick<OrgRow, 'id' | 'status' | 'contract_ends_at'>[]>(await db.from('company_orgs').select('id,status,contract_ends_at').in('id', chunk)));
  const orgById = new Map(orgs.map((org) => [org.id, org]));
  for (const delivery of due) {
    const hook = byId.get(delivery.webhook_id), org = orgById.get(delivery.org_id);
    const open = org && (org.status === 'pilot' || org.status === 'active') && !contractEnded(org, now);
    if (!hook || !hook.active || !open) {
      check(await db.from('company_webhook_deliveries').update({ status: 'dead', error: !open ? 'workspace_inactive' : 'webhook_off' }).eq('id', delivery.id).eq('status', 'queued'));
      result.dropped++;
      continue;
    }
    if (!await claim(db, delivery)) continue;
    if (await deliverOne(db, env, delivery, hook, now)) result.sent++;
    else result.failed++;
  }
  return result;
}

export const webhookRoutes: Route[] = [
  {
    method: 'GET', path: 'orgs/:org/connect/webhooks', access: 'org', roles: HR, allowSuspended: true,
    async handle(ctx) {
      const hooks = check<WebhookRow[]>(await ctx.db.from('company_webhooks').select(WEBHOOK_COLUMNS).eq('org_id', ctx.org!.id).order('created_at', { ascending: false }));
      return { webhooks: hooks.map(publicView), events: WEBHOOK_EVENTS, function_on: switches(ctx.env).webhooks };
    },
  },
  {
    // { url, events, description? } → the row and, this once, its signing secret.
    method: 'POST', path: 'orgs/:org/connect/webhooks', access: 'org', roles: HR,
    async handle(ctx, _params, body) {
      const input = obj(body), url = readUrl(input.url), events = readEvents(input.events);
      const existing = check<{ id: string }[]>(await ctx.db.from('company_webhooks').select('id').eq('org_id', ctx.org!.id));
      if (existing.length >= MAX_WEBHOOKS) throw new CompanyError('too_many_webhooks', `A workspace can have ${MAX_WEBHOOKS} webhooks. Remove one first.`, 409, { max: MAX_WEBHOOKS });
      const secret = `whsec_${token(32)}`;
      const row = check<WebhookRow>(await ctx.db.from('company_webhooks').insert({
        org_id: ctx.org!.id, url, secret, events, description: text(input.description, 'description', { max: 200, optional: true }), active: true, failure_count: 0, created_by: ctx.user,
        created_at: ctx.now().toISOString(),
      }).select(WEBHOOK_COLUMNS).single());
      await ctx.audit('webhook.created', row.id, { url, events });
      return { webhook: publicView(row), secret };
    },
  },
  {
    method: 'PATCH', path: 'orgs/:org/connect/webhooks/:webhook', access: 'org', roles: HR,
    async handle(ctx, params, body) {
      const hook = await loadWebhook(ctx, params.webhook), input = obj(body);
      const patch: Record<string, unknown> = {};
      if ('url' in input) patch.url = readUrl(input.url);
      if ('events' in input) patch.events = readEvents(input.events);
      if ('description' in input) patch.description = text(input.description, 'description', { max: 200, optional: true });
      if ('active' in input) {
        if (typeof input.active !== 'boolean') throw new CompanyError('invalid_field', 'active must be true or false.', 400, { field: 'active' });
        patch.active = input.active;
        if (input.active) { patch.disabled_reason = null; patch.failure_count = 0; }
      }
      if (!Object.keys(patch).length) return { webhook: publicView(hook) };
      const row = check<WebhookRow>(await ctx.db.from('company_webhooks').update(patch).eq('id', hook.id).select(WEBHOOK_COLUMNS).single());
      await ctx.audit('webhook.updated', hook.id, { ...patch });
      return { webhook: publicView(row) };
    },
  },
  {
    // Stopping events must work in a paused workspace too.
    method: 'DELETE', path: 'orgs/:org/connect/webhooks/:webhook', access: 'org', roles: HR, allowSuspended: true,
    async handle(ctx, params) {
      const hook = await loadWebhook(ctx, params.webhook);
      check(await ctx.db.from('company_webhooks').delete().eq('id', hook.id));
      await ctx.audit('webhook.deleted', hook.id, { url: hook.url });
      return { ok: true };
    },
  },
  {
    method: 'POST', path: 'orgs/:org/connect/webhooks/:webhook/rotate', access: 'org', roles: HR,
    async handle(ctx, params) {
      const hook = await loadWebhook(ctx, params.webhook);
      const secret = `whsec_${token(32)}`;
      check(await ctx.db.from('company_webhooks').update({ secret }).eq('id', hook.id));
      await ctx.audit('webhook.secret_rotated', hook.id);
      return { secret };
    },
  },
  {
    // Sends one test event now, or says why not. With the switch off nothing leaves or is queued.
    method: 'POST', path: 'orgs/:org/connect/webhooks/:webhook/test', access: 'org', roles: HR,
    async handle(ctx, params) {
      const hook = await loadWebhook(ctx, params.webhook);
      const now = ctx.now();
      const sample = { message: 'This is a test from Schood Company English.', webhook_id: hook.id };
      if (!switches(ctx.env).webhooks) {
        return { sent: false, reason: 'webhooks_off', sample: { body: eventBody({ event: 'webhook.test', event_id: 'test:example', payload: sample, created_at: now.toISOString(), is_test: true, org_id: ctx.org!.id }) } };
      }
      await rateLimit(ctx.db, `webhook-test:${hook.id}`, 10);
      const id = `test:${crypto.randomUUID()}`;
      const delivery = checkUnique<DeliveryRow>(await ctx.db.from('company_webhook_deliveries').insert({
        org_id: ctx.org!.id, webhook_id: hook.id, event: 'webhook.test', event_id: id, payload: sample, status: 'queued', attempts: 0, is_test: true, next_attempt_at: now.toISOString(), created_at: now.toISOString(),
      }).select(DELIVERY_COLUMNS).single(), () => new CompanyError('webhook_test_busy', 'Try again in a moment.', 409));
      if (!await claim(ctx.db, delivery)) return { sent: false, reason: 'busy' };
      const sent = await deliverOne(ctx.db, ctx.env, delivery, hook, now);
      const after = check<DeliveryRow | null>(await ctx.db.from('company_webhook_deliveries').select(DELIVERY_COLUMNS).eq('id', delivery.id).maybeSingle());
      // A test is one try; it does not sit in the queue.
      if (!sent) check(await ctx.db.from('company_webhook_deliveries').update({ status: 'dead' }).eq('id', delivery.id));
      await ctx.audit('webhook.tested', hook.id, { sent });
      return { sent, response_status: after?.response_status ?? null, error: after?.error ?? null };
    },
  },
  {
    method: 'GET', path: 'orgs/:org/connect/webhooks/:webhook/deliveries', access: 'org', roles: HR, allowSuspended: true,
    async handle(ctx, params, _body, query) {
      const hook = await loadWebhook(ctx, params.webhook);
      const { limit, offset } = paging(query);
      let list = ctx.db.from('company_webhook_deliveries').select('id,event,event_id,status,attempts,next_attempt_at,response_status,error,is_test,delivered_at,created_at').eq('org_id', ctx.org!.id).eq('webhook_id', hook.id);
      const status = query.get('status');
      if (status) {
        if (!['queued', 'delivering', 'sent', 'dead'].includes(status)) throw new CompanyError('invalid_field', 'status is not known.', 400, { field: 'status' });
        list = list.eq('status', status);
      }
      const deliveries = check<Partial<DeliveryRow>[]>(await list.order('created_at', { ascending: false }).order('id').range(offset, offset + limit - 1));
      return { deliveries, next_offset: deliveries.length === limit ? offset + limit : null };
    },
  },
  {
    // Gives a stopped delivery a fresh start.
    method: 'POST', path: 'orgs/:org/connect/webhooks/:webhook/deliveries/:delivery/retry', access: 'org', roles: HR,
    async handle(ctx, params) {
      const hook = await loadWebhook(ctx, params.webhook);
      // It would only sit in the queue, which the page says never happens while this is off.
      if (!switches(ctx.env).webhooks) throw new CompanyError('webhooks_off', 'Sending webhooks is not switched on yet.', 409);
      if (!UUID.test(params.delivery)) throw new CompanyError('delivery_not_found', 'This delivery was not found.', 404);
      const row = check<Pick<DeliveryRow, 'id' | 'status' | 'is_test'> | null>(await ctx.db.from('company_webhook_deliveries').select('id,status,is_test').eq('org_id', ctx.org!.id).eq('webhook_id', hook.id).eq('id', params.delivery).maybeSingle());
      if (!row) throw new CompanyError('delivery_not_found', 'This delivery was not found.', 404);
      if (row.status !== 'dead' || row.is_test) throw new CompanyError('delivery_not_retryable', 'Only a stopped delivery can be sent again.', 409);
      check(await ctx.db.from('company_webhook_deliveries').update({ status: 'queued', attempts: 0, next_attempt_at: ctx.now().toISOString(), error: null }).eq('id', row.id).eq('status', 'dead'));
      await ctx.audit('webhook.redelivered', hook.id, { delivery: row.id });
      return { ok: true };
    },
  },
];
