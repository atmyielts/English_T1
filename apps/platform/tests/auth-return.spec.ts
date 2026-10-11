import { expect, test, type Page } from '@playwright/test';

async function signedReturnFixture(page: Page) {
  const session = {
    access_token: 'return-contract-access', refresh_token: 'return-contract-refresh',
    token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: {
      id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', role: 'authenticated',
      email: 'return-qa@example.invalid', app_metadata: {}, created_at: '2026-01-01T00:00:00Z',
      user_metadata: { first_name: 'Readiness', last_name: 'QA', phone: '+12025550143' },
    },
  };
  await page.context().addCookies([{
    name: 'schood-auth', value: encodeURIComponent(JSON.stringify(session)),
    domain: '127.0.0.1', path: '/', sameSite: 'Lax',
  }]);
  await page.context().route('https://*.supabase.co/**', route => route.abort());
  await page.route('**/auth/v1/**', route => route.fulfill({ json: session.user }));
  await page.route('**/rest/v1/**', route => route.fulfill({ json: session.user.user_metadata }));
  await page.route('**/functions/v1/**', route => route.fulfill({
    json: route.request().url().endsWith('/me')
      ? { user: { id: session.user.id, email: session.user.email, role: 'learner' }, memberships: [], entitlements: [] }
      : {},
  }));
  const destinations: string[] = [];
  for (const origin of ['http://academy.schood.online', 'https://academy.schood.online']) {
    await page.route(`${origin}/**`, route => {
      const url = new URL(route.request().url());
      destinations.push(url.origin + url.pathname);
      return route.fulfill({ contentType: 'text/html', body: '<h1>Approved service fixture</h1>' });
    });
  }
  return destinations;
}

for (const [label, target] of [
  ['insecure service URL', 'http://academy.schood.online/academy/workspace'],
  ['URL with userinfo', 'https://person:password@academy.schood.online/academy/workspace'],
  ['backslash path', '/\\academy.schood.online/academy/workspace'],
  ['control-character path', '/\n/academy.schood.online/academy/workspace'],
]) {
  test(`signed-in return refuses ${label}`, async ({ page }) => {
    const destinations = await signedReturnFixture(page);
    await page.goto(`/auth?returnTo=${encodeURIComponent(target)}`);
    await expect(page).toHaveURL(/\/account$/);
    await page.waitForLoadState('networkidle');
    expect(destinations).toEqual([]);
  });
}

test('signed-in return still opens the approved HTTPS service', async ({ page }) => {
  const destinations = await signedReturnFixture(page);
  await page.goto(`/auth?returnTo=${encodeURIComponent('https://academy.schood.online/academy/workspace')}`);
  await expect(page.getByRole('heading', { name: 'Approved service fixture' })).toBeVisible();
  expect(destinations).toEqual(['https://academy.schood.online/academy/workspace']);
});
