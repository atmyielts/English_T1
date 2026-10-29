import type { LearningEvent, SchoodAIRepository } from '../types.ts';
import { DAILY_XP_CAP, DEFAULT_NOTIFY_HOUR, DEFAULT_TIME_ZONE, eventXp, inQuietHours, localParts, weekStart } from './rules.ts';
import type { EngageRepository, ProfilePatch } from './store.ts';
import type {
  BoardRow, CentreBoardRow, CertificateRow, DateRow, DayRow, EngageProfile, EngageSettings, EventRow, EventSponsor, FreezeBuy, GoalRow, JourneyRow,
  LeagueGroup, LeagueMember, OutboxRow, PassportItem, PassportLink, PassportRow, SampleRow, SittingRow, SittingSignal, SquadMember, SquadRow,
  StoryEpisodeCache, StoryProgress, StoryResult, TalentAudit, TalentEmployer, TalentProfile, XpRow,
} from './types.ts';

// The engage repository in memory, for tests and the dev stack. Each method does
// its whole read-modify-write without awaiting in the middle, which is what the
// Postgres functions get from their per-person advisory lock: two requests racing
// on the same person can never both count an event, overfill a league group or a
// squad, or buy two freezes in one week.

const clone = <T>(value: T): T => structuredClone(value);
const LEAGUE_GROUP_SIZE = 30;

export interface EngageMemory extends EngageRepository {
  /** Learning events as ai_learning_events would hold them (ids ascending). */
  readonly eventLog: EventRow[];
  /** Appends core learning events with ids and timestamps (the tap and tests). */
  recordEvents(events: LearningEvent[], at?: Date): void;
  readonly outboxRows: OutboxRow[];
  readonly groups: Map<string, LeagueGroup>;
  readonly members: LeagueMember[];
}

export function createEngageMemory(options: { core: SchoodAIRepository; now: () => Date }): EngageMemory {
  const { core, now } = options;
  const iso = () => now().toISOString();
  const eventLog: EventRow[] = [];
  const profiles = new Map<string, EngageProfile>(), cursors = new Map<string, number>();
  const xp: XpRow[] = [], days = new Map<string, DayRow & { userId: string }>();
  let settings: EngageSettings = { talentPoolEnabled: false, updatedBy: null, updatedAt: null };
  const freezes: FreezeBuy[] = [];
  const groups = new Map<string, LeagueGroup>(), members: LeagueMember[] = [];
  const journeys: JourneyRow[] = [], goals: GoalRow[] = [], dateRows: DateRow[] = [];
  const squads = new Map<string, SquadRow>(), squadMembers: SquadMember[] = [];
  const stories: StoryProgress[] = [], storyResults: StoryResult[] = [], episodes: StoryEpisodeCache[] = [];
  const passports = new Map<string, PassportRow>(), items: PassportItem[] = [], links: PassportLink[] = [];
  const samples: SampleRow[] = [];
  const sittings: SittingRow[] = [], signals: SittingSignal[] = [], certificates: CertificateRow[] = [];
  const talent = new Map<string, TalentProfile>(), employers = new Map<string, TalentEmployer>(), audit: TalentAudit[] = [];
  const sponsors = new Map<string, EventSponsor>(), entries: { eventKey: string; userId: string; joinedAt: string }[] = [];
  const centreLeague = new Set<string>();
  const outboxRows: OutboxRow[] = [], ticks = new Set<string>(), dismissals: { userId: string; key: string }[] = [];
  let xpId = 0, idSeq = 0;
  const id = () => crypto.randomUUID();
  const dayKey = (userId: string, day: string) => `${userId}:${day}`;

  const defaults = (userId: string): EngageProfile => ({
    userId, birthDate: null, timeZone: DEFAULT_TIME_ZONE, notifyHour: DEFAULT_NOTIFY_HOUR, messages: 'all', locale: 'en', region: null, school: null,
    leaderboard: null, leagueOptOut: false, dailyLimitMinutes: null, limitSetBy: null, offersMuted: false, levelBand: 'open', lapseStage: 0, createdAt: null,
  });
  const profileOf = (userId: string) => profiles.get(userId) ?? defaults(userId);
  const addXp = (userId: string, row: Omit<XpRow, 'id' | 'userId' | 'createdAt'>) => {
    xp.push({ id: ++xpId, userId, createdAt: iso(), ...row });
    const key = dayKey(userId, row.day), day = days.get(key) ?? { userId, day: row.day, xp: 0, minutes: 0, events: 0 };
    day.xp += row.xp;
    days.set(key, day);
    const member = members.find((m) => m.userId === userId && m.weekStart === row.weekStart);
    if (member) member.xp += row.xp;
  };
  const verifiedIn = (userIds: Set<string>, since: Date, until: Date) => eventLog.filter((event) => userIds.has(event.userId) && event.verified && Date.parse(event.createdAt) >= since.getTime() && Date.parse(event.createdAt) <= until.getTime());

  const repo: EngageMemory = {
    eventLog, outboxRows, groups, members,
    recordEvents(events, at = now()) {
      for (const event of events) eventLog.push({ id: ++idSeq, userId: event.userId, workspaceId: event.workspaceId, area: event.area, kind: event.kind, verified: event.verified, feature: event.feature, skill: event.skill, verifiedMinutes: event.verifiedMinutes, score: event.score, outcome: event.outcome, ref: event.ref, source: event.source, createdAt: at.toISOString() });
    },

    // --- Profile -------------------------------------------------------------------
    profile: (userId) => Promise.resolve(clone(profileOf(userId))),
    profiles: (userIds) => Promise.resolve(new Map(userIds.map((userId) => [userId, clone(profileOf(userId))]))),
    async names(userIds) {
      const out = new Map<string, string | null>();
      for (const userId of userIds) {
        const name = (await core.profile(userId))?.name?.trim() ?? null;
        out.set(userId, name && !name.includes('@') ? name : null);
      }
      return out;
    },
    saveProfile(userId, patch: ProfilePatch) {
      const next = { ...profileOf(userId), ...patch, userId, createdAt: profileOf(userId).createdAt ?? iso() };
      profiles.set(userId, next);
      return Promise.resolve(clone(next));
    },
    setBirthDate(userId, date) {
      const current = profileOf(userId);
      if (current.birthDate) return Promise.resolve(false);
      profiles.set(userId, { ...current, birthDate: date, createdAt: current.createdAt ?? iso() });
      return Promise.resolve(true);
    },
    clearBirthDate(userId) { profiles.set(userId, { ...profileOf(userId), birthDate: null }); return Promise.resolve(); },
    settings: () => Promise.resolve(clone(settings)),
    saveSettings(patch, actor) { settings = { ...settings, ...patch, updatedBy: actor, updatedAt: iso() }; return Promise.resolve(clone(settings)); },

    // --- XP ----------------------------------------------------------------------------
    ingest(userId) {
      const zone = profileOf(userId).timeZone, after = cursors.get(userId) ?? 0;
      let events = 0, awarded = 0, capped = 0, last = after;
      for (const event of eventLog) {
        if (event.id <= after || event.userId !== userId) continue;
        last = event.id;
        if (!event.verified || xp.some((row) => row.eventId === event.id)) continue;
        events += 1;
        const at = new Date(event.createdAt), day = localParts(at, zone).day, week = weekStart(at);
        const key = dayKey(userId, day), current = days.get(key) ?? { userId, day, xp: 0, minutes: 0, events: 0 };
        const earned = xp.filter((row) => row.userId === userId && row.day === day && row.source === 'event').reduce((sum, row) => sum + row.xp, 0);
        const full = eventXp(event.kind, event.verifiedMinutes, event.verified), granted = Math.max(0, Math.min(full, DAILY_XP_CAP - earned));
        current.minutes += event.verifiedMinutes;
        current.events += 1;
        days.set(key, current);
        if (granted < full) capped += full - granted;
        if (granted > 0) { addXp(userId, { eventId: event.id, source: 'event', sourceKey: null, xp: granted, day, weekStart: week, feature: event.feature }); awarded += granted; }
        else xp.push({ id: ++xpId, userId, eventId: event.id, source: 'event', sourceKey: null, xp: 0, day, weekStart: week, feature: event.feature, createdAt: iso() });
      }
      cursors.set(userId, Math.max(after, last));
      return Promise.resolve({ events, awarded, capped });
    },
    async ingestMany(userIds, at) { for (const userId of new Set(userIds)) await repo.ingest(userId, at); },
    awardBonus(userId, input) {
      if (xp.some((row) => row.userId === userId && row.source === input.source && row.sourceKey === input.key)) return Promise.resolve(false);
      if (!Number.isInteger(input.xp) || input.xp < 1 || input.xp > 100) return Promise.resolve(false);
      addXp(userId, { eventId: null, source: input.source, sourceKey: input.key, xp: input.xp, day: input.day, weekStart: input.weekStart, feature: null });
      return Promise.resolve(true);
    },
    days: (userId, from, to) => Promise.resolve([...days.values()].filter((day) => day.userId === userId && day.day >= from && day.day <= to).sort((a, b) => a.day.localeCompare(b.day)).map(({ userId: _u, ...rest }) => clone(rest))),
    allDays: (userId) => Promise.resolve([...days.values()].filter((day) => day.userId === userId).sort((a, b) => a.day.localeCompare(b.day)).map(({ userId: _u, ...rest }) => clone(rest))),
    totalXp: (userId) => Promise.resolve(xp.filter((row) => row.userId === userId).reduce((sum, row) => sum + row.xp, 0)),
    xpSince: (userId, since) => Promise.resolve(clone(xp.filter((row) => row.userId === userId && row.day >= since))),
    events: (userId, since, until, limit = 2000) => Promise.resolve(clone(eventLog.filter((event) => event.userId === userId && Date.parse(event.createdAt) >= since.getTime() && Date.parse(event.createdAt) <= until.getTime()).slice(-limit))),
    eventsByRef: (prefix, since, until, limit = 5000) => Promise.resolve(clone(eventLog.filter((event) => event.verified && (event.ref ?? '').startsWith(prefix) && Date.parse(event.createdAt) >= since.getTime() && Date.parse(event.createdAt) <= until.getTime()).slice(-limit))),
    eventsOf: (userIds, since, until, limit = 5000) => Promise.resolve(clone(verifiedIn(new Set(userIds), since, until).slice(-limit))),
    dayTotals(userIds, from, to) {
      const set = new Set(userIds);
      return Promise.resolve([...days.values()].filter((day) => set.has(day.userId) && day.day >= from && day.day <= to).map((day) => clone(day)));
    },

    // --- Freezes ------------------------------------------------------------------------------
    freezeBuys: (userId) => Promise.resolve(clone(freezes.filter((row) => row.userId === userId && row.status === 'paid'))),
    reserveFreeze(userId, input) {
      // A pending reservation with the same reference is resumed (the charge is idempotent on it).
      const pending = freezes.find((row) => row.reference === input.reference && row.status === 'pending');
      if (pending) return Promise.resolve(clone(pending));
      if (freezes.some((row) => row.userId === userId && row.weekStart === input.weekStart) || freezes.some((row) => row.reference === input.reference)) return Promise.resolve(null);
      const row: FreezeBuy = { id: id(), userId, ...input, status: 'pending', createdAt: iso() };
      freezes.push(row);
      return Promise.resolve(clone(row));
    },
    confirmFreeze(freezeId) { const row = freezes.find((entry) => entry.id === freezeId); if (row) row.status = 'paid'; return Promise.resolve(); },
    cancelFreeze(freezeId) { const index = freezes.findIndex((entry) => entry.id === freezeId && entry.status === 'pending'); if (index >= 0) freezes.splice(index, 1); return Promise.resolve(); },

    // --- Leagues ---------------------------------------------------------------------------------
    leagueMember(userId, week) {
      const member = members.find((m) => m.userId === userId && m.weekStart === week);
      return Promise.resolve(member ? clone({ ...member, group: groups.get(member.groupId)! }) : null);
    },
    previousMembership(userId, beforeWeek) {
      const previous = members.filter((m) => m.userId === userId && m.weekStart < beforeWeek).sort((a, b) => b.weekStart.localeCompare(a.weekStart))[0];
      return Promise.resolve(previous ? clone(previous) : null);
    },
    leagueJoin(userId, week, tier, band) {
      const existing = members.find((m) => m.userId === userId && m.weekStart === week);
      if (existing) return Promise.resolve(clone({ ...existing, group: groups.get(existing.groupId)! }));
      const open = [...groups.values()].filter((g) => g.weekStart === week && g.tier === tier && g.band === band && !g.finalizedAt && members.filter((m) => m.groupId === g.id).length < LEAGUE_GROUP_SIZE);
      let group = open[0];
      if (!group) { group = { id: id(), weekStart: week, tier, band, finalizedAt: null }; groups.set(group.id, group); }
      const weekXp = xp.filter((row) => row.userId === userId && row.weekStart === week).reduce((sum, row) => sum + row.xp, 0);
      const member: LeagueMember = { groupId: group.id, userId, weekStart: week, tier, joinedAt: iso(), xp: weekXp, finalRank: null, outcome: null };
      members.push(member);
      return Promise.resolve(clone({ ...member, group }));
    },
    groupMembers: (groupId) => Promise.resolve(clone(members.filter((m) => m.groupId === groupId))),
    settleGroup(groupId, standings) {
      const group = groups.get(groupId);
      if (!group || group.finalizedAt) return Promise.resolve(false);
      group.finalizedAt = iso();
      for (const row of standings) {
        const member = members.find((m) => m.groupId === groupId && m.userId === row.userId);
        if (member) { member.finalRank = row.rank; member.outcome = row.outcome; }
      }
      return Promise.resolve(true);
    },

    // --- Journeys, path, dates ----------------------------------------------------------------------
    journeys: (userId) => Promise.resolve(clone(journeys.filter((row) => row.userId === userId))),
    startJourney(userId, input) {
      const existing = journeys.find((row) => row.userId === userId && row.journeyKey === input.journeyKey && (row.status === 'active' || row.status === 'paused'));
      if (existing) return Promise.resolve(clone(existing));
      const row: JourneyRow = { id: id(), userId, journeyKey: input.journeyKey, status: 'active', startedOn: input.startedOn, targetDate: input.targetDate, completed: [], graduatedAt: null, createdAt: iso(), updatedAt: iso() };
      journeys.push(row);
      return Promise.resolve(clone(row));
    },
    updateJourney(journeyId, patch, expectCompleted) {
      const row = journeys.find((entry) => entry.id === journeyId);
      if (!row || (expectCompleted !== undefined && (row.completed.length !== expectCompleted || row.status !== 'active'))) return Promise.resolve(null);
      Object.assign(row, clone(patch), { updatedAt: iso() });
      return Promise.resolve(clone(row));
    },
    goals: (userId) => Promise.resolve(clone(goals.filter((row) => row.userId === userId))),
    ensureGoal(userId, goalKey, status) {
      let row = goals.find((entry) => entry.userId === userId && entry.goalKey === goalKey);
      if (!row) { row = { id: id(), userId, goalKey, status, doneBy: null, outcome: {}, createdAt: iso(), doneAt: null }; goals.push(row); }
      return Promise.resolve(clone(row));
    },
    updateGoal(userId, goalKey, patch, from) {
      const row = goals.find((entry) => entry.userId === userId && entry.goalKey === goalKey);
      if (!row || (from && !from.includes(row.status))) return Promise.resolve(null);
      Object.assign(row, clone(patch));
      return Promise.resolve(clone(row));
    },
    dates: (userId) => Promise.resolve(clone(dateRows.filter((row) => row.userId === userId).sort((a, b) => a.onDate.localeCompare(b.onDate)))),
    addDate(input) { const row: DateRow = { ...input, id: id(), done: false, result: null, createdAt: iso() }; dateRows.push(row); return Promise.resolve(clone(row)); },
    updateDate(userId, dateId, patch) {
      const row = dateRows.find((entry) => entry.id === dateId && entry.userId === userId);
      if (!row) return Promise.resolve(null);
      Object.assign(row, patch);
      return Promise.resolve(clone(row));
    },
    deleteDate(userId, dateId) {
      const index = dateRows.findIndex((entry) => entry.id === dateId && entry.userId === userId);
      if (index < 0) return Promise.resolve(false);
      dateRows.splice(index, 1);
      return Promise.resolve(true);
    },

    // --- Squads -------------------------------------------------------------------------------------------
    squadOf(userId) {
      const member = squadMembers.find((m) => m.userId === userId && !m.leftAt);
      const squad = member ? squads.get(member.squadId) : undefined;
      return Promise.resolve(squad && !squad.archivedAt ? clone(squad) : null);
    },
    squad: (squadId) => Promise.resolve(squads.has(squadId) ? clone(squads.get(squadId)!) : null),
    squadByCode: (code) => Promise.resolve(clone([...squads.values()].find((squad) => squad.inviteCode === code) ?? null)),
    createSquad(input) {
      if (squadMembers.some((m) => m.userId === input.ownerId && !m.leftAt && !squads.get(m.squadId)?.archivedAt)) return Promise.resolve({ error: 'already_in_squad' as const });
      const squad: SquadRow = { id: id(), name: input.name, ownerId: input.ownerId, inviteCode: input.inviteCode, weeklyGoalMinutes: input.weeklyGoalMinutes, createdAt: iso(), archivedAt: null };
      squads.set(squad.id, squad);
      squadMembers.push({ squadId: squad.id, userId: input.ownerId, role: 'owner', joinedAt: iso(), leftAt: null, referralCode: input.referralCode });
      return Promise.resolve(clone(squad));
    },
    joinSquad(squadId, userId, max, referralCode) {
      const squad = squads.get(squadId);
      if (!squad || squad.archivedAt) return Promise.resolve({ ok: false as const, reason: 'archived' as const });
      if (squadMembers.some((m) => m.userId === userId && !m.leftAt && m.squadId === squadId)) return Promise.resolve({ ok: true as const });
      if (squadMembers.some((m) => m.userId === userId && !m.leftAt && !squads.get(m.squadId)?.archivedAt)) return Promise.resolve({ ok: false as const, reason: 'already_in_squad' as const });
      if (squadMembers.filter((m) => m.squadId === squadId && !m.leftAt).length >= max) return Promise.resolve({ ok: false as const, reason: 'full' as const });
      const previous = squadMembers.find((m) => m.squadId === squadId && m.userId === userId);
      if (previous) Object.assign(previous, { leftAt: null, joinedAt: iso(), role: 'member', referralCode });
      else squadMembers.push({ squadId, userId, role: 'member', joinedAt: iso(), leftAt: null, referralCode });
      return Promise.resolve({ ok: true as const });
    },
    leaveSquad(squadId, userId) {
      const member = squadMembers.find((m) => m.squadId === squadId && m.userId === userId && !m.leftAt);
      if (member) member.leftAt = iso();
      const squad = squads.get(squadId), rest = squadMembers.filter((m) => m.squadId === squadId && !m.leftAt);
      if (squad && !rest.length) squad.archivedAt = iso();
      else if (squad && squad.ownerId === userId && rest[0]) { squad.ownerId = rest[0].userId; rest[0].role = 'owner'; }
      return Promise.resolve();
    },
    squadMembers: (squadId) => Promise.resolve(clone(squadMembers.filter((m) => m.squadId === squadId && !m.leftAt))),
    updateSquad(squadId, patch) {
      const squad = squads.get(squadId);
      if (!squad) return Promise.resolve(null);
      Object.assign(squad, patch);
      return Promise.resolve(clone(squad));
    },

    // --- Stories ------------------------------------------------------------------------------------------------
    storyProgress: (userId) => Promise.resolve(clone(stories.filter((row) => row.userId === userId))),
    saveStoryProgress(row) {
      const index = stories.findIndex((entry) => entry.userId === row.userId && entry.arcKey === row.arcKey);
      if (index >= 0) stories[index] = clone(row); else stories.push(clone(row));
      return Promise.resolve();
    },
    storyResults: (userId, arcKey) => Promise.resolve(clone(storyResults.filter((row) => row.userId === userId && (!arcKey || row.arcKey === arcKey)))),
    addStoryResult(input) {
      const firstPass = input.passed && !storyResults.some((row) => row.userId === input.userId && row.arcKey === input.arcKey && row.episodeKey === input.episodeKey && row.passed);
      const row: StoryResult = { ...input, id: id(), createdAt: iso() };
      storyResults.push(row);
      return Promise.resolve({ row: clone(row), firstPass });
    },
    storyEpisode: (userId, arcKey, episodeKey) => Promise.resolve(clone(episodes.find((row) => row.userId === userId && row.arcKey === arcKey && row.episodeKey === episodeKey) ?? null)),
    saveStoryEpisode(row) {
      const existing = episodes.find((entry) => entry.userId === row.userId && entry.arcKey === row.arcKey && entry.episodeKey === row.episodeKey);
      if (existing) return Promise.resolve(clone(existing));
      const stored = { ...clone(row), createdAt: iso() };
      episodes.push(stored);
      return Promise.resolve(clone(stored));
    },

    // --- Passport -------------------------------------------------------------------------------------------------
    passport: (userId) => Promise.resolve(clone(passports.get(userId) ?? { userId, displayName: null, headline: null, updatedAt: null })),
    savePassport(userId, patch) {
      const next = { ...(passports.get(userId) ?? { userId, displayName: null, headline: null, updatedAt: null }), ...patch, updatedAt: iso() };
      passports.set(userId, next);
      return Promise.resolve(clone(next));
    },
    passportItems: (userId) => Promise.resolve(clone(items.filter((row) => row.userId === userId))),
    upsertPassportItem(input) {
      const existing = items.find((row) => row.userId === input.userId && row.source === input.source && row.sourceRef === input.sourceRef);
      if (existing) { Object.assign(existing, { ...clone(input), shown: existing.shown }); return Promise.resolve(clone(existing)); }
      const row: PassportItem = { ...clone(input), shown: input.shown ?? false, id: id(), createdAt: iso() };
      items.push(row);
      return Promise.resolve(clone(row));
    },
    setItemShown(userId, itemId, shown) {
      const row = items.find((entry) => entry.id === itemId && entry.userId === userId);
      if (!row) return Promise.resolve(null);
      row.shown = shown;
      return Promise.resolve(clone(row));
    },
    passportLinks: (userId) => Promise.resolve(clone(links.filter((row) => row.userId === userId))),
    createPassportLink(input) { const row: PassportLink = { ...clone(input), id: id(), createdAt: iso(), revokedAt: null, views: 0, lastViewedAt: null }; links.push(row); return Promise.resolve(clone(row)); },
    revokePassportLink(userId, linkId, at) {
      const row = links.find((entry) => entry.id === linkId && entry.userId === userId && !entry.revokedAt);
      if (!row) return Promise.resolve(false);
      row.revokedAt = at;
      return Promise.resolve(true);
    },
    passportLinkByHash: (hash) => Promise.resolve(clone(links.find((row) => row.tokenHash === hash) ?? null)),
    touchPassportLink(linkId, at) { const row = links.find((entry) => entry.id === linkId); if (row) { row.views += 1; row.lastViewedAt = at; } return Promise.resolve(); },

    // --- Samples ---------------------------------------------------------------------------------------------------------
    samples: (userId) => Promise.resolve(clone(samples.filter((row) => row.userId === userId && !row.deletedAt))),
    sample: (sampleId) => Promise.resolve(clone(samples.find((row) => row.id === sampleId) ?? null)),
    addSample(input) {
      if (input.sourceRef) {
        const existing = samples.find((row) => row.userId === input.userId && row.source === input.source && row.sourceRef === input.sourceRef);
        if (existing) return Promise.resolve(clone(existing));
      }
      const row: SampleRow = { ...clone(input), id: id(), deletedAt: null };
      samples.push(row);
      return Promise.resolve(clone(row));
    },
    deleteSample(userId, sampleId, at) {
      const row = samples.find((entry) => entry.id === sampleId && entry.userId === userId && !entry.deletedAt);
      if (!row) return Promise.resolve(null);
      row.deletedAt = at;
      return Promise.resolve(clone(row));
    },

    // --- Certificates -------------------------------------------------------------------------------------------------------
    sittings: (userId) => Promise.resolve(clone(sittings.filter((row) => row.userId === userId))),
    sitting: (sittingId) => Promise.resolve(clone(sittings.find((row) => row.id === sittingId) ?? null)),
    createSitting(input) {
      const existing = sittings.find((row) => row.entitlementRef === input.entitlementRef);
      if (existing) return Promise.resolve({ row: clone(existing), created: false });
      const row: SittingRow = { ...input, id: id(), status: 'started', submittedAt: null, answers: {}, responses: {}, autoScore: null, autoTotal: null, review: null, integrity: {}, lastHeartbeatAt: null, reviewerId: null, decidedAt: null, certificateId: null };
      sittings.push(row);
      return Promise.resolve({ row: clone(row), created: true });
    },
    usedEntitlements: (userId) => Promise.resolve(sittings.filter((row) => row.userId === userId).map((row) => row.entitlementRef)),
    updateSitting(sittingId, patch, from) {
      const row = sittings.find((entry) => entry.id === sittingId);
      if (!row || !from.includes(row.status)) return Promise.resolve(null);
      Object.assign(row, clone(patch));
      return Promise.resolve(clone(row));
    },
    addSignals(rows) {
      let added = 0;
      for (const row of rows) if (!signals.some((entry) => entry.sittingId === row.sittingId && entry.stream === row.stream && entry.seq === row.seq)) { signals.push(clone(row)); added += 1; }
      return Promise.resolve(added);
    },
    signals: (sittingId) => Promise.resolve(clone(signals.filter((row) => row.sittingId === sittingId).sort((a, b) => a.at.localeCompare(b.at) || a.seq - b.seq))),
    reviewQueue: (limit) => Promise.resolve(clone(sittings.filter((row) => row.status === 'submitted').sort((a, b) => (a.submittedAt ?? '').localeCompare(b.submittedAt ?? '')).slice(0, limit))),
    issueCertificate(input) {
      const existing = certificates.find((row) => row.sittingId && row.sittingId === input.sittingId);
      if (existing) return Promise.resolve(clone(existing));
      const row: CertificateRow = { ...input, id: id(), revokedAt: null };
      certificates.push(row);
      return Promise.resolve(clone(row));
    },
    certificateByCode: (code) => Promise.resolve(clone(certificates.find((row) => row.code === code) ?? null)),
    certificates: (userId) => Promise.resolve(clone(certificates.filter((row) => row.userId === userId))),
    revokeCertificate(certificateId, at) {
      const row = certificates.find((entry) => entry.id === certificateId && !entry.revokedAt);
      if (!row) return Promise.resolve(false);
      row.revokedAt = at;
      return Promise.resolve(true);
    },

    // --- Talent pool ----------------------------------------------------------------------------------------------------------
    talentProfile: (userId) => Promise.resolve(clone(talent.get(userId) ?? null)),
    saveTalentProfile(userId, patch) {
      const base: TalentProfile = talent.get(userId) ?? { userId, candidateKey: null, consentVersion: null, consentedAt: null, withdrawnAt: null, headline: null, skills: [], openTo: [], regions: [], passportLinkId: null, updatedAt: null };
      const next = { ...base, ...clone(patch), userId, updatedAt: iso() };
      talent.set(userId, next);
      return Promise.resolve(clone(next));
    },
    talentByKey: (key) => Promise.resolve(clone([...talent.values()].find((row) => row.candidateKey === key) ?? null)),
    talentSeenBy: (userId, limit) => Promise.resolve(clone(audit.filter((row) => row.targetUserId === userId).slice(-limit).reverse())),
    talentEmployer: (userId) => Promise.resolve(clone(employers.get(userId) ?? null)),
    saveTalentEmployer(row) { const stored = { ...clone(row), createdAt: employers.get(row.userId)?.createdAt ?? iso() }; employers.set(row.userId, stored); return Promise.resolve(clone(stored)); },
    searchTalent(filter) {
      const rows = [...talent.values()].filter((row) => row.consentedAt && !row.withdrawnAt
        && (!filter.skill || row.skills.includes(filter.skill)) && (!filter.region || row.regions.includes(filter.region)) && (!filter.openTo || row.openTo.includes(filter.openTo)));
      return Promise.resolve(clone(rows.slice(0, filter.limit)));
    },
    addTalentAudit(row) { audit.push({ ...clone(row), createdAt: iso() }); return Promise.resolve(); },
    talentAudit: (employerId, limit) => Promise.resolve(clone(audit.filter((row) => row.employerId === employerId).slice(-limit).reverse())),

    // --- Events ------------------------------------------------------------------------------------------------------------------
    sponsors: (keys) => Promise.resolve(clone(keys.map((key) => sponsors.get(key)).filter((row): row is EventSponsor => !!row))),
    saveSponsor(row) { const stored = { ...clone(row), updatedAt: iso() }; sponsors.set(row.eventKey, stored); return Promise.resolve(clone(stored)); },
    eventEntries: (eventKey) => Promise.resolve(clone(entries.filter((row) => row.eventKey === eventKey).map(({ userId, joinedAt }) => ({ userId, joinedAt })))),
    joinEvent(eventKey, userId) {
      if (entries.some((row) => row.eventKey === eventKey && row.userId === userId)) return Promise.resolve(false);
      entries.push({ eventKey, userId, joinedAt: iso() });
      return Promise.resolve(true);
    },
    joinedEvents: (userId) => Promise.resolve(entries.filter((row) => row.userId === userId).map((row) => row.eventKey)),

    // --- Boards --------------------------------------------------------------------------------------------------------------------
    async board(scope, value, week, limit) {
      const totals = new Map<string, number>();
      for (const row of xp) if (row.weekStart === week) totals.set(row.userId, (totals.get(row.userId) ?? 0) + row.xp);
      const out: BoardRow[] = [];
      for (const [userId, total] of totals) {
        if (total <= 0) continue;
        const profile = profileOf(userId);
        if (scope === 'region' && profile.region !== value) continue;
        if (scope === 'school' && profile.school !== value) continue;
        if (scope === 'centre') {
          const member = value ? await core.membership(value, userId) : null;
          if (!member || member.status !== 'active' || member.role !== 'student') continue;
        }
        out.push({ userId, xp: total });
      }
      return out.sort((a, b) => b.xp - a.xp || a.userId.localeCompare(b.userId)).slice(0, limit);
    },
    async centreBoard(week, minActive, limit) {
      const out: CentreBoardRow[] = [];
      for (const workspaceId of centreLeague) {
        const workspace = await core.workspace(workspaceId);
        if (!workspace || workspace.status !== 'active') continue;
        let active = 0, total = 0;
        const totals = new Map<string, number>();
        for (const row of xp) if (row.weekStart === week) totals.set(row.userId, (totals.get(row.userId) ?? 0) + row.xp);
        for (const [userId, sum] of totals) {
          const member = await core.membership(workspaceId, userId);
          if (member?.status === 'active' && member.role === 'student' && sum > 0) { active += 1; total += sum; }
        }
        if (active >= minActive) out.push({ workspaceId, name: workspace.name, active, xp: total });
      }
      return out.sort((a, b) => b.xp / b.active - a.xp / a.active).slice(0, limit);
    },
    centreLeague: (workspaceId) => Promise.resolve(centreLeague.has(workspaceId)),
    setCentreLeague(workspaceId, optIn) { if (optIn) centreLeague.add(workspaceId); else centreLeague.delete(workspaceId); return Promise.resolve(); },

    // --- Outbox ----------------------------------------------------------------------------------------------------------------------
    enqueue(rows) {
      let added = 0;
      for (const row of rows) {
        if (outboxRows.some((entry) => entry.dedupeKey === row.dedupeKey)) continue;
        outboxRows.push({ ...clone(row), id: id(), status: 'queued', claimToken: null, attempts: 0, reason: null, createdAt: iso(), sentAt: null });
        added += 1;
      }
      return Promise.resolve(added);
    },
    claim(userId, channel, at, limit) {
      const due = outboxRows.filter((row) => row.userId === userId && row.channel === channel && row.status === 'queued' && Date.parse(row.dueAt) <= at.getTime());
      for (const row of due) if (Date.parse(row.expiresAt) <= at.getTime()) { row.status = 'expired'; row.reason = 'expired'; }
      const live = due.filter((row) => row.status === 'queued').sort((a, b) => b.priority - a.priority || a.dueAt.localeCompare(b.dueAt)).slice(0, limit);
      for (const row of live) { row.status = 'claimed'; row.claimToken = crypto.randomUUID(); row.attempts += 1; }
      return Promise.resolve(clone(live));
    },
    release(rowId, token, dueAt, reason) {
      const row = outboxRows.find((entry) => entry.id === rowId && entry.status === 'claimed' && entry.claimToken === token);
      if (row) Object.assign(row, { status: 'queued', claimToken: null, dueAt, reason });
      return Promise.resolve();
    },
    finish(rowId, token, status, at, reason = null) {
      const row = outboxRows.find((entry) => entry.id === rowId && entry.status === 'claimed' && entry.claimToken === token);
      if (!row) return Promise.resolve(false);
      Object.assign(row, { status, sentAt: status === 'sent' ? at : null, reason });
      return Promise.resolve(true);
    },
    outbox: (userId, options) => Promise.resolve(clone(outboxRows.filter((row) => row.userId === userId && (!options.channel || row.channel === options.channel) && (!options.statuses || options.statuses.includes(row.status)) && (!options.since || row.createdAt >= options.since)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, options.limit))),
    async dueUsers(at, limit) {
      const known = new Set([...profiles.keys(), ...eventLog.map((event) => event.userId)]);
      const out: { userId: string; chatId: string }[] = [];
      for (const userId of known) {
        if (out.length >= limit) break;
        const profile = profileOf(userId), local = localParts(at, profile.timeZone);
        if (profile.messages === 'none' || local.hour < profile.notifyHour || inQuietHours(local.hour)) continue;
        const key = `${userId}:${local.day}`;
        if (ticks.has(key)) continue;
        const chat = (await core.profile(userId))?.telegramChatId;
        if (!chat) continue;
        ticks.add(key);
        out.push({ userId, chatId: chat });
      }
      return out;
    },
    offerDismissals: (userId) => Promise.resolve(dismissals.filter((row) => row.userId === userId).map((row) => row.key)),
    dismissOffer(userId, key) { if (!dismissals.some((row) => row.userId === userId && row.key === key)) dismissals.push({ userId, key }); return Promise.resolve(); },
  };
  return repo;
}
