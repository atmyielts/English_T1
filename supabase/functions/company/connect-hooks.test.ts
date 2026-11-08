// Webhooks: where they may point (including redirects), signatures, the queue and its
// backoff, and that nothing leaves while the switch is off.
import { assert, assertEquals, assertNotEquals, assertRejects } from 'jsr:@std/assert@1';
import { routes as connect } from './connect.ts';
import { routes as core } from './core.ts';
import type { ConnectConfig, WebhookAdapter } from './connect/shared.ts';
import { createWebhookTransport, isBlockedAddress, urlProblem } from './connect/ssrf.ts';
import { pinnedHttps, statusLine } from './connect/https.ts';
import { selfSignedCert } from './testing-tls.ts';
import { BACKOFF_SECONDS, emitEvent, eventBody, processQueue, scanEvents, signPayload } from './connect/webhooks.ts';
import { FakeDb, TEST_ENV, testHandler } from './testing.ts';
import type { CompanyEnv, OrgRow, Route } from './types.ts';

const routes: Route[] = [...core, ...connect];
const ORG = '10000000-0000-4000-8000-000000000001', OTHER = '10000000-0000-4000-8000-000000000002';
const OWNER = '20000000-0000-4000-8000-000000000001', EMP = '20000000-0000-4000-8000-000000000003';
const M_OWNER = '30000000-0000-4000-8000-000000000001', M_EMP = '30000000-0000-4000-8000-000000000003';
const HOOK = '70000000-0000-4000-8000-000000000001';
const NOW = new Date('2026-11-06T07:00:00Z');
const DAY = 86_400_000;
const iso = (offset: number) => new Date(NOW.getTime() + offset).toISOString();

function world() {
  const member = (id: string, user: string, role: string) => ({ id, org_id: ORG, user_id: user, email: `${role}@x.test`, full_name: role, role, department_id: null, job_role: 'general', status: 'active', seat: false, level: null, level_at: null, consent_at: null, joined_at: iso(-20 * DAY) });
  const db = new FakeDb({
    users: [{ id: OWNER, role: 'user' }, { id: EMP, role: 'user' }],
    company_orgs: [
      { id: ORG, name: 'Acme', industry: 'it', size_band: '1-50', status: 'active', seats_limit: 5, tests_limit: 10, tests_used: 0, contract_ends_at: null, settings: {}, created_at: iso(-30 * DAY) },
      { id: OTHER, name: 'Other', industry: 'it', size_band: '1-50', status: 'active', seats_limit: 5, tests_limit: 10, tests_used: 0, contract_ends_at: null, settings: {}, created_at: iso(-30 * DAY) },
    ],
    company_members: [member(M_OWNER, OWNER, 'owner'), member(M_EMP, EMP, 'employee')],
    company_webhooks: [], company_webhook_deliveries: [], company_audit: [], company_attempts: [], company_connect_settings: [], company_notices: [],
  });
  db.rpcs.company_connect_hit = () => true;
  return db;
}
const org = (db: FakeDb) => db.rows('company_orgs')[0] as unknown as OrgRow;
const envWith = (config: ConnectConfig): CompanyEnv => ({ ...TEST_ENV, connect: config } as CompanyEnv);
const hook = (db: FakeDb, extra: Record<string, unknown> = {}) => db.rows('company_webhooks').push({ id: HOOK, org_id: ORG, url: 'https://hooks.example.com/in', secret: 'whsec_' + 's'.repeat(40), events: ['test.graded', 'candidate.finished', 'member.joined', 'member.level_changed', 'seat.changed'], description: null, active: true, disabled_reason: null, failure_count: 0, last_success_at: null, last_failure_at: null, created_at: iso(-DAY), ...extra });

Deno.test('addresses: private, loopback, link-local and metadata are refused in every spelling', () => {
  for (const address of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255', '192.0.2.5', '198.18.0.1', '::1', '::', 'fe80::1', 'fc00::1', 'fd12:3456::1', 'ff02::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:169.254.169.254', '64:ff9b::a9fe:a9fe', '2002:7f00:1::', '2001:db8::1', 'nonsense']) {
    assert(isBlockedAddress(address), address);
  }
  for (const address of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '172.32.0.1', '2606:4700:4700::1111']) assert(!isBlockedAddress(address), address);
});

Deno.test('URLs: refused before they are saved', () => {
  const refused: Record<string, string> = {
    'http://example.com/x': 'not_https', 'ftp://example.com': 'not_https', 'not a url': 'bad_url', 'https://user:pw@example.com/': 'credentials', 'https://example.com:22/': 'port',
    'https://localhost/x': 'private_name', 'https://foo.localhost/': 'private_name', 'https://intranet/': 'private_name', 'https://db.internal/': 'private_name', 'https://printer.local/': 'private_name',
    'https://metadata.google.internal/computeMetadata/v1/': 'private_name', 'https://127.0.0.1/': 'private_address', 'https://169.254.169.254/latest/meta-data/': 'private_address',
    'https://[::1]/': 'private_address', 'https://[::ffff:10.0.0.1]/': 'private_address', 'https://2130706433/': 'private_address', 'https://0x7f.0.0.1/': 'private_address', 'https://0177.0.0.1/': 'private_address', 'https://127.1/': 'private_address',
    'https://localhost./': 'private_name',
  };
  for (const [url, problem] of Object.entries(refused)) assertEquals(urlProblem(url), problem, url);
  for (const url of ['https://example.com/hook', 'https://example.com:8443/hook', 'https://hooks.example.co.uk/a?b=c', 'https://8.8.8.8/hook']) assertEquals(urlProblem(url), null, url);
});

Deno.test('transport: a name that resolves inward, a redirect or a failed lookup is refused', async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const respond = (status: number) => (url: string, init: RequestInit) => { calls.push({ url, init }); return Promise.resolve({ status, body: null }); };
  const request = { url: 'https://hooks.example.com/in', body: '{}', headers: { 'X-Schood-Event': 'x' } };

  let send = createWebhookTransport({ fetch: respond(200), resolve: () => Promise.resolve(['169.254.169.254']) });
  assertEquals(await send(request), { ok: false, error: 'blocked_address' });
  // One bad address among good ones is enough: the connection could pick either.
  send = createWebhookTransport({ fetch: respond(200), resolve: () => Promise.resolve(['8.8.8.8', '10.0.0.1']) });
  assertEquals(await send(request), { ok: false, error: 'blocked_address' });
  send = createWebhookTransport({ fetch: respond(200), resolve: () => Promise.reject(new Error('dns')) });
  assertEquals(await send(request), { ok: false, error: 'dns_failed' });
  send = createWebhookTransport({ fetch: respond(200), resolve: () => Promise.resolve([]) });
  assertEquals(await send(request), { ok: false, error: 'dns_failed' });
  assertEquals(calls.length, 0);

  send = createWebhookTransport({ fetch: respond(200), resolve: () => Promise.resolve(['8.8.8.8']) });
  assertEquals(await send(request), { ok: true, status: 200 });
  assertEquals(calls[0].init.redirect, 'manual');
  assertEquals((calls[0].init.headers as Record<string, string>)['X-Schood-Event'], 'x');
  for (const status of [301, 302, 307, 308]) {
    send = createWebhookTransport({ fetch: respond(status), resolve: () => Promise.resolve(['8.8.8.8']) });
    assertEquals(await send(request), { ok: false, status, error: 'redirect_refused' });
  }
  send = createWebhookTransport({ fetch: respond(0), resolve: () => Promise.resolve(['8.8.8.8']) });
  assertEquals((await send(request)).error, 'redirect_refused');
  send = createWebhookTransport({ fetch: respond(500), resolve: () => Promise.resolve(['8.8.8.8']) });
  assertEquals(await send(request), { ok: false, status: 500, error: 'http_500' });
  send = createWebhookTransport({ fetch: () => Promise.reject(new Error('down')), resolve: () => Promise.resolve(['8.8.8.8']) });
  assertEquals((await send(request)).error, 'network');
  const before = calls.length;
  send = createWebhookTransport({ fetch: respond(200), resolve: () => Promise.resolve(['8.8.8.8']) });
  assertEquals((await send({ ...request, url: 'https://127.0.0.1/x' })).error, 'blocked_address');
  assertEquals(calls.length, before);
});

Deno.test('signature: HMAC-SHA256 over timestamp and body, checkable by a receiver', async () => {
  const signature = await signPayload('secret', '{"a":1}', NOW);
  const [stamp, value] = signature.split(',');
  assertEquals(stamp, `t=${NOW.getTime() / 1000}`);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('secret'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expected = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${NOW.getTime() / 1000}.{"a":1}`));
  assertEquals(value, `v1=${[...new Uint8Array(expected)].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`);
  assertNotEquals(await signPayload('other', '{"a":1}', NOW), signature);
});

/** A real local TLS server for hooks.example.com. `answer` decides what each connection gets back. */
async function tlsServer(answer: (request: string) => string | null) {
  const { cert, key } = await selfSignedCert('hooks.example.com');
  const listener = Deno.listenTls({ hostname: '127.0.0.1', port: 0, cert, key });
  const seen: string[] = [], open: Deno.Conn[] = [];
  const served = (async () => {
    for await (const conn of listener) {
      open.push(conn);
      (async () => {
        try {
          const buffer = new Uint8Array(8192);
          const read = await conn.read(buffer);
          const request = new TextDecoder().decode(buffer.subarray(0, read ?? 0));
          seen.push(request);
          const reply = answer(request);
          if (reply !== null) { await conn.write(new TextEncoder().encode(reply)); conn.close(); }
        } catch (cause) {
          seen.push(`refused: ${(cause as Error).message}`);
        }
      })();
    }
  })();
  const port = (listener.addr as Deno.NetAddr).port;
  const asked: { hostname: string; port: number }[] = [];
  // Records where the sender asked to go, then reaches the local server instead.
  const connect = (options: { hostname: string; port: number }) => { asked.push(options); return Deno.connect({ hostname: '127.0.0.1', port }); };
  const close = async () => {
    listener.close();
    for (const conn of open) try { conn.close(); } catch { /* closed */ }
    await served.catch(() => undefined);
  };
  return { cert, seen, asked, connect, close };
}

Deno.test('transport pins the validated DNS answer and retains the original TLS identity (real TLS server)', async () => {
  const server = await tlsServer(() => 'HTTP/1.1 204 No Content\r\nConnection: close\r\n\r\n');
  try {
    const send = createWebhookTransport({
      resolve: () => Promise.resolve(['93.184.216.34']),
      fetch: (url, init, address) => pinnedHttps(url, init, address, { caCerts: [server.cert], connect: server.connect }),
    });
    assertEquals(await send({ url: 'https://hooks.example.com/in?x=1', body: '{}', headers: { 'X-Schood-Event': 'test.graded' } }), { ok: true, status: 204 });
    // The socket went to the answer that passed validation, never the name.
    assertEquals(server.asked, [{ hostname: '93.184.216.34', port: 443 }]);
    const [request] = server.seen;
    assert(request.startsWith('POST /in?x=1 HTTP/1.1\r\nHost: hooks.example.com\r\n'), request);
    assert(/\r\ncontent-length: 2\r\n/i.test(request), request);
    assert(/\r\nconnection: close\r\n/i.test(request), request);
    assert(/\r\nx-schood-event: test.graded\r\n/i.test(request), request);
    assert(/\r\ncontent-type: application\/json\r\n/i.test(request), request);
    assert(request.endsWith('\r\n\r\n{}'), request);

    // The certificate is checked against the URL's name: one for another name is refused.
    assertEquals((await send({ url: 'https://other.example.com/in', body: '{}', headers: {} })).error, 'network');
    // And against trusted roots: without the test root the self-signed one is refused.
    const strict = createWebhookTransport({ resolve: () => Promise.resolve(['93.184.216.34']), fetch: (url, init, address) => pinnedHttps(url, init, address, { connect: server.connect }) });
    assertEquals((await strict({ url: 'https://hooks.example.com/in', body: '{}', headers: {} })).error, 'network');
    assertEquals(server.seen.filter((line) => line.startsWith('POST')).length, 1);

    // A blocked address is refused before any connection is opened.
    const before = server.asked.length;
    await assertRejects(() => pinnedHttps('https://hooks.example.com/in', { body: '{}' }, '10.0.0.1', { caCerts: [server.cert], connect: server.connect }), Error, 'Blocked');
    assertEquals(server.asked.length, before);
    // Nothing can be smuggled into the request through a header.
    await assertRejects(() => pinnedHttps('https://hooks.example.com/in', { body: '{}', headers: { 'X-A': 'b\r\nX-Injected: 1' } }, '93.184.216.34', { caCerts: [server.cert], connect: server.connect }));
  } finally {
    await server.close();
  }
});

Deno.test('transport: a silent endpoint times out and an endless answer is cut off (real TLS server)', async () => {
  const silent = await tlsServer(() => null);
  const endless = await tlsServer(() => 'HTTP/1.1 200 ' + 'x'.repeat(40_000));
  try {
    const slow = createWebhookTransport({ resolve: () => Promise.resolve(['93.184.216.34']), timeoutMs: 300, fetch: (url, init, address) => pinnedHttps(url, init, address, { caCerts: [silent.cert], connect: silent.connect }) });
    const started = Date.now();
    assertEquals(await slow({ url: 'https://hooks.example.com/in', body: '{}', headers: {} }), { ok: false, error: 'timeout' });
    assert(Date.now() - started < 5_000);
    await assertRejects(() => pinnedHttps('https://hooks.example.com/in', { body: '{}' }, '93.184.216.34', { caCerts: [endless.cert], connect: endless.connect }), Error, 'too long');
    assertEquals(statusLine(new TextEncoder().encode('HTTP/1.1 202 Accepted\r\n')), 202);
    assertEquals(statusLine(new TextEncoder().encode('HTTP/1.1 202 Acc')), null);
  } finally {
    await silent.close();
    await endless.close();
  }
});

Deno.test('register: https public URLs only, HR only, the secret once, capped', async () => {
  const db = world();
  const call = testHandler(db, routes, { now: () => NOW });
  const base = `orgs/${ORG}/connect/webhooks`;
  assertEquals((await call('POST', base, { user: EMP, body: { url: 'https://example.com/x', events: ['test.graded'] } })).status, 403);
  const refused = await call('POST', base, { user: OWNER, body: { url: 'https://169.254.169.254/x', events: ['test.graded'] } });
  assertEquals(refused.body.code, 'webhook_url_refused');
  assertEquals(refused.body.reason, 'private_address');
  assertEquals((await call('POST', base, { user: OWNER, body: { url: 'https://example.com/x', events: [] } })).status, 400);
  assertEquals((await call('POST', base, { user: OWNER, body: { url: 'https://example.com/x', events: ['nope'] } })).status, 400);
  const made = await call('POST', base, { user: OWNER, body: { url: 'https://example.com/x', events: ['test.graded'], description: 'ATS' } });
  assert(String(made.body.secret).startsWith('whsec_'));
  assertEquals(made.body.webhook.secret, undefined);
  const list = await call('GET', base, { user: OWNER });
  assertEquals(list.body.function_on, false);
  assert(!JSON.stringify(list.body).includes(made.body.secret));
  for (let index = 0; index < 4; index++) await call('POST', base, { user: OWNER, body: { url: `https://example.com/${index}`, events: ['test.graded'] } });
  assertEquals((await call('POST', base, { user: OWNER, body: { url: 'https://example.com/y', events: ['test.graded'] } })).body.code, 'too_many_webhooks');
  const id = made.body.webhook.id;
  assertEquals((await call('PATCH', `${base}/${id}`, { user: OWNER, body: { url: 'http://example.com' } })).status, 400);
  assertEquals((await call('PATCH', `${base}/${id}`, { user: OWNER, body: { active: false } })).body.webhook.active, false);
  const rotated = await call('POST', `${base}/${id}/rotate`, { user: OWNER });
  assertNotEquals(rotated.body.secret, made.body.secret);
  assertEquals(db.rows('company_webhooks').find((row) => row.id === id)!.secret, rotated.body.secret);
  // Another workspace cannot reach it.
  assertEquals((await call('GET', `orgs/${OTHER}/connect/webhooks/${id}/deliveries`, { user: OWNER })).status, 403);
  db.rows('company_members').push({ id: 'x', org_id: OTHER, user_id: EMP, role: 'owner', status: 'active' });
  assertEquals((await call('GET', `orgs/${OTHER}/connect/webhooks/${id}/deliveries`, { user: EMP })).status, 404);
  assertEquals((await call('DELETE', `${base}/${id}`, { user: OWNER })).status, 200);
});

Deno.test('with the switch off nothing is scanned, queued or sent, and the test button says so', async () => {
  const db = world();
  hook(db);
  db.rows('company_attempts').push({ id: 'a1', org_id: ORG, assessment_id: 't', member_id: M_EMP, status: 'graded', overall_level: 'b1', overall_score: 50, graded_at: iso(-3600_000) });
  const sent: unknown[] = [];
  const adapter: WebhookAdapter = (request) => { sent.push(request); return Promise.resolve({ ok: true, status: 200 }); };
  for (const config of [{}, { webhooksEnabled: false, webhook: adapter }, { webhooksEnabled: true }] as ConnectConfig[]) {
    assertEquals(await scanEvents(db, envWith(config), org(db), NOW), 0);
    assertEquals(await emitEvent(db, envWith(config), { org_id: ORG, type: 'test.graded', id: 'x', data: {} }, NOW), 0);
    assertEquals((await processQueue(db, envWith(config), NOW)).sent, 0);
  }
  assertEquals(db.rows('company_webhook_deliveries').length, 0);
  const call = testHandler(db, routes, { now: () => NOW, env: { connect: { webhooksEnabled: false, webhook: adapter } } as Partial<CompanyEnv> });
  const test = await call('POST', `orgs/${ORG}/connect/webhooks/${HOOK}/test`, { user: OWNER });
  assertEquals(test.body.sent, false);
  assertEquals(test.body.reason, 'webhooks_off');
  assertEquals(db.rows('company_webhook_deliveries').length, 0);
  assertEquals(sent.length, 0);
});

Deno.test('events are found once, only after the endpoint existed, and hold no personal details', async () => {
  const db = world();
  hook(db, { created_at: iso(-DAY) });
  db.rows('company_attempts').push(
    { id: 'a1', org_id: ORG, assessment_id: 't', member_id: M_EMP, status: 'graded', overall_level: 'b1', overall_score: '50.5', graded_at: iso(-3600_000), certificate_code: 'C1' },
    { id: 'a2', org_id: ORG, assessment_id: 't', member_id: null, candidate_name: 'Secret Name', candidate_email: 's@x.test', status: 'submitted', submitted_at: iso(-3600_000) },
    { id: 'old', org_id: ORG, assessment_id: 't', member_id: M_EMP, status: 'graded', overall_level: 'a2', overall_score: 30, graded_at: iso(-3 * DAY) },
    { id: 'theirs', org_id: OTHER, assessment_id: 'z', member_id: null, status: 'submitted', submitted_at: iso(-3600_000) },
  );
  Object.assign(db.rows('company_members')[1], { joined_at: iso(-3600_000), level: 'b1', level_source: 'placement', level_at: iso(-3600_000) });
  db.rows('company_audit').push({ id: 11, org_id: ORG, action: 'member.seat_on', target: M_EMP, created_at: iso(-3600_000) });
  const env = envWith({ webhooksEnabled: true, webhook: () => Promise.resolve({ ok: true, status: 200 }) });
  assertEquals(await scanEvents(db, env, org(db), NOW), 5);
  const events = db.rows('company_webhook_deliveries').map((row) => row.event).sort();
  assertEquals(events, ['candidate.finished', 'member.joined', 'member.level_changed', 'seat.changed', 'test.graded']);
  assert(!JSON.stringify(db.rows('company_webhook_deliveries')).includes('Secret Name'));
  assert(!JSON.stringify(db.rows('company_webhook_deliveries')).includes('s@x.test'));
  assertEquals((db.rows('company_webhook_deliveries').find((row) => row.event === 'test.graded')!.payload as Record<string, unknown>).overall_score, 50.5);
  assertEquals(await scanEvents(db, env, org(db), new Date(NOW.getTime() + 60_000)), 0);
  // Only events an endpoint subscribed to.
  const picky = world();
  hook(picky, { events: ['seat.changed'] });
  picky.rows('company_attempts').push({ id: 'a1', org_id: ORG, assessment_id: 't', member_id: M_EMP, status: 'graded', graded_at: iso(-3600_000) });
  assertEquals(await scanEvents(picky, env, org(picky), NOW), 0);
});

function queued(db: FakeDb, extra: Record<string, unknown> = {}) {
  db.rows('company_webhook_deliveries').push({ id: crypto.randomUUID(), org_id: ORG, webhook_id: HOOK, event: 'test.graded', event_id: 'e1', payload: { attempt_id: 'a1' }, status: 'queued', attempts: 0, next_attempt_at: iso(-1000), response_status: null, error: null, is_test: false, delivered_at: null, created_at: iso(-1000), updated_at: iso(-1000), ...extra });
}

Deno.test('queue: delivers signed once, and a second run finds nothing', async () => {
  const db = world();
  hook(db);
  queued(db);
  const sent: { url: string; body: string; headers: Record<string, string> }[] = [];
  const env = envWith({ webhooksEnabled: true, webhook: (request) => { sent.push(request); return Promise.resolve({ ok: true, status: 204 }); } });
  assertEquals((await processQueue(db, env, NOW)).sent, 1);
  assertEquals((await processQueue(db, env, NOW)).sent, 0);
  assertEquals(sent.length, 1);
  const body = JSON.parse(sent[0].body);
  assertEquals(body.type, 'test.graded');
  assertEquals(body.id, 'e1');
  assertEquals(body.workspace_id, ORG);
  assertEquals(sent[0].headers['X-Schood-Signature'], await signPayload('whsec_' + 's'.repeat(40), sent[0].body, NOW));
  const row = db.rows('company_webhook_deliveries')[0];
  assertEquals(row.status, 'sent');
  assertEquals(row.response_status, 204);
  assertEquals(db.rows('company_webhooks')[0].last_success_at, NOW.toISOString());
});

Deno.test('queue: backs off on failure, stops after the last try, and a retry starts fresh', async () => {
  const db = world();
  hook(db);
  queued(db);
  const env = envWith({ webhooksEnabled: true, webhook: () => Promise.resolve({ ok: false, status: 500, error: 'http_500' }) });
  let at = NOW;
  for (const seconds of BACKOFF_SECONDS) {
    assertEquals((await processQueue(db, env, at)).failed, 1);
    const row = db.rows('company_webhook_deliveries')[0];
    assertEquals(row.status, 'queued');
    assertEquals(row.next_attempt_at, new Date(at.getTime() + seconds * 1000).toISOString());
    // Not due yet: nothing happens.
    assertEquals((await processQueue(db, env, at)).failed, 0);
    at = new Date(at.getTime() + seconds * 1000);
  }
  assertEquals((await processQueue(db, env, at)).failed, 1);
  const row = db.rows('company_webhook_deliveries')[0];
  assertEquals(row.status, 'dead');
  assertEquals(row.attempts, BACKOFF_SECONDS.length + 1);
  assertEquals(row.error, 'http_500');
  const off = testHandler(db, routes, { now: () => NOW });
  const path = `orgs/${ORG}/connect/webhooks/${HOOK}/deliveries`;
  assertEquals((await off('POST', `${path}/${row.id}/retry`, { user: OWNER })).body.code, 'webhooks_off');
  const call = testHandler(db, routes, { now: () => NOW, env: { connect: { webhooksEnabled: true, webhook: () => Promise.resolve({ ok: true }) } } as Partial<CompanyEnv> });
  const log = await call('GET', path, { user: OWNER });
  assertEquals(log.body.deliveries[0].status, 'dead');
  assertEquals(log.body.deliveries[0].payload, undefined);
  assertEquals((await call('GET', `${path}?status=dead`, { user: OWNER })).body.deliveries.length, 1);
  assertEquals((await call('GET', `${path}?status=weird`, { user: OWNER })).status, 400);
  assertEquals((await call('POST', `${path}/${row.id}/retry`, { user: EMP })).status, 403);
  assertEquals((await call('POST', `${path}/${row.id}/retry`, { user: OWNER })).status, 200);
  assertEquals(row.status, 'queued');
  assertEquals(row.attempts, 0);
  assertEquals((await call('POST', `${path}/${row.id}/retry`, { user: OWNER })).body.code, 'delivery_not_retryable');
});

Deno.test('queue: many failures turn an endpoint off and tell HR', async () => {
  const db = world();
  hook(db, { failure_count: 29 });
  queued(db);
  const env = envWith({ webhooksEnabled: true, webhook: () => Promise.resolve({ ok: false, error: 'timeout' }) });
  await processQueue(db, env, NOW);
  assertEquals(db.rows('company_webhooks')[0].active, false);
  assertEquals(db.rows('company_webhooks')[0].disabled_reason, 'too_many_failures');
  assertEquals(db.rows('company_notices').filter((row) => row.kind === 'webhook_disabled').map((row) => row.member_id), [M_OWNER]);
  // What was waiting for it stops rather than going out.
  queued(db, { event_id: 'e2' });
  assertEquals((await processQueue(db, env, NOW)).dropped, 1);
});

Deno.test('queue: a paused workspace sends nothing and a URL that became private is refused', async () => {
  const db = world();
  hook(db);
  queued(db);
  db.rows('company_orgs')[0].status = 'suspended';
  const sent: unknown[] = [];
  const env = envWith({ webhooksEnabled: true, webhook: (request) => { sent.push(request); return Promise.resolve({ ok: true }); } });
  assertEquals((await processQueue(db, env, NOW)).dropped, 1);
  assertEquals(db.rows('company_webhook_deliveries')[0].error, 'workspace_inactive');
  const inward = world();
  hook(inward, { url: 'https://127.0.0.1/x' });
  queued(inward);
  await processQueue(inward, env, NOW);
  assertEquals(sent.length, 0);
  assertEquals(inward.rows('company_webhook_deliveries')[0].error, 'blocked_address');
});

Deno.test('queue: a row left mid-send goes again; two runs cannot both take one', async () => {
  const db = world();
  hook(db);
  queued(db, { status: 'delivering', attempts: 1, updated_at: iso(-3600_000) });
  let count = 0;
  const env = envWith({ webhooksEnabled: true, webhook: () => { count++; return Promise.resolve({ ok: true }); } });
  assertEquals((await processQueue(db, env, NOW)).sent, 1);
  assertEquals(count, 1);
  const fresh = world();
  hook(fresh);
  queued(fresh, { status: 'delivering', attempts: 1, updated_at: iso(-1000) });
  assertEquals((await processQueue(fresh, env, NOW)).sent, 0);
  assertEquals(count, 1);
});

Deno.test('queue: one workspace’s backlog does not hold up another’s delivery', async () => {
  const db = world();
  hook(db);
  const THEIR_HOOK = '70000000-0000-4000-8000-000000000002';
  db.rows('company_webhooks').push({ ...db.rows('company_webhooks')[0], id: THEIR_HOOK, org_id: OTHER });
  // 500 rows for Acme, all older than the other workspace's single event.
  for (let index = 0; index < 500; index++) queued(db, { id: crypto.randomUUID(), event_id: `bulk:${index}`, next_attempt_at: iso(-600_000 + index), created_at: iso(-600_000) });
  queued(db, { id: crypto.randomUUID(), org_id: OTHER, webhook_id: THEIR_HOOK, event_id: 'theirs', next_attempt_at: iso(-1000 + 1) });
  const order: string[] = [];
  const env = envWith({ webhooksEnabled: true, webhook: (request) => { order.push(JSON.parse(request.body).workspace_id); return Promise.resolve({ ok: true, status: 200 }); } });
  const first = await processQueue(db, env, NOW);
  // The other workspace goes out in the first run, near the front, and the run still uses its whole capacity.
  assertEquals(first.sent, 100);
  assertEquals(order.filter((id) => id === OTHER).length, 1);
  assert(order.indexOf(OTHER) < 2, `position ${order.indexOf(OTHER)}`);
  assertEquals(db.rows('company_webhook_deliveries').find((row) => row.event_id === 'theirs')!.status, 'sent');
  // The backlog drains oldest first, run by run.
  assertEquals((await processQueue(db, env, NOW)).sent, 100);
  assertEquals(db.rows('company_webhook_deliveries').filter((row) => row.status === 'sent').length, 200);
  assertEquals(db.rows('company_webhook_deliveries').filter((row) => row.status === 'queued' && String(row.event_id) < 'bulk:1').length, 0);
});

Deno.test('queue: each send is signed when it leaves, and a run stops starting sends when out of time', async () => {
  const db = world();
  hook(db);
  for (const id of ['e1', 'e2', 'e3']) queued(db, { id: crypto.randomUUID(), event_id: id });
  const sent: { body: string; headers: Record<string, string> }[] = [];
  const env = envWith({ webhooksEnabled: true, webhook: (request) => { sent.push(request); return Promise.resolve({ ok: true, status: 200 }); } });
  // A slow run: every send happens 400 s after the one before.
  let tick = 0;
  const clock = () => new Date(NOW.getTime() + (++tick) * 400_000);
  assertEquals((await processQueue(db, env, NOW, 100, { clock })).sent, 3);
  for (const [index, request] of sent.entries()) {
    const stamp = Number(request.headers['X-Schood-Signature'].match(/^t=(\d+),/)![1]);
    assertEquals(stamp, NOW.getTime() / 1000 + (index + 1) * 400);
    assertEquals(request.headers['X-Schood-Signature'], await signPayload('whsec_' + 's'.repeat(40), request.body, new Date(stamp * 1000)));
  }
  // Out of budget before the first send: nothing is claimed, so nothing is lost or counted as a try.
  const late = world();
  hook(late);
  queued(late);
  assertEquals(await processQueue(late, env, NOW, 100, { budgetMs: -1 }), { sent: 0, failed: 0, dropped: 0 });
  assertEquals([late.rows('company_webhook_deliveries')[0].status, late.rows('company_webhook_deliveries')[0].attempts], ['queued', 0]);
});

Deno.test('test button delivers once when on, one try only', async () => {
  const db = world();
  hook(db);
  const sent: { body: string }[] = [];
  let answer: { ok: boolean; status?: number; error?: string } = { ok: true, status: 200 };
  const call = testHandler(db, routes, { now: () => NOW, env: { connect: { webhooksEnabled: true, webhook: (request: { url: string; body: string; headers: Record<string, string> }) => { sent.push(request); return Promise.resolve(answer); } } } as Partial<CompanyEnv> });
  const path = `orgs/${ORG}/connect/webhooks/${HOOK}/test`;
  const good = await call('POST', path, { user: OWNER });
  assertEquals(good.body.sent, true);
  assertEquals(good.body.response_status, 200);
  assertEquals(JSON.parse(sent[0].body).test, true);
  answer = { ok: false, status: 503, error: 'http_503' };
  const bad = await call('POST', path, { user: OWNER });
  assertEquals(bad.body.sent, false);
  assertEquals(bad.body.error, 'http_503');
  assertEquals(db.rows('company_webhook_deliveries').filter((row) => row.status === 'queued').length, 0);
});

Deno.test('the body has stable names', () => {
  assertEquals(Object.keys(JSON.parse(eventBody({ event: 'a', event_id: 'b', payload: {}, created_at: 'c', is_test: false, org_id: 'd' }))), ['id', 'type', 'created_at', 'workspace_id', 'test', 'data']);
});
