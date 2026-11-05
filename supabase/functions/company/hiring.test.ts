import { assert, assertEquals, assertNotEquals } from 'jsr:@std/assert@1';
import { JOB_ROLES } from '../../../packages/company-core/src/mod.ts';
import { SaveGate, TIME_UP_RETRY_MS, decodeLink, encodeLink, keyIsGone, resumeStep, timeUpSubmitDue } from '../../../apps/company/src/areas/hiring/flow.ts';
import { routes as core } from './core.ts';
import { routes as hiring } from './hiring.ts';
import {
  BANK_LEVELS, CHOICES, GRAMMAR, LISTENING, QUESTIONS, READING, SPEAKING, VOCABULARY, WRITING,
  type ChoiceItem, type Question,
} from './hiring/bank/index.ts';
import {
  ADAPTIVE_STAGES, STAGE_SIZE, advance, closeAll, createSections, nextStageLevel, scoreSection, stageEstimate,
  type Answers, type Section,
} from './hiring/engine.ts';
import { parseGrade } from './hiring/grading.ts';
import { integrityFlags, mergeIntegrity } from './hiring/integrity.ts';
import { STARTS_PER_HOUR } from './hiring/public.ts';
import { attemptsCsv } from './hiring/shared.ts';
import { FakeDb, testHandler } from './testing.ts';
import type { AiCall } from './types.ts';

// ---------------------------------------------------------------- bank

const ROLES_SPECIFIC = JOB_ROLES.filter((role) => role !== 'general');

function checkChoice(item: { id: string; options: string[]; answer: number }, where: string) {
  assert(item.options.length >= 3 && item.options.length <= 4, `${where} ${item.id}: 3-4 options`);
  assertEquals(new Set(item.options.map((option) => option.trim().toLowerCase())).size, item.options.length, `${where} ${item.id}: options distinct`);
  assert(item.options.every((option) => option.trim().length > 0), `${where} ${item.id}: empty option`);
  assert(Number.isInteger(item.answer) && item.answer >= 0 && item.answer < item.options.length, `${where} ${item.id}: answer key in range`);
}

Deno.test('bank: grammar and vocabulary meet the minimum counts and shape', () => {
  assert(GRAMMAR.length >= 70, `grammar ${GRAMMAR.length}`);
  assert(VOCABULARY.length >= 70, `vocabulary ${VOCABULARY.length}`);
  for (const [list, skill] of [[GRAMMAR, 'grammar'], [VOCABULARY, 'vocabulary']] as [ChoiceItem[], string][]) {
    for (const item of list) {
      assertEquals(item.skill, skill, item.id);
      assert(BANK_LEVELS.includes(item.level), `${item.id}: level`);
      assert((JOB_ROLES as readonly string[]).includes(item.job_role), `${item.id}: job role`);
      assertEquals(item.prompt.split('___').length, 2, `${item.id}: exactly one gap`);
      checkChoice(item, skill);
    }
    // The adaptive engine needs a full stage at every level and three at B1 (the start).
    for (const level of ['a1', 'a2', 'b1', 'b2', 'c1'] as const) assert(list.filter((item) => item.level === level).length >= STAGE_SIZE, `${skill} ${level} has a full stage`);
    assert(list.filter((item) => item.level === 'b1').length >= STAGE_SIZE * ADAPTIVE_STAGES, `${skill} b1 can hold every stage`);
    assert(list.some((item) => item.level === 'c2'), `${skill} has a few c2 items`);
  }
  for (const role of ROLES_SPECIFIC) assert(VOCABULARY.filter((item) => item.job_role === role).length >= 4, `vocabulary for ${role}`);
});

Deno.test('bank: reading and listening texts', () => {
  assert(READING.length >= 12 && LISTENING.length >= 12);
  const genres = { reading: ['email', 'notice', 'policy', 'report', 'chat'], listening: ['call', 'meeting', 'announcement', 'voicemail'] };
  for (const passage of [...READING, ...LISTENING]) {
    assert(['a2', 'b1', 'b2', 'c1'].includes(passage.level), `${passage.id}: A2–C1`);
    assert((genres[passage.skill] as string[]).includes(passage.genre), `${passage.id}: genre`);
    assert((JOB_ROLES as readonly string[]).includes(passage.job_role), `${passage.id}: job role`);
    assert(passage.title.trim().length > 0);
    const [min, max] = passage.skill === 'reading' ? [3, 5] : [3, 4];
    assert(passage.questions.length >= min && passage.questions.length <= max, `${passage.id}: ${passage.questions.length} questions`);
    for (const question of passage.questions as Question[]) {
      assert(question.id.startsWith(`${passage.id}-`), `${question.id} belongs to ${passage.id}`);
      checkChoice(question, passage.id);
    }
    if (passage.skill === 'reading') assert(passage.text.split(/\s+/).length >= 60, `${passage.id}: long enough`);
    else {
      assert(passage.lines.length >= 1 && passage.lines.every((line) => line.speaker.trim() && line.text.trim()), `${passage.id}: lines`);
      // Text-to-speech reads words: no digits in scripts.
      assert(passage.lines.every((line) => !/\d/.test(line.text)), `${passage.id}: numbers are written out`);
    }
  }
  for (const list of [READING, LISTENING]) for (const level of ['a2', 'b1', 'b2', 'c1']) assert(list.filter((passage) => passage.level === level).length >= 2, `two texts at ${level}`);
  for (const genre of genres.reading) assert(READING.some((passage) => passage.genre === genre), `reading ${genre}`);
  for (const genre of genres.listening) assert(LISTENING.some((passage) => passage.genre === genre), `listening ${genre}`);
});

Deno.test('bank: writing and speaking tasks for every job role', () => {
  for (const role of JOB_ROLES) {
    assert(WRITING.filter((task) => task.job_role === role).length >= 2, `writing for ${role}`);
    assert(SPEAKING.filter((task) => task.job_role === role).length >= 3, `speaking for ${role}`);
  }
  for (const task of [...WRITING, ...SPEAKING]) {
    assert(BANK_LEVELS.includes(task.level), task.id);
    assert(task.prompt.trim().length > 20, `${task.id}: prompt`);
    assert(task.points.length >= 2 && task.points.length <= 4, `${task.id}: points`);
    assert(task.target > 0, `${task.id}: target`);
  }
});

Deno.test('bank: every id is unique', () => {
  const ids = [
    ...GRAMMAR, ...VOCABULARY, ...READING, ...LISTENING, ...WRITING, ...SPEAKING,
  ].map((entry) => entry.id).concat([...READING, ...LISTENING].flatMap((passage) => passage.questions.map((question) => question.id)));
  assertEquals(new Set(ids).size, ids.length);
});

// ---------------------------------------------------------------- engine

function seeded(seed = 7) {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
}

/** Answers every served question right (or wrong) by looking up the bank, like a perfect (or hopeless) candidate. */
function oracle(section: Section, right: boolean | ((id: string) => boolean)): Answers {
  const answers: Answers = {};
  const correct = (id: string, options: string[]) => {
    const item = CHOICES.get(id) ?? QUESTIONS.get(id)!.question;
    const key = options.indexOf(item.options[item.answer]);
    const good = typeof right === 'function' ? right(id) : right;
    return good ? key : (key + 1) % options.length;
  };
  for (const stage of section.stages ?? []) for (const item of stage.items) answers[item.id] = correct(item.id, item.options);
  for (const passage of section.passages ?? []) for (const question of passage.questions) answers[question.id] = correct(question.id, question.options);
  for (const task of section.tasks ?? []) answers[task.id] = section.skill === 'writing' ? 'Dear Ms Karimova, thank you for your message about the booking.' : { transcript: 'Good morning, I would be happy to help you today.', mode: 'speech' };
  return answers;
}

function run(skills: string[], right: boolean, jobRole: 'general' | 'hospitality' = 'general') {
  const options = { jobRole, rng: seeded(), now: '2026-10-30T09:00:00.000Z', fallback: 'b1' as const };
  let sections = createSections(skills, options), results = {}, answers: Answers = {};
  for (let guard = 0; guard < 40; guard++) {
    const active = sections.find((section) => section.status === 'active');
    if (!active) break;
    answers = { ...answers, ...oracle(active, right) };
    const moved = advance(sections, answers, results, options);
    sections = moved.sections;
    results = moved.results;
    if (moved.finished) break;
  }
  return { sections, results: results as Record<string, { score: number; level: string; stages?: { level: string }[] }>, answers };
}

Deno.test('engine: stage estimates map onto the CEFR floors', () => {
  assertEquals(stageEstimate('b1', 0), 32);
  assertEquals(stageEstimate('b1', 1), 65);
  assertEquals(stageEstimate('a1', 0), 0);
  assertEquals(stageEstimate('c2', 1), 100);
  assertEquals(nextStageLevel('b1', 5), 'b2');
  assertEquals(nextStageLevel('b1', 4), 'b2');
  assertEquals(nextStageLevel('b1', 3), 'b1');
  assertEquals(nextStageLevel('b1', 2), 'a2');
  assertEquals(nextStageLevel('a1', 0), 'a1');
  assertEquals(nextStageLevel('c2', 5), 'c2');
});

Deno.test('engine: adaptive grammar starts at B1 and climbs or falls by stage', () => {
  const strong = run(['grammar'], true);
  const stages = strong.sections[0].stages!;
  assertEquals(stages.length, ADAPTIVE_STAGES);
  assertEquals(stages.map((stage) => stage.level), ['b1', 'b2', 'c1']);
  assert(stages.every((stage) => stage.items.length === STAGE_SIZE));
  assertEquals(new Set(stages.flatMap((stage) => stage.items.map((item) => item.id))).size, STAGE_SIZE * ADAPTIVE_STAGES, 'no item repeats');
  assertEquals(strong.results.grammar.level, 'c1');
  const weak = run(['grammar'], false);
  assertEquals(weak.sections[0].stages!.map((stage) => stage.level), ['b1', 'a2', 'a1']);
  assertEquals(weak.results.grammar.level, 'pre_a1');
  assert(strong.results.grammar.score > weak.results.grammar.score);
});

Deno.test('engine: served items carry no answer keys and options are shuffled copies', () => {
  const sections = createSections(['grammar', 'reading'], { jobRole: 'general', rng: seeded(3), now: 'x', fallback: 'b1' });
  const json = JSON.stringify(sections);
  assert(!json.includes('"answer"'));
  for (const item of sections[0].stages![0].items) {
    const bank = CHOICES.get(item.id)!;
    assertEquals([...item.options].sort(), [...bank.options].sort());
  }
});

Deno.test('engine: reading is pitched at the estimated level and the one below; vocabulary prefers the job role', () => {
  const strong = run(['grammar', 'vocabulary', 'reading', 'listening', 'writing', 'speaking'], true, 'hospitality');
  const reading = strong.sections.find((section) => section.skill === 'reading')!;
  assertEquals(reading.passages!.map((passage) => passage.level), ['b2', 'c1']);
  const vocabulary = strong.sections.find((section) => section.skill === 'vocabulary')!;
  assert(vocabulary.stages!.flatMap((stage) => stage.items).some((item) => item.id.startsWith('v-hos-')), 'a hospitality item is served');
  assertEquals(strong.sections.find((section) => section.skill === 'writing')!.tasks!.length, 1);
  assertEquals(strong.sections.find((section) => section.skill === 'speaking')!.tasks!.length, 2);
  assert(strong.sections.find((section) => section.skill === 'writing')!.tasks!.every((task) => task.id.startsWith('w-hos-')));
  const weak = run(['grammar', 'reading'], false);
  assertEquals(weak.sections[1].passages!.map((passage) => passage.level), ['a2', 'a2']);
  assert(weak.results.reading.score < 30);
});

Deno.test('engine: closing early scores what was done and marks unreached sections as skipped', () => {
  const sections = createSections(['grammar', 'reading', 'writing'], { jobRole: 'general', rng: seeded(), now: 'x', fallback: 'b1' });
  const closed = closeAll(sections, oracle(sections[0], true), {}, 'y');
  assertEquals(closed.results.reading?.source, 'skipped');
  assertEquals(closed.results.writing?.source, 'skipped');
  assertEquals(closed.results.grammar?.source, 'auto');
  assert(closed.sections.every((section) => section.status === 'done'));
  assertEquals(scoreSection(closed.sections[2], {}), null);
});

Deno.test('grading: AI replies are validated and the score comes from the criteria', () => {
  const good = parseGrade('writing', { criteria: { task: 70, organisation: 60, grammar: 50, vocabulary: 60 }, strengths: ['a', 'b'], improvements: ['c'], summary: 'ok' }, 'ru', false)!;
  assertEquals(good.score, 60);
  assertEquals(good.feedback.locale, 'ru');
  assertEquals(parseGrade('writing', { criteria: { task: 'x' } }, 'en', false), null);
  assertEquals(parseGrade('writing', 'nope', 'en', false), null);
  const typed = parseGrade('speaking', { criteria: { task: 50, organisation: 50, grammar: 50, vocabulary: 50, fluency: 50 }, strengths: [], improvements: [], summary: '' }, 'uz', true)!;
  assertEquals(typed.feedback.typed_only, true);
  assertEquals(parseGrade('speaking', { criteria: { task: 150, organisation: -3, grammar: 50, vocabulary: 50, fluency: 50, pronunciation: 50 } }, 'en', false)!.feedback.criteria.task, 100);
});

Deno.test('integrity: counters never go down and become flags', () => {
  let integrity = mergeIntegrity({}, { tab_hidden: 4, paste: 1, section_seconds: { grammar: 12 }, plays: { 'l-a2-01': 3, '../x': 9 } });
  integrity = mergeIntegrity(integrity, { tab_hidden: 1, paste: 0 });
  assertEquals(integrity.tab_hidden, 4);
  assertEquals(integrity.plays, { 'l-a2-01': 3 });
  const sections = createSections(['grammar'], { jobRole: 'general', rng: seeded(), now: 'x', fallback: 'b1' }).map((section) => ({ ...section, status: 'done' as const }));
  const codes = integrityFlags(integrity, sections, 2).map((flag) => flag.code);
  assertEquals(codes, ['tab_hidden', 'paste', 'rushed', 'extra_plays', 'same_network']);
});

Deno.test('csv: quotes cells and neutralises spreadsheet formulas', () => {
  const csv = attemptsCsv([{
    id: 'x', name: '=HYPERLINK("http://bad")', email: 'a@b.uz', phone: '+998 90 000 00 00', member_id: null, status: 'graded',
    started_at: 's', submitted_at: 't', graded_at: 't', overall_level: 'b1', overall_score: 55, skills: { grammar: { score: 55, level: 'b1', source: 'auto' } },
    pending: [], decision: 'shortlist', notes: 'Good, "calm" voice', meets: true, flags: [], certificate_code: 'ABCDEFGHJK',
  }], ['grammar']);
  assert(csv.startsWith('﻿Name,Email'));
  assert(csv.includes(`"'=HYPERLINK(""http://bad"")"`));
  assert(csv.includes(`'+998 90 000 00 00`));
  assert(csv.includes('"Good, ""calm"" voice"'));
  assert(csv.includes('B1 Intermediate') || csv.includes('B1'));
});

// ---------------------------------------------------------------- routes

const OWNER = '00000000-0000-4000-8000-0000000000b1';
const HR_ADMIN = '00000000-0000-4000-8000-0000000000b2';
const MANAGER = '00000000-0000-4000-8000-0000000000b3';
const EMPLOYEE = '00000000-0000-4000-8000-0000000000b4';
const OTHER = '00000000-0000-4000-8000-0000000000b5';
const ORG = '00000000-0000-4000-8000-00000000c0c0';
const FRONT = '00000000-0000-4000-8000-00000000d001';
const SALES = '00000000-0000-4000-8000-00000000d002';

const gradeReply = (score: number) => ({ criteria: { task: score, organisation: score, grammar: score, vocabulary: score, fluency: score, pronunciation: score }, strengths: ['Clear greeting'], improvements: ['Use past tenses'], summary: 'Solid.' });

function world(options: { ai?: 'ok' | 'down'; testsLimit?: number | null } = {}) {
  const member = (id: string, user: string, role: string, department: string | null, extra: Record<string, unknown> = {}) =>
    ({ id, org_id: ORG, user_id: user, email: `${user.slice(-2)}@x.uz`, full_name: `Person ${user.slice(-2)}`, role, department_id: department, job_role: 'hospitality', status: 'active', seat: true, level: null, level_score: null, level_source: null, level_at: null, target_level: null, target_date: null, consent_at: null, joined_at: '2026-01-01T00:00:00Z', ...extra });
  const db = new FakeDb({
    users: [OWNER, HR_ADMIN, MANAGER, EMPLOYEE, OTHER].map((id) => ({ id, role: 'user' })),
    company_orgs: [{ id: ORG, name: 'Silk Road Hotels', industry: 'hospitality', size_band: '51-200', city: null, contact_phone: null, billing_email: null, tax_id: null, status: 'active', seats_limit: 10, tests_limit: options.testsLimit === undefined ? 100 : options.testsLimit, tests_used: 0, contract_ends_at: null, settings: { locale: 'ru' }, created_at: '2026-01-01T00:00:00Z' }],
    company_departments: [{ id: FRONT, org_id: ORG, name: 'Front office' }, { id: SALES, org_id: ORG, name: 'Sales' }],
    company_members: [
      member('00000000-0000-4000-8000-0000000000e1', OWNER, 'owner', null),
      member('00000000-0000-4000-8000-0000000000e2', HR_ADMIN, 'admin', null),
      member('00000000-0000-4000-8000-0000000000e3', MANAGER, 'manager', FRONT),
      member('00000000-0000-4000-8000-0000000000e4', EMPLOYEE, 'employee', FRONT, { level: 'a2' }),
      member('00000000-0000-4000-8000-0000000000e5', OTHER, 'employee', SALES),
    ],
  });
  db.rpcs.company_reserve_test = ({ p_org }) => {
    const org = db.rows('company_orgs').find((row) => row.id === p_org)!;
    if (org.tests_limit !== null && Number(org.tests_used) >= Number(org.tests_limit)) return false;
    org.tests_used = Number(org.tests_used) + 1;
    return true;
  };
  db.rpcs.company_consume_ai = () => true;
  const calls: string[] = [];
  let aiMode = options.ai ?? 'ok';
  const ai: AiCall = <T>(request: { feature: string }, fallback: T) => {
    calls.push(request.feature);
    return Promise.resolve(aiMode === 'ok' ? { data: gradeReply(request.feature === 'company-writing-grade' ? 62 : 58) as T, status: 'ok' as const } : { data: fallback, status: 'failed' as const });
  };
  const clock = { now: new Date('2026-10-30T09:00:00.000Z') };
  const call = testHandler(db, [...core, ...hiring], { ai, now: () => clock.now });
  return { db, call, calls, clock, setAi: (mode: 'ok' | 'down') => { aiMode = mode; } };
}

const linkToken = (link: string) => link.split('/t/')[1];

/** Plays a whole test through the public routes, answering objective questions right. */
async function takeTest(call: ReturnType<typeof world>['call'], token: string, who: { name: string; email: string }, right = true) {
  const started = await call('POST', `public/t/${token}/start`, { body: { ...who, phone: '+998 90 123 45 67', consent: true } });
  assertEquals(started.status, 200, JSON.stringify(started.body));
  const key = started.body.key as string;
  let view = started.body.attempt;
  for (let guard = 0; guard < 30 && view.status === 'started'; guard++) {
    const section = view.section;
    const answers: Record<string, unknown> = {};
    for (const item of section.items ?? []) {
      const bank = CHOICES.get(item.id)!;
      const key = item.options.indexOf(bank.options[bank.answer]);
      answers[item.id] = right ? key : (key + 1) % item.options.length;
    }
    for (const passage of section.passages ?? []) for (const question of passage.questions) {
      const bank = QUESTIONS.get(question.id)!.question;
      const key = question.options.indexOf(bank.options[bank.answer]);
      answers[question.id] = right ? key : (key + 1) % question.options.length;
    }
    for (const task of section.tasks ?? []) {
      answers[task.id] = section.skill === 'writing'
        ? 'Dear guest, thank you for choosing our hotel. Your room is booked from Friday to Sunday and breakfast is included.'
        : { transcript: 'Good evening and welcome. I am sorry about the wait; let me check your booking right away.', mode: 'speech' };
    }
    const last = view.current === view.sections.length - 1 && (!section.stages || section.stage === section.stages);
    const step = await call('POST', last ? 'public/attempts/submit' : 'public/attempts/next', { body: { key, answers, integrity: { tab_hidden: 1, section_seconds: { [section.skill]: 300 } } } });
    assertEquals(step.status, 200, JSON.stringify(step.body));
    view = step.body.attempt;
  }
  return { key, view };
}

Deno.test('routes: HR creates a hiring test; only HR may', async () => {
  const { db, call } = world();
  const body = { title: 'Front desk receptionist', job_role: 'hospitality', skills: ['grammar', 'vocabulary', 'reading', 'listening', 'writing', 'speaking'], min_level: 'b1', time_limit_minutes: 60, show_level: true };
  assertEquals((await call('POST', `orgs/${ORG}/assessments`, { user: EMPLOYEE, body })).status, 403);
  assertEquals((await call('POST', `orgs/${ORG}/assessments`, { user: MANAGER, body })).status, 403);
  const created = await call('POST', `orgs/${ORG}/assessments`, { user: HR_ADMIN, body });
  assertEquals(created.status, 200);
  assert(String(created.body.link).startsWith('https://company.schood.online/t/'));
  assertEquals(created.body.assessment.has_link, true);
  assertEquals(created.body.assessment.link_token_hash, undefined);
  assertEquals(db.rows('company_audit').at(-1)!.action, 'hiring.test_created');
  const bad = await call('POST', `orgs/${ORG}/assessments`, { user: HR_ADMIN, body: { ...body, skills: ['typing'] } });
  assertEquals([bad.status, bad.body.field], [400, 'skills']);
  const list = await call('GET', `orgs/${ORG}/assessments?kind=hiring`, { user: OWNER });
  assertEquals(list.body.assessments.length, 1);
  assertEquals(list.body.usage.tests_limit, 100);
});

Deno.test('routes: a candidate takes the test end to end, AI grades, HR decides, certificate verifies', async () => {
  const { db, call, calls } = world();
  const created = await call('POST', `orgs/${ORG}/assessments`, { user: HR_ADMIN, body: { title: 'Front desk receptionist', job_role: 'hospitality', skills: ['grammar', 'vocabulary', 'reading', 'listening', 'writing', 'speaking'], min_level: 'b1', show_level: true } });
  const token = linkToken(created.body.link);
  const intro = await call('GET', `public/t/${token}`);
  assertEquals([intro.status, intro.body.open, intro.body.test.company, intro.body.test.speaking], [200, true, 'Silk Road Hotels', true]);
  assertEquals((await call('POST', `public/t/${token}/start`, { body: { name: 'Aziza', email: 'aziza@mail.uz', consent: false } })).body.code, 'consent_required');

  const { key, view } = await takeTest(call, token, { name: 'Aziza Rakhimova', email: 'Aziza@Mail.uz' });
  assertEquals(view.status, 'graded');
  assertEquals(calls.sort(), ['company-speaking-grade', 'company-writing-grade']);
  assert(view.result.certificate_code.length === 10);
  assertEquals(view.result.skills.writing.score, 62);
  assertEquals(view.result.feedback, undefined, 'candidates do not get HR feedback');
  assertEquals(db.rows('company_orgs')[0].tests_used, 1);
  // The served test never carried an answer key.
  assert(!JSON.stringify(db.rows('company_attempts')[0].items).includes('"answer"'));
  // A reload resumes on the finished state.
  assertEquals((await call('POST', 'public/attempts/state', { body: { key } })).body.attempt.status, 'graded');
  // The same email cannot take it twice.
  assertEquals((await call('POST', `public/t/${token}/start`, { body: { name: 'Aziza R', email: 'aziza@mail.uz', consent: true } })).body.code, 'cannot_start');

  const detail = await call('GET', `orgs/${ORG}/assessments/${created.body.assessment.id}`, { user: HR_ADMIN });
  assertEquals(detail.body.attempts.length, 1);
  const row = detail.body.attempts[0];
  assertEquals([row.status, row.meets, row.email], ['graded', true, 'aziza@mail.uz']);
  const report = await call('GET', `orgs/${ORG}/attempts/${row.id}`, { user: HR_ADMIN });
  assertEquals(report.body.attempt.feedback.writing.strengths, ['Clear greeting']);
  assertEquals(report.body.attempt.integrity.ip_hash, undefined);
  assert(report.body.attempt.sections.find((section: { skill: string }) => section.skill === 'speaking').tasks[0].answer.includes('welcome'));
  const decided = await call('PATCH', `orgs/${ORG}/attempts/${row.id}`, { user: HR_ADMIN, body: { decision: 'shortlist', notes: 'Call for interview' } });
  assertEquals(decided.body.decision, 'shortlist');
  assertEquals((await call('PATCH', `orgs/${ORG}/attempts/${row.id}`, { user: MANAGER, body: { decision: 'reject' } })).status, 403);
  assertEquals((await call('GET', `orgs/${ORG}/attempts/${row.id}`, { user: MANAGER })).status, 403, 'managers do not see candidates');

  const certificate = await call('GET', `public/v/${view.result.certificate_code.toLowerCase()}`);
  assertEquals(certificate.body.certificate.name, 'Aziza Rakhimova');
  assertEquals(certificate.body.certificate.company, 'Silk Road Hotels');
  assertEquals(certificate.body.certificate.email, undefined);
  assertEquals((await call('GET', 'public/v/AAAAAAAAAA')).status, 404);

  const csv = await call('GET', `orgs/${ORG}/assessments/${created.body.assessment.id}/export`, { user: HR_ADMIN });
  assert(csv.body.csv.includes('Aziza Rakhimova'));
  assert(csv.body.filename.endsWith('.csv'));
});

Deno.test('routes: when AI is down the attempt waits; HR grades again or scores by hand', async () => {
  const { call, setAi } = world({ ai: 'down' });
  const created = await call('POST', `orgs/${ORG}/assessments`, { user: HR_ADMIN, body: { title: 'Sales agent', job_role: 'sales', skills: ['grammar', 'writing', 'speaking'] } });
  const { view } = await takeTest(call, linkToken(created.body.link), { name: 'Timur', email: 'timur@mail.uz' });
  assertEquals(view.status, 'submitted');
  assertEquals(view.result, null);
  const id = (await call('GET', `orgs/${ORG}/assessments/${created.body.assessment.id}`, { user: HR_ADMIN })).body.attempts[0].id;
  let report = await call('GET', `orgs/${ORG}/attempts/${id}`, { user: HR_ADMIN });
  assertEquals(report.body.attempt.pending, ['writing', 'speaking']);
  assertEquals(report.body.attempt.feedback.reason, 'ai_unavailable');
  // Still down: grading again keeps it pending.
  assertEquals((await call('POST', `orgs/${ORG}/attempts/${id}/regrade`, { user: HR_ADMIN })).body.attempt.status, 'submitted');
  // HR scores writing by hand; AI comes back for speaking.
  report = await call('POST', `orgs/${ORG}/attempts/${id}/score`, { user: HR_ADMIN, body: { skill: 'writing', score: 55 } });
  assertEquals(report.body.attempt.pending, ['speaking']);
  assertEquals(report.body.attempt.results.writing.source, 'manual');
  setAi('ok');
  report = await call('POST', `orgs/${ORG}/attempts/${id}/regrade`, { user: HR_ADMIN });
  assertEquals(report.body.attempt.status, 'graded');
  assertEquals(report.body.attempt.results.speaking.score, 58);
  assert(report.body.attempt.certificate_code);
  // Grading a skill again replaces it but keeps the old one if AI fails.
  setAi('down');
  report = await call('POST', `orgs/${ORG}/attempts/${id}/regrade`, { user: HR_ADMIN, body: { skill: 'speaking' } });
  assertEquals([report.body.attempt.status, report.body.attempt.results.speaking.score], ['graded', 58]);
});

Deno.test('routes: public starts are limited per network, per test size and by the workspace quota', async () => {
  const { call } = world({ testsLimit: 7 });
  const created = await call('POST', `orgs/${ORG}/assessments`, { user: HR_ADMIN, body: { title: 'Call centre', skills: ['grammar'], max_attempts: 6 } });
  const token = linkToken(created.body.link);
  const start = (index: number) => call('POST', `public/t/${token}/start`, { body: { name: `Candidate ${index}`, email: `c${index}@mail.uz`, consent: true } });
  for (let index = 0; index < 5; index++) assertEquals((await start(index)).status, 200);
  const limited = await start(5);
  assertEquals([limited.status, limited.body.code], [429, 'too_many_starts']);

  const other = await call('POST', `orgs/${ORG}/assessments`, { user: HR_ADMIN, body: { title: 'Porter', skills: ['grammar'] } });
  const otherToken = linkToken(other.body.link);
  assertEquals((await call('POST', `public/t/${otherToken}/start`, { body: { name: 'A', email: 'x1@mail.uz', consent: true } })).status, 400, 'name too short');
  assertEquals((await call('POST', `public/t/${otherToken}/start`, { body: { name: 'Ann', email: 'x1@mail.uz', consent: true } })).status, 200);
  assertEquals((await call('POST', `public/t/${otherToken}/start`, { body: { name: 'Ann', email: 'x2@mail.uz', consent: true } })).status, 200);
  const exhausted = await call('POST', `public/t/${otherToken}/start`, { body: { name: 'Ann', email: 'x3@mail.uz', consent: true } });
  assertEquals([exhausted.status, exhausted.body.code], [402, 'tests_exhausted']);

  // Closing the test closes the link.
  await call('PATCH', `orgs/${ORG}/assessments/${other.body.assessment.id}`, { user: HR_ADMIN, body: { status: 'closed' } });
  assertEquals((await call('GET', `public/t/${otherToken}`)).body.open, false);
  assertEquals((await call('POST', `public/t/${otherToken}/start`, { body: { name: 'Ann', email: 'x4@mail.uz', consent: true } })).body.code, 'test_closed');
  // A new link replaces the old one.
  const relinked = await call('POST', `orgs/${ORG}/assessments/${created.body.assessment.id}/link`, { user: HR_ADMIN });
  assertEquals((await call('GET', `public/t/${token}`)).status, 404);
  assertEquals((await call('GET', `public/t/${linkToken(relinked.body.link)}`)).status, 200);
  const copy = await call('POST', `orgs/${ORG}/assessments/${created.body.assessment.id}/duplicate`, { user: HR_ADMIN });
  assertEquals(copy.body.assessment.title, 'Call centre (copy)');
  assertNotEquals(copy.body.link, relinked.body.link);
});

Deno.test('routes: the server keeps the deadline and closes overdue attempts with what was saved', async () => {
  const { call, clock } = world();
  const created = await call('POST', `orgs/${ORG}/assessments`, { user: HR_ADMIN, body: { title: 'Driver', skills: ['grammar', 'reading'], time_limit_minutes: 10 } });
  const token = linkToken(created.body.link);
  const started = await call('POST', `public/t/${token}/start`, { body: { name: 'Bekzod', email: 'b@mail.uz', consent: true } });
  const key = started.body.key;
  const first = started.body.attempt.section.items[0];
  assertEquals(started.body.attempt.section.stage, 1);
  // Only the current stage can be answered; unknown ids and out-of-range options are dropped.
  await call('POST', 'public/attempts/save', { body: { key, answers: { [first.id]: 1, 'g-c2-01': 0, [started.body.attempt.section.items[1].id]: 9 }, integrity: { paste: 2 } } });
  const state = await call('POST', 'public/attempts/state', { body: { key } });
  assertEquals(state.body.attempt.answers, { [first.id]: 1 });
  clock.now = new Date(clock.now.getTime() + 11 * 60_000); // past the deadline, inside the grace period
  assertEquals((await call('POST', 'public/attempts/save', { body: { key, answers: { [first.id]: 2 } } })).status, 200);
  clock.now = new Date(clock.now.getTime() + 2 * 60_000); // past the grace period
  const late = await call('POST', 'public/attempts/next', { body: { key, answers: { [first.id]: 0 } } });
  assertEquals(late.body.attempt.status, 'graded');
  const list = await call('GET', `orgs/${ORG}/assessments/${created.body.assessment.id}`, { user: HR_ADMIN });
  const row = list.body.attempts[0];
  assert(row.flags.some((flag: { code: string }) => flag.code === 'auto_submitted'));
  assert(row.flags.some((flag: { code: string }) => flag.code === 'paste'));
  assertEquals(row.skills.reading.source, 'skipped');
  // An attempt nobody answered expires instead.
  clock.now = new Date('2026-10-30T09:00:00.000Z');
  const idle = await call('POST', `public/t/${token}/start`, { body: { name: 'Idle', email: 'idle@mail.uz', consent: true } });
  clock.now = new Date(clock.now.getTime() + 60 * 60_000);
  assertEquals((await call('POST', 'public/attempts/state', { body: { key: idle.body.key } })).body.attempt.status, 'expired');
});

Deno.test('routes: placement campaigns, my/tests contract, member level and activity', async () => {
  const { db, call } = world();
  assertEquals((await call('POST', `orgs/${ORG}/placement`, { user: MANAGER, body: { title: 'x' } })).status, 403);
  const created = await call('POST', `orgs/${ORG}/placement`, { user: HR_ADMIN, body: { kind: 'placement', title: 'Front office placement', skills: ['grammar', 'vocabulary', 'writing'], audience: { type: 'departments', ids: [FRONT] }, retest_days: 30 } });
  assertEquals(created.status, 200, JSON.stringify(created.body));
  const id = created.body.assessment.id;
  assertEquals((await call('POST', `orgs/${ORG}/placement`, { user: HR_ADMIN, body: { title: 'Bad', audience: { type: 'members', ids: ['00000000-0000-4000-8000-000000000999'] } } })).body.field, 'audience');

  const mine = await call('GET', `orgs/${ORG}/my/tests`, { user: EMPLOYEE });
  assertEquals(mine.body, { tests: [{ assessment_id: id, title: 'Front office placement', kind: 'placement', status: 'todo', level: null, attempt_id: null, deadline_at: null }] });
  assertEquals((await call('GET', `orgs/${ORG}/my/tests`, { user: OTHER })).body.tests, [], 'sales is not in the audience');
  assertEquals((await call('POST', `orgs/${ORG}/my/attempts`, { user: OTHER, body: { assessment_id: id } })).status, 404);

  let view = (await call('POST', `orgs/${ORG}/my/attempts`, { user: EMPLOYEE, body: { assessment_id: id } })).body.attempt;
  const attemptId = view.id;
  // Starting again resumes the same attempt.
  assertEquals((await call('POST', `orgs/${ORG}/my/attempts`, { user: EMPLOYEE, body: { assessment_id: id } })).body.attempt.id, attemptId);
  assertEquals((await call('GET', `orgs/${ORG}/my/tests`, { user: EMPLOYEE })).body.tests[0].status, 'in_progress');
  assertEquals((await call('GET', `orgs/${ORG}/my/attempts/${attemptId}`, { user: OTHER })).status, 404);
  for (let guard = 0; guard < 20 && view.status === 'started'; guard++) {
    const answers: Record<string, unknown> = {};
    for (const item of view.section.items ?? []) answers[item.id] = item.options.indexOf(CHOICES.get(item.id)!.options[CHOICES.get(item.id)!.answer]);
    for (const task of view.section.tasks ?? []) answers[task.id] = 'Dear team, the new check-in procedure starts on Monday. Please read the guide.';
    view = (await call('POST', `orgs/${ORG}/my/attempts/${attemptId}/next`, { user: EMPLOYEE, body: { answers } })).body.attempt;
  }
  assertEquals(view.status, 'graded');
  assert(view.result.feedback.writing.strengths.length > 0, 'members see their feedback');
  const member = db.rows('company_members').find((row) => row.user_id === EMPLOYEE)!;
  assertEquals([member.level, member.level_source], [view.result.overall_level, 'placement']);
  const activity = db.rows('company_activity');
  assertEquals([activity.length, activity[0].kind, activity[0].ref], [1, 'test', attemptId]);

  const after = (await call('GET', `orgs/${ORG}/my/tests`, { user: EMPLOYEE })).body.tests[0];
  assertEquals([after.status, after.level, after.attempt_id], ['done', view.result.overall_level, attemptId]);
  const again = await call('POST', `orgs/${ORG}/my/attempts`, { user: EMPLOYEE, body: { assessment_id: id } });
  assertEquals(again.body.code, 'already_taken');
  const intro = await call('GET', `orgs/${ORG}/my/tests/${id}`, { user: EMPLOYEE });
  assertEquals([intro.body.can_start, intro.body.status], [false, 'done']);
  assert(intro.body.retest_at > '2026-11-28');
  assertEquals((await call('GET', `orgs/${ORG}/my/attempts`, { user: EMPLOYEE })).body.attempts[0].certificate_code, view.result.certificate_code);

  // Managers follow their own department; HR sees everyone in the audience.
  const asManager = await call('GET', `orgs/${ORG}/placement/${id}`, { user: MANAGER });
  assertEquals(asManager.body.people.map((person: { status: string }) => person.status).sort(), ['done', 'todo']);
  assertEquals(asManager.body.can_edit, false);
  assertEquals((await call('GET', `orgs/${ORG}/attempts/${attemptId}`, { user: MANAGER })).status, 200);
  assertEquals((await call('GET', `orgs/${ORG}/assessments?kind=hiring`, { user: MANAGER })).status, 403);
  const list = await call('GET', `orgs/${ORG}/placement`, { user: OWNER });
  assertEquals(list.body.campaigns[0].progress, { audience: 2, done: 1, in_progress: 0, levels: { [view.result.overall_level]: 1 } });
  assertEquals((await call('GET', `orgs/${ORG}/placement/audience`, { user: HR_ADMIN })).body.members.length, 5);
});

// ---------------------------------------------------------------- production review regressions

const MINUTE = 60_000;
type Call = ReturnType<typeof world>['call'];

async function hiringTest(call: Call, body: Record<string, unknown>) {
  const created = await call('POST', `orgs/${ORG}/assessments`, { user: HR_ADMIN, body: { title: 'Front desk', ...body } });
  assertEquals(created.status, 200, JSON.stringify(created.body));
  return { id: created.body.assessment.id as string, token: linkToken(created.body.link), assessment: created.body.assessment, link: created.body.link as string };
}
const startAs = (call: Call, token: string, email: string, name = 'Candidate') => call('POST', `public/t/${token}/start`, { body: { name, email, consent: true } });
const WRITTEN = 'Dear guest, thank you for choosing our hotel. Your room is booked from Friday to Sunday.';
const attemptRows = (db: FakeDb) => db.rows('company_attempts');
const testsUsed = (db: FakeDb) => db.rows('company_orgs')[0].tests_used;

/** Behaves like PostgREST with max_rows=1000: no read returns more, whatever it asks for. */
function capRows(db: FakeDb) {
  const from = db.from.bind(db);
  db.from = ((table: string) => {
    const query = from(table);
    const limit = query.limit.bind(query), range = query.range.bind(query);
    query.limit(1000);
    query.limit = (count: number) => limit(Math.min(count, 1000));
    query.range = (start: number, end: number) => range(start, Math.min(end, start + 999));
    return query;
  }) as typeof db.from;
}

/** The next attempt insert loses a race: another request's row lands and the unique index refuses this one. */
function loseStartRace(db: FakeDb, winner?: Record<string, unknown>) {
  const from = db.from.bind(db);
  db.from = ((table: string) => {
    const query = from(table);
    if (table === 'company_attempts') {
      query.insert = ((row: Record<string, unknown>) => {
        db.from = from;
        if (winner) attemptRows(db).push({ id: crypto.randomUUID(), created_at: row.started_at, updated_at: row.started_at, ...row, ...winner });
        return { select: () => ({ single: () => Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate key' } }) }) };
      }) as never;
    }
    return query;
  }) as typeof db.from;
}

Deno.test('routes: a retried next after a lost response does not score what nobody saw', async () => {
  const { db, call } = world();
  const { token } = await hiringTest(call, { skills: ['grammar', 'reading'] });
  const started = await startAs(call, token, 'retry@mail.uz');
  const key = started.body.key;
  const next = (at: unknown, answers: Record<string, unknown> = {}) => call('POST', 'public/attempts/next', { body: { key, answers, at } });

  // Stage 1 moves on, the response is lost, and the page sends stage 1 again.
  const firstItems = started.body.attempt.section.items;
  const moved = await next({ current: 0, stage: 1 }, Object.fromEntries(firstItems.map((item: { id: string }) => [item.id, 0])));
  assertEquals(moved.body.attempt.section.stage, 2);
  const retried = await next({ current: 0, stage: 1 });
  assertEquals(retried.status, 200);
  assertEquals(retried.body.attempt.section.stage, 2, 'the page catches up');
  assertEquals(retried.body.attempt.section.items, moved.body.attempt.section.items);
  assertEquals((attemptRows(db)[0].items as Section[])[0].stages!.length, 2, 'no extra stage');

  // The same on the last stage: the section that was opened stays open.
  await next({ current: 0, stage: 2 });
  const reading = await next({ current: 0, stage: 3 });
  assertEquals([reading.body.attempt.current, reading.body.attempt.section.skill], [1, 'reading']);
  const again = await next({ current: 0, stage: 3 });
  assertEquals([again.body.attempt.status, again.body.attempt.current, again.body.attempt.section.skill], ['started', 1, 'reading']);
  assertEquals((attemptRows(db)[0].skill_results as Record<string, unknown>).reading, undefined, 'reading was not closed');
  // A page on the right step moves as usual; a passage section has no stage.
  assertEquals((await next({ current: 1, stage: null })).body.attempt.status, 'graded');
});

Deno.test('routes: an attempt closed long after it was abandoned logs its time limit as activity', async () => {
  const { db, call, clock } = world();
  const created = await call('POST', `orgs/${ORG}/placement`, { user: HR_ADMIN, body: { kind: 'placement', title: 'Placement', skills: ['grammar'], time_limit_minutes: 10 } });
  const view = (await call('POST', `orgs/${ORG}/my/attempts`, { user: EMPLOYEE, body: { assessment_id: created.body.assessment.id } })).body.attempt;
  await call('POST', `orgs/${ORG}/my/attempts/${view.id}/save`, { user: EMPLOYEE, body: { answers: { [view.section.items[0].id]: 1 } } });
  clock.now = new Date(clock.now.getTime() + 7 * 24 * 60 * MINUTE);
  assertEquals((await call('GET', `orgs/${ORG}/my/tests`, { user: EMPLOYEE })).body.tests[0].status, 'done');
  assertEquals(db.rows('company_activity')[0].minutes, 10);
});

Deno.test('routes: starting again: an empty overdue attempt frees the email, others get a neutral refusal', async () => {
  const { db, call, clock, calls } = world();
  const { token } = await hiringTest(call, { skills: ['writing'], time_limit_minutes: 10 });

  // Nothing answered and the time ran out: the same email starts again.
  await startAs(call, token, 'idle@mail.uz');
  clock.now = new Date(clock.now.getTime() + 13 * MINUTE);
  assertEquals((await startAs(call, token, 'idle@mail.uz')).status, 200);
  assertEquals(attemptRows(db)[0].status, 'expired');

  // Answered and overdue: closed with what was saved, without AI, and still blocking.
  const answered = await startAs(call, token, 'answered@mail.uz');
  const task = answered.body.attempt.section.tasks[0].id;
  await call('POST', 'public/attempts/save', { body: { key: answered.body.key, answers: { [task]: WRITTEN } } });
  clock.now = new Date(clock.now.getTime() + 13 * MINUTE);
  const refused = await startAs(call, token, 'answered@mail.uz');
  assertEquals([refused.status, refused.body.code], [409, 'cannot_start']);
  assert(!/used|taken/i.test(refused.body.error), 'the words do not confirm the email was used');
  assertEquals(attemptRows(db).find((row) => row.candidate_email === 'answered@mail.uz')!.status, 'submitted');
  assertEquals(calls, []);
});

Deno.test('routes: refused starts count toward the hourly limit', async () => {
  const { db, call } = world();
  const { token } = await hiringTest(call, { skills: ['grammar'] });
  assertEquals((await startAs(call, token, 'target@mail.uz')).status, 200);
  for (let probe = 0; probe < STARTS_PER_HOUR - 1; probe++) assertEquals((await startAs(call, token, 'target@mail.uz')).body.code, 'cannot_start');
  const limited = await startAs(call, token, 'target@mail.uz');
  assertEquals([limited.status, limited.body.code], [429, 'too_many_starts']);
  assertEquals(attemptRows(db).length, 1);
});

Deno.test('routes: HR gives a candidate who lost their key a new access link', async () => {
  const { call, clock } = world();
  const { token, id } = await hiringTest(call, { skills: ['grammar'], time_limit_minutes: 10 });
  const started = await startAs(call, token, 'phone@mail.uz');
  const attempt = started.body.attempt.id;
  assertEquals((await call('POST', `orgs/${ORG}/attempts/${attempt}/access`, { user: EMPLOYEE })).status, 403);
  const issued = await call('POST', `orgs/${ORG}/attempts/${attempt}/access`, { user: HR_ADMIN });
  const fresh = String(issued.body.link).split('/r/')[1];
  assert(fresh.length >= 20);
  assertEquals((await call('POST', 'public/attempts/state', { body: { key: started.body.key } })).body.code, 'attempt_not_found', 'the old key stops working');
  const state = await call('POST', 'public/attempts/state', { body: { key: fresh } });
  assertEquals([state.body.attempt.id, state.body.attempt.status], [attempt, 'started']);
  // Once the attempt is over there is nothing to continue.
  clock.now = new Date(clock.now.getTime() + 13 * MINUTE);
  await call('GET', `orgs/${ORG}/assessments/${id}`, { user: HR_ADMIN });
  assertEquals((await call('POST', `orgs/${ORG}/attempts/${attempt}/access`, { user: HR_ADMIN })).body.code, 'attempt_finished');
});

Deno.test('routes: opening the candidate list closes overdue attempts without AI; HR grades them after', async () => {
  const { call, clock, calls } = world();
  const { token, id } = await hiringTest(call, { skills: ['writing'], time_limit_minutes: 10 });
  for (const email of ['a@mail.uz', 'b@mail.uz']) {
    const started = await startAs(call, token, email);
    await call('POST', 'public/attempts/save', { body: { key: started.body.key, answers: { [started.body.attempt.section.tasks[0].id]: WRITTEN } } });
  }
  clock.now = new Date(clock.now.getTime() + 13 * MINUTE);
  const detail = await call('GET', `orgs/${ORG}/assessments/${id}`, { user: HR_ADMIN });
  assertEquals(calls, [], 'no AI inside the page load');
  assertEquals(detail.body.attempts.map((row: { status: string; pending: string[] }) => [row.status, row.pending]), [['submitted', ['writing']], ['submitted', ['writing']]]);
  // Nothing is lost, and the report does not claim AI failed.
  const report = await call('GET', `orgs/${ORG}/attempts/${detail.body.attempts[0].id}`, { user: HR_ADMIN });
  assertEquals([report.body.attempt.feedback.reason, report.body.attempt.feedback.tried_at], [null, null]);
  const graded = await call('POST', `orgs/${ORG}/attempts/${detail.body.attempts[0].id}/regrade`, { user: HR_ADMIN });
  assertEquals([graded.body.attempt.status, calls.length], ['graded', 1]);
});

Deno.test('routes: hiring lists, stats and exports are complete past the 1000-row limit', async () => {
  const { db, call } = world();
  capRows(db);
  const { token, id } = await hiringTest(call, { skills: ['grammar'], max_attempts: 1600 });
  for (let index = 0; index < 1500; index++) {
    const at = new Date(Date.parse('2026-10-20T00:00:00.000Z') + index * MINUTE).toISOString();
    attemptRows(db).push({ id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`, org_id: ORG, assessment_id: id, member_id: null, user_id: null, candidate_name: `C ${index}`, candidate_email: `c${index}@mail.uz`, candidate_phone: null, access_token_hash: null, status: 'submitted', started_at: at, deadline_at: at, submitted_at: at, graded_at: null, items: [], answers: {}, overall_level: null, overall_score: null, skill_results: {}, ai_feedback: {}, integrity: {}, decision: null, decision_by: null, notes: null, certificate_code: null, created_at: at, updated_at: at });
  }
  const detail = await call('GET', `orgs/${ORG}/assessments/${id}`, { user: HR_ADMIN });
  assertEquals([detail.body.attempts.length, detail.body.stats.total], [1500, 1500]);
  assertEquals(new Set(detail.body.attempts.map((row: { id: string }) => row.id)).size, 1500, 'no row twice across pages');
  assertEquals((await call('GET', `orgs/${ORG}/assessments?kind=hiring`, { user: HR_ADMIN })).body.assessments[0].stats.total, 1500);
  const csv = await call('GET', `orgs/${ORG}/assessments/${id}/export`, { user: HR_ADMIN });
  assertEquals(csv.body.csv.trim().split('\r\n').length, 1501);
  // The oldest email, beyond the newest 1000, cannot start again.
  assertEquals((await startAs(call, token, 'c0@mail.uz')).body.code, 'cannot_start');
  // The candidate cap is reached past 1000 too.
  db.rows('company_assessments')[0].max_attempts = 1500;
  assertEquals((await startAs(call, token, 'new@mail.uz')).body.code, 'test_full');

  // A campaign audience and the people list work above 1000 members.
  const ids: string[] = [];
  for (let index = 0; index < 1200; index++) {
    const memberId = `00000000-0000-4000-9000-${String(index).padStart(12, '0')}`;
    ids.push(memberId);
    db.rows('company_members').push({ id: memberId, org_id: ORG, user_id: null, email: `m${index}@x.uz`, full_name: `M ${index}`, role: 'employee', department_id: null, job_role: 'general', status: 'active', seat: false, level: null });
  }
  const campaign = await call('POST', `orgs/${ORG}/placement`, { user: HR_ADMIN, body: { kind: 'placement', title: 'Everyone', skills: ['grammar'], audience: { type: 'members', ids } } });
  assertEquals(campaign.status, 200, JSON.stringify(campaign.body));
  assertEquals((await call('GET', `orgs/${ORG}/placement/audience`, { user: HR_ADMIN })).body.members.length, 1205);
});

Deno.test('routes: a failed re-grade reports its reason even though the old result stays', async () => {
  const { call, setAi } = world();
  const { token, id } = await hiringTest(call, { skills: ['writing'] });
  const started = await startAs(call, token, 'grade@mail.uz');
  await call('POST', 'public/attempts/submit', { body: { key: started.body.key, answers: { [started.body.attempt.section.tasks[0].id]: WRITTEN } } });
  const attempt = (await call('GET', `orgs/${ORG}/assessments/${id}`, { user: HR_ADMIN })).body.attempts[0].id;
  const fine = await call('POST', `orgs/${ORG}/attempts/${attempt}/regrade`, { user: HR_ADMIN, body: { skill: 'writing' } });
  assertEquals([fine.body.attempt.status, fine.body.reason], ['graded', null]);
  setAi('down');
  const failed = await call('POST', `orgs/${ORG}/attempts/${attempt}/regrade`, { user: HR_ADMIN, body: { skill: 'writing' } });
  assertEquals([failed.body.attempt.status, failed.body.attempt.results.writing.score, failed.body.reason], ['graded', 62, 'ai_unavailable']);
});

Deno.test('routes: public attempt routes refuse a closed workspace; a suspended one lets a started attempt finish', async () => {
  const { db, call } = world();
  const { token } = await hiringTest(call, { skills: ['grammar'] });
  const started = await startAs(call, token, 'status@mail.uz');
  const key = started.body.key;
  db.rows('company_orgs')[0].status = 'suspended';
  assertEquals((await call('GET', `public/t/${token}`)).body.open, false);
  assertEquals((await startAs(call, token, 'late@mail.uz')).body.code, 'test_closed');
  assertEquals((await call('POST', 'public/attempts/save', { body: { key, answers: {} } })).status, 200);
  db.rows('company_orgs')[0].status = 'closed';
  for (const route of ['state', 'save', 'next', 'submit']) {
    const refused = await call('POST', `public/attempts/${route}`, { body: { key, answers: {} } });
    assertEquals([route, refused.status, refused.body.code], [route, 403, 'org_closed']);
  }
  assertEquals(attemptRows(db)[0].status, 'started');
});

Deno.test('routes: after the contract ends nobody starts a test, and a started one may finish', async () => {
  const { db, call, clock } = world();
  const { token } = await hiringTest(call, { skills: ['grammar'] });
  const campaign = (await call('POST', `orgs/${ORG}/placement`, { user: HR_ADMIN, body: { kind: 'placement', title: 'Placement', skills: ['grammar'] } })).body.assessment.id;
  const candidate = await startAs(call, token, 'before@mail.uz');
  const staff = (await call('POST', `orgs/${ORG}/my/attempts`, { user: EMPLOYEE, body: { assessment_id: campaign } })).body.attempt;
  const used = testsUsed(db);
  db.rows('company_orgs')[0].contract_ends_at = new Date(clock.now.getTime() - MINUTE).toISOString();

  // Candidates see the test as closed, not as out of tests.
  assertEquals((await call('GET', `public/t/${token}`)).body.open, false);
  const refused = await startAs(call, token, 'after@mail.uz');
  assertEquals([refused.status, refused.body.code], [409, 'test_closed']);
  // Members who have not started cannot, and the campaign is not offered.
  const other = OTHER;
  assertEquals((await call('GET', `orgs/${ORG}/my/tests`, { user: other })).body.tests, []);
  const intro = await call('GET', `orgs/${ORG}/my/tests/${campaign}`, { user: other });
  assertEquals([intro.body.closed, intro.body.can_start], [true, false]);
  const start = await call('POST', `orgs/${ORG}/my/attempts`, { user: other, body: { assessment_id: campaign } });
  assert(start.status === 403 || start.status === 409, JSON.stringify(start.body));
  assert(start.body.code === 'contract_ended' || start.body.code === 'test_closed', start.body.code);
  assertEquals(testsUsed(db), used);

  // Attempts already started finish.
  assertEquals((await call('POST', 'public/attempts/save', { body: { key: candidate.body.key, answers: {} } })).status, 200);
  assertEquals((await call('POST', 'public/attempts/submit', { body: { key: candidate.body.key, answers: {} } })).body.attempt.status, 'graded');
  assertEquals((await call('GET', `orgs/${ORG}/my/tests`, { user: EMPLOYEE })).body.tests[0].status, 'in_progress');
  assertEquals((await call('POST', `orgs/${ORG}/my/attempts/${staff.id}/submit`, { user: EMPLOYEE, body: {} })).body.attempt.status, 'graded');
});

Deno.test('routes: a lost start race uses no test, and a refused reservation leaves no attempt', async () => {
  const { db, call } = world();
  const { token } = await hiringTest(call, { skills: ['grammar'] });
  // Candidate: the same neutral refusal and no key.
  loseStartRace(db);
  const lost = await startAs(call, token, 'twice@mail.uz');
  assertEquals([lost.status, lost.body.code, lost.body.key], [409, 'cannot_start', undefined]);
  assertEquals(testsUsed(db), 0);
  // Member: resumes the attempt that won.
  const campaign = (await call('POST', `orgs/${ORG}/placement`, { user: HR_ADMIN, body: { kind: 'placement', title: 'Placement', skills: ['grammar'] } })).body.assessment.id;
  const winner = crypto.randomUUID();
  loseStartRace(db, { id: winner });
  const resumed = await call('POST', `orgs/${ORG}/my/attempts`, { user: EMPLOYEE, body: { assessment_id: campaign } });
  assertEquals([resumed.status, resumed.body.attempt.id], [200, winner]);
  assertEquals(testsUsed(db), 0);

  const { db: full, call: callFull } = world({ testsLimit: 0 });
  const test = await hiringTest(callFull, { skills: ['grammar'] });
  assertEquals((await startAs(callFull, test.token, 'x@mail.uz')).body.code, 'tests_exhausted');
  assertEquals(attemptRows(full).length, 0);
});

Deno.test('routes: starting after an overrun attempt closes keeps the retest rule', async () => {
  const { db, call, clock } = world();
  const campaign = (await call('POST', `orgs/${ORG}/placement`, { user: HR_ADMIN, body: { kind: 'placement', title: 'Placement', skills: ['grammar'], time_limit_minutes: 10 } })).body.assessment.id;
  const start = () => call('POST', `orgs/${ORG}/my/attempts`, { user: EMPLOYEE, body: { assessment_id: campaign } });
  const view = (await start()).body.attempt;
  await call('POST', `orgs/${ORG}/my/attempts/${view.id}/save`, { user: EMPLOYEE, body: { answers: { [view.section.items[0].id]: 1 } } });
  clock.now = new Date(clock.now.getTime() + 13 * MINUTE);
  const again = await start();
  assertEquals([again.status, again.body.code], [409, 'already_taken']);
  assertEquals([attemptRows(db).length, testsUsed(db)], [1, 1]);
});

Deno.test('routes: the normal time-up submit is not flagged late', async () => {
  const { db, call, clock } = world();
  const { token, id } = await hiringTest(call, { skills: ['grammar'], time_limit_minutes: 10 });
  const onTime = await startAs(call, token, 'ontime@mail.uz');
  const late = await startAs(call, token, 'late@mail.uz');
  clock.now = new Date(clock.now.getTime() + 10 * MINUTE + 5_000);
  await call('POST', 'public/attempts/submit', { body: { key: onTime.body.key, answers: {} } });
  clock.now = new Date(clock.now.getTime() + 55_000);
  await call('POST', 'public/attempts/submit', { body: { key: late.body.key, answers: {} } });
  assertEquals(attemptRows(db).map((row) => (row.integrity as { late?: boolean }).late), [undefined, true]);
  const rows = (await call('GET', `orgs/${ORG}/assessments/${id}`, { user: HR_ADMIN })).body.attempts as { email: string; flags: { code: string }[] }[];
  assertEquals(rows.find((row) => row.email === 'ontime@mail.uz')!.flags.some((flag) => flag.code === 'late'), false);
  assertEquals(rows.find((row) => row.email === 'late@mail.uz')!.flags.some((flag) => flag.code === 'late'), true);
});

Deno.test('routes and page: a remembered link is shown only while it is the live link', async () => {
  const { call } = world();
  const { id, assessment, link } = await hiringTest(call, { skills: ['grammar'] });
  assertEquals(String(assessment.link_id).length, 12);
  assertEquals(assessment.link_token_hash, undefined);
  const remembered = encodeLink(link, assessment.link_id);
  assertEquals(decodeLink(remembered, assessment.link_id), link);

  const other = await call('POST', `orgs/${ORG}/assessments/${id}/link`, { user: OWNER });
  assertNotEquals(other.body.link_id, assessment.link_id);
  const live = (await call('GET', `orgs/${ORG}/assessments/${id}`, { user: HR_ADMIN })).body.assessment.link_id;
  assertEquals(live, other.body.link_id);
  assertEquals(decodeLink(remembered, live), null, 'another admin replaced it');
  assertEquals(decodeLink(encodeLink(other.body.link, other.body.link_id), live), other.body.link);
  const copy = await call('POST', `orgs/${ORG}/assessments/${id}/duplicate`, { user: HR_ADMIN });
  assert(copy.body.assessment.link_id && copy.body.assessment.link_id !== live);
  // Anything unreadable counts as not remembered.
  assertEquals(decodeLink('https://company.schood.online/t/old', live), null);
  assertEquals(decodeLink(null, live), null);
});

Deno.test('page: resuming keeps the key unless the session is really gone', () => {
  assertEquals(resumeStep('started'), 'running');
  assertEquals(resumeStep('submitted'), 'done');
  assertEquals(resumeStep('graded'), 'done');
  assertEquals(resumeStep('expired'), 'start_over');
  assertEquals(keyIsGone({ status: 404, code: 'attempt_not_found' }), true);
  for (const failure of [new TypeError('timeout'), new TypeError('Failed to fetch'), { status: 500, code: 'internal_error' }, { status: 403, code: 'org_closed' }, { status: 404, code: 'not_found' }]) {
    assertEquals(keyIsGone(failure), false, JSON.stringify(failure));
  }
});

Deno.test('page: the time-up submit retries, spaced out, and waits for a request in flight', () => {
  const state = { remaining: 0, busy: false, finished: false, lastTry: 0, now: 1_000_000 };
  assertEquals(timeUpSubmitDue(state), true, 'first try at once');
  assertEquals(timeUpSubmitDue({ ...state, remaining: 1 }), false, 'time left');
  assertEquals(timeUpSubmitDue({ ...state, busy: true }), false, 'a request is in flight');
  assertEquals(timeUpSubmitDue({ ...state, finished: true }), false, 'already finished');
  assertEquals(timeUpSubmitDue({ ...state, remaining: -3, lastTry: state.now - 3_000 }), false, 'not so soon after a failure');
  assertEquals(timeUpSubmitDue({ ...state, remaining: -15, lastTry: state.now - TIME_UP_RETRY_MS }), true, 'tries again');
});

Deno.test('page: starting Next or Submit drops the waiting autosave and blocks a second move', async () => {
  const gate = new SaveGate();
  let saves = 0;
  gate.schedule(() => saves++, 5);
  assertEquals(gate.begin(), true);
  assertEquals(gate.moving, true);
  assertEquals(gate.begin(), false, 'one move at a time');
  await new Promise((resolve) => setTimeout(resolve, 25));
  assertEquals(saves, 0, 'the waiting save never fired');
  gate.end();
  assertEquals(gate.begin(), true, 'free again');
  gate.end();
  gate.schedule(() => saves++, 1);
  gate.schedule(() => saves++, 1);
  await new Promise((resolve) => setTimeout(resolve, 25));
  assertEquals(saves, 1, 'a newer save replaces the waiting one');
});
