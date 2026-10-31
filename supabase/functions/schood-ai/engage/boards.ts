import { MANAGER_ROLES } from '../../../../packages/ai-core/src/mod.ts';
import { bool, oneOf, record } from '../input.ts';
import type { RequestContext } from '../types.ts';
import { begin, refuse } from './base.ts';
import { displayName, isAdult, isRegion, leaderboardVisibility, REGIONS } from './rules.ts';

// E11 Regional, school and centre leaderboards and the centre-vs-centre league, on
// weekly verified XP. Public boards (national, region, school) show only people who
// are visible there: under 18 nobody is on one unless they chose to be, and then as
// "first name and initial" at most. A centre's own board is shown to its members.
// The centre league compares opted-in centres by XP per active learner (at least 5).

const LIMIT = 50;
const MIN_ACTIVE = 5;

export async function getBoards(ctx: RequestContext) {
  await ctx.requireFeature('E11');
  const e = await begin(ctx);
  await e.b.repo.ingest(e.userId, e.now);
  const scope = oneOf(ctx.query.get('scope') ?? 'national', 'scope', ['national', 'region', 'school', 'centre', 'centres'] as const);
  if (scope === 'centres') {
    const rows = await e.b.repo.centreBoard(e.week, MIN_ACTIVE, LIMIT);
    return { scope, week_start: e.week, min_active: MIN_ACTIVE, rows: rows.map((row, index) => ({ rank: index + 1, name: row.name, active: row.active, xp_per_learner: Math.round(row.xp / row.active), mine: row.workspaceId === (ctx.query.get('workspace_id') ?? '').toLowerCase() })) };
  }
  let value: string | null = null;
  if (scope === 'region') value = ctx.query.get('region') ?? e.profile.region ?? refuse('region_required', 'Choose your region in settings first.', 409, { regions: REGIONS });
  if (scope === 'region' && !isRegion(value)) refuse('invalid_request', 'region is unknown.', 400, { field: 'region' });
  if (scope === 'school') value = e.profile.school ?? refuse('school_required', 'Add your school in settings first.', 409);
  if (scope === 'centre') {
    const access = await ctx.workspace();
    if (access.workspace.kind !== 'centre') refuse('centre_required', 'Open this from your centre’s workspace.', 409);
    value = access.workspace.id;
  }
  const rows = await e.b.repo.board(scope, value, e.week, 500);
  const ids = rows.map((row) => row.userId);
  const [profiles, names] = await Promise.all([e.b.repo.profiles(ids), e.b.repo.names(ids)]);
  const publicBoard = scope !== 'centre';
  const visible = rows.filter((row) => row.userId === e.userId || !publicBoard || leaderboardVisibility(profiles.get(row.userId)!, e.today) !== 'hidden');
  const ranked = visible.map((row, index) => ({ ...row, rank: index + 1 }));
  const me = ranked.find((row) => row.userId === e.userId) ?? null;
  const myVisibility = leaderboardVisibility(e.profile, e.today);
  return {
    scope, value: scope === 'centre' ? null : value, week_start: e.week,
    you: { visible: !publicBoard || myVisibility !== 'hidden', visibility: myVisibility, adult: isAdult(e.profile, e.today), rank: me?.rank ?? null, xp: me?.xp ?? 0 },
    rows: ranked.filter((row) => row.rank <= LIMIT || row.userId === e.userId).map((row) => {
      const profile = profiles.get(row.userId)!;
      // On a centre's own board a hidden learner still counts, as "Learner".
      const visibility = !publicBoard && leaderboardVisibility(profile, e.today) === 'hidden' ? 'hidden' : leaderboardVisibility(profile, e.today);
      return { rank: row.rank, xp: row.xp, me: row.userId === e.userId, name: row.userId === e.userId ? null : displayName(visibility, names.get(row.userId) ?? null) };
    }),
  };
}

/** A centre owner or admin puts the centre in (or out of) the centre-vs-centre league. */
export async function setCentreLeague(ctx: RequestContext) {
  const access = await ctx.workspace({ roles: MANAGER_ROLES });
  if (access.workspace.kind !== 'centre') refuse('centre_required', 'Only a centre workspace can join the centre league.', 409);
  const body = record(await ctx.body());
  const optIn = bool(body.opt_in, 'opt_in');
  const e = await begin(ctx, { locale: false });
  await e.b.repo.setCentreLeague(access.workspace.id, optIn, e.userId);
  await ctx.audit('engage.centre_league', { opt_in: optIn });
  return { opt_in: await e.b.repo.centreLeague(access.workspace.id) };
}

export async function getCentreLeague(ctx: RequestContext) {
  const access = await ctx.workspace({ roles: MANAGER_ROLES });
  if (access.workspace.kind !== 'centre') return { opt_in: false, centre: false };
  const e = await begin(ctx, { locale: false });
  return { opt_in: await e.b.repo.centreLeague(access.workspace.id), centre: true };
}
