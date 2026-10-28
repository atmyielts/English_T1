import { expect, test, type Page, type Route } from '@playwright/test';

// Route smoke tests for the SAT Playbook with a fully mocked network.
// Every Supabase / edge call is answered here; anything external is aborted.

const PLAYBOOK = 'a8b41e2c-9a36-4caf-9bba-7212e35a8b8c';
const PRACTICE = '2cf7b1a7-4df9-4de8-99e8-5b9d5bb85010';
const sectionTable = '11111111-0000-4000-8000-000000000001';
const sectionChecklist = '11111111-0000-4000-8000-000000000002';

type Persona = 'anonymous' | 'free' | 'premium' | 'admin';

const page1 = {
  id: 'aaaaaaaa-0000-4000-8000-000000000001', slug: 'math-algebra', title: 'Math: Algebra', summary: 'Linear equations and systems.',
  page_type: 'module', visibility: 'public', module_key: 'math-algebra', parent_page_id: null, sort_order: 7,
  metadata: { module_group: 'domain_math', hero_kicker: 'Module 7', reading_minutes: 24, related_practice: [{ label: 'Algebra question bank', url: 'https://practice.sat.schood.online/bank?domain=algebra' }] },
};
const essentials = { ...page1, id: 'aaaaaaaa-0000-4000-8000-000000000002', slug: 'sat-essentials', title: 'SAT Essentials', sort_order: 1, metadata: { module_group: 'format_overview' } };
const rwModule = { ...page1, id: 'aaaaaaaa-0000-4000-8000-000000000003', slug: 'reading-writing-information-ideas', title: 'R&W: Information and Ideas', sort_order: 2, metadata: { module_group: 'domain_reading_writing' } };
const guide = { ...page1, id: 'aaaaaaaa-0000-4000-8000-000000000004', slug: 'guide-math-hard-module-traps', title: 'Hard Module Traps: Math', visibility: 'premium', page_type: 'guide', module_key: 'math-algebra', metadata: {} };

const wideTable = '| Skill | Easy | Medium | Hard | Desmos? | Typical trap |\n|---|---|---|---|---|---|\n| Linear equations in one variable | 35% | 40% | 25% | Sometimes | Distributing the negative sign incorrectly across parentheses |\n| Systems of linear equations | 30% | 45% | 25% | Often | Solving for the wrong variable |';

const catalog = {
  product_slug: 'sat-playbook', exam: 'sat',
  modules: [essentials, rwModule, page1],
  premium_guides: [guide],
  plan_templates: [{ id: 'tttttttt-0000-4000-8000-000000000001', slug: 'four-week-sprint', title: 'Four-Week Sprint', summary: 'An intensive 28-day plan.', plan_type: 'crash', duration_days: 28, focus_section: 'both', intensity: 'high' }],
};

const pagePayload = {
  page: page1,
  sections: [
    { id: sectionTable, block_type: 'rich_text', heading: 'Where the points are', sort_order: 1, content: { markdown: wideTable }, metadata: {} },
    { id: sectionChecklist, block_type: 'checklist', heading: 'Before you start', sort_order: 2, content: { items: ['Know slope-intercept form', 'Check units'] }, metadata: {} },
    { id: '11111111-0000-4000-8000-000000000003', block_type: 'callout', heading: 'Trap', sort_order: 3, content: { label: 'Sign errors', body: 'Distribute **every** term.' }, metadata: {} },
    { id: '11111111-0000-4000-8000-000000000004', block_type: 'faq', heading: 'Questions', sort_order: 4, content: { items: [{ question: 'Is Desmos allowed?', answer: 'Yes, on every Math question.' }] }, metadata: {} },
  ],
  child_pages: [guide],
  sources: [{ sort_order: 1, citation_note: null, is_primary: true, source: { title: 'College Board: SAT Math', url: 'https://satsuite.collegeboard.org/sat/whats-on-the-test/math' } }],
  parent_page: null,
};

const planTemplate = {
  id: 'tttttttt-0000-4000-8000-000000000001', slug: 'four-week-sprint', title: 'Four-Week Sprint', summary: 'An intensive 28-day plan.', duration_days: 28,
  plan_type: 'crash', focus_section: 'both', intensity: 'high', score_min: 1050, score_max: 1600, metadata: {},
  schedule_json: {},
};
const planWeeks = [
  {
    index: 0, label: 'Week 1: Diagnose and high-yield fixes', focus: ['Baseline full mock'], hours: 12.5, modules: [],
    days: [
      { day: 1, weekday: 'Mon', minutes: 180, tasks: [{ title: 'Full timed mock in the SAT simulator (https://sat.schood.online) at your real test time', page_slug: null, url: 'https://sat.schood.online', minutes: null, day: 1, weekday: 'Mon' }] },
      { day: 3, weekday: 'Wed', minutes: 105, tasks: [{ title: 'Read Math: Algebra (/math-algebra), 25 min', page_slug: 'math-algebra', url: null, minutes: null, day: 3, weekday: 'Wed' }] },
    ],
    tasks: [],
    checkpoint: { title: 'Baseline and targets', pass_rule: 'Two fix targets chosen.', if_not: 'Do not start week 2 drills.', text: null },
  },
];
const planMeta = { who_for: 'Students with a test date about four weeks away.', rules: ['Log every miss.'], resources: [{ label: 'SAT Practice Bank', url: 'https://practice.sat.schood.online/bank' }], error_codes: [{ code: 'C', meaning: 'Content' }], weekly_hours: { min: 8.6, max: 13.3, total: 47.4 }, simulator_cta: 'https://sat.schood.online/?source=playbook', practice_cta: null, phases: [{ label: 'Diagnose', weeks: [1], goal: 'Baseline mock' }], modules: [], guides: [] };

const diagnosticSnapshot = {
  id: 'ssssssss-0000-4000-8000-000000000001',
  metadata: {},
  recommendation_json: {
    version: 'sat-playbook-diagnostic-v2', exam: 'sat', generated_at: '2026-10-24T09:00:00.000Z',
    current: { total: 1200, total_source: 'simulator', sections: [{ section: 'reading_writing', current: 620, target: 700, gap: 80, current_source: 'simulator' }, { section: 'math', current: 580, target: 700, gap: 120, current_source: 'simulator' }] },
    target: { total: 1400, split: 'even_split' }, gap: { total: 200 },
    bottlenecks: [{ key: 'domain:algebra', kind: 'domain', section: 'math', domain: 'algebra', module_slugs: ['math-algebra'], current: 45, target: 83, gap: 38, estimated_impact: 80, impact_unit: 'sat_points', impact_basis: 'domain_accuracy_gap', severity: 'high', evidence: [{ source: 'practice', metric: 'accuracy_pct', value: 45, detail: { attempts: 20 } }] }],
    untested: [{ section: 'reading_writing', domain: 'expression_of_ideas', module_slugs: ['reading-writing-expression-of-ideas'], reason: 'too_few_practice_attempts' }],
    module_priorities: [{ slug: 'math-algebra', rank: 1, kind: 'module', reason: 'domain_gap', params: { section: 'math', domain: 'algebra', points: 80 } }],
    plan_suggestion: { template_slug: 'four-week-sprint', template_title: 'Four-Week Sprint', template_published: true, reason: 'short_runway', weeks_until_test: 3, days_until_test: 24, weeks: [{ week: 1, starts_on: '2026-10-24', ends_on: '2026-10-30', modules: ['math-algebra'], template_week_label: 'Week 1' }] },
    data_quality: { simulator_sessions: 1, practice_attempts: 42, confidence: 'high' },
  },
};

const seedSession = async (page: Page, userId: string) => {
  const session = {
    access_token: `route.${Buffer.from(JSON.stringify({ sub: userId })).toString('base64url')}.fixture`,
    token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'route-refresh',
    user: { id: userId, aud: 'authenticated', role: 'authenticated', email: `${userId}@example.test`, app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00.000Z' },
  };
  await page.context().addCookies([{ name: 'schood-auth', value: encodeURIComponent(JSON.stringify(session)), domain: '127.0.0.1', path: '/', sameSite: 'Lax' }]);
};

type Calls = { method: string; path: string; body: unknown; auth: string | null; region: string | null }[];

const mock = async (page: Page, persona: Persona, overrides: Partial<Record<string, (route: Route) => Promise<void> | void>> = {}) => {
  const calls: Calls = [];
  const userId = persona === 'admin' ? 'admin-user' : `${persona}-user`;
  if (persona !== 'anonymous') await seedSession(page, userId);
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort());
  await page.route('http://127.0.0.1:54321/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.replace('/functions/v1', '');
    let body: unknown = null;
    try { body = req.postDataJSON(); } catch { body = null; }
    // Function calls are pinned next to the database; record that separately so paths stay comparable.
    const region = url.searchParams.get('forceFunctionRegion');
    url.searchParams.delete('forceFunctionRegion');
    calls.push({ method: req.method(), path: `${path}${url.search}`, body, auth: req.headers().authorization ?? null, region });
    const json = (data: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
    const key = `${req.method()} ${path}`;
    if (overrides[key]) return overrides[key]!(route);
    if (path.startsWith('/auth/v1/')) return json({ id: userId, aud: 'authenticated', email: `${userId}@example.test` });
    if (path === '/me') return json({ user: { id: userId, email: null, role: persona === 'admin' ? 'admin' : 'user' }, entitlements: [], admin: persona === 'admin' ? { is_admin: true, permissions: ['admin.*'] } : null });
    if (path === '/access-effective') return json({ effective_product_ids: persona === 'premium' || persona === 'admin' ? [PLAYBOOK] : [] });
    if (path === '/sat-playbook/catalog') return json(catalog);
    if (path === '/sat-playbook/events') return json({ ok: true, accepted: true });
    if (path === '/sat-playbook/pages/math-algebra') return json(pagePayload);
    if (path === '/sat-playbook/pages/math-algebra/me') return json({ completed_section_ids: [], module_item: null, plan_tasks: [], notes: [] });
    if (path === '/sat-playbook/pages/guide-math-hard-module-traps') {
      return persona === 'premium' ? json({ ...pagePayload, page: guide, child_pages: [], parent_page: { slug: 'math-algebra', title: 'Math: Algebra' } })
        : json({ error: 'x', code: persona === 'anonymous' ? 'auth_required' : 'premium_required', teaser: { title: guide.title, summary: 'Advanced traps.' } }, persona === 'anonymous' ? 401 : 403);
    }
    if (path === '/sat-playbook/diagnostic') return json({ profile: { user_id: userId }, snapshot: null });
    if (path === '/sat-playbook/diagnostic/run') return json({ ok: true, snapshot: diagnosticSnapshot });
    if (path === '/sat-playbook/plans/four-week-sprint') return json({ plan: planTemplate, weeks: planWeeks, meta: planMeta, schedule_preview: { test_date: '2026-11-21' }, adopted: null });
    if (path === '/sat-playbook/plans/four-week-sprint/adopt') {
      return json({
        plan: { id: 'pppppppp-0000-4000-8000-000000000001', template_slug: 'four-week-sprint', start_date: '2026-10-27', test_date: '2026-11-21', metadata: { template_title: 'Four-Week Sprint' }, schedule: { compressed: true, buffer_weeks: 0, weeks: [{ calendar_week: 1, label: 'Week 1', starts_on: '2026-10-27', ends_on: '2026-11-02', hours: 12.5 }] } },
        plan_items: [
          { id: 'iiiiiiii-0000-4000-8000-000000000001', user_plan_id: 'p', kind: 'task', page_slug: 'math-algebra', title: 'Read Math: Algebra (/math-algebra), 25 min', week_number: 1, due_date: '2026-10-29', status: 'todo', done_at: null, sort_order: 0, metadata: { day: 3 } },
          { id: 'iiiiiiii-0000-4000-8000-000000000002', user_plan_id: 'p', kind: 'task', page_slug: null, title: 'Baseline and targets', week_number: 1, due_date: '2026-11-02', status: 'todo', done_at: null, sort_order: 1, metadata: { checkpoint: true, pass_rule: 'Two fix targets chosen.', if_not: 'Do not start week 2 drills.' } },
        ],
        module_items: [], progress: { total: 2, done: 0, modules_total: 0, modules_done: 0 },
      });
    }
    if (path.startsWith('/sat-playbook/my-plan/items/') && req.method() === 'PATCH') {
      return json({ item: { id: path.split('/').pop(), user_plan_id: 'p', kind: 'task', page_slug: 'math-algebra', title: 'Read Math: Algebra (/math-algebra), 25 min', week_number: 1, due_date: '2026-10-29', status: 'done', done_at: '2026-10-27T10:00:00Z', sort_order: 0, metadata: { day: 3 } } });
    }
    if (path === '/sat-playbook/my-plan/items') return json({ created: true, item: { id: 'mmmmmmmm-0000-4000-8000-000000000001', kind: 'module', page_slug: 'math-algebra', title: 'Math: Algebra', status: 'todo', user_plan_id: null, week_number: null, due_date: null, done_at: null, sort_order: 0, metadata: {} } });
    if (path === '/sat-playbook/dashboard') {
      return json({ profile: { user_id: userId, target_total_score: 1400, current_score_or_estimate: 1200, deadline_date: '2026-11-21' }, diagnostic: diagnosticSnapshot, plan: null, plan_items: [], module_items: [{ id: 'mmmmmmmm-0000-4000-8000-000000000001', kind: 'module', page_slug: 'math-algebra', title: 'Math: Algebra', status: 'todo', user_plan_id: null, week_number: null, due_date: null, done_at: null, sort_order: 0, metadata: {} }], progress: { total: 0, done: 0, modules_total: 1, modules_done: 0 }, plans: [], sections_completed_by_page: { [page1.id]: 2 }, notes_count: 3 });
    }
    if (path === '/admin-exam-playbook/qa') {
      return json({ modules: [{ slug: 'sat-essentials', status: 'published', id: essentials.id }, { slug: 'math-algebra', status: 'missing', id: null }], guides: [], plan_templates: [{ slug: 'four-week-sprint', status: 'published', weeks: 4 }], pages_missing_citations: [], pages_missing_seo: [], published_pages_without_sections: [], unexpected_slugs: [] });
    }
    return json({ error: 'unmocked', path }, 404);
  });
  return calls;
};

const noHorizontalOverflow = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

test('landing: section cards link to real modules, public modules are listed, pricing CTA targets sat-playbook', async ({ page }) => {
  const calls = await mock(page, 'anonymous');
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'SAT Playbook', level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: /Reading and Writing/ }).first()).toHaveAttribute('href', '/reading-writing-information-ideas');
  await expect(page.getByRole('link', { name: /^Math R&W|Math: Algebra/ }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'How it works' }).or(page.getByText('How it works'))).toBeVisible();
  const pricing = page.getByRole('link', { name: 'See pricing' }).first();
  await expect(pricing).toHaveAttribute('href', /\/pricing\?.*product=sat-playbook/);
  // Schood home, account/sign-in and language in the nav.
  await expect(page.getByRole('link', { name: 'Schood home' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Language' })).toBeVisible();
  expect(calls.some((c) => c.path === '/sat-playbook/events' && (c.body as { event_name?: string })?.event_name === 'page_view')).toBe(true);
  for (const width of [375, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await noHorizontalOverflow(page);
  }
});

test('modules: grouped by module_group, premium guides marked', async ({ page }) => {
  await mock(page, 'anonymous');
  await page.goto('/modules');
  await expect(page.getByRole('heading', { name: 'Start here' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Math', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /Hard Module Traps: Math/ })).toContainText('Premium');
  await page.setViewportSize({ width: 375, height: 900 });
  await noHorizontalOverflow(page);
});

test('public module is readable without sign-in; GFM tables scroll inside their wrapper at 320px', async ({ page }) => {
  const calls = await mock(page, 'anonymous');
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('/math-algebra');
  await expect(page.getByRole('heading', { name: 'Math: Algebra', level: 1 })).toBeVisible();
  await expect(page.getByText('Module 7')).toBeVisible();
  await expect(page.locator('.table-scroll table')).toHaveCount(1);
  await expect(page.locator('.prose-markdown').getByRole('cell', { name: 'Systems of linear equations' })).toBeVisible();
  await expect(page.getByText('Know slope-intercept form')).toBeVisible();
  await expect(page.getByText('Is Desmos allowed?')).toBeVisible();
  await expect(page.getByRole('link', { name: 'College Board: SAT Math' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Track this module with Premium' })).toBeVisible();
  // Practice link is honest about access.
  await expect(page.getByText(/Requires SAT Practice \(also included in SAT Complete\)/)).toBeVisible();
  await noHorizontalOverflow(page);
  await page.setViewportSize({ width: 375, height: 900 });
  await noHorizontalOverflow(page);
  const pageCall = calls.find((c) => c.path === '/sat-playbook/pages/math-algebra');
  expect(pageCall?.auth).toBe('Bearer sat-playbook-route-anon-key');
  // Pinned to the database region (Singapore) so queries don't cross from the nearest edge.
  expect(pageCall?.region).toBe('ap-southeast-1');
});

test('premium guide shows a teaser and an upgrade path, never a raw error', async ({ page }) => {
  await mock(page, 'free');
  await page.goto('/guide-math-hard-module-traps');
  await expect(page.getByRole('heading', { name: 'Hard Module Traps: Math', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'This guide is part of Premium' })).toBeVisible();
  await expect(page.getByRole('link', { name: /See Premium plans/ })).toHaveAttribute('href', /product=sat-playbook/);
  await expect(page.getByText('premium_required')).toHaveCount(0);
});

test('signed-in non-premium learner gets an upgrade card on premium routes', async ({ page }) => {
  await mock(page, 'free');
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'SAT Playbook Premium' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
});

test('diagnostic: viewing never generates; Run diagnostic posts once and renders ranked bottlenecks', async ({ page }) => {
  const calls = await mock(page, 'premium');
  await page.goto('/diagnostic');
  await expect(page.getByRole('heading', { name: 'No diagnostic yet' })).toBeVisible();
  expect(calls.filter((c) => c.path === '/sat-playbook/diagnostic/run')).toHaveLength(0);
  await page.getByRole('button', { name: 'Run diagnostic' }).first().click();
  await expect(page.getByRole('heading', { name: 'Ranked bottlenecks' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Algebra', exact: true })).toBeVisible();
  await expect(page.getByText('≈ +80 points').first()).toBeVisible();
  await expect(page.getByText(/fewer than 5 practice answers/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open this plan' })).toHaveAttribute('href', '/plans/four-week-sprint');
  await expect(page.getByText(/Written by AI \(free model\)/)).toBeVisible();
  expect(calls.filter((c) => c.path === '/sat-playbook/diagnostic/run')).toHaveLength(1);
  await page.setViewportSize({ width: 375, height: 900 });
  await noHorizontalOverflow(page);
});

test('plans: template renders days, links, hours and checkpoints; adopting tracks tasks', async ({ page }) => {
  const calls = await mock(page, 'premium');
  await page.goto('/plans/four-week-sprint');
  await expect(page.getByRole('heading', { name: 'Four-Week Sprint', level: 1 })).toBeVisible();
  await expect(page.getByText('8.6–13.3 h a week')).toBeVisible();
  await expect(page.getByText('Day 3 · Wed · 105 min')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Math: Algebra' }).first()).toHaveAttribute('href', '/math-algebra');
  await expect(page.locator('.day-block a.task-link[href="https://sat.schood.online"]')).toBeVisible();
  await expect(page.getByText('Two fix targets chosen.')).toBeVisible();
  await page.getByRole('button', { name: 'Adopt this plan' }).click();
  await expect(page.getByRole('heading', { name: 'Your checklist' })).toBeVisible();
  const adopt = calls.find((c) => c.path === '/sat-playbook/plans/four-week-sprint/adopt');
  expect((adopt?.body as { test_date?: string })?.test_date).toBe('2026-11-21');
  await page.getByRole('button', { name: 'Mark done' }).first().click();
  await expect(page.getByText('1 of 2 tasks done')).toBeVisible();
  await page.setViewportSize({ width: 375, height: 900 });
  await noHorizontalOverflow(page);
});

test('module page: Add to my plan persists via the API for premium learners', async ({ page }) => {
  const calls = await mock(page, 'premium');
  await page.goto('/math-algebra');
  await page.getByRole('button', { name: 'Add to my plan' }).click();
  await expect(page.getByRole('button', { name: /In your plan/ })).toBeVisible();
  expect(calls.find((c) => c.path === '/sat-playbook/my-plan/items')?.body).toEqual({ page_slug: 'math-algebra' });
  await expect(page.getByRole('button', { name: 'Mark as read' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ask the coach' }).first()).toBeVisible();
});

test('dashboard: goal, focus, my modules and reading progress at phone width', async ({ page }) => {
  await mock(page, 'premium');
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Your SAT plan' })).toBeVisible();
  await expect(page.getByText('200 points to go')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Modules in my plan' })).toBeVisible();
  await expect(page.getByText('2 sections read')).toBeVisible();
  await noHorizontalOverflow(page);
});

test('admin: non-admins see a clear message; admins get the authoring console', async ({ page }) => {
  await mock(page, 'premium');
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'No admin access' })).toBeVisible();
  await page.context().clearCookies();
  const calls = await mock(page, 'admin');
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'SAT Playbook authoring' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Public modules' })).toBeVisible();
  expect(calls.some((c) => c.path === '/admin-exam-playbook/qa?exam=sat')).toBe(true);
  await page.setViewportSize({ width: 375, height: 900 });
  await noHorizontalOverflow(page);
});

test('i18n: ?lang=uz and ?lang=ru translate the chrome; content stays English', async ({ page }) => {
  await mock(page, 'anonymous');
  await page.goto('/math-algebra?lang=uz');
  await expect(page.getByRole('link', { name: 'Schood bosh sahifasi' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Math: Algebra', level: 1 })).toBeVisible();
  await page.goto('/?lang=ru');
  await expect(page.getByRole('link', { name: 'Главная Schood' })).toBeVisible();
  await expect(page.getByText('Как это работает')).toBeVisible();
});
