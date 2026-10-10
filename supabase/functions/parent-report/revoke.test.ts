import { revokeParentReport } from './revoke.ts';
const actor = 'e1b5598e-c571-4cdb-934f-e504433393c0';
const token = 'ca87b540-4a09-4fe4-ae1e-af8a9e660609';
const other = '8d4f281f-e67e-4f64-bc2b-4c5e686f9a35';
const assert = (condition: unknown) => { if (!condition) throw Error('Revocation assertion failed'); };
function fixture(data: unknown = { ok: true }, error: unknown = null) {
  const calls: { name: string; args: Record<string, string> }[] = [];
  const client = { rpc: (name: string, args: Record<string, string>) => {
    calls.push({ name, args }); return Promise.resolve({ data, error });
  } };
  return { calls, client };
}
Deno.test('revocation binds the database actor to verified Auth and ignores forged academy/creator IDs', async () => {
  const f = fixture();
  const response = await revokeParentReport('POST', actor, { token_id: token, p_actor: other, user_id: other, academy_id: other, created_by: other }, f.client);
  assert(response.status === 200 && f.calls.length === 1);
  assert(f.calls[0].name === 'parent_report_revoke');
  assert(JSON.stringify(f.calls[0].args) === JSON.stringify({ p_actor: actor, p_token_id: token }));
  assert(response.headers.get('Cache-Control') === 'no-store');
});
Deno.test('revocation rejects other HTTP methods without executing the database command', async () => {
  for (const method of ['GET', 'PUT', 'DELETE', 'PATCH']) {
    const f = fixture(); const response = await revokeParentReport(method, actor, { token_id: token }, f.client);
    assert(response.status === 405 && !f.calls.length);
  }
});
Deno.test('revocation rejects malformed or missing verified actors', async () => {
  for (const id of ['', 'other', `${actor}extra`]) {
    const f = fixture(); assert((await revokeParentReport('POST', id, { token_id: token }, f.client)).status === 401 && !f.calls.length);
  }
});
Deno.test('revocation rejects malformed token IDs and coerced request bodies', async () => {
  for (const body of [null, [], 1, '', {}, { token_id: null }, { token_id: 42 }, { token_id: `${token}extra` }, { token_id: { toString: () => token } }]) {
    const f = fixture(); assert((await revokeParentReport('POST', actor, body, f.client)).status === 400 && !f.calls.length);
  }
});
Deno.test('revocation reports the same access denial for unknown and unauthorized links', async () => {
  const f = fixture({ ok: false, code: 'report_revoke_denied', private_token: 'private-marker' });
  const response = await revokeParentReport('POST', actor, { token_id: token }, f.client);
  assert(response.status === 403 && !(await response.text()).includes('private-marker'));
});
Deno.test('revocation rejects closed or deactivated verified principals', async () => {
  const f = fixture({ ok: false, code: 'report_session_required' });
  assert((await revokeParentReport('POST', actor, { token_id: token }, f.client)).status === 401);
});
Deno.test('revocation fails closed for malformed, absent, or unexpected database decisions', async () => {
  for (const data of [null, true, [], {}, { ok: 'true' }, { ok: true, private_token: 'private-marker' }, { ok: false }, { ok: false, code: 'unreviewed-error' }]) {
    const f = fixture(data); const response = await revokeParentReport('POST', actor, { token_id: token }, f.client);
    assert(response.status === 503 && !(await response.text()).includes('private-marker'));
  }
});
Deno.test('revocation keeps schema failures and contention details private without unsafe fallback', async () => {
  for (const error of [{ code: 'PGRST202', message: 'private-function-schema' }, { code: '55P03', message: 'private-lock-error' }]) {
    const f = fixture({ ok: true }, error); const response = await revokeParentReport('POST', actor, { token_id: token }, f.client);
    assert(response.status === 503 && f.calls.length === 1 && !(await response.text()).includes('private-'));
  }
});
Deno.test('revocation hides unexpected runtime diagnostics', async () => {
  const response = await revokeParentReport('POST', actor, { token_id: token }, { rpc: () => { throw Error('private-runtime-marker'); } });
  assert(response.status === 503 && !(await response.text()).includes('private-runtime-marker'));
});
