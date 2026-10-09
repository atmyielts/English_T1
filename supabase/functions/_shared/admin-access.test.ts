import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { authorizeAdminRequest } from './admin-access.ts';

// Exclusive in-memory services. No Auth, customer database or provider contacted.
Deno.env.delete('SUPABASE_URL');
Deno.env.delete('SUPABASE_ANON_KEY');
const actor = '11111111-1111-4111-8111-111111111111';
const token = (claims: Record<string, unknown>) => `test.${btoa(JSON.stringify(claims))}.signature`;
const claims = { sub: actor, aal: 'aal1' };
const savedPolicy = {
  require_mfa: false,
  session_timeout_minutes: 30,
  rate_limit_per_minute: 120,
  ip_allowlist: [],
};
type Options = {
  active?: unknown;
  missingUser?: boolean;
  role?: string;
  policy?: unknown;
  fail?: 'auth' | 'user' | 'policy' | 'permissions' | 'rate' | 'audit';
  throws?: boolean;
  permissions?: string[];
  rate?: unknown;
  authStatus?: number;
  invalidAuth?: boolean;
};
function fixture(options: Options = {}) {
  const calls: string[] = [], audits: Record<string, unknown>[] = [];
  const response = (stage: string, data: unknown) => {
    calls.push(stage);
    if (options.fail === stage) {
      if (options.throws) throw Error('Private service details must not escape');
      return {
        data: null,
        error: { status: options.authStatus ?? 503, message: 'Private service details must not escape' },
      };
    }
    return { data, error: null };
  };
  const sb = {
    auth: {
      getUser: async (_token: string) =>
        options.invalidAuth ? { data: null, error: { status: 401 } } : response('auth', {
          user: { id: actor, email: 'admin-qa@example.invalid', user_metadata: { aal: 'aal2' } },
        }),
    },
    from(table: string) {
      const stage = table === 'users' ? 'user' : table === 'admin_security_policies' ? 'policy' : 'audit';
      const query = {
        select(_fields: string) {
          return query;
        },
        eq(_key: string, _value: unknown) {
          return query;
        },
        maybeSingle: async () =>
          response(
            stage,
            stage === 'user'
              ? options.missingUser
                ? null
                : { role: options.role ?? 'admin', is_active: 'active' in options ? options.active : true }
              : 'policy' in options
              ? options.policy
              : savedPolicy,
          ),
        insert: async (body: Record<string, unknown>) => {
          audits.push(body);
          return response('audit', null);
        },
      };
      return query;
    },
    rpc: async (name: string) =>
      name === 'admin_effective_permissions'
        ? response('permissions', options.permissions ?? ['admin.portal.access', 'admin.settings.manage'])
        : response('rate', 'rate' in options ? options.rate : [{ allowed: true, request_count: 1 }]),
  };
  async function authorize(
    payload: Record<string, unknown> = claims,
    extraHeaders: Record<string, string> = {},
  ) {
    const result = await authorizeAdminRequest(
      sb,
      new Request('https://admin-qa.invalid/settings', {
        method: 'PATCH',
        headers: { Authorization: 'Bearer ' + token(payload), ...extraHeaders },
      }),
      {},
      { requiredPermission: 'admin.settings.manage', action: 'settings.update' },
    );
    return {
      result,
      status: result.ok ? 200 : result.response.status,
      body: result.ok ? null : await result.response.json(),
    };
  }
  return { authorize, calls, audits };
}

Deno.test('saved MFA-off policy permits verified active admin; authorization is audited', async () => {
  const f = fixture(), { result } = await f.authorize();
  assert(result.ok);
  assertEquals(result.context.policy.require_mfa, false);
  assertEquals(f.audits.length, 1);
  assertEquals(f.audits[0].status_code, 200);
});
for (const active of [false, null, undefined, 'true']) {
  Deno.test(`inactive or malformed account ${String(active)} cannot access admin`, async () => {
    const f = fixture({ active });
    assertEquals((await f.authorize()).status, 403);
    assert(!f.calls.includes('rate'));
    assert(!f.calls.includes('policy'));
  });
}
Deno.test('missing public account cannot access admin', async () =>
  assertEquals((await fixture({ missingUser: true }).authorize()).status, 403));
for (const payload of [claims, { sub: actor, aal: 'aal3' }, { sub: 'other', aal: 'aal2' }, { sub: actor }]) {
  Deno.test(`stored MFA-on policy refuses ${JSON.stringify(payload)}`, async () => {
    const f = fixture({ policy: { ...savedPolicy, require_mfa: true } }), reply = await f.authorize(payload);
    assertEquals(reply.status, 403);
    assertEquals(reply.body.code, 'mfa_required');
    assert(!f.calls.includes('rate'));
  });
}
Deno.test('verified matching AAL2 honors stored MFA policy', async () => {
  const reply = await fixture({ policy: { ...savedPolicy, require_mfa: true } }).authorize({
    sub: actor,
    aal: 'aal2',
  });
  assert(reply.result.ok);
  assertEquals(reply.result.context.sessionAal, 'aal2');
});
Deno.test('invalid token rejected before any privileged database lookup', async () => {
  const f = fixture({ invalidAuth: true });
  assertEquals((await f.authorize()).status, 401);
  assert(!f.calls.includes('user'));
});
for (const stage of ['auth', 'user', 'policy', 'permissions', 'rate', 'audit'] as const) {
  for (const throws of [false, true]) {
    Deno.test(`${stage} ${throws ? 'throw' : 'error'} fails closed with bounded public detail`, async () => {
      const f = fixture({ fail: stage, throws, role: stage === 'permissions' ? 'admin_support' : 'admin' });
      const reply = await f.authorize();
      assertEquals(reply.status, 503);
      assertEquals(reply.body.code, 'admin_security_unavailable');
      assert(!JSON.stringify(reply.body).includes('Private service'));
      if (!reply.result.ok) assertEquals(reply.result.response.headers.get('Cache-Control'), 'no-store');
    });
  }
}
for (
  const policy of [
    null,
    {},
    { ...savedPolicy, require_mfa: 'false' },
    { ...savedPolicy, session_timeout_minutes: 0 },
    { ...savedPolicy, rate_limit_per_minute: 0 },
    { ...savedPolicy, ip_allowlist: null },
    { ...savedPolicy, ip_allowlist: [false] },
  ]
) {
  Deno.test(`missing or malformed policy ${JSON.stringify(policy)} never falls back to open access`, async () => {
    const f = fixture({ policy });
    assertEquals((await f.authorize()).status, 503);
    assert(!f.calls.includes('rate'));
  });
}
for (
  const rate of [null, [], [{ allowed: 'false', request_count: 1 }], [{ allowed: true, request_count: -1 }], [
    { allowed: true, request_count: 0 },
  ], [{ allowed: true, request_count: 1 }, { allowed: true, request_count: 2 }]]
) {
  Deno.test(`malformed rate receipt ${JSON.stringify(rate)} never permits access`, async () =>
    assertEquals((await fixture({ rate }).authorize()).status, 503));
}
Deno.test('valid exhausted rate receipt returns 429 and audits refusal', async () => {
  const f = fixture({ rate: [{ allowed: false, request_count: 121 }] });
  assertEquals((await f.authorize()).status, 429);
  assertEquals(f.audits[0].status_code, 429);
});
Deno.test('effective permissions must include both portal and operation access', async () => {
  for (const permissions of [[], ['admin.portal.access'], ['admin.settings.manage']]) {
    const f = fixture({ role: 'admin_support', permissions });
    assertEquals((await f.authorize()).status, 403);
    assert(!f.calls.includes('rate'));
  }
});
Deno.test('saved IP restriction denies missing or mismatching address and allows CIDR match', async () => {
  const f = fixture({ policy: { ...savedPolicy, ip_allowlist: ['192.0.2.0/24'] } });
  assertEquals((await f.authorize()).status, 403);
  assertEquals((await f.authorize(claims, { 'x-forwarded-for': '198.51.100.7' })).status, 403);
  assertEquals((await f.authorize(claims, { 'x-forwarded-for': '192.0.2.7' })).status, 200);
});
