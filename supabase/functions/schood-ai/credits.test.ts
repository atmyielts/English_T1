import { s } from '../../../packages/ai-core/src/mod.ts';
import { completion, equal, fixture, ID, ok, personal } from './fixture.test.ts';
import { MODULES } from './handler.ts';
import type { FeatureModule } from './types.ts';

// Credits through ctx.ai: the exact price from ai-core, charged before the call,
// refunded on failure, idempotent per request key, and plan cycles. Real concurrent
// sessions against Postgres are covered by scripts/test-schood-ai-db.mjs; here the
// same rules are checked against the memory repository.

const worksheet = s.object({ title: s.string({ max: 80 }), items: s.array(s.string(), { min: 1, max: 20 }) });
const studio: FeatureModule = {
  area: 'teacher',
  routes: {
    generate: {
      POST: async (ctx) => {
        const body = await ctx.body<{ differentiate?: boolean; credits?: number }>();
        const result = await ctx.ai.json({ key: 'material.generate', addOns: body.differentiate ? ['material.differentiate'] : [], schema: worksheet, messages: [{ role: 'system', content: 'Make a worksheet.' }, { role: 'user', content: 'Travel, B1' }] });
        return { data: result.data, credits: result.credits, balance: result.balance.total };
      },
    },
    checked: {
      // Two model calls under one charge: generate, then solve without the key (T2).
      POST: async (ctx) => {
        const result = await ctx.ai.charged({ key: 'material.exam_set', mode: 'json' }, async (session) => {
          const set = await session.json({ schema: worksheet, messages: [{ role: 'user', content: 'Generate' }] });
          const check = await session.text({ messages: [{ role: 'user', content: 'Solve' }] });
          return { set, check };
        });
        return { credits: result.credits, result: result.result };
      },
    },
  },
};
const modules = [...MODULES.filter((module) => module.area !== 'teacher'), studio];

Deno.test('charges exactly the ai-core price, never a client cost, and refunds a failed call', async () => {
  const f = fixture({ modules });
  f.setProvider(() => completion('{"title":"Travel","items":["Pack a bag"]}'));
  const one = await f.json('POST', 'teacher/generate', { token: 'tok-teacher-plan', body: { credits: 1 } });
  equal([one.status, one.body.credits, one.body.balance], [200, 10, 2990], 'Teacher plan: 3,000 credits, a worksheet costs 10');
  const two = await f.json('POST', 'teacher/generate', { token: 'tok-teacher-plan', body: { differentiate: true } });
  equal([two.body.credits, two.body.balance], [20, 2970], 'three levels add 10');
  f.setProvider(() => new Response('', { status: 500 }));
  const failed = await f.json('POST', 'teacher/generate', { token: 'tok-teacher-plan' });
  equal([failed.status, failed.body.code, failed.body.reason], [502, 'ai_failed', 'server_error']);
  equal((await f.json('GET', 'core/credits', { token: 'tok-teacher-plan' })).body.balance.total, 2970, 'refunded');
  const ws = await personal(f, 'tok-teacher-plan');
  const charges = f.memory.ledger.filter((row) => row.workspaceId === ws && (row.kind === 'charge' || row.kind === 'refund'));
  equal(charges.map((row) => [row.kind, row.delta, row.creditKey]), [['charge', -10, 'material.generate'], ['charge', -20, 'material.generate'], ['charge', -10, 'material.generate'], ['refund', 10, 'material.generate']]);
  equal((await f.json('POST', 'teacher/generate', { token: 'tok-plus' })).body.code, 'plan_required', 'Plus does not include the Studio');
});

Deno.test('one request key is charged once; a refunded key needs a new one', async () => {
  const f = fixture({ modules });
  f.setProvider(() => completion('{"title":"T","items":["a"]}'));
  const key = { 'idempotency-key': 'req-0001-abcdef' };
  equal((await f.json('POST', 'teacher/generate', { token: 'tok-teacher-plan', headers: key })).body.balance, 2990);
  equal((await f.json('POST', 'teacher/generate', { token: 'tok-teacher-plan', headers: key })).body.balance, 2990, 'a retried request is not charged again');
  f.setProvider(() => new Response('', { status: 503 }));
  const other = { 'idempotency-key': 'req-0002-abcdef' };
  equal((await f.json('POST', 'teacher/generate', { token: 'tok-teacher-plan', headers: other })).body.code, 'ai_failed');
  f.setProvider(() => completion('{"title":"T","items":["a"]}'));
  equal((await f.json('POST', 'teacher/generate', { token: 'tok-teacher-plan', headers: other })).body.code, 'retry_with_new_key', 'a failed attempt is not a free retry');
});

Deno.test('several calls under one charge: refunded if any of them fails', async () => {
  const f = fixture({ modules });
  let turn = 0;
  f.setProvider(() => completion(turn++ === 0 ? '{"title":"IELTS Reading","items":["Q1"]}' : 'Key checked: 1 of 1 agree'));
  const done = await f.json('POST', 'teacher/checked', { token: 'tok-teacher-plan' });
  equal([done.body.credits, done.body.result.check, f.memory.ledger.filter((row) => row.kind === 'charge').length], [15, 'Key checked: 1 of 1 agree', 1]);
  turn = 0;
  f.setProvider(() => (turn++ === 0 ? completion('{"title":"Set","items":["Q1"]}') : new Response('', { status: 500 })));
  equal((await f.json('POST', 'teacher/checked', { token: 'tok-teacher-plan' })).body.code, 'ai_failed');
  equal((await f.json('GET', 'core/credits', { token: 'tok-teacher-plan' })).body.balance.total, 2985, 'the whole charge came back');
});

Deno.test('insufficient credits, packs after plan credits, and racing charges never overspend', async () => {
  const f = fixture({ modules });
  f.setProvider(() => completion('{"title":"T","items":["a"]}'));
  const ws = await personal(f, 'tok-teacher-plan');
  f.memory.accounts.get(ws)!.plan = 5;
  await f.memory.repository.grantCredits({ workspaceId: ws, amount: 7, kind: 'pack', reference: 'order-1', userId: ID.teacherPlan });
  equal((await f.json('POST', 'teacher/generate', { token: 'tok-teacher-plan' })).body.balance, 2, 'five plan credits, then five from the pack');
  const poor = await f.json('POST', 'teacher/generate', { token: 'tok-teacher-plan' });
  equal([poor.status, poor.body.code, poor.body.available, poor.body.cost], [402, 'insufficient_credits', 2, 10]);
  // 20 requests race for a 50-credit pack, 3 credits each (a speaking turn costs 1, so use the repository directly).
  const raced = fixture();
  const racer = await personal(raced, 'tok-free');
  await raced.memory.repository.grantCredits({ workspaceId: racer, amount: 50, kind: 'pack', reference: 'race', userId: ID.free });
  const results = await Promise.all(Array.from({ length: 20 }, (_, i) => raced.memory.repository.charge({ workspaceId: racer, userId: ID.free, cost: 3, creditKey: 'tutor.reply', reference: `r-${i}`, grant: 0, anchor: null })));
  equal([results.filter((r) => r.ok).length, raced.memory.accounts.get(racer)!.pack], [16, 2], 'the balance never goes below zero');
  const same = await Promise.all(Array.from({ length: 5 }, () => raced.memory.repository.charge({ workspaceId: racer, userId: ID.free, cost: 1, creditKey: 'tutor.reply', reference: 'same', grant: 0, anchor: null })));
  equal([same.filter((r) => r.ok && !r.replayed).length, raced.memory.accounts.get(racer)!.pack], [1, 1], 'one charge per key');
});

Deno.test('plan credits follow the purchase: one grant per 30-day cycle, upgrades top up, renewals restart', async () => {
  const f = fixture();
  const ws = (await f.memory.repository.ensurePersonalWorkspace(ID.plus, 'Dilnoza')).id;
  const bought = '2026-11-01T00:00:00.000Z';
  const balance = (grant: number, anchor: string | null = bought) => f.memory.repository.creditBalance(ws, grant, anchor);
  equal([(await balance(1500)).total, (await balance(1500)).cycleEndsAt], [1500, '2026-12-01T00:00:00.000Z']);
  await f.memory.repository.charge({ workspaceId: ws, userId: ID.plus, cost: 100, creditKey: 'essay.review', reference: 'c1', grant: 1500, anchor: bought });
  f.advance(20 * 86_400_000);
  equal((await balance(1500)).plan, 1400, 'weeks without a visit change nothing inside a cycle');
  equal((await balance(4500)).plan, 4400, 'an upgrade adds the difference');
  equal((await balance(4500)).plan, 4400, 'once');
  f.advance(11 * 86_400_000);
  const next = await balance(4500);
  equal([next.plan, next.cycleEndsAt], [4500, '2026-12-31T00:00:00.000Z'], 'a 90-day plan: the second cycle');
  ok(f.memory.ledger.some((row) => row.kind === 'expire' && row.delta === -4400), 'unused plan credits expire');
  f.advance(40 * 86_400_000);
  const renewed = '2027-01-10T00:00:00.000Z';
  const fresh = await balance(1500, renewed);
  equal([fresh.plan, fresh.cycleEndsAt], [1500, '2027-02-09T00:00:00.000Z'], 'a renewal starts its own cycle');
  equal((await balance(1500, renewed)).plan, 1500, 'and is granted once');
  equal((await balance(0)).plan, 1500, 'without a plan the credits stay; the features lock');
  const sums = (bucket: string) => f.memory.ledger.filter((row) => row.workspaceId === ws && row.bucket === bucket).reduce((sum, row) => sum + row.delta, 0);
  equal(sums('plan'), f.memory.accounts.get(ws)!.plan, 'the ledger explains the balance');
});
