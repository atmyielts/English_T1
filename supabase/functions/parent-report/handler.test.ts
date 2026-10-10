import { createParentReportHandler } from './handler.ts';
const actor = 'e1b5598e-c571-4cdb-934f-e504433393c0';
const tokenId = 'ca87b540-4a09-4fe4-ae1e-af8a9e660609';
const other = '8d4f281f-e67e-4f64-bc2b-4c5e686f9a35';
const assert = (value: unknown) => { if (!value) throw Error('Parent report HTTP assertion failed'); };
function fixture() {
  const rows: Record<string, Record<string, unknown>[]> = {
    parent_report_tokens: [{ id: tokenId, token: 'owned-public-capability', academy_id: 'academy-a', contact_id: 'student-a', created_by: other, is_active: true, expires_at: null, view_count: 0 }],
    academy_contacts: [{ id: 'student-a', academy_id: 'academy-a', first_name: 'Synthetic', last_name: 'Student', email: 'owned-private-student-marker' }],
    tenants: [{ id: 'academy-a', name: 'Owned academy', metadata: {} }],
    tenant_memberships: [{ tenant_id: 'academy-a', user_id: actor, role: 'owner', status: 'active' }],
  };
  const errors: Record<string, unknown> = {};
  const queries: { table: string; operation: string; filters: Record<string, unknown> }[] = [];
  const authTokens: string[] = [], rpcs: { name: string; args: Record<string, string> }[] = [];
  let authUser: { id: string } | null = { id: actor }, authError: unknown = null;
  let rpcData: unknown = { ok: true }, rpcError: unknown = null;
  const client = {
    auth: { getUser: (token: string) => { authTokens.push(token); return Promise.resolve({ data: { user: authUser }, error: authError }); } },
    rpc: (name: string, args: Record<string, string>) => { rpcs.push({ name, args }); return Promise.resolve({ data: rpcData, error: rpcError }); },
    from: (table: string) => {
      const query = { table, operation: 'read', filters: {} as Record<string, unknown> }; queries.push(query);
      let single = false;
      const result = () => {
        const data = (rows[table] ?? []).filter(row => Object.entries(query.filters).every(([key, value]) => row[key] === value));
        return { data: errors[table] ? null : single ? data[0] ?? null : data, error: errors[table] ?? null };
      };
      const builder = {
        select: (_fields: string) => builder,
        eq: (column: string, value: unknown) => { query.filters[column] = value; return builder; },
        order: (_column: string, _options: unknown) => builder,
        limit: (_limit: number) => builder,
        update: (_values: unknown) => { query.operation = 'update'; return builder; },
        insert: (_values: unknown) => { query.operation = 'insert'; return builder; },
        maybeSingle: () => { single = true; return Promise.resolve(result()); },
        then: (resolve: (value: ReturnType<typeof result>) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject),
      };
      return builder;
    },
  };
  const factory = (() => client) as unknown as NonNullable<Parameters<typeof createParentReportHandler>[0]>;
  const handle = createParentReportHandler(factory, key => ({ SUPABASE_URL: 'https://owned.example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'owned-service-fixture', SUPABASE_ANON_KEY: 'owned-anon-fixture' } as Record<string, string>)[key]);
  return { handle, rows, errors, queries, authTokens, rpcs,
    setAuth: (user: typeof authUser, error: unknown = null) => { authUser = user; authError = error; },
    setRpc: (data: unknown, error: unknown = null) => { rpcData = data; rpcError = error; }, factory };
}
const read = () => new Request('https://owned.example.invalid/parent-report?token=owned-public-capability');
const revoke = (headers: Record<string, string> = { Authorization: 'Bearer owned-verified-token' }) => new Request('https://owned.example.invalid/parent-report?action=revoke_token', {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ token_id: tokenId, user_id: other, academy_id: other, p_actor: other }),
});
Deno.test('actual report HTTP handler verifies Auth before using the fixed revocation command', async () => {
  const f = fixture(), response = await f.handle(revoke({ Authorization: 'Bearer owned-verified-token', 'x-schood-jwt': 'forged-actor-token' }));
  assert(response.status === 200 && f.authTokens[0] === 'owned-verified-token');
  assert(f.rpcs.length === 1 && f.rpcs[0].args.p_actor === actor && f.rpcs[0].args.p_token_id === tokenId);
  assert(!f.queries.some(query => query.table === 'parent_report_tokens' && query.operation === 'update'));
});
Deno.test('actual report HTTP handler rejects missing and rejected authentication without a command', async () => {
  const missing = fixture(); assert((await missing.handle(revoke({}))).status === 401 && !missing.rpcs.length);
  const rejected = fixture(); rejected.setAuth(null, { message: 'private-auth-marker' });
  const response = await rejected.handle(revoke()); assert(response.status === 401 && !rejected.rpcs.length && !(await response.text()).includes('private-auth-marker'));
});
Deno.test('actual report HTTP handler preserves current-authority denial and unavailable-schema failure', async () => {
  const f = fixture(); f.setRpc({ ok: false, code: 'report_revoke_denied' }); assert((await f.handle(revoke())).status === 403);
  f.setRpc(null, { message: 'private-schema-marker' }); const response = await f.handle(revoke());
  assert(response.status === 503 && !(await response.text()).includes('private-schema-marker'));
});
Deno.test('Auth outages are retryable and cannot cause revocation or expose provider details', async () => {
  for (const status of [429, 500, 503]) {
    const f = fixture(); f.setAuth(null, { status, message: 'private-auth-outage' }); const response = await f.handle(revoke());
    assert(response.status === 503 && !f.rpcs.length && !(await response.text()).includes('private-auth-outage'));
  }
});
Deno.test('valid public report stays unauthenticated and private responses cannot be cached', async () => {
  const f = fixture(), response = await f.handle(read()); const body = await response.json();
  assert(response.status === 200 && !f.authTokens.length && body.contact.id === 'student-a');
  assert(response.headers.get('Cache-Control') === 'no-store');
  assert(f.queries.some(query => query.table === 'academy_contacts' && query.filters.academy_id === 'academy-a'));
});
Deno.test('actual public report denies a valid contact ID belonging to another academy', async () => {
  const f = fixture(); f.rows.academy_contacts[0].academy_id = 'academy-b';
  const response = await f.handle(read()); assert(response.status === 404 && !(await response.text()).includes('owned-private-student-marker'));
});
Deno.test('public report data failures do not report empty success or expose diagnostics', async () => {
  for (const table of ['academy_contacts', 'tenants', 'academy_classroom_memberships', 'academy_submissions', 'academy_attendance']) {
    const f = fixture(); f.errors[table] = { message: 'private-query-marker' };
    const response = await f.handle(read()); const body = await response.text();
    assert(response.status === 503 && !body.includes('private-query-marker') && !body.includes('owned-private-student-marker'));
  }
});
Deno.test('revoked, expired and unknown public report links remain denied', async () => {
  const revoked = fixture(); revoked.rows.parent_report_tokens[0].is_active = false; assert((await revoked.handle(read())).status === 404);
  const expired = fixture(); expired.rows.parent_report_tokens[0].expires_at = '2000-01-01T00:00:00Z'; assert((await expired.handle(read())).status === 410);
  const missing = fixture(); missing.rows.parent_report_tokens = []; assert((await missing.handle(read())).status === 404);
});
Deno.test('generate token database failures stay private and cannot create a success URL', async () => {
  const f = fixture(); f.errors.parent_report_tokens = { message: 'private-generation-marker' };
  const response = await f.handle(new Request('https://owned.example.invalid/parent-report?action=generate_token', {
    method: 'POST', headers: { Authorization: 'Bearer owned-verified-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ academy_id: 'academy-a', contact_id: 'student-a' }),
  }));
  const body = await response.text(); assert(response.status === 503 && !body.includes('private-generation-marker') && !body.includes('share_url'));
});
Deno.test('missing report service configuration stays private and preflight still works', async () => {
  const f = fixture(), handle = createParentReportHandler(f.factory, () => undefined);
  assert((await handle(new Request('https://owned.example.invalid', { method: 'OPTIONS' }))).status === 200);
  const response = await handle(read()); assert(response.status === 503 && !(await response.text()).includes('SUPABASE_'));
});
