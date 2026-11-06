// Drives every connect route through the real handler, supabase-js and PostgREST over a
// real Postgres, because the route tests' FakeDb cannot see a wrong column name, a bad
// upsert target, a CHECK violation or a missing grant. Throwaway containers on a private
// network; the adapters are stubs, so nothing reaches anyone. Not part of the function:
// nothing imports this file.
//   deno run --no-lock -A supabase/functions/company/connect/postgrest.check.ts
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';
import { routes as connect } from '../connect.ts';
import { routes as core } from '../core.ts';
import { createCompanyHandler } from '../handler.ts';
import { noAi, TEST_ENV } from '../testing.ts';
import type { CompanyEnv, Route } from '../types.ts';
import type { ConnectConfig } from './shared.ts';

const ROOT = new URL('../../../../', import.meta.url);
const suffix = crypto.randomUUID().slice(0, 8);
const NETWORK = `schood-connect-${suffix}-net`, DB = `schood-connect-${suffix}-db`, REST = `schood-connect-${suffix}-rest`;
const SECRET = `${crypto.randomUUID()}${crypto.randomUUID()}`, PASSWORD = crypto.randomUUID().replaceAll('-', '');

async function run(args: string[], input?: string) {
  const child = new Deno.Command('docker', { args, stdin: input === undefined ? 'null' : 'piped', stdout: 'piped', stderr: 'piped' }).spawn();
  if (input !== undefined) {
    const writer = child.stdin.getWriter();
    await writer.write(new TextEncoder().encode(input));
    await writer.close();
  }
  const { code, stdout, stderr } = await child.output();
  return { code, out: new TextDecoder().decode(stdout), err: new TextDecoder().decode(stderr) };
}
async function docker(args: string[], input?: string) {
  const result = await run(args, input);
  if (result.code !== 0) throw new Error(`docker ${args.slice(0, 2).join(' ')}: ${result.err || result.out}`);
  return result.out;
}
const sql = async (query: string) => (await docker(['exec', '-i', DB, 'psql', '-U', 'postgres', '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1', '-q'], query)).trim();

const b64 = (value: string | Uint8Array) => btoa(String.fromCharCode(...(typeof value === 'string' ? new TextEncoder().encode(value) : value))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
async function jwt(role: string) {
  const head = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' })), body = b64(JSON.stringify({ role, exp: Math.floor(Date.now() / 1000) + 7200 }));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return `${head}.${body}.${b64(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${head}.${body}`))))}`;
}

const uid = (n: number) => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const mid = (n: number) => `30000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const OWNER = uid(1), ADMIN = uid(2), EMP = uid(3), OTHER = uid(4);
const ORG = '10000000-0000-4000-8000-000000000001', ORG2 = '10000000-0000-4000-8000-000000000002', DEPT = '40000000-0000-4000-8000-000000000001';
const TEST = '50000000-0000-4000-8000-000000000001', HIRE = '50000000-0000-4000-8000-000000000002';

const BOOT = `
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;
create role authenticator login noinherit password '${PASSWORD}';
grant anon, authenticated, service_role to authenticator;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`;
const SEED = `
alter table public.users add column if not exists telegram_chat_id text;
create table public.internal_runtime_secrets (key text primary key, secret text not null);
insert into public.internal_runtime_secrets values ('company_connect_secret', '${'s'.repeat(40)}');
create function public.issue_telegram_link_token(p_user_id uuid, p_telegram_user_id text default null, p_acquisition_session_id uuid default null)
  returns table(token text, expires_at timestamptz) language sql as $$ select repeat('a', 40), now() + interval '1 hour' $$;
create function public.confirm_telegram_link_token(p_token text, p_user_id uuid)
  returns table(user_id uuid, display_name text, telegram_chat_id text) language plpgsql as $$ begin raise exception 'link_token_not_presented_in_telegram'; end $$;
insert into public.users (id, role, telegram_chat_id) values ('${OWNER}', 'user', null), ('${ADMIN}', 'user', '111'), ('${EMP}', 'user', '222'), ('${OTHER}', 'user', null);
insert into public.company_orgs (id, name, status, seats_limit, settings) values ('${ORG}', 'Acme', 'active', 5, '{"locale":"ru"}'), ('${ORG2}', 'Other', 'active', 5, '{}');
insert into public.company_departments (id, org_id, name) values ('${DEPT}', '${ORG}', 'Sales');
insert into public.company_members (id, org_id, user_id, email, full_name, role, status, seat, consent_at, joined_at, department_id) values
  ('${mid(1)}', '${ORG}', '${OWNER}', 'owner@x.test', 'Owner', 'owner', 'active', false, now(), now() - interval '10 days', null),
  ('${mid(2)}', '${ORG}', '${ADMIN}', 'admin@x.test', 'Admin', 'admin', 'active', false, now(), now() - interval '10 days', null),
  ('${mid(3)}', '${ORG}', '${EMP}', 'emp@x.test', 'Emp', 'employee', 'active', true, now() - interval '5 days', now() - interval '10 days', '${DEPT}'),
  ('${mid(4)}', '${ORG2}', '${OTHER}', 'other@x.test', 'Other', 'owner', 'active', false, now(), now(), null);
insert into public.company_members (id, org_id, email, full_name, role, status) values ('${mid(5)}', '${ORG}', 'new@x.test', 'New Person', 'employee', 'invited');
update public.company_members set level = 'b1', level_source = 'placement', level_score = 55, level_at = now() - interval '1 minute' where id = '${mid(3)}';
insert into public.company_assessments (id, org_id, kind, title, status) values ('${TEST}', '${ORG}', 'placement', 'Placement', 'open'), ('${HIRE}', '${ORG}', 'hiring', 'Reception', 'open');
insert into public.company_attempts (org_id, assessment_id, member_id, status, deadline_at, submitted_at, graded_at, overall_level, overall_score) values ('${ORG}', '${HIRE}', null, 'graded', now(), now() - interval '1 minute', now() - interval '1 minute', 'b1', 55.5);
update public.company_attempts set candidate_name = 'Cand', candidate_email = 'c@x.test' where assessment_id = '${HIRE}';
insert into public.company_assignments (org_id, track_code, due_date, member_id) values ('${ORG}', 'general', (now() at time zone 'Asia/Tashkent')::date + 2, '${mid(3)}');
insert into public.company_sessions (org_id, title, starts_at) values ('${ORG}', 'Speaking club', now() + interval '3 hours');
insert into public.company_activity (org_id, member_id, kind, minutes, points) values ('${ORG}', '${mid(3)}', 'lesson', 20, 5), ('${ORG}', '${mid(3)}', 'test', 30, 5);
insert into public.company_lesson_progress (org_id, member_id, track_code, lesson_code, status) values ('${ORG}', '${mid(3)}', 'general', 'x1', 'completed');
insert into public.company_audit (org_id, action, target) values ('${ORG}', 'member.seat_on', '${mid(3)}');
`;

const sent = { telegram: [] as any[], email: [] as any[], webhook: [] as any[] };
const config: ConnectConfig = {
  telegramEnabled: true, emailEnabled: true, webhooksEnabled: true, telegramBot: 'schood_test_bot',
  telegram: (message) => { sent.telegram.push(message); return Promise.resolve({ ok: true }); },
  email: (message) => { sent.email.push(message); return Promise.resolve({ ok: true }); },
  webhook: (request) => { sent.webhook.push(request); return Promise.resolve({ ok: true, status: 200 }); },
};

let failures = 0;
function ok(label: string, condition: unknown, detail: unknown = '') {
  if (!condition) { failures++; console.log(`FAIL ${label} ${JSON.stringify(detail)?.slice(0, 500) ?? ''}`); }
}

async function main() {
  await docker(['network', 'create', NETWORK]);
  await docker(['run', '--detach', '--name', DB, '--network', NETWORK, '--network-alias', 'db', '--env', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:16-alpine']);
  for (let i = 0; i < 120; i++) {
    if ((await run(['exec', DB, 'psql', '-h', '127.0.0.1', '-U', 'postgres', '-c', 'select 1'])).code === 0) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  await sql(BOOT);
  await sql(await Deno.readTextFile(new URL('supabase/tests/company.fixture.sql', ROOT)));
  const files = [...Deno.readDirSync(new URL('supabase/migrations/', ROOT))].map((entry) => entry.name).filter((name) => /^(20261031\d+_company_|20261106160000_company_connect)/.test(name)).sort();
  for (const file of files) await sql(await Deno.readTextFile(new URL(`supabase/migrations/${file}`, ROOT)));
  await sql(SEED);
  console.log(`Applied ${files.length} migrations.`);
  await docker(['run', '--detach', '--name', REST, '--network', NETWORK, '--publish', '127.0.0.1::3000', '--env', `PGRST_DB_URI=postgres://authenticator:${PASSWORD}@db:5432/postgres`, '--env', 'PGRST_DB_SCHEMAS=public', '--env', 'PGRST_DB_ANON_ROLE=anon', '--env', `PGRST_JWT_SECRET=${SECRET}`, '--env', 'PGRST_DB_MAX_ROWS=1000', 'postgrest/postgrest:v14.1']);
  const port = Number((await docker(['port', REST, '3000/tcp'])).trim().split('\n')[0].split(':').pop());
  const service = await jwt('service_role');
  for (let i = 0; i < 60; i++) {
    const up = await fetch(`http://127.0.0.1:${port}/company_orgs?limit=0`, { headers: { Authorization: `Bearer ${service}` } }).then(async (response) => { await response.body?.cancel(); return response.status === 200; }, () => false);
    if (up) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  const dbErrors: string[] = [];
  const db = createClient(`http://127.0.0.1:${port}`, service, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input, init) => {
        const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
        url.pathname = url.pathname.replace(/^\/rest\/v1/, '');
        let response: Response | null = null;
        for (let attempt = 0; !response; attempt++) {
          try { response = await fetch(url, init); } catch (cause) { if (attempt >= 4) throw cause; await new Promise((resolve) => setTimeout(resolve, 100)); }
        }
        if (response.status >= 400) dbErrors.push(`${init?.method ?? 'GET'} ${decodeURIComponent(url.pathname + url.search)} -> ${response.status} ${await response.clone().text()}`);
        return response;
      },
    },
  });
  const routes: Route[] = [...core, ...connect];
  const logged: string[] = [];
  const realError = console.error;
  console.error = (...args: unknown[]) => { logged.push(args.map(String).join(' ')); };
  const handler = createCompanyHandler({
    db, routes, origins: [], ai: noAi, env: { ...TEST_ENV, connect: config } as CompanyEnv,
    userFromToken: (token) => Promise.resolve([OWNER, ADMIN, EMP, OTHER].includes(token) ? { id: token, email: `${token.slice(-2)}@x.test` } : null),
  });
  const reached = new Set<string>();
  const call = async (method: string, path: string, { as, body, expect = 200, headers = {} }: { as?: string; body?: unknown; expect?: number; headers?: Record<string, string> } = {}) => {
    const response = await handler(new Request(`https://x.test/functions/v1/company/${path}`, { method, headers: { 'Content-Type': 'application/json', ...(as ? { Authorization: `Bearer ${as}` } : {}), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }));
    const parsed = await response.json();
    ok(`${method} ${path} -> ${expect}`, response.status === expect, { got: response.status, parsed });
    const have = path.split('?')[0].split('/');
    const route = routes.find((entry) => entry.method === method && entry.path.split('/').length === have.length && entry.path.split('/').every((part, index) => part.startsWith(':') || part === have[index]));
    if (route && response.status < 300) reached.add(`${route.method} ${route.path}`);
    return parsed;
  };
  const o = `orgs/${ORG}/connect`;

  // Notifications, sweep included.
  const count = await call('GET', `${o}/notices/count`, { as: EMP });
  ok('sweep made notices', count.unread >= 3, count);
  const kinds = (await call('GET', `${o}/notices`, { as: EMP })).notices.map((row: any) => row.kind).sort();
  ok('employee kinds', ['assignment_due', 'seat_on', 'session_soon', 'test_todo'].every((kind) => kinds.includes(kind)), kinds);
  const hrKinds = (await call('GET', `${o}/notices`, { as: ADMIN })).notices;
  ok('candidate notice', hrKinds.some((row: any) => row.kind === 'candidate_finished'), hrKinds);
  await call('POST', `${o}/notices/${hrKinds[0].id}/read`, { as: ADMIN });
  await call('POST', `${o}/notices/${hrKinds[0].id}/read`, { as: EMP, expect: 404 });
  await call('POST', `${o}/notices/read-all`, { as: ADMIN });
  ok('read all', (await call('GET', `${o}/notices/count`, { as: ADMIN })).unread === 0);

  // Hub and reminders.
  await call('PATCH', `${o}/settings`, { as: OWNER, body: { telegram_enabled: true, email_enabled: true, digest_enabled: true, quiet_start: 0, quiet_end: 0, daily_cap: 5 } });
  const overview = await call('GET', `${o}/overview?locale=uz`, { as: OWNER });
  ok('overview', overview.switches.telegram && overview.counts.invited === 1, overview);
  const me = await call('GET', `${o}/me`, { as: EMP });
  ok('me', me.linked === true && me.available === true, me);
  await call('PATCH', `${o}/me`, { as: EMP, body: { telegram_opt_in: true, muted_kinds: ['session_soon'], quiet_start: 0, quiet_end: 0, locale: 'uz' } });
  await call('PATCH', `${o}/me`, { as: OWNER, body: { telegram_opt_in: true }, expect: 409 });
  const link = await call('POST', `${o}/telegram/link`, { as: EMP });
  ok('telegram link', String(link.link_url).startsWith('https://t.me/schood_test_bot?start='), link);
  const confirm = await call('POST', `${o}/telegram/confirm`, { as: EMP, body: { token: link.token }, expect: 409 });
  ok('friendly telegram error', confirm.code === 'telegram_not_opened', confirm);

  // Email invites.
  const invited = await call('GET', `${o}/email/invited`, { as: ADMIN });
  ok('invited list', invited.available && invited.people.length === 1, invited);
  const mailed = await call('POST', `${o}/email/invites`, { as: ADMIN, body: { member_ids: [mid(5), mid(3)] } });
  ok('email sent', mailed.sent === 1 && sent.email.length === 1, mailed);
  const again = await call('POST', `${o}/email/invites`, { as: ADMIN, body: { member_ids: [mid(5)] } });
  ok('double click', again.results[0].reason === 'just_sent', again);

  // API keys and the public API.
  const made = await call('POST', `${o}/api-keys`, { as: OWNER, body: { name: 'HRIS', scope: 'write', expires_days: 30 } });
  const key = { Authorization: `Bearer ${made.secret}` };
  ok('keys listed', (await call('GET', `${o}/api-keys`, { as: OWNER })).keys.length === 1);
  const api = (method: string, path: string, options: any = {}) => call(method, `api/v1/${path}`, { headers: key, ...options });
  ok('workspace', (await api('GET', 'workspace')).data.departments.length === 1);
  const people = await api('GET', 'people?status=active&limit=2');
  ok('people page', people.data.length === 2 && people.next_cursor, people);
  ok('next page', (await api('GET', `people?status=active&limit=2&cursor=${people.next_cursor}`)).data.length === 1);
  ok('email filter', (await api('GET', 'people?email=emp@x.test')).data[0].id === mid(3));
  ok('person', (await api('GET', `people/${mid(3)}`)).data.learning.lessons_completed === 1);
  await api('GET', `people/${mid(4)}`, { expect: 404 });
  const created = await api('POST', 'people', { body: { full_name: 'Api Person', email: 'api@x.test', job_role: 'sales', department_id: DEPT } });
  ok('created', String(created.invite_link).includes('/join/'), created);
  const dup = await api('POST', 'people', { body: { full_name: 'Api Person', email: 'api@x.test' }, expect: 409 });
  ok('dup', dup.code === 'member_exists', dup);
  ok('renew', String((await api('POST', `people/${created.data.id}/invite`, { body: {} })).data.invite_link).includes('/join/'));
  ok('email via api', (await api('POST', `people/${created.data.id}/invite`, { body: { send_email: true } })).data.sent === true);
  const tests = await api('GET', 'tests?kind=hiring');
  ok('tests', tests.data.length === 1 && !JSON.stringify(tests).includes('link_token'), tests);
  const results = await api('GET', `tests/${HIRE}/results`);
  ok('results', results.data[0].overall_score === 55.5, results);
  ok('candidates', (await api('GET', 'candidates?status=graded')).data[0].name === 'Cand');
  ok('levels', (await api('GET', 'levels')).data.levels.b1 === 1);
  const today = new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 10);
  const summary = await api('GET', `activity/summary?from=${today}&to=${today}`);
  ok('summary', summary.data.minutes === 50, summary);
  await call('POST', `${o}/api-keys/${(await call('GET', `${o}/api-keys`, { as: OWNER })).keys[0].id}/revoke`, { as: OWNER });
  await api('GET', 'workspace', { expect: 401 });

  // Webhooks through the queue.
  const hook = await call('POST', `${o}/webhooks`, { as: ADMIN, body: { url: 'https://hooks.example.com/in', events: ['test.graded', 'candidate.finished', 'member.joined', 'member.level_changed', 'seat.changed'], description: 'ATS' } });
  await sql(`update public.company_webhooks set created_at = now() - interval '1 day'`);
  await call('POST', `${o}/webhooks`, { as: ADMIN, body: { url: 'https://10.0.0.1/in', events: ['test.graded'] }, expect: 400 });
  const tested = await call('POST', `${o}/webhooks/${hook.webhook.id}/test`, { as: ADMIN });
  ok('test delivered', tested.sent === true && sent.webhook.length === 1, tested);
  await call('PATCH', `${o}/webhooks/${hook.webhook.id}`, { as: ADMIN, body: { description: 'ATS 2' } });
  await call('POST', `${o}/webhooks/${hook.webhook.id}/rotate`, { as: ADMIN });
  ok('hooks listed', !JSON.stringify(await call('GET', `${o}/webhooks`, { as: ADMIN })).includes('whsec_'));

  // The job: the wrong secret, then the right one, twice.
  await call('POST', 'internal/connect/run', { expect: 401 });
  await sql(`update public.company_connect_settings set notices_swept_at = null, last_digest_week = null, digest_weekday = extract(isodow from (now() at time zone 'Asia/Tashkent'))::int`);
  const job = await call('POST', 'internal/connect/run', { headers: { 'x-worker-secret': 's'.repeat(40) } });
  ok('job events', job.events >= 4 && job.webhooks.sent >= 4, job);
  ok('job telegram', job.telegram.sent >= 1 && sent.telegram.every((message) => message.user_id === EMP), { job, sent: sent.telegram });
  ok('digest', Number(await sql(`select count(*) from company_notices where kind = 'weekly_digest'`)) === 2);
  const jobAgain = await call('POST', 'internal/connect/run', { headers: { 'x-worker-secret': 's'.repeat(40) } });
  ok('job repeats harmlessly', jobAgain.events === 0 && jobAgain.webhooks.sent === 0, jobAgain);
  const log = await call('GET', `${o}/webhooks/${hook.webhook.id}/deliveries?limit=5`, { as: ADMIN });
  ok('log', log.deliveries.length >= 1, log);
  await sql(`update public.company_webhook_deliveries set status = 'dead' where id = '${log.deliveries[0].id}'`);
  await call('POST', `${o}/webhooks/${hook.webhook.id}/deliveries/${log.deliveries[0].id}/retry`, { as: ADMIN });
  await call('DELETE', `${o}/webhooks/${hook.webhook.id}`, { as: ADMIN });

  // Import.
  const text = 'Employee Name,Work Email,Department\nOlga Petrova,olga@x.test,Marketing\nEmp Renamed,emp@x.test,Sales\nBroken,nope,Sales\n';
  await call('GET', `${o}/import`, { as: ADMIN });
  const preview = await call('POST', `${o}/import/preview`, { as: ADMIN, body: { text } });
  ok('plan', preview.plan.add_total === 1 && preview.plan.update_total === 1 && preview.plan.error_total === 1, preview.plan);
  const applied = await call('POST', `${o}/import/apply`, { as: ADMIN, body: { text, fingerprint: preview.fingerprint } });
  ok('applied', applied.added === 1 && applied.updated === 1 && applied.departments_created === 1, applied);
  await call('POST', `${o}/import/apply`, { as: ADMIN, body: { text, fingerprint: preview.fingerprint }, expect: 409 });
  ok('remembered', (await call('GET', `${o}/import`, { as: ADMIN })).remembered.mapping.email === 'Work Email');

  // Brand.
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkqPr/HwAEewJr3jtx5wAAAABJRU5ErkJggg==';
  await call('PUT', `${o}/brand`, { as: ADMIN, body: { display_name: 'Acme Hotels', brand_color: '#123456', logo: `data:image/png;base64,${png}` } });
  await call('PUT', `${o}/brand`, { as: ADMIN, body: { brand_color: '#ffee00' }, expect: 400 });
  ok('brand read', (await call('GET', `${o}/brand`, { as: ADMIN })).brand.display_name === 'Acme Hotels');
  const open = await call('GET', `public/brand/${ORG}`);
  ok('public brand', open.brand.name === 'Acme Hotels' && open.brand.logo.startsWith('data:image/png'), open);

  // Privacy and audit. Tables other streams add may not exist here: that must not fail.
  ok('summary', (await call('GET', `${o}/privacy/summary`, { as: ADMIN })).counts.sharing === 3);
  ok('search', (await call('GET', `${o}/privacy/people?q=emp`, { as: ADMIN })).people.length >= 1);
  const exported = await call('GET', `${o}/privacy/people/${mid(3)}/export`, { as: ADMIN });
  ok('export', exported.learning.lessons.length === 1, exported);
  const own = await call('GET', `${o}/privacy/me/export`, { as: EMP });
  ok('own export', own.learning.activity.length === 2, own);
  const erased = await call('POST', `${o}/privacy/people/${mid(3)}/erase-learning`, { as: ADMIN, body: { confirm: 'ERASE' } });
  ok('erased', erased.erased.company_lesson_progress === 1 && erased.erased.company_activity === 1, erased);
  ok('tests stay', Number(await sql(`select count(*) from company_activity where kind = 'test'`)) === 1);
  const audit = await call('GET', `${o}/audit?action=privacy.&limit=10`, { as: ADMIN });
  ok('audit', audit.entries.length >= 2 && audit.entries[0].actor_name, audit);
  ok('audit csv', (await call('GET', `${o}/audit/export?from=2020-01-01`, { as: ADMIN })).rows > 3);

  // Other workspaces and roles.
  await call('GET', `${o}/overview`, { as: OTHER, expect: 403 });
  await call('GET', `${o}/overview`, { as: EMP, expect: 403 });

  await sql(`select public.company_connect_purge()`);
  console.error = realError;
  const never = connect.map((route) => `${route.method} ${route.path}`).filter((name) => !reached.has(name));
  // A table another release adds is allowed to be absent, and refusals above are expected.
  const unexpected = dbErrors.filter((line) => !/company_(writing_snippets|training_certificates|risk_actions|coach_)/.test(line) && !line.includes('23505'));
  console.log(`routes reached: ${reached.size}, never reached: ${never.join(', ') || 'none'}`);
  for (const line of unexpected) { failures++; console.log(`DB ERROR ${line.slice(0, 400)}`); }
  for (const line of logged.filter((entry) => !entry.includes('confirm_telegram'))) { failures++; console.log(`LOGGED ${line.slice(0, 400)}`); }
  if (never.length) failures++;
  console.log(failures ? `${failures} problem(s)` : 'connect: real API ok');
}

let code = 1;
try {
  await main();
  code = failures ? 1 : 0;
} catch (cause) {
  console.log(String(cause instanceof Error ? cause.stack : cause));
} finally {
  await run(['rm', '--force', REST, DB]);
  await run(['network', 'rm', NETWORK]);
}
Deno.exit(code);
