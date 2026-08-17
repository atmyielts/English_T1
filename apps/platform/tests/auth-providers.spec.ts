import { expect, test, type Page } from '@playwright/test';

const mockAuthSettings = async (page: Page, google = true, telegram = true) => {
  await page.route('**/auth/v1/settings', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      external: { google, 'custom:telegram': telegram },
      manual_linking_enabled: true,
    }),
  }));
};

test.describe('Google and Telegram authentication', () => {
  test('renders both providers and requires email and phone for signup', async ({ page }) => {
    await mockAuthSettings(page);
    await page.goto('/auth?mode=signup');

    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Sign up with Telegram' })).toBeEnabled();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Phone')).toBeVisible();
  });

  test('does not advertise disabled production providers as usable', async ({ page }) => {
    await mockAuthSettings(page, false, false);
    await page.goto('/auth');

    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Sign in with Telegram' })).toBeDisabled();
    await expect(page.getByText(/production credentials configured/i)).toBeVisible();
  });

  test('Telegram signup verifies email before linking the identity', async ({ page }) => {
    await mockAuthSettings(page);
    let otpBody: Record<string, unknown> | null = null;
    let otpUrl = '';
    await page.route('**/auth/v1/otp**', async (route) => {
      const corsHeaders = {
        'access-control-allow-origin': 'http://127.0.0.1:4178',
        'access-control-allow-headers': 'apikey, authorization, content-type, x-client-info',
        'access-control-allow-methods': 'POST, OPTIONS',
      };
      if (route.request().method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: corsHeaders });
        return;
      }
      otpUrl = route.request().url();
      otpBody = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({ status: 200, headers: corsHeaders, contentType: 'application/json', body: '{}' });
    });
    await page.goto('/auth?mode=signup&returnTo=%2Faccount');

    await page.getByRole('button', { name: 'Sign up with Telegram' }).click();
    await expect(page.getByText('Enter your email address.')).toBeVisible();

    await page.getByLabel('Email').fill('learner@example.test');
    await page.getByLabel('Phone').fill('invalid');
    await page.getByRole('button', { name: 'Sign up with Telegram' }).click();
    await expect(page.getByText(/valid international phone number/i)).toBeVisible();

    await page.getByLabel('Phone').fill('+998 90 123 45 67');
    await page.getByRole('button', { name: 'Sign up with Telegram' }).click();
    await expect(page.getByText(/check your email first/i)).toBeVisible();

    expect(otpBody?.email).toBe('learner@example.test');
    expect((otpBody?.data as Record<string, unknown>)?.phone).toBe('+998901234567');
    expect(decodeURIComponent(otpUrl)).toContain('authIntent=telegram-link');
  });

  test('Google signup collects phone before starting OAuth', async ({ page }) => {
    await mockAuthSettings(page);
    let authorizeUrl = '';
    await page.route('**/auth/v1/authorize*', async (route) => {
      authorizeUrl = route.request().url();
      await route.fulfill({ status: 200, contentType: 'text/html', body: '<p>OAuth handoff</p>' });
    });
    await page.goto('/auth?mode=signup');

    await page.getByRole('button', { name: 'Continue with Google' }).click();
    await expect(page.getByText(/phone number before continuing/i)).toBeVisible();
    await page.getByLabel('Phone').fill('+998901234567');
    await page.getByRole('button', { name: 'Continue with Google' }).click();
    await expect.poll(() => authorizeUrl).toContain('provider=google');
  });

  test('Telegram signin uses the custom OIDC provider', async ({ page }) => {
    await mockAuthSettings(page);
    let authorizeUrl = '';
    await page.route('**/auth/v1/authorize*', async (route) => {
      authorizeUrl = route.request().url();
      await route.fulfill({ status: 200, contentType: 'text/html', body: '<p>Telegram OAuth handoff</p>' });
    });
    await page.goto('/auth?mode=signin');
    await page.getByRole('button', { name: 'Sign in with Telegram' }).click();
    await expect.poll(() => decodeURIComponent(authorizeUrl)).toContain('provider=custom:telegram');
  });

  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 1000 }]) {
    test(`provider signup remains reachable at ${viewport.width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      await mockAuthSettings(page);
      await page.goto('/auth?mode=signup');
      await expect(page.getByRole('button', { name: 'Sign up with Telegram' })).toBeVisible();
      await expect(page.getByLabel('Phone')).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
      await page.screenshot({ path: testInfo.outputPath(`auth-signup-${viewport.width}.png`), fullPage: true });
    });
  }
});
