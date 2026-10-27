import { expect, test, type Page, type Route } from '@playwright/test';

// Mocked-network route tests for IELTS Practice. Every Supabase call is
// answered from fixtures, so the suite runs without a backend.

const PRACTICE_ID = 'a74195fd-b4f3-4fd4-93bf-c807e42250c6';
const SIMULATOR_ID = 'ead05eae-aa97-4bda-a07c-51e5dbb062c0';
const MOCK_ID = '0b5a3c1e-1111-4a1a-9a1a-000000000001';
const ITEM_ID = '0b5a3c1e-2222-4a1a-9a1a-000000000002';
const LAB_SESSION_ID = '0b5a3c1e-3333-4a1a-9a1a-000000000003';
const SIM_SESSION_ID = '0b5a3c1e-4444-4a1a-9a1a-000000000004';

const session = {
  access_token: 'ielts-practice-route-token',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: 'ielts-practice-route-refresh',
  user: {
    id: 'practice-user', aud: 'authenticated', role: 'authenticated', email: 'learner@example.test',
    app_metadata: {}, user_metadata: { first_name: 'Aziza' }, created_at: '2026-01-01T00:00:00.000Z',
  },
};

const goals = {
  user_id: 'practice-user', language_id: 'en', product_id: PRACTICE_ID, target_overall_band: 7, target_section_bands: {},
  target_date: '2026-12-20', practice_start_date: '2026-10-01', program_duration_days: 80, daily_practice_minutes: 45,
  timezone: 'Asia/Tashkent', focus_modes: ['reading'], metadata: { onboarded_at: '2026-10-01T00:00:00Z' }, updated_at: '2026-10-01T00:00:00Z',
};

const planItem = (id: string, section: string, focus = false) => ({
  id, plan_date: '2026-10-27', section_type: section, exercise_id: null, blueprint_id: `bp-${id}`, delivery_build_id: `build-${id}`,
  practice_session_id: null, status: 'planned', priority: 1, rationale: null,
  rationale_json: { section_gap: 0.5, question_weakness: 0.4, average_mastery: 0.3 },
  metadata: { estimated_minutes: 20, question_types: ['question_true_false_not_given'], ...(focus ? { focus: true } : {}) },
  attempt_id: null, exercise: null,
  blueprint: { id: `bp-${id}`, title: 'Blueprint', section_type: section, source_product_id: null, source_experience_id: null, source_section_id: null, target_question_types: ['question_true_false_not_given'], estimated_minutes: 20, status: 'published', experience_kind: 'repair_drill', metadata: {}, latest_delivery_build_id: null },
  delivery_build: { id: `build-${id}`, blueprint_id: `bp-${id}`, delivery_experience_id: 'x', status: 'published', experience_kind: 'repair_drill', build_version: 1, build_summary: { target_question_types: ['question_true_false_not_given'] }, validation_summary: {}, metadata: { lab_payload: { version: 'ielts.practice.lab.v1' } } },
  practice_session: null,
});

const diagnostics = {
  overall: { average_band: 6, target_band: 7, band_gap: 1 },
  sections: {
    reading: { samples: 3, accuracy_ratio: 0.62, average_band: 6, target_band: 7, band_gap: 1 },
    listening: { samples: 0, accuracy_ratio: null, average_band: null, target_band: 7, band_gap: null },
    writing: { samples: 0, accuracy_ratio: null, average_band: null, target_band: 7, band_gap: null },
  },
  question_types: [
    { section_type: 'reading', question_type: 'question_true_false_not_given', samples: 3, accuracy_ratio: 0.5, weakness_score: 0.6, mastery_level: 0.3 },
  ],
};

const reviewItem = {
  id: ITEM_ID, source_kind: 'generated_mock', section_type: 'reading', question_type: 'question_single_choice', title: 'Coastal cities',
  prompt_excerpt: 'Why did the town move its market?', leitner_box: 1, next_review_at: '2026-10-26T00:00:00Z', last_reviewed_at: null,
  last_result: null, review_count: 0, correct_count: 0, incorrect_count: 1, is_archived: false, created_at: '2026-10-25T00:00:00Z',
};

const labPayload = {
  version: 'ielts.practice.lab.v1', lab_kind: 'repair_drill', section_type: 'reading', title: 'TFNG repair',
  coach_template: { headline: 'Prove it with the text', body: 'Look for the exact sentence.', watch_for: ['word match'] },
  steps: [{
    id: 'step_1_question_single_choice', kind: 'evidence_locator', title: 'Main idea evidence locator', instructions: 'Find the sentence that proves the answer.',
    question_type: 'question_single_choice', prompt: 'Why did the town move its market?',
    options: [{ id: 'A', label: 'Flooding' }, { id: 'B', label: 'A new road' }], response_shape: { kind: 'single_choice' },
    context: { passage_title: 'The market town', passage_text: 'In 1890 a new road brought traders from the coast, so the market moved closer to it.' },
  }],
};

type Options = { emptyPlan?: boolean; simulatorAccess?: boolean };

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const mockBackend = async (page: Page, options: Options = {}) => {
  const calls: Array<{ method: string; path: string; body: unknown }> = [];
  await page.context().addCookies([{ name: 'schood-auth', value: encodeURIComponent(JSON.stringify(session)), domain: '127.0.0.1', path: '/', httpOnly: false, sameSite: 'Lax' }]);
  await page.route('**/auth/v1/**', (route) => json(route, session.user));
  await page.route('**/rest/v1/**', (route) => json(route, []));
  await page.route('**/functions/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^.*\/functions\/v1/, '');
    const method = request.method();
    let body: unknown = null;
    try { body = request.postDataJSON(); } catch { body = null; }
    calls.push({ method, path: `${path}${url.search}`, body });

    if (path === '/me') return json(route, { user: { id: 'practice-user', email: session.user.email }, entitlements: [{ id: 'e1', resource_type: 'product', resource_id: PRACTICE_ID, starts_at: null, ends_at: null, value: null }] });
    if (path === '/access-effective') return json(route, { effective_product_ids: options.simulatorAccess ? [PRACTICE_ID, SIMULATOR_ID] : [PRACTICE_ID] });
    if (path === '/ielts-srs') return json(route, method === 'GET'
      ? { items: [{ id: 'srs-1', section_type: 'reading', question_type: 'question_true_false_not_given', leitner_box: 2, next_review_at: '2026-10-26T00:00:00Z', last_accuracy_ratio: 0.5, rolling_accuracy_ratio: 0.5, review_count: 1, correct_count: 0, incorrect_count: 1, is_archived: false }], summary: { due: 1, mastered: 0, total: 1 } }
      : { ok: true, item: {} });
    if (path === '/ielts-practice/dashboard') return json(route, {
      scope: {}, goals, diagnostics_snapshot: { id: 'd1', computed_at: '2026-10-26T00:00:00Z', snapshot_version: 'v2', diagnostics, source_summary: {} },
      plan_date: '2026-10-27', items: options.emptyPlan ? [] : [planItem('p1', 'reading'), planItem('p2', 'listening')], notebook: [], roadmap: [], plan_stale: false,
    });
    if (path === '/ielts-practice/plans/generate') {
      const focus = (body as { focus_section?: string } | null)?.focus_section;
      if (options.emptyPlan) return json(route, { ok: true, plan_date: '2026-10-27', generated_count: 0, quotas: {}, items: [], empty_reason: 'no_published_content' });
      return json(route, { ok: true, plan_date: '2026-10-27', generated_count: 1, quotas: {}, items: [planItem('p3', focus ?? 'reading', Boolean(focus))], focus: focus ? { section: focus, question_type: null, matched: 'section' } : null });
    }
    if (path === '/ielts-practice/plans/today') return json(route, { plan_date: '2026-10-27', items: [planItem('p1', 'reading')] });
    if (path === '/ielts-practice/goals') return json(route, { scope: {}, goals });
    if (path === '/ielts-practice/reviews/items') return json(route, { ok: true, items: [reviewItem], summary: { due: 1, upcoming: 2, mastered: 0, total: 3, next_due_at: '2026-10-28T00:00:00Z' } });
    if (path === `/ielts-practice/reviews/items/${ITEM_ID}`) return json(route, {
      ok: true, item: reviewItem, source_kind: 'generated_mock', section_type: 'reading',
      passage: { title: 'Coastal cities', body: 'A new road brought traders, so the market moved.' },
      question: { prompt: 'Why did the town move its market?', type: 'multiple_choice', options: ['Flooding', 'A new road'] },
    });
    if (path === `/ielts-practice/reviews/items/${ITEM_ID}/answer`) return json(route, { ok: true, correct: true, correct_answer: 'A new road', explanation: '“a new road brought traders”', item: { ...reviewItem, leitner_box: 2, next_review_at: '2026-10-29T00:00:00Z' } });
    if (path === '/ielts-practice/context') return json(route, { ok: true, session: { id: SIM_SESSION_ID, experience_name: 'Academic Test 3', status: 'completed', taken_at: '2026-10-20T09:00:00Z', overall_band: 6, section_bands: { listening: 5.5, reading: 6.5 } } });
    if (path === '/ielts-practice/generator/mocks') return json(route, { ok: true, items: [] });
    if (path === '/ielts-practice/generator/mock-passage') return json(route, {
      ok: true, ai_available: true, mock_id: MOCK_ID, passage: { title: 'Coastal cities', body: 'A new road brought traders from the coast, so the market moved closer to it. '.repeat(4) },
      questions: [
        { prompt: 'Why did the market move?', type: 'multiple_choice', options: ['Flooding', 'A new road', 'A fire'] },
        { prompt: 'The road was built in winter.', type: 'true_false_not_given', options: ['True', 'False', 'Not Given'] },
        { prompt: 'Traders came from the ____.', type: 'gap_fill', options: [] },
      ],
      section_type: 'reading', question_style: 'multiple_choice', target_band: 7,
    });
    if (path === `/ielts-practice/generator/mocks/${MOCK_ID}/submit`) return json(route, {
      ok: true, mock_id: MOCK_ID, section_type: 'reading', question_style: 'multiple_choice', target_band: 7, passage: null, questions: [], status: 'submitted',
      created_at: '2026-10-27T00:00:00Z', submitted_at: '2026-10-27T00:05:00Z', answers: [1, 2, 'coast'],
      results: [
        { index: 0, correct: true, given: 'A new road', correct_answer: 'A new road', explanation: '“a new road brought traders”', type: 'multiple_choice' },
        { index: 1, correct: true, given: 'Not Given', correct_answer: 'Not Given', explanation: 'The season is not stated.', type: 'true_false_not_given' },
        { index: 2, correct: true, given: 'coast', correct_answer: 'coast', explanation: '“from the coast”', type: 'gap_fill' },
      ],
      raw_score: 3, max_score: 3, accuracy_ratio: 1, review_items_queued: 0,
    });
    if (path === '/ielts-practice/speaking/prompts') return json(route, { ok: true, part: url.searchParams.get('part') ?? 'part1', prompts: [{ id: 'p1-hometown', part: 'part1', topic: 'Your home town', questions: ['Where is your home town?'], cue_points: [], prep_seconds: 0, target_seconds: 240 }] });
    if (path === '/ielts-practice/speaking/attempts' && method === 'GET') return json(route, { ok: true, items: [] });
    if (path === '/ielts-practice/speaking/attempts') return json(route, {
      ok: true, message_code: null,
      attempt: { id: 'sa1', part: 'part1', prompt_id: 'p1-hometown', topic: 'Your home town', transcript: 'x', transcript_source: 'typed', duration_seconds: null, word_count: 20, words_per_minute: null, feedback_status: 'ready', feedback_lang: 'en',
        feedback: { assessment_scope: 'transcript_only', fluency_and_coherence: 'Ideas are linked clearly.', lexical_resource: 'Good topic words.', grammatical_range: 'Mostly simple sentences.', strengths: ['Clear answer'], improvements: ['Add a reason'], upgrades: [], part2_coverage: [] } },
    });
    if (path === `/ielts-practice/labs/${LAB_SESSION_ID}`) return json(route, { ok: true, practice_session: {}, blueprint: null, delivery_build: null, lab: labPayload, attempt: null, notebook: [], roadmap: [] });
    if (path.startsWith('/ielts-practice/insights/score-impact')) return json(route, { ok: true, areas: [{ question_type: 'question_true_false_not_given', section_type: 'reading', rolling_accuracy: 0.5, attempts: 4, error_frequency: 3 }], sample_size: 1 });
    if (path.startsWith('/ielts-practice/insights/plan-narrative')) return json(route, { ok: true, start_date: '2026-10-01', target_date: '2026-12-20', day_n: 27, total_days: 80, target_band: 7, weeks_remaining: 8, pace_label: 'unknown' });
    if (path.startsWith('/ielts-practice/insights/trajectory')) return json(route, { ok: true, series: [], predictor: {}, range: { from: '', to: '' } });
    if (path.startsWith('/ielts-practice/insights/activity')) return json(route, { ok: true, days: [], streak: { current_days: 2, longest_days: 5, last_practice_date: null }, totals: { last_7_days: 2, last_30_days: 4, all_time: 9 } });
    if (path.startsWith('/ielts-practice/insights/mastery-overview')) return json(route, { ok: true, by_status: {}, recent_graduations: [], trap_patterns: [], totals: { tracked: 0, mastered: 0, weak: 0 } });
    if (path.startsWith('/ielts-practice/insights/mistake-causes')) return json(route, { ok: true, total: 0, breakdown: [] });
    if (path.startsWith('/ielts-practice/insights/vocab-from-mistakes')) return json(route, { ok: true, items: [], total: 0 });
    if (path.startsWith('/ielts-practice/insights/coach-summary')) return json(route, { ok: true, ai_available: true, summary: 'Reading is improving.', insights: [], generated_at: '2026-10-27T00:00:00Z' });
    if (path.startsWith('/user-streak')) return json(route, { current_streak: 2, total_xp: 50, this_week_minutes: 30 });
    return json(route, {});
  });
  return calls;
};

const expectNoHorizontalOverflow = async (page: Page, label = '') => {
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    const widest = [...document.querySelectorAll<HTMLElement>('body *')]
      .filter((el) => el.getBoundingClientRect().right > root.clientWidth + 1)
      .slice(0, 6)
      .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(' ').join('.')}[${Math.round(el.getBoundingClientRect().width)}:${(el.textContent ?? '').trim().slice(0, 30)}]`);
    return { scroll: root.scrollWidth, client: root.clientWidth, widest };
  });
  expect(overflow.scroll, `${label} is ${overflow.scroll}px wide in a ${overflow.client}px viewport (${overflow.widest.join(', ')})`).toBeLessThanOrEqual(overflow.client + 1);
};

const PHONE = { width: 375, height: 812 };
const SMALL_PHONE = { width: 320, height: 640 };

test.describe('IELTS Practice routes on a phone', () => {
  for (const viewport of [PHONE, SMALL_PHONE]) {
    test(`main pages render without horizontal overflow at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await mockBackend(page);
      const pages: Array<{ path: string; ready: RegExp }> = [
        { path: '/', ready: /From mock results to focused practice/i },
        { path: '/today', ready: /Today’s plan/ },
        { path: '/dashboard', ready: /Welcome back, Aziza/ },
        { path: `/lab/${LAB_SESSION_ID}`, ready: /Main idea evidence locator/ },
        { path: '/practice/reviews', ready: /Reviews due now/ },
        { path: '/generator', ready: /A fresh IELTS-style passage on demand/ },
        { path: '/speaking', ready: /Practise IELTS Speaking, Parts 1 to 3/ },
        { path: '/plan', ready: /Daily practice plan/ },
        { path: '/practice/stats/by-type', ready: /Breakdown by question type/ },
      ];
      for (const entry of pages) {
        await page.goto(entry.path);
        await expect(page.getByRole('heading', { name: entry.ready }).first()).toBeVisible();
        await expectNoHorizontalOverflow(page, entry.path);
      }
    });
  }
});

test.describe('IELTS Practice routes in Uzbek and Russian on a small phone', () => {
  for (const locale of ['uz', 'ru']) {
    test(`longer ${locale} labels still fit at 320px`, async ({ page }) => {
      await page.setViewportSize(SMALL_PHONE);
      await page.addInitScript((value) => { localStorage.setItem('schood.locale', value); }, locale);
      await mockBackend(page);
      for (const path of ['/', '/today', '/dashboard', `/lab/${LAB_SESSION_ID}`, '/practice/reviews', '/generator', '/speaking', '/plan']) {
        await page.goto(path);
        await expect(page.locator('html')).toHaveAttribute('lang', locale);
        await expect(page.locator('h1').first()).toBeVisible();
        await page.waitForLoadState('networkidle');
        await expectNoHorizontalOverflow(page, `${locale} ${path}`);
      }
    });
  }
});

test.describe('IELTS Practice behaviour', () => {
  test('shell has Schood home, Account, sign-out state, language and Playbook links', async ({ page }) => {
    await mockBackend(page);
    await page.goto('/today');
    await expect(page.getByRole('heading', { name: 'Today’s plan' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Schood home' })).toHaveAttribute('href', /schood\.online$/);
    await expect(page.getByRole('link', { name: 'Account', exact: true })).toHaveAttribute('href', /\/account$/);
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
    await expect(page.getByText('Signed in as learner@example.test')).toBeVisible();
    await expect(page.getByRole('link', { name: 'IELTS Playbook' })).toHaveAttribute('href', /playbook\.ielts\.schood\.online\/dashboard/);
    await expect(page.getByRole('combobox', { name: 'Language' })).toBeVisible();
  });

  test('switching to Uzbek and Russian translates the UI', async ({ page }) => {
    await mockBackend(page);
    await page.goto('/today');
    await page.getByRole('combobox', { name: 'Language' }).selectOption('uz');
    await expect(page.getByRole('heading', { name: 'Bugungi reja' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'uz');
    await page.getByRole('combobox', { name: 'Til' }).selectOption('ru');
    await expect(page.getByRole('heading', { name: 'План на сегодня' })).toBeVisible();
  });

  test('?lang= opens the app in that language', async ({ page }) => {
    await mockBackend(page);
    await page.goto('/practice/reviews?lang=ru');
    await expect(page.getByRole('heading', { name: 'Пора повторить' })).toBeVisible();
  });

  test('a missed question comes back as the real item and is graded on the server', async ({ page }) => {
    const calls = await mockBackend(page);
    await page.goto('/practice/reviews');
    await expect(page.getByRole('heading', { name: 'Questions to redo' })).toBeVisible();
    await page.getByRole('button', { name: 'Answer this question' }).click();
    await page.getByRole('radio', { name: 'A new road' }).check();
    await page.getByRole('button', { name: 'Check answer' }).click();
    await expect(page.getByText(/Correct\. It moves to box 2/)).toBeVisible();
    expect(calls.some((call) => call.path === `/ielts-practice/reviews/items/${ITEM_ID}/answer` && JSON.stringify(call.body) === JSON.stringify({ response: { answer: 1 } }))).toBe(true);
  });

  test('“Drill this type” links to /today (not the old /practice/today)', async ({ page }) => {
    await mockBackend(page);
    await page.goto('/practice/reviews');
    const drill = page.getByRole('link', { name: 'Drill this type' }).first();
    await expect(drill).toHaveAttribute('href', /^\/today\?focus_section=reading&focus_question_type=question_true_false_not_given/);
  });

  test('retired pages redirect to the modern ones', async ({ page }) => {
    await mockBackend(page);
    await page.goto('/practice/today?focus_section=reading');
    await expect(page).toHaveURL(/\/today\?focus_section=reading/);
    await page.goto('/results/legacy-attempt');
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto('/exercise/legacy-exercise');
    await expect(page).toHaveURL(/\/today$/);
  });

  test('generator answers are sent as option indexes and graded on the server', async ({ page }) => {
    const calls = await mockBackend(page);
    await page.goto('/generator');
    await page.getByRole('button', { name: /Generate a fresh mock/ }).click();
    await expect(page.getByRole('heading', { name: 'Coastal cities' })).toBeVisible();
    await page.getByRole('radio', { name: 'A new road' }).check();
    await page.getByRole('radio', { name: 'Not Given' }).check();
    await page.getByRole('textbox', { name: /3\. Your answer/ }).fill('coast');
    await page.getByRole('button', { name: 'Check my answers' }).click();
    await expect(page.getByTestId('mock-score')).toHaveText('Score: 3 of 3');
    const submit = calls.find((call) => call.path.endsWith(`/generator/mocks/${MOCK_ID}/submit`));
    expect(submit?.body).toEqual({ answers: [1, 2, 'coast'] });
  });

  test('context from IELTS Playbook / Simulator focuses Today and names the mock', async ({ page }) => {
    const calls = await mockBackend(page);
    // No Writing lab is in today's plan, so Today asks the planner for one.
    await page.goto(`/today?source=simulator&weak_skill=writing&session_id=${SIM_SESSION_ID}`);
    const banner = page.getByTestId('practice-context');
    await expect(banner).toContainText('From your Academic Test 3 mock on');
    await expect(banner).toContainText('Focus: Writing');
    await expect(banner).toContainText('Listening 5.5');
    await expect.poll(() => calls.some((call) => call.path === '/ielts-practice/plans/generate' && (call.body as { focus_section?: string }).focus_section === 'writing')).toBe(true);
    await expect(banner).toContainText('Today’s first lab is a Writing lab.');
  });

  test('a focus already in the plan is used without rebuilding it', async ({ page }) => {
    const calls = await mockBackend(page);
    await page.goto('/today?source=playbook&weak_skill=listening');
    await expect(page.getByTestId('practice-context')).toContainText('Today’s first lab is a Listening lab.');
    expect(calls.some((call) => call.path === '/ielts-practice/plans/generate')).toBe(false);
  });

  test('focus_module from Playbook is understood on the dashboard', async ({ page }) => {
    await mockBackend(page);
    await page.goto('/dashboard?source=playbook&weak_skill=reading&focus_module=reading_matching_headings');
    const banner = page.getByTestId('practice-context');
    await expect(banner).toContainText('From IELTS Playbook');
    await expect(banner).toContainText('Focus: Reading · Matching Headings');
    await expect(banner.getByRole('link', { name: 'Start Reading practice' })).toHaveAttribute('href', '/today?focus_section=reading&focus_question_type=matching_headings');
  });

  test('an empty catalogue shows a clear empty state, not an error', async ({ page }) => {
    await mockBackend(page, { emptyPlan: true });
    await page.goto('/today');
    await page.getByRole('button', { name: 'Skip to today’s lab' }).click();
    await page.getByRole('button', { name: 'Build today’s plan' }).click();
    await expect(page.getByTestId('empty-catalogue')).toContainText('No practice labs are published for you yet');
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('full mock card is honest about IELTS Simulator access', async ({ page }) => {
    await mockBackend(page, { simulatorAccess: false });
    await page.goto('/dashboard');
    const card = page.getByTestId('full-mock-card');
    await expect(card).toContainText('Not included in IELTS Practice');
    await expect(card.getByRole('link', { name: 'See IELTS Simulator plans' })).toHaveAttribute('href', /\/pricing\?.*product=ielts-academic-simulator/);
    await expect(card).not.toContainText('same rubric your certificate');
  });

  test('full mock card opens the simulator when access includes it', async ({ page }) => {
    await mockBackend(page, { simulatorAccess: true });
    await page.goto('/dashboard');
    const card = page.getByTestId('full-mock-card');
    await expect(card).toContainText('Included in your access');
    await expect(card.getByRole('link', { name: 'Open IELTS Simulator' })).toHaveAttribute('href', /ielts\.schood\.online\/full-exam/);
  });

  test('repair targets show measured data only, with no projected band gains', async ({ page }) => {
    await mockBackend(page);
    await page.goto('/dashboard');
    const card = page.getByTestId('repair-targets');
    await expect(card).toContainText('3 recorded misses');
    await expect(card).toContainText('50% accuracy over 4 attempts');
    await expect(card).not.toContainText('+0.');
  });

  test('speaking practice sends a typed transcript and shows transcript-only feedback', async ({ page }) => {
    const calls = await mockBackend(page);
    await page.goto('/speaking');
    await expect(page.getByTestId('speaking-topic')).toHaveText('Your home town');
    await expect(page.getByText(/no band score is given/)).toBeVisible();
    await page.getByLabel('Transcript of your answer').fill('I grew up in Samarkand, an old city famous for its blue domes and busy markets, and I still love it.');
    await page.getByRole('button', { name: 'Get feedback' }).click();
    await expect(page.getByTestId('speaking-feedback')).toContainText('Ideas are linked clearly.');
    const submit = calls.find((call) => call.path === '/ielts-practice/speaking/attempts' && call.method === 'POST');
    expect((submit?.body as { prompt_id?: string }).prompt_id).toBe('p1-hometown');
  });
});

