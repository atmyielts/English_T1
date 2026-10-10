import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { voucherPreview } from './preview.ts';
Deno.test('public voucher preview excludes assigned student name email phone and private purchase metadata', () => {
  const result = voucherPreview({
    id: 'owned-voucher',
    code: 'OWNED',
    access_kind: 'subscription',
    status: 'unused',
    expires_at: '2099-01-01T00:00:00Z',
    assigned_name: 'Private learner',
    assigned_email: 'private@example.invalid',
    assigned_phone: 'private-phone',
    redeemed_by: 'private-user',
    metadata: { secret: 'private-receipt' },
    products: {
      id: 'owned-product',
      name: 'Product',
      metadata: { slug: 'product', app_url: '/account', private_key: 'private-product' },
    },
    plans: { name: 'Plan', duration_days: 30 },
    plan_id: 'owned-plan',
  }, { name: 'Public center' });
  assertEquals(result.assigned_name, null);
  assertEquals(result.assigned_email, null);
  assert(!JSON.stringify(result).includes('private'));
  assertEquals(result.plan, { id: 'owned-plan', name: 'Plan', duration_days: 30 });
});
Deno.test('public voucher preview distinguishes expired unused vouchers from already committed redemption', () => {
  const voucher = { id: 'owned', code: 'OWNED', access_kind: 'subscription', expires_at: '2000-01-01T00:00:00Z' };
  assertEquals(voucherPreview({ ...voucher, status: 'unused' }, null).status, 'expired');
  assertEquals(voucherPreview({ ...voucher, status: 'redeemed' }, null).status, 'redeemed');
});
