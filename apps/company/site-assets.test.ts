import { assert, assertEquals } from 'jsr:@std/assert@1';
import { companySiteAssets, COMPANY_ICON } from './site-assets.ts';
import { GUIDE_ROLES, PUBLIC_PATHS, SITE_URL } from './src/areas/site/catalog.ts';
import { JOB_ROLES } from '../../packages/company-core/src/mod.ts';
import { guideEn } from './src/i18n/site.guide.en.ts';
import { guideRu } from './src/i18n/site.guide.ru.ts';
import { guideUz } from './src/i18n/site.guide.uz.ts';
import { calculate, type CalcInput } from './src/areas/site/calc.ts';

Deno.test('every job-role guide has translated content and appears in the sitemap', () => {
  assertEquals(GUIDE_ROLES, JOB_ROLES);
  assertEquals(new Set(PUBLIC_PATHS).size, PUBLIC_PATHS.length);
  const assets = companySiteAssets();
  for (const role of JOB_ROLES) {
    for (const guide of [guideEn, guideRu, guideUz]) {
      const page = guide.roles[role];
      assert(page.metaTitle && page.metaDescription && page.title && page.lead, role);
      assert(page.positions.length >= 2 && page.tasks.length >= 3 && page.test, role);
    }
    for (const language of ['en', 'ru', 'uz']) assert(assets['sitemap.xml'].includes(`<loc>${SITE_URL}/guide/${role.replaceAll('_', '-')}?lang=${language}</loc>`), `${role}/${language}`);
  }
  assertEquals((assets['sitemap.xml'].match(/<loc>/g) ?? []).length, PUBLIC_PATHS.length * 3);
  assert(!assets['sitemap.xml'].includes('/w/'));
  assert(!assets['sitemap.xml'].includes('/staff'));
});

Deno.test('manifest uses an included brand asset and robots points to the published sitemap', () => {
  const assets = companySiteAssets(), manifest = JSON.parse(assets['manifest.webmanifest']);
  assertEquals(manifest.icons[0].src, COMPANY_ICON);
  assertEquals(manifest.display, 'standalone');
  assertEquals(manifest.scope, '/');
  assert(assets['robots.txt'].includes(`Sitemap: ${SITE_URL}/sitemap.xml`));
});

Deno.test('value calculations use only supplied amounts and never display infinite results', () => {
  const input: CalcInput = { people: 10, spend: 1000, leavers: 2, costPerLeaver: 300, hoursPerWeek: 1, weeks: 4, hourlyCost: 10, quote: 500, avoidablePercent: 50 };
  const result = calculate(input);
  assertEquals([result.spendPerPerson, result.turnoverCost, result.timeCost, result.saving, result.net], [100, 600, 400, 500, 0]);
  assertEquals(calculate({ ...input, people: null }).spendPerPerson, null);
  assertEquals(calculate({ ...input, people: 0 }).spendPerPerson, null);
  const extreme = calculate({ ...input, people: 1e300, hoursPerWeek: 1e300, quote: 1e300, costPerLeaver: 1e-300 });
  assert(Object.values(extreme).every((value) => value === null || Number.isFinite(value)));
});
