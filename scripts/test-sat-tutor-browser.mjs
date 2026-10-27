// Render the real SAT app with synthetic sessions and block all external traffic.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createServer } from 'vite';
const require = createRequire(new URL('../apps/platform/package.json', import.meta.url));
const { chromium } = require('playwright');
const AxeBuilder = require('@axe-core/playwright').default;
const root = path.resolve(import.meta.dirname, '..'), output = path.join(root, 'supabase/.temp/sat-tutor-browser');
mkdirSync(path.join(output, 'empty-env'), { recursive: true });
const previous = {}, values = {
  VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_ANON_KEY: 'synthetic-sat-tutor-key',
  VITE_PLATFORM_URL: 'http://127.0.0.1:54321', VITE_AUTH_COOKIE_DOMAIN: '', VITE_AUTH_SHARED_COOKIE: 'false', VITE_DISABLE_PAYWALL: 'false',
};
for (const [key, value] of Object.entries(values)) { previous[key] = process.env[key]; process.env[key] = value; }
const actor = '11111111-1111-4111-8111-111111111111', attemptId = '22222222-2222-4222-8222-222222222222', questionId = '33333333-3333-4333-8333-333333333333';
const session = { access_token: 'qa.' + Buffer.from(JSON.stringify({ sub: actor, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url') + '.signature', refresh_token: 'synthetic-refresh', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: actor, aud: 'authenticated', role: 'authenticated', email: 'fixture@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' } };
const question = { id: questionId, type: 'question_single_choice', data: { prompt: 'Which value satisfies 2x + 3 = 11?', options: [{ id: 'A', label: '4' }, { id: 'B', label: '7' }, { id: 'C', label: '8' }, { id: 'D', label: '11' }] }, metadata: {}, correct: { option_id: 'A' }, section_type: 'math', domain: 'algebra', difficulty: 'easy' };
const attempt = { id: attemptId, status: 'scored', question_ids: [questionId], answers: { [questionId]: { selected_option: 'B' } }, scored_items: [], filters_used: {}, score_raw: 0, score_accuracy: 0, started_at: '2026-01-01T00:00:00Z', submitted_at: '2026-01-01T00:00:01Z' };
const advice = { steps: ['Subtract 3 from both sides.', 'Divide both sides by 2 to obtain x = 4.'], key_concept: 'Solving linear equations', why_distractors_wrong: { B: 'Substituting 7 gives 17, not 11.' } };
const otherActor = '66666666-6666-4666-8666-666666666666';
const otherSession = { ...session, access_token: 'qa.' + Buffer.from(JSON.stringify({ sub: otherActor, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url') + '.signature', user: { ...session.user, id: otherActor, email: 'second-fixture@example.test' } };
const fixtureJwt = user => [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'), Buffer.from(JSON.stringify({ sub: user, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'), Buffer.from('synthetic-signature').toString('base64url')].join('.');
session.access_token = fixtureJwt(actor); otherSession.access_token = fixtureJwt(otherActor);
attempt.scored_items.push({ question_id: questionId, correct: false, expected: { option_id: 'A', feedback: { explanation: 'Subtract 3 and divide by 2.' } } });
let server, browser;
const results = [];
async function check(name, run) { await run(); results.push({ name, passed: true }); console.log('PASS: ' + name); }
try {
  server = await createServer({ root: path.join(root, 'apps/sat-practice'), configFile: path.join(root, 'apps/sat-practice/vite.config.ts'), envDir: path.join(output, 'empty-env'), server: { host: '127.0.0.1', port: 0, fs: { allow: [root] } } });
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addCookies([{ name: 'schood-auth', value: encodeURIComponent(JSON.stringify(session)), domain: '127.0.0.1', path: '/', sameSite: 'Lax' }]);
  const page = await context.newPage(), errors = [], external = [];
  page.on('pageerror', error => errors.push(error.message));
  let scenario = 'success', posts = 0, saved = null, quotaReads = 0;
  let releaseResponse, responseHeld = false;
  const quota = () => ({ api_version: 2, used: saved ? 1 : 0, limit: 2, remaining: saved ? 1 : 2, attempts_remaining: saved ? 5 : 6, enabled: scenario !== 'disabled' });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    const requestUser = route.request().headers().authorization === 'Bearer ' + otherSession.access_token ? otherSession.user : session.user;
    if (url.pathname.startsWith('/auth/v1/')) return route.fulfill({ json: requestUser });
    if (url.pathname.startsWith('/rest/v1/')) return route.fulfill({ json: [] });
    if (url.pathname.startsWith('/functions/v1/')) {
      if (url.pathname.endsWith('/sat-practice/attempts/' + attemptId)) return requestUser.id === actor
        ? route.fulfill({ json: { attempt, questions: [question], legacy_result: false } }) : route.fulfill({ status: 404, json: { error: 'Drill not found.' } });
      if (url.pathname.includes('/tutor/')) {
        if (url.searchParams.get('action') === 'quota') {
          quotaReads++;
          if (scenario === 'quota-outage' && saved) return route.fulfill({ status: 503, json: { error: 'Allowance temporarily unavailable' } });
          return route.fulfill({ json: scenario === 'old-runtime' ? { enabled: true, remaining: 2 } : quota() });
        }
        if (url.searchParams.get('action') === 'result') {
          if (scenario === 'uncertain') return route.fulfill({ json: { status: 'uncertain', result: null, request_id: saved.request_id } });
          return route.fulfill({ json: saved });
        }
        posts++;
        const body = route.request().postDataJSON(), mode = url.pathname.split('/').at(-1);
        assert.equal(body.attempt_id, attemptId); assert.equal(body.question_id, questionId); assert.match(body.request_id, /^[a-f0-9-]{36}$/);
        saved = { ok: true, ai_status: 'ok', data: scenario === 'malformed' ? { ...advice, why_distractors_wrong: null } : advice,
          request_id: body.request_id, attempt_id: attemptId, question_id: questionId, mode, quota: quota() };
        if (mode === 'similar') saved.data = { ...advice, similar_question: { prompt: 'Which value satisfies 3x + 2 = 14?', choices: ['A', 'B', 'C', 'D'].map((id, index) => ({ id, text: String(index + 4) })), correct_choice: 'A', explanation: 'Subtract 2 and divide by 3.' } };
        if (scenario === 'lost-response' || scenario === 'uncertain') return route.abort('failed');
        if (scenario === 'late-account') {
          responseHeld = true;
          await new Promise(resolve => { releaseResponse = resolve; });
        }
        return route.fulfill({ json: saved });
      }
      return route.fulfill({ json: { user: requestUser, entitlements: [], effective_product_ids: ['2cf7b1a7-4df9-4de8-99e8-5b9d5bb85010'] } });
    }
    if (url.origin === origin) return route.continue();
    external.push(url.origin); return route.abort();
  });
  const reset = async mode => {
    scenario = mode; posts = 0; saved = null; quotaReads = 0;
    await page.goto(origin); await page.evaluate(() => sessionStorage.clear());
    await page.goto(`${origin}/tutor/${questionId}?attempt=${attemptId}`);
    await page.getByRole('heading', { name: 'Learn from this question' }).waitFor();
  };
  const ready = async () => { await page.getByRole('button', { name: 'Explain', exact: true }).waitFor(); await page.waitForFunction(() => ![...document.querySelectorAll('button')].find(b => b.textContent === 'Explain')?.disabled); };
  await check('readable original question and one dispatch for repeated clicks', async () => {
    await reset('success'); await ready();
    await page.getByText(question.data.prompt, { exact: true }).waitFor();
    await page.getByText('Your answer: incorrect', { exact: true }).waitFor();
    assert.equal(await page.locator('.option-row.answer-incorrect').count(), 1);
    await page.getByRole('button', { name: 'Explain', exact: true }).evaluate(button => { button.click(); button.click(); });
    await page.getByRole('heading', { name: advice.key_concept }).waitFor();
    assert.equal(posts, 1); assert.equal(await page.locator('pre').count(), 0);
    assert.equal(await page.getByText(advice.steps[0], { exact: true }).count(), 1);
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'No horizontal overflow at ' + width);
      await page.locator('.tutor-panel').scrollIntoViewIfNeeded();
      const audit = await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      assert.deepEqual(audit.violations.map(row => ({ id: row.id, impact: row.impact })), [], 'Scoped tutor accessibility at ' + width);
      await page.evaluate(() => scrollTo(0, 0));
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await page.screenshot({ path: path.join(output, `tutor-${width}.png`), fullPage: true });
    }
  });
  await check('similar examples are readable and explicitly unverified', async () => {
    await reset('success'); await ready();
    await page.getByRole('button', { name: 'Similar example', exact: true }).click();
    await page.getByRole('heading', { name: 'Similar practice example' }).waitFor();
    await page.getByText('AI-generated example; its answer has not been independently checked.', { exact: true }).waitFor();
    await page.getByText('Show the example answer', { exact: true }).click();
    await page.getByText('Subtract 2 and divide by 3.', { exact: false }).waitFor();
    assert.equal(posts, 1);
  });
  await check('lost response survives reload and recovers using GET without redispatch', async () => {
    await reset('lost-response'); await ready(); await page.getByRole('button', { name: 'Explain', exact: true }).click();
    await page.getByRole('button', { name: 'Check saved explanation' }).waitFor();
    const id = saved.request_id;
    await page.reload(); await page.getByRole('button', { name: 'Check saved explanation' }).waitFor();
    await page.getByRole('button', { name: 'Check saved explanation' }).click();
    await page.getByRole('heading', { name: advice.key_concept }).waitFor();
    assert.equal(posts, 1); assert.equal(saved.request_id, id);
    assert.equal(await page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith('schood.sat-tutor.pending.')).length), 0);
  });
  await check('saved feedback remains visible when allowance refresh fails', async () => {
    await reset('quota-outage'); await ready(); await page.getByRole('button', { name: 'Explain', exact: true }).click();
    await page.getByRole('heading', { name: advice.key_concept }).waitFor();
    await page.getByRole('button', { name: 'Retry loading the allowance' }).waitFor();
    assert.equal(posts, 1); assert(quotaReads >= 2);
  });
  await check('uncertain requests require explicit recovery and a fresh acknowledged request', async () => {
    await reset('uncertain'); await ready(); await page.getByRole('button', { name: 'Explain', exact: true }).click();
    await page.getByRole('button', { name: 'Check saved explanation' }).click();
    await page.getByText('This request may have reached the AI provider and still counts.', { exact: false }).waitFor();
    const id = saved.request_id;
    await page.getByRole('button', { name: 'Prepare a new request' }).click();
    scenario = 'success'; await ready(); await page.getByRole('button', { name: 'Explain', exact: true }).click();
    await page.getByRole('heading', { name: advice.key_concept }).waitFor();
    assert.equal(posts, 2); assert.notEqual(saved.request_id, id);
  });
  await check('disabled, old runtime and malformed feedback fail visibly without crashing', async () => {
    for (const mode of ['disabled', 'old-runtime']) {
      await reset(mode);
      if (mode === 'disabled') await page.getByText('AI explanations are switched off right now.', { exact: false }).waitFor();
      else await page.getByText('SAT Tutor is being updated.', { exact: false }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Explain', exact: true }).isDisabled(), true);
      assert.equal(posts, 0);
    }
    await reset('malformed'); await ready(); await page.getByRole('button', { name: 'Explain', exact: true }).click();
    await page.getByText('The saved feedback could not be confirmed.', { exact: false }).waitFor();
    assert.equal(posts, 1); assert.equal(await page.getByRole('button', { name: 'Check saved explanation' }).count(), 1);
  });
  await check('missing completed-drill reference does not submit tutoring', async () => {
    await page.goto(`${origin}/tutor/${questionId}`);
    await page.getByText('Open the tutor from a completed drill', { exact: false }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Explain', exact: true }).count(), 0);
  });
  await check('an account switch cannot display late feedback from the previous learner', async () => {
    await reset('late-account'); await ready();
    await page.getByRole('button', { name: 'Explain', exact: true }).click();
    for (let i = 0; i < 100 && !responseHeld; i++) await new Promise(resolve => setTimeout(resolve, 20));
    assert(responseHeld, 'The owned response must be held before switching accounts');
    await page.evaluate(async replacement => {
      const { supabase } = await import('/src/lib/supabase.ts');
      const result = await supabase.auth.setSession({ access_token: replacement.access_token, refresh_token: replacement.refresh_token });
      if (result.error) throw result.error;
    }, otherSession);
    await page.getByText('Drill not found.', { exact: true }).waitFor();
    const previousFinished = page.waitForResponse(response => response.url().includes('/sat-practice/tutor/explain') && response.request().method() === 'POST');
    releaseResponse(); await previousFinished;
    assert.equal(await page.getByRole('heading', { name: advice.key_concept }).count(), 0);
    assert.equal(await page.getByText(question.data.prompt, { exact: true }).count(), 0);
    assert.equal(posts, 1);
  });
  assert.deepEqual(errors, []);
  assert(external.every(origin => ['https://fonts.googleapis.com', 'https://images.unsplash.com'].includes(origin)), 'Unexpected external request; all external traffic is blocked');
  await context.close();
  writeFileSync(path.join(output, 'proof.json'), JSON.stringify({ checkedAt: new Date().toISOString(), source: 'actual local SAT application; synthetic HTTP fixtures; all remote fonts/images blocked; no production or provider requests', results, browserErrors: errors, blockedExternalOrigins: [...new Set(external)], productionRequests: 0, providerRequests: 0 }, null, 2) + '\n');
} finally {
  await browser?.close(); await server?.close();
  for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
}
