import { equal, ID } from '../fixture.test.ts';
import { engageFixture } from './test-helpers.ts';

// Racing writes against the memory repository, which keeps the same guarantees as
// the Postgres functions (their real-session races run in scripts/test-schood-ai-engage-db.mjs).

const uid = (n: number) => `00000000-0000-4000-8000-${String(1000 + n).padStart(12, '0')}`;

Deno.test('concurrency: twenty racing reads count every verified event once', async () => {
  const f = engageFixture();
  await f.learn('tok-plus', Array.from({ length: 6 }, () => f.scored('B1', 'ielts.speaking', 5)));
  const memory = await f.store();
  await f.memory.repository.addLearningEvents(Array.from({ length: 4 }, () => ({ userId: ID.plus, workspaceId: null, area: 'coach' as const, kind: 'check_passed' as const, verified: true, feature: 'B1', skill: 'ielts.reading', verifiedMinutes: 2, score: 80, outcome: null, ref: null, source: 'web' as const })));
  await Promise.all(Array.from({ length: 20 }, () => f.get('state')));
  const events = (await memory.xpSince(ID.plus, '2026-11-01')).filter((row) => row.source === 'event');
  equal(events.length, 10, 'ten events, ten rows');
  equal(new Set(events.map((row) => row.eventId)).size, 10);
  equal(events.reduce((sum, row) => sum + row.xp, 0), 6 * 15 + 4 * 9);
});

Deno.test('concurrency: forty racing league joins fill groups of thirty', async () => {
  const f = engageFixture();
  const memory = await f.store();
  await Promise.all(Array.from({ length: 40 }, (_, n) => memory.leagueJoin(uid(n), '2026-11-02', 'bronze', 'open')));
  await Promise.all(Array.from({ length: 40 }, (_, n) => memory.leagueJoin(uid(n), '2026-11-02', 'bronze', 'open')));
  const sizes = [...memory.groups.values()].map((group) => memory.members.filter((member) => member.groupId === group.id).length).sort((a, b) => b - a);
  equal(sizes, [30, 10], 'the oldest group fills to thirty; a repeat join changes nothing');
});

Deno.test('concurrency: eight racing joins into a squad of five admit four', async () => {
  const f = engageFixture();
  const memory = await f.store();
  const squad = await memory.createSquad({ name: 'Racers', ownerId: uid(100), inviteCode: 'ABCDEFGH', weeklyGoalMinutes: 60, referralCode: null });
  if ('error' in squad) throw new Error('no squad');
  const results = await Promise.all(Array.from({ length: 8 }, (_, n) => memory.joinSquad(squad.id, uid(n), 5, null)));
  equal(results.filter((result) => result.ok).length, 4);
  equal((await memory.squadMembers(squad.id)).length, 5);
});

Deno.test('concurrency: five racing freeze purchases buy one and charge once', async () => {
  const f = engageFixture();
  await f.adult();
  const before = (await f.json('GET', 'core/me')).body.credits.total;
  const results = await Promise.all(Array.from({ length: 5 }, () => f.post('freeze-buy', {})));
  equal(results.filter((result) => result.status === 200).length >= 1, true);
  const memory = await f.store();
  equal((await memory.freezeBuys(ID.plus)).length, 1, 'one freeze');
  equal((await f.json('GET', 'core/me')).body.credits.total, before - 10, 'charged once (one reference per week)');
});

Deno.test('concurrency: overlapping deliver runs claim each message once', async () => {
  const f = engageFixture();
  const memory = await f.store();
  await memory.enqueue([1, 2, 3].map((n) => ({ userId: ID.plus, channel: 'telegram' as const, kind: 'streak_risk', priority: 80 - n, dedupeKey: `race:${n}`, payload: { text: `m${n}`, buttons: [] }, dueAt: new Date('2026-11-02T05:00:00Z').toISOString(), expiresAt: new Date('2026-11-02T19:00:00Z').toISOString() })));
  const at = new Date('2026-11-02T06:00:00Z');
  const claims = await Promise.all(Array.from({ length: 5 }, () => memory.claimDue(at, 10)));
  equal(claims.reduce((sum, rows) => sum + rows.length, 0), 3, 'three messages, claimed once in total');
  equal(await memory.claimDue(new Date(at.getTime() + 5 * 60_000), 10), [], 'a live claim is not handed out again');
  equal((await memory.claimDue(new Date(at.getTime() + 11 * 60_000), 10)).length, 3, 'a claim left by a run that died is handed back after ten minutes');
});
