import { finalizeStandings, LEAGUE_DEMOTE, LEAGUE_GROUP_SIZE, LEAGUE_PROMOTE, LEAGUE_TIERS, leagueZone, rankLeague, tierAfter, type LeagueTier } from '../../_shared/english-xp.ts';
import type { Engage } from './base.ts';
import { displayName, leaderboardVisibility, weekEndsAt } from './rules.ts';
import type { LeagueGroup, LeagueMember, LeagueTierName } from './types.ts';

// E4 Leagues: weekly groups of up to 30 people in the same tier and level band. The
// rules are Schood English's (supabase/functions/_shared/english-xp.ts): top 7 move
// up if they earned XP, bottom 5 move down, never below Bronze. League XP is the
// XP of verified learning, maintained by the ingest; nobody joins a league week
// without earning XP in it, so opening the app never puts anyone on a board.

const GRACE_MS = 3_600_000;

/** Settles a finished week's group once (idempotent: the repository guards finalized_at). */
export async function settleIfDue(e: Pick<Engage, 'b' | 'now'>, group: LeagueGroup): Promise<boolean> {
  if (group.finalizedAt || e.now.getTime() < weekEndsAt(group.weekStart).getTime() + GRACE_MS) return false;
  const before = await e.b.repo.groupMembers(group.id);
  await e.b.repo.ingestMany(before.map((member) => member.userId), e.now);
  const members = await e.b.repo.groupMembers(group.id);
  const standings = finalizeStandings(group.tier as LeagueTier, members.map((member) => ({ user_id: member.userId, xp: member.xp, joined_at: member.joinedAt })));
  return await e.b.repo.settleGroup(group.id, standings.map((row) => ({ userId: row.user_id, rank: row.rank, xp: row.xp, outcome: row.outcome })));
}

export interface LeagueSummary {
  joined: boolean;
  optedOut: boolean;
  tier: LeagueTierName;
  rank: number | null;
  size: number;
  xp: number;
  zone: 'promote' | 'demote' | 'stay' | null;
  lastWeek: { weekStart: string; tier: LeagueTierName; rank: number | null; outcome: string | null; xp: number } | null;
}

/** Brings the person's league up to date: settles last week, then joins this week once they have earned XP. */
export async function leagueSummary(e: Engage, weekXp: number): Promise<{ summary: LeagueSummary; member: (LeagueMember & { group: LeagueGroup }) | null }> {
  let previous = await e.b.repo.previousMembership(e.userId, e.week);
  if (previous && !previous.outcome) {
    const group = (await e.b.repo.leagueMember(e.userId, previous.weekStart))?.group;
    if (group && await settleIfDue(e, group)) previous = await e.b.repo.previousMembership(e.userId, e.week);
  }
  const tier = (previous ? tierAfter(previous.tier as LeagueTier, previous.outcome) : 'bronze') as LeagueTierName;
  let member = await e.b.repo.leagueMember(e.userId, e.week);
  if (!member && weekXp > 0 && !e.profile.leagueOptOut) member = await e.b.repo.leagueJoin(e.userId, e.week, tier, e.profile.levelBand);
  let rank: number | null = null, size = 0, zone: LeagueSummary['zone'] = null;
  if (member) {
    const ranked = rankLeague((await e.b.repo.groupMembers(member.groupId)).map((row) => ({ user_id: row.userId, xp: row.xp, joined_at: row.joinedAt })));
    size = ranked.length;
    const mine = ranked.find((row) => row.user_id === e.userId);
    rank = mine?.rank ?? null;
    if (mine) zone = leagueZone({ rank: mine.rank, size, tier: member.tier as LeagueTier, xp: mine.xp });
  }
  return {
    member,
    summary: {
      joined: !!member, optedOut: e.profile.leagueOptOut, tier: (member?.tier ?? tier) as LeagueTierName, rank, size, xp: member?.xp ?? weekXp, zone,
      lastWeek: previous && previous.outcome ? { weekStart: previous.weekStart, tier: previous.tier, rank: previous.finalRank, outcome: previous.outcome, xp: previous.xp } : null,
    },
  };
}

/** The standings of the person's group as others see them: masked names, the person as "you". */
export async function leagueStandings(e: Engage, member: LeagueMember & { group: LeagueGroup }) {
  await e.b.repo.ingestMany((await e.b.repo.groupMembers(member.groupId)).map((row) => row.userId), e.now);
  const rows = await e.b.repo.groupMembers(member.groupId);
  const ids = rows.map((row) => row.userId);
  const [profiles, names] = await Promise.all([e.b.repo.profiles(ids), e.b.repo.names(ids)]);
  const ranked = rankLeague(rows.map((row) => ({ user_id: row.userId, xp: row.xp, joined_at: row.joinedAt })));
  return {
    tier: member.tier,
    tiers: LEAGUE_TIERS,
    week_start: member.weekStart,
    ends_at: weekEndsAt(member.weekStart).toISOString(),
    size: ranked.length,
    capacity: LEAGUE_GROUP_SIZE,
    promote: LEAGUE_PROMOTE,
    demote: member.tier === 'bronze' ? 0 : LEAGUE_DEMOTE,
    rows: ranked.map((row) => {
      const profile = profiles.get(row.user_id)!;
      const me = row.user_id === e.userId;
      return {
        rank: row.rank, xp: row.xp, me,
        name: me ? null : displayName(leaderboardVisibility(profile, e.today), names.get(row.user_id) ?? null),
        zone: leagueZone({ rank: row.rank, size: ranked.length, tier: member.tier as LeagueTier, xp: row.xp }),
      };
    }),
  };
}
