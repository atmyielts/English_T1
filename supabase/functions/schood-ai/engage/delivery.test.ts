import { equal, ID, ok } from '../fixture.test.ts';
import { DAY, engageFixture } from './test-helpers.ts';

// Delivery: the planner (E5 streaks, E9 check-ins, E14 win-back), the outbox the
// bots drain with the service secret, the core notification budget (two a day per
// person across every bot, never 22:00–08:00 local), the chosen hour and the web inbox.

const HOUR = 3_600_000;
// The fixture starts on Monday 2026-11-02 at 11:00 in Tashkent; the default chosen hour is 19:00.

async function drain(f: ReturnType<typeof engageFixture>, bot = 'student') {
  const response = await f.worker('engage/outbox', 'POST', ID.plus, '700100', { channel: 'telegram', bot });
  return (await response.json()).messages as { id: string; kind: string; text: string; claim: string; buttons: { path: string }[] }[];
}
const tick = async (f: ReturnType<typeof engageFixture>) => (await (await f.worker('engage/tick', 'POST', ID.plus, '700100', {})).json()) as { queued: number; candidates: string[] };

Deno.test('rule: at most two messages a day across all bots, at the chosen hour, never in quiet hours', async () => {
  const f = engageFixture();
  await f.learn('tok-plus', [f.scored('B1', 'ielts.speaking', 5)]);
  f.advance(DAY);
  await f.learn('tok-plus', [f.scored('B1', 'ielts.speaking', 5)]);
  f.advance(DAY); // Wednesday 11:00: a 2-day streak, nothing yet today
  await f.post('date-add', { kind: 'interview', title: 'Visa interview', on_date: '2026-11-05' });
  const planned = await tick(f);
  equal(planned.candidates, ['checkin_soon', 'streak_risk'], 'the dated goal first, then the streak');
  equal(await drain(f), [], 'nothing before the chosen hour (19:00)');
  f.advance(8 * HOUR); // 19:00
  const sent = await drain(f);
  equal(sent.map((message) => message.kind), ['checkin_soon', 'streak_risk']);
  equal(sent[0].text, 'Your interview "Visa interview" is tomorrow. A 10-minute rehearsal tonight?');
  ok(sent[1].text.includes('2-day streak'), 'the real streak');
  for (const message of sent) equal((await (await f.worker('engage/outbox-ack', 'POST', ID.plus, '700100', { id: message.id, claim: message.claim, status: 'sent' })).json()).ok, true);
  // A friend's nudge is queued, but the person already had two today, whichever bot asks.
  await f.post('squad-create', { name: 'Owls' });
  const code = (await f.get('squad')).body.squad.invite_code;
  await f.post('squad-join', { code }, 'tok-beta');
  const key = (await f.get('squad', 'tok-beta')).body.squad.members.find((member: { me: boolean }) => !member.me).key;
  equal((await f.post('squad-nudge', { member: key }, 'tok-beta')).body.queued, true);
  equal(await drain(f, 'coach_b4'), [], 'the coach bot cannot send a third');
  const memory = await f.store();
  const nudge = memory.outboxRows.find((row) => row.kind === 'squad_nudge')!;
  equal([nudge.status, nudge.reason], ['skipped', 'daily_limit'], 'tomorrow’s budget would be after it goes stale, so it is dropped, not sent late');
});

Deno.test('rule: nothing is sent in quiet hours; a message that would go stale overnight is dropped', async () => {
  const f = engageFixture();
  await f.learn('tok-plus', [f.scored('B1', 'ielts.speaking', 5)]);
  f.advance(DAY);
  await f.learn('tok-plus', [f.scored('B1', 'ielts.speaking', 5)]);
  f.advance(DAY + 11.5 * HOUR); // Wednesday 22:30
  await tick(f);
  equal(await drain(f), [], 'quiet hours');
  const memory = await f.store();
  ok(memory.outboxRows.filter((row) => row.userId === ID.plus).every((row) => row.status !== 'sent'), 'nothing sent');
});

Deno.test('rule: messages can be switched off in one setting; "important" keeps only dated goals and results', async () => {
  const f = engageFixture();
  await f.learn('tok-plus', [f.scored('B1', 'ielts.speaking', 5)]);
  f.advance(DAY);
  await f.learn('tok-plus', [f.scored('B1', 'ielts.speaking', 5)]);
  f.advance(DAY);
  await f.post('date-add', { kind: 'exam', title: 'IELTS', on_date: '2026-11-07' });
  await f.post('settings', { messages: 'important' });
  equal((await tick(f)).candidates, ['checkin_soon']);
  await f.post('settings', { messages: 'none' });
  f.advance(DAY);
  equal((await tick(f)).candidates, [], 'off means off');
});

Deno.test('E14: win-back shows real progress, at most three times per lapse, and resets when they return', async () => {
  const f = engageFixture();
  await f.learn('tok-plus', [f.scored('B1', 'ielts.speaking', 10), f.passed('B1', 'ielts.reading', 3)]);
  const xp = (await f.get('state')).body.xp.total;
  f.advance(2 * DAY);
  const first = await tick(f);
  equal(first.candidates, ['winback_2']);
  const memory = await f.store();
  const row = memory.outboxRows.find((entry) => entry.kind === 'winback_2')!;
  ok(row.payload.text.includes(`${xp} XP`), `the person's own XP: ${row.payload.text}`);
  ok(!/last chance|hurry|expires/i.test(row.payload.text), 'no fake urgency');
  f.advance(DAY);
  equal((await tick(f)).candidates, [], 'not again for the same stage');
  f.advance(4 * DAY);
  equal((await tick(f)).candidates, ['winback_7', 'league_result'], 'last week’s league result is real news too');
  f.advance(14 * DAY);
  equal((await tick(f)).candidates, ['winback_21'], 'an old league is never announced again');
  f.advance(10 * DAY);
  equal((await tick(f)).candidates, [], 'three per lapse at most: then silence');
  await f.learn('tok-plus', [f.scored('B1', 'ielts.speaking', 5)]);
  await tick(f);
  equal((await memory.profile(ID.plus)).lapseStage, 0, 'returning resets the lapse');
});

Deno.test('E14 + E5: a broken streak gets the comeback offer (learning, never money)', async () => {
  const f = engageFixture();
  for (let day = 0; day < 4; day++) { await f.learn('tok-plus', [f.scored('B1', 'ielts.speaking', 2)]); f.advance(DAY); }
  f.advance(DAY); // a missed day, no freeze held
  await f.learn('tok-plus', [f.scored('B1', 'ielts.speaking', 2)]);
  const state = (await f.get('state')).body;
  equal([state.streak.comeback.status, state.streak.comeback.old_streak], ['open', 4]);
  equal(state.streak.can_buy_freeze, false, 'unknown age: no purchase is ever offered');
  ok((await tick(f)).candidates.includes('comeback_open'), 'the comeback is offered');
});

Deno.test('E9: the coach remembers dated goals and weak spots, and chats can read it as context', async () => {
  const f = engageFixture();
  await f.post('date-add', { kind: 'interview', title: 'Job interview at Navro', on_date: '2026-11-05', at_time: '10:00' });
  equal((await f.post('date-add', { kind: 'exam', title: 'Past', on_date: '2026-10-01' })).status, 400, 'only future dates');
  await f.learn('tok-plus', [{ kind: 'check_failed', area: 'coach', feature: 'B1', skill: 'ielts.listening.s3' }, { kind: 'check_failed', area: 'coach', feature: 'B1', skill: 'ielts.listening.s4' }, f.passed('B1', 'ielts.reading', 2)]);
  const memory = (await f.get('memory')).body;
  equal([memory.dates[0].title, memory.dates[0].days_left, memory.weak_spot], ['Job interview at Navro', 3, 'ielts.listening']);
  const context = (await f.json('GET', 'core/context', { query: { kind: 'engage_memory' } })).body;
  const block = (context.blocks ?? []).find((entry: { kind: string }) => entry.kind === 'engage_memory');
  ok(block && JSON.stringify(block).includes('Job interview at Navro'), `engage_memory is offered to chats: ${JSON.stringify(context).slice(0, 300)}`);
  f.advance(4 * DAY);
  ok((await tick(f)).candidates.includes('checkin_after'), 'the day after: how did it go?');
});

Deno.test('web: without Telegram, messages wait in the in-app inbox and use no push budget', async () => {
  const f = engageFixture();
  await f.learn('tok-beta', [f.scored('B1', 'ielts.speaking', 5)]);
  f.advance(DAY);
  await f.learn('tok-beta', [f.scored('B1', 'ielts.speaking', 5)]);
  f.advance(DAY + 9 * HOUR); // Wednesday 20:00
  equal((await f.post('tick', {}, 'tok-beta')).body.candidates, ['streak_risk']);
  const inbox = (await f.get('inbox', 'tok-beta')).body;
  equal(inbox.new.length, 1);
  ok(inbox.new[0].buttons[0].path.startsWith('/'), 'buttons open in-app pages');
  const again = (await f.get('inbox', 'tok-beta')).body;
  equal([again.new.length, again.earlier.length], [0, 1], 'shown once as new, then kept for a week');
});

Deno.test('scheduler seam: who is due is answered once per day, after their chosen hour, for linked chats only', async () => {
  const f = engageFixture();
  await f.learn('tok-plus', [f.scored('B1', 'ielts.speaking', 5)]);
  await f.learn('tok-beta', [f.scored('B1', 'ielts.speaking', 5)]);
  const memory = await f.store();
  equal(await memory.dueUsers(new Date('2026-11-02T10:00:00Z'), 10), [], '15:00 local is before 19:00');
  equal(await memory.dueUsers(new Date('2026-11-02T14:30:00Z'), 10), [{ userId: ID.plus, chatId: '700100' }], 'only people with a linked chat');
  equal(await memory.dueUsers(new Date('2026-11-02T15:30:00Z'), 10), [], 'once a day');
  equal(await memory.dueUsers(new Date('2026-11-02T18:00:00Z'), 10), [], 'never in quiet hours');
});
