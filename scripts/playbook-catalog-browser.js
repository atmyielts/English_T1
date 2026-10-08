// Actual local frontends with synthetic service replies; all external traffic intercepted.
async (page) => {
  const checks = [], errors = [], assert = (v, message) => { if (!v) throw Error(message); };
  page.on('pageerror', e => errors.push(e.message));
  for (const [service, port] of [['sat', 4294], ['toefl', 4395]]) {
    const origin = 'http://127.0.0.1:' + port;
    let mode = 'empty', missing = true, delayed = null, held = false, onHold = () => {};
    const catalog = () => ({ modules: mode === 'empty' ? [] : [{ id: 'qa-one', slug: 'reviewed-module', title: 'Reviewed QA module', summary: 'Synthetic published metadata' }, { id: 'qa-two', slug: 'second-module', title: 'Second QA module', summary: 'Synthetic second module' }], premium_guides: mode === 'empty' ? [] : [{id:'qa-guide',slug:'premium-guide',title:'QA premium guide',summary:'Synthetic public metadata'}] });
    await page.context().clearCookies();
    await page.unrouteAll({ behavior: 'wait' });
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.pathname.startsWith('/auth/v1/')) return route.fulfill({ json: {} });
      if (url.pathname.endsWith('/catalog')) {
        if (mode === 'failure') return route.fulfill({ status: 503, json: { error: 'PRIVATE INTERNAL DETAIL' } });
        if (mode === 'malformed') return route.fulfill({ json: { modules: null, premium_guides: [] } });
        if (mode === 'malformed-summary') return route.fulfill({json:{modules:[{id:'qa-bad',slug:'bad-summary',title:'Bad summary',summary:{private:'detail'}}],premium_guides:[]}});
        if (mode === 'unsafe') return route.fulfill({ json: { modules: [{ id: 'qa-bad', slug: '../auth', title: 'Bad link' }], premium_guides: [] } });
        if (mode === 'slow') { await new Promise(resolve => { delayed = resolve; held = true; onHold(); }); }
        return route.fulfill({ json: catalog() }).catch(() => {});
      }
      if (url.pathname.endsWith('/events')) return route.fulfill({ status: 503, json: { error: 'Synthetic analytics outage' } });
      if (url.pathname.startsWith('/functions/v1/') && url.pathname.includes('/pages/')) {
        if (url.pathname.endsWith('/missing-module') && missing) return route.fulfill({ status: 404, json: { error: 'Page not found' } });
        if ((url.pathname.endsWith('/reviewed-module') && mode === 'stale') || (url.pathname.endsWith('/slow-page') && mode === 'slow-page')) { await new Promise(resolve => { delayed = resolve; held = true; onHold(); }); }
        return route.fulfill({ json: { page: { id: 'qa-page', title: url.pathname.endsWith('/second-module') ? 'Second QA module' : 'Recovered QA page', summary: 'Synthetic content', page_type: 'module' }, sections: [], child_pages: [], sources: [] } }).catch(() => {});
      }
      if (url.pathname.startsWith('/functions/v1/')) return route.fulfill({ json: {} });
      return url.origin === origin ? route.continue() : route.abort();
    });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(origin + '/modules');
    await page.getByText('No strategy modules have been published yet.', { exact: false }).waitFor();
    assert(await page.locator('main .feature-card').count() === 0, 'Empty catalog invented a module');
    checks.push({ service, case: 'empty-public-catalog-honest-no-invented-modules', passed: true });
    mode = 'failure'; await page.reload();
    await page.getByRole('alert').waitFor();
    assert(!(await page.locator('main').innerText()).includes('PRIVATE INTERNAL DETAIL'), 'Internal service detail exposed');
    mode = 'populated'; await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await page.getByRole('link', { name: 'Reviewed QA module', exact: false }).waitFor();
    await page.getByRole('link', { name: 'Reviewed QA module', exact: false }).click();
    await page.getByRole('heading', { name: 'Recovered QA page', exact: true }).waitFor();
    checks.push({ service, case: 'catalog-outage-retry-and-actual-published-slug-navigation', passed: true });
    await page.goto(origin + '/missing-module');
    await page.getByRole('heading', { name: 'Page unavailable', exact: true }).waitFor();
    assert(await page.locator('[role="status"]').count() === 0 && await page.getByRole('link', { name: 'Use in my plan', exact: true }).count() === 0, 'Missing page retained loading or purchase action');
    missing = false; await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await page.getByRole('heading', { name: 'Recovered QA page', exact: true }).waitFor();
    checks.push({ service, case: 'missing-content-terminal-state-explicit-retry-recovers', passed: true });
    for (const bad of ['malformed', 'unsafe', 'malformed-summary']) {
      mode = bad; await page.goto(origin + '/modules'); await page.getByRole('alert').waitFor();
      assert(await page.locator('main .feature-card').count() === 0, 'Malformed catalog rendered unsafe link or empty success');
    }
    checks.push({ service, case: 'malformed-catalog-and-unsafe-slug-fail-closed-with-retry', passed: true });
    mode = 'stale'; held = false; await page.reload();
    const staleHeld = new Promise(resolve => { onHold = resolve; });
    await page.getByRole('link', { name: 'Reviewed QA module', exact: false }).click();
    await staleHeld;
    assert(held && delayed, 'Stale reply control missing');
    await page.getByRole('navigation').getByRole('link', { name: 'Modules', exact: true }).click();
    await page.getByRole('link', { name: 'Second QA module', exact: false }).click();
    await page.getByRole('heading', { name: 'Second QA module', exact: true }).waitFor();
    delayed(); delayed = null;
    assert(await page.getByRole('heading', { name: 'Recovered QA page', exact: true }).count() === 0, 'Old response replaced newer route');
    checks.push({ service, case: 'cancelled-old-content-cannot-replace-new-route', passed: true });
    mode = 'slow'; held = false; await page.clock.install();
    const slowHeld = new Promise(resolve => { onHold = resolve; });
    await page.goto(origin + '/modules'); await slowHeld;
    assert(held && delayed, 'Timeout response control missing');
    await page.clock.fastForward(13000); await page.getByRole('alert').waitFor();
    assert((await page.getByRole('alert').innerText()).includes('taking too long'), 'Slow catalog hung indefinitely');
    mode = 'populated'; delayed(); delayed = null;
    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await page.getByRole('link', { name: 'Second QA module', exact: false }).waitFor();
    await page.clock.resume();
    checks.push({ service, case: 'hung-read-times-out-and-user-retry-recovers', passed: true });
    mode = 'slow-page'; held = false;
    const contentHeld = new Promise(resolve => { onHold = resolve; });
    await page.goto(origin + '/slow-page'); await contentHeld;
    await page.clock.fastForward(13000); await page.getByRole('alert').waitFor();
    assert((await page.getByRole('alert').innerText()).includes('taking too long'), 'Slow page hung indefinitely');
    mode = 'populated'; delayed(); delayed = null;
    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await page.getByRole('heading', { name: 'Recovered QA page', exact: true }).waitFor();
    await page.clock.resume();
    checks.push({ service, case: 'hung-content-read-times-out-and-explicit-retry-recovers', passed: true });
    await page.goto(origin + '/modules'); await page.getByRole('link', {name:'QA premium guide',exact:false}).waitFor();
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Catalog viewport overflow at ' + width);
      if (width === 390) {
        await page.addScriptTag({path:'node_modules/axe-core/axe.min.js'});
        const violations = await page.evaluate(async () => (await window.axe.run('main',{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,impact:v.impact})));
        assert(violations.length === 0,'Catalog accessibility violations: '+JSON.stringify(violations));
      }
      if (width === 390 || width === 1280) await page.screenshot({ path: 'docs/customer-readiness/2026-10-08-' + service + '-playbook-catalog-' + width + '.png', fullPage: true });
    }
    checks.push({ service, case: 'populated-public-catalog-fits-mobile-tablet-desktop-and-scoped-axe-clean', passed: true });
  }
  assert(errors.length === 0, 'Unhandled browser error: ' + errors.join('; '));
  return { checkedAt: new Date().toISOString(), syntheticApi: true, productionContacted: false, checks, unhandledPageErrors: errors.length };
}
