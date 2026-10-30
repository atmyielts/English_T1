import { equal, ID, ok } from '../fixture.test.ts';
import { coachStack, ESSAY } from './harness.ts';

// B1 IELTS Coach, end to end through the worker, the function and the memory
// stores, with a fake model and fake Telegram: placement test, goal, daily plan,
// voice and text practice with evidence-based scores, a full mock, writing with a
// photo and the essay ladder, timed reading, vocabulary polls, a drill on a
// recurring error, the weekly report, a level-up certificate and reminders.

const CHAT = '700100'; // tok-plus: Schood AI Plus, linked to Telegram

const ANSWER_1 = 'I live in a flat in Chilonzor with my parents and my younger sister and honestly I really like it because the neighbourhood is quiet and green';
const ANSWER_2 = 'Well I live in a modern flat in Chilonzor with my family and I really enjoy it because it is quiet, there are many trees and my school is close';

Deno.test('B1 IELTS Coach: the full loop from placement to certificate and reminders', async () => {
  const s = await coachStack();
  const { user, fresh, texts, data } = s;

  // /start: welcome with the free placement test.
  await user.text('ielts', CHAT, '/start');
  let out = fresh();
  ok(texts(out).some((text) => text.includes('IELTS Coach')), `welcome: ${texts(out).join(' | ')}`);
  ok(data(out, /^m:test$/), 'placement test button');

  // The placement test: 27 items, answered in the worker's button data, then saved by the function.
  await user.tap('ielts', CHAT, 'm:test');
  out = fresh();
  let tap = data(out, /^dg:/);
  ok(tap, `first question: ${texts(out).join(' | ')}`);
  let guard = 0;
  while (tap && guard++ < 40) {
    await user.tap('ielts', CHAT, tap.replace(/^(dg:[ure]:\d+:)\d/, '$11'));
    out = fresh();
    tap = data(out, /^dg:/);
  }
  const result = texts(out).join('\n');
  ok(result.includes('placement result') || result.includes('Estimated level'), `placement result: ${result}`);
  const enrollment = (await s.coach.store.enrollment(ID.plus, 'ielts'))!;
  ok(enrollment.placement && enrollment.placement.skills.length >= 4, 'placement stored with skills');

  // Goal: target, exam date, minutes, reminder → today's plan.
  const target = data(out, /^g:t:7$/) ?? data(out, /^g:t:/)!;
  await user.tap('ielts', CHAT, target);
  await user.text('ielts', CHAT, '15.03.2027');
  out = fresh();
  await user.tap('ielts', CHAT, data(out, /^g:m:30$/)!);
  out = fresh();
  await user.tap('ielts', CHAT, data(out, /^g:r:0930$/)!);
  out = fresh();
  ok(texts(out).some((text) => text.includes('Your plan is ready')), `goal done: ${texts(out).join(' | ')}`);
  ok(texts(out).some((text) => text.includes('Today')), 'today plan shown');
  ok(data(out, /^t:0$/), 'start buttons');
  const schedule = await s.coach.store.schedule(enrollment.id, 'daily');
  equal(schedule?.localTime, '09:30', 'reminder at the chosen time');

  // Speaking practice, Part 1 by voice: a band per criterion with quotes, fluency numbers, "say it better".
  await user.tap('ielts', CHAT, 'm:speaking');
  out = fresh();
  await user.tap('ielts', CHAT, data(out, /^o:0$/)!);
  out = fresh();
  ok(texts(out).some((text) => text.includes('Answer with a voice message')), 'question asked');
  await user.voice('ielts', CHAT, ANSWER_1, 14);
  out = fresh();
  const scored = texts(out).join('\n');
  ok(scored.includes('Fluency and Coherence') && scored.includes('“I live in a flat'), `criterion with quote: ${scored}`);
  ok(scored.includes('words/min'), 'fluency numbers from timestamps');
  ok(scored.includes('Pronunciation') && scored.includes('not scored'), 'pronunciation is never guessed from a transcript');
  ok(scored.includes('Say it better'), 'upgrade');
  // Re-record: before and after.
  await user.tap('ielts', CHAT, 'sp:rr');
  await user.voice('ielts', CHAT, ANSWER_2, 14);
  out = fresh();
  ok(texts(out).some((text) => text.includes('Before → after')), `comparison: ${texts(out).join(' | ')}`);
  await user.tap('ielts', CHAT, 'sp:end');
  out = fresh();
  ok(texts(out).some((text) => text.includes('estimate')), 'practice summary');
  const events = s.f.memory.learning.filter((event) => event.area === 'coach');
  ok(events.some((event) => event.kind === 'turn_scored' && event.feature === 'B1' && event.source === 'telegram' && event.verified), 'verified turn_scored events');

  // A full mock: the real flow (no feedback between questions), the cue card with its timer, one holistic review.
  await user.tap('ielts', CHAT, 'm:mock');
  out = fresh();
  ok(texts(out).some((text) => text.includes('no feedback until the end')), 'mock rules');
  let asked = 0;
  for (let i = 0; i < 20; i++) {
    const current = (await s.coach.store.enrollment(ID.plus, 'ielts'))!.state.current as { flow: string; queue?: { kind: string }[]; index?: number };
    if (current.flow !== 'speaking') break;
    const cue = current.queue![current.index!]?.kind === 'cue';
    if (cue) { s.advance(50_000); await user.voice('ielts', CHAT, `${ANSWER_2} and I would like to describe it in more detail because it matters to me a lot`, 95); }
    else await user.text('ielts', CHAT, `${ANSWER_1} number ${i}`);
    asked += 1;
  }
  out = fresh();
  ok(asked >= 10, `the mock asked ${asked} questions`);
  const mock = texts(out).join('\n');
  ok(mock.includes('Speaking mock result') && mock.includes('Overall estimate'), `mock result: ${mock.slice(-600)}`);
  ok(mock.includes('not an official IELTS score'), 'labelled as an estimate');
  ok(s.f.memory.learning.some((event) => event.kind === 'mock_finished' && event.feature === 'B1'), 'mock_finished event');
  ok(s.f.memory.calls.filter((call) => call.feature === 'coach_b1.review' && call.status === 'ok').length === 1, 'one review charge for the mock');

  // A third scored speaking session reaches a level-up: a certificate with a public link.
  await user.tap('ielts', CHAT, 'm:speaking');
  await user.tap('ielts', CHAT, data(fresh(), /^o:0$/)!);
  fresh();
  await user.text('ielts', CHAT, ANSWER_2);
  await user.tap('ielts', CHAT, 'sp:end');
  out = fresh();
  const certs = await s.coach.store.certificates(ID.plus, 'ielts');
  ok(certs.length >= 1, `certificate issued: ${texts(out).join(' | ').slice(0, 400)}`);
  ok(texts(out).some((text) => text.includes('Level up')), 'level-up announced');
  const code = certs[0].code;
  const verify = await s.verify(`${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8)}`);
  const record = verify.body;
  equal([verify.status, record.certificate.level, record.certificate.revoked, record.certificate.results.length >= 3], [200, certs[0].levelLabel, false, true], 'public verification');
  ok(!JSON.stringify(record).includes(ID.plus), 'no user id on the public record');
  ok(s.f.memory.learning.some((event) => event.kind === 'check_passed' && String(event.outcome).startsWith('level_up')), 'level-up event');

  // Writing Task 2 by text: bands with quotes and corrections, then the essay ladder.
  await user.tap('ielts', CHAT, 'm:writing');
  out = fresh();
  await user.tap('ielts', CHAT, data(out, /^o:\d$/)!);
  fresh();
  await user.text('ielts', CHAT, ESSAY);
  out = fresh();
  const essay = texts(out).join('\n');
  ok(essay.includes('Overall estimate') && essay.includes('“Some people believe that'), `writing scored: ${essay.slice(0, 500)}`);
  ok(essay.includes('Fix these'), 'corrections');
  ok(data(out, /^w:ld$/), 'ladder offered');
  await user.tap('ielts', CHAT, 'w:ld');
  out = fresh();
  ok(texts(out).filter((text) => text.includes('Your essay at')).length === 3, `three ladder levels: ${texts(out).join(' | ').slice(0, 300)}`);
  ok(texts(out).some((text) => text.includes('Never submit them')), 'labelled as a study model');

  // A photo of handwriting: read first, confirmed, then scored.
  await user.tap('ielts', CHAT, 'm:writing');
  await user.tap('ielts', CHAT, data(fresh(), /^o:\d$/)!);
  fresh();
  await user.photo('ielts', CHAT);
  out = fresh();
  ok(texts(out).some((text) => text.includes('Here is what I read')), `photo read back: ${texts(out).join(' | ')}`);
  await user.tap('ielts', CHAT, 'w:sc');
  out = fresh();
  ok(texts(out).some((text) => text.includes('Overall estimate')), 'photo essay scored');
  ok(s.f.memory.calls.some((call) => call.feature === 'coach_b1.photo' && call.status === 'ok'), 'photo charged as photo');

  // A timed reading set: answers checked against the key, explanations quoting the passage.
  await user.tap('ielts', CHAT, 'm:reading');
  for (let i = 0; i < 12; i++) {
    out = fresh();
    const current = (await s.coach.store.enrollment(ID.plus, 'ielts'))!.state.current as { flow: string };
    if (current.flow !== 'quiz') break;
    const choice = data(out, /^a:\d+:\d$/);
    if (choice) await user.tap('ielts', CHAT, choice); else await user.text('ielts', CHAT, 'river');
  }
  out = [...out, ...fresh()];
  ok(texts(out).some((text) => /✅ <b>\d+\/\d+<\/b> · time/.test(text)), `reading result: ${texts(out).join(' | ').slice(-400)}`);
  ok(s.f.memory.learning.some((event) => event.kind === 'drill_finished' && event.skill === 'ielts.reading'), 'drill_finished for the set');

  // Listening: the script read by text-to-speech once, then reused by its Telegram file id.
  await user.tap('ielts', CHAT, 'm:listening');
  out = fresh();
  ok(out.some((call) => call.method === 'sendVoice'), 'listening audio sent');
  await user.tap('ielts', CHAT, 'm:menu');
  fresh();

  // Vocabulary as quiz polls with spaced repetition.
  await user.tap('ielts', CHAT, 'm:vocab');
  for (let i = 0; i < 12; i++) {
    out = fresh();
    const poll = out.find((call) => call.method === 'sendPoll');
    if (!poll) break;
    const pollNumber = s.calls.filter((call) => call.method === 'sendPoll').length;
    await user.poll('ielts', CHAT, `poll-${pollNumber}`, Number(poll.body.correct_option_id));
  }
  out = [...out, ...fresh()];
  ok(texts(out).some((text) => text.includes('right. Next review')), `deck finished: ${texts(out).join(' | ')}`);
  ok((await s.coach.store.cards(ID.plus, 'ielts')).length >= 6, 'cards scheduled');
  ok(s.f.memory.learning.some((event) => event.kind === 'check_passed' && event.skill === 'ielts.vocabulary'), 'check_passed per card');

  // A drill on the recurring error the scorer kept finding (articles).
  await user.tap('ielts', CHAT, 'm:drill');
  out = fresh();
  ok(texts(out).some((text) => text.includes('Which error')), `drill choice: ${texts(out).join(' | ')}`);
  await user.tap('ielts', CHAT, data(out, /^o:0$/)!);
  for (let i = 0; i < 10; i++) {
    out = fresh();
    const current = (await s.coach.store.enrollment(ID.plus, 'ielts'))!.state.current as { flow: string };
    if (current.flow !== 'drill') break;
    const choice = data(out, /^a:\d+:\d$/);
    if (choice) await user.tap('ielts', CHAT, choice); else await user.text('ielts', CHAT, 'the');
  }
  out = [...out, ...fresh()];
  ok(s.f.memory.learning.some((event) => event.kind === 'drill_finished' && event.skill === 'ielts.grammar'), `drill finished: ${texts(out).join(' | ').slice(-300)}`);

  // Progress and the weekly report with before/after numbers.
  await user.tap('ielts', CHAT, 'm:progress');
  out = fresh();
  ok(texts(out).some((text) => text.includes('Your progress') && text.includes('Streak')), 'progress');
  await user.tap('ielts', CHAT, 'm:report');
  out = fresh();
  const report = texts(out).join('\n');
  ok(report.includes('Your week') && report.includes('Words per minute') && report.includes('→'), `report: ${report}`);

  // Reminders: none today (already practised); tomorrow at 09:30 within the shared budget; Sunday's report.
  let sent = await s.worker.cron();
  equal(sent.sent, 0, 'nothing due yet');
  s.advance(23 * 3_600_000);   // 2026-11-03 10:00 Tashkent
  sent = await s.worker.cron();
  out = fresh();
  equal(sent.sent, 1, 'the daily reminder');
  ok(out.some((call) => call.method === 'sendMessage' && call.body.chat_id === CHAT), 'sent to the learner');
  sent = await s.worker.cron();
  equal(sent.sent, 0, 'not twice');
  s.advance(5 * 24 * 3_600_000);          // Sunday 2026-11-08
  sent = await s.worker.cron();
  out = fresh();
  ok(sent.sent >= 1 && texts(out).some((text) => text.includes('→')), `weekly report push: ${texts(out).join(' | ')}`);

  // The Mini App: Telegram's signed initData becomes a Schood session.
  const init = await s.initData('ielts', CHAT);
  const post = (pack: string, origin: string) => s.worker.fetch(new Request('https://coach-bots.schood.online/miniapp/session', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ pack, init_data: init }) }));
  const session = await post('ielts', 'https://ai.schood.online');
  const minted = await session.json();
  equal([session.status, minted.linked, minted.session?.access_token], [200, true, `access-${ID.plus}`], 'mini app session');
  equal(s.f.sessionsMinted, [ID.plus], 'core minted it (ctx.auth.sessionFor), for this person only');
  const issued = s.f.memory.audit.filter((row) => row.event === 'core.session_issued');
  equal([issued.length, issued[0]?.details?.reason, JSON.stringify(issued).includes('access-')], [1, 'coach.miniapp', false], 'audited by core, with no tokens');
  equal((await post('speaking', 'https://ai.schood.online')).status, 401, 'data signed for one bot does not open another');
  equal((await post('ielts', 'https://evil.example')).status, 403, 'other origins refused');

  // Telegram's own checks: a wrong webhook secret, a redelivered update.
  const wrong = await s.send('ielts', { message: { message_id: 1, date: 1, chat: { id: 700100, type: 'private' }, from: { id: 700100, is_bot: false }, text: '/today' } }, 'not-the-secret-0000');
  equal(wrong.status, 401, 'webhook secret checked');
  const update = { update_id: 999999, message: { message_id: 5, date: 1, chat: { id: 700100, type: 'private' }, from: { id: 700100, is_bot: false, first_name: 'D' }, text: '/help' } };
  for (let i = 0; i < 2; i++) await s.worker.fetch(new Request('https://coach-bots.schood.online/tg/ielts', { method: 'POST', headers: { 'x-telegram-bot-api-secret-token': 'hook-secret-ielts-0123' }, body: JSON.stringify(update) }));
  await s.f.settle();
  equal(texts(fresh()).filter((text) => text.includes('How IELTS Coach works')).length, 1, 'a redelivered update is answered once');
});
