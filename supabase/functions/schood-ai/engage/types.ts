import type { LearningEventKind, Locale } from '../types.ts';

// Shapes the engage area stores and reads. The repository (repository.ts for
// Postgres, memory.ts for tests and the dev stack) is the only place they meet
// a database. Everything here is camelCase; routes turn it into snake_case JSON.

export type LeaderboardVisibility = 'public' | 'masked' | 'hidden';
export type MessagePreference = 'all' | 'important' | 'none';
export type LevelBand = 'foundation' | 'core' | 'advanced' | 'open';

export interface EngageProfile {
  userId: string;
  /** Set once by the person; null means unknown, and unknown is treated as under 18. */
  birthDate: string | null;
  timeZone: string;
  /** Local hour (8–21) for the day's reminder. */
  notifyHour: number;
  messages: MessagePreference;
  locale: Locale;
  region: string | null;
  school: string | null;
  /** Null means the default for the person's age (hidden under 18, masked otherwise). */
  leaderboard: LeaderboardVisibility | null;
  /** Out of weekly leagues entirely (XP and streaks still count for the person). */
  leagueOptOut: boolean;
  dailyLimitMinutes: number | null;
  limitSetBy: 'self' | 'parent' | null;
  offersMuted: boolean;
  levelBand: LevelBand;
  /** Win-back stage already sent for the current lapse (0 = none). */
  lapseStage: number;
  createdAt: string | null;
}

/** One local day of verified learning, maintained by the ingest step. */
export interface DayRow { day: string; xp: number; minutes: number; events: number }

/** A learning event as engage reads it from ai_learning_events. */
export interface EventRow {
  id: number;
  userId: string;
  workspaceId: string | null;
  area: string;
  kind: LearningEventKind;
  verified: boolean;
  feature: string;
  skill: string | null;
  verifiedMinutes: number;
  score: number | null;
  outcome: string | null;
  ref: string | null;
  source: 'web' | 'telegram' | 'system';
  createdAt: string;
}

export interface XpRow { id: number; userId: string; eventId: number | null; source: 'event' | 'quest' | 'challenge'; sourceKey: string | null; xp: number; day: string; weekStart: string; feature: string | null; createdAt: string }
export interface IngestResult { events: number; awarded: number; capped: number }
export interface FreezeBuy { id: string; userId: string; day: string; weekStart: string; reference: string; credits: number; status: 'pending' | 'paid'; createdAt: string }

export type LeagueTierName = 'bronze' | 'silver' | 'gold' | 'sapphire' | 'diamond';
export interface LeagueGroup { id: string; weekStart: string; tier: LeagueTierName; band: LevelBand; finalizedAt: string | null }
export interface LeagueMember { groupId: string; userId: string; weekStart: string; tier: LeagueTierName; joinedAt: string; xp: number; finalRank: number | null; outcome: 'promoted' | 'stayed' | 'demoted' | null }

export interface JourneyRow {
  id: string;
  userId: string;
  journeyKey: string;
  status: 'active' | 'paused' | 'graduated' | 'left';
  startedOn: string;
  targetDate: string | null;
  /** Completed chapters in order, with the moment each was completed. */
  completed: { chapter: number; at: string }[];
  graduatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GoalRow {
  id: string;
  userId: string;
  goalKey: string;
  status: 'ready' | 'active' | 'done' | 'skipped';
  /** What closed it: a journey graduation, a verified outcome, or the person's own word. */
  doneBy: 'journey' | 'outcome' | 'self' | null;
  outcome: Record<string, unknown>;
  createdAt: string;
  doneAt: string | null;
}

export interface DateRow {
  id: string;
  userId: string;
  kind: 'exam' | 'interview' | 'deadline' | 'presentation' | 'other';
  title: string;
  onDate: string;
  atTime: string | null;
  goalKey: string | null;
  done: boolean;
  result: string | null;
  createdAt: string;
}

export interface SquadRow { id: string; name: string; ownerId: string; inviteCode: string; weeklyGoalMinutes: number; createdAt: string; archivedAt: string | null }
export interface SquadMember { squadId: string; userId: string; role: 'owner' | 'member'; joinedAt: string; leftAt: string | null; referralCode: string | null }

export interface StoryProgress { userId: string; arcKey: string; unlocked: number; lastUnlockedOn: string | null; flags: Record<string, string>; updatedAt: string }
export interface StoryResult { id: string; userId: string; arcKey: string; episodeKey: string; correct: number; total: number; passed: boolean; choice: string | null; createdAt: string }
export interface StoryEpisodeCache { userId: string; arcKey: string; episodeKey: string; content: Record<string, unknown>; credits: number; createdAt: string }

export interface PassportRow { userId: string; displayName: string | null; headline: string | null; updatedAt: string | null }
export type PassportItemKind = 'certificate' | 'result' | 'level' | 'journey' | 'sample';
export interface PassportItem {
  id: string;
  userId: string;
  kind: PassportItemKind;
  /** Where the record lives: engage, coach, hub (English level records), platform (mock certificates), events. */
  source: string;
  sourceRef: string;
  title: string;
  data: Record<string, unknown>;
  verifyUrl: string | null;
  /** True when Schood measured it (a proctored exam, a scored mock, a verified event); false for self-reported. */
  verified: boolean;
  shown: boolean;
  issuedAt: string | null;
  createdAt: string;
}
export interface PassportLink {
  id: string;
  userId: string;
  tokenHash: string;
  label: string;
  /** Item ids the link shows; the link never shows anything else. */
  itemIds: string[];
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  views: number;
  lastViewedAt: string | null;
}

export interface StorageRef { provider: 's3' | 'supabase' | 'memory'; bucket: string; path: string }
export interface SampleRow {
  id: string;
  userId: string;
  kind: 'voice' | 'writing';
  /** engage (recorded here), or the area that recorded it through recordSample (coach, learner). */
  source: string;
  sourceRef: string | null;
  storage: StorageRef | null;
  text: string | null;
  promptKey: string | null;
  feature: string | null;
  scores: Record<string, number>;
  metrics: Record<string, number>;
  durationMs: number | null;
  recordedAt: string;
  deletedAt: string | null;
}

export type SittingStatus = 'started' | 'submitted' | 'passed' | 'failed' | 'voided' | 'expired';
export interface SittingRow {
  id: string;
  userId: string;
  examKey: string;
  status: SittingStatus;
  /** The purchased sitting this uses (unique: one purchase, one sitting). */
  entitlementRef: string;
  startedAt: string;
  deadlineAt: string;
  submittedAt: string | null;
  answers: Record<string, string>;
  responses: Record<string, unknown>;
  autoScore: number | null;
  autoTotal: number | null;
  review: Record<string, unknown> | null;
  integrity: Record<string, number>;
  lastHeartbeatAt: string | null;
  reviewerId: string | null;
  decidedAt: string | null;
  certificateId: string | null;
}
export interface SittingSignal { sittingId: string; stream: string; seq: number; kind: string; at: string }
export interface CertificateRow { id: string; code: string; userId: string; examKey: string; level: string; displayName: string; score: number; issuedAt: string; revokedAt: string | null; sittingId: string | null; /** Issued from a beta tester's test sitting, not a purchase. */ test: boolean }

export interface TalentProfile {
  userId: string;
  /** What employers see instead of an id: random, made at consent. */
  candidateKey: string | null;
  consentVersion: string | null;
  consentedAt: string | null;
  withdrawnAt: string | null;
  headline: string | null;
  skills: string[];
  openTo: string[];
  regions: string[];
  passportLinkId: string | null;
  updatedAt: string | null;
}
export interface TalentEmployer { userId: string; organisation: string; kind: 'employer' | 'university' | 'centre'; grantedBy: string; activeUntil: string | null; createdAt: string }
export interface TalentAudit { employerId: string; action: 'search' | 'view'; query: Record<string, unknown>; targetUserId: string | null; createdAt: string }

export interface EventSponsor { eventKey: string; sponsorName: string; logoUrl: string | null; prize: Partial<Record<Locale, string>>; updatedBy: string; updatedAt: string }

export type OutboxStatus = 'queued' | 'claimed' | 'sent' | 'skipped' | 'expired' | 'failed';
export interface OutboxRow {
  id: string;
  userId: string;
  channel: 'telegram' | 'web';
  kind: string;
  priority: number;
  dedupeKey: string;
  payload: { text: string; buttons: { label: string; path: string }[]; data?: Record<string, unknown> };
  dueAt: string;
  expiresAt: string;
  status: OutboxStatus;
  claimToken: string | null;
  attempts: number;
  reason: string | null;
  createdAt: string;
  sentAt: string | null;
}

export interface EngageSettings { talentPoolEnabled: boolean; updatedBy: string | null; updatedAt: string | null }
export interface BoardRow { userId: string; xp: number }
export interface CentreBoardRow { workspaceId: string; name: string; active: number; xp: number }
