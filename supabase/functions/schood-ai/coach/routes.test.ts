import { equal, ID, ok, SECRET, USERS } from '../fixture.test.ts';
import { coachStack, PASS_PRODUCT } from './harness.ts';

// The coach routes the Mini App and the web call with the person's session, and
// the service routes only the worker may call.

Deno.test('coach routes: access by plan, pass and nothing; fair use for a pass; no AI for free users', async () => {
  // A Speaking pass holder with no Schood AI plan (the harness sells the B2 pass as PASS_PRODUCT).
  const PASS_HOLDER = '00000000-0000-4000-8000-0000000000b2';
  USERS['tok-pass'] = { id: PASS_HOLDER, email: 'jasur@example.com', products: [PASS_PRODUCT], productStarts: { [PASS_PRODUCT]: '2026-10-20T00:00:00.000Z' }, telegramChatId: '700300' };
  const s = await coachStack();
  delete USERS['tok-pass'];
  const home = await s.f.json('GET', 'coach/home', { token: 'tok-plus' });
  equal(home.status, 200, 'home');
  ok(home.body.coaches.every((coach: { allowed: boolean }) => coach.allowed), 'Plus includes every coach');

  const free = await s.f.json('GET', 'coach/dashboard', { token: 'tok-free', query: { pack: 'ielts' } });
  equal([free.status, free.body.access.allowed, free.body.access.plans.includes('plus')], [200, false, true], 'free: the dashboard with the paywall');

  // The pass: B2 yes, B1 no.
  const pass = await s.f.json('GET', 'coach/dashboard', { token: 'tok-pass', query: { pack: 'speaking' } });
  equal([pass.status, pass.body.access.allowed, pass.body.access.kind], [200, true, 'pass'], 'the pass opens its coach');
  const other = await s.f.json('GET', 'coach/dashboard', { token: 'tok-pass', query: { pack: 'ielts' } });
  equal(other.body.access.allowed, false, 'and only its coach');
  const grants = s.f.memory.ledger.filter((row) => row.kind === 'adjust' && String(row.reference).startsWith('coach_fair_use:pass:B2'));
  equal([grants.length, grants[0]?.delta], [1, 1200], 'fair-use credits granted once for the cycle');
  await s.f.json('GET', 'coach/dashboard', { token: 'tok-pass', query: { pack: 'speaking' } });
  equal(s.f.memory.ledger.filter((row) => row.kind === 'adjust').length, 1, 'not twice in a cycle');
  s.advance(30 * 86_400_000);
  await s.f.json('GET', 'coach/dashboard', { token: 'tok-pass', query: { pack: 'speaking' } });
  const topups = s.f.memory.audit.filter((row) => row.event === 'coach.fair_use_topup').map((row) => (row.details as { amount: number }).amount);
  equal(topups, [1200, 0], 'the next cycle tops up only what was spent (nothing here), never above fair use');

  const costs = await s.f.json('GET', 'coach/costs', { token: 'tok-free', query: { pack: 'ielts' } });
  equal(costs.body.costs, { turn: 1, review: 10, writing: 5, ladder: 8, photo: 3, drill: 2, voice: 1, shadow: 1 }, 'costs from the price table');
  const samples = await s.f.json('GET', 'coach/samples', { token: null, query: { pack: 'speaking' } });
  ok(samples.status === 200 && samples.body.samples.length >= 2, 'examples for everyone, signed in or not');
  equal(samples.body.criteria.range?.scale.id, 'cefr', 'criterion names and scales for the example reports');
  const audio = await s.f.json('GET', 'coach/audio-text', { token: 'tok-free', query: { pack: 'ielts', ref: 'ielts.l.x' } });
  equal(audio.status, 402, 'listening scripts need a plan');
  equal(s.f.memory.calls.length, 0, 'no model call anywhere above');
});

Deno.test('coach routes: goal, settings, plan, report, session detail, certificates and erasing history', async () => {
  const s = await coachStack();
  const bad = await s.f.json('POST', 'coach/goal', { token: 'tok-plus', body: { pack: 'ielts', target: 6.75, daily_minutes: 30 } });
  equal([bad.status, bad.body.field], [400, 'target'], 'targets come from the pack');
  const past = await s.f.json('POST', 'coach/goal', { token: 'tok-plus', body: { pack: 'ielts', target: 7, daily_minutes: 30, exam_date: '2020-01-01' } });
  equal(past.body.field, 'exam_date', 'no exam in the past');
  const goal = await s.f.json('POST', 'coach/goal', { token: 'tok-plus', body: { pack: 'ielts', target: 7, daily_minutes: 30, exam_date: '2027-03-15' } });
  equal([goal.status, goal.body.goal.target_label], [200, '7.0'], 'goal saved');
  ok(s.f.memory.learning.some((event) => event.kind === 'goal_set' && !event.verified), 'goal_set is not verified practice');

  const quiet = await s.f.json('PATCH', 'coach/settings', { token: 'tok-plus', body: { pack: 'ielts', reminder: '23:30' } });
  equal(quiet.body.field, 'reminder', 'no reminders in quiet hours');
  const settings = await s.f.json('PATCH', 'coach/settings', { token: 'tok-plus', body: { pack: 'speaking', reminder: '19:30', time_zone: 'Europe/Moscow', correction: 'strict', voice: false, explain: 'en', locale: 'ru' } });
  equal([settings.status, settings.body.locale, settings.body.settings.correction, settings.body.settings.timeZone], [200, 'ru', 'strict', 'Europe/Moscow'], 'settings saved');
  const enrollment = (await s.coach.store.enrollment(ID.plus, 'speaking'))!;
  const schedule = await s.coach.store.schedule(enrollment.id, 'daily');
  equal([schedule?.localTime, schedule?.timeZone, schedule?.enabled], ['19:30', 'Europe/Moscow', true], 'the reminder follows the settings');

  const plan = await s.f.json('GET', 'coach/plan', { token: 'tok-plus', query: { pack: 'ielts' } });
  ok(plan.status === 200 && plan.body.weeks.length >= 1 && plan.body.links.some((link: { url: string }) => link.url === 'https://ielts.schood.online'), 'plan with the simulator link');
  const report = await s.f.json('GET', 'coach/report', { token: 'tok-plus', query: { pack: 'ielts' } });
  equal([report.status, report.body.has_data], [200, false], 'an empty week reads as empty');

  // Practise by text through the bot, then read the long feedback on the web.
  await s.user.text('ielts', '700100', '/start');
  await s.user.tap('ielts', '700100', 'm:speaking');
  await s.user.tap('ielts', '700100', 'o:0');
  await s.user.text('ielts', '700100', 'I live in a flat with my family and I like it because it is quiet and close to the park');
  await s.user.tap('ielts', '700100', 'sp:end');
  const sessions = await s.coach.store.sessions(ID.plus, 'ielts', { limit: 5, status: 'finished', kind: 'speaking_exam' });
  const detail = await s.f.json('GET', 'coach/session', { token: 'tok-plus', query: { id: sessions[0].id } });
  ok(detail.status === 200 && detail.body.turns.some((turn: { content: string; prompt: string | null }) => turn.content.startsWith('I live') && turn.prompt), 'answer with its question');
  ok(detail.body.rubric.criteria.some((criterion: { source: string }) => criterion.source === 'audio'), 'the unscored criterion is shown as such');
  ok(!JSON.stringify(detail.body.turns).includes('"assessment"'), 'no raw model output in the detail');
  const stranger = await s.f.json('GET', 'coach/session', { token: 'tok-student', query: { id: sessions[0].id } });
  equal(stranger.status, 404, 'nobody else’s session');

  // Certificates: list, revoke; erasing history keeps certificates.
  await s.coach.store.issueCertificate({ code: '7K3M9QX2P4TA', userId: ID.plus, pack: 'ielts', packVersion: '1.0.0', milestone: 'speaking-6', rubric: 'ielts.speaking', level: 6, levelLabel: '6.0', displayName: 'Dilnoza', evidence: [] });
  const certs = await s.f.json('GET', 'coach/certificates', { token: 'tok-plus' });
  equal([certs.body.certificates.length, certs.body.certificates[0].url], [1, 'https://ai.schood.online/coach/verify/7K3M9QX2P4TA'], 'certificate with its share link');
  const erased = await s.f.json('POST', 'coach/erase', { token: 'tok-plus', body: { pack: 'ielts' } });
  ok(erased.status === 200 && erased.body.removed >= 1, 'history erased');
  equal((await s.coach.store.sessions(ID.plus, 'ielts', { limit: 5 })).length, 0, 'no sessions left');
  equal((await s.f.json('GET', 'coach/certificates', { token: 'tok-plus' })).body.certificates.length, 1, 'certificates stay');
  const revoke = await s.f.json('DELETE', 'coach/certificates', { token: 'tok-plus', body: { id: certs.body.certificates[0].id } });
  equal(revoke.status, 200, 'revoked');
  const check = await s.verify('7K3M-9QX2-P4TA');
  equal([check.status, check.body.certificate.revoked], [200, true], 'the public check shows it revoked, with no sign-in');
  equal((await s.verify('0000-0000-0000')).status, 404, 'an unknown code');
  ok(!JSON.stringify(check.body).includes(ID.plus) && !JSON.stringify(check.body).includes('dilnoza@'), 'no account details on the public record');
});

Deno.test('coach routes: Coach Team seats, the manager board and privacy', async () => {
  const s = await coachStack();
  const denied = await s.f.json('POST', 'coach/team-create', { token: 'tok-plus', body: { name: 'Sales', manager_id: ID.student, packs: ['ielts'], seats: 5, days: 30 } });
  equal(denied.status, 403, 'only Schood admins grant seats');
  const created = await s.f.json('POST', 'coach/team-create', { token: 'tok-admin', body: { name: 'Sales floor', manager_id: ID.student, packs: ['ielts'], seats: 5, days: 30 } });
  equal(created.status, 200, 'team created by support');
  const teamId = created.body.team.id;
  // The manager (a linked student without a plan) now has the team's coach.
  const managerView = await s.f.json('GET', 'coach/dashboard', { token: 'tok-student', query: { pack: 'ielts' } });
  equal(managerView.body.access.allowed, true, 'a seat grants the coach');
  const invite = await s.f.json('POST', 'coach/team-invite', { token: 'tok-student', body: { team_id: teamId } });
  ok(invite.status === 200 && /^[A-Za-z0-9]{10}$/.test(invite.body.code) && invite.body.links[0].url.includes('start=team_'), 'invite links');
  const notManager = await s.f.json('POST', 'coach/team-invite', { token: 'tok-plus', body: { team_id: teamId } });
  equal(notManager.status, 404, 'only the manager invites');
  const joined = await s.f.json('POST', 'coach/team-join', { token: 'tok-outsider', body: { code: invite.body.code } });
  equal([joined.status, joined.body.team.name], [200, 'Sales floor'], 'joined on the web');
  // Joining from the bot with /start team_<code> works too (tok-plus, chat 700100).
  await s.user.text('ielts', '700100', `/start team_${invite.body.code}`);
  ok(s.texts(s.fresh()).some((text) => text.includes('You joined <b>Sales floor</b>')), 'joined in Telegram');
  const board = await s.f.json('GET', 'coach/team', { token: 'tok-student', query: { id: teamId } });
  equal([board.status, board.body.team.used, board.body.leaderboard.length], [200, 3, 3], 'manager board');
  ok(!JSON.stringify(board.body).includes('content'), 'no messages or answers on the board');
  const memberView = await s.f.json('GET', 'coach/team', { token: 'tok-outsider', query: { id: teamId } });
  equal(memberView.status, 404, 'members do not see the board');
  const removed = await s.f.json('DELETE', 'coach/team-member', { token: 'tok-student', body: { team_id: teamId, user_id: ID.outsider } });
  equal(removed.status, 200, 'manager removes a member');
  equal((await s.f.json('GET', 'coach/dashboard', { token: 'tok-outsider', query: { pack: 'ielts' } })).body.access.allowed, false, 'the seat is gone at once');
});

Deno.test('coach routes: worker-only routes, the update body and Mini App sign-in checks', async () => {
  const s = await coachStack();
  for (const path of ['coach/update', 'coach/poll-sent', 'coach/media-cached', 'coach/miniapp-session']) {
    const response = await s.f.json('POST', path, { token: 'tok-plus', body: { pack: 'ielts' } });
    equal(response.status, 403, `${path} is for the worker only`);
  }
  const call = (body: unknown) => s.f.worker('coach/update', 'POST', ID.plus, '700100', body);
  equal((await call({ pack: 'ielts', update_id: 1, event: { type: 'teleport' } })).status, 400, 'unknown event');
  equal((await call({ pack: 'nope', update_id: 1, event: { type: 'text', text: 'hi', messageId: 1, date: 1 } })).status, 404, 'unknown coach');
  equal((await call({ pack: 'ielts', update_id: 2, event: { type: 'voice', audio: 'not base64!', mime: 'audio/ogg', duration: 3, fileId: 'f', fileUniqueId: 'u', messageId: 1, date: 1 } })).status, 400, 'audio must be base64');
  equal((await s.f.worker('coach/update', 'POST', ID.plus, '700999', { pack: 'ielts', update_id: 3, event: { type: 'text', text: 'hi', messageId: 1, date: 1 } })).status, 403, 'the chat must be linked to that account');

  const init = await s.initData('ielts', '700100');
  const mint = (chat: string, data: string, pack = 'ielts') => s.f.worker('coach/miniapp-session', 'POST', chat === '700100' ? ID.plus : ID.student, chat, { pack, init_data: data });
  equal((await mint('700100', init)).status, 200, 'a valid sign-in');
  equal((await (await mint('700200', init)).json()).reason, 'telegram_user', 'Telegram data for someone else is refused');
  equal((await (await mint('700100', init, 'speaking')).json()).reason, 'telegram_signature', 'data signed for another bot is refused');
  const tampered = init.replace('Dilnoza', 'Dilnozb');
  equal((await mint('700100', tampered)).status, 401, 'tampered data is refused');
  s.advance(2 * 86_400_000);
  equal((await (await mint('700100', init)).json()).reason, 'telegram_expired', 'old launch data is refused');
});

Deno.test('coach routes: the cron routes take the worker secret alone and respect notification settings', async () => {
  const s = await coachStack();
  // Only the secret: a person's session or a wrong secret is refused.
  const system = (path: string, body: unknown, secret = SECRET) => s.f.call('POST', path, { token: null, origin: null, headers: { 'x-schood-service-secret': secret }, body });
  equal((await system('coach/system-due', {}, 'wrong-secret-0123456789abcdef0123456789')).status, 401, 'a wrong secret');
  ok([401, 403].includes((await s.f.json('POST', 'coach/system-due', { token: 'tok-plus', body: {} })).status), 'a person cannot call the cron');
  // Dilnoza sets a reminder, then turns Telegram delivery off in Settings → Notifications.
  await s.user.text('ielts', '700100', '/start');
  await s.f.json('PATCH', 'coach/settings', { token: 'tok-plus', body: { pack: 'ielts', reminder: '12:00', time_zone: 'Asia/Tashkent' } });
  s.advance(2 * 3_600_000);
  const prefs = await s.f.json('GET', 'core/notify-prefs', { token: 'tok-plus' });
  ok(prefs.status === 200 && prefs.body.kinds.some((kind: { key: string }) => kind.key === 'coach.ielts'), 'each coach is a notification kind people can mute');
  await s.f.json('PUT', 'core/notify-prefs', { token: 'tok-plus', body: { ...prefs.body.prefs, delivery: ['web'] } });
  const off = await (await system('coach/system-due', { limit: 10 })).json();
  equal(off.deliveries.length, 0, 'no Telegram reminder when Telegram delivery is off');
  equal(s.coach.inspect.deliveries.at(-1)?.reason, 'delivery_off', 'logged as skipped');
  s.advance(86_400_000);
  await s.f.json('PUT', 'core/notify-prefs', { token: 'tok-plus', body: { ...prefs.body.prefs, delivery: ['telegram', 'web'], muted: ['coach'] } });
  equal((await (await system('coach/system-due', { limit: 10 })).json()).deliveries.length, 0, 'muting the coach area mutes every coach');
  s.advance(86_400_000);
  await s.f.json('PUT', 'core/notify-prefs', { token: 'tok-plus', body: { ...prefs.body.prefs, delivery: ['telegram', 'web'], muted: [] } });
  const due = await (await system('coach/system-due', { limit: 10 })).json();
  equal([due.deliveries.length, due.deliveries[0]?.pack, due.deliveries[0]?.chatId], [1, 'ielts', '700100'], 'the reminder goes out again');
  const delivered = await (await system('coach/system-delivered', { results: [{ id: due.deliveries[0].id, status: 'blocked', reason: 'bot_blocked' }] })).json();
  equal(delivered.updated, 1, 'the outcome is recorded');
  equal((await system('coach/system-due', { limit: 99 })).status, 400, 'the batch is bounded');
});
