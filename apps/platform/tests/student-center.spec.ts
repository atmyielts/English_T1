import { expect, test, type Page } from '@playwright/test';

const session = {
  access_token: 'student-center-route-token',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: 'student-center-route-refresh',
  user: {
    id: 'student-center-user', aud: 'authenticated', role: 'authenticated', email: 'learner@example.test',
    app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00.000Z',
  },
};

const dashboard = {
  identity: { id: session.user.id, email: session.user.email },
  services: [
    { id: 'academy:classroom-1', source: 'academy', kind: 'classroom', title: 'A'.repeat(90), subtitle: 'Atlas Academy', status: 'active', href: 'https://academy.schood.online/academy/student/classrooms/classroom-1', metadata: {} },
    { id: 'platform:english', source: 'platform', kind: 'course', title: 'English Hub', subtitle: 'Independent learning', status: 'active', href: 'https://english.schood.online', metadata: {} },
  ],
  next_actions: [{ id: 'assignment:1', source: 'academy', kind: 'assignment', title: 'Submit reading reflection', context: 'IELTS Evening', due_at: '2026-09-01T10:00:00.000Z', priority: 'normal', href: 'https://academy.schood.online/academy/student/classrooms/classroom-1?section=assignments' }],
  calendar: [{ id: 'session:1', source: 'academy', kind: 'class_session', title: 'Live speaking class', context: 'IELTS Evening', starts_at: '2026-09-02T10:00:00.000Z', ends_at: '2026-09-02T11:00:00.000Z', status: 'confirmed', delivery_mode: 'online', join_available: false, join_url: null, href: 'https://academy.schood.online/academy/student/classrooms/classroom-1?section=live' }],
  progress: [{ id: 'academy:classroom-1', source: 'academy', title: 'IELTS Evening', completed: 2, total: 5, percent: 40, href: 'https://academy.schood.online/academy/student/classrooms/classroom-1?section=progress' }],
  communications: [{ id: 'announcement:1', source: 'academy', kind: 'announcement', title: 'Schedule update', body: 'Class starts ten minutes later.', created_at: '2026-08-14T08:00:00.000Z', context: 'Atlas Academy' }],
  access: [{ id: 'academy:access-1', source: 'academy', title: 'Atlas Academy', status: 'active', expires_at: null, href: 'https://academy.schood.online/academy/student/payments' }],
  partial_errors: [],
  generated_at: new Date().toISOString(),
};

const seedSession = async (page: Page) => page.context().addCookies([{ name: 'schood-auth', value: encodeURIComponent(JSON.stringify(session)), domain: '127.0.0.1', path: '/', httpOnly: false, sameSite: 'Lax' }]);

const mockStudentCenter = async (page: Page, enabled = true, response: typeof dashboard = dashboard) => {
  await page.route('**/auth/v1/user*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(session.user) }));
  await page.route('**/functions/v1/**', (route) => {
    const url = route.request().url();
    if (/\/functions\/v1\/me(?:\?|$)/.test(url)) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: session.user, entitlements: [] }) });
    }
    if (url.includes('/functions/v1/access-effective')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ effective_product_ids: [] }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.route('**/rest/v1/products*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route('**/rest/v1/platform_settings*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ student_center_enabled: enabled }) }));
  await page.route('**/functions/v1/student-center*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) }));
};

test.describe('Student Center route and responsive contract', () => {
  test('startup latency benchmark with fixed backend delays', async ({ page }) => {
    test.skip(process.env.STARTUP_BENCHMARK !== '1', 'Run explicitly for before/after measurements.');
    await seedSession(page);
    await mockStudentCenter(page);
    await page.route('**/rest/v1/products*', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 600));
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
        { id: 'ielts', name: 'IELTS Simulator', type: 'exam', status: 'active', description: 'Practice', metadata: { slug: 'ielts-simulator' } },
      ]) });
    });
    await page.route('**/functions/v1/me', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 800));
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: session.user, entitlements: [{ resource_type: 'product', resource_id: 'ielts' }] }) });
    });
    await page.route('**/functions/v1/access-effective*', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 800));
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"effective_product_ids":["ielts"]}' });
    });
    await page.route('**/functions/v1/partner-office*', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      await route.fallback();
    });
    for (let sample = 0; sample < 3; sample += 1) {
      const start = Date.now();
      await page.goto('/');
      await expect(page.getByRole('button', { name: 'Account', exact: true })).toBeVisible();
      const accountMs = Date.now() - start;
      await expect(page.locator('#my-services')).toBeVisible();
      console.log('STARTUP_METRIC', JSON.stringify({ app: 'platform', sample, accountMs, servicesMs: Date.now() - start }));
    }
  });

  test('restores the account before the catalog or optional center request finishes', async ({ page }) => {
    await seedSession(page);
    await mockStudentCenter(page);
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const started: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/functions/v1/')) started.push(new URL(request.url()).pathname.split('/').pop()!);
    });
    await page.route('**/rest/v1/products*', async (route) => { await blocked; await route.fallback(); });
    await page.route('**/functions/v1/partner-office*', async (route) => { await blocked; await route.fallback(); });
    try {
      await page.goto('/');
      await expect(page.getByRole('button', { name: 'Your learning centre' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Account', exact: true })).toBeVisible();
      await expect.poll(() => started.includes('me') && started.includes('access-effective')).toBe(true);
      await expect(page.getByRole('button', { name: 'Sign up', exact: true })).toHaveCount(0);
    } finally {
      release();
    }
  });

  test('catalog failure does not turn a returning learner into a guest', async ({ page }) => {
    await seedSession(page);
    await mockStudentCenter(page);
    await page.route('**/rest/v1/products*', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"Catalog unavailable"}' }));
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Account', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Your learning centre' })).toBeVisible();
  });

  test('signed-in learners can enter the Student Center from the platform header', async ({ page }) => {
    await seedSession(page);
    await mockStudentCenter(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Your learning centre' }).click();
    await expect(page).toHaveURL(/\/student-center$/);
  });

  test('authenticated learner sees consolidated services and access', async ({ page }) => {
    await seedSession(page);
    await mockStudentCenter(page);
    await page.goto('/student-center');
    await expect(page.getByRole('heading', { level: 1, name: 'One place for everything you are learning' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'English Hub' }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Access and billing' })).toBeVisible();
    await expect(page.getByText('Atlas Academy', { exact: true }).last()).toBeVisible();
  });

  test('individual learner without Academy membership keeps personal learning reachable', async ({ page }) => {
    await seedSession(page);
    await mockStudentCenter(page, true, {
      ...dashboard,
      services: dashboard.services.filter((service) => service.source !== 'academy'),
      calendar: [],
      communications: [],
      access: [{ id: 'platform:english', source: 'platform', title: 'English Hub', status: 'active', expires_at: null, href: '/account' }],
    });
    await page.goto('/student-center');
    await expect(page.getByRole('heading', { name: 'English Hub' }).first()).toBeVisible();
    await expect(page.getByText('0 academy classrooms · 1 personal services')).toBeVisible();
    await expect(page.getByText('No scheduled sessions are coming up.')).toBeVisible();
  });

  test('one failed adapter is explained without hiding healthy services', async ({ page }) => {
    await seedSession(page);
    await mockStudentCenter(page, true, { ...dashboard, partial_errors: [{ source: 'academy', message: 'timed out', retryable: true }] });
    await page.goto('/student-center');
    await expect(page.getByRole('heading', { name: 'English Hub' }).first()).toBeVisible();
    await expect(page.getByText('Some learning services are taking longer')).toBeVisible();
  });

  test('legacy learner URLs resolve to the canonical route', async ({ page }) => {
    await seedSession(page);
    await mockStudentCenter(page);
    await page.goto('/workspace/student');
    await expect(page).toHaveURL(/\/student-center$/);
  });

  for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1024, height: 900 }, { width: 1440, height: 1000 }]) {
    test(`long learner content remains reachable at ${viewport.width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      await seedSession(page);
      await mockStudentCenter(page);
      await page.goto('/student-center');
      if (viewport.width <= 820) {
        const summary = page.locator('.student-center__mobile-nav summary');
        await expect(summary).toBeVisible();
        const box = await summary.boundingBox();
        expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
        await summary.focus();
        await page.keyboard.press('Enter');
        await expect(page.locator('.student-center__mobile-nav').getByRole('link', { name: 'Access and billing' })).toBeVisible();
      }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
      await page.screenshot({ path: testInfo.outputPath(`student-center-${viewport.width}.png`), fullPage: true });
    });
  }
});
