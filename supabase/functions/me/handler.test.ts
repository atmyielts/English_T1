import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleMe } from "./handler.ts";

const userId = '00000000-0000-4000-8000-000000000001';
const tenantId = '00000000-0000-4000-8000-000000000002';

async function withBackend(
  test: (calls: string[], pending: Set<string>) => Promise<void>,
  options: { unauthorized?: boolean; noMembership?: boolean; failedTable?: string } = {},
) {
  const originalFetch = globalThis.fetch;
  const env = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
  const previous = env.map((name) => Deno.env.get(name));
  Deno.env.set('SUPABASE_URL', 'https://account-test.invalid');
  Deno.env.set('SUPABASE_ANON_KEY', 'test-anon');
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test-service');
  const calls: string[] = [];
  const pending = new Set<string>();
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const table = url.pathname.split('/').pop()!;
    calls.push(table);
    if (table === 'user') return Response.json(options.unauthorized ? { message: 'Unauthorized' } : {
      id: userId, email: 'learner@example.test', aud: 'authenticated', app_metadata: {}, user_metadata: {},
    }, { status: options.unauthorized ? 401 : 200 });
    assertEquals(new Headers(init?.headers).get('authorization'), 'Bearer test-user-token');
    pending.add(table);
    // Both queries in each independent pair must have started before either
    // can finish. Sequential loading would deadlock until this guard rejects.
    const partner = { users: 'tenant_memberships', tenant_memberships: 'users', tenants: 'entitlements', entitlements: 'tenants' }[table];
    const deadline = Date.now() + 1000;
    while (partner && !calls.includes(partner)) {
      if (Date.now() > deadline) throw new Error(`Query waterfall: ${table} waited for ${partner}`);
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    pending.delete(table);
    if (table === options.failedTable) return Response.json({ message: 'Database unavailable' }, { status: 500 });
    if (table === 'users') return Response.json({ role: 'user' });
    if (table === 'tenant_memberships') {
      assertEquals(url.searchParams.get('user_id'), `eq.${userId}`);
      return Response.json(options.noMembership ? [] : [{ tenant_id: tenantId, role: 'student', status: 'active' }]);
    }
    if (table === 'tenants') {
      assertEquals(url.searchParams.get('id'), `eq.${tenantId}`);
      return Response.json({ id: tenantId, name: 'Academy', slug: 'academy', type: 'team' });
    }
    if (table === 'entitlements') {
      assertEquals(url.searchParams.get('tenant_id'), `eq.${tenantId}`);
      return Response.json([
        { id: 'active', resource_type: 'product', resource_id: 'ielts', starts_at: null, ends_at: null, value: null },
        { id: 'expired', resource_type: 'product', resource_id: 'sat', starts_at: null, ends_at: '2020-01-01', value: null },
      ]);
    }
    throw new Error(`Unexpected request: ${table}`);
  };
  try { await test(calls, pending); } finally {
    globalThis.fetch = originalFetch;
    env.forEach((name, i) => previous[i] === undefined ? Deno.env.delete(name) : Deno.env.set(name, previous[i]!));
  }
}

const request = () => new Request('https://account-test.invalid/functions/v1/me', { headers: { authorization: 'Bearer test-user-token' } });

Deno.test('profile queries overlap while retaining user scope and active entitlement filtering', () => withBackend(async (calls) => {
  const response = await handleMe(request());
  assertEquals(response.status, 200);
  const body = await response.json();
  assertEquals(body.user.id, userId);
  assertEquals(body.current_tenant.id, tenantId);
  assertEquals(body.entitlements.map((row: { id: string }) => row.id), ['active']);
  assertEquals(calls.length, 5);
}));

Deno.test('unauthorized request never starts database queries', () => withBackend(async (calls) => {
  assertEquals((await handleMe(request())).status, 401);
  assertEquals(calls, ['user']);
}, { unauthorized: true }));

Deno.test('user without membership never queries tenant data', () => withBackend(async (calls) => {
  const body = await (await handleMe(request())).json();
  assertEquals(body.current_tenant, null);
  assertEquals(body.entitlements, []);
  assertEquals(calls.sort(), ['tenant_memberships', 'user', 'users']);
}, { noMembership: true }));

Deno.test('entitlement failure does not return an apparently complete account', () => withBackend(async () => {
  assertEquals((await handleMe(request())).status, 500);
}, { failedTable: 'entitlements' }));
