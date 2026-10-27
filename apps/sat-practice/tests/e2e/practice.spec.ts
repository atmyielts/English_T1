import { expect, test, type Page, type Route } from '@playwright/test';

// Synthetic learner and fixtures; every network request is answered locally.
const actor = '11111111-1111-4111-8111-111111111111';
const product = '2cf7b1a7-4df9-4de8-99e8-5b9d5bb85010';
const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const jwt = [b64({ alg: 'HS256', typ: 'JWT' }), b64({ sub: actor, exp: Math.floor(Date.now() / 1000) + 3600 }), b64('sig')].join('.');
const user = { id: actor, aud: 'authenticated', role: 'authenticated', email: 'learner@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
const session = { access_token: jwt, refresh_token: 'synthetic-refresh', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user };
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const figure = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80"><title>Right triangle with legs 6 and 8</title><polygon points="10,70 110,70 10,10" fill="none" stroke="#111"/><text x="60" y="78" font-size="8">8</text></svg>';
const longPassage = 'Researchers studying urban beekeeping compared hives on rooftops with hives in parks. Antidisestablishmentarianism-like compound labels such as https://example.test/a-very-long-unbroken-reference-url-that-must-wrap-on-phones appear in notes. The rooftop hives produced slightly less honey but showed <u>markedly fewer</u> signs of pesticide exposure.';
const questions = {
  mcq: { id: id(1), type: 'question_single_choice', section_type: 'math', domain: 'algebra', difficulty: 'easy',
    metadata: { sat_official_domain: 'algebra', sat_skill: 'linear_equations_one_variable', answer_format: 'mcq' },
    data: { prompt: 'If $3x + 5 = 20$, what is the value of $x$? $$\\frac{3x+5}{5} = 4 \\quad\\text{and}\\quad x^2 + 2x + 1 = (x+1)^2 \\quad\\text{for every real}\\ x$$', options: [{ id: 'A', label: '$3$' }, { id: 'B', label: '$5$' }, { id: 'C', label: '$\\frac{25}{3}$' }, { id: 'D', label: '$15$' }] } },
  spr: { id: id(2), type: 'question_spr', section_type: 'math', domain: 'problem_solving_data_analysis', difficulty: 'medium',
    metadata: { sat_official_domain: 'problem_solving_data_analysis', sat_skill: 'two_variable_data', answer_format: 'spr' },
    data: { prompt: 'The table shows values of $x$ and $y$. What is the slope of the line through the points? Express your answer as a fraction.', table: { headers: ['$x$', '$y$', 'Very long column header for a phone screen', 'Another wide column'], rows: [['1', '4', '1000000000', '2000000000'], ['4', '6', '3000000000', '4000000000']] }, figure_svg: figure } },
  rw: { id: id(3), type: 'question_single_choice', section_type: 'reading_writing', domain: 'command_of_evidence', difficulty: 'hard',
    metadata: { sat_official_domain: 'information_and_ideas', sat_skill: 'inferences', answer_format: 'mcq' },
    data: { passage: longPassage, prompt: 'Which choice most logically completes the text about the <u>rooftop hives</u>?', options: [{ id: 'A', label: 'They avoided pesticides.' }, { id: 'B', label: 'They produced more honey.' }, { id: 'C', label: 'They were in parks.' }, { id: 'D', label: 'They had no bees.' }] } },
};
const facets = { total: 3, section_type: { math: 2, reading_writing: 1 }, official_domain: { algebra: 1, problem_solving_data_analysis: 1, information_and_ideas: 1 }, skill: { linear_equations_one_variable: 1 }, difficulty: { easy: 1, medium: 1, hard: 1 }, format: { mcq: 2, spr: 1 }, status: { unseen: 3 } };
const today = new Date().toISOString().slice(0, 10);
const planItems = [
  { id: id(101), scheduled_for: today, task_type: 'drill', status: 'pending', estimated_minutes: 18, payload: { section_type: 'math', official_domain: 'algebra', skill: null, difficulty: 'medium', question_count: 10, reason: 'no_data', week_start: today } },
  { id: id(102), scheduled_for: today, task_type: 'notebook_review', status: 'completed', estimated_minutes: 10, payload: { count: 5, reason: 'retention', week_start: today, note: 'nothing_due' } },
  { id: id(103), scheduled_for: today, task_type: 'module', status: 'pending', estimated_minutes: 40, payload: { section_type: 'math', module_section: 'math', profile: 'standard', reason: 'pacing', week_start: today } },
];
const week = { week_start: today, week_end: today, today, generated: false, items: planItems, today_items: planItems, progress: { completed: 1, total: 3, minutes_planned: 68, minutes_completed: 10 }, goals_set: false, goals: { target_score: 1400, hours_per_week: 3, test_date: null } };
const domains = ['information_and_ideas', 'craft_and_structure', 'expression_of_ideas', 'standard_english_conventions', 'algebra', 'advanced_math', 'problem_solving_data_analysis', 'geometry_trigonometry']
  .map((d, i) => ({ official_domain: d, section_type: i < 4 ? 'reading_writing' : 'math', bank: 20, answered: 0, correct: 0, accuracy: null, skills: [] }));
const dashboard = {
  goals: { user_id: actor, target_score: 1400, test_date: null, hours_per_week: 3, metadata: {}, updated_at: '' }, goals_set: false, mastery: [],
  official_mastery: domains.map(d => ({ official_domain: d.official_domain, section_type: d.section_type, attempts: 0, mastery_level: null })),
  insights: { domains, totals: { bank: 160, answered: 0, correct: 0 } }, plan_items: planItems, plan_week: { week_start: today, week_end: today, progress: week.progress },
  notebook: [], activity: { streak_days: 0, weekly_minutes: 0, weekly_goal_minutes: 180, xp_total: 0, xp_week: 0 }, mastery_percent: null,
  score_impact: { status: 'insufficient_data', answered_total: 0, min_answers: 8, conservative: null, optimistic: null, domains: [] }, plan_stale: false,
};

type State = { attempts: Map<string, any>; calls: string[]; goalsError: boolean };
async function mock(page: Page, state: State) {
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  const attempt = (attemptId: string, list: any[], filters: Record<string, unknown> = {}) => ({
    id: attemptId, status: 'in_progress', filters_used: filters, question_ids: list.map(q => q.id), answers: {}, scored_items: [], score_raw: null, score_accuracy: null,
    started_at: new Date().toISOString(), submitted_at: null,
  });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    if (url.origin === 'http://127.0.0.1:5104' || url.protocol === 'data:') return route.fallback();
    if (url.pathname.startsWith('/auth/v1/')) return json(route, user);
    if (!url.pathname.startsWith('/functions/v1/')) return url.hostname === '127.0.0.1' ? json(route, {}) : route.abort();
    const path = url.pathname.replace('/functions/v1', '');
    state.calls.push(`${method} ${path}${url.search}`);
    if (path === '/me') return json(route, { user: { id: actor, email: user.email, role: 'student' }, entitlements: [{ id: 'e', resource_type: 'product', resource_id: product, starts_at: null, ends_at: null, value: null }] });
    if (path === '/access-effective') return json(route, { effective_product_ids: [product] });
    if (path === '/journey-analytics' || path.startsWith('/journey')) return json(route, {});
    if (path === '/sat-practice/dashboard') return json(route, dashboard);
    if (path === '/sat-practice/plans/week') return json(route, week);
    if (path === '/sat-practice/goals' && method === 'GET') return json(route, { goals: dashboard.goals, goals_set: false });
    if (path === '/sat-practice/goals' && method === 'PATCH') return state.goalsError ? json(route, { error: 'Choose a test date that has not passed yet.', code: 'past_test_date' }, 400) : json(route, { ok: true, goals: dashboard.goals, plan_updated: true });
    if (path === '/sat-practice/bank') return json(route, { questions: [questions.mcq, questions.spr, questions.rw], total: 3, offset: 0, limit: 12, facets, history: { [id(1)]: 'unseen', [id(2)]: 'missed', [id(3)]: 'correct' } });
    if (path === '/sat-practice/attempts/start' || path.startsWith('/sat-practice/plans/items/')) {
      const body = route.request().postDataJSON();
      const a = attempt(body.request_id, [questions.mcq, questions.spr, questions.rw], { mode: 'bank', requested_count: 10 });
      state.attempts.set(a.id, { attempt: a, questions: [questions.mcq, questions.spr, questions.rw] });
      return json(route, { attempt: a, questions: [questions.mcq, questions.spr, questions.rw], selection: { requested: 10, available: 3 } });
    }
    if (path === '/sat-practice/modules/start') {
      const body = route.request().postDataJSON();
      const list = [questions.mcq, questions.spr];
      const a = attempt(body.request_id, list, { mode: 'module', module_section: 'math', module_profile: 'standard', time_limit_seconds: 2100, requested_count: 22 });
      state.attempts.set(a.id, { attempt: a, questions: list });
      return json(route, { attempt: a, questions: list, selection: { requested: 22, available: 2 } });
    }
    const one = path.match(/^\/sat-practice\/attempts\/([0-9a-f-]{36})$/);
    if (one) {
      const saved = state.attempts.get(one[1]!);
      return saved ? json(route, { ...saved, legacy_result: saved.attempt.status === 'scored' ? false : undefined }) : json(route, { error: 'Drill not found.', code: 'not_found' }, 404);
    }
    if (path === '/sat-practice/attempts/submit') {
      const body = route.request().postDataJSON();
      const saved = state.attempts.get(body.attempt_id);
      const keys: Record<string, unknown> = { [id(1)]: { option_id: 'B', feedback: { explanation: 'Subtract 5: $3x = 15$, so $x = 5$.' } }, [id(2)]: { accepted: ['2/3', '.6666', '.6667'], feedback: { explanation: 'Slope is $\\frac{6-4}{4-1} = \\frac{2}{3}$.' } }, [id(3)]: { option_id: 'A', feedback: { explanation: 'The text says fewer signs of exposure.' } } };
      const scored = saved.questions.map((q: any) => ({ question_id: q.id, correct: q.id !== id(3), expected: keys[q.id], answer: body.answers[q.id] ?? null }));
      const done = { ...saved.attempt, status: 'scored', answers: body.answers, scored_items: scored, score_raw: scored.filter((s: any) => s.correct).length, score_accuracy: 0.667, submitted_at: new Date().toISOString() };
      const result = { attempt: done, questions: saved.questions.map((q: any) => ({ ...q, correct: keys[q.id] })), notebook: [], timing: { elapsed_seconds: 95, counted_seconds: 95, study_minutes: 2, time_limit_seconds: saved.attempt.filters_used.time_limit_seconds ?? null } };
      state.attempts.set(done.id, { attempt: done, questions: result.questions, timing: result.timing });
      return json(route, result);
    }
    if (path.includes('/tutor/')) return json(route, { api_version: 2, used: 0, limit: 2, remaining: 2, attempts_remaining: 6, enabled: true });
    return json(route, {});
  });
}
async function signIn(page: Page) {
  await page.context().addCookies([{ name: 'schood-auth', value: encodeURIComponent(JSON.stringify(session)), domain: '127.0.0.1', path: '/', sameSite: 'Lax' }]);
}
const freshState = (): State => ({ attempts: new Map(), calls: [], goalsError: false });
const filter = (page: Page, name: string) => page.locator('.bank-filters label').filter({ hasText: new RegExp('^' + name) }).locator('select');
async function noHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: window.innerWidth }));
  expect(overflow.scroll, `page is ${overflow.scroll}px wide in a ${overflow.width}px viewport`).toBeLessThanOrEqual(overflow.width);
}

test.beforeEach(async ({ page }) => {
  page.on('pageerror', error => { throw error; });
});

test('bank filters by official domain and skill and renders KaTeX, tables, safe figures and underlines', async ({ page }) => {
  const state = freshState();
  await signIn(page); await mock(page, state);
  await page.goto('/bank');
  await expect(page.getByRole('heading', { name: 'Practise by official SAT domain and skill' })).toBeVisible();
  await filter(page, 'Domain').selectOption('algebra');
  await filter(page, 'Skill').selectOption('linear_equations_one_variable');
  await filter(page, 'Format').selectOption('mcq');
  await filter(page, 'Your history').selectOption('unseen');
  await expect.poll(() => state.calls.some(c => c.includes('/sat-practice/bank') && c.includes('official_domain=algebra') && c.includes('skill=linear_equations_one_variable') && c.includes('format=mcq') && c.includes('status=unseen'))).toBe(true);
  await expect(page.locator('.katex').first()).toBeVisible();
  await expect(page.locator('.math-display .katex-display')).toHaveCount(1);
  await expect(page.locator('table.question-table')).toBeVisible();
  const img = page.locator('.question-figure img');
  await expect(img).toHaveAttribute('src', /^data:image\/svg\+xml/);
  await expect(img).toHaveAttribute('alt', 'Right triangle with legs 6 and 8');
  await expect(page.locator('.question-passage u')).toHaveText('markedly fewer');
  await expect(page.locator('.chip.status-missed')).toHaveText('Missed last time');
  await page.setViewportSize({ width: 375, height: 800 });
  await noHorizontalOverflow(page);
  await page.setViewportSize({ width: 320, height: 800 });
  await noHorizontalOverflow(page);
});

test('drill with mcq, grid-in, table and figure submits and shows reviewed results', async ({ page }) => {
  const state = freshState();
  await signIn(page); await mock(page, state);
  await page.goto('/bank');
  await page.getByRole('button', { name: 'Start drill' }).click();
  await expect(page.getByRole('heading', { name: 'Focused drill' })).toBeVisible();
  await expect(page.getByText('This drill has 3 of the 10 questions requested')).toBeVisible();
  await page.getByRole('radio').nth(1).check();
  const spr = page.getByRole('textbox', { name: 'Your answer' });
  await spr.fill('2/3x%9999');
  await expect(spr).toHaveValue('2/3');
  await spr.fill('1.2.3');
  await expect(page.getByText('Enter a number, a decimal or a fraction such as 3/4.')).toBeVisible();
  await spr.fill('2/3');
  await expect(page.locator('.spr-preview .katex')).toBeVisible();
  await page.getByRole('radio').nth(4).check();
  await page.getByRole('button', { name: 'Submit drill' }).click();
  await expect(page).toHaveURL(/\/results\//);
  await expect(page.getByRole('heading', { name: '2 of 3 correct' })).toBeVisible();
  await expect(page.getByText('Accepted answers:')).toBeVisible();
  await expect(page.getByText('By official domain')).toBeVisible();
  await expect(page.locator('.explanation .katex').first()).toBeVisible();
  await page.setViewportSize({ width: 375, height: 800 });
  await noHorizontalOverflow(page);
});

test('timed module practice has a countdown, navigator, flags and a calculator panel', async ({ page }) => {
  const state = freshState();
  await signIn(page); await mock(page, state);
  await page.goto('/modules');
  await expect(page.getByRole('heading', { name: 'Timed Digital SAT modules' })).toBeVisible();
  await page.getByRole('button', { name: 'Start module' }).nth(1).click();
  await expect(page.getByRole('heading', { name: 'Math module' })).toBeVisible();
  await expect(page.getByRole('timer')).toContainText(/3[45]:\d\d/);
  await expect(page.getByText('The bank has 2 of the 22 questions for this module yet')).toBeVisible();
  await expect(page.getByText('Question 1 of 2').first()).toBeVisible();
  await page.getByRole('button', { name: 'Mark for review' }).click();
  await expect(page.getByRole('button', { name: 'Marked for review' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('textbox', { name: 'Your answer' })).toBeVisible();
  await page.getByRole('button', { name: 'Check your work' }).click();
  await expect(page.getByRole('group', { name: 'Question navigator' })).toBeVisible();
  await page.getByRole('button', { name: /Go to question 1/ }).click();
  await expect(page.getByRole('radio').first()).toBeVisible();
  await page.getByRole('button', { name: 'Calculator' }).click();
  const desmos = page.getByRole('link', { name: 'Open Desmos' });
  await expect(desmos).toHaveAttribute('href', 'https://www.desmos.com/calculator');
  await expect(desmos).toHaveAttribute('target', '_blank');
  await expect(page.getByText('cannot be embedded here')).toBeVisible();
  await page.getByLabel('Calculator expression').fill('2+3*4');
  await page.getByLabel('Calculator expression').press('Enter');
  await expect(page.locator('.calc-output')).toHaveText('14');
  await page.setViewportSize({ width: 375, height: 800 });
  await noHorizontalOverflow(page);
  await page.getByRole('button', { name: 'Submit module' }).click();
  await expect(page.getByText('2 questions are unanswered. Submit anyway?')).toBeVisible();
});

test('weekly plan shows progress and starts a plan item on the server', async ({ page }) => {
  const state = freshState();
  await signIn(page); await mock(page, state);
  await page.goto('/plan');
  await expect(page.getByRole('heading', { name: 'Your weekly SAT plan' })).toBeVisible();
  await expect(page.getByText('1 of 3 tasks done')).toBeVisible();
  await expect(page.getByText('Nothing to review right now, so this task is marked done.')).toBeVisible();
  await expect(page.getByText('Math module, timed')).toBeVisible();
  await page.setViewportSize({ width: 375, height: 800 });
  await noHorizontalOverflow(page);
  await page.getByRole('button', { name: 'Start' }).first().click();
  await expect(page).toHaveURL(/\/lab\//);
  expect(state.calls.some(c => c.startsWith(`POST /sat-practice/plans/items/${id(101)}/start`))).toBe(true);
});

test('dashboard links to onboarding, is honest without data, and onboarding shows save errors', async ({ page }) => {
  const state = freshState();
  state.goalsError = true;
  await signIn(page); await mock(page, state);
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Not enough data yet' })).toBeVisible();
  await expect(page.getByText('20–60')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'SAT Playbook', exact: true })).toHaveAttribute('href', 'https://playbook.sat.schood.online/dashboard');
  await expect(page.getByRole('link', { name: 'Schood home', exact: true })).toHaveAttribute('href', 'https://schood.online');
  await expect(page.getByRole('link', { name: 'Account', exact: true })).toHaveAttribute('href', 'https://schood.online/account');
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  await page.setViewportSize({ width: 375, height: 800 });
  await noHorizontalOverflow(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('link', { name: 'Set my goal' }).click();
  await expect(page.getByRole('heading', { name: 'Your SAT goal' })).toBeVisible();
  await page.getByRole('button', { name: 'Save goal' }).click();
  await expect(page.getByRole('alert')).toContainText('Choose a test date that has not passed yet.');
});

test('language switcher translates the interface while content stays English', async ({ page }) => {
  const state = freshState();
  await signIn(page); await mock(page, state);
  await page.goto('/bank?lang=ru');
  await expect(page.getByRole('heading', { name: 'Тренируйтесь по официальным разделам и навыкам SAT' })).toBeVisible();
  await expect(page.getByText('Which choice most logically completes the text', { exact: false })).toBeVisible();
  await page.getByLabel('Язык').first().selectOption('uz');
  await expect(page.getByRole('heading', { name: 'Rasmiy SAT yo‘nalishi va ko‘nikmasi bo‘yicha mashq qiling' })).toBeVisible();
});
