import { assertEquals } from 'jsr:@std/assert@1';
import { CHECK_SCORES_PER_DAY, routes as site, LEADS_PER_DAY } from './site.ts';
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

Deno.test('requests sent at the same moment cannot pass the daily allowance', async () => {
  const db = new FakeDb();
  const handler = createCompanyHandler({ db, routes: site, origins: [], env: TEST_ENV, ai: noAi, userFromToken: () => Promise.resolve(null) });
  const send = (path: string, body: unknown) => handler(new Request(`https://x.supabase.co/functions/v1/company/${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.9' }, body: JSON.stringify(body),
  })).then((response) => response.status);
  const leads = await Promise.all(Array.from({ length: 40 }, (_, index) => send('public/leads', { ...lead, company: `Parallel ${index}` })));
  assertEquals(leads.filter((status) => status === 200).length, LEADS_PER_DAY);
  assertEquals(db.rows('company_leads').length, LEADS_PER_DAY);
  const scores = await Promise.all(Array.from({ length: 90 }, () => send('public/check/score', { answers: { g1: 1 } })));
  assertEquals(scores.filter((status) => status === 200).length, CHECK_SCORES_PER_DAY);
  assertEquals(db.rows('company_check_runs').filter((row) => row.kind === 'score').length, CHECK_SCORES_PER_DAY);
});

Deno.test('a request with no fill time is treated like a bot, and a public lead cannot claim a reserved source', async () => {
  const { db, call } = setup();
  const { elapsed_ms: _elapsed, ...untimed } = lead;
  assertEquals((await call('POST', 'public/leads', { body: untimed })).body.ok, true);
  assertEquals((await call('POST', 'public/leads', { body: { ...lead, elapsed_ms: -5 } })).body.ok, true);
  assertEquals((await call('POST', 'public/leads', { body: { ...lead, elapsed_ms: 'soon' } })).body.ok, true);
  assertEquals(db.rows('company_leads').length, 0);
  await call('POST', 'public/leads', { body: { ...lead, company: 'Spoof Co', source: 'company_seats' } });
  await call('POST', 'public/leads', { body: { ...lead, company: 'Guide Co', source: 'guide:front-desk' } });
  await call('POST', 'public/leads', { body: { ...lead, company: 'Odd Co', source: 'Invented Source' } });
  const sources = Object.fromEntries(db.rows('company_leads').map((row) => [row.company, row.source]));
  assertEquals(sources, { 'Spoof Co': 'landing', 'Guide Co': 'guide:front-desk', 'Odd Co': 'landing' });
});

Deno.test('another site cannot make its visitors send a request; our own pages and servers can', async () => {
  const db = new FakeDb();
  const handler = createCompanyHandler({ db, routes: site, origins: ['https://company.schood.online'], env: TEST_ENV, ai: noAi, userFromToken: () => Promise.resolve(null) });
  const send = async (headers: Record<string, string>, company: string) => {
    const response = await handler(new Request('https://x.supabase.co/functions/v1/company/public/leads', { method: 'POST', headers, body: JSON.stringify({ ...lead, company }) }));
    return { status: response.status, body: await response.json() };
  };
  // A cross-site "simple" request: no preflight, text/plain body.
  const cross = await send({ Origin: 'https://evil.example', 'Content-Type': 'text/plain' }, 'Cross Co');
  assertEquals([cross.status, cross.body.code], [403, 'origin_not_allowed']);
  assertEquals((await send({ Origin: 'null', 'Content-Type': 'text/plain' }, 'Null Co')).status, 403);
  assertEquals((await send({ Origin: 'https://company.schood.online', 'Content-Type': 'application/json' }, 'Own Co')).status, 200);
  assertEquals((await send({ 'Content-Type': 'application/json' }, 'Server Co')).status, 200);
  assertEquals(db.rows('company_leads').map((row) => row.company).sort(), ['Own Co', 'Server Co']);
  // The preflight still answers, so the browser learns it may not.
  const preflight = await handler(new Request('https://x.supabase.co/functions/v1/company/public/leads', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } }));
  assertEquals(preflight.headers.get('Access-Control-Allow-Origin'), 'https://company.schood.online');
});
