// Run with the Playwright CLI against the local preview, never production.
async (page) => {
  const errors = [], results = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  const base = 'http://127.0.0.1:5196';
  const workspace = '/w/7a0f5c1e-0000-4000-8000-00000000c0de';
  const cases = [
    ['/', 'owner'], ['/check', 'signedout'], ['/guide', 'signedout'],
    ['/guide/government', 'signedout'], ['/guide/restaurant', 'signedout'],
    ['/guide/procurement', 'signedout'], ['/guide/accounting-audit', 'signedout'],
    ['/calculator', 'signedout'], ['/for/hotels', 'signedout'], ['/solutions/hiring', 'signedout'], ['/help', 'signedout'],
    [workspace, 'owner'], [`${workspace}/people`, 'owner'], [`${workspace}/hiring`, 'owner'],
    [`${workspace}/skills-gap`, 'owner'], [`${workspace}/connect`, 'owner'],
    [`${workspace}/builder`, 'owner'], [`${workspace}/today`, 'employee'],
  ];
  for (const [width, height] of [[1280, 800], [390, 844]]) {
    await page.setViewportSize({ width, height });
    for (const locale of ['ru', 'uz', 'en']) {
      for (const [path, persona] of cases) {
        await page.goto(`${base}${path}?as=${persona}&lang=${locale}`, { waitUntil: 'networkidle' });
        const result = await page.evaluate(() => ({
          title: document.title,
          overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
          heading: document.querySelector('h1')?.textContent?.trim() ?? '',
          alerts: [...document.querySelectorAll('[role="alert"]')].map((node) => node.textContent),
        }));
        results.push({ path, locale, width, ...result });
        if (path === '/' && locale === 'ru') await page.screenshot({ path: `output/playwright/company-v2-ru-${width}.png`, fullPage: false });
      }
    }
  }
  const failures = results.filter((row) => row.overflow || !row.heading || row.alerts.length || /not found|не найдена|не найден|topilmadi/i.test(row.heading));
  const report = { views: results.length, errors, failures };
  console.log(JSON.stringify(report));
  if (errors.length || failures.length) throw new Error(JSON.stringify(report));
  return report;
}
