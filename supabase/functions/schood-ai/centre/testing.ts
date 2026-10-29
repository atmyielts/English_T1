import { SSEParser } from '../../../../packages/ai-core/src/mod.ts';
import { CircuitBreaker, createGateway } from '../gateway.ts';
import { createSchoodAIHandler, MODULES } from '../handler.ts';
import { createMemoryRepository, SEED_REGISTRY, type MemoryUser } from '../memory-repository.ts';
import { createPlanResolver } from '../plan.ts';
import type { FunctionCallInit } from '../types.ts';
import { bindCentre, type CentreDeps, type TelegramResult } from './binding.ts';
import { SecretBox } from './crypto.ts';
import { createCentrePublicHandler } from './public.ts';
import { createMemoryCentreStore } from './store-memory.ts';

// The centre test fixture: the real handler, gateway, plan resolver and centre
// public handler over the memory repository and the memory centre store, with a
// fake model (answers chosen from the task in the system prompt), a fake Academy
// (the actions the centre area calls, with an owner and a teacher role), a fake
// Telegram Bot API and a movable clock. No network, no permissions.

export const ORIGIN = 'https://ai.schood.online';
export const SECRET = 'worker-secret-0123456789abcdef0123456789';
export const PRODUCT = { centre: '10000000-0000-4000-8000-000000000005', centre_pro: '10000000-0000-4000-8000-000000000006', plus: '10000000-0000-4000-8000-000000000001' };
export const ACADEMY = 'a0000000-0000-4000-8000-0000000000a1';
export const CLASS = { b5: 'c0000000-0000-4000-8000-0000000000b5', ielts: 'c0000000-0000-4000-8000-0000000000e1' };
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const ID = {
  owner: id(101), office: id(102), t1: id(103), t2: id(104), s1: id(111), s2: id(112), s3: id(113), s4: id(114), s5: id(115), s6: id(116),
  parent: id(121), outsider: id(131), schoodAdmin: id(141), basicOwner: id(151),
};
export const USERS: Record<string, MemoryUser> = {
  'tok-owner': { id: ID.owner, email: 'owner@registan.uz', name: 'Jasur Aliyev', products: [PRODUCT.centre_pro], productStarts: { [PRODUCT.centre_pro]: '2026-10-20T00:00:00.000Z' }, telegramChatId: '900001' },
  'tok-office': { id: ID.office, email: 'office@registan.uz', name: 'Nodira Karimova' },
  'tok-t1': { id: ID.t1, email: 't1@registan.uz', name: 'Malika Tursunova' },
  'tok-t2': { id: ID.t2, email: 't2@registan.uz', name: 'Bekzod Rahimov' },
  ...Object.fromEntries([1, 2, 3, 4, 5, 6].map((n) => [`tok-s${n}`, { id: ID[`s${n}` as 's1'], email: `s${n}@example.com`, name: `Student ${n}` }])),
  'tok-parent': { id: ID.parent, email: 'parent@example.com', name: 'Parent' },
  'tok-outsider': { id: ID.outsider, email: 'outsider@example.com', name: 'Outsider' },
  'tok-schood-admin': { id: ID.schoodAdmin, email: 'admin@schood.online', role: 'admin', permissions: ['admin.*'] },
  'tok-basic-owner': { id: ID.basicOwner, email: 'basic@example.com', name: 'Basic Owner', products: [PRODUCT.centre], productStarts: { [PRODUCT.centre]: '2026-10-20T00:00:00.000Z' } },
};
/** Sunday 14:00 in Tashkent. */
export const START = new Date('2026-11-01T09:00:00Z');

export const equal = (actual: unknown, expected: unknown, label = '') => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
export const ok = (value: unknown, label: string) => { if (!value) throw new Error(label); };

export interface ModelCall { system: string; user: string; last: string; messages: { role: string; content: unknown }[] }
type ModelAnswer = string | Record<string, unknown> | ((call: ModelCall) => string | Record<string, unknown>);

/** A fake Academy that answers like the real API for the actions the centre area uses. */
export function fakeAcademy() {
  const calls: { action: string; token: string; body: Record<string, unknown> }[] = [];
  const role: Record<string, string> = { 'tok-owner': 'owner', 'tok-office': 'admin', 'tok-t1': 'teacher', 'tok-t2': 'teacher' };
  const contacts = [1, 2, 3, 4, 5, 6].map((n) => ({ id: `ct-${n}`, user_id: ID[`s${n}` as 's1'], first_name: 'Student', last_name: String(n), status: n === 6 ? 'inactive' : 'active' }));
  let serial = 0;
  const state = { leads: [{ id: 'lead-1', full_name: 'Aziza Yusupova', phone: '+998901112233', status: 'open', current_stage_id: 'st-new', source_id: 'src-ig', interested_course: 'IELTS', next_follow_up_at: '2026-10-30T09:00:00Z', last_contacted_at: null, created_at: '2026-10-25T09:00:00Z' }] as Record<string, unknown>[] };
  const handle = (name: string, token: string, init: FunctionCallInit): { status: number; data: unknown } => {
    const query = init.query ?? {}, body = (init.body ?? {}) as Record<string, unknown>;
    const action = String(query.action ?? body.action ?? '');
    calls.push({ action, token, body: { ...query, ...body } });
    const who = role[token];
    if (name === 'academy-learning') {
      if (!who) return { status: 403, data: { error: 'Forbidden' } };
      if (action === 'homework_funnel') return { status: 200, data: { classrooms: [{ classroom_id: CLASS.b5, assigned: 40, submitted: 31, on_time: 27, reviewed: 25 }] } };
      if (action === 'homework_mistakes') return { status: 200, data: { tags: [{ tag: 'present perfect', open: 6, total: 11 }, { tag: 'articles', open: 2, total: 7 }] } };
      return { status: 404, data: null };
    }
    if (name !== 'academy') return { status: 404, data: null };
    if (action === 'academies') return who ? { status: 200, data: { academies: [{ id: ACADEMY, name: 'Registan Learning Centre', role: who, access: { role: who, permissions: { manageAcademy: who === 'owner' || who === 'admin' } } }] } } : { status: 403, data: { error: 'No active academy membership' } };
    if (!who || (query.academy_id ?? body.academy_id) !== ACADEMY) return { status: 403, data: { error: 'Forbidden' } };
    const office = who === 'owner' || who === 'admin';
    switch (action) {
      case 'classrooms': return { status: 200, data: { classrooms: [{ id: CLASS.b5, name: '5B', is_active: true }, ...(office ? [{ id: CLASS.ielts, name: 'IELTS evening', is_active: true }] : [])] } };
      case 'classroom-memberships': return { status: 200, data: { classroom_memberships: (query.classroom_id === CLASS.b5 ? [1, 2, 3, 4, 5] : [5, 6]).map((n) => ({ contact_id: `ct-${n}`, role: 'student', status: 'active' })) } };
      case 'contacts': return { status: 200, data: { contacts } };
      case 'gradebook': return { status: 200, data: {
        assignments: [{ id: 'hw-1', due_at: '2026-10-20T00:00:00Z' }, { id: 'hw-2', due_at: '2026-10-27T00:00:00Z' }, { id: 'hw-3', due_at: '2026-12-01T00:00:00Z' }],
        rows: [1, 2, 3, 4, 5].map((n) => ({ contact_id: `ct-${n}`, first_name: 'Student', last_name: String(n), role: 'student', composite_score: 60 + n * 5, submissions: { 'hw-1': { status: n <= 2 ? 'missing' : 'graded' }, 'hw-2': { status: n === 1 ? 'missing' : 'submitted' }, 'hw-3': { status: 'missing' } } })),
      } };
      case 'attendance': return { status: 200, data: { attendance: [{ contact_id: 'ct-1', session_date: '2026-10-21', status: 'absent' }, { contact_id: 'ct-1', session_date: '2026-10-28', status: 'absent' }, { contact_id: 'ct-3', session_date: '2026-10-28', status: 'absent' }] } };
      case 'student_progress': return { status: 200, data: { contact: { id: query.contact_id, first_name: 'Student', last_name: '1', status: 'active' }, classrooms: [{ academy_classrooms: { name: '5B' } }], attendance: [{ status: 'absent', session_date: '2026-10-28' }], submissions: [{ status: 'missing' }], stats: { attendance_rate: 82, present_days: 9, total_attendance_days: 11, avg_score: 71, graded_submissions: 6, total_submissions: 7 } } };
      case 'guardian_relationships': return office ? { status: 200, data: { guardians: [{ id: 'g-1', full_name: 'Dilnoza Yusupova', locale: 'uz', telegram_verified_at: '2026-09-01T00:00:00Z' }], relationships: [{ id: 'rel-1', contact_id: 'ct-1', guardian_id: 'g-1', status: 'active', consent_status: 'granted', can_view_messages: true, is_primary_contact: true }] } } : { status: 403, data: { error: 'Forbidden' } };
      case 'business_foundation': return office ? { status: 200, data: { stages: [{ id: 'st-new', stage_key: 'new', label_i18n: { en: 'New', uz: 'Yangi' } }], sources: [{ id: 'src-ig', label_i18n: { en: 'Instagram' } }], leads: state.leads, trials: [] } } : { status: 403, data: { error: 'Forbidden' } };
      case 'business_intelligence': return office ? { status: 200, data: {
        dashboard: { new_leads: 14, active_leads: 23, trials: 6, conversions: 4, active_students: 118, new_students: 5, paused_enrollments: 2, withdrawals: 1, collected_revenue: 41500000, expected_revenue: 52000000, outstanding_amount: 7300000, attendance_30d_percent: 87 },
        owner: {}, branches: [{ currency: 'UZS' }],
        student_intelligence: [{ contact_id: 'ct-1', first_name: 'Student', last_name: '1', latest_risk_level: 'high', attendance_30d_percent: 64, homework_activity_30d: 2 }],
        teacher_performance: [{ display_name: 'Malika Tursunova', assigned_groups: 4, active_students: 52, lessons_delivered: 31, attendance_percent: 90 }],
        renewals: [{ contact_id: 'ct-2', status: 'open', renewal_due_on: '2026-11-10' }], subscriptions: [],
      } } : { status: 403, data: { error: 'Forbidden' } };
      case 'alerts': return { status: 200, data: { alerts: [{ contact_id: 'ct-1', type: 'at_risk', resolved: false, metadata: { attendance_rate: 64, missing: 3 } }] } };
      case 'create_lead': { const lead = { id: `lead-${++serial + 100}`, full_name: body.full_name, phone: body.phone ?? null, status: 'open' }; state.leads.push(lead); return { status: 200, data: { lead, replayed: false } }; }
      case 'schedule_trial': return { status: 200, data: { trial: { id: `trial-${++serial}`, lead_id: body.lead_id, starts_at: body.starts_at, status: 'scheduled' } } };
      case 'record_lead_activity': return { status: 200, data: { activity: { id: `act-${++serial}` } } };
      case 'queue_guardian_notification': return office || who === 'teacher' ? { status: 200, data: { notification: { id: `nt-${++serial}`, status: 'queued' }, deduplicated: false } } : { status: 403, data: {} };
      case 'send_guardian_message': return { status: 200, data: { message: { id: `gm-${++serial}` } } };
      case 'send_message': return { status: 200, data: { message: { id: `m-${++serial}` }, conversation_id: 'conv-1' } };
      case 'upsert_course': return { status: 200, data: { course: { id: `course-${++serial}` } } };
      case 'upsert_module': return { status: 200, data: { module: { id: `module-${++serial}` } } };
      case 'upsert_lesson': return { status: 200, data: { lesson: { id: `lesson-${++serial}` } } };
      case 'publish_course': return { status: 200, data: { course: { id: body.course_id }, version: { version: 1 } } };
      default: return { status: 404, data: null };
    }
  };
  return { calls, handle, state };
}

/** A fake Telegram Bot API. */
export function fakeTelegram() {
  const calls: { token: string; method: string; body: Record<string, unknown> }[] = [];
  let message = 0;
  return {
    calls,
    sent: (chat?: string) => calls.filter((call) => call.method === 'sendMessage' && (!chat || String(call.body.chat_id) === chat)).map((call) => String(call.body.text)),
    api: {
      call(token: string, method: string, body: Record<string, unknown>): Promise<TelegramResult> {
        calls.push({ token, method, body });
        if (token.startsWith('000')) return Promise.resolve({ ok: false, error_code: 401, description: 'Unauthorized' });
        if (method === 'getMe') return Promise.resolve({ ok: true, result: { id: 777000, is_bot: true, username: 'registan_admissions_bot' } });
        if (method === 'sendMessage') return Promise.resolve({ ok: true, result: { message_id: ++message } });
        return Promise.resolve({ ok: true, result: {} });
      },
    },
  };
}

export const BOT_TOKEN = '7001234567:AAFakeTokenForTestsOnly_abcdefghijklmn';

export async function centreFixture(options: { publicUrl?: string | null; secrets?: boolean } = {}) {
  let clock = START;
  const now = () => clock;
  const memory = createMemoryRepository({ users: USERS, now, registry: SEED_REGISTRY });
  const upstream: ModelCall[] = [];
  const answers: { match: RegExp; answer: ModelAnswer }[] = [];
  const env: Record<string, string> = { OPENROUTER_API_KEY: 'sk-or-test' };
  const gateway = createGateway({
    registry: () => memory.repository.registry(), settings: () => memory.repository.settings(), takeCall: (input) => memory.repository.takeCall(input),
    record: (rows) => { void memory.repository.recordCalls(rows); }, env: (name) => env[name], now, breaker: new CircuitBreaker(),
    fetch: async (input, init) => {
      const request = new Request(input, init);
      const body = await request.json();
      const messages = (body.messages ?? []) as { role: string; content: unknown }[];
      const users = messages.filter((m) => m.role === 'user').map((m) => String(m.content));
      const call: ModelCall = { system: String(messages.find((m) => m.role === 'system')?.content ?? ''), user: users.join('\n'), last: users.at(-1) ?? '', messages };
      upstream.push(call);
      const found = answers.find((entry) => entry.match.test(call.system));
      if (!found) return new Response(JSON.stringify({ error: { message: 'no fake answer' } }), { status: 500 });
      const value = typeof found.answer === 'function' ? found.answer(call) : found.answer;
      const content = typeof value === 'string' ? value : JSON.stringify(value);
      if (request.headers.get('accept')?.includes('text/event-stream')) {
        return new Response(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\ndata: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 100, completion_tokens: 20 } })}\n\ndata: [DONE]\n\n`, { headers: { 'Content-Type': 'text/event-stream' } });
      }
      return new Response(JSON.stringify({ choices: [{ message: { content } }], usage: { prompt_tokens: 300, completion_tokens: 80 } }), { headers: { 'Content-Type': 'application/json' } });
    },
  });
  const isAdmin = (userId: string) => Promise.resolve(userId === ID.schoodAdmin);
  const tokenProducts = new Map(Object.entries(USERS).map(([token, user]) => [token, user.products ?? []]));
  const plans = createPlanResolver({ productIds: PRODUCT, betaUserIds: new Set(), repo: memory.repository, isAdmin, now, accessEffective: (token) => Promise.resolve(tokenProducts.get(token) ?? []) });
  const academy = fakeAcademy();
  const telegram = fakeTelegram();
  const store = createMemoryCentreStore(memory, now);
  const media: { key: string; size: number }[] = [];
  const deps: CentreDeps = {
    store, telegram: telegram.api,
    secrets: options.secrets === false ? null : await SecretBox.create('k1', { k1: btoa(String.fromCharCode(...new Uint8Array(32).map((_, i) => i + 1))) }),
    media: { put: (key, bytes) => { media.push({ key, size: bytes.length }); return Promise.resolve({ provider: 's3', bucket: 'test', path: key }); } },
    config: { appUrl: 'https://ai.schood.online', publicUrl: options.publicUrl === undefined ? 'https://project.supabase.co/functions/v1/schood-ai/public' : options.publicUrl, schoodBotToken: '6000000000:SchoodStudentBotTokenForTests_abcdefgh' },
  };
  bindCentre(memory.repository, deps);
  const pending: Promise<unknown>[] = [];
  const after = (work: Promise<unknown>) => { pending.push(work); };
  const callFunction = (name: string, _path: string, token: string, init: FunctionCallInit) => Promise.resolve(academy.handle(name, token, init));
  const handle = createSchoodAIHandler({
    repository: memory.repository, gateway, plans, isAdmin, callFunction,
    adminGate: () => Promise.resolve({ ok: false, status: 403, code: 'forbidden' }), modules: MODULES,
  }, { allowedOrigins: [ORIGIN], serviceSecret: SECRET, now, after });
  const publicHandle = createCentrePublicHandler({ repository: memory.repository, gateway, plans, isAdmin, callFunction }, { serviceSecret: SECRET, now, after });

  type CallOptions = { token?: string | null; body?: unknown; query?: Record<string, string>; workspace?: string; headers?: Record<string, string> };
  const call = (method: string, path: string, opts: CallOptions = {}) => {
    const query = new URLSearchParams({ ...(opts.workspace ? { workspace_id: opts.workspace } : {}), ...(opts.query ?? {}) }).toString();
    const headers: Record<string, string> = { 'content-type': 'application/json', origin: ORIGIN, ...(opts.token === null ? {} : { authorization: `Bearer ${opts.token ?? 'tok-owner'}` }), ...opts.headers };
    return handle(new Request(`https://x.invalid/functions/v1/schood-ai/${path}${query ? `?${query}` : ''}`, { method, headers, ...(opts.body === undefined ? {} : { body: JSON.stringify(opts.body) }) }));
  };
  const json = async (method: string, path: string, opts: CallOptions = {}) => {
    const response = await call(method, path, opts);
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null, response };
  };
  const settle = async () => { while (pending.length) await Promise.all(pending.splice(0)); };
  const publicCall = async (method: string, path: string, init: { body?: unknown; headers?: Record<string, string> } = {}) => {
    const response = await publicHandle(new Request(`https://x.invalid/functions/v1/schood-ai/public/centre/${path}`, { method, headers: { 'content-type': 'text/plain', ...init.headers }, ...(init.body === undefined ? {} : { body: typeof init.body === 'string' ? init.body : JSON.stringify(init.body) }) }));
    const text = await response.text();
    let body: unknown = text;
    try { body = JSON.parse(text); } catch { /* plain text */ }
    return { status: response.status, body: body as Record<string, any>, headers: response.headers };
  };
  return {
    memory, store, deps, academy, telegram, upstream, media, env, call, json, settle, publicCall,
    /** Answer model calls whose system prompt matches. Later rules win over earlier ones. */
    model: (match: RegExp, answer: ModelAnswer) => { answers.unshift({ match, answer }); },
    advance: (ms: number) => { clock = new Date(clock.getTime() + ms); },
    setClock: (at: Date) => { clock = at; },
    now,
  };
}
export type CentreFixture = Awaited<ReturnType<typeof centreFixture>>;

/** Owner creates the Academy-linked centre; returns its workspace id. */
export async function createCentre(f: CentreFixture, token = 'tok-owner') {
  const created = await f.json('POST', 'centre/create', { token, body: { academy_id: ACADEMY } });
  if (created.status !== 200) throw new Error(`create failed ${JSON.stringify(created.body)}`);
  return created.body.workspace.id as string;
}

/** Invites and joins people with the given roles; returns the codes used. */
export async function invite(f: CentreFixture, workspace: string, role: string, tokens: string[], maxUses = 50) {
  const created = await f.json('POST', 'centre/invites', { workspace, body: { role, max_uses: maxUses } });
  if (created.status !== 200) throw new Error(`invite failed ${JSON.stringify(created.body)}`);
  for (const token of tokens) {
    const joined = await f.json('POST', 'centre/join', { token, body: { code: created.body.code } });
    if (joined.status !== 200) throw new Error(`join failed ${token} ${JSON.stringify(joined.body)}`);
  }
  return created.body.code as string;
}

export async function streamText(response: Response) {
  const parser = new SSEParser();
  const all = [...parser.push(await response.text()), ...parser.flush()];
  return all.map((event) => ({ event: event.event, data: JSON.parse(event.data) }));
}

// --- A placement test for the C5, C8 and C14 tests --------------------------------------------

export const TEST = {
  title: 'General English placement A1–B2', from_level: 'a1', to_level: 'b2', minutes: 30,
  sections: [
    { id: 'grammar', title: 'Grammar', kind: 'objective', items: [
      { id: 'q1', type: 'mcq', level: 'a1', prompt: 'She ___ a teacher.', options: ['am', 'is', 'are'], answer: 1 },
      { id: 'q2', type: 'mcq', level: 'a2', prompt: 'I ___ to Samarkand last year.', options: ['go', 'went', 'have gone'], answer: 1 },
      { id: 'q3', type: 'mcq', level: 'b1', prompt: 'I have lived here ___ 2019.', options: ['for', 'since', 'from'], answer: 1 },
      { id: 'q4', type: 'gap', level: 'b2', prompt: 'If I ___ (know) earlier, I would have told you.', accept: ['had known'] },
    ] },
    { id: 'writing', title: 'Writing', kind: 'writing', prompt: 'Write about your favourite place in your city and why you like it.', min_words: 60 },
  ],
  bands: [{ level: 'a1', min_percent: 0 }, { level: 'a2', min_percent: 40 }, { level: 'b1', min_percent: 70 }, { level: 'b2', min_percent: 90 }],
};
export const ESSAY = 'My favourite place is Registan square because it is very beautiful at night. I go there with my friends every weekend and we take photos. The old buildings is very big and blue. I like it because it make me feel proud of my city and its history.';

export async function approvedTest(f: CentreFixture, ws: string) {
  const created = await f.json('POST', 'centre/placement-tests', { token: 'tok-t1', workspace: ws, body: { material: TEST } });
  if (created.status !== 200) throw new Error(JSON.stringify(created.body));
  await f.json('PATCH', 'centre/placement-tests', { token: 'tok-t1', workspace: ws, body: { id: created.body.page_id, expected_revision: created.body.revision, status: 'approved' } });
  return created.body.page_id as string;
}

