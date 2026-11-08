// The applicant tracking layer: role templates, per-skill minimums, bulk candidates with
// personal links, pipeline and funnel, notes, messages, share links, interview kits,
// retention and the HR test preview.
import { assert, assertEquals, assertNotEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import { JOB_ROLES, LEVELS, SKILLS } from '../../../packages/company-core/src/mod.ts';
import { parseCandidates } from '../../../apps/company/src/areas/hiring/candidates.ts';
import { hiringEn } from '../../../apps/company/src/i18n/hiring.en.ts';
import { hiringRu } from '../../../apps/company/src/i18n/hiring.ru.ts';
import { hiringUz } from '../../../apps/company/src/i18n/hiring.uz.ts';
import { routes as core } from './core.ts';
import { routes as hiring } from './hiring.ts';
import { CHOICES, QUESTIONS } from './hiring/bank/index.ts';
import { benchmark, byFit, funnel, median, weakSkills } from './hiring/benchmark.ts';
import { pageIds, type Section } from './hiring/engine.ts';
import { bankKit, parseKit } from './hiring/interview.ts';
import { ROLE_QUESTIONS, SKILL_QUESTIONS } from './hiring/interviewBank.ts';
import { DEFAULT_TEMPLATES, MESSAGE_KINDS, MESSAGE_LOCALES, fill, readTemplates, renderMessage } from './hiring/messages.ts';
import { ROLE_TEMPLATES, templateSkills } from './hiring/roleTemplates.ts';
import { FakeDb, testHandler } from './testing.ts';
import type { AiCall } from './types.ts';
import { sha256 } from './util.ts';

const OWNER = '00000000-0000-4000-8000-0000000000b1';
const HR = '00000000-0000-4000-8000-0000000000b2';
const MANAGER = '00000000-0000-4000-8000-0000000000b3';
const EMPLOYEE = '00000000-0000-4000-8000-0000000000b4';
const FOREIGN_HR = '00000000-0000-4000-8000-0000000000b5';
const ORG = '00000000-0000-4000-8000-00000000c0c0';
const FOREIGN = '00000000-0000-4000-8000-00000000c0c1';
const MINUTE = 60_000, DAY = 86_400_000;

const member = (org: string, user: string, role: string) => ({ id: crypto.randomUUID(), org_id: org, user_id: user, email: `${user.slice(-2)}@x.uz`, full_name: `Person ${user.slice(-2)}`, role, department_id: null, job_role: 'hospitality', status: 'active', seat: false, consent_at: null, joined_at: '2026-01-01T00:00:00Z' });

function world(options: { ai?: 'ok' | 'down'; hits?: number } = {}) {
  const orgRow = (id: string, name: string) => ({ id, name, industry: 'hospitality', size_band: '51-200', status: 'active', seats_limit: 0, tests_limit: 100, tests_used: 0, contract_ends_at: null as string | null, settings: { locale: 'ru' }, created_at: '2026-01-01T00:00:00Z' });
  const db = new FakeDb({
    users: [OWNER, HR, MANAGER, EMPLOYEE, FOREIGN_HR].map((id) => ({ id, role: 'user' })),
    company_orgs: [orgRow(ORG, 'Silk Road Hotels'), orgRow(FOREIGN, 'Other Company')],
    company_members: [member(ORG, OWNER, 'owner'), member(ORG, HR, 'admin'), member(ORG, MANAGER, 'manager'), member(ORG, EMPLOYEE, 'employee'), member(FOREIGN, FOREIGN_HR, 'admin')],
  });
  db.uniques.company_attempts = [{ columns: ['assessment_id', 'candidate_email'], where: (row) => row.status === 'started' }];
  db.uniques.company_candidates = [{ columns: ['assessment_id', 'email'] }, { columns: ['attempt_id'] }, { columns: ['invite_token_hash'] }];
  db.rpcs.company_reserve_test = ({ p_org }) => {
    const org = db.rows('company_orgs').find((row) => row.id === p_org)!;
    org.tests_used = Number(org.tests_used) + 1;
    return true;
  };
  const state = { aiLeft: true, kitReply: null as unknown, payloads: [] as string[] };
  db.rpcs.company_consume_ai = () => state.aiLeft;
  const hits = new Map<string, number>();
  db.rpcs.company_hiring_hit = ({ p_bucket, p_limit }) => {
    const count = (hits.get(String(p_bucket)) ?? 0) + 1;
    hits.set(String(p_bucket), count);
    return count <= Math.min(Number(p_limit), options.hits ?? Number(p_limit));
  };
  let mode = options.ai ?? 'ok';
  const ai: AiCall = <T>(request: { feature: string; userPayload: string }, fallback: T) => {
    state.payloads.push(request.userPayload);
    if (mode !== 'ok') return Promise.resolve({ data: fallback, status: 'failed' as const });
    if (request.feature === 'company-interview-kit') return Promise.resolve({ data: state.kitReply as T, status: state.kitReply ? 'ok' as const : 'failed' as const });
    return Promise.resolve({ data: { criteria: { task: 60, organisation: 60, grammar: 60, vocabulary: 60, fluency: 60, pronunciation: 60 }, strengths: ['Clear greeting'], improvements: ['Use past tenses'], summary: 'Solid.' } as T, status: 'ok' as const });
  };
  const clock = { now: new Date('2026-11-06T09:00:00.000Z') };
  const call = testHandler(db, [...core, ...hiring], { ai, now: () => clock.now });
  return { db, call, clock, state, setAi: (next: 'ok' | 'down') => { mode = next; } };
}
type World = ReturnType<typeof world>;

const token = (link: string) => link.split('/t/')[1];
const shareKey = (link: string) => link.split('/s/')[1];
const OBJECTIVE = ['grammar', 'vocabulary'];

async function makeTest(w: World, body: Record<string, unknown> = {}) {
  const created = await w.call('POST', `orgs/${ORG}/assessments`, { user: HR, body: { title: 'Front desk', skills: OBJECTIVE, min_level: 'a2', time_limit_minutes: 30, ...body } });
  assertEquals(created.status, 200, JSON.stringify(created.body));
  return { id: created.body.assessment.id as string, link: created.body.link as string };
}

async function invite(w: World, testId: string, rows: unknown[]) {
  const response = await w.call('POST', `orgs/${ORG}/assessments/${testId}/candidates`, { user: HR, body: { rows, locale: 'ru' } });
  assertEquals(response.status, 200, JSON.stringify(response.body));
  return response.body;
}

function bankIdOf(db: FakeDb, attemptId: string, pageId: string): string {
  const items = db.rows('company_attempts').find((row) => row.id === attemptId)!.items as Section[];
  for (const [bank, page] of pageIds(items)) if (page === pageId) return bank;
  throw new Error(`no bank item behind ${pageId}`);
}

/** Plays a test through the public routes from a started key. */
async function finish(w: World, key: string, first: { status: string; id: string; section: Record<string, unknown> }, right = true) {
  let view = first as { status: string; id: string; section: { items?: { id: string; options: string[] }[]; passages?: { questions: { id: string; options: string[] }[] }[]; tasks?: { id: string }[]; skill: string } };
  for (let guard = 0; guard < 30 && view.status === 'started'; guard++) {
    const answers: Record<string, unknown> = {};
    const questions = [...(view.section.items ?? []), ...(view.section.passages ?? []).flatMap((passage) => passage.questions)];
    for (const item of questions) {
      const id = bankIdOf(w.db, view.id, item.id);
      const bank = CHOICES.get(id) ?? QUESTIONS.get(id)!.question;
      const key_ = item.options.indexOf(bank.options[bank.answer]);
      answers[item.id] = right ? key_ : (key_ + 1) % item.options.length;
    }
    for (const task of view.section.tasks ?? []) {
      answers[task.id] = view.section.skill === 'writing' ? 'Dear guest, thank you for choosing our hotel. Your room is booked from Friday.' : { transcript: 'Welcome to our hotel, how can I help you today with your booking?', mode: 'speech' };
    }
    const moved = await w.call('POST', 'public/attempts/next', { body: { key, answers } });
    assertEquals(moved.status, 200, JSON.stringify(moved.body));
    view = moved.body.attempt;
  }
  return view;
}

async function takeByOpenLink(w: World, link: string, who: { name: string; email: string; phone?: string }, right = true) {
  const started = await w.call('POST', `public/t/${token(link)}/start`, { body: { ...who, consent: true } });
  assertEquals(started.status, 200, JSON.stringify(started.body));
  return { key: started.body.key as string, view: await finish(w, started.body.key, started.body.attempt, right) };
}

const candidateByEmail = (w: World, email: string) => w.db.rows('company_candidates').find((row) => row.email === email)!;

// ---------------------------------------------------------------- catalogues

Deno.test('role templates: at least 25 sensible vacancies, each named in all three languages', () => {
  assert(ROLE_TEMPLATES.length >= 25, `${ROLE_TEMPLATES.length}`);
  assertEquals(new Set(ROLE_TEMPLATES.map((row) => row.code)).size, ROLE_TEMPLATES.length, 'codes unique');
  for (const template of ROLE_TEMPLATES) {
    assert((JOB_ROLES as readonly string[]).includes(template.job_role), `${template.code}: job role`);
    assert(templateSkills(template).length >= 3, `${template.code}: skills`);
    for (const [skill, level] of Object.entries(template.minimums)) {
      assert((SKILLS as readonly string[]).includes(skill) && (LEVELS as readonly string[]).includes(level), `${template.code}: ${skill}`);
    }
    const key = `hiring.role.${template.code}` as keyof typeof hiringEn;
    assert(hiringEn[key] && hiringRu[key] && hiringUz[key], `${template.code}: name in en, ru and uz`);
    assert(template.name.length > 2 && template.industries.length > 0);
  }
});

Deno.test('messages: every kind and language fills its placeholders, and values cannot inject another', () => {
  for (const kind of MESSAGE_KINDS) for (const locale of MESSAGE_LOCALES) {
    const out = renderMessage(kind, locale, { name: 'Aziza', company: 'Silk Road', test: 'Front desk', link: 'https://x/t/abc', minutes: 30, closes_at: '2026-12-01T10:00:00Z' });
    assert(!/\{[a-z_]+\}/.test(out.subject + out.text), `${kind}.${locale}: leftover placeholder: ${out.text}`);
    assertStringIncludes(out.text, 'Aziza');
    if (kind === 'invite' || kind === 'reminder') {
      assertStringIncludes(out.text, 'https://x/t/abc');
      assertStringIncludes(out.text, '01.12.2026');
    }
    assert(!/\d+\s*(%|\$|сум|so‘m)/.test(DEFAULT_TEMPLATES[kind][locale].body), 'no invented figures');
  }
  assertEquals(fill('Hello {name}, {link}', { name: '{link}', link: 'x' }), 'Hello {link}, x');
  assertEquals(renderMessage('offer', 'en', { name: null, company: 'C', test: 'T', minutes: 1 }, { offer: { en: { subject: 'S {test}', body: 'B {company}' } } }), { subject: 'S T', text: 'B C', custom: true });
  assertEquals(readTemplates({ offer: { en: { subject: ' ', body: '' } } }), {});
  let refused = false;
  try { readTemplates({ offer: { en: { subject: 'Only a subject', body: '' } } }); } catch { refused = true; }
  assert(refused, 'half a template is refused');
});

Deno.test('interview bank: a full kit for every skill, level band and job role', () => {
  for (const skill of SKILLS) for (const band of ['basic', 'deeper'] as const) assert(SKILL_QUESTIONS[skill][band].length >= 3, `${skill} ${band}`);
  for (const role of JOB_ROLES) {
    const fit = benchmark({ status: 'graded', overall_level: 'a2', overall_score: 40, skill_results: { grammar: { score: 30, level: 'a1', source: 'auto' }, speaking: { score: 50, level: 'b1', source: 'ai' } } }, { skills: ['grammar', 'speaking'], min_level: 'b1', settings: { skill_minimums: { grammar: 'b1' } } });
    const kit = bankKit(role, fit, 'ru', 'seed', '2026-11-06T00:00:00Z');
    assertEquals(kit.source, 'bank');
    assert(kit.questions.length >= 3, role);
    assert(kit.questions.every((question) => question.question && question.listen_for));
  }
  assert(Object.keys(ROLE_QUESTIONS).length >= 11);
  assertEquals(parseKit({ questions: [{ question: 'a' }] }), null, 'too short a kit is not used');
  assertEquals(parseKit('nonsense'), null);
  const cleaned = parseKit({ questions: [{ question: 'One\u0000 q', skill: 'grammar' }, { question: 'Two', skill: 'made-up' }, { question: 'Three' }, { skill: 'grammar' }] })!;
  assertEquals(cleaned.map((row) => [row.question, row.skill]), [['One q', 'grammar'], ['Two', 'role'], ['Three', 'role']]);
});

Deno.test('benchmark: verdict, gaps, weak skills, ranking and funnel', () => {
  const test = { skills: ['grammar', 'speaking', 'writing'], min_level: 'b1' as const, settings: { skill_minimums: { speaking: 'b2' as const } } };
  const attempt = (speaking: 'a2' | 'b1' | 'b2' | 'c1', overall: 'a2' | 'b1' | 'b2', score: number) => ({
    status: 'graded', overall_level: overall, overall_score: score,
    skill_results: { grammar: { score: 60, level: 'b1' as const, source: 'auto' as const }, speaking: { score: 55, level: speaking, source: 'ai' as const }, writing: { score: 50, level: 'b1' as const, source: 'ai' as const } },
  });
  const meets = benchmark(attempt('b2', 'b1', 60), test);
  assertEquals([meets.verdict, meets.below, meets.gap], ['meets', 0, 0]);
  const below = benchmark(attempt('a2', 'b1', 60), test);
  assertEquals([below.verdict, below.below, below.gap], ['below', 1, 2]);
  assertEquals(below.skills.find((entry) => entry.skill === 'speaking')!.meets, false);
  assertEquals(benchmark(attempt('c1', 'a2', 40), test).verdict, 'below', 'the overall minimum still counts');
  assertEquals(benchmark(null, test).verdict, 'pending');
  assertEquals(benchmark(attempt('b1', 'b1', 50), { skills: test.skills, min_level: null }).verdict, 'none');
  assertEquals(weakSkills(below), ['speaking']);
  assertEquals(weakSkills(meets).length, 2);

  const rows = [
    { name: 'pending', benchmark: benchmark(null, test) },
    { name: 'two-short', benchmark: below },
    { name: 'one-short', benchmark: benchmark(attempt('b1', 'b1', 70), test) },
    { name: 'meets-low', benchmark: benchmark(attempt('b2', 'b1', 55), test) },
    { name: 'meets-high', benchmark: benchmark(attempt('c1', 'b2', 75), test) },
  ];
  assertEquals([...rows].sort(byFit).map((row) => row.name), ['meets-high', 'meets-low', 'one-short', 'two-short', 'pending']);

  assertEquals(median([]), null);
  assertEquals(median([3, 1, 2]), 2);
  assertEquals(median([1, 2, 3, 4]), 2.5);
  const base = { invited_at: '2026-11-01T00:00:00Z', opened_at: null, created_at: '2026-11-01T00:00:00Z', hired_at: null, stage: 'new' as const, furthest_stage: 'new' as const, attempt: null, verdict: 'pending' as const };
  const counted = funnel([
    base,
    { ...base, opened_at: '2026-11-01T01:00:00Z' },
    { ...base, attempt: { status: 'started', started_at: '2026-11-01T01:00:00Z', submitted_at: null } },
    { ...base, stage: 'rejected', furthest_stage: 'interview', verdict: 'below', attempt: { status: 'graded', started_at: '2026-11-01T01:00:00Z', submitted_at: '2026-11-01T01:30:00Z' } },
    { ...base, stage: 'hired', furthest_stage: 'hired', hired_at: '2026-11-11T00:00:00Z', verdict: 'meets', attempt: { status: 'graded', started_at: '2026-11-01T01:00:00Z', submitted_at: '2026-11-01T01:50:00Z' } },
  ]);
  assertEquals([counted.candidates, counted.opened, counted.started, counted.finished, counted.meets, counted.interview, counted.hired, counted.rejected], [5, 4, 3, 2, 1, 2, 1, 1]);
  assertEquals([counted.median_minutes_to_finish, counted.median_days_to_hire], [40, 10]);
});

Deno.test('page: pasted lists and CSV files are read by what is in each column', () => {
  const parsed = parseCandidates('﻿Name,Email,Phone\r\nAziza Karimova, aziza@MAIL.uz, +998 90 123 45 67\n"Toshev, Jasur";jasur@gmail.com\n+998 91 111 22 33\tMadina Y\nNigora Sobirova <nigora@mail.uz>\nNo Contact Person\n\nJust.Name\n');
  assertEquals(parsed.rows.map(({ name, email, phone }) => [name, email, phone]), [
    ['Aziza Karimova', 'aziza@mail.uz', '+998 90 123 45 67'],
    ['Toshev, Jasur', 'jasur@gmail.com', ''],
    ['Madina Y', '', '+998 91 111 22 33'],
    ['Nigora Sobirova', 'nigora@mail.uz', ''],
  ]);
  assertEquals(parsed.ignored, [6, 8]);
  assertEquals(parseCandidates('Aziza Karimova aziza@mail.uz +998 90 123 45 67').rows.map(({ name, email, phone }) => [name, email, phone]), [['Aziza Karimova', 'aziza@mail.uz', '+998 90 123 45 67']]);
  assertEquals(parseCandidates('ФИО;Почта;Телефон').rows, []);
});

// ---------------------------------------------------------------- templates and minimums

Deno.test('routes: one click creates a test from a role template, for HR only', async () => {
  const w = world();
  const list = await w.call('GET', `orgs/${ORG}/hiring/role-templates`, { user: HR });
  assertEquals(list.status, 200);
  assertEquals(list.body.industry, 'hospitality');
  assert(list.body.templates.length >= 25);
  const made = await w.call('POST', `orgs/${ORG}/hiring/role-templates/front_desk`, { user: HR, body: { title: 'Администратор ресепшн' } });
  assertEquals(made.status, 200, JSON.stringify(made.body));
  const row = w.db.rows('company_assessments')[0];
  assertEquals([row.title, row.job_role, row.min_level, row.org_id, row.kind, row.status], ['Администратор ресепшн', 'hospitality', 'b1', ORG, 'hiring', 'open']);
  assertEquals((row.settings as Record<string, unknown>).template, 'front_desk');
  assertEquals((row.settings as { skill_minimums: Record<string, string> }).skill_minimums.speaking, 'b1');
  assert(made.body.link.includes('/t/'));
  assertEquals(row.link_token_hash, await sha256(token(made.body.link)), 'link stored as a hash');
  assertEquals((await w.call('POST', `orgs/${ORG}/hiring/role-templates/nothing`, { user: HR })).status, 404);
  assertEquals((await w.call('POST', `orgs/${ORG}/hiring/role-templates/front_desk`, { user: EMPLOYEE })).status, 403);
  assertEquals((await w.call('POST', `orgs/${ORG}/hiring/role-templates/front_desk`, { user: MANAGER })).status, 403);
  assertEquals((await w.call('GET', `orgs/${ORG}/hiring/role-templates`, { user: FOREIGN_HR })).status, 403);
});

Deno.test('routes: skill minimums are validated, follow the skills, and decide whether a result meets the role', async () => {
  const w = world();
  const bad = await w.call('POST', `orgs/${ORG}/assessments`, { user: HR, body: { title: 'Bad', skills: OBJECTIVE, skill_minimums: { grammar: 'z9' } } });
  assertEquals([bad.status, bad.body.field], [400, 'skill_minimums']);
  const { id, link } = await makeTest(w, { min_level: null, skill_minimums: { grammar: 'b1', vocabulary: 'c2', speaking: 'b1' } });
  const stored = () => (w.db.rows('company_assessments').find((row) => row.id === id)!.settings as { skill_minimums: Record<string, string> }).skill_minimums;
  assertEquals(stored(), { grammar: 'b1', vocabulary: 'c2' }, 'no minimum for a skill the test does not measure');
  const patched = await w.call('PATCH', `orgs/${ORG}/assessments/${id}`, { user: HR, body: { skills: ['grammar', 'reading'] } });
  assertEquals(patched.status, 200);
  assertEquals(stored(), { grammar: 'b1' }, 'dropping a skill drops its minimum');
  await w.call('PATCH', `orgs/${ORG}/assessments/${id}`, { user: HR, body: { skills: OBJECTIVE, skill_minimums: { grammar: 'a1', vocabulary: 'c2' } } });
  await takeByOpenLink(w, link, { name: 'Weak Vocabulary', email: 'weak@mail.uz' }, false);
  const detail = await w.call('GET', `orgs/${ORG}/assessments/${id}`, { user: HR });
  assertEquals(detail.body.attempts[0].meets, false, 'below a skill minimum does not meet the role, with no overall minimum set');
  assertEquals(detail.body.stats.meets, 0);
  const list = await w.call('GET', `orgs/${ORG}/assessments?kind=hiring`, { user: HR });
  assertEquals(list.body.assessments[0].stats.meets, 0);
});

// ---------------------------------------------------------------- candidates

Deno.test('routes: bulk candidates get personal links, stored only as hashes, with reports on bad rows', async () => {
  const w = world();
  const { id } = await makeTest(w);
  w.db.rows('company_candidates').push({ id: crypto.randomUUID(), org_id: ORG, assessment_id: id, name: 'Already Here', email: 'here@mail.uz', stage: 'new', furthest_stage: 'new', created_at: '2026-11-01T00:00:00Z' });
  const body = await invite(w, id, [
    { name: 'Aziza Karimova', email: 'AZIZA@mail.uz', phone: '+998 90 123 45 67' },
    { name: 'Phone Only', phone: '+998 91 111 22 33' },
    { name: 'Second Aziza', email: 'aziza@mail.uz' },
    { name: 'Already Here', email: 'here@mail.uz' },
    { name: 'X', email: 'x@mail.uz' },
    { name: 'No Contact' },
    { name: 'Bad Mail', email: 'nope' },
    { name: 'Bad Phone', phone: 'abc' },
    { name: 'Nul\u0000 Person', email: 'nul@mail.uz' },
    'not a row',
  ]);
  assertEquals(body.created.map((row: { email: string | null }) => row.email), ['aziza@mail.uz', null]);
  assertEquals(body.problems.map((row: { row: number; reason: string }) => [row.row, row.reason]), [[3, 'duplicate'], [4, 'duplicate'], [5, 'name'], [6, 'contact'], [7, 'email'], [8, 'phone'], [9, 'name'], [10, 'name']]);
  const first = body.created[0];
  assertStringIncludes(first.text, 'Aziza Karimova');
  assertStringIncludes(first.text, first.link);
  assertStringIncludes(first.subject, 'Front desk');
  const row = w.db.rows('company_candidates').find((entry) => entry.email === 'aziza@mail.uz')!;
  assertEquals(row.invite_token_hash, await sha256(token(first.link)));
  assert(!JSON.stringify(w.db.rows('company_candidates')).includes(token(first.link)), 'the raw token is not stored');
  assert(!JSON.stringify(w.db.rows('company_audit')).includes(token(first.link)), 'nor in the audit trail');
  assertStringIncludes(body.csv, first.link);

  // A double click adds nobody.
  const again = await invite(w, id, [{ name: 'Aziza Karimova', email: 'aziza@mail.uz' }]);
  assertEquals([again.created.length, again.problems[0].reason, again.csv], [0, 'duplicate', null]);

  // Lost the race against another tab: the rest of the batch still goes in.
  const from = w.db.from.bind(w.db);
  w.db.from = ((table: string) => {
    if (table === 'company_candidates') {
      w.db.from = from;
      // The read of existing emails sees nothing, as if the row appeared right after it.
      const empty: Record<string, unknown> = {};
      for (const method of ['select', 'eq', 'not', 'order']) empty[method] = () => empty;
      empty.range = () => Promise.resolve({ data: [], error: null });
      return empty;
    }
    return from(table);
  }) as typeof w.db.from;
  const raced = await invite(w, id, [{ name: 'Already Here', email: 'here@mail.uz' }, { name: 'New Person', email: 'new@mail.uz' }]);
  assertEquals(raced.created.map((entry: { email: string }) => entry.email), ['new@mail.uz']);
  assertEquals(raced.problems.map((entry: { reason: string }) => entry.reason), ['duplicate']);

  // Formula-safe CSV.
  const risky = await invite(w, id, [{ name: '=HYPERLINK("http://evil")', email: 'risky@mail.uz' }]);
  assert(risky.csv.includes(`"'=HYPERLINK`), risky.csv);

  // Limits and scoping.
  assertEquals((await w.call('POST', `orgs/${ORG}/assessments/${id}/candidates`, { user: HR, body: { rows: Array.from({ length: 501 }, (_, index) => ({ name: 'Person', email: `p${index}@mail.uz` })) } })).status, 400);
  assertEquals((await w.call('POST', `orgs/${ORG}/assessments/${id}/candidates`, { user: MANAGER, body: { rows: [{ name: 'Person', email: 'p@mail.uz' }] } })).status, 403);
  await w.call('PATCH', `orgs/${ORG}/assessments/${id}`, { user: HR, body: { status: 'closed' } });
  assertEquals((await w.call('POST', `orgs/${ORG}/assessments/${id}/candidates`, { user: HR, body: { rows: [{ name: 'Person', email: 'p@mail.uz' }] } })).body.code, 'test_closed');
});

Deno.test('routes: a personal link tracks opening, starts one test, resumes on any device and stops when finished', async () => {
  const w = world();
  const { id } = await makeTest(w);
  const { created: [person] } = await invite(w, id, [{ name: 'Aziza Karimova', email: 'aziza@mail.uz', phone: '+998 90 123 45 67' }]);
  const link = token(person.link);
  const row = () => candidateByEmail(w, 'aziza@mail.uz');
  assertEquals(row().opened_at ?? null, null);

  const intro = await w.call('GET', `public/t/${link}`);
  assertEquals(intro.status, 200);
  assertEquals(intro.body.personal, { name: 'Aziza Karimova', email: 'aziza@mail.uz', phone: '+998 90 123 45 67', status: 'new' });
  const firstOpened = row().opened_at;
  assert(firstOpened);
  w.clock.now = new Date(w.clock.now.getTime() + MINUTE);
  await w.call('GET', `public/t/${link}`);
  assertEquals(row().opened_at, firstOpened, 'the first opening stays');

  assertEquals((await w.call('POST', `public/t/${link}/start`, { body: { name: 'Aziza' } })).body.code, 'consent_required');
  const started = await w.call('POST', `public/t/${link}/start`, { body: { email: 'someone.else@mail.uz', consent: true } });
  assertEquals(started.status, 200, JSON.stringify(started.body));
  const attempt = w.db.rows('company_attempts')[0];
  assertEquals(attempt.candidate_email, 'aziza@mail.uz', 'a personal link cannot test under another address');
  assertEquals([attempt.candidate_name, row().attempt_id], ['Aziza Karimova', attempt.id]);
  assertEquals(w.db.rows('company_orgs')[0].tests_used, 1);

  // Another device: same attempt, new key, no second test used.
  assertEquals((await w.call('GET', `public/t/${link}`)).body.personal.status, 'running');
  const resumed = await w.call('POST', `public/t/${link}/start`, { body: {} });
  assertEquals(resumed.status, 200, JSON.stringify(resumed.body));
  assertEquals(resumed.body.attempt.id, started.body.attempt.id);
  assertNotEquals(resumed.body.key, started.body.key);
  assertEquals(w.db.rows('company_orgs')[0].tests_used, 1);
  assertEquals((await w.call('POST', 'public/attempts/state', { body: { key: started.body.key } })).status, 404, 'the old key stops working');

  // Closing the test does not cut off a test already running.
  await w.call('PATCH', `orgs/${ORG}/assessments/${id}`, { user: HR, body: { status: 'closed' } });
  assertEquals((await w.call('GET', `public/t/${link}`)).body.open, true);
  await w.call('PATCH', `orgs/${ORG}/assessments/${id}`, { user: HR, body: { status: 'open' } });

  await finish(w, resumed.body.key, resumed.body.attempt);
  assertEquals((await w.call('GET', `public/t/${link}`)).body.personal.status, 'finished');
  assertEquals((await w.call('POST', `public/t/${link}/start`, { body: { consent: true } })).body.code, 'test_taken');
  assertEquals(w.db.rows('company_attempts').length, 1);

  // Replacing the open link leaves personal links alone; replacing the personal link ends the old one.
  const second = await invite(w, id, [{ name: 'Jasur Toshev', email: 'jasur@mail.uz' }]);
  await w.call('POST', `orgs/${ORG}/assessments/${id}/link`, { user: HR });
  assertEquals((await w.call('GET', `public/t/${token(second.created[0].link)}`)).status, 200);
  const fresh = await w.call('POST', `orgs/${ORG}/candidates/${second.created[0].id}/link`, { user: HR });
  assertEquals((await w.call('GET', `public/t/${token(second.created[0].link)}`)).status, 404);
  assertEquals((await w.call('GET', `public/t/${token(fresh.body.link)}`)).status, 200);
});

Deno.test('routes: a personal link cannot resume a closed workspace, but a paused one lets its test finish', async () => {
  const w = world();
  const { id } = await makeTest(w);
  const { created: [person] } = await invite(w, id, [{ name: 'Aziza Karimova', email: 'aziza@mail.uz' }]);
  const path = `public/t/${token(person.link)}`;
  const started = await w.call('POST', `${path}/start`, { body: { consent: true } });
  assertEquals(started.status, 200);
  const attempt = w.db.rows('company_attempts')[0];
  const access = attempt.access_token_hash;
  const org = w.db.rows('company_orgs')[0];
  org.status = 'closed';

  const closedIntro = await w.call('GET', path);
  assertEquals([closedIntro.body.open, closedIntro.body.personal], [false, null]);
  const denied = await w.call('POST', `${path}/start`, { body: {} });
  assertEquals([denied.status, denied.body.code], [403, 'org_closed']);
  assertEquals(attempt.access_token_hash, access, 'a refused resume must not replace the existing key');
  assertEquals(w.db.rows('company_orgs')[0].tests_used, 1);

  org.status = 'suspended';
  assertEquals((await w.call('GET', path)).body.open, true);
  const resumed = await w.call('POST', `${path}/start`, { body: {} });
  assertEquals([resumed.status, resumed.body.attempt.id], [200, started.body.attempt.id]);
  assertNotEquals(resumed.body.key, started.body.key);
  await finish(w, resumed.body.key, resumed.body.attempt);
  assertEquals(w.db.rows('company_orgs')[0].tests_used, 1);
});

Deno.test('routes: invited by phone only, the address comes from the start form; a recruiting day on one network is not blocked', async () => {
  const w = world();
  const { id } = await makeTest(w);
  const { created } = await invite(w, id, Array.from({ length: 7 }, (_, index) => ({ name: `Person ${index}`, phone: `+998 90 000 00 0${index}` })));
  for (const [index, person] of created.entries()) {
    const started = await w.call('POST', `public/t/${token(person.link)}/start`, { body: { email: `person${index}@mail.uz`, consent: true } });
    assertEquals(started.status, 200, `${index}: ${JSON.stringify(started.body)}`);
  }
  const row = w.db.rows('company_candidates').find((entry) => entry.phone === '+998 90 000 00 00')!;
  assertEquals(row.email, 'person0@mail.uz');
  assert(row.attempt_id);
  assertEquals((await w.call('POST', `public/t/${token(created[1].link)}/start`, { body: { email: 'other@mail.uz', consent: true } })).body.attempt.status, 'started', 'resumes');
});

Deno.test('routes: an open-link start creates a candidate; an invited email must use its personal link; older attempts are picked up', async () => {
  const w = world();
  const { id, link } = await makeTest(w);
  const { created } = await invite(w, id, [{ name: 'Invited Person', email: 'invited@mail.uz' }]);
  await takeByOpenLink(w, link, { name: 'Walk In', email: 'walkin@mail.uz', phone: '+998 91 000 00 00' });
  const walkIn = candidateByEmail(w, 'walkin@mail.uz');
  assertEquals([walkIn.source, walkIn.stage, walkIn.name, walkIn.invite_token_hash ?? null], ['link', 'new', 'Walk In', null]);
  assert(walkIn.attempt_id);
  // Anyone holding the open link who knows an invited address cannot take over that invitation.
  const attempts = w.db.rows('company_attempts').length;
  const hijack = await w.call('POST', `public/t/${token(link)}/start`, { body: { name: 'Mallory', email: 'invited@mail.uz', phone: '+998 99 999 99 99', consent: true } });
  assertEquals([hijack.status, hijack.body.code], [409, 'use_personal_link']);
  assertEquals(w.db.rows('company_attempts').length, attempts, 'no attempt was started');
  assertEquals(w.db.rows('company_candidates').length, 2);
  const invited = candidateByEmail(w, 'invited@mail.uz');
  assertEquals([invited.id, invited.name, invited.phone ?? null, invited.attempt_id ?? null], [created[0].id, 'Invited Person', null, null]);
  // The personal link still belongs to the invited person.
  const own = await w.call('POST', `public/t/${token(created[0].link)}/start`, { body: { consent: true } });
  assertEquals([own.status, own.body.attempt.status], [200, 'started']);
  assertEquals(candidateByEmail(w, 'invited@mail.uz').attempt_id, w.db.rows('company_attempts').at(-1)!.id);
  // Invited by phone only: the address typed in cannot be one another candidate of this test already has.
  const { created: [byPhone] } = await invite(w, id, [{ name: 'Phone Person', phone: '+998 90 555 55 55' }]);
  const taken = await w.call('POST', `public/t/${token(byPhone.link)}/start`, { body: { email: 'walkin@mail.uz', consent: true } });
  assertEquals([taken.status, taken.body.code], [409, 'email_in_use']);
  assertEquals(w.db.rows('company_candidates').find((row) => row.id === byPhone.id)!.attempt_id ?? null, null);

  // An attempt from before this layer, with no candidate row.
  const older = { ...w.db.rows('company_attempts')[0], id: crypto.randomUUID(), candidate_name: 'From Before', candidate_email: 'before@mail.uz', decision: 'reject', access_token_hash: null };
  w.db.rows('company_attempts').push(older);
  const pipeline = await w.call('GET', `orgs/${ORG}/assessments/${id}/pipeline`, { user: HR });
  assertEquals(pipeline.status, 200, JSON.stringify(pipeline.body));
  const found = pipeline.body.candidates.find((row: { email: string }) => row.email === 'before@mail.uz');
  assertEquals([found.stage, found.attempt_id], ['rejected', older.id]);
  await w.call('GET', `orgs/${ORG}/assessments/${id}/pipeline`, { user: HR });
  assertEquals(w.db.rows('company_candidates').filter((row) => row.email === 'before@mail.uz').length, 1, 'read twice, one row');

  // A start must not fail if the candidate write does.
  const from = w.db.from.bind(w.db);
  w.db.from = ((table: string) => table === 'company_candidates' ? { select: () => { throw new Error('down'); }, insert: () => Promise.resolve({ data: null, error: { message: 'down' } }), update: () => ({ eq: () => Promise.resolve({ error: null }) }) } : from(table)) as unknown as typeof w.db.from;
  const started = await w.call('POST', `public/t/${token(link)}/start`, { body: { name: 'Still Starts', email: 'still@mail.uz', consent: true } });
  w.db.from = from;
  assertEquals(started.status, 200);
});

// ---------------------------------------------------------------- pipeline

Deno.test('routes: stages move once, keep the decision in step, count in the funnel, and rank by fit', async () => {
  const w = world();
  const { id, link } = await makeTest(w, { min_level: 'b1' });
  await invite(w, id, [{ name: 'Not Started', email: 'waiting@mail.uz' }]);
  await takeByOpenLink(w, link, { name: 'Strong One', email: 'strong@mail.uz' }, true);
  await takeByOpenLink(w, link, { name: 'Weak One', email: 'weak@mail.uz' }, false);
  const strong = candidateByEmail(w, 'strong@mail.uz'), weak = candidateByEmail(w, 'weak@mail.uz');

  const moved = await w.call('PATCH', `orgs/${ORG}/candidates/${strong.id}`, { user: HR, body: { stage: 'interview' } });
  assertEquals([moved.status, moved.body.stage], [200, 'interview']);
  await w.call('PATCH', `orgs/${ORG}/candidates/${strong.id}`, { user: HR, body: { stage: 'interview' } });
  const moves = () => w.db.rows('company_candidate_notes').filter((row) => row.candidate_id === strong.id && row.kind === 'stage');
  assertEquals(moves().length, 1, 'a double click is one move');
  assertEquals(moves()[0].author, HR);
  assertEquals(w.db.rows('company_attempts').find((row) => row.id === strong.attempt_id)!.decision, 'shortlist');

  await w.call('PATCH', `orgs/${ORG}/candidates/${strong.id}`, { user: HR, body: { stage: 'hired' } });
  assertEquals(strong.furthest_stage, 'hired');
  assert(strong.hired_at);
  await w.call('PATCH', `orgs/${ORG}/candidates/${strong.id}`, { user: HR, body: { stage: 'offer' } });
  assertEquals([strong.furthest_stage, strong.hired_at], ['hired', null], 'moving back keeps how far they got, and they are no longer hired');
  await w.call('PATCH', `orgs/${ORG}/candidates/${strong.id}`, { user: HR, body: { stage: 'hired' } });
  assertEquals((await w.call('PATCH', `orgs/${ORG}/candidates/${strong.id}`, { user: HR, body: { stage: 'nope' } })).status, 400);

  // A decision on the report moves the pipeline too.
  await w.call('PATCH', `orgs/${ORG}/attempts/${weak.attempt_id}`, { user: HR, body: { decision: 'hold' } });
  assertEquals(weak.stage, 'reviewing');
  await w.call('PATCH', `orgs/${ORG}/attempts/${weak.attempt_id}`, { user: HR, body: { decision: 'reject' } });
  assertEquals(weak.stage, 'rejected');
  const report = await w.call('GET', `orgs/${ORG}/attempts/${weak.attempt_id}`, { user: HR });
  assertEquals(report.body.candidate.id, weak.id);

  const pipeline = await w.call('GET', `orgs/${ORG}/assessments/${id}/pipeline`, { user: HR });
  const names = pipeline.body.candidates.map((row: { name: string }) => row.name);
  assertEquals(names[0], 'Strong One');
  assertEquals(names[names.length - 1], 'Not Started');
  assertEquals(pipeline.body.candidates[0].rank, 1);
  assertEquals(pipeline.body.candidates[0].benchmark.verdict, 'meets');
  assertEquals(pipeline.body.candidates[1].benchmark.verdict, 'below');
  assertEquals(pipeline.body.candidates[2].rank, null);
  assertEquals(pipeline.body.candidates[2].track, 'invited');
  assert(!JSON.stringify(pipeline.body).includes('invite_token_hash'), 'no token hash reaches the page');
  const f = pipeline.body.funnel;
  assertEquals([f.candidates, f.invited, f.started, f.finished, f.graded, f.hired, f.rejected, f.meets], [3, 1, 2, 2, 2, 1, 1, 1]);

  const file = await w.call('GET', `orgs/${ORG}/assessments/${id}/pipeline/export`, { user: HR });
  assertStringIncludes(file.body.csv, 'Strong One');
  assertStringIncludes(file.body.csv, 'hired');
  assertEquals((await w.call('GET', `orgs/${ORG}/assessments/${id}/pipeline`, { user: MANAGER })).status, 403);
  assertEquals((await w.call('GET', `orgs/${ORG}/assessments/${id}/pipeline`, { user: EMPLOYEE })).status, 403);
});

Deno.test('routes: pipeline reads past the row cap, and long id lists stay out of the URL', async () => {
  const w = world();
  const { id } = await makeTest(w);
  for (let index = 0; index < 1500; index++) w.db.rows('company_candidates').push({ id: crypto.randomUUID(), org_id: ORG, assessment_id: id, name: `Person ${index}`, email: `p${index}@mail.uz`, stage: 'new', furthest_stage: 'new', invited_at: '2026-11-01T00:00:00Z', created_at: '2026-11-01T00:00:00Z' });
  w.db.maxRows = 1000;
  const pipeline = await w.call('GET', `orgs/${ORG}/assessments/${id}/pipeline`, { user: HR });
  assertEquals(pipeline.body.candidates.length, 1500);
  assertEquals(pipeline.body.funnel.invited, 1500);
  assert(w.db.longestIn <= 100, `longest in: ${w.db.longestIn}`);
  const ids = w.db.rows('company_candidates').slice(0, 450).map((row) => row.id);
  const messages = await w.call('POST', `orgs/${ORG}/candidates/bulk/messages`, { user: HR, body: { ids, kind: 'interview', locale: 'en' } });
  assertEquals(messages.body.messages.length, 450);
  assert(w.db.longestIn <= 100);
  // Duplicate emails on a re-read are still refused.
  const again = await invite(w, id, [{ name: 'Person', email: 'p1400@mail.uz' }]);
  assertEquals(again.problems[0].reason, 'duplicate', 'duplicates are found past the first thousand');
});

Deno.test('routes: bulk moves and messages touch only this workspace', async () => {
  const w = world();
  const { id } = await makeTest(w);
  const { created } = await invite(w, id, [{ name: 'One Person', email: 'one@mail.uz' }, { name: 'Two Person', email: 'two@mail.uz' }]);
  const outsider = crypto.randomUUID();
  const foreignTest = crypto.randomUUID();
  w.db.rows('company_assessments').push({ id: foreignTest, org_id: FOREIGN, kind: 'hiring', title: 'Theirs', skills: OBJECTIVE, time_limit_minutes: 20, status: 'open', settings: {} });
  w.db.rows('company_candidates').push({ id: outsider, org_id: FOREIGN, assessment_id: foreignTest, name: 'Their Person', email: 'their@mail.uz', stage: 'new', furthest_stage: 'new', created_at: '2026-11-01T00:00:00Z' });
  const ids = [created[0].id, created[1].id, outsider];
  const bulk = await w.call('POST', `orgs/${ORG}/candidates/bulk`, { user: HR, body: { ids, stage: 'reviewing' } });
  assertEquals(bulk.body.moved, 2);
  assertEquals(w.db.rows('company_candidates').find((row) => row.id === outsider)!.stage, 'new');
  const messages = await w.call('POST', `orgs/${ORG}/candidates/bulk/messages`, { user: HR, body: { ids, kind: 'rejection', locale: 'uz' } });
  assertEquals(messages.body.messages.length, 2);
  assert(!JSON.stringify(messages.body).includes('Their Person'));
  assertEquals((await w.call('GET', `orgs/${ORG}/candidates/${outsider}`, { user: HR })).status, 404);
  assertEquals((await w.call('PATCH', `orgs/${ORG}/candidates/${outsider}`, { user: HR, body: { stage: 'hired' } })).status, 404);
  assertEquals((await w.call('POST', `orgs/${ORG}/candidates/${outsider}/notes`, { user: HR, body: { body: 'x' } })).status, 404);
  assertEquals((await w.call('POST', `orgs/${ORG}/candidates/${outsider}/erase`, { user: HR })).status, 404);
  assertEquals((await w.call('POST', `orgs/${ORG}/candidates/${outsider}/link`, { user: HR })).status, 404);
  assertEquals((await w.call('POST', `orgs/${ORG}/candidates/${outsider}/interview-kit`, { user: HR })).status, 404);
  assertEquals((await w.call('POST', `orgs/${ORG}/candidates/${outsider}/shares`, { user: HR })).status, 404);
  assertEquals((await w.call('GET', `orgs/${ORG}/assessments/${foreignTest}/pipeline`, { user: HR })).status, 404);
  assertEquals((await w.call('POST', `orgs/${ORG}/assessments/${foreignTest}/candidates`, { user: HR, body: { rows: [{ name: 'Person', email: 'p@mail.uz' }] } })).status, 404);
  assertEquals((await w.call('POST', `orgs/${ORG}/assessments/${foreignTest}/shares`, { user: HR, body: {} })).status, 404);
  assertEquals((await w.call('POST', `orgs/${ORG}/assessments/${foreignTest}/preview`, { user: HR, body: { action: 'start' } })).status, 404);
  assertEquals((await w.call('POST', `orgs/${ORG}/candidates/bulk`, { user: HR, body: { ids: ['nonsense'], stage: 'new' } })).status, 400);
  assertEquals((await w.call('POST', `orgs/${ORG}/candidates/bulk`, { user: HR, body: { ids: [], stage: 'new' } })).status, 400);
});

Deno.test('routes: notes form a timeline with their authors; only the author or owner may delete one', async () => {
  const w = world();
  const { id } = await makeTest(w);
  const { created: [person] } = await invite(w, id, [{ name: 'One Person', email: 'one@mail.uz' }]);
  const note = await w.call('POST', `orgs/${ORG}/candidates/${person.id}/notes`, { user: HR, body: { body: 'Strong on the phone' } });
  assertEquals(note.status, 200, JSON.stringify(note.body));
  assertEquals((await w.call('POST', `orgs/${ORG}/candidates/${person.id}/notes`, { user: HR, body: { body: 'bad\u0000text' } })).status, 400);
  assertEquals((await w.call('POST', `orgs/${ORG}/candidates/${person.id}/notes`, { user: HR, body: { body: '  ' } })).status, 400);
  await w.call('PATCH', `orgs/${ORG}/candidates/${person.id}`, { user: OWNER, body: { stage: 'reviewing' } });
  w.clock.now = new Date(w.clock.now.getTime() + MINUTE);
  const detail = await w.call('GET', `orgs/${ORG}/candidates/${person.id}`, { user: OWNER });
  assertEquals(detail.body.notes.map((row: { kind: string; author_name: string }) => [row.kind, row.author_name]).sort(), [['note', 'Person b2'], ['stage', 'Person b1']]);
  assertEquals(detail.body.candidate.notes_count, undefined);
  assertEquals((await w.call('DELETE', `orgs/${ORG}/candidates/${person.id}/notes/${note.body.note.id}`, { user: EMPLOYEE })).status, 403);
  const stageNote = detail.body.notes.find((row: { kind: string }) => row.kind === 'stage');
  assertEquals((await w.call('DELETE', `orgs/${ORG}/candidates/${person.id}/notes/${stageNote.id}`, { user: OWNER })).status, 404, 'history of moves stays');
  assertEquals((await w.call('DELETE', `orgs/${ORG}/candidates/${person.id}/notes/${note.body.note.id}`, { user: OWNER })).status, 200);
  // Contact details can be corrected; an email already on the test is a friendly conflict.
  await invite(w, id, [{ name: 'Two Person', email: 'two@mail.uz' }]);
  const clash = await w.call('PATCH', `orgs/${ORG}/candidates/${person.id}`, { user: HR, body: { email: 'two@mail.uz' } });
  assertEquals([clash.status, clash.body.code], [409, 'candidate_exists']);
  const fixed = await w.call('PATCH', `orgs/${ORG}/candidates/${person.id}`, { user: HR, body: { email: 'ONE.NEW@mail.uz', name: 'One Newname' } });
  assertEquals([fixed.body.email, fixed.body.name], ['one.new@mail.uz', 'One Newname']);
});

Deno.test('routes: messages are rendered, never sent, and a reminder copied twice counts once', async () => {
  const w = world();
  const { id } = await makeTest(w);
  const { created: [person] } = await invite(w, id, [{ name: 'One Person', email: 'one@mail.uz' }]);
  const url = `orgs/${ORG}/candidates/${person.id}/message`;
  const bare = await w.call('POST', url, { user: HR, body: { kind: 'reminder', locale: 'uz' } });
  assertEquals(bare.body.needs_link, true);
  const withLink = await w.call('POST', url, { user: HR, body: { kind: 'reminder', locale: 'ru', link: person.link } });
  assertStringIncludes(withLink.body.text, person.link);
  assertEquals(w.db.rows('company_candidates')[0].reminders ?? 0, 0, 'rendering alone counts nothing');
  await w.call('POST', url, { user: HR, body: { kind: 'reminder', locale: 'ru', link: person.link, mark: true } });
  await w.call('POST', url, { user: HR, body: { kind: 'reminder', locale: 'ru', link: person.link, mark: true } });
  assertEquals(w.db.rows('company_candidates')[0].reminders, 1, 'two clicks in a minute are one reminder');
  assertEquals(w.db.rows('company_candidate_notes').filter((row) => row.kind === 'message').length, 1);
  w.clock.now = new Date(w.clock.now.getTime() + 2 * MINUTE);
  await w.call('POST', url, { user: HR, body: { kind: 'reminder', locale: 'ru', link: person.link, mark: true } });
  assertEquals(w.db.rows('company_candidates')[0].reminders, 2);
  assertEquals((await w.call('POST', url, { user: HR, body: { kind: 'nope' } })).status, 400);
  assertEquals((await w.call('POST', url, { user: HR, body: { kind: 'offer', link: 'javascript:alert(1)' } })).status, 400);

  // Workspace templates replace the default.
  const put = await w.call('PUT', `orgs/${ORG}/hiring/settings`, { user: HR, body: { templates: { offer: { ru: { subject: 'Оффер {test}', body: 'Здравствуйте, {name}! {company}' } } } } });
  assertEquals(put.status, 200, JSON.stringify(put.body));
  const offer = await w.call('POST', url, { user: HR, body: { kind: 'offer', locale: 'ru' } });
  assertEquals(offer.body.subject, 'Оффер Front desk');
  assertEquals(offer.body.text, 'Здравствуйте, One Person! Silk Road Hotels');
  assertEquals((await w.call('POST', url, { user: HR, body: { kind: 'offer', locale: 'en' } })).body.needs_link, false);

  // Bulk reminders skip those who finished and use remembered links; `reissue` makes one otherwise.
  const { created: [done] } = await invite(w, id, [{ name: 'Done Person', email: 'done@mail.uz' }]);
  const started = await w.call('POST', `public/t/${token(done.link)}/start`, { body: { consent: true } });
  await finish(w, started.body.key, started.body.attempt);
  const bulk = await w.call('POST', `orgs/${ORG}/candidates/bulk/messages`, { user: HR, body: { ids: [person.id, done.id], kind: 'reminder', locale: 'en', links: { [person.id]: person.link } } });
  assertEquals([bulk.body.messages.length, bulk.body.skipped, bulk.body.messages[0].link, bulk.body.messages[0].missing_link], [1, 1, person.link, false]);
  const unknown = await w.call('POST', `orgs/${ORG}/candidates/bulk/messages`, { user: HR, body: { ids: [person.id], kind: 'reminder', locale: 'en' } });
  assertEquals(unknown.body.messages[0].missing_link, true);
  assertEquals((await w.call('GET', `public/t/${token(person.link)}`)).status, 200, 'without reissue the old link keeps working');
  const reissued = await w.call('POST', `orgs/${ORG}/candidates/bulk/messages`, { user: HR, body: { ids: [person.id], kind: 'reminder', locale: 'en', reissue: true } });
  assertEquals((await w.call('GET', `public/t/${token(reissued.body.messages[0].link)}`)).status, 200);
  assertEquals((await w.call('GET', `public/t/${token(person.link)}`)).status, 404);
});

// ---------------------------------------------------------------- share links

Deno.test('routes: a hiring manager share link is hashed, expires, can be revoked, and hides contacts unless HR opts in', async () => {
  const w = world();
  const { id, link } = await makeTest(w, { min_level: 'b1' });
  await invite(w, id, [{ name: 'Not Started', email: 'waiting@mail.uz' }]);
  await takeByOpenLink(w, link, { name: 'Strong One', email: 'strong@mail.uz', phone: '+998 90 123 45 67' }, true);
  await takeByOpenLink(w, link, { name: 'Weak One', email: 'weak@mail.uz' }, false);
  const strong = candidateByEmail(w, 'strong@mail.uz');
  await w.call('POST', `orgs/${ORG}/candidates/${strong.id}/notes`, { user: HR, body: { body: 'SECRET HR NOTE' } });

  const made = await w.call('POST', `orgs/${ORG}/assessments/${id}/shares`, { user: HR, body: { label: 'For the GM', days: 7 } });
  assertEquals(made.status, 200, JSON.stringify(made.body));
  const key = shareKey(made.body.link);
  const stored = w.db.rows('company_share_links')[0];
  assertEquals(stored.key_hash, await sha256(key));
  assert(!JSON.stringify(made.body.share).includes('key_hash'));
  assert(!JSON.stringify(w.db.rows('company_audit')).includes(key));

  const page = await w.call('GET', `public/s/${key}`);
  assertEquals(page.status, 200, JSON.stringify(page.body));
  assertEquals([page.body.kind, page.body.company, page.body.label], ['report', 'Silk Road Hotels', 'For the GM']);
  assertEquals(page.body.candidates.map((row: { name: string }) => row.name), ['Strong One', 'Weak One'], 'graded only, best first');
  const text = JSON.stringify(page.body);
  for (const secret of ['strong@mail.uz', '+998 90 123 45 67', 'SECRET HR NOTE', 'ip_hash', 'access_token']) assert(!text.includes(secret), secret);
  assertEquals(w.db.rows('company_share_links')[0].opens, 1);

  const withContacts = await w.call('POST', `orgs/${ORG}/assessments/${id}/shares`, { user: HR, body: { include_contacts: true, stages: ['interview'] } });
  const contactsPage = await w.call('GET', `public/s/${shareKey(withContacts.body.link)}`);
  assertEquals(contactsPage.body.candidates, [], 'nobody at interview yet');
  await w.call('PATCH', `orgs/${ORG}/candidates/${strong.id}`, { user: HR, body: { stage: 'interview' } });
  const filtered = await w.call('GET', `public/s/${shareKey(withContacts.body.link)}`);
  assertEquals([filtered.body.candidates.length, filtered.body.candidates[0].email, filtered.body.candidates[0].phone], [1, 'strong@mail.uz', '+998 90 123 45 67']);

  // Expired, revoked, unknown.
  assertEquals((await w.call('POST', `orgs/${ORG}/assessments/${id}/shares`, { user: HR, body: { days: 91 } })).status, 400);
  assertEquals((await w.call('POST', `orgs/${ORG}/assessments/${id}/shares`, { user: HR, body: { stages: ['nope'] } })).status, 400);
  assertEquals((await w.call('GET', 'public/s/short')).body.code, 'share_not_found');
  assertEquals((await w.call('GET', `public/s/${'a'.repeat(32)}`)).body.code, 'share_not_found');
  const later = w.clock.now;
  w.clock.now = new Date(later.getTime() + 8 * DAY);
  const expired = await w.call('GET', `public/s/${key}`);
  assertEquals([expired.status, expired.body.code], [410, 'share_expired']);
  w.clock.now = later;
  assertEquals((await w.call('DELETE', `orgs/${ORG}/shares/${stored.id}`, { user: FOREIGN_HR })).status, 403);
  assertEquals((await w.call('DELETE', `orgs/${ORG}/shares/${stored.id}`, { user: HR })).status, 200);
  assertEquals((await w.call('DELETE', `orgs/${ORG}/shares/${stored.id}`, { user: HR })).status, 200, 'revoking twice is harmless');
  assertEquals((await w.call('GET', `public/s/${key}`)).body.code, 'share_not_found');
  assertEquals((await w.call('DELETE', `orgs/${ORG}/shares/${crypto.randomUUID()}`, { user: HR })).status, 404);

  // A closed workspace shares nothing; a suspended one can still revoke.
  const list = await w.call('GET', `orgs/${ORG}/assessments/${id}/shares`, { user: HR });
  assertEquals(list.body.shares.map((row: { active: boolean }) => row.active).sort(), [false, true]);
  const org = w.db.rows('company_orgs')[0];
  org.status = 'suspended';
  const secondId = list.body.shares.find((row: { active: boolean }) => row.active).id;
  assertEquals((await w.call('POST', `orgs/${ORG}/assessments/${id}/shares`, { user: HR, body: {} })).status, 403);
  org.status = 'closed';
  assertEquals((await w.call('GET', `public/s/${shareKey(withContacts.body.link)}`)).body.code, 'share_not_found');
  org.status = 'suspended';
  assertEquals((await w.call('DELETE', `orgs/${ORG}/shares/${secondId}`, { user: HR })).status, 200);
});

Deno.test('routes: public share pages are rate limited per address', async () => {
  const w = world({ hits: 2 });
  const { id } = await makeTest(w);
  const made = await w.call('POST', `orgs/${ORG}/assessments/${id}/shares`, { user: HR, body: {} });
  const key = shareKey(made.body.link);
  assertEquals((await w.call('GET', `public/s/${key}`)).status, 200);
  assertEquals((await w.call('GET', `public/s/${key}`)).status, 200);
  const limited = await w.call('GET', `public/s/${key}`);
  assertEquals([limited.status, limited.body.code], [429, 'too_many_requests']);
  // Guessing keys counts too.
  assertEquals((await w.call('GET', `public/s/${'a'.repeat(32)}`)).status, 429);
});

Deno.test('routes: a feedback report is the candidate\'s own, only when graded, and HR may leave the written part out', async () => {
  const w = world();
  const { id, link } = await makeTest(w, { skills: ['grammar', 'writing'] });
  await invite(w, id, [{ name: 'Not Started', email: 'waiting@mail.uz' }]);
  const { view } = await takeByOpenLink(w, link, { name: 'Writer One', email: 'writer@mail.uz' });
  assertEquals(view.status, 'graded');
  const writer = candidateByEmail(w, 'writer@mail.uz');
  const waiting = candidateByEmail(w, 'waiting@mail.uz');
  assertEquals((await w.call('POST', `orgs/${ORG}/candidates/${waiting.id}/shares`, { user: HR })).body.code, 'not_graded');
  const made = await w.call('POST', `orgs/${ORG}/candidates/${writer.id}/shares`, { user: HR });
  assertEquals(made.status, 200, JSON.stringify(made.body));
  const page = await w.call('GET', `public/s/${shareKey(made.body.link)}`);
  assertEquals([page.body.kind, page.body.name], ['feedback', 'Writer One']);
  assertEquals(page.body.feedback.writing.improvements, ['Use past tenses']);
  assert(page.body.skills.grammar.level);
  const text = JSON.stringify(page.body);
  for (const secret of ['writer@mail.uz', 'integrity', 'rank', 'Not Started', 'notes', 'decision']) assert(!text.includes(secret), secret);
  const bare = await w.call('POST', `orgs/${ORG}/candidates/${writer.id}/shares`, { user: HR, body: { include_feedback: false } });
  assertEquals((await w.call('GET', `public/s/${shareKey(bare.body.link)}`)).body.feedback, null);
  assertEquals((await w.call('GET', `orgs/${ORG}/candidates/${writer.id}/shares`, { user: HR })).body.shares.length, 2);
  // HR opened it to a feedback text for the candidate.
  const message = await w.call('POST', `orgs/${ORG}/candidates/${writer.id}/message`, { user: HR, body: { kind: 'feedback', locale: 'en', link: made.body.link } });
  assertStringIncludes(message.body.text, made.body.link);
  assertStringIncludes(message.body.text, 'Schood estimates');
});

// ---------------------------------------------------------------- interview kit

Deno.test('routes: the interview kit uses AI without personal data, falls back to the bank, and is kept', async () => {
  const w = world();
  const { id, link } = await makeTest(w, { min_level: 'b2', skills: ['grammar', 'writing'], skill_minimums: { grammar: 'c1' } });
  await takeByOpenLink(w, link, { name: 'Kit Person', email: 'kit@mail.uz', phone: '+998 90 123 45 67' }, false);
  const person = candidateByEmail(w, 'kit@mail.uz');
  const url = `orgs/${ORG}/candidates/${person.id}/interview-kit`;

  // AI gave nothing usable: a full kit from the bank, aimed at what is weak.
  const fromBank = await w.call('POST', url, { user: HR, body: { locale: 'ru' } });
  assertEquals(fromBank.status, 200, JSON.stringify(fromBank.body));
  assertEquals([fromBank.body.kit.source, fromBank.body.kit.reason, fromBank.body.kit.locale], ['bank', 'ai_unavailable', 'ru']);
  assert(fromBank.body.kit.weak.includes('grammar'));
  assert(fromBank.body.kit.questions.some((row: { skill: string }) => row.skill === 'grammar'));
  assert(fromBank.body.kit.questions.some((row: { skill: string }) => row.skill === 'role'));
  assert(fromBank.body.kit.questions.every((row: { listen_for: string }) => /[а-яё]/i.test(row.listen_for)), 'listen-for in the locale');
  const asked = w.state.payloads.at(-1)!;
  for (const secret of ['Kit Person', 'kit@mail.uz', '+998']) assert(!asked.includes(secret), secret);

  // Reopening costs no AI.
  const count = w.state.payloads.length;
  const kept = await w.call('POST', url, { user: HR, body: { locale: 'ru' } });
  assertEquals(kept.body.kit.created_at, fromBank.body.kit.created_at);
  assertEquals(w.state.payloads.length, count);

  // A good reply is used and sanitised.
  w.state.kitReply = { questions: [{ skill: 'grammar', question: 'Tell me about yesterday.', follow_up: 'And tomorrow?', listen_for: 'Времена' }, { skill: 'role', question: 'A guest is upset.', follow_up: '', listen_for: '' }, { skill: 'grammar', question: 'What had you done?', follow_up: '', listen_for: '' }] };
  const fresh = await w.call('POST', url, { user: HR, body: { locale: 'ru', fresh: true } });
  assertEquals([fresh.body.kit.source, fresh.body.kit.questions.length], ['ai', 3]);
  assertEquals((await w.call('GET', `orgs/${ORG}/candidates/${person.id}`, { user: HR })).body.interview_kit.source, 'ai');

  // Over the daily AI limit: no AI call, still a kit.
  w.state.aiLeft = false;
  const before = w.state.payloads.length;
  const limited = await w.call('POST', url, { user: HR, body: { locale: 'en', fresh: true } });
  assertEquals([limited.body.kit.source, limited.body.kit.reason, w.state.payloads.length], ['bank', 'ai_limit', before]);
  assertEquals((await w.call('POST', url, { user: EMPLOYEE, body: {} })).status, 403);
});

// ---------------------------------------------------------------- retention

Deno.test('routes: deleting one candidate removes personal data everywhere and keeps the anonymous score', async () => {
  const w = world();
  const { id, link } = await makeTest(w);
  const { key } = await takeByOpenLink(w, link, { name: 'Erase Me', email: 'erase@mail.uz', phone: '+998 90 123 45 67' });
  const person = candidateByEmail(w, 'erase@mail.uz');
  await w.call('POST', `orgs/${ORG}/candidates/${person.id}/notes`, { user: HR, body: { body: 'Erase Me is great' } });
  const share = await w.call('POST', `orgs/${ORG}/candidates/${person.id}/shares`, { user: HR });
  const attempt = () => w.db.rows('company_attempts')[0];
  const score = attempt().overall_score;
  const certificate = attempt().certificate_code as string;
  assert(certificate);

  const erased = await w.call('POST', `orgs/${ORG}/candidates/${person.id}/erase`, { user: HR });
  assertEquals(erased.status, 200, JSON.stringify(erased.body));
  const everything = JSON.stringify([w.db.rows('company_candidates'), w.db.rows('company_candidate_notes'), w.db.rows('company_attempts')]);
  for (const secret of ['Erase Me', 'erase@mail.uz', '+998 90 123 45 67']) assert(!everything.includes(secret), secret);
  assertEquals(attempt().overall_score, score);
  assertEquals(Object.keys(attempt().answers as object).length, 0);
  assert(person.anonymised_at);
  assertEquals((await w.call('POST', 'public/attempts/state', { body: { key } })).status, 404);
  assertEquals((await w.call('GET', `public/v/${certificate}`)).status, 404, 'the public certificate goes too');
  assertEquals((await w.call('GET', `public/s/${shareKey(share.body.link)}`)).status, 404);

  // What is left cannot be acted on, and stays in the statistics.
  assertEquals((await w.call('PATCH', `orgs/${ORG}/candidates/${person.id}`, { user: HR, body: { stage: 'hired' } })).body.code, 'candidate_erased');
  assertEquals((await w.call('POST', `orgs/${ORG}/candidates/${person.id}/notes`, { user: HR, body: { body: 'x' } })).body.code, 'candidate_erased');
  assertEquals((await w.call('POST', `orgs/${ORG}/candidates/${person.id}/interview-kit`, { user: HR })).body.code, 'candidate_erased');
  assertEquals((await w.call('POST', `orgs/${ORG}/candidates/${person.id}/link`, { user: HR })).body.code, 'candidate_erased');
  assertEquals((await w.call('POST', `orgs/${ORG}/attempts/${attempt().id}/regrade`, { user: HR, body: {} })).body.code, 'candidate_erased');
  assertEquals((await w.call('POST', `orgs/${ORG}/candidates/${person.id}/erase`, { user: HR })).status, 200, 'erasing twice is harmless');
  const pipeline = await w.call('GET', `orgs/${ORG}/assessments/${id}/pipeline`, { user: HR });
  assertEquals([pipeline.body.candidates[0].name, pipeline.body.funnel.graded], [null, 1]);
  const pageShare = await w.call('POST', `orgs/${ORG}/assessments/${id}/shares`, { user: HR, body: {} });
  assertEquals((await w.call('GET', `public/s/${shareKey(pageShare.body.link)}`)).body.candidates, [], 'not in a manager\'s report');
  assertEquals(w.db.rows('company_orgs')[0].tests_used, 1, 'the used test is not refunded');
});

Deno.test('routes: someone mid-test cannot be erased until it ends; erasure works in a paused workspace; deleting an attempt removes the candidate', async () => {
  const w = world();
  const { id, link } = await makeTest(w);
  const started = await w.call('POST', `public/t/${token(link)}/start`, { body: { name: 'Running Now', email: 'run@mail.uz', consent: true } });
  const runner = candidateByEmail(w, 'run@mail.uz');
  const refused = await w.call('POST', `orgs/${ORG}/candidates/${runner.id}/erase`, { user: HR });
  assertEquals([refused.status, refused.body.code], [409, 'candidate_in_test']);
  const bulkRefused = await w.call('POST', `orgs/${ORG}/candidates/bulk/erase`, { user: HR, body: { ids: [runner.id] } });
  assertEquals([bulkRefused.body.erased, bulkRefused.body.running], [0, 1]);
  await finish(w, started.body.key, started.body.attempt);
  const { created } = await invite(w, id, [{ name: 'Waiting Person', email: 'wait@mail.uz' }]);
  const org = w.db.rows('company_orgs')[0];
  org.status = 'suspended';
  const bulk = await w.call('POST', `orgs/${ORG}/candidates/bulk/erase`, { user: HR, body: { ids: [runner.id, created[0].id] } });
  assertEquals([bulk.status, bulk.body.erased], [200, 2]);
  assertEquals((await w.call('GET', `public/t/${token(created[0].link)}`)).status, 404, 'the personal link is gone');
  org.status = 'active';

  // The older delete route on the report removes the candidate row with the attempt.
  const second = await takeByOpenLink(w, link, { name: 'Delete Me', email: 'delete@mail.uz' });
  assert(second.key);
  const row = candidateByEmail(w, 'delete@mail.uz');
  assertEquals((await w.call('DELETE', `orgs/${ORG}/attempts/${row.attempt_id}`, { user: HR })).status, 200);
  assert(!w.db.rows('company_candidates').some((entry) => entry.email === 'delete@mail.uz'));
});

Deno.test('routes: retention settings default to off and are validated', async () => {
  const w = world();
  const initial = await w.call('GET', `orgs/${ORG}/hiring/settings`, { user: HR });
  assertEquals([initial.body.retention_months, Object.keys(initial.body.templates).length], [null, 0]);
  assert(initial.body.defaults.invite.uz.body.includes('{link}'));
  assertEquals((await w.call('PUT', `orgs/${ORG}/hiring/settings`, { user: HR, body: { retention_months: 0 } })).status, 400);
  assertEquals((await w.call('PUT', `orgs/${ORG}/hiring/settings`, { user: HR, body: { retention_months: 121 } })).status, 400);
  assertEquals((await w.call('PUT', `orgs/${ORG}/hiring/settings`, { user: EMPLOYEE, body: { retention_months: 12 } })).status, 403);
  assertEquals((await w.call('PUT', `orgs/${ORG}/hiring/settings`, { user: HR, body: { retention_months: 12 } })).body.retention_months, 12);
  await w.call('PUT', `orgs/${ORG}/hiring/settings`, { user: HR, body: { retention_months: 24 } });
  assertEquals(w.db.rows('company_hiring_settings').length, 1);
  assertEquals((await w.call('GET', `orgs/${ORG}/hiring/settings`, { user: OWNER })).body.retention_months, 24);
  assertEquals((await w.call('PUT', `orgs/${ORG}/hiring/settings`, { user: HR, body: { templates: { offer: { en: { subject: 'S', body: 'B' } } } } })).body.retention_months, 24, 'saving templates keeps the period');
  assertEquals((await w.call('PUT', `orgs/${ORG}/hiring/settings`, { user: HR, body: { retention_months: null } })).body.retention_months, null);
  assertEquals((await w.call('GET', `orgs/${ORG}/hiring/settings`, { user: FOREIGN_HR })).status, 403);
  assert((await w.call('GET', `orgs/${FOREIGN}/hiring/settings`, { user: FOREIGN_HR })).body.retention_months === null, 'another workspace has its own');
});

// ---------------------------------------------------------------- preview and health

Deno.test('routes: HR can try a test as a candidate: no test used, nothing stored, no AI, no keys', async () => {
  const w = world();
  const { id } = await makeTest(w, { skills: ['grammar', 'vocabulary', 'reading', 'writing'] });
  const before = JSON.stringify(w.db.tables);
  const url = `orgs/${ORG}/assessments/${id}/preview`;
  const started = await w.call('POST', url, { user: HR, body: { action: 'start' } });
  assertEquals(started.status, 200, JSON.stringify(started.body));
  let { state, attempt } = started.body;
  assertEquals(attempt.status, 'started');
  assert(!JSON.stringify(state).includes('"answer"'), 'no answer keys in what the page holds');
  for (let guard = 0; guard < 20 && attempt.status === 'started'; guard++) {
    const at = { current: attempt.current, stage: attempt.section.stage ?? null };
    const moved = await w.call('POST', url, { user: HR, body: { action: 'next', state, answers: {}, at } });
    assertEquals(moved.status, 200, JSON.stringify(moved.body));
    // A retry of the same step does not move twice.
    if (moved.body.attempt.status === 'started') {
      const retried = await w.call('POST', url, { user: HR, body: { action: 'next', state: moved.body.state, answers: {}, at } });
      assertEquals(retried.body.attempt.current, moved.body.attempt.current);
    }
    state = moved.body.state;
    attempt = moved.body.attempt;
  }
  assertEquals(attempt.status, 'graded');
  assert(attempt.result.skills.grammar.level);
  assertEquals(attempt.result.certificate_code, null);
  assertEquals(JSON.stringify(w.db.tables), before, 'nothing written, no test used');
  assertEquals(w.state.payloads.length, 0, 'no AI');

  const early = await w.call('POST', url, { user: HR, body: { action: 'start' } });
  const submitted = await w.call('POST', url, { user: HR, body: { action: 'submit', state: early.body.state, answers: {} } });
  assertEquals(submitted.body.attempt.status, 'graded');

  assertEquals((await w.call('POST', url, { user: HR, body: { action: 'next', state: { items: [{ skill: 'nope' }] } } })).status, 400);
  assertEquals((await w.call('POST', url, { user: HR, body: { action: 'next', state: { items: [{ skill: 'grammar', status: 'active', stages: 'bad' }] } } })).status, 400);
  assertEquals((await w.call('POST', url, { user: HR, body: { action: 'nope' } })).status, 400);
  assertEquals((await w.call('POST', url, { user: EMPLOYEE, body: { action: 'start' } })).status, 403);
  assertEquals((await w.call('POST', url, { user: MANAGER, body: { action: 'start' } })).status, 403);
  w.db.rows('company_orgs')[0].status = 'suspended';
  assertEquals((await w.call('POST', url, { user: HR, body: { action: 'start' } })).status, 200, 'writes nothing, so a pause does not stop it');
});

Deno.test('routes: test health counts completion and points at questions nearly everyone gets right or wrong', async () => {
  const w = world();
  const { id, link } = await makeTest(w, { skills: ['grammar'] });
  const empty = await w.call('GET', `orgs/${ORG}/assessments/${id}/health`, { user: HR });
  assertEquals([empty.body.started, empty.body.completion, empty.body.flagged.length], [0, null, 0]);
  for (let index = 0; index < 6; index++) {
    w.clock.now = new Date(w.clock.now.getTime() + 61 * MINUTE);
    await takeByOpenLink(w, link, { name: `Person ${index}`, email: `p${index}@mail.uz` }, true);
  }
  const health = await w.call('GET', `orgs/${ORG}/assessments/${id}/health`, { user: HR });
  assertEquals([health.body.started, health.body.finished, health.body.completion], [6, 6, 100]);
  assert(health.body.skills[0].average > 0);
  assert(health.body.flagged.every((row: { rate: number }) => row.rate >= 95));
  assert(!JSON.stringify(health.body).includes('@mail.uz'), 'no personal data');
  assertEquals((await w.call('GET', `orgs/${ORG}/assessments/${id}/health`, { user: MANAGER })).status, 403);
});
