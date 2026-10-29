import { DEFAULT_NOTIFY_HOUR, DEFAULT_TIME_ZONE } from './rules.ts';
import type { EngageRepository, ProfilePatch } from './store.ts';
import type {
  CertificateRow, DateRow, DayRow, EngageProfile, EventRow, EventSponsor, FreezeBuy, GoalRow, JourneyRow, LeagueGroup, LeagueMember, OutboxRow,
  PassportItem, PassportLink, PassportRow, SampleRow, SittingRow, SquadMember, SquadRow, StoryEpisodeCache, StoryProgress, StoryResult,
  TalentAudit, TalentEmployer, TalentProfile, XpRow,
} from './types.ts';

// The engage repository on Postgres through the service role. Every write that two
// requests could race on goes through a SECURITY DEFINER function of
// 20261030800000_schood_ai_engage.sql (ingest, bonuses, freezes, league joins and
// settling, squads, the outbox claim, who is due); the rest is plain table access
// that the route has already authorised for the person.

type DbError = { code?: string; message: string } | null;
type Result<T> = { data: T | null; error: DbError };
// deno-lint-ignore no-explicit-any
type Query = any;
export interface EngageDatabase {
  from(table: string): Query;
  rpc(name: string, args: Record<string, unknown>): PromiseLike<Result<unknown>>;
}
type Row = Record<string, unknown>;

function check<T>(result: Result<T>): T {
  if (result.error) throw new Error(`${result.error.code ?? 'db'}: ${result.error.message}`);
  return result.data as T;
}
const str = (value: unknown) => (value === null || value === undefined ? null : String(value));
const num = (value: unknown) => (value === null || value === undefined ? null : Number(value));
const obj = (value: unknown): Record<string, unknown> => (value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {});
const nums = (value: unknown): Record<string, number> => Object.fromEntries(Object.entries(obj(value)).filter(([, v]) => typeof v === 'number').map(([k, v]) => [k, v as number]));
const list = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : []);
const isUniqueViolation = (error: DbError) => error?.code === '23505';

const profile = (row: Row): EngageProfile => ({
  userId: String(row.user_id), birthDate: str(row.birth_date), timeZone: String(row.time_zone ?? DEFAULT_TIME_ZONE), notifyHour: Number(row.notify_hour ?? DEFAULT_NOTIFY_HOUR),
  messages: (row.messages as EngageProfile['messages']) ?? 'all', locale: (row.locale as EngageProfile['locale']) ?? 'en', region: str(row.region), school: str(row.school),
  leaderboard: (row.leaderboard as EngageProfile['leaderboard']) ?? null, leagueOptOut: row.league_opt_out === true, dailyLimitMinutes: num(row.daily_limit_minutes),
  limitSetBy: (row.limit_set_by as EngageProfile['limitSetBy']) ?? null, offersMuted: row.offers_muted === true, levelBand: (row.level_band as EngageProfile['levelBand']) ?? 'open',
  lapseStage: Number(row.lapse_stage ?? 0), createdAt: str(row.created_at),
});
const defaults = (userId: string): EngageProfile => profile({ user_id: userId });
const PROFILE_COLUMNS: Record<keyof ProfilePatch, string> = {
  timeZone: 'time_zone', notifyHour: 'notify_hour', messages: 'messages', locale: 'locale', region: 'region', school: 'school', leaderboard: 'leaderboard',
  leagueOptOut: 'league_opt_out', dailyLimitMinutes: 'daily_limit_minutes', limitSetBy: 'limit_set_by', offersMuted: 'offers_muted', levelBand: 'level_band', lapseStage: 'lapse_stage',
};
const day = (row: Row): DayRow => ({ day: String(row.day), xp: Number(row.xp ?? 0), minutes: Number(row.minutes ?? 0), events: Number(row.events ?? 0) });
const event = (row: Row): EventRow => ({
  id: Number(row.id), userId: String(row.user_id), workspaceId: str(row.workspace_id), area: String(row.area), kind: row.kind as EventRow['kind'], verified: row.verified === true,
  feature: String(row.feature), skill: str(row.skill), verifiedMinutes: Number(row.verified_minutes ?? 0), score: num(row.score), outcome: str(row.outcome), ref: str(row.ref),
  source: (row.source as EventRow['source']) ?? 'web', createdAt: String(row.created_at),
});
const xpRow = (row: Row): XpRow => ({ id: Number(row.id), userId: String(row.user_id), eventId: num(row.event_id), source: row.source as XpRow['source'], sourceKey: str(row.source_key), xp: Number(row.xp), day: String(row.day), weekStart: String(row.week_start), feature: str(row.feature), createdAt: String(row.created_at) });
const freeze = (row: Row): FreezeBuy => ({ id: String(row.id), userId: String(row.user_id), day: String(row.day), weekStart: String(row.week_start), reference: String(row.reference), credits: Number(row.credits), status: row.status as FreezeBuy['status'], createdAt: String(row.created_at) });
const group = (row: Row): LeagueGroup => ({ id: String(row.id), weekStart: String(row.week_start), tier: row.tier as LeagueGroup['tier'], band: row.band as LeagueGroup['band'], finalizedAt: str(row.finalized_at) });
const member = (row: Row): LeagueMember => ({ groupId: String(row.group_id), userId: String(row.user_id), weekStart: String(row.week_start), tier: row.tier as LeagueMember['tier'], joinedAt: String(row.joined_at), xp: Number(row.xp ?? 0), finalRank: num(row.final_rank), outcome: (row.outcome as LeagueMember['outcome']) ?? null });
const journey = (row: Row): JourneyRow => ({
  id: String(row.id), userId: String(row.user_id), journeyKey: String(row.journey_key), status: row.status as JourneyRow['status'], startedOn: String(row.started_on), targetDate: str(row.target_date),
  completed: Array.isArray(row.completed) ? row.completed.map((entry) => ({ chapter: Number(obj(entry).chapter), at: String(obj(entry).at) })) : [], graduatedAt: str(row.graduated_at), createdAt: String(row.created_at), updatedAt: String(row.updated_at),
});
const goal = (row: Row): GoalRow => ({ id: String(row.id), userId: String(row.user_id), goalKey: String(row.goal_key), status: row.status as GoalRow['status'], doneBy: (row.done_by as GoalRow['doneBy']) ?? null, outcome: obj(row.outcome), createdAt: String(row.created_at), doneAt: str(row.done_at) });
const dateRow = (row: Row): DateRow => ({ id: String(row.id), userId: String(row.user_id), kind: row.kind as DateRow['kind'], title: String(row.title), onDate: String(row.on_date), atTime: str(row.at_time), goalKey: str(row.goal_key), done: row.done === true, result: str(row.result), createdAt: String(row.created_at) });
const squad = (row: Row): SquadRow => ({ id: String(row.id), name: String(row.name), ownerId: String(row.owner_id), inviteCode: String(row.invite_code), weeklyGoalMinutes: Number(row.weekly_goal_minutes), createdAt: String(row.created_at), archivedAt: str(row.archived_at) });
const squadMember = (row: Row): SquadMember => ({ squadId: String(row.squad_id), userId: String(row.user_id), role: row.role as SquadMember['role'], joinedAt: String(row.joined_at), leftAt: str(row.left_at), referralCode: str(row.referral_code) });
const story = (row: Row): StoryProgress => ({ userId: String(row.user_id), arcKey: String(row.arc_key), unlocked: Number(row.unlocked), lastUnlockedOn: str(row.last_unlocked_on), flags: Object.fromEntries(Object.entries(obj(row.flags)).map(([k, v]) => [k, String(v)])), updatedAt: String(row.updated_at) });
const storyResult = (row: Row): StoryResult => ({ id: String(row.id), userId: String(row.user_id), arcKey: String(row.arc_key), episodeKey: String(row.episode_key), correct: Number(row.correct), total: Number(row.total), passed: row.passed === true, choice: str(row.choice), createdAt: String(row.created_at) });
const episode = (row: Row): StoryEpisodeCache => ({ userId: String(row.user_id), arcKey: String(row.arc_key), episodeKey: String(row.episode_key), content: obj(row.content), credits: Number(row.credits ?? 0), createdAt: String(row.created_at) });
const passportRow = (row: Row | null, userId: string): PassportRow => ({ userId, displayName: str(row?.display_name), headline: str(row?.headline), updatedAt: str(row?.updated_at) });
const item = (row: Row): PassportItem => ({ id: String(row.id), userId: String(row.user_id), kind: row.kind as PassportItem['kind'], source: String(row.source), sourceRef: String(row.source_ref), title: String(row.title), data: obj(row.data), verifyUrl: str(row.verify_url), verified: row.verified === true, shown: row.shown === true, issuedAt: str(row.issued_at), createdAt: String(row.created_at) });
const link = (row: Row): PassportLink => ({ id: String(row.id), userId: String(row.user_id), tokenHash: String(row.token_hash), label: String(row.label), itemIds: list(row.item_ids), createdAt: String(row.created_at), expiresAt: str(row.expires_at), revokedAt: str(row.revoked_at), views: Number(row.views ?? 0), lastViewedAt: str(row.last_viewed_at) });
const sample = (row: Row): SampleRow => {
  const storage = obj(row.storage);
  return {
    id: String(row.id), userId: String(row.user_id), kind: row.kind as SampleRow['kind'], source: String(row.source), sourceRef: str(row.source_ref),
    storage: storage.path ? { provider: (storage.provider as 's3' | 'supabase' | 'memory') ?? 's3', bucket: String(storage.bucket ?? ''), path: String(storage.path) } : null,
    text: str(row.text), promptKey: str(row.prompt_key), feature: str(row.feature), scores: nums(row.scores), metrics: nums(row.metrics), durationMs: num(row.duration_ms), recordedAt: String(row.recorded_at), deletedAt: str(row.deleted_at),
  };
};
const sitting = (row: Row): SittingRow => ({
  id: String(row.id), userId: String(row.user_id), examKey: String(row.exam_key), status: row.status as SittingRow['status'], entitlementRef: String(row.entitlement_ref),
  startedAt: String(row.started_at), deadlineAt: String(row.deadline_at), submittedAt: str(row.submitted_at), answers: Object.fromEntries(Object.entries(obj(row.answers)).map(([k, v]) => [k, String(v)])),
  responses: obj(row.responses), autoScore: num(row.auto_score), autoTotal: num(row.auto_total), review: row.review ? obj(row.review) : null, integrity: nums(row.integrity),
  lastHeartbeatAt: str(row.last_heartbeat_at), reviewerId: str(row.reviewer_id), decidedAt: str(row.decided_at), certificateId: str(row.certificate_id),
});
const SITTING_COLUMNS: Partial<Record<keyof SittingRow, string>> = {
  status: 'status', submittedAt: 'submitted_at', answers: 'answers', responses: 'responses', autoScore: 'auto_score', autoTotal: 'auto_total', review: 'review',
  integrity: 'integrity', lastHeartbeatAt: 'last_heartbeat_at', reviewerId: 'reviewer_id', decidedAt: 'decided_at', certificateId: 'certificate_id',
};
const certificate = (row: Row): CertificateRow => ({ id: String(row.id), code: String(row.code), userId: String(row.user_id), examKey: String(row.exam_key), level: String(row.level), displayName: String(row.display_name), score: Number(row.score), issuedAt: String(row.issued_at), revokedAt: str(row.revoked_at), sittingId: str(row.sitting_id), test: row.test === true });
const talent = (row: Row): TalentProfile => ({ userId: String(row.user_id), candidateKey: str(row.candidate_key), consentVersion: str(row.consent_version), consentedAt: str(row.consented_at), withdrawnAt: str(row.withdrawn_at), headline: str(row.headline), skills: list(row.skills), openTo: list(row.open_to), regions: list(row.regions), passportLinkId: str(row.passport_link_id), updatedAt: str(row.updated_at) });
const employer = (row: Row): TalentEmployer => ({ userId: String(row.user_id), organisation: String(row.organisation), kind: row.kind as TalentEmployer['kind'], grantedBy: String(row.granted_by ?? ''), activeUntil: str(row.active_until), createdAt: String(row.created_at) });
const audit = (row: Row): TalentAudit => ({ employerId: String(row.employer_id ?? ''), action: row.action as TalentAudit['action'], query: obj(row.query), targetUserId: str(row.target_user_id), createdAt: String(row.created_at) });
const sponsor = (row: Row): EventSponsor => ({ eventKey: String(row.event_key), sponsorName: String(row.sponsor_name), logoUrl: str(row.logo_url), prize: Object.fromEntries(Object.entries(obj(row.prize)).map(([k, v]) => [k, String(v)])), updatedBy: String(row.updated_by ?? ''), updatedAt: String(row.updated_at) });
const outbox = (row: Row): OutboxRow => {
  const payload = obj(row.payload);
  return {
    id: String(row.id), userId: String(row.user_id), channel: row.channel as OutboxRow['channel'], kind: String(row.kind), priority: Number(row.priority ?? 0), dedupeKey: String(row.dedupe_key),
    payload: { text: String(payload.text ?? ''), buttons: Array.isArray(payload.buttons) ? payload.buttons.map((button) => ({ label: String(obj(button).label ?? ''), path: String(obj(button).path ?? '/') })) : [], data: obj(payload.data) },
    dueAt: String(row.due_at), expiresAt: String(row.expires_at), status: row.status as OutboxRow['status'], claimToken: str(row.claim_token), attempts: Number(row.attempts ?? 0), reason: str(row.reason), createdAt: String(row.created_at), sentAt: str(row.sent_at),
  };
};
const EVENT_COLUMNS = 'id,user_id,workspace_id,area,kind,verified,feature,skill,verified_minutes,score,outcome,ref,source,created_at';

export function createEngagePostgres(db: EngageDatabase): EngageRepository {
  const rpc = async (name: string, args: Record<string, unknown>) => check(await db.rpc(name, args));
  const events = async (build: (query: Query) => Query, limit: number) => {
    const rows = check<Row[]>(await build(db.from('ai_learning_events').select(EVENT_COLUMNS)).order('id', { ascending: false }).limit(limit)) ?? [];
    return rows.map(event).reverse();
  };
  return {
    // --- Profile ------------------------------------------------------------------------
    async profile(userId) {
      const row = check<Row | null>(await db.from('ai_engage_profiles').select('*').eq('user_id', userId).maybeSingle());
      return row ? profile(row) : defaults(userId);
    },
    async profiles(userIds) {
      const out = new Map(userIds.map((id) => [id, defaults(id)]));
      if (!userIds.length) return out;
      for (const row of check<Row[]>(await db.from('ai_engage_profiles').select('*').in('user_id', [...new Set(userIds)])) ?? []) out.set(String(row.user_id), profile(row));
      return out;
    },
    async names(userIds) {
      const out = new Map<string, string | null>(userIds.map((id) => [id, null]));
      if (!userIds.length) return out;
      for (const row of check<Row[]>(await db.from('users').select('id,full_name').in('id', [...new Set(userIds)])) ?? []) {
        const name = str(row.full_name)?.trim() ?? null;
        out.set(String(row.id), name && !name.includes('@') ? name : null);
      }
      return out;
    },
    async saveProfile(userId, patch) {
      const values: Row = { user_id: userId };
      for (const [key, column] of Object.entries(PROFILE_COLUMNS)) if (key in patch) values[column] = (patch as Record<string, unknown>)[key];
      return profile(check<Row>(await db.from('ai_engage_profiles').upsert(values, { onConflict: 'user_id' }).select('*').single()));
    },
    async setBirthDate(userId, date) {
      check(await db.from('ai_engage_profiles').upsert({ user_id: userId }, { onConflict: 'user_id', ignoreDuplicates: true }));
      const rows = check<Row[]>(await db.from('ai_engage_profiles').update({ birth_date: date }).eq('user_id', userId).is('birth_date', null).select('user_id')) ?? [];
      return rows.length > 0;
    },
    async clearBirthDate(userId) { check(await db.from('ai_engage_profiles').update({ birth_date: null }).eq('user_id', userId)); },
    async settings() {
      const row = check<Row | null>(await db.from('ai_engage_settings').select('*').eq('id', 1).maybeSingle());
      return { talentPoolEnabled: row?.talent_pool_enabled === true, updatedBy: str(row?.updated_by), updatedAt: str(row?.updated_at) };
    },
    async saveSettings(patch, actor) {
      const row = check<Row>(await db.from('ai_engage_settings').upsert({ id: 1, ...(patch.talentPoolEnabled === undefined ? {} : { talent_pool_enabled: patch.talentPoolEnabled }), updated_by: actor, updated_at: new Date().toISOString() }, { onConflict: 'id' }).select('*').single());
      return { talentPoolEnabled: row.talent_pool_enabled === true, updatedBy: str(row.updated_by), updatedAt: str(row.updated_at) };
    },

    // --- XP -------------------------------------------------------------------------------------
    async ingest(userId, now) {
      const result = obj(await rpc('ai_engage_ingest', { p_user: userId, p_now: now.toISOString() }));
      return { events: Number(result.events ?? 0), awarded: Number(result.awarded ?? 0), capped: Number(result.capped ?? 0) };
    },
    async ingestMany(userIds, now) {
      if (userIds.length) await rpc('ai_engage_ingest_many', { p_users: [...new Set(userIds)].slice(0, 100), p_now: now.toISOString() });
    },
    async awardBonus(userId, input) {
      return (await rpc('ai_engage_award_bonus', { p_user: userId, p_source: input.source, p_key: input.key, p_xp: input.xp, p_day: input.day, p_week: input.weekStart })) === true;
    },
    async days(userId, from, to) { return (check<Row[]>(await db.from('ai_engage_days').select('day,xp,minutes,events').eq('user_id', userId).gte('day', from).lte('day', to).order('day')) ?? []).map(day); },
    async allDays(userId) { return (check<Row[]>(await db.from('ai_engage_days').select('day,xp,minutes,events').eq('user_id', userId).order('day').limit(5000)) ?? []).map(day); },
    async totalXp(userId) {
      const rows = check<Row[]>(await db.from('ai_engage_days').select('xp').eq('user_id', userId).limit(5000)) ?? [];
      return rows.reduce((sum, row) => sum + Number(row.xp ?? 0), 0);
    },
    async xpSince(userId, since) { return (check<Row[]>(await db.from('ai_engage_xp').select('*').eq('user_id', userId).gte('day', since).limit(5000)) ?? []).map(xpRow); },
    events: (userId, since, until, limit = 2000) => events((query) => query.eq('user_id', userId).gte('created_at', since.toISOString()).lte('created_at', until.toISOString()), limit),
    eventsByRef: (prefix, since, until, limit = 5000) => events((query) => query.eq('verified', true).like('ref', `${prefix.replace(/[%_\\]/g, '\\$&')}%`).gte('created_at', since.toISOString()).lte('created_at', until.toISOString()), limit),
    eventsOf: (userIds, since, until, limit = 5000) => userIds.length ? events((query) => query.in('user_id', [...new Set(userIds)]).eq('verified', true).gte('created_at', since.toISOString()).lte('created_at', until.toISOString()), limit) : Promise.resolve([]),
    async dayTotals(userIds, from, to) {
      if (!userIds.length) return [];
      return (check<Row[]>(await db.from('ai_engage_days').select('user_id,day,xp,minutes,events').in('user_id', [...new Set(userIds)]).gte('day', from).lte('day', to).limit(10000)) ?? []).map((row) => ({ userId: String(row.user_id), ...day(row) }));
    },

    // --- Freezes --------------------------------------------------------------------------------------
    async freezeBuys(userId) { return (check<Row[]>(await db.from('ai_engage_freeze_buys').select('*').eq('user_id', userId).eq('status', 'paid')) ?? []).map(freeze); },
    async reserveFreeze(userId, input) {
      const row = obj(await rpc('ai_engage_freeze_reserve', { p_user: userId, p_day: input.day, p_week: input.weekStart, p_reference: input.reference, p_credits: input.credits }));
      return row.id ? freeze(row) : null;
    },
    async confirmFreeze(id) { check(await db.from('ai_engage_freeze_buys').update({ status: 'paid' }).eq('id', id).eq('status', 'pending')); },
    async cancelFreeze(id) { check(await db.from('ai_engage_freeze_buys').delete().eq('id', id).eq('status', 'pending')); },

    // --- Leagues ----------------------------------------------------------------------------------------
    async leagueMember(userId, week) {
      const row = check<Row | null>(await db.from('ai_engage_league_members').select('*, group:ai_engage_league_groups(*)').eq('user_id', userId).eq('week_start', week).maybeSingle());
      return row ? { ...member(row), group: group(obj(row.group)) } : null;
    },
    async previousMembership(userId, beforeWeek) {
      const row = check<Row | null>(await db.from('ai_engage_league_members').select('*').eq('user_id', userId).lt('week_start', beforeWeek).order('week_start', { ascending: false }).limit(1).maybeSingle());
      return row ? member(row) : null;
    },
    async leagueJoin(userId, week, tier, band) {
      await rpc('ai_engage_league_join', { p_user: userId, p_week: week, p_tier: tier, p_band: band });
      const joined = await this.leagueMember(userId, week);
      if (!joined) throw new Error('league join did not create a membership');
      return joined;
    },
    async groupMembers(groupId) { return (check<Row[]>(await db.from('ai_engage_league_members').select('*').eq('group_id', groupId)) ?? []).map(member); },
    async settleGroup(groupId, standings) {
      return (await rpc('ai_engage_league_settle', { p_group: groupId, p_standings: standings.map((row) => ({ user_id: row.userId, rank: row.rank, outcome: row.outcome })) })) === true;
    },

    // --- Journeys, path, dates ------------------------------------------------------------------------------
    async journeys(userId) { return (check<Row[]>(await db.from('ai_engage_journeys').select('*').eq('user_id', userId).order('created_at')) ?? []).map(journey); },
    async startJourney(userId, input) {
      const inserted = await db.from('ai_engage_journeys').insert({ user_id: userId, journey_key: input.journeyKey, started_on: input.startedOn, target_date: input.targetDate }).select('*').single();
      if (!inserted.error) return journey(inserted.data);
      if (!isUniqueViolation(inserted.error)) check(inserted);
      return journey(check<Row>(await db.from('ai_engage_journeys').select('*').eq('user_id', userId).eq('journey_key', input.journeyKey).in('status', ['active', 'paused']).single()));
    },
    async updateJourney(id, patch, expectCompleted) {
      if (expectCompleted !== undefined) {
        // Chapter closes go through the function: only while the stored count is the expected one.
        const row = obj(await rpc('ai_engage_journey_advance', { p_id: id, p_expect: expectCompleted, p_completed: patch.completed ?? [], p_status: patch.status ?? null, p_graduated_at: patch.graduatedAt ?? null }));
        return row.id ? journey(row) : null;
      }
      const values: Row = {};
      if (patch.status !== undefined) values.status = patch.status;
      if (patch.completed !== undefined) values.completed = patch.completed;
      if (patch.graduatedAt !== undefined) values.graduated_at = patch.graduatedAt;
      if (patch.targetDate !== undefined) values.target_date = patch.targetDate;
      const rows = check<Row[]>(await db.from('ai_engage_journeys').update(values).eq('id', id).select('*')) ?? [];
      return rows[0] ? journey(rows[0]) : null;
    },
    async goals(userId) { return (check<Row[]>(await db.from('ai_engage_goals').select('*').eq('user_id', userId)) ?? []).map(goal); },
    async ensureGoal(userId, goalKey, status) {
      check(await db.from('ai_engage_goals').upsert({ user_id: userId, goal_key: goalKey, status }, { onConflict: 'user_id,goal_key', ignoreDuplicates: true }));
      return goal(check<Row>(await db.from('ai_engage_goals').select('*').eq('user_id', userId).eq('goal_key', goalKey).single()));
    },
    async updateGoal(userId, goalKey, patch, from) {
      const values: Row = {};
      if (patch.status !== undefined) values.status = patch.status;
      if (patch.doneBy !== undefined) values.done_by = patch.doneBy;
      if (patch.outcome !== undefined) values.outcome = patch.outcome;
      if (patch.doneAt !== undefined) values.done_at = patch.doneAt;
      let query = db.from('ai_engage_goals').update(values).eq('user_id', userId).eq('goal_key', goalKey);
      if (from) query = query.in('status', from);
      const rows = check<Row[]>(await query.select('*')) ?? [];
      return rows[0] ? goal(rows[0]) : null;
    },
    async dates(userId) { return (check<Row[]>(await db.from('ai_engage_dates').select('*').eq('user_id', userId).order('on_date').limit(200)) ?? []).map(dateRow); },
    async addDate(input) { return dateRow(check<Row>(await db.from('ai_engage_dates').insert({ user_id: input.userId, kind: input.kind, title: input.title, on_date: input.onDate, at_time: input.atTime, goal_key: input.goalKey }).select('*').single())); },
    async updateDate(userId, id, patch) {
      const values: Row = {};
      if (patch.done !== undefined) values.done = patch.done;
      if (patch.result !== undefined) values.result = patch.result;
      if (patch.title !== undefined) values.title = patch.title;
      if (patch.onDate !== undefined) values.on_date = patch.onDate;
      if (patch.atTime !== undefined) values.at_time = patch.atTime;
      const rows = check<Row[]>(await db.from('ai_engage_dates').update(values).eq('id', id).eq('user_id', userId).select('*')) ?? [];
      return rows[0] ? dateRow(rows[0]) : null;
    },
    async deleteDate(userId, id) { return (check<Row[]>(await db.from('ai_engage_dates').delete().eq('id', id).eq('user_id', userId).select('id')) ?? []).length > 0; },

    // --- Squads ---------------------------------------------------------------------------------------------------
    async squadOf(userId) {
      const row = check<Row | null>(await db.from('ai_engage_squad_members').select('squad:ai_engage_squads(*)').eq('user_id', userId).is('left_at', null).maybeSingle());
      const value = row ? obj(row.squad) : null;
      return value && value.id && !value.archived_at ? squad(value) : null;
    },
    async squad(id) { const row = check<Row | null>(await db.from('ai_engage_squads').select('*').eq('id', id).maybeSingle()); return row ? squad(row) : null; },
    async squadByCode(code) { const row = check<Row | null>(await db.from('ai_engage_squads').select('*').eq('invite_code', code).maybeSingle()); return row ? squad(row) : null; },
    async createSquad(input) {
      const id = await rpc('ai_engage_squad_create', { p_name: input.name, p_owner: input.ownerId, p_code: input.inviteCode, p_goal: input.weeklyGoalMinutes, p_referral: input.referralCode });
      if (!id) return { error: 'already_in_squad' as const };
      return (await this.squad(String(id)))!;
    },
    async joinSquad(squadId, userId, max, referralCode) {
      const result = String(await rpc('ai_engage_squad_join', { p_squad: squadId, p_user: userId, p_max: max, p_referral: referralCode }));
      return result === 'ok' ? { ok: true as const } : { ok: false as const, reason: (result === 'full' || result === 'already_in_squad' ? result : 'archived') as 'full' | 'already_in_squad' | 'archived' };
    },
    async leaveSquad(squadId, userId) { await rpc('ai_engage_squad_leave', { p_squad: squadId, p_user: userId }); },
    async squadMembers(squadId) { return (check<Row[]>(await db.from('ai_engage_squad_members').select('*').eq('squad_id', squadId).is('left_at', null).order('joined_at')) ?? []).map(squadMember); },
    async updateSquad(id, patch) {
      const values: Row = {};
      if (patch.weeklyGoalMinutes !== undefined) values.weekly_goal_minutes = patch.weeklyGoalMinutes;
      if (patch.name !== undefined) values.name = patch.name;
      const rows = check<Row[]>(await db.from('ai_engage_squads').update(values).eq('id', id).select('*')) ?? [];
      return rows[0] ? squad(rows[0]) : null;
    },

    // --- Stories ---------------------------------------------------------------------------------------------------
    async storyProgress(userId) { return (check<Row[]>(await db.from('ai_engage_story_progress').select('*').eq('user_id', userId)) ?? []).map(story); },
    async saveStoryProgress(row) {
      check(await db.from('ai_engage_story_progress').upsert({ user_id: row.userId, arc_key: row.arcKey, unlocked: row.unlocked, last_unlocked_on: row.lastUnlockedOn, flags: row.flags }, { onConflict: 'user_id,arc_key' }));
    },
    async storyResults(userId, arcKey) {
      let query = db.from('ai_engage_story_results').select('*').eq('user_id', userId);
      if (arcKey) query = query.eq('arc_key', arcKey);
      return (check<Row[]>(await query.order('created_at').limit(2000)) ?? []).map(storyResult);
    },
    async addStoryResult(input) {
      const inserted = await db.from('ai_engage_story_results').insert({ user_id: input.userId, arc_key: input.arcKey, episode_key: input.episodeKey, correct: input.correct, total: input.total, passed: input.passed, choice: input.choice }).select('*').single();
      if (!inserted.error) return { row: storyResult(inserted.data), firstPass: input.passed };
      // A second pass of the same episode hits the first-pass index: it is not a new verified event.
      if (isUniqueViolation(inserted.error)) return { row: { ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString() }, firstPass: false };
      check(inserted);
      throw new Error('unreachable');
    },
    async storyEpisode(userId, arcKey, episodeKey) {
      const row = check<Row | null>(await db.from('ai_engage_story_episodes').select('*').eq('user_id', userId).eq('arc_key', arcKey).eq('episode_key', episodeKey).maybeSingle());
      return row ? episode(row) : null;
    },
    async saveStoryEpisode(row) {
      check(await db.from('ai_engage_story_episodes').upsert({ user_id: row.userId, arc_key: row.arcKey, episode_key: row.episodeKey, content: row.content, credits: row.credits }, { onConflict: 'user_id,arc_key,episode_key', ignoreDuplicates: true }));
      return (await this.storyEpisode(row.userId, row.arcKey, row.episodeKey))!;
    },

    // --- Passport ------------------------------------------------------------------------------------------------------
    async passport(userId) { return passportRow(check<Row | null>(await db.from('ai_engage_passports').select('*').eq('user_id', userId).maybeSingle()), userId); },
    async savePassport(userId, patch) {
      const values: Row = { user_id: userId, updated_at: new Date().toISOString() };
      if (patch.displayName !== undefined) values.display_name = patch.displayName;
      if (patch.headline !== undefined) values.headline = patch.headline;
      return passportRow(check<Row>(await db.from('ai_engage_passports').upsert(values, { onConflict: 'user_id' }).select('*').single()), userId);
    },
    async passportItems(userId) { return (check<Row[]>(await db.from('ai_engage_passport_items').select('*').eq('user_id', userId).limit(1000)) ?? []).map(item); },
    async upsertPassportItem(input) {
      const values: Row = { user_id: input.userId, kind: input.kind, source: input.source, source_ref: input.sourceRef, title: input.title, data: input.data, verify_url: input.verifyUrl, verified: input.verified, issued_at: input.issuedAt };
      // The person's show/hide choice is never overwritten by a refresh.
      return item(check<Row>(await db.from('ai_engage_passport_items').upsert(values, { onConflict: 'user_id,source,source_ref' }).select('*').single()));
    },
    async setItemShown(userId, id, shown) {
      const rows = check<Row[]>(await db.from('ai_engage_passport_items').update({ shown }).eq('id', id).eq('user_id', userId).select('*')) ?? [];
      return rows[0] ? item(rows[0]) : null;
    },
    async passportLinks(userId) { return (check<Row[]>(await db.from('ai_engage_passport_links').select('*').eq('user_id', userId).limit(200)) ?? []).map(link); },
    async createPassportLink(input) {
      return link(check<Row>(await db.from('ai_engage_passport_links').insert({ user_id: input.userId, token_hash: input.tokenHash, label: input.label, item_ids: input.itemIds, expires_at: input.expiresAt }).select('*').single()));
    },
    async revokePassportLink(userId, id, at) { return (check<Row[]>(await db.from('ai_engage_passport_links').update({ revoked_at: at }).eq('id', id).eq('user_id', userId).is('revoked_at', null).select('id')) ?? []).length > 0; },
    async passportLinkByHash(hash) { const row = check<Row | null>(await db.from('ai_engage_passport_links').select('*').eq('token_hash', hash).maybeSingle()); return row ? link(row) : null; },
    async touchPassportLink(id, at) {
      const row = check<Row | null>(await db.from('ai_engage_passport_links').select('views').eq('id', id).maybeSingle());
      if (row) check(await db.from('ai_engage_passport_links').update({ views: Number(row.views ?? 0) + 1, last_viewed_at: at }).eq('id', id));
    },

    // --- Samples ----------------------------------------------------------------------------------------------------------
    async samples(userId) { return (check<Row[]>(await db.from('ai_engage_samples').select('*').eq('user_id', userId).is('deleted_at', null).order('recorded_at').limit(500)) ?? []).map(sample); },
    async sample(id) { const row = check<Row | null>(await db.from('ai_engage_samples').select('*').eq('id', id).maybeSingle()); return row ? sample(row) : null; },
    async addSample(input) {
      const values = { user_id: input.userId, kind: input.kind, source: input.source, source_ref: input.sourceRef, storage: input.storage, text: input.text, prompt_key: input.promptKey, feature: input.feature, scores: input.scores, metrics: input.metrics, duration_ms: input.durationMs, recorded_at: input.recordedAt };
      const inserted = await db.from('ai_engage_samples').insert(values).select('*').single();
      if (!inserted.error) return sample(inserted.data);
      if (!isUniqueViolation(inserted.error) || !input.sourceRef) check(inserted);
      return sample(check<Row>(await db.from('ai_engage_samples').select('*').eq('user_id', input.userId).eq('source', input.source).eq('source_ref', input.sourceRef).single()));
    },
    async deleteSample(userId, id, at) {
      const rows = check<Row[]>(await db.from('ai_engage_samples').update({ deleted_at: at }).eq('id', id).eq('user_id', userId).is('deleted_at', null).select('*')) ?? [];
      return rows[0] ? sample(rows[0]) : null;
    },

    // --- Certificates ---------------------------------------------------------------------------------------------------------
    async sittings(userId) { return (check<Row[]>(await db.from('ai_engage_sittings').select('*').eq('user_id', userId).order('started_at', { ascending: false }).limit(100)) ?? []).map(sitting); },
    async sitting(id) { const row = check<Row | null>(await db.from('ai_engage_sittings').select('*').eq('id', id).maybeSingle()); return row ? sitting(row) : null; },
    async createSitting(input) {
      const inserted = await db.from('ai_engage_sittings').insert({ user_id: input.userId, exam_key: input.examKey, entitlement_ref: input.entitlementRef, started_at: input.startedAt, deadline_at: input.deadlineAt }).select('*').single();
      if (!inserted.error) return { row: sitting(inserted.data), created: true };
      if (!isUniqueViolation(inserted.error)) check(inserted);
      return { row: sitting(check<Row>(await db.from('ai_engage_sittings').select('*').eq('entitlement_ref', input.entitlementRef).single())), created: false };
    },
    async usedEntitlements(userId) { return (check<Row[]>(await db.from('ai_engage_sittings').select('entitlement_ref').eq('user_id', userId)) ?? []).map((row) => String(row.entitlement_ref)); },
    async updateSitting(id, patch, from) {
      const values: Row = {};
      for (const [key, column] of Object.entries(SITTING_COLUMNS)) if (key in patch) values[column] = (patch as Record<string, unknown>)[key];
      const rows = check<Row[]>(await db.from('ai_engage_sittings').update(values).eq('id', id).in('status', from).select('*')) ?? [];
      return rows[0] ? sitting(rows[0]) : null;
    },
    async addSignals(rows) {
      if (!rows.length) return 0;
      const inserted = check<Row[]>(await db.from('ai_engage_sitting_signals').upsert(rows.map((row) => ({ sitting_id: row.sittingId, stream: row.stream, seq: row.seq, kind: row.kind, at: row.at })), { onConflict: 'sitting_id,stream,seq', ignoreDuplicates: true }).select('seq')) ?? [];
      return inserted.length;
    },
    async signals(sittingId) { return (check<Row[]>(await db.from('ai_engage_sitting_signals').select('*').eq('sitting_id', sittingId).order('at').limit(5000)) ?? []).map((row) => ({ sittingId: String(row.sitting_id), stream: String(row.stream), seq: Number(row.seq), kind: String(row.kind), at: String(row.at) })); },
    async reviewQueue(limit) { return (check<Row[]>(await db.from('ai_engage_sittings').select('*').eq('status', 'submitted').order('submitted_at').limit(limit)) ?? []).map(sitting); },
    async issueCertificate(input) {
      const inserted = await db.from('ai_engage_certificates').insert({ code: input.code, user_id: input.userId, exam_key: input.examKey, level: input.level, display_name: input.displayName, score: input.score, issued_at: input.issuedAt, sitting_id: input.sittingId, test: input.test }).select('*').single();
      if (!inserted.error) return certificate(inserted.data);
      if (!isUniqueViolation(inserted.error) || !input.sittingId) check(inserted);
      return certificate(check<Row>(await db.from('ai_engage_certificates').select('*').eq('sitting_id', input.sittingId).single()));
    },
    async certificateByCode(code) { const row = check<Row | null>(await db.from('ai_engage_certificates').select('*').eq('code', code).maybeSingle()); return row ? certificate(row) : null; },
    async certificates(userId) { return (check<Row[]>(await db.from('ai_engage_certificates').select('*').eq('user_id', userId).order('issued_at', { ascending: false })) ?? []).map(certificate); },
    async revokeCertificate(id, at) { return (check<Row[]>(await db.from('ai_engage_certificates').update({ revoked_at: at }).eq('id', id).is('revoked_at', null).select('id')) ?? []).length > 0; },

    // --- Talent pool ------------------------------------------------------------------------------------------------------------
    async talentProfile(userId) { const row = check<Row | null>(await db.from('ai_engage_talent').select('*').eq('user_id', userId).maybeSingle()); return row ? talent(row) : null; },
    async talentByKey(key) { const row = check<Row | null>(await db.from('ai_engage_talent').select('*').eq('candidate_key', key).maybeSingle()); return row ? talent(row) : null; },
    async saveTalentProfile(userId, patch) {
      const values: Row = { user_id: userId, updated_at: new Date().toISOString() };
      const columns: Record<string, string> = { candidateKey: 'candidate_key', consentVersion: 'consent_version', consentedAt: 'consented_at', withdrawnAt: 'withdrawn_at', headline: 'headline', skills: 'skills', openTo: 'open_to', regions: 'regions', passportLinkId: 'passport_link_id' };
      for (const [key, column] of Object.entries(columns)) if (key in patch) values[column] = (patch as Record<string, unknown>)[key];
      return talent(check<Row>(await db.from('ai_engage_talent').upsert(values, { onConflict: 'user_id' }).select('*').single()));
    },
    async talentSeenBy(userId, limit) { return (check<Row[]>(await db.from('ai_engage_talent_audit').select('*').eq('target_user_id', userId).order('created_at', { ascending: false }).limit(limit)) ?? []).map(audit); },
    async talentEmployer(userId) { const row = check<Row | null>(await db.from('ai_engage_talent_employers').select('*').eq('user_id', userId).maybeSingle()); return row ? employer(row) : null; },
    async saveTalentEmployer(row) {
      return employer(check<Row>(await db.from('ai_engage_talent_employers').upsert({ user_id: row.userId, organisation: row.organisation, kind: row.kind, granted_by: row.grantedBy, active_until: row.activeUntil }, { onConflict: 'user_id' }).select('*').single()));
    },
    async searchTalent(filter) {
      let query = db.from('ai_engage_talent').select('*').not('consented_at', 'is', null).is('withdrawn_at', null);
      if (filter.skill) query = query.contains('skills', [filter.skill]);
      if (filter.region) query = query.contains('regions', [filter.region]);
      if (filter.openTo) query = query.contains('open_to', [filter.openTo]);
      return (check<Row[]>(await query.order('consented_at', { ascending: false }).limit(filter.limit)) ?? []).map(talent);
    },
    async addTalentAudit(row) { check(await db.from('ai_engage_talent_audit').insert({ employer_id: row.employerId, action: row.action, query: row.query, target_user_id: row.targetUserId })); },
    async talentAudit(employerId, limit) { return (check<Row[]>(await db.from('ai_engage_talent_audit').select('*').eq('employer_id', employerId).order('created_at', { ascending: false }).limit(limit)) ?? []).map(audit); },

    // --- Events ---------------------------------------------------------------------------------------------------------------------
    async sponsors(keys) { return keys.length ? (check<Row[]>(await db.from('ai_engage_sponsors').select('*').in('event_key', keys)) ?? []).map(sponsor) : []; },
    async saveSponsor(row) {
      return sponsor(check<Row>(await db.from('ai_engage_sponsors').upsert({ event_key: row.eventKey, sponsor_name: row.sponsorName, logo_url: row.logoUrl, prize: row.prize, updated_by: row.updatedBy, updated_at: new Date().toISOString() }, { onConflict: 'event_key' }).select('*').single()));
    },
    async eventEntries(eventKey) { return (check<Row[]>(await db.from('ai_engage_event_entries').select('user_id,joined_at').eq('event_key', eventKey).limit(20000)) ?? []).map((row) => ({ userId: String(row.user_id), joinedAt: String(row.joined_at) })); },
    async joinEvent(eventKey, userId) {
      const rows = check<Row[]>(await db.from('ai_engage_event_entries').upsert({ event_key: eventKey, user_id: userId }, { onConflict: 'event_key,user_id', ignoreDuplicates: true }).select('user_id')) ?? [];
      return rows.length > 0;
    },
    async joinedEvents(userId) { return (check<Row[]>(await db.from('ai_engage_event_entries').select('event_key').eq('user_id', userId).limit(200)) ?? []).map((row) => String(row.event_key)); },

    // --- Boards ---------------------------------------------------------------------------------------------------------------------
    async board(scope, value, week, limit) {
      const rows = (await rpc('ai_engage_board', { p_scope: scope, p_value: value, p_week: week, p_limit: limit })) as Row[] | null;
      return (rows ?? []).map((row) => ({ userId: String(row.user_id), xp: Number(row.xp) }));
    },
    async centreBoard(week, minActive, limit) {
      const rows = (await rpc('ai_engage_centre_board', { p_week: week, p_min: minActive, p_limit: limit })) as Row[] | null;
      return (rows ?? []).map((row) => ({ workspaceId: String(row.workspace_id), name: String(row.name), active: Number(row.active), xp: Number(row.xp) }));
    },
    async centreLeague(workspaceId) { return !!check<Row | null>(await db.from('ai_engage_centre_league').select('workspace_id').eq('workspace_id', workspaceId).maybeSingle()); },
    async setCentreLeague(workspaceId, optIn, actor) {
      if (optIn) check(await db.from('ai_engage_centre_league').upsert({ workspace_id: workspaceId, opted_by: actor }, { onConflict: 'workspace_id' }));
      else check(await db.from('ai_engage_centre_league').delete().eq('workspace_id', workspaceId));
    },

    // --- Outbox -----------------------------------------------------------------------------------------------------------------------
    async enqueue(rows) {
      if (!rows.length) return 0;
      const inserted = check<Row[]>(await db.from('ai_engage_outbox').upsert(rows.map((row) => ({ user_id: row.userId, channel: row.channel, kind: row.kind, priority: row.priority, dedupe_key: row.dedupeKey, payload: row.payload, due_at: row.dueAt, expires_at: row.expiresAt })), { onConflict: 'dedupe_key', ignoreDuplicates: true }).select('id')) ?? [];
      return inserted.length;
    },
    async claim(userId, channel, now, limit) {
      const rows = (await rpc('ai_engage_outbox_claim', { p_user: userId, p_channel: channel, p_now: now.toISOString(), p_limit: limit })) as Row[] | null;
      return (rows ?? []).map(outbox).sort((a, b) => b.priority - a.priority || a.dueAt.localeCompare(b.dueAt));
    },
    async release(id, token, dueAt, reason) { check(await db.from('ai_engage_outbox').update({ status: 'queued', claim_token: null, due_at: dueAt, reason }).eq('id', id).eq('status', 'claimed').eq('claim_token', token)); },
    async finish(id, token, status, at, reason = null) {
      const rows = check<Row[]>(await db.from('ai_engage_outbox').update({ status, claim_token: null, sent_at: status === 'sent' ? at : null, reason }).eq('id', id).eq('status', 'claimed').eq('claim_token', token).select('id')) ?? [];
      return rows.length > 0;
    },
    async outbox(userId, options) {
      let query = db.from('ai_engage_outbox').select('*').eq('user_id', userId);
      if (options.channel) query = query.eq('channel', options.channel);
      if (options.statuses) query = query.in('status', options.statuses);
      if (options.since) query = query.gte('created_at', options.since);
      return (check<Row[]>(await query.order('created_at', { ascending: false }).limit(options.limit)) ?? []).map(outbox);
    },
    async dueUsers(now, limit) {
      const rows = (await rpc('ai_engage_due_users', { p_now: now.toISOString(), p_limit: limit })) as Row[] | null;
      return (rows ?? []).map((row) => ({ userId: String(row.user_id), chatId: String(row.chat_id) }));
    },
    async offerDismissals(userId) { return (check<Row[]>(await db.from('ai_engage_offer_dismissals').select('offer_key').eq('user_id', userId)) ?? []).map((row) => String(row.offer_key)); },
    async dismissOffer(userId, key, at) { check(await db.from('ai_engage_offer_dismissals').upsert({ user_id: userId, offer_key: key, dismissed_at: at }, { onConflict: 'user_id,offer_key', ignoreDuplicates: true })); },
  };
}
