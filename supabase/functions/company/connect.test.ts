// Connect: in-app notices, Telegram, email invites and the job. Off by default is
// tested as hard as on: no switch, no message.
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { routes as connect, pushNotice } from './connect.ts';
import { routes as core } from './core.ts';
import { noticeText, inviteEmail } from './connect/messages.ts';
import { maybeSweep, sweepOrg } from './connect/notices.ts';
import { inQuietHours, type ConnectConfig } from './connect/shared.ts';
import { pushOrg } from './connect/telegram.ts';
import { runConnectJob } from './connect/job.ts';
import { FakeDb, TEST_ENV, testHandler } from './testing.ts';
import type { CompanyEnv, OrgRow, Route } from './types.ts';

const routes: Route[] = [...core, ...connect];
const ORG = '10000000-0000-4000-8000-000000000001', OTHER = '10000000-0000-4000-8000-000000000002';
const OWNER = '20000000-0000-4000-8000-000000000001', ADMIN = '20000000-0000-4000-8000-000000000002', EMP = '20000000-0000-4000-8000-000000000003', OUT = '20000000-0000-4000-8000-000000000004', MGR = '20000000-0000-4000-8000-000000000005';
const M_OWNER = '30000000-0000-4000-8000-000000000001', M_ADMIN = '30000000-0000-4000-8000-000000000002', M_EMP = '30000000-0000-4000-8000-000000000003', M_OUT = '30000000-0000-4000-8000-000000000004', M_MGR = '30000000-0000-4000-8000-000000000005', M_INVITED = '30000000-0000-4000-8000-000000000006';
const DAY = 86_400_000;
// Noon in Tashkent, outside any default quiet hours.
const NOW = new Date('2026-11-06T07:00:00Z');
const iso = (offset: number) => new Date(NOW.getTime() + offset).toISOString();

function world(orgPatch: Record<string, unknown> = {}) {
  const member = (id: string, user: string | null, role: string, extra: Record<string, unknown> = {}) => ({
    id, org_id: ORG, user_id: user, email: user ? `${role}@x.test` : null, full_name: role, role, department_id: null, job_role: 'general', status: 'active', seat: false,
    level: null, level_score: null, level_source: null, level_at: null, target_level: null, target_date: null, consent_at: iso(-20 * DAY), joined_at: iso(-20 * DAY), ...extra,
  });
  const db = new FakeDb({
    users: [OWNER, ADMIN, EMP, MGR].map((id) => ({ id, role: 'user', telegram_chat_id: id === OWNER ? null : `chat-${id.slice(-1)}` })).concat({ id: OUT, role: 'user', telegram_chat_id: 'chat-out' }),
    company_orgs: [
      { id: ORG, name: 'Acme', industry: 'it', size_band: '1-50', status: 'active', seats_limit: 5, tests_limit: 10, tests_used: 0, contract_ends_at: iso(300 * DAY), settings: { locale: 'ru' }, created_at: iso(-30 * DAY) },
      { id: OTHER, name: 'Other', industry: 'it', size_band: '1-50', status: 'active', seats_limit: 5, tests_limit: 10, tests_used: 0, contract_ends_at: null, settings: {}, created_at: iso(-30 * DAY) },
    ],
    company_departments: [],
    company_members: [
      member(M_OWNER, OWNER, 'owner'), member(M_ADMIN, ADMIN, 'admin'), member(M_EMP, EMP, 'employee', { seat: true }), member(M_MGR, MGR, 'manager'),
      { ...member(M_OUT, OUT, 'employee'), org_id: OTHER },
      member(M_INVITED, null, 'employee', { status: 'invited', email: 'new@x.test', full_name: 'New Person', joined_at: null }),
    ],
    company_assignments: [], company_assessments: [], company_attempts: [], company_sessions: [], company_audit: [], company_activity: [], company_lesson_progress: [],
    company_notices: [], company_connect_settings: [], company_connect_prefs: [], company_invites: [],
  });
  Object.assign(db.rows('company_orgs')[0], orgPatch);
  db.rpcs.company_connect_hit = () => true;
  db.rpcs.company_connect_day_hit = () => true;
  db.rpcs.company_claim_push_notice = ({ p_org, p_member, p_notice, p_limit, p_at }) => {
    const at = new Date(String(p_at));
    const start = new Date(`${new Date(at.getTime() + 5 * 3_600_000).toISOString().slice(0, 10)}T00:00:00+05:00`).getTime();
    const used = db.rows('company_notices').filter((row) => row.org_id === p_org && row.member_id === p_member && (row.push_state === 'sending' || row.push_state === 'sent' && Date.parse(String(row.pushed_at)) >= start)).length;
    const notice = db.rows('company_notices').find((row) => row.id === p_notice && row.org_id === p_org && row.member_id === p_member && row.push_state === null);
    if (!notice || used >= Number(p_limit)) return false;
    notice.push_state = 'sending'; notice.pushed_at = String(p_at);
    return true;
  };
  return db;
}
const org = (db: FakeDb) => db.rows('company_orgs')[0] as unknown as OrgRow;
const envWith = (connectConfig: ConnectConfig): CompanyEnv => ({ ...TEST_ENV, connect: connectConfig } as CompanyEnv);
const api = (db: FakeDb, connectConfig: ConnectConfig = {}) => testHandler(db, routes, { now: () => NOW, env: { connect: connectConfig } as Partial<CompanyEnv> });

Deno.test('pushNotice dedupes by key and refuses links out of the app', async () => {
  const db = world();
  assertEquals(await pushNotice(db, { org_id: ORG, member_id: M_EMP, kind: 'x', key: 'k', link: '/w/x' }), true);
  assertEquals(await pushNotice(db, { org_id: ORG, member_id: M_EMP, kind: 'x', key: 'k', link: '/w/x' }), false);
  assertEquals(db.rows('company_notices').length, 1);
  await pushNotice(db, { org_id: ORG, member_id: M_EMP, kind: 'x', key: 'evil', link: '//evil.example' });
  assertEquals(db.rows('company_notices').find((row) => row.dedupe_key === 'evil')!.link, null);
});

Deno.test('pushNotice never throws when the table is unavailable', async () => {
  const broken = { from: () => ({ upsert: () => ({ select: () => Promise.resolve({ data: null, error: { message: 'down' } }) }) }) };
  assertEquals(await pushNotice(broken, { org_id: ORG, member_id: M_EMP, kind: 'x', key: 'k' }), false);
});

Deno.test('bell: count, list and read are the person\'s own', async () => {
  const db = world();
  await pushNotice(db, { org_id: ORG, member_id: M_EMP, kind: 'x', key: 'a' });
  await pushNotice(db, { org_id: ORG, member_id: M_ADMIN, kind: 'x', key: 'b' });
  const call = api(db);
  assertEquals((await call('GET', `orgs/${ORG}/connect/notices/count`, { user: EMP })).body.unread, 1);
  const list = await call('GET', `orgs/${ORG}/connect/notices`, { user: EMP });
  assertEquals(list.body.notices.length, 1);
  const other = db.rows('company_notices').find((row) => row.member_id === M_ADMIN)!;
  assertEquals((await call('POST', `orgs/${ORG}/connect/notices/${other.id}/read`, { user: EMP })).status, 404);
  assertEquals(other.read_at ?? null, null);
  assertEquals((await call('POST', `orgs/${ORG}/connect/notices/${list.body.notices[0].id}/read`, { user: EMP })).status, 200);
  assertEquals((await call('GET', `orgs/${ORG}/connect/notices/count`, { user: EMP })).body.unread, 0);
  assertEquals((await call('POST', `orgs/${ORG}/connect/notices/read-all`, { user: ADMIN })).body.updated, 1);
  assertEquals((await call('POST', `orgs/${ORG}/connect/notices/nonsense/read`, { user: ADMIN })).status, 404);
  // Another workspace's member gets nothing here.
  assertEquals((await call('GET', `orgs/${ORG}/connect/notices`, { user: OUT })).status, 403);
});

Deno.test('sweep finds the events and repeating it adds nothing', async () => {
  const db = world({ contract_ends_at: iso(5 * DAY) });
  db.rows('company_assignments').push({ id: 'a1', org_id: ORG, track_code: 'general', target_level: null, due_date: '2026-11-08', department_id: null, member_id: null, status: 'active' });
  db.rows('company_assessments').push(
    { id: 't1', org_id: ORG, kind: 'placement', title: 'Placement', status: 'open', closes_at: null, settings: { audience: { type: 'members', ids: [M_EMP] } }, created_at: iso(-DAY) },
    { id: 'h1', org_id: ORG, kind: 'hiring', title: 'Receptionist', status: 'open', closes_at: null, settings: {}, created_at: iso(-DAY) },
  );
  db.rows('company_attempts').push({ id: 'c1', org_id: ORG, assessment_id: 'h1', member_id: null, candidate_name: 'Secret Name', candidate_email: 's@x.test', status: 'submitted', submitted_at: iso(-3600_000) });
  db.rows('company_sessions').push({ id: 's1', org_id: ORG, title: 'Speaking club', status: 'scheduled', starts_at: iso(3 * 3600_000), department_ids: [], member_ids: [] });
  db.rows('company_audit').push({ id: 7, org_id: ORG, action: 'member.seat_on', target: M_EMP, created_at: iso(-3600_000) });
  const settings = { digest_enabled: false, digest_weekday: 1 } as never;
  const added = await sweepOrg(db, org(db), settings, iso(-DAY), NOW);
  const mine = db.rows('company_notices').filter((row) => row.member_id === M_EMP).map((row) => row.kind).sort();
  assertEquals(mine, ['assignment_due', 'seat_on', 'session_soon', 'test_todo']);
  // Candidate news goes to HR and carries the test, not the person.
  const hr = db.rows('company_notices').filter((row) => row.kind === 'candidate_finished');
  assertEquals(hr.map((row) => row.member_id).sort(), [M_OWNER, M_ADMIN].sort());
  assert(!JSON.stringify(hr).includes('Secret Name'));
  assertEquals(db.rows('company_notices').filter((row) => row.kind === 'contract_ending').map((row) => row.member_id), [M_OWNER]);
  assert(added > 0);
  assertEquals(await sweepOrg(db, org(db), settings, iso(-DAY), NOW), 0);
});

Deno.test('sweep: a finished track, a pilot and an ended contract make no reminders', async () => {
  const db = world({ status: 'pilot' });
  db.rows('company_assignments').push({ id: 'a1', org_id: ORG, track_code: null, target_level: 'b1', due_date: '2026-11-08', department_id: null, member_id: M_EMP, status: 'active' });
  await sweepOrg(db, org(db), { digest_enabled: false } as never, iso(-DAY), NOW);
  assertEquals(db.rows('company_notices').filter((row) => row.kind === 'assignment_due').length, 0);
  const ended = world({ contract_ends_at: iso(-DAY) });
  ended.rows('company_sessions').push({ id: 's1', org_id: ORG, title: 'x', status: 'scheduled', starts_at: iso(3600_000), department_ids: [], member_ids: [] });
  assertEquals(await sweepOrg(ended, org(ended), { digest_enabled: false } as never, iso(-DAY), NOW), 0);
});

Deno.test('digest counts only people who agreed, from the later of joining and agreeing', async () => {
  const db = world();
  const consent = iso(-3 * DAY);
  Object.assign(db.rows('company_members').find((row) => row.id === M_EMP)!, { consent_at: consent, joined_at: iso(-20 * DAY) });
  Object.assign(db.rows('company_members').find((row) => row.id === M_MGR)!, { consent_at: null });
  db.rows('company_activity').push(
    { id: 1, org_id: ORG, member_id: M_EMP, kind: 'english', minutes: 30, created_at: iso(-5 * DAY) }, // before agreeing
    { id: 2, org_id: ORG, member_id: M_EMP, kind: 'english', minutes: 10, created_at: iso(-DAY) },
    { id: 3, org_id: ORG, member_id: M_MGR, kind: 'lesson', minutes: 50, created_at: iso(-DAY) }, // never agreed
  );
  // 2026-11-06 is a Friday, weekday 5.
  const settings = { digest_enabled: true, digest_weekday: 5, last_digest_week: null } as never;
  db.rows('company_connect_settings').push({ org_id: ORG });
  await sweepOrg(db, org(db), settings, iso(-DAY), NOW);
  const digest = db.rows('company_notices').filter((row) => row.kind === 'weekly_digest');
  assertEquals(digest.map((row) => row.member_id).sort(), [M_OWNER, M_ADMIN].sort());
  const params = digest[0].params as Record<string, number>;
  assertEquals(params.minutes, 10);
  assertEquals(params.learners, 1);
  // A different weekday makes none.
  const other = world();
  await sweepOrg(other, org(other), { digest_enabled: true, digest_weekday: 1 } as never, iso(-DAY), NOW);
  assertEquals(other.rows('company_notices').length, 0);
});

Deno.test('maybeSweep runs once per interval, so two tabs do not both sweep', async () => {
  const db = world();
  assertEquals(typeof await maybeSweep(db, org(db), NOW), 'number');
  assertEquals(await maybeSweep(db, org(db), new Date(NOW.getTime() + 1000)), null);
  assertEquals(typeof await maybeSweep(db, org(db), new Date(NOW.getTime() + 31 * 60_000)), 'number');
  const paused = world({ status: 'suspended' });
  assertEquals(await maybeSweep(paused, org(paused), NOW), null);
});

Deno.test('a failed sweep hands its cursor back', async () => {
  const db = world();
  db.rows('company_connect_settings').push({ org_id: ORG, notices_swept_at: iso(-3 * 3600_000) });
  const realFrom = db.from.bind(db);
  (db as unknown as { from: unknown }).from = (table: string) => {
    if (table === 'company_members') throw new Error('boom');
    return realFrom(table);
  };
  assertEquals(await maybeSweep(db, org(db), NOW), null);
  assertEquals(db.rows('company_connect_settings')[0].notices_swept_at, iso(-3 * 3600_000));
});

function telegramWorld() {
  const db = world();
  db.rows('company_connect_settings').push({ org_id: ORG, telegram_enabled: true, quiet_start: 21, quiet_end: 9, daily_cap: 2 });
  db.rows('company_connect_prefs').push({ member_id: M_EMP, org_id: ORG, telegram_opt_in: true, muted_kinds: [], quiet_start: null, quiet_end: null, daily_cap: null, locale: 'uz' });
  return db;
}
const notice = (db: FakeDb, key: string, kind = 'test_todo', member = M_EMP, created = iso(-3600_000)) => db.rows('company_notices').push({ id: crypto.randomUUID(), org_id: ORG, member_id: member, kind, dedupe_key: key, params: { title: 'Placement' }, link: '/w/x/me', read_at: null, push_state: null, created_at: created });
function capture() {
  const sent: { user_id: string; text: string; key: string }[] = [];
  return { sent, telegram: (message: { user_id: string; text: string; key: string; cta_url: string | null }) => { sent.push(message); return Promise.resolve({ ok: true }); } };
}

Deno.test('Telegram: nothing goes out unless every switch is on', async () => {
  for (const [name, config, prep] of [
    ['function switch off', { telegramEnabled: false }, (_: FakeDb) => {}],
    ['no adapter', { telegramEnabled: true, noAdapter: true }, (_: FakeDb) => {}],
    ['workspace off', { telegramEnabled: true }, (db: FakeDb) => { db.rows('company_connect_settings')[0].telegram_enabled = false; }],
    ['person not opted in', { telegramEnabled: true }, (db: FakeDb) => { db.rows('company_connect_prefs')[0].telegram_opt_in = false; }],
    ['person not linked', { telegramEnabled: true }, (db: FakeDb) => { db.rows('users').find((row) => row.id === EMP)!.telegram_chat_id = null; }],
    ['person removed', { telegramEnabled: true }, (db: FakeDb) => { db.rows('company_members').find((row) => row.id === M_EMP)!.status = 'removed'; }],
    ['paused workspace', { telegramEnabled: true }, (db: FakeDb) => { db.rows('company_orgs')[0].status = 'suspended'; }],
    ['ended contract', { telegramEnabled: true }, (db: FakeDb) => { db.rows('company_orgs')[0].contract_ends_at = iso(-1000); }],
  ] as const) {
    const db = telegramWorld(), out = capture();
    notice(db, 'k');
    prep(db);
    const { noAdapter, ...rest } = config as { telegramEnabled: boolean; noAdapter?: boolean };
    await pushOrg(db, envWith({ ...rest, telegram: noAdapter ? undefined : out.telegram }), org(db), NOW);
    assertEquals(out.sent.length, 0, name);
    assertEquals(db.rows('company_notices')[0].push_state, null, name);
  }
});

Deno.test('Telegram: sends once in the person\'s language with a link', async () => {
  const db = telegramWorld(), out = capture();
  notice(db, 'k');
  const env = envWith({ telegramEnabled: true, telegram: out.telegram });
  assertEquals((await pushOrg(db, env, org(db), NOW)).sent, 1);
  assertEquals(out.sent[0].user_id, EMP);
  assert(out.sent[0].text.includes('testi kutmoqda'), out.sent[0].text);
  assert(out.sent[0].text.includes('https://company.schood.online/w/x/me'));
  assertEquals((await pushOrg(db, env, org(db), NOW)).sent, 0);
  assertEquals(out.sent.length, 1);
});

Deno.test('Telegram: quiet hours and the daily cap hold messages back, muted kinds skip', async () => {
  const db = telegramWorld(), out = capture();
  notice(db, 'a'); notice(db, 'b'); notice(db, 'c');
  const env = envWith({ telegramEnabled: true, telegram: out.telegram });
  // 22:00 Tashkent is quiet.
  const night = new Date('2026-11-06T17:00:00Z');
  const quiet = await pushOrg(db, env, org(db), night);
  assertEquals(quiet.sent, 0);
  assert(quiet.held >= 1);
  // The cap is two a day; the third waits for tomorrow.
  assertEquals((await pushOrg(db, env, org(db), NOW)).sent, 2);
  assertEquals((await pushOrg(db, env, org(db), NOW)).sent, 0);
  assertEquals(out.sent.length, 2);
  // The next Tashkent day has room.
  assertEquals((await pushOrg(db, env, org(db), new Date(NOW.getTime() + DAY))).sent, 1);

  const muted = telegramWorld(), other = capture();
  muted.rows('company_connect_prefs')[0].muted_kinds = ['test_todo'];
  notice(muted, 'a');
  await pushOrg(muted, envWith({ telegramEnabled: true, telegram: other.telegram }), org(muted), NOW);
  assertEquals(other.sent.length, 0);
  assertEquals(muted.rows('company_notices')[0].push_state, 'skipped');
});

Deno.test('Telegram: a person\'s larger cap cannot pass the workspace\'s, stale news is not sent, retries stay queued', async () => {
  const db = telegramWorld(), out = capture();
  db.rows('company_connect_prefs')[0].daily_cap = 20;
  notice(db, 'a'); notice(db, 'b'); notice(db, 'c');
  notice(db, 'old', 'test_todo', M_EMP, iso(-3 * DAY));
  const env = envWith({ telegramEnabled: true, telegram: out.telegram });
  assertEquals((await pushOrg(db, env, org(db), NOW)).sent, 2);
  assert(!out.sent.some((entry) => db.rows('company_notices').find((row) => `company:${row.id}` === entry.key)?.dedupe_key === 'old'));

  const flaky = telegramWorld();
  notice(flaky, 'a');
  const retryEnv = envWith({ telegramEnabled: true, telegram: () => Promise.resolve({ ok: false, retry: true, reason: 'gateway' }) });
  await pushOrg(flaky, retryEnv, org(flaky), NOW);
  assertEquals(flaky.rows('company_notices')[0].push_state, null);
  const refused = telegramWorld();
  notice(refused, 'a');
  await pushOrg(refused, envWith({ telegramEnabled: true, telegram: () => Promise.reject(new Error('net')) }), org(refused), NOW);
  assertEquals(refused.rows('company_notices')[0].push_state, null);
  const blocked = telegramWorld();
  notice(blocked, 'a');
  await pushOrg(blocked, envWith({ telegramEnabled: true, telegram: () => Promise.resolve({ ok: false, reason: 'blocked' }) }), org(blocked), NOW);
  assertEquals(blocked.rows('company_notices')[0].push_state, 'failed');
});

Deno.test('Telegram: overlapping jobs reserve different notices inside one daily cap', async () => {
  const db = telegramWorld(), out = capture();
  for (const key of ['a', 'b', 'c', 'd']) notice(db, key);
  const env = envWith({ telegramEnabled: true, telegram: out.telegram });
  const outcomes = await Promise.all([pushOrg(db, env, org(db), NOW), pushOrg(db, env, org(db), NOW)]);
  assertEquals(outcomes.reduce((total, outcome) => total + outcome.sent, 0), 2);
  assertEquals(out.sent.length, 2);
  assertEquals(new Set(out.sent.map((message) => message.key)).size, 2);
});

Deno.test('Telegram: an unavailable reservation cannot send any notice', async () => {
  const db = telegramWorld(), out = capture();
  notice(db, 'a');
  delete db.rpcs.company_claim_push_notice;
  let refused = false;
  try { await pushOrg(db, envWith({ telegramEnabled: true, telegram: out.telegram }), org(db), NOW); }
  catch { refused = true; }
  assert(refused);
  assertEquals(out.sent.length, 0);
});

Deno.test('quiet hours run over midnight', () => {
  assertEquals(inQuietHours(22, 21, 9), true);
  assertEquals(inQuietHours(3, 21, 9), true);
  assertEquals(inQuietHours(12, 21, 9), false);
  assertEquals(inQuietHours(12, 9, 17), true);
  assertEquals(inQuietHours(12, 8, 8), false);
});

Deno.test('prefs: opt in needs every switch and a linked account; opting out always works', async () => {
  const db = world();
  const off = api(db);
  const me = await off('GET', `orgs/${ORG}/connect/me`, { user: EMP });
  assertEquals(me.body.available, false);
  assertEquals(me.body.linked, true);
  assertEquals((await off('PATCH', `orgs/${ORG}/connect/me`, { user: EMP, body: { telegram_opt_in: true } })).body.code, 'telegram_off');
  db.rows('company_connect_settings').push({ org_id: ORG, telegram_enabled: true });
  const on = api(db, { telegramEnabled: true, telegram: () => Promise.resolve({ ok: true }), telegramBot: 'schood_bot' });
  assertEquals((await on('PATCH', `orgs/${ORG}/connect/me`, { user: OWNER, body: { telegram_opt_in: true } })).body.code, 'telegram_not_linked');
  const saved = await on('PATCH', `orgs/${ORG}/connect/me`, { user: EMP, body: { telegram_opt_in: true, quiet_start: 22, muted_kinds: ['session_soon'], locale: 'uz' } });
  assertEquals(saved.status, 200);
  assertEquals(saved.body.prefs.telegram_opt_in, true);
  assertEquals((await on('PATCH', `orgs/${ORG}/connect/me`, { user: EMP, body: { muted_kinds: ['nope'] } })).status, 400);
  assertEquals((await on('PATCH', `orgs/${ORG}/connect/me`, { user: EMP, body: { quiet_start: 25 } })).status, 400);
  db.rows('company_orgs')[0].status = 'suspended';
  assertEquals((await on('PATCH', `orgs/${ORG}/connect/me`, { user: EMP, body: { telegram_opt_in: false } })).status, 200);
  assertEquals(db.rows('company_connect_prefs')[0].telegram_opt_in, false);
});

Deno.test('Telegram link: uses the platform token and maps its errors', async () => {
  const db = world();
  db.rows('company_connect_settings').push({ org_id: ORG, telegram_enabled: true });
  db.rpcs.issue_telegram_link_token = () => [{ token: 'a'.repeat(40), expires_at: iso(3600_000) }];
  // supabase-js answers .maybeSingle() on rpc; the fake rpc returns a promise, so give it that shape.
  const realRpc = db.rpc.bind(db);
  (db as unknown as { rpc: unknown }).rpc = (name: string, args: Record<string, unknown>) => {
    const result = realRpc(name, args);
    const single = () => result.then(({ data, error }) => ({ data: Array.isArray(data) ? data[0] : data, error }));
    return Object.assign(result, { maybeSingle: single });
  };
  const off = api(db);
  assertEquals((await off('POST', `orgs/${ORG}/connect/telegram/link`, { user: EMP })).body.code, 'telegram_off');
  const call = api(db, { telegramEnabled: true, telegram: () => Promise.resolve({ ok: true }), telegramBot: '@schood_bot' });
  const link = await call('POST', `orgs/${ORG}/connect/telegram/link`, { user: EMP });
  assertEquals(link.body.link_url, `https://t.me/schood_bot?start=${'a'.repeat(40)}`);
  db.rpcs.confirm_telegram_link_token = () => { throw new Error('link_token_not_presented_in_telegram'); };
  assertEquals((await call('POST', `orgs/${ORG}/connect/telegram/confirm`, { user: EMP, body: { token: 'a'.repeat(40) } })).body.code, 'telegram_not_opened');
  db.rpcs.confirm_telegram_link_token = () => { throw new Error('telegram_chat_already_linked'); };
  const taken = await call('POST', `orgs/${ORG}/connect/telegram/confirm`, { user: EMP, body: { token: 'a'.repeat(40) } });
  assertEquals(taken.body.code, 'telegram_taken');
  assert(!JSON.stringify(taken.body).includes('telegram_chat_already_linked'));
  db.rpcs.confirm_telegram_link_token = () => [{ user_id: EMP }];
  assertEquals((await call('POST', `orgs/${ORG}/connect/telegram/confirm`, { user: EMP, body: { token: 'a'.repeat(40) } })).body.linked, true);
  assertEquals((await call('POST', `orgs/${ORG}/connect/telegram/confirm`, { user: EMP, body: { token: 'bad token' } })).status, 400);
});

Deno.test('hub: only HR reads it, and a workspace switch sends nothing by itself', async () => {
  const db = world();
  const call = api(db);
  assertEquals((await call('GET', `orgs/${ORG}/connect/overview`, { user: EMP })).status, 403);
  assertEquals((await call('GET', `orgs/${ORG}/connect/overview`, { user: MGR })).status, 403);
  const view = await call('GET', `orgs/${ORG}/connect/overview?locale=uz`, { user: ADMIN });
  assertEquals(view.body.switches, { telegram: false, email: false, webhooks: false });
  assert(view.body.samples[0].text.includes('muddati'));
  const saved = await call('PATCH', `orgs/${ORG}/connect/settings`, { user: ADMIN, body: { telegram_enabled: true, quiet_start: 22, daily_cap: 5, digest_enabled: true, digest_weekday: 3 } });
  assertEquals(saved.body.settings.telegram_enabled, true);
  assertEquals(saved.body.settings.digest_weekday, 3);
  assertEquals((await call('PATCH', `orgs/${ORG}/connect/settings`, { user: ADMIN, body: { daily_cap: 99 } })).status, 400);
  assertEquals((await call('PATCH', `orgs/${ORG}/connect/settings`, { user: ADMIN, body: { telegram_enabled: 'yes' } })).status, 400);
  assert(db.rows('company_audit').some((row) => row.action === 'connect.settings_updated'));
  // Paused: reads work, writes do not.
  db.rows('company_orgs')[0].status = 'suspended';
  assertEquals((await call('GET', `orgs/${ORG}/connect/overview`, { user: ADMIN })).status, 200);
  assertEquals((await call('PATCH', `orgs/${ORG}/connect/settings`, { user: ADMIN, body: { daily_cap: 2 } })).body.code, 'org_suspended');
});

Deno.test('email invites: off by default, sends with a fresh link, a failure keeps the old one', async () => {
  const db = world();
  db.rows('company_invites').push({ id: 'old', org_id: ORG, member_id: M_INVITED, kind: 'personal', revoked_at: null, expires_at: iso(DAY), uses: 0, max_uses: 1 });
  const off = api(db);
  const refused = await off('POST', `orgs/${ORG}/connect/email/invites`, { user: ADMIN, body: { member_ids: [M_INVITED] } });
  assertEquals(refused.body.code, 'email_off');
  assertEquals((await off('GET', `orgs/${ORG}/connect/email/invited`, { user: ADMIN })).body.people.map((row: { id: string }) => row.id), [M_INVITED]);
  const sent: { to: string; subject: string; text: string }[] = [];
  db.rows('company_connect_settings').push({ org_id: ORG, email_enabled: true });
  // The function switch alone or the workspace switch alone is not enough.
  assertEquals((await api(db, { emailEnabled: false, email: () => Promise.resolve({ ok: true }) })('POST', `orgs/${ORG}/connect/email/invites`, { user: ADMIN, body: { member_ids: [M_INVITED] } })).body.code, 'email_off');

  const failing = api(db, { emailEnabled: true, email: () => Promise.resolve({ ok: false, reason: 'smtp' }) });
  const failed = await failing('POST', `orgs/${ORG}/connect/email/invites`, { user: ADMIN, body: { member_ids: [M_INVITED] } });
  assertEquals(failed.body.results[0].status, 'failed');
  assertEquals(db.rows('company_invites').find((row) => row.id === 'old')!.revoked_at, null);
  assertEquals(db.rows('company_invites').filter((row) => row.member_id === M_INVITED && !row.revoked_at).length, 1);

  const call = api(db, { emailEnabled: true, email: (message) => { sent.push(message); return Promise.resolve({ ok: true }); } });
  const result = await call('POST', `orgs/${ORG}/connect/email/invites`, { user: ADMIN, body: { member_ids: [M_INVITED, M_EMP, '30000000-0000-4000-8000-0000000000ff'] } });
  assertEquals(result.body.sent, 1);
  assertEquals(sent[0].to, 'new@x.test');
  assert(sent[0].text.includes('https://company.schood.online/join/'));
  assert(sent[0].subject.includes('Acme'));
  assertEquals(db.rows('company_invites').find((row) => row.id === 'old')!.revoked_at, NOW.toISOString());
  assertEquals(result.body.results.find((row: { member_id: string }) => row.member_id === M_EMP).reason, 'not_invited');
  assertEquals(result.body.results.find((row: { member_id: string }) => row.member_id.endsWith('ff')).reason, 'not_found');
  // Only the hash is stored.
  assert(!JSON.stringify(db.rows('company_invites')).includes(sent[0].text.match(/join\/(\S+)/)![1]));
  assertEquals((await call('POST', `orgs/${ORG}/connect/email/invites`, { user: EMP, body: { member_ids: [M_INVITED] } })).status, 403);
  assertEquals((await call('POST', `orgs/${ORG}/connect/email/invites`, { user: ADMIN, body: { member_ids: [] } })).status, 400);
});

Deno.test('email invites: a double click sends one, and the daily cap holds', async () => {
  const db = world();
  db.rows('company_connect_settings').push({ org_id: ORG, email_enabled: true });
  const counts = new Map<string, number>();
  db.rpcs.company_connect_hit = ({ p_bucket, p_limit }) => {
    const next = (counts.get(String(p_bucket)) ?? 0) + 1;
    counts.set(String(p_bucket), next);
    return next <= Number(p_limit);
  };
  const sent: unknown[] = [];
  const call = api(db, { emailEnabled: true, email: (message) => { sent.push(message); return Promise.resolve({ ok: true }); } });
  await call('POST', `orgs/${ORG}/connect/email/invites`, { user: ADMIN, body: { member_ids: [M_INVITED] } });
  const second = await call('POST', `orgs/${ORG}/connect/email/invites`, { user: ADMIN, body: { member_ids: [M_INVITED] } });
  assertEquals(second.body.results[0].reason, 'just_sent');
  assertEquals(sent.length, 1);
});

Deno.test('messages exist in all three languages', () => {
  for (const locale of ['en', 'ru', 'uz'] as const) {
    for (const kind of ['assignment_due', 'test_todo', 'session_soon', 'candidate_finished', 'seat_on', 'seat_off', 'contract_ending', 'weekly_digest', 'unknown_kind']) {
      assert(noticeText(locale, kind, { title: 'Title', date: '2026-12-01', at: '2026-12-01T09:30:00Z', learners: 1, people: 2, minutes: 3, tests: 4, candidates: 5 }, null).length > 3);
    }
    const mail = inviteEmail(locale, 'Acme', 'Ann', 'https://x/join/t');
    assert(mail.subject.includes('Acme') && mail.text.includes('https://x/join/t') && mail.text.includes('Ann'));
  }
  assert(noticeText('en', 'session_soon', { title: 'X', at: '2026-12-01T09:30:00Z' }, null).includes('01.12 14:30'));
  assert(noticeText('uz', 'candidate_finished', { title: 'X' }, 'https://a/b').includes('Ochish: https://a/b'));
});

Deno.test('job: a finished track gets no reminder', async () => {
  const db = world();
  const { findTrack } = await import('./training/tracks/index.ts');
  const lessons = findTrack('general')!.lessons;
  db.rows('company_assignments').push({ id: 'a1', org_id: ORG, track_code: 'general', target_level: null, due_date: '2026-11-08', department_id: null, member_id: M_EMP, status: 'active' });
  for (const lesson of lessons) db.rows('company_lesson_progress').push({ id: crypto.randomUUID(), org_id: ORG, member_id: M_EMP, track_code: 'general', lesson_code: lesson.code, status: 'completed' });
  await sweepOrg(db, org(db), { digest_enabled: false } as never, iso(-DAY), NOW);
  assertEquals(db.rows('company_notices').filter((row) => row.kind === 'assignment_due').length, 0);
});

Deno.test('job: refuses a wrong secret; with switches off it only makes in-app notices', async () => {
  const db = world();
  db.rows('company_sessions').push({ id: 's1', org_id: ORG, title: 'x', status: 'scheduled', starts_at: iso(3600_000), department_ids: [], member_ids: [] });
  const call = api(db);
  assertEquals((await call('POST', 'internal/connect/run')).status, 401);
  db.rows('internal_runtime_secrets').push({ key: 'company_connect_secret', secret: 's'.repeat(40) });
  const handler = testHandler(db, routes, { now: () => NOW });
  assertEquals((await handler('POST', 'internal/connect/run')).status, 401);
  const result = await runConnectJob({ db, env: TEST_ENV, now: () => NOW });
  assert(result.notices > 0);
  assertEquals(result.telegram.sent, 0);
  assertEquals(result.webhooks.sent, 0);
});
