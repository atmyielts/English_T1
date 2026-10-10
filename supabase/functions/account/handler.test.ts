import { handleAccountDeletion } from './handler.ts';
import { AccountDeletionError, deleteOwnAccount } from '../../../apps/platform/src/lib/accountDeletion.ts';
const actor = '11111111-1111-4111-8111-111111111111', other = '22222222-2222-4222-8222-222222222222';
const email = 'owner@example.invalid';
function assert(value: unknown, message = 'Assertion failed'): asserts value { if (!value) throw Error(message); }
const req = (body: unknown = { confirm_email: email }, headers: Record<string, string> = { Authorization: 'Bearer owned-test-token' }, method = 'DELETE') =>
  new Request('https://example.invalid/account', { method, headers, ...(method !== 'GET' ? { body: JSON.stringify(body) } : {}) });
function fixture() {
  const deleted: string[] = [], tokens: string[] = [];
  const client = { auth: {
    getUser: (token: string) => { tokens.push(token); return Promise.resolve({ data: { user: { id: actor, email } as { id: string; email: string } | null }, error: null as unknown }); },
    admin: { deleteUser: (id: string) => { deleted.push(id); return Promise.resolve({ error: null as unknown }); } },
  } };
  return { client, deleted, tokens };
}
Deno.test('account deletion requires bearer credentials before any Auth lookup', async () => {
  const variants: Record<string, string>[] = [{}, { Authorization: 'owned-test-token' }, { 'x-user-jwt': 'owned-test-token' }, { Authorization: 'Bearer ' + 'a'.repeat(8193) }];
  for (const headers of variants) {
    const f = fixture(); assert((await handleAccountDeletion(req({}, headers), f.client)).status === 401); assert(!f.tokens.length && !f.deleted.length);
  }
});
Deno.test('account deletion rejects conflicting proxy identity headers', async () => {
  const f = fixture(); assert((await handleAccountDeletion(req({}, { Authorization: 'Bearer actor-one', 'x-user-jwt': 'actor-two' }), f.client)).status === 401); assert(!f.tokens.length && !f.deleted.length);
});
Deno.test('account deletion accepts only DELETE and preflights without touching accounts', async () => {
  const f = fixture(); assert((await handleAccountDeletion(req({}, {}, 'GET'), f.client)).status === 405);
  assert((await handleAccountDeletion(req({}, {}, 'OPTIONS'), f.client)).status === 200); assert(!f.tokens.length && !f.deleted.length);
});
Deno.test('account deletion never uses a caller-supplied user ID', async () => {
  const f = fixture(); const response = await handleAccountDeletion(req({ confirm_email: ' OWNER@example.invalid ', user_id: other }), f.client);
  const body = await response.json(); assert(response.status === 200 && body.ok === true && body.actor_id === actor); assert(f.deleted.length === 1 && f.deleted[0] === actor);
  assert(response.headers.get('Cache-Control') === 'no-store');
});
Deno.test('account deletion requires current email and refuses previous-account confirmation', async () => {
  for (const body of [{}, null, { confirm_email: '' }, { confirm_email: 12 }, { confirm_email: 'other@example.invalid' }]) {
    const f = fixture(); const response = await handleAccountDeletion(req(body), f.client); assert(response.status === 400 || response.status === 409); assert(!f.deleted.length);
  }
});
Deno.test('account deletion bounds actual request bytes without trusting content length', async () => {
  const f = fixture(); assert((await handleAccountDeletion(req({ confirm_email: email, padding: 'x'.repeat(1025) }), f.client)).status === 400); assert(!f.deleted.length);
});
Deno.test('account deletion refuses invalid or missing provider identities', async () => {
  for (const id of ['', 'malformed']) {
    const f = fixture(); f.client.auth.getUser = () => Promise.resolve({ data: { user: { id, email } }, error: null });
    assert((await handleAccountDeletion(req(), f.client)).status === 401); assert(!f.deleted.length);
  }
});
Deno.test('account deletion treats provider throttling and outages as retryable', async () => {
  for (const status of [429, 500, 503]) {
    const f = fixture(); f.client.auth.getUser = () => Promise.resolve({ data: { user: null }, error: { status, message: 'private-provider-diagnostic' } });
    const response = await handleAccountDeletion(req(), f.client); assert(response.status === 503); assert(!(await response.text()).includes('private-provider-diagnostic')); assert(!f.deleted.length);
  }
});
Deno.test('account deletion keeps database retention failures private and never promises success', async () => {
  const f = fixture(); f.client.auth.admin.deleteUser = () => Promise.resolve({ error: { code: '23503', message: 'private-financial-record' } });
  const response = await handleAccountDeletion(req(), f.client); const text = await response.text(); assert(response.status === 503 && !text.includes('private-financial-record') && !text.includes('23503') && !text.includes('"ok":true'));
});
Deno.test('account deletion hides unexpected runtime diagnostics', async () => {
  const f = fixture(); f.client.auth.getUser = () => { throw Error('private-secret-diagnostic'); };
  const response = await handleAccountDeletion(req(), f.client); assert(response.status === 503 && !(await response.text()).includes('private-secret-diagnostic')); assert(!f.deleted.length);
});
function browserClient() {
  const session = { access_token: 'owned-browser-token', user: { id: actor, email } };
  let current: typeof session | null = session;
  const calls: { name: string; options: unknown }[] = [];
  const client = {
    auth: { getSession: () => Promise.resolve({ data: { session: current } }), getUser: (_token: string) => Promise.resolve({ data: { user: session.user as typeof session.user | null }, error: null as unknown }) },
    functions: { invoke: (name: string, options: unknown) => { calls.push({ name, options }); return Promise.resolve({ data: { ok: true, actor_id: actor } as unknown, error: null as unknown }); } },
  };
  return { client, calls, session, switchActor: () => { current = { access_token: 'other-token', user: { id: other, email: 'other@example.invalid' } }; } };
}
async function rejected(action: () => Promise<unknown>, code: string) {
  try { await action(); throw Error('Expected rejection'); } catch (error) { assert(error instanceof AccountDeletionError && error.code === code); }
}
Deno.test('account deletion client captures verified actor token and confirmation in one request', async () => {
  const f = browserClient(); const result = await deleteOwnAccount(f.client, actor, ' OWNER@example.invalid ', () => true);
  assert(result.actor === actor && f.calls.length === 1); const text = JSON.stringify(f.calls[0]); assert(text.includes('owned-browser-token') && text.includes('confirm_email') && !text.includes(other));
});
Deno.test('account deletion client rejects an already switched account without invoking deletion', async () => {
  const f = browserClient(); f.switchActor(); await rejected(() => deleteOwnAccount(f.client, actor, email, () => true), 'account_changed'); assert(!f.calls.length);
});
Deno.test('account deletion client rejects a switch while provider verification is pending', async () => {
  const f = browserClient(); f.client.auth.getUser = () => { f.switchActor(); return Promise.resolve({ data: { user: f.session.user }, error: null }); };
  await rejected(() => deleteOwnAccount(f.client, actor, email, () => true), 'account_changed'); assert(!f.calls.length);
});
Deno.test('account deletion client rejects an unmounted account screen', async () => {
  const f = browserClient(); let mounted = true; f.client.auth.getUser = () => { mounted = false; return Promise.resolve({ data: { user: f.session.user }, error: null }); };
  await rejected(() => deleteOwnAccount(f.client, actor, email, () => mounted), 'account_changed'); assert(!f.calls.length);
});
Deno.test('account deletion client rejects a mismatching verified Auth identity', async () => {
  const f = browserClient(); f.client.auth.getUser = () => Promise.resolve({ data: { user: { id: other, email } }, error: null });
  await rejected(() => deleteOwnAccount(f.client, actor, email, () => true), 'account_changed'); assert(!f.calls.length);
});
Deno.test('account deletion client does not refresh into another identity or reinterpret provider outage as signout', async () => {
  const f = browserClient(); f.client.auth.getUser = () => Promise.resolve({ data: { user: null }, error: { status: 503 } });
  await rejected(() => deleteOwnAccount(f.client, actor, email, () => true), 'delete_unavailable'); assert(!f.calls.length);
});
Deno.test('account deletion client rejects foreign success and unsuccessful transport', async () => {
  for (const data of [{ ok: true, actor_id: other }, { ok: false }, null]) {
    const f = browserClient(); f.client.functions.invoke = () => Promise.resolve({ data, error: null });
    await rejected(() => deleteOwnAccount(f.client, actor, email, () => true), 'delete_unavailable');
  }
});
Deno.test('account deletion client remains compatible with the installed legacy success shape', async () => {
  const f = browserClient(); f.client.functions.invoke = () => Promise.resolve({ data: { ok: true }, error: null });
  assert((await deleteOwnAccount(f.client, actor, email, () => true)).actor === actor);
});
