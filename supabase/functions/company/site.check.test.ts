import { assert, assertEquals } from 'jsr:@std/assert@1';
import { LEVELS, type Level } from '../../../packages/company-core/src/mod.ts';
import { checkItems, checkPassages, CHECK_SKILLS, publicCheck, readAnswers, scoreCheck } from './site/check.ts';
import { CHECK_OPENS_PER_DAY, CHECK_SCORES_PER_DAY, routes as site } from './site.ts';
import { createCompanyHandler } from './handler.ts';
import { FakeDb, noAi, TEST_ENV, testHandler } from './testing.ts';

const allRight = () => Object.fromEntries(checkItems().map((item) => [item.id, item.answer]));
const allWrong = () => Object.fromEntries(checkItems().map((item) => [item.id, (item.answer + 1) % item.options.length]));
const lead = { name: 'Dilnoza Karimova', company: 'Silk Road Hotels', phone: '+998 90 123 45 67', locale: 'ru', elapsed_ms: 12000 };

Deno.test('the check bank is 15 well-formed questions across four skills', () => {
  const items = checkItems();
  assertEquals(items.length, 15);
  assertEquals(new Set(items.map((item) => item.id)).size, 15);
  const passages = new Set(checkPassages().map((passage) => passage.id));
  for (const item of items) {
    assert(item.answer >= 0 && item.answer < item.options.length, item.id);
    assertEquals(new Set(item.options).size, item.options.length, item.id);
    if (item.passage) assert(passages.has(item.passage), item.id);
  }
  for (const skill of CHECK_SKILLS) assert(items.some((item) => item.skill === skill), skill);
});

Deno.test('the public check never sends the keys', async () => {
  const db = new FakeDb();
  const opened = await testHandler(db, site)('GET', 'public/check');
  assertEquals(opened.status, 200);
  assertEquals(opened.body.items.length, 15);
  assert(!JSON.stringify(publicCheck().items).includes('"answer"'));
  assert(opened.body.items.every((item: Record<string, unknown>) => !('answer' in item)));
});

Deno.test('climbing the ladder lands on the real score floors, and a short check tops out at C1', () => {
  const up = (levels: string[]) => {
    const answers = new Map<string, number>();
    for (const item of checkItems()) answers.set(item.id, levels.includes(item.level) ? item.answer : (item.answer + 1) % item.options.length);
    return scoreCheck(answers);
  };
  assertEquals(up([]).overall.level, 'pre_a1');
  assertEquals(up(['a2']).overall.level, 'a2');
  assertEquals(up(['a2', 'b1']).overall.level, 'b1');
  assertEquals(up(['a2', 'b1', 'b2']).overall.level, 'b2');
  assertEquals(up(['a2', 'b1', 'b2', 'c1']).overall.level, 'c1');
  const best = up(['a2', 'b1', 'b2', 'c1']);
  assertEquals(best.skills.listening.level, 'b2');
  assertEquals(best.skills.grammar.correct, 4);
  assert(best.estimate);
});

Deno.test('scoring a check stores no person and no answers, only the level', async () => {
  const db = new FakeDb();
  const call = testHandler(db, site);
  const scored = await call('POST', 'public/check/score', { body: { answers: allRight() } });
  assertEquals(scored.status, 200);
  assertEquals(scored.body.overall.level, 'c1');
  assertEquals(scored.body.review.length, 15);
  assert(LEVELS.includes(scored.body.skills.reading.level as Level));
  const rows = db.rows('company_check_runs');
  assertEquals(rows.length, 1);
  assertEquals(Object.keys(rows[0]).sort().filter((key) => !['id', 'created_at', 'updated_at'].includes(key)), ['ip_hash', 'kind', 'level']);
  assertEquals(db.rows('company_leads').length, 0);
});

Deno.test('bad answers are refused, and an empty check asks for an answer', async () => {
  const call = testHandler(new FakeDb(), site);
  const send = async (answers: unknown) => (await call('POST', 'public/check/score', { body: { answers } })).body;
  assertEquals((await send({})).code, 'check_empty');
  assertEquals((await send([])).field, 'answers');
  assertEquals((await send({ nope: 1 })).field, 'answers');
  assertEquals((await send({ g1: 9 })).field, 'answers');
  assertEquals((await send({ g1: 1.5 })).field, 'answers');
  assertEquals((await send({ g1: '1' })).field, 'answers');
  assertEquals(readAnswers({ g1: 0 }).get('g1'), 0);
});

Deno.test('the check is rate limited per address, for opening and for scoring', async () => {
  const db = new FakeDb();
  const handler = createCompanyHandler({ db, routes: site, origins: [], env: TEST_ENV, ai: noAi, userFromToken: () => Promise.resolve(null) });
  const send = async (path: string, address: string, body?: unknown) => {
    const response = await handler(new Request(`https://x.supabase.co/functions/v1/company/${path}`, {
      method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': address }, ...(body ? { body: JSON.stringify(body) } : {}),
    }));
    return { status: response.status, body: await response.json() };
  };
  for (let index = 0; index < CHECK_SCORES_PER_DAY; index++) assertEquals((await send('public/check/score', '203.0.113.7', { answers: { g1: 1 } })).status, 200);
  const blocked = await send('public/check/score', '203.0.113.7', { answers: { g1: 1 } });
  assertEquals([blocked.status, blocked.body.code], [429, 'check_too_many']);
  assertEquals((await send('public/check/score', '198.51.100.2', { answers: { g1: 1 } })).status, 200);
  for (let index = 0; index < CHECK_OPENS_PER_DAY; index++) assertEquals((await send('public/check', '203.0.113.9')).status, 200);
  assertEquals((await send('public/check', '203.0.113.9')).status, 429);
});

Deno.test('old check rows are deleted as new ones arrive', async () => {
  const db = new FakeDb({ company_check_runs: [{ id: 1, kind: 'score', ip_hash: 'old', level: 'a2', created_at: '2020-01-01T00:00:00Z' }] });
  await testHandler(db, site)('POST', 'public/check/score', { body: { answers: { g1: 1 } } });
  assertEquals(db.rows('company_check_runs').filter((row) => row.ip_hash === 'old').length, 0);
});

Deno.test('a lead from the check stores the estimate scored on the server, not what the client claims', async () => {
  const db = new FakeDb();
  const call = testHandler(db, site);
  const sent = await call('POST', 'public/leads', { body: { ...lead, source: 'check', check_answers: allWrong(), check_result: { overall: { level: 'c2' } } } });
  assertEquals(sent.status, 200);
  const row = db.rows('company_leads')[0] as Record<string, Record<string, Record<string, unknown>>>;
  assertEquals(row.check_result.overall.level, 'pre_a1');
  assert(!JSON.stringify(row.check_result).includes('review'));
  assertEquals((await call('POST', 'public/leads', { body: { ...lead, check_answers: { nope: 1 } } })).body.field, 'answers');
});

Deno.test('a lead without a check has no estimate', async () => {
  const db = new FakeDb();
  await testHandler(db, site)('POST', 'public/leads', { body: lead });
  assertEquals(db.rows('company_leads')[0].check_result, null);
});

Deno.test('UTM, landing page and referrer reach the lead; odd values are cut down, never refused', async () => {
  const db = new FakeDb();
  const call = testHandler(db, site);
  const sent = await call('POST', 'public/leads', { body: {
    ...lead, source: 'industry:hotels',
    utm: { source: 'telegram', medium: 'post', campaign: 'x'.repeat(500), term: 'bad\u0000value', content: 42, extra: 'dropped' },
    landing_path: '/for/hotels?secret=1#top', referrer_host: 'Example.COM',
  } });
  assertEquals(sent.status, 200);
  const row = db.rows('company_leads')[0];
  assertEquals([row.source, row.utm_source, row.utm_medium, row.utm_term, row.utm_content], ['industry:hotels', 'telegram', 'post', 'badvalue', null]);
  assertEquals(String(row.utm_campaign).length, 120);
  assertEquals([row.landing_path, row.referrer_host], ['/for/hotels', 'example.com']);
  assert(!('extra' in row));

  await call('POST', 'public/leads', { body: { ...lead, utm: 'nope', landing_path: 'https://evil.example/x', referrer_host: 'https://evil.example/path?q=1' } });
  const second = db.rows('company_leads')[1];
  assertEquals([second.utm_source, second.landing_path, second.referrer_host], [null, null, null]);
});

Deno.test('a preferred time is validated, in Tashkent days', async () => {
  const db = new FakeDb();
  const now = new Date('2030-03-10T20:00:00Z'); // Already the 11th in Tashkent.
  const call = testHandler(db, site, { now: () => now });
  const good = await call('POST', 'public/leads', { body: { ...lead, preferred_day: '2030-03-11', preferred_slot: 'morning', preferred_channel: 'telegram' } });
  assertEquals(good.status, 200);
  const row = db.rows('company_leads')[0];
  assertEquals([row.preferred_day, row.preferred_slot, row.preferred_channel], ['2030-03-11', 'morning', 'telegram']);
  const bad = async (patch: Record<string, unknown>) => (await call('POST', 'public/leads', { body: { ...lead, ...patch } })).body;
  assertEquals((await bad({ preferred_day: '2030-02-31' })).field, 'preferred_day');
  assertEquals((await bad({ preferred_day: '2030-03-10' })).code, 'preferred_day_range');
  assertEquals((await bad({ preferred_day: '2031-01-01' })).code, 'preferred_day_range');
  assertEquals((await bad({ preferred_slot: 'midnight' })).field, 'preferred_slot');
  assertEquals((await bad({ preferred_channel: 'pigeon' })).field, 'preferred_channel');
  assertEquals(db.rows('company_leads').length, 1);
});
