import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { handlePlatformSettings } from './handler.ts';
import { handleMe } from '../me/handler.ts';

Deno.test('admin settings and bootstrap HTTP policy contracts with intercepted transport', async (t) => {
  const originalFetch = globalThis.fetch;
  const keys = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
  const originalEnv = keys.map((key) => Deno.env.get(key));
  Deno.env.set('SUPABASE_URL', 'https://admin-contract.invalid');
  Deno.env.set('SUPABASE_ANON_KEY', 'admin-contract-public');
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'admin-contract-service-only');
  const id = '11111111-1111-4111-8111-111111111111';
  let policy = {
    id: 1,
    require_mfa: false,
    session_timeout_minutes: 30,
    rate_limit_per_minute: 120,
    ip_allowlist: [],
  };
  let active = true, policyError = false, auditError = false, updates: Record<string, unknown>[] = [];
  globalThis.fetch = async (input, init) => {
    const req = new Request(input, init), url = new URL(req.url);
    assertEquals(url.hostname, 'admin-contract.invalid', 'Unexpected external request');
    const json = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
    const one = (row: unknown) =>
      json(req.headers.get('Accept')?.includes('vnd.pgrst.object') ? row : row ? [row] : []);
    if (url.pathname === '/auth/v1/user') {
      return json({
        id,
        email: 'admin-qa@example.invalid',
        aud: 'authenticated',
        app_metadata: {},
        user_metadata: {},
      });
    }
    if (url.pathname.endsWith('/rpc/admin_rate_limit_consume')) {
      return json([{ allowed: true, request_count: 1 }]);
    }
    const table = url.pathname.split('/').at(-1);
    if (table === 'users') return one({ id, role: 'admin', is_active: active });
    if (table === 'admin_security_policies') {
      if (policyError) return json({ message: 'Internal provider detail', code: 'XX001' }, 503);
      if (req.method === 'PATCH') {
        const patch = await req.json();
        updates.push(patch);
        policy = { ...policy, ...patch };
      }
      return one(policy);
    }
    if (table === 'admin_audit_logs') {
      return auditError ? json({ message: 'Internal audit failure' }, 503) : json(null, 201);
    }
    if (table === 'tenant_memberships') return json([]);
    throw Error('Unexpected admin contract request: ' + url.pathname);
  };
  const request = (method = 'GET', body?: unknown, aal = 'aal2') =>
    new Request('https://edge-contract.invalid/platform-settings?scope=admin_security', {
      method,
      headers: {
        Authorization: 'Bearer test.' + btoa(JSON.stringify({ sub: id, aal })) + '.signature',
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  try {
    await t.step('GET returns actual saved MFA-off policy', async () => {
      const reply = await handlePlatformSettings(request());
      assertEquals(reply.status, 200);
      assertEquals((await reply.json()).require_mfa, false);
    });
    await t.step('GET returns actual saved MFA-on policy', async () => {
      policy.require_mfa = true;
      const reply = await handlePlatformSettings(request());
      assertEquals(reply.status, 200);
      assertEquals((await reply.json()).require_mfa, true);
    });
    await t.step(
      'routine settings edit retains required MFA and excludes it from database patch',
      async () => {
        const reply = await handlePlatformSettings(request('PATCH', { rate_limit_per_minute: 80 }));
        assertEquals(reply.status, 200);
        assertEquals((await reply.json()).require_mfa, true);
        assertEquals(updates.at(-1), { rate_limit_per_minute: 80 });
      },
    );
    await t.step('old tab forcing MFA-off cannot downgrade saved policy', async () => {
      const count = updates.length;
      assertEquals(
        (await handlePlatformSettings(request('PATCH', { require_mfa: false, rate_limit_per_minute: 90 })))
          .status,
        409,
      );
      assertEquals(updates.length, count);
      assertEquals(policy.require_mfa, true);
    });
    await t.step('MFA-on direct API access with AAL1 refused before settings update', async () => {
      const count = updates.length;
      const reply = await handlePlatformSettings(request('PATCH', { rate_limit_per_minute: 90 }, 'aal1'));
      assertEquals(reply.status, 403);
      assertEquals((await reply.json()).code, 'mfa_required');
      assertEquals(updates.length, count);
    });
    await t.step('old off-policy tab may save ordinary settings without changing MFA', async () => {
      policy.require_mfa = false;
      assertEquals(
        (await handlePlatformSettings(
          request('PATCH', { require_mfa: false, rate_limit_per_minute: 100 }, 'aal1'),
        )).status,
        200,
      );
      assertEquals(updates.at(-1), { rate_limit_per_minute: 100 });
      assertEquals(policy.require_mfa, false);
    });
    await t.step('bootstrap exposes actual policy and preserves MFA enrollment access at AAL1', async () => {
      policy.require_mfa = true;
      const reply = await handleMe(
        new Request('https://edge-contract.invalid/me', {
          headers: request('GET', undefined, 'aal1').headers,
        }),
      );
      assertEquals(reply.status, 200);
      const me = await reply.json();
      assertEquals(me.admin.security_policy.require_mfa, true);
      assertEquals(me.admin.session_aal, 'aal1');
    });
    await t.step('suspended account cannot bootstrap or update admin settings', async () => {
      active = false;
      const count = updates.length;
      assertEquals(
        (await handleMe(new Request('https://edge-contract.invalid/me', { headers: request().headers })))
          .status,
        403,
      );
      assertEquals(
        (await handlePlatformSettings(request('PATCH', { rate_limit_per_minute: 90 }))).status,
        403,
      );
      assertEquals(updates.length, count);
      active = true;
    });
    await t.step('security policy outage stays unavailable in bootstrap and settings', async () => {
      policyError = true;
      const me = await handleMe(
        new Request('https://edge-contract.invalid/me', { headers: request().headers }),
      );
      assertEquals(me.status, 503);
      assert(!(await me.text()).includes('Internal'));
      assertEquals((await handlePlatformSettings(request())).status, 503);
      policyError = false;
    });
    await t.step('admission audit outage prevents privileged settings change', async () => {
      auditError = true;
      const count = updates.length;
      assertEquals(
        (await handlePlatformSettings(request('PATCH', { rate_limit_per_minute: 90 }))).status,
        503,
      );
      assertEquals(updates.length, count);
      auditError = false;
    });
  } finally {
    globalThis.fetch = originalFetch;
    keys.forEach((key, i) =>
      originalEnv[i] === undefined ? Deno.env.delete(key) : Deno.env.set(key, originalEnv[i]!)
    );
  }
});
