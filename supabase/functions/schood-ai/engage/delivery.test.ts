import { equal, ID, ok } from '../fixture.test.ts';
import { engageStore } from './binding.ts';
import { b64, DAY, engageFixture, WEBM } from './test-helpers.ts';

// Delivery: the planner (E5 streaks, E9 check-ins, E14 win-back) and the deliver job,
// both run by core's scheduler (core/system-tick, every five minutes), sending through
// ctx.notify.send: the person's delivery choice, mutes, quiet hours and two-a-day budget
// (core's notification preferences) decide; the web inbox gets the rest.

const HOUR = 3_600_000, MIN = 60_000;
// The fixture starts on Monday 2026-11-02 at 11:00 in Tashkent; with no preferred hour chosen, engage plans at 19:00.
type F = ReturnType<typeof engageFixture>;

/** One scheduler run, then another five minutes later (planning and delivery are separate jobs). */
async function run(f: F) {
  await f.tick();
  f.advance(5 * MIN);
  await f.tick();
}
const sentTo = (f: F, userId = ID.plus) => f.notifySends.filter((send) => send.userId === userId);
async function plannedKinds(f: F, userId = ID.plus) {
  const memory = await f.store(), before = new Set(memory.outboxRows.map((row) => row.id));
  await f.tick();
  return memory.outboxRows.filter((row) => !before.has(row.id) && row.userId === userId).map((row) => row.kind);
}
const prefs = (f: F, body: Record<string, unknown>, token = 'tok-plus') => f.json('PUT', 'core/notify-prefs', { token, body });

async function twoDayStreak(f: F) {
  await f.learn('tok-plus', [f.scored('B1', 'ielts.speaking', 5)]);
  f.advance(DAY);
  await f.learn('tok-plus', [f.scored('B1', 'ielts.speaking', 5)]);
  f.advance(DAY); // Wednesday 11:00: a 2-day streak, nothing yet today
}

Deno.test('rule: at most two messages a day across all bots, at the preferred hour, sent by the Schood bot', async () => {
  const f = engageFixture();
  await twoDayStreak(f);
  await f.post('date-add', { kind: 'interview', title: 'Visa interview', on_date: '2026-11-05' });
  await run(f);
  equal(sentTo(f), [], 'nothing before the preferred hour (19:00 by default)');
  f.advance(8 * HOUR - 5 * MIN); // 19:00
  await run(f);
  const sent = sentTo(f);
  equal(sent.map((message) => message.kind), ['engage.checkin', 'engage.streak'], 'the dated goal first, then the streak');
  equal(sent[0].text, 'Your interview "Visa interview" is tomorrow. A 10-minute rehearsal tonight?');
  ok(sent[1].text.includes('2-day streak'), 'the real streak');
  ok(sent.every((message) => message.dedupeKey?.startsWith('engage:')), 'a retried run never sends twice');
  ok(sent.every((message) => message.buttons.every((button) => button.path.startsWith('/'))), 'buttons open Schood AI pages');
  const memory = await f.store();
  ok(memory.outboxRows.filter((row) => row.userId === ID.plus).every((row) => row.status === 'sent'), 'both marked sent');
  // A friend's nudge is queued, but the person already had two today across every bot.
  await f.post('squad-create', { name: 'Owls' });
  const code = (await f.get('squad')).body.squad.invite_code;
  await f.post('squad-join', { code }, 'tok-beta');
  const key = (await f.get('squad', 'tok-beta')).body.squad.members.find((member: { me: boolean }) => !member.me).key;
  equal((await f.post('squad-nudge', { member: key }, 'tok-beta')).body.queued, true);
  f.advance(5 * MIN);
  await f.tick();
  equal(sentTo(f).length, 2, 'no third message');
  const nudge = memory.outboxRows.find((row) => row.kind === 'squad_nudge')!;
  equal([nudge.status, nudge.reason], ['skipped', 'daily_limit'], 'tomorrow’s budget would be after it goes stale, so it is dropped, not sent late');
});

Deno.test('rule: nothing is planned or sent in quiet hours; a held message goes in the morning', async () => {
  const f = engageFixture();
  await twoDayStreak(f);
  f.advance(11.5 * HOUR); // Wednesday 22:30
  await run(f);
  const memory = await f.store();
  equal(memory.outboxRows.filter((row) => row.userId === ID.plus).length, 0, 'not due in quiet hours');
  // A message queued by an action at night is held by core until 08:00.
  await f.post('squad-create', { name: 'Owls' });
  const code = (await f.get('squad')).body.squad.invite_code;
  await f.post('squad-join', { code }, 'tok-beta');
  const key = (await f.get('squad', 'tok-beta')).body.squad.members.find((member: { me: boolean }) => !member.me).key;
  await f.post('squad-nudge', { member: key }, 'tok-beta');
  await run(f);
  equal(sentTo(f), [], 'quiet hours');
  const held = memory.outboxRows.find((row) => row.kind === 'squad_nudge')!;
  equal([held.status, held.reason], ['queued', 'quiet_hours']);
  f.advance(10 * HOUR); // Thursday 08:40
  await run(f);
  equal(sentTo(f).map((message) => message.kind), ['engage.squad'], 'sent after quiet hours');
});

Deno.test('rule: people choose in core’s settings: mute one kind, all of engage, or zero messages a day', async () => {
  const f = engageFixture();
  await twoDayStreak(f);
  await f.post('date-add', { kind: 'exam', title: 'IELTS', on_date: '2026-11-07' });
  f.advance(8 * HOUR); // Wednesday 19:00
  equal((await prefs(f, { muted: ['engage.streak'] })).status, 200);
  equal(await plannedKinds(f), ['checkin_soon'], 'the muted kind is never planned');
  ok((await f.json('GET', 'core/notify-prefs')).body.kinds.some((kind: { key: string; area: string }) => kind.key === 'engage.winback' && kind.area === 'engage'), 'engage kinds are listed to mute');
  f.advance(DAY);
  await prefs(f, { muted: ['engage'] });
  equal(await plannedKinds(f), [], 'muting engage stops every engage message');
  f.advance(DAY);
  await prefs(f, { muted: [], daily_limit: 0 });
  equal(await plannedKinds(f), [], 'zero a day means none');
});

Deno.test('rule: the preferred hour and time zone come from core’s settings', async () => {
  const f = engageFixture();
  await twoDayStreak(f);
  await prefs(f, { preferred_hour: 12 });
  f.advance(1 * HOUR); // Wednesday 12:00 Tashkent
  equal(await plannedKinds(f), ['streak_risk'], 'planned at noon, as chosen');
  const g = engageFixture();
  await prefs(g, { time_zone: 'Europe/London' });
  await twoDayStreak(g);
  g.advance(8 * HOUR); // 19:00 in Tashkent is 14:00 in London
  equal(await plannedKinds(g), [], 'not yet where they are');
  g.advance(5 * HOUR);
  equal(await plannedKinds(g), ['streak_risk'], '19:00 in London');
});

Deno.test('E14: win-back shows real progress, at most three times per lapse, and resets when they return', async () => {
  const f = engageFixture();
  await f.learn('tok-plus', [f.scored('B1', 'ielts.speaking', 10), f.passed('B1', 'ielts.reading', 3)]);
  const xp = (await f.get('state')).body.xp.total;
  f.advance(2 * DAY + 8 * HOUR); // Wednesday 19:00
  equal(await plannedKinds(f), ['winback_2']);
  const memory = await f.store();
  const row = memory.outboxRows.find((entry) => entry.kind === 'winback_2')!;
  ok(row.payload.text.includes(`${xp} XP`), `the person's own XP: ${row.payload.text}`);
  ok(!/last chance|hurry|expires/i.test(row.payload.text), 'no fake urgency');
  f.advance(DAY);
  equal(await plannedKinds(f), [], 'not again for the same stage');
  f.advance(4 * DAY);
  equal(await plannedKinds(f), ['winback_7', 'league_result'], 'last week’s league result is real news too');
  f.advance(14 * DAY);
  equal(await plannedKinds(f), ['winback_21'], 'an old league is never announced again');
  f.advance(10 * DAY);
  equal(await plannedKinds(f), [], 'three per lapse at most: then silence');
  f.advance(16 * HOUR); // the next day, 11:00
  await f.learn('tok-plus', [f.scored('B1', 'ielts.speaking', 5)]);
  f.advance(8 * HOUR);
  await plannedKinds(f);
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
  f.advance(8 * HOUR);
  ok((await plannedKinds(f)).includes('comeback_open'), 'the comeback is offered');
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
  f.advance(4 * DAY + 8 * HOUR);
  ok((await plannedKinds(f)).includes('checkin_after'), 'the day after: how did it go?');
});

Deno.test('web: people without Telegram, or who chose the inbox, get messages in the app and use no push budget', async () => {
  const f = engageFixture();
  await f.learn('tok-beta', [f.scored('B1', 'ielts.speaking', 5)]);
  f.advance(DAY);
  await f.learn('tok-beta', [f.scored('B1', 'ielts.speaking', 5)]);
  f.advance(DAY + 9 * HOUR); // Wednesday 20:00
  await run(f);
  equal(sentTo(f, ID.beta), [], 'nothing pushed');
  const inbox = (await f.get('inbox', 'tok-beta')).body;
  equal(inbox.new.map((message: { kind: string }) => message.kind), ['streak_risk']);
  ok(inbox.new[0].buttons[0].path.startsWith('/'), 'buttons open in-app pages');
  const again = (await f.get('inbox', 'tok-beta')).body;
  equal([again.new.length, again.earlier.length], [0, 1], 'shown once as new, then kept for a week');
  // Planned for Telegram, then they switch Telegram off: the message moves to the inbox.
  const g = engageFixture();
  await twoDayStreak(g);
  g.advance(8 * HOUR);
  await g.tick();
  await prefs(g, { delivery: ['web'] });
  g.advance(5 * MIN);
  await g.tick();
  equal(sentTo(g), [], 'not pushed');
  equal((await g.get('inbox')).body.new.map((message: { kind: string }) => message.kind), ['streak_risk'], 'moved to the inbox');
});

Deno.test('deliver job: the bot’s answer decides (deferred counts as sent; a failure is retried, then given up)', async () => {
  const f = engageFixture();
  await twoDayStreak(f);
  f.advance(8 * HOUR);
  f.setNotifyOutcome({ outcome: 'failed' });
  await run(f);
  const memory = await f.store();
  const row = () => memory.outboxRows.find((entry) => entry.kind === 'streak_risk')!;
  equal([row().status, row().reason], ['queued', 'failed'], 'tried again in 15 minutes');
  f.setNotifyOutcome({ outcome: 'defer', deliverAt: new Date(Date.parse('2026-11-04T16:00:00Z')).toISOString() });
  f.advance(15 * MIN);
  await f.tick();
  equal([row().status, row().reason], ['sent', 'deferred'], 'the Schood bot keeps it for their delivery time');
});

Deno.test('scheduler: who is due is answered once a day, after the preferred hour, outside quiet hours, where messages reach them', async () => {
  const f = engageFixture();
  await f.learn('tok-plus', [f.scored('B1', 'ielts.speaking', 5)]);
  await f.learn('tok-beta', [f.scored('B1', 'ielts.speaking', 5)]);
  const memory = await f.store();
  equal(await memory.dueUsers(new Date('2026-11-02T10:00:00Z'), 10), [], '15:00 local is before 19:00');
  equal(await memory.dueUsers(new Date('2026-11-02T14:30:00Z'), 10), [{ userId: ID.plus, chatId: '700100' }, { userId: ID.beta, chatId: null }].sort((a, b) => a.userId.localeCompare(b.userId)), 'a linked chat, or the inbox');
  equal(await memory.dueUsers(new Date('2026-11-02T15:30:00Z'), 10), [], 'once a day');
  equal(await memory.dueUsers(new Date('2026-11-03T18:00:00Z'), 10), [], 'never in quiet hours (23:00 local)');
});

Deno.test('scheduled jobs: no user, league rollover without anyone opening a league', async () => {
  const f = engageFixture();
  await f.learn('tok-plus', [f.scored('B1', 'ielts.speaking', 5)]);
  await f.learn('tok-beta', [f.scored('B1', 'ielts.speaking', 5)]);
  for (const token of ['tok-plus', 'tok-beta']) equal((await f.get('state', token)).body.league.joined, true);
  const memory = await f.store();
  f.advance(7 * DAY - 9 * HOUR + 15 * MIN); // the next Monday 02:15 Tashkent
  await f.tick();
  equal([...memory.groups.values()].filter((group) => group.finalizedAt).length, 1, 'last week’s group is settled by the job');
  ok(memory.members.every((member) => member.outcome !== null), 'final ranks written');
});

Deno.test('audio of a closed account: queued at erasure, deleted by the sweep, never another area’s object', async () => {
  const f = engageFixture();
  await f.adult();
  equal((await f.post('sample-voice', { audio_base64: b64(WEBM), mime: 'audio/webm', duration_ms: 30_000, prompt_key: 'intro' })).status, 200);
  const memory = await f.store();
  const binding = f.stores.get(engageStore).current()!;
  const storage = binding.storage as unknown as { objects: Map<string, unknown> };
  equal(storage.objects.size, 1, 'one recording stored');
  // A sample that points at a recording another area stored (recordSample with a reference) is not engage's to delete.
  await memory.addSample({ userId: ID.plus, kind: 'voice', source: 'coach', sourceRef: 'coach:clip-1', storage: { provider: 's3', bucket: 'media', path: 'schood-ai/coach/clip-1.webm' }, text: null, promptKey: null, feature: 'B2', scores: {}, metrics: {}, durationMs: 20_000, recordedAt: new Date().toISOString() });
  memory.eraseAccount(ID.plus);
  equal(memory.mediaTrash.map((row) => row.storage.path.split('/').slice(0, 3).join('/')), ['schood-ai/engage/samples'], 'only the engage recording is queued at erasure');
  f.advance(DAY - 6 * HOUR); // past 04:20 the next morning
  await f.tick();
  equal(storage.objects.size, 0, 'the sweep deleted it');
  equal(memory.mediaTrash.length, 0, 'and cleared the queue');
});
