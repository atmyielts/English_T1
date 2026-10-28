import { expect, test, type Page, type Route } from '@playwright/test';

// Route smoke tests for the TOEFL Playbook with a fully mocked network.
// Every Supabase / edge call is answered here; anything external is aborted.

const PLAYBOOK = 'f9512c15-ec1c-4fcb-a5ec-a2c6ac3a020e';
const SIMULATOR = 'b262ffa8-9912-4eba-93d7-58af3164d1cc';

type Persona = 'anonymous' | 'free' | 'premium' | 'admin';

const essentials = {
  id: 'aaaaaaaa-0000-4000-8000-000000000001', slug: 'toefl-essentials', title: 'TOEFL Essentials: the 2026 iBT', summary: 'Format, timing and the 1–6 scale.',
  page_type: 'module', visibility: 'public', module_key: 'toefl-essentials', parent_page_id: null, sort_order: 1,
  metadata: { module_group: 'format_overview', hero_kicker: 'Start here', reading_minutes: 22 },
};
const ctw = { ...essentials, id: 'aaaaaaaa-0000-4000-8000-000000000002', slug: 'reading-complete-the-words', title: 'Reading: Complete the Words', sort_order: 3, metadata: { module_group: 'skill_reading', hero_kicker: 'Reading', reading_minutes: 26 } };
const listening = { ...essentials, id: 'aaaaaaaa-0000-4000-8000-000000000003', slug: 'listening-strategy', title: 'Listening Strategy', sort_order: 5, metadata: { module_group: 'skill_listening' } };
const writing = { ...essentials, id: 'aaaaaaaa-0000-4000-8000-000000000004', slug: 'writing-email', title: 'Writing: Write an Email', sort_order: 7, metadata: { module_group: 'skill_writing' } };
const speaking = { ...essentials, id: 'aaaaaaaa-0000-4000-8000-000000000005', slug: 'speaking-take-an-interview', title: 'Speaking: Take an Interview', sort_order: 10, metadata: { module_group: 'skill_speaking' } };
const guide = { ...essentials, id: 'aaaaaaaa-0000-4000-8000-000000000009', slug: 'guide-band-4-to-5-roadmap', title: 'Band 4 to 5 Roadmap', visibility: 'premium', page_type: 'guide', module_key: 'score-goals-and-study-plans', metadata: {} };

const bandTable = '| Band | CEFR | Comparable 0–120 total | Reading 0–30 | Listening 0–30 | Writing 0–30 |\n|---|---|---|---|---|---|\n| 4 | B2 | 72+ | 18–21 | 17–19 | 17–20 |\n| 4.5 | B2 | 86+ | 22–23 | 20–21 | 21–23 |\n| 5 | C1 | 95+ | 24–26 | 22–25 | 24–26 |';

const catalog = {
  product_slug: 'toefl-playbook', exam: 'toefl',
  modules: [essentials, ctw, listening, writing, speaking],
  premium_guides: [guide],
  plan_templates: [{ id: 'tttttttt-0000-4000-8000-000000000001', slug: 'four-week-sprint', title: 'Four-Week Sprint', summary: 'Four weeks to the test.', plan_type: 'crash', duration_days: 28, focus_section: 'all', intensity: 'high' }],
};

const ctwPage = {
  page: ctw,
  sections: [
    { id: '11111111-0000-4000-8000-000000000001', block_type: 'rich_text', heading: 'How the scale maps', sort_order: 1, content: { markdown: bandTable }, metadata: {} },
    { id: '11111111-0000-4000-8000-000000000002', block_type: 'checklist', heading: 'Before you start', sort_order: 2, content: { items: ['Read the whole paragraph first', 'Check word form'] }, metadata: {} },
    { id: '11111111-0000-4000-8000-000000000003', block_type: 'callout', heading: 'Trap', sort_order: 3, content: { label: 'Spelling counts', body: 'A **misspelled** word scores zero.' }, metadata: {} },
    { id: '11111111-0000-4000-8000-000000000004', block_type: 'faq', heading: 'Questions', sort_order: 4, content: { items: [{ question: 'How many blanks?', answer: 'About ten per paragraph.' }] }, metadata: {} },
    { id: '11111111-0000-4000-8000-000000000005', block_type: 'timeline', heading: 'Two weeks out', sort_order: 5, content: { items: [{ label: 'Day 14', value: 'Full mock 1' }, { label: 'Day 13', value: 'Review mock 1' }] }, metadata: {} },
    { id: '11111111-0000-4000-8000-000000000006', block_type: 'cta_strip', heading: 'Next step', sort_order: 6, content: { label: 'Practise the task', primary_text: 'Open your dashboard', primary_url: '/dashboard', secondary_text: 'Take a full mock', secondary_url: 'https://toefl.schood.online/full-exam' }, metadata: {} },
  ],
  child_pages: [],
  sources: [{ sort_order: 1, citation_note: null, is_primary: true, source: { title: 'ETS: TOEFL iBT score scale', url: 'https://www.ets.org/toefl/test-takers/ibt/scores.html' } }],
  parent_page: null,
};

const planTemplate = {
  id: 'tttttttt-0000-4000-8000-000000000001', slug: 'four-week-sprint', title: 'Four-Week Sprint', summary: 'Four weeks to the test.', duration_days: 28,
  plan_type: 'crash', focus_section: 'all', intensity: 'high', score_min: 72, score_max: 113,
  metadata: { band_entry_min: 4, band_entry_max: 5, band_target_min: 4.5, band_target_max: 5.5, cefr_entry: 'B2–C1', cefr_target: 'B2–C1', focus_sections: ['reading', 'listening', 'writing', 'speaking'], full_mocks: 2, recommended_for: 'A test date about four weeks away.' },
  schedule_json: {},
};
const planWeeks = [{
  index: 0, label: 'Week 1 · Baseline and triage', phase: 'Diagnose', focus: ['Full mock baseline'], hours: 12, modules: ['reading-complete-the-words'], days: [],
  tasks: [
    { title: 'Day 1: full mock in the TOEFL simulator at your test time of day.', page_slug: null, url: null, minutes: null, day: 1, weekday: null },
    { title: 'Task-type sets', page_slug: null, url: 'https://toefl.schood.online/practice', minutes: null, day: null, weekday: null },
  ],
  checkpoint: { title: 'Full mock 1 bands recorded', pass_rule: 'Two priority categories chosen', if_not: null, text: null, measure: 'Baseline section bands recorded', target_band: 'Entry 4–5 overall' },
}];
const planMeta = { who_for: null, rules: [], resources: [], error_codes: [], weekly_hours: { min: 10, max: 14, total: null }, simulator_cta: 'https://toefl.schood.online/full-exam?source=playbook', practice_cta: 'https://toefl.schood.online/practice?source=playbook', phases: [], modules: [], guides: [], daily_routine: ['20 minutes: one Complete the Words paragraph'], decision_rules: ['Never schedule a full mock in the last three days before the test.'] };

const diagnosticSnapshot = {
  id: 'ssssssss-0000-4000-8000-000000000001',
  metadata: {},
  recommendation_json: {
    version: 'toefl-playbook-diagnostic-v2', exam: 'toefl', generated_at: '2026-10-27T09:00:00.000Z', score_scale: 'toefl_band_2026',
    current: {
      overall: 4, overall_source: 'sections', overall_partial: false, overall_cefr: 'B2', overall_legacy_range: { min: 72, max: 85 },
      sections: [
        { section: 'reading', current: 4, current_cefr: 'B2', current_legacy_range: { min: 18, max: 21 }, current_source: 'simulator', target: 5, target_cefr: 'C1', gap: 1 },
        { section: 'listening', current: 4.5, current_cefr: 'B2', current_legacy_range: { min: 20, max: 21 }, current_source: 'simulator', target: 5, target_cefr: 'C1', gap: 0.5 },
        { section: 'writing', current: 3.5, current_cefr: 'B1', current_legacy_range: { min: 15, max: 16 }, current_source: 'simulator', target: 5, target_cefr: 'C1', gap: 1.5 },
        { section: 'speaking', current: 4, current_cefr: 'B2', current_legacy_range: { min: 20, max: 22 }, current_source: 'profile', target: 5, target_cefr: 'C1', gap: 1 },
      ],
    },
    target: { overall: 5, overall_cefr: 'C1', overall_legacy_range: { min: 95, max: 106 }, sections: {} },
    gap: { overall: 1 },
    bottlenecks: [{
      key: 'section:writing', kind: 'section', section: 'writing', domain: null, module_slugs: ['writing-build-a-sentence', 'writing-email', 'writing-academic-discussion'], practice_tasks: ['build_sentence', 'write_email'],
      current: 3.5, target: 5, gap: 1.5, estimated_impact: 0.5, impact_unit: 'overall_band', impact_basis: 'overall_band_projection', severity: 'high',
      evidence: [
        { source: 'simulator', metric: 'section_band', value: 3.5, detail: { cefr: 'B1', legacy_range: { min: 15, max: 16 } } },
        { source: 'simulator', metric: 'task_accuracy_pct', value: 40, detail: { task: 'build_sentence', items: 10 } },
      ],
    }],
    untested: [],
    module_priorities: [{ slug: 'writing-email', rank: 1, kind: 'module', reason: 'section_gap_band', params: { section: 'writing', gap: 1.5 } }],
    plan_suggestion: { template_slug: 'four-week-sprint', template_title: 'Four-Week Sprint', template_published: true, reason: 'short_runway', weeks_until_test: 3, days_until_test: 24, weeks: [] },
    data_quality: { simulator_sessions: 1, sections_measured: 4, legacy_inputs: false, confidence: 'high' },
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

type Calls = { method: string; path: string; body: unknown; region: string | null }[];

const mock = async (page: Page, persona: Persona, options: { simulator?: boolean } = {}) => {
  const calls: Calls = [];
  const userId = persona === 'admin' ? 'admin-user' : `${persona}-user`;
  if (persona !== 'anonymous') await seedSession(page, userId);
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort());
  await page.route('http://127.0.0.1:54321/**', async (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.replace('/functions/v1', '');
    const region = url.searchParams.get('forceFunctionRegion');
    url.searchParams.delete('forceFunctionRegion');
    let body: unknown = null;
    try { body = req.postDataJSON(); } catch { body = null; }
    calls.push({ method: req.method(), path: `${path}${url.search}`, body, region });
    const json = (data: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
    if (path.startsWith('/auth/v1/')) return json({ id: userId, aud: 'authenticated', email: `${userId}@example.test` });
    if (path === '/me') return json({ user: { id: userId, email: null, role: persona === 'admin' ? 'admin' : 'user' }, entitlements: [], admin: persona === 'admin' ? { is_admin: true, permissions: ['admin.*'] } : null });
    if (path === '/access-effective') {
      const ids = persona === 'premium' || persona === 'admin' ? [PLAYBOOK] : [];
      return json({ effective_product_ids: options.simulator ? [...ids, SIMULATOR] : ids });
    }
    if (path === '/toefl-playbook/catalog') return json(catalog);
    if (path === '/toefl-playbook/events') return json({ ok: true, accepted: true });
    if (path === '/toefl-playbook/pages/reading-complete-the-words') return json(ctwPage);
    if (path === '/toefl-playbook/pages/reading-complete-the-words/me') return json({ completed_section_ids: [], module_item: null, plan_tasks: [], notes: [] });
    if (path === '/toefl-playbook/pages/guide-band-4-to-5-roadmap') {
      return json({ error: 'x', code: persona === 'anonymous' ? 'auth_required' : 'premium_required', teaser: { title: guide.title, summary: 'From band 4 to 5.' } }, persona === 'anonymous' ? 401 : 403);
    }
    if (path === '/toefl-playbook/profile' && req.method() === 'GET') return json({ profile: { user_id: userId, score_scale: 'band_2026', target_band: 5, current_band: 4 } });
    if (path === '/toefl-playbook/profile' && req.method() === 'PATCH') return json({ ok: true, profile: { user_id: userId }, snapshot: null, diagnostic_rerun: true });
    if (path === '/toefl-playbook/diagnostic') return json({ profile: { user_id: userId }, snapshot: null });
    if (path === '/toefl-playbook/diagnostic/run') return json({ ok: true, snapshot: diagnosticSnapshot });
    if (path === '/toefl-playbook/plans/four-week-sprint') return json({ plan: planTemplate, weeks: planWeeks, meta: planMeta, schedule_preview: { test_date: null }, adopted: null });
    if (path === '/toefl-playbook/dashboard') {
      return json({ profile: { user_id: userId, score_scale: 'band_2026', target_band: 5, current_band: 4, target_total_score: 95, deadline_date: '2026-11-21' }, diagnostic: diagnosticSnapshot, plan: null, plan_items: [], module_items: [], progress: { total: 0, done: 0, modules_total: 0, modules_done: 0 }, plans: [], sections_completed_by_page: {}, notes_count: 0 });
    }
    if (path === '/admin-exam-playbook/qa') {
      return json({ modules: [{ slug: 'toefl-essentials', status: 'published', id: essentials.id }], guides: [], plan_templates: [{ slug: 'four-week-sprint', status: 'published', weeks: 4 }], pages_missing_citations: [], pages_missing_seo: [], published_pages_without_sections: [], unexpected_slugs: [] });
    }
    return json({ error: 'unmocked', path }, 404);
  });
  return calls;
};

const noHorizontalOverflow = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

test('landing: TOEFL copy, section cards for all four skills, pricing CTA targets toefl-playbook', async ({ page }) => {
  await mock(page, 'anonymous');
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'TOEFL Playbook', level: 1 })).toBeVisible();
  await expect(page.getByText(/1–6 band scale/)).toBeVisible();
  await expect(page.getByText(/SAT/)).toHaveCount(0);
  for (const [name, href] of [['Reading', '/reading-complete-the-words'], ['Listening', '/listening-strategy'], ['Writing', '/writing-email'], ['Speaking', '/speaking-take-an-interview']]) {
    await expect(page.locator(`a.link-card[href="${href}"]`).filter({ hasText: name }).first()).toBeVisible();
  }
  await expect(page.getByRole('link', { name: 'See pricing' }).first()).toHaveAttribute('href', /product=toefl-playbook/);
  await expect(page.getByRole('link', { name: 'TOEFL simulator' })).toHaveAttribute('href', 'https://toefl.schood.online');
  await expect(page.getByRole('link', { name: 'SAT Practice' })).toHaveCount(0);
  for (const width of [375, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await noHorizontalOverflow(page);
  }
});

test('module page: every section kind renders, tables scroll, practice deep-links to the simulator task', async ({ page }) => {
  const calls = await mock(page, 'anonymous');
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('/reading-complete-the-words');
  await expect(page.getByRole('heading', { name: 'Reading: Complete the Words', level: 1 })).toBeVisible();
  await expect(page.locator('.table-scroll table')).toHaveCount(1);
  await expect(page.getByText('Check word form')).toBeVisible();
  await expect(page.getByText('Spelling counts')).toBeVisible();
  await expect(page.getByText('How many blanks?')).toBeVisible();
  await expect(page.getByText('Full mock 1')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open your dashboard' })).toHaveAttribute('href', '/dashboard');
  const practice = page.getByRole('link', { name: /Practise Complete the Words in the TOEFL simulator/ });
  await expect(practice).toHaveAttribute('href', 'https://toefl.schood.online/practice?source=playbook&task=complete_the_words');
  await expect(page.getByText(/Requires TOEFL iBT Simulator \(also included in TOEFL Complete\)/)).toBeVisible();
  await noHorizontalOverflow(page);
  expect(calls.find((c) => c.path === '/toefl-playbook/pages/reading-complete-the-words')?.region).toBe('ap-southeast-1');
});

test('modules page groups by skill and marks premium guides', async ({ page }) => {
  await mock(page, 'anonymous');
  await page.goto('/modules');
  await expect(page.getByRole('heading', { name: 'Start here' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Speaking', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /Band 4 to 5 Roadmap/ })).toContainText('Premium');
  await page.setViewportSize({ width: 375, height: 900 });
  await noHorizontalOverflow(page);
});

test('premium guide shows a teaser and upgrade path for a signed-in non-premium learner', async ({ page }) => {
  await mock(page, 'free', { simulator: true });
  await page.goto('/guide-band-4-to-5-roadmap');
  await expect(page.getByRole('heading', { name: 'Band 4 to 5 Roadmap', level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: /See Premium plans/ })).toHaveAttribute('href', /product=toefl-playbook/);
});

test('onboarding: 2026 bands with CEFR and 0–120 comparison; legacy scale converts', async ({ page }) => {
  const calls = await mock(page, 'premium');
  await page.goto('/onboarding');
  const target = page.locator('#target-band');
  await expect(target).toHaveValue('5');
  await expect(target.locator('option[value="4.5"]')).toHaveText('4.5 · B2 · 86–94');
  await page.getByLabel('Old 0–120 total (before 2026)').check();
  await page.getByLabel('Target total (0–120)').fill('100');
  await expect(page.getByText('On the 2026 scale: 5.0 · C1 · 95–106')).toBeVisible();
  await page.getByRole('button', { name: 'Save and run the diagnostic' }).click();
  await expect(page).toHaveURL(/\/diagnostic$/);
  const saved = calls.find((c) => c.path === '/toefl-playbook/profile' && c.method === 'PATCH')?.body as Record<string, unknown>;
  expect(saved.score_scale).toBe('legacy_120');
  expect(saved.target_total_score).toBe(100);
});

test('diagnostic: band KPIs with CEFR and legacy comparison; task evidence and practice deep link', async ({ page }) => {
  const calls = await mock(page, 'premium', { simulator: true });
  await page.goto('/diagnostic');
  await expect(page.getByRole('heading', { name: 'No diagnostic yet' })).toBeVisible();
  expect(calls.filter((c) => c.path === '/toefl-playbook/diagnostic/run')).toHaveLength(0);
  await page.getByRole('button', { name: 'Run diagnostic' }).first().click();
  await expect(page.getByText('4.0 · B2').first()).toBeVisible();
  await expect(page.getByText('Comparable 0–120 total: 72–85')).toBeVisible();
  await expect(page.getByText('5.0 · C1').first()).toBeVisible();
  await expect(page.getByText('≈ +0.5 overall')).toBeVisible();
  await expect(page.getByText('Build a Sentence: 40% of points (10 items)')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Practise Build a Sentence in the TOEFL simulator' })).toHaveAttribute('href', 'https://toefl.schood.online/practice?source=playbook&task=build_sentence');
  await expect(page.getByText(/Included in your access \(TOEFL iBT Simulator\)/)).toBeVisible();
  await page.setViewportSize({ width: 375, height: 900 });
  await noHorizontalOverflow(page);
});

test('plan: band window, weekly hours, phase, simulator task link and band checkpoint render', async ({ page }) => {
  await mock(page, 'premium');
  await page.goto('/plans/four-week-sprint');
  await expect(page.getByRole('heading', { name: 'Four-Week Sprint', level: 1 })).toBeVisible();
  await expect(page.getByText('Start: band 4.0–5.0 B2–C1')).toBeVisible();
  await expect(page.getByText('Aim: band 4.5–5.5 B2–C1')).toBeVisible();
  await expect(page.getByText('10–14 h a week')).toBeVisible();
  await expect(page.getByText('Diagnose')).toBeVisible();
  await expect(page.locator('a.task-link[href="https://toefl.schood.online/practice"]')).toBeVisible();
  await expect(page.getByText('Entry 4–5 overall')).toBeVisible();
  await expect(page.getByText('Baseline section bands recorded')).toBeVisible();
  await expect(page.getByText('Never schedule a full mock in the last three days before the test.')).toBeVisible();
  await page.setViewportSize({ width: 320, height: 900 });
  await noHorizontalOverflow(page);
});

test('dashboard shows bands, not 0–120 totals', async ({ page }) => {
  await mock(page, 'premium');
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Your TOEFL plan' })).toBeVisible();
  await expect(page.getByText('Target band')).toBeVisible();
  await expect(page.getByText('1.0 band to go')).toBeVisible();
  await noHorizontalOverflow(page);
});

test('admin console uses exam=toefl', async ({ page }) => {
  const calls = await mock(page, 'admin');
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'TOEFL Playbook authoring' })).toBeVisible();
  expect(calls.some((c) => c.path === '/admin-exam-playbook/qa?exam=toefl')).toBe(true);
});

test('i18n: Uzbek and Russian chrome', async ({ page }) => {
  await mock(page, 'anonymous');
  await page.goto('/?lang=uz');
  await expect(page.getByRole('link', { name: 'Schood bosh sahifasi' })).toBeVisible();
  await page.goto('/reading-complete-the-words?lang=ru');
  await expect(page.getByRole('link', { name: 'Главная Schood' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Reading: Complete the Words', level: 1 })).toBeVisible();
});
