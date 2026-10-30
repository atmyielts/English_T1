import { leagueName } from '../../_shared/english-xp.ts';
import { integer, record, text } from '../input.ts';
import type { RequestContext } from '../types.ts';
import { begin, dayStart, refuse, sha256, shortCode, type Engage } from './base.ts';
import { message } from './content/messages.ts';
import { queueFor } from './outbox.ts';
import { addDays, localParts, SQUAD_GOAL_DEFAULT, SQUAD_MAX, squadStreak } from './rules.ts';
import type { SquadRow } from './types.ts';

// E6 Squads: up to five friends with a shared weekly goal (verified minutes) and a
// squad streak (days on which at least half of them learned). Duels (L17) are part
// of it: duel results reported by the learner area show in the squad feed. Invites
// go through the existing referrals function, so a friend who signs up through a
// squad invite counts as the inviter's referral.

const CODE = /^[A-HJ-NP-Z2-9]{8}$/;
/** Friends address each other by a key that only means something inside this squad, never a user id. */
const memberKey = async (squadId: string, userId: string) => (await sha256(`squad:${squadId}:${userId}`)).slice(0, 20);

async function referralCode(ctx: RequestContext): Promise<string | null> {
  if (!ctx.user.token) return null;
  const me = await ctx.functions.call<{ account?: { referral_code?: string } }>('referrals', '/me', { timeoutMs: 5_000 }).catch(() => null);
  const code = me?.account?.referral_code;
  return typeof code === 'string' && /^[A-Z0-9]{4,16}$/.test(code) ? code : null;
}

export async function squadView(e: Engage, squad: SquadRow) {
  const members = await e.b.repo.squadMembers(squad.id);
  const ids = members.map((member) => member.userId);
  await e.b.repo.ingestMany(ids, e.now);
  const [names, weekTotals, history, duels] = await Promise.all([
    e.b.repo.names(ids),
    e.b.repo.dayTotals(ids, e.week, addDays(e.week, 6)),
    e.b.repo.dayTotals(ids, addDays(e.today, -90), e.today),
    e.b.repo.eventsOf(ids, dayStart(e.week, 'Asia/Tashkent'), e.now, 200),
  ]);
  const minutesBy = new Map<string, number>();
  for (const row of weekTotals) minutesBy.set(row.userId, (minutesBy.get(row.userId) ?? 0) + row.minutes);
  const activeByDay = new Map<string, number>();
  for (const row of history) if (row.events > 0) activeByDay.set(row.day, (activeByDay.get(row.day) ?? 0) + 1);
  const total = [...minutesBy.values()].reduce((sum, value) => sum + value, 0);
  const streak = squadStreak(activeByDay, members.length, e.today);
  const today = new Set(history.filter((row) => row.day === e.today && row.events > 0).map((row) => row.userId));
  const keys = new Map(await Promise.all(ids.map(async (id) => [id, await memberKey(squad.id, id)] as const)));
  return {
    id: squad.id, name: squad.name, invite_code: squad.inviteCode, invite_path: `/squads/join/${squad.inviteCode}`, owner: squad.ownerId === e.userId,
    weekly_goal_minutes: squad.weeklyGoalMinutes, week_minutes: total, goal_done: total >= squad.weeklyGoalMinutes, max_members: SQUAD_MAX,
    streak: streak.current, today_count: streak.todayCount, today_target: streak.target,
    members: members.map((member) => ({
      // Inside a squad friends see first name and initial; never an email.
      name: member.userId === e.userId ? null : leagueName({ full: names.get(member.userId) ?? '' }),
      me: member.userId === e.userId, role: member.role, week_minutes: minutesBy.get(member.userId) ?? 0, today: today.has(member.userId),
      key: keys.get(member.userId),
    })),
    duels: duels.filter((event) => event.feature === 'L17' && event.outcome).slice(-10).reverse().map((event) => ({
      name: event.userId === e.userId ? null : leagueName({ full: names.get(event.userId) ?? '' }), me: event.userId === e.userId, outcome: event.outcome, at: event.createdAt,
    })),
  };
}

export async function getSquad(ctx: RequestContext) {
  await ctx.requireFeature('E6');
  const e = await begin(ctx);
  await e.b.repo.ingest(e.userId, e.now);
  const squad = await e.b.repo.squadOf(e.userId);
  const code = ctx.query.get('code');
  const preview = code && CODE.test(code) ? await e.b.repo.squadByCode(code) : null;
  return {
    squad: squad ? await squadView(e, squad) : null,
    invite: preview && !preview.archivedAt ? { name: preview.name, members: (await e.b.repo.squadMembers(preview.id)).length, max_members: SQUAD_MAX, mine: squad?.id === preview.id } : null,
  };
}

export async function createSquad(ctx: RequestContext) {
  await ctx.requireFeature('E6');
  const e = await begin(ctx);
  const body = record(await ctx.body());
  const name = text(body.name, 'name', { min: 2, max: 40 });
  if (/[<>@]/.test(name)) refuse('invalid_request', 'name has characters it cannot have.', 400, { field: 'name' });
  const goal = body.weekly_goal_minutes === undefined ? SQUAD_GOAL_DEFAULT : integer(body.weekly_goal_minutes, 'weekly_goal_minutes', 30, 1200);
  const created = await e.b.repo.createSquad({ name, ownerId: e.userId, inviteCode: shortCode(8), weeklyGoalMinutes: goal, referralCode: await referralCode(ctx) });
  if ('error' in created) refuse('already_in_squad', 'You are already in a squad. Leave it first.', 409);
  return { squad: await squadView(e, created as SquadRow) };
}

export async function joinSquad(ctx: RequestContext) {
  await ctx.requireFeature('E6');
  const e = await begin(ctx);
  const body = record(await ctx.body());
  const code = text(body.code, 'code', { max: 12 }).toUpperCase();
  if (!CODE.test(code)) refuse('not_found', 'No squad has this code.', 404);
  const squad = await e.b.repo.squadByCode(code) ?? refuse('not_found', 'No squad has this code.', 404);
  const owner = (await e.b.repo.squadMembers(squad.id)).find((member) => member.role === 'owner');
  const result = await e.b.repo.joinSquad(squad.id, e.userId, SQUAD_MAX, null);
  if (!result.ok) refuse(result.reason === 'full' ? 'squad_full' : result.reason === 'archived' ? 'not_found' : 'already_in_squad', result.reason === 'full' ? 'This squad already has five people.' : 'You cannot join this squad.', result.reason === 'archived' ? 404 : 409);
  // The inviter's referral: the referrals function decides whether it counts (new account, not yourself).
  if (owner?.referralCode && owner.userId !== e.userId && ctx.user.token) {
    ctx.after(() => ctx.functions.call('referrals', '/claim', { method: 'POST', body: { code: owner.referralCode, metadata: { source: 'schood_ai_squad' } }, timeoutMs: 5_000 }).catch(() => null));
  }
  return { squad: await squadView(e, squad) };
}

export async function leaveSquad(ctx: RequestContext) {
  await ctx.requireFeature('E6');
  const e = await begin(ctx);
  const squad = await e.b.repo.squadOf(e.userId) ?? refuse('not_found', 'You are not in a squad.', 404);
  await e.b.repo.leaveSquad(squad.id, e.userId);
  return { squad: null };
}

export async function setSquadGoal(ctx: RequestContext) {
  await ctx.requireFeature('E6');
  const e = await begin(ctx);
  const body = record(await ctx.body());
  const squad = await e.b.repo.squadOf(e.userId) ?? refuse('not_found', 'You are not in a squad.', 404);
  if (squad.ownerId !== e.userId) refuse('role_required', 'Only the squad’s owner can change the goal.', 403);
  const goal = integer(body.weekly_goal_minutes, 'weekly_goal_minutes', 30, 1200);
  const next = await e.b.repo.updateSquad(squad.id, { weeklyGoalMinutes: goal });
  return { squad: await squadView(e, next!) };
}

/** A friendly nudge to a squad member: one per member per day, inside their own message budget. */
export async function nudge(ctx: RequestContext) {
  await ctx.requireFeature('E6');
  const e = await begin(ctx);
  const body = record(await ctx.body());
  const key = text(body.member, 'member', { max: 40 });
  const squad = await e.b.repo.squadOf(e.userId) ?? refuse('not_found', 'You are not in a squad.', 404);
  const members = await e.b.repo.squadMembers(squad.id);
  let target: string | null = null;
  for (const member of members) if (member.userId !== e.userId && await memberKey(squad.id, member.userId) === key) target = member.userId;
  if (!target) return refuse('not_found', 'That person is not in your squad.', 404);
  const [theirs, prefs] = await Promise.all([e.b.repo.profile(target), ctx.notify.prefs(target)]);
  const view = await squadView(e, squad);
  const local = localParts(e.now, prefs.timeZone);
  const names = await e.b.repo.names([e.userId]);
  const note = message('squad_nudge', theirs.locale, { name: leagueName({ full: names.get(e.userId) ?? '' }), squad: squad.name, minutes: view.week_minutes, goal: squad.weeklyGoalMinutes });
  // Their own choices decide: a muted kind or no messages means no nudge; one per member per day.
  const result = await queueFor(ctx, e.b.repo, {
    userId: target, kind: 'squad_nudge', dedupe: `squad_nudge:${target}:${local.day}`,
    payload: { ...note, data: { squad: squad.id } }, dueAt: e.now.toISOString(), expiresAt: new Date(e.now.getTime() + 12 * 3_600_000).toISOString(),
  });
  return { queued: result.queued, reason: result.reason === 'already_queued' ? 'already_nudged_today' : result.reason };
}
