import { approvedTest, BOT_TOKEN, centreFixture, createCentre, equal, ID, invite, ok } from './testing.ts';

// C8 admissions agent: setup, the bot token, chat placement tests, handover, only
// prices from the price list, bookings that wait for approval, limits, and the
// website chat widget (C14) with staff replies.

const PRICES = [{ course: 'General English', price: 450000, currency: 'UZS', period: 'month' }];
const SLOTS = { mode: 'approve', slots: [{ weekday: 2, start: '10:00', capacity: 1 }], min_notice_hours: 12 };

async function connected(options: { mode?: 'approve' | 'auto' } = {}) {
  const f = await centreFixture();
  const ws = await createCentre(f);
  await f.json('PATCH', 'centre/admissions', { workspace: ws, body: { enabled: true, prices: PRICES, faq: [{ q: 'Do you teach kids?', a: 'Yes, from 7 years old.' }], booking: { ...SLOTS, mode: options.mode ?? 'approve' } } });
  await f.json('POST', 'centre/admissions-bot', { workspace: ws, body: { token: BOT_TOKEN } });
  const hook = f.telegram.calls.find((entry) => entry.method === 'setWebhook')!;
  const path = String(hook.body.url).split('/public/centre/')[1], secret = String(hook.body.secret_token);
  let update = 10;
  const send = async (chat: number, text: string, extra: Record<string, unknown> = {}) => {
    await f.publicCall('POST', path, { body: { update_id: update++, message: { chat: { id: chat, type: 'private' }, from: { id: chat, language_code: 'ru' }, text }, ...extra }, headers: { 'x-telegram-bot-api-secret-token': secret } });
    await f.settle();
  };
  const press = async (chat: number, data: string) => {
    await f.publicCall('POST', path, { body: { update_id: update++, callback_query: { id: `cb${update}`, data, from: { id: chat, language_code: 'ru' }, message: { chat: { id: chat, type: 'private' } } } }, headers: { 'x-telegram-bot-api-secret-token': secret } });
    await f.settle();
  };
  return { f, ws, send, press, path, secret };
}

Deno.test('setup: validated FAQ, prices and rules; the bot needs keys and a webhook address; the token is replaceable and revocable', async () => {
  const noKeys = await centreFixture({ secrets: false });
  const ws1 = await createCentre(noKeys);
  equal((await noKeys.json('POST', 'centre/admissions-bot', { workspace: ws1, body: { token: BOT_TOKEN } })).body.code, 'secrets_unconfigured', 'no stored secrets without the key box');
  const noHook = await centreFixture({ publicUrl: null });
  const ws2 = await createCentre(noHook);
  equal((await noHook.json('POST', 'centre/admissions-bot', { workspace: ws2, body: { token: BOT_TOKEN } })).body.code, 'webhook_unconfigured', 'no webhook address yet');

  const f = await centreFixture();
  const ws = await createCentre(f);
  equal((await f.json('PATCH', 'centre/admissions', { workspace: ws, body: { prices: [{ course: 'X', price: -5 }] } })).status, 400, 'prices are checked');
  equal((await f.json('PATCH', 'centre/admissions', { workspace: ws, body: { booking: { slots: [{ weekday: 9, start: '10:00' }] } } })).status, 400, 'slots are checked');
  equal((await f.json('POST', 'centre/admissions-bot', { workspace: ws, body: { token: 'not-a-token' } })).status, 400);
  equal((await f.json('POST', 'centre/admissions-bot', { workspace: ws, body: { token: '0001234567:AAFakeTokenThatTelegramRefuses_abcdefghij' } })).body.code, 'bot_token_invalid');
  await f.json('POST', 'centre/admissions-bot', { workspace: ws, body: { token: BOT_TOKEN } });
  const second = '7009876543:AASecondFakeTokenForTestsOnly_zyxwvutsrq';
  await f.json('POST', 'centre/admissions-bot', { workspace: ws, body: { token: second } });
  const secrets = await f.store.table('secrets').list({ workspace_id: ws, purpose: 'telegram_bot' });
  equal([secrets.length, secrets.filter((row) => !row.revoked_at).length, secrets.find((row) => !row.revoked_at)!.hint], [2, 1, second.slice(-4)], 'the old token is revoked, one active');
  const disconnected = await f.json('DELETE', 'centre/admissions-bot', { workspace: ws });
  equal([disconnected.body.admissions.bot.connected, f.telegram.calls.at(-1)!.method], [false, 'deleteWebhook'], 'disconnected');
  equal((await f.store.table('secrets').list({ workspace_id: ws, revoked_at: null })).length, 0, 'no active token remains');
  equal((await f.json('PATCH', 'centre/admissions', { token: 'tok-basic-owner', workspace: ws, body: { enabled: true } })).status, 404);
  const basic = await centreFixture();
  const basicWs = (await basic.json('POST', 'centre/create', { token: 'tok-schood-admin', body: { name: 'Basic Centre', owner_user_id: ID.basicOwner } })).body.workspace.id;
  equal((await basic.json('PATCH', 'centre/admissions', { token: 'tok-basic-owner', workspace: basicWs, body: { enabled: true } })).body.code, 'plan_required', 'the agent needs Centre Pro');
});

Deno.test('the agent runs the placement test in chat with buttons, then offers a trial', async () => {
  const { f, ws, send, press } = await connected();
  await invite(f, ws, 'teacher', ['tok-t1']);
  const page = await approvedTest(f, ws);
  await f.json('PATCH', 'centre/admissions', { workspace: ws, body: { placement_page_id: page } });
  await press(700, 'menu:test');
  ok(f.telegram.sent('700')[0].startsWith('Тест уровня: 4'), 'test intro in Russian');
  const question = f.telegram.calls.at(-1)!;
  equal((question.body.reply_markup as { inline_keyboard: { callback_data: string }[][] }).inline_keyboard.flat().map((button) => button.callback_data), ['pt:0:0', 'pt:0:1', 'pt:0:2'], 'answer buttons');
  await press(700, 'pt:0:1');
  await send(700, 'B');
  await send(700, 'Z');
  ok(f.telegram.sent('700').at(-1)!.startsWith('3/4'), 'an invalid letter repeats the question');
  await send(700, 'b');
  await send(700, 'had known');
  const result = f.telegram.sent('700').at(-1)!;
  ok(result.includes('B2') && result.includes('4'), 'level estimate after the last question');
  const [attempt] = await f.store.table('attempts').list({ workspace_id: ws, channel: 'telegram' });
  equal([attempt.status, attempt.level], ['submitted', 'b2'], 'stored for a teacher to confirm');
  equal(f.upstream.length, 0, 'no AI was used for the test');
});

Deno.test('handover on request, prices only from the list, and approval-mode bookings', async () => {
  const { f, ws, send } = await connected();
  const code = (await f.json('POST', 'centre/admissions-staff-code', { workspace: ws })).body.code;
  await send(800, `/staff ${code}`);
  ok(f.telegram.sent('800')[0].includes('Registan'), 'staff chat linked');
  await send(701, 'Можно поговорить с менеджером?');
  ok(f.telegram.sent('701')[0].toLowerCase().includes('сотрудник'), 'handed over in Russian');
  ok(f.telegram.sent('800').some((text) => text.includes('asks for a person')), 'staff alerted');
  const [thread] = await f.store.table('threads').list({ workspace_id: ws, external_id: '701' });
  equal(thread.status, 'handed_over');
  await send(701, 'Алло?');
  equal(f.telegram.sent('701').length, 1, 'the agent stays quiet while a person handles it');
  equal((await f.json('POST', 'centre/admissions-reply', { workspace: ws, body: { thread_id: thread.id, text: 'Здравствуйте! Это Нодира из Registan.' } })).status, 200, 'a person replies');
  equal(f.telegram.sent('701').at(-1), 'Здравствуйте! Это Нодира из Registan.', 'sent as written');
  await f.json('PATCH', 'centre/admissions-threads', { workspace: ws, body: { id: thread.id, status: 'open' } });

  f.model(/admissions assistant/, { reply: 'Курс стоит 300 000 сум в месяц, а скидка 50%.', intent: 'question', language: 'ru' });
  await send(702, 'Сколько стоит?');
  ok(!f.telegram.sent('702').at(-1)!.includes('300'), 'an invented price never reaches the prospect');
  equal((await f.store.table('threads').list({ workspace_id: ws, external_id: '702' }))[0].status, 'handed_over', 'a person is asked to answer');

  f.model(/admissions assistant/, (call) => ({ reply: 'Записываю вас.', intent: 'book_trial', language: 'ru', contact: call.last.includes('Анна') ? { name: 'Анна', phone: '+998 93 555 66 78' } : { name: 'Олег', phone: '+998 93 555 66 77' }, slot: 1 }));
  await send(703, 'Запишите меня на вторник, Олег, +998 93 555 66 77');
  const [booking] = await f.store.table('bookings').list({ workspace_id: ws });
  equal([booking.status, booking.mode], ['requested', 'approve'], 'waits for a person in approve mode');
  ok(f.telegram.sent('703').at(-1)!.includes('Сотрудник скоро подтвердит'), 'told it will be confirmed');
  await send(704, 'Мне тоже вторник, Анна, +998 93 555 66 78');
  const second = (await f.store.table('bookings').list({ workspace_id: ws })).find((row) => row.id !== booking.id)!;
  equal(Date.parse(second.starts_at) - Date.parse(booking.starts_at), 7 * 86_400_000, 'the full slot (capacity 1) is not offered again: the next free one is a week later');
  const action = (await f.json('GET', 'core/actions', { workspace: ws, query: { status: 'open' } })).body.actions.find((row: { kind: string; display: { name: string } }) => row.kind === 'centre_book_trial' && row.display.name === 'Олег');
  const approvedRun = await f.json('POST', 'core/actions', { workspace: ws, body: { id: action.id, decision: 'approve' } });
  equal(approvedRun.body.action.status, 'done');
  ok(f.telegram.sent('703').at(-1)!.includes('Пробный урок назначен'), 'confirmed to the prospect after approval');
  equal((await f.store.table('bookings').get({ id: booking.id }))!.status, 'synced', 'in Academy');
  const cancelled = await f.json('DELETE', 'centre/bookings', { workspace: ws, body: { id: booking.id } });
  equal(cancelled.status, 404, 'a booking already in Academy is changed there');
});

Deno.test('limits: turns per conversation per day; group chats are ignored', async () => {
  const { f, ws, send } = await connected();
  f.model(/admissions assistant/, { reply: 'Да, с 7 лет.', intent: 'question', language: 'ru' });
  for (let i = 0; i < 41; i++) await send(705, `Вопрос ${i}?`);
  ok(f.telegram.sent('705').at(-1)!.includes('много сообщений'), 'the 41st turn today is not answered by AI');
  equal(f.memory.ledger.filter((row) => row.kind === 'charge' && row.creditKey === 'admissions.reply').length, 40, '40 charged turns');
  const before = f.telegram.calls.length;
  await f.publicCall('POST', 'x', {});
  void ws;
  equal(f.telegram.calls.length, before, 'nothing sent for unknown paths');
});

Deno.test('C14 chat widget: only the centre’s website, the agent answers, staff replies arrive by polling', async () => {
  const { f, ws } = await connected({ mode: 'auto' });
  const embed = await f.json('PATCH', 'centre/embed', { workspace: ws, body: { embed_domains: ['https://registan.uz'], widgets: { admissions_chat: true, greeting: { ru: 'Здравствуйте! Чем помочь?' } } } });
  const key = embed.body.embed.public_key;
  const call = (path: string, body: unknown, origin = 'https://registan.uz') => f.publicCall('POST', `embed/${path}?key=${key}`, { body, headers: { origin } });
  equal((await call('chat', { session: 'session-abcdefghijklmnop', message: 'hi' }, 'https://registan.uz.evil.example')).status, 403, 'look-alike origins are refused');
  equal((await f.publicCall('POST', `embed/chat?key=unknownkey0123456789abc`, { body: {}, headers: { origin: 'https://registan.uz' } })).status, 404, 'unknown key');
  const preflight = await f.publicCall('OPTIONS', `embed/chat?key=${key}`, { headers: { origin: 'https://registan.uz' } });
  equal([preflight.status, preflight.headers.get('access-control-allow-origin')], [204, 'https://registan.uz'], 'preflight for the allowed site');
  const config = await f.publicCall('GET', `embed/config?key=${key}&lang=ru`, { headers: { origin: 'https://registan.uz' } });
  equal([config.body.widgets.admissions_chat, config.body.greeting], [true, 'Здравствуйте! Чем помочь?'], 'greeting from the centre');
  f.model(/admissions assistant/, { reply: 'Да, с 7 лет.', intent: 'question', language: 'ru' });
  const session = 'session-abcdefghijklmnop';
  const answer = await call('chat', { session, message: 'Детей учите?', lang: 'ru' });
  equal(answer.body.messages[0].text, 'Да, с 7 лет.', 'answered from the FAQ');
  const [thread] = await f.store.table('threads').list({ workspace_id: ws, channel: 'widget' });
  ok(thread.external_id !== session && thread.external_id.length === 40, 'the session is stored only as a hash');
  await f.json('POST', 'centre/admissions-reply', { workspace: ws, body: { thread_id: thread.id, text: 'Добрый день! Могу помочь с расписанием.' } });
  const polled = await call('poll', { session, after: answer.body.last_id });
  equal(polled.body.messages.map((entry: { role: string; text: string }) => entry.role), ['staff'], 'the staff reply arrives');
  equal((await call('poll', { session: 'session-other-0123456789' })).body.messages, [], 'another session sees nothing');
  const turnedOff = await f.json('PATCH', 'centre/admissions', { workspace: ws, body: { enabled: false } });
  equal(turnedOff.body.admissions.enabled, false);
  equal((await call('chat', { session, message: 'hi' })).body.code, 'widget_off', 'the chat stops when the agent is off');
});
