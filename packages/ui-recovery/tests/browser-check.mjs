// Run with playwright-cli run-code --filename against recovery-preview.mjs.
// CLI-only browser QA; the preview must be isolated from production services.
export default async (page, origin) => {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await page.goto(origin);
  const apps = await page.getByRole('link').evaluateAll(links => links.map(link => ({ app: link.textContent, href: link.getAttribute('href') })));
  assert(apps.length === 13, 'Expected every deployed frontend in the fixture inventory');
  const results = [];
  const consoleMessages = [];
  const onConsole = message => consoleMessages.push(message.text());
  page.on('console', onConsole);
  try {
    for (const { app, href } of apps) {
      await page.evaluate(() => { sessionStorage.removeItem('recovery-fixture-healthy'); localStorage.setItem('schood.locale', 'en'); localStorage.setItem('recovery-preserved', 'keep'); });
      consoleMessages.length = 0;
      await page.goto(origin + href);
      await page.locator('.schood-recovery__reference').waitFor();
      const heading = page.getByRole('heading', { level: 1 });
      const focused = await heading.evaluate(node => node === document.activeElement);
      assert(focused, app + ': recovery heading must receive focus');
      const body = await page.locator('body').innerText();
      assert(!body.includes('SYNTHETIC_PRIVATE_ERROR') && !body.includes('SecretFixture'), app + ': private error rendered');
      assert(body.includes('had not finished saving'), app + ': missing unsaved-work guidance');
      const reference = await page.locator('.schood-recovery__reference span').innerText();
      assert(/^UI-[0-9a-f-]{36}$/.test(reference), app + ': missing support reference');
      assert(consoleMessages.some(message => message.includes(reference)), app + ': diagnostic reference is not correlated');
      assert(!consoleMessages.some(message => message.includes('SYNTHETIC_PRIVATE_ERROR')), app + ': raw production error logged');
      await page.keyboard.press('Tab');
      assert(await page.getByRole('button', { name: /Reload/ }).evaluate(node => node === document.activeElement), app + ': reload keyboard focus');
      await page.keyboard.press('Tab');
      const homeLink = page.getByRole('link', { name: app === 'english-hub' ? 'Learning centre' : 'Go to home page' });
      assert(await homeLink.evaluate(node => node === document.activeElement), app + ': home keyboard focus');
      for (const width of [320, 390, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), app + ': horizontal overflow at ' + width);
        if (app === 'platform' && width !== 390) await page.screenshot({ path: `supabase/.temp/ui-recovery/recovery-${width}.png`, fullPage: true });
      }
      await page.addScriptTag({ path: 'node_modules/axe-core/axe.min.js' });
      const accessibility = await page.evaluate(async () => (await axe.run('.schood-recovery', { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } })).violations.map(item => item.id));
      assert(accessibility.length === 0, app + ': accessibility violations ' + accessibility.join(', '));
      const homeUrl = new URL(await homeLink.getAttribute('href'), origin).href;
      await homeLink.click();
      assert(page.url() === homeUrl, app + ': home link did not navigate');
      await page.goto(origin + href);
      await page.locator('.schood-recovery__reference').waitFor();
      await page.evaluate(() => sessionStorage.setItem('recovery-fixture-healthy', 'true'));
      await page.getByRole('button', { name: /Reload/ }).click();
      await page.waitForFunction(() => document.getElementById('root')?.textContent.includes('Recovered application'));
      assert(await page.evaluate(() => localStorage.getItem('recovery-preserved') === 'keep'), app + ': recovery cleared storage');
      results.push({ app, status: 'passed', widths: [320, 390, 1280], privacy: true, reference: true, keyboard: true, reload: true, home: true, scopedAxe: true });
    }
    for (const [lang, title] of [['uz', 'Sahifani yuklab bo‘lmadi'], ['ru', 'Не удалось загрузить страницу']]) {
      await page.evaluate(lang => { sessionStorage.removeItem('recovery-fixture-healthy'); localStorage.setItem('schood.locale', lang); }, lang);
      await page.goto(origin + '/platform/');
      await page.getByRole('heading', { name: title }).waitFor();
      assert(await page.locator('.schood-recovery').getAttribute('lang') === lang, lang + ': incorrect recovery language');
      results.push({ app: 'platform', locale: lang, status: 'passed' });
    }
    await page.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new Error('Storage denied'); } }));
    await page.goto(origin + '/sat-practice/?lang=uz');
    await page.getByRole('heading', { name: 'Sahifani yuklab bo‘lmadi' }).waitFor();
    results.push({ app: 'sat-practice', storageDenied: true, queryLocale: 'uz', status: 'passed' });
    return { checkedAt: new Date().toISOString(), mode: 'isolated real production entrypoints with controlled render failure; non-local requests blocked', results };
  } finally { page.off('console', onConsole); }
}
