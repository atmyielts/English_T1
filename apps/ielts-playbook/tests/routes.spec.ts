import { expect, test, type Page, type Route } from '@playwright/test';

// Route tests for IELTS Playbook with every network call mocked. Nothing here
// talks to production.

const PRODUCT_ID = '9de6c9e7-31df-4d1d-9574-1f8f84a53b54';
const USER_ID = '6c1d7a4e-0000-4000-8000-000000000001';

type Tier = 'anonymous' | 'free' | 'premium';

const modules = [
  { id: 'm1', slug: 'essentials', module_key: 'essentials', title: 'IELTS Essentials', summary: 'Start here.', sort_order: 1, metadata: { hero_kicker: 'Module 1' }, published_at: null },
  { id: 'm2', slug: 'test-types-booking', module_key: 'test-types-booking', title: 'Test Types and Booking Decisions', summary: 'Choose the right test.', sort_order: 2, metadata: {}, published_at: null },
  { id: 'm3', slug: 'writing-master-guide', module_key: 'writing-master-guide', title: 'Writing Master Guide', summary: 'Writing.', sort_order: 5, metadata: {}, published_at: null },
];

const wideTable = [
  '| Time | Action | Why it matters | What to avoid | Notes for the second attempt |',
  '|---|---|---|---|---|',
  '| 0-3 minutes | Read Task 1 carefully and plan the overview | The overview carries Task Achievement | Copying the prompt word for word | Underline the trend words |',
].join('\n');

const publicPage = {
  page: { id: 'p1', slug: 'writing-master-guide', module_key: 'writing-master-guide', title: 'Writing Master Guide', summary: 'A full IELTS Writing guide.', visibility: 'public', page_type: 'module', metadata: {} },
  sections: [
    { id: 's1', block_type: 'rich_text', heading: 'Why This Matters', sort_order: 1, content: { markdown: 'Writing is often the skill that stops candidates.\n\n' + wideTable }, metadata: {} },
    { id: 's2', block_type: 'checklist', heading: 'Key Outcomes', sort_order: 2, content: { items: ['Understand Task 2', 'Plan answers'] }, metadata: {} },
  ],
  child_pages: [{ id: 'c1', slug: 'guide-writing-task-2-premium', title: 'Writing Task 2', summary: 'Premium guide.', visibility: 'premium', metadata: {} }],
  sources: [{ sort_order: 1, citation_note: 'Assessment criteria', is_primary: true, source: { title: 'IELTS Assessment Guide', url: 'https://takeielts.britishcouncil.org/teach-ielts/test-information/assessment', metadata: {} } }],
};

const premiumPage = {
  page: { id: 'p2', slug: 'guide-writing-task-2-premium', module_key: 'writing-master-guide', title: 'Writing Task 2', summary: 'Premium Task 2 guide.', visibility: 'premium', page_type: 'guide', metadata: {} },
  sections: [
    { id: 'sec-a', block_type: 'rich_text', heading: 'Advanced Lab: How to Use This Section', sort_order: 22, content: { markdown: 'Train under timed conditions.' }, metadata: {} },
  ],
  child_pages: [],
  sources: [],
};

const teaser = {
  slug: 'guide-writing-task-2-premium',
  title: 'Writing Task 2',
  summary: 'Premium Task 2 guide.',
  module_key: 'writing-master-guide',
  page_type: 'guide',
  section_count: 45,
  headings: ['Why This Matters', 'Advanced Lab: How to Use This Section', 'Worked Example 1: A Band 7-Style Essay'],
};

const markets = [
  { id: 'g', country_code: 'GLOBAL', provider_key: 'british-council', summary: 'Global guide.', ukvi_available: false, computer_available: true, writing_on_paper_available: false, one_skill_retake_available: false, result_timing_note: null, booking_url: 'https://ielts.org/take-a-test/test-types', verified_at: null, metadata: {} },
  { id: 'uz-bc', country_code: 'UZ', provider_key: 'british-council', summary: 'IELTS in Uzbekistan with the British Council.', ukvi_available: false, computer_available: true, writing_on_paper_available: false, one_skill_retake_available: true, result_timing_note: 'Check the booking page.', booking_url: 'https://www.britishcouncil.uz/en/exam/ielts/book-test', verified_at: null, metadata: { local_guide: { cities: ['Tashkent', 'Samarkand'], fees: 'Check the official page.', booking: ['Decide Academic or General Training first.'] } } },
  { id: 'uz-idp', country_code: 'UZ', provider_key: 'idp', summary: 'IELTS in Uzbekistan with IDP.', ukvi_available: false, computer_available: true, writing_on_paper_available: false, one_skill_retake_available: true, result_timing_note: null, booking_url: 'https://ielts.idp.com/uzbekistan', verified_at: null, metadata: {} },
];

type Calls = { method: string; path: string; search: string; body: unknown }[];

const seedSession = async (page: Page) => {
  const session = {
    access_token: `user.${Buffer.from(JSON.stringify({ sub: USER_ID, role: 'authenticated' })).toString('base64url')}.fixture`,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: 'route-smoke-refresh-token',
    user: { id: USER_ID, aud: 'authenticated', role: 'authenticated', email: 'learner@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00.000Z' },
  };
  await page.context().addCookies([
    { name: 'schood-auth', value: encodeURIComponent(JSON.stringify(session)), domain: '127.0.0.1', path: '/', httpOnly: false, sameSite: 'Lax' },
  ]);
};

const json = (route: Route, status: number, body: unknown) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const setup = async (
  page: Page,
  tier: Tier,
  overrides: Partial<Record<string, (route: Route, body: unknown) => Promise<void> | void>> = {},
) => {
  const calls: Calls = [];
  let profile: Record<string, unknown> = { target_overall_band: 7, test_market_country_code: 'UZ', provider_key: 'british-council', metadata: { plan_modules: [] } };
  let notes = [
    { id: 'n1', page_id: 'p1', section_id: null, anchor_text: 'Task 2 counts more than Task 1', body: 'Plan 5 minutes', color: 'amber', updated_at: '2026-10-20T10:00:00Z', page: { slug: 'writing-master-guide', title: 'Writing Master Guide', module_key: 'writing-master-guide' } },
  ];
  if (tier !== 'anonymous') await seedSession(page);

  await page.route('http://127.0.0.1:54321/auth/v1/**', (route) => json(route, 200, {}));
  await page.route('http://127.0.0.1:54321/functions/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/functions/v1', '');
    let body: unknown = null;
    try { body = request.postDataJSON(); } catch { body = null; }
    calls.push({ method: request.method(), path, search: url.search, body });
    const key = `${request.method()} ${path}`;
    const override = overrides[key];
    if (override) return override(route, body);
    const signedIn = tier !== 'anonymous' && (request.headers()['authorization'] ?? '').includes('user.');

    if (path === '/me') {
      return json(route, 200, {
        user: { id: USER_ID, email: 'learner@example.test', role: 'student' },
        entitlements: tier === 'premium' ? [{ id: 'e1', resource_type: 'product', resource_id: PRODUCT_ID, starts_at: null, ends_at: null }] : [],
        admin: null,
      });
    }
    if (path === '/access-effective') return json(route, 200, { effective_product_ids: tier === 'premium' ? [PRODUCT_ID] : [] });
    if (path === '/ielts-playbook/catalog') return json(route, 200, { product_slug: 'ielts-playbook', modules, premium_guides: [{ id: 'c1', slug: 'guide-writing-task-2-premium', title: 'Writing Task 2', summary: '', page_type: 'guide', module_key: null, parent_page_id: null, published_at: null }] });
    if (path === '/ielts-playbook/updates') return json(route, 200, { recent_sources: [], markets: [] });
    if (path === '/ielts-playbook/markets') return json(route, 200, { markets });
    if (path === '/ielts-playbook/events') return json(route, 200, { ok: true });
    if (path.startsWith('/ielts-playbook/modules/')) return json(route, 200, { ok: true, visited_modules: [] });
    if (path === '/ielts-playbook/pages/writing-master-guide' || path === '/ielts-playbook/pages/test-types-booking') {
      return json(route, 200, path.endsWith('test-types-booking') ? { ...publicPage, page: { ...publicPage.page, slug: 'test-types-booking' } } : publicPage);
    }
    if (path === '/ielts-playbook/pages/guide-writing-task-2-premium') {
      if (tier === 'premium' && signedIn) return json(route, 200, premiumPage);
      return json(route, signedIn ? 403 : 401, { error: signedIn ? 'Premium access required' : 'Unauthorized', code: 'premium_required', teaser });
    }
    if (path === '/ielts-playbook/pages/guide-writing-task-2-premium/sections/sec-a/thread') {
      return json(route, 200, { ok: true, messages: [{ role: 'user', content: 'What is a position ladder?', at: '2026-10-20T10:00:00Z' }, { role: 'assistant', content: 'It is a way to state a nuanced view.', at: '2026-10-20T10:00:01Z' }] });
    }
    if (path === '/ielts-playbook/profile' && request.method() === 'GET') return json(route, 200, { profile });
    if (path === '/ielts-playbook/profile' && request.method() === 'PATCH') {
      const patch = (body ?? {}) as Record<string, unknown>;
      profile = { ...profile, ...patch, metadata: { ...(profile.metadata as Record<string, unknown>), ...((patch.metadata as Record<string, unknown>) ?? {}) } };
      return json(route, 200, { ok: true, profile });
    }
    if (path === '/ielts-playbook/dashboard') {
      return json(route, 200, {
        profile,
        latest_recommendation: { created_at: '2026-10-20T10:00:00Z', planning: { weakest_skill: 'writing', deadline_bucket: 'balanced', realistic_timeline: 'Realistic.' }, plan_template: { slug: 'balanced-28', title: 'Balanced 28-day plan' }, recommended_module_order: [{ slug: 'writing-master-guide', reason: 'Primary repair should start with writing.' }] },
        latest_simulator_outcome: { id: 'o1', overall_band: 6.5, computed_at: '2026-10-19T10:00:00Z' },
        practice_evidence: { connected: false },
        connected_services: { simulator: { connected: true }, practice: { connected: false } },
        premium_guides: [],
        insights: { trajectory: { series: [], predictor: {} }, activity: { days: [], streak: { current_days: 0, longest_days: 0, last_practice_date: null }, totals: { last_7_days: 0, last_30_days: 0, all_time: 0 } }, mastery: { by_status: {}, recent_graduations: [], totals: { tracked: 0, mastered: 0, weak: 0 } } },
        simulator_anchor: url.searchParams.get('session_id') ? { session_id: url.searchParams.get('session_id'), found: true, computed_at: '2026-10-19T10:00:00Z', overall_band: 6.5 } : null,
      });
    }
    if (path === '/ielts-playbook/recommendations/generate') {
      const sessionId = (body as Record<string, unknown> | null)?.session_id ?? null;
      return json(route, 200, {
        ok: true,
        snapshot: { id: 'r1' },
        recommendation: {
          profile,
          planning: { weakest_skill: 'writing', deadline_bucket: 'balanced', realistic_timeline: 'Realistic.', likely_bottlenecks: ['Task response.'] },
          decision: { selected_track: 'academic', recommended_delivery_mode: 'computer', one_skill_retake_eligible: false },
          plan_template: { slug: 'balanced-28', title: 'Balanced 28-day plan', summary: 'Four weeks.' },
          outcome_summary: { current_overall_band: 6.5 },
          evidence_summary: { simulator: { connected: true, overall_band: 6.5, latest_computed_at: '2026-10-19T10:00:00Z' }, practice: { connected: false } },
          practice_evidence: { connected: false },
          recommended_module_order: [{ slug: 'writing-master-guide', reason: 'Start with writing.' }],
          simulator_anchor: sessionId ? { session_id: sessionId, found: true, overall_band: 6.5, computed_at: '2026-10-19T10:00:00Z' } : null,
        },
      });
    }
    if (path === '/ielts-playbook/diagnostic/synthesize') {
      return json(route, 200, { ok: true, ai_status: 'ok', narrative: 'Writing is your bottleneck.', section_priority: ['writing', 'reading', 'listening', 'speaking'], risks: [], weekly_hours_needed: 8, feasibility: 'tight', generated_at: '2026-10-20T10:00:00Z' });
    }
    if (path === '/ielts-playbook/notes' && request.method() === 'GET') return json(route, 200, { ok: true, notes });
    if (path.startsWith('/ielts-playbook/notes/') && request.method() === 'DELETE') {
      notes = notes.filter((note) => !path.endsWith(note.id));
      return json(route, 200, { ok: true });
    }
    if (path === '/ielts-playbook/plans/balanced-28') {
      return json(route, 200, { plan: { slug: 'balanced-28', title: 'Balanced 28-day plan', summary: 'Four weeks.', duration_days: 28, intensity: 'moderate', band_min: 5.5, band_max: 7, plan_type: 'balanced', focus_skill: null, schedule_json: { phases: [{ label: 'Diagnose', goal: 'Find the gap.' }] } }, latest_recommendation: null });
    }
    if (path === '/ielts-playbook/plans/balanced-28/generate-ai') {
      return json(route, 200, { ok: true, ai_status: 'ok', plan_slug: 'balanced-28', intro: 'Tailored to writing.', weekly_hours: 10, generated_at: '2026-10-20T10:00:00Z', weeks: [{ week_number: 1, theme: 'Task 2 structure', focus_sections: ['writing'], hours: 10, key_activities: ['Write two essays'], success_criteria: 'Two essays reviewed.', playbook_modules: ['writing-master-guide'] }] });
    }
    return json(route, 404, { error: 'Not mocked', path });
  });
  return calls;
};

const expectNoHorizontalOverflow = async (page: Page) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'page must not scroll sideways').toBeLessThanOrEqual(0);
};

const phone = { width: 375, height: 812 };

test.describe('IELTS Playbook routes (mocked API)', () => {
  test('home: modules, Schood chrome and no overflow at 375px and 320px', async ({ page }) => {
    await setup(page, 'anonymous');
    await page.setViewportSize(phone);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'IELTS Playbook', level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: 'IELTS Essentials' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Schood home' })).toHaveAttribute('href', 'https://schood.online');
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByLabel('Language')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.setViewportSize({ width: 320, height: 700 });
    await expectNoHorizontalOverflow(page);
  });

  test('locale switch follows ?lang= and changes the UI, not the content', async ({ page }) => {
    await setup(page, 'anonymous');
    await page.goto('/?lang=uz');
    await expect(page.getByRole('link', { name: 'Schood bosh sahifa' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'IELTS Essentials' })).toBeVisible();
    await page.getByLabel('Til').selectOption('ru');
    await expect(page.getByRole('link', { name: 'Главная Schood' })).toBeVisible();
  });

  test('public module for a signed-out reader: content, premium tools labelled, wide table scrolls inside its card', async ({ page }) => {
    await setup(page, 'anonymous');
    await page.setViewportSize(phone);
    await page.goto('/writing-master-guide');
    await expect(page.getByRole('heading', { name: 'Writing Master Guide', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Why This Matters' })).toBeVisible();
    await expect(page.locator('.table-scroll table')).toBeVisible();
    const premium = page.getByTestId('premium-features');
    await expect(premium).toBeVisible();
    await expect(premium.getByTestId('premium-upgrade')).toHaveAttribute('href', /\/auth\?.*product=ielts-playbook/);
    await expect(page.getByTestId('use-in-plan')).toHaveAttribute('href', /product=ielts-playbook/);
    await expect(page.locator('.notice-danger')).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  });

  test('free signed-in reader sees an upgrade path, never a raw error', async ({ page }) => {
    const calls = await setup(page, 'free');
    await page.goto('/writing-master-guide');
    await expect(page.getByRole('heading', { name: 'Why This Matters' })).toBeVisible();
    const upgrade = page.getByTestId('premium-features').getByTestId('premium-upgrade');
    await expect(upgrade).toHaveAttribute('href', /\/pricing\?.*product=ielts-playbook/);
    await expect(page.getByText('Explain this strategy with my actual mistakes')).toHaveCount(0);
    await expect(page.locator('.notice-danger')).toHaveCount(0);
    expect(calls.some((call) => call.path.endsWith('/explain') || call.path === '/ielts-playbook/notes')).toBe(false);
  });

  test('revisit renders from the tab cache while the network is failing', async ({ page }) => {
    let fail = false;
    await setup(page, 'anonymous', {
      'GET /ielts-playbook/pages/writing-master-guide': (route) =>
        fail
          ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' })
          : route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(publicPage) }),
    });
    await page.goto('/writing-master-guide');
    await expect(page.getByRole('heading', { name: 'Why This Matters' })).toBeVisible();
    fail = true;
    await page.goto('/');
    await page.goto('/writing-master-guide');
    await expect(page.getByRole('heading', { name: 'Why This Matters' })).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('Could not refresh');
  });

  test('premium guide is a labelled locked view at 375px for signed-out readers', async ({ page }) => {
    await setup(page, 'anonymous');
    await page.setViewportSize(phone);
    await page.goto('/guide-writing-task-2-premium');
    const locked = page.getByTestId('premium-locked');
    await expect(locked).toBeVisible();
    await expect(locked).toContainText('Worked Example 1: A Band 7-Style Essay');
    await expect(locked).toContainText('45 sections inside');
    await expect(locked.getByTestId('premium-upgrade')).toHaveAttribute('href', /product=ielts-playbook/);
    await expectNoHorizontalOverflow(page);
  });

  test('premium reader: section coach thread loads and Use in my plan saves the module', async ({ page }) => {
    const calls = await setup(page, 'premium');
    await page.goto('/guide-writing-task-2-premium');
    await expect(page.getByRole('heading', { name: 'Advanced Lab: How to Use This Section' })).toBeVisible();
    await page.getByRole('button', { name: /Ask about/ }).click();
    await expect(page.getByText('It is a way to state a nuanced view.')).toBeVisible();
    expect(calls.some((call) => call.method === 'GET' && call.path.endsWith('/sections/sec-a/thread'))).toBe(true);

    await page.getByTestId('use-in-plan').click();
    await expect(page.getByTestId('use-in-plan')).toHaveText(/In my plan/);
    const patch = calls.find((call) => call.method === 'PATCH' && call.path === '/ielts-playbook/profile');
    expect((patch?.body as { metadata?: { plan_modules?: string[] } })?.metadata?.plan_modules).toContain('guide-writing-task-2-premium');
  });

  test('section coach surfaces a failed thread load', async ({ page }) => {
    await setup(page, 'premium', {
      'GET /ielts-playbook/pages/guide-writing-task-2-premium/sections/sec-a/thread': (route) =>
        route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"x"}' }),
    });
    await page.goto('/guide-writing-task-2-premium');
    await page.getByRole('button', { name: /Ask about/ }).click();
    await expect(page.getByRole('alert')).toContainText('Could not load your earlier questions');
  });

  test('test path page offers the Uzbekistan market with both providers', async ({ page }) => {
    await setup(page, 'anonymous');
    await page.setViewportSize(phone);
    await page.goto('/test-types-booking');
    const panel = page.getByTestId('market-panel');
    await expect(panel).toContainText('IELTS in Uzbekistan with the British Council.');
    await expect(panel).toContainText('Tashkent');
    await panel.getByLabel('Provider').selectOption('idp');
    await expect(panel).toContainText('IELTS in Uzbekistan with IDP.');
    await expectNoHorizontalOverflow(page);
  });

  test('diagnostic reads ?source=simulator&session_id= and anchors the plan', async ({ page }) => {
    const calls = await setup(page, 'premium');
    await page.setViewportSize(phone);
    await page.goto('/diagnostic?source=simulator&session_id=sim-session-42');
    await expect(page.getByTestId('simulator-anchor')).toContainText('overall 6.5');
    const generate = calls.find((call) => call.path === '/ielts-playbook/recommendations/generate');
    expect((generate?.body as { session_id?: string })?.session_id).toBe('sim-session-42');
    await expect(page.getByRole('heading', { name: 'Modules to study next' })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('dashboard passes the simulator session and fits a 375px screen', async ({ page }) => {
    const calls = await setup(page, 'premium');
    await page.setViewportSize(phone);
    await page.goto('/dashboard?source=simulator&session_id=sim-session-42');
    await expect(page.getByRole('heading', { name: 'Your IELTS command centre.' })).toBeVisible();
    await expect(page.getByTestId('simulator-anchor')).toContainText('overall 6.5');
    expect(calls.some((call) => call.path === '/ielts-playbook/dashboard' && call.search.includes('session_id=sim-session-42'))).toBe(true);
    await expect(page.getByTestId('plan-modules')).toContainText('Nothing added yet');
    await expectNoHorizontalOverflow(page);
    await page.setViewportSize({ width: 320, height: 700 });
    await expectNoHorizontalOverflow(page);
  });

  test('notes: list and remove (DELETE) a highlight', async ({ page }) => {
    const calls = await setup(page, 'premium');
    await page.setViewportSize(phone);
    await page.goto('/notes');
    await expect(page.getByText('Task 2 counts more than Task 1')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.getByRole('button', { name: 'Remove' }).click();
    await expect(page.getByTestId('notes-empty')).toBeVisible();
    expect(calls.some((call) => call.method === 'DELETE' && call.path === '/ielts-playbook/notes/n1')).toBe(true);
  });

  test('plans: AI plan is generated and saved to the profile', async ({ page }) => {
    const calls = await setup(page, 'premium');
    await page.setViewportSize(phone);
    await page.goto('/plans/balanced-28');
    await expect(page.getByRole('heading', { name: 'Balanced 28-day plan', level: 1 })).toBeVisible();
    await page.getByRole('button', { name: /Generate AI plan/ }).click();
    await expect(page.getByTestId('ai-plan')).toContainText('Task 2 structure');
    // The status line can be matched twice while the panel re-renders; one visible copy is enough.
    await expect(page.getByText('Saved to your profile.').first()).toBeVisible();
    // The profile PATCH can land after the "saved" text renders; wait for it.
    const findPatch = () => calls.find((call) => call.method === 'PATCH' && call.path === '/ielts-playbook/profile');
    await expect.poll(findPatch).toBeTruthy();
    const patch = findPatch();
    expect((patch?.body as { metadata?: { saved_ai_plans?: Record<string, unknown> } })?.metadata?.saved_ai_plans).toHaveProperty('balanced-28');
    await expectNoHorizontalOverflow(page);
  });
});
