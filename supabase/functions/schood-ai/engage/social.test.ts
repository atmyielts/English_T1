import { equal, ID, ok } from '../fixture.test.ts';
import { DAY, engageFixture } from './test-helpers.ts';

// Leagues (E4), squads and duels (E6), seasons and live events (E10), and the
// regional, school and centre boards (E11).

Deno.test('E4: weekly league from verified XP, masked names, settled after the week with promotion', async () => {
  const f = engageFixture();
  await f.adult('tok-plus');
  await f.learn('tok-plus', [f.scored('B1', 'ielts.speaking', 10)]);
  await f.learn('tok-beta', [f.scored('B1', 'ielts.speaking', 2)]);
  await f.learn('tok-admin', [f.passed('B1', 'ielts.reading', 0)]);
  for (const token of ['tok-plus', 'tok-beta', 'tok-admin']) await f.get('state', token);
  const league = (await f.get('league', 'tok-beta')).body;
  equal([league.summary.joined, league.summary.tier, league.standings.size], [true, 'bronze', 3]);
  const names = league.standings.rows.map((row: { name: string | null; me: boolean }) => row.me ? 'me' : row.name);
  // An adult shows as first name and initial (this profile has no surname); unknown age shows as "Learner".
  equal(names, ['Dilnoza', 'me', 'Learner']);
  equal(league.standings.demote, 0, 'nobody drops out of Bronze');
  // The next week: last week is settled once and the top earners move up.
  f.advance(7 * DAY);
  await f.learn('tok-plus', [f.scored('B1', 'ielts.speaking', 1)]);
  const next = (await f.get('league', 'tok-plus')).body;
  equal([next.summary.last_week.outcome, next.summary.last_week.rank, next.summary.tier], ['promoted', 1, 'silver']);
  const memory = await f.store();
  const settled = [...memory.groups.values()].filter((group) => group.finalizedAt);
  equal(settled.length, 1);
  equal((await f.get('league', 'tok-beta')).body.summary.last_week.outcome, 'promoted', 'the top 7 move up when they earned XP');
});

Deno.test('E4: people who opted out are never placed in a league; their XP and streak still count', async () => {
  const f = engageFixture();
  await f.post('settings', { league_opt_out: true });
  await f.learn('tok-plus', [f.scored('B1', 'ielts.speaking', 5)]);
  const state = (await f.get('state')).body;
  equal([state.league.joined, state.league.opted_out, state.streak.current], [false, true, 1]);
});

Deno.test('E6: squads of up to 5 with a shared weekly goal and a squad streak; duels feed in; nudges stay in budget', async () => {
  const f = engageFixture();
  const created = (await f.post('squad-create', { name: 'Morning Owls', weekly_goal_minutes: 60 })).body.squad;
  ok(/^[A-HJ-NP-Z2-9]{8}$/.test(created.invite_code), 'an invite code people can read aloud');
  equal((await f.post('squad-create', { name: 'Second' })).body.code, 'already_in_squad', 'one squad at a time');
  equal((await f.get('squad', 'tok-beta', { code: created.invite_code })).body.invite.name, 'Morning Owls');
  equal((await f.post('squad-join', { code: created.invite_code }, 'tok-beta')).status, 200);
  equal((await f.post('squad-join', { code: 'ZZZZZZZZ' }, 'tok-admin')).status, 404);
  await f.learn('tok-plus', [f.scored('B2', 'speaking.roleplay', 20), { kind: 'check_passed', area: 'learner', feature: 'L17', verified_minutes: 3, outcome: 'win', score: 9 }]);
  await f.learn('tok-beta', [f.scored('B2', 'speaking.roleplay', 30)]);
  const squad = (await f.get('squad')).body.squad;
  equal([squad.week_minutes, squad.goal_done, squad.streak, squad.today_target], [53, false, 1, 2]);
  equal(squad.duels[0].outcome, 'win', 'the duel shows in the squad feed');
  ok(squad.members.every((member: Record<string, unknown>) => !('user_id' in member)), 'friends never see each other’s ids');
  ok(!JSON.stringify(squad).includes(ID.beta), 'no ids at all');
  const friend = squad.members.find((member: { me: boolean }) => !member.me);
  equal((await f.post('squad-nudge', { member: friend.key })).body.queued, true);
  equal((await f.post('squad-nudge', { member: friend.key })).body.reason, 'already_nudged_today', 'one nudge per friend per day');
  await f.post('squad-goal', { weekly_goal_minutes: 50 });
  equal((await f.get('squad')).body.squad.goal_done, true);
  equal((await f.post('squad-goal', { weekly_goal_minutes: 50 }, 'tok-beta')).body.code, 'role_required', 'only the owner sets the goal');
  await f.post('squad-leave', {});
  equal((await f.get('squad', 'tok-beta')).body.squad.owner, true, 'the squad passes to the next member');
});

Deno.test('E11: boards are weekly verified XP; minors are hidden from public boards unless they opt in', async () => {
  const f = engageFixture();
  await f.adult('tok-plus');
  await f.post('settings', { region: 'samarkand', school: 'School 21' }, 'tok-plus');
  await f.post('settings', { region: 'samarkand' }, 'tok-beta');
  await f.learn('tok-plus', [f.scored('B1', 'ielts.speaking', 5)]);
  await f.learn('tok-beta', [f.scored('B1', 'ielts.speaking', 9)]);
  const region = (await f.get('boards', 'tok-plus', { scope: 'region' })).body;
  equal(region.rows.length, 1, 'the minor (unknown age) is not on a public board');
  equal(region.rows[0].me, true);
  await f.post('settings', { leaderboard: 'masked' }, 'tok-beta');
  const after = (await f.get('boards', 'tok-plus', { scope: 'region' })).body;
  equal(after.rows.length, 2, 'they chose to appear');
  equal(after.rows[0].rank, 1);
  equal((await f.get('boards', 'tok-beta', { scope: 'school' })).body.code, 'school_required');
  equal((await f.get('boards', 'tok-plus', { scope: 'school' })).body.value, 'school 21');
});

Deno.test('E11: a centre board for its students, and the centre-vs-centre league for opted-in centres', async () => {
  const f = engageFixture();
  const centre = f.memory.seed.centre({ name: 'Registan Centre', ownerId: ID.owner });
  for (const id of [ID.student, ID.plus, ID.beta, ID.admin, ID.parent]) f.memory.seed.member(centre.id, id, 'student');
  for (const token of ['tok-student', 'tok-plus', 'tok-beta', 'tok-admin', 'tok-parent']) await f.learn(token, [f.scored('B1', 'ielts.speaking', 4)]);
  const board = (await f.get('boards', 'tok-student', { scope: 'centre', workspace_id: centre.id })).body;
  equal(board.rows.length, 5, 'every student counts on their own centre’s board');
  ok(board.rows.filter((row: { me: boolean }) => !row.me).every((row: { name: string }) => row.name === 'Learner'), 'hidden learners appear as "Learner"');
  equal((await f.post('centre-league', { opt_in: true }, 'tok-student', { workspace_id: centre.id })).body.code, 'role_required');
  equal((await f.post('centre-league', { opt_in: true }, 'tok-owner', { workspace_id: centre.id })).body.opt_in, true);
  const league = (await f.get('boards', 'tok-plus', { scope: 'centres' })).body;
  equal(league.rows.map((row: { name: string; active: number }) => [row.name, row.active]), [['Registan Centre', 5]]);
});

Deno.test('E10: the season, the weekly national mock and monthly tournaments rank verified scores; sponsors are admin-set text', async () => {
  const f = engageFixture();
  await f.adult('tok-plus');
  f.advance(6 * DAY); // Sunday 2026-11-08 11:00: the mock weekend, and tournament days (8th–21st)
  const events = (await f.get('events')).body;
  equal(events.season.key, 'season:2026-q4');
  const mock = events.events.find((event: { kind: string }) => event.kind === 'national_mock');
  equal(mock.open, true);
  await f.learn('tok-plus', [{ kind: 'mock_finished', area: 'coach', feature: 'B1', skill: 'ielts.mock', verified_minutes: 30, score: 6.5, ref: `national_mock:2026-11-02:ielts` }]);
  await f.learn('tok-beta', [{ kind: 'mock_finished', area: 'coach', feature: 'B1', skill: 'ielts.mock', verified_minutes: 30, score: 7, ref: `national_mock:2026-11-02:ielts` }]);
  const standings = (await f.get('events')).body.events.find((event: { kind: string }) => event.kind === 'national_mock').standings;
  equal(standings.map((row: { rank: number; me: boolean }) => [row.rank, row.me]), [[1, false], [2, true]]);
  equal(standings[0].name, 'Learner', 'a minor on a public result is "Learner"');
  const key = '2026-11';
  equal((await f.post('event-join', { key: `tournament:speaking:${key}` })).status, 200);
  await f.learn('tok-plus', [6, 6.5, 7, 7.5].map((score) => f.scored('B2', 'speaking.roleplay', 2, { score })));
  const tournament = (await f.get('events')).body.events.find((event: { kind: string }) => event.kind === 'tournament_speaking');
  equal([tournament.joined, tournament.standings.length, tournament.standings[0].score], [true, 1, 75]);
  equal((await f.post('event-sponsor', { key: `tournament:speaking:${key}`, sponsor_name: 'Registan Centre', prize: { en: 'Free speaking course' } })).body.code, 'admin_required');
  const sponsored = await f.post('event-sponsor', { key: `tournament:speaking:${key}`, sponsor_name: 'Registan Centre', logo_url: 'https://example.org/logo.png', prize: { en: 'Free speaking course', uz: 'Bepul nutq kursi' } }, 'tok-admin');
  equal(sponsored.status, 200);
  equal((await f.post('event-sponsor', { key: 'season:2026-q4', sponsor_name: 'X', logo_url: 'javascript:alert(1)' }, 'tok-admin')).body.code, 'invalid_request', 'https logos only');
  const shown = (await f.get('events', 'tok-plus')).body.events.find((event: { kind: string }) => event.kind === 'tournament_speaking').sponsor;
  equal(shown, { name: 'Registan Centre', logo_url: 'https://example.org/logo.png', prize: 'Free speaking course' });
});
