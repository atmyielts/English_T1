import { ACADEMY, BOT_TOKEN, centreFixture, createCentre, equal, ID, invite, ok, streamText } from './testing.ts';

// The doc's centre test (44_SCHOOD_AI.md, "Done when"): a centre owner creates the
// centre workspace, invites teachers and students, sets budgets, turns on the
// admissions agent, and receives the Monday brief. Memory repository, fake model,
// fake Academy, fake Telegram.

Deno.test('centre end to end: create, invite, budgets, admissions agent, Monday brief', async () => {
  const f = await centreFixture();

  // 1. The owner of an Academy tenant creates the centre workspace, checked through Academy's own API.
  const linkable = await f.json('GET', 'centre/academies');
  equal([linkable.status, linkable.body.academies[0].can_link, linkable.body.academies[0].linked], [200, true, false], 'the owner may link');
  equal((await f.json('POST', 'centre/create', { token: 'tok-t1', body: { academy_id: ACADEMY } })).body.code, 'academy_role_required', 'a teacher may not link');
  const ws = await createCentre(f);
  const again = await f.json('POST', 'centre/create', { body: { academy_id: ACADEMY } });
  equal([again.status, again.body.workspace.id, again.body.created], [200, ws, false], 'linking twice returns the same centre');
  const overview = await f.json('GET', 'centre/overview', { workspace: ws });
  equal([overview.body.seats.teachers.limit, overview.body.seats.students.limit, overview.body.plan.plans], [15, 400, ['centre_pro']], 'Centre Pro seats');
  equal(overview.body.checklist.invites, false, 'nothing set up yet');
  await f.settle();
  ok((await f.store.table('snapshots').list({ workspace_id: ws })).length === 1, 'the Academy snapshot was captured after the response');

  // 2. Invites by code: two teachers and six students.
  await invite(f, ws, 'teacher', ['tok-t1', 'tok-t2'], 2);
  const studentCode = await invite(f, ws, 'student', ['tok-s1', 'tok-s2', 'tok-s3', 'tok-s4', 'tok-s5', 'tok-s6'], 10);
  equal((await f.json('POST', 'centre/join', { token: 'tok-s1', body: { code: studentCode } })).body.already, true, 'joining again keeps the membership');
  const members = await f.json('GET', 'centre/members', { workspace: ws });
  equal(members.body.members.map((m: { role: string }) => m.role).sort(), ['owner', 'student', 'student', 'student', 'student', 'student', 'student', 'teacher', 'teacher'], 'everyone joined');

  // 3. Budgets: defaults for new members and applied to everyone now.
  const budgets = await f.json('POST', 'centre/budgets', { workspace: ws, body: { defaults: { teacher: 500, student: 2 }, apply_to_existing: true } });
  equal([budgets.status, budgets.body.applied], [200, 8], 'budgets applied to teachers and students');
  f.model(/Student Assistant|study assistant/, 'Good question! Think about when it happened: yesterday is a finished time.');
  const chat = async (n: number) => f.call('POST', 'core/chat', { token: 'tok-s1', workspace: ws, body: { client_message_id: crypto.randomUUID(), specialist: 'student_assistant', message: `Why is "I have seen him yesterday" wrong? (${n})` } });
  const first = await streamText(await chat(1));
  equal(first[0].event, 'start', 'the student assistant answers');
  ok(first.some((event) => event.event === 'delta'), 'streamed');
  await f.settle();
  await chat(2).then((response) => response.body?.cancel());
  await f.settle();
  const third = await chat(3);
  equal([third.status, (await third.json()).code], [402, 'budget_exhausted'], 'the student budget holds');
  equal(f.memory.ledger.filter((row) => row.kind === 'charge' && row.userId === ID.s1).length, 2, 'charged to the pool twice');

  // 4. The admissions agent: FAQ, prices, rules, the bot token, then it answers on Telegram.
  const config = await f.json('PATCH', 'centre/admissions', { workspace: ws, body: {
    enabled: true,
    faq: [{ q: 'Where are you?', a: 'Tashkent, Amir Temur street 12, near the metro.' }],
    prices: [{ course: 'General English', price: 450000, currency: 'UZS', period: 'month' }, { course: 'IELTS', price: 650000, currency: 'UZS', period: 'month' }],
    booking: { mode: 'auto', duration_minutes: 60, min_notice_hours: 12, max_days_ahead: 10, require_phone: true, slots: [{ weekday: 2, start: '10:00', capacity: 2 }, { weekday: 4, start: '15:00', capacity: 2 }] },
  } });
  equal([config.status, config.body.admissions.enabled], [200, true], 'agent switched on');
  const bot = await f.json('POST', 'centre/admissions-bot', { workspace: ws, body: { token: BOT_TOKEN } });
  equal([bot.status, bot.body.admissions.bot.connected, bot.body.admissions.bot.username, bot.body.admissions.bot.hint], [200, true, 'registan_admissions_bot', BOT_TOKEN.slice(-4)], 'bot connected');
  const hook = f.telegram.calls.find((entry) => entry.method === 'setWebhook')!;
  const secretToken = String(hook.body.secret_token), webhook = new URL(String(hook.body.url));
  ok(secretToken.length >= 32 && webhook.pathname.endsWith('/schood-ai/centre/bot-webhook') && !webhook.search.includes(secretToken), 'webhook on the anonymous route; the secret only in Telegram’s header');
  const stored = await f.store.table('secrets').get({ workspace_id: ws, purpose: 'telegram_bot', revoked_at: null });
  ok(stored && stored.sealed.startsWith('v1:k1:') && !stored.sealed.includes(BOT_TOKEN) && !JSON.stringify(bot.body).includes(BOT_TOKEN), 'the token is sealed and never returned');

  const tg = (update: Record<string, unknown>, secret = secretToken) => f.anonymous('POST', webhook.toString(), { body: update, origin: null, headers: { 'x-telegram-bot-api-secret-token': secret } });
  let update = 1;
  const say = (text: string) => tg({ update_id: update++, message: { message_id: update, chat: { id: 555001, type: 'private' }, from: { id: 555001, language_code: 'uz', username: 'aziz_t' }, text } });
  equal((await tg({ update_id: 99, message: { chat: { id: 1, type: 'private' }, text: 'hi' } }, 'wrong-secret')).status, 401, 'a wrong secret token is refused');
  equal((await say('/start')).status, 200, 'webhook answered');
  await f.settle();
  ok(f.telegram.sent('555001')[0].includes('Registan'), 'greeting in the centre’s name');
  ok(Array.isArray((f.telegram.calls.at(-1)!.body.reply_markup as { inline_keyboard: unknown[] }).inline_keyboard), 'menu buttons');
  await tg({ update_id: update - 1, message: { chat: { id: 555001, type: 'private' }, text: '/start' } });
  await f.settle();
  equal(f.telegram.sent('555001').length, 1, 'a repeated update is answered once');

  f.model(/admissions assistant/, (call) => call.last.includes('Narxlar')
    ? { reply: 'General English oyiga 450 000 so‘m, IELTS oyiga 650 000 so‘m.', intent: 'question', language: 'uz' }
    : { reply: 'Ajoyib, yozib qo‘ydim.', intent: 'book_trial', language: 'uz', contact: { name: 'Aziz Karimov', phone: '+998 90 123 45 67' }, slot: 1 });
  await say('Narxlar qancha?');
  await f.settle();
  ok(f.telegram.sent('555001').at(-1)!.includes('450 000'), 'answered from the price list');
  await say('Seshanba 10:00 ga yozing. Aziz Karimov, +998 90 123 45 67');
  await f.settle();
  const [booking] = await f.store.table('bookings').list({ workspace_id: ws });
  equal([booking.status, booking.mode, booking.contact.phone], ['confirmed', 'auto', '+998901234567'], 'booked within the owner’s rules');
  ok(f.telegram.sent('555001').at(-1)!.includes('sinov darsingiz') || f.telegram.sent('555001').at(-1)!.toLowerCase().includes('sinov'), 'confirmation sent in Uzbek');
  equal(f.memory.ledger.filter((row) => row.kind === 'charge' && row.creditKey === 'admissions.reply').length, 2, 'each AI turn charged to the centre pool');

  // The office approves the Academy sync: a lead and a trial are created with the owner's own token.
  const pending = await f.json('GET', 'core/actions', { workspace: ws, query: { status: 'open' } });
  const sync = pending.body.actions.find((row: { kind: string }) => row.kind === 'centre_book_trial');
  ok(sync && sync.can_approve, 'the booking waits for Approve & run to reach Academy');
  const approved = await f.json('POST', 'core/actions', { workspace: ws, body: { id: sync.id, decision: 'approve' } });
  equal(approved.body.action.status, 'done', 'synced');
  const academyCalls = f.academy.calls.filter((entry) => ['create_lead', 'schedule_trial'].includes(entry.action));
  equal(academyCalls.map((entry) => [entry.action, entry.token]), [['create_lead', 'tok-owner'], ['schedule_trial', 'tok-owner']], 'Academy lead and trial, as the approver');
  equal((await f.store.table('bookings').get({ id: booking.id }))!.status, 'synced', 'booking is in Academy');

  // Staff link their Telegram to the bot for alerts and the brief.
  const code = await f.json('POST', 'centre/admissions-staff-code', { workspace: ws });
  ok(code.body.link.includes('t.me/registan_admissions_bot?start=staff_'), 'deep link to the bot');
  await tg({ update_id: update++, message: { chat: { id: 900500, type: 'private' }, from: { id: 900500 }, text: `/start staff_${code.body.code}` } });
  await f.settle();
  equal((await f.store.table('staff_chats').list({ workspace_id: ws })).map((row) => [row.user_id, row.chat_id]), [[ID.owner, '900500']], 'owner linked');

  // 5. The Monday brief: switched on, then the scheduler runs on Monday morning.
  const settings = await f.json('PATCH', 'centre/brief', { workspace: ws, body: { enabled: true, recipients: [ID.owner], hour: 8 } });
  equal(settings.body.settings.enabled, true, 'brief on');
  f.model(/Monday business brief/, {
    headline: 'Registan Learning Centre, week 45',
    text: '14 new leads, 4 conversions. Collected 41500000 UZS, outstanding 7300000. Attendance 87%. 1 student at risk: Student 1.',
    suggestions: [
      { title: 'Call the families of at-risk students', why: '1 student is at risk.', area: 'parents' },
      { title: 'Follow up the open leads', why: '23 active leads, 4 converted.', area: 'leads' },
      { title: 'Chase outstanding payments', why: '7300000 UZS is outstanding.', area: 'payments' },
    ],
  });
  // Core's scheduler runs the centre's jobs (registerSystemJob) on its tick.
  equal((await f.system('core/system-tick', {}, 'wrong-secret-0123456789abcdef0123456789')).status, 401, 'the scheduler needs the service secret');
  equal((await f.tick()).status, 200);
  equal((await f.store.table('briefs').list({ workspace_id: ws })).length, 0, 'no brief on Sunday');
  f.setClock(new Date('2026-11-02T03:30:00Z')); // Monday 08:30 in Tashkent
  await f.tick();
  ok((await f.memory.repository.systemRuns()).some((run) => run.job === 'centre.monday_brief' && run.lastStatus === 'ok'), 'the brief job ran');
  const [brief] = await f.store.table('briefs').list({ workspace_id: ws });
  equal([brief.week, brief.source, brief.status], ['2026-W45', 'snapshot', 'sent'], 'from the Academy snapshot');
  const sent = f.telegram.sent('900500').at(-1)!;
  const sentBefore = f.telegram.sent('900500').length;
  ok(sent.includes('14 new leads') && sent.includes('Chase outstanding payments') && sent.includes('/centre/brief'), 'the owner received the brief with three actions');
  equal(f.memory.ledger.filter((row) => row.kind === 'charge' && row.creditKey === 'owner.brief').map((row) => row.delta), [-10], 'the brief costs 10 credits from the pool');
  await f.tick();
  f.advance(20 * 60_000);
  await f.tick();
  equal((await f.store.table('briefs').list({ workspace_id: ws })).length, 1, 'once a week');
  equal(f.telegram.sent('900500').length, sentBefore, 'not sent again');
  ok(f.memory.ledger.filter((row) => row.kind === 'charge' && row.creditKey === 'owner.brief').every((row) => row.userId === null), 'paid by the centre, nobody on the ledger');
  // The daily job: retention, this month's ledgers and insights, once a day per centre.
  ok((await f.memory.repository.systemRuns()).some((run) => run.job === 'centre.daily' && run.lastStatus === 'ok'), 'the daily job ran');
  equal((await f.store.takePublic(ws, 'cron_daily', '2026-11-02', 1)), false, 'today’s daily work for the centre is done');
  ok(f.memory.audit.some((event) => event.event === 'centre.brief_delivered'), 'audited');
});
