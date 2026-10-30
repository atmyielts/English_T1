import { completion, equal, fixture, ID, ok, personal, SECRET, SYSTEM_SECRET } from './fixture.test.ts';
import { MODULES } from './handler.ts';
import { SEED_REGISTRY } from './memory-repository.ts';
import { registerSystemJob, type SystemJob } from './registries.ts';
import { periodStart, scheduleProblems } from './schedule.ts';
import { runSystemTick } from './scheduler.ts';
import { SchoodAIError, type FeatureModule, type RequestContext } from './types.ts';

// The scheduler (registerSystemJob, core/system-tick), embeddable and webhook routes
// (cors: 'any', rateKey, ctx.headers, ctx.origin), ctx.planFor, ctx.notify.send and a
// workspace's own model keys (C15).

const codeOf = async (work: () => unknown) => {
  try { await work(); return 'ok'; } catch (cause) { return cause instanceof SchoodAIError ? cause.code : String(cause).slice(0, 80); }
};

Deno.test('schedules: the start of the current period, in the job\'s zone', () => {
  const at = new Date('2026-11-02T06:07:00Z'); // Monday 11:07 in Tashkent
  equal(periodStart({ everyMinutes: 15 }, at).toISOString(), '2026-11-02T06:00:00.000Z');
  equal(periodStart({ dailyAt: '08:00' }, at).toISOString(), '2026-11-02T03:00:00.000Z', '08:00 Tashkent');
  equal(periodStart({ dailyAt: '12:00' }, at).toISOString(), '2026-11-01T07:00:00.000Z', 'not yet today: yesterday\'s');
  equal(periodStart({ dailyAt: '09:00', timeZone: 'Europe/Moscow' }, at).toISOString(), '2026-11-02T06:00:00.000Z');
  equal(periodStart({ weeklyAt: '07:30', weekday: 1 }, at).toISOString(), '2026-11-02T02:30:00.000Z', 'Monday');
  equal(periodStart({ weeklyAt: '07:30', weekday: 5 }, at).toISOString(), '2026-10-30T02:30:00.000Z', 'last Friday');
  equal(scheduleProblems({ everyMinutes: 1 }), ['everyMinutes must be 5 to 1440']);
  equal(scheduleProblems({ dailyAt: '8:00' }), ['time must be HH:MM']);
  equal(scheduleProblems({ dailyAt: '08:00', timeZone: 'Mars/Olympus' }), ['unknown time zone']);
  const refused = (name: string, job: Partial<SystemJob>) => { try { registerSystemJob(name, { area: 'centre', schedule: { everyMinutes: 5 }, run: () => Promise.resolve(), ...job }); return 'registered'; } catch (cause) { return String(cause); } };
  ok(refused('Centre.Brief', {}).includes('invalid'), 'names are <area>.<job>');
  ok(refused('zz_test.bad', { schedule: { dailyAt: '25:00' } }).includes('HH:MM'), 'schedules are checked at load');
  ok(refused('zz_test.slow', { timeoutMs: 300_000 }).includes('timeoutMs'), 'at most two minutes');
});

Deno.test('the tick runs each due job once a period, retries failures three times, and times out slow jobs', async () => {
  const f = fixture();
  let runs = 0, flaky = 0;
  const jobs: [string, SystemJob][] = [
    ['zz_test.brief', { area: 'centre', schedule: { dailyAt: '08:00' }, run: () => { runs++; return Promise.resolve(); } }],
    ['zz_test.flaky', { area: 'engage', schedule: { everyMinutes: 60 }, run: () => { flaky++; return Promise.reject(new SchoodAIError('upstream_down', 'x', 502)); } }],
  ];
  const tick = () => runSystemTick({ repo: f.memory.repository, now: f.now, contextFor: () => ({}) as RequestContext, jobs });
  equal(await tick(), [{ job: 'zz_test.brief', status: 'ok' }, { job: 'zz_test.flaky', status: 'failed' }]);
  equal(await tick(), [{ job: 'zz_test.brief', status: 'not_due' }, { job: 'zz_test.flaky', status: 'failed' }], 'done for today; the failure is retried');
  await tick();
  equal((await tick())[1], { job: 'zz_test.flaky', status: 'not_due' }, 'three failures in a period, then it waits');
  equal([runs, flaky], [1, 3]);
  const row = (await f.memory.repository.systemRuns()).find((entry) => entry.job === 'zz_test.flaky')!;
  equal([row.failures, row.lastStatus, row.lastError], [3, 'failed', 'upstream_down'], 'only the error code is kept');
  f.advance(60 * 60_000);
  equal((await tick())[1].status, 'failed', 'a new period forgets old failures');
  f.advance(24 * 60 * 60_000);
  equal((await tick())[0].status, 'ok', 'tomorrow\'s brief');
  equal(runs, 2);

  // Two ticks at once: the claim lets only one run it.
  let overlapping = 0;
  const slow: [string, SystemJob][] = [['zz_test.overlap', { area: 'coach', schedule: { everyMinutes: 5 }, run: async () => { overlapping++; await new Promise((resolve) => setTimeout(resolve, 30)); } }]];
  const both = await Promise.all([1, 2].map(() => runSystemTick({ repo: f.memory.repository, now: f.now, contextFor: () => ({}) as RequestContext, jobs: slow })));
  equal([overlapping, both.flat().map((entry) => entry.status).sort()], [1, ['not_due', 'ok']]);

  const stuck: [string, SystemJob][] = [['zz_test.stuck', { area: 'coach', schedule: { everyMinutes: 5 }, timeoutMs: 1_000, run: () => new Promise(() => {}) }]];
  equal(await runSystemTick({ repo: f.memory.repository, now: f.now, contextFor: () => ({}) as RequestContext, jobs: stuck }), [{ job: 'zz_test.stuck', status: 'timeout' }]);
  equal(await runSystemTick({ repo: f.memory.repository, now: f.now, contextFor: () => ({}) as RequestContext, jobs: stuck, budgetMs: 500 }), [{ job: 'zz_test.stuck', status: 'later' }], 'a job that cannot finish inside the tick waits for the next');
});

Deno.test('core/system-tick: pg_cron only, answers at once, and jobs get a system ctx of their area', async () => {
  let seen: unknown = null;
  const jobs: [string, SystemJob][] = [['zz_test.ctx', {
    area: 'centre', schedule: { everyMinutes: 5 },
    async run(ctx) { seen = { caller: ctx.caller, area: ctx.area, origin: ctx.origin, user: await codeOf(() => ctx.user.id) }; },
  }]];
  const f = fixture({ systemJobs: jobs });
  const tick = (headers: Record<string, string>, origin: string | null = null) => f.json('POST', 'core/system-tick', { token: null, origin, body: {}, headers });
  equal((await tick({})).status, 401);
  equal((await tick({ 'x-schood-service-secret': SYSTEM_SECRET }, 'https://ai.schood.online')).status, 403, 'never from a browser');
  equal((await f.json('POST', 'core/system-tick', { body: {} })).status, 401, 'never a person');
  const answered = await tick({ 'x-schood-service-secret': SYSTEM_SECRET });
  equal([answered.status, answered.body], [200, { accepted: true }]);
  await f.settle();
  equal(seen, { caller: 'system', area: 'centre', origin: null, user: 'user_required' });
  equal((await tick({ 'x-schood-service-secret': SECRET })).status, 200, 'the worker secret works too');
  let threw = '';
  try { fixture({ modules: [...MODULES, { area: 'core', routes: { 'system-tick': { system: true, POST: () => Promise.resolve({}) } } }] }); } catch (cause) { threw = String(cause); }
  ok(threw.includes('built in') || threw.includes('twice'), 'nobody else can be the tick');
});

const area: FeatureModule = {
  area: 'centre',
  routes: {
    // An embeddable widget on a centre's own site: any Origin, the route checks it.
    'zz-widget': {
      anonymous: { perMinute: 20, perDay: 100, cors: 'any' },
      async POST(ctx) {
        const allowed = ['https://registan.uz'];
        if (!ctx.origin || !allowed.includes(ctx.origin)) throw new SchoodAIError('origin_denied', 'This site may not embed the widget.', 403);
        return { origin: ctx.origin, caller: ctx.caller };
      },
    },
    // A centre bot's Telegram webhook: limited per known bot (unknown tokens per IP), checks its own secret token.
    'zz-webhook': {
      anonymous: { perMinute: 2, perDay: 10, rateKey: (req) => Promise.resolve(({ 'bot-secret-a': 'bot-a', 'bot-secret-b': 'bot-b' } as Record<string, string>)[req.headers.get('x-telegram-bot-api-secret-token') ?? ''] ?? null) },
      POST(ctx) {
        const token = ctx.headers.get('x-telegram-bot-api-secret-token');
        if (token !== 'bot-secret-a' && token !== 'bot-secret-b') throw new SchoodAIError('unauthorized', 'Unknown bot.', 401);
        return Promise.resolve({ bot: token.slice(-1) });
      },
    },
    'zz-plan': { system: true, async POST(ctx) { const plan = await ctx.planFor((await ctx.body<{ id: string }>()).id); return { kind: plan.workspaceKind, plans: plan.plans }; } },
    'zz-send': {
      system: true,
      async POST(ctx) {
        const body = await ctx.body<{ user: string; kind?: string; path?: string }>();
        return { result: await ctx.notify.send(body.user, { kind: body.kind ?? 'centre.brief', text: 'This week: 4 new students, 2 unpaid invoices.', buttons: [{ label: 'Open', path: body.path ?? '/centre' }], dedupeKey: '2026-W45' }) };
      },
    },
    'zz-pay': {
      system: true,
      async POST(ctx) {
        const answer = await (await ctx.paidBy((await ctx.body<{ id: string }>()).id)).text({ key: 'admissions.reply', messages: [{ role: 'user', content: 'Evening classes?' }] });
        return { text: answer.text, credits: answer.credits, charge: answer.chargeId };
      },
    },
  },
};
const modules = [...MODULES.filter((module) => module.area !== 'centre'), area];
const system = (f: ReturnType<typeof fixture>, path: string, body: unknown) => f.json('POST', path, { token: null, origin: null, body, headers: { 'x-schood-service-secret': SYSTEM_SECRET } });

Deno.test('embeddable routes answer any Origin without credentials; webhooks are limited per bot', async () => {
  const f = fixture({ modules });
  const preflight = await f.call('OPTIONS', 'centre/zz-widget', { token: null, origin: 'https://registan.uz' });
  equal([preflight.status, preflight.headers.get('access-control-allow-origin'), preflight.headers.get('access-control-allow-credentials')], [204, 'https://registan.uz', null]);
  ok(!preflight.headers.get('access-control-allow-headers')!.includes('authorization'), 'no credentials cross over');
  const embedded = await f.json('POST', 'centre/zz-widget', { token: null, origin: 'https://registan.uz', body: {} });
  equal([embedded.status, embedded.body], [200, { origin: 'https://registan.uz', caller: 'anonymous' }]);
  equal((await f.json('POST', 'centre/zz-widget', { token: null, origin: 'https://evil.example', body: {} })).body.code, 'origin_denied', 'the route refuses sites it does not know');
  equal((await f.call('GET', 'core/me', { origin: 'https://registan.uz' })).status, 403, 'other routes keep the allowlist');
  equal((await f.call('OPTIONS', 'core/me', { origin: 'https://registan.uz' })).status, 403);

  const hook = (secret: string, ip: string) => f.call('POST', 'centre/zz-webhook', { token: null, origin: null, body: {}, headers: { 'x-telegram-bot-api-secret-token': secret, 'x-forwarded-for': ip } });
  equal([(await hook('bot-secret-a', '149.154.160.1')).status, (await hook('bot-secret-a', '149.154.160.2')).status, (await hook('bot-secret-a', '149.154.160.3')).status], [200, 200, 429], 'one budget per bot, whatever Telegram address it comes from');
  equal((await hook('bot-secret-b', '149.154.160.1')).status, 200, 'another bot has its own');
  equal([(await hook('forged-1', '198.51.100.4')).status, (await hook('forged-2', '198.51.100.4')).status, (await hook('forged-3', '198.51.100.4')).status], [401, 401, 429], 'made-up tokens cannot buy a fresh budget: they count per IP');
  ok(!JSON.stringify([...f.memory.audit]).includes('bot-secret'), 'the token is never stored');

  for (const bad of [{ cors: 'all' }, { rateKey: 'header' }]) {
    let threw = '';
    try { fixture({ modules: [{ area: 'centre', routes: { x: { anonymous: bad as never, GET: () => Promise.resolve({}) } } }] }); } catch (cause) { threw = String(cause); }
    ok(threw.includes('centre/x'), `refused at load: ${JSON.stringify(bad)}`);
  }
});

Deno.test('ctx.planFor reads any workspace\'s plan as its owner', async () => {
  const f = fixture({ modules });
  const centre = f.memory.seed.centre({ name: 'Registan', ownerId: ID.owner });
  equal((await system(f, 'centre/zz-plan', { id: centre.id })).body, { kind: 'centre', plans: ['centre'] });
  equal((await system(f, 'centre/zz-plan', { id: await personal(f, 'tok-plus') })).body, { kind: 'personal', plans: ['plus'] });
  equal((await system(f, 'centre/zz-plan', { id: crypto.randomUUID() })).body.code, 'workspace_not_found');
  equal((await system(f, 'centre/zz-plan', { id: 'nope' })).status, 400);
});

Deno.test('ctx.notify.send: through the Schood bot, inside their choices and the daily budget', async () => {
  const f = fixture({ modules });
  const send = (user: string, extra: Record<string, unknown> = {}) => system(f, 'centre/zz-send', { user, ...extra });
  equal((await send(ID.plus)).body.result, { sent: true });
  equal(f.telegram.at(-1), { userId: ID.plus, kind: 'centre.brief', text: 'This week: 4 new students, 2 unpaid invoices.', buttons: [{ label: 'Open', path: '/centre' }], dedupeKey: '2026-W45' });
  equal((await send(ID.free)).body.result, { sent: false, reason: 'no_telegram' }, 'no linked Telegram');
  f.setTelegram({ outcome: 'suppressed' });
  equal((await send(ID.plus)).body.result, { sent: false, reason: 'suppressed' }, 'the bot\'s own settings said no');
  f.setTelegram({ outcome: 'sent' });
  const limited = (await send(ID.plus)).body.result;
  equal([limited.sent, limited.reason, typeof limited.retryAt], [false, 'daily_limit', 'string'], 'two a day by default');
  equal(f.telegram.length, 2, 'refused messages never reach the bot');

  const prefs = await f.memory.repository.notifyPrefs(ID.student);
  await f.memory.repository.saveNotifyPrefs(ID.student, { ...prefs, delivery: ['web'] });
  equal((await send(ID.student)).body.result, { sent: false, reason: 'delivery_off' });
  await f.memory.repository.saveNotifyPrefs(ID.student, { ...prefs, muted: ['centre'] });
  equal((await send(ID.student)).body.result.reason, 'muted');
  await f.memory.repository.saveNotifyPrefs(ID.student, prefs);
  equal((await send(ID.student, { path: 'https://evil.example/x' })).status, 500, 'buttons open Schood AI pages only');
  equal((await send(ID.student, { kind: 'Centre Brief' })).status, 500, 'kinds are checked');
  equal((await send(ID.student)).body.result, { sent: true }, 'refusals used none of the budget');
});

const PRICED = structuredClone(SEED_REGISTRY);
PRICED.models[0].inputUsdPerMTok = 1;
PRICED.models[0].outputUsdPerMTok = 2;

Deno.test('own model keys (C15): the workspace key, the fee instead of credits, never logged, no shared breaker', async () => {
  const keys = new Map<string, { label: string; apiKey: string; feeCredits?: number }>();
  let lookupFails = false;
  const f = fixture({
    modules, registry: PRICED,
    ownKey: ({ workspaceId, providerKey }) => lookupFails ? Promise.reject(new Error('vault down')) : Promise.resolve(providerKey === 'openrouter' ? keys.get(workspaceId) ?? null : null),
  });
  f.setProvider(() => completion('Yes, at 18:30.'));
  const own = f.memory.seed.centre({ name: 'University', ownerId: ID.outsider, contractPlan: 'enterprise' });
  const other = f.memory.seed.centre({ name: 'Other', ownerId: ID.owner, contractPlan: 'enterprise' });
  keys.set(own.id, { label: 'main', apiKey: 'sk-centre-0123456789' });

  const free = await system(f, 'centre/zz-pay', { id: own.id });
  equal([free.status, free.body.credits, free.body.charge], [200, 0, '']);
  equal(f.upstream.at(-1)!.headers.get('authorization'), 'Bearer sk-centre-0123456789', 'the centre\'s key');
  equal(f.memory.ledger.filter((row) => row.workspaceId === own.id && row.kind === 'charge').length, 0, 'no credits');
  await f.settle();
  const logged = f.memory.calls.at(-1)!;
  equal([logged.providerKey, logged.costUsd, logged.credits, logged.workspaceId], ['byok:main', 0, 0, own.id], 'their spend, not Schood\'s');
  ok(!JSON.stringify(f.memory.calls).includes('sk-centre'), 'the key is never logged');

  keys.set(own.id, { label: 'main', apiKey: 'sk-centre-0123456789', feeCredits: 2 });
  equal((await system(f, 'centre/zz-pay', { id: own.id })).body.credits, 2, 'the platform fee');
  equal(f.memory.ledger.filter((row) => row.workspaceId === own.id && row.kind === 'charge').map((row) => row.delta), [-2]);

  const normal = await system(f, 'centre/zz-pay', { id: other.id });
  equal([normal.body.credits, f.upstream.at(-1)!.headers.get('authorization')], [1, 'Bearer sk-or-test'], 'other workspaces use Schood\'s key and credits');

  // A failing own key: no fallback to Schood's key, the fee comes back, the shared model stays healthy.
  f.setProvider(() => new Response('{"error":"bad key"}', { status: 500 }));
  const before = f.upstream.length;
  for (let attempt = 0; attempt < 4; attempt++) equal((await system(f, 'centre/zz-pay', { id: own.id })).body.code, 'ai_failed');
  ok(f.upstream.slice(before).every((request) => request.headers.get('authorization') === 'Bearer sk-centre-0123456789'), 'only the centre\'s key was tried');
  ok(f.breaker.healthy(PRICED.models[0].key, f.now().getTime()), 'one centre\'s key never switches the model off for everyone');
  equal(f.memory.ledger.filter((row) => row.workspaceId === own.id && (row.kind === 'charge' || row.kind === 'refund')).reduce((sum, row) => sum + row.delta, 0), -2, 'every failed fee was refunded');

  // The key store is down: Schood's key and prices, never a free call.
  f.setProvider(() => completion('Yes.'));
  lookupFails = true;
  const fallback = await system(f, 'centre/zz-pay', { id: own.id });
  equal([fallback.body.credits, f.upstream.at(-1)!.headers.get('authorization')], [1, 'Bearer sk-or-test']);
});
