import type {
  BoardRow, CentreBoardRow, CertificateRow, DateRow, DayRow, EngageProfile, EventRow, EventSponsor, FreezeBuy, GoalRow, IngestResult,
  JourneyRow, LeagueGroup, LeagueMember, LeagueTierName, LevelBand, OutboxRow, OutboxStatus, PassportItem, PassportLink, PassportRow, SampleRow, SittingRow,
  SittingSignal, SquadMember, SquadRow, StoryEpisodeCache, StoryProgress, StoryResult, TalentAudit, TalentEmployer, TalentProfile, XpRow,
} from './types.ts';

// Every read and write of the engage area. repository.ts implements it on Postgres
// (concurrency-critical writes go through the SECURITY DEFINER functions of
// 20261030800000_schood_ai_engage.sql); memory.ts mirrors it for tests and the dev
// stack with the same locking rules.

export type ProfilePatch = Partial<Omit<EngageProfile, 'userId' | 'birthDate' | 'createdAt'>>;

export interface EngageRepository {
  // --- Profile and settings ---------------------------------------------------------
  profile(userId: string): Promise<EngageProfile>;
  /** Engage profiles of several people (defaults for those without one). */
  profiles(userIds: string[]): Promise<Map<string, EngageProfile>>;
  /** Display names from users.full_name (never emails). */
  names(userIds: string[]): Promise<Map<string, string | null>>;
  saveProfile(userId: string, patch: ProfilePatch): Promise<EngageProfile>;
  /** Sets the birth date once; returns false when one is already set. */
  setBirthDate(userId: string, date: string): Promise<boolean>;
  /** Clears a birth date (Schood support, for a correction). */
  clearBirthDate(userId: string): Promise<void>;

  // --- Verified learning → XP ------------------------------------------------------------
  /** Turns the person's verified learning events not yet counted into XP, once each, under a per-person lock. */
  ingest(userId: string, now: Date): Promise<IngestResult>;
  /** The same for several people at once (a squad, a league group) before showing them together. */
  ingestMany(userIds: string[], now: Date): Promise<void>;
  /** A quest or challenge bonus, at most once per key. */
  awardBonus(userId: string, input: { source: 'quest' | 'challenge'; key: string; xp: number; day: string; weekStart: string }): Promise<boolean>;
  days(userId: string, from: string, to: string): Promise<DayRow[]>;
  allDays(userId: string): Promise<DayRow[]>;
  totalXp(userId: string): Promise<number>;
  xpSince(userId: string, since: string): Promise<XpRow[]>;
  /** Learning events of a person from `since` up to and including `until`, oldest first (verified and not). */
  events(userId: string, since: Date, until: Date, limit?: number): Promise<EventRow[]>;
  /** Verified events whose ref starts with a prefix (the national mock), across people. */
  eventsByRef(prefix: string, since: Date, until: Date, limit?: number): Promise<EventRow[]>;
  /** Verified events of several people (squads, tournaments). */
  eventsOf(userIds: string[], since: Date, until: Date, limit?: number): Promise<EventRow[]>;
  /** Verified minutes and XP per person in a range of local days (squad goals, parent usage). */
  dayTotals(userIds: string[], from: string, to: string): Promise<{ userId: string; day: string; xp: number; minutes: number; events: number }[]>;

  // --- Streak freezes ---------------------------------------------------------------------
  freezeBuys(userId: string): Promise<FreezeBuy[]>;
  /** Reserves a purchase (one per league week); null when the week already has a paid one. A pending one with the same reference is resumed. */
  reserveFreeze(userId: string, input: { day: string; weekStart: string; reference: string; credits: number }): Promise<FreezeBuy | null>;
  confirmFreeze(id: string): Promise<void>;
  cancelFreeze(id: string): Promise<void>;

  // --- Leagues --------------------------------------------------------------------------------
  leagueMember(userId: string, weekStart: string): Promise<(LeagueMember & { group: LeagueGroup }) | null>;
  /** The person's latest membership before a week, for their tier. */
  previousMembership(userId: string, beforeWeek: string): Promise<LeagueMember | null>;
  /** Joins the oldest group of that week, tier and band with room (30), or a new one. Idempotent. */
  leagueJoin(userId: string, weekStart: string, tier: LeagueTierName, band: LevelBand): Promise<LeagueMember & { group: LeagueGroup }>;
  groupMembers(groupId: string): Promise<LeagueMember[]>;
  /** Writes final ranks once; false when another request already settled the group. */
  settleGroup(groupId: string, standings: { userId: string; rank: number; xp: number; outcome: 'promoted' | 'stayed' | 'demoted' }[]): Promise<boolean>;
  /** Groups of weeks before `beforeWeek` not settled yet, oldest first (the weekly rollover). */
  unsettledGroups(beforeWeek: string, limit: number): Promise<LeagueGroup[]>;

  // --- Journeys, lifetime path, dated goals ------------------------------------------------------
  journeys(userId: string): Promise<JourneyRow[]>;
  startJourney(userId: string, input: { journeyKey: string; startedOn: string; targetDate: string | null }): Promise<JourneyRow>;
  /** Updates only while the row still has `expectCompleted` chapters done (optimistic). */
  updateJourney(id: string, patch: Partial<Pick<JourneyRow, 'status' | 'completed' | 'graduatedAt' | 'targetDate'>>, expectCompleted?: number): Promise<JourneyRow | null>;
  goals(userId: string): Promise<GoalRow[]>;
  /** Creates the goal if it is new; an existing goal keeps its status. */
  ensureGoal(userId: string, goalKey: string, status: GoalRow['status']): Promise<GoalRow>;
  updateGoal(userId: string, goalKey: string, patch: Partial<Pick<GoalRow, 'status' | 'doneBy' | 'outcome' | 'doneAt'>>, from?: GoalRow['status'][]): Promise<GoalRow | null>;
  dates(userId: string): Promise<DateRow[]>;
  addDate(input: Omit<DateRow, 'id' | 'createdAt' | 'done' | 'result'>): Promise<DateRow>;
  updateDate(userId: string, id: string, patch: Partial<Pick<DateRow, 'done' | 'result' | 'title' | 'onDate' | 'atTime'>>): Promise<DateRow | null>;
  deleteDate(userId: string, id: string): Promise<boolean>;

  // --- Squads ------------------------------------------------------------------------------------
  squadOf(userId: string): Promise<SquadRow | null>;
  squad(id: string): Promise<SquadRow | null>;
  squadByCode(code: string): Promise<SquadRow | null>;
  createSquad(input: { name: string; ownerId: string; inviteCode: string; weeklyGoalMinutes: number; referralCode: string | null }): Promise<SquadRow | { error: 'already_in_squad' }>;
  /** Joins under a lock: at most `max` active members and one active squad per person. */
  joinSquad(squadId: string, userId: string, max: number, referralCode: string | null): Promise<{ ok: true } | { ok: false; reason: 'full' | 'already_in_squad' | 'archived' }>;
  leaveSquad(squadId: string, userId: string): Promise<void>;
  squadMembers(squadId: string): Promise<SquadMember[]>;
  updateSquad(id: string, patch: Partial<Pick<SquadRow, 'weeklyGoalMinutes' | 'name' | 'archivedAt' | 'ownerId'>>): Promise<SquadRow | null>;

  // --- Story mode ----------------------------------------------------------------------------------
  storyProgress(userId: string): Promise<StoryProgress[]>;
  saveStoryProgress(row: StoryProgress): Promise<void>;
  storyResults(userId: string, arcKey?: string): Promise<StoryResult[]>;
  /** Records an attempt; `firstPass` is true only for the first passed attempt of that episode. */
  addStoryResult(input: Omit<StoryResult, 'id' | 'createdAt'>): Promise<{ row: StoryResult; firstPass: boolean }>;
  storyEpisode(userId: string, arcKey: string, episodeKey: string): Promise<StoryEpisodeCache | null>;
  /** Keeps the first stored episode; returns the one that is stored. */
  saveStoryEpisode(row: Omit<StoryEpisodeCache, 'createdAt'>): Promise<StoryEpisodeCache>;

  // --- Skill Passport ---------------------------------------------------------------------------------
  passport(userId: string): Promise<PassportRow>;
  savePassport(userId: string, patch: Partial<Pick<PassportRow, 'displayName' | 'headline'>>): Promise<PassportRow>;
  passportItems(userId: string): Promise<PassportItem[]>;
  /** Inserts or refreshes by (source, sourceRef); keeps the person's `shown` choice. */
  upsertPassportItem(input: Omit<PassportItem, 'id' | 'createdAt' | 'shown'> & { shown?: boolean }): Promise<PassportItem>;
  setItemShown(userId: string, id: string, shown: boolean): Promise<PassportItem | null>;
  passportLinks(userId: string): Promise<PassportLink[]>;
  createPassportLink(input: Omit<PassportLink, 'id' | 'createdAt' | 'revokedAt' | 'views' | 'lastViewedAt'>): Promise<PassportLink>;
  revokePassportLink(userId: string, id: string, at: string): Promise<boolean>;
  passportLinkByHash(tokenHash: string): Promise<PassportLink | null>;
  touchPassportLink(id: string, at: string): Promise<void>;

  // --- Then vs now samples ------------------------------------------------------------------------------
  samples(userId: string): Promise<SampleRow[]>;
  sample(id: string): Promise<SampleRow | null>;
  /** Inserts once per (source, sourceRef) when a source ref is given. */
  addSample(input: Omit<SampleRow, 'id' | 'deletedAt'>): Promise<SampleRow>;
  deleteSample(userId: string, id: string, at: string): Promise<SampleRow | null>;

  // --- Skill Certificates -----------------------------------------------------------------------------------
  sittings(userId: string): Promise<SittingRow[]>;
  sitting(id: string): Promise<SittingRow | null>;
  /** One sitting per purchased reference; returns the existing one for a repeat. */
  createSitting(input: Pick<SittingRow, 'userId' | 'examKey' | 'entitlementRef' | 'startedAt' | 'deadlineAt'>): Promise<{ row: SittingRow; created: boolean }>;
  usedEntitlements(userId: string): Promise<string[]>;
  /** Updates only while the sitting is in one of `from`. */
  updateSitting(id: string, patch: Partial<SittingRow>, from: SittingRow['status'][]): Promise<SittingRow | null>;
  /** Stores signals once per (stream, sequence); returns how many were new. */
  addSignals(rows: SittingSignal[]): Promise<number>;
  signals(sittingId: string): Promise<SittingSignal[]>;
  reviewQueue(limit: number): Promise<SittingRow[]>;
  issueCertificate(input: Omit<CertificateRow, 'id' | 'revokedAt'>): Promise<CertificateRow>;
  certificateByCode(code: string): Promise<CertificateRow | null>;
  certificates(userId: string): Promise<CertificateRow[]>;
  revokeCertificate(id: string, at: string): Promise<boolean>;

  // --- Talent pool --------------------------------------------------------------------------------------------
  talentProfile(userId: string): Promise<TalentProfile | null>;
  saveTalentProfile(userId: string, patch: Partial<Omit<TalentProfile, 'userId'>>): Promise<TalentProfile>;
  talentByKey(candidateKey: string): Promise<TalentProfile | null>;
  /** Employer actions that concern this person, newest first (they can see who found them). */
  talentSeenBy(userId: string, limit: number): Promise<TalentAudit[]>;
  talentEmployer(userId: string): Promise<TalentEmployer | null>;
  saveTalentEmployer(row: Omit<TalentEmployer, 'createdAt'>): Promise<TalentEmployer>;
  /** Consenting, not withdrawn, matching filters. Age is filtered by the caller as well. */
  searchTalent(filter: { skill?: string; region?: string; openTo?: string; limit: number }): Promise<TalentProfile[]>;
  addTalentAudit(row: Omit<TalentAudit, 'createdAt'>): Promise<void>;
  talentAudit(employerId: string, limit: number): Promise<TalentAudit[]>;

  // --- Seasons and live events ------------------------------------------------------------------------------------
  sponsors(eventKeys: string[]): Promise<EventSponsor[]>;
  saveSponsor(row: Omit<EventSponsor, 'updatedAt'>): Promise<EventSponsor>;
  eventEntries(eventKey: string): Promise<{ userId: string; joinedAt: string }[]>;
  joinEvent(eventKey: string, userId: string): Promise<boolean>;
  joinedEvents(userId: string): Promise<string[]>;

  // --- Leaderboards ---------------------------------------------------------------------------------------------------
  /** Week XP for people in a region, a school or a centre workspace (students). */
  board(scope: 'region' | 'school' | 'centre' | 'national', value: string | null, weekStart: string, limit: number): Promise<BoardRow[]>;
  /** Opted-in centres: active learners this week and their XP. */
  centreBoard(weekStart: string, minActive: number, limit: number): Promise<CentreBoardRow[]>;
  centreLeague(workspaceId: string): Promise<boolean>;
  setCentreLeague(workspaceId: string, optIn: boolean, actor: string): Promise<void>;

  // --- Outbox and web inbox --------------------------------------------------------------------------------------------
  /** Queues messages; a repeated dedupe key is ignored. Returns how many were new. */
  enqueue(rows: Omit<OutboxRow, 'id' | 'status' | 'claimToken' | 'attempts' | 'reason' | 'createdAt' | 'sentAt'>[]): Promise<number>;
  /** Moves due rows from queued to claimed (each row once, highest priority first). */
  claim(userId: string, channel: OutboxRow['channel'], now: Date, limit: number): Promise<OutboxRow[]>;
  /** Puts a claimed row back (budget said no) until `dueAt`. */
  release(id: string, claimToken: string, dueAt: string, reason: string): Promise<void>;
  finish(id: string, claimToken: string, status: Extract<OutboxStatus, 'sent' | 'failed' | 'skipped'>, at: string, reason?: string | null): Promise<boolean>;
  outbox(userId: string, options: { channel?: OutboxRow['channel']; statuses?: OutboxStatus[]; since?: string; limit: number }): Promise<OutboxRow[]>;
  /** People due for their daily planning run on Telegram: chosen hour reached today and not yet planned. */
  dueUsers(now: Date, limit: number): Promise<{ userId: string; chatId: string }[]>;
  offerDismissals(userId: string): Promise<string[]>;
  dismissOffer(userId: string, offerKey: string, at: string): Promise<void>;
}
