/// <reference lib="deno.ns" />
import { assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  finishVoucherAttempt,
  readVoucherAttempt,
  saveVoucherAttempt,
  type VoucherAttempt,
  voucherChoices,
} from '../src/lib/voucher-attempt.ts';
const actor = '11111111-1111-4111-8111-111111111111',
  tenant = '22222222-2222-4222-8222-222222222222',
  plan = '33333333-3333-4333-8333-333333333333',
  key = '44444444-4444-4444-8444-444444444444';
const raw = {
  tenant_id: tenant,
  access_kind: 'subscription',
  quantity: 1,
  expires_in_days: 30,
  prefix: ' SCH ',
  plan_id: plan,
  assigned_students: [{ name: ' Owned learner ', email: ' QA@EXAMPLE.INVALID ' }],
};
const store = () => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
};
const attempt = (): VoucherAttempt => ({ version: 1, actor, tenant, key, choices: voucherChoices(raw, tenant) });
Deno.test('voucher recovery stores only normalized original choices and excludes credentials caller prices and funding', () => {
  const value = voucherChoices({
    ...raw,
    access_token: 'must-not-store',
    source_model: 'manual',
    amount: 0,
    funding: { source_model: 'manual' },
    user_id: actor,
  }, tenant);
  assertEquals(value.assigned_students, [{ name: 'Owned learner', email: 'qa@example.invalid' }]);
  assertEquals(value.prefix, 'SCH');
  assertEquals(Object.keys(value).includes('access_token'), false);
  assertEquals(Object.keys(value).includes('source_model'), false);
  const storage = store(), saved = { ...attempt(), choices: value };
  saveVoucherAttempt(saved, storage);
  assertEquals(readVoucherAttempt(actor, tenant, storage), saved);
});
Deno.test('voucher recovery preserves a roster larger than the old eight kilobyte checkout bound', () => {
  const storage = store(),
    choices = voucherChoices({
      ...raw,
      quantity: 200,
      assigned_students: Array.from(
        { length: 200 },
        (_, i) => ({
          name: 'Owned roster learner ' + i,
          email: 'owned-qa-' + i + '@example.invalid',
          phone: '+10000000000',
        }),
      ),
    }, tenant);
  const value = { ...attempt(), choices };
  saveVoucherAttempt(value, storage);
  assertEquals(JSON.stringify(value).length > 8192, true);
  assertEquals(readVoucherAttempt(actor, tenant, storage), value);
});
Deno.test('voucher recovery refuses unreadable truncated or tampered original records rather than starting another request', () => {
  const storage = store(), value = attempt();
  saveVoucherAttempt(value, storage);
  const name = [...storage.data.keys()][0];
  for (
    const raw of [
      '{',
      JSON.stringify({ ...value, actor: tenant }),
      JSON.stringify({ ...value, choices: { ...value.choices, amount: 0 } }),
      JSON.stringify({ ...value, key: 'bad' }),
      JSON.stringify({ ...value, choices: { ...value.choices, quantity: 0 } }),
    ]
  ) {
    storage.data.set(name, raw);
    assertThrows(() => readVoucherAttempt(actor, tenant, storage), Error, 'needs review');
  }
});
Deno.test('voucher recovery never admits a purchase after storage quota or persistence failure', () => {
  const storage = store();
  storage.setItem = () => {
    throw Error('quota');
  };
  assertThrows(() => saveVoucherAttempt(attempt(), storage), Error, 'No new request was sent');
  const silent = store();
  silent.setItem = () => {};
  assertThrows(() => saveVoucherAttempt(attempt(), silent), Error, 'No new request was sent');
  const unreadable = store();
  unreadable.getItem = () => {
    throw Error('denied');
  };
  assertThrows(() => readVoucherAttempt(actor, tenant, unreadable), Error, 'cannot read');
});
Deno.test('voucher recovery cannot overwrite or retire a different active reference and retains failed cleanup', () => {
  const storage = store(), value = attempt();
  saveVoucherAttempt(value, storage);
  const other = { ...value, key: plan };
  assertThrows(() => saveVoucherAttempt(other, storage), Error, 'original voucher');
  assertThrows(() => finishVoucherAttempt(other, storage), Error, 'reference changed');
  assertEquals(readVoucherAttempt(actor, tenant, storage), value);
  storage.removeItem = () => {};
  assertThrows(() => finishVoucherAttempt(value, storage), Error, 'could not clear');
  assertEquals(readVoucherAttempt(actor, tenant, storage), value);
  const clean = store();
  saveVoucherAttempt(value, clean);
  finishVoucherAttempt(value, clean);
  assertEquals(readVoucherAttempt(actor, tenant, clean), null);
});
Deno.test('voucher recovery rejects invalid resources quantities roster bounds and oversized Unicode requests before saving', () => {
  for (
    const invalid of [{ quantity: 0 }, { quantity: 1.5 }, { plan_id: 'bad' }, { prefix: 'bad prefix' }, {
      expires_in_days: 366,
    }, { assigned_students: [{ email: 7 }] }]
  ) assertThrows(() => voucherChoices({ ...raw, ...invalid }, tenant));
  assertThrows(
    () =>
      voucherChoices({
        ...raw,
        quantity: 1000,
        assigned_students: Array.from(
          { length: 1000 },
          () => ({ name: 'Я'.repeat(190), email: 'a@owned.example.invalid' }),
        ),
      }, tenant),
    Error,
    'too large',
  );
});
