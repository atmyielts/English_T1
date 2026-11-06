// The public API and its keys: hashed storage, scope, workspace walls, pagination,
// rate limits, and the consent rule on every read.
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { routes as connect } from './connect.ts';
import { routes as core } from './core.ts';
import { createCompanyHandler } from './handler.ts';
import { sha256 } from './util.ts';
import { FakeDb, noAi, TEST_ENV, testHandler } from './testing.ts';
import type { CompanyEnv, Route } from './types.ts';

const routes: Route[] = [...core, ...connect];
const ORG = '10000000-0000-4000-8000-000000000001', OTHER = '10000000-0000-4000-8000-000000000002';
const OWNER = '20000000-0000-4000-8000-000000000001', EMP = '20000000-0000-4000-8000-000000000003', MGR = '20000000-0000-4000-8000-000000000005';
const DEPT = '40000000-0000-4000-8000-000000000001', OTHER_DEPT = '40000000-0000-4000-8000-000000000002';
const NOW = new Date('2026-11-06T07:00:00Z');
const DAY = 86_400_000;
const iso = (offset: number) => new Date(NOW.getTime() + offset).toISOString();
const mid = (n: number) => `30000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const person = (n: number, extra: Record<string, unknown> = {}) => ({
  id: mid(n), org_id: ORG, user_id: null, email: `p${n}@x.test`, full_name: `Person ${n}`, role: 'employee', department_id: null, job_role: 'general', status: 'active', seat: false,
  level: null, level_score: null, level_source: null, level_at: null, target_level: null, target_date: null, consent_at: null, joined_at: iso(-20 * DAY), invited_at: iso(-21 * DAY), ...extra,
});

function world() {
  const db = new FakeDb({
    users: [{ id: OWNER, role: 'user' }, { id: EMP, role: 'user' }, { id: MGR, role: 'user' }],
    company_orgs: [
      { id: ORG, name: 'Acme', industry: 'it', size_band: '1-50', status: 'active', seats_limit: 5, tests_limit: 10, tests_used: 1, contract_ends_at: iso(300 * DAY), settings: { locale: 'ru' }, created_at: iso(-30 * DAY) },
      { id: OTHER, name: 'Other', industry: 'it', size_band: '1-50', status: 'active', seats_limit: 5, tests_limit: 10, tests_used: 0, contract_ends_at: null, settings: {}, created_at: iso(-30 * DAY) },
    ],
    company_departments: [{ id: DEPT, org_id: ORG, name: 'Sales' }, { id: OTHER_DEPT, org_id: OTHER, name: 'Theirs' }],
    company_members: [
      person(1, { user_id: OWNER, role: 'owner', full_name: 'Owner', consent_at: iso(-20 * DAY) }),
      person(2, { user_id: EMP, consent_at: iso(-5 * DAY), level: 'b1', level_source: 'placement', department_id: DEPT }),
      person(3, { user_id: MGR, role: 'manager', level: 'a2' }), // no consent
      person(9, { org_id: OTHER, email: 'theirs@x.test' }),
    ],
    company_invites: [], company_audit: [], company_api_keys: [], company_activity: [], company_lesson_progress: [], company_assessments: [], company_attempts: [], company_notices: [],
  });
  db.rpcs.company_connect_hit = () => true;
  return db;
}

/** Calls with an API key in the Authorization header. */
function client(db: FakeDb, env: Partial<CompanyEnv> = {}) {
  const handler = createCompanyHandler({ db, routes, origins: [], env: { ...TEST_ENV, ...env }, ai: noAi, now: () => NOW, userFromToken: () => Promise.resolve(null) });
  return async (method: string, path: string, key: string | null, body?: unknown) => {
    const response = await handler(new Request(`https://x.supabase.co/functions/v1/company/${path}`, {
      method, headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }));
    return { status: response.status, body: await response.json() };
  };
}

async function keyFor(db: FakeDb, scope: 'read' | 'write' = 'read') {
  const call = testHandler(db, routes, { now: () => NOW });
  const made = await call('POST', `orgs/${ORG}/connect/api-keys`, { user: OWNER, body: { name: 'HRIS', scope } });
  assertEquals(made.status, 200);
  return made.body.secret as string;
}

Deno.test('keys: shown once, stored hashed, HR only, capped and revocable', async () => {
  const db = world();
  const call = testHandler(db, routes, { now: () => NOW });
  assertEquals((await call('POST', `orgs/${ORG}/connect/api-keys`, { user: EMP, body: { name: 'x' } })).status, 403);
  assertEquals((await call('POST', `orgs/${ORG}/connect/api-keys`, { user: MGR, body: { name: 'x' } })).status, 403);
  const made = await call('POST', `orgs/${ORG}/connect/api-keys`, { user: OWNER, body: { name: 'HRIS', scope: 'write', expires_days: 30 } });
  const secret = made.body.secret as string;
  assert(secret.startsWith('scl_'));
  const stored = db.rows('company_api_keys')[0];
  assertEquals(stored.key_hash, await sha256(secret));
  assert(!JSON.stringify(stored).includes(secret));
  const list = await call('GET', `orgs/${ORG}/connect/api-keys`, { user: OWNER });
  assert(!JSON.stringify(list.body).includes('key_hash'));
  assert(!JSON.stringify(list.body).includes(secret));
  assertEquals(list.body.keys[0].key_prefix, secret.slice(0, 12));
  for (let index = 0; index < 9; index++) await call('POST', `orgs/${ORG}/connect/api-keys`, { user: OWNER, body: { name: `k${index}` } });
  assertEquals((await call('POST', `orgs/${ORG}/connect/api-keys`, { user: OWNER, body: { name: 'one too many' } })).body.code, 'too_many_keys');
  const api = client(db);
  assertEquals((await api('GET', 'api/v1/workspace', secret)).status, 200);
  const id = list.body.keys[0].id;
  assertEquals((await call('POST', `orgs/${ORG}/connect/api-keys/${id}/revoke`, { user: OWNER })).status, 200);
  assertEquals((await call('POST', `orgs/${ORG}/connect/api-keys/${id}/revoke`, { user: OWNER })).status, 200);
  assertEquals((await api('GET', 'api/v1/workspace', secret)).body.code, 'api_key_invalid');
  assertEquals((await call('POST', `orgs/${OTHER}/connect/api-keys/${id}/revoke`, { user: OWNER })).status, 403);
  assertEquals(db.rows('company_audit').filter((row) => row.action === 'api_key.created').length, 10);
});

Deno.test('keys: an expired key or a stray token opens nothing', async () => {
  const db = world();
  const secret = await keyFor(db);
  const api = client(db);
  assertEquals((await api('GET', 'api/v1/people', null)).status, 401);
  assertEquals((await api('GET', 'api/v1/people', 'not-a-key')).status, 401);
  assertEquals((await api('GET', 'api/v1/people', 'scl_wrong')).status, 401);
  db.rows('company_api_keys')[0].expires_at = iso(-1000);
  assertEquals((await api('GET', 'api/v1/people', secret)).status, 401);
});

Deno.test('API: a read key cannot write; a closed or paused workspace stops it', async () => {
  const db = world();
  const read = await keyFor(db), write = await keyFor(db, 'write');
  const api = client(db);
  assertEquals((await api('POST', 'api/v1/people', read, { full_name: 'New' })).body.code, 'api_key_scope');
  db.rows('company_orgs')[0].status = 'suspended';
  assertEquals((await api('GET', 'api/v1/people', write)).status, 200);
  assertEquals((await api('POST', 'api/v1/people', write, { full_name: 'New' })).body.code, 'org_suspended');
  db.rows('company_orgs')[0].status = 'active';
  db.rows('company_orgs')[0].contract_ends_at = iso(-1000);
  assertEquals((await api('POST', 'api/v1/people', write, { full_name: 'New' })).body.code, 'contract_ended');
  db.rows('company_orgs')[0].status = 'closed';
  assertEquals((await api('GET', 'api/v1/people', write)).body.code, 'org_closed');
});

Deno.test('API people: only this workspace, paged past the row cap, one stable shape', async () => {
  const db = world();
  for (let n = 100; n < 1350; n++) db.rows('company_members').push(person(n));
  db.maxRows = 1000;
  const secret = await keyFor(db);
  const api = client(db);
  const seen = new Set<string>();
  let cursor: string | null = null, pages = 0;
  do {
    const result: { status: number; body: { data: { id: string }[]; next_cursor: string | null } } = await api('GET', `api/v1/people?limit=200${cursor ? `&cursor=${cursor}` : ''}`, secret);
    assertEquals(result.status, 200);
    for (const row of result.body.data) seen.add(row.id);
    cursor = result.body.next_cursor;
    pages++;
  } while (cursor && pages < 20);
  assertEquals(seen.size, 1253);
  assert(!seen.has(mid(9)));
  const one = await api('GET', 'api/v1/people?email=p2@x.test', secret);
  assertEquals(one.body.data.length, 1);
  assertEquals(Object.keys(one.body.data[0]).sort(), ['department_id', 'email', 'full_name', 'id', 'invited_at', 'job_role', 'joined_at', 'level', 'level_at', 'level_note', 'level_source', 'role', 'seat', 'shares_learning', 'status', 'target_date', 'target_level'].sort());
  assertEquals(one.body.data[0].level_note, 'Schood estimate');
  assertEquals((await api('GET', 'api/v1/people?limit=9999', secret)).status, 400);
  assertEquals((await api('GET', 'api/v1/people?cursor=zzz', secret)).status, 400);
  assertEquals((await api('GET', 'api/v1/people?status=weird', secret)).status, 400);
  assertEquals((await api('GET', `api/v1/people/${mid(9)}`, secret)).status, 404);
});

Deno.test('API: learning detail needs consent, and Schood English time counts from the later date', async () => {
  const db = world();
  db.rows('company_activity').push(
    { id: 1, org_id: ORG, member_id: mid(2), kind: 'english', minutes: 100, points: 0, created_at: iso(-10 * DAY) }, // before agreeing
    { id: 2, org_id: ORG, member_id: mid(2), kind: 'english', minutes: 10, points: 0, created_at: iso(-DAY) },
    { id: 3, org_id: ORG, member_id: mid(2), kind: 'lesson', minutes: 5, points: 0, created_at: iso(-DAY) },
    { id: 4, org_id: ORG, member_id: mid(3), kind: 'lesson', minutes: 500, points: 0, created_at: iso(-DAY) }, // no consent
    { id: 5, org_id: OTHER, member_id: mid(9), kind: 'lesson', minutes: 700, points: 0, created_at: iso(-DAY) },
  );
  db.rows('company_lesson_progress').push({ id: 'l1', org_id: ORG, member_id: mid(3), status: 'completed' }, { id: 'l2', org_id: ORG, member_id: mid(2), status: 'completed' });
  const secret = await keyFor(db);
  const api = client(db);
  const without = await api('GET', `api/v1/people/${mid(3)}`, secret);
  assertEquals(without.body.data.learning, null);
  assertEquals(without.body.data.shares_learning, false);
  // Level estimates are the exception the consent text names.
  assertEquals(without.body.data.level, 'a2');
  const shared = await api('GET', `api/v1/people/${mid(2)}`, secret);
  assertEquals(shared.body.data.learning, { lessons_completed: 1, minutes: 15 });
  const summary = await api('GET', 'api/v1/activity/summary?from=2026-10-20&to=2026-11-06', secret);
  assertEquals(summary.body.data.minutes, 15);
  assertEquals(summary.body.data.people.map((row: { member_id: string }) => row.member_id), [mid(2)]);
  assertEquals(summary.body.data.people_sharing, 2);
  assertEquals(summary.body.data.people_total, 3);
  assert(!JSON.stringify(summary.body).includes(mid(3)));
  assertEquals((await api('GET', 'api/v1/activity/summary?from=2026-01-01&to=2026-11-06', secret)).status, 400);
  assertEquals((await api('GET', 'api/v1/activity/summary?from=2026-02-31', secret)).status, 400);
});

Deno.test('API create and invite: friendly conflicts, the link once, hashed storage', async () => {
  const db = world();
  const secret = await keyFor(db, 'write');
  const api = client(db);
  const made = await api('POST', 'api/v1/people', secret, { full_name: 'Nora New', email: 'NORA@x.test', job_role: 'sales', department_id: DEPT });
  assertEquals(made.status, 200);
  assertEquals(made.body.data.email, 'nora@x.test');
  assertEquals(made.body.data.status, 'invited');
  assert(String(made.body.invite_link).includes('/join/'));
  const raw = String(made.body.invite_link).split('/join/')[1];
  assert(!JSON.stringify(db.rows('company_invites')).includes(raw));
  assertEquals((await api('POST', 'api/v1/people', secret, { full_name: 'Nora Again', email: 'nora@x.test' })).body.code, 'member_exists');
  // A unique index firing after the check above it is still a friendly 409.
  db.uniques.company_members = [{ columns: ['org_id', 'email'], where: (row) => row.status !== 'removed' }];
  const realFrom = db.from.bind(db);
  let hide = true;
  (db as unknown as { from: unknown }).from = (table: string) => {
    const query = realFrom(table);
    if (table === 'company_members' && hide) {
      const eq = query.eq.bind(query);
      (query as unknown as { eq: unknown }).eq = (column: string, value: unknown) => column === 'email' ? eq('email', '__nobody__') : eq(column, value);
    }
    return query;
  };
  const race = await api('POST', 'api/v1/people', secret, { full_name: 'Nora Race', email: 'nora@x.test' });
  assertEquals(race.status, 409);
  assertEquals(race.body.code, 'member_exists');
  hide = false;
  assertEquals((await api('POST', 'api/v1/people', secret, { full_name: 'No Dept', department_id: OTHER_DEPT })).status, 400);
  assertEquals((await api('POST', 'api/v1/people', secret, { full_name: 'x\u0000y' })).status, 400);
  assertEquals((await api('POST', 'api/v1/people', secret, { full_name: 'Too High', role: 'owner' })).status, 400);
  assertEquals((await api('POST', 'api/v1/people', secret, { full_name: 'Bad Job', job_role: 'pilot' })).status, 400);

  const id = made.body.data.id;
  const renewed = await api('POST', `api/v1/people/${id}/invite`, secret);
  assert(String(renewed.body.data.invite_link).includes('/join/'));
  assertEquals(db.rows('company_invites').filter((row) => row.member_id === id && !row.revoked_at).length, 1);
  assertEquals((await api('POST', `api/v1/people/${mid(2)}/invite`, secret)).body.code, 'invite_closed');
  assertEquals((await api('POST', `api/v1/people/${mid(9)}/invite`, secret)).status, 404);
  assertEquals((await api('POST', `api/v1/people/${id}/invite`, secret, { send_email: true })).body.code, 'email_off');
  assert(db.rows('company_audit').some((row) => row.action === 'api.member_created' && row.org_id === ORG));
});

Deno.test('API tests, results and candidates stay inside the workspace and hide tokens and answers', async () => {
  const db = world();
  const TEST = '50000000-0000-4000-8000-000000000001', THEIRS = '50000000-0000-4000-8000-000000000002';
  db.rows('company_assessments').push(
    { id: TEST, org_id: ORG, kind: 'hiring', title: 'Reception', job_role: 'hospitality', skills: ['grammar'], min_level: 'b1', time_limit_minutes: 30, status: 'open', link_token_hash: 'SECRET_HASH', closes_at: null, created_at: iso(-DAY) },
    { id: THEIRS, org_id: OTHER, kind: 'hiring', title: 'Theirs', status: 'open', created_at: iso(-DAY) },
  );
  db.rows('company_attempts').push(
    { id: '60000000-0000-4000-8000-000000000001', org_id: ORG, assessment_id: TEST, member_id: null, candidate_name: 'Cand', candidate_email: 'c@x.test', candidate_phone: '+998', status: 'graded', overall_level: 'b1', overall_score: '55.5', skill_results: { grammar: { score: 55, level: 'b1', extra: 'x' } }, answers: { q: 'SECRET_ANSWER' }, notes: 'SECRET_NOTE', decision: 'hold', started_at: iso(-DAY) },
    { id: '60000000-0000-4000-8000-000000000002', org_id: ORG, assessment_id: TEST, member_id: mid(2), status: 'graded', overall_level: 'a2', overall_score: 40, skill_results: {}, started_at: iso(-DAY) },
    { id: '60000000-0000-4000-8000-000000000003', org_id: OTHER, assessment_id: THEIRS, member_id: null, candidate_name: 'Theirs', status: 'graded', started_at: iso(-DAY) },
  );
  const secret = await keyFor(db);
  const api = client(db);
  const tests = await api('GET', 'api/v1/tests', secret);
  assertEquals(tests.body.data.map((row: { id: string }) => row.id), [TEST]);
  assert(!JSON.stringify(tests.body).includes('SECRET_HASH'));
  const results = await api('GET', `api/v1/tests/${TEST}/results`, secret);
  assertEquals(results.body.data.length, 2);
  assertEquals(results.body.data[0].overall_score, 55.5);
  assertEquals(results.body.data[0].skills, { grammar: { score: 55, level: 'b1' } });
  assert(!JSON.stringify(results.body).includes('SECRET_'));
  assertEquals((await api('GET', `api/v1/tests/${THEIRS}/results`, secret)).status, 404);
  const candidates = await api('GET', 'api/v1/candidates', secret);
  assertEquals(candidates.body.data.map((row: { name: string }) => row.name), ['Cand']);
  assertEquals(candidates.body.data[0].decision, 'hold');
  assertEquals((await api('GET', 'api/v1/candidates?decision=shortlist', secret)).body.data.length, 0);
  assertEquals((await api('GET', 'api/v1/candidates?decision=nope', secret)).status, 400);
});

Deno.test('API levels counts only this workspace and says what a level is', async () => {
  const db = world();
  const secret = await keyFor(db);
  const levels = await client(db)('GET', 'api/v1/levels', secret);
  assertEquals(levels.body.data.total, 3);
  assertEquals(levels.body.data.levels.b1, 1);
  assertEquals(levels.body.data.levels.none, 1);
  assertEquals(levels.body.data.departments.map((row: { id: string }) => row.id), [DEPT]);
  assert(levels.body.data.note.includes('Schood estimates'));
});

Deno.test('API rate limit answers 429 per key, and last_used_at is written sparingly', async () => {
  const db = world();
  const secret = await keyFor(db);
  const counts = new Map<string, number>();
  db.rpcs.company_connect_hit = ({ p_bucket, p_limit }) => {
    const next = (counts.get(String(p_bucket)) ?? 0) + 1;
    counts.set(String(p_bucket), next);
    return next <= Number(p_limit);
  };
  const api = client(db);
  let last = 200;
  for (let index = 0; index < 121; index++) last = (await api('GET', 'api/v1/workspace', secret)).status;
  assertEquals(last, 429);
  const refused = await api('GET', 'api/v1/workspace', secret);
  assertEquals(refused.body.code, 'rate_limited');
  assertEquals(refused.body.retry_after_seconds, 60);
  assertEquals(db.rows('company_api_keys')[0].last_used_at, NOW.toISOString());
});

Deno.test('API: unavailable or malformed counters never bypass rate limits', async () => {
  const db = world();
  const secret = await keyFor(db, 'write');
  const api = client(db);
  for (const counter of [undefined, () => null, () => 'true', () => { throw new Error('counter down'); }]) {
    if (counter) db.rpcs.company_connect_hit = counter;
    else delete db.rpcs.company_connect_hit;
    const result = await api('POST', 'api/v1/people', secret, { full_name: 'Should not be invited', email: 'never@x.test' });
    assertEquals(result.status, 503);
    assertEquals(result.body.code, 'rate_limit_unavailable');
    assertEquals(db.rows('company_invites').length, 0);
    assertEquals(db.rows('company_members').length, 4);
  }
});
