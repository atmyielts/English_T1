import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const actor = '11111111-1111-4111-8111-111111111111';
const submission = {
  id: '22222222-2222-4222-8222-222222222222', exam_type: 'itep', task_type: 'task2',
  word_count: 250, status: 'pending_review', reviews_count: 0, reviews_needed: 2,
  created_at: '2026-10-01T12:00:00Z', sharing_consent_at: null,
};
const session = {
  access_token: 'peer-review-qa-token', refresh_token: 'peer-review-qa-refresh', token_type: 'bearer',
  expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: actor, aud: 'authenticated', role: 'authenticated', email: 'qa@example.test',
    app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
};
async function setup(page: Page, options: { legacy?: boolean; failReview?: boolean; failSubmit?: boolean; failQueue?: boolean } = {}) {
  const calls: Record<string, unknown>[] = [];
  await page.context().addCookies([{ name: 'schood-auth', value: encodeURIComponent(JSON.stringify(session)), domain: '127.0.0.1', path: '/', sameSite: 'Lax' }]);
  await page.route('**/auth/v1/user*', (route) => route.fulfill({ json: session.user }));
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }));
  await page.route('**/functions/v1/**', (route) => {
    if (route.request().url().includes('/peer-review')) {
      const body = route.request().postDataJSON();
      calls.push(body);
      const headers = options.legacy ? {} : { 'X-Peer-Review-Version': '2', 'Access-Control-Expose-Headers': 'X-Peer-Review-Version' };
      const send = (json: unknown, status = 200) => route.fulfill({ json, status, headers });
      if (body.action === 'my_submissions') return send({ submissions: [submission], reviews: [] });
      if (body.action === 'my_reviews') return send({ reviews: [] });
      if (body.action === 'queue') return options.failQueue ? send({ error: 'Queue unavailable. Please retry.' }, 503) : send({ submissions: [submission] });
      if (body.action === 'claim_submission') return send({ submission: { ...submission, essay_text: 'A shared practice essay. '.repeat(35), assignment_expires_at: new Date(Date.now() + 3600000).toISOString() } });
      if (body.action === 'submit_review') return options.failReview ? send({ error: 'Could not save feedback. Please retry.' }, 503) : send({ review: { id: '33333333-3333-4333-8333-333333333333' } });
      if (body.action === 'submit') return options.failSubmit ? send({ error: 'Could not save essay. Please retry.' }, 503) : send({ submission: { ...submission, request_id: body.request_id } });
      return send({ ok: true });
    }
    return route.fulfill({ json: { user: session.user, entitlements: [], effective_product_ids: [] } });
  });
  await page.goto('/peer-review');
  await expect(page.getByRole('heading', { name: 'Peer writing review' })).toBeVisible();
  if (options.legacy) await expect(page.getByRole('button', { name: 'Submit essay', exact: true })).toBeDisabled();
  else await expect(page.getByRole('button', { name: 'Submit essay', exact: true })).toBeEnabled({ timeout: 15000 });
  return calls;
}

test('peer review preserves an essay and retry identity after a failed save, with explicit consent', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const calls = await setup(page, { failSubmit: true });
  await page.getByRole('button', { name: 'Submit essay', exact: true }).click();
  const essay = 'A careful practice essay without private information. '.repeat(8);
  await page.getByRole('textbox', { name: 'Your essay', exact: true }).fill(essay);
  await expect(page.getByRole('button', { name: 'Submit for peer review', exact: true })).toBeDisabled();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Submit for peer review', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Could not save essay');
  await expect(page.getByRole('textbox', { name: 'Your essay', exact: true })).toHaveValue(essay);
  await page.getByRole('button', { name: 'Submit for peer review', exact: true }).click();
  await expect.poll(() => calls.filter((call) => call.action === 'submit').length).toBe(2);
  const submitted = calls.filter((call) => call.action === 'submit');
  expect(submitted[0].sharing_consent).toBe(true);
  expect(submitted[0].request_id).toBe(submitted[1].request_id);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
  await page.screenshot({ path: '../../docs/customer-readiness/peer-review-mobile.png', fullPage: true });
});

test('failed review saves preserve feedback and iTEP uses the correct score range', async ({ page }) => {
  const calls = await setup(page, { failReview: true });
  await page.getByRole('button', { name: 'Review queue', exact: true }).click();
  await page.getByRole('button', { name: 'Reserve review' }).click();
  await expect(page.getByRole('region', { name: 'Review editor' })).toBeVisible();
  await expect(page.getByLabel('Practice score')).toHaveAttribute('max', '6');
  await page.getByRole('textbox', { name: 'Overall feedback', exact: true }).fill('Keep this feedback when the connection fails.');
  await page.getByRole('button', { name: 'Submit review', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Could not save feedback');
  await expect(page.getByRole('textbox', { name: 'Overall feedback', exact: true })).toHaveValue('Keep this feedback when the connection fails.');
  await page.getByRole('button', { name: 'Renew reservation' }).click();
  await expect(page.getByRole('textbox', { name: 'Overall feedback', exact: true })).toHaveValue('Keep this feedback when the connection fails.');
  expect(calls.filter((call) => call.action === 'claim_submission')).toHaveLength(2);
  await page.screenshot({ path: '../../docs/customer-readiness/peer-review-desktop.png', fullPage: true });
});

test('failed queue loads offer retry without claiming there are no essays', async ({ page }) => {
  await setup(page, { failQueue: true });
  await page.getByRole('button', { name: 'Review queue', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Queue unavailable');
  await expect(page.getByText('No essays available right now. Check back later.')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Retry loading' })).toBeVisible();
});

test('author sharing is explicit and legacy API never gets a false private label', async ({ page }) => {
  const calls = await setup(page);
  await page.getByRole('button', { name: 'Share with peer reviewers', exact: true }).click();
  await expect.poll(() => calls.some((call) => call.action === 'set_sharing' && call.sharing_consent === true)).toBe(true);
  await page.route('**/functions/v1/peer-review', (route) => route.fulfill({ json: { submissions: [submission], reviews: [] } }));
  await page.reload();
  await expect(page.getByText('Sharing status unavailable', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Submit essay', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Share with peer reviewers', exact: true })).toHaveCount(0);
  await expect(page.getByText('Privacy controls are being updated.', { exact: false })).toBeVisible();
});

test('an unconfirmed essay survives reload with the same request and requires fresh consent', async ({ page }) => {
  const calls = await setup(page, { failSubmit: true });
  await page.getByRole('button', { name: 'Submit essay', exact: true }).click();
  const essay = 'A reload-safe practice essay. '.repeat(12);
  await page.getByRole('textbox', { name: 'Your essay', exact: true }).fill(essay);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Submit for peer review', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Could not save essay');
  await expect(page.getByRole('textbox', { name: 'Your essay', exact: true })).toHaveAttribute('readonly');
  const first = calls.find(call => call.action === 'submit');
  await page.reload();
  await page.getByRole('button', { name: 'Submit essay', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Your essay', exact: true })).toHaveValue(essay);
  await expect(page.getByRole('checkbox')).not.toBeChecked();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Submit for peer review', exact: true }).click();
  await expect.poll(() => calls.filter(call => call.action === 'submit').length).toBe(2);
  expect(calls.filter(call => call.action === 'submit')[1]).toEqual(first);
});

test('a successful save clears recovery only after a valid receipt', async ({ page }) => {
  await setup(page);
  await page.getByRole('button', { name: 'Submit essay', exact: true }).click();
  await page.getByRole('textbox', { name: 'Your essay', exact: true }).fill('A confirmed practice essay. '.repeat(12));
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Submit for peer review', exact: true }).click();
  await expect(page.getByText('Your essay is shared with the review pool.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Submit essay', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Your essay', exact: true })).toHaveValue('');
  expect(await page.evaluate(actor => sessionStorage.getItem('schood.peer.draft.v1.' + actor), actor)).toBeNull();
});

test('invalid confirmation keeps the essay and its pending identity', async ({ page }) => {
  await setup(page);
  await page.route('**/functions/v1/peer-review', route => route.request().postDataJSON().action === 'submit'
    ? route.fulfill({ json: { submission: {} } }) : route.fallback());
  await page.getByRole('button', { name: 'Submit essay', exact: true }).click();
  const essay = 'An unconfirmed practice essay. '.repeat(12);
  await page.getByRole('textbox', { name: 'Your essay', exact: true }).fill(essay);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Submit for peer review', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Submission was not confirmed');
  await expect(page.getByRole('textbox', { name: 'Your essay', exact: true })).toHaveValue(essay);
});

test('storage refusal prevents an unsafe new submission and preserves on-screen writing', async ({ page }) => {
  await page.addInitScript(() => { Storage.prototype.setItem = () => { throw new DOMException('Denied', 'SecurityError'); }; });
  const calls = await setup(page);
  await page.getByRole('button', { name: 'Submit essay', exact: true }).click();
  const essay = 'A practice essay retained on screen. '.repeat(12);
  await page.getByRole('textbox', { name: 'Your essay', exact: true }).fill(essay);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Submit for peer review', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('cannot keep a recovery copy');
  await expect(page.getByRole('textbox', { name: 'Your essay', exact: true })).toHaveValue(essay);
  expect(calls.filter(call => call.action === 'submit')).toHaveLength(0);
});

test('withdrawn access hides the essay on focus while retaining the reviewer feedback', async ({ page }) => {
  await setup(page);
  await page.getByRole('button', { name: 'Review queue', exact: true }).click();
  await page.getByRole('button', { name: 'Reserve review' }).click();
  await page.getByRole('textbox', { name: 'Overall feedback', exact: true }).fill('Keep my feedback draft.');
  await page.route('**/functions/v1/peer-review', route => route.request().postDataJSON().action === 'get_submission'
    ? route.fulfill({ status: 409, json: { error: 'Submission unavailable' } }) : route.fallback());
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('alert')).toContainText('no longer available');
  await expect(page.getByText('A shared practice essay.', { exact: false })).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Overall feedback', exact: true })).toHaveValue('Keep my feedback draft.');
});

test('duplicate synchronous clicks dispatch one mutation', async ({ page }) => {
  await setup(page);
  let unblock!: () => void;
  const held = new Promise<void>(resolve => { unblock = resolve; });
  let writes = 0;
  await page.route('**/functions/v1/peer-review', async route => {
    if (route.request().postDataJSON().action !== 'submit') return route.fallback();
    writes += 1; await held; return route.fulfill({ status: 503, json: { error: 'Retry this same essay' } });
  });
  await page.getByRole('button', { name: 'Submit essay', exact: true }).click();
  await page.getByRole('textbox', { name: 'Your essay', exact: true }).fill('One deliberate submission. '.repeat(12));
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Submit for peer review', exact: true }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect.poll(() => writes).toBe(1); unblock();
  await expect(page.getByRole('alert')).toContainText('Retry this same essay');
  expect(writes).toBe(1);
});

test('account change hides old writing and ignores its delayed save reply', async ({ page }) => {
  await setup(page);
  let unblock!: () => void;
  const held = new Promise<void>(resolve => { unblock = resolve; });
  let writes = 0;
  await page.route('**/functions/v1/peer-review', async route => {
    if (route.request().postDataJSON().action !== 'submit') return route.fallback();
    writes += 1; await held; return route.fulfill({ json: { submission } });
  });
  await page.getByRole('button', { name: 'Submit essay', exact: true }).click();
  await page.getByRole('textbox', { name: 'Your essay', exact: true }).fill('The original learner private draft. '.repeat(12));
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Submit for peer review', exact: true }).click();
  await expect.poll(() => writes).toBe(1);
  const second = { ...session.user, id: '44444444-4444-4444-8444-444444444444' };
  await page.route('**/auth/v1/user*', route => route.fulfill({ json: second }));
  await page.evaluate(async user => {
    const encode = (v: unknown) => btoa(JSON.stringify(v)).replaceAll('=', '').replaceAll('+', '-').replaceAll('/', '_');
    const token = encode({ alg: 'HS256', typ: 'JWT' }) + '.' + encode({ sub: user.id, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }) + '.c3ludGhldGlj';
    const url = '/src/lib/supabase.ts';
    const { supabase } = await import(url);
    const { error } = await supabase.auth.setSession({ access_token: token, refresh_token: 'synthetic-second-refresh' });
    if (error) throw error;
  }, second);
  await expect(page.getByRole('button', { name: 'Submit essay', exact: true })).toBeEnabled();
  unblock();
  await page.getByRole('button', { name: 'Submit essay', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Your essay', exact: true })).toHaveValue('');
  await expect(page.getByText('Your essay is shared with the review pool.', { exact: false })).toHaveCount(0);
  const original = await page.evaluate(actor => sessionStorage.getItem('schood.peer.draft.v1.' + actor), actor);
  expect(JSON.parse(original!).request.id).toBeTruthy();
});

for (const width of [320, 390, 768, 1280]) test('peer review fits and remains accessible at ' + width, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 }); await setup(page);
  await expect(page.getByText('Private', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: /updates/i })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
});
