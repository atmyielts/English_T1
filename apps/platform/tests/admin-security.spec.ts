import { expect, type Page, test } from '@playwright/test';

const session = {
  access_token: 'admin-browser-contract',
  refresh_token: 'admin-browser-refresh',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: {
    id: '11111111-1111-4111-8111-111111111111',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'admin-qa@example.invalid',
    app_metadata: {},
    user_metadata: {},
    created_at: '2026-01-01T00:00:00Z',
  },
};
async function fixture(
  page: Page,
  options: { requireMfa?: boolean; aal?: string; meOutage?: boolean; settingsOutage?: boolean } = {},
) {
  let meOutage = options.meOutage, settingsOutage = options.settingsOutage;
  const writes: Record<string, unknown>[] = [];
  const policy = {
    id: 1,
    require_mfa: options.requireMfa ?? false,
    session_timeout_minutes: 30,
    rate_limit_per_minute: 120,
    ip_allowlist: [],
  };
  await page.context().addCookies([{
    name: 'schood-auth',
    value: encodeURIComponent(JSON.stringify(session)),
    domain: '127.0.0.1',
    path: '/',
    sameSite: 'Lax',
  }]);
  await page.route('**/auth/v1/**', (route) => route.fulfill({ json: session.user }));
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }));
  await page.route('**/functions/v1/**', async (route) => {
    const req = route.request(), url = new URL(req.url()), name = url.pathname.split('/').at(-1);
    if (name === 'me') {
      return route.fulfill({
        status: meOutage ? 503 : 200,
        json: meOutage ? { code: 'admin_security_unavailable' } : {
          user: { id: session.user.id, email: session.user.email, role: 'admin' },
          memberships: [],
          current_tenant: null,
          entitlements: [],
          admin: {
            is_admin: true,
            permissions: ['admin.*'],
            session_aal: options.aal ?? 'aal1',
            security_policy: policy,
          },
        },
      });
    }
    if (name === 'platform-settings') {
      if (settingsOutage) return route.fulfill({ status: 503, json: { code: 'admin_security_unavailable' } });
      if (url.searchParams.get('scope') === 'admin_security') {
        if (req.method() === 'PATCH') {
          const patch = req.postDataJSON();
          writes.push(patch);
          Object.assign(policy, patch);
        }
        return route.fulfill({ json: policy });
      }
      return route.fulfill({
        json: {
          id: 1,
          writing_ai_enabled: false,
          writing_ai_daily_limit: 5,
          student_center_enabled: true,
          classroom_v2_enabled: true,
          academy_video_uploads_enabled: false,
          academy_video_provider: 'cloudflare_stream',
        },
      });
    }
    if (name === 'academy-video') {
      return route.fulfill({
        json: { academies: [], health: { configured: false, fields: {}, provider: 'cloudflare_stream' } },
      });
    }
    return route.fulfill({ json: {} });
  });
  return {
    writes,
    recover: () => {
      meOutage = false;
      settingsOutage = false;
    },
  };
}
test('required MFA at AAL1 routes to enrollment/verification before any admin settings read', async ({ page }) => {
  const reads: string[] = [];
  page.on('request', (req) => {
    if (req.url().includes('/platform-settings')) reads.push(req.url());
  });
  await fixture(page, { requireMfa: true });
  await page.goto('/admin/settings');
  await expect(page).toHaveURL(/\/admin-mfa\?returnTo=%2Fadmin%2Fsettings/);
  await expect(page.getByRole('heading', { name: 'Admin MFA verification', exact: true })).toBeVisible();
  expect(reads).toEqual([]);
});
for (const requireMfa of [false, true]) {
  test(`settings show actual MFA ${requireMfa ? 'required' : 'optional'} and save without a downgrade`, async ({ page }) => {
    const f = await fixture(page, { requireMfa, aal: requireMfa ? 'aal2' : 'aal1' });
    await page.goto('/admin/settings');
    await expect(
      page.getByText(`MFA is ${requireMfa ? 'required' : 'optional'} under the saved admin policy.`, {
        exact: false,
      }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Save admin security', exact: true }).click();
    await expect.poll(() => f.writes.length).toBe(1);
    expect(f.writes[0]).toEqual({
      session_timeout_minutes: 30,
      rate_limit_per_minute: 120,
      ip_allowlist: [],
    });
    await expect(page.getByRole('link', { name: 'Manage your authenticator', exact: true })).toHaveAttribute(
      'href',
      '/admin-mfa?returnTo=%2Fadmin%2Fsettings',
    );
  });
}
test('admin bootstrap outage keeps session and retries access checks', async ({ page }) => {
  const f = await fixture(page, { meOutage: true });
  await page.goto('/admin/settings');
  await expect(page.getByRole('alert')).toHaveText(
    'Admin access checks are temporarily unavailable. Your session is retained.',
  );
  expect((await page.context().cookies()).some((cookie) => cookie.name === 'schood-auth')).toBe(true);
  f.recover();
  await page.getByRole('button', { name: 'Retry access check', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Platform Settings', exact: true })).toBeVisible();
});
test('initial settings failure is visible and can recover', async ({ page }) => {
  const f = await fixture(page, { settingsOutage: true });
  await page.goto('/admin/settings');
  await expect(page.getByRole('alert')).toHaveText(
    'Settings could not load. Retry when the service is available.',
  );
  f.recover();
  await page.getByRole('button', { name: 'Retry loading settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Platform Settings', exact: true })).toBeVisible();
});
