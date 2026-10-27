import assert from 'node:assert/strict';
import test from 'node:test';
import { functionsBaseFor, regionFetch, withFunctionRegion } from '../src/core.mjs';

const base = functionsBaseFor('https://abc.supabase.co/');

test('only function URLs of this project get the region', () => {
  assert.equal(base, 'https://abc.supabase.co/functions/v1/');
  assert.equal(withFunctionRegion(`${base}sat-practice/bank`, base), `${base}sat-practice/bank?forceFunctionRegion=ap-southeast-1`);
  assert.equal(withFunctionRegion(`${base}x?a=1#h`, base), `${base}x?a=1&forceFunctionRegion=ap-southeast-1#h`);
  assert.equal(withFunctionRegion('https://abc.supabase.co/rest/v1/plans', base), 'https://abc.supabase.co/rest/v1/plans');
  assert.equal(withFunctionRegion('https://abc.supabase.co/auth/v1/token', base), 'https://abc.supabase.co/auth/v1/token');
  assert.equal(withFunctionRegion('https://other.supabase.co/functions/v1/x', base), 'https://other.supabase.co/functions/v1/x');
});

test('an existing region is never doubled and an empty region turns it off', () => {
  const pinned = `${base}x?forceFunctionRegion=us-east-1`;
  assert.equal(withFunctionRegion(pinned, base), pinned);
  assert.equal(withFunctionRegion(`${base}x`, base, ''), `${base}x`);
  assert.equal(withFunctionRegion(`${base}x`, ''), `${base}x`);
});

test('regionFetch rewrites strings, URLs and Requests and passes init through', async () => {
  const seen = [];
  const fake = async (input, init) => { seen.push([typeof input === 'string' ? input : input.url, init?.method ?? input?.method]); return new Response('{}'); };
  const f = regionFetch(fake, base);
  await f(`${base}a`, { method: 'POST' });
  await f(new URL(`${base}b`));
  await f(new Request(`${base}c`, { method: 'PATCH' }));
  await f('https://abc.supabase.co/rest/v1/plans');
  assert.deepEqual(seen, [
    [`${base}a?forceFunctionRegion=ap-southeast-1`, 'POST'],
    [`${base}b?forceFunctionRegion=ap-southeast-1`, undefined],
    [`${base}c?forceFunctionRegion=ap-southeast-1`, 'PATCH'],
    ['https://abc.supabase.co/rest/v1/plans', undefined],
  ]);
  assert.equal(f.schoodFunctionRegion, 'ap-southeast-1');
});
