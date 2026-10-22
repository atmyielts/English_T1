import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const course = {
  slug: 'ielts-evening-a1b2c3',
  headline: 'IELTS 7+ evening group',
  summary: 'Three evenings a week with weekly mock tests and homework checked in Telegram.',
  format: 'blended',
  city: 'Tashkent',
  language: 'uz',
  level: 'B1–B2',
  price_text: '450 000 so‘m / month',
  schedule_text: 'Mon, Wed, Fri 18:30',
  starts_on: '2026-11-03',
  seats: 12,
  teacher_name: 'Dilnoza Karimova',
  course: { title: 'IELTS 7+', description: null, estimated_minutes: 2400, modules: [{ title: 'Listening and reading', lessons: 8 }, { title: 'Writing Task 2', lessons: 6 }] },
  provider: { name: 'Alpha Education Centre', kind: 'centre' },
  results: { learners: 42, completion_percent: 81 },
};

const mockCatalog = async (page: Page, leads: Record<string, unknown>[]) => {
  await page.route('**/functions/v1/academy-learning', async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    if (body.action === 'public_courses') return route.fulfill({ json: { courses: String(body.query ?? '').includes('zzz') ? [] : [course] } });
    if (body.action === 'public_course') return route.fulfill({ json: { course } });
    if (body.action === 'public_course_lead') { leads.push(body); return route.fulfill({ json: { ok: true } }); }
    return route.fulfill({ status: 400, json: { error: 'Unknown action' } });
  });
};

test('course catalogue lists courses, opens one and sends a request on a phone', async ({ page }) => {
  const leads: Record<string, unknown>[] = [];
  await mockCatalog(page, leads);
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('/courses');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByText('IELTS 7+ evening group')).toBeVisible();
  await expect(page.getByText('450 000 so‘m / month')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await mkdir(resolve('test-results'), { recursive: true });
  await page.screenshot({ path: resolve('test-results/courses-list-phone.png'), fullPage: true });

  await page.getByText('IELTS 7+ evening group').click();
  await expect(page).toHaveURL(/\/courses\/ielts-evening-a1b2c3$/);
  await expect(page.getByText('81%')).toBeVisible();
  await expect(page.getByText('Writing Task 2')).toBeVisible();
  const send = page.getByRole('button', { name: /request|so‘rov|заявк/i });
  await expect(send).toBeDisabled();
  await page.locator('form input').nth(0).fill('Aziza');
  await page.locator('form input').nth(1).fill('+998 90 123 45 67');
  await send.click();
  await expect.poll(() => leads.length).toBe(1);
  expect(leads[0]).toMatchObject({ action: 'public_course_lead', slug: 'ielts-evening-a1b2c3', full_name: 'Aziza', phone: '+998 90 123 45 67' });
  expect(String(leads[0].request_id)).toMatch(/^[0-9a-f-]{36}$/);
  await expect(page.getByRole('status')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: resolve('test-results/courses-detail-phone.png'), fullPage: true });
});

test('course catalogue shows an empty state for searches with no match', async ({ page }) => {
  await mockCatalog(page, []);
  await page.goto('/courses');
  await page.getByRole('textbox').first().fill('zzz');
  await expect(page.getByText(/No courses|Hozircha mos|Подходящих/)).toBeVisible();
});
