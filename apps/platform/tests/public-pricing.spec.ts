import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

// Ids match migration 20261026100900_exam_plans_and_complete_bundles.
const P = {
  ieltsSim: 'ead05eae-aa97-4bda-a07c-51e5dbb062c0',
  ieltsPractice: 'a74195fd-b4f3-4fd4-93bf-c807e42250c6',
  ieltsPlaybook: '9de6c9e7-31df-4d1d-9574-1f8f84a53b54',
  ieltsComplete: '50dab6d9-5345-ce1e-0e66-853450737e39',
  satSim: '5cf6e8e2-e6b1-4f8f-9d35-1c932866d6ef',
  satPractice: '2cf7b1a7-4df9-4de8-99e8-5b9d5bb85010',
  satPlaybook: 'a8b41e2c-9a36-4caf-9bba-7212e35a8b8c',
  satComplete: '056db74c-0bc5-32f7-9997-654e3f31611f',
  toeflSim: 'b262ffa8-9912-4eba-93d7-58af3164d1cc',
  toeflPlaybook: 'f9512c15-ec1c-4fcb-a5ec-a2c6ac3a020e',
  toeflComplete: '49f0661d-0933-361c-6c4b-67316ba29b4e',
  academy: '04b1782f-df7a-49e7-8e95-76e057900371',
  english: '3a7bd983-58c5-4c75-b5f8-5ac46c94a0fa',
  center: '00000000-0000-4000-8000-000000000701',
};

const product = (id: string, name: string, slug: string, extra: Record<string, unknown> = {}) => ({
  id, name, type: 'exam', status: 'active', description: `${name} description`, metadata: { slug, ...extra },
});

const products = [
  product(P.ieltsSim, 'IELTS Academic Simulator', 'ielts-academic-simulator', { app_url: 'https://ielts.schood.online', included_in_bundles: ['ielts-complete'] }),
  product(P.ieltsPractice, 'IELTS Practice', 'ielts-practice', { app_url: 'https://practice.ielts.schood.online', included_in_bundles: ['ielts-complete'] }),
  product(P.ieltsPlaybook, 'IELTS Playbook', 'ielts-playbook', { app_url: 'https://playbook.ielts.schood.online', included_in_bundles: ['ielts-complete'] }),
  product(P.ieltsComplete, 'IELTS Complete', 'ielts-complete', { bundle_product_ids: [P.ieltsSim, P.ieltsPractice, P.ieltsPlaybook] }),
  product(P.satSim, 'SAT Exam Simulator', 'sat-exam-simulator', { included_in_bundles: ['sat-complete'] }),
  product(P.satPractice, 'SAT Practice Lab', 'sat-practice', { app_url: 'https://practice.sat.schood.online', included_in_bundles: ['sat-complete'] }),
  product(P.satPlaybook, 'SAT Playbook', 'sat-playbook', { included_in_bundles: ['sat-complete'] }),
  product(P.satComplete, 'SAT Complete', 'sat-complete', { bundle_product_ids: [P.satSim, P.satPractice, P.satPlaybook] }),
  product(P.toeflSim, 'TOEFL iBT Simulator', 'toefl-ibt-simulator', { app_url: 'https://toefl.schood.online', included_in_bundles: ['toefl-complete'] }),
  product(P.toeflPlaybook, 'TOEFL Playbook', 'toefl-playbook', { app_url: 'https://playbook.toefl.schood.online', included_in_bundles: ['toefl-complete'] }),
  product(P.toeflComplete, 'TOEFL Complete', 'toefl-complete', { bundle_product_ids: [P.toeflSim, P.toeflPlaybook] }),
  product(P.academy, 'Academy', 'academy'),
  product(P.english, 'English All Skills', 'english-all'),
  product(P.center, 'Schood Center Office', 'center-office', { catalog: 'center_tier' }),
];

let planSeq = 0;
const plan = (productId: string, name: string, amount: number, days: number, metadata: Record<string, unknown> = {}) => ({
  id: `00000000-0000-4000-9000-${String(++planSeq).padStart(12, '0')}`,
  product_id: productId, name, amount, currency: 'UZS', duration_days: days, is_active: true,
  metadata: { features: [`${name} feature`], ...metadata }, created_at: '2026-10-26T00:00:00Z',
});

const plans = [
  plan(P.ieltsSim, 'Standard', 69000, 30),
  plan(P.ieltsPractice, 'IELTS Practice Monthly', 89000, 30),
  plan(P.ieltsPlaybook, 'IELTS Playbook Premium', 59000, 30, { display_order: 1 }),
  plan(P.ieltsPlaybook, 'IELTS Playbook Premium (3 months)', 149000, 90, { display_order: 2, recommended: true }),
  plan(P.ieltsComplete, 'IELTS Complete', 179000, 30, { recommended: true, included_product_ids: [P.ieltsSim, P.ieltsPractice, P.ieltsPlaybook] }),
  plan(P.satSim, 'Standard', 69000, 30),
  plan(P.satPractice, 'SAT Practice Starter', 39000, 14, { display_order: 1 }),
  plan(P.satPractice, 'SAT Practice Monthly', 89000, 30, { display_order: 2, recommended: true }),
  plan(P.satPlaybook, 'SAT Playbook Premium', 59000, 30, { display_order: 1 }),
  plan(P.satComplete, 'SAT Complete', 159000, 30, { recommended: true, included_product_ids: [P.satSim, P.satPractice, P.satPlaybook] }),
  plan(P.toeflSim, 'Standard', 69000, 30),
  plan(P.toeflPlaybook, 'TOEFL Playbook Premium', 59000, 30, { display_order: 1 }),
  plan(P.toeflPlaybook, 'TOEFL Playbook Premium (3 months)', 149000, 90, { display_order: 2, recommended: true }),
  plan(P.toeflComplete, 'TOEFL Complete', 109000, 30, { recommended: true, included_product_ids: [P.toeflSim, P.toeflPlaybook] }),
  plan(P.academy, 'Academy Monthly', 99000, 30),
  plan(P.english, 'All Skills Monthly Access', 199000, 30),
  plan(P.center, 'Growth Center Monthly', 490000, 30),
];

const session = {
  access_token: 'public-pricing-token', refresh_token: 'public-pricing-refresh', token_type: 'bearer',
  expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: '22222222-2222-4222-8222-222222222222', aud: 'authenticated', role: 'authenticated', email: 'buyer@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
};

const mockCatalog = async (page: Page, opts: { signedIn?: boolean } = {}) => {
  const authCalls: string[] = [];
  await page.context().route('https://*.supabase.co/**', (route) => route.abort());
  await page.route('**/auth/v1/**', (route) => {
    authCalls.push(route.request().url());
    return opts.signedIn
      ? route.fulfill({ json: session.user })
      : route.fulfill({ status: 401, json: { message: 'no session' } });
  });
  // Later routes win in Playwright, so the catch-all goes first.
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }));
  await page.route('**/rest/v1/products*', (route) => route.fulfill({ json: products }));
  await page.route('**/rest/v1/plans*', (route) => route.fulfill({ json: plans }));
  await page.route('**/functions/v1/**', (route) => {
    const url = route.request().url();
    if (/\/functions\/v1\/me(?:\?|$)/.test(url)) {
      return route.fulfill({ json: { user: { id: session.user.id, email: session.user.email, role: 'user' }, memberships: [], entitlements: [] } });
    }
    if (url.includes('/functions/v1/trial-claim')) {
      return route.fulfill({ json: { product_id: '', trial_enabled: true, trial_days: 3, trial_limits: {}, claimable: true, reason: null, already_claimed: false, claim: null, already_entitled: false } });
    }
    return route.fulfill({ json: {} });
  });
  if (opts.signedIn) {
    await page.context().addCookies([{ name: 'schood-auth', value: encodeURIComponent(JSON.stringify(session)), domain: '127.0.0.1', path: '/', sameSite: 'Lax' }]);
  }
  return authCalls;
};

const noHorizontalOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test('signed-out visitor sees every exam family, plan and bundle price on a phone', async ({ page }) => {
  await mockCatalog(page);
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto('/pricing');

  await expect(page).toHaveURL(/\/pricing$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Prices for every Schood service');
  await expect(page.getByTestId('pricing-signin-hint')).toBeVisible();
  for (const group of ['IELTS', 'Digital SAT', 'TOEFL iBT', 'English', 'More services']) {
    await expect(page.getByRole('heading', { level: 2, name: group, exact: true })).toBeVisible();
  }
  for (const name of ['IELTS Complete', 'SAT Complete', 'TOEFL Complete', 'IELTS Playbook', 'SAT Playbook', 'TOEFL Playbook', 'TOEFL iBT Simulator']) {
    await expect(page.getByRole('heading', { level: 3, name, exact: true })).toBeVisible();
  }
  const overview = page.getByTestId('pricing-overview');
  await expect(overview.getByText(/179[,\s.  ]000 UZS/)).toBeVisible();
  await expect(overview.getByText(/159[,\s.  ]000 UZS/)).toBeVisible();
  // Bundles show the real sum of their members' 30-day plans.
  await expect(overview.getByText(/Bought separately: 217[,\s.  ]000 UZS/).first()).toBeVisible();
  // Center tiers are not part of the learner catalogue.
  await expect(page.getByText('Growth Center Monthly')).toHaveCount(0);
  expect(await noHorizontalOverflow(page)).toBe(true);

  await mkdir(resolve('test-results'), { recursive: true });
  await page.screenshot({ path: resolve('test-results/public-pricing-phone.png'), fullPage: true });

  const ieltsComplete = page.getByTestId('plan-card').filter({ hasText: 'IELTS Complete' }).filter({ hasText: '179' });
  await ieltsComplete.getByRole('button', { name: 'Sign in to buy' }).click();
  await expect(page).toHaveURL(/\/auth\?/);
  const returnTo = new URL(page.url()).searchParams.get('returnTo') ?? '';
  const checkout = new URL(returnTo, 'http://127.0.0.1');
  expect(checkout.pathname).toBe('/checkout');
  expect(checkout.searchParams.get('plan_id')).toBe(plans.find((p) => p.product_id === P.ieltsComplete)!.id);
  expect(checkout.searchParams.get('product')).toBe('ielts-complete');
});

test('a service page offers its Complete bundle and the bundle page has no trial', async ({ page }) => {
  await mockCatalog(page);
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto('/pricing?product=sat-practice&returnTo=%2F');

  await expect(page.getByText('Service: SAT Practice Lab')).toBeVisible();
  await expect(page.getByTestId('trial-box')).toContainText('Sign in to see whether a free trial');
  const offer = page.getByTestId('exam-bundle-offer');
  await expect(offer).toContainText('Save with SAT Complete');
  await expect(offer).toContainText(/Bought separately: 217[,\s.  ]000 UZS/);
  expect(await noHorizontalOverflow(page)).toBe(true);

  await offer.getByRole('button', { name: 'See SAT Complete' }).click();
  await expect(page).toHaveURL(/product=sat-complete/);
  await expect(page.getByText('Complete plans have no free trial.')).toBeVisible();
  await expect(page.getByTestId('trial-box')).toHaveCount(0);
  await expect(page.getByTestId('plan-card')).toHaveCount(1);
  await expect(page.getByTestId('plan-card')).toContainText('Includes: SAT Exam Simulator, SAT Practice Lab, SAT Playbook');
  expect(await noHorizontalOverflow(page)).toBe(true);
});

test('signed-in buyer goes straight to checkout for the chosen plan', async ({ page }) => {
  await mockCatalog(page, { signedIn: true });
  await page.goto('/pricing?product=ielts-playbook');
  await expect(page.getByText('Service: IELTS Playbook')).toBeVisible();
  await expect(page.getByTestId('pricing-signin-hint')).toHaveCount(0);
  await page.getByTestId('plan-card').first().getByRole('button', { name: 'Choose plan' }).click();
  await expect(page).toHaveURL(/\/checkout\?/);
  const url = new URL(page.url());
  expect(url.searchParams.get('plan_id')).toBe(plans.find((p) => p.product_id === P.ieltsPlaybook)!.id);
});

test('pricing is translated', async ({ page }) => {
  await mockCatalog(page);
  await page.addInitScript(() => window.localStorage.setItem('schood.locale', 'uz'));
  await page.goto('/pricing');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Schood’ning barcha xizmatlari narxlari');
  await expect(page.getByRole('button', { name: 'Sotib olish uchun kiring' }).first()).toBeVisible();
});

for (const [path, names] of [
  ['/sat', ['SAT Simulator', 'SAT Practice', 'SAT Playbook', 'SAT Complete']],
  ['/ielts', ['IELTS Simulator', 'IELTS Practice', 'IELTS Playbook', 'IELTS Complete']],
  ['/toefl', ['TOEFL Simulator', 'TOEFL Playbook', 'TOEFL Complete']],
  ['/', ['IELTS Complete', 'SAT Playbook', 'TOEFL Playbook', 'TOEFL Complete']],
] as const) {
  test(`${path} shows the full exam family on a phone`, async ({ page }) => {
    await mockCatalog(page);
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto(path);
    const families = page.getByTestId('exam-families');
    for (const name of names) await expect(families.getByText(name, { exact: true }).first()).toBeVisible();
    expect(await noHorizontalOverflow(page)).toBe(true);
    const complete = names[names.length - 1];
    await families.getByRole('button', { name: `See ${complete}` }).click();
    const slug = complete.toLowerCase().replace(' ', '-');
    await expect.poll(() => new URL(page.url()).pathname + new URL(page.url()).search).toBe(`/pricing?product=${slug}`);
  });
}

test('TOEFL Complete shows the real separate price and its members; its page has no trial', async ({ page }) => {
  await mockCatalog(page);
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto('/pricing?product=toefl-playbook');
  const offer = page.getByTestId('exam-bundle-offer');
  await expect(offer).toContainText('Save with TOEFL Complete');
  // 69,000 simulator + 59,000 playbook (30-day plans).
  await expect(offer).toContainText(/Bought separately: 128[,\s.\u00a0\u202f]000 UZS/);
  await offer.getByRole('button', { name: 'See TOEFL Complete' }).click();
  await expect(page).toHaveURL(/product=toefl-complete/);
  await expect(page.getByTestId('plan-card')).toHaveCount(1);
  await expect(page.getByTestId('plan-card')).toContainText('Includes: TOEFL iBT Simulator, TOEFL Playbook');
  await expect(page.getByTestId('plan-card')).toContainText(/109[,\s.\u00a0\u202f]000 UZS/);
  await expect(page.getByTestId('trial-box')).toHaveCount(0);
  expect(await noHorizontalOverflow(page)).toBe(true);
});
