import type { MasteryState } from '../../../../packages/coach-packs/src/mod.ts';
import type { CardState, Certificate, Claimed, CoachStore, Enrollment, SavedScript, Schedule, ScoreRow, Session, Team, TeamMember, Turn } from './store.ts';

// The coach tables through the service role (supabase-js query builder). The
// schood-ai function has already authorised every call; atomic steps (claiming due
// reminders, joining a team within its seats) are SQL functions of the migration.

type DbError = { code?: string; message: string } | null;
// deno-lint-ignore no-explicit-any
type Query = any;
export interface CoachDatabase {
  from(table: string): Query;
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: DbError }>;
}
type Row = Record<string, unknown>;

// deno-lint-ignore no-explicit-any
function check(result: { data: unknown; error: DbError }): any {
  if (result.error) throw new Error(`${result.error.code ?? 'db'}: ${result.error.message}`);
  return result.data;
}
const str = (value: unknown) => (value === null || value === undefined ? null : String(value));
const num = (value: unknown) => (value === null || value === undefined ? null : Number(value));
const obj = (value: unknown): Record<string, unknown> => (value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {});
const time = (value: unknown) => String(value ?? '').slice(0, 5);

const enrollment = (row: Row): Enrollment => ({
  id: String(row.id), userId: String(row.user_id), workspaceId: String(row.workspace_id), pack: String(row.pack), packVersion: String(row.pack_version),
  status: row.status as Enrollment['status'], locale: row.locale as Enrollment['locale'], settings: obj(row.settings), goal: row.goal ? obj(row.goal) as unknown as Enrollment['goal'] : null,
  placement: row.placement ? obj(row.placement) as unknown as Enrollment['placement'] : null, state: obj(row.state), revision: Number(row.revision ?? 0),
  streakCurrent: Number(row.streak_current ?? 0), streakBest: Number(row.streak_best ?? 0), lastActiveDay: str(row.last_active_day), verifiedMinutes: Number(row.verified_minutes ?? 0),
  createdAt: String(row.created_at),
});
const session = (row: Row): Session => ({
  id: String(row.id), enrollmentId: String(row.enrollment_id), userId: String(row.user_id), pack: String(row.pack), packVersion: String(row.pack_version), kind: row.kind as Session['kind'],
  activityId: str(row.activity_id), mode: str(row.mode), status: row.status as Session['status'], rubric: str(row.rubric), overall: num(row.overall), summary: obj(row.summary),
  minutes: Number(row.minutes ?? 0), source: row.source === 'web' ? 'web' : 'telegram', startedAt: String(row.started_at), finishedAt: str(row.finished_at),
});
const turn = (row: Row): Turn => ({
  id: String(row.id), sessionId: String(row.session_id), userId: String(row.user_id), pack: String(row.pack), seq: Number(row.seq), role: row.role as Turn['role'], kind: String(row.kind),
  promptRef: str(row.prompt_ref), content: String(row.content ?? ''), inputMode: (row.input_mode ?? null) as Turn['inputMode'], clip: row.clip ? obj(row.clip) as unknown as Turn['clip'] : null,
  metrics: obj(row.metrics), timing: obj(row.timing), keep: row.keep === true, createdAt: String(row.created_at),
});
const schedule = (row: Row): Schedule => ({
  id: String(row.id ?? row.schedule_id), enrollmentId: String(row.enrollment_id), userId: String(row.user_id), pack: String(row.pack), kind: row.kind as Schedule['kind'], localTime: time(row.local_time),
  weekday: num(row.weekday), timeZone: String(row.time_zone), nextAt: String(row.next_at), lastSlot: str(row.last_slot), enabled: row.enabled !== false,
});
const certificate = (row: Row): Certificate => ({
  id: String(row.id), code: String(row.code), userId: String(row.user_id), pack: String(row.pack), packVersion: String(row.pack_version), milestone: String(row.milestone), rubric: String(row.rubric),
  level: Number(row.level), levelLabel: String(row.level_label), displayName: String(row.display_name), evidence: Array.isArray(row.evidence) ? row.evidence as Certificate['evidence'] : [],
  issuedAt: String(row.issued_at), revokedAt: str(row.revoked_at),
});
const team = (row: Row): Team => ({
  id: String(row.id), name: String(row.name), managerId: str(row.manager_id), packs: Array.isArray(row.packs) ? row.packs.map(String) : [], seats: Number(row.seats),
  status: row.status as Team['status'], validUntil: String(row.valid_until), source: String(row.source), createdAt: String(row.created_at),
});
const savedScript = (row: Row): SavedScript => ({
  id: String(row.id), userId: String(row.user_id), pack: String(row.pack), title: String(row.title ?? ''), input: obj(row.input) as Record<string, string>, script: obj(row.script),
  createdAt: String(row.created_at), updatedAt: String(row.updated_at ?? row.created_at),
});
const member = (row: Row): TeamMember => ({ teamId: String(row.team_id), userId: String(row.user_id), role: row.role as TeamMember['role'], status: row.status as TeamMember['status'], joinedAt: String(row.joined_at) });
const card = (row: Row): CardState => ({ cardId: String(row.card_id), srs: obj(row.srs), dueAt: String(row.due_at), reps: Number(row.reps ?? 0), lapses: Number(row.lapses ?? 0) });
const masteryRow = (row: Row): MasteryState => ({
  node: String(row.node), level: num(row.level), mastery: Number(row.mastery ?? 0), evidence: Number(row.evidence ?? 0), lastScore: num(row.last_score), lastAt: str(row.last_at),
  errors: obj(row.errors) as MasteryState['errors'],
});
const ENROLLMENT_COLUMNS: Record<string, string> = {
  status: 'status', locale: 'locale', settings: 'settings', goal: 'goal', placement: 'placement', state: 'state', streakCurrent: 'streak_current', streakBest: 'streak_best',
  lastActiveDay: 'last_active_day', verifiedMinutes: 'verified_minutes', packVersion: 'pack_version',
};

export function createPostgresCoachStore(db: CoachDatabase): CoachStore {
  const store: CoachStore = {
    async enrollment(userId, pack) {
      const row = check(await db.from('coach_enrollments').select('*').eq('user_id', userId).eq('pack', pack).maybeSingle());
      return row ? enrollment(row) : null;
    },
    async enrollments(userId) { return (check(await db.from('coach_enrollments').select('*').eq('user_id', userId).limit(20)) as Row[] ?? []).map(enrollment); },
    async ensureEnrollment(input) {
      check(await db.from('coach_enrollments').upsert({ user_id: input.userId, workspace_id: input.workspaceId, pack: input.pack, pack_version: input.packVersion, locale: input.locale }, { onConflict: 'user_id,pack', ignoreDuplicates: true }));
      return (await store.enrollment(input.userId, input.pack))!;
    },
    async updateEnrollment(id, revision, patch) {
      const values: Row = { revision: revision + 1 };
      for (const [key, value] of Object.entries(patch)) if (ENROLLMENT_COLUMNS[key]) values[ENROLLMENT_COLUMNS[key]] = value;
      const row = check(await db.from('coach_enrollments').update(values).eq('id', id).eq('revision', revision).select('*').maybeSingle());
      return row ? enrollment(row) : null;
    },
    async claimUpdate(pack, updateId, userId) {
      const result = await db.from('coach_updates').insert({ pack, update_id: updateId, user_id: userId });
      if (result.error?.code === '23505') return false;
      check(result);
      return true;
    },
    async createSession(input) {
      return session(check(await db.from('coach_sessions').insert({
        enrollment_id: input.enrollmentId, user_id: input.userId, pack: input.pack, pack_version: input.packVersion, kind: input.kind, activity_id: input.activityId, mode: input.mode, rubric: input.rubric, source: input.source,
      }).select('*').single()));
    },
    async session(id) { const row = check(await db.from('coach_sessions').select('*').eq('id', id).maybeSingle()); return row ? session(row) : null; },
    async updateSession(id, patch) {
      const values: Row = {};
      if (patch.status !== undefined) values.status = patch.status;
      if (patch.overall !== undefined) values.overall = patch.overall;
      if (patch.summary !== undefined) values.summary = patch.summary;
      if (patch.minutes !== undefined) values.minutes = Math.min(240, Math.max(0, Math.round(patch.minutes)));
      if (patch.finishedAt !== undefined) values.finished_at = patch.finishedAt;
      if (patch.mode !== undefined) values.mode = patch.mode;
      const row = check(await db.from('coach_sessions').update(values).eq('id', id).select('*').maybeSingle());
      return row ? session(row) : null;
    },
    async sessions(userId, pack, filter) {
      let query = db.from('coach_sessions').select('*').eq('user_id', userId).eq('pack', pack);
      if (filter.status) query = query.eq('status', filter.status);
      if (filter.kind) query = query.eq('kind', filter.kind);
      if (filter.since) query = query.gte('started_at', filter.since);
      return ((check(await query.order('started_at', { ascending: false }).limit(filter.limit)) as Row[]) ?? []).map(session);
    },
    async results(userId, pack, filter) {
      let query = db.from('coach_sessions').select('*').eq('user_id', userId).eq('pack', pack).eq('status', 'finished').not('overall', 'is', null);
      if (filter.rubric) query = query.eq('rubric', filter.rubric);
      if (filter.since) query = query.gte('finished_at', filter.since);
      return ((check(await query.order('finished_at', { ascending: false }).limit(filter.limit)) as Row[]) ?? []).map(session);
    },
    async addTurn(input) {
      for (let attempt = 0; attempt < 4; attempt++) {
        let seq = input.seq;
        if (seq === undefined) {
          const last = check(await db.from('coach_turns').select('seq').eq('session_id', input.sessionId).order('seq', { ascending: false }).limit(1)) as Row[];
          seq = last?.length ? Number(last[0].seq) + 1 : 0;
        }
        const result = await db.from('coach_turns').insert({
          session_id: input.sessionId, user_id: input.userId, pack: input.pack, seq, role: input.role, kind: input.kind, prompt_ref: input.promptRef, content: input.content.slice(0, 20000),
          input_mode: input.inputMode, clip: input.clip, metrics: input.metrics, timing: input.timing, keep: input.keep,
        }).select('*').single();
        if (result.error?.code === '23505' && input.seq === undefined) continue;
        return turn(check(result));
      }
      throw new Error('could not number the turn');
    },
    async turns(sessionId) { return ((check(await db.from('coach_turns').select('*').eq('session_id', sessionId).order('seq').limit(500)) as Row[]) ?? []).map(turn); },
    async turn(id) { const row = check(await db.from('coach_turns').select('*').eq('id', id).maybeSingle()); return row ? turn(row) : null; },
    async learnerTurns(userId, pack, since) {
      const rows = check(await db.from('coach_turns').select('id,session_id,user_id,pack,seq,role,kind,prompt_ref,input_mode,metrics,timing,keep,created_at')
        .eq('user_id', userId).eq('pack', pack).eq('role', 'learner').gte('created_at', since).order('created_at').limit(3000)) as Row[];
      return (rows ?? []).map((row) => turn({ ...row, content: '' }));
    },
    async keepTurn(id) { check(await db.from('coach_turns').update({ keep: true }).eq('id', id)); },
    async addScores(rows) {
      if (!rows.length) return;
      check(await db.from('coach_scores').insert(rows.map((row) => ({
        session_id: row.sessionId, turn_id: row.turnId, user_id: row.userId, pack: row.pack, rubric: row.rubric, criterion: row.criterion,
        score: row.status === 'scored' ? row.score : null, status: row.status, evidence: row.evidence.slice(0, 10), source: row.source,
      }))));
    },
    async scores(sessionId) {
      const rows = check(await db.from('coach_scores').select('*').eq('session_id', sessionId).order('id').limit(500)) as Row[];
      return (rows ?? []).map((row): ScoreRow => ({
        sessionId: String(row.session_id), turnId: str(row.turn_id), userId: String(row.user_id), pack: String(row.pack), rubric: String(row.rubric), criterion: String(row.criterion),
        score: num(row.score), status: row.status as ScoreRow['status'], evidence: Array.isArray(row.evidence) ? row.evidence as ScoreRow['evidence'] : [], source: row.source as ScoreRow['source'], createdAt: String(row.created_at),
      }));
    },
    async mastery(userId, pack) { return ((check(await db.from('coach_mastery').select('*').eq('user_id', userId).eq('pack', pack).limit(500)) as Row[]) ?? []).map(masteryRow); },
    async saveMastery(userId, pack, rows) {
      if (!rows.length) return;
      check(await db.from('coach_mastery').upsert(rows.map((row) => ({
        user_id: userId, pack, node: row.node, level: row.level, mastery: Math.min(1, Math.max(0, row.mastery)), evidence: row.evidence, last_score: row.lastScore, last_at: row.lastAt, errors: row.errors,
      })), { onConflict: 'user_id,pack,node' }));
    },
    async cards(userId, pack, ids) {
      let query = db.from('coach_cards').select('*').eq('user_id', userId).eq('pack', pack);
      if (ids) query = query.in('card_id', ids.slice(0, 500));
      return ((check(await query.limit(2000)) as Row[]) ?? []).map(card);
    },
    async dueCards(userId, pack, at, limit) { return ((check(await db.from('coach_cards').select('*').eq('user_id', userId).eq('pack', pack).lte('due_at', at).order('due_at').limit(limit)) as Row[]) ?? []).map(card); },
    async countDue(userId, pack, at) {
      const result = await db.from('coach_cards').select('card_id', { count: 'exact', head: true }).eq('user_id', userId).eq('pack', pack).lte('due_at', at);
      check(result);
      return Number(result.count ?? 0);
    },
    async saveCard(userId, pack, state) {
      check(await db.from('coach_cards').upsert({ user_id: userId, pack, card_id: state.cardId, srs: state.srs, due_at: state.dueAt, reps: state.reps, lapses: state.lapses }, { onConflict: 'user_id,pack,card_id' }));
    },
    async cardReviews(userId, pack, since) {
      const rows = check(await db.from('coach_turns').select('created_at,metrics').eq('user_id', userId).eq('pack', pack).eq('kind', 'card').gte('created_at', since).limit(5000)) as Row[];
      return (rows ?? []).map((row) => ({ at: String(row.created_at), correct: obj(row.metrics).correct === true }));
    },
    async addPoll(input) { check(await db.from('coach_polls').insert({ poll_id: input.pollId, user_id: input.userId, pack: input.pack, session_id: input.sessionId, card_id: input.cardId, correct: input.correct })); },
    async answerPoll(pollId, at) {
      const row = check(await db.from('coach_polls').update({ answered_at: at }).eq('poll_id', pollId).is('answered_at', null).select('*').maybeSingle());
      return row ? { userId: String(row.user_id), pack: String(row.pack), sessionId: String(row.session_id), cardId: String(row.card_id), correct: Number(row.correct) } : null;
    },
    async schedule(enrollmentId, kind) { const row = check(await db.from('coach_schedules').select('*').eq('enrollment_id', enrollmentId).eq('kind', kind).maybeSingle()); return row ? schedule(row) : null; },
    async saveSchedule(input) {
      return schedule(check(await db.from('coach_schedules').upsert({
        enrollment_id: input.enrollmentId, user_id: input.userId, pack: input.pack, kind: input.kind, local_time: input.localTime, weekday: input.weekday, time_zone: input.timeZone,
        next_at: input.nextAt, enabled: input.enabled, lease_until: null, ...(input.lastSlot !== undefined ? { last_slot: input.lastSlot } : {}),
      }, { onConflict: 'enrollment_id,kind' }).select('*').single()));
    },
    async claimDue(at, limit, leaseSeconds) {
      const rows = check(await db.rpc('coach_claim_due', { p_now: at, p_limit: limit, p_lease_seconds: leaseSeconds })) as Row[];
      return (rows ?? []).map((row): Claimed => ({ ...schedule(row), chatId: String(row.chat_id) }));
    },
    async advanceSchedule(id, patch) {
      check(await db.from('coach_schedules').update({
        next_at: patch.nextAt, lease_until: null, ...(patch.lastSlot !== undefined ? { last_slot: patch.lastSlot } : {}), ...(patch.sent ? { last_sent_at: new Date().toISOString() } : {}),
      }).eq('id', id));
    },
    async logDelivery(input) {
      const row = check(await db.from('coach_deliveries').insert({ schedule_id: input.scheduleId, user_id: input.userId, pack: input.pack, kind: input.kind, slot: input.slot, status: input.status, reason: input.reason ?? null }).select('id').single());
      return Number(row.id);
    },
    async updateDelivery(id, status, reason) {
      const row = check(await db.from('coach_deliveries').update({ status, reason: reason ?? null }).eq('id', id).select('user_id,pack').maybeSingle());
      if (!row) return null;
      if (status === 'blocked') check(await db.from('coach_enrollments').update({ status: 'blocked' }).eq('user_id', row.user_id).eq('pack', row.pack));
      return { userId: String(row.user_id), pack: String(row.pack) };
    },
    async media(pack, cacheKey) { const row = check(await db.from('coach_media').select('file_id').eq('pack', pack).eq('cache_key', cacheKey).maybeSingle()); return row ? String(row.file_id) : null; },
    async saveMedia(pack, cacheKey, fileId) { check(await db.from('coach_media').upsert({ pack, cache_key: cacheKey, file_id: fileId }, { onConflict: 'pack,cache_key' })); },
    async certificates(userId, pack) {
      let query = db.from('coach_certificates').select('*').eq('user_id', userId);
      if (pack) query = query.eq('pack', pack);
      return ((check(await query.order('issued_at', { ascending: false }).limit(100)) as Row[]) ?? []).map(certificate);
    },
    async certificateByCode(code) { const row = check(await db.from('coach_certificates').select('*').eq('code', code).maybeSingle()); return row ? certificate(row) : null; },
    async issueCertificate(input) {
      const result = await db.from('coach_certificates').insert({
        code: input.code, user_id: input.userId, pack: input.pack, pack_version: input.packVersion, milestone: input.milestone, rubric: input.rubric, level: input.level,
        level_label: input.levelLabel, display_name: input.displayName, evidence: input.evidence,
      }).select('*').single();
      if (result.error?.code === '23505') {
        const existing = check(await db.from('coach_certificates').select('*').eq('user_id', input.userId).eq('pack', input.pack).eq('milestone', input.milestone).is('revoked_at', null).maybeSingle());
        if (existing) return certificate(existing);
      }
      return certificate(check(result));
    },
    async revokeCertificate(id, userId) {
      const row = check(await db.from('coach_certificates').update({ revoked_at: new Date().toISOString() }).eq('id', id).eq('user_id', userId).is('revoked_at', null).select('id').maybeSingle());
      return !!row;
    },
    async erase(userId, pack) {
      const removed = check(await db.from('coach_sessions').delete().eq('user_id', userId).eq('pack', pack).select('id')) as Row[];
      check(await db.from('coach_mastery').delete().eq('user_id', userId).eq('pack', pack));
      check(await db.from('coach_cards').delete().eq('user_id', userId).eq('pack', pack));
      check(await db.from('coach_scripts').delete().eq('user_id', userId).eq('pack', pack));
      return removed?.length ?? 0;
    },
    async cohort(pack, rubric, since) {
      // Aggregated in SQL (20261030700000): only counts per score leave the database.
      const rows = check(await db.rpc('coach_cohort_histogram', { p_pack: pack, p_rubric: rubric, p_since: since })) as Row[] | null;
      return (rows ?? []).map((row) => ({ score: Number(row.score), people: Number(row.people) })).filter((row) => Number.isFinite(row.score) && row.people > 0);
    },
    async scripts(userId, pack) {
      return ((check(await db.from('coach_scripts').select('*').eq('user_id', userId).eq('pack', pack).order('updated_at', { ascending: false }).limit(50)) as Row[]) ?? []).map(savedScript);
    },
    async script(id) { const row = check(await db.from('coach_scripts').select('*').eq('id', id).maybeSingle()); return row ? savedScript(row) : null; },
    async saveScript(input) {
      return savedScript(check(await db.from('coach_scripts').insert({ user_id: input.userId, pack: input.pack, title: input.title, input: input.input, script: input.script }).select('*').single()));
    },
    async deleteScript(id, userId) {
      const rows = check(await db.from('coach_scripts').delete().eq('id', id).eq('user_id', userId).select('id')) as Row[];
      return (rows ?? []).length > 0;
    },
    async teamsOf(userId) {
      const rows = check(await db.from('coach_team_members').select('*, coach_teams(*)').eq('user_id', userId).eq('status', 'active').limit(20)) as Row[];
      return (rows ?? []).filter((row) => row.coach_teams).map((row) => ({ team: team(obj(row.coach_teams)), member: member(row) }));
    },
    async team(id) { const row = check(await db.from('coach_teams').select('*').eq('id', id).maybeSingle()); return row ? team(row) : null; },
    async teamMembers(teamId) { return ((check(await db.from('coach_team_members').select('*').eq('team_id', teamId).limit(10000)) as Row[]) ?? []).map(member); },
    async createTeam(input) {
      return team(check(await db.from('coach_teams').insert({ name: input.name, manager_id: input.managerId, packs: input.packs, seats: input.seats, valid_until: input.validUntil, source: input.source, created_by: input.createdBy }).select('*').single()));
    },
    async addTeamMember(teamId, userId, role) { check(await db.from('coach_team_members').upsert({ team_id: teamId, user_id: userId, role, status: 'active', removed_at: null }, { onConflict: 'team_id,user_id' })); },
    async removeTeamMember(teamId, userId) {
      const row = check(await db.from('coach_team_members').update({ status: 'removed', removed_at: new Date().toISOString() }).eq('team_id', teamId).eq('user_id', userId).eq('status', 'active').select('user_id').maybeSingle());
      return !!row;
    },
    async createInvite(input) { check(await db.from('coach_team_invites').insert({ code: input.code, team_id: input.teamId, created_by: input.createdBy, expires_at: input.expiresAt, max_uses: input.maxUses })); },
    async joinTeam(code, userId, at) {
      const result = await db.rpc('coach_team_join', { p_code: code, p_user: userId, p_now: at });
      if (result.error) {
        const known = ['invite_not_found', 'invite_expired', 'team_inactive', 'team_full'].find((reason) => result.error!.message.includes(reason));
        throw new Error(known ?? `db: ${result.error.message}`);
      }
      return member(obj(result.data));
    },
    async teamActivity(userIds, packs, since) {
      if (!userIds.length) return [];
      const rows = check(await db.from('coach_sessions').select('user_id,rubric,overall,minutes,finished_at').in('user_id', userIds.slice(0, 1000)).in('pack', packs).eq('status', 'finished').gte('finished_at', since).limit(20000)) as Row[];
      const by = new Map<string, { minutes: number; results: number; days: Set<string>; best: Record<string, number | null> }>();
      for (const id of userIds) by.set(id, { minutes: 0, results: 0, days: new Set(), best: {} });
      for (const row of rows ?? []) {
        const entry = by.get(String(row.user_id));
        if (!entry) continue;
        entry.minutes += Number(row.minutes ?? 0);
        entry.days.add(String(row.finished_at).slice(0, 10));
        if (row.overall !== null && row.rubric) { entry.results += 1; entry.best[String(row.rubric)] = Math.max(entry.best[String(row.rubric)] ?? -Infinity, Number(row.overall)); }
      }
      return [...by.entries()].map(([userId, entry]) => ({ userId, minutes: entry.minutes, results: entry.results, activeDays: entry.days.size, best: entry.best }));
    },
  };
  return store;
}
