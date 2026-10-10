// Playwright CLI; local synthetic auth, provider and dictation only.
async (page) => {
  const origin = 'http://127.0.0.1:4291', actor = '11111111-1111-4111-8111-111111111111';
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const session = { access_token: 'account-qa', refresh_token: 'account-qa-refresh', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: actor, aud: 'authenticated', role: 'authenticated', email: 'qa@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' } };
  await page.addInitScript(() => {
    window.speechQa = { current: null, aborts: 0 };
    window.SpeechRecognition = class {
      constructor() { window.speechQa.current = this; }
      start() {}
      stop() { this.onend?.(); }
      abort() { window.speechQa.aborts++; this.onend?.(); }
    };
  });
  let release, started, authUser = session.user;
  let responseGate, startedGate;
  const results = [];
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/auth/v1/')) return route.fulfill({ json: authUser });
    if (url.pathname.startsWith('/rest/v1/')) return route.fulfill({ json: [] });
    if (url.pathname.startsWith('/functions/v1/')) {
      const action = url.searchParams.get('action');
      if (action === 'quota') return route.fulfill({ json: { api_version: 2, used: 0, limit: 2, remaining: 2, attempts_remaining: 6, enabled: true, addon_available: false, has_paid_access: false } });
      if (action === 'history') return route.fulfill({ json: { sessions: [] } });
      if (action === 'grade' || action === 'score') {
        started(); await responseGate;
        try { return await route.fulfill({ json: { session_id: 'late-private-result', assessment_scope: 'transcript_only', feedback: 'PRIVATE LATE FEEDBACK' } }); }
        catch { return; } // The client correctly aborted its old-account transport.
      }
      return route.fulfill({ json: { user: authUser, entitlements: [], effective_product_ids: [] } });
    }
    return url.origin === origin ? route.continue() : route.abort();
  });
  const changeAccount = () => {
    authUser = { ...session.user, id: '22222222-2222-4222-8222-222222222222', email: 'other-qa@example.test' };
    return page.evaluate(async user => {
    const { supabase } = await import('/src/lib/supabase.ts');
    const encode = value => btoa(JSON.stringify(value)).replaceAll('=', '').replaceAll('+', '-').replaceAll('/', '_');
    const token = [encode({ alg: 'HS256', typ: 'JWT' }), encode({ sub: user.id, exp: Math.floor(Date.now()/1000)+3600, role: 'authenticated' }), 'c3ludGhldGlj'].join('.');
    const { error } = await supabase.auth.setSession({ access_token: token, refresh_token: 'other-synthetic-refresh' });
    if (error) throw error;
    }, authUser);
  };
  const signIn = async path => {
    authUser = session.user;
    await page.context().addCookies([{ name: 'schood-auth', value: encodeURIComponent(JSON.stringify(session)), domain: '127.0.0.1', path: '/', sameSite: 'Lax' }]);
    await page.goto(origin + path);
  };
  for (const service of ['writing', 'speaking']) {
    responseGate = new Promise(resolve => release = resolve);
    startedGate = new Promise(resolve => started = resolve);
    await signIn(service === 'writing' ? '/writing-tutor' : '/speaking-coach');
    const draft = page.getByLabel(service === 'writing' ? 'Your Essay *' : 'Your transcript', { exact: service === 'writing' });
    const prompt = page.getByLabel(service === 'writing' ? 'Writing task and source figures (required)' : 'Topic or question');
    await draft.fill('PRIVATE ORIGINAL DRAFT. '.repeat(8));
    await prompt.fill('PRIVATE ORIGINAL TASK about language learning.');
    const submit = page.getByRole('button', { name: service === 'writing' ? /Grade with AI/ : /Get transcript feedback/ });
    await submit.click(); await startedGate;
    await changeAccount(); release();
    await page.waitForFunction(id => document.getElementById(id)?.value === '', service === 'writing' ? 'writing-essay' : 'speaking-transcript');
    assert(await draft.inputValue() === '', service + ' clears old-account draft');
    assert(await prompt.inputValue() === '', service + ' clears old-account task');
    assert(!await page.getByText('PRIVATE LATE FEEDBACK', { exact: true }).count(), service + ' rejects late feedback');
    assert(await submit.isDisabled(), service + ' cannot submit the previous account draft');
    results.push({ case: service + '-account-change-clears-private-data-and-cancels-delayed-feedback', passed: true });
  }
  await signIn('/speaking-coach');
  const separate = page.getByRole('button', { name: 'Start a separate request' });
  await separate.waitFor(); await separate.click();
  const transcript = page.getByLabel('Your transcript', { exact: false });
  await transcript.fill('PRIVATE ORIGINAL TRANSCRIPT.');
  await page.getByRole('button', { name: 'Start dictation' }).click();
  await page.evaluate(() => { window.lateSpeechResult = window.speechQa.current.onresult; });
  await changeAccount();
  await page.waitForFunction(() => document.getElementById('speaking-transcript')?.value === '');
  await page.evaluate(() => window.lateSpeechResult({ results: [{ isFinal: true, 0: { transcript: 'PRIVATE DELAYED DICTATION' } }] }));
  assert(await transcript.inputValue() === '', 'late speech event cannot restore the old-account transcript');
  assert(await page.evaluate(() => window.speechQa.aborts) > 0, 'account change aborts microphone');
  await page.getByRole('button', { name: 'Start dictation' }).waitFor();
  results.push({ case: 'account-change-detaches-late-dictation-and-stops-microphone', passed: true });
  return { checkedAt: new Date().toISOString(), environment: 'localhost synthetic account and speech events only', results };
}
