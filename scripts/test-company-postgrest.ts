// Drives every Company English route through the real handler, the real supabase-js
// client and a real PostgREST over a real Postgres. The route tests use an in-memory
// FakeDb, which cannot see wrong column names, invalid embeds, unique or CHECK
// violations, uuid casts, or grant problems. This does.
//
//   deno run --no-lock -A scripts/test-company-postgrest.ts [--verbose] [--keep]
//
// Everything runs in throwaway containers on a private Docker network with random
// names: Postgres has no host port and PostgREST binds to 127.0.0.1 on an ephemeral
// port. No local Supabase, no production, no network AI (the AI is a stub).
// Exit code 0 means no unexpected status, no logged error and no swallowed DB error.
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';
import { createCompanyHandler } from '../supabase/functions/company/handler.ts';
import { allRoutes } from '../supabase/functions/company/routes.ts';
import { TRACKS } from '../supabase/functions/company/training/tracks/index.ts';
import { ACTIVITY_KINDS } from '../packages/company-core/src/mod.ts';
import { DAILY_SELF_REPORTED_MINUTES } from '../supabase/functions/company/training/shared.ts';
import { hiringTrainingV2 } from './company-postgrest-v2-hiring-training.ts';
import { coachConnectV2 } from './company-postgrest-v2-coach-connect.ts';
import { insightsOpsV2 } from './company-postgrest-v2-insights-ops.ts';
import type { V2Harness } from './company-postgrest-v2-harness.ts';
import type { AiCall, CompanyEnv, Route } from '../supabase/functions/company/types.ts';

// PostgREST is pinned to what production runs (supabase/.temp/rest-version). Production
// Postgres is 17; the brief for this harness and test-company-db.mjs use 16-alpine.
const POSTGRES_IMAGE = 'postgres:16-alpine';
const POSTGREST_IMAGE = 'postgrest/postgrest:v14.1';
const VERBOSE = Deno.args.includes('--verbose');
const KEEP = Deno.args.includes('--keep');
const ROOT = new URL('..', import.meta.url);
const suffix = crypto.randomUUID().slice(0, 8);
const NETWORK = `schood-company-pgrst-${suffix}-net`;
const DB = `schood-company-pgrst-${suffix}-db`;
const REST = `schood-company-pgrst-${suffix}-rest`;
const JWT_SECRET = `${crypto.randomUUID()}${crypto.randomUUID()}`;
const AUTHENTICATOR_PASSWORD = crypto.randomUUID().replaceAll('-', '');

// ---------------------------------------------------------------------------
// Docker
// ---------------------------------------------------------------------------
async function run(command: string, args: string[], input?: string) {
  const child = new Deno.Command(command, { args, stdin: input === undefined ? 'null' : 'piped', stdout: 'piped', stderr: 'piped' }).spawn();
  if (input !== undefined) {
    const writer = child.stdin.getWriter();
    await writer.write(new TextEncoder().encode(input));
    await writer.close();
  }
  const { code, stdout, stderr } = await child.output();
  return { code, out: new TextDecoder().decode(stdout), err: new TextDecoder().decode(stderr) };
}
async function docker(args: string[], input?: string): Promise<string> {
  const result = await run('docker', args, input);
  if (result.code !== 0) throw new Error(`docker ${args.slice(0, 2).join(' ')}: ${result.err || result.out}`);
  return result.out;
}
const sql = async (query: string): Promise<string> => (await docker(['exec', '-i', DB, 'psql', '-U', 'postgres', '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1', '-q'], query)).trim();

let cleaned = false;
async function cleanup() {
  if (cleaned || KEEP) return;
  cleaned = true;
  await run('docker', ['rm', '--force', REST, DB]);
  await run('docker', ['network', 'rm', NETWORK]);
}
try {
  Deno.addSignalListener('SIGINT', () => { cleanup().finally(() => Deno.exit(130)); });
} catch { /* not every platform has it */ }

async function b64url(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
async function signJwt(role: string): Promise<string> {
  const head = await b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = await b64url(JSON.stringify({ role, iss: 'schood-company-test', exp: Math.floor(Date.now() / 1000) + 7200 }));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(JWT_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${head}.${body}`)));
  return `${head}.${body}.${await b64url(signature)}`;
}

// ---------------------------------------------------------------------------
// Database setup
// ---------------------------------------------------------------------------
const uid = (n: number) => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const tid = (n: number) => `10000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
/** What a learner buys for themselves: a row a company seat must never touch. */
const BUNDLE = '3a7bd983-58c5-4c75-b5f8-5ac46c94a0fa';
/** The hidden product a company seat grants. */
const SEAT_PRODUCT = 'c0a1e5d2-7b3f-4a86-9c14-5e2f8d6b1a07';
const OWNER = uid(1), ADMIN = uid(2), MANAGER = uid(3), EMP1 = uid(4), EMP2 = uid(5), EMP3 = uid(6), EMP4 = uid(7), EMP5 = uid(8), EMP6 = uid(9), EMP7 = uid(10),
  OTHER_OWNER = uid(11), STAFF = uid(12), NEW_OWNER = uid(13), EMP8 = uid(14), EMP9 = uid(15), EMP10 = uid(16), EMP11 = uid(17), EMP12 = uid(18),
  CLOSING_OWNER = uid(19), CLOSING_ADMIN = uid(20), SOLO_OWNER = uid(21), DOUBLE_JOINER = uid(22), LAST_USE_JOINER = uid(23), SYNC_OWNER = uid(24), SYNC_A = uid(25), SYNC_B = uid(26);
const LINK_HOLDER = uid(94), TEAM_LINK_USER = uid(95);
const USERS = [LINK_HOLDER, TEAM_LINK_USER, OWNER, ADMIN, MANAGER, EMP1, EMP2, EMP3, EMP4, EMP5, EMP6, EMP7, OTHER_OWNER, STAFF, NEW_OWNER, EMP8, EMP9, EMP10, EMP11, EMP12, CLOSING_OWNER, CLOSING_ADMIN, SOLO_OWNER, DOUBLE_JOINER, LAST_USE_JOINER, SYNC_OWNER, SYNC_A, SYNC_B];
const emailOf = (id: string) => `user${Number(id.slice(-2))}@example.uz`;

// What a Supabase project has before any migration: roles, schema usage, and default
// privileges that grant new objects to anon/authenticated/service_role (which is why
// the company migrations must revoke, and why this checks that they did).
const BOOTSTRAP = `
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;
create role authenticator login noinherit password '${AUTHENTICATOR_PASSWORD}';
grant anon, authenticated, service_role to authenticator;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`;

// Tables insights/english.ts reads, copied from the production migrations:
// 20260310100000 (languages), 20260420110000 (learner_language_goals, learning_attempts),
// 20261023090000 (current_cefr_estimate), 20261024121000 (review log, badges), 20261026160200 (channel).
// products and learning_content_registry_items exist only as foreign-key targets.
const ENGLISH_DDL = `
create table if not exists public.products (id uuid primary key default gen_random_uuid());
create table public.learning_content_registry_items (id uuid primary key default gen_random_uuid());
create table public.languages (
  id uuid primary key default gen_random_uuid(), code text not null unique, name text not null,
  status text not null default 'active' check (status in ('draft', 'active', 'disabled', 'archived')),
  metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
alter table public.languages enable row level security;
create table public.learner_language_goals (
  user_id uuid not null references public.users(id) on delete cascade,
  language_id uuid not null references public.languages(id) on delete restrict,
  product_id uuid references public.products(id) on delete set null,
  target_cefr text check (target_cefr in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  goal_keys text[] not null default '{}'::text[],
  daily_time_minutes integer not null default 40 check (daily_time_minutes between 5 and 240),
  metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  current_cefr_estimate text check (current_cefr_estimate is null or current_cefr_estimate in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  primary key (user_id, language_id));
alter table public.learner_language_goals enable row level security;
create table public.learning_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  language_id uuid not null references public.languages(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  content_item_id uuid not null references public.learning_content_registry_items(id) on delete cascade,
  service_key text not null, attempt_type text not null default 'task',
  status text not null default 'started' check (status in ('started', 'submitted', 'scored', 'failed', 'abandoned')),
  response_json jsonb not null default '{}'::jsonb, scoring_json jsonb not null default '{}'::jsonb,
  hint_usage_count integer not null default 0 check (hint_usage_count >= 0), retry_count integer not null default 0 check (retry_count >= 0),
  time_spent_seconds integer check (time_spent_seconds is null or time_spent_seconds >= 0),
  correctness_ratio numeric check (correctness_ratio is null or (correctness_ratio >= 0 and correctness_ratio <= 1)),
  time_efficiency_ratio numeric check (time_efficiency_ratio is null or (time_efficiency_ratio >= 0 and time_efficiency_ratio <= 1)),
  correction_quality_ratio numeric check (correction_quality_ratio is null or (correction_quality_ratio >= 0 and correction_quality_ratio <= 1)),
  overall_score numeric check (overall_score is null or (overall_score >= 0 and overall_score <= 1)),
  started_at timestamptz not null default now(), submitted_at timestamptz, scored_at timestamptz,
  metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
alter table public.learning_attempts enable row level security;
create table public.learner_review_answer_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  language_id uuid not null references public.languages(id) on delete cascade,
  review_item_id uuid not null, correct boolean not null, was_due boolean not null default true,
  answered_at timestamptz not null default now(), channel text check (channel is null or channel in ('web', 'telegram')));
alter table public.learner_review_answer_log enable row level security;
create table public.learner_badges (
  user_id uuid not null references public.users(id) on delete cascade,
  language_id uuid not null references public.languages(id) on delete cascade,
  badge_key text not null check (badge_key ~ '^[a-z0-9_]{2,64}$'),
  earned_at timestamptz not null default now(), seen_at timestamptz,
  primary key (user_id, language_id, badge_key));
alter table public.learner_badges enable row level security;
`;

const SEED = `
insert into public.users (id, role) values ${USERS.map((id) => `('${id}', '${id === STAFF ? 'admin' : 'user'}')`).join(',')};
insert into public.tenants (id) values ${USERS.map((id) => `('${tid(Number(id.slice(-2)))}')`).join(',')};
insert into public.tenant_memberships (tenant_id, user_id, status, role) values ${USERS.map((id) => `('${tid(Number(id.slice(-2)))}', '${id}', 'active', 'owner')`).join(',')};
insert into public.languages (id, code, name) values ('20000000-0000-4000-8000-000000000001', 'en', 'English');
insert into public.products (id) values ('20000000-0000-4000-8000-000000000002');
insert into public.learning_content_registry_items (id) values ('20000000-0000-4000-8000-000000000003');
insert into public.learner_language_goals (user_id, language_id, target_cefr, daily_time_minutes, current_cefr_estimate)
  values ('${EMP1}', '20000000-0000-4000-8000-000000000001', 'B2', 30, 'B1');
insert into public.learning_attempts (user_id, language_id, product_id, content_item_id, service_key, status, time_spent_seconds, correctness_ratio, overall_score, submitted_at)
  values ('${EMP1}', '20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000003', 'grammar', 'scored', 600, 0.8, 0.8, now() - interval '2 days');
insert into public.learner_review_answer_log (user_id, language_id, review_item_id, correct) values ('${EMP1}', '20000000-0000-4000-8000-000000000001', gen_random_uuid(), true);
insert into public.learner_badges (user_id, language_id, badge_key) values ('${EMP1}', '20000000-0000-4000-8000-000000000001', 'first_step');
`;

async function setUpDatabase(): Promise<number> {
  await docker(['network', 'create', NETWORK]);
  await docker(['run', '--detach', '--name', DB, '--network', NETWORK, '--network-alias', 'db', '--env', 'POSTGRES_HOST_AUTH_METHOD=trust', POSTGRES_IMAGE]);
  let ready = false;
  for (let i = 0; i < 60 && !ready; i++) {
    // The image restarts the server once after init, so ask over TCP and for a real query.
    ready = (await run('docker', ['exec', DB, 'psql', '-h', '127.0.0.1', '-U', 'postgres', '-c', 'select 1'])).code === 0;
    if (!ready) await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error('Postgres did not become ready');
  await sql(BOOTSTRAP);
  await sql(await Deno.readTextFile(new URL('supabase/tests/company.fixture.sql', ROOT)));
  await sql(`alter table public.users add column telegram_chat_id text unique, add column full_name text, add column email text;
    create table public.internal_runtime_secrets (key text primary key, secret text not null);
    revoke all on public.internal_runtime_secrets from public, anon, authenticated;
    create table public.academy_contacts (id uuid primary key default gen_random_uuid(), user_id uuid, telegram_id text);`);
  // Use the owning shared Telegram DDL/RPC bodies, rather than mocks that would
  // hide incompatible parameter names or confirmation behavior.
  const telegramBase = await Deno.readTextFile(new URL('supabase/migrations/20260608195000_telegram_bot.sql', ROOT));
  const telegramGrowth = await Deno.readTextFile(new URL('supabase/migrations/20260812130000_telegram_growth_system.sql', ROOT));
  const extract = (source: string, pattern: RegExp) => {
    const found = source.match(pattern)?.[0];
    if (!found) throw new Error(`Shared Telegram fixture source no longer matches ${pattern}`);
    return found;
  };
  await sql(extract(telegramGrowth, /create table if not exists public\.telegram_acquisition_sessions \([\s\S]*?\n\);/));
  await sql(extract(telegramBase, /create table if not exists public\.telegram_link_tokens \([\s\S]*?\n\);/));
  await sql(extract(telegramGrowth, /alter table public\.telegram_link_tokens[\s\S]*?;/));
  for (const name of ['issue_telegram_link_token', 'confirm_telegram_link_token']) {
    await sql(extract(telegramGrowth, new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`)));
  }
  await sql(`revoke all on function public.issue_telegram_link_token(uuid,text,uuid), public.confirm_telegram_link_token(text,uuid) from public,anon,authenticated;
    grant execute on function public.issue_telegram_link_token(uuid,text,uuid), public.confirm_telegram_link_token(text,uuid) to service_role;`);
  await sql(ENGLISH_DDL);
  const migrations = [...Deno.readDirSync(new URL('supabase/migrations/', ROOT))].map((entry) => entry.name).filter((name) => /^\d+_company_.*\.sql$/.test(name)).sort();
  if (!migrations.length) throw new Error('No Company English migrations found');
  for (const file of migrations) await sql(await Deno.readTextFile(new URL(`supabase/migrations/${file}`, ROOT)));
  await sql(SEED);
  console.log(`Database: fixture + English tables + ${migrations.length} migrations applied.`);

  await docker([
    'run', '--detach', '--name', REST, '--network', NETWORK, '--publish', '127.0.0.1::3000',
    '--env', `PGRST_DB_URI=postgres://authenticator:${AUTHENTICATOR_PASSWORD}@db:5432/postgres`,
    '--env', 'PGRST_DB_SCHEMAS=public', '--env', 'PGRST_DB_ANON_ROLE=anon', '--env', `PGRST_JWT_SECRET=${JWT_SECRET}`,
    // Supabase's default page cap, so fetchAll's paging is real.
    '--env', 'PGRST_DB_MAX_ROWS=1000',
    POSTGREST_IMAGE,
  ]);
  const mapping = (await docker(['port', REST, '3000/tcp'])).trim().split('\n')[0];
  const port = Number(mapping.split(':').pop());
  if (!mapping.startsWith('127.0.0.1:') || !port) throw new Error(`PostgREST is not bound to loopback: ${mapping}`);
  const service = await signJwt('service_role');
  for (let i = 0; i < 60; i++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/company_orgs?limit=0`, { headers: { Authorization: `Bearer ${service}` } });
      await response.body?.cancel();
      if (response.status === 200) return port;
    } catch { /* not up yet */ }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`PostgREST did not become ready:\n${(await run('docker', ['logs', '--tail', '30', REST])).err}`);
}

// ---------------------------------------------------------------------------
// Recording
// ---------------------------------------------------------------------------
interface Failure { kind: 'status' | 'logged' | 'swallowed' | 'assert' | 'blocked'; area: string; label: string; detail: string; }
const failures: Failure[] = [];
const logs: string[] = [];
const dbFailures: string[] = [];
const coverage = new Map<string, { statuses: Set<number>; ok: boolean }>();
let currentArea = 'setup', requests = 0, assertions = 0, dbRequests = 0, transportRetries = 0, longestUrl = 0;
const key = (route: Pick<Route, 'method' | 'path'>) => `${route.method} ${route.path}`;
for (const route of allRoutes) coverage.set(key(route), { statuses: new Set(), ok: false });

const realError = console.error;
console.error = (...args: unknown[]) => { logs.push(args.map(String).join(' ')); };

const short = (value: unknown, max = 900) => {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text && text.length > max ? `${text.slice(0, max)}...` : text;
};
function fail(kind: Failure['kind'], label: string, detail: string) {
  failures.push({ kind, area: currentArea, label, detail });
  console.log(`  FAIL [${kind}] ${label}\n       ${detail.replaceAll('\n', '\n       ')}`);
}
function ok(label: string, condition: unknown, detail: unknown = '') {
  assertions++;
  if (!condition) fail('assert', label, short(detail) ?? '');
  return Boolean(condition);
}
function eq(label: string, actual: unknown, expected: unknown) {
  assertions++;
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) fail('assert', label, `expected ${e}, got ${a}`);
  return a === e;
}
async function eqSql(label: string, query: string, expected: string) {
  assertions++;
  const actual = await sql(query);
  if (actual !== expected) fail('assert', label, `SQL ${query}\nexpected ${expected}\ngot      ${actual}`);
}
class Blocked extends Error {}
function need<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Blocked(what);
  return value;
}

function routeOf(method: string, path: string): Route | null {
  const have = path.split('?')[0].split('/');
  return allRoutes.find((route) => {
    if (route.method !== method) return false;
    const want = route.path.split('/');
    return want.length === have.length && want.every((part, index) => part.startsWith(':') ? have[index] !== '' : part === have[index]);
  }) ?? null;
}

// ---------------------------------------------------------------------------
// AI stub
// ---------------------------------------------------------------------------
let aiMode: 'ok' | 'failed' = 'ok';
const aiCalls: Record<string, number> = {};
const aiStub = ((request: { feature: string; userPayload: string }, fallback: unknown) => {
  aiCalls[request.feature] = (aiCalls[request.feature] ?? 0) + 1;
  if (aiMode !== 'ok') return Promise.resolve({ data: fallback, status: 'failed', error: 'stub switched off' });
  const reply = (data: unknown) => Promise.resolve({ data, status: 'ok' });
  switch (request.feature) {
    case 'company-writing-grade':
      return reply({ criteria: { task: 70, organisation: 68, grammar: 66, vocabulary: 72 }, strengths: ['Clear opening'], improvements: ['Vary sentences'], summary: 'A solid message.' });
    case 'company-speaking-grade':
      return reply({ criteria: { task: 60, organisation: 62, grammar: 58, vocabulary: 64, fluency: 60, pronunciation: 61 }, strengths: ['Polite'], improvements: ['Longer answers'], summary: 'Understandable.' });
    case 'company-roleplay':
      if (request.userPayload.includes('hint_for')) return reply({ say: 'May I confirm the booking details?', why: 'Ask one clear question.' });
      return request.userPayload.includes('learner_says')
        ? reply({ reply: 'I see. Could you tell me more about the room?', done: false, tip: 'Say "May I help you?"' })
        : reply({ score: 72, summary: 'Good effort.', goal_met: true, good_phrases: ['How may I help you?'], better_phrases: [{ said: 'I no know', better: "I don't know", why: 'Grammar' }], checklist: [{ item: 'Greeted', done: true }], next_step: 'Practise more.' });
    case 'company-writing-check':
      return reply({ corrected: 'Dear team, please find the report attached.', score: 75, summary: 'Small fixes.', tone: 'Polite', tone_notes: ['Good'], changes: [{ original: 'pls', corrected: 'please', why: 'Formal' }], checklist: [{ item: 'Greeting', done: true }] });
    case 'company-report-summary':
      return reply({ headline: 'Steady month', paragraphs: ['People learned.', 'Tests ran.'], actions: ['Book a session.', 'Review targets.'] });
    case 'company-executive-narrative':
      return reply({ headline: 'Review the measured gaps', paragraphs: ['Use the recorded results to plan the next steps.'], actions: ['Review the training assignments.'] });
    case 'company-phrase-finder':
      return reply({ options: [{ english: 'Could you confirm the booking, please?', note: 'Вежливая просьба.', back: 'Пожалуйста, подтвердите бронирование.' }] });
    case 'company-interview-kit':
      return reply({ questions: ['How would you greet a guest?', 'How would you explain a delay?', 'How would you confirm the next step?'].map((question) => ({ skill: 'speaking', question, listen_for: 'A clear and polite response.', follow_up: 'Could you give an example?' })) });
    case 'company-lesson-draft': {
      const payload = JSON.parse(request.userPayload);
      if (Array.isArray(payload.items)) return reply({ items: payload.items.map((item: { key: string }) => ({ key: item.key, ru: 'Подтвердите время встречи.', uz: 'Uchrashuv vaqtini tasdiqlang.' })) });
      if (payload.step) return reply(TRACKS[0].lessons[0]);
      const scenario = TRACKS[0].scenarios[0];
      return reply({ ...scenario, learner_role: scenario.learnerRole });
    }
    default:
      throw new Error(`The AI stub has no reply for feature ${request.feature}`);
  }
}) as unknown as AiCall;

// ---------------------------------------------------------------------------
// Driving the handler
// ---------------------------------------------------------------------------
let handler: (req: Request) => Promise<Response>;
let db: any;
let env: CompanyEnv;

type Expect = number | number[] | ((status: number) => boolean);
interface CallOptions { as?: string; body?: unknown; expect?: Expect; ip?: string; headers?: Record<string, string>; allowLog?: RegExp; allowDb?: RegExp; label?: string }
const matches = (expect: Expect, status: number) => typeof expect === 'function' ? expect(status) : Array.isArray(expect) ? expect.includes(status) : expect === status;

async function call(method: string, path: string, options: CallOptions = {}): Promise<{ status: number; body: any }> {
  const expect = options.expect ?? 200;
  const logStart = logs.length, dbStart = dbFailures.length;
  requests++;
  const response = await handler(new Request(`https://x.supabase.co/functions/v1/company/${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-forwarded-for': options.ip ?? '198.51.100.1',
      'user-agent': 'company-postgrest-harness',
      ...(options.as ? { Authorization: `Bearer ${options.as}` } : {}),
      ...options.headers,
    },
    ...(options.body === undefined || method === 'GET' || method === 'DELETE' ? {} : { body: JSON.stringify(options.body) }),
  }));
  const raw = await response.text();
  let body: any = raw;
  try { body = JSON.parse(raw); } catch { /* keep text */ }
  const route = routeOf(method, path);
  if (route) {
    const entry = coverage.get(key(route))!;
    entry.statuses.add(response.status);
    if (response.status >= 200 && response.status < 300) entry.ok = true;
  }
  const label = `${options.label ? `${options.label}: ` : ''}${method} ${path}`;
  const newLogs = logs.slice(logStart).filter((line) => !options.allowLog?.test(line));
  const newDb = dbFailures.slice(dbStart).filter((line) => !options.allowDb?.test(line));
  if (VERBOSE) console.log(`  ${response.status} ${label}`);
  if (!matches(expect, response.status)) {
    fail('status', label, [
      `status ${response.status}, expected ${typeof expect === 'function' ? 'see test' : JSON.stringify(expect)}`,
      `as ${options.as ?? 'anonymous'}${options.body === undefined ? '' : `, input ${short(options.body, 300)}`}`,
      `body ${short(body)}`,
      ...newLogs.map((line) => `log  ${short(line, 1500)}`),
      ...newDb.map((line) => `db   ${short(line, 800)}`),
    ].join('\n'));
  } else {
    if (newLogs.length) fail('logged', label, newLogs.map((line) => short(line, 1500)).join('\n'));
    if (newDb.length) fail('swallowed', label, newDb.map((line) => short(line, 800)).join('\n'));
  }
  return { status: response.status, body };
}

const refused = (status: number) => status >= 400 && status < 500;
async function area(name: string, work: () => Promise<void>) {
  currentArea = name;
  console.log(`\n== ${name}`);
  try {
    await work();
  } catch (cause) {
    if (cause instanceof Blocked) fail('blocked', name, `stopped here, needed: ${cause.message}`);
    else fail('blocked', name, `harness error: ${cause instanceof Error ? cause.stack ?? cause.message : cause}`);
  }
}

const tokenOf = (link: unknown) => String(link ?? '').split('/').pop() ?? '';
const WRITING = 'Dear guest, thank you for your message about the booking. We have checked the reservation and your room is ready. Please contact reception if you need anything else during your stay with us.';
function answersFor(section: any): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!section) return out;
  for (const item of section.items ?? []) out[item.id] = 0;
  for (const passage of section.passages ?? []) for (const question of passage.questions ?? []) out[question.id] = 0;
  for (const task of section.tasks ?? []) out[task.id] = section.skill === 'writing' ? WRITING : { transcript: WRITING, mode: 'speech' };
  return out;
}
/** Answers each section and moves on until the test is no longer running. */
async function walk(first: any, step: (answers: Record<string, unknown>) => Promise<{ status: number; body: any }>) {
  let attempt = first;
  for (let i = 0; i < 30 && attempt?.status === 'started'; i++) {
    attempt = (await step(answersFor(attempt.section))).body?.attempt ?? null;
  }
  return attempt;
}
function lessonAnswers(lesson: any) {
  const out: Record<string, unknown> = {};
  for (const exercise of lesson.exercises) {
    if (exercise.kind === 'choice') out[exercise.id] = exercise.items.map((item: any) => item.answer);
    else if (exercise.kind === 'gap') out[exercise.id] = exercise.items.map((item: any) => item.answers[0]);
    else if (exercise.kind === 'order') out[exercise.id] = exercise.lines;
    else out[exercise.id] = exercise.pairs.map((pair: any) => pair[1]);
  }
  return out;
}

// Ids the sweeps at the end reuse.
const S: Record<string, any> = {};

// ---------------------------------------------------------------------------
// Scenario
// ---------------------------------------------------------------------------
async function scenario(port: number, serviceJwt: string) {
  await area('grants and RLS at the PostgREST layer', async () => {
    const base = `http://127.0.0.1:${port}`;
    const asRole = async (path: string, token?: string, init: RequestInit = {}) => {
      const response = await fetch(`${base}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
      await response.body?.cancel();
      return response.status;
    };
    const authenticated = await signJwt('authenticated');
    ok('anon cannot read company_orgs', [401, 403].includes(await asRole('/company_orgs')));
    ok('authenticated cannot read company_members', [401, 403].includes(await asRole('/company_members', authenticated)));
    eq('service_role reads company_orgs', await asRole('/company_orgs', serviceJwt), 200);
    ok('anon cannot call company_reserve_test', [401, 403, 404].includes(await asRole('/rpc/company_reserve_test', undefined, { method: 'POST', body: JSON.stringify({ p_org: uid(1) }) })));
    ok('authenticated cannot call company_sync_english_access', [401, 403, 404].includes(await asRole('/rpc/company_sync_english_access', authenticated, { method: 'POST', body: JSON.stringify({ p_user: uid(1) }) })));
    await eqSql('every company_ table has RLS on', `select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname like 'company\\_%' and not c.relrowsecurity`, '0');
    await eqSql('no company_ table has a policy', `select count(*) from pg_policies where tablename like 'company\\_%'`, '0');
    await eqSql('anon/authenticated have no privilege on company_ tables', `select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace, unnest(array['anon','authenticated']) r where n.nspname='public' and c.relkind='r' and c.relname like 'company\\_%' and (has_table_privilege(r, c.oid, 'select') or has_table_privilege(r, c.oid, 'insert') or has_table_privilege(r, c.oid, 'update') or has_table_privilege(r, c.oid, 'delete'))`, '0');
    await eqSql('anon/authenticated cannot execute company_ functions', `select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace, unnest(array['anon','authenticated']) r where n.nspname='public' and p.proname like 'company\\_%' and has_function_privilege(r, p.oid, 'execute')`, '0');
    await eqSql('service_role may use every company_ table', `select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname like 'company\\_%' and not (has_table_privilege('service_role', c.oid, 'select') and has_table_privilege('service_role', c.oid, 'insert') and has_table_privilege('service_role', c.oid, 'update') and has_table_privilege('service_role', c.oid, 'delete'))`, '0');
  });

  await area('public site: demo leads', async () => {
    const form = await call('GET', 'public/leads/form');
    eq('pilot tests', form.body?.pilot_tests, 10);
    const lead = { name: 'Aziz Karimov', company: 'Silk Road Hotels', job_title: 'HR Director', phone: '+998 90 123-45-67', email: 'Aziz@Silk.example', industry: 'hospitality', size_band: '51-200', interests: ['hiring', 'training'], need: 'Test receptionists.', locale: 'ru', source: 'landing', elapsed_ms: 9000 };
    await call('POST', 'public/leads', { body: lead, ip: '203.0.113.5' });
    await eqSql('lead stored', `select name||'|'||email||'|'||status||'|'||array_to_string(interests,',')||'|'||source from company_leads where company='Silk Road Hotels'`, 'Aziz Karimov|aziz@silk.example|new|hiring,training|landing');
    await call('POST', 'public/leads', { label: 'honeypot stores nothing', body: { ...lead, company: 'Bot Inc', website: 'http://x' }, ip: '203.0.113.5' });
    await call('POST', 'public/leads', { label: 'too fast stores nothing', body: { ...lead, company: 'Fast Inc', elapsed_ms: 100 }, ip: '203.0.113.5' });
    await eqSql('bots stored nothing', `select count(*) from company_leads where company in ('Bot Inc','Fast Inc')`, '0');
    await call('POST', 'public/leads', { label: 'no contact', body: { name: 'No Contact', company: 'Nobody' }, expect: 400, ip: '203.0.113.6' });
    await call('POST', 'public/leads', { label: 'bad interest', body: { ...lead, interests: ['nonsense'] }, expect: 400, ip: '203.0.113.6' });
    for (let i = 0; i < 4; i++) await call('POST', 'public/leads', { label: 'daily allowance', body: { ...lead, company: `Rate ${i}` }, ip: '203.0.113.7' });
    await call('POST', 'public/leads', { body: { ...lead, company: 'Rate 4' }, ip: '203.0.113.7' });
    await call('POST', 'public/leads', { label: 'over the daily allowance', body: { ...lead, company: 'Rate 5' }, ip: '203.0.113.7', expect: 429 });
    S.lead = (await sql(`select id from company_leads where company='Silk Road Hotels'`));
  });

  await area('core: sign-in, pilot workspace', async () => {
    await call('GET', 'me', { label: 'no session', expect: 401 });
    await call('GET', 'me', { label: 'bad token', as: 'not-a-user', expect: 401 });
    const before = await call('GET', 'me', { as: OWNER });
    eq('no workspaces yet', before.body?.workspaces, []);
    const created = await call('POST', 'orgs', { as: OWNER, body: { name: 'Silk Road Hotels', industry: 'hospitality', size_band: '51-200', city: 'Samarkand', contact_phone: '+998901234567', full_name: 'Dilnoza Karimova', locale: 'ru' } });
    S.org = need(created.body?.org?.id, 'pilot org');
    S.ownerMember = need(created.body?.member?.id, 'owner member');
    eq('pilot status', created.body.org.status, 'pilot');
    eq('pilot tests', created.body.org.tests_limit, 10);
    await eqSql('owner row', `select role||'|'||status||'|'||(joined_at is not null) from company_members where id='${S.ownerMember}'`, 'owner|active|true');
    const other = await call('POST', 'orgs', { as: OTHER_OWNER, body: { name: 'Other Bank', industry: 'banking' } });
    S.otherOrg = need(other.body?.org?.id, 'other org');
    const me = await call('GET', 'me', { as: OWNER });
    eq('embed company_orgs on me', me.body?.workspaces?.[0]?.org?.name, 'Silk Road Hotels');
    const detail = await call('GET', `orgs/${S.org}`, { as: OWNER });
    eq('usage', detail.body?.usage?.tests_limit, 10);
    await call('POST', 'orgs', { label: 'bad size band', as: OWNER, body: { name: 'Nope Ltd', size_band: 'huge' }, expect: 400 });
    await call('GET', 'orgs/00000000-0000-4000-8000-00000000ffff', { label: 'unknown org', as: OWNER, expect: 404 });
    await call('GET', `orgs/${S.org}`, { label: 'staff without membership', as: STAFF });
    await call('GET', `orgs/${S.org}`, { label: 'other org owner', as: OTHER_OWNER, expect: 403 });
  });
  const o = () => `orgs/${need(S.org, 'org')}`;

  await area('people: departments', async () => {
    const one = await call('POST', `${o()}/departments`, { as: OWNER, body: { name: 'Front Office' } });
    S.deptFront = need(one.body?.department?.id, 'department');
    const many = await call('POST', `${o()}/departments`, { as: OWNER, body: { names: ['Sales', 'Housekeeping', 'front office', 'Temp'] } });
    eq('duplicates skipped', many.body?.skipped, 1);
    S.deptSales = many.body?.departments?.find((row: any) => row.name === 'Sales')?.id;
    const temp = many.body?.departments?.find((row: any) => row.name === 'Temp')?.id;
    await call('POST', `${o()}/departments`, { label: 'duplicate', as: OWNER, body: { name: 'SALES' }, expect: 409 });
    await call('PATCH', `${o()}/departments/${need(temp, 'temp department')}`, { as: OWNER, body: { name: 'Temporary' } });
    await call('PATCH', `${o()}/departments/${temp}`, { label: 'rename onto another', as: OWNER, body: { name: 'sales' }, expect: 409 });
    const list = await call('GET', `${o()}/departments`, { as: OWNER });
    eq('department count', list.body?.departments?.length, 4);
    await call('DELETE', `${o()}/departments/${temp}`, { as: OWNER });
    await call('POST', `${o()}/departments`, { label: 'names differing only by inner spaces', as: OWNER, body: { names: ['Night  Shift', 'night shift'] } });
    await call('POST', `${o()}/departments`, { label: 'name matching an existing one once spaces collapse', as: OWNER, body: { name: 'Front  Office' }, expect: 409 });
    await call('PATCH', `${o()}/departments/${S.deptSales}`, { label: 'rename matching another once spaces collapse', as: OWNER, body: { name: 'Front  Office' }, expect: 409 });
  });

  await area('people: personal invites and joining', async () => {
    const invite = (body: unknown) => call('POST', `${o()}/invites`, { as: OWNER, body });
    const admin = await invite({ kind: 'personal', full_name: 'Rustam Aliev', email: emailOf(ADMIN), role: 'admin', job_role: 'office_admin', target_level: 'b2', target_date: '2027-06-30' });
    const token = tokenOf(need(admin.body?.link, 'admin link'));
    const peek = await call('GET', `join/${token}`);
    eq('join state', peek.body?.state, 'open');
    eq('email is masked', String(peek.body?.email_hint ?? '').includes('*'), true);
    await call('POST', `join/${token}`, { label: 'no consent', as: ADMIN, body: {}, expect: 400 });
    await call('POST', `join/${token}`, { label: 'no session', body: { consent: true }, expect: 401 });
    const joined = await call('POST', `join/${token}`, { as: ADMIN, body: { consent: true } });
    eq('joined', joined.body?.state, 'joined');
    eq('joined as', joined.body?.role, 'admin');
    await eqSql('admin active with consent and target', `select status||'|'||(consent_at is not null)||'|'||(user_id='${ADMIN}')||'|'||target_level||'|'||target_date from company_members where email='${emailOf(ADMIN)}'`, 'active|true|true|b2|2027-06-30');
    const again = await call('POST', `join/${token}`, { label: 'join twice', as: ADMIN, body: { consent: true } });
    eq('already', again.body?.already, true);
    eq('signed in sees joined', (await call('GET', `join/${token}`, { as: ADMIN })).body?.state, 'joined');
    await call('GET', 'join/short', { label: 'malformed token', expect: 404 });
    await call('GET', 'join/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', { label: 'unknown token', expect: 404 });

    const manager = await invite({ full_name: 'Elena Kim', email: emailOf(MANAGER), role: 'manager', department_id: S.deptFront, job_role: 'hospitality' });
    await call('POST', `join/${tokenOf(manager.body?.link)}`, { as: MANAGER, body: { consent: true } });
    const emp1 = await invite({ full_name: 'Anna Lee', email: emailOf(EMP1), department_id: S.deptFront, job_role: 'hospitality', target_level: 'b2' });
    S.emp1Member = need(emp1.body?.member?.id, 'emp1 member');
    await call('POST', `invites`, { label: 'no such endpoint', as: OWNER, body: {}, expect: 404 });
    await call('POST', `${o()}/invites`, { label: 'email already invited', as: OWNER, body: { full_name: 'Anna Again', email: emailOf(EMP1) }, expect: 409 });

    // Renewing a personal link stops the old one.
    const renewed = await call('POST', `${o()}/invites/${need(emp1.body?.invite?.id, 'invite id')}/renew`, { as: OWNER, body: {} });
    await call('POST', `join/${tokenOf(emp1.body?.link)}`, { label: 'renewed link is dead', as: EMP1, body: { consent: true }, expect: 410 });
    await call('POST', `join/${tokenOf(need(renewed.body?.link, 'renewed link'))}`, { as: EMP1, body: { consent: true } });
    await eqSql('emp1 keeps HR settings', `select status||'|'||job_role||'|'||target_level||'|'||(department_id='${S.deptFront}') from company_members where id='${S.emp1Member}'`, 'active|hospitality|b2|true');

    // No email on the invite: the account's email fills it in.
    const emailless = await invite({ full_name: 'Murod Saidov', department_id: S.deptSales, job_role: 'sales' });
    await call('POST', `join/${tokenOf(emailless.body?.link)}`, { as: EMP4, body: { consent: true } });
    await eqSql('account email used', `select email from company_members where user_id='${EMP4}' and org_id='${S.org}'`, emailOf(EMP4));
  });

  await area('people: team links', async () => {
    const link = await call('POST', `${o()}/invites`, { as: OWNER, body: { kind: 'link', role: 'employee', department_id: S.deptFront, job_role: 'hospitality', max_uses: 2, expires_days: 7 } });
    const token = tokenOf(need(link.body?.link, 'team link'));
    S.teamLinkId = link.body?.invite?.id;
    eq('team link state', (await call('GET', `join/${token}`)).body?.state, 'open');
    await call('POST', `join/${token}`, { as: EMP2, body: { consent: true, full_name: 'Boris Popov' } });
    await call('POST', `join/${token}`, { as: EMP3, body: { consent: true, full_name: 'Chen Wu' } });
    await eqSql('uses counted', `select uses from company_invites where id='${S.teamLinkId}'`, '2');
    await call('POST', `join/${token}`, { label: 'link used up', as: EMP5, body: { consent: true }, expect: 410 });
    const renewed = await call('POST', `${o()}/invites/${S.teamLinkId}/renew`, { as: OWNER, body: { expires_days: 3 } });
    await call('GET', `join/${token}`, { label: 'old token gone', expect: 404 });
    eq('renew keeps the use count', (await call('GET', `join/${tokenOf(renewed.body?.link)}`)).body?.state, 'used_up');

    const open = await call('POST', `${o()}/invites`, { as: OWNER, body: { kind: 'link', job_role: 'general' } });
    S.openLink = tokenOf(need(open.body?.link, 'open link'));
    S.openLinkId = open.body?.invite?.id;
    await call('POST', `${o()}/invites/${S.openLinkId}/renew`, { as: OWNER, body: {} }).then((r) => { S.openLink = tokenOf(r.body?.link); });
    await call('GET', `${o()}/invites`, { as: OWNER });

    const revoked = await call('POST', `${o()}/invites`, { as: OWNER, body: { kind: 'link' } });
    await call('POST', `${o()}/invites/${revoked.body?.invite?.id}/revoke`, { as: OWNER });
    await call('POST', `${o()}/invites/${revoked.body?.invite?.id}/revoke`, { label: 'revoke twice', as: OWNER });
    await call('POST', `join/${tokenOf(revoked.body?.link)}`, { label: 'revoked', as: EMP5, body: { consent: true }, expect: 410 });
    await call('POST', `${o()}/invites/${revoked.body?.invite?.id}/renew`, { label: 'renew revoked', as: OWNER, body: {}, expect: 409 });

    const expiring = await call('POST', `${o()}/invites`, { as: OWNER, body: { kind: 'link' } });
    await sql(`update company_invites set expires_at = now() - interval '1 minute' where id='${expiring.body?.invite?.id}'`);
    await call('POST', `join/${tokenOf(expiring.body?.link)}`, { label: 'expired', as: EMP5, body: { consent: true }, expect: 410 });
  });

  await area('people: CSV import', async () => {
    const csv = `name;email;department;job role;role\nAnvar Rakhimov;${emailOf(EMP5)};Front Office;hospitality;employee\nNigora Tosheva;${emailOf(EMP6)};Kitchen;general;employee\nDup Person;${emailOf(EMP5)};;;\nBad Mail;not-an-email;;;\nBad Job;bad.job@example.uz;;astronaut;\nJasur Admin;jasur@example.uz;;;hr`;
    const dry = await call('POST', `${o()}/people/import`, { as: OWNER, body: { csv } });
    eq('dry run counts', [dry.body?.total, dry.body?.valid, dry.body?.invalid], [6, 3, 3]);
    eq('dry run names new departments', dry.body?.new_departments, ['Kitchen']);
    await eqSql('dry run wrote nothing', `select count(*) from company_members where email='${emailOf(EMP5)}'`, '0');
    const done = await call('POST', `${o()}/people/import`, { as: OWNER, body: { csv, dry_run: false } });
    eq('created', done.body?.created?.length, 3);
    S.imported = done.body?.created ?? [];
    await eqSql('department created', `select count(*) from company_departments where org_id='${S.org}' and name='Kitchen'`, '1');
    const anvar = S.imported.find((row: any) => row.email === emailOf(EMP5));
    await call('POST', `join/${tokenOf(need(anvar?.link, 'imported link'))}`, { as: EMP5, body: { consent: true } });
    const nigora = S.imported.find((row: any) => row.email === emailOf(EMP6));
    await call('POST', `join/${tokenOf(need(nigora?.link, 'imported link'))}`, { as: EMP6, body: { consent: true } });
    S.emp6Member = nigora.member_id;
    await call('POST', `${o()}/people/import`, { label: 'nothing valid', as: OWNER, body: { csv: 'name,email\nX,bad', dry_run: false }, expect: 400 });
    await call('POST', `${o()}/people/import`, { label: 'department differing from an existing one by inner spaces', as: OWNER, body: { csv: 'name,email,department\nSpace Case,space.case@example.uz,Front  Office', dry_run: false } });
  });

  await area('people: list, edit, remove, leave, come back', async () => {
    const list = await call('GET', `${o()}/people`, { as: OWNER });
    ok('owner sees everyone', (list.body?.members?.length ?? 0) >= 8, list.body?.members?.length);
    eq('scope', list.body?.scope, 'all');
    const scoped = await call('GET', `${o()}/people`, { as: MANAGER });
    eq('manager scope', scoped.body?.scope, 'department');
    ok('manager sees only their department', (scoped.body?.members ?? []).every((row: any) => row.department_id === S.deptFront), scoped.body?.members);
    await call('GET', `${o()}/people`, { label: 'employee', as: EMP1, expect: 403 });

    const edit = await call('PATCH', `${o()}/people/${S.emp1Member}`, { as: OWNER, body: { job_role: 'hospitality', target_level: 'c1', target_date: '2027-12-31', full_name: 'Anna Lee-Kim', department_id: S.deptFront } });
    eq('edited', edit.body?.member?.target_level, 'c1');
    await call('PATCH', `${o()}/people/${S.emp1Member}`, { label: 'email of a joined person', as: OWNER, body: { email: 'x@example.uz' }, expect: 409 });
    await call('PATCH', `${o()}/people/${S.emp1Member}`, { label: 'bad level', as: OWNER, body: { target_level: 'd9' }, expect: 400 });
    await call('PATCH', `${o()}/people/${S.emp1Member}`, { label: 'department of another workspace', as: OWNER, body: { department_id: '00000000-0000-4000-8000-00000000ffff' }, expect: 400 });
    const jasur = S.imported.find((row: any) => row.email === 'jasur@example.uz');
    const invited = await call('PATCH', `${o()}/people/${need(jasur?.member_id, 'invited person')}`, { as: ADMIN, body: { email: 'jasur.new@example.uz', role: 'manager' } });
    eq('invited email changed', invited.body?.member?.email, 'jasur.new@example.uz');
    eq('the link already sent stopped', invited.body?.link_revoked, true);
    await eqSql('no open link left', `select count(*) from company_invites where member_id='${jasur.member_id}' and revoked_at is null`, '0');
    const stale = await call('POST', `join/${tokenOf(jasur.link)}`, { label: 'the link sent to the old address', as: EMP12, body: { consent: true }, expect: 410 });
    eq('old link refused', stale.body?.code, 'invite_revoked');
    await eqSql('still invited', `select status from company_members where id='${jasur.member_id}'`, 'invited');
    const withdrawn = await call('GET', `join/${tokenOf(jasur.link)}`, { label: 'a withdrawn link shows only that' });
    eq('nothing about the invitee', withdrawn.body, { state: 'revoked', org: { name: 'Silk Road Hotels' }, signed_in: false });
    await call('PATCH', `${o()}/people/${jasur.member_id}`, { label: 'email taken', as: ADMIN, body: { email: emailOf(EMP5) }, expect: 409 });
    const unchanged = await call('PATCH', `${o()}/people/${jasur.member_id}`, { label: 'the same email again', as: ADMIN, body: { email: 'jasur.new@example.uz' } });
    eq('nothing to stop', unchanged.body?.link_revoked ?? null, null);
    const offered = (await call('GET', `${o()}/people`, { as: ADMIN })).body?.members?.find((row: any) => row.id === jasur.member_id)?.invite;
    eq('the list offers a new link', offered?.state, 'revoked');
    const renewedJasur = await call('POST', `${o()}/invites/${need(offered?.id, 'withdrawn invite')}/renew`, { as: ADMIN });
    await eqSql('invite placeholder role follows', `select role from company_invites where member_id='${jasur.member_id}' and revoked_at is null`, 'manager');
    const lowered = await call('PATCH', `${o()}/people/${jasur.member_id}`, { label: 'a lower role keeps the link', as: ADMIN, body: { role: 'employee' } });
    eq('nothing to stop on a lower role', lowered.body?.link_revoked ?? null, null);
    await eqSql('placeholder follows down', `select role from company_invites where member_id='${jasur.member_id}' and revoked_at is null`, 'employee');
    eq('that link still opens', (await call('GET', `join/${tokenOf(need(renewedJasur.body?.link, 'renewed link'))}`)).body?.state, 'open');

    const toRaise = await call('POST', `${o()}/invites`, { as: ADMIN, body: { full_name: 'Held Link', email: 'held.link@example.uz', role: 'employee' } });
    const raised = await call('PATCH', `${o()}/people/${need(toRaise.body?.member?.id, 'pending person')}`, { as: OWNER, body: { role: 'owner' } });
    eq('raised to owner stops the link', [raised.body?.member?.role, raised.body?.link_revoked], ['owner', true]);
    const held = await call('POST', `join/${tokenOf(toRaise.body?.link)}`, { label: 'the link an admin kept', as: EMP12, body: { consent: true }, expect: 410 });
    eq('no way in', held.body?.code, 'invite_revoked');
    await eqSql('nobody became owner', `select status||'|'||(user_id is null) from company_members where id='${toRaise.body.member.id}'`, 'invited|true');
    await call('POST', `${o()}/invites/${toRaise.body.invite.id}/renew`, { label: 'an admin cannot renew an owner link', as: ADMIN, expect: 403 });
    const ownerRenewed = await call('POST', `${o()}/invites/${toRaise.body.invite.id}/renew`, { as: OWNER });
    eq('the owner gets a new link', ownerRenewed.body?.invite?.state, 'open');
    await call('DELETE', `${o()}/people/${toRaise.body.member.id}`, { label: 'tidy up', as: OWNER });

    // Someone joins through a held link after the owner's page loaded: the stale form must not make them owner.
    const staleForm = await call('POST', `${o()}/invites`, { as: ADMIN, body: { full_name: 'Stale Form', email: 'stale.form@example.uz', role: 'employee' } });
    await call('POST', `join/${tokenOf(staleForm.body?.link)}`, { label: 'the held link is used', as: LINK_HOLDER, body: { consent: true } });
    const staleSave = await call('PATCH', `${o()}/people/${staleForm.body.member.id}`, { label: 'the form still showed invited', as: OWNER, body: { if_status: 'invited', role: 'owner' }, expect: 409 });
    eq('the owner is told', staleSave.body?.code, 'person_changed');
    await eqSql('nobody became owner from a stale form', `select role||'|'||status from company_members where id='${staleForm.body.member.id}'`, 'employee|active');
    await call('DELETE', `${o()}/people/${staleForm.body.member.id}`, { label: 'tidy up', as: OWNER });

    // A team link never gives more than its own role, even when the account matches a raised pending row.
    const raisedByEmail = await call('POST', `${o()}/invites`, { as: ADMIN, body: { full_name: 'Raised By Email', email: emailOf(TEAM_LINK_USER), role: 'employee' } });
    await call('PATCH', `${o()}/people/${raisedByEmail.body.member.id}`, { as: OWNER, body: { role: 'owner' } });
    const teamLink = await call('POST', `${o()}/invites`, { as: ADMIN, body: { kind: 'link', role: 'employee', max_uses: 5 } });
    const teamJoin = await call('POST', `join/${tokenOf(need(teamLink.body?.link, 'team link'))}`, { label: 'a team link onto a raised row', as: TEAM_LINK_USER, body: { consent: true }, expect: 409 });
    eq('a personal link is needed', teamJoin.body?.code, 'personal_link_needed');
    await eqSql('the raised row stays pending', `select role||'|'||status||'|'||(user_id is null) from company_members where id='${raisedByEmail.body.member.id}'`, 'owner|invited|true');
    await eqSql('the team link kept its use', `select uses from company_invites where id='${teamLink.body.invite.id}'`, '0');
    await call('DELETE', `${o()}/people/${raisedByEmail.body.member.id}`, { label: 'tidy up', as: OWNER });

    await call('PATCH', `${o()}/people/${S.ownerMember}`, { label: 'admin cannot demote owner', as: ADMIN, body: { role: 'admin' }, expect: 403 });
    await call('PATCH', `${o()}/people/${S.ownerMember}`, { label: 'last owner cannot be demoted', as: OWNER, body: { role: 'admin' }, expect: 409 });
    await call('DELETE', `${o()}/people/${S.ownerMember}`, { label: 'last owner cannot be removed', as: OWNER, expect: 409 });
    await call('POST', `${o()}/people/me/leave`, { label: 'last owner cannot leave', as: OWNER, expect: 409 });
    const guard = await db.from('company_members').update({ role: 'admin' }).eq('id', S.ownerMember);
    dbFailures.pop();
    ok('the owner guard trigger reaches the client with its marker', String(guard.error?.message ?? '').includes('company_last_owner'), guard.error);

    // Removed, then a personal invitation again: joins back onto the old row.
    await call('DELETE', `${o()}/people/${S.emp6Member}`, { as: ADMIN });
    await call('DELETE', `${o()}/people/${S.emp6Member}`, { label: 'remove twice', as: ADMIN });
    await call('GET', `${o()}/orgs`, { label: 'no such route', as: EMP6, expect: 404 });
    await call('GET', `${o()}`, { label: 'removed person', as: EMP6, expect: 403 });
    const removedList = await call('GET', `${o()}/people?removed=1`, { as: ADMIN });
    ok('removed list has them', removedList.body?.members?.some((row: any) => row.id === S.emp6Member));
    const back = await call('POST', `${o()}/invites`, { as: ADMIN, body: { full_name: 'Nigora Tosheva', email: emailOf(EMP6), job_role: 'sales', department_id: S.deptSales } });
    eq('removed email is free again', back.status, 200);
    await call('POST', `join/${tokenOf(need(back.body?.link, 're-invite link'))}`, { as: EMP6, body: { consent: true } });
    await eqSql('back on the old row', `select m.status||'|'||m.job_role||'|'||(m.email='${emailOf(EMP6)}') from company_members m where m.id='${S.emp6Member}'`, 'active|sales|true');
    await eqSql('one active row per person', `select count(*) from company_members where org_id='${S.org}' and user_id='${EMP6}'`, '1');

    // A team link for someone HR already invited by email: joins as that person.
    const preInvited = await call('POST', `${o()}/invites`, { as: ADMIN, body: { full_name: 'Timur Invited', email: emailOf(EMP7), job_role: 'sales', department_id: S.deptSales } });
    await call('POST', `join/${need(S.openLink, 'open link')}`, { as: EMP7, body: { consent: true } });
    await eqSql('kept HR settings', `select status||'|'||job_role||'|'||(user_id='${EMP7}') from company_members where id='${preInvited.body?.member?.id}'`, 'active|sales|true');
    await call('POST', `join/${tokenOf(preInvited.body?.link)}`, { label: 'their personal link was revoked', as: EMP7, body: { consent: true } });

    // Leaving, then coming back on a team link.
    await call('POST', `${o()}/people/me/leave`, { as: EMP7 });
    await eqSql('left', `select status||'|'||seat from company_members where org_id='${S.org}' and user_id='${EMP7}'`, 'removed|false');
    const refusedBack = await call('POST', `join/${S.openLink}`, { label: 'a link from before they left does not bring them back', as: EMP7, body: { consent: true }, expect: 410 });
    eq('old link refused', refusedBack.body?.code, 'invite_revoked');
    const newer = await call('POST', `${o()}/invites`, { as: ADMIN, body: { kind: 'link', job_role: 'general' } });
    await call('POST', `join/${tokenOf(need(newer.body?.link, 'newer link'))}`, { label: 'back through a newer team link', as: EMP7, body: { consent: true, full_name: 'Timur' } });
    await eqSql('active again', `select status||'|'||(removed_at is null) from company_members where org_id='${S.org}' and user_id='${EMP7}'`, 'active|true');

    // A team link renewed after someone left brings them back; created_at stays for lists and audit.
    const renewable = await call('POST', `${o()}/invites`, { as: ADMIN, body: { kind: 'link', job_role: 'general' } });
    await call('POST', `${o()}/people/me/leave`, { as: EMP7 });
    await call('POST', `join/${tokenOf(need(renewable.body?.link, 'renewable link'))}`, { label: 'that link is from before they left', as: EMP7, body: { consent: true }, expect: 410 });
    const renewedTeam = await call('POST', `${o()}/invites/${renewable.body.invite.id}/renew`, { as: ADMIN });
    await eqSql('token_issued_at moved, created_at did not', `select token_issued_at > created_at from company_invites where id='${renewable.body.invite.id}'`, 't');
    eq('created_at kept in the answer', renewedTeam.body?.invite?.created_at, renewable.body?.invite?.created_at);
    await call('POST', `join/${tokenOf(need(renewedTeam.body?.link, 'renewed team link'))}`, { label: 'back through the renewed link', as: EMP7, body: { consent: true, full_name: 'Timur' } });
    await eqSql('active again through the renewed link', `select status from company_members where org_id='${S.org}' and user_id='${EMP7}'`, 'active');

    // Removed person, whose email HR invited again, comes back through a team link.
    await call('POST', `${o()}/people/me/leave`, { as: EMP7 });
    const reinvited = await call('POST', `${o()}/invites`, { as: ADMIN, body: { full_name: 'Timur Again', email: emailOf(EMP7), job_role: 'general' } });
    eq('re-invited', reinvited.status, 200);
    const newest = await call('POST', `${o()}/invites`, { as: ADMIN, body: { kind: 'link', job_role: 'general' } });
    await call('POST', `join/${tokenOf(need(newest.body?.link, 'newest link'))}`, { label: 'removed person with a fresh personal invite joins by team link', as: EMP7, body: { consent: true } });
    await eqSql('one person, on the old row, with HR details', `select string_agg(status, ',' order by status) from company_members where org_id='${S.org}' and lower(email)='${emailOf(EMP7)}' and status<>'removed'`, 'active');
    await eqSql('the prepared row is retired', `select status from company_members where id='${reinvited.body?.member?.id}'`, 'removed');
  });

  await area('settings', async () => {
    const got = await call('GET', `${o()}/settings`, { as: ADMIN });
    ok('admins listed', (got.body?.admins?.length ?? 0) >= 2, got.body?.admins);
    const patched = await call('PATCH', `${o()}/settings`, { as: ADMIN, body: { name: 'Silk Road Hotel Group', industry: 'hospitality', size_band: '201-1000', city: 'Tashkent', contact_phone: '+998712345678', billing_email: 'BILLS@silk.example', tax_id: '301234567', locale: 'en' } });
    eq('billing lower-cased', patched.body?.org?.billing_email, 'bills@silk.example');
    eq('locale merged', patched.body?.org?.settings?.locale, 'en');
    await call('PATCH', `${o()}/settings`, { label: 'nothing to change', as: ADMIN, body: {} });
    await call('PATCH', `${o()}/settings`, { label: 'employee', as: EMP1, body: { city: 'X' }, expect: 403 });
    eq('employee view hides billing', (await call('GET', `${o()}`, { as: EMP1 })).body?.org?.billing_email, undefined);
  });

  await area('staff: activate workspace, seats and entitlements', async () => {
    await call('POST', `${o()}/people/${S.emp1Member}/seat`, { label: 'pilot has no seats', as: OWNER, body: { seat: true }, expect: 409 });
    await call('GET', 'staff/orgs', { label: 'not staff', as: OWNER, expect: 403 });
    await call('PATCH', `staff/orgs/${S.org}`, { label: 'not staff', as: OWNER, body: { status: 'active' }, expect: 403 });
    const list = await call('GET', 'staff/orgs', { as: STAFF });
    ok('staff lists workspaces', (list.body?.orgs?.length ?? 0) >= 2, list.body);
    eq('pilot count', list.body?.counts?.pilot, 2);
    const filtered = await call('GET', 'staff/orgs?status=pilot&q=silk', { as: STAFF });
    eq('filter', filtered.body?.orgs?.length, 1);
    const activated = await call('PATCH', `staff/orgs/${S.org}`, { as: STAFF, body: { status: 'active', seats_limit: 3, tests_limit: 40, contract_ends_at: '2030-12-31', ai_daily_limit: 500, schood_contact_email: 'sales@schood.online', schood_contact_phone: '+998901112233', tax_id: '301234567', billing_email: 'bills@silk.example', name: 'Silk Road Hotels' } });
    eq('active', activated.body?.org?.status, 'active');
    eq('contract', String(activated.body?.org?.contract_ends_at ?? '').slice(0, 10), '2030-12-31');
    ok('synced everyone', Number(activated.body?.synced) >= 5, activated.body?.synced);
    const detail = await call('GET', `staff/orgs/${S.org}`, { as: STAFF });
    ok('audit resolved actors', detail.body?.audit?.some((row: any) => row.actor_name), detail.body?.audit?.slice(0, 2));
    await call('PATCH', `staff/orgs/${S.org}`, { label: 'bad status', as: STAFF, body: { status: 'nonsense' }, expect: 400 });
    await call('PATCH', `staff/orgs/${S.org}`, { label: 'bad contract', as: STAFF, body: { contract_ends_at: 'soon' }, expect: 400 });
    await call('PATCH', `staff/orgs/${S.org}`, { label: 'no change', as: STAFF, body: {} });

    const seat = (member: string, on: boolean, expect: Expect = 200) => call('POST', `${o()}/people/${member}/seat`, { as: OWNER, body: { seat: on }, expect });
    const ent = (user: string) => `select is_active||'|'||source from entitlements where user_id='${user}' and resource_type='product' and resource_id='${SEAT_PRODUCT}'`;
    const seated = await seat(S.emp1Member, true);
    eq('seat count', seated.body?.usage?.seats_used, 1);
    await eqSql('entitlement granted', ent(EMP1), 'true|company');
    await seat(S.emp1Member, false);
    await eqSql('entitlement revoked', ent(EMP1), 'false|company');
    await seat(S.emp1Member, true);
    await eqSql('entitlement back', ent(EMP1), 'true|company');
    await eqSql('ends with the contract', `select to_char(ends_at at time zone 'Asia/Tashkent','YYYY-MM-DD HH24:MI') from entitlements where user_id='${EMP1}' and resource_id='${SEAT_PRODUCT}'`, '2030-12-31 23:59');
    await eqSql('the seat product is hidden', `select metadata->>'hidden' from products where id='${SEAT_PRODUCT}'`, 'true');

    // A person who bought English themselves: their row is never read or changed.
    const memberOf = async (user: string) => need(await sql(`select id from company_members where org_id='${S.org}' and user_id='${user}'`), `member of ${user}`);
    S.emp2Member = await memberOf(EMP2);
    S.emp3Member = await memberOf(EMP3);
    S.emp4Member = await memberOf(EMP4);
    S.emp5Member = await memberOf(EMP5);
    S.managerMember = await memberOf(MANAGER);
    S.adminMember = await memberOf(ADMIN);
    await sql(`insert into entitlements (user_id, tenant_id, resource_type, resource_id, is_active, ends_at, source) values ('${EMP2}', '${tid(5)}', 'product', '${BUNDLE}', true, now() + interval '10 days', 'click')`);
    const purchase = (user: string) => `select md5(row_to_json(e)::text) from entitlements e where user_id='${user}' and resource_id='${BUNDLE}'`;
    const bought = await sql(purchase(EMP2));
    ok('purchase row exists', bought.length === 32, bought);
    await seat(S.emp2Member, true);
    await eqSql('the seat is its own row', ent(EMP2), 'true|company');
    await eqSql('the purchase is untouched by a seat', purchase(EMP2), bought);
    await seat(S.emp2Member, false);
    await eqSql('seat off ends only the seat', ent(EMP2), 'false|company');
    await eqSql('the purchase is untouched by seat off', purchase(EMP2), bought);
    await sql(`insert into entitlements (user_id, tenant_id, resource_type, resource_id, is_active, ends_at, source) values ('${EMP3}', '${tid(6)}', 'product', '${BUNDLE}', true, null, 'click')`);
    const open = await sql(purchase(EMP3));
    await seat(S.emp3Member, true);
    await eqSql('own open-ended access stays', purchase(EMP3), open);
    await eqSql('and the seat sits beside it', ent(EMP3), 'true|company');
    await seat(S.emp2Member, true);
    await seat(S.emp4Member, true, 409);
    await call('PATCH', `staff/orgs/${S.org}`, { label: 'seats below used', as: STAFF, body: { seats_limit: 1 }, expect: 409 });
    const direct = await db.rpc('company_sync_english_access', { p_user: uid(99) });
    eq('sync of someone with no seat', direct.data, 'none');
    await sql(`insert into public.users (id, role) values ('${uid(98)}', 'user'); insert into company_members (org_id, user_id, email, role, status, seat) values ('${S.org}', '${uid(98)}', 'no.tenant@example.uz', 'employee', 'active', true);`);
    eq('sync of a seated user with no tenant', (await db.rpc('company_sync_english_access', { p_user: uid(98) })).data, 'no_tenant');
    await sql(`delete from company_members where user_id='${uid(98)}'`);

    // Suspended: writes refused, reads allowed, access gone; active again restores it.
    await call('PATCH', `staff/orgs/${S.org}`, { as: STAFF, body: { status: 'suspended' } });
    await eqSql('suspension revokes', ent(EMP1), 'false|company');
    await call('GET', `${o()}`, { label: 'suspended read', as: EMP1 });
    await call('POST', `${o()}/learn/${TRACKS[0].lessons[0].code}/start`, { label: 'suspended write', as: EMP1, body: {}, expect: 403 });
    const paused = await call('GET', `${o()}/learn/${TRACKS[0].lessons[0].code}`, { label: 'a seat in a paused workspace', as: EMP1, expect: 402 });
    eq('paused reason', [paused.body?.code, paused.body?.reason], ['seat_required', 'paused']);
    eq('catalogue says why', (await call('GET', `${o()}/tracks`, { as: EMP1 })).body?.seat_reason, 'paused');
    await call('POST', `join/${S.openLink}`, { label: 'suspended join', as: EMP8, body: { consent: true }, expect: 403 });
    await call('PATCH', `staff/orgs/${S.org}`, { as: STAFF, body: { status: 'active' } });
    await eqSql('active again restores', ent(EMP1), 'true|company');
    await call('PATCH', `staff/orgs/${S.org}`, { as: STAFF, body: { contract_ends_at: '2020-01-31' } });
    await eqSql('an ended contract revokes the seat', ent(EMP1), 'false|company');
    const endedHr = await seat(S.emp4Member, true, 403);
    eq('HR is read-only', endedHr.body?.code, 'contract_ended');
    const endedStaff = await call('POST', `${o()}/people/${S.emp4Member}/seat`, { label: 'staff cannot seat past the contract', as: STAFF, body: { seat: true }, expect: 409 });
    eq('staff told why', endedStaff.body?.code, 'seats_contract_ended');
    const endedLesson = await call('GET', `${o()}/learn/${TRACKS[0].lessons[0].code}`, { label: 'a seat after the contract', as: EMP1, expect: 402 });
    eq('ended reason', endedLesson.body?.reason, 'contract_ended');
    eq('join preview says ended', (await call('GET', `join/${S.openLink}`, { as: EMP8 })).body?.state, 'ended');
    const endedJoin = await call('POST', `join/${S.openLink}`, { label: 'joining after the contract', as: EMP8, body: { consent: true }, expect: 403 });
    eq('join refused', endedJoin.body?.code, 'contract_ended');
    await call('PATCH', `staff/orgs/${S.org}`, { as: STAFF, body: { contract_ends_at: '2030-12-31', seats_limit: 10 } });
    await eqSql('a renewed contract restores it', ent(EMP1), 'true|company');
    await seat(S.emp4Member, true);
    await seat(S.managerMember, true);
    await seat(S.emp5Member, true);
  });

  await area('staff: leads pipeline, opening a workspace, owner invites, audit', async () => {
    const leads = await call('GET', 'staff/leads', { as: STAFF });
    ok('leads listed', (leads.body?.leads?.length ?? 0) >= 5, leads.body?.leads?.length);
    const lead = need(S.lead, 'lead');
    await call('GET', `staff/leads/${lead}`, { as: STAFF });
    await call('GET', 'staff/leads/not-a-uuid', { label: 'malformed lead', as: STAFF, expect: 404 });
    const patched = await call('PATCH', `staff/leads/${lead}`, { as: STAFF, body: { status: 'contacted', notes: 'Called on Monday.', follow_up_at: '2026-12-01' } });
    eq('lead updated', patched.body?.lead?.status, 'contacted');
    eq('follow up', patched.body?.lead?.follow_up_at, '2026-12-01');
    await call('PATCH', `staff/leads/${lead}`, { label: 'bad status', as: STAFF, body: { status: 'nope' }, expect: 400 });
    await call('POST', `staff/leads/${lead}/notes`, { as: STAFF, body: { body: 'Sent a proposal.' } });
    const timeline = await call('GET', `staff/leads/${lead}`, { as: STAFF });
    ok('timeline has the note', timeline.body?.timeline?.some((row: any) => row.action === 'lead.note'), timeline.body?.timeline);
    const opened = await call('POST', 'staff/orgs', { as: STAFF, body: { lead_id: lead, name: 'Silk Road Hotels LLC', industry: 'hospitality', size_band: '51-200', status: 'active', seats_limit: 2, tests_limit: null, contract_ends_at: '2030-06-30', owner_email: emailOf(NEW_OWNER), owner_name: 'Aziz Karimov', ai_daily_limit: 100, locale: 'uz' } });
    S.staffOrg = need(opened.body?.org?.id, 'staff org');
    eq('unlimited tests', opened.body?.org?.tests_limit, null);
    await eqSql('lead won and linked', `select status||'|'||(org_id='${S.staffOrg}') from company_leads where id='${lead}'`, 'won|true');
    await call('POST', 'staff/orgs', { label: 'lead already has a workspace', as: STAFF, body: { lead_id: lead, name: 'Again', owner_email: 'a@b.example' }, expect: 409 });
    await call('POST', 'staff/orgs', { label: 'no owner', as: STAFF, body: { name: 'No Owner Ltd' }, expect: 400 });
    const waiting = await call('GET', 'staff/orgs', { as: STAFF });
    const row = waiting.body?.orgs?.find((org: any) => org.id === S.staffOrg);
    eq('owner invited is not an orphan', [row?.ownerless, row?.owner_invited], [false, true]);
    ok('the filter finds only real orphans', !(await call('GET', 'staff/orgs?ownerless=1', { as: STAFF })).body?.orgs?.some((org: any) => org.id === S.staffOrg));
    eq('detail says invited', (await call('GET', `staff/orgs/${S.staffOrg}`, { as: STAFF })).body?.owner_state, 'invited');
    const fresh = await call('POST', `staff/orgs/${S.staffOrg}/owner-invite`, { as: STAFF, body: { email: emailOf(NEW_OWNER), full_name: 'Aziz Karimov' } });
    await call('POST', `join/${tokenOf(opened.body?.link)}`, { label: 'first owner link replaced', as: NEW_OWNER, body: { consent: true }, expect: 410 });
    const owned = await call('POST', `join/${tokenOf(need(fresh.body?.link, 'owner link'))}`, { as: NEW_OWNER, body: { consent: true } });
    eq('joined as owner', owned.body?.role, 'owner');
    eq('detail says active', (await call('GET', `staff/orgs/${S.staffOrg}`, { as: STAFF })).body?.owner_state, 'active');
    await call('POST', `staff/orgs/${S.staffOrg}/owner-invite`, { label: 'already in', as: STAFF, body: { email: emailOf(NEW_OWNER) }, expect: 409 });
    await call('POST', `staff/orgs/${S.staffOrg}/owner-invite`, { label: 'by name only', as: STAFF, body: { full_name: 'Second Owner' } });
    await call('GET', 'staff/audit', { as: STAFF });
    const filtered = await call('GET', `staff/audit?org=${S.org}&action=member.&limit=20`, { as: STAFF });
    ok('audit filter', (filtered.body?.audit ?? []).length > 0 && filtered.body.audit.every((row: any) => row.action.startsWith('member.') && row.org_id === S.org), filtered.body?.audit?.slice(0, 2));
    await call('GET', 'staff/audit?action=lead.%25', { label: 'wildcard in the filter is ignored', as: STAFF });
  });

  await area('hiring: test setup and candidate A (all six skills, AI graded)', async () => {
    const created = await call('POST', `${o()}/assessments`, { as: ADMIN, body: { title: 'Receptionist 2026', job_role: 'hospitality', skills: ['grammar', 'vocabulary', 'reading', 'listening', 'writing', 'speaking'], min_level: 'a2', show_level: true, closes_at: '2030-01-01T00:00:00Z' } });
    S.test = need(created.body?.assessment?.id, 'assessment');
    S.testToken = tokenOf(need(created.body?.link, 'test link'));
    ok('no hash leaked', !('link_token_hash' in created.body.assessment));
    await call('POST', `${o()}/assessments`, { label: 'no skills', as: ADMIN, body: { title: 'Bad', skills: [] }, expect: 400 });
    await call('POST', `${o()}/assessments`, { label: 'time limit', as: ADMIN, body: { title: 'Bad time', time_limit_minutes: 1 }, expect: 400 });
    const intro = await call('GET', `public/t/${S.testToken}`);
    eq('intro open', intro.body?.open, true);
    eq('intro company', intro.body?.test?.company, 'Silk Road Hotels');
    await call('GET', 'public/t/short', { label: 'malformed link', expect: 404 });
    await call('GET', 'public/t/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', { label: 'unknown link', expect: 404 });
    await call('POST', `public/t/${S.testToken}/start`, { label: 'no consent', body: { name: 'Nodir', email: 'nodir@example.uz' }, expect: 400 });
    await call('POST', `public/t/${S.testToken}/start`, { label: 'no email', body: { name: 'Nodir', consent: true }, expect: 400 });

    const usedBefore = await sql(`select tests_used from company_orgs where id='${S.org}'`);
    const started = await call('POST', `public/t/${S.testToken}/start`, { body: { name: 'Nodir Yusupov', email: 'Nodir@Example.uz', phone: '+998907654321', consent: true }, ip: '192.0.2.10' });
    const key = need(started.body?.key, 'candidate key');
    S.keyA = key;
    S.attemptA = started.body.attempt.id;
    eq('test reserved', Number(await sql(`select tests_used from company_orgs where id='${S.org}'`)), Number(usedBefore) + 1);
    ok('no answer key served', !JSON.stringify(started.body.attempt.section).includes('"answer"'));
    ok('no bank id or level served', !/"[a-z]+-(a1|a2|b1|b2|c1|c2)\b|"level"/.test(JSON.stringify(started.body)), started.body?.attempt?.section);
    await call('POST', `public/t/${S.testToken}/start`, { label: 'same email twice', body: { name: 'Nodir Again', email: 'nodir@example.uz', consent: true }, ip: '192.0.2.11', expect: 409 });
    await call('POST', 'public/attempts/state', { label: 'bad key', body: { key: 'nope' }, expect: 404 });
    // A candidate who lost their key: HR makes a private link and the old key stops working.
    const lost = await call('POST', `public/t/${S.testToken}/start`, { body: { name: 'Lost Key', email: 'lost.key@example.uz', consent: true }, ip: '192.0.2.12' });
    const access = await call('POST', `${o()}/attempts/${need(lost.body?.attempt?.id, 'lost attempt')}/access`, { as: ADMIN });
    const newKey = tokenOf(need(access.body?.link, 'access link'));
    ok('a private link', String(access.body?.link).includes('/r/'), access.body);
    await call('POST', 'public/attempts/state', { label: 'the old key stopped working', body: { key: lost.body?.key }, expect: 404 });
    eq('the new key works', (await call('POST', 'public/attempts/state', { body: { key: newKey } })).body?.attempt?.id, lost.body?.attempt?.id);
    await call('POST', `${o()}/attempts/${S.attemptA}/access`, { label: 'running attempts only: the first is running', as: EMP1, expect: 403 });
    await call('POST', 'public/attempts/submit', { body: { key: newKey, answers: answersFor(lost.body?.attempt?.section) } });
    await call('POST', `${o()}/attempts/${lost.body?.attempt?.id}/access`, { label: 'a finished attempt has no new link', as: ADMIN, expect: 409 });
    await call('POST', 'public/attempts/state', { label: 'unknown key', body: { key: 'A'.repeat(32) }, expect: 404 });
    const state = await call('POST', 'public/attempts/state', { body: { key } });
    eq('state', state.body?.attempt?.status, 'started');
    const answers = answersFor(state.body.attempt.section);
    const saved = await call('POST', 'public/attempts/save', { body: { key, answers, integrity: { tab_hidden: 4, paste: 1, copy: 2, fullscreen_exit: 2, section_seconds: { grammar: 1 }, plays: { 'l-test-1': 3 } } } });
    ok('saved_at', saved.body?.saved_at, saved.body);
    await eqSql('answers stored', `select count(*) from jsonb_object_keys((select answers from company_attempts where id='${S.attemptA}'))`, String(Object.keys(answers).length));
    const finished = await walk(state.body.attempt, (next) => call('POST', 'public/attempts/next', { body: { key, answers: next, integrity: { section_seconds: { vocabulary: 100, reading: 200 } } } }));
    eq('graded by AI', finished?.status, 'graded');
    ok('result shown', finished?.result?.overall_level, finished);
    ok('certificate code', /^[A-HJ-NP-Z2-9]{10}$/.test(String(finished?.result?.certificate_code)), finished?.result);
    S.certA = finished?.result?.certificate_code;
    eq('AI used for writing and speaking', [aiCalls['company-writing-grade'], aiCalls['company-speaking-grade']], [1, 1]);
    await eqSql('stored level matches score', `select (overall_level is not null)||'|'||(overall_score is not null)||'|'||(graded_at is not null)||'|'||(certificate_code is not null)||'|'||status from company_attempts where id='${S.attemptA}'`, 'true|true|true|true|graded');
    await eqSql('AI usage counted', `select calls from company_ai_usage where org_id='${S.org}'`, '2');
    const after = await call('POST', 'public/attempts/save', { label: 'save after the end returns the view', body: { key, answers: {} } });
    eq('after end', after.body?.attempt?.status, 'graded');
    await call('POST', 'public/attempts/next', { label: 'next after the end', body: { key, answers: {} } });
    await call('POST', 'public/attempts/submit', { label: 'submit after the end', body: { key } });
  });

  await area('hiring: candidates B, C, D (early submit, AI down, expiry)', async () => {
    const start = (name: string, email: string, ip: string) => call('POST', `public/t/${need(S.testToken, 'test link')}/start`, { body: { name, email, consent: true }, ip });
    // B: submits early with AI down; writing and speaking were never reached so nothing is pending.
    const b = await start('Bekzod Early', 'bekzod@example.uz', '192.0.2.20');
    const submitted = await call('POST', 'public/attempts/submit', { body: { key: b.body?.key, answers: answersFor(b.body?.attempt?.section) } });
    eq('skipped sections still finish', submitted.body?.attempt?.status, 'graded');
    S.attemptB = b.body?.attempt?.id;

    // E: reaches writing and speaking while AI is down, so both stay pending for HR.
    const e = await start('Elyor Pending', 'elyor@example.uz', '192.0.2.21');
    S.attemptE = need(e.body?.attempt?.id, 'attempt E');
    aiMode = 'failed';
    const pending = await walk(e.body.attempt, (next) => call('POST', 'public/attempts/next', { body: { key: e.body.key, answers: next } }));
    aiMode = 'ok';
    eq('waits for grading', pending?.status, 'submitted');
    await eqSql('reason recorded', `select ai_feedback->>'reason' from company_attempts where id='${S.attemptE}'`, 'ai_unavailable');
    const report = await call('GET', `${o()}/attempts/${S.attemptE}`, { as: ADMIN });
    ok('pending listed', report.body?.attempt?.pending?.includes('writing'), report.body?.attempt?.pending);
    const scored = await call('POST', `${o()}/attempts/${S.attemptE}/score`, { as: ADMIN, body: { skill: 'writing', score: 55 } });
    eq('still pending speaking', scored.body?.attempt?.status, 'submitted');
    await call('POST', `${o()}/attempts/${S.attemptE}/score`, { label: 'score out of range', as: ADMIN, body: { skill: 'writing', score: 101 }, expect: 400 });
    const regraded = await call('POST', `${o()}/attempts/${S.attemptE}/regrade`, { as: ADMIN, body: {} });
    eq('regrade finishes it', regraded.body?.attempt?.status, 'graded');
    const forced = await call('POST', `${o()}/attempts/${S.attemptE}/regrade`, { label: 'grade one skill again', as: ADMIN, body: { skill: 'writing' } });
    eq('forced AI result replaces manual', forced.body?.attempt?.results?.writing?.source, 'ai');
    await call('POST', `${o()}/attempts/${S.attemptE}/score`, { label: 'manual override after grading', as: ADMIN, body: { skill: 'speaking', score: 80 } });
    await eqSql('manual source stored', `select skill_results->'speaking'->>'source' from company_attempts where id='${S.attemptE}'`, 'manual');

    // C: time ran out with nothing answered: expired, the email can be used again.
    const c = await start('Comil Expired', 'comil@example.uz', '192.0.2.22');
    S.attemptC = need(c.body?.attempt?.id, 'attempt C');
    await sql(`update company_attempts set deadline_at = now() - interval '10 minutes' where id='${S.attemptC}'`);
    const expired = await call('POST', 'public/attempts/state', { body: { key: c.body.key } });
    eq('expired', expired.body?.attempt?.status, 'expired');
    await call('POST', `public/t/${S.testToken}/start`, { label: 'expired email may start again', body: { name: 'Comil Again', email: 'comil@example.uz', consent: true }, ip: '192.0.2.22' });

    // D: time ran out with answers saved: HR's list closes it (the sweep) and flags it.
    const d = await start('Dilshod Overdue', 'dilshod@example.uz', '192.0.2.23');
    S.attemptD = need(d.body?.attempt?.id, 'attempt D');
    await call('POST', 'public/attempts/save', { body: { key: d.body.key, answers: answersFor(d.body.attempt.section) } });
    await sql(`update company_attempts set deadline_at = now() - interval '10 minutes' where id='${S.attemptD}'`);
    const sweep = await call('GET', `${o()}/assessments/${S.test}`, { as: ADMIN });
    const rowD = sweep.body?.attempts?.find((row: any) => row.id === S.attemptD);
    eq('swept', rowD?.status, 'graded');
    ok('auto-submit flag', rowD?.flags?.some((flag: any) => flag.code === 'auto_submitted'), rowD);
    ok('A has its flags', sweep.body?.attempts?.find((row: any) => row.id === S.attemptA)?.flags?.some((flag: any) => flag.code === 'paste'));
  });

  await area('hiring: HR review, decisions, export, link, duplicate, close, quota', async () => {
    const test = need(S.test, 'test');
    const list = await call('GET', `${o()}/assessments`, { as: ADMIN });
    ok('listed with stats', list.body?.assessments?.[0]?.stats?.graded >= 1, list.body?.assessments?.[0]?.stats);
    ok('bank counts', list.body?.bank, list.body);
    await call('GET', `${o()}/assessments?kind=placement`, { as: ADMIN });
    await call('GET', `${o()}/assessments?kind=nope`, { label: 'bad kind', as: ADMIN, expect: 400 });
    const decision = await call('PATCH', `${o()}/attempts/${S.attemptA}`, { as: ADMIN, body: { decision: 'shortlist', notes: 'Strong at the desk.' } });
    eq('decision', decision.body?.decision, 'shortlist');
    await eqSql('decision stored', `select decision||'|'||notes||'|'||(decision_by='${ADMIN}') from company_attempts where id='${S.attemptA}'`, 'shortlist|Strong at the desk.|true');
    await call('PATCH', `${o()}/attempts/${S.attemptA}`, { label: 'clear the decision', as: ADMIN, body: { decision: null } });
    await call('PATCH', `${o()}/attempts/${S.attemptA}`, { as: ADMIN, body: { decision: 'hold' } });
    await call('PATCH', `${o()}/attempts/${S.attemptA}`, { label: 'bad decision', as: ADMIN, body: { decision: 'maybe' }, expect: 400 });
    await call('PATCH', `${o()}/attempts/${S.attemptA}`, { label: 'nothing to change', as: ADMIN, body: {}, expect: 400 });
    const report = await call('GET', `${o()}/attempts/${S.attemptA}`, { as: ADMIN });
    eq('report has the sections', report.body?.attempt?.sections?.length, 6);
    ok('no address hash in the report', !JSON.stringify(report.body).includes('ip_hash'));
    ok('feedback in the report', report.body?.attempt?.feedback?.writing?.summary, report.body?.attempt?.feedback);
    await call('GET', `${o()}/attempts/${S.attemptA}`, { label: 'manager cannot read a candidate', as: MANAGER, expect: 403 });
    const exported = await call('GET', `${o()}/assessments/${test}/export`, { as: ADMIN });
    ok('CSV has a row per attempt', String(exported.body?.csv).includes('Nodir Yusupov'), exported.body);
    ok('CSV file name', String(exported.body?.filename).endsWith('.csv'), exported.body?.filename);
    // Side-by-side compare is client-side (HiringPages.tsx) over this list; there is no API route for it.
    const compare = await call('GET', `${o()}/assessments/${test}`, { as: ADMIN });
    ok('compare data: every skill on each row', Object.keys(compare.body?.attempts?.[0]?.skills ?? {}).length === 6, compare.body?.attempts?.[0]);

    const edited = await call('PATCH', `${o()}/assessments/${test}`, { as: ADMIN, body: { title: 'Receptionist 2027', max_attempts: 100, show_level: false, min_level: 'b1' } });
    eq('edited', edited.body?.assessment?.title, 'Receptionist 2027');
    const relinked = await call('POST', `${o()}/assessments/${test}/link`, { as: ADMIN });
    await call('GET', `public/t/${S.testToken}`, { label: 'old link dead', expect: 404 });
    S.testToken = tokenOf(need(relinked.body?.link, 'new link'));
    await call('GET', `public/t/${S.testToken}`);
    const copy = await call('POST', `${o()}/assessments/${test}/duplicate`, { as: ADMIN });
    eq('copy title', copy.body?.assessment?.title, 'Receptionist 2027 (copy)');
    S.copyTest = need(copy.body?.assessment?.id, 'copy');
    S.copyToken = tokenOf(copy.body?.link);

    const closed = await call('PATCH', `${o()}/assessments/${test}`, { as: ADMIN, body: { status: 'closed' } });
    eq('closed', closed.body?.assessment?.status, 'closed');
    eq('intro says closed', (await call('GET', `public/t/${S.testToken}`)).body?.open, false);
    await call('POST', `public/t/${S.testToken}/start`, { label: 'closed test', body: { name: 'Late One', email: 'late@example.uz', consent: true }, expect: 409 });
    await call('PATCH', `${o()}/assessments/${test}`, { label: 'reopen', as: ADMIN, body: { status: 'open' } });

    // Delete one attempt.
    const gone = await call('POST', `public/t/${S.copyToken}/start`, { body: { name: 'Delete Me', email: 'delete@example.uz', consent: true }, ip: '192.0.2.30' });
    await call('DELETE', `${o()}/attempts/${need(gone.body?.attempt?.id, 'attempt')}`, { as: ADMIN });
    await call('GET', `${o()}/attempts/${gone.body.attempt.id}`, { label: 'deleted attempt', as: ADMIN, expect: 404 });

    // Limits: candidates per test, starts per address, tests per workspace.
    await call('PATCH', `${o()}/assessments/${S.copyTest}`, { as: ADMIN, body: { max_attempts: 1 } });
    await call('POST', `public/t/${S.copyToken}/start`, { body: { name: 'Only One', email: 'only@example.uz', consent: true }, ip: '192.0.2.31' });
    await call('POST', `public/t/${S.copyToken}/start`, { label: 'test full', body: { name: 'Second', email: 'second@example.uz', consent: true }, ip: '192.0.2.32', expect: 409 });
    await call('PATCH', `${o()}/assessments/${S.copyTest}`, { as: ADMIN, body: { max_attempts: null } });
    for (let i = 0; i < 5; i++) await call('POST', `public/t/${S.copyToken}/start`, { label: 'starts from one address', body: { name: `Rate ${i}`, email: `rate${i}@example.uz`, consent: true }, ip: '192.0.2.40' });
    await call('POST', `public/t/${S.copyToken}/start`, { label: 'too many starts', body: { name: 'Rate 6', email: 'rate6@example.uz', consent: true }, ip: '192.0.2.40', expect: 429 });

    const used = await sql(`select tests_used from company_orgs where id='${S.org}'`);
    await call('PATCH', `staff/orgs/${S.org}`, { as: STAFF, body: { tests_limit: Number(used) } });
    const refusal = await call('POST', `public/t/${S.copyToken}/start`, { label: 'quota exhausted', body: { name: 'Over Quota', email: 'over@example.uz', consent: true }, ip: '192.0.2.50', expect: 402 });
    eq('quota code', refusal.body?.code, 'tests_exhausted');
    await eqSql('quota not exceeded', `select tests_used from company_orgs where id='${S.org}'`, used);
    await call('PATCH', `staff/orgs/${S.org}`, { as: STAFF, body: { tests_limit: 200 } });
  });

  await area('certificates', async () => {
    const code = need(S.certA, 'certificate code');
    const verified = await call('GET', `public/v/${code}`);
    eq('name on certificate', verified.body?.certificate?.name, 'Nodir Yusupov');
    ok('no contact details', !JSON.stringify(verified.body).includes('@'), verified.body);
    await call('GET', `public/v/${String(code).toLowerCase()}`, { label: 'lower case works' });
    await call('GET', 'public/v/AAAAAAAAAA', { label: 'unknown code', expect: 404 });
    await call('GET', 'public/v/bad', { label: 'malformed code', expect: 404 });
  });

  await area('placement: campaigns and members taking them', async () => {
    await call('GET', `${o()}/placement/audience`, { as: ADMIN });
    await call('POST', `${o()}/placement`, { label: 'audience from another workspace', as: ADMIN, body: { title: 'Bad', audience: { type: 'members', ids: ['00000000-0000-4000-8000-00000000ffff'] } }, expect: 400 });
    const created = await call('POST', `${o()}/placement`, { as: ADMIN, body: { title: 'Placement autumn', kind: 'placement', skills: ['grammar', 'vocabulary', 'reading', 'listening', 'writing'], audience: { type: 'all' }, retest_days: 30 } });
    S.placement = need(created.body?.assessment?.id, 'campaign');
    eq('no public link', created.body?.assessment?.has_link, false);
    const dept = await call('POST', `${o()}/placement`, { as: ADMIN, body: { title: 'Sales check', kind: 'progress', skills: ['grammar'], audience: { type: 'departments', ids: [S.deptSales] }, retest_days: 1 } });
    S.progress = need(dept.body?.assessment?.id, 'department campaign');
    const named = await call('POST', `${o()}/placement`, { as: ADMIN, body: { title: 'For Boris', skills: ['vocabulary'], audience: { type: 'members', ids: [S.emp2Member] } } });
    S.named = need(named.body?.assessment?.id, 'named campaign');
    await call('PATCH', `${o()}/assessments/${S.named}`, { label: 'edit a campaign', as: ADMIN, body: { title: 'For Boris only', audience: { type: 'members', ids: [S.emp2Member, S.emp3Member] }, member_role: false } });
    await call('POST', `${o()}/assessments/${S.named}/link`, { label: 'campaigns have no link', as: ADMIN, expect: 400 });
    const copied = await call('POST', `${o()}/assessments/${S.named}/duplicate`, { label: 'duplicate a campaign', as: ADMIN });
    eq('copy has no link', copied.body?.link, null);

    const tests = await call('GET', `${o()}/my/tests`, { as: EMP1 });
    const mine = tests.body?.tests?.find((row: any) => row.assessment_id === S.placement);
    eq('todo', mine?.status, 'todo');
    ok('department campaign hidden', !tests.body?.tests?.some((row: any) => row.assessment_id === S.progress), tests.body?.tests);
    await call('GET', `${o()}/my/tests/${S.progress}`, { label: 'outside the audience', as: EMP1, expect: 404 });
    eq('can start', (await call('GET', `${o()}/my/tests/${S.placement}`, { as: EMP1 })).body?.can_start, true);

    const started = await call('POST', `${o()}/my/attempts`, { as: EMP1, body: { assessment_id: S.placement } });
    const attempt = need(started.body?.attempt?.id, 'member attempt');
    S.memberAttempt = attempt;
    const resumed = await call('POST', `${o()}/my/attempts`, { label: 'resume', as: EMP1, body: { assessment_id: S.placement } });
    eq('same attempt', resumed.body?.attempt?.id, attempt);
    await call('POST', `${o()}/my/attempts`, { label: 'bad id', as: EMP1, body: { assessment_id: 'nope' }, expect: 400 });
    await call('GET', `${o()}/my/attempts/${attempt}`, { as: EMP1 });
    await call('GET', `${o()}/my/attempts/${attempt}`, { label: "someone else's attempt", as: EMP2, expect: 404 });
    const saved = await call('POST', `${o()}/my/attempts/${attempt}/save`, { as: EMP1, body: { answers: answersFor(started.body.attempt.section), integrity: { tab_hidden: 1 } } });
    ok('saved', saved.body?.saved_at, saved.body);
    const finished = await walk(started.body.attempt, (answers) => call('POST', `${o()}/my/attempts/${attempt}/next`, { as: EMP1, body: { answers } }));
    eq('graded', finished?.status, 'graded');
    ok('member sees feedback', finished?.result?.feedback?.writing, finished?.result);
    S.memberCert = finished?.result?.certificate_code;
    await eqSql('member level updated', `select (level is not null)||'|'||(level_score is not null)||'|'||level_source||'|'||(level_at is not null) from company_members where id='${S.emp1Member}'`, 'true|true|placement|true');
    await eqSql('member level is the attempt level', `select m.level = a.overall_level and m.level_score = a.overall_score from company_members m join company_attempts a on a.member_id=m.id where a.id='${attempt}'`, 't');
    await eqSql('test activity logged', `select count(*) from company_activity where member_id='${S.emp1Member}' and kind='test' and ref='${attempt}'`, '1');
    await call('GET', `public/v/${need(S.memberCert, 'member certificate')}`, { label: 'staff certificate verifies' });
    const history = await call('GET', `${o()}/my/attempts`, { as: EMP1 });
    eq('history', history.body?.attempts?.[0]?.attempt_id, attempt);
    await call('POST', `${o()}/my/attempts`, { label: 'already taken', as: EMP1, body: { assessment_id: S.placement }, expect: 409 });
    await call('POST', `${o()}/my/attempts/${attempt}/save`, { label: 'save after the end', as: EMP1, body: {} });
    await call('POST', `${o()}/my/attempts/${attempt}/next`, { label: 'next after the end', as: EMP1, body: {} });
    await call('POST', `${o()}/my/attempts/${attempt}/submit`, { label: 'submit after the end', as: EMP1, body: {} });

    // Submit part-way.
    const partial = await call('POST', `${o()}/my/attempts`, { as: EMP2, body: { assessment_id: S.placement } });
    const submitted = await call('POST', `${o()}/my/attempts/${need(partial.body?.attempt?.id, 'partial attempt')}/submit`, { as: EMP2, body: { answers: answersFor(partial.body.attempt.section) } });
    eq('part-way graded', submitted.body?.attempt?.status, 'graded');
    await call('POST', `${o()}/my/attempts`, { as: EMP3, body: { assessment_id: S.placement } }).then(async (third) => {
      await sql(`update company_attempts set deadline_at = now() - interval '10 minutes' where id='${third.body?.attempt?.id}'`);
      const listed = await call('GET', `${o()}/my/tests`, { label: 'overdue attempt closes on the list', as: EMP3 });
      ok('expired again todo', listed.body?.tests?.find((row: any) => row.assessment_id === S.placement)?.status === 'todo', listed.body?.tests);
    });

    // Retest window: the department campaign, retest after one day.
    const seller = need(S.emp4Member, 'sales member');
    const one = await call('POST', `${o()}/my/attempts`, { as: EMP4, body: { assessment_id: S.progress } });
    const firstAttempt = need(one.body?.attempt?.id, 'progress attempt');
    await walk(one.body.attempt, (answers) => call('POST', `${o()}/my/attempts/${firstAttempt}/next`, { as: EMP4, body: { answers } }));
    await eqSql('progress updates the level', `select level_source from company_members where id='${seller}'`, 'progress');
    const wait = await call('GET', `${o()}/my/tests/${S.progress}`, { as: EMP4 });
    eq('done until the retest', wait.body?.status, 'done');
    ok('retest date', wait.body?.retest_at, wait.body);
    await sql(`update company_attempts set submitted_at = now() - interval '3 days', started_at = now() - interval '3 days', graded_at = now() - interval '3 days' where id='${firstAttempt}'`);
    eq('retest open', (await call('GET', `${o()}/my/tests/${S.progress}`, { as: EMP4 })).body?.can_start, true);
    const two = await call('POST', `${o()}/my/attempts`, { as: EMP4, body: { assessment_id: S.progress } });
    const secondAttempt = need(two.body?.attempt?.id, 'retest attempt');
    await walk(two.body.attempt, (answers) => call('POST', `${o()}/my/attempts/${secondAttempt}/next`, { as: EMP4, body: { answers } }));

    const hr = await call('GET', `${o()}/placement`, { as: ADMIN });
    ok('campaign progress', hr.body?.campaigns?.find((row: any) => row.id === S.placement)?.progress?.done >= 1, hr.body?.campaigns?.[0]);
    await call('GET', `${o()}/placement`, { label: 'manager', as: MANAGER });
    const people = await call('GET', `${o()}/placement/${S.progress}`, { as: ADMIN });
    const row = people.body?.people?.find((entry: any) => entry.member_id === seller);
    eq('latest attempt is shown', row?.attempt_id, secondAttempt);
    await call('GET', `${o()}/placement/${S.placement}`, { label: 'manager view', as: MANAGER });
    await call('GET', `${o()}/placement/${S.test}`, { label: 'hiring test is not a campaign', as: ADMIN, expect: 404 });
    await call('GET', `${o()}/attempts/${attempt}`, { label: 'manager reads their department', as: MANAGER });
    await call('GET', `${o()}/attempts/${secondAttempt}`, { label: 'manager cannot read another department', as: MANAGER, expect: 403 });
    await call('POST', `${o()}/attempts/${attempt}/regrade`, { label: 'staff test regrade', as: ADMIN, body: {} });
    await call('GET', `${o()}/my/tests`, { label: 'staff without membership', as: STAFF });
    await call('GET', `${o()}/my/attempts`, { label: 'staff without membership', as: STAFF });
    await call('POST', `${o()}/my/attempts`, { label: 'staff without membership cannot start', as: STAFF, body: { assessment_id: S.placement }, expect: 403 });
  });

  await area('training: tracks and lessons', async () => {
    const tracks = await call('GET', `${o()}/tracks`, { as: EMP1 });
    eq('every job-role track', tracks.body?.tracks?.length, TRACKS.length);
    eq('recommended', tracks.body?.recommended, 'hospitality');
    const track = TRACKS.find((entry) => entry.code === 'hospitality')!;
    const detail = await call('GET', `${o()}/tracks/hospitality`, { as: EMP1 });
    eq('lessons', detail.body?.lessons?.length, track.lessons.length);
    await call('GET', `${o()}/tracks/nope`, { label: 'unknown track', as: EMP1, expect: 404 });
    const lesson = track.lessons[0], second = track.lessons[1];
    S.lesson = lesson.code;
    const pilot = await call('GET', `orgs/${S.otherOrg}/learn/${lesson.code}`, { label: 'a pilot includes tests only', as: OTHER_OWNER, expect: 402 });
    eq('pilot reason', pilot.body?.reason, 'pilot');
    const noSeat = await call('GET', `${o()}/learn/${lesson.code}`, { label: 'no seat', as: ADMIN, expect: 402 });
    eq('no seat reason', noSeat.body?.reason, 'no_seat');
    const opened = await call('GET', `${o()}/learn/${lesson.code}`, { as: EMP1 });
    ok('no answers in the lesson', !JSON.stringify(opened.body?.lesson?.exercises).includes('"answer"'));
    eq('no progress', opened.body?.progress, null);
    await call('GET', `${o()}/learn/nope`, { label: 'unknown lesson', as: EMP1, expect: 404 });
    eq('started', (await call('POST', `${o()}/learn/${lesson.code}/start`, { as: EMP1, body: { step: 'words' } })).body?.step, 'words');
    await call('POST', `${o()}/learn/${lesson.code}/start`, { label: 'start again keeps the row', as: EMP1, body: { step: 'dialogue' } });
    await eqSql('step stored', `select status||'|'||(data->>'step') from company_lesson_progress where member_id='${S.emp1Member}' and lesson_code='${lesson.code}'`, 'started|dialogue');
    const passed = await call('POST', `${o()}/learn/${lesson.code}/check`, { as: EMP1, body: { answers: lessonAnswers(lesson), minutes: 12 } });
    eq('passed', [passed.body?.passed, passed.body?.first_completion, passed.body?.score], [true, true, 100]);
    await eqSql('completed row', `select status||'|'||score||'|'||attempts||'|'||minutes||'|'||(completed_at is not null) from company_lesson_progress where member_id='${S.emp1Member}' and lesson_code='${lesson.code}'`, 'completed|100|1|12|true');
    const retake = await call('POST', `${o()}/learn/${lesson.code}/check`, { label: 'worse retake keeps the best', as: EMP1, body: { answers: {}, minutes: 1 } });
    eq('best', retake.body?.best, 100);
    const failed = await call('POST', `${o()}/learn/${second.code}/check`, { label: 'check without start, failing', as: EMP1, body: { answers: {}, minutes: 500 } });
    eq('not passed', [failed.body?.passed, failed.body?.status], [false, 'started']);
    await eqSql('minutes clamped', `select minutes from company_lesson_progress where member_id='${S.emp1Member}' and lesson_code='${second.code}'`, '60');
    await eqSql('one lesson completed', `select count(*) from company_activity where member_id='${S.emp1Member}' and kind='lesson'`, '1');
    await eqSql('other checks are retries', `select count(*) from company_activity where member_id='${S.emp1Member}' and kind='lesson_retry'`, '2');
    await call('POST', `${o()}/learn/${lesson.code}/check`, { label: 'staff cannot learn', as: STAFF, body: { answers: {} }, expect: 403 });
    await call('GET', `${o()}/tracks`, { label: 'staff browses', as: STAFF });
    await call('GET', `${o()}/learn/${lesson.code}`, { label: 'staff browses', as: STAFF });
  });

  await area('training: role-play', async () => {
    const scenario = TRACKS.find((entry) => entry.code === 'hospitality')!.scenarios[0];
    await call('GET', `${o()}/roleplay`, { as: EMP1 });
    await call('POST', `${o()}/roleplay`, { label: 'unknown scenario', as: EMP1, body: { scenario: 'nope' }, expect: 404 });
    const created = await call('POST', `${o()}/roleplay`, { as: EMP1, body: { scenario: scenario.code, locale: 'ru' } });
    const id = need(created.body?.session?.id, 'role-play session');
    S.roleplay = id;
    eq('AI opens', created.body?.session?.turns?.length, 1);
    await call('GET', `${o()}/roleplay/${id}`, { as: EMP1 });
    await call('GET', `${o()}/roleplay/${id}`, { label: "someone else's", as: EMP2, expect: 404 });
    const turn = await call('POST', `${o()}/roleplay/${id}/turn`, { as: EMP1, body: { text: 'Good morning, how may I help you?', mode: 'voice', locale: 'ru' } });
    eq('turn ok', [turn.body?.status, turn.body?.session?.learner_turns], ['ok', 1]);
    await eqSql('turns stored', `select jsonb_array_length(turns)||'|'||learner_turns from company_roleplay_sessions where id='${id}'`, '3|1');
    await call('POST', `${o()}/roleplay/${id}/turn`, { label: 'empty', as: EMP1, body: { text: '' }, expect: 400 });
    aiMode = 'failed';
    const down = await call('POST', `${o()}/roleplay/${id}/turn`, { label: 'AI down keeps the session', as: EMP1, body: { text: 'Hello?' }, allowLog: /company_roleplay/ });
    eq('down', down.body?.status, 'ai_unavailable');
    const noFeedback = await call('POST', `${o()}/roleplay/${id}/finish`, { label: 'AI down on finish', as: EMP1, body: {}, allowLog: /company_roleplay/ });
    eq('down on finish', noFeedback.body?.status, 'ai_unavailable');
    aiMode = 'ok';
    await eqSql('ended without feedback', `select status||'|'||(feedback is null) from company_roleplay_sessions where id='${id}'`, 'ended|true');
    const finished = await call('POST', `${o()}/roleplay/${id}/finish`, { label: 'finish retries feedback', as: EMP1, body: { locale: 'en' } });
    eq('feedback', [finished.body?.status, finished.body?.session?.score], ['ok', 72]);
    await eqSql('score stored', `select score||'|'||(feedback->>'goal_met')||'|'||locale from company_roleplay_sessions where id='${id}'`, '72|true|en');
    await eqSql('activity once', `select count(*) from company_activity where member_id='${S.emp1Member}' and kind='roleplay'`, '1');
    await call('POST', `${o()}/roleplay/${id}/finish`, { label: 'finish twice', as: EMP1, body: {} });
    await call('POST', `${o()}/roleplay/${id}/turn`, { label: 'turn after the end', as: EMP1, body: { text: 'Hello' }, expect: 409 });
    const empty = await call('POST', `${o()}/roleplay`, { as: EMP2, body: { scenario: scenario.code } });
    eq('no turns', (await call('POST', `${o()}/roleplay/${empty.body?.session?.id}/finish`, { as: EMP2, body: {} })).body?.status, 'no_turns');
    await sql(`update company_roleplay_sessions set learner_turns = 12 where id='${empty.body?.session?.id}'`);
    const purge = await db.rpc('company_purge_training_drafts');
    eq('purge runs', purge.error, null);

    // The daily AI cap.
    await call('PATCH', `staff/orgs/${S.org}`, { as: STAFF, body: { ai_daily_limit: 0 } });
    const capped = await call('POST', `${o()}/roleplay`, { as: EMP2, body: { scenario: scenario.code } });
    eq('cap', (await call('POST', `${o()}/roleplay/${capped.body?.session?.id}/turn`, { label: 'over the AI cap', as: EMP2, body: { text: 'Hello there' } })).body?.status, 'ai_limit');
    const start = await call('POST', `public/t/${need(S.testToken, 'test link')}/start`, { body: { name: 'Capped Candidate', email: 'capped@example.uz', consent: true }, ip: '192.0.2.60' });
    const pending = await walk(start.body?.attempt, (next) => call('POST', 'public/attempts/next', { label: 'grading over the cap', body: { key: start.body?.key, answers: next } }));
    eq('pending on the cap', pending?.status, 'submitted');
    await eqSql('reason', `select ai_feedback->>'reason' from company_attempts where id='${start.body?.attempt?.id}'`, 'ai_limit');
    await call('PATCH', `staff/orgs/${S.org}`, { as: STAFF, body: { ai_daily_limit: null } });
    await eqSql('cap removed', `select settings ? 'ai_daily_limit' from company_orgs where id='${S.org}'`, 'f');
  });

  await area('training: writing checker', async () => {
    const template = TRACKS.find((entry) => entry.code === 'hospitality')!.templates[0];
    const page = await call('GET', `${o()}/writing`, { as: EMP1 });
    eq('retention', page.body?.retention_days, 90);
    await call('POST', `${o()}/writing/check`, { label: 'too short', as: EMP1, body: { text: 'short' }, expect: 400 });
    await call('POST', `${o()}/writing/check`, { label: 'unknown task', as: EMP1, body: { text: WRITING, template: 'nope' }, expect: 404 });
    const checked = await call('POST', `${o()}/writing/check`, { as: EMP1, body: { text: WRITING, template: template.code, locale: 'uz' } });
    eq('checked', [checked.body?.status, checked.body?.check?.score], ['ok', 75]);
    const id = need(checked.body?.check?.id, 'writing check');
    const free = await call('POST', `${o()}/writing/check`, { label: 'no template', as: EMP1, body: { text: WRITING } });
    eq('free check', free.body?.check?.template_code, null);
    await eqSql('stored', `select score||'|'||locale||'|'||template_code||'|'||(result->>'corrected' is not null) from company_writing_checks where id='${id}'`, `75|uz|${template.code}|true`);
    await call('GET', `${o()}/writing/${id}`, { as: EMP1 });
    await call('GET', `${o()}/writing/${id}`, { label: "someone else's", as: EMP2, expect: 404 });
    await call('DELETE', `${o()}/writing/${id}`, { label: "someone else's", as: EMP2, expect: 404 });
    await call('DELETE', `${o()}/writing/${id}`, { as: EMP1 });
    await call('GET', `${o()}/writing/${id}`, { label: 'deleted', as: EMP1, expect: 404 });
    await sql(`update company_writing_checks set created_at = now() - interval '91 days' where id='${free.body?.check?.id}'`);
    await call('POST', `${o()}/writing/check`, { label: 'a new check purges old ones', as: EMP1, body: { text: WRITING } });
    await eqSql('purged', `select count(*) from company_writing_checks where id='${free.body?.check?.id}'`, '0');
    await eqSql('writing activity', `select count(*) from company_activity where member_id='${S.emp1Member}' and kind='writing'`, '3');
  });

  await area('training: glossary', async () => {
    const added = await call('POST', `${o()}/glossary`, { as: ADMIN, body: { term: 'Check-in', meaning: 'Arrival at the hotel', ru: 'Заезд', uz: 'Kirish', example: 'Check-in is at two.', department_id: S.deptFront } });
    const id = need(added.body?.term?.id, 'term');
    S.term = id;
    await call('POST', `${o()}/glossary`, { label: 'duplicate', as: ADMIN, body: { term: 'CHECK-IN', meaning: 'Again' }, expect: 409 });
    await call('POST', `${o()}/glossary`, { label: 'employee', as: EMP1, body: { term: 'X', meaning: 'Y' }, expect: 403 });
    await call('POST', `${o()}/glossary`, { label: 'foreign department', as: ADMIN, body: { term: 'X', meaning: 'Y', department_id: '00000000-0000-4000-8000-00000000ffff' }, expect: 400 });
    const patched = await call('PATCH', `${o()}/glossary/${id}`, { as: ADMIN, body: { meaning: 'Arriving at the hotel', example: null } });
    eq('patched', patched.body?.term?.meaning, 'Arriving at the hotel');
    const extra = await call('POST', `${o()}/glossary`, { as: ADMIN, body: { term: 'Folio', meaning: 'Guest bill' } });
    await call('PATCH', `${o()}/glossary/${id}`, { label: 'rename onto another', as: ADMIN, body: { term: 'folio' }, expect: 409 });
    const csv = 'term;meaning;ru;uz;example;department\nFolio;Guest bill updated;;;;\nConcierge;Guest helper;Консьерж;;;Front Office\nBad Dept;Meaning;;;;Nowhere\n;No term;;;;\nLate checkout;Leaving later;;;;';
    const imported = await call('POST', `${o()}/glossary/import`, { as: ADMIN, body: { csv } });
    eq('import counts', [imported.body?.added, imported.body?.updated, imported.body?.skipped?.length], [2, 1, 2]);
    await eqSql('department by name', `select (department_id='${S.deptFront}') from company_glossary_terms where term='Concierge'`, 't');
    await call('POST', `${o()}/glossary/import`, { label: 'empty', as: ADMIN, body: { csv: ' ' }, expect: 400 });
    const seenBySales = await call('GET', `${o()}/glossary`, { as: EMP4 });
    ok('department terms hidden from others', !seenBySales.body?.terms?.some((row: any) => row.id === id), seenBySales.body?.terms);
    eq('employees cannot manage', seenBySales.body?.can_manage, false);
    await call('GET', `${o()}/glossary`, { as: EMP1 });
    eq('cards', (await call('POST', `${o()}/glossary/practice`, { as: EMP1, body: { mode: 'cards', seen: 10, known: 7, minutes: 5 } })).body?.correct, 7);
    const quiz = await call('POST', `${o()}/glossary/practice`, { as: EMP1, body: { mode: 'quiz', answers: [{ term: id, choice: id }, { term: extra.body?.term?.id, choice: id }, { term: 'not-a-term', choice: id }], minutes: 2 } });
    eq('quiz', [quiz.body?.correct, quiz.body?.total], [1, 2]);
    await call('POST', `${o()}/glossary/practice`, { label: 'no answers', as: EMP1, body: { mode: 'quiz', answers: [] }, expect: 400 });
    await eqSql('glossary activity', `select count(*) from company_activity where member_id='${S.emp1Member}' and kind='glossary'`, '2');
    await call('DELETE', `${o()}/glossary/${extra.body?.term?.id}`, { as: ADMIN });
    await call('DELETE', `${o()}/glossary/${extra.body?.term?.id}`, { label: 'already gone', as: ADMIN, expect: 404 });
  });

  await area('training: assignments and my home', async () => {
    await call('POST', `${o()}/assignments`, { label: 'empty', as: ADMIN, body: { scope: 'all' }, expect: 400 });
    await call('POST', `${o()}/assignments`, { label: 'past due', as: ADMIN, body: { scope: 'all', track_code: 'general', due_date: '2020-01-01' }, expect: 400 });
    await call('POST', `${o()}/assignments`, { label: 'employee', as: EMP1, body: { scope: 'all', track_code: 'general' }, expect: 403 });
    const all = await call('POST', `${o()}/assignments`, { as: ADMIN, body: { scope: 'all', track_code: 'general', target_level: 'b1', due_date: '2030-01-01', note: 'Everyone.' } });
    const id = need(all.body?.assignments?.[0]?.id, 'assignment');
    S.assignment = id;
    const depts = await call('POST', `${o()}/assignments`, { as: ADMIN, body: { scope: 'departments', department_ids: [S.deptFront, S.deptSales], track_code: 'hospitality' } });
    eq('one per department', depts.body?.created, 2);
    const people = await call('POST', `${o()}/assignments`, { as: ADMIN, body: { scope: 'people', member_ids: [S.emp1Member], target_level: 'c1', due_date: '2030-02-01' } });
    eq('person', people.body?.created, 1);
    await call('POST', `${o()}/assignments`, { label: 'foreign person', as: ADMIN, body: { scope: 'people', member_ids: ['00000000-0000-4000-8000-00000000ffff'], track_code: 'sales' }, expect: 400 });
    const list = await call('GET', `${o()}/assignments`, { as: ADMIN });
    ok('listed', (list.body?.assignments?.length ?? 0) >= 4, list.body?.assignments?.length);
    await call('GET', `${o()}/assignments`, { label: 'manager', as: MANAGER });
    await call('GET', `${o()}/assignments`, { label: 'employee', as: EMP1, expect: 403 });
    await call('GET', `${o()}/assignments/${id}`, { as: ADMIN });
    await call('GET', `${o()}/assignments/${id}`, { label: 'manager', as: MANAGER });
    const patched = await call('PATCH', `${o()}/assignments/${people.body?.assignments?.[0]?.id}`, { as: ADMIN, body: { status: 'done', due_date: null, note: 'Finished.' } });
    eq('patched', patched.body?.assignment?.status, 'done');
    await call('PATCH', `${o()}/assignments/${id}`, { label: 'bad status', as: ADMIN, body: { status: 'nope' }, expect: 400 });
    const home = await call('GET', `${o()}/my/home`, { as: EMP1 });
    ok('home level', home.body?.member?.level, home.body?.member);
    ok('home assignments', (home.body?.assignments?.length ?? 0) >= 2, home.body?.assignments);
    ok('home minutes', home.body?.week?.minutes > 0, home.body?.week);
    eq('home has seven days', home.body?.week?.days?.length, 7);
    ok('home day minutes', home.body?.week?.days?.some((day: any) => day.minutes > 0), home.body?.week?.days);
    eq('home english link', home.body?.english_url, 'https://english.schood.online');
    ok('home certificates', home.body?.certificates?.length >= 1, home.body?.certificates);
    ok('home totals', home.body?.totals?.roleplays >= 1 && home.body?.totals?.writing >= 1, home.body?.totals);
    await call('GET', `${o()}/my/home`, { label: 'staff without membership', as: STAFF, expect: 403 });

    // A company-wide assignment counts among a manager's overdue ones.
    await sql(`update company_assignments set due_date='2020-01-01' where id='${id}'`);
    const overdue = await call('GET', `${o()}/insights/overview`, { label: 'manager with a company-wide assignment overdue', as: MANAGER });
    ok('manager sees it overdue', overdue.body?.todo?.some((row: any) => row.kind === 'overdue_assignments'), overdue.body?.todo);
    await sql(`update company_assignments set due_date='2030-01-01' where id='${id}'`);
  });

  await area('activity: every kind, and the daily cap on minutes people report', async () => {
    // The kinds the catalogue names are the kinds the table takes.
    for (const kind of ACTIVITY_KINDS) await sql(`begin; insert into company_activity (org_id, kind) values ('${S.org}', '${kind}'); rollback;`);
    const beyond = await run('docker', ['exec', '-i', DB, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q', '-c', `insert into company_activity (org_id, kind) values ('${S.org}', 'nonsense')`]);
    ok('a kind outside the list is refused', beyond.code !== 0, beyond.out);

    const lesson = TRACKS.find((entry) => entry.code === 'sales')!.lessons[0].code;
    const claimed = `select coalesce(sum(minutes),0) from company_activity where member_id='${S.emp4Member}' and kind in ('lesson_retry','glossary')`;
    for (let click = 0; click < 4; click++) await call('POST', `${o()}/learn/${lesson}/check`, { label: 'clicking Check for minutes', as: EMP4, body: { answers: {}, minutes: 60 } });
    await eqSql('stops at the daily cap', claimed, String(DAILY_SELF_REPORTED_MINUTES));
    await call('POST', `${o()}/glossary/practice`, { label: 'practice for minutes', as: EMP4, body: { mode: 'cards', seen: 3, known: 1, minutes: 30 } });
    await eqSql('glossary shares the cap', claimed, String(DAILY_SELF_REPORTED_MINUTES));
    await eqSql('the clicks still count as events', `select count(*) from company_activity where member_id='${S.emp4Member}' and kind='lesson_retry'`, '4');
    await sql(`update company_activity set created_at = created_at - interval '2 days' where member_id='${S.emp4Member}' and kind in ('lesson_retry','glossary')`);
    await call('POST', `${o()}/learn/${lesson}/check`, { label: 'a new day', as: EMP4, body: { answers: {}, minutes: 10 } });
    await eqSql('a new day has its own allowance', `select minutes from company_activity where member_id='${S.emp4Member}' and kind='lesson_retry' order by id desc limit 1`, '10');
  });

  await area('insights: overview, people, profiles', async () => {
    const overview = await call('GET', `${o()}/insights/overview`, { as: ADMIN });
    ok('overview', overview.body && typeof overview.body === 'object', overview.body);
    await call('GET', `${o()}/insights/overview`, { label: 'manager', as: MANAGER });
    await call('GET', `${o()}/insights/overview`, { label: 'employee', as: EMP1, expect: 403 });
    await call('GET', `${o()}/insights/overview`, { label: 'staff', as: STAFF });
    await call('GET', `${o()}/insights/people`, { as: ADMIN });
    await call('GET', `${o()}/insights/people`, { label: 'manager', as: MANAGER });
    await call('GET', `${o()}/insights/people`, { label: 'employee', as: EMP1, expect: 403 });

    // The seeded activity is from before this person joined and agreed, so the company does not see it.
    const before = await call('GET', `${o()}/members/${S.emp1Member}/profile`, { label: 'only their earlier activity so far', as: ADMIN });
    eq('earlier activity is not shown', [before.body?.english?.activities, before.body?.english?.badges, before.body?.english?.reviews, before.body?.english?.level], [0, 0, 0, 'b1']);
    ok('their own targets stay private', before.body?.english && !('target' in before.body.english) && !('daily_goal_minutes' in before.body.english), before.body?.english);
    await sql(`
      insert into public.learning_attempts (user_id, language_id, product_id, content_item_id, service_key, status, time_spent_seconds, correctness_ratio, overall_score, submitted_at)
        values ('${EMP1}', '20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000003', 'grammar', 'scored', 600, 0.8, 0.8, now() + interval '1 minute');
      insert into public.learner_review_answer_log (user_id, language_id, review_item_id, correct, answered_at) values ('${EMP1}', '20000000-0000-4000-8000-000000000001', gen_random_uuid(), true, now() + interval '1 minute');
      insert into public.learner_badges (user_id, language_id, badge_key, earned_at) values ('${EMP1}', '20000000-0000-4000-8000-000000000001', 'second_step', now() + interval '1 minute');
    `);
    const shared = await call('GET', `${o()}/members/${S.emp1Member}/profile`, { as: ADMIN });
    eq('with consent', shared.body?.detail, true);
    ok('English summary read', shared.body?.english?.activities === 1 && shared.body?.english?.badges === 1 && shared.body?.english?.reviews === 1 && shared.body?.english?.level === 'b1', shared.body?.english);
    await call('GET', `${o()}/members/${S.emp1Member}/profile`, { label: 'self', as: EMP1 });
    await call('GET', `${o()}/members/${S.emp1Member}/profile`, { label: 'manager of the department', as: MANAGER });
    await call('GET', `${o()}/members/${S.adminMember}/profile`, { label: 'employee on someone else', as: EMP1, expect: [403, 404] });
    await call('GET', `${o()}/members/not-a-uuid/profile`, { label: 'malformed member', as: ADMIN, expect: 404 });

    await sql(`update company_members set consent_at = null where id='${S.emp2Member}'`);
    const hidden = await call('GET', `${o()}/members/${S.emp2Member}/profile`, { label: 'without consent', as: ADMIN });
    eq('no consent, no detail', hidden.body?.detail, false);
    eq('no consent, no learning', hidden.body?.learning ?? null, null);
    eq('no consent, no English', hidden.body?.english ?? null, null);
    const self = await call('GET', `${o()}/members/${S.emp2Member}/profile`, { label: 'self without consent', as: EMP2 });
    eq('self still sees theirs', self.body?.detail, true);
    const consent = await call('POST', `${o()}/consent`, { as: EMP2 });
    ok('consent recorded', consent.body?.consent_at, consent.body);
    await eqSql('consent stored', `select consent_at is not null from company_members where id='${S.emp2Member}'`, 't');
    await call('POST', `${o()}/consent`, { label: 'staff are not members', as: STAFF, expect: 403 });
  });

  await area('insights: reports, exports, summary, seats request', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const monthly = await call('GET', `${o()}/reports/monthly`, { as: ADMIN });
    ok('monthly', monthly.body?.summary, monthly.body);
    await call('GET', `${o()}/reports/monthly?from=2026-01-01&to=${today}`, { label: 'range', as: ADMIN });
    await call('GET', `${o()}/reports/monthly`, { label: 'manager', as: MANAGER });
    await call('GET', `${o()}/reports/monthly`, { label: 'employee', as: EMP1, expect: 403 });
    await call('GET', `${o()}/reports/monthly?from=nope`, { label: 'bad date', as: ADMIN, expect: 400 });
    await call('GET', `${o()}/reports/monthly?from=2026-02-02&to=2026-01-01`, { label: 'reversed', as: ADMIN, expect: 400 });
    for (const kind of ['people', 'attempts', 'activity']) {
      const result = await call('GET', `${o()}/reports/export?kind=${kind}&from=2026-01-01&to=${today}`, { as: ADMIN });
      ok(`${kind} CSV has rows`, result.body?.rows > 0 && String(result.body?.csv).length > 0, result.body);
      await call('GET', `${o()}/reports/export?kind=${kind}`, { label: 'manager', as: MANAGER });
    }
    await call('GET', `${o()}/reports/export?kind=nope`, { label: 'bad kind', as: ADMIN, expect: 400 });
    const summary = await call('POST', `${o()}/reports/summary`, { as: ADMIN, body: { locale: 'ru' } });
    eq('summary', [summary.body?.status, summary.body?.summary?.headline], ['ok', 'Steady month']);
    aiMode = 'failed';
    eq('summary with AI down', (await call('POST', `${o()}/reports/summary`, { label: 'AI down', as: ADMIN, body: {} })).body?.status, 'unavailable');
    aiMode = 'ok';
    const seats = await call('POST', `${o()}/insights/seats-request`, { as: ADMIN, body: { seats: 25, message: 'We need more.', phone: '+998901112233' } });
    eq('first request', seats.body?.duplicate, false);
    eq('second request', (await call('POST', `${o()}/insights/seats-request`, { label: 'again the same day', as: ADMIN, body: {} })).body?.duplicate, true);
    await eqSql('in the pipeline', `select status||'|'||(org_id='${S.org}') from company_leads where source='seats_request' or need like 'Learning seats%'`, 'new|true');
    await call('POST', `${o()}/insights/seats-request`, { label: 'manager', as: MANAGER, body: {}, expect: 403 });
  });

  await area('insights: challenges', async () => {
    const shift = (days: number) => new Date(Date.now() + days * 86_400_000 + 5 * 3_600_000).toISOString().slice(0, 10);
    const running = await call('POST', `${o()}/challenges`, { as: ADMIN, body: { title: 'November sprint', description: 'Most minutes wins.', metric: 'minutes', starts_on: shift(-3), ends_on: shift(10) } });
    const id = need(running.body?.challenge?.id, 'challenge');
    S.challenge = id;
    eq('running', running.body?.challenge?.status, 'running');
    const department = await call('POST', `${o()}/challenges`, { as: ADMIN, body: { title: 'Front office only', metric: 'lessons', starts_on: shift(-1), ends_on: shift(5), department_ids: [S.deptFront] } });
    const later = await call('POST', `${o()}/challenges`, { as: ADMIN, body: { title: 'Next month', metric: 'points', starts_on: shift(20), ends_on: shift(40) } });
    eq('upcoming', later.body?.challenge?.status, 'upcoming');
    await call('POST', `${o()}/challenges`, { label: 'too long', as: ADMIN, body: { title: 'Forever', starts_on: shift(1), ends_on: shift(200) }, expect: 400 });
    await call('POST', `${o()}/challenges`, { label: 'reversed', as: ADMIN, body: { title: 'Backwards', starts_on: shift(5), ends_on: shift(1) }, expect: 400 });
    await call('POST', `${o()}/challenges`, { label: 'longest allowed', as: ADMIN, body: { title: 'Ninety-two days', starts_on: shift(1), ends_on: shift(92) } });
    await call('POST', `${o()}/challenges`, { label: 'foreign department', as: ADMIN, body: { title: 'Foreign', starts_on: shift(1), ends_on: shift(2), department_ids: ['00000000-0000-4000-8000-00000000ffff'] }, expect: 400 });
    await call('POST', `${o()}/challenges`, { label: 'employee', as: EMP1, body: { title: 'Mine', starts_on: shift(1), ends_on: shift(2) }, expect: 403 });
    const list = await call('GET', `${o()}/challenges`, { as: EMP1 });
    ok('challenges listed', list.body?.challenges?.length >= 3, list.body?.challenges);
    ok('sales cannot see the front office one', !(await call('GET', `${o()}/challenges`, { as: EMP4 })).body?.challenges?.some((row: any) => row.id === department.body?.challenge?.id));
    const standings = await call('GET', `${o()}/challenges/${id}`, { as: EMP1 });
    ok('standings', standings.body && JSON.stringify(standings.body).includes('rank'), standings.body);
    await call('GET', `${o()}/challenges/${id}`, { label: 'HR', as: ADMIN });
    await call('GET', `${o()}/challenges/${department.body?.challenge?.id}`, { label: 'department standings', as: EMP1 });
    await call('GET', `${o()}/challenges/${department.body?.challenge?.id}`, { label: 'not their department', as: EMP4, expect: [403, 404] });
    await call('PATCH', `${o()}/challenges/${id}`, { as: ADMIN, body: { title: 'November sprint!', description: 'Minutes.' } });
    await call('PATCH', `${o()}/challenges/${id}`, { label: 'metric once running', as: ADMIN, body: { metric: 'points' }, expect: 409 });
    await call('PATCH', `${o()}/challenges/${later.body?.challenge?.id}`, { label: 'upcoming may change', as: ADMIN, body: { metric: 'minutes', starts_on: shift(21), ends_on: shift(41), department_ids: [S.deptSales] } });
    const ended = await call('POST', `${o()}/challenges/${id}/end`, { as: ADMIN });
    eq('ended', ended.body?.challenge?.status, 'finished');
    await call('GET', `${o()}/challenges/${id}`, { label: 'standings of a finished one', as: EMP1 });
    await call('PATCH', `${o()}/challenges/${id}`, { label: 'finished', as: ADMIN, body: { metric: 'points' }, expect: 409 });
    await call('DELETE', `${o()}/challenges/${later.body?.challenge?.id}`, { as: ADMIN });
    await call('GET', `${o()}/challenges/${later.body?.challenge?.id}`, { label: 'deleted', as: ADMIN, expect: 404 });
  });

  await area('insights: live sessions and attendance', async () => {
    const at = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();
    const past = await call('POST', `${o()}/sessions`, { as: ADMIN, body: { title: 'Grammar class', kind: 'class', trainer: 'Ms Kim', starts_at: at(-3), duration_minutes: 60, location: 'Room 2', link: 'https://meet.example.uz/abc', notes: 'Bring notes.' } });
    const id = need(past.body?.session?.id, 'session');
    S.session = id;
    const future = await call('POST', `${o()}/sessions`, { as: ADMIN, body: { title: 'Sales workshop', kind: 'workshop', starts_at: at(48), department_ids: [S.deptSales], member_ids: [S.emp1Member] } });
    await call('POST', `${o()}/sessions`, { label: 'http link', as: ADMIN, body: { title: 'Bad', starts_at: at(1), link: 'http://x.example' }, expect: 400 });
    await call('POST', `${o()}/sessions`, { label: 'foreign department', as: ADMIN, body: { title: 'Bad', starts_at: at(1), department_ids: ['00000000-0000-4000-8000-00000000ffff'] }, expect: 400 });
    await call('POST', `${o()}/sessions`, { label: 'employee', as: EMP1, body: { title: 'Mine', starts_at: at(1) }, expect: 403 });
    ok('upcoming list', (await call('GET', `${o()}/sessions`, { as: EMP1 })).body?.sessions?.some((row: any) => row.id === future.body?.session?.id));
    const pastList = await call('GET', `${o()}/sessions?when=past`, { as: ADMIN });
    ok('past list', pastList.body?.sessions?.some((row: any) => row.id === id), pastList.body?.sessions);
    await call('GET', `${o()}/sessions?when=past`, { label: 'manager', as: MANAGER });
    await call('GET', `${o()}/sessions?when=past`, { label: 'employee', as: EMP1 });
    await call('GET', `${o()}/sessions?when=nope`, { label: 'bad filter', as: ADMIN, expect: 400 });
    await call('PATCH', `${o()}/sessions/${future.body?.session?.id}`, { as: ADMIN, body: { title: 'Sales workshop II', trainer: null, starts_at: at(72), duration_minutes: 90, location: 'Hall', link: null, notes: 'x', kind: 'class', department_ids: [], member_ids: [S.emp2Member] } });
    await call('PATCH', `${o()}/sessions/${id}`, { label: 'no change', as: ADMIN, body: {} });
    await call('PUT', `${o()}/sessions/${future.body?.session?.id}/attendance`, { label: 'not started', as: ADMIN, body: { present: [] }, expect: 409 });
    const empty = await call('GET', `${o()}/sessions/${id}/attendance`, { as: ADMIN });
    eq('can mark', empty.body?.can_mark, true);
    const marked = await call('PUT', `${o()}/sessions/${id}/attendance`, { as: ADMIN, body: { present: [S.emp1Member, S.emp2Member] } });
    eq('marked', marked.body?.added, 2);
    await eqSql('attendance and activity', `select (select count(*) from company_session_attendance where session_id='${id}')||'|'||(select count(*) from company_activity where kind='session' and org_id='${S.org}')`, '2|2');
    await eqSql('activity minutes and points', `select distinct minutes||'|'||points from company_activity where kind='session' and org_id='${S.org}'`, '60|60');
    const unmark = await call('PUT', `${o()}/sessions/${id}/attendance`, { label: 'take one back', as: ADMIN, body: { present: [S.emp1Member] } });
    eq('removed', unmark.body?.removed, 1);
    await eqSql('activity taken back', `select count(*) from company_activity where kind='session' and org_id='${S.org}'`, '1');
    await call('PUT', `${o()}/sessions/${id}/attendance`, { label: 'stranger', as: ADMIN, body: { present: ['00000000-0000-4000-8000-00000000ffff'] }, expect: 400 });
    await call('GET', `${o()}/sessions/${id}/attendance`, { label: 'manager', as: MANAGER });
    await call('GET', `${o()}/sessions/${id}/attendance`, { label: 'employee', as: EMP1, expect: 403 });
    await call('POST', `${o()}/sessions/${id}/cancel`, { label: 'has attendance', as: ADMIN, expect: 409 });
    const cancelled = await call('POST', `${o()}/sessions/${future.body?.session?.id}/cancel`, { as: ADMIN });
    eq('cancelled', cancelled.body?.session?.status, 'cancelled');
    await call('POST', `${o()}/sessions/${future.body?.session?.id}/cancel`, { label: 'cancel twice', as: ADMIN });
    await call('PATCH', `${o()}/sessions/${future.body?.session?.id}`, { label: 'cancelled', as: ADMIN, body: { title: 'x y' }, expect: 409 });
    // Everything recorded should now show up in the numbers.
    const profile = await call('GET', `${o()}/members/${S.emp1Member}/profile`, { label: 'profile after activity', as: ADMIN });
    ok('profile lists attendance', JSON.stringify(profile.body).includes('Grammar class'), profile.body?.sessions);
    const direct = await db.rpc('company_activity_summary', { p_org: S.org, p_from: new Date(Date.now() - 86_400_000).toISOString(), p_to: new Date(Date.now() + 86_400_000).toISOString(), p_members: [S.emp1Member] });
    ok('activity summary has minutes', direct.data?.members?.[0]?.minutes > 0 && direct.data?.weeks?.length >= 1 && direct.data?.kinds?.lesson, direct.data ?? direct.error);
    const overview = await call('GET', `${o()}/insights/overview`, { label: 'overview after activity', as: ADMIN });
    ok('overview has learning numbers', JSON.stringify(overview.body).includes('minutes'), overview.body);
  });

  await area('deleting a department in use', async () => {
    const made = await call('POST', `${o()}/departments`, { as: ADMIN, body: { name: 'Closing Soon' } });
    const id = need(made.body?.department?.id, 'department');
    const person = await call('POST', `${o()}/invites`, { as: ADMIN, body: { full_name: 'Moved Person', department_id: id } });
    await call('POST', `${o()}/assignments`, { as: ADMIN, body: { scope: 'departments', department_ids: [id], track_code: 'sales' } });
    await call('POST', `${o()}/glossary`, { as: ADMIN, body: { term: 'Closing term', meaning: 'A term', department_id: id } });
    const gone = await call('DELETE', `${o()}/departments/${id}`, { as: ADMIN });
    eq('moved', gone.body?.moved, 1);
    await eqSql('person kept, no department', `select status||'|'||(department_id is null) from company_members where id='${person.body?.member?.id}'`, 'invited|true');
    await eqSql('term kept, company-wide', `select department_id is null from company_glossary_terms where term='Closing term'`, 't');
  });

  await area('input JavaScript accepts and Postgres refuses (must be 4xx, not 500)', async () => {
    const notServerError = (status: number) => status < 500;
    // Calendar dates that do not exist: JavaScript rolls them over, Postgres refuses them.
    const noDate = '2030-02-31';
    await call('PATCH', `${o()}/people/${S.emp1Member}`, { label: 'target_date that does not exist', as: ADMIN, body: { target_date: noDate }, expect: refused });
    await call('POST', `${o()}/invites`, { label: 'target_date that does not exist', as: ADMIN, body: { full_name: 'No Date', target_date: noDate }, expect: refused });
    await call('POST', `${o()}/assignments`, { label: 'due_date that does not exist', as: ADMIN, body: { scope: 'all', track_code: 'sales', due_date: noDate }, expect: refused });
    await call('PATCH', `${o()}/assignments/${S.assignment}`, { label: 'due_date that does not exist', as: ADMIN, body: { due_date: noDate }, expect: refused });
    await call('PATCH', `staff/leads/${S.lead}`, { label: 'follow_up_at that does not exist', as: STAFF, body: { follow_up_at: noDate }, expect: refused });
    await call('PATCH', `staff/orgs/${S.org}`, { label: 'contract date that does not exist', as: STAFF, body: { contract_ends_at: noDate }, expect: refused });
    await call('PATCH', `staff/orgs/${S.org}`, { as: STAFF, body: { contract_ends_at: '2030-12-31' } });
    await call('POST', `${o()}/challenges`, { label: 'challenge date that does not exist', as: ADMIN, body: { title: 'No date', starts_on: noDate, ends_on: '2030-03-05' }, expect: refused });
    await call('GET', `${o()}/reports/monthly?from=2026-02-31`, { label: 'report date that does not exist', as: ADMIN, expect: notServerError });
    // A date outside what Postgres can read.
    await call('POST', `${o()}/assessments`, { label: 'closes_at far in the future', as: ADMIN, body: { title: 'Far future', closes_at: '+100000-01-01T00:00:00Z' }, expect: refused });
    // NUL characters: valid JSON, refused by every Postgres text and jsonb column.
    const nul = 'A\u0000B name';
    await call('POST', 'public/leads', { label: 'NUL in a public form', body: { name: nul, company: 'Nul Co', phone: '+998901234567' }, ip: '203.0.113.90', expect: 400 });
    await call('POST', `${o()}/departments`, { label: 'NUL in a name', as: ADMIN, body: { name: nul }, expect: 400 });
    await call('POST', `${o()}/departments`, { label: 'a lone surrogate in a name', as: ADMIN, body: { name: 'Bad \ud83d name' }, expect: 400 });
    await call('POST', `${o()}/writing/check`, { label: 'NUL in a draft', as: EMP1, body: { text: `${WRITING} ${nul}` }, expect: 400 });
    await call('POST', `${o()}/assessments`, { label: 'year zero', as: ADMIN, body: { title: 'Year zero', closes_at: '0000-01-01T00:00:00Z' }, expect: 400 });
    await call('GET', `${o()}/reports/monthly?from=0000-01-01&to=0000-02-01`, { label: 'report in year zero', as: ADMIN, expect: 400 });
    await call('PATCH', `${o()}/assignments/${S.assignment}`, { label: 'due date in year zero', as: ADMIN, body: { due_date: '0000-01-01' }, expect: 400 });
    const writing = await call('POST', `${o()}/assessments`, { as: ADMIN, body: { title: 'Writing only', skills: ['writing'] } });
    const started = await call('POST', `public/t/${tokenOf(writing.body?.link)}/start`, { body: { name: 'Nul Candidate', email: 'nul@example.uz', consent: true }, ip: '192.0.2.70' });
    const taskId = need(started.body?.attempt?.section?.tasks?.[0]?.id, 'writing task');
    await call('POST', 'public/attempts/save', { label: "NUL in a candidate's answer", body: { key: started.body?.key, answers: { [taskId]: nul } } });
    await eqSql('the answer is kept without it', `select value from company_attempts, jsonb_each_text(answers) where id='${started.body?.attempt?.id}'`, 'AB name');
    await eqSql('stored by bank id, not the id the page uses', `select key <> '${taskId}' from company_attempts, jsonb_each_text(answers) where id='${started.body?.attempt?.id}'`, 't');
    await call('POST', 'public/attempts/save', { label: 'an answer cut through an emoji', body: { key: started.body?.key, answers: { [taskId]: `${'x'.repeat(5999)}\u{1F600}` } } });
    // A one-item list passes oneOf (it compares String(value)) and is then stored as it came.
    await call('POST', 'orgs', { label: 'a list where one value belongs (CHECK column)', as: EMP7, body: { name: 'List Size', size_band: ['1-50'] }, expect: refused });
    await call('PATCH', `${o()}/attempts/${S.attemptA}`, { label: 'a list where one value belongs (CHECK column)', as: ADMIN, body: { decision: ['hold'] }, expect: refused });
    const listed = await call('POST', 'orgs', { label: 'a list where one value belongs (free text column)', as: EMP7, body: { name: 'List Industry', industry: ['it'] }, expect: refused });
    if (listed.status === 200) ok('industry stored as sent', listed.body?.org?.industry === 'it', `stored: ${JSON.stringify(listed.body?.org?.industry)}`);
    // A web address that URL() makes longer than the column's 500 characters.
    await call('POST', `${o()}/sessions`, { label: 'link that grows when normalised', as: ADMIN, body: { title: 'Long link', starts_at: new Date(Date.now() + 3_600_000).toISOString(), link: `https://example.uz/${'é'.repeat(300)}` }, expect: refused });
    // A fractional limit reaches PostgREST.
    await call('GET', 'staff/audit?limit=1.5', { label: 'fractional limit', as: STAFF });

    // Someone who joined by team link without giving a name.
    const nameless = await call('POST', `join/${need(S.openLink, 'open link')}`, { label: 'join without a name', as: EMP8, body: { consent: true } });
    eq('joined', nameless.body?.state, 'joined');
    const taking = await call('POST', `${o()}/my/attempts`, { label: 'nameless member starts a test', as: EMP8, body: { assessment_id: S.placement } });
    const done = await call('POST', `${o()}/my/attempts/${need(taking.body?.attempt?.id, 'nameless attempt')}/submit`, { label: 'nameless member submits', as: EMP8, body: {} });
    const certificate = await call('GET', `public/v/${need(done.body?.attempt?.result?.certificate_code, 'nameless certificate')}`, { label: 'public certificate of a nameless member' });
    eq('public certificate has no name rather than an email address', certificate.body?.certificate?.name, null);
    // And one with a long account email (the column for the name allows 120 characters, an email 200).
    const long = await call('POST', `join/${S.openLink}`, { label: 'join without a name', as: EMP9, body: { consent: true } });
    eq('joined', long.body?.state, 'joined');
    await sql(`update company_members set email='${'a'.repeat(60)}@${'b'.repeat(80)}.example.uz' where org_id='${S.org}' and user_id='${EMP9}'`);
    await call('POST', `${o()}/my/attempts`, { label: 'nameless member with a 150-character email starts a test', as: EMP9, body: { assessment_id: S.placement } });
  });

  await area('role-play: all twelve turns', async () => {
    const scenario = TRACKS.find((entry) => entry.code === 'hospitality')!.scenarios[0];
    const created = await call('POST', `${o()}/roleplay`, { as: EMP3, body: { scenario: scenario.code } });
    const id = need(created.body?.session?.id, 'session');
    for (let turn = 1; turn <= 12; turn++) await call('POST', `${o()}/roleplay/${id}/turn`, { label: 'turns', as: EMP3, body: { text: `Turn number ${turn}, how may I help?` } });
    await call('POST', `${o()}/roleplay/${id}/turn`, { label: 'thirteenth turn', as: EMP3, body: { text: 'One more' }, expect: 409 });
    await eqSql('turns stored', `select jsonb_array_length(turns)||'|'||learner_turns from company_roleplay_sessions where id='${id}'`, '25|12');
    await call('POST', `${o()}/roleplay/${id}/finish`, { as: EMP3, body: {} });
  });

  await area('double clicks and races: same request twice at once', async () => {
    const noCrash = (status: number) => status < 500;
    const twice = <T>(work: () => Promise<T>) => Promise.all([work(), work()]);
    const track = TRACKS.find((entry) => entry.code === 'hospitality')!;
    // A conflict the route turns into its own answer is not a swallowed error.
    const handled = /23505/;
    const dept = await twice(() => call('POST', `${o()}/departments`, { label: 'same department twice', as: ADMIN, body: { name: 'Race Department' }, expect: [200, 409], allowDb: handled }));
    eq('one department', dept.map((reply) => reply.status).sort(), [200, 409]);
    const term = await twice(() => call('POST', `${o()}/glossary`, { label: 'same term twice', as: ADMIN, body: { term: 'Race term', meaning: 'A term' }, expect: [200, 409], allowDb: handled }));
    eq('one term', term.map((reply) => reply.status).sort(), [200, 409]);
    const person = await twice(() => call('POST', `${o()}/invites`, { label: 'same invitation twice', as: ADMIN, body: { full_name: 'Race Person', email: 'race.person@example.uz' }, expect: [200, 409], allowDb: handled }));
    eq('one invitation', person.map((reply) => reply.status).sort(), [200, 409]);
    await twice(() => call('POST', `${o()}/learn/${track.lessons[5].code}/start`, { label: 'opening a lesson twice', as: EMP3, body: { step: 'phrases' }, allowDb: handled }));
    await twice(() => call('POST', `${o()}/learn/${track.lessons[6].code}/check`, { label: 'checking a new lesson twice', as: EMP3, body: { answers: {}, minutes: 1 }, allowDb: handled }));
    await eqSql('both checks counted on one row', `select count(*) from company_lesson_progress where member_id='${S.emp3Member}' and lesson_code='${track.lessons[6].code}'`, '1');

    // Passing checks at once: one lesson, whether the row exists yet or was started first.
    const general = TRACKS.find((entry) => entry.code === 'general')!;
    for (const [lesson, started] of [[track.lessons[7], false], [general.lessons[0], true]] as const) {
      if (started) await call('POST', `${o()}/learn/${lesson.code}/start`, { as: EMP3, body: {} });
      const checks = await Promise.all([1, 2, 3, 4].map(() => call('POST', `${o()}/learn/${lesson.code}/check`, { label: 'passing checks at once', as: EMP3, body: { answers: lessonAnswers(lesson), minutes: 2 }, allowDb: handled })));
      eq('one first completion', checks.filter((reply) => reply.body?.first_completion).length, 1);
      await eqSql('one lesson logged', `select count(*) from company_activity where member_id='${S.emp3Member}' and kind='lesson' and ref='${lesson.code}'`, '1');
      await eqSql('the rest are retries', `select count(*) from company_activity where member_id='${S.emp3Member}' and kind='lesson_retry' and ref='${lesson.code}'`, '3');
      await eqSql('one completed row', `select string_agg(status, ',') from company_lesson_progress where member_id='${S.emp3Member}' and lesson_code='${lesson.code}'`, 'completed');
    }

    // Accepting a team link twice: both requests end joined, on one row, for one use.
    const link = await call('POST', `${o()}/invites`, { as: ADMIN, body: { kind: 'link', job_role: 'general' } });
    const accepted = await twice(() => call('POST', `join/${tokenOf(link.body?.link)}`, { label: 'accepting a team link twice', as: DOUBLE_JOINER, body: { consent: true }, allowDb: handled }));
    eq('both joined', accepted.map((reply) => reply.body?.state), ['joined', 'joined']);
    await eqSql('one membership', `select count(*) from company_members where org_id='${S.org}' and user_id='${DOUBLE_JOINER}'`, '1');
    await eqSql('one use', `select uses from company_invites where id='${link.body?.invite?.id}'`, '1');
    // The unique index itself, so the route's handling of its error code is tied to what PostgREST really says.
    const dupMember = await db.from('company_members').insert({ org_id: S.org, user_id: DOUBLE_JOINER, role: 'employee', status: 'active' });
    dbFailures.pop();
    eq('a second row for the person is refused as 23505', dupMember.error?.code, '23505');
    // The last use, pressed twice by one person.
    const lastUse = await call('POST', `${o()}/invites`, { as: ADMIN, body: { kind: 'link', job_role: 'general', max_uses: 1 } });
    const lastUsed = await twice(() => call('POST', `join/${tokenOf(lastUse.body?.link)}`, { label: 'the last use of a link, pressed twice', as: LAST_USE_JOINER, body: { consent: true }, allowDb: handled }));
    eq('both joined on the last use', lastUsed.map((reply) => reply.body?.state), ['joined', 'joined']);
    await eqSql('the last use counted once', `select uses from company_invites where id='${lastUse.body?.invite?.id}'`, '1');

    // The last use of a link goes to one person.
    const single = await call('POST', `${o()}/invites`, { as: ADMIN, body: { kind: 'link', job_role: 'general', max_uses: 1 } });
    const [first, second] = await Promise.all([EMP11, EMP12].map((user) => call('POST', `join/${tokenOf(single.body?.link)}`, { label: 'the last use of a link', as: user, body: { consent: true }, expect: [200, 410] })));
    eq('one winner', [first.status, second.status].filter((status) => status === 200).length, 1);

    // Tests per workspace: the reservation is atomic.
    const test = await call('POST', `${o()}/assessments`, { as: ADMIN, body: { title: 'Race test', skills: ['grammar'] } });
    const token = tokenOf(need(test.body?.link, 'race test link'));
    const used = Number(await sql(`select tests_used from company_orgs where id='${S.org}'`));
    await call('PATCH', `staff/orgs/${S.org}`, { as: STAFF, body: { tests_limit: used + 1 } });
    const racers = await Promise.all([1, 2, 3].map((n) => call('POST', `public/t/${token}/start`, { label: 'the last test', body: { name: `Racer ${n}`, email: `racer${n}@example.uz`, consent: true }, ip: `192.0.2.8${n}`, expect: [200, 402] })));
    eq('one test left, one start', racers.filter((racer) => racer.status === 200).length, 1);
    await call('PATCH', `staff/orgs/${S.org}`, { as: STAFF, body: { tests_limit: 500 } });
    await eqSql('quota not exceeded', `select tests_used from company_orgs where id='${S.org}'`, String(used + 1));

    // One person pressing start twice.
    const beforeMember = Number(await sql(`select tests_used from company_orgs where id='${S.org}'`));
    const memberStarts = await twice(() => call('POST', `${o()}/my/attempts`, { label: 'pressing start twice (staff test)', as: EMP7, body: { assessment_id: S.placement }, allowDb: handled }));
    eq('both tabs resume one attempt', memberStarts[0].body?.attempt?.id, memberStarts[1].body?.attempt?.id);
    await eqSql('one running attempt', `select count(*) from company_attempts a join company_members m on m.id=a.member_id where m.user_id='${EMP7}' and a.org_id='${S.org}' and a.assessment_id='${S.placement}' and a.status='started'`, '1');
    eq('one test used', Number(await sql(`select tests_used from company_orgs where id='${S.org}'`)), beforeMember + 1);
    const beforeCandidate = Number(await sql(`select tests_used from company_orgs where id='${S.org}'`));
    const candidateStarts = await twice(() => call('POST', `public/t/${token}/start`, { label: 'pressing start twice (candidate)', body: { name: 'Twice', email: 'twice@example.uz', consent: true }, ip: '192.0.2.90', expect: [200, 409], allowDb: handled }));
    eq('one start, one refusal', candidateStarts.map((reply) => reply.status).sort(), [200, 409]);
    eq('the refusal does not say why', candidateStarts.find((reply) => reply.status === 409)?.body?.code, 'cannot_start');
    await eqSql('one attempt per email', `select count(*) from company_attempts where assessment_id='${test.body?.assessment?.id}' and candidate_email='twice@example.uz'`, '1');
    // The indexes the start route relies on, with the code its catch looks for.
    const dupStart = await db.from('company_attempts').insert({ org_id: S.org, assessment_id: test.body?.assessment?.id, candidate_email: 'twice@example.uz', status: 'started', deadline_at: new Date(Date.now() + 3_600_000).toISOString() });
    dbFailures.pop();
    eq('a second running attempt for an email is 23505', dupStart.error?.code, '23505');
    const memberAttempt = await sql(`select member_id from company_attempts where assessment_id='${S.placement}' and status='started' and member_id is not null limit 1`);
    const dupMemberStart = await db.from('company_attempts').insert({ org_id: S.org, assessment_id: S.placement, member_id: memberAttempt, status: 'started', deadline_at: new Date(Date.now() + 3_600_000).toISOString() });
    dbFailures.pop();
    eq('a second running attempt for a member is 23505', dupMemberStart.error?.code, '23505');
    eq('one test used', Number(await sql(`select tests_used from company_orgs where id='${S.org}'`)), beforeCandidate + 1);

    // Two tabs saving one attempt.
    const running = await call('POST', `public/t/${token}/start`, { body: { name: 'Tabs', email: 'tabs@example.uz', consent: true }, ip: '192.0.2.91' });
    const saves = await twice(() => call('POST', 'public/attempts/save', { label: 'two tabs saving', body: { key: running.body?.key, answers: answersFor(running.body?.attempt?.section) }, expect: [200, 409] }));
    ok('at least one save landed', saves.some((save) => save.status === 200), saves.map((save) => save.status));

    // Seats within the limit.
    const seats = Number(await sql(`select count(*) from company_members where org_id='${S.org}' and seat and status<>'removed'`));
    await call('PATCH', `staff/orgs/${S.org}`, { as: STAFF, body: { seats_limit: seats + 1 } });
    const [a, b] = [await sql(`select id from company_members where org_id='${S.org}' and user_id='${DOUBLE_JOINER}'`), await sql(`select id from company_members where org_id='${S.org}' and user_id='${EMP6}'`)];
    await Promise.all([a, b].map((member) => call('POST', `${o()}/people/${member}/seat`, { label: 'the last seat', as: OWNER, body: { seat: true }, expect: [200, 409] })));
    const after = Number(await sql(`select count(*) from company_members where org_id='${S.org}' and seat and status<>'removed'`));
    ok('never over the seat limit', after <= seats + 1, `${after} seats with a limit of ${seats + 1}`);

    // Marking attendance from two tabs.
    const session = await call('POST', `${o()}/sessions`, { as: ADMIN, body: { title: 'Race class', starts_at: new Date(Date.now() - 3_600_000).toISOString(), duration_minutes: 30 } });
    const sessionId = need(session.body?.session?.id, 'race session');
    await twice(() => call('PUT', `${o()}/sessions/${sessionId}/attendance`, { label: 'marking attendance twice', as: ADMIN, body: { present: [S.emp3Member] }, expect: noCrash }));
    await eqSql('attendance gives activity once', `select count(*) from company_activity where kind='session' and ref like '%${sessionId}%'`, '1');
  });

  await area('a large company: more than one page of rows (PostgREST caps at 1,000)', async () => {
    const big = await call('POST', 'staff/orgs', { as: STAFF, body: { name: 'Big Bank', industry: 'banking', size_band: '1000+', status: 'active', seats_limit: 5000, tests_limit: null, owner_email: 'big.owner@example.uz' } });
    const org = need(big.body?.org?.id, 'big org');
    const path = `orgs/${org}`;
    await sql(`insert into company_departments (org_id, name) values ('${org}', 'Everyone');
      insert into company_members (org_id, full_name, email, role, status, seat, department_id, job_role, consent_at, joined_at)
      select '${org}', 'Person '||g, 'person'||g||'@big.example', 'employee', 'active', false, (select id from company_departments where org_id='${org}' limit 1), 'general', now(), now() from generate_series(1, 1500) g;`);
    const test = await call('POST', `${path}/assessments`, { as: STAFF, body: { title: 'Big intake', skills: ['grammar'] } });
    const testId = need(test.body?.assessment?.id, 'big test');
    await sql(`insert into company_attempts (org_id, assessment_id, candidate_name, candidate_email, status, deadline_at, submitted_at, graded_at, overall_level, overall_score, certificate_code)
      select '${org}', '${testId}', 'Candidate '||g, 'c'||g||'@big.example', 'graded', now(), now(), now(), 'b1', 50, 'BIG'||g from generate_series(1, 1200) g;`);
    const count = (value: unknown) => Array.isArray(value) ? value.length : -1;
    eq('people list pages through everyone', count((await call('GET', `${path}/people`, { as: STAFF })).body?.members), 1501);
    eq('departments count everyone', (await call('GET', `${path}/departments`, { as: STAFF })).body?.departments?.[0]?.people, 1500);
    eq('staff counts everyone', (await call('GET', `staff/orgs/${org}`, { as: STAFF })).body?.counts?.people, 1500);
    eq('insights people lists everyone', count((await call('GET', `${path}/insights/people`, { as: STAFF })).body?.people), 1500);
    eq('campaign audience lists everyone', count((await call('GET', `${path}/placement/audience`, { as: STAFF })).body?.members), 1500);
    eq('assignment people lists everyone', count((await call('GET', `${path}/assignments`, { as: STAFF })).body?.people), 1500);
    const campaign = await call('POST', `${path}/placement`, { as: STAFF, body: { title: 'Everyone', skills: ['grammar'] } });
    eq('campaign counts everyone', (await call('GET', `${path}/placement`, { as: STAFF })).body?.campaigns?.[0]?.progress?.audience, 1500);
    eq('campaign detail lists everyone', count((await call('GET', `${path}/placement/${campaign.body?.assessment?.id}`, { as: STAFF })).body?.people), 1500);
    const assignment = await call('POST', `${path}/assignments`, { as: STAFF, body: { scope: 'all', track_code: 'general' } });
    eq('assignment counts everyone', (await call('GET', `${path}/assignments/${assignment.body?.assignments?.[0]?.id}`, { as: STAFF })).body?.stats?.people, 1500);
    const detail = await call('GET', `${path}/assessments/${testId}`, { as: STAFF });
    eq('hiring test lists every candidate', count(detail.body?.attempts), 1200);
    eq('hiring test counts every candidate', detail.body?.stats?.total, 1200);
    eq('hiring list counts every candidate', (await call('GET', `${path}/assessments`, { as: STAFF })).body?.assessments?.find((row: any) => row.id === testId)?.stats?.total, 1200);
    const lines = String((await call('GET', `${path}/assessments/${testId}/export`, { as: STAFF })).body?.csv ?? '').trim().split('\r\n').length;
    eq('hiring CSV has every candidate', lines, 1201);
    eq('report export has everyone, the invited owner too', (await call('GET', `${path}/reports/export?kind=people`, { as: STAFF })).body?.rows, 1501);
    eq('attempts export has everyone', (await call('GET', `${path}/reports/export?kind=attempts`, { as: STAFF })).body?.rows, 1200);
    await call('GET', `${path}/insights/overview`, { label: 'overview of a large company', as: STAFF });
    await call('GET', `${path}/reports/monthly`, { label: 'report of a large company', as: STAFF });
    // Marking a big town-hall: the route allows 2,000 ids, which all go into one URL.
    const session = await call('POST', `${path}/sessions`, { as: STAFF, body: { title: 'Town hall', starts_at: new Date(Date.now() - 3_600_000).toISOString() } });
    const present = (await sql(`select id from company_members where org_id='${org}' and status='active' and role='employee' limit 1500`)).split('\n');
    const marked = await call('PUT', `${path}/sessions/${need(session.body?.session?.id, 'town hall')}/attendance`, { label: 'marking 1,500 people', as: STAFF, body: { present } });
    eq('all marked', marked.body?.added, 1500);
    const large = await call('POST', `${path}/assignments`, { label: 'assigning 500 people', as: STAFF, body: { scope: 'people', member_ids: present.slice(0, 500), track_code: 'general' } });
    eq('all assigned', large.body?.created, 500);
    const taken = await call('PUT', `${path}/sessions/${session.body?.session?.id}/attendance`, { label: 'taking back 1,400 people', as: STAFF, body: { present: present.slice(0, 100) } });
    eq('taken back', taken.body?.removed, 1400);
    await eqSql('their activity went too', `select count(*) from company_activity where org_id='${org}' and kind='session'`, '100');
    const chosen = await call('POST', `${path}/placement`, { label: 'a campaign for 1,500 chosen people', as: STAFF, body: { title: 'Chosen', skills: ['grammar'], audience: { type: 'members', ids: present } } });
    eq('all chosen', chosen.body?.assessment?.settings?.audience?.ids?.length, 1500);
    await call('POST', `${path}/placement`, { label: 'a stranger among 1,500 people', as: STAFF, body: { title: 'Chosen', skills: ['grammar'], audience: { type: 'members', ids: [...present.slice(0, 1499), uid(97)] } }, expect: 400 });
    const invitedToClass = await call('POST', `${path}/sessions`, { label: 'a class for 500 people', as: STAFF, body: { title: 'Big class', starts_at: new Date(Date.now() + 3_600_000).toISOString(), member_ids: present.slice(0, 500) } });
    eq('all invited', invitedToClass.body?.session?.member_ids?.length, 500);

    // Many workspaces, assessments and sessions: the lists that build id filters.
    await sql(`insert into company_orgs (name, status, created_by) select 'Bulk '||g, 'pilot', '${STAFF}' from generate_series(1, 250) g;
      insert into company_members (org_id, role, status, email, full_name, user_id, joined_at) select o.id, 'owner', 'active', 'o'||row_number() over ()||'@bulk.example', 'Bulk Owner', null, now() from company_orgs o where o.name like 'Bulk %';
      insert into company_audit (org_id, actor, action) select o.id, u.id, 'bulk.event' from company_orgs o join public.users u on true where o.name like 'Bulk %' and u.id='${STAFF}';`);
    const orgList = await call('GET', 'staff/orgs', { label: 'more than 100 workspaces', as: STAFF });
    ok('every workspace has its numbers', (orgList.body?.orgs ?? []).filter((row: any) => String(row.name).startsWith('Bulk ')).every((row: any) => row.people === 1), orgList.body?.orgs?.length);
    await call('GET', 'staff/audit?limit=500', { label: 'audit naming more than 100 workspaces', as: STAFF });
    await sql(`insert into company_assessments (org_id, kind, title, status) select '${org}', 'placement', 'Bulk campaign '||g, 'open' from generate_series(1, 150) g;
      insert into company_assessments (org_id, kind, title, status) select '${org}', 'hiring', 'Bulk hiring '||g, 'open' from generate_series(1, 150) g;
      insert into company_sessions (org_id, title, starts_at, duration_minutes) select '${org}', 'Bulk session '||g, now() + interval '1 day', 30 from generate_series(1, 150) g;`);
    await call('GET', `${path}/placement`, { label: 'more than 100 campaigns', as: STAFF });
    await call('GET', `${path}/assessments`, { label: 'more than 100 hiring tests', as: STAFF });
    await call('GET', `${path}/sessions`, { label: 'more than 100 sessions', as: STAFF });
    ok('no request URL over 8 KB', longestUrl <= 8192, `${longestUrl} characters`);
  });

  await area('refusals: every route, wrong role and wrong workspace', async () => {
    const ids: Record<string, string> = {
      member: S.emp1Member, department: S.deptFront, invite: S.teamLinkId, assessment: S.test, attempt: S.attemptA, challenge: S.challenge,
      term: S.term, assignment: S.assignment, check: uid(98), lesson: S.lesson, track: 'general', scenario: 'none',
    };
    const fill = (route: Route, org: string, map: Record<string, string>) => route.path.split('/').map((part) => {
      if (part === ':org') return org;
      if (part === ':session') return route.path.includes('roleplay') ? S.roleplay : S.session;
      return part.startsWith(':') ? map[part.slice(1)] ?? part.slice(1) : part;
    }).join('/');
    const orgRoutes = allRoutes.filter((route) => route.access === 'org');

    for (const route of allRoutes.filter((entry) => entry.access === 'staff')) {
      await call(route.method, fill(route, S.org, { org: S.org, lead: S.lead }).replace(':org', S.org), { label: 'not staff', as: OWNER, body: {}, expect: 403 });
    }
    for (const route of allRoutes.filter((entry) => entry.access !== 'public')) {
      await call(route.method, fill(route, S.org, ids), { label: 'no session', body: {}, expect: 401 });
    }
    // Employee on routes reserved for other roles.
    for (const route of orgRoutes.filter((entry) => entry.roles && !entry.roles.includes('employee'))) {
      await call(route.method, fill(route, S.org, ids), { label: 'employee on an HR route', as: EMP1, body: {}, expect: 403 });
    }
    // Manager on HR-only routes.
    for (const route of orgRoutes.filter((entry) => entry.roles && !entry.roles.includes('manager'))) {
      await call(route.method, fill(route, S.org, ids), { label: 'manager on an HR route', as: MANAGER, body: {}, expect: 403 });
    }
    // Someone from another workspace, on this workspace's path.
    for (const route of orgRoutes) {
      await call(route.method, fill(route, S.org, ids), { label: 'member of another workspace', as: OTHER_OWNER, body: {}, expect: 403 });
    }
    // Their own workspace's path with this workspace's ids: must not reach the row.
    const crossOrg = orgRoutes.filter((route) => /:(member|department|invite|assessment|attempt|challenge|term|assignment|session)\b/.test(route.path));
    const before = await sql(`select md5(string_agg(t, '')) from (select row_to_json(m)::text t from company_members m where org_id='${S.org}' order by id) x`);
    for (const route of crossOrg) {
      await call(route.method, fill(route, S.otherOrg, ids), { label: "another workspace's id", as: OTHER_OWNER, body: {}, expect: (status) => refused(status) });
    }
    eq('nothing changed by the cross-workspace sweep', await sql(`select md5(string_agg(t, '')) from (select row_to_json(m)::text t from company_members m where org_id='${S.org}' order by id) x`), before);
    await call('PATCH', `${`orgs/${S.otherOrg}`}/assessments/${S.test}`, { label: "edit another workspace's test", as: OTHER_OWNER, body: { title: 'Hacked' }, expect: 404 });
    await eqSql('title intact', `select title from company_assessments where id='${S.test}'`, 'Receptionist 2027');
    await call('POST', `${`orgs/${S.otherOrg}`}/placement`, { label: "audience from another workspace", as: OTHER_OWNER, body: { title: 'Steal', audience: { type: 'members', ids: [S.emp1Member] } }, expect: 400 });
    await call('POST', `${`orgs/${S.otherOrg}`}/invites`, { label: "department of another workspace", as: OTHER_OWNER, body: { full_name: 'Someone Else', department_id: S.deptFront }, expect: 400 });
  });

  await area('malformed ids: a bad id in the URL must never be a 500', async () => {
    const orgRoutes = allRoutes.filter((route) => route.path.includes(':'));
    for (const route of orgRoutes) {
      const params = route.path.split('/').filter((part) => part.startsWith(':') && part !== ':org');
      if (!params.length) continue;
      if (route.path.startsWith('public/') || route.path.startsWith('join/')) {
        await call(route.method, route.path.replace(/:\w+/g, 'not-a-token'), { label: 'malformed public token', as: route.access === 'public' ? undefined : OWNER, body: {}, expect: refused });
        continue;
      }
      const path = route.path.split('/').map((part) => part === ':org' ? S.org : part.startsWith(':') ? 'not-a-uuid' : part).join('/');
      await call(route.method, path, { label: 'malformed id', as: route.access === 'staff' ? STAFF : OWNER, body: {}, expect: refused });
    }
    await call('GET', 'orgs/not-a-uuid', { label: 'malformed org', as: OWNER, expect: refused });
    await call('GET', 'orgs/not-a-uuid/people', { label: 'malformed org', as: OWNER, expect: refused });
    await call('GET', 'orgs/not-a-uuid/people', { label: 'malformed org as staff', as: STAFF, expect: refused });
    await call('GET', `staff/orgs/not-a-uuid`, { label: 'malformed staff org', as: STAFF, expect: refused });
    await call('GET', 'staff/audit?org=not-a-uuid', { label: 'malformed org filter is ignored', as: STAFF });
  });

  await area('account closure: delete by user_id, then the hook', async () => {
    await eqSql('the hook is registered', `select 'company_erase_account' = any(public.account_erasure_service_hooks())`, 't');
    await eqSql('service_role may not call the hook', `select has_function_privilege('service_role', 'public.company_erase_account(uuid)', 'execute')`, 'f');
    const closing = emailOf(CLOSING_OWNER);
    await sql(`insert into auth.users (id, email, email_confirmed_at) values ('${CLOSING_OWNER}', '${closing}', now()), ('${SOLO_OWNER}', '${emailOf(SOLO_OWNER)}', now());`);
    const made = await call('POST', 'orgs', { as: CLOSING_OWNER, body: { name: 'Closing Co', full_name: 'Closing Owner' } });
    const orgId = need(made.body?.org?.id, 'closing org');
    await call('PATCH', `staff/orgs/${orgId}`, { as: STAFF, body: { status: 'active', seats_limit: 5, contract_ends_at: '2030-01-01' } });
    const adminInvite = await call('POST', `orgs/${orgId}/invites`, { as: CLOSING_OWNER, body: { full_name: 'Second In Command', email: emailOf(CLOSING_ADMIN), role: 'admin' } });
    await call('POST', `join/${tokenOf(adminInvite.body?.link)}`, { as: CLOSING_ADMIN, body: { consent: true } });
    await call('POST', `orgs/${orgId}/people/${made.body?.member?.id}/seat`, { label: 'the closing person has a seat', as: CLOSING_OWNER, body: { seat: true } });
    await eqSql('seat granted', `select is_active from entitlements where user_id='${CLOSING_OWNER}' and resource_id='${SEAT_PRODUCT}'`, 't');
    await call('POST', `orgs/${orgId}/learn/${TRACKS[0].lessons[0].code}/check`, { label: 'some history', as: CLOSING_OWNER, body: { answers: {}, minutes: 3 } });
    const test = await call('POST', `orgs/${orgId}/assessments`, { as: CLOSING_OWNER, body: { title: 'Took one as a candidate', skills: ['grammar'], min_level: 'a2' } });
    const candidate = await call('POST', `public/t/${tokenOf(test.body?.link)}/start`, { body: { name: 'Closing Person', email: closing, phone: '+998901112233', consent: true }, ip: '192.0.2.200' });
    await call('POST', 'public/attempts/submit', { body: { key: candidate.body?.key, answers: answersFor(candidate.body?.attempt?.section) } });
    // Elsewhere: an invitation not yet accepted, a demo request, and audit text naming them.
    const elsewhere = await call('POST', `${o()}/invites`, { as: ADMIN, body: { full_name: 'Closing Person', email: closing } });
    await call('POST', 'public/leads', { body: { name: 'Closing Person', company: 'Closing Lead', email: closing, phone: '+998901112233', need: 'Tell me more.' }, ip: '203.0.113.200' });

    // What account closure does: the registered tables by user_id, then the hook.
    for (const table of ['company_roleplay_sessions', 'company_writing_checks', 'company_activity', 'company_lesson_progress', 'company_attempts', 'company_members']) {
      await sql(`delete from public.${table} where user_id='${CLOSING_OWNER}'`);
    }
    await eqSql('the longest-serving admin became owner', `select role from company_members where org_id='${orgId}' and user_id='${CLOSING_ADMIN}'`, 'owner');
    const hook = JSON.parse(await sql(`select public.company_erase_account('${CLOSING_OWNER}')`));
    ok('the hook reports its work', hook.billing === 1 && hook.leads === 1 && hook.invited === 1 && hook.candidate_attempts === 1, hook);
    await eqSql('billing contact gone', `select billing_email is null from company_orgs where id='${orgId}'`, 't');
    await eqSql('lead anonymised', `select name||'|'||(email is null)||'|'||(phone is null)||'|'||(need is null) from company_leads where company='Closing Lead'`, '-|true|true|true');
    await eqSql('invitation gone', `select count(*) from company_members where id='${elsewhere.body?.member?.id}'`, '0');
    await eqSql('candidate details gone, result kept', `select (candidate_name is null)||'|'||(candidate_email is null)||'|'||(candidate_phone is null)||'|'||(overall_level is not null) from company_attempts where id='${candidate.body?.attempt?.id}'`, 'true|true|true|true');
    await eqSql('audit no longer names them', `select count(*) from company_audit where actor='${CLOSING_OWNER}' or strpos(lower(details::text), '${closing}') > 0`, '0');
    await eqSql('no learning rows left', `select (select count(*) from company_activity where user_id='${CLOSING_OWNER}')+(select count(*) from company_lesson_progress where user_id='${CLOSING_OWNER}')`, '0');
    await call('GET', `orgs/${orgId}`, { label: 'the workspace still runs', as: CLOSING_ADMIN });
    const again = JSON.parse(await sql(`select public.company_erase_account('${CLOSING_OWNER}')`));
    eq('running the hook again finds nothing', [again.billing, again.leads, again.invited, again.candidate_attempts], [0, 0, 0, 0]);

    // A sole owner with no admin leaves a real orphan, which staff are shown.
    const solo = await call('POST', 'orgs', { as: SOLO_OWNER, body: { name: 'Solo Co' } });
    await sql(`delete from public.company_members where user_id='${SOLO_OWNER}'`);
    await sql(`select public.company_erase_account('${SOLO_OWNER}')`);
    const staffView = await call('GET', 'staff/orgs?ownerless=1', { as: STAFF });
    ok('staff are shown the orphan', staffView.body?.orgs?.some((row: any) => row.id === solo.body?.org?.id), staffView.body?.ownerless);
    eq('detail says nobody', (await call('GET', `staff/orgs/${solo.body?.org?.id}`, { as: STAFF })).body?.owner_state, 'none');
  });

  await area('a failed access sync: told, retried, repaired', async () => {
    const seatRow = (user: string) => sql(`select coalesce(string_agg(is_active::text, ','), 'none') from entitlements where user_id='${user}' and resource_id='${SEAT_PRODUCT}'`);
    const healthy = await sql(`select pg_get_functiondef('public.company_sync_english_access(uuid)'::regprocedure)`);
    const outage = () => sql(`create or replace function public.company_sync_english_access(p_user uuid) returns text language plpgsql security definer set search_path = public as $f$ begin raise exception 'outage'; end $f$;`);
    const restore = () => sql(`${healthy};`);
    const hurt = { allowLog: /company_sync/, allowDb: /outage/ };
    const made = await call('POST', 'orgs', { as: SYNC_OWNER, body: { name: 'Outage Co', full_name: 'Sync Owner' } });
    const orgId = need(made.body?.org?.id, 'outage org');
    await call('PATCH', `staff/orgs/${orgId}`, { as: STAFF, body: { status: 'active', seats_limit: 5 } });
    const invite = await call('POST', `orgs/${orgId}/invites`, { as: SYNC_OWNER, body: { full_name: 'Sync One', email: emailOf(SYNC_A) } });
    await call('POST', `join/${tokenOf(invite.body?.link)}`, { as: SYNC_A, body: { consent: true } });
    const second = await call('POST', `orgs/${orgId}/invites`, { as: SYNC_OWNER, body: { full_name: 'Sync Two', email: emailOf(SYNC_B) } });
    await call('POST', `join/${tokenOf(second.body?.link)}`, { as: SYNC_B, body: { consent: true } });
    const memberA = need(invite.body?.member?.id, 'first member'), memberB = need(second.body?.member?.id, 'second member');
    await call('POST', `orgs/${orgId}/people/${memberA}/seat`, { as: SYNC_OWNER, body: { seat: true } });
    await call('POST', `orgs/${orgId}/people/${memberB}/seat`, { as: SYNC_OWNER, body: { seat: true } });
    eq('seats granted', [await seatRow(SYNC_A), await seatRow(SYNC_B)], ['true', 'true']);

    try {
      await outage();
      const off = await call('POST', `orgs/${orgId}/people/${memberA}/seat`, { label: 'seat off during the outage', as: SYNC_OWNER, body: { seat: false }, ...hurt });
      eq('seat off says so', [off.status, off.body?.member?.seat, off.body?.access_sync_failed], [200, false, true]);
      eq('access still on', await seatRow(SYNC_A), 'true');
      await eqSql('audit records it', `select details->>'access' from company_audit where action='member.seat_off' and target='${memberA}'`, 'failed');
      const left = await call('POST', `orgs/${orgId}/people/me/leave`, { label: 'leaving during the outage', as: SYNC_B, ...hurt });
      eq('leave says so', [left.body?.left, left.body?.access_sync_failed], [true, true]);
      const stillDown = await call('POST', 'me/access/sync', { label: 'their own retry during the outage', as: SYNC_B, ...hurt });
      eq('retry says so', [stillDown.body?.access, stillDown.body?.access_sync_failed], ['failed', true]);
    } finally {
      await restore();
    }
    const repaired = await call('POST', `orgs/${orgId}/people/${memberA}/seat`, { label: 'the same click once healthy', as: SYNC_OWNER, body: { seat: false } });
    eq('repaired by repeating it', [repaired.body?.access_sync_failed ?? null, await seatRow(SYNC_A)], [null, 'false']);
    const own = await call('POST', 'me/access/sync', { as: SYNC_B });
    eq('their own retry repaired it', [own.body?.access, own.body?.access_sync_failed ?? null, await seatRow(SYNC_B)], ['revoked', null, 'false']);

    // Removal during an outage, repaired by the nightly job rather than by anyone clicking.
    await call('POST', `orgs/${orgId}/people/${memberA}/seat`, { label: 'seat again', as: SYNC_OWNER, body: { seat: true } });
    eq('seat back on', await seatRow(SYNC_A), 'true');
    try {
      await outage();
      const removed = await call('DELETE', `orgs/${orgId}/people/${memberA}`, { label: 'removal during the outage', as: SYNC_OWNER, ...hurt });
      eq('removal says so', [removed.status, removed.body?.member?.status, removed.body?.access_sync_failed], [200, 'removed', true]);
    } finally {
      await restore();
    }
    eq('access still on after the failed removal', await seatRow(SYNC_A), 'true');
    const repair = await db.rpc('company_reconcile_english_access', { p_limit: 1000 });
    ok('the nightly repair runs through PostgREST', !repair.error && repair.data?.failed === 0 && repair.data?.revoked >= 1, repair);
    eq('the nightly repair revoked it', await seatRow(SYNC_A), 'false');
    const again = await db.rpc('company_reconcile_english_access');
    eq('a second pass finds nothing', [again.data?.revoked, again.data?.failed], [0, 0]);

    // Staff changing a workspace during an outage.
    await sql(`create or replace function public.company_sync_org_access(p_org uuid) returns integer language plpgsql security definer set search_path = public as $f$ begin raise exception 'outage'; end $f$;`);
    const staffDown = await call('PATCH', `staff/orgs/${orgId}`, { label: 'suspend during the outage', as: STAFF, body: { status: 'suspended' }, allowLog: /company_sync_org/, allowDb: /outage/ });
    eq('staff are told', [staffDown.status, staffDown.body?.synced, staffDown.body?.access_sync_failed], [200, null, true]);
    await sql(`create or replace function public.company_sync_org_access(p_org uuid) returns integer language plpgsql security definer set search_path = public as $f$
      declare v_user uuid; v_count integer := 0;
      begin
        for v_user in select distinct user_id from public.company_members where org_id = p_org and user_id is not null loop
          perform public.company_sync_english_access(v_user);
          v_count := v_count + 1;
        end loop;
        return v_count;
      end;
    $f$;`);
    const staffRetry = await call('PATCH', `staff/orgs/${orgId}`, { label: 'saving nothing retries', as: STAFF, body: {} });
    ok('retry re-synced', staffRetry.body?.synced >= 1 && !staffRetry.body?.access_sync_failed, staffRetry.body);
  });

  const v2: V2Harness = {
    call, sql, area, eq, ok, need, db, state: S,
    configureConnect: (config) => { env.connect = config; },
    users: { owner: OWNER, admin: ADMIN, manager: MANAGER, employee: EMP1, employee2: EMP2, otherOwner: OTHER_OWNER, staff: STAFF },
  };
  await hiringTrainingV2(v2);
  await insightsOpsV2(v2);
  await coachConnectV2(v2);

  await area('v2 site: public check and lead attribution', async () => {
    const opened = await call('GET', 'public/check', { ip: '203.0.113.240' });
    ok('public check has no answer keys', opened.body.items.every((item: any) => !('answer' in item)));
    const result = await call('POST', 'public/check/score', { ip: '203.0.113.240', body: { answers: { g1: 1, v1: 0 } } });
    eq('check is labelled an estimate', result.body.estimate, true);
    await call('POST', 'public/check/score', { ip: '203.0.113.240', body: { answers: {} }, expect: 400 });
    await call('POST', 'public/leads', { ip: '203.0.113.240', body: {
      name: 'Test Lead', company: 'Test attribution', email: 'fixture@example.uz', elapsed_ms: 9000,
      utm: { source: 'telegram', campaign: 'company-v2' }, landing_path: '/for/hotels?private=1',
      referrer_host: 'Example.COM', check_answers: { g1: 1, v1: 0 },
    } });
    await eqSql('attribution drops query strings', "select utm_source||'|'||landing_path||'|'||referrer_host||'|'||(check_result->>'estimate') from company_leads where company='Test attribution'", 'telegram|/for/hotels|example.com|true');
  });

  await area('last: closing a workspace', async () => {
    await call('POST', `${o()}/people/me/leave`, { label: 'an ordinary leave still works', as: EMP5 });
    await call('PATCH', `staff/orgs/${S.org}`, { as: STAFF, body: { status: 'closed' } });
    await eqSql('close revokes access', `select is_active from entitlements where user_id='${EMP1}' and resource_id='${SEAT_PRODUCT}'`, 'f');
    await call('GET', `${o()}`, { label: 'closed', as: EMP1, expect: 403 });
    await call('GET', `${o()}`, { label: 'staff still reads', as: STAFF });
    const me = await call('GET', 'me', { as: OWNER });
    ok('closed workspace left the list', !me.body?.workspaces?.some((row: any) => row.org?.id === S.org), me.body?.workspaces);
    await call('GET', `public/t/${S.testToken}`, { label: 'candidate sees it closed' });
    await call('POST', `public/t/${S.testToken}/start`, { label: 'closed workspace', body: { name: 'After Close', email: 'after@example.uz', consent: true }, expect: 403 });
    await call('POST', `join/${S.openLink}`, { label: 'closed', as: EMP9, body: { consent: true }, expect: 403 });
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main(): Promise<number> {
  const port = await setUpDatabase();
  const serviceJwt = await signJwt('service_role');
  console.log(`PostgREST ${POSTGREST_IMAGE} on 127.0.0.1:${port}, Postgres ${POSTGRES_IMAGE} on a private network.`);

  const dbFetch: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    if (url.hostname !== '127.0.0.1') throw new Error(`Refusing to reach ${url.hostname}`);
    url.pathname = url.pathname.replace(/^\/rest\/v1/, '');
    dbRequests++;
    longestUrl = Math.max(longestUrl, url.pathname.length + url.search.length);
    // Docker Desktop's port proxy now and then drops a kept-alive connection before PostgREST
    // sees the request. That is the test rig, not the product, so try again; the count is reported.
    let response: Response | null = null;
    for (let attempt = 0; !response; attempt++) {
      try {
        response = await fetch(url, init);
      } catch (cause) {
        if (attempt >= 4 || !String(cause).includes('connection closed before message completed')) throw cause;
        transportRetries++;
        await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
      }
    }
    if (response.status >= 400) {
      let body = await response.clone().text();
      // A HEAD (count) has no body, so repeat it as a GET to read the real error.
      if (!body && (init?.method ?? 'GET') === 'HEAD') {
        const again = await fetch(url, { ...init, method: 'GET' });
        body = await again.text();
      }
      dbFailures.push(`${init?.method ?? 'GET'} ${decodeURIComponent(url.pathname + url.search)} -> ${response.status} ${body}`);
    }
    return response;
  };
  db = createClient(`http://127.0.0.1:${port}`, serviceJwt, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: dbFetch } });
  env = { pilotTests: 10, selfServe: true, aiDailyLimit: 300, appUrl: 'https://company.schood.online' };
  handler = createCompanyHandler({
    db,
    userFromToken: (token) => Promise.resolve(USERS.includes(token) ? { id: token, email: emailOf(token) } : null),
    origins: ['https://company.schood.online'],
    env,
    ai: aiStub,
    routes: allRoutes,
  });

  await scenario(port, serviceJwt);

  const all = [...coverage.entries()];
  const reached = all.filter(([, entry]) => entry.ok);
  const refusedOnly = all.filter(([, entry]) => !entry.ok && entry.statuses.size);
  const never = all.filter(([, entry]) => !entry.statuses.size);
  console.log(`\n================ Coverage: ${reached.length}/${all.length} routes reached a 2xx (${requests} requests, ${dbRequests} PostgREST calls, ${transportRetries} transport retries, ${assertions} assertions, longest URL ${longestUrl} characters)`);
  for (const [name, entry] of refusedOnly) console.log(`  refused only  ${name}  [${[...entry.statuses].join(',')}]`);
  for (const [name] of never) console.log(`  NEVER CALLED  ${name}`);
  console.log(`AI calls: ${JSON.stringify(aiCalls)}`);

  if (refusedOnly.length) failures.push({ kind: 'blocked', area: 'coverage', label: 'no successful request', detail: refusedOnly.map(([name]) => name).join(', ') });
  if (never.length) failures.push({ kind: 'blocked', area: 'coverage', label: 'unexercised', detail: never.map(([name]) => name).join(', ') });

  const groups = new Map<string, Failure[]>();
  for (const failure of failures) {
    const signature = `${failure.kind}|${failure.label.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, '<id>')}`;
    groups.set(signature, [...(groups.get(signature) ?? []), failure]);
  }
  console.log(`\n================ Result: ${failures.length} failure(s), ${groups.size} distinct`);
  const counts: Record<string, number> = {};
  for (const failure of failures) counts[failure.kind] = (counts[failure.kind] ?? 0) + 1;
  if (failures.length) console.log(JSON.stringify(counts));
  for (const [, list] of groups) {
    const first = list[0];
    console.log(`\n[${first.kind}] (${first.area}) ${first.label}${list.length > 1 ? ` (x${list.length})` : ''}\n  ${first.detail.replaceAll('\n', '\n  ')}`);
  }
  return failures.length ? 1 : 0;
}

let exitCode = 1;
try {
  exitCode = await main();
} catch (cause) {
  realError(cause);
} finally {
  await cleanup();
  const left = (await run('docker', ['ps', '-a', '--filter', `name=schood-company-pgrst-${suffix}`, '--format', '{{.Names}}'])).out.trim();
  if (left && !KEEP) realError(`Containers left behind: ${left}`);
  else if (KEEP) console.log(`Kept: ${DB}, ${REST}, ${NETWORK}`);
}
Deno.exit(exitCode);
