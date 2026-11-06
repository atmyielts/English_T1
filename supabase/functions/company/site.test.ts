import { assertEquals } from 'jsr:@std/assert@1';
import { routes as site, LEADS_PER_DAY } from './site.ts';
import { createCompanyHandler } from './handler.ts';
import { FakeDb, noAi, TEST_ENV, testHandler } from './testing.ts';

const lead = { name: 'Dilnoza Karimova', company: 'Silk Road Hotels', job_title: 'HR director', phone: '+998 90 123 45 67', industry: 'hospitality', size_band: '201-1000', interests: ['hiring', 'training'], need: 'Test 40 receptionists', locale: 'uz', elapsed_ms: 12000 };

function setup() {
  const db = new FakeDb();
  return { db, call: testHandler(db, site) };
}

Deno.test('the lead form says what the free pilot includes', async () => {
  const { call } = setup();
  const form = await call('GET', 'public/leads/form');
  assertEquals([form.status, form.body.pilot_tests, form.body.self_serve], [200, 10, true]);
  assertEquals(form.body.interests, ['hiring', 'placement', 'training', 'reports']);
});

Deno.test('a demo request is validated and stored with the address hash, no sign-in needed', async () => {
  const { db, call } = setup();
  const sent = await call('POST', 'public/leads', { body: lead });
  assertEquals([sent.status, sent.body.ok], [200, true]);
  const row = db.rows('company_leads')[0];
  assertEquals([row.name, row.company, row.status, row.locale, row.source, row.job_title], ['Dilnoza Karimova', 'Silk Road Hotels', 'new', 'uz', 'landing', 'HR director']);
  assertEquals(row.interests, ['hiring', 'training']);
  assertEquals(typeof row.ip_hash, 'string');
  assertEquals(db.rows('company_audit')[0].action, 'lead.created');

  const bad = async (patch: Record<string, unknown>) => (await call('POST', 'public/leads', { body: { ...lead, ...patch } })).body;
  assertEquals((await bad({ name: 'D' })).field, 'name');
  assertEquals((await bad({ company: '' })).field, 'company');
  assertEquals((await bad({ email: 'not-an-email' })).field, 'email');
  assertEquals((await bad({ phone: 'call me' })).field, 'phone');
  assertEquals((await bad({ phone: null, email: null })).code, 'contact_required');
  assertEquals((await bad({ industry: 'mining' })).field, 'industry');
  assertEquals((await bad({ interests: ['payroll'] })).field, 'interests');
  assertEquals((await bad({ need: 'x'.repeat(2001) })).field, 'need');
  assertEquals((await call('POST', 'public/leads', { body: [] })).body.code, 'invalid_body');
  assertEquals(db.rows('company_leads').length, 1);
});

Deno.test('honeypot and too-fast submissions look successful but store nothing', async () => {
  const { db, call } = setup();
  assertEquals((await call('POST', 'public/leads', { body: { ...lead, website: 'http://spam.example' } })).body.ok, true);
  assertEquals((await call('POST', 'public/leads', { body: { ...lead, elapsed_ms: 400 } })).body.ok, true);
  assertEquals(db.rows('company_leads').length, 0);
});

Deno.test(`at most ${LEADS_PER_DAY} requests a day from one address`, async () => {
  const db = new FakeDb();
  const handler = createCompanyHandler({ db, routes: site, origins: [], env: TEST_ENV, ai: noAi, userFromToken: () => Promise.resolve(null) });
  const send = async (address: string) => {
    const response = await handler(new Request('https://x.supabase.co/functions/v1/company/public/leads', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': address }, body: JSON.stringify(lead),
    }));
    return { status: response.status, body: await response.json() };
  };
  for (let index = 0; index < LEADS_PER_DAY; index++) assertEquals((await send('203.0.113.7')).status, 200);
  const blocked = await send('203.0.113.7');
  assertEquals([blocked.status, blocked.body.code], [429, 'too_many_requests']);
  assertEquals((await send('198.51.100.2')).status, 200);
  assertEquals(db.rows('company_leads').length, LEADS_PER_DAY + 1);
});
