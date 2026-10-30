import { signTelegramInitDataForTest } from '../../../supabase/functions/_shared/telegram-init-data.ts';
import { loadPacks } from '../../../packages/coach-packs/src/registry.ts';
import type { Delivery } from '../../../packages/coach-packs/src/wire.ts';
import { keyboard, splitHtml } from '../src/telegram.ts';
import { createWorker, envKey, SUBREQUESTS } from '../src/worker.ts';

// The worker on its own: a fake fetch stands in for Telegram, telegram-link,
// schood-ai and the gate, so every outgoing request can be checked.

const assert = (value: unknown, label: string) => { if (!value) throw new Error(label); };
const equal = (actual: unknown, expected: unknown, label: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

const APP = 'https://ai.schood.online';
const TOKEN = { ielts: '7000000001:IELTS-TEST-TOKEN-0123456789abcdef', speaking: '7000000002:SPEAK-TEST-TOKEN-0123456789abcdef' };
const HOOK = { ielts: 'hook-secret-ielts-0123', speaking: 'hook-secret-speaking-01' };
const LINKED = '700100', UNLINKED = '700999';

interface Sent { url: URL; method: string; headers: Headers; body: Record<string, unknown> }
interface Options { functionStatus?: number; functionBody?: unknown; telegramStatus?: (method: string) => number; deliveries?: Delivery[] | null; env?: Record<string, string> }

function stack(options: Options = {}) {
  const sent: Sent[] = [];
  const fetch = async (input: Request | string | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    const text = await request.text();
    let body: Record<string, unknown> = {};
    try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
    sent.push({ url, method: request.method, headers: request.headers, body });
    if (url.hostname === 'api.telegram.org') {
      const method = url.pathname.split('/').pop()!;
      const status = options.telegramStatus?.(method) ?? 200;
      return Response.json(status === 200 ? { ok: true, result: { message_id: 1, poll: { id: 'poll-1' } } } : { ok: false, description: 'Forbidden: bot was blocked by the user' }, { status });
    }
    if (url.pathname.endsWith('/telegram-link')) {
      if (body.action === 'status') return Response.json({ linked: body.chat_id === LINKED, user: body.chat_id === LINKED ? { id: 'user-1', name: 'Dilnoza' } : null });
      return Response.json({ ok: false, error: 'Invalid link token' }, { status: 404 });
    }
    if (url.pathname.includes('/schood-ai/coach/')) {
      if (url.pathname.endsWith('/miniapp-session')) return Response.json({ session: { access_token: 'a', refresh_token: 'r', expires_at: 1 } });
      return Response.json(options.functionBody ?? { messages: [{ kind: 'text', html: 'From the coach', buttons: [[{ text: 'Today', data: 'm:today' }]] }] }, { status: options.functionStatus ?? 200 });
    }
    if (url.pathname.endsWith('/schood-coach-gate/due')) return options.deliveries === null ? new Response('boom', { status: 500 }) : Response.json({ deliveries: options.deliveries ?? [] });
    if (url.pathname.endsWith('/schood-coach-gate/delivered')) return Response.json({ updated: (body.results as unknown[]).length });
    return new Response('not found', { status: 404 });
  };
  const env = {
    APP_URL: APP, SUPABASE_URL: 'https://coach-test.supabase.co', SUPABASE_ANON_KEY: 'anon-public-key', SCHOOD_AI_SERVICE_SECRET: 'service-secret-0123456789abcdef', TELEGRAM_INTERNAL_SECRET: 'internal-secret-0123456789',
    COACH_BOT_TOKEN_IELTS: TOKEN.ielts, COACH_WEBHOOK_SECRET_IELTS: HOOK.ielts, COACH_BOT_TOKEN_SPEAKING: TOKEN.speaking, COACH_WEBHOOK_SECRET_SPEAKING: HOOK.speaking,
    ...options.env,
  };
  const worker = createWorker({ env, packs: loadPacks(), fetch, now: () => new Date('2026-11-02T06:00:00Z') });
  let updateId = 1;
  const hook = (pack: string, update: Record<string, unknown>, secret: string | null = HOOK[pack as 'ielts'] ?? '') => worker.fetch(new Request(`https://coach-bots.schood.online/tg/${pack}`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...(secret === null ? {} : { 'x-telegram-bot-api-secret-token': secret }) }, body: JSON.stringify({ update_id: updateId++, ...update }),
  }));
  const message = (chat: string, text: string, type = 'private') => ({ message: { message_id: 5, date: 1_793_000_000, chat: { id: Number(chat), type }, from: { id: Number(chat), is_bot: false, first_name: 'Dilnoza', language_code: 'ru' }, text } });
  const tap = (chat: string, data: string) => ({ callback_query: { id: 'cb-1', data, from: { id: Number(chat), is_bot: false, first_name: 'Dilnoza', language_code: 'uz' }, message: { message_id: 9, date: 1_793_000_000, chat: { id: Number(chat), type: 'private' } } } });
  const telegramCalls = () => sent.filter((entry) => entry.url.hostname === 'api.telegram.org').map((entry) => entry.url.pathname.split('/').pop()!);
  const to = (suffix: string) => sent.filter((entry) => entry.url.pathname.endsWith(suffix));
  return { worker, sent, hook, message, tap, telegramCalls, to };
}

Deno.test('worker: keyboards, long messages and pack env keys', () => {
  const markup = keyboard([[{ text: 'Open', app: '/coach/ielts/report' }, { text: 'Site', url: 'https://schood.online' }], [{ text: 'Unsafe', url: 'http://example.com', data: 'x:1' }, { text: 'Long', data: 'd'.repeat(80) }]], APP)!;
  equal(markup.inline_keyboard[0], [{ text: 'Open', web_app: { url: `${APP}/coach/ielts/report` } }, { text: 'Site', url: 'https://schood.online' }], 'Mini App pages open on the app origin');
  equal(markup.inline_keyboard[1].map((button) => (button as { callback_data?: string }).callback_data?.length), [3, 64], 'non-https links fall back to a button; data is cut to 64 bytes');
  equal(keyboard([], APP), undefined, 'no keyboard');
  const long = Array.from({ length: 30 }, (_, i) => `Paragraph ${i} ${'x'.repeat(300)}`).join('\n\n');
  const parts = splitHtml(long);
  assert(parts.length > 1 && parts.every((part) => part.length <= 3900) && parts.join('\n\n') === long, 'split at paragraph breaks, nothing lost');
  equal(splitHtml('y'.repeat(5000)).map((part) => part.length), [3900], 'one huge paragraph is cut');
  equal(envKey('maths-hints'), 'MATHS_HINTS', 'env key of a pack id');
});

Deno.test('worker: webhooks need the bot\'s secret token; the previous one works while rotating', async () => {
  const s = stack({ env: { COACH_WEBHOOK_SECRET_IELTS_PREVIOUS: 'old-hook-secret-0123', COACH_WEBHOOK_SECRET_SPEAKING_PREVIOUS: 'short' } });
  equal((await s.hook('ielts', s.message(LINKED, 'hi'), null)).status, 401, 'no secret');
  equal((await s.hook('ielts', s.message(LINKED, 'hi'), HOOK.speaking)).status, 401, 'another bot\'s secret');
  equal((await s.hook('speaking', s.message(LINKED, 'hi'), 'short')).status, 401, 'secrets under 16 characters are ignored');
  equal(s.sent.length, 0, 'nothing relayed for a refused webhook');
  equal((await s.hook('ielts', s.message(LINKED, 'hi'), 'old-hook-secret-0123')).status, 200, 'the previous secret while rotating');
  equal((await s.worker.fetch(new Request('https://coach-bots.schood.online/tg/ielts'))).status, 404, 'GET is not a webhook');
  equal((await s.worker.fetch(new Request('https://coach-bots.schood.online/tg/nope', { method: 'POST' }))).status, 404, 'unknown coach');
  equal((await s.worker.fetch(new Request('https://coach-bots.schood.online/elsewhere'))).status, 404, 'unknown path');
  const health = await (await s.worker.fetch(new Request('https://coach-bots.schood.online/health'))).json();
  equal(health, { ok: true, coaches: ['ielts', 'speaking'] }, 'health lists coaches with a token');
  const noToken = stack({ env: { COACH_BOT_TOKEN_SPEAKING: '' } });
  equal((await noToken.hook('speaking', noToken.message(LINKED, 'hi'))).status, 404, 'a coach without a token is off');
});

Deno.test('worker: linked people go to the engine with the service secret; groups and bots are ignored', async () => {
  const s = stack();
  await s.hook('ielts', s.message(LINKED, 'I live in Tashkent'));
  const relay = s.to('/schood-ai/coach/update');
  equal(relay.length, 1, 'relayed once');
  equal([relay[0].headers.get('x-schood-service-secret'), relay[0].headers.get('x-schood-user-id'), relay[0].headers.get('x-schood-telegram-chat-id'), relay[0].headers.get('authorization'), relay[0].headers.get('origin')], ['service-secret-0123456789abcdef', 'user-1', LINKED, null, null], 'service headers, never a bearer or an Origin');
  equal([relay[0].body.pack, relay[0].body.locale, (relay[0].body.event as { type: string }).type], ['ielts', 'ru', 'text'], 'the event');
  equal(s.to('/telegram-link').every((entry) => entry.headers.get('authorization') === null), true, 'telegram-link gets the worker secret only');
  assert(s.telegramCalls().includes('sendMessage'), 'the reply is sent');
  const reply = s.sent.find((entry) => entry.url.pathname.endsWith('/sendMessage'))!;
  equal([reply.body.text, reply.body.parse_mode, (reply.body.reply_markup as { inline_keyboard: unknown[] }).inline_keyboard.length], ['From the coach', 'HTML', 1], 'as HTML with its buttons');
  const before = s.sent.length;
  await s.hook('ielts', s.message(LINKED, 'hello group', 'group'));
  await s.hook('ielts', { message: { message_id: 1, date: 1, chat: { id: 1, type: 'private' }, from: { id: 1, is_bot: true, first_name: 'Bot' }, text: 'hi' } });
  equal(s.sent.length, before, 'groups and bots are ignored');
  await s.hook('ielts', s.tap(LINKED, 'm:today'));
  assert(s.telegramCalls().includes('answerCallbackQuery'), 'taps are answered');
});

Deno.test('worker: engine errors become a short apology; an unlinked account gets the welcome again', async () => {
  const failing = stack({ functionStatus: 500, functionBody: { code: 'internal' } });
  await failing.hook('ielts', failing.message(LINKED, 'hi'));
  equal(failing.telegramCalls().filter((call) => call === 'sendMessage').length, 1, 'one apology');
  const unlinked = stack({ functionStatus: 403, functionBody: { code: 'user_not_linked' } });
  await unlinked.hook('ielts', unlinked.message(LINKED, 'hi'));
  const welcome = unlinked.sent.find((entry) => entry.url.pathname.endsWith('/sendMessage'))!;
  assert(JSON.stringify(welcome.body.reply_markup).includes(`${APP}/coach/ielts/link`), 'the link button');
});

Deno.test('worker: people who have not linked get the placement test with no engine call', async () => {
  const s = stack();
  await s.hook('ielts', s.message(UNLINKED, '/start'));
  const welcome = s.sent.find((entry) => entry.url.pathname.endsWith('/sendMessage'))!;
  const buttons = JSON.stringify(welcome.body.reply_markup);
  assert(buttons.includes('ul:test:') && buttons.includes(`${APP}/coach/ielts/link`) && buttons.includes('/coach/ielts/samples'), 'test, link and examples');
  await s.hook('ielts', s.tap(UNLINKED, 'ul:test:uz'));
  const question = s.sent.filter((entry) => entry.url.pathname.endsWith('/sendMessage')).at(-1)!;
  const first = (question.body.reply_markup as { inline_keyboard: { callback_data: string }[][] }).inline_keyboard.flat().map((button) => button.callback_data).find((data) => data?.startsWith('dg:'))!;
  assert(first && first.length <= 64, 'answers ride in the button data');
  await s.hook('ielts', s.tap(UNLINKED, first));
  assert(s.telegramCalls().includes('editMessageText'), 'the next question replaces the last');
  equal(s.to('/schood-ai/coach/update').length, 0, 'no engine call (no AI, no storage) before linking');
  await s.hook('ielts', s.message(UNLINKED, `/start ${'b'.repeat(64)}`));
  const failed = s.sent.filter((entry) => entry.url.pathname.endsWith('/sendMessage')).at(-1)!;
  assert(String(failed.body.text).length > 0 && s.to('/telegram-link').some((entry) => entry.body.action === 'validate'), 'a link token is checked with telegram-link');
});

Deno.test('worker: Mini App sign-in checks the bot token and the app origin', async () => {
  const s = stack();
  const call = (body: unknown, origin: string | null = APP, method = 'POST') => s.worker.fetch(new Request('https://coach-bots.schood.online/miniapp/session', { method, headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) }, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}) }));
  const data = (chat: string, token: string) => signTelegramInitDataForTest({ auth_date: String(Math.floor(Date.parse('2026-11-02T05:00:00Z') / 1000)), query_id: 'q', user: JSON.stringify({ id: Number(chat), first_name: 'Dilnoza' }) }, token);
  equal((await call({ init_data: 'x' }, 'https://evil.example')).status, 403, 'another origin');
  equal((await call(null, APP, 'OPTIONS')).status, 204, 'preflight from the app');
  equal((await call({ init_data: 'hash=00&user=%7B%7D' })).status, 401, 'unsigned data');
  equal((await call({ pack: 'nope', init_data: await data(LINKED, TOKEN.ielts) })).status, 400, 'unknown coach');
  equal((await call({ pack: 'speaking', init_data: await data(LINKED, TOKEN.ielts) })).status, 401, 'signed by another bot than the one named');
  const matched = await (await call({ init_data: await data(LINKED, TOKEN.speaking) })).json();
  equal([matched.linked, matched.pack, matched.session.access_token], [true, 'speaking', 'a'], 'with no coach named, the bot whose token verifies');
  const relay = s.to('/schood-ai/coach/miniapp-session').at(-1)!;
  equal([relay.headers.get('x-schood-user-id'), relay.headers.get('x-schood-telegram-chat-id')], ['user-1', LINKED], 'the function checks it again for that account');
  const outsider = await (await call({ pack: 'ielts', init_data: await data(UNLINKED, TOKEN.ielts) })).json();
  equal([outsider.linked, outsider.link_url], [false, `${APP}/coach/ielts/link`], 'not linked: the link page');
  const response = await call({ init_data: await data(LINKED, TOKEN.ielts) });
  equal([response.headers.get('access-control-allow-origin'), response.headers.get('cache-control')], [APP, 'no-store'], 'CORS for the app only, never cached');
});

Deno.test('worker: the cron sends due reminders within the subrequest budget and reports what happened', async () => {
  const message = (text: string) => [{ kind: 'text' as const, html: text, buttons: [[{ text: 'Open', data: 'm:today' }]] }];
  const deliveries: Delivery[] = [
    ...Array.from({ length: 40 }, (_, i) => ({ id: String(i + 1), pack: i % 2 ? 'ielts' : 'speaking', chatId: String(800000 + i), messages: message(`Reminder ${i}`) })),
    { id: '98', pack: 'retired', chatId: '1', messages: message('x') },
    { id: '99', pack: 'ielts', chatId: 'not-a-chat', messages: message('x') },
  ];
  const s = stack({ deliveries, telegramStatus: (method) => (method === 'sendMessage' && s2.blockNext-- > 0 ? 403 : 200) });
  const s2 = { blockNext: 1 };
  const result = await s.worker.cron();
  equal([result.sent, result.blocked, result.failed], [39, 1, 2], 'sent, blocked by the person, no bot');
  assert(s.sent.length <= SUBREQUESTS, `${s.sent.length} subrequests in one run (limit ${SUBREQUESTS})`);
  const due = s.to('/schood-coach-gate/due')[0];
  equal([due.headers.get('apikey'), due.headers.get('x-schood-service-secret')], ['anon-public-key', 'service-secret-0123456789abcdef'], 'the gate gets the public anon key and the worker secret');
  const report = s.to('/schood-coach-gate/delivered')[0].body.results as { id: string; status: string; reason?: string }[];
  equal(report.length, 42, 'every delivery reported');
  equal(report.filter((entry) => entry.reason === 'no_bot').map((entry) => entry.id), ['98', '99'], 'unknown coach or chat');
  equal(report.find((entry) => entry.status === 'blocked')?.reason, 'bot_blocked', 'a blocked bot stops further reminders');

  const big = stack({ deliveries: Array.from({ length: 30 }, (_, i) => ({ id: String(i + 1), pack: 'ielts', chatId: String(800000 + i), messages: [...message('a'), ...message('b')] })) });
  const capped = await big.worker.cron();
  assert(big.sent.length <= SUBREQUESTS && capped.sent === 24 && capped.failed === 6, `budget held: ${big.sent.length} subrequests, ${capped.sent} sent`);
  const failed = stack({ deliveries: null });
  equal(await failed.worker.cron(), { sent: 0, failed: 0, blocked: 0 }, 'a failing gate sends nothing');
  equal(failed.to('/schood-coach-gate/delivered').length, 0, 'and reports nothing');
});
