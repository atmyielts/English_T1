import { CREDIT_PRICES, type CreditPrice } from '../../../packages/ai-core/src/mod.ts';
import { registerAgeSource, type AgeAnswer } from './age.ts';
import { completion, equal, fixture, ID, ok, personal, PRODUCT, SECRET, SYSTEM_SECRET, USERS } from './fixture.test.ts';
import { MODULES } from './handler.ts';
import { registerGenerationApproval, registerNotifyKind } from './registries.ts';
import { SchoodAIError, type FeatureModule, type RequestContext } from './types.ts';

// System routes (scheduled, no user), anonymous routes (no sign-in, per-IP
// limits), ctx.paidBy, ctx.credits.spend with age checks, forwarded headers on
// ctx.functions.call, the generation approval hook and notification preferences.

const codeOf = async (work: () => unknown) => {
  try { await work(); return 'ok'; } catch (cause) { return cause instanceof SchoodAIError ? cause.code : String(cause); }
};
const tries = (ctx: RequestContext) => Promise.all([
  codeOf(() => ctx.user.id), codeOf(() => ctx.workspace()), codeOf(() => ctx.ai.text({ key: 'tutor.reply', messages: [{ role: 'user', content: 'x' }] })),
  codeOf(() => ctx.events.emit({ kind: 'goal_set', area: 'coach', feature: 'B1' })), codeOf(() => ctx.credits.spend({ key: 'tutor.reply' })),
]);

const area: FeatureModule = {
  area: 'coach',
  routes: {
    'system-job': {
      system: true,
      async POST(ctx) {
        const body = await ctx.body<{ pay?: string }>();
        const refused = await tries(ctx);
        if (!body.pay) return { caller: ctx.caller, refused };
        const paid = await (await ctx.paidBy(body.pay)).text({ key: 'tutor.reply', messages: [{ role: 'user', content: 'Weekly brief' }] });
        return { caller: ctx.caller, credits: paid.credits, text: paid.text };
      },
    },
    play: { anonymous: { perMinute: 3, perDay: 5 }, async GET(ctx) { return { caller: ctx.caller, refused: await tries(ctx) }; } },
    widget: {
      anonymous: true,
      async POST(ctx) {
        const body = await ctx.body<{ workspace_id: string }>();
        const ai = await ctx.paidBy(body.workspace_id);
        const answer = await ai.text({ key: 'admissions.reply', messages: [{ role: 'user', content: 'Do you have IELTS evening classes?' }] });
        return { text: answer.text, credits: answer.credits };
      },
    },
    remote: {
      async POST(ctx) {
        const body = await ctx.body<{ headers: Record<string, string> }>();
        return { result: await ctx.functions.call('assessment-cloud', '/commands', { method: 'POST', body: { action: 'x' }, headers: body.headers }) };
      },
    },
    freeze: { async POST(ctx) { const spent = await ctx.credits.spend({ key: 'tutor.reply', reference: String((await ctx.body<{ ref: string }>()).ref) }); return { credits: spent.credits, replayed: spent.replayed, balance: spent.balance.total, charge: spent.chargeId }; } },
    unfreeze: { async POST(ctx) { const spent = await ctx.credits.spend({ key: 'tutor.reply', reference: String((await ctx.body<{ ref: string }>()).ref) }); await spent.refund(); return { ok: true }; } },
    nudge: { async POST(ctx) { return { decision: await ctx.notify.take(ctx.user.id, String((await ctx.body<{ kind: string }>()).kind)) }; } },
  },
};
const modules = [...MODULES.filter((module) => module.area !== 'coach'), area];
const system = (f: ReturnType<typeof fixture>, body: unknown, headers: Record<string, string> = {}) =>
  f.call('POST', 'coach/system-job', { token: null, origin: null, body, headers: { 'x-schood-service-secret': SYSTEM_SECRET, ...headers } });

Deno.test('system routes: the secret alone, never a person or a browser, and nothing can act as a user', async () => {
  const f = fixture({ modules });
  const ran = await f.json('POST', 'coach/system-job', { token: null, origin: null, body: {}, headers: { 'x-schood-service-secret': SYSTEM_SECRET } });
  equal([ran.status, ran.body.caller, ran.body.refused], [200, 'system', ['user_required', 'user_required', 'user_required', 'user_required', 'user_required']]);
  equal((await f.call('POST', 'coach/system-job', { token: null, origin: null, body: {}, headers: { 'x-schood-service-secret': SECRET } })).status, 200, 'the worker secret works too');
  equal((await f.call('POST', 'coach/system-job', { token: null, origin: null, body: {}, headers: { 'x-schood-service-secret': 'x'.repeat(40) } })).status, 401);
  equal((await f.call('POST', 'coach/system-job', { body: {} })).status, 401, 'a signed-in person cannot call it');
  equal((await system(f, {}, { 'x-schood-user-id': ID.plus, 'x-schood-telegram-chat-id': '700100' })).status, 400, 'it never acts for a person');
  equal((await f.call('POST', 'coach/system-job', { token: null, body: {}, headers: { 'x-schood-service-secret': SYSTEM_SECRET } })).status, 403, 'browsers cannot hold the secret');
  equal((await f.call('GET', 'core/me', { token: null, origin: null, headers: { 'x-schood-service-secret': SYSTEM_SECRET, 'x-schood-user-id': ID.plus, 'x-schood-telegram-chat-id': '700100' } })).status, 401, 'the system secret is for system routes only');

  // A scheduled job pays from a named workspace: a person's own (their brief), no user on the ledger.
  f.setProvider(() => completion('Your week: 3 essays.'));
  const ws = await personal(f, 'tok-plus');
  const paid = await f.json('POST', 'coach/system-job', { token: null, origin: null, body: { pay: ws }, headers: { 'x-schood-service-secret': SYSTEM_SECRET } });
  equal([paid.status, paid.body.credits, paid.body.text], [200, 1, 'Your week: 3 essays.']);
  const row = f.memory.ledger.find((entry) => entry.kind === 'charge' && entry.workspaceId === ws)!;
  equal(row.userId, null, 'the workspace paid, no person named');
  equal((await system(f, { pay: await personal(f, 'tok-free') })).status, 402, 'a workspace without the plan cannot pay');

  let threw = '';
  try { fixture({ modules: [{ area: 'coach', routes: { bad: { system: true, anonymous: true, GET: () => Promise.resolve({}) } } }] }); } catch (cause) { threw = String(cause); }
  ok(threw.includes('separate kinds'), 'a route is one kind of route');
});

Deno.test('anonymous routes: no sign-in, limited per IP, no AI unless a centre pays', async () => {
  const f = fixture({ modules });
  const ip = (address: string) => ({ 'x-forwarded-for': `${address}, 10.0.0.1` });
  const first = await f.json('GET', 'coach/play', { token: null, headers: ip('203.0.113.7') });
  equal([first.status, first.body.caller, first.body.refused], [200, 'anonymous', ['user_required', 'user_required', 'user_required', 'user_required', 'user_required']]);
  equal((await f.call('GET', 'coach/play', { token: 'tok-plus', headers: ip('203.0.113.7') })).status, 200, 'a token is ignored, the caller stays anonymous');
  equal((await f.call('GET', 'coach/play', { token: null, headers: ip('203.0.113.7') })).status, 200);
  const limited = await f.json('GET', 'coach/play', { token: null, headers: ip('203.0.113.7') });
  equal([limited.status, limited.body.code, typeof limited.body.retry_after], [429, 'rate_limited', 'string'], '3 a minute');
  equal((await f.call('GET', 'coach/play', { token: null, headers: ip('198.51.100.9') })).status, 200, 'another address has its own limit');
  f.advance(61_000);
  equal((await f.call('GET', 'coach/play', { token: null, headers: ip('203.0.113.7') })).status, 200, 'a new minute');
  f.advance(61_000);
  equal((await f.call('GET', 'coach/play', { token: null, headers: ip('203.0.113.7') })).status, 200);
  f.advance(61_000);
  equal((await f.call('GET', 'coach/play', { token: null, headers: ip('203.0.113.7') })).status, 429, '5 a day');
  ok(![...JSON.stringify([...f.memory.audit])].join('').includes('203.0.113.7'), 'the address is never stored');

  // The admissions widget: only the centre pays, only with a plan that includes it.
  f.setProvider(() => completion('Yes: Monday and Wednesday at 18:30.'));
  const basic = f.memory.seed.centre({ name: 'Registan', ownerId: ID.owner });
  const refused = await f.json('POST', 'coach/widget', { token: null, body: { workspace_id: basic.id } });
  equal([refused.status, refused.body.code], [402, 'plan_required'], 'Centre has no admissions agent; Centre Pro does');
  const pro = f.memory.seed.centre({ name: 'University', ownerId: ID.outsider, contractPlan: 'enterprise' });
  const answered = await f.json('POST', 'coach/widget', { token: null, body: { workspace_id: pro.id } });
  equal([answered.status, answered.body.text, answered.body.credits], [200, 'Yes: Monday and Wednesday at 18:30.', 1]);
  const charge = f.memory.ledger.find((row) => row.kind === 'charge' && row.workspaceId === pro.id)!;
  equal([charge.userId, charge.creditKey], [null, 'admissions.reply'], 'the centre pays; no visitor on the ledger');
  equal((await f.json('POST', 'coach/widget', { token: null, body: { workspace_id: await personal(f, 'tok-plus') } })).status, 500, 'a person\'s own credits never pay for visitors');
  equal(f.memory.ledger.filter((row) => row.kind === 'charge' && row.workspaceId !== pro.id).length, 0, 'nothing else was charged');
});

Deno.test('functions.call forwards only Idempotency-Key and If-Match', async () => {
  const f = fixture({ modules });
  equal((await f.json('POST', 'coach/remote', { body: { headers: { 'Idempotency-Key': 'cmd-12345678', 'if-match': '7' } } })).status, 200);
  equal(f.functionCalls.at(-1)!.init.headers, { 'Idempotency-Key': 'cmd-12345678', 'If-Match': '7' });
  equal((await f.json('POST', 'coach/remote', { body: { headers: { Authorization: 'Bearer stolen' } } })).status, 500, 'other headers are refused');
  equal((await f.json('POST', 'coach/remote', { body: { headers: { 'Idempotency-Key': 'a\r\nX-Evil: 1' } } })).status, 500, 'no header injection');
});

let age: AgeAnswer = null;
registerAgeSource('zz_test.age', () => Promise.resolve(age));

Deno.test('credits.spend: a priced action with no model call, idempotent, refundable, adults only when the price says so', async () => {
  const f = fixture({ modules });
  const spent = await f.json('POST', 'coach/freeze', { body: { ref: 'freeze-2026-w45' } });
  equal([spent.status, spent.body.credits, spent.body.replayed, spent.body.balance], [200, 1, false, 1499]);
  equal(f.upstream.length, 0, 'no model call');
  const again = await f.json('POST', 'coach/freeze', { body: { ref: 'freeze-2026-w45' } });
  equal([again.body.replayed, again.body.charge, again.body.balance], [true, spent.body.charge, 1499], 'the same reference is charged once');
  await f.json('POST', 'coach/unfreeze', { body: { ref: 'freeze-refund' } });
  equal((await f.json('GET', 'core/me')).body.credits.total, 1499, 'refunded');
  equal((await f.json('POST', 'coach/freeze', { token: 'tok-free', body: { ref: 'x' } })).body.code, 'plan_required');

  const entry = CREDIT_PRICES['tutor.reply'] as CreditPrice;
  entry.adultsOnly = true;
  try {
    age = null;
    const unknown = await f.json('POST', 'coach/freeze', { body: { ref: 'adult-1' } });
    equal([unknown.status, unknown.body.code, unknown.body.reason], [403, 'adult_required', 'unknown']);
    age = 'minor';
    equal((await f.json('POST', 'coach/freeze', { body: { ref: 'adult-2' } })).body.reason, 'minor');
    age = 'adult';
    equal((await f.json('POST', 'coach/freeze', { body: { ref: 'adult-3' } })).status, 200);
  } finally {
    delete entry.adultsOnly;
    age = null;
  }
});

let approvals = 0, failApproval = false;
registerGenerationApproval('zz_test.approval', (ctx, { generation }) => {
  approvals++;
  if (failApproval) return Promise.reject(new SchoodAIError('library_failed', 'The page could not be saved.', 503));
  return Promise.resolve({ page_id: `page-for-${generation.id.slice(0, 4)}`, by: ctx.user.id });
});

Deno.test('approving a generation runs its area hook; a failed hook leaves the job ready', async () => {
  const f = fixture({ modules });
  const ws = await personal(f, 'tok-teacher-plan');
  const job = await f.memory.repository.createGeneration({ workspaceId: ws, userId: ID.teacherPlan, feature: 'zz_test.approval', input: {}, status: 'ready' });
  failApproval = true;
  const failed = await f.json('POST', 'core/generations', { token: 'tok-teacher-plan', body: { id: job.id, decision: 'approve' } });
  equal([failed.status, failed.body.code, (await f.memory.repository.generation(job.id))!.status], [503, 'library_failed', 'ready']);
  failApproval = false;
  const approved = await f.json('POST', 'core/generations', { token: 'tok-teacher-plan', body: { id: job.id, decision: 'approve' } });
  equal([approved.body.generation.status, approved.body.result.by, approvals], ['approved', ID.teacherPlan, 2]);
  equal((await f.json('POST', 'core/generations', { token: 'tok-teacher-plan', body: { id: job.id, decision: 'approve' } })).body.result, undefined, 'approving again runs nothing');
});

registerNotifyKind('zz_test.ping', { area: 'coach', label: { en: 'Practice reminders', uz: 'Mashq eslatmalari', ru: 'Напоминания о практике' } });

Deno.test('notification preferences: the caller\'s own, validated, and ctx.notify follows them', async () => {
  const f = fixture({ modules });
  const read = await f.json('GET', 'core/notify-prefs', { headers: { 'x-schood-locale': 'uz' } });
  equal(read.body.prefs, { time_zone: 'Asia/Tashkent', quiet_start: 22, quiet_end: 8, daily_limit: 2, preferred_hour: null, delivery: ['telegram', 'web'], muted: [] });
  ok(read.body.kinds.some((kind: { key: string; label: string }) => kind.key === 'zz_test.ping' && kind.label === 'Mashq eslatmalari'), 'kinds in the request language');
  equal((await f.json('PUT', 'core/notify-prefs', { body: { time_zone: 'Mars/Olympus' } })).body.field, 'time_zone');
  equal((await f.json('PUT', 'core/notify-prefs', { body: { daily_limit: 5 } })).body.field, 'daily_limit');
  equal((await f.json('PUT', 'core/notify-prefs', { body: { delivery: ['sms'] } })).body.field, 'delivery');
  const saved = await f.json('PUT', 'core/notify-prefs', { body: { time_zone: 'Europe/Moscow', preferred_hour: 19, delivery: ['web'], muted: ['zz_test'], daily_limit: 1 } });
  equal([saved.body.prefs.time_zone, saved.body.prefs.preferred_hour, saved.body.prefs.delivery, saved.body.prefs.muted, saved.body.prefs.quiet_start], ['Europe/Moscow', 19, ['web'], ['zz_test'], 22]);
  // START is 06:00 UTC, 09:00 in Moscow.
  const muted = (await f.json('POST', 'coach/nudge', { body: { kind: 'zz_test.ping' } })).body.decision;
  equal([muted.allowed, muted.reason, muted.retryAt], [false, 'muted', '2026-11-03T05:00:00.000Z'], 'a muted area mutes its kinds; retry is tomorrow 08:00 Moscow');
  equal((await f.json('POST', 'coach/nudge', { body: { kind: 'coach.ielts' } })).body.decision.allowed, true);
  const spent = (await f.json('POST', 'coach/nudge', { body: { kind: 'coach.ielts' } })).body.decision;
  equal([spent.reason, spent.retryAt], ['daily_limit', '2026-11-03T05:00:00.000Z'], 'one a day, then tomorrow morning');
  equal((await f.json('GET', 'core/notify-prefs', { token: 'tok-free' })).body.prefs.daily_limit, 2, 'each person has their own');
  equal((await f.worker('core/notify-prefs', 'GET', ID.plus, '700100')).status, 200, 'the Telegram worker can read them for a linked person');
});

Deno.test('learning events read back in order from the repository', async () => {
  const f = fixture();
  await f.memory.repository.addLearningEvents([
    { userId: ID.plus, workspaceId: null, area: 'coach', kind: 'turn_scored', verified: true, feature: 'B1', skill: null, verifiedMinutes: 3, score: 6, outcome: null, ref: null, source: 'web' },
    { userId: ID.student, workspaceId: null, area: 'coach', kind: 'goal_set', verified: false, feature: 'B1', skill: null, verifiedMinutes: 0, score: null, outcome: null, ref: null, source: 'web' },
    { userId: ID.plus, workspaceId: null, area: 'coach', kind: 'mock_finished', verified: true, feature: 'B1', skill: null, verifiedMinutes: 30, score: 7, outcome: null, ref: null, source: 'web' },
  ]);
  const all = await f.memory.repository.learningEvents({ userId: ID.plus, limit: 10 });
  equal(all.map((row) => [row.id, row.kind]), [[1, 'turn_scored'], [3, 'mock_finished']]);
  equal((await f.memory.repository.learningEvents({ userId: ID.plus, afterId: 1, limit: 10 })).map((row) => row.kind), ['mock_finished']);
  void USERS; void PRODUCT;
});
