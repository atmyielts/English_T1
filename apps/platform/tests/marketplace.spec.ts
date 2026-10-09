import { expect, type Page, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const actor = '11111111-1111-4111-8111-111111111111';
const teacherId = '22222222-2222-4222-8222-222222222222';
const jobId = '33333333-3333-4333-8333-333333333333';
const twinId = '44444444-4444-4444-8444-444444444444';
const tenantId = '55555555-5555-4555-8555-555555555555';
const secondTenant = '66666666-6666-4666-8666-666666666666';
const applicationId = '77777777-7777-4777-8777-777777777777';
const profile = {
  id: teacherId,
  full_name: 'Synthetic teacher',
  bio: 'Teaching experience for a synthetic local test.',
  subjects: ['ielts'],
  languages: ['English'],
  certifications: [],
  location: 'Tashkent',
  hourly_rate: 0,
  experience_years: 0,
  currency: 'UZS',
  available: true,
  verified: false,
  is_public: false,
  revision: 1,
};
const job = {
  id: jobId,
  title: 'English teacher',
  description: 'A synthetic position with a clear teaching schedule.',
  subjects: ['ielts'],
  employment_type: 'part_time',
  salary_min: 0,
  salary_max: 0,
  currency: 'UZS',
  location: 'Tashkent',
  remote_ok: true,
  created_at: '2026-10-01T12:00:00Z',
  expires_at: '2027-10-01T12:00:00Z',
  tenants: { name: 'First synthetic academy' },
};
const application = {
  id: applicationId,
  listing_id: jobId,
  status: 'pending',
  cover_note: 'Original applicant note.',
  applied_at: '2026-10-01T12:00:00Z',
  job_listings: { id: jobId, title: job.title, tenants: job.tenants },
  teacher_profiles: profile,
};
const session = {
  access_token: 'marketplace-synthetic-token',
  refresh_token: 'marketplace-synthetic-refresh',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: {
    id: actor,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'marketplace@example.test',
    app_metadata: {},
    user_metadata: {},
    created_at: '2026-01-01T00:00:00Z',
  },
};
type Options = {
  profileRevision?: number;
  anonymous?: boolean;
  legacy?: boolean;
  failJobs?: boolean;
  failProfile?: boolean;
  failPost?: boolean;
  failApply?: boolean;
  failDecision?: boolean;
  conflict?: boolean;
  invalidReceipt?: boolean;
  duplicateTitles?: boolean;
  noProfile?: boolean;
  noTenants?: boolean;
  failCandidates?: boolean;
};
async function setup(page: Page, options: Options = {}, tab = 'teachers') {
  const calls: Record<string, unknown>[] = [];
  let current = options.noProfile ? null : { ...profile };
  let apps = options.duplicateTitles ? [{ ...application, status: 'hired' }] : [] as typeof application[];
  let currentStatus = 'pending';
  if (!options.anonymous) {
    await page.context().addCookies([{
      name: 'schood-auth',
      value: encodeURIComponent(JSON.stringify(session)),
      domain: '127.0.0.1',
      path: '/',
      sameSite: 'Lax',
    }]);
  }
  await page.route('**/auth/v1/**', (route) => route.fulfill({ json: session.user }));
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }));
  await page.route('**/functions/v1/**', (route) => {
    if (!route.request().url().includes('/teacher-marketplace')) {
      return route.fulfill({ json: { user: session.user, entitlements: [], effective_product_ids: [] } });
    }
    const body = route.request().postDataJSON();
    calls.push(body);
    const headers = options.legacy
      ? {}
      : { 'X-Marketplace-Version': '2', 'Access-Control-Expose-Headers': 'X-Marketplace-Version' };
    const send = (json: unknown, status = 200) => route.fulfill({ json, status, headers });
    switch (body.action) {
      case 'teachers':
        return send({ teachers: [profile] });
      case 'jobs':
        return options.failJobs
          ? send({ error: 'Listings are unavailable. Please retry.' }, 503)
          : send({ jobs: options.duplicateTitles ? [job, { ...job, id: twinId }] : [job] });
      case 'get_my_profile':
        if (current && options.profileRevision) current = { ...current, revision: options.profileRevision };
        return send({ profile: current });
      case 'my_applications':
        return send({ applications: apps });
      case 'manageable_tenants':
        return send({
          tenants: options.noTenants
            ? []
            : [{ id: tenantId, name: 'First synthetic academy', role: 'owner' }, {
              id: secondTenant,
              name: 'Second synthetic academy',
              role: 'admin',
            }],
        });
      case 'my_jobs':
        return send({ jobs: [{ ...job, status: 'open', application_count: 1 }] });
      case 'list_applications':
        return options.failCandidates
          ? send({ error: 'Applicants could not be loaded.' }, 503)
          : send({ applications: [{ ...application, status: currentStatus }] });
      case 'upsert_profile': {
        if (options.failProfile) return send({ error: 'Profile save not confirmed. Please retry.' }, 503);
        if (options.conflict) {
          current = { ...profile, revision: 2, full_name: 'Changed in another tab' };
          return send({ error: 'Your profile changed. Reload it before saving.' }, 409);
        }
        if (options.invalidReceipt) return send({ profile: { id: teacherId } });
        if (body.expected_revision !== (current?.revision ?? 0)) {
          return send({ error: 'Your profile changed. Reload it before saving.' }, 409);
        }
        current = { ...profile, ...body, revision: body.expected_revision + 1 };
        return send({ profile: current, request_id: body.request_id });
      }
      case 'post_job':
        return options.failPost
          ? send({ error: 'Posting not confirmed. Please retry.' }, 503)
          : send({ job: { ...job, ...body, id: jobId } });
      case 'apply': {
        if (options.failApply) return send({ error: 'Application not confirmed. Please retry.' }, 503);
        if (options.invalidReceipt) return send({ ok: true });
        apps = [{
          ...application,
          cover_note: body.cover_note,
          listing_id: body.listing_id,
          job_listings: { ...application.job_listings, id: body.listing_id },
        }];
        return send({
          application: {
            id: applicationId,
            listing_id: body.listing_id,
            status: 'pending',
            applied_at: application.applied_at,
          },
        });
      }
      case 'close_job':
        return send({ ok: true, job: { id: body.job_id, status: 'closed' } });
      case 'update_application_status': {
        if (options.failDecision) return send({ error: 'Decision not confirmed. Please retry.' }, 503);
        currentStatus = body.status;
        return send({
          ok: true,
          decision: {
            request_id: body.request_id,
            application_id: body.application_id,
            from_status: body.expected_status,
            to_status: body.status,
          },
          application: { id: body.application_id, status: currentStatus },
        });
      }
      default:
        return send({ error: 'Unknown command' }, 404);
    }
  });
  await page.goto('/marketplace?tab=' + tab);
  await expect(page.getByRole('heading', { name: 'Teacher Marketplace', exact: true })).toBeVisible();
  if (!options.anonymous && !options.legacy) {
    await expect.poll(() => calls.some((c) => c.action === 'manageable_tenants')).toBe(true);
  }
  return { calls, options };
}

test('public browsing loads teachers and positions without requiring a session', async ({ page }) => {
  const { calls } = await setup(page, { anonymous: true });
  await expect(page.getByRole('heading', { name: profile.full_name })).toBeVisible();
  await page.getByRole('button', { name: 'Find jobs', exact: true }).click();
  await expect(page.getByRole('heading', { name: job.title, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in to apply' })).toBeVisible();
  expect(
    calls.some((c) => ['get_my_profile', 'my_applications', 'manageable_tenants'].includes(String(c.action))),
  ).toBe(false);
  await expect(page.getByText('0 – 0 UZS', { exact: true })).toBeVisible();
});
test('marketplace mobile burger opens navigation and Escape restores focus', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page, {}, 'jobs');
  await page.getByRole('button', { name: 'Open menu', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Support', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Open menu', exact: true })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Support', exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Open menu', exact: true }).click();
  await page.getByRole('heading', { name: 'Teacher Marketplace', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open menu', exact: true })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
});
test('load failures never masquerade as an empty job board and retry recovers', async ({ page }) => {
  const options = { failJobs: true };
  await setup(page, options, 'jobs');
  await expect(page.getByRole('alert')).toContainText('Listings are unavailable');
  await expect(page.getByText('No open positions are available right now.')).toHaveCount(0);
  options.failJobs = false;
  await page.getByRole('button', { name: 'Retry loading', exact: true }).click();
  await expect(page.getByRole('heading', { name: job.title, exact: true })).toBeVisible();
});
test('legacy API keeps new mutations disabled during the production rollout', async ({ page }) => {
  const { calls } = await setup(page, { legacy: true }, 'profile');
  await expect(page.getByRole('alert')).toContainText('Saving is unavailable during');
  await expect(page.getByRole('button', { name: 'Save profile', exact: true })).toBeDisabled();
  expect(calls.some((c) => c.action === 'upsert_profile')).toBe(false);
});
test('new profiles start private and zero values are submitted without losing hidden fields', async ({ page }) => {
  const { calls } = await setup(page, { noProfile: true }, 'profile');
  await expect(page.getByLabel('Full name', { exact: true })).toBeEnabled();
  await expect(page.getByRole('checkbox', { name: /Show my profile/ })).not.toBeChecked();
  await page.getByLabel('Full name', { exact: true }).fill('New teacher');
  await page.getByLabel('Hourly rate (UZS)', { exact: true }).fill('0');
  await page.getByLabel('Years of experience', { exact: true }).fill('0');
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect(page.getByText('Profile save confirmed.', { exact: true })).toBeVisible();
  const body = calls.find((c) => c.action === 'upsert_profile')!;
  expect(body.hourly_rate).toBe(0);
  expect(body.experience_years).toBe(0);
  expect(body.is_public).toBe(false);
  expect(body.expected_revision).toBe(0);
  expect(body.verified).toBeUndefined();
});
test('failed profile save survives reload with the exact original request and disabled replacement writes', async ({ page }) => {
  const { calls } = await setup(page, { failProfile: true }, 'profile');
  await expect(page.getByLabel('Full name', { exact: true })).toBeEnabled();
  await page.getByLabel('Full name', { exact: true }).fill('Keep this profile draft');
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Profile save not confirmed');
  await expect(page.getByLabel('Full name', { exact: true })).toBeDisabled();
  const first = calls.find((c) => c.action === 'upsert_profile');
  await page.reload();
  await expect(page.getByLabel('Full name', { exact: true })).toHaveValue('Keep this profile draft');
  await expect(page.getByRole('button', { name: 'Retry confirmation' })).toBeEnabled();
  await page.getByRole('button', { name: 'Retry confirmation' }).click();
  await expect.poll(() => calls.filter((c) => c.action === 'upsert_profile').length).toBe(2);
  expect(calls.filter((c) => c.action === 'upsert_profile')[1]).toEqual(first);
});
test('invalid save receipt retains recovery until a valid matching receipt arrives', async ({ page }) => {
  const options = { invalidReceipt: true };
  const { calls } = await setup(page, options, 'profile');
  await expect(page.getByLabel('Full name', { exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Could not confirm');
  expect(await page.evaluate((a) => sessionStorage.getItem('schood.marketplace.recovery.v1.' + a), actor))
    .toBeTruthy();
  options.invalidReceipt = false;
  await page.getByRole('button', { name: 'Retry confirmation' }).click();
  await expect(page.getByText('Profile save confirmed.', { exact: true })).toBeVisible();
  expect(calls.filter((c) => c.action === 'upsert_profile')[1]).toEqual(
    calls.filter((c) => c.action === 'upsert_profile')[0],
  );
  expect(await page.evaluate((a) => sessionStorage.getItem('schood.marketplace.recovery.v1.' + a), actor))
    .toBeNull();
});
test('stale profile refuses further edits until the saved version is explicitly loaded', async ({ page }) => {
  await setup(page, { conflict: true }, 'profile');
  await expect(page.getByLabel('Full name', { exact: true })).toBeEnabled();
  await page.getByLabel('Full name', { exact: true }).fill('Stale edit');
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('profile changed');
  await expect(page.getByRole('button', { name: 'Save profile', exact: true })).toBeDisabled();
  await expect(page.getByLabel('Full name', { exact: true })).toHaveValue('Stale edit');
  await page.getByRole('button', { name: 'Reload saved profile' }).click();
  await expect(page.getByLabel('Full name', { exact: true })).toHaveValue('Changed in another tab');
  await expect(page.getByRole('button', { name: 'Save profile', exact: true })).toBeEnabled();
});
test('background reload cannot rebase an unsaved profile onto a newer saved revision', async ({ page }) => {
  const options: Options = { failJobs: true };
  const { calls } = await setup(page, options, 'profile');
  await expect(page.getByLabel('Full name', { exact: true })).toBeEnabled();
  await page.getByLabel('Full name', { exact: true }).fill('Unsaved original-version draft');
  options.profileRevision = 2;
  await page.getByRole('button', { name: 'Find jobs', exact: true }).click();
  await page.getByRole('button', { name: 'Retry loading', exact: true }).click();
  await expect.poll(() => calls.filter((c) => c.action === 'get_my_profile').length).toBe(2);
  await page.getByRole('button', { name: 'My profile', exact: true }).click();
  await expect(page.getByLabel('Full name', { exact: true })).toHaveValue('Unsaved original-version draft');
  await expect(page.getByRole('button', { name: 'Save profile', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('profile changed');
  expect(calls.find((c) => c.action === 'upsert_profile')?.expected_revision).toBe(1);
  await expect(page.getByLabel('Full name', { exact: true })).toHaveValue('Unsaved original-version draft');
});
test('unavailable browser recovery storage refuses a write without losing the form', async ({ page }) => {
  const { calls } = await setup(page, {}, 'profile');
  await expect(page.getByLabel('Full name', { exact: true })).toBeEnabled();
  await page.getByLabel('Full name', { exact: true }).fill('Draft stays when storage is blocked');
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('Storage blocked', 'QuotaExceededError');
    };
  });
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Could not retain your request');
  expect(calls.some((c) => c.action === 'upsert_profile')).toBe(false);
  await expect(page.getByLabel('Full name', { exact: true })).toHaveValue(
    'Draft stays when storage is blocked',
  );
});
test('applications match listing IDs when two jobs have the same title', async ({ page }) => {
  const { calls } = await setup(page, { duplicateTitles: true }, 'jobs');
  const positions = page.getByRole('article', { name: job.title, exact: true });
  await expect(positions).toHaveCount(2);
  await expect(positions.nth(0).getByText('Application status: hired')).toBeVisible();
  await expect(positions.nth(1).getByRole('button', { name: 'Apply for this position' })).toBeEnabled();
  await positions.nth(1).getByLabel('Cover note for ' + job.title).fill(
    'Different listing with the same title',
  );
  await positions.nth(1).getByRole('button', { name: 'Apply for this position' }).click();
  await expect(page.getByText('Application confirmed.', { exact: false })).toBeVisible();
  expect(calls.find((c) => c.action === 'apply')?.listing_id).toBe(twinId);
});
test('failed application keeps the cover note and replays it unchanged after reload', async ({ page }) => {
  const { calls } = await setup(page, { failApply: true }, 'jobs');
  await expect(page.getByRole('button', { name: 'Apply for this position' })).toBeEnabled();
  await page.getByLabel('Cover note for ' + job.title).fill('Keep this personal cover note.');
  await page.getByRole('button', { name: 'Apply for this position' }).click();
  await expect(page.getByRole('alert')).toContainText('Application not confirmed');
  await page.reload();
  await expect(page.getByLabel('Cover note for ' + job.title)).toHaveValue('Keep this personal cover note.');
  await expect(page.getByRole('button', { name: 'Retry confirmation' })).toBeEnabled();
  await page.getByRole('button', { name: 'Retry confirmation' }).click();
  await expect.poll(() => calls.filter((c) => c.action === 'apply').length).toBe(2);
  expect(calls.filter((c) => c.action === 'apply')[1]).toEqual(calls.filter((c) => c.action === 'apply')[0]);
});
test('employer chooses the intended academy and failed posting cannot create a replacement', async ({ page }) => {
  const { calls } = await setup(page, { failPost: true }, 'post');
  await expect(page.getByRole('combobox', { name: 'Academy', exact: true })).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Publish job', exact: true })).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Academy', exact: true }).selectOption(secondTenant);
  await page.getByLabel('Job title', { exact: true }).fill('A deliberate second-academy position');
  await page.getByRole('button', { name: 'Publish job', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Posting not confirmed');
  const first = calls.find((c) => c.action === 'post_job');
  expect(first?.tenant_id).toBe(secondTenant);
  await expect(page.getByRole('combobox', { name: 'Academy', exact: true })).toBeDisabled();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Retry confirmation' })).toBeEnabled();
  await page.getByRole('button', { name: 'Retry confirmation' }).click();
  await expect.poll(() => calls.filter((c) => c.action === 'post_job').length).toBe(2);
  expect(calls.filter((c) => c.action === 'post_job')[1]).toEqual(first);
});
test('ordinary members have no academy publishing or hiring controls', async ({ page }) => {
  const { calls } = await setup(page, { noTenants: true }, 'post');
  await expect(page.getByText('You do not currently manage an academy.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Publish job', exact: true })).toHaveCount(0);
  expect(calls.some((c) => c.action === 'my_jobs')).toBe(false);
});
test('employer decision recovery preserves expected status and the original request', async ({ page }) => {
  const options = { failDecision: true };
  const { calls } = await setup(page, options, 'post');
  await page.getByRole('combobox', { name: 'Academy', exact: true }).selectOption(tenantId);
  await page.getByRole('button', { name: 'Review applicants for ' + job.title }).click();
  await expect(page.getByRole('button', { name: 'Shortlist', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Shortlist', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Decision not confirmed');
  const first = calls.find((c) => c.action === 'update_application_status');
  expect(first?.expected_status).toBe('pending');
  options.failDecision = false;
  await page.getByRole('button', { name: 'Retry confirmation' }).click();
  await expect(page.getByText('Hiring decision confirmed. Current status: shortlisted.')).toBeVisible();
  await expect(page.getByText('Status: shortlisted', { exact: true })).toBeVisible();
  expect(calls.filter((c) => c.action === 'update_application_status')[1]).toEqual(first);
  await page.getByRole('button', { name: 'Mark hired', exact: true }).click();
  await expect(page.getByText('Status: hired', { exact: true })).toBeVisible();
  expect(calls.filter((c) => c.action === 'update_application_status')[2].expected_status).toBe(
    'shortlisted',
  );
});
test('failed applicant loads recover without claiming there are no applicants', async ({ page }) => {
  const options = { failCandidates: true };
  await setup(page, options, 'post');
  await page.getByRole('combobox', { name: 'Academy', exact: true }).selectOption(tenantId);
  await page.getByRole('button', { name: 'Review applicants for ' + job.title }).click();
  await expect(page.getByRole('alert')).toContainText('Applicants could not be loaded');
  await expect(page.getByText('No applications for this listing yet.')).toHaveCount(0);
  options.failCandidates = false;
  await page.getByRole('button', { name: 'Retry loading', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Shortlist', exact: true })).toBeVisible();
});
test('listing closure sends its stable identity and requires a matching confirmed receipt', async ({ page }) => {
  const { calls } = await setup(page, {}, 'post');
  await page.getByRole('combobox', { name: 'Academy', exact: true }).selectOption(tenantId);
  await page.getByRole('button', { name: 'Close listing: ' + job.title }).click();
  await expect(page.getByText('Listing closed.', { exact: false })).toBeVisible();
  expect(calls.find((c) => c.action === 'close_job')?.job_id).toBe(jobId);
});
test('synchronous duplicate save clicks send one request', async ({ page }) => {
  const { calls } = await setup(page, { failProfile: true }, 'profile');
  await expect(page.getByRole('button', { name: 'Save profile', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Save profile', exact: true }).evaluate((b: HTMLButtonElement) => {
    b.click();
    b.click();
  });
  await expect(page.getByRole('alert')).toContainText('Profile save not confirmed');
  expect(calls.filter((c) => c.action === 'upsert_profile')).toHaveLength(1);
});
test('sign out hides a private draft and ignores its delayed save confirmation', async ({ page }) => {
  await setup(page, {}, 'profile');
  let unblock!: () => void;
  const held = new Promise<void>((r) => {
    unblock = r;
  });
  let writes = 0;
  await page.route('**/functions/v1/teacher-marketplace', async (route) => {
    const body = route.request().postDataJSON();
    if (body.action !== 'upsert_profile') return route.fallback();
    writes++;
    await held;
    return route.fulfill({
      headers: { 'X-Marketplace-Version': '2' },
      json: { profile: { ...profile, ...body, revision: 2 }, request_id: body.request_id },
    });
  });
  await expect(page.getByLabel('Full name', { exact: true })).toBeEnabled();
  await page.getByLabel('Full name', { exact: true }).fill('Private original-account draft');
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect.poll(() => writes).toBe(1);
  await page.evaluate(async () => {
    const path = '/src/lib/supabase.ts';
    const { supabase } = await import(path);
    await supabase.auth.signOut({ scope: 'local' });
  });
  await expect(page.getByRole('heading', { name: 'Sign in to continue', exact: true })).toBeVisible();
  unblock();
  await expect(page.getByText('Profile save confirmed.', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Full name', { exact: true })).toHaveCount(0);
  expect(await page.evaluate((a) => sessionStorage.getItem('schood.marketplace.recovery.v1.' + a), actor))
    .toBeNull();
});
for (const width of [320, 390, 768, 1280]) {
  test(
    'marketplace profile, jobs and employer review fit and are accessible at ' + width,
    async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await setup(page, {}, 'profile');
      await expect(page.getByRole('button', { name: 'Save profile', exact: true })).toBeEnabled();
      for (const tab of ['profile', 'jobs', 'post']) {
        await page.getByRole('button', {
          name: tab === 'profile' ? 'My profile' : tab === 'jobs' ? 'Find jobs' : 'Employer workspace',
          exact: true,
        }).click();
        if (tab === 'post') {
          await page.getByRole('combobox', { name: 'Academy', exact: true }).selectOption(tenantId);
          await page.getByRole('button', { name: 'Review applicants for ' + job.title }).click();
          await expect(page.getByRole('button', { name: 'Shortlist', exact: true })).toBeVisible();
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        expect(
          (await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
            .analyze()).violations,
        ).toEqual([]);
      }
      expect(errors).toEqual([]);
      await expect(page.getByRole('button', { name: /updates/i })).toHaveCount(0);
      if (width === 390 || width === 1280) {
        await page.screenshot({
          path: '../../docs/customer-readiness/2026-10-09-marketplace-local-' + width + '.png',
          fullPage: true,
        });
      }
    },
  );
}
