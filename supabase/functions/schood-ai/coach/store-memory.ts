import type { MasteryState } from '../../../../packages/coach-packs/src/mod.ts';
import type { CardState, Certificate, Claimed, CoachStore, Enrollment, SavedScript, Schedule, ScoreRow, Session, Team, TeamMember, Turn } from './store.ts';

interface Card { userId: string; pack: string; cardId: string; state: CardState }

// In-memory coach store for tests and the local dev stack, mirroring the migration:
// one enrolment per person and coach, revision-checked state, first-wins update
// ids, leased schedule claims, one active certificate per milestone, team seats.
// Never used by the deployed function.

export function createMemoryCoachStore(options: { now?: () => Date; chatIdOf?: (userId: string) => string | null } = {}) {
  const now = options.now ?? (() => new Date());
  const iso = () => now().toISOString();
  const id = () => crypto.randomUUID();
  const enrollments = new Map<string, Enrollment>(), sessions = new Map<string, Session>(), turns = new Map<string, Turn>();
  const scores: (ScoreRow & { createdAt: string })[] = [], mastery = new Map<string, MasteryState>(), cards = new Map<string, Card>();
  const polls = new Map<string, { userId: string; pack: string; sessionId: string; cardId: string; correct: number; answeredAt: string | null }>();
  const schedules = new Map<string, Schedule & { lease: number | null }>(), updates = new Set<string>(), media = new Map<string, string>();
  const deliveries: { id: number; userId: string; pack: string; status: string; reason: string | null; kind: string }[] = [];
  const mints: { userId: string; at: string }[] = [], certificates = new Map<string, Certificate>();
  const teams = new Map<string, Team>(), members = new Map<string, TeamMember>(), invites = new Map<string, { teamId: string; expiresAt: string; maxUses: number; uses: number }>();
  const scripts = new Map<string, SavedScript>();
  const clone = <T>(value: T): T => structuredClone(value);

  const store: CoachStore = {
    async enrollment(userId, pack) { const found = [...enrollments.values()].find((row) => row.userId === userId && row.pack === pack); return found ? clone(found) : null; },
    async enrollments(userId) { return [...enrollments.values()].filter((row) => row.userId === userId).map(clone); },
    async ensureEnrollment(input) {
      const existing = await store.enrollment(input.userId, input.pack);
      if (existing) return existing;
      const row: Enrollment = {
        id: id(), userId: input.userId, workspaceId: input.workspaceId, pack: input.pack, packVersion: input.packVersion, status: 'active', locale: input.locale,
        settings: {}, goal: null, placement: null, state: {}, revision: 0, streakCurrent: 0, streakBest: 0, lastActiveDay: null, verifiedMinutes: 0, fairUseCycle: null, createdAt: iso(),
      };
      enrollments.set(row.id, row);
      return clone(row);
    },
    async updateEnrollment(rowId, revision, patch) {
      const row = enrollments.get(rowId);
      if (!row || row.revision !== revision) return null;
      if (patch.state && JSON.stringify(patch.state).length > 60000) throw new Error('state too large');
      Object.assign(row, clone(patch), { revision: row.revision + 1 });
      return clone(row);
    },
    async claimUpdate(pack, updateId) {
      const key = `${pack}:${updateId}`;
      if (updates.has(key)) return false;
      updates.add(key);
      return true;
    },
    async createSession(input) {
      const row: Session = { ...input, id: id(), status: 'active', overall: null, summary: {}, minutes: 0, startedAt: iso(), finishedAt: null };
      sessions.set(row.id, row);
      return clone(row);
    },
    async session(rowId) { const row = sessions.get(rowId); return row ? clone(row) : null; },
    async updateSession(rowId, patch) { const row = sessions.get(rowId); if (!row) return null; Object.assign(row, clone(patch)); return clone(row); },
    async sessions(userId, pack, filter) {
      return [...sessions.values()].filter((row) => row.userId === userId && row.pack === pack && (!filter.status || row.status === filter.status) && (!filter.kind || row.kind === filter.kind) && (!filter.since || row.startedAt >= filter.since))
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, filter.limit).map(clone);
    },
    async results(userId, pack, filter) {
      return [...sessions.values()].filter((row) => row.userId === userId && row.pack === pack && row.status === 'finished' && row.overall !== null && (!filter.rubric || row.rubric === filter.rubric) && (!filter.since || (row.finishedAt ?? '') >= filter.since))
        .sort((a, b) => (b.finishedAt ?? '').localeCompare(a.finishedAt ?? '')).slice(0, filter.limit).map(clone);
    },
    async addTurn(input) {
      const seq = input.seq ?? [...turns.values()].filter((row) => row.sessionId === input.sessionId).reduce((max, row) => Math.max(max, row.seq + 1), 0);
      if ([...turns.values()].some((row) => row.sessionId === input.sessionId && row.seq === seq)) throw new Error('duplicate turn');
      const row: Turn = { ...clone(input), seq, id: id(), createdAt: iso() };
      turns.set(row.id, row);
      return clone(row);
    },
    async turns(sessionId) { return [...turns.values()].filter((row) => row.sessionId === sessionId).sort((a, b) => a.seq - b.seq).map(clone); },
    async turn(rowId) { const row = turns.get(rowId); return row ? clone(row) : null; },
    async learnerTurns(userId, pack, since) { return [...turns.values()].filter((row) => row.userId === userId && row.pack === pack && row.role === 'learner' && row.createdAt >= since).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map(clone); },
    async keepTurn(rowId) { const row = turns.get(rowId); if (row) row.keep = true; },
    async addScores(rows) { for (const row of rows) scores.push({ ...clone(row), createdAt: iso() }); },
    async scores(sessionId) { return scores.filter((row) => row.sessionId === sessionId).map(clone); },
    async mastery(userId, pack) { return [...mastery.entries()].filter(([key]) => key.startsWith(`${userId}:${pack}:`)).map(([, value]) => clone(value)); },
    async saveMastery(userId, pack, rows) { for (const row of rows) mastery.set(`${userId}:${pack}:${row.node}`, clone(row)); },
    async cards(userId, pack, ids) { return [...cards.values()].filter((card) => card.userId === userId && card.pack === pack && (!ids || ids.includes(card.cardId))).map((card) => clone(card.state)); },
    async dueCards(userId, pack, at, limit) { return [...cards.values()].filter((card) => card.userId === userId && card.pack === pack && card.state.dueAt <= at).sort((a, b) => a.state.dueAt.localeCompare(b.state.dueAt)).slice(0, limit).map((card) => clone(card.state)); },
    async countDue(userId, pack, at) { return [...cards.values()].filter((card) => card.userId === userId && card.pack === pack && card.state.dueAt <= at).length; },
    async saveCard(userId, pack, state) { cards.set(`${userId}:${pack}:${state.cardId}`, { userId, pack, cardId: state.cardId, state: clone(state) }); },
    async cardReviews(userId, pack, since) {
      return [...turns.values()].filter((row) => row.userId === userId && row.pack === pack && row.kind === 'card' && row.createdAt >= since).map((row) => ({ at: row.createdAt, correct: row.metrics.correct === true }));
    },
    async addPoll(input) { polls.set(input.pollId, { ...input, answeredAt: null }); },
    async answerPoll(pollId, at) {
      const row = polls.get(pollId);
      if (!row || row.answeredAt) return null;
      row.answeredAt = at;
      return { userId: row.userId, pack: row.pack, sessionId: row.sessionId, cardId: row.cardId, correct: row.correct };
    },
    async schedule(enrollmentId, kind) { const row = [...schedules.values()].find((entry) => entry.enrollmentId === enrollmentId && entry.kind === kind); if (!row) return null; const { lease: _lease, ...rest } = row; return clone(rest); },
    async saveSchedule(input) {
      const existing = [...schedules.values()].find((entry) => entry.enrollmentId === input.enrollmentId && entry.kind === input.kind);
      const row = { ...(existing ?? { id: id(), lastSlot: null, lease: null }), ...clone(input), lastSlot: input.lastSlot ?? existing?.lastSlot ?? null, lease: null };
      schedules.set(row.id, row);
      const { lease: _lease, ...rest } = row;
      return clone(rest);
    },
    async claimDue(at, limit, leaseSeconds) {
      const t = Date.parse(at), out: Claimed[] = [];
      for (const row of [...schedules.values()].sort((a, b) => a.nextAt.localeCompare(b.nextAt))) {
        if (out.length >= limit) break;
        const enrollment = enrollments.get(row.enrollmentId);
        const chatId = options.chatIdOf?.(row.userId) ?? null;
        if (!row.enabled || Date.parse(row.nextAt) > t || (row.lease !== null && row.lease >= t) || enrollment?.status !== 'active' || !chatId) continue;
        row.lease = t + leaseSeconds * 1000;
        const { lease: _lease, ...rest } = row;
        out.push({ ...clone(rest), chatId });
      }
      return out;
    },
    async advanceSchedule(rowId, patch) {
      const row = schedules.get(rowId);
      if (!row) return;
      row.nextAt = patch.nextAt; row.lease = null;
      if (patch.lastSlot !== undefined) row.lastSlot = patch.lastSlot;
    },
    async logDelivery(input) { const rowId = deliveries.length + 1; deliveries.push({ id: rowId, userId: input.userId, pack: input.pack, status: input.status, reason: input.reason ?? null, kind: input.kind }); return rowId; },
    async updateDelivery(rowId, status, reason) {
      const row = deliveries.find((entry) => entry.id === rowId);
      if (!row) return null;
      row.status = status; row.reason = reason ?? null;
      if (status === 'blocked') {
        for (const enrollment of enrollments.values()) if (enrollment.userId === row.userId && enrollment.pack === row.pack) { enrollment.status = 'blocked'; enrollment.revision += 1; }
      }
      return { userId: row.userId, pack: row.pack };
    },
    async media(pack, cacheKey) { return media.get(`${pack}:${cacheKey}`) ?? null; },
    async saveMedia(pack, cacheKey, fileId) { media.set(`${pack}:${cacheKey}`, fileId); },
    async countMints(userId, since) { return mints.filter((row) => row.userId === userId && row.at >= since).length; },
    async addMint(userId) { mints.push({ userId, at: iso() }); },
    async certificates(userId, pack) { return [...certificates.values()].filter((row) => row.userId === userId && (!pack || row.pack === pack)).sort((a, b) => b.issuedAt.localeCompare(a.issuedAt)).map(clone); },
    async certificateByCode(code) { const row = [...certificates.values()].find((entry) => entry.code === code); return row ? clone(row) : null; },
    async issueCertificate(input) {
      const existing = [...certificates.values()].find((row) => row.userId === input.userId && row.pack === input.pack && row.milestone === input.milestone && !row.revokedAt);
      if (existing) return clone(existing);
      const row: Certificate = { ...clone(input), id: id(), issuedAt: iso(), revokedAt: null };
      certificates.set(row.id, row);
      return clone(row);
    },
    async revokeCertificate(rowId, userId) { const row = certificates.get(rowId); if (!row || row.userId !== userId || row.revokedAt) return false; row.revokedAt = iso(); return true; },
    async erase(userId, pack) {
      let count = 0;
      for (const [key, row] of sessions) if (row.userId === userId && row.pack === pack) { sessions.delete(key); count += 1; }
      for (const [key, row] of turns) if (row.userId === userId && row.pack === pack) turns.delete(key);
      for (let i = scores.length - 1; i >= 0; i--) if (scores[i].userId === userId && scores[i].pack === pack) scores.splice(i, 1);
      for (const key of [...mastery.keys()]) if (key.startsWith(`${userId}:${pack}:`)) mastery.delete(key);
      for (const key of [...cards.keys()]) if (key.startsWith(`${userId}:${pack}:`)) cards.delete(key);
      for (const [key, row] of scripts) if (row.userId === userId && row.pack === pack) scripts.delete(key);
      return count;
    },
    async cohort(pack, rubric, since) {
      // Each person's latest result in the window, then counts per whole score: what the SQL function returns.
      const latest = new Map<string, Session>();
      for (const row of sessions.values()) {
        if (row.pack !== pack || row.rubric !== rubric || row.status !== 'finished' || row.overall === null || (row.finishedAt ?? '') < since) continue;
        const seen = latest.get(row.userId);
        if (!seen || (seen.finishedAt ?? '') < (row.finishedAt ?? '')) latest.set(row.userId, row);
      }
      const counts = new Map<number, number>();
      for (const row of latest.values()) counts.set(Math.round(row.overall!), (counts.get(Math.round(row.overall!)) ?? 0) + 1);
      return [...counts.entries()].sort((a, b) => a[0] - b[0]).map(([score, people]) => ({ score, people }));
    },
    async scripts(userId, pack) { return [...scripts.values()].filter((row) => row.userId === userId && row.pack === pack).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(clone); },
    async script(rowId) { const row = scripts.get(rowId); return row ? clone(row) : null; },
    async saveScript(input) {
      const at = iso();
      const row: SavedScript = { ...clone(input), id: id(), createdAt: at, updatedAt: at };
      scripts.set(row.id, row);
      return clone(row);
    },
    async deleteScript(rowId, userId) { const row = scripts.get(rowId); if (!row || row.userId !== userId) return false; scripts.delete(rowId); return true; },
    async teamsOf(userId) {
      return [...members.values()].filter((row) => row.userId === userId && row.status === 'active').map((member) => ({ team: clone(teams.get(member.teamId)!), member: clone(member) })).filter((row) => !!row.team);
    },
    async team(teamId) { const row = teams.get(teamId); return row ? clone(row) : null; },
    async teamMembers(teamId) { return [...members.values()].filter((row) => row.teamId === teamId).map(clone); },
    async createTeam(input) {
      const row: Team = { id: id(), name: input.name, managerId: input.managerId, packs: [...input.packs], seats: input.seats, status: 'active', validUntil: input.validUntil, source: input.source, createdAt: iso() };
      teams.set(row.id, row);
      return clone(row);
    },
    async addTeamMember(teamId, userId, role) { members.set(`${teamId}:${userId}`, { teamId, userId, role, status: 'active', joinedAt: iso() }); },
    async removeTeamMember(teamId, userId) { const row = members.get(`${teamId}:${userId}`); if (!row || row.status !== 'active') return false; row.status = 'removed'; return true; },
    async createInvite(input) { invites.set(input.code, { teamId: input.teamId, expiresAt: input.expiresAt, maxUses: input.maxUses, uses: 0 }); },
    async joinTeam(code, userId, at) {
      const invite = invites.get(code);
      if (!invite) throw new Error('invite_not_found');
      if (invite.expiresAt <= at || invite.uses >= invite.maxUses) throw new Error('invite_expired');
      const team = teams.get(invite.teamId)!;
      if (team.status !== 'active' || team.validUntil <= at) throw new Error('team_inactive');
      const existing = members.get(`${team.id}:${userId}`);
      if (existing?.status === 'active') return clone(existing);
      if ([...members.values()].filter((row) => row.teamId === team.id && row.status === 'active').length >= team.seats) throw new Error('team_full');
      const row: TeamMember = { teamId: team.id, userId, role: 'member', status: 'active', joinedAt: at };
      members.set(`${team.id}:${userId}`, row);
      invite.uses += 1;
      return clone(row);
    },
    async teamActivity(userIds, packs, since) {
      return userIds.map((userId) => {
        const mine = [...sessions.values()].filter((row) => row.userId === userId && packs.includes(row.pack) && row.status === 'finished' && (row.finishedAt ?? '') >= since);
        const best: Record<string, number | null> = {};
        for (const row of mine) if (row.rubric && row.overall !== null) best[row.rubric] = Math.max(best[row.rubric] ?? -Infinity, row.overall);
        return { userId, minutes: mine.reduce((sum, row) => sum + row.minutes, 0), results: mine.filter((row) => row.overall !== null).length, activeDays: new Set(mine.map((row) => (row.finishedAt ?? '').slice(0, 10))).size, best };
      });
    },
  };
  return { store, inspect: { enrollments, sessions, turns, scores, schedules, deliveries, certificates, polls, members, scripts } };
}
