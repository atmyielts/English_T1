import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { redeemVoucherRequest } from './redemption.ts';
const actor = '11111111-1111-4111-8111-111111111111',
  voucher = {
    id: '22222222-2222-4222-8222-222222222222',
    code: 'OWNED-TEST-VOUCHER',
    product_id: '33333333-3333-4333-8333-333333333333',
  };
const receipt = {
  ok: true,
  state: 'redeemed',
  deduped: true,
  voucher_id: voucher.id,
  beneficiary_id: actor,
  beneficiary_tenant_id: '44444444-4444-4444-8444-444444444444',
  redeemed_at: '2026-10-09T00:00:00Z',
  grant: { product_ids: [voucher.product_id], starts_at: '2026-10-09T00:00:00Z', ends_at: null },
};
Deno.test('voucher redemption actual adapter makes one atomic command with bearer actor and original code only', async () => {
  const calls: unknown[] = [];
  const response = await redeemVoucherRequest(
    {
      rpc(name, args) {
        calls.push([name, args]);
        return Promise.resolve({ data: { ...receipt, private_note: 'owned-private' }, error: null });
      },
    },
    actor,
    voucher,
  );
  assertEquals(calls, [['redeem_purchased_voucher', { p_actor: actor, p_code: voucher.code }]]);
  assertEquals(response.status, 200);
  assertEquals(response.body, { deduped: true, redeemed_at: receipt.redeemed_at, grant: receipt.grant });
});
Deno.test('voucher redemption current permission and reconciliation errors never leak SQL internals', async () => {
  for (
    const [code, status] of [['42501', 403], ['22023', 409], ['23505', 409], ['23514', 409], ['P0002', 409], [
      '55P03',
      503,
    ], ['08006', 503]] as const
  ) {
    const result = await redeemVoucherRequest(
      {
        rpc() {
          return Promise.resolve({ data: null, error: { code, message: 'owned SQL private email@example.invalid' } });
        },
      },
      actor,
      voucher,
    );
    assertEquals(result.status, status);
    assert(!JSON.stringify(result).includes('owned SQL'));
  }
  assertEquals(
    (await redeemVoucherRequest(
      {
        rpc() {
          throw Error('owned transport');
        },
      },
      actor,
      voucher,
    )).status,
    503,
  );
});
Deno.test('voucher redemption malformed or different beneficiary receipts never confirm access', async () => {
  for (
    const change of [
      { beneficiary_id: voucher.id },
      { voucher_id: actor },
      { beneficiary_tenant_id: null },
      { deduped: null },
      { redeemed_at: 'bad' },
      { grant: { ...receipt.grant, product_ids: [] } },
      { grant: { ...receipt.grant, product_ids: [voucher.product_id, voucher.product_id] } },
      { grant: { ...receipt.grant, product_ids: [actor] } },
      { grant: { ...receipt.grant, ends_at: 'bad' } },
      { grant: null },
    ]
  ) {
    assertEquals(
      (await redeemVoucherRequest(
        {
          rpc() {
            return Promise.resolve({ data: { ...receipt, ...change }, error: null });
          },
        },
        actor,
        voucher,
      )).status,
      503,
    );
  }
});
Deno.test('voucher redemption invalid actor code or product never reaches financial commands', async () => {
  let calls = 0;
  const rpc = {
    rpc() {
      calls++;
      return Promise.resolve({ data: receipt, error: null });
    },
  };
  assertEquals((await redeemVoucherRequest(rpc, 'unknown', voucher)).status, 400);
  assertEquals((await redeemVoucherRequest(rpc, actor, { ...voucher, code: 'x'.repeat(200) })).status, 400);
  assertEquals((await redeemVoucherRequest(rpc, actor, { ...voucher, product_id: 'unknown' })).status, 400);
  assertEquals(calls, 0);
});
